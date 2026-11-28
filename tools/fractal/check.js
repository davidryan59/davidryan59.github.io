'use strict';

const assert = require('assert');
const M = require('../../app/fractal/model.js');
const examples = M.examples();
const PRESETS = require('../../app/fractal/presets.js');
const presets = Object.fromEntries(PRESETS.map(p => [p.key, p.rule]));

function close(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, got ${actual}`);
}

assert.deepStrictEqual(M.apply(M.identity(), [2, 3]), [2, 3], 'identity map');
assert.deepStrictEqual(M.apply(M.compose([2, 0, 0, 2, 1, 1], [0.5, 0, 0, 0.5, 1, 0]), [0, 0]), [3, 1], 'map composition');

// The origin is each frame's centre, and y points up.
for (const frame of ['square', 'triangle']) {
  const corners = M.framePolygon(frame), mean = [0, 1].map(k => corners.reduce((s, p) => s + p[k], 0) / corners.length);
  close(Math.hypot(mean[0], mean[1]), 0, 1e-12, frame + ' is centred on the origin');
  assert(corners[0][1] > 0, frame + ' lists its top corner first');
}
const sieveCentres = examples.sieve.letters[0].children.map(c => c.matrix[4] + ':' + c.matrix[5]);
assert.deepStrictEqual(sieveCentres, ['-0.25:0.25', '-0.25:-0.25', '0.25:-0.25'], 'Sieve children fill three quarters, leaving the top right empty');
assert.strictEqual(M.enumerate(examples.sieve, 'p1', 4).length, 81, 'Sieve level 4 count');
const capped = M.expand(examples.sieve, 'p1', 9, { maxInstances: 1000, maxMs: 1000, minDepth: 0, minScale: 0 });
assert(capped.length <= 1000 && capped.length >= 998, 'adaptive expansion fills up to the copy cap');
assert.strictEqual(capped.stoppedBy, 'copies', 'copy cap reports its reason');
const cappedLevels = new Set(capped.map(item => item.level));
assert(cappedLevels.has(6) && cappedLevels.has(7), 'a capped level keeps its unsplit parents beside their split siblings');
// Nothing vanishes: each level-6 parent counts as its 3 level-7 children, so the
// capped result covers all 3^7 level-7 positions.
assert.strictEqual(capped.reduce((sum, item) => sum + (item.level === 6 ? 3 : 1), 0), 2187, 'capped result covers the whole sieve');
assert.strictEqual(capped.stoppedBy, 'copies', 'adaptive expansion names copy cap');
const scaleStopped = M.expand(examples.sieve, 'p1', 9, { maxInstances: 60000, maxMs: 1000, minDepth: 2, minScale: 0.1 });
assert.strictEqual(scaleStopped.length, 81, 'scale cutoff retains terminal copies');
assert.strictEqual(scaleStopped.stoppedBy, 'scale', 'adaptive expansion names scale cutoff');

const sieve = M.analyse(examples.sieve, 'p1', 8);
assert.strictEqual(sieve.status.name, 'Converges', 'Sieve converges');
close(sieve.dimension, Math.log(3) / Math.log(2), 1e-7, 'Sieve dimension');
assert.strictEqual(sieve.exactDimension, 'log 3 / log 2', 'Sieve exact dimension');
close(sieve.hullArea, 0.5, 0.02, 'Sieve hull area');
assert.strictEqual(sieve.overlap, false, 'Sieve has no overlap');

const linked = M.analyse(examples.linked, 'p1', 8);
assert.strictEqual(linked.status.name, 'Converges', 'linked rule converges');
close(linked.dimension, Math.log((3 + Math.sqrt(5)) / 2) / Math.log(2), 1e-6, 'linked dimension');

assert.strictEqual(M.status(examples.free).name, 'Converges', 'Free demo converges');

const gasket = M.analyse(examples.gasket, 'p1', 8);
assert.strictEqual(gasket.status.name, 'Converges', 'the gasket converges');
close(gasket.dimension, Math.log(3) / Math.log(2), 1e-9, 'gasket dimension');
assert.strictEqual(M.similarityDimension(examples.gasket).exact, 'log 3 / log 2', 'the gasket names log 3 / log 2');
assert.strictEqual(gasket.overlap, false, 'the gasket has no overlap');
close(gasket.hullArea, Math.sqrt(3) / 4, 0.01, 'the gasket hull is its triangle');

const growing = M.clone(examples.sieve);
growing.letters[0].children = [M.child('p1', [1.1, 0, 0, 1.1, 0, 0])];
assert.strictEqual(M.status(growing).name, 'Grows', 'expanding loop grows');

const cycling = M.clone(examples.sieve);
cycling.letters[0].children = [M.child('p1', [0, 1, -1, 0, 1, 0])];
assert.strictEqual(M.status(cycling).name, 'Cycles', 'same-size turn cycles');

// Status uses eigenvalues and singular values of the linear parts. A skew
// whose eigenvalues are 1 and 0.5 cycles; 1.5 and 0.5 grows; a strong skew
// with eigenvalue 0.9 is Unclear, because its singular value exceeds one.
const single = m => { const r = M.clone(examples.sieve); r.letters[0].children = [M.child('p1', m)]; return M.status(r).name; };
assert.strictEqual(single([1, 0, 0.5, 0.5, 0, 0]), 'Cycles', 'skew with eigenvalue 1 cycles');
assert.strictEqual(single([1.5, 0, 0, 0.5, 0, 0]), 'Grows', 'stretch 1.5 by 0.5 grows');
assert.strictEqual(single([1, 0, 0, 0.5, 0, 0]), 'Cycles', 'stretch 1 by 0.5 cycles');
assert.strictEqual(single([0.9, 0, 2, 0.9, 0, 0]), 'Unclear', 'strong skew is unclear');
assert.strictEqual(single([0.6, 0, 0.3, 0.6, 0, 0]), 'Converges', 'mild skew converges');
const loop = M.clone(examples.linked);
loop.letters[0].children = [M.child('p2', [2, 0, 0, 2, 0, 0])];
loop.letters[1].children = [M.child('p1', [0.5, 0, 0, 0.5, 0, 0])];
assert.strictEqual(M.status(loop).name, 'Cycles', 'a grow-then-shrink loop of size one cycles');
const ends = M.clone(examples.linked);
ends.letters[0].children = [M.child('p2', [0.5, 0, 0, 0.5, 0, 0])]; ends.letters[1].children = [];
assert.strictEqual(M.status(ends).name, 'Converges', 'a rule that ends converges');
assert.strictEqual(M.nextId(examples.linked), 'p3', 'next parent id');

// Float noise in x must not sort a corner out of place. This set, from a
// saved rule, lost its bottom-left corner when the turn test had a tolerance.
const noisy = M.convexHull([[-0.5000000000000028, 0.5], [-0.5, -0.5], [-0.5, 0], [0.5, -0.5], [0.5, 0], [0.16666666666666388, 0.5]]);
assert.strictEqual(noisy.length, 5, 'the noisy hull keeps all five corners');
close(M.polygonArea(noisy), 11 / 12, 1e-9, 'the noisy hull keeps its area');

const overlap = M.clone(examples.sieve);
overlap.letters[0].children.push(M.child('p1', overlap.letters[0].children[0].matrix.slice()));
assert.strictEqual(M.directOverlap(overlap), true, 'coincident children overlap');

// Named formulas for one shared ratio.
assert.strictEqual(M.similarityDimension(examples.linked).exact, '2 log φ / log 2', 'linked pair names the golden ratio');
const dragon = M.clone(examples.sieve);
dragon.letters[0].children = [M.child('p1', [.5, -.5, .5, .5, -.5, 0]), M.child('p1', [-.5, -.5, .5, -.5, 0, .5])];
assert.strictEqual(M.similarityDimension(dragon).exact, 'log 2 / log √2', 'the dragon is log 2 / log √2');
assert.strictEqual(M.similarityDimension(examples.free).exact, null, 'unequal ratios name no formula');
assert.strictEqual(M.analyse(dragon, 'p1', 7).overlap, false, 'the dragon has no overlap');

// Each parent's disc holds every copy below it, so pruning by disc is safe.
for (const [name, rule] of [['sieve', examples.sieve], ['gasket', examples.gasket], ['linked', examples.linked], ['free', examples.free], ['dragon', dragon]]) {
  const discs = M.coverDiscs(rule);
  assert(discs, name + ' has cover discs');
  for (const top of rule.letters) {
    const disc = discs[top.id];
    const inside = M.enumerate(rule, top.id, 8, 20000).every(item => M.transformedFrame(rule.frame, item.matrix)
      .every(p => Math.hypot(p[0] - disc.centre[0], p[1] - disc.centre[1]) <= disc.radius + 1e-9));
    assert(inside, name + ' parent ' + top.id + ' disc holds level 8');
  }
}
const expanding = M.clone(examples.sieve); expanding.letters[0].children[0].matrix = [1.1, 0, 0, 1.1, 0, 0];
assert.strictEqual(M.coverDiscs(expanding), null, 'a growing copy has no cover discs');

// One large and one small child: the largest copy splits first, so the
// slow-shrinking branch reaches the same fine size as the rest.
const lopsided = M.clone(examples.sieve);
lopsided.letters[0].children = [M.child('p1', [0, 1, -2 / 3, 0, 2 / 3, 0]), M.child('p1', [0, .5, 1 / 3, 0, 2 / 3, .5])];
const even = M.expand(lopsided, 'p1', 32, { maxInstances: 20000, maxMs: 0, minScale: 0 });
const largest = Math.max.apply(null, even.map(item => M.singularValues(item.matrix)[0]));
assert(largest < 0.01, 'the largest copy left is under 1% of the frame, not 6% as level by level');
const paths = M.expand(examples.sieve, 'p1', 3, { maxMs: 0 }).map(item => item.path);
assert.deepStrictEqual(paths.filter(path => path.startsWith('00')), ['000', '001', '002'], 'the children of one split stay in child order');

// The corner cap keeps everything the hull held: a circle of 400 points
// cut to 16 corners still holds every point, and grows by under 3%.
const circle = M.convexHull(Array.from({ length: 400 }, (_, i) => [Math.cos(i * Math.PI / 200), Math.sin(i * Math.PI / 200)]));
const cut = M.simplifyHull(circle, 16);
assert.strictEqual(cut.length, 16, 'the cap cuts a hull to 16 corners');
const inside = (p, poly) => poly.every((a, i) => { const b = poly[(i + 1) % poly.length]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-12; });
assert(circle.every(p => inside(p, cut)), 'the cut hull holds every corner of the full one');
assert(M.polygonArea(cut) / M.polygonArea(circle) < 1.03, 'the cut hull is under 3% larger');
assert.strictEqual(M.simplifyHull(circle, 0), circle, 'no cap leaves the hull alone');

// The Dragon's hull starts large, so every step holds the whole fractal,
// even a step that is far from the true hull. Its true area is 35/12.
const dragonHull = steps => M.attractorHulls(dragonRule(), steps, 0, 16).p1;
function dragonRule() {
  const rule = M.baseRule('square', [{ id: 'p1', children: [] }]), r = Math.SQRT1_2;
  rule.letters[0].children = [M.child('p1', [r * Math.cos(Math.PI / 4), r * Math.sin(Math.PI / 4), -r * Math.sin(Math.PI / 4), r * Math.cos(Math.PI / 4), 0, 0]),
    M.child('p1', [r * Math.cos(3 * Math.PI / 4), r * Math.sin(3 * Math.PI / 4), -r * Math.sin(3 * Math.PI / 4), r * Math.cos(3 * Math.PI / 4), 1, 0])];
  return rule;
}
const dragonPoints = M.expand(dragonRule(), 'p1', 16, { maxInstances: 70000, maxMs: 0 }).map(item => [item.matrix[4], item.matrix[5]]);
for (const steps of [2, 5, 10, 30]) {
  const hull = dragonHull(steps);
  assert(dragonPoints.every(p => inside(p, hull)), 'the Dragon hull after ' + steps + ' steps holds every copy');
}
const settled = M.attractorHulls(dragonRule(), 100, 0, 16);
assert(settled.steps < 100, 'refining stops early once the hull settles: ' + settled.steps + ' steps');
assert(settled.p1.length <= 16, 'the settled hull keeps to the corner cap');

assert.deepStrictEqual(PRESETS.slice(0, 3).map(p => p.name), ['Square Cloud', 'Sierpinski Sieve', 'Fern'], 'the Rule menu starts Square Cloud, Sierpinski Sieve, Fern');
assert.strictEqual(new Set(PRESETS.map(p => p.key)).size, PRESETS.length, 'each preset has its own key');
assert(PRESETS.every(p => M.status(p.rule).name === 'Converges'), 'every preset converges');
assert.strictEqual(M.status(presets['square-cloud']).name, 'Converges', 'Square Cloud converges');
assert.strictEqual(JSON.stringify(presets['sierpinski-sieve'].letters[0].children.map(c => c.matrix)), JSON.stringify(examples.gasket.letters[0].children.map(c => c.matrix)), 'Sierpinski Sieve is the gasket');
console.log('Fractal model: 64 checks passed.');
