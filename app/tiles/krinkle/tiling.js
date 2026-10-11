/* Modulo Krinkle tiling generator, run as a Web Worker by index.html and
   under Node by tools/krinkle/check.js. The specification is
   docs/krinkle.md; this file is its "The maths" section and Phase 1.

   One equilateral tile, set by three whole numbers m, k, t and an offset
   switch, fills the plane in a fan of congruent wedges that swirl round a
   centre. The same tile also tiles periodically (the Repeating arrangement).
   Every corner is a sum of unit steps in n directions, 2*pi/n apart.

   The tiling is never stored. A request for a square of the plane maps the
   square's corners into each wedge's lattice coordinates and enumerates the
   integer box that covers them, so a chunk costs time in proportion to the
   tiles in it.

   Tile record, 28 bytes, as docs/krinkle.md "Tile record" gives it:
     words 0-1  centre (x, y), float32, relative to the chunk origin
     words 2-3  row r and column c, int32
     word 4     turn in bits 0-7, lower boundary flag in bit 8, upper in bit 9
     words 5-6  reserved, zero
   The chunk origin is the square's lower left corner. */
(function (global) {
  'use strict';

  var MAX_K = 30;
  var MAX_N = 240;
  var TILES_PER_CHUNK = 2000;
  var EPS = 1e-9;

  // The presets of docs/krinkle.md, in the order the page lists them.
  // `source` names the figure each is checked against.
  var PRESETS = [
    { m: 3, k: 7, t: 2, offset: 1, source: '2025 Fig. 1b' },
    { m: 3, k: 7, t: 2, offset: 0, source: '2025 Fig. 1a' },
    { m: 5, k: 16, t: 2, offset: 1, source: '2025 Fig. 5f' },
    { m: 1, k: 4, t: 5, offset: 0, source: 'Bridges Fig. 6d' },
    { m: 2, k: 5, t: 2, offset: 0, source: '2025 Fig. 5a' },
    { m: 1, k: 4, t: 2, offset: 1, source: '2025 Fig. 5b' },
    { m: 3, k: 8, t: 3, offset: 0, source: '2025 Fig. 5c' },
    { m: 2, k: 9, t: 2, offset: 1, source: '2025 Fig. 5d' },
    { m: 7, k: 17, t: 2, offset: 0, source: '2025 Fig. 5e' },
    { m: 3, k: 4, t: 7, offset: 0, source: 'Bridges Fig. 6e' },
    { m: 2, k: 9, t: 3, offset: 0, source: 'Bridges Fig. 6f' },
    { m: 9, k: 10, t: 2, offset: 0, edgeShape: 'jigsaw', source: 'Bridges Fig. 6i' },
    { m: 1, k: 1, t: 16, offset: 1, source: 'Bridges Fig. 9a' }
  ];

  function gcd(a, b) { while (b) { var r = a % b; a = b; b = r; } return a; }
  function isInt(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }
  function mod(a, b) { return ((a % b) + b) % b; }

  // The number of directions, wedges and tile orientations.
  function directions(m, k, t, offset) { return offset ? 2 * (t * k - m) : t * k; }

  // The inverse of m modulo k, in 1 ... k - 1. For k = 1 there is none: 0.
  function inverse(m, k) {
    for (var x = 1; x < k; x++) if ((m * x) % k === 1) return x;
    return 0;
  }

  /* Null when the options are valid, otherwise a sentence naming the rule
     broken. */
  function validate(o) {
    o = o || {};
    var m = o.m, k = o.k, t = o.t, off = o.offset;
    if (off === true) off = 1;
    if (off === false || off === undefined) off = 0;
    if (!isInt(k) || k < 1 || k > MAX_K) return 'k must be a whole number from 1 to ' + MAX_K + '.';
    if (!isInt(t) || t < 2) return 't must be a whole number, 2 or more.';
    if (off !== 0 && off !== 1) return 'offset must be 0 or 1.';
    if (k === 1) {
      if (m !== 1) return 'm must be 1 when k is 1.';
    } else {
      if (!isInt(m) || m < 1 || m > k - 1) return 'm must be a whole number from 1 to k - 1.';
      if (gcd(m, k) !== 1) return 'm and k must have no common factor: gcd(' + m + ', ' + k + ') is ' + gcd(m, k) + '.';
    }
    var n = directions(m, k, t, off);
    if (n < 3) return 'n must be 3 or more: with k = 1, t must be 3 or more.';
    if (n > MAX_N) return 'n must be ' + MAX_N + ' or less: here n = ' + n + '.';
    var a = o.arrangement;
    if (a !== undefined && a !== 'fan' && a !== 'repeat') return 'arrangement must be "fan" or "repeat".';
    return null;
  }

  /* The symmetry (see engine/edges.js) that edge e takes, for Single or
     Double edges. Lower edges e = 0 ... k take 0 and upper edges take 3, a
     half turn, so any hump fits. Double takes 0 on every edge, because the S
     is unchanged by a half turn. */
  function edgeSymmetry(k, e, single) {
    return single && e > k ? 3 : 0;
  }

  /* ------------------------------------------------------------- build */

  function build(options) {
    var err = validate(options);
    if (err) throw new Error(err);
    var m = options.m, k = options.k, t = options.t;
    var offset = options.offset ? 1 : 0;
    var arrangement = options.arrangement || 'fan';
    var n = directions(m, k, t, offset);
    var w = offset ? n / 2 : k;           // wedges built by rule
    var minv = k === 1 ? 0 : inverse(m, k);

    // Unit vectors v_d = (cos 2 pi d / n, sin 2 pi d / n).
    var cs = new Float64Array(n), sn = new Float64Array(n);
    for (var d = 0; d < n; d++) { cs[d] = Math.cos(2 * Math.PI * d / n); sn[d] = Math.sin(2 * Math.PI * d / n); }
    function vx(d) { return cs[mod(d, n)]; }
    function vy(d) { return sn[mod(d, n)]; }

    // s_j = j m mod k, the lower and the upper sequences.
    var s = [];
    for (var j = 0; j < k; j++) s.push((j * m) % k);
    var lower = s.concat([k]);
    var upper = [k].concat(s.slice(1)).concat([0]);

    // Corners of the two paths, and the outline, anticlockwise.
    var P = [[0, 0]], U = [[0, 0]], i;
    for (i = 0; i <= k; i++) {
      P.push([P[i][0] + vx(lower[i]), P[i][1] + vy(lower[i])]);
      U.push([U[i][0] + vx(upper[i]), U[i][1] + vy(upper[i])]);
    }
    var Q = P[k + 1];
    var outline = P.slice();
    for (i = k; i >= 1; i--) outline.push(U[i]);
    var edgeCount = outline.length;       // 2k + 2

    // Edge e runs from outline[e] to outline[e + 1]. The lower edges
    // e = 0 ... k walk forwards along hour lower[e]. The upper edges
    // e = k + 1 ... 2k + 1 walk upper edge 2k + 1 - e backwards.
    var edgeHour = [];
    for (i = 0; i < edgeCount; i++) edgeHour.push(i <= k ? lower[i] : upper[2 * k + 1 - i]);

    var area = 0;
    for (i = 0; i < edgeCount; i++) {
      var a = outline[i], b = outline[(i + 1) % edgeCount];
      area += a[0] * b[1] - b[0] * a[1];
    }
    area /= 2;

    // The wedge lattice.
    var d0 = [0, 0];
    for (d = 0; d < k; d++) { d0[0] += vx(d); d0[1] += vy(d); }
    var d1 = [vx(k) - vx(0), vy(k) - vy(0)];
    var det = d0[0] * d1[1] - d0[1] * d1[0];
    var qx = Q[0] / 2, qy = Q[1] / 2;     // reference point, the tile's centre

    // The apex of wedge i by the front-tracking rule, for any i >= 0.
    // win(i, x) is the value congruent to x modulo k in i ... i + k - 1.
    function win(i, x) { return i + mod(x - i, k); }
    function jstar(i) { return k === 1 ? 0 : (i * minv) % k; }
    function ruleApex(i) {
      var x = 0, y = 0, js = jstar(i);
      for (var j = 0; j < js; j++) { var h = win(i, s[j]); x += vx(h); y += vy(h); }
      return [x, y];
    }

    // The front before wedge i as the 2025 paper draws it: the hours of one
    // period of steps, in the window i + 1 ... i + k. The step that starts
    // wedge i has the hour i + k. Summing it up to that step gives the same
    // apex as ruleApex, since no earlier step is congruent to i.
    function front(i) {
      var f = [];
      for (var j = 0; j < k; j++) f.push((i + 1) + mod(s[j] - (i + 1), k));
      return f;
    }

    var apex = [];
    for (i = 0; i < n; i++) {
      if (i < w) apex.push(ruleApex(i));
      else if (!offset) {
        // Wedge i is wedge (i mod k) turned about the origin by q k steps.
        var base = apex[i % k], qq = Math.floor(i / k) * k, c = cs[mod(qq, n)], sg = sn[mod(qq, n)];
        apex.push([c * base[0] - sg * base[1], sg * base[0] + c * base[1]]);
      } else {
        // Wedge i + n/2 is wedge i given a half turn about v_0 / 2.
        apex.push([vx(0) - apex[i - w][0], vy(0) - apex[i - w][1]]);
      }
    }
    var jstars = [];
    for (i = 0; i < n; i++) jstars.push(jstar(i));

    var centre = offset ? [vx(0) / 2, vy(0) / 2] : [0, 0];
    var Qlen = Math.hypot(Q[0], Q[1]);
    var circum = 0;
    outline.forEach(function (p) { circum = Math.max(circum, Math.hypot(p[0] - qx, p[1] - qy)); });
    var chunkSize = Math.sqrt(TILES_PER_CHUNK * Math.abs(area));

    // The distance from the origin to the segment d_0 to d_0 + d_1 bounds
    // how far row r lies from a wedge's apex: every tile of row r is at
    // least r * rho from it. The playback sizes its rows with this.
    var rho = Infinity;
    for (var u = 0; u <= 1000; u++) {
      rho = Math.min(rho, Math.hypot(d0[0] + d1[0] * u / 1000, d0[1] + d1[1] * u / 1000));
    }
    var apexMax = 0;
    apex.forEach(function (a) { apexMax = Math.max(apexMax, Math.hypot(a[0], a[1])); });
    // A tile at row r is within D + rowBase of the origin only if
    // r <= (D + rowBase) / rowStep, where D is how far from the centre the
    // screen reaches.
    var rowStep = rho * 0.999;
    var rowBase = circum + Math.hypot(centre[0], centre[1]) + apexMax + Qlen / 2;

    /* ---------------------------------------------------------- tiles */

    // A tile of the fan: the prototile shifted by r d_0 + c d_1 inside
    // wedge i, then turned by i steps about the origin and moved to the apex.
    function fanTile(i, r, c) {
      var lx = r * d0[0] + c * d1[0], ly = r * d0[1] + c * d1[1];
      var co = cs[i], si = sn[i], A = apex[i];
      var ox = A[0] + co * lx - si * ly, oy = A[1] + si * lx + co * ly;
      return {
        i: i, r: r, c: c, turn: i, q: Math.floor(i / w), j: i % w,
        lo: c === 0, hi: c === r,
        ox: ox, oy: oy,
        x: ox + co * qx - si * qy, y: oy + si * qx + co * qy
      };
    }
    // A tile of the repeating arrangement, all at turn 0.
    function repeatTile(a, b) {
      var ox = a * d0[0] + b * d1[0], oy = a * d0[1] + b * d1[1];
      return { i: 0, r: a, c: b, turn: 0, q: 0, j: 0, lo: false, hi: false, ox: ox, oy: oy, x: ox + qx, y: oy + qy };
    }

    // The tile's corners in the plane, in outline order.
    function corners(tile) {
      var co = cs[tile.turn], si = sn[tile.turn];
      return outline.map(function (p) {
        return [tile.ox + co * p[0] - si * p[1], tile.oy + si * p[0] + co * p[1]];
      });
    }

    function inBox(tile, box) {
      return tile.x >= box[0] && tile.x < box[2] && tile.y >= box[1] && tile.y < box[3];
    }

    /* Call emit(tile) for every tile whose centre lies in the half-open box
       [box[0], box[2]) x [box[1], box[3]). */
    function tilesInBox(box, emit) {
      var bx = [box[0], box[2], box[2], box[0]], by = [box[1], box[1], box[3], box[3]];
      var i, q, rmin, rmax, cmin, cmax, r, c, r0, r1, c0, c1, lx, ly, rr, cc, tile;
      if (arrangement === 'repeat') {
        rmin = cmin = Infinity; rmax = cmax = -Infinity;
        for (q = 0; q < 4; q++) {
          lx = bx[q] - qx; ly = by[q] - qy;
          rr = (lx * d1[1] - ly * d1[0]) / det; cc = (d0[0] * ly - d0[1] * lx) / det;
          rmin = Math.min(rmin, rr); rmax = Math.max(rmax, rr);
          cmin = Math.min(cmin, cc); cmax = Math.max(cmax, cc);
        }
        r0 = Math.ceil(rmin - EPS); r1 = Math.floor(rmax + EPS);
        c0 = Math.ceil(cmin - EPS); c1 = Math.floor(cmax + EPS);
        for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) {
          tile = repeatTile(r, c);
          if (inBox(tile, box)) emit(tile);
        }
        return;
      }
      for (i = 0; i < n; i++) {
        var co = cs[i], si = sn[i], A = apex[i];
        rmin = cmin = Infinity; rmax = cmax = -Infinity;
        for (q = 0; q < 4; q++) {
          // R_i^-1 (p - A_i) - Q/2, then solve r d_0 + c d_1 = that.
          var dx = bx[q] - A[0], dy = by[q] - A[1];
          lx = co * dx + si * dy - qx; ly = -si * dx + co * dy - qy;
          rr = (lx * d1[1] - ly * d1[0]) / det; cc = (d0[0] * ly - d0[1] * lx) / det;
          rmin = Math.min(rmin, rr); rmax = Math.max(rmax, rr);
          cmin = Math.min(cmin, cc); cmax = Math.max(cmax, cc);
        }
        r0 = Math.max(0, Math.ceil(rmin - EPS)); r1 = Math.floor(rmax + EPS);
        if (r1 < r0) continue;
        c0 = Math.max(0, Math.ceil(cmin - EPS)); c1 = Math.floor(cmax + EPS);
        for (r = r0; r <= r1; r++) {
          var ce = Math.min(r, c1);
          for (c = c0; c <= ce; c++) {
            tile = fanTile(i, r, c);
            if (inBox(tile, box)) emit(tile);
          }
        }
      }
    }

    /* The same tiles by brute force, for every tile whose centre lies within
       `radius` of the origin. It shares no enumeration code with
       tilesInBox, so the checks can compare the two. */
    function enumerate(radius, emit) {
      var i, r, c;
      if (arrangement === 'repeat') {
        var span = radius + Qlen;
        var amax = Math.ceil(span * Math.hypot(d1[0], d1[1]) / Math.abs(det)) + 1;
        var bmax = Math.ceil(span * Math.hypot(d0[0], d0[1]) / Math.abs(det)) + 1;
        for (r = -amax; r <= amax; r++) for (c = -bmax; c <= bmax; c++) {
          var tt = repeatTile(r, c);
          if (Math.hypot(tt.x, tt.y) <= radius) emit(tt);
        }
        return;
      }
      for (i = 0; i < n; i++) {
        var rmax = Math.floor((radius + Qlen / 2 + Math.hypot(apex[i][0], apex[i][1])) / rowStep) + 1;
        for (r = 0; r <= rmax; r++) for (c = 0; c <= r; c++) {
          var ft = fanTile(i, r, c);
          if (Math.hypot(ft.x, ft.y) <= radius) emit(ft);
        }
      }
    }

    /* The order tiles build in, as a sort key: [stage, r, c]. Without offset
       wedges 0 ... k - 1 build first, one by one, then every other copy
       together. With offset the first half builds wedge by wedge, then the
       other half together. Inside a stage tiles build row by row. */
    function constructionRank(tile) {
      return [tile.q === 0 ? tile.j : w, tile.r, tile.c];
    }

    /* A chunk, packed. `size` is the square's side, `i` and `j` its place. */
    function chunk(ci, cj, size) {
      var box = [ci * size, cj * size, (ci + 1) * size, (cj + 1) * size];
      var list = [];
      tilesInBox(box, function (tile) { list.push(tile); });
      var buf = new ArrayBuffer(list.length * 28);
      var f = new Float32Array(buf), iv = new Int32Array(buf), u = new Uint32Array(buf);
      // The engine reads four bounds, for p and zeta*r; r is always zero.
      var lo = [Infinity, Infinity, 0, 0], hi = [-Infinity, -Infinity, 0, 0];
      list.forEach(function (tile, idx) {
        var b = idx * 7, x = tile.x - box[0], y = tile.y - box[1];
        f[b] = x; f[b + 1] = y;
        iv[b + 2] = tile.r; iv[b + 3] = tile.c;
        u[b + 4] = (tile.turn & 255) | (tile.lo ? 256 : 0) | (tile.hi ? 512 : 0);
        lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y);
        hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y);
      });
      return { count: list.length, buffer: buf, P0: [box[0], box[1]], R0: [0, 0], lo: lo, hi: hi };
    }

    // The spiral arm counts of the Bridges paper, without offset and k > 1.
    var arms = (!offset && k > 1) ? { ccw: t * minv, cw: t * (k - minv) } : null;

    var info = {
      m: m, k: k, t: t, offset: offset, arrangement: arrangement,
      triple: [m, k, n], n: n, w: w, centre: centre,
      // For the engine: the angle of one turn is 2 pi / turns, and the view
      // opens on the centre of the tiling.
      turns: n, start: { P: centre.slice(), R: [0, 0] },
      edgeCount: edgeCount, outline: outline, edgeHour: edgeHour,
      Q: Q, Qlen: Qlen, d0: d0, d1: d1, area: area, circumradius: circum,
      jstar: jstars, apex: apex, arms: arms, rowStep: rowStep, rowBase: rowBase,
      symmetry: offset ? 2 : t,
      chunkSize: chunkSize
    };

    return {
      info: info,
      // Pieces the checks use.
      s: s, lower: lower, upper: upper, front: front, win: win, minv: minv,
      cs: cs, sn: sn, vx: vx, vy: vy,
      tilesInBox: tilesInBox, enumerate: enumerate, corners: corners,
      constructionRank: constructionRank, chunk: chunk,
      edgeSym: function (e, single) { return edgeSymmetry(k, e, single); }
    };
  }

  /* ------------------------------------------------------------ serving */

  /* Returns handle(message, reply). The worker is built on 'init' and
     answers 'chunk' requests. A bad option set answers {type: 'error'}. */
  function createHandler() {
    var ctx = null;
    return function handle(msg, reply) {
      if (msg.type === 'init') {
        try {
          ctx = build(msg.options || {});
        } catch (e) {
          ctx = null;
          reply({ type: 'error', message: e.message });
          return;
        }
        reply({ type: 'ready', info: ctx.info });
      } else if (msg.type === 'chunk' && ctx) {
        var size = msg.size || ctx.info.chunkSize;
        var res = ctx.chunk(msg.i, msg.j, size);
        reply({ type: 'chunk', i: msg.i, j: msg.j, count: res.count, buffer: res.buffer,
                P0: res.P0, R0: res.R0, lo: res.lo, hi: res.hi }, [res.buffer]);
      }
    };
  }

  var api = {
    PRESETS: PRESETS, MAX_K: MAX_K, MAX_N: MAX_N, TILES_PER_CHUNK: TILES_PER_CHUNK,
    validate: validate, directions: directions, inverse: inverse,
    edgeSymmetry: edgeSymmetry, build: build, createHandler: createHandler
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KrinkleTiling = api;

  if (typeof importScripts === 'function' && typeof window === 'undefined') {
    var handle = createHandler();
    global.onmessage = function (ev) {
      handle(ev.data, function (msg, transfer) { global.postMessage(msg, transfer || []); });
    };
  }
})(typeof self !== 'undefined' ? self : this);
