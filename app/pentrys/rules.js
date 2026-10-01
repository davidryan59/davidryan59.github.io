/* The rules of Pentrys: the well, the pieces and queue, special squares,
   falling, locking, smashing glass, bombs, floods, clearing, scoring, speeds
   and the modes. See docs/pentrys.md.

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
  var Pieces = Pentrys.Pieces, C = Pentrys.Config;

  // The tuning numbers live in config.js.
  var ROWS = 20, HIDDEN = 4, HEIGHT = ROWS + HIDDEN;
  var TICK = 1 / 60;
  var LOCK_TICKS = C.lockTicks, MAX_RESETS = C.maxResets, CLEAR_TICKS = C.clearTicks;
  var SPEEDS = C.speeds, EASY_FIRST = C.difficulty.easy.firstRowSeconds;
  var ROW_POINTS = C.rowPoints;
  var NAMES = ['', 'Single', 'Double', 'Triple', 'Quad', 'Pentrys', 'Hextrys'];
  var CRACK_TICKS = C.glassCrackSeconds.map(function (t) { return t * 60; }), FLASH_TICKS = C.glassFlashSeconds * 60, BREAK_TICKS = C.glassBreakSeconds * 60;
  var FLOOD = [[-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];   // beside and below, never above
  var SQUARES = C.squares;
  var QUEUE = C.queueLength;

  // The seconds a row at a speed, for a game whose speed 1 falls at first
  // seconds a row. Each speed falls the same number of times faster than the
  // one before, up to the top speed shared by every game.
  function secondsPerRow(speed, first) {
    first = first || EASY_FIRST;
    var ratio = Math.pow(first / C.lastRowSeconds, 1 / (SPEEDS - 1));
    return first / Math.pow(ratio, Math.min(Math.max(speed, 1), SPEEDS) - 1);
  }
  // What a speed multiplies points by, to a tenth: ×1 at 1 s a row, up to the
  // top multiplier at the top speed, evenly on a log scale of seconds a row.
  function speedMultiplier(speed, first) {
    var part = Math.max(0, Math.log(secondsPerRow(speed, first)) / Math.log(C.lastRowSeconds));
    return Math.round(10 * (1 + (C.topSpeedMultiplier - 1) * part)) / 10;
  }
  // A resting piece locks after a little more than the time it takes to fall
  // a row, and never sooner than LOCK_TICKS, so the fast speeds stay playable.
  function lockAfter(secondsARow) { return Math.max(LOCK_TICKS, Math.round(C.lockRows * secondsARow * 60)); }
  // Past six rows, each row adds half the points of one row fewer.
  function rowPoints(n) { return n <= 6 ? ROW_POINTS[n] : Math.round(ROW_POINTS[6] * Math.pow(1.5, n - 6)); }
  function clearName(n) { return n <= 6 ? NAMES[n] : n + ' rows'; }

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
  function inside(grid, x, y) { return x >= 0 && x < grid[0].length && y >= 0 && y < grid.length; }

  // Where a piece comes to rest, falling from bottom. With smash, a piece
  // that rests on glass and nothing else breaks that glass and falls on.
  // Returns the resting bottom row and the glass it broke, leaving the grid
  // as it was.
  function land(grid, shape, o, bx, bottom, smash) {
    var H = grid.length, W = grid[0].length, or = Pieces.SHAPE[shape].orients[o], oc = or.cells, n = oc.length;
    var gone = null, smashed = [];
    function solid(x, y) { return grid[y][x] && !(gone && gone[x + ',' + y]); }
    function fits(b) {
      for (var i = 0; i < n; i++) {
        var x = bx + oc[i][0], y = b - or.maxY + oc[i][1];
        if (x < 0 || x >= W || y < 0 || y >= H || solid(x, y)) return false;
      }
      return true;
    }
    for (;;) {
      while (fits(bottom + 1)) bottom++;
      if (!smash) break;
      // What holds the piece up: the floor, squares, or glass alone.
      var glass = null, held = false;
      for (var i = 0; i < n && !held; i++) {
        var own = false;
        for (var j = 0; j < n; j++) if (oc[j][0] === oc[i][0] && oc[j][1] === oc[i][1] + 1) { own = true; break; }
        if (own) continue;
        var x = bx + oc[i][0], y = bottom - or.maxY + oc[i][1] + 1;
        if (y >= H) held = true;
        else if (solid(x, y)) { if (grid[y][x].v === 0) (glass = glass || []).push([x, y]); else held = true; }
      }
      if (held || !glass) break;
      gone = gone || {};
      for (var k = 0; k < glass.length; k++) { gone[glass[k][0] + ',' + glass[k][1]] = true; smashed.push(glass[k]); }
    }
    return { bottom: bottom, smashed: smashed };
  }

  // The gaps a flood fills: the five beside and below it, and its own cell if
  // a blast emptied it. Each comes with its distance from the flood.
  function floodFill(g, at) {
    var out = [];
    if (!g[at[1]][at[0]]) out.push([at[0], at[1], 0]);
    FLOOD.forEach(function (d) {
      var x = at[0] + d[0], y = at[1] + d[1];
      if (inside(g, x, y) && !g[y][x]) out.push([x, y, 1]);
    });
    return out;
  }
  // The gaps a deluge fills: the five a flood fills, and every gap the water
  // then reaches below its row, however deep. A hole is a gap with a square
  // somewhere above it. The water settles: it always pours straight down,
  // and it moves sideways or up only into a hole, or out of one. So it fills
  // caves and shafts, never hangs over a gap, and never spreads across the
  // open well.
  function delugeFill(g, at) {
    var out = [], seen = {}, queue = [], x0 = at[0], y0 = at[1], roof = [];
    for (var x = 0; x < g[0].length; x++) { roof[x] = g.length; for (var y = 0; y < g.length; y++) if (g[y][x]) { roof[x] = y; break; } }
    function add(x, y, d) {
      var k = x + ',' + y;
      if (!inside(g, x, y) || g[y][x] || seen[k]) return false;
      seen[k] = true; out.push([x, y, d]); return true;
    }
    add(x0, y0, 0); add(x0 - 1, y0, 1); add(x0 + 1, y0, 1);
    [-1, 0, 1].forEach(function (dx) { if (add(x0 + dx, y0 + 1, 1)) queue.push([x0 + dx, y0 + 1, 1]); });
    for (var q = 0; q < queue.length; q++) {
      var c = queue[q];
      var fromHole = roof[c[0]] < c[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var x = c[0] + d[0], y = c[1] + d[1];
        if (y <= y0 || !inside(g, x, y)) return;
        var hole = roof[x] < y, ok = d[1] === 1 || hole || (fromHole && d[1] === 0);
        if (ok && add(x, y, c[2] + 1)) queue.push([x, y, c[2] + 1]);
      });
    }
    return out;
  }

  // The squares the floor holds up: each one on the floor, resting on a held
  // square, or joined to a held square of its own piece.
  function heldUp(g) {
    var seen = new Set(), queue = [];
    function hold(x, y) {
      var c = inside(g, x, y) && g[y][x];
      if (c && !seen.has(c)) { seen.add(c); queue.push([x, y]); }
    }
    for (var x = 0; x < g[0].length; x++) hold(x, g.length - 1);
    for (var q = 0; q < queue.length; q++) {
      var qx = queue[q][0], qy = queue[q][1], own = g[qy][qx].id;
      hold(qx, qy - 1);
      [[1, 0], [-1, 0], [0, 1]].forEach(function (d) {
        var n = inside(g, qx + d[0], qy + d[1]) && g[qy + d[1]][qx + d[0]];
        if (n && n.id === own) hold(qx + d[0], qy + d[1]);
      });
    }
    return seen;
  }

  // Lock a piece into a copy of the grid, as the game and the simulated
  // player both need. In order: its squares go in, its bombs go off, its
  // floods and deluges fill, and then every row that adds up to the width
  // clears, along with each row bomb's row. A special square caught in a
  // blast still acts. specials lists { i, kind } by the piece's squares.
  // opts: smashed, glass a hard drop broke first; tick, the game's clock.
  function settle(grid, cells, specials, id, shape, opts) {
    opts = opts || {};
    var w = grid[0].length, g = grid.map(function (row) { return row.slice(); });
    (opts.smashed || []).forEach(function (c) { g[c[1]][c[0]] = null; });
    var kindOf = {}, bombs = [], waters = [], rowBombs = [];
    (specials || []).forEach(function (s) { kindOf[s.i] = s.kind; });
    cells.forEach(function (c, i) {
      var k = kindOf[i], v = k === 2 || k === 3 || k === 0 ? k : 1, cell = { id: id, shape: shape, v: v };
      if (v === 0) cell.born = opts.tick || 0;
      g[c[1]][c[0]] = cell;
      if (k === 'bomb') bombs.push(c);
      else if (k === 'flood' || k === 'deluge') waters.push({ at: c, kind: k });
      else if (k === 'rowbomb') rowBombs.push(c);
    });

    var blasts = [], destroyed = [], heldBefore = bombs.length ? heldUp(g) : null;
    bombs.forEach(function (b) {
      var hit = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var x = b[0] + dx, y = b[1] + dy;
        if (inside(g, x, y) && g[y][x]) { hit.push({ x: x, y: y, shape: g[y][x].shape, v: g[y][x].v }); g[y][x] = null; }
      }
      blasts.push({ at: b, cells: hit });
      destroyed = destroyed.concat(hit);
    });

    // The crater closes. In each column a blast reached, every square above
    // the crater breaks away from its piece as a single square and falls as
    // far as it can, through the crater and any gaps below. Floods, deluges
    // and row bombs fall with their squares, or act from where they were if
    // the blast took them.
    // The blast's three columns count, whether or not the blast hit a square
    // in each, and everything above the blast's top row falls.
    var roofOf = {}, falls = [], moved = {}, from = {}, single = 0, rubble = new Set();
    // A square breaks away from its piece as a single square, and falls as far as it can.
    function drop(x, y) {
      var c = g[y][x], to = y;
      while (to + 1 < g.length && !g[to + 1][x]) to++;
      var piece = c;
      if (!rubble.has(c)) {
        piece = { id: id + ':' + (single++), shape: c.shape, v: c.v };
        if (c.born != null) piece.born = c.born;
        if (c.crack) piece.crack = c.crack;
        rubble.add(piece);
      }
      g[y][x] = null; g[to][x] = piece;
      var k = x + ',' + y, start = from[k] || k;
      delete from[k]; from[x + ',' + to] = start;
      moved[start] = [x, to];
      if (to !== y) falls.push([x, to]);
    }
    bombs.forEach(function (b) {
      for (var dx = -1; dx <= 1; dx++) {
        var x = b[0] + dx;
        if (x >= 0 && x < w) roofOf[x] = Math.min(roofOf[x] == null ? b[1] - 1 : roofOf[x], b[1] - 1);
      }
    });
    Object.keys(roofOf).forEach(function (k) {
      var x = +k, top = roofOf[x];
      for (var y = top - 1; y >= 0; y--) if (g[y][x]) drop(x, y);
    });
    // Then the squares the blast cut loose. A square the floor held up before
    // the blast, but no longer does, breaks away and falls too: the ends of a
    // piece cut through, and anything resting on them. A square that hung in
    // the air before the blast stays where it is.
    if (bombs.length) {
      var heldAfter = heldUp(g);
      for (var ly = g.length - 1; ly >= 0; ly--) for (var lx = 0; lx < w; lx++) {
        var lc = g[ly][lx];
        if (lc && !heldAfter.has(lc) && (heldBefore.has(lc) || rubble.has(lc))) drop(lx, ly);
      }
    }
    function settled(c) { return moved[c[0] + ',' + c[1]] || c; }
    waters.forEach(function (wt) { wt.at = settled(wt.at); });
    rowBombs = rowBombs.map(settled);

    var fills = [], filled = [];
    waters.forEach(function (wt) {
      var f = wt.kind === 'flood' ? floodFill(g, wt.at) : delugeFill(g, wt.at);
      f.forEach(function (c) { g[c[1]][c[0]] = { id: id, shape: shape, v: 1 }; });
      fills.push({ at: wt.at, kind: wt.kind, filled: f });
      filled = filled.concat(f);
    });

    var bombRow = {};
    rowBombs.forEach(function (c) { bombRow[c[1]] = true; });
    var rows = [];
    for (var y = 0; y < HEIGHT; y++) {
      var sum = 0, gaps = [], glass = 0, values = [], squares = 0;
      for (var x = 0; x < w; x++) {
        var c = g[y][x];
        if (!c) { gaps.push(x); continue; }
        squares++; sum += c.v;
        if (c.v === 0) glass++;
        else if (c.v > 1) values.push([x, c.v]);
      }
      var full = sum >= w;
      if (full || (bombRow[y] && squares)) rows.push({ y: y, gaps: gaps, spare: full ? sum - w : 0, glass: glass, values: values, rowBomb: !!bombRow[y] });
    }
    var before = rows.length ? g.map(function (row) { return row.slice(); }) : null;
    if (rows.length) {
      for (var r = rows.length - 1; r >= 0; r--) g.splice(rows[r].y, 1);
      for (var e = 0; e < rows.length; e++) g.unshift(emptyRow(w));
    }
    return { grid: g, rows: rows, before: before, blasts: blasts, destroyed: destroyed, falls: falls, fills: fills, filled: filled, rowBombs: rowBombs };
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

  // A new game. opts: mode ('marathon', 'tutorial' or 'demo'), width, sizes,
  // squares (a set in config.js), seed, speed (the one it starts at),
  // firstRowSeconds (how fast its speed 1 falls), choiceRows, lesson,
  // softDropRate.
  function create(opts) {
    opts = opts || {};
    var mode = opts.mode || 'marathon', lesson = opts.lesson || null;
    var W = lesson ? lesson.width : (opts.width || 12);
    var sizes = opts.sizes && opts.sizes.length ? opts.sizes.slice().sort() : [1, 2, 3, 4, 5];
    var squares = SQUARES[opts.squares] ? opts.squares : 'normal';
    var table = SQUARES[squares];
    var seed = opts.seed == null ? Math.floor(Math.random() * 4294967296) : opts.seed;
    var random = rng(seed);
    var startSpeed = Math.max(1, Math.min(SPEEDS, opts.speed || 1));
    var firstRow = lesson ? EASY_FIRST : opts.firstRowSeconds || EASY_FIRST;
    var gravityScale = lesson ? 0.5 : 1;
    var softRate = opts.softDropRate || 20;
    var ageing = mode !== 'tutorial';   // glass in a lesson never breaks with age
    // A lesson's falling piece, and the main menu's game's, is fixed from the start.
    var choiceRows = lesson || mode === 'demo' ? 0 : opts.choiceRows != null ? opts.choiceRows : C.difficulty.normal.choiceRows;
    var choosing = choiceRows > 0;
    var grid = emptyGrid(W);
    var nextId = 1, lessonLeft = lesson ? lesson.pieces.slice() : null;
    var lockTicks = 0, resets = 0, lowest = 0, fallAcc = 0, preview = { key: null, value: null };

    var g = {
      mode: mode, width: W, rows: ROWS, hidden: HIDDEN, height: HEIGHT, seed: seed, squares: squares,
      grid: grid, piece: null, queue: [], speed: startSpeed, startSpeed: startSpeed, clearCount: 0, firstRowSeconds: firstRow,
      rowsCleared: 0, score: 0, ticks: 0, pieces: 0, clears: emptyRow(HEIGHT + 1).map(function () { return 0; }),
      bestMultiplier: 1, streak: 0, version: 0, choosing: choosing, choiceRows: choiceRows,
      pause: 0, over: false, result: null, events: [], lesson: lesson,
      step: step, takeEvents: takeEvents, landing: landing, preview: showPreview,
      pieceCells: pieceCells, placeDirect: placeDirect, cycle: cycle, bump: bump, balances: function () { return balances(grid); },
      deal: function () { return newPiece(); },   // the next random piece, for the tests
      glassAge: function (cell) { return ageing && cell && cell.v === 0 && cell.born != null ? g.ticks - cell.born : 0; }
    };

    if (lesson) buildLessonWell(lesson);
    for (var q = 0; q < QUEUE; q++) g.queue.push(newPiece());
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
      var pool = [].concat.apply([], sizes.map(function (z) { return Pieces.BY_SIZE[z]; }));
      return pool[Math.floor(random() * pool.length)];
    }

    // Each square of a new piece is special or not on its own, so a piece can
    // carry several.
    function rollSpecials(n) {
      var out = [];
      if (!table.length) return out;
      for (var i = 0; i < n; i++) {
        var r = random(), acc = 0;
        for (var k = 0; k < table.length; k++) {
          acc += table[k][1];
          if (r < acc) { out.push({ i: i, kind: table[k][0] }); break; }
        }
      }
      return out;
    }

    function newPiece() {
      if (lessonLeft) {
        var lp = lessonLeft.shift();
        if (!lp) return null;
        var list = (lp.specials || (lp.special ? [lp.special] : [])).map(function (s) { return { i: s[0], kind: s[1] }; });
        return { id: nextId++, shape: lp.shape, o: lp.o || 0, specials: list };
      }
      var shape = chooseShape(), o = Math.floor(random() * 8);
      return { id: nextId++, shape: shape, o: o, specials: rollSpecials(Pieces.SHAPE[shape].size) };
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
      g.piece = { id: next.id, shape: next.shape, o: next.o, bx: at.bx, bottom: at.bottom, specials: next.specials, open: choosing };
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

    // The choice. A new piece is open: until it falls choiceRows rows, or
    // the player drops it at all, it counts as the queue's place 0, and the
    // player's cycle and bump take it in. It keeps its height when swapped,
    // so swapping never holds it up. g.cycle and g.bump act on the queue alone.
    function open() { return !!(g.piece && g.piece.open); }
    function swapIn(next) {
      var p = g.piece, at = Pieces.spawnAt(next.shape, next.o, W, HIDDEN);
      if (!fits(next.shape, next.o, at.bx, p.bottom)) return null;
      g.piece = { id: next.id, shape: next.shape, o: next.o, bx: at.bx, bottom: p.bottom, specials: next.specials, open: true };
      emit({ type: 'swap', piece: g.piece });
      return { id: p.id, shape: p.shape, o: p.o, specials: p.specials };
    }
    function chooseCycle() {
      if (!open()) return cycle();
      var k = 0;
      while (k < g.queue.length && g.queue[k]) k++;
      if (k < 1) return false;
      var back = swapIn(g.queue[0]);
      if (!back) return false;
      g.queue.shift();
      g.queue.splice(k - 1, 0, back);
      emit({ type: 'cycle', to: k - 1 });
      return true;
    }
    function chooseBump(i) {
      if (!open()) return bump(i);
      if (!(i >= 0 && i < g.queue.length && g.queue[i])) return false;
      var back = swapIn(g.queue[i]);
      if (!back) return false;
      g.queue.splice(i, 1);
      g.queue.unshift(back);
      emit({ type: 'bump', from: i, swap: true });
      return true;
    }

    // Cycle: the front piece goes to the back, and the rest move up one.
    function cycle() {
      var k = 0;
      while (k < g.queue.length && g.queue[k]) k++;
      if (k < 2) return false;
      g.queue.splice(k - 1, 0, g.queue.shift());
      emit({ type: 'cycle', to: k - 1 });
      return true;
    }
    // Bump: the piece at place i (0 is the front) moves to the front, and
    // the pieces before it move back one.
    function bump(i) {
      if (!(i >= 1 && i < g.queue.length && g.queue[i])) return false;
      g.queue.unshift(g.queue.splice(i, 1)[0]);
      emit({ type: 'bump', from: i });
      return true;
    }

    // Where a hard drop would put the falling piece, glass smashed and all.
    function landing() {
      var p = g.piece;
      return p ? land(grid, p.shape, p.o, p.bx, p.bottom, true).bottom : null;
    }

    // What a hard drop would do now: where the piece lands, the glass it
    // smashes, the squares its bombs destroy, the gaps its floods fill, and
    // the rows that clear. Worked out again only when something changes.
    function showPreview() {
      var p = g.piece;
      if (!p) return null;
      var key = [p.id, p.o, p.bx, p.bottom, g.version].join(':');
      if (preview.key === key) return preview.value;
      var l = land(grid, p.shape, p.o, p.bx, p.bottom, true), value = { bottom: l.bottom, smashed: l.smashed, destroyed: [], filled: [], rows: [], rowBombs: [] };
      if (p.specials.length || l.smashed.length) {
        var out = settle(grid, Pieces.cellsAt(p.shape, p.o, p.bx, l.bottom), p.specials, p.id, p.shape, { smashed: l.smashed });
        value.destroyed = out.destroyed; value.filled = out.filled;
        value.rows = out.rows.map(function (r) { return r.y; });
        value.rowBombs = out.rows.filter(function (r) { return r.rowBomb; }).map(function (r) { return r.y; });
      }
      preview = { key: key, value: value };
      return value;
    }

    function hardDrop() {
      var p = g.piece, from = p.bottom, l = land(grid, p.shape, p.o, p.bx, p.bottom, true);
      var smashed = l.smashed.map(function (c) { return [c[0], c[1], grid[c[1]][c[0]].shape]; });
      l.smashed.forEach(function (c) { grid[c[1]][c[0]] = null; });
      if (smashed.length) g.version++;
      p.bottom = l.bottom;
      g.score += C.hardDropPoints * (p.bottom - from);
      emit({ type: 'hardDrop', from: from, to: p.bottom, shape: p.shape, cells: pieceCells(p) });
      if (smashed.length) emit({ type: 'smash', cells: smashed });
      lock(smashed.length);
    }

    function lock(smashed) {
      var p = g.piece, cells = pieceCells(p);
      g.piece = null;
      g.pieces++;
      var out = settle(grid, cells, p.specials, p.id, p.shape, { tick: g.ticks });
      emit({ type: 'lock', id: p.id, shape: p.shape, cells: cells, specials: p.specials });
      out.blasts.forEach(function (b) { emit({ type: 'blast', at: b.at, cells: b.cells }); });
      out.fills.forEach(function (f) { emit({ type: 'fill', kind: f.kind, id: p.id, shape: p.shape, at: f.at, filled: f.filled }); });
      out.rowBombs.forEach(function (c) { emit({ type: 'rowbomb', at: c, y: c[1] }); });
      for (var y = 0; y < HEIGHT; y++) grid[y] = out.grid[y];
      g.version++;

      // The score: the rows, times every bonus they earned, plus flat points
      // for glass smashed or blasted, all times the speed multiplier.
      var speed = g.speed, speedMult = speedMultiplier(speed, firstRow), lines = [], add = 0, mult = 1, base = 0, n = out.rows.length;
      var blastGlass = out.destroyed.filter(function (c) { return c.v === 0; }).length;
      var floods = 0, deluges = 0;
      out.fills.forEach(function (f) { if (f.kind === 'flood') floods += f.filled.length; else deluges += f.filled.length; });
      if (smashed) { lines.push({ name: 'Smash', add: C.smashPoints * smashed }); add += C.smashPoints * smashed; }
      if (blastGlass) { lines.push({ name: 'Blast', add: C.blastGlassPoints * blastGlass }); add += C.blastGlassPoints * blastGlass; }
      var clear = null, allClear = false, spare = 0, glass = 0, crystal = 0;
      if (n) {
        g.streak++;
        base = rowPoints(n);
        out.rows.forEach(function (r) { spare += r.spare; glass += r.glass; if (r.glass && r.spare) crystal++; });
        allClear = grid.every(function (row) { return row.every(function (c) { return !c; }); });
        var bonus = [];
        if (out.rowBombs.length) bonus.push({ name: 'Row bomb' });
        if (spare) bonus.push({ name: 'Spare ' + spare, mult: spare === 1 ? C.spareOne : spare });
        if (glass) bonus.push({ name: glass > 1 ? glass + ' glass' : 'Glass', mult: Math.pow(C.glassBonus, glass) });
        if (crystal) bonus.push({ name: 'Crystal', mult: Math.pow(C.crystalBonus, crystal) });
        if (g.streak >= C.streakFrom) bonus.push({ name: 'Streak ' + g.streak, mult: g.streak });
        if (allClear) bonus.push({ name: 'All clear', mult: C.allClearBonus });
        bonus.forEach(function (b) { if (b.mult) mult *= b.mult; });
        mult = Math.round(mult * 1000) / 1000;
        lines = [{ name: clearName(n), base: base }].concat(bonus, lines);
      } else g.streak = 0;
      var points = Math.round(speedMult * (base * mult + add));
      if (points && speedMult !== 1) lines.push({ name: 'Speed ' + speed, mult: speedMult });
      g.score += points;

      if (n) {
        g.rowsCleared += n;
        g.clears[n]++;
        if (mult > g.bestMultiplier) g.bestMultiplier = mult;
        // The speed goes up after every so many clears, whatever their size.
        if (!lesson) { g.clearCount++; g.speed = Math.min(SPEEDS, startSpeed + Math.floor(g.clearCount / C.clearsPerSpeed)); }
        clear = { type: 'clear', n: n, name: clearName(n), rows: out.rows, spare: spare, glass: glass, multiplier: mult,
                  allClear: allClear, base: base, points: points, speed: speed, before: out.before,
                  flood: floods > 0, deluge: deluges > 0, rowBomb: out.rowBombs.length > 0, streak: g.streak };
        emit(clear);
      }
      if (points) {
        var top = n ? out.rows[0].y : Math.min.apply(null, cells.map(function (c) { return c[1]; }));
        emit({ type: 'combo', lines: lines, points: points, n: n, name: n ? clearName(n) : lines[0].name, multiplier: mult, y: top });
      }
      if (n && g.speed > speed) emit({ type: 'speed', speed: g.speed });

      // What the lock did, for a lesson's goal.
      var report = clear || { n: 0, rows: [], spare: 0, glass: 0, multiplier: 1, flood: floods > 0, deluge: deluges > 0, rowBomb: false };
      report.smashed = smashed; report.blastGlass = blastGlass; report.blasted = out.destroyed.length;
      if (lesson && lesson.goal(report)) { end('passed'); return; }
      if (clear) g.pause = CLEAR_TICKS; else spawn();
    }

    // Glass in the stack cracks at 30 s and 45 s, and breaks at 60 s. Time
    // counts while the game runs, not while it is paused.
    function age() {
      for (var y = 0; y < HEIGHT; y++) for (var x = 0; x < W; x++) {
        var c = grid[y][x];
        if (!c || c.v !== 0 || c.born == null) continue;
        var t = g.ticks - c.born;
        if (t >= BREAK_TICKS) {
          grid[y][x] = null; g.version++;
          emit({ type: 'shatter', x: x, y: y, shape: c.shape });
        } else {
          var stage = t >= CRACK_TICKS[1] ? 2 : t >= CRACK_TICKS[0] ? 1 : 0;
          if (stage !== (c.crack || 0)) { c.crack = stage; g.version++; emit({ type: 'crack', x: x, y: y, stage: stage }); }
        }
      }
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
    // flip, cycle and hardDrop (once each), bump (the queue place to bring
    // to the front), and softDrop (held). Cycle and bump take in an open piece.
    function step(input) {
      input = input || {};
      if (g.over) return;
      g.ticks++;
      if (ageing) age();
      if (input.cycle) chooseCycle();
      if (input.bump != null) chooseBump(input.bump);
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
      var speedNow = lesson ? 1 : g.speed;
      var rate = TICK / (secondsPerRow(speedNow, firstRow) / gravityScale);
      if (input.softDrop) rate = Math.max(rate, softRate * TICK);
      fallAcc += rate;
      while (fallAcc >= 1) {
        if (!fits(p.shape, p.o, p.bx, p.bottom + 1)) { fallAcc = 0; break; }
        p.bottom++;
        fallAcc -= 1;
        // The choice closes once the piece is dropped at all, or falls choiceRows rows.
        if (p.open && (input.softDrop || p.bottom - HIDDEN >= choiceRows)) p.open = false;
        if (input.softDrop) g.score += C.softDropPoints;
        if (p.bottom > lowest) { lowest = p.bottom; resets = 0; lockTicks = 0; }
      }
      if (grounded(p)) {
        if (resets >= MAX_RESETS || ++lockTicks >= lockAfter(secondsPerRow(speedNow, firstRow) / gravityScale)) lock(0);
      } else {
        lockTicks = 0;
      }
    }
  }

  Pentrys.Rules = {
    ROWS: ROWS, HIDDEN: HIDDEN, HEIGHT: HEIGHT, TICK: TICK, ROW_POINTS: ROW_POINTS, NAMES: NAMES,
    SQUARES: SQUARES, QUEUE: QUEUE, SPEEDS: SPEEDS, CRACK_TICKS: CRACK_TICKS, FLASH_TICKS: FLASH_TICKS, BREAK_TICKS: BREAK_TICKS,
    CLEAR_TICKS: CLEAR_TICKS, LOCK_TICKS: LOCK_TICKS,
    secondsPerRow: secondsPerRow, speedMultiplier: speedMultiplier, lockTicks: lockAfter, rowPoints: rowPoints, clearName: clearName, rng: rng, land: land, settle: settle,
    balances: balances, emptyGrid: emptyGrid, create: create
  };
})(typeof window !== 'undefined' ? window : globalThis);
