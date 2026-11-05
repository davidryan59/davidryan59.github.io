/* The Close button for a shape that tumbles. A tumble has no exact fraction to aim
   for, so this is a numeric search. Spins per lap is the rotation number, and the
   curve closes when that number is a fraction with at most N laps. The search holds
   the outer shape fixed and moves the inner size until the rotation number lands on
   the nearest such fraction, then checks with a full walk that the state returns. */

import { buildShape } from './shapes.js';
import { walk } from './walk.js';
import { fareyNeighbours } from './rolling.js';

export function closeByWalk(spec, { detail = 720, testCount = 128, maxMs = 25000, onProgress } = {}) {
  const started = Date.now(), size0 = spec.inner.size;
  const outer = buildShape(spec.outer.type, spec.outer.params, spec.outer.size, detail);
  const limit = spec.laps;
  const run = (size, laps) => walk(outer, buildShape(spec.inner.type, spec.inner.params, size, detail), spec.side, laps, { testCount });
  const timeLeft = () => maxMs - (Date.now() - started);
  const report = share => { if (onProgress) onProgress(Math.min(0.99, share)); };

  const success = (size, r) => ({ ok: true, size, laps: r.closes.laps, spins: Math.abs(r.closes.spins) });
  /* A search can land on a closed orbit far from where it started. Hold on to that
     in case nothing nearer turns up. */
  let spare = null;
  const keep = (size, r) => {
    if (!spare || Math.abs(size - size0) < Math.abs(spare.size - size0)) spare = success(size, r);
  };
  const closes = (r) => r.closes && r.closes.laps <= limit && r.status !== 'stuck';

  const probeLaps = Math.min(limit, 48);
  const first = run(size0, probeLaps);
  if (closes(first)) return success(size0, first);
  if (first.status === 'stuck') return { ok: false, reason: 'stuck' };

  /* Spins per lap, leaving out the first lap, which may still be settling. Read
     between jump marks when the shape hops, since lap ends fall at a stair step. */
  const rate = r => {
    const m = r.marks.length - 1;
    if (m >= 2) return (r.marks[m].spin - r.marks[0].spin) / (r.marks[m].travel - r.marks[0].travel);
    const s = r.lapSpins, k = s.length - 1;
    if (k < 2) return r.spins / Math.max(r.laps, 1e-9);
    return (s[k] - s[1]) / (k - 1);
  };
  const rate0 = rate(first);
  const probe = size0 * 1.002;
  const slope = (rate(run(probe, probeLaps)) - rate0) / (probe - size0);

  const { low, high } = fareyNeighbours(Math.abs(rate0), limit);
  const sign = Math.sign(rate0) || 1;
  const targets = [low, high].filter(f => f.b >= 1).map(f => {
    const value = sign * f.a / f.b;
    return { value, laps: f.b, guess: size0 + (value - rate0) / (slope || 1) };
  }).sort((p, q) => Math.abs(p.guess - size0) - Math.abs(q.guess - size0));

  /* A secant search on the rotation number, from the first guess. */
  for (const [index, t] of targets.entries()) {
    let x0 = size0, f0 = rate0 - t.value, x1 = t.guess;
    for (let step = 0; step < 14 && timeLeft() > 0; step++) {
      report((index + step / 14) / targets.length * 0.7);
      if (!(x1 > 0) || Math.abs(x1 - size0) > size0 * 0.1) break;
      const r = run(x1, Math.max(probeLaps, t.laps));
      if (closes(r)) {
        const near = Math.max(3 * Math.abs(t.guess - size0), size0 * 0.005);
        if (Math.abs(x1 - size0) <= near) return success(x1, r);
        keep(x1, r);
      }
      if (r.status === 'stuck') break;
      const f1 = rate(r) - t.value, d = f1 - f0;
      if (Math.abs(d) < 1e-14) break;
      const next = x1 - f1 * (x1 - x0) / d;
      x0 = x1; f0 = f1; x1 = next;
    }
  }

  /* No smooth route. A chaotic tumble often locks onto closed orbits on its own,
     so look along nearby sizes, nearest first. */
  const scans = 24;
  for (let k = 1; k <= scans && timeLeft() > 0; k++) {
    report(0.7 + 0.3 * k / scans);
    const offset = Math.ceil(k / 2) * (k % 2 ? 1 : -1) * 0.001;
    const size = size0 * (1 + offset);
    if (spare && Math.abs(size - size0) >= Math.abs(spare.size - size0)) break;
    const r = run(size, limit);
    if (closes(r)) return success(size, r);
  }
  return spare || { ok: false, reason: timeLeft() > 0 ? 'none' : 'time' };
}
