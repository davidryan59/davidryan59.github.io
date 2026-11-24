/* The 3D view of a ring road, drawn with hand-written WebGL 2 in a low-poly
   "toy town" style. Each frame draws the ground, the road with its
   markings, a soft shadow under each car, the V2V links of platoons, and
   then every car in one instanced draw call. The view knows the road's
   shape and where each car is. It runs no traffic. */

import { FIELDS_GLSL, CROWN_VS, CROWN_FS, TRUNK_VS, TRUNK_FS, SHADE_VS, SHADE_FS, QUAD, trees, trunkMesh } from './scenery.js';

const SUN = (() => { const s = [-0.45, 0.8, -0.4], l = Math.hypot(...s); return s.map(x => x / l); })();

export const LANE_WIDTH = 3.65;
const FOV = 40 * Math.PI / 180;

/* ---------------------------------------------------------------- road */

/* Clockwise oval, starting at the left end of the top straight.
   The engine uses one distance coordinate across all lanes. */
export function makeOval(length, lanes, extraEnd = 0, extraGain = 0, extraDrop = 0) {
  const R = length / (2 * Math.PI + 4), S = 2 * R, curve = Math.PI * R;
  const half = lanes * LANE_WIDTH / 2;
  const outside = half + 12, inside = half + 22 + (extraEnd ? LANE_WIDTH : 0);
  function point(along, d) {
    const u = along - Math.floor(along / length) * length;
    const r = R + d;
    if (u < S) return [-S / 2 + u, -r, 0];
    if (u < S + curve) {
      const a = (u - S) / R - Math.PI / 2;
      return [S / 2 + r * Math.cos(a), r * Math.sin(a), a + Math.PI / 2];
    }
    if (u < 2 * S + curve) return [S / 2 - (u - S - curve), r, Math.PI];
    const a = (u - 2 * S - curve) / R + Math.PI / 2;
    return [-S / 2 + r * Math.cos(a), r * Math.sin(a), a + Math.PI / 2];
  }
  function extension(along) {
    if (!extraEnd) return 0;
    return Math.max(0, Math.min(1, along / extraGain, (extraEnd - along) / extraDrop)) * LANE_WIDTH;
  }
  return {
    length, lanes, R, S, half, extraEnd, extraGain, extraDrop,
    width: S + 2 * (R + outside),
    height: 2 * (R + outside),
    laneOffset(lane, along) {
      return lane < lanes ? half - (lane + 0.5) * LANE_WIDTH
        : LANE_WIDTH / 2 - half - extension(along);
    },
    at: (t, d) => point(t * length, d),
    mesh() {
      const out = [];
      const breaks = [0, S, S + curve, 2 * S + curve, length];
      const steps = [12, 128, 12, 128];
      const samples = [];
      for (let k = 0; k < steps.length; k++) {
        for (let q = 0; q < steps[k]; q++) {
          samples.push(breaks[k] + (breaks[k + 1] - breaks[k]) * q / steps[k]);
        }
      }
      if (extraEnd) samples.push(extraGain, extraEnd - extraDrop, extraEnd);
      samples.push(length);
      samples.sort((a, b) => a - b);

      const vertex = (u, d, h, material) => {
        const [x, z] = point(u, d);
        out.push(x, z, d, u, h, material);
      };
      for (let k = 1; k < samples.length; k++) {
        const a = samples[k - 1], b = samples[k];
        const strip = (d0, h0, d1, h1, material, median = false) => {
          const da = median ? -half - extension(a) : 0;
          const db = median ? -half - extension(b) : 0;
          vertex(a, d0 + da, h0, material); vertex(a, d1 + da, h1, material); vertex(b, d0 + db, h0, material);
          vertex(b, d0 + db, h0, material); vertex(a, d1 + da, h1, material); vertex(b, d1 + db, h1, material);
        };
        strip(-inside, 0, outside, 0, 0);
        // Steel rail, then a concrete barrier with sloped faces.
        strip(-0.59, 0, -0.61, 0.52, 5, true);
        strip(-0.50, 0.48, -0.50, 0.77, 1, true);
        strip(-0.50, 0.77, -0.66, 0.77, 2, true);
        strip(-0.66, 0.77, -0.66, 0.48, 1, true);
        strip(-0.7, 0, -1.00, 0.93, 3, true);
        strip(-1.00, 0.93, -1.60, 0.93, 4, true);
        strip(-1.60, 0.93, -1.90, 0, 3, true);
      }
      return new Float32Array(out);
    }
  };
}

/* ----------------------------------------------------------------- car */

// Roles pick a colour in the shader: paint, glass, tyre, brake light, headlight.
const PAINT = 0, GLASS = 1, TYRE = 2, BRAKE = 3, LAMP = 4;

// A 4.4 m by 1.92 m template, scaled per car.
function carMesh() {
  const out = [];
  function box(x0, x1, y0, y1, z0, z1, role) {
    const faces = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]]
    ];
    for (const [n, q] of faces) {
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(...q[k], ...n, role);
    }
  }
  box(-2.15, 2.15, 0.32, 0.92, -0.9, 0.9, PAINT);
  box(-1.3, 0.7, 0.92, 1.38, -0.8, 0.8, GLASS);
  box(-1.25, 0.6, 1.38, 1.47, -0.78, 0.78, PAINT);
  for (const x of [-1.62, 1.04]) {
    for (const z of [-0.96, 0.8]) box(x, x + 0.58, 0, 0.6, z, z + 0.16, TYRE);
  }
  for (const z of [-0.85, 0.5]) {
    box(-2.2, -2.13, 0.62, 0.84, z, z + 0.35, BRAKE);
    box(2.13, 2.2, 0.56, 0.74, z, z + 0.35, LAMP);
  }
  return new Float32Array(out);
}

/* ------------------------------------------------------------- shaders */

// Measure ground fog per pixel across the whole scene.
const GROUND_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
uniform mat4 u_viewProj;
out vec3 v_p;
void main() {
  v_p = vec3(a_pos.x, 0.0, a_pos.y);
  gl_Position = u_viewProj * vec4(v_p, 1.0);
}`;
const GROUND_FS = `#version 300 es
precision highp float;
in vec3 v_p;
uniform vec3 u_ground, u_fog, u_eye;
uniform float u_fogDensity, u_fogStart;
out vec4 o;
${FIELDS_GLSL}
void main() {
  float d = distance(v_p, u_eye);
  o = vec4(mix(fields(v_p.xz, u_ground), u_fog, 1.0 - exp(-max(d - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

// The road carries its markings: solid edge lines, and a dashed line
// between lanes, antialiased with fwidth.
const ROAD_VS = `#version 300 es
layout(location=0) in vec4 a_road;
layout(location=1) in vec2 a_section;
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out float v_lat, v_along, v_dist;
flat out int v_material;
void main() {
  vec3 p = vec3(a_road.x, a_section.x, a_road.y);
  v_material = int(a_section.y);
  v_lat = a_road.z;
  v_along = a_road.w;
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
const ROAD_FS = `#version 300 es
precision highp float;
in float v_lat, v_along, v_dist;
flat in int v_material;
uniform vec3 u_road, u_kerb, u_line, u_fog, u_ground;
uniform float u_half, u_lanes, u_extraEnd, u_extraGain, u_extraDrop, u_radius, u_fogDensity, u_fogStart;
out vec4 o;
float stripe(float x, float w) {
  float aa = max(fwidth(x) * 0.5, 0.001);
  return clamp((w + aa - abs(x)) / (2.0 * aa), 0.0, 1.0)
    - clamp((-w + aa - abs(x)) / (2.0 * aa), 0.0, 1.0);
}
float dashes(float lateral, float width, float phase) {
  float aa = max(fwidth(phase) * 0.5, 0.001);
  float distance = abs(mod(phase + 3.5, 9.0) - 4.5);
  float mark = 1.0 - smoothstep(max(0.0, 1.0 - aa), 1.0 + aa, distance);
  return stripe(lateral, width) * mix(mark, 2.0 / 9.0, smoothstep(1.0, 7.0, aa));
}
float laneDistance(float offset) {
  float straight = 2.0 * u_radius, bend = 3.14159265 * u_radius;
  float onBends = clamp(v_along - straight, 0.0, bend)
    + clamp(v_along - 2.0 * straight - bend, 0.0, bend);
  return v_along + offset * onBends / u_radius;
}
void main() {
  vec3 c;
  if (v_material == 1) c = u_kerb * (0.77 + 0.14 * step(0.18, mod(v_along, 2.0)));
  else if (v_material == 2) c = u_kerb * 1.17;
  else if (v_material == 3) c = u_kerb * 0.88;
  else if (v_material == 4) c = u_kerb;
  else if (v_material == 5) {
    if (mod(v_along, 2.0) > 0.15) discard;
    c = u_kerb * 0.63;
  } else {
    float extension = u_extraEnd > 0.0
      ? clamp(min(v_along / u_extraGain, (u_extraEnd - v_along) / u_extraDrop), 0.0, 1.0) * ${LANE_WIDTH}
      : 0.0;
    float near = u_half, median = -u_half - extension;
    float far = median - 2.6;
    float farEdge = far - u_lanes * ${LANE_WIDTH};
    float outside = max(v_lat - near, farEdge - v_lat);
    if (outside > 10.0) discard;
    vec3 verge = u_ground * vec3(0.83, 1.04, 0.74);
    float mowing = 0.95 + 0.06 * cos(v_along * 0.39);
    c = outside > 8.7 ? u_ground * vec3(0.46, 0.65, 0.42) : verge * mowing;
    if (outside <= 3.3) {
      bool shoulder = outside > 0.0 || (v_lat < median && v_lat > far);
      c = shoulder ? u_road * 1.15 : u_road;
      float line = max(max(stripe(v_lat - near, 0.105), stripe(v_lat - median, 0.105)),
        max(stripe(v_lat - farEdge, 0.105), stripe(v_lat - far, 0.105)));
      for (int k = 1; k <= 2; k++) {
        float mark = near - float(k) * ${LANE_WIDTH};
        if (float(k) < u_lanes || (float(k) == u_lanes && extension > 3.6)) {
          line = max(line, dashes(v_lat - mark, 0.08, laneDistance(mark)));
        }
        if (float(k) < u_lanes) {
          float farMark = far - float(k) * ${LANE_WIDTH};
          line = max(line, dashes(v_lat - farMark, 0.08, laneDistance(farMark)));
        }
      }
      float ribs = max(stripe(v_lat - near - 0.23, 0.13), stripe(v_lat - farEdge + 0.23, 0.13));
      float rumble = step(0.62, fract(v_along / 1.1)) * (1.0 - smoothstep(0.2, 1.0, fwidth(v_along)));
      c = mix(c, u_line, max(line, ribs * rumble * 0.68));
    }
  }
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

// A soft shadow under each car, and a halo under the chosen car.
const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_inst;
layout(location=2) in vec4 a_col;
layout(location=3) in vec2 a_size;
uniform mat4 u_viewProj;
uniform float u_halo;
out vec2 v_local;
flat out float v_flag;
void main() {
  float grow = a_col.w > 0.5 ? u_halo : 1.0;
  vec2 size = a_size * vec2(0.68, 0.81) * grow;
  vec2 l = a_corner * size;
  float c = cos(a_inst.z), s = sin(a_inst.z);
  vec3 p = vec3(a_inst.x + c * l.x - s * l.y, 0.025, a_inst.y + s * l.x + c * l.y);
  v_local = a_corner;
  v_flag = a_col.w;
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision highp float;
in vec2 v_local;
flat in float v_flag;
uniform float u_shadow;
uniform vec3 u_accent;
out vec4 o;
void main() {
  vec2 q = abs(v_local) - vec2(0.62, 0.4);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  if (v_flag > 0.5) {
    float ring = 1.0 - smoothstep(0.0, 0.12, abs(d - 0.16));
    o = vec4(u_accent * ring, ring);
  } else {
    float a = u_shadow * (1.0 - smoothstep(-0.25, 0.32, d));
    o = vec4(0.0, 0.0, 0.0, a);
  }
}`;

const LINK_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_viewProj;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); }`;
const LINK_FS = `#version 300 es
precision highp float;
uniform vec4 u_col;
out vec4 o;
void main() { o = vec4(u_col.rgb * u_col.a, u_col.a); }`;

const CAR_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_role;
layout(location=3) in vec4 a_inst;
layout(location=4) in vec4 a_col;
layout(location=5) in vec2 a_size;
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out vec3 v_normal, v_col;
out float v_brake, v_dist;
flat out int v_role;
void main() {
  float c = cos(a_inst.z), s = sin(a_inst.z);
  vec2 local = a_pos.xz * a_size / vec2(4.4, 1.92);
  vec3 p = vec3(a_inst.x + c * local.x - s * local.y, a_pos.y, a_inst.y + s * local.x + c * local.y);
  v_normal = vec3(c * a_normal.x - s * a_normal.z, a_normal.y, s * a_normal.x + c * a_normal.z);
  v_col = a_col.rgb;
  v_brake = a_inst.w;
  v_role = int(a_role + 0.5);
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
const CAR_FS = `#version 300 es
precision highp float;
in vec3 v_normal, v_col;
in float v_brake, v_dist;
flat in int v_role;
uniform vec3 u_light, u_glass, u_tyre, u_fog;
uniform float u_fogDensity, u_fogStart;
out vec4 o;
void main() {
  vec3 base = v_role == 0 ? v_col : v_role == 1 ? u_glass : v_role == 2 ? u_tyre
    : v_role == 3 ? vec3(0.42, 0.05, 0.05) : vec3(0.95, 0.92, 0.78);
  float lit = 0.58 + 0.42 * max(dot(normalize(v_normal), u_light), 0.0);
  vec3 c = base * lit;
  if (v_role == 3) c = mix(c, vec3(1.0, 0.16, 0.12) * 1.6, v_brake);
  if (v_role == 4) c = base;
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

/* -------------------------------------------------------------- maths */

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return { m: [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1], x, y, z };
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

/* ---------------------------------------------------------------- view */

export class View {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.gl = gl;
    this.canvas = canvas;
    this.W = 1;
    this.H = 1;
    this.dpr = 1;
    // The camera: a point on the ground, a distance, a turn (yaw) and a tilt
    // (pitch, 90° straight down). follow, when set, is [x, z, heading].
    this.cam = { x: 0, z: 0, dist: 400, yaw: 0, pitch: Math.PI / 2, follow: null };

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const program = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const U = new Proxy({}, { get: (cache, name) => cache[name] ?? (cache[name] = gl.getUniformLocation(p, name)) });
      return { p, U };
    };
    this.ground = program(GROUND_VS, GROUND_FS);
    this.road = program(ROAD_VS, ROAD_FS);
    this.shadow = program(SHADOW_VS, SHADOW_FS);
    this.link = program(LINK_VS, LINK_FS);
    this.car = program(CAR_VS, CAR_FS);
    this.crown = program(CROWN_VS, CROWN_FS);
    this.trunk = program(TRUNK_VS, TRUNK_FS);
    this.shade = program(SHADE_VS, SHADE_FS);

    // Ground: one big square.
    this.groundVao = gl.createVertexArray();
    gl.bindVertexArray(this.groundVao);
    this.groundBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Road.
    this.roadVao = gl.createVertexArray();
    gl.bindVertexArray(this.roadVao);
    this.roadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.roadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);

    // Trees: one buffer of x, z, size and seed, drawn three ways. A sprite
    // quad gives each crown and its shadow; a small mesh gives the trunk.
    this.treeBuf = gl.createBuffer();
    const treeVao = (data, size) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, size, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.treeBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);
      return vao;
    };
    this.quadVao = treeVao(QUAD, 2);
    const trunk = trunkMesh();
    this.trunkVerts = trunk.length / 4;
    this.trunkVao = treeVao(trunk, 4);

    // Per-car data shared by the shadow and car passes: x, z, heading,
    // brake, then r, g, b, flag, length, width.
    this.instBuf = gl.createBuffer();
    const instanced = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      for (const [loc, size, off] of [[this.instLoc, 4, 0], [this.instLoc + 1, 4, 16], [this.instLoc + 2, 2, 32]]) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 40, off);
        gl.vertexAttribDivisor(loc, 1);
      }
    };

    this.shadowVao = gl.createVertexArray();
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instLoc = 1;
    instanced();

    const mesh = carMesh();
    this.carVerts = mesh.length / 7;
    this.carVao = gl.createVertexArray();
    gl.bindVertexArray(this.carVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    this.instLoc = 3;
    instanced();

    this.linkVao = gl.createVertexArray();
    gl.bindVertexArray(this.linkVao);
    this.linkBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  setRoad(oval) {
    const gl = this.gl;
    this.oval = oval;
    const mesh = oval.mesh();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.roadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    this.roadCount = mesh.length / 6;
    const planting = trees(oval);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.treeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, planting, gl.STATIC_DRAW);
    this.treeCount = planting.length / 4;
    const g = 8 * Math.max(oval.width, oval.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-g, -g, g, -g, -g, g, -g, g, g, -g, g, g]), gl.STATIC_DRAW);
  }

  // Sizes the canvas to its box, in device pixels up to twice CSS pixels.
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  /* The camera that shows the whole road from straight above, centred in
     the free part of the screen, with the road's long side along that
     part's long side. free: { left, top, right, bottom } in CSS pixels. */
  fit(free = { left: 0, top: 0, right: this.W, bottom: this.H }) {
    const o = this.oval, fw = Math.max(1, free.right - free.left), fh = Math.max(1, free.bottom - free.top);
    const wide = fw >= fh, yaw = wide ? 0 : Math.PI / 2;
    const across = wide ? o.width : o.height, up = wide ? o.height : o.width;
    const t = Math.tan(FOV / 2);
    // Metres per pixel the road needs, then the distance that gives it.
    const k = 1.08 * Math.max(across / fw, up / fh), dist = k * this.H / (2 * t);
    // Move the camera so the road's centre sits at the free part's centre.
    const dx = (free.left + free.right) / 2 - this.W / 2, dy = (free.top + free.bottom) / 2 - this.H / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { yaw, dist, x: (-c * dx + s * dy) * k, z: (-s * dx - c * dy) * k };
  }

  // The eye, the matrices and the camera's axes for this frame.
  camera() {
    const c = this.cam;
    let eye, target;
    if (c.follow) {
      const [x, z, h] = c.follow, fx = Math.cos(h), fz = Math.sin(h);
      eye = [x - fx * c.dist * 0.9, c.dist * 0.38, z - fz * c.dist * 0.9];
      target = [x + fx * c.dist * 1.6, 1.0, z + fz * c.dist * 1.6];
    } else {
      const f = [Math.sin(c.yaw), 0, -Math.cos(c.yaw)];
      const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      target = [c.x, 0, c.z];
      eye = [c.x - f[0] * c.dist * cp, c.dist * sp, c.z - f[2] * c.dist * cp];
    }
    // Looking straight down, world up is no help; the turn gives screen up.
    const up = !c.follow && c.pitch > 1.55 ? [Math.sin(c.yaw), 0, -Math.cos(c.yaw)] : [0, 1, 0];
    const look = lookAt(eye, target, up);
    const range = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
    const proj = perspective(FOV, this.W / this.H, Math.max(0.5, range * 0.02), range * 40);
    return { eye, look, range, viewProj: mul(proj, look.m) };
  }

  // The point on the ground plane at height y under a screen point, in CSS
  // pixels, or null if the ray misses it.
  groundAt(px, py, y = 0, cam = this.camera()) {
    const t = Math.tan(FOV / 2), aspect = this.W / this.H;
    const nx = (2 * px / this.W - 1) * t * aspect, ny = (1 - 2 * py / this.H) * t;
    const { x, y: u, z } = cam.look;
    const dir = [nx * x[0] + ny * u[0] - z[0], nx * x[1] + ny * u[1] - z[1], nx * x[2] + ny * u[2] - z[2]];
    if (dir[1] > -1e-6) return null;
    const k = (y - cam.eye[1]) / dir[1];
    return [cam.eye[0] + k * dir[0], cam.eye[2] + k * dir[2]];
  }

  /* Draws a frame. cars: Float32Array of 10 numbers per car (x, z,
     heading, brake, r, g, b, flag, length, width). links: Float32Array of line ends,
     3 numbers each. theme: the colours. */
  draw(cars, count, links, linkCount, theme) {
    const gl = this.gl, cam = this.camera();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...theme.fog, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Fog starts beyond the point the camera looks at, so it softens only
    // the far ground of a tilted view.
    const far = this.cam.follow ? 4 : 1.1;
    const fogStart = cam.range * far, fogDensity = theme.fogDensity / (cam.range * far);
    const common = prog => {
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.U.u_viewProj, false, cam.viewProj);
      gl.uniform3fv(prog.U.u_eye, cam.eye);
      gl.uniform3fv(prog.U.u_fog, theme.fog);
      gl.uniform1f(prog.U.u_fogDensity, fogDensity);
      gl.uniform1f(prog.U.u_fogStart, fogStart);
    };

    // The ground is the backdrop. Road, barriers and trees use depth.
    gl.disable(gl.DEPTH_TEST);
    common(this.ground);
    gl.uniform3fv(this.ground.U.u_ground, theme.ground);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.DEPTH_TEST);
    common(this.road);
    const R = this.road.U;
    gl.uniform3fv(R.u_road, theme.road);
    gl.uniform3fv(R.u_kerb, theme.kerb);
    gl.uniform3fv(R.u_line, theme.line);
    gl.uniform3fv(R.u_ground, theme.ground);
    gl.uniform1f(R.u_radius, this.oval.R);
    gl.uniform1f(R.u_half, this.oval.half);
    gl.uniform1f(R.u_lanes, this.oval.lanes);
    gl.uniform1f(R.u_extraEnd, this.oval.extraEnd);
    gl.uniform1f(R.u_extraGain, this.oval.extraGain);
    gl.uniform1f(R.u_extraDrop, this.oval.extraDrop);
    gl.bindVertexArray(this.roadVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.roadCount);

    // Tree shadows on the ground, then trunks, then crowns.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    common(this.shade);
    gl.uniform3fv(this.shade.U.u_sun, SUN);
    gl.uniform1f(this.shade.U.u_shade, 0.3);
    gl.bindVertexArray(this.quadVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.treeCount);
    gl.disable(gl.BLEND);
    gl.depthMask(true);

    common(this.trunk);
    gl.bindVertexArray(this.trunkVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.trunkVerts, this.treeCount);

    common(this.crown);
    const C = this.crown.U;
    gl.uniform3fv(C.u_ground, theme.ground);
    gl.uniform3fv(C.u_right, cam.look.x);
    gl.uniform3fv(C.u_up, cam.look.y);
    gl.uniform3fv(C.u_toward, cam.look.z);
    gl.uniform3fv(C.u_sun, SUN);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.bindVertexArray(this.quadVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.treeCount);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cars.subarray(0, count * 10), gl.DYNAMIC_DRAW);

    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    common(this.shadow);
    gl.uniform1f(this.shadow.U.u_shadow, theme.shadow);
    gl.uniform1f(this.shadow.U.u_halo, 1.7);
    gl.uniform3fv(this.shadow.U.u_accent, theme.accent);
    gl.bindVertexArray(this.shadowVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

    gl.depthMask(true);
    if (linkCount) {
      common(this.link);
      gl.uniform4f(this.link.U.u_col, ...theme.link, 0.75);
      gl.bindVertexArray(this.linkVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuf);
      gl.bufferData(gl.ARRAY_BUFFER, links.subarray(0, linkCount * 6), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, linkCount * 2);
    }
    gl.disable(gl.BLEND);

    common(this.car);
    gl.uniform3fv(this.car.U.u_light, norm([-0.35, 0.85, 0.4]));
    gl.uniform3fv(this.car.U.u_glass, theme.glass);
    gl.uniform3fv(this.car.U.u_tyre, theme.tyre);
    gl.bindVertexArray(this.carVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.carVerts, count);
    gl.bindVertexArray(null);
    return cam;
  }
}
