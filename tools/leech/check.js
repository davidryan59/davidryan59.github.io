/* Exact and numerical checks for phases 1 to 3 of the Leech explorer. */
'use strict';

const assert = require('assert');
const { performance } = require('perf_hooks');
const Leech = require('../../app/leech/lattice.js');
const Frame = require('../../app/leech/frame.js');
const E8 = require('../../app/e8/model.js');
const LeechScenes = require('../../app/leech/scenes.js');
const co0Views = require('../../docs/leech/co0-views.json');

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function popcount(value) {
  value >>>= 0;
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function permuteWord(word, permutation) {
  let result = 0;
  for (let i = 0; i < 24; i++) if (word & (1 << i)) result |= 1 << permutation(i);
  return result >>> 0;
}

function inverse23(value) {
  for (let candidate = 1; candidate < 23; candidate++) if (value * candidate % 23 === 1) return candidate;
  throw new Error('No inverse');
}

const random = mulberry32(0x1ee7c0de);
const buildStart = performance.now();
const data = Leech.build();
const buildMs = performance.now() - buildStart;

console.log('Code');
const code = data.code;
assert.strictEqual(code.length, 4096);
assert.strictEqual(new Set(code).size, 4096);
const weights = new Map();
code.forEach(word => weights.set(popcount(word), (weights.get(popcount(word)) || 0) + 1));
assert.deepStrictEqual(Array.from(weights.entries()).sort((a, b) => a[0] - b[0]),
  [[0, 1], [8, 759], [12, 2576], [16, 759], [24, 1]]);
assert.strictEqual(code[1], 0x800c75);
assert.strictEqual(code[2], 0x8018ea);
assert.strictEqual(code[3], 0x00149f);
assert.strictEqual(code[2787], 0xffffff);
for (let sample = 0; sample < 200000; sample++) {
  const a = Math.floor(random() * 4096), b = Math.floor(random() * 4096);
  assert.strictEqual((code[a] ^ code[b]) >>> 0, code[a ^ b]);
}
const codeSet = new Set(code);
const permutations = [
  i => i === 23 ? 23 : (i + 1) % 23,
  i => i === 23 ? 23 : 2 * i % 23,
  i => i === 0 ? 23 : i === 23 ? 0 : (23 - inverse23(i)) % 23
];
for (const permutation of permutations) for (const word of code) {
  assert.ok(codeSet.has(permuteWord(word, permutation)), 'Golay code automorphism');
}
console.log('  4,096 words and three M24 maps');

console.log('Octads');
assert.strictEqual(data.octads.length, 759);
function maskOf(positions) { return positions.reduce((mask, value) => mask | 1 << value, 0) >>> 0; }
assert.strictEqual(data.octads[0], maskOf(Leech.TRIO[0]));
assert.strictEqual(data.octads.find(mask => !(mask & data.octads[0])), maskOf(Leech.TRIO[1]));
assert.ok(codeSet.has(maskOf(Leech.TRIO[2])));
assert.strictEqual(maskOf(Leech.TRIO[0]) | maskOf(Leech.TRIO[1]) | maskOf(Leech.TRIO[2]), 0xffffff);
assert.strictEqual(maskOf(Leech.TRIO[0]) & maskOf(Leech.TRIO[1]), 0);
assert.strictEqual(maskOf(Leech.TRIO[1]) & maskOf(Leech.TRIO[2]), 0);
assert.strictEqual(maskOf(Leech.TRIO[2]) & maskOf(Leech.TRIO[0]), 0);
console.log('  759 octads; O1, O2 and O3 form a trio');

console.log('Vectors');
assert.strictEqual(data.coords.length, Leech.COUNT * 24);
assert.strictEqual(data.shape.length, Leech.COUNT);
assert.deepStrictEqual([0, 1, 2].map(shape => data.shape.reduce((count, value) => count + (value === shape), 0)),
  [1104, 97152, 98304]);
assert.strictEqual(Leech.checksum(data.coords), '8fd9cb85');
assert.strictEqual(Leech.checksum(data.shape), 'facaff85');
const seenIndices = new Uint8Array(Leech.COUNT);
for (let i = 0; i < Leech.COUNT; i++) {
  const vector = data.coords.subarray(i * 24, i * 24 + 24);
  let norm = 0;
  for (const value of vector) norm += value * value;
  assert.strictEqual(norm, 32, 'integer norm');
  assert.ok(Leech.inLattice(vector), 'vector lies in lattice');
  const recovered = Leech.indexOf(vector);
  assert.strictEqual(recovered, i, 'indexOf inverts canonical order');
  assert.strictEqual(seenIndices[recovered], 0, 'vectors are distinct');
  seenIndices[recovered] = 1;
  const negative = Int8Array.from(vector, value => -value);
  assert.notStrictEqual(Leech.indexOf(negative), -1, 'closed under negation');
}
function valuesAt(index) { return Array.from(data.coords.subarray(index * 24, index * 24 + 24)); }
assert.deepStrictEqual(valuesAt(0), [4, 4, ...Array(22).fill(0)]);
assert.deepStrictEqual(valuesAt(6), [-4, 0, 4, ...Array(21).fill(0)]);
const o1Vector = Array(24).fill(0); Leech.TRIO[0].forEach(i => { o1Vector[i] = 2; });
assert.deepStrictEqual(valuesAt(1104), o1Vector);
assert.deepStrictEqual(valuesAt(98256), [-3, ...Array(23).fill(1)]);
assert.deepStrictEqual(valuesAt(98279), [...Array(23).fill(1), -3]);
assert.deepStrictEqual(valuesAt(165167), [...Array(23).fill(-1), 3]);
assert.strictEqual(Leech.indexOf([4, 4, 4, ...Array(21).fill(0)]), -1);
assert.strictEqual(Leech.indexOf([2, 2, ...Array(22).fill(0)]), -1);
assert.strictEqual(Leech.indexOf([...Array(23).fill(1), 3]), -1);
console.log(`  196,560 distinct vectors; build ${buildMs.toFixed(1)} ms (30 ms guide)`);

console.log('Layers');
const expectedLayers = [1, 4600, 47104, 93150, 47104, 4600, 1];
const layerSamples = new Set([0, 1104, 98256, 98279]);
for (let i = 0; i < Leech.COUNT; i += 997) layerSamples.add(i);
for (const selected of layerSamples) {
  const found = Array(7).fill(0);
  Leech.layers(data.coords, selected).forEach(value => found[value]++);
  assert.deepStrictEqual(found, expectedLayers, `layers from ball ${selected}`);
}
assert.strictEqual(Leech.neighbours(data.coords, 0).length, 4600);
console.log(`  ${layerSamples.size} balls have counts 1, 4,600, 47,104, 93,150, 47,104, 4,600, 1`);

console.log('Common neighbours');
const expectedCommon = [891, 275, 44, 0, 1];
for (let pairSample = 0; pairSample < 10; pairSample++) {
  const first = Math.floor(random() * Leech.COUNT);
  const firstLayers = Leech.layers(data.coords, first);
  const firstNeighbours = Leech.neighbours(data.coords, first);
  for (let relation = 1; relation <= 5; relation++) {
    let second = Math.floor(random() * Leech.COUNT);
    while (firstLayers[second] !== relation) second = (second + 1) % Leech.COUNT;
    let common = 0;
    for (const candidate of firstNeighbours) if (Leech.dot(data.coords, second, candidate) === 16) common++;
    assert.strictEqual(common, expectedCommon[relation - 1], `common neighbours in layer ${relation}`);
  }
}
console.log('  ten deterministic pairs in each nontrivial layer');

console.log('Octad spots');
const spotTimes = [];
for (const positions of Leech.TRIO) {
  const spotStart = performance.now();
  const grouping = Leech.octadSpots(data.coords, data.shape, positions);
  spotTimes.push(performance.now() - spotStart);
  assert.strictEqual(grouping.count, 2641);
  const shellRows = [[0, 0], [0, 0], [0, 0], [0, 0]];
  grouping.spots.forEach(spot => { shellRows[spot.shell][0]++; shellRows[spot.shell][1] += spot.pile; });
  assert.deepStrictEqual(shellRows, [[1, 4320], [240, 122880], [2160, 69120], [240, 240]]);
  const expectedPiles = [4320, 512, 32, 1];
  grouping.spots.forEach(spot => {
    assert.strictEqual(spot.pile, expectedPiles[spot.shell]);
    let previous = -1;
    for (let at = spot.start; at < spot.end; at++) {
      assert.ok(grouping.order[at] > previous, 'spot order uses increasing ball indices');
      previous = grouping.order[at];
    }
  });
  const centre = grouping.spots.find(spot => spot.shell === 0);
  assert.strictEqual(centre.shape, 255, 'centre uses mixed-shape sentinel');
  const centreShapes = [0, 0, 0];
  for (let at = centre.start; at < centre.end; at++) centreShapes[data.shape[grouping.order[at]]]++;
  assert.deepStrictEqual(centreShapes, [480, 3840, 0], 'centre shape split');
  grouping.spots.filter(spot => spot.shell !== 0).forEach(spot => assert.ok(spot.shape >= 0 && spot.shape <= 2));
  const shapesByShell = [1, 2, 3].map(shell => {
    const counts = [0, 0, 0];
    grouping.spots.filter(spot => spot.shell === shell).forEach(spot => counts[spot.shape]++);
    return counts;
  });
  assert.deepStrictEqual(shapesByShell, [[0, 112, 128], [16, 1120, 1024], [112, 128, 0]]);
  const shellValues = Leech.shells(data.coords, positions);
  for (let i = 0; i < Leech.COUNT; i++) assert.strictEqual(shellValues[i], grouping.spots[grouping.spot[i]].shell);
  const outerByDouble = new Set(grouping.spots.filter(spot => spot.shell === 3).map(spot => Array.from(spot.coords).join(',')));
  grouping.spots.filter(spot => spot.shell === 1).forEach(spot => {
    assert.ok(outerByDouble.has(Array.from(spot.coords, value => value * 2).join(',')), 'inner spot is half an outer spot');
  });
  const outerBalls = [];
  for (let i = 0; i < Leech.COUNT; i++) {
    if (grouping.spots[grouping.spot[i]].shell !== 3) continue;
    outerBalls.push(i);
    const allowed = new Set(positions);
    for (let p = 0; p < 24; p++) if (!allowed.has(p)) assert.strictEqual(data.coords[i * 24 + p], 0);
  }
  assert.strictEqual(outerBalls.length, 240);
  let edges = 0;
  const degrees = new Uint16Array(240);
  for (let a = 0; a < 240; a++) for (let b = a + 1; b < 240; b++) {
    if (Leech.dot(data.coords, outerBalls[a], outerBalls[b]) === 16) { edges++; degrees[a]++; degrees[b]++; }
  }
  assert.strictEqual(edges, 6720);
  degrees.forEach(degree => assert.strictEqual(degree, 56));
}
console.log(`  O1/O2/O3: 2,641 spots and 6,720 E8 edges; ${spotTimes.map(ms => ms.toFixed(1)).join('/')} ms (60 ms guide)`);

console.log('Frames');
function frameError(frame) {
  let error = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) {
    error = Math.max(error, Math.abs(Frame.dot(frame[i], frame[j]) - (i === j ? 1 : 0)));
  }
  return error;
}
function randomFrame() {
  const rows = [];
  for (let i = 0; i < 24; i++) rows.push(Float64Array.from({ length: 24 }, () => random() - 0.5));
  return Frame.complete(rows);
}
let frame = Frame.complete([]);
for (let step = 0; step < 10000; step++) {
  const action = step % 5;
  if (action === 0) Frame.rotateRows(frame, step % 23, step % 23 + 1, (random() - 0.5) * 0.1);
  else if (action === 1) Frame.orbit(frame, 2 + step % 22, (random() - 0.5) * 4, (random() - 0.5) * 4);
  else if (action === 2) Frame.roll(frame, (random() - 0.5) * 4);
  else if (action === 3) Frame.pull(frame, Float64Array.from({ length: 24 }, () => random() - 0.5), 3, -2, 200, 23);
  else Frame.drift(frame, 1 / 60, 1, 23);
}
assert.ok(frameError(frame) < 1e-9, 'orthonormal after mixed frame operations');
for (let sample = 0; sample < 200; sample++) {
  const pulled = randomFrame(), value = Float64Array.from({ length: 24 }, () => random() - 0.5);
  const before = [Frame.dot(pulled[0], value), Frame.dot(pulled[1], value)];
  Frame.pull(pulled, value, 3, -2, 200, 23);
  const movement = [Frame.dot(pulled[0], value) - before[0], Frame.dot(pulled[1], value) - before[1]];
  close(movement[0], 3 / 200, Math.abs(3 / 200) * 0.02, 'pull x');
  close(movement[1], 2 / 200, Math.abs(2 / 200) * 0.02, 'pull y');
}
const e8Rows = Frame.place(E8.makePresets().coxeter, Leech.TRIO[0]);
const octadFrame = Frame.octadFrame(e8Rows[0], e8Rows[1], Leech.TRIO[0]);
const pullFrame = Frame.copy(octadFrame), hiddenBefore = pullFrame.slice(8).map(row => new Float64Array(row));
Frame.pull(pullFrame, Float64Array.from({ length: 24 }, (_, i) => Leech.TRIO[0].includes(i) ? random() - 0.5 : 0), 3, -2, 200, 7);
for (let row = 8; row < 24; row++) assert.deepStrictEqual(pullFrame[row], hiddenBefore[row - 8]);
const outside = new Set(Array.from({ length: 24 }, (_, i) => i).filter(i => !Leech.TRIO[0].includes(i)));
for (let step = 0; step < 1000; step++) {
  Frame.orbit(octadFrame, 2 + step % 6, 0.4, -0.3);
  Frame.pull(octadFrame, Float64Array.from({ length: 24 }, (_, i) => Leech.TRIO[0].includes(i) ? random() - 0.5 : 0), 1, -1, 200, 7);
  Frame.drift(octadFrame, 1 / 60, 1, 7);
}
for (let row = 0; row < 8; row++) for (const column of outside) assert.ok(Math.abs(octadFrame[row][column]) < 1e-12);
const target = Frame.tiltTarget(octadFrame[0], octadFrame[1], Leech.TRIO[0], Leech.TRIO[1]);
const tilted90 = Frame.tilted(octadFrame, Math.PI / 2, Leech.TRIO[0], Leech.TRIO[1]);
for (let r = 0; r < 2; r++) for (let k = 0; k < 24; k++) close(tilted90[r][k], target[r][k], 1e-12, '90-degree tilt');
for (const reflected of [false, true]) {
  const base = randomFrame(), angle = 37 * Math.PI / 180, turned = [new Float64Array(24), new Float64Array(24)];
  for (let k = 0; k < 24; k++) {
    turned[0][k] = Math.cos(angle) * base[0][k] + Math.sin(angle) * base[1][k];
    turned[1][k] = (reflected ? 1 : -1) * Math.sin(angle) * base[0][k] + (reflected ? -1 : 1) * Math.cos(angle) * base[1][k];
  }
  const aligned = Frame.alignPlane([base[0], base[1]], turned);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 24; k++) close(aligned[r][k], base[r][k], 1e-12, 'plane alignment');
}
for (let sample = 0; sample < 20; sample++) {
  const from = randomFrame(), rawTo = randomFrame();
  const alignedRows = Frame.alignPlane([from[0], from[1]], [rawTo[0], rawTo[1]]);
  const to = Frame.complete(alignedRows, rawTo.slice(2).concat(from.slice(2)));
  let previous = Infinity;
  for (let step = 0; step <= 20; step++) {
    const interpolated = Frame.interpolate(from, to, step / 20);
    assert.ok(frameError(interpolated) < 1e-9);
    const angle = Frame.planeAngle([interpolated[0], interpolated[1]], [to[0], to[1]]);
    assert.ok(angle <= previous + 1e-10, 'plane angle falls monotonically');
    previous = angle;
  }
  assert.deepStrictEqual(Frame.interpolate(from, to, 0), from);
  assert.deepStrictEqual(Frame.interpolate(from, to, 1), to);
}
for (const positions of [Leech.TRIO[0], Array.from({ length: 24 }, (_, i) => i)]) {
  const source = positions.length === 8 ? Frame.octadFrame(e8Rows[0], e8Rows[1], positions) : randomFrame();
  const encoded = Frame.encode(source, positions), decoded = Frame.decode(encoded, positions);
  assert.ok(decoded);
  for (let r = 0; r < 2; r++) for (const p of positions) {
    assert.ok(Math.abs(source[r][p] - decoded[r][p]) < 1 / 32767, 'frame encoding error');
  }
}
assert.strictEqual(Frame.decode('not valid!', Leech.TRIO[0]), null);
assert.strictEqual(Frame.decode('AA', Leech.TRIO[0]), null);
console.log('  10,000 mixed steps, pull, octad window, tilt, alignment, interpolation and encoding');

console.log('Scenes');
const scenes = LeechScenes.build({ Leech, Frame, E8, data });
assert.strictEqual(scenes.length, 24);
assert.deepStrictEqual(scenes.map(scene => scene.id),
  ['petrie', 'cox7', 'octagonal', 'squares', 'e8edges', 'weave',
    'oct18', 'oct14', 'oct12', 'oct8',
    'rot84', 'rot66', 'rot60', 'cloud23', 'rot42', 'rot40', 'rot36', 'rot30', 'rosette11', 'rings23',
    'cloud', 'hexagon', 'coordinates', 'layers']);
assert.deepStrictEqual(scenes.filter(scene => scene.featured).sort((a, b) => a.featured - b.featured).map(scene => scene.id),
  ['petrie', 'squares', 'cloud', 'rings23', 'hexagon', 'layers']);
assert.deepStrictEqual(Array.from(new Set(scenes.map(scene => scene.group))), [
  'E8 inside Leech · one octad', 'Coxeter planes · one octad',
  'Rotations · all 24 dimensions', 'Other views · all 24 dimensions'
]);

for (const view of co0Views.views) {
  const stored = LeechScenes.ROTATIONS[view.class];
  assert.ok(stored, `${view.class} rotation is stored`);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 24; k++) {
    close(stored[r][k], view.rows[r][k], 1e-15, `${view.class} row ${r}, column ${k}`);
    if (view.window === 8 && !Leech.TRIO[0].includes(k)) assert.strictEqual(stored[r][k], 0, `${view.class} stays inside O1`);
  }
  close(Frame.dot(stored[0], stored[0]), 1, 1e-12, `${view.class} row 0 norm`);
  close(Frame.dot(stored[1], stored[1]), 1, 1e-12, `${view.class} row 1 norm`);
  close(Frame.dot(stored[0], stored[1]), 0, 1e-12, `${view.class} row product`);
}

const SQRT8 = Math.sqrt(8);
function shownRows(scene, tilt) {
  if (!tilt) return scene.rows;
  const base = Frame.octadFrame(scene.rows[0], scene.rows[1], Leech.TRIO[scene.octad]);
  return Frame.tilted(base, tilt, Leech.TRIO[scene.octad], Leech.TRIO[(scene.octad + 1) % 3]);
}
function projection(scene, rows) {
  const layerValues = scene.colour === 'layers' ? Leech.layers(data.coords, scene.selected) : null;
  const spots = new Map(), radii = new Set(), radiusCounts = new Map();
  let maxRadius = 0, mean = 0, visible = 0;
  const xCounts = new Map();
  for (let i = 0; i < Leech.COUNT; i++) {
    let classification = 0;
    if (scene.colour === 'shapes') classification = data.shape[i];
    else if (scene.colour === 'layers') classification = layerValues[i];
    if (scene.weights && scene.weights[classification] === 0) continue;
    let x = 0, y = 0, offset = i * 24;
    for (let k = 0; k < 24; k++) {
      x += rows[0][k] * data.coords[offset + k] / SQRT8;
      y += rows[1][k] * data.coords[offset + k] / SQRT8;
    }
    const qx = Math.round(x * 1e6), qy = Math.round(y * 1e6), key = `${qx},${qy}`;
    spots.set(key, (spots.get(key) || 0) + 1);
    const radiusKey = Math.round(Math.hypot(x, y) * 1e6);
    radii.add(radiusKey);
    radiusCounts.set(radiusKey, (radiusCounts.get(radiusKey) || 0) + 1);
    maxRadius = Math.max(maxRadius, Math.hypot(x, y));
    xCounts.set(Math.round(x * 1e6), (xCounts.get(Math.round(x * 1e6)) || 0) + 1);
    visible++;
  }
  for (let i = 0; i < Leech.COUNT; i++) {
    let x = 0, y = 0, offset = i * 24;
    for (let k = 0; k < 24; k++) { x += rows[0][k] * data.coords[offset + k] / SQRT8; y += rows[1][k] * data.coords[offset + k] / SQRT8; }
    mean += x * x + y * y;
  }
  return { spots, radii, radiusCounts, maxRadius, mean: mean / Leech.COUNT, visible, xCounts };
}
function hasSymmetry(result, order) {
  const angle = 2 * Math.PI / order, cosine = Math.cos(angle), sine = Math.sin(angle);
  for (const [key, pile] of result.spots) {
    const [qx, qy] = key.split(',').map(Number), x = qx / 1e6, y = qy / 1e6;
    const rx = Math.round((cosine * x - sine * y) * 1e6), ry = Math.round((sine * x + cosine * y) * 1e6);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (result.spots.get(`${rx + dx},${ry + dy}`) === pile) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}
const results = new Map();
for (const scene of scenes) {
  const result = projection(scene, shownRows(scene, scene.tilt));
  results.set(scene.id, result);
  assert.strictEqual(result.spots.size, scene.expect.spots, `${scene.id} spot count`);
  assert.ok(hasSymmetry(result, scene.expect.symmetry), `${scene.id} ${scene.expect.symmetry}-fold symmetry`);
  if (scene.expect.notSymmetry) assert.ok(!hasSymmetry(result, scene.expect.notSymmetry), `${scene.id} lacks ${scene.expect.notSymmetry}-fold symmetry`);
  close(result.mean, 1 / 3, 1e-9, `${scene.id} projection mean`);
  if (scene.expect.radii !== undefined) assert.strictEqual(result.radii.size, scene.expect.radii, `${scene.id} radii`);
  if (scene.expect.maxRadius !== undefined) close(+result.maxRadius.toFixed(4), scene.expect.maxRadius, 0, `${scene.id} maximum radius`);
}
const weave = scenes.find(scene => scene.id === 'weave');
const weave45 = projection(weave, shownRows(weave, Math.PI / 4));
assert.strictEqual(weave45.spots.size, 17665);
const weave90 = projection(weave, shownRows(weave, Math.PI / 2));
assert.strictEqual(weave90.spots.size, 2641);
assert.ok(hasSymmetry(weave90, 30));
const layerResult = results.get('layers');
assert.deepStrictEqual(Array.from(layerResult.xCounts.entries()).sort((a, b) => a[0] - b[0]),
  [[-2000000, 1], [-1000000, 4600], [-500000, 47104], [0, 93150], [500000, 47104], [1000000, 4600], [2000000, 1]]);
const rings = results.get('rings23');
assert.ok(hasSymmetry(rings, 23));
assert.strictEqual(rings.radii.size, 23);
assert.deepStrictEqual(Array.from(rings.radiusCounts.values()).sort((a, b) => a - b), [...Array(22).fill(46), 92]);
const ringPiles = Array.from(rings.spots.values()).reduce((counts, pile) => counts.set(pile, (counts.get(pile) || 0) + 1), new Map());
assert.deepStrictEqual(Array.from(ringPiles.entries()).sort((a, b) => a[0] - b[0]), [[1, 1012], [2, 46]]);
const cloud23 = results.get('cloud23');
assert.ok(hasSymmetry(cloud23, 23));
assert.strictEqual(cloud23.spots.get('0,0'), 2);
assert.ok(hasSymmetry(results.get('rosette11'), 11));
console.log('  all 24 spot counts, symmetries, radii, layers and projection means');

console.log('Leech checks passed.');
