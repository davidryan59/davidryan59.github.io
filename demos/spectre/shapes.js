/* Edge shapes for the Spectre page. Every shape starts as a hump: a path
   from (0, 0) to (L, 0) that rises to height H on one side. Two
   arrangements turn humps into edges:

   - Double: a hump, then the same hump turned half a turn about the middle
     of the edge, making an S. Two neighbouring tiles run along a shared edge
     in opposite directions, and this curve looks the same from both ends,
     so every edge matches.
   - Single: one hump along the whole edge, placed forwards on even edges
     and backwards on odd ones. Every shared edge joins an even edge to an
     odd one, so here too the two tiles draw the same curve.

   Line keeps every edge straight, as does a height of zero. Shapes that
   are special cases of another were folded into it: Parabola
   into Curve, Sawtooth into Triangle, Square into Trapezium. OLD maps their
   ids for saved settings and old links.

   Points are in edge units: u runs along the edge from 0 to 1, and v runs
   sideways, towards the tile's inside when positive. */
(function (global) {
  'use strict';

  var SHAPES = [
    { id: 'line', name: 'Line', params: [] },
    { id: 'curve', name: 'Curve', params: ['waves'] },
    { id: 'triangle', name: 'Triangle', params: ['peak'], set: { peak: 0.5 } },
    { id: 'trapezium', name: 'Trapezium', params: ['rise', 'fall'], set: { rise: 0.2, fall: 0.2 } },
    { id: 'jigsaw', name: 'Jigsaw', params: ['neck'] }
  ];
  var BY_ID = {};
  SHAPES.forEach(function (s) { BY_ID[s.id] = s; });
  // Old shape ids: the shape each became and the settings that reproduce it.
  var OLD = {
    sine: { shape: 'curve' },
    parabola: { shape: 'curve', params: { waves: 1 } },
    skew: { shape: 'triangle' },
    sawtooth: { shape: 'triangle', params: { peak: 1 } },
    square: { shape: 'trapezium', params: { rise: 0, fall: 0 } }
  };
  var DEFAULTS = { waves: 1, peak: 0.5, rise: 0.2, fall: 0.2, neck: 0.55 };

  // One hump of length L and height H. n sets how finely curves are sampled.
  function hump(kind, prm, L, H, n) {
    var out = [], i, t;
    switch (kind) {
      // Half a sine wave. Humps join with no kink and no jump in curvature.
      case 'curve':
        for (i = 0; i <= n; i++) { t = i / n; out.push([t * L, H * Math.sin(Math.PI * t)]); }
        return out;
      case 'triangle':
        return [[0, 0], [prm.peak * L, H], [L, 0]];
      case 'trapezium':
        return [[0, 0], [prm.rise * L, H], [(1 - prm.fall) * L, H], [L, 0]];
      case 'jigsaw': {
        // A round head on a neck, like a puzzle piece. The head scales with
        // the bend, so a small bend gives a small tab.
        var sg = H < 0 ? -1 : 1, A = Math.abs(H);
        // A neck of zero would hang the head from a single point, which
        // the fill cannot cut into triangles, so the neck keeps 2% of it.
        var r = Math.min(0.42 * A, 0.3 * L), nw = Math.max(0.02, prm.neck) * r, c = A - r, m = L / 2;
        var yj = c - Math.sqrt(Math.max(0, r * r - nw * nw));
        // The arc runs over the top of the head, from the left end of the
        // neck to the right. phi is how far below level each end sits, so a
        // neck as wide as the head (phi 0) still gives a half circle.
        var phi = Math.atan2(c - yj, nw), a0 = -Math.PI + phi, a1 = -2 * Math.PI - phi;
        var arc = Math.max(8, 2 * n);
        out.push([0, 0], [m - nw, 0], [m - nw, yj]);
        for (i = 1; i < arc; i++) {
          var a = a0 + (a1 - a0) * i / arc;
          out.push([m + r * Math.cos(a), c + r * Math.sin(a)]);
        }
        out.push([m + nw, yj], [m + nw, 0], [L, 0]);
        return out.map(function (p) { return [p[0], sg * p[1]]; });
      }
      default:
        return [[0, 0], [L, 0]];
    }
  }

  function dedupe(pts) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], q = out[out.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p);
    }
    return out;
  }

  // The edge profile for a state, placed forwards, or null for a straight edge.
  function profile(st, n) {
    if (st.shape === 'line' || Math.abs(st.bend) < 1e-9) return null;
    var prm = params(st), pts = [], i;
    var waves = st.shape === 'curve' ? prm.waves : 1;
    if (st.arrangement === 'alt') {
      var w = 1 / waves;
      for (i = 0; i < waves; i++) {
        hump(st.shape, prm, w, i % 2 ? -st.bend : st.bend, n).forEach(function (p, j) {
          if (i > 0 && j === 0) return;
          pts.push([p[0] + i * w, p[1]]);
        });
      }
    } else {
      var ws = 1 / waves, h = hump(st.shape, prm, ws / 2, st.bend, n);
      var S = h.concat(h.slice(0, -1).reverse().map(function (p) { return [ws - p[0], -p[1]]; }));
      for (i = 0; i < waves; i++) {
        S.forEach(function (p, j) {
          if (i > 0 && j === 0) return;
          pts.push([p[0] + i * ws, p[1]]);
        });
      }
    }
    return dedupe(pts);
  }

  function params(st) {
    var p = {};
    Object.keys(DEFAULTS).forEach(function (k) { p[k] = st.params && st.params[k] !== undefined ? st.params[k] : DEFAULTS[k]; });
    return p;
  }

  // Sampling for each level of detail, shrunk until the profile fits the
  // shader's 65 points.
  var SAMPLES = [3, 6, 12, 20];
  function fitted(st, res) {
    var n = SAMPLES[res];
    var p = profile(st, n);
    while (p && p.length > 65 && n > 2) { n--; p = profile(st, n); }
    return p;
  }

  // The tile outline: each edge of Tile(1,1) replaced by the profile.
  function outline(corners, st, res) {
    var p = res < 0 ? null : fitted(st, res);
    if (!p) return corners.slice();
    var back = p.slice().reverse().map(function (q) { return [1 - q[0], -q[1]]; });
    var out = [];
    for (var i = 0; i < corners.length; i++) {
      var a = corners[i], b = corners[(i + 1) % corners.length];
      var ex = b[0] - a[0], ey = b[1] - a[1];
      var prof = st.arrangement === 'alt' && i % 2 === 1 ? back : p;
      for (var k = 0; k < prof.length - 1; k++) {
        out.push([a[0] + prof[k][0] * ex - prof[k][1] * ey, a[1] + prof[k][0] * ey + prof[k][1] * ex]);
      }
    }
    return out;
  }

  /* The bends at which tiles start to overlap, for the current shape and
     settings, one for each direction of bend. All tiles are identical, so
     an overlap first appears exactly when one tile's outline first crosses
     itself. Returns [positive limit or null, negative limit or null]. */
  function limits(corners, st, crosses) {
    function hits(b) {
      var s = { shape: st.shape, bend: b, params: st.params, arrangement: st.arrangement };
      return crosses(outline(corners, s, 2));
    }
    return [1, -1].map(function (sign) {
      var lo = 0, hi = null;
      for (var b = 0.01; b <= 0.7501; b += 0.01) {
        if (hits(sign * b)) { hi = b; break; }
        lo = b;
      }
      if (hi === null) return null;
      for (var k = 0; k < 12; k++) {
        var mid = (lo + hi) / 2;
        if (hits(sign * mid)) hi = mid; else lo = mid;
      }
      return sign * hi;
    });
  }

  global.SpectreShapes = { SHAPES: SHAPES, BY_ID: BY_ID, OLD: OLD, DEFAULTS: DEFAULTS, profile: profile, fitted: fitted,
                           outline: outline, limits: limits, params: params };
})(this);
