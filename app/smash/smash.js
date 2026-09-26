/* The Smash Screen page: a device, the picture on it, the hammer that
   follows the pointer, the view, the sound and the controls. scenes.js
   draws the pictures and damage.js models each blow.

   Drawing is layered so that a quiet page costs nothing. Two offscreen
   canvases hold everything that has settled: the device, the picture and the
   finished damage in one, the finished cracks in the other. A frame copies
   both and draws only the damage still growing on top. When nothing grows
   and nothing moves, no frames run at all.

   Zoom keeps the same budget. During a pinch or a scroll the page stretches
   the two cached canvases, which is cheap, and redraws them sharp once the
   gesture has rested for a moment. Everything is vector, so one redraw costs
   about as much as one hammer blow at any zoom. The canvas never draws at
   more than twice the CSS pixel size. */
(function () {
  'use strict';

  var S = window.Smash, D = S.draw;
  var TAU = 2 * Math.PI, ZMAX = 8, MAX_HITS = 40;
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('screen');
  var hammerEl = document.getElementById('hammer');
  var ctx = canvas.getContext('2d');
  var flat = document.createElement('canvas'), glass = document.createElement('canvas');
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function now() { return performance.now() / 1000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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

  function makeDevice(type, portrait) {
    var d = { type: type, finish: FINISH[type][Math.floor(Math.random() * FINISH[type].length)] };
    if (type === 'phone') { d.W = 1000; d.H = 2167; d.radius = 140; d.bounds = [-70, -60, 1070, 2227]; }
    else if (type === 'tablet') { d.W = portrait ? 1000 : 1333; d.H = portrait ? 1333 : 1000; d.radius = 40; d.bounds = [-75, -75, d.W + 75, d.H + 75]; }
    else if (type === 'laptop') { d.W = 1600; d.H = 1000; d.radius = [18, 18, 0, 0]; d.bounds = [-150, -56, 1750, 1210]; }
    else { d.W = 1778; d.H = 1000; d.radius = 4; d.bounds = [-26, -26, 1804, 1340]; }
    return d;
  }

  function screenPath(c, d) {
    c.beginPath();
    D.roundRect(c, 0, 0, d.W, d.H, d.radius);
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
      for (var row = 0; row < 4; row++) {
        var y0 = 1088 + row * 20 + row * row * 1.5, y1 = y0 + 15 + row * 2;
        var inset0 = 40 - row * 26, inset1 = inset0 - 20;
        for (var key = 0; key < 14; key++) {
          var fa = key / 14, fb = (key + 0.86) / 14;
          var xa0 = (-40 + inset0) + (1680 - 2 * inset0) * fa, xb0 = (-40 + inset0) + (1680 - 2 * inset0) * fb;
          var xa1 = (-40 + inset1) + (1680 - 2 * inset1) * fa, xb1 = (-40 + inset1) + (1680 - 2 * inset1) * fb;
          c.beginPath();
          c.moveTo(xa0 + 20, y0);
          c.lineTo(xb0 + 20, y0);
          c.lineTo(xb1 + 20, y1);
          c.lineTo(xa1 + 20, y1);
          c.closePath();
          c.fillStyle = 'rgba(20,21,24,0.82)';
          c.fill();
        }
      }
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
  }

  // Parts that sit over the picture: the phone's camera cut-out.
  function drawOverlay(c, d) {
    if (d.type === 'phone') D.fillRound(c, d.W / 2 - 155, 30, 310, 90, 45, '#000000');
  }

  /* ------------------------------------------------------------ layout */

  var sw = 0, sh = 0, dpr = 1;
  var dev = null, pic = null, place = { k: 1, ox: 0, oy: 0 };
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
    if (!dev) return;
    var b = dev.bounds, bw = b[2] - b[0], bh = b[3] - b[1], pad = Math.min(sw, sh) * 0.05 + 8;
    place.k = Math.min((sw - 2 * pad) / bw, (sh - 2 * pad) / bh);
    place.ox = (sw - bw * place.k) / 2 - b[0] * place.k;
    place.oy = (sh - bh * place.k) / 2 - b[1] * place.k;
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
    if (active.length) {
      setUnits(ctx, view);
      ctx.save();
      screenPath(ctx, dev);
      ctx.clip();
      S.Damage.drawGlass(ctx, active, t, env());
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- the loop */

  var raf = 0, settleTimer = 0, shake = null;
  function request() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    var t = now(), more = false;
    if (zoomAnim && stepZoom(t)) more = true;
    if (stepHammer(t)) more = true;
    var done = active.filter(function (h) { return t >= h.t0 + h.end; });
    if (done.length) {
      active = active.filter(function (h) { return done.indexOf(h) < 0; });
      settled = settled.concat(done);
      if (cacheView && !dirty && cacheView.z === view.z && cacheView.cx === view.cx && cacheView.cy === view.cy) bake(done, t);
      else dirty = true;
    }
    var resting = !zoomAnim && !gesture.active() && t - lastView > 0.15;
    if (!cacheView || (dirty && resting) || (resting && (cacheView.z !== view.z || cacheView.cx !== view.cx || cacheView.cy !== view.cy))) {
      renderCaches(t);
    }
    // A resize clears the caches. Keep drawing until they are rebuilt.
    if (dirty) more = true;
    compose(t);
    if (active.length) more = true;
    if (shake) {
      var p = (t - shake.t0) / 0.22;
      if (p >= 1) {
        canvas.style.transform = '';
        shake = null;
      } else {
        var amp = shake.amp * Math.pow(1 - p, 2);
        canvas.style.transform = 'translate(' + (Math.sin(p * 47) * amp).toFixed(2) + 'px,' + (Math.cos(p * 39) * amp).toFixed(2) + 'px)';
        more = true;
      }
    }
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
    zoomAnim = null;
    view = zoomed(view, f, x, y);
    viewChanged();
  }
  function zoomTowards(f, x, y) {
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

  /* ------------------------------------------------------------ hammer */

  // The hammer is drawn in index.html. At rest its striking face sits on
  // the pointer, and it swings about the end of its handle.
  var PIVOT = [110, 140], FACE = [15.5, 58.3];
  var hammer = { x: 0, y: 0, a: 0, s: 1, phase: 'rest', t0: 0, from: 0, queued: false, shown: false, touch: false, soft: false, pressAt: 0, strength: 1 };
  var hammerBase = 1, hideTimer = 0, lastImpact = null;

  function placeHammer() {
    var b = hammerBase;
    var tx = hammer.x - PIVOT[0] - b * (FACE[0] - PIVOT[0]), ty = hammer.y - PIVOT[1] - b * (FACE[1] - PIVOT[1]);
    hammerEl.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotate(' + hammer.a.toFixed(2) + 'deg) scale(' + (hammer.s * b).toFixed(3) + ')';
  }
  function showHammer(on) {
    clearTimeout(hideTimer);
    if (hammer.shown === on) return;
    hammer.shown = on;
    hammerEl.style.opacity = on ? '1' : '0';
  }
  function hideLater() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (hammer.phase === 'rest') showHammer(false); }, 700);
  }
  function moveHammer(x, y) {
    hammer.x = x;
    hammer.y = y;
    placeHammer();
  }

  // Press to lift, release to strike. The hammer keeps rising while the
  // press lasts, up to 70 degrees after about 0.9 s, and the height it
  // reaches sets the blow: a quick click is a tap, a long hold a smash.
  var LIFT = 70;
  function lift(dt) {
    return 24 * (1 - Math.pow(1 - Math.min(1, dt / 0.12), 2)) + (LIFT - 24) * Math.pow(clamp((dt - 0.12) / 0.75, 0, 1), 0.8);
  }
  function windUp() {
    hammer.phase = 'wind';
    hammer.t0 = hammer.pressAt = now();
    hammer.from = hammer.a;
    hammer.queued = false;
    request();
  }
  function release() {
    if (hammer.phase !== 'wind') return;
    hammer.strength = clamp((lift(now() - hammer.t0) - 14) / (LIFT - 14), 0, 1);
    if (hammer.a < 20) hammer.queued = true;
    else strike();
  }
  function strike() {
    hammer.phase = 'strike';
    hammer.t0 = now();
    hammer.from = hammer.a;
    playSwing(hammer.strength);
    request();
  }
  function lower() {
    if (hammer.phase !== 'wind') return;
    hammer.phase = 'recoil';
    hammer.t0 = now();
    hammer.from = hammer.a;
    hammer.soft = true;
    request();
  }

  function stepHammer(t) {
    var h = hammer, p;
    if (h.phase === 'wind') {
      var dt = t - h.t0;
      h.a = h.from * Math.max(0, 1 - dt / 0.12) + lift(dt);
      // At full height the hammer trembles, held back as hard as it goes.
      if (dt > 0.87 && !reduceMotion) h.a += Math.sin(dt * 110) * 1.2;
      if (h.queued && h.a >= 20) strike();
    } else if (h.phase === 'strike') {
      p = Math.min(1, (t - h.t0) / (0.05 + 0.03 * h.from / LIFT));
      h.a = h.from * (1 - p * p);
      if (p >= 1) {
        contact();
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
    h.s = 1 + 0.16 * Math.max(0, h.a) / LIFT;
    placeHammer();
    return true;
  }

  function contact() {
    var u = toUnits(hammer.x, hammer.y), W = dev.W, H = dev.H, lid = dev.lid, strength = hammer.strength;
    var onScreen = u[0] >= 0 && u[1] >= 0 && u[0] <= W && u[1] <= H;
    // A blow on the bezel still breaks the screen, from its edge.
    if (!onScreen && u[0] >= lid[0] && u[1] >= lid[1] && u[0] <= lid[2] && u[1] <= lid[3]) {
      u = [clamp(u[0], W * 0.01, W * 0.99), clamp(u[1], H * 0.01, H * 0.99)];
      onScreen = true;
      strength *= 0.8;
    }
    var total = settled.length + active.length;
    if (onScreen && total < MAX_HITS) {
      active.push(S.Damage.make({ x: u[0], y: u[1], W: W, H: H, seed: (Math.random() * 4294967296) >>> 0, t0: now(),
                                  device: dev.type, px: place.k, strength: strength, first: total === 0 }));
      lastImpact = u;
      playHit(strength, true);
      updateCaption(total + 1, true);
    } else {
      playHit(strength * 0.7, false);
      if (onScreen) updateCaption(total, true);
    }
    if (!reduceMotion) shake = { t0: now(), amp: (onScreen ? 7 : 3) * strength };
    request();
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
    if (e.button > 0) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    stage.focus({ preventScroll: true });
    ensureAudio();
    var p = local(e);
    pointers.set(e.pointerId, { x: p[0], y: p[1] });
    hammer.touch = e.pointerType !== 'mouse';
    if (pointers.size === 1) {
      press = { id: e.pointerId, x: p[0], y: p[1], moved: false };
      moveHammer(p[0], p[1]);
      showHammer(true);
      windUp();
    } else if (pointers.size === 2) {
      press = null;
      lower();
      pinch = pinchState();
    }
  });
  stage.addEventListener('pointermove', function (e) {
    var p = local(e), q = pointers.get(e.pointerId);
    if (!q) {
      if (e.pointerType === 'mouse') {
        moveHammer(p[0], p[1]);
        showHammer(true);
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
    // Zoomed in, a drag moves the view instead of aiming the hammer.
    if (!press.moved && view.z > 1 && Math.hypot(p[0] - press.x, p[1] - press.y) > 6) {
      press.moved = true;
      lower();
    }
    if (press.moved) panBy(dx, dy);
    else moveHammer(p[0], p[1]);
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
    if (hammer.touch && !pointers.size && hammer.phase === 'rest') hideLater();
  }
  stage.addEventListener('pointerup', pointerEnd);
  stage.addEventListener('pointercancel', pointerEnd);
  stage.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse' && !pointers.size) showHammer(false);
  });

  // Mouse wheels send big steps, animated. Trackpads send small ones, and a
  // pinch arrives as a wheel event with ctrlKey set; both apply at once.
  stage.addEventListener('wheel', function (e) {
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
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var step = e.shiftKey ? 48 : 12, k = e.key;
    if (k.indexOf('Arrow') === 0) {
      e.preventDefault();
      if (!hammer.shown) showHammer(true);
      moveHammer(clamp(hammer.x + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0), 0, sw),
                 clamp(hammer.y + (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0), 0, sh));
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (e.repeat || hammer.phase !== 'rest') return;
      ensureAudio();
      hammer.touch = false;
      showHammer(true);
      windUp();
    } else if (k === '+' || k === '=') {
      e.preventDefault();
      zoomTowards(2, hammer.x, hammer.y);
    } else if (k === '-' || k === '_') {
      e.preventDefault();
      zoomTowards(0.5, hammer.x, hammer.y);
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
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N') newDevice();
    else if (e.key === 'm' || e.key === 'M') setMuted(!muted);
  });

  /* ------------------------------------------------------------- sound */

  // Synthesised in the browser: a thud, then for glass a sharp snap, a
  // crackle of tiny grains and a few high pings. No audio files.
  var audio = null, muted = false;
  try { muted = localStorage.getItem('smash-muted') === '1'; } catch (e) {}

  function ensureAudio() {
    if (audio) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var ac = new AC(), comp = ac.createDynamicsCompressor(), out = ac.createGain();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    out.gain.value = muted ? 0 : 0.7;
    out.connect(comp);
    comp.connect(ac.destination);
    var buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio = { ctx: ac, out: out, noise: buf };
    return audio;
  }

  function envelope(a, t, attack, dur, gain) {
    var g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(a.out);
    return g;
  }
  function noise(a, t, dur, type, freq, q, gain) {
    var src = a.ctx.createBufferSource(), f = a.ctx.createBiquadFilter();
    src.buffer = a.noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(envelope(a, t, 0.001, dur, gain));
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }
  function tone(a, t, f0, f1, dur, gain) {
    var o = a.ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(envelope(a, t, 0.002, dur, gain));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function playSwing(strength) {
    if (!audio || muted) return;
    var t = audio.ctx.currentTime, f = noise(audio, t, 0.09, 'bandpass', 500, 1.2, 0.02 + 0.05 * strength);
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
  }
  function playHit(strength, onGlass) {
    if (!audio || muted) return;
    var a = audio, t = a.ctx.currentTime + 0.005, g = 0.25 + 0.75 * strength;
    tone(a, t, 150, 50, 0.22, 0.55 * g);
    noise(a, t, 0.06, 'bandpass', 1800, 1.1, 0.35 * g);
    if (!onGlass) return;
    noise(a, t, 0.06 + 0.08 * strength, 'highpass', 2600, 0.7, 0.5 * g);
    for (var i = 0, n = 3 + Math.round(21 * strength); i < n; i++) {
      noise(a, t + Math.pow(Math.random(), 2) * 0.35 * g, 0.006 + Math.random() * 0.02, 'bandpass',
            2500 + Math.random() * 6500, 4 + Math.random() * 8, (0.08 + Math.random() * 0.25) * g);
    }
    for (i = 0; i < Math.round(1 + 3 * strength); i++) {
      var f0 = 3000 + Math.random() * 4500;
      tone(a, t + 0.02 + Math.random() * 0.3, f0, f0 * 0.98, 0.15 + Math.random() * 0.35, 0.025 + Math.random() * 0.03);
    }
  }

  var soundBtn = document.getElementById('sound');
  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('smash-muted', m ? '1' : '0'); } catch (e) {}
    soundBtn.setAttribute('aria-pressed', m ? 'false' : 'true');
    soundBtn.textContent = m ? 'Sound off' : 'Sound on';
    if (audio) audio.out.gain.setTargetAtTime(m ? 0 : 0.7, audio.ctx.currentTime, 0.02);
  }

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

  function newDevice(want) {
    want = want || {};
    var type = NAMES[want.device] ? want.device : chooseType();
    var portrait = type !== 'tablet' || (want.orient ? want.orient === 'portrait' : Math.random() < (sh > sw ? 0.8 : 0.3));
    dev = makeDevice(type, portrait);
    dev.lid = type === 'laptop' ? [-34, -52, dev.W + 34, dev.H + 70] : type === 'monitor' ? [-26, -26, dev.W + 26, dev.H + 64] : dev.bounds;
    lastType = type;
    var options = S.scenes.filter(function (sc) { return sc.fits.indexOf(type) >= 0 && recent.indexOf(sc.id) < 0; });
    var scene = S.scenes.filter(function (sc) { return sc.id === want.scene && sc.fits.indexOf(type) >= 0; })[0] ||
                options[Math.floor(Math.random() * options.length)];
    recent.push(scene.id);
    if (recent.length > 5) recent.shift();
    pic = { scene: scene, seed: want.seed || (Math.random() * 4294967296) >>> 0, device: type, time: new Date() };
    settled = [];
    active = [];
    lastImpact = null;
    zoomAnim = null;
    shake = null;
    canvas.style.transform = '';
    layout();
    updateCaption(0, false);
    updateZoomUI();
    request();
  }

  function updateCaption(hits, announce) {
    var text = 'A ' + NAMES[dev.type] + ' showing ' + pic.scene.label + '.';
    if (hits >= MAX_HITS) text = 'This ' + NAMES[dev.type] + ' has had enough. Try a new device.';
    else if (hits) text += ' ' + hits + (hits === 1 ? ' hit.' : ' hits.');
    caption.textContent = text;
    if (announce) status.textContent = hits >= MAX_HITS ? text : 'Hit ' + hits + '. The screen cracks.';
  }

  /* ---------------------------------------------------------- controls */

  var zoomIn = document.getElementById('zoom-in'), zoomOut = document.getElementById('zoom-out'), zoomFit = document.getElementById('zoom-fit');
  function updateZoomUI() {
    var z = zoomAnim ? zoomAnim.to.z : view.z;
    zoomFit.textContent = (z < 9.95 ? Math.round(z * 10) / 10 : Math.round(z)) + '\u00d7';
    zoomOut.disabled = zoomFit.disabled = z <= 1.001;
    zoomIn.disabled = z >= ZMAX - 0.001;
  }
  zoomIn.addEventListener('click', function () { var p = anchor(); zoomTowards(2, p[0], p[1]); });
  zoomOut.addEventListener('click', function () { var p = anchor(); zoomTowards(0.5, p[0], p[1]); });
  zoomFit.addEventListener('click', function () { zoomTowards(1 / view.z, sw / 2, sh / 2); });
  document.getElementById('new-device').addEventListener('click', function () { newDevice(); });
  soundBtn.addEventListener('click', function () {
    ensureAudio();
    setMuted(!muted);
  });

  /* -------------------------------------------------------------- start */

  if (window.Theme) Theme.wireThemeToggle();
  hammerBase = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 0.8 : 1;
  if (window.matchMedia && matchMedia('(hover: none)').matches) {
    document.getElementById('hint').textContent = 'Tap to swing the hammer. Hold it back longer for a harder hit. Pinch to zoom in on the damage.';
  }
  setMuted(muted);
  hammerEl.style.opacity = '0';

  // The address can ask for a device, picture and seed, as in
  // #device=laptop&scene=synthwave&seed=42. The share card uses this.
  var want = {};
  location.hash.slice(1).split('&').forEach(function (kv) {
    var p = kv.split('=');
    if (p[0]) want[p[0]] = decodeURIComponent(p[1] || '');
  });
  want.seed = +want.seed || 0;
  layout();
  newDevice(want);
  moveHammer(sw / 2, sh / 2);

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
