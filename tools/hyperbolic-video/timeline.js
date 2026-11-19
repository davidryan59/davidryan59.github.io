/* The Hyperbolic Models Explorer video's timeline, in seconds: every view
   glide, model change, pointer move and drag, and caption. stage.js draws
   each frame from it, and render.js drives the mouse from it. See
   storyboard.md.

   The video loops. It starts and ends on the Poincaré disk in the app's
   home view, with the title showing and the pointer resting low on the
   right. Works in Node and in a browser, as window.HyperTimeline. */
(function () {
  'use strict';

  var VERSION = 'v1';
  var SECONDS = 30, FPS = 30;
  var FRAMES = Math.round(SECONDS * FPS);

  // The page is filmed whole at 1.125 times the density: 960 × 960 CSS px
  // for a 1080 × 1080 square, or 1280 × 960 for 1440 × 1080 (4:3).
  var SHAPES = { square: [960, 960], wide: [1280, 960] };

  // Points are in disk units: (0, 0) is the middle of the model and 1 is
  // its rim in the Poincaré disk, with y down the screen. stage.js turns
  // them into page pixels for either shape.
  var REST = [0.46, 0.46];

  // Model changes. Each crossfades from the old picture over FADE_CHANGE s.
  // The last one also returns the view to the app's home view: it starts at
  // HOME_FROM and glides home by HOME_AT, so the loop has no jump.
  var FADE_CHANGE = 0.5;
  var CHANGES = [
    [7.0, 'klein'],
    [11.0, 'halfplane'],
    [15.0, 'band'],
    [19.0, 'inverted'],
    [23.0, 'joukowsky'],
    [27.0, 'poincare', { home: true }]
  ];
  var HOME_FROM = [0.30, -0.12], HOME_AT = 29.4;

  // View glides with no pointer: from t0 to t1, the view moves by the
  // hyperbolic vector (dx, dy) on half a sine wave.
  var GLIDES = [
    [0.25, 3.0, -0.30, 0.12]
  ];

  // The pointer: from t0 to t1 it travels to a point. A drag holds the
  // button down on the tiling for the whole move; bend lifts the path into
  // a gentle arc, in disk units.
  var PATH = [
    [2.5, 3.3, [0.33, 0.17]],
    [3.4, 6.4, [-0.31, -0.02], { drag: true, bend: 0.08 }],      // Poincaré disk
    [6.6, 7.4, [-0.31, 0.17]],
    [7.6, 10.4, [0.33, -0.08], { drag: true, bend: 0.08 }],      // Klein disk
    [10.6, 11.4, [0.05, -0.3]],
    [11.6, 14.4, [-0.05, 0.42], { drag: true, bend: 0.04 }],     // half-plane: down towards the floor
    [14.6, 15.4, [-0.37, 0.0]],
    [15.6, 18.4, [0.37, 0.0], { drag: true, bend: 0.04 }],       // band: along it
    [18.6, 19.4, [0.36, 0.36]],
    [19.6, 22.4, [0.64, 0.64], { drag: true, bend: 0.0 }],       // inverted disk: outwards, outside the hole
    [22.6, 23.4, [-0.42, 0.29]],
    [23.6, 26.4, [0.42, 0.29], { drag: true, bend: 0.06 }],      // Joukowsky: along the slit
    [26.6, 28.2, REST]
  ];

  // Captions: from t0 to t1, fading in and out over FADE seconds. The title
  // starts before 0 s, so it is whole and still through the loop's join.
  var FADE = 0.3;
  var CAPTIONS = [
    [-1.0, 2.95, 'Hyperbolic Models Explorer', 'One tiling, many ways to draw it'],
    [3.05, 6.95, 'Poincaré disk: drag the plane', 'Every heptagon is the same size'],
    [7.05, 10.95, 'Klein disk: lines stay straight', 'Angles give way instead'],
    [11.05, 14.95, 'Half-plane', 'Angles stay true; tiles shrink to the floor'],
    [15.05, 18.95, 'Band', 'A hyperbolic Mercator map'],
    [19.05, 22.95, 'Inverted disk', 'Inside out: the centre is at infinity'],
    [23.05, 26.95, 'Joukowsky', 'The disk opened out round a slit'],
    [27.05, 28.9, 'Try it yourself at drbuild.uk/hyperbolic']
  ];

  // Smooth start and stop, with no jerk at either end, for caption fades.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }
  // Half a sine wave, for pointer moves and view glides.
  function ease(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return (1 - Math.cos(Math.PI * u)) / 2;
  }
  // Is the mouse button down at time t?
  function pressed(t) {
    return PATH.some(function (s) { return s[3] && s[3].drag && t >= s[0] && t < s[1]; });
  }

  var Timeline = {
    VERSION: VERSION, SECONDS: SECONDS, FPS: FPS, FRAMES: FRAMES, SHAPES: SHAPES, REST: REST,
    FADE_CHANGE: FADE_CHANGE, CHANGES: CHANGES, HOME_FROM: HOME_FROM, HOME_AT: HOME_AT,
    GLIDES: GLIDES, PATH: PATH, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, ease: ease, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.HyperTimeline = Timeline;
})();
