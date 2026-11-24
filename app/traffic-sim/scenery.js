/* The countryside round the road: a patchwork of fields with straight
   hedges, woods, and trees along some hedges.

   The fields are the cells of a jittered grid, as in a Voronoi diagram: each
   point of ground belongs to its nearest field centre, so every hedge is a
   straight line. The shader and the tree planting share one integer hash, so
   the planted trees land on the woods and hedges the shader draws. */

const CELL_X = 46, CELL_Z = 38;   // the average field, in metres
const WOOD_SCALE_X = 5, WOOD_SCALE_Z = 6; // fields per step of the wood pattern
const WOOD_LEVEL = 0.72;          // the wood pattern above this is woodland
const COPSE = 0.03;              // the share of other fields that are small copses

export const FIELDS_GLSL = `
const vec2 CELL = vec2(${CELL_X}.0, ${CELL_Z}.0);
uint ihash(ivec2 c, uint salt) {
  uint h = uint(c.x + 65536) * 1597334677u ^ uint(c.y + 65536) * 3812015801u ^ salt * 2654435761u;
  h ^= h >> 16; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return h;
}
float h01(ivec2 c, uint salt) { return float(ihash(c, salt) >> 8) / 16777216.0; }
vec2 siteOf(ivec2 c) { return (vec2(c) + 0.12 + 0.76 * vec2(h01(c, 1u), h01(c, 2u))) * CELL; }
float woodNoise(ivec2 c) {
  vec2 q = vec2(c) / vec2(${WOOD_SCALE_X}.0, ${WOOD_SCALE_Z}.0);
  ivec2 b = ivec2(floor(q));
  vec2 f = q - floor(q);
  f = f * f * (3.0 - 2.0 * f);
  float a = h01(b, 7u), e = h01(b + ivec2(1, 0), 7u);
  float g = h01(b + ivec2(0, 1), 7u), d = h01(b + ivec2(1, 1), 7u);
  return mix(mix(a, e, f.x), mix(g, d, f.x), f.y);
}
bool isWood(ivec2 c) { return woodNoise(c) > ${WOOD_LEVEL} || h01(c, 5u) < ${COPSE}; }

vec3 fields(vec2 p, vec3 green) {
  ivec2 base = ivec2(floor(p / CELL));
  ivec2 id = base;
  vec2 near = vec2(0.0);
  float best = 1e9;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 c = base + ivec2(i, j);
    vec2 s = siteOf(c);
    float d = dot(s - p, s - p);
    if (d < best) { best = d; id = c; near = s; }
  }
  // Distance to the nearest hedge, and whether the field across it is wood.
  float hedge = 1e9;
  bool wood = isWood(id), woodEdge = false;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    ivec2 c = id + ivec2(i, j);
    if (c == id) continue;
    vec2 s = siteOf(c);
    float d = dot(0.5 * (near + s) - p, normalize(s - near));
    if (d < hedge) { hedge = d; woodEdge = isWood(c); }
  }

  float footprint = length(fwidth(p));
  float kind = h01(id, 3u), tone = h01(id, 4u);
  vec3 field;
  float furrow = 0.0;
  if (wood) {
    // A canopy seen from above: crowns about 6 m across.
    vec2 q = p / 6.0;
    vec2 cq = floor(q);
    float crown = 1e9;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      ivec2 c = ivec2(cq) + ivec2(i, j);
      vec2 o = vec2(c) + vec2(h01(c, 11u), h01(c, 12u));
      crown = min(crown, length(q - o));
    }
    float mottle = mix(1.0 - 0.35 * smoothstep(0.25, 0.75, crown), 0.85, smoothstep(0.3, 1.5, footprint / 6.0));
    field = green * vec3(0.40, 0.56, 0.36) * mix(0.9, 1.1, tone) * mottle;
  } else if (kind < 0.42) {
    field = green * mix(vec3(0.82, 0.92, 0.80), vec3(1.05, 1.08, 0.90), tone);       // pasture
  } else if (kind < 0.56) {
    field = green * mix(vec3(1.18, 1.14, 0.92), vec3(1.30, 1.22, 1.00), tone);       // hay
  } else if (kind < 0.78) {
    field = green * mix(vec3(1.22, 1.10, 0.68), vec3(1.32, 1.18, 0.76), tone);       // wheat and barley
    furrow = 1.0;
  } else if (kind < 0.94) {
    field = green * mix(vec3(1.02, 0.84, 0.62), vec3(1.14, 0.94, 0.70), tone);       // ploughland
    furrow = 1.6;
  } else {
    field = green * vec3(1.34, 1.24, 0.48);                                          // oilseed rape
  }
  if (furrow > 0.0) {
    float a = h01(id, 6u) * 3.14159;
    float rows = sin(dot(p, vec2(cos(a), sin(a))) * 2.4);
    field *= 1.0 + 0.035 * furrow * rows * (1.0 - smoothstep(0.25, 1.2, footprint));
  }

  // Hedges: about 1.8 m wide, darker beside a wood. They fade far away.
  float aa = max(footprint, 0.05);
  float hedgeWidth = wood || woodEdge ? 0.5 : 0.9;
  float border = (1.0 - smoothstep(hedgeWidth - aa, hedgeWidth + aa, hedge))
    * (1.0 - smoothstep(6.0, 24.0, footprint));
  vec3 hedgeColour = green * vec3(0.38, 0.52, 0.34);
  return mix(field, hedgeColour, border * 0.9);
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
const siteX = (x, z) => (x + 0.12 + 0.76 * h01(x, z, 1)) * CELL_X;
const siteZ = (x, z) => (z + 0.12 + 0.76 * h01(x, z, 2)) * CELL_Z;
function woodNoise(x, z) {
  const qx = x / WOOD_SCALE_X, qz = z / WOOD_SCALE_Z;
  const bx = Math.floor(qx), bz = Math.floor(qz);
  let fx = qx - bx, fz = qz - bz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h01(bx, bz, 7), e = h01(bx + 1, bz, 7), g = h01(bx, bz + 1, 7), d = h01(bx + 1, bz + 1, 7);
  return (a + (e - a) * fx) + ((g + (d - g) * fx) - (a + (e - a) * fx)) * fz;
}
const isWood = (x, z) => woodNoise(x, z) > WOOD_LEVEL || h01(x, z, 5) < COPSE;

// The field that owns point (px, pz): its cell, and the squared distances
// to the nearest and second-nearest field centres.
function fieldAt(px, pz) {
  const bx = Math.floor(px / CELL_X), bz = Math.floor(pz / CELL_Z);
  let id = 0, best = Infinity, second = Infinity, cx = 0, cz = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const x = bx + i, z = bz + j;
    const dx = siteX(x, z) - px, dz = siteZ(x, z) - pz, d = dx * dx + dz * dz;
    if (d < best) { second = best; best = d; cx = x; cz = z; } else if (d < second) second = d;
  }
  return { x: cx, z: cz, best, second };
}

/* Plants the trees: woods filled at about one tree per 40 m², and trees
   along some hedges. Each hedge, the line between two fields, gets its own
   density: none, a few, or a full line. Trees stay off the road and its
   verges, and only those nearest the road are kept, up to a cap. */
const MAX_TREES = 14000;
export function trees(oval) {
  const sites = [];
  const reach = Math.max(260, oval.R * 0.55);
  const extra = oval.extraEnd ? 3.65 : 0;
  const outer = oval.half + 14, inner = oval.half + 26 + extra;
  const offRoad = (x, z) => {
    const d = Math.hypot(Math.max(Math.abs(x) - oval.S / 2, 0), z) - oval.R;
    return (d <= -inner || d >= outer) && Math.abs(d) < reach ? Math.abs(d) : -1;
  };
  const x0 = -oval.S / 2 - oval.R - reach, x1 = -x0;
  const z0 = -oval.R - reach, z1 = -z0;

  // Woods: a jittered grid of 6.5 m.
  const step = 6.5;
  for (let gz = Math.floor(z0 / step); gz <= z1 / step; gz++) {
    for (let gx = Math.floor(x0 / step); gx <= x1 / step; gx++) {
      const r1 = h01(gx, gz, 21), r2 = h01(gx, gz, 22), r3 = h01(gx, gz, 23);
      const x = (gx + 0.15 + 0.7 * r1) * step, z = (gz + 0.15 + 0.7 * r2) * step;
      const d = offRoad(x, z);
      if (d < 0) continue;
      const f = fieldAt(x, z);
      if (!isWood(f.x, f.z)) continue;
      // Keep trees off the hedge line itself, which the shader draws.
      if (Math.sqrt(f.second) - Math.sqrt(f.best) < 2.5) continue;
      sites.push([x, z, 2.6 + 1.8 * r3, r3, d]);
    }
  }

  // Hedgerow trees: walk the line between each pair of neighbouring fields.
  const cx0 = Math.floor(x0 / CELL_X) - 1, cx1 = Math.ceil(x1 / CELL_X) + 1;
  const cz0 = Math.floor(z0 / CELL_Z) - 1, cz1 = Math.ceil(z1 / CELL_Z) + 1;
  const pairs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let az = cz0; az <= cz1; az++) {
    for (let ax = cx0; ax <= cx1; ax++) {
      const sx = siteX(ax, az), sz = siteZ(ax, az);
      for (const [ox, oz] of pairs) {
        const bx = ax + ox, bz = az + oz;
        if (isWood(ax, az) && isWood(bx, bz)) continue;
        const pick = h01(ax * 4 + ox + 2, az * 4 + oz + 2, 31);
        const density = pick < 0.45 ? 0 : pick < 0.8 ? 0.3 : 0.75;
        if (density === 0) continue;
        const tx = siteX(bx, bz), tz = siteZ(bx, bz);
        const mx = (sx + tx) / 2, mz = (sz + tz) / 2;
        let ux = -(tz - sz), uz = tx - sx;
        const len = Math.hypot(ux, uz);
        ux /= len; uz /= len;
        for (let t = -40, k = 0; t <= 40; t += 7, k++) {
          if (h01(ax * 4 + ox + 2, az * 4 + oz + 2, 40 + k) > density) continue;
          const x = mx + ux * t, z = mz + uz * t;
          const f = fieldAt(x, z);
          const onLine = (f.x === ax && f.z === az) || (f.x === bx && f.z === bz);
          if (!onLine || Math.sqrt(f.second) - Math.sqrt(f.best) > 0.8) continue;
          const d = offRoad(x, z);
          if (d < 0) continue;
          const r = h01(ax * 4 + ox + 2, az * 4 + oz + 2, 60 + k);
          sites.push([x, z, 2.2 + 2.0 * r, r, d]);
        }
      }
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
