/* The Leech explorer video's timeline: every pointer move, click and
   caption, in seconds. stage.js draws each frame from it, and render.js
   drives the mouse from it. See storyboard.md.

   The video loops. It starts and ends on the 36-fold view in Shapes
   colour, with the title showing and the pointer resting on the 36-fold
   button. Scene changes take 2 s, set through the address. Works in Node
   and in a browser, as window.LeechTimeline. */
(function () {
  'use strict';

  var VERSION = 'v1';
  var DURATION = 42, FPS = 30;
  var FRAMES = Math.round(DURATION * FPS);

  // The page is 1280 × 960 CSS px, filmed whole for a 4:3 video. Points
  // here are page coordinates.
  var PAGE = [1280, 960], CLIP = [0, 0, 1280, 960];
  var HASH = '#ct=2';

  // The pointer rests on this target at the start and the end.
  var REST = 'rot36';

  // Pointer moves: from t0 to t1, to a target named in stage.js.
  var MOVES = [
    [0.25, 1.6, 'step'],
    [5.0, 5.7, 'hexagon'],
    [8.9, 9.5, 'rot60'],
    [11.9, 12.7, 'rings'],
    [13.8, 14.6, 'coordinates'],
    [16.8, 17.5, 'rot42'],
    [20.4, 21.0, 'petrie'],
    [22.5, 23.2, 'shells'],
    [24.1, 24.9, 'next-e8'],
    [28.4, 29.1, 'layers'],
    [31.9, 32.6, 'rot30'],
    [34.7, 35.5, 'shapes'],
    [35.9, 36.6, 'rot36']
  ];

  // Clicks: the button goes down PRESS seconds before and comes up on the
  // time. The name is what the pointer must be on; the stage checks it.
  var PRESS = 0.09;
  var CLICKS = [
    [1.9, 'step'],
    [6.0, 'hexagon'],
    [9.7, 'rot60'],
    [12.9, 'rings'],
    [14.8, 'coordinates'],
    [17.8, 'rot42'],
    [21.3, 'petrie'],
    [23.5, 'shells'],
    [25.2, 'next-e8'],
    [29.4, 'layers'],
    [32.9, 'rot30'],
    [35.8, 'shapes'],
    [36.8, 'rot36']
  ];

  // From OUTRO[0] to OUTRO[1], a still of the first frame fades in over
  // the app, so the last frame flows into the first even where the app's
  // return to 36-fold lands at a slight angle. Null leaves it out.
  var OUTRO = [40.4, 41.2];

  // Captions: from t0 to t1, fading in and out over FADE seconds. The
  // title starts before 0 s, so it is whole and still through the end.
  var FADE = 0.3;
  var CAPTIONS = [
    [-2.2, 3.0, 'The Leech lattice', '196,560 balls round one – John Leech, 1967'],
    [3.1, 6.3, '36-fold symmetry, exactly', 'One 10° step lands every spot on a spot'],
    [6.4, 9.6, '196,560 balls on just 25 spots', 'The hexagon plane stacks them up'],
    [9.8, 12.9, '60-fold: 70,081 spots', 'A rotation of order 60 turns this plane'],
    [13.0, 17.9, 'Colour the rings, then move', 'Each ball keeps its colour'],
    [18.0, 21.4, '42-fold, in 60-fold’s ring colours', 'The same balls, seen in a new plane'],
    [21.5, 25.2, 'E8 hides inside Leech', 'One octad: 2,641 spots, E8’s 240 roots in gold'],
    [25.3, 29.3, 'Next E8', 'Tilt into the next octad’s copy'],
    [29.5, 32.8, 'Seven layers round one ball', '1 · 4,600 · 47,104 · 93,150 · 47,104 · 4,600 · 1'],
    [33.0, 35.9, '30-fold, coloured by layer', '7,861 spots on 165 circles'],
    [36.0, 39.6, 'Try it yourself at drbuild.uk/leech']
  ];

  // Smooth start and stop, with no jerk at either end, for the fades.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  // Half a sine wave, for pointer moves.
  function ease(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return (1 - Math.cos(Math.PI * u)) / 2;
  }

  // Is the mouse button down at time t?
  function pressed(t) {
    return CLICKS.some(function (c) { return t >= c[0] - PRESS && t < c[0]; });
  }

  var Timeline = {
    VERSION: VERSION, DURATION: DURATION, FPS: FPS, FRAMES: FRAMES,
    PAGE: PAGE, CLIP: CLIP, HASH: HASH, REST: REST, MOVES: MOVES, PRESS: PRESS,
    CLICKS: CLICKS, OUTRO: OUTRO, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, ease: ease, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.LeechTimeline = Timeline;
})();
