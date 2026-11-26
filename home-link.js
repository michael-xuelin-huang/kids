// Adds a small "Home" button to the top-left corner of a game page, linking back to the
// kids home page (index.html next to this file). Include it in any page with:
//   <script src="<relative path to repo root>/home-link.js" defer></script>
(function () {
  var me = document.currentScript || document.querySelector('script[src$="home-link.js"]');
  if (!me || document.getElementById('kids-home-link')) return;
  var home = new URL('./', me.src).href; // the repo root, where the home page lives

  var css = document.createElement('style');
  css.textContent =
    '#kids-home-link{position:fixed;top:8px;left:8px;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;' +
    'padding:6px 14px 6px 10px;border-radius:999px;background:rgba(255,255,255,.92);color:#00838f;' +
    "font:bold 15px/1.2 'Fredoka','Comic Sans MS','Chalkboard SE',system-ui,sans-serif;text-decoration:none;" +
    'border:2px solid #b2ebf2;box-shadow:0 3px 10px rgba(0,0,0,.15);-webkit-tap-highlight-color:transparent}' +
    '#kids-home-link:hover,#kids-home-link:focus-visible{border-color:#00bcd4;background:#fff;outline:none}' +
    '#kids-home-link span{font-size:18px;line-height:1}' +
    '@media print{#kids-home-link{display:none}}';
  document.head.appendChild(css);

  var a = document.createElement('a');
  a.id = 'kids-home-link';
  a.href = home;
  a.title = 'Back to all games';
  a.setAttribute('aria-label', 'Back to all games');
  a.innerHTML = '<span aria-hidden="true">🏠</span>All games';
  document.body.appendChild(a);

  // Make room so the button never covers the top of the game.
  var pad = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  document.body.style.paddingTop = Math.max(pad, 0) + 46 + 'px';
})();
