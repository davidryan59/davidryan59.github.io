/* The 3D view of a ring road, drawn with hand-written WebGL 2 in a low-poly
   "toy town" style. Each frame draws the ground, the road with its
   markings, a soft shadow under each car, the V2V links of platoons, and
   then every car in one instanced draw call. The view knows the road's
   shape and where each car is. It runs no traffic. */

const LANE_WIDTH = 3.5;
const FOV = 40 * Math.PI / 180;

/* ---------------------------------------------------------------- road */

/* An oval with two straights and two semicircles, the straights twice the
   radius. The cars go anticlockwise as seen from above, along the bottom
   straight first. Offset d runs outwards from the centre line. Every lane
   holds the same length of ring, so each lane's drawn line is stretched to
   fit: a car at fraction t of the ring sits at fraction t of its lane. */
export function makeOval(length, lanes) {
  const R = length / (2 * Math.PI + 4), S = 2 * R;
  const half = lanes * LANE_WIDTH / 2;
  // A point on one of the four pieces: f runs from 0 to 1 along the piece.
  function piece(k, f, d) {
    const r = R + d;
    if (k === 0) return [-S / 2 + f * S, r, 0];
    if (k === 2) return [S / 2 - f * S, -r, Math.PI];
    const th = k === 1 ? Math.PI / 2 - f * Math.PI : -Math.PI / 2 - f * Math.PI;
    return [(k === 1 ? S / 2 : -S / 2) + r * Math.cos(th), r * Math.sin(th), th - Math.PI / 2];
  }
  return {
    length, lanes, R, S, half,
    width: S + 2 * (R + half + 1),
    height: 2 * (R + half + 1),
    laneOffset: lane => (lane - (lanes - 1) / 2) * LANE_WIDTH,
    // [x, z, heading] at fraction t of the lane at offset d.
    at(t, d) {
      const r = R + d, curve = Math.PI * r, P = 2 * S + 2 * curve;
      let u = (t - Math.floor(t)) * P;
      if (u < S) return piece(0, u / S, d);
      u -= S;
      if (u < curve) return piece(1, u / curve, d);
      u -= curve;
      if (u < S) return piece(2, u / S, d);
      return piece(3, Math.min((u - S) / curve, 1), d);
    },
    // The road as triangles: x, z, offset, distance along the centre line.
    mesh() {
      const out = [], edge = half + 1.2;
      const steps = [8, 96, 8, 96];
      let along = 0;
      for (let k = 0; k < 4; k++) {
        const pieceLength = k % 2 ? Math.PI * R : S;
        for (let q = 0; q < steps[k]; q++) {
          const f0 = q / steps[k], f1 = (q + 1) / steps[k];
          const a0 = along + f0 * pieceLength, a1 = along + f1 * pieceLength;
          const p = [piece(k, f0, -edge), piece(k, f0, edge), piece(k, f1, -edge), piece(k, f1, edge)];
          const v = (pt, d, a) => out.push(pt[0], pt[1], d, a);
          v(p[0], -edge, a0); v(p[1], edge, a0); v(p[2], -edge, a1);
          v(p[2], -edge, a1); v(p[1], edge, a0); v(p[3], edge, a1);
        }
        along += pieceLength;
      }
      return new Float32Array(out);
    }
  };
}

/* ----------------------------------------------------------------- car */

// Roles pick a colour in the shader: paint, glass, tyre, brake light, headlight.
const PAINT = 0, GLASS = 1, TYRE = 2, BRAKE = 3, LAMP = 4;

// A car 4.3 m long along local x, centred on the origin: x forward, y up.
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

// The ground is one square kilometres across, so its distance for the fog
// is measured per pixel, not between corners.
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
void main() {
  float d = distance(v_p, u_eye);
  o = vec4(mix(u_ground, u_fog, 1.0 - exp(-max(d - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

// The road carries its markings: solid edge lines, and a dashed line
// between lanes, antialiased with fwidth.
const ROAD_VS = `#version 300 es
layout(location=0) in vec4 a_road;
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out float v_lat, v_along, v_dist;
void main() {
  vec3 p = vec3(a_road.x, 0.0, a_road.y);
  v_lat = a_road.z;
  v_along = a_road.w;
  v_dist = distance(p, u_eye);
  gl_Position = u_viewProj * vec4(p, 1.0);
}`;
const ROAD_FS = `#version 300 es
precision highp float;
in float v_lat, v_along, v_dist;
uniform vec3 u_road, u_kerb, u_line, u_fog;
uniform float u_half, u_lanes, u_fogDensity, u_fogStart;
out vec4 o;
float stripe(float x, float w) {
  float aa = fwidth(x) * 0.75;
  return 1.0 - smoothstep(w - aa, w + aa, abs(x));
}
void main() {
  float a = abs(v_lat);
  vec3 c = mix(u_road, u_kerb, smoothstep(u_half + 0.05, u_half + 0.25, a));
  float line = stripe(a - (u_half - 0.3), 0.08);
  if (u_lanes > 1.5) {
    float dash = step(fract(v_along / 9.0), 0.36);
    for (float k = 1.0; k < 4.0; k += 1.0) {
      if (k < u_lanes) line = max(line, dash * stripe(v_lat + u_half - k * ${LANE_WIDTH.toFixed(1)}, 0.07));
    }
  }
  c = mix(c, u_line, line);
  o = vec4(mix(c, u_fog, 1.0 - exp(-max(v_dist - u_fogStart, 0.0) * u_fogDensity)), 1.0);
}`;

// A soft shadow under each car, and a halo under the chosen car.
const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_inst;
layout(location=2) in vec4 a_col;
uniform mat4 u_viewProj;
uniform float u_halo;
out vec2 v_local;
flat out float v_flag;
void main() {
  float grow = a_col.w > 0.5 ? u_halo : 1.0;
  vec2 size = vec2(3.0, 1.55) * grow;
  vec2 l = a_corner * size;
  float c = cos(a_inst.z), s = sin(a_inst.z);
  vec3 p = vec3(a_inst.x + c * l.x - s * l.y, 0.0, a_inst.y + s * l.x + c * l.y);
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
uniform mat4 u_viewProj;
uniform vec3 u_eye;
out vec3 v_normal, v_col;
out float v_brake, v_dist;
flat out int v_role;
void main() {
  float c = cos(a_inst.z), s = sin(a_inst.z);
  vec3 p = vec3(a_inst.x + c * a_pos.x - s * a_pos.z, a_pos.y, a_inst.y + s * a_pos.x + c * a_pos.z);
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
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    this.roadCount = 0;

    // Per-car data shared by the shadow and car passes: x, z, heading,
    // brake, then r, g, b, flag.
    this.instBuf = gl.createBuffer();
    const instanced = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      for (const [loc, off] of [[this.instLoc, 0], [this.instLoc + 1, 16]]) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off);
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
    this.roadCount = mesh.length / 4;
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

  /* Draws a frame. cars: Float32Array of 8 numbers per car (x, z,
     heading, brake, r, g, b, flag). links: Float32Array of line ends,
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

    // The flat layers draw in order with no depth test, so they never fight.
    gl.disable(gl.DEPTH_TEST);
    common(this.ground);
    gl.uniform3fv(this.ground.U.u_ground, theme.ground);
    gl.bindVertexArray(this.groundVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    common(this.road);
    const R = this.road.U;
    gl.uniform3fv(R.u_road, theme.road);
    gl.uniform3fv(R.u_kerb, theme.kerb);
    gl.uniform3fv(R.u_line, theme.line);
    gl.uniform1f(R.u_half, this.oval.half);
    gl.uniform1f(R.u_lanes, this.oval.lanes);
    gl.bindVertexArray(this.roadVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.roadCount);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cars.subarray(0, count * 8), gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    common(this.shadow);
    gl.uniform1f(this.shadow.U.u_shadow, theme.shadow);
    gl.uniform1f(this.shadow.U.u_halo, 1.7);
    gl.uniform3fv(this.shadow.U.u_accent, theme.accent);
    gl.bindVertexArray(this.shadowVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);

    gl.enable(gl.DEPTH_TEST);
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
