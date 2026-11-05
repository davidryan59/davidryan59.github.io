/* The formula method, and the choice between the two methods.

   The placing rule: the contact points meet, the tangents line up, and rolling
   moves both contact points by equal arc length. Each pose is a direct
   calculation from the two arc positions. Rolling outside uses the inner shape's
   outline traversed backwards, so the same code serves both sides. A corner is a
   pivot on the contact point, with no travel. */

import { TAU, reversed, depthInside, isConvex } from './shapes.js';

/* A growing list of poses: cos, sin, tx, ty, in single precision. A path needs no
   more, and it crosses from a worker cheaply. */
export class PoseList {
  constructor(capacity = 4096) { this.data = new Float32Array(capacity * 4); this.count = 0; }
  push(c, s, tx, ty) {
    if ((this.count + 1) * 4 > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const i = this.count++ * 4, d = this.data;
    d[i] = c; d[i + 1] = s; d[i + 2] = tx; d[i + 3] = ty;
  }
  /* Keeps every second pose, and always the last. */
  halve() {
    const d = this.data;
    let m = 0;
    for (let k = 0; k < this.count; k += 2, m++) d.copyWithin(m * 4, k * 4, k * 4 + 4);
    if ((this.count - 1) % 2) { d.copyWithin(m * 4, (this.count - 1) * 4, this.count * 4); m++; }
    this.count = m;
  }
  trimmed() { return this.data.subarray(0, this.count * 4).slice(); }
}

/* The forward-traversed outline for a side: +1 inside, -1 outside. */
export const forSide = (inner, side) => side > 0 ? inner : reversed(inner);

/* Poses for a number of laps of the contact round the outer shape. maxPoses caps
   the smooth samples. Corner pivots come on top. */
export function formulaPoses(outer, inner, laps, { maxPoses = 400000, perOuter = 1200, perInner = 500 } = {}) {
  const total = laps * outer.P;
  const wanted = Math.ceil(total / Math.min(outer.P / perOuter, inner.P / perInner));
  const count = Math.max(2, Math.min(maxPoses, wanted));
  const list = new PoseList(Math.min(count + 64, 1 << 20));
  const ds = total / count;

  let io = 0, ii = 0, uo = 0, ui = 0, s = 0;
  const place = (angle) => {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const ox = outer.x[io], oy = outer.y[io], oa = outer.ang[io];
    const ix = inner.x[ii], iy = inner.y[ii], ia = inner.ang[ii];
    const px = ox + uo * Math.cos(oa), py = oy + uo * Math.sin(oa);
    const qx = ix + ui * Math.cos(ia), qy = iy + ui * Math.sin(ia);
    list.push(c, sn, px - (c * qx - sn * qy), py - (sn * qx + c * qy));
  };
  const angleNow = () => {
    const wo = uo / outer.len[io], wi = ui / inner.len[ii];
    const to = outer.thA[io] + wo * (outer.thB[io] - outer.thA[io]);
    const ti = inner.thA[ii] + wi * (inner.thB[ii] - inner.thA[ii]);
    return to - ti;
  };

  place(angleNow());
  for (let k = 1; k <= count; k++) {
    const target = k * ds;
    for (;;) {
      const restO = outer.len[io] - uo, restI = inner.len[ii] - ui, d = Math.min(restO, restI);
      if (s + d > target) break;
      const before = (uo += d, ui += d, s += d, angleNow());
      let jump = 0;
      if (restO <= d) {
        const next = (io + 1) % outer.n;
        if (outer.sharp[next]) jump += outer.turn[next];
        io = next; uo = 0;
      }
      if (restI <= d) {
        const next = (ii + 1) % inner.n;
        if (inner.sharp[next]) jump -= inner.turn[next];
        ii = next; ui = 0;
      }
      if (jump !== 0) {
        const steps = Math.max(1, Math.ceil(Math.abs(jump) / 0.05));
        for (let j = 0; j <= steps; j++) place(before + jump * j / steps);
      }
    }
    const d = target - s;
    uo += d; ui += d; s = target;
    place(angleNow());
  }
  return { poses: list.trimmed(), count: list.count };
}

/* Test points on a shape: a coarse ring, every corner, and a margin. A coarse point
   within the margin of a touch makes its neighbours count too, so a touch between
   coarse points still shows at full detail. */
export function testPoints(shape, count) {
  const n = shape.n, picks = new Set();
  const stride = Math.max(1, Math.floor(n / count));
  for (let i = 0; i < n; i += stride) picks.add(i);
  for (let i = 0; i < n; i++) if (shape.sharp[i]) picks.add(i);
  const index = Int32Array.from([...picks].sort((a, b) => a - b));
  const m = index.length, gap = new Int32Array(m);
  let margin = 0;
  for (let a = 0; a < m; a++) {
    const i = index[a], j = index[(a + 1) % m], steps = (j - i + n) % n || n;
    gap[a] = steps;
    if (steps < 2) continue;
    const ax = shape.x[i], ay = shape.y[i], ex = shape.x[j] - ax, ey = shape.y[j] - ay, l = Math.hypot(ex, ey) || 1;
    for (let k = 1; k < steps; k++) {
      const v = (i + k) % n, sag = Math.abs(ex * (shape.y[v] - ay) - ey * (shape.x[v] - ax)) / l;
      if (sag > margin) margin = sag;
    }
  }
  return { index, gap, m, margin: margin * 1.25, x: shape.x, y: shape.y, n };
}

/* The outer vertices that might poke into the inner shape. Inside, only where the
   outer shape dents inwards. Outside, the whole outline. */
export function outerTestPoints(outer, side, count) {
  const n = outer.n, picks = [];
  if (side > 0) {
    let reflex = 0;
    for (let i = 0; i < n; i++) if (outer.turn[i] < -1e-6) reflex++;
    if (!reflex) return { index: new Int32Array(0), m: 0 };
    const stride = Math.max(1, Math.floor(reflex / count));
    let seen = 0;
    for (let i = 0; i < n; i++) if (outer.turn[i] < -1e-6 && (seen++ % stride === 0 || outer.sharp[i])) picks.push(i);
  } else {
    const stride = Math.max(1, Math.floor(n / count));
    for (let i = 0; i < n; i++) if (i % stride === 0 || outer.sharp[i]) picks.push(i);
  }
  return { index: Int32Array.from(picks), m: picks.length };
}

/* How far a pose crosses: the largest depth of a crossing, 0 or below if none. */
export function crossingDepth(outer, base, side, itests, otests, c, s, tx, ty) {
  let worst = -Infinity;
  for (let a = 0; a < itests.m; a++) {
    const i = itests.index[a], x = c * itests.x[i] - s * itests.y[i] + tx, y = s * itests.x[i] + c * itests.y[i] + ty;
    const d = side * -depthInside(outer, x, y);
    if (d > worst) worst = d;
  }
  for (let a = 0; a < otests.m; a++) {
    const v = otests.index[a], dx = outer.x[v] - tx, dy = outer.y[v] - ty;
    const d = depthInside(base, c * dx + s * dy, -s * dx + c * dy);
    if (d > worst) worst = d;
  }
  return worst;
}

/* True when the theory settles it. Inside, Blaschke's rolling theorem: a convex
   inner shape more curved everywhere than a convex outer shape never crosses it.
   Outside, a common tangent always separates two convex shapes. */
export function cleanByTheory(outer, inner, side) {
  if (!isConvex(outer) || !isConvex(inner)) return false;
  if (side < 0) return true;
  for (let i = 0; i < outer.n; i++) if (outer.sharp[i]) return false;
  let maxO = 0, minI = Infinity;
  for (let i = 0; i < outer.n; i++) if (outer.kappa[i] > maxO) maxO = outer.kappa[i];
  for (let i = 0; i < inner.n; i++) if (inner.kappa[i] < minI) minI = inner.kappa[i];
  return minI >= maxO * (1 - 1e-3);
}

/* Share of sampled poses that cross, and the deepest crossing. */
export function measureCrossing(outer, base, side, laps, placements = 1600) {
  const inner = forSide(base, side);
  const { poses, count } = formulaPoses(outer, inner, Math.max(1, laps), { maxPoses: placements });
  const itests = testPoints(base, 96), otests = outerTestPoints(outer, side, 96);
  const tol = outer.P * 2e-4;
  let crossing = 0, deepest = 0;
  for (let k = 0; k < count; k++) {
    const i = k * 4, d = crossingDepth(outer, base, side, itests, otests, poses[i], poses[i + 1], poses[i + 2], poses[i + 3]);
    if (d > tol) crossing++;
    if (d > deepest) deepest = d;
  }
  return { share: crossing / count, depth: deepest, crosses: crossing > 0 };
}

/* The ratio as a fraction a/b with b at most limit, if it is exact to within tol. */
export function exactRatio(x, limit, tol = 1e-9) {
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v + 1e-12), h = a * h1 + h0, k = a * k1 + k0;
    if (k > limit) return null;
    if (Math.abs(h / k - x) <= tol * x) return { a: h, b: k };
    h0 = h1; h1 = h; k0 = k1; k1 = k;
    const f = v - a;
    if (f < 1e-13) break;
    v = 1 / f;
  }
  return null;
}

/* The two fractions next to x with denominators at most limit: a Stern-Brocot walk. */
export function fareyNeighbours(x, limit) {
  const base = Math.floor(x);
  let la = base, lb = 1, ha = base + 1, hb = 1;
  if (x === base) return { low: { a: base, b: 1 }, high: { a: base, b: 1 } };
  for (;;) {
    const ma = la + ha, mb = lb + hb;
    if (mb > limit) break;
    if (ma / mb <= x) { la = ma; lb = mb; } else { ha = ma; hb = mb; }
  }
  return { low: { a: la, b: lb }, high: { a: ha, b: hb } };
}

/* The Close button for clean rolling. The ratio of perimeters becomes an exact
   fraction with at most limit laps, at the nearest possible inner size. */
export function closeBySize(outerSize, innerSize, limit) {
  const x = outerSize / innerSize, { low, high } = fareyNeighbours(x, limit);
  const options = [low, high].filter(f => f.a >= 1 && f.b >= 1).map(f => ({ ...f, size: outerSize * f.b / f.a }));
  options.sort((p, q) => Math.abs(p.size - innerSize) - Math.abs(q.size - innerSize));
  const best = options[0];
  return { size: best.size, laps: best.b, trips: best.a };
}

/* Spins for whole-number laps and trips of a clean roll. */
export const spinsFor = (trips, laps, side) => side > 0 ? trips - laps : trips + laps;

export { TAU };
