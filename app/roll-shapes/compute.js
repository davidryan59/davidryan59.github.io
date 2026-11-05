/* From a set of settings to a path: the list of poses that the view draws, plus
   what the readout says about it. The same list serves every pen, so moving a pen
   never repeats the rolling. The main thread runs the formula, and a worker runs
   the walk. */

import { buildShape } from './shapes.js';
import { formulaPoses, forSide, cleanByTheory, measureCrossing, exactRatio, spinsFor } from './rolling.js';
import { walk } from './walk.js';

export const QUALITY = {
  full: { detail: 1024, walkDetail: 720, testCount: 128, maxPoses: 420000, maxMs: Infinity },
  preview: { detail: 1024, walkDetail: 240, testCount: 48, maxPoses: 50000, maxMs: 70 },
};

export function buildPair(spec, detail) {
  return {
    outer: buildShape(spec.outer.type, spec.outer.params, spec.outer.size, detail),
    inner: buildShape(spec.inner.type, spec.inner.params, spec.inner.size, detail),
  };
}

const lapsToDraw = (spec, ratio) => ratio ? ratio.b : spec.laps;
const ratioOf = spec => exactRatio(spec.outer.size / spec.inner.size, spec.laps);

/* Which method a pair needs. With Allow overlap on, the formula runs whatever
   crosses, and the answer only says whether anything does. */
export function chooseMethod(spec, outer, inner) {
  if (cleanByTheory(outer, inner, spec.side)) return { method: 'formula', overlaps: false };
  const crosses = measureCrossing(outer, inner, spec.side, lapsToDraw(spec, ratioOf(spec))).crosses;
  if (spec.overlap) return { method: 'formula', overlaps: crosses };
  return crosses ? { method: 'walk', overlaps: false } : { method: 'formula', overlaps: false };
}

export function formulaPath(spec, outer, inner, quality, overlaps, maxPoses = QUALITY[quality].maxPoses) {
  const ratio = ratioOf(spec), laps = lapsToDraw(spec, ratio);
  const { poses, count } = formulaPoses(outer, forSide(inner, spec.side), laps, { maxPoses });
  return {
    method: 'formula', status: overlaps ? 'overlaps' : 'rolls', poses, count, laps,
    closes: ratio ? { laps: ratio.b, spins: spinsFor(ratio.a, ratio.b, spec.side) } : null,
  };
}

/* Runs in a worker in the app, and directly in the tests. */
export function walkPath(spec, quality, onProgress) {
  const q = QUALITY[quality], { outer, inner } = buildPair(spec, q.walkDetail);
  const result = walk(outer, inner, spec.side, spec.laps, { testCount: q.testCount, maxMs: q.maxMs, onProgress });
  return result;
}

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

/* The words under the view. */
export function describe(path, spec) {
  const state = { rolls: 'Rolls', tumbles: 'Tumbles', stuck: 'Stuck', overlaps: 'Overlaps' }[path.status];
  if (path.status === 'stuck') return { state, detail: path.nofit ? 'Too large to fit' : 'Cannot turn' };
  if (path.truncated) return { state, detail: 'Drawing…' };
  if (path.closes) return { state, detail: 'Closes after ' + plural(path.closes.laps, 'lap') + ', ' + plural(path.closes.spins, 'spin') };
  return { state, detail: plural(spec.laps, 'lap') + ' drawn, still open' };
}
