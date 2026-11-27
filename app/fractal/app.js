(function () {
  'use strict';

  var M = window.FractalModel;
  var PALETTE = ['#e9b44c', '#59c3b5', '#dc6f82', '#8297e8', '#d98fd0', '#7fc66c', '#f28b54', '#a68bd7', '#57a9d8', '#d2c65e'];
  var DEMO_NAMES = { sieve: 'Sierpinski sieve', linked: 'Linked pair', free: 'Free placement', blankSquare: 'Blank square rule', blankTriangle: 'Blank triangle rule' };
  var EXPLANATIONS = {
    sieve: 'Three half-size copies leave the top-right quarter empty. Repeating that rule makes the right-angled Sierpinski triangle.',
    linked: 'Parent 1 makes one 1 and one 2. Parent 2 makes one 1 and two 2s. The two parents share one limit through a linked rule.',
    free: 'Three freely placed copies show continuous position, angle, scale, and reflection. The dashed frame is their parent.',
    blankSquare: 'Tap square cells to build a new rule.',
    blankTriangle: 'Tap upright or downward triangle cells to build a new rule.'
  };
  var demos = M.demos();
  demos.blankSquare = M.baseRule('square', 'square', [{ id: 'p1', children: [] }]);
  demos.blankTriangle = M.baseRule('triangle', 'triangle', [{ id: 'p1', children: [] }]);
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
  // Separate thousands only from 10,000 up: 1000 and 9999, then 10,000.
  function count(n) { return Math.abs(n) >= 10000 ? Math.round(n).toLocaleString('en-GB') : String(Math.round(n)); }
  // The Stretch and Skew locks are a per-viewer preference, kept in local
  // storage when allowed. A locked job loses its edge handles.
  function readLocks() {
    try { var saved = JSON.parse(localStorage.getItem('fractal-locks') || 'null'); if (saved) return { stretch: !!saved.stretch, skew: !!saved.skew }; } catch (error) {}
    return { stretch: false, skew: false };
  }
  function saveLocks() { try { localStorage.setItem('fractal-locks', JSON.stringify(state.locks)); } catch (error) {} }
  // While a child or the Iterations slider is dragged, the main view draws at most
  // this many copies, for this long, then draws in full on release.
  var DRAG_COPIES = 4000, DRAG_MS = 40;
  var PRESETS = {
    fast: { depth: 6, minDepth: 3, maxInstances: 10000, minScale: 1e-3, maxMs: 100, analysisDepth: 5, hullIterations: 16 },
    balanced: { depth: 7, minDepth: 4, maxInstances: 25000, minScale: 1 / 2500, maxMs: 250, analysisDepth: 7, hullIterations: 32 },
    detailed: { depth: 10, minDepth: 5, maxInstances: 120000, minScale: 0, maxMs: 1000, analysisDepth: 9, hullIterations: 64 }
  };
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
    brush: M.identity(), newLetter: null, snapGrid: false, locks: readLocks(), editorCamera: null,
    depth: 7, showHull: true, camera: { zoom: 1, x: 0, y: 0 }, dragging: false,
    limits: Object.assign({}, PRESETS.balanced), preset: 'balanced', colourMode: null,
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
  function colour(id) {
    var index = state.rule.letters.findIndex(function (letter) { return letter.id === id; });
    return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
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
  // Old addresses and saved fractals held a true or false for Top copy.
  function readColourMode(value) {
    if (typeof value === 'boolean') return value ? 'top' : 'parent';
    return COLOUR_MODES.indexOf(value) >= 0 ? value : null;
  }
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
      var kids = orderLetters[letter], j = parseInt(path[i], 36);
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

  function validRule(rule) {
    return rule && rule.version === 2 && ['square', 'triangle'].indexOf(rule.frame) >= 0 &&
      ['square', 'triangle', 'free'].indexOf(rule.mode) >= 0 && Array.isArray(rule.letters) && rule.letters.length &&
      rule.letters.every(function (letter) { return typeof letter.id === 'string' && Array.isArray(letter.children) && letter.children.every(function (child) {
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
        state.currentLetter = saved.current || state.rule.letters[0].id; state.depth = Math.max(0, Math.min(20, saved.depth == null ? 7 : saved.depth));
        state.showHull = saved.hull !== false; state.colourMode = readColourMode(saved.colour);
        if (saved.camera) state.camera = saved.camera;
        state.snapGrid = !!saved.snap;
        if (saved.limits) state.limits = sanitiseLimits(saved.limits);
        state.preset = matchingPreset();
      }
    } catch (error) {
      state.rule = M.clone(demos.sieve); state.demo = 'sieve';
      setTimeout(function () { notice('That address did not contain a valid rule. The Sieve opened instead.'); }, 0);
    }
    if (!letterById(state.currentLetter)) state.currentLetter = state.rule.letters[0].id;
  }

  function saveAddress() {
    var hash;
    if (state.demo && sameRule(state.rule, demos[state.demo]) && state.currentLetter === state.rule.letters[0].id && matchingPreset() === 'balanced' && state.showHull && !state.snapGrid && state.colourMode == null && state.camera.zoom === 1 && !state.camera.x && !state.camera.y) {
      hash = 'demo=' + state.demo;
    } else {
      hash = 'rule=' + encode({ rule: state.rule, current: state.currentLetter, depth: state.depth,
        hull: state.showHull, camera: state.camera, limits: state.limits, snap: state.snapGrid || undefined, colour: state.colourMode || undefined });
    }
    history.replaceState(null, '', location.pathname + location.search + '#' + hash);
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
      hullIterations: nearest(Number(limits.hullIterations) || 32, [8, 16, 32, 64])
    };
  }

  function matchingPreset() {
    var name = Object.keys(PRESETS).find(function (key) {
      var preset = PRESETS[key];
      return state.depth === preset.depth && ['minDepth','maxInstances','minScale','maxMs','analysisDepth','hullIterations'].every(function (field) { return state.limits[field] === preset[field]; });
    });
    return name || 'custom';
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

  function gridFor(letterId) {
    var own = state.rule.grid.perLetter && state.rule.grid.perLetter[letterId];
    if (state.rule.toggles.gridPerLetter && own) return own;
    return { rows: state.rule.grid.rows, cols: state.rule.grid.cols };
  }

  function setGrid(rows, cols) {
    var top = state.rule.mode === 'triangle' ? 5 : 8;
    rows = Math.max(2, Math.min(top, Math.round(rows || 2)));
    cols = Math.max(2, Math.min(top, Math.round(cols || rows)));
    if (state.rule.mode === 'triangle') cols = rows;
    // In Square mode, unequal rows and cols make rectangular copies, which is
    // a Stretch rule. In Free mode the grid only guides snapping.
    // Square mode has no Stretch switch: the grid's shape decides it.
    if (state.rule.mode === 'square') state.rule.toggles.stretch = cols !== rows;
    if (state.rule.toggles.gridPerLetter) state.rule.grid.perLetter[state.currentLetter] = { rows: rows, cols: cols };
    else { state.rule.grid.rows = rows; state.rule.grid.cols = cols; }
    rebuildGridChildren();
  }

  function rebuildGridChildren() {
    if (state.rule.mode === 'free') return;
    state.rule.letters.forEach(function (letter) {
      var grid = gridFor(letter.id);
      letter.children.forEach(function (child) {
        if (!child.cell) return;
        var br = Math.max(1, child.blockRows || child.block || 1);
        var bc = Math.max(1, child.blockCols || child.block || 1);
        if (!state.rule.toggles.blocks) br = bc = 1;
        if (state.rule.mode === 'square') {
          br = Math.min(br, grid.rows - child.cell.row); bc = Math.min(bc, grid.cols - child.cell.col);
          if (!state.rule.toggles.stretch) br = bc = Math.min(br, bc);
          child.blockRows = br; child.blockCols = bc;
          child.matrix = M.squareGridMap(child.cell, grid.rows, grid.cols, child.turn || 0, child.flip, br, state.rule.toggles.stretch ? bc : br);
        }
        else {
          var cell = M.triangleCells(grid.rows).find(function (item) { return item.i === child.cell.i && item.j === child.cell.j && item.down === child.cell.down; });
          if (cell) {
            br = Math.min(br, cell.down ? Math.floor((grid.rows - cell.i - cell.j) / 2) : grid.rows - cell.i - cell.j);
            child.blockRows = child.blockCols = Math.max(1, br);
            child.matrix = M.triangleGridMap(cell, child.turn || 0, child.flip, child.blockRows);
          }
        }
      });
    });
  }

  function matrixClose(a, b) { return a.every(function (x, i) { return Math.abs(x - b[i]) < 1e-7; }); }

  function squarePlacement(matrix, rows, cols) {
    for (var row = 0; row < rows; row++) for (var col = 0; col < cols; col++) {
      for (var br = 1; br <= rows - row; br++) for (var bc = 1; bc <= cols - col; bc++) {
        if (!state.rule.toggles.blocks && (br !== 1 || bc !== 1)) continue;
        if (!state.rule.toggles.stretch && bc !== br) continue;
        for (var turn = 0; turn < 4; turn++) for (var flip = 0; flip < 2; flip++) {
          if (matrixClose(matrix, M.squareGridMap({ row: row, col: col }, rows, cols, turn, !!flip, br, bc)))
            return { cell: { row: row, col: col }, turn: turn, flip: !!flip, blockRows: br, blockCols: bc };
        }
      }
    }
    return null;
  }

  function trianglePlacement(matrix, n) {
    var cells = M.triangleCells(n);
    for (var i = 0; i < cells.length; i++) for (var block = 1; block <= n; block++) {
      if (!state.rule.toggles.blocks && block !== 1) continue;
      for (var turn = 0; turn < 3; turn++) for (var flip = 0; flip < 2; flip++) {
        if (matrixClose(matrix, M.triangleGridMap(cells[i], turn, !!flip, block)))
          return { cell: { i: cells[i].i, j: cells[i].j, down: cells[i].down }, turn: turn, flip: !!flip, blockRows: block, blockCols: block };
      }
    }
    return null;
  }

  function changeMode(mode) {
    if (mode === state.rule.mode) return true;
    if (mode === 'free') { state.rule.mode = 'free'; state.selectedId = null; state.editorCamera = null; markEdited(); commit(); return true; }
    var targetFrame = mode;
    if (state.rule.frame !== targetFrame && allChildren().length) {
      notice('This rule does not fit a ' + targetFrame + ' grid. Remove its children first, or keep it in Free mode.'); return false;
    }
    if (state.rule.frame !== targetFrame) { state.rule.frame = targetFrame; state.brush = M.identity(); }
    var placements = [], ok = true;
    state.rule.letters.forEach(function (letter) {
      var grid = gridFor(letter.id);
      letter.children.forEach(function (child) {
        var placement = mode === 'square' ? squarePlacement(child.matrix, grid.rows, grid.cols) : trianglePlacement(child.matrix, grid.rows);
        if (!placement) ok = false; placements.push([child, placement]);
      });
    });
    if (!ok) { notice('At least one child does not lie exactly on that grid. Free mode has kept the rule unchanged.'); return false; }
    placements.forEach(function (pair) { Object.assign(pair[0], pair[1]); });
    state.rule.mode = mode; state.selectedId = null; state.editorCamera = null; markEdited(); commit(); return true;
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

  function makeView(width, height, bounds, margin, camera) {
    var bw = Math.max(.001, bounds.maxX - bounds.minX), bh = Math.max(.001, bounds.maxY - bounds.minY);
    var scale = Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh);
    var zoom = camera ? camera.zoom : 1, x = camera ? camera.x : 0, y = camera ? camera.y : 0;
    scale *= zoom;
    return { scale: scale, x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale + x,
      y: height / 2 - (bounds.minY + bounds.maxY) / 2 * scale + y,
      point: function (p) { return [this.x + p[0] * this.scale, this.y + p[1] * this.scale]; } };
  }

  function instancesBounds(instances, frame) {
    var points = [];
    instances.forEach(function (item) { M.transformedFrame(frame, item.matrix).forEach(function (p) { points.push(p); }); });
    return M.bounds(points);
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
    var matrix = item.matrix, scale = view.scale, tx = view.x, ty = view.y;
    var local = M.framePolygon(state.rule.frame), framePixels = M.transformedFrame(state.rule.frame, matrix).map(view.point, view);
    // A copy wholly off the canvas is skipped. The copies are still counted.
    if (options.clip && offCanvas(framePixels, options.clip)) return;
    var edge = Math.sqrt(Math.abs(M.polygonArea(framePixels))), fillSmall = edge < (options.letterThreshold || 10);
    ctx.save(); ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
    path(ctx, framePixels);
    if (fillSmall || options.fill) { ctx.fillStyle = itemColour(item); ctx.fill(); }
    else { ctx.fillStyle = itemColour(item) + '28'; ctx.fill(); }
    ctx.strokeStyle = options.stroke || itemColour(item); ctx.lineWidth = options.lineWidth || 1; ctx.stroke();
    if (!fillSmall && options.letters !== false) {
      ctx.transform(scale * matrix[0], scale * matrix[1], scale * matrix[2], scale * matrix[3], tx + scale * matrix[4], ty + scale * matrix[5]);
      drawMark(ctx, item.letter, itemColour(item), state.rule.frame, options.childName);
    }
    ctx.restore();
  }

  // The orientation mark: the parent's number with an underline beneath it.
  // The underline shows which side is down. In the editor, the child's own
  // letter, A, B, C and on, sits at its top left (a triangle: near its top),
  // so it turns and flips with the child. The letter is the child's place in
  // its parent's list. The number uses a serif with lining figures, so every
  // digit sits on the baseline and clears the underline.
  var MARK_FONT = '"Times New Roman", Times, serif';
  function childName(index) { return index < 26 ? String.fromCharCode(65 + index) : 'Z' + (index - 25); }
  function drawMark(ctx, letterId, fill, frame, name) {
    var tri = frame === 'triangle', text = label(letterId);
    var centre = tri ? [0.5, M.TRI_H * .6] : [0.5, .48], size = tri ? .34 : .42;
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 ' + size + 'px ' + MARK_FONT;
    // Lining digits stand about 0.66 em tall, so this centres them.
    var baseline = centre[1] + size * .33;
    ctx.fillText(text, centre[0], baseline);
    var half = Math.max(.09, ctx.measureText(text).width / 2), under = baseline + size * .13;
    ctx.lineWidth = size * .07; ctx.beginPath(); ctx.moveTo(centre[0] - half, under); ctx.lineTo(centre[0] + half, under); ctx.stroke();
    if (name) {
      var spot = tri ? [0.5, M.TRI_H * .3] : [.15, .14];
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
    document.querySelectorAll('#iteration-strip canvas').forEach(function (canvas) {
      var level = Number(canvas.dataset.level), info = prepareCanvas(canvas);
      info.ctx.fillStyle = '#11151b'; info.ctx.fillRect(0, 0, info.width, info.height);
      // expand keeps unsplit parents at the copy cap, so a big rule still shows whole.
      var instances = level ? M.expand(state.rule, state.currentLetter, level, { maxInstances: 12000, maxMs: 0 }) : [{ letter: state.currentLetter, matrix: M.identity() }];
      if (!instances.length) return;
      var view = makeView(info.width, info.height, instancesBounds(instances, state.rule.frame), 12, null);
      instances.forEach(function (item) { drawInstance(info.ctx, item, view, { letterThreshold: 7, lineWidth: .7 }); });
    });
  }

  // Grows and Cycles have no limit shape, so the views show the first few levels.
  function growing() { return !!state.analysis && /^(Grows|Cycles)$/.test(state.analysis.status.name); }

  // The time limit covers a whole frame: working out the copies and drawing
  // them. Drawing takes most of it, and its cost is known only afterwards, so
  // each frame measures its time per copy and the next frame turns the time
  // limit into a copy limit. The first frame assumes 2 µs a copy.
  var msPerCopy = .002;
  function timeCopies(ms) { return Math.max(1, Math.floor(ms / msPerCopy)); }
  function measureFrame(copies, ms) {
    if (copies < 200) return;
    var cost = Math.max(.0002, ms / copies);
    msPerCopy = msPerCopy * .5 + cost * .5;
  }

  function mainInstances() {
    var depth = state.depth, cap = state.dragging ? Math.min(DRAG_COPIES, state.limits.maxInstances) : state.limits.maxInstances;
    var maxMs = state.dragging ? Math.min(DRAG_MS, state.limits.maxMs) : state.limits.maxMs;
    var timeCap = maxMs ? timeCopies(maxMs) : Infinity, byTime = timeCap < cap;
    if (byTime) cap = timeCap;
    var items = expandMain(depth, cap, { maxInstances: cap, maxMs: maxMs,
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

  function renderMain() {
    buildOrder();
    var info = prepareCanvas(el.limit), ctx = info.ctx;
    ctx.fillStyle = css('--stage'); ctx.fillRect(0, 0, info.width, info.height);
    if (!currentLetter().children.length) {
      ctx.fillStyle = '#89939d'; ctx.textAlign = 'center'; ctx.font = '14px ' + MARK_FONT;
      ctx.fillText('Parent ' + label(state.currentLetter) + ' has no children yet.', info.width / 2, info.height / 2);
      el.instanceCount.textContent = ''; return;
    }
    var started = performance.now(), instances = mainInstances();
    var b = state.analysis && state.analysis.bounds && state.analysis.status.name === 'Converges' ? state.analysis.bounds : instancesBounds(instances, state.rule.frame);
    // While a child is dragged, the main view keeps the scale it had at the
    // start, so the picture does not jump as the extent changes.
    if (state.editorDrag && state.editorDrag.mainBounds) b = state.editorDrag.mainBounds;
    state.lastMainBounds = b;
    var view = makeView(info.width, info.height, b, 42, state.camera);
    instances.forEach(function (item) {
      var alpha = item.level == null ? .93 : .22 + .18 * item.level;
      drawInstance(ctx, item, view, { letterThreshold: 8, lineWidth: .65, alpha: alpha, clip: [info.width, info.height] });
    });
    if (state.showHull && state.analysis && state.analysis.status.name === 'Converges' && !state.editorDrag) drawHull(ctx, state.analysis.hull, view);
    measureFrame(instances.length, performance.now() - started);
    var reason = { copies: 'copy limit', time: 'time limit', scale: 'scale limit', iterations: 'iteration limit' }[instances.stoppedBy];
    el.instanceCount.textContent = count(instances.length) + (instances.length === 1 ? ' copy' : ' copies') + (reason ? ' · ' + reason : '');
  }

  function editorBounds() {
    var points = M.framePolygon(state.rule.frame).slice();
    if (state.rule.mode === 'free') currentLetter().children.forEach(function (child) {
      M.transformedFrame(state.rule.frame, child.matrix).forEach(function (p) { points.push(p); });
    });
    var b = M.bounds(points), pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * .08;
    return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
  }

  function drawEditorGrid(ctx, view) {
    var grid = gridFor(state.currentLetter), i;
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    if (state.rule.mode === 'square') {
      for (i = 0; i <= grid.cols; i++) { var a = view.point([i / grid.cols, 0]), b = view.point([i / grid.cols, 1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (i = 0; i <= grid.rows; i++) { var c = view.point([0, i / grid.rows]), d = view.point([1, i / grid.rows]); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }
    } else if (state.rule.mode === 'triangle') {
      M.triangleCells(grid.rows).forEach(function (cell) { path(ctx, cell.vertices.map(view.point, view)); ctx.stroke(); });
    }
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
    path(ctx, parent); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash(state.rule.mode === 'free' ? [6, 5] : []); ctx.stroke(); ctx.setLineDash([]);
    if (state.rule.mode !== 'free') drawEditorGrid(ctx, view);
    else if (state.snapGrid) drawSnapGrid(ctx, view, info.width, info.height);
    currentLetter().children.forEach(function (child, index) {
      var selected = child.id === state.selectedId, item = { letter: child.letter, matrix: child.matrix, path: index.toString(36) };
      drawInstance(ctx, item, view, { letterThreshold: 5, lineWidth: selected ? 2.6 : 1.2, stroke: selected ? '#ffffff' : itemColour(item), alpha: selected ? 1 : .83, childName: childName(index) });
    });
    // Handles go on top of every child, so a covered child can still be resized.
    var chosen = selectedChild();
    if (chosen && state.rule.mode === 'free') drawHandles(ctx, chosen, view);
  }

  function updateAnalysis() {
    state.analysis = M.analyse(state.rule, state.currentLetter, state.limits.analysisDepth,
      { maxInstances: state.limits.maxInstances, hullIterations: state.limits.hullIterations, maxMs: state.limits.maxMs });
  }

  function fixed3(value) { var text = Math.abs(value) < .0005 ? '0.000' : value.toFixed(3); return text.replace('-', '−'); }
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
    el.hullIterations.value = state.limits.hullIterations;
  }

  function renderReadouts() {
    var a = state.analysis, status = a.status.name;
    el.statusBadge.textContent = status; el.statusBadge.dataset.status = status.toLowerCase(); el.statusDetail.textContent = a.status.detail;
    el.dimension.textContent = a.exactDimension || a.dimensionKind;
    el.dimensionValue.textContent = a.dimension == null ? '—' : formatNumber(a.dimension, 4);
    el.boxDimension.textContent = a.boxDimension == null ? '—' : formatNumber(a.boxDimension, 3);
    el.overlap.textContent = a.overlap ? 'Likely' : 'None found';
    el.hullCorners.textContent = a.hull.length; el.hullArea.textContent = formatNumber(a.hullArea, 4);
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

  function childValues(child) {
    var m = child.matrix;
    if (state.rule.mode !== 'free') {
      if (state.rule.mode === 'square') return [child.cell.row + 1, child.cell.col + 1, child.turn || 0, child.flip ? 1 : 0];
      return [child.cell.i, child.cell.j, child.cell.down ? 'down' : 'up', child.turn || 0, child.flip ? 1 : 0];
    }
    if (affineTable()) return [m[0], m[1], m[2], m[3], m[4], m[5]];
    var sv = M.singularValues(m), angle = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    return [m[4], m[5], (sv[0] + sv[1]) / 2, angle, M.determinant(m) < 0 ? 1 : 0];
  }

  // Free mode lists x, y, scale, angle and flip while every child of this
  // parent is a similarity. Once one is stretched or skewed, it lists the
  // six affine values instead.
  function affineTable() {
    return state.rule.mode === 'free' && currentLetter().children.some(function (child) { return !M.isSimilarity(child.matrix, 1e-6); });
  }
  function tableHeaders() {
    if (state.rule.mode === 'square') return ['Parent', 'Row', 'Col', 'Turn', 'Flip'];
    if (state.rule.mode === 'triangle') return ['Parent', 'i', 'j', 'Point', 'Turn', 'Flip'];
    if (affineTable()) return ['Parent', 'm₁₁', 'm₂₁', 'm₁₂', 'm₂₂', 'x', 'y'];
    return ['Parent', 'x', 'y', 'Scale', 'Angle', 'Flip'];
  }

  // The children list, in drawing order: the first child is drawn first, so
  // it sits at the back, and the last sits in front. Drag a row's grip to
  // reorder. In Free mode the pencil opens a pop-up to set exact values.
  function renderNumbers() {
    var headers = tableHeaders(), free = state.rule.mode === 'free';
    function header(index) { return headers[index + 1]; }
    el.numbersHead.innerHTML = '<th aria-label="Reorder"></th><th class="whole">Child</th>' + headers.map(function (h, i) {
      return '<th class="' + (i === 0 || h === 'Flip' || !free ? 'whole' : 'real') + '">' + h + '</th>'; }).join('') + (free ? '<th aria-label="Edit"></th>' : '');
    el.numbersBody.innerHTML = '';
    el.numbersKind.textContent = 'back to front';
    currentLetter().children.forEach(function (child, index) {
      var row = document.createElement('tr'); if (child.id === state.selectedId) row.className = 'selected';
      var grip = document.createElement('td'); grip.className = 'grip'; grip.textContent = '⠿'; grip.title = 'Drag to reorder'; row.appendChild(grip);
      var own = document.createElement('td'); own.className = 'child-name'; own.textContent = childName(index); row.appendChild(own);
      var first = document.createElement('td'); first.className = 'child-number'; first.textContent = label(child.letter); first.style.setProperty('--dot', colour(child.letter)); row.appendChild(first);
      childValues(child).forEach(function (value, column) {
        // Real values show three decimals, 0.000 too, so the points line up.
        // Whole-number fields (cells, turns, flips) stay whole and centred.
        var cell = document.createElement('td'), whole = typeof value !== 'number' || header(column) === 'Flip' || state.rule.mode !== 'free';
        cell.className = whole ? 'whole' : 'real';
        cell.textContent = whole ? value : fixed3(value); row.appendChild(cell);
      });
      if (free) {
        var editCell = document.createElement('td'), edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'edit-child'; edit.setAttribute('aria-label', 'Edit child ' + childName(index)); edit.title = 'Edit values';
        edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
        edit.addEventListener('click', function (event) { event.stopPropagation(); openEditDialog(child); });
        editCell.appendChild(edit); row.appendChild(editCell);
      }
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
    if (state.rule.mode !== 'free') return;
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
    if (affineTable()) child.matrix = values.slice(0, 6);
    else {
      var x = values[0], y = values[1], scale = Math.max(.001, Math.abs(values[2])), angle = values[3] * Math.PI / 180, flip = !!values[4];
      var rotation = [scale * Math.cos(angle), scale * Math.sin(angle), -scale * Math.sin(angle), scale * Math.cos(angle), x, y];
      child.matrix = tidy(flip ? M.compose(rotation, [-1, 0, 0, 1, 1, 0]) : rotation);
    }
    markEdited(); commit(); return true;
  }

  function syncSelection() {
    var child = selectedChild(), free = state.rule.mode === 'free', children = currentLetter().children;
    el.selectionHeading.textContent = child ? 'Selected child' : 'New child';
    el.selectionName.textContent = child ? childName(children.indexOf(child)) : '';
    el.removeChild.disabled = !child; el.duplicateChild.disabled = !child;
    el.addChild.hidden = !free;
    el.flipV.disabled = state.rule.mode === 'triangle';
    el.flipV.title = state.rule.mode === 'triangle' ? 'Triangle mode has no vertical flip' : 'Flip top to bottom (V)';
    renderChildLetters(); renderBrushPreview();
  }

  function syncControls() {
    el.ruleName.textContent = state.demo ? DEMO_NAMES[state.demo] : state.savedName || 'Custom rule';
    el.demo.value = state.demo || '';
    el.modeRow.querySelectorAll('[data-mode]').forEach(function (button) { var on = button.dataset.mode === state.rule.mode; button.classList.toggle('active', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.depth.value = state.depth; el.depthValue.textContent = state.depth;
    var grid = gridFor(state.currentLetter), freeMode = state.rule.mode === 'free', top = freeMode || state.rule.mode === 'square' ? 8 : 5;
    [[el.gridRows, grid.rows], [el.gridCols, grid.cols]].forEach(function (pair) {
      pair[0].querySelectorAll('button').forEach(function (button) {
        var n = Number(button.textContent); button.hidden = n > top;
        button.classList.toggle('active', n === pair[1]); button.setAttribute('aria-pressed', n === pair[1] ? 'true' : 'false');
      });
    });
    el.snapField.hidden = !freeMode; el.toggleSnap.checked = !!state.snapGrid;
    el.colsField.hidden = state.rule.mode === 'triangle';
    el.lockRow.hidden = !freeMode;
    [['stretch', el.lockStretch, 'Stretch'], ['skew', el.lockSkew, 'Skew']].forEach(function (lock) {
      var on = !!state.locks[lock[0]]; lock[1].setAttribute('aria-pressed', on ? 'true' : 'false');
      lock[1].title = on ? lock[2] + ' is locked: the edge handles cannot ' + lock[0] + '. Click to unlock.' : 'Lock ' + lock[0] + ': the edge handles stop ' + (lock[0] === 'skew' ? 'skewing' : 'stretching') + '.';
    });
    el.colourMode.querySelectorAll('[data-colour]').forEach(function (button) { var on = button.dataset.colour === colourMode(); button.classList.toggle('active', on); button.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.toggleStacking.checked = !!state.rule.toggles.stacking; el.togglePerLetter.checked = !!state.rule.toggles.gridPerLetter;
    // Stacking and Grid per letter only mean something on a grid.
    var free = state.rule.mode === 'free';
    [el.toggleStacking, el.togglePerLetter].forEach(function (input) { input.disabled = free; input.parentNode.title = free ? 'Square and Triangle modes only' : ''; });
    el.toggleHull.setAttribute('aria-pressed', state.showHull ? 'true' : 'false');
    syncLimitControls(); renderLetterControls(); syncSelection(); renderNumbers(); renderPalette();
  }

  function commit() {
    rebuildGridChildren(); updateAnalysis(); syncControls(); renderReadouts(); renderEditor(); renderIterations(); renderMain(); saveAddress();
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
  // it turns the other way in the child's own frame. Triangle mode has no
  // Flip V, because it would turn an upright cell into a downward one.
  function frameCentre() { return state.rule.frame === 'triangle' ? [0.5, M.TRI_H * 2 / 3] : [.5, .5]; }
  function tidy(m) { return m.map(function (v) { var r = Math.round(v * 1e9) / 1e9; return Math.abs(v - r) < 1e-12 ? r : v; }); }
  var LOCAL_FLIP = { flipH: [-1, 0, 0, 1, 1, 0], flipV: [1, 0, 0, -1, 0, 1] };
  function orientMatrix(matrix, action) {
    if (LOCAL_FLIP[action]) {
      var flip = LOCAL_FLIP[action];
      if (state.rule.frame === 'triangle' && action === 'flipV') flip = [1, 0, 0, -1, 0, M.TRI_H];
      return tidy(M.compose(matrix, flip));
    }
    var q = state.rule.frame === 'triangle' ? Math.PI * 2 / 3 : Math.PI / 2, c = Math.cos(q), s = Math.sin(q);
    var clockwise = (action === 'rotateRight') !== (M.determinant(matrix) < 0);
    return tidy(M.compose(matrix, about(clockwise ? [c, s, -s, c] : [c, -s, s, c], frameCentre())));
  }

  function orient(action) {
    if (action === 'flipV' && state.rule.mode === 'triangle') return;
    var child = selectedChild();
    if (!child) { state.brush = orientMatrix(state.brush, action); renderBrushPreview(); return; }
    if (state.rule.mode === 'square') {
      // A grid child keeps its cell and changes its placement in it.
      var t = child.turn || 0;
      if (action === 'rotateRight') t += 1; else if (action === 'rotateLeft') t += 3;
      else { if (action === 'flipV') t += 2; child.flip = !child.flip; }
      child.turn = t % 4;
    } else if (state.rule.mode === 'triangle') {
      var placed = trianglePlacement(orientMatrix(child.matrix, action), gridFor(state.currentLetter).rows);
      if (placed) Object.assign(child, placed);
    } else child.matrix = orientMatrix(child.matrix, action);
    markEdited(); commit();
  }

  // The orientation of new children, as a grid placement.
  function brushPlacement() {
    for (var turn = 0; turn < 4; turn++) for (var flip = 0; flip < 2; flip++) {
      var m = state.rule.frame === 'triangle' ? (turn < 3 ? M.triangleGridMap(M.triangleCells(1)[0], turn, !!flip, 1) : null) : M.squareOrientation(turn, !!flip);
      if (m && matrixClose(m, state.brush)) return { turn: turn, flip: !!flip };
    }
    return { turn: 0, flip: false };
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

  // Free mode: + adds a half-size child in the middle, or in the first free
  // corner, with the number and orientation shown in the preview.
  function addFreeChild() {
    if (state.rule.mode !== 'free') return;
    var c = frameCentre(), spots = [c].concat(M.framePolygon(state.rule.frame).map(function (v) { return [c[0] + (v[0] - c[0]) / 2, c[1] + (v[1] - c[1]) / 2]; }));
    var candidates = spots.map(function (p) { return tidy(M.compose([.5, 0, 0, .5, p[0] - .5 * c[0], p[1] - .5 * c[1]], state.brush)); });
    var child = M.child(brushLetter(), firstFree(candidates));
    currentLetter().children.push(child); state.selectedId = child.id; state.focus = 'child'; markEdited(); commit();
  }

  // A duplicate goes beside its original: to the right, or else above, to
  // the left or below, whichever is free first. In a grid it takes the
  // nearest free cell, in the same order.
  function duplicateChild() {
    var source = selectedChild(); if (!source) return;
    var letter = currentLetter(), copy = M.clone(source); copy.id = newChildId();
    if (state.rule.mode === 'free') {
      var b = M.bounds(M.transformedFrame(state.rule.frame, source.matrix)), w = b.maxX - b.minX, h = b.maxY - b.minY;
      copy.matrix = firstFree([[w, 0], [0, -h], [-w, 0], [0, h]].map(function (d) { var m = source.matrix.slice(); m[4] += d[0]; m[5] += d[1]; return m; }), source);
    } else {
      var cell = nearestFreeCell(source);
      if (!cell) { notice('Every cell near this child is taken.'); return; }
      copy.cell = cell;
    }
    letter.children.splice(letter.children.indexOf(source) + 1, 0, copy);
    state.selectedId = copy.id; state.focus = 'child'; markEdited(); commit();
  }
  function nearestFreeCell(source) {
    var grid = gridFor(state.currentLetter), taken = {}, cells = [], from;
    currentLetter().children.forEach(function (child) { if (child.cell) taken[JSON.stringify(child.cell)] = true; });
    if (state.rule.mode === 'square') {
      for (var row = 0; row < grid.rows; row++) for (var col = 0; col < grid.cols; col++) cells.push({ cell: { row: row, col: col }, at: [col, row] });
      from = [source.cell.col, source.cell.row];
    } else {
      M.triangleCells(grid.rows).forEach(function (t) {
        var c = [(t.vertices[0][0] + t.vertices[1][0] + t.vertices[2][0]) / 3 * grid.rows, (t.vertices[0][1] + t.vertices[1][1] + t.vertices[2][1]) / 3 * grid.rows];
        cells.push({ cell: { i: t.i, j: t.j, down: t.down }, at: c, down: t.down });
        if (t.i === source.cell.i && t.j === source.cell.j && t.down === source.cell.down) from = c;
      });
    }
    function rank(item) {
      var dx = item.at[0] - from[0], dy = item.at[1] - from[1], flat = Math.abs(dy) < .5, upright = Math.abs(dx) < .5;
      var side = dx > 0 && flat ? 0 : dy < 0 && upright ? 1 : dx < 0 && flat ? 2 : dy > 0 && upright ? 3 : 4;
      return [item.down === source.cell.down ? 0 : 1, Math.round(Math.hypot(dx, dy) * 100), side];
    }
    var free = cells.filter(function (item) { return !taken[JSON.stringify(item.cell)]; });
    free.sort(function (a, b) { var ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]; });
    return free.length ? free[0].cell : null;
  }

  function addLetter() {
    var id = M.nextId(state.rule); state.rule.letters.push({ id: id, children: [] });
    if (state.rule.toggles.gridPerLetter) state.rule.grid.perLetter[id] = { rows: state.rule.grid.rows, cols: state.rule.grid.cols };
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
  }

  // A duplicate parent goes straight after its original. Its children that
  // copied the original now copy the duplicate, so it stands alone.
  function duplicateLetter() {
    var source = currentLetter(), id = M.nextId(state.rule), index = state.rule.letters.indexOf(source);
    var copy = { id: id, children: source.children.map(function (child) {
      var next = M.clone(child); next.id = newChildId(); if (child.letter === source.id) next.letter = id; return next;
    }) };
    state.rule.letters.splice(index + 1, 0, copy);
    var own = state.rule.grid.perLetter && state.rule.grid.perLetter[source.id];
    if (own) state.rule.grid.perLetter[id] = M.clone(own);
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
    notice('Parent ' + (index + 2) + ' is a copy of parent ' + (index + 1) + '.');
  }

  // Reordering renumbers the parents. Children point at parents by id, so
  // every child follows its parent to the new number.
  function moveLetter(from, to) {
    var moved = state.rule.letters.splice(from, 1)[0]; state.rule.letters.splice(to, 0, moved);
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
  // { format: 'fractal-explorer', version: 1, fractals: [entry, ...] }, where
  // an entry is { name, savedAt, rule, current, level, colourMode }. An older
  // entry may hold colourByTopCopy, true or false, in place of colourMode.
  // Version 2 numbers parents. The version 1 library is dropped unread.
  var LIBRARY_KEY = 'fractal-library-v2', OLD_LIBRARY_KEY = 'fractal-library', FILE_FORMAT = 'fractal-explorer', FILE_VERSION = 2;
  try { localStorage.removeItem(OLD_LIBRARY_KEY); } catch (error) {}
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
    return { name: name, savedAt: new Date().toISOString(), rule: M.clone(state.rule), current: state.currentLetter,
      level: state.depth, colourMode: state.colourMode };
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
    state.depth = Math.max(0, Math.min(20, entry.level == null ? state.depth : entry.level));
    state.colourMode = readColourMode(entry.colourMode != null ? entry.colourMode : entry.colourByTopCopy);
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
    state.rule.letters.splice(index, 1);
    state.rule.letters.forEach(function (letter) {
      var before = letter.children.length;
      letter.children = letter.children.filter(function (child) { return child.letter !== id; });
      lost += before - letter.children.length;
    });
    if (state.rule.grid.perLetter) delete state.rule.grid.perLetter[id];
    state.currentLetter = state.rule.letters[Math.max(0, index - 1)].id;
    if (state.newLetter === id) state.newLetter = null;
    state.selectedId = null; state.focus = 'parent'; markEdited(); commit();
    notice('Removed parent ' + (index + 1) + (lost ? ' and ' + lost + (lost === 1 ? ' child that used it' : ' children that used it') : '') + '. Undo brings it back.');
  }

  function removeSelected() {
    var letter = currentLetter(), index = letter.children.findIndex(function (child) { return child.id === state.selectedId; });
    if (index >= 0) letter.children.splice(index, 1); state.selectedId = null; markEdited(); commit();
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
    var rect = el.ruleEditor.getBoundingClientRect(), view = state.editorView;
    return [(event.clientX - rect.left - view.x) / view.scale, (event.clientY - rect.top - view.y) / view.scale];
  }

  function findChildAt(point) {
    var children = currentLetter().children;
    for (var i = children.length - 1; i >= 0; i--) if (pointInPolygon(point, M.transformedFrame(state.rule.frame, children[i].matrix))) return children[i];
    return null;
  }

  function addGridChild(point) {
    var letter = currentLetter(), grid = gridFor(letter.id), meta, map;
    if (state.rule.mode === 'square') {
      if (point[0] < 0 || point[0] > 1 || point[1] < 0 || point[1] > 1) return;
      var row = Math.min(grid.rows - 1, Math.floor(point[1] * grid.rows)), col = Math.min(grid.cols - 1, Math.floor(point[0] * grid.cols));
      var brushed = brushPlacement();
      meta = { cell: { row: row, col: col }, turn: brushed.turn, flip: brushed.flip, blockRows: 1, blockCols: 1 };
      map = M.squareGridMap(meta.cell, grid.rows, grid.cols, meta.turn, meta.flip);
    } else {
      var cell = M.triangleCells(grid.rows).find(function (item) { return pointInPolygon(point, item.vertices); }); if (!cell) return;
      var tb = brushPlacement();
      meta = { cell: { i: cell.i, j: cell.j, down: cell.down }, turn: tb.turn, flip: tb.flip, blockRows: 1, blockCols: 1 };
      map = M.triangleGridMap(cell, meta.turn, meta.flip, 1);
    }
    var occupied = letter.children.find(function (child) { return JSON.stringify(child.cell) === JSON.stringify(meta.cell); });
    if (occupied && !state.rule.toggles.stacking) { state.selectedId = occupied.id; state.focus = 'child'; syncControls(); renderEditor(); return; }
    var newChild = M.child(brushLetter(), map, meta); letter.children.push(newChild); state.selectedId = newChild.id; state.focus = 'child'; markEdited(); commit();
  }

  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }

  // Handles in Free mode. The child's own top-right corner turns it and its
  // bottom-right corner scales it, both about the child's centre (a
  // triangle: its top point turns and its bottom-right point scales). They
  // are the child's own corners, so they move with it as it turns or flips.
  // Shift on the scale corner stretches both ways. Each edge has one handle
  // at its middle. The first few pixels of a drag pick its job: across the
  // edge stretches, along the edge skews, and the job holds for that drag.
  // The Stretch and Skew locks remove those jobs. Each handle catches the
  // pointer a little beyond its drawn size, less on a small child.
  var KNOB = 7.5, KNOB_REACH = 11, EDGE_REACH = 8, JOB_PIXELS = 4;
  function cornerRoles() { return state.rule.frame === 'triangle' ? { rotate: 0, scale: 1 } : { rotate: 1, scale: 2 }; }
  function edgesOn() { return !(state.locks.stretch && state.locks.skew); }
  function shortestEdge(corners) {
    var shortest = Infinity;
    for (var i = 0; i < corners.length; i++) shortest = Math.min(shortest, distance(corners[i], corners[(i + 1) % corners.length]));
    return shortest;
  }
  function edgePoints(corners) {
    return corners.map(function (p, i) { var q = corners[(i + 1) % corners.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  }
  function drawSnapGrid(ctx, view, width, height) {
    var grid = gridFor(state.currentLetter), x0 = -view.x / view.scale, x1 = (width - view.x) / view.scale, y0 = -view.y / view.scale, y1 = (height - view.y) / view.scale, i;
    // Far out, the grid would be a grey wash, so it thins to every nth line.
    var stepX = Math.max(1, Math.ceil(4 * grid.cols / view.scale)), stepY = Math.max(1, Math.ceil(4 * grid.rows / view.scale));
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1; ctx.globalAlpha = .7;
    for (i = Math.ceil(x0 * grid.cols / stepX) * stepX; i <= x1 * grid.cols; i += stepX) { var a = view.point([i / grid.cols, y0]), b = view.point([i / grid.cols, y1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (i = Math.ceil(y0 * grid.rows / stepY) * stepY; i <= y1 * grid.rows; i += stepY) { var c = view.point([x0, i / grid.rows]), d = view.point([x1, i / grid.rows]); ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke(); }
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
    var centre = view.point(M.apply(child.matrix, frameCentre()));
    if (edgesOn()) corners.forEach(function (p, i) { drawEdgeHandle(ctx, p, corners[(i + 1) % corners.length]); });
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
    if (edgesOn()) edgePoints(corners).forEach(function (mid, i) { consider('edge', i, mid, Math.max(3, Math.min(EDGE_REACH, shortest / 4))); });
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
    if (state.rule.mode !== 'free') {
      var cellHit = findChildAt(point);
      if (cellHit) { state.selectedId = cellHit.id; syncControls(); renderEditor(); }
      else if (pointInPolygon(point, M.framePolygon(state.rule.frame))) addGridChild(point);
      else startPan(event, false);
      return;
    }
    var current = selectedChild(), handle = current ? handleAt(point, current) : null, hit;
    if (handle) hit = current;
    else if (current && pointInPolygon(point, M.transformedFrame(state.rule.frame, current.matrix))) hit = current;
    else hit = findChildAt(point);
    if (!hit) { startPan(event, true); return; }
    state.selectedId = hit.id; syncControls(); renderEditor();
    var job = !handle ? 'move' : handle.type !== 'edge' ? handle.type : state.locks.stretch ? 'skew' : state.locks.skew ? 'stretch' : null;
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
  // the edge stretches, along it skews.
  function edgeJob(drag, dx, dy) {
    var corners = M.transformedFrame(state.rule.frame, drag.matrix), k = drag.handle.index;
    var p = corners[k], q = corners[(k + 1) % corners.length], e = [q[0] - p[0], q[1] - p[1]], len = Math.hypot(e[0], e[1]) || 1;
    var along = Math.abs(dx * e[0] + dy * e[1]) / len, across = Math.abs(dx * e[1] - dy * e[0]) / len;
    return along > across ? 'skew' : 'stretch';
  }

  // The new map for a drag, from the pointer's place in the editor. With
  // free set, a turn snaps to 15 degrees and a scale to simple ratios.
  function dragMatrix(drag, point, free, shift) {
    var m0 = drag.matrix, h = drag.handle, local = M.framePolygon(state.rule.frame), n = local.length, job = drag.job;
    if (job === 'move') { var t = m0.slice(); t[4] += point[0] - drag.start[0]; t[5] += point[1] - drag.start[1]; return t; }
    var cl = frameCentre(), c = M.apply(m0, cl);
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
      if (shift && !state.locks.stretch) {
        // Shift: stretch both ways in the child's own frame, about its centre.
        var u = M.apply(invert(m0), point);
        var sx = Math.abs(q[0] - cl[0]) < 1e-9 ? 1 : clampScale((u[0] - cl[0]) / (q[0] - cl[0]));
        var sy = Math.abs(q[1] - cl[1]) < 1e-9 ? 1 : clampScale((u[1] - cl[1]) / (q[1] - cl[1]));
        return M.compose(m0, about([sx, 0, 0, sy], cl));
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

  // Snap grid: in Free mode, a corner that a drag moves snaps to a grid point
  // within SNAP_REACH pixels, and lets go once the pointer moves on. A turn
  // snaps by angle instead. A scale about the centre moves its corner along
  // a line, so that corner snaps onto a grid line, a grid point first.
  var SNAP_REACH = 6;
  function movingCorners(drag, n) {
    if (drag.job === 'move') return null;
    if (drag.job === 'scale') return [drag.handle.index];
    return [drag.handle.index, (drag.handle.index + 1) % n];
  }
  function gridPointNear(c, grid) { return [Math.round(c[0] * grid.cols) / grid.cols, Math.round(c[1] * grid.rows) / grid.rows]; }
  function snapScale(drag, m) {
    var grid = gridFor(state.currentLetter), view = state.editorView, c = M.apply(m, frameCentre());
    var corner = M.apply(m, M.framePolygon(state.rule.frame)[drag.handle.index]), v = [corner[0] - c[0], corner[1] - c[1]];
    var best = null, bestScore = Infinity;
    [[0, grid.cols], [1, grid.rows]].forEach(function (pair) {
      var axis = pair[0], cells = pair[1];
      if (Math.abs(v[axis]) < 1e-9) return;
      var t = (Math.round(corner[axis] * cells) / cells - c[axis]) / v[axis];
      if (t <= 0) return;
      var moved = [c[0] + v[0] * t, c[1] + v[1] * t];
      if (distance(view.point(moved), view.point(corner)) > SNAP_REACH) return;
      var score = distance(view.point(moved), view.point(gridPointNear(moved, grid)));
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
      var grid = gridFor(state.currentLetter);
      mine.forEach(function (c) { add(gridPointNear(c, grid)); });
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
    if (!state.snapGrid || state.rule.mode !== 'free' || drag.job === 'rotate') return m;
    if (drag.job === 'scale' && !(shift && !state.locks.stretch)) return snapScale(drag, m);
    var grid = gridFor(state.currentLetter), view = state.editorView, corners = M.transformedFrame(state.rule.frame, m);
    var which = movingCorners(drag, corners.length) || corners.map(function (_, i) { return i; });
    var best = null, bestDistance = SNAP_REACH;
    which.forEach(function (i) {
      var c = corners[i], g = gridPointNear(c, grid);
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
    drag.moved = true; drag.child.matrix = m; markEdited(); renderEditor(); renderMain(); event.preventDefault();
  }

  function endEditorPointer(event) {
    if (endPan(event)) return;
    if (!state.editorDrag || state.editorDrag.pointer !== event.pointerId) return;
    var moved = state.editorDrag.moved; state.editorDrag = null; state.dragging = false;
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
    state.camera.zoom = Math.max(.05, Math.min(20, state.camera.zoom * factor));
    if (x != null) { state.camera.x = (state.camera.x - x) * factor + x; state.camera.y = (state.camera.y - y) * factor + y; }
    renderMain(); saveAddress();
  }

  function wireEvents() {
    el.demo.addEventListener('change', function () {
      if (!demos[el.demo.value]) return; state.demo = el.demo.value; state.rule = M.clone(demos[state.demo]); state.currentLetter = state.rule.letters[0].id; state.selectedId = null; state.focus = 'child'; state.brush = M.identity(); state.depth = PRESETS.balanced.depth; state.limits = sanitiseLimits(PRESETS.balanced); state.preset = 'balanced'; state.showHull = true; state.colourMode = null; state.savedName = null; state.newLetter = null; state.camera = { zoom: 1, x: 0, y: 0 }; state.editorCamera = null; commit();
    });
    el.addLetter.addEventListener('click', addLetter);
    el.removeLetter.addEventListener('click', removeLetter);
    el.duplicateLetter.addEventListener('click', duplicateLetter);
    makeSortable(el.letterTabs, '.letter-tab', null, 'x', moveLetter);
    makeSortable(el.numbersBody, 'tr', '.grip', 'y', moveChild);
    el.modeRow.querySelectorAll('[data-mode]').forEach(function (button) { button.addEventListener('click', function () { changeMode(button.dataset.mode); }); });
    el.editForm.addEventListener('submit', function (event) {
      var ok = event.submitter && event.submitter.value === 'ok';
      if (ok && !applyEditDialog()) { event.preventDefault(); notice('Use a number, a fraction such as 1/3, or a root such as √2/2.'); return; }
      state.editing = null;
    });
    el.editDialog.addEventListener('close', function () { state.editing = null; });
    el.saveFractal.addEventListener('click', saveFractal);
    el.saveName.addEventListener('keydown', function (event) { if (event.key === 'Enter') saveFractal(); });
    el.exportFractal.addEventListener('click', exportFractal); el.exportAll.addEventListener('click', exportAll);
    el.importFractal.addEventListener('click', function () { el.importFile.value = ''; el.importFile.click(); });
    el.importFile.addEventListener('change', function () { if (el.importFile.files[0]) importFile(el.importFile.files[0]); });
    renderLibrary();
    el.undo.addEventListener('click', undo); el.redo.addEventListener('click', redo);
    el.undo.title = 'Undo (' + modKey() + 'Z)'; el.redo.title = 'Redo (' + (MAC ? '⇧⌘Z' : 'Ctrl+Y') + ')';
    wireDividers();
    // Without Stretch the grid stays square, so Rows carries Cols with it.
    // Choosing a different Cols is what makes a rectangular, Stretch grid.
    function gridButtons(container, onPick) {
      for (var n = 2; n <= 8; n++) { var b = document.createElement('button'); b.type = 'button'; b.textContent = n; container.appendChild(b); }
      container.addEventListener('click', function (event) { var b = event.target.closest('button'); if (b) onPick(Number(b.textContent)); });
    }
    gridButtons(el.gridRows, function (rows) { var grid = gridFor(state.currentLetter); setGrid(rows, state.rule.toggles.stretch || state.rule.mode === 'free' ? grid.cols : rows); markEdited(); commit(); });
    gridButtons(el.gridCols, function (cols) { setGrid(gridFor(state.currentLetter).rows, cols); markEdited(); commit(); });
    el.toggleSnap.addEventListener('change', function () { state.snapGrid = el.toggleSnap.checked; renderEditor(); saveAddress(); });
    [['stretch', el.lockStretch], ['skew', el.lockSkew]].forEach(function (lock) {
      lock[1].addEventListener('click', function () { state.locks[lock[0]] = !state.locks[lock[0]]; saveLocks(); syncControls(); renderEditor(); });
    });
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
    el.depth.addEventListener('input', function () { state.depth = Number(el.depth.value); el.depthValue.textContent = state.depth; state.dragging = true; setCustom(); syncLimitControls(); renderMain(); });
    el.depth.addEventListener('change', function () { state.dragging = false; updateAnalysis(); renderReadouts(); renderMain(); saveAddress(); });
    [['stacking', el.toggleStacking], ['gridPerLetter', el.togglePerLetter]].forEach(function (pair) {
      pair[1].addEventListener('change', function () {
        state.rule.toggles[pair[0]] = pair[1].checked;
        markEdited(); commit();
      });
    });
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
    el.hullIterations.addEventListener('change', function () { state.limits.hullIterations = Number(el.hullIterations.value); setCustom(); updateAnalysis(); syncLimitControls(); renderReadouts(); renderMain(); saveAddress(); });
    [['rotateLeft', el.rotateLeft], ['rotateRight', el.rotateRight], ['flipH', el.flipH], ['flipV', el.flipV]].forEach(function (pair) {
      pair[1].addEventListener('click', function () { orient(pair[0]); });
    });
    el.addChild.addEventListener('click', addFreeChild);
    el.duplicateChild.title = 'Duplicate (' + modKey() + 'D)';
    el.duplicateChild.addEventListener('click', function () { state.focus = 'child'; duplicateChild(); });
    el.removeChild.addEventListener('click', removeSelected);
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
      if (event.shiftKey) return;
      if (key === 'backspace' || key === 'delete') { event.preventDefault(); removeFocused(); return; }
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
    ['demo','rule-name','mode-row','letter-tabs','add-letter','duplicate-letter','remove-letter','undo','redo','divider-left','divider-right','rule-editor','selection-heading','selection-name','brush-preview','rotate-left','rotate-right','flip-h','flip-v','add-child','duplicate-child','remove-child','child-letters','save-name','save-fractal','library-list','library-empty','export-fractal','export-all','import-fractal','import-file','numbers-kind','numbers-head','numbers-body','edit-dialog','edit-form','edit-title','edit-fields','limit','main-stage','grid-fields','grid-rows','grid-cols','cols-field','snap-field','toggle-snap','lock-row','lock-stretch','lock-skew','editor-zoom-in','editor-zoom-out','editor-fit','divider-editor','editor-wrap','colour-mode','palette-label','depth','depth-value','toggle-menu','toggle-popover','toggle-stacking','toggle-per-letter','min-depth','min-depth-value','max-copies','max-copies-value','min-scale','min-scale-value','max-time','max-time-value','analysis-depth','analysis-depth-value','hull-iterations','palette-key','zoom-out','zoom-in','home-view','toggle-hull','notice','instance-count','status-badge','status-detail','dimension','dimension-value','box-dimension','overlap','hull-corners','hull-area','explanation-text','copy-link','fullscreen'].forEach(function (id) {
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
