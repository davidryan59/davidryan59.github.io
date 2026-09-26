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

  /* ------------------------------------------------------- phone screens */

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function two(n) { return n < 10 ? '0' + n : String(n); }
  function clock(d) { return two(d.getHours()) + ':' + two(d.getMinutes()); }
  function longDate(d) { return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function shortDate(d) { return DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }

  var APPS = {
    Clock: ['#2b2b2e', '#111113'], Camera: ['#b4bec9', '#6b7580'], Maps: ['#f1f8f2', '#d4efdf'], Music: ['#ff5a73', '#f5294a'],
    Weather: ['#58b4ff', '#2a7de1'], Messages: ['#62e27f', '#28c050'], Mail: ['#4aa8ff', '#1273e6'], Calendar: ['#ffffff', '#f1f1f1'],
    Calculator: ['#3a3a3e', '#1c1c1e'], Settings: ['#b3b9c0', '#737a82'], Photos: ['#ffffff', '#eef2f6'], Notes: ['#fff6bf', '#ffe066'],
    Games: ['#8d67ff', '#5f3dc4'], Books: ['#ffa94d', '#f76707'], Health: ['#ffffff', '#f3f3f3'], Files: ['#5ab8ff', '#1c7ed6'],
    Podcasts: ['#c07bff', '#8e44ec'], Compass: ['#3a3a3e', '#1c1c1e'], Contacts: ['#c9ced6', '#98a0ab'], Browser: ['#ffffff', '#e3eeff']
  };
  var APP_NAMES = Object.keys(APPS);

  // One app icon, s units square, with its top-left corner at x, y.
  function appIcon(ctx, name, x, y, s, date) {
    var bg = APPS[name] || APPS.Files, W = '#ffffff';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    fillRound(ctx, 0, 0, 1, 1, 0.23, grad(ctx, 0, 0, 0, 1, bg));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (name) {
      case 'Clock':
        circle(ctx, 0.5, 0.5, 0.38, W);
        ctx.strokeStyle = '#1c1c1e';
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(0.5, 0.5); ctx.lineTo(0.5, 0.27);
        ctx.moveTo(0.5, 0.5); ctx.lineTo(0.66, 0.58);
        ctx.stroke();
        ctx.strokeStyle = '#ff9500';
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.moveTo(0.5, 0.5); ctx.lineTo(0.37, 0.7);
        ctx.stroke();
        break;
      case 'Camera':
        fillRound(ctx, 0.16, 0.33, 0.68, 0.45, 0.08, '#2b2f36');
        fillRound(ctx, 0.38, 0.25, 0.24, 0.12, 0.04, '#2b2f36');
        circle(ctx, 0.5, 0.555, 0.15, '#9aa5b1');
        circle(ctx, 0.5, 0.555, 0.1, '#1b1e23');
        circle(ctx, 0.46, 0.515, 0.03, W);
        break;
      case 'Maps':
        fillRound(ctx, 0.6, 0.06, 0.34, 0.26, 0.06, '#9ad8a7');
        circle(ctx, 0.12, 0.9, 0.3, '#9fd3f5');
        ctx.strokeStyle = W;
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.moveTo(0, 0.64); ctx.lineTo(1, 0.44);
        ctx.moveTo(0.34, 0); ctx.lineTo(0.62, 1);
        ctx.stroke();
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.arc(0.46, 0.38, 0.13, Math.PI * 0.85, Math.PI * 2.15);
        ctx.lineTo(0.46, 0.66);
        ctx.closePath();
        ctx.fill();
        circle(ctx, 0.46, 0.38, 0.05, W);
        break;
      case 'Music':
        circle(ctx, 0.36, 0.69, 0.09, W);
        circle(ctx, 0.67, 0.63, 0.09, W);
        ctx.fillStyle = W;
        ctx.fillRect(0.405, 0.27, 0.05, 0.42);
        ctx.fillRect(0.715, 0.21, 0.05, 0.42);
        ctx.beginPath();
        ctx.moveTo(0.405, 0.27); ctx.lineTo(0.765, 0.2); ctx.lineTo(0.765, 0.3); ctx.lineTo(0.405, 0.37);
        ctx.fill();
        break;
      case 'Weather':
        circle(ctx, 0.4, 0.4, 0.17, '#ffd43b');
        circle(ctx, 0.5, 0.62, 0.14, W);
        circle(ctx, 0.66, 0.58, 0.16, W);
        circle(ctx, 0.34, 0.67, 0.1, W);
        fillRound(ctx, 0.24, 0.64, 0.58, 0.13, 0.065, W);
        break;
      case 'Messages':
        ctx.fillStyle = W;
        ctx.beginPath();
        ctx.ellipse(0.5, 0.47, 0.34, 0.28, 0, 0, TAU);
        ctx.moveTo(0.3, 0.66); ctx.lineTo(0.22, 0.81); ctx.lineTo(0.44, 0.72);
        ctx.fill();
        break;
      case 'Mail':
        fillRound(ctx, 0.16, 0.28, 0.68, 0.46, 0.06, W);
        ctx.strokeStyle = bg[1];
        ctx.lineWidth = 0.045;
        ctx.beginPath();
        ctx.moveTo(0.19, 0.32); ctx.lineTo(0.5, 0.55); ctx.lineTo(0.81, 0.32);
        ctx.stroke();
        break;
      case 'Calendar':
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3b30';
        ctx.font = '600 0.15px ' + SANS;
        ctx.fillText(DAYS[date.getDay()].slice(0, 3).toUpperCase(), 0.5, 0.27);
        ctx.fillStyle = '#1c1c1e';
        ctx.font = '300 0.48px ' + SANS;
        ctx.fillText(String(date.getDate()), 0.5, 0.74);
        break;
      case 'Calculator':
        for (var j = 0; j < 4; j++) {
          for (var i = 0; i < 4; i++) circle(ctx, 0.2 + i * 0.2, 0.2 + j * 0.2, 0.075, i === 3 ? '#ff9f0a' : j === 0 ? '#d4d4d2' : '#5a5a5e');
        }
        break;
      case 'Settings':
        ctx.fillStyle = '#4a5058';
        ctx.save();
        ctx.translate(0.5, 0.5);
        for (var k = 0; k < 8; k++) {
          ctx.rotate(TAU / 8);
          ctx.fillRect(-0.06, -0.37, 0.12, 0.14);
        }
        ctx.restore();
        circle(ctx, 0.5, 0.5, 0.27, '#4a5058');
        circle(ctx, 0.5, 0.5, 0.11, bg[0]);
        break;
      case 'Photos':
        fillRound(ctx, 0.16, 0.2, 0.68, 0.6, 0.06, '#dbe9f7');
        circle(ctx, 0.64, 0.38, 0.07, '#ffc53d');
        ctx.fillStyle = '#34a853';
        ctx.beginPath();
        ctx.moveTo(0.16, 0.8); ctx.lineTo(0.4, 0.42); ctx.lineTo(0.58, 0.66); ctx.lineTo(0.68, 0.54); ctx.lineTo(0.84, 0.8);
        ctx.fill();
        break;
      case 'Notes':
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(0, 0.08, 1, 0.2);
        ctx.fillStyle = '#b3a37a';
        for (var n = 0; n < 4; n++) ctx.fillRect(0.14, 0.42 + n * 0.13, n === 3 ? 0.42 : 0.72, 0.035);
        break;
      case 'Games':
        ctx.fillStyle = W;
        ctx.fillRect(0.17, 0.44, 0.3, 0.1);
        ctx.fillRect(0.27, 0.34, 0.1, 0.3);
        circle(ctx, 0.66, 0.4, 0.065, W);
        circle(ctx, 0.78, 0.53, 0.065, W);
        break;
      case 'Books':
        ctx.fillStyle = W;
        ctx.beginPath();
        ctx.moveTo(0.5, 0.33); ctx.quadraticCurveTo(0.33, 0.24, 0.16, 0.29); ctx.lineTo(0.16, 0.73);
        ctx.quadraticCurveTo(0.33, 0.68, 0.5, 0.77);
        ctx.quadraticCurveTo(0.67, 0.68, 0.84, 0.73); ctx.lineTo(0.84, 0.29); ctx.quadraticCurveTo(0.67, 0.24, 0.5, 0.33);
        ctx.fill();
        ctx.strokeStyle = bg[1];
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.moveTo(0.5, 0.34); ctx.lineTo(0.5, 0.75);
        ctx.stroke();
        break;
      case 'Health':
        ctx.fillStyle = '#ff2d55';
        ctx.beginPath();
        ctx.moveTo(0.5, 0.8);
        ctx.bezierCurveTo(0.1, 0.52, 0.16, 0.2, 0.36, 0.22);
        ctx.bezierCurveTo(0.44, 0.23, 0.48, 0.28, 0.5, 0.34);
        ctx.bezierCurveTo(0.52, 0.28, 0.56, 0.23, 0.64, 0.22);
        ctx.bezierCurveTo(0.84, 0.2, 0.9, 0.52, 0.5, 0.8);
        ctx.fill();
        break;
      case 'Files':
        fillRound(ctx, 0.16, 0.28, 0.3, 0.14, 0.04, W);
        fillRound(ctx, 0.16, 0.34, 0.68, 0.42, 0.06, W);
        break;
      case 'Podcasts':
        fillRound(ctx, 0.41, 0.2, 0.18, 0.36, 0.09, W);
        ctx.strokeStyle = W;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.arc(0.5, 0.42, 0.2, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.moveTo(0.5, 0.62); ctx.lineTo(0.5, 0.78);
        ctx.stroke();
        break;
      case 'Compass':
        ctx.strokeStyle = W;
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(0.5, 0.5, 0.34, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#ff3b30';
        ctx.beginPath();
        ctx.moveTo(0.5, 0.2); ctx.lineTo(0.57, 0.5); ctx.lineTo(0.43, 0.5);
        ctx.fill();
        ctx.fillStyle = W;
        ctx.beginPath();
        ctx.moveTo(0.5, 0.8); ctx.lineTo(0.57, 0.5); ctx.lineTo(0.43, 0.5);
        ctx.fill();
        break;
      case 'Contacts':
        circle(ctx, 0.5, 0.38, 0.14, W);
        ctx.fillStyle = W;
        ctx.beginPath();
        ctx.ellipse(0.5, 0.78, 0.27, 0.2, 0, Math.PI, TAU);
        ctx.fill();
        break;
      case 'Browser':
        ctx.strokeStyle = '#1c7ed6';
        ctx.lineWidth = 0.04;
        ctx.beginPath();
        ctx.arc(0.5, 0.5, 0.32, 0, TAU);
        ctx.moveTo(0.18, 0.5); ctx.lineTo(0.82, 0.5);
        ctx.moveTo(0.5, 0.18); ctx.lineTo(0.5, 0.82);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0.5, 0.5, 0.15, 0.32, 0, 0, TAU);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  function shuffled(r, list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  var WAVES = [['#2b1055', '#7597de', '#d16ba5'], ['#0f2027', '#2c5364', '#79e0c5'], ['#ff9a8b', '#ff6a88', '#ffd1dc'],
               ['#1a2a6c', '#b21f1f', '#fdbb2d'], ['#134e5e', '#71b280', '#e3f59a'], ['#232526', '#5b6f95', '#a1c4fd']];

  function waves(ctx, W, H, r) {
    var p = r.pick(WAVES), m = Math.min(W, H);
    ctx.fillStyle = grad(ctx, 0, 0, W, H, [p[0], p[1]]);
    ctx.fillRect(0, 0, W, H);
    for (var k = 0; k < 4; k++) {
      var y0 = H * (0.3 + k * 0.17), a = m * r.range(0.04, 0.1), f = r.range(1, 2.5) * TAU / W, ph = r.range(0, TAU);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 10) ctx.lineTo(x, y0 + a * Math.sin(x * f + ph));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = rgba(p[2], (0.14 + k * 0.06).toFixed(2));
      ctx.fill();
    }
  }

  function label(ctx, text, x, y, size) {
    ctx.font = '500 ' + size + 'px ' + SANS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, x + size * 0.06, y + size * 0.08);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  function homeScreen(ctx, W, H, r, info) {
    waves(ctx, W, H, r);
    var phone = info.device === 'phone', cols = phone ? 4 : H > W ? 5 : 6;
    var s = W / cols * 0.6, gap = (W - cols * s) / (cols + 1), rowH = s * 1.65;
    var y0 = phone ? W * 0.17 : Math.min(W, H) * 0.09, dockH = s * 1.45, dockY = H - dockH - gap * (phone ? 0.5 : 0.35);
    var rows = Math.floor((dockY - y0 - s * 0.4) / rowH);
    var names = shuffled(r, APP_NAMES), next = 0, widget = r.chance(0.6);
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        if (widget && j < 2 && i < 2) continue;
        var x = gap + i * (s + gap), y = y0 + j * rowH, name = names[next++ % names.length];
        appIcon(ctx, name, x, y, s, info.time);
        label(ctx, name, x + s / 2, y + s * 1.08, s * 0.17);
      }
    }
    if (widget) {
      var ww = 2 * s + gap, wx = gap, wy = y0;
      fillRound(ctx, wx, wy, ww, rowH + s, s * 0.23, grad(ctx, wx, wy, wx, wy + rowH + s, ['#4aa3ff', '#1d6fe0']));
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '600 ' + s * 0.2 + 'px ' + SANS;
      ctx.fillText(r.pick(['Da Nang', 'Oxford', 'Leeds', 'Brighton', 'Cardiff']), wx + s * 0.18, wy + s * 0.16);
      ctx.font = '300 ' + s * 0.62 + 'px ' + SANS;
      ctx.fillText(r.int(12, 31) + '°', wx + s * 0.14, wy + s * 0.42);
      circle(ctx, wx + ww - s * 0.5, wy + s * 0.5, s * 0.2, '#ffd43b');
      ctx.font = '500 ' + s * 0.17 + 'px ' + SANS;
      ctx.fillText(r.pick(['Sunny', 'Sunny spells', 'Clear skies']), wx + s * 0.18, wy + rowH + s * 0.55);
    }
    for (var d = 0; d < 3; d++) circle(ctx, W / 2 + (d - 1) * s * 0.14, dockY - s * 0.2, s * 0.035, d ? 'rgba(255,255,255,0.45)' : '#ffffff');
    fillRound(ctx, gap * 0.5, dockY, W - gap, dockH, s * 0.35, 'rgba(255,255,255,0.28)');
    var dock = ['Contacts', 'Browser', 'Messages', 'Music', 'Mail', 'Photos'].slice(0, cols);
    dock.forEach(function (name, k) { appIcon(ctx, name, gap + k * (s + gap), dockY + (dockH - s) / 2, s, info.time); });
  }

  var NOTES = [
    ['Messages', 'Grandma', 'The cake was lovely, thank you!'],
    ['Calendar', 'Football practice', 'Today at 4 pm. Bring water'],
    ['Weather', 'Sunny spells', 'Clear skies by this afternoon'],
    ['Health', 'Nice walk!', 'You passed 8,000 steps today'],
    ['Notes', 'Shopping list', 'Bread, bananas, tea bags'],
    ['Mail', 'Library', 'Your book is ready to collect'],
    ['Podcasts', 'New episode', 'How glass is made'],
    ['Clock', 'Reminder', 'Water the tomatoes'],
    ['Photos', 'Memories', 'A day at the beach']
  ];

  function fitText(ctx, text, width) {
    if (ctx.measureText(text).width <= width) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > width) text = text.slice(0, -1);
    return text + '…';
  }

  function lockScreen(ctx, W, H, r, info) {
    r.pick([mountains, aurora, beach, space, synthwave])(ctx, W, H, r);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, W, H);
    var m = Math.min(W, H), portrait = H > W, top = portrait ? H * 0.1 : H * 0.12;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + m * 0.05 + 'px ' + SANS;
    ctx.fillText(longDate(info.time), W / 2, top + m * 0.06);
    ctx.font = '300 ' + m * 0.24 + 'px ' + SANS;
    ctx.fillText(clock(info.time), W / 2, top + m * 0.3);

    var nw = Math.min(W * 0.9, m * 0.95), nh = m * 0.16, x = (W - nw) / 2, y = H * (portrait ? 0.5 : 0.56);
    shuffled(r, NOTES).slice(0, r.int(1, portrait ? 3 : 2)).forEach(function (note, k) {
      var ny = y + k * (nh + m * 0.02), ic = m * 0.08;
      fillRound(ctx, x, ny, nw, nh, m * 0.045, 'rgba(246,246,250,0.8)');
      appIcon(ctx, note[0], x + m * 0.035, ny + (nh - ic) / 2, ic, info.time);
      var tx = x + m * 0.035 + ic + m * 0.03, tw = nw - (tx - x) - m * 0.035;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1c1c1e';
      ctx.font = '600 ' + m * 0.036 + 'px ' + SANS;
      ctx.fillText(fitText(ctx, note[1], tw * 0.7), tx, ny + nh * 0.43);
      ctx.font = '400 ' + m * 0.034 + 'px ' + SANS;
      ctx.fillText(fitText(ctx, note[2], tw), tx, ny + nh * 0.78);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6b6b70';
      ctx.font = '400 ' + m * 0.03 + 'px ' + SANS;
      ctx.fillText(k ? k * 7 + 'm ago' : 'now', x + nw - m * 0.035, ny + nh * 0.43);
    });

    [0.16, 0.84].forEach(function (fx, k) {
      var bx = W * fx, by = H - m * (portrait ? 0.2 : 0.14), br = m * 0.07;
      circle(ctx, bx, by, br, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = '#ffffff';
      if (k === 0) {
        fillRound(ctx, bx - br * 0.18, by - br * 0.1, br * 0.36, br * 0.6, br * 0.08, '#ffffff');
        ctx.beginPath();
        ctx.moveTo(bx - br * 0.3, by - br * 0.5); ctx.lineTo(bx + br * 0.3, by - br * 0.5);
        ctx.lineTo(bx + br * 0.18, by - br * 0.1); ctx.lineTo(bx - br * 0.18, by - br * 0.1);
        ctx.fill();
      } else {
        fillRound(ctx, bx - br * 0.42, by - br * 0.25, br * 0.84, br * 0.58, br * 0.1, '#ffffff');
        circle(ctx, bx, by + br * 0.04, br * 0.17, 'rgba(0,0,0,0.6)');
      }
    });
    fillRound(ctx, W / 2 - m * 0.17, H - m * 0.035, m * 0.34, m * 0.012, m * 0.006, '#ffffff');
  }

  /* ---------------------------------------------------- desktop screens */

  // Laptop and monitor screens are 1000 units tall, so these sizes are fixed.
  function statusBar(ctx, W, H, info, color) {
    var phone = info.device === 'phone', m = Math.min(W, H);
    var u = phone ? W * 0.042 : m * 0.026, y = phone ? W * 0.075 : m * 0.035, k;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.font = '600 ' + u + 'px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(phone ? clock(info.time) : clock(info.time) + '   ' + shortDate(info.time), phone ? W * 0.11 : m * 0.04, y);
    var bx = W - (phone ? W * 0.09 : m * 0.04);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = u * 0.08;
    ctx.beginPath();
    roundRect(ctx, bx - u * 1.25, y - u * 0.33, u * 1.1, u * 0.66, u * 0.18);
    ctx.stroke();
    ctx.globalAlpha = 1;
    fillRound(ctx, bx - u * 1.15, y - u * 0.23, u * 0.75, u * 0.46, u * 0.1, color);
    fillRound(ctx, bx - u * 0.1, y - u * 0.11, u * 0.08, u * 0.22, u * 0.04, color);
    var wx = bx - u * 1.9;
    ctx.lineWidth = u * 0.12;
    ctx.lineCap = 'round';
    for (k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(wx, y + u * 0.32, u * 0.2 * k, -Math.PI * 0.72, -Math.PI * 0.28);
      ctx.stroke();
    }
    for (k = 0; k < 4; k++) ctx.fillRect(bx - u * 3.3 + k * u * 0.25, y + u * 0.3 - u * 0.16 * (k + 1), u * 0.16, u * 0.16 * (k + 1));
  }

  function menuBar(ctx, W, H, info, items) {
    var h = 30, fs = 18, x = 22;
    ctx.fillStyle = 'rgba(20,20,28,0.4)';
    ctx.fillRect(0, 0, W, h);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    circle(ctx, x, h / 2, 7, '#ffffff');
    x += 24;
    (items || ['Desktop', 'File', 'Edit', 'View', 'Go', 'Window', 'Help']).forEach(function (t, i) {
      ctx.font = (i ? '400 ' : '600 ') + fs + 'px ' + SANS;
      ctx.fillText(t, x, h / 2);
      x += ctx.measureText(t).width + 24;
    });
    ctx.textAlign = 'right';
    ctx.fillText(shortDate(info.time) + '   ' + clock(info.time), W - 22, h / 2);
  }

  function desktopDock(ctx, W, H, r, info) {
    var s = 62, n = 9, gap = 14, dw = n * s + (n + 1) * gap, x0 = (W - dw) / 2, y0 = H - s - gap * 2;
    fillRound(ctx, x0, y0 - gap, dw, s + 2 * gap, 22, 'rgba(255,255,255,0.3)');
    shuffled(r, APP_NAMES).slice(0, n).forEach(function (name, k) { appIcon(ctx, name, x0 + gap + k * (s + gap), y0, s, info.time); });
  }

  // A window with its title bar. Returns the title bar's height; the caller
  // clips to the window before drawing inside it.
  function appWindow(ctx, x, y, w, h, title, dark) {
    fillRound(ctx, x - 6, y + 4, w + 12, h + 12, 18, 'rgba(0,0,0,0.12)');
    fillRound(ctx, x - 2, y + 1, w + 4, h + 4, 14, 'rgba(0,0,0,0.14)');
    fillRound(ctx, x, y, w, h, 12, dark ? '#1e1e2e' : '#ffffff');
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 12);
    ctx.clip();
    ctx.fillStyle = dark ? '#2a2a3a' : '#ececec';
    ctx.fillRect(x, y, w, 38);
    ctx.restore();
    ['#ff5f57', '#febc2e', '#28c840'].forEach(function (c, i) { circle(ctx, x + 22 + i * 22, y + 19, 7, c); });
    ctx.fillStyle = dark ? '#b8bcd0' : '#4a4a4a';
    ctx.font = '500 16px ' + SANS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + w / 2, y + 19);
    return 38;
  }

  var CODE = [
    [
      '// hammer.js: swing, hit, repeat',
      "import { growCrack } from './glass.js';",
      '',
      'export function swing(hammer, screen) {',
      '  const energy = 0.5 * hammer.mass * hammer.speed ** 2;',
      '  if (energy < screen.toughness) {',
      "    return { cracked: false, note: 'Try harder' };",
      '  }',
      '  const cracks = [];',
      '  for (let i = 0; i < 6; i++) {',
      '    const angle = (i / 6) * Math.PI * 2;',
      '    cracks.push(growCrack(screen, hammer.x, hammer.y, angle));',
      '  }',
      '  for (const row of screen.rows) {',
      '    if (cracks.some((c) => c.crosses(row.y))) row.stuck = true;',
      '  }',
      '  return { cracked: true, cracks };',
      '}',
      '',
      'export function inspect(screen) {',
      '  const dead = screen.rows.filter((row) => row.stuck).length;',
      '  return `${dead} of ${screen.rows.length} rows are stuck`;',
      '}'
    ],
    [
      '# pixels.py: find the rows that no longer change',
      'from dataclasses import dataclass',
      '',
      '',
      '@dataclass',
      'class Row:',
      '    y: int',
      '    colour: tuple[int, int, int]',
      '    stuck: bool = False',
      '',
      '',
      'def stuck_rows(frames: list[list[Row]]) -> list[int]:',
      '    """Rows that show the same colour in every frame."""',
      '    first, *rest = frames',
      '    return [',
      '        row.y',
      '        for row in first',
      '        if all(f[row.y].colour == row.colour for f in rest)',
      '    ]',
      '',
      '',
      "if __name__ == '__main__':",
      "    print(stuck_rows(load_frames('screen.raw')))"
    ]
  ];
  var KEYWORDS = /^(const|let|var|function|return|if|else|for|of|in|new|export|import|from|while|true|false|null|class|def|and|or|not|is|with|as|pass|True|False|None|print|async|await)$/;
  var SYNTAX = { comment: '#7f849c', string: '#a6e3a1', number: '#fab387', keyword: '#cba6f7', call: '#89b4fa', ident: '#cdd6f4', punct: '#9399b2' };

  function tokens(line) {
    var out = [], re = /(\/\/.*$|#.*$)|("""[^]*?"""|'[^']*'|"[^"]*"|`[^`]*`)|(\d+(?:\.\d+)?)|([A-Za-z_$@][\w$]*)|(\s+)|(.)/g, mt;
    while ((mt = re.exec(line))) {
      if (mt[1]) out.push([mt[1], 'comment']);
      else if (mt[2]) out.push([mt[2], 'string']);
      else if (mt[3]) out.push([mt[3], 'number']);
      else if (mt[4]) out.push([mt[4], KEYWORDS.test(mt[4]) || mt[4].charAt(0) === '@' ? 'keyword' : line.charAt(re.lastIndex) === '(' ? 'call' : 'ident']);
      else out.push([mt[0], 'punct']);
    }
    return out;
  }

  function codeEditor(ctx, W, H, r, info) {
    waves(ctx, W, H, r);
    menuBar(ctx, W, H, info, ['Code', 'File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Window', 'Help']);
    var py = r.chance(0.35), lines = CODE[py ? 1 : 0], file = py ? 'pixels.py' : 'hammer.js';
    var x = W * 0.05, y = 60, w = W * 0.9, h = H - 90, tb = appWindow(ctx, x, y, w, h, file + ' — smash', true);
    var side = w * 0.19, fs = 19, lh = 29.5, status = 28, i;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 12);
    ctx.clip();
    ctx.fillStyle = '#181825';
    ctx.fillRect(x, y + tb, side, h - tb);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 15px ' + SANS;
    ctx.fillStyle = '#a6adc8';
    ctx.fillText('EXPLORER', x + 20, y + tb + 26);
    ['▾ smash', '  ▾ src', '    glass.js', '    hammer.js', '    pixels.py', '    screen.js', '  ▸ tests', '  index.html', '  README.md'].forEach(function (f, k) {
      var fy = y + tb + 64 + k * 32;
      if (f.trim() === file) {
        ctx.fillStyle = '#313244';
        ctx.fillRect(x, fy - 15, side, 30);
      }
      ctx.fillStyle = f.trim() === file ? '#ffffff' : '#bac2de';
      ctx.font = '400 17px ' + SANS;
      ctx.fillText(f, x + 18, fy);
    });

    var ex = x + side, ey = y + tb;
    ctx.fillStyle = '#11111b';
    ctx.fillRect(ex, ey, w - side, 40);
    ctx.fillStyle = '#1e1e2e';
    ctx.fillRect(ex, ey, 170, 40);
    ctx.fillStyle = '#cdd6f4';
    ctx.font = '400 16px ' + SANS;
    ctx.fillText(file, ex + 22, ey + 20);
    ctx.fillStyle = '#7f849c';
    ctx.fillText(py ? 'hammer.js' : 'glass.js', ex + 192, ey + 20);

    var top = ey + 56, cur = r.int(3, lines.length - 2);
    ctx.fillStyle = '#2a2b3c';
    ctx.fillRect(ex, top + cur * lh - lh / 2, w - side, lh);
    ctx.font = fs + 'px ' + MONO;
    var cw = ctx.measureText('M').width;
    for (i = 0; i < lines.length; i++) {
      var ly = top + i * lh;
      if (ly > y + h - status - 10) break;
      ctx.textAlign = 'right';
      ctx.fillStyle = i === cur ? '#cdd6f4' : '#6c7086';
      ctx.fillText(String(i + 1), ex + 52, ly);
      ctx.textAlign = 'left';
      var cx = ex + 76;
      tokens(lines[i]).forEach(function (t) {
        ctx.fillStyle = SYNTAX[t[1]];
        ctx.fillText(t[0], cx, ly);
        cx += t[0].length * cw;
      });
      if (i === cur) {
        ctx.fillStyle = '#f5e0dc';
        ctx.fillRect(ex + 76 + lines[i].length * cw + 2, ly - lh * 0.38, 2.5, lh * 0.76);
      }
    }
    for (i = 0; i < lines.length; i++) {
      ctx.fillStyle = 'rgba(205,214,244,0.25)';
      ctx.fillRect(x + w - 90, top + i * 5, Math.min(70, lines[i].length * 1.3), 2.5);
    }
    ctx.fillStyle = '#6c5ce7';
    ctx.fillRect(x, y + h - status, w, status);
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 15px ' + SANS;
    ctx.fillText('⎇ main    ✓ 0 problems', x + 16, y + h - status / 2);
    ctx.textAlign = 'right';
    ctx.fillText('Ln ' + (cur + 1) + ', Col ' + (lines[cur].length + 1) + '    Spaces: ' + (py ? 4 : 2) + '    UTF-8    ' + (py ? 'Python' : 'JavaScript'),
                 x + w - 16, y + h - status / 2);
    ctx.restore();
  }

  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function spreadsheet(ctx, W, H, r, info) {
    waves(ctx, W, H, r);
    menuBar(ctx, W, H, info, ['Sheets', 'File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Window', 'Help']);
    var x = W * 0.035, y = 56, w = W * 0.93, h = H - 80, tb = appWindow(ctx, x, y, w, h, 'Snacks 2026', false);
    var tool = 46, fbar = 36, headW = 52, colW = 146, rowH = 34, i, j;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 12);
    ctx.clip();
    var ty = y + tb;
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(x, ty, w, tool);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = '500 17px ' + SANS;
    var tx = x + 20;
    ['Home', 'Insert', 'Data', 'View'].forEach(function (t, k) {
      ctx.fillStyle = k ? '#5f6368' : '#188038';
      ctx.fillText(t, tx, ty + tool / 2);
      tx += ctx.measureText(t).width + 30;
    });
    for (i = 0; i < 12; i++) fillRound(ctx, tx + 20 + i * 38, ty + 11, 26, 24, 5, i % 4 ? '#e3e6ea' : '#d2e3fc');
    var fy = ty + tool;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, fy, w, fbar);
    ctx.strokeStyle = '#dadce0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 10, fy + 5, 80, fbar - 10);
    ctx.fillStyle = '#202124';
    ctx.font = '400 16px ' + SANS;
    ctx.fillText('F15', x + 22, fy + fbar / 2);
    ctx.fillStyle = '#5f6368';
    ctx.font = 'italic 17px ' + SERIF;
    ctx.fillText('fx', x + 104, fy + fbar / 2);
    ctx.fillStyle = '#202124';
    ctx.font = '400 16px ' + MONO;
    ctx.fillText('=SUM(F3:F14)', x + 136, fy + fbar / 2);

    var gy = fy + fbar, cols = Math.floor((w - headW) / colW) + 1, rows = Math.floor((y + h - 40 - gy) / rowH);
    ctx.fillStyle = '#f1f3f4';
    ctx.fillRect(x, gy, w, rowH);
    ctx.fillRect(x, gy, headW, h);
    ctx.font = '400 15px ' + SANS;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5f6368';
    for (i = 0; i < cols; i++) ctx.fillText(String.fromCharCode(65 + i), x + headW + i * colW + colW / 2, gy + rowH / 2);
    for (j = 1; j < rows; j++) ctx.fillText(String(j), x + headW / 2, gy + j * rowH + rowH / 2);

    var head = ['Month', 'Tea', 'Coffee', 'Biscuits', 'Cake', 'Total'], sums = [0, 0, 0, 0, 0], data = [];
    for (j = 0; j < 12; j++) {
      var row = [r.int(120, 260), r.int(80, 200), r.int(40, 160), r.int(5, 40)];
      row.push(row[0] + row[1] + row[2] + row[3]);
      row.forEach(function (v, k) { sums[k] += v; });
      data.push(row);
    }
    function cell(ci, rj) { return [x + headW + ci * colW, gy + rj * rowH]; }
    ctx.fillStyle = '#d2e3fc';
    var hc = cell(1, 2);
    ctx.fillRect(hc[0], hc[1], colW * 6, rowH);
    ctx.font = '600 16px ' + SANS;
    ctx.fillStyle = '#202124';
    head.forEach(function (t, k) {
      var c = cell(1 + k, 2);
      ctx.textAlign = k ? 'right' : 'left';
      ctx.fillText(t, k ? c[0] + colW - 12 : c[0] + 12, c[1] + rowH / 2);
    });
    ctx.font = '400 16px ' + SANS;
    data.forEach(function (row, rj) {
      var c = cell(1, 3 + rj);
      ctx.textAlign = 'left';
      ctx.fillText(MONTH_SHORT[rj], c[0] + 12, c[1] + rowH / 2);
      ctx.textAlign = 'right';
      row.forEach(function (v, k) { ctx.fillText(String(v), c[0] + (k + 2) * colW - 12, c[1] + rowH / 2); });
    });
    ctx.font = '600 16px ' + SANS;
    var tc = cell(1, 15);
    ctx.textAlign = 'left';
    ctx.fillText('Total', tc[0] + 12, tc[1] + rowH / 2);
    ctx.textAlign = 'right';
    sums.forEach(function (v, k) { ctx.fillText(String(v), tc[0] + (k + 2) * colW - 12, tc[1] + rowH / 2); });
    ctx.fillStyle = '#202124';
    ctx.fillRect(tc[0], tc[1], colW * 6, 1.5);

    ctx.strokeStyle = '#e2e3e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i <= cols; i++) { ctx.moveTo(x + headW + i * colW, gy); ctx.lineTo(x + headW + i * colW, gy + rows * rowH); }
    for (j = 0; j <= rows; j++) { ctx.moveTo(x, gy + j * rowH); ctx.lineTo(x + w, gy + j * rowH); }
    ctx.stroke();

    var sc = cell(6, 15);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth = 3;
    ctx.strokeRect(sc[0], sc[1], colW, rowH);
    ctx.fillStyle = '#1a73e8';
    ctx.fillRect(sc[0] + colW - 4, sc[1] + rowH - 4, 8, 8);

    if (cols >= 10) {
      var cx0 = cell(8, 2)[0] + 10, cy0 = cell(8, 2)[1], chW = colW * (cols - 8) - 30, chH = rowH * 12;
      fillRound(ctx, cx0 - 2, cy0 + 3, chW + 4, chH + 4, 8, 'rgba(0,0,0,0.12)');
      fillRound(ctx, cx0, cy0, chW, chH, 8, '#ffffff');
      ctx.fillStyle = '#202124';
      ctx.textAlign = 'left';
      ctx.font = '600 18px ' + SANS;
      ctx.fillText('Tea breaks by month', cx0 + 20, cy0 + 30);
      var base = cy0 + chH - 40, bw = (chW - 60) / 12, maxV = 260;
      data.forEach(function (row, k) {
        var bh = (chH - 110) * row[0] / maxV;
        ctx.fillStyle = k === 11 ? '#fbbc04' : '#4c8bf5';
        ctx.fillRect(cx0 + 40 + k * bw + bw * 0.15, base - bh, bw * 0.7, bh);
        ctx.fillStyle = '#5f6368';
        ctx.font = '400 13px ' + SANS;
        ctx.textAlign = 'center';
        ctx.fillText(MONTH_SHORT[k].charAt(0), cx0 + 40 + k * bw + bw / 2, base + 18);
      });
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(cx0 + 36, base, chW - 56, 1.5);
    }

    ctx.fillStyle = '#f1f3f4';
    ctx.fillRect(x, y + h - 40, w, 40);
    fillRound(ctx, x + 70, y + h - 36, 130, 32, 6, '#ffffff');
    ctx.textAlign = 'left';
    ctx.font = '500 16px ' + SANS;
    ctx.fillStyle = '#188038';
    ctx.fillText('Snacks', x + 102, y + h - 20);
    ctx.fillStyle = '#5f6368';
    ctx.fillText('Budget', x + 226, y + h - 20);
    ctx.fillText('+', x + 28, y + h - 20);
    ctx.restore();
  }

  var ARTICLE = [
    ['h1', 'Glass'],
    ['p', 'Glass is a hard, brittle material that lets light through. It is usually made by melting sand with other minerals and cooling the melt quickly, so that its atoms have no time to line up into crystals.'],
    ['p', 'Most windows, bottles and jars are soda-lime glass, made from silica sand, soda ash and limestone. It is cheap, easy to shape and can be recycled again and again.'],
    ['h2', 'Screens'],
    ['p', 'The screen of a phone or laptop sits behind a sheet of toughened glass. Chemical toughening swaps small sodium ions near the surface for larger potassium ions, which squeezes the surface and makes it much harder to crack.'],
    ['p', 'Behind that glass, a liquid crystal display holds a thin layer of liquid crystal between two more sheets of glass. When those sheets break, the liquid crystal can spread into dark patches, and damaged wiring can light whole rows of pixels in a single colour.'],
    ['h2', 'Cracks'],
    ['p', 'A crack can run through glass at more than a kilometre per second. In 1921 the engineer A. A. Griffith showed why glass breaks so much more easily than the strength of its atomic bonds suggests: tiny flaws at the surface concentrate the stress.']
  ];

  function wrap(ctx, text, width) {
    var lines = [], line = '';
    text.split(' ').forEach(function (word) {
      var t = line ? line + ' ' + word : word;
      if (line && ctx.measureText(t).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = t;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function article(ctx, W, H, r, info) {
    var m = Math.min(W, H), u = m / 1000, tabs = 44 * u, bar = 50 * u;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dee1e6';
    ctx.fillRect(0, 0, W, tabs);
    fillRound(ctx, 90 * u, 7 * u, 260 * u, tabs, [10 * u, 10 * u, 0, 0], '#ffffff');
    circle(ctx, 116 * u, tabs / 2 + 4 * u, 8 * u, '#8ab4f8');
    ctx.fillStyle = '#202124';
    ctx.font = '400 ' + 17 * u + 'px ' + SANS;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Glass', 134 * u, tabs / 2 + 4 * u);
    ['#ff5f57', '#febc2e', '#28c840'].forEach(function (c, i) { circle(ctx, (22 + i * 22) * u, tabs / 2, 7 * u, c); });
    fillRound(ctx, 120 * u, tabs + 8 * u, W - 240 * u, bar - 16 * u, (bar - 16 * u) / 2, '#f1f3f4');
    ctx.fillStyle = '#5f6368';
    ctx.fillText('reference.example/glass', 146 * u, tabs + bar / 2);
    ctx.fillStyle = '#dadce0';
    ctx.fillRect(0, tabs + bar - 1.5 * u, W, 1.5 * u);

    var boxW = W > 1300 * u ? 330 * u : 0, left = 70 * u, textW = W - left * 2 - (boxW ? boxW + 50 * u : 0);
    var y = tabs + bar + 60 * u;
    if (boxW) {
      var bx = W - left - boxW, by = y + 70 * u, bh = 470 * u;
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(bx, by, boxW, bh);
      ctx.strokeStyle = '#a2a9b1';
      ctx.lineWidth = 1.5 * u;
      ctx.strokeRect(bx, by, boxW, bh);
      ctx.fillStyle = '#202122';
      ctx.font = '600 ' + 22 * u + 'px ' + SANS;
      ctx.textAlign = 'center';
      ctx.fillText('Glass', bx + boxW / 2, by + 30 * u);
      var gx = bx + boxW / 2, gy = by + 70 * u, gw = 90 * u, gh = 190 * u;
      ctx.fillStyle = grad(ctx, 0, gy + gh * 0.35, 0, gy + gh, ['#bfe3ff', '#78bdf0']);
      ctx.beginPath();
      ctx.moveTo(gx - gw * 0.92, gy + gh * 0.35);
      ctx.lineTo(gx + gw * 0.92, gy + gh * 0.35);
      ctx.lineTo(gx + gw * 0.7, gy + gh);
      ctx.lineTo(gx - gw * 0.7, gy + gh);
      ctx.fill();
      ctx.strokeStyle = '#7d8a96';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.moveTo(gx - gw, gy);
      ctx.lineTo(gx - gw * 0.7, gy + gh);
      ctx.lineTo(gx + gw * 0.7, gy + gh);
      ctx.lineTo(gx + gw, gy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(gx - gw * 0.6, gy + gh * 0.45, 8 * u, gh * 0.4);
      ctx.font = '400 ' + 17 * u + 'px ' + SANS;
      [['Type', 'Amorphous solid'], ['Made from', 'Silica sand'], ['Brittle', 'Yes']].forEach(function (row, k) {
        var ry = by + 320 * u + k * 44 * u;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#202122';
        ctx.fillText(row[0], bx + 18 * u, ry);
        ctx.fillText(row[1], bx + 140 * u, ry);
      });
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ARTICLE.forEach(function (block) {
      if (y > H) return;
      if (block[0] === 'h1') {
        ctx.fillStyle = '#000000';
        ctx.font = '400 ' + 58 * u + 'px ' + SERIF;
        ctx.fillText(block[1], left, y + 40 * u);
        y += 62 * u;
        ctx.fillStyle = '#a2a9b1';
        ctx.fillRect(left, y, textW + (boxW ? boxW + 50 * u : 0), 1.5 * u);
        y += 44 * u;
      } else if (block[0] === 'h2') {
        ctx.fillStyle = '#000000';
        ctx.font = '400 ' + 36 * u + 'px ' + SERIF;
        ctx.fillText(block[1], left, y + 22 * u);
        y += 34 * u;
        ctx.fillStyle = '#c8ccd1';
        ctx.fillRect(left, y, textW, 1.2 * u);
        y += 38 * u;
      } else {
        ctx.fillStyle = '#202122';
        ctx.font = '400 ' + 23 * u + 'px ' + SERIF;
        wrap(ctx, block[1], textW).forEach(function (line) {
          ctx.fillText(line, left, y);
          y += 37 * u;
        });
        y += 18 * u;
      }
    });
  }

  /* ------------------------------------------------------------ registry */

  // chrome: true gives a phone or tablet its status bar, and a laptop or
  // monitor a menu bar and sometimes a dock. 'status' gives only the status
  // bar. ink is the status bar's colour where white would not show.
  var ALL = ['phone', 'tablet', 'laptop', 'monitor'];
  Smash.scenes = [
    { id: 'mountains', label: 'a mountain sunset', draw: mountains, fits: ALL, chrome: true },
    { id: 'aurora', label: 'the northern lights', draw: aurora, fits: ALL, chrome: true },
    { id: 'beach', label: 'a tropical beach', draw: beach, fits: ALL, chrome: true },
    { id: 'reef', label: 'a coral reef', draw: underwater, fits: ALL, chrome: true },
    { id: 'planet', label: 'a ringed planet', draw: space, fits: ALL, chrome: true },
    { id: 'synthwave', label: 'a synthwave sunset', draw: synthwave, fits: ALL, chrome: true },
    { id: 'game', label: 'a pixel-art game', draw: pixelGame, fits: ALL, chrome: false },
    { id: 'cat', label: 'a cartoon cat', draw: cat, fits: ALL, chrome: 'status', ink: '#1c1c1e' },
    { id: 'test-card', label: 'a TV test card', draw: testCard, fits: ALL, chrome: false },
    { id: 'home', label: 'its home screen', draw: homeScreen, fits: ['phone', 'tablet'], chrome: 'status' },
    { id: 'lock', label: 'its lock screen', draw: lockScreen, fits: ['phone', 'tablet'], chrome: 'status' },
    { id: 'code', label: 'a code editor', draw: codeEditor, fits: ['laptop', 'monitor'], chrome: false },
    { id: 'sheet', label: 'a spreadsheet', draw: spreadsheet, fits: ['laptop', 'monitor'], chrome: false },
    { id: 'article', label: 'an article about glass', draw: article, fits: ['tablet', 'laptop', 'monitor'], chrome: false }
  ];

  // pic: { scene, seed, device, time }. Draws the whole picture, in screen
  // units, into a context the caller has already clipped to the screen.
  Smash.drawPicture = function (ctx, W, H, pic) {
    var scene = pic.scene, info = { device: pic.device, time: pic.time };
    ctx.save();
    scene.draw(ctx, W, H, rng(pic.seed), info);
    ctx.restore();
    if (!scene.chrome) return;
    ctx.save();
    if (pic.device === 'phone' || pic.device === 'tablet') {
      statusBar(ctx, W, H, info, scene.ink || '#ffffff');
    } else if (scene.chrome === true) {
      menuBar(ctx, W, H, info);
      if (rng(pic.seed + 1)() < 0.6) desktopDock(ctx, W, H, rng(pic.seed + 2), info);
    }
    ctx.restore();
  };

  Smash.rng = rng;
  Smash.draw = { roundRect: roundRect, fillRound: fillRound, circle: circle, grad: grad, glow: glow, rgba: rgba };
})(this);
