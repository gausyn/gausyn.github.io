(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  // reveal: things fade in the first time you scroll down to them. Whether they fade at
  // all is the --fade-in switch in gausyn.css; this only decides when each one shows.
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (reduce || !hasIO) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var pending = items.slice(); // not shown yet
    var fading = [];             // shown a moment ago, and maybe still on its way in
    var lastY = window.pageYOffset || 0, goingUp = false, sweeping = false;

    function without(list, els) {
      return list.filter(function (el) { return els.indexOf(el) === -1; });
    }

    // shown at once, with no fade (and any fade under way cut short): it has already
    // been scrolled past, or it is being met on the way back up
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

    function isPassed(rect) { return (rect.width || rect.height) && rect.top < 0; }

    // Everything arriving in the same tick fades in reading order: down the
    // page first, and left to right across anything sharing a row.
    var io = new IntersectionObserver(function (entries) {
      var hits = entries.filter(function (e) { return e.isIntersecting && pending.indexOf(e.target) !== -1; });
      if (!hits.length) return;
      var now = hits.filter(function (e) { return goingUp || isPassed(e.boundingClientRect); });
      settle(now.map(function (e) { return e.target; }));
      hits = hits.filter(function (e) { return now.indexOf(e) === -1; });
      hits.sort(function (a, b) {
        var ra = a.boundingClientRect, rb = b.boundingClientRect;
        if (Math.abs(ra.top - rb.top) > 24) return ra.top - rb.top;
        return ra.left - rb.left;
      });
      hits.forEach(function (entry, n) {
        var el = entry.target, delay = Math.min(n, 10) * 0.07;
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
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });

    // Anything whose top is above the window has been passed, however fast the scroll
    // or jump that passed it: it is simply there, so the way back up is never blank.
    function sweep() {
      sweeping = false;
      settle(pending.concat(fading).filter(function (el) { return isPassed(el.getBoundingClientRect()); }));
    }
    function onScroll() {
      var y = window.pageYOffset || 0;
      if (y < lastY - 1) goingUp = true; else if (y > lastY + 1) goingUp = false;
      lastY = y;
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

  // scenes: each starts from the top the first time it is reached, waits while it is
  // off screen, and picks up where it stopped when you come back. Rewinding on every
  // return left its empty first frame on screen whenever you scrolled back up quickly.
  var scenes = document.querySelectorAll('[data-scene]');
  if (reduce || !hasIO) {
    scenes.forEach(function (el) { el.classList.add('play'); });
  } else {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('play', entry.isIntersecting);
      });
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    scenes.forEach(function (el) { sio.observe(el); });
  }

  // film: auto-advancing slideshow with prev/next and dots
  var film = document.querySelector('.film');
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
    // waits while it is off screen and picks up where it stopped, so the wait for the
    // next act has to as well, or acts would change in the middle of a loop.
    function left() {
      var total = DURS[idx] * 1000;
      var wrap = acts[idx].querySelector('[class*="fade-"]');
      var loops = wrap && wrap.getAnimations ? wrap.getAnimations().filter(function (a) { return a.animationName; }) : [];
      var t = loops.length ? Number(loops[0].currentTime) : NaN;
      return t >= 0 ? total - (t % total) : total;
    }

    function schedule() {
      clearTimeout(timer);
      if (reduce || !onScreen) return;
      timer = setTimeout(function () { show(idx + 1); }, left());
    }
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
