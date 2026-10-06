/* The video owns the app's clock. render.js adds this script to the page
   before the app's own scripts run.

   The app reads the time from performance.now() and draws on animation
   frames. Here performance.now() returns the video's time, and the app's
   animation frames run only when the stage asks for one, so every frame is
   drawn at an exact time, however long a screenshot takes.

   Each call to performance.now() also moves the clock on by SEARCH_STEP.
   The app's Search runs for 10 ms of clock time on each frame, so on the
   video it tries 10 / SEARCH_STEP pairs of views a frame, about what a
   recent laptop manages. The stage resets the clock before every frame.

   Math.random() is seeded, so the app's search finds the same pairs of
   views on every render. */
(function () {
  'use strict';

  var SEARCH_STEP = 0.13;
  var now = 0;
  var waiting = [];

  performance.now = function () {
    var time = now;
    now += SEARCH_STEP;
    return time;
  };
  window.requestAnimationFrame = function (callback) {
    waiting.push(callback);
    return waiting.length;
  };
  window.cancelAnimationFrame = function () {};

  var seed = 20261006;
  Math.random = function () {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  window.videoClock = {
    // Set the time, in ms, for input that arrives before the next frame.
    set: function (ms) { now = ms; },
    // Run the app's animation frame at a time, in ms.
    frame: function (ms) {
      now = ms;
      var callbacks = waiting;
      waiting = [];
      callbacks.forEach(function (callback) { callback(ms); });
      now = ms;
    }
  };
})();
