/* The countryside round the road, modelled on lowland English farmland seen
   from above: blocks of farmland about 750 m across, each with its own
   direction; inside a block, rows of long four-sided fields, 110 to 200 m
   deep and 1.3 to 2.7 times as long, with slightly tilted edges and joins
   offset row to row; hedges round every field; tree belts on some block
   edges; and woods as irregular blobs that ignore the field lines, plus the
   odd field-shaped copse.

   The shader draws the ground. The JavaScript repeats the same geometry
   with the same integer hash to plant trees on the woods and hedges. */

const FARM = 750;          // the average block of farmland (m)
const WOOD_LEVEL = 0.68;   // the wood pattern above this is woodland
const COPSE = 0.025;       // the share of fields that are small copses
const BELT = 0.4;          // the share of block edges with a tree belt
const BELT_HALF = 4;       // half the width of a tree belt (m)

export const FIELDS_GLSL = `
const float FARM = ${FARM}.0;
uint ihash(ivec2 c, uint salt) {
  uint h = uint(c.x + 65536) * 1597334677u ^ uint(c.y + 65536) * 3812015801u ^ salt * 2654435761u;
  h ^= h >> 16; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return h;
}
float h01(ivec2 c, uint salt) { return float(ihash(c, salt) >> 8) / 16777216.0; }
float h3(ivec2 f, int k, uint salt) { return h01(ivec2(f.x * 977 + k, f.y * 1013 - k * 7), salt); }
ivec2 key4(ivec2 f, int j, int i) { return ivec2(f.x * 977 + j * 31 + i * 7919, f.y * 1013 - j * 7 + i * 3); }
float h4(ivec2 f, int j, int i, uint salt) { return h01(key4(f, j, i), salt); }
float vnoise(vec2 x, uint salt) {
  ivec2 b = ivec2(floor(x));
  vec2 f = x - floor(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h01(b, salt), h01(b + ivec2(1, 0), salt), f.x),
             mix(h01(b + ivec2(0, 1), salt), h01(b + ivec2(1, 1), salt), f.x), f.y);
}
float woodPattern(vec2 w) {
  return 0.55 * vnoise(w / 620.0, 90u) + 0.3 * vnoise(w / 230.0, 91u) + 0.15 * vnoise(w / 80.0, 92u);
}
vec2 warp(vec2 p) {
  return p + vec2(9.0 * sin(p.y * 0.0061 + 1.3) + 5.0 * sin(p.y * 0.017),
                  9.0 * sin(p.x * 0.0057 + 0.4) + 5.0 * sin(p.x * 0.019));
}
vec2 farmSite(ivec2 f) { return (vec2(f) + 0.15 + 0.7 * vec2(h01(f, 81u), h01(f, 82u))) * FARM; }
float rowY(ivec2 fa, int j, float x, float H) {
  return (float(j) + 0.3 * (h3(fa, j, 86u) - 0.5)) * H + 0.1 * (h3(fa, j, 87u) - 0.5) * x;
}
float colX(ivec2 fa, int j, int i, float y, float W, float H) {
  return h3(fa, j, 88u) * W + (float(i) + 0.35 * (h4(fa, j, i, 89u) - 0.5)) * W
    + 0.5 * (h4(fa, j, i, 90u) - 0.5) * (y - (float(j) + 0.5) * H);
}
bool gone(ivec2 fa, int j, int i) { return h4(fa, j, i, 91u) < 0.2; }

vec3 fields(vec2 p0, vec3 green) {
  vec2 p = warp(p0);
  // The block: nearest block centre, and the distance to its edge.
  ivec2 b = ivec2(floor(p / FARM)), fa = b, fb = b;
  float best = 1e18;
  vec2 sa = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = b + ivec2(i, j);
    vec2 s = farmSite(c);
    float d = dot(s - p, s - p);
    if (d < best) { best = d; fa = c; sa = s; }
  }
  float edge = 1e9;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 c = fa + ivec2(i, j);
    if (c == fa) continue;
    vec2 s = farmSite(c);
    float d = dot(0.5 * (sa + s) - p, normalize(s - sa));
    if (d < edge) { edge = d; fb = c; }
  }
  // The block's own frame, and its rows and fields.
  float a = h01(fa, 83u) * 3.14159265;
  float H = 110.0 + 90.0 * h01(fa, 84u), W = H * (1.3 + 1.4 * h01(fa, 85u));
  float ca = cos(a), sn = sin(a);
  vec2 d = p - sa, q = vec2(ca * d.x + sn * d.y, -sn * d.x + ca * d.y);
  int j0 = int(floor(q.y / H)), j = j0;
  for (int k = -1; k <= 1; k++) {
    if (rowY(fa, j0 + k, q.x, H) <= q.y && q.y < rowY(fa, j0 + k + 1, q.x, H)) j = j0 + k;
  }
  float s0 = 0.1 * (h3(fa, j, 87u) - 0.5), s1 = 0.1 * (h3(fa, j + 1, 87u) - 0.5);
  float dB = (q.y - rowY(fa, j, q.x, H)) / sqrt(1.0 + s0 * s0);
  float dT = (rowY(fa, j + 1, q.x, H) - q.y) / sqrt(1.0 + s1 * s1);
  int i0 = int(floor((q.x - h3(fa, j, 88u) * W) / W)), i = i0;
  for (int k = -1; k <= 1; k++) {
    if (colX(fa, j, i0 + k, q.y, W, H) <= q.x && q.x < colX(fa, j, i0 + k + 1, q.y, W, H)) i = i0 + k;
  }
  int left = i, right = i + 1;
  for (int k = 0; k < 2; k++) if (gone(fa, j, left)) left--;
  for (int k = 0; k < 2; k++) if (gone(fa, j, right)) right++;
  float tl = 0.5 * (h4(fa, j, left, 90u) - 0.5), tr = 0.5 * (h4(fa, j, right, 90u) - 0.5);
  float dL = (q.x - colX(fa, j, left, q.y, W, H)) / sqrt(1.0 + tl * tl);
  float dR = (colX(fa, j, right, q.y, W, H) - q.x) / sqrt(1.0 + tr * tr);
  float hedge = min(min(dB, dT), min(dL, dR));
  ivec2 id = key4(fa, j, left);

  float footprint = length(fwidth(p0));
  float kind = h01(id, 3u), tone = h01(id, 4u);
  bool belt = h01(fa + fb, 95u) < ${BELT} && edge < ${BELT_HALF}.0;
  bool wood = woodPattern(p) > ${WOOD_LEVEL} || h01(id, 30u) < ${COPSE} || belt;
  vec3 field;
  if (wood) {
    // A canopy seen from above: crowns about 6 m across.
    vec2 cq = floor(p0 / 6.0);
    float crown = 1e9;
    for (int jj = -1; jj <= 1; jj++) for (int ii = -1; ii <= 1; ii++) {
      ivec2 c = ivec2(cq) + ivec2(ii, jj);
      vec2 o = vec2(c) + vec2(h01(c, 11u), h01(c, 12u));
      crown = min(crown, length(p0 / 6.0 - o));
    }
    float mottle = mix(1.0 - 0.35 * smoothstep(0.25, 0.75, crown), 0.85, smoothstep(0.3, 1.5, footprint / 6.0));
    return green * vec3(0.38, 0.47, 0.50) * mix(0.9, 1.12, tone) * mottle;
  }
  if (kind < 0.27) field = green * vec3(0.57, 0.66, 0.69);        // winter wheat, dark green
  else if (kind < 0.57) field = green * vec3(0.78, 0.84, 0.82);   // grass, mid green
  else if (kind < 0.67) field = green * vec3(1.00, 0.95, 1.12);   // cut grass, pale
  else if (kind < 0.82) field = green * vec3(0.97, 0.67, 0.92);   // ploughland, brown
  else if (kind < 0.94) field = green * vec3(1.26, 0.95, 1.12);   // stubble, tan
  else field = green * vec3(1.24, 0.95, 0.62);                    // oilseed rape, mustard
  field *= mix(0.92, 1.08, tone) * (0.95 + 0.1 * vnoise(p / 45.0, 93u));
  // Tramlines along the field's length, every 24 m, on arable fields.
  if (kind < 0.27 || kind >= 0.67) {
    float fade = 1.0 - smoothstep(0.6, 3.0, footprint);
    float tram = 1.0 - smoothstep(0.3, 0.3 + footprint, (0.5 - abs(fract(q.y / 24.0) - 0.5)) * 24.0);
    field *= 1.0 - 0.10 * tram * fade;
    field *= 1.0 + 0.03 * sin(q.y * 2.6) * (1.0 - smoothstep(0.2, 1.0, footprint));
  }
  // Hedges round each field, about 1.8 m wide, and round each block.
  float line = min(hedge, edge);
  float aa = max(footprint, 0.05);
  float border = (1.0 - smoothstep(0.9 - aa, 0.9 + aa, line)) * (1.0 - smoothstep(8.0, 30.0, footprint));
  return mix(field, green * vec3(0.41, 0.47, 0.51), border * 0.92);
}`;

/* ------------------------------------------------- the same in JavaScript */

function ihash(x, z, salt) {
  // Cells are offset to keep them positive, as the shader needs.
  let h = (Math.imul(x + 65536, 1597334677) ^ Math.imul(z + 65536, 3812015801) ^ Math.imul(salt, 2654435761)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0; h = Math.imul(h, 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const h01 = (x, z, salt) => (ihash(x, z, salt) >>> 8) / 16777216;
const h3 = (fx, fz, k, salt) => h01(fx * 977 + k, fz * 1013 - k * 7, salt);
const h4 = (fx, fz, j, i, salt) => h01(fx * 977 + j * 31 + i * 7919, fz * 1013 - j * 7 + i * 3, salt);
function vnoise(x, z, salt) {
  const bx = Math.floor(x), bz = Math.floor(z);
  let fx = x - bx, fz = z - bz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h01(bx, bz, salt), e = h01(bx + 1, bz, salt), g = h01(bx, bz + 1, salt), d = h01(bx + 1, bz + 1, salt);
  const lo = a + (e - a) * fx, hi = g + (d - g) * fx;
  return lo + (hi - lo) * fz;
}
const woodPattern = (x, z) => 0.55 * vnoise(x / 620, z / 620, 90) + 0.3 * vnoise(x / 230, z / 230, 91)
  + 0.15 * vnoise(x / 80, z / 80, 92);
const warpX = (x, z) => x + 9 * Math.sin(z * 0.0061 + 1.3) + 5 * Math.sin(z * 0.017);
const warpZ = (x, z) => z + 9 * Math.sin(x * 0.0057 + 0.4) + 5 * Math.sin(x * 0.019);
const siteX = (fx, fz) => (fx + 0.15 + 0.7 * h01(fx, fz, 81)) * FARM;
const siteZ = (fx, fz) => (fz + 0.15 + 0.7 * h01(fx, fz, 82)) * FARM;

/* The land at a point: whether it is wood, the distance to the nearest
   hedge or block edge, the unit vector towards it, and a number naming
   that hedge, so each hedge can have its own density of trees. */
function landAt(x0, z0) {
  const x = warpX(x0, z0), z = warpZ(x0, z0);
  const bx = Math.floor(x / FARM), bz = Math.floor(z / FARM);
  let fx = bx, fz = bz, best = Infinity;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const dx = siteX(bx + i, bz + j) - x, dz = siteZ(bx + i, bz + j) - z, d = dx * dx + dz * dz;
    if (d < best) { best = d; fx = bx + i; fz = bz + j; }
  }
  const sx = siteX(fx, fz), sz = siteZ(fx, fz);
  let edge = Infinity, ex = 0, ez = 0, gx = 0, gz = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (i === 0 && j === 0) continue;
    const tx = siteX(fx + i, fz + j), tz = siteZ(fx + i, fz + j);
    let nx = tx - sx, nz = tz - sz;
    const len = Math.hypot(nx, nz);
    nx /= len; nz /= len;
    const d = ((sx + tx) / 2 - x) * nx + ((sz + tz) / 2 - z) * nz;
    if (d < edge) { edge = d; ex = nx; ez = nz; gx = fx + i; gz = fz + j; }
  }
  const a = h01(fx, fz, 83) * Math.PI;
  const H = 110 + 90 * h01(fx, fz, 84), W = H * (1.3 + 1.4 * h01(fx, fz, 85));
  const ca = Math.cos(a), sn = Math.sin(a);
  const dx = x - sx, dz = z - sz, qx = ca * dx + sn * dz, qy = -sn * dx + ca * dz;
  const rowY = (j, px) => (j + 0.3 * (h3(fx, fz, j, 86) - 0.5)) * H + 0.1 * (h3(fx, fz, j, 87) - 0.5) * px;
  const j0 = Math.floor(qy / H);
  let j = j0;
  for (let k = -1; k <= 1; k++) if (rowY(j0 + k, qx) <= qy && qy < rowY(j0 + k + 1, qx)) j = j0 + k;
  const shift = h3(fx, fz, j, 88) * W;
  const tilt = i => 0.5 * (h4(fx, fz, j, i, 90) - 0.5);
  const colX = (i, py) => shift + (i + 0.35 * (h4(fx, fz, j, i, 89) - 0.5)) * W + tilt(i) * (py - (j + 0.5) * H);
  const gone = i => h4(fx, fz, j, i, 91) < 0.2;
  const i0 = Math.floor((qx - shift) / W);
  let i = i0;
  for (let k = -1; k <= 1; k++) if (colX(i0 + k, qy) <= qx && qx < colX(i0 + k + 1, qy)) i = i0 + k;
  let left = i, right = i + 1;
  for (let k = 0; k < 2; k++) if (gone(left)) left--;
  for (let k = 0; k < 2; k++) if (gone(right)) right++;

  // The nearest field edge, with the direction towards it in the block frame.
  const s0 = 0.1 * (h3(fx, fz, j, 87) - 0.5), s1 = 0.1 * (h3(fx, fz, j + 1, 87) - 0.5);
  const tl = tilt(left), tr = tilt(right);
  const sides = [
    [(qy - rowY(j, qx)) / Math.hypot(1, s0), s0, -1, 1, j],
    [(rowY(j + 1, qx) - qy) / Math.hypot(1, s1), -s1, 1, 1, j + 1],
    [(qx - colX(left, qy)) / Math.hypot(1, tl), -1, tl, 2, left],
    [(colX(right, qy) - qx) / Math.hypot(1, tr), 1, -tr, 2, right]
  ];
  let near = sides[0];
  for (const side of sides) if (side[0] < near[0]) near = side;
  const id = [fx * 977 + j * 31 + left * 7919, fz * 1013 - j * 7 + left * 3];
  const belt = h01(fx + gx, fz + gz, 95) < BELT && edge < BELT_HALF;
  const wood = woodPattern(x, z) > WOOD_LEVEL || h01(id[0], id[1], 30) < COPSE || belt;

  if (edge < near[0]) {
    return { wood, belt, hedge: edge, nx: ex, nz: ez, line: h01(fx + gx, fz + gz, 96), block: true };
  }
  const [dist, lx, ly, kind, index] = near;
  const len = Math.hypot(lx, ly);
  const line = kind === 1 ? h01(fx * 977 + index * 31, fz * 1013 + 5000, 50) : h4(fx, fz, j, index, 51);
  return { wood, belt, hedge: dist, nx: (ca * lx - sn * ly) / len, nz: (sn * lx + ca * ly) / len, line, block: false };
}

/* Plants the trees: woods filled at about one tree per 40 m², tree belts,
   and trees along some hedges. Each hedge gets its own density: none, a
   few, or a full line. Trees stay off the road and its verges, and only
   those nearest the road are kept, up to a cap. */
const MAX_TREES = 40000;
export function trees(oval) {
  const sites = [];
  const reach = Math.max(500, oval.R * 0.9);
  const extra = oval.extraEnd ? 3.65 : 0;
  const outer = oval.half + 14 + extra, inner = oval.half + 26;
  // Long rings are seen from far off, where trees beyond 350 m are specks.
  const sample = Math.min(reach, oval.length > 2000 ? 350 : 600);
  const offRoad = (x, z) => {
    const d = Math.hypot(Math.max(Math.abs(x) - oval.S / 2, 0), z) - oval.R;
    return (d <= -inner || d >= outer) && Math.abs(d) < sample ? Math.abs(d) : -1;
  };
  const x0 = -oval.S / 2 - oval.R - sample, x1 = -x0;
  const z0 = -oval.R - sample, z1 = -z0;

  // Woods and belts: a jittered grid of 6.5 m.
  const step = 6.5;
  for (let gz = Math.floor(z0 / step); gz <= z1 / step; gz++) {
    for (let gx = Math.floor(x0 / step); gx <= x1 / step; gx++) {
      const r1 = h01(gx, gz, 21), r2 = h01(gx, gz, 22), r3 = h01(gx, gz, 23);
      const x = (gx + 0.15 + 0.7 * r1) * step, z = (gz + 0.15 + 0.7 * r2) * step;
      const d = offRoad(x, z);
      if (d < 0) continue;
      if (!landAt(x, z).wood) continue;
      sites.push([x, z, 2.6 + 1.8 * r3, r3, d]);
    }
  }

  // Hedgerow trees: a jittered grid of 9 m, each point moved onto its
  // nearest hedge when one is within half a step.
  const hs = 9;
  for (let gz = Math.floor(z0 / hs); gz <= z1 / hs; gz++) {
    for (let gx = Math.floor(x0 / hs); gx <= x1 / hs; gx++) {
      const x = (gx + h01(gx, gz, 24)) * hs, z = (gz + h01(gx, gz, 25)) * hs;
      if (offRoad(x, z) < 0) continue;
      const land = landAt(x, z);
      if (land.wood || land.hedge > hs / 2) continue;
      const density = land.block ? 0.6 : land.line < 0.4 ? 0 : land.line < 0.75 ? 0.35 : 0.8;
      const r = h01(gx, gz, 26);
      if (r > density) continue;
      const tx = x + land.nx * land.hedge, tz = z + land.nz * land.hedge;
      const d = offRoad(tx, tz);
      if (d < 0) continue;
      sites.push([tx, tz, 2.2 + 2.2 * h01(gx, gz, 27), r, d]);
    }
  }

  sites.sort((a, b) => a[4] - b[4]);
  return new Float32Array(sites.slice(0, MAX_TREES).flatMap(t => t.slice(0, 4)));
}

/* ---------------------------------------------------------- tree drawing */

// A quad for a sprite: two triangles over the corners -1 to 1.
export const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);

// A tapered trunk with five sides, scaled by the tree's size.
export function trunkMesh() {
  const out = [], n = 5;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
    const p = (ang, r, y) => [r * Math.cos(ang), y, r * Math.sin(ang)];
    const shade = 0.75 + 0.25 * Math.cos(a - 2.2);
    out.push(...p(a, 0.16, 0), shade, ...p(b, 0.16, 0), shade, ...p(a, 0.09, 1.2), shade);
    out.push(...p(b, 0.16, 0), shade, ...p(b, 0.09, 1.2), shade, ...p(a, 0.09, 1.2), shade);
  }
  return new Float32Array(out);
}

export const TRUNK_VS = `#version 300 es
layout(location=0) in vec4 a_vertex;
layout(location=1) in vec4 a_tree;
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out float v_light, v_dist;
void main() {
  vec3 p = a_vertex.xyz * a_tree.z + vec3(a_tree.x, 0.0, a_tree.y);
  v_light = a_vertex.w;
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
export const TRUNK_FS = `#version 300 es
precision highp float;
in float v_light, v_dist;
uniform vec3 u_fog;
uniform float u_fogDensity, u_fogStart;
out vec4 o;
void main() {
  vec3 c = vec3(0.30, 0.23, 0.16) * v_light;
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

/* The crown: a sprite that always faces the camera, so it reads as a round,
   lumpy crown from above and from the side. The shader rebuilds a sphere's
   normal from the sprite's corner, lights it by the sun, and roughens the
   edge and the surface into clumps of leaves. */
export const CROWN_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_tree;
uniform mat4 u_viewProj;
uniform vec3 u_eye, u_right, u_up;
out vec2 v_uv;
out float v_seed, v_dist;
void main() {
  float r = a_tree.z;
  vec3 centre = vec3(a_tree.x, 1.55 * r, a_tree.y);
  vec3 p = centre + (a_corner.x * u_right + a_corner.y * u_up) * r * 1.15;
  v_uv = a_corner * 1.15;
  v_seed = a_tree.w;
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
export const CROWN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_seed, v_dist;
uniform vec3 u_ground, u_fog, u_right, u_up, u_toward, u_sun;
uniform float u_fogDensity, u_fogStart;
out vec4 o;
void main() {
  float len = length(v_uv), ang = atan(v_uv.y, v_uv.x);
  float edge = 1.0 - 0.10 * (0.5 + 0.5 * sin(5.0 * ang + v_seed * 40.0))
                   - 0.06 * (0.5 + 0.5 * sin(9.0 * ang + v_seed * 90.0));
  float aa = fwidth(len);
  float alpha = clamp((edge - len) / max(aa, 1e-4), 0.0, 1.0);
  if (alpha <= 0.0) discard;
  vec2 n2 = v_uv / edge;
  float w = sqrt(max(0.0, 1.0 - dot(n2, n2)));
  vec3 n = normalize(n2.x * u_right + n2.y * u_up + w * u_toward);
  float clumps = 0.5 + 0.5 * sin(v_uv.x * 7.0 + v_seed * 13.0) * sin(v_uv.y * 7.0 - v_seed * 7.0);
  float light = 0.45 + 0.7 * max(dot(n, u_sun), 0.0) - 0.16 * clumps * (1.0 - w * 0.4);
  vec3 leaf = u_ground * mix(vec3(0.46, 0.66, 0.38), vec3(0.58, 0.78, 0.42), v_seed);
  vec3 c = leaf * light;
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), alpha);
}`;

// A soft shadow on the ground under each crown, cast away from the sun.
export const SHADE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_tree;
uniform mat4 u_viewProj;
uniform vec3 u_sun;
out vec2 v_uv;
void main() {
  float r = a_tree.z * 1.15;
  vec2 shift = -u_sun.xz / max(u_sun.y, 0.3) * a_tree.z * 0.9;
  vec3 p = vec3(a_tree.x + shift.x + a_corner.x * r, 0.03, a_tree.y + shift.y + a_corner.y * r);
  v_uv = a_corner;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
export const SHADE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_shade;
out vec4 o;
void main() {
  float a = u_shade * (1.0 - smoothstep(0.55, 1.0, length(v_uv)));
  o = vec4(0.0, 0.0, 0.0, a);
}`;
