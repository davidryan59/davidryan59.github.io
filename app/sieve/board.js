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
   size.

   The board draws only when something changes, and runs frames only while
   something moves. A new prime springs out of its tile, and its multiples
   light up one after another, in the order the sieve reaches them, then
   settle to their pale colour. A visitor who asks the system for reduced
   motion sees every change at once. */
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

  // Motion, in milliseconds. A change of more tiles in view than MAX_ANIMS,
  // or any change while the tiles are too small to draw one by one, spreads
  // over the board as one wave instead of tile by tile.
  var MAX_ANIMS = 2500;
  var DUR = { pop: 320, strike: 250, drop: 170, shift: 160 };
  var INTRO = 230;           // each tile's part of the opening
  var FADE = 120;            // a jump of the view or the theme fades across
  var WIPE = 320;            // the wave that carries a large change
  var GLIDE = 22;            // how fast the pointer's ring catches up
  var FLING = 325;           // how fast a flung grid slows
  var EASE_ZOOM = 35;        // how fast the zoom buttons reach their size
  var GLOW = 128, CORE = 48; // the glow picture, and the tile inside it

  var motion = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function still() { return !!(motion && motion.matches); }
  function clock() { return global.performance.now(); }
  function clamp01(u) { return u < 0 ? 0 : u > 1 ? 1 : u; }
  function easeOut(u) { u = 1 - u; return 1 - u * u * u; }
  function easeInOut(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(2 - 2 * u, 3) / 2; }
  // Runs past 1 and settles back, as a thing thrown into place.
  function backOut(u) { u -= 1; return 1 + 2.7 * u * u * u + 1.7 * u * u; }
  function mix(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; }
  function rgb(c, alpha) {
    var s = Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]);
    return alpha == null ? 'rgb(' + s + ')' : 'rgba(' + s + ', ' + alpha + ')';
  }
  function isBright(code) { return code >= 5 && (code & 1) === 1; }

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

  // A ring that follows a tile, as the pointer's ring does. It glides to a
  // near tile, jumps to a far one, and fades in and out. Its offset from the
  // tile is in tiles, so it holds still on the grid while the grid scrolls.
  function Glide() {
    this.n = null;
    this.ox = 0;
    this.oy = 0;
    this.t0 = 0;
    this.a0 = 0;
    this.ta = 0;
    this.dir = -1;
  }

  Glide.prototype.alpha = function (t) {
    if (still()) return this.dir > 0 ? 1 : 0;
    return clamp01(this.a0 + this.dir * (t - this.ta) / (this.dir > 0 ? 45 : 90));
  };

  Glide.prototype.offset = function (t) {
    var e = still() ? 0 : Math.exp(-(t - this.t0) / GLIDE);
    return [this.ox * e, this.oy * e];
  };

  Glide.prototype.to = function (n, width, t) {
    var a = this.alpha(t), o = this.offset(t), dc = 0, dr = 0;
    if (n != null && this.n != null && a > 0) {
      dc = this.n % width - n % width + o[0];
      dr = (this.n - this.n % width) / width - (n - n % width) / width + o[1];
      if (Math.abs(dc) + Math.abs(dr) > 12) dc = dr = 0;
    }
    this.ox = dc;
    this.oy = dr;
    this.t0 = t;
    this.a0 = a;
    this.ta = t;
    this.dir = n != null ? 1 : -1;
    if (n != null) this.n = n;
  };

  Glide.prototype.settle = function () { this.ox = this.oy = 0; };

  Glide.prototype.moving = function (t) {
    var a = this.alpha(t), o = this.offset(t);
    return a > 0 && (a < 1 || Math.abs(o[0]) + Math.abs(o[1]) > 0.004);
  };

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
    this.vis = new Int32Array(0);   // each tile's code as drawn this frame
    this.off = document.createElement('canvas');
    this.offCtx = this.off.getContext('2d');
    this.img = null;
    this.pointers = new Map();
    this.pinch = null;
    this.turns = new Map();  // where each turned digit's centre sits, by font
    this.ctx.font = '100px ' + FONT;
    this.adv = this.ctx.measureText('0').width / 100 || 0.6;

    // Motion.
    this.anims = new Map();  // number: its tile's animation, while it lasts
    this.animEnd = 0;
    this.pending = false;
    this.busy = false;
    this.changes = null;     // the codes drawn before a change of the primes
    this.intro0 = null;      // when the opening started
    this.fade = null;        // the last frame, fading or wiped away
    this.shot = document.createElement('canvas');
    this.shotCtx = this.shot.getContext('2d');
    this.fling = null;
    this.zooming = null;
    this.press = null;
    this.hoverGlide = new Glide();
    this.cursorGlide = new Glide();
    this.spot = { p: null, target: null, slot: 0, a0: 0, ta: 0, dir: -1, t0: 0 };
    this.glows = new Map();
    this.vignette = null;
    this.layouts = new Map();
    this.font = '';
    this.ink = '';

    this.setTheme(false);
    this.listen();
  }

  Board.prototype.setTheme = function (dark) {
    if (dark !== this.dark) this.fadeOut();
    this.dark = dark;
    this.theme = Sieve.theme(dark);
    this.paints = [];
    this.glows = new Map();
    this.vignette = null;
    this.draw();
  };

  // The fill and text colours of a tile code, as CSS and as numbers.
  Board.prototype.paint = function (code) {
    var p = this.paints[code];
    if (p) return p;
    var t = this.theme, fill, text, bold = false, ring = t.ring, c = null, slot = -1;
    if (code === ZERO) { fill = t.zero; text = t.zeroText; }
    else if (code === ONE) { fill = t.one; text = t.oneText; }
    else if (code === GREY) { fill = t.grey; text = t.greyText; }
    else {
      slot = (code - 4) >> 1;
      c = Sieve.slotColours(slot, this.dark);
      if (code & 1) { fill = c.bright; text = c.brightText; bold = true; }
      else { fill = c.pale; text = c.paleText; }
      ring = Sieve.css(c.paleText);
    }
    p = {
      fill: Sieve.css(fill), text: Sieve.css(text), bold: bold, ring: ring, slot: slot,
      rgb: fill, textRgb: text,
      brightRgb: c ? c.bright : fill, brightTextRgb: c ? c.brightText : text,
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
    this.fade = null;
    this.vignette = null;
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

  // The number on tile i of this frame's window.
  Board.prototype.numberOf = function (i) {
    var w = this.win, cc = i % w.cols;
    return (w.r0 + (i - cc) / w.cols) * this.width + w.c0 + cc;
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

  // A move by the visitor: a drag, a scroll or a pinch. It ends any fade,
  // whose picture would no longer line up with the grid.
  Board.prototype.scrollBy = function (dx, dy) {
    this.fade = null;
    this.pan(dx, dy);
  };

  Board.prototype.pan = function (dx, dy) {
    this.anchor = null;
    this.x += dx / this.size;
    this.fy += dy / this.size;
    this.clamp();
    this.moved();
  };

  // Zooms to tiles z pixels wide, holding the point (px, py) of the board still.
  Board.prototype.zoomTo = function (z, px, py) {
    this.zooming = null;
    this.fade = null;
    this.scale(z, px, py);
  };

  Board.prototype.scale = function (z, px, py) {
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

  // Zooms by k over a few frames, about the middle of the board, as the zoom
  // buttons and keys do. A second press before the first ends adds to it.
  Board.prototype.zoomSmooth = function (k) {
    var goal = Math.min(MAX_SIZE, Math.max(MIN_SIZE, (this.zooming ? this.zooming.goal : this.zoom) * k));
    if (still()) { this.zoomTo(goal); return; }
    this.fade = null;
    this.zooming = { from: this.zoom, goal: goal, t0: clock() };
    this.draw();
  };

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
    this.fadeOut();
    this.width = width;
    this.hoverGlide.settle();
    this.cursorGlide.settle();
    this.showAtTopLeft(n);
    this.anchor = n;
  };

  Board.prototype.setBase = function (base) {
    this.fadeOut();
    this.base = base;
    this.draw();
  };

  // Zooms so that a whole row fits the board, up to FIT_MAX. With rows too,
  // it also fits that many rows, as the first view does with ten.
  Board.prototype.fit = function (rows) {
    var n = this.anchor != null ? this.anchor : this.topLeft(), z = Math.min(FIT_MAX, (this.cssW - 2 * PAD) / this.width);
    if (rows) z = Math.min(z, (this.cssH - 2 * PAD) / rows);
    this.fadeOut();
    this.zooming = null;
    this.zoom = Math.min(MAX_SIZE, Math.max(MIN_SIZE, z));
    this.size = this.snap(this.zoom);
    this.showAtTopLeft(n);
    this.anchor = n;
  };

  Board.prototype.goTo = function (n) {
    this.fadeOut();
    this.reveal(n, true);
    this.flash = { n: n, t0: clock() };
    this.draw();
  };

  Board.prototype.setHover = function (n) {
    if (n === this.hover) return;
    this.hover = n;
    this.hoverGlide.to(n, this.width, clock());
    this.draw();
    if (this.opts.onHover) this.opts.onHover(n);
  };

  Board.prototype.setCursor = function (n) {
    this.cursor = n;
    this.cursorGlide.to(n, this.width, clock());
    if (n != null) this.reveal(n, false);
    this.draw();
    if (this.opts.onCursor) this.opts.onCursor(n);
  };

  // Motion ---------------------------------------------------------------------

  // Called after each change of the primes, with what changed: { n, add }
  // for one number, or {} for several at once. The next frame compares the
  // tiles with the ones drawn now, and moves the ones that changed.
  Board.prototype.changed = function (info) {
    if (this.win && !still()) {
      var w = this.win;
      if (!this.changes) {
        this.changes = {
          codes: this.codes.slice(0, w.count), r0: w.r0, c0: w.c0, cols: w.cols, rows: w.rows, width: this.width
        };
      }
      this.changes.info = info || {};
    }
    this.draw();
  };

  // Drops every motion, as a new grid from the address does.
  Board.prototype.reset = function () {
    this.anims.clear();
    this.changes = null;
    this.intro0 = null;
    this.fade = null;
    this.fling = null;
    this.zooming = null;
    this.press = null;
    this.draw();
  };

  // The opening: the tiles come in from the top left corner, one diagonal
  // after another. Tiles too small to draw one by one fade in together.
  Board.prototype.intro = function () {
    if (still() || !this.cssW) return;
    if (this.size * this.dpr >= 12) this.intro0 = clock();
    else {
      this.sizeShot();
      this.shotCtx.fillStyle = Sieve.css(this.theme.board);
      this.shotCtx.fillRect(0, 0, this.shot.width, this.shot.height);
      this.fade = { t0: clock(), dur: 2 * FADE, wipe: null };
    }
    this.draw();
  };

  Board.prototype.sizeShot = function () {
    var W = this.canvas.width, H = this.canvas.height;
    if (this.shot.width !== W || this.shot.height !== H) {
      this.shot.width = W;
      this.shot.height = H;
    }
  };

  // Keeps a copy of the board as drawn last.
  Board.prototype.snapshot = function () {
    this.sizeShot();
    this.shotCtx.clearRect(0, 0, this.shot.width, this.shot.height);
    this.shotCtx.drawImage(this.canvas, 0, 0);
  };

  // Keeps the board as it is now, and fades it out over the next frames,
  // for a jump of the view or a new theme.
  Board.prototype.fadeOut = function () {
    if (still() || !this.win || !this.canvas.width) return;
    this.snapshot();
    this.fade = { t0: clock(), dur: FADE, wipe: null };
    this.draw();
  };

  Board.prototype.pressOn = function (n) {
    if (n == null || still()) return;
    this.press = { n: n, t0: clock(), up: 0 };
    this.draw();
  };

  Board.prototype.release = function () {
    if (this.press && !this.press.up) {
      this.press.up = clock();
      this.draw();
    }
  };

  // A pressed tile sinks a little, and rises again when let go.
  Board.prototype.pressScale = function (t) {
    var p = this.press, held = 1 - 0.07 * easeOut(clamp01(((p.up || t) - p.t0) / 55));
    if (!p.up) {
      if (t - p.t0 < 55) this.busy = true;
      return held;
    }
    var u = (t - p.up) / 85;
    if (u >= 1) { this.press = null; return 1; }
    this.busy = true;
    return held + (1 - held) * easeOut(u);
  };

  // A drag let go while moving carries on, slowing, as a flicked page does.
  Board.prototype.flingFrom = function (q) {
    var s = q.samples, t = clock();
    if (still() || s.length < 2) return;
    var last = s[s.length - 1];
    if (t - last[0] > 60) return;
    for (var k = 0; k < s.length - 2 && last[0] - s[k][0] > 100; k++);
    var first = s[k], dt = last[0] - first[0];
    if (dt < 8) return;
    var vx = (last[1] - first[1]) / dt, vy = (last[2] - first[2]) / dt, v = Math.hypot(vx, vy);
    if (v < 0.3) return;
    if (v > 6) { vx *= 6 / v; vy *= 6 / v; }
    this.fling = { vx: -vx, vy: -vy, t0: t, X: 0, Y: 0 };
    this.draw();
  };

  // Moves the view on by one frame of a fling or a smooth zoom. Each follows
  // the time since it began, not the frame count, so it runs at one speed
  // at any frame rate.
  Board.prototype.step = function (t) {
    var f = this.fling;
    if (f) {
      var e = Math.exp(-(t - f.t0) / FLING), X = f.vx * FLING * (1 - e), Y = f.vy * FLING * (1 - e);
      var x = this.x, row = this.row, fy = this.fy;
      this.pan(X - f.X, Y - f.Y);
      f.X = X;
      f.Y = Y;
      if (Math.hypot(f.vx, f.vy) * e < 0.02 || (x === this.x && row === this.row && fy === this.fy)) this.fling = null;
      else this.busy = true;
    }
    var z = this.zooming;
    if (z) {
      var ez = Math.exp(-(t - z.t0) / EASE_ZOOM);
      if (ez < 0.02) {
        this.zooming = null;
        this.scale(z.goal);
      } else {
        this.scale(z.goal * Math.pow(z.from / z.goal, ez));
        this.busy = true;
      }
    }
    if (this.anims.size && t > this.animEnd) this.anims.clear();
  };

  // After a change of the primes: compares the codes drawn before it with
  // the codes now, and starts the tiles that changed.
  Board.prototype.animate = function (t) {
    var b = this.changes;
    this.changes = null;
    if (!b || b.width !== this.width || still()) return;
    var w = this.win, codes = this.codes, changed = [];
    for (var i = 0; i < w.count; i++) {
      var cc = i % w.cols, dr = w.r0 + (i - cc) / w.cols - b.r0, dc = w.c0 + cc - b.c0;
      if (dr < 0 || dr >= b.rows || dc < 0 || dc >= b.cols) continue;
      var old = b.codes[dr * b.cols + dc];
      if (old !== codes[i] && old !== NONE && codes[i] !== NONE) changed.push(i, old);
    }
    if (!changed.length) return;
    if (w.sd >= 12 && changed.length / 2 <= MAX_ANIMS) this.cascade(changed, b.info, t);
    else this.sweep(b.info, t);
  };

  // Each changed tile waits its turn, in the order of its number, so a new
  // prime reaches its multiples in the order the sieve would. A new prime
  // runs its multiples out over 0.35 s at most, a removal over 0.21 s, and
  // several changes at once over 0.3 s.
  Board.prototype.cascade = function (changed, info, t) {
    var codes = this.codes, p = info.n, add = info.add, others = changed.length / 2, k;
    for (k = 0; k < changed.length; k += 2) if (this.numberOf(changed[k]) === p) others--;
    var budget = add === true ? 350 : add === false ? 210 : 300;
    var most = add === true ? 20 : add === false ? 12 : 15;
    var step = others ? Math.min(most, budget / others) : 0, lead = add === true ? 55 : 0, rank = 0;
    if (!this.anims.size) this.animEnd = 0;
    for (k = 0; k < changed.length; k += 2) {
      var i = changed[k], old = changed[k + 1], code = codes[i], n = this.numberOf(i);
      var kind = isBright(code) ? 'pop' : isBright(old) ? 'drop' : old === GREY && code >= 4 ? 'strike' : 'shift';
      var a = { kind: kind, start: t + (n === p ? 0 : lead + step * rank++), dur: DUR[kind], from: null, fromCode: null };
      this.startFrom(a, n, old, t);
      this.anims.set(n, a);
      this.animEnd = Math.max(this.animEnd, a.start + a.dur);
    }
  };

  // A tile starts from the colours it shows now, even part way through a
  // move of its own.
  Board.prototype.startFrom = function (a, n, old, t) {
    var prev = this.anims.get(n);
    if (prev) {
      var u = (t - prev.start) / prev.dur;
      if (u <= 0) {
        a.from = prev.from;
        a.fromCode = prev.fromCode;
        return;
      }
      if (u < 1) {
        var s = this.animState(prev, old, u);
        a.from = { rgb: s.rgb, text: s.text, bold: s.bold };
        return;
      }
    }
    var p = this.paint(old);
    a.from = { rgb: p.rgb, text: p.textRgb, bold: p.bold };
    a.fromCode = old;
  };

  // A large change spreads over the board as a wave from the number that
  // made it, or from the middle.
  Board.prototype.sweep = function (info, t) {
    var W = this.canvas.width, H = this.canvas.height, b = info.n != null ? this.box(info.n) : null;
    var x = b ? b.x + b.s / 2 : W / 2, y = b ? b.y + b.s / 2 : H / 2;
    var entry = info.add ? this.model.byNumber.get(info.n) : null;
    this.snapshot();
    this.fade = {
      t0: t, dur: WIPE, wipe: {
        x: x, y: y, colour: entry ? this.paint(5 + 2 * entry.slot).fill : this.theme.ring,
        reach: Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y))
      }
    };
  };

  // How a moving tile looks at u, from 0 to 1 through its move.
  //   pop: a new prime springs past its size and back, and sends out a ring.
  //   strike: a multiple flashes its prime's bright colour, sinks a little,
  //     and settles to the pale colour.
  //   drop: a removed prime sinks and greys.
  //   shift: any other change of colour.
  Board.prototype.animState = function (a, code, u) {
    var to = this.paint(code), f = a.from, k;
    var st = {
      rgb: null, text: null, bold: u < 0.5 ? f.bold : to.bold, scale: 1, alpha: 1,
      ring: 0, grow: 0, ringRgb: null, glow: 0, sheen: false,
      edge: code === ZERO || code === ONE, slot: to.slot
    };
    if (a.kind === 'pop') {
      k = easeOut(clamp01(u / 0.3));
      st.rgb = mix(f.rgb, to.rgb, k);
      st.text = mix(f.text, to.textRgb, k);
      st.bold = true;
      st.scale = 1 + 0.5 * Math.exp(-5 * u) * Math.sin(Math.PI * 2.2 * u);
      st.ring = 0.9 * (1 - u) * (1 - u);
      st.grow = 0.1 + 1.3 * easeOut(u);
      st.ringRgb = to.rgb;
      st.glow = k;
      st.sheen = k > 0.5;
    } else if (a.kind === 'strike') {
      if (u < 0.2) {
        k = easeOut(u / 0.2);
        st.rgb = mix(f.rgb, to.brightRgb, k);
        st.text = mix(f.text, to.brightTextRgb, k);
      } else {
        k = easeOut((u - 0.2) / 0.8);
        st.rgb = mix(to.brightRgb, to.rgb, k);
        st.text = mix(to.brightTextRgb, to.textRgb, k);
      }
      st.scale = 1 - 0.12 * Math.sin(Math.PI * clamp01(u / 0.5));
      st.ring = 0.55 * (1 - u) * (1 - u);
      st.grow = 0.35 * easeOut(u);
      st.ringRgb = to.brightRgb;
    } else {
      k = easeOut(u);
      st.rgb = mix(f.rgb, to.rgb, k);
      st.text = mix(f.text, to.textRgb, k);
      st.scale = 1 - (a.kind === 'drop' ? 0.16 : 0.07) * Math.sin(Math.PI * u);
    }
    return st;
  };

  // A tile at rest, as drawn one by one.
  Board.prototype.plain = function (code) {
    var p = this.paint(code), bright = isBright(code);
    return {
      rgb: p.rgb, text: p.textRgb, bold: p.bold, scale: 1, alpha: 1, ring: 0, grow: 0, ringRgb: null,
      glow: bright ? 1 : 0, sheen: bright, edge: code === ZERO || code === ONE, slot: p.slot
    };
  };

  // Drawing ------------------------------------------------------------------

  Board.prototype.draw = function () {
    if (this.pending || !this.cssW) return;
    this.pending = true;
    var self = this;
    global.requestAnimationFrame(function () { self.pending = false; self.render(); });
  };

  Board.prototype.render = function () {
    var ctx = this.ctx, t = clock(), width = this.width;
    this.busy = false;
    this.step(t);
    var s = this.size, sd = s * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.win = null;
    var r0 = Math.max(0, this.row), r1 = Math.min(this.lastRow(), this.row + Math.floor(this.fy + this.cssH / s));
    var c0 = Math.max(0, Math.floor(this.x)), c1 = Math.min(width - 1, Math.floor(this.x + this.cssW / s));
    if (r1 < r0 || c1 < c0) {
      this.renderBoard();
      return;
    }
    var cols = c1 - c0 + 1, rows = r1 - r0 + 1, count = cols * rows;
    if (this.codes.length < count) this.codes = new Int32Array(Math.ceil(count * 1.25));
    this.model.fill(width, r0, r1, c0, c1, this.codes);
    this.win = {
      r0: r0, c0: c0, cols: cols, rows: rows, count: count, sd: sd,
      X0: (c0 - this.x) * sd, Y0: ((r0 - this.row) - this.fy) * sd
    };
    // Before the board is painted, so that a wave can copy the last frame.
    this.animate(t);
    this.renderBoard();
    if (sd < 12) this.renderPixels();
    else this.renderTiles(t);
    this.renderFade(t);
    this.renderOverlays(t);
    if (this.busy) this.draw();
  };

  // The board under the grid: a little lighter in the middle, with dots
  // round the grid at the corners its squares would have if it ran on, so
  // the grid reads as laid on squared paper.
  Board.prototype.renderBoard = function () {
    var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, t = this.theme;
    if (!this.vignette) {
      var g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, Sieve.css(t.board));
      g.addColorStop(1, Sieve.css(t.boardEdge));
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, W, H);
    if (this.win) this.renderDots();
  };

  Board.prototype.renderDots = function () {
    var s = this.size, dpr = this.dpr, sd = s * dpr, k = Math.max(1, Math.ceil(16 * dpr / sd));
    var g = sd >= 12 ? this.gap() : 0, d = Math.max(1, Math.round(1.25 * dpr)), ctx = this.ctx;
    var width = this.width, last = this.lastRow() + 1, skip = Math.ceil((width + 1) / k) * k - k;
    var cA = Math.ceil(this.x / k) * k, cB = Math.floor((this.x + this.cssW / s) / k) * k;
    var fA = Math.ceil(this.fy), fB = Math.floor(this.fy + this.cssH / s), any = false;
    ctx.beginPath();
    for (var f = fA; f <= fB; f++) {
      var r = this.row + f;
      if (((r % k) + k) % k) continue;
      var y = Math.round((f - this.fy) * sd - g / 2 - d / 2), inRows = r >= 0 && r <= last;
      for (var c = cA; c <= cB; c += k) {
        // The grid itself has no dots.
        if (inRows && c >= 0 && c <= width) { c = Math.max(c, skip); continue; }
        ctx.rect(Math.round((c - this.x) * sd - g / 2 - d / 2), y, d, d);
        any = true;
      }
    }
    if (!any) return;
    ctx.fillStyle = this.theme.dot;
    ctx.fill();
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

  Board.prototype.shape = function (b, rad) {
    if (rad) this.ctx.roundRect(b[0], b[1], b[2], b[3], rad);
    else this.ctx.rect(b[0], b[1], b[2], b[3]);
  };

  // Tiles at rest go in one path per colour, so the canvas changes colour a
  // few times, not once a tile. Moving tiles are drawn one by one, after
  // the rest, so a tile that springs up lies over its neighbours.
  Board.prototype.renderTiles = function (t) {
    var ctx = this.ctx, w = this.win, codes = this.codes, g = this.gap(), rad = this.radius(), self = this;
    var anims = this.anims.size ? this.anims : null, intro = this.intro0, press = this.press;
    var moving = anims || intro != null || press;
    var pressK = press ? this.pressScale(t) : 1;
    var istep = intro != null ? Math.min(12, 260 / (w.rows + w.cols)) : 0, opening = false;
    var numbers = w.sd * 0.42 >= MIN_FONT * this.dpr;
    if (this.vis.length < this.codes.length) this.vis = new Int32Array(this.codes.length);
    var vis = this.vis, groups = new Map(), special = [], chosen = [], i, code, list;
    this.layouts = new Map();
    this.withDecimal = Sieve.showsDecimal(this.base);
    this.sheenFill = null;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (i = 0; i < w.count; i++) {
      code = codes[i];
      vis[i] = code;
      if (code === NONE) continue;
      if (moving) {
        var n = this.numberOf(i), st = null;
        if (intro != null) {
          var cc = i % w.cols, u = (t - intro - (cc + (i - cc) / w.cols) * istep) / INTRO;
          if (u < 1) {
            opening = true;
            if (u <= 0) { vis[i] = -1; continue; }
            st = this.plain(code);
            st.alpha = easeOut(u);
            st.scale = 0.55 + 0.45 * backOut(u);
          }
        }
        var a = !st && anims ? anims.get(n) : null;
        if (a) {
          var ua = (t - a.start) / a.dur;
          if (ua >= 1) anims.delete(n);
          else if (ua > 0) st = this.animState(a, code, ua);
          else if (a.fromCode != null) vis[i] = a.fromCode;
          else st = { rgb: a.from.rgb, text: a.from.text, bold: a.from.bold, scale: 1, alpha: 1, ring: 0, glow: 0, sheen: false, edge: false };
        }
        if (press && press.n === n && pressK !== 1) {
          st = st || this.plain(vis[i]);
          st.scale *= pressK;
        }
        if (st) {
          vis[i] = -1;
          special.push(i, n, st);
          continue;
        }
        code = vis[i];
      }
      if (isBright(code)) chosen.push(i);
      list = groups.get(code);
      if (!list) groups.set(code, list = []);
      list.push(i);
    }
    if (intro != null && !opening) this.intro0 = null;
    if (opening || (anims && anims.size)) this.busy = true;

    var bright = [];
    groups.forEach(function (list, code) {
      if (isBright(code)) bright.push(code);
      else self.fillGroup(code, list, g, rad);
    });
    this.renderGlow(chosen, g);
    bright.forEach(function (code) { self.fillGroup(code, groups.get(code), g, rad); });
    this.renderSheen(chosen, g, rad);
    // 0 is black and 1 is white, so each gets an edge to show on any board.
    ctx.strokeStyle = this.theme.edge;
    ctx.lineWidth = this.dpr;
    [ZERO, ONE].forEach(function (code) {
      (groups.get(code) || []).forEach(function (i) { self.edge(self.tileBox(i, g), rad); });
    });
    if (numbers) this.renderNumbers(g, vis);
    for (var k = 0; k < special.length; k += 3) this.drawSpecial(special[k], special[k + 1], special[k + 2], g, rad, numbers);
  };

  Board.prototype.fillGroup = function (code, list, g, rad) {
    var ctx = this.ctx;
    ctx.fillStyle = this.paint(code).fill;
    ctx.beginPath();
    for (var k = 0; k < list.length; k++) this.shape(this.tileBox(list[k], g), rad);
    ctx.fill();
  };

  Board.prototype.edge = function (b, rad) {
    var ctx = this.ctx, h = 0.5 * this.dpr;
    ctx.beginPath();
    this.shape([b[0] + h, b[1] + h, b[2] - this.dpr, b[3] - this.dpr], rad);
    ctx.stroke();
  };

  // A chosen tile glows with its own colour: a soft halo in dark mode, a
  // coloured shadow in light. The glow is one blurred picture for each
  // colour, drawn at the tile's size.
  Board.prototype.glowOf = function (slot) {
    var img = this.glows.get(slot);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = img.height = GLOW;
    var c = img.getContext('2d'), m = GLOW / 2 - CORE / 2;
    c.shadowColor = Sieve.css(this.paint(5 + 2 * slot).rgb);
    c.shadowBlur = CORE * this.theme.glowBlur;
    // Only the shadow lands on the picture: the shape itself is off it.
    c.shadowOffsetX = GLOW;
    c.fillStyle = '#000';
    c.beginPath();
    if (typeof c.roundRect === 'function') c.roundRect(m - GLOW, m, CORE, CORE, 8);
    else c.rect(m - GLOW, m, CORE, CORE);
    c.fill();
    this.glows.set(slot, img);
    return img;
  };

  Board.prototype.glow = function (b, slot, alpha) {
    var ctx = this.ctx, S = GLOW * b[2] / CORE;
    var cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2 + b[3] * this.theme.glowDrop;
    ctx.globalAlpha = alpha * this.theme.glow;
    if (this.dark) ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.glowOf(slot), cx - S / 2, cy - S / 2, S, S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  };

  Board.prototype.renderGlow = function (list, g) {
    if (!list.length || this.win.sd < 14 || list.length > 600) return;
    for (var k = 0; k < list.length; k++) {
      var i = list[k];
      this.glow(this.tileBox(i, g), (this.vis[i] - 5) >> 1, 1);
    }
  };

  // A chosen tile is lit from above: lighter at the top, darker at the foot.
  // One gradient serves every tile, moved down to each in turn.
  Board.prototype.sheen = function (g) {
    if (this.sheenFill) return this.sheenFill;
    var t = this.theme, h = Math.round(this.win.sd) - g, gr = this.ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255, 255, 255, ' + t.sheen + ')');
    gr.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gr.addColorStop(1, 'rgba(0, 0, 0, ' + t.shade + ')');
    return (this.sheenFill = gr);
  };

  Board.prototype.renderSheen = function (list, g, rad) {
    if (!list.length || this.win.sd < 14 || list.length > 1500) return;
    var ctx = this.ctx;
    ctx.fillStyle = this.sheen(g);
    for (var k = 0; k < list.length; k++) {
      var b = this.tileBox(list[k], g);
      ctx.setTransform(1, 0, 0, 1, 0, b[1]);
      ctx.beginPath();
      this.shape([b[0], 0, b[2], b[3]], rad);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // Draws a moving tile: in its own colours, at its own scale, with the
  // ring that spreads from it.
  Board.prototype.drawSpecial = function (i, n, st, g, rad, numbers) {
    var ctx = this.ctx, b = this.tileBox(i, g), cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2, s = st.scale;
    if (st.ring > 0.01) {
      var size = b[2] * (1 + st.grow);
      this.ringAt(cx - size / 2, cy - size / 2, size, rgb(st.ringRgb), 2 * this.dpr * (1 - st.grow / 3), st.ring, rad * (1 + st.grow));
    }
    if (s !== 1) ctx.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s));
    if (st.glow > 0 && this.win.sd >= 14) this.glow(b, st.slot, st.glow * st.alpha);
    ctx.globalAlpha = st.alpha;
    ctx.fillStyle = rgb(st.rgb);
    ctx.beginPath();
    this.shape(b, rad);
    ctx.fill();
    if (st.sheen && this.win.sd >= 14) {
      ctx.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s) + s * b[1]);
      ctx.fillStyle = this.sheen(g);
      ctx.beginPath();
      this.shape([b[0], 0, b[2], b[3]], rad);
      ctx.fill();
      ctx.setTransform(s, 0, 0, s, cx * (1 - s), cy * (1 - s));
    }
    if (st.edge) {
      ctx.strokeStyle = this.theme.edge;
      ctx.lineWidth = this.dpr;
      this.edge(b, rad);
    }
    this.ink = '';
    if (numbers) this.writeNumber(n, b, rgb(st.text), st.bold, st.alpha);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
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

  Board.prototype.renderNumbers = function (g, vis) {
    var w = this.win;
    this.font = '';
    this.ink = '';
    for (var i = 0; i < w.count; i++) {
      var code = vis[i];
      if (code <= 0) continue;
      var p = this.paint(code);
      this.writeNumber(this.numberOf(i), this.tileBox(i, g), p.text, p.bold, 1);
    }
  };

  // Writes n in the tile b, in the colour ink, over any transform set.
  Board.prototype.writeNumber = function (n, b, ink, bold, alpha) {
    var ctx = this.ctx, places = Sieve.places(n, this.base), dec = this.withDecimal ? String(n) : '';
    var key = places.length + ',' + places[0].length + ',' + dec.length, lay = this.layouts.get(key);
    if (lay === undefined) this.layouts.set(key, lay = this.layout(places, dec.length, this.win.sd));
    if (!lay) return;
    var lines = split(places, lay.L);
    var height = lines.length * lay.F * LINE + lay.subF * SUB_LINE;
    var cx = b[0] + b[2] / 2, top = b[1] + (b[3] - height) / 2;
    var f = (bold ? '700 ' : '400 ') + lay.F.toFixed(1) + 'px ' + FONT;
    if (f !== this.font) ctx.font = this.font = f;
    if (ink !== this.ink) ctx.fillStyle = this.ink = ink;
    for (var k = 0; k < lines.length; k++) this.fillLine(lines[k], cx, top + lay.F * LINE * (k + 0.5), lay.F);
    if (lay.subF) {
      f = '400 ' + lay.subF.toFixed(1) + 'px ' + FONT;
      if (f !== this.font) ctx.font = this.font = f;
      ctx.globalAlpha = 0.75 * alpha;
      ctx.fillText(dec, cx, top + lines.length * lay.F * LINE + lay.subF * SUB_LINE / 2);
      ctx.globalAlpha = alpha;
    }
  };

  // Writes one line of a number, centred on cx. Pitman's digits go in one
  // character at a time: each is its digit, 2 or 3, turned about the digit's
  // own centre, so it sits where the upright digit would. The monospace font
  // gives every character the same advance, adv times the font size.
  Board.prototype.fillLine = function (line, cx, y, size) {
    var ctx = this.ctx;
    if (!/[↊↋]/.test(line)) {
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

  // The last frame, fading out, or wiped away by a widening circle whose
  // edge carries the colour of the change.
  Board.prototype.renderFade = function (t) {
    var f = this.fade;
    if (!f) return;
    var u = (t - f.t0) / f.dur;
    if (u >= 1) { this.fade = null; return; }
    this.busy = true;
    var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (!f.wipe) {
      ctx.globalAlpha = 1 - easeOut(clamp01(u));
      ctx.drawImage(this.shot, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }
    var wp = f.wipe, R = wp.reach * easeInOut(clamp01(u));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(wp.x, wp.y, R, 0, 2 * Math.PI);
    ctx.clip('evenodd');
    ctx.drawImage(this.shot, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 0.7 * (1 - u);
    ctx.strokeStyle = wp.colour;
    ctx.lineWidth = 3 * this.dpr;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, R, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // A rounded square outline of the given size, its line inside the edge.
  Board.prototype.ringAt = function (x, y, size, colour, line, alpha, rad) {
    var ctx = this.ctx;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineWidth = line;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    if (rad && typeof ctx.roundRect === 'function') ctx.roundRect(x + line / 2, y + line / 2, size - line, size - line, Math.max(0, rad - line / 2));
    else ctx.rect(x + line / 2, y + line / 2, size - line, size - line);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  // A ring round the tile whose box starts at (x, y), s device pixels wide.
  // Round a tile too small to ring, it rings a box 8 pixels wide, centred
  // on the tile.
  Board.prototype.ringBox = function (x, y, s, colour, lw, alpha) {
    var dpr = this.dpr, g = this.win && s >= 12 ? this.gap() : 0;
    var size = Math.max(s - g, 8 * dpr);
    this.ringAt(Math.round(x) + (s - g - size) / 2, Math.round(y) + (s - g - size) / 2, size, colour, lw * dpr, alpha, this.radius());
  };

  Board.prototype.ring = function (n, colour, lw, alpha) {
    var b = this.box(n);
    if (b) this.ringBox(b.x, b.y, b.s, colour, lw, alpha);
  };

  Board.prototype.glideRing = function (gl, t, colour, lw) {
    var a = gl.alpha(t);
    if (!a || gl.n == null) return;
    var b = this.box(gl.n);
    if (!b) return;
    var o = gl.offset(t);
    this.ringBox(b.x + o[0] * b.s, b.y + o[1] * b.s, b.s, colour, lw, a);
    if (gl.moving(t)) this.busy = true;
  };

  Board.prototype.renderOverlays = function (t) {
    var th = this.theme;
    this.renderSpot(t);
    this.glideRing(this.hoverGlide, t, th.ring, 2);
    if (this.cursor != null && this.focused && this.keyboard) this.glideRing(this.cursorGlide, t, th.focus, 3);
    if (this.flash) this.renderFlash(t);
  };

  // Go to: the tile pulses, and rings spread from it, as sonar does.
  Board.prototype.renderFlash = function (t) {
    var age = t - this.flash.t0, b = this.box(this.flash.n), th = this.theme;
    if (age > 900) { this.flash = null; return; }
    this.busy = true;
    if (!b) return;
    if (still()) { this.ring(this.flash.n, th.focus, 4, 1); return; }
    this.ring(this.flash.n, th.focus, 4, 0.55 + 0.45 * Math.cos(age / 150 * Math.PI));
    var size0 = Math.max(b.s, 20 * this.dpr), cx = b.x + b.s / 2, cy = b.y + b.s / 2;
    for (var j = 0; j < 3; j++) {
      var u = (age - j * 150) / 550;
      if (u <= 0 || u >= 1) continue;
      var size = size0 * (1 + 2.4 * easeOut(u));
      this.ringAt(cx - size / 2, cy - size / 2, size, th.focus, 2 * this.dpr, 0.7 * (1 - u) * (1 - u), size / 2);
    }
  };

  // The prime under the pointer, or under its button: the rest of the board
  // dims, and a ring comes round each multiple in turn.
  Board.prototype.spotAlpha = function (t) {
    var sp = this.spot;
    if (still()) return sp.dir > 0 ? 1 : 0;
    return clamp01(sp.a0 + sp.dir * (t - sp.ta) / (sp.dir > 0 ? 70 : 100));
  };

  Board.prototype.renderSpot = function (t) {
    var sp = this.spot, h = this.highlight, entry = h != null ? this.model.byNumber.get(h) : null;
    if (!entry) h = null;
    if (h !== sp.target) {
      var a0 = this.spotAlpha(t);
      if (h != null) {
        if (h !== sp.p) sp.t0 = t;
        sp.p = h;
        sp.slot = entry.slot;
      }
      sp.a0 = a0;
      sp.ta = t;
      sp.dir = h != null ? 1 : -1;
      sp.target = h;
    }
    var a = this.spotAlpha(t), w = this.win, p = sp.p;
    if (a > 0 && a < 1) this.busy = true;
    if (!a || p == null || !w || this.size < 6) return;
    var ctx = this.ctx, tiles = w.sd >= 12, g = tiles ? this.gap() : 0, rad = this.radius(), list = [], i, k;
    for (i = 0; i < w.count; i++) {
      var n = this.numberOf(i);
      if (n >= p && n < LIMIT && n % p === 0) list.push(i);
    }
    if (tiles) {
      ctx.fillStyle = rgb(this.theme.board, this.theme.veil * a);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.redraw(list, g, rad);
    }
    var colour = this.paint(4 + 2 * sp.slot).ring, lw = Math.max(1, Math.min(2, this.size * 0.045));
    var many = list.length > 400, gap = many || !list.length ? 0 : Math.min(7, 150 / list.length);
    for (k = 0; k < list.length; k++) {
      var m = this.numberOf(list[k]);
      if (m === p) continue;
      var ak = many || still() ? a : a * clamp01((t - sp.t0 - k * gap) / 75);
      if (ak < 1 && ak > 0 && !many) this.busy = true;
      if (ak > 0) this.ring(m, colour, lw, ak);
    }
    this.ring(p, this.theme.ring, lw + 1, a);
  };

  // Draws the tiles in list again, as they stand, over the veil.
  Board.prototype.redraw = function (list, g, rad) {
    var self = this, groups = new Map(), chosen = [], numbers = this.win.sd * 0.42 >= MIN_FONT * this.dpr;
    list.forEach(function (i) {
      var code = self.vis[i] > 0 ? self.vis[i] : self.codes[i];
      var l = groups.get(code);
      if (!l) groups.set(code, l = []);
      l.push(i);
      if (isBright(code)) chosen.push(i);
    });
    groups.forEach(function (l, code) { self.fillGroup(code, l, g, rad); });
    this.renderSheen(chosen, g, rad);
    if (!numbers) return;
    this.font = '';
    this.ink = '';
    groups.forEach(function (l, code) {
      var p = self.paint(code);
      l.forEach(function (i) { self.writeNumber(self.numberOf(i), self.tileBox(i, g), p.text, p.bold, 1); });
    });
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
      self.fling = null;
      self.lastPointer = clock();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      self.pointers.set(e.pointerId, { x: p[0], y: p[1], x0: p[0], y0: p[1], moved: false, type: e.pointerType, samples: [] });
      if (self.pointers.size === 2) {
        self.pinch = self.pinchState();
        self.pointers.forEach(function (q) { q.moved = true; q.samples = []; });
        self.release();
      } else if (self.pointers.size === 1) {
        self.pressOn(self.numberAt(p[0], p[1]));
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
        self.release();
      }
      if (q.moved) {
        var t = clock();
        q.samples.push([t, p[0], p[1]]);
        while (q.samples.length > 2 && t - q.samples[0][0] > 120) q.samples.shift();
        self.scrollBy(-dx, -dy);
      }
    });

    function end(e) {
      var q = self.pointers.get(e.pointerId);
      if (!q) return;
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) self.pinch = null;
      if (!self.pointers.size) cv.classList.remove('dragging');
      self.release();
      if (e.type === 'pointerup' && !self.pointers.size) {
        if (!q.moved) {
          var n = self.numberAt(q.x, q.y);
          if (n != null && self.opts.onTap) self.opts.onTap(n, q.type);
        } else {
          self.flingFrom(q);
        }
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
      self.fling = null;
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
      if (clock() - self.lastPointer > 300) {
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
          self.zoomSmooth(1.25);
          return;
        case '-':
        case '_':
          e.preventDefault();
          self.zoomSmooth(0.8);
          return;
        case 'Escape':
          self.setCursor(null);
          return;
        default:
          return;
      }
      e.preventDefault();
      self.keyboard = true;
      self.fling = null;
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
