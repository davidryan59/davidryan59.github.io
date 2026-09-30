/* The 21 shapes of one to five squares, their orientations and colours, and
   how a piece rotates and flips inside its box. See docs/pentrys.md.

   Each shape has a square box as wide as its longest side. In its reference
   position the shape fills the box's width and sits halfway down it, rounded
   towards the top. Every orientation is that box flipped (or not) and then
   turned clockwise 0 to 3 quarter turns, so orientation o = 4 * flip + turns.
   The squares keep their order through every orientation, so a special
   square stays on the same square of its piece.

   Runs in the browser and in Node: it hangs Pentrys.Pieces on the global
   object. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  // The five families, each with its shapes in order along its band of hue.
  var FAMILIES = [
    ['Straights', ['1', '2', 'I3', 'I4', 'I5']],
    ['Corners', ['L3', 'L4', 'L5', 'V5']],
    ['Boxes', ['O4', 'P5', 'U5']],
    ['Zigzags', ['S4', 'N5', 'W5', 'Z5']],
    ['Tees', ['T4', 'T5', 'Y5', 'F5', 'X5']]
  ];

  // Each shape in its reference position, as the spec draws it.
  var REF = {
    '1': ['#'], '2': ['##'], I3: ['###'], L3: ['#.', '##'], I4: ['####'], O4: ['##', '##'],
    T4: ['.#.', '###'], S4: ['.##', '##.'], L4: ['..#', '###'], I5: ['#####'], L5: ['...#', '####'],
    Y5: ['..#.', '####'], N5: ['##..', '.###'], P5: ['##.', '###'], U5: ['#.#', '###'],
    T5: ['.#.', '.#.', '###'], V5: ['#..', '#..', '###'], W5: ['#..', '##.', '.##'],
    X5: ['.#.', '###', '.#.'], Z5: ['##.', '.#.', '.##'], F5: ['.#.', '.##', '##.']
  };

  // Each shape's colour on the dark well and its rim light, then on the light
  // well and its rim light. Chosen in OKLCH; see the spec's Colours table.
  // Stone is not a shape: it builds the tutorial's wells.
  var COLOURS = {
    '1': ['#03e8e3', '#d6fffc', '#039a97', '#6dd9d5'],
    '2': ['#01d5ee', '#b8f4ff', '#0091a3', '#67d0e2'],
    I3: ['#06c2f8', '#abe5fe', '#0588af', '#6dc6eb'],
    I4: ['#3aadff', '#a3d4fe', '#057dc2', '#7bbaef'],
    I5: ['#5d94ff', '#a1c2fc', '#2867e4', '#8baeee'],
    L3: ['#ff7267', '#febab2', '#de3c37', '#f8a59b'],
    L4: ['#fe8056', '#ffc3b0', '#e44d05', '#feaf95'],
    L5: ['#ff8c40', '#fecdb0', '#db6902', '#ffbb94'],
    V5: ['#fe981a', '#fed5b1', '#d57d04', '#fec898'],
    O4: ['#feb930', '#fef0d9', '#e9a60d', '#ffecce'],
    P5: ['#fbc906', '#fef5da', '#e1b303', '#ffedc0'],
    U5: ['#f2da0d', '#fff7c1', '#d5c006', '#fdf1a2'],
    S4: ['#abe841', '#e7ffcd', '#78ab08', '#c4e59d'],
    N5: ['#76ec6b', '#e2ffde', '#34b02a', '#ade3a6'],
    W5: ['#11ed8f', '#d6ffe3', '#04a964', '#95e1b1'],
    Z5: ['#04e5b4', '#bfffe7', '#04a17e', '#80ddbd'],
    T4: ['#8782fe', '#b4b7f7', '#5d4ed6', '#9a9de2'],
    T5: ['#ac78ff', '#cab6f5', '#7f45cd', '#b19adf'],
    Y5: ['#cd70f0', '#dfb6ef', '#9b3ebc', '#c599d7'],
    F5: ['#e96bd8', '#f0b7e6', '#b337a5', '#d799cc'],
    X5: ['#fe6ab9', '#febad9', '#c63288', '#e59abd'],
    stone: ['#59607d', '#9aa1bd', '#b3b8c9', '#dde0ea']
  };

  var SHAPES = [], FAMILY = {}, BY_SIZE = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  FAMILIES.forEach(function (f) {
    f[1].forEach(function (name) { SHAPES.push(name); FAMILY[name] = f[0]; });
  });

  // A shape: its size, box, and the eight orientations as lists of [x, y]
  // in box coordinates, y down, with each orientation's extent.
  function build(name) {
    var rows = REF[name], w = rows[0].length, h = rows.length, n = Math.max(w, h);
    var top = Math.floor((n - h) / 2), base = [];
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) if (row[x] === '#') base.push([x, y + top]);
    });
    var orients = [];
    for (var f = 0; f < 2; f++) {
      for (var r = 0; r < 4; r++) {
        var cells = base.map(function (c) { return f ? [n - 1 - c[0], c[1]] : [c[0], c[1]]; });
        for (var i = 0; i < r; i++) cells = cells.map(function (c) { return [n - 1 - c[1], c[0]]; });
        var xs = cells.map(function (c) { return c[0]; }), ys = cells.map(function (c) { return c[1]; });
        orients.push({
          cells: cells,
          minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
          minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys)
        });
      }
    }
    return { name: name, size: base.length, box: n, family: FAMILY[name], orients: orients };
  }
  var SHAPE = {};
  SHAPES.forEach(function (name) { SHAPE[name] = build(name); BY_SIZE[SHAPE[name].size].push(name); });

  // Turning and flipping, on orientation numbers. A flip mirrors the box, and
  // mirroring reverses the direction of any turns already made.
  function rotate(o, dir) {
    var f = o >> 2, r = o & 3;
    return 4 * f + ((r + (dir > 0 ? 1 : 3)) & 3);
  }
  function flip(o) {
    var f = o >> 2, r = o & 3;
    return 4 * (1 - f) + ((4 - r) & 3);
  }

  // The shifts a turn or a flip tries, in order, when its result overlaps.
  var SHIFTS_CW = [-1, 1, -2, 2], SHIFTS_CCW = [1, -1, 2, -2];

  // The squares of a piece in the well. bx is the column of the box's left
  // edge, and bottom the row of the piece's lowest square, rows counted down.
  function cellsAt(shape, o, bx, bottom) {
    var or = SHAPE[shape].orients[o];
    return or.cells.map(function (c) { return [bx + c[0], bottom - (or.maxY - c[1])]; });
  }

  // Where a piece first appears: centred, rounded to the left, its bottom row
  // in the well's top row.
  function spawnAt(shape, o, width, topRow) {
    var or = SHAPE[shape].orients[o], w = or.maxX - or.minX + 1;
    return { bx: Math.floor((width - w) / 2) - or.minX, bottom: topRow };
  }

  // A shape's cells in one orientation, moved to start at (0, 0), for drawing
  // in the queue.
  function shapeCells(shape, o) {
    var or = SHAPE[shape].orients[o];
    return or.cells.map(function (c) { return [c[0] - or.minX, c[1] - or.minY]; });
  }

  Pentrys.Pieces = {
    FAMILIES: FAMILIES, REF: REF, COLOURS: COLOURS, SHAPES: SHAPES, SHAPE: SHAPE, BY_SIZE: BY_SIZE,
    FAMILY: FAMILY, SHIFTS_CW: SHIFTS_CW, SHIFTS_CCW: SHIFTS_CCW,
    rotate: rotate, flip: flip, cellsAt: cellsAt, spawnAt: spawnAt, shapeCells: shapeCells
  };
})(typeof window !== 'undefined' ? window : globalThis);
