/* The Krinkle explorer video's timeline: every pointer move, click and
   caption, in beats. stage.js draws each frame from it, render.js drives
   the mouse from it, and music for the video can be written to it. See
   storyboard.md.

   128 BPM: a beat is 0.46875 s, and the video is 96 beats, 24 bars of 4/4.
   That is exactly 45 s, 1,350 frames at 30 fps. Beat 96 is beat 0: the
   video loops, starting and ending on the (3, 7, 22') fan in Pastel 1,
   zoomed in one step from home, with the pointer on the zoom-out button.
   Works in Node and in a browser, as window.KrinkleTimeline. */
(function () {
  'use strict';

  var BPM = 128, BEATS = 96, FPS = 30;
  var SEC_PER_BEAT = 60 / BPM;
  var FRAMES = Math.round(BEATS * SEC_PER_BEAT * FPS);

  // The page is 1280 × 960 CSS px, filmed whole for a 4:3 video. Points
  // here are page coordinates.
  var PAGE = [1280, 960], CLIP = [0, 0, 1280, 960];

  // The opening view: home zoom times this. The video ends by zooming in
  // once from home, so the two match.
  var START_ZOOM = 2;

  // The pointer rests on this target at the start and the end.
  var REST = 'zoom-out';

  // Pointer moves: from beat b0 to b1, to a target named in stage.js.
  var MOVES = [
    [2.7, 3.6, 'zoom-in'],
    [5.2, 7.6, 'p-5-16'],
    [10.2, 11.6, 'p-1-4'],
    [16.2, 17.6, 'p-3-4'],
    [22.2, 23.6, 'p-2-9-3'],
    [28.2, 29.6, 'p-9-10'],
    [34.2, 36.6, 'set-values'],
    [37.4, 38.4, 'value-m'],
    [38.8, 39.6, 'value-k'],
    [40.0, 40.8, 'value-t'],
    [41.2, 42.2, 'values-apply'],
    [47.0, 49.6, 'dice'],
    [74.2, 75.6, 'scheme'],
    [82.2, 83.6, 'scheme'],
    [84.2, 85.6, 'p-3-7'],
    [86.4, 87.6, 'zoom-in'],
    [88.4, 89.6, 'zoom-out']
  ];

  // Clicks, each on a beat: the button goes down PRESS seconds before and
  // comes up on the beat. The name is what the pointer must be on; the
  // stage checks it. A dice click seeds Math.random() first, so every render
  // rolls the same colours. A select is chosen as the keyboard would choose
  // it, since a headless browser draws no open menu. A field is clicked and
  // then filled.
  var PRESS = 0.09;
  var CLICKS = [
    [0.5, 'zoom-out'],
    [1.25, 'zoom-out'],
    [2, 'zoom-out'],
    [4, 'zoom-in'],
    [4.75, 'zoom-in'],
    [8, 'p-5-16'],
    [12, 'p-1-4'],
    [18, 'p-3-4'],
    [24, 'p-2-9-3'],
    [30, 'p-9-10'],
    [37, 'set-values'],
    [38.6, 'value-m', { fill: '26' }],
    [39.8, 'value-k', { fill: '67' }],
    [41, 'value-t', { fill: '3' }],
    [42.5, 'values-apply'],
    [50, 'dice', { seed: 1 }],             // the 27 colours
    [55, 'dice', { seed: 7 }],             // a hue ring
    [60, 'dice', { seed: 8 }],             // a gradient between two hues
    [65, 'dice', { seed: 2 }],             // the 27 colours again
    [70, 'dice', { seed: 9 }],             // an accented Pastel
    [76, 'scheme', { select: 'pastel6' }],
    [84, 'scheme', { select: 'pastel' }],
    [86, 'p-3-7'],
    [88, 'zoom-in']
  ];

  var DRAGS = [];

  // Captions: from beat b0 to b1, fading in and out over FADE seconds. The
  // title starts before beat 0, so it is whole and still through the end.
  var FADE = 0.3;
  var CAPTIONS = [
    [-6.4, 7.4, 'Modulo Krinkle tiling', 'A spiral monotile by Miki Imura, 2025'],
    [8.2, 11.6, '(5, 16, 54′)', 'From Imura’s 2025 paper, Fig. 5f'],
    [12.2, 17.6, '(1, 4, 20)', 'From Imura’s Bridges 2026 paper, Fig. 6d'],
    [18.2, 23.6, '(3, 4, 28)', 'From Imura’s Bridges 2026 paper, Fig. 6e'],
    [24.2, 29.6, '(2, 9, 27)', 'From Imura’s Bridges 2026 paper, Fig. 6f'],
    [30.2, 35.6, '(9, 10, 20)', 'From Imura’s Bridges 2026 paper, Fig. 6i'],
    [36.2, 49.4, 'Or set your own tile', 'm = 26, k = 67, t = 3: 201 directions'],
    [50.2, 75.4, 'Roll the colours', 'One tile, 201 wedges'],
    [76.2, 83.4, 'Pastel 6', 'Six hue tracks round the fan'],
    [84.2, 89.6, 'Try it yourself at drbuild.uk/krinkle']
  ];

  // Smooth start and stop, with no jerk at either end.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }

  // Is the mouse button down at beat b? A select is chosen without the
  // mouse, so its click never presses the real button.
  function pressed(b) {
    var press = PRESS / SEC_PER_BEAT;
    return CLICKS.some(function (c) { return !(c[2] && c[2].select) && b >= c[0] - press && b < c[0]; }) ||
      DRAGS.some(function (d) { return b >= d[0] && b < d[1]; });
  }

  var Timeline = {
    BPM: BPM, BEATS: BEATS, FPS: FPS, FRAMES: FRAMES, SEC_PER_BEAT: SEC_PER_BEAT,
    PAGE: PAGE, CLIP: CLIP, START_ZOOM: START_ZOOM, REST: REST, MOVES: MOVES, PRESS: PRESS,
    CLICKS: CLICKS, DRAGS: DRAGS, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.KrinkleTimeline = Timeline;
})();
