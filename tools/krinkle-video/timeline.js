/* The Krinkle explorer video's timeline: every pointer move, click, drag
   and caption, in beats. stage.js draws each frame from it, render.js drives
   the mouse from it, and music for the video can be written to it. See
   storyboard.md.

   128 BPM: a beat is 0.46875 s, and the video is 128 beats, 32 bars of 4/4.
   That is exactly 60 s, 1,800 frames at 30 fps. Beat 128 is beat 0: the
   video loops, starting and ending on the (3, 7, 22) fan in Pastel 1. Works
   in Node and in a browser, as window.KrinkleTimeline. */
(function () {
  'use strict';

  var BPM = 128, BEATS = 128, FPS = 30;
  var SEC_PER_BEAT = 60 / BPM;
  var FRAMES = Math.round(BEATS * SEC_PER_BEAT * FPS);

  // The page is 1260 × 960 CSS px, and the video films its right-hand
  // 960 px square, so the fan's centre sits in the open map left of the
  // Options panel, and the panel takes about a sixth of the frame. Points
  // here are page coordinates.
  var PAGE = [1260, 960], CLIP = [300, 0, 960, 960];

  // The pointer's rest, over the map below the fan's centre.
  var REST = [620, 747];

  // Pointer moves: from beat b0 to b1, to a target named in stage.js.
  var MOVES = [
    [5.4, 7.2, 'p-5-16'],
    [8.4, 9.4, 'zoom-out'],
    [10.4, 11.4, 'tab-arrangement'],
    [12.2, 13.2, 'scrub-start'],
    [26.2, 28.2, 'dice'],
    [32.4, 35.2, 'tab-tile'],
    [36.4, 39.2, 'p-3-7-14'],
    [40.6, 42.2, 'k-up'],
    [43.2, 43.9, 'k-down'],
    [45.4, 47.4, 'dice'],
    [49.4, 52.2, 'p-1-4'],
    [53.4, 55.2, 'scheme'],
    [56.4, 57.4, 'zoom-out'],
    [61.4, 64.2, 'p-3-4'],
    [65.4, 67.2, 'scheme'],
    [68.2, 69.2, 'turn-left'],
    [74.4, 76.2, 'p-3-7-14'],
    [77.4, 78.4, 'tab-arrangement'],
    [79.4, 80.4, 'shape'],
    [81.4, 82.4, 'zoom-in'],
    [83.4, 84.4, 'dice'],
    [86.4, 88.2, 'bend-zero'],
    [89.4, 90.4, 'layout-repeat'],
    [92.4, 93.4, 'zoom-out'],
    [96.2, 97.4, 'layout-fan'],
    [98.2, 99.2, 'tab-tile'],
    [100.2, 100.9, 'set-values'],
    [101.4, 102.2, 'value-m'],
    [102.8, 103.4, 'value-k'],
    [104.0, 104.7, 'values-apply'],
    [105.4, 106.4, 'zoom-out'],
    [107.4, 108.4, 'dice'],
    [114.4, 116.2, 'scheme'],
    [117.6, 119.4, 'p-3-7'],
    [121.4, 125.4, 'rest']
  ];

  // Clicks, each on a beat: the button goes down PRESS seconds before and
  // comes up on the beat. The name is what the pointer must be on; the
  // stage checks it. A dice click seeds Math.random() first, so every render
  // rolls the colours approved on the storyboard. A select is chosen as the
  // keyboard would choose it, since a headless browser draws no open menu.
  // A field is clicked and then filled.
  var PRESS = 0.09;
  var CLICKS = [
    [8, 'p-5-16'],
    [10, 'zoom-out'],
    [12, 'tab-arrangement'],
    [29, 'dice', { seed: 1 }],             // the 27 colours
    [36, 'tab-tile'],
    [40, 'p-3-7-14'],
    [43, 'k-up'],
    [44.5, 'k-down'],
    [48, 'dice', { seed: 7 }],             // an ordered hue ring
    [53, 'p-1-4'],
    [56, 'scheme', { select: 'copies' }],
    [58, 'zoom-out'],
    [65, 'p-3-4'],
    [68, 'scheme', { select: 'rainbow' }],
    [70, 'turn-left'],
    [71, 'turn-left'],
    [72, 'turn-left'],
    [73, 'turn-left'],
    [77, 'p-3-7-14'],
    [79, 'tab-arrangement'],
    [81, 'shape', { select: 'curve' }],
    [83, 'zoom-in'],
    [85, 'dice', { seed: 9 }],             // an accented Pastel
    [89, 'bend-zero'],
    [91, 'layout-repeat'],
    [94, 'zoom-out'],
    [98, 'layout-fan'],
    [100, 'tab-tile'],
    [101, 'set-values'],
    [102.5, 'value-m', { fill: '49' }],
    [103.75, 'value-k', { fill: '120' }],
    [105, 'values-apply'],
    [107, 'zoom-out'],
    [109, 'dice', { seed: 1 }],            // the 27 colours
    [117, 'scheme', { select: 'pastel' }],
    [120, 'p-3-7']
  ];

  // Drags: press on beat b0 where the pointer is, move to a target by beat
  // b1, release. The construction scrubber builds the fan wedge by wedge.
  var DRAGS = [
    [13.6, 25.2, 'scrub-end']
  ];

  // Captions: from beat b0 to b1, fading in and out over FADE seconds. The
  // first starts before beat 0, so it is whole on the first frame.
  var FADE = 0.3;
  var CAPTIONS = [
    [-0.64, 7.4, 'Krinkle tilings', 'One tile, spiralling out forever'],
    [8.4, 27.4, 'Built one wedge at a time', 'Each wedge is a slice of a plain lattice'],
    [28.4, 39.4, 'Roll the colours', '54 wedges, dealt from 27 colours'],
    [40.4, 51.4, 'Pick m, k and t', 'Count in jumps of m on a k-hour clock'],
    [52.4, 63.4, 'Five copies of the spiral', '5 arms one way, 15 the other'],
    [64.4, 75.4, 'Seven copies, 28 directions', '21 arms one way, 7 the other'],
    [76.4, 90.4, 'Curve the edges', 'Each tile still fits its neighbours'],
    [91.2, 99.4, 'The same tile also tiles in rows', 'So the spiral is non-periodic, not aperiodic'],
    [100.4, 108.4, 'Up to 240 directions', 'k = 120: a tile with 242 edges'],
    [109.4, 115.4, '240 wedges, 27 colours', 'Every roll is a new picture'],
    [116.4, 127.36, 'Try it yourself at drbuild.uk/krinkle']
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
    PAGE: PAGE, CLIP: CLIP, REST: REST, MOVES: MOVES, PRESS: PRESS,
    CLICKS: CLICKS, DRAGS: DRAGS, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.KrinkleTimeline = Timeline;
})();
