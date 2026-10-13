/* The video owns the app's clock. render.js adds this script to the page
   before the app's own scripts run.

   The app reads the time from performance.now() and draws on animation
   frames. Here performance.now() returns the video's time, and the app's
   animation frames run only when the stage asks for one, so every frame is
   drawn at an exact time, however long a screenshot takes.

   The map builds its tiles in workers and waits on short timers, both on
   real time. The clock counts the timers still pending, so the stage can
   wait for them, and for the workers, before each screenshot. It leaves
   out the address bar's timer, below.

   Math.random() is seeded, and the stage seeds it again before each dice
   click, so every render rolls the same colours. */
(function () {
  'use strict';

  var now = 0;
  var waiting = [];

  performance.now = function () { return now; };
  window.requestAnimationFrame = function (callback) {
    waiting.push(callback);
    return waiting.length;
  };
  window.cancelAnimationFrame = function () {};

  var pending = new Set();
  var realSetTimeout = window.setTimeout, realClearTimeout = window.clearTimeout;
  window.setTimeout = function (callback, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    var id = realSetTimeout(function () {
      pending.delete(id);
      if (typeof callback === 'function') callback.apply(null, args);
    }, ms);
    // The map writes the address bar 300 ms after each change, and re-arms
    // that timer on every draw. The video never shows the address bar, so
    // the stage does not wait for it.
    if (ms !== 300) pending.add(id);
    return id;
  };
  window.clearTimeout = function (id) {
    pending.delete(id);
    realClearTimeout(id);
  };

  // mulberry32: the same generator the storyboard's stills used.
  function seeded(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  Math.random = seeded(20261012);

  window.videoClock = {
    // Set the time, in ms, for input that arrives before the next frame.
    set: function (ms) { now = ms; },
    // Run the app's animation frame at a time, in ms.
    frame: function (ms) {
      now = ms;
      var callbacks = waiting;
      waiting = [];
      callbacks.forEach(function (callback) { callback(ms); });
    },
    timers: function () { return pending.size; },
    seed: function (s) { Math.random = seeded(s); }
  };
})();
