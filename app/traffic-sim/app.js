/* traffic-sim: the page. It builds a ring from the controls, runs it on the
   engine's fixed 0.1 s step at the chosen speed, and draws each frame with
   view.js, placing every car between its last two steps so that motion is
   smooth at any speed. Every driver parameter comes from the settings file
   settings/uk-motorway.json. The controls and the seed live in the address
   after the #, so any run can be shared and repeated. */

import { Ring } from './engine/ring.js';
import { readSettings } from './engine/settings.js';
import { HUMAN, SELFISH, COORDINATED, P_PLATOON } from './engine/drivers.js';
import { makeRng, hashSeed } from './engine/rng.js';
import { roundHalfEven } from './engine/mix.js';
import { View, makeOval } from './view.js';

const LANE_LENGTH = 800;   // metres of ring in each lane
const SPEEDS = [1, 2, 5, 10, 20, 50];
const MAX_STEPS = 400;     // per frame: a slow device drops time rather than stalls
const LANE_SLIDE = 3;      // seconds a lane change takes on screen
const AVERAGE = 15;        // seconds of simulated time the live numbers average over

const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ settings */

// The drivers: UK motorway humans and the self-driving controllers.
const population = readSettings(await (await fetch('settings/uk-motorway.json')).text());

const settings = {
  lanes: 1, density: 45, av: 0, selfish: 50, absorb: false, keep: true,
  speed: 5, colour: 'type', camera: 'top', seed: Math.floor(Math.random() * 1e6)
};
const LIMITS = { lanes: [1, 2], density: [10, 80], av: [0, 100], selfish: [0, 100], seed: [0, 1e9] };

function readHash() {
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    const [key, raw] = part.split('=');
    if (!(key in settings) || raw === undefined) continue;
    const value = decodeURIComponent(raw);
    if (key === 'absorb') settings.absorb = value === '1';
    else if (key === 'keep') settings.keep = value !== '0';
    else if (key === 'colour') settings.colour = value === 'speed' ? 'speed' : 'type';
    else if (key === 'camera') settings.camera = ['top', 'tilt', 'ride'].includes(value) ? value : 'top';
    else if (key === 'speed') settings.speed = SPEEDS.includes(+value) ? +value : 5;
    else if (Number.isFinite(+value)) {
      const [lo, hi] = LIMITS[key];
      settings[key] = Math.min(hi, Math.max(lo, Math.round(+value)));
    }
  }
}
let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const s = settings;
    const parts = [`lanes=${s.lanes}`, `keep=${s.keep ? 1 : 0}`, `density=${s.density}`, `av=${s.av}`, `selfish=${s.selfish}`,
      `absorb=${s.absorb ? 1 : 0}`, `speed=${s.speed}`, `colour=${s.colour}`, `camera=${s.camera}`, `seed=${s.seed}`];
    try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) { /* a sandboxed frame may refuse */ }
  }, 300);
}

/* --------------------------------------------------------------- theme */

const THEMES = {
  dark: {
    fog: [0.086, 0.086, 0.102], ground: [0.13, 0.16, 0.14], road: [0.21, 0.215, 0.235], kerb: [0.32, 0.32, 0.33],
    line: [0.88, 0.87, 0.82], shadow: 0.55, accent: [1.0, 0.82, 0.3], link: [0.45, 0.75, 1.0],
    glass: [0.13, 0.17, 0.23], tyre: [0.05, 0.05, 0.06], fogDensity: 1.2,
    types: { [HUMAN]: [0.86, 0.83, 0.76], [COORDINATED]: [0.26, 0.56, 1.0], [SELFISH]: [1.0, 0.5, 0.16] }
  },
  light: {
    fog: [0.965, 0.953, 0.925], ground: [0.85, 0.88, 0.79], road: [0.56, 0.57, 0.6], kerb: [0.74, 0.74, 0.72],
    line: [0.99, 0.99, 0.97], shadow: 0.32, accent: [0.86, 0.42, 0.0], link: [0.08, 0.36, 0.86],
    glass: [0.2, 0.26, 0.33], tyre: [0.09, 0.09, 0.1], fogDensity: 1.2,
    types: { [HUMAN]: [0.98, 0.97, 0.94], [COORDINATED]: [0.16, 0.45, 0.95], [SELFISH]: [0.98, 0.45, 0.1] }
  }
};
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
let theme = darkQuery.matches ? THEMES.dark : THEMES.light;
darkQuery.addEventListener('change', e => { theme = e.matches ? THEMES.dark : THEMES.light; renderLegend(); });

// Speed colours: red when stopped, amber at 12 m/s, green from 25 m/s.
function speedColour(v) {
  const stops = [[0, [0.9, 0.2, 0.22]], [12, [0.98, 0.7, 0.14]], [25, [0.28, 0.72, 0.4]]];
  if (v >= 25) return stops[2][1];
  const k = v < 12 ? 0 : 1, [v0, c0] = stops[k], [v1, c1] = stops[k + 1], f = (v - v0) / (v1 - v0);
  return c0.map((c, q) => c + (c1[q] - c) * f);
}
const css = c => `rgb(${c.map(x => Math.round(x * 255)).join(',')})`;

/* ---------------------------------------------------------------- ring */

let ring, oval, n = 0, order, rank, prevS, inst, links;
let clock = 0, running = true, selected = -1;
const live = { flow: 0, speed: 0, spread: 0, hard: 0, stopped: 0, primed: false };

function build() {
  n = Math.round(settings.density * LANE_LENGTH / 1000 * settings.lanes);
  const rng = makeRng(hashSeed('cars', settings.seed, n));
  // A fixed random order of the cars, and a random rank for each. The first
  // cars in the order drive themselves, and the lowest-ranked of those are
  // selfish. A slider then changes as few cars as it can.
  order = Array.from({ length: n }, (_, i) => i);
  for (let q = n - 1; q > 0; q--) {
    const r = rng.int(q + 1);
    [order[q], order[r]] = [order[r], order[q]];
  }
  rank = Float64Array.from({ length: n }, () => rng.uniform());
  ring = new Ring({
    length: LANE_LENGTH, lanes: settings.lanes, types: new Uint8Array(n), seed: settings.seed,
    absorb: settings.absorb, keepLeft: settings.keep, params: population.params
  });
  retype();
  oval = makeOval(LANE_LENGTH, settings.lanes);
  view.setRoad(oval);
  prevS = new Float64Array(ring.s.subarray(0, n));
  inst = new Float32Array(n * 8);
  links = new Float32Array(n * 6);
  clock = 0;
  live.primed = false;
  if (selected >= n) selected = -1;
  fitCamera(true);
}

function retype() {
  const k = roundHalfEven(settings.av / 100 * n), ks = roundHalfEven(settings.selfish / 100 * k);
  const avs = order.slice(0, k).sort((a, b) => rank[a] - rank[b]);
  ring.type.fill(HUMAN, 0, n);
  avs.forEach((i, q) => { ring.type[i] = q < ks ? SELFISH : COORDINATED; });
  ring.absorb = settings.absorb;
}

function step() {
  prevS.set(ring.s.subarray(0, n));
  ring.step();
  // The live numbers: averages over the last AVERAGE seconds or so.
  let sum = 0, sum2 = 0, hard = 0, stopped = 0;
  for (let i = 0; i < n; i++) {
    const v = ring.v[i];
    sum += v;
    sum2 += v * v;
    if (ring.acc[i] < -2) hard++;
    if (v < 0.5) stopped++;
  }
  const mean = sum / n, spread = Math.sqrt(Math.max(sum2 / n - mean * mean, 0));
  const flow = (n / settings.lanes) / (LANE_LENGTH / 1000) * mean * 3.6;
  const k = live.primed ? ring.c.dt / AVERAGE : 1;
  live.flow += (flow - live.flow) * k;
  live.speed += (mean * 3.6 - live.speed) * k;
  live.spread += (spread * 3.6 - live.spread) * k;
  live.hard += (hard / n - live.hard) * k;
  live.stopped = stopped;
  live.primed = true;
}

/* --------------------------------------------------------- drawing data */

const pose = [0, 0, 0];
// Where car i is drawn, alpha of the way from its last step to this one,
// at distance back from its front: [x, z, heading].
function carPose(i, alpha, back) {
  const L = LANE_LENGTH;
  let s0 = prevS[i], s1 = ring.s[i];
  if (s1 < s0 - L / 2) s1 += L;
  const s = s0 + (s1 - s0) * alpha - back;
  let d = oval.laneOffset(ring.lane[i]);
  const age = ring.laneAge[i];
  if (age < LANE_SLIDE) {
    const f = age / LANE_SLIDE, ease = f * f * (3 - 2 * f);
    d = oval.laneOffset(ring.fromLane[i]) + (d - oval.laneOffset(ring.fromLane[i])) * ease;
  }
  const p = oval.at(s / L, d);
  pose[0] = p[0]; pose[1] = p[1]; pose[2] = p[2];
  return pose;
}

function fillInstances(alpha) {
  const half = ring.c.len / 2;
  for (let i = 0; i < n; i++) {
    const [x, z, h] = carPose(i, alpha, half), o = i * 8;
    const v = ring.v[i], a = ring.acc[i];
    const col = settings.colour === 'speed' ? speedColour(v) : theme.types[ring.type[i]];
    inst[o] = x; inst[o + 1] = z; inst[o + 2] = h;
    inst[o + 3] = ring.brakeLeft[i] > 0 || v < 0.3 ? 1 : Math.min(1, Math.max(0, (-a - 0.4) / 2.4));
    inst[o + 4] = col[0]; inst[o + 5] = col[1]; inst[o + 6] = col[2];
    inst[o + 7] = i === selected && settings.camera !== 'ride' ? 1 : 0;
  }
  // A faint line from each platooning car to the car it follows over V2V.
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (ring.profile[i] !== P_PLATOON) continue;
    const j = ring.leader[i];
    if (j < 0) continue;
    const [x0, z0] = carPose(i, alpha, 0);
    links[count * 6] = x0; links[count * 6 + 1] = 0.9; links[count * 6 + 2] = z0;
    const [x1, z1] = carPose(j, alpha, ring.c.len);
    links[count * 6 + 3] = x1; links[count * 6 + 4] = 0.9; links[count * 6 + 5] = z1;
    count++;
  }
  return count;
}

/* -------------------------------------------------------------- camera */

const canvas = $('view');
const view = new View(canvas);
const cam = view.cam;
const goal = { x: 0, z: 0, dist: 400, yaw: 0, pitch: Math.PI / 2 };
let rideDist = 14;

const CAMERAS = { top: Math.PI / 2, tilt: 0.62 };
// The part of the screen the cards leave clear. A card that is narrow for
// the screen takes a side, and a wide one takes a strip at the top or the
// bottom. A card smaller than a twentieth of the screen, such as the folded
// title on a phone held sideways, sits in a corner the oval leaves empty.
function freeArea() {
  const W = view.W, H = view.H, free = { left: 0, top: 0, right: W, bottom: H };
  for (const r of [$('controls').getBoundingClientRect(), $('numbers').getBoundingClientRect()]) {
    if (r.width * r.height < W * H / 20) continue;
    if (r.width / W < r.height / H) {
      if (r.left + r.width / 2 < W / 2) free.left = Math.max(free.left, r.right + 8);
      else free.right = Math.min(free.right, r.left - 8);
    } else if (r.top + r.height / 2 < H / 2) free.top = Math.max(free.top, r.bottom + 8);
    else free.bottom = Math.min(free.bottom, r.top - 8);
  }
  return free;
}
function fitCamera(now) {
  view.resize();
  const f = view.fit(freeArea());
  goal.x = f.x; goal.z = f.z; goal.yaw = f.yaw;
  goal.dist = settings.camera === 'tilt' ? f.dist * 1.1 : f.dist;
  goal.pitch = CAMERAS[settings.camera] || CAMERAS.top;
  if (now || reduceMotion) Object.assign(cam, goal);
}
function ease(dtReal) {
  if (settings.camera === 'ride') {
    const i = selected >= 0 ? selected : 0;
    const [x, z, h] = carPose(i, running ? clock / ring.c.dt : 1, ring.c.len / 2);
    cam.follow = cam.follow || [x, z, h];
    // Smooth the heading through the curves, taking the short way round.
    let dh = h - cam.follow[2];
    dh -= Math.round(dh / (2 * Math.PI)) * 2 * Math.PI;
    cam.follow[0] = x; cam.follow[1] = z;
    cam.follow[2] += reduceMotion ? dh : dh * (1 - Math.exp(-dtReal / 0.25));
    cam.dist = rideDist;
    return;
  }
  cam.follow = null;
  const k = reduceMotion ? 1 : 1 - Math.exp(-dtReal / 0.18);
  let dy = goal.yaw - cam.yaw;
  dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
  cam.x += (goal.x - cam.x) * k;
  cam.z += (goal.z - cam.z) * k;
  cam.dist *= Math.pow(goal.dist / cam.dist, k);
  cam.yaw += dy * k;
  cam.pitch += (goal.pitch - cam.pitch) * k;
}
function clampDist(d) {
  const f = view.fit().dist;
  return Math.min(f * 3, Math.max(25, d));
}

/* ---------------------------------------------------------------- loop */

let last = 0, lastNumbers = 0, frameCam = null;
function frame(now) {
  const real = last ? Math.min(0.25, (now - last) / 1000) : 0;
  last = now;
  const dt = ring.c.dt;
  if (running) clock += real * settings.speed;
  let steps = 0;
  while (clock >= dt && steps < MAX_STEPS) {
    step();
    clock -= dt;
    steps++;
  }
  if (steps === MAX_STEPS) clock = 0;
  const alpha = running ? clock / dt : 1;
  ease(real);
  const linkCount = fillInstances(alpha);
  frameCam = view.draw(inst, n, links, linkCount, theme);
  if (now - lastNumbers > 250) {
    lastNumbers = now;
    renderNumbers();
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------ controls */

function pressed(group, value) {
  for (const b of document.querySelectorAll(`[data-${group}]`)) b.setAttribute('aria-pressed', String(b.dataset[group] === String(value)));
}
function renderControls() {
  pressed('lanes', settings.lanes);
  pressed('speed', settings.speed);
  pressed('colour', settings.colour);
  pressed('camera', settings.camera);
  $('density').value = settings.density;
  $('density-out').textContent = settings.density;
  $('av').value = settings.av;
  $('av-out').textContent = settings.av + '%';
  $('selfish').value = settings.selfish;
  $('selfish-out').textContent = settings.selfish + '%';
  $('absorb').checked = settings.absorb;
  $('keep').checked = settings.keep;
  $('keep').disabled = settings.lanes === 1;
  $('run').textContent = running ? 'Pause' : 'Run';
  $('run').setAttribute('aria-pressed', String(!running));
  $('step').disabled = running;
  $('selfish').disabled = settings.av === 0;
  $('absorb').disabled = settings.av === 0;
  // Light the next step: add self-driving cars once humans have shown a jam.
  document.querySelector('[data-step="drivers"]').classList.toggle('next', settings.av === 0);
  document.querySelector('[data-step="run"]').classList.toggle('next', !running);
}
function renderNumbers() {
  const f = x => Math.round(x).toLocaleString('en-GB');
  $('n-flow').textContent = f(live.flow);
  $('n-speed').textContent = f(live.speed);
  $('n-spread').textContent = f(live.spread);
  $('n-stopped').textContent = f(live.stopped);
  $('n-hard').textContent = (100 * live.hard).toFixed(1) + '%';
  $('n-cars').textContent = `${n} cars on ${settings.lanes === 1 ? 'one lane' : 'two lanes'} of ${LANE_LENGTH} m`;
  $('n-time').textContent = formatTime(ring.time);
}
function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function renderLegend() {
  const items = settings.colour === 'speed'
    ? [['Stopped', speedColour(0)], ['40 km/h', speedColour(12)], ['90 km/h', speedColour(25)]]
    : [['Human', theme.types[HUMAN]], ['Coordinated', theme.types[COORDINATED]], ['Selfish', theme.types[SELFISH]]];
  $('legend').innerHTML = items.map(([name, c]) => `<li><span class="swatch" style="background:${css(c)}"></span>${name}</li>`).join('');
}

function changed() {
  renderControls();
  writeHash();
}

for (const b of document.querySelectorAll('[data-lanes]')) {
  b.addEventListener('click', () => {
    if (+b.dataset.lanes === settings.lanes) return;
    settings.lanes = +b.dataset.lanes;
    build();
    changed();
  });
}
$('keep').addEventListener('change', e => { settings.keep = e.target.checked; ring.keepLeft = settings.keep; changed(); });
// The traffic slider rebuilds the ring, so it applies on release; only its
// number follows the drag.
$('density').addEventListener('input', e => { $('density-out').textContent = e.target.value; });
$('density').addEventListener('change', e => {
  settings.density = +e.target.value;
  build();
  changed();
});
// The mix sliders retype cars in place, so a jam forms or clears live.
$('av').addEventListener('input', e => { settings.av = +e.target.value; retype(); changed(); });
$('selfish').addEventListener('input', e => { settings.selfish = +e.target.value; retype(); changed(); });
$('absorb').addEventListener('change', e => { settings.absorb = e.target.checked; retype(); changed(); });

function toggleRun() {
  running = !running;
  last = 0;
  changed();
}
$('run').addEventListener('click', toggleRun);
$('step').addEventListener('click', () => {
  step();
  prevS.set(ring.s.subarray(0, n));
  renderNumbers();
});
for (const b of document.querySelectorAll('[data-speed]')) {
  b.addEventListener('click', () => { settings.speed = +b.dataset.speed; changed(); });
}
$('new').addEventListener('click', () => {
  settings.seed = Math.floor(Math.random() * 1e6);
  build();
  changed();
});
for (const b of document.querySelectorAll('[data-colour]')) {
  b.addEventListener('click', () => { settings.colour = b.dataset.colour; renderLegend(); changed(); });
}
for (const b of document.querySelectorAll('[data-camera]')) {
  b.addEventListener('click', () => {
    settings.camera = b.dataset.camera;
    if (settings.camera === 'ride' && selected < 0) selected = 0;
    fitCamera(false);
    changed();
  });
}
$('fit').addEventListener('click', () => {
  if (settings.camera === 'ride') settings.camera = 'top';
  fitCamera(false);
  changed();
});

// On a small screen the steps fold away behind the title, to leave the road clear.
const small = matchMedia('(max-width: 640px), (max-height: 500px)');
function fold(open) {
  $('controls').classList.toggle('folded', !open);
  $('fold').setAttribute('aria-expanded', String(open));
  $('fold').textContent = open ? 'Hide' : 'Controls';
  if (ring) fitCamera(false);
}
$('fold').addEventListener('click', () => fold($('controls').classList.contains('folded')));
fold(!small.matches);

const fsButton = $('fullscreen');
const fsEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
fsButton.hidden = !fsEnabled;
function toggleFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    if (p && p.catch) p.catch(() => {});
  }
}
fsButton.addEventListener('click', () => { toggleFullscreen(); fsButton.blur(); });

document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); toggleRun(); }
  else if (e.key === '.' && !running) $('step').click();
  else if ((e.key === 'f' || e.key === 'F') && fsEnabled && !e.metaKey && !e.ctrlKey) toggleFullscreen();
});

/* --------------------------------------------------------------- input */

// Drag pans, the wheel or a pinch zooms about the pointer, and a right-drag,
// a ctrl-drag or a two-finger twist turns. A right-drag up or down tilts.
// A tap on a car brakes it, and chooses it for the ride-along camera.
const pointers = new Map();
let down = null, pinch = null, turn = null;

function metresPerPixel() {
  return 2 * Math.tan(20 * Math.PI / 180) * (frameCam ? frameCam.range : cam.dist) / view.H;
}
function panBy(dx, dy) {
  if (settings.camera === 'ride') return;
  const k = metresPerPixel(), c = Math.cos(cam.yaw), s = Math.sin(cam.yaw), up = dy / Math.max(0.3, Math.sin(cam.pitch));
  cam.x += (-c * dx + s * up) * k;
  cam.z += (-s * dx - c * up) * k;
  goal.x = cam.x; goal.z = cam.z;
}
function zoomAbout(factor, px, py) {
  if (settings.camera === 'ride') {
    rideDist = Math.min(60, Math.max(6, rideDist * factor));
    return;
  }
  const before = view.groundAt(px, py);
  cam.dist = goal.dist = clampDist(cam.dist * factor);
  const after = view.groundAt(px, py);
  if (before && after) {
    cam.x += before[0] - after[0];
    cam.z += before[1] - after[1];
    goal.x = cam.x; goal.z = cam.z;
  }
}
function turnBy(angle, tilt) {
  if (settings.camera === 'ride') return;
  cam.yaw += angle;
  goal.yaw = cam.yaw;
  if (tilt) {
    cam.pitch = goal.pitch = Math.min(Math.PI / 2, Math.max(0.3, cam.pitch + tilt));
  }
}
function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  canvas.focus({ preventScroll: true });
  if (e.ctrlKey || e.button === 2) {
    turn = { id: e.pointerId, x: e.clientX, y: e.clientY };
    return;
  }
  if (e.button > 0) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  down = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false } : null;
  if (pointers.size === 2) pinch = pinchState();
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  if (turn && e.pointerId === turn.id) {
    turnBy((e.clientX - turn.x) * 0.006, (e.clientY - turn.y) * 0.005);
    turn.x = e.clientX;
    turn.y = e.clientY;
    return;
  }
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
  if (pointers.size === 1) panBy(dx, dy);
  else if (pointers.size === 2 && pinch) {
    const q = pinchState();
    panBy(q.x - pinch.x, q.y - pinch.y);
    if (pinch.d > 0 && q.d > 0) zoomAbout(pinch.d / q.d, q.x, q.y);
    let da = q.a - pinch.a;
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    turnBy(-da, 0);
    pinch = q;
  }
});
function pointerEnd(e) {
  if (turn && e.pointerId === turn.id) { turn = null; return; }
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size) return;
  canvas.classList.remove('dragging');
  if (e.type === 'pointerup' && down && !down.moved && e.timeStamp - down.t < 600) tapAt(e.clientX, e.clientY);
  down = null;
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
  zoomAbout(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX, e.clientY);
}, { passive: false });

function tapAt(px, py) {
  const r = canvas.getBoundingClientRect();
  const hit = view.groundAt(px - r.left, py - r.top, 0.8, frameCam || undefined);
  if (!hit) return;
  let best = -1, bestD = 5;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(inst[i * 8] - hit[0], inst[i * 8 + 1] - hit[1]);
    if (d < bestD) { best = i; bestD = d; }
  }
  if (best < 0) return;
  selected = best;
  ring.tap(best);
}

/* ---------------------------------------------------------------- start */

readHash();
build();
renderControls();
renderLegend();
renderNumbers();
writeHash();
// A resize keeps the camera, unless the screen turns between wide and tall.
let wide = view.W >= view.H;
window.addEventListener('resize', () => {
  view.resize();
  if ((view.W >= view.H) !== wide) {
    wide = view.W >= view.H;
    fitCamera(true);
  }
});
requestAnimationFrame(frame);
// For checks in a headless browser: the ring and the view.
window.trafficSim = { get ring() { return ring; }, view, settings };
