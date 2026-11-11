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

  // Headings, and the paragraph under a product page's opening. A heading's second sentence
  // takes the warm ink and an .ink phrase gets a pen line under it. Section headings are
  // simply there; only that opening paragraph (and anything marked data-fill) writes itself
  // in as you scroll, each word filling in from a faint trace on its way to the middle of
  // the view. Browsers without scroll-linked animation, and reduced motion, show it whole.
  var canFill = !reduce && window.CSS && CSS.supports && CSS.supports('animation-timeline: view()');
  if (document.body.classList.contains('has-film-hero')) {
    Array.prototype.forEach.call(document.querySelectorAll('.scene-head h2, .hero-intro .lede, [data-fill]'), function (el) {
      var fill = canFill && !el.closest('.scene-head');
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
      Array.prototype.forEach.call(el.querySelectorAll('.ink'), function (ink) {
        ink.insertAdjacentHTML('beforeend', '<svg class="ink-mark" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3,9 C38,4 76,12 116,7 S170,3 197,8"/></svg>');
      });
      if (!fill) return;
      words.forEach(function (w, i) {
        var a = 4 + 34 * i / Math.max(words.length, 1);
        w.style.setProperty('--a', a.toFixed(1) + '%');
        w.style.setProperty('--b', (a + 12).toFixed(1) + '%');
      });
      el.classList.add('wf');
    });
  }

  // Chapter openers: each chapter opens on a band of whiteboard that holds in the window
  // while scrolling moves the board from one drawing to the next. The heading stands as
  // written; then the board slides to each drawing in turn and stands while
  // it plays, its words coming up beside it, before sliding on. Everything is placed on one
  // scale, u: scroll pixels since the band began to hold, followed through a short ease so
  // a mouse wheel's steps never show as jumps.
  var openers = Array.prototype.slice.call(document.querySelectorAll('.op'));
  var opPrint = window.matchMedia ? window.matchMedia('print') : null;
  if (openers.length && !reduce && !(opPrint && opPrint.matches)) {
    var SVGNS = 'http://www.w3.org/2000/svg';
    // A drawing's moving parts. Each element that moves carries data-k, a list of tracks
    // separated by ";": a letter, the stretch of the drawing's own progress (0 to 1) it
    // plays over, then optional from and to values, an easing, or "#id" of a path to follow.
    //   d draw a line   o fade   s pop (scale)   S stretch across   V stretch up
    //   x, y move from an offset   r turn   w, h open a clip   p follow a path   n count
    // Several tracks of one letter play one after another. The markup holds the finished
    // picture, which is what shows without the script.
    var zEase = {
      l: function (x) { return x; },
      i: function (x) { return x * x * x; },
      o: function (x) { x = 1 - x; return 1 - x * x * x; },
      io: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
      s: function (x) { return 0.5 - Math.cos(Math.PI * x) / 2; },
      b: function (x) { var c = 1.9, d = c + 1; x -= 1; return 1 + d * x * x * x + c * x * x; },
      B: function (x) {
        var n = 7.5625, d = 2.75;
        if (x < 1 / d) return n * x * x;
        if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75; }
        if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375; }
        x -= 2.625 / d; return n * x * x + 0.984375;
      }
    };
    var zDef = { d: [0, 1, 's'], o: [0, 1, 'o'], s: [0, 1, 'b'], S: [0, 1, 'io'], V: [0, 1, 'o'], x: [0, 0, 'io'], y: [0, 0, 'io'], r: [0, 0, 'io'], w: [0, 1, 'io'], h: [0, 1, 'io'], p: [0, 1, 'io'], n: [0, 1, 'l'] };
    var zParse = function (str) {
      var tr = {};
      str.split(';').forEach(function (s) {
        s = s.trim();
        if (!s || !zDef[s.charAt(0)]) return;
        var type = s.charAt(0), bits = s.slice(1).split(','), nums = [], ease = null, ref = null;
        for (var i = 2; i < bits.length; i++) {
          var q = bits[i].trim();
          if (q.charAt(0) === '#') ref = q.slice(1);
          else if (q !== '' && !isNaN(+q)) nums.push(+q);
          else if (q) ease = q;
        }
        var d = zDef[type];
        (tr[type] = tr[type] || []).push({ a: +bits[0], b: +bits[1], f: nums.length ? nums[0] : d[0], t: nums.length > 1 ? nums[1] : d[1], e: zEase[ease || d[2]] || zEase.io, ref: ref });
      });
      Object.keys(tr).forEach(function (k) { tr[k].sort(function (p, q) { return p.a - q.a; }); });
      return tr;
    };
    var zVal = function (list, t) {
      var v = list[0].f;
      for (var i = 0; i < list.length; i++) {
        var k = list[i];
        if (t < k.a) break;
        v = t >= k.b ? k.t : k.f + (k.t - k.f) * k.e((t - k.a) / ((k.b - k.a) || 1));
      }
      return v;
    };
    var zItem = function (el) {
      var tr = zParse(el.getAttribute('data-k') || '');
      var it = { el: el, tr: tr, last: {}, moves: !!(tr.x || tr.y || tr.s || tr.S || tr.V || tr.r || tr.p) };
      if (tr.w) it.fw = parseFloat(el.getAttribute('width')) || 0;
      if (tr.h) it.fh = parseFloat(el.getAttribute('height')) || 0;
      if (tr.p) {
        var guide = el.ownerSVGElement && el.ownerSVGElement.getElementById ? el.ownerSVGElement.getElementById(tr.p[0].ref) : null;
        if (guide && guide.getTotalLength) { it.guide = guide; it.glen = guide.getTotalLength(); it.g0 = guide.getPointAtLength(0); }
      }
      return it;
    };
    var zApply = function (it, t) {
      var tr = it.tr, el = it.el, L = it.last;
      if (tr.d || tr.o) {
        var op = 1;
        if (tr.d) {
          var dv = zVal(tr.d, t), off = (1 - dv).toFixed(4);
          if (L.d !== off) { L.d = off; el.style.strokeDashoffset = off; }
          if (dv <= 0.0005) op = 0;
        }
        if (tr.o) op *= zVal(tr.o, t);
        op = Math.round(Math.max(0, Math.min(1, op)) * 1000) / 1000;
        if (L.o !== op) { L.o = op; el.style.opacity = op; }
      }
      if (it.moves) {
        var x = tr.x ? zVal(tr.x, t) : 0, y = tr.y ? zVal(tr.y, t) : 0;
        if (it.guide) {
          var pt = it.guide.getPointAtLength(it.glen * Math.max(0, Math.min(1, zVal(tr.p, t))));
          x += pt.x - it.g0.x; y += pt.y - it.g0.y;
        }
        var s = tr.s ? zVal(tr.s, t) : 1, sx = s * (tr.S ? zVal(tr.S, t) : 1), sy = s * (tr.V ? zVal(tr.V, t) : 1), r = tr.r ? zVal(tr.r, t) : 0;
        var tf = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)' + (r ? ' rotate(' + r.toFixed(2) + 'deg)' : '') +
          (sx !== 1 || sy !== 1 ? ' scale(' + Math.max(sx, 0.001).toFixed(4) + ',' + Math.max(sy, 0.001).toFixed(4) + ')' : '');
        if (L.tf !== tf) { L.tf = tf; el.style.transform = tf; }
        var vis = Math.abs(sx * sy) < 0.003 ? 'hidden' : '';
        if (L.vis !== vis) { L.vis = vis; el.style.visibility = vis; }
      }
      if (tr.w) { var w = (it.fw * Math.max(0, zVal(tr.w, t))).toFixed(2); if (L.w !== w) { L.w = w; el.setAttribute('width', w); } }
      if (tr.h) { var h = (it.fh * Math.max(0, zVal(tr.h, t))).toFixed(2); if (L.h !== h) { L.h = h; el.setAttribute('height', h); } }
      if (tr.n) { var n = String(Math.round(zVal(tr.n, t))); if (L.n !== n) { L.n = n; el.textContent = n; } }
    };
    var opClip = function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : x; };
    var opSet = function (o, p) { p = Math.round(p * 1000) / 1000; if (o.p !== p) { o.p = p; o.el.style.setProperty('--ov', p); } };
    var pageTop = function (el) { var y = 0; for (var n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
    // words, one span each, for the lines beside the drawings
    var opWords = function (root) {
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
    var opScene = function (root) { return Array.prototype.map.call(root.querySelectorAll('[data-k]'), zItem); };
    var opPlay = function (piece, t) {
      if (t === piece.t) return false;
      piece.t = t;
      piece.items.forEach(function (it) { zApply(it, t); });
      return true;
    };
    openers.forEach(function (op) {
      op.zPin = op.querySelector('.op-pin');
      op.zBand = op.querySelector('.op-band');
      op.zTrack = op.querySelector('.op-track');
      op.zProg = op.querySelector('.op-prog');
      op.zParts = Array.prototype.map.call(op.querySelectorAll('.op-part'), function (el) {
        var say = el.querySelector('.op-say');
        return { el: el, items: opScene(el.querySelector('.op-art') || el), words: say ? opWords(say) : [], t: -1, on: false, done: false };
      });
    });
    var opRender = function (op, u) {
      // the board: standing, or sliding from one drawing to the next
      var x = 0, m = op.zMoves;
      for (var i = 0; i < m.length; i++) {
        var s = m[i];
        if (u < s.a) break;
        x = u >= s.b ? s.t : s.f + (s.t - s.f) * zEase.io((u - s.a) / (s.b - s.a));
      }
      x = Math.round(x * 10) / 10;
      if (x !== op.zX) { op.zX = x; op.zTrack.style.transform = 'translate3d(' + x + 'px, 0, 0)'; }
      var pr = Math.round(opClip(u / op.zEndU) * 1000) / 1000;
      if (op.zProg && pr !== op.zPr) { op.zPr = pr; op.zProg.style.transform = 'scaleX(' + pr + ')'; }
      // each drawing, and its words
      op.zParts.forEach(function (pc) {
        var t = opClip((u - pc.ua) / (pc.ub - pc.ua));
        if (!opPlay(pc, t)) return;
        pc.el.style.setProperty('--pv', Math.round(opClip(t / 0.25) * 1000) / 1000);
        var nw = pc.words.length;
        if (nw) {
          var cv = opClip((t - 0.02) / 0.42), sp = nw > 1 ? 0.6 / (nw - 1) : 0;
          pc.words.forEach(function (w, i) { opSet(w, opClip((cv - sp * i) / 0.4)); });
        }
        var on = t > 0, done = t >= 1;
        if (on !== pc.on) { pc.on = on; pc.el.classList.toggle('is-on', on); }
        if (done !== pc.done) { pc.done = done; pc.el.classList.toggle('is-done', done); }
      });
    };
    // follow the scroll through a short ease; far-off bands just jump to where they belong
    var opRaf = 0, opLast = 0;
    var opTick = function (now) {
      opRaf = 0;
      var dt = opLast ? Math.min(0.064, Math.max(0.001, (now - opLast) / 1000)) : 0.016;
      opLast = now;
      var vh = window.innerHeight || 1, y = window.pageYOffset || 0, busy = false;
      openers.forEach(function (op) {
        var near = op.zTop < y + vh * 1.6 && op.zTop + op.zHeight > y - vh * 0.6;
        if (near !== op.zNear) { op.zNear = near; op.classList.toggle('is-near', near); }
        var goal = y - (op.zTop - op.zT), u = op.zU;
        if (!near || u == null || Math.abs(goal - u) > vh * 2) u = goal;
        else {
          u += (goal - u) * (1 - Math.exp(-dt / 0.085));
          if (Math.abs(goal - u) < 0.4) u = goal;
        }
        if (u !== goal) busy = true;
        op.zU = u;
        var cu = Math.max(-40, Math.min(op.zRun + 40, u));
        if (cu !== op.zCu) { op.zCu = cu; opRender(op, cu); }
      });
      if (busy) opRaf = requestAnimationFrame(opTick); else opLast = 0;
    };
    var opKick = function () { if (!opRaf) opRaf = requestAnimationFrame(opTick); };
    var opMeasure = function () {
      var vh = window.innerHeight || 1;
      openers.forEach(function (op) {
        var vw = op.zBand.clientWidth || 1, H = op.zBand.offsetHeight;
        var T = parseFloat(window.getComputedStyle(op.zPin).top);
        if (isNaN(T)) T = (vh - H) / 2;
        var travel = Math.max(0, op.zTrack.offsetWidth - vw);
        var mid = function (el) { return Math.max(-travel, Math.min(0, Math.round(vw / 2 - el.offsetLeft - el.offsetWidth / 2))); };
        // the heading stands a moment; then for each drawing: slide to it, stand while it plays
        var HEAD = vh * 0.22, SLIDE = vh * 0.45, PLAY = vh * 0.7, REST = vh * 0.05;
        var u = HEAD, x = 0, moves = [];
        op.zParts.forEach(function (pc) {
          var nx = mid(pc.el), dist = Math.abs(nx - x);
          var sl = dist < 2 ? 0 : SLIDE * Math.max(0.5, Math.min(1.2, dist / (vw * 0.75)));
          if (sl) moves.push({ a: u, b: u + sl, f: x, t: nx });
          pc.ua = u + sl * 0.55; pc.ub = u + sl + PLAY;
          u = pc.ub + REST; x = nx;
        });
        op.zEndU = u;
        var run = u + vh * 0.16;
        var h = Math.round(H + run) + 'px';
        if (op.style.height !== h) op.style.height = h;
        op.zMoves = moves; op.zRun = run; op.zT = T;
        op.zTop = pageTop(op);
        op.zHeight = op.offsetHeight;
        op.zCu = null; op.zX = null; op.zPr = null; op.zU = null;
        op.zParts.forEach(function (pc) { pc.t = -1; });
      });
      opLast = 0;
      opTick(window.performance && performance.now ? performance.now() : 0);
    };
    var opFinish = function () {
      openers.forEach(function (op) {
        op.zParts.forEach(function (pc) { opPlay(pc, 1); });
        op.zCu = null;
      });
    };
    window.addEventListener('beforeprint', opFinish);
    window.addEventListener('afterprint', function () { requestAnimationFrame(opMeasure); });
    openers.forEach(function (op) { op.classList.add('is-live'); });
    opMeasure();
    window.addEventListener('scroll', opKick, { passive: true });
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
  // in the browser with the message started, or the address copied.
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
