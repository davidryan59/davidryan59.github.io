/* Hyperbolic Models Explorer.

   Every pixel goes through the same three steps, whatever the model:
     1. The model's inverse map turns the pixel into a point v on the
        hyperboloid x² + y² − z² = −1 (z > 0), in the view's frame.
     2. The inverse of the view transform T, a Lorentz matrix, takes v to
        the world frame. Dragging and motion change T only.
     3. Reflections in the three sides of the triangle with angles π/p, π/q
        and π/r fold the world point into that triangle. The shader records
        the reflections it makes, and they give the pixel's colour.

   Precision. The GPU works in single floats, about seven digits. After
   every move, JavaScript folds the view centre back into the triangle with
   a symmetry of the tiling, so the shader's points stay close to home and
   the picture stays crisp however far the view travels.

   Colour. Each tiling's colours come from a permutation action of its
   triangle group on n points, found by a small search at start. A tile's
   colour is the point that its group element sends point 0 to. Two tiles
   that share an edge in Regular differ when an action is found. The
   snap back to home carries the colour permutations along with the view.

   The same model maps run in JavaScript, so a drag can find the point
   under the pointer. Plain JavaScript and WebGL 2, no library. */
(function () {
  'use strict';

  /* ---------- Models ---------- */

  // Each model: id, its number in the shader, its scale k, a name, whether
  // it is one of the six large buttons, the axis to fly along, and facts.
  var MODELS = [
    { id: 'poincare', n: 0, name: 'Poincaré disk', featured: true, fly: 'y',
      lines: 'Circle arcs, square to the rim', angles: 'True', sizes: 'Shrink towards the rim',
      made: 'Perspective view of the hyperboloid from (0, 0, −1).' },
    { id: 'klein', n: 1, name: 'Klein disk', featured: true, fly: 'y',
      lines: 'Straight', angles: 'Distorted', sizes: 'Shrink towards the rim',
      made: 'Perspective view of the hyperboloid from (0, 0, 0).' },
    { id: 'halfplane', n: 4, k: 1.25, name: 'Half-plane', featured: true, fly: 'y',
      lines: 'Semicircles and vertical lines', angles: 'True', sizes: 'Shrink towards the floor',
      made: 'The Poincaré disk opened out by a Möbius map.' },
    { id: 'band', n: 5, name: 'Band', featured: true, fly: 'x',
      lines: 'The middle line only', angles: 'True', sizes: 'Shrink towards both edges',
      made: 'The logarithm of the half-plane: a hyperbolic Mercator map.' },
    { id: 'hyperboloid', n: 13, name: 'Hyperboloid', featured: true, fly: 'y',
      lines: 'Cuts by planes through the origin', angles: 'Distorted in this view', sizes: 'True in Minkowski space',
      made: 'The surface x² + y² − z² = −1 that the other models project.' },
    { id: 'joukowsky', n: 6, k: 2.2, name: 'Joukowsky', featured: true, fly: 'x',
      lines: 'Curves', angles: 'True', sizes: 'Shrink towards the slit',
      made: 'The disk under z ↦ (z + 1/z) / 2, which opens it round a slit.' },
    { id: 'gans', n: 2, k: 5, name: 'Gans plane', fly: 'y',
      lines: 'Hyperbolas', angles: 'Distorted', sizes: 'Shrink outwards, slowly',
      made: 'The hyperboloid seen from directly above.' },
    { id: 'inverted', n: 3, name: 'Inverted disk', fly: 'y',
      lines: 'Circle arcs', angles: 'True', sizes: 'Grow without limit outwards',
      made: 'Perspective view from (0, 0, 1). The view centre is at infinity.' },
    { id: 'azeq', n: 7, k: 3.2, name: 'Equidistant', fly: 'y',
      lines: 'Only those through the centre', angles: 'Distorted', sizes: 'True distance from the centre',
      made: 'Azimuthal equidistant map: distance from the centre to scale.' },
    { id: 'azarea', n: 8, k: 5.2, name: 'Equal-area', fly: 'y',
      lines: 'Only those through the centre', angles: 'Distorted', sizes: 'Every area to scale',
      made: 'Azimuthal equal-area map, after Lambert.' },
    { id: 'cyleq', n: 9, k: 3.0, name: 'Cylindrical', fly: 'x',
      lines: 'The middle line only', angles: 'Distorted', sizes: 'True along and across the middle line',
      made: 'Cylindrical equidistant map: distance along and from one line.' },
    { id: 'cylarea', n: 10, k: 3.0, name: 'Cyl. equal-area', fly: 'x',
      lines: 'The middle line only', angles: 'Distorted', sizes: 'Every area to scale',
      made: 'Cylindrical equal-area map, after Lambert.' },
    { id: 'sinus', n: 11, k: 2.7, name: 'Sinusoidal', fly: 'x',
      lines: 'The middle line only', angles: 'Distorted', sizes: 'Every area to scale',
      made: 'Each row shrunk by the cosh of its distance from the middle line.' },
    { id: 'twopoint', n: 12, k: 3.2, name: 'Two-point', fly: 'x',
      lines: 'The line through the two points', angles: 'Distorted', sizes: 'True distance from two points',
      made: 'Two-point equidistant map, with points 2 units apart.' }
  ];
  var MODEL_BY_ID = {}, MODELS_BY_N = {};
  MODELS.forEach(function (m) { MODEL_BY_ID[m.id] = m; MODELS_BY_N[m.n] = m; });

  var PRESETS = [[7, 3, 2], [3, 7, 2], [5, 4, 2], [4, 5, 2], [8, 3, 2], [6, 4, 2], [4, 6, 2], [7, 3, 3]];
  var POLYGON = { 3: 'triangles', 4: 'squares', 5: 'pentagons', 6: 'hexagons', 7: 'heptagons', 8: 'octagons',
    9: 'nonagons', 10: 'decagons', 11: 'hendecagons', 12: 'dodecagons' };
  var PATTERNS = [
    { id: 'regular', name: 'Regular', mask: 2 },
    { id: 'rectified', name: 'Rectified', mask: 1 },
    { id: 'truncated', name: 'Truncated', mask: 3 },
    { id: 'snub', name: 'Snub' },
    { id: 'expanded', name: 'Expanded', mask: 6 },
    { id: 'omnitruncated', name: 'Omnitruncated', mask: 7 },
    { id: 'truncated-dual', name: 'Truncated dual', mask: 5 },
    { id: 'goldberg', name: 'Goldberg' }
  ];
  var PATTERN_BY_ID = new Map(PATTERNS.map(function (p) { return [p.id, p]; }));
  // Goldberg GP(m,n) runs over 1 ≤ m ≤ GOLDBERG_MAX and 0 ≤ n ≤ m. GP(n,m)
  // is the mirror image of GP(m,n), which the Left and Right buttons give.
  const GOLDBERG_MAX = 6;
  var DEFAULT_PATTERN = 'expanded', DEFAULT_GP = '1,1';
  function gpValid(m, n) { return m >= 1 && m <= GOLDBERG_MAX && n >= 0 && n <= m; }

  function gpName(size) { return 'GP(' + size + ')'; }
  function twisted() {
    var size = state.gp.split(',').map(Number);
    return size[1] > 0 && size[0] !== size[1];
  }
  function goldbergGroup(p, q, r) { return p >= 7 && q === 3 && r === 2; }

  // Twelve bright colours, ordered so that the first few differ most. Over
  // twelve colours, more hues follow round the colour wheel.
  var BRIGHT = ['#ff5d73', '#3fa7ff', '#ffd93d', '#4cd07d', '#8a6cff', '#ffa33f',
    '#ff7ad1', '#36c9c6', '#b7e04a', '#5c7cff', '#ff8a5c', '#c58bff'];
  var MAXN = 32;

  /* ---------- Colourings: a permutation action of the triangle group ---------- */

  // Finds generators s1, s2, s3 as involutions on n points such that
  // (s1 s2)^p = (s1 s3)^q = (s2 s3)^r = 1, s1 and s2 fix point 0, and s3
  // moves it. Points are numbered in order of first use, as in a coset
  // table, so each action is met once. Returns the table, false if none
  // exists, or null if the search ran out of budget.
  function findAction(orders, n, budget) {
    var rel = [[0, 1, orders[0]], [0, 2, orders[1]], [1, 2, orders[2]]];
    var t = new Int16Array(n * 3).fill(-1), count = 1, nodes = 0;
    t[0] = 0; t[1] = 0;
    function ok() {
      for (var x = 0; x < count; x++) for (var j = 0; j < 3; j++) {
        var a = rel[j][0], b = rel[j][1], m = rel[j][2], y = x, closed = false, k;
        for (k = 1; k <= m; k++) {
          y = t[y * 3 + a]; if (y < 0) break;
          y = t[y * 3 + b]; if (y < 0) break;
          if (y === x) { if (m % k) return false; closed = true; break; }
        }
        if (!closed && y >= 0 && k > m) return false;
      }
      return t[2] !== 0;
    }
    function rec() {
      if (++nodes > budget) return null;
      var idx = -1;
      for (var i = 0; i < count * 3; i++) if (t[i] < 0) { idx = i; break; }
      if (idx < 0) return count === n ? Array.from(t) : false;
      var x = Math.floor(idx / 3), g = idx % 3, cands = [];
      for (var y = 0; y < count; y++) if (t[y * 3 + g] < 0) cands.push(y);
      if (count < n) cands.push(count);
      for (var c = 0; c < cands.length; c++) {
        var z = cands[c], fresh = z === count;
        if (fresh) count++;
        t[x * 3 + g] = z; t[z * 3 + g] = x;
        if (ok()) { var res = rec(); if (res) return res; if (res === null) return null; }
        t[x * 3 + g] = -1; t[z * 3 + g] = -1;
        if (fresh) count--;
      }
      return false;
    }
    return rec();
  }

  var colourCache = {};
  // Two colourings per tiling: "many", nearest to seven colours from 5 to
  // 12 if one exists, and "few", the fewest colours possible.
  function colourings(p, q, r, corner) {
    var key = [p, q, r, corner].join(',');
    if (colourCache[key]) return colourCache[key];
    // Put the two generators of the corner stabiliser first in the search.
    var order = INCIDENT[corner].concat(OPPOSITE[corner]);
    var relations = [p, q, r];
    var orders = [corner, OPPOSITE.indexOf(order[1]), OPPOSITE.indexOf(order[0])]
      .map(function (i) { return relations[i]; });
    var few, many, fallback;
    for (var n = 2; n <= MAXN; n++) {
      var t = findAction(orders, n, 200000);
      if (t) {
        var action = { n: n, table: t.map(function (_, i) {
          return t[i - i % 3 + order.indexOf(i % 3)];
        }) };
        if (!few) few = action;
        if (!fallback && n >= 3) fallback = action;
        if (n >= 5 && n <= 12 && (!many || Math.abs(n - 7) < Math.abs(many.n - 7))) many = action;
      }
      if ((many && many.n === 7) || (n >= 12 && fallback)) break;
    }
    return colourCache[key] = { many: many || fallback || few, few: few };
  }

  function paletteFor(n) {
    if (n === 2) return ['#ffcf3f', '#3f9cff'];
    var out = BRIGHT.slice(0, Math.min(n, 12));
    for (var i = 12; i < n; i++) out.push(hsl((i * 137.508) % 360, 0.78, 0.62));
    return out;
  }
  function hsl(h, s, l) {
    var f = function (k) {
      var a = s * Math.min(l, 1 - l), m = (k + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1));
    };
    var c = [f(0), f(8), f(4)].map(function (v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); });
    return '#' + c.join('');
  }

  /* ---------- Shader ---------- */

  var VERT = '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  var FRAG = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'out vec4 outColor;',
    'uniform vec2 uRes, uPan;',
    'uniform float uZoom;',
    'uniform int uModel;',
    'uniform mat3 uTinv;',
    'uniform vec3 uN1, uN2, uN3;',
    '#ifdef WYTHOFF',
    'uniform int uEdgeMask;',
    'uniform vec3 uCorner, uEdgeEnd[3], uEdgeNormal[3];',
    'uniform ivec3 uTileMasks, uTileSides;',
    'uniform vec3 uTileCentre[3], uTileRadii, uDesignScales;',
    '#endif',
    '#ifdef DOMAIN',
    'uniform highp sampler2D uDomain;',
    'uniform ivec2 uFaceCounts;',
    'uniform int uHand;',
    '#endif',
    '#if defined(WYTHOFF) || defined(DOMAIN)',
    'uniform float uLargestRadius;',
    'uniform bool uLargestOnly;',
    '#endif',
    'uniform float uScaleLen, uEdgeW, uShade, uRadius;',
    'uniform int uStyle, uColourMode, uPar0;',
    'uniform bool uMirrors, uSingle, uClear, uMotif;',
    'uniform vec3 uXi;',
    'uniform bool uUpright;',
    'uniform float uDesignA;',
    'uniform mat3 uT;',
    'uniform vec2 uZ0;',
    'uniform float uPhi;',
    'uniform sampler2D uGlyph;',
    'uniform vec3 uBg, uEdge, uMono, uRim;',
    '#ifdef DOMAIN',
    'uniform uvec4 uPal[32];',
    'uniform ivec4 uAction[128];',
    '#elif defined(WYTHOFF)',
    'uniform uvec4 uPal[24];',
    'uniform ivec4 uAction[96];',
    '#else',
    'uniform uvec4 uPal[8];',
    'uniform ivec4 uAction[32];',
    '#endif',
    'uniform ivec4 uTypeColour;',
    'uniform vec3 uCamPos, uCamF, uCamR, uCamU;',
    'uniform float uFov, uK;',
    'const float PI = 3.14159265359;',
    'float shade = 1.0;',
    'vec3 palette(int i) {',
    '  uint rgb = uPal[i >> 2][i & 3];',
    '  return vec3((rgb >> 16) & 255u, (rgb >> 8) & 255u, rgb & 255u) / 255.0;',
    '}',
    'float mdot(vec3 a, vec3 b) { return a.x*b.x + a.y*b.y - a.z*b.z; }',
    'vec3 toCentre(vec3 p, vec3 c) {',
    '  return vec3(p.xy + c.xy * (dot(c.xy, p.xy) / (1.0 + c.z) - p.z), -mdot(p, c));',
    '}',
    // M <- R M, where R reflects in the mirror with normal N.
    'mat3 reflM(mat3 M, vec3 N) { vec3 n = vec3(N.xy, -N.z); vec3 r = vec3(dot(n, M[0]), dot(n, M[1]), dot(n, M[2]));',
    '  M[0] -= 2.0 * r.x * N; M[1] -= 2.0 * r.y * N; M[2] -= 2.0 * r.z * N; return M; }',
    'vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }',
    'vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x*b.x + a.y*b.y, a.y*b.x - a.x*b.y) / dot(b, b); }',
    'vec2 cexp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }',
    'vec2 csqrt(vec2 z) { float r = length(z); float a = sqrt(max(0.0, 0.5*(r + z.x))); float b = sqrt(max(0.0, 0.5*(r - z.x))); return vec2(a, z.y < 0.0 ? -b : b); }',
    'bool disk(vec2 d, out vec3 P) { float r2 = dot(d, d); if (r2 >= 0.99999) return false; P = vec3(2.0*d, 1.0 + r2) / (1.0 - r2); return true; }',
    'vec3 fermi(float x, float y) { return vec3(cosh(y)*sinh(x), sinh(y), cosh(y)*cosh(x)); }',
    'vec3 polar(vec2 s, float t) { float r = length(s); vec2 u = r > 0.0 ? s / r : vec2(1.0, 0.0); return vec3(sinh(t)*u, cosh(t)); }',
    // The inverse of each model: screen point s to the hyperboloid.
    'bool toHyp(vec2 s, out vec3 P) {',
    '  P = vec3(0.0, 0.0, 1.0);',
    '  if (uModel == 0) return disk(s / 0.95, P);',
    '  if (uModel == 1) { vec2 k = s / 0.95; float r2 = dot(k, k); if (r2 >= 0.99999) return false; P = vec3(k, 1.0) / sqrt(1.0 - r2); return true; }',
    '  if (uModel == 2) { vec2 g = s * uK; P = vec3(g, sqrt(1.0 + dot(g, g))); return true; }',
    '  if (uModel == 3) { vec2 q = s / 0.42; float r2 = dot(q, q); if (r2 <= 1.00001) return false; return disk(-q / r2, P); }',
    '  if (uModel == 4) { vec2 w = s * uK + vec2(0.0, 1.0); if (w.y <= 0.0) return false; return disk(cdiv(w - vec2(0.0, 1.0), w + vec2(0.0, 1.0)), P); }',
    '  if (uModel == 5) { vec2 b = s * (PI / 2.0) / 0.9; if (abs(b.y) >= PI / 2.0) return false; vec2 e = cexp(b); return disk(cdiv(e - vec2(1.0, 0.0), e + vec2(1.0, 0.0)), P); }',
    '  if (uModel == 6) { vec2 w = s * uK; vec2 d = w - cmul(csqrt(w - vec2(1.0, 0.0)), csqrt(w + vec2(1.0, 0.0)));',
    '    if (dot(d, d) >= 0.99999) return false; d = cdiv(d - vec2(0.85, 0.0), vec2(1.0, 0.0) - 0.85 * d); return disk(d, P); }',
    '  if (uModel == 7) { P = polar(s, length(s) * uK); return true; }',
    '  if (uModel == 8) { float rho = length(s) * uK; P = polar(s, 2.0 * asinh(rho / 2.0)); return true; }',
    '  if (uModel == 9) { P = fermi(s.x * uK, s.y * uK); return true; }',
    '  if (uModel == 10) { P = fermi(s.x * uK, asinh(s.y * uK)); return true; }',
    '  if (uModel == 11) { float y = s.y * uK; P = fermi(s.x * uK / cosh(y), y); return true; }',
    // Two-point: cosh r1 = z cosh a + x sinh a and cosh r2 = z cosh a − x sinh a,
    // which are linear in the point's coordinates, so solve them directly.
    '  if (uModel == 12) { vec2 u = s * uK; float a = 1.0;',
    '    float c1 = cosh(length(u + vec2(a, 0.0))), c2 = cosh(length(u - vec2(a, 0.0)));',
    '    float z = (c1 + c2) / (2.0 * cosh(a)), x = (c1 - c2) / (2.0 * sinh(a));',
    '    float y2 = z*z - x*x - 1.0; if (y2 < 0.0) return false;',
    '    P = vec3(x, sqrt(y2) * (u.y < 0.0 ? -1.0 : 1.0), z); return true; }',
    '  if (uModel == 13) {',
    '    vec3 d = normalize(uCamF + s.x * uFov * uCamR + s.y * uFov * uCamU); vec3 o = uCamPos;',
    '    float A = mdot(d, d), B = 2.0 * mdot(o, d), C = mdot(o, o) + 1.0;',
    '    float disc = B*B - 4.0*A*C; if (disc < 0.0 || abs(A) < 1e-6) return false;',
    '    float sq = sqrt(disc); float t1 = (-B - sq) / (2.0*A), t2 = (-B + sq) / (2.0*A);',
    '    float ta = min(t1, t2), tb = max(t1, t2); float t = -1.0;',
    '    vec3 h = o + ta * d; if (ta > 0.0 && h.z > 0.0 && h.z < 5.5) t = ta;',
    '    else { h = o + tb * d; if (tb > 0.0 && h.z > 0.0 && h.z < 5.5) t = tb; }',
    '    if (t < 0.0) return false;',
    '    vec3 nrm = normalize(vec3(h.x, h.y, -h.z)); shade = 0.72 + 0.28 * abs(dot(nrm, normalize(vec3(-0.4, -0.6, 0.7))));',
    '    P = h; return true; }',
    '  return false;',
    '}',
    '#ifdef WYTHOFF',
    // Match the sides of the cuts that bound each face to its centre orbit.
    'int tileAt(vec3 p) {',
    '  int sides = 0;',
    '  for (int i = 0; i < 3; i++) sides |= (mdot(p, uEdgeNormal[i]) < 0.0 ? 1 : 8) << i;',
    '  for (int j = 0; j < 3; j++) {',
    '    if (uTileSides[j] > 0 && (sides & uTileMasks[j]) == uTileMasks[j]) return j;',
    '  }',
    '  return -1;',
    '}',
    'float pointDistance(vec3 p, vec3 q) {',
    '  vec3 d = p - q; return 2.0 * asinh(0.5 * sqrt(max(0.0, mdot(d, d))));',
    '}',
    // Clamp the perpendicular projection to the segment using the planes
    // through its endpoints. The end on the mirror has tangent N.
    'float edgeDistance(vec3 p) {',
    '  vec3 N[3] = vec3[3](uN1, uN2, uN3);',
    '  float d = 1e6;',
    '  for (int i = 0; i < 3; i++) {',
    '    if ((uEdgeMask & (1 << i)) == 0) continue;',
    '    vec3 tangent = N[i] + mdot(uCorner, N[i]) * uCorner;',
    '    float di = mdot(p, tangent) < 0.0 ? pointDistance(p, uCorner) :',
    '      (mdot(p, N[i]) > 0.0 ? pointDistance(p, uEdgeEnd[i]) : asinh(abs(mdot(p, uEdgeNormal[i]))));',
    '    d = min(d, di);',
    '  }',
    '  return d;',
    '}',
    '#endif',
    '#ifdef DOMAIN',
    // One row per face. Each face stores its whole polygon so distances
    // and design frames stay continuous over the reflection mirrors.
    'float domainFace(vec3 p, int halfIndex, out vec4 frame, out ivec3 tile, out float scale) {',
    '  int start = halfIndex == 0 ? 0 : uFaceCounts.x;',
    '  float best = 1e6;',
    '  for (int i = start; i < start + uFaceCounts[halfIndex]; i++) {',
    '    vec4 info = texelFetch(uDomain, ivec2(1, i), 0);',
    '    float d = -1e6;',
    '    for (int j = 0; j < int(info.x); j++) {',
    '      d = max(d, mdot(p, texelFetch(uDomain, ivec2(2 + j, i), 0).xyz));',
    '      if (d >= best) break;',
    '    }',
    '    if (d < best) {',
    '      best = d; frame = texelFetch(uDomain, ivec2(0, i), 0); tile = ivec3(info.yzw);',
    '      scale = texelFetch(uDomain, ivec2(2, i), 0).w;',
    '      if (d <= 0.0) break;',
    '    }',
    '  }',
    '  return asinh(abs(best));',
    '}',
    '#endif',
    'void main() {',
    '  vec2 s = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y)) / uZoom + uPan;',
    '  vec3 v; bool ok = toHyp(s, v);',
    '  vec3 dx = dFdx(v), dy = dFdy(v);',
    '  float pix = sqrt(max(max(mdot(dx, dx), mdot(dy, dy)), 0.0));',
    '  if (!ok) { outColor = uClear ? vec4(0.0) : vec4(uBg, 1.0); return; }',
    '  vec3 p = uTinv * v;',
    '  uint words[16]; for (int i = 0; i < 16; i++) words[i] = 0u;',
    '  int k = 0, par3 = 0; bool done = false; vec3 xi = uXi; mat3 M = mat3(1.0); bool trackM = uMotif && uUpright;',
    '  for (int i = 0; i < 120; i++) {',
    '    bool moved = false; float d;',
    '    d = mdot(p, uN1); if (d > 0.0) { p -= 2.0*d*uN1; xi -= 2.0*mdot(xi, uN1)*uN1; xi /= xi.z; if (trackM) M = reflM(M, uN1); if (k < 256) words[k >> 4] |= 0u << uint(2 * (k & 15)); k++; moved = true; }',
    '    d = mdot(p, uN2); if (d > 0.0) { p -= 2.0*d*uN2; xi -= 2.0*mdot(xi, uN2)*uN2; xi /= xi.z; if (trackM) M = reflM(M, uN2); if (k < 256) words[k >> 4] |= 1u << uint(2 * (k & 15)); k++; moved = true; }',
    '    d = mdot(p, uN3); if (d > 0.0) { p -= 2.0*d*uN3; xi -= 2.0*mdot(xi, uN3)*uN3; xi /= xi.z; if (trackM) M = reflM(M, uN3); if (k < 256) words[k >> 4] |= 2u << uint(2 * (k & 15)); k++; par3++; moved = true; }',
    '    if (!moved) { done = true; break; }',
    '  }',
    '  if (!done || k > 256) { outColor = uClear ? vec4(0.0) : vec4(uRim * shade, 1.0); return; }',
    '  int parity = (k + uPar0) & 1;',
    '  int orbit = 0, type = 0, colourWord = 0;',
    '#ifdef DOMAIN',
    '  vec4 frame; ivec3 tileInfo; float designScale;',
    '  float domainEdge = domainFace(p, parity ^ uHand, frame, tileInfo, designScale);',
    '  orbit = tileInfo.x; type = tileInfo.y; colourWord = tileInfo.z;',
    '  vec3 C = frame.xyz;',
    '  float radius = frame.w;',
    '#elif defined(WYTHOFF)',
    '  orbit = tileAt(p);',
    '  int tile = max(orbit, 0); type = tile;',
    '  vec3 C = uTileCentre[tile];',
    '  float radius = uTileRadii[tile];',
    '  float designScale = uDesignScales[tile];',
    '#else',
    '  vec3 C = vec3(0.0, 0.0, 1.0);',
    '  float radius = uRadius;',
    '  float designScale = 0.62 * tanh(0.5 * asinh(uN3.z));',
    '#endif',
    '#if defined(WYTHOFF) || defined(DOMAIN)',
    '  bool designHere = orbit >= 0 && (!uLargestOnly || radius >= uLargestRadius - 1e-5);',
    '#else',
    '  bool designHere = true;',
    '#endif',
    '  float fade = smoothstep(0.1, 0.45, pix / uScaleLen);',
    // Apply the fold in reverse to point 0 of this tile's action.
    '  vec3 col = uMono;',
    '  if (orbit >= 0 && uColourMode == 0) {',
    '    int base = orbit * 32, x = 0;',
    '    for (; colourWord != 0; colourWord >>= 2) x = uAction[base + x][(colourWord & 3) - 1];',
    '    for (int i = k - 1; i >= 0; i--) {',
    '      int g = int((words[i >> 4] >> uint(2 * (i & 15))) & 3u); x = uAction[base + x][g];',
    '    }',
    '    col = palette(uAction[base + x].w);',
    '  } else if (orbit >= 0 && uColourMode == 2) {',
    '#ifdef DOMAIN',
    '    col = palette(type);',
    '#else',
    '    col = palette(uTypeColour[type]);',
    '#endif',
    '  }',
    '  if (uStyle == 1) col = mix(col, parity == 0 ? vec3(1.0) : uEdge, 0.16);',
    // Shading: lighter at the tile centre, deeper towards its corners. The
    // slider is eased (power 1.6), so 35% stays gentle and 100% is strong:
    // corners fall to 30% brightness and centres lift 20% towards white.
    '  float rel = clamp(acosh(max(-mdot(p, C), 1.0)) / max(radius, 1e-6), 0.0, 1.0);',
    '  float t2 = rel * rel, g = pow(uShade, 1.6);',
    '  col *= 1.0 - 0.7 * g * t2;',
    '  col = mix(col, vec3(1.0), 0.2 * g * (1.0 - t2));',
    '#if !defined(WYTHOFF) && !defined(DOMAIN)',
    '  if (uSingle && par3 > 0) col = mix(uBg, col, 0.22);',
    '#endif',
    '  col *= shade;',
    // The design, one per tile, in the tile's own frame. One point: its top
    // faces the boundary point xi. Upright: its top follows "up" in the
    // Poincaré disk of the view where it was aimed; uZ0 and uPhi give the
    // Möbius map z -> e^(i phi) (z - z0) / (1 - conj(z0) z) from the current
    // disk to that one, and up at z pulls back to the angle
    // pi/2 - phi + 2 arg(1 - conj(z0) z). The frame is mirrored back on an
    // odd count of reflections, counting those in the snaps home (uPar0), so
    // every design keeps its hand and moves with the plane.
    '  if (uMotif && designHere) {',
    '    vec3 local = toCentre(p, C);',
    '    vec3 direction = toCentre(xi, C);',
    '    if (uUpright) {',
    '      vec3 J = vec3(1.0, 1.0, -1.0);',
    '      vec3 cs = uT * (J * (transpose(M) * (J * C)));',
    '      vec2 z = cs.xy / (1.0 + cs.z);',
    '      vec2 q = vec2(1.0, 0.0) - cmul(vec2(uZ0.x, -uZ0.y), z);',
    '      float th = 0.5 * PI - uPhi + 2.0 * atan(q.y, q.x);',
    '      vec2 dv = vec2(cos(th), sin(th)); float D = 1.0 - dot(z, z), ud = dot(z, dv);',
    '      vec3 ef = M * (uTinv * vec3(2.0 * D * dv + 4.0 * ud * z, 4.0 * ud));',
    '      direction = toCentre(ef, C);',
    '    }',
    '    vec2 up = normalize(direction.xy);',
    '    vec2 L = vec2(dot(up, local.xy), dot(vec2(-up.y, up.x), local.xy));',
    '    if (parity == 1) L.y = -L.y;',
    '    vec2 f = L / (1.0 + local.z) / designScale;',
    '    vec2 g = vec2(-f.y, f.x) * 0.5 + 0.5;',
    '    vec4 gt = all(greaterThan(g, vec2(0.0))) && all(lessThan(g, vec2(1.0))) ? texture(uGlyph, g) : vec4(0.0);',
    // Black in the picture draws in the edge colour, white draws white.
    '    col = mix(col, mix(uEdge, vec3(1.0), gt.r), uDesignA * gt.a);',
    '  }',
    '  float d1 = asinh(abs(mdot(p, uN1))), d2 = asinh(abs(mdot(p, uN2))), d3 = asinh(abs(mdot(p, uN3)));',
    '  float w = uEdgeW, e = 0.0;',
    '  if (w > 0.0) {',
    '#if defined(WYTHOFF) || defined(DOMAIN)',
    '#ifdef DOMAIN',
    '    float d = domainEdge;',
    '#else',
    '    float d = edgeDistance(p);',
    '#endif',
    '    float a = fwidth(d) + 1e-6; e = 1.0 - smoothstep(w - a, w + a, d);',
    '#else',
    '    float a3 = fwidth(d3) + 1e-6; e = 1.0 - smoothstep(w - a3, w + a3, d3);',
    '#endif',
    '    if (uStyle == 1 || uMirrors) {',
    '      float wm = uStyle == 1 ? 0.6 * w : 0.35 * w; float km = uStyle == 1 ? 1.0 : 0.55;',
    '      float a1 = fwidth(d1) + 1e-6, a2 = fwidth(d2) + 1e-6;',
    '      e = max(e, km * (1.0 - smoothstep(wm - a1, wm + a1, d1)));',
    '      e = max(e, km * (1.0 - smoothstep(wm - a2, wm + a2, d2)));',
    '#if defined(WYTHOFF) || defined(DOMAIN)',
    '      float a3 = fwidth(d3) + 1e-6;',
    '      e = max(e, km * (1.0 - smoothstep(wm - a3, wm + a3, d3)));',
    '#endif',
    '    }',
    '  }',
    '  col = mix(col, uEdge * shade, e);',
    '  if (uClear) { outColor = vec4(col, 1.0 - fade); return; }',
    '  col = mix(col, uRim * shade, fade);',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ---------- Lorentz algebra (row-major 3 x 3) ---------- */

  function mdot(a, b) { return a[0] * b[0] + a[1] * b[1] - a[2] * b[2]; }
  function mul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++)
      C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
  }
  function apply(A, v) {
    return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
  }
  function ident() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
  // Inverse of a Lorentz matrix: J Aᵀ J.
  function linv(A) { return [A[0], A[3], -A[6], A[1], A[4], -A[7], -A[2], -A[5], A[8]]; }
  // The translation that takes the origin to p, along the line through both.
  function lift(p) {
    var x = p[0], y = p[1], z = p[2], k = 1 / (1 + z);
    return [1 + x * x * k, x * y * k, x, x * y * k, 1 + y * y * k, y, x, y, z];
  }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function step(dx, dy) { // translation by the vector (dx, dy) at the origin
    var t = Math.hypot(dx, dy);
    if (t < 1e-12) return ident();
    var sh = Math.sinh(t) / t;
    return lift([dx * sh, dy * sh, Math.cosh(t)]);
  }
  // Pull T back to an exact Lorentz matrix, against rounding drift.
  function renorm(T) {
    var c0 = [T[0], T[3], T[6]], c1 = [T[1], T[4], T[7]], c2 = [T[2], T[5], T[8]], k;
    k = Math.sqrt(-mdot(c2, c2)); c2 = c2.map(function (x) { return x / k; });
    k = mdot(c0, c2); c0 = c0.map(function (x, i) { return x + k * c2[i]; });
    k = Math.sqrt(mdot(c0, c0)); c0 = c0.map(function (x) { return x / k; });
    var k2 = mdot(c1, c2), k0 = mdot(c1, c0);
    c1 = c1.map(function (x, i) { return x + k2 * c2[i] - k0 * c0[i]; });
    k = Math.sqrt(mdot(c1, c1)); c1 = c1.map(function (x) { return x / k; });
    return [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
  }
  function finite(A) { return A.every(function (x) { return isFinite(x); }) && Math.abs(A[8]) < 1e9; }

  /* ---------- The model maps in JavaScript, for dragging ---------- */

  function cdiv(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cexp(z) { var e = Math.exp(z[0]); return [e * Math.cos(z[1]), e * Math.sin(z[1])]; }
  function csqrt(z) {
    var r = Math.hypot(z[0], z[1]), a = Math.sqrt(Math.max(0, (r + z[0]) / 2)), b = Math.sqrt(Math.max(0, (r - z[0]) / 2));
    return [a, z[1] < 0 ? -b : b];
  }
  function disk(d) {
    var r2 = d[0] * d[0] + d[1] * d[1];
    if (r2 >= 0.99999) return null;
    return [2 * d[0] / (1 - r2), 2 * d[1] / (1 - r2), (1 + r2) / (1 - r2)];
  }
  function fermi(x, y) { return [Math.cosh(y) * Math.sinh(x), Math.sinh(y), Math.cosh(y) * Math.cosh(x)]; }
  function polar(s, t) {
    var r = Math.hypot(s[0], s[1]), ux = r > 0 ? s[0] / r : 1, uy = r > 0 ? s[1] / r : 0;
    return [Math.sinh(t) * ux, Math.sinh(t) * uy, Math.cosh(t)];
  }
  function toHyp(n, s) {
    var x, y, r2, k = MODELS_BY_N[n].k || 1;
    switch (n) {
      case 0: return disk([s[0] / 0.95, s[1] / 0.95]);
      case 1: x = s[0] / 0.95; y = s[1] / 0.95; r2 = x * x + y * y;
        if (r2 >= 0.99999) return null;
        r2 = 1 / Math.sqrt(1 - r2); return [x * r2, y * r2, r2];
      case 2: x = s[0] * k; y = s[1] * k; return [x, y, Math.sqrt(1 + x * x + y * y)];
      case 3: x = s[0] / 0.42; y = s[1] / 0.42; r2 = x * x + y * y;
        if (r2 <= 1.00001) return null; return disk([-x / r2, -y / r2]);
      case 4: { var w = [s[0] * k, s[1] * k + 1]; if (w[1] <= 0) return null;
        return disk(cdiv([w[0], w[1] - 1], [w[0], w[1] + 1])); }
      case 5: { var b = [s[0] * Math.PI / 2 / 0.9, s[1] * Math.PI / 2 / 0.9];
        if (Math.abs(b[1]) >= Math.PI / 2) return null;
        var e = cexp(b); return disk(cdiv([e[0] - 1, e[1]], [e[0] + 1, e[1]])); }
      case 6: { var j = [s[0] * k, s[1] * k];
        var q = cmul(csqrt([j[0] - 1, j[1]]), csqrt([j[0] + 1, j[1]]));
        var d = [j[0] - q[0], j[1] - q[1]];
        if (d[0] * d[0] + d[1] * d[1] >= 0.99999) return null;
        return disk(cdiv([d[0] - 0.85, d[1]], [1 - 0.85 * d[0], -0.85 * d[1]])); }
      case 7: return polar(s, Math.hypot(s[0], s[1]) * k);
      case 8: return polar(s, 2 * Math.asinh(Math.hypot(s[0], s[1]) * k / 2));
      case 9: return fermi(s[0] * k, s[1] * k);
      case 10: return fermi(s[0] * k, Math.asinh(s[1] * k));
      case 11: y = s[1] * k; return fermi(s[0] * k / Math.cosh(y), y);
      case 12: { var u = [s[0] * k, s[1] * k], a = 1;
        var c1 = Math.cosh(Math.hypot(u[0] + a, u[1])), c2 = Math.cosh(Math.hypot(u[0] - a, u[1]));
        var z = (c1 + c2) / (2 * Math.cosh(a)); x = (c1 - c2) / (2 * Math.sinh(a));
        var y2 = z * z - x * x - 1; if (y2 < 0) return null;
        return [x, Math.sqrt(y2) * (u[1] < 0 ? -1 : 1), z]; }
      case 13: { var cam = camera(), f = cam.fov;
        var dir = [0, 1, 2].map(function (i) { return cam.f[i] + s[0] * f * cam.r[i] + s[1] * f * cam.u[i]; });
        var len = Math.hypot(dir[0], dir[1], dir[2]); dir = dir.map(function (v) { return v / len; });
        var o = cam.pos, A = mdot(dir, dir), B = 2 * mdot(o, dir), C = mdot(o, o) + 1, disc = B * B - 4 * A * C;
        if (disc < 0 || Math.abs(A) < 1e-6) return null;
        var sq = Math.sqrt(disc), ts = [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].sort(function (m, nn) { return m - nn; });
        for (var i = 0; i < 2; i++) {
          var h = [o[0] + ts[i] * dir[0], o[1] + ts[i] * dir[1], o[2] + ts[i] * dir[2]];
          if (ts[i] > 0 && h[2] > 0 && h[2] < 5.5) return h;
        }
        return null; }
    }
    return null;
  }

  // Camera for the hyperboloid: above and in front, looking into the bowl.
  function camera() {
    var target = [0, 0, 2.4], el = 62 * Math.PI / 180, dist = 23;
    var pos = [0, -dist * Math.cos(el), target[2] + dist * Math.sin(el)];
    var f = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
    var lf = Math.hypot(f[0], f[1], f[2]); f = f.map(function (v) { return v / lf; });
    var r = [1, 0, 0];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { pos: pos, f: f, r: r, u: u, fov: Math.tan(17 * Math.PI / 180) };
  }

  /* ---------- The triangle group ---------- */

  function isHyperbolic(p, q, r) { return 1 / p + 1 / q + 1 / r < 1 - 1e-9; }
  function mirrors(p, q, r) {
    var P = Math.PI / p, Q = Math.PI / q, R = Math.PI / r;
    var b = Math.cos(Q), a = (Math.cos(R) + Math.cos(Q) * Math.cos(P)) / Math.sin(P);
    var c = Math.sqrt(a * a + b * b - 1);
    return [[0, -1, 0], [-Math.sin(P), Math.cos(P), 0], [a, b, c]];
  }
  // Side lengths of the triangle: opposite the angles π/p, π/q, π/r.
  function sides(p, q, r) {
    var A = Math.PI / p, B = Math.PI / q, C = Math.PI / r;
    function side(x, y, z) { return Math.acosh((Math.cos(x) + Math.cos(y) * Math.cos(z)) / (Math.sin(y) * Math.sin(z))); }
    return { a: side(A, B, C), b: side(B, A, C), c: side(C, A, B) };
  }

  /* ---------- Wythoff patterns in one triangle ---------- */

  // P, Q and R each sit at the intersection of two mirrors, with the
  // third mirror opposite them. All indices use the order in mirrors().
  var INCIDENT = [[0, 1], [0, 2], [1, 2]];
  var OPPOSITE = [2, 1, 0];

  function unitPoint(v) {
    var norm = Math.sqrt(-mdot(v, v));
    return v.map(function (x) { return x / norm; });
  }

  // Solve <W, N[i]> = -a[i], before normalising onto the hyperboloid.
  function pointFromMirrors(a, N) {
    var y = a[0], x = (N[1][1] * y + a[1]) / -N[1][0];
    var z = (N[2][0] * x + N[2][1] * y + a[2]) / N[2][2];
    return [x, y, z];
  }

  function wythoff(p, q, r, mask, N) {
    var active = N.map(function (_, i) { return (mask >> i) & 1; });
    // The common distance to the active mirrors makes every edge equal.
    var w = pointFromMirrors(active, N), delta = 1 / Math.sqrt(-mdot(w, w));
    var W = w.map(function (x) { return x * delta; });
    var cosh = Math.hypot(1, delta), ends = [], normals = [];
    N.forEach(function (n, i) {
      ends.push(active[i] ? W.map(function (v, j) { return (v + delta * n[j]) / cosh; }) : W);
      // Lorentz normal to the line through W and its reflection in n.
      var e = [W[1] * n[2] - W[2] * n[1], W[2] * n[0] - W[0] * n[2], W[1] * n[0] - W[0] * n[1]];
      normals.push(e.map(function (v) { return active[i] ? v / cosh : 0; }));
    });
    var centres = chamberCentres(p, q, r, N), angles = [p, q, r];
    var faceSides = INCIDENT.map(function (pair, i) {
      var n = angles[i] * (active[pair[0]] + active[pair[1]]);
      // A right-angle corner with one active mirror is an edge midpoint.
      return n > 2 ? n : 0;
    });
    var faceMasks = [0, 0, 0];
    normals.forEach(function (n, i) {
      if (!active[i]) return;
      var adjacent = OPPOSITE.map(function (opp, j) { return opp !== i && faceSides[j] ? j : -1; })
        .filter(function (j) { return j >= 0; });
      if (adjacent.length < 2) return; // This segment lies on a mirror.
      adjacent.forEach(function (j) {
        faceMasks[j] |= (mdot(centres[j], n) < 0 ? 1 : 8) << i;
      });
    });
    var radii = centres.map(function (c, i) {
      return faceSides[i] ? Math.acosh(Math.max(1, -mdot(W, c))) : 0;
    });
    var inradii = centres.map(function (c, i) {
      if (!faceSides[i]) return 0;
      return Math.min.apply(null, INCIDENT[i].filter(function (j) { return active[j]; })
        .map(function (j) { return Math.asinh(Math.abs(mdot(c, normals[j]))); }));
    });
    return {
      corner: W, ends: new Float32Array(ends.flat()), normals: new Float32Array(normals.flat()),
      faceMasks: faceMasks, faceSides: faceSides, edgeLength: 2 * Math.asinh(delta),
      centres: centres, radii: radii, previewRadius: Math.max.apply(null, radii), inradii: inradii
    };
  }

  function chamberCentres(p, q, r, N) {
    var sd = sides(p, q, r);
    return [[0, 0, 1], [Math.sinh(sd.c), 0, Math.cosh(sd.c)],
      [Math.sinh(sd.b) * N[1][1], -Math.sinh(sd.b) * N[1][0], Math.cosh(sd.b)]];
  }

  /* ---------- Tilings with a two-triangle domain ---------- */

  function polygon(vertices, centre, orbit, type, colourWord) {
    var normals = vertices.map(function (a, i) {
      var b = vertices[(i + 1) % vertices.length];
      var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[1] * b[0] - a[0] * b[1]];
      var norm = Math.sqrt(mdot(n, n)) * (mdot(centre, n) > 0 ? -1 : 1);
      return n.map(function (x) { return x / norm; });
    });
    return {
      centre: centre, orbit: orbit, type: type, colourWord: colourWord, normals: normals,
      radius: Math.acosh(Math.max.apply(null, vertices.map(function (v) { return -mdot(v, centre); }))),
      inradius: Math.asinh(Math.min.apply(null, normals.map(function (n) { return -mdot(n, centre); })))
    };
  }

  // Both halves use the same folded triangle coordinates. Each lists all
  // faces that touch the triangle's interior, with complete polygon edges.
  // colourWord stores the mirrors from a face's home to this chamber, in
  // order of application, with digits 1–3 in successive two-bit fields.
  function twoTriangleDomain(halves, faceSides, corner, edgeLength) {
    var faces = halves[0].concat(halves[1]);
    var width = 2 + Math.max.apply(null, faces.map(function (f) { return f.normals.length; }));
    var data = new Float32Array(width * faces.length * 4);
    faces.forEach(function (face, i) {
      var row = 4 * width * i;
      data.set(face.centre.concat(face.radius), row);
      data.set([face.normals.length, face.orbit, face.type, face.colourWord], row + 4);
      face.normals.forEach(function (n, j) { data.set(n, row + 8 + 4 * j); });
      data[row + 11] = designScale(face.inradius);
    });
    return {
      halves: halves, width: width, data: data, typeCount: new Set(faces.map(function (f) { return f.type; })).size, faceSides: faceSides, corner: corner, edgeLength: edgeLength,
      previewRadius: Math.max.apply(null, faces.map(function (f) { return f.radius; }))
    };
  }

  function snub(p, q, r, N) {
    var orders = [p, q, r], angles = orders.map(function (n) { return Math.PI / n; });
    // If a and b are signed mirror distances measured by sinh, a rotation
    // about their corner makes an edge of length 2 asinh(sqrt(D)), where
    // D = a² + b² + 2ab cos(angle). Solve for D = 1 at all three corners,
    // then normalise the point. In that solve b decreases as a increases.
    function other(a, angle) {
      return Math.sqrt(1 - Math.pow(a * Math.sin(angle), 2)) - a * Math.cos(angle);
    }
    var lo = 0, hi = 1, a, b, c;
    for (var i = 0; i < 52; i++) {
      a = (lo + hi) / 2; b = other(a, angles[0]); c = other(a, angles[1]);
      if (b * b + c * c + 2 * b * c * Math.cos(angles[2]) > 1) lo = a;
      else hi = a;
    }
    var w = pointFromMirrors([a, b, c], N), W = unitPoint(w);
    var reflections = N.map(reflection), centres = chamberCentres(p, q, r, N), halves = [[], []];
    var faceSides = orders.map(function (n) { return n > 2 ? n : 0; }).concat(3);
    var types = tileTypes(faceSides);
    INCIDENT.forEach(function (pair, j) {
      if (!faceSides[j]) return; // A half turn gives an edge, shared by two triangles.
      var T = lift(centres[j]), local = apply(linv(T), W), vertices = [W];
      for (var i = 1; i < orders[j]; i++) vertices.push(apply(T, apply(rotZ(2 * angles[j] * i), local)));
      halves[0].push(polygon(vertices, centres[j], j, types.indexOf(faceSides[j]), 0));
      var reflected = vertices.map(function (v) { return apply(reflections[pair[0]], v); });
      halves[1].push(polygon(reflected, centres[j], j, types.indexOf(faceSides[j]), 0));
    });
    // Around an odd chamber, the three nearest even seed points form an
    // equilateral triangle. Each of its tips reaches a neighbouring even chamber.
    var triangle = reflections.map(function (R) { return apply(R, W); });
    var centre = unitPoint(triangle.reduce(function (sum, v) {
      return sum.map(function (x, i) { return x + v[i]; });
    }, [0, 0, 0]));
    halves[1].push(polygon(triangle, centre, 3, types.indexOf(3), 0));
    reflections.forEach(function (R, i) {
      halves[0].push(polygon(triangle.map(function (v) { return apply(R, v); }), apply(R, centre), 3, types.indexOf(3), i + 1));
    });
    return twoTriangleDomain(halves, faceSides, W, 2 * Math.asinh(1 / Math.sqrt(-mdot(w, w))));
  }

  function klein(v) { return [v[0] / v[2], v[1] / v[2], 1]; }

  // Hyperbolic bisectors are straight in Klein coordinates. Keep the part
  // of the polygon on the inside of the bisector.
  function cutCell(vertices, normal) {
    var result = [];
    var distances = vertices.map(function (v) {
      var d = mdot(v, normal);
      return Math.abs(d) < 1e-11 ? 0 : d;
    });
    vertices.forEach(function (b, i) {
      var j = (i + vertices.length - 1) % vertices.length;
      var a = vertices[j], da = distances[j], db = distances[i];
      if (da * db < 0) {
        var t = da / (da - db);
        result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 1]);
      }
      if (db <= 0) result.push(b);
    });
    return result;
  }

  function voronoiCell(vertices, site, sites) {
    for (var i = 0; i < sites.length && vertices.length >= 3; i++) {
      var other = sites[i];
      if (other === site) continue;
      var bisector = [other[0] - site[0], other[1] - site[1], other[2] - site[2]];
      vertices = cutCell(vertices, bisector);
    }
    return vertices;
  }

  function goldberg(p, m, n, N) {
    var reflections = N.map(reflection);
    var chamber = chamberCentres(p, 3, 2, N);
    var turnQ = mul(reflections[2], reflections[0]);
    var cycle = [ident(), turnQ, mul(turnQ, turnQ)];
    var parent = cycle.map(function (T) { return apply(T, chamber[0]); });
    var turnP = mul(reflections[1], reflections[0]);
    var lattice = [], count = m * m + m * n + n * n;
    // The parent corners in triangular lattice coordinates are (0,0),
    // (m,n), and (-n,m+n). Invert that basis with integer arithmetic to
    // keep the sites on the edges when building the neighbouring stars.
    for (var i = -n; i <= m; i++) for (var j = 0; j <= m + n; j++) {
      var b = (m + n) * i + n * j, c = m * j - n * i;
      var a = count - b - c;
      if (a < 0 || b < 0 || c < 0) continue;
      lattice.push(unitPoint(parent[0].map(function (x, k) {
        return a * x + b * parent[1][k] + c * parent[2][k];
      })));
    }
    // A full star of parent triangles at each of the three vertices gives
    // the neighbouring sites needed to close the dual cells on all seams.
    var sitesByPoint = new Map();
    cycle.forEach(function (T) {
      var rotation = ident();
      for (var i = 0; i < p; i++) {
        var G = mul(T, rotation);
        lattice.forEach(function (v) {
          var site = apply(G, v);
          var key = klein(site).slice(0, 2).map(function (x) { return Math.round(x * 1e8); }).join(',');
          if (!sitesByPoint.has(key)) sitesByPoint.set(key, site);
        });
        rotation = mul(turnP, rotation);
      }
    });
    var sites = Array.from(sitesByPoint.values());
    var middle = unitPoint(chamber[0].map(function (_, k) {
      return chamber[0][k] + chamber[1][k] + chamber[2][k];
    }));
    sites.sort(function (a, b) { return mdot(b, middle) - mdot(a, middle); });

    var mirror = reflections[0], shapes = [], faceSides = [0, 0, 0, 0];
    var halves = [chamber.map(klein), chamber.map(function (v) { return klein(apply(mirror, v)); })];
    var square = [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    var faces = [[], []];
    sites.forEach(function (site) {
      var touched = halves.map(function (half) {
        var v = voronoiCell(half, site, sites);
        var area = v.reduce(function (sum, a, i) {
          var b = v[(i + 1) % v.length];
          return sum + a[0] * b[1] - b[0] * a[1];
        }, 0);
        return Math.abs(area) > 1e-12;
      });
      if (!touched.some(Boolean)) return;
      var vertices = voronoiCell(square, site, sites).map(unitPoint);
      touched.forEach(function (yes, i) {
        if (!yes) return;
        var centre = i ? apply(mirror, site) : site;
        var folded = fold(centre, N), home = apply(folded.G, centre);
        var fixed = N.map(function (n, j) { return Math.abs(mdot(home, n)) < 1e-9 ? j : -1; })
          .filter(function (j) { return j >= 0; });
        var orbit = fixed.length ? INCIDENT.findIndex(function (pair) {
          return fixed.every(function (j) { return pair.includes(j); });
        }) : 3;
        var word = folded.list.reduce(function (word, j) { return (word << 2) | (j + 1); }, 0);
        var face = polygon(i ? vertices.map(function (v) { return apply(mirror, v); }) : vertices, centre, orbit, 0, word);
        var sides = face.normals.length;
        var area = (sides - 2) * Math.PI - face.normals.reduce(function (sum, a, j) {
          var b = face.normals[(j + 1) % sides];
          return sum + Math.acos(Math.max(-1, Math.min(1, -mdot(a, b))));
        }, 0);
        face.type = shapes.findIndex(function (shape) { return shape.sides === sides && Math.abs(shape.area - area) < 1e-8; });
        if (face.type < 0) { face.type = shapes.length; shapes.push({ sides: sides, area: area }); }
        faceSides[orbit] = sides;
        faces[i].push(face);
      });
    });
    var scale = sides(p, 3, 2).b * 2 / Math.sqrt(3 * count);
    return twoTriangleDomain(faces, faceSides, chamber[0], scale);
  }

  function vertexFigure(pattern, faceSides, r) {
    if (pattern.id === 'snub') {
      return formatVertexFigure([3, faceSides[0], 3, faceSides[1], 3, faceSides[2]].filter(Boolean));
    }
    if (pattern.mask === 1) {
      var pair = faceSides.slice(0, 2).sort(function (a, b) { return a - b; }).join('.');
      return r === 2 ? pair + '.' + pair : '(' + pair + ') × ' + r;
    }
    var opposite = OPPOSITE.indexOf([0, 1, 2].find(function (i) { return !(pattern.mask & (1 << i)); }));
    var order = [0, 1, 2];
    if (opposite >= 0) {
      var rest = order.filter(function (i) { return i !== opposite; });
      order = [rest[0], opposite, rest[1], opposite];
    }
    return formatVertexFigure(order.map(function (i) { return faceSides[i]; }).filter(Boolean));
  }

  function formatVertexFigure(seq) {
    var cycles = seq.flatMap(function (_, i) {
      var cycle = seq.slice(i).concat(seq.slice(0, i));
      return [cycle, cycle.slice().reverse()];
    });
    cycles.sort(function (a, b) {
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    });
    return cycles[0].join('.');
  }

  function reflection(n) {
    var jn = [n[0], n[1], -n[2]], R = ident();
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) R[3 * i + j] -= 2 * n[i] * jn[j];
    return R;
  }
  // Fold a world point into the triangle, in the shader's order. Returns
  // the matrix G that does it and the list of mirrors used.
  function fold(w, N) {
    var G = ident(), list = [], p = w.slice();
    for (var i = 0; i < 400; i++) {
      var moved = false;
      for (var k = 0; k < 3; k++) {
        if (mdot(p, N[k]) > 1e-13) {
          var R = reflection(N[k]);
          p = apply(R, p); G = mul(R, G); list.push(k); moved = true;
        }
      }
      if (!moved) break;
    }
    return { G: G, list: list };
  }

  /* ---------- State ---------- */

  var state = {
    model: 'poincare', p: 7, q: 3, r: 2, pattern: DEFAULT_PATTERN, hand: 'right', style: 'tiles', colour: 'type', edge: 2, shade: 70, mirrors: false, motif: false, design: 'compass', glyph: 'R', orient: 'up', designA: 60, designsOn: 'all',
    gp: DEFAULT_GP, motion: 'still', zoom: 1, pan: [0, 0], drag: 'plane', T: ident(), clear: false
  };
  var N = mirrors(7, 3, 2);
  var geometry;
  function updateGeometry() {
    if (state.pattern === 'regular') geometry = null;
    else if (state.pattern === 'snub') geometry = snub(state.p, state.q, state.r, N);
    else if (state.pattern === 'goldberg') {
      var size = state.gp.split(',').map(Number);
      geometry = goldberg(state.p, size[0], size[1], N);
    } else geometry = wythoff(state.p, state.q, state.r, PATTERN_BY_ID.get(state.pattern).mask, N);
  }
  // P0 is the permutation of colours from the snaps back to home so far,
  // and par0 the parity of their reflections.
  var P0 = [], par0 = 0, actions = [];
  // xi: the boundary point every letter's top faces, in world coordinates.
  // The snap home moves world coordinates by G, so it moves xi by G too.
  var XI0 = [0, 1, 1], xi = XI0.slice();
  // A picture in place of the letter, from the tools: a 128-pixel canvas.
  var customGlyph = null;
  // Wref: T at the moment the designs were aimed, moved by each snap like T.
  var Wref = ident();
  var DESIGN_BY_ID = {};
  (window.HYPER_DESIGNS || []).forEach(function (d) { DESIGN_BY_ID[d.id] = d; });
  // The menu: none, the pictures, two letters, and the viewer's own letter.
  // Compass, the default, comes straight after None.
  var DESIGN_IDS = ['none'].concat((window.HYPER_DESIGNS || []).map(function (d) { return d.id; })
    .sort(function (a, b) { return (b === 'compass') - (a === 'compass'); }), ['letter-r', 'letter-f', 'letter']);

  var hasDesign = false;
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    // Links from before Expanded became the default carry a tiling with
    // no pattern, which meant Regular.
    if (/(^|&)t=/.test(h) && !/(^|&)pattern=/.test(h)) state.pattern = 'regular';
    h.split('&').forEach(function (part) {
      var kv = part.split('='), k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (k === 'm' && MODEL_BY_ID[v]) state.model = v;
      if (k === 't') {
        var t = v.split(',').map(Number);
        if (t.length >= 2 && t.every(function (x) { return x >= 2 && x <= 24 && Math.floor(x) === x; })) {
          var r = t[2] || 2;
          if (t[0] >= 3 && t[1] >= 3 && isHyperbolic(t[0], t[1], r)) { state.p = t[0]; state.q = t[1]; state.r = r; }
        }
      }
      if (k === 's' && (v === 'tiles' || v === 'triangles')) state.style = v;
      if (k === 'hand' && (v === 'right' || v === 'left')) state.hand = v;
      if (k === 'pattern' && PATTERN_BY_ID.has(v)) state.pattern = v;
      if (k === 'gp' && /^\d+,\d+$/.test(v) && gpValid.apply(null, v.split(',').map(Number))) state.gp = v;
      if (k === 'c') state.colour = { many: 'many', few: 'few', mono: 'mono', type: 'type', bright: 'many', two: 'few', rings: 'many' }[v] || state.colour;
      if (k === 'e' && isFinite(+v)) state.edge = Math.max(0, Math.min(10, +v));
      if (k === 'sh' && isFinite(+v)) state.shade = Math.max(0, Math.min(100, +v));
      if (k === 'mv' && ['still', 'spin', 'fly'].indexOf(v) >= 0) state.motion = v;
      if (k === 'bg' && v === 'none') state.clear = true;
      if (k === 'd' && DESIGN_IDS.indexOf(v) >= 0) { state.design = v; hasDesign = true; }
      if (k === 'f' && v === '1' && !hasDesign) { state.design = 'letter'; hasDesign = true; }
      if (k === 'g' && v) state.glyph = Array.from(v)[0];
      if (k === 'o' && (v === 'up' || v === 'point')) state.orient = v;
      if (k === 'on' && (v === 'all' || v === 'largest')) state.designsOn = v;
      if (k === 'da' && isFinite(+v)) state.designA = Math.max(0, Math.min(100, +v));
    });
    if (state.pattern === 'goldberg' && !goldbergGroup(state.p, state.q, state.r)) {
      state.p = Math.max(state.p, 7); state.q = 3; state.r = 2;
    }
  }
  function writeHash() {
    var h = 'm=' + state.model + '&t=' + state.p + ',' + state.q + (state.r !== 2 ? ',' + state.r : '') +
      '&s=' + state.style + '&c=' + state.colour + '&e=' + state.edge + '&sh=' + state.shade;
    h += '&pattern=' + state.pattern;
    if (state.pattern === 'goldberg' || state.gp !== DEFAULT_GP) h += '&gp=' + state.gp;
    if (state.hand !== 'right') h += '&hand=' + state.hand;
    if (state.motion !== 'still') h += '&mv=' + state.motion;
    h += '&d=' + state.design;
    if (state.design === 'letter') h += '&g=' + encodeURIComponent(state.glyph);
    if (state.orient !== 'up') h += '&o=' + state.orient;
    if (state.designsOn !== 'all') h += '&on=' + state.designsOn;
    if (state.designA !== 60) h += '&da=' + state.designA;
    if (state.clear) h += '&bg=none';
    try { history.replaceState(null, '', '#' + h); } catch (e) {}
  }

  function activeFaces() {
    return state.style === 'tiles' && state.pattern !== 'regular' ? geometry.faceSides : [state.p];
  }

  function updateColours(reset) {
    var faces = activeFaces();
    if (state.colour === 'mono' || state.colour === 'type') {
      if (reset) { actions = []; P0 = []; }
      return;
    }
    var next = faces.map(function (n, corner) {
      if (!n) return null;
      // Faces with no stabiliser can reuse P's action in their own range.
      return colourings(state.p, state.q, state.r, corner % 3)[state.colour] || null;
    });
    P0 = next.map(function (action, i) {
      if (!action) return [0];
      if (!reset && action === actions[i]) return P0[i];
      return Array.from({ length: action.n }, function (_, j) { return j; });
    });
    actions = next;
  }

  function resetColours() {
    updateColours(true);
    par0 = 0;
  }

  /* ---------- WebGL ---------- */

  function makeRenderer(canvas) {
    var gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var vertex = sh(gl.VERTEX_SHADER, VERT);
    function link(fragment) {
      var prog = gl.createProgram();
      var pixel = sh(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(prog, vertex);
      gl.attachShader(prog, pixel);
      gl.bindAttribLocation(prog, 0, 'a');
      gl.linkProgram(prog);
      gl.deleteShader(pixel);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      var U = {};
      ['uRes', 'uPan', 'uZoom', 'uModel', 'uTinv', 'uN1', 'uN2', 'uN3', 'uScaleLen', 'uEdgeW', 'uShade', 'uRadius',
        'uStyle', 'uColourMode', 'uPar0', 'uMirrors', 'uMotif', 'uXi', 'uUpright', 'uDesignA', 'uT', 'uZ0', 'uPhi', 'uSingle', 'uClear', 'uBg', 'uEdge', 'uMono', 'uRim',
        'uPal', 'uAction', 'uTypeColour', 'uCamPos', 'uCamF', 'uCamR', 'uCamU', 'uFov', 'uK',
        'uEdgeMask', 'uCorner', 'uEdgeEnd', 'uEdgeNormal', 'uTileMasks', 'uTileSides', 'uTileCentre', 'uTileRadii', 'uDesignScales', 'uLargestRadius', 'uLargestOnly', 'uDomain', 'uFaceCounts', 'uHand']
        .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      return { prog: prog, U: U };
    }
    var programs = { regular: link(FRAG) };
    function use(variant) {
      if (!programs[variant]) {
        programs[variant] = link(FRAG.replace('#version 300 es', '#version 300 es\n#define ' + variant));
      }
      var program = programs[variant];
      gl.useProgram(program.prog);
      return program.U;
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return { gl: gl, use: use, canvas: canvas, tex: tex, glyph: null, domainTexture: null, domain: null };
  }

  function hex(c) { return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]; }

  function tileTypes(faces) {
    return Array.from(new Set(faces.filter(Boolean))).sort(function (a, b) { return a - b; });
  }

  function themeColours(faces, typeCount) {
    var dark = document.documentElement.dataset.theme === 'dark';
    var count = faces.reduce(function (n, sides, i) { return n + (sides ? (actions[i] ? actions[i].n : 1) : 0); }, 0);
    var byType = state.colour === 'type';
    var pal = paletteFor(byType ? typeCount : count);
    var mono = dark ? hex('#30343e') : hex('#fbf8f1');
    var plain = state.colour === 'mono' || (!byType && count === 1);
    var edge = plain ? (dark ? hex('#ddd7c9') : hex('#2a2722')) : hex('#1c1a17');
    var avg = plain ? mono : pal.map(hex).reduce(function (sum, c) {
      return sum.map(function (x, i) { return x + c[i] / pal.length; });
    }, [0, 0, 0]);
    var rim = avg.map(function (x, i) { return x * 0.85 + edge[i] * 0.15; });
    return { bg: dark ? hex('#16161a') : hex('#f6f3ec'), pal: pal, mono: mono, edge: edge, rim: rim, plain: plain };
  }

  // The letter, black on clear, centred by its ink and scaled to fill most
  // of a 128-pixel square, so any character the viewer types fits a tile.
  function glyphCanvas(ch) {
    var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d'), font = function (px) { return 'bold ' + px + 'px system-ui, -apple-system, "Segoe UI", Arial, sans-serif'; };
    x.font = font(100);
    var m = x.measureText(ch);
    var w = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || 60, h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 70;
    var px = 100 * 0.86 * n / Math.max(w, h, 1);
    x.font = font(px); m = x.measureText(ch);
    x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
    x.fillText(ch, n / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
      n / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    return c;
  }

  function designCanvas() {
    var d = DESIGN_BY_ID[state.design];
    if (d) return window.HYPER_DESIGNS.paint(d);
    return glyphCanvas(state.design === 'letter' ? state.glyph : state.design.slice(-1).toUpperCase());
  }
  // Upright: the Möbius map from the current view's Poincaré disk to that of
  // the view where the designs were aimed, A = W T⁻¹, as z0 and phi.
  function uprightMap() {
    var A = mul(Wref, linv(state.T));
    function dk(P) { return [P[0] / (1 + P[2]), P[1] / (1 + P[2])]; }
    var z0 = dk(apply(linv(A), [0, 0, 1])), p0 = dk(apply(A, [0, 0, 1])), phi;
    if (Math.hypot(z0[0], z0[1]) < 1e-9) phi = Math.atan2(A[3], A[0]);
    else { var r = cdiv(p0, z0); phi = Math.atan2(-r[1], -r[0]); }
    return { z0: z0, phi: phi };
  }

  function uploadDomain(R, U, geometry) {
    var gl = R.gl;
    if (R.domain !== geometry) {
      if (!R.domainTexture) R.domainTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, R.domainTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      var height = geometry.halves[0].length + geometry.halves[1].length;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, geometry.width, height, 0, gl.RGBA, gl.FLOAT, geometry.data);
      gl.activeTexture(gl.TEXTURE0);
      R.domain = geometry;
    }
    gl.uniform1i(U.uDomain, 1);
    gl.uniform2i(U.uFaceCounts, geometry.halves[0].length, geometry.halves[1].length);
  }

  function designScale(inradius) { return 0.62 * Math.tanh(0.5 * inradius); }

  function draw(R, opt) {
    var gl = R.gl, sd = sides(state.p, state.q, state.r);
    var faces = activeFaces(), types = tileTypes(faces);
    var triangles = state.style === 'triangles';
    var uniform = !triangles && state.pattern !== 'regular' ? geometry : null;
    var domain = uniform && uniform.halves;
    var c = themeColours(faces, domain ? uniform.typeCount : types.length);
    var U = R.use(domain ? 'DOMAIN' : uniform ? 'WYTHOFF' : 'regular');
    var scaleLen = triangles ? Math.min(sd.a, sd.b, sd.c) : Math.max(sd.c, sd.b);
    gl.viewport(0, 0, R.canvas.width, R.canvas.height);
    gl.uniform2f(U.uRes, R.canvas.width, R.canvas.height);
    gl.uniform2f(U.uPan, opt.pan[0], opt.pan[1]);
    gl.uniform1f(U.uZoom, opt.zoom);
    gl.uniform1i(U.uModel, opt.model);
    var Ti = linv(opt.T);
    // uniformMatrix3fv wants columns: pass the transpose of the row-major array.
    gl.uniformMatrix3fv(U.uTinv, false, new Float32Array([Ti[0], Ti[3], Ti[6], Ti[1], Ti[4], Ti[7], Ti[2], Ti[5], Ti[8]]));
    gl.uniform3fv(U.uN1, N[0]); gl.uniform3fv(U.uN2, N[1]); gl.uniform3fv(U.uN3, N[2]);
    var leftHand = domain && state.hand === 'left' && (state.pattern === 'snub' || twisted());
    if (domain) {
      uploadDomain(R, U, uniform);
      gl.uniform1i(U.uHand, leftHand ? 1 : 0);
    } else if (uniform) {
      gl.uniform1i(U.uEdgeMask, PATTERN_BY_ID.get(state.pattern).mask);
      gl.uniform3fv(U.uCorner, uniform.corner);
      gl.uniform3fv(U.uEdgeEnd, uniform.ends);
      gl.uniform3fv(U.uEdgeNormal, uniform.normals);
      gl.uniform3iv(U.uTileMasks, uniform.faceMasks);
      gl.uniform3iv(U.uTileSides, uniform.faceSides);
      gl.uniform3fv(U.uTileCentre, uniform.centres.flat());
      gl.uniform3fv(U.uTileRadii, uniform.radii);
      gl.uniform3fv(U.uDesignScales, uniform.inradii.map(designScale));
    }
    if (uniform) {
      gl.uniform1f(U.uLargestRadius, uniform.previewRadius);
      gl.uniform1i(U.uLargestOnly, state.designsOn === 'largest' ? 1 : 0);
    }
    gl.uniform1f(U.uScaleLen, uniform ? uniform.edgeLength : scaleLen);
    gl.uniform1f(U.uRadius, Math.max(sd.c, sd.b));
    var edgeScale = Math.min(uniform ? uniform.edgeLength : sd.c, 1.2);
    gl.uniform1f(U.uEdgeW, state.edge / 100 * edgeScale * (triangles ? 0.8 : 1));
    gl.uniform1f(U.uShade, state.shade / 100);
    gl.uniform1i(U.uStyle, triangles ? 1 : 0);
    gl.uniform1i(U.uColourMode, c.plain ? 1 : state.colour === 'type' ? 2 : 0);
    var slots = faces.length * MAXN;
    var actionData = new Int32Array(slots * 4), offset = 0;
    if (!c.plain && state.colour !== 'type') faces.forEach(function (sides, i) {
      if (!sides) return;
      var action = actions[i], n = action ? action.n : 1;
      for (var j = 0; j < n; j++) {
        var at = (i * MAXN + j) * 4;
        if (action) actionData.set(action.table.slice(j * 3, j * 3 + 3), at);
        var colour = opt.identityColours ? j : P0[i][j];
        // Left reflects the whole colour action in the horizontal mirror.
        actionData[at + 3] = offset + (leftHand && action ? action.table[3 * colour] : colour);
      }
      offset += n;
    });
    gl.uniform4iv(U.uAction, actionData);
    var typeColours = new Int32Array(4);
    faces.forEach(function (n, i) { typeColours[i] = types.indexOf(n); });
    gl.uniform4iv(U.uTypeColour, typeColours);
    gl.uniform1i(U.uPar0, opt.identityColours ? 0 : par0);
    gl.uniform1i(U.uMirrors, state.mirrors ? 1 : 0);
    gl.uniform1i(U.uMotif, state.motif ? 1 : 0);
    var gkey = customGlyph ? customGlyph : state.design === 'letter' ? 'letter:' + state.glyph : state.design;
    if (state.motif && R.glyph !== gkey) {
      gl.bindTexture(gl.TEXTURE_2D, R.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, customGlyph || designCanvas());
      gl.generateMipmap(gl.TEXTURE_2D);
      // Flip only the picture. Left on, it would reverse the face rows of
      // the next domain upload and mix the two halves.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      R.glyph = gkey;
    }
    gl.uniform3fv(U.uXi, opt.single ? XI0 : xi);
    gl.uniform1i(U.uUpright, state.orient === 'up' ? 1 : 0);
    gl.uniform1f(U.uDesignA, state.designA / 100);
    var T = opt.T;
    gl.uniformMatrix3fv(U.uT, false, new Float32Array([T[0], T[3], T[6], T[1], T[4], T[7], T[2], T[5], T[8]]));
    var mob = opt.single ? { z0: [0, 0], phi: 0 } : uprightMap();
    gl.uniform2f(U.uZ0, mob.z0[0], mob.z0[1]);
    gl.uniform1f(U.uPhi, mob.phi);
    gl.uniform1i(U.uSingle, opt.single ? 1 : 0);
    gl.uniform1i(U.uClear, opt.clear ? 1 : 0);
    gl.uniform3fv(U.uBg, c.bg);
    gl.uniform3fv(U.uEdge, c.edge);
    gl.uniform3fv(U.uMono, c.mono);
    gl.uniform3fv(U.uRim, c.rim);
    var palette = new Uint32Array(slots);
    c.pal.forEach(function (colour, i) { palette[i] = parseInt(colour.slice(1), 16); });
    gl.uniform4uiv(U.uPal, palette);
    var cam = camera();
    gl.uniform3fv(U.uCamPos, cam.pos); gl.uniform3fv(U.uCamF, cam.f);
    gl.uniform3fv(U.uCamR, cam.r); gl.uniform3fv(U.uCamU, cam.u);
    gl.uniform1f(U.uFov, cam.fov);
    gl.uniform1f(U.uK, MODELS_BY_N[opt.model].k || 1);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- Page ---------- */

  var canvas = document.getElementById('view');
  var tileCanvas = document.getElementById('tile');
  var main, preview;
  try {
    main = makeRenderer(canvas);
    preview = makeRenderer(tileCanvas);
  } catch (err) {
    console.error(err);
    main = null;
  }
  if (!main) { document.getElementById('fail').hidden = false; return; }

  readHash();
  state.motif = state.design !== 'none';
  N = mirrors(state.p, state.q, state.r);
  updateGeometry();
  resetColours();
  if (state.clear) document.body.classList.add('clear');

  var dirty = true, tileDirty = true;
  aimLetters();
  function invalidate() { dirty = true; tileDirty = true; }

  function resize() {
    var w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 5e6) dpr = Math.sqrt(5e6 / (w * h));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var tdpr = Math.min(window.devicePixelRatio || 1, 2);
    tileCanvas.width = Math.round(112 * tdpr); tileCanvas.height = Math.round(112 * tdpr);
    dirty = true; tileDirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  function modelNo() { return MODEL_BY_ID[state.model].n; }

  function viewSize() {
    var w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
    return { w: w, h: h, half: 0.5 * Math.min(w, h) };
  }
  // Screen position (CSS pixels) to the model's screen coordinates.
  function screenS(x, y) {
    var v = viewSize();
    return [(x - v.w / 2) / v.half / state.zoom + state.pan[0], (v.h / 2 - y) / v.half / state.zoom + state.pan[1]];
  }
  function pointAt(x, y) { return toHyp(modelNo(), screenS(x, y)); }

  // Every change of T goes through here: it refuses an overflow, pulls T
  // back to an exact Lorentz matrix and snaps the view centre home.
  // All or nothing: if any step goes non-finite, the old view stays.
  function setT(T) {
    if (!finite(T)) return false;
    T = renorm(T);
    if (!finite(T)) return false;
    var oldT = state.T, oldP0 = P0, oldPar0 = par0, oldXi = xi, oldW = Wref;
    state.T = T;
    snapHome();
    if (!finite(state.T)) { state.T = oldT; P0 = oldP0; par0 = oldPar0; xi = oldXi; Wref = oldW; return false; }
    dirty = true;
    return true;
  }
  // Fold the view centre's world point into the triangle by a reflection
  // group element G. T becomes T G⁻¹ and the same reflections update
  // the colour permutations and the parity that selects a domain half.
  function snapHome() {
    var w0 = apply(linv(state.T), [0, 0, 1]);
    var f = fold(w0, N);
    if (!f.list.length) return;
    state.T = renorm(mul(state.T, linv(f.G)));
    P0 = P0.map(function (permutation, j) {
      if (!actions[j]) return permutation;
      var S = actions[j].table;
      return permutation.map(function (_, x) {
        for (var i = f.list.length - 1; i >= 0; i--) x = S[x * 3 + f.list[i]];
        return permutation[x];
      });
    });
    par0 = (par0 + f.list.length) % 2;
    var x2 = apply(f.G, xi); xi = [x2[0] / x2[2], x2[1] / x2[2], 1];
    Wref = renorm(mul(Wref, linv(f.G)));
  }

  function moveFromTo(a, b) {
    if (!a || !b || !(a[2] <= 1e5) || !(b[2] <= 1e5) || !a.concat(b).every(isFinite)) return false;
    return setT(mul(mul(lift(b), linv(lift(a))), state.T));
  }

  /* Pointer: one finger or the mouse drags, two fingers pinch and pan.
     Shift, the right button or the middle button pans the view. */
  var pointers = new Map(), last = null, vel = null, lastTime = 0, pinch = null, panning = false;
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    vel = null;
    if (pointers.size === 1) {
      last = { x: e.clientX, y: e.clientY };
      panning = state.drag === 'pan' || e.shiftKey || e.button === 1 || e.button === 2;
      canvas.classList.add('dragging');
    } else if (pointers.size === 2) { pinch = pinchState(); last = null; }
  });
  function pinchState() {
    var v = Array.from(pointers.values());
    return { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y), mx: (v[0].x + v[1].x) / 2, my: (v[0].y + v[1].y) / 2 };
  }
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      var now2 = pinchState();
      var v = viewSize();
      state.pan[0] -= (now2.mx - pinch.mx) / v.half / state.zoom;
      state.pan[1] += (now2.my - pinch.my) / v.half / state.zoom;
      zoomAt(state.zoom * now2.d / Math.max(pinch.d, 1), now2.mx, now2.my);
      pinch = now2;
      return;
    }
    if (!last) return;
    var now = performance.now();
    if (panning) {
      var vs = viewSize();
      state.pan[0] -= (e.clientX - last.x) / vs.half / state.zoom;
      state.pan[1] += (e.clientY - last.y) / vs.half / state.zoom;
      dirty = true;
    } else {
      var a = pointAt(last.x, last.y), b = pointAt(e.clientX, e.clientY);
      if (a && b && moveFromTo(a, b)) {
        // Velocity for the glide after release: where the drag step sends the origin.
        var o = apply(mul(lift(b), linv(lift(a))), [0, 0, 1]), dt = Math.max(now - lastTime, 8) / 1000;
        var t = Math.acosh(Math.max(o[2], 1)), r = Math.hypot(o[0], o[1]);
        vel = r > 1e-9 ? [o[0] / r * t / dt, o[1] / r * t / dt] : [0, 0];
      }
    }
    lastTime = now;
    last = { x: e.clientX, y: e.clientY };
  });
  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      canvas.classList.remove('dragging');
      if (panning || performance.now() - lastTime > 80 || !vel) vel = null;
      else if (Math.hypot(vel[0], vel[1]) > 6) vel = vel.map(function (v) { return v * 6 / Math.hypot(vel[0], vel[1]); });
      last = null; panning = false;
    } else if (pointers.size === 1) {
      var v = Array.from(pointers.values())[0];
      last = { x: v.x, y: v.y };
    }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(state.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });

  // Zoom about a screen point, which stays where it is.
  function zoomAt(z, x, y) {
    z = Math.max(0.3, Math.min(60, z));
    var v = viewSize(), qx = (x - v.w / 2) / v.half, qy = (v.h / 2 - y) / v.half;
    state.pan[0] += qx * (1 / state.zoom - 1 / z);
    state.pan[1] += qy * (1 / state.zoom - 1 / z);
    state.zoom = z; dirty = true;
  }
  function zoomCentre(f) { var v = viewSize(); zoomAt(state.zoom * f, v.w / 2, v.h / 2); }

  window.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    var k = e.key, d = 0.12;
    if (k === '+' || k === '=') zoomCentre(1.25);
    else if (k === '-' || k === '_') zoomCentre(1 / 1.25);
    else if (k === 'ArrowLeft') nudge(d, 0);
    else if (k === 'ArrowRight') nudge(-d, 0);
    else if (k === 'ArrowUp') nudge(0, -d);
    else if (k === 'ArrowDown') nudge(0, d);
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'r' || k === 'R') resetView();
    else if (k === 'Escape') document.getElementById('about').hidden = true;
    else return;
    e.preventDefault();
  });
  function nudge(dx, dy) { setT(mul(step(dx, dy), state.T)); }

  /* Motion: spin about the view centre, or fly in a straight line. The snap
     back home keeps the numbers small however far the flight goes. */
  var prev = performance.now();
  function frame(now) {
    var dt = Math.min((now - prev) / 1000, 0.05); prev = now;
    if (state.motion === 'spin') setT(mul(rotZ(0.25 * dt), state.T));
    else if (state.motion === 'fly') {
      var v = 0.45 * dt, m = MODEL_BY_ID[state.model];
      setT(mul(m.fly === 'x' ? step(-v, 0) : step(0, -v), state.T));
    }
    if (vel && !last) {
      setT(mul(step(vel[0] * dt, vel[1] * dt), state.T));
      var k = Math.exp(-dt * 4); vel = [vel[0] * k, vel[1] * k];
      if (Math.hypot(vel[0], vel[1]) < 0.02) vel = null;
    }
    if (dirty) { draw(main, { model: modelNo(), T: state.T, zoom: state.zoom, pan: state.pan, clear: state.clear }); dirty = false; }
    if (tileDirty && preview) { drawTile(); tileDirty = false; }
    requestAnimationFrame(frame);
  }

  function drawTile() {
    if (state.style === 'tiles' && state.pattern !== 'regular') {
      var zoom = 0.86 / (0.95 * Math.tanh(geometry.previewRadius));
      var corner = state.pattern === 'snub' && state.hand === 'left' ? apply(reflection(N[0]), geometry.corner) : geometry.corner;
      draw(preview, { model: 0, T: linv(lift(corner)), zoom: zoom, pan: [0, 0], single: true, identityColours: true });
      return;
    }
    var sd = sides(state.p, state.q, state.r), R = Math.max(sd.c, sd.b);
    var tileZoom = 0.86 / (0.95 * Math.tanh(R / 2));
    draw(preview, { model: 0, T: ident(), zoom: tileZoom, pan: [0, 0], single: true, identityColours: true });
  }

  /* ---------- Controls ---------- */

  var featured = document.getElementById('featured'), more = document.getElementById('more');
  var select = document.getElementById('model-select');
  MODELS.forEach(function (m) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = m.name; b.dataset.model = m.id;
    (m.featured ? featured : more).appendChild(b);
    b.addEventListener('click', function () { setModel(m.id); });
    var o = document.createElement('option'); o.value = m.id; o.textContent = m.name; select.appendChild(o);
  });
  select.addEventListener('change', function () { setModel(select.value); });

  function setModel(id) {
    state.model = id; vel = null; state.pan = [0, 0]; state.zoom = 1; dirty = true; syncUI(); writeHash();
  }

  // Buttons on a wide screen, and the same choices as a menu on a phone.
  // Each choice is a pattern and, for Snub, a hand. The order pairs
  // labels of similar length in the two rows of four.
  var PATTERN_CHOICES = [
    ['regular', 'Regular'], ['truncated', 'Truncated'], ['omnitruncated', 'Omnitruncated'], ['snub', 'Snub left', 'left'],
    ['expanded', 'Expanded'], ['rectified', 'Rectified'], ['truncated-dual', 'Truncated dual'], ['snub', 'Snub right', 'right'],
    ['goldberg', 'Goldberg']
  ];
  var patternSelect = document.getElementById('pattern'), patternButtons = document.getElementById('patterns');
  var gpRow = document.getElementById('goldberg-row');
  function choiceKey(c) { return c[2] ? c[0] + '-' + c[2] : c[0]; }
  function setPattern(c) {
    var changed = state.pattern !== c[0];
    state.pattern = c[0];
    if (c[2]) state.hand = c[2];
    if (state.pattern === 'goldberg' && !goldbergGroup(state.p, state.q, state.r)) {
      setTiling(Math.max(state.p, 7), 3, 2);
      return;
    }
    if (changed) { updateGeometry(); updateColours(); }
    invalidate(); syncUI(); writeHash();
  }
  PATTERN_CHOICES.forEach(function (c) {
    var o = document.createElement('option'); o.value = choiceKey(c); o.textContent = c[1];
    patternSelect.appendChild(o);
    if (c[0] === 'goldberg') {
      gpRow.querySelector('.gp-main').addEventListener('click', function () { setPattern(c); });
      return;
    }
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = c[1]; b.dataset.pattern = choiceKey(c);
    b.addEventListener('click', function () { setPattern(c); });
    patternButtons.appendChild(b);
  });
  patternSelect.addEventListener('change', function () {
    setPattern(PATTERN_CHOICES.find(function (c) { return choiceKey(c) === patternSelect.value; }));
  });

  // The m and n steppers work only in Goldberg. Lowering m below n
  // lowers n with it.
  var gpSteps = gpRow.querySelectorAll('[data-gp]'), gpHand = document.getElementById('gp-hand');
  function gpStepTo(b) {
    var a = b.dataset.gp.split(','), size = state.gp.split(',').map(Number);
    size[a[0] === 'm' ? 0 : 1] += Number(a[1]);
    if (a[0] === 'm') size[1] = Math.min(size[1], size[0]);
    return gpValid(size[0], size[1]) ? size.join(',') : null;
  }
  gpSteps.forEach(function (b) {
    b.addEventListener('click', function () {
      var next = gpStepTo(b);
      if (!next || state.pattern !== 'goldberg') return;
      state.gp = next;
      updateGeometry(); updateColours(); invalidate(); syncUI(); writeHash();
    });
  });
  gpHand.addEventListener('click', function () {
    state.hand = state.hand === 'left' ? 'right' : 'left';
    invalidate(); syncUI(); writeHash();
  });

  var presets = document.getElementById('presets');
  PRESETS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.t = t.join(',');
    b.textContent = t[2] === 2 ? '{' + t[0] + ',' + t[1] + '}' : '*' + t.slice().sort(function (a, b) { return a - b; }).join('');
    b.title = t[2] === 2 ? POLYGON[t[0]] + ', ' + t[1] + ' at each corner' : 'Triangle group with angles 180°/' + t.join(', 180°/');
    b.addEventListener('click', function () {
      setTiling(t[0], t[1], t[2]);
    });
    presets.appendChild(b);
  });
  [
    ['truncated-dual', '6.6.7', 'Truncated dual'],
    ['expanded', '3.4.7.4', 'Expanded'],
    ['goldberg', gpName('3,0'), 'Goldberg', '3,0']
  ].forEach(function (preset) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = preset[1]; b.dataset.preset = preset[0]; b.title = preset[2];
    b.addEventListener('click', function () {
      state.pattern = preset[0];
      if (preset[3]) state.gp = preset[3];
      state.style = 'tiles';
      setTiling(7, 3, 2);
    });
    presets.appendChild(b);
  });
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.dataset.step.split(','), k = a[0], d = +a[1], t = { p: state.p, q: state.q, r: state.r };
      t[k] += d;
      if (valid(t.p, t.q, t.r)) setTiling(t.p, t.q, t.r);
    });
  });
  function valid(p, q, r) { return p >= 3 && q >= 3 && r >= 2 && p <= 16 && q <= 16 && r <= 12 && isHyperbolic(p, q, r); }

  function setTiling(p, q, r) {
    if (state.pattern === 'goldberg' && !goldbergGroup(p, q, r)) state.pattern = DEFAULT_PATTERN;
    state.p = p; state.q = q; state.r = r; N = mirrors(p, q, r);
    updateGeometry();
    state.T = ident(); vel = null;
    resetColours(); aimLetters();
    invalidate(); syncUI(); writeHash();
  }

  // Aim the designs. Upright takes the current view as its reference. For
  // One point, xi becomes the boundary point straight up the screen
  // from the view centre, so the letters near the centre stand upright.
  // Where the centre is off the model, the top of the Poincaré disk stands in.
  function aimLetters() {
    Wref = state.T.slice();
    var n = modelNo(), s0 = state.pan, Ti = linv(state.T);
    var a = toHyp(n, s0), b = toHyp(n, [s0[0], s0[1] + 0.01 / state.zoom]);
    if (a && b && a.concat(b).every(isFinite) && a[2] < 1e5 && b[2] < 1e5) {
      a = apply(Ti, a); b = apply(Ti, b);
      var m = mdot(b, a), t = b.map(function (x, i) { return x + m * a[i]; }), k = Math.sqrt(Math.max(mdot(t, t), 0));
      if (k > 1e-9) {
        var e = a.map(function (x, i) { return x + t[i] / k; });
        if (e[2] > 0) { xi = [e[0] / e[2], e[1] / e[2], 1]; dirty = true; return; }
      }
    }
    var u = apply(Ti, XI0); xi = [u[0] / u[2], u[1] / u[2], 1]; dirty = true;
  }

  function resetView() {
    state.T = ident(); state.zoom = 1; state.pan = [0, 0]; vel = null;
    resetColours(); aimLetters();
    invalidate(); syncUI(); writeHash();
  }

  document.querySelectorAll('[data-style]').forEach(function (b) {
    b.addEventListener('click', function () { state.style = b.dataset.style; updateColours(); invalidate(); syncUI(); writeHash(); });
  });
  document.querySelectorAll('[data-colour]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.colour = b.dataset.colour;
      updateColours();
      invalidate(); syncUI(); writeHash();
    });
  });
  document.querySelectorAll('[data-motion]').forEach(function (b) {
    b.addEventListener('click', function () { state.motion = b.dataset.motion; syncUI(); writeHash(); b.blur(); });
  });
  document.querySelectorAll('[data-drag]').forEach(function (b) {
    b.addEventListener('click', function () { state.drag = b.dataset.drag; syncUI(); b.blur(); });
  });
  // The shader redraws in a few milliseconds, so these sliders follow the drag.
  var edge = document.getElementById('edge'), shadeIn = document.getElementById('shade');
  edge.addEventListener('input', function () {
    state.edge = +edge.value; document.getElementById('edge-out').textContent = (+edge.value).toFixed(1); invalidate();
  });
  edge.addEventListener('change', writeHash);
  shadeIn.addEventListener('input', function () {
    state.shade = +shadeIn.value; document.getElementById('shade-out').textContent = shadeIn.value + '%'; invalidate();
  });
  shadeIn.addEventListener('change', writeHash);
  document.getElementById('mirrors').addEventListener('change', function (e) { state.mirrors = e.target.checked; invalidate(); });
  var designSel = document.getElementById('design');
  DESIGN_IDS.forEach(function (id) {
    var o = document.createElement('option'); o.value = id;
    o.textContent = id === 'none' ? 'None' : id === 'letter-r' ? 'Letter R' : id === 'letter-f' ? 'Letter F' : id === 'letter' ? 'Your own letter' : DESIGN_BY_ID[id].name;
    designSel.appendChild(o);
  });
  designSel.addEventListener('change', function () {
    var was = state.motif;
    state.design = designSel.value; state.motif = state.design !== 'none'; customGlyph = null;
    if (state.motif && !was) aimLetters();
    invalidate(); syncUI(); writeHash();
    if (state.design === 'letter') document.getElementById('glyph').focus();
  });
  document.getElementById('glyph').addEventListener('input', function (e) {
    var ch = Array.from(e.target.value.trim()).pop();
    if (!ch) return;
    state.glyph = ch; e.target.value = ch;
    invalidate(); writeHash();
  });
  var largestOnly = document.getElementById('largest-only');
  largestOnly.addEventListener('change', function () { state.designsOn = largestOnly.checked ? 'largest' : 'all'; invalidate(); writeHash(); });
  var designAIn = document.getElementById('design-a');
  designAIn.addEventListener('input', function () {
    state.designA = +designAIn.value; document.getElementById('design-a-out').textContent = designAIn.value + '%'; invalidate();
  });
  designAIn.addEventListener('change', writeHash);
  document.querySelectorAll('[data-orient]').forEach(function (b) {
    b.addEventListener('click', function () { state.orient = b.dataset.orient; aimLetters(); invalidate(); syncUI(); writeHash(); });
  });
  document.getElementById('zoom-in').addEventListener('click', function () { zoomCentre(1.25); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomCentre(1 / 1.25); });
  document.getElementById('home').addEventListener('click', function (e) { resetView(); e.currentTarget.blur(); });

  document.getElementById('about-open').addEventListener('click', function () {
    var a = document.getElementById('about'); a.hidden = !a.hidden;
  });
  document.getElementById('about-close').addEventListener('click', function () { document.getElementById('about').hidden = true; });

  // On a phone the tiling and colour cards fold behind their headings.
  var foldCards = [document.getElementById('tiling-card'), document.getElementById('colour-card')];
  var small = window.matchMedia('(max-width: 640px), (max-height: 740px)');
  function setFolds() { foldCards.forEach(function (c) { c.classList.toggle('folded', small.matches); syncFold(c); }); }
  function syncFold(c) { c.querySelector('.fold').setAttribute('aria-expanded', String(!c.classList.contains('folded'))); }
  foldCards.forEach(function (c) {
    c.querySelector('.fold').addEventListener('click', function () {
      var open = c.classList.contains('folded');
      foldCards.forEach(function (o) { o.classList.add('folded'); syncFold(o); });
      if (open) c.classList.remove('folded');
      syncFold(c);
      tileDirty = true;
    });
  });
  if (small.addEventListener) small.addEventListener('change', setFolds);
  setFolds();

  var fs = document.getElementById('fullscreen');
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) fs.hidden = false;
  fs.addEventListener('click', function () { toggleFullscreen(); fs.blur(); });
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  new MutationObserver(invalidate)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function syncUI() {
    var m = MODEL_BY_ID[state.model];
    document.querySelectorAll('[data-model]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.model === state.model)); });
    select.value = state.model;
    var key = state.pattern === 'snub' ? 'snub-' + state.hand : state.pattern;
    patternSelect.value = key;
    document.querySelectorAll('[data-pattern]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pattern === key)); });
    var gp = state.pattern === 'goldberg', chiral = state.pattern === 'snub' || (gp && twisted());
    var size = state.gp.split(',');
    gpRow.classList.toggle('active', gp);
    document.getElementById('gp-out').textContent = gpName(state.gp);
    document.getElementById('gp-m').textContent = size[0];
    document.getElementById('gp-n').textContent = size[1];
    gpSteps.forEach(function (b) { b.disabled = !gp || !gpStepTo(b); });
    // One toggle for the hand. Straight and symmetric sizes have none.
    gpHand.disabled = !gp || !twisted();
    gpHand.textContent = twisted() ? (state.hand === 'left' ? 'Left' : 'Right') : 'Sym';
    gpHand.setAttribute('aria-label', twisted() ? 'Hand: ' + state.hand + '. Press to switch' : 'Symmetric size, no hand');
    document.getElementById('facts').innerHTML =
      '<dt>Straight lines</dt><dd>' + m.lines + '</dd><dt>Angles</dt><dd>' + m.angles + '</dd>' +
      '<dt>Sizes</dt><dd>' + m.sizes + '</dd><dd class="made">' + m.made + '</dd>';
    var t = state.p + ',' + state.q + ',' + state.r;
    presets.querySelectorAll('button').forEach(function (b) {
      var selected = b.dataset.t === t && !gp;
      if (b.dataset.preset) selected = t === '7,3,2' && b.dataset.preset === state.pattern &&
        state.style === 'tiles' && (!gp || state.gp === '3,0');
      else if (t === '7,3,2' && (state.pattern === 'truncated-dual' || state.pattern === 'expanded')) selected = false;
      b.setAttribute('aria-pressed', String(selected));
    });
    ['p', 'q', 'r'].forEach(function (k) { document.getElementById(k + '-out').textContent = state[k]; });
    document.querySelectorAll('[data-step]').forEach(function (b) {
      var a = b.dataset.step.split(','), tt = { p: state.p, q: state.q, r: state.r };
      tt[a[0]] += +a[1];
      b.disabled = !valid(tt.p, tt.q, tt.r) || (gp && !goldbergGroup(tt.p, tt.q, tt.r));
    });
    var deg = function (n) { return +(180 / n).toFixed(1) + '°'; };
    var name = document.getElementById('tile-name'), desc = document.getElementById('tile-desc');
    var uniform = state.style === 'tiles' && state.pattern !== 'regular';
    tileCanvas.setAttribute('aria-label', gp && uniform ? 'Goldberg tiles in the Poincaré disk' :
      uniform ? 'Tiles around a corner in the Poincaré disk' : 'One tile of the tiling, drawn in the Poincaré disk');
    if (state.style === 'triangles') {
      name.textContent = 'Triangles';
      desc.textContent = 'Angles ' + deg(state.p) + ', ' + deg(state.q) + ', ' + deg(state.r);
    } else if (gp) {
      name.textContent = gpName(state.gp);
      desc.textContent = 'Hexagons and ' + (POLYGON[state.p] || state.p + '-gons');
    } else if (uniform) {
      var pattern = PATTERN_BY_ID.get(state.pattern);
      name.textContent = pattern.name;
      desc.textContent = vertexFigure(pattern, geometry.faceSides, state.r) + ' at each corner';
    } else if (state.r === 2) {
      name.textContent = '{' + state.p + ',' + state.q + '}';
      desc.textContent = cap(POLYGON[state.p] || state.p + '-gons') + ', ' + state.q + ' at each corner';
    } else {
      name.textContent = 2 * state.p + '-sided tiles';
      desc.textContent = 'Corners of ' + deg(state.q / 2) + ' and ' + deg(state.r / 2);
    }
    document.getElementById('tile-sym').textContent = (chiral && uniform ? 'Symmetry ' : 'Symmetry *') + [state.p, state.q, state.r].sort(function (a, b) { return a - b; }).join('');
    document.querySelectorAll('[data-style]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.style === state.style)); });
    document.querySelectorAll('[data-colour]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.colour === state.colour)); });
    // Each colour button shows how many colours it would use.
    var faces = activeFaces();
    ['many', 'few'].forEach(function (scheme) {
      var n = faces.reduce(function (sum, sides, corner) {
        if (!sides) return sum;
        var action = colourings(state.p, state.q, state.r, corner % 3)[scheme];
        return sum + (action ? action.n : 1);
      }, 0);
      document.getElementById('n-' + scheme).textContent = ' (' + n + ')';
    });
    var types = state.style === 'tiles' && geometry && geometry.halves ? geometry.typeCount : tileTypes(faces).length;
    document.getElementById('n-type').textContent = ' (' + types + ')';
    document.querySelectorAll('[data-motion]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.motion === state.motion)); });
    document.querySelectorAll('[data-drag]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.drag === state.drag)); });
    edge.value = state.edge; document.getElementById('edge-out').textContent = (+state.edge).toFixed(1);
    shadeIn.value = state.shade; document.getElementById('shade-out').textContent = state.shade + '%';
    designSel.value = state.design;
    document.getElementById('glyph').value = state.glyph;
    document.getElementById('glyph').hidden = state.design !== 'letter';
    document.getElementById('orient').hidden = !state.motif;
    document.getElementById('designs-on-row').hidden = !state.motif;
    largestOnly.checked = state.designsOn === 'largest';
    document.getElementById('design-a-row').hidden = !state.motif;
    designAIn.value = state.designA; document.getElementById('design-a-out').textContent = state.designA + '%';
    document.querySelectorAll('[data-orient]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.orient === state.orient)); });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  syncUI();
  requestAnimationFrame(frame);

  // For the screenshot, thumbnail and video tools.
  window.Hyper = {
    state: state, invalidate: invalidate, setModel: setModel, setTiling: setTiling, resetView: resetView, MODELS: MODELS,
    setT: setT, step: step, rotZ: rotZ, mul: mul, ident: ident, aimLetters: aimLetters,
    setPicture: function (c) { customGlyph = c; state.motif = true; aimLetters(); invalidate(); }
  };
})();
