(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FractalModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Coordinates: the origin is the frame's centre, x points right and y
  // points up, and a positive angle turns anticlockwise. Both frames have
  // side 1. The square runs from (−1/2, −1/2) to (1/2, 1/2). The triangle's
  // centroid is the origin, so its apex is 2/3 of its height above it.
  var EPS = 1e-9;
  var TRI_H = Math.sqrt(3) / 2;

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

  // Corners in a fixed order, clockwise from the top: the square's top
  // left, top right, bottom right and bottom left; the triangle's apex,
  // bottom right and bottom left.
  function framePolygon(frame) {
    return frame === 'triangle'
      ? [[0, TRI_H * 2 / 3], [0.5, -TRI_H / 3], [-0.5, -TRI_H / 3]]
      : [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]];
  }

  function transformedFrame(frame, matrix) {
    return framePolygon(frame).map(function (p) { return apply(matrix, p); });
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

  // Andrew's monotone chain. Points are first rounded to 1e-12, so float
  // noise cannot sort two points that share an x out of order: with a
  // tolerance in the turn test, a corner sorted out of place is dropped.
  // The chain keeps only strict left turns. Then a corner within EPS of the
  // line through its neighbours lies on an edge, or on top of a neighbour,
  // and is removed; that moves the hull by at most EPS.
  function convexHull(points) {
    var round = function (v) { return Math.round(v * 1e12) / 1e12 + 0; };
    var pts = points.map(function (p) { return [round(p[0]), round(p[1])]; }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    var unique = pts.filter(function (p, i) { return !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]; });
    if (unique.length <= 2) return unique;
    var lower = [], upper = [], i;
    for (i = 0; i < unique.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], unique[i]) <= 0) lower.pop();
      lower.push(unique[i]);
    }
    for (i = unique.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], unique[i]) <= 0) upper.pop();
      upper.push(unique[i]);
    }
    lower.pop(); upper.pop();
    var hull = lower.concat(upper), straight = true;
    while (straight && hull.length > 3) {
      straight = false;
      for (i = 0; i < hull.length && hull.length > 3; i++) {
        var a = hull[(i + hull.length - 1) % hull.length], b = hull[i], c = hull[(i + 1) % hull.length];
        if (Math.abs(cross(a, b, c)) <= EPS * Math.hypot(c[0] - a[0], c[1] - a[1])) { hull.splice(i--, 1); straight = true; }
      }
    }
    return hull;
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

  // Expands a parent, splitting the largest copy first. A copy's size is
  // its largest singular value, sorted into bands about 9% wide. Within a
  // band copies split in the order they were made, so a rule whose copies
  // all shrink alike expands level by level.
  // A copy does not split past `depth` iterations, nor below `minScale` once
  // it is `minDepth` deep. The copy limit stops all splitting before the
  // drawing would hold more than `maxInstances` copies, and the time limit
  // stops it after `maxMs`. A copy left unsplit is drawn whole, so nothing
  // vanishes, and the copies left are all of a similar size: a rule with one
  // large and one small child spends its copies where they show.
  //
  // The result lists copies in the order they were made, so roughly largest
  // first, with each split's children together in child order. Putting the
  // whole result in strict child order, depth first, cost more than the
  // splitting itself, and only overlapping copies would show the difference.
  function expand(rule, start, depth, options) {
    options = options || {};
    var maxInstances = options.maxInstances || 60000;
    var maxMs = options.maxMs == null ? 250 : options.maxMs;
    var minScale = options.minScale || 0;
    var minDepth = Math.max(0, options.minDepth || 0);
    var cull = options.cull, started = Date.now(), byId = {};
    rule.letters.forEach(function (letter) { byId[letter.id] = letter; });
    // Every copy made goes in one list, in the order it was made. A split
    // copy is marked, and the copies left unmarked are the result.
    var root = { letter: start || rule.letters[0].id, matrix: identity(), path: '', level: 0, scale: 1, split: false }, all = [root];
    // A bucket queue: copies sorted into size bands an eighth of a power of
    // two wide, largest band first, first in first out within a band. This
    // is near enough largest-first, and far cheaper than a full sort.
    var BANDS = 8, buckets = [], heads = [], low = 0, offset = 64 * BANDS;
    function band(scale) { return Math.max(0, Math.min(400 * BANDS, offset + Math.floor(-Math.log2(Math.max(scale, 1e-300)) * BANDS))); }
    function push(node) {
      var b = band(node.scale);
      if (!buckets[b]) { buckets[b] = []; heads[b] = 0; }
      buckets[b].push(node); if (b < low) low = b;
    }
    function peek() {
      while (low < buckets.length) { var q = buckets[low]; if (q && heads[low] < q.length) return q[heads[low]]; low++; }
      return null;
    }
    function pop() { heads[low]++; }
    var count = 1, stoppedBy = null, hitDepth = false, hitScale = false, splits = 0, node;
    low = band(1); push(root);
    while ((node = peek())) {
      var parent = byId[node.letter];
      if (!parent || !parent.children.length) { pop(); continue; }
      if (node.level >= depth) { pop(); hitDepth = true; continue; }
      if (minScale && node.level >= minDepth && node.scale < minScale) { pop(); hitScale = true; continue; }
      if (maxMs && (++splits & 63) === 0 && Date.now() - started >= maxMs) { stoppedBy = 'time'; break; }
      var first = all.length;
      for (var j = 0; j < parent.children.length; j++) {
        var child = parent.children[j];
        var kid = { letter: child.letter, matrix: compose(node.matrix, child.matrix), path: node.path + j.toString(36), level: node.level + 1, scale: 0, split: false };
        // A branch wholly off screen is dropped: not drawn, not counted.
        if (cull && cull(kid)) continue;
        kid.scale = singularValues(kid.matrix)[0]; all.push(kid);
      }
      var made = all.length - first;
      if (count - 1 + made > maxInstances) { all.length = first; stoppedBy = 'copies'; break; }
      pop(); node.split = true; count += made - 1;
      for (j = first; j < all.length; j++) push(all[j]);
    }
    // One pass in the order made: largest first, near enough. Children of
    // one split sit together in child order.
    var result = [];
    for (var k = 0; k < all.length; k++) if (!all[k].split) result.push(all[k]);
    result.stoppedBy = stoppedBy || (hitScale ? 'scale' : hitDepth && depth > minDepth ? 'iterations' : null);
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
    // With one ratio r for every copy, the dimension is log ρ / log (1/r),
    // where ρ is the growth rate of the copy counts. Name it when both parts
    // are whole numbers, square roots or powers of the golden ratio.
    if (same) {
      var top = logName(spectralRadius(weightedMatrix(rule, 0)), true), bottom = logName(1 / ratios[0], false);
      if (top && bottom) exact = top + ' / ' + bottom;
    }
    return { value: value, exact: exact };
  }

  var GOLDEN = (1 + Math.sqrt(5)) / 2;
  function logName(x, allowGolden) {
    var near = function (a, b) { return Math.abs(a - b) < 1e-7 * Math.max(1, b); };
    if (near(x, Math.round(x)) && Math.round(x) > 1) return 'log ' + Math.round(x);
    if (near(x * x, Math.round(x * x)) && Math.round(x * x) > 1) return 'log √' + Math.round(x * x);
    for (var k = 1; allowGolden && k <= 6; k++) if (near(x, Math.pow(GOLDEN, k))) return (k > 1 ? k + ' ' : '') + 'log φ';
    return null;
  }

  // A disc for each parent that holds its frame and every copy below it, at
  // any depth: frame ⊆ disc, and each child map sends its letter's disc
  // inside this one. Discs are centred on the frame. The radii come from the
  // least solution of r = max(frame radius, |f(0)| + σ₁(f) r'), raised a
  // little and then checked, so a disc off screen proves its whole branch is
  // off screen. f(0) is the child's translation, since the frame's centre
  // is the origin. Returns null when no such discs exist, as for a rule
  // whose copies do not all shrink.
  function coverDiscs(rule) {
    var centre = [0, 0];
    var reach = Math.max.apply(null, framePolygon(rule.frame).map(function (p) { return Math.hypot(p[0], p[1]); }));
    var links = rule.letters.map(function (letter) {
      return letter.children.map(function (child) {
        var m = child.matrix;
        return { letter: child.letter, offset: Math.hypot(m[4], m[5]), scale: singularValues(m)[0] };
      });
    });
    if (links.some(function (list) { return list.some(function (l) { return l.scale >= 1 - EPS; }); })) return null;
    var radius = {}, ids = rule.letters.map(function (l) { return l.id; });
    ids.forEach(function (id) { radius[id] = reach; });
    var need = function (i) { return links[i].reduce(function (r, l) { return Math.max(r, l.offset + l.scale * (radius[l.letter] || reach)); }, reach); };
    for (var step = 0; step < 400; step++) {
      var moved = 0;
      ids.forEach(function (id, i) { var r = need(i); moved = Math.max(moved, r - radius[id]); radius[id] = Math.max(radius[id], r); });
      if (moved < 1e-12) break;
    }
    ids.forEach(function (id) { radius[id] = radius[id] * 1.001 + 1e-9; });
    if (ids.some(function (id, i) { return need(i) > radius[id] || !isFinite(radius[id]); })) return null;
    var discs = {};
    ids.forEach(function (id) { discs[id] = { centre: centre, radius: radius[id] }; });
    return discs;
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

  // The largest |eigenvalue| of a map's linear part.
  function eigenRadius(m) {
    var tr = m[0] + m[3], det = m[0] * m[3] - m[1] * m[2], disc = tr * tr / 4 - det;
    if (disc >= 0) { var root = Math.sqrt(disc); return Math.max(Math.abs(tr / 2 + root), Math.abs(tr / 2 - root)); }
    return Math.sqrt(Math.abs(det));
  }

  // Status follows the joint spectral radius of the linear parts along every
  // chain of children. A loop's largest eigenvalue, per level, is a lower
  // bound. The largest singular value over all chains of one length, per
  // level, is an upper bound. A single map's singular value can exceed one
  // while its eigenvalues stay below one (a strong skew), so neither number
  // alone decides. Translations never affect convergence.
  function growthBounds(rule, options) {
    options = options || {};
    var maxLength = options.maxLength || 10, cap = options.cap || 20000;
    var frontier = [], lower = 0, upper = Infinity, finite = false, length;
    rule.letters.forEach(function (letter) { frontier.push({ start: letter.id, letter: letter.id, m: identity() }); });
    for (length = 1; length <= maxLength; length++) {
      var next = [], levelMax = 0;
      for (var i = 0; i < frontier.length; i++) {
        var parent = rule.letters.find(function (l) { return l.id === frontier[i].letter; });
        if (!parent) continue;
        for (var j = 0; j < parent.children.length; j++) {
          var child = parent.children[j], m = compose(frontier[i].m, child.matrix);
          m = [m[0], m[1], m[2], m[3], 0, 0];
          levelMax = Math.max(levelMax, singularValues(m)[0]);
          if (child.letter === frontier[i].start) lower = Math.max(lower, Math.pow(eigenRadius(m), 1 / length));
          next.push({ start: frontier[i].start, letter: child.letter, m: m });
        }
      }
      if (!next.length) { finite = true; break; }
      upper = Math.min(upper, Math.pow(levelMax, 1 / length));
      if (next.length > cap) break;
      frontier = next;
    }
    return { lower: lower, upper: upper, finite: finite };
  }

  function status(rule) {
    var g = growthBounds(rule);
    if (g.finite) return { name: 'Converges', detail: 'The linked rule ends after finitely many levels.', lower: 0, upper: 0 };
    var out;
    if (g.lower > 1 + 1e-6) out = { name: 'Grows', detail: 'A loop grows by about ' + g.lower.toFixed(3) + '× per level, so there is no limit shape.' };
    else if (g.upper < 1 - 1e-9) out = { name: 'Converges', detail: 'Every chain shrinks. The slowest shrinks by about ' + g.lower.toFixed(3) + '× per level.' };
    else if (g.lower >= 1 - 1e-6) out = { name: 'Cycles', detail: 'A loop returns at the same size, so copies never shrink to points.' };
    else out = { name: 'Unclear', detail: 'Loops shrink by about ' + g.lower.toFixed(3) + '× per level, but some chains stretch first. Deeper levels decide.' };
    out.lower = g.lower; out.upper = g.upper;
    return out;
  }

  function bounds(points) {
    if (!points.length) return { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };
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

  // Cuts a convex polygon, anticlockwise, down to at most maxCorners
  // corners, and keeps everything it held. Each cut removes one edge: the
  // two edges either side of it are extended until they meet, and that
  // point replaces the edge's two ends. The cut that adds the least area
  // goes first. Two edges that turn through half a turn or more between
  // them never meet ahead, so that edge stays.
  function simplifyHull(hull, maxCorners) {
    var cap = Math.max(3, Math.round(maxCorners || 0));
    if (!maxCorners || hull.length <= cap) return hull;
    var poly = hull.slice();
    while (poly.length > cap) {
      var n = poly.length, best = -1, bestArea = Infinity, bestPoint = null;
      for (var i = 0; i < n; i++) {
        var a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n], d = poly[(i + 2) % n];
        // The meeting point is b + t (b − a) = c + u (c − d), with t and u above 0.
        var r = [b[0] - a[0], b[1] - a[1]], s = [c[0] - d[0], c[1] - d[1]], den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-18) continue;
        var w = [c[0] - b[0], c[1] - b[1]], t = (w[0] * s[1] - w[1] * s[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den;
        if (t < 0 || u < 0) continue;
        var p = [b[0] + t * r[0], b[1] + t * r[1]], added = Math.abs(cross(b, p, c)) / 2;
        if (added < bestArea) { bestArea = added; best = i; bestPoint = p; }
      }
      if (best < 0) break;
      if (best === n - 1) { poly[n - 1] = bestPoint; poly.shift(); }
      else poly.splice(best, 2, bestPoint);
    }
    return poly;
  }

  // Each parent's hull: the smallest convex polygon round its part of the
  // fractal, with at most maxCorners corners. A parent's hull is the hull
  // of its children's copies of their own parents' hulls, refined over and
  // over. The first hulls are big enough to hold the whole fractal: discs
  // that every child's copy maps back inside (see coverDiscs), each inside
  // the frame scaled up to fit round it. Every later hull then holds the
  // fractal too, and each round shrinks it towards the true hull. Where
  // no such discs exist, the first hulls are the frame at 10 times its
  // size. Refining stops after the given number of rounds, at the time
  // limit, or once no hull's area changes by more than 1 part in 10⁸ for
  // two rounds running. hulls.steps says how many rounds ran.
  function attractorHulls(rule, iterations, maxMs, maxCorners) {
    var hulls = {}, started = Date.now(), discs = coverDiscs(rule), frame = framePolygon(rule.frame);
    var inradius = rule.frame === 'triangle' ? TRI_H / 3 : 0.5;
    rule.letters.forEach(function (letter) {
      var grow = discs ? discs[letter.id].radius / inradius : 10;
      hulls[letter.id] = frame.map(function (p) { return [p[0] * grow, p[1] * grow]; });
    });
    var areas = {}, still = 0, step;
    for (step = 0; step < (iterations || 30); step++) {
      var next = {}, tooLarge = false, settled = true;
      rule.letters.forEach(function (letter) {
        var points = [];
        letter.children.forEach(function (child) {
          (hulls[child.letter] || frame).forEach(function (p) { points.push(apply(child.matrix, p)); });
        });
        if (points.length > 20000) tooLarge = true;
        var hull = points.length ? simplifyHull(convexHull(points), maxCorners) : [];
        var area = polygonArea(hull), before = areas[letter.id];
        if (before == null || Math.abs(area - before) > 1e-8 * Math.max(area, 1e-9)) settled = false;
        next[letter.id] = hull; areas[letter.id] = area;
      });
      if (tooLarge) break;
      hulls = next;
      still = settled ? still + 1 : 0;
      if (still >= 2) { step++; break; }
      if (maxMs && Date.now() - started >= maxMs) { step++; break; }
    }
    hulls.steps = step;
    return hulls;
  }

  function analyse(rule, start, depth, options) {
    options = options || {};
    // Analyse the deepest level that fits the limits. A cut-off level holds
    // only its first branches, which would skew the box count and the bounds.
    var stat = status(rule), level = depth || 7, leaves;
    for (;;) {
      leaves = enumerate(rule, start, level, { maxInstances: options.maxInstances || 60000, maxMs: options.maxMs || 0 });
      if (!leaves.clipped || level <= 1) break;
      level--;
    }
    // A converging rule with few copies per level goes deeper, while a whole
    // level holds at most 20,000 copies. The box count needs many more
    // sample points than boxes: the Dragon has only 128 copies at level 7.
    var target = Math.min(20000, options.maxInstances || 60000);
    while (stat.name === 'Converges' && !leaves.clipped && leaves.length && leaves.length * 2 <= target && level < 24) {
      var deeper = enumerate(rule, start, level + 1, { maxInstances: target, maxMs: options.maxMs || 0 });
      if (deeper.clipped || deeper.length <= leaves.length) break;
      leaves = deeper; level++;
    }
    var points = [], samples = [];
    leaves.forEach(function (item) {
      transformedFrame(rule.frame, item.matrix).forEach(function (p) { points.push(p); });
      // Each copy's centre, the image of the origin.
      samples.push([item.matrix[4], item.matrix[5]]);
    });
    var hulls = stat.name === 'Converges' ? attractorHulls(rule, options.hullIterations || 30, options.maxMs || 0, options.hullCorners) : null;
    var limitHull = hulls ? hulls[start] : null;
    var hull = limitHull && limitHull.length ? limitHull : simplifyHull(convexHull(points), options.hullCorners);
    var sim = similarityDimension(rule);
    var affinity = sim ? null : affinityDimension(rule, start, options);
    var formula = sim ? sim.value : affinity;
    var box = boxDimension(samples);
    var overlap = directOverlap(rule) || (formula != null && formula > 2 + 1e-6) ||
      // A box count on a 64 × 64 grid reads low for a solid shape with a rough
      // edge (the Dragon reads 1.75 for 2), so the gap must pass 0.35.
      (formula != null && box != null && formula - box > 0.35 && leaves.length > 100);
    return {
      status: stat, dimension: formula, exactDimension: sim && sim.exact,
      dimensionKind: sim ? 'Similarity' : 'Affinity estimate', boxDimension: box,
      // hulls holds every parent's hull, so copies can be drawn as hulls.
      hull: hull, hulls: hulls, hullArea: polygonArea(hull), overlap: overlap, instances: leaves.length,
      clipped: !!leaves.clipped, level: level,
      // The limit's hull contains the whole fractal, so it frames the camera.
      bounds: limitHull && limitHull.length ? bounds(limitHull) : bounds(points)
    };
  }

  function child(letter, matrix, extra) {
    return Object.assign({ id: Math.random().toString(36).slice(2, 9), letter: letter, matrix: matrix }, extra || {});
  }

  // grid is the editor's snap grid; it guides dragging and never moves a child.
  function baseRule(frame, letters) {
    return { version: 3, frame: frame, grid: { rows: 2, cols: 2, side: 2 }, letters: letters };
  }

  // A child map scaled by s, then turned by quarter turns anticlockwise,
  // with its centre at (x, y).
  function placed(s, quarters, x, y) {
    var c = [1, 0, -1, 0][quarters % 4], n = [0, 1, 0, -1][quarters % 4];
    return [s * c, s * n, -s * n, s * c, x, y];
  }

  // Example rules. The model and browser checks build on them. The
  // Sierpinski Sieve preset in presets.js is the gasket.
  function examples() {
    // Three half-size copies, with the top-right quarter empty.
    var sieve = baseRule('square', [{ id: 'p1', children: [
      child('p1', placed(0.5, 0, -0.25, 0.25)),
      child('p1', placed(0.5, 0, -0.25, -0.25)),
      child('p1', placed(0.5, 0, 0.25, -0.25))
    ] }]);
    // The equilateral Sierpinski triangle: a half-size copy in each corner,
    // centred halfway from the centre to that corner.
    var gasket = baseRule('triangle', [{ id: 'p1', children: [
      child('p1', placed(0.5, 0, 0, TRI_H / 3)),
      child('p1', placed(0.5, 0, -0.25, -TRI_H / 6)),
      child('p1', placed(0.5, 0, 0.25, -TRI_H / 6))
    ] }]);
    // Parent 1 makes a 1 and a 2 along the bottom. Parent 2 makes a 1 turned
    // clockwise at the top left, a 2 turned anticlockwise at the bottom left
    // and a 2 turned halfway round at the bottom right.
    var linked = baseRule('square', [
      { id: 'p1', children: [
        child('p1', placed(0.5, 0, -0.25, -0.25)),
        child('p2', placed(0.5, 0, 0.25, -0.25))
      ] },
      { id: 'p2', children: [
        child('p1', placed(0.5, 3, -0.25, 0.25)),
        child('p2', placed(0.5, 1, -0.25, -0.25)),
        child('p2', placed(0.5, 2, 0.25, -0.25))
      ] }
    ]);
    var free = baseRule('square', [{ id: 'p1', children: [
      child('p1', [0.64, -0.22, 0.22, 0.64, -0.11, 0.1]),
      child('p1', [0.36, 0.18, -0.18, 0.36, 0.33, -0.02]),
      child('p1', [-0.25, -0.08, -0.08, 0.25, -0.205, -0.375])
    ] }]);
    return { sieve: sieve, gasket: gasket, linked: linked, free: free };
  }

  // Parents carry internal ids, p1, p2 and so on. A parent's number on screen
  // is its position in the list, so reordering never rewrites references.
  function nextId(rule) {
    for (var i = 1; ; i++) if (!rule.letters.some(function (l) { return l.id === 'p' + i; })) return 'p' + i;
  }

  return {
    EPS: EPS, TRI_H: TRI_H, clone: clone, identity: identity,
    compose: compose, apply: apply, determinant: determinant, singularValues: singularValues,
    isSimilarity: isSimilarity, framePolygon: framePolygon, transformedFrame: transformedFrame,
    polygonArea: polygonArea, convexHull: convexHull, simplifyHull: simplifyHull, intersectionArea: intersectionArea,
    enumerate: enumerate, expand: expand, spectralRadius: spectralRadius, similarityDimension: similarityDimension,
    affinityDimension: affinityDimension, status: status, growthBounds: growthBounds, eigenRadius: eigenRadius, bounds: bounds, boxDimension: boxDimension,
    coverDiscs: coverDiscs, analyse: analyse, directOverlap: directOverlap, attractorHulls: attractorHulls, child: child, baseRule: baseRule,
    examples: examples, nextId: nextId
  };
});
