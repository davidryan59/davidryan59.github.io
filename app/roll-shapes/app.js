/* The Rolling Shapes page: settings, sliders, pens, play and saving. The maths is
   in the other modules. The view holds a path, a list of poses, and each pen's curve
   comes from that list. */

import { SHAPES, defaultParams, cornersOf, bounds } from './shapes.js';
import { closeBySize } from './rolling.js';
import { buildPair, chooseMethod, formulaPath, describe, QUALITY } from './compute.js';
import { PRESETS } from './presets.js';
import { penCurve, strokeCurve, drawShapes, drawPen, toPx, svgPath, svgOutline, hue } from './draw.js';

const $ = id => document.getElementById(id);
const MAX_PENS = 6;

const SCHEMES = {
  bright: { label: 'Bright',
    light: ['#e0133c', '#0b6fd8', '#0c9a4a', '#ee8300', '#8a24d6', '#009c9c'],
    dark: ['#ff5573', '#55a8ff', '#3fd884', '#ffae3d', '#c07dff', '#3fd8d8'] },
  jewel: { label: 'Jewel',
    light: ['#8a1538', '#123f8a', '#0e6650', '#8a5208', '#4f1f8a', '#8a1f72'],
    dark: ['#e8688f', '#7ea3e8', '#58c9ad', '#e0ae62', '#ae8ce8', '#e080cf'] },
  pastel: { label: 'Pastel',
    light: ['#f07a9c', '#6aa8ee', '#62cc92', '#f2b055', '#b18cee', '#58c8c8'],
    dark: ['#f5a8bd', '#a8cbf5', '#a4e3bf', '#f5d09b', '#cfb9f5', '#a0e3e3'] },
  ink: { label: 'Ink',
    light: ['#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a', '#1a1a1a'],
    dark: ['#f2efe6', '#f2efe6', '#f2efe6', '#f2efe6', '#f2efe6', '#f2efe6'] },
};

const clone = v => JSON.parse(JSON.stringify(v));
const opening = PRESETS[0];

const state = {
  outer: clone(opening.outer), inner: clone(opening.inner),
  side: 1, overlap: false, laps: opening.laps || 100, pens: clone(opening.pens),
  scheme: 'bright', rainbow: false, width: 1.2, show: true, secondsPerLap: 6,
};

/* ------- Settings in the address ------- */

const num = v => +(+v).toFixed(6);
/* A size keeps nearly all its digits, or a curve that Close made exact would reopen in a shared link. */
const encodeShape = s => [s.type, +(+s.size).toPrecision(14), ...SHAPES[s.type].params.map(p => num(s.params[p.key] ?? p.value))].join('~');
function decodeShape(text, fallback) {
  const bits = String(text || '').split('~'), type = bits[0];
  if (!SHAPES[type]) return clone(fallback);
  const size = clampNumber(bits[1], 1, 5000, fallback.size), params = {};
  SHAPES[type].params.forEach((p, i) => { params[p.key] = clampNumber(bits[i + 2], p.min, p.max, p.value); });
  return { type, size, params };
}
function clampNumber(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
function encodePens(pens) {
  return pens.map(p => {
    if (p.kind === 'centre') return 'c';
    if (p.kind === 'corner') return 'k' + p.i;
    if (p.kind === 'focus') return 'f' + p.i;
    if (p.kind === 'rim') return 'r' + num(p.u);
    return num(p.x) + ',' + num(p.y);
  }).join(';');
}
function decodePens(text) {
  const pens = [];
  for (const bit of String(text || '').split(';').slice(0, MAX_PENS)) {
    if (bit === 'c') pens.push({ kind: 'centre' });
    else if (bit[0] === 'k') pens.push({ kind: 'corner', i: Math.max(0, parseInt(bit.slice(1), 10) || 0) });
    else if (bit[0] === 'f') pens.push({ kind: 'focus', i: Math.max(0, parseInt(bit.slice(1), 10) || 0) });
    else if (bit[0] === 'r') pens.push({ kind: 'rim', u: clampNumber(bit.slice(1), 0, 1, 0) });
    else if (bit.includes(',')) {
      const [x, y] = bit.split(',');
      pens.push({ kind: 'free', x: clampNumber(x, -3, 3, 0), y: clampNumber(y, -3, 3, 0) });
    }
  }
  return pens;
}
const layerFields = s => ({ o: encodeShape(s.outer), i: encodeShape(s.inner), s: s.side, v: s.overlap ? 1 : 0, n: s.laps, p: encodePens(s.pens) });

function writeAddress() {
  const q = new URLSearchParams();
  const f = layerFields(state);
  q.set('o', f.o); q.set('i', f.i);
  if (state.side < 0) q.set('side', 'out');
  if (state.overlap) q.set('overlap', '1');
  q.set('laps', state.laps);
  q.set('pens', f.p);
  if (state.scheme !== 'bright') q.set('colours', state.scheme);
  if (state.rainbow) q.set('rainbow', '1');
  if (state.width !== 1.2) q.set('width', state.width);
  if (!state.show) q.set('shapes', '0');
  if (kept.length) q.set('layers', JSON.stringify(kept.map(k => ({ ...k.fields, c: k.scheme, r: k.rainbow ? 1 : 0, w: k.width }))));
  history.replaceState(null, '', '#' + q.toString());
}
let addressTimer = 0;
const saveAddress = () => { clearTimeout(addressTimer); addressTimer = setTimeout(writeAddress, 180); };

function readAddress() {
  const raw = location.hash.slice(1);
  if (!raw) return false;
  const q = new URLSearchParams(raw);
  state.outer = decodeShape(q.get('o'), opening.outer);
  state.inner = decodeShape(q.get('i'), opening.inner);
  state.side = q.get('side') === 'out' ? -1 : 1;
  state.overlap = q.get('overlap') === '1';
  state.laps = Math.round(clampNumber(q.get('laps'), 1, 500, 100));
  const pens = decodePens(q.get('pens'));
  state.pens = pens.length ? pens : clone(opening.pens);
  state.scheme = SCHEMES[q.get('colours')] ? q.get('colours') : 'bright';
  state.rainbow = q.get('rainbow') === '1';
  state.width = clampNumber(q.get('width'), 0.25, 5, 1.2);
  state.show = q.get('shapes') !== '0';
  return q.get('layers') || true;
}

/* ------- Worker jobs: the newest wins ------- */

class Runner {
  constructor() { this.spawn(); this.nextId = 1; this.active = null; this.waiting = null; }
  spawn() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.message(data);
    this.worker.onerror = event => { console.error(event.message); this.finish(null); };
  }
  message(data) {
    if (!this.active || data.id !== this.active.id) return;
    if (data.type === 'progress') { this.active.onProgress?.(data.share); return; }
    this.finish(data);
  }
  finish(data) {
    const job = this.active;
    this.active = null;
    if (data) job.onDone(data);
    if (this.waiting) { const next = this.waiting; this.waiting = null; this.start(next); }
  }
  start(job) {
    job.id = this.nextId++;
    this.active = job;
    this.worker.postMessage({ id: job.id, kind: job.kind, spec: job.spec, quality: job.quality });
  }
  /* A short job waits its turn behind another short job. Anything else replaces. */
  run(job) {
    if (this.active && this.active.quality === 'preview' && job.quality === 'preview') { this.waiting = job; return; }
    this.cancel();
    this.start(job);
  }
  cancel() {
    this.waiting = null;
    if (this.active) {
      this.active = null;
      this.worker.terminate();
      this.spawn();
    }
  }
}
const runner = new Runner();

/* ------- The current picture ------- */

let pair = null, pairKey = '';
let path = null;
let curves = [];
const kept = [];
let closeNote = '';

const specOf = s => ({
  outer: { type: s.outer.type, size: s.outer.size, params: s.outer.params },
  inner: { type: s.inner.type, size: s.inner.size, params: s.inner.params },
  side: s.side, overlap: s.overlap, laps: s.laps,
});

function currentPair(spec) {
  const key = JSON.stringify([spec.outer, spec.inner]);
  if (key !== pairKey) { pair = buildPair(spec, QUALITY.full.detail); pairKey = key; }
  return pair;
}

/* Where a pen sits on the inner shape, in the shape's own units. */
function penPoint(pen, shape) {
  if (pen.kind === 'centre') return [0, 0];
  if (pen.kind === 'focus') { const f = shape.foci[pen.i]; if (f) return f; return [0, 0]; }
  if (pen.kind === 'corner') {
    const list = cornersOf(shape);
    if (list.length) return list[pen.i % list.length];
    return rimPoint(shape, pen.i * 0.25 % 1);
  }
  if (pen.kind === 'rim') return rimPoint(shape, pen.u);
  return [pen.x * shape.P, pen.y * shape.P];
}
function rimPoint(shape, u) {
  const target = ((u % 1) + 1) % 1 * shape.P;
  let lo = 0, hi = shape.n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (shape.cum[m] <= target) lo = m; else hi = m; }
  const left = target - shape.cum[lo], a = shape.ang[lo];
  return [shape.x[lo] + left * Math.cos(a), shape.y[lo] + left * Math.sin(a)];
}

function rebuildCurves() {
  if (!path || !pair) { curves = []; return; }
  curves = state.pens.map(pen => { const [x, y] = penPoint(pen, pair.inner); return penCurve(path.poses, path.count, x, y); });
}

/* Runs on every change of the rolling. Preview means a slider is on the move. A
   count of changes stops an answer to an old question from being shown. */
let generation = 0;
function refresh(preview = false) {
  const asked = ++generation;
  closeNote = '';
  stopPlay();
  showProgress(null);
  closeIsIdle();
  const spec = specOf(state), { outer, inner } = currentPair(spec);
  const choice = chooseMethod(spec, outer, inner);
  if (choice.method === 'formula') {
    runner.cancel();
    /* On the move, the pens share a budget of points, so six pens stay as quick as one. */
    const limit = preview ? Math.min(QUALITY.preview.maxPoses, 72000 / state.pens.length) : undefined;
    adopt(formulaPath(spec, outer, inner, preview ? 'preview' : 'full', choice.overlaps, limit), spec);
    return;
  }
  runner.run({
    kind: 'walk', spec, quality: 'preview',
    onDone: ({ path: done }) => {
      if (asked !== generation) return;
      adopt(done, spec);
      if (preview) return;
      showProgress(0);
      runner.run({
        kind: 'walk', spec, quality: 'full',
        onProgress: showProgress,
        onDone: ({ path: full }) => {
          if (asked !== generation) return;
          showProgress(null);
          adopt(full, spec);
        },
      });
    },
  });
}

function adopt(next, spec) {
  path = next;
  path.spec = spec;
  rebuildCurves();
  fitIfFree();
  drawEverything();
  writeReadout();
  saveAddress();
}

function writeReadout() {
  if (!path) return;
  const words = describe(path, path.spec);
  $('state').textContent = words.state;
  $('detail').textContent = closeNote || words.detail;
}

function showProgress(share) {
  const bar = $('progress');
  bar.hidden = share === null;
  if (share !== null) bar.value = share;
}

/* ------- View ------- */

const stage = $('stage'), cvKept = $('kept'), cvCurves = $('curves'), cvShapes = $('shapes');
const ctxKept = cvKept.getContext('2d'), ctxCurves = cvCurves.getContext('2d'), ctxShapes = cvShapes.getContext('2d');
const view = { k: 1, cx: 0, cy: 0 };
const camera = { zoom: 1, panX: 0, panY: 0 };
let box = { minX: -20, maxX: 20, minY: -20, maxY: 20 };
let dpr = 1, cssH = 1;

const isDark = () => document.documentElement.dataset.theme === 'dark';
function look(scale = dpr) {
  const dark = isDark();
  return {
    scale, dark,
    bg: dark ? '#14151a' : '#f8f6f0',
    outer: dark ? 'rgba(235,232,222,0.75)' : 'rgba(40,38,32,0.7)',
    inner: dark ? 'rgba(235,232,222,0.85)' : 'rgba(40,38,32,0.8)',
    fill: dark ? 'rgba(235,232,222,0.07)' : 'rgba(40,38,32,0.06)',
    overlap: 'rgba(226,32,48,0.55)',
    penRing: dark ? '#14151a' : '#ffffff',
    snap: dark ? 'rgba(235,232,222,0.6)' : 'rgba(40,38,32,0.5)',
  };
}

function viewFrom(width, height, marginX, marginY) {
  const bw = box.maxX - box.minX || 1, bh = box.maxY - box.minY || 1;
  const k = Math.min((width - 2 * marginX) / bw, (height - 2 * marginY) / bh);
  return { k, cx: width / 2 - k * (box.minX + box.maxX) / 2, cy: height / 2 + k * (box.minY + box.maxY) / 2 };
}
function setView() {
  /* With the cards open, the picture keeps clear of the columns they stand in. */
  const open = !document.body.classList.contains('compact');
  const base = viewFrom(cvShapes.width, cvShapes.height, (open ? 256 : 14) * dpr, 14 * dpr);
  const mx = cvShapes.width / 2, my = cvShapes.height / 2;
  view.k = base.k * camera.zoom;
  view.cx = mx + (base.cx - mx) * camera.zoom + camera.panX * dpr;
  view.cy = my + (base.cy - my) * camera.zoom + camera.panY * dpr;
}

/* The picture's extent: the outer shape and everywhere the inner shape goes. */
function fitIfFree() {
  if (!pair || !path) return;
  const o = bounds(pair.outer), inner = pair.inner;
  let { minX, maxX, minY, maxY } = o;
  const d = path.poses, poseStep = Math.max(1, Math.floor(path.count / 300)), pointStep = Math.max(1, Math.floor(inner.n / 24));
  for (let k = 0; k < path.count; k += poseStep) {
    const i = k * 4, c = d[i], s = d[i + 1], tx = d[i + 2], ty = d[i + 3];
    for (let v = 0; v < inner.n; v += pointStep) {
      const x = c * inner.x[v] - s * inner.y[v] + tx, y = s * inner.x[v] + c * inner.y[v] + ty;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  box = { minX, maxX, minY, maxY };
  setView();
}

function resize() {
  cssH = stage.clientHeight;
  const width = stage.clientWidth;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  for (const canvas of [cvKept, cvCurves, cvShapes]) {
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
  }
  /* Cards fold where the corners have no room beside the picture. */
  const roomy = cssH >= 540 && (width - cssH) / 2 >= 230;
  if (roomy !== !document.body.classList.contains('compact')) {
    document.body.classList.toggle('compact', !roomy);
    for (const card of document.querySelectorAll('.card')) card.classList.remove('open');
    for (const fold of document.querySelectorAll('.fold')) fold.setAttribute('aria-expanded', 'false');
  }
  setView();
  drawEverything();
}

/* ------- Drawing ------- */

const penColours = (schemeName, dark) => SCHEMES[schemeName][dark ? 'dark' : 'light'];
const styleFor = (index, schemeName, rainbow, width, l) => ({
  colour: penColours(schemeName, l.dark)[index % MAX_PENS], rainbow, width, scale: l.scale, dark: l.dark,
});

function drawKept(ctx = ctxKept, v = view, l = look()) {
  if (ctx === ctxKept) ctx.clearRect(0, 0, cvKept.width, cvKept.height);
  for (const layer of kept) {
    layer.curves.forEach((pts, i) => strokeCurve(ctx, v, pts, 0, pts.length / 2 - 1, styleFor(i, layer.scheme, layer.rainbow, layer.width, l)));
  }
}
function drawCurves(upTo = Infinity) {
  ctxCurves.clearRect(0, 0, cvCurves.width, cvCurves.height);
  const l = look();
  curves.forEach((pts, i) => strokeCurve(ctxCurves, view, pts, 0, Math.min(upTo, pts.length / 2 - 1), styleFor(i, state.scheme, state.rainbow, state.width, l)));
}
function poseAt(index) {
  if (!path) return [1, 0, 0, 0];
  const i = Math.min(path.count - 1, Math.max(0, index)) * 4, d = path.poses;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}
function worldOf(point, pose) {
  const [c, s, tx, ty] = pose;
  return [c * point[0] - s * point[1] + tx, s * point[0] + c * point[1] + ty];
}
function drawOverlay() {
  const ctx = ctxShapes, width = cvShapes.width, height = cvShapes.height;
  ctx.clearRect(0, 0, width, height);
  if (!pair || !path || !state.show) return;
  const l = look(), pose = poseAt(play.active ? Math.floor(play.index) : 0);
  const red = state.overlap || path.nofit === true;
  drawShapes(ctx, view, pair.outer, pair.inner, pose, l, state.side, red, width, height);
  if (drag && drag.kind === 'pen') {
    for (const target of snapTargets()) {
      const [x, y] = toPx(view, ...worldOf(target.point, pose));
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = l.snap;
      ctx.fill();
    }
  }
  const colours = penColours(state.scheme, l.dark);
  state.pens.forEach((pen, i) => {
    const [wx, wy] = worldOf(penPoint(pen, pair.inner), pose);
    drawPen(ctx, view, wx, wy, state.rainbow ? hue(i / state.pens.length, l.dark) : colours[i % MAX_PENS], l);
  });
}
function drawEverything() {
  if (!pair) return;
  setView();
  drawKept();
  if (play.active) { drawCurves(Math.floor(play.index)); play.drawn = Math.floor(play.index); }
  else drawCurves();
  drawOverlay();
}
let frameWanted = 0;
const drawSoon = () => {
  if (frameWanted) return;
  frameWanted = requestAnimationFrame(() => { frameWanted = 0; drawEverything(); });
};

/* ------- Play ------- */

const INTRO_SECONDS = 25;
const play = { active: false, paused: false, index: 0, drawn: 0, last: 0, frame: 0, intro: false };

function startPlay(intro = false) {
  if (!path) return;
  if (!play.active) { play.index = 0; play.drawn = 0; }
  play.active = true; play.paused = false; play.intro = intro;
  play.last = performance.now();
  cancelAnimationFrame(play.frame);
  drawEverything();
  play.frame = requestAnimationFrame(tick);
  syncTransport();
}
function pausePlay() {
  play.paused = true;
  cancelAnimationFrame(play.frame);
  syncTransport();
}
function stopPlay() {
  cancelAnimationFrame(play.frame);
  const was = play.active;
  play.active = false; play.paused = false; play.intro = false;
  if (was) syncTransport();
}
function tick(now) {
  if (!play.active || play.paused) return;
  const dt = Math.min(0.1, (now - play.last) / 1000);
  play.last = now;
  const lapsShown = Math.max(path.laps || 1, 1e-6);
  /* The opening play takes at most INTRO_SECONDS, however many laps the curve has. */
  const secondsPerLap = play.intro ? Math.min(state.secondsPerLap, INTRO_SECONDS / lapsShown) : state.secondsPerLap;
  play.index += path.count / lapsShown / secondsPerLap * dt;
  const target = Math.min(path.count - 1, Math.floor(play.index));
  if (target > play.drawn) {
    const l = look();
    curves.forEach((pts, i) => strokeCurve(ctxCurves, view, pts, play.drawn, target, styleFor(i, state.scheme, state.rainbow, state.width, l)));
    play.drawn = target;
  }
  drawOverlay();
  if (play.index >= path.count - 1) {
    stopPlay();
    drawEverything();
    return;
  }
  play.frame = requestAnimationFrame(tick);
}
function drawAll() {
  stopPlay();
  drawEverything();
}
function syncTransport() {
  const running = play.active && !play.paused;
  $('play').textContent = running ? 'Pause' : 'Play';
  $('play').setAttribute('aria-label', running ? 'Pause' : 'Play');
  $('all').disabled = !play.active;
  $('clear').disabled = kept.length === 0;
}

/* ------- Pens: dragging, tapping, snapping ------- */

function snapTargets() {
  const inner = pair.inner, list = [{ point: [0, 0], pen: { kind: 'centre' } }];
  inner.foci.forEach((point, i) => list.push({ point, pen: { kind: 'focus', i } }));
  cornersOf(inner).forEach((point, i) => list.push({ point, pen: { kind: 'corner', i } }));
  return list;
}
const coarse = matchMedia('(pointer: coarse)');
const eventToWorld = event => {
  const r = cvShapes.getBoundingClientRect(), px = (event.clientX - r.left) * dpr, py = (event.clientY - r.top) * dpr;
  return [(px - view.cx) / view.k, (view.cy - py) / view.k];
};
function bodyOf(world) {
  const [c, s, tx, ty] = poseAt(0), dx = world[0] - tx, dy = world[1] - ty;
  return [c * dx + s * dy, -s * dx + c * dy];
}
function nearestRim(p) {
  const shape = pair.inner;
  let best = Infinity, arc = 0;
  for (let i = 0; i < shape.n; i++) {
    const a = shape.ang[i], ux = Math.cos(a), uy = Math.sin(a), dx = p[0] - shape.x[i], dy = p[1] - shape.y[i];
    const t = Math.max(0, Math.min(shape.len[i], dx * ux + dy * uy));
    const d = Math.hypot(dx - t * ux, dy - t * uy);
    if (d < best) { best = d; arc = shape.cum[i] + t; }
  }
  return { distance: best, u: arc / shape.P };
}
function penFromBody(p) {
  const reach = (coarse.matches ? 16 : 9) * dpr / view.k;
  let best = null, bestD = reach;
  for (const target of snapTargets()) {
    const d = Math.hypot(p[0] - target.point[0], p[1] - target.point[1]);
    if (d < bestD) { bestD = d; best = target.pen; }
  }
  if (best) return best;
  const rim = nearestRim(p);
  if (rim.distance < reach * 0.8) return { kind: 'rim', u: rim.u };
  return { kind: 'free', x: p[0] / pair.inner.P, y: p[1] / pair.inner.P };
}
function penAt(event) {
  if (!state.show || !pair) return -1;
  const r = cvShapes.getBoundingClientRect(), px = (event.clientX - r.left) * dpr, py = (event.clientY - r.top) * dpr;
  const pose = poseAt(0), reach = (coarse.matches ? 22 : 12) * dpr;
  let best = -1, bestD = reach;
  state.pens.forEach((pen, i) => {
    const [x, y] = toPx(view, ...worldOf(penPoint(pen, pair.inner), pose)), d = Math.hypot(x - px, y - py);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

let drag = null;
const pointers = new Map();
let pinch = null;

function closeOpenCards() {
  let any = false;
  for (const card of document.querySelectorAll('.card.open')) {
    card.classList.remove('open');
    card.querySelector('.fold').setAttribute('aria-expanded', 'false');
    any = true;
  }
  return any;
}

cvShapes.addEventListener('pointerdown', event => {
  cvShapes.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: camera.zoom };
    drag = null;
    return;
  }
  if (closeOpenCards()) { drag = { kind: 'none' }; return; }
  /* A press during play goes to the whole curve, with the shape parked for its pens. */
  if (play.active) { drawAll(); drag = { kind: 'none' }; return; }
  const index = penAt(event);
  if (index >= 0) {
    drag = { kind: 'pen', index, moved: false, x: event.clientX, y: event.clientY };
    cvShapes.classList.add('dragging');
    drawOverlay();
  } else {
    drag = { kind: 'space', moved: false, x: event.clientX, y: event.clientY, panX: camera.panX, panY: camera.panY };
  }
});

cvShapes.addEventListener('pointermove', event => {
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, [event.clientX, event.clientY]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    camera.zoom = Math.min(40, Math.max(0.25, pinch.zoom * d / (pinch.distance || 1)));
    drawSoon();
    return;
  }
  if (!drag) {
    if (event.pointerType === 'mouse') cvShapes.classList.toggle('on-pen', penAt(event) >= 0);
    return;
  }
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  if (drag.kind === 'none') return;
  drag.moved = true;
  if (drag.kind === 'pen') {
    state.pens[drag.index] = penFromBody(bodyOf(eventToWorld(event)));
    const [x, y] = penPoint(state.pens[drag.index], pair.inner);
    curves[drag.index] = penCurve(path.poses, path.count, x, y);
    drawSoon();
  } else {
    camera.panX = drag.panX + dx;
    camera.panY = drag.panY + dy;
    drawSoon();
  }
});

function pointerEnd(event) {
  pointers.delete(event.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  const was = drag;
  drag = null;
  cvShapes.classList.remove('dragging');
  if (!was || was.kind === 'none') return;
  if (event.type === 'pointerup' && !was.moved) {
    if (was.kind === 'pen' && state.pens.length > 1) {
      state.pens.splice(was.index, 1);
      rebuildCurves();
    } else if (was.kind === 'space' && state.pens.length < MAX_PENS && state.show) {
      state.pens.push(penFromBody(bodyOf(eventToWorld(event))));
      rebuildCurves();
    }
  }
  saveAddress();
  drawEverything();
}
cvShapes.addEventListener('pointerup', pointerEnd);
cvShapes.addEventListener('pointercancel', pointerEnd);

cvShapes.addEventListener('wheel', event => {
  event.preventDefault();
  zoomBy(Math.exp(-event.deltaY * 0.0016), event.clientX, event.clientY);
}, { passive: false });

function zoomBy(factor, clientX, clientY) {
  const r = cvShapes.getBoundingClientRect();
  const px = clientX === undefined ? r.width / 2 : clientX - r.left;
  const py = clientY === undefined ? r.height / 2 : clientY - r.top;
  const next = Math.min(40, Math.max(0.25, camera.zoom * factor)), applied = next / camera.zoom;
  camera.panX = (camera.panX - (px - r.width / 2)) * applied + (px - r.width / 2);
  camera.panY = (camera.panY - (py - r.height / 2)) * applied + (py - r.height / 2);
  camera.zoom = next;
  drawSoon();
}
function resetCamera() { camera.zoom = 1; camera.panX = 0; camera.panY = 0; }

/* ------- Sliders ------- */

/* A log slider runs 0 to 1000, and a plain one uses the real values. */
function makeSlider(parent, { label, value, min, max, step, log, format, onInput, onChange }) {
  const wrap = document.createElement('label');
  wrap.className = 'slider';
  const name = document.createElement('span');
  name.textContent = label;
  const out = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  if (log) { input.min = 0; input.max = 1000; input.step = 1; }
  else { input.min = min; input.max = max; input.step = step; }
  const toSlider = v => log ? 1000 * Math.log(v / min) / Math.log(max / min) : v;
  const fromSlider = () => log ? min * Math.pow(max / min, +input.value / 1000) : +input.value;
  const paint = v => { out.textContent = format ? format(v) : v; };
  input.value = toSlider(value);
  paint(value);
  input.addEventListener('input', () => { const v = fromSlider(); paint(v); onInput(v); });
  input.addEventListener('change', () => onChange?.(fromSlider()));
  wrap.append(name, out, input);
  parent.append(wrap);
  return { set(v) { input.value = toSlider(v); paint(v); } };
}

const sliders = {};
const decimals = n => v => (+v).toFixed(n);

/* Heavy work follows a drag at reduced detail, then runs in full on release. */
let dragFrame = 0;
function changing() {
  endFirstPlay();
  $('preset').value = '';
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(() => { dragFrame = 0; refresh(true); });
}
function changed() {
  cancelAnimationFrame(dragFrame);
  dragFrame = 0;
  refresh(false);
}

function buildShapeSliders(which) {
  const holder = $(which + '-sliders'), shape = state[which];
  holder.replaceChildren();
  sliders[which] = {};
  sliders[which].size = makeSlider(holder, {
    label: 'Size', value: shape.size, min: which === 'outer' ? 40 : 4, max: 480, log: true, format: decimals(1),
    onInput: v => { shape.size = v; changing(); }, onChange: changed,
  });
  for (const p of SHAPES[shape.type].params) {
    sliders[which][p.key] = makeSlider(holder, {
      label: p.label, value: shape.params[p.key] ?? p.value, min: p.min, max: p.max, step: p.step,
      format: p.step >= 1 ? undefined : decimals(2),
      onInput: v => { shape.params[p.key] = v; changing(); }, onChange: changed,
    });
  }
  $(which + '-name').textContent = (which === 'outer' ? 'Outer: ' : 'Inner: ') + SHAPES[shape.type].label.toLowerCase();
}

function syncControls() {
  $('outer-type').value = state.outer.type;
  $('inner-type').value = state.inner.type;
  $('side-in').setAttribute('aria-pressed', state.side > 0);
  $('side-out').setAttribute('aria-pressed', state.side < 0);
  $('overlap').checked = state.overlap;
  $('scheme').value = state.scheme;
  $('rainbow').checked = state.rainbow;
  $('show').checked = state.show;
  buildShapeSliders('outer');
  buildShapeSliders('inner');
  sliders.laps?.set(state.laps);
  sliders.width?.set(state.width);
  syncTransport();
}

/* ------- Controls ------- */

function endFirstPlay() {
  if (play.intro) drawAll();
}

function applyPreset(preset) {
  state.outer = clone(preset.outer);
  state.inner = clone(preset.inner);
  for (const shape of [state.outer, state.inner]) shape.params = { ...defaultParams(shape.type), ...shape.params };
  state.side = preset.side || 1;
  state.overlap = false;
  state.laps = preset.laps || 100;
  state.pens = clone(preset.pens);
  $('preset').value = preset.key;
  resetCamera();
  syncControls();
  refresh(false);
}

const pick = list => list[Math.floor(Math.random() * list.length)];
function surprise() {
  /* Random pairs, keeping the first that does more than sit there. */
  const types = Object.keys(SHAPES);
  for (let tries = 0; tries < 12; tries++) {
    const make = type => {
      const params = {};
      for (const p of SHAPES[type].params) {
        const v = p.min + Math.random() * (p.max - p.min);
        params[p.key] = p.step >= 1 ? Math.round(v) : +v.toFixed(3);
      }
      return { type, size: 120, params };
    };
    const outer = make(pick(types)), inner = make(pick(types));
    inner.size = 12 + Math.floor(Math.random() * 50);
    const spec = { outer, inner, side: 1, overlap: false, laps: 60 };
    const built = buildPair(spec, 400);
    if (chooseMethod(spec, built.outer, built.inner).method !== 'formula' && tries < 9) continue;
    state.outer = outer; state.inner = inner; state.side = 1; state.overlap = false; state.laps = 60;
    state.pens = [{ kind: 'free', x: 0.1 * Math.cos(tries), y: 0.1 * Math.sin(tries) }];
    if (Math.random() < 0.5) state.pens.push({ kind: 'rim', u: Math.random() });
    break;
  }
  resetCamera();
  syncControls();
  refresh(false);
}

function fillSelect(select, entries) {
  for (const [value, label] of entries) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

function setUpControls() {
  const shapeEntries = Object.entries(SHAPES).map(([k, v]) => [k, v.label]);
  fillSelect($('preset'), [['', 'Your own'], ...PRESETS.map(p => [p.key, p.label]), ['surprise', 'Surprise me']]);
  fillSelect($('outer-type'), shapeEntries);
  fillSelect($('inner-type'), shapeEntries);
  fillSelect($('scheme'), Object.entries(SCHEMES).map(([k, v]) => [k, v.label]));

  $('preset').addEventListener('change', event => {
    endFirstPlay();
    const key = event.target.value;
    if (key === 'surprise') { surprise(); $('preset').value = ''; }
    else { const p = PRESETS.find(x => x.key === key); if (p) applyPreset(p); }
  });
  for (const which of ['outer', 'inner']) {
    $(which + '-type').addEventListener('change', event => {
      endFirstPlay();
      const type = event.target.value;
      state[which] = { type, size: state[which].size, params: defaultParams(type) };
      $('preset').value = '';
      buildShapeSliders(which);
      refresh(false);
    });
  }
  const setSide = side => () => {
    endFirstPlay();
    if (state.side === side) return;
    state.side = side;
    $('preset').value = '';
    $('side-in').setAttribute('aria-pressed', side > 0);
    $('side-out').setAttribute('aria-pressed', side < 0);
    resetCamera();
    refresh(false);
  };
  $('side-in').addEventListener('click', setSide(1));
  $('side-out').addEventListener('click', setSide(-1));
  $('overlap').addEventListener('change', event => { endFirstPlay(); state.overlap = event.target.checked; $('preset').value = ''; refresh(false); });

  sliders.laps = makeSlider($('lap-slider'), {
    label: 'Laps', value: state.laps, min: 1, max: 500, log: true, format: v => Math.round(v),
    onInput: v => { state.laps = Math.round(v); changing(); }, onChange: changed,
  });
  $('close').addEventListener('click', pressClose);

  $('scheme').addEventListener('change', event => { endFirstPlay(); state.scheme = event.target.value; saveAddress(); drawEverything(); });
  $('rainbow').addEventListener('change', event => { endFirstPlay(); state.rainbow = event.target.checked; saveAddress(); drawEverything(); });
  sliders.width = makeSlider($('width-slider'), {
    label: 'Line width', value: state.width, min: 0.25, max: 5, step: 0.05, format: decimals(2),
    onInput: v => { endFirstPlay(); state.width = v; drawSoon(); saveAddress(); },
  });
  $('show').addEventListener('change', event => { endFirstPlay(); state.show = event.target.checked; saveAddress(); drawOverlay(); });

  $('zoom-in').addEventListener('click', () => zoomBy(1.3));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.3));
  $('zoom-fit').addEventListener('click', () => { resetCamera(); drawSoon(); });
  $('png').addEventListener('click', savePng);
  $('svg').addEventListener('click', saveSvg);
  $('link').addEventListener('click', copyLink);

  const speedOf = u => 30 * Math.pow(0.25 / 30, u / 1000);
  $('speed').value = 1000 * Math.log(state.secondsPerLap / 30) / Math.log(0.25 / 30);
  $('speed').addEventListener('input', event => { state.secondsPerLap = speedOf(+event.target.value); });
  $('play').addEventListener('click', event => {
    if (play.active && !play.paused) pausePlay();
    else startPlay();
    event.target.blur();
  });
  $('all').addEventListener('click', drawAll);
  $('keep').addEventListener('click', keepLayer);
  $('clear').addEventListener('click', () => { kept.length = 0; drawKept(); saveAddress(); syncTransport(); });

  for (const fold of document.querySelectorAll('.fold')) {
    fold.addEventListener('click', () => {
      const card = fold.closest('.card'), opening = !card.classList.contains('open');
      closeOpenCards();
      if (opening) { card.classList.add('open'); fold.setAttribute('aria-expanded', 'true'); }
    });
  }

  /* The first touch of any control during the opening play goes to the whole curve. */
  document.addEventListener('pointerdown', event => {
    if (play.intro && event.target.closest('.card')) endFirstPlay();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.target.matches('input, select, textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'f' || event.key === 'F') toggleFullscreen();
    else if (event.key === ' ' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      $('play').click();
    }
  });

  const fs = $('fullscreen'), enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  fs.hidden = !enabled;
  fs.addEventListener('click', () => { toggleFullscreen(); fs.blur(); });

  Theme.wireThemeToggle();
  new MutationObserver(() => drawEverything()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function toggleFullscreen() {
  const root = document.documentElement;
  const active = document.fullscreenElement || document.webkitFullscreenElement;
  const call = active ? (document.exitFullscreen || document.webkitExitFullscreen) : (root.requestFullscreen || root.webkitRequestFullscreen);
  if (!call) return;
  const result = call.call(active ? document : root);
  if (result && result.catch) result.catch(() => {});
}

/* ------- Close ------- */

function closeIsIdle() {
  const button = $('close');
  button.classList.remove('busy');
  button.textContent = 'Close';
}

function pressClose() {
  endFirstPlay();
  const button = $('close');
  if (button.classList.contains('busy')) {
    runner.cancel();
    closeIsIdle();
    showProgress(null);
    return;
  }
  const spec = specOf(state), { outer, inner } = currentPair(spec);
  if (chooseMethod(spec, outer, inner).method === 'formula') {
    const result = closeBySize(state.outer.size, state.inner.size, state.laps);
    state.inner.size = result.size;
    sliders.inner.size.set(result.size);
    refresh(false);
    return;
  }
  button.classList.add('busy');
  button.textContent = 'Stop';
  showProgress(0);
  runner.run({
    kind: 'close', spec, quality: 'full',
    onProgress: showProgress,
    onDone: ({ result }) => {
      closeIsIdle();
      showProgress(null);
      if (result.ok) {
        state.inner.size = result.size;
        sliders.inner.size.set(result.size);
        refresh(false);
      } else {
        closeNote = result.reason === 'stuck' ? 'Stuck, so it cannot close' : 'No closing size near here';
        writeReadout();
      }
    },
  });
}

/* ------- Layers ------- */

function keepLayer() {
  endFirstPlay();
  if (!curves.length) return;
  if (kept.length >= 12) kept.shift();
  kept.push({ curves: curves.slice(), scheme: state.scheme, rainbow: state.rainbow, width: state.width, fields: layerFields(state) });
  drawKept();
  saveAddress();
  syncTransport();
}

/* Rebuilds kept layers from the address, one at a time, in a worker of their own. */
async function restoreLayers(text) {
  let list = [];
  try { list = JSON.parse(text); } catch { return; }
  if (!Array.isArray(list)) return;
  for (const f of list.slice(0, 12)) {
    const settings = {
      outer: decodeShape(f.o, opening.outer), inner: decodeShape(f.i, opening.inner),
      side: f.s < 0 ? -1 : 1, overlap: f.v === 1, laps: Math.round(clampNumber(f.n, 1, 500, 100)),
    };
    const pens = decodePens(f.p);
    const spec = specOf(settings), built = buildPair(spec, QUALITY.full.detail);
    const choice = chooseMethod(spec, built.outer, built.inner);
    let found;
    if (choice.method === 'formula') found = formulaPath(spec, built.outer, built.inner, 'full', choice.overlaps);
    else {
      found = await new Promise(resolve => {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => { if (data.type === 'done') { worker.terminate(); resolve(data.path); } };
        worker.onerror = () => { worker.terminate(); resolve(null); };
        worker.postMessage({ id: 1, kind: 'walk', spec, quality: 'full' });
      });
    }
    if (!found) continue;
    kept.push({
      curves: pens.map(pen => { const [x, y] = penPoint(pen, built.inner); return penCurve(found.poses, found.count, x, y); }),
      scheme: SCHEMES[f.c] ? f.c : 'bright', rainbow: f.r === 1, width: clampNumber(f.w, 0.25, 5, 1.2), fields: f,
    });
    drawKept();
    syncTransport();
  }
}

/* ------- Saving ------- */

function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* A picture at no less than 3,000 pixels across, whatever the window. */
function savePng() {
  endFirstPlay();
  const scale = Math.max(1, 3000 / Math.max(cvShapes.width, cvShapes.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cvShapes.width * scale);
  canvas.height = Math.round(cvShapes.height * scale);
  const ctx = canvas.getContext('2d'), l = look(dpr * scale);
  const v = { k: view.k * scale, cx: view.cx * scale, cy: view.cy * scale };
  ctx.fillStyle = l.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawKept(ctx, v, l);
  curves.forEach((pts, i) => strokeCurve(ctx, v, pts, 0, pts.length / 2 - 1, styleFor(i, state.scheme, state.rainbow, state.width, l)));
  if (state.show) {
    const pose = poseAt(0);
    drawShapes(ctx, v, pair.outer, pair.inner, pose, l, state.side, state.overlap || path.nofit === true, canvas.width, canvas.height);
    state.pens.forEach((pen, i) => {
      const [wx, wy] = worldOf(penPoint(pen, pair.inner), pose);
      drawPen(ctx, v, wx, wy, penColours(state.scheme, l.dark)[i % MAX_PENS], l);
    });
  }
  canvas.toBlob(blob => download(blob, 'rolling-shapes.png'), 'image/png');
}

function saveSvg() {
  endFirstPlay();
  const W = 1000, H = Math.round(W * cvShapes.height / cvShapes.width), scale = W / cvShapes.width;
  const v = { k: view.k * scale, cx: view.cx * scale, cy: view.cy * scale }, l = look(1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`];
  parts.push(`<rect width="${W}" height="${H}" fill="${l.bg}"/>`, '<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
  const writeCurve = (pts, style) => {
    const width = (style.width * scale * dpr).toFixed(3);
    if (!style.rainbow) { parts.push(`<path stroke="${style.colour}" stroke-width="${width}" d="${svgPath(pts, v)}"/>`); return; }
    const n = pts.length / 2, step = Math.max(1, Math.floor(n / 128));
    for (let a = 0; a < n - 1; a += step) {
      parts.push(`<path stroke="${hue(a / n, l.dark)}" stroke-width="${width}" d="${svgPath(pts, v, a, Math.min(n - 1, a + step))}"/>`);
    }
  };
  for (const layer of kept) layer.curves.forEach((pts, i) => writeCurve(pts, styleFor(i, layer.scheme, layer.rainbow, layer.width, l)));
  curves.forEach((pts, i) => writeCurve(pts, styleFor(i, state.scheme, state.rainbow, state.width, l)));
  if (state.show) {
    const pose = poseAt(0);
    parts.push(`<path stroke="${l.outer}" stroke-width="1.2" d="${svgOutline(pair.outer, v)}"/>`);
    parts.push(`<path stroke="${l.inner}" stroke-width="1.2" d="${svgOutline(pair.inner, v, pose)}"/>`);
  }
  parts.push('</g></svg>');
  download(new Blob([parts.join('')], { type: 'image/svg+xml' }), 'rolling-shapes.svg');
}

async function copyLink() {
  writeAddress();
  const button = $('link');
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Press copy';
  }
  setTimeout(() => { button.textContent = 'Copy link'; }, 1400);
}

/* ------- Start ------- */

const hadAddress = readAddress();
setUpControls();
syncControls();
if (!hadAddress) $('preset').value = opening.key;
new ResizeObserver(resize).observe(stage);
/* Our own address writes use replaceState, which fires no hashchange, so any event
   here is a visitor's change. */
window.addEventListener('hashchange', () => {
  readAddress();
  syncControls();
  refresh(false);
});

resize();
refresh(false);
if (typeof hadAddress === 'string') restoreLayers(hadAddress);
if (!hadAddress && !matchMedia('(prefers-reduced-motion: reduce)').matches) startPlay(true);

window.addEventListener('pagehide', () => runner.worker.terminate());
