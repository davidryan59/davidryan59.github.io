/* The Krinkle explorer video's timeline: every pointer move, click, zoom
   glide and caption, in seconds. stage.js draws each frame from it, and
   render.js drives the mouse from it. See storyboard.md.

   Version 4 has no music, so times are plain seconds: the code's "beat" is
   one second. The video loops, starting and ending on the (3, 7, 22') fan
   in Pastel 1 at twice the home zoom, with the pointer resting on the
   zoom-out button. Works in Node and in a browser, as window.KrinkleTimeline. */
(function () {
  'use strict';

  var VERSION = 'v4';
  var BPM = 60, BEATS = 46, FPS = 30;
  var SEC_PER_BEAT = 60 / BPM;
  var FRAMES = Math.round(BEATS * SEC_PER_BEAT * FPS);

  // The page is 1280 × 960 CSS px, filmed whole for a 4:3 video. Points
  // here are page coordinates.
  var PAGE = [1280, 960], CLIP = [0, 0, 1280, 960];

  // The opening view: home zoom times this.
  var START_ZOOM = 2;

  // The pointer rests on this target at the start and the end.
  var REST = 'zoom-out';

  // Zoom glides: from t0 to t1, the zoom runs on a sine curve, in log
  // scale, to this multiple of the opening zoom. The pointer hovers on
  // the zoom buttons meanwhile but never presses them.
  var ZOOMS = [
    [0.25, 2.85, 1 / 6],
    [3.65, 5.75, 1 / 2],
    [42.4, 44.0, 1]
  ];

  // A change of tiling crossfades from the old picture over FADE_CHANGE s,
  // while the zoom glides to the new tiling's home over GLIDE_CHANGE s.
  var FADE_CHANGE = 0.5, GLIDE_CHANGE = 0.8;

  // Pointer moves: from t0 to t1, to a target named in stage.js.
  var MOVES = [
    [3.0, 3.5, 'zoom-in'],
    [6.0, 6.9, 'p-5-16'],
    [8.6, 9.1, 'p-1-4'],
    [10.8, 11.3, 'p-3-4'],
    [13.0, 13.5, 'p-2-9-3'],
    [15.2, 15.7, 'p-9-10'],
    [17.4, 18.3, 'set-values'],
    [18.69, 19.16, 'value-m'],
    [19.34, 19.72, 'value-k'],
    [19.91, 20.28, 'value-t'],
    [20.47, 20.94, 'values-apply'],
    [21.18, 21.94, 'dice'],
    [30.4, 31.1, 'scheme'],
    [40.2, 40.9, 'p-3-7'],
    [41.7, 42.3, 'zoom-in'],
    [44.1, 44.6, 'zoom-out']
  ];

  // Clicks: the button goes down PRESS seconds before and comes up on the
  // time. The name is what the pointer must be on; the stage checks it. A
  // dice click seeds Math.random() first, so every render rolls the same
  // colours. A select is chosen as the keyboard would choose it, since a
  // headless browser draws no open menu. A field is clicked and then
  // filled. A change of tiling crossfades and glides.
  var PRESS = 0.09;
  var CLICKS = [
    [7.0, 'p-5-16', { change: true }],
    [9.2, 'p-1-4', { change: true }],
    [11.4, 'p-3-4', { change: true }],
    [13.6, 'p-2-9-3', { change: true }],
    [15.8, 'p-9-10', { change: true }],
    [18.5, 'set-values'],
    [19.25, 'value-m', { fill: '26' }],
    [19.81, 'value-k', { fill: '67' }],
    [20.375, 'value-t', { fill: '3' }],
    [21.08, 'values-apply', { change: true }],
    [22.55, 'dice', { seed: 1 }],          // the 27 colours
    [24.22, 'dice', { seed: 7 }],          // a hue ring
    [25.89, 'dice', { seed: 8 }],          // a gradient between two hues
    [27.56, 'dice', { seed: 2 }],          // the 27 colours again
    [29.23, 'dice', { seed: 9 }],          // an accented Pastel
    [31.3, 'scheme', { select: 'copies' }],
    [33.3, 'scheme', { select: 'two' }],
    [35.3, 'scheme', { select: 'grey' }],
    [37.3, 'scheme', { select: 'pastel6' }],
    [39.9, 'scheme', { select: 'pastel' }],
    [41.0, 'p-3-7', { change: true }]
  ];

  var DRAGS = [];

  // Captions: from t0 to t1, fading in and out over FADE seconds. The
  // title starts before 0 s, so it is whole and still through the end.
  var FADE = 0.3;
  var CAPTIONS = [
    [-2.0, 6.6, 'Modulo Krinkle tiling', 'A spiral monotile by Miki Imura, 2025'],
    [7.05, 9.15, '(5, 16, 54′)', 'From Imura’s 2025 paper, Fig. 5f'],
    [9.25, 11.35, '(1, 4, 20)', 'From Imura’s Bridges 2026 paper, Fig. 6d'],
    [11.45, 13.55, '(3, 4, 28)', 'From Imura’s Bridges 2026 paper, Fig. 6e'],
    [13.65, 15.75, '(2, 9, 27)', 'From Imura’s Bridges 2026 paper, Fig. 6f'],
    [15.85, 17.9, '(9, 10, 20)', 'From Imura’s Bridges 2026 paper, Fig. 6i'],
    [18.2, 22.3, 'Or set your own tile', 'm = 26, k = 67, t = 3: 201 directions'],
    [22.6, 31.1, 'Roll the colours', 'One tile, 201 wedges'],
    [31.35, 33.25, 'Copies', 'The fan repeats three times, for t = 3'],
    [33.35, 35.25, 'Two tones', 'Alternate wedges'],
    [35.35, 37.25, 'Greyscale', 'Light to dark once round the centre'],
    [37.35, 39.85, 'Pastel 6', 'Six hue tracks round the fan'],
    [40.0, 43.7, 'Try it yourself at drbuild.uk/krinkle']
  ];

  // Smooth start and stop, with no jerk at either end, for the caption fades.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  // Half a sine wave, for pointer moves and zoom glides.
  function ease(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return (1 - Math.cos(Math.PI * u)) / 2;
  }

  // Is the mouse button down at time b? A select is chosen without the
  // mouse, so its click never presses the real button.
  function pressed(b) {
    var press = PRESS / SEC_PER_BEAT;
    return CLICKS.some(function (c) { return !(c[2] && c[2].select) && b >= c[0] - press && b < c[0]; }) ||
      DRAGS.some(function (d) { return b >= d[0] && b < d[1]; });
  }

  var Timeline = {
    VERSION: VERSION, BPM: BPM, BEATS: BEATS, FPS: FPS, FRAMES: FRAMES, SEC_PER_BEAT: SEC_PER_BEAT,
    PAGE: PAGE, CLIP: CLIP, START_ZOOM: START_ZOOM, REST: REST, ZOOMS: ZOOMS,
    FADE_CHANGE: FADE_CHANGE, GLIDE_CHANGE: GLIDE_CHANGE, MOVES: MOVES, PRESS: PRESS,
    CLICKS: CLICKS, DRAGS: DRAGS, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, ease: ease, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.KrinkleTimeline = Timeline;
})();
