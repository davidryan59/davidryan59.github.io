/* The Hyperbolic Models Explorer video's timeline, in seconds: every view
   glide, model change, pointer move and drag, and caption. stage.js draws
   each frame from it, and render.js drives the mouse from it. See
   storyboard.md.

   The video loops. It starts and ends on the Poincaré disk in the app's
   home view, with the title showing and the pointer resting low on the
   right. Works in Node and in a browser, as window.HyperTimeline. */
(function () {
  'use strict';

  var VERSION = 'v4';
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

  // The drags. Each runs from t0 to t1 along a curve given by a formula,
  // path(u) for u from 0 to 1, so it has no corners anywhere. Time maps to
  // u through glide() below, so the pointer starts from rest, speeds up
  // and slows to rest, with smooth acceleration and smooth jerk. Paths stay
  // small and well inside the rim, so the plane never races.
  var TAU = 2 * Math.PI;
  // A Bezier curve: one polynomial through the control points' pull, so it
  // is smooth everywhere, with no corner at any control point.
  function bezier(P) {
    return function (u) {
      var Q = P.map(function (p) { return p.slice(); });
      for (var n = Q.length - 1; n > 0; n--) for (var k = 0; k < n; k++)
        Q[k] = [Q[k][0] + (Q[k + 1][0] - Q[k][0]) * u, Q[k][1] + (Q[k + 1][1] - Q[k][1]) * u];
      return Q[0];
    };
  }
  // A bump from 0 up to 1 and back to 0 over u in [0, w], then 0: sin to
  // the fourth, so its slope and curvature are smooth where it ends.
  function bump(u, w) { return u >= w ? 0 : Math.pow(Math.sin(Math.PI * u / w), 4); }
  var DRAGS = [
    { t0: 3.3, t1: 6.9, name: 'Poincaré disk: one full circle, anticlockwise, reaching further out',
      path: function (u) { var a = -TAU * u; return [0.1 + 0.22 * Math.cos(a), 0.08 + 0.22 * Math.sin(a)]; } },
    { t0: 7.5, t1: 10.8, name: 'Klein disk: up and to the right, then turning down to end elsewhere',
      path: bezier([[-0.3, 0.22], [0.02, -0.5], [0.42, -0.08], [0.16, 0.3]]) },
    { t0: 11.5, t1: 14.8, name: 'Half-plane: a P, up from near the left edge, round the top and back in',
      path: bezier([[-0.6, 0.45], [-0.63, -0.3], [-0.18, -0.46], [-0.04, -0.06], [-0.24, 0.1], [-0.48, 0.06]]) },
    { t0: 15.5, t1: 18.8, name: 'Band: up from half way to the lower edge, an arc over to the middle, then down diagonally',
      path: bezier([[-0.36, 0.45], [-0.4, -0.2], [0.02, -0.32], [0.1, 0.06], [0.34, 0.4]]) },
    { t0: 19.5, t1: 22.8, name: 'Inverted disk: from far out, a shallow curve in towards the hole, then out again further round',
      path: function (u) { var a = (0.24 - 0.32 * u) * Math.PI, r = 0.9 - 0.13 * bump(u, 1); return [r * Math.cos(a), r * Math.sin(a)]; } },
    { t0: 23.5, t1: 26.8, name: 'Joukowsky: from near the slit’s right end, a loop away from it, then back along it leftwards',
      path: bezier([[0.54, 0.26], [0.5, 0.62], [-0.42, 0.62], [-0.32, 0.16], [0.25, 0.24]]) }
  ];
  // Moves between drags carry the pointer to the next drag's start, or
  // home to REST after the last.
  var MOVES = [[2.3, 3.25], [6.95, 7.45], [10.85, 11.45], [14.85, 15.45], [18.85, 19.45], [22.85, 23.45], [26.85, 28.3]];

  // Septic smootherstep: zero speed, acceleration and jerk at both ends.
  function glide(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * u * (35 - 84 * u + 70 * u * u - 20 * u * u * u);
  }

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
    return DRAGS.some(function (d) { return t >= d.t0 && t < d.t1; });
  }

  var Timeline = {
    VERSION: VERSION, SECONDS: SECONDS, FPS: FPS, FRAMES: FRAMES, SHAPES: SHAPES, REST: REST,
    FADE_CHANGE: FADE_CHANGE, CHANGES: CHANGES, HOME_FROM: HOME_FROM, HOME_AT: HOME_AT,
    GLIDES: GLIDES, DRAGS: DRAGS, MOVES: MOVES, glide: glide, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, ease: ease, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.HyperTimeline = Timeline;
})();
