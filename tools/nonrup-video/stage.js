/* The stage for the Non-Rupert explorer video. render.js adds it to the
   real app page, after the app has started and after timeline.js.

   For each frame, plan(n) says where the pointer is and whether its button
   is down. render.js moves the real mouse there, so the app hears every
   hover, press, drag and click as it does on the page. Then draw(n) runs
   the app's animation frame at the frame's exact time, holds the page's
   CSS transitions at that time, and draws the captions, the address and
   the pointer over the app. Frames must be drawn in order. */
(function () {
  'use strict';

  var T = window.NonrupTimeline;
  var Shadow = window.NonRupertShadow;
  var SPB = T.SEC_PER_BEAT;
  // The app's frame step, rounded to a multiple of 1/4096 ms. Every frame
  // time is then exact, every step between frames the same, and the turn
  // after the last click repeats the first frame's turn bit for bit.
  var FRAME_MS = Math.round(1000 / T.FPS * 4096) / 4096;
  var PRESS = T.PRESS / SPB;           // beats a button is down before its click
  var RIPPLE = 0.42 / SPB;             // the ring a click sends out lasts 0.42 s

  // The app has already run PREROLL frames when the video starts.
  function appTime(n) {
    return (T.PREROLL + n) * FRAME_MS;
  }

  // Where the app draws the solid before it is pushed. These match
  // viewer.js: the camera's starting view, and the scale that fits the
  // plate and the copy at both ends of its push.
  var START = 2.15, END = -2.15, PLATE = 1.6, CAMERA = 9;
  var VIEW = Shadow.multiply(Shadow.axisRotation([1, 0, 0], 0.42), Shadow.axisRotation([0, 1, 0], -0.62));
  var REACH = (function () {
    var x = 0, y = 0;
    function add(point, radius) {
      var v = Shadow.apply(VIEW, point), f = CAMERA / (CAMERA - v[2]);
      x = Math.max(x, (Math.abs(v[0]) + radius) * f);
      y = Math.max(y, (Math.abs(v[1]) + radius) * f);
    }
    [[-PLATE, -PLATE, 0], [PLATE, -PLATE, 0], [PLATE, PLATE, 0], [-PLATE, PLATE, 0]].forEach(function (c) { add(c, 0); });
    add([0, 0, START], 1);
    add([0, 0, END], 1);
    return { x: x, y: y };
  })();

  function solidCentre() {
    var rect = document.getElementById('scene').getBoundingClientRect();
    var top = rect.height * 0.08;
    var scale = Math.min(rect.width * 0.47 / REACH.x, (rect.height - top) * 0.45 / REACH.y);
    var v = Shadow.apply(VIEW, [0, 0, START]), f = CAMERA / (CAMERA - v[2]);
    return [rect.left + rect.width / 2 + v[0] * f * scale, rect.top + top + (rect.height - top) / 2 - v[1] * f * scale];
  }

  // Targets ----------------------------------------------------------------

  var SELECTORS = {
    c11: '.shape[data-shape="c11"]', c15: '.shape[data-shape="c15"]', cube: '.shape[data-shape="cube"]',
    cut: '#cut', push: '#push', passage: '#passage', search: '#search'
  };

  // A hand clicks a little above and left of a button's middle.
  function targetPoint(name) {
    if (name === 'rest') return T.REST;
    if (name === 'solid') return solidCentre();
    var r = document.querySelector(SELECTORS[name]).getBoundingClientRect();
    if (!r.width) throw new Error(name + ' is hidden when the pointer moves to it');
    return [r.left + r.width * 0.46, r.top + r.height * 0.46];
  }

  function onTarget(name, p) {
    var el = document.elementFromPoint(p[0], p[1]);
    if (name === 'solid') return el && el.id === 'scene';
    return !!el && !!el.closest(SELECTORS[name]);
  }

  // Pointer ----------------------------------------------------------------

  // Moves and drags in beat order. Each records where it started, the first
  // time a frame falls inside it. A move ends on its target as it stands on
  // each frame, so a button that shifts under a moving pointer is still hit.
  var segments = T.MOVES.map(function (m) { return { b0: m[0], b1: m[1], target: m[2] }; })
    .concat(T.DRAGS.map(function (d) { return { b0: d[0], b1: d[1], by: d[2] }; }))
    .sort(function (a, b) { return a.b0 - b.b0; });
  var at = T.REST.slice();

  // A gentle upward arc of at most 12 px.
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
    var u = T.smooth((b - s.b0) / (s.b1 - s.b0)), p;
    if (s.by) {
      p = [s.start[0] + s.by[0] * u, s.start[1] + s.by[1] * u];
    } else {
      var end = targetPoint(s.target), c = control(s.start, end), a = 1 - u;
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

  var address = layer('div', 'video-card video-address');
  address.textContent = 'drbuild.uk/nonrup';

  var captions = T.CAPTIONS.map(function (c, i) {
    var el = layer('div', 'video-card video-caption' + (i === 0 ? ' title' : ''));
    el.innerHTML = '<div class="main"></div>' + (c[3] ? '<div class="sub"></div>' : '');
    el.querySelector('.main').textContent = c[2];
    if (c[3]) el.querySelector('.sub').textContent = c[3];
    return el;
  });

  var ripples = [layer('div', 'video-ripple'), layer('div', 'video-ripple')];
  var pointer = layer('div', 'video-pointer');
  pointer.innerHTML = '<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">' +
    '<path d="M3 3 V26.5 L9.2 20.6 L13.4 30.4 L17.6 28.6 L13.5 19 H21.8 Z" fill="#fbfaf6" ' +
    'stroke="#0e0e10" stroke-width="1.7" stroke-linejoin="round"/></svg>';

  // Each card hugs its widest balanced line, and sits in the middle.
  function sizeCaptions() {
    captions.forEach(function (el) {
      var w = 0;
      Array.prototype.forEach.call(el.children, function (block) {
        var range = document.createRange();
        range.selectNodeContents(block);
        Array.prototype.forEach.call(range.getClientRects(), function (rect) { w = Math.max(w, rect.width); });
      });
      // Padding 18 and border 1 each side, and 3 px spare so the balanced
      // lines keep their breaks.
      var width = Math.min(500, Math.ceil(w) + 38 + 3);
      el.style.width = width + 'px';
      el.style.left = Math.round((540 - width) / 2) + 'px';
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
    T.CAPTIONS.forEach(function (c, i) {
      var a = captionAlpha(c, b);
      captions[i].style.visibility = a > 0 ? 'visible' : 'hidden';
      captions[i].style.opacity = a.toFixed(3);
    });

    // The pointer shrinks a little while its button is down. A press is the
    // beats [down, up] of the latest click or drag to begin.
    var press = null, squeeze = 1;
    T.CLICKS.forEach(function (c) { if (c[0] - PRESS <= b) press = [c[0] - PRESS, c[0]]; });
    T.DRAGS.forEach(function (d) { if (d[0] <= b && (!press || d[0] > press[0])) press = [d[0], d[1]]; });
    if (press && b < press[1]) squeeze = 1 - 0.1 * T.smooth((b - press[0]) / PRESS);
    else if (press) squeeze = 1 - 0.1 * (1 - T.smooth((b - press[1]) / (0.12 / SPB)));
    pointer.style.transform = 'translate(' + (p[0] - 3).toFixed(2) + 'px, ' + (p[1] - 3).toFixed(2) + 'px) scale(' + squeeze.toFixed(4) + ')';

    // Each click sends out a ring from the tip.
    var live = clicked.filter(function (c) { return b >= c[0] && b - c[0] < RIPPLE; }).slice(-2);
    ripples.forEach(function (el, i) {
      var c = live[i];
      if (!c) { el.style.visibility = 'hidden'; return; }
      var u = (b - c[0]) / RIPPLE, r = 3 + 13 * (1 - Math.pow(1 - u, 3));
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

  var next = 0, lastDown = false, plannedFor = -1, lastHint = '';
  var log = [];             // what render.js checks after the render
  var clickAt = 0;

  // The app's own words for its state, for the log.
  function appState() {
    var verdict = document.getElementById('verdict');
    return {
      ratio: document.getElementById('ratio').textContent,
      verdict: verdict.hidden ? '' : verdict.textContent,
      hint: document.getElementById('hint').textContent,
      cursor: document.getElementById('scene').style.cursor,
      resetShown: !document.getElementById('reset-view').hidden
    };
  }

  function plan(n) {
    if (n !== next) throw new Error('frame ' + n + ' planned out of order: expected ' + next);
    var b = n / T.FPS / SPB;
    window.videoClock.set(appTime(n));
    var p = pointerAt(b), down = T.pressed(b);
    // A click lands when the button comes up, on the first frame at or after
    // its beat.
    if (lastDown && !down) {
      while (clickAt < T.CLICKS.length && T.CLICKS[clickAt][0] <= b) {
        var c = T.CLICKS[clickAt];
        clicked.push([b, p.slice()]);
        log.push({ beat: +b.toFixed(2), click: c[1], onTarget: onTarget(c[1], p) });
        clickAt++;
      }
    }
    lastDown = down;
    plannedFor = n;
    return { x: +p[0].toFixed(3), y: +p[1].toFixed(3), down: down };
  }

  function draw(n) {
    if (n !== plannedFor) throw new Error('frame ' + n + ' drawn before it was planned');
    next = n + 1;
    var b = n / T.FPS / SPB;
    window.videoClock.frame(appTime(n));
    holdTransitions(appTime(n));
    overlay(b, at);
    // Note the app's state just before each click lands, and as each drag
    // starts and ends.
    T.CLICKS.forEach(function (c) {
      if (b < c[0] - PRESS && (n + 1) / T.FPS / SPB >= c[0] - PRESS) log.push({ beat: +b.toFixed(2), before: c[1], state: appState() });
    });
    T.DRAGS.forEach(function (d) {
      [d[0], d[1]].forEach(function (edge) {
        if (b >= edge && (n - 1) / T.FPS / SPB < edge) log.push({ beat: +b.toFixed(2), drag: edge === d[0] ? 'press' : 'release', state: appState() });
      });
    });
    // The moment each push ends, which music can mark.
    var hint = document.getElementById('hint').textContent;
    if (hint !== lastHint && /^It (jams|passes)/.test(hint)) log.push({ beat: +b.toFixed(2), pushed: hint.indexOf('jams') > 0 ? 'jams' : 'passes' });
    lastHint = hint;
  }

  // The app's frames before the video starts, with the pointer at rest.
  // The video's first frame is the app's frame PREROLL.
  //
  // The view through the hole sets its line joins round the first time it
  // draws a copy, and keeps them. A fresh page draws the dashed hole with
  // mitred corners until then. The stage sets them round once the canvas
  // has its size, so the first frame matches the frame after the last.
  function preroll() {
    for (var k = 1; k < T.PREROLL; k++) {
      window.videoClock.frame(k * FRAME_MS);
      holdTransitions(k * FRAME_MS);
      if (k === 1) document.getElementById('fit').getContext('2d').lineJoin = 'round';
    }
  }

  window.video = {
    ready: document.fonts.ready.then(function () { sizeCaptions(); return true; }),
    preroll: preroll,
    plan: plan,
    draw: draw,
    log: log
  };
})();
