/* Search for an orthogonal projection that shows the E8 Dynkin tree clearly.
   The explorer keeps the chosen result as a fixed preset. */
'use strict';

const E8 = require('../../app/e8/model.js');
const roots = E8.buildRoots(), simple = E8.FUNDAMENTAL_ROOTS;
const links = [];
for (let i = 0; i < simple.length; i++) {
  for (let j = i + 1; j < simple.length; j++) {
    if (Math.abs(E8.dot(roots[simple[i]], roots[simple[j]]) + 1) < 1e-12) links.push([i, j]);
  }
}

let seed = 0xE8123456;
function random() {
  seed |= 0;
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
let spare = null;
function gaussian() {
  if (spare !== null) { const value = spare; spare = null; return value; }
  const radius = Math.sqrt(-2 * Math.log(Math.max(1e-12, random())));
  const angle = Math.PI * 2 * random();
  spare = radius * Math.sin(angle);
  return radius * Math.cos(angle);
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function crosses(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}
function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const amount = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - amount * dx, p[1] - a[1] - amount * dy);
}

let best = null;
for (let trial = 0; trial < 250000; trial++) {
  const frame = E8.orthonormalise([
    Array.from({ length: 8 }, gaussian),
    Array.from({ length: 8 }, gaussian)
  ]);
  const points = simple.map(index => frame.map(row => E8.dot(row, roots[index])));
  let crossings = 0;
  for (let i = 0; i < links.length; i++) {
    for (let j = i + 1; j < links.length; j++) {
      if (links[i].some(node => links[j].includes(node))) continue;
      if (crosses(points[links[i][0]], points[links[i][1]], points[links[j][0]], points[links[j][1]])) crossings++;
    }
  }
  if (crossings) continue;
  let minimum = Infinity, clearance = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) minimum = Math.min(minimum, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
    for (const link of links) {
      if (link.includes(i)) continue;
      clearance = Math.min(clearance, pointSegmentDistance(points[i], points[link[0]], points[link[1]]));
    }
  }
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const balance = Math.min(width, height) / Math.max(width, height);
  if (clearance < 0.08) continue;
  const score = minimum * 2.1 + clearance * 2.3 + balance * 0.35 + Math.min(width, height) * 0.15;
  if (!best || score > best.score) best = { score, frame, points, minimum, clearance, balance };
}

if (!best) throw new Error('No crossing-free projection found');
console.log(JSON.stringify(best.frame));
console.log('score', best.score.toFixed(6), 'minimum', best.minimum.toFixed(6), 'clearance', best.clearance.toFixed(6), 'balance', best.balance.toFixed(6));
console.log(best.points.map((point, i) => 'alpha' + (i + 1) + ' ' + point.map(value => value.toFixed(6)).join(' ')).join('\n'));
