// Smooth-scroll for in-page links, offset for the sticky header.
// Links use data-to="<element id>" instead of href="#id" because Carrd
// intercepts hash links for its own section routing.
(function () {
  var root = document.getElementById('sx-top');
  if (!root) return;
  var hd = document.getElementById('sx-header');

  root.addEventListener('click', function (e) {
    var link = e.target.closest('a[data-to]');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();

    var id = link.getAttribute('data-to');
    var target = document.getElementById(id);
    if (!target) return;
    if (root.sxCloseMenu) root.sxCloseMenu();

    var y = 0;
    if (id !== 'sx-top') {
      var offset = hd ? hd.getBoundingClientRect().height : 0;
      y = target.getBoundingClientRect().top + (window.pageYOffset || 0) - offset - 12;
    }
    try {
      window.scrollTo({ top: y, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, y);
    }
  });
})();
