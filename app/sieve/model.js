/* The sieve's rules, with no drawing: which numbers the visitor has chosen
   as primes, what each number's tile shows, and how a number is written in
   each base. The page, the share card and the builder page's picture all
   draw from it.

   Every number is one of five kinds. 0 and 1 are fixed. A chosen number is
   one the visitor picked. A struck number is a multiple of a chosen one, and
   takes the colour of the first chosen number, in the order they were
   picked, that divides it. Every other number is grey, and only a grey
   number can be chosen. So no chosen number is a multiple of one chosen
   before it. Removing any chosen number keeps that true, which is why the
   visitor may remove them in any order.

   Each chosen number holds a colour slot: the lowest one free when it was
   picked. Removing a number frees its slot and leaves the others' colours
   as they were. */
(function (global) {
  'use strict';

  var Sieve = global.Sieve || (global.Sieve = {});

  // Numbers run from 0 to LIMIT - 1. JavaScript holds whole numbers exactly
  // only up to 2^53, about 9 x 10^15, and this is the round number below it.
  // Colouring a tile needs one remainder for each chosen number, never a
  // factorisation, so the size of a number costs nothing.
  var LIMIT = 1e15;
  var MAX_WIDTH = 1e9;

  // Tile codes, as fill() writes them. A code of 4 or more names a colour
  // slot: 4 + 2 * slot for a multiple, 5 + 2 * slot for the chosen number.
  var NONE = 0, ZERO = 1, ONE = 2, GREY = 3;

  function Model() {
    this.list = [];          // { n, slot }, in the order picked
    this.byNumber = new Map();
    this.past = [];          // undo steps, newest last
  }

  Model.prototype.index = function () {
    this.byNumber = new Map();
    for (var i = 0; i < this.list.length; i++) this.byNumber.set(this.list[i].n, this.list[i]);
  };

  // What n is. index is the chosen number's place in the order picked:
  // n's own for a chosen number, the first that divides it for a multiple.
  Model.prototype.kindOf = function (n) {
    if (n === 0) return { kind: 'zero' };
    if (n === 1) return { kind: 'one' };
    var own = this.byNumber.get(n);
    if (own) return { kind: 'chosen', entry: own, index: this.list.indexOf(own) };
    for (var i = 0; i < this.list.length; i++) {
      if (n % this.list[i].n === 0) return { kind: 'struck', entry: this.list[i], index: i };
    }
    return { kind: 'grey' };
  };

  Model.prototype.isGrey = function (n) {
    if (n < 2 || n >= LIMIT || this.byNumber.has(n)) return false;
    for (var i = 0; i < this.list.length; i++) if (n % this.list[i].n === 0) return false;
    return true;
  };

  // The chosen numbers that divide n, other than n itself, in the order picked.
  Model.prototype.divisors = function (n) {
    return this.list.filter(function (e) { return e.n !== n && n % e.n === 0; });
  };

  Model.prototype.freeSlot = function () {
    var used = new Set(this.list.map(function (e) { return e.slot; }));
    for (var s = 0; ; s++) if (!used.has(s)) return s;
  };

  // Each change returns true if it changed anything, and can be undone.
  Model.prototype.choose = function (n) {
    if (!this.isGrey(n)) return false;
    var entry = { n: n, slot: this.freeSlot() };
    this.list.push(entry);
    this.byNumber.set(n, entry);
    this.remember({ add: entry, at: this.list.length - 1 });
    return true;
  };

  Model.prototype.remove = function (n) {
    var entry = this.byNumber.get(n);
    if (!entry) return false;
    var at = this.list.indexOf(entry);
    this.list.splice(at, 1);
    this.byNumber.delete(n);
    this.remember({ remove: entry, at: at });
    return true;
  };

  Model.prototype.clear = function () {
    if (!this.list.length) return false;
    this.remember({ clear: this.list });
    this.list = [];
    this.index();
    return true;
  };

  Model.prototype.remember = function (step) {
    this.past.push(step);
    if (this.past.length > 2000) this.past.shift();
  };

  // Undo is last in, first out, so a step always finds the list exactly as
  // it left it.
  Model.prototype.undo = function () {
    var step = this.past.pop();
    if (!step) return null;
    if (step.add) this.list.splice(step.at, 1);
    else if (step.remove) this.list.splice(step.at, 0, step.remove);
    else this.list = step.clear;
    this.index();
    return step;
  };

  // The smallest grey number: Eratosthenes' next prime. It is always a true
  // prime, whatever was chosen before. Any factor of it smaller than itself
  // is coloured, so a chosen number divides that factor, and so divides it
  // too, and it would not be grey.
  Model.prototype.nextGrey = function () {
    for (var n = 2; n < LIMIT; n++) if (this.isGrey(n)) return n;
    return null;
  };

  // Loads a list from the address, keeping only numbers that could have
  // been picked in that order. A number with no slot given takes its place
  // in the list, or the lowest slot free if another number holds that.
  Model.prototype.load = function (numbers, slots) {
    this.list = [];
    this.byNumber = new Map();
    this.past = [];
    var used = new Set();
    for (var i = 0; i < numbers.length; i++) {
      var n = numbers[i];
      if (!Number.isInteger(n) || !this.isGrey(n)) continue;
      var slot = slots && Number.isInteger(slots[i]) && slots[i] >= 0 && slots[i] < 1e4 && !used.has(slots[i]) ? slots[i] : null;
      if (slot === null) {
        slot = this.list.length;
        if (used.has(slot)) { slot = 0; while (used.has(slot)) slot++; }
      }
      used.add(slot);
      var entry = { n: n, slot: slot };
      this.list.push(entry);
      this.byNumber.set(n, entry);
    }
  };

  // Writes the code of every tile in a block of the grid into out, row by
  // row: rows r0 to r1 and columns c0 to c1 of a grid width numbers wide.
  // Chosen numbers go in first, since a later choice can divide an earlier
  // one. Then each chosen number marks its multiples, in the order picked,
  // and a tile keeps the first mark it gets. All arithmetic is on whole
  // numbers below 2^53, and a remainder, never a division, finds the first
  // multiple in a row, so every step is exact.
  Model.prototype.fill = function (width, r0, r1, c0, c1, out) {
    var w = c1 - c0 + 1, h = r1 - r0 + 1, list = this.list;
    var r, j, i, n, c, lo, hi, m, p, code, at;
    for (r = 0; r < h; r++) {
      lo = (r0 + r) * width + c0;
      at = r * w;
      for (j = 0; j < w; j++) {
        n = lo + j;
        out[at + j] = n >= LIMIT ? NONE : n > 1 ? GREY : n === 0 ? ZERO : ONE;
      }
    }
    for (i = 0; i < list.length; i++) {
      n = list[i].n;
      c = n % width;
      r = (n - c) / width;
      if (r >= r0 && r <= r1 && c >= c0 && c <= c1) out[(r - r0) * w + (c - c0)] = 5 + 2 * list[i].slot;
    }
    var top = Math.min(r1 * width + c1, LIMIT - 1);
    // When the block spans whole rows, its numbers run on unbroken.
    var whole = c0 === 0 && c1 === width - 1;
    for (i = 0; i < list.length; i++) {
      p = list[i].n;
      if (2 * p > top) continue;
      code = 4 + 2 * list[i].slot;
      if (whole) {
        lo = r0 * width;
        hi = top;
        for (m = Math.max(2 * p, lo + (p - lo % p) % p); m <= hi; m += p) {
          if (out[m - lo] === GREY) out[m - lo] = code;
        }
      } else {
        for (r = 0; r < h; r++) {
          lo = (r0 + r) * width + c0;
          hi = Math.min(lo + w - 1, top);
          at = r * w - lo;
          for (m = Math.max(2 * p, lo + (p - lo % p) % p); m <= hi; m += p) {
            if (out[at + m] === GREY) out[at + m] = code;
          }
        }
      }
    }
  };

  // Bases ----------------------------------------------------------------

  var BASES = [
    [2, 'binary'], [3, 'ternary'], [4, 'quaternary'], [5, 'quinary'],
    [6, 'senary'], [7, 'septenary'], [8, 'octal'], [9, 'nonary'],
    [10, 'decimal'], [11, 'undecimal'], [12, 'dozenal'], [13, 'tridecimal'],
    [14, 'tetradecimal'], [15, 'pentadecimal'], [16, 'hexadecimal'],
    [20, 'vigesimal'], [60, 'sexagesimal']
  ];

  // Dozenal writes ten and eleven with Pitman's digits: ↊, a turned 2, and
  // ↋, a turned 3. Few fonts carry them, so the page draws each one as its
  // digit turned upside down. TURNED names that digit.
  var PITMAN = { a: '↊', b: '↋' };
  var TURNED = { '↊': '2', '↋': '3' };

  // n in base b, as a list of places, most significant first. Other bases
  // above 10 run on into letters, as hexadecimal does. Base 60 writes each
  // place as a decimal number and pads every place after the first to two
  // digits, as a clock does: 3,725 is 1:02:05.
  function places(n, b) {
    if (b === 12) return n.toString(12).split('').map(function (d) { return PITMAN[d] || d; });
    if (b !== 60) return n.toString(b).split('');
    var out = [];
    do { var d = n % 60; out.unshift(d); n = (n - d) / 60; } while (n > 0);
    return out.map(function (d, i) { return i ? ':' + (d < 10 ? '0' : '') + d : String(d); });
  }

  function write(n, b) { return places(n, b).join(''); }

  // The value of each place of n in base b, most significant first, and back.
  function digitsOf(n, b) {
    var out = [];
    do { var d = n % b; out.unshift(d); n = (n - d) / b; } while (n > 0);
    return out;
  }

  // Infinity once the number passes the grid, before it outgrows 2^53.
  function fromDigits(ds, b) {
    var n = 0;
    for (var i = 0; i < ds.length; i++) {
      n = n * b + ds[i];
      if (n >= LIMIT) return Infinity;
    }
    return n;
  }

  // Reads a whole number as a visitor types it in base b, or returns null.
  // Commas, spaces and underscores are ignored, and letters may be either
  // case. Dozenal also takes X or T for ten and E for eleven, the usual
  // stand-ins for Pitman's digits on a keyboard. Base 60 wants colons between
  // places, as 1:02:05.
  function read(text, b) {
    var s = String(text).replace(/[\s,_]/g, '').toLowerCase(), ds = [], i, d;
    if (!s) return null;
    if (b === 60) {
      var parts = s.split(':');
      for (i = 0; i < parts.length; i++) {
        if (!/^\d{1,2}$/.test(parts[i]) || +parts[i] >= 60) return null;
        ds.push(+parts[i]);
      }
      return fromDigits(ds, b);
    }
    for (i = 0; i < s.length; i++) {
      var ch = s[i];
      if (b === 12 && (ch === '↊' || ch === 'x' || ch === 't')) d = 10;
      else if (b === 12 && (ch === '↋' || ch === 'e')) d = 11;
      else if (ch >= '0' && ch <= '9') d = ch.charCodeAt(0) - 48;
      else if (ch >= 'a' && ch <= 'z') d = ch.charCodeAt(0) - 87;
      else return null;
      if (d >= b) return null;
      ds.push(d);
    }
    return fromDigits(ds, b);
  }

  // Tiles in a base other than 10 show the decimal value in small figures
  // under the number. Dozenal shows none: every number it writes on the
  // page is dozenal, as its users count.
  function showsDecimal(b) { return b !== 10 && b !== 12; }

  var SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';
  function subscript(b) {
    return String(b).replace(/\d/g, function (d) { return SUBSCRIPTS[+d]; });
  }

  // 1,234,567, grouped by thousands.
  function grouped(n) {
    var s = String(n), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return s + out;
  }

  // Colours ---------------------------------------------------------------

  // OKLCH to sRGB bytes. A colour outside sRGB loses chroma until it fits,
  // so its hue and lightness hold.
  function oklch(L, C, h) {
    for (var c = C; ; c = Math.max(0, c - 0.004)) {
      var a = c * Math.cos(h * Math.PI / 180), bb = c * Math.sin(h * Math.PI / 180);
      var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * bb, 3);
      var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * bb, 3);
      var s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * bb, 3);
      var rgb = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
      ];
      var inside = rgb.every(function (v) { return v >= -0.0005 && v <= 1.0005; });
      if (inside || c === 0) {
        return rgb.map(function (v) {
          v = Math.min(1, Math.max(0, v));
          return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
        });
      }
    }
  }

  // The bright colour of each slot, as OKLCH. The first three follow the
  // brief: green, blue, yellow. After the fourteen chosen by hand, each
  // slot turns the hue by the golden angle and steps the lightness, so
  // neighbouring slots stay apart.
  var BRIGHT = [
    [0.73, 0.19, 145],  // green
    [0.64, 0.17, 258],  // blue
    [0.88, 0.17, 96],   // yellow
    [0.63, 0.21, 27],   // red
    [0.62, 0.18, 305],  // purple
    [0.77, 0.16, 58],   // orange
    [0.79, 0.12, 205],  // cyan
    [0.68, 0.22, 345],  // magenta
    [0.86, 0.19, 125],  // lime
    [0.56, 0.1, 55],    // brown
    [0.63, 0.11, 185],  // teal
    [0.83, 0.09, 12],   // pink
    [0.52, 0.17, 275],  // indigo
    [0.68, 0.13, 108]   // olive
  ];

  function brightOf(slot) {
    if (slot < BRIGHT.length) return BRIGHT[slot];
    var k = slot - BRIGHT.length;
    return [[0.7, 0.83, 0.6][k % 3], 0.15, (40 + k * 137.508) % 360];
  }

  var INK = [22, 22, 26], PAPER = [255, 255, 255];

  function slotColours(slot, dark) {
    var lch = brightOf(slot), L = lch[0], C = lch[1], h = lch[2];
    return {
      bright: oklch(L, C, h),
      brightText: L >= 0.6 ? INK : PAPER,
      pale: dark ? oklch(0.36, C * 0.5, h) : oklch(0.92, C * 0.42, h),
      paleText: dark ? oklch(0.82, C * 0.35, h) : oklch(0.43, C * 0.5, h)
    };
  }

  // The colours that belong to no slot. Grey sits between the pale
  // multiples and the background in light mode and above them in dark, so
  // the numbers still in the sieve stand out in both.
  //
  // The board shades from its middle to boardEdge at the corners, and dot
  // marks the corners of the squares round the grid. A chosen tile glows
  // with its own colour at glow opacity, blurred by glowBlur of its size and
  // dropped below it by glowDrop: a wide halo in dark mode, a close shadow
  // in light. Its sheen runs from sheen white at the top to shade black at
  // the foot. veil dims the board round a prime under the pointer.
  function theme(dark) {
    return dark ? {
      board: [30, 30, 35], boardEdge: [22, 22, 26], dot: 'rgba(255, 255, 255, 0.1)',
      grey: oklch(0.47, 0.006, 85), greyText: [236, 233, 225],
      zero: [8, 8, 10], zeroText: [245, 243, 236], one: [245, 243, 236], oneText: INK,
      edge: 'rgba(255, 255, 255, 0.4)', ring: 'rgb(245, 243, 236)', focus: 'rgb(122, 166, 224)',
      glow: 0.75, glowBlur: 0.55, glowDrop: 0, sheen: 0.2, shade: 0.16, veil: 0.62
    } : {
      board: [255, 253, 248], boardEdge: [246, 242, 233], dot: 'rgba(70, 60, 40, 0.2)',
      grey: oklch(0.85, 0.008, 85), greyText: [52, 50, 45],
      zero: [26, 26, 26], zeroText: [255, 255, 255], one: [255, 255, 255], oneText: INK,
      edge: 'rgba(0, 0, 0, 0.3)', ring: 'rgb(26, 26, 26)', focus: 'rgb(21, 82, 161)',
      glow: 0.5, glowBlur: 0.2, glowDrop: 0.1, sheen: 0.3, shade: 0.1, veil: 0.55
    };
  }

  function css(rgb) { return 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')'; }

  Sieve.Model = Model;
  Sieve.LIMIT = LIMIT;
  Sieve.MAX_WIDTH = MAX_WIDTH;
  Sieve.CODES = { NONE: NONE, ZERO: ZERO, ONE: ONE, GREY: GREY };
  Sieve.BASES = BASES;
  Sieve.places = places;
  Sieve.TURNED = TURNED;
  Sieve.digitsOf = digitsOf;
  Sieve.fromDigits = fromDigits;
  Sieve.read = read;
  Sieve.showsDecimal = showsDecimal;
  Sieve.write = write;
  Sieve.subscript = subscript;
  Sieve.grouped = grouped;
  Sieve.slotColours = slotColours;
  Sieve.theme = theme;
  Sieve.css = css;
})(this);
