(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FractalModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;
  var TRI_H = Math.sqrt(3) / 2;
  var LETTERS = ['F', 'R', 'P', 'G', 'J', 'L', 'Q', 'A·', 'B·', 'C·'];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function identity() { return [1, 0, 0, 1, 0, 0]; }

  function compose(p, q) {
    return [
      p[0] * q[0] + p[2] * q[1],
      p[1] * q[0] + p[3] * q[1],
      p[0] * q[2] + p[2] * q[3],
      p[1] * q[2] + p[3] * q[3],
      p[0] * q[4] + p[2] * q[5] + p[4],
      p[1] * q[4] + p[3] * q[5] + p[5]
    ];
  }

  function apply(m, p) {
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  }

  function determinant(m) { return m[0] * m[3] - m[1] * m[2]; }

  function singularValues(m) {
    var aa = m[0] * m[0] + m[1] * m[1];
    var bb = m[2] * m[2] + m[3] * m[3];
    var ab = m[0] * m[2] + m[1] * m[3];
    var middle = (aa + bb) / 2;
    var spread = Math.sqrt(Math.max(0, (aa - bb) * (aa - bb) / 4 + ab * ab));
    return [Math.sqrt(Math.max(0, middle + spread)), Math.sqrt(Math.max(0, middle - spread))];
  }

  function isSimilarity(m, tolerance) {
    var s = singularValues(m);
    return Math.abs(s[0] - s[1]) <= (tolerance || 1e-7) * Math.max(1, s[0]);
  }

  function framePolygon(frame) {
    return frame === 'triangle'
      ? [[0.5, 0], [1, TRI_H], [0, TRI_H]]
      : [[0, 0], [1, 0], [1, 1], [0, 1]];
  }

  function transformedFrame(frame, matrix) {
    return framePolygon(frame).map(function (p) { return apply(matrix, p); });
  }

  function squareOrientation(turn, flip) {
    var rotations = [
      [1, 0, 0, 1, 0, 0], [0, 1, -1, 0, 1, 0],
      [-1, 0, 0, -1, 1, 1], [0, -1, 1, 0, 0, 1]
    ];
    var reflected = flip ? [-1, 0, 0, 1, 1, 0] : identity();
    return compose(rotations[((turn % 4) + 4) % 4], reflected);
  }

  function squareGridMap(cell, rows, cols, turn, flip, blockRows, blockCols) {
    var br = Math.max(1, blockRows || 1), bc = Math.max(1, blockCols || br);
    var box = [bc / cols, 0, 0, br / rows, cell.col / cols, cell.row / rows];
    return compose(box, squareOrientation(turn || 0, !!flip));
  }

  function trianglePoint(i, j, n) {
    return [0.5 + (j - i) / (2 * n), TRI_H * (i + j) / n];
  }

  function triangleCells(n) {
    var cells = [], i, j;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n - i; j++) {
        cells.push({ i: i, j: j, n: n, down: false, vertices: [
          trianglePoint(i, j, n), trianglePoint(i, j + 1, n), trianglePoint(i + 1, j, n)
        ] });
        if (i + j <= n - 2) cells.push({ i: i, j: j, n: n, down: true, vertices: [
          trianglePoint(i, j + 1, n), trianglePoint(i + 1, j + 1, n), trianglePoint(i + 1, j, n)
        ] });
      }
    }
    return cells;
  }

  function affineFromTriangles(source, target) {
    var sx1 = source[1][0] - source[0][0], sy1 = source[1][1] - source[0][1];
    var sx2 = source[2][0] - source[0][0], sy2 = source[2][1] - source[0][1];
    var tx1 = target[1][0] - target[0][0], ty1 = target[1][1] - target[0][1];
    var tx2 = target[2][0] - target[0][0], ty2 = target[2][1] - target[0][1];
    var det = sx1 * sy2 - sx2 * sy1;
    var ia = sy2 / det, ib = -sy1 / det, ic = -sx2 / det, id = sx1 / det;
    var a = tx1 * ia + tx2 * ib, c = tx1 * ic + tx2 * id;
    var b = ty1 * ia + ty2 * ib, d = ty1 * ic + ty2 * id;
    return [a, b, c, d, target[0][0] - a * source[0][0] - c * source[0][1],
      target[0][1] - b * source[0][0] - d * source[0][1]];
  }

  function triangleGridMap(cell, turn, flip, block) {
    var source = framePolygon('triangle');
    var target = cell.vertices.map(function (p) { return p.slice(); });
    var scale = Math.max(1, block || 1);
    if (scale > 1 && cell.n) {
      target = cell.down ? [
        trianglePoint(cell.i, cell.j + scale, cell.n),
        trianglePoint(cell.i + scale, cell.j + scale, cell.n),
        trianglePoint(cell.i + scale, cell.j, cell.n)
      ] : [
        trianglePoint(cell.i, cell.j, cell.n),
        trianglePoint(cell.i, cell.j + scale, cell.n),
        trianglePoint(cell.i + scale, cell.j, cell.n)
      ];
    }
    var order = [0, 1, 2], t = ((turn || 0) % 3 + 3) % 3;
    order = order.map(function (_, k) { return (k + t) % 3; });
    if (flip) order = [order[0], order[2], order[1]];
    return affineFromTriangles(source, order.map(function (k) { return target[k]; }));
  }

  function polygonArea(poly) {
    var sum = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      sum += p[0] * q[1] - p[1] * q[0];
    }
    return Math.abs(sum) / 2;
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }

  function convexHull(points) {
    var pts = points.map(function (p) { return p.slice(); }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    var unique = pts.filter(function (p, i) { return !i || Math.abs(p[0] - pts[i - 1][0]) > EPS || Math.abs(p[1] - pts[i - 1][1]) > EPS; });
    if (unique.length <= 2) return unique;
    var lower = [], upper = [], i;
    for (i = 0; i < unique.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], unique[i]) <= EPS) lower.pop();
      lower.push(unique[i]);
    }
    for (i = unique.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], unique[i]) <= EPS) upper.pop();
      upper.push(unique[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function signedArea(poly) {
    var sum = 0;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length];
      sum += p[0] * q[1] - p[1] * q[0];
    }
    return sum / 2;
  }

  function lineIntersection(a, b, p, q) {
    var r = [b[0] - a[0], b[1] - a[1]], s = [q[0] - p[0], q[1] - p[1]];
    var den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < EPS) return b.slice();
    var t = ((p[0] - a[0]) * s[1] - (p[1] - a[1]) * s[0]) / den;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  }

  function intersectionArea(subject, clip) {
    var output = subject.slice(), orientation = signedArea(clip) >= 0 ? 1 : -1;
    for (var j = 0; j < clip.length && output.length; j++) {
      var cp1 = clip[j], cp2 = clip[(j + 1) % clip.length], input = output.slice();
      output = [];
      for (var i = 0; i < input.length; i++) {
        var s = input[i], e = input[(i + 1) % input.length];
        var sin = orientation * cross(cp1, cp2, s) >= -EPS;
        var ein = orientation * cross(cp1, cp2, e) >= -EPS;
        if (ein) {
          if (!sin) output.push(lineIntersection(s, e, cp1, cp2));
          output.push(e);
        } else if (sin) output.push(lineIntersection(s, e, cp1, cp2));
      }
    }
    return output.length >= 3 ? polygonArea(output) : 0;
  }

  function enumerate(rule, start, depth, cap) {
    var settings = typeof cap === 'object' ? cap : { maxInstances: cap };
    var current = [{ letter: start || rule.letters[0].id, matrix: identity(), path: '' }];
    var limit = settings.maxInstances || 60000, maxMs = settings.maxMs || 0, started = Date.now(), clipped = false, stoppedBy = null;
    for (var level = 0; level < depth; level++) {
      var next = [];
      for (var i = 0; i < current.length && next.length < limit; i++) {
        var parent = rule.letters.find(function (l) { return l.id === current[i].letter; });
        if (!parent) continue;
        for (var j = 0; j < parent.children.length; j++) {
          if (next.length >= limit) { clipped = true; break; }
          var child = parent.children[j];
          next.push({ letter: child.letter, matrix: compose(current[i].matrix, child.matrix), path: current[i].path + j.toString(36) });
          if (maxMs && Date.now() - started >= maxMs) { clipped = true; stoppedBy = 'time'; break; }
        }
        if (stoppedBy) break;
      }
      current = next;
      if (stoppedBy) break;
      if (!current.length) break;
    }
    current.clipped = clipped;
    current.stoppedBy = stoppedBy || (clipped ? 'copies' : null);
    return current;
  }

  function expand(rule, start, depth, options) {
    options = options || {};
    var maxInstances = options.maxInstances || 60000;
    var maxMs = options.maxMs == null ? 250 : options.maxMs;
    var minScale = options.minScale || 0;
    var minDepth = Math.max(0, options.minDepth || 0);
    var started = Date.now(), terminal = [];
    var frontier = [{ letter: start || rule.letters[0].id, matrix: identity(), path: '', level: 0 }];
    var result = [], stoppedBy = null;
    for (var level = 0; level < depth && frontier.length; level++) {
      var next = [];
      for (var i = 0; i < frontier.length; i++) {
        var parent = rule.letters.find(function (letter) { return letter.id === frontier[i].letter; });
        if (!parent || !parent.children.length) { terminal.push(frontier[i]); continue; }
        for (var j = 0; j < parent.children.length; j++) {
          var child = parent.children[j];
          var item = { letter: child.letter, matrix: compose(frontier[i].matrix, child.matrix),
            path: frontier[i].path + j.toString(36), level: level + 1 };
          var scale = singularValues(item.matrix)[0];
          if (level + 1 >= minDepth && minScale && scale < minScale) terminal.push(item);
          else next.push(item);
          if (terminal.length + next.length >= maxInstances) { stoppedBy = 'copies'; break; }
          if (maxMs && Date.now() - started >= maxMs) { stoppedBy = 'time'; break; }
        }
        if (stoppedBy) break;
      }
      if (stoppedBy) { result = terminal.concat(next); break; }
      frontier = next;
      if (!frontier.length) { result = terminal; break; }
      if (level === depth - 1) result = terminal.concat(frontier);
    }
    if (!result.length) result = terminal.concat(frontier);
    if (!stoppedBy && minScale && terminal.some(function (item) { return item.level < depth; })) stoppedBy = 'scale';
    result.stoppedBy = stoppedBy || (depth <= minDepth ? null : 'iterations');
    result.targetDepth = depth;
    return result;
  }

  function spectralRadius(matrix) {
    var n = matrix.length;
    if (!n) return 0;
    var v = Array(n).fill(1 / Math.sqrt(n)), lambda = 0;
    for (var k = 0; k < 100; k++) {
      var w = matrix.map(function (row) { return row.reduce(function (s, x, i) { return s + x * v[i]; }, 0); });
      var norm = Math.max.apply(null, w.map(Math.abs));
      if (norm < EPS) return 0;
      v = w.map(function (x) { return x / norm; });
      lambda = norm;
    }
    return lambda;
  }

  function weightedMatrix(rule, exponent) {
    var ids = rule.letters.map(function (l) { return l.id; });
    return rule.letters.map(function (letter) {
      return ids.map(function (id) {
        return letter.children.reduce(function (sum, child) {
          if (child.letter !== id) return sum;
          return sum + Math.pow(singularValues(child.matrix)[0], exponent);
        }, 0);
      });
    });
  }

  function similarityDimension(rule) {
    var maps = [];
    rule.letters.forEach(function (l) { l.children.forEach(function (c) { maps.push(c.matrix); }); });
    if (!maps.length || maps.some(function (m) { return !isSimilarity(m) || singularValues(m)[0] >= 1 - EPS; })) return null;
    var lo = 0, hi = 8;
    if (spectralRadius(weightedMatrix(rule, 0)) <= 1 + EPS) return 0;
    for (var i = 0; i < 70; i++) {
      var mid = (lo + hi) / 2;
      if (spectralRadius(weightedMatrix(rule, mid)) > 1) lo = mid; else hi = mid;
    }
    var value = (lo + hi) / 2;
    var ratios = maps.map(function (m) { return singularValues(m)[0]; });
    var same = ratios.every(function (r) { return Math.abs(r - ratios[0]) < 1e-8; });
    var exact = null;
    if (same && rule.letters.length === 1) {
      var count = rule.letters[0].children.length, inverse = 1 / ratios[0];
      var rounded = Math.round(inverse);
      if (Math.abs(inverse - rounded) < 1e-8) exact = 'log ' + count + ' / log ' + rounded;
    }
    return { value: value, exact: exact };
  }

  function phi(s1, s2, exponent) {
    if (exponent <= 1) return Math.pow(s1, exponent);
    if (exponent <= 2) return s1 * Math.pow(s2, exponent - 1);
    return Math.pow(s1 * s2, exponent / 2);
  }

  function affinityDimension(rule, start, options) {
    options = options || {};
    var depth = 6, paths = enumerate(rule, start, depth,
      { maxInstances: options.maxInstances || 100000, maxMs: options.maxMs || 0 });
    if (!paths.length || paths.clipped) return null;
    var pressure = function (s) {
      var sum = paths.reduce(function (total, item) {
        var sv = singularValues(item.matrix);
        return total + phi(sv[0], sv[1], s);
      }, 0);
      return Math.pow(sum, 1 / depth);
    };
    var lo = 0, hi = 4;
    if (pressure(0) <= 1) return 0;
    for (var i = 0; i < 55; i++) {
      var mid = (lo + hi) / 2;
      if (pressure(mid) > 1) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function cycleProducts(rule) {
    var ids = rule.letters.map(function (l) { return l.id; }), products = [];
    ids.forEach(function (start) {
      function visit(letterId, matrix, visited, depth) {
        var letter = rule.letters.find(function (l) { return l.id === letterId; });
        if (!letter || depth > ids.length) return;
        letter.children.forEach(function (child) {
          var product = compose(matrix, child.matrix);
          if (child.letter === start) products.push(product);
          else if (!visited[child.letter]) {
            var next = Object.assign({}, visited); next[child.letter] = true;
            visit(child.letter, product, next, depth + 1);
          }
        });
      }
      var seen = {}; seen[start] = true;
      visit(start, identity(), seen, 1);
    });
    return products;
  }

  function status(rule) {
    var cycles = cycleProducts(rule);
    if (!cycles.length) return { name: 'Converges', detail: 'The linked rule ends after finitely many levels.' };
    var max = 0, min = Infinity, anisotropic = false;
    cycles.forEach(function (m) {
      var sv = singularValues(m); max = Math.max(max, sv[0]); min = Math.min(min, sv[0]);
      if (sv[0] > 1 + 1e-6 && sv[1] < 1 - 1e-6) anisotropic = true;
    });
    if (anisotropic && rule.toggles && rule.toggles.stretch) return { name: 'Unclear', detail: 'Some chains stretch one direction and shrink another.' };
    if (max > 1 + 1e-6) return { name: 'Grows', detail: 'A loop expands by up to ' + max.toFixed(3) + '×.' };
    if (max >= 1 - 1e-6) return { name: 'Cycles', detail: 'A loop returns at the same size.' };
    return { name: 'Converges', detail: 'Every loop shrinks; the largest factor is ' + max.toFixed(3) + '.' };
  }

  function bounds(points) {
    if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return points.reduce(function (b, p) {
      b.minX = Math.min(b.minX, p[0]); b.minY = Math.min(b.minY, p[1]);
      b.maxX = Math.max(b.maxX, p[0]); b.maxY = Math.max(b.maxY, p[1]); return b;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  function boxDimension(points) {
    if (points.length < 8) return null;
    var b = bounds(points), width = Math.max(EPS, b.maxX - b.minX), height = Math.max(EPS, b.maxY - b.minY);
    var samples = [8, 16, 32, 64].map(function (n) {
      var boxes = {};
      points.forEach(function (p) {
        var x = Math.min(n - 1, Math.max(0, Math.floor((p[0] - b.minX) / width * n)));
        var y = Math.min(n - 1, Math.max(0, Math.floor((p[1] - b.minY) / height * n)));
        boxes[x + ':' + y] = true;
      });
      return [Math.log(n), Math.log(Object.keys(boxes).length)];
    });
    var mx = samples.reduce(function (s, p) { return s + p[0]; }, 0) / samples.length;
    var my = samples.reduce(function (s, p) { return s + p[1]; }, 0) / samples.length;
    var num = 0, den = 0;
    samples.forEach(function (p) { num += (p[0] - mx) * (p[1] - my); den += (p[0] - mx) * (p[0] - mx); });
    return den ? Math.max(0, Math.min(2, num / den)) : null;
  }

  function directOverlap(rule) {
    return rule.letters.some(function (letter) {
      var polygons = letter.children.map(function (child) { return transformedFrame(rule.frame, child.matrix); });
      for (var i = 0; i < polygons.length; i++) for (var j = i + 1; j < polygons.length; j++) {
        if (intersectionArea(polygons[i], polygons[j]) > 1e-7) return true;
      }
      return false;
    });
  }

  function attractorHulls(rule, iterations, maxMs) {
    var hulls = {};
    var started = Date.now();
    rule.letters.forEach(function (letter) { hulls[letter.id] = framePolygon(rule.frame); });
    for (var step = 0; step < (iterations || 30); step++) {
      var next = {}, tooLarge = false;
      rule.letters.forEach(function (letter) {
        var points = [];
        letter.children.forEach(function (child) {
          (hulls[child.letter] || framePolygon(rule.frame)).forEach(function (p) { points.push(apply(child.matrix, p)); });
        });
        if (points.length > 20000) tooLarge = true;
        next[letter.id] = points.length ? convexHull(points) : [];
      });
      if (tooLarge) break;
      hulls = next;
      if (maxMs && Date.now() - started >= maxMs) break;
    }
    return hulls;
  }

  function analyse(rule, start, depth, options) {
    options = options || {};
    var stat = status(rule), leaves = enumerate(rule, start, depth || 7,
      { maxInstances: options.maxInstances || 60000, maxMs: options.maxMs || 0 });
    var points = [], samples = [];
    leaves.forEach(function (item) {
      transformedFrame(rule.frame, item.matrix).forEach(function (p) { points.push(p); });
      samples.push(apply(item.matrix, rule.frame === 'triangle' ? [0.5, TRI_H * 2 / 3] : [0.5, 0.5]));
    });
    var limitHull = stat.name === 'Converges' ? attractorHulls(rule, options.hullIterations || 32, options.maxMs || 0)[start] : null;
    var hull = limitHull && limitHull.length ? limitHull : convexHull(points);
    var sim = similarityDimension(rule);
    var affinity = sim ? null : affinityDimension(rule, start, options);
    var formula = sim ? sim.value : affinity;
    var box = boxDimension(samples);
    var overlap = directOverlap(rule) || (formula != null && formula > 2 + 1e-6) ||
      (formula != null && box != null && formula - box > 0.25 && leaves.length > 100);
    return {
      status: stat, dimension: formula, exactDimension: sim && sim.exact,
      dimensionKind: sim ? 'Similarity' : 'Affinity estimate', boxDimension: box,
      hull: hull, hullArea: polygonArea(hull), overlap: overlap, instances: leaves.length,
      clipped: !!leaves.clipped, bounds: bounds(points)
    };
  }

  function child(letter, matrix, extra) {
    return Object.assign({ id: Math.random().toString(36).slice(2, 9), letter: letter, matrix: matrix }, extra || {});
  }

  function baseRule(frame, mode, letters) {
    return {
      version: 1, frame: frame, mode: mode, grid: { rows: 2, cols: 2, perLetter: {} },
      toggles: { stretch: false, blocks: false, stacking: false, gridPerLetter: false },
      letters: letters
    };
  }

  function demos() {
    var sieve = baseRule('square', 'square', [{ id: 'F', children: [
      child('F', squareGridMap({ row: 0, col: 0 }, 2, 2), { cell: { row: 0, col: 0 }, turn: 0, flip: false, block: 1 }),
      child('F', squareGridMap({ row: 1, col: 0 }, 2, 2), { cell: { row: 1, col: 0 }, turn: 0, flip: false, block: 1 }),
      child('F', squareGridMap({ row: 1, col: 1 }, 2, 2), { cell: { row: 1, col: 1 }, turn: 0, flip: false, block: 1 })
    ] }]);
    var linked = baseRule('square', 'square', [
      { id: 'F', children: [
        child('F', squareGridMap({ row: 1, col: 0 }, 2, 2), { cell: { row: 1, col: 0 }, turn: 0, flip: false, block: 1 }),
        child('R', squareGridMap({ row: 1, col: 1 }, 2, 2), { cell: { row: 1, col: 1 }, turn: 0, flip: false, block: 1 })
      ] },
      { id: 'R', children: [
        child('F', squareGridMap({ row: 0, col: 0 }, 2, 2, 1), { cell: { row: 0, col: 0 }, turn: 1, flip: false, block: 1 }),
        child('R', squareGridMap({ row: 1, col: 0 }, 2, 2, 3), { cell: { row: 1, col: 0 }, turn: 3, flip: false, block: 1 }),
        child('R', squareGridMap({ row: 1, col: 1 }, 2, 2, 2), { cell: { row: 1, col: 1 }, turn: 2, flip: false, block: 1 })
      ] }
    ]);
    var free = baseRule('square', 'free', [{ id: 'F', children: [
      child('F', [0.64, 0.22, -0.22, 0.64, 0.18, -0.03]),
      child('F', [0.36, -0.18, 0.18, 0.36, 0.56, 0.43]),
      child('F', [-0.25, 0.08, 0.08, 0.25, 0.38, 0.71])
    ] }]);
    return { sieve: sieve, linked: linked, free: free };
  }

  function nextLetter(rule) {
    for (var i = 0; i < LETTERS.length; i++) if (!rule.letters.some(function (l) { return l.id === LETTERS[i]; })) return LETTERS[i];
    return 'X' + (rule.letters.length + 1);
  }

  return {
    EPS: EPS, TRI_H: TRI_H, LETTERS: LETTERS, clone: clone, identity: identity,
    compose: compose, apply: apply, determinant: determinant, singularValues: singularValues,
    isSimilarity: isSimilarity, framePolygon: framePolygon, transformedFrame: transformedFrame,
    squareOrientation: squareOrientation, squareGridMap: squareGridMap,
    triangleCells: triangleCells, triangleGridMap: triangleGridMap, affineFromTriangles: affineFromTriangles,
    polygonArea: polygonArea, convexHull: convexHull, intersectionArea: intersectionArea,
    enumerate: enumerate, expand: expand, spectralRadius: spectralRadius, similarityDimension: similarityDimension,
    affinityDimension: affinityDimension, status: status, bounds: bounds, boxDimension: boxDimension,
    analyse: analyse, directOverlap: directOverlap, attractorHulls: attractorHulls, child: child, baseRule: baseRule,
    demos: demos, nextLetter: nextLetter
  };
});
