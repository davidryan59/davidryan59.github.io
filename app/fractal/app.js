(function () {
  'use strict';

  var M = window.FractalModel;
  var PALETTE = ['#e9b44c', '#59c3b5', '#dc6f82', '#8297e8', '#d98fd0', '#7fc66c', '#f28b54', '#a68bd7', '#57a9d8', '#d2c65e'];
  var DEMO_NAMES = { sieve: 'Sierpinski sieve', gasket: 'Sierpinski gasket', linked: 'Linked pair', free: 'Free placement' };
  var EXPLANATIONS = {
    sieve: 'Three half-size copies leave the top-right quarter empty. Repeating that rule makes the right-angled Sierpinski triangle.',
    gasket: 'Three half-size triangles sit in the corners of their parent, leaving the middle empty. Repeating that rule makes the equilateral Sierpinski triangle.',
    linked: 'Parent 1 makes one 1 and one 2. Parent 2 makes one 1 and two 2s. The two parents share one limit through a linked rule.',
    free: 'Three freely placed copies show continuous position, angle, scale, and reflection. The dashed frame is their parent.'
  };
  var demos = M.demos();
  // Slider stops: every whole number from 1 to 10, then round numbers in each
  // decade (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 and 8 times ten to a power). Round
  // numbers come first, even where that bends the log spacing a little.
  var ROUND = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  function logStops(top) {
    var out = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (var decade = 10; decade < top; decade *= 10) {
      ROUND.forEach(function (m) { var value = Math.round(m * decade); if (value > out[out.length - 1] && value <= top) out.push(value); });
    }
    if (out[out.length - 1] !== top) out.push(top);
    return out;
  }
  var COPY_VALUES = logStops(500000);
  // Minimum scale runs from 1/1 to 1/1,000,000, then Unlimited (0).
  var SCALE_VALUES = logStops(1000000).map(function (d) { return 1 / d; }).concat([0]);
  var TIME_VALUES = logStops(2000);
  // Hull refinement runs from 1 to 100 rounds. Hull corners caps the
  // corners on each hull, from 3 to 1000, on a rough log scale.
  var HULL_STEPS = logStops(100);
  var HULL_CORNERS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 64, 80, 100, 128, 160, 200, 256, 320, 400, 500, 640, 800, 1000];
  // Grid sizes: Cols, Rows and Per side each run from 2 to 12.
  var GRID_MIN = 2, GRID_MAX = 12;
  // Separate thousands only from 10,000 up: 1000 and 9999, then 10,000.
  function count(n) { return Math.abs(n) >= 10000 ? Math.round(n).toLocaleString('en-GB') : String(Math.round(n)); }
  // While a child or the Iterations slider is dragged, the main view draws
  // within this time, at most this many copies, then draws in full on
  // release. 12 ms keeps a drag at 60 frames a second with the editor drawn
  // too: about 30,000 Dragon copies, where 4000 was the old fixed cap.
  var DRAG_COPIES = 200000, DRAG_MS = 12;
  var PRESETS = {
    fast: { depth: 6, minDepth: 3, maxInstances: 10000, minScale: 1e-3, maxMs: 100, analysisDepth: 5, hullIterations: 10, hullCorners: 12 },
    balanced: { depth: 7, minDepth: 4, maxInstances: 25000, minScale: 1 / 2500, maxMs: 250, analysisDepth: 7, hullIterations: 30, hullCorners: 16 },
    detailed: { depth: 10, minDepth: 5, maxInstances: 120000, minScale: 0, maxMs: 1000, analysisDepth: 9, hullIterations: 100, hullCorners: 24 }
  };
  var LIMIT_FIELDS = ['minDepth', 'maxInstances', 'minScale', 'maxMs', 'analysisDepth', 'hullIterations', 'hullCorners'];
  // The view settings a fractal saves, and the defaults for one that saved
  // none. Shape draws each copy as its parent's hull or as its frame.
  // Numbers shows or hides each copy's parent number in the views.
  // Style sets how copies fill (see drawBatch); Solid is the default.
  var VIEW_DEFAULTS = { snapGrid: false, showHull: true, shape: 'hull', numbers: false, style: 'solid' };
  // Snap each preset onto the slider stops, so a preset always matches a stop.
  Object.keys(PRESETS).forEach(function (key) {
    var preset = PRESETS[key];
    preset.maxInstances = nearest(preset.maxInstances, COPY_VALUES);
    preset.minScale = nearest(preset.minScale, SCALE_VALUES);
    preset.maxMs = nearest(preset.maxMs, TIME_VALUES);
  });
  var el = {};
  var state = {
    // currentLetter is the parent being edited, and also the one the views draw.
    // focus says what Backspace and Cmd+D act on: a 'child' or the 'parent'.
    rule: M.clone(demos.sieve), demo: 'sieve', currentLetter: 'p1', selectedId: null, focus: 'child',
    brush: M.identity(), newLetter: null, snapGrid: VIEW_DEFAULTS.snapGrid, editorCamera: null,
    depth: 7, showHull: true, camera: { zoom: 1, x: 0, y: 0 }, dragging: false,
    limits: Object.assign({}, PRESETS.balanced), preset: 'balanced', colourMode: null,
    shape: VIEW_DEFAULTS.shape, numbers: VIEW_DEFAULTS.numbers, style: VIEW_DEFAULTS.style,
    analysis: null, editorView: null, noticeTimer: null
  };

  function $(id) { return document.getElementById(id); }
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  function modKey() { return MAC ? '⌘' : 'Ctrl+'; }
  function letterById(id) { return state.rule.letters.find(function (letter) { return letter.id === id; }); }
  function currentLetter() { return letterById(state.currentLetter) || state.rule.letters[0]; }
  function selectedChild() {
    var letter = currentLetter();
    return letter && letter.children.find(function (child) { return child.id === state.selectedId; });
  }
  // A parent's colour: its own, if chosen, or the default for its position.
  // Parents 1 to 4 default to yellow, red, blue and green, then the rest of
  // the palette in its own order.
  var PARENT_DEFAULTS = ['#e9b44c', '#dc6f82', '#57a9d8', '#7fc66c'];
  PARENT_DEFAULTS = PARENT_DEFAULTS.concat(PALETTE.filter(function (hex) { return PARENT_DEFAULTS.indexOf(hex) < 0; }));
  function defaultColour(index) { return PARENT_DEFAULTS[(index < 0 ? 0 : index) % PARENT_DEFAULTS.length]; }
  // Reordering, adding or removing parents renumbers them. Each parent keeps
  // the colour it showed before: a colour that differs from the default for
  // its new number is stored on it, and one that matches is dropped.
  function keepColours(change) {
    var before = {};
    state.rule.letters.forEach(function (letter) { before[letter.id] = colour(letter.id); });
    change();
    state.rule.letters.forEach(function (letter, index) {
      var hex = before[letter.id];
      if (!hex) return;
      if (hex === defaultColour(index)) delete letter.colour; else letter.colour = hex;
    });
  }
  function colour(id) {
    var index = state.rule.letters.findIndex(function (letter) { return letter.id === id; });
    var letter = state.rule.letters[index];
    return letter && letter.colour || defaultColour(index);
  }
  // A parent's number is its position in the list, from 1.
  function label(id) { var index = state.rule.letters.findIndex(function (letter) { return letter.id === id; }); return String(index + 1); }
  // Colour modes. Order: every copy is numbered in order, first child first
  // at every level, and takes its place along a red, orange, yellow, green,
  // cyan and blue scale. At each level a copy's share of the scale splits
  // equally among its children. Parent: each parent keeps its own colour. Top
  // copy: each copy takes the colour of the top-level child it sits inside.
  // The default is Order for every rule; null means default.
  var COLOUR_MODES = ['order', 'parent', 'top'];
  function colourMode() { return state.colourMode || 'order'; }
  function readColourMode(value) { return COLOUR_MODES.indexOf(value) >= 0 ? value : null; }
  function hslHex(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    function part(n) { var k = (n + h / 30) % 12, v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return ('0' + Math.round(v * 255).toString(16)).slice(-2); }
    return '#' + part(0) + part(8) + part(4);
  }
  // 256 steps from red (hue 0) to a mid blue (hue 225).
  var ORDER_SCALE = []; for (var step = 0; step < 256; step++) ORDER_SCALE.push(hslHex(step / 255 * 225, .78, .56));
  var orderLetters = {};
  function buildOrder() {
    orderLetters = {};
    state.rule.letters.forEach(function (letter) { orderLetters[letter.id] = letter.children.map(function (child) { return child.letter; }); });
  }
  // The middle of a copy's share of the order, from 0 to 1. The path holds
  // its child index at each level, from the parent the views start at.
  function orderFraction(path) {
    var letter = state.currentLetter, start = 0, width = 1;
    for (var i = 0; i < path.length; i++) {
      // The path holds base-36 digits: 0 to 9, then a to z.
      var code = path.charCodeAt(i), kids = orderLetters[letter], j = code < 58 ? code - 48 : code - 87;
      if (!kids || !kids.length || !(j < kids.length)) break;
      start += width * j / kids.length; width /= kids.length; letter = kids[j];
    }
    return start + width / 2;
  }
  function itemColour(item) {
    var mode = colourMode();
    if (mode === 'top' && item.path) return PALETTE[parseInt(item.path[0], 36) % PALETTE.length];
    if (mode === 'order' && item.path != null) return ORDER_SCALE[Math.min(255, Math.floor(orderFraction(item.path) * 256))];
    return colour(item.letter);
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function allChildren() { return state.rule.letters.reduce(function (out, letter) { return out.concat(letter.children); }, []); }

  function encode(value) {
    var text = encodeURIComponent(JSON.stringify(value)).replace(/%([0-9A-F]{2})/g, function (_, p) { return String.fromCharCode(parseInt(p, 16)); });
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(text) {
    text = text.replace(/-/g, '+').replace(/_/g, '/');
    while (text.length % 4) text += '=';
    var binary = atob(text), escaped = '';
    for (var i = 0; i < binary.length; i++) escaped += '%' + binary.charCodeAt(i).toString(16).padStart(2, '0');
    return JSON.parse(decodeURIComponent(escaped));
  }

  function gridSize(n) { return Number.isInteger(n) && n >= GRID_MIN && n <= GRID_MAX; }
  function validRule(rule) {
    return rule && rule.version === 3 && ['square', 'triangle'].indexOf(rule.frame) >= 0 &&
      rule.grid && gridSize(rule.grid.rows) && gridSize(rule.grid.cols) && gridSize(rule.grid.side) &&
      Array.isArray(rule.letters) && rule.letters.length &&
      rule.letters.every(function (letter) { return typeof letter.id === 'string' && Array.isArray(letter.children) &&
        (letter.colour == null || /^#[0-9a-f]{6}$/i.test(letter.colour)) && letter.children.every(function (child) {
        return typeof child.letter === 'string' && Array.isArray(child.matrix) && child.matrix.length === 6 && child.matrix.every(Number.isFinite);
      }); });
  }

  function loadAddress() {
    try {
      var hash = location.hash.slice(1);
      if (hash.indexOf('demo=') === 0 && demos[hash.slice(5)]) {
        state.demo = hash.slice(5); state.rule = M.clone(demos[state.demo]);
      } else if (hash.indexOf('rule=') === 0) {
        var saved = decode(hash.slice(5));
        if (!validRule(saved.rule)) throw new Error('Invalid rule');
        state.rule = saved.rule; state.demo = null;
        state.currentLetter = saved.current || state.rule.letters[0].id; state.depth = Math.max(0, Math.min(32, saved.depth == null ? 7 : saved.depth));
        state.colourMode = readColourMode(saved.colour);
        if (saved.camera) state.camera = saved.camera;
        readView(saved);
      }
    } catch (error) {
      state.rule = M.clone(demos.sieve); state.demo = 'sieve';
      setTimeout(function () { notice('That address did not contain a valid rule. The Sieve opened instead.'); }, 0);
    }
    if (!letterById(state.currentLetter)) state.currentLetter = state.rule.letters[0].id;
  }

  function saveAddress() {
    var hash;
    if (state.demo && sameRule(state.rule, demos[state.demo]) && state.currentLetter === state.rule.letters[0].id && matchingPreset() === 'balanced' && defaultView() && state.colourMode == null && state.camera.zoom === 1 && !state.camera.x && !state.camera.y) {
      hash = 'demo=' + state.demo;
    } else {
      hash = 'rule=' + encode(Object.assign({ rule: state.rule, current: state.currentLetter, depth: state.depth,
        camera: state.camera, colour: state.colourMode || undefined }, viewSettings()));
    }
    history.replaceState(null, '', location.pathname + location.search + '#' + hash);
  }

  // The view settings travel with a fractal, in its address and its save:
  // snap, hull outline, shape, numbers, style and the calculation limits. A
  // fractal that saved none opens with the defaults.
  function viewSettings() {
    return { snap: state.snapGrid, hull: state.showHull, shape: state.shape, numbers: state.numbers, style: state.style, limits: sanitiseLimits(state.limits) };
  }
  function readView(saved) {
    saved = saved || {};
    state.snapGrid = typeof saved.snap === 'boolean' ? saved.snap : VIEW_DEFAULTS.snapGrid;
    state.showHull = typeof saved.hull === 'boolean' ? saved.hull : VIEW_DEFAULTS.showHull;
    state.shape = saved.shape === 'frame' || saved.shape === 'hull' ? saved.shape : VIEW_DEFAULTS.shape;
    state.numbers = typeof saved.numbers === 'boolean' ? saved.numbers : VIEW_DEFAULTS.numbers;
    state.style = STYLES.indexOf(saved.style) >= 0 ? saved.style : VIEW_DEFAULTS.style;
    state.limits = sanitiseLimits(saved.limits || PRESETS.balanced);
    state.preset = matchingPreset();
  }
  function defaultView() {
    return state.snapGrid === VIEW_DEFAULTS.snapGrid && state.showHull === VIEW_DEFAULTS.showHull &&
      state.shape === VIEW_DEFAULTS.shape && state.numbers === VIEW_DEFAULTS.numbers && state.style === VIEW_DEFAULTS.style;
  }

  function sameRule(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function markEdited() { state.demo = null; el.demo.value = ''; }

  function nearest(value, choices) {
    return choices.reduce(function (best, candidate) { return Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best; }, choices[0]);
  }

  function sanitiseLimits(limits) {
    return {
      minDepth: Math.max(0, Math.min(8, Math.round(limits.minDepth == null ? 4 : limits.minDepth))),
      maxInstances: nearest(Number(limits.maxInstances) || 60000, COPY_VALUES),
      minScale: nearest(Number(limits.minScale) || 0, SCALE_VALUES),
      maxMs: nearest(Number(limits.maxMs) || 250, TIME_VALUES),
      analysisDepth: Math.max(4, Math.min(10, Math.round(limits.analysisDepth || 7))),
      hullIterations: nearest(Number(limits.hullIterations) || PRESETS.balanced.hullIterations, HULL_STEPS),
      hullCorners: nearest(Number(limits.hullCorners) || PRESETS.balanced.hullCorners, HULL_CORNERS)
    };
  }

  function matchingPreset() {
    var name = Object.keys(PRESETS).find(function (key) {
      var preset = PRESETS[key];
      return state.depth === preset.depth && LIMIT_FIELDS.every(function (field) { return state.limits[field] === preset[field]; });
    });
    return name || 'custom';
  }

  // Copy and Paste move the calculation limits from one fractal to
  // another. The copy is kept in this browser, so it survives a reload.
  var LIMITS_KEY = 'fractal-limits-copy', copiedLimits = null;
  function readCopiedLimits() {
    if (copiedLimits) return copiedLimits;
    try { var saved = JSON.parse(localStorage.getItem(LIMITS_KEY) || 'null'); if (saved && typeof saved === 'object') copiedLimits = sanitiseLimits(saved); } catch (error) {}
    return copiedLimits;
  }
  function copyLimits() {
    copiedLimits = sanitiseLimits(state.limits);
    try { localStorage.setItem(LIMITS_KEY, JSON.stringify(copiedLimits)); } catch (error) {}
    syncLimitControls(); notice('Copied the calculation limits.');
  }
  function pasteLimits() {
    var limits = readCopiedLimits(); if (!limits) return;
    state.limits = sanitiseLimits(limits); state.preset = matchingPreset();
    updateAnalysis(); syncLimitControls(); renderReadouts(); renderIterations(); renderMain(); saveAddress();
    notice('Pasted the calculation limits.');
  }

  function applyPreset(name) {
    if (!PRESETS[name]) return;
    state.depth = PRESETS[name].depth; state.limits = sanitiseLimits(PRESETS[name]); state.preset = name;
    updateAnalysis(); syncControls(); renderReadouts(); renderMain(); saveAddress();
  }

  function setCustom() { state.preset = matchingPreset(); }

  function notice(message) {
    if (!el.notice) return;
    clearTimeout(state.noticeTimer); el.notice.textContent = message; el.notice.hidden = false;
    state.noticeTimer = setTimeout(function () { el.notice.hidden = true; }, 3200);
  }

  // The snap grid, shared by every parent: Cols by Rows on a square frame,
  // Per side on a triangle frame.
  function snapGridSize() { return state.rule.grid; }

  // Every parent and child draws in one frame shape, a square or a triangle.
  // The frame is only a picture of the maps, so a switch keeps every map and
  // the fractal stays the same; only the outlines change.
  function setFrame(frame) {
    if (frame === state.rule.frame) return;
    state.rule.frame = frame; state.brush = M.identity(); state.editorCamera = null;
    markEdited(); commit();
  }

  function setGrid(rows, cols) {
    // The grid only guides snapping; it never moves a child.
    state.rule.grid.rows = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(rows || 2)));
    state.rule.grid.cols = Math.max(GRID_MIN, Math.min(GRID_MAX, Math.round(cols || rows)));
  }

  function prepareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    var width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height); return { ctx: ctx, width: width, height: height, dpr: dpr };
  }

  // A view maps the plane, where y points up, to canvas pixels, where y
  // points down. (x, y) is the origin's pixel. The camera's x and y are a
  // pan in pixels.
  function makeView(width, height, bounds, margin, camera) {
    var bw = Math.max(.001, bounds.maxX - bounds.minX), bh = Math.max(.001, bounds.maxY - bounds.minY);
    var scale = Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh);
    var zoom = camera ? camera.zoom : 1, x = camera ? camera.x : 0, y = camera ? camera.y : 0;
    scale *= zoom;
    return { scale: scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale + x,
      y: height / 2 + (bounds.minY + bounds.maxY) / 2 * scale + y,
      point: function (p) { return [this.x + p[0] * this.scale, this.y - p[1] * this.scale]; },
      unpoint: function (q) { return [(q[0] - this.x) / this.scale, (this.y - q[1]) / this.scale]; },
      // The canvas transform that draws a copy's own frame in pixels.
      transform: function (m) { var s = this.scale; return [s * m[0], -s * m[1], s * m[2], -s * m[3], this.x + s * m[4], this.y - s * m[5]]; } };
  }

  function instancesBounds(instances, frame, shapes) {
    var points = [], outline = M.framePolygon(frame);
    instances.forEach(function (item) {
      (shapes && shapes[item.letter] || outline).forEach(function (p) { points.push(M.apply(item.matrix, p)); });
    });
    return M.bounds(points);
  }

  // The shapes the views draw: each parent's hull, when Shape is Hull and
  // the rule converges. A parent without a proper hull keeps its frame.
  // While a child is dragged the hulls are out of date, so copies draw as
  // frames until the drag ends.
  function copyShapes() {
    var a = state.analysis;
    if (state.shape !== 'hull' || state.editorDrag || !a || !a.hulls || a.status.name !== 'Converges') return null;
    var shapes = {};
    state.rule.letters.forEach(function (letter) { var hull = a.hulls[letter.id]; if (hull && hull.length >= 3) shapes[letter.id] = hull; });
    return shapes;
  }

  function path(ctx, points) {
    ctx.beginPath(); points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
  }

  function offCanvas(points, size) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      var p = points[i]; if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    }
    return maxX < -2 || maxY < -2 || minX > size[0] + 2 || minY > size[1] + 2;
  }
  function drawInstance(ctx, item, view, options) {
    var framePixels = M.transformedFrame(state.rule.frame, item.matrix).map(view.point, view);
    // A copy wholly off the canvas is skipped. The copies are still counted.
    if (options.clip && offCanvas(framePixels, options.clip)) return;
    var edge = Math.sqrt(Math.abs(M.polygonArea(framePixels))), fillSmall = edge < (options.letterThreshold || 10);
    ctx.save(); ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
    path(ctx, framePixels);
    if (fillSmall || options.fill) { ctx.fillStyle = itemColour(item); ctx.fill(); }
    else { ctx.fillStyle = itemColour(item) + '28'; ctx.fill(); }
    ctx.strokeStyle = options.stroke || itemColour(item); ctx.lineWidth = options.lineWidth || 1; ctx.stroke();
    if (!fillSmall && options.letters !== false) {
      ctx.transform.apply(ctx, view.transform(item.matrix));
      drawMark(ctx, item.letter, itemColour(item), state.rule.frame, options.childName);
    }
    ctx.restore();
  }

  // Draws many copies fast. Copies of one colour and opacity share one path,
  // so the canvas fills and strokes each colour once instead of once per
  // copy. Each outline is added anticlockwise, so overlapping copies, flipped
  // or not, never cancel to a hole. Copies large enough for a number still
  // get one, drawn on top. Colour groups draw in the order they first
  // appear, so the overlap order follows the colours, not each copy.
  // Styles: how a copy's fill depends on its size on screen. The size is
  // the side of a square of the same area, in pixels. Solid fills every
  // copy in full colour. Outline draws every copy as an outline over a
  // faint fill. Blend runs from faint at 40 pixels and above to solid at 4
  // and below, in five steps on a log scale, so a mixed picture changes
  // gradually. Auto picks one style for the whole picture from its typical
  // copy: outlines while that copy can hold a number, solid once it cannot.
  var STYLES = ['solid', 'blend', 'auto', 'outline'], TINT = 40 / 255, INK = '#111419';
  function fillLevel(style, size, threshold, autoSolid) {
    if (style === 'outline') return TINT;
    if (style === 'auto') return autoSolid ? 1 : TINT;
    if (style === 'blend') {
      if (size >= 40) return TINT;
      if (size <= 4) return 1;
      var t = Math.round(Math.log(40 / size) / Math.LN10 * 5) / 5;
      return TINT + (1 - TINT) * t;
    }
    return 1;
  }

  // With options.shapes, a copy draws as its parent's hull instead of its
  // frame, where that parent has one. The number stays in the frame's place.
  // options.style picks the fill, as above.
  function drawBatch(ctx, items, view, options) {
    var frame = M.framePolygon(state.rule.frame), shapes = options.shapes, groups = [], byKey = {}, marks = [];
    var clip = options.clip, threshold = options.letterThreshold || 10, style = STYLES.indexOf(options.style) >= 0 ? options.style : 'solid', xs = [], ys = [];
    // Auto: the median copy size, from up to 2000 copies spread through the list.
    var autoSolid = false;
    if (style === 'auto' && items.length) {
      var areaOf = {}, sizes = [], stride = Math.max(1, Math.floor(items.length / 2000));
      for (var s0 = 0; s0 < items.length; s0 += stride) {
        var it = items[s0], shape = shapes && shapes[it.letter] || frame;
        if (areaOf[it.letter] == null) areaOf[it.letter] = M.polygonArea(shape);
        sizes.push(view.scale * Math.sqrt(Math.abs(M.determinant(it.matrix)) * areaOf[it.letter]));
      }
      sizes.sort(function (a, b) { return a - b; });
      autoSolid = sizes[Math.floor(sizes.length / 2)] < threshold;
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i], m = item.matrix, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, area = 0;
      var poly = shapes && shapes[item.letter] || frame, n = poly.length;
      for (var k = 0; k < n; k++) {
        var p = poly[k], x = view.x + view.scale * (m[0] * p[0] + m[2] * p[1] + m[4]), y = view.y - view.scale * (m[1] * p[0] + m[3] * p[1] + m[5]);
        xs[k] = x; ys[k] = y; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (clip && (maxX < -2 || maxY < -2 || minX > clip[0] + 2 || minY > clip[1] + 2)) continue;
      for (k = 0; k < n; k++) { var j = (k + 1) % n; area += xs[k] * ys[j] - xs[j] * ys[k]; }
      var size = Math.sqrt(Math.abs(area / 2)), level = fillLevel(style, size, threshold, autoSolid), colour = itemColour(item);
      // Canvas ignores an opacity above 1, so clamp it.
      var alpha = Math.min(1, options.alphaFor ? options.alphaFor(item) : (options.alpha == null ? 1 : options.alpha)), key = colour + alpha;
      var group = byKey[key];
      if (!group) { group = byKey[key] = { colour: colour, alpha: alpha, levels: {} }; groups.push(group); }
      var target = group.levels[level] || (group.levels[level] = new Path2D());
      // Each outline ends with a line back to its start. Path2D's closePath
      // slows as the path grows, so it is not used.
      if (area < 0) { target.moveTo(xs[0], ys[0]); for (k = 1; k < n; k++) target.lineTo(xs[k], ys[k]); target.lineTo(xs[0], ys[0]); }
      else { target.moveTo(xs[n - 1], ys[n - 1]); for (k = n - 2; k >= 0; k--) target.lineTo(xs[k], ys[k]); target.lineTo(xs[n - 1], ys[n - 1]); }
      // A number goes on a copy large enough to hold one: in dark ink on a
      // fill that is mostly solid, in the copy's colour on a faint one.
      if (size >= threshold && options.letters !== false) marks.push([item, level >= .5 ? INK : colour, alpha]);
    }
    // Each group fills its faint copies first and its solid ones last. Every
    // copy is stroked in its own colour, which on a solid copy only closes
    // the hairline gaps between neighbours.
    ctx.save(); ctx.lineWidth = options.lineWidth || 1; ctx.lineJoin = 'bevel';
    groups.forEach(function (group) {
      ctx.strokeStyle = group.colour; ctx.fillStyle = group.colour;
      Object.keys(group.levels).map(Number).sort(function (a, b) { return a - b; }).forEach(function (level) {
        var path = group.levels[level];
        ctx.globalAlpha = group.alpha * level; ctx.fill(path);
        ctx.globalAlpha = group.alpha; ctx.stroke(path);
      });
    });
    ctx.restore();
    marks.forEach(function (mark) {
      ctx.save(); ctx.globalAlpha = mark[2];
      ctx.transform.apply(ctx, view.transform(mark[0].matrix));
      drawMark(ctx, mark[0].letter, mark[1], state.rule.frame); ctx.restore();
    });
  }

  // The orientation mark: the parent's number with an underline beneath it.
  // The underline shows which side is down. In the editor, the child's own
  // letter, A, B, C and on, sits at its top left (a triangle: its bottom-left
  // corner, off the centre line, so Flip H shows), so it turns and flips with
  // the child. The letter is the child's place in its parent's list. The
  // number uses a serif with lining figures, so every digit sits on the
  // baseline and clears the underline.
  //
  // The canvas draws the mark in the frame's own coordinates, with y
  // flipped so the text stands upright. Below, y therefore points down: a
  // negative y is above the frame's centre.
  var MARK_FONT = '"Times New Roman", Times, serif';
  function childName(index) { return index < 26 ? String.fromCharCode(65 + index) : 'Z' + (index - 25); }
  function drawMark(ctx, letterId, fill, frame, name) {
    var tri = frame === 'triangle', text = label(letterId);
    ctx.scale(1, -1);
    var centre = tri ? [0, -M.TRI_H / 15] : [0, -.02], size = tri ? .34 : .42;
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + size + 'px ' + MARK_FONT;
    // Lining digits stand about 0.66 em tall, so this centres them.
    var baseline = centre[1] + size * .33;
    ctx.fillText(text, centre[0], baseline);
    var half = Math.max(.09, ctx.measureText(text).width / 2), under = baseline + size * .13;
    ctx.lineWidth = size * .07; ctx.beginPath(); ctx.moveTo(centre[0] - half, under); ctx.lineTo(centre[0] + half, under); ctx.stroke();
    if (name) {
      // A triangle's letter sits near the bottom-left corner, along the line
      // to the centre, which clears both edges and the number.
      var spot = tri ? [.19 * M.TRI_H - .5, M.TRI_H / 3 - .095] : [-.35, -.36];
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + (tri ? .13 : .16) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(name, spot[0], spot[1]);
    }
  }

  function drawHull(ctx, hull, view) {
    if (!hull || hull.length < 2) return;
    path(ctx, hull.map(view.point, view)); ctx.strokeStyle = '#f5f0dc'; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  function renderIterations() {
    buildOrder();
    if (state.stripHidden) return;
    var shapes = copyShapes();
    document.querySelectorAll('#iteration-strip canvas').forEach(function (canvas) {
      var level = Number(canvas.dataset.level), info = prepareCanvas(canvas);
      info.ctx.fillStyle = '#11151b'; info.ctx.fillRect(0, 0, info.width, info.height);
      // expand keeps unsplit parents at the copy cap, so a big rule still shows whole.
      var instances = level ? M.expand(state.rule, state.currentLetter, level, { maxInstances: 12000, maxMs: 0 }) : [{ letter: state.currentLetter, matrix: M.identity() }];
      if (!instances.length) return;
      var view = makeView(info.width, info.height, instancesBounds(instances, state.rule.frame, shapes), 12, null);
      drawBatch(info.ctx, instances, view, { letterThreshold: 7, lineWidth: .7, shapes: shapes, letters: state.numbers, style: state.style });
    });
  }

  // Grows and Cycles have no limit shape, so the views show the first few levels.
  function growing() { return !!state.analysis && /^(Grows|Cycles)$/.test(state.analysis.status.name); }

  // The time limit covers a whole frame: working out the copies and drawing
  // them. Drawing takes most of it, and its cost is known only afterwards, so
  // each frame measures its time per copy and the next frame turns the time
  // limit into a copy limit. Drag frames and full frames keep separate
  // estimates: a drag frame stops at shallower levels, where larger copies
  // cost more each to fill. The first frames assume 1 and 2 µs a copy.
  var msPerCopy = { full: .001, drag: .002 };
  function frameKind() { return state.dragging ? 'drag' : 'full'; }
  function timeCopies(ms) { return Math.max(1, Math.floor(ms / msPerCopy[frameKind()])); }
  function measureFrame(copies, ms) {
    if (copies < 200) return;
    var kind = frameKind(), cost = Math.max(.0001, ms / copies);
    msPerCopy[kind] = msPerCopy[kind] * .5 + cost * .5;
  }

  function mainInstances(cull) {
    var depth = state.depth, cap = state.dragging ? Math.min(DRAG_COPIES, state.limits.maxInstances) : state.limits.maxInstances;
    var maxMs = state.dragging ? Math.min(DRAG_MS, state.limits.maxMs) : state.limits.maxMs;
    var timeCap = maxMs ? timeCopies(maxMs) : Infinity, byTime = timeCap < cap;
    if (byTime) cap = timeCap;
    var items = expandMain(depth, cap, { maxInstances: cap, maxMs: maxMs, cull: cull,
      minScale: state.limits.minScale, minDepth: Math.min(state.limits.minDepth, depth) });
    if (byTime && items.stoppedBy === 'copies') items.stoppedBy = 'time';
    return items;
  }

  function expandMain(depth, cap, options) {
    if (growing()) {
      var combined = [], reason = null;
      for (var level = Math.max(0, Math.min(depth, 4) - 3); level <= Math.min(depth, 4); level++) {
        var remaining = Math.max(1, cap - combined.length);
        var levelOptions = Object.assign({}, options, { maxInstances: remaining, minDepth: Math.min(options.minDepth, level) });
        var items = level ? M.expand(state.rule, state.currentLetter, level, levelOptions) : [{ letter: state.currentLetter, matrix: M.identity(), level: 0 }];
        reason = items.stoppedBy || reason;
        items.forEach(function (item) { item.level = level; combined.push(item); });
        if (combined.length >= cap) { reason = 'copies'; break; }
      }
      combined.stoppedBy = reason || 'iterations';
      return combined;
    }
    return depth ? M.expand(state.rule, state.currentLetter, depth, options) : [{ letter: state.currentLetter, matrix: M.identity(), level: 0 }];
  }

  // A test for expand: true when a copy's whole branch lies off the canvas.
  function offScreen(view, info) {
    var discs = M.coverDiscs(state.rule);
    if (!discs) return null;
    var pad = 2, w = info.width, h = info.height;
    return function (item) {
      var disc = discs[item.letter]; if (!disc) return false;
      var at = view.point(M.apply(item.matrix, disc.centre)), x = at[0], y = at[1], m = item.matrix;
      var r = view.scale * M.singularValues(m)[0] * disc.radius + pad;
      return x + r < 0 || y + r < 0 || x - r > w || y - r > h;
    };
  }

  function renderMain() {
    buildOrder();
    var info = prepareCanvas(el.limit), ctx = info.ctx;
    ctx.fillStyle = css('--stage'); ctx.fillRect(0, 0, info.width, info.height);
    if (!currentLetter().children.length) {
      ctx.fillStyle = '#89939d'; ctx.textAlign = 'center'; ctx.font = '14px ' + MARK_FONT;
      ctx.fillText('Parent ' + label(state.currentLetter) + ' has no children yet.', info.width / 2, info.height / 2);
      el.instanceCount.textContent = ''; return;
    }
    // When the frame is known before expanding, branches wholly off screen
    // are dropped, so the copy and time limits are spent on what shows.
    var started = performance.now();
    var known = state.analysis && state.analysis.bounds && state.analysis.status.name === 'Converges' ? state.analysis.bounds : null;
    // While a child is dragged, the main view keeps the scale it had at the
    // start, so the picture does not jump as the extent changes.
    if (state.editorDrag && state.editorDrag.mainBounds) known = state.editorDrag.mainBounds;
    var view = known ? makeView(info.width, info.height, known, 42, state.camera) : null;
    var instances = mainInstances(view && !growing() ? offScreen(view, info) : null), shapes = copyShapes();
    var b = known || instancesBounds(instances, state.rule.frame, shapes);
    state.lastMainBounds = b;
    if (!view) view = makeView(info.width, info.height, b, 42, state.camera);
    drawBatch(ctx, instances, view, { letterThreshold: 8, lineWidth: .65, clip: [info.width, info.height], shapes: shapes, letters: state.numbers, style: state.style,
      alphaFor: function (item) { return item.level == null ? .93 : .22 + .18 * item.level; } });
    if (state.showHull && state.analysis && state.analysis.status.name === 'Converges' && !state.editorDrag) drawHull(ctx, state.analysis.hull, view);
    measureFrame(instances.length, performance.now() - started);
    var reason = { copies: 'copy limit', time: 'time limit', scale: 'scale limit', iterations: 'iteration limit' }[instances.stoppedBy];
    el.instanceCount.textContent = count(instances.length) + (instances.length === 1 ? ' copy' : ' copies') + (reason ? ' · ' + reason : '');
  }

  function editorBounds() {
    var points = M.framePolygon(state.rule.frame).slice();
    currentLetter().children.forEach(function (child) {
      M.transformedFrame(state.rule.frame, child.matrix).forEach(function (p) { points.push(p); });
    });
    var b = M.bounds(points), pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * .08;
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }

  function renderEditor() {
    buildOrder();
    var info = prepareCanvas(el.ruleEditor), ctx = info.ctx;
    ctx.fillStyle = css('--paper'); ctx.fillRect(0, 0, info.width, info.height);
    // The editor keeps its view during a drag, so the frame stays under the pointer.
    // With a zoom or pan in force, the editor's camera sets the view instead.
    var cam = state.editorCamera;
    var view = state.editorDrag && state.editorView ? state.editorView : makeView(info.width, info.height, cam ? cam.bounds : editorBounds(), 13, cam); state.editorView = view;
    el.editorFit.disabled = !cam;
    var parent = M.framePolygon(state.rule.frame).map(view.point, view);
    path(ctx, parent); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    // The grid always shows. Snap corners only decides whether corners snap to it.
    drawSnapGrid(ctx, view, info.width, info.height);
    currentLetter().children.forEach(function (child, index) {
      var selected = child.id === state.selectedId, item = { letter: child.letter, matrix: child.matrix, path: index.toString(36) };
      drawInstance(ctx, item, view, { letterThreshold: 5, lineWidth: selected ? 2.6 : 1.2, stroke: selected ? '#ffffff' : itemColour(item), alpha: selected ? 1 : .83, childName: childName(index) });
    });
    // Handles go on top of every child, so a covered child can still be resized.
    var chosen = selectedChild();
    if (chosen) drawHandles(ctx, chosen, view);
  }

  function updateAnalysis() {
    state.analysis = M.analyse(state.rule, state.currentLetter, state.limits.analysisDepth,
      { maxInstances: state.limits.maxInstances, hullIterations: state.limits.hullIterations, hullCorners: state.limits.hullCorners, maxMs: state.limits.maxMs });
  }

  function formatNumber(value, digits) { return value == null || !isFinite(value) ? '—' : Number(value).toFixed(digits == null ? 3 : digits).replace(/\.000$/, ''); }

  function scaleLabel(value) {
    if (!value) return 'Unlimited';
    return '1/' + count(1 / value);
  }

  function syncLimitControls() {
    state.preset = matchingPreset();
    document.querySelectorAll('[data-preset]').forEach(function (button) { button.classList.toggle('active', button.dataset.preset === state.preset); });
    el.minDepth.value = state.limits.minDepth; el.minDepthValue.textContent = state.limits.minDepth;
    el.maxCopies.value = COPY_VALUES.indexOf(state.limits.maxInstances); el.maxCopiesValue.textContent = count(state.limits.maxInstances);
    el.minScale.value = SCALE_VALUES.indexOf(state.limits.minScale); el.minScaleValue.textContent = scaleLabel(state.limits.minScale);
    el.maxTime.value = TIME_VALUES.indexOf(state.limits.maxMs); el.maxTimeValue.textContent = count(state.limits.maxMs) + ' ms';
    el.analysisDepth.value = state.limits.analysisDepth; el.analysisDepthValue.textContent = state.limits.analysisDepth;
    el.hullIterations.value = HULL_STEPS.indexOf(state.limits.hullIterations); el.hullIterationsValue.textContent = stepsLabel(state.limits.hullIterations);
    el.hullCap.value = HULL_CORNERS.indexOf(state.limits.hullCorners); el.hullCapValue.textContent = state.limits.hullCorners;
    el.pasteLimits.disabled = !readCopiedLimits();
  }
  function stepsLabel(n) { return n + (n === 1 ? ' step' : ' steps'); }

  function renderReadouts() {
    var a = state.analysis, status = a.status.name, empty = !currentLetter().children.length;
    if (empty) status = 'Empty';
    el.statusBadge.textContent = status; el.statusBadge.dataset.status = status.toLowerCase();
    el.statusDetail.textContent = empty ? 'Parent ' + label(state.currentLetter) + ' has no children yet. Add one to start.' : a.status.detail;
    // A named formula shows as Formula. Otherwise the row says how the value
    // was found. Where copies overlap, the value is only an upper limit.
    el.dimensionLabel.textContent = a.exactDimension ? 'Formula' : 'Method';
    el.dimension.textContent = empty ? '—' : a.exactDimension || (a.dimensionKind === 'Similarity' ? 'Similarity equation' : a.dimensionKind);
    el.dimensionValue.textContent = empty || a.dimension == null ? '—' : (a.overlap ? '≤ ' : '') + formatNumber(a.dimension, 4);
    el.boxDimension.textContent = empty || a.boxDimension == null ? '—' : formatNumber(a.boxDimension, 2);
    el.overlap.textContent = empty ? '—' : a.overlap ? 'Likely' : 'None found';
    el.hullCorners.textContent = empty ? '—' : a.hull.length; el.hullArea.textContent = empty ? '—' : formatNumber(a.hullArea, 4);
    el.explanationText.textContent = state.demo ? EXPLANATIONS[state.demo] : 'The selected parent expands through the linked affine rule. Change a child to see every view and measurement update.';
  }

  function renderPalette() {
    el.paletteKey.innerHTML = '';
    var mode = colourMode();
    if (mode === 'order') {
      el.paletteLabel.textContent = 'Colour by order';
      var bar = document.createElement('i'); bar.className = 'order-key'; bar.title = 'First copy red, last copy blue';
      bar.style.background = 'linear-gradient(90deg, ' + [0, 51, 102, 153, 204, 255].map(function (i) { return ORDER_SCALE[i]; }).join(', ') + ')';
      el.paletteKey.appendChild(bar); return;
    }
    if (mode === 'top') {
      el.paletteLabel.textContent = 'Colour by top-level copy';
      var start = letterById(state.currentLetter) || state.rule.letters[0];
      start.children.slice(0, PALETTE.length).forEach(function (child, index) { var dot = document.createElement('i'); dot.style.background = PALETTE[index]; dot.title = 'Copy ' + (index + 1); el.paletteKey.appendChild(dot); });
      return;
    }
    el.paletteLabel.textContent = 'Colour by parent';
    state.rule.letters.forEach(function (letter, index) { var dot = document.createElement('i'); dot.style.background = colour(letter.id); dot.title = 'Parent ' + (index + 1); el.paletteKey.appendChild(dot); });
  }

  // The parent row: one numbered button per parent. A click edits that
  // parent and shows it in every view. Shift with a number key does the
  // same. Drag a button to reorder the parents.
  function renderLetterControls() {
    el.letterTabs.innerHTML = '';
    state.rule.letters.forEach(function (letter, index) {
      var active = letter.id === state.currentLetter, button = document.createElement('button');
      button.type = 'button'; button.className = 'letter-tab' + (active ? ' active' : '');
      button.textContent = index + 1; button.style.setProperty('--dot', colour(letter.id));
      button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.title = 'Parent ' + (index + 1) + (index < 10 ? ' (Shift+' + ((index + 1) % 10) + ')' : '') + '. Drag to reorder.';
      button.addEventListener('click', function () { if (!el.letterTabs.suppressClick) selectParent(letter.id); });
      el.letterTabs.appendChild(button);
    });
    renderChildLetters();
    var only = state.rule.letters.length < 2, number = label(state.currentLetter);
    el.parentColour.style.setProperty('--dot', colour(state.currentLetter));
    el.parentColour.title = 'Colour of parent ' + number; el.parentColour.setAttribute('aria-label', 'Choose the colour of parent ' + number);
    if (!el.colourPicker.hidden) renderColourPicker();
    el.removeLetter.disabled = only;
    el.removeLetter.title = only ? 'A rule needs at least one parent' : 'Remove parent ' + number + ' and the children that use it (Backspace)';
    el.duplicateLetter.title = 'Duplicate parent ' + number + ' (' + modKey() + 'D)';
  }

  function selectParent(id) {
    if (!letterById(id)) return;
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent'; state.editorCamera = null;
    updateAnalysis(); syncControls(); renderReadouts(); renderEditor(); renderIterations(); renderMain(); saveAddress();
  }

  // The child row: one button per parent number. With a child selected, a
  // button changes which parent that child copies. With none selected, it
  // sets the number that new children take. Keys 1 to 9 and 0 press them.
  function brushLetter() { return letterById(state.newLetter) ? state.newLetter : state.currentLetter; }
  function renderChildLetters() {
    var child = selectedChild(), active = child ? child.letter : brushLetter();
    el.childLetters.innerHTML = '';
    state.rule.letters.forEach(function (letter, index) {
      var button = document.createElement('button'); button.type = 'button';
      button.className = 'letter-tab' + (letter.id === active ? ' active' : '');
      button.textContent = index + 1; button.style.setProperty('--dot', colour(letter.id));
      button.setAttribute('aria-pressed', letter.id === active ? 'true' : 'false');
      button.title = (child ? 'Make the selected child a copy of parent ' : 'New children copy parent ') + (index + 1) + (index < 10 ? ' (key ' + ((index + 1) % 10) + ')' : '');
      button.addEventListener('click', function () { pickChildLetter(letter.id); });
      el.childLetters.appendChild(button);
    });
  }
  function pickChildLetter(id) {
    if (!letterById(id)) return;
    state.newLetter = id;
    var child = selectedChild();
    if (child && child.letter !== id) { child.letter = id; markEdited(); commit(); return; }
    renderChildLetters(); renderBrushPreview();
  }

  // The preview beside the panel heading shows what Rotate and Flip act on:
  // the selected child, or the orientation that new children take.
  function renderBrushPreview() {
    var info = prepareCanvas(el.brushPreview), ctx = info.ctx, child = selectedChild();
    var matrix = child ? child.matrix : state.brush, letter = child ? child.letter : brushLetter();
    var points = M.transformedFrame(state.rule.frame, matrix), view = makeView(info.width, info.height, M.bounds(points), 4, null);
    drawInstance(ctx, { letter: letter, matrix: matrix }, view, { letterThreshold: 0, lineWidth: 1.2, alpha: 1, childName: child ? childName(currentLetter().children.indexOf(child)) : null });
  }

  // Sortable lists: press an item (or its grip), drag past 6 pixels, then
  // drop it between two others. onMove gets the old and the new index.
  function makeSortable(container, itemSelector, gripSelector, axis, onMove) {
    var drag = null;
    function items() { return Array.prototype.slice.call(container.querySelectorAll(itemSelector)); }
    function clear() { items().forEach(function (item) { item.classList.remove('sorting', 'insert-before', 'insert-after'); }); }
    container.addEventListener('pointerdown', function (event) {
      var item = event.target.closest(itemSelector);
      if (!item || event.button || (gripSelector && !event.target.closest(gripSelector))) return;
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, from: items().indexOf(item), to: null, active: false, item: item };
      if (gripSelector) event.preventDefault();
    });
    container.addEventListener('pointermove', function (event) {
      if (!drag || drag.pointer !== event.pointerId) return;
      var along = axis === 'x' ? event.clientX : event.clientY;
      if (!drag.active) {
        if (Math.abs(along - (axis === 'x' ? drag.x : drag.y)) < 6) return;
        drag.active = true; drag.item.classList.add('sorting');
        try { container.setPointerCapture(event.pointerId); } catch (error) {}
      }
      var others = items().filter(function (item) { return item !== drag.item; });
      drag.to = others.filter(function (item) { var r = item.getBoundingClientRect(); return (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2) < along; }).length;
      others.forEach(function (item) { item.classList.remove('insert-before', 'insert-after'); });
      if (drag.to < others.length) others[drag.to].classList.add('insert-before'); else if (others.length) others[others.length - 1].classList.add('insert-after');
      event.preventDefault();
    });
    function finish(event) {
      if (!drag || drag.pointer !== event.pointerId) return;
      var done = drag; drag = null; clear();
      if (!done.active) return;
      container.suppressClick = true; setTimeout(function () { container.suppressClick = false; }, 0);
      if (event.type === 'pointerup' && done.to != null && done.to !== done.from) onMove(done.from, done.to);
    }
    container.addEventListener('pointerup', finish); container.addEventListener('pointercancel', finish);
  }

  // Panel dividers: drag to resize the rule panel or the readout panel. The
  // widths are a per-viewer preference, kept in local storage when allowed.
  function wireDividers() {
    var workspace = document.querySelector('.workspace'), panel = document.querySelector('.editor-panel');
    try {
      var saved = JSON.parse(localStorage.getItem('fractal-panels') || 'null');
      if (saved && saved.left) workspace.style.setProperty('--left-w', saved.left + 'px');
      if (saved && saved.right) workspace.style.setProperty('--right-w', saved.right + 'px');
      if (saved && saved.editor) panel.style.setProperty('--editor-h', saved.editor + 'px');
    } catch (error) {}
    function width(name) { return parseFloat(getComputedStyle(workspace).getPropertyValue(name)) || 0; }
    function save() {
      try {
        localStorage.setItem('fractal-panels', JSON.stringify({ left: width('--left-w'), right: width('--right-w'),
          editor: parseFloat(panel.style.getPropertyValue('--editor-h')) || undefined }));
      } catch (error) {}
    }
    // The line under the editor sets the editor's height.
    var line = el.dividerEditor, start = null;
    function setHeight(px) {
      px = Math.max(140, Math.min(px, 760, window.innerHeight - 160));
      panel.style.setProperty('--editor-h', Math.round(px) + 'px');
    }
    line.addEventListener('pointerdown', function (event) {
      start = { y: event.clientY, h: el.editorWrap.getBoundingClientRect().height };
      line.setPointerCapture(event.pointerId); line.classList.add('dragging'); event.preventDefault();
    });
    line.addEventListener('pointermove', function (event) { if (start) setHeight(start.h + event.clientY - start.y); });
    function endLine() { if (start) { start = null; line.classList.remove('dragging'); save(); } }
    line.addEventListener('pointerup', endLine); line.addEventListener('pointercancel', endLine);
    line.addEventListener('dblclick', function () { panel.style.removeProperty('--editor-h'); save(); });
    line.addEventListener('keydown', function (event) {
      var step = event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0;
      if (!step) return;
      event.preventDefault(); setHeight(el.editorWrap.getBoundingClientRect().height + step); save();
    });
    [['left', el.dividerLeft], ['right', el.dividerRight]].forEach(function (pair) {
      var side = pair[0], handle = pair[1];
      function set(px) {
        var rect = workspace.getBoundingClientRect(), other = width(side === 'left' ? '--right-w' : '--left-w');
        px = Math.max(180, Math.min(px, 560, rect.width - other - 320));
        workspace.style.setProperty(side === 'left' ? '--left-w' : '--right-w', Math.round(px) + 'px');
      }
      handle.addEventListener('pointerdown', function (event) {
        handle.setPointerCapture(event.pointerId); handle.classList.add('dragging'); event.preventDefault();
      });
      handle.addEventListener('pointermove', function (event) {
        if (!handle.classList.contains('dragging')) return;
        var rect = workspace.getBoundingClientRect();
        set(side === 'left' ? event.clientX - rect.left : rect.right - event.clientX);
      });
      function end() { if (handle.classList.contains('dragging')) { handle.classList.remove('dragging'); save(); } }
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
      handle.addEventListener('dblclick', function () {
        workspace.style.removeProperty(side === 'left' ? '--left-w' : '--right-w'); save();
      });
      handle.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
        if (!step) return;
        event.preventDefault(); set(width(side === 'left' ? '--left-w' : '--right-w') + (side === 'left' ? step : -step)); save();
      });
    });
  }

  // The iterations panel: the arrow hides or shows it, and the line under
  // it sets its height, from 110 pixels to half the views' height. The
  // five views shrink to fit, so the panel never scrolls. Both are a
  // per-viewer preference, kept in local storage when allowed.
  var STRIP_KEY = 'fractal-strip', STRIP_MIN = 110;
  function wireIterationPanel() {
    var visuals = document.querySelector('.visuals'), saved = null, height = null;
    try { saved = JSON.parse(localStorage.getItem(STRIP_KEY) || 'null'); } catch (error) {}
    function save() { try { localStorage.setItem(STRIP_KEY, JSON.stringify({ hidden: !!state.stripHidden, height: height || undefined })); } catch (error) {} }
    function maxHeight() { return Math.max(STRIP_MIN, visuals.getBoundingClientRect().height / 2); }
    function apply() {
      if (height) visuals.style.setProperty('--strip-h', Math.round(Math.max(STRIP_MIN, Math.min(height, maxHeight()))) + 'px');
      else visuals.style.removeProperty('--strip-h');
    }
    function setHidden(hidden) {
      state.stripHidden = hidden; visuals.classList.toggle('strip-hidden', hidden);
      el.toggleStrip.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      var tip = hidden ? 'Show the iterations' : 'Hide the iterations';
      el.toggleStrip.title = tip; el.toggleStrip.setAttribute('aria-label', tip);
      if (!hidden) requestAnimationFrame(renderIterations);
    }
    if (saved && saved.height) height = saved.height;
    apply(); setHidden(!!(saved && saved.hidden));
    el.toggleStrip.addEventListener('click', function () { setHidden(!state.stripHidden); save(); });
    var line = el.dividerStrip, start = null;
    line.addEventListener('pointerdown', function (event) {
      start = { y: event.clientY, h: el.iterationPanel.getBoundingClientRect().height };
      line.setPointerCapture(event.pointerId); line.classList.add('dragging'); event.preventDefault();
    });
    line.addEventListener('pointermove', function (event) { if (start) { height = start.h + event.clientY - start.y; apply(); } });
    function end() { if (start) { start = null; line.classList.remove('dragging'); height = Math.max(STRIP_MIN, Math.min(height, maxHeight())); save(); } }
    line.addEventListener('pointerup', end); line.addEventListener('pointercancel', end);
    line.addEventListener('dblclick', function () { height = null; apply(); save(); });
    line.addEventListener('keydown', function (event) {
      var step = event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0;
      if (!step) return;
      event.preventDefault(); height = Math.max(STRIP_MIN, Math.min(el.iterationPanel.getBoundingClientRect().height + step, maxHeight())); apply(); save();
    });
    window.addEventListener('resize', apply);
  }

  // x and y are the child's centre, where the map sends the origin. A
  // child is mirrored left to right if Flip is 1, then scaled, then turned
  // anticlockwise by Angle, from −180 to 180. A mirror sends the x axis to
  // its negative, so a flipped child's angle is read from −(m₁₁, m₂₁).
  function childValues(child) {
    var m = child.matrix;
    if (affineTable()) return m.slice();
    var flip = M.determinant(m) < 0, sv = M.singularValues(m);
    var angle = flip ? Math.atan2(-m[1], -m[0]) : Math.atan2(m[1], m[0]);
    angle = angle * 180 / Math.PI; if (angle <= -180 + 1e-9) angle += 360;
    return [m[4], m[5], (sv[0] + sv[1]) / 2, angle, flip ? 1 : 0];
  }

  // The edit pop-up shows x, y, scale, angle and flip while every child of
  // this parent is a similarity. Once one is stretched or skewed, it shows
  // the six affine values instead.
  function affineTable() {
    return currentLetter().children.some(function (child) { return !M.isSimilarity(child.matrix, 1e-6); });
  }
  function tableHeaders() {
    if (affineTable()) return ['Parent', 'm₁₁', 'm₂₁', 'm₁₂', 'm₂₂', 'x', 'y'];
    return ['Parent', 'x', 'y', 'Scale', 'Angle', 'Flip'];
  }

  // The children list, in drawing order: the first child is drawn first, so
  // it sits at the back, and the last sits in front. Drag a row's grip to
  // reorder. Each row names the child and the parent it copies. The
  // padlock keeps the child out of Randomise. The pencil opens a pop-up
  // that shows and sets the child's exact values.
  var LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var UNLOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/></svg>';
  function renderNumbers() {
    el.numbersHead.innerHTML = '<th aria-label="Reorder"></th><th class="whole">Child</th><th class="whole">Parent</th><th class="whole">Lock</th><th class="edit-head" aria-label="Edit"></th>';
    el.numbersBody.innerHTML = '';
    el.numbersKind.textContent = 'back to front';
    currentLetter().children.forEach(function (child, index) {
      var row = document.createElement('tr'); if (child.id === state.selectedId) row.className = 'selected';
      var grip = document.createElement('td'); grip.className = 'grip'; grip.textContent = '⠿'; grip.title = 'Drag to reorder'; row.appendChild(grip);
      var own = document.createElement('td'); own.className = 'child-name'; own.textContent = childName(index); row.appendChild(own);
      var first = document.createElement('td'); first.className = 'child-number'; first.textContent = label(child.letter); first.style.setProperty('--dot', colour(child.letter)); row.appendChild(first);
      var lockCell = document.createElement('td'), lock = document.createElement('button');
      lockCell.className = 'whole'; lock.type = 'button'; lock.className = 'lock-child' + (child.locked ? ' locked' : '');
      lock.setAttribute('aria-pressed', child.locked ? 'true' : 'false');
      lock.setAttribute('aria-label', (child.locked ? 'Unlock child ' : 'Lock child ') + childName(index));
      lock.title = child.locked ? 'Locked: Randomise leaves this child as it is. Click to unlock' : 'Unlocked: Randomise can change this child. Click to lock';
      lock.innerHTML = child.locked ? LOCK_ICON : UNLOCK_ICON;
      lock.addEventListener('click', function (event) { event.stopPropagation(); toggleLock(child); });
      lockCell.appendChild(lock); row.appendChild(lockCell);
      var editCell = document.createElement('td'), edit = document.createElement('button');
      editCell.className = 'edit-cell';
        edit.type = 'button'; edit.className = 'edit-child'; edit.setAttribute('aria-label', 'Edit child ' + childName(index)); edit.title = 'Show and edit the exact values';
        edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
        edit.addEventListener('click', function (event) { event.stopPropagation(); openEditDialog(child); });
      editCell.appendChild(edit); row.appendChild(editCell);
      row.addEventListener('click', function () {
        if (el.numbersBody.suppressClick) return;
        state.selectedId = child.id; state.focus = 'child'; syncControls(); renderEditor();
      });
      el.numbersBody.appendChild(row);
    });
  }

  function parseNumber(text) {
    var source = String(text).trim().replace(/−/g, '-').replace(/√\s*([0-9.]+)/g, 'sqrt($1)');
    var slash = source.indexOf('/');
    if (slash > 0) { var top = parseNumber(source.slice(0, slash)), bottom = parseNumber(source.slice(slash + 1)); return bottom ? top / bottom : NaN; }
    var root = source.match(/^sqrt\(([0-9.]+)\)$/i); if (root) return Math.sqrt(Number(root[1]));
    return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(source) ? Number(source) : NaN;
  }

  // The edit pop-up changes nothing until OK, and OK is one undo step.
  function openEditDialog(child) {
    state.editing = child.id; state.selectedId = child.id; state.focus = 'child'; syncControls(); renderEditor();
    var headers = tableHeaders().slice(1), values = childValues(child), stretch = affineTable();
    el.editTitle.textContent = 'Child ' + childName(currentLetter().children.indexOf(child)) + ' (copy of parent ' + label(child.letter) + ')';
    el.editFields.innerHTML = '';
    headers.forEach(function (name, index) {
      var field = document.createElement('label'), input = document.createElement('input');
      field.textContent = name;
      if (!stretch && name === 'Flip') { input.type = 'checkbox'; input.checked = !!values[index]; field.className = 'check'; }
      else { input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.value = formatNumber(values[index], 6).replace(/\.?0+$/, '') || '0'; }
      input.dataset.index = index; field.appendChild(input); el.editFields.appendChild(field);
    });
    if (el.editDialog.showModal) el.editDialog.showModal(); else el.editDialog.setAttribute('open', '');
    var firstInput = el.editFields.querySelector('input[type="text"]'); if (firstInput) { firstInput.focus(); firstInput.select(); }
  }
  function applyEditDialog() {
    var child = currentLetter().children.find(function (item) { return item.id === state.editing; });
    if (!child) return true;
    var values = [], bad = false;
    el.editFields.querySelectorAll('input').forEach(function (input) {
      var value = input.type === 'checkbox' ? (input.checked ? 1 : 0) : parseNumber(input.value);
      if (!isFinite(value)) { bad = true; input.setAttribute('aria-invalid', 'true'); } else input.removeAttribute('aria-invalid');
      values[Number(input.dataset.index)] = value;
    });
    if (bad) return false;
    if (affineTable()) child.matrix = tidy(values.slice(0, 6));
    else {
      // Flip mirrors left to right first, then the child scales and turns.
      var x = values[0], y = values[1], scale = Math.max(.001, Math.abs(values[2])), angle = values[3] * Math.PI / 180, flip = !!values[4];
      var c = scale * Math.cos(angle), n = scale * Math.sin(angle);
      child.matrix = tidy(flip ? [-c, -n, -n, c, x, y] : [c, n, -n, c, x, y]);
    }
    markEdited(); commit(); return true;
  }

  function syncSelection() {
    var child = selectedChild(), children = currentLetter().children;
    el.selectionHeading.textContent = child ? 'Selected child' : 'New child';
    el.selectionName.textContent = child ? childName(children.indexOf(child)) : '';
    // Remove stays live while the parent has children, so Shift-click can
    // clear them all with none selected.
    el.removeChild.disabled = !children.length; el.duplicateChild.disabled = !child;
    el.removeChild.title = (child ? 'Click: remove child ' + childName(children.indexOf(child)) + ' (Backspace).' : 'Click: remove the selected child (Backspace). Select a child first.') +
      ' Shift-click: remove every child of this parent (Shift+Backspace).';
    renderChildLetters(); renderBrushPreview();
  }

  function syncControls() {
    el.ruleName.textContent = state.demo ? DEMO_NAMES[state.demo] : state.savedName || 'Custom rule';
    el.demo.value = state.demo || '';
    el.depth.value = state.depth; el.depthValue.textContent = state.depth;
    var grid = snapGridSize(), triangle = state.rule.frame === 'triangle';
    el.frameShape.querySelectorAll('[data-frame]').forEach(function (button) { var on = button.dataset.frame === state.rule.frame; button.classList.toggle('active', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.colsField.hidden = triangle; el.rowsField.hidden = triangle; el.sideField.hidden = !triangle;
    [[el.gridRows, grid.rows], [el.gridCols, grid.cols], [el.gridSide, grid.side]].forEach(function (pair) {
      pair[0].querySelectorAll('button').forEach(function (button) {
        var n = Number(button.textContent);
        button.classList.toggle('active', n === pair[1]); button.setAttribute('aria-pressed', n === pair[1] ? 'true' : 'false');
      });
    });
    el.toggleSnap.checked = !!state.snapGrid;
    var all = triangle ? 6 : 8, turns = triangle ? 3 : 4;
    var how = ' Each child copies a random parent and takes a random orientation inside its outline. Click: any of the ' + all + ' orientations. Shift-click: turns only, ' + turns + ' orientations, so a flipped child stays flipped. Locked children stay as they are.';
    el.randomiseAll.title = 'Randomise every unlocked child of every parent.' + how;
    el.randomiseParent.title = 'Randomise every unlocked child of this parent.' + how;
    el.randomiseAll.disabled = !unlocked(allChildren()).length; el.randomiseParent.disabled = !unlocked(currentLetter().children).length;
    el.colourMode.querySelectorAll('[data-colour]').forEach(function (button) { var on = button.dataset.colour === colourMode(); button.classList.toggle('active', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    [[el.shapeMode, 'shape', state.shape], [el.numbersMode, 'numbers', state.numbers ? 'show' : 'hide'], [el.styleMode, 'style', state.style]].forEach(function (group) {
      group[0].querySelectorAll('[data-' + group[1] + ']').forEach(function (button) { var on = button.dataset[group[1]] === group[2]; button.classList.toggle('active', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    });
    el.toggleHull.setAttribute('aria-pressed', state.showHull ? 'true' : 'false');
    syncLimitControls(); renderLetterControls(); syncSelection(); renderNumbers(); renderPalette();
  }

  function commit() {
    updateAnalysis(); syncControls(); renderReadouts(); renderEditor(); renderIterations(); renderMain(); saveAddress();
    record();
  }

  // Undo and redo: every committed change to the rule is one step. Level,
  // limits and the camera are view settings, so they are not steps.
  var undoStack = [], historyIndex = -1, restoring = false;
  function snapshot() {
    return { rule: M.clone(state.rule), current: state.currentLetter, demo: state.demo, selected: state.selectedId };
  }
  function ruleKey(snap) { return JSON.stringify(snap.rule); }
  function record() {
    if (restoring) return;
    var snap = snapshot();
    if (historyIndex >= 0 && ruleKey(undoStack[historyIndex]) === ruleKey(snap)) { undoStack[historyIndex] = snap; syncHistoryButtons(); return; }
    undoStack = undoStack.slice(0, historyIndex + 1); undoStack.push(snap);
    if (undoStack.length > 200) undoStack.shift();
    historyIndex = undoStack.length - 1; syncHistoryButtons();
  }
  function restore(index) {
    if (index < 0 || index >= undoStack.length) return;
    historyIndex = index; var snap = undoStack[index], keep = state.selectedId;
    state.rule = M.clone(snap.rule); state.currentLetter = snap.current;
    state.demo = snap.demo; state.selectedId = snap.selected;
    if (!letterById(state.currentLetter)) state.currentLetter = state.rule.letters[0].id;
    // Keep the copy the user has selected now, if it still exists.
    if (keep && currentLetter().children.some(function (child) { return child.id === keep; })) state.selectedId = keep;
    restoring = true; commit(); restoring = false; syncHistoryButtons();
  }
  function undo() { restore(historyIndex - 1); }
  function redo() { restore(historyIndex + 1); }
  function syncHistoryButtons() {
    if (!el.undo) return;
    el.undo.disabled = historyIndex <= 0; el.redo.disabled = historyIndex >= undoStack.length - 1;
  }

  // Rotate, Rotate R and the two flips act inside the child's own frame.
  // Each is one of the frame's own symmetries (a quarter turn or a mirror of
  // the unit square; a third of a turn or a mirror of the triangle), so the
  // child's outline stays exactly where it was: a square stays that square,
  // a 7 by 4 rectangle the same rectangle, a skewed child the same shape.
  // Only the number and its underline turn or reverse inside it. On screen
  // that is a true rotation only for a square or triangle child. Rotate R
  // turns the number clockwise as it looks on screen, so on a flipped child
  // it turns the other way in the child's own frame.
  //
  // A triangle's Flip V is the one move that leaves the outline: a
  // top-to-bottom mirror has no place inside an upright triangle. So it
  // mirrors the child across its own bottom edge, onto the other side of
  // that edge, upside down. That edge is a grid line, so the child stays on
  // the snap grid, and a second Flip V brings it back. For a new child (the
  // brush) it mirrors about the centre instead, so + still adds the child
  // where it would have gone.
  //
  // Every move here is a symmetry of the frame about its centre, the
  // origin, so it acts on the map's linear part from the right.
  function tidy(m) { return m.map(function (v) { var r = Math.round(v * 1e9) / 1e9; return Math.abs(v - r) < 1e-12 ? r + 0 : v; }); }
  var LOCAL_FLIP = { flipH: [-1, 0, 0, 1, 0, 0], flipV: [1, 0, 0, -1, 0, 0] };
  function orientMatrix(matrix, action, brush) {
    if (LOCAL_FLIP[action]) {
      var flip = LOCAL_FLIP[action];
      if (state.rule.frame === 'triangle' && action === 'flipV' && !brush) flip = [1, 0, 0, -1, 0, -2 * M.TRI_H / 3];
      return tidy(M.compose(matrix, flip));
    }
    var q = state.rule.frame === 'triangle' ? Math.PI * 2 / 3 : Math.PI / 2, c = Math.cos(q), s = Math.sin(q);
    var clockwise = (action === 'rotateRight') !== (M.determinant(matrix) < 0);
    return tidy(M.compose(matrix, clockwise ? [c, -s, s, c, 0, 0] : [c, s, -s, c, 0, 0]));
  }

  // Randomise reorients a child inside its own outline, as the orientation
  // buttons do, so a stretched or skewed child keeps its place and shape.
  // Turns and Flip H reach every orientation: 8 on a square, 6 on a
  // triangle. Without flips, only the 4 or 3 turns.
  function randomOrientation(matrix, flips) {
    var turns = state.rule.frame === 'triangle' ? 3 : 4;
    if (flips && Math.random() < .5) matrix = orientMatrix(matrix, 'flipH');
    for (var i = Math.floor(Math.random() * turns); i > 0; i--) matrix = orientMatrix(matrix, 'rotateRight');
    return matrix;
  }
  // Each child also copies a parent picked at random from all the parents,
  // so a linked system can lose links: that is part of the roll. A roll
  // that leaves every child as it was rolls again, so each click changes
  // something.
  // A locked child is left out: its orientation and its parent stay put.
  function unlocked(children) { return children.filter(function (child) { return !child.locked; }); }
  function randomise(letters, flips) {
    var children = unlocked(letters.reduce(function (out, letter) { return out.concat(letter.children); }, []));
    if (!children.length) return;
    var ids = state.rule.letters.map(function (letter) { return letter.id; });
    var key = function (matrix, id) { return id + ':' + matrix.join(); };
    var before = children.map(function (child) { return key(child.matrix, child.letter); });
    for (var tries = 0; tries < 50; tries++) {
      var after = children.map(function (child) { return { matrix: randomOrientation(child.matrix, flips), letter: ids[Math.floor(Math.random() * ids.length)] }; });
      if (after.some(function (next, i) { return key(next.matrix, next.letter) !== before[i]; })) {
        children.forEach(function (child, i) { child.matrix = after[i].matrix; child.letter = after[i].letter; });
        markEdited(); commit(); return;
      }
    }
  }

  // The lock is part of the rule, so it saves with the fractal and each
  // change is one undo step.
  function toggleLock(child) {
    if (child.locked) delete child.locked; else child.locked = true;
    markEdited(); commit();
  }

  function orient(action) {
    var child = selectedChild();
    if (!child) { state.brush = orientMatrix(state.brush, action, true); renderBrushPreview(); return; }
    child.matrix = orientMatrix(child.matrix, action);
    markEdited(); commit();
  }

  // One grid cell's scale, across and down: 1/Cols by 1/Rows on a square
  // (a rectangle when they differ), 1/Per side both ways on a triangle.
  function gridCellSize() {
    var grid = snapGridSize();
    return state.rule.frame === 'triangle' ? [1 / grid.side, 1 / grid.side] : [1 / grid.cols, 1 / grid.rows];
  }
  // The grid's cells, in the order + fills them. Inside the frame: the
  // bottom row first, left to right, then the next row up. A triangle with
  // k pieces per side has k² cells: upright ones, and between them
  // upside-down ones. The cells that point the same way as the preview
  // come first, then the others, where the child takes a half turn. After
  // the frame is full come the cells outside it, nearest the frame first,
  // then anticlockwise from the bottom left. Cells reach out one frame
  // width. Each cell is { centre, turn }: the child's centre goes on the
  // cell's centre, so the preview's orientation carries over.
  var OUTSIDE_REACH = 1;
  function polygonDistance(point, poly) {
    if (pointInPolygon(point, poly)) return 0;
    var best = Infinity;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length], e = [b[0] - a[0], b[1] - a[1]];
      var t = Math.max(0, Math.min(1, dot([point[0] - a[0], point[1] - a[1]], e) / dot(e, e)));
      best = Math.min(best, distance(point, [a[0] + t * e[0], a[1] + t * e[1]]));
    }
    return best;
  }
  function gridCells() {
    var grid = snapGridSize(), frame = M.framePolygon(state.rule.frame), inside = [], outside = [], row, col;
    function add(centre, turn) {
      var gap = polygonDistance(centre, frame);
      if (gap === 0) inside.push({ centre: centre, turn: turn });
      else if (gap <= OUTSIDE_REACH) outside.push({ centre: centre, turn: turn, gap: gap });
    }
    if (state.rule.frame !== 'triangle') {
      var reachCols = Math.ceil(OUTSIDE_REACH * grid.cols), reachRows = Math.ceil(OUTSIDE_REACH * grid.rows);
      for (row = -reachRows; row < grid.rows + reachRows; row++) {
        for (col = -reachCols; col < grid.cols + reachCols; col++) add([(col + .5) / grid.cols - .5, (row + .5) / grid.rows - .5], false);
      }
    } else {
      // An upright cell hangs from each lattice point (see snapLattice), and
      // an upside-down one sits below it, between two upright ones. The
      // preview's apex points down when it lies below the centre.
      var k = grid.side, h = M.TRI_H, down = M.apply(state.brush, frame[0])[1] < -1e-9, reach = Math.ceil(OUTSIDE_REACH * k) + 2;
      for (var i = -reach; i < k + reach; i++) {
        for (var j = -reach; j < k + reach; j++) {
          var p = latticePoint(i, j, k);
          add([p[0], p[1] - 2 * h / (3 * k)], down);
          add([p[0], p[1] - 4 * h / (3 * k)], !down);
        }
      }
    }
    function round(v) { return Math.round(v * 1e9); }
    // The angle anticlockwise from the bottom-left direction, −135 degrees.
    function turnFrom(c) { return (Math.atan2(c[1], c[0]) + Math.PI * 11 / 4) % (Math.PI * 2); }
    inside.sort(function (a, b) { return (a.turn - b.turn) || (round(a.centre[1]) - round(b.centre[1])) || (round(a.centre[0]) - round(b.centre[0])); });
    outside.sort(function (a, b) { return (round(a.gap) - round(b.gap)) || (turnFrom(a.centre) - turnFrom(b.centre)); });
    return inside.concat(outside);
  }

  function newChildId() { return Math.random().toString(36).slice(2, 9); }

  // Overlap between a candidate frame and the current parent's other children.
  function overlapWith(matrix, skip) {
    var poly = M.transformedFrame(state.rule.frame, matrix);
    return currentLetter().children.reduce(function (sum, child) {
      return child === skip ? sum : sum + M.intersectionArea(poly, M.transformedFrame(state.rule.frame, child.matrix));
    }, 0);
  }
  function firstFree(candidates, skip) {
    var best = candidates[0], bestOverlap = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var o = overlapWith(candidates[i], skip);
      if (o < 1e-6) return candidates[i];
      if (o < bestOverlap) { best = candidates[i]; bestOverlap = o; }
    }
    return best;
  }

  // + adds a child with the number and orientation shown in the preview.
  // It fills one grid cell, with Snap corners on or off: the first free
  // cell in the order gridCells gives. A cell that points the other way
  // gives the child a half turn. A duplicate keeps its original's size.
  var HALF_TURN = [-1, 0, 0, -1, 0, 0];
  function addFreeChild() {
    var size = gridCellSize();
    var candidates = gridCells().map(function (cell) {
      var p = cell.centre, orient = cell.turn ? M.compose(HALF_TURN, state.brush) : state.brush;
      return tidy(M.compose([size[0], 0, 0, size[1], p[0], p[1]], orient));
    });
    var child = M.child(brushLetter(), firstFree(candidates));
    currentLetter().children.push(child); state.selectedId = child.id; state.focus = 'child'; markEdited(); commit();
  }

  // A duplicate goes beside its original: to the right, or else above, to
  // the left or below, whichever is free first.
  function duplicateChild() {
    var source = selectedChild(); if (!source) return;
    var letter = currentLetter(), copy = M.clone(source); copy.id = newChildId();
    var b = M.bounds(M.transformedFrame(state.rule.frame, source.matrix)), w = b.maxX - b.minX, h = b.maxY - b.minY;
    copy.matrix = firstFree([[w, 0], [0, h], [-w, 0], [0, -h]].map(function (d) { var m = source.matrix.slice(); m[4] += d[0]; m[5] += d[1]; return m; }), source);
    letter.children.splice(letter.children.indexOf(source) + 1, 0, copy);
    state.selectedId = copy.id; state.focus = 'child'; markEdited(); commit();
  }
  function addLetter() {
    var id = M.nextId(state.rule); state.rule.letters.push({ id: id, children: [] });
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
  }

  // A duplicate parent goes straight after its original. Its children that
  // copied the original now copy the duplicate, so it stands alone.
  // The colour picker for the selected parent. A swatch or Default is one
  // undo step. The custom picker previews as it moves and commits when it
  // closes.
  function renderColourPicker() {
    var index = state.rule.letters.indexOf(currentLetter()), now = colour(state.currentLetter);
    el.colourSwatches.innerHTML = '';
    PALETTE.forEach(function (hex) {
      var button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--dot', hex);
      button.setAttribute('aria-label', hex); button.title = hex; button.setAttribute('aria-pressed', hex === now ? 'true' : 'false');
      button.addEventListener('click', function () { setParentColour(hex, true); });
      el.colourSwatches.appendChild(button);
    });
    el.colourCustom.value = now;
    el.colourDefault.disabled = !currentLetter().colour;
    el.colourDefault.title = 'Back to ' + defaultColour(index);
  }
  function setParentColour(hex, record) {
    var letter = currentLetter(), index = state.rule.letters.indexOf(letter);
    hex = String(hex).toLowerCase();
    if (!hex || hex === defaultColour(index)) delete letter.colour; else letter.colour = hex;
    markEdited();
    if (record) commit(); else { renderLetterControls(); renderPalette(); renderEditor(); renderIterations(); renderMain(); }
  }
  function toggleColourPicker(open) {
    if (open == null) open = el.colourPicker.hidden;
    el.colourPicker.hidden = !open; el.parentColour.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { renderColourPicker(); var first = el.colourSwatches.querySelector('[aria-pressed="true"]') || el.colourSwatches.firstChild; if (first) first.focus(); }
  }

  function duplicateLetter() {
    var source = currentLetter(), id = M.nextId(state.rule), index = state.rule.letters.indexOf(source);
    var copy = { id: id, children: source.children.map(function (child) {
      var next = M.clone(child); next.id = newChildId(); if (child.letter === source.id) next.letter = id; return next;
    }) };
    keepColours(function () { state.rule.letters.splice(index + 1, 0, copy); });
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
    notice('Parent ' + (index + 2) + ' is a copy of parent ' + (index + 1) + '.');
  }

  // Reordering renumbers the parents. Children point at parents by id, so
  // every child follows its parent to the new number.
  function moveLetter(from, to) {
    keepColours(function () { var moved = state.rule.letters.splice(from, 1)[0]; state.rule.letters.splice(to, 0, moved); });
    markEdited(); commit();
  }
  function moveChild(from, to) {
    var children = currentLetter().children, moved = children.splice(from, 1)[0]; children.splice(to, 0, moved);
    markEdited(); commit();
  }

  // Backspace and Cmd+D act on the last thing clicked: a child, or the parent.
  function removeFocused() {
    if (state.focus === 'child' && selectedChild()) removeSelected();
    else if (state.focus === 'parent') { if (state.rule.letters.length > 1) removeLetter(); else notice('A rule needs at least one parent.'); }
  }
  function duplicateFocused() {
    if (state.focus === 'child' && selectedChild()) duplicateChild();
    else if (state.focus === 'parent') duplicateLetter();
  }

  // Saved fractals. The library lives in this browser's local storage. A
  // .fractal.json file holds one or more fractals in the same shape:
  // { format: 'fractal-explorer', version: 3, fractals: [entry, ...] }, where
  // an entry is { name, savedAt, rule, current, level, colourMode, snap,
  // hull, shape, numbers, style, limits }. The last six are the view settings
  // (see viewSettings). An entry saved before they existed opens with the
  // defaults.
  var LIBRARY_KEY = 'fractal-library', FILE_FORMAT = 'fractal-explorer', FILE_VERSION = 3;
  function readLibrary() {
    try { var list = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); return Array.isArray(list) ? list.filter(validEntry) : []; }
    catch (error) { return []; }
  }
  function writeLibrary(list) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); return true; }
    catch (error) { notice('This browser is not keeping saved fractals. Use Export to keep a file.'); return false; }
  }
  function validEntry(entry) { return entry && typeof entry.name === 'string' && validRule(entry.rule); }
  function currentEntry(name) {
    return Object.assign({ name: name, savedAt: new Date().toISOString(), rule: M.clone(state.rule), current: state.currentLetter,
      level: state.depth, colourMode: state.colourMode }, viewSettings());
  }
  function defaultName() { return state.savedName || (state.demo ? DEMO_NAMES[state.demo] : 'Fractal ' + (readLibrary().length + 1)); }
  function saveFractal() {
    var name = el.saveName.value.trim() || defaultName(), list = readLibrary();
    var index = list.findIndex(function (entry) { return entry.name === name; });
    if (index >= 0) list[index] = currentEntry(name); else list.push(currentEntry(name));
    if (!writeLibrary(list)) return;
    state.savedName = name; el.saveName.value = name; renderLibrary(); syncControls();
    notice((index >= 0 ? 'Updated “' : 'Saved “') + name + '”.');
  }
  function openEntry(entry) {
    state.rule = M.clone(entry.rule); state.currentLetter = entry.current;
    if (!letterById(state.currentLetter)) state.currentLetter = state.rule.letters[0].id;
    state.selectedId = null; state.newLetter = null; state.focus = 'child';
    state.depth = Math.max(0, Math.min(32, entry.level == null ? state.depth : entry.level));
    state.colourMode = readColourMode(entry.colourMode); readView(entry);
    state.demo = null; state.savedName = entry.name; state.camera = { zoom: 1, x: 0, y: 0 }; state.editorCamera = null;
    el.saveName.value = entry.name; el.demo.value = ''; commit();
  }
  function renderLibrary() {
    var list = readLibrary();
    el.libraryList.innerHTML = '';
    list.forEach(function (entry) {
      var item = document.createElement('li'), open = document.createElement('button'), remove = document.createElement('button');
      open.type = 'button'; open.className = 'open-saved'; open.textContent = entry.name; open.title = 'Open “' + entry.name + '”';
      open.addEventListener('click', function () { openEntry(entry); });
      remove.type = 'button'; remove.className = 'delete-saved'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Delete “' + entry.name + '”'); remove.title = 'Delete';
      remove.addEventListener('click', function () {
        if (!window.confirm('Delete “' + entry.name + '” from this browser?')) return;
        writeLibrary(readLibrary().filter(function (other) { return other.name !== entry.name; })); renderLibrary();
      });
      item.appendChild(open); item.appendChild(remove); el.libraryList.appendChild(item);
    });
    el.libraryEmpty.textContent = list.length ? 'Saved in this browser. Export keeps a file.' : 'Nothing saved yet. Saved fractals stay in this browser.';
    el.exportAll.disabled = !list.length;
  }
  function slug(name) { return (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fractal'); }
  function download(filename, entries) {
    var text = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, fractals: entries }, null, 2);
    var link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }
  function exportFractal() { var name = el.saveName.value.trim() || defaultName(); download(slug(name) + '.fractal.json', [currentEntry(name)]); }
  function exportAll() { var list = readLibrary(); if (list.length) download('fractal-library.fractal.json', list); }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (error) { notice('That file is not valid JSON.'); return; }
      var entries = data && data.format === FILE_FORMAT && data.version === FILE_VERSION && Array.isArray(data.fractals) ? data.fractals.filter(validEntry) : [];
      if (!entries.length) { notice('That file holds no Fractal Explorer fractals.'); return; }
      var list = readLibrary();
      entries.forEach(function (entry) {
        var name = entry.name, n = 2;
        while (list.some(function (other) { return other.name === name; })) name = entry.name + ' (' + n++ + ')';
        list.push(Object.assign({}, entry, { name: name }));
      });
      writeLibrary(list); renderLibrary();
      if (entries.length === 1) openEntry(list[list.length - 1]);
      notice('Imported ' + entries.length + (entries.length === 1 ? ' fractal.' : ' fractals.'));
    };
    reader.readAsText(file);
  }

  // Removing a parent also removes every child, in any parent, that copied it.
  function removeLetter() {
    if (state.rule.letters.length < 2) return;
    var id = state.currentLetter, index = state.rule.letters.findIndex(function (letter) { return letter.id === id; }), lost = 0;
    if (index < 0) return;
    keepColours(function () { state.rule.letters.splice(index, 1); });
    state.rule.letters.forEach(function (letter) {
      var before = letter.children.length;
      letter.children = letter.children.filter(function (child) { return child.letter !== id; });
      lost += before - letter.children.length;
    });
    state.currentLetter = state.rule.letters[Math.max(0, index - 1)].id;
    if (state.newLetter === id) state.newLetter = null;
    state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
    notice('Removed parent ' + (index + 1) + (lost ? ' and ' + lost + (lost === 1 ? ' child that used it' : ' children that used it') : '') + '. Undo brings it back.');
  }

  function removeSelected() {
    var letter = currentLetter(), index = letter.children.findIndex(function (child) { return child.id === state.selectedId; });
    if (index < 0) { if (letter.children.length) notice('Select a child to remove it, or Shift-click to remove them all.'); return; }
    letter.children.splice(index, 1); state.selectedId = null; markEdited(); commit();
  }
  // Shift-click on Remove, or Shift+Backspace, clears every child of this
  // parent as one step. Locked children go too: the lock only guards
  // against Randomise.
  function removeAllChildren() {
    var letter = currentLetter(), n = letter.children.length;
    if (!n) return;
    letter.children = []; state.selectedId = null; state.focus = 'child'; markEdited(); commit();
    notice('Removed ' + n + (n === 1 ? ' child' : ' children') + ' of parent ' + label(letter.id) + '. Undo brings them back.');
  }

  function pointInPolygon(point, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if (((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function editorPoint(event) {
    var rect = el.ruleEditor.getBoundingClientRect();
    return state.editorView.unpoint([event.clientX - rect.left, event.clientY - rect.top]);
  }

  function findChildAt(point) {
    var children = currentLetter().children;
    for (var i = children.length - 1; i >= 0; i--) if (pointInPolygon(point, M.transformedFrame(state.rule.frame, children[i].matrix))) return children[i];
    return null;
  }

  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }

  // Handles. The child's own top-right corner turns it and its
  // bottom-right corner scales it, both about the child's centre (a
  // triangle: its top point turns and its bottom-right point scales). They
  // are the child's own corners, so they move with it as it turns or flips.
  // Shift on the scale corner stretches both ways. Each edge has one handle
  // at its middle. The first few pixels of a drag pick its job: across the
  // edge stretches, along the edge skews, and the job holds for that drag.
  // Each handle catches the pointer a little beyond its drawn size, less on a small child.
  var KNOB = 7.5, KNOB_REACH = 11, EDGE_REACH = 8, JOB_PIXELS = 4;
  function cornerRoles() { return state.rule.frame === 'triangle' ? { rotate: 0, scale: 1 } : { rotate: 1, scale: 2 }; }
  function shortestEdge(corners) {
    var shortest = Infinity;
    for (var i = 0; i < corners.length; i++) shortest = Math.min(shortest, distance(corners[i], corners[(i + 1) % corners.length]));
    return shortest;
  }
  function edgePoints(corners) {
    return corners.map(function (p, i) { var q = corners[(i + 1) % corners.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  }
  function drawSnapGrid(ctx, view, width, height) {
    var corners = [[0, 0], [width, 0], [0, height], [width, height]].map(view.unpoint, view);
    var mid = view.unpoint([width / 2, height / 2]), reach = Math.hypot(width, height) / view.scale;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.globalAlpha = .7;
    snapLattice().families.forEach(function (f) {
      var values = corners.map(function (p) { return dot(f.n, p); }), lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
      // Far out, the grid would be a grey wash, so it thins to every nth line.
      var step = Math.max(1, Math.ceil(4 / (f.spacing * view.scale))), along = [-f.n[1], f.n[0]];
      for (var k = Math.ceil((lo - f.offset) / f.spacing / step) * step; f.offset + k * f.spacing <= hi; k += step) {
        var shift = f.offset + k * f.spacing - dot(f.n, mid), q = [mid[0] + f.n[0] * shift, mid[1] + f.n[1] * shift];
        var a = view.point([q[0] - along[0] * reach, q[1] - along[1] * reach]), b = view.point([q[0] + along[0] * reach, q[1] + along[1] * reach]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  function knob(ctx, p) {
    ctx.beginPath(); ctx.arc(p[0], p[1], KNOB, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.4; ctx.stroke();
  }
  function arrowHead(ctx, tip, dir, size) {
    var n = [-dir[1], dir[0]];
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]);
    ctx.lineTo(tip[0] - dir[0] * size + n[0] * size * .7, tip[1] - dir[1] * size + n[1] * size * .7);
    ctx.lineTo(tip[0] - dir[0] * size - n[0] * size * .7, tip[1] - dir[1] * size - n[1] * size * .7);
    ctx.closePath(); ctx.fill();
  }
  // The turn knob: a circular arrow, three quarters of a turn.
  function drawRotateKnob(ctx, p) {
    knob(ctx, p);
    var r = 3.9, from = -Math.PI * .35, to = Math.PI * 1.15, ink = css('--accent');
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, from, to); ctx.stroke();
    arrowHead(ctx, [p[0] + r * Math.cos(to) - Math.sin(to) * 1.6, p[1] + r * Math.sin(to) + Math.cos(to) * 1.6], [-Math.sin(to), Math.cos(to)], 2.6);
  }
  // The scale knob: a two-headed arrow that points away from the centre.
  function drawScaleKnob(ctx, p, centre) {
    knob(ctx, p);
    var d = [p[0] - centre[0], p[1] - centre[1]], len = Math.hypot(d[0], d[1]) || 1, ink = css('--accent');
    d = [d[0] / len, d[1] / len];
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(p[0] - d[0] * 2.4, p[1] - d[1] * 2.4); ctx.lineTo(p[0] + d[0] * 2.4, p[1] + d[1] * 2.4); ctx.stroke();
    arrowHead(ctx, [p[0] + d[0] * 4.6, p[1] + d[1] * 4.6], d, 2.6);
    arrowHead(ctx, [p[0] - d[0] * 4.6, p[1] - d[1] * 4.6], [-d[0], -d[1]], 2.6);
  }
  // An edge handle: a short bar that lies along its edge.
  function drawEdgeHandle(ctx, p, q) {
    var mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    ctx.save(); ctx.translate(mid[0], mid[1]); ctx.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]));
    ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(5, -3); ctx.arc(5, 0, 3, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-5, 3); ctx.arc(-5, 0, 3, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    ctx.fillStyle = css('--cyan'); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  function drawHandles(ctx, child, view) {
    var corners = M.transformedFrame(state.rule.frame, child.matrix).map(view.point, view), roles = cornerRoles();
    var centre = view.point([child.matrix[4], child.matrix[5]]);
    corners.forEach(function (p, i) { drawEdgeHandle(ctx, p, corners[(i + 1) % corners.length]); });
    drawScaleKnob(ctx, corners[roles.scale], centre);
    drawRotateKnob(ctx, corners[roles.rotate]);
  }

  function handleAt(point, child) {
    var view = state.editorView, pointer = view.point(point), corners = M.transformedFrame(state.rule.frame, child.matrix).map(view.point, view);
    var roles = cornerRoles(), shortest = shortestEdge(corners), best = null, bestDistance = Infinity;
    function consider(type, index, at, reach) {
      var d = distance(pointer, at); if (d < reach && d < bestDistance) { best = { type: type, index: index }; bestDistance = d; }
    }
    var knobReach = Math.max(4, Math.min(KNOB_REACH, shortest / 3));
    consider('rotate', roles.rotate, corners[roles.rotate], knobReach);
    consider('scale', roles.scale, corners[roles.scale], knobReach);
    edgePoints(corners).forEach(function (mid, i) { consider('edge', i, mid, Math.max(3, Math.min(EDGE_REACH, shortest / 4))); });
    return best;
  }

  // A press on the selected child, or on one of its handles, keeps that
  // child, even where another child lies on top. Otherwise a press takes
  // the topmost child under the pointer. A press on empty space pans the
  // editor, and a click there without a drag deselects.
  function startEditorPointer(event) {
    if (state.editorDrag) return;
    var point = editorPoint(event), pointers = state.editorPointers || (state.editorPointers = {});
    if (Object.keys(pointers).length) { startPan(event, false); return; }
    state.focus = 'child';
    var current = selectedChild(), handle = current ? handleAt(point, current) : null, hit;
    if (handle) hit = current;
    else if (current && pointInPolygon(point, M.transformedFrame(state.rule.frame, current.matrix))) hit = current;
    else hit = findChildAt(point);
    if (!hit) { startPan(event, true); return; }
    state.selectedId = hit.id; syncControls(); renderEditor();
    var job = !handle ? 'move' : handle.type !== 'edge' ? handle.type : null;
    state.editorDrag = { pointer: event.pointerId, child: hit, start: point, pixel: [event.clientX, event.clientY], matrix: hit.matrix.slice(),
      handle: handle, job: job, mainBounds: state.lastMainBounds, moved: false };
    state.dragging = true; el.ruleEditor.setPointerCapture(event.pointerId); event.preventDefault();
  }

  function invert(m) {
    var det = M.determinant(m), a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
    return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
  }
  // A linear map about a point, in whichever coordinates the point is in.
  function about(l, p) { return [l[0], l[1], l[2], l[3], p[0] - l[0] * p[0] - l[2] * p[1], p[1] - l[1] * p[0] - l[3] * p[1]]; }
  function clampScale(s) { return Math.abs(s) < .02 ? (s < 0 ? -.02 : .02) : s; }
  var SIMPLE_RATIOS = [1/4, 1/3, 1/2, 2/3, 3/4, 1, 4/3, 3/2, 2, 3, 4];
  function snapRatio(ratio) {
    SIMPLE_RATIOS.forEach(function (candidate) { if (Math.abs(ratio / candidate - 1) < .025) ratio = candidate; });
    return ratio;
  }

  // An edge drag picks stretch or skew from its first few pixels: across
  // the edge stretches, along it skews. dx and dy are in pixels, so the
  // edge is measured in pixels too.
  function edgeJob(drag, dx, dy) {
    var corners = M.transformedFrame(state.rule.frame, drag.matrix).map(state.editorView.point, state.editorView), k = drag.handle.index;
    var p = corners[k], q = corners[(k + 1) % corners.length], e = [q[0] - p[0], q[1] - p[1]], len = Math.hypot(e[0], e[1]) || 1;
    var along = Math.abs(dx * e[0] + dy * e[1]) / len, across = Math.abs(dx * e[1] - dy * e[0]) / len;
    return along > across ? 'skew' : 'stretch';
  }

  // The new map for a drag, from the pointer's place in the editor. With
  // free set, a turn snaps to 15 degrees and a scale to simple ratios.
  function dragMatrix(drag, point, free, shift) {
    var m0 = drag.matrix, h = drag.handle, local = M.framePolygon(state.rule.frame), n = local.length, job = drag.job;
    if (job === 'move') { var t = m0.slice(); t[4] += point[0] - drag.start[0]; t[5] += point[1] - drag.start[1]; return t; }
    // The child's centre: the origin of its own frame, and (m₁₃, m₂₃) here.
    var c = [m0[4], m0[5]];
    if (job === 'rotate') {
      var from = M.apply(m0, local[h.index]);
      var angle = Math.atan2(point[1] - c[1], point[0] - c[0]) - Math.atan2(from[1] - c[1], from[0] - c[0]);
      // Sticky angles: a square holds at 0, 90, 180 and 270 degrees, a
      // triangle at every 60 (upright or upside down), within 4 degrees.
      // Every 15 degrees holds more lightly, within 2.
      var base = Math.atan2(m0[1], m0[0]), target = base + angle;
      var strong = (state.rule.frame === 'triangle' ? 60 : 90) * Math.PI / 180, light = Math.PI / 12;
      var held = Math.round(target / strong) * strong, near15 = Math.round(target / light) * light;
      if (Math.abs(target - held) < 4 * Math.PI / 180) angle = held - base;
      else if (Math.abs(target - near15) < 2 * Math.PI / 180) angle = near15 - base;
      var co = Math.cos(angle), si = Math.sin(angle);
      return M.compose(about([co, si, -si, co], c), m0);
    }
    if (job === 'scale') {
      var q = local[h.index];
      if (shift) {
        // Shift: stretch both ways in the child's own frame, about its centre.
        var u = M.apply(invert(m0), point);
        var sx = Math.abs(q[0]) < 1e-9 ? 1 : clampScale(u[0] / q[0]);
        var sy = Math.abs(q[1]) < 1e-9 ? 1 : clampScale(u[1] / q[1]);
        return M.compose(m0, [sx, 0, 0, sy, 0, 0]);
      }
      var corner = M.apply(m0, q), v = [corner[0] - c[0], corner[1] - c[1]];
      var s = Math.max(.02, dot(v, [point[0] - c[0], point[1] - c[1]]) / dot(v, v));
      if (free) s = snapRatio(s);
      return M.compose(about([s, 0, 0, s], c), m0);
    }
    // Edges. The fixed line is the opposite edge (a triangle: the opposite
    // corner). d runs from it to this edge's middle, and e runs along the edge.
    var k = h.index, uu = M.apply(invert(m0), point);
    var p0 = local[k], p1 = local[(k + 1) % n], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    var fixed = n === 3 ? local[(k + 2) % 3] : [(local[(k + 2) % 4][0] + local[(k + 3) % 4][0]) / 2, (local[(k + 2) % 4][1] + local[(k + 3) % 4][1]) / 2];
    var dvec = [mid[0] - fixed[0], mid[1] - fixed[1]], len = Math.hypot(dvec[0], dvec[1]), dn = [dvec[0] / len, dvec[1] / len];
    var en = [p1[0] - p0[0], p1[1] - p0[1]], elen = Math.hypot(en[0], en[1]); en = [en[0] / elen, en[1] / elen];
    var rel = [uu[0] - fixed[0], uu[1] - fixed[1]], l;
    if (job === 'stretch') {
      // Stretch one way: only the distance from the fixed line changes.
      var ratio = clampScale(dot(rel, dn) / len);
      if (free) ratio = snapRatio(ratio);
      var f = ratio - 1;
      l = [1 + f * dn[0] * dn[0], f * dn[1] * dn[0], f * dn[0] * dn[1], 1 + f * dn[1] * dn[1]];
    } else {
      // Skew: the edge slides along itself; the fixed line stays put.
      var sk = dot([uu[0] - mid[0], uu[1] - mid[1]], en) / len;
      // Zero skew is sticky. It is where the dragged edge stands square to
      // the line from the fixed side's middle (a triangle: the fixed corner):
      // a square child's sides meet at right angles again, and a triangle is
      // symmetric about that line. The pull reaches 6 pixels on screen.
      var A = [m0[0], m0[1], m0[2], m0[3]], Ad = [A[0] * dvec[0] + A[2] * dvec[1], A[1] * dvec[0] + A[3] * dvec[1]], Ae = [A[0] * en[0] + A[2] * en[1], A[1] * en[0] + A[3] * en[1]];
      var ae2 = dot(Ae, Ae), square = -dot(Ad, Ae) / (len * ae2), pixels = len * Math.sqrt(ae2) * (state.editorView ? state.editorView.scale : 100);
      if (Math.abs(sk - square) * pixels < 6) sk = square;
      l = [1 + sk * en[0] * dn[0], sk * en[1] * dn[0], sk * en[0] * dn[1], 1 + sk * en[1] * dn[1]];
    }
    return M.compose(m0, about(l, fixed));
  }

  // Snap grid: a corner that a drag moves snaps to a grid point
  // within SNAP_REACH pixels, and lets go once the pointer moves on. A turn
  // snaps by angle instead. A scale about the centre moves its corner along
  // a line, so that corner snaps onto a grid line, a grid point first.
  var SNAP_REACH = 6;
  function movingCorners(drag, n) {
    if (drag.job === 'move') return null;
    if (drag.job === 'scale') return [drag.handle.index];
    return [drag.handle.index, (drag.handle.index + 1) % n];
  }
  // The snap lattice follows the frame. A square frame has Cols by Rows
  // cells, with lines through its edges. A triangle frame is cut into Per
  // side pieces along each side, so its lattice is triangular, with lines
  // parallel to its three sides. Each family of lines is
  // n · p = offset + k × spacing, for whole k, with n a unit vector.
  //
  // Triangle lattice point (i, j) is the apex plus i steps down the left
  // side and j down the right, each step 1/k of a side:
  // ((j − i) / 2k, 2h/3 − h (i + j) / k), with h the triangle's height.
  function latticePoint(i, j, k) { return [(j - i) / (2 * k), M.TRI_H * 2 / 3 - M.TRI_H * (i + j) / k]; }
  function snapLattice() {
    var grid = snapGridSize();
    if (state.rule.frame !== 'triangle') return {
      families: [{ n: [1, 0], spacing: 1 / grid.cols, offset: -.5 }, { n: [0, 1], spacing: 1 / grid.rows, offset: -.5 }],
      near: function (c) { return [Math.round((c[0] + .5) * grid.cols) / grid.cols - .5, Math.round((c[1] + .5) * grid.rows) / grid.rows - .5]; }
    };
    var k = grid.side, h = M.TRI_H, step = h / k;
    return {
      // Rows, then lines along the left side (n · p = −h/3 + j h/k), then
      // lines along the right side (n · p = h/3 − i h/k).
      families: [{ n: [0, 1], spacing: step, offset: h * 2 / 3 }, { n: [h, -.5], spacing: step, offset: -h / 3 }, { n: [h, .5], spacing: step, offset: h / 3 }],
      // The nearest lattice point is a corner of the rhombus cell around c.
      near: function (c) {
        var s = (h * 2 / 3 - c[1]) * k / h, d = c[0] * 2 * k, i = (s - d) / 2, j = (s + d) / 2, best = null, bestD = Infinity;
        [Math.floor(i), Math.ceil(i)].forEach(function (a) {
          [Math.floor(j), Math.ceil(j)].forEach(function (b) {
            var p = latticePoint(a, b, k), gap = distance(p, c);
            if (gap < bestD) { bestD = gap; best = p; }
          });
        });
        return best;
      }
    };
  }
  function snapScale(drag, m) {
    var lattice = snapLattice(), view = state.editorView, c = [m[4], m[5]];
    var corner = M.apply(m, M.framePolygon(state.rule.frame)[drag.handle.index]), v = [corner[0] - c[0], corner[1] - c[1]];
    var best = null, bestScore = Infinity;
    lattice.families.forEach(function (f) {
      var nv = dot(f.n, v);
      if (Math.abs(nv) < 1e-9) return;
      var line = f.offset + Math.round((dot(f.n, corner) - f.offset) / f.spacing) * f.spacing, t = (line - dot(f.n, c)) / nv;
      if (t <= 0) return;
      var moved = [c[0] + v[0] * t, c[1] + v[1] * t];
      if (distance(view.point(moved), view.point(corner)) > SNAP_REACH) return;
      var score = distance(view.point(moved), view.point(lattice.near(moved)));
      if (score < bestScore) { best = t; bestScore = score; }
    });
    return best == null ? m : M.compose(about([best, 0, 0, best], c), m);
  }
  // A moved child sticks on each axis by itself. Its corners' x values
  // stick to any x within SNAP_REACH pixels, and likewise y: the parent's
  // corners, the other children's corners and, with Snap corners on, the
  // grid lines. So a child lined up with an edge slides along that edge
  // while the hand wobbles across it. Alt moves it freely.
  function snapMove(drag, m) {
    var frame = state.rule.frame, view = state.editorView, mine = M.transformedFrame(frame, m), targets = [[], []];
    function add(p) { targets[0].push(p[0]); targets[1].push(p[1]); }
    M.framePolygon(frame).forEach(add);
    currentLetter().children.forEach(function (child) { if (child !== drag.child) M.transformedFrame(frame, child.matrix).forEach(add); });
    if (state.snapGrid) {
      var lattice = snapLattice();
      mine.forEach(function (c) { add(lattice.near(c)); });
    }
    var out = m.slice();
    [0, 1].forEach(function (axis) {
      var best = null, reach = SNAP_REACH / view.scale;
      mine.forEach(function (c) {
        targets[axis].forEach(function (t) { var d = t - c[axis]; if (Math.abs(d) < reach) { reach = Math.abs(d); best = d; } });
      });
      if (best != null) out[4 + axis] += best;
    });
    return out;
  }
  function snapToGrid(drag, point, m, shift) {
    if (!state.snapGrid || drag.job === 'rotate') return m;
    if (drag.job === 'scale' && !shift) return snapScale(drag, m);
    var lattice = snapLattice(), view = state.editorView, corners = M.transformedFrame(state.rule.frame, m);
    var which = movingCorners(drag, corners.length) || corners.map(function (_, i) { return i; });
    var best = null, bestDistance = SNAP_REACH;
    which.forEach(function (i) {
      var c = corners[i], g = lattice.near(c);
      var d = distance(view.point(c), view.point(g));
      if (d < bestDistance) { best = [g[0] - c[0], g[1] - c[1]]; bestDistance = d; }
    });
    if (!best) return m;
    return dragMatrix(drag, [point[0] + best[0], point[1] + best[1]], false, shift);
  }

  function moveEditorPointer(event) {
    if (movePan(event)) return;
    var drag = state.editorDrag; if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.job) {
      var dx = event.clientX - drag.pixel[0], dy = event.clientY - drag.pixel[1];
      if (Math.hypot(dx, dy) < JOB_PIXELS) return;
      drag.job = edgeJob(drag, dx, dy);
    }
    var point = editorPoint(event), m = dragMatrix(drag, point, !state.snapGrid, event.shiftKey);
    m = drag.job === 'move' ? (event.altKey ? m : snapMove(drag, m)) : snapToGrid(drag, point, m, event.shiftKey);
    if (!m.every(Number.isFinite) || Math.abs(M.determinant(m)) < 1e-9) return;
    drag.moved = true; drag.child.matrix = m; markEdited(); scheduleDragFrame(); event.preventDefault();
  }

  // A mouse can send pointer moves faster than the screen redraws. Each
  // screen frame draws the latest position once.
  var dragFrame = 0;
  function scheduleDragFrame() {
    if (dragFrame) return;
    dragFrame = requestAnimationFrame(function () { dragFrame = 0; if (state.editorDrag) { renderEditor(); renderMain(); } });
  }

  function endEditorPointer(event) {
    if (endPan(event)) return;
    if (!state.editorDrag || state.editorDrag.pointer !== event.pointerId) return;
    var moved = state.editorDrag.moved; state.editorDrag = null; state.dragging = false;
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = 0; }
    if (moved) commit(); else { renderEditor(); renderMain(); }
  }

  // Editor zoom and pan. The editor fits its children on its own until the
  // viewer zooms or pans. Then the view holds still, so a child dragged far
  // away does not shrink the rest, until Fit hands control back.
  function editorCamera() {
    if (!state.editorCamera) state.editorCamera = { bounds: editorBounds(), zoom: 1, x: 0, y: 0 };
    return state.editorCamera;
  }
  function fitEditor() { state.editorCamera = null; renderEditor(); }
  // x and y are the pointer's offset from the canvas centre.
  function zoomEditor(factor, x, y) {
    var cam = editorCamera(), next = Math.max(.1, Math.min(40, cam.zoom * factor));
    factor = next / cam.zoom; cam.zoom = next;
    if (x != null) { cam.x = (cam.x - x) * factor + x; cam.y = (cam.y - y) * factor + y; }
    else { cam.x *= factor; cam.y *= factor; }
    renderEditor();
  }
  function editorOffset(clientX, clientY) {
    var rect = el.ruleEditor.getBoundingClientRect();
    return [clientX - rect.left - rect.width / 2, clientY - rect.top - rect.height / 2];
  }
  function startPan(event, deselect) {
    var pointers = state.editorPointers || (state.editorPointers = {});
    pointers[event.pointerId] = [event.clientX, event.clientY];
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]], cam = editorCamera();
      state.editorPinch = { distance: Math.max(1, distance(a, b)), centre: editorOffset((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), zoom: cam.zoom, x: cam.x, y: cam.y };
      state.editorPan = null;
    } else if (ids.length === 1) {
      state.editorPan = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, deselect: deselect };
    }
    el.ruleEditor.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function movePan(event) {
    var pointers = state.editorPointers;
    if (!pointers || !pointers[event.pointerId]) return false;
    pointers[event.pointerId] = [event.clientX, event.clientY];
    var ids = Object.keys(pointers), cam;
    if (ids.length === 2 && state.editorPinch) {
      var pinch = state.editorPinch, a = pointers[ids[0]], b = pointers[ids[1]], centre = editorOffset((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      cam = editorCamera(); cam.zoom = Math.max(.1, Math.min(40, pinch.zoom * distance(a, b) / pinch.distance));
      var f = cam.zoom / pinch.zoom;
      cam.x = (pinch.x - pinch.centre[0]) * f + centre[0]; cam.y = (pinch.y - pinch.centre[1]) * f + centre[1];
      renderEditor();
    } else if (state.editorPan && state.editorPan.pointer === event.pointerId) {
      var pan = state.editorPan, dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (!pan.moved && Math.hypot(dx, dy) < 3) return true;
      if (!pan.moved) { cam = editorCamera(); pan.moved = true; pan.camX = cam.x; pan.camY = cam.y; el.ruleEditor.classList.add('panning'); }
      cam = editorCamera(); cam.x = pan.camX + dx; cam.y = pan.camY + dy; renderEditor();
    }
    event.preventDefault(); return true;
  }
  function endPan(event) {
    var pointers = state.editorPointers;
    if (!pointers || !pointers[event.pointerId]) return false;
    var pan = state.editorPan;
    delete pointers[event.pointerId]; state.editorPinch = null;
    var ids = Object.keys(pointers);
    if (ids.length === 1) {
      // One finger stays down after a pinch: it carries on panning.
      var rest = pointers[ids[0]], cam = editorCamera();
      state.editorPan = { pointer: Number(ids[0]), x: rest[0], y: rest[1], moved: true, camX: cam.x, camY: cam.y };
    } else {
      state.editorPan = null; el.ruleEditor.classList.remove('panning');
      if (pan && pan.pointer === event.pointerId && !pan.moved && pan.deselect && event.type === 'pointerup') {
        state.selectedId = null; syncControls(); renderEditor();
      }
    }
    return true;
  }

  function startMainPointer(event) {
    state.mainPointers = state.mainPointers || {}; state.mainPointers[event.pointerId] = [event.clientX, event.clientY];
    var ids = Object.keys(state.mainPointers);
    if (ids.length === 1) state.mainDrag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, panX: state.camera.x, panY: state.camera.y };
    else if (ids.length === 2) {
      var a = state.mainPointers[ids[0]], b = state.mainPointers[ids[1]];
      state.mainPinch = { distance: distance(a, b), centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], zoom: state.camera.zoom, x: state.camera.x, y: state.camera.y };
      state.mainDrag = null;
    }
    el.limit.classList.add('dragging'); el.limit.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function moveMainPointer(event) {
    if (!state.mainPointers || !state.mainPointers[event.pointerId]) return;
    state.mainPointers[event.pointerId] = [event.clientX, event.clientY];
    var ids = Object.keys(state.mainPointers);
    if (ids.length === 2 && state.mainPinch) {
      var a = state.mainPointers[ids[0]], b = state.mainPointers[ids[1]], centre = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      state.camera.zoom = Math.max(.05, Math.min(20, state.mainPinch.zoom * distance(a, b) / Math.max(1, state.mainPinch.distance)));
      state.camera.x = state.mainPinch.x + centre[0] - state.mainPinch.centre[0]; state.camera.y = state.mainPinch.y + centre[1] - state.mainPinch.centre[1];
    } else if (state.mainDrag && state.mainDrag.pointer === event.pointerId) {
      state.camera.x = state.mainDrag.panX + event.clientX - state.mainDrag.x; state.camera.y = state.mainDrag.panY + event.clientY - state.mainDrag.y;
    }
    renderMain(); event.preventDefault();
  }
  function endMainPointer(event) {
    if (!state.mainPointers || !state.mainPointers[event.pointerId]) return;
    delete state.mainPointers[event.pointerId]; state.mainPinch = null;
    var ids = Object.keys(state.mainPointers);
    if (ids.length === 1) {
      var point = state.mainPointers[ids[0]]; state.mainDrag = { pointer: Number(ids[0]), x: point[0], y: point[1], panX: state.camera.x, panY: state.camera.y };
    } else { state.mainDrag = null; el.limit.classList.remove('dragging'); saveAddress(); }
  }
  function zoom(factor, x, y) {
    // Pan by the zoom actually applied. At a limit that is 1, so the view holds still.
    var next = Math.max(.05, Math.min(20, state.camera.zoom * factor));
    factor = next / state.camera.zoom; state.camera.zoom = next;
    if (x != null) { state.camera.x = (state.camera.x - x) * factor + x; state.camera.y = (state.camera.y - y) * factor + y; }
    renderMain(); saveAddress();
  }

  function wireEvents() {
    el.demo.addEventListener('change', function () {
      if (!demos[el.demo.value]) return; state.demo = el.demo.value; state.rule = M.clone(demos[state.demo]); state.currentLetter = state.rule.letters[0].id; state.selectedId = null; state.focus = 'child'; state.brush = M.identity(); state.depth = PRESETS.balanced.depth; readView(null); state.colourMode = null; state.savedName = null; state.newLetter = null; state.camera = { zoom: 1, x: 0, y: 0 }; state.editorCamera = null; commit();
    });
    el.addLetter.addEventListener('click', addLetter);
    el.removeLetter.addEventListener('click', removeLetter);
    el.duplicateLetter.addEventListener('click', duplicateLetter);
    makeSortable(el.letterTabs, '.letter-tab', null, 'x', moveLetter);
    makeSortable(el.numbersBody, 'tr', '.grip', 'y', moveChild);
    el.editForm.addEventListener('submit', function (event) {
      var ok = event.submitter && event.submitter.value === 'ok';
      if (ok && !applyEditDialog()) { event.preventDefault(); notice('Use a number, a fraction such as 1/3, or a root such as √2/2.'); return; }
      state.editing = null;
    });
    el.editDialog.addEventListener('close', function () { state.editing = null; });
    el.saveFractal.addEventListener('click', saveFractal);
    el.saveName.addEventListener('keydown', function (event) { if (event.key === 'Enter') saveFractal(); });
    el.parentColour.addEventListener('click', function () { toggleColourPicker(); });
    el.colourDefault.addEventListener('click', function () { setParentColour(defaultColour(state.rule.letters.indexOf(currentLetter())), true); });
    el.colourCustom.addEventListener('input', function () { setParentColour(el.colourCustom.value, false); });
    el.colourCustom.addEventListener('change', function () { setParentColour(el.colourCustom.value, true); });
    el.colourPicker.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.stopPropagation(); toggleColourPicker(false); el.parentColour.focus(); } });
    document.addEventListener('pointerdown', function (event) {
      if (!el.colourPicker.hidden && !el.colourPicker.contains(event.target) && !el.parentColour.contains(event.target)) toggleColourPicker(false);
    });
    el.exportFractal.addEventListener('click', exportFractal); el.exportAll.addEventListener('click', exportAll);
    el.importFractal.addEventListener('click', function () { el.importFile.value = ''; el.importFile.click(); });
    el.importFile.addEventListener('change', function () { if (el.importFile.files[0]) importFile(el.importFile.files[0]); });
    renderLibrary();
    el.undo.addEventListener('click', undo); el.redo.addEventListener('click', redo);
    el.undo.title = 'Undo (' + modKey() + 'Z)'; el.redo.title = 'Redo (' + (MAC ? '⇧⌘Z' : 'Ctrl+Y') + ')';
    wireDividers(); wireIterationPanel();
    // Grid sizes: one button for each size from 2 to 12. Each pick is one undo step.
    function gridButtons(container, onPick) {
      for (var n = GRID_MIN; n <= GRID_MAX; n++) { var b = document.createElement('button'); b.type = 'button'; b.textContent = n; container.appendChild(b); }
      container.addEventListener('click', function (event) { var b = event.target.closest('button'); if (b) { onPick(Number(b.textContent)); markEdited(); commit(); } });
    }
    gridButtons(el.gridRows, function (rows) { setGrid(rows, snapGridSize().cols); });
    gridButtons(el.gridCols, function (cols) { setGrid(snapGridSize().rows, cols); });
    gridButtons(el.gridSide, function (side) { state.rule.grid.side = side; });
    el.frameShape.querySelectorAll('[data-frame]').forEach(function (button) { button.addEventListener('click', function () { setFrame(button.dataset.frame); }); });
    el.toggleSnap.addEventListener('change', function () { state.snapGrid = el.toggleSnap.checked; renderEditor(); saveAddress(); });
    el.editorZoomIn.addEventListener('click', function () { zoomEditor(1.25); });
    el.editorZoomOut.addEventListener('click', function () { zoomEditor(.8); });
    el.editorFit.addEventListener('click', fitEditor);
    el.ruleEditor.addEventListener('wheel', function (event) {
      // A trackpad pinch arrives as a wheel event with Ctrl held.
      var offset = editorOffset(event.clientX, event.clientY);
      zoomEditor(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0015)), offset[0], offset[1]); event.preventDefault();
    }, { passive: false });
    el.colourMode.querySelectorAll('[data-colour]').forEach(function (button) {
      button.addEventListener('click', function () { state.colourMode = button.dataset.colour; syncControls(); renderEditor(); renderIterations(); renderMain(); saveAddress(); });
    });
    el.shapeMode.querySelectorAll('[data-shape]').forEach(function (button) {
      button.addEventListener('click', function () { state.shape = button.dataset.shape; syncControls(); renderIterations(); renderMain(); saveAddress(); });
    });
    el.numbersMode.querySelectorAll('[data-numbers]').forEach(function (button) {
      button.addEventListener('click', function () { state.numbers = button.dataset.numbers === 'show'; syncControls(); renderIterations(); renderMain(); saveAddress(); });
    });
    el.styleMode.querySelectorAll('[data-style]').forEach(function (button) {
      button.addEventListener('click', function () { state.style = button.dataset.style; syncControls(); renderIterations(); renderMain(); saveAddress(); });
    });
    el.copyLimits.addEventListener('click', copyLimits);
    el.pasteLimits.addEventListener('click', pasteLimits);
    el.depth.addEventListener('input', function () { state.depth = Number(el.depth.value); el.depthValue.textContent = state.depth; state.dragging = true; setCustom(); syncLimitControls(); renderMain(); });
    el.depth.addEventListener('change', function () { state.dragging = false; updateAnalysis(); renderReadouts(); renderMain(); saveAddress(); });
    el.toggleMenu.addEventListener('click', function () { var open = el.togglePopover.hidden; el.togglePopover.hidden = !open; el.toggleMenu.setAttribute('aria-expanded', open); el.toggleMenu.parentNode.classList.toggle('open', open); });
    document.querySelectorAll('[data-preset]').forEach(function (button) {
      if (button.dataset.preset !== 'custom') button.addEventListener('click', function () { applyPreset(button.dataset.preset); });
    });
    function bindLimit(control, read, label, analysis) {
      control.addEventListener('input', function () {
        read(); label(); setCustom(); document.querySelectorAll('[data-preset]').forEach(function (button) { button.classList.toggle('active', button.dataset.preset === state.preset); });
      });
      control.addEventListener('change', function () {
        if (analysis) { updateAnalysis(); renderReadouts(); }
        renderMain(); saveAddress();
      });
    }
    bindLimit(el.minDepth, function () { state.limits.minDepth = Number(el.minDepth.value); }, function () { el.minDepthValue.textContent = state.limits.minDepth; }, false);
    bindLimit(el.maxCopies, function () { state.limits.maxInstances = COPY_VALUES[Number(el.maxCopies.value)]; }, function () { el.maxCopiesValue.textContent = count(state.limits.maxInstances); }, true);
    bindLimit(el.minScale, function () { state.limits.minScale = SCALE_VALUES[Number(el.minScale.value)]; }, function () { el.minScaleValue.textContent = scaleLabel(state.limits.minScale); }, false);
    bindLimit(el.maxTime, function () { state.limits.maxMs = TIME_VALUES[Number(el.maxTime.value)]; }, function () { el.maxTimeValue.textContent = count(state.limits.maxMs) + ' ms'; }, false);
    bindLimit(el.analysisDepth, function () { state.limits.analysisDepth = Number(el.analysisDepth.value); }, function () { el.analysisDepthValue.textContent = state.limits.analysisDepth; }, true);
    // The hull sliders redo the hulls on release, and the views redraw with them.
    [[el.hullIterations, HULL_STEPS, 'hullIterations'], [el.hullCap, HULL_CORNERS, 'hullCorners']].forEach(function (row) {
      var input = row[0], values = row[1], field = row[2];
      input.max = values.length - 1;
      bindLimit(input, function () { state.limits[field] = values[Number(input.value)]; },
        function () { el.hullIterationsValue.textContent = stepsLabel(state.limits.hullIterations); el.hullCapValue.textContent = state.limits.hullCorners; }, true);
      input.addEventListener('change', renderIterations);
    });
    [['rotateLeft', el.rotateLeft], ['rotateRight', el.rotateRight], ['flipH', el.flipH], ['flipV', el.flipV]].forEach(function (pair) {
      pair[1].addEventListener('click', function () { orient(pair[0]); });
    });
    el.addChild.addEventListener('click', addFreeChild);
    el.duplicateChild.title = 'Duplicate (' + modKey() + 'D)';
    el.duplicateChild.addEventListener('click', function () { state.focus = 'child'; duplicateChild(); });
    el.removeChild.addEventListener('click', function (event) { state.focus = 'child'; if (event.shiftKey) removeAllChildren(); else removeSelected(); });
    el.randomiseParent.addEventListener('click', function (event) { randomise([currentLetter()], !event.shiftKey); });
    el.randomiseAll.addEventListener('click', function (event) { randomise(state.rule.letters, !event.shiftKey); });
    el.ruleEditor.addEventListener('pointerdown', startEditorPointer); el.ruleEditor.addEventListener('pointermove', moveEditorPointer); el.ruleEditor.addEventListener('pointerup', endEditorPointer); el.ruleEditor.addEventListener('pointercancel', endEditorPointer);
    el.limit.addEventListener('pointerdown', startMainPointer); el.limit.addEventListener('pointermove', moveMainPointer); el.limit.addEventListener('pointerup', endMainPointer); el.limit.addEventListener('pointercancel', endMainPointer);
    el.limit.addEventListener('wheel', function (event) { var rect = el.limit.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .001), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2); event.preventDefault(); }, { passive: false });
    el.zoomIn.addEventListener('click', function () { zoom(1.25); }); el.zoomOut.addEventListener('click', function () { zoom(.8); });
    el.homeView.addEventListener('click', function () { state.camera = { zoom: 1, x: 0, y: 0 }; renderMain(); saveAddress(); });
    el.toggleHull.addEventListener('click', function () { state.showHull = !state.showHull; el.toggleHull.setAttribute('aria-pressed', state.showHull); renderMain(); saveAddress(); });
    el.copyLink.addEventListener('click', function () { navigator.clipboard.writeText(location.href).then(function () { notice('Link copied.'); }, function () { notice('Copy the address from your browser.'); }); });
    el.fullscreen.addEventListener('click', function () { var doc = document, target = document.documentElement; var request = target.requestFullscreen || target.webkitRequestFullscreen; if (request) Promise.resolve(request.call(target)).catch(function () {}); el.fullscreen.blur(); });
    // Keys. Digits 1 to 9 and 0 (for 10) set a child's parent; Shift with a
    // digit shows that parent. R and T rotate left and right, H and V flip,
    // Backspace or Delete removes, Cmd+D duplicates, Escape deselects.
    document.addEventListener('keydown', function (event) {
      // Cmd+Z or Ctrl+Z undoes; adding Shift, or Ctrl+Y, redoes. A text box
      // keeps its own undo while it has focus.
      if (el.editDialog.open) return;
      var target = event.target, typing = target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || (target.tagName === 'INPUT' && !/range|checkbox|radio|button/.test(target.type));
      var key = event.key.toLowerCase(), mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && !typing && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo(); else undo();
        return;
      }
      if (typing) return;
      if (mod && !event.altKey && !event.shiftKey && key === 'd') { event.preventDefault(); duplicateFocused(); return; }
      if (mod || event.altKey) return;
      var digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code || '');
      if (digit) {
        var letter = state.rule.letters[(Number(digit[1]) || 10) - 1];
        if (letter) { if (event.shiftKey) selectParent(letter.id); else pickChildLetter(letter.id); }
        event.preventDefault(); return;
      }
      if (key === 'backspace' || key === 'delete') { event.preventDefault(); if (event.shiftKey) removeAllChildren(); else removeFocused(); return; }
      if (event.shiftKey) return;
      if (key === 'escape') { if (state.selectedId) { state.selectedId = null; syncControls(); renderEditor(); } return; }
      var action = { r: 'rotateLeft', t: 'rotateRight', h: 'flipH', v: 'flipV' }[key];
      if (action) { event.preventDefault(); orient(action); }
    });
    // Each canvas redraws when its own box changes size, as a panel line is
    // dragged too, so the browser never stretches an old picture out of shape.
    var resized = {}, frame = 0;
    var observer = new ResizeObserver(function (entries) {
      entries.forEach(function (entry) { resized[entry.target === el.ruleEditor ? 'editor' : entry.target === el.limit ? 'main' : 'strip'] = true; });
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0; var done = resized; resized = {};
        if (done.editor) renderEditor(); if (done.strip) renderIterations(); if (done.main) renderMain();
      });
    });
    [el.ruleEditor, el.limit, document.getElementById('iteration-strip')].forEach(function (target) { observer.observe(target); });
  }

  function collectElements() {
    ['demo','rule-name','letter-tabs','add-letter','duplicate-letter','remove-letter','undo','redo','divider-left','divider-right','rule-editor','selection-heading','selection-name','brush-preview','rotate-left','rotate-right','flip-h','flip-v','add-child','duplicate-child','randomise-parent','remove-child','randomise-all','child-letters','save-name','save-fractal','library-list','library-empty','export-fractal','export-all','import-fractal','import-file','numbers-kind','numbers-head','numbers-body','edit-dialog','edit-form','edit-title','edit-fields','limit','grid-rows','grid-cols','grid-side','frame-shape','cols-field','rows-field','side-field','toggle-snap','editor-zoom-in','editor-zoom-out','editor-fit','divider-editor','editor-wrap','colour-mode','palette-label','parent-colour','colour-picker','colour-swatches','colour-custom','colour-default','dimension-label','depth','depth-value','toggle-menu','toggle-popover','min-depth','min-depth-value','max-copies','max-copies-value','min-scale','min-scale-value','max-time','max-time-value','analysis-depth','analysis-depth-value','hull-iterations','hull-iterations-value','hull-cap','hull-cap-value','copy-limits','paste-limits','shape-mode','numbers-mode','style-mode','toggle-strip','divider-strip','iteration-panel','palette-key','zoom-out','zoom-in','home-view','toggle-hull','notice','instance-count','status-badge','status-detail','dimension','dimension-value','box-dimension','overlap','hull-corners','hull-area','explanation-text','copy-link','fullscreen'].forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); el[key] = $(id);
    });
  }

  function init() {
    collectElements();
    el.maxCopies.max = COPY_VALUES.length - 1; el.minScale.max = SCALE_VALUES.length - 1; el.maxTime.max = TIME_VALUES.length - 1;
    var custom = document.createElement('option'); custom.value = ''; custom.textContent = 'Custom rule'; el.demo.appendChild(custom);
    loadAddress(); Theme.wireThemeToggle();
    var fullscreenEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled; el.fullscreen.hidden = !fullscreenEnabled;
    wireEvents(); commit();
    document.querySelector('.theme-toggle').addEventListener('click', function () { requestAnimationFrame(function () { renderEditor(); renderIterations(); renderMain(); }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
