(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var now = function () { return window.performance && performance.now ? performance.now() : Date.now(); };

  // How the page is moving, shared by the fade-in and the demos: which way, how quickly
  // (px per ms), and whether fast: about a screen and a half a second or more, as in a
  // fling, a drag of the scroll bar or a jump. Speed is taken over the last ~150ms, so a
  // single notch of a mouse wheel reads as the unhurried scroll it is.
  var FAST = 1.2;
  var motion = { y: window.pageYOffset || 0, up: false, fast: false, v: 0 };
  var trail = [], calm = null;
  function track() {
    var y = window.pageYOffset || 0, t = now();
    if (y !== motion.y) motion.up = y < motion.y;
    trail.push({ t: t, y: y });
    while (trail.length > 1 && t - trail[0].t > 150) trail.shift();
    var span = t - trail[0].t, dy = Math.abs(y - motion.y);
    var prev = trail.length > 1 ? trail[trail.length - 2] : null;
    var inst = prev ? dy / Math.max(t - prev.t, 8) : 0;
    // With under 40ms of history: one frame moving 120px or more is fast (a fling, a jump,
    // a drag of the bar; reading never moves that far in a frame), and so is a second
    // frame moving faster than one wheel notch ever does (about 2px per ms at its peak).
    if (span >= 40) motion.v = Math.abs(y - trail[0].y) / span;
    else if (dy >= 120) motion.v = dy / 16;
    else motion.v = inst > FAST * 2 ? inst : 0;
    motion.fast = motion.v > FAST || (motion.fast && motion.v > FAST / 2);
    motion.y = y;
    clearTimeout(calm);
    calm = setTimeout(function () { motion.fast = false; motion.v = 0; trail = []; }, 180);
  }
  window.addEventListener('scroll', track, { passive: true });

  // reveal: things fade in as you scroll down to them. Whether they fade at all is the
  // --fade-in switch in gausyn.css; this only decides when each one shows, and how.
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (reduce || !hasIO) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var pending = items.slice(); // not shown yet
    var fading = [];             // shown a moment ago, and maybe still on its way in
    var sweeping = false;

    function without(list, els) {
      return list.filter(function (el) { return els.indexOf(el) === -1; });
    }

    // shown at once, with no fade (and any fade under way cut short)
    function settle(els) {
      if (!els.length) return;
      els.forEach(function (el) {
        el.style.transition = 'none';
        el.style.transitionDelay = '';
        el.classList.add('in');
        io.unobserve(el);
      });
      void document.documentElement.offsetWidth; // commit the jump before the transition comes back
      els.forEach(function (el) { el.style.transition = ''; });
      pending = without(pending, els);
      fading = without(fading, els);
    }

    // A fade only reads when there is time to watch it, so only an unhurried scroll down
    // gets one. Shown at once instead: anything already scrolled past, anything met on
    // the way back up, and, while the page moves fast, anything on screen or about to be
    // (looking further ahead the faster it goes).
    function atOnce(r) {
      if (!r.width && !r.height) return false; // not laid out (a hidden film act, say)
      if (r.top < 0) return true;
      var vh = window.innerHeight;
      if (motion.up) return r.top < vh;
      return motion.fast && r.top < vh + Math.max(vh * 0.6, motion.v * 300);
    }

    // Everything arriving in the same tick fades in reading order: down the
    // page first, and left to right across anything sharing a row.
    var io = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting && pending.indexOf(e.target) !== -1; });
      if (!hits.length) return;
      var quick = hits.filter(function (e) { return atOnce(e.boundingClientRect); });
      settle(quick.map(function (e) { return e.target; }));
      hits = hits.filter(function (e) { return quick.indexOf(e) === -1; });
      hits.sort(function (a, b) {
        var ra = a.boundingClientRect, rb = b.boundingClientRect;
        if (Math.abs(ra.top - rb.top) > 24) return ra.top - rb.top;
        return ra.left - rb.left;
      });
      hits.forEach(function (entry, n) {
        var el = entry.target, delay = Math.min(n, 5) * 0.05;
        el.style.transitionDelay = delay + 's';
        el.classList.add('in');
        io.unobserve(el);
        fading.push(el);
        // once it has arrived, its own hover transitions should not wait on the stagger
        setTimeout(function () {
          if (fading.indexOf(el) === -1) return;
          el.style.transitionDelay = '';
          fading = without(fading, [el]);
        }, delay * 1000 + 700);
      });
      pending = without(pending, hits.map(function (e) { return e.target; }));
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    items.forEach(function (el) { io.observe(el); });

    // every frame the page moves, catch up anything the observer has not reached yet
    function sweep() {
      sweeping = false;
      settle(pending.concat(fading).filter(function (el) { return atOnce(el.getBoundingClientRect()); }));
    }
    function onScroll() {
      if (!sweeping && (pending.length || fading.length)) { sweeping = true; requestAnimationFrame(sweep); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('load', onScroll); // a reload that lands mid-page
    onScroll();
  }

  // rewind every animation inside a subtree, then let it run again from frame 0
  function restart(el) {
    if (!el) return;
    el.classList.add('restart');
    void el.offsetWidth; // forced reflow: the browser drops the old timelines here
    el.classList.remove('restart');
  }

  // Demos: each loops, and waits while it is off screen (gausyn.css pauses it). It is
  // never met on an empty frame: off screen it waits on its full frame, just before the
  // loop fades out, so a fling or a scroll back up always lands on a finished picture.
  // Reading your way down to one at an ordinary pace, it starts its story from the top
  // instead, out of sight, just before it scrolls into view.
  var OPEN = 3000; // ms: the first seconds of a demo are still mostly empty

  function loopAnim(wrap) {
    if (!wrap || !wrap.getAnimations) return null;
    return wrap.getAnimations().filter(function (a) { return a.animationName && a.animationName.indexOf('fade-') === 0; })[0] || null;
  }
  // the loop a demo runs on: its length, and its full frame just before it fades out
  function loopOf(stage) {
    if (stage.gzLoop) return stage.gzLoop;
    var wrap = stage.querySelector('[class*="fade-"]'), a = loopAnim(wrap);
    if (!a) return null;
    var D = a.effect.getComputedTiming().duration, at = 0.9;
    try {
      var kf = a.effect.getKeyframes();
      for (var i = 0; i + 1 < kf.length; i++) {
        if (parseFloat(kf[i].opacity) >= 1 && parseFloat(kf[i + 1].opacity) < 1) at = kf[i].computedOffset;
      }
    } catch (e) { /* keep 0.9 */ }
    return (stage.gzLoop = { wrap: wrap, D: D, full: Math.max(0, at * D - 400) });
  }
  function where(stage) { // ms into its loop, or null
    var L = loopOf(stage), a = L && loopAnim(L.wrap);
    return a && a.currentTime != null ? Number(a.currentTime) % L.D : null;
  }
  function seek(stage, t) { // every part of one demo moves together
    var L = loopOf(stage);
    if (!L || !stage.getAnimations) return;
    stage.getAnimations({ subtree: true }).forEach(function (a) {
      if (a.animationName && Math.abs(a.effect.getComputedTiming().duration - L.D) < 1) a.currentTime = t;
    });
  }
  function emptyAt(stage, t) { return t < OPEN || t > loopOf(stage).full; }
  function stagesIn(section) {
    return Array.prototype.slice.call(section.querySelectorAll('.stage')).filter(function (st) {
      var act = st.closest ? st.closest('.act') : null;
      return !act || act.classList.contains('on');
    });
  }
  function arrive(section) {
    var vh = window.innerHeight;
    stagesIn(section).forEach(function (st) {
      var t = where(st);
      if (t == null) return;
      if (st.getBoundingClientRect().top >= vh && !motion.up && !motion.fast) seek(st, 0);
      else seek(st, emptyAt(st, t) ? loopOf(st).full : t);
    });
  }
  function leave(section) {
    stagesIn(section).forEach(function (st) {
      var t = where(st);
      if (t != null && emptyAt(st, t)) seek(st, loopOf(st).full);
    });
  }
  // as the page opens, a demo you can properly see starts its story; one only peeking
  // in at the bottom edge waits on its full frame like any other off screen
  function opening(section) {
    var vh = window.innerHeight;
    stagesIn(section).forEach(function (st) {
      var r = st.getBoundingClientRect(), seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (seen < Math.min(r.height, vh) * 0.4 && where(st) != null) seek(st, loopOf(st).full);
    });
  }
  // While the page moves fast, no demo on screen or about to be is left in its empty
  // opening or its fade-out: it jumps to its full frame (mid-fling, nobody sees the cut)
  // and plays on from there once the page settles.
  var demos = Array.prototype.slice.call(document.querySelectorAll('[data-scene] .stage'));
  function demoSweep() {
    if (!motion.fast || !demos.length) return;
    var vh = window.innerHeight, reach = Math.max(vh * 0.6, motion.v * 300);
    demos.forEach(function (st) {
      var act = st.closest ? st.closest('.act') : null;
      if (act && !act.classList.contains('on')) return;
      var r = st.getBoundingClientRect();
      if (r.bottom < -reach || r.top > vh + reach) return;
      var t = where(st);
      if (t == null || !emptyAt(st, t)) return;
      seek(st, loopOf(st).full);
      if (filmSync && film && film.contains(st)) filmSync();
    });
  }
  if (!reduce && hasIO) {
    var demoQueued = false;
    window.addEventListener('scroll', function () {
      if (demoQueued || !motion.fast) return;
      demoQueued = true;
      requestAnimationFrame(function () { demoQueued = false; demoSweep(); });
    }, { passive: true });
  }

  var film = document.querySelector('.film');
  var filmSync = null; // the film times its next act from the demo's clock; told when that moves
  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  if (reduce || !hasIO) {
    scenes.forEach(function (el) { el.classList.add('play'); });
  } else {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var s = entry.target, first = !s.gzSeen;
        s.gzSeen = true;
        if (entry.isIntersecting) {
          if (first) opening(s); else arrive(s);
          s.classList.add('play');
        } else {
          s.classList.remove('play');
          leave(s);
        }
        if (filmSync && film && s.contains(film)) filmSync();
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    scenes.forEach(function (el) { sio.observe(el); });
  }

  // film: auto-advancing slideshow with prev/next and dots
  if (film) {
    var acts = Array.prototype.slice.call(film.querySelectorAll('.act'));
    var dots = Array.prototype.slice.call(film.querySelectorAll('.film-dot'));
    var DURS = [23, 25, 27, 30, 36, 30]; // one full loop of each act: dashboard, teacher, practice, learning, projects, collaborate
    var idx = 0, timer = null, onScreen = true;

    // the pane takes the height of the act on screen and eases between them:
    // sizing to the tallest act instead left short acts sitting over dead space
    function fit() {
      var h = acts[idx].offsetHeight;
      if (h) film.style.height = h + 'px';
    }

    // How long the act on screen still has to run, read from its own loop clock. The act
    // waits while it is off screen and may be moved to its full frame, so the wait for
    // the next act follows the clock, or acts would change in the middle of a loop.
    function left() {
      var total = DURS[idx] * 1000;
      var a = loopAnim(acts[idx].querySelector('[class*="fade-"]'));
      var t = a ? Number(a.currentTime) : NaN;
      return t >= 0 ? total - (t % total) : total;
    }

    function schedule() {
      clearTimeout(timer);
      if (reduce || !onScreen) return;
      timer = setTimeout(function () { show(idx + 1); }, left());
    }
    filmSync = schedule;
    function show(i) {
      idx = ((i % acts.length) + acts.length) % acts.length;
      acts.forEach(function (a, j) { a.classList.toggle('on', j === idx); });
      dots.forEach(function (d, j) { d.classList.toggle('on', j === idx); });
      fit();
      restart(acts[idx]); // the act you land on always starts at its first beat
      schedule();
    }
    var prev = film.querySelector('.film-nav.prev');
    var next = film.querySelector('.film-nav.next');
    if (prev) prev.addEventListener('click', function () { show(idx - 1); });
    if (next) next.addEventListener('click', function () { show(idx + 1); });
    dots.forEach(function (d, j) { d.addEventListener('click', function () { show(j); }); });

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting === onScreen) return;
          onScreen = entry.isIntersecting;
          if (onScreen) { schedule(); } else { clearTimeout(timer); }
        });
      }, { threshold: 0 }).observe(film);
    }

    // a tab left in the background stops firing timers cleanly: pick the act up again
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(timer); }
      else if (onScreen) { schedule(); }
    });
    window.addEventListener('resize', fit);
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { fit(); });
      acts.forEach(function (a) { ro.observe(a); });
    }
    show(0);
  }

  // contact form: compose an email in the visitor's mail app
  var cf = document.getElementById('contact-form');
  if (cf) {
    cf.addEventListener('submit', function (e) {
      e.preventDefault();
      function v(name) {
        var el = cf.querySelector('[name="' + name + '"]');
        return el ? el.value.trim() : '';
      }
      var subject = '[' + (v('topic') || 'Hello') + '] ' + (v('name') || 'Website message');
      // any field marked data-include leads the email as a labelled line
      var extras = Array.prototype.slice.call(cf.querySelectorAll('[data-include]'))
        .map(function (el) { var t = el.value.trim(); return t ? el.getAttribute('data-include') + ': ' + t : ''; })
        .filter(Boolean);
      var body = (extras.length ? extras.join('\n') + '\n\n' : '') + v('message') +
        '\n\n- ' + v('name') + (v('email') ? ' (' + v('email') + ')' : '');
      window.location.href = 'mailto:gausyninc@gmail.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      var note = document.getElementById('contact-note');
      if (note) {
        note.textContent = 'Your email app should now be open with the message ready to send. If nothing opened, write to gausyninc@gmail.com directly.';
      }
    });
  }
})();
