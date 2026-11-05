/* The Pentrys film. The game's own rules run on the film's clock and the game's
   own drawing paints the well. This file adds what a trailer adds: a camera, slow
   motion, the side panel's celebrations laid over the well, shockwaves, sparks,
   confetti of real pieces, a bloom pass and the wipes between sections. It adds no
   game rule. See storyboard.md. */
(function () {
  'use strict';
  var P = window.Pentrys, Pieces = P.Pieces, Rules = P.Rules, Draw = P.Draw, Bot = P.Bot;
  var W = 1080, H = 1080, FPS = 60, DUR = 30, FRAMES = FPS * DUR, DT = 1 / FPS, S = 100, STEP = 1000 / 60;
  var HIDDEN = Rules.HIDDEN, HEIGHT = Rules.HEIGHT, TOP = Draw.TOP, GAUGE = Draw.GAUGE, COLS = 12;
  var FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif', GOLD = '#ffd66b', SLANT = -Math.tan(9 * Math.PI / 180);
  var RAINBOW = ['#03e8e3', '#3aadff', '#8782fe', '#cd70f0', '#fe6ab9', '#ff7267', '#fe981a', '#fbc906', '#abe841', '#11ed8f', '#03e8e3'];

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry(20261105);
  var rnd = mulberry(59);
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smooth(v) { v = clamp(v, 0, 1); return v * v * v * (v * (v * 6 - 15) + 10); }
  function out3(v) { v = clamp(v, 0, 1); return 1 - Math.pow(1 - v, 3); }
  function backOut(v) { v = clamp(v, 0, 1); var c = 1.9; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); }

  // Canvases -----------------------------------------------------------------------

  var main = document.getElementById('film'), ctx = main.getContext('2d');
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  var wellCv = canvas(10, 10), nextCv = canvas(10, 10), wallCv = canvas(W, H);
  var bloomA = canvas(270, 270), bloomB = canvas(270, 270), bloomAx = bloomA.getContext('2d'), bloomBx = bloomB.getContext('2d');
  var caSrc = canvas(W, H), caTmp = canvas(W, H), caSrcX = caSrc.getContext('2d'), caTmpX = caTmp.getContext('2d');
  Draw.init({ well: wellCv, next: nextCv, wall: wallCv });
  Draw.setTheme(false);
  Draw.layout(COLS, S, { cell: 10, row: false, width: 100, height: 100 });
  Draw.wallpaper(wallCv, false);

  // A piece drawn by the game into its own small canvas.
  function sprite(shape, o, specials, cell) { var c = document.createElement('canvas'); Draw.icon(c, shape, o, specials || [], cell); return c; }

  var CONFETTI = Pieces.SHAPES.map(function (name) { return sprite(name, 0, [], 26); });

  // The well's panel as a full-bleed background for the title card.
  var cardBg = canvas(W, H);
  (function () {
    var c = cardBg.getContext('2d'), g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#151b3d'); g.addColorStop(1, '#0a0d20');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(170,190,255,0.16)';
    for (var x = 90; x < W; x += 90) for (var y = 90; y < H; y += 90) { c.beginPath(); c.arc(x, y, 3.4, 0, Math.PI * 2); c.fill(); }
  })();
  var vignette = canvas(W, H);
  (function () {
    var c = vignette.getContext('2d'), g = c.createRadialGradient(W / 2, H / 2, W * 0.42, W / 2, H / 2, W * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  })();

  // Tiling a stack with real pieces ----------------------------------------------------

  // Fill the '#', 2, 3 and g cells of rows with pieces. Returns each piece with its
  // shape, orientation and cells, in the piece's own square order.
  function tile(rows, seed) {
    var r = mulberry(seed), h = rows.length, w = rows[0].length;
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var want = rows.map(function (s) { return s.split('').map(function (c) { return c !== '.'; }); });
    function attempt(sizes) {
      var owner = rows.map(function () { return new Array(w).fill(-1); }), placed = [], steps = 0;
      function free(x, y) { return y >= 0 && y < h && x >= 0 && x < w && want[y][x] && owner[y][x] < 0; }
      function solve() {
        var ax = -1, ay = -1;
        for (var y = 0; y < h && ax < 0; y++) for (var x = 0; x < w; x++) if (free(x, y)) { ax = x; ay = y; break; }
        if (ax < 0) return true;
        if (++steps > 40000) return false;
        var big = [], small = [];
        sizes.forEach(function (z) { (z >= 3 ? big : small).push.apply(z >= 3 ? big : small, Pieces.BY_SIZE[z]); });
        var pool = shuffle(big).concat(small.sort(function (a, b) { return Pieces.SHAPE[b].size - Pieces.SHAPE[a].size; }));
        for (var i = 0; i < pool.length; i++) {
          var os = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
          for (var k = 0; k < 8; k++) {
            var cells = Pieces.shapeCells(pool[i], os[k]), first = cells[0];
            cells.forEach(function (c) { if (c[1] < first[1] || (c[1] === first[1] && c[0] < first[0])) first = c; });
            var at = cells.map(function (c) { return [ax + c[0] - first[0], ay + c[1] - first[1]]; });
            if (!at.every(function (c) { return free(c[0], c[1]); })) continue;
            var clash = at.some(function (c) {
              return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) {
                var x2 = c[0] + d[0], y2 = c[1] + d[1];
                return y2 >= 0 && y2 < h && x2 >= 0 && x2 < w && owner[y2][x2] >= 0 && placed[owner[y2][x2]].shape === pool[i];
              });
            });
            if (clash) continue;
            var id = placed.length;
            placed.push({ shape: pool[i], o: os[k], cells: at });
            at.forEach(function (c) { owner[c[1]][c[0]] = id; });
            if (solve()) return true;
            at.forEach(function (c) { owner[c[1]][c[0]] = -1; });
            placed.pop();
            if (steps > 40000) return false;
          }
        }
        return false;
      }
      return solve() ? placed : null;
    }
    return attempt([3, 4, 5]) || attempt([2, 3, 4, 5]) || attempt([1, 2, 3, 4, 5]);
  }

  // The odds on screen: every square the film shows, and how many of each kind.
  var shown = { squares: 0, kinds: {} }, log = [];
  function count(kind) { shown.kinds[kind] = (shown.kinds[kind] || 0) + 1; }

  var stackId = 1000, pieceId = 5000;
  function setStack(game, rows, seed) {
    var y0 = HEIGHT - rows.length;
    tile(rows, seed).forEach(function (p) {
      var id = stackId++;
      p.cells.forEach(function (c) {
        var ch = rows[c[1]][c[0]], v = ch === '2' ? 2 : ch === '3' ? 3 : ch === 'g' ? 0 : 1, cell = { id: id, shape: p.shape, v: v };
        if (v === 0) cell.born = 0;
        game.grid[y0 + c[1]][c[0]] = cell;
        shown.squares++;
        if (v !== 1) count(v);
      });
    });
    game.version++;
  }

  // The game, the clock and the camera -------------------------------------------------

  var g = null, script = null, holdPieces = false, gameNow = 1000, tick = 0, time = 0, rate = 1, rateT = 1, slowUntil = -1;
  var cam = { x: 6, y: 9.6, z: 49, vx: 0, vy: 0, vz: 0, tx: 6, ty: 9.6, tz: 49, w: 3, shake: 0, punch: 0, vp: 0, k: 0, vk: 0, ca: 0, flash: 0, bloom: 0, X: 6, Y: 9.6, Z: 49 };
  function camTo(z, x, y, w) { cam.tz = z; cam.tx = x; cam.ty = y; cam.w = w || 3; }
  function camSnap(z, x, y) { cam.x = cam.tx = x; cam.y = cam.ty = y; cam.z = cam.tz = z; cam.vx = cam.vy = cam.vz = 0; }
  function slow(r, secs) { if (r <= rateT || time > slowUntil) { rateT = r; slowUntil = time + secs; } }
  function sx(c) { return W / 2 + (c - cam.X) * cam.Z; }
  function sy(r) { return H / 2 + (r - cam.Y) * cam.Z; }
  function newGame(speed, squares, seed, sizes) {
    g = Rules.create({ mode: 'marathon', width: COLS, sizes: sizes || [3, 4, 5], squares: squares, seed: seed, speed: speed, firstRowSeconds: 0.55, choiceRows: 0 });
    g.takeEvents();
    Draw.reset(); Draw.setDim(false);
    fx.length = 0; callouts.length = 0; page.length = 0; banner = null;
    cam.shake = cam.punch = cam.vp = cam.k = cam.vk = cam.ca = cam.flash = cam.bloom = 0;
    rate = rateT = 1; slowUntil = -1;
  }
  function makePiece(sp) {
    var o = sp.startO != null ? sp.startO : sp.o, at = Pieces.spawnAt(sp.shape, o, COLS, HIDDEN);
    return { id: pieceId++, shape: sp.shape, o: o, bx: at.bx, bottom: at.bottom, specials: sp.specials || [], open: false };
  }
  // The box column that puts a piece's leftmost square in a column.
  function atCol(shape, o, col) { return col - Pieces.SHAPE[shape].orients[o].minX; }
  function* wait(n) { for (var i = 0; i < n; i++) yield {}; }
  // One scripted piece: it appears, turns, moves and drops by the game's own inputs.
  function* drop(sp) {
    while (g.pause > 0) yield {};
    if (typeof sp === 'function') sp = sp();
    g.piece = makePiece(sp);
    shown.squares += Pieces.SHAPE[sp.shape].size;
    (sp.specials || []).forEach(function (s) { count(s.kind); });
    if (sp.look) sp.look();
    yield* wait(sp.wait == null ? 5 : sp.wait);
    var turns = Bot.turns(g.piece.o, sp.o);
    for (var i = 0; i < turns.length; i++) { var t = {}; t[turns[i]] = true; yield t; yield* wait(sp.gap || 5); }
    for (var guard = 0; g.piece && g.piece.bx !== sp.bx && guard < 20; guard++) { yield g.piece.bx < sp.bx ? { right: 1 } : { left: 1 }; yield* wait(sp.mgap == null ? 1 : sp.mgap); }
    for (i = 0; i < (sp.soft || 0); i++) yield { softDrop: true };
    if (sp.before) sp.before();
    yield { hardDrop: true };
  }
  // A plain piece where the game's simulated player would put it.
  function fill(shape, opts) {
    return function () {
      var b = Bot.best(g.grid, { shape: shape, specials: [] }, HIDDEN), sp = { shape: shape, o: b ? b.o : 0, bx: b ? b.bx : 4 };
      sp.startO = Pieces.rotate(sp.o, -1);
      return Object.assign(sp, opts || {});
    };
  }
  // A piece with one special square, on the square and in the place that does most.
  function best(shape, kind, score, opts) {
    return function () {
      var top = null, or = Pieces.SHAPE[shape].orients, n = Pieces.SHAPE[shape].size;
      for (var o = 0; o < 8; o++) for (var bx = -or[o].minX; bx + or[o].maxX < COLS; bx++) for (var i = 0; i < n; i++) {
        var l = Rules.land(g.grid, shape, o, bx, HIDDEN, true), cells = Pieces.cellsAt(shape, o, bx, l.bottom);
        var out = Rules.settle(g.grid, cells, [{ i: i, kind: kind }], -1, shape, { smashed: l.smashed }), v = score(out, cells);
        if (!top || v > top.v) top = { v: v, o: o, bx: bx, i: i };
      }
      return Object.assign({ shape: shape, o: top.o, bx: top.bx, specials: [{ i: top.i, kind: kind }], startO: Pieces.rotate(top.o, -1) }, opts || {});
    };
  }

  // Sections ----------------------------------------------------------------------------

  var SEC = {
    play: 1.9, twos: 7.2, glass: 11.2, water: 13.9, bombs: 18, big: 22, end: 28
  };
  var CAPTIONS = [
    [2.1, 7, '21 shapes of one to five squares', 'Move, rotate, flip and drop.'],
    [7.45, 11, '2s and 3s pay for gaps', 'A 2 forgives one gap. A 3 forgives two.'],
    [11.45, 13.7, 'Glass counts for nothing', 'A hard drop smashes straight through it.'],
    [14.15, 17.8, 'Floods fill the gaps', 'A deluge reaches every hole below it.'],
    [18.25, 21.8, 'Bombs blast a crater', 'A row bomb clears its whole row.'],
    [22.25, 27.75, 'Five rows make a Pentrys', 'Six rows make a Hextrys.']
  ];

  function* play() {
    var O = window.PentrysFilmOdds;
    newGame(6, 'film', 8329, [1, 2, 3, 4, 5]);
    for (var i = 0; i < O.BASE_PIECES; i++) { var pl = Bot.plan(g, false); if (pl) g.placeDirect(pl.o, pl.bx); }
    g.takeEvents();
    camSnap(49, 6, 10);
    camTo(54, 6, 10.7, 0.9);
    Draw.setDanger(g);
    shown.squares += g.grid.reduce(function (n, row) { return n + row.filter(Boolean).length; }, 0);
    g.grid.forEach(function (row) { row.forEach(function (c) { if (c && c.v !== 1) count(c.v); }); });
    for (;;) {
      while (!g.piece) yield {};
      var p = g.piece, plan = Bot.plan(g, false), o = plan ? plan.o : p.o, bx = plan ? plan.bx : p.bx;
      shown.squares += Pieces.SHAPE[p.shape].size;
      p.specials.forEach(function (s) { count(s.kind); });
      for (var d = 0; d < 7; d++) yield { softDrop: true };
      var turns = Bot.turns(p.o, o);
      for (var k = 0; k < turns.length; k++) { var t = {}; t[turns[k]] = true; yield t; yield* wait(5); }
      for (var guard = 0; g.piece && g.piece.bx !== bx && guard < 20; guard++) { yield g.piece.bx < bx ? { right: 1 } : { left: 1 }; yield* wait(1); }
      yield* wait(3);
      yield { hardDrop: true };
    }
  }

  function* twos() {
    newGame(6, 'pure', 11);
    holdPieces = true;
    setStack(g, [
      '####...##.##',
      '###.##...#.#',
      '#.##########',
      '##########.#',
      '####.#######'
    ], 31);
    camSnap(50, 6, 9.8);
    camTo(74, 6, 13, 2.4);
    yield* wait(14);
    yield* drop({ shape: 'I4', o: 0, bx: 0, startO: 1, soft: 8 });
    yield* wait(10);
    camTo(84, 6, 14.2, 3);
    yield* drop({ shape: 'T4', o: 0, bx: 4, startO: 2, specials: [{ i: 1, kind: 2 }], soft: 6, gap: 7, mgap: 3 });
    yield* wait(32);
    yield* drop({ shape: 'L4', o: 0, bx: 6, startO: 3, specials: [{ i: 2, kind: 3 }], soft: 6, gap: 7, mgap: 3 });
    yield* wait(50);
    camTo(62, 6, 11.5, 1.6);
    yield* drop(fill('P5', { soft: 4 }));
    yield* wait(14);
    yield* drop(fill('S4', { soft: 4 }));
    yield* wait(14);
    yield* drop(fill('Y5', { soft: 4 }));
  }

  function* glass() {
    newGame(6, 'pure', 12);
    holdPieces = true;
    setStack(g, [
      '##.##.......',
      '#####.##.###',
      '#####g######',
      '#####g######',
      '#.##########',
      '#######.####'
    ], 47);
    camSnap(52, 6, 10);
    camTo(82, 5.8, 14.2, 2.6);
    yield* wait(12);
    yield* drop({ shape: 'I3', o: 1, bx: atCol('I3', 1, 5), startO: 0, gap: 8, mgap: 3, soft: 10 });
    yield* wait(70);
    camTo(62, 6, 11.5, 1.6);
    yield* drop(fill('N5', { soft: 4 }));
  }

  function* water() {
    newGame(6, 'pure', 13);
    holdPieces = true;
    setStack(g, [
      '#####...####',
      '#####.#.####',
      '#####...####',
      '######.#####',
      '##.......###',
      '####.#.#####',
      '#.##########',
      '##########.#'
    ], 53);
    camSnap(52, 6, 10);
    camTo(78, 6, 13.6, 2.4);
    yield* wait(12);
    yield* drop({ shape: 'I3', o: 0, bx: 5, startO: 1, specials: [{ i: 1, kind: 'flood' }], soft: 6, gap: 7, mgap: 2 });
    yield* wait(48);
    camTo(86, 6, 15, 2.6);
    yield* drop({ shape: 'L4', o: 0, bx: 5, startO: 2, specials: [{ i: 2, kind: 'deluge' }], soft: 8, gap: 7, mgap: 2 });
    yield* wait(60);
    camTo(60, 6, 11.4, 1.6);
    yield* drop(fill('F5', { soft: 3 }));
  }

  function* bombs() {
    newGame(6, 'pure', 14);
    holdPieces = true;
    setStack(g, [
      '##.......###',
      '###..#...###',
      '####.##.####',
      '#####.######',
      '##.#########',
      '#########.##',
      '####.#######',
      '#.##########'
    ], 61);
    camSnap(54, 6, 10.5);
    camTo(66, 6, 12.6, 2.2);
    yield* wait(12);
    function blasts(out) { return out.destroyed.length + 3 * out.rows.length - Math.abs(out.blasts.length ? out.blasts[0].at[0] - 6 : 6) * 0.2; }
    yield* drop(best('T5', 'bomb', blasts, { soft: 6, gap: 6, mgap: 2 }));
    yield* wait(34);
    camTo(74, 6, 14.2, 2.4);
    yield* drop(best('I4', 'rowbomb', function (out, cells) {
      var hit = out.rows.filter(function (r) { return r.rowBomb; }).length, before = out.rows.reduce(function (n, r) { return n + (COLS - r.gaps.length); }, 0);
      return hit * 40 + before + out.rows.length * 20;
    }, { soft: 6, gap: 6, mgap: 2 }));
    yield* wait(34);
    camTo(70, 6, 13.2, 2.4);
    yield* drop(best('P5', 'bomb', blasts, { soft: 4, gap: 5, mgap: 2 }));
    yield* wait(30);
  }

  function* big() {
    newGame(12, 'pure', 15);
    holdPieces = true;
    var rows = [];
    for (var i = 0; i < 5; i++) rows.push('#########.##');
    for (i = 0; i < 5; i++) rows.push('###########.');
    rows.push('##########.#');
    setStack(g, rows, 71);
    camSnap(49, 6, 9.8);
    yield* wait(22);
    yield* drop({ shape: 'I5', o: 1, bx: atCol('I5', 1, 9), startO: 0, gap: 10, mgap: 5, wait: 12, before: function () { camTo(68, 6.6, 13, 3.2); } });
    yield* wait(64);
    camTo(52, 6.4, 10.6, 2.4);
    yield* wait(16);
    yield* drop({ shape: 'I5', o: 1, bx: atCol('I5', 1, 11), startO: 0, gap: 8, mgap: 4, wait: 8, specials: [{ i: 4, kind: 'flood' }], before: function () { camTo(80, 7.4, 15.4, 3.6); } });
    yield* wait(30);
    camTo(50, 6, 9.8, 1.2);
    yield* wait(600);
  }

  var SCENES = [[SEC.play, play], [SEC.twos, twos], [SEC.glass, glass], [SEC.water, water], [SEC.bombs, bombs], [SEC.big, big]], sceneAt = -1;

  // Film effects -----------------------------------------------------------------------

  var fx = [], callouts = [], page = [], banner = null;
  function colourOf(shape) { return Draw.colour(shape); }
  function spark(c, r, n, col, speed, life, grav, size) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, v = speed * (0.35 + rnd());
      fx.push({ k: 'spark', x: c, y: r, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: grav == null ? 14 : grav, t0: gameNow, life: (life || 600) * (0.6 + rnd() * 0.6),
                col: typeof col === 'function' ? col() : col, size: (size || 0.16) * (0.6 + rnd() * 0.8) });
    }
  }
  function shards(c, r, n) {
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, v = 5 + rnd() * 11;
      fx.push({ k: 'shard', x: c, y: r, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, g: 26, t0: gameNow, life: 620 + rnd() * 420, rot: rnd() * 6.3, vr: (rnd() - 0.5) * 22, size: 0.2 + rnd() * 0.36, col: rnd() < 0.5 ? '#ffffff' : '#bfe6ff' });
    }
  }
  function ring(c, r, r1, dur, col, width) { fx.push({ k: 'ring', x: c, y: r, r1: r1, t0: gameNow, life: dur, col: col, w: width || 0.18 }); }
  function streak(row, col, dur) { fx.push({ k: 'streak', y: row, t0: gameNow, life: dur || 420, col: col }); }
  function rays(c, r, n, dur, len) { fx.push({ k: 'rays', x: c, y: r, n: n, t0: gameNow, life: dur, len: len, seed: rnd() * 100 }); }
  function confetti(n, r0) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (rnd() - 0.5) * 2.5, v = 9 + rnd() * 17;
      fx.push({ k: 'piece', x: rnd() * COLS, y: r0 + rnd() * 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 15, t0: gameNow, life: 1500 + rnd() * 900, rot: rnd() * 6.3, vr: (rnd() - 0.5) * 7, img: CONFETTI[Math.floor(rnd() * CONFETTI.length)], size: 0.55 + rnd() * 0.75 });
    }
  }
  function handle(list) {
    if (!list.length) return;
    Draw.onEvents(list, g, gameNow);
    var cleared = list.some(function (e) { return e.type === 'clear'; });
    list.forEach(function (e) {
      if (e.type === 'lock') {
        Draw.setDanger(g);
        log.push(time.toFixed(2) + ' s  lock ' + e.shape + (e.specials.length ? ' with ' + e.specials.map(function (s) { return s.kind; }).join(',') : ''));
      } else if (e.type === 'hardDrop') {
        var far = e.to - e.from;
        fx.push({ k: 'trail', cells: e.cells, far: far, col: colourOf(e.shape), t0: gameNow, life: 190 });
        cam.vk -= Math.min(6, 1 + far * 0.3);
        cam.vp += 0.05 + far * 0.012;
        e.cells.forEach(function (c) { var below = c[1] + 1 >= HEIGHT || g.grid[c[1] + 1] && !g.grid[c[1] + 1][c[0]]; spark(c[0] + 0.5, c[1] - HIDDEN + 1, 3, colourOf(e.shape), 7, 340, 22, 0.1); });
      } else if (e.type === 'fill') {
        var cx = e.at[0] + 0.5, cy = e.at[1] - HIDDEN + 0.5;
        ring(cx, cy, e.kind === 'deluge' ? 7 : 3.4, e.kind === 'deluge' ? 800 : 520, 'rgba(120,220,255,1)', 0.2);
        e.filled.forEach(function (c) {
          for (var i = 0; i < 6; i++) fx.push({ k: 'water', x: c[0] + 0.5, y: c[1] - HIDDEN + 0.5, vx: (rnd() - 0.5) * 7, vy: -3 - rnd() * 7, g: 24, t0: gameNow + (c[2] || 0) * (e.kind === 'deluge' ? 26 : 0), life: 460 + rnd() * 300, size: 0.1 + rnd() * 0.14 });
        });
        cam.bloom = Math.max(cam.bloom, 0.25);
        slow(e.kind === 'deluge' ? 0.32 : 0.45, e.kind === 'deluge' ? 0.95 : 0.55);
      } else if (e.type === 'blast') {
        var bx = e.at[0] + 0.5, by = e.at[1] - HIDDEN + 0.5;
        ring(bx, by, 6.5, 620, 'rgba(255,190,90,1)', 0.34);
        ring(bx, by, 11, 900, 'rgba(255,110,60,0.8)', 0.14);
        rays(bx, by, 22, 520, 6.5);
        spark(bx, by, 60, function () { return ['#ffd66b', '#ff9a50', '#ffffff', '#ff5a3c'][Math.floor(rnd() * 4)]; }, 15, 760, 18, 0.2);
        e.cells.forEach(function (c) { spark(c.x + 0.5, c.y - HIDDEN + 0.5, 8, c.v === 0 ? '#e6f4ff' : colourOf(c.shape), 11, 800, 22, 0.22); });
        cam.shake = Math.max(cam.shake, 1); cam.ca = Math.max(cam.ca, 1); cam.flash = Math.max(cam.flash, 0.34); cam.vp += 0.5; cam.bloom = Math.max(cam.bloom, 0.55);
        if (!cleared) page.push({ kind: 'boom', t0: gameNow, dur: 700 });
        slow(0.28, 0.62);
      } else if (e.type === 'rowbomb') {
        var ry = e.y - HIDDEN;
        streak(ry, '#ff5a82', 620); ring(e.at[0] + 0.5, ry + 0.5, 6, 560, 'rgba(255,90,130,1)', 0.24);
        for (var x = 0; x < COLS; x++) spark(x + 0.5, ry + 0.5, 4, x % 2 ? '#ff5a82' : '#ffffff', 9, 620, 16, 0.16);
        cam.shake = Math.max(cam.shake, 0.7); cam.ca = Math.max(cam.ca, 0.7); cam.flash = Math.max(cam.flash, 0.2); cam.vp += 0.35;
        slow(0.3, 0.6);
      } else if (e.type === 'smash') {
        e.cells.forEach(function (c) { var gy = c[1] - HIDDEN + 0.5; shards(c[0] + 0.5, gy, 26); ring(c[0] + 0.5, gy, 3.6, 480, 'rgba(210,240,255,1)', 0.14); });
        cam.flash = Math.max(cam.flash, 0.22); cam.ca = Math.max(cam.ca, 0.55); cam.shake = Math.max(cam.shake, 0.4); cam.vp += 0.3; cam.bloom = Math.max(cam.bloom, 0.3);
        slow(0.2, 0.85);
      } else if (e.type === 'clear') {
        log.push(time.toFixed(2) + ' s  clear ' + e.n + ' ' + e.name + ' ×' + e.multiplier + ' +' + e.points + (e.allClear ? ' ALL CLEAR' : ''));
        var n = e.n, mid = 0;
        e.rows.forEach(function (r) { var ry = r.y - HIDDEN; mid += ry + 0.5; streak(ry, r.rowBomb ? '#ff5a82' : r.values.length ? GOLD : '#ffffff', 300 + 70 * n); });
        mid /= n;
        if (n >= 3) { ring(6, mid, 10 + n, 620 + 70 * n, 'rgba(255,255,255,0.9)', 0.16); }
        cam.vp += 0.2 + 0.22 * n;
        if (n >= 4) { rays(6, mid, 14 + 5 * n, 500 + 150 * n, 16); cam.ca = Math.max(cam.ca, 0.5 + 0.12 * n); cam.shake = Math.max(cam.shake, 0.3 + 0.1 * n); cam.flash = Math.max(cam.flash, 0.1 + 0.05 * n); cam.bloom = Math.max(cam.bloom, 0.25 + 0.1 * n); confetti(n >= 6 ? 110 : n === 5 ? 64 : 26, mid); }
        if (n === 4) page.push({ kind: 'wave', t0: gameNow, dur: 1200 });
        if (n === 5) page.push({ kind: 'pulse', t0: gameNow, dur: 1500 });
        if (n >= 6) { page.push({ kind: 'flash', t0: gameNow, dur: 3000 }); page.push({ kind: 'pulse', t0: gameNow, dur: 1500 }); }
        slow([1, 1, 0.7, 0.5, 0.3, 0.17, 0.11][Math.min(n, 6)], [0, 0, 0.26, 0.36, 0.7, 1.05, 1.5][Math.min(n, 6)]);
        if (e.allClear) banner = { t0: time };
      } else if (e.type === 'combo') addCallout(e);
      else if (e.type === 'speed') addSimple('Speed ' + e.speed);
    });
  }
  function fmtMult(m) { return '×' + String(Math.round(m * 100) / 100); }
  function addCallout(e) {
    var bonus = e.lines.filter(function (l) { return l.base == null && l.name.indexOf('Speed') !== 0; });
    var speed = e.lines.filter(function (l) { return l.name.indexOf('Speed') === 0; });
    var list = e.n ? bonus : bonus.slice(1);
    var rows = list.length ? list.concat(speed) : [];
    var hold = (e.n ? [0, 0.85, 1.05, 1.25, 1.5, 2.1, 3][Math.min(e.n, 6)] : 0.8) + 0.1 * rows.length;
    callouts.forEach(function (c) { if (c.combo) c.end = Math.min(c.end, time + 0.08); });
    var row = e.y - HIDDEN, y = e.n >= 5 ? 420 : clamp(sy(row) - 10, 300, H - 260);
    callouts.push({ combo: true, name: e.name, c: e.n ? Math.min(e.n, 6) : 1, mult: e.n && e.multiplier > 1 ? e.multiplier : null, points: '+' + e.points.toLocaleString('en-GB'), rows: rows, t0: time, end: time + hold, y: y });
  }
  function addSimple(text) { callouts.push({ combo: false, name: text, c: 2, mult: null, points: null, rows: [], t0: time, end: time + 1, y: 250 }); }

  function stepGame() {
    tick++;
    g.step(nextInput);
    handle(g.takeEvents());
    if (holdPieces && g.piece && g.piece.id < 5000) g.piece = null;
    var out = script.next();
    nextInput = out.done ? {} : (out.value || {});
    if (out.done && holdPieces) g.piece = null;
  }
  var nextInput = {};

  function advance(n) {
    time = n * DT;
    while (sceneAt + 1 < SCENES.length && time >= SCENES[sceneAt + 1][0]) {
      sceneAt++;
      holdPieces = false; nextInput = {};
      script = SCENES[sceneAt][1]();
      var first = script.next();
      nextInput = first.value || {};
      log.push(time.toFixed(2) + ' s  section ' + SCENES[sceneAt][1].name);
    }
    if (!g) return;
    if (time > slowUntil) rateT = 1;
    rate += (rateT - rate) * (1 - Math.exp(-DT * 16));
    var ms = DT * 1000 * rate;
    gameNow += ms;
    stepAcc += ms;
    while (stepAcc >= STEP) { stepGame(); stepAcc -= STEP; }
    // The camera: a critically damped spring to its target, with a punch and a shake.
    ['x', 'y', 'z'].forEach(function (a) {
      var t = cam['t' + a], v = 'v' + a;
      cam[v] += (cam.w * cam.w * (t - cam[a]) - 2 * cam.w * cam[v]) * DT;
      cam[a] += cam[v] * DT * (a === 'z' ? 1 : 1);
    });
    cam.vk += (-300 * cam.k - 30 * cam.vk) * DT;
    cam.k += cam.vk * DT;
    cam.vp += (-90 * cam.punch - 15 * cam.vp) * DT;
    cam.punch += cam.vp * DT;
    cam.shake *= Math.exp(-DT * 5);
    cam.ca *= Math.exp(-DT * 6);
    cam.flash *= Math.exp(-DT * 9);
    cam.bloom *= Math.exp(-DT * 3.2);
    var sh = cam.shake * cam.shake;
    cam.X = cam.x + sh * 0.5 * (Math.sin(time * 67) + 0.5 * Math.sin(time * 113 + 1));
    cam.Y = cam.y + cam.k + sh * 0.5 * (Math.sin(time * 79 + 2) + 0.5 * Math.sin(time * 131 + 4));
    cam.Z = cam.z * (1 + clamp(cam.punch, -0.1, 0.25));
    cam.rot = sh * 0.012 * Math.sin(time * 53);
  }
  var stepAcc = 0;

  // Drawing --------------------------------------------------------------------------------

  function drawBackground() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#10121f'; ctx.fillRect(0, 0, W, H);
    var k = 1.12 + (cam.Z - 49) / 700, ox = (cam.X - 6) * -10, oy = (cam.Y - 10) * -10;
    ctx.save(); ctx.translate(W / 2 + ox, H / 2 + oy); ctx.rotate(cam.rot); ctx.scale(k, k); ctx.drawImage(wallCv, -W / 2, -H / 2); ctx.restore();
    drawPage(1);
  }
  function drawPage(boost) {
    page = page.filter(function (f) { return gameNow - f.t0 < f.dur; });
    page.forEach(function (f) {
      var t = (gameNow - f.t0) / f.dur;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (f.kind === 'wave') {
        var x = W * (1.5 - 2 * t), gr = ctx.createLinearGradient(x - 360, 0, x + 360, 180);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.28)'); gr.addColorStop(0.5, 'rgba(255,214,107,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = (1 - t) * boost; ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      } else if (f.kind === 'pulse') {
        var o = t < 0.25 ? t / 0.25 : t < 0.5 ? 1 - 0.7 * (t - 0.25) / 0.25 : t < 0.7 ? 0.3 + 0.5 * (t - 0.5) / 0.2 : 0.8 * (1 - t) / 0.3;
        var gp = ctx.createRadialGradient(W / 2, H * 0.6, W * 0.2, W / 2, H * 0.6, W * 0.8);
        gp.addColorStop(0, 'rgba(0,0,0,0)'); gp.addColorStop(0.65, 'rgba(205,112,240,0.42)'); gp.addColorStop(1, 'rgba(3,232,227,0.4)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o * boost; ctx.fillStyle = gp; ctx.fillRect(0, 0, W, H);
      } else if (f.kind === 'flash') {
        var kf = [[0, 0], [0.08, 0.5], [0.2, 0.14], [0.32, 0.4], [0.6, 0.18], [1, 0]], a = 0;
        for (var i = 0; i < kf.length - 1; i++) if (t >= kf[i][0] && t <= kf[i + 1][0]) a = kf[i][1] + (kf[i + 1][1] - kf[i][1]) * (t - kf[i][0]) / (kf[i + 1][0] - kf[i][0]);
        var cg = ctx.createConicGradient(t * 5, W / 2, H / 2);
        RAINBOW.forEach(function (col, j) { cg.addColorStop(j / (RAINBOW.length - 1), col); });
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a * boost; ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
      } else if (f.kind === 'boom') {
        var ob = t < 0.25 ? t / 0.25 : t < 0.5 ? 1 - 0.7 * (t - 0.25) / 0.25 : t < 0.7 ? 0.3 + 0.5 * (t - 0.5) / 0.2 : 0.8 * (1 - t) / 0.3;
        var gb = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.72);
        gb.addColorStop(0, 'rgba(255,190,90,0.5)'); gb.addColorStop(0.45, 'rgba(255,90,40,0.2)'); gb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ob * boost; ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    });
  }
  function drawWell() {
    Draw.frame(g, gameNow);
    var k = cam.Z / S;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.translate(-W / 2, -H / 2);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(wellCv, sx(0) - GAUGE * S * k, sy(0) - TOP * S * k, wellCv.width * k, wellCv.height * k);
    ctx.restore();
  }
  function drawFx() {
    var Z = cam.Z;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(cam.rot); ctx.translate(-W / 2, -H / 2);
    fx = fx.filter(function (f) {
      var a = gameNow - f.t0, t = a / f.life;
      if (t >= 1) return false;
      if (a < 0) return true;
      var s = a / 1000, px = sx((f.x || 0) + (f.vx || 0) * s), py = sy((f.y || 0) + (f.vy || 0) * s + 0.5 * (f.g || 0) * s * s);
      ctx.save();
      if (f.k === 'spark') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - t; ctx.fillStyle = f.col;
        var q = f.size * Z; ctx.fillRect(px - q / 2, py - q / 2, q, q);
      } else if (f.k === 'water') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.95 * (1 - t); ctx.fillStyle = 'rgba(150,230,255,1)';
        ctx.beginPath(); ctx.arc(px, py, f.size * Z, 0, 6.3); ctx.fill();
      } else if (f.k === 'shard') {
        ctx.translate(px, py); ctx.rotate(f.rot + f.vr * s); ctx.globalAlpha = 1 - t * t; ctx.fillStyle = f.col;
        var w = f.size * Z; ctx.beginPath(); ctx.moveTo(-w, -w * 0.5); ctx.lineTo(w, -w * 0.2); ctx.lineTo(-w * 0.1, w * 0.8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (f.k === 'piece') {
        ctx.translate(px, py); ctx.rotate(f.rot + f.vr * s); ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
        var kk = f.size * Z / 26; ctx.scale(kk, kk); ctx.drawImage(f.img, -f.img.width / 2, -f.img.height / 2);
      } else if (f.k === 'ring') {
        var e = out3(t), rad = f.r1 * e * Z;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - t) * 0.9; ctx.strokeStyle = f.col; ctx.lineWidth = Math.max(1, f.w * Z * (1 - t));
        ctx.beginPath(); ctx.arc(px, py, rad, 0, 6.3); ctx.stroke();
      } else if (f.k === 'streak') {
        var ry = sy(f.y + 0.5), hh = Z * 0.55 * (1 - t) + 1;
        var gs = ctx.createLinearGradient(0, ry - hh, 0, ry + hh);
        gs.addColorStop(0, 'rgba(255,255,255,0)'); gs.addColorStop(0.5, f.col); gs.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - t) * 0.9; ctx.fillStyle = gs;
        var reach = W * out3(t * 2.5), cx0 = sx(6); ctx.fillRect(cx0 - reach, ry - hh, 2 * reach, 2 * hh);
        ctx.globalAlpha = (1 - t); ctx.fillStyle = '#ffffff'; ctx.fillRect(cx0 - reach, ry - 1.5, 2 * reach, 3);
      } else if (f.k === 'rays') {
        ctx.globalCompositeOperation = 'lighter';
        var len = f.len * Z * out3(t * 1.6), cols = RAINBOW;
        ctx.translate(px, py); ctx.rotate(f.seed + s * 0.5);
        for (var i = 0; i < f.n; i++) {
          var an = i / f.n * Math.PI * 2 + Math.sin(i * 12.9 + f.seed) * 0.12, l = len * (0.55 + 0.45 * Math.abs(Math.sin(i * 78.2 + f.seed))), hw = Z * 0.05 + Z * 0.15 * Math.abs(Math.sin(i * 3.1 + f.seed));
          ctx.save(); ctx.rotate(an); ctx.globalAlpha = (1 - t) * 0.42;
          var gr = ctx.createLinearGradient(0, 0, l, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = f.n > 26 ? cols[i % (cols.length - 1)] : gr;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l, -hw); ctx.lineTo(l, hw); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      } else if (f.k === 'trail') {
        ctx.globalCompositeOperation = 'lighter';
        f.cells.forEach(function (c) {
          var bottom = sy(c[1] - HIDDEN + 1), top = sy(c[1] - HIDDEN - f.far), xx = sx(c[0]);
          var tg = ctx.createLinearGradient(0, top, 0, bottom);
          tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, f.col);
          ctx.globalAlpha = 0.65 * (1 - t); ctx.fillStyle = tg; ctx.fillRect(xx + Z * 0.08, top, Z * 0.84, bottom - top);
        });
      }
      ctx.restore();
      return true;
    });
    ctx.restore();
  }
  function drawBloom() {
    bloomAx.globalCompositeOperation = 'copy'; bloomAx.filter = 'none'; bloomAx.drawImage(main, 0, 0, 270, 270);
    bloomBx.globalCompositeOperation = 'copy'; bloomBx.filter = 'blur(5px)'; bloomBx.drawImage(bloomA, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2 + cam.bloom; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(bloomB, 0, 0, W, H);
    ctx.restore();
  }
  function aberrate(px) {
    caSrcX.globalCompositeOperation = 'copy'; caSrcX.drawImage(main, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    [['#ff0000', -px, px * 0.3], ['#00ff00', 0, 0], ['#0000ff', px, -px * 0.3]].forEach(function (c) {
      caTmpX.globalCompositeOperation = 'copy'; caTmpX.drawImage(caSrc, 0, 0);
      caTmpX.globalCompositeOperation = 'multiply'; caTmpX.fillStyle = c[0]; caTmpX.fillRect(0, 0, W, H);
      ctx.drawImage(caTmp, c[1], c[2]);
    });
    ctx.restore();
  }
  function text(str, x, y, font, fill, outline, align, spacing) {
    ctx.font = font; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing || '0px';
    ctx.lineJoin = 'round';
    if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(6,8,24,0.92)'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = fill; ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  var SIZES = [0, 56, 72, 90, 108, 128, 138];
  function drawCallouts() {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    callouts = callouts.filter(function (c) { return time < c.end + 0.35; });
    callouts.forEach(function (c) {
      var a = time - c.t0, pop = backOut(a / 0.24), leaving = clamp((time - c.end) / 0.35, 0, 1), alpha = clamp(a / 0.08, 0, 1) * (1 - leaving);
      var size = SIZES[c.c], name = c.name.toUpperCase(), y = c.y - 34 * leaving;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, y); ctx.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop); ctx.transform(1, 0, SLANT, 1, 0, 0);
      var font = '900 ' + size + 'px ' + FONT; ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0.05em';
      var tw = ctx.measureText(name).width, mw = 0, mfont = '900 ' + Math.round(size * (c.mult >= 8 ? 1.2 : c.mult >= 4 ? 1.05 : 0.86)) + 'px ' + FONT, mstr = c.mult ? fmtMult(c.mult) : '';
      if (c.mult) { ctx.font = mfont; mw = ctx.measureText(mstr).width + size * 0.3; }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      var total = tw + mw, x0 = clamp(-total / 2, -W / 2 + 14, W / 2 - 14 - total);
      var fill = '#ffffff';
      if (c.c >= 5) {
        var g2 = ctx.createLinearGradient(x0, 0, x0 + tw, 0), shift = (time * (c.c === 6 ? 1.6 : 1)) % 1;
        for (var i = 0; i < RAINBOW.length; i++) g2.addColorStop(((i / (RAINBOW.length - 1)) + shift) % 1, RAINBOW[i]);
        fill = g2;
      }
      ctx.shadowColor = c.c >= 5 ? 'rgba(255,255,255,0.65)' : 'rgba(150,200,255,0.75)'; ctx.shadowBlur = size * 0.3;
      text(name, x0, 0, font, fill, Math.max(9, size * 0.17), 'left', '0.05em');
      if (c.mult) { ctx.shadowColor = 'rgba(255,214,107,0.8)'; text(mstr, x0 + tw + size * 0.3, 0, mfont, GOLD, Math.max(9, size * 0.17), 'left'); }
      ctx.shadowBlur = 0;
      var yy = size * 0.2 + 12;
      c.rows.forEach(function (l, j) {
        var la = clamp((a - 0.12 - 0.1 * j) / 0.14, 0, 1);
        if (!la) { yy += 44; return; }
        ctx.save(); ctx.globalAlpha = alpha * la; ctx.translate(14 * (1 - la), 0);
        var v = l.mult ? fmtMult(l.mult) : l.add ? '+' + l.add.toLocaleString('en-GB') : '';
        yy += 36;
        text(l.name, -14, yy, '700 32px ' + FONT, '#e7ecff', 8, 'right', '0.03em');
        text(v, 14, yy, '800 32px ' + FONT, GOLD, 8, 'left');
        yy += 8; ctx.restore();
      });
      if (c.points) { yy += 42; text(c.points, 0, yy, '800 ' + Math.max(32, size * 0.36) + 'px ' + FONT, GOLD, 9, 'center', '0.04em'); }
      ctx.restore();
    });
    if (banner) {
      var b = time - banner.t0 - 0.28;
      if (b > 0) {
        var p = backOut(b / 0.26);
        ctx.save(); ctx.globalAlpha = clamp(b / 0.1, 0, 1); ctx.translate(W / 2, 900); ctx.scale(0.4 + 0.6 * p, 0.4 + 0.6 * p); ctx.transform(1, 0, SLANT, 1, 0, 0);
        ctx.shadowColor = 'rgba(255,214,107,0.95)'; ctx.shadowBlur = 44;
        text('ALL CLEAR', 0, 0, '900 112px ' + FONT, GOLD, 16, 'center', '0.1em');
        ctx.shadowBlur = 0; ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawCaption() {
    var c = null;
    for (var i = 0; i < CAPTIONS.length; i++) if (time >= CAPTIONS[i][0] && time < CAPTIONS[i][1]) c = CAPTIONS[i];
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (c) {
      var inn = out3((time - c[0]) / 0.3), off = out3((c[1] - time) / 0.25), al = Math.min(inn, off);
      var band = ctx.createLinearGradient(0, 0, 0, 270);
      band.addColorStop(0, 'rgba(7,9,24,0.62)'); band.addColorStop(0.6, 'rgba(7,9,24,0.34)'); band.addColorStop(1, 'rgba(7,9,24,0)');
      ctx.globalAlpha = al; ctx.fillStyle = band; ctx.fillRect(0, 0, W, 270);
      ctx.save(); ctx.translate(W / 2 + (1 - inn) * -70, 134); ctx.transform(1, 0, SLANT, 1, 0, 0);
      text(c[2], 0, 0, '900 62px ' + FONT, '#ffffff', 12, 'center');
      ctx.restore();
      ctx.save(); ctx.translate(W / 2 + (1 - inn) * 70, 186);
      text(c[3], 0, 0, '600 33px ' + FONT, '#dfe5fb', 8, 'center');
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    text('drbuild.uk/pentrys', W - 28, 54, '700 28px ' + FONT, 'rgba(255,255,255,0.86)', 7, 'right', '0.01em');
    ctx.restore();
  }

  // The title card: the first frame, and the last half a second. Both match exactly.
  var logoCv = document.createElement('canvas'), cardPieces;
  Draw.logo(logoCv, 900, 540);
  (function () {
    var kinds = { 3: 2, 7: 'bomb' };
    cardPieces = tile(['............'.replace(/\./g, '#'), '############', '############'], 4).map(function (p, i) {
      var minX = Math.min.apply(null, p.cells.map(function (c) { return c[0]; })), minY = Math.min.apply(null, p.cells.map(function (c) { return c[1]; }));
      var sp = kinds[i] != null ? [[0, kinds[i]]] : [];
      shown.squares += p.cells.length; if (kinds[i] != null) count(kinds[i]);
      return { img: sprite(p.shape, p.o, sp, 90), x: minX * 90 - 1, y: H - 3 * 90 + minY * 90 - 1, row: minY + Math.max.apply(null, p.cells.map(function (c) { return c[1]; })), cells: p.cells };
    }).sort(function (a, b) { return b.row - a.row; });
    cardPieces.forEach(function (p, i) { p.order = i; });
  })();
  function drawCard(t) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(cardBg, 0, 0);
    var opening = t < 10, n = cardPieces.length;
    var LAND0 = 28.42, LAND_STEP = 0.9 / Math.max(1, n - 1), G = 6400;
    cardPieces.forEach(function (p) {
      var dy = 0, glow = 0;
      if (opening) { var ts = 0.1 + (n - 1 - p.order) * 0.045; if (t > ts) dy = 0.5 * G * (t - ts) * (t - ts); }
      else { var tl = LAND0 + p.order * LAND_STEP; if (t < tl) dy = -0.5 * G * (tl - t) * (tl - t); else if (t < tl + 0.13) glow = 1 - (t - tl) / 0.13; }
      if (dy > H || dy < -1100) return;
      ctx.drawImage(p.img, p.x, p.y + dy);
      if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.65 * glow; ctx.drawImage(p.img, p.x, p.y + dy); ctx.restore(); }
    });
    var scale = 1, alpha = 1, sub = 1;
    if (opening) scale = 1 + 0.06 * smooth((t - 0.1) / 1.9);
    else {
      var a = (t - SEC.end - 0.03) / 0.3;
      scale = a < 1 ? 1.7 - 0.7 * backOut(a) : 1; alpha = clamp(a * 3, 0, 1);
      sub = clamp((t - 28.65) / 0.4, 0, 1);
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(W / 2, 372); ctx.scale(scale, scale);
    ctx.drawImage(logoCv, -logoCv.width / 2, -logoCv.height / 2); ctx.restore();
    ctx.globalAlpha = sub;
    text('Falling pieces of one to five squares', W / 2, 690, '700 44px ' + FONT, '#ffffff', 0, 'center');
    text('Try it yourself at drbuild.uk/pentrys', W / 2, 756, '800 40px ' + FONT, GOLD, 0, 'center');
    ctx.restore();
  }

  // The wipe: the game's pentomino rectangle at full size, tile by tile.
  var TILING = ['ZIIIIIXPPP', 'ZZZTWXXXPP', 'LVZTWWXUUU', 'LVTTTWWUFU', 'LVVVNNYFFF', 'LLNNNYYYYF'], wipeTiles = [];
  (function () {
    var by = {};
    TILING.forEach(function (row, y) { row.split('').forEach(function (ch, x) { (by[ch] = by[ch] || []).push([x, y]); }); });
    [0, 6].forEach(function (shift) {
      Object.keys(by).forEach(function (ch) {
        var name = ch + '5', cells = by[ch], minX = Math.min.apply(null, cells.map(function (c) { return c[0]; })), minY = Math.min.apply(null, cells.map(function (c) { return c[1]; }));
        var key = cells.map(function (c) { return (c[0] - minX) + ',' + (c[1] - minY); }).sort().join(' '), o = 0;
        for (var k = 0; k < 8; k++) if (Pieces.shapeCells(name, k).map(function (c) { return c.join(','); }).sort().join(' ') === key) { o = k; break; }
        var img = sprite(name, o, [], 108), maxX = Math.max.apply(null, cells.map(function (c) { return c[0]; })), maxY = Math.max.apply(null, cells.map(function (c) { return c[1]; }));
        wipeTiles.push({ img: img, x: minX * 108 + (maxX - minX + 1) * 54, y: (minY + shift) * 108 + (maxY - minY + 1) * 54 });
      });
    });
  })();
  var WIPE_H = 0.34;
  function drawWipe(p, mode) {
    // p runs from -1 to 1, covered at 0. mode picks the direction of the sweep.
    if (Math.abs(p) >= 1) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
    var dark = clamp(1 - (Math.abs(p) - 0.04) / 0.2, 0, 1);
    if (dark > 0) { ctx.globalAlpha = dark; ctx.fillStyle = '#0a0d20'; ctx.fillRect(0, 0, W, H); }
    wipeTiles.forEach(function (w) {
      var d = mode === 0 ? (w.x + w.y) / (W * 2) : mode === 1 ? 1 - w.y / H : mode === 2 ? Math.hypot(w.x - W / 2, w.y - H / 2) / (W * 0.72) : 1 - (w.x + (H - w.y)) / (W * 2);
      d = clamp(d, 0, 1);
      var k;
      if (p < 0) k = backOut((p + 1) * 1.7 - d * 0.7);
      else k = 1 - smooth(p * 1.7 - d * 0.7);
      if (k <= 0.01) return;
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(w.x, w.y); ctx.rotate((1 - Math.min(k, 1)) * 0.9 * (p < 0 ? -1 : 1)); ctx.scale(k, k);
      ctx.drawImage(w.img, -w.img.width / 2, -w.img.height / 2); ctx.restore();
    });
    ctx.restore();
  }
  var WIPES = [[SEC.play, 2], [SEC.twos, 0], [SEC.glass, 3], [SEC.water, 1], [SEC.bombs, 0], [SEC.big, 2], [SEC.end, 1]];

  function paint() {
    var t = time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (t < SEC.play || t >= SEC.end) drawCard(t);
    else {
      drawBackground();
      drawWell();
      drawFx();
      drawBloom();
      drawPage(0.34);
      if (cam.flash > 0.01) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = cam.flash; ctx.fillStyle = '#fff6e0'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      drawCallouts();
      if (cam.ca > 0.03) aberrate(cam.ca * 15);
      ctx.drawImage(vignette, 0, 0);
      drawCaption();
    }
    WIPES.forEach(function (w) { drawWipe((t - w[0]) / WIPE_H, w[1]); });
  }

  // The stage's three calls -----------------------------------------------------------------

  var at = -1;
  function goTo(n, draw) {
    while (at < n) { at++; advance(at); }
    if (draw) { paint(); return main.toDataURL('image/jpeg', 0.985); }
    return null;
  }
  window.frame = function (n) { return goTo(n, true); };
  window.seek = function (n) { return goTo(n, true); };
  window.runLog = function () {
    goTo(FRAMES - 1, false);
    var kinds = Object.keys(shown.kinds).map(function (k) {
      var per = Math.round(shown.squares / shown.kinds[k]);
      return k + ': ' + shown.kinds[k] + ' (1 in ' + per + ')';
    });
    var total = Object.keys(shown.kinds).reduce(function (n, k) { return n + shown.kinds[k]; }, 0);
    return log.concat(['squares shown ' + shown.squares + ', special ' + total + ' (1 in ' + Math.round(shown.squares / total) + ')', kinds.join(', ')]);
  };
  window.stageInfo = { frames: FRAMES, fps: FPS };
  try { paint(); } catch (e) { window.stageError = e.stack || e.message; }
  window.stageReady = true;
})();
