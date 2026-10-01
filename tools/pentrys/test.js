/* Tests of Pentrys's pieces, rules, lessons and simulated player.

   Run from anywhere: node tools/pentrys/test.js
   It needs Node 18 or later and no packages. It loads the game's own files
   from app/pentrys/, as the page does, and exits with 1 if a test fails. */
'use strict';
const path = require('path'), assert = require('assert');
const APP = path.join(__dirname, '..', '..', 'app', 'pentrys');
['pieces.js', 'rules.js', 'lessons.js', 'bot.js'].forEach(f => require(path.join(APP, f)));
const { Pieces, Rules, Lessons, Bot } = globalThis.Pentrys;
const Pentrys = globalThis.Pentrys;

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
test('a resting piece locks after 1.25 times a row\'s fall, and moves restart that time only 15 times', () => {
  const g = setGame(['..........'], [{ shape: 'O4' }, { shape: 'O4' }]);
  while (g.piece && Math.max(...g.pieceCells().map(c => c[1])) < Rules.HEIGHT - 1) g.step({ softDrop: true });
  const id = g.piece.id;   // the step that landed it was its first resting step
  for (let i = 0; i < 148; i++) g.step({});   // a lesson falls a row every 2 s, so it locks after 2.5 s
  assert.strictEqual(g.piece.id, id, 'locked too soon');
  g.step({});
  assert.notStrictEqual(g.piece.id, id, 'did not lock at 2.5 s');
  assert.strictEqual(Rules.lockTicks(1), 75);
  assert.strictEqual(Rules.lockTicks(Rules.secondsPerRow(40)), 30);
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
test('the row points: 100, 300, 700, 1,300, 2,300, 7,100, then half as much again for each row', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(Rules.rowPoints), [100, 300, 700, 1300, 2300, 7100, 10650, 15975, 23963]);
});
test('scoring: a Double at level 5 with 1 spare scores 300 × 1.2 × 5 = 1,800, and the hard drop 2 a row', () => {
  const g = setGame(['#2######..', '########..', '#.......##'], [{ shape: 'O4' }, { shape: '1' }], { level: 5 });
  play(g, Array(4).fill('right').concat(['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c.n, 2); assert.strictEqual(c.spare, 1); assert.strictEqual(c.points, 1800);
  assert.strictEqual(g.score, 1800 + 2 * 18);
});
test('scoring: 2 spare is ×1.3, and an all clear ×2', () => {
  const g = setGame(['#3#######.'], [{ shape: '1' }, { shape: '1' }]);
  play(g, Array(5).fill('right').concat(['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c.spare, 2); assert.ok(c.allClear); assert.strictEqual(c.multiplier, 2.6); assert.strictEqual(c.points, 260);
});
test('scoring: glass in a cleared row is ×1.5, and glass with spare adds Crystal ×2', () => {
  const g = setGame(['#g3#####..', '########.#'], [{ shape: '2' }, { shape: '1' }]);
  play(g, Array(4).fill('right').concat(['hardDrop']));
  const ev = events(g), c = ev.find(e => e.type === 'clear'), combo = ev.find(e => e.type === 'combo');
  assert.strictEqual(c.glass, 1); assert.strictEqual(c.spare, 1); assert.strictEqual(c.multiplier, 3.6); assert.strictEqual(c.points, 360);
  assert.deepStrictEqual(combo.lines.map(l => l.name), ['Single', 'Spare 1', 'Glass', 'Crystal']);
});
test('scoring: the third clear on consecutive pieces earns Streak ×1.2', () => {
  const g = setGame(['#########.', '#########.', '#########.', '#........#'], Array(4).fill({ shape: '1' }));
  const combos = [];
  for (let k = 0; k < 3; k++) { play(g, Array(5).fill('right').concat(['hardDrop'])); combos.push(...events(g).filter(e => e.type === 'combo')); while (g.pause) g.step({}); }
  assert.deepStrictEqual(combos.map(c => c.points), [100, 100, 120]);
  assert.strictEqual(combos[2].lines[1].name, 'Streak 3');
});
test('a soft drop scores 1 a row, and a hard drop 2', () => {
  const g = setGame(['..........'], [{ shape: 'O4' }, { shape: 'O4' }]);
  while (g.pieces === 0) g.step({ softDrop: true });
  assert.strictEqual(g.score, 19);
  const h = setGame(['..........'], [{ shape: 'O4' }, { shape: 'O4' }]);
  play(h, ['hardDrop']);
  assert.strictEqual(h.score, 38);
});
test('each level falls 8% faster, up to level 50', () => {
  assert.strictEqual(Rules.secondsPerRow(1), 1);
  assert.ok(Math.abs(Rules.secondsPerRow(10) - 1 / Math.pow(1.08, 9)) < 1e-12);
  assert.ok(Math.abs(Rules.secondsPerRow(50) - 0.0231) < 0.0001);
  assert.strictEqual(Rules.secondsPerRow(70), Rules.secondsPerRow(50));
});

// Smashing glass ----------------------------------------------------------------
test('a hard drop onto glass alone smashes it, and the piece falls on through', () => {
  const g = setGame(['....g.....'], [{ shape: '1' }, { shape: '1' }]);
  play(g, ['hardDrop']);
  const ev = events(g), sm = ev.find(e => e.type === 'smash');
  assert.ok(sm, 'no smash'); assert.strictEqual(sm.cells.length, 1);
  assert.strictEqual(g.grid[Rules.HEIGHT - 1][4].shape, '1');
  assert.strictEqual(g.score, 2 * 19 + 100);
});
test('glass holds when other squares also hold the piece up, or when it lands softly', () => {
  const g = setGame(['....g#....'], [{ shape: '2' }, { shape: '1' }]);
  play(g, ['hardDrop']);
  assert.ok(!events(g).some(e => e.type === 'smash'));
  assert.strictEqual(g.grid[Rules.HEIGHT - 1][4].v, 0);
  const h = setGame(['....g.....'], [{ shape: '1' }, { shape: '1' }]);
  while (h.pieces === 0) h.step({ softDrop: true });
  assert.strictEqual(h.grid[Rules.HEIGHT - 1][4].v, 0);
});

// The flood and the deluge -------------------------------------------------------
test('a flood fills left, right and the three cells below, never above, and joins its piece', () => {
  const g = setGame(['..........', '..........', '....#.....'], [{ shape: '1', special: [0, 'flood'] }, { shape: '1' }]);
  play(g, ['hardDrop']);
  const f = events(g).find(e => e.type === 'fill');
  assert.ok(f && f.kind === 'flood', 'no flood');
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
test('a deluge fills every gap below it that connects, however deep, and nothing above its row', () => {
  const g = setGame(['..........', '######.###', '#####...##', '####.....#', '###.......'], [{ shape: 'I3', specials: [[1, 'deluge']] }, { shape: '1' }]);
  play(g, ['right', 'right', 'hardDrop']);
  const f = events(g).find(e => e.type === 'fill');
  assert.strictEqual(f.kind, 'deluge');
  assert.strictEqual(f.filled.length, 1 + 3 + 5 + 7);
  assert.ok(f.filled.every(c => c[1] > f.at[1]), 'filled its own row or above');
});
test('a deluge beside an open surface fills only the gaps either side of it in its own row', () => {
  const g = setGame(['..........', '..........', '#########.'], [{ shape: '1', special: [0, 'deluge'] }, { shape: '1' }]);
  play(g, ['hardDrop']);
  const f = events(g).find(e => e.type === 'fill'), y = f.at[1];
  assert.strictEqual(key(f.filled.filter(c => c[1] === y)), key([[f.at[0] - 1, y], [f.at[0] + 1, y]]));
});

// Bombs ---------------------------------------------------------------------------
test('a bomb destroys the 3 × 3 block round it, its own piece too, and scores 10 a square and 100 a glass', () => {
  const g = setGame(['...#g#....'], [{ shape: '2', specials: [[0, 'bomb']] }, { shape: '1' }]);
  play(g, ['hardDrop']);
  const ev = events(g), b = ev.find(e => e.type === 'blast');
  assert.ok(!ev.some(e => e.type === 'smash'), 'smashed');
  assert.strictEqual(b.cells.length, 5);
  assert.strictEqual(b.cells.filter(c => c.v === 0).length, 1);
  for (let x = 3; x <= 5; x++) assert.strictEqual(g.grid[Rules.HEIGHT - 1][x], null);
  assert.strictEqual(g.grid[Rules.HEIGHT - 2][5], null);
  assert.strictEqual(g.score, 2 * 18 + 100 + 4 * 10);
});
test('a row bomb clears its row whatever it holds, together with any full row', () => {
  const g = setGame(['#########.', '##g###g##.', '#........#'], [{ shape: '2', o: 1, specials: [[1, 'rowbomb']] }, { shape: '1' }]);
  play(g, Array(5).fill('right').concat(['hardDrop']));
  const c = events(g).find(e => e.type === 'clear');
  assert.strictEqual(c.n, 2); assert.ok(c.rowBomb); assert.strictEqual(c.glass, 2);
  assert.strictEqual(c.multiplier, 2.25); assert.strictEqual(c.points, 675);
});
test('a piece with several special squares: bombs go off first, then the water fills, even from a blasted square', () => {
  const grid = Rules.emptyGrid(10);
  for (let x = 0; x < 10; x++) { grid[22][x] = { id: 1, shape: 'stone', v: 1 }; grid[23][x] = { id: 1, shape: 'stone', v: 1 }; }
  grid[23][9] = null;
  const out = Rules.settle(grid, [[4, 21], [5, 21]], [{ i: 0, kind: 'bomb' }, { i: 1, kind: 'deluge' }], 2, 'I3');
  assert.strictEqual(out.blasts.length, 1);
  assert.strictEqual(out.fills.length, 1);
  assert.strictEqual(key(out.filled.map(c => [c[0], c[1]])), key([[5, 21], [4, 21], [6, 21], [4, 22], [5, 22]]));
});
const gridOf = rows => {
  const grid = Rules.emptyGrid(rows[0].length), top = Rules.HEIGHT - rows.length;
  rows.forEach((row, i) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') grid[top + i][x] = { id: 1, shape: 'stone', v: 1 }; });
  return grid;
};
test('a deluge on top of a tower stays out of the open well', () => {
  const grid = gridOf(Array(9).fill('#.........').concat(['#########.']));
  const out = Rules.settle(grid, [[0, 13]], [{ i: 0, kind: 'deluge' }], 2, '1');
  assert.strictEqual(key(out.filled.map(c => [c[0], c[1]])), key([[1, 13], [1, 14]]));
  assert.strictEqual(out.rows.length, 0);
});
test('a deluge over a shaft fills the cave under the stack, however far it reaches', () => {
  const grid = gridOf(['###.######', '###.######', '##......##']);
  const out = Rules.settle(grid, [[3, 20], [4, 20]], [{ i: 0, kind: 'deluge' }], 2, '2');
  const want = [[2, 20], [3, 21], [3, 22]].concat([2, 3, 4, 5, 6, 7].map(x => [x, 23]));
  assert.strictEqual(key(out.filled.map(c => [c[0], c[1]])), key(want));
  assert.deepStrictEqual(out.rows.map(r => r.y), [21, 22, 23]);
});
test('after a blast, the squares above the crater break into single squares and fall as far as they can', () => {
  const grid = gridOf(['.....#....', '#########.', '#########.']);
  grid[18][5] = { id: 9, shape: 'O4', v: 1 };   // an overhang above the crater, with two gaps under it
  const out = Rules.settle(grid, [[4, 17], [4, 18], [4, 19], [4, 20], [4, 21]], [{ i: 4, kind: 'bomb' }], 2, 'I5');
  for (const y of [20, 21, 22]) assert.strictEqual(out.grid[y][4] && out.grid[y][4].shape, 'I5', 'nothing fell to row ' + y);
  assert.strictEqual(out.grid[19][4], null);
  assert.strictEqual(out.grid[22][5] && out.grid[22][5].shape, 'O4', 'the overhang did not fall all the way');
  assert.strictEqual(out.grid[18][5], null);
  assert.notStrictEqual(out.grid[22][4].id, out.grid[21][4].id, 'the falling squares stayed joined');
});
test('everything above the blast in all three of its columns falls, even where the blast hit nothing', () => {
  // The bomb lands on a single stone at (4, 21). Column 5 holds only air in the blast, with an overhang far above it.
  const grid = gridOf(['....#.....', '#########.', '#########.']);
  grid[17][5] = { id: 7, shape: 'L4', v: 1 }; grid[17][6] = { id: 7, shape: 'L4', v: 1 };
  const out = Rules.settle(grid, [[4, 20]], [{ i: 0, kind: 'bomb' }], 2, '1');
  assert.strictEqual(out.grid[17][5], null, 'the square above the blast stayed put');
  assert.strictEqual(out.grid[21][5] && out.grid[21][5].shape, 'L4', 'the square did not fall all the way down');
  assert.notStrictEqual(out.grid[21][5].id, 7, 'the falling square stayed part of its piece');
  assert.strictEqual(out.grid[17][6] && out.grid[17][6].id, 7, 'a square outside the three columns moved');
});
test('a flood caught in a blast still pours', () => {
  const grid = Rules.emptyGrid(10);
  for (let x = 0; x < 10; x++) grid[23][x] = { id: 1, shape: 'stone', v: 1 };
  const out = Rules.settle(grid, [[4, 22], [5, 22]], [{ i: 0, kind: 'bomb' }, { i: 1, kind: 'flood' }], 2, '2');
  assert.ok(out.filled.some(c => c[0] === 5 && c[1] === 22), 'the flood did not refill its own cell');
});

// Glass that breaks with age ---------------------------------------------------------
test('glass cracks at 30 s and 45 s, and breaks at 60 s, leaving the rest of its piece', () => {
  const g = Rules.create({ width: 12, seed: 4, squares: 'pure' });
  const y = Rules.HEIGHT - 1;
  g.grid[y][0] = { id: 999, shape: 'L3', v: 1 }; g.grid[y][1] = { id: 999, shape: 'L3', v: 0, born: g.ticks }; g.grid[y][2] = { id: 999, shape: 'L3', v: 1 };
  const seen = [];
  for (let t = 0; t < 60 * 60 + 2 && !g.over; t++) { g.step({}); for (const e of g.takeEvents()) if (e.type === 'crack' || e.type === 'shatter') seen.push([e.type, e.stage || 0, g.ticks]); }
  assert.deepStrictEqual(seen.map(s => s[0] + s[1]), ['crack1', 'crack2', 'shatter0']);
  assert.strictEqual(g.grid[y][1], null);
  assert.strictEqual(g.grid[y][0].id, 999); assert.strictEqual(g.grid[y][2].id, 999);
});
test('glass in a lesson never breaks with age', () => {
  const g = setGame(['#g........'], Array(9).fill({ shape: '1' }));
  for (let t = 0; t < 61 * 60 && !g.over; t++) g.step({});
  assert.strictEqual(g.grid[Rules.HEIGHT - 1][1] && g.grid[Rules.HEIGHT - 1][1].v, 0);
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
test('over a million pieces, shapes, orientations and special squares land at their rates, each square on its own', () => {
  const g = Rules.create({ seed: 11 }), N = 1000000;
  const shapes = {}, orients = {}, specials = {}, perPiece = [0, 0, 0, 0, 0, 0];
  let squares = 0;
  for (let i = 0; i < N; i++) {
    const p = g.deal();
    shapes[p.shape] = (shapes[p.shape] || 0) + 1;
    orients[p.o] = (orients[p.o] || 0) + 1;
    squares += Pieces.SHAPE[p.shape].size;
    perPiece[p.specials.length]++;
    for (const sp of p.specials) specials[sp.kind] = (specials[sp.kind] || 0) + 1;
  }
  for (const s of Pieces.SHAPES) assert.ok(Math.abs(shapes[s] / N - 1 / 21) < 0.002, s + ' at ' + shapes[s] / N);
  for (let o = 0; o < 8; o++) assert.ok(Math.abs(orients[o] / N - 1 / 8) < 0.002, 'orientation ' + o);
  for (const [kind, p] of Rules.SQUARES.pentrys) {
    const rate = (specials[kind] || 0) / squares;
    assert.ok(Math.abs(rate - p) < p * 0.03, kind + ' at ' + rate);
  }
  assert.ok(Math.abs(perPiece[2] / N - 0.053) < 0.004, 'two special squares on ' + perPiece[2] / N);
  assert.ok(perPiece[3] > 0, 'never three special squares');
});
test('Plus deals only 2s and 3s, and Pure deals none', () => {
  const plus = Rules.create({ seed: 12, squares: 'plus' }), pure = Rules.create({ seed: 13, squares: 'pure' });
  const kinds = new Set();
  for (let i = 0; i < 100000; i++) { for (const sp of plus.deal().specials) kinds.add(sp.kind); assert.strictEqual(pure.deal().specials.length, 0); }
  assert.deepStrictEqual([...kinds].sort(), [2, 3]);
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
const W = n => Array(n).fill({});
const ANSWERS = {
  'Move and drop': R(3).concat('hardDrop'),
  'Rotate': ['cw'].concat(R(4), 'hardDrop'),
  'Flip': ['flip', 'cw'].concat(R(2), 'hardDrop'),
  'Cycle': ['cycle', 'cycle'].concat(R(5), 'hardDrop', L(1), 'hardDrop'),
  'Twos': L(2).concat('hardDrop'),
  'Threes': L(3).concat('hardDrop'),
  'Spare': R(2).concat('hardDrop'),
  'Glass': R(3).concat('hardDrop'),
  'Smash': R(2).concat('hardDrop'),
  'Flood': R(2).concat('hardDrop'),
  'Deluge': R(2).concat('hardDrop'),
  'Bomb': R(1).concat('hardDrop', R(1), 'hardDrop'),
  'Row bomb': R(3).concat('hardDrop'),
  'Rescue': R(4).concat('hardDrop'),
  'Two spare': R(2).concat('hardDrop'),
  'Quad': ['cycle'].concat(L(4), 'hardDrop', 'cw', R(9), 'hardDrop'),
  'Double smash': R(3).concat('hardDrop'),
  'Under the overhang': R(1).concat('hardDrop'),
  'Crater': R(1).concat('hardDrop', 'hardDrop', R(1), 'hardDrop', R(2), 'hardDrop'),
  'Row bomb Double': R(5).concat('hardDrop'),
  'Bomb and deluge': L(9).concat('hardDrop')
};
const WRONG = {
  'Rotate': ['cw'].concat(R(2), 'hardDrop'), 'Flip': ['cw'].concat(R(2), 'hardDrop'), 'Cycle': R(5).concat('hardDrop', L(1), 'hardDrop'),
  'Smash': R(2).concat(Array(100).fill({ softDrop: true })), 'Deluge': ['hardDrop'], 'Bomb': L(4).concat('hardDrop', 'hardDrop'),
  'Row bomb': ['hardDrop'], 'Rescue': ['hardDrop'], 'Double smash': R(3).concat(Array(100).fill({ softDrop: true })),
  'Crater': L(4).concat('hardDrop', 'hardDrop', R(1), 'hardDrop', R(2), 'hardDrop'), 'Row bomb Double': L(4).concat('hardDrop'),
  'Bomb and deluge': R(5).concat('hardDrop')
};
test('no lesson shows a clear past a Quad, or a Triple or more with a bonus', () => {
  Pentrys.Lessons.forEach(lesson => {
    const g = Rules.create({ mode: 'tutorial', lesson, seed: 1 });
    play(g, ANSWERS[lesson.title]);
    for (let t = 0; t < 60 && !g.over; t++) g.step({});
    for (const c of g.takeEvents().filter(e => e.type === 'combo')) {
      assert.ok(c.n <= 4, lesson.title + ' cleared ' + c.n + ' rows');
      if (c.n >= 3) assert.strictEqual(c.lines.length, 1, lesson.title + ' shows ' + c.lines.map(l => l.name).join(', '));
    }
  });
});
Pentrys.Lessons.forEach((lesson, i) => {
  test('lesson ' + (i + 1) + ', ' + lesson.title + ': the answer passes', () => {
    const g = Rules.create({ mode: 'tutorial', lesson, seed: 1 });
    play(g, ANSWERS[lesson.title]);
    for (let t = 0; t < 60 && !g.over; t++) g.step({});
    assert.strictEqual(g.result, 'passed');
  });
  if (WRONG[lesson.title]) test('lesson ' + (i + 1) + ', ' + lesson.title + ': the obvious wrong move does not', () => {
    const g = Rules.create({ mode: 'tutorial', lesson, seed: 1 });
    play(g, WRONG[lesson.title]);
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
