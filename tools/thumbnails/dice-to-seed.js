/* Draws assets/thumbs/dice-to-seed.svg: six red casino dice thrown into the corner
   of a craps table. They tumble, bounce off the rubber walls, settle, rest a
   while and fade, on an 11-second loop.

   Run from anywhere: node tools/thumbnails/dice-to-seed.js [seed]
   With --search it tries seeds 1 to 400 and lists the throws that end well:
   every die flat, apart from the others and in view.

   A small rigid-body simulation throws the dice: cubes against the felt, the
   two walls and each other, with bounce and friction. A camera then looks
   into the corner. Each face is a flat square carried by one affine
   transform per frame, fitted to its four corners in perspective, and CSS
   keyframes play the frames back. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/dice-to-seed.svg');

const LOOP = 11;              // seconds
const FPS = 25;               // keyframes per second while the dice move
const FADE_AT = 9.6, FADE_END = 10.3;
const VIEW = 240;             // viewBox size; the page shows it at 120 px
const WALL = 2.6;             // wall height, in die widths

/* ------------------------------------------------------------ small maths */

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
};
function qmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
          a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
          a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
          a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
}
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]); return q.map(v => v / l); }
function qmat(q) {
  const [w, x, y, z] = q;
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
          [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
          [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
}
function mv(M, v) {
  return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
          M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
          M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
}
function mtv(M, v) {
  return [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2],
          M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2],
          M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
}
function mulberry32(seed) {
  return function () {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- camera */

// Looking down the diagonal into the corner, which sits at the origin. The
// wall x = 0 runs off to the left, the wall z = 0 to the right.
const CAM = [9.6, 7.4, 9.6], TGT = [1.75, 0.55, 1.75];
const FWD = V.norm(V.sub(TGT, CAM));
const RIGHT = V.norm(V.cross(FWD, [0, 1, 0]));
const UP = V.cross(RIGHT, FWD);
const FOCAL = 470;
function project(p) {
  const d = V.sub(p, CAM), z = V.dot(d, FWD);
  return [VIEW / 2 + FOCAL * V.dot(d, RIGHT) / z, VIEW * 0.5 - FOCAL * V.dot(d, UP) / z, z];
}

/* ------------------------------------------------------------ simulation */

const PLANES = [
  { n: [0, 1, 0], d: 0, e: 0.28, mu: 0.4, floor: true },   // felt
  { n: [1, 0, 0], d: 0, e: 0.5, mu: 0.3 },                 // wall along z
  { n: [0, 0, 1], d: 0, e: 0.5, mu: 0.3 },                 // wall along x
  { n: [-1, 0, 0], d: -16, e: 0.5, mu: 0.3 },
  { n: [0, 0, -1], d: -16, e: 0.5, mu: 0.3 }
];
const GRAV = [0, -26, 0];
const THROW_FROM = 7.0;       // where the throw starts, along the diagonal, out of sight
const SPEED = [11, 13.5];     // throw speed range, in die widths per second
const INV_I = 6;              // a unit cube of unit mass has inertia 1/6 about any axis
// The corners, for the felt and walls. Dice against dice also test edge
// midpoints and face centres, since two dice side by side on the felt have
// their corners exactly level with each other's faces, never inside.
const LOCAL = [], PROBES = [];
for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) LOCAL.push([sx, sy, sz]);
for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) for (const c of [-0.5, 0, 0.5]) {
  const onFace = [a, b, c].filter(v => v !== 0).length;
  if (onFace >= 1) PROBES.push([a, b, c]);
}

function simulate(seed) {
  const rand = mulberry32(seed);
  const r = (a, b) => a + (b - a) * rand();
  function randomQuat() {
    const u1 = rand(), u2 = rand(), u3 = rand();
    return [Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
            Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), Math.sqrt(u1) * Math.cos(2 * Math.PI * u3)];
  }
  // A loose handful, thrown from just below the picture towards the corner.
  const dice = [];
  for (let i = 0; i < 6; i++) {
    const across = (i % 3 - 1) * 1.05 + r(-0.15, 0.15), back = (i < 3 ? 0 : 1.05) + r(-0.15, 0.15);
    const x = [THROW_FROM + back * 0.7 + across * 0.7, 1.2 + r(0, 0.8) + (i < 3 ? 0 : 0.4), THROW_FROM + back * 0.7 - across * 0.7];
    const speed = r(SPEED[0], SPEED[1]);
    const aim = V.norm([-1 + r(-0.1, 0.1), 0, -1 + r(-0.1, 0.1)]);
    const w = V.mul(V.norm([r(-1, 1), r(-1, 1), r(-1, 1)]), r(10, 22));
    dice.push({ x, v: [aim[0] * speed, r(1.5, 3.2), aim[2] * speed], q: randomQuat(), w, sleep: false, still: 0 });
  }

  function contacts() {
    const cs = [];
    dice.forEach(d => { d.M = qmat(d.q); d.C = LOCAL.map(l => V.add(d.x, mv(d.M, l))); d.Q = PROBES.map(l => V.add(d.x, mv(d.M, l))); d.onFloor = false; });
    dice.forEach((d, i) => {
      for (const P of PLANES) for (const c of d.C) {
        const pen = P.d - V.dot(P.n, c);
        if (pen > 0) { cs.push({ a: i, b: -1, p: c, n: P.n, pen, e: P.e, mu: P.mu }); if (P.floor) d.onFloor = true; }
      }
    });
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      if (i === j) continue;
      const A = dice[i], B = dice[j];
      if (V.len(V.sub(A.x, B.x)) > 1.75) continue;
      for (const c of A.Q) {
        const l = mtv(B.M, V.sub(c, B.x));
        if (Math.abs(l[0]) >= 0.5 || Math.abs(l[1]) >= 0.5 || Math.abs(l[2]) >= 0.5) continue;
        let ax = 0;
        for (let k = 1; k < 3; k++) if (Math.abs(l[k]) > Math.abs(l[ax])) ax = k;
        const e = [0, 0, 0]; e[ax] = Math.sign(l[ax]);
        cs.push({ a: i, b: j, p: c, n: mv(B.M, e), pen: 0.5 - Math.abs(l[ax]), e: 0.35, mu: 0.3 });
      }
    }
    return cs;
  }
  function relVel(c) {
    const A = dice[c.a];
    let v = V.add(A.v, V.cross(A.w, c.ra));
    if (c.b >= 0) { const B = dice[c.b]; v = V.sub(v, V.add(B.v, V.cross(B.w, c.rb))); }
    return v;
  }
  function push(c, J) {
    const A = dice[c.a];
    A.v = V.add(A.v, J); A.w = V.add(A.w, V.mul(V.cross(c.ra, J), INV_I));
    if (c.b >= 0) { const B = dice[c.b]; B.v = V.sub(B.v, J); B.w = V.sub(B.w, V.mul(V.cross(c.rb, J), INV_I)); }
  }
  function solve(cs) {
    for (const c of cs) {
      const B = c.b >= 0 ? dice[c.b] : null;
      c.ra = V.sub(c.p, dice[c.a].x); c.rb = B ? V.sub(c.p, B.x) : null;
      const vn = V.dot(relVel(c), c.n);
      c.bias = vn < -0.9 ? -c.e * vn : 0;
      c.Pn = 0; c.Pt = [0, 0, 0];
      const k = (r) => { const x = V.cross(r, c.n); return 1 + INV_I * V.dot(x, x); };
      c.kn = k(c.ra) + (B ? k(c.rb) : 0);
    }
    for (let it = 0; it < 14; it++) {
      for (const c of cs) {
        const vn = V.dot(relVel(c), c.n);
        const P = Math.max(c.Pn + (c.bias - vn) / c.kn, 0);
        push(c, V.mul(c.n, P - c.Pn));
        c.Pn = P;
        const vr = relVel(c), vt = V.sub(vr, V.mul(c.n, V.dot(vr, c.n))), vtl = V.len(vt);
        if (vtl < 1e-9) continue;
        const t = V.mul(vt, 1 / vtl);
        const k = (r) => { const x = V.cross(r, t); return 1 + INV_I * V.dot(x, x); };
        const kt = k(c.ra) + (c.b >= 0 ? k(c.rb) : 0);
        let Pt = V.sub(c.Pt, V.mul(t, vtl / kt));
        const max = c.mu * c.Pn, l = V.len(Pt);
        if (l > max) Pt = V.mul(Pt, max / l);
        push(c, V.sub(Pt, c.Pt));
        c.Pt = Pt;
      }
    }
  }

  const DT = 1 / 1000, frames = [];
  let t = 0, settled = null;
  while (t < 6) {
    if (Math.round(t * 1000) % (1000 / FPS) === 0) frames.push(dice.map(d => ({ x: d.x.slice(), M: qmat(d.q) })));
    for (const d of dice) if (!d.sleep) d.v = V.add(d.v, V.mul(GRAV, DT));
    const cs = contacts();
    solve(cs);
    for (const d of dice) {
      if (d.sleep) {
        if (V.len(d.v) > 0.4 || V.len(d.w) > 1.5) { d.sleep = false; d.still = 0; } else { d.v = [0, 0, 0]; d.w = [0, 0, 0]; continue; }
      }
      d.x = V.add(d.x, V.mul(d.v, DT));
      const dq = qmul([0, d.w[0], d.w[1], d.w[2]], d.q);
      d.q = qnorm(d.q.map((v, k) => v + 0.5 * DT * dq[k]));
      d.w = V.mul(d.w, Math.exp(-(d.onFloor ? 2.2 : 0.2) * DT));
      if (d.onFloor) { d.v[0] *= Math.exp(-0.9 * DT); d.v[2] *= Math.exp(-0.9 * DT); }
      if (d.onFloor && V.len(d.v) < 0.06 && V.len(d.w) < 0.2) d.still += DT; else d.still = 0;
      if (d.still > 0.2) { d.sleep = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; }
    }
    // Push anything still inside a plane or another die back out.
    for (const d of dice) {
      for (const P of PLANES) {
        let pen = 0;
        for (const l of LOCAL) pen = Math.max(pen, P.d - V.dot(P.n, V.add(d.x, mv(qmat(d.q), l))));
        if (pen > 0.001) d.x = V.add(d.x, V.mul(P.n, (pen - 0.001) * 0.6));
      }
    }
    cs.filter(c => c.b >= 0 && c.pen > 0.002).forEach(c => {
      dice[c.a].x = V.add(dice[c.a].x, V.mul(c.n, c.pen * 0.2));
      dice[c.b].x = V.sub(dice[c.b].x, V.mul(c.n, c.pen * 0.2));
    });
    t += DT;
    if (dice.every(d => d.sleep)) { settled = t; frames.push(dice.map(d => ({ x: d.x.slice(), M: qmat(d.q) }))); break; }
  }
  return { frames, settled, dice };
}

/* ---------------------------------------------------------------- faces */

// Each face: its outward normal and two axes along it, in the die's own
// frame, with u x v = n, and its number. Opposite faces add up to seven.
const FACES = [
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], pips: 1 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], pips: 6 },
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], pips: 2 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], pips: 5 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], pips: 3 },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], pips: 4 }
];
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
};
function topFace(M) {
  let best = null;
  FACES.forEach(f => { const up = mv(M, f.n)[1]; if (!best || up > best.up) best = { up, f }; });
  return best;
}

// A face's affine map from its own square, corners at +-0.5, to the screen:
// the least-squares fit to its four projected corners. The square's v axis
// runs against the face's, so a face turned to the camera never shows
// mirrored. Browsers blend two matrix() keyframes by taking each apart into
// a turn, a scale and a skew, and a mirrored pair can come apart two
// different ways, which smears the face across the picture for a frame.
function faceMatrix(fr, f) {
  const c = V.add(fr.x, mv(fr.M, V.mul(f.n, 0.5)));
  const U = mv(fr.M, f.u), W = V.mul(mv(fr.M, f.v), -1);
  const P = [];
  for (const s of [-0.5, 0.5]) for (const t of [-0.5, 0.5]) P.push({ s, t, p: project(V.add(c, V.add(V.mul(U, s), V.mul(W, t)))) });
  const mean = [0, 0], a = [0, 0], b = [0, 0];
  P.forEach(q => {
    mean[0] += q.p[0] / 4; mean[1] += q.p[1] / 4;
    a[0] += q.s * q.p[0]; a[1] += q.s * q.p[1];
    b[0] += q.t * q.p[0]; b[1] += q.t * q.p[1];
  });
  const normal = mv(fr.M, f.n), toCam = V.sub(CAM, c);
  return { m: [a[0], a[1], b[0], b[1], mean[0], mean[1]], visible: V.dot(normal, toCam) > 0, normal, depth: V.len(toCam) };
}

const LIGHT = V.norm([-0.45, 1, 0.25]);
function shade(normal) {
  const k = 0.42 + 0.58 * Math.max(0, V.dot(normal, LIGHT));
  const base = [214, 32, 44];
  return '#' + base.map(v => ('0' + Math.round(v * k).toString(16)).slice(-2)).join('');
}

/* ------------------------------------------------------------ judging */

function judge(sim) {
  if (!sim.settled || sim.settled > 3.4) return null;
  const last = sim.frames[sim.frames.length - 1];
  const tops = last.map(fr => topFace(fr.M));
  if (tops.some(t => t.up < 0.995)) return null;          // one leans on something
  let minGap = Infinity;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    minGap = Math.min(minGap, Math.hypot(last[i].x[0] - last[j].x[0], last[i].x[2] - last[j].x[2]));
  }
  if (minGap < 1.3) return null;
  if (last.some(fr => fr.x[0] > 4.6 || fr.x[2] > 4.6)) return null;   // near the corner
  // In view with a margin, and not hiding one another on screen.
  const pts = last.map(fr => project(fr.x));
  if (pts.some(p => p[0] < 26 || p[0] > VIEW - 26 || p[1] < 40 || p[1] > VIEW - 26)) return null;
  let minScreen = Infinity;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) minScreen = Math.min(minScreen, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  return { settled: sim.settled, minGap, minScreen, tops: tops.map(t => t.f.pips) };
}

if (process.argv.includes('--search')) {
  const good = [];
  for (let seed = 1; seed <= 400; seed++) {
    const j = judge(simulate(seed));
    if (j) good.push({ seed, ...j });
  }
  good.sort((a, b) => b.minScreen - a.minScreen);
  good.slice(0, 25).forEach(g => console.log(`seed ${g.seed}: settles ${g.settled.toFixed(2)} s, gap ${g.minGap.toFixed(2)}, ` +
    `screen gap ${g.minScreen.toFixed(0)}, tops ${g.tops.join(' ')}`));
  console.log(good.length + ' good throws of 400');
  process.exit(0);
}

/* -------------------------------------------------------------- drawing */

const SEED = +(process.argv[2] || 334);   // picked with --search: all six flat, apart and in view
const sim = simulate(SEED);
const verdict = judge(sim);
const frames = sim.frames;
const last = frames[frames.length - 1];
// Paint the far dice first. Order by where each one comes to rest.
const order = [0, 1, 2, 3, 4, 5].sort((i, j) => V.len(V.sub(CAM, last[j].x)) - V.len(V.sub(CAM, last[i].x)));

const pct = t => +(100 * t / LOOP).toFixed(2) + '%';
const n1 = v => { const s = (Math.round(v * 10) / 10).toString(); return s.replace(/^0\./, '.').replace(/^-0\./, '-.'); };
const n2 = v => { const s = (Math.round(v * 100) / 100).toString(); return s.replace(/^0\./, '.').replace(/^-0\./, '-.'); };
const mat = m => `matrix(${m.map(n1).join(',')})`;
const css = [], body = [];

// The frames worth a keyframe. Keyframes blend in straight lines, so a frame
// that the blend of its kept neighbours already matches, to within TOL in
// every number, is dropped. Hidden runs keep only their two ends.
const TOL = 0.8;
function thin(states) {
  const keep = new Set([0, states.length - 1]);
  let i = 0;
  while (i < states.length - 1) {
    if (states[i].hidden) {
      let j = i;
      while (j + 1 < states.length && states[j + 1].hidden) j++;
      keep.add(i); keep.add(j);
      i = j === i ? i + 1 : j;
      continue;
    }
    let j = i + 1;
    while (j + 1 < states.length && !states[j + 1].hidden) {
      const cand = j + 1;
      let ok = true;
      for (let m = i + 1; m < cand && ok; m++) {
        const f = (m - i) / (cand - i);
        ok = states[m].vals.every((v, q) => Math.abs(states[i].vals[q] + f * (states[cand].vals[q] - states[i].vals[q]) - v) <= TOL);
      }
      if (!ok) break;
      j = cand;
    }
    keep.add(j);
    i = j;
  }
  return [...keep].sort((a, b) => a - b);
}
const hex3 = c => '#' + [1, 3, 5].map(i => Math.round(parseInt(c.substr(i, 2), 16) / 17).toString(16)).join('');

// Faces. Each pose is written as translate, rotate, skewX and scale rather
// than as a matrix. Keyframes with the same list of functions blend each
// number in a straight line, where two matrix() keyframes would be taken
// apart and blended as a turn and a skew, and a face nearly edge-on then
// smears across the picture for a frame. A hidden face keeps its nearest
// visible pose shrunk to a hundredth, so it shrinks away in place.
function pose(m, prevTurn) {
  const [a, b, c, d, e, f] = m;
  const sx = Math.hypot(a, b), det = a * d - b * c;
  let turn = Math.atan2(b, a) * 180 / Math.PI;
  if (prevTurn !== null) turn += 360 * Math.round((prevTurn - turn) / 360);
  const sy = det / sx, k = (c * a + d * b) / sx / sy;
  return { e, f, turn, skew: Math.atan(k) * 180 / Math.PI, sx, sy };
}
const n0 = v => String(Math.round(v));
const tf = p => `translate(${n1(p.e)}px,${n1(p.f)}px) rotate(${n0(p.turn)}deg) skewX(${n0(p.skew)}deg) scale(${n1(p.sx)},${n1(p.sy)})`;
order.forEach((di, slot) => {
  const parts = [];
  FACES.forEach((f, fi) => {
    const id = `d${slot}f${fi}`;
    const raw = frames.map(fr => faceMatrix(fr[di], f));
    // Nearly edge-on counts as hidden: under a pixel wide at the page's size.
    const shows = r => r.visible && (r.m[0] * r.m[3] - r.m[1] * r.m[2]) > 40;
    let prevTurn = null;
    const poses = raw.map(r => {
      if (!shows(r)) return null;
      const p = pose(r.m, prevTurn);
      prevTurn = p.turn;
      return p;
    });
    const seq = raw.map((r, k) => {
      const shadeRGB = shade(r.normal);
      if (poses[k]) {
        const p = poses[k];
        return { hidden: false, p, fill: hex3(shadeRGB),
                 vals: [p.e, p.f, p.turn * 0.5, p.skew * 0.5, p.sx, p.sy].concat([0, 2, 4].map(q => parseInt(shadeRGB.substr(1 + q, 2), 16) / 40)) };
      }
      let near = null;
      for (let d = 1; d < raw.length && !near; d++) near = poses[k - d] || poses[k + d] || null;
      near = near || pose(r.m, null);
      return { hidden: true, p: Object.assign({}, near, { sx: near.sx / 100, sy: near.sy / 100 }), fill: hex3(shadeRGB), vals: [] };
    });
    // Motion and colour are thinned apart: the shading changes slowly, so
    // most keyframes need no fill of their own.
    const moveKeys = new Set(thin(seq.map(q => q.hidden ? q : Object.assign({}, q, { vals: q.vals.slice(0, 6) }))));
    const fillKeys = new Set(thin(seq.map(q => q.hidden ? q : Object.assign({}, q, { vals: q.vals.slice(6).map(v => v * 0.5) }))));
    const keys = [...new Set([...moveKeys, ...fillKeys])].sort((a, b) => a - b).map(k => {
      const props = [];
      if (moveKeys.has(k)) props.push('transform:' + tf(seq[k].p));
      if (fillKeys.has(k) && !seq[k].hidden) props.push('fill:' + seq[k].fill);
      return `${pct(k / FPS)}{${props.join(';')}}`;
    });
    const rest = seq[seq.length - 1];
    keys.push(`100%{transform:${tf(rest.p)}${rest.hidden ? '' : ';fill:' + rest.fill}}`);
    css.push(`.${id}{animation:${id} ${LOOP}s linear infinite}@keyframes ${id}{${keys.join('')}}`);
    const rp = rest.p;
    parts.push(`<g class="${id}" transform="translate(${n1(rp.e)} ${n1(rp.f)}) rotate(${n1(rp.turn)}) skewX(${n1(rp.skew)}) scale(${n1(rp.sx)} ${n1(rp.sy)})" fill="${rest.fill}">` +
               `<rect x="-.5" y="-.5" width="1" height="1" rx=".1"/><use href="#p${f.pips}"/></g>`);
  });
  body.push(`<g>${parts.join('')}</g>`);
});

// Shadows: a soft disc on the felt under each die, fainter and wider as it rises.
const shadows = order.map((di, slot) => {
  const id = `s${slot}`;
  const seq = frames.map(fr => {
    const x = fr[di].x, h = Math.max(0, x[1] - 0.5);
    const c = [x[0], 0, x[2]], s = 1 + 0.35 * h;
    const P = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ a, b, p: project([c[0] + a * 0.5 * s, 0, c[2] + b * 0.5 * s]) }));
    const m = [0, 0, 0, 0, 0, 0];
    P.forEach(q => { m[0] += q.a * q.p[0] / 4; m[1] += q.a * q.p[1] / 4; m[2] += q.b * q.p[0] / 4; m[3] += q.b * q.p[1] / 4; m[4] += q.p[0] / 4; m[5] += q.p[1] / 4; });
    const o = Math.exp(-h / 1.1);
    return { hidden: false, m, o, vals: m.concat([o * 20]) };
  });
  const keys = thin(seq).map(k => `${pct(k / FPS)}{transform:${mat(seq[k].m)};opacity:${n2(seq[k].o)}}`);
  const rest = seq[seq.length - 1];
  keys.push(`100%{transform:${mat(rest.m)};opacity:${n2(rest.o)}}`);
  css.push(`.${id}{animation:${id} ${LOOP}s linear infinite}@keyframes ${id}{${keys.join('')}}`);
  return `<g class="${id}" transform="${mat(rest.m)}"><circle r="1" fill="url(#shadow)"/></g>`;
});
css.push(`.dice{animation:fade ${LOOP}s linear infinite}@keyframes fade{0%,${pct(FADE_AT)}{opacity:1}${pct(FADE_END)},100%{opacity:0}}`);

/* ----------------------------------------------------------- the table */

const P2 = p => { const q = project(p); return n1(q[0]) + ' ' + n1(q[1]); };
const poly = pts => 'M' + pts.map(P2).join('L') + 'Z';
const FAR = 9;
// The rubber pyramids on each wall, as a diamond lattice of lines w +- y = c
// on the wall, clipped to 0 <= w <= FAR and 0 <= y <= WALL.
function diamonds(along) {
  const lines = [], s = 0.34;
  const at = (w, y) => along === 'z' ? [0, y, w] : [w, y, 0];
  for (let c = -WALL; c < FAR + WALL; c += s) {
    for (const sign of [1, -1]) {
      const lo = sign > 0 ? Math.max(0, -c) : Math.max(0, c - FAR);
      const hi = sign > 0 ? Math.min(WALL, FAR - c) : Math.min(WALL, c);
      if (hi - lo < 0.05) continue;
      lines.push('M' + P2(at(c + sign * lo, lo)) + 'L' + P2(at(c + sign * hi, hi)));
    }
  }
  return lines.join('');
}
const RAIL_H = 0.45, RAIL_W = 1.1;
const railInnerZ = poly([[0, WALL, 0], [0, WALL + RAIL_H, 0], [0, WALL + RAIL_H, FAR], [0, WALL, FAR]]);
const railInnerX = poly([[0, WALL, 0], [0, WALL + RAIL_H, 0], [FAR, WALL + RAIL_H, 0], [FAR, WALL, 0]]);
const railTop = poly([[-RAIL_W, WALL + RAIL_H, FAR], [-RAIL_W, WALL + RAIL_H, -RAIL_W], [FAR, WALL + RAIL_H, -RAIL_W],
                      [FAR, WALL + RAIL_H, 0], [0, WALL + RAIL_H, 0], [0, WALL + RAIL_H, FAR]]);
// The pass line: two white lines round the corner, a band parallel to both walls.
function band(d, r) {
  const pts = [[d, 0, FAR]];
  for (let k = 0; k <= 12; k++) { const a = Math.PI + (Math.PI / 2) * k / 12; pts.push([d + r + r * Math.cos(a), 0, d + r + r * Math.sin(a)]); }
  pts.push([FAR, 0, d]);
  return 'M' + pts.map(P2).join('L');
}
const corner = project([0, 0, 0]);
const glow = project([2.2, 0, 2.2]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="120" height="120">
<defs>
<radialGradient id="felt" gradientUnits="userSpaceOnUse" cx="${n2(glow[0])}" cy="${n2(glow[1])}" r="${VIEW * 0.8}"><stop offset="0" stop-color="#2f9656"/><stop offset=".55" stop-color="#1f7442"/><stop offset="1" stop-color="#11482a"/></radialGradient>
<radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".55" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4127"/><stop offset="1" stop-color="#3b2214"/></linearGradient>
<filter id="soft" x="-.2" y="-.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="3"/></filter>
${Object.keys(PIPS).map(n => `<g id="p${n}" fill="#fff8f0" stroke="none">` + PIPS[n].map(p => `<circle cx="${p[0] * 0.25}" cy="${-p[1] * 0.25}" r=".085"/>`).join('') + '</g>').join('\n')}
</defs>
<style>${css.join('')}</style>
<rect width="${VIEW}" height="${VIEW}" fill="#141013"/>
<path d="${poly([[0, 0, 0], [FAR, 0, 0], [FAR, 0, FAR], [0, 0, FAR]])}" fill="url(#felt)"/>
<path d="${band(3.2, 1.4)}${band(3.9, 2.1)}" fill="none" stroke="#f3eedb" stroke-opacity=".75" stroke-width="2.2"/>
<path d="${poly([[0, 0, 0], [0, WALL, 0], [0, WALL, FAR], [0, 0, FAR]])}" fill="#1a1a1c"/>
<path d="${poly([[0, 0, 0], [0, WALL, 0], [FAR, WALL, 0], [FAR, 0, 0]])}" fill="#232326"/>
<path d="${diamonds('z')}${diamonds('x')}" stroke="#3b3b42" stroke-width=".8" fill="none"/>
<path d="M${P2([0, 0, FAR])}L${P2([0, 0, 0])}L${P2([FAR, 0, 0])}" stroke="#000" stroke-opacity=".6" stroke-width="7" fill="none" filter="url(#soft)"/>
<path d="M${n2(corner[0])} ${n2(corner[1])}L${P2([0, WALL, 0])}" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>
<path d="${railInnerZ}" fill="#2c1a10"/><path d="${railInnerX}" fill="#3a2316"/>
<path d="${railTop}" fill="url(#rail)"/>
<path d="M${P2([0, WALL + RAIL_H, FAR])}L${P2([0, WALL + RAIL_H, 0])}L${P2([FAR, WALL + RAIL_H, 0])}" stroke="#a87650" stroke-width="1.2" fill="none"/>
<g class="dice">
${shadows.join('\n')}
<g stroke="#5c0a12" stroke-width=".03" stroke-linejoin="round">
${body.join('\n')}
</g>
</g>
</svg>
`;
const out = svg;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`${path.relative(ROOT, OUT)}: seed ${SEED}, ${frames.length} frames, settled ${sim.settled && sim.settled.toFixed(2)} s, ` +
            `${(out.length / 1024).toFixed(1)} KB, ${verdict ? 'tops ' + verdict.tops.join(' ') : 'not a clean throw'}`);
