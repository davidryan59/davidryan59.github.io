'use strict';

const assert = require('assert');
const M = require('../../app/fractal/model.js');
const demos = M.demos();

function close(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`);
}

assert.deepStrictEqual(M.apply(M.identity(), [2, 3]), [2, 3], 'identity map');
assert.deepStrictEqual(M.apply(M.compose([2, 0, 0, 2, 1, 1], [0.5, 0, 0, 0.5, 1, 0]), [0, 0]), [3, 1], 'map composition');

const squareCells = demos.sieve.letters[0].children.map(c => c.cell.row + ':' + c.cell.col);
assert.deepStrictEqual(squareCells, ['0:0', '1:0', '1:1'], 'Sieve cells');
assert.strictEqual(M.enumerate(demos.sieve, 'F', 4).length, 81, 'Sieve level 4 count');
const capped = M.expand(demos.sieve, 'F', 9, { maxInstances: 1000, maxMs: 1000, minDepth: 0, minScale: 0 });
assert.strictEqual(capped.length, 1000, 'adaptive expansion respects copy cap');
assert.strictEqual(capped.stoppedBy, 'copies', 'adaptive expansion names copy cap');
const scaleStopped = M.expand(demos.sieve, 'F', 9, { maxInstances: 60000, maxMs: 1000, minDepth: 2, minScale: 0.1 });
assert.strictEqual(scaleStopped.length, 81, 'scale cutoff retains terminal copies');
assert.strictEqual(scaleStopped.stoppedBy, 'scale', 'adaptive expansion names scale cutoff');

const sieve = M.analyse(demos.sieve, 'F', 8);
assert.strictEqual(sieve.status.name, 'Converges', 'Sieve converges');
close(sieve.dimension, Math.log(3) / Math.log(2), 1e-7, 'Sieve dimension');
assert.strictEqual(sieve.exactDimension, 'log 3 / log 2', 'Sieve exact dimension');
close(sieve.hullArea, 0.5, 0.02, 'Sieve hull area');
assert.strictEqual(sieve.overlap, false, 'Sieve has no overlap');

const linked = M.analyse(demos.linked, 'F', 8);
assert.strictEqual(linked.status.name, 'Converges', 'linked rule converges');
close(linked.dimension, Math.log((3 + Math.sqrt(5)) / 2) / Math.log(2), 1e-6, 'linked dimension');

assert.strictEqual(M.status(demos.free).name, 'Converges', 'Free demo converges');
assert.strictEqual(M.triangleCells(2).length, 4, '2-grid has four triangles');
assert.strictEqual(M.triangleCells(5).length, 25, '5-grid has 25 triangles');
M.triangleCells(3).forEach(cell => {
  const map = M.triangleGridMap(cell, 0, false, 1);
  close(Math.abs(M.determinant(map)), 1 / 9, 1e-9, 'triangle cell area scale');
});
const topTriangle = M.triangleCells(3).find(cell => !cell.down && cell.i === 0 && cell.j === 0);
close(Math.abs(M.determinant(M.triangleGridMap(topTriangle, 0, false, 2))), 4 / 9, 1e-9, 'two-block triangle area scale');
const stretchedCell = M.squareGridMap({ row: 1, col: 2 }, 3, 5, 1, true, 2, 3);
close(Math.abs(M.determinant(stretchedCell)), 2 / 5, 1e-9, 'rectangular square block area scale');

const growing = M.clone(demos.sieve);
growing.letters[0].children = [M.child('F', [1.1, 0, 0, 1.1, 0, 0])];
assert.strictEqual(M.status(growing).name, 'Grows', 'expanding loop grows');

const cycling = M.clone(demos.sieve);
cycling.letters[0].children = [M.child('F', [0, 1, -1, 0, 1, 0])];
assert.strictEqual(M.status(cycling).name, 'Cycles', 'same-size turn cycles');

const overlap = M.clone(demos.sieve);
overlap.letters[0].children.push(M.child('F', overlap.letters[0].children[0].matrix.slice()));
assert.strictEqual(M.directOverlap(overlap), true, 'coincident children overlap');

console.log('Fractal model: 28 checks passed.');
