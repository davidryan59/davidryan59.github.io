(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('viewer'), stage = $('stage'), ctx = canvas.getContext('2d');
  var roots = E8.buildRoots(), graph = E8.buildEdges(roots);
  var coxeter = E8.buildCoxeterData(roots), presets = E8.makePresets();
  var presetNames = {
    coxeter: 'Petrie · Coxeter plane · 12°',
    coxeter7: 'Coxeter plane · 84°',
    coxeter11: 'Coxeter plane · 132°',
    coxeter13: 'Coxeter plane · 156°',
    octagonal: 'Octagonal projection',
    alternate: 'Alternate projection',
    squares: 'Squares projection',
    order24: '10 × 24-gons',
    order20: '12 × 20-gons',
    order18: '18-fold · blurred',
    order14: '14-fold · blurred',
    generic: 'Generic projection',
    dynkin: 'Simple-root projection',
    custom: 'Free 8D view'
  };
  var rootNorm = Math.sqrt(2), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pointers = new Map(), pinch = null, transition = null;
  var width = 1, height = 1, scale = 1, dpr = 1;
  var projected = new Float64Array(roots.length * 2), planeCoordinates = new Float64Array(roots.length * 2);
  var lastTime = performance.now(), lastTrailTime = 0, lastHashWrite = 0;

  var state = {
    frame: E8.copyFrame(presets.coxeter),
    preset: 'coxeter',
    view: 'roots',
    edges: 'none',
    colour: 'orbit',
    selected: 0,
    hovered: -1,
    pointSize: 4.5,
    edgeOpacity: 18,
    trails: 5,
    trailHistory: [],
    speed: 0.4,
    depth: 2,
    zoom: 1,
    playing: !reducedMotion,
    playAfter: performance.now() + 2600,
    dragging: false,
    dragMode: null,
    dragRoot: -1,
    moved: false,
    needsRender: true,
    needsTrail: true
  };

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }

  function copyProjected() { return new Float64Array(projected); }

  function markChanged(withTrail) {
    state.needsRender = true;
    if (withTrail !== false) state.needsTrail = true;
  }

  function setCustom() {
    if (state.preset === 'custom' && document.querySelector('[data-preset].active') === null) return;
    state.preset = 'custom';
    document.querySelectorAll('[data-preset]').forEach(function (button) {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    });
    $('more-projections').value = '';
    $('projection-name').value = presetNames.custom;
    $('view-status').textContent = presetNames.custom;
  }

  function useHint() { $('gesture-hint').classList.add('used'); }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.trailHistory.length = 0;
    markChanged(false);
  }

  function calculateProjection() {
    scale = Math.min(width, height) * 0.285 * state.zoom;
    var centreX = width / 2, centreY = height / 2;
    for (var i = 0; i < roots.length; i++) {
      var x = E8.dot(state.frame[0], roots[i]);
      var y = E8.dot(state.frame[1], roots[i]);
      planeCoordinates[2 * i] = x;
      planeCoordinates[2 * i + 1] = y;
      projected[2 * i] = centreX + x * scale;
      projected[2 * i + 1] = centreY - y * scale;
    }
  }

  function orbitPalette() {
    return isDark()
      ? ['#58d4c2', '#64a9f3', '#a78bfa', '#ef83c2', '#fb7185', '#fb9b61', '#f2cf55', '#83d58a']
      : ['#087f72', '#2563b8', '#7447b8', '#b52b75', '#c63d55', '#bf5a24', '#947000', '#387b42'];
  }

  function colourFor(index) {
    if (state.view === 'neighbourhood') {
      var relation = Math.round(E8.dot(roots[state.selected], roots[index]));
      if (index === state.selected) return isDark() ? '#f0b96e' : '#9a6300';
      if (relation === 1) return isDark() ? '#58d4c2' : '#087f72';
      if (relation === 0) return isDark() ? '#8995a7' : '#76808d';
      if (relation === -1) return isDark() ? '#b59be7' : '#7756b0';
      return isDark() ? '#f17f9f' : '#b93f60';
    }
    if (state.view === 'coxeter' || state.colour === 'orbit') return orbitPalette()[coxeter.orbit[index]];
    if (state.colour === 'family') {
      return E8.rootKind(roots[index]) === 'd8'
        ? (isDark() ? '#67b5ef' : '#216ca7')
        : (isDark() ? '#edac69' : '#a65b1d');
    }
    if (state.colour === 'projection') {
      var angle = Math.atan2(planeCoordinates[2 * index + 1], planeCoordinates[2 * index]);
      return 'hsl(' + Math.round((angle / Math.PI + 1) * 180) + ' 68% ' + (isDark() ? '66%' : '42%') + ')';
    }
    return isDark() ? '#b9c5d4' : '#46566a';
  }

  function visibilityFor(index) {
    if (state.view === 'simple') return E8.FUNDAMENTAL_ROOTS.indexOf(index) >= 0 ? 1 : 0.045;
    if (state.view === 'neighbourhood') {
      var relation = Math.round(E8.dot(roots[state.selected], roots[index]));
      return index === state.selected || relation === 1 || relation === -2 ? 1 : 0.07;
    }
    return 1;
  }

  function drawGuides() {
    ctx.save();
    ctx.strokeStyle = css('--canvas-guide');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, rootNorm * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(width / 2 - 6, height / 2);
    ctx.lineTo(width / 2 + 6, height / 2);
    ctx.moveTo(width / 2, height / 2 - 6);
    ctx.lineTo(width / 2, height / 2 + 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrails() {
    if (!state.trails || !state.trailHistory.length || state.view === 'simple') return;
    ctx.save();
    ctx.fillStyle = css('--canvas-trail');
    for (var h = 0; h < state.trailHistory.length; h++) {
      var history = state.trailHistory[h];
      ctx.globalAlpha = 0.12 + 0.52 * (h + 1) / state.trailHistory.length;
      var radius = Math.max(0.65, state.pointSize * 0.24);
      for (var i = 0; i < roots.length; i++) {
        if (visibilityFor(i) < 0.1) continue;
        ctx.beginPath();
        ctx.arc(history[2 * i], history[2 * i + 1], radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function strokePairs(pairs, opacity, colour, lineWidth) {
    if (!pairs.length) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (var i = 0; i < pairs.length; i++) {
      var a = pairs[i][0], b = pairs[i][1];
      ctx.moveTo(projected[2 * a], projected[2 * a + 1]);
      ctx.lineTo(projected[2 * b], projected[2 * b + 1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawCoxeterCycles() {
    var palette = orbitPalette();
    for (var orbit = 0; orbit < coxeter.cycles.length; orbit++) {
      var cycle = coxeter.cycles[orbit], pairs = [];
      for (var i = 0; i < cycle.length; i++) pairs.push([cycle[i], coxeter.next[cycle[i]]]);
      strokePairs(pairs, 0.52, palette[orbit], 1.05);
    }
  }

  function drawSimpleConnections() {
    var pairs = [];
    for (var i = 0; i < E8.FUNDAMENTAL_ROOTS.length; i++) {
      for (var j = i + 1; j < E8.FUNDAMENTAL_ROOTS.length; j++) {
        var a = E8.FUNDAMENTAL_ROOTS[i], b = E8.FUNDAMENTAL_ROOTS[j];
        if (Math.abs(E8.dot(roots[a], roots[b]) + 1) < E8.EPSILON) pairs.push([a, b]);
      }
    }
    strokePairs(pairs, 0.78, isDark() ? '#e0a860' : '#825000', 2.2);
  }

  function drawEdges() {
    if (state.view === 'coxeter') {
      drawCoxeterCycles();
      return;
    }
    if (state.view === 'simple') {
      drawSimpleConnections();
      return;
    }
    if (state.edges === 'none') return;
    var edgeColour = css('--canvas-edge');
    if (state.edges === 'all') {
      strokePairs(graph.edges, state.edgeOpacity / 100 * 0.34, edgeColour, 0.7);
    }
    if (state.edges === 'local' || state.view === 'neighbourhood') {
      var local = graph.adjacent[state.selected].map(function (neighbour) { return [state.selected, neighbour]; });
      strokePairs(local, clamp(state.edgeOpacity / 100 * 1.9, 0.18, 0.72), edgeColour, 1.05);
    }
  }

  function drawPoints() {
    var outline = css('--canvas-outline');
    var order = roots.map(function (_, i) { return i; });
    order.sort(function (a, b) { return visibilityFor(a) - visibilityFor(b); });
    for (var o = 0; o < order.length; o++) {
      var i = order[o], visibility = visibilityFor(i);
      var radius = state.pointSize * (E8.rootKind(roots[i]) === 'd8' ? 1.14 : 0.9);
      if (state.view === 'simple' && visibility > 0.5) radius *= 1.35;
      ctx.save();
      ctx.globalAlpha = visibility;
      ctx.fillStyle = colourFor(i);
      ctx.strokeStyle = outline;
      ctx.lineWidth = i === state.selected ? 2 : 0.8;
      if (i === state.selected) {
        ctx.shadowColor = isDark() ? 'rgba(224,168,96,.7)' : 'rgba(154,99,0,.45)';
        ctx.shadowBlur = 13;
        radius *= 1.65;
      }
      ctx.beginPath();
      ctx.arc(projected[2 * i], projected[2 * i + 1], radius, 0, Math.PI * 2);
      ctx.fill();
      if (visibility > 0.2) ctx.stroke();
      ctx.restore();
    }
    if (state.view === 'simple') drawSimpleLabels();
  }

  function drawSimpleLabels() {
    ctx.save();
    ctx.font = '600 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = css('--ink');
    for (var i = 0; i < E8.FUNDAMENTAL_ROOTS.length; i++) {
      var root = E8.FUNDAMENTAL_ROOTS[i];
      ctx.fillText('α' + (i + 1), projected[2 * root], projected[2 * root + 1] - state.pointSize * 2);
    }
    ctx.restore();
  }

  function captureTrail(now) {
    if (!state.needsTrail || state.trails <= 0 || now - lastTrailTime < 46) return;
    state.trailHistory.push(copyProjected());
    while (state.trailHistory.length > state.trails) state.trailHistory.shift();
    state.needsTrail = false;
    lastTrailTime = now;
  }

  function render(now) {
    calculateProjection();
    captureTrail(now || performance.now());
    ctx.clearRect(0, 0, width, height);
    drawGuides();
    drawTrails();
    drawEdges();
    drawPoints();
    updateDetails();
    state.needsRender = false;
  }

  function coordinateText(value) {
    if (value === 0.5) return '½';
    if (value === -0.5) return '−½';
    if (value === -1) return '−1';
    return String(value);
  }

  function updateDetails() {
    var index = state.selected, root = roots[index];
    var x = planeCoordinates[2 * index], y = planeCoordinates[2 * index + 1];
    var hidden = Math.sqrt(Math.max(0, 2 - x * x - y * y));
    $('root-name').textContent = 'Root ' + index;
    $('root-kind').textContent = E8.rootKind(root) === 'd8' ? 'D₈ coordinate root' : 'Half-coordinate root';
    $('coordinates').textContent = '(' + root.map(coordinateText).join(', ') + ')';
    $('orbit').textContent = (coxeter.orbit[index] + 1) + ' of 8';
    $('orbit-position').textContent = (coxeter.position[index] + 1) + ' of 30';
    $('projection-coordinates').textContent = x.toFixed(3) + ', ' + y.toFixed(3);
    $('hidden-radius').textContent = hidden.toFixed(3);
    if (state.view === 'neighbourhood') $('selection-status').textContent = '1 root · 56 neighbours · 1 opposite';
    else if (state.view === 'coxeter') $('selection-status').textContent = '8 cycles · 30 roots each';
    else if (state.view === 'simple') $('selection-status').textContent = '8 simple roots · E₈ Dynkin diagram';
    else $('selection-status').textContent = '240 roots · 6,720 edges';
  }

  function updateMotionButtons() {
    $('play').classList.toggle('active', state.playing);
    $('play').setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    $('pause').classList.toggle('active', !state.playing);
    $('pause').setAttribute('aria-pressed', state.playing ? 'false' : 'true');
    $('motion-output').value = state.playing ? 'Playing' : 'Paused';
  }

  function setPlaying(playing) {
    state.playing = playing;
    state.playAfter = performance.now() + 250;
    updateMotionButtons();
    markChanged(false);
  }

  function choosePreset(id, immediate) {
    if (!presets[id]) return;
    state.preset = id;
    document.querySelectorAll('[data-preset]').forEach(function (button) {
      var active = button.dataset.preset === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $('more-projections').value = Array.from($('more-projections').options).some(function (option) {
      return option.value === id;
    }) ? id : '';
    $('projection-name').value = presetNames[id];
    $('view-status').textContent = presetNames[id];
    state.trailHistory.length = 0;
    if (immediate) {
      state.frame = E8.copyFrame(presets[id]);
      transition = null;
    } else {
      var targetFrame = E8.alignFrame(state.frame, presets[id]);
      transition = {
        from: E8.copyFrame(state.frame),
        to: targetFrame,
        start: performance.now(),
        duration: 720
      };
    }
    state.playAfter = performance.now() + (immediate ? 900 : 950);
    markChanged(true);
  }

  function selectRoot(index) {
    if (index < 0 || index >= roots.length) return;
    state.selected = index;
    markChanged(false);
  }

  function minimumRootRotation(index, dx, dy) {
    var coordinates = state.frame.map(function (row) { return E8.dot(row, roots[index]); });
    var targetX = dx / Math.max(1, scale), targetY = -dy / Math.max(1, scale);
    var variables = [], m00 = 0, m01 = 0, m11 = 0;
    for (var a = 0; a < 8; a++) {
      for (var b = a + 1; b < 8; b++) {
        var bx = (a === 0 ? coordinates[b] : 0) + (b === 0 ? -coordinates[a] : 0);
        var by = (a === 1 ? coordinates[b] : 0) + (b === 1 ? -coordinates[a] : 0);
        variables.push({ a: a, b: b, x: bx, y: by, angle: 0 });
        m00 += bx * bx;
        m01 += bx * by;
        m11 += by * by;
      }
    }
    var regularisation = 0.0005;
    m00 += regularisation;
    m11 += regularisation;
    var determinant = m00 * m11 - m01 * m01;
    if (Math.abs(determinant) < 1e-10) return;
    var c0 = (m11 * targetX - m01 * targetY) / determinant;
    var c1 = (-m01 * targetX + m00 * targetY) / determinant;
    var norm = 0;
    variables.forEach(function (variable) {
      variable.angle = variable.x * c0 + variable.y * c1;
      norm += variable.angle * variable.angle;
    });
    norm = Math.sqrt(norm);
    var amount = norm > 0.16 ? 0.16 / norm : 1;
    variables.forEach(function (variable) {
      if (Math.abs(variable.angle) > 1e-8) E8.rotateRows(state.frame, variable.a, variable.b, variable.angle * amount);
    });
  }

  function orbitDrag(dx, dy) {
    E8.rotateRows(state.frame, 0, state.depth, dx * 0.006);
    E8.rotateRows(state.frame, 1, state.depth, -dy * 0.006);
  }

  function manualMove() {
    transition = null;
    setCustom();
    useHint();
    markChanged(true);
  }

  function hitTest(x, y, extra) {
    var best = -1, bestDistance = Infinity;
    for (var i = 0; i < roots.length; i++) {
      if (visibilityFor(i) < 0.1) continue;
      var distance = Math.hypot(projected[2 * i] - x, projected[2 * i + 1] - y);
      var limit = state.pointSize * 1.5 + extra;
      if (distance <= limit && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  function canvasPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function pinchState() {
    var values = Array.from(pointers.values());
    if (values.length < 2) return null;
    return {
      distance: Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y),
      angle: Math.atan2(values[1].y - values[0].y, values[1].x - values[0].x),
      zoom: state.zoom
    };
  }

  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    var point = canvasPoint(event);
    pointers.set(event.pointerId, { x: point.x, y: point.y, lastX: point.x, lastY: point.y });
    state.dragging = true;
    state.moved = false;
    if (pointers.size === 2) {
      pinch = pinchState();
      state.dragMode = 'pinch';
      state.dragRoot = -1;
    } else {
      var hit = hitTest(point.x, point.y, event.pointerType === 'touch' ? 13 : 7);
      if (hit >= 0 && !event.shiftKey && event.button !== 2) {
        selectRoot(hit);
        state.dragMode = 'root';
        state.dragRoot = hit;
        canvas.classList.add('root-drag');
      } else {
        state.dragMode = event.shiftKey || event.button === 2 ? 'roll' : 'orbit';
        state.dragRoot = -1;
        canvas.classList.add('grabbing');
      }
    }
  });

  canvas.addEventListener('pointermove', function (event) {
    var point = canvasPoint(event), pointer = pointers.get(event.pointerId);
    if (!pointer) {
      state.hovered = hitTest(point.x, point.y, 6);
      updateHover(point.x, point.y);
      return;
    }
    var dx = point.x - pointer.x, dy = point.y - pointer.y;
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.x = point.x;
    pointer.y = point.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) state.moved = true;
    if (pointers.size === 2) {
      var nextPinch = pinchState();
      if (pinch && nextPinch && pinch.distance > 0) {
        state.zoom = clamp(pinch.zoom * nextPinch.distance / pinch.distance, 0.48, 2.8);
        E8.rotateRows(state.frame, 0, 1, nextPinch.angle - pinch.angle);
        pinch = pinchState();
        manualMove();
      }
      return;
    }
    if (state.dragMode === 'root' && state.dragRoot >= 0) minimumRootRotation(state.dragRoot, dx, dy);
    else if (state.dragMode === 'roll') E8.rotateRows(state.frame, 0, 1, dx * 0.007);
    else orbitDrag(dx, dy);
    manualMove();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      var remaining = pointers.values().next().value;
      remaining.lastX = remaining.x;
      remaining.lastY = remaining.y;
      state.dragMode = 'orbit';
      pinch = null;
      return;
    }
    if (pointers.size) return;
    state.dragging = false;
    state.dragMode = null;
    state.dragRoot = -1;
    pinch = null;
    canvas.classList.remove('grabbing', 'root-drag');
    writeHash();
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', function () {
    if (!pointers.size) {
      state.hovered = -1;
      $('hover-card').hidden = true;
    }
  });
  canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    state.zoom = clamp(state.zoom * Math.exp(-event.deltaY * 0.001), 0.48, 2.8);
    useHint();
    markChanged(false);
    writeHashSoon();
  }, { passive: false });

  function updateHover(x, y) {
    var card = $('hover-card');
    if (state.hovered < 0) {
      card.hidden = true;
      return;
    }
    var root = roots[state.hovered];
    card.innerHTML = '<strong>Root ' + state.hovered + '</strong>' + root.map(coordinateText).join(', ');
    card.style.left = clamp(x + 13, 6, width - 130) + 'px';
    card.style.top = clamp(y + 13, 6, height - 58) + 'px';
    card.hidden = false;
  }

  function applyFlow(dt) {
    var speed = state.speed;
    E8.rotateRows(state.frame, 0, 2, dt * 0.19 * speed);
    E8.rotateRows(state.frame, 1, 3, dt * 0.153 * speed);
    E8.rotateRows(state.frame, 2, 4, dt * 0.083 * speed);
    E8.rotateRows(state.frame, 3, 5, dt * 0.067 * speed);
    E8.rotateRows(state.frame, 4, 6, dt * 0.047 * speed);
    E8.rotateRows(state.frame, 5, 7, dt * 0.037 * speed);
    setCustom();
    markChanged(true);
  }

  function animate(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (transition) {
      var raw = clamp((now - transition.start) / transition.duration, 0, 1);
      var eased = raw * raw * (3 - 2 * raw);
      state.frame = E8.interpolateFrames(transition.from, transition.to, eased);
      markChanged(true);
      if (raw >= 1) {
        state.frame = E8.copyFrame(transition.to);
        transition = null;
        writeHash();
      }
    } else if (state.playing && !state.dragging && now >= state.playAfter && !document.hidden) {
      applyFlow(dt);
    }
    if (state.needsRender) render(now);
    requestAnimationFrame(animate);
  }

  function activateButtons(selector, value, property) {
    document.querySelectorAll(selector).forEach(function (button) {
      var active = button.dataset[property] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  document.querySelectorAll('[data-preset]').forEach(function (button) {
    button.addEventListener('click', function () {
      choosePreset(button.dataset.preset, false);
      writeHashSoon();
    });
  });
  $('more-projections').addEventListener('change', function () {
    if (!this.value) return;
    choosePreset(this.value, false);
    writeHashSoon();
  });
  document.querySelectorAll('[data-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.view = button.dataset.view;
      if (state.view === 'coxeter') choosePreset('coxeter', false);
      if (state.view === 'simple') {
        if (E8.FUNDAMENTAL_ROOTS.indexOf(state.selected) < 0) selectRoot(E8.FUNDAMENTAL_ROOTS[0]);
        choosePreset('dynkin', false);
      }
      activateButtons('[data-view]', state.view, 'view');
      markChanged(false);
      writeHash();
    });
  });
  document.querySelectorAll('[data-edges]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.edges = button.dataset.edges;
      activateButtons('[data-edges]', state.edges, 'edges');
      markChanged(false);
      writeHash();
    });
  });
  document.querySelectorAll('[data-colour]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.colour = button.dataset.colour;
      activateButtons('[data-colour]', state.colour, 'colour');
      markChanged(false);
      writeHash();
    });
  });

  $('play').addEventListener('click', function () { setPlaying(true); writeHash(); });
  $('pause').addEventListener('click', function () { setPlaying(false); writeHash(); });
  $('speed').addEventListener('input', function () {
    state.speed = +this.value / 100;
    $('speed-output').value = this.value + '%';
    writeHashSoon();
  });
  $('trails').addEventListener('input', function () {
    state.trails = +this.value;
    $('trails-output').value = this.value;
    while (state.trailHistory.length > state.trails) state.trailHistory.shift();
    markChanged(false);
    writeHashSoon();
  });
  $('depth').addEventListener('input', function () {
    state.depth = +this.value - 1;
    $('depth-output').value = this.value;
    writeHashSoon();
  });
  $('edge-opacity').addEventListener('input', function () {
    state.edgeOpacity = +this.value;
    $('edge-output').value = this.value + '%';
    markChanged(false);
    writeHashSoon();
  });
  $('point-size').addEventListener('input', function () {
    state.pointSize = +this.value / 10;
    $('point-output').value = state.pointSize.toFixed(1);
    markChanged(false);
    writeHashSoon();
  });
  $('zoom-in').addEventListener('click', function () { state.zoom = clamp(state.zoom * 1.16, 0.48, 2.8); markChanged(false); writeHash(); });
  $('zoom-out').addEventListener('click', function () { state.zoom = clamp(state.zoom / 1.16, 0.48, 2.8); markChanged(false); writeHash(); });
  $('reset-view').addEventListener('click', function () { state.zoom = 1; choosePreset('coxeter', false); writeHashSoon(); });

  function toggleFullscreen() {
    var root = document.documentElement;
    var active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      var request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (request) {
        var result = request.call(root);
        if (result && result.catch) result.catch(function () {});
      }
    }
    $('fullscreen').blur();
  }

  var fullscreenAvailable = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  $('fullscreen').hidden = !fullscreenAvailable;
  $('fullscreen').addEventListener('click', toggleFullscreen);

  document.addEventListener('keydown', function (event) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    var handled = true;
    if (event.key === ' ' || event.key.toLowerCase() === 'p') setPlaying(!state.playing);
    else if (event.key.toLowerCase() === 'r') { state.zoom = 1; choosePreset('coxeter', false); }
    else if (event.key.toLowerCase() === 'f') toggleFullscreen();
    else if (event.key === '+' || event.key === '=') { state.zoom = clamp(state.zoom * 1.15, 0.48, 2.8); markChanged(false); }
    else if (event.key === '-' || event.key === '_') { state.zoom = clamp(state.zoom / 1.15, 0.48, 2.8); markChanged(false); }
    else if (event.key === 'ArrowLeft') { E8.rotateRows(state.frame, 0, state.depth, -0.055); manualMove(); }
    else if (event.key === 'ArrowRight') { E8.rotateRows(state.frame, 0, state.depth, 0.055); manualMove(); }
    else if (event.key === 'ArrowUp') { E8.rotateRows(state.frame, 1, state.depth, 0.055); manualMove(); }
    else if (event.key === 'ArrowDown') { E8.rotateRows(state.frame, 1, state.depth, -0.055); manualMove(); }
    else if (/^[1-4]$/.test(event.key)) choosePreset(['coxeter', 'octagonal', 'squares', 'generic'][+event.key - 1], false);
    else handled = false;
    if (handled) {
      event.preventDefault();
      writeHashSoon();
    }
  });

  function encodeProjection() {
    var bytes = new Uint8Array(32), view = new DataView(bytes.buffer);
    for (var row = 0; row < 2; row++) {
      for (var column = 0; column < 8; column++) {
        view.setInt16((row * 8 + column) * 2, Math.round(clamp(state.frame[row][column], -1, 1) * 32767));
      }
    }
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeProjection(text) {
    try {
      text = text.replace(/-/g, '+').replace(/_/g, '/');
      while (text.length % 4) text += '=';
      var binary = atob(text), bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (bytes.length !== 32) return null;
      var view = new DataView(bytes.buffer), rows = [[], []];
      for (var row = 0; row < 2; row++) {
        for (var column = 0; column < 8; column++) rows[row][column] = view.getInt16((row * 8 + column) * 2) / 32767;
      }
      return E8.completeFrame(rows);
    } catch (error) { return null; }
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.preset !== 'custom') params.set('v', state.preset);
    else params.set('p', encodeProjection());
    if (state.view !== 'roots') params.set('s', state.view);
    if (state.edges !== 'none') params.set('e', state.edges);
    if (state.colour !== 'orbit') params.set('c', state.colour);
    if (!state.playing) params.set('pause', '1');
    if (Math.abs(state.speed - 0.4) > 0.001) params.set('speed', Math.round(state.speed * 100));
    if (state.trails !== 5) params.set('trails', state.trails);
    if (state.depth !== 2) params.set('depth', state.depth + 1);
    if (Math.abs(state.zoom - 1) > 0.005) params.set('z', state.zoom.toFixed(2));
    if (state.selected !== 0) params.set('r', state.selected);
    history.replaceState(null, '', location.pathname + location.search + '#' + params.toString());
    lastHashWrite = performance.now();
  }

  function writeHashSoon() {
    var wait = Math.max(0, 160 - (performance.now() - lastHashWrite));
    clearTimeout(writeHashSoon.timer);
    writeHashSoon.timer = setTimeout(writeHash, wait);
  }

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    var custom = params.get('p') && decodeProjection(params.get('p'));
    var preset = params.get('v');
    if (custom) {
      state.frame = custom;
      state.preset = 'coxeter';
      setCustom();
    } else if (presets[preset]) choosePreset(preset, true);
    if (['roots', 'neighbourhood', 'coxeter', 'simple'].indexOf(params.get('s')) >= 0) state.view = params.get('s');
    if (['none', 'local', 'all'].indexOf(params.get('e')) >= 0) state.edges = params.get('e');
    if (['orbit', 'family', 'projection', 'mono'].indexOf(params.get('c')) >= 0) state.colour = params.get('c');
    if (params.get('pause') === '1') state.playing = false;
    state.speed = clamp(+(params.get('speed') || 40) / 100, 0.05, 1);
    state.trails = clamp(+(params.get('trails') || 5), 0, 12);
    state.depth = clamp(+(params.get('depth') || 3) - 1, 2, 7);
    state.zoom = clamp(+(params.get('z') || 1), 0.48, 2.8);
    state.selected = clamp(+(params.get('r') || 0), 0, 239);
    if (state.view === 'simple' && E8.FUNDAMENTAL_ROOTS.indexOf(state.selected) < 0) state.selected = E8.FUNDAMENTAL_ROOTS[0];
  }

  function syncControls() {
    activateButtons('[data-view]', state.view, 'view');
    activateButtons('[data-edges]', state.edges, 'edges');
    activateButtons('[data-colour]', state.colour, 'colour');
    $('speed').value = Math.round(state.speed * 100);
    $('speed-output').value = Math.round(state.speed * 100) + '%';
    $('trails').value = state.trails;
    $('trails-output').value = state.trails;
    $('depth').value = state.depth + 1;
    $('depth-output').value = state.depth + 1;
    updateMotionButtons();
  }

  /* Small read-only surface for the repository's browser check. */
  window.__e8Explorer = {
    snapshot: function () {
      var orthogonalityError = 0;
      for (var i = 0; i < 8; i++) {
        for (var j = 0; j < 8; j++) {
          orthogonalityError = Math.max(orthogonalityError, Math.abs(E8.dot(state.frame[i], state.frame[j]) - (i === j ? 1 : 0)));
        }
      }
      return {
        preset: state.preset,
        view: state.view,
        edges: state.edges,
        colour: state.colour,
        selected: state.selected,
        selectedScreen: [projected[2 * state.selected], projected[2 * state.selected + 1]],
        orthogonalityError: orthogonalityError,
        frame: E8.copyFrame(state.frame)
      };
    }
  };

  new MutationObserver(function () { markChanged(false); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { lastTime = performance.now(); });

  readHash();
  syncControls();
  resize();
  calculateProjection();
  var furthest = 0, furthestRadius = -1;
  for (var i = 0; i < roots.length; i++) {
    var radius = Math.hypot(planeCoordinates[2 * i], planeCoordinates[2 * i + 1]);
    if (radius > furthestRadius) { furthestRadius = radius; furthest = i; }
  }
  if (!location.hash || !new URLSearchParams(location.hash.slice(1)).has('r')) state.selected = furthest;
  render(performance.now());
  requestAnimationFrame(animate);
})();
