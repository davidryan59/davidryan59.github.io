/* The single source of timing for the Rolling Shapes video: every scene, slider,
   pen, layer and caption, in plain seconds. Each frame is a pure function of its
   time, so a still at any second costs one frame. */

export const FPS = 60, LENGTH = 45, FADE = 0.5;

/* Half a sine wave between keys, and flat outside them. */
export function tween(track, t) {
  if (t <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i];
    if (t <= t1) {
      const [t0, v0] = track[i - 1], u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) / 2;
    }
  }
  return track[track.length - 1][1];
}

const TAU = Math.PI * 2;
const flatPen = r => (size) => [r * size / TAU, 0];

/* The share card's curve: 182/51 closes after 51 laps with 7-fold symmetry, and this
   rim position puts a cusp over the bottom edge's midpoint. */
const RING_SIZE = 120 * 51 / 182, RING_U = 0.436674;
const ringPen = size => {
  const r = size / TAU, a = RING_U * TAU;
  return [r * Math.cos(a), r * Math.sin(a)];
};
const ringOuter = round => ({ type: 'polygon', size: 120, params: { sides: 7, round, bulge: 0 } });

/* A slider on show: its label, range, and which way the value maps along the track. */
const SLIDERS = {
  size: { label: 'Inner size', min: 4, max: 80, log: true, digits: 1 },
  rounding: { label: 'Corner rounding', min: 0, max: 1, digits: 2 },
  depth: { label: 'Petal depth', min: 0.02, max: 0.6, digits: 2 },
  pen: { label: 'Pen position', min: 0, max: 1.6, digits: 2, pen: true },
  waist: { label: 'Waist', min: 0.05, max: 0.7, digits: 2 },
};

const SIX = [0.25, 0.45, 0.65, 0.85, 1.05, 1.3];

const SCENES = [
  {
    /* Opens on the ring, then its size and rounding sweep. */
    from: 0, to: 13.75,
    build: t => {
      const size = tween([[5.2, RING_SIZE], [6.9, 44.7], [8.3, 19.3], [9.6, RING_SIZE]], t);
      const round = tween([[10, 0.5], [11.6, 1], [13.1, 0.62]], t);
      return { outer: ringOuter(round), inner: { type: 'circle', size, params: {} }, laps: 51, rainbow: true, pens: [{ point: ringPen(size) }],
        roll: t < 5 ? tween([[0, 0], [4.6, 0.72]], t) : null, parked: t >= 4.4 ? Math.min(1, (t - 4.4) / 0.5) : 0,
        slider: t >= 4.9 && t < 9.9 ? { key: 'size', value: size, from: 4.9, to: 9.9 } : t >= 9.9 ? { key: 'rounding', value: round, from: 9.9, to: 13.5 } : null };
    },
  },
  {
    /* A flower: its depth sweeps, then the pen travels out along its arm. */
    from: 13.25, to: 24.75,
    build: t => {
      const depth = tween([[14, 0.03], [15.6, 0.2], [17, 0.09]], t);
      const reach = tween([[18, 0.7], [19.6, 0], [21.6, 1], [23.2, 1.5], [24.4, 1.22]], t);
      const size = 120 * 8 / 41;
      return { outer: { type: 'flower', size: 120, params: { petals: 5, depth } }, inner: { type: 'circle', size, params: {} }, laps: 8, rainbow: true,
        pens: [{ point: flatPen(reach)(size) }], parked: 1,
        slider: t < 17.6 ? { key: 'depth', value: depth, from: 13.5, to: 17.5 } : { key: 'pen', value: reach, from: 17.6, to: 24.6, penDrag: true } };
    },
  },
  {
    /* Six pens, one after another. Then the size moves with all six on. */
    from: 24.25, to: 34.25,
    build: t => {
      const waist = tween([[31.2, 0.45], [32.6, 0.3], [33.9, 0.45]], t);
      const pens = SIX.map((r, i) => ({ point: flatPen(r)(50), colour: i, drawn: tween([[25 + i, 0], [26 + i, 1]], t), born: 25 + i }))
        .filter(p => t >= p.born);
      return { outer: { type: 'peanut', size: 120, params: { waist } }, inner: { type: 'circle', size: 50, params: {} }, laps: 5, rainbow: false, pens, parked: 1,
        tap: t < 31 ? 25 + Math.floor(t - 25) : null,
        slider: t >= 31 ? { key: 'waist', value: waist, from: 31, to: 34.1 } : null };
    },
  },
  {
    /* Layers: keep, change the size, keep again. */
    from: 33.75, to: 41.75,
    build: t => {
      /* Each key has 7 dividing its trips, so every layer has the flower's 7-fold symmetry. */
      const keys = [[21, 5], [49, 11], [28, 5], [63, 11]].map(([a, b]) => ({ size: 120 * b / a, laps: b }));
      const size = tween([[34.6, keys[0].size], [35.9, keys[1].size], [37.2, keys[2].size], [38.5, keys[3].size]], t);
      const kept = [];
      [35.1, 36.4, 37.7, 39].forEach((at, i) => { if (t >= at) kept.push({ size: keys[i].size, laps: keys[i].laps, colour: i }); });
      return { outer: { type: 'flower', size: 120, params: { petals: 7, depth: 0.07 } }, inner: { type: 'circle', size, params: {} }, laps: 11, rainbow: false,
        pens: t < 39 ? [{ point: flatPen(0.95)(size), colour: kept.length }] : [], kept, keepPen: 0.95, parked: t < 39 ? 1 : Math.max(0, 1 - (t - 39) / 0.4),
        slider: t < 39.2 ? { key: 'size', value: size, from: 33.9, to: 39.2 } : null,
        keepPress: [35.1, 36.4, 37.7, 39].find(at => t >= at - 0.25 && t < at + 0.25) ?? null };
    },
  },
  {
    /* Back to the first frame, so the loop joins. */
    from: 41.25, to: LENGTH + 1,
    build: () => ({ outer: ringOuter(0.5), inner: { type: 'circle', size: RING_SIZE, params: {} }, laps: 51, rainbow: true, pens: [{ point: ringPen(RING_SIZE) }], parked: 1, slider: null }),
  },
];

const CAPTIONS = [
  { from: -1, to: 4.6, main: 'Rolling Shapes', small: 'A pen on one shape, rolling inside another', title: true },
  { from: 5.1, to: 9.8, main: 'Move one slider', small: 'The whole pattern redraws as you drag' },
  { from: 10.1, to: 17.4, main: 'Reshape either shape', small: 'Corners, petals, waists, sides and more' },
  { from: 17.7, to: 24.5, main: 'Drag the pen anywhere', small: 'Inside, on the rim, or out on an arm' },
  { from: 24.8, to: 33.8, main: 'Add up to six pens', small: 'Each one draws in its own colour' },
  { from: 34.1, to: 40.6, main: 'Keep a layer, change a slider', small: 'Layers stack into one picture' },
  { from: 41, to: 44.1, main: 'Try it yourself', small: 'drbuild.uk/roll-shapes' },
  { from: 44.5, to: LENGTH + 1, main: 'Rolling Shapes', small: 'A pen on one shape, rolling inside another', title: true },
];

export const ADDRESS = 'drbuild.uk/roll-shapes';
export { SLIDERS };

export function scenesAt(t) {
  const out = [];
  for (const s of SCENES) {
    if (t < s.from || t >= s.to) continue;
    const fadeIn = s.from <= 0 ? 1 : Math.min(1, (t - s.from) / FADE), fadeOut = s.to > LENGTH ? 1 : Math.min(1, (s.to - t) / FADE);
    const e = u => (1 - Math.cos(Math.PI * u)) / 2;
    out.push({ alpha: e(fadeIn) * e(fadeOut), ...s.build(t) });
  }
  return out;
}

export function captionsAt(t) {
  return CAPTIONS.map(c => {
    const u = Math.min(1, Math.min(t - c.from, c.to - t) / 0.3);
    return u > 0 ? { ...c, alpha: (1 - Math.cos(Math.PI * u)) / 2 } : null;
  }).filter(Boolean);
}
