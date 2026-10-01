/* Drawing: the wallpaper, the well, the stack, the falling piece, the queue
   and every effect. See the Look section of docs/pentrys.md, and
   tools/pentrys/look.html, the still frame this matches.

   Canvas 2D, in layers. What stands still is drawn once and kept: the
   well's panel and dots in one offscreen canvas, and the stack in another,
   redrawn only when a piece locks or rows clear. Each frame copies those and
   draws only what moves. Glows are drawn once into small images and copied,
   so a frame uses no canvas shadows. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});
  var Pieces = Pentrys.Pieces, Rules = Pentrys.Rules;

  var FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  var TOP = 1.5;       // rows of room above the well, where pieces come in
  var GAUGE = 1.3;     // cells of room left of the well, for the row gauge
  var HIDDEN = Rules.HIDDEN, ROWS = Rules.ROWS;
  var GOLD = '#ffd66b', DANGER = '#ff4d6d';
  var WELLS = {
    light: { top: '#ffffff', bottom: '#edf0f7', dot: 'rgba(40,50,100,0.18)', rim: 'rgba(20,30,70,0.16)',
             shadow: 'rgba(70,55,20,0.22)', slot: 'rgba(255,255,255,0.96)', slotFront: '#ffffff',
             slotEdge: 'rgba(20,30,70,0.12)', slotEdgeFront: 'rgba(20,30,70,0.34)', wash: 'rgba(244,246,251,0.78)',
             ink: '#1d2140', muted: '#7c786d', gauge: '#a86f00', need: 'rgba(60,80,140,0.8)', needFill: 'rgba(90,110,160,0.25)',
             dim: 'rgba(246,243,236,0.55)', grey: 'rgba(170,172,184,0.9)' },
    dark: { top: '#151b3d', bottom: '#0a0d20', dot: 'rgba(170,190,255,0.16)', rim: 'rgba(200,215,255,0.18)',
            shadow: 'rgba(0,0,0,0.55)', slot: 'rgba(12,15,33,0.9)', slotFront: 'rgba(21,27,61,0.96)',
            slotEdge: 'rgba(200,215,255,0.1)', slotEdgeFront: 'rgba(200,215,255,0.34)', wash: 'rgba(13,17,40,0.72)',
            ink: '#ffffff', muted: '#918c80', gauge: GOLD, need: 'rgba(230,238,255,0.85)', needFill: 'rgba(200,215,255,0.22)',
            dim: 'rgba(10,12,26,0.5)', grey: 'rgba(70,74,94,0.92)' }
  };
  var LETTERS = {
    P: ['###', '#.#', '###', '#..', '#..'], E: ['###', '#..', '###', '#..', '###'],
    N: ['#..#', '##.#', '#.##', '#..#', '#..#'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
    R: ['###', '#.#', '##.', '#.#', '#.#'], Y: ['#.#', '#.#', '###', '.#.', '.#.'],
    S: ['###', '#..', '###', '..#', '###']
  };
  var TITLE_SHAPE = { P: 'P5', E: 'I3', N: 'N5', T: 'T5', R: 'L4', Y: 'Y5', S: 'S4' };
  var TILING = ['ZIIIIIXPPP', 'ZZZTWXXXPP', 'LVZTWWXUUU', 'LVTTTWWUFU', 'LVVVNNYFFF', 'LLNNNYYYYF'];

  // Canvas roundRect arrived in 2022 (Safari 16). Older browsers get this.
  if (root.CanvasRenderingContext2D && !root.CanvasRenderingContext2D.prototype.roundRect) {
    root.CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.max(0, Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2));
      this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
  }

  var light = false, WELL = WELLS.dark;
  var DPR = Math.min(2, root.devicePixelRatio || 1);
  var reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  var low = false;   // low effects

  function colour(shape) { var c = Pieces.COLOURS[shape]; return light ? c[2] : c[0]; }
  function rimLight(shape) { var c = Pieces.COLOURS[shape]; return light ? c[3] : c[1]; }
  function motion() { return !reduced && !low; }

  function sizeCanvas(cv, w, h) {
    var pw = Math.round(w * DPR), ph = Math.round(h * DPR);
    if (cv.width !== pw) cv.width = pw;
    if (cv.height !== ph) cv.height = ph;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); return ctx;
  }
  function offscreen(w, h) { var cv = document.createElement('canvas'); return { cv: cv, ctx: sizeCanvas(cv, w, h), w: w, h: h }; }
  function blit(ctx, off, x, y) { ctx.drawImage(off.cv, x || 0, y || 0, off.w, off.h); }

  // Shapes ---------------------------------------------------------------------

  // Split squares into edge-connected parts: a cleared row can cut a piece in two.
  function parts(cells) {
    var seen = {}, all = {}, out = [];
    cells.forEach(function (c) { all[c[0] + ',' + c[1]] = c; });
    cells.forEach(function (c) {
      if (seen[c[0] + ',' + c[1]]) return;
      var part = [], todo = [c];
      seen[c[0] + ',' + c[1]] = true;
      while (todo.length) {
        var p = todo.pop(); part.push(p);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var k = (p[0] + d[0]) + ',' + (p[1] + d[1]);
          if (all[k] && !seen[k]) { seen[k] = true; todo.push(all[k]); }
        });
      }
      out.push(part);
    });
    return out;
  }
  // The outline of one part, clockwise on screen, corners only.
  function outline(part) {
    var has = {}, next = {};
    part.forEach(function (c) { has[c[0] + ',' + c[1]] = true; });
    part.forEach(function (c) {
      var x = c[0], y = c[1];
      if (!has[x + ',' + (y - 1)]) next[x + ',' + y] = [x + 1, y];
      if (!has[(x + 1) + ',' + y]) next[(x + 1) + ',' + y] = [x + 1, y + 1];
      if (!has[x + ',' + (y + 1)]) next[(x + 1) + ',' + (y + 1)] = [x, y + 1];
      if (!has[(x - 1) + ',' + y]) next[x + ',' + (y + 1)] = [x, y];
    });
    var startKey = Object.keys(next)[0], start = startKey.split(',').map(Number), pts = [start];
    for (var p = next[startKey]; p[0] !== start[0] || p[1] !== start[1]; p = next[p[0] + ',' + p[1]]) pts.push(p);
    return pts.filter(function (b, i) {
      var a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
      return (b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0]);
    });
  }
  // Move every edge inwards by d cells, so neighbouring pieces show a gap.
  function inset(v, d) {
    var n = v.length;
    function unit(a, b) { return [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])]; }
    return v.map(function (p, i) {
      var a = unit(v[(i + n - 1) % n], p), b = unit(p, v[(i + 1) % n]);
      return [p[0] + d * (-a[1] - b[1]), p[1] + d * (a[0] + b[0])];
    });
  }
  function trace(ctx, v, ox, oy, s, r) {
    var n = v.length;
    function P(i) { var q = v[(i + n) % n]; return [ox + q[0] * s, oy + q[1] * s]; }
    var a = P(-1), b = P(0);
    ctx.beginPath(); ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (var i = 0; i < n; i++) { var p = P(i), q = P(i + 1); ctx.arcTo(p[0], p[1], q[0], q[1], r); }
    ctx.closePath();
  }

  // One piece: a single rounded shape, lit from above, with faint seams between its squares.
  function drawPiece(ctx, cells, shape, ox, oy, s, alpha) {
    var base = colour(shape), rim = rimLight(shape), r = s * 0.2;
    parts(cells).forEach(function (part) {
      var v = inset(outline(part), 0.055);
      ctx.save();
      if (alpha != null) ctx.globalAlpha = alpha;
      trace(ctx, v, ox, oy, s, r);
      ctx.fillStyle = base; ctx.fill();
      if (light) { ctx.strokeStyle = 'rgba(20,20,50,0.22)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.clip();
      part.forEach(function (c) {
        var py = oy + c[1] * s, g = ctx.createLinearGradient(0, py, 0, py + s);
        g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
        g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = g; ctx.fillRect(ox + c[0] * s, py, s, s);
      });
      var has = {};
      part.forEach(function (c) { has[c[0] + ',' + c[1]] = true; });
      ctx.beginPath();
      part.forEach(function (c) {
        var x = c[0], y = c[1];
        if (has[(x + 1) + ',' + y]) { ctx.moveTo(ox + (x + 1) * s, oy + (y + 0.2) * s); ctx.lineTo(ox + (x + 1) * s, oy + (y + 0.8) * s); }
        if (has[x + ',' + (y + 1)]) { ctx.moveTo(ox + (x + 0.2) * s, oy + (y + 1) * s); ctx.lineTo(ox + (x + 0.8) * s, oy + (y + 1) * s); }
      });
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
      trace(ctx, v, ox, oy, s, r);
      ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.7; ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.5, s * 0.11); ctx.stroke();
      ctx.restore();
    });
  }
  function drawOutline(ctx, cells, shape, ox, oy, s) {
    parts(cells).forEach(function (part) {
      var v = inset(outline(part), 0.08);
      ctx.save(); trace(ctx, v, ox, oy, s, s * 0.2);
      ctx.globalAlpha = 0.12; ctx.fillStyle = colour(shape); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colour(shape); ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.stroke();
      ctx.restore();
    });
  }
  function ring(ctx, cx, cy, s, style) {
    ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.strokeStyle = style;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2); ctx.stroke();
  }
  // A white drop of water, k times the flood's size.
  function drop(ctx, cx, cy, s, k) {
    var r = s * 0.17 * k, top = cy - s * 0.25 * k, mid = cy + s * 0.07 * k;
    ctx.beginPath(); ctx.moveTo(cx, top);
    ctx.quadraticCurveTo(cx + r * 1.1, cy - s * 0.04 * k, cx + r, mid);
    ctx.arc(cx, mid, r, 0, Math.PI, false);
    ctx.quadraticCurveTo(cx - r * 1.1, cy - s * 0.04 * k, cx, top); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.1 * k; ctx.strokeStyle = 'rgba(12,14,34,0.5)'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  // A round bomb with a lit fuse, k times full size.
  function bomb(ctx, cx, cy, s, k) {
    var r = s * 0.19 * k, bx = cx - s * 0.03 * k, by = cy + s * 0.05 * k;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, s * 0.06 * k); ctx.strokeStyle = 'rgba(12,14,34,0.85)';
    ctx.beginPath(); ctx.moveTo(bx + r * 0.6, by - r * 0.6); ctx.quadraticCurveTo(bx + r * 1.05, by - r * 1.5, bx + r * 1.5, by - r * 1.25); ctx.stroke();
    ctx.fillStyle = '#1d2140'; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.05 * k); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(bx - r * 0.35, by - r * 0.35, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(bx + r * 1.5, by - r * 1.25, r * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  // The cracks in ageing glass: one at 30 s, more at 45 s.
  var CRACKS = [[[0.22, 0.2], [0.42, 0.44], [0.36, 0.6], [0.62, 0.8]],
                [[0.42, 0.44], [0.7, 0.32], [0.8, 0.18]], [[0.42, 0.44], [0.2, 0.72]], [[0.36, 0.6], [0.56, 0.57], [0.8, 0.68]]];
  function cracks(ctx, px, py, s, stage) {
    var lines = stage >= 2 ? CRACKS : CRACKS.slice(0, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    [['rgba(12,14,34,0.45)', 0.09], ['rgba(255,255,255,0.95)', 0.045]].forEach(function (st) {
      ctx.strokeStyle = st[0]; ctx.lineWidth = Math.max(1, s * st[1]);
      lines.forEach(function (l) {
        ctx.beginPath();
        l.forEach(function (p, i) { if (i) ctx.lineTo(px + p[0] * s, py + p[1] * s); else ctx.moveTo(px + p[0] * s, py + p[1] * s); });
        ctx.stroke();
      });
    });
  }
  // A special square: 2 or 3 (a number in a ring), 0 (glass, cracked at
  // stage 1 or 2), 'flood' (a drop in a ring), 'deluge' (two drops), 'bomb'
  // (a bomb) or 'rowbomb' (a bomb on a line across the square).
  function drawSpecial(ctx, x, y, kind, shape, ox, oy, s, crack) {
    var px = ox + x * s, py = oy + y * s, cx = px + s / 2, cy = py + s / 2;
    ctx.save();
    if (kind === 2 || kind === 3) {
      if (kind === 3) { ctx.globalAlpha = 0.35; ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      ring(ctx, cx, cy, s, kind === 3 ? GOLD : 'rgba(255,255,255,0.92)');
      ctx.font = '800 ' + Math.round(s * 0.52) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.11; ctx.strokeStyle = 'rgba(12,14,34,0.5)';
      ctx.strokeText(String(kind), cx, cy + s * 0.03);
      ctx.fillStyle = kind === 3 ? '#fff3c4' : '#ffffff'; ctx.fillText(String(kind), cx, cy + s * 0.03);
    } else if (kind === 0) {
      var m = s * 0.1;
      ctx.beginPath(); ctx.roundRect(px + m, py + m, s - 2 * m, s - 2 * m, s * 0.14);
      ctx.save(); ctx.clip();
      ctx.fillStyle = WELL.wash; ctx.fillRect(px, py, s, s);
      ctx.globalAlpha = 0.3; ctx.fillStyle = colour(shape); ctx.fillRect(px, py, s, s); ctx.globalAlpha = 1;
      var g = ctx.createLinearGradient(px, py, px + s, py + s);
      g.addColorStop(0.2, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(0.56, 'rgba(255,255,255,0.35)'); g.addColorStop(0.62, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(px, py, s, s);
      ctx.restore();
      ctx.beginPath(); ctx.roundRect(px + m, py + m, s - 2 * m, s - 2 * m, s * 0.14);
      ctx.lineWidth = Math.max(1.2, s * 0.06); ctx.strokeStyle = light ? colour(shape) : 'rgba(255,255,255,0.85)'; ctx.stroke();
      if (crack) cracks(ctx, px, py, s, crack);
    } else if (kind === 'flood') {
      ring(ctx, cx, cy, s, 'rgba(170,236,255,0.95)');
      drop(ctx, cx, cy, s, 1);
    } else if (kind === 'deluge') {
      ring(ctx, cx, cy, s, 'rgba(110,190,255,0.95)');
      drop(ctx, cx - s * 0.11, cy + s * 0.02, s, 0.72);
      drop(ctx, cx + s * 0.11, cy + s * 0.02, s, 0.72);
    } else if (kind === 'bomb') {
      ring(ctx, cx, cy, s, 'rgba(255,150,80,0.95)');
      bomb(ctx, cx, cy, s, 1);
    } else if (kind === 'rowbomb') {
      ring(ctx, cx, cy, s, 'rgba(255,90,130,0.95)');
      var a = px + s * 0.08, b = px + s * 0.92, hd = s * 0.1;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      [['rgba(12,14,34,0.5)', 0.13], ['#ffffff', 0.07]].forEach(function (st) {
        ctx.strokeStyle = st[0]; ctx.lineWidth = Math.max(1, s * st[1]);
        ctx.beginPath(); ctx.moveTo(a, cy); ctx.lineTo(b, cy);
        ctx.moveTo(a + hd, cy - hd); ctx.lineTo(a, cy); ctx.lineTo(a + hd, cy + hd);
        ctx.moveTo(b - hd, cy - hd); ctx.lineTo(b, cy); ctx.lineTo(b - hd, cy + hd); ctx.stroke();
      });
      bomb(ctx, cx, cy, s, 0.8);
    }
    ctx.restore();
  }
  function drawSpecials(ctx, cells, specials, shape, ox, oy, s) {
    (specials || []).forEach(function (sp) { var c = cells[sp.i]; drawSpecial(ctx, c[0], c[1], sp.kind, shape, ox, oy, s); });
  }

  // The layout and its caches ------------------------------------------------------

  var D = {
    well: null, next: null, ctx: null, nctx: null, W: 12, s: 20, qs: 20, queueRow: false, queueWidth: 0,
    panel: null, stack: null, stackKey: null, threes: [], glows: {},
    anims: [], particles: [], clear: null, tween: null, lastPiece: null, dip: 0,
    queueAnim: null, over: null, rimSweep: null, levelGlow: 0, dim: false, lessonRows: null, shake: 0
  };

  function ox() { return GAUGE * D.s; }
  function oy() { return TOP * D.s; }
  function rowY(y) { return y - HIDDEN; }   // grid row to well row

  function init(els) {
    D.well = els.well; D.next = els.next; D.wallCv = els.wall;
  }

  function setTheme(isLight) { light = !!isLight; WELL = light ? WELLS.light : WELLS.dark; D.glows = {}; rebuild(); }
  function setLow(v) { low = !!v; }
  function setDim(v) { D.dim = !!v; }

  // cell: the well's cell size. queue: { cell, row, width } for the queue.
  function layout(W, cell, queue) {
    D.W = W; D.s = cell; D.qs = queue.cell; D.queueRow = queue.row; D.queueWidth = queue.width;
    D.ctx = sizeCanvas(D.well, wellWidth(), wellHeight());
    if (queue.row) D.nctx = sizeCanvas(D.next, queue.width, Math.round(5 * D.qs + 16));
    else D.nctx = sizeCanvas(D.next, Math.round(5 * D.qs + D.qs * 0.7), queue.height);
    D.queueH = queue.row ? Math.round(5 * D.qs + 16) : queue.height;
    D.glows = {};
    rebuild();
  }
  function wellWidth() { return Math.round((GAUGE + D.W + 0.2) * D.s); }
  function wellHeight() { return Math.round((TOP + ROWS + 0.4) * D.s); }

  function rebuild() {
    if (!D.ctx) return;
    D.panel = offscreen(wellWidth(), wellHeight());
    var c = D.panel.ctx, s = D.s, x0 = ox(), y0 = oy(), w = D.W * s, h = ROWS * s;
    c.save();
    c.shadowColor = WELL.shadow; c.shadowBlur = s * 0.9; c.shadowOffsetY = s * 0.12;
    c.beginPath(); c.roundRect(x0, y0, w, h, s * 0.35);
    var g = c.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, WELL.top); g.addColorStop(1, WELL.bottom);
    c.fillStyle = g; c.fill(); c.restore();
    c.fillStyle = WELL.dot;
    var dot = Math.max(1, s * 0.045);
    for (var i = 1; i < D.W; i++) for (var j = 1; j < ROWS; j++) { c.beginPath(); c.arc(x0 + i * s, y0 + j * s, dot, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.roundRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1, s * 0.35);
    c.strokeStyle = WELL.rim; c.lineWidth = 1; c.stroke();
    D.stackKey = null;
  }

  // The stack, drawn into its own canvas from a grid.
  function stackImage(grid) {
    var off = offscreen(wellWidth(), wellHeight()), c = off.ctx, s = D.s, x0 = ox(), y0 = oy(), byId = {};
    var threes = [];
    for (var y = 0; y < grid.length; y++) for (var x = 0; x < grid[y].length; x++) {
      var cell = grid[y][x];
      if (!cell) continue;
      (byId[cell.id] = byId[cell.id] || { shape: cell.shape, cells: [] }).cells.push([x, rowY(y)]);
    }
    Object.keys(byId).forEach(function (id) { drawPiece(c, byId[id].cells, byId[id].shape, x0, y0, s); });
    for (y = 0; y < grid.length; y++) for (x = 0; x < grid[y].length; x++) {
      cell = grid[y][x];
      if (cell && cell.v !== 1) { drawSpecial(c, x, rowY(y), cell.v, cell.shape, x0, y0, s, cell.crack); if (cell.v === 3) threes.push([x, rowY(y)]); }
    }
    Rules.balances(grid).forEach(function (b) {
      var yy = rowY(b[0]), n = b[1], q = s * 0.3, gap = s * 0.1;
      if (yy < 0) return;
      for (var i = 0; i < Math.min(Math.abs(n), 4); i++) {
        var px = x0 - s * 0.2 - (i + 1) * q - i * gap, py = y0 + (yy + 0.5) * s - q / 2;
        c.beginPath(); c.roundRect(px, py, q, q, q * 0.25); c.lineWidth = Math.max(1.2, s * 0.06);
        if (n > 0) { c.strokeStyle = WELL.gauge; c.stroke(); }
        else { c.fillStyle = WELL.needFill; c.fill(); c.strokeStyle = WELL.need; c.stroke(); }
      }
    });
    off.threes = threes;
    return off;
  }
  function refreshStack(game) {
    var key = game.version + ':' + (light ? 1 : 0) + ':' + D.s + ':' + game.width;
    if (D.stack && D.stackKey === key) return;
    D.stack = stackImage(game.grid); D.stackKey = key; D.threes = D.stack.threes;
  }

  // A glow image for a piece in one orientation, drawn once and kept.
  function glow(shape, o) {
    var k = shape + ':' + o + ':' + D.s + ':' + (light ? 1 : 0);
    if (D.glows[k]) return D.glows[k];
    var cells = Pieces.shapeCells(shape, o), w = 0, h = 0;
    cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
    var pad = 1.2, off = offscreen((w + 2 * pad) * D.s, (h + 2 * pad) * D.s), c = off.ctx;
    c.shadowColor = colour(shape); c.shadowBlur = D.s * (light ? 0.5 : 0.9); c.fillStyle = colour(shape);
    parts(cells).forEach(function (part) {
      trace(c, inset(outline(part), 0.055), pad * D.s, pad * D.s, D.s, D.s * 0.2);
      c.fill();
    });
    off.pad = pad;
    return (D.glows[k] = off);
  }

  // Events from the rules start the animations ----------------------------------------

  function onEvents(list, game, now) {
    list.forEach(function (e) {
      if (e.type === 'spawn') { D.tween = null; D.lastPiece = e.piece ? { id: e.piece.id, o: e.piece.o, bx: e.piece.bx, bottom: e.piece.bottom } : null; }
      else if (e.type === 'rotate' || e.type === 'flip') startTurn(e, game, now);
      else if (e.type === 'hardDrop') {
        if (motion()) D.anims.push({ kind: 'trail', t0: now, dur: 120, from: e.from, to: e.to, cells: e.cells, shape: e.shape });
        if (!reduced) D.dip = now;
      } else if (e.type === 'lock') D.anims.push({ kind: 'flash', t0: now, dur: 90, cells: e.cells, shape: e.shape });
      else if (e.type === 'fill') {
        if (e.kind === 'flood') D.anims.push({ kind: 'flood', t0: now, dur: 260, at: e.at, filled: e.filled });
        else {
          // The deluge pours: each gap fills in turn, nearest first, within 0.2 s.
          var far = Math.max.apply(null, e.filled.map(function (c) { return c[2]; }).concat([1]));
          D.anims.push({ kind: 'water', t0: now, step: Math.min(30, 200 / far), dur: 300, filled: e.filled });
        }
      } else if (e.type === 'blast') {
        D.anims.push({ kind: 'blast', t0: now, dur: 320, at: e.at });
        if (!reduced) D.shake = now;
        if (motion()) e.cells.forEach(function (c) {
          for (var k = 0; k < 3; k++) burst(c.x + 0.5, rowY(c.y) + 0.5, c.v === 0 ? '#e6f4ff' : colour(c.shape), now, 4);
        });
      } else if (e.type === 'rowbomb') D.anims.push({ kind: 'beam', t0: now, dur: 300, x: e.at[0], y: e.y });
      else if (e.type === 'smash' || e.type === 'shatter') {
        var glass = e.type === 'smash' ? e.cells.map(function (c) { return [c[0], c[1]]; }) : [[e.x, e.y]];
        D.anims.push({ kind: 'smash', t0: now, dur: 220, cells: glass });
        if (motion()) glass.forEach(function (c) {
          for (var k = 0; k < 6; k++) burst(c[0] + 0.5, rowY(c[1]) + 0.5, k % 2 ? '#ffffff' : '#bfe6ff', now, 2);
        });
      }
      else if (e.type === 'clear') startClear(e, game, now);
      else if (e.type === 'level') D.levelGlow = now;
      else if (e.type === 'cycle') D.queueAnim = { t0: now, dur: motion() ? 150 : 0 };
      else if (e.type === 'over' && e.result === 'topout') D.over = { t0: now, grid: game.grid.map(function (r) { return r.slice(); }) };
    });
  }
  function startTurn(e, game, now) {
    var p = game.piece;
    if (!p || !motion()) { syncLast(game); return; }
    var fromCells = Pieces.cellsAt(p.shape, e.from.o, e.from.bx, p.bottom), toCells = Pieces.cellsAt(p.shape, e.to.o, e.to.bx, p.bottom);
    var a = fromCells[0], b = toCells[0], ax = a[0] + 0.5, ay = a[1] + 0.5, bx = b[0] + 0.5, by = b[1] + 0.5;
    if (e.type === 'flip') {
      D.tween = { kind: 'flip', t0: now, dur: 90, c: (ax + bx) / 2 };
    } else {
      // The point that a quarter turn carries the old squares round onto the new.
      var px, py, rx, ry;
      if (e.dir === 'cw') { rx = -ay; ry = ax; } else { rx = ay; ry = -ax; }
      var dx = bx - rx, dy = by - ry;
      if (e.dir === 'cw') { px = (dx - dy) / 2; py = (dx + dy) / 2; } else { px = (dx + dy) / 2; py = (dy - dx) / 2; }
      D.tween = { kind: 'turn', t0: now, dur: 70, px: px, py: py, dir: e.dir };
    }
    syncLast(game);
  }
  function syncLast(game) {
    var p = game.piece;
    if (!p) return;
    var last = D.lastPiece;
    D.lastPiece = { id: p.id, o: p.o, bx: p.bx, bottom: p.bottom, sx: last && last.id === p.id ? last.sx : 0, sy: last && last.id === p.id ? last.sy : 0, st: last ? last.st : 0 };
  }

  function startClear(e, game, now) {
    var before = stackImage(e.before);
    var rows = e.rows.map(function (r) { return rowY(r.y); });
    var drop = [];   // for each new row, how far it fell
    var removed = e.rows.map(function (r) { return r.y; });
    var y2 = Rules.HEIGHT - 1;
    for (var y = Rules.HEIGHT - 1; y >= 0; y--) {
      if (removed.indexOf(y) >= 0) continue;
      drop[y2] = y2 - y; y2--;
    }
    D.clear = { t0: now, before: before, rows: rows, info: e.rows, drop: drop, n: e.n, grid: e.before };
    if (motion()) {
      e.rows.forEach(function (r) {
        for (var x = 0; x < game.width; x++) {
          var cell = e.before[r.y][x];
          if (!cell) continue;
          for (var k = 0; k < (e.n >= 4 ? 3 : 2); k++) burst(x + 0.5, rowY(r.y) + 0.5, colour(cell.shape), now + 110, e.n);
        }
      });
    }
    if (e.n >= 5) D.rimSweep = { t0: now, dur: e.n >= 6 ? 3000 : 1500 };
    else if (e.n >= 3) D.levelGlow = now;
  }
  function burst(x, y, col, t0, n) {
    if (D.particles.length >= 200) return;
    var a = Math.random() * Math.PI * 2, v = 2.5 + Math.random() * (2 + n);
    D.particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, t0: t0, life: 420 + Math.random() * 160, col: col, size: 0.18 + Math.random() * 0.16 });
  }

  function busy(now) {
    return D.anims.length > 0 || D.particles.length > 0 || !!D.clear || !!D.tween || !!D.over ||
      (D.queueAnim && now - D.queueAnim.t0 < D.queueAnim.dur + 20) || (D.rimSweep && now - D.rimSweep.t0 < D.rimSweep.dur) ||
      now - D.levelGlow < 1000 || now - D.dip < 250 || now - D.shake < 260;
  }

  // A frame ----------------------------------------------------------------------

  function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  function frame(game, now) {
    var ctx = D.ctx, s = D.s, x0 = ox(), y0 = oy();
    if (!ctx) return;
    refreshStack(game);
    ctx.clearRect(0, 0, wellWidth(), wellHeight());
    var dip = motion() && now - D.dip < 250 ? Math.sin(Math.min(1, (now - D.dip) / 250) * Math.PI) * 3 * (1 - (now - D.dip) / 250) : 0;
    var shake = !reduced && now - D.shake < 260 ? Math.sin((now - D.shake) / 18) * 4 * (1 - (now - D.shake) / 260) : 0;
    ctx.save(); ctx.translate(shake, dip);
    blit(ctx, D.panel);
    rimEffects(ctx, now);

    // The stack, or the clear under way.
    var cl = D.clear, clearing = cl && now - cl.t0 < 300;
    if (clearing) drawClearing(ctx, cl, now);
    else if (cl && now - cl.t0 < 420 && motion()) drawDropping(ctx, cl, now);
    else { if (cl) D.clear = null; blit(ctx, D.stack); }
    if (!clearing && motion() && D.threes.length) shimmer(ctx, now);
    if (!clearing) glassFlash(ctx, game, now);

    // The falling piece, where it will land, and what its landing will do.
    var p = game.piece;
    if (p && !game.over && !clearing) {
      var pv = game.preview(), cells = Pieces.cellsAt(p.shape, p.o, p.bx, p.bottom).map(function (c) { return [c[0], rowY(c[1])]; });
      if (pv.bottom !== p.bottom) drawOutline(ctx, Pieces.cellsAt(p.shape, p.o, p.bx, pv.bottom).map(function (c) { return [c[0], rowY(c[1])]; }), p.shape, x0, y0, s);
      drawPreview(ctx, pv, now);
      drawFalling(ctx, game, p, cells, now);
    }
    effects(ctx, now);
    if (D.over) drawOver(ctx, now);
    if (D.dim) { ctx.fillStyle = WELL.dim; ctx.beginPath(); ctx.roundRect(x0, y0, D.W * s, ROWS * s, s * 0.35); ctx.fill(); }
    ctx.restore();
  }

  // A colour part way from one hex colour to another, for masking the well.
  function mix(a, b, t) {
    var A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), out = [];
    for (var k = 16; k >= 0; k -= 8) out.push(Math.round(((A >> k) & 255) * (1 - t) + ((B >> k) & 255) * t));
    return 'rgb(' + out.join(',') + ')';
  }

  // What a hard drop would do: rows that clear in gold, a row bomb's row in
  // pink, squares a bomb destroys in orange, gaps a flood fills in aqua, and
  // glass a hard drop smashes cracked.
  function drawPreview(ctx, pv, now) {
    if (!pv.rows.length && !pv.destroyed.length && !pv.filled.length && !pv.smashed.length) return;
    var s = D.s, x0 = ox(), y0 = oy(), pulse = 0.75 + 0.25 * Math.sin(now / 160);
    ctx.save();
    pv.rows.forEach(function (y) {
      var bombed = pv.rowBombs.indexOf(y) >= 0;
      ctx.globalAlpha = (bombed ? 0.24 : 0.15) * pulse; ctx.fillStyle = bombed ? '#ff5a82' : GOLD;
      ctx.fillRect(x0, y0 + rowY(y) * s, D.W * s, s);
    });
    ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.setLineDash([s * 0.16, s * 0.12]);
    pv.destroyed.forEach(function (c) {
      var px = x0 + c.x * s + s * 0.12, py = y0 + rowY(c.y) * s + s * 0.12;
      ctx.globalAlpha = 0.35 * pulse; ctx.fillStyle = '#ff7840';
      ctx.beginPath(); ctx.roundRect(px, py, s * 0.76, s * 0.76, s * 0.14); ctx.fill();
      ctx.globalAlpha = 0.9 * pulse; ctx.strokeStyle = '#ff9a50'; ctx.stroke();
    });
    pv.filled.forEach(function (c) {
      ctx.globalAlpha = 0.95 * pulse; ctx.strokeStyle = 'rgba(120,220,255,0.95)';
      ctx.beginPath(); ctx.roundRect(x0 + c[0] * s + s * 0.14, y0 + rowY(c[1]) * s + s * 0.14, s * 0.72, s * 0.72, s * 0.14); ctx.stroke();
    });
    ctx.setLineDash([]);
    pv.smashed.forEach(function (c) { ctx.globalAlpha = pulse; cracks(ctx, x0 + c[0] * s, y0 + rowY(c[1]) * s, s, 2); });
    ctx.restore();
  }

  // Glass in its last 3 s flashes before it breaks.
  function glassFlash(ctx, game, now) {
    var s = D.s, x0 = ox(), y0 = oy(), grid = game.grid;
    for (var y = 0; y < grid.length; y++) for (var x = 0; x < grid[y].length; x++) {
      var c = grid[y][x];
      if (!c || c.v !== 0 || game.glassAge(c) < Rules.FLASH_TICKS) continue;
      ctx.save(); ctx.globalAlpha = reduced ? 0.35 : 0.3 + 0.3 * Math.sin(now / 45); ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(x0 + x * s + s * 0.1, y0 + rowY(y) * s + s * 0.1, s * 0.8, s * 0.8, s * 0.14); ctx.fill();
      ctx.restore();
    }
  }

  function drawFalling(ctx, game, p, cells, now) {
    var s = D.s, x0 = ox(), y0 = oy(), last = D.lastPiece;
    // Slides: the drawn piece catches up with the rules over 40 ms.
    if (!last || last.id !== p.id) last = D.lastPiece = { id: p.id, o: p.o, bx: p.bx, bottom: p.bottom, sx: 0, sy: 0, st: now };
    if (motion()) {
      var dx = p.bx - last.bx, dy = p.bottom - last.bottom;
      if (last.o === p.o && (dx || dy)) {
        var k = Math.max(0, 1 - (now - last.st) / 40);
        last.sx = last.sx * k - dx; last.sy = dy > 1 ? 0 : last.sy * k - dy; last.st = now;
      }
    } else { last.sx = last.sy = 0; }
    last.bx = p.bx; last.bottom = p.bottom; last.o = p.o;
    var f = Math.max(0, 1 - (now - last.st) / 40), sx = last.sx * f, sy = last.sy * f;
    if (!f) last.sx = last.sy = 0;

    ctx.save();
    ctx.translate(sx * s, sy * s);
    var tw = D.tween;
    if (tw) {
      var t = (now - tw.t0) / tw.dur;
      if (t >= 1) D.tween = null;
      else if (tw.kind === 'turn') {
        var a = (tw.dir === 'cw' ? -1 : 1) * (Math.PI / 2) * (1 - ease(t)), px = x0 + tw.px * s, py = y0 + (tw.py - HIDDEN) * s;
        ctx.translate(px, py); ctx.rotate(a); ctx.translate(-px, -py);
      } else {
        var k2 = -1 + 2 * ease(t), cx = x0 + tw.c * s;
        ctx.translate(cx, 0); ctx.scale(Math.abs(k2) < 0.02 ? 0.02 : k2, 1); ctx.translate(-cx, 0);
      }
    }
    var gl = glow(p.shape, p.o), minX = Pieces.SHAPE[p.shape].orients[p.o].minX;
    var top = Math.min.apply(null, cells.map(function (c) { return c[1]; })), left = p.bx + minX;
    if (!low) blit(ctx, gl, x0 + (left - gl.pad) * s, y0 + (top - gl.pad) * s);
    drawPiece(ctx, cells, p.shape, x0, y0, s);
    drawSpecials(ctx, cells, p.specials, p.shape, x0, y0, s);
    ctx.restore();
  }

  function drawClearing(ctx, cl, now) {
    var s = D.s, x0 = ox(), y0 = oy(), t = now - cl.t0;
    // The rows flash, then burst; the rest of the stack stays put.
    var top = -HIDDEN;
    cl.rows.slice().sort(function (a, b) { return a - b; }).forEach(function (r) {
      strip(ctx, cl.before, top, r, 0); top = r + 1;
    });
    strip(ctx, cl.before, top, ROWS + 1, 0);
    if (t < 150) {
      cl.rows.forEach(function (r) {
        var sy = y0 + r * s;
        ctx.save(); ctx.beginPath(); ctx.rect(x0 - s, sy, (D.W + 1) * s, s); ctx.clip();
        blit(ctx, cl.before); ctx.restore();
        ctx.fillStyle = light ? 'rgba(255,255,255,' + (0.8 * (1 - t / 150)) + ')' : 'rgba(255,255,255,' + (0.75 * (1 - t / 150)) + ')';
        ctx.fillRect(x0, sy, D.W * s, s);
      });
    }
    // A gold line runs from each 2 or 3 to the gaps its row kept.
    if (t < 260) {
      ctx.save(); ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(2, s * 0.12); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9 * (1 - t / 260);
      cl.info.forEach(function (r) {
        var yy = y0 + (rowY(r.y) + 0.5) * s;
        r.values.forEach(function (v) {
          r.gaps.forEach(function (gx) {
            var from = x0 + (v[0] + 0.5) * s, to = x0 + (gx + 0.5) * s, reach = Math.min(1, t / 140);
            ctx.beginPath(); ctx.moveTo(from, yy); ctx.lineTo(from + (to - from) * reach, yy); ctx.stroke();
            if (reach >= 1) { ctx.beginPath(); ctx.arc(to, yy, s * 0.22, 0, Math.PI * 2); ctx.stroke(); }
          });
        });
      });
      ctx.restore();
    }
  }
  // Copy stack rows [from, to) of an image, shifted down by shift rows.
  function strip(ctx, img, from, to, shift) {
    var s = D.s, y0 = oy();
    if (to <= from) return;
    var sy = Math.max(0, y0 + from * s), ey = to > ROWS ? img.h : y0 + to * s;
    if (ey <= sy) return;
    ctx.drawImage(img.cv, 0, sy * DPR, img.cv.width, (ey - sy) * DPR, 0, sy + shift * s, img.w, ey - sy);
  }
  function drawDropping(ctx, cl, now) {
    // The rows above drop into place over 120 ms.
    var k = 1 - ease((now - cl.t0 - 300) / 120), img = D.stack, start = 0;
    for (var y = 0; y <= Rules.HEIGHT; y++) {
      var d = y < Rules.HEIGHT ? (cl.drop[y] || 0) : -1;
      var prev = y > 0 ? (cl.drop[y - 1] || 0) : d;
      if (y === Rules.HEIGHT || d !== prev) {
        strip(ctx, img, start === 0 ? -HIDDEN : rowY(start), y === Rules.HEIGHT ? ROWS + 1 : rowY(y), -prev * k);
        start = y;
      }
    }
  }

  function shimmer(ctx, now) {
    var s = D.s, x0 = ox(), y0 = oy(), t = (now % 2500) / 2500;
    if (t > 0.3) return;
    D.threes.forEach(function (c) {
      var px = x0 + c[0] * s, py = y0 + c[1] * s;
      ctx.save(); ctx.beginPath(); ctx.roundRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8, s * 0.18); ctx.clip();
      var u = t / 0.3, g = ctx.createLinearGradient(px, py, px + s, py + s);
      g.addColorStop(Math.max(0, u - 0.15), 'rgba(255,240,190,0)'); g.addColorStop(u, 'rgba(255,240,190,0.75)');
      g.addColorStop(Math.min(1, u + 0.15), 'rgba(255,240,190,0)');
      ctx.fillStyle = g; ctx.fillRect(px, py, s, s); ctx.restore();
    });
  }

  function effects(ctx, now) {
    var s = D.s, x0 = ox(), y0 = oy();
    D.anims = D.anims.filter(function (a) {
      var t = (now - a.t0) / a.dur;
      if (t >= 1) return false;
      if (t < 0) return true;
      if (a.kind === 'trail') {
        ctx.save();
        a.cells.forEach(function (c) {
          var bottom = y0 + (rowY(c[1]) + 1) * s, top = y0 + (rowY(c[1]) - (a.to - a.from)) * s;
          var g = ctx.createLinearGradient(0, top, 0, bottom);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, colour(a.shape));
          ctx.globalAlpha = 0.35 * (1 - t); ctx.fillStyle = g; ctx.fillRect(x0 + c[0] * s + s * 0.2, top, s * 0.6, bottom - top);
        });
        ctx.restore();
      } else if (a.kind === 'flash') {
        ctx.save(); ctx.globalAlpha = 0.6 * (1 - t); ctx.fillStyle = '#ffffff';
        a.cells.forEach(function (c) { ctx.beginPath(); ctx.roundRect(x0 + c[0] * s + s * 0.06, y0 + rowY(c[1]) * s + s * 0.06, s * 0.88, s * 0.88, s * 0.18); ctx.fill(); });
        ctx.restore();
      } else if (a.kind === 'flood') {
        // Water swells out of the flood square into each gap it fills.
        ctx.save();
        var fx = a.at[0] + 0.5, fy = rowY(a.at[1]) + 0.5, e = ease(Math.min(1, t * 1.7));
        a.filled.forEach(function (c) {
          var cx = fx + (c[0] + 0.5 - fx) * e, cy = fy + (rowY(c[1]) + 0.5 - fy) * e, r = s * (0.2 + 0.3 * e);
          ctx.globalAlpha = 0.75 * (1 - t); ctx.fillStyle = 'rgba(150,230,255,1)';
          ctx.beginPath(); ctx.roundRect(x0 + cx * s - r, y0 + cy * s - r, 2 * r, 2 * r, r * 0.4); ctx.fill();
        });
        ctx.restore();
      } else if (a.kind === 'water') {
        // Gaps the water has not reached yet stay empty; each lights aqua as it arrives.
        var ms = now - a.t0;
        ctx.save();
        a.filled.forEach(function (c) {
          var ry = rowY(c[1]), arrive = c[2] * a.step, px = x0 + c[0] * s, py = y0 + ry * s;
          if (ms < arrive) {
            if (ry < 0) return;
            ctx.globalAlpha = 1; ctx.fillStyle = mix(WELL.top, WELL.bottom, (ry + 0.5) / ROWS);
            ctx.fillRect(px + s * 0.05, py + s * 0.05, s * 0.9, s * 0.9);
          } else {
            ctx.globalAlpha = 0.85 * Math.max(0, 1 - (ms - arrive) / 160); ctx.fillStyle = 'rgba(120,205,255,1)';
            ctx.beginPath(); ctx.roundRect(px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.88, s * 0.18); ctx.fill();
          }
        });
        ctx.restore();
      } else if (a.kind === 'blast') {
        var bx = x0 + (a.at[0] + 0.5) * s, by = y0 + (rowY(a.at[1]) + 0.5) * s, rr = s * (0.4 + 1.9 * ease(t));
        var gr = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
        gr.addColorStop(0, 'rgba(255,255,255,' + (0.95 * (1 - t)) + ')');
        gr.addColorStop(0.35, 'rgba(255,190,90,' + (0.8 * (1 - t)) + ')');
        gr.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.save(); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else if (a.kind === 'beam') {
        // A beam runs out along the row bomb's row to both walls.
        var reach = Math.min(1, (now - a.t0) / 120), cyb = y0 + (rowY(a.y) + 0.5) * s;
        var lx = Math.max(x0, x0 + (a.x + 0.5 - reach * D.W) * s), rx = Math.min(x0 + D.W * s, x0 + (a.x + 0.5 + reach * D.W) * s);
        var gb = ctx.createLinearGradient(0, cyb - s * 0.6, 0, cyb + s * 0.6);
        gb.addColorStop(0, 'rgba(255,90,130,0)'); gb.addColorStop(0.38, 'rgba(255,90,130,0.75)'); gb.addColorStop(0.5, 'rgba(255,255,255,1)');
        gb.addColorStop(0.62, 'rgba(255,90,130,0.75)'); gb.addColorStop(1, 'rgba(255,90,130,0)');
        ctx.save(); ctx.globalAlpha = t < 0.5 ? 1 : 2 * (1 - t); ctx.fillStyle = gb; ctx.fillRect(lx, cyb - s * 0.6, rx - lx, s * 1.2); ctx.restore();
      } else if (a.kind === 'smash') {
        ctx.save(); ctx.globalAlpha = 0.85 * (1 - t); ctx.fillStyle = '#ffffff';
        a.cells.forEach(function (c) { ctx.beginPath(); ctx.roundRect(x0 + c[0] * s + s * 0.06, y0 + rowY(c[1]) * s + s * 0.06, s * 0.88, s * 0.88, s * 0.18); ctx.fill(); });
        ctx.restore();
      }
      return true;
    });
    var alive = [];
    for (var i = 0; i < D.particles.length; i++) {
      var p = D.particles[i], age = now - p.t0;
      if (age < 0) { alive.push(p); continue; }
      if (age > p.life) continue;
      var tt = age / 1000, px = p.x + p.vx * tt, py = p.y + p.vy * tt + 9 * tt * tt, a2 = 1 - age / p.life;
      ctx.globalAlpha = a2; ctx.fillStyle = p.col;
      ctx.fillRect(x0 + (px - p.size / 2) * s, y0 + (py - p.size / 2) * s, p.size * s, p.size * s);
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    D.particles = alive;
  }

  function rimEffects(ctx, now) {
    var s = D.s, x0 = ox(), y0 = oy(), w = D.W * s, h = ROWS * s;
    var sweep = D.rimSweep && now - D.rimSweep.t0 < D.rimSweep.dur ? (now - D.rimSweep.t0) / D.rimSweep.dur : -1;
    var glowT = (now - D.levelGlow) / 1000;
    if (sweep >= 0 && !reduced) {
      var hue = (now / 4) % 360;
      ctx.save(); ctx.lineWidth = s * 0.22; ctx.globalAlpha = 0.9 * Math.sin(Math.PI * sweep);
      var g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
      for (var k = 0; k <= 6; k++) g.addColorStop(k / 6, 'hsl(' + ((hue + k * 60) % 360) + ',95%,62%)');
      ctx.strokeStyle = g; ctx.beginPath(); ctx.roundRect(x0 - s * 0.1, y0 - s * 0.1, w + s * 0.2, h + s * 0.2, s * 0.42); ctx.stroke();
      ctx.restore();
    } else if (glowT >= 0 && glowT < 1 && !reduced) {
      ctx.save(); ctx.lineWidth = s * 0.16; ctx.globalAlpha = 0.8 * (1 - glowT); ctx.strokeStyle = GOLD;
      ctx.beginPath(); ctx.roundRect(x0 - s * 0.08, y0 - s * 0.08, w + s * 0.16, h + s * 0.16, s * 0.4); ctx.stroke();
      ctx.restore();
    }
    if (D.danger && !reduced) {
      var pulse = 0.35 + 0.35 * Math.sin(now / 1000 * Math.PI * 2);
      var g2 = ctx.createLinearGradient(0, y0, 0, y0 + s * 3);
      g2.addColorStop(0, 'rgba(255,77,109,' + (0.55 * pulse) + ')'); g2.addColorStop(1, 'rgba(255,77,109,0)');
      ctx.save(); ctx.beginPath(); ctx.roundRect(x0, y0, w, h, s * 0.35); ctx.clip();
      ctx.fillStyle = g2; ctx.fillRect(x0, y0, w, s * 3); ctx.restore();
      ctx.save(); ctx.strokeStyle = DANGER; ctx.globalAlpha = pulse; ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(x0 + s * 0.35, y0); ctx.lineTo(x0 + w - s * 0.35, y0); ctx.stroke(); ctx.restore();
    }
  }

  function drawOver(ctx, now) {
    // The stack drains to grey from the top down.
    var s = D.s, x0 = ox(), y0 = oy(), t = Math.min(1, (now - D.over.t0) / 1000);
    var upto = t * (ROWS + HIDDEN) - HIDDEN;
    ctx.save(); ctx.fillStyle = WELL.grey;
    for (var y = 0; y < D.over.grid.length; y++) {
      var r = rowY(y);
      if (r > upto) break;
      for (var x = 0; x < D.W; x++) if (D.over.grid[y][x]) { ctx.beginPath(); ctx.roundRect(x0 + x * s + s * 0.06, y0 + r * s + s * 0.06, s * 0.88, s * 0.88, s * 0.18); ctx.fill(); }
    }
    ctx.restore();
  }
  function clearOver() { D.over = null; }

  // The queue ------------------------------------------------------------------------

  function queue(game, now) {
    var ctx = D.nctx, q = D.qs, slot = 5 * q, m = q * 0.14;
    if (!ctx) return;
    var w = D.queueRow ? D.queueWidth : Math.round(slot + q * 0.7), h = D.queueH, label = D.queueRow ? 16 : oy();
    ctx.clearRect(0, 0, w, h);
    ctx.font = '700 ' + (D.queueRow ? 10 : Math.max(10, Math.round(q * 0.36))) + 'px ' + FONT;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.14em';
    ctx.fillStyle = light ? '#7c786d' : '#918c80'; ctx.textBaseline = 'middle';
    var left = D.queueRow ? GAUGE * D.s : 0;
    ctx.fillText('NEXT', D.queueRow ? left + 2 : q * 0.55, label / 2 + 1);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    var qa = D.queueAnim, k = qa && qa.dur ? 1 - ease((now - qa.t0) / qa.dur) : 0;
    for (var i = 0; i < 4; i++) {
      var x0 = D.queueRow ? left + i * slot : q * 0.35, y0 = D.queueRow ? label : label + i * slot;
      ctx.beginPath(); ctx.roundRect(x0 + m, y0 + m, slot - 2 * m, slot - 2 * m, q * 0.45);
      ctx.fillStyle = i === 0 ? WELL.slotFront : WELL.slot; ctx.fill();
      ctx.strokeStyle = i === 0 ? WELL.slotEdgeFront : WELL.slotEdge; ctx.lineWidth = i === 0 ? 1.5 : 1; ctx.stroke();
    }
    game.queue.forEach(function (p, i) {
      if (!p) return;
      var cells = Pieces.shapeCells(p.shape, p.o), pw = 0, ph = 0;
      cells.forEach(function (c) { pw = Math.max(pw, c[0] + 1); ph = Math.max(ph, c[1] + 1); });
      // While cycling, each piece slides up (or left) from the slot below it, and the old front fades in at the back.
      var shift = i === 3 ? 0 : k;
      var x0 = D.queueRow ? left + (i + shift) * slot : q * 0.35, y0 = D.queueRow ? label : label + (i + shift) * slot;
      var gx = x0 + (5 - pw) / 2 * q, gy = y0 + (5 - ph) / 2 * q;
      ctx.save();
      ctx.beginPath(); ctx.rect(D.queueRow ? left : 0, label, D.queueRow ? 4 * slot : w, 4 * slot); ctx.clip();
      drawPiece(ctx, cells, p.shape, gx, gy, q, i === 3 && k > 0 ? 1 - k : null);
      drawSpecials(ctx, cells, p.specials, p.shape, gx, gy, q);
      ctx.restore();
    });
    if (qa && now - qa.t0 >= qa.dur) D.queueAnim = null;
  }

  // The wallpaper and the title ----------------------------------------------------------

  function wallpaper(cv, pageLight) {
    var de = document.documentElement, w = de.clientWidth, h = de.clientHeight, ctx = sizeCanvas(cv, w, h);
    var b = Math.max(18, Math.round(Math.min(w, h) / 30)), tile = offscreen(10 * b, 6 * b), by = {};
    TILING.forEach(function (row, y) { for (var x = 0; x < row.length; x++) (by[row[x]] = by[row[x]] || []).push([x, y]); });
    Object.keys(by).forEach(function (ch) {
      var c = Pieces.COLOURS[ch + '5'][0], v = inset(outline(by[ch]), 0.09);
      trace(tile.ctx, v, 0, 0, b, b * 0.22);
      tile.ctx.globalAlpha = pageLight ? 0.2 : 0.075; tile.ctx.fillStyle = c; tile.ctx.fill();
      tile.ctx.globalAlpha = pageLight ? 0.35 : 0.14; tile.ctx.strokeStyle = c; tile.ctx.lineWidth = 1; tile.ctx.stroke();
    });
    var pattern = ctx.createPattern(tile.cv, 'repeat');
    if (pattern.setTransform && root.DOMMatrix) pattern.setTransform(new root.DOMMatrix([1 / DPR, 0, 0, 1 / DPR, 0, 0]));
    ctx.save(); ctx.translate(-b * 3, -b * 2); ctx.fillStyle = pattern; ctx.fillRect(0, 0, w + b * 6, h + b * 4); ctx.restore();
    var bg = pageLight ? '246,243,236' : '22,22,26', g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(' + bg + ',0.9)'); g.addColorStop(0.55, 'rgba(' + bg + ',0.55)'); g.addColorStop(1, 'rgba(' + bg + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  function logo(cv, t) {
    var word = 'PENTRYS', cols = -1;
    for (var i = 0; i < word.length; i++) cols += LETTERS[word[i]][0].length + 1;
    var ctx = sizeCanvas(cv, cols * t, 5 * t), x0 = 0;
    for (i = 0; i < word.length; i++) {
      var ch = word[i], rows = LETTERS[ch], base = colour(TITLE_SHAPE[ch]), rim = rimLight(TITLE_SHAPE[ch]);
      rows.forEach(function (row, y) {
        for (var x = 0; x < row.length; x++) {
          if (row[x] !== '#') continue;
          var px = (x0 + x) * t, py = y * t, g = ctx.createLinearGradient(0, py, 0, py + t);
          g.addColorStop(0, rim); g.addColorStop(0.5, base); g.addColorStop(1, base);
          ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(px + 0.6, py + 0.6, t - 1.2, t - 1.2, t * 0.28); ctx.fill();
        }
      });
      x0 += rows[0].length + 1;
    }
  }

  // A small picture of a piece, for the page's text: the tutorial and How to play.
  function icon(cv, shape, o, specials, cell) {
    var cells = Pieces.shapeCells(shape, o || 0), w = 0, h = 0;
    cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
    var ctx = sizeCanvas(cv, w * cell + 2, h * cell + 2);
    drawPiece(ctx, cells, shape, 1, 1, cell);
    drawSpecials(ctx, cells, (specials || []).map(function (sp) { return { i: sp[0], kind: sp[1] }; }), shape, 1, 1, cell);
  }

  function setDanger(game) {
    var top = Rules.HEIGHT;
    for (var y = 0; y < Rules.HEIGHT && top === Rules.HEIGHT; y++) for (var x = 0; x < game.width; x++) if (game.grid[y][x]) { top = y; break; }
    D.danger = !game.over && rowY(top) < 4;
  }

  function reset() {
    D.anims = []; D.particles = []; D.clear = null; D.tween = null; D.lastPiece = null; D.over = null;
    D.rimSweep = null; D.levelGlow = 0; D.queueAnim = null; D.stackKey = null; D.danger = false; D.shake = 0;
  }

  Pentrys.Draw = {
    TOP: TOP, GAUGE: GAUGE, init: init, layout: layout, setTheme: setTheme, setLow: setLow, setDim: setDim,
    frame: frame, queue: queue, onEvents: onEvents, busy: busy, wallpaper: wallpaper, logo: logo, icon: icon,
    reset: reset, clearOver: clearOver, setDanger: setDanger, colour: colour,
    wellSize: function () { return { w: wellWidth(), h: wellHeight() }; },
    queueBusy: function (now) { return !!D.queueAnim; },
    rowTop: function (gridRow) { return (TOP + rowY(gridRow)) * D.s; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
