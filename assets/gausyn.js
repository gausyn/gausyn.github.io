(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;
  var saveData = navigator.connection && navigator.connection.saveData;
  var now =function () { return window.performance && performance.now ? performance.now() : Date.now(); };

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

  // How fast every demo plays, one number: 1 is as timed in gausyn.css, 2 is twice as fast.
  var PACE = 1.7;

  // Demos. Each is one fixed window telling one story in steps. It waits on its opening
  // frame until the window is properly on screen, plays from the top, and goes back to the
  // opening once it has left the screen, so nobody meets one halfway through or at its end.
  function loopAnim(wrap) {
    if (!wrap || !wrap.getAnimations) return null;
    return wrap.getAnimations().filter(function (a) { return a.animationName && a.animationName.indexOf('fade-') === 0; })[0] || null;
  }
  // the loop a demo runs on, and its length
  function loopOf(stage) {
    if (stage.gzLoop) return stage.gzLoop;
    var wrap = stage.querySelector('[class*="fade-"]'), a = loopAnim(wrap);
    if (!a) return null;
    return (stage.gzLoop = { wrap: wrap, D: a.effect.getComputedTiming().duration });
  }
  function where(stage) { // ms into its loop, or null
    var L = loopOf(stage), a = L && loopAnim(L.wrap);
    return a && a.currentTime != null ? Number(a.currentTime) % L.D : null;
  }
  function seek(stage, t) { // every part of one demo moves together
    var L = loopOf(stage);
    if (!L || !stage.getAnimations) return;
    stage.getAnimations({ subtree: true }).forEach(function (a) {
      if (a.animationName && Math.abs(a.effect.getComputedTiming().duration - L.D) < 1) { a.currentTime = t; a.playbackRate = PACE; }
    });
  }

  // A conversation keeps its place in the window: messages hold their space from the
  // start, and only the pane itself scrolls, once the newest would fall below its edge.
  var FEEDS = '.lx-msgs, .xw-msgs, .co-pane, .side-lines, [data-feed]';
  function follow(stage, jump) {
    Array.prototype.forEach.call(stage.querySelectorAll(FEEDS), function (feed) {
      if (!feed.clientHeight) return;
      var kids = feed.children, top = feed.getBoundingClientRect().top, want = 0;
      for (var i = kids.length - 1; i >= 0; i--) {
        if (!kids[i].offsetHeight || +getComputedStyle(kids[i]).opacity < 0.4) continue;
        want = kids[i].getBoundingClientRect().bottom - top + feed.scrollTop + 14 - feed.clientHeight;
        break;
      }
      want = Math.max(0, Math.round(want));
      if (jump || want < feed.scrollTop - 1) feed.scrollTop = want;
      else if (want > feed.scrollTop + 1) feed.scrollTo({ top: want, behavior: 'smooth' });
    });
  }

  // the numbered steps along the foot of a demo's window: the line shows how far it has got
  function buildSteps(stage) {
    var spec = stage.getAttribute('data-steps');
    if (!spec || !loopOf(stage)) return;
    var rail = document.createElement('div'), bar = document.createElement('i');
    rail.className = 'steps';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', 'Steps in this demo');
    bar.className = 'steps-bar';
    rail.appendChild(bar);
    var list = spec.split('|').map(function (part, n) {
      var b = document.createElement('button'), at = parseFloat(part) * 1000;
      b.type = 'button';
      b.className = 'step';
      b.innerHTML = '<i>' + (n + 1) + '<em> of ' + spec.split('|').length + '</em></i><span></span>';
      b.lastChild.textContent = part.slice(part.indexOf(':') + 1).trim();
      b.addEventListener('click', function () {
        if (!stage.gzPlaying) begin(stage);
        seek(stage, at);
        paint(stage, at);
        follow(stage, true);
      });
      rail.appendChild(b);
      return { at: at, el: b };
    });
    stage.appendChild(rail);
    stage.gzSteps = { bar: bar, list: list, on: -1 };
    paint(stage, 0);
  }
  function paint(stage, t) {
    var rail = stage.gzSteps;
    if (!rail) return;
    rail.bar.style.transform = 'scaleX(' + (t / loopOf(stage).D).toFixed(4) + ')';
    var on = 0;
    rail.list.forEach(function (s, n) { if (t >= s.at) on = n; });
    if (on === rail.on) return;
    rail.on = on;
    rail.list.forEach(function (s, n) {
      s.el.classList.toggle('on', n === on);
      if (n === on) s.el.setAttribute('aria-current', 'step'); else s.el.removeAttribute('aria-current');
    });
  }

  var running = [], lastFollow = 0;
  function tick(now) {
    if (!running.length) { tick.on = false; return; }
    var feeds = now - lastFollow > 240;
    if (feeds) lastFollow = now;
    running.forEach(function (st) {
      var t = where(st);
      if (t != null) paint(st, t);
      if (feeds) follow(st);
    });
    requestAnimationFrame(tick);
  }
  function begin(stage) {
    if (stage.gzPlaying) return;
    stage.gzPlaying = true;
    running.push(stage);
    seek(stage, 0);
    stage.gzScene.classList.add('play');
    if (!tick.on) { tick.on = true; requestAnimationFrame(tick); }
  }
  // a window crossing a breakpoint can rebuild a demo's animations: bring them back in step
  window.addEventListener('resize', function () {
    running.forEach(function (st) { var t = where(st); if (t != null) seek(st, t); });
  });
  function rest(stage) {
    if (!stage.gzPlaying) return;
    stage.gzPlaying = false;
    running.splice(running.indexOf(stage), 1);
    stage.gzScene.classList.remove('play');
    seek(stage, 0);
    paint(stage, 0);
    follow(stage, true);
  }

  var film = document.querySelector('.film');
  var filmSync = null; // the film times its next act from the demo's clock; told when that moves
  var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
  if (reduce || !hasIO) {
    scenes.forEach(function (el) { el.classList.add('play'); });
  } else {
    // properly on screen: the window has reached the middle of the view, however tall it is
    var reached = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) begin(entry.target); });
    }, { rootMargin: '-30% 0px -30% 0px', threshold: 0 });
    var gone = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (!entry.isIntersecting) rest(entry.target); });
    }, { threshold: 0 });
    // anything else that animates simply runs while it is on screen
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('play', entry.isIntersecting);
        if (filmSync && film && entry.target.contains(film)) filmSync();
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    scenes.forEach(function (el) {
      var stage = el.querySelector('.stage');
      if (!stage || (film && el.contains(film))) { sio.observe(el); return; }
      stage.gzScene = el;
      buildSteps(stage);
      reached.observe(stage);
      gone.observe(stage);
    });
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

  // A page's opening: a short silent loop behind the headline (data-film names it), the
  // header sitting on it until you scroll past, and the film, with sound, one click away.
  var hero = document.querySelector('.hero-full');
  if (hero) {
    var heroVideo = hero.querySelector('video'), heroPause = hero.querySelector('.hero-pause');
    var tall = window.matchMedia('(max-aspect-ratio: 3/4)');
    var wantsLoop = !reduce && !saveData, heldByVisitor = false, heroInView = true, filmOpen = false;

    function syncLoop() {
      if (!wantsLoop) return;
      if (heldByVisitor || !heroInView || filmOpen) { heroVideo.pause(); return; }
      var playing = heroVideo.play();
      if (playing && playing.catch) playing.catch(function () { /* the poster stays */ });
    }
    // phones get their own version: the whole screen across the width, over a soft copy of itself
    function chooseLoop() {
      var src = 'assets/film-' + hero.getAttribute('data-film') + (tall.matches ? '-tall' : '') + '.mp4';
      if (heroVideo.getAttribute('src') !== src) { heroVideo.setAttribute('src', src); syncLoop(); }
    }
    if (wantsLoop) {
      heroVideo.muted = true;
      chooseLoop();
      if (tall.addEventListener) tall.addEventListener('change', chooseLoop);
      heroPause.hidden = false;
      heroPause.addEventListener('click', function () {
        heldByVisitor = !heldByVisitor;
        heroPause.classList.toggle('held', heldByVisitor);
        heroPause.setAttribute('aria-label', (heldByVisitor ? 'Play' : 'Pause') + ' the background video');
        syncLoop();
      });
    }

    if (hasIO) {
      new IntersectionObserver(function (entries) {
        heroInView = entries[entries.length - 1].isIntersecting;
        document.body.classList.toggle('past-hero', !heroInView);
        syncLoop();
      }, { rootMargin: '-70px 0px 0px 0px' }).observe(hero);
    } else {
      document.body.classList.add('past-hero');
    }

    // without a dialog the link simply opens the film file
    var filmDialog = document.querySelector('.film-dialog'), heroWatch = hero.querySelector('.hero-watch');
    if (filmDialog && filmDialog.showModal) {
      var filmPlayer = filmDialog.querySelector('video');
      heroWatch.addEventListener('click', function (e) {
        e.preventDefault();
        if (!filmPlayer.getAttribute('src')) filmPlayer.setAttribute('src', heroWatch.getAttribute('href'));
        filmOpen = true;
        syncLoop();
        document.body.classList.add('film-open');
        filmDialog.showModal();
        var playing = filmPlayer.play();
        if (playing && playing.catch) playing.catch(function () { /* the controls are there */ });
      });
      filmDialog.querySelector('.film-close').addEventListener('click', function () { filmDialog.close(); });
      filmDialog.addEventListener('close', function () {
        filmPlayer.pause();
        filmOpen = false;
        document.body.classList.remove('film-open');
        syncLoop();
      });
    }
  }

  // Headings that write themselves in as you scroll. Each word starts as a faint trace and
  // fills in on its way to the middle of the view, a heading's second sentence takes the
  // warm ink, and an .ink phrase gets a pen line drawn under it. Browsers without
  // scroll-linked animation, and reduced motion, simply show the finished heading.
  var canFill = !reduce && window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
  if (canFill && document.body.classList.contains('has-film-hero')) {
    Array.prototype.forEach.call(document.querySelectorAll('.scene-head h2, .hero-intro .lede, [data-fill]'), function (el) {
      var words = [], heading = /^H[1-3]$/.test(el.tagName), second = false;
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = document.createDocumentFragment();
            n.nodeValue.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              var w = document.createElement('span');
              w.className = 'w' + (heading && second ? ' w2' : '');
              w.textContent = part;
              frag.appendChild(w);
              words.push(w);
              if (/[.?!]$/.test(part)) second = true;
            });
            n.parentNode.replaceChild(frag, n);
          } else if (n.nodeType === 1 && n.tagName !== 'svg') {
            walk(n);
          }
        });
      })(el);
      words.forEach(function (w, i) {
        var a = 4 + 34 * i / Math.max(words.length, 1);
        w.style.setProperty('--a', a.toFixed(1) + '%');
        w.style.setProperty('--b', (a + 12).toFixed(1) + '%');
      });
      Array.prototype.forEach.call(el.querySelectorAll('.ink'), function (ink) {
        ink.insertAdjacentHTML('beforeend', '<svg class="ink-mark" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3,9 C38,4 76,12 116,7 S170,3 197,8"/></svg>');
      });
      el.classList.add('wf');
      var head = el.closest('.scene-head');
      if (head) head.classList.add('wf-head');
    });
  }

  // Chapter openers: as one rises up the window its heading wipes in line by line, the
  // dots bloom in from the edges and the rest follows. Each moving piece gets a --v from 0
  // to 1 from where it sits on the page and the styles do the rest. Until this runs, and
  // with reduced motion, every piece simply stands finished.
  var openers = Array.prototype.slice.call(document.querySelectorAll('.op'));
  if (openers.length && !reduce) {
    // each piece starts when its top is this far down the window, and finishes at the second
    var OP_PARTS = [['.op-bg', 1, 0.5], ['.op-dots', 1, 0.15], ['.op-eb', 0.95, 0.74], ['.op-line', 0.94, 0.5], ['.op-lede', 0.97, 0.76], ['.op-item', 0.99, 0.8]];
    var opPieces = [], opFrame = 0;
    function pageTop(el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; }
    function opUpdate() {
      opFrame = 0;
      var vh = window.innerHeight || 1, y = window.pageYOffset || 0;
      openers.forEach(function (op) {
        var near = op.gzTop < y + vh * 2 && op.gzTop + op.gzHeight > y - vh;
        if (near !== op.gzNear) { op.gzNear = near; op.classList.toggle('is-near', near); }
      });
      opPieces.forEach(function (p) {
        var v = (p.a - (p.top - y) / vh) / (p.a - p.b);
        v = v <= 0 ? 0 : v >= 1 ? 1 : Math.round(v * 1000) / 1000;
        if (v !== p.v) { p.v = v; p.el.style.setProperty('--v', v); }
      });
    }
    // where every piece sits, measured from layout so its own movement never counts
    function opMeasure() {
      opPieces = [];
      openers.forEach(function (op) {
        op.gzTop = pageTop(op);
        op.gzHeight = op.offsetHeight;
        OP_PARTS.forEach(function (spec) {
          var row = null, col = 0;
          Array.prototype.forEach.call(op.querySelectorAll(spec[0]), function (el) {
            var top = pageTop(el);
            // pieces side by side on one row follow each other, left to right
            if (top === row) col++; else { row = top; col = 0; }
            opPieces.push({ el: el, top: top, a: spec[1] - 0.04 * col, b: spec[2] - 0.04 * col, v: -1 });
          });
        });
      });
      opUpdate();
    }
    openers.forEach(function (op) { op.classList.add('is-live'); });
    opMeasure();
    window.addEventListener('scroll', function () { if (!opFrame) opFrame = requestAnimationFrame(opUpdate); }, { passive: true });
    window.addEventListener('resize', function () { requestAnimationFrame(opMeasure); });
    window.addEventListener('load', opMeasure);
    if ('ResizeObserver' in window) new ResizeObserver(function () { requestAnimationFrame(opMeasure); }).observe(document.body);
  }

  // the header's menu on small screens
  var menuButton = document.querySelector('.nav-toggle');
  if (menuButton) {
    var siteMenu = document.getElementById('site-menu');
    function setMenu(open) {
      siteMenu.classList.toggle('open', open);
      menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    menuButton.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!siteMenu.classList.contains('open'));
    });
    document.addEventListener('click', function (e) { if (!siteMenu.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

})();
