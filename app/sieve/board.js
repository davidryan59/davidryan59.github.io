/* The board: a window on the endless grid of numbers, drawn on a canvas,
   and the input that moves it and picks numbers.

   Row r of the grid holds the numbers from r * width to r * width + width - 1.
   The view keeps its top edge as a whole row and a fraction of a row, apart.
   Rows run past 10^14, where one float would round the fraction away and the
   tiles would shake as they scroll. Columns stop at 10^9, so one float holds
   the left edge closely enough.

   A tile of 12 device pixels or more is drawn on its own, with a gap, rounded
   corners and its number. Smaller tiles go into an image, one pixel per
   tile, which the canvas scales up without smoothing. Below 12 device pixels
   the tile size snaps to a whole number of pixels, so every tile is the same
   size. */
(function (global) {
  'use strict';

  var Sieve = global.Sieve;
  var LIMIT = Sieve.LIMIT;
  var NONE = Sieve.CODES.NONE, ZERO = Sieve.CODES.ZERO, ONE = Sieve.CODES.ONE, GREY = Sieve.CODES.GREY;

  var PAD = 12;              // CSS px of board round the grid
  var MIN_SIZE = 1, MAX_SIZE = 240;
  var FIT_MAX = 72;          // the largest tile a fit picks
  var FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  var MIN_FONT = 7, MIN_SUB = 5.5;   // CSS px
  var LINE = 1.08, SUB_LINE = 1.35;  // line heights, as multiples of the font size

  function norm(row, f) { var k = Math.floor(f); return [row + k, f - k]; }
  function before(a, b) { return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]); }

  // Splits a number's places into lines of nearly equal length, from the
  // right, so a short line comes first.
  function split(places, lines) {
    var per = Math.ceil(places.length / lines), out = [], end = places.length;
    while (end > 0) {
      var start = Math.max(0, end - per);
      out.unshift(places.slice(start, end).join(''));
      end = start;
    }
    return out;
  }

  function Board(canvas, model, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = model;
    this.opts = opts || {};
    this.width = 10;
    this.base = 10;
    this.row = 0;
    this.fy = 0;
    this.x = 0;
    this.zoom = 40;          // the tile size asked for, in CSS px
    this.size = 40;          // the tile size drawn: zoom, snapped when small
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.hover = null;
    this.cursor = null;
    this.highlight = null;
    this.flash = null;
    this.focused = false;
    this.keyboard = false;
    this.lastPointer = 0;
    // The number a change of width keeps at the top left, until the view
    // moves. Without it, each change would move the view to the start of a
    // row, and stepping the width would drift down the grid.
    this.anchor = null;
    this.codes = new Int32Array(0);
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.img = null;
    this.pointers = new Map();
    this.pinch = null;
    this.turns = new Map();  // where each turned digit's centre sits, by font
    this.ctx.font = '100px ' + FONT;
    this.adv = this.ctx.measureText('0').width / 100 || 0.6;
    this.setTheme(false);
    this.listen();
  }

  Board.prototype.setTheme = function (dark) {
    this.dark = dark;
    this.theme = Sieve.theme(dark);
    this.paints = [];
    this.draw();
  };

  // The fill and text colours of a tile code.
  Board.prototype.paint = function (code) {
    var p = this.paints[code];
    if (p) return p;
    var t = this.theme, fill, text, bold = false, ring = t.ring;
    if (code === ZERO) { fill = t.zero; text = t.zeroText; }
    else if (code === ONE) { fill = t.one; text = t.oneText; }
    else if (code === GREY) { fill = t.grey; text = t.greyText; }
    else {
      var c = Sieve.slotColours((code - 4) >> 1, this.dark);
      if (code & 1) { fill = c.bright; text = c.brightText; bold = true; }
      else { fill = c.pale; text = c.paleText; }
      ring = Sieve.css(c.paleText);
    }
    p = {
      fill: Sieve.css(fill), text: Sieve.css(text), bold: bold, ring: ring,
      packed: ((255 << 24) | (fill[2] << 16) | (fill[1] << 8) | fill[0]) >>> 0
    };
    this.paints[code] = p;
    return p;
  };

  // Geometry --------------------------------------------------------------

  Board.prototype.resize = function () {
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    var dpr = Math.min(3, global.devicePixelRatio || 1);
    if (!w || !h || (w === this.cssW && h === this.cssH && dpr === this.dpr)) return;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.size = this.snap(this.zoom);
    this.clamp();
    this.moved();
  };

  Board.prototype.lastRow = function () {
    var n = LIMIT - 1;
    return (n - n % this.width) / this.width;
  };

  // Keeps the grid in view, with PAD pixels of board round it at the edges,
  // and centres a grid narrower than the board.
  Board.prototype.clamp = function () {
    var s = this.size, gw = this.width * s;
    if (gw + 2 * PAD <= this.cssW) this.x = -(this.cssW - gw) / 2 / s;
    else this.x = Math.min(Math.max(this.x, -PAD / s), this.width + (PAD - this.cssW) / s);
    var min = norm(0, -PAD / s), max = norm(this.lastRow() + 1, (PAD - this.cssH) / s);
    if (before(max, min)) max = min;
    var here = norm(this.row, this.fy);
    if (before(here, min)) here = min;
    else if (before(max, here)) here = max;
    this.row = here[0];
    this.fy = here[1];
  };

  Board.prototype.atTop = function () {
    return !before(norm(0, -PAD / this.size), [this.row, this.fy]);
  };

  Board.prototype.snap = function (z) {
    z = Math.min(MAX_SIZE, Math.max(MIN_SIZE, z));
    var d = z * this.dpr;
    return d < 12 ? Math.max(1, Math.round(d)) / this.dpr : z;
  };

  Board.prototype.numberAt = function (px, py) {
    var s = this.size, c = Math.floor(this.x + px / s), r = norm(this.row, this.fy + py / s)[0];
    if (c < 0 || c >= this.width || r < 0 || r > this.lastRow()) return null;
    var n = r * this.width + c;
    return n < LIMIT ? n : null;
  };

  // The first tile wholly in view. The address keeps it.
  Board.prototype.topLeft = function () {
    var c = Math.min(this.width - 1, Math.max(0, Math.ceil(this.x - 1e-6)));
    var r = this.fy > 1e-6 ? this.row + 1 : this.row;
    r = Math.min(this.lastRow(), Math.max(0, r));
    return Math.min(LIMIT - 1, r * this.width + c);
  };

  // The first and last numbers in view.
  Board.prototype.range = function () {
    var s = this.size;
    var r0 = Math.max(0, this.row), r1 = Math.min(this.lastRow(), this.row + Math.floor(this.fy + this.cssH / s));
    var c0 = Math.max(0, Math.floor(this.x)), c1 = Math.min(this.width - 1, Math.floor(this.x + this.cssW / s));
    return { first: r0 * this.width + c0, last: Math.min(LIMIT - 1, r1 * this.width + c1) };
  };

  // The tile's box in device pixels.
  Board.prototype.box = function (n) {
    var c = n % this.width, r = (n - c) / this.width, s = this.size * this.dpr;
    var x = (c - this.x) * s, y = ((r - this.row) - this.fy) * s;
    if (x > this.canvas.width || y > this.canvas.height || x + s < 0 || y + s < 0) return null;
    return { x: x, y: y, s: s };
  };

  // Moves --------------------------------------------------------------------

  Board.prototype.moved = function () {
    this.draw();
    if (this.opts.onView) this.opts.onView();
  };

  Board.prototype.scrollBy = function (dx, dy) {
    this.anchor = null;
    this.x += dx / this.size;
    this.fy += dy / this.size;
    this.clamp();
    this.moved();
  };

  // Zooms to tiles z pixels wide, holding the point (px, py) of the board still.
  Board.prototype.zoomTo = function (z, px, py) {
    if (px == null) { px = this.cssW / 2; py = this.cssH / 2; }
    this.anchor = null;
    this.zoom = Math.min(MAX_SIZE, Math.max(MIN_SIZE, z));
    var s0 = this.size, s1 = this.snap(this.zoom);
    this.x += px / s0 - px / s1;
    this.fy += py / s0 - py / s1;
    this.size = s1;
    this.clamp();
    this.moved();
  };

  Board.prototype.zoomBy = function (k, px, py) { this.zoomTo(this.zoom * k, px, py); };

  Board.prototype.showAtTopLeft = function (n) {
    var c = n % this.width, r = (n - c) / this.width, s = this.size;
    this.x = c === 0 ? -PAD / s : c;
    this.row = r;
    this.fy = r === 0 ? -PAD / s : 0;
    this.clamp();
    this.moved();
  };

  // Brings n into view, in the middle of the board or just inside its edge.
  Board.prototype.reveal = function (n, centre) {
    var c = n % this.width, r = (n - c) / this.width, s = this.size;
    var cols = this.cssW / s, rows = this.cssH / s;
    this.anchor = null;
    if (centre) {
      this.x = c + 0.5 - cols / 2;
      this.row = r;
      this.fy = 0.5 - rows / 2;
    } else {
      var mc = Math.min(1, cols / 4), mr = Math.min(1, rows / 4);
      if (c - this.x < mc) this.x = c - mc;
      else if (c + 1 - this.x > cols - mc) this.x = c + 1 - cols + mc;
      var d = (r - this.row) - this.fy;
      if (d < mr) { this.row = r; this.fy = -mr; }
      else if (d + 1 > rows - mr) { this.row = r; this.fy = 1 - rows + mr; }
    }
    this.clamp();
    this.moved();
  };

  Board.prototype.setWidth = function (width) {
    var n = this.anchor != null ? this.anchor : this.topLeft();
    this.width = width;
    this.showAtTopLeft(n);
    this.anchor = n;
  };

  Board.prototype.setBase = function (base) {
    this.base = base;
    this.draw();
  };

  // Zooms so that a whole row fits the board, up to FIT_MAX. With rows too,
  // it also fits that many rows, as the first view does with ten.
  Board.prototype.fit = function (rows) {
    var n = this.anchor != null ? this.anchor : this.topLeft(), z = Math.min(FIT_MAX, (this.cssW - 2 * PAD) / this.width);
    if (rows) z = Math.min(z, (this.cssH - 2 * PAD) / rows);
    this.zoom = Math.min(MAX_SIZE, Math.max(MIN_SIZE, z));
    this.size = this.snap(this.zoom);
    this.showAtTopLeft(n);
    this.anchor = n;
  };

  Board.prototype.goTo = function (n) {
    this.reveal(n, true);
    this.flash = { n: n, t0: global.performance.now() };
    this.draw();
  };

  Board.prototype.setHover = function (n) {
    if (n === this.hover) return;
    this.hover = n;
    this.draw();
    if (this.opts.onHover) this.opts.onHover(n);
  };

  Board.prototype.setCursor = function (n) {
    this.cursor = n;
    if (n != null) this.reveal(n, false);
    this.draw();
    if (this.opts.onCursor) this.opts.onCursor(n);
  };

  // Drawing ------------------------------------------------------------------

  Board.prototype.draw = function () {
    if (this.pending || !this.cssW) return;
    this.pending = true;
    var self = this;
    global.requestAnimationFrame(function () { self.pending = false; self.render(); });
  };

  Board.prototype.render = function () {
    var ctx = this.ctx, s = this.size, sd = s * this.dpr, width = this.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = Sieve.css(this.theme.board);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.win = null;
    var r0 = Math.max(0, this.row), r1 = Math.min(this.lastRow(), this.row + Math.floor(this.fy + this.cssH / s));
    var c0 = Math.max(0, Math.floor(this.x)), c1 = Math.min(width - 1, Math.floor(this.x + this.cssW / s));
    if (r1 < r0 || c1 < c0) return;
    var cols = c1 - c0 + 1, rows = r1 - r0 + 1, count = cols * rows;
    if (this.codes.length < count) this.codes = new Int32Array(Math.ceil(count * 1.25));
    this.model.fill(width, r0, r1, c0, c1, this.codes);
    this.win = {
      r0: r0, c0: c0, cols: cols, rows: rows, count: count, sd: sd,
      X0: (c0 - this.x) * sd, Y0: ((r0 - this.row) - this.fy) * sd
    };
    if (sd < 12) this.renderPixels();
    else this.renderTiles();
    this.renderRings();
  };

  Board.prototype.renderPixels = function () {
    var w = this.win, codes = this.codes, last = -1, packed = 0;
    if (!this.img || this.off.width !== w.cols || this.off.height !== w.rows) {
      this.off.width = w.cols;
      this.off.height = w.rows;
      this.img = this.offCtx.createImageData(w.cols, w.rows);
    }
    var px = new Uint32Array(this.img.data.buffer);
    for (var i = 0; i < w.count; i++) {
      var code = codes[i];
      if (code !== last) { last = code; packed = code === NONE ? 0 : this.paint(code).packed; }
      px[i] = packed;
    }
    this.offCtx.putImageData(this.img, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.off, Math.round(w.X0), Math.round(w.Y0), w.cols * w.sd, w.rows * w.sd);
  };

  // A tile's box, rounded to device pixels, with the gap on its right and
  // lower edges.
  Board.prototype.tileBox = function (i, g) {
    var w = this.win, cc = i % w.cols, rr = (i - cc) / w.cols;
    var xa = Math.round(w.X0 + cc * w.sd), xb = Math.round(w.X0 + (cc + 1) * w.sd);
    var ya = Math.round(w.Y0 + rr * w.sd), yb = Math.round(w.Y0 + (rr + 1) * w.sd);
    return [xa, ya, xb - xa - g, yb - ya - g];
  };

  Board.prototype.gap = function () {
    var s = this.size;
    return Math.round((s >= 28 ? 2 : s >= 9 ? 1 : 0) * this.dpr);
  };

  Board.prototype.radius = function () {
    var s = this.size;
    return s >= 20 && typeof this.ctx.roundRect === 'function' ? Math.min(8, s * 0.13) * this.dpr : 0;
  };

  Board.prototype.renderTiles = function () {
    var ctx = this.ctx, w = this.win, codes = this.codes, g = this.gap(), rad = this.radius(), self = this;
    var groups = new Map(), i, k, b;
    for (i = 0; i < w.count; i++) {
      var code = codes[i];
      if (code === NONE) continue;
      var list = groups.get(code);
      if (!list) groups.set(code, list = []);
      list.push(i);
    }
    // One path per colour, so the canvas changes colour a few times, not
    // once a tile.
    groups.forEach(function (list, code) {
      ctx.fillStyle = self.paint(code).fill;
      ctx.beginPath();
      for (k = 0; k < list.length; k++) {
        b = self.tileBox(list[k], g);
        if (rad) ctx.roundRect(b[0], b[1], b[2], b[3], rad);
        else ctx.rect(b[0], b[1], b[2], b[3]);
      }
      ctx.fill();
    });
    // 0 is black and 1 is white, so each gets an edge to show on any board.
    ctx.strokeStyle = this.theme.edge;
    ctx.lineWidth = this.dpr;
    [ZERO, ONE].forEach(function (code) {
      (groups.get(code) || []).forEach(function (i) {
        b = self.tileBox(i, g);
        ctx.beginPath();
        if (rad) ctx.roundRect(b[0] + 0.5 * self.dpr, b[1] + 0.5 * self.dpr, b[2] - self.dpr, b[3] - self.dpr, rad);
        else ctx.rect(b[0] + 0.5 * self.dpr, b[1] + 0.5 * self.dpr, b[2] - self.dpr, b[3] - self.dpr);
        ctx.stroke();
      });
    });
    this.renderNumbers(g);
  };

  // The largest font that fits a tile sd device pixels wide, with the number
  // on one to six lines. When the base is not 10, the decimal value goes under
  // it at about half the size, and drops out first when space runs short.
  Board.prototype.layout = function (places, decLen, sd) {
    var inner = sd * 0.84, dpr = this.dpr, best = null;
    for (var L = 1; L <= 6 && L <= places.length; L++) {
      var lines = split(places, L), chars = 0;
      for (var k = 0; k < lines.length; k++) chars = Math.max(chars, lines[k].length);
      var F = Math.min(sd * 0.42, inner / (chars * this.adv));
      var subF = decLen ? Math.min(F * 0.52, inner / (decLen * this.adv)) : 0;
      if (subF < MIN_SUB * dpr) subF = 0;
      var height = lines.length * F * LINE + subF * SUB_LINE;
      if (height > inner) {
        F *= inner / height;
        subF *= inner / height;
        if (subF < MIN_SUB * dpr) subF = 0;
      }
      // A further line has to earn its place with a clearly larger font.
      if (!best || F > best.F * 1.15) best = { L: L, F: F, subF: subF };
    }
    return best && best.F >= MIN_FONT * dpr ? best : null;
  };

  Board.prototype.renderNumbers = function (g) {
    var ctx = this.ctx, w = this.win, codes = this.codes;
    if (w.sd * 0.42 < MIN_FONT * this.dpr) return;
    var base = this.base, withDecimal = Sieve.showsDecimal(base), layouts = new Map(), font = '', fill = '';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < w.count; i++) {
      var code = codes[i];
      if (code === NONE) continue;
      var cc = i % w.cols, rr = (i - cc) / w.cols, n = (w.r0 + rr) * this.width + w.c0 + cc;
      var places = Sieve.places(n, base), dec = withDecimal ? String(n) : '';
      var key = places.length + ',' + places[0].length + ',' + dec.length;
      var lay = layouts.get(key);
      if (lay === undefined) layouts.set(key, lay = this.layout(places, dec.length, w.sd));
      if (!lay) continue;
      var p = this.paint(code), b = this.tileBox(i, g);
      var lines = split(places, lay.L);
      var height = lines.length * lay.F * LINE + lay.subF * SUB_LINE;
      var cx = b[0] + b[2] / 2, top = b[1] + (b[3] - height) / 2;
      var f = (p.bold ? '700 ' : '400 ') + lay.F.toFixed(1) + 'px ' + FONT;
      if (f !== font) ctx.font = font = f;
      if (p.text !== fill) ctx.fillStyle = fill = p.text;
      for (var k = 0; k < lines.length; k++) this.fillLine(lines[k], cx, top + lay.F * LINE * (k + 0.5), lay.F);
      if (lay.subF) {
        f = '400 ' + lay.subF.toFixed(1) + 'px ' + FONT;
        if (f !== font) ctx.font = font = f;
        ctx.globalAlpha = 0.75;
        ctx.fillText(dec, cx, top + lines.length * lay.F * LINE + lay.subF * SUB_LINE / 2);
        ctx.globalAlpha = 1;
      }
    }
  };

  // Writes one line of a number, centred on cx. Pitman's digits go in one
  // character at a time: each is its digit, 2 or 3, turned about the digit's
  // own centre, so it sits where the upright digit would. The monospace font
  // gives every character the same advance, adv times the font size.
  Board.prototype.fillLine = function (line, cx, y, size) {
    var ctx = this.ctx;
    if (!/[\u218A\u218B]/.test(line)) {
      ctx.fillText(line, cx, y);
      return;
    }
    var step = this.adv * size, x = cx - step * line.length / 2;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], digit = Sieve.TURNED[ch], xi = x + step * (i + 0.5);
      if (!digit) {
        ctx.fillText(ch, xi, y);
        continue;
      }
      var key = ctx.font + digit, c = this.turns.get(key);
      if (!c) {
        var m = ctx.measureText(digit);
        c = [(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
             (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2];
        this.turns.set(key, c);
      }
      ctx.save();
      ctx.translate(xi + c[0], y + c[1]);
      ctx.rotate(Math.PI);
      ctx.fillText(digit, -c[0], -c[1]);
      ctx.restore();
    }
  };

  // A ring round tile n. Round a tile too small to ring, it rings a box 8
  // pixels wide, centred on the tile.
  Board.prototype.ring = function (n, colour, lw, alpha) {
    var b = this.box(n);
    if (!b) return;
    var ctx = this.ctx, dpr = this.dpr, g = this.win && b.s >= 12 ? this.gap() : 0;
    var size = Math.max(b.s - g, 8 * dpr), x = Math.round(b.x) + (b.s - g - size) / 2, y = Math.round(b.y) + (b.s - g - size) / 2;
    var line = lw * dpr, rad = this.radius();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineWidth = line;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    if (rad) ctx.roundRect(x + line / 2, y + line / 2, size - line, size - line, Math.max(0, rad - line / 2));
    else ctx.rect(x + line / 2, y + line / 2, size - line, size - line);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  Board.prototype.renderRings = function () {
    var t = this.theme, w = this.win, s = this.size;
    // Every multiple of the prime under the pointer, or of its button.
    var p = this.highlight, entry = p != null && this.model.byNumber.get(p);
    if (entry && w && s >= 6) {
      var colour = this.paint(4 + 2 * entry.slot).ring, lw = Math.max(1, Math.min(2, s * 0.045));
      for (var i = 0; i < w.count; i++) {
        var cc = i % w.cols, rr = (i - cc) / w.cols, n = (w.r0 + rr) * this.width + w.c0 + cc;
        if (n > p && n < LIMIT && n % p === 0) this.ring(n, colour, lw);
      }
      this.ring(p, t.ring, lw + 1);
    }
    if (this.hover != null && this.hover !== p) this.ring(this.hover, t.ring, 2);
    if (this.cursor != null && this.focused && this.keyboard) this.ring(this.cursor, t.focus, 3);
    if (this.flash) {
      var age = global.performance.now() - this.flash.t0;
      if (age > 1800) this.flash = null;
      else {
        this.ring(this.flash.n, t.focus, 4, 0.55 + 0.45 * Math.cos(age / 300 * Math.PI));
        this.draw();
      }
    }
  };

  // Input ----------------------------------------------------------------------

  Board.prototype.pinchState = function () {
    var ps = [];
    this.pointers.forEach(function (q) { ps.push(q); });
    var a = ps[0], b = ps[1];
    return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  Board.prototype.listen = function () {
    var self = this, cv = this.canvas;
    function pos(e) {
      var r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var p = pos(e);
      self.keyboard = false;
      self.lastPointer = global.performance.now();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      self.pointers.set(e.pointerId, { x: p[0], y: p[1], x0: p[0], y0: p[1], moved: false, type: e.pointerType });
      if (self.pointers.size === 2) {
        self.pinch = self.pinchState();
        self.pointers.forEach(function (q) { q.moved = true; });
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), q = self.pointers.get(e.pointerId);
      if (!q) {
        if (e.pointerType === 'mouse') self.setHover(self.numberAt(p[0], p[1]));
        return;
      }
      var dx = p[0] - q.x, dy = p[1] - q.y;
      q.x = p[0];
      q.y = p[1];
      if (self.pinch && self.pointers.size >= 2) {
        var now = self.pinchState();
        self.zoomTo(self.zoom * now.d / self.pinch.d, now.x, now.y);
        self.scrollBy(self.pinch.x - now.x, self.pinch.y - now.y);
        self.pinch = now;
        return;
      }
      if (!q.moved && Math.hypot(p[0] - q.x0, p[1] - q.y0) > (q.type === 'mouse' ? 4 : 8)) {
        q.moved = true;
        dx = p[0] - q.x0;
        dy = p[1] - q.y0;
        cv.classList.add('dragging');
        self.setHover(null);
      }
      if (q.moved) self.scrollBy(-dx, -dy);
    });

    function end(e) {
      var q = self.pointers.get(e.pointerId);
      if (!q) return;
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) self.pinch = null;
      if (!self.pointers.size) cv.classList.remove('dragging');
      if (e.type === 'pointerup' && !q.moved && !self.pointers.size) {
        var n = self.numberAt(q.x, q.y);
        if (n != null && self.opts.onTap) self.opts.onTap(n, q.type);
      }
      if (e.pointerType === 'mouse' && e.type === 'pointerup') {
        var p = pos(e);
        self.setHover(self.numberAt(p[0], p[1]));
      }
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse' && !self.pointers.size) self.setHover(null);
    });

    cv.addEventListener('wheel', function (e) {
      var k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? self.cssH : 1;
      var dx = e.deltaX * k, dy = e.deltaY * k, p = pos(e);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        self.zoomBy(Math.exp(-Math.max(-40, Math.min(40, dy)) * 0.01), p[0], p[1]);
        return;
      }
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      // At the top of the grid, scrolling up scrolls the page instead.
      if (dy < 0 && Math.abs(dx) < Math.abs(dy) && self.atTop()) return;
      e.preventDefault();
      self.scrollBy(dx, dy);
    }, { passive: false });

    cv.addEventListener('focus', function () {
      self.focused = true;
      // Focus from the Tab key, not a click, starts the cursor at once.
      if (global.performance.now() - self.lastPointer > 300) {
        self.keyboard = true;
        if (self.cursor == null) self.setCursor(self.topLeft());
      }
      self.draw();
    });
    cv.addEventListener('blur', function () {
      self.focused = false;
      self.draw();
    });

    cv.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var width = self.width, rows = Math.max(1, Math.floor(self.cssH / self.size) - 1), step;
      switch (e.key) {
        case 'ArrowLeft': step = -1; break;
        case 'ArrowRight': step = 1; break;
        case 'ArrowUp': step = -width; break;
        case 'ArrowDown': step = width; break;
        case 'PageUp': step = -width * rows; break;
        case 'PageDown': step = width * rows; break;
        case 'Home': step = 'home'; break;
        case 'End': step = 'end'; break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (self.cursor != null && self.opts.onTap) self.opts.onTap(self.cursor, 'keyboard');
          return;
        case '+':
        case '=':
          e.preventDefault();
          self.zoomBy(1.25);
          return;
        case '-':
        case '_':
          e.preventDefault();
          self.zoomBy(0.8);
          return;
        case 'Escape':
          self.setCursor(null);
          return;
        default:
          return;
      }
      e.preventDefault();
      self.keyboard = true;
      var n = self.cursor;
      if (n == null) n = self.topLeft();
      else if (step === 'home') n -= n % width;
      else if (step === 'end') n = Math.min(LIMIT - 1, n - n % width + width - 1);
      else n = Math.min(LIMIT - 1, Math.max(0, n + step));
      self.setCursor(n);
    });
  };

  Sieve.Board = Board;
})(this);
