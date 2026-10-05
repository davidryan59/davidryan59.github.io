/* The 30-second E8 explorer video timeline. The stage and renderer share this
   clock, so every projection, structural view and caption is deterministic. */
(function () {
  'use strict';

  var FPS = 30;
  var DURATION = 30;
  var CAPTIONS = [
    [0.15, 3.8, 'The E₈ root system', '240 roots · eight dimensions · one two-dimensional shadow'],
    [4.05, 7.8, 'Pull the view through hidden dimensions.', 'Every movement preserves the exact 8D distances and angles.'],
    [8.05, 11.8, 'High symmetry appears from special angles.', 'Petrie, octagonal and square projections are built in.'],
    [12.05, 15.8, 'Choose one root.', 'It has 56 neighbours joined by polytope edges.'],
    [16.05, 19.8, 'Reveal all 6,720 edges.', 'The complete graph is dense. Local views expose its structure.'],
    [20.05, 23.8, 'Eight Coxeter cycles', 'An order-30 Weyl motion divides the roots into eight 30-gons.'],
    [24.05, 26.8, 'Eight simple roots', 'Their seven links form the E₈ Dynkin diagram.'],
    [27.05, 29.85, 'Explore E₈ yourself.', 'drbuild.uk/e8']
  ];

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function smooth(value) {
    value = clamp(value, 0, 1);
    return value * value * value * (value * (value * 6 - 15) + 10);
  }
  function pulse(time, start, end, fade) {
    return Math.min(smooth((time - start) / fade), smooth((end - time) / fade));
  }
  function turn(time, strength) {
    return [
      [0, 2, Math.sin(time * 0.58) * strength],
      [1, 5, Math.sin(time * 0.43 + 0.8) * strength * 0.78],
      [0, 7, Math.sin(time * 0.31 + 1.5) * strength * 0.46]
    ];
  }

  function scene(time) {
    var common = { from: 'coxeter', to: 'coxeter', mix: 0, view: 'roots', edges: 'none',
      colour: 'orbit', selected: 0, rotations: [], edgeAlpha: 0.08, pointer: null };
    if (time < 4) {
      var openingMotion = Math.sin(Math.PI * smooth((time - 0.8) / 3.2));
      common.rotations = turn(time, 0.045 * openingMotion);
      return common;
    }
    if (time < 8) {
      var travel = smooth((time - 4) / 4);
      common.rotations = [[0, 2, travel * 0.82], [1, 5, -travel * 0.64], [0, 7, travel * 0.34], [1, 3, travel * 0.27]];
      common.pointer = { x: 0.25 + travel * 0.55, y: 0.62 - Math.sin(travel * Math.PI) * 0.29,
        opacity: pulse(time, 4.1, 7.85, 0.28) };
      return common;
    }
    if (time < 12) {
      common.to = 'octagonal';
      common.mix = smooth((time - 8) / 1.45);
      common.rotations = turn(time - 9.2, 0.035 * smooth((time - 9.2) / 1.5));
      common.colour = 'projection';
      return common;
    }
    if (time < 16) {
      common.from = 'octagonal'; common.to = 'generic';
      common.mix = smooth((time - 12) / 1.15);
      common.view = 'neighbourhood'; common.edges = 'local';
      common.selected = Math.floor((time - 12) * 1.25) % 8 * 30;
      common.pointer = { x: 0.64 + Math.sin((time - 12) * 1.7) * 0.11,
        y: 0.54 + Math.cos((time - 12) * 1.3) * 0.12,
        opacity: pulse(time, 12.1, 15.8, 0.28) };
      return common;
    }
    if (time < 20) {
      common.from = 'generic'; common.to = 'generic';
      common.view = 'roots'; common.edges = 'all'; common.colour = 'family';
      common.rotations = turn(time - 16, 0.12);
      common.edgeAlpha = 0.045 + 0.025 * Math.sin((time - 16) * Math.PI / 4);
      return common;
    }
    if (time < 24) {
      common.from = 'generic'; common.to = 'coxeter';
      common.mix = smooth((time - 20) / 1.1);
      common.view = 'coxeter';
      return common;
    }
    if (time < 27) {
      common.from = 'coxeter'; common.to = 'dynkin';
      common.mix = smooth((time - 24) / 0.95);
      common.view = 'simple'; common.colour = 'mono';
      return common;
    }
    common.from = 'dynkin'; common.to = 'coxeter';
    common.mix = smooth((time - 27) / 0.95);
    return common;
  }

  function caption(time) {
    for (var i = 0; i < CAPTIONS.length; i++) {
      var item = CAPTIONS[i];
      if (time >= item[0] && time <= item[1]) {
        return { main: item[2], sub: item[3] || '', opacity: pulse(time, item[0], item[1], 0.28) };
      }
    }
    return { main: '', sub: '', opacity: 0 };
  }

  var Timeline = { FPS: FPS, DURATION: DURATION, FRAMES: FPS * DURATION,
    CAPTIONS: CAPTIONS, clamp: clamp, smooth: smooth, pulse: pulse,
    scene: scene, caption: caption };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.E8Timeline = Timeline;
}());
