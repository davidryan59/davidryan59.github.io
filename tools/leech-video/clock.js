/* The video owns the app's clock. render.js adds this script to the page
   before the app's own scripts run.

   The app reads the time from performance.now() and draws on animation
   frames. Here performance.now() returns the video's time, and the app's
   animation frames run only when the stage asks for one, so every frame is
   drawn at an exact time, however long a screenshot takes. */
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

  window.videoClock = {
    // Set the time, in ms, for input that arrives before the next frame.
    set: function (ms) { now = ms; },
    // Run the app's animation frame at a time, in ms.
    frame: function (ms) {
      now = ms;
      var callbacks = waiting;
      waiting = [];
      callbacks.forEach(function (callback) { callback(ms); });
    }
  };
})();
