// Header behaviour: announcement dismiss, mobile menu, stuck state,
// and a position:fixed fallback if a Carrd wrapper defeats position:sticky.
(function () {
  var root = document.getElementById('sx-top');
  var hd = document.getElementById('sx-header');
  var ann = document.getElementById('sx-ann');
  if (!root || !hd) return;

  // --- announcement bar (dismissal remembered per visitor) ---
  var KEY = 'sx-ann-dismissed';
  try { if (ann && localStorage.getItem(KEY)) ann.classList.add('is-hidden'); } catch (e) {}
  var x = ann && ann.querySelector('.ann-x');
  if (x) x.addEventListener('click', function () {
    ann.classList.add('is-hidden');
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    update();
  });

  // --- mobile menu ---
  var burger = hd.querySelector('.burger');
  function closeMenu() {
    hd.classList.remove('is-open');
    if (burger) burger.setAttribute('aria-expanded', 'false');
  }
  if (burger) burger.addEventListener('click', function () {
    var open = hd.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  hd.addEventListener('click', function (e) { if (e.target.closest('.nav a')) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  root.sxCloseMenu = closeMenu;

  // --- stuck state + fixed fallback ---
  var fixed = false, spacer = null, ticking = false;

  function annHeight() {
    return ann && !ann.classList.contains('is-hidden') ? ann.offsetHeight : 0;
  }

  function update() {
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var top = annHeight();
    if (!fixed && y > top + 40 && hd.getBoundingClientRect().top < -2) {
      fixed = true;
      spacer = document.createElement('div');
      hd.parentNode.insertBefore(spacer, hd);
      hd.classList.add('is-fixed');
    }
    if (fixed) {
      var r = root.getBoundingClientRect();
      spacer.style.height = hd.offsetHeight + 'px';
      hd.style.left = r.left + 'px';
      hd.style.width = r.width + 'px';
      hd.style.top = Math.max(0, top - y) + 'px';
    }
    hd.classList.toggle('is-stuck', y > top + 4);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
})();
