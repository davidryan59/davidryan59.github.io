/* The map engine shared by the Spectre and Hat pages: WebGL drawing, chunks
   built by Web Workers, pan, zoom and rotate, colours and the colour key,
   the grid tool and the address-bar state. A page supplies its tiling, its
   tile shape and its colour presets, and adds its own controls.

   Tiles arrive from the worker in chunks. Each tile carries a two-part
   position (see tiling-core.js) and draws at a*p + b*zeta*r, so the Hat page
   can reshape every loaded tile at once by changing a and b. */
(function (global) {
  'use strict';

  var H3 = Math.sqrt(3) / 2;

  /* ------------------------------------------------------------ colour */

  function oklch(L, C, hue) {
    var h = hue * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    function enc(x) {
      x = Math.min(1, Math.max(0, x));
      return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    }
    return [
      enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      enc(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    ];
  }
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); }
  function toHex(c) {
    return '#' + c.map(function (v) {
      var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  function css(c) { return 'rgb(' + c.map(function (v) { return Math.round(v * 255); }).join(',') + ')'; }

  /* ------------------------------------------------------ small maths */

  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cdiv(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function zeta(v) { return [H3 * v[0] - 0.5 * v[1], 0.5 * v[0] + H3 * v[1]]; }
  function unzeta(v) { return [H3 * v[0] + 0.5 * v[1], -0.5 * v[0] + H3 * v[1]]; }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1]]; }

  /* ---------------------------------------------------------- polygons */

  function area(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function winding(poly, x, y) {
    var w = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      if (a[1] <= y) { if (b[1] > y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) > 0) w++; }
      else if (b[1] <= y && (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]) < 0) w--;
    }
    return w;
  }

  // Every proper crossing between two non-neighbouring segments of a closed
  // outline. A sweep on x keeps this near linear for outlines that barely
  // cross themselves. With first set, it stops at the first crossing.
  function crossings(poly, first) {
    var n = poly.length, boxes = [], order = [], out = [];
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n];
      boxes.push([Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]);
      order.push(i);
    }
    order.sort(function (a, b) { return boxes[a][0] - boxes[b][0]; });
    for (var a = 0; a < n; a++) {
      var si = order[a], A = boxes[si];
      for (var b = a + 1; b < n; b++) {
        var sj = order[b], B = boxes[sj];
        if (B[0] > A[2]) break;
        if (B[1] > A[3] || B[3] < A[1]) continue;
        var gap = Math.abs(si - sj);
        if (gap === 1 || gap === n - 1) continue;
        var p1 = poly[si], q1 = poly[(si + 1) % n], p2 = poly[sj], q2 = poly[(sj + 1) % n];
        var d = (q1[0] - p1[0]) * (q2[1] - p2[1]) - (q1[1] - p1[1]) * (q2[0] - p2[0]);
        if (Math.abs(d) < 1e-15) continue;
        var t = ((p2[0] - p1[0]) * (q2[1] - p2[1]) - (p2[1] - p1[1]) * (q2[0] - p2[0])) / d;
        var u = ((p2[0] - p1[0]) * (q1[1] - p1[1]) - (p2[1] - p1[1]) * (q1[0] - p1[0])) / d;
        if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) continue;
        out.push({ i: si, j: sj, t: t, u: u });
        if (first) return out;
      }
    }
    return out;
  }

  /* Split a closed outline where it crosses itself. Returns its pieces with
     their winding numbers: 1 for ordinary tile, 2 where the tile covers
     itself twice, and -1 where it is turned inside out. */
  function faces(poly) {
    var n = poly.length, X = crossings(poly, false);
    if (!X.length) return [{ pts: poly, w: area(poly) > 0 ? 1 : -1 }];
    var pts = poly.slice(), cuts = poly.map(function () { return []; });
    X.forEach(function (x) {
      var p = poly[x.i], q = poly[(x.i + 1) % n], id = pts.length;
      pts.push([p[0] + x.t * (q[0] - p[0]), p[1] + x.t * (q[1] - p[1])]);
      cuts[x.i].push([x.t, id]);
      cuts[x.j].push([x.u, id]);
    });
    var out = pts.map(function () { return []; }), halves = [];
    function edge(a, b) {
      if (a === b) return;
      var h1 = { from: a, to: b }, h2 = { from: b, to: a };
      h1.twin = h2; h2.twin = h1;
      h1.ang = Math.atan2(pts[b][1] - pts[a][1], pts[b][0] - pts[a][0]);
      h2.ang = Math.atan2(pts[a][1] - pts[b][1], pts[a][0] - pts[b][0]);
      out[a].push(h1); out[b].push(h2); halves.push(h1, h2);
    }
    for (var i = 0; i < n; i++) {
      var prev = i;
      cuts[i].sort(function (x, y) { return x[0] - y[0]; }).forEach(function (c) { edge(prev, c[1]); prev = c[1]; });
      edge(prev, (i + 1) % n);
    }
    out.forEach(function (list) {
      list.sort(function (x, y) { return x.ang - y.ang; });
      list.forEach(function (h, k) { h.k = k; });
    });
    var res = [];
    halves.forEach(function (h0) {
      if (h0.used) return;
      var face = [], h = h0, guard = 0;
      do {
        h.used = true;
        face.push(pts[h.from]);
        var list = out[h.to];
        h = list[(h.twin.k - 1 + list.length) % list.length];
      } while (h !== h0 && guard++ < 1e6);
      if (area(face) <= 1e-12) return;
      var a = face[0], b = face[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-12) return;
      var nudge = Math.min(1e-5, 0.01 * len);
      var w = winding(poly, (a[0] + b[0]) / 2 - nudge * (b[1] - a[1]) / len, (a[1] + b[1]) / 2 + nudge * (b[0] - a[0]) / len);
      if (w !== 0) res.push({ pts: face, w: w });
    });
    return res;
  }

  /* Drop repeated corners and corners where the outline runs straight on.
     The Hat's outline has zero-length edges at the chevron and the comet,
     and a straight corner at every shape. */
  function tidy(pts) {
    var out = pts.slice(), changed = true, scale = 0;
    out.forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); });
    var eps = 1e-9 * Math.max(1, scale);
    while (changed && out.length > 3) {
      changed = false;
      for (var i = 0; i < out.length && out.length > 3; i++) {
        var a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        var ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
        var cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        var dot = (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]);
        if (ab < eps || (Math.abs(cr) < eps * Math.max(ab, 1e-12) && dot <= 0)) { out.splice(i, 1); i--; changed = true; }
      }
    }
    return out;
  }

  /* Ear clipping on a linked ring; each search resumes beside the last ear.
     A corner lying on the edge of a candidate ear blocks it, as well as one
     inside it. The Hat's outline sits on a grid at the hat and the turtle,
     so three of its corners often fall on one line, and a looser test there
     would cut triangles that reach outside the tile. */
  function triangulate(input) {
    var pts = tidy(input), n = pts.length, prev = new Int32Array(n), next = new Int32Array(n), tris = [];
    if (n < 3) return tris;
    var scale = 0;
    pts.forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); });
    var eps = 1e-12 * Math.max(1, scale * scale);
    for (var i = 0; i < n; i++) { prev[i] = (i + n - 1) % n; next[i] = (i + 1) % n; }
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    function same(p, q) { return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < 1e-9 * Math.max(1, scale); }
    function blocks(i, strict) {
      var a = pts[prev[i]], b = pts[i], c = pts[next[i]];
      if (cross(a, b, c) <= eps) return true;
      for (var j = next[next[i]]; j !== prev[i]; j = next[j]) {
        var p = pts[j];
        if (same(p, a) || same(p, b) || same(p, c)) continue;
        var t = strict ? -eps : eps;
        if (cross(a, b, p) > t && cross(b, c, p) > t && cross(c, a, p) > t) return true;
      }
      return false;
    }
    var left = n, k = 0, misses = 0, strict = true;
    while (left > 3) {
      if (!blocks(k, strict)) {
        tris.push(pts[prev[k]], pts[k], pts[next[k]]);
        next[prev[k]] = next[k];
        prev[next[k]] = prev[k];
        k = prev[k];
        left--;
        misses = 0;
        strict = true;
      } else {
        k = next[k];
        // A full lap with no ear: relax to the plain inside test, and stop
        // only if even that finds nothing.
        if (++misses > left) {
          if (!strict) break;
          strict = false;
          misses = 0;
        }
      }
    }
    if (left === 3) tris.push(pts[prev[k]], pts[k], pts[next[k]]);
    return tris;
  }

  /* ----------------------------------------------------------- shaders */

  var TILE_VS = [
    '#version 300 es',
    'layout(location=0) in vec2 a_local;',
    'layout(location=1) in vec4 a_pr;',
    'layout(location=2) in uvec3 a_bits;',
    'uniform vec2 u_chunk;',
    'uniform vec2 u_ab;',
    'uniform mat2 u_view;',
    'uniform vec2 u_half;',
    'uniform vec2 u_anchor;',
    'out vec2 v_local;',
    'out vec2 v_rel;',
    'flat out uvec3 v_bits;',
    'void main() {',
    '  uint turn = a_bits.x & 15u;',
    '  vec2 v = a_local;',
    '  if ((a_bits.x & 16u) != 0u) v.y = -v.y;',
    '  float t = float(turn) * 0.52359877559829887;',
    '  float c = cos(t), s = sin(t);',
    '  vec2 zr = vec2(0.8660254037844386 * a_pr.z - 0.5 * a_pr.w, 0.5 * a_pr.z + 0.8660254037844386 * a_pr.w);',
    '  vec2 w = u_chunk + u_ab.x * a_pr.xy + u_ab.y * zr + vec2(c * v.x - s * v.y, s * v.x + c * v.y);',
    '  gl_Position = vec4((u_view * w) / u_half, 0.0, 1.0);',
    '  v_local = a_local;',
    '  v_rel = w - u_anchor;',
    '  v_bits = a_bits;',
    '}'
  ].join('\n');

  // Each tile strokes the inner half of its own edges and its neighbour the
  // other half, so every line is whole and antialiased. A tile also draws a
  // disc at any corner that a thicker line passes through, which fills the
  // corner where it meets that line only at a point.
  var TILE_FS = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 v_local;',
    'in vec2 v_rel;',
    'flat in uvec3 v_bits;',
    'uniform vec2 u_corners[14];',
    'uniform float u_scale;',
    'uniform vec3 u_class[12];',
    'uniform int u_classMode;',
    'uniform bool u_levels;',
    'uniform float u_width[6];',
    'uniform float u_edgeAlpha;',
    'uniform vec3 u_edge;',
    'uniform vec3 u_line;',
    'uniform vec3 u_edgeAlt;',
    'uniform vec3 u_lineAlt;',
    'uniform vec2 u_prof[65];',
    'uniform int u_profN;',
    'uniform float u_profMax;',
    'uniform bool u_profAlt;',
    'uniform float u_reach;',
    'uniform int u_pass;',
    'uniform vec3 u_hot;',
    'uniform vec3 u_hot2;',
    'uniform int u_gridOn;',
    'uniform mat2 u_lat[2];',
    'uniform vec3 u_dotCol[2];',
    'uniform float u_dotRange;',
    'uniform float u_dotR;',
    'out vec4 outColor;',
    'uint edgeLevel(int i) {',
    '  return i < 8 ? (v_bits.x >> uint(8 + 3 * i)) & 7u : (v_bits.y >> uint(3 * (i - 8))) & 7u;',
    '}',
    'uint vertLevel(int i) {',
    '  return i < 4 ? (v_bits.y >> uint(18 + 3 * i)) & 7u : (v_bits.z >> uint(3 * (i - 4))) & 7u;',
    '}',
    'float segDist(vec2 p, vec2 a, vec2 b) {',
    '  vec2 pa = p - a, ba = b - a;',
    '  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    // Distance to edge i, following the edge profile when there is one.
    'float edgeDist(vec2 p, vec2 a, vec2 b, int i) {',
    '  float d = segDist(p, a, b);',
    '  if (u_profN < 2) return d;',
    '  vec2 e = b - a;',
    '  float L = length(e);',
    '  if (L < 1e-9) return d;',
    '  if (d > (u_profMax + u_reach) * L) return d - u_profMax * L;',
    '  vec2 ue = e / L, n = vec2(-ue.y, ue.x), q = p - a;',
    '  vec2 pp = vec2(dot(q, ue), dot(q, n)) / L;',
    '  if (u_profAlt && (i - 2 * (i / 2)) == 1) pp = vec2(1.0 - pp.x, -pp.y);',
    '  float best = 1e9;',
    '  for (int k = 0; k < 64; k++) {',
    '    if (k >= u_profN - 1) break;',
    '    best = min(best, segDist(pp, u_prof[k], u_prof[k + 1]));',
    '  }',
    '  return best * L;',
    '}',
    'void main() {',
    '  uint turn = v_bits.x & 15u;',
    '  bool flip = (v_bits.x & 16u) != 0u;',
    '  if (u_pass == 1) {',
    '    float st = mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) < 5.0 ? 1.0 : 0.0;',
    '    outColor = vec4(mix(u_hot, u_hot2, st), 1.0);',
    '    return;',
    '  }',
    '  int cls = u_classMode == 0 ? int(turn) : int(turn / 2u) + (flip ? 6 : 0);',
    '  vec3 fill = u_class[cls];',
    '  float cov[6];',
    '  for (int k = 0; k < 6; k++) cov[k] = 0.0;',
    '  for (int i = 0; i < 14; i++) {',
    '    vec2 a = u_corners[i];',
    '    vec2 b = u_corners[i == 13 ? 0 : i + 1];',
    '    float d = edgeDist(v_local, a, b, i) * u_scale;',
    '    int lv = u_levels ? int(min(edgeLevel(i), 5u)) : 0;',
    '    cov[lv] = max(cov[lv], clamp(u_width[lv] + 0.5 - d, 0.0, 1.0));',
    '    if (u_levels) {',
    '      int vl = int(min(vertLevel(i), 5u));',
    '      if (vl > 0) {',
    '        float dv = length(v_local - a) * u_scale;',
    '        cov[vl] = max(cov[vl], clamp(u_width[vl] + 0.5 - dv, 0.0, 1.0));',
    '      }',
    '    }',
    '  }',
    // Each tile takes whichever ink contrasts with it more. See inkAlt.
    '  vec3 wt = vec3(0.2126, 0.7152, 0.0722);',
    '  float lf = dot(pow(fill, vec3(2.2)), wt);',
    '  float le = dot(pow(u_edge, vec3(2.2)), wt), la = dot(pow(u_edgeAlt, vec3(2.2)), wt);',
    '  bool alt = (max(lf, la) + 0.05) / (min(lf, la) + 0.05) > (max(lf, le) + 0.05) / (min(lf, le) + 0.05);',
    '  vec3 col = mix(fill, alt ? u_edgeAlt : u_edge, cov[0] * u_edgeAlpha);',
    '  for (int k = 1; k < 6; k++) col = mix(col, alt ? u_lineAlt : u_line, cov[k]);',
    // Grid dots: a disc on each corner of this tile that sits on a grid.
    '  if (u_gridOn != 0) {',
    '    float t = float(turn) * 0.52359877559829887;',
    '    float c = cos(t), s = sin(t);',
    '    for (int j = 0; j < 14; j++) {',
    '      vec2 off = u_corners[j] - v_local;',
    '      if (flip) off.y = -off.y;',
    '      off = vec2(c * off.x - s * off.y, s * off.x + c * off.y);',
    '      float dpx = length(off) * u_scale;',
    '      if (dpx > u_dotR + 1.0) continue;',
    '      vec2 vr = v_rel + off;',
    '      if (length(vr) > u_dotRange) continue;',
    '      for (int L = 0; L < 2; L++) {',
    '        if ((u_gridOn & (1 << L)) == 0) continue;',
    '        vec2 lc = u_lat[L] * vr;',
    '        vec2 fr = abs(lc - round(lc));',
    '        if (max(fr.x, fr.y) < 2e-3) col = mix(col, u_dotCol[L], clamp(u_dotR + 0.5 - dpx, 0.0, 1.0));',
    '      }',
    '    }',
    '  }',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var OVERLAY_VS = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;',
    '  gl_Position = vec4(p, 0.0, 1.0);',
    '}'
  ].join('\n');

  // Grid lines and the rings round picked corners, over the finished tiles.
  var OVERLAY_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 u_half;',
    'uniform mat2 u_inv;',
    'uniform vec2 u_anchor;',
    'uniform int u_on;',
    'uniform mat2 u_lat[2];',
    'uniform vec3 u_gap[2];',
    'uniform vec3 u_col[2];',
    'uniform float u_scale;',
    'uniform float u_px;',
    'uniform vec2 u_picks[3];',
    'uniform int u_nPicks;',
    'uniform vec3 u_pickCol;',
    'out vec4 outColor;',
    'float lineCov(float x, float gap) {',
    '  float g = gap * u_scale;',
    '  float d = abs(x - round(x)) * g;',
    '  return clamp(u_px * 0.5 + 0.5 - d, 0.0, 1.0) * clamp((g - 6.0 * u_px) / (18.0 * u_px), 0.0, 1.0);',
    '}',
    'void main() {',
    '  vec2 w = u_inv * (gl_FragCoord.xy - u_half);',
    '  vec2 rel = w - u_anchor;',
    '  vec4 acc = vec4(0.0);',
    '  for (int L = 0; L < 2; L++) {',
    '    if ((u_on & (1 << L)) == 0) continue;',
    '    vec2 lc = u_lat[L] * rel;',
    '    float c = max(max(lineCov(lc.x, u_gap[L].x), lineCov(lc.y, u_gap[L].y)), lineCov(lc.x + lc.y, u_gap[L].z)) * 0.6;',
    '    acc = vec4(u_col[L] * c, c) + acc * (1.0 - c);',
    '  }',
    '  for (int k = 0; k < 3; k++) {',
    '    if (k >= u_nPicks) break;',
    '    float d = abs(length(w - u_picks[k]) * u_scale - 7.0 * u_px);',
    '    float c = clamp(u_px + 0.5 - d, 0.0, 1.0);',
    '    acc = vec4(u_pickCol * c, c) + acc * (1.0 - c);',
    '  }',
    '  outColor = acc;',
    '}'
  ].join('\n');

  /* ============================================================ engine */

  function start(cfg) {
    var CHUNK = cfg.chunkSize || 128;
    var MIN_S = 1, MAX_S = 400, START_S = cfg.startScale || 8;
    var MAX_CHUNKS = 900;
    var store = cfg.name + '-options';

    var canvas = document.getElementById('map');
    var gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) { document.getElementById('fail').hidden = false; return null; }

    var map = {};
    var info = null;
    var view = { P: [0, 0], R: [0, 0], s: START_S, rot: 0 };
    var ab = (cfg.ab || [1, 0]).slice();
    var slope = null;        // kappa, for tilings with two edge lengths
    var W = 0, Hh = 0, dpr = 1;

    function camWorld() { var z = zeta(view.R); return [ab[0] * view.P[0] + ab[1] * z[0], ab[0] * view.P[1] + ab[1] * z[1]]; }
    function worldOf(P, R) { var z = zeta(R); return [ab[0] * P[0] + ab[1] * z[0], ab[0] * P[1] + ab[1] * z[1]]; }
    // A world point relative to the camera, from a two-part point.
    function relOf(P, R) {
      var z = zeta([R[0] - view.R[0], R[1] - view.R[1]]);
      return [ab[0] * (P[0] - view.P[0]) + ab[1] * z[0], ab[0] * (P[1] - view.P[1]) + ab[1] * z[1]];
    }
    // Reference coordinates: where chunks live. For the Spectre they are the
    // world; for the Hat they are positions at the hat's own shape.
    var refB = cfg.refB || 0;
    function camRef() { var z = zeta(view.R); return [view.P[0] + refB * z[0], view.P[1] + refB * z[1]]; }
    function refFromRel(v) {
      if (!slope) return [v[0] / ab[0], v[1] / ab[0]];
      return cmul(v, cdiv([slope[0] + refB, slope[1]], [ab[0] * slope[0] + ab[1], ab[0] * slope[1]]));
    }
    // Move the camera by a world vector. With two edge lengths the move is
    // shared between p and r along the tiling's own slope, so the tiles under
    // the screen stay put when the shape changes.
    function moveBy(v) {
      if (!slope) { view.P[0] += v[0] / ab[0]; view.P[1] += v[1] / ab[0]; return; }
      var q = cdiv(v, [ab[0] * slope[0] + ab[1], ab[0] * slope[1]]);
      var dp = cmul(slope, q), dr = unzeta(q);
      view.P[0] += dp[0]; view.P[1] += dp[1];
      view.R[0] += dr[0]; view.R[1] += dr[1];
    }
    // Screen offset in CSS pixels from the centre (y down) to world offset.
    function screenToRel(dx, dy) { return rot([dx / view.s, -dy / view.s], -view.rot); }
    function relToScreen(v) { var r = rot(v, view.rot); return [r[0] * view.s, -r[1] * view.s]; }

    /* ------------------------------------------------------- WebGL */

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    }
    function program(vs, fs, names) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var U = {};
      names.forEach(function (n) { U[n] = gl.getUniformLocation(p, n); });
      return { p: p, U: U };
    }
    var tileProg = program(TILE_VS, TILE_FS, ['u_chunk', 'u_ab', 'u_view', 'u_half', 'u_anchor', 'u_corners',
      'u_scale', 'u_class', 'u_classMode', 'u_levels', 'u_width', 'u_edgeAlpha', 'u_edge', 'u_line', 'u_edgeAlt',
      'u_lineAlt', 'u_prof',
      'u_profN', 'u_profMax', 'u_profAlt', 'u_reach', 'u_pass', 'u_hot', 'u_hot2', 'u_gridOn', 'u_lat',
      'u_dotCol', 'u_dotRange', 'u_dotR']);
    var overProg = program(OVERLAY_VS, OVERLAY_FS, ['u_half', 'u_inv', 'u_anchor', 'u_on', 'u_lat', 'u_gap',
      'u_col', 'u_scale', 'u_px', 'u_picks', 'u_nPicks', 'u_pickCol']);
    var overVao = gl.createVertexArray();

    /* -------------------------------------------------- tile meshes */

    // Meshes for the current tile shape, one per level of detail, all in one
    // buffer. Each has a fill range and an inside-out range.
    var baseBuf = gl.createBuffer();
    var meshData = [], meshes = new Map(), meshSig = null;
    function mesh(res) {
      var sig = cfg.shape.signature();
      if (sig !== meshSig) { meshes.clear(); meshData = []; meshSig = sig; }
      var key = cfg.shape.lodKey(res);
      if (meshes.has(key)) return meshes.get(key);
      var outline = tidy(cfg.shape.outline(res));
      var fill = [], hot = [];
      faces(outline).forEach(function (f) {
        var pts = f.pts;
        if (area(pts) < 0) pts = pts.slice().reverse();
        var tris = triangulate(pts);
        (f.w > 0 ? fill : hot).push.apply(f.w > 0 ? fill : hot, tris);
      });
      var first = meshData.length / 2;
      fill.concat(hot).forEach(function (p) { meshData.push(p[0], p[1]); });
      var m = { first: first, count: fill.length, hotFirst: first + fill.length, hotCount: hot.length };
      meshes.set(key, m);
      gl.bindBuffer(gl.ARRAY_BUFFER, baseBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(meshData), gl.STATIC_DRAW);
      return m;
    }

    /* ------------------------------------------------------- chunks */

    var cache = new Map(), inFlight = new Map(), frame = 0;

    function makeChunk(m) {
      var vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, baseBuf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      var buf = null;
      if (m.count > 0) {
        buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, m.buffer, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribIPointer(2, 3, gl.UNSIGNED_INT, 28, 16);
        gl.vertexAttribDivisor(2, 1);
      }
      gl.bindVertexArray(null);
      return { vao: vao, buf: buf, count: m.count, i: m.i, j: m.j, P0: m.P0, R0: m.R0, lo: m.lo, hi: m.hi, used: frame };
    }

    function evict() {
      if (cache.size <= MAX_CHUNKS) return;
      var list = Array.from(cache.values()).filter(function (c) { return c.used < frame; });
      list.sort(function (a, b) { return a.used - b.used; });
      for (var k = 0; k < list.length && cache.size > MAX_CHUNKS * 0.8; k++) {
        gl.deleteVertexArray(list[k].vao);
        if (list[k].buf) gl.deleteBuffer(list[k].buf);
        cache.delete(list[k].i + ',' + list[k].j);
      }
    }

    /* ------------------------------------------------------ workers */

    // Workers build chunks off the main thread. Opened from disk, a browser
    // may refuse to start a worker, so the page falls back to building
    // chunks itself between frames.
    var workers = [], ready = false, cornerCalls = new Map(), cornerId = 0;

    function onMessage(m, w) {
      if (m.type === 'ready') {
        w.ready = true;
        if (!ready) { ready = true; begin(m.info); }
      } else if (m.type === 'chunk') {
        w.busy--;
        var k = m.i + ',' + m.j;
        inFlight.delete(k);
        if (!cache.has(k)) cache.set(k, makeChunk(m));
        requestDraw();
      } else if (m.type === 'corner') {
        w.busy--;
        var cb = cornerCalls.get(m.id);
        cornerCalls.delete(m.id);
        if (cb) cb(m.corner);
      }
    }

    function localWorker() {
      var w = { busy: 0, ready: false, queue: [] };
      var handle = null;
      function step() {
        if (!w.queue.length) return;
        var m = w.queue.shift();
        handle(m, function (msg) { onMessage(msg, w); });
        if (w.queue.length) setTimeout(step, 0);
      }
      w.postMessage = function (m) { w.queue.push(m); setTimeout(step, 0); };
      setTimeout(function () {
        handle = TilingCore.serve(cfg.build);
        handle({ type: 'init' }, function (msg) { onMessage(msg, w); });
      }, 0);
      return w;
    }

    function startWorkers() {
      var n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), failed = false;
      function fallback() {
        if (failed || ready) return;
        failed = true;
        workers.forEach(function (w) { if (w.terminate) w.terminate(); });
        workers = [localWorker()];
      }
      try {
        for (var i = 0; i < n; i++) {
          var w = new Worker(cfg.worker);
          w.busy = 0;
          w.ready = false;
          (function (w) { w.onmessage = function (ev) { onMessage(ev.data, w); }; })(w);
          w.onerror = fallback;
          w.postMessage({ type: 'init' });
          workers.push(w);
        }
      } catch (e) {
        fallback();
      }
    }

    function freeWorker(limit) {
      var w = null;
      workers.forEach(function (x) { if (x.ready && x.busy < limit && (!w || x.busy < w.busy)) w = x; });
      return w;
    }

    // Each worker holds at most two chunk requests, so a new view can jump
    // the queue.
    function requestChunks(needed) {
      needed.sort(function (a, b) { return a.d - b.d; });
      for (var k = 0; k < needed.length; k++) {
        var n = needed[k];
        if (inFlight.has(n.key)) continue;
        var w = freeWorker(2);
        if (!w) return;
        w.busy++;
        inFlight.set(n.key, true);
        w.postMessage({ type: 'chunk', i: n.i, j: n.j, size: CHUNK });
      }
    }

    // The corner nearest a world offset from the camera, from a worker.
    function findCorner(rel, radius, cb) {
      var w = freeWorker(99);
      if (!w) { cb(null); return; }
      var id = ++cornerId, cw = camWorld(), cr = camRef(), rr = refFromRel(rel);
      cornerCalls.set(id, cb);
      w.busy++;
      w.postMessage({ type: 'corner', id: id, ref: [cr[0] + rr[0], cr[1] + rr[1]],
                      world: [cw[0] + rel[0], cw[1] + rel[1]], ab: ab.slice(), radius: radius });
    }

    /* ------------------------------------------------------ colours */

    var dark = false, theme = null;
    var groupings = {};
    cfg.groupings.forEach(function (g) { groupings[g.id] = g; });
    var presets = {};
    cfg.presets.forEach(function (p) { presets[p.id] = p; });
    // The selection is a preset id, or 'custom:' and a grouping id.
    var sel = cfg.presets[0].id, customs = {};

    function currentGrouping() {
      return groupings[sel.indexOf('custom:') === 0 ? sel.slice(7) : presets[sel].grouping];
    }
    function groupColours() {
      if (sel.indexOf('custom:') === 0) return customs[sel.slice(7)].map(hex);
      return presets[sel].colours(dark);
    }
    function classColours() {
      var g = currentGrouping(), cols = groupColours();
      return cfg.classes.map(function (c, k) { return cols[g.of(k)]; });
    }

    function applyTheme() {
      dark = document.documentElement.dataset.theme === 'dark';
      theme = {
        edge: dark ? hex('#b4afa3') : hex('#34332e'),
        line: dark ? hex('#d9d4c7') : hex('#16150f'),
        edgeAlt: dark ? hex('#34332e') : hex('#d8d4c9'),
        lineAlt: dark ? hex('#16150f') : hex('#f2efe6'),
        bg: dark ? hex('#16161a') : hex('#f6f3ec'),
        hot: dark ? hex('#ff4d64') : hex('#e0213e'),
        hot2: dark ? hex('#9e1b30') : hex('#8f0f24'),
        grid: [dark ? hex('#7fc4ff') : hex('#0b5bd3'), dark ? hex('#ffb86b') : hex('#c2410c')],
        pick: dark ? hex('#ffffff') : hex('#000000')
      };
      renderLegend();
      requestDraw();
    }

    var schemeEl = document.getElementById('scheme');
    function renderSchemeSelect() {
      var html = '';
      cfg.groupings.forEach(function (g) {
        var items = cfg.presets.filter(function (p) { return p.grouping === g.id; });
        html += '<optgroup label="' + g.name + '">';
        items.forEach(function (p) { html += '<option value="' + p.id + '">' + p.name + '</option>'; });
        if (customs[g.id]) html += '<option value="custom:' + g.id + '">Custom ' + g.n + '</option>';
        html += '</optgroup>';
      });
      schemeEl.innerHTML = html;
      schemeEl.value = sel;
    }
    schemeEl.addEventListener('change', function () {
      sel = schemeEl.value;
      saveOptions();
      renderLegend();
      changed();
    });

    /* Random colours for every group of the current grouping, kept as a
       custom set so a link can share them. Each roll picks one of five
       palettes with equal chance. A small palette is dealt like a shuffled
       deck, so every colour appears once before any appears twice, and two
       or more groups never all get the same colour. */
    function hex2(v) { return ('0' + Math.round(v).toString(16)).slice(-2); }
    var PALETTES = [
      null,                                                                   // any colour
      ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00'],
      ['#ffffff', '#000000'],
      Array.from({ length: 8 }, function (x, i) { var h = hex2(255 * i / 7); return '#' + h + h + h; }),
      Array.from({ length: 27 }, function (x, i) {                            // 00, 80, ff per channel
        return '#' + [Math.floor(i / 9), Math.floor(i / 3) % 3, i % 3].map(function (d) { return ['00', '80', 'ff'][d]; }).join('');
      })
    ];
    function shuffled(a) {
      a = a.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function randomColours(n) {
      var pal = PALETTES[Math.floor(Math.random() * PALETTES.length)], out = [];
      if (!pal) {
        for (var i = 0; i < n; i++) out.push('#' + hex2(Math.random() * 255) + hex2(Math.random() * 255) + hex2(Math.random() * 255));
        return out;
      }
      while (out.length < n) out = out.concat(shuffled(pal));
      return shuffled(out.slice(0, n));
    }
    document.getElementById('random-colours').addEventListener('click', function () {
      var g = currentGrouping();
      customs[g.id] = randomColours(g.n);
      sel = 'custom:' + g.id;
      renderSchemeSelect();
      saveOptions();
      renderLegend();
      changed();
    });

    // A new colour for one group turns the current colours into a custom set
    // for the current grouping, starting from whatever was showing. While the
    // picker is open only the map and that group's swatches update, since
    // rebuilding the key would close the picker.
    function setGroupColour(group, value, final) {
      var g = currentGrouping();
      if (sel.indexOf('custom:') !== 0) {
        customs[g.id] = groupColours().map(toHex);
        sel = 'custom:' + g.id;
        renderSchemeSelect();
      }
      customs[g.id][group] = value;
      if (final) {
        saveOptions();
        renderLegend();
        changed();
      } else {
        Array.prototype.forEach.call(legendEl.querySelectorAll('.group[data-group="' + group + '"] polygon'),
          function (p) { p.setAttribute('fill', value); });
        requestDraw();
      }
    }

    /* ------------------------------------------------------- legend */

    // The colour panel: a fixed head with the scheme menu, dice, theme
    // toggle and the key toggle, and a body holding the key, redrawn here.
    var legendEl = document.getElementById('legend-body');
    var legendToggle = document.getElementById('legend-toggle');
    var legendOpen = window.innerWidth > 640;
    try { var ls = localStorage.getItem(store + '-legend'); if (ls) legendOpen = ls === 'open'; } catch (e) {}
    legendToggle.addEventListener('click', function () {
      legendOpen = !legendOpen;
      try { localStorage.setItem(store + '-legend', legendOpen ? 'open' : 'closed'); } catch (e) {}
      renderLegend();
    });

    // One small tile, turned and flipped as it appears on the map, and turned
    // with the view so it matches the screen. SVG runs y down, so y flips.
    function tileSvg(cls, colour) {
      var c = cfg.classes[cls];
      var pts = cfg.shape.outline(1), cx = 0, cy = 0;
      pts.forEach(function (p) { cx += p[0] / pts.length; cy += p[1] / pts.length; });
      var ang = c.turn * Math.PI / 6 + view.rot, co = Math.cos(ang), si = Math.sin(ang), rmax = 0;
      var out = pts.map(function (p) {
        var x = p[0] - cx, y = p[1] - cy;
        if (c.flip) y = -y;
        var X = co * x - si * y, Y = co * y + si * x;
        rmax = Math.max(rmax, Math.hypot(X, Y));
        return [X, -Y];
      });
      var k = 2.5 / rmax;
      return '<svg viewBox="-2.6 -2.6 5.2 5.2" aria-hidden="true"><polygon points="' +
        out.map(function (p) { return (p[0] * k).toFixed(3) + ',' + (p[1] * k).toFixed(3); }).join(' ') +
        '" fill="' + css(colour) + '" stroke="' + css(inkFor(colour)) + '" stroke-width="0.14" stroke-linejoin="round"/></svg>';
    }

    /* Whether a tile takes the other ink: light ink in light mode, dark ink
       in dark mode. Each tile takes whichever ink contrasts with it more,
       measured as the contrast ratio of the two luminances, as in WCAG.
       Luminance is the share of white light a colour gives off, from 0 for
       black to 1 for white. The shader applies the same rule. */
    function lum(c) { return 0.2126 * Math.pow(c[0], 2.2) + 0.7152 * Math.pow(c[1], 2.2) + 0.0722 * Math.pow(c[2], 2.2); }
    function contrast(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
    function inkAlt(c) {
      var l = lum(c);
      return contrast(l, lum(theme.edgeAlt)) > contrast(l, lum(theme.edge));
    }
    function inkFor(c) { return inkAlt(c) ? theme.edgeAlt : theme.edge; }

    function renderLegend() {
      if (!theme || !info) return;
      var g = currentGrouping(), cols = groupColours();
      var html = '';
      legendToggle.textContent = legendOpen ? 'Hide' : 'Key';
      legendToggle.setAttribute('aria-expanded', legendOpen);
      legendEl.hidden = !legendOpen;
      if (legendOpen) {
        var order = g.order || Array.from({ length: g.n }, function (x, i) { return i; });
        html += '<div class="groups" style="grid-template-columns: repeat(' + (g.cols || 1) + ', auto)">';
        order.forEach(function (q) {
          // Six tiles to a row at most, so a big group wraps evenly.
          var count = cfg.classes.filter(function (c, k) { return g.of(k) === q; }).length;
          html += '<button type="button" class="group" data-group="' + q + '" title="Pick a colour for these tiles"' +
            ' style="grid-template-columns: repeat(' + Math.min(count, 6) + ', auto)">';
          cfg.classes.forEach(function (c, k) {
            if (g.of(k) !== q) return;
            html += '<figure>' + tileSvg(k, cols[q]) + '<figcaption>' + c.caption + '</figcaption></figure>';
          });
          html += '</button>';
        });
        html += '</div><p class="note">' + (cfg.keyNote ? cfg.keyNote(g) + ' ' : '') + 'Click a group to change its colour.</p>';
        if (cfg.extraNotes) html += cfg.extraNotes();
        html += '<div><button type="button" class="linkish" id="reset-colours">Reset colours</button></div>';
        html += '<input type="color" id="legend-colour" tabindex="-1" aria-hidden="true">';
      }
      legendEl.innerHTML = html;
      var resetEl = document.getElementById('reset-colours');
      if (resetEl) resetEl.addEventListener('click', resetColours);
      var picker = document.getElementById('legend-colour');
      if (!picker) return;
      var active = -1;
      picker.addEventListener('input', function () { if (active >= 0) setGroupColour(active, picker.value, false); });
      picker.addEventListener('change', function () { if (active >= 0) setGroupColour(active, picker.value, true); });
      Array.prototype.forEach.call(legendEl.querySelectorAll('.group'), function (b) {
        b.addEventListener('click', function () {
          active = +b.dataset.group;
          picker.value = toHex(groupColours()[active]);
          picker.click();
        });
      });
    }

    /* --------------------------------------------------- grid tool */

    var grid = { on: false, on0: true, on30: true, picks: [] };
    var gridEl = document.getElementById('grid');
    var grid0El = document.getElementById('grid0'), grid30El = document.getElementById('grid30');
    var gridSubEl = document.getElementById('grid-sub');

    function lattices() {
      // Bases in world units, for the lattices currently shown.
      var L = cfg.gridSpacing ? cfg.gridSpacing(ab) : [1, 1], out = [];
      var pk = grid.picks.map(function (p) { return relOf(p.P, p.R); });
      if (pk.length >= 2) {
        var v1 = [pk[1][0] - pk[0][0], pk[1][1] - pk[0][1]], v2 = rot(v1, Math.PI / 3);
        if (pk.length === 3) {
          var w2 = [pk[2][0] - pk[0][0], pk[2][1] - pk[0][1]];
          if (Math.abs(v1[0] * w2[1] - v1[1] * w2[0]) > 1e-6) v2 = w2;
        }
        out.push([v1, v2]);
      } else {
        if (grid.on0) out.push([[L[0], 0], [L[0] / 2, L[0] * H3]]); else out.push(null);
        if (grid.on30) out.push([[L[1] * H3, L[1] / 2], [0, L[1]]]); else out.push(null);
      }
      return out;
    }
    function inverse(B) {
      var d = B[0][0] * B[1][1] - B[1][0] * B[0][1];
      // Column-major mat2 for GLSL: world vector to lattice coordinates.
      return [B[1][1] / d, -B[0][1] / d, -B[1][0] / d, B[0][0] / d];
    }
    function gaps(B) {
      var d = Math.abs(B[0][0] * B[1][1] - B[1][0] * B[0][1]);
      var l1 = Math.hypot(B[0][0], B[0][1]), l2 = Math.hypot(B[1][0], B[1][1]);
      var l3 = Math.hypot(B[0][0] - B[1][0], B[0][1] - B[1][1]);
      return [d / l2, d / l1, d / l3];
    }

    function pickNear(rel, done) {
      var radius = 6 + (info && info.spread ? info.spread * 2 : 0);
      findCorner(rel, radius, function (c) {
        if (!c) { done(null); return; }
        var cw = camWorld(), r = [c.world[0] - cw[0], c.world[1] - cw[1]];
        done({ P: c.P, R: c.R, rel: r });
      });
    }
    function gridChanged() {
      gridSubEl.hidden = !grid.on;
      canvas.classList.toggle('picking', grid.on);
      if (grid.on && !grid.picks.length) {
        pickNear([0, 0], function (c) { if (c) { grid.picks = [c]; requestDraw(); } });
      }
      saveOptions();
      renderGridHint();
      requestDraw();
    }
    function renderGridHint() {
      var el = document.getElementById('grid-hint');
      if (!el) return;
      var n = grid.picks.length;
      el.textContent = n <= 1 ? 'Click a corner to move the grid there. Click two or three corners to fit a grid through them.'
        : n === 2 ? 'The grid takes the spacing and angle of the two corners. Click a third to slant it.'
        : 'A slanted grid through three corners. Click again to start over.';
      grid0El.disabled = grid30El.disabled = n >= 2;
    }
    gridEl.addEventListener('change', function () { grid.on = gridEl.checked; gridChanged(); });
    grid0El.addEventListener('change', function () { grid.on0 = grid0El.checked; gridChanged(); });
    grid30El.addEventListener('change', function () { grid.on30 = grid30El.checked; gridChanged(); });
    document.getElementById('grid-clear').addEventListener('click', function () {
      grid.picks = [];
      gridChanged();
    });
    function clickAt(px, py) {
      if (!grid.on) return;
      var rel = screenToRel(px - W / 2, py - Hh / 2);
      pickNear(rel, function (c) {
        if (!c) return;
        var s = relToScreen(c.rel);
        if (Math.hypot(s[0] + W / 2 - px, s[1] + Hh / 2 - py) > 30) return;
        grid.picks = grid.picks.length >= 3 ? [c] : grid.picks.concat([c]);
        renderGridHint();
        requestDraw();
      });
    }

    /* ---------------------------------------------- outline toggle */

    var outlines = false;
    var outlinesEl = document.getElementById('outlines');
    outlinesEl.addEventListener('change', function () {
      outlines = outlinesEl.checked;
      saveOptions();
      renderLegend();
      requestDraw();
    });

    /* -------------------------------------------------------- draw */

    var drawPending = false, statusEl = document.getElementById('status');

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      Hh = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hh * dpr);
      requestDraw();
    }
    function requestDraw() {
      if (drawPending) return;
      drawPending = true;
      requestAnimationFrame(tick);
    }

    function draw() {
      frame++;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(theme.bg[0], theme.bg[1], theme.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!info) return;

      var s = view.s, U = tileProg.U;
      var res = cfg.shape.lod(s * dpr);
      var m = mesh(res);
      gl.useProgram(tileProg.p);
      var co = Math.cos(view.rot), si = Math.sin(view.rot), k = s * dpr;
      gl.uniformMatrix2fv(U.u_view, false, [co * k, si * k, -si * k, co * k]);
      gl.uniform2f(U.u_half, canvas.width / 2, canvas.height / 2);
      gl.uniform2f(U.u_ab, ab[0], ab[1]);
      gl.uniform1f(U.u_scale, k);
      gl.uniform1i(U.u_classMode, cfg.classMode || 0);
      gl.uniform3fv(U.u_class, new Float32Array([].concat.apply([], classColours())));
      gl.uniform1i(U.u_levels, outlines ? 1 : 0);
      gl.uniform3fv(U.u_edge, theme.edge);
      gl.uniform3fv(U.u_line, theme.line);
      gl.uniform3fv(U.u_edgeAlt, theme.edgeAlt);
      gl.uniform3fv(U.u_lineAlt, theme.lineAlt);
      gl.uniform3fv(U.u_hot, theme.hot);
      gl.uniform3fv(U.u_hot2, theme.hot2);
      var corners = cfg.shape.corners();
      gl.uniform2fv(U.u_corners, new Float32Array([].concat.apply([], corners)));
      // Supertile lines thicken with the supertile's size on screen, about
      // 2.8 times per level, so small supertiles never bury their tiles.
      var widths = [1.0];
      for (var lv = 1; lv <= 5; lv++) {
        var wd = Math.min(6, Math.max(0, 0.45 * Math.log2(s * Math.pow(2.8, lv) / 4)));
        if (widths[lv - 1] > 0 && lv > 1) wd = Math.max(wd, widths[lv - 1] + 0.4);
        widths.push(Math.min(6, wd));
      }
      gl.uniform1fv(U.u_width, new Float32Array(widths.map(function (w) { return w * dpr / 2; })));
      var t = Math.min(1, Math.max(0, (s - 1.2) / 5));
      gl.uniform1f(U.u_edgeAlpha, 0.22 + 0.63 * t * t * (3 - 2 * t));
      var prof = cfg.shape.profile(res);
      if (prof && prof.pts.length >= 2) {
        var arr = new Float32Array(130);
        prof.pts.slice(0, 65).forEach(function (p, i) { arr[2 * i] = p[0]; arr[2 * i + 1] = p[1]; });
        gl.uniform2fv(U.u_prof, arr);
        gl.uniform1i(U.u_profN, Math.min(65, prof.pts.length));
        gl.uniform1f(U.u_profMax, prof.maxAbs);
        gl.uniform1i(U.u_profAlt, prof.alt ? 1 : 0);
      } else {
        gl.uniform1i(U.u_profN, 0);
      }
      gl.uniform1f(U.u_reach, (Math.max.apply(null, widths) * dpr / 2 + 1.5) / k);

      // Grid.
      var lat = grid.on && grid.picks.length ? lattices() : [], on = 0, latM = new Float32Array(8), gp = [0, 0];
      if (lat.length) {
        gp = relOf(grid.picks[0].P, grid.picks[0].R);
        lat.forEach(function (B, i) { if (B) { on |= 1 << i; latM.set(inverse(B), 4 * i); } });
      }
      gl.uniform1i(U.u_gridOn, on);
      gl.uniformMatrix2fv(U.u_lat, false, latM);
      gl.uniform3fv(U.u_dotCol, new Float32Array(theme.grid[0].concat(theme.grid[1])));
      gl.uniform1f(U.u_dotRange, 400);
      gl.uniform1f(U.u_dotR, Math.min(3.2, Math.max(1.4, 0.22 * s)) * dpr);
      gl.uniform2f(U.u_anchor, gp[0], gp[1]);

      // Which chunks the view needs, in reference coordinates.
      var corners4 = [[-W / 2, -Hh / 2], [W / 2, -Hh / 2], [W / 2, Hh / 2], [-W / 2, Hh / 2]].map(function (c) {
        return refFromRel(screenToRel(c[0], c[1]));
      });
      var cr = camRef();
      var marginRef = 6 * Math.max(ab[0], ab[1] || 0, 1);
      if (slope && info.spread) {
        var dev = Math.abs(Math.sqrt(3) * ab[0] - ab[1]) / Math.hypot(slope[0] + refB, slope[1]) * info.spread * 1.5;
        var M = Math.hypot.apply(null, cdiv([slope[0] + refB, slope[1]], [ab[0] * slope[0] + ab[1], ab[0] * slope[1]]));
        marginRef = M * (dev + 6 * Math.max(ab[0], ab[1])) + 4;
      }
      var rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
      corners4.forEach(function (c) {
        rx0 = Math.min(rx0, c[0]); rx1 = Math.max(rx1, c[0]); ry0 = Math.min(ry0, c[1]); ry1 = Math.max(ry1, c[1]);
      });
      var i0 = Math.floor((cr[0] + rx0 - marginRef) / CHUNK), i1 = Math.floor((cr[0] + rx1 + marginRef) / CHUNK);
      var j0 = Math.floor((cr[1] + ry0 - marginRef) / CHUNK), j1 = Math.floor((cr[1] + ry1 + marginRef) / CHUNK);
      var needed = [], draws = [], missing = 0;
      var tileR = cfg.tileRadius ? cfg.tileRadius(ab) : 5;
      var half = Math.hypot(W, Hh) / 2 / s;
      for (var i = i0 - 1; i <= i1 + 1; i++) {
        for (var j = j0 - 1; j <= j1 + 1; j++) {
          var key = i + ',' + j, c = cache.get(key);
          var inView = i >= i0 && i <= i1 && j >= j0 && j <= j1;
          if (!c) {
            var dx = (i + 0.5) * CHUNK - cr[0], dy = (j + 0.5) * CHUNK - cr[1];
            needed.push({ key: key, i: i, j: j, d: dx * dx + dy * dy + (inView ? 0 : 1e15) });
            if (inView) missing++;
            continue;
          }
          c.used = frame;
          if (!c.count) continue;
          var o = relOf(c.P0, c.R0);
          // The chunk's world box, from its p and zeta*r ranges.
          var bx0 = o[0] + ab[0] * c.lo[0] + ab[1] * c.lo[2] - tileR, bx1 = o[0] + ab[0] * c.hi[0] + ab[1] * c.hi[2] + tileR;
          var by0 = o[1] + ab[0] * c.lo[1] + ab[1] * c.lo[3] - tileR, by1 = o[1] + ab[0] * c.hi[1] + ab[1] * c.hi[3] + tileR;
          var ccx = (bx0 + bx1) / 2, ccy = (by0 + by1) / 2, rad = Math.hypot(bx1 - bx0, by1 - by0) / 2;
          if (Math.hypot(ccx, ccy) > half + rad) continue;
          draws.push({ c: c, o: o });
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, baseBuf);
      [0, 1].forEach(function (pass) {
        var first = pass ? m.hotFirst : m.first, count = pass ? m.hotCount : m.count;
        if (!count) return;
        gl.uniform1i(U.u_pass, pass);
        draws.forEach(function (d) {
          gl.uniform2f(U.u_chunk, d.o[0], d.o[1]);
          gl.bindVertexArray(d.c.vao);
          gl.drawArraysInstanced(gl.TRIANGLES, first, count, d.c.count);
        });
      });
      gl.bindVertexArray(null);

      // Grid lines and picked corners on top.
      if (lat.length) {
        var O = overProg.U;
        gl.useProgram(overProg.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform2f(O.u_half, canvas.width / 2, canvas.height / 2);
        // Device pixels (y up, from the centre) to world offset from the camera.
        gl.uniformMatrix2fv(O.u_inv, false, [co / k, -si / k, si / k, co / k]);
        gl.uniform2f(O.u_anchor, gp[0], gp[1]);
        gl.uniform1i(O.u_on, on);
        gl.uniformMatrix2fv(O.u_lat, false, latM);
        var gapArr = new Float32Array(6);
        lat.forEach(function (B, i2) { if (B) gapArr.set(gaps(B), 3 * i2); });
        gl.uniform3fv(O.u_gap, gapArr);
        gl.uniform3fv(O.u_col, new Float32Array(theme.grid[0].concat(theme.grid[1])));
        gl.uniform1f(O.u_scale, k);
        gl.uniform1f(O.u_px, dpr);
        var pk = new Float32Array(6);
        grid.picks.forEach(function (p, i3) { var r = relOf(p.P, p.R); pk[2 * i3] = r[0]; pk[2 * i3 + 1] = r[1]; });
        gl.uniform2fv(O.u_picks, pk);
        gl.uniform1i(O.u_nPicks, grid.picks.length);
        gl.uniform3fv(O.u_pickCol, theme.pick);
        gl.bindVertexArray(overVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }

      statusEl.hidden = missing === 0;
      requestChunks(needed);
      evict();
      compassEl.hidden = Math.abs(view.rot) < 1e-4;
      compassEl.firstElementChild.style.transform = 'rotate(' + (-view.rot * 180 / Math.PI) + 'deg)';
    }

    /* -------------------------------------------------- navigation */

    var anim = { zoomTo: null, ax: 0, ay: 0, panX: 0, panY: 0, vx: 0, vy: 0, rotTo: null };
    var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lastTick = 0;
    function clampS(s) { return Math.min(MAX_S, Math.max(MIN_S, s)); }

    // Pan by a screen movement in CSS pixels: the map follows the pointer.
    function panBy(dx, dy) {
      var v = screenToRel(-dx, -dy);
      moveBy(v);
      changed();
    }
    // Zoom about a screen point, which stays under the pointer.
    function zoomAbout(factor, px, py) {
      var ns = clampS(view.s * factor);
      var before = screenToRel(px - W / 2, py - Hh / 2);
      view.s = ns;
      var after = screenToRel(px - W / 2, py - Hh / 2);
      moveBy([before[0] - after[0], before[1] - after[1]]);
      changed();
    }
    function wrapAngle(a) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }
    // Turn about a screen point, which stays put.
    function rotateAbout(angle, px, py) {
      var before = screenToRel(px - W / 2, py - Hh / 2);
      view.rot = wrapAngle(view.rot + angle);
      var after = screenToRel(px - W / 2, py - Hh / 2);
      moveBy([before[0] - after[0], before[1] - after[1]]);
      renderLegendSoon();
      changed();
    }
    // Snap back to north when a turn ends within four degrees of it.
    function snapNorth() {
      if (view.rot !== 0 && Math.abs(view.rot) < 4 * Math.PI / 180) { anim.rotTo = 0; requestDraw(); }
    }
    var legendTimer = 0;
    function renderLegendSoon() { clearTimeout(legendTimer); legendTimer = setTimeout(renderLegend, 120); }

    function zoomTowards(factor, px, py) {
      var target = clampS((anim.zoomTo || view.s) * factor);
      if (reduceMotion) { zoomAbout(target / view.s, px, py); return; }
      anim.zoomTo = target; anim.ax = px; anim.ay = py;
      requestDraw();
    }

    function tick(now) {
      drawPending = false;
      var dt = lastTick ? Math.min(64, now - lastTick) : 16;
      lastTick = now;
      var moving = false;
      if (anim.zoomTo) {
        var f = 1 - Math.exp(-dt / 55);
        zoomAbout(Math.pow(anim.zoomTo / view.s, f), anim.ax, anim.ay);
        if (Math.abs(Math.log(anim.zoomTo / view.s)) < 0.002) { zoomAbout(anim.zoomTo / view.s, anim.ax, anim.ay); anim.zoomTo = null; }
        else moving = true;
      }
      if (anim.rotTo !== null) {
        var g = 1 - Math.exp(-dt / 70), dr = wrapAngle(anim.rotTo - view.rot);
        if (Math.abs(dr) < 0.002) { rotateAbout(dr, W / 2, Hh / 2); anim.rotTo = null; renderLegend(); changed(); }
        else { rotateAbout(dr * g, W / 2, Hh / 2); moving = true; }
      }
      if (anim.panX || anim.panY) {
        var h = 1 - Math.exp(-dt / 70), mx = anim.panX * h, my = anim.panY * h;
        if (Math.abs(anim.panX) < 0.5 && Math.abs(anim.panY) < 0.5) { mx = anim.panX; my = anim.panY; }
        anim.panX -= mx; anim.panY -= my;
        panBy(mx, my);
        moving = moving || anim.panX !== 0 || anim.panY !== 0;
      }
      if (anim.vx || anim.vy) {
        panBy(anim.vx * dt, anim.vy * dt);
        var decay = Math.exp(-dt / 320);
        anim.vx *= decay; anim.vy *= decay;
        if (Math.hypot(anim.vx, anim.vy) < 0.015) { anim.vx = 0; anim.vy = 0; }
        else moving = true;
      }
      draw();
      if (moving || inFlight.size) requestDraw();
      else lastTick = 0;
    }

    /* ----------------------------------------------- address bar */

    var hashTimer = 0;
    function changed() {
      requestDraw();
      clearTimeout(hashTimer);
      hashTimer = setTimeout(writeHash, 300);
    }
    function fmt(x, d) { var s = x.toFixed(d); return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
    // #v=dx,dy,zoom,turn[,rx,ry]&c=colours[&k=custom]&page extras. The view
    // is kept relative to the start tile, so the numbers stay short.
    function writeHash() {
      if (!info) return;
      var st = info.start;
      var v = [fmt(view.P[0] - st.P[0], 2), fmt(view.P[1] - st.P[1], 2), fmt(view.s, 2), fmt(view.rot * 180 / Math.PI, 1)];
      if (slope) v.push(fmt(view.R[0] - st.R[0], 2), fmt(view.R[1] - st.R[1], 2));
      var parts = ['v=' + v.join(','), 'c=' + encodeURIComponent(sel)];
      if (sel.indexOf('custom:') === 0) parts.push('k=' + customs[sel.slice(7)].map(function (h) { return h.slice(1); }).join('-'));
      var extra = cfg.hashGet ? cfg.hashGet() : {};
      Object.keys(extra).forEach(function (key) { parts.push(key + '=' + encodeURIComponent(extra[key])); });
      try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) {}
    }
    function readHash() {
      var h = location.hash.replace(/^#/, '');
      if (!h) return false;
      var q = {};
      h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
      // The first version of the page wrote #x,y,zoom.
      if (!q.v && /^-?[\d.]+,-?[\d.]+,[\d.]+$/.test(h)) q.v = h;
      if (cfg.hashSet) cfg.hashSet(q);
      if (q.c && (presets[q.c] || q.c.indexOf('custom:') === 0)) {
        if (q.c.indexOf('custom:') === 0) {
          var gid = q.c.slice(7);
          if (groupings[gid] && q.k) {
            var list = q.k.split('-').map(function (x) { return '#' + x; });
            if (list.length === groupings[gid].n && list.every(function (x) { return /^#[0-9a-f]{6}$/i.test(x); })) {
              customs[gid] = list; sel = q.c;
            }
          }
        } else sel = q.c;
      }
      if (!q.v) return false;
      var v = q.v.split(',').map(parseFloat);
      if (v.length < 3 || v.some(isNaN)) return false;
      view.P = [info.start.P[0] + v[0], info.start.P[1] + v[1]];
      view.s = clampS(v[2]);
      view.rot = (v[3] || 0) * Math.PI / 180;
      view.R = slope && v.length >= 6 ? [info.start.R[0] + v[4], info.start.R[1] + v[5]] : info.start.R.slice();
      return true;
    }

    /* ----------------------------------------------------- storage */

    function saveOptions() {
      try {
        localStorage.setItem(store, JSON.stringify({ sel: sel, customs: customs, outlines: outlines,
          grid: { on: grid.on, on0: grid.on0, on30: grid.on30 } }));
      } catch (e) {}
    }
    function loadOptions() {
      try {
        var o = JSON.parse(localStorage.getItem(store) || '{}');
        if (o.customs) Object.keys(o.customs).forEach(function (g) {
          if (groupings[g] && Array.isArray(o.customs[g]) && o.customs[g].length === groupings[g].n) customs[g] = o.customs[g];
        });
        if (o.sel && (presets[o.sel] || (o.sel.indexOf('custom:') === 0 && customs[o.sel.slice(7)]))) sel = o.sel;
        outlines = !!o.outlines;
        if (o.grid) { grid.on = !!o.grid.on; grid.on0 = o.grid.on0 !== false; grid.on30 = o.grid.on30 !== false; }
      } catch (e) {}
    }

    /* ------------------------------------------------------- input */

    var pointers = new Map(), pinch = null, trail = [], lastTap = { t: 0, x: 0, y: 0 };
    var down = null, clickTimer = 0;
    var turnDrag = null;

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
      anim.vx = anim.vy = anim.panX = anim.panY = 0;
      // Ctrl-drag or right-drag turns the map about the screen centre.
      if (e.ctrlKey || e.button === 2) {
        turnDrag = { id: e.pointerId, a: Math.atan2(e.clientY - Hh / 2, e.clientX - W / 2) };
        canvas.classList.add('dragging');
        return;
      }
      if (e.button > 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      trail = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }];
      down = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false } : null;
      canvas.classList.add('dragging');
      if (pointers.size === 2) pinch = pinchState();
    });
    function pinchState() {
      var p = Array.from(pointers.values());
      return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), a: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x),
               x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    }
    canvas.addEventListener('pointermove', function (e) {
      if (turnDrag && e.pointerId === turnDrag.id) {
        var a = Math.atan2(e.clientY - Hh / 2, e.clientX - W / 2), da = a - turnDrag.a;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        turnDrag.a = a;
        // Screen y runs down, so a clockwise drag turns the map clockwise.
        rotateAbout(-da, W / 2, Hh / 2);
        return;
      }
      var p = pointers.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true;
      if (pointers.size === 1) {
        panBy(dx, dy);
        trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        if (trail.length > 8) trail.shift();
      } else if (pointers.size === 2 && pinch) {
        var n = pinchState();
        panBy(n.x - pinch.x, n.y - pinch.y);
        if (pinch.d > 0 && n.d > 0) zoomAbout(n.d / pinch.d, n.x, n.y);
        var da2 = n.a - pinch.a;
        if (da2 > Math.PI) da2 -= 2 * Math.PI;
        if (da2 < -Math.PI) da2 += 2 * Math.PI;
        if (Math.abs(da2) > 1e-4) rotateAbout(-da2, n.x, n.y);
        pinch = n;
        trail = [];
      }
    });
    function pointerEnd(e) {
      if (turnDrag && e.pointerId === turnDrag.id) {
        turnDrag = null;
        canvas.classList.remove('dragging');
        snapNorth();
        renderLegend();
        return;
      }
      if (!pointers.has(e.pointerId)) return;
      var wasPinch = pointers.size === 2;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (wasPinch) snapNorth();
      if (pointers.size === 1) {
        var q = pointers.values().next().value;
        trail = [{ t: e.timeStamp, x: q.x, y: q.y }];
        return;
      }
      if (pointers.size) return;
      canvas.classList.remove('dragging');
      if (e.type === 'pointercancel') return;
      // A click, not a drag: pick a grid corner, unless a double click follows.
      if (down && !down.moved && e.timeStamp - down.t < 500) {
        var cx = e.clientX, cy = e.clientY;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(function () { clickAt(cx, cy); }, e.pointerType === 'touch' ? 320 : 260);
      }
      down = null;
      if (reduceMotion) return;
      // Fling: the speed over the last 80 ms of the drag.
      var last = trail[trail.length - 1], first = null;
      for (var k = trail.length - 1; k >= 0; k--) if (last && last.t - trail[k].t <= 80) first = trail[k];
      if (last && first && last !== first && e.timeStamp - last.t < 60) {
        var ms = Math.max(8, last.t - first.t);
        anim.vx = (last.x - first.x) / ms;
        anim.vy = (last.y - first.y) / ms;
        if (Math.hypot(anim.vx, anim.vy) < 0.1) anim.vx = anim.vy = 0;
        else requestDraw();
      }
      // A double tap on a touch screen zooms in, as a double click does.
      if (e.pointerType === 'touch') {
        var tap = trail.length <= 2;
        if (tap && e.timeStamp - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          clearTimeout(clickTimer);
          zoomTowards(2, e.clientX, e.clientY);
          lastTap.t = 0;
        } else if (tap) {
          lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
        }
      }
    }
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);

    canvas.addEventListener('dblclick', function (e) {
      e.preventDefault();
      clearTimeout(clickTimer);
      zoomTowards(e.shiftKey ? 0.5 : 2, e.clientX, e.clientY);
    });

    // Mouse wheels send big steps, animated. Trackpads send small ones, and a
    // pinch arrives as a wheel event with ctrlKey set; both apply at once.
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
      if (e.ctrlKey) zoomAbout(Math.exp(-dy * 0.01), e.clientX, e.clientY);
      else if (Math.abs(dy) >= 50 && e.deltaX === 0) zoomTowards(Math.exp(-dy * 0.003), e.clientX, e.clientY);
      else zoomAbout(Math.exp(-dy * 0.004), e.clientX, e.clientY);
    }, { passive: false });

    // Safari on a Mac reports a trackpad pinch and twist as gesture events.
    // It is the only desktop browser that passes a twist to the page.
    var gesture = { scale: 1, rotation: 0 };
    canvas.addEventListener('gesturestart', function (e) { e.preventDefault(); gesture = { scale: 1, rotation: 0 }; });
    canvas.addEventListener('gesturechange', function (e) {
      e.preventDefault();
      zoomAbout(e.scale / gesture.scale, e.clientX, e.clientY);
      rotateAbout(-(e.rotation - gesture.rotation) * Math.PI / 180, e.clientX, e.clientY);
      gesture = { scale: e.scale, rotation: e.rotation };
    });
    canvas.addEventListener('gestureend', function (e) { e.preventDefault(); snapNorth(); renderLegend(); });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      var step = Math.min(W, Hh) * 0.25, handled = true;
      if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        anim.rotTo = (anim.rotTo === null ? view.rot : anim.rotTo) + (e.key === 'ArrowLeft' ? 1 : -1) * Math.PI / 12;
      } else {
        switch (e.key) {
          case 'ArrowLeft': anim.panX += step; break;
          case 'ArrowRight': anim.panX -= step; break;
          case 'ArrowUp': anim.panY += step; break;
          case 'ArrowDown': anim.panY -= step; break;
          case '+': case '=': zoomTowards(1.6, W / 2, Hh / 2); break;
          case '-': case '_': zoomTowards(1 / 1.6, W / 2, Hh / 2); break;
          case '0': goHome(); break;
          case 'Escape': closeAbout(); break;
          default: handled = false;
        }
      }
      if (handled) { e.preventDefault(); requestDraw(); }
    });

    document.getElementById('zoom-in').addEventListener('click', function () { zoomTowards(2, W / 2, Hh / 2); });
    document.getElementById('zoom-out').addEventListener('click', function () { zoomTowards(0.5, W / 2, Hh / 2); });
    document.getElementById('home').addEventListener('click', goHome);
    // Turn buttons, for a mouse with no twist gesture: 5° a press.
    function turnBy(a) {
      anim.rotTo = (anim.rotTo === null ? view.rot : anim.rotTo) + a;
      requestDraw();
    }
    document.getElementById('turn-left').addEventListener('click', function () { turnBy(Math.PI / 36); });
    document.getElementById('turn-right').addEventListener('click', function () { turnBy(-Math.PI / 36); });
    var compassEl = document.getElementById('compass');
    compassEl.addEventListener('click', function () {
      anim.rotTo = 0;
      requestDraw();
    });

    function goHome() {
      anim.vx = anim.vy = anim.panX = anim.panY = 0;
      var rel = relOf(info.start.P, info.start.R), sc = relToScreen(rel);
      if (Math.hypot(sc[0], sc[1]) < 4 * Math.max(W, Hh) && !reduceMotion) {
        anim.panX = -sc[0]; anim.panY = -sc[1];
      } else {
        view.P = info.start.P.slice(); view.R = info.start.R.slice();
      }
      anim.zoomTo = START_S / view.s === 1 ? null : START_S;
      anim.ax = W / 2; anim.ay = Hh / 2;
      anim.rotTo = view.rot ? 0 : null;
      changed();
    }

    /* --------------------------------------------- about and fold */

    var aboutEl = document.getElementById('about'), aboutOpen = document.getElementById('about-open');
    function closeAbout() {
      if (aboutEl.hidden) return;
      aboutEl.hidden = true;
      aboutOpen.focus();
    }
    aboutOpen.addEventListener('click', function () {
      aboutEl.hidden = !aboutEl.hidden;
      if (!aboutEl.hidden) document.getElementById('about-close').focus();
    });
    document.getElementById('about-close').addEventListener('click', closeAbout);
    // A press anywhere outside the About sheet closes it. The press still
    // does its usual job, so a drag on the map starts moving it too.
    document.addEventListener('pointerdown', function (e) {
      if (aboutEl.hidden || aboutEl.contains(e.target) || aboutOpen.contains(e.target)) return;
      aboutEl.hidden = true;
    }, true);
    var optionsEl = document.querySelector('.options'), foldEl = document.getElementById('options-fold');
    if (window.innerWidth <= 640) optionsEl.classList.add('folded');
    foldEl.addEventListener('click', function () {
      optionsEl.classList.toggle('folded');
      foldEl.setAttribute('aria-expanded', !optionsEl.classList.contains('folded'));
    });

    /* ------------------------------------------------------- reset */

    // Each panel resets its own options to how the page first opens. The
    // colour panel: the first preset and no custom colours. The theme is
    // left alone, since it is shared with the rest of the site.
    function resetColours() {
      sel = cfg.presets[0].id;
      customs = {};
      renderSchemeSelect();
      saveOptions();
      renderLegend();
      changed();
    }
    // The options panel: the page's own default shape, no supertiles and no
    // grid. The view stays put, since the home button already resets it.
    document.getElementById('reset-options').addEventListener('click', function () {
      outlines = outlinesEl.checked = false;
      grid.on = gridEl.checked = false;
      grid.on0 = grid0El.checked = true;
      grid.on30 = grid30El.checked = true;
      grid.picks = [];
      if (cfg.onReset) cfg.onReset();
      gridChanged();
      renderLegend();
      changed();
    });

    /* ------------------------------------------------------- boot */

    function begin(inf) {
      info = inf;
      if (info.kappa) slope = info.kappa;
      view.P = info.start.P.slice();
      view.R = info.start.R.slice();
      readHash();
      if (cfg.onReady) cfg.onReady(info);
      renderSchemeSelect();
      renderLegend();
      if (grid.on) gridChanged();
      requestDraw();
    }

    loadOptions();
    outlinesEl.checked = outlines;
    gridEl.checked = grid.on;
    grid0El.checked = grid.on0;
    grid30El.checked = grid.on30;
    gridSubEl.hidden = !grid.on;
    canvas.classList.toggle('picking', grid.on);
    renderGridHint();
    renderSchemeSelect();

    Audit.wireThemeToggle();
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', resize);
    window.addEventListener('hashchange', function () { if (info && readHash()) { renderSchemeSelect(); renderLegend(); requestDraw(); } });
    resize();
    applyTheme();
    startWorkers();

    /* ---------------------------------------------------- page API */

    map.shapeChanged = function () { renderLegendSoon(); changed(); };
    map.setAB = function (a, b) { ab = [a, b]; renderLegendSoon(); changed(); };
    map.ab = function () { return ab.slice(); };
    map.info = function () { return info; };
    map.redraw = requestDraw;
    map.changed = changed;
    map.renderLegend = renderLegend;
    map.scale = function () { return view.s; };
    map.zoomTo = function (s) { zoomTowards(s / view.s, W / 2, Hh / 2); };
    return map;
  }

  global.TilingMap = { start: start, oklch: oklch, hex: hex, toHex: toHex, faces: faces, crossings: crossings, triangulate: triangulate, tidy: tidy, area: area };
})(this);
