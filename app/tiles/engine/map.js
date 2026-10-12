/* The map engine shared by the Spectre and Hat pages: WebGL drawing, chunks
   built by Web Workers, pan, zoom and rotate, colours and the colour key,
   the grid tool and the address-bar state. A page supplies its tiling, its
   tile shape and its colour presets, and adds its own controls.

   Tiles arrive from the worker in chunks. Each tile carries a two-part
   position (see tiling-core.js) and draws at a*p + b*zeta*r, so the Hat page
   can reshape every loaded tile at once by changing a and b.

   A tile shape usually has one outline, which mirrored tiles draw
   reflected. A shape with hands: 2 has a second outline for mirrored
   tiles, as the Hat (extended) page needs once its edges curve. With
   handByTurn as well, the second outline is for tiles at odd turns instead:
   the Spectre page uses it when its two edge lengths differ.

   The Krinkle page passes record: 'krinkle' and maxCorners: 242. Its tiles
   carry a plain centre and an 8-bit turn of 2 pi / info.turns, it has no
   grid tool (grid: false), and its steppers change the tiling itself, so it
   calls map.rebuild(options, wait) for new workers and a fresh cache. Its
   startScale is a function of the tiling's info and the window, so the
   opening zoom suits each tile.

   Krinkle also has a construction clock, map.setPlayback(tau). Tau runs from
   0 to w + 1 and only hides tiles, in the vertex shader: stage g < w grows
   wedge g row by row, and stage w grows every other copy together. See
   docs/krinkle.md, phase 4. */
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

  /* The tile shaders are compiled per page with two constants. NC is the
     most corners a tile can have: 14 for the Hat and Spectre, 146 for
     Krinkle. FORMAT is the tile record: 0 for the Hat and Spectre (see
     tiling-core.js), 1 for Krinkle (see krinkle/tiling.js). In format 1 a
     tile has a plain centre, row r and column c, an 8-bit turn and two
     wedge boundary flags, and is never mirrored. */
  var TILE_VS = [
    '#version 300 es',
    'layout(location=0) in vec2 a_local;',
    'layout(location=1) in vec4 a_pr;',
    'layout(location=2) in uvec3 a_bits;',
    '#if FORMAT == 1',
    'layout(location=3) in ivec2 a_rc;',
    'flat out ivec2 v_rc;',
    'uniform int u_w;',
    // The construction clock: below 0 every tile shows. u_rows is the row
    // count that passes the farthest screen corner.
    'uniform float u_tau;',
    'uniform float u_rows;',
    '#endif',
    'uniform vec2 u_chunk;',
    'uniform vec2 u_ab;',
    'uniform mat2 u_view;',
    'uniform vec2 u_half;',
    'uniform vec2 u_anchor;',
    'uniform int u_hand;',
    'uniform int u_handTurn;',
    'uniform float u_turnStep;',
    'out vec2 v_local;',
    'out vec2 v_rel;',
    'flat out uvec3 v_bits;',
    'void main() {',
    '  uint turn = a_bits.x & TURN_MASK;',
    '  bool flip = (a_bits.x & FLIP_BIT) != 0u;',
    // A tile's hand is its mirror flag, or the parity of its turn when the
    // page draws odd turns with their own outline.
    '  int hand = u_handTurn == 1 ? int(turn & 1u) : int(flip);',
    // A mesh for one hand only: tiles of the other hand go off screen.
    '  bool hide = u_hand >= 0 && hand != u_hand;',
    '#if FORMAT == 1',
    // Tile (r, c) of a wedge comes in at r + (c + 1) / (r + 1), which runs
    // row by row and, inside a row, tile by tile. A wedge of the first copy
    // grows in the stage of its place in the fan, and every wedge of the
    // other copies in the last stage.
    '  if (u_tau >= 0.0) {',
    '    int wedge = int(turn);',
    '    float stage = wedge < u_w ? float(wedge) : float(u_w);',
    '    float f = clamp(u_tau - stage, 0.0, 1.0);',
    '    float key = float(a_rc.x) + float(a_rc.y + 1) / float(a_rc.x + 1);',
    '    if (f < 1.0 && key > f * u_rows) hide = true;',
    '  }',
    '#endif',
    '  if (hide) {',
    '    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);',
    '    v_local = vec2(0.0); v_rel = vec2(0.0); v_bits = uvec3(0u);',
    '#if FORMAT == 1',
    '    v_rc = ivec2(0);',
    '#endif',
    '    return;',
    '  }',
    '  vec2 v = a_local;',
    '  if (flip) v.y = -v.y;',
    '  float t = float(turn) * u_turnStep;',
    '  float c = cos(t), s = sin(t);',
    '#if FORMAT == 1',
    '  vec2 w = u_chunk + a_pr.xy + vec2(c * v.x - s * v.y, s * v.x + c * v.y);',
    '  v_rc = a_rc;',
    '#else',
    '  vec2 zr = vec2(0.8660254037844386 * a_pr.z - 0.5 * a_pr.w, 0.5 * a_pr.z + 0.8660254037844386 * a_pr.w);',
    '  vec2 w = u_chunk + u_ab.x * a_pr.xy + u_ab.y * zr + vec2(c * v.x - s * v.y, s * v.x + c * v.y);',
    '#endif',
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
  //
  // The corners live in a texture, one row per hand, since 146 of them would
  // overflow the uniforms a phone allows. Texel i holds corner i in x and y,
  // and edge i's code in z: its symmetry for unmirrored tiles in bits 0-1,
  // for mirrored tiles in bits 2-3, and in bit 4 whether it takes profile B.
  // Rows 2 and 3 hold each hand's edge blocks: texel b is the circle (x, y,
  // radius) round edges 4b to 4b + 3 (BS is 4), their profiles and their
  // corners.
  // The class colours live in a second texture of up to 256 entries.
  var TILE_FS = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'in vec2 v_local;',
    'in vec2 v_rel;',
    'flat in uvec3 v_bits;',
    '#if FORMAT == 1',
    'flat in ivec2 v_rc;',
    'uniform int u_k;',
    'uniform int u_w;',
    '#endif',
    'uniform highp sampler2D u_shapeTex;',
    'uniform int u_shapeRow;',
    'uniform int u_nc;',
    'uniform highp sampler2D u_palette;',
    'uniform float u_turnStep;',
    'uniform float u_scale;',
    'uniform int u_classMode;',
    'uniform bool u_levels;',
    'uniform float u_width[6];',
    'uniform float u_edgeAlpha;',
    'uniform vec3 u_edge;',
    'uniform vec3 u_line;',
    'uniform vec3 u_edgeAlt;',
    'uniform vec3 u_lineAlt;',
    // Up to two edge profiles of 65 points each, A then B. Each edge's code
    // picks the profile and its symmetry (1 backwards, 2 reflected).
    'uniform vec2 u_prof[130];',
    'uniform ivec2 u_profN;',
    'uniform vec2 u_profMax;',
    'uniform float u_reach;',
    'uniform float u_cull;',
    'uniform int u_pass;',
    'uniform vec3 u_hot;',
    'uniform vec3 u_hot2;',
    'uniform int u_gridOn;',
    'uniform mat2 u_lat[2];',
    'uniform vec3 u_dotCol[2];',
    'uniform float u_dotRange;',
    'uniform float u_dotR;',
    'out vec4 outColor;',
    'vec4 corner(int i) { return texelFetch(u_shapeTex, ivec2(i, u_shapeRow), 0); }',
    '#if FORMAT == 1',
    // Krinkle draws wedge outlines. A tile on a wedge's lower boundary
    // (c = 0) has edges 0 to k - 1 on it, and one on the upper boundary
    // (c = r) has edges k + 2 to 2k + 1. The seams between copies, below the
    // first wedge of each copy and above its last, draw at level 4, and the
    // other wedge boundaries at level 2.
    'uint wedgeLevel(int i, bool vert) {',
    '  int j = int(v_bits.x & 255u) % u_w;',
    '  uint lv = 0u;',
    '  if ((v_bits.x & 256u) != 0u && (vert ? i <= u_k : i < u_k)) lv = j == 0 ? 4u : 2u;',
    '  if ((v_bits.x & 512u) != 0u && (i >= u_k + 2 || (vert && i == 0))) lv = max(lv, j == u_w - 1 ? 4u : 2u);',
    '  return lv;',
    '}',
    'uint edgeLevel(int i) { return wedgeLevel(i, false); }',
    'uint vertLevel(int i) { return wedgeLevel(i, true); }',
    '#else',
    'uint edgeLevel(int i) {',
    '  return i < 8 ? (v_bits.x >> uint(8 + 3 * i)) & 7u : (v_bits.y >> uint(3 * (i - 8))) & 7u;',
    '}',
    'uint vertLevel(int i) {',
    '  return i < 4 ? (v_bits.y >> uint(18 + 3 * i)) & 7u : (v_bits.z >> uint(3 * (i - 4))) & 7u;',
    '}',
    '#endif',
    // Class modes 0 and 1 serve the Hat and Spectre: the turn, or the turn
    // in 60-degree steps and the hand. Modes 2 to 7 serve Krinkle: the turn
    // mod 2, the copy q, rings of two rows, columns mod 2, one colour, and
    // the lattice cell (r mod 2, c mod 2).
    'int classOf(uint turn, bool flip) {',
    '  if (u_classMode == 0) return int(turn);',
    '  if (u_classMode == 1) return int(turn / 2u) + (flip ? 6 : 0);',
    '#if FORMAT == 1',
    '  if (u_classMode == 2) return int(turn & 1u);',
    '  if (u_classMode == 3) return int(turn) / u_w;',
    '  if (u_classMode == 4) return (v_rc.x >> 1) & 1;',
    '  if (u_classMode == 5) return v_rc.y & 1;',
    '  if (u_classMode == 7) return (v_rc.x & 1) + 2 * (v_rc.y & 1);',
    '#endif',
    '  return 0;',
    '}',
    'float segDist(vec2 p, vec2 a, vec2 b) {',
    '  vec2 pa = p - a, ba = b - a;',
    '  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);',
    '  return length(pa - ba * h);',
    '}',
    // Distance to edge i, following its profile when it has one. The
    // edge's symmetry is applied to the point, which measures the same
    // distance as applying it to the profile.
    'float edgeDist(vec2 p, vec2 a, vec2 b, int code, bool flip) {',
    '  float d = segDist(p, a, b);',
    '  int pb = (code >> 4) & 1;',
    '  int np = pb == 1 ? u_profN.y : u_profN.x;',
    '  if (np < 2) return d;',
    '  float mx = pb == 1 ? u_profMax.y : u_profMax.x;',
    '  vec2 e = b - a;',
    '  float L = length(e);',
    '  if (L < 1e-9) return d;',
    '  if (d > (mx + u_reach) * L) return d - mx * L;',
    '  vec2 ue = e / L, n = vec2(-ue.y, ue.x), q = p - a;',
    '  vec2 pp = vec2(dot(q, ue), dot(q, n)) / L;',
    '  int g = (flip ? code >> 2 : code) & 3;',
    '  if ((g & 1) != 0) pp.x = 1.0 - pp.x;',
    '  if ((g & 2) != 0) pp.y = -pp.y;',
    '  int off = pb * 65;',
    '  float best = 1e9;',
    '  for (int k = 0; k < 64; k++) {',
    '    if (k >= np - 1) break;',
    '    best = min(best, segDist(pp, u_prof[off + k], u_prof[off + k + 1]));',
    '  }',
    '  return best * L;',
    '}',
    'void main() {',
    '  uint turn = v_bits.x & TURN_MASK;',
    '  bool flip = (v_bits.x & FLIP_BIT) != 0u;',
    '  if (u_pass == 1) {',
    '    float st = mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) < 5.0 ? 1.0 : 0.0;',
    '    outColor = vec4(mix(u_hot, u_hot2, st), 1.0);',
    '    return;',
    '  }',
    '  vec3 fill = texelFetch(u_palette, ivec2(classOf(turn, flip), 0), 0).rgb;',
    '  float cov[6];',
    '  for (int k = 0; k < 6; k++) cov[k] = 0.0;',
    // A block of edges whose circle lies farther from this pixel than the
    // widest line reaches adds no ink, so it is skipped. A pixel lies near
    // only a few edges, which keeps a tile of 146 edges cheap.
    '  vec4 c0 = corner(0);',
    '  for (int bl = 0; bl < NB; bl++) {',
    '    int i0 = bl * BS;',
    '    if (i0 >= u_nc) break;',
    '    vec4 bc = texelFetch(u_shapeTex, ivec2(bl, 2 + u_shapeRow), 0);',
    '    if (length(v_local - bc.xy) - bc.z > u_cull) continue;',
    '    vec4 ca = corner(i0);',
    '    for (int q = 0; q < BS; q++) {',
    '      int i = i0 + q;',
    '      if (i >= u_nc) break;',
    '      vec4 cb = i + 1 == u_nc ? c0 : corner(i + 1);',
    '      vec2 a = ca.xy, b = cb.xy;',
    '      float d = edgeDist(v_local, a, b, int(ca.z), flip) * u_scale;',
    '      ca = cb;',
    '      int lv = u_levels ? int(min(edgeLevel(i), 5u)) : 0;',
    '      cov[lv] = max(cov[lv], clamp(u_width[lv] + 0.5 - d, 0.0, 1.0));',
    '      if (u_levels) {',
    '        int vl = int(min(vertLevel(i), 5u));',
    '        if (vl > 0) {',
    '          float dv = length(v_local - a) * u_scale;',
    '          cov[vl] = max(cov[vl], clamp(u_width[vl] + 0.5 - dv, 0.0, 1.0));',
    '        }',
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
    '    float t = float(turn) * u_turnStep;',
    '    float c = cos(t), s = sin(t);',
    '    for (int j = 0; j < NC; j++) {',
    '      if (j >= u_nc) break;',
    '      vec2 off = corner(j).xy - v_local;',
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
    var NC = cfg.maxCorners || 14, FORMAT = cfg.record === 'krinkle' ? 1 : 0;
    var MIN_S = 1, MAX_S = 400;
    var START_S = typeof cfg.startScale === 'function' ? 8 : (cfg.startScale || 8);
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
    var BS = 4, NB = Math.ceil(NC / BS);
    var defs = '#version 300 es\n#define NC ' + NC + '\n#define BS ' + BS + '\n#define NB ' + NB + '\n#define FORMAT ' + FORMAT +
      '\n#define TURN_MASK ' + (FORMAT ? '255u' : '15u') + '\n#define FLIP_BIT ' + (FORMAT ? '0u' : '16u');
    var tileProg = program(TILE_VS.replace('#version 300 es', defs), TILE_FS.replace('#version 300 es', defs),
      ['u_chunk', 'u_ab', 'u_view', 'u_half', 'u_anchor', 'u_hand', 'u_handTurn', 'u_turnStep', 'u_shapeTex', 'u_shapeRow',
      'u_nc', 'u_palette', 'u_k', 'u_w', 'u_tau', 'u_rows', 'u_scale', 'u_classMode', 'u_levels', 'u_width', 'u_edgeAlpha', 'u_edge', 'u_line',
      'u_edgeAlt', 'u_lineAlt', 'u_prof', 'u_profN', 'u_profMax',
      'u_reach', 'u_cull', 'u_pass', 'u_hot', 'u_hot2', 'u_gridOn', 'u_lat', 'u_dotCol', 'u_dotRange', 'u_dotR']);
    var overProg = program(OVERLAY_VS, OVERLAY_FS, ['u_half', 'u_inv', 'u_anchor', 'u_on', 'u_lat', 'u_gap',
      'u_col', 'u_scale', 'u_px', 'u_picks', 'u_nPicks', 'u_pickCol']);
    var overVao = gl.createVertexArray();

    // Float textures read with texelFetch: the corners and edge codes, one
    // row per hand, then the edge blocks, one row per hand; and the palette
    // of class colours.
    function floatTexture(w, h) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); });
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(function (p) { gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); });
      return t;
    }
    var PALETTE = 256;
    var shapeTex = floatTexture(NC, 4), paletteTex = floatTexture(PALETTE, 1);
    var shapeData = new Float32Array(NC * 4 * 4), paletteData = new Float32Array(PALETTE * 4);

    /* -------------------------------------------------- tile meshes */

    // Meshes for the current tile shape, one per level of detail and hand,
    // all in one buffer. Hand 1 is the outline for mirrored tiles, when the
    // shape has one. Each mesh has a fill range and an inside-out range.
    var baseBuf = gl.createBuffer();
    var meshData = [], meshes = new Map(), meshSig = null;
    var hands = cfg.shape.hands === 2 ? [0, 1] : [-1];
    function mesh(res, hand) {
      var sig = cfg.shape.signature();
      if (sig !== meshSig) { meshes.clear(); meshData = []; meshSig = sig; }
      var key = cfg.shape.lodKey(res) + (hand > 0 ? ':m' : '');
      if (meshes.has(key)) return meshes.get(key);
      var outline = tidy(cfg.shape.outline(res, hand > 0 ? 1 : 0));
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
        // Format 1 keeps r and c as integers in words 2 and 3.
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, FORMAT ? 2 : 4, gl.FLOAT, false, 28, 0);
        gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribIPointer(2, 3, gl.UNSIGNED_INT, 28, 16);
        gl.vertexAttribDivisor(2, 1);
        if (FORMAT) {
          gl.enableVertexAttribArray(3);
          gl.vertexAttribIPointer(3, 2, gl.INT, 28, 8);
          gl.vertexAttribDivisor(3, 1);
        }
      }
      gl.bindVertexArray(null);
      return { vao: vao, buf: buf, count: m.count, i: m.i, j: m.j, P0: m.P0, R0: m.R0, lo: m.lo, hi: m.hi, used: frame };
    }

    function dropChunk(c) {
      gl.deleteVertexArray(c.vao);
      if (c.buf) gl.deleteBuffer(c.buf);
      cache.delete(c.i + ',' + c.j);
    }
    function evict() {
      if (cache.size <= MAX_CHUNKS) return;
      var list = Array.from(cache.values()).filter(function (c) { return c.used < frame; });
      list.sort(function (a, b) { return a.used - b.used; });
      for (var k = 0; k < list.length && cache.size > MAX_CHUNKS * 0.8; k++) dropChunk(list[k]);
    }

    /* ------------------------------------------------------ workers */

    // Workers build chunks off the main thread. Opened from disk, a browser
    // may refuse to start a worker, so the page falls back to building
    // chunks itself between frames. Each start of the workers is a new
    // generation, and replies from an older one are dropped.
    var workers = [], ready = false, cornerCalls = new Map(), cornerId = 0;
    var options = cfg.options || {}, gen = 0, errorGen = -1;

    function onMessage(m, w) {
      if (w.gen !== gen) return;
      if (m.type === 'ready') {
        w.ready = true;
        if (!ready) { ready = true; if (info) rebuilt(m.info); else begin(m.info); }
      } else if (m.type === 'error') {
        // Every worker rejects the same options, so report it once.
        rebuilding = false;
        if (errorGen !== gen && cfg.onError) { errorGen = gen; cfg.onError(m.message); }
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

    // A tiling file answers messages through TilingCore.serve(cfg.build), or
    // through its own cfg.handler() when it does not build on TilingCore.
    function localWorker() {
      var w = { busy: 0, ready: false, queue: [], gen: gen, dead: false };
      var handle = null;
      function step() {
        if (w.dead || !w.queue.length) return;
        var m = w.queue.shift();
        handle(m, function (msg) { onMessage(msg, w); });
        if (w.queue.length) setTimeout(step, 0);
      }
      w.postMessage = function (m) { w.queue.push(m); setTimeout(step, 0); };
      w.terminate = function () { w.dead = true; w.queue = []; };
      setTimeout(function () {
        if (w.dead) return;
        handle = cfg.handler ? cfg.handler() : TilingCore.serve(cfg.build);
        handle({ type: 'init', options: options }, function (msg) { onMessage(msg, w); });
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
          w.gen = gen;
          (function (w) { w.onmessage = function (ev) { onMessage(ev.data, w); }; })(w);
          w.onerror = fallback;
          w.postMessage({ type: 'init', options: options });
          workers.push(w);
        }
      } catch (e) {
        fallback();
      }
    }

    // A custom set belongs to a grouping with a fixed number of groups. When
    // a rebuild changes that number, as a new Krinkle n does, the set is
    // stretched round the circle: new group i takes the old colour at
    // i × old count / new count. Krinkle's groups follow the circle, so a
    // gradient survives the stretch.
    function keepCustoms() {
      Object.keys(customs).forEach(function (id) {
        if (!groupings[id]) { delete customs[id]; return; }
        var old = customs[id], n = groupings[id].n;
        if (old.length === n) return;
        customs[id] = Array.from({ length: n }, function (x, i) { return old[Math.floor(i * old.length / n)]; });
        saveOptions();
      });
    }

    /* A new tiling from new options: fresh workers, an empty chunk cache
       and the same view. The old tiles stay on screen until the new
       workers are ready, so a rebuild never shows a blank map. A run of
       calls within `wait` milliseconds builds once, with the last options. */
    var rebuildTimer = 0, rebuilding = false;
    function rebuild(opts, wait) {
      clearTimeout(rebuildTimer);
      rebuilding = true;
      rebuildTimer = setTimeout(function () {
        options = opts || {};
        gen++;
        workers.forEach(function (w) { if (w.terminate) w.terminate(); });
        workers = [];
        inFlight.clear();
        cornerCalls.clear();
        ready = false;
        startWorkers();
      }, wait || 0);
    }
    function rebuilt(inf) {
      rebuilding = false;
      info = inf;
      CHUNK = info.chunkSize || cfg.chunkSize || 128;
      Array.from(cache.values()).forEach(dropChunk);
      START_S = startFor(info);
      if (cfg.onReady) cfg.onReady(info);
      keepCustoms();
      renderSchemeSelect();
      renderLegend();
      changed();
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
    var sel = cfg.defaultScheme || cfg.presets[0].id, customs = {};

    function currentGrouping() {
      return groupings[sel.indexOf('custom:') === 0 ? sel.slice(7) : presets[sel].grouping];
    }
    function groupColours() {
      if (sel.indexOf('custom:') === 0) return customs[sel.slice(7)].map(hex);
      return presets[sel].colours(dark);
    }
    // The classes the shader colours. A page whose classes depend on the
    // grouping, as Krinkle's do, passes a function of the grouping. A
    // grouping may set its own class mode (see classOf in the shader).
    function classList() { return typeof cfg.classes === 'function' ? cfg.classes(currentGrouping()) : cfg.classes; }
    function classMode() { var g = currentGrouping(); return g.mode !== undefined ? g.mode : cfg.classMode || 0; }
    function classColours() {
      var g = currentGrouping(), cols = groupColours();
      return classList().map(function (c, k) { return cols[g.of(k)]; });
    }
    // The zoom the page opens at, and the home button returns to. A page
    // passes a number, or a function of the tiling's info and the window.
    function startFor(inf) {
      return typeof cfg.startScale === 'function' ? clampS(cfg.startScale(inf, W, Hh)) : START_S;
    }
    // The angle of one turn: 30 degrees unless the tiling declares its turns.
    function turnStep() { return 2 * Math.PI / ((info && info.turns) || 12); }

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
       palettes. The 27 colours come up half the time and the other four an
       eighth each. A small palette is dealt like a shuffled deck, so every
       colour appears once before any appears twice, and two or more groups
       never all get the same colour.

       A grouping whose groups run in order round a circle, as Krinkle's
       wedges do, may give a roll() of its own that keeps that order. It
       takes half the rolls, and the five palettes share the other half. */
    function hex2(v) { return ('0' + Math.round(v).toString(16)).slice(-2); }
    var PALETTES = [
      { p: 0.5, colours: Array.from({ length: 27 }, function (x, i) {        // 00, 80, ff per channel
        return '#' + [Math.floor(i / 9), Math.floor(i / 3) % 3, i % 3].map(function (d) { return ['00', '80', 'ff'][d]; }).join('');
      }) },
      { p: 0.125, colours: null },                                            // any colour
      { p: 0.125, colours: ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00'] },
      { p: 0.125, colours: ['#ffffff', '#000000'] },
      { p: 0.125, colours: Array.from({ length: 8 }, function (x, i) { var h = hex2(255 * i / 7); return '#' + h + h + h; }) }
    ];
    function shuffled(a) {
      a = a.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    function randomColours(n) {
      var u = Math.random(), k = 0;
      while (k < PALETTES.length - 1 && u >= PALETTES[k].p) { u -= PALETTES[k].p; k++; }
      var pal = PALETTES[k].colours, out = [];
      if (!pal) {
        for (var i = 0; i < n; i++) out.push('#' + hex2(Math.random() * 255) + hex2(Math.random() * 255) + hex2(Math.random() * 255));
        return out;
      }
      while (out.length < n) out = out.concat(shuffled(pal));
      return shuffled(out.slice(0, n));
    }
    document.getElementById('random-colours').addEventListener('click', function () {
      var g = currentGrouping();
      customs[g.id] = g.roll && Math.random() < 0.5 ? g.roll().map(toHex) : randomColours(g.n);
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
        Array.prototype.forEach.call(legendEl.querySelectorAll('.group[data-group="' + group + '"] polygon, .strip rect[data-group="' + group + '"]'),
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
      var c = classList()[cls];
      var pts = cfg.shape.outline(1, cfg.shape.handByTurn ? c.turn & 1 : c.flip), cx = 0, cy = 0;
      pts.forEach(function (p) { cx += p[0] / pts.length; cy += p[1] / pts.length; });
      var ang = c.turn * turnStep() + view.rot, co = Math.cos(ang), si = Math.sin(ang), rmax = 0;
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

    // A key with more groups than STRIP shows them as one strip of colour,
    // in order, since a tile for each would fill the screen. A click on the
    // strip picks the group under the pointer.
    var STRIP = 24;
    function stripHtml(g, cols) {
      var classes = classList(), caption = function (q) {
        for (var k = 0; k < classes.length; k++) if (g.of(k) === q) return classes[k].caption;
        return q;
      };
      var rects = '';
      for (var q = 0; q < g.n; q++) {
        rects += '<rect data-group="' + q + '" x="' + q + '" width="1.04" height="1" fill="' + css(cols[q]) + '"><title>' + caption(q) + '</title></rect>';
      }
      return '<button type="button" class="strip" aria-label="' + g.n + ' colours in order. Pick a colour for one of them">' +
        '<svg viewBox="0 0 ' + g.n + ' 1" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>' +
        '<span class="ends" aria-hidden="true"><span>' + caption(0) + '</span><span>' + caption(g.n - 1) + '</span></span></button>';
    }

    function renderLegend() {
      if (!theme || !info) return;
      var g = currentGrouping(), cols = groupColours();
      var html = '';
      legendToggle.textContent = legendOpen ? 'Hide' : 'Key';
      legendToggle.setAttribute('aria-expanded', legendOpen);
      legendEl.hidden = !legendOpen;
      if (legendOpen && g.n > STRIP) {
        html += stripHtml(g, cols);
        html += '<div><button type="button" class="linkish" id="reset-colours">Reset colours</button></div>';
        html += '<input type="color" id="legend-colour" tabindex="-1" aria-hidden="true">';
      } else if (legendOpen) {
        var order = g.order || Array.from({ length: g.n }, function (x, i) { return i; });
        html += '<div class="groups" style="grid-template-columns: repeat(' + (g.cols || 1) + ', auto)">';
        var classes = classList();
        order.forEach(function (q) {
          // Six tiles to a row at most, so a big group wraps evenly.
          var count = classes.filter(function (c, k) { return g.of(k) === q; }).length;
          html += '<button type="button" class="group" data-group="' + q + '" title="Pick a colour for these tiles"' +
            ' style="grid-template-columns: repeat(' + Math.min(count, 6) + ', auto)">';
          classes.forEach(function (c, k) {
            if (g.of(k) !== q) return;
            html += '<figure>' + tileSvg(k, cols[q]) + '<figcaption>' + c.caption + '</figcaption></figure>';
          });
          html += '</button>';
        });
        html += '</div>';
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
      function pick(q) {
        active = q;
        picker.value = toHex(groupColours()[active]);
        picker.click();
      }
      Array.prototype.forEach.call(legendEl.querySelectorAll('.group'), function (b) {
        b.addEventListener('click', function () { pick(+b.dataset.group); });
      });
      // A click from the keyboard has no pointer position, so it picks the
      // first group.
      var strip = legendEl.querySelector('.strip');
      if (strip) strip.addEventListener('click', function (e) {
        var r = strip.querySelector('svg').getBoundingClientRect();
        var q = e.detail ? Math.floor((e.clientX - r.left) / r.width * g.n) : 0;
        pick(Math.max(0, Math.min(g.n - 1, q)));
      });
    }

    /* --------------------------------------------------- grid tool */

    // A page turns the grid off with grid: false, as Krinkle does, and then
    // needs none of its controls.
    var hasGrid = cfg.grid !== false && !!document.getElementById('grid');
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
      if (hasGrid) {
        gridSubEl.hidden = !grid.on;
        canvas.classList.toggle('picking', grid.on);
        if (grid.on && !grid.picks.length) {
          pickNear([0, 0], function (c) { if (c) { grid.picks = [c]; requestDraw(); } });
        }
      }
      saveOptions();
      renderGridHint();
      requestDraw();
    }
    function renderGridHint() {
      var el = document.getElementById('grid-hint');
      if (!hasGrid || !el) return;
      var n = grid.picks.length;
      el.textContent = n <= 1 ? 'Click a corner to move the grid there. Click two or three corners to fit a grid through them.'
        : n === 2 ? 'The grid takes the spacing and angle of the two corners. Click a third to slant it.'
        : 'A slanted grid through three corners. Click again to start over.';
      grid0El.disabled = grid30El.disabled = n >= 2;
    }
    if (hasGrid) {
      gridEl.addEventListener('change', function () { grid.on = gridEl.checked; gridChanged(); });
      grid0El.addEventListener('change', function () { grid.on0 = grid0El.checked; gridChanged(); });
      grid30El.addEventListener('change', function () { grid.on30 = grid30El.checked; gridChanged(); });
      document.getElementById('grid-clear').addEventListener('click', function () {
        grid.picks = [];
        gridChanged();
      });
    }
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

    // The construction clock: null shows every tile, and a number from 0 to
    // w + 1 shows the tiling part built. See TILE_VS for the stages.
    var tau = null;
    // How many rows of a wedge reach the farthest screen corner, so a stage
    // takes the same time to cross the screen at any zoom. The count follows
    // the view, which is what a still or a scripted frame wants.
    function playbackRows() {
      var cw = camWorld(), c = info.centre || [0, 0], far = 0;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        var rel = screenToRel(q[0] * W / 2, q[1] * Hh / 2);
        far = Math.max(far, Math.hypot(cw[0] + rel[0] - c[0], cw[1] + rel[1] - c[1]));
      });
      return Math.ceil((far + info.rowBase) / info.rowStep) + 1;
    }

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
      // A shape may fill with a plainer mesh than the profile its strokes
      // follow, once its curves are too small on screen to see in the fill.
      var meshRes = cfg.shape.meshLod ? cfg.shape.meshLod(s * dpr) : res;
      var ms = hands.map(function (h) { return mesh(meshRes, h); });
      gl.useProgram(tileProg.p);
      var co = Math.cos(view.rot), si = Math.sin(view.rot), k = s * dpr;
      gl.uniformMatrix2fv(U.u_view, false, [co * k, si * k, -si * k, co * k]);
      gl.uniform2f(U.u_half, canvas.width / 2, canvas.height / 2);
      gl.uniform2f(U.u_ab, ab[0], ab[1]);
      gl.uniform1f(U.u_scale, k);
      gl.uniform1i(U.u_classMode, classMode());
      gl.uniform1f(U.u_turnStep, turnStep());
      paletteData.fill(0);
      classColours().slice(0, PALETTE).forEach(function (c, i) { paletteData.set(c, 4 * i); });
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, paletteTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PALETTE, 1, gl.RGBA, gl.FLOAT, paletteData);
      gl.uniform1i(U.u_palette, 0);
      gl.uniform1i(U.u_levels, outlines ? 1 : 0);
      gl.uniform3fv(U.u_edge, theme.edge);
      gl.uniform3fv(U.u_line, theme.line);
      gl.uniform3fv(U.u_edgeAlt, theme.edgeAlt);
      gl.uniform3fv(U.u_lineAlt, theme.lineAlt);
      gl.uniform3fv(U.u_hot, theme.hot);
      gl.uniform3fv(U.u_hot2, theme.hot2);
      gl.uniform1i(U.u_handTurn, cfg.shape.handByTurn ? 1 : 0);
      if (FORMAT) {
        gl.uniform1i(U.u_k, info.k);
        gl.uniform1i(U.u_w, info.w);
        // The clock has finished, or is off, once every stage is done.
        var playing = tau !== null && info.arrangement !== 'repeat' && tau < info.w + 1;
        gl.uniform1f(U.u_tau, playing ? tau : -1);
        gl.uniform1f(U.u_rows, playing ? playbackRows() : 0);
      }
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
      // Edge profiles: A, and B for the edges in prof.sel. Each is a list of
      // points or null for straight edges.
      var prof = cfg.shape.profile(res) || {};
      var arr = new Float32Array(260), np = [0, 0], mx = [0, 0];
      [prof.pts, prof.pts2].forEach(function (pts, j) {
        if (!pts || pts.length < 2) return;
        np[j] = Math.min(65, pts.length);
        pts.slice(0, 65).forEach(function (p, i) {
          arr[130 * j + 2 * i] = p[0]; arr[130 * j + 2 * i + 1] = p[1];
          mx[j] = Math.max(mx[j], Math.abs(p[1]));
        });
      });
      gl.uniform2fv(U.u_prof, arr);
      gl.uniform2i(U.u_profN, np[0], np[1]);
      gl.uniform2f(U.u_profMax, mx[0], mx[1]);
      // Each hand's corners, for edge strokes, with each edge's code. The
      // corners differ only when odd turns have their own outline. A
      // profile gives each edge's symmetry and profile as symAt(i, flip) and
      // selAt(i), or for up to 14 edges as masks: sym, two bits per edge for
      // unmirrored and mirrored tiles, and sel, one bit per edge.
      var symAt = prof.symAt || function (i, f) { return ((prof.sym || [0, 0])[f] >> (2 * i)) & 3; };
      var selAt = prof.selAt || function (i) { return ((prof.sel || 0) >> i) & 1; };
      // How far each profile strays from its edge, in edge lengths.
      var stray = [0, 0];
      [prof.pts, prof.pts2].forEach(function (pts, j) {
        if (np[j] < 2) return;
        pts.slice(0, 65).forEach(function (p) {
          var dx = p[0] < 0 ? -p[0] : p[0] > 1 ? p[0] - 1 : 0;
          stray[j] = Math.max(stray[j], Math.hypot(dx, p[1]));
        });
      });
      var nc = 0;
      hands.forEach(function (h, row) {
        var cs = cfg.shape.corners(h > 0 ? 1 : 0) || [];
        nc = Math.min(NC, cs.length);
        for (var i = 0; i < nc; i++) {
          var o = 4 * (row * NC + i);
          shapeData[o] = cs[i][0]; shapeData[o + 1] = cs[i][1];
          shapeData[o + 2] = symAt(i, 0) + 4 * symAt(i, 1) + 16 * selAt(i);
        }
        // Each block's circle holds its corners, and reaches past them as
        // far as a profile strays from its edge.
        for (var b = 0; BS * b < nc; b++) {
          var e0 = BS * b, e1 = Math.min(nc, e0 + BS), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, e, p;
          for (e = e0; e <= e1; e++) {
            p = cs[e % nc];
            x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
          }
          var bx = (x0 + x1) / 2, by = (y0 + y1) / 2, r = 0, reach = 0;
          for (e = e0; e <= e1; e++) r = Math.max(r, Math.hypot(cs[e % nc][0] - bx, cs[e % nc][1] - by));
          for (e = e0; e < e1; e++) {
            var q = cs[(e + 1) % nc];
            reach = Math.max(reach, stray[selAt(e)] * Math.hypot(q[0] - cs[e][0], q[1] - cs[e][1]));
          }
          var ob = 4 * ((2 + row) * NC + b);
          shapeData[ob] = bx; shapeData[ob + 1] = by; shapeData[ob + 2] = r + reach;
        }
      });
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, shapeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NC, 4, gl.RGBA, gl.FLOAT, shapeData);
      gl.uniform1i(U.u_shapeTex, 1);
      gl.uniform1i(U.u_nc, nc);
      gl.uniform1f(U.u_reach, (Math.max.apply(null, widths) * dpr / 2 + 1.5) / k);
      // Past this distance from a block's circle no line reaches a pixel.
      gl.uniform1f(U.u_cull, (Math.max.apply(null, widths) * dpr / 2 + 1) / k);

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
      // A Krinkle tile can be far larger than a Hat, so a tile whose centre
      // lies outside the view may still reach into it.
      if (FORMAT && info.circumradius) marginRef = Math.max(marginRef, 1.25 * info.circumradius + 2);
      if (slope && info.spread) {
        var dev = Math.abs(refB * ab[0] - ab[1]) / Math.hypot(slope[0] + refB, slope[1]) * info.spread * 1.5;
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
      // Fills first, then the inside-out stripes over them, for each hand.
      [0, 1].forEach(function (pass) {
        gl.uniform1i(U.u_pass, pass);
        hands.forEach(function (h, hi) {
          var m = ms[hi], first = pass ? m.hotFirst : m.first, count = pass ? m.hotCount : m.count;
          if (!count) return;
          gl.uniform1i(U.u_hand, h);
          gl.uniform1i(U.u_shapeRow, hi);
          draws.forEach(function (d) {
            gl.uniform2f(U.u_chunk, d.o[0], d.o[1]);
            gl.bindVertexArray(d.c.vao);
            gl.drawArraysInstanced(gl.TRIANGLES, first, count, d.c.count);
          });
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
      // A comma stays as it is, so a pair such as mk=3,7 reads plainly.
      Object.keys(extra).forEach(function (key) { parts.push(key + '=' + encodeURIComponent(extra[key]).replace(/%2C/gi, ',')); });
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
        // A set saved for another group count is stretched to fit once the
        // tiling is ready (see keepCustoms).
        if (o.customs) Object.keys(o.customs).forEach(function (g) {
          var list = o.customs[g];
          if (groupings[g] && Array.isArray(list) && list.length && list.every(function (x) { return /^#[0-9a-f]{6}$/i.test(x); })) customs[g] = list;
        });
        if (o.sel && (presets[o.sel] || (o.sel.indexOf('custom:') === 0 && customs[o.sel.slice(7)]))) sel = o.sel;
        outlines = !!o.outlines;
        if (o.grid && hasGrid) { grid.on = !!o.grid.on; grid.on0 = o.grid.on0 !== false; grid.on30 = o.grid.on30 !== false; }
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

    // A number as the argument sets the zoom to return to, once.
    function goHome(scale, immediate) {
      anim.vx = anim.vy = anim.panX = anim.panY = 0;
      START_S = typeof scale === 'number' ? clampS(scale) : startFor(info);
      var rel = relOf(info.start.P, info.start.R), sc = relToScreen(rel);
      if (!immediate && Math.hypot(sc[0], sc[1]) < 4 * Math.max(W, Hh) && !reduceMotion) {
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
      sel = cfg.defaultScheme || cfg.presets[0].id;
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
      grid.on = false;
      grid.on0 = grid.on30 = true;
      grid.picks = [];
      if (hasGrid) { gridEl.checked = false; grid0El.checked = grid30El.checked = true; }
      if (cfg.onReset) cfg.onReset();
      gridChanged();
      renderLegend();
      changed();
    });

    /* ------------------------------------------------------- boot */

    function begin(inf) {
      info = inf;
      CHUNK = info.chunkSize || CHUNK;
      if (info.kappa) slope = info.kappa;
      view.P = info.start.P.slice();
      view.R = info.start.R.slice();
      START_S = view.s = startFor(info);
      readHash();
      if (cfg.onReady) cfg.onReady(info);
      keepCustoms();
      renderSchemeSelect();
      renderLegend();
      if (grid.on) gridChanged();
      requestDraw();
    }

    loadOptions();
    outlinesEl.checked = outlines;
    if (hasGrid) {
      gridEl.checked = grid.on;
      grid0El.checked = grid.on0;
      grid30El.checked = grid.on30;
      gridSubEl.hidden = !grid.on;
      canvas.classList.toggle('picking', grid.on);
    }
    renderGridHint();
    renderSchemeSelect();

    Theme.wireThemeToggle();
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
    map.rebuild = rebuild;
    // True from a rebuild call until the new workers are ready.
    map.busy = function () { return rebuilding; };
    map.home = goHome;
    // The construction clock, read or set. A number from 0 to w + 1, or null
    // to show every tile; w + 1 or more is the same as null. Krinkle only.
    map.setPlayback = function (t) {
      var v = typeof t === 'number' && isFinite(t) ? Math.max(0, t) : null;
      if (v === tau) return;
      tau = v;
      changed();
    };
    map.playback = function () { return tau; };
    // The colour scheme, read or set by preset id.
    map.scheme = function (id) {
      if (id === undefined) return sel;
      if (!presets[id] || id === sel) return;
      sel = id;
      renderSchemeSelect();
      saveOptions();
      renderLegend();
      changed();
    };
    // Supertile or wedge outlines, read or set.
    map.outlines = function (on) {
      if (on === undefined) return outlines;
      on = !!on;
      if (on === outlines) return;
      outlines = outlinesEl.checked = on;
      saveOptions();
      renderLegend();
      requestDraw();
    };
    return map;
  }

  global.TilingMap = { start: start, oklch: oklch, hex: hex, toHex: toHex, faces: faces, crossings: crossings, triangulate: triangulate, tidy: tidy, area: area };
})(this);
