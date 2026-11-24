/* The field grid uses two shears. Their inverse puts trees at hedge
   junctions without generating patches or trees during a frame. */
export const FIELDS_GLSL = `
float fieldHash(vec2 p) {
  vec3 h = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
vec3 fields(vec2 p, vec3 green) {
  p.x += 11.0 * sin(p.y * 0.048) + 6.0 * sin(p.y * 0.091);
  p.y += 10.0 * sin(p.x * 0.039) + 5.0 * sin(p.x * 0.083);
  vec2 cell = floor(p / vec2(51.0, 42.0));
  vec2 local = fract(p / vec2(51.0, 42.0));
  vec2 edge = min(local, 1.0 - local) * vec2(51.0, 42.0);
  float hedge = min(edge.x, edge.y);
  float split = fieldHash(cell + 21.2);
  float side = 0.0;
  if (split < 0.23) {
    vec2 q = split < 0.115 ? local.xy : local.yx;
    float cut = q.x - mix(0.3, 0.7, fieldHash(cell + 13.2)) - (q.y - 0.5) * 0.33;
    hedge = min(hedge, abs(cut) * 42.0);
    side = step(0.0, cut) * 17.0;
  }
  float farm = fieldHash(cell + side);
  vec3 pasture = green * mix(vec3(0.73, 0.86, 0.74), vec3(1.20, 1.13, 0.94), farm);
  vec3 crop = green * vec3(1.27, 1.08, 0.68);
  float furrows = sin((p.x + p.y * (farm - 0.5)) * 1.8);
  float footprint = length(fwidth(p));
  vec3 field = mix(pasture, crop, smoothstep(0.51, 0.88, farm));
  field *= 1.0 + 0.02 * furrows * (1.0 - smoothstep(0.4, 2.0, footprint));
  float border = (1.0 - smoothstep(0.55, 1.65 + footprint * 0.4, hedge))
    * (1.0 - smoothstep(4.0, 22.0, footprint));
  return mix(field, green * vec3(0.42, 0.57, 0.49), border * 0.88);
}`;

export function trees(oval) {
  const sites = [];
  const reach = Math.max(260, oval.R * 0.55);
  const nx = Math.ceil((oval.width / 2 + reach) / 51);
  const nz = Math.ceil((oval.height / 2 + reach) / 42);
  const outer = oval.half + 13;
  const inner = oval.half + 26;
  for (let i = -nx; i <= nx; i++) {
    for (let j = -nz; j <= nz; j++) {
      const xGrid = i * 51;
      const z = j * 42 - 10 * Math.sin(xGrid * 0.039) - 5 * Math.sin(xGrid * 0.083);
      const x = xGrid - 11 * Math.sin(z * 0.048) - 6 * Math.sin(z * 0.091);
      const d = Math.hypot(Math.max(Math.abs(x) - oval.S / 2, 0), z) - oval.R;
      if ((d > -inner && d < outer) || Math.abs(d) > reach) continue;
      const hash = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
      const random = hash - Math.floor(hash);
      if (random < 0.55) sites.push([x, z, 1.9 + random * 4.3, random]);
    }
  }
  sites.sort((a, b) => a[3] - b[3]);
  return new Float32Array(sites.slice(0, 420).flat());
}

export function treeMesh() {
  const out = [], n = 7;
  for (let i = 0; i < n; i++) {
    const at = (k, radius, height) => {
      const a = k / n * Math.PI * 2;
      return [radius * Math.cos(a), height, radius * Math.sin(a)];
    };
    const left = at(i, 0.9, 1.16), right = at(i + 1, 0.9, 1.16);
    const shade = 0.82 + 0.17 * Math.sin(i * 2 * Math.PI / n + 0.8);
    const tri = (a, b, c, light) => out.push(...a, light, ...b, light, ...c, light);
    tri(left, right, [0, 2.31, 0], shade);
    tri(right, left, [0, 0.46, 0], shade * 0.72);
    tri(at(i, 0.12, 0), at(i + 1, 0.12, 0), [0, 1.1, 0], -0.8);
  }
  return new Float32Array(out);
}

export const TREE_VS = `#version 300 es
layout(location=0) in vec4 a_vertex;
layout(location=1) in vec4 a_tree;
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out float v_light, v_dist;
void main() {
  vec3 p = a_vertex.xyz * a_tree.z + vec3(a_tree.x, 0.0, a_tree.y);
  v_light = a_vertex.w * (0.88 + 0.25 * a_tree.w);
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
export const TREE_FS = `#version 300 es
precision highp float;
in float v_light, v_dist;
uniform vec3 u_ground, u_fog;
uniform float u_fogDensity, u_fogStart;
out vec4 o;
void main() {
  vec3 c = v_light > 0.0 ? u_ground * vec3(0.55, 0.82, 0.48) * v_light
    : vec3(0.27, 0.21, 0.14);
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;
