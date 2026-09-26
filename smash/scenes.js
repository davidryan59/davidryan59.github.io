/* The pictures on the screen before the hammer lands. Every picture is drawn
   here from shapes, so each one is safe for any audience, needs no download
   and differs on every visit.

   A scene draws in the screen's own units: the short side of the screen is
   1000 units long, whatever the device and however large it appears. The
   page redraws the picture whenever the view changes, so a scene must draw
   the same picture from the same seed every time. Nothing here may call
   Math.random. */
(function (global) {
  'use strict';

  var Smash = global.Smash = global.Smash || {};
  var TAU = 2 * Math.PI;
  var SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  var SERIF = 'Georgia, "Times New Roman", serif';

  /* ----------------------------------------------------------- helpers */

  // A small seeded generator (mulberry32). damage.js and smash.js use it too.
  function rng(seed) {
    var s = seed >>> 0;
    function r() {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    r.range = function (a, b) { return a + (b - a) * r(); };
    r.int = function (a, b) { return a + Math.floor((b - a + 1) * r()); };
    r.pick = function (list) { return list[Math.floor(list.length * r())]; };
    r.chance = function (p) { return r() < p; };
    r.normal = function () { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()); };
    return r;
  }

  function roundRect(ctx, x, y, w, h, rad) {
    var m = Math.min(w, h) / 2;
    var a = (Array.isArray(rad) ? rad : [rad, rad, rad, rad]).map(function (v) { return Math.max(0, Math.min(v, m)); });
    ctx.moveTo(x + a[0], y);
    ctx.arcTo(x + w, y, x + w, y + h, a[1]);
    ctx.arcTo(x + w, y + h, x, y + h, a[2]);
    ctx.arcTo(x, y + h, x, y, a[3]);
    ctx.arcTo(x, y, x + w, y, a[0]);
    ctx.closePath();
  }
  function fillRound(ctx, x, y, w, h, rad, style) {
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, rad);
    ctx.fillStyle = style;
    ctx.fill();
  }
  function circle(ctx, x, y, rad, style) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fillStyle = style;
    ctx.fill();
  }

  // Stops are colours spaced evenly, or [offset, colour] pairs.
  function grad(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s, i) {
      if (Array.isArray(s)) g.addColorStop(s[0], s[1]);
      else g.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, s);
    });
    return g;
  }
  function glow(ctx, x, y, rad, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgba(hex, a) {
    var c = hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mix(h1, h2, t) {
    var a = hexRgb(h1), b = hexRgb(h2);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }).join(',') + ')';
  }

  // Midpoint displacement: n + 1 heights in [-1, 1], with n a power of two.
  function ridge(r, n, rough) {
    var h = new Array(n + 1), max = 0, i;
    h[0] = r.range(-1, 1);
    h[n] = r.range(-1, 1);
    for (var step = n; step > 1; step >>= 1) {
      var half = step >> 1, amp = Math.pow(step / n, rough);
      for (i = half; i < n; i += step) h[i] = (h[i - half] + h[i + half]) / 2 + r.range(-1, 1) * amp;
    }
    for (i = 0; i <= n; i++) max = Math.max(max, Math.abs(h[i]));
    for (i = 0; i <= n; i++) h[i] /= max || 1;
    return h;
  }

  function stars(ctx, r, x0, y0, w, h, count, maxSize) {
    for (var i = 0; i < count; i++) {
      var s = r() < 0.92 ? r.range(0.8, 1.8) : r.range(1.8, maxSize || 3.2);
      circle(ctx, x0 + r() * w, y0 + r() * h, s, 'rgba(255,255,255,' + r.range(0.35, 1).toFixed(2) + ')');
    }
  }

  function cloud(ctx, r, x, y, s, color) {
    var n = r.int(4, 6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - s * 4, y - s * 4, s * 8, s * 4 + s * 0.12);
    ctx.clip();
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var cx = x + (i - (n - 1) / 2) * s * 0.55;
      var rad = s * (0.3 + 0.32 * Math.sin(Math.PI * (i + 0.5) / n)) * r.range(0.85, 1.15);
      ctx.moveTo(cx + rad, y - rad * 0.3);
      ctx.arc(cx, y - rad * 0.3, rad, 0, TAU);
    }
    ctx.fillStyle = color || 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------ outdoor scenes */

  var PEAKS = [
    { sky: ['#1b1440', '#a8487a', '#ffb56b'], sun: '#fff3c4', far: '#c0708f', near: '#150b2a' },
    { sky: ['#0d2748', '#5a8fc9', '#ffd9a8'], sun: '#ffffff', far: '#8fa9cc', near: '#0a1a30' },
    { sky: ['#06303a', '#2f8f8d', '#f6d27a'], sun: '#fff7d6', far: '#6aaa9f', near: '#05201f' },
    { sky: ['#2a0f3d', '#e0525d', '#ffd166'], sun: '#fff0b3', far: '#d0707a', near: '#1c0820' }
  ];

  function mountains(ctx, W, H, r) {
    var p = r.pick(PEAKS), m = Math.min(W, H), hz = H * (H > W ? 0.5 : 0.56);
    ctx.fillStyle = grad(ctx, 0, 0, 0, hz, p.sky);
    ctx.fillRect(0, 0, W, H);
    var sx = W * r.range(0.25, 0.75), sy = hz - m * r.range(0.06, 0.22), sr = m * r.range(0.06, 0.1);
    glow(ctx, sx, sy, sr * 7, p.sun, 0.45);
    circle(ctx, sx, sy, sr, p.sun);

    ctx.strokeStyle = rgba(p.near, 0.75);
    ctx.lineWidth = m * 0.004;
    ctx.lineCap = 'round';
    for (var b = r.int(0, 5); b > 0; b--) {
      var bx = sx + r.range(-0.3, 0.3) * W, by = sy - r.range(0.05, 0.25) * m, bw = m * r.range(0.012, 0.022);
      ctx.beginPath();
      ctx.moveTo(bx - bw, by - bw * 0.4);
      ctx.quadraticCurveTo(bx - bw * 0.4, by - bw * 0.5, bx, by);
      ctx.quadraticCurveTo(bx + bw * 0.4, by - bw * 0.5, bx + bw, by - bw * 0.4);
      ctx.stroke();
    }

    var layers = 5, n = 128;
    for (var k = 0; k < layers; k++) {
      var base = hz + (H - hz) * (0.05 + 0.22 * k), amp = m * (0.2 - 0.025 * k);
      var hts = ridge(r, n, 0.75 + 0.1 * k);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var i = 0; i <= n; i++) ctx.lineTo(W * i / n, base - amp * (0.55 + 0.45 * hts[i]));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = mix(p.far, p.near, Math.pow(k / (layers - 1), 0.8));
      ctx.fill();
      if (k < layers - 1) {
        var y0 = base - amp, y1 = base + (H - hz) * 0.2;
        ctx.fillStyle = grad(ctx, 0, y0, 0, y1, [rgba(p.sky[2], 0), rgba(p.sky[2], 0.18)]);
        ctx.fillRect(0, y0, W, y1 - y0);
      }
    }
  }

  function pine(ctx, x, y, h) {
    var w = h * 0.36;
    ctx.beginPath();
    for (var t = 0; t < 3; t++) {
      var top = y - h * (1 - t * 0.28), by = y - h * (0.45 - t * 0.2), bw = w * (0.55 + t * 0.25);
      ctx.moveTo(x, top);
      ctx.lineTo(x + bw, by);
      ctx.lineTo(x - bw, by);
      ctx.closePath();
    }
    ctx.rect(x - h * 0.03, y - h * 0.1, h * 0.06, h * 0.12);
    ctx.fill();
  }

  function aurora(ctx, W, H, r) {
    var m = Math.min(W, H), hz = H * (H > W ? 0.7 : 0.68), i;
    ctx.fillStyle = grad(ctx, 0, 0, 0, hz, ['#01030b', '#051528', '#0c3340']);
    ctx.fillRect(0, 0, W, H);
    stars(ctx, r, 0, 0, W, hz, Math.round(W * hz / 2800));

    // Each curtain is a row of thin strips sharing one gradient, drawn in a
    // unit square and stretched by the transform.
    var hue = r.pick([[150, 175, 290], [135, 160, 320], [165, 190, 260]]);
    var unit = ctx.createLinearGradient(0, 1, 0, 0);
    unit.addColorStop(0, 'hsla(' + hue[0] + ',95%,62%,0.55)');
    unit.addColorStop(0.35, 'hsla(' + hue[1] + ',90%,58%,0.22)');
    unit.addColorStop(1, 'hsla(' + hue[2] + ',80%,60%,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = unit;
    for (var k = r.int(2, 3); k > 0; k--) {
      var base = hz * r.range(0.3, 0.62), a1 = m * r.range(0.04, 0.1), tall = m * r.range(0.18, 0.34);
      var f1 = r.range(1.5, 3.5) * Math.PI / W, p1 = r.range(0, TAU);
      var f2 = r.range(5, 9) * Math.PI / W, p2 = r.range(0, TAU);
      var f3 = r.range(3, 8) * Math.PI / W, p3 = r.range(0, TAU);
      for (var x = -4; x < W + 4; x += 4) {
        var y = base + a1 * Math.sin(x * f1 + p1) + a1 * 0.4 * Math.sin(x * f2 + p2);
        var h = tall * (0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(x * f3 + p3), 1.5));
        ctx.save();
        ctx.translate(x, y - h);
        ctx.scale(4.6, h);
        ctx.fillRect(0, 0, 1, 1);
        ctx.restore();
      }
    }

    // A still lake below the hills catches a little of the light.
    var lake = hz + (H - hz) * 0.3;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad(ctx, 0, lake, 0, H, ['#06202a', '#020a10']);
    ctx.fillRect(0, lake, W, H - lake);
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 40; i++) {
      ctx.fillStyle = 'hsla(' + hue[0] + ',80%,55%,' + r.range(0.04, 0.14).toFixed(3) + ')';
      ctx.fillRect(r.range(-0.1, 0.9) * W, r.range(lake, H), W * r.range(0.05, 0.3), m * 0.004);
    }
    ctx.globalCompositeOperation = 'source-over';

    var n = 64, hills = ridge(r, n, 0.6);
    function hillY(x) {
      var f = Math.max(0, Math.min(n, x / W * n)), j = Math.min(n - 1, Math.floor(f)), t = f - j;
      return hz - m * 0.05 * (0.5 + 0.5 * (hills[j] * (1 - t) + hills[j + 1] * t));
    }
    ctx.fillStyle = '#02080c';
    ctx.beginPath();
    ctx.moveTo(0, lake);
    for (i = 0; i <= n; i++) ctx.lineTo(W * i / n, hillY(W * i / n));
    ctx.lineTo(W, lake);
    ctx.closePath();
    ctx.fill();
    for (i = Math.round(W / 30); i > 0; i--) {
      var tx = r() * W;
      pine(ctx, tx, hillY(tx) + m * 0.01, m * r.range(0.04, 0.13));
    }
  }

  function palm(ctx, r, x, y, h, lean) {
    var cx = x + lean * h * 0.35, cy = y - h, w0 = h * 0.05, w1 = h * 0.025, i;
    ctx.fillStyle = '#7a5230';
    ctx.beginPath();
    ctx.moveTo(x - w0, y);
    ctx.quadraticCurveTo(x + lean * h * 0.05 - w0, y - h * 0.6, cx - w1, cy);
    ctx.lineTo(cx + w1, cy);
    ctx.quadraticCurveTo(x + lean * h * 0.05 + w0, y - h * 0.6, x + w0, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,15,0.45)';
    ctx.lineWidth = h * 0.006;
    for (i = 1; i < 14; i++) {
      var t = i / 14, u = 1 - t;
      var px = u * u * x + 2 * u * t * (x + lean * h * 0.05) + t * t * cx;
      var py = u * u * y + 2 * u * t * (y - h * 0.6) + t * t * cy, hw = w0 + (w1 - w0) * t;
      ctx.beginPath();
      ctx.moveTo(px - hw, py);
      ctx.lineTo(px + hw, py + hw * 0.3);
      ctx.stroke();
    }
    var greens = ['#1f7a43', '#2a9453', '#16633a'];
    for (i = 0; i < 8; i++) {
      var a = -Math.PI / 2 + (i - 3.5) * 0.42 + r.range(-0.1, 0.1), L = h * r.range(0.42, 0.58);
      var dx = Math.cos(a), dy = Math.sin(a);
      var tipx = cx + dx * L, tipy = cy + dy * L * 0.55 + L * 0.4;
      var mx = cx + dx * L * 0.55, my = cy + dy * L * 0.55 - L * 0.1, nx = -dy, ny = dx, w = L * 0.13;
      ctx.fillStyle = greens[i % 3];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(mx + nx * w, my + ny * w, tipx, tipy);
      ctx.quadraticCurveTo(mx - nx * w, my - ny * w, cx, cy);
      ctx.fill();
    }
    for (i = 0; i < 3; i++) circle(ctx, cx + (i - 1) * h * 0.035, cy + h * 0.03, h * 0.028, '#5a3a1c');
  }

  function beach(ctx, W, H, r) {
    var m = Math.min(W, H), hz = H * (H > W ? 0.42 : 0.46), shore = H * (H > W ? 0.7 : 0.72), i, x;
    ctx.fillStyle = grad(ctx, 0, 0, 0, hz, ['#2f9fe3', '#7fcbf2', '#dff4ff']);
    ctx.fillRect(0, 0, W, hz + 2);
    var sx = W * r.range(0.6, 0.85), sy = hz * r.range(0.25, 0.5);
    glow(ctx, sx, sy, m * 0.4, '#fff6d5', 0.6);
    circle(ctx, sx, sy, m * 0.06, '#fffbe8');
    for (i = r.int(2, 4); i > 0; i--) cloud(ctx, r, W * r.range(0, 1), hz * r.range(0.2, 0.75), m * r.range(0.08, 0.15));

    ctx.fillStyle = grad(ctx, 0, hz, 0, shore, ['#0b5f96', '#138fbf', '#3fc8d4']);
    ctx.fillRect(0, hz, W, shore - hz + m * 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (i = 0; i < 80; i++) {
      var gy = r.range(hz, shore), spread = 1 + (gy - hz) / (shore - hz) * 2;
      ctx.fillRect(sx + r.normal() * m * 0.05 * spread, gy, m * r.range(0.01, 0.03), m * 0.003);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = m * 0.003;
    for (i = 0; i < 6; i++) {
      var wy = hz + (shore - hz) * (0.35 + i * 0.11), ph = r.range(0, TAU);
      ctx.beginPath();
      for (x = 0; x <= W; x += 20) {
        var yy = wy + m * 0.004 * Math.sin(x * 0.03 + ph);
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    // A far-off sailing boat.
    var bx = W * r.range(0.1, 0.5), by = hz + m * 0.012, bs = m * 0.03;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx, by - bs * 1.6);
    ctx.lineTo(bx + bs * 0.7, by - bs * 0.2);
    ctx.lineTo(bx, by - bs * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8584f';
    ctx.fillRect(bx - bs * 0.5, by - bs * 0.2, bs * 1.3, bs * 0.25);

    var amp = m * 0.012, f = r.range(2, 4) * Math.PI / W, ph2 = r.range(0, TAU);
    function edge(x) { return shore + amp * Math.sin(x * f + ph2); }
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (x = 0; x <= W; x += 10) ctx.lineTo(x, edge(x));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, shore, 0, H, ['#f3dcae', '#e8c27f']);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,120,60,0.18)';
    ctx.beginPath();
    for (x = 0; x <= W; x += 10) ctx.lineTo(x, edge(x));
    for (x = W; x >= 0; x -= 10) ctx.lineTo(x, edge(x) + m * 0.035);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = m * 0.01;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (x = 0; x <= W; x += 10) {
      if (x === 0) ctx.moveTo(x, edge(x) - m * 0.004); else ctx.lineTo(x, edge(x) - m * 0.004);
    }
    ctx.stroke();

    var left = r.chance(0.5);
    palm(ctx, r, left ? W * 0.14 : W * 0.86, H * 0.93, m * (H > W ? 0.75 : 0.62), left ? 1 : -1);

    // A beach ball on the sand.
    var cx = left ? W * r.range(0.55, 0.75) : W * r.range(0.25, 0.45), cy = shore + (H - shore) * 0.55, R = m * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ['#ffffff', '#e63946', '#ffffff', '#ffbe0b', '#ffffff', '#1d7fe0'].forEach(function (c, k) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 0.25);
      ctx.arc(cx, cy - R * 0.25, R * 2, k * TAU / 6, (k + 1) * TAU / 6);
      ctx.closePath();
      ctx.fill();
    });
    glow(ctx, cx - R * 0.35, cy - R * 0.4, R * 0.8, '#ffffff', 0.5);
    ctx.restore();
  }

  var FISH = [
    { body: '#ff8a1f', fin: '#ff9d3f', band: '#ffffff', edge: '#1b1b1b' },
    { body: '#1e6fe0', fin: '#ffd23f', band: null, edge: '#0b2f66' },
    { body: '#ffd23f', fin: '#ffc300', band: null, edge: '#8a6400' },
    { body: '#b554d6', fin: '#ff8fd0', band: null, edge: '#5c1f73' },
    { body: '#3ecf8e', fin: '#1f9e6a', band: '#c9ffe5', edge: '#0f5c3c' },
    { body: '#ff5d73', fin: '#ffb3c0', band: null, edge: '#7a1f2d' }
  ];

  function fish(ctx, x, y, s, dir, f) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * s, s);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = f.edge;
    ctx.fillStyle = f.fin;
    ctx.beginPath();
    ctx.moveTo(-0.75, 0);
    ctx.lineTo(-1.4, -0.5);
    ctx.quadraticCurveTo(-1.2, 0, -1.4, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.45);
    ctx.quadraticCurveTo(-0.05, -0.98, 0.35, -0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 0.58, 0, 0, TAU);
    ctx.fillStyle = f.body;
    ctx.fill();
    if (f.band) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = f.band;
      ctx.lineWidth = 0.07;
      [-0.35, 0.32].forEach(function (bx) {
        ctx.beginPath();
        ctx.ellipse(bx, 0, 0.13, 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 0.58, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = f.fin;
    ctx.beginPath();
    ctx.ellipse(0.05, 0.2, 0.28, 0.12, 0.5, 0, TAU);
    ctx.fill();
    circle(ctx, 0.55, -0.12, 0.17, '#ffffff');
    circle(ctx, 0.6, -0.12, 0.09, '#111111');
    circle(ctx, 0.63, -0.16, 0.035, '#ffffff');
    ctx.restore();
  }

  function seaweed(ctx, r, x, y, h, color) {
    var f = r.range(3, 6) / h, p = r.range(0, TAU), a = h * r.range(0.04, 0.08);
    ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? 'rgba(255,255,255,0.15)' : color;
      ctx.lineWidth = h * (pass ? 0.018 : 0.045);
      ctx.beginPath();
      for (var i = 0; i <= 20; i++) {
        var t = i / 20, yy = y - h * t, xx = x + a * Math.sin(yy * f + p) * t;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  function coral(ctx, r, x, y, len, ang, width, depth, color) {
    var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (depth > 0) {
      for (var i = r.int(2, 3); i > 0; i--) {
        coral(ctx, r, x2, y2, len * r.range(0.6, 0.8), ang + r.range(-0.6, 0.6), width * 0.75, depth - 1, color);
      }
    } else {
      circle(ctx, x2, y2, width * 0.8, color);
    }
  }

  function underwater(ctx, W, H, r) {
    var m = Math.min(W, H), floor = H * 0.84, i, x;
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, ['#3fd0f5', '#1283c4', '#07457a', '#052e55']);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (i = r.int(5, 8); i > 0; i--) {
      var rx = r.range(-0.1, 1.1) * W, rw = m * r.range(0.04, 0.12), dx = m * r.range(0.1, 0.4) * (r.chance(0.5) ? 1 : -1);
      var len = H * r.range(0.5, 0.9);
      ctx.fillStyle = grad(ctx, 0, 0, 0, len, ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']);
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + rw, 0);
      ctx.lineTo(rx + rw * 2.5 + dx, len);
      ctx.lineTo(rx + dx, len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(5,40,75,0.55)';
    ctx.beginPath();
    ctx.moveTo(0, floor);
    for (x = 0; x <= W; x += W / 16) ctx.lineTo(x, floor - m * r.range(0.04, 0.16));
    ctx.lineTo(W, floor);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, H);
    for (x = 0; x <= W; x += 20) ctx.lineTo(x, floor + m * 0.012 * Math.sin(x * 0.01));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, floor, 0, H, ['#e9d3a0', '#c9ab70']);
    ctx.fill();
    for (i = 0; i < 25; i++) {
      ctx.fillStyle = r.pick(['#b8995e', '#d8c08c', '#a88a56']);
      ctx.beginPath();
      ctx.ellipse(r() * W, r.range(floor + m * 0.03, H), m * r.range(0.006, 0.016), m * r.range(0.004, 0.01), 0, 0, TAU);
      ctx.fill();
    }

    for (i = r.int(2, 4); i > 0; i--) {
      coral(ctx, r, r() * W, floor + m * 0.02, m * r.range(0.05, 0.09), -Math.PI / 2 + r.range(-0.3, 0.3),
            m * r.range(0.014, 0.022), r.int(2, 3), r.pick(['#ff6b6b', '#ff922b', '#f06595', '#cc5de8']));
    }
    for (i = r.int(6, 12); i > 0; i--) {
      seaweed(ctx, r, r() * W, floor + m * 0.03, m * r.range(0.15, 0.4), r.pick(['#2f9e44', '#40c057', '#087f5b', '#5c940d']));
    }
    for (i = r.int(6, 12); i > 0; i--) {
      fish(ctx, r() * W, r.range(0.1, 0.78) * H, m * r.range(0.025, 0.065), r.chance(0.5) ? 1 : -1, r.pick(FISH));
    }
    ctx.lineWidth = m * 0.0035;
    for (i = r.int(15, 35); i > 0; i--) {
      var bxx = r() * W, byy = r() * floor, br = m * r.range(0.005, 0.018);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(bxx, byy, br, 0, TAU);
      ctx.stroke();
      circle(ctx, bxx - br * 0.35, byy - br * 0.35, br * 0.25, 'rgba(255,255,255,0.7)');
    }
  }

  function space(ctx, W, H, r) {
    var m = Math.min(W, H), big = Math.max(W, H), i;
    ctx.fillStyle = '#03030c';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var neb = ['#7b2ff7', '#2f6bff', '#ff3d8b', '#00c2a8', '#ff8c42'];
    for (i = r.int(4, 7); i > 0; i--) glow(ctx, r() * W, r() * H, big * r.range(0.25, 0.55), r.pick(neb), r.range(0.12, 0.28));
    ctx.globalCompositeOperation = 'source-over';
    stars(ctx, r, 0, 0, W, H, Math.round(W * H / 2200), 3);
    for (i = r.int(5, 10); i > 0; i--) {
      var x = r() * W, y = r() * H, s = m * r.range(0.008, 0.018);
      glow(ctx, x, y, s * 3, '#cfe3ff', 0.5);
      ctx.strokeStyle = 'rgba(220,235,255,0.8)';
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(x - s * 2.5, y);
      ctx.lineTo(x + s * 2.5, y);
      ctx.moveTo(x, y - s * 2.5);
      ctx.lineTo(x, y + s * 2.5);
      ctx.stroke();
    }

    var R = m * r.range(0.2, 0.3), px = W * r.range(0.3, 0.7), py = H * r.range(0.35, 0.62);
    var tilt = r.range(-0.45, 0.45), flat = r.range(0.24, 0.34), rings = r.chance(0.8);
    var pal = r.pick([['#e9c893', '#c99a5b', '#f3dfb8'], ['#8fb8de', '#5a86b8', '#cfe3f5'],
                      ['#e59a7a', '#b8604a', '#f5c9b0'], ['#b9a3e3', '#7d63c4', '#e0d4f7']]);
    // The far half of the rings goes behind the planet, the near half in front.
    function ringHalf(front) {
      for (var k = 0; k < 7; k++) {
        var rr = R * (1.3 + k * 0.13);
        ctx.strokeStyle = rgba(k % 2 ? pal[2] : pal[1], 0.35 + 0.1 * (k % 3));
        ctx.lineWidth = R * (0.05 + 0.02 * (k % 3));
        ctx.beginPath();
        ctx.ellipse(px, py, rr, rr * flat, tilt, front ? 0 : Math.PI, front ? Math.PI : TAU);
        ctx.stroke();
      }
    }
    if (rings) ringHalf(false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, R, 0, TAU);
    ctx.clip();
    ctx.fillStyle = pal[0];
    ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
    ctx.translate(px, py);
    ctx.rotate(tilt);
    for (var b = -R; b < R; b += R * r.range(0.08, 0.2)) {
      ctx.fillStyle = rgba(r.chance(0.5) ? pal[1] : pal[2], r.range(0.25, 0.6).toFixed(2));
      ctx.fillRect(-R, b, 2 * R, R * r.range(0.04, 0.12));
    }
    ctx.rotate(-tilt);
    ctx.translate(-px, -py);
    var sh = ctx.createRadialGradient(px - R * 0.45, py - R * 0.45, R * 0.1, px, py, R * 1.05);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = sh;
    ctx.fillRect(px - R, py - R, 2 * R, 2 * R);
    ctx.restore();
    if (rings) ringHalf(true);

    for (i = r.int(1, 2); i > 0; i--) {
      var mx = r() * W, my = r() * H, mr = m * r.range(0.02, 0.045);
      circle(ctx, mx, my, mr, '#b9bcc4');
      var ms = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr);
      ms.addColorStop(0, 'rgba(0,0,0,0)');
      ms.addColorStop(1, 'rgba(0,0,0,0.65)');
      circle(ctx, mx, my, mr, ms);
    }
  }

  function synthwave(ctx, W, H, r) {
    var m = Math.min(W, H), hz = H * (H > W ? 0.55 : 0.6), i, j;
    var stops = r.pick([['#0b0221', '#2d0b59', '#b3218f', '#ff7a3d'], ['#050314', '#1f1147', '#7a1fa2', '#ff4f8b'],
                        ['#02111f', '#10305c', '#6d2e9e', '#ff5e7e']]);
    var sky = grad(ctx, 0, 0, 0, hz, stops);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz);
    stars(ctx, r, 0, 0, W, hz * 0.55, Math.round(W * hz / 9000));

    var R = m * 0.27, cx = W / 2, cy = hz - R * 0.28;
    glow(ctx, cx, cy, R * 2.4, '#ff4fa3', 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ctx.fillStyle = grad(ctx, 0, cy - R, 0, cy + R, ['#fff27a', '#ffb347', '#ff4f8b', '#d4148f']);
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // The stripes cut through to the sky, so they reuse its gradient.
    ctx.fillStyle = sky;
    for (i = 0; i < 7; i++) ctx.fillRect(cx - R, cy + R * (0.05 + i * 0.14), 2 * R, R * (0.015 + i * 0.012));
    ctx.restore();

    [[-0.05, 0.4], [0.6, 1.05]].forEach(function (span) {
      var x0 = W * span[0], x1 = W * span[1], n = r.int(4, 7), pts = [[x0, hz]];
      for (var k = 1; k < n; k++) pts.push([x0 + (x1 - x0) * (k / n + r.range(-0.04, 0.04)), hz - m * r.range(0.06, 0.2)]);
      pts.push([x1, hz]);
      ctx.beginPath();
      pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fillStyle = '#1a0838';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,61,242,0.45)';
      ctx.lineWidth = m * 0.002;
      ctx.beginPath();
      for (k = 1; k < pts.length - 1; k++) {
        ctx.moveTo(pts[k][0], pts[k][1]);
        ctx.lineTo((pts[k][0] + pts[k + 1][0]) / 2, hz);
      }
      ctx.stroke();
      ctx.strokeStyle = '#ff3df2';
      ctx.lineWidth = m * 0.003;
      ctx.beginPath();
      pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    });

    ctx.fillStyle = grad(ctx, 0, hz, 0, H, ['#1b0433', '#07010f']);
    ctx.fillRect(0, hz, W, H - hz);
    var line = r.pick(['#ff38e0', '#28e7ff']);
    [[m * 0.012, 0.18], [m * 0.003, 0.95]].forEach(function (pass) {
      ctx.strokeStyle = rgba(line, pass[1]);
      ctx.lineWidth = pass[0];
      ctx.beginPath();
      for (i = 1; i <= 16; i++) {
        var y = hz + (H - hz) * Math.pow(i / 16, 2.2);
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      for (j = -24; j <= 24; j++) {
        ctx.moveTo(cx + j * m * 0.012, hz);
        ctx.lineTo(cx + j * m * 0.3, H);
      }
      ctx.stroke();
    });
    ctx.fillStyle = grad(ctx, 0, hz, 0, hz + (H - hz) * 0.35, [rgba(stops[3], 0.6), rgba(stops[3], 0)]);
    ctx.fillRect(0, hz, W, (H - hz) * 0.35);
    ctx.fillStyle = rgba(stops[3], 0.9);
    ctx.fillRect(0, hz - m * 0.002, W, m * 0.004);
  }

  /* ------------------------------------------------------- playful scenes */

  var HERO = [
    '....XXXX....',
    '..XXXXXXXX..',
    '.XXXXXXXXXX.',
    '.XXWWXXWWXX.',
    'XXXWBXXWBXXX',
    'XXXWBXXWBXXX',
    'XXXXXXXXXXXX',
    'XXXXMMMMXXXX',
    '.XXXXMMXXXX.',
    '..XXXXXXXX..',
    '..FF....FF..'
  ];
  var SLIME = [
    '...GGGG...',
    '..GGGGGG..',
    '.GWBGGWBG.',
    'GGWBGGWBGG',
    'GGGGGGGGGG',
    'GGDGGGGDGG',
    '.GG.GG.GG.'
  ];
  var HEART = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];

  function sprite(ctx, rows, x, y, p, colors) {
    for (var j = 0; j < rows.length; j++) {
      for (var i = 0; i < rows[j].length; i++) {
        var c = colors[rows[j].charAt(i)];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x + i * p, y + j * p, p + 0.4, p + 0.4);
      }
    }
  }

  function tile(ctx, kind, x, y, T, p) {
    if (kind === 'brick') {
      ctx.fillStyle = '#c0582b';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#6e2a10';
      for (var row = 0; row < 4; row++) {
        ctx.fillRect(x, y + row * 4 * p, T, p);
        var off = row % 2 ? 4 * p : 0;
        for (var c = off; c < T; c += 8 * p) ctx.fillRect(x + c, y + row * 4 * p, p, 4 * p);
      }
      ctx.fillStyle = '#e07a45';
      ctx.fillRect(x, y + p, T, p * 0.6);
      return;
    }
    if (kind === 'gem') {
      ctx.fillStyle = '#8a5a00';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#f2b705';
      ctx.fillRect(x + p, y + p, T - 2 * p, T - 2 * p);
      ctx.fillStyle = '#8a5a00';
      [[2, 2], [13, 2], [2, 13], [13, 13]].forEach(function (q) { ctx.fillRect(x + q[0] * p, y + q[1] * p, p, p); });
      ctx.fillStyle = '#fff4c2';
      ctx.beginPath();
      ctx.moveTo(x + 8 * p, y + 3 * p);
      ctx.lineTo(x + 12 * p, y + 8 * p);
      ctx.lineTo(x + 8 * p, y + 13 * p);
      ctx.lineTo(x + 4 * p, y + 8 * p);
      ctx.closePath();
      ctx.fill();
      return;
    }
    ctx.fillStyle = kind === 'grass' ? '#b5652b' : '#a85b27';
    ctx.fillRect(x, y, T + 0.4, T + 0.4);
    ctx.fillStyle = '#8f4a1c';
    [[3, 7], [10, 5], [6, 12], [12, 11], [2, 14]].forEach(function (q) { ctx.fillRect(x + q[0] * p, y + q[1] * p, 2 * p, 2 * p); });
    if (kind === 'grass') {
      ctx.fillStyle = '#46b84a';
      ctx.fillRect(x, y, T + 0.4, 4 * p);
      ctx.fillStyle = '#2e8f3a';
      for (var k = 0; k < 16; k += 3) ctx.fillRect(x + k * p, y + 4 * p, p, p * (k % 2 ? 2 : 1));
    }
  }

  function coin(ctx, x, y, p) {
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.ellipse(x, y, 3 * p, 4 * p, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.ellipse(x, y, 2.2 * p, 3.2 * p, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3bf';
    ctx.fillRect(x - 0.8 * p, y - 2 * p, 0.9 * p, 3 * p);
  }

  function pixelGame(ctx, W, H, r) {
    var T = Math.min(W, H) / (H > W ? 10 : 12), p = T / 16, i, k;
    var cols = Math.ceil(W / T), ground = H > W ? 3 : 2, gy = H - ground * T;
    ctx.fillStyle = grad(ctx, 0, 0, 0, gy, ['#5aa9ff', '#a7dbff']);
    ctx.fillRect(0, 0, W, H);

    for (i = r.int(3, 5); i > 0; i--) {
      var cx = r() * W, cy = r.range(0.1, 0.45) * gy, u = 4 * p;
      ctx.fillStyle = '#ffffff';
      [[-3, 0, 7, 2], [-2, -1, 5, 1], [0, -2, 2, 1], [-4, 1, 9, 1]].forEach(function (q) {
        ctx.fillRect(cx + q[0] * u, cy + q[1] * u, q[2] * u, q[3] * u);
      });
      ctx.fillStyle = '#d6ecff';
      ctx.fillRect(cx - 4 * u, cy + 2 * u, 9 * u, u * 0.6);
    }
    for (i = r.int(2, 3); i > 0; i--) {
      var hx = r() * W, hr = T * r.range(2, 4);
      ctx.beginPath();
      ctx.ellipse(hx, gy, hr, hr * 0.9, 0, Math.PI, TAU);
      ctx.closePath();
      ctx.fillStyle = '#4cb35c';
      ctx.fill();
      ctx.lineWidth = p;
      ctx.strokeStyle = '#2f7d3e';
      ctx.stroke();
      circle(ctx, hx - hr * 0.3, gy - hr * 0.45, p * 1.5, '#2f7d3e');
      circle(ctx, hx + hr * 0.2, gy - hr * 0.6, p * 1.5, '#2f7d3e');
    }
    for (var c = 0; c < cols; c++) {
      for (k = 0; k < ground; k++) tile(ctx, k === 0 ? 'grass' : 'dirt', c * T, gy + k * T, T, p);
    }

    var used = {}, plats = [];
    for (i = r.int(1, 3); i > 0; i--) {
      var up = r.int(3, 5);
      if (used[up]) continue;
      used[up] = true;
      var len = r.int(3, 6), x0 = r.int(0, Math.max(0, cols - len)) * T, py = gy - up * T, gem = r.chance(0.6) ? r.int(0, len - 1) : -1;
      for (k = 0; k < len; k++) tile(ctx, k === gem ? 'gem' : 'brick', x0 + k * T, py, T, p);
      plats.push([x0, py, len]);
    }
    var pl = plats[0] || [W * 0.3, gy - 3 * T, 4];
    for (k = 0; k < pl[2] + 1; k++) {
      coin(ctx, pl[0] + k * T, pl[1] - T * (0.9 + 0.5 * Math.sin(Math.PI * k / Math.max(1, pl[2]))), p);
    }

    var heroX = r.range(0.1, 0.4) * W, heroOn = r.chance(0.4) && plats.length ? plats[plats.length - 1] : null;
    var hp = p * 1.4, hy = (heroOn ? heroOn[1] : gy) - HERO.length * hp;
    if (heroOn) heroX = heroOn[0] + T * 0.3;
    sprite(ctx, HERO, heroX, hy, hp, { X: r.pick(['#e03131', '#1c7ed6', '#7048e8', '#f08c00']), W: '#ffffff', B: '#111111', M: '#5c1a1a', F: '#343a40' });
    sprite(ctx, SLIME, r.range(0.55, 0.9) * W, gy - SLIME.length * hp, hp, { G: '#40c057', W: '#ffffff', B: '#111111', D: '#2b8a3e' });

    var fs = T * 0.42;
    ctx.font = 'bold ' + fs + 'px ' + MONO;
    ctx.textBaseline = 'top';
    function shadowText(s, x, y, align) {
      ctx.textAlign = align;
      ctx.fillStyle = '#000000';
      ctx.fillText(s, x + p, y + p);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(s, x, y);
    }
    var score = String(r.int(1, 99) * 50);
    shadowText('SCORE ' + '000000'.slice(score.length) + score, T * 0.4, T * 0.35, 'left');
    shadowText('LEVEL ' + r.int(1, 9), W - T * 0.4, T * 0.35, 'right');
    for (k = 0; k < 3; k++) sprite(ctx, HEART, T * 0.4 + k * 9 * p, T * 0.35 + fs * 1.4, p, { R: k < r.int(1, 3) ? '#ff4d6d' : '#6c1a2a' });
    coin(ctx, W - T * 2.1, T * 0.35 + fs * 1.4 + 3 * p, p);
    shadowText('× ' + r.int(3, 40), W - T * 0.4, T * 0.35 + fs * 1.3, 'right');
  }

  var CATS = [
    { fur: '#f4a24c', stripe: '#c0661c', muzzle: '#fde8cf' },
    { fur: '#9aa3ad', stripe: '#646d77', muzzle: '#e6e9ec' },
    { fur: '#34353f', stripe: null, muzzle: '#4a4b57' },
    { fur: '#f7f3ee', stripe: null, muzzle: '#ffffff' },
    { fur: '#c8a27a', stripe: '#8c6647', muzzle: '#f1e2cf' }
  ];
  var PASTELS = [['#ffd6e0', '#ffc2d1'], ['#d0f4de', '#b8ecca'], ['#cde7ff', '#b3d9ff'], ['#fff1c1', '#ffe79a'], ['#e5d4ff', '#d4bbff']];

  function cat(ctx, W, H, r) {
    var bg = r.pick(PASTELS), c = r.pick(CATS), m = Math.min(W, H), i, j;
    var ink = c.fur === '#34353f' ? '#15151a' : '#3a2e2e';
    ctx.fillStyle = bg[0];
    ctx.fillRect(0, 0, W, H);
    var gap = m * 0.12;
    for (j = 0; j * gap < H + gap; j++) {
      for (i = 0; i * gap < W + gap; i++) circle(ctx, i * gap + (j % 2) * gap / 2, j * gap, m * 0.018, bg[1]);
    }

    var S = m * (H > W ? 0.78 : 0.62), cx = W / 2, cy = H * (H > W ? 0.4 : 0.5);
    ctx.fillStyle = c.fur;
    ctx.beginPath();
    ctx.ellipse(cx, cy + S * 0.8, S * 0.5, S * 0.62, 0, 0, TAU);
    ctx.fill();
    if (H > W) {
      [-1, 1].forEach(function (sx) {
        ctx.beginPath();
        ctx.ellipse(cx + sx * S * 0.2, cy + S * 1.33, S * 0.13, S * 0.09, 0, 0, TAU);
        ctx.fillStyle = c.muzzle;
        ctx.fill();
      });
    }

    [-1, 1].forEach(function (sx) {
      ctx.fillStyle = c.fur;
      ctx.beginPath();
      ctx.moveTo(cx + sx * S * 0.47, cy - S * 0.02);
      ctx.quadraticCurveTo(cx + sx * S * 0.46, cy - S * 0.5, cx + sx * S * 0.38, cy - S * 0.58);
      ctx.quadraticCurveTo(cx + sx * S * 0.22, cy - S * 0.46, cx + sx * S * 0.06, cy - S * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb0c4';
      ctx.beginPath();
      ctx.moveTo(cx + sx * S * 0.4, cy - S * 0.16);
      ctx.quadraticCurveTo(cx + sx * S * 0.4, cy - S * 0.44, cx + sx * S * 0.36, cy - S * 0.49);
      ctx.quadraticCurveTo(cx + sx * S * 0.24, cy - S * 0.4, cx + sx * S * 0.16, cy - S * 0.3);
      ctx.closePath();
      ctx.fill();
    });
    ctx.fillStyle = c.fur;
    ctx.beginPath();
    ctx.ellipse(cx, cy, S * 0.5, S * 0.4, 0, 0, TAU);
    ctx.fill();
    circle(ctx, cx - S * 0.42, cy + S * 0.12, S * 0.12, c.fur);
    circle(ctx, cx + S * 0.42, cy + S * 0.12, S * 0.12, c.fur);

    ctx.lineCap = 'round';
    if (c.stripe) {
      ctx.strokeStyle = c.stripe;
      ctx.lineWidth = S * 0.035;
      ctx.beginPath();
      [-0.09, 0, 0.09].forEach(function (dx) {
        ctx.moveTo(cx + dx * S, cy - S * 0.36);
        ctx.lineTo(cx + dx * S * 0.8, cy - S * (dx ? 0.24 : 0.2));
      });
      [-1, 1].forEach(function (sx) {
        ctx.moveTo(cx + sx * S * 0.5, cy + S * 0.02);
        ctx.lineTo(cx + sx * S * 0.38, cy + S * 0.04);
        ctx.moveTo(cx + sx * S * 0.52, cy + S * 0.12);
        ctx.lineTo(cx + sx * S * 0.4, cy + S * 0.12);
      });
      ctx.stroke();
    }

    circle(ctx, cx - S * 0.075, cy + S * 0.17, S * 0.1, c.muzzle);
    circle(ctx, cx + S * 0.075, cy + S * 0.17, S * 0.1, c.muzzle);
    circle(ctx, cx - S * 0.3, cy + S * 0.13, S * 0.065, 'rgba(255,143,171,0.35)');
    circle(ctx, cx + S * 0.3, cy + S * 0.13, S * 0.065, 'rgba(255,143,171,0.35)');

    var iris = r.pick(['#52b788', '#f4a261', '#4ea8de', '#e9c46a']), happy = r.chance(0.2);
    [-1, 1].forEach(function (sx) {
      var ex = cx + sx * S * 0.2, ey = cy - S * 0.02;
      if (happy) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = S * 0.022;
        ctx.beginPath();
        ctx.arc(ex, ey + S * 0.04, S * 0.07, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        return;
      }
      ctx.beginPath();
      ctx.ellipse(ex, ey, S * 0.095, S * 0.11, 0, 0, TAU);
      ctx.fillStyle = iris;
      ctx.fill();
      ctx.lineWidth = S * 0.01;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(ex, ey, S * 0.04, S * 0.085, 0, 0, TAU);
      ctx.fillStyle = '#1a1a1a';
      ctx.fill();
      circle(ctx, ex - S * 0.03, ey - S * 0.045, S * 0.026, '#ffffff');
      circle(ctx, ex + S * 0.03, ey + S * 0.035, S * 0.012, '#ffffff');
    });

    ctx.fillStyle = '#ff8fab';
    ctx.beginPath();
    ctx.moveTo(cx - S * 0.045, cy + S * 0.1);
    ctx.lineTo(cx + S * 0.045, cy + S * 0.1);
    ctx.quadraticCurveTo(cx + S * 0.02, cy + S * 0.15, cx, cy + S * 0.155);
    ctx.quadraticCurveTo(cx - S * 0.02, cy + S * 0.15, cx - S * 0.045, cy + S * 0.1);
    ctx.fill();
    if (r.chance(0.25)) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + S * 0.215, S * 0.03, S * 0.04, 0, 0, TAU);
      ctx.fillStyle = '#ff6b8b';
      ctx.fill();
    }
    ctx.strokeStyle = ink;
    ctx.lineWidth = S * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx, cy + S * 0.15);
    ctx.lineTo(cx, cy + S * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - S * 0.04, cy + S * 0.18, S * 0.04, 0, Math.PI);
    ctx.moveTo(cx + S * 0.08, cy + S * 0.18);
    ctx.arc(cx + S * 0.04, cy + S * 0.18, S * 0.04, 0, Math.PI);
    ctx.stroke();

    ctx.strokeStyle = rgba(c.fur === '#34353f' ? '#d9d9e0' : '#3a2e2e', 0.55);
    ctx.lineWidth = S * 0.006;
    ctx.beginPath();
    for (var k = 0; k < 3; k++) {
      [-1, 1].forEach(function (sx) {
        ctx.moveTo(cx + sx * S * 0.14, cy + S * (0.15 + k * 0.03));
        ctx.quadraticCurveTo(cx + sx * S * 0.38, cy + S * (0.1 + k * 0.05), cx + sx * S * 0.62, cy + S * (0.06 + k * 0.08));
      });
    }
    ctx.stroke();

    if (r.chance(0.5)) {
      ctx.strokeStyle = r.pick(['#e63946', '#1d7fe0', '#2a9d8f', '#8338ec']);
      ctx.lineWidth = S * 0.05;
      ctx.beginPath();
      ctx.ellipse(cx, cy + S * 0.3, S * 0.3, S * 0.12, 0, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      circle(ctx, cx, cy + S * 0.45, S * 0.045, '#f2c230');
      circle(ctx, cx, cy + S * 0.465, S * 0.012, '#7a5a00');
    }
  }

  function testCard(ctx, W, H, r) {
    var top = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    var mid = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
    var low = [['#00214c', 1.25], ['#ffffff', 1.25], ['#32006a', 1.25], ['#131313', 1.25],
               ['#090909', 1 / 3], ['#131313', 1 / 3], ['#1d1d1d', 1 / 3], ['#131313', 1]];
    var bw = W / 7, m = Math.min(W, H), x = 0;
    for (var i = 0; i < 7; i++) {
      ctx.fillStyle = top[i];
      ctx.fillRect(i * bw, 0, bw + 1, H * 0.67);
      ctx.fillStyle = mid[i];
      ctx.fillRect(i * bw, H * 0.67, bw + 1, H * 0.08);
    }
    low.forEach(function (b) {
      ctx.fillStyle = b[0];
      ctx.fillRect(x, H * 0.75, b[1] * bw + 1, H * 0.25);
      x += b[1] * bw;
    });
    if (r.chance(0.7)) {
      var bwd = Math.min(W * 0.8, m * 0.95), bh = m * 0.13;
      fillRound(ctx, (W - bwd) / 2, H * 0.335 - bh / 2, bwd, bh, m * 0.015, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + (m * 0.06) + 'px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLEASE STAND BY', W / 2, H * 0.335);
    }
  }

  /* ------------------------------------------------------------ registry */

  Smash.rng = rng;
  Smash.draw = { roundRect: roundRect, fillRound: fillRound, circle: circle, grad: grad, glow: glow, rgba: rgba };
})(this);
