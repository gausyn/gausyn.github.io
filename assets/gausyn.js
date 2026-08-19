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
