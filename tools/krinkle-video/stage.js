/* The stage for the Krinkle explorer video. render.js adds it to the real
   app page, after the app has started and after timeline.js.

   For each frame, plan(n) says where the pointer is, whether its button is
   down, and what a click landing on this frame does besides. render.js moves
   the real mouse there, so the app hears every hover, press, drag and click
   as it does on the page. Then draw(n) runs the app's animation frame at the
   frame's exact time, holds the page's CSS transitions at that time, and
   draws the captions, the address and the pointer over the app. render.js
   calls settled() until the map has drawn every tile in view. Frames must be
   drawn in order. */
(function () {
  'use strict';

  var T = window.KrinkleTimeline;
  var SPB = T.SEC_PER_BEAT;
  var FRAME_MS = Math.round(1000 / T.FPS * 4096) / 4096;
  var PRESS = T.PRESS / SPB;           // beats a button is down before its click
  var RIPPLE = 0.42 / SPB;             // the ring a click sends out lasts 0.42 s
  var X0 = T.CLIP[0];                  // the filmed area's left edge

  function appTime(n) { return n * FRAME_MS; }

  // Targets ----------------------------------------------------------------

  function preset(i) { return '#presets button:nth-child(' + (i + 1) + ')'; }
  var SELECTORS = {
    'p-3-7': preset(0), 'p-3-7-14': preset(1), 'p-5-16': preset(2), 'p-1-4': preset(3), 'p-3-4': preset(9),
    'p-2-9-3': preset(10), 'p-9-10': preset(11),
    'zoom-out': '#zoom-out', 'zoom-in': '#zoom-in', 'turn-left': '#turn-left',
    'tab-tile': '#tab-tile', 'tab-arrangement': '#tab-arrangement',
    'dice': '#random-colours', 'scheme': '#scheme', 'shape': '#shape',
    'k-up': '.stepper[data-param="k"] button[data-step="1"]',
    'k-down': '.stepper[data-param="k"] button[data-step="-1"]',
    'bend-zero': '#bend-zero',
    'layout-repeat': '#layout label:has(input[value="repeat"])',
    'layout-fan': '#layout label:has(input[value="fan"])',
    'set-values': '#set-values', 'value-m': '#value-m', 'value-k': '#value-k', 'value-t': '#value-t',
    'values-apply': '#values-form button[type="submit"]',
    'scrub-start': '#scrub', 'scrub-end': '#scrub'
  };

  // A hand clicks a little above and left of a button's middle. The
  // scrubber is pressed at its left end and released at its right end.
  function targetPoint(name) {
    var el = document.querySelector(SELECTORS[name]);
    if (!el) throw new Error('no element for ' + name);
    var r = el.getBoundingClientRect();
    if (!r.width) throw new Error(name + ' is hidden when the pointer moves to it');
    if (name === 'scrub-start') return [r.left + 3, r.top + r.height / 2];
    if (name === 'scrub-end') return [r.right - 1, r.top + r.height / 2];
    return [r.left + r.width * 0.46, r.top + r.height * 0.46];
  }

  function onTarget(name, p) {
    var el = document.elementFromPoint(p[0], p[1]);
    return !!el && !!el.closest(SELECTORS[name]);
  }

  // Pointer ----------------------------------------------------------------

  var segments = T.MOVES.map(function (m) { return { b0: m[0], b1: m[1], target: m[2] }; })
    .concat(T.DRAGS.map(function (d) { return { b0: d[0], b1: d[1], target: d[2], drag: true }; }))
    .sort(function (a, b) { return a.b0 - b.b0; });
  var at = targetPoint(T.REST);

  // A gentle upward arc of at most 12 px. A drag runs straight.
  function control(p0, p1) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len, h = Math.min(0.12 * len, 12);
    if (ny > 0) { nx = -nx; ny = -ny; }
    return [(p0[0] + p1[0]) / 2 + nx * h, (p0[1] + p1[1]) / 2 + ny * h];
  }

  function pointerAt(b) {
    var s = null;
    segments.forEach(function (seg) { if (seg.b0 <= b) s = seg; });
    if (!s || s.done) return at;
    if (!s.start) s.start = at.slice();
    var u = s.drag ? Math.min(1, Math.max(0, (b - s.b0) / (s.b1 - s.b0))) : T.ease((b - s.b0) / (s.b1 - s.b0));
    var end = targetPoint(s.target), p;
    if (s.drag) {
      p = [s.start[0] + (end[0] - s.start[0]) * u, s.start[1] + (end[1] - s.start[1]) * u];
    } else {
      var c = control(s.start, end), a = 1 - u;
      p = [a * a * s.start[0] + 2 * a * u * c[0] + u * u * end[0],
           a * a * s.start[1] + 2 * a * u * c[1] + u * u * end[1]];
    }
    if (b >= s.b1) s.done = true;
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

  // A change of tiling crossfades: a still of the frame before the change
  // lies over the app and fades out. It sits under the captions and the
  // pointer, which stay sharp.
  var fadeImg = document.createElement('img');
  fadeImg.className = 'video-fade';
  document.body.appendChild(fadeImg);
  var fadeFrom = null;
  function setFade(src, b) {
    fadeImg.src = src;
    fadeFrom = b;
    return fadeImg.decode();
  }

  var address = layer('div', 'video-card video-address');
  address.textContent = 'drbuild.uk/krinkle';

  var captions = T.CAPTIONS.map(function (c, i) {
    var el = layer('div', 'video-card video-caption' + (i === 0 ? ' title' : ''));
    el.innerHTML = '<div class="main"></div>' + (c[3] ? '<div class="sub"></div>' : '');
    el.querySelector('.main').textContent = c[2];
    if (c[3]) el.querySelector('.sub').textContent = c[3];
    el.style.left = (X0 + 19) + 'px';
    return el;
  });

  var ripples = [layer('div', 'video-ripple'), layer('div', 'video-ripple')];
  var pointer = layer('div', 'video-pointer');
  pointer.innerHTML = '<svg width="40" height="52" viewBox="0 0 26 34" aria-hidden="true">' +
    '<path d="M3 3 V26.5 L9.2 20.6 L13.4 30.4 L17.6 28.6 L13.5 19 H21.8 Z" fill="#fbfaf6" ' +
    'stroke="#0e0e10" stroke-width="1.7" stroke-linejoin="round"/></svg>';

  // Each card hugs its widest balanced line.
  function sizeCaptions() {
    captions.forEach(function (el) {
      var w = 0;
      Array.prototype.forEach.call(el.children, function (block) {
        var range = document.createRange();
        range.selectNodeContents(block);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) { w = Math.max(w, rect.width); });
      });
      el.style.width = Math.min(640, Math.ceil(w) + 58 + 4) + 'px';
    });
  }

  function captionAlpha(c, b) {
    var fade = T.FADE / SPB, a = 0;
    [b - T.BEATS, b, b + T.BEATS].forEach(function (x) {
      if (x < c[0] || x > c[1]) return;
      a = Math.max(a, T.smooth(Math.min(1, (x - c[0]) / fade, (c[1] - x) / fade)));
    });
    return a;
  }

  var clicked = [];       // [beat, point] of each click, for its ring

  function overlay(b, p) {
    var f = fadeFrom === null ? 0 : 1 - T.smooth((b - fadeFrom) / (T.FADE_CHANGE / SPB));
    fadeImg.style.visibility = f > 0 ? 'visible' : 'hidden';
    fadeImg.style.opacity = f.toFixed(3);

    T.CAPTIONS.forEach(function (c, i) {
      var a = captionAlpha(c, b);
      captions[i].style.visibility = a > 0 ? 'visible' : 'hidden';
      captions[i].style.opacity = a.toFixed(3);
    });

    var press = null, squeeze = 1;
    T.CLICKS.forEach(function (c) { if (c[0] - PRESS <= b) press = [c[0] - PRESS, c[0]]; });
    T.DRAGS.forEach(function (d) { if (d[0] <= b && (!press || d[0] > press[0])) press = [d[0], d[1]]; });
    if (press && b < press[1]) squeeze = 1 - 0.1 * T.smooth((b - press[0]) / PRESS);
    else if (press) squeeze = 1 - 0.1 * (1 - T.smooth((b - press[1]) / (0.12 / SPB)));
    pointer.style.transform = 'translate(' + (p[0] - 4.6).toFixed(2) + 'px, ' + (p[1] - 4.6).toFixed(2) + 'px) scale(' + squeeze.toFixed(4) + ')';

    var live = clicked.filter(function (c) { return b >= c[0] && b - c[0] < RIPPLE; }).slice(-2);
    ripples.forEach(function (el, i) {
      var c = live[i];
      if (!c) { el.style.visibility = 'hidden'; return; }
      var u = (b - c[0]) / RIPPLE, r = 5 + 23 * (1 - Math.pow(1 - u, 3));
      el.style.visibility = 'visible';
      el.style.opacity = (0.85 * (1 - u) * (1 - u)).toFixed(3);
      el.style.left = (c[1][0] - r).toFixed(2) + 'px';
      el.style.top = (c[1][1] - r).toFixed(2) + 'px';
      el.style.width = el.style.height = (2 * r).toFixed(2) + 'px';
    });
  }

  // The page's CSS transitions run on the browser's own clock. Each one is
  // held still instead, and set to the video's time since it began.
  var began = new WeakMap();
  function holdTransitions(ms) {
    document.getAnimations().forEach(function (animation) {
      if (!began.has(animation)) {
        began.set(animation, ms);
        animation.pause();
      }
      animation.currentTime = ms - began.get(animation);
    });
  }

  // Zoom glides --------------------------------------------------------------

  // The timeline's glides, and the glide after each change of tiling, run
  // the zoom on a sine curve in log scale about the middle of the map.
  // A change's new tiling is built while the click's frame settles, and
  // the app then starts its own quick zoom home. On the next frame the
  // stage takes that zoom over.
  var openScale = null, glide = null, zoomAt = 0, changedOn = null;
  function glideZoom(n, b) {
    var s = window.__tm.state().s;
    if (openScale === null) openScale = s;
    if (changedOn !== null && n > changedOn) {
      var target = window.__tm.takeZoom();
      changedOn = null;
      if (target) glide = { b0: b, b1: b + T.GLIDE_CHANGE / SPB, s0: s, s1: target };
    }
    while (zoomAt < T.ZOOMS.length && T.ZOOMS[zoomAt][0] <= b) {
      var z = T.ZOOMS[zoomAt++];
      glide = { b0: z[0], b1: z[1], s0: s, s1: openScale * z[2] };
    }
    if (!glide) return;
    var u = T.ease((b - glide.b0) / (glide.b1 - glide.b0));
    window.__tm.setScale(glide.s0 * Math.pow(glide.s1 / glide.s0, u));
    if (b >= glide.b1) glide = null;
  }

  // Frames -----------------------------------------------------------------

  var next = 0, lastDown = false, plannedFor = -1, clickAt = 0, nowMs = 0;
  var log = [];             // what render.js checks after the render

  // The app's own words for its state, for the log.
  function appState() {
    var s = window.__tm.state();
    return {
      readout: document.getElementById('readout').textContent,
      scheme: document.getElementById('scheme').value,
      stage: document.getElementById('stage').textContent,
      scale: +s.s.toFixed(3)
    };
  }

  // Clicks that land on frame n: the first frame at or after each beat.
  function landing(n) {
    var b = n / T.FPS / SPB, out = [];
    while (clickAt < T.CLICKS.length && T.CLICKS[clickAt][0] <= b) out.push(T.CLICKS[clickAt++]);
    return out;
  }

  function plan(n) {
    if (n !== next) throw new Error('frame ' + n + ' planned out of order: expected ' + next);
    var b = n / T.FPS / SPB;
    nowMs = appTime(n);
    window.videoClock.set(nowMs);
    var p = pointerAt(b), down = T.pressed(b), extra = [];
    landing(n).forEach(function (c) {
      var o = c[2] || {};
      clicked.push([b, p.slice()]);
      log.push({ beat: +b.toFixed(2), click: c[1], onTarget: onTarget(c[1], p), state: appState() });
      if (o.seed) window.videoClock.seed(o.seed);
      if (o.select) extra.push({ select: SELECTORS[c[1]], value: o.select });
      if (o.fill) extra.push({ fill: SELECTORS[c[1]], value: o.fill });
      if (o.change) { extra.unshift({ change: true }); changedOn = n; }
    });
    lastDown = down;
    plannedFor = n;
    return { x: +p[0].toFixed(3), y: +p[1].toFixed(3), down: down, extra: extra };
  }

  function draw(n) {
    if (n !== plannedFor) throw new Error('frame ' + n + ' drawn before it was planned');
    next = n + 1;
    var b = n / T.FPS / SPB;
    glideZoom(n, b);
    window.videoClock.frame(nowMs);
    holdTransitions(nowMs);
    overlay(b, at);
  }

  // Whether the frame is finished. While tiles are still on their way, run
  // the app's frame again at the same time, so tiles that arrived since are
  // drawn. Pending timers are left to fire on their own: a debounced timer
  // re-armed on every draw would otherwise never fire.
  function settled() {
    var s = window.__tm.state(), busy = window.__tm.busy(), timers = window.videoClock.timers();
    if (!s.ready || s.missing || s.inFlight || busy) {
      window.videoClock.frame(nowMs);
      return 'ready ' + s.ready + ', missing ' + s.missing + ', in flight ' + s.inFlight + ', busy ' + busy;
    }
    return timers ? 'timers ' + timers : true;
  }

  window.video = {
    ready: document.fonts.ready.then(function () { sizeCaptions(); return true; }),
    rest: function () { return at.slice(); },
    fade: function (src, n) { return setFade(src, n / T.FPS / SPB); },
    plan: plan,
    draw: draw,
    settled: settled,
    state: appState,
    log: log
  };
})();
