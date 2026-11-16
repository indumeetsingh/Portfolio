// Smooth-scroll for in-page links. Links use data-to="<element id>" instead of
// href="#id" because Carrd intercepts hash links for its own section routing.
(function(){var r=document.getElementById('sx-top');if(!r)return;r.addEventListener('click',function(e){var a=e.target.closest('a[data-to]');if(!a)return;e.preventDefault();e.stopPropagation();var t=document.getElementById(a.getAttribute('data-to'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'});});})();
