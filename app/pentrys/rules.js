/* The rules of Pentrys: the well, the pieces and queue, special squares,
   falling, locking, the flood, clearing, scoring, levels and the modes.
   See docs/pentrys.md.

   No page, no drawing and no clock. The game moves on one step, a sixtieth
   of a second, each time step() is called, and takes its random numbers
   from a seeded generator, so a seed and a list of inputs replay a game
   exactly. What happens is reported as events, which the page reads to
   draw and sound, and which the tests read to check.

   Rows are counted down from the top of the hidden rows: rows 0 to 3 are
   hidden, and rows 4 to 23 are the well's 20 visible rows. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});
  var Pieces = Pentrys.Pieces;

  var ROWS = 20, HIDDEN = 4, HEIGHT = ROWS + HIDDEN;
  var TICK = 1 / 60;
  var LOCK_TICKS = 30;          // 0.5 s resting before a piece locks
  var MAX_RESETS = 15;          // moves and turns that restart that time
  var CLEAR_TICKS = 18;         // 0.3 s pause while rows vanish
  var SPRINT_ROWS = 40, BLITZ_TICKS = 180 * 60;
  var POINTS = [0, 1, 3, 7, 13, 23, 71];
  var NAMES = ['', 'Single', 'Double', 'Triple', 'Quad', 'Pentrys', 'Hextrys'];
  var SPECIAL_RATE = 7 / 100;   // a special square, per square: 2, 3, glass, flood as 10 : 2 : 1 : 1
  var FLOOD = [[-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];   // beside and below, never above

  // Grow: the sizes in play and the share of five-square pieces, from level 1.
  var GROW = [
    { sizes: [1, 2, 3, 4], five: 0 },
    { sizes: [1, 2, 3, 4, 5], five: 0.2 },
    { sizes: [2, 3, 4, 5], five: 0.4 },
    { sizes: [3, 4, 5], five: 0.6 },
    { sizes: [4, 5], five: 0.8 },
    { sizes: [5], five: 1 }
  ];

  function secondsPerRow(level) { return Math.pow(0.82, Math.min(level, 20) - 1); }

  // mulberry32: small, fast, and the same on every machine.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyRow(w) { var r = new Array(w); for (var x = 0; x < w; x++) r[x] = null; return r; }
  function emptyGrid(w) { var g = []; for (var y = 0; y < HEIGHT; y++) g.push(emptyRow(w)); return g; }

  // Lock a piece into a copy of the grid: place its squares, run its flood,
  // and find the rows that clear. The game and the simulated player both use
  // it. special is { i, kind } or null; kind is 2, 3, 0 (glass) or 'flood'.
  function settle(grid, cells, special, id, shape) {
    var w = grid[0].length, g = grid.map(function (row) { return row.slice(); });
    var floodAt = null, filled = [];
    for (var i = 0; i < cells.length; i++) {
      var v = 1;
      if (special && special.i === i) {
        if (special.kind === 'flood') floodAt = cells[i]; else v = special.kind;
      }
      g[cells[i][1]][cells[i][0]] = { id: id, shape: shape, v: v };
    }
    if (floodAt) {
      for (var k = 0; k < FLOOD.length; k++) {
        var fx = floodAt[0] + FLOOD[k][0], fy = floodAt[1] + FLOOD[k][1];
        if (fx >= 0 && fx < w && fy >= 0 && fy < HEIGHT && !g[fy][fx]) {
          g[fy][fx] = { id: id, shape: shape, v: 1 };
          filled.push([fx, fy]);
        }
      }
    }
    var rows = [];
    for (var y = 0; y < HEIGHT; y++) {
      var sum = 0, gaps = [], glass = 0, values = [];
      for (var x = 0; x < w; x++) {
        var c = g[y][x];
        if (!c) { gaps.push(x); continue; }
        sum += c.v;
        if (c.v === 0) glass++;
        else if (c.v > 1) values.push([x, c.v]);
      }
      if (sum >= w) rows.push({ y: y, gaps: gaps, spare: sum - w, glass: glass, values: values });
    }
    var before = rows.length ? g.map(function (row) { return row.slice(); }) : null;
    if (rows.length) {
      for (var r = rows.length - 1; r >= 0; r--) g.splice(rows[r].y, 1);
      for (var e = 0; e < rows.length; e++) g.unshift(emptyRow(w));
    }
    return { grid: g, floodAt: floodAt, filled: filled, rows: rows, before: before };
  }

  // The balance of each row that holds a 2, a 3 or glass: the gaps it may keep
  // (above 0) or the points it lacks (below 0). For the gauge beside the well.
  function balances(grid) {
    var out = [];
    for (var y = 0; y < grid.length; y++) {
      var b = 0, any = false;
      for (var x = 0; x < grid[y].length; x++) {
        var c = grid[y][x];
        if (c && c.v !== 1) { b += c.v - 1; any = true; }
      }
      if (any && b !== 0) out.push([y, b]);
    }
    return out;
  }

  // A new game. opts: mode ('marathon', 'grow', 'sprint', 'blitz', 'tutorial'
  // or 'demo'), width, sizes, specials, seed, level, lesson, softDropRate.
  function create(opts) {
    opts = opts || {};
    var mode = opts.mode || 'marathon', lesson = opts.lesson || null;
    var W = lesson ? lesson.width : (opts.width || 12);
    var sizes = opts.sizes && opts.sizes.length ? opts.sizes.slice().sort() : [1, 2, 3, 4, 5];
    var specials = opts.specials !== false;
    var seed = opts.seed == null ? Math.floor(Math.random() * 4294967296) : opts.seed;
    var random = rng(seed);
    var startLevel = Math.max(1, opts.level || 1);
    var gravityScale = lesson ? 0.5 : 1;
    var softRate = opts.softDropRate || 20;
    var grid = emptyGrid(W);
    var nextId = 1, lessonLeft = lesson ? lesson.pieces.slice() : null;
    var lockTicks = 0, resets = 0, lowest = 0, fallAcc = 0;

    var g = {
      mode: mode, width: W, rows: ROWS, hidden: HIDDEN, height: HEIGHT, seed: seed,
      grid: grid, piece: null, queue: [], level: startLevel, startLevel: startLevel,
      rowsCleared: 0, score: 0, ticks: 0, pieces: 0, clears: [0, 0, 0, 0, 0, 0, 0], bestMultiplier: 1,
      pause: 0, over: false, result: null, events: [], lesson: lesson,
      step: step, takeEvents: takeEvents, landing: landing, floodPreview: floodPreview,
      pieceCells: pieceCells, placeDirect: placeDirect, cycle: cycle, balances: function () { return balances(grid); },
      deal: function () { return newPiece(); },   // the next random piece, for the tests
      timeLeft: function () { return mode === 'blitz' ? Math.max(0, BLITZ_TICKS - g.ticks) * TICK : null; }
    };

    if (lesson) buildLessonWell(lesson);
    for (var q = 0; q < 4; q++) g.queue.push(newPiece());
    spawn();
    return g;

    function emit(e) { g.events.push(e); }
    function takeEvents() { var e = g.events; g.events = []; return e; }

    function buildLessonWell(ls) {
      var top = HEIGHT - ls.rows.length;
      ls.rows.forEach(function (row, i) {
        var run = null;
        for (var x = 0; x < W; x++) {
          var ch = row[x];
          if (ch === '.' || ch === undefined) { run = null; continue; }
          if (!run) run = nextId++;
          grid[top + i][x] = { id: run, shape: 'stone', v: ch === '2' ? 2 : ch === '3' ? 3 : ch === 'g' ? 0 : 1 };
        }
      });
    }

    function chooseShape() {
      var pool;
      if (mode === 'grow') {
        var stage = GROW[Math.min(g.level, GROW.length) - 1];
        if (stage.five > 0 && random() < stage.five) pool = Pieces.BY_SIZE[5];
        else pool = [].concat.apply([], stage.sizes.filter(function (z) { return z < 5; }).map(function (z) { return Pieces.BY_SIZE[z]; }));
      } else {
        pool = [].concat.apply([], sizes.map(function (z) { return Pieces.BY_SIZE[z]; }));
      }
      return pool[Math.floor(random() * pool.length)];
    }

    function newPiece() {
      if (lessonLeft) {
        var lp = lessonLeft.shift();
        if (!lp) return null;
        return { id: nextId++, shape: lp.shape, o: lp.o || 0, special: lp.special ? { i: lp.special[0], kind: lp.special[1] } : null };
      }
      var shape = chooseShape(), o = Math.floor(random() * 8), n = Pieces.SHAPE[shape].size, special = null;
      if (specials && random() < n * SPECIAL_RATE) {
        var k = random() * 14;
        special = { kind: k < 10 ? 2 : k < 12 ? 3 : k < 13 ? 0 : 'flood', i: Math.floor(random() * n) };
      }
      return { id: nextId++, shape: shape, o: o, special: special };
    }

    function fits(shape, o, bx, bottom) {
      var cells = Pieces.cellsAt(shape, o, bx, bottom);
      for (var i = 0; i < cells.length; i++) {
        var x = cells[i][0], y = cells[i][1];
        if (x < 0 || x >= W || y < 0 || y >= HEIGHT || grid[y][x]) return false;
      }
      return true;
    }
    function grounded(p) { return !fits(p.shape, p.o, p.bx, p.bottom + 1); }
    function pieceCells(p) { p = p || g.piece; return p ? Pieces.cellsAt(p.shape, p.o, p.bx, p.bottom) : []; }

    function spawn() {
      var next = g.queue.shift();
      g.queue.push(newPiece());
      if (!next) { end(lesson ? 'failed' : 'topout'); return; }
      var at = Pieces.spawnAt(next.shape, next.o, W, HIDDEN);
      g.piece = { id: next.id, shape: next.shape, o: next.o, bx: at.bx, bottom: at.bottom, special: next.special };
      lockTicks = 0; resets = 0; lowest = g.piece.bottom; fallAcc = 0;
      if (!fits(g.piece.shape, g.piece.o, g.piece.bx, g.piece.bottom)) {
        emit({ type: 'spawn', piece: g.piece, blocked: true });
        end('topout');
        return;
      }
      emit({ type: 'spawn', piece: g.piece });
    }

    // A move or turn made while resting restarts the lock time, up to 15 times.
    function restartLock(wasResting) {
      if (wasResting && resets < MAX_RESETS) { resets++; lockTicks = 0; }
    }

    function move(dx) {
      var p = g.piece;
      if (!p || !fits(p.shape, p.o, p.bx + dx, p.bottom)) return false;
      var resting = grounded(p);
      p.bx += dx;
      restartLock(resting);
      emit({ type: 'move', dx: dx });
      return true;
    }

    function turn(kind) {
      var p = g.piece;
      if (!p) return false;
      var o2 = kind === 'flip' ? Pieces.flip(p.o) : Pieces.rotate(p.o, kind === 'cw' ? 1 : -1);
      var shifts = [0].concat(kind === 'ccw' ? Pieces.SHIFTS_CCW : Pieces.SHIFTS_CW);
      for (var i = 0; i < shifts.length; i++) {
        if (!fits(p.shape, o2, p.bx + shifts[i], p.bottom)) continue;
        var resting = grounded(p), from = { o: p.o, bx: p.bx };
        p.o = o2; p.bx += shifts[i];
        restartLock(resting);
        emit({ type: kind === 'flip' ? 'flip' : 'rotate', dir: kind, from: from, to: { o: p.o, bx: p.bx } });
        return true;
      }
      return false;
    }

    function cycle() {
      var k = 0;
      while (k < g.queue.length && g.queue[k]) k++;
      if (k < 2) return false;
      g.queue.splice(k - 1, 0, g.queue.shift());
      emit({ type: 'cycle' });
      return true;
    }

    function landing() {
      var p = g.piece;
      if (!p) return null;
      var b = p.bottom;
      while (fits(p.shape, p.o, p.bx, b + 1)) b++;
      return b;
    }

    // The cells a flood would fill if the piece landed now.
    function floodPreview() {
      var p = g.piece;
      if (!p || !p.special || p.special.kind !== 'flood') return [];
      var cells = Pieces.cellsAt(p.shape, p.o, p.bx, landing()), at = cells[p.special.i], out = [];
      var own = {};
      cells.forEach(function (c) { own[c[0] + ',' + c[1]] = true; });
      FLOOD.forEach(function (d) {
        var x = at[0] + d[0], y = at[1] + d[1];
        if (x >= 0 && x < W && y >= 0 && y < HEIGHT && !grid[y][x] && !own[x + ',' + y]) out.push([x, y]);
      });
      return out;
    }

    function hardDrop() {
      var p = g.piece, from = p.bottom;
      while (fits(p.shape, p.o, p.bx, p.bottom + 1)) p.bottom++;
      emit({ type: 'hardDrop', from: from, to: p.bottom, shape: p.shape, cells: pieceCells(p) });
      lock();
    }

    function lock() {
      var p = g.piece, cells = pieceCells(p);
      g.piece = null;
      g.pieces++;
      var out = settle(grid, cells, p.special, p.id, p.shape);
      emit({ type: 'lock', id: p.id, shape: p.shape, cells: cells, special: p.special });
      if (out.floodAt) emit({ type: 'flood', id: p.id, shape: p.shape, at: out.floodAt, filled: out.filled });
      for (var y = 0; y < HEIGHT; y++) grid[y] = out.grid[y];
      var clear = null;
      if (out.rows.length) {
        var n = Math.min(out.rows.length, 6), spare = 0, levelBefore = g.level;
        out.rows.forEach(function (r) { spare += r.spare; });
        var allClear = grid.every(function (row) { return row.every(function (c) { return !c; }); });
        var multiplier = Math.pow(2, spare) * (allClear ? 10 : 1);
        var points = POINTS[n] * levelBefore * multiplier;
        g.score += points;
        g.rowsCleared += out.rows.length;
        g.clears[n]++;
        if (multiplier > g.bestMultiplier) g.bestMultiplier = multiplier;
        if (mode === 'marathon' || mode === 'grow' || mode === 'blitz' || mode === 'demo') {
          g.level = startLevel + Math.floor(g.rowsCleared / 10);
        }
        clear = { type: 'clear', n: n, name: NAMES[n], rows: out.rows, spare: spare, multiplier: multiplier,
                  allClear: allClear, points: points, level: levelBefore, before: out.before, flood: !!out.floodAt };
        emit(clear);
        if (g.level > levelBefore) emit({ type: 'level', level: g.level, grow: mode === 'grow' ? GROW[Math.min(g.level, GROW.length) - 1] : null });
      }
      if (lesson && clear && lesson.goal(clear)) { end('passed'); return; }
      if (mode === 'sprint' && g.rowsCleared >= SPRINT_ROWS) { end('won'); return; }
      if (clear) g.pause = CLEAR_TICKS; else spawn();
    }

    function end(result) {
      if (g.over) return;
      g.over = true; g.result = result; g.piece = g.piece && result === 'topout' ? g.piece : null;
      emit({ type: 'over', result: result });
    }

    // Put the falling piece straight into an orientation and column, if it
    // fits where it is, then drop it. For the simulated player and the tests.
    function placeDirect(o, bx) {
      var p = g.piece;
      if (!p || g.over || !fits(p.shape, o, bx, p.bottom)) return false;
      p.o = o; p.bx = bx;
      hardDrop();
      while (!g.over && g.pause > 0) step({});
      return true;
    }

    // One step. input: left and right (squares to move, usually 1), cw, ccw,
    // flip, cycle and hardDrop (once each), and softDrop (held).
    function step(input) {
      input = input || {};
      if (g.over) return;
      g.ticks++;
      if (mode === 'blitz' && g.ticks >= BLITZ_TICKS) { end('time'); return; }
      if (input.cycle) cycle();
      if (g.pause > 0) {
        if (--g.pause === 0) spawn();
        return;
      }
      var p = g.piece;
      if (!p) return;
      if (input.flip) turn('flip');
      if (input.cw) turn('cw');
      if (input.ccw) turn('ccw');
      for (var l = 0; l < (input.left | 0); l++) if (!move(-1)) break;
      for (var r = 0; r < (input.right | 0); r++) if (!move(1)) break;
      if (input.hardDrop) { hardDrop(); return; }
      var speedLevel = mode === 'sprint' || lesson ? 1 : g.level;
      var rate = TICK / (secondsPerRow(speedLevel) / gravityScale);
      if (input.softDrop) rate = Math.max(rate, softRate * TICK);
      fallAcc += rate;
      while (fallAcc >= 1) {
        if (!fits(p.shape, p.o, p.bx, p.bottom + 1)) { fallAcc = 0; break; }
        p.bottom++;
        fallAcc -= 1;
        if (p.bottom > lowest) { lowest = p.bottom; resets = 0; lockTicks = 0; }
      }
      if (grounded(p)) {
        if (resets >= MAX_RESETS || ++lockTicks >= LOCK_TICKS) lock();
      } else {
        lockTicks = 0;
      }
    }
  }

  Pentrys.Rules = {
    ROWS: ROWS, HIDDEN: HIDDEN, HEIGHT: HEIGHT, TICK: TICK, POINTS: POINTS, NAMES: NAMES, GROW: GROW,
    SPRINT_ROWS: SPRINT_ROWS, BLITZ_TICKS: BLITZ_TICKS, CLEAR_TICKS: CLEAR_TICKS, LOCK_TICKS: LOCK_TICKS,
    secondsPerRow: secondsPerRow, rng: rng, settle: settle, balances: balances, emptyGrid: emptyGrid, create: create
  };
})(typeof window !== 'undefined' ? window : globalThis);
