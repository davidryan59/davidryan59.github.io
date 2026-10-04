/* The 30-second Noble Polyhedra video timeline. The stage and renderer both
   read this file, so one clock controls every shape, view and caption. */
(function () {
  'use strict';

  var FPS = 30;
  var DURATION = 30;
  var CAPTIONS = [
    [0.15, 3.75, 'Noble Polyhedra', 'Two infinite families · 146 exceptional forms'],
    [4.05, 6.8, '146 exceptional forms', 'Connor Hill completed the classification in 2026.'],
    [7.05, 12.8, 'Look through intersecting faces.', 'Glass, X-ray and cutaway views reveal the structure inside.'],
    [13.05, 16.8, 'Put one face over the complete wireframe.'],
    [17.05, 20.8, 'Or reveal every face meeting one vertex.'],
    [21.05, 23.8, 'Change light, texture, colour and depth.'],
    [24.05, 26.8, 'Then explore the two infinite families.', 'Shape a disphenoid or build a stephanoid crown.'],
    [27.05, 29.85, 'Explore them yourself.', 'drbuild.uk/noble']
  ];

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function smooth(value) {
    value = clamp(value, 0, 1);
    return value * value * value * (value * (value * 6 - 15) + 10);
  }
  function pulse(time, start, end, fade) {
    return Math.min(smooth((time - start) / fade), smooth((end - time) / fade));
  }

  function scene(time) {
    var common = { rx: -0.38 + Math.sin(time * 0.43) * 0.07, ry: 0.62 + time * 0.34,
      palette: 'aurora', lighting: 'point', texture: 'grain', opacity: 1,
      explode: 0, clip: 0, selectedFace: 0, selectedVertex: 0 };
    if (time < 4) return Object.assign(common, { model: 'I-2', view: 'solid' });
    if (time < 7) {
      var palettes = ['aurora', 'prism', 'mineral', 'orbit'];
      return Object.assign(common, { model: 'gD-3.1', view: 'solid', texture: 'clean',
        palette: palettes[Math.min(3, Math.floor((time - 4) / 0.72))] });
    }
    if (time < 10) return Object.assign(common, { model: 'D-5', view: 'glass', opacity: 0.3,
      palette: 'mineral', lighting: 'diffuse', texture: 'clean' });
    if (time < 13) return Object.assign(common, { model: 'D-5', view: 'xray', opacity: 0.16,
      palette: 'prism', lighting: 'flat', texture: 'clean', clip: smooth((time - 10) / 3) * 0.45 });
    if (time < 17) return Object.assign(common, { model: 'I-2', view: 'wire-face', texture: 'clean',
      selectedFace: Math.floor((time - 13) * 1.4) % 12 });
    if (time < 21) return Object.assign(common, { model: 'tO-1.1', view: 'wire-vertex', palette: 'orbit',
      lighting: 'diffuse', texture: 'clean', selectedVertex: Math.floor((time - 17) * 1.25) % 24 });
    if (time < 24) return Object.assign(common, { model: 'tI-7.1', view: 'solid', palette: 'aurora',
      lighting: 'depth', texture: 'contours', explode: 0.24 * Math.sin(Math.PI * (time - 21) / 3) });
    if (time < 25.35) return Object.assign(common, { family: 'disphenoid', view: 'solid', palette: 'mineral',
      lighting: 'point', texture: 'paper', shape: 0.75 + 0.45 * smooth((time - 24) / 1.35),
      rx: -0.58, ry: 0.72 + (time - 24) * 0.48 });
    if (time < 27) return Object.assign(common, { family: 'stephanoid', view: 'solid', palette: 'orbit',
      lighting: 'diffuse', texture: 'clean', height: 0.55 + 0.45 * smooth((time - 25.35) / 1.65) });
    return Object.assign(common, { model: 'I-2', view: 'solid', texture: 'grain',
      ry: 0.62 + (time - 27) * (Math.PI * 2 / 3) });
  }

  function caption(time) {
    for (var i = 0; i < CAPTIONS.length; i++) {
      var caption = CAPTIONS[i];
      if (time >= caption[0] && time <= caption[1]) {
        return { main: caption[2], sub: caption[3] || '', opacity: pulse(time, caption[0], caption[1], 0.28) };
      }
    }
    return { main: '', sub: '', opacity: 0 };
  }

  var Timeline = { FPS: FPS, DURATION: DURATION, FRAMES: FPS * DURATION,
    CAPTIONS: CAPTIONS, clamp: clamp, smooth: smooth, scene: scene, caption: caption };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.NobleTimeline = Timeline;
}());
