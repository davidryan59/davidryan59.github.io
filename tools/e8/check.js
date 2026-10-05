/* Exact and numerical checks for the E8 explorer's generated model. */
'use strict';

const assert = require('assert');
const E8 = require('../../app/e8/model.js');

const roots = E8.buildRoots();
const graph = E8.buildEdges(roots);
const coxeter = E8.buildCoxeterData(roots);
const presets = E8.makePresets();

assert.strictEqual(roots.length, 240, 'root count');
assert.strictEqual(new Set(roots.map(E8.rootKey)).size, 240, 'roots are unique');
assert.strictEqual(roots.filter(root => E8.rootKind(root) === 'd8').length, 112, 'D8 root count');
assert.strictEqual(roots.filter(root => E8.rootKind(root) === 'half').length, 128, 'half-coordinate root count');
roots.forEach(root => assert.ok(Math.abs(E8.dot(root, root) - 2) < 1e-12, 'root squared length'));

assert.strictEqual(graph.edges.length, 6720, 'edge count');
graph.adjacent.forEach(list => assert.strictEqual(list.length, 56, 'root degree'));

for (let selected = 0; selected < roots.length; selected++) {
  const counts = new Map();
  roots.forEach(root => {
    const product = Math.round(E8.dot(roots[selected], root));
    counts.set(product, (counts.get(product) || 0) + 1);
  });
  assert.deepStrictEqual(
    [-2, -1, 0, 1, 2].map(value => counts.get(value)),
    [1, 56, 126, 56, 1],
    'angle counts'
  );
}

assert.strictEqual(coxeter.cycles.length, 8, 'Coxeter orbit count');
coxeter.cycles.forEach(cycle => assert.strictEqual(cycle.length, 30, 'Coxeter orbit length'));
for (let i = 0; i < roots.length; i++) {
  let current = i;
  for (let step = 0; step < 30; step++) current = coxeter.next[current];
  assert.strictEqual(current, i, 'order-30 element closes');
}

const coxeterPlanes = { coxeter: 12, coxeter7: 84, coxeter11: 132, coxeter13: 156 };
Object.entries(coxeterPlanes).forEach(([name, expectedDegrees]) => {
  const frame = presets[name], radii = [], products = [0, 0];
  roots.forEach((root, index) => {
    const next = roots[coxeter.next[index]];
    const x = E8.dot(frame[0], root), y = E8.dot(frame[1], root);
    const nx = E8.dot(frame[0], next), ny = E8.dot(frame[1], next);
    radii.push(Math.hypot(x, y));
    products[0] += x * nx + y * ny;
    products[1] += x * ny - y * nx;
  });
  const degrees = Math.abs(Math.atan2(products[1], products[0]) * 180 / Math.PI);
  assert.ok(Math.abs(degrees - expectedDegrees) < 1e-8, name + ' rotation angle');
  const distinctRadii = [];
  radii.sort((a, b) => a - b).forEach(radius => {
    if (!distinctRadii.length || Math.abs(radius - distinctRadii[distinctRadii.length - 1]) > 1e-8) distinctRadii.push(radius);
  });
  assert.strictEqual(distinctRadii.length, 8, name + ' has eight rings');
});
const coxeterPlaneNames = Object.keys(coxeterPlanes);
for (let a = 0; a < coxeterPlaneNames.length; a++) {
  for (let b = a + 1; b < coxeterPlaneNames.length; b++) {
    for (let rowA = 0; rowA < 2; rowA++) for (let rowB = 0; rowB < 2; rowB++) {
      assert.ok(Math.abs(E8.dot(presets[coxeterPlaneNames[a]][rowA], presets[coxeterPlaneNames[b]][rowB])) < 1e-8,
        'Coxeter invariant planes are mutually orthogonal');
    }
  }
}

function checkFrame(frame, label) {
  assert.strictEqual(frame.length, 8, label + ' row count');
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const expected = i === j ? 1 : 0;
      assert.ok(Math.abs(E8.dot(frame[i], frame[j]) - expected) < 1e-9, label + ' orthonormal');
    }
  }
}

Object.entries(presets).forEach(([name, frame]) => checkFrame(frame, name));

const rotated = E8.copyFrame(presets.coxeter);
for (let step = 0; step < 2000; step++) {
  E8.rotateRows(rotated, step % 7, step % 7 + 1, 0.0017 * (step % 5 + 1));
}
checkFrame(rotated, 'rotated frame');

for (let step = 0; step <= 20; step++) {
  checkFrame(E8.interpolateFrames(presets.coxeter, presets.generic, step / 20), 'interpolated frame');
}

const presetFrames = Object.values(presets);
for (let index = 0; index < presetFrames.length; index++) {
  const from = presetFrames[index], to = E8.alignFrame(from, presetFrames[(index + 1) % presetFrames.length]);
  for (let step = 0; step <= 10; step++) checkFrame(E8.interpolateFrames(from, to, step / 10), 'aligned preset transition');
}

const before = roots.map(root => rotated.map(row => E8.dot(row, root)));
for (let a = 0; a < 20; a++) {
  for (let b = a + 1; b < 20; b++) {
    const original = roots[a].reduce((sum, value, k) => sum + (value - roots[b][k]) ** 2, 0);
    const transformed = before[a].reduce((sum, value, k) => sum + (value - before[b][k]) ** 2, 0);
    assert.ok(Math.abs(original - transformed) < 1e-9, 'rotation preserves distance');
  }
}

console.log('E8 checks passed:');
console.log('  240 roots: 112 coordinate + 128 half-coordinate');
console.log('  6,720 edges: degree 56 at every root');
console.log('  relation counts: 1, 56, 126, 56, 1');
console.log('  8 order-30 cycles');
console.log('  4 Coxeter planes: 12°, 84°, 132° and 156°, each with 8 rings');
console.log('  13 preset frames and rotation invariants');
