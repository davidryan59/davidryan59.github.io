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
assert.strictEqual(M.enumerate(demos.sieve, 'p1', 4).length, 81, 'Sieve level 4 count');
const capped = M.expand(demos.sieve, 'p1', 9, { maxInstances: 1000, maxMs: 1000, minDepth: 0, minScale: 0 });
assert(capped.length <= 1000 && capped.length >= 998, 'adaptive expansion fills up to the copy cap');
assert.strictEqual(capped.stoppedBy, 'copies', 'copy cap reports its reason');
const cappedLevels = new Set(capped.map(item => item.level));
assert(cappedLevels.has(6) && cappedLevels.has(7), 'a capped level keeps its unsplit parents beside their split siblings');
// Nothing vanishes: each level-6 parent counts as its 3 level-7 children, so the
// capped result covers all 3^7 level-7 positions.
assert.strictEqual(capped.reduce((sum, item) => sum + (item.level === 6 ? 3 : 1), 0), 2187, 'capped result covers the whole sieve');
assert.strictEqual(capped.stoppedBy, 'copies', 'adaptive expansion names copy cap');
const scaleStopped = M.expand(demos.sieve, 'p1', 9, { maxInstances: 60000, maxMs: 1000, minDepth: 2, minScale: 0.1 });
assert.strictEqual(scaleStopped.length, 81, 'scale cutoff retains terminal copies');
assert.strictEqual(scaleStopped.stoppedBy, 'scale', 'adaptive expansion names scale cutoff');

const sieve = M.analyse(demos.sieve, 'p1', 8);
assert.strictEqual(sieve.status.name, 'Converges', 'Sieve converges');
close(sieve.dimension, Math.log(3) / Math.log(2), 1e-7, 'Sieve dimension');
assert.strictEqual(sieve.exactDimension, 'log 3 / log 2', 'Sieve exact dimension');
close(sieve.hullArea, 0.5, 0.02, 'Sieve hull area');
assert.strictEqual(sieve.overlap, false, 'Sieve has no overlap');

const linked = M.analyse(demos.linked, 'p1', 8);
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
growing.letters[0].children = [M.child('p1', [1.1, 0, 0, 1.1, 0, 0])];
assert.strictEqual(M.status(growing).name, 'Grows', 'expanding loop grows');

const cycling = M.clone(demos.sieve);
cycling.letters[0].children = [M.child('p1', [0, 1, -1, 0, 1, 0])];
assert.strictEqual(M.status(cycling).name, 'Cycles', 'same-size turn cycles');

// Status uses eigenvalues and singular values of the linear parts. A skew
// whose eigenvalues are 1 and 0.5 cycles; 1.5 and 0.5 grows; a strong skew
// with eigenvalue 0.9 is Unclear, because its singular value exceeds one.
const single = m => { const r = M.clone(demos.sieve); r.letters[0].children = [M.child('p1', m)]; return M.status(r).name; };
assert.strictEqual(single([1, 0, 0.5, 0.5, 0, 0]), 'Cycles', 'skew with eigenvalue 1 cycles');
assert.strictEqual(single([1.5, 0, 0, 0.5, 0, 0]), 'Grows', 'stretch 1.5 by 0.5 grows');
assert.strictEqual(single([1, 0, 0, 0.5, 0, 0]), 'Cycles', 'stretch 1 by 0.5 cycles');
assert.strictEqual(single([0.9, 0, 2, 0.9, 0, 0]), 'Unclear', 'strong skew is unclear');
assert.strictEqual(single([0.6, 0, 0.3, 0.6, 0, 0]), 'Converges', 'mild skew converges');
const loop = M.clone(demos.linked);
loop.letters[0].children = [M.child('p2', [2, 0, 0, 2, 0, 0])];
loop.letters[1].children = [M.child('p1', [0.5, 0, 0, 0.5, 0, 0])];
assert.strictEqual(M.status(loop).name, 'Cycles', 'a grow-then-shrink loop of size one cycles');
const ends = M.clone(demos.linked);
ends.letters[0].children = [M.child('p2', [0.5, 0, 0, 0.5, 0, 0])]; ends.letters[1].children = [];
assert.strictEqual(M.status(ends).name, 'Converges', 'a rule that ends converges');
assert.strictEqual(M.nextId(demos.linked), 'p3', 'next parent id');

const overlap = M.clone(demos.sieve);
overlap.letters[0].children.push(M.child('p1', overlap.letters[0].children[0].matrix.slice()));
assert.strictEqual(M.directOverlap(overlap), true, 'coincident children overlap');

// Named formulas for one shared ratio.
assert.strictEqual(M.similarityDimension(demos.linked).exact, '2 log φ / log 2', 'linked pair names the golden ratio');
const dragon = M.clone(demos.sieve);
dragon.letters[0].children = [M.child('p1', [.5, .5, -.5, .5, 0, 0]), M.child('p1', [-.5, .5, -.5, -.5, 1, 0])];
assert.strictEqual(M.similarityDimension(dragon).exact, 'log 2 / log √2', 'the dragon is log 2 / log √2');
assert.strictEqual(M.similarityDimension(demos.free).exact, null, 'unequal ratios name no formula');
assert.strictEqual(M.analyse(dragon, 'p1', 7).overlap, false, 'the dragon has no overlap');

// Each parent's disc holds every copy below it, so pruning by disc is safe.
for (const [name, rule] of [['sieve', demos.sieve], ['linked', demos.linked], ['free', demos.free], ['dragon', dragon]]) {
  const discs = M.coverDiscs(rule);
  assert(discs, name + ' has cover discs');
  for (const top of rule.letters) {
    const disc = discs[top.id];
    const inside = M.enumerate(rule, top.id, 8, 20000).every(item => M.transformedFrame(rule.frame, item.matrix)
      .every(p => Math.hypot(p[0] - disc.centre[0], p[1] - disc.centre[1]) <= disc.radius + 1e-9));
    assert(inside, name + ' parent ' + top.id + ' disc holds level 8');
  }
}
const expanding = M.clone(demos.sieve); expanding.letters[0].children[0].matrix = [1.1, 0, 0, 1.1, 0, 0];
assert.strictEqual(M.coverDiscs(expanding), null, 'a growing copy has no cover discs');

// One large and one small child: the largest copy splits first, so the
// slow-shrinking branch reaches the same fine size as the rest.
const lopsided = M.clone(demos.sieve);
lopsided.letters[0].children = [M.child('p1', [0, 1, -2 / 3, 0, 2 / 3, 0]), M.child('p1', [0, .5, 1 / 3, 0, 2 / 3, .5])];
const even = M.expand(lopsided, 'p1', 32, { maxInstances: 20000, maxMs: 0, minScale: 0 });
const largest = Math.max.apply(null, even.map(item => M.singularValues(item.matrix)[0]));
assert(largest < 0.01, 'the largest copy left is under 1% of the frame, not 6% as level by level');
const paths = M.expand(demos.sieve, 'p1', 3, { maxMs: 0 }).map(item => item.path);
assert.deepStrictEqual(paths, paths.slice().sort(), 'copies come out in child order, depth first');

console.log('Fractal model: 52 checks passed.');
