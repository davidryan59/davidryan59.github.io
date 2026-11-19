/* The stage for the Hyperbolic Models Explorer video. render.js adds it to
   the real app page, app/hyperbolic/, after the app has started and after
   timeline.js. It reads the shape from body.video-square or
   body.video-wide.

   For each frame, plan(n) says where the pointer is and whether its button
   is down. render.js moves the real mouse there, so the app hears every
   press, drag and release as it does on the page. Then draw(n) makes the
   timeline's model changes and view glides through window.Hyper, runs the
   app's animation frame at the frame's exact time, and draws the captions,
   the address and the pointer over the app. Frames must be drawn in order. */
(function () {
  'use strict';

  var T = window.HyperTimeline, H = window.Hyper;
  var FRAME_MS = Math.round(1000 / T.FPS * 4096) / 4096;
  var wide = document.body.classList.contains('video-wide');

  function appTime(n) { return n * FRAME_MS; }
  function sec(n) { return n / T.FPS; }

  // Layout -------------------------------------------------------------------

  // In the square, the model fills the page as the app draws it. In 4:3,
  // the model card stays on the left, and the model is drawn in the space
  // to its right.
  var disk = { cx: 0, cy: 0, r: 0, zoom: 1, pan: [0, 0] };
  function layout() {
    var w = document.documentElement.clientWidth, h = document.documentElement.clientHeight, half = Math.min(w, h) / 2;
    if (!wide) { disk = { cx: w / 2, cy: h / 2, r: half, zoom: 1, pan: [0, 0] }; return; }
    var left = document.querySelector('.card.title').getBoundingClientRect().right + 12;
    var r = Math.min((w - left) / 2, half) * 0.97, cx = (left + w) / 2;
    disk = { cx: cx, cy: h / 2, r: r, zoom: r / half, pan: [-(cx - w / 2) / r, 0] };
  }
  function applyLayout() {
    H.state.zoom = disk.zoom;
    H.state.pan = disk.pan.slice();
    H.invalidate();
  }
  function page(u) { return [disk.cx + u[0] * disk.r, disk.cy + u[1] * disk.r]; }

  // Pointer ----------------------------------------------------------------

  var at = null;
  var segments = T.PATH.map(function (s) {
    return { t0: s[0], t1: s[1], to: s[2], drag: !!(s[3] && s[3].drag), bend: s[3] && s[3].bend || 0 };
  });

  // A quadratic curve whose middle is lifted by bend, in disk units, up
  // the screen. A move that is not a drag arcs by at most 12 px.
  function control(p0, p1, bend) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    var h = bend ? bend * disk.r : Math.min(0.12 * len, 12);
    return [(p0[0] + p1[0]) / 2 + nx * h, (p0[1] + p1[1]) / 2 + ny * h];
  }

  function pointerAt(t) {
    var s = null;
    segments.forEach(function (seg) { if (seg.t0 <= t) s = seg; });
    if (!s || s.done) return at;
    if (!s.start) s.start = at.slice();
    var u = T.ease((t - s.t0) / (s.t1 - s.t0)), end = page(s.to), c = control(s.start, end, s.bend), a = 1 - u;
    var p = [a * a * s.start[0] + 2 * a * u * c[0] + u * u * end[0],
             a * a * s.start[1] + 2 * a * u * c[1] + u * u * end[1]];
    if (t >= s.t1) s.done = true;
    at = p;
    return p;
  }

  // Overlay ----------------------------------------------------------------

  function layer(tag, className) {
    var el = document.createElement(tag);
    el.className = 'video-layer ' + className;
    document.body.appendChild(el);
    return el;
  }

  // A change of model crossfades: a still of the frame before the change
  // lies over the app and fades out. It sits under the captions and the
  // pointer, which stay sharp.
  var fadeImg = document.createElement('img');
  fadeImg.className = 'video-fade';
  document.body.appendChild(fadeImg);
  var fadeFrom = null;

  var address = layer('div', 'video-card video-address');
  address.textContent = 'drbuild.uk/hyperbolic';

  var captions = T.CAPTIONS.map(function (c, i) {
    var el = layer('div', 'video-card video-caption' + (i === 0 ? ' title' : ''));
    el.innerHTML = '<div class="main"></div>' + (c[3] ? '<div class="sub"></div>' : '');
    el.querySelector('.main').textContent = c[2];
    if (c[3]) el.querySelector('.sub').textContent = c[3];
    return el;
  });

  var pointer = layer('div', 'video-pointer');
  pointer.innerHTML = '<svg width="40" height="52" viewBox="0 0 26 34" aria-hidden="true">' +
    '<path d="M3 3 V26.5 L9.2 20.6 L13.4 30.4 L17.6 28.6 L13.5 19 H21.8 Z" fill="#fbfaf6" ' +
    'stroke="#0e0e10" stroke-width="1.7" stroke-linejoin="round"/></svg>';

  // Each card hugs its widest balanced line. In 4:3 the captions sit over
  // the model, right of the model card.
  function sizeCaptions() {
    var left = wide ? document.querySelector('.card.title').getBoundingClientRect().right + 19 : 19;
    captions.forEach(function (el) {
      el.style.left = left + 'px';
      el.style.width = '640px';
      var w = 0;
      Array.prototype.forEach.call(el.children, function (block) {
        var range = document.createRange();
        range.selectNodeContents(block);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) { w = Math.max(w, rect.width); });
      });
      el.style.width = Math.min(640, Math.ceil(w) + 58 + 4) + 'px';
    });
  }

  function captionAlpha(c, t) {
    var a = 0;
    [t - T.SECONDS, t, t + T.SECONDS].forEach(function (x) {
      if (x < c[0] || x > c[1]) return;
      a = Math.max(a, T.smooth(Math.min(1, (x - c[0]) / T.FADE, (c[1] - x) / T.FADE)));
    });
    return a;
  }

  function overlay(t, p) {
    var f = fadeFrom === null ? 0 : 1 - T.smooth((t - fadeFrom) / T.FADE_CHANGE);
    fadeImg.style.visibility = f > 0 ? 'visible' : 'hidden';
    fadeImg.style.opacity = f.toFixed(3);
    T.CAPTIONS.forEach(function (c, i) {
      var a = captionAlpha(c, t);
      captions[i].style.visibility = a > 0 ? 'visible' : 'hidden';
      captions[i].style.opacity = a.toFixed(3);
    });
    // The pointer squeezes a little while its button is down.
    var squeeze = T.pressed(t) ? 0.9 : 1;
    pointer.style.transform = 'translate(' + (p[0] - 4.6).toFixed(2) + 'px, ' + (p[1] - 4.6).toFixed(2) + 'px) scale(' + squeeze + ')';
  }

  // View -------------------------------------------------------------------

  // A glide moves the view along one line, so its steps add up: each frame
  // moves it by the change in eased distance since the last frame.
  var glideDone = T.GLIDES.map(function () { return 0; });
  function glideView(t) {
    T.GLIDES.forEach(function (g, i) {
      if (t < g[0]) return;
      var u = T.ease((t - g[0]) / (g[1] - g[0])), d = u - glideDone[i];
      if (!d) return;
      glideDone[i] = u;
      H.setT(H.mul(H.step(g[2] * d, g[3] * d), H.state.T));
    });
  }

  // The last change returns to the home view. Each frame starts from the
  // app's own reset, the exact state it opened in, and steps out by the
  // part of HOME_FROM still to go, so the final frames match the first.
  var changeAt = 0, homeFrom = null;
  function homeView(t) {
    if (homeFrom === null) return;
    var k = 1 - T.ease((t - homeFrom) / (T.HOME_AT - homeFrom));
    H.resetView();
    if (k > 0) H.setT(H.step(T.HOME_FROM[0] * k, T.HOME_FROM[1] * k));
    if (wide) applyLayout();
    if (k === 0) homeFrom = null;
  }

  function changes(t) {
    var out = [];
    while (changeAt < T.CHANGES.length && T.CHANGES[changeAt][0] <= t) out.push(T.CHANGES[changeAt++]);
    return out;
  }

  // Frames -----------------------------------------------------------------

  var next = 0, plannedFor = -1, nowMs = 0, pending = [];
  var log = [];

  function appState() {
    var s = H.state;
    return { model: s.model, zoom: +s.zoom.toFixed(3), T: s.T.map(function (x) { return +x.toFixed(4); }) };
  }

  function plan(n) {
    if (n !== next) throw new Error('frame ' + n + ' planned out of order: expected ' + next);
    var t = sec(n);
    nowMs = appTime(n);
    window.videoClock.set(nowMs);
    var p = pointerAt(t);
    pending = changes(t);
    plannedFor = n;
    return { x: +p[0].toFixed(3), y: +p[1].toFixed(3), down: T.pressed(t), change: pending.length > 0 };
  }

  function draw(n) {
    if (n !== plannedFor) throw new Error('frame ' + n + ' drawn before it was planned');
    next = n + 1;
    var t = sec(n);
    pending.forEach(function (c) {
      log.push({ t: +t.toFixed(2), model: c[1], before: appState() });
      fadeFrom = t;
      H.setModel(c[1]);
      if (c[2] && c[2].home) homeFrom = t;
      if (wide) applyLayout();
    });
    glideView(t);
    homeView(t);
    window.videoClock.frame(nowMs);
    overlay(t, at);
  }

  function start() {
    layout();
    if (wide) applyLayout();
    at = page(T.REST);
    sizeCaptions();
    return at.slice();
  }

  window.video = {
    ready: document.fonts.ready.then(function () { return true; }),
    start: start,
    fade: function (src) { fadeImg.src = src; return fadeImg.decode(); },
    plan: plan,
    draw: draw,
    state: appState,
    log: log
  };
})();
