/* Shared plumbing for the audit pages. Theme only: these pages are static
   documents, so they need none of the RPC and wallet code in mint.js. No
   build step and no dependencies. */
(function (global) {
  'use strict';

  var Audit = {};

  /* Called from an inline script in <head>, before first paint, so the page
     never flashes the wrong theme. */
  Audit.initTheme = function () {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light' && t !== 'dark') {
        t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = t;
    } catch (e) {}
  };

  Audit.wireThemeToggle = function () {
    var root = document.documentElement;
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.hidden = false;
    function describe() {
      btn.title = 'Switch to ' + (root.dataset.theme === 'dark' ? 'light' : 'dark') + ' mode';
      btn.setAttribute('aria-label', btn.title);
    }
    describe();
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
      describe();
    });
  };

  global.Audit = Audit;
})(this);
