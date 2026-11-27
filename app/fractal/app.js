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
    brush: M.identity(), newLetter: null,
    depth: 7, showHull: true, camera: { zoom: 1, x: 0, y: 0 }, dragging: false,
    limits: Object.assign({}, PRESETS.balanced), preset: 'balanced', topColour: null,
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
  // Colour by top-level copy: on by default for a one-letter rule, off for a
  // linked rule, where each letter keeps its own colour. null means default.
  function topColourOn() { return state.topColour == null ? state.rule.letters.length === 1 : state.topColour; }
  function itemColour(item) {
    if (topColourOn() && item.path) return PALETTE[parseInt(item.path[0], 36) % PALETTE.length];
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
        state.currentLetter = saved.current || state.rule.letters[0].id; state.depth = Math.max(1, Math.min(12, saved.depth || 7));
        state.showHull = saved.hull !== false; state.topColour = typeof saved.colour === 'boolean' ? saved.colour : null;
        if (saved.camera) state.camera = saved.camera;
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
    if (state.demo && sameRule(state.rule, demos[state.demo]) && state.currentLetter === state.rule.letters[0].id && matchingPreset() === 'balanced' && state.showHull && state.topColour == null && state.camera.zoom === 1 && !state.camera.x && !state.camera.y) {
      hash = 'demo=' + state.demo;
    } else {
      hash = 'rule=' + encode({ rule: state.rule, current: state.currentLetter, depth: state.depth,
        hull: state.showHull, camera: state.camera, limits: state.limits, colour: state.topColour == null ? undefined : state.topColour });
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
    rows = Math.max(2, Math.min(5, Math.round(rows || 2)));
    cols = Math.max(2, Math.min(5, Math.round(cols || rows)));
    if (state.rule.mode === 'triangle') cols = rows;
    // Unequal rows and cols make rectangular copies, which is a Stretch rule.
    if (cols !== rows && !state.rule.toggles.stretch) {
      state.rule.toggles.stretch = true;
      notice('Stretch is now on: a ' + rows + ' by ' + cols + ' grid makes rectangular copies.');
    }
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
    if (mode === 'free') { state.rule.mode = 'free'; state.selectedId = null; markEdited(); commit(); return true; }
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
    state.rule.mode = mode; state.selectedId = null; markEdited(); commit(); return true;
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

  function drawInstance(ctx, item, view, options) {
    var matrix = item.matrix, scale = view.scale, tx = view.x, ty = view.y;
    var local = M.framePolygon(state.rule.frame), framePixels = M.transformedFrame(state.rule.frame, matrix).map(view.point, view);
    var edge = Math.sqrt(Math.abs(M.polygonArea(framePixels))), fillSmall = edge < (options.letterThreshold || 10);
    ctx.save(); ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
    path(ctx, framePixels);
    if (fillSmall || options.fill) { ctx.fillStyle = itemColour(item); ctx.fill(); }
    else { ctx.fillStyle = itemColour(item) + '28'; ctx.fill(); }
    ctx.strokeStyle = options.stroke || itemColour(item); ctx.lineWidth = options.lineWidth || 1; ctx.stroke();
    if (!fillSmall && options.letters !== false) {
      ctx.transform(scale * matrix[0], scale * matrix[1], scale * matrix[2], scale * matrix[3], tx + scale * matrix[4], ty + scale * matrix[5]);
      drawMark(ctx, item.letter, itemColour(item), state.rule.frame);
    }
    ctx.restore();
  }

  // The orientation mark: the parent's number, an underline beneath it, and
  // a dot near the bottom-right corner. The underline shows which side is
  // down and the dot shows which end of it, so all eight square placements
  // (four turns, each flipped or not) look different, even for 0, 8 or 69.
  function drawMark(ctx, letterId, fill, frame) {
    var tri = frame === 'triangle', text = label(letterId);
    var centre = tri ? [0.5, M.TRI_H * .6] : [0.5, .48], size = tri ? .34 : .42;
    ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 ' + size + 'px Georgia, serif';
    ctx.fillText(text, centre[0], centre[1]);
    var half = Math.max(.09, ctx.measureText(text).width / 2), under = centre[1] + size * .44;
    ctx.lineWidth = size * .07; ctx.beginPath(); ctx.moveTo(centre[0] - half, under); ctx.lineTo(centre[0] + half, under); ctx.stroke();
    var poly = M.framePolygon(frame), corner = poly[tri ? 1 : 2], mid = tri ? [0.5, M.TRI_H * 2 / 3] : [.5, .5], pull = tri ? .2 : .16;
    ctx.beginPath(); ctx.arc(corner[0] + (mid[0] - corner[0]) * pull, corner[1] + (mid[1] - corner[1]) * pull, .035, 0, Math.PI * 2); ctx.fill();
  }

  function drawHull(ctx, hull, view) {
    if (!hull || hull.length < 2) return;
    path(ctx, hull.map(view.point, view)); ctx.strokeStyle = '#f5f0dc'; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  function renderIterations() {
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

  function mainInstances() {
    var depth = Math.max(0, state.depth - (state.dragging ? 2 : 0));
    var options = { maxInstances: state.limits.maxInstances, maxMs: state.limits.maxMs,
      minScale: state.limits.minScale, minDepth: Math.min(state.limits.minDepth, depth) };
    if (growing()) {
      var combined = [], reason = null;
      for (var level = Math.max(0, Math.min(depth, 4) - 3); level <= Math.min(depth, 4); level++) {
        var remaining = Math.max(1, state.limits.maxInstances - combined.length);
        var levelOptions = Object.assign({}, options, { maxInstances: remaining, minDepth: Math.min(options.minDepth, level) });
        var items = level ? M.expand(state.rule, state.currentLetter, level, levelOptions) : [{ letter: state.currentLetter, matrix: M.identity(), level: 0 }];
        reason = items.stoppedBy || reason;
        items.forEach(function (item) { item.level = level; combined.push(item); });
        if (combined.length >= state.limits.maxInstances) { reason = 'copies'; break; }
      }
      combined.stoppedBy = reason || 'iterations';
      return combined;
    }
    return depth ? M.expand(state.rule, state.currentLetter, depth, options) : [{ letter: state.currentLetter, matrix: M.identity(), level: 0 }];
  }

  function renderMain() {
    var info = prepareCanvas(el.limit), ctx = info.ctx;
    ctx.fillStyle = css('--stage'); ctx.fillRect(0, 0, info.width, info.height);
    if (!currentLetter().children.length) {
      ctx.fillStyle = '#89939d'; ctx.textAlign = 'center'; ctx.font = '14px Georgia, serif';
      ctx.fillText('Parent ' + label(state.currentLetter) + ' has no children yet.', info.width / 2, info.height / 2);
      el.instanceCount.textContent = ''; return;
    }
    var instances = mainInstances();
    var b = state.analysis && state.analysis.bounds && state.analysis.status.name === 'Converges' ? state.analysis.bounds : instancesBounds(instances, state.rule.frame);
    // While a child is dragged, the main view keeps the scale it had at the
    // start, so the picture does not jump as the extent changes.
    if (state.editorDrag && state.editorDrag.mainBounds) b = state.editorDrag.mainBounds;
    state.lastMainBounds = b;
    var view = makeView(info.width, info.height, b, 42, state.camera);
    instances.forEach(function (item) {
      var alpha = item.level == null ? .93 : .22 + .18 * item.level;
      drawInstance(ctx, item, view, { letterThreshold: 8, lineWidth: .65, alpha: alpha });
    });
    if (state.showHull && state.analysis && state.analysis.status.name === 'Converges' && !state.editorDrag) drawHull(ctx, state.analysis.hull, view);
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

  function drawHandles(ctx, child, view) {
    var corners = M.transformedFrame(state.rule.frame, child.matrix).map(view.point, view);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = css('--accent'); ctx.lineWidth = 1.4;
    corners.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    if (state.rule.toggles.stretch) {
      for (var i = 0; i < corners.length; i++) {
        var q = corners[(i + 1) % corners.length], p = corners[i], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        ctx.fillStyle = css('--cyan'); ctx.fillRect(mid[0] - 3.5, mid[1] - 3.5, 7, 7);
      }
    }
  }

  function renderEditor() {
    var info = prepareCanvas(el.ruleEditor), ctx = info.ctx;
    ctx.fillStyle = css('--paper'); ctx.fillRect(0, 0, info.width, info.height);
    // The editor keeps its view during a drag, so the frame stays under the pointer.
    var view = state.editorDrag && state.editorView ? state.editorView : makeView(info.width, info.height, editorBounds(), 13, null); state.editorView = view;
    var parent = M.framePolygon(state.rule.frame).map(view.point, view);
    path(ctx, parent); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash(state.rule.mode === 'free' ? [6, 5] : []); ctx.stroke(); ctx.setLineDash([]);
    if (state.rule.mode !== 'free') drawEditorGrid(ctx, view);
    currentLetter().children.forEach(function (child, index) {
      var selected = child.id === state.selectedId, item = { letter: child.letter, matrix: child.matrix, path: index.toString(36) };
      drawInstance(ctx, item, view, { letterThreshold: 5, lineWidth: selected ? 2.6 : 1.2, stroke: selected ? '#ffffff' : itemColour(item), alpha: selected ? 1 : .83 });
    });
    // Handles go on top of every child, so a covered child can still be resized.
    var chosen = selectedChild();
    if (chosen && state.rule.mode === 'free') drawHandles(ctx, chosen, view);
  }

  function updateAnalysis() {
    state.analysis = M.analyse(state.rule, state.currentLetter, state.limits.analysisDepth,
      { maxInstances: state.limits.maxInstances, hullIterations: state.limits.hullIterations, maxMs: state.limits.maxMs });
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
    if (topColourOn()) {
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
    state.currentLetter = id; state.selectedId = null; state.focus = 'parent';
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
    drawInstance(ctx, { letter: letter, matrix: matrix }, view, { letterThreshold: 0, lineWidth: 1.2, alpha: 1 });
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
    var workspace = document.querySelector('.workspace');
    try {
      var saved = JSON.parse(localStorage.getItem('fractal-panels') || 'null');
      if (saved && saved.left) workspace.style.setProperty('--left-w', saved.left + 'px');
      if (saved && saved.right) workspace.style.setProperty('--right-w', saved.right + 'px');
    } catch (error) {}
    [['left', el.dividerLeft], ['right', el.dividerRight]].forEach(function (pair) {
      var side = pair[0], handle = pair[1];
      function width(name) { return parseFloat(getComputedStyle(workspace).getPropertyValue(name)) || 0; }
      function set(px) {
        var rect = workspace.getBoundingClientRect(), other = width(side === 'left' ? '--right-w' : '--left-w');
        px = Math.max(180, Math.min(px, 560, rect.width - other - 320));
        workspace.style.setProperty(side === 'left' ? '--left-w' : '--right-w', Math.round(px) + 'px');
      }
      function save() {
        try { localStorage.setItem('fractal-panels', JSON.stringify({ left: width('--left-w'), right: width('--right-w') })); } catch (error) {}
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
    if (state.rule.toggles.stretch) return [m[0], m[1], m[2], m[3], m[4], m[5]];
    var sv = M.singularValues(m), angle = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    return [m[4], m[5], (sv[0] + sv[1]) / 2, angle, M.determinant(m) < 0 ? 1 : 0];
  }

  function tableHeaders() {
    if (state.rule.mode === 'square') return ['Parent', 'Row', 'Col', 'Turn', 'Flip'];
    if (state.rule.mode === 'triangle') return ['Parent', 'i', 'j', 'Point', 'Turn', 'Flip'];
    if (state.rule.toggles.stretch) return ['Parent', 'a', 'b', 'c', 'd', 'x', 'y'];
    return ['Parent', 'x', 'y', 'Scale', 'Angle', 'Flip'];
  }

  // The children list, in drawing order: the first child is drawn first, so
  // it sits at the back, and the last sits in front. Drag a row's grip to
  // reorder. In Free mode the pencil opens a pop-up to set exact values.
  function renderNumbers() {
    var headers = tableHeaders(), free = state.rule.mode === 'free';
    el.numbersHead.innerHTML = '<th aria-label="Reorder"></th>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + (free ? '<th aria-label="Edit"></th>' : '');
    el.numbersBody.innerHTML = '';
    el.numbersKind.textContent = 'back to front';
    currentLetter().children.forEach(function (child, index) {
      var row = document.createElement('tr'); if (child.id === state.selectedId) row.className = 'selected';
      var grip = document.createElement('td'); grip.className = 'grip'; grip.textContent = '⠿'; grip.title = 'Drag to reorder'; row.appendChild(grip);
      var first = document.createElement('td'); first.className = 'child-number'; first.textContent = label(child.letter); first.style.setProperty('--dot', colour(child.letter)); row.appendChild(first);
      childValues(child).forEach(function (value) {
        var cell = document.createElement('td'); cell.textContent = typeof value === 'number' ? formatNumber(value, 3) : value; row.appendChild(cell);
      });
      if (free) {
        var editCell = document.createElement('td'), edit = document.createElement('button');
        edit.type = 'button'; edit.className = 'edit-child'; edit.setAttribute('aria-label', 'Edit child ' + (index + 1)); edit.title = 'Edit values';
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
    var headers = tableHeaders().slice(1), values = childValues(child), stretch = !!state.rule.toggles.stretch;
    el.editTitle.textContent = 'Child ' + (currentLetter().children.indexOf(child) + 1) + ' (copy of parent ' + label(child.letter) + ')';
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
    if (state.rule.toggles.stretch) child.matrix = values.slice(0, 6);
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
    el.selectionName.textContent = child ? (children.indexOf(child) + 1) + ' of ' + children.length : '';
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
    var grid = gridFor(state.currentLetter); el.gridRows.value = grid.rows; el.gridCols.value = grid.cols;
    el.gridFields.hidden = state.rule.mode === 'free'; el.colsField.hidden = state.rule.mode === 'triangle';
    el.toggleTopColour.checked = topColourOn();
    el.toggleStretch.checked = !!state.rule.toggles.stretch;
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

  // Rotate and flip act as the child looks on screen, about its centre.
  // Rotate R turns clockwise. Flip H mirrors left to right, Flip V top to
  // bottom. A triangle turns by 120 degrees. Triangle mode has no Flip V,
  // because it would turn an upright cell into a downward one.
  function frameCentre() { return state.rule.frame === 'triangle' ? [0.5, M.TRI_H * 2 / 3] : [.5, .5]; }
  function tidy(m) { return m.map(function (v) { var r = Math.round(v * 1e9) / 1e9; return Math.abs(v - r) < 1e-12 ? r : v; }); }
  function screenOp(action, centre) {
    var q = state.rule.frame === 'triangle' ? Math.PI * 2 / 3 : Math.PI / 2, c = Math.cos(q), s = Math.sin(q), l;
    if (action === 'rotateRight') l = [c, s, -s, c];
    else if (action === 'rotateLeft') l = [c, -s, s, c];
    else if (action === 'flipH') l = [-1, 0, 0, 1];
    else l = [1, 0, 0, -1];
    return [l[0], l[1], l[2], l[3], centre[0] - l[0] * centre[0] - l[2] * centre[1], centre[1] - l[1] * centre[0] - l[3] * centre[1]];
  }
  function orientMatrix(matrix, action) { return tidy(M.compose(screenOp(action, M.apply(matrix, frameCentre())), matrix)); }

  function orient(action) {
    if (action === 'flipV' && state.rule.mode === 'triangle') return;
    var child = selectedChild();
    if (!child) { state.brush = orientMatrix(state.brush, action); renderBrushPreview(); return; }
    if (state.rule.mode === 'square') {
      // A grid child keeps its cell and changes its placement in it.
      var t = child.turn || 0;
      if (action === 'rotateRight') t += 1; else if (action === 'rotateLeft') t += 3;
      else { t = action === 'flipH' ? 4 - t : 6 - t; child.flip = !child.flip; }
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
  // an entry is { name, savedAt, rule, current, level, colourByTopCopy }.
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
      level: state.depth, colourByTopCopy: state.topColour };
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
    state.depth = Math.max(1, Math.min(12, entry.level || state.depth));
    state.topColour = typeof entry.colourByTopCopy === 'boolean' ? entry.colourByTopCopy : null;
    state.demo = null; state.savedName = entry.name; state.camera = { zoom: 1, x: 0, y: 0 };
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
  var HANDLE_REACH = 14;
  function handleAt(point, child) {
    var view = state.editorView, pointer = view.point(point), cornersWorld = M.transformedFrame(state.rule.frame, child.matrix), corners = cornersWorld.map(view.point, view);
    // A handle catches the pointer within HANDLE_REACH pixels on any side,
    // inside or outside the frame. The nearest handle wins.
    var best = null, bestDistance = HANDLE_REACH;
    for (var i = 0; i < corners.length; i++) {
      var dc = distance(pointer, corners[i]);
      if (dc < bestDistance) { best = { type: 'corner', index: i, corners: cornersWorld }; bestDistance = dc; }
      if (!state.rule.toggles.stretch) continue;
      var q = corners[(i + 1) % corners.length], mid = [(corners[i][0] + q[0]) / 2, (corners[i][1] + q[1]) / 2], ds = distance(pointer, mid);
      if (ds < bestDistance) { best = { type: 'side', index: i, corners: cornersWorld }; bestDistance = ds; }
    }
    return best;
  }

  function snapCorner(anchor, pointer, originalLength) {
    var dx = pointer[0] - anchor[0], dy = pointer[1] - anchor[1], length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    var snappedAngle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
    if (Math.abs(angle - snappedAngle) < .035) angle = snappedAngle;
    var ratio = length / Math.max(M.EPS, originalLength), simple = [1/4, 1/3, 1/2, 2/3, 3/4, 1, 4/3, 3/2, 2];
    simple.forEach(function (candidate) { if (Math.abs(ratio - candidate) < .025) ratio = candidate; });
    length = originalLength * ratio; return [anchor[0] + Math.cos(angle) * length, anchor[1] + Math.sin(angle) * length];
  }

  // A press first tries the selected child's handles, which sit above every
  // child. Otherwise it takes the topmost child under the pointer.
  function startEditorPointer(event) {
    var point = editorPoint(event);
    state.focus = 'child';
    if (state.rule.mode !== 'free') {
      var cellHit = findChildAt(point);
      if (cellHit) { state.selectedId = cellHit.id; syncControls(); renderEditor(); } else addGridChild(point);
      return;
    }
    var current = selectedChild(), handle = current ? handleAt(point, current) : null, hit = handle ? current : findChildAt(point);
    if (!hit) { state.selectedId = null; syncControls(); renderEditor(); return; }
    state.selectedId = hit.id; syncControls(); renderEditor();
    state.editorDrag = { pointer: event.pointerId, child: hit, start: point, matrix: hit.matrix.slice(), handle: handle, mainBounds: state.lastMainBounds, moved: false };
    state.dragging = true; el.ruleEditor.setPointerCapture(event.pointerId); event.preventDefault();
  }

  function moveEditorPointer(event) {
    var drag = state.editorDrag; if (!drag || drag.pointer !== event.pointerId) return;
    var point = editorPoint(event), m = drag.matrix.slice();
    if (!drag.handle) { m[4] += point[0] - drag.start[0]; m[5] += point[1] - drag.start[1]; }
    else if (drag.handle.type === 'corner') {
      var corners = drag.handle.corners, original = corners[drag.handle.index], anchor;
      if (corners.length === 3) {
        var others = corners.filter(function (_, index) { return index !== drag.handle.index; });
        anchor = [(others[0][0] + others[1][0]) / 2, (others[0][1] + others[1][1]) / 2];
      } else anchor = corners[(drag.handle.index + 2) % 4];
      point = snapCorner(anchor, point, distance(anchor, original));
      var vx = original[0] - anchor[0], vy = original[1] - anchor[1], wx = point[0] - anchor[0], wy = point[1] - anchor[1], den = vx * vx + vy * vy;
      var a = (vx * wx + vy * wy) / den, b = (vx * wy - vy * wx) / den;
      var around = [a, b, -b, a, anchor[0] - a * anchor[0] + b * anchor[1], anchor[1] - b * anchor[0] - a * anchor[1]];
      m = M.compose(around, m);
    } else {
      // A side handle moves its edge and keeps the corner after it fixed.
      // For a square that keeps the whole opposite edge fixed, so the copy
      // stretches or skews. Three corners decide any affine map.
      var local = M.framePolygon(state.rule.frame), n = local.length, k = drag.handle.index, world = drag.handle.corners;
      var a0 = world[k], a1 = world[(k + 1) % n], edgeMid = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      var dx = point[0] - edgeMid[0], dy = point[1] - edgeMid[1];
      m = M.affineFromTriangles([local[k], local[(k + 1) % n], local[(k + 2) % n]],
        [[a0[0] + dx, a0[1] + dy], [a1[0] + dx, a1[1] + dy], world[(k + 2) % n]]);
      if (!m.every(Number.isFinite) || Math.abs(M.determinant(m)) < 1e-6) return;
    }
    drag.moved = true; drag.child.matrix = m; markEdited(); renderEditor(); renderMain(); event.preventDefault();
  }

  function endEditorPointer(event) {
    if (!state.editorDrag || state.editorDrag.pointer !== event.pointerId) return;
    var moved = state.editorDrag.moved; state.editorDrag = null; state.dragging = false;
    if (moved) commit(); else { renderEditor(); renderMain(); }
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
      if (!demos[el.demo.value]) return; state.demo = el.demo.value; state.rule = M.clone(demos[state.demo]); state.currentLetter = state.rule.letters[0].id; state.selectedId = null; state.focus = 'child'; state.brush = M.identity(); state.depth = PRESETS.balanced.depth; state.limits = sanitiseLimits(PRESETS.balanced); state.preset = 'balanced'; state.showHull = true; state.topColour = null; state.savedName = null; state.newLetter = null; state.camera = { zoom: 1, x: 0, y: 0 }; commit();
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
    el.gridRows.addEventListener('change', function () { var rows = Number(el.gridRows.value); setGrid(rows, state.rule.toggles.stretch ? Number(el.gridCols.value) : rows); markEdited(); commit(); });
    el.gridCols.addEventListener('change', function () { setGrid(Number(el.gridRows.value), Number(el.gridCols.value)); markEdited(); commit(); });
    el.toggleTopColour.addEventListener('change', function () { state.topColour = el.toggleTopColour.checked; renderPalette(); renderEditor(); renderIterations(); renderMain(); saveAddress(); });
    el.depth.addEventListener('input', function () { state.depth = Number(el.depth.value); el.depthValue.textContent = state.depth; state.dragging = true; setCustom(); syncLimitControls(); renderMain(); });
    el.depth.addEventListener('change', function () { state.dragging = false; updateAnalysis(); renderReadouts(); renderMain(); saveAddress(); });
    [['stretch', el.toggleStretch], ['stacking', el.toggleStacking], ['gridPerLetter', el.togglePerLetter]].forEach(function (pair) {
      pair[1].addEventListener('change', function () {
        state.rule.toggles[pair[0]] = pair[1].checked;
        if (pair[0] === 'stretch' && !pair[1].checked) state.rule.grid.cols = state.rule.grid.rows;
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
    var observer = new ResizeObserver(function () { renderEditor(); renderIterations(); renderMain(); }); observer.observe(document.querySelector('.workspace'));
  }

  function collectElements() {
    ['demo','rule-name','mode-row','letter-tabs','add-letter','duplicate-letter','remove-letter','undo','redo','divider-left','divider-right','rule-editor','selection-heading','selection-name','brush-preview','rotate-left','rotate-right','flip-h','flip-v','add-child','duplicate-child','remove-child','child-letters','save-name','save-fractal','library-list','library-empty','export-fractal','export-all','import-fractal','import-file','numbers-kind','numbers-head','numbers-body','edit-dialog','edit-form','edit-title','edit-fields','limit','main-stage','grid-fields','grid-rows','grid-cols','cols-field','toggle-top-colour','palette-label','depth','depth-value','toggle-menu','toggle-popover','toggle-stretch','toggle-stacking','toggle-per-letter','min-depth','min-depth-value','max-copies','max-copies-value','min-scale','min-scale-value','max-time','max-time-value','analysis-depth','analysis-depth-value','hull-iterations','palette-key','zoom-out','zoom-in','home-view','toggle-hull','notice','instance-count','status-badge','status-detail','dimension','dimension-value','box-dimension','overlap','hull-corners','hull-area','explanation-text','copy-link','fullscreen'].forEach(function (id) {
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
