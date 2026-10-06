"use strict";

// Searches each solid that has no rotational order for a passage, and prints
// the views as quaternions for the `passage` field in app/non-rupert/models.js.
// Run with: node tools/non-rupert/find-passages.js [seconds per solid] [solid ...]

const { DEFINITIONS, buildModel } = require("../../app/non-rupert/models.js");
const { createSearch, fitPoses, quaternionRotation } = require("../../app/non-rupert/shadow.js");

function quaternion(m) {
  const trace = m[0] + m[4] + m[8];
  let q;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q = [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[0] - m[4] - m[8]);
    q = [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s];
  } else if (m[4] > m[8]) {
    const s = 2 * Math.sqrt(1 + m[4] - m[0] - m[8]);
    q = [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m[8] - m[0] - m[4]);
    q = [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4];
  }
  return q.map(value => Number(value.toFixed(6)));
}

let seed = 59;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const seconds = Number(process.argv[2]) || 6;
const chosen = process.argv.slice(3);
const keys = chosen.length ? chosen : Object.keys(DEFINITIONS).filter(key => !DEFINITIONS[key].order);

for (const key of keys) {
  const model = buildModel(key);
  const best = createSearch(model, random).run(seconds * 1000);
  const hole = quaternion(best.hole);
  const copy = quaternion(best.copy);
  const check = fitPoses(model, quaternionRotation(hole), quaternionRotation(copy), 360);
  console.log(`${key}: pass ratio ${check.scale.toFixed(6)} from ${best.tried} pairs of views`);
  console.log(`  passage: { hole: [${hole.join(", ")}], copy: [${copy.join(", ")}] }`);
}
