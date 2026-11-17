// Scroll reveals + count-up stats. Adds .js to the root so motion.css can
// hide elements before they are revealed; without JS everything stays visible.
(function () {
  var root = document.getElementById('sx-top');
  if (!root) return;
  root.classList.add('js');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  // --- reveal on scroll (the hero has its own entrance animation in motion.css) ---
  var SEL = '.strip,.sec2>.lab,.sec2>.top,.sec2>h2,.cell,.case,ol li,.about>img,.about>div,.faq details,.ct>.lab,.ct>h2,.ct>.lead,.ct>.row,.ct>.soc';
  var STAGGER = ['grid', 'about', 'faq'];
  var els = root.querySelectorAll(SEL);
  var i, el;
  for (i = 0; i < els.length; i++) {
    el = els[i];
    el.classList.add('rv');
    var p = el.parentNode;
    var stag = p.tagName === 'OL';
    for (var j = 0; j < STAGGER.length && !stag; j++) stag = p.classList.contains(STAGGER[j]);
    if (stag) {
      var idx = Array.prototype.indexOf.call(p.children, el);
      el.style.transitionDelay = Math.min(idx * 70, 420) + 'ms';
    }
  }

  function done(e) {
    if (e.propertyName !== 'opacity') return;
    var t = e.currentTarget;
    t.removeEventListener('transitionend', done);
    t.classList.remove('rv');
    t.classList.remove('in');
    t.style.transitionDelay = '';
  }

  var io = new IntersectionObserver(function (entries) {
    for (var k = 0; k < entries.length; k++) {
      if (!entries[k].isIntersecting) continue;
      var t = entries[k].target;
      io.unobserve(t);
      t.addEventListener('transitionend', done);
      t.classList.add('in');
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  for (i = 0; i < els.length; i++) io.observe(els[i]);

  // --- count-up numbers ---
  function countUp(node) {
    var end = parseInt(node.getAttribute('data-count'), 10) || 0;
    var t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / 1200, 1);
      p = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(end * p);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var nums = root.querySelectorAll('[data-count]');
  var io2 = new IntersectionObserver(function (entries) {
    for (var k = 0; k < entries.length; k++) {
      if (!entries[k].isIntersecting) continue;
      io2.unobserve(entries[k].target);
      countUp(entries[k].target);
    }
  }, { threshold: 0.5 });
  for (i = 0; i < nums.length; i++) io2.observe(nums[i]);
})();
