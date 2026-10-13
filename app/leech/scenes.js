/* The sixteen named views of the Leech lattice explorer. */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var value = Math.imul(seed ^ seed >>> 15, 1 | seed);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function vector(data, index) {
    return new Float64Array(data.coords.slice(index * 24, index * 24 + 24));
  }

  function symmetricRows23() {
    var row0 = new Float64Array(24), row1 = new Float64Array(24);
    var scale = Math.sqrt(2 / 23);
    for (var i = 0; i < 23; i++) {
      row0[i] = scale * Math.cos(2 * Math.PI * i / 23);
      row1[i] = scale * Math.sin(2 * Math.PI * i / 23);
    }
    return [row0, row1];
  }

  function symmetricRows11() {
    var row0 = new Float64Array(24), row1 = new Float64Array(24);
    var powers = [1, 2, 4, 8, 16, 9, 18, 13, 3, 6, 12];
    for (var j = 0; j < 11; j++) {
      var cosine = Math.cos(2 * Math.PI * j / 11) / Math.sqrt(11);
      var sine = Math.sin(2 * Math.PI * j / 11) / Math.sqrt(11);
      row0[powers[j]] = row0[23 - powers[j]] = cosine;
      row1[powers[j]] = row1[23 - powers[j]] = sine;
    }
    return [row0, row1];
  }

  function build(options) {
    var Leech = options.Leech, Frame = options.Frame, E8 = options.E8, data = options.data;
    var octad = Leech.TRIO[0], presets = E8.makePresets();
    function e8(name) { return Frame.place(presets[name], octad); }
    var rows23 = symmetricRows23();

    var random = mulberry32(24), randomRows = [new Float64Array(24), new Float64Array(24)];
    for (var r = 0; r < 2; r++) for (var k = 0; k < 24; k++) randomRows[r][k] = random() - 0.5;
    randomRows = Frame.orthonormalise(randomRows);

    var hexagonRows = Frame.orthonormalise([vector(data, 0), vector(data, 6)]);
    var coordinateRows = [new Float64Array(24), new Float64Array(24)];
    coordinateRows[0][0] = 1; coordinateRows[1][1] = 1;
    var layerRow = vector(data, Leech.FIXED);
    for (var i = 0; i < 24; i++) layerRow[i] /= Math.sqrt(32);
    var layerRows = Frame.orthonormalise([layerRow, rows23[0]]);

    var captions = {
      petrie: 'Seen through one octad, all 196,560 balls fall on 2,641 spots. The 240 gold dots are a copy of E8, one ball each.',
      cox7: "The same octad in E8's second Coxeter plane. Its order-30 symmetry turns each ring by 84°.",
      cox11: "The same octad in E8's third Coxeter plane. Its order-30 symmetry turns each ring by 132°.",
      cox13: "The same octad in E8's fourth Coxeter plane. Its order-30 symmetry turns each ring by 156°.",
      octagonal: "E8's octagonal view of the same octad, with eight-fold symmetry.",
      squares: "E8's squares view of the same octad. Some spots merge here, so 1,821 remain.",
      e8edges: 'The 240 gold balls touch each other in 6,720 pairs. These are the edges of the E8 picture, inside the Leech lattice.',
      weave: 'The octad view tilted 4° toward the next octad. Each pile spreads into a small cloud, and 2,641 spots become 70,081.',
      cloud: 'A view that mixes all 24 coordinates. The 196,560 balls average into a smooth glow, as most views in high dimensions do.',
      hexagon: 'The first three coordinates, seen along the diagonal (1, −1, 1). All 196,560 balls land on 25 spots.',
      coordinates: 'The first two coordinates alone. All 196,560 balls land on 29 spots.',
      layers: 'The horizontal axis points at one ball. The others stand in seven layers by their angle from it.',
      rings23: 'The 1,104 balls of shape (±4, ±4, 0²²), in a plane that the 23-cycle of M24 turns. They lie on 23 circles.',
      cloud23: 'The same plane with all 196,560 balls. The symmetry is exact, but 8,546 rings of 23 merge into a glow.',
      sunburst: 'The 23-cycle fixes the selected ball, so it hides behind the centre. Its 4,600 neighbours lie on 100 circles of 46.',
      rosette11: 'A plane turned by i → 2i, which cycles 22 coordinates in two loops of 11. The picture has 22-fold symmetry.'
    };

    function scene(id, label, sub, windowSize, rows, settings) {
      settings = settings || {};
      var result = {
        id: id, label: label, sub: sub, caption: captions[id], featured: settings.featured || 0,
        window: windowSize, octad: settings.octad === undefined ? 0 : settings.octad,
        rows: rows.map(function (row) { return new Float64Array(row); }), tilt: settings.tilt || 0,
        colour: settings.colour || 'shapes',
        edges: settings.edges || 'none', selected: settings.selected === undefined ? null : settings.selected,
        expect: settings.expect
      };
      if (settings.weights) result.weights = settings.weights.slice();
      return result;
    }

    return [
      scene('petrie', 'E8 inside Leech', '30-fold · 2,641 spots', 8, e8('coxeter'),
        { featured: 1, colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('cox7', 'Coxeter 84°', '30-fold', 8, e8('coxeter7'),
        { colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('cox11', 'Coxeter 132°', '30-fold', 8, e8('coxeter11'),
        { colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('cox13', 'Coxeter 156°', '30-fold', 8, e8('coxeter13'),
        { colour: 'shells', expect: { spots: 2641, symmetry: 30, notSymmetry: 60 } }),
      scene('octagonal', 'Octagonal', '8-fold', 8, e8('octagonal'),
        { colour: 'shells', expect: { spots: 2641, symmetry: 8, notSymmetry: 16 } }),
      scene('squares', 'Squares', '1,821 spots', 8, e8('squares'),
        { featured: 2, colour: 'shells', expect: { spots: 1821, symmetry: 4 } }),
      scene('e8edges', 'E8 edges', '6,720 edges', 8, e8('coxeter'),
        { colour: 'shells', weights: [0.25, 0.25, 0.25, 1], edges: 'e8',
          expect: { spots: 2641, symmetry: 30, notSymmetry: 60, edges: 6720 } }),
      scene('weave', 'Weave', 'tilt 4°', 8, e8('coxeter'),
        { colour: 'shells', tilt: 4 * Math.PI / 180,
          expect: { spots: 70081, symmetry: 2, tilt45Spots: 17665, tilt90Spots: 2641, tilt90Symmetry: 30 } }),
      scene('cloud', 'All 196,560', '24 dimensions', 24, randomRows,
        { featured: 3, colour: 'shapes', expect: { spots: 196560, symmetry: 2, maxRadius: 1.6532 } }),
      scene('hexagon', 'Hexagon', '25 spots', 24, hexagonRows,
        { featured: 5, colour: 'shapes', expect: { spots: 25, symmetry: 6, maxRadius: 2 } }),
      scene('coordinates', 'Coordinates', '29 spots', 24, coordinateRows,
        { colour: 'shapes', expect: { spots: 29, symmetry: 4, maxRadius: 2 } }),
      scene('layers', 'Seven layers', 'around one ball', 24, layerRows,
        { featured: 6, colour: 'layers', selected: Leech.FIXED,
          expect: { spots: 146907, symmetry: 2, xValues: [-2, -1, -0.5, 0, 0.5, 1, 2] } }),
      scene('rings23', '23-fold rings', '1,104 balls', 24, rows23,
        { featured: 4, colour: 'shapes', weights: [1, 0, 0],
          expect: { spots: 1058, symmetry: 46, radii: 23, maxRadius: 0.8321 } }),
      scene('cloud23', '23-fold cloud', '46-fold', 24, rows23,
        { colour: 'shapes', expect: { spots: 191407, symmetry: 46, centre: 2 } }),
      scene('sunburst', 'Sunburst', '4,600 spokes', 24, rows23,
        { colour: 'layers', weights: [1, 1, 0, 0, 0, 0, 0], edges: 'spokes', selected: Leech.FIXED,
          expect: { spots: 4601, symmetry: 46, radii: 101, neighbourRadii: 100, maxRadius: 1.0927 } }),
      scene('rosette11', '11-fold rosette', '22-fold', 24, symmetricRows11(),
        { colour: 'shapes', expect: { spots: 126061, symmetry: 22 } })
    ];
  }

  var LeechScenes = { build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = LeechScenes;
  global.LeechScenes = LeechScenes;
})(typeof window === 'undefined' ? globalThis : window);
