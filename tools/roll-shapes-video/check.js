/* Checks the video against the app. Allow overlap is off, so every pair on screen
   must be one the app draws with the formula. The picture would otherwise differ
   from what a visitor gets. It also checks that the last frame matches the first.

   Run from anywhere: node tools/roll-shapes-video/check.js */
import { scenesAt, LENGTH } from './timeline.js';
import { buildPair, chooseMethod } from '../../app/roll-shapes/compute.js';

const bad = new Map();
let tested = 0;
for (let t = 0; t < LENGTH; t += 0.1) {
  for (const s of scenesAt(t)) {
    const spec = { outer: s.outer, inner: s.inner, side: 1, laps: s.laps, overlap: false };
    const { outer, inner } = buildPair(spec, 400);
    tested++;
    if (chooseMethod(spec, outer, inner).method !== 'formula') {
      const key = s.outer.type + ' / inner ' + s.inner.size.toFixed(1);
      if (!bad.has(key)) bad.set(key, t.toFixed(1));
    }
  }
}
console.log(tested + ' poses of the settings tested');
for (const [k, t] of bad) console.log('WOULD TUMBLE at ' + t + ' s: ' + k);
const a = JSON.stringify(scenesAt(0).map(s => [s.outer, s.inner])), b = JSON.stringify(scenesAt(LENGTH - 1 / 60).map(s => [s.outer, s.inner]));
console.log(a === b ? 'Last frame matches first' : 'LOOP MISMATCH');
process.exit(bad.size || a !== b ? 1 : 0);
