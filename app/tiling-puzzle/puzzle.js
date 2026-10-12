/* The Tiling Puzzle page: input, drawing and panels, on Canvas 2D. The
   geometry is in board.js, the verdicts come from checker.js in a worker,
   and the specification is docs/tiling-puzzle.md, "The board (phase 5)"
   and "The Hat and Spectre checker (phase 6)".
   The page shows how many rings are complete, marks corners where no piece
   can fit, and says whether the patch fits a tiling. */
(function () {
  'use strict';

  const TB = TilingBoard;
  const $ = id => document.getElementById(id);
  const canvas = $('board'), handCanvas = $('hand-canvas');
  if (!canvas.getContext) { $('fail').hidden = false; return; }
  const ctx = canvas.getContext('2d'), hctx = handCanvas.getContext('2d');

  /* -------------------------------------------------------------- state */

  let piece = null, board = null;
  const hand = { flip: 0, turn: 0 };
  const view = { x: 0, y: 0, scale: 40, rot: 0 };
  let W = 1, H = 1, dpr = 1;
  let drag = null;            // the piece in the air
  let slide = null;           // a refused piece going back to the hand
  let notice = '';            // a message from the link, shown in the status
  let info = { ring: new Int32Array(1), complete: 0 };
  let usedHand = false;       // the visitor has turned or lifted the piece
  let dirty = true;
  let steps = [1];            // the tile count after each undo step
  let verdict = null;         // the checker's answer for the current board
  let version = 0;            // counts board changes, so stale answers are dropped
  let changedAt = 0;          // when the current board change began
  let verdictMs = 0;          // from that change to its verdict on screen
  let ghosts = null;          // Hint: {tiles, t0}
  let incoming = null;        // Add one: a piece sliding in from the hand
  let filling = null;         // Fill a ring: {queue, timer}
  let redSegs = null;         // the red edges of the current verdict, cached
  const look = { grouping: 'ring', palette: 'pastel' };
  const LIFT = 60;            // px a touched piece rides above the finger
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* the page works without it */ } }
  };

  /* ------------------------------------------------------------- colours */

  function oklch(L, C, hue) {
    const h = hue * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    const enc = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
    return [enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
            enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
            enc(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  }
  const rgb = c => 'rgb(' + c.map(v => Math.round(v * 255)).join(',') + ')';
  const lum = c => 0.2126 * Math.pow(c[0], 2.2) + 0.7152 * Math.pow(c[1], 2.2) + 0.0722 * Math.pow(c[2], 2.2);
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  // The explorer's three palettes. A palette names a colour for a ring and
  // one for an orientation, the way the explorer tabs name them.
  const PALETTES = {
    pastel: {
      ring: (r, dark) => oklch(dark ? 0.42 : 0.86, dark ? 0.07 : 0.09, 25 + r * 57),
      orient: (kind, flip, turn, n, dark) => {
        if (kind === 'hat') {
          const m = flip === 1, hue = turn * 60 + 25;
          return dark ? oklch(m ? 0.66 : 0.40, m ? 0.13 : 0.065, hue) : oklch(m ? 0.60 : 0.88, m ? 0.15 : 0.075, hue);
        }
        if (kind === 'spectre') {
          const rare = turn % 2 === 1, hue = turn * 30 + 25;
          return dark ? oklch(rare ? 0.66 : 0.40, rare ? 0.13 : 0.065, hue) : oklch(rare ? 0.64 : 0.88, rare ? 0.15 : 0.075, hue);
        }
        return oklch(dark ? 0.42 : 0.86, dark ? 0.07 : 0.09, 25 + turn * 360 / n);
      }
    },
    rainbow: {
      ring: (r, dark) => oklch(dark ? 0.55 : 0.78, 0.13, 25 + r * 57),
      orient: (kind, flip, turn, n, dark) => {
        const hue = kind === 'hat' ? 25 + turn * 60 + (flip ? 30 : 0) : 25 + turn * 360 / n;
        return oklch(dark ? 0.55 : 0.78, 0.13, hue);
      }
    },
    grey: {
      ring: r => oklch(0.15 + 0.8 * ((r % 6) / 5), 0, 0),
      orient: (kind, flip, turn, n) => {
        const total = kind === 'hat' ? 12 : n, idx = kind === 'hat' ? turn + (flip ? 6 : 0) : turn;
        return oklch(total > 1 ? idx / (total - 1) : 0.5, 0, 0);
      }
    }
  };
  const colourCache = new Map();
  function isDark() { return document.documentElement.dataset.theme === 'dark'; }

  /* A tile's fill and the ink that edges it, from its ring and turn. */
  function tileLook(t, ring) {
    const dark = isDark();
    const key = look.grouping === 'one' ? 'one' : look.grouping === 'ring' ? 'r' + ring : 'o' + t.flip + ',' + t.turn;
    const full = [piece.key, look.palette, dark ? 'd' : 'l', key].join('|');
    let c = colourCache.get(full);
    if (c) return c;
    let col;
    if (look.grouping === 'one') col = dark ? [0.165, 0.165, 0.19] : [0.992, 0.988, 0.973];
    else if (look.grouping === 'ring') col = PALETTES[look.palette].ring(ring, dark);
    else col = PALETTES[look.palette].orient(piece.kind, t.flip, t.turn, piece.turns, dark);
    const edge = dark ? [0.706, 0.686, 0.639] : [0.204, 0.2, 0.18];
    const alt = dark ? [0.204, 0.2, 0.18] : [0.847, 0.831, 0.788];
    const l = lum(col);
    const ink = contrast(l, lum(alt)) > contrast(l, lum(edge)) ? alt : edge;
    c = { fill: rgb(col), ink: rgb(ink) };
    colourCache.set(full, c);
    return c;
  }

  /* --------------------------------------------------------------- view */

  function matrix() {
    const s = view.scale, c = Math.cos(view.rot), n = Math.sin(view.rot);
    const a = s * c, b = -s * n, cc = -s * n, d = -s * c;
    return [a, b, cc, d, W / 2 - (view.x * a + view.y * cc), H / 2 - (view.x * b + view.y * d)];
  }
  function toScreen(X, Y) { const m = matrix(); return [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]]; }
  function toWorld(sx, sy) {
    const m = matrix(), det = m[0] * m[3] - m[1] * m[2];
    const u = sx - m[4], v = sy - m[5];
    return [(m[3] * u - m[2] * v) / det, (-m[1] * u + m[0] * v) / det];
  }
  const MIN_SCALE = 3, MAX_SCALE = 400;
  function clampScale() { view.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale)); }

  /* Zoom and turn about a screen point, keeping the world under it fixed. */
  function zoomAbout(sx, sy, factor, dRot) {
    const w0 = toWorld(sx, sy);
    view.scale *= factor;
    clampScale();
    view.rot += dRot || 0;
    const w1 = toWorld(sx, sy);
    view.x += w0[0] - w1[0];
    view.y += w0[1] - w1[1];
    requestDraw();
  }

  function defaultScale() {
    return Math.max(6, Math.min(90, Math.min(W, H * 0.9) / (piece.width * 3.4)));
  }

  /* The view that shows the whole patch, never closer than the opening
     zoom. */
  function fitView() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    board.tiles.forEach(t => {
      x0 = Math.min(x0, t.poly.x0); x1 = Math.max(x1, t.poly.x1);
      y0 = Math.min(y0, t.poly.y0); y1 = Math.max(y1, t.poly.y1);
    });
    view.rot = 0;
    view.x = (x0 + x1) / 2;
    view.y = (y0 + y1) / 2;
    const fit = 0.62 * Math.min(W / Math.max(x1 - x0, 1e-6), H / Math.max(y1 - y0, 1e-6));
    view.scale = Math.max(MIN_SCALE, Math.min(defaultScale(), fit));
    requestDraw();
  }

  /* --------------------------------------------------------------- hand */

  function turnHand(steps) {
    hand.turn = ((hand.turn + steps) % piece.turns + piece.turns) % piece.turns;
    usedHand = true;
    if (drag) updateSnap();
    refreshText();
    requestDraw();
  }
  function flipHand() {
    if (!piece.flips) return;
    hand.flip ^= 1;
    usedHand = true;
    if (drag) updateSnap();
    refreshText();
    requestDraw();
  }

  /* ------------------------------------------------------------- drawing */

  const pathCache = new Map();
  function pathFor(flip, turn) {
    const key = piece.key + '|' + flip + '|' + turn;
    let p = pathCache.get(key);
    if (!p) {
      const V = TB.variant(piece, flip, turn);
      p = new Path2D();
      p.moveTo(V.xs[0], V.ys[0]);
      for (let i = 1; i < V.n; i++) p.lineTo(V.xs[i], V.ys[i]);
      p.closePath();
      pathCache.set(key, p);
    }
    return p;
  }

  function requestDraw() {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(draw);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = document.documentElement.clientWidth;
    H = document.documentElement.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const r = handCanvas.getBoundingClientRect();
    handCanvas.width = Math.max(1, Math.round(r.width * dpr));
    handCanvas.height = Math.max(1, Math.round(r.height * dpr));
    const pc = $('piece-card').getBoundingClientRect();
    document.documentElement.style.setProperty('--piece-h', Math.round(pc.height) + 'px');
    dirty = false;
    requestDraw();
  }

  function draw() {
    dirty = false;
    const dark = isDark();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = dark ? '#16161a' : '#f6f3ec';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const m = matrix(), lw = 1.5 / view.scale;
    ctx.lineJoin = 'round';

    // The placed tiles, skipping any whose box is off screen.
    for (let i = 0; i < board.tiles.length; i++) {
      const t = board.tiles[i], P = t.poly;
      const sx = [m[0] * P.x0 + m[2] * P.y0 + m[4], m[0] * P.x1 + m[2] * P.y0 + m[4],
                  m[0] * P.x0 + m[2] * P.y1 + m[4], m[0] * P.x1 + m[2] * P.y1 + m[4]];
      const sy = [m[1] * P.x0 + m[3] * P.y0 + m[5], m[1] * P.x1 + m[3] * P.y0 + m[5],
                  m[1] * P.x0 + m[3] * P.y1 + m[5], m[1] * P.x1 + m[3] * P.y1 + m[5]];
      if (Math.max.apply(null, sx) < 0 || Math.min.apply(null, sx) > W ||
          Math.max.apply(null, sy) < 0 || Math.min.apply(null, sy) > H) continue;
      const lk = tileLook(t, info.ring[i]), red = i === redTile;
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3],
                       dpr * (m[0] * t.x + m[2] * t.y + m[4]), dpr * (m[1] * t.x + m[3] * t.y + m[5]));
      const path = pathFor(t.flip, t.turn);
      ctx.fillStyle = red ? (dark ? '#b8293f' : '#e0465c') : lk.fill;
      ctx.fill(path);
      if (red) hatch(path);
      ctx.strokeStyle = red ? (dark ? '#ffd0d6' : '#7a0f1f') : lk.ink;
      ctx.lineWidth = red ? 2.5 / view.scale : lw;
      ctx.stroke(path);
    }

    // Hint: a faint ghost at every legal next placement, stronger at the
    // hand's own turn. They fade over the last 0.6 of their 4 seconds.
    if (ghosts) {
      const age = (performance.now() - ghosts.t0) / 1000;
      if (age >= 4) ghosts = null;
      else {
        const fade = Math.min(1, (4 - age) / 0.6);
        ghosts.tiles.forEach(g => {
          const strong = g.flip === hand.flip && g.turn === hand.turn;
          ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3],
                           dpr * (m[0] * g.x + m[2] * g.y + m[4]), dpr * (m[1] * g.x + m[3] * g.y + m[5]));
          const path = pathFor(g.flip, g.turn);
          ctx.globalAlpha = fade * (strong ? 0.32 : 0.12);
          ctx.fillStyle = dark ? '#7aa6e0' : '#1552a1';
          ctx.fill(path);
          ctx.globalAlpha = fade * (strong ? 0.95 : 0.4);
          ctx.strokeStyle = dark ? '#7aa6e0' : '#1552a1';
          ctx.lineWidth = (strong ? 2 : 1.2) / view.scale;
          if (!strong) ctx.setLineDash([4 / view.scale, 4 / view.scale]);
          ctx.stroke(path);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        });
        requestDraw();
      }
    }

    // Shared edges that no tiling holds, in red.
    const segs = redEdgeSegments();
    if (segs.length) {
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * m[4], dpr * m[5]);
      ctx.strokeStyle = dark ? '#ff6b7d' : '#d41f3c';
      ctx.lineWidth = 5 / view.scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      segs.forEach(q => { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); });
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // Dead corners, as red wedges in the gaps.
    ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3], dpr * m[4], dpr * m[5]);
    const hot = dark ? 'rgba(255,77,100,0.85)' : 'rgba(224,33,62,0.8)';
    board.deadCorners().forEach(rec => {
      const cur = board.cornerAt(rec.x, rec.y);
      cur.gaps.forEach(g => {
        ctx.beginPath();
        ctx.moveTo(rec.x, rec.y);
        ctx.arc(rec.x, rec.y, 0.55, g[0], g[1], false);
        ctx.closePath();
        ctx.fillStyle = hot;
        ctx.fill();
      });
    });

    // The ghost where the dragged piece would snap: a neutral outline.
    if (drag && drag.snap) {
      const s = drag.snap;
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3],
                       dpr * (m[0] * s.x + m[2] * s.y + m[4]), dpr * (m[1] * s.x + m[3] * s.y + m[5]));
      const path = pathFor(s.flip, s.turn);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
      ctx.fill(path);
      ctx.setLineDash([5 / view.scale, 4 / view.scale]);
      ctx.strokeStyle = dark ? '#e8e4d8' : '#1a1a1a';
      ctx.lineWidth = 2 / view.scale;
      ctx.stroke(path);
      ctx.setLineDash([]);
    }

    // The piece in the air, sliding back to the hand, or sliding in for
    // Add one.
    let air = null;
    if (drag) air = { cx: drag.cx, cy: drag.cy, flip: hand.flip, turn: hand.turn };
    else if (incoming) {
      const k = Math.min(1, (performance.now() - incoming.t0) / incoming.dur), e = 1 - Math.pow(1 - k, 3);
      const r = handCanvas.getBoundingClientRect(), from = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      air = { cx: from[0] + (incoming.cx - from[0]) * e, cy: from[1] + (incoming.cy - from[1]) * e, flip: incoming.t.flip, turn: incoming.t.turn };
      if (k >= 1) setTimeout(finishIncoming, 0); else requestDraw();
    } else if (slide) {
      const k = Math.min(1, (performance.now() - slide.t0) / slide.dur), e = 1 - Math.pow(1 - k, 3);
      const r = handCanvas.getBoundingClientRect(), to = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      air = { cx: slide.cx + (to[0] - slide.cx) * e, cy: slide.cy + (to[1] - slide.cy) * e, flip: slide.flip, turn: slide.turn };
      if (k >= 1) slide = null; else requestDraw();
    }
    if (air) {
      const V = TB.variant(piece, air.flip, air.turn), x = air.cx - V.cx, y = air.cy - V.cy;
      ctx.setTransform(dpr * m[0], dpr * m[1], dpr * m[2], dpr * m[3],
                       dpr * (m[0] * x + m[2] * y + m[4]), dpr * (m[1] * x + m[3] * y + m[5]));
      const path = pathFor(air.flip, air.turn);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = dark ? '#3a3a44' : '#fffdf6';
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = dark ? '#7aa6e0' : '#1552a1';
      ctx.lineWidth = 2.2 / view.scale;
      ctx.stroke(path);
    }
    drawHand();
  }

  /* Light diagonal stripes over the red tile, so it reads as marked in any
     palette. */
  function hatch(path) {
    ctx.save();
    ctx.clip(path);
    const V = TB.variant(piece, 0, 0), r = piece.radius * 2.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3 / view.scale;
    ctx.beginPath();
    for (let d = -r; d <= r; d += 10 / view.scale) {
      ctx.moveTo(V.cx + d - r, V.cy - r);
      ctx.lineTo(V.cx + d + r, V.cy + r);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* The red tile: the drop that emptied the match set. */
  let redTile = -1;

  /* The segments of every shared edge the verdict marks, as x0, y0, x1, y1. */
  function redEdgeSegments() {
    if (redSegs) return redSegs;
    redSegs = [];
    if (!verdict || !verdict.redEdges) return redSegs;
    const tol = 1e-7;
    verdict.redEdges.forEach(pair => {
      const a = board.tiles[pair[0]], b = board.tiles[pair[1]];
      if (!a || !b) return;
      const P = a.poly, Q = b.poly;
      for (let e = 0; e < P.n; e++) {
        const e1 = (e + 1) % P.n;
        for (let f = 0; f < Q.n; f++) {
          const f1 = (f + 1) % Q.n;
          if (Math.abs(P.xs[e] - Q.xs[f1]) < tol && Math.abs(P.ys[e] - Q.ys[f1]) < tol &&
              Math.abs(P.xs[e1] - Q.xs[f]) < tol && Math.abs(P.ys[e1] - Q.ys[f]) < tol) {
            redSegs.push([P.xs[e], P.ys[e], P.xs[e1], P.ys[e1]]);
          }
        }
      }
    });
    return redSegs;
  }

  function drawHand() {
    const w = handCanvas.width, h = handCanvas.height, dark = isDark();
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, w, h);
    const V = TB.variant(piece, hand.flip, hand.turn);
    const s = 0.86 * Math.min(w, h) / (2 * piece.radius);
    hctx.setTransform(s, 0, 0, -s, w / 2 - s * V.cx, h / 2 + s * V.cy);
    const path = pathFor(hand.flip, hand.turn);
    hctx.globalAlpha = drag ? 0.3 : 1;
    hctx.fillStyle = dark ? '#3a3a44' : '#fffdf6';
    hctx.fill(path);
    hctx.strokeStyle = dark ? '#7aa6e0' : '#1552a1';
    hctx.lineWidth = 2.2 * dpr / s;
    hctx.lineJoin = 'round';
    if (drag) hctx.setLineDash([5 * dpr / s, 4 * dpr / s]);
    hctx.stroke(path);
    hctx.setLineDash([]);
    hctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------- piece and board */

  function loadPiece(p, b) {
    stopAnimations();
    piece = p;
    pathCache.clear();
    colourCache.clear();
    hand.flip = 0; hand.turn = 0;
    usedHand = false;
    drag = null; slide = null;
    const res = TB.decode(p, b || '');
    board = res.board;
    notice = res.error || '';
    steps = [];
    for (let i = 1; i <= board.count; i++) steps.push(i);
    changed();
    verdict = null;
    checkerFor();
    resize();
    fitView();
    syncPanels();
    refresh();
  }

  function newBoard(p) {
    notice = '';
    loadPiece(p, '');
  }

  /* Tile count, ring counter and dead corners, the verdict, the steps, the
     saved board and the address bar. */
  function refresh() {
    info = board.rings();
    requestVerdict();
    refreshText();
    persist();
    requestDraw();
  }

  /* Call before every change to the board: later answers about the old
     board are dropped, and the Hint ghosts go. */
  function changed() {
    version++;
    changedAt = performance.now();
    if (verdict) verdict.stale = true;
    redTile = -1;
    redSegs = null;
    ghosts = null;
    // A slow answer shows "Checking…" rather than the last board's verdict.
    setTimeout(refreshText, 260);
  }

  function refreshText() {
    const n = board.count, r = info.complete, dead = board.deadCorners().length;
    const el = $('status');
    let s = n + (n === 1 ? ' tile' : ' tiles') + ' · ' + (r > 0 ? 'ring ' + r + ' complete' : 'no ring complete yet');
    let cls = '';
    const vt = verdictText();
    if (vt) { s += ' · ' + vt.text; cls = vt.cls; }
    if (dead) { s += ' · No piece fits at the red corner' + (dead > 1 ? 's' : ''); cls = 'bad'; }
    if (notice) { s = notice + ' ' + s; cls = 'bad'; }
    el.textContent = s;
    el.classList.toggle('bad', cls === 'bad');
    el.classList.toggle('good', cls === 'good');
    const busy = !!(incoming || filling);
    $('undo').disabled = steps.length <= 1 || busy;
    $('clear').disabled = n <= 1 || busy;
    const c = checkerFor(), help = helpReady();
    ['hint', 'add-one', 'fill-ring'].forEach(id => {
      $(id).disabled = !help;
      $(id).title = HELP_TITLES[id];
    });
    const good = c ? lastGood() : 0;
    $('undo-good').disabled = !(c && isRed() && good >= 1 && good < n) || busy;
    $('undo-good').title = 'Step back to the last patch that fits a tiling';
    const step = n === 1 ? (usedHand ? 1 : 0) : (r >= 1 ? 3 : 2);
    Array.prototype.forEach.call($('steps').children, (li, i) => li.classList.toggle('on', i === step));
  }
  const HELP_TITLES = {
    'hint': 'Show every place the next piece can go',
    'add-one': 'The computer adds one piece',
    'fill-ring': 'The computer completes the next ring'
  };

  /* ------------------------------------------------------------ checker */

  // One checker per piece, built on first use. Each runs checker.js in a
  // worker, or in the page when the browser has no workers or refuses one,
  // as a page opened from a file may.
  const checkers = {};
  let requestId = 0;

  function checkerFor() {
    if (!TilingChecker.KINDS[piece.kind]) return null;
    const key = piece.key, kind = piece.kind;
    if (checkers[key]) return checkers[key];
    const c = { key: key, kind: kind, ready: false, info: null, failed: '', waiting: new Map(), send: null, worker: null, retired: false };
    checkers[key] = c;
    const init = { type: 'init', kind: kind };
    const receive = msg => {
      if (c.retired) return;
      if (msg.type === 'ready') {
        c.ready = true;
        c.info = msg.info;
        if (piece && piece.key === key) { requestVerdict(); refreshText(); }
        return;
      }
      if (msg.type === 'error' && msg.request === 'init') { c.failed = msg.message; refreshText(); return; }
      const w = c.waiting.get(msg.id);
      if (w) { c.waiting.delete(msg.id); w.resolve(msg); }
    };
    const inPage = () => {
      const handle = TilingChecker.createHandler();
      c.send = msg => setTimeout(() => { if (!c.retired) handle(msg, receive); }, 0);
    };
    let worker = null;
    try { worker = typeof Worker === 'function' ? new Worker('checker.js') : null; } catch (e) { worker = null; }
    if (worker) {
      c.worker = worker;
      worker.onmessage = e => receive(e.data);
      worker.onerror = e => {
        if (e && e.preventDefault) e.preventDefault();
        worker.terminate();
        c.worker = null;
        inPage();
        c.ready = false;
        c.send(init);
        c.waiting.forEach(w => c.send(w.msg));
      };
      c.send = msg => worker.postMessage(msg);
    } else {
      inPage();
    }
    c.send(init);
    return c;
  }

  function ask(msg) {
    const c = checkerFor();
    msg.id = ++requestId;
    return new Promise(resolve => { c.waiting.set(msg.id, { msg: msg, resolve: resolve }); c.send(msg); });
  }
  function flatTiles() {
    const out = [];
    board.tiles.forEach(t => out.push(t.flip, t.turn, t.x, t.y));
    return out;
  }
  const unpackTiles = flat => TilingChecker.unpack(flat || []);

  function requestVerdict() {
    const c = checkerFor(), v = version, started = changedAt;
    if (!c || !c.ready) return;
    ask({ type: 'verdict', tiles: flatTiles() }).then(msg => {
      if (v !== version || piece.key !== c.key) return;
      verdict = msg.type === 'error' ? { status: 'error', message: msg.message, count: board.count } : msg;
      redTile = verdict.status === 'dead' && verdict.redTile < board.count ? verdict.redTile : -1;
      redSegs = null;
      refreshText();
      requestDraw();
      requestAnimationFrame(() => { verdictMs = performance.now() - started; shown = { count: msg.count, ms: verdictMs }; });
    });
  }
  let shown = { count: 0, ms: 0 };

  function fresh() { return !!(verdict && !verdict.stale && verdict.count === board.count); }
  function isRed() {
    if (!fresh()) return false;
    return verdict.status === 'dead' ||
           (verdict.status === 'large' && board.deadCorners().length > 0);
  }
  function helpReady() {
    const c = checkerFor();
    return !!(c && c.ready && fresh() && verdict.status === 'fits' && !incoming && !filling && !drag);
  }

  function verdictText() {
    const c = checkerFor();
    if (!c) return null;
    const name = piece.name;
    const which = () => 'a ' + name + ' tiling';
    if (c.failed) return { text: 'The ' + name + ' checker failed: ' + c.failed, cls: 'bad' };
    if (!c.ready) return { text: 'Building the ' + name + ' reference…', cls: '' };
    if (filling) return { text: 'Filling ring ' + (filling.ring + 1) + '…', cls: '' };
    const v = verdict;
    if (!v || (v.stale && performance.now() - changedAt > 250)) return { text: 'Checking…', cls: '' };
    if (v.status === 'error') return { text: v.message, cls: 'bad' };
    if (v.status === 'fits') return { text: 'Fits a ' + name + ' tiling, so it can go on forever', cls: 'good' };
    if (v.status === 'dead') return { text: 'Dead end: this patch is in no ' + name + ' tiling', cls: 'bad' };
    return { text: 'Too large to check. Up to ' + (v.largeFrom - 1) + ' tiles it fitted ' + which(v), cls: 'good' };
  }

  /* The latest state whose match set is not empty and that has no dead
     corner, as a tile count, or 0. */
  function lastGood() {
    if (!verdict || verdict.stale) return 0;
    let top = board.count;
    if (verdict.deadFrom) top = Math.min(top, verdict.deadFrom - 1);
    if (verdict.largeFrom) top = Math.min(top, verdict.largeFrom - 1);
    for (let n = top; n >= 1; n--) if (board.deadCountAt(n) === 0) return n;
    return 0;
  }

  /* --------------------------------------------------------- computer help */

  function undoTo(count) {
    stopAnimations();
    while (steps.length > 1 && steps[steps.length - 1] > count) steps.pop();
    if (steps[steps.length - 1] !== count) steps.push(count);
    changed();
    board.undoTo(count);
    notice = '';
    refresh();
  }

  function showHint() {
    if (!helpReady()) return;
    const v = version;
    ask({ type: 'hint', tiles: flatTiles() }).then(msg => {
      if (v !== version) return;
      if (msg.type === 'error') { notice = msg.message; refreshText(); return; }
      ghosts = { tiles: unpackTiles(msg.tiles), t0: performance.now() };
      requestDraw();
    });
  }

  function addOne() {
    if (!helpReady()) return;
    const v = version;
    ask({ type: 'add-one', tiles: flatTiles(), rings: Array.from(info.ring) }).then(msg => {
      if (v !== version || incoming || filling) return;
      if (msg.type === 'error' || !msg.tile) { notice = msg.message || 'No piece can be added here.'; refreshText(); return; }
      const t = unpackTiles(msg.tile)[0];
      if (!board.canPlace(t.flip, t.turn, t.x, t.y)) { notice = 'The added piece does not fit the board.'; refreshText(); return; }
      const V = TB.variant(piece, t.flip, t.turn);
      incoming = { t: t, cx: t.x + V.cx, cy: t.y + V.cy, t0: performance.now(), dur: 280 };
      ghosts = null;
      refreshText();
      requestDraw();
    });
  }
  function finishIncoming() {
    if (!incoming) return;
    const t = incoming.t;
    incoming = null;
    changed();
    board.place(t);
    steps.push(board.count);
    notice = '';
    refresh();
  }

  function fillRing() {
    if (!helpReady()) return;
    const v = version;
    ask({ type: 'fill-ring', tiles: flatTiles(), rings: Array.from(info.ring), complete: info.complete }).then(msg => {
      if (v !== version || incoming || filling) return;
      if (msg.type === 'error') { notice = msg.message; refreshText(); return; }
      const list = unpackTiles(msg.tiles);
      if (!list.length) return;
      changed();
      // About 1.5 seconds in all, one piece at a time.
      const every = Math.max(20, Math.min(160, 1500 / list.length));
      filling = { queue: list, ring: info.complete, timer: setInterval(fillTick, every) };
      refreshText();
    });
  }
  /* Places the next piece of the ring that shares an edge with the patch. */
  function fillTick() {
    const q = filling.queue;
    let k = q.findIndex(t => board.canPlace(t.flip, t.turn, t.x, t.y));
    if (k >= 0) board.place(q.splice(k, 1)[0]);
    if (k < 0 || !q.length) { endFill(); return; }
    info = board.rings();
    requestDraw();
  }
  function endFill() {
    clearInterval(filling.timer);
    filling = null;
    steps.push(board.count);
    refresh();
  }
  /* Completes any piece still moving in, so the next action starts from a
     settled board. */
  function finishAnimations() {
    if (incoming) finishIncoming();
    if (filling) {
      while (filling.queue.length) {
        const k = filling.queue.findIndex(t => board.canPlace(t.flip, t.turn, t.x, t.y));
        if (k < 0) break;
        board.place(filling.queue.splice(k, 1)[0]);
      }
      endFill();
    }
  }
  function stopAnimations() {
    incoming = null;
    if (filling) { clearInterval(filling.timer); filling = null; }
  }

  function persist() {
    const link = TB.linkOf(board);
    store.set('tiling-puzzle:board:' + piece.key, board.encode());
    store.set('tiling-puzzle:last', link.split('&b=')[0]);
    try { history.replaceState(null, '', '#' + link); } catch (e) { /* a file page may refuse */ }
  }

  /* Opens the board a link names. Returns false when the text names none. */
  function openLink(text) {
    const q = TB.parseQuery(text);
    if (!q.p) return false;
    const p = TB.pieceOf(q);
    if (!p) return false;
    loadPiece(p, q.b || '');
    return true;
  }

  function confirmLoss(what) {
    if (board.count < 5) return true;
    try { return window.confirm(what + ' will clear the ' + board.count + ' tiles on the board. Go on?'); }
    catch (e) { return true; }
  }

  function switchPiece(kind) {
    const p = TB.pieceType(kind);
    if (p.key === piece.key) return;
    if (!confirmLoss('Changing the piece')) return;
    newBoard(p);
  }

  function syncPanels() {
    Array.prototype.forEach.call($('piece-switch').children, b => b.setAttribute('aria-pressed', String(b.dataset.piece === piece.kind)));
    $('flip').hidden = !piece.flips;
    $('hand-label').textContent = piece.name;
    $('flip').disabled = !piece.flips;
    $('turn-left').title = 'Turn the piece left (Q), ' + (360 / piece.turns).toFixed(piece.turns % 6 === 0 ? 0 : 1) + '°';
    $('turn-right').title = 'Turn the piece right (E), ' + (360 / piece.turns).toFixed(piece.turns % 6 === 0 ? 0 : 1) + '°';
    requestAnimationFrame(() => {
      const pc = $('piece-card').getBoundingClientRect();
      document.documentElement.style.setProperty('--piece-h', Math.round(pc.height) + 'px');
    });
  }

  /* -------------------------------------------------------------- input */

  const pointers = new Map();     // id -> {x, y}

  function centreOf(p) { return [p.x, p.y - (drag && drag.touch ? LIFT : 0)]; }

  function updateSnap() {
    const w = toWorld(drag.sx, drag.sy - (drag.touch ? LIFT : 0));
    drag.cx = w[0]; drag.cy = w[1];
    drag.snap = board.snap(hand.flip, hand.turn, drag.cx, drag.cy, 0.6 * piece.width);
  }

  function startDrag(e) {
    if (drag) return;
    finishAnimations();
    slide = null;
    drag = { id: e.pointerId, touch: e.pointerType !== 'mouse', sx: e.clientX, sy: e.clientY, cx: 0, cy: 0, snap: null, twist: null };
    usedHand = true;
    updateSnap();
    refreshText();
    requestDraw();
  }

  function drop() {
    const d = drag, t0 = performance.now();
    updateSnap();
    const s = drag.snap;
    drag = null;
    if (s) {
      changed();
      changedAt = t0;
      board.place({ turn: s.turn, flip: s.flip, x: s.x, y: s.y }, { a: s.a, ea: s.ea, ej: s.ej });
      steps.push(board.count);
      notice = '';
      refresh();
    } else {
      slide = { cx: d.cx, cy: d.cy, flip: hand.flip, turn: hand.turn, t0: performance.now(), dur: 200 };
      refreshText();
      requestDraw();
    }
  }

  function angleBetween(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  function onBoardDown(e) {
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone */ }
    if (drag && !drag.twist && e.pointerId !== drag.id) {
      const a = pointers.get(drag.id);
      drag.twist = { id: e.pointerId, a0: angleBetween(a, pointers.get(e.pointerId)), turn0: hand.turn };
    }
    if (!drag && pointers.size === 1) canvas.classList.add('panning');
  }

  function onHandDown(e) {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { handCanvas.setPointerCapture(e.pointerId); } catch (err) { /* the pointer may be gone */ }
    if (!drag) startDrag(e);
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const ox = p.x, oy = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (drag) {
      if (e.pointerId === drag.id) {
        drag.sx = p.x; drag.sy = p.y;
        updateSnap();
        requestDraw();
      } else if (drag.twist && drag.twist.id === e.pointerId) {
        const a = angleBetween(pointers.get(drag.id), p);
        // Screen angles grow clockwise, and the piece turns anticlockwise.
        const steps = Math.round((a - drag.twist.a0) / piece.step);
        const turn = ((drag.twist.turn0 - steps) % piece.turns + piece.turns) % piece.turns;
        if (turn !== hand.turn) { hand.turn = turn; updateSnap(); refreshText(); requestDraw(); }
      }
      return;
    }
    if (pointers.size === 1) {
      const w0 = toWorld(ox, oy), w1 = toWorld(p.x, p.y);
      view.x += w0[0] - w1[0];
      view.y += w0[1] - w1[1];
      requestDraw();
    } else if (pointers.size >= 2) {
      const ids = Array.from(pointers.keys()).slice(0, 2);
      const a = pointers.get(ids[0]), b = pointers.get(ids[1]);
      // The pair as it was before this move.
      const pa = e.pointerId === ids[0] ? { x: ox, y: oy } : a, pb = e.pointerId === ids[1] ? { x: ox, y: oy } : b;
      const d0 = Math.hypot(pb.x - pa.x, pb.y - pa.y), d1 = Math.hypot(b.x - a.x, b.y - a.y);
      if (d0 > 1) {
        const mid0 = [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2], mid1 = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        const w0 = toWorld(mid0[0], mid0[1]);
        view.scale *= d1 / d0;
        clampScale();
        view.rot -= angleBetween(a, b) - angleBetween(pa, pb);
        const w1 = toWorld(mid1[0], mid1[1]);
        view.x += w0[0] - w1[0];
        view.y += w0[1] - w1[1];
        requestDraw();
      }
    }
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) canvas.classList.remove('panning');
    if (drag) {
      if (e.pointerId === drag.id) {
        if (e.type === 'pointercancel') { drag = null; requestDraw(); refreshText(); } else drop();
      } else if (drag.twist && drag.twist.id === e.pointerId) {
        drag.twist = null;
      }
    }
  }

  // The wheel zooms the board, and turns the piece while it is in the air.
  // A tile with many turns moves in whole hours in proportion to the wheel:
  // 50 units a turn up to 12 turns, and 600 / n below that, so that a notch
  // turns the piece by about the same angle for every tile.
  let wheelAcc = 0;
  function wheelTurn(dy) {
    const unit = piece.turns <= 12 ? 50 : Math.max(6, 600 / piece.turns);
    wheelAcc += dy;
    while (Math.abs(wheelAcc) >= unit) {
      turnHand(wheelAcc > 0 ? -1 : 1);
      wheelAcc -= Math.sign(wheelAcc) * unit;
    }
  }
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (drag) { wheelTurn(e.deltaY); return; }
    const k = e.ctrlKey ? 0.01 : 0.0016;
    zoomAbout(e.clientX, e.clientY, Math.exp(-e.deltaY * k), 0);
  }, { passive: false });
  handCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    wheelTurn(e.deltaY);
  }, { passive: false });

  canvas.addEventListener('pointerdown', onBoardDown);
  handCanvas.addEventListener('pointerdown', onHandDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  /* A button that repeats while it is held. */
  function holdRepeat(el, fn) {
    let delay = null, timer = null;
    const stop = () => { clearTimeout(delay); clearInterval(timer); delay = timer = null; };
    el.addEventListener('pointerdown', e => {
      if (e.button) return;
      e.preventDefault();
      fn();
      stop();
      const every = piece && piece.turns > 24 ? 45 : 110;
      delay = setTimeout(() => { timer = setInterval(fn, every); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(t => el.addEventListener(t, stop));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  holdRepeat($('turn-left'), () => turnHand(1));
  holdRepeat($('turn-right'), () => turnHand(-1));
  holdRepeat($('view-left'), () => { view.rot += 5 * Math.PI / 180; requestDraw(); });
  holdRepeat($('view-right'), () => { view.rot -= 5 * Math.PI / 180; requestDraw(); });
  holdRepeat($('zoom-in'), () => zoomAbout(W / 2, H / 2, 1.15, 0));
  holdRepeat($('zoom-out'), () => zoomAbout(W / 2, H / 2, 1 / 1.15, 0));
  $('flip').addEventListener('click', flipHand);
  $('home').addEventListener('click', fitView);

  $('undo').addEventListener('click', () => {
    finishAnimations();
    if (steps.length > 1) undoTo(steps[steps.length - 2]);
  });
  $('undo-good').addEventListener('click', () => {
    const n = lastGood();
    if (n >= 1 && n < board.count) undoTo(n);
  });
  $('hint').addEventListener('click', showHint);
  $('add-one').addEventListener('click', addOne);
  $('fill-ring').addEventListener('click', fillRing);
  $('clear').addEventListener('click', () => {
    finishAnimations();
    if (board.count <= 1 || !confirmLoss('Clear')) return;
    newBoard(piece);
  });
  $('share').addEventListener('click', () => {
    const url = location.href.split('#')[0] + '#' + TB.linkOf(board);
    const done = ok => {
      const b = $('share'), was = b.textContent;
      b.textContent = ok ? 'Link copied' : 'Link in address bar';
      setTimeout(() => { b.textContent = was; }, 1600);
    };
    try { history.replaceState(null, '', '#' + TB.linkOf(board)); } catch (e) { /* ignore */ }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    else done(false);
  });

  Array.prototype.forEach.call($('piece-switch').children, b => {
    b.addEventListener('click', () => switchPiece(b.dataset.piece));
  });

  $('grouping').addEventListener('change', () => {
    look.grouping = $('grouping').value;
    $('palette').disabled = look.grouping === 'one';
    store.set('tiling-puzzle:look', look.grouping + ',' + look.palette);
    requestDraw();
  });
  $('palette').addEventListener('change', () => {
    look.palette = $('palette').value;
    store.set('tiling-puzzle:look', look.grouping + ',' + look.palette);
    requestDraw();
  });

  document.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('undo').click(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'q') turnHand(1);
    else if (k === 'e') turnHand(-1);
    else if (k === 'f') { if (piece.flips) flipHand(); }
    else if (k === '+' || k === '=') zoomAbout(W / 2, H / 2, 1.2, 0);
    else if (k === '-') zoomAbout(W / 2, H / 2, 1 / 1.2, 0);
    else if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
      const step = 40 / view.scale, c = Math.cos(view.rot), s = Math.sin(view.rot);
      const dx = (k === 'arrowright' ? 1 : k === 'arrowleft' ? -1 : 0) * step;
      const dy = (k === 'arrowup' ? 1 : k === 'arrowdown' ? -1 : 0) * step;
      view.x += c * dx + s * dy;
      view.y += -s * dx + c * dy;
      requestDraw();
    } else return;
    e.preventDefault();
  });

  /* --------------------------------------------------------- full screen */

  const fsButton = $('fullscreen');
  const fsEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (fsEnabled) {
    fsButton.hidden = false;
    fsButton.addEventListener('click', () => {
      fsButton.blur();
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      } catch (e) { /* a browser may refuse */ }
    });
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      fsButton.setAttribute('aria-label', (on ? 'Exit' : 'Enter') + ' full screen');
      fsButton.title = (on ? 'Exit' : 'Enter') + ' full screen';
    });
  }

  /* For tools/tiling-puzzle/check-phase6.js and the screenshots: read-only
     views of the page, and the screen point of a drop that snaps. */
  window.TilingPuzzle = {
    board: () => board,
    ready: () => { const c = checkerFor(); return !!(c && c.ready && fresh()); },
    checkerInfo: () => { const c = checkerFor(); return c && c.info; },
    verdict: () => (fresh() ? verdict : { count: -1 }),
    shown: () => shown,
    dropTarget: () => {
      fitView();
      const V = TB.variant(piece, hand.flip, hand.turn);
      const list = board.candidates(hand.flip, hand.turn).filter(c => c.valid);
      for (let i = 0; i < list.length; i++) {
        const p = toScreen(list[i].x + V.cx, list[i].y + V.cy);
        if (p[0] > W * 0.3 && p[0] < W * 0.7 && p[1] > H * 0.3 && p[1] < H * 0.7) return p;
      }
      return null;
    }
  };

  /* --------------------------------------------------------------- start */

  window.addEventListener('resize', resize);
  // On a narrow window the play panel sits under the piece panel.
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--piece-h', Math.round($('piece-card').getBoundingClientRect().height) + 'px');
    }).observe($('piece-card'));
  }
  new MutationObserver(() => { colourCache.clear(); requestDraw(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('hashchange', () => {
    const now = location.hash.replace(/^#/, '');
    if (board && now !== TB.linkOf(board)) openLink(now);
  });
  if (window.Theme) Theme.wireThemeToggle();

  const saved = (store.get('tiling-puzzle:look') || '').split(',');
  if (['ring', 'orientation', 'one'].indexOf(saved[0]) >= 0) look.grouping = saved[0];
  if (PALETTES[saved[1]]) look.palette = saved[1];
  $('grouping').value = look.grouping;
  $('palette').value = look.palette;
  $('palette').disabled = look.grouping === 'one';

  W = document.documentElement.clientWidth;
  H = document.documentElement.clientHeight;
  if (!openLink(location.hash || location.search)) {
    // No link: the last board of the last piece, or the Hat.
    let last = TB.parseQuery(store.get('tiling-puzzle:last') || '');
    let p = null;
    try { p = TB.pieceOf(last); } catch (e) { p = null; }
    if (!p) p = TB.pieceType('hat');
    loadPiece(p, store.get('tiling-puzzle:board:' + p.key) || '');
    notice = '';
    refreshText();
  }
})();
