/* The stage for the Leech explorer video. render.js adds it to the real
   app page, after the app has started and after timeline.js.

   For each frame, plan(n) says where the pointer is and whether its button
   is down. render.js moves the real mouse there, so the app hears every
   hover, press and click as it does on the page. Then draw(n) runs the
   app's animation frame at the frame's exact time, holds the page's CSS
   transitions at that time, and draws the captions, the address and the
   pointer over the app. Frames must be drawn in order. */
(function () {
  'use strict';

  var T = window.LeechTimeline;
  var FRAME_MS = Math.round(1000 / T.FPS * 4096) / 4096;
  var RIPPLE = 0.42;                   // the ring a click sends out lasts 0.42 s
  var MIDDLE = 633;                    // between the Show and Options cards

  function appTime(n) { return n * FRAME_MS; }

  // Targets ----------------------------------------------------------------

  var SELECTORS = {
    step: '#step', 'next-e8': '#next-octad',
    rings: '[data-colour="rings"]', shells: '[data-colour="shells"]', shapes: '[data-colour="shapes"]'
  };
  ['rot36', 'rot60', 'rot42', 'rot30', 'hexagon', 'coordinates', 'petrie', 'layers'].forEach(function (id) {
    SELECTORS[id] = '.scene-button[data-scene="' + id + '"]';
  });

  // Every scene group opens, so each button the video clicks is in view.
  document.querySelectorAll('.scene-group-heading').forEach(function (heading) {
    var first = document.querySelector('.scene-button[data-group="' + heading.dataset.group + '"]');
    if (first && !first.offsetParent) heading.click();
  });

  // A hand clicks a little above and left of a button's middle.
  function targetPoint(name) {
    var el = document.querySelector(SELECTORS[name]);
    if (!el) throw new Error('no element for ' + name);
    var r = el.getBoundingClientRect();
    if (!r.width) throw new Error(name + ' is hidden when the pointer moves to it');
    return [r.left + r.width * 0.46, r.top + r.height * 0.46];
  }

  function onTarget(name, p) {
    var el = document.elementFromPoint(p[0], p[1]);
    return !!el && !!el.closest(SELECTORS[name]);
  }

  // Pointer ----------------------------------------------------------------

  var segments = T.MOVES.map(function (m) { return { t0: m[0], t1: m[1], target: m[2] }; });
  var at = null;            // set by rest(), once the fonts have loaded

  // A gentle upward arc of at most 12 px.
  function control(p0, p1) {
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len, h = Math.min(0.12 * len, 12);
    if (ny > 0) { nx = -nx; ny = -ny; }
    return [(p0[0] + p1[0]) / 2 + nx * h, (p0[1] + p1[1]) / 2 + ny * h];
  }

  function pointerAt(t) {
    var s = null;
    segments.forEach(function (seg) { if (seg.t0 <= t) s = seg; });
    if (!s || s.done) return at;
    if (!s.start) s.start = at.slice();
    var u = T.ease((t - s.t0) / (s.t1 - s.t0));
    var end = targetPoint(s.target), c = control(s.start, end), a = 1 - u;
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

  // The outro: a still of the first frame, without the video's own layer,
  // fades in over the app. It sits under the captions and the pointer.
  var outroImg = document.createElement('img');
  outroImg.className = 'video-fade';
  document.body.appendChild(outroImg);
  var outroReady = false;

  var address = layer('div', 'video-card video-address');
  address.textContent = 'drbuild.uk/leech';

  var captions = T.CAPTIONS.map(function (c, i) {
    var el = layer('div', 'video-card video-caption' + (i === 0 ? ' title' : ''));
    el.innerHTML = '<div class="main"></div>' + (c[3] ? '<div class="sub"></div>' : '');
    el.querySelector('.main').textContent = c[2];
    if (c[3]) el.querySelector('.sub').textContent = c[3];
    return el;
  });

  var ripples = [layer('div', 'video-ripple'), layer('div', 'video-ripple')];
  var pointer = layer('div', 'video-pointer');
  pointer.innerHTML = '<svg width="40" height="52" viewBox="0 0 26 34" aria-hidden="true">' +
    '<path d="M3 3 V26.5 L9.2 20.6 L13.4 30.4 L17.6 28.6 L13.5 19 H21.8 Z" fill="#fbfaf6" ' +
    'stroke="#0e0e10" stroke-width="1.7" stroke-linejoin="round"/></svg>';
  var pointerSvg = pointer.querySelector('svg');

  // Each card hugs its widest balanced line, centred between the cards.
  function sizeCaptions() {
    captions.forEach(function (el) {
      var w = 0;
      Array.prototype.forEach.call(el.children, function (block) {
        var range = document.createRange();
        range.selectNodeContents(block);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) { w = Math.max(w, rect.width); });
      });
      var width = Math.min(700, Math.ceil(w) + 54 + 4);
      el.style.width = width + 'px';
      el.style.left = Math.round(MIDDLE - width / 2) + 'px';
    });
  }

  function captionAlpha(c, t) {
    var a = 0;
    [t - T.DURATION, t, t + T.DURATION].forEach(function (x) {
      if (x < c[0] || x > c[1]) return;
      a = Math.max(a, T.smooth(Math.min(1, (x - c[0]) / T.FADE, (c[1] - x) / T.FADE)));
    });
    return a;
  }

  var clicked = [];       // [time, point] of each click, for its ring

  function overlay(t, p) {
    var f = T.OUTRO && outroReady ? T.smooth((t - T.OUTRO[0]) / (T.OUTRO[1] - T.OUTRO[0])) : 0;
    outroImg.style.visibility = f > 0 ? 'visible' : 'hidden';
    outroImg.style.opacity = f.toFixed(3);

    T.CAPTIONS.forEach(function (c, i) {
      var a = captionAlpha(c, t);
      captions[i].style.visibility = a > 0 ? 'visible' : 'hidden';
      captions[i].style.opacity = a.toFixed(3);
    });

    var press = null, squeeze = 1;
    T.CLICKS.forEach(function (c) { if (c[0] - T.PRESS <= t) press = [c[0] - T.PRESS, c[0]]; });
    if (press && t < press[1]) squeeze = 1 - 0.1 * T.smooth((t - press[0]) / T.PRESS);
    else if (press) squeeze = 1 - 0.1 * (1 - T.smooth((t - press[1]) / 0.12));
    // The squeeze resizes the drawing rather than scaling the layer, since
    // Chrome keeps a scaled layer's raster, and the loop join would differ.
    var hot = 4.6 * squeeze;
    pointerSvg.setAttribute('width', (40 * squeeze).toFixed(3));
    pointerSvg.setAttribute('height', (52 * squeeze).toFixed(3));
    pointer.style.transform = 'translate(' + (p[0] - hot).toFixed(2) + 'px, ' + (p[1] - hot).toFixed(2) + 'px)';

    var live = clicked.filter(function (c) { return t >= c[0] && t - c[0] < RIPPLE; }).slice(-2);
    ripples.forEach(function (el, i) {
      var c = live[i];
      if (!c) { el.style.visibility = 'hidden'; return; }
      var u = (t - c[0]) / RIPPLE, r = 5 + 23 * (1 - Math.pow(1 - u, 3));
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

  // Frames -----------------------------------------------------------------

  var next = 0, plannedFor = -1, clickAt = 0, nowMs = 0;
  var log = [];             // what render.js checks after the render

  // The app's own words for its state, for the log.
  function appState() {
    var s = window.__leechExplorer.snapshot();
    return { scene: s.scene, window: s.window, octad: s.octad, colour: s.colour, renderer: s.renderer,
      transitioning: s.transitioning, title: s.title, status: s.status };
  }

  // Clicks that land on frame n: the first frame at or after each time.
  function landing(n) {
    var t = n / T.FPS, out = [];
    while (clickAt < T.CLICKS.length && T.CLICKS[clickAt][0] <= t) out.push(T.CLICKS[clickAt++]);
    return out;
  }

  function plan(n) {
    if (n !== next) throw new Error('frame ' + n + ' planned out of order: expected ' + next);
    var t = n / T.FPS;
    nowMs = appTime(n);
    window.videoClock.set(nowMs);
    var p = pointerAt(t), down = T.pressed(t);
    landing(n).forEach(function (c) {
      clicked.push([t, p.slice()]);
      log.push({ time: +t.toFixed(2), click: c[1], onTarget: onTarget(c[1], p), state: appState() });
    });
    plannedFor = n;
    return { x: +p[0].toFixed(3), y: +p[1].toFixed(3), down: down };
  }

  function draw(n) {
    if (n !== plannedFor) throw new Error('frame ' + n + ' drawn before it was planned');
    next = n + 1;
    window.videoClock.frame(nowMs);
    holdTransitions(nowMs);
    overlay(n / T.FPS, at);
  }

  window.video = {
    ready: document.fonts.ready.then(function () { sizeCaptions(); return true; }),
    rest: function () { at = targetPoint(T.REST); return at.slice(); },
    point: function () { return at.slice(); },
    outro: function (src) { outroImg.src = src; return outroImg.decode().then(function () { outroReady = true; }); },
    plan: plan,
    draw: draw,
    state: appState,
    log: log
  };
})();
