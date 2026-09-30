/* Tests of Pentrys's pieces, rules, lessons and simulated player.

   Run from anywhere: node tools/pentrys/test.js
   It needs Node 18 or later and no packages. It loads the game's own files
   from app/pentrys/, as the page does, and exits with 1 if a test fails. */
'use strict';
const path = require('path'), assert = require('assert');
const APP = path.join(__dirname, '..', '..', 'app', 'pentrys');
['pieces.js', 'rules.js', 'lessons.js', 'bot.js'].forEach(f => require(path.join(APP, f)));
const { Pieces, Rules, Lessons, Bot } = globalThis.Pentrys;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok    ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); }
}
const key = cells => cells.map(c => c[0] + ',' + c[1]).sort().join(' ');
const norm = cells => { const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1])); return cells.map(c => [c[0] - mx, c[1] - my]); };

// A game on a set well: rows are strings as in lessons.js, and pieces come in
// order. The goal never passes, so the game runs until its pieces run out.
function setGame(rows, pieces, opts) {
  const lesson = { width: rows[0].length, rows, pieces, goal: () => false };
  return Rules.create(Object.assign({ mode: 'tutorial', lesson, seed: 1 }, opts || {}));
}
function play(g, moves) {
  for (const m of moves) { const input = {}; if (typeof m === 'string') input[m] = m === 'left' || m === 'right' ? 1 : true; else Object.assign(input, m); g.step(input); }
}
function events(g) { return g.takeEvents(); }

// The shapes --------------------------------------------------------------
test('21 shapes: 1, 1, 2, 5 and 12 by size', () => {
  assert.strictEqual(Pieces.SHAPES.length, 21);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(n => Pieces.BY_SIZE[n].length), [1, 1, 2, 5, 12]);
});
test('no shape repeats another, under any rotation or flip', () => {
  const canon = s => Pieces.SHAPE[s].orients.map(o => key(norm(o.cells))).sort()[0];
  assert.strictEqual(new Set(Pieces.SHAPES.map(canon)).size, 21);
});
test('91 orientations, and 29 pieces with mirror images apart', () => {
  let orients = 0, sided = 0;
  for (const s of Pieces.SHAPES) {
    const all = new Set(Pieces.SHAPE[s].orients.map(o => key(norm(o.cells))));
    orients += all.size;
    const turnsOnly = new Set(Pieces.SHAPE[s].orients.slice(0, 4).map(o => key(norm(o.cells))));
    sided += all.size / turnsOnly.size;
  }
  assert.strictEqual(orients, 91);
  assert.strictEqual(sided, 29);
});
test('four rotations bring each piece back, and two flips', () => {
  for (const s of Pieces.SHAPES) for (let o = 0; o < 8; o++) {
    let a = o, b = o;
    for (let i = 0; i < 4; i++) a = Pieces.rotate(a, 1);
    assert.strictEqual(a, o);
    for (let i = 0; i < 4; i++) b = Pieces.rotate(b, -1);
    assert.strictEqual(b, o);
    assert.strictEqual(Pieces.flip(Pieces.flip(o)), o);
  }
});
test('a flip turns each piece into its mirror image', () => {
  for (const s of Pieces.SHAPES) for (let o = 0; o < 8; o++) {
    const n = Pieces.SHAPE[s].box, a = Pieces.SHAPE[s].orients[o].cells, b = Pieces.SHAPE[s].orients[Pieces.flip(o)].cells;
    assert.strictEqual(key(b), key(a.map(c => [n - 1 - c[0], c[1]])));
  }
});
test('rotating and flipping keep each square in its place on the piece', () => {
  for (const s of Pieces.SHAPES) {
    const n = Pieces.SHAPE[s].box, or = Pieces.SHAPE[s].orients;
    for (let o = 0; o < 8; o++) {
      const cw = or[Pieces.rotate(o, 1)].cells;
      or[o].cells.forEach((c, i) => assert.deepStrictEqual(cw[i], [n - 1 - c[1], c[0]]));
    }
  }
});

// Appearing, turning and falling ---------------------------------------------
test('a piece appears centred, rounded left, with its bottom row in the top row', () => {
  for (const width of [10, 12, 14, 16, 18]) for (let seed = 1; seed <= 40; seed++) {
    const g = Rules.create({ width, seed }), cells = g.pieceCells();
    const xs = cells.map(c => c[0]), w = Math.max(...xs) - Math.min(...xs) + 1;
    assert.strictEqual(Math.min(...xs), Math.floor((width - w) / 2));
    assert.strictEqual(Math.max(...cells.map(c => c[1])), Rules.HIDDEN);
  }
});
test('a rotation or flip keeps the bottom row, and a thousand fast turns never lift a piece', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = Rules.create({ width: 12, seed });
    let bottom = Math.max(...g.pieceCells().map(c => c[1]));
    for (let i = 0; i < 1000 && !g.over && g.piece; i++) {
      const id = g.piece.id;
      g.step([{ cw: true }, { ccw: true }, { flip: true }][i % 3]);
      if (!g.piece || g.piece.id !== id) break;
      const now = Math.max(...g.pieceCells().map(c => c[1]));
      assert.ok(now >= bottom, 'the piece rose');
      bottom = now;
    }
  }
});
test('a piece against either wall still rotates', () => {
  for (const side of ['left', 'right']) {
    const g = setGame(['..........'], [{ shape: 'I4', o: 1 }]);
    play(g, Array(8).fill(side));
    const before = g.piece.o;
    play(g, ['cw']);
    assert.notStrictEqual(g.piece.o, before, 'did not rotate at the ' + side + ' wall');
  }
});
test('I4 and I5 stand up from the floor', () => {
  for (const shape of ['I4', 'I5']) {
    const g = setGame(['..........'], [{ shape }]);
    play(g, [{ softDrop: true }]);
    while (g.piece && Math.max(...g.pieceCells().map(c => c[1])) < Rules.HEIGHT - 1) g.step({ softDrop: true });
    play(g, ['cw']);
    const ys = g.pieceCells().map(c => c[1]);
    assert.strictEqual(Math.max(...ys) - Math.min(...ys) + 1, Pieces.SHAPE[shape].size);
  }
});
test('a resting piece locks after 0.5 s, and moves restart that time only 15 times', () => {
  const g = setGame(['..........'], [{ shape: 'O4' }, { shape: 'O4' }]);
  while (g.piece && Math.max(...g.pieceCells().map(c => c[1])) < Rules.HEIGHT - 1) g.step({ softDrop: true });
  const id = g.piece.id;   // the step that landed it was its first resting step
  for (let i = 0; i < 28; i++) g.step({});
  assert.strictEqual(g.piece.id, id, 'locked too soon');
  g.step({});
  assert.notStrictEqual(g.piece.id, id, 'did not lock at 0.5 s');
  const h = setGame(['..........'], [{ shape: 'O4' }, { shape: 'O4' }]);
  while (h.piece && Math.max(...h.pieceCells().map(c => c[1])) < Rules.HEIGHT - 1) h.step({ softDrop: true });
  const hid = h.piece.id;
  for (let i = 0; i < 14; i++) { h.step({ [i % 2 ? 'left' : 'right']: 1 }); for (let t = 0; t < 20; t++) h.step({}); }
  assert.strictEqual(h.piece.id, hid, 'locked while resets remained');
  h.step({ right: 1 });
  assert.notStrictEqual(h.piece && h.piece.id, hid, 'did not lock at once after the 15th reset');
});
test('the game ends when a new piece overlaps the stack', () => {
  const g = Rules.create({ width: 10, seed: 3 });
  for (let i = 0; i < 400 && !g.over; i++) g.step({ hardDrop: true });
  assert.ok(g.over);
  assert.strictEqual(g.result, 'topout');
});

// Clearing and scoring ---------------------------------------------------------
const clearOf = (rows, piece, moves) => { const g = setGame(rows, [piece, { shape: '1' }]); play(g, moves || []); play(g, ['hardDrop']); return events(g).find(e => e.type === 'clear'); };
test('a full row clears', () => { assert.ok(clearOf(['#########.'], { shape: '1' }, Array(5).fill('right'))); });
test('a row one short does not', () => { assert.ok(!clearOf(['########..'], { shape: '1' }, Array(5).fill('right'))); });
test('a 2 clears its row with one gap, and not with two', () => {
  assert.ok(clearOf(['#######.#.'], { shape: '1', special: [0, 2] }, Array(5).fill('right')));
  assert.ok(!clearOf(['######..#.'], { shape: '1', special: [0, 2] }, Array(5).fill('right')));
});
test('a 3 clears its row with two gaps, and not with three', () => {
  assert.ok(clearOf(['######.#..'], { shape: '1', special: [0, 3] }, Array(5).fill('right')));
  assert.ok(!clearOf(['#####..#..'], { shape: '1', special: [0, 3] }, Array(5).fill('right')));
});
test('a 2 and a 3 together clear with three gaps', () => {
  assert.ok(clearOf(['#2###..#..'], { shape: '1', special: [0, 3] }, Array(5).fill('right')));
});
test('glass counts nothing: a full row with glass stays, and a 2 clears it', () => {
  assert.ok(!clearOf(['###g#####.'], { shape: '1' }, Array(5).fill('right')));
  assert.ok(clearOf(['###g#####.'], { shape: '1', special: [0, 2] }, Array(5).fill('right')));
});
test('scoring: a Double at level 5 with 1 spare scores 3 × 5 × 2 = 30', () => {
  const g = setGame(['#2######..', '########..', '#.......##'], [{ shape: 'O4' }, { shape: '1' }], { level: 5 });
  play(g, Array(4).fill('right').concat(['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c.n, 2); assert.strictEqual(c.spare, 1); assert.strictEqual(c.points, 30);
  assert.strictEqual(g.score, 30);
});
test('scoring: each spare doubles, and an all clear scores ×10', () => {
  const g = setGame(['#3#######.'], [{ shape: '1' }, { shape: '1' }]);
  play(g, Array(5).fill('right').concat(['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c.spare, 2); assert.ok(c.allClear); assert.strictEqual(c.multiplier, 40); assert.strictEqual(c.points, 40);
});
test('the points table: 1, 3, 7, 13, 23, 71', () => { assert.deepStrictEqual(Rules.POINTS.slice(1), [1, 3, 7, 13, 23, 71]); });

// The flood --------------------------------------------------------------------
test('a flood fills left, right and the three cells below, never above, and joins its piece', () => {
  const g = setGame(['..........', '..........', '....#.....'], [{ shape: '1', special: [0, 'flood'] }, { shape: '1' }]);
  play(g, ['hardDrop']);
  const f = events(g).find(e => e.type === 'flood');
  assert.ok(f, 'no flood');
  const at = f.at, got = key(f.filled);
  assert.strictEqual(key(f.filled.filter(c => c[1] < at[1])), '', 'filled above');
  assert.strictEqual(got, key([[at[0] - 1, at[1]], [at[0] + 1, at[1]], [at[0] - 1, at[1] + 1], [at[0] + 1, at[1] + 1]]));
  f.filled.forEach(c => assert.strictEqual(g.grid[c[1]][c[0]] && g.grid[c[1]][c[0]].id, g.grid[at[1]][at[0]].id));
});
test('I5 standing, with a flood at its foot, clears six rows: a Hextrys', () => {
  const rows = Array(5).fill('#########.').concat(['########.#']);
  const g = setGame(rows, [{ shape: 'I5', special: [0, 'flood'] }, { shape: '1' }]);
  play(g, ['ccw'].concat(Array(5).fill('right'), ['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c && c.n, 6);
  assert.strictEqual(c.name, 'Hextrys');
});

// The queue and the random choice ---------------------------------------------
test('cycle sends the front piece to the back, and a lock takes the front and adds one', () => {
  const g = Rules.create({ seed: 7 });
  const ids = () => g.queue.map(p => p.id);
  const q = ids();
  g.step({ cycle: true });
  assert.deepStrictEqual(ids(), q.slice(1).concat(q[0]));
  const front = g.queue[0].id;
  g.step({ hardDrop: true });
  while (!g.over && g.pause) g.step({});
  assert.strictEqual(g.piece.id, front);
  assert.strictEqual(g.queue.length, 4);
});
test('over a million pieces, shapes, orientations and special squares land at their rates', () => {
  const g = Rules.create({ seed: 11 }), N = 1000000;
  const shapes = {}, orients = {}, specials = { 2: 0, 3: 0, 0: 0, flood: 0 };
  let squares = 0;
  for (let i = 0; i < N; i++) {
    const p = g.deal();
    shapes[p.shape] = (shapes[p.shape] || 0) + 1;
    orients[p.o] = (orients[p.o] || 0) + 1;
    squares += Pieces.SHAPE[p.shape].size;
    if (p.special) specials[p.special.kind]++;
  }
  for (const s of Pieces.SHAPES) assert.ok(Math.abs(shapes[s] / N - 1 / 21) < 0.002, s + ' at ' + shapes[s] / N);
  for (let o = 0; o < 8; o++) assert.ok(Math.abs(orients[o] / N - 1 / 8) < 0.002, 'orientation ' + o);
  const rate = k => specials[k] / squares;
  assert.ok(Math.abs(rate(2) - 1 / 20) < 0.001, '2 at ' + rate(2));
  assert.ok(Math.abs(rate(3) - 1 / 100) < 0.0005, '3 at ' + rate(3));
  assert.ok(Math.abs(rate(0) - 1 / 200) < 0.0004, 'glass at ' + rate(0));
  assert.ok(Math.abs(rate('flood') - 1 / 200) < 0.0004, 'flood at ' + rate('flood'));
});
test("Grow's mix at each level matches its table", () => {
  for (let level = 1; level <= 7; level++) {
    const g = Rules.create({ mode: 'grow', level, seed: level }), N = 60000, count = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < N; i++) count[Pieces.SHAPE[g.deal().shape].size]++;
    const stage = Rules.GROW[Math.min(level, 6) - 1];
    assert.ok(Math.abs(count[5] / N - stage.five) < 0.01, 'level ' + level + ': five at ' + count[5] / N);
    for (const size of [1, 2, 3, 4]) if (!stage.sizes.includes(size)) assert.strictEqual(count[size], 0, 'level ' + level + ' dealt size ' + size);
  }
});
test('the same seed plays the same game', () => {
  const run = () => { const g = Rules.create({ seed: 99 }); for (let i = 0; i < 3000 && !g.over; i++) g.step(i % 7 === 0 ? { hardDrop: true } : i % 5 === 0 ? { cw: true } : {}); return [g.score, g.rowsCleared, g.pieces, g.ticks].join(); };
  assert.strictEqual(run(), run());
});

// The lessons ------------------------------------------------------------------
const R = n => Array(n).fill('right'), L = n => Array(n).fill('left');
const ANSWERS = [
  R(3).concat('hardDrop'),
  ['cw'].concat(R(4), 'hardDrop'),
  ['flip', 'cw'].concat(R(2), 'hardDrop'),
  ['cycle', 'cycle'].concat(R(5), 'hardDrop', L(1), 'hardDrop'),
  L(2).concat('hardDrop'),
  L(3).concat('hardDrop'),
  R(2).concat('hardDrop'),
  R(3).concat('hardDrop'),
  R(2).concat('hardDrop'),
  ['cw'].concat(R(5), 'hardDrop'),
  ['ccw'].concat(R(5), 'hardDrop')
];
const WRONG = { 2: ['cw'].concat(R(2), 'hardDrop'), 3: R(5).concat('hardDrop', L(1), 'hardDrop'), 10: ['cw'].concat(R(5), 'hardDrop') };
Pentrys.Lessons.forEach((lesson, i) => {
  test('lesson ' + (i + 1) + ', ' + lesson.title + ': the answer passes', () => {
    const g = Rules.create({ mode: 'tutorial', lesson, seed: 1 });
    play(g, ANSWERS[i]);
    for (let t = 0; t < 60 && !g.over; t++) g.step({});
    assert.strictEqual(g.result, 'passed');
  });
  if (WRONG[i]) test('lesson ' + (i + 1) + ', ' + lesson.title + ': the obvious wrong move does not', () => {
    const g = Rules.create({ mode: 'tutorial', lesson, seed: 1 });
    play(g, WRONG[i]);
    for (let t = 0; t < 30 && !g.over; t++) g.step({});
    assert.notStrictEqual(g.result, 'passed');
  });
});

// The simulated player ---------------------------------------------------------
test('the simulated player clears rows and outlasts dropping at random', () => {
  const g = Rules.create({ width: 12, seed: 5 });
  for (let i = 0; i < 300 && !g.over; i++) {
    const p = Bot.plan(g, true);
    for (let c = 0; c < (p ? p.cycles : 0); c++) g.cycle();
    if (!p || !g.placeDirect(p.o, p.bx)) { g.step({ hardDrop: true }); while (!g.over && g.pause) g.step({}); }
  }
  assert.ok(g.rowsCleared > 60, 'cleared only ' + g.rowsCleared);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
