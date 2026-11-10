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

  // Chapter openers: each chapter opens on a band of whiteboard that holds in the window
  // while scrolling slides the board sideways. The heading writes itself in as the band
  // arrives; then each sketch draws itself, stroke by stroke behind a pen tip, as it comes
  // in from the right, and its words come up beside it. Every piece is placed on one
  // scale, u: scroll pixels since the band began to hold (negative while it arrives).
  var openers = Array.prototype.slice.call(document.querySelectorAll('.op'));
  // a teacher climbing the levels moves on its own: held still until its sketch is done
  // and on screen, and for good with reduced motion
  openers.forEach(function (op) {
    Array.prototype.forEach.call(op.querySelectorAll('.op-art svg'), function (svg) {
      if (svg.querySelector('animateMotion') && svg.pauseAnimations) {
        svg.pauseAnimations();
        try { svg.setCurrentTime(8); } catch (e) {}
      }
    });
  });
  if (openers.length && !reduce) {
    var SVGNS = 'http://www.w3.org/2000/svg';
    var opFrame = 0;
    var opClip = function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : Math.round(x * 1000) / 1000; };
    var opSet = function (o, p) { if (o.p !== p) { o.p = p; o.el.style.setProperty('--ov', p); } };
    var pageTop = function (el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
    // words, one span each, for the heading and for the lines beside the sketches
    var opWords = function (root, skipSvg) {
      var words = [];
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = document.createDocumentFragment();
            n.nodeValue.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
              var w = document.createElement('span');
              w.className = 'op-w';
              w.textContent = part;
              frag.appendChild(w);
              words.push({ el: w, p: -1 });
            });
            n.parentNode.replaceChild(frag, n);
          } else if (n.nodeType === 1 && n.namespaceURI !== SVGNS) {
            walk(n);
          }
        });
      })(root);
      return words;
    };
    // a sketch, in the order it is drawn: a stroke made of several pieces is split so the
    // pieces follow one another; each item takes a share of the way by its length, starts
    // a little before the one ahead of it ends, or keeps a window of its own
    var opSketch = function (svg) {
      Array.prototype.slice.call(svg.querySelectorAll('path.s')).forEach(function (el) {
        var bits = (el.getAttribute('d') || '').match(/M[^M]*/g);
        if (!bits || bits.length < 2) return;
        var total = el.getTotalLength() || 1;
        var w = parseFloat(el.getAttribute('data-w')) || Math.max(0.35, Math.min(2.2, total / 220));
        bits.forEach(function (d, i) {
          var p = el.cloneNode(false);
          p.setAttribute('d', d);
          el.parentNode.insertBefore(p, el);
          p.setAttribute('data-w', Math.max(0.03, w * (p.getTotalLength() || 0) / total).toFixed(3));
          if (i) p.removeAttribute('data-j');
        });
        el.parentNode.removeChild(el);
      });
      var items = [], t = 0, start = 0, end = 0, pinned = [];
      Array.prototype.forEach.call(svg.querySelectorAll('.s, .f, .mv'), function (el) {
        var stroke = el.classList.contains('s');
        var len = stroke && el.getTotalLength ? el.getTotalLength() : 0;
        var item = { el: el, len: len, stroke: stroke, color: '', p: -1 };
        var at = el.getAttribute('data-at');
        if (at) {
          at = at.split(',');
          item.s = +at[0]; item.w = +at[1] - +at[0];
          pinned.push(item);
        } else {
          var w = parseFloat(el.getAttribute('data-w')) || (stroke ? Math.max(0.35, Math.min(2.2, len / 220)) : el.classList.contains('mv') ? 0.9 : 0.5);
          if (!el.hasAttribute('data-j')) start = t;
          t = Math.max(t, start + w * 0.8);
          end = Math.max(end, start + w);
          item.s = start; item.w = w;
        }
        items.push(item);
      });
      items.forEach(function (it) { if (pinned.indexOf(it) === -1) { it.s /= end || 1; it.w /= end || 1; } });
      var nib = document.createElementNS(SVGNS, 'circle');
      nib.setAttribute('class', 'op-nib');
      nib.setAttribute('r', '5.5');
      svg.appendChild(nib);
      var smil = svg.querySelector('animateMotion') && svg.pauseAnimations ? svg : null;
      return { items: items, nib: nib, nibOn: false, smil: smil, run: false };
    };
    var opDraw = function (pc, v) {
      var sk = pc.sketch, tip = null;
      sk.items.forEach(function (it) {
        var p = opClip((v - it.s) / it.w);
        opSet(it, p);
        if (it.stroke && p > 0 && p < 1 && (!tip || it.s >= tip.s)) tip = it;
      });
      if (tip) {
        var pt = tip.el.getPointAtLength(tip.len * tip.p);
        if (!tip.color) tip.color = window.getComputedStyle(tip.el).stroke;
        sk.nib.setAttribute('cx', pt.x.toFixed(1));
        sk.nib.setAttribute('cy', pt.y.toFixed(1));
        sk.nib.style.fill = tip.color;
        if (!sk.nibOn) { sk.nibOn = true; sk.nib.classList.add('on'); }
      } else if (sk.nibOn) {
        sk.nibOn = false;
        sk.nib.classList.remove('on');
      }
      var drawn = v >= 1;
      if (drawn !== pc.drawn) { pc.drawn = drawn; pc.el.classList.toggle('is-drawn', drawn); }
    };
    openers.forEach(function (op) {
      op.gzPin = op.querySelector('.op-pin');
      op.gzBand = op.querySelector('.op-band');
      op.gzTrack = op.querySelector('.op-track');
      op.gzProg = op.querySelector('.op-prog');
      var eb = op.querySelector('.op-eb');
      op.gzEb = eb ? { el: eb, p: -1 } : null;
      op.gzWords = [];
      Array.prototype.forEach.call(op.querySelectorAll('.op-line'), function (line) { op.gzWords = op.gzWords.concat(opWords(line)); });
      var ink = op.querySelector('.op-ink path');
      op.gzInk = ink ? { el: ink, p: -1 } : null;
      op.gzSeq = [];
      Array.prototype.forEach.call(op.gzTrack.children, function (el) {
        if (el.classList.contains('op-head')) return;
        var svg = el.querySelector('svg');
        var say = el.querySelector('.op-say');
        op.gzSeq.push({ el: el, sketch: svg ? opSketch(svg) : null, words: say ? opWords(say) : [], v: -1, p: -1, drawn: false });
      });
    });
    function opUpdate() {
      opFrame = 0;
      var vh = window.innerHeight || 1, y = window.pageYOffset || 0;
      openers.forEach(function (op) {
        var near = op.gzTop < y + vh * 1.5 && op.gzTop + op.gzHeight > y - vh * 0.5;
        if (near !== op.gzNear) { op.gzNear = near; op.classList.toggle('is-near', near); }
        if (!near && op.gzDone) return;
        op.gzDone = !near;
        var u = y - (op.gzTop - op.gzT);
        var go = op.gzTravel > 0 ? Math.max(0, Math.min(1, (u - op.gzHold) / (op.gzTravel * op.gzK))) : 0;
        var tx = Math.round(-op.gzTravel * go * 10) / 10;
        if (tx !== op.gzTx) { op.gzTx = tx; op.gzTrack.style.transform = 'translate3d(' + tx + 'px, 0, 0)'; }
        var pr = op.gzTravel > 0 ? Math.round(go * 1000) / 1000 : opClip(u / op.gzRun);
        if (op.gzProg && pr !== op.gzPr) { op.gzPr = pr; op.gzProg.style.transform = 'scaleX(' + pr + ')'; }
        // the heading, a word at a time as the band arrives, then its pen line
        var hv = opClip((u - op.gzHs) / (op.gzHe - op.gzHs));
        if (hv !== op.gzHv) {
          op.gzHv = hv;
          if (op.gzEb) opSet(op.gzEb, opClip(hv / 0.3));
          var nw = op.gzWords.length, span = nw > 1 ? 0.6 / (nw - 1) : 0;
          op.gzWords.forEach(function (w, i) { opSet(w, opClip((hv - 0.1 - span * i) / 0.3)); });
          if (op.gzInk) opSet(op.gzInk, opClip((hv - 0.84) / 0.16));
        }
        op.gzSeq.forEach(function (pc) {
          var v = opClip((u - pc.us) / (pc.ue - pc.us));
          if (v === pc.v) return;
          pc.v = v;
          pc.el.style.setProperty('--pv', v);
          if (pc.sketch) opDraw(pc, v);
          var nw = pc.words.length;
          if (nw) {
            var cv = opClip((v - 0.04) / 0.56), span = nw > 1 ? 0.7 / (nw - 1) : 0;
            pc.words.forEach(function (w, i) { opSet(w, opClip((cv - span * i) / 0.3)); });
          }
        });
        // the climbing teacher waits for its sketch
        op.gzSeq.forEach(function (pc) {
          var sk = pc.sketch;
          if (sk && sk.smil) {
            var run = !!op.gzNear && pc.drawn;
            if (run !== sk.run) { sk.run = run; if (run) sk.smil.unpauseAnimations(); else sk.smil.pauseAnimations(); }
          }
        });
      });
    }
    function opMeasure() {
      var vh = window.innerHeight || 1;
      openers.forEach(function (op) {
        var vw = op.gzBand.clientWidth || 1;
        var H = op.gzBand.offsetHeight;
        var T = parseFloat(window.getComputedStyle(op.gzPin).top);
        if (isNaN(T)) T = (vh - H) / 2;
        var travel = Math.max(0, op.gzTrack.offsetWidth - vw);
        var k = Math.max(1, Math.min(1.7, 620 / vw));
        var hold = vh * 0.14, run = hold + travel * k + vh * 0.3;
        var h = Math.round(H + run) + 'px';
        if (op.style.height !== h) op.style.height = h;
        op.gzT = T; op.gzTravel = travel; op.gzK = k; op.gzHold = hold; op.gzRun = run;
        op.gzTop = pageTop(op);
        op.gzHeight = op.offsetHeight;
        // the heading comes in while the band rises to its place
        op.gzHs = -(vh - T) * 0.82; op.gzHe = -(vh - T) * 0.04;
        // each piece starts once part of it is in from the right and is done by the time it
        // is centred, or just after the board stops, while the last of it is in full view
        var last = hold + travel * k + vh * 0.1, early = -(vh - T) * 0.5;
        op.gzSeq.forEach(function (pc) {
          var L = pc.el.offsetLeft, W = pc.el.offsetWidth;
          var sx = vw - 0.3 * W, ex = Math.max(vw * 0.05, (vw - W) / 2);
          var us = Math.max(early, hold + (L - sx) * k), ue = Math.min(last, hold + (L - ex) * k);
          if (ue < us + 140) { ue = Math.min(us + 140, last); if (ue < us + 60) us = ue - 140; }
          pc.us = us; pc.ue = ue; pc.v = -1;
        });
        op.gzHv = -1; op.gzDone = false;
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

  // Email links: plenty of computers have no mail app set up, and there a mailto link does
  // nothing at all. So a click on one offers the ways to write: the mail app, a mail site
  // in the browser with the message started, or the address copied (it is never shown).
  var mail = null, mailFrom = null;
  function mailParts(href) {
    var bits = href.replace(/^mailto:/i, '').split('?'), q = {};
    (bits[1] || '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) q[decodeURIComponent(kv.slice(0, i)).toLowerCase()] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return { to: decodeURIComponent(bits[0]), subject: q.subject || '', body: q.body || '' };
  }
  function mailClose() {
    if (!mail || !mail.classList.contains('open')) return;
    mail.classList.remove('open');
    mail.setAttribute('aria-hidden', 'true');
    if (mailFrom) mailFrom.focus();
  }
  function mailOpen(link) {
    var m = mailParts(link.getAttribute('href')), enc = encodeURIComponent;
    if (!mail) {
      mail = document.createElement('div');
      mail.className = 'mail-sheet';
      mail.setAttribute('aria-hidden', 'true');
      mail.innerHTML =
        '<div class="mail-card" role="dialog" aria-modal="true" aria-labelledby="mail-title">' +
          '<p class="mail-title" id="mail-title">Write to us</p>' +
          '<p class="mail-note">Choose how you would like to send it.</p>' +
          '<a class="mail-opt mail-app" href="#">Open your email app</a>' +
          '<a class="mail-opt" data-k="g" href="#" target="_blank" rel="noopener noreferrer">Write in Gmail</a>' +
          '<a class="mail-opt" data-k="o" href="#" target="_blank" rel="noopener noreferrer">Write in Outlook</a>' +
          '<button class="mail-opt mail-copy" type="button">Copy our address</button>' +
          '<button class="mail-x" type="button">Close</button>' +
        '</div>';
      document.body.appendChild(mail);
      mail.addEventListener('click', function (e) {
        if (e.target === mail || e.target.classList.contains('mail-x')) { mailClose(); return; }
        var opt = e.target.closest('.mail-opt');
        if (!opt) return;
        if (opt.classList.contains('mail-copy')) {
          var to = opt.getAttribute('data-to'), done = function () { opt.textContent = 'Copied. Paste it into your email.'; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(to).then(done, function () {});
          else {
            var ta = document.createElement('textarea');
            ta.value = to; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { if (document.execCommand('copy')) done(); } catch (err) {}
            document.body.removeChild(ta);
          }
          return;
        }
        setTimeout(mailClose, 0);
      });
      document.addEventListener('keydown', function (e) {
        if (!mail.classList.contains('open')) return;
        if (e.key === 'Escape') { mailClose(); return; }
        if (e.key === 'Tab') {
          var f = mail.querySelectorAll('.mail-opt, .mail-x'), first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
    }
    mail.querySelector('.mail-app').setAttribute('href', link.getAttribute('href'));
    mail.querySelector('[data-k="g"]').setAttribute('href', 'https://mail.google.com/mail/?view=cm&fs=1&to=' + enc(m.to) + (m.subject ? '&su=' + enc(m.subject) : '') + (m.body ? '&body=' + enc(m.body) : ''));
    mail.querySelector('[data-k="o"]').setAttribute('href', 'https://outlook.live.com/mail/0/deeplink/compose?to=' + enc(m.to) + (m.subject ? '&subject=' + enc(m.subject) : '') + (m.body ? '&body=' + enc(m.body) : ''));
    var copy = mail.querySelector('.mail-copy');
    copy.setAttribute('data-to', m.to);
    copy.textContent = 'Copy our address';
    mailFrom = link;
    mail.setAttribute('aria-hidden', 'false');
    mail.classList.add('open');
    mail.querySelector('.mail-app').focus();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="mailto:"]') : null;
    if (!a || (mail && mail.contains(a)) || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    mailOpen(a);
  });

})();
