/* Pure E8 data and matrix helpers, shared by the browser viewer and checks.
   The root coordinates, order-30 Weyl word and matching Petrie projection
   follow David A. Madore's public-domain E8 explorers. */
(function (global) {
  'use strict';

  var EPSILON = 1e-9;
  var FUNDAMENTAL_ROOTS = [120, 121, 122, 126, 132, 140, 150, 162];

  /* An order-30 Weyl element. In its matching projection, its eight orbits
     become eight regular 30-gons. */
  var COXETER_WORD = [
    120, 121, 122, 120, 126, 122, 121, 132, 140, 150, 140, 162,
    120, 122, 121, 126, 122, 120, 132, 126, 122, 121, 140, 132,
    126, 122, 120, 150, 140, 132, 126, 122, 162, 120, 122, 121,
    126, 122, 120, 132, 126, 122, 121, 140, 132, 126, 122, 120,
    150, 140, 132, 126, 162, 120, 122, 121, 126, 122
  ];

  function dot(a, b) {
    var total = 0;
    for (var i = 0; i < a.length; i++) total += a[i] * b[i];
    return total;
  }

  function length(a) { return Math.sqrt(dot(a, a)); }

  function buildRoots() {
    var roots = [];
    for (var a = 0; a < 8; a++) {
      for (var b = a + 1; b < 8; b++) {
        for (var sa = -1; sa <= 1; sa += 2) {
          for (var sb = -1; sb <= 1; sb += 2) {
            var first = [0, 0, 0, 0, 0, 0, 0, 0];
            first[a] = sa;
            first[b] = sb;
            roots.push(first);
          }
        }
      }
    }
    for (var bits = 0; bits < 128; bits++) {
      var second = [], minus = 0;
      for (var k = 0; k < 7; k++) {
        var negative = !!(bits & (1 << k));
        second.push(negative ? -0.5 : 0.5);
        if (negative) minus++;
      }
      second.push(minus % 2 ? -0.5 : 0.5);
      roots.push(second);
    }
    roots.sort(function (x, y) {
      for (var i = 0; i < 8; i++) {
        if (x[i] !== y[i]) return x[i] - y[i];
      }
      return 0;
    });
    return roots;
  }

  function rootKey(root) {
    return root.map(function (value) { return Math.round(value * 2); }).join(',');
  }

  function rootKind(root) {
    var whole = 0;
    for (var i = 0; i < 8; i++) if (Math.abs(root[i]) === 1) whole++;
    return whole === 2 ? 'd8' : 'half';
  }

  function buildEdges(roots) {
    var edges = [], adjacent = roots.map(function () { return []; });
    for (var a = 0; a < roots.length; a++) {
      for (var b = a + 1; b < roots.length; b++) {
        if (Math.abs(dot(roots[a], roots[b]) - 1) < EPSILON) {
          edges.push([a, b]);
          adjacent[a].push(b);
          adjacent[b].push(a);
        }
      }
    }
    return { edges: edges, adjacent: adjacent };
  }

  function reflected(root, mirror) {
    var amount = dot(root, mirror); // Every E8 root has squared length 2.
    return root.map(function (value, i) { return value - amount * mirror[i]; });
  }

  function applyWord(root, roots, word) {
    var result = root.slice();
    for (var i = 0; i < word.length; i++) result = reflected(result, roots[word[i]]);
    return result;
  }

  function buildCoxeterData(roots) {
    var byKey = new Map();
    roots.forEach(function (root, i) { byKey.set(rootKey(root), i); });
    var next = new Array(roots.length);
    for (var i = 0; i < roots.length; i++) {
      next[i] = byKey.get(rootKey(applyWord(roots[i], roots, COXETER_WORD)));
    }
    var orbit = new Array(roots.length).fill(-1);
    var position = new Array(roots.length).fill(-1), cycles = [];
    for (var start = 0; start < roots.length; start++) {
      if (orbit[start] >= 0) continue;
      var cycle = [], current = start;
      while (orbit[current] < 0) {
        orbit[current] = cycles.length;
        position[current] = cycle.length;
        cycle.push(current);
        current = next[current];
      }
      cycles.push(cycle);
    }
    return { next: next, orbit: orbit, position: position, cycles: cycles };
  }

  function orthonormalise(rows) {
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var vector = rows[i].slice();
      for (var j = 0; j < result.length; j++) {
        var amount = dot(vector, result[j]);
        for (var k = 0; k < vector.length; k++) vector[k] -= amount * result[j][k];
      }
      var size = length(vector);
      if (size > EPSILON) result.push(vector.map(function (value) { return value / size; }));
    }
    return result;
  }

  function completeFrame(firstRows, preferredRows) {
    var candidates = firstRows.map(function (row) { return row.slice(); });
    if (preferredRows) {
      preferredRows.forEach(function (row) { candidates.push(row.slice()); });
    }
    for (var i = 0; i < 8; i++) {
      var basis = [0, 0, 0, 0, 0, 0, 0, 0];
      basis[i] = 1;
      candidates.push(basis);
    }
    var frame = orthonormalise(candidates);
    if (frame.length !== 8) throw new Error('Could not complete the 8D frame');
    return frame.slice(0, 8);
  }

  function copyFrame(frame) {
    return frame.map(function (row) { return row.slice(); });
  }

  function rotateRows(frame, a, b, angle) {
    var cosine = Math.cos(angle), sine = Math.sin(angle);
    var rowA = frame[a].slice(), rowB = frame[b].slice();
    for (var i = 0; i < 8; i++) {
      frame[a][i] = cosine * rowA[i] + sine * rowB[i];
      frame[b][i] = -sine * rowA[i] + cosine * rowB[i];
    }
  }

  function alignFrame(from, to) {
    var options = [
      [to[0], to[1]],
      [to[0].map(function (value) { return -value; }), to[1]],
      [to[0], to[1].map(function (value) { return -value; })],
      [to[0].map(function (value) { return -value; }), to[1].map(function (value) { return -value; })],
      [to[1], to[0]],
      [to[1].map(function (value) { return -value; }), to[0]],
      [to[1], to[0].map(function (value) { return -value; })],
      [to[1].map(function (value) { return -value; }), to[0].map(function (value) { return -value; })]
    ];
    var best = options[0], bestScore = -Infinity;
    options.forEach(function (rows) {
      var score = dot(from[0], rows[0]) + dot(from[1], rows[1]);
      if (score > bestScore) { best = rows; bestScore = score; }
    });
    return completeFrame(best, from.slice(2).concat(to.slice(2)));
  }

  function interpolateFrames(from, to, amount) {
    var rows = [];
    for (var i = 0; i < 8; i++) {
      var row = [];
      for (var j = 0; j < 8; j++) row.push(from[i][j] * (1 - amount) + to[i][j] * amount);
      rows.push(row);
    }
    return completeFrame(rows);
  }

  function makePresets() {
    var octagonal = [[], []];
    for (var k = 0; k < 8; k++) {
      octagonal[0][k] = Math.cos((2 * k + 1) * Math.PI / 16);
      octagonal[1][k] = Math.sin((2 * k + 1) * Math.PI / 16);
    }
    return {
      coxeter: completeFrame([
        [0.438217070641, 0.205187681291, 0.36459828198, 0.0124511903657, -0.0124511903657, -0.36459828198, -0.205187681291, -0.67645247517],
        [-0.118465163028, 0.404927414852, 0.581970822973, 0.264896157496, 0.501826483552, 0.345040496917, 0.167997088796, 0.118465163028]
      ]),
      /* The other three real invariant planes of the same Coxeter element.
         Its rotations on these planes have exponent 7, 11 and 13. */
      coxeter7: completeFrame([
        [0.496480516728198, 0.402644964914166, -0.363568096028146, 0.51053205456136, -0.200806339753053, 0.258799900127227, -0.233126463006471, 0.192122011777954],
        [0.0741076800661046, -0.299769718225088, -0.271820594147738, 0.459324468409704, 0.173210335467147, 0.0578586043021918, 0.645967490095742, -0.411287403700566]
      ]),
      coxeter11: completeFrame([
        [0.0401426396159018, 0.186452476831363, 0.0402066838121505, -0.423389488767325, -0.423578822317377, 0.660313111820457, 0.246492566661718, -0.326431916284264],
        [-0.262132742865762, 0.188574866514894, -0.500368138786143, -0.163736180038817, 0.540557977740338, 0.188702253225776, -0.381194976925037, -0.381348994710175]
      ]),
      coxeter13: completeFrame([
        [0.684297192115886, -0.31150689150069, -0.0111086676521461, -0.39378329602869, 0.44700197547709, 0.168438794333896, 0.0569413990752925, 0.219288408804336],
        [0.0579594589071927, 0.612033824687883, -0.264955852739007, -0.311319076678992, 0.0791039175511519, -0.42154070789866, 0.498740943583768, 0.149122768756896]
      ]),
      octagonal: completeFrame(octagonal),
      alternate: completeFrame([
        [73 / 105, 67 / 105, 53 / 105, 17 / 105, -17 / 105, -53 / 105, -67 / 105, -73 / 105],
        [17 / 105, 53 / 105, 67 / 105, 73 / 105, 73 / 105, 67 / 105, 53 / 105, 17 / 105]
      ]),
      squares: completeFrame([
        [14, 8, 7, -1, -2, -4, -11, -13],
        [2, 4, 11, 13, 14, 8, 7, -1]
      ]),
      order24: completeFrame([
        [0.622590719424, 0.197882519146, 0.382279671629, -0.0424285286489, -0.0819656231869, -0.257885519793, -0.498196567588, -0.322276670982],
        [0.0819656231869, 0.257885519793, 0.498196567588, 0.322276670982, 0.622590719424, 0.197882519146, 0.382279671629, -0.0424285286489]
      ]),
      order20: completeFrame([
        [0.601080953882, 0.335124580762, 0.0791121819909, 0.141895965096, 0.0224741130161, -0.499494658874, -0.243482260103, -0.436710875769],
        [-0.0224741130161, 0.499494658874, 0.243482260103, 0.436710875769, 0.601080953882, 0.335124580762, 0.0791121819909, 0.141895965096]
      ]),
      order18: completeFrame([
        [0.56082647979, 0.243265683415, 0.56082647979, 0.0359925942184, -0.0359925942184, -0.243265683415, -0.353553390593, -0.353553390593],
        [0.0428943034666, 0.0988888398828, 0.365353986997, 0.693366972112, 0.285118681648, 0.507137130347, 0.204124145232, 0.204124145232]
      ]),
      order14: completeFrame([
        [0.788849359032, 0.267261241912, 0.333269317529, 0.118942442321, -0.118942442321, -0.333269317529, -0.267261241912, -0.214326875208],
        [0, 0.231920613924, 0.52112088917, 0.417906505941, 0.417906505941, 0.52112088917, 0.231920613924, 0]
      ]),
      generic: completeFrame([
        [0.61, -0.14, 0.29, 0.44, -0.36, 0.18, -0.39, 0.08],
        [0.12, 0.57, -0.31, 0.16, 0.38, -0.49, -0.07, 0.39]
      ]),
      dynkin: completeFrame([
        [-0.3057869969905157, 0.3303903818138703, 0.044212336343762065, 0.00045246660386328056, 0.3153490774511027, 0.7371596552522321, 0.07499501838252934, -0.38328569227452053],
        [-0.09599685994142494, -0.07173508233384833, 0.16559325210723239, 0.2383303893867979, 0.44535953881565066, 0.2203452650271114, -0.1488317849106884, 0.7952157734612486]
      ])
    };
  }

  var E8 = {
    EPSILON: EPSILON,
    FUNDAMENTAL_ROOTS: FUNDAMENTAL_ROOTS,
    COXETER_WORD: COXETER_WORD,
    dot: dot,
    length: length,
    buildRoots: buildRoots,
    buildEdges: buildEdges,
    buildCoxeterData: buildCoxeterData,
    rootKey: rootKey,
    rootKind: rootKind,
    reflected: reflected,
    orthonormalise: orthonormalise,
    completeFrame: completeFrame,
    copyFrame: copyFrame,
    rotateRows: rotateRows,
    alignFrame: alignFrame,
    interpolateFrames: interpolateFrames,
    makePresets: makePresets
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E8;
  global.E8 = E8;
})(typeof window === 'undefined' ? globalThis : window);
