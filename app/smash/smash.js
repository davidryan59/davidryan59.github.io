/* The Smash Screen engine: a device, the picture on it, the hand that
   follows the pointer and swings a weapon, the view and the input.
   scenes.js draws the pictures, damage.js models each blow, hands.js draws
   the hands and sound.js makes every sound. game.js holds the rules of the
   two modes and talks to the engine through Smash.engine.

   Drawing is layered so that a quiet page costs nothing. Two offscreen
   canvases hold everything that has settled: one has the device's body,
   the picture and the finished damage, the other the finished cracks. A
   frame copies both and draws only what still moves on top. When a key
   flies off or the frame takes a dent, only the body around the screen is
   repainted. When nothing grows and nothing moves, no frames run at all.

   Zoom keeps the same budget. During a pinch or a scroll the page stretches
   the cached canvases, which is cheap, and redraws them sharp once the
   gesture has rested for a moment. Everything is vector, so one redraw costs
   about as much as one blow at any zoom. The canvas never draws at more
   than twice the CSS pixel size. */
(function () {
  'use strict';

  var S = window.Smash, D = S.draw, Sound = S.Sound, Hands = S.Hands;
  var TAU = 2 * Math.PI, ZMAX = 8;
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('screen');
  var handEl = document.getElementById('hand');
  var ctx = canvas.getContext('2d');
  var flat = document.createElement('canvas'), glass = document.createElement('canvas');
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function now() { return performance.now() / 1000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var E = S.engine = {
    mode: 'fun', hooks: {}, weapon: 'hammer', locked: false, zoomable: true, maxHits: 160,
    pads: { top: 0, bottom: 0 }, offset: [0, 0], reduceMotion: reduceMotion
  };

  /* ----------------------------------------------------------- devices */

  // Each device is drawn in its screen's units: the screen fills (0, 0) to
  // (W, H) and everything else sits around it.
  var FINISH = {
    phone: [['#4a4d55', '#2a2c31'], ['#e3e4e6', '#b9bbbf'], ['#2f3a4f', '#1c2433'], ['#e8d6b8', '#c8b089'],
            ['#6e5f80', '#4b3f5a'], ['#4f6b5a', '#34483c'], ['#c7d7e8', '#93a9c1']],
    tablet: [['#5d6168', '#3d4046'], ['#dcdde0', '#b5b7bb'], ['#9bb3cc', '#6f89a6'], ['#e9c6cf', '#c99aa8'], ['#ece4d4', '#cbbfa6']],
    laptop: [['#dfe1e5', '#b9bcc2'], ['#7d8189', '#5b5f66'], ['#3a4556', '#283141'], ['#e8dcc8', '#cdbd9f']],
    monitor: [['#2a2b30', '#141518'], ['#e9eaec', '#c3c5c9']]
  };
  var NAMES = { phone: 'phone', tablet: 'tablet', laptop: 'laptop', monitor: 'monitor' };
  var KEY_LABELS = [['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '⌫'],
                    ['⇥', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
                    ['⇪', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', '\'', '↵', '↵'],
                    ['⇧', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', '⇧', '↑', '⌥']];

  // The laptop's keys, seen at a slant: four rows of fourteen.
  function makeKeys() {
    var keys = [];
    for (var row = 0; row < 4; row++) {
      var y0 = 1088 + row * 20 + row * row * 1.5, y1 = y0 + 15 + row * 2;
      var inset0 = 40 - row * 26, inset1 = inset0 - 20;
      for (var key = 0; key < 14; key++) {
        var fa = key / 14, fb = (key + 0.86) / 14;
        var xa0 = (-40 + inset0) + (1680 - 2 * inset0) * fa + 20, xb0 = (-40 + inset0) + (1680 - 2 * inset0) * fb + 20;
        var xa1 = (-40 + inset1) + (1680 - 2 * inset1) * fa + 20, xb1 = (-40 + inset1) + (1680 - 2 * inset1) * fb + 20;
        keys.push({ poly: [[xa0, y0], [xb0, y0], [xb1, y1], [xa1, y1]], c: [(xa0 + xb0 + xa1 + xb1) / 4, (y0 + y1) / 2],
                    label: KEY_LABELS[row][key], gone: 0 });
      }
    }
    return keys;
  }

  function makeDevice(type, portrait) {
    var d = { type: type, finish: FINISH[type][Math.floor(Math.random() * FINISH[type].length)], dents: [] };
    if (type === 'phone') { d.W = 1000; d.H = 2167; d.radius = 140; d.bounds = [-70, -60, 1070, 2227]; d.notch = [345, 30, 310, 90]; }
    else if (type === 'tablet') { d.W = portrait ? 1000 : 1333; d.H = portrait ? 1333 : 1000; d.radius = 40; d.bounds = [-75, -75, d.W + 75, d.H + 75]; }
    else if (type === 'laptop') { d.W = 1600; d.H = 1000; d.radius = [18, 18, 0, 0]; d.bounds = [-150, -56, 1750, 1210]; d.keys = makeKeys(); }
    else { d.W = 1778; d.H = 1000; d.radius = 4; d.bounds = [-26, -26, 1804, 1340]; }
    d.lid = type === 'laptop' ? [-34, -52, d.W + 34, d.H + 70] : type === 'monitor' ? [-26, -26, d.W + 26, d.H + 64] : d.bounds;
    return d;
  }

  function screenPath(c, d) {
    c.beginPath();
    D.roundRect(c, 0, 0, d.W, d.H, d.radius);
  }

  // The whole body, as one path: for clipping dents to it.
  function bodyPath(c, d) {
    var W = d.W, H = d.H, cx = W / 2;
    c.beginPath();
    if (d.type === 'phone') D.roundRect(c, -58, -58, W + 116, H + 116, d.radius + 58);
    else if (d.type === 'tablet') D.roundRect(c, -70, -70, W + 140, H + 140, d.radius + 70);
    else if (d.type === 'laptop') {
      D.roundRect(c, -34, -52, W + 68, H + 124, [40, 40, 16, 16]);
      c.moveTo(-40, 1080); c.lineTo(1640, 1080); c.lineTo(1750, 1182); c.lineTo(-150, 1182); c.closePath();
      D.roundRect(c, -150, 1180, 1900, 26, [0, 0, 18, 18]);
    } else {
      D.roundRect(c, -26, -26, W + 52, H + 90, 18);
      c.moveTo(cx - 90, 1060); c.lineTo(cx + 90, 1060); c.lineTo(cx + 75, 1296); c.lineTo(cx - 75, 1296); c.closePath();
      c.ellipse(cx, 1300, 340, 30, 0, 0, TAU);
    }
  }

  // shade: device pixels per screen unit, for a shadow that scales with zoom.
  function drawBody(c, d, shade) {
    var W = d.W, H = d.H, f = d.finish;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.28)';
    c.shadowBlur = Math.min(120, 50 * shade);
    c.shadowOffsetY = Math.min(60, 22 * shade);
    if (d.type === 'phone') {
      var b = 58;
      c.fillStyle = f[1];
      [[-b - 7, 330, 80], [-b - 7, 500, 140], [-b - 7, 680, 140], [W + b - 3, 560, 240]].forEach(function (s) {
        D.fillRound(c, s[0], s[1], 10, s[2], 5, f[1]);
      });
      D.fillRound(c, -b, -b, W + 2 * b, H + 2 * b, d.radius + b, D.grad(c, -b, 0, W + b, 0, [f[0], f[1], f[0]]));
      c.shadowColor = 'transparent';
      D.fillRound(c, -b + 12, -b + 12, W + 2 * b - 24, H + 2 * b - 24, d.radius + b - 12, '#050506');
    } else if (d.type === 'tablet') {
      var t = 70;
      D.fillRound(c, -t, -t, W + 2 * t, H + 2 * t, d.radius + t, D.grad(c, -t, 0, W + t, 0, [f[0], f[1], f[0]]));
      c.shadowColor = 'transparent';
      D.fillRound(c, -t + 10, -t + 10, W + 2 * t - 20, H + 2 * t - 20, d.radius + t - 10, '#060607');
      D.circle(c, W / 2, -t / 2 + 5, 9, '#1a1c22');
      D.circle(c, W / 2 - 2.5, -t / 2 + 2.5, 2.5, 'rgba(120,150,255,0.6)');
    } else if (d.type === 'laptop') {
      c.beginPath();
      c.moveTo(-40, 1080);
      c.lineTo(1640, 1080);
      c.lineTo(1750, 1182);
      c.lineTo(-150, 1182);
      c.closePath();
      c.fillStyle = D.grad(c, 0, 1080, 0, 1182, [f[1], f[0]]);
      c.fill();
      c.shadowColor = 'transparent';
      d.keys.forEach(function (k) {
        c.beginPath();
        k.poly.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
        c.closePath();
        c.fillStyle = k.gone ? 'rgba(6,6,8,0.95)' : 'rgba(20,21,24,0.82)';
        c.fill();
        if (k.gone) {
          // The switch under a missing key.
          c.strokeStyle = 'rgba(170,172,182,0.6)';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(k.c[0] - 14, k.c[1] - 3);
          c.lineTo(k.c[0] + 14, k.c[1] + 3);
          c.moveTo(k.c[0] - 14, k.c[1] + 3);
          c.lineTo(k.c[0] + 14, k.c[1] - 3);
          c.stroke();
        }
      });
      c.beginPath();
      c.moveTo(560, 1172);
      c.lineTo(1040, 1172);
      c.lineTo(1052, 1180);
      c.lineTo(548, 1180);
      c.closePath();
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fill();
      D.fillRound(c, -150, 1180, 1900, 26, [0, 0, 18, 18], D.grad(c, 0, 1180, 0, 1206, [f[0], f[1]]));
      D.fillRound(c, 700, 1180, 200, 8, [0, 0, 8, 8], 'rgba(0,0,0,0.18)');
      c.shadowColor = 'rgba(0,0,0,0.28)';
      D.fillRound(c, -34, -52, W + 68, H + 124, [40, 40, 16, 16], f[1]);
      c.shadowColor = 'transparent';
      D.fillRound(c, -26, -44, W + 52, H + 108, [34, 34, 10, 10], '#0b0b0d');
      D.circle(c, W / 2, -24, 7, '#1c1e24');
      D.fillRound(c, -30, 1070, W + 60, 12, 4, D.grad(c, 0, 1070, 0, 1082, ['#1a1a1d', '#3a3a40']));
    } else {
      var cx = W / 2;
      c.beginPath();
      c.ellipse(cx, 1318, 360, 26, 0, 0, TAU);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fill();
      c.shadowColor = 'transparent';
      c.beginPath();
      c.moveTo(cx - 90, 1060);
      c.lineTo(cx + 90, 1060);
      c.lineTo(cx + 75, 1296);
      c.lineTo(cx - 75, 1296);
      c.closePath();
      c.fillStyle = D.grad(c, cx - 90, 0, cx + 90, 0, ['#9a9da3', '#d4d6da', '#8d9096']);
      c.fill();
      c.beginPath();
      c.ellipse(cx, 1300, 340, 30, 0, 0, TAU);
      c.fillStyle = D.grad(c, 0, 1270, 0, 1330, ['#dcdee2', '#8f9298']);
      c.fill();
      c.shadowColor = 'rgba(0,0,0,0.28)';
      D.fillRound(c, -26, -26, W + 52, H + 90, 18, D.grad(c, 0, -26, 0, H + 64, f));
      c.shadowColor = 'transparent';
      D.fillRound(c, -8, -8, W + 16, H + 16, 8, '#050506');
      D.circle(c, W - 60, H + 34, 4, '#3fdc6a');
    }
    c.restore();
    if (d.dents.length) {
      c.save();
      bodyPath(c, d);
      c.clip();
      d.dents.forEach(function (dn) { drawDent(c, dn); });
      c.restore();
    }
  }

  // A dent: a dark hollow lit from the top left, scratches and chipped paint.
  function drawDent(c, dn) {
    var r = S.rng(dn.seed), R = dn.r, i;
    var g = c.createRadialGradient(dn.x + R * 0.15, dn.y + R * 0.15, 0, dn.x, dn.y, R);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(dn.x, dn.y, R, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = R * 0.08;
    c.beginPath();
    c.arc(dn.x, dn.y, R * 0.75, Math.PI * 0.95, Math.PI * 1.6);
    c.stroke();
    c.beginPath();
    for (i = 0, i = r.int(5, 9); i > 0; i--) {
      var n = r.int(5, 9), pts = [];
      for (var k = 0; k < n; k++) pts.push(R * 0.35 * r.range(0.5, 1.2));
    }
    for (i = 0; i < n; i++) {
      var a = TAU * i / n, rr = pts[i];
      if (i) c.lineTo(dn.x + Math.cos(a) * rr, dn.y + Math.sin(a) * rr); else c.moveTo(dn.x + Math.cos(a) * rr, dn.y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = r.chance(0.5) ? 'rgba(210,212,218,0.55)' : 'rgba(40,40,46,0.5)';
    c.fill();
    c.lineWidth = Math.max(1.5, R * 0.04);
    for (i = r.int(3, 6); i > 0; i--) {
      var sa = r.range(0, TAU), s0 = R * r.range(0.2, 0.5), s1 = R * r.range(0.9, 1.6);
      c.strokeStyle = r.chance(0.5) ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.moveTo(dn.x + Math.cos(sa) * s0, dn.y + Math.sin(sa) * s0);
      c.lineTo(dn.x + Math.cos(sa + r.range(-0.2, 0.2)) * s1, dn.y + Math.sin(sa + r.range(-0.2, 0.2)) * s1);
      c.stroke();
    }
  }

  // Parts that sit over the picture: the phone's camera cut-out.
  function drawOverlay(c, d) {
    if (d.type === 'phone') D.fillRound(c, d.W / 2 - 155, 30, 310, 90, 45, '#000000');
  }

  // Which part of the device a point in screen units lands on.
  function inRound(x, y, rx, ry, w, h, rad) {
    if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
    var r = Math.min(rad, w / 2, h / 2), cx = clamp(x, rx + r, rx + w - r), cy = clamp(y, ry + r, ry + h - r);
    return Math.hypot(x - cx, y - cy) <= r;
  }
  function inPoly(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function regionOf(u) {
    var d = dev, x = u[0], y = u[1], W = d.W, H = d.H, cx = W / 2;
    if (x >= 0 && y >= 0 && x <= W && y <= H) return 'screen';
    if (d.type === 'phone') return inRound(x, y, -58, -58, W + 116, H + 116, d.radius + 58) ? 'body' : 'off';
    if (d.type === 'tablet') return inRound(x, y, -70, -70, W + 140, H + 140, d.radius + 70) ? 'body' : 'off';
    if (d.type === 'laptop') {
      if (y > 1084 && y < 1176 && inPoly([[-40, 1080], [1640, 1080], [1750, 1182], [-150, 1182]], x, y)) return 'keys';
      if (inRound(x, y, -34, -52, W + 68, H + 124, 16) || inPoly([[-40, 1080], [1640, 1080], [1750, 1182], [-150, 1182]], x, y) ||
          (x > -150 && x < 1750 && y >= 1180 && y <= 1206)) return 'body';
      return 'off';
    }
    if (inRound(x, y, -26, -26, W + 52, H + 90, 18) || inPoly([[cx - 90, 1060], [cx + 90, 1060], [cx + 75, 1296], [cx - 75, 1296]], x, y) ||
        Math.pow((x - cx) / 340, 2) + Math.pow((y - 1300) / 30, 2) <= 1) return 'body';
    return 'off';
  }

  /* ------------------------------------------------------------ layout */

  var sw = 0, sh = 0, dpr = 1;
  var dev = null, pic = null, glassNet = null, place = { k: 1, ox: 0, oy: 0 };
  var view = { z: 1, cx: 0, cy: 0 }, cacheView = null;
  var settled = [], active = [], dirty = true, lastView = -1e9;

  function layout() {
    var rect = stage.getBoundingClientRect();
    sw = Math.max(1, rect.width);
    sh = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    [canvas, flat, glass].forEach(function (c) {
      c.width = Math.round(sw * dpr);
      c.height = Math.round(sh * dpr);
    });
    if (E.hooks.resize) E.hooks.resize(sw, sh, dpr);
    if (!dev) return;
    var b = dev.bounds, bw = b[2] - b[0], bh = b[3] - b[1], pad = Math.min(sw, sh) * 0.05 + 8;
    var top = E.pads.top, bot = E.pads.bottom, avail = Math.max(60, sh - 2 * pad - top - bot);
    place.k = Math.min((sw - 2 * pad) / bw, avail / bh);
    place.ox = (sw - bw * place.k) / 2 - b[0] * place.k;
    place.oy = top + pad + (avail - bh * place.k) / 2 - b[1] * place.k;
    view = { z: 1, cx: sw / 2, cy: sh / 2 };
    dirty = true;
  }

  // The transform from screen units to device pixels, under a given view.
  function setUnits(c, v) {
    var s = dpr * v.z * place.k;
    c.setTransform(s, 0, 0, s, dpr * ((place.ox - v.cx) * v.z + sw / 2), dpr * ((place.oy - v.cy) * v.z + sh / 2));
  }
  function env(still) { return { k: view.z * place.k, dpr: dpr, zoom: view.z, still: still || reduceMotion }; }

  function toUnits(x, y) {
    var wx = (x - sw / 2) / view.z + view.cx, wy = (y - sh / 2) / view.z + view.cy;
    return [(wx - place.ox) / place.k, (wy - place.oy) / place.k];
  }
  function toStage(u) {
    return [((u[0] * place.k + place.ox) - view.cx) * view.z + sw / 2, ((u[1] * place.k + place.oy) - view.cy) * view.z + sh / 2];
  }

  /* --------------------------------------------------------- rendering */

  function sheen(c, d) {
    c.fillStyle = D.grad(c, 0, 0, d.W * 0.6, d.H, ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']);
    c.fillRect(0, 0, d.W, d.H);
  }

  // At high zoom the panel shows its red, green and blue subpixels.
  var subpixel = null;
  function drawSubpixels(c) {
    var q = view.z * place.k * dpr;
    if (q < 4) return;
    if (!subpixel) {
      subpixel = document.createElement('canvas');
      subpixel.width = 3;
      subpixel.height = 4;
      var sc = subpixel.getContext('2d');
      ['#ff5a5a', '#5aff5a', '#5a5aff'].forEach(function (col, i) { sc.fillStyle = col; sc.fillRect(i, 0, 1, 3); });
      sc.fillStyle = '#303030';
      sc.fillRect(0, 3, 3, 1);
    }
    var pat = c.createPattern(subpixel, 'repeat');
    if (!pat || !pat.setTransform || !window.DOMMatrix) return;
    pat.setTransform(new DOMMatrix([1 / 3, 0, 0, 1 / 4, 0, 0]));
    c.save();
    c.globalAlpha = Math.min(1, (q - 4) / 8) * 0.4;
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = pat;
    c.fillRect(0, 0, dev.W, dev.H);
    c.restore();
  }

  // Repaints the body in the picture cache, everywhere but the screen.
  function renderBody(v) {
    var c = flat.getContext('2d');
    setUnits(c, v);
    c.save();
    c.beginPath();
    c.rect(-1e5, -1e5, 2e5, 2e5);
    D.roundRect(c, 0, 0, dev.W, dev.H, dev.radius);
    c.clip('evenodd');
    c.clearRect(-1e5, -1e5, 2e5, 2e5);
    drawBody(c, dev, v.z * place.k * dpr);
    c.restore();
  }

  function renderCaches(t) {
    var f = flat.getContext('2d'), g = glass.getContext('2d');
    [f, g].forEach(function (c) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, flat.width, flat.height);
      setUnits(c, view);
    });
    drawBody(f, dev, view.z * place.k * dpr);
    f.save();
    screenPath(f, dev);
    f.clip();
    S.drawPicture(f, dev.W, dev.H, pic);
    settled.forEach(function (h) { S.Damage.drawLCD(f, [h], t, env(true)); });
    f.restore();
    drawOverlay(f, dev);
    g.save();
    screenPath(g, dev);
    g.clip();
    sheen(g, dev);
    S.Damage.drawGlass(g, settled, t, env(true));
    g.restore();
    cacheView = { z: view.z, cx: view.cx, cy: view.cy };
    dirty = false;
  }

  // A blow that has finished growing is added to the caches as it stands,
  // without redrawing the blows before it. Each blow draws whole, over the
  // ones before, just as it looked while it grew.
  function bake(hits, t) {
    var f = flat.getContext('2d'), g = glass.getContext('2d');
    setUnits(f, view);
    setUnits(g, view);
    f.save();
    screenPath(f, dev);
    f.clip();
    hits.forEach(function (h) { S.Damage.drawLCD(f, [h], t, env(true)); });
    f.restore();
    drawOverlay(f, dev);
    g.save();
    screenPath(g, dev);
    g.clip();
    S.Damage.drawGlass(g, hits, t, env(true));
    g.restore();
  }

  function sameView(a, b) { return a && b && a.z === b.z && a.cx === b.cx && a.cy === b.cy; }

  // The body changed: a key flew off or the frame took a dent.
  function bodyChanged() {
    if (cacheView && !dirty && sameView(cacheView, view)) renderBody(view);
    else dirty = true;
  }

  function drawBombs(c, t) {
    bombs.forEach(function (b) {
      var R = Math.min(dev.W, dev.H) * 0.038, left = b.at - t, blink = left < 0.8 ? Math.sin(t * 40) > 0 : Math.sin(t * 12) > 0;
      c.save();
      c.translate(b.u[0], b.u[1]);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.ellipse(R * 0.2, R * 0.9, R * 0.9, R * 0.3, 0, 0, TAU);
      c.fill();
      c.fillStyle = blink ? '#4a1d1d' : '#26272c';
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.28)';
      c.beginPath();
      c.arc(-R * 0.35, -R * 0.35, R * 0.28, 0, TAU);
      c.fill();
      c.fillStyle = '#4a4c55';
      c.fillRect(-R * 0.22, -R * 1.25, R * 0.44, R * 0.32);
      c.strokeStyle = '#b58a52';
      c.lineWidth = R * 0.1;
      c.beginPath();
      c.moveTo(0, -R * 1.25);
      c.quadraticCurveTo(R * 0.1, -R * 1.6, R * 0.5, -R * 1.65);
      c.stroke();
      c.fillStyle = Math.sin(t * 50) > 0 ? '#ffd23f' : '#ff7a00';
      c.beginPath();
      c.arc(R * 0.5, -R * 1.65, R * (0.18 + 0.08 * Math.sin(t * 31)), 0, TAU);
      c.fill();
      c.restore();
    });
  }

  function drawBolts(c, t) {
    bolts = bolts.filter(function (b) { return t - b.t0 < 0.35; });
    bolts.forEach(function (b) {
      var a = 1 - (t - b.t0) / 0.35, css = 1 / (view.z * place.k);
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      [[10, 'rgba(255,240,150,' + (0.35 * a).toFixed(3) + ')'], [4, 'rgba(255,255,220,' + (0.8 * a).toFixed(3) + ')'], [1.6, 'rgba(255,255,255,' + a.toFixed(3) + ')']].forEach(function (pass) {
        c.beginPath();
        [b.main].concat(b.forks).forEach(function (path, fi) {
          path.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
        });
        c.strokeStyle = pass[1];
        c.lineWidth = pass[0] * css;
        c.stroke();
      });
      c.restore();
    });
  }

  function compose(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var s = view.z / cacheView.z;
    var tx = dpr * (sw / 2 * (1 - s) + (cacheView.cx - view.cx) * view.z);
    var ty = dpr * (sh / 2 * (1 - s) + (cacheView.cy - view.cy) * view.z);
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.drawImage(flat, 0, 0);
    setUnits(ctx, view);
    ctx.save();
    screenPath(ctx, dev);
    ctx.clip();
    active.forEach(function (h) { S.Damage.drawLCD(ctx, [h], t, env()); });
    drawSubpixels(ctx);
    ctx.restore();
    if (active.length) drawOverlay(ctx, dev);
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.drawImage(glass, 0, 0);
    setUnits(ctx, view);
    if (active.length) {
      ctx.save();
      screenPath(ctx, dev);
      ctx.clip();
      S.Damage.drawGlass(ctx, active, t, env());
      ctx.restore();
    }
    drawBombs(ctx, t);
    drawBolts(ctx, t);
    if (E.hooks.drawOver) {
      ctx.save();
      E.hooks.drawOver(ctx, t, dev);
      ctx.restore();
    }
    // A lightning strike lights the whole stage, twice.
    if (flash && !reduceMotion) {
      var ft = t - flash.t0, fa = ft < 0.06 ? flash.a : ft > 0.13 && ft < 0.19 ? flash.a * 0.6 : 0;
      if (ft > 0.3) flash = null;
      if (fa) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(' + flash.rgb + ',' + fa.toFixed(3) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  /* ---------------------------------------------------------- the loop */

  var raf = 0, settleTimer = 0, shake = null, bombs = [], bolts = [], flash = null, autoAt = 0;
  function request() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    var t = now(), more = false;
    if (zoomAnim && stepZoom(t)) more = true;
    if (stepHand(t)) more = true;
    if (autoAt && t >= autoAt) {
      autoAt = 0;
      release();
    }
    if (autoAt) more = true;
    for (var i = bombs.length - 1; i >= 0; i--) {
      if (t >= bombs[i].at) {
        var b = bombs.splice(i, 1)[0];
        b.fuse.stop();
        contact({ weapon: 'bomb', strength: 1, u: b.u, placed: true });
      }
    }
    if (bombs.length || bolts.length || flash) more = true;
    var done = active.filter(function (h) { return t >= h.t0 + h.end; });
    if (done.length) {
      active = active.filter(function (h) { return done.indexOf(h) < 0; });
      settled = settled.concat(done);
      if (cacheView && !dirty && sameView(cacheView, view)) bake(done, t);
      else dirty = true;
    }
    var resting = !zoomAnim && !gesture.active() && t - lastView > 0.15;
    if (!cacheView || (dirty && resting) || (resting && !sameView(cacheView, view))) renderCaches(t);
    // A resize clears the caches. Keep drawing until they are rebuilt.
    if (dirty) more = true;
    if (E.hooks.frame && E.hooks.frame(t)) more = true;
    compose(t);
    if (active.length) more = true;
    var ox = E.offset[0], oy = E.offset[1];
    if (shake) {
      var p = (t - shake.t0) / shake.dur;
      if (p >= 1) shake = null;
      else {
        var amp = shake.amp * Math.pow(1 - p, 2);
        ox += Math.sin(p * 47) * amp;
        oy += Math.cos(p * 39) * amp;
        more = true;
      }
    }
    canvas.style.transform = ox || oy ? 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px)' : '';
    if (more) request();
  }

  function viewChanged() {
    lastView = now();
    request();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(request, 170);
    updateZoomUI();
  }

  /* -------------------------------------------------------------- zoom */

  var zoomAnim = null;

  // At 1x the device fits the stage; zoomed in, the view stays inside it.
  function clampView(v) {
    if (v.z <= 1.001) return { z: 1, cx: sw / 2, cy: sh / 2 };
    var hw = sw / 2 / v.z, hh = sh / 2 / v.z;
    return { z: v.z, cx: clamp(v.cx, hw, sw - hw), cy: clamp(v.cy, hh, sh - hh) };
  }
  function zoomed(v, f, x, y) {
    var wx = (x - sw / 2) / v.z + v.cx, wy = (y - sh / 2) / v.z + v.cy, z = clamp(v.z * f, 1, ZMAX);
    return clampView({ z: z, cx: wx - (x - sw / 2) / z, cy: wy - (y - sh / 2) / z });
  }
  function zoomAbout(f, x, y) {
    if (!E.zoomable) return;
    zoomAnim = null;
    view = zoomed(view, f, x, y);
    viewChanged();
  }
  function zoomTowards(f, x, y) {
    if (!E.zoomable) return;
    var to = zoomed(zoomAnim ? zoomAnim.to : view, f, x, y);
    zoomAnim = { from: view, to: to, t0: now(), dur: reduceMotion ? 0.01 : 0.24 };
    viewChanged();
  }
  function stepZoom(t) {
    var a = zoomAnim, p = Math.min(1, (t - a.t0) / a.dur), e = 1 - Math.pow(1 - p, 3);
    view = { z: a.from.z * Math.pow(a.to.z / a.from.z, e), cx: a.from.cx + (a.to.cx - a.from.cx) * e, cy: a.from.cy + (a.to.cy - a.from.cy) * e };
    if (p >= 1) {
      view = a.to;
      zoomAnim = null;
    }
    viewChanged();
    return true;
  }
  function panBy(dx, dy) {
    view = clampView({ z: view.z, cx: view.cx - dx / view.z, cy: view.cy - dy / view.z });
    viewChanged();
  }
  // Buttons and keys zoom towards the last blow, where the detail is.
  function anchor() {
    if (lastImpact) {
      var p = toStage(lastImpact);
      if (p[0] >= 0 && p[1] >= 0 && p[0] <= sw && p[1] <= sh) return p;
    }
    return [sw / 2, sh / 2];
  }
  function resetView() {
    zoomAnim = null;
    view = { z: 1, cx: sw / 2, cy: sh / 2 };
    viewChanged();
  }

  /* -------------------------------------------------------------- hand */

  // The right hand is drawn by hands.js. At rest the weapon's face sits on
  // the pointer, and the hand swings about the wrist.
  var hand = { x: 0, y: 0, a: 0, s: 1, phase: 'rest', t0: 0, from: 0, queued: false, shown: false, touch: false, soft: false,
               pressAt: 0, strength: 1, perfect: false, fuse: null, w: Hands.weapon('hammer') };
  var handBase = 1, hideTimer = 0, lastImpact = null, sweating = false;

  function setWeapon(id) {
    var w = Hands.weapon(id);
    if (!w) return;
    if (hand.phase === 'wind') lower();
    E.weapon = id;
    hand.w = w;
    handEl.innerHTML = Hands.svg(id);
    handEl.setAttribute('class', 'hand w-' + id);
    placeHand();
  }
  function placeHand() {
    var b = handBase, w = hand.w;
    var tx = hand.x - w.pivot[0] - b * (w.face[0] - w.pivot[0]), ty = hand.y - w.pivot[1] - b * (w.face[1] - w.pivot[1]);
    handEl.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotate(' + hand.a.toFixed(2) + 'deg) scale(' + (hand.s * b).toFixed(3) + ')';
  }
  function showHand(on) {
    clearTimeout(hideTimer);
    if (hand.shown === on) return;
    hand.shown = on;
    handEl.style.opacity = on ? '1' : '0';
  }
  function hideLater() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (hand.phase === 'rest') showHand(false); }, 700);
  }
  function moveHand(x, y) {
    hand.x = x;
    hand.y = y;
    placeHand();
    if (E.hooks.pointer) E.hooks.pointer(x, y, hand.shown);
  }
  function setSweat(on) {
    if (on === sweating) return;
    sweating = on;
    handEl.classList.toggle('sweat', on);
  }

  // Press to lift, release to strike. The weapon keeps rising while the
  // press lasts, and the height it reaches sets the blow: a quick click is
  // a tap, a long hold a smash. Held far too long, it hits the player.
  function lift(w, dt) {
    var f = clamp(dt / w.full, 0, 1);
    return w.lift * (0.34 * (1 - Math.pow(1 - Math.min(1, f / 0.14), 2)) + 0.66 * Math.pow(clamp((f - 0.14) / 0.86, 0, 1), 0.8));
  }
  function windUp() {
    if (E.locked || (E.hooks.canPress && E.hooks.canPress(hand.w.id) === false)) return false;
    hand.phase = 'wind';
    hand.t0 = hand.pressAt = now();
    hand.from = hand.a;
    hand.queued = false;
    if (hand.w.fuse) hand.fuse = Sound.fuse();
    request();
    return true;
  }
  function release() {
    if (hand.phase !== 'wind') return;
    var w = hand.w, dt = now() - hand.t0;
    hand.strength = w.id === 'finger' ? 0.3 : clamp((lift(w, dt) / w.lift - 0.2) / 0.8, 0, 1);
    hand.perfect = w.id !== 'finger' && dt >= w.full && dt <= w.full + 0.22;
    if (hand.perfect) hand.strength = 1;
    if (hand.a < w.lift * 0.28) hand.queued = true;
    else strike();
  }
  function strike() {
    hand.phase = 'strike';
    hand.t0 = now();
    hand.from = hand.a;
    Sound.swing(hand.strength);
    request();
  }
  function lower() {
    if (hand.phase !== 'wind') return;
    if (hand.fuse) { hand.fuse.stop(); hand.fuse = null; }
    hand.phase = 'recoil';
    hand.t0 = now();
    hand.from = hand.a;
    hand.soft = true;
    setSweat(false);
    request();
  }

  // Held too long: the weapon comes back at the player.
  function selfHit() {
    var w = hand.w;
    if (hand.fuse) { hand.fuse.stop(); hand.fuse = null; }
    setSweat(false);
    hand.phase = 'recoil';
    hand.t0 = now();
    hand.from = hand.a;
    hand.soft = true;
    ({ hammer: function () { Sound.bonk(); }, fist: function () { Sound.punch(1); }, finger: function () { Sound.poke(); Sound.hurt(); },
       fish: function () { Sound.slap(1); }, banana: function () { Sound.squish(1); }, bomb: function () { Sound.boom(); },
       lightning: function () { Sound.zap(); } })[w.id]();
    if (w.id === 'bomb' || w.id === 'lightning') {
      flash = { t0: now(), a: w.id === 'bomb' ? 0.55 : 0.7, rgb: w.id === 'bomb' ? '255,170,80' : '255,255,235' };
    }
    if (w.id === 'lightning') {
      handEl.classList.add('xray');
      setTimeout(function () { handEl.classList.remove('xray'); }, 650);
    }
    shakeBy(w.id === 'bomb' ? 16 : 9, 0.35);
    if (E.hooks.selfHit) E.hooks.selfHit(w.id);
  }

  function stepHand(t) {
    var h = hand, w = h.w, p;
    if (h.phase === 'wind') {
      var dt = t - h.t0;
      h.a = h.from * Math.max(0, 1 - dt / 0.12) + lift(w, dt);
      // At full height the weapon trembles, held back as hard as it goes.
      // Held on and on, it shakes harder and the hand starts to sweat.
      var limit = w.fuse || w.selfAt, warn = Math.max(w.full, limit - 1.6);
      if (dt > w.full && !reduceMotion) h.a += Math.sin(dt * 110) * (1.2 + 4 * clamp((dt - warn) / (limit - warn), 0, 1));
      setSweat(dt > warn);
      if (h.queued && h.a >= w.lift * 0.28) strike();
      else if (dt >= limit) selfHit();
    } else if (h.phase === 'strike') {
      p = Math.min(1, (t - h.t0) / (0.05 + 0.03 * h.from / w.lift));
      h.a = h.from * (1 - p * p);
      if (p >= 1) {
        swingLands();
        h.phase = 'recoil';
        h.t0 = t;
        h.from = 0;
        h.soft = false;
      }
    } else if (h.phase === 'recoil') {
      p = Math.min(1, (t - h.t0) / (h.soft ? 0.12 : 0.18));
      h.a = h.soft ? h.from * (1 - p) : -7 * Math.sin(Math.PI * p);
      if (p >= 1) {
        h.phase = 'rest';
        h.a = 0;
        if (h.touch) hideLater();
      }
    } else {
      return false;
    }
    h.s = 1 + 0.16 * Math.max(0, h.a) / 70;
    placeHand();
    return true;
  }

  // The weapon reaches the device. A bomb is left there with its fuse still
  // burning; everything else lands at once.
  function swingLands() {
    var u = toUnits(hand.x, hand.y), w = hand.w;
    if (w.id === 'bomb') {
      bombs.push({ u: u, at: Math.max(now() + 0.05, hand.pressAt + w.fuse), fuse: hand.fuse || { stop: function () {} } });
      hand.fuse = null;
      if (E.hooks.used) E.hooks.used('bomb');
      request();
      return;
    }
    if (w.id === 'lightning' && E.hooks.used) E.hooks.used('lightning');
    contact({ weapon: w.id, strength: hand.strength, perfect: hand.perfect, u: u });
  }

  function shakeBy(amp, dur) {
    if (!reduceMotion) shake = { t0: now(), amp: amp, dur: dur || 0.22 };
    request();
  }

  /* A blow lands at u, in screen units. The game may say it landed on the
     player's own hand first. Keys fly off the keyboard, the frame dents,
     and on the screen the damage model breaks the glass. */
  function contact(o) {
    var w = o.weapon, s = o.strength, u = o.u, W = dev.W, H = dev.H, t = now(), m = Math.min(W, H);
    var region = regionOf(u);
    var info = { weapon: w, strength: s, perfect: !!o.perfect, u: u, region: region, t: t, keys: [], dent: null, hit: null, placed: !!o.placed };
    if (E.hooks.beforeContact && E.hooks.beforeContact(info) === false) {
      shakeBy(4 * s + 2);
      return info;
    }
    var reach = Hands.weapon(w).reach * m * (0.6 + 0.8 * s), hard = w !== 'fish' && w !== 'banana' && w !== 'finger';
    if (dev.keys && hard && s > 0.3) {
      var most = w === 'bomb' ? 14 : 4;
      dev.keys.slice().sort(function (a, b) { return Math.hypot(a.c[0] - u[0], a.c[1] - u[1]) - Math.hypot(b.c[0] - u[0], b.c[1] - u[1]); }).forEach(function (k) {
        if (!k.gone && info.keys.length < most && Math.hypot(k.c[0] - u[0], (k.c[1] - u[1]) * 2) < reach + 30) {
          k.gone = t;
          info.keys.push(k);
        }
      });
    }
    if ((region === 'body' || region === 'keys') && hard && s > 0.25 && dev.dents.length < 80) {
      info.dent = { x: u[0], y: u[1], r: Math.min(90, reach * (w === 'bomb' ? 0.5 : 0.9)) + 10 * s, seed: (Math.random() * 1e9) >>> 0 };
      dev.dents.push(info.dent);
    }
    if (info.keys.length || info.dent) bodyChanged();

    // A blow on the bezel still breaks the screen, from its edge. A bomb
    // near the screen breaks it too.
    var gu = u, glassHit = region === 'screen', lid = dev.lid;
    if (!glassHit && (region === 'body' || w === 'bomb') && u[0] >= lid[0] - (w === 'bomb' ? reach : 0) && u[1] >= lid[1] - (w === 'bomb' ? reach : 0) &&
        u[0] <= lid[2] + (w === 'bomb' ? reach : 0) && u[1] <= lid[3] + (w === 'bomb' ? reach : 0)) {
      gu = [clamp(u[0], W * 0.01, W * 0.99), clamp(u[1], H * 0.01, H * 0.99)];
      glassHit = hard;
      if (w !== 'bomb') s *= 0.8;
    }
    var total = settled.length + active.length;
    if (glassHit && total < E.maxHits) {
      info.hit = S.Damage.make({ x: gu[0], y: gu[1], W: W, H: H, seed: (Math.random() * 4294967296) >>> 0, t0: t, device: dev.type, px: place.k,
                                 strength: s, first: total === 0, weapon: w, glass: glassNet });
      active.push(info.hit);
      lastImpact = info.hit.P;
    }
    info.onScreen = !!info.hit;
    if (w === 'lightning') {
      var top = toUnits(0, 0)[1] - 40, path = info.hit && info.hit.bolt ? info.hit.bolt.main.slice() : [], forks = info.hit && info.hit.bolt ? info.hit.bolt.forks : [];
      if (!path.length) {
        for (var i = 0; i <= 12; i++) path.push([u[0] + (Math.random() - 0.5) * m * 0.06 * (1 - i / 12), u[1] * i / 12]);
      }
      path.unshift([path[0][0] + (Math.random() - 0.5) * m * 0.05, Math.min(top, path[0][1] - 40)]);
      bolts.push({ t0: t, main: path, forks: forks });
      flash = { t0: t, a: 0.45, rgb: '255,255,235' };
    }
    if (w === 'bomb') flash = { t0: t, a: 0.4, rgb: '255,170,80' };

    // Sound and shake, by weapon.
    ({ finger: function () { Sound.poke(); },
       fist: function () { Sound.punch(s); if (info.hit && s > 0.3) Sound.hit(s * 0.6, true); },
       hammer: function () { Sound.hit(s, !!info.hit); },
       fish: function () { Sound.slap(s); },
       banana: function () { Sound.squish(s); },
       bomb: function () { Sound.boom(); },
       lightning: function () { Sound.zap(); if (info.hit) Sound.hit(0.7, true); } })[w]();
    if (info.keys.length) Sound.keyPop();
    if (info.dent) Sound.dent(s);
    shakeBy(w === 'bomb' ? 16 : w === 'lightning' ? 10 : info.hit ? 7 * s : 3 * s, w === 'bomb' ? 0.45 : 0.22);
    if (E.hooks.contact) E.hooks.contact(info);
    updateCaption(settled.length + active.length, !!info.hit);
    request();
    return info;
  }

  /* ------------------------------------------------------------- input */

  var pointers = new Map(), pinch = null, press = null;
  var gesture = { active: function () { return !!pinch || !!(press && press.moved); } };

  function local(e) {
    var r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function pinchState() {
    var p = Array.from(pointers.values());
    return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }

  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  stage.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || e.target.closest('button, input, a, .sheet, .victory')) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    stage.focus({ preventScroll: true });
    Sound.ensure();
    if (E.hooks.wake) E.hooks.wake();
    var p = local(e);
    pointers.set(e.pointerId, { x: p[0], y: p[1] });
    hand.touch = e.pointerType !== 'mouse';
    if (pointers.size === 1) {
      press = { id: e.pointerId, x: p[0], y: p[1], moved: false };
      moveHand(p[0], p[1]);
      if (E.hooks.press && E.hooks.press(p[0], p[1]) === false) return;
      showHand(true);
      windUp();
    } else if (pointers.size === 2 && E.zoomable) {
      press = null;
      lower();
      pinch = pinchState();
    }
  });
  stage.addEventListener('pointermove', function (e) {
    var p = local(e), q = pointers.get(e.pointerId);
    if (!q) {
      if (e.pointerType === 'mouse' && E.mode !== 'title') {
        showHand(true);
        moveHand(p[0], p[1]);
      }
      return;
    }
    var dx = p[0] - q.x, dy = p[1] - q.y;
    q.x = p[0];
    q.y = p[1];
    if (pointers.size === 2 && pinch) {
      var n = pinchState();
      panBy(n.x - pinch.x, n.y - pinch.y);
      if (pinch.d > 0 && n.d > 0) zoomAbout(n.d / pinch.d, n.x, n.y);
      pinch = n;
      return;
    }
    if (!press || e.pointerId !== press.id) return;
    // Zoomed in, a drag moves the view instead of aiming the weapon.
    if (!press.moved && view.z > 1 && Math.hypot(p[0] - press.x, p[1] - press.y) > 6) {
      press.moved = true;
      lower();
    }
    if (press.moved) panBy(dx, dy);
    else moveHand(p[0], p[1]);
  });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (press && e.pointerId === press.id) {
      if (e.type === 'pointerup' && !press.moved) release();
      else lower();
      press = null;
      viewChanged();
    }
    if (hand.touch && !pointers.size && hand.phase === 'rest') hideLater();
  }
  stage.addEventListener('pointerup', pointerEnd);
  stage.addEventListener('pointercancel', pointerEnd);
  stage.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && !pointers.size && E.mode !== 'title') {
      showHand(false);
      if (E.hooks.pointer) E.hooks.pointer(hand.x, hand.y, false);
    }
  });

  // Mouse wheels send big steps, animated. Trackpads send small ones, and a
  // pinch arrives as a wheel event with ctrlKey set; both apply at once.
  stage.addEventListener('wheel', function (e) {
    if (!E.zoomable) return;
    e.preventDefault();
    var p = local(e), dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
    if (e.ctrlKey) zoomAbout(Math.exp(-dy * 0.01), p[0], p[1]);
    else if (Math.abs(dy) >= 50 && e.deltaX === 0) zoomTowards(Math.exp(-dy * 0.003), p[0], p[1]);
    else zoomAbout(Math.exp(-dy * 0.004), p[0], p[1]);
  }, { passive: false });
  // Safari on a Mac reports a trackpad pinch as gesture events.
  var gestureScale = 1;
  stage.addEventListener('gesturestart', function (e) { e.preventDefault(); gestureScale = 1; });
  stage.addEventListener('gesturechange', function (e) {
    e.preventDefault();
    var p = local(e);
    zoomAbout(e.scale / gestureScale, p[0], p[1]);
    gestureScale = e.scale;
  });
  stage.addEventListener('gestureend', function (e) { e.preventDefault(); });

  stage.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target !== stage) return;
    var step = e.shiftKey ? 48 : 12, k = e.key;
    if (k.indexOf('Arrow') === 0) {
      e.preventDefault();
      if (!hand.shown) showHand(true);
      moveHand(clamp(hand.x + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0), 0, sw),
               clamp(hand.y + (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0), 0, sh));
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat || hand.phase !== 'rest') return;
      Sound.ensure();
      if (E.hooks.wake) E.hooks.wake();
      hand.touch = false;
      if (E.hooks.press && E.hooks.press(hand.x, hand.y) === false) return;
      showHand(true);
      windUp();
    } else if (k === '+' || k === '=') {
      e.preventDefault();
      zoomTowards(2, hand.x, hand.y);
    } else if (k === '-' || k === '_') {
      e.preventDefault();
      zoomTowards(0.5, hand.x, hand.y);
    } else if (k === '0') {
      e.preventDefault();
      zoomTowards(1 / view.z, sw / 2, sh / 2);
    }
  });
  stage.addEventListener('keyup', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      release();
    }
  });

  /* ----------------------------------------------------------- devices */

  var recent = [], lastType = null;
  var caption = document.getElementById('caption'), status = document.getElementById('status');

  function chooseType() {
    var w = sh > sw * 1.05 ? { phone: 0.45, tablet: 0.3, laptop: 0.12, monitor: 0.13 } : { phone: 0.2, tablet: 0.2, laptop: 0.3, monitor: 0.3 };
    if (lastType) w[lastType] *= 0.25;
    var total = 0, k;
    for (k in w) total += w[k];
    var x = Math.random() * total;
    for (k in w) {
      x -= w[k];
      if (x <= 0) return k;
    }
    return 'laptop';
  }

  // want: { device, scene, seed, orient }, each optional.
  function newDevice(want) {
    want = want || {};
    var type = NAMES[want.device] ? want.device : chooseType();
    var portrait = type !== 'tablet' || (want.orient ? want.orient === 'portrait' : Math.random() < (sh > sw ? 0.8 : 0.3));
    bombs.forEach(function (b) { b.fuse.stop(); });
    dev = makeDevice(type, portrait);
    glassNet = S.Damage.glass(dev.W, dev.H, { radius: dev.radius, notch: dev.notch });
    lastType = type;
    var options = S.scenes.filter(function (sc) { return sc.fits.indexOf(type) >= 0 && recent.indexOf(sc.id) < 0; });
    // want.sceneObj is a picture of the visitor's own, from game.js.
    var scene = want.sceneObj || S.scenes.filter(function (sc) { return sc.id === want.scene && sc.fits.indexOf(type) >= 0; })[0] ||
                options[Math.floor(Math.random() * options.length)];
    if (!want.sceneObj) recent.push(scene.id);
    if (recent.length > 5) recent.shift();
    pic = { scene: scene, seed: want.seed || (Math.random() * 4294967296) >>> 0, device: type, time: new Date() };
    settled = [];
    active = [];
    bombs = [];
    bolts = [];
    flash = null;
    lastImpact = null;
    zoomAnim = null;
    shake = null;
    E.offset = [0, 0];
    canvas.style.transform = '';
    layout();
    updateCaption(0, false);
    updateZoomUI();
    if (E.hooks.device) E.hooks.device(dev);
    request();
  }

  function updateCaption(hits, announce) {
    if (E.mode !== 'fun') return;
    var text = 'A ' + NAMES[dev.type] + ' showing ' + pic.scene.label + '.';
    if (hits >= E.maxHits) text = 'This ' + NAMES[dev.type] + ' has had enough. Try a new device.';
    else if (hits) text += ' ' + hits + (hits === 1 ? ' hit.' : ' hits.');
    caption.textContent = text;
    if (announce) status.textContent = hits >= E.maxHits ? text : 'Hit ' + hits + '. The screen cracks.';
  }

  /* ---------------------------------------------------------- controls */

  var zoomIn = document.getElementById('zoom-in'), zoomOut = document.getElementById('zoom-out'), zoomFit = document.getElementById('zoom-fit');
  function updateZoomUI() {
    var z = zoomAnim ? zoomAnim.to.z : view.z;
    zoomFit.textContent = (z < 9.95 ? Math.round(z * 10) / 10 : Math.round(z)) + '×';
    zoomOut.disabled = zoomFit.disabled = z <= 1.001;
    zoomIn.disabled = z >= ZMAX - 0.001;
  }
  zoomIn.addEventListener('click', function () { var p = anchor(); zoomTowards(2, p[0], p[1]); });
  zoomOut.addEventListener('click', function () { var p = anchor(); zoomTowards(0.5, p[0], p[1]); });
  zoomFit.addEventListener('click', function () { zoomTowards(1 / view.z, sw / 2, sh / 2); });

  /* --------------------------------------------------------- the engine */

  // A picture of the device as it was before any blow, the size of the
  // stage canvas: for the screen that mends itself.
  function cleanImage() {
    var c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    var g = c.getContext('2d');
    setUnits(g, view);
    g.save();
    screenPath(g, dev);
    g.clip();
    S.drawPicture(g, dev.W, dev.H, pic);
    sheen(g, dev);
    g.restore();
    drawOverlay(g, dev);
    return c;
  }

  // A small picture of one piece of glass as it flies off: the picture and
  // settled damage behind it, cut to its outline. Sizes are in CSS pixels.
  function chipImage(poly) {
    if (!cacheView) return null;
    var s = dpr * cacheView.z * place.k, tx = dpr * ((place.ox - cacheView.cx) * cacheView.z + sw / 2), ty = dpr * ((place.oy - cacheView.cy) * cacheView.z + sh / 2);
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    poly.forEach(function (p) {
      var x = p[0] * s + tx, y = p[1] * s + ty;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
    var w = Math.max(2, Math.ceil(x1) + 1 - x0), h = Math.max(2, Math.ceil(y1) + 1 - y0);
    if (w > 600 || h > 600) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    g.beginPath();
    poly.forEach(function (p, i) {
      var x = p[0] * s + tx - x0, y = p[1] * s + ty - y0;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.closePath();
    g.save();
    g.clip();
    g.drawImage(flat, -x0, -y0);
    g.fillStyle = 'rgba(210,225,255,0.18)';
    g.fillRect(0, 0, w, h);
    g.restore();
    g.strokeStyle = 'rgba(240,246,255,0.95)';
    g.lineWidth = Math.max(1, dpr);
    g.stroke();
    var cx = 0, cy = 0;
    poly.forEach(function (p) { cx += p[0]; cy += p[1]; });
    var st = toStage([cx / poly.length, cy / poly.length]);
    return { canvas: c, w: w / dpr, h: h / dpr, x: st[0], y: st[1] };
  }

  E.newDevice = newDevice;
  E.setWeapon = setWeapon;
  E.request = request;
  E.toStage = toStage;
  E.toUnits = toUnits;
  E.shake = shakeBy;
  E.cleanImage = cleanImage;
  E.chipImage = chipImage;
  E.resetView = resetView;
  E.layout = function () { layout(); updateZoomUI(); request(); };
  E.device = function () { return dev; };
  E.picture = function () { return pic; };
  E.glass = function () { return glassNet; };
  E.hits = function () { return settled.length + active.length; };
  E.hand = function () { return { x: hand.x, y: hand.y, shown: hand.shown, phase: hand.phase }; };
  E.stageSize = function () { return [sw, sh, dpr]; };
  E.scale = function () { return place.k * view.z; };
  E.lower = lower;
  E.hideHand = function () { lower(); showHand(false); };
  E.moveHand = function (x, y) { showHand(true); moveHand(x, y); };
  // The title screen swings by itself: aim, lift for hold seconds, strike.
  E.autoSwing = function (x, y, hold) {
    if (hand.phase !== 'rest') return;
    showHand(true);
    moveHand(x, y);
    var locked = E.locked;
    E.locked = false;
    if (windUp()) autoAt = now() + hold;
    E.locked = locked;
  };
  E.stopBombs = function () {
    bombs.forEach(function (b) { b.fuse.stop(); });
    bombs = [];
  };
  E.updateCaption = function () { updateCaption(settled.length + active.length, false); };

  /* -------------------------------------------------------------- start */

  if (window.Theme) Theme.wireThemeToggle();
  handBase = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 0.8 : 1;
  setWeapon('hammer');
  handEl.style.opacity = '0';
  layout();

  var resizeTimer = 0;
  function resized() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layout();
      updateZoomUI();
      request();
    }, 60);
  }
  if (window.ResizeObserver) new ResizeObserver(resized).observe(stage);
  else window.addEventListener('resize', resized);
})();
