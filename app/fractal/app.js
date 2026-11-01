(function () {
  'use strict';

  var M = window.FractalModel;
  var PALETTE = ['#e9b44c', '#59c3b5', '#dc6f82', '#8297e8', '#d98fd0', '#7fc66c', '#f28b54', '#a68bd7', '#57a9d8', '#d2c65e'];
  var DEMO_NAMES = { sieve: 'Sierpinski sieve', linked: 'Linked F + R', free: 'Free placement', blankSquare: 'Blank square rule', blankTriangle: 'Blank triangle rule' };
  var EXPLANATIONS = {
    sieve: 'Three half-size copies leave the top-right quarter empty. Repeating that rule makes the right-angled Sierpinski triangle.',
    linked: 'F makes one F and one R. R makes one F and two Rs. The letters share one limit through a linked rule.',
    free: 'Three freely placed copies show continuous position, angle, scale, and reflection. The dashed frame is their parent.',
    blankSquare: 'Tap square cells to build a new rule.',
    blankTriangle: 'Tap upright or downward triangle cells to build a new rule.'
  };
  var demos = M.demos();
  demos.blankSquare = M.baseRule('square', 'square', [{ id: 'F', children: [] }]);
  demos.blankTriangle = M.baseRule('triangle', 'triangle', [{ id: 'F', children: [] }]);
  var COPY_VALUES = [1000, 2500, 5000, 10000, 25000, 60000, 120000, 180000, 250000];
  var SCALE_VALUES = [0, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1];
  var TIME_VALUES = [25, 50, 100, 150, 250, 500, 1000, 1500, 2000];
  var PRESETS = {
    fast: { depth: 6, minDepth: 3, maxInstances: 10000, minScale: 1e-3, maxMs: 100, analysisDepth: 5, hullIterations: 16 },
    balanced: { depth: 7, minDepth: 4, maxInstances: 60000, minScale: 1e-4, maxMs: 250, analysisDepth: 7, hullIterations: 32 },
    detailed: { depth: 10, minDepth: 5, maxInstances: 120000, minScale: 0, maxMs: 1000, analysisDepth: 9, hullIterations: 64 }
  };
  var el = {};
  var state = {
    rule: M.clone(demos.sieve), demo: 'sieve', currentLetter: 'F', startLetter: 'F', selectedId: null,
    depth: 7, showHull: true, camera: { zoom: 1, x: 0, y: 0 }, dragging: false,
    limits: Object.assign({}, PRESETS.balanced), preset: 'balanced',
    analysis: null, editorView: null, noticeTimer: null
  };

  function $(id) { return document.getElementById(id); }
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
    return rule && rule.version === 1 && ['square', 'triangle'].indexOf(rule.frame) >= 0 &&
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
        state.rule = saved.rule; state.demo = null; state.startLetter = saved.start || state.rule.letters[0].id;
        state.currentLetter = saved.current || state.startLetter; state.depth = Math.max(1, Math.min(12, saved.depth || 7));
        state.showHull = saved.hull !== false;
        if (saved.camera) state.camera = saved.camera;
        if (saved.limits) state.limits = sanitiseLimits(saved.limits);
        state.preset = matchingPreset();
      }
    } catch (error) {
      state.rule = M.clone(demos.sieve); state.demo = 'sieve';
      setTimeout(function () { notice('That address did not contain a valid rule. The Sieve opened instead.'); }, 0);
    }
    if (!letterById(state.currentLetter)) state.currentLetter = state.rule.letters[0].id;
    if (!letterById(state.startLetter)) state.startLetter = state.rule.letters[0].id;
  }

  function saveAddress() {
    var hash;
    if (state.demo && sameRule(state.rule, demos[state.demo]) && matchingPreset() === 'balanced' && state.showHull && state.camera.zoom === 1 && !state.camera.x && !state.camera.y) {
      hash = 'demo=' + state.demo;
    } else {
      hash = 'rule=' + encode({ rule: state.rule, start: state.startLetter, current: state.currentLetter, depth: state.depth,
        hull: state.showHull, camera: state.camera, limits: state.limits });
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
    cols = state.rule.toggles.stretch ? Math.max(2, Math.min(5, Math.round(cols || rows))) : rows;
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
    if (state.rule.frame !== targetFrame) state.rule.frame = targetFrame;
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
    if (fillSmall || options.fill) { ctx.fillStyle = colour(item.letter); ctx.fill(); }
    else { ctx.fillStyle = colour(item.letter) + '28'; ctx.fill(); }
    ctx.strokeStyle = options.stroke || colour(item.letter); ctx.lineWidth = options.lineWidth || 1; ctx.stroke();
    if (!fillSmall && options.letters !== false) {
      ctx.transform(scale * matrix[0], scale * matrix[1], scale * matrix[2], scale * matrix[3], tx + scale * matrix[4], ty + scale * matrix[5]);
      ctx.fillStyle = colour(item.letter); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 .42px Georgia, serif';
      var centre = state.rule.frame === 'triangle' ? [0.5, M.TRI_H * .63] : [0.5, .53];
      ctx.fillText(item.letter, centre[0], centre[1]);
      ctx.beginPath(); ctx.arc(state.rule.frame === 'triangle' ? .5 : .1, state.rule.frame === 'triangle' ? .1 : .1, .035, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawHull(ctx, hull, view) {
    if (!hull || hull.length < 2) return;
    path(ctx, hull.map(view.point, view)); ctx.strokeStyle = '#f5f0dc'; ctx.lineWidth = 1.3; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  function renderIterations() {
    document.querySelectorAll('#iteration-strip canvas').forEach(function (canvas) {
      var level = Number(canvas.dataset.level), info = prepareCanvas(canvas);
      info.ctx.fillStyle = '#11151b'; info.ctx.fillRect(0, 0, info.width, info.height);
      var instances = level ? M.enumerate(state.rule, state.startLetter, level, 12000) : [{ letter: state.startLetter, matrix: M.identity() }];
      if (!instances.length) return;
      var view = makeView(info.width, info.height, instancesBounds(instances, state.rule.frame), 12, null);
      instances.forEach(function (item) { drawInstance(info.ctx, item, view, { letterThreshold: 7, lineWidth: .7 }); });
    });
  }

  function mainInstances() {
    var depth = Math.max(0, state.depth - (state.dragging ? 2 : 0));
    var options = { maxInstances: state.limits.maxInstances, maxMs: state.limits.maxMs,
      minScale: state.limits.minScale, minDepth: Math.min(state.limits.minDepth, depth) };
    if (state.analysis && state.analysis.status.name !== 'Converges') {
      var combined = [], reason = null;
      for (var level = Math.max(0, Math.min(depth, 4) - 3); level <= Math.min(depth, 4); level++) {
        var remaining = Math.max(1, state.limits.maxInstances - combined.length);
        var levelOptions = Object.assign({}, options, { maxInstances: remaining, minDepth: Math.min(options.minDepth, level) });
        var items = level ? M.expand(state.rule, state.startLetter, level, levelOptions) : [{ letter: state.startLetter, matrix: M.identity(), level: 0 }];
        reason = items.stoppedBy || reason;
        items.forEach(function (item) { item.level = level; combined.push(item); });
        if (combined.length >= state.limits.maxInstances) { reason = 'copies'; break; }
      }
      combined.stoppedBy = reason || 'iterations';
      return combined;
    }
    return depth ? M.expand(state.rule, state.startLetter, depth, options) : [{ letter: state.startLetter, matrix: M.identity(), level: 0 }];
  }

  function renderMain() {
    var info = prepareCanvas(el.limit), ctx = info.ctx;
    ctx.fillStyle = css('--stage'); ctx.fillRect(0, 0, info.width, info.height);
    var instances = mainInstances();
    if (!instances.length) {
      ctx.fillStyle = '#89939d'; ctx.textAlign = 'center'; ctx.font = '14px Georgia, serif'; ctx.fillText('This letter has no children.', info.width / 2, info.height / 2); return;
    }
    var b = state.analysis && state.analysis.bounds ? state.analysis.bounds : instancesBounds(instances, state.rule.frame);
    if (state.analysis && state.analysis.status.name !== 'Converges') b = instancesBounds(instances, state.rule.frame);
    var view = makeView(info.width, info.height, b, 42, state.camera);
    instances.forEach(function (item) {
      var alpha = item.level == null ? .93 : .22 + .18 * item.level;
      drawInstance(ctx, item, view, { letterThreshold: 8, lineWidth: .65, alpha: alpha });
    });
    if (state.showHull && state.analysis && state.analysis.status.name === 'Converges') drawHull(ctx, state.analysis.hull, view);
    var reason = { copies: 'copy limit', time: 'time limit', scale: 'scale limit', iterations: 'iteration limit' }[instances.stoppedBy];
    el.instanceCount.textContent = instances.length.toLocaleString() + (instances.length === 1 ? ' copy' : ' copies') + (reason ? ' · ' + reason : '');
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
    var b = editorBounds(), view = makeView(info.width, info.height, b, 13, null); state.editorView = view;
    var parent = M.framePolygon(state.rule.frame).map(view.point, view);
    path(ctx, parent); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.2; ctx.setLineDash(state.rule.mode === 'free' ? [6, 5] : []); ctx.stroke(); ctx.setLineDash([]);
    if (state.rule.mode !== 'free') drawEditorGrid(ctx, view);
    currentLetter().children.forEach(function (child) {
      var selected = child.id === state.selectedId;
      drawInstance(ctx, { letter: child.letter, matrix: child.matrix }, view, { letterThreshold: 5, lineWidth: selected ? 2.6 : 1.2, stroke: selected ? '#ffffff' : colour(child.letter), alpha: selected ? 1 : .83 });
      if (selected && state.rule.mode === 'free') drawHandles(ctx, child, view);
    });
  }

  function updateAnalysis() {
    state.analysis = M.analyse(state.rule, state.startLetter, state.limits.analysisDepth,
      { maxInstances: state.limits.maxInstances, hullIterations: state.limits.hullIterations, maxMs: state.limits.maxMs });
  }

  function formatNumber(value, digits) { return value == null || !isFinite(value) ? '—' : Number(value).toFixed(digits == null ? 3 : digits).replace(/\.000$/, ''); }

  function scaleLabel(value) {
    if (!value) return 'Unlimited';
    return '1/' + Math.round(1 / value).toLocaleString();
  }

  function syncLimitControls() {
    state.preset = matchingPreset();
    document.querySelectorAll('[data-preset]').forEach(function (button) { button.classList.toggle('active', button.dataset.preset === state.preset); });
    el.minDepth.value = state.limits.minDepth; el.minDepthValue.textContent = state.limits.minDepth;
    el.maxCopies.value = COPY_VALUES.indexOf(state.limits.maxInstances); el.maxCopiesValue.textContent = state.limits.maxInstances.toLocaleString();
    el.minScale.value = SCALE_VALUES.indexOf(state.limits.minScale); el.minScaleValue.textContent = scaleLabel(state.limits.minScale);
    el.maxTime.value = TIME_VALUES.indexOf(state.limits.maxMs); el.maxTimeValue.textContent = state.limits.maxMs.toLocaleString() + ' ms';
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
    el.explanationText.textContent = state.demo ? EXPLANATIONS[state.demo] : 'The selected letter expands through the linked affine rule. Change a child to see every view and measurement update.';
  }

  function renderPalette() {
    el.paletteKey.innerHTML = '';
    state.rule.letters.forEach(function (letter) { var dot = document.createElement('i'); dot.style.background = colour(letter.id); dot.title = letter.id; el.paletteKey.appendChild(dot); });
  }

  function renderLetterControls() {
    el.letterTabs.innerHTML = ''; el.childLetter.innerHTML = ''; el.startLetter.innerHTML = '';
    state.rule.letters.forEach(function (letter) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'letter-tab' + (letter.id === state.currentLetter ? ' active' : '');
      button.textContent = letter.id; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', letter.id === state.currentLetter);
      button.addEventListener('click', function () { state.currentLetter = letter.id; state.selectedId = null; syncControls(); renderEditor(); saveAddress(); });
      el.letterTabs.appendChild(button);
      [el.childLetter, el.startLetter].forEach(function (select) { var option = document.createElement('option'); option.value = letter.id; option.textContent = letter.id; select.appendChild(option); });
    });
    el.startLetter.value = state.startLetter;
  }

  function childValues(child) {
    var m = child.matrix;
    if (state.rule.mode !== 'free') {
      if (state.rule.mode === 'square') return [child.cell.row + 1, child.cell.col + 1, child.turn || 0, child.flip ? 1 : 0, child.blockRows || child.block || 1, child.blockCols || child.block || 1];
      return [child.cell.i, child.cell.j, child.cell.down ? 'down' : 'up', child.turn || 0, child.flip ? 1 : 0, child.blockRows || child.block || 1];
    }
    if (state.rule.toggles.stretch) return [m[0], m[1], m[2], m[3], m[4], m[5]];
    var sv = M.singularValues(m), angle = Math.atan2(m[1], m[0]) * 180 / Math.PI;
    return [m[4], m[5], (sv[0] + sv[1]) / 2, angle, M.determinant(m) < 0 ? 1 : 0];
  }

  function tableHeaders() {
    if (state.rule.mode === 'square') return ['Child', 'Row', 'Col', 'Turn', 'Flip', 'Block r', 'Block c'];
    if (state.rule.mode === 'triangle') return ['Child', 'i', 'j', 'Point', 'Turn', 'Flip', 'Block'];
    if (state.rule.toggles.stretch) return ['Child', 'a', 'b', 'c', 'd', 'x', 'y'];
    return ['Child', 'x', 'y', 'Scale', 'Angle', 'Flip'];
  }

  function renderNumbers() {
    var headers = tableHeaders(); el.numbersHead.innerHTML = headers.map(function (h) { return '<th>' + h + '</th>'; }).join(''); el.numbersBody.innerHTML = '';
    el.numbersKind.textContent = state.rule.mode === 'free' ? (state.rule.toggles.stretch ? 'affine matrix' : 'position · scale · angle') : 'exact grid placement';
    currentLetter().children.forEach(function (child) {
      var row = document.createElement('tr'); if (child.id === state.selectedId) row.className = 'selected';
      var first = document.createElement('td'); first.textContent = child.letter; first.addEventListener('click', function () { state.selectedId = child.id; syncControls(); renderEditor(); }); row.appendChild(first);
      childValues(child).forEach(function (value, index) {
        var cell = document.createElement('td'), input = document.createElement('input'); input.value = typeof value === 'number' ? formatNumber(value, 5) : value;
        input.disabled = state.rule.mode !== 'free'; input.dataset.index = index;
        input.addEventListener('change', function () { updateChildFromTable(child, index, input.value); }); cell.appendChild(input); row.appendChild(cell);
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

  function updateChildFromTable(child, index, text) {
    var value = parseNumber(text); if (!isFinite(value)) { notice('Use a number, a fraction such as 1/3, or a square root such as √2/2.'); renderNumbers(); return; }
    if (state.rule.toggles.stretch) child.matrix[index] = value;
    else {
      var values = childValues(child).map(Number); values[index] = value;
      var x = values[0], y = values[1], scale = Math.max(.001, Math.abs(values[2])), angle = values[3] * Math.PI / 180, flip = !!Math.round(values[4]);
      var rotation = [scale * Math.cos(angle), scale * Math.sin(angle), -scale * Math.sin(angle), scale * Math.cos(angle), x, y];
      child.matrix = flip ? M.compose(rotation, [-1, 0, 0, 1, 1, 0]) : rotation;
    }
    markEdited(); commit();
  }

  function syncSelection() {
    var child = selectedChild(), disabled = !child;
    [el.turnChild, el.flipChild, el.removeChild, el.childLetter, el.blockSize, el.blockCols].forEach(function (control) { control.disabled = disabled; });
    el.selectionName.textContent = child ? child.letter + ' · ' + (currentLetter().children.indexOf(child) + 1) : 'None';
    if (child) {
      el.childLetter.value = child.letter; el.blockSize.value = child.blockRows || child.block || 1; el.blockCols.value = child.blockCols || child.block || 1;
    }
    var grid = state.rule.mode !== 'free';
    el.turnChild.hidden = false; el.flipChild.hidden = false;
    el.blockField.hidden = !grid || !state.rule.toggles.blocks;
    el.blockColsField.hidden = !grid || !state.rule.toggles.blocks || state.rule.mode === 'triangle' || !state.rule.toggles.stretch;
  }

  function syncControls() {
    el.ruleName.textContent = state.demo ? DEMO_NAMES[state.demo] : 'Custom rule';
    el.demo.value = state.demo || '';
    el.mode.value = state.rule.mode; el.depth.value = state.depth; el.depthValue.textContent = state.depth;
    var grid = gridFor(state.currentLetter); el.gridRows.value = grid.rows; el.gridCols.value = grid.cols;
    el.gridRows.disabled = state.rule.mode === 'free'; el.gridCols.disabled = state.rule.mode === 'free' || !state.rule.toggles.stretch || state.rule.mode === 'triangle';
    el.colsField.hidden = state.rule.mode === 'triangle' || !state.rule.toggles.stretch;
    el.toggleStretch.checked = !!state.rule.toggles.stretch; el.toggleBlocks.checked = !!state.rule.toggles.blocks;
    el.toggleStacking.checked = !!state.rule.toggles.stacking; el.togglePerLetter.checked = !!state.rule.toggles.gridPerLetter;
    el.toggleBlocks.disabled = state.rule.mode === 'free'; el.toggleStacking.disabled = state.rule.mode === 'free'; el.togglePerLetter.disabled = state.rule.mode === 'free';
    el.editorHint.textContent = state.rule.mode === 'free' ? 'Drag a frame or one of its handles.' : 'Tap an empty cell to add a child.';
    el.toggleHull.setAttribute('aria-pressed', state.showHull ? 'true' : 'false');
    syncLimitControls(); renderLetterControls(); syncSelection(); renderNumbers(); renderPalette();
  }

  function commit() {
    rebuildGridChildren(); updateAnalysis(); syncControls(); renderReadouts(); renderEditor(); renderIterations(); renderMain(); saveAddress();
  }

  function selectedAction(action) {
    var child = selectedChild(); if (!child) return;
    if (action === 'turn') child.turn = ((child.turn || 0) + 1) % (state.rule.frame === 'triangle' ? 3 : 4);
    if (action === 'flip') child.flip = !child.flip;
    if (state.rule.mode === 'free') {
      if (action === 'turn') {
        var angle = state.rule.frame === 'triangle' ? Math.PI * 2 / 3 : Math.PI / 2;
        var centre = state.rule.frame === 'triangle' ? [0.5, M.TRI_H * 2 / 3] : [.5, .5];
        var world = M.apply(child.matrix, centre), rot = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
        rot[4] = world[0] - rot[0] * world[0] - rot[2] * world[1]; rot[5] = world[1] - rot[1] * world[0] - rot[3] * world[1]; child.matrix = M.compose(rot, child.matrix);
      } else child.matrix = M.compose(child.matrix, [-1, 0, 0, 1, 1, 0]);
    }
    markEdited(); commit();
  }

  function addLetter() {
    var id = M.nextLetter(state.rule); state.rule.letters.push({ id: id, children: [] });
    if (state.rule.toggles.gridPerLetter) state.rule.grid.perLetter[id] = { rows: state.rule.grid.rows, cols: state.rule.grid.cols };
    state.currentLetter = id; state.selectedId = null; markEdited(); commit();
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
      meta = { cell: { row: row, col: col }, turn: 0, flip: false, blockRows: 1, blockCols: 1 };
      map = M.squareGridMap(meta.cell, grid.rows, grid.cols);
    } else {
      var cell = M.triangleCells(grid.rows).find(function (item) { return pointInPolygon(point, item.vertices); }); if (!cell) return;
      meta = { cell: { i: cell.i, j: cell.j, down: cell.down }, turn: 0, flip: false, blockRows: 1, blockCols: 1 };
      map = M.triangleGridMap(cell, 0, false, 1);
    }
    var occupied = letter.children.find(function (child) { return JSON.stringify(child.cell) === JSON.stringify(meta.cell); });
    if (occupied && !state.rule.toggles.stacking) { state.selectedId = occupied.id; syncControls(); renderEditor(); return; }
    var newChild = M.child(state.currentLetter, map, meta); letter.children.push(newChild); state.selectedId = newChild.id; markEdited(); commit();
  }

  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function handleAt(point, child) {
    var view = state.editorView, pointer = view.point(point), cornersWorld = M.transformedFrame(state.rule.frame, child.matrix), corners = cornersWorld.map(view.point, view);
    for (var i = 0; i < corners.length; i++) if (distance(pointer, corners[i]) < 11) return { type: 'corner', index: i, corners: cornersWorld };
    if (state.rule.toggles.stretch && state.rule.frame === 'square') for (i = 0; i < corners.length; i++) {
      var q = corners[(i + 1) % corners.length], mid = [(corners[i][0] + q[0]) / 2, (corners[i][1] + q[1]) / 2];
      if (distance(pointer, mid) < 11) return { type: 'side', index: i, corners: cornersWorld };
    }
    return null;
  }

  function snapCorner(anchor, pointer, originalLength) {
    var dx = pointer[0] - anchor[0], dy = pointer[1] - anchor[1], length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    var snappedAngle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12;
    if (Math.abs(angle - snappedAngle) < .035) angle = snappedAngle;
    var ratio = length / Math.max(M.EPS, originalLength), simple = [1/4, 1/3, 1/2, 2/3, 3/4, 1, 4/3, 3/2, 2];
    simple.forEach(function (candidate) { if (Math.abs(ratio - candidate) < .025) ratio = candidate; });
    length = originalLength * ratio; return [anchor[0] + Math.cos(angle) * length, anchor[1] + Math.sin(angle) * length];
  }

  function startEditorPointer(event) {
    var point = editorPoint(event), hit = findChildAt(point);
    if (state.rule.mode !== 'free') {
      if (hit) { state.selectedId = hit.id; syncControls(); renderEditor(); } else addGridChild(point);
      return;
    }
    if (!hit) { state.selectedId = null; syncControls(); renderEditor(); return; }
    state.selectedId = hit.id; syncControls(); renderEditor();
    var handle = handleAt(point, hit);
    state.editorDrag = { pointer: event.pointerId, child: hit, start: point, matrix: hit.matrix.slice(), handle: handle };
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
      var side = drag.handle.index;
      if (side === 1) { m[0] = point[0] - (m[4] + .5 * m[2]); m[1] = point[1] - (m[5] + .5 * m[3]); }
      else if (side === 3) { var right = M.apply(m, [1, .5]); m[0] = right[0] - point[0]; m[1] = right[1] - point[1]; m[4] = point[0] - .5 * m[2]; m[5] = point[1] - .5 * m[3]; }
      else if (side === 2) { m[2] = point[0] - (m[4] + .5 * m[0]); m[3] = point[1] - (m[5] + .5 * m[1]); }
      else { var bottom = M.apply(m, [.5, 1]); m[2] = bottom[0] - point[0]; m[3] = bottom[1] - point[1]; m[4] = point[0] - .5 * m[0]; m[5] = point[1] - .5 * m[1]; }
    }
    drag.child.matrix = m; markEdited(); renderEditor(); renderMain(); event.preventDefault();
  }

  function endEditorPointer(event) {
    if (!state.editorDrag || state.editorDrag.pointer !== event.pointerId) return;
    state.editorDrag = null; state.dragging = false; commit();
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
      state.camera.zoom = Math.max(.1, Math.min(20, state.mainPinch.zoom * distance(a, b) / Math.max(1, state.mainPinch.distance)));
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
    state.camera.zoom = Math.max(.1, Math.min(20, state.camera.zoom * factor));
    if (x != null) { state.camera.x = (state.camera.x - x) * factor + x; state.camera.y = (state.camera.y - y) * factor + y; }
    renderMain(); saveAddress();
  }

  function wireEvents() {
    el.demo.addEventListener('change', function () {
      if (!demos[el.demo.value]) return; state.demo = el.demo.value; state.rule = M.clone(demos[state.demo]); state.currentLetter = state.rule.letters[0].id; state.startLetter = state.currentLetter; state.selectedId = null; state.depth = PRESETS.balanced.depth; state.limits = sanitiseLimits(PRESETS.balanced); state.preset = 'balanced'; state.showHull = true; state.camera = { zoom: 1, x: 0, y: 0 }; commit();
    });
    el.addLetter.addEventListener('click', addLetter);
    el.mode.addEventListener('change', function () { if (!changeMode(el.mode.value)) el.mode.value = state.rule.mode; });
    el.startLetter.addEventListener('change', function () { state.startLetter = el.startLetter.value; updateAnalysis(); renderReadouts(); renderIterations(); renderMain(); saveAddress(); });
    el.gridRows.addEventListener('change', function () { setGrid(Number(el.gridRows.value), Number(el.gridCols.value)); markEdited(); commit(); });
    el.gridCols.addEventListener('change', function () { setGrid(Number(el.gridRows.value), Number(el.gridCols.value)); markEdited(); commit(); });
    el.depth.addEventListener('input', function () { state.depth = Number(el.depth.value); el.depthValue.textContent = state.depth; state.dragging = true; setCustom(); syncLimitControls(); renderMain(); });
    el.depth.addEventListener('change', function () { state.dragging = false; updateAnalysis(); renderReadouts(); renderMain(); saveAddress(); });
    [['stretch', el.toggleStretch], ['blocks', el.toggleBlocks], ['stacking', el.toggleStacking], ['gridPerLetter', el.togglePerLetter]].forEach(function (pair) {
      pair[1].addEventListener('change', function () {
        state.rule.toggles[pair[0]] = pair[1].checked;
        if (pair[0] === 'stretch' && !pair[1].checked) state.rule.grid.cols = state.rule.grid.rows;
        markEdited(); commit();
      });
    });
    el.toggleMenu.addEventListener('click', function () { var open = el.togglePopover.hidden; el.togglePopover.hidden = !open; el.toggleMenu.setAttribute('aria-expanded', open); });
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
    bindLimit(el.maxCopies, function () { state.limits.maxInstances = COPY_VALUES[Number(el.maxCopies.value)]; }, function () { el.maxCopiesValue.textContent = state.limits.maxInstances.toLocaleString(); }, true);
    bindLimit(el.minScale, function () { state.limits.minScale = SCALE_VALUES[Number(el.minScale.value)]; }, function () { el.minScaleValue.textContent = scaleLabel(state.limits.minScale); }, false);
    bindLimit(el.maxTime, function () { state.limits.maxMs = TIME_VALUES[Number(el.maxTime.value)]; }, function () { el.maxTimeValue.textContent = state.limits.maxMs.toLocaleString() + ' ms'; }, false);
    bindLimit(el.analysisDepth, function () { state.limits.analysisDepth = Number(el.analysisDepth.value); }, function () { el.analysisDepthValue.textContent = state.limits.analysisDepth; }, true);
    el.hullIterations.addEventListener('change', function () { state.limits.hullIterations = Number(el.hullIterations.value); setCustom(); updateAnalysis(); syncLimitControls(); renderReadouts(); renderMain(); saveAddress(); });
    el.turnChild.addEventListener('click', function () { selectedAction('turn'); }); el.flipChild.addEventListener('click', function () { selectedAction('flip'); });
    el.removeChild.addEventListener('click', removeSelected);
    el.childLetter.addEventListener('change', function () { var child = selectedChild(); if (!child) return; child.letter = el.childLetter.value; markEdited(); commit(); });
    el.blockSize.addEventListener('change', function () { var child = selectedChild(); if (!child) return; child.blockRows = Math.max(1, Number(el.blockSize.value)); if (!state.rule.toggles.stretch) child.blockCols = child.blockRows; markEdited(); commit(); });
    el.blockCols.addEventListener('change', function () { var child = selectedChild(); if (!child) return; child.blockCols = Math.max(1, Number(el.blockCols.value)); markEdited(); commit(); });
    el.ruleEditor.addEventListener('pointerdown', startEditorPointer); el.ruleEditor.addEventListener('pointermove', moveEditorPointer); el.ruleEditor.addEventListener('pointerup', endEditorPointer); el.ruleEditor.addEventListener('pointercancel', endEditorPointer);
    el.limit.addEventListener('pointerdown', startMainPointer); el.limit.addEventListener('pointermove', moveMainPointer); el.limit.addEventListener('pointerup', endMainPointer); el.limit.addEventListener('pointercancel', endMainPointer);
    el.limit.addEventListener('wheel', function (event) { var rect = el.limit.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .001), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2); event.preventDefault(); }, { passive: false });
    el.zoomIn.addEventListener('click', function () { zoom(1.25); }); el.zoomOut.addEventListener('click', function () { zoom(.8); });
    el.homeView.addEventListener('click', function () { state.camera = { zoom: 1, x: 0, y: 0 }; renderMain(); saveAddress(); });
    el.toggleHull.addEventListener('click', function () { state.showHull = !state.showHull; el.toggleHull.setAttribute('aria-pressed', state.showHull); renderMain(); saveAddress(); });
    el.copyLink.addEventListener('click', function () { navigator.clipboard.writeText(location.href).then(function () { notice('Link copied.'); }, function () { notice('Copy the address from your browser.'); }); });
    el.fullscreen.addEventListener('click', function () { var doc = document, target = document.documentElement; var request = target.requestFullscreen || target.webkitRequestFullscreen; if (request) Promise.resolve(request.call(target)).catch(function () {}); el.fullscreen.blur(); });
    document.addEventListener('keydown', function (event) {
      if (/INPUT|SELECT/.test(event.target.tagName)) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedChild()) removeSelected();
      else if (event.key.toLowerCase() === 'r' && selectedChild()) selectedAction('turn');
      else if (event.key.toLowerCase() === 'f' && selectedChild()) selectedAction('flip');
    });
    var observer = new ResizeObserver(function () { renderEditor(); renderIterations(); renderMain(); }); observer.observe(document.querySelector('.workspace'));
  }

  function collectElements() {
    ['demo','rule-name','letter-tabs','add-letter','rule-editor','editor-hint','selection-name','turn-child','flip-child','remove-child','child-letter','block-field','block-size','block-cols-field','block-cols','numbers-kind','numbers-head','numbers-body','limit','main-stage','mode','start-letter','grid-rows','grid-cols','cols-field','depth','depth-value','toggle-menu','toggle-popover','toggle-stretch','toggle-blocks','toggle-stacking','toggle-per-letter','min-depth','min-depth-value','max-copies','max-copies-value','min-scale','min-scale-value','max-time','max-time-value','analysis-depth','analysis-depth-value','hull-iterations','palette-key','zoom-out','zoom-in','home-view','toggle-hull','notice','instance-count','status-badge','status-detail','dimension','dimension-value','box-dimension','overlap','hull-corners','hull-area','explanation-text','copy-link','fullscreen'].forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); el[key] = $(id);
    });
  }

  function init() {
    collectElements();
    var custom = document.createElement('option'); custom.value = ''; custom.textContent = 'Custom rule'; el.demo.appendChild(custom);
    loadAddress(); Theme.wireThemeToggle();
    var fullscreenEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled; el.fullscreen.hidden = !fullscreenEnabled;
    wireEvents(); commit();
    document.querySelector('.theme-toggle').addEventListener('click', function () { requestAnimationFrame(function () { renderEditor(); renderIterations(); renderMain(); }); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
