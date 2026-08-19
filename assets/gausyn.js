(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  // scroll reveal
  var items = document.querySelectorAll('[data-reveal]');
  if (reduce || !hasIO) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 6, 3) * 0.08) + 's';
      io.observe(el);
    });
  }

  // scenes: run while on screen, pause off screen (loops resume, not restart)
  var scenes = document.querySelectorAll('[data-scene]');
  if (reduce || !hasIO) {
    scenes.forEach(function (el) { el.classList.add('play'); });
  } else {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle('play', entry.isIntersecting);
      });
    }, { threshold: 0.08 });
    scenes.forEach(function (el) { sio.observe(el); });
  }

  // film: auto-advancing slideshow with prev/next and dots
  var film = document.querySelector('.film');
  if (film) {
    var acts = Array.prototype.slice.call(film.querySelectorAll('.act'));
    var dots = Array.prototype.slice.call(film.querySelectorAll('.film-dot'));
    var DURS = [65, 30, 65, 65, 40, 35]; // seconds per act
    var idx = 0, timer = null, onScreen = true;

    function schedule() {
      clearTimeout(timer);
      if (reduce || !onScreen) return;
      timer = setTimeout(function () { show(idx + 1); }, DURS[idx] * 1000);
    }
    function show(i) {
      idx = ((i % acts.length) + acts.length) % acts.length;
      acts.forEach(function (a, j) { a.classList.toggle('on', j === idx); });
      dots.forEach(function (d, j) { d.classList.toggle('on', j === idx); });
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
          onScreen = entry.isIntersecting;
          if (onScreen) schedule(); else clearTimeout(timer);
        });
      }, { threshold: 0.05 }).observe(film);
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
      var body = v('message') + '\n\n\u2014 ' + v('name') + (v('email') ? ' (' + v('email') + ')' : '');
      window.location.href = 'mailto:gausyninc@gmail.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      var note = document.getElementById('contact-note');
      if (note) {
        note.textContent = 'Your email app should now be open with the message ready to send. If nothing opened, write to gausyninc@gmail.com directly.';
      }
    });
  }
})();
