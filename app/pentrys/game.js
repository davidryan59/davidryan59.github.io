/* The page: the main loop, input, the screens, settings, controls, high
   scores, the tutorial and the address. See docs/pentrys.md.

   The rules run in fixed steps of a sixtieth of a second, as many as the
   time since the last frame needs. Frames run only while something moves:
   a game in play, the main menu's own game, or an animation finishing.
   The choices, keys, high scores and lessons passed are kept in this
   browser, and the page works without them. */
(function (root) {
  'use strict';
  var P = root.Pentrys, Pieces = P.Pieces, Rules = P.Rules, Draw = P.Draw, Sound = P.Sound, Bot = P.Bot, Lessons = P.Lessons, C = P.Config;
  var STEP = 1000 / 60, STORE = 'pentrys.v1.';
  var MODES = { tutorial: 'Tutorial', easy: 'Easy', normal: 'Normal', hard: 'Hard', custom: 'Custom' };
  var DIFFICULTIES = ['easy', 'normal', 'hard'];   // the difficulties, with high scores
  function $(id) { return document.getElementById(id); }
  function load(k, d) { try { var v = root.localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { root.localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* private window: keep going */ } }
  // The layout that fits the screen. 'phone' stacks the scores, the well and
  // the buttons; 'hand', a touch screen held sideways, puts the buttons in the
  // bottom corners beside the well; 'desk' is for a keyboard.
  var coarse = root.matchMedia('(pointer: coarse)'), mode = 'desk';
  // The page's own size. On a phone innerWidth grows with anything wider than
  // the screen, so a layout sized from it never shrinks back.
  function viewport() { var de = document.documentElement; return { w: de.clientWidth, h: de.clientHeight }; }
  function pickMode() {
    var v = viewport(), cl = document.documentElement.classList;
    mode = v.w <= 640 || (coarse.matches && v.h >= v.w) ? 'phone' : coarse.matches ? 'hand' : 'desk';
    cl.toggle('phone', mode === 'phone'); cl.toggle('hand', mode === 'hand'); cl.toggle('short', mode === 'hand' && v.h < 500);
  }
  pickMode();
  function isPhone() { return mode === 'phone'; }
  function compact() { return mode !== 'desk'; }
  function isLight() { return document.documentElement.dataset.theme === 'light'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // Settings, keys and records -------------------------------------------------------

  // Custom's choices are kept apart from the rest, and start from Normal.
  var CUSTOM = { squares: 'normal', width: C.width, sizes: C.sizes.slice(), speed: C.difficulty.normal.speed, choiceRows: C.difficulty.normal.choiceRows };
  var settings = Object.assign({ hand: 'right', effects: 'full', sound: true }, load('settings', {}));
  settings.custom = Object.assign({}, CUSTOM, settings.custom || {});
  ['width', 'sizes', 'squares', 'specials'].forEach(function (k) { delete settings[k]; });   // from before Custom
  if (!Rules.SQUARES[settings.custom.squares]) settings.custom.squares = CUSTOM.squares;
  var SQUARE_SETS = [['pure', 'Pure', 'The 21 shapes and nothing else.'], ['plus', 'Plus', 'The 21 shapes, with 2s and 3s.'],
                     ['easy', 'Easy', "Every special square, at Easy's odds: more 2s, 3s, floods and bombs, and little glass."],
                     ['normal', 'Normal', "Every special square, at Normal's odds."],
                     ['hard', 'Hard', "Every special square, at Hard's odds: more glass, and fewer of the rest."]];
  function squaresName(k) { for (var i = 0; i < SQUARE_SETS.length; i++) if (SQUARE_SETS[i][0] === k) return SQUARE_SETS[i][1]; return k; }
  var ACTIONS = [
    ['left', 'Move left'], ['right', 'Move right'], ['soft', 'Soft drop'], ['hard', 'Hard drop'],
    ['cw', 'Rotate clockwise'], ['ccw', 'Rotate anticlockwise'], ['flip', 'Flip'], ['cycle', 'Cycle the queue'],
    ['pause', 'Pause'], ['restart', 'Restart'], ['sound', 'Sound on or off']
  ];
  // Two standard layouts. Right-handed moves on the arrows and turns with the
  // left hand; left-handed moves on S, D and F and turns on J, K, L and ;. Both
  // hands rest on the home row, the index fingers on the bumps of F and J.
  var LAYOUTS = {
    right: { left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'], cw: ['KeyX', 'ArrowUp'],
             ccw: ['KeyZ'], flip: ['KeyA', 'KeyF'], cycle: ['KeyC', 'ShiftLeft'], pause: ['Escape', 'KeyP'], restart: ['KeyR'], sound: ['KeyM'] },
    left: { left: ['KeyS'], right: ['KeyF'], soft: ['KeyD'], hard: ['Space'], cw: ['KeyK', 'ArrowRight'],
            ccw: ['KeyJ', 'ArrowLeft'], flip: ['KeyL', 'ArrowDown'], cycle: ['Semicolon', 'ArrowUp'], pause: ['Escape', 'KeyP'], restart: ['KeyR'], sound: ['KeyM'] }
  };
  if (!LAYOUTS[settings.hand]) settings.hand = 'right';
  function defaultKeys() { return LAYOUTS[settings.hand]; }
  var DEFAULT_TIMING = { das: 170, arr: 50, sdf: 20 };
  var saved = load('controls', {});
  var keys = {}, timing = Object.assign({}, DEFAULT_TIMING, saved.timing || {});
  ACTIONS.forEach(function (a) { keys[a[0]] = (saved.keys && saved.keys[a[0]]) ? saved.keys[a[0]].slice(0, 2) : defaultKeys()[a[0]].slice(); });
  var scores = load('scores', {}), passed = load('lessons', []), initials = load('initials', '');
  // Passed lessons are kept by title. Older visits kept the place in a list of eleven.
  var OLD_LESSONS = ['Move and drop', 'Rotate', 'Flip', 'Cycle', 'Twos', 'Threes', 'Spare', 'Glass', 'Flood', 'Pentrys', 'Hextrys'];
  passed = passed.map(function (p) { return typeof p === 'number' ? OLD_LESSONS[p] : p; }).filter(Boolean);

  function sameKeys(layout) { return ACTIONS.every(function (a) { return keys[a[0]].join() === layout[a[0]].join(); }); }
  function handOf() { return sameKeys(LAYOUTS.right) ? 'right' : sameKeys(LAYOUTS.left) ? 'left' : 'custom'; }
  function setHand(h) {
    settings.hand = h; save('settings', settings);
    ACTIONS.forEach(function (a) { keys[a[0]] = LAYOUTS[h][a[0]].slice(); });
    saveControls();
  }
  // A lesson's words, with the player's own keys put in for {left}, {cw} and so on.
  function keyText(text) {
    return text.replace(/\{(\w+)\}/g, function (m, a) { return keys[a] && keys[a][0] ? codeName(keys[a][0]) : m; });
  }

  function codeName(code) {
    var n = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift',
              ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', Escape: 'Esc', Enter: 'Enter',
              Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock', Slash: '/', Period: '.', Comma: ',', Semicolon: ';',
              Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' }[code];
    if (n) return n;
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    return code;
  }
  function actionOf(code) {
    for (var a in keys) if (keys[a].indexOf(code) >= 0) return a;
    return null;
  }

  // The run in play --------------------------------------------------------------------

  var game = null, run = null, demo = null, demoPlan = null, screen = 'menu', back = [];
  var looping = false, last = 0, acc = 0, frameTimes = [], autoLow = false, lastCheck = 0;
  var held = { dir: 0, l: false, r: false, ms: 0, rep: 0, soft: false }, queued = {};
  var shown = { score: 0, from: 0, to: 0, t0: 0 };
  root.PentrysDebug = { frameTimes: frameTimes, get game() { return game; }, get demo() { return demo; } };

  // High scores, kept for Easy, Normal and Hard alone. Scores kept before
  // the difficulties came in, under other keys, stay unused.
  function scoreKey(mode) { return 'difficulty|' + mode; }
  function bestOf(key) { var list = scores[key]; return list && list.length ? list[0] : null; }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0') + (ms < 600000 ? '.' + String(Math.floor(ms / 100) % 10) : '');
  }
  function fmtBest(entry) { return entry ? entry.v.toLocaleString('en-GB') : ''; }

  // A run of one mode. opts, from the address: lesson for the tutorial;
  // speed and seed, which make a run practice; and for Custom, any of its
  // choices, in place of the ones kept.
  function start(mode, opts) {
    opts = opts || {};
    var lessonIndex = mode === 'tutorial' ? (opts.lesson || 0) : null, set;
    if (mode === 'tutorial') set = { lesson: Lessons[lessonIndex] };
    else if (mode === 'custom') set = Object.assign({}, settings.custom, opts);
    else {
      var d = C.difficulty[mode];
      set = { width: C.width, sizes: C.sizes, squares: d.squares, speed: opts.speed || d.speed, choiceRows: d.choiceRows };
    }
    var practice = mode !== 'tutorial' && (opts.speed != null || opts.seed != null);
    game = Rules.create(Object.assign({ mode: mode === 'tutorial' ? 'tutorial' : 'marathon', seed: opts.seed, softDropRate: timing.sdf }, set));
    run = { mode: mode, opts: opts, practice: practice, lesson: lessonIndex,
            key: DIFFICULTIES.indexOf(mode) >= 0 && !practice ? scoreKey(mode) : null, started: performance.now() };
    demo = null; demoPlan = null;
    Draw.reset(); Draw.setDim(false);
    held = { dir: 0, l: false, r: false, ms: 0, rep: 0, soft: false }; queued = {};
    shown = { score: 0, from: 0, to: 0, t0: 0 };
    $('callouts').textContent = '';
    showScreen(null);
    hudForRun();
    layout();
    Sound.begin();
    game.takeEvents();
    last = 0; acc = 0;
    schedule();
  }

  function startDemo() {
    demo = Rules.create({ mode: 'demo', width: C.width, sizes: C.sizes, squares: 'normal', speed: 2 });
    demoPlan = null;
    demo.takeEvents();
    Draw.reset(); Draw.setDim(true);
  }

  function toTitle() {
    game = null; run = null;
    $('left').classList.remove('in-lesson');
    startDemo();
    hudForDemo();
    layout();
    showScreen('menu');
    refreshMenu();
    schedule();
  }

  // The loop -------------------------------------------------------------------------------

  function schedule() { if (!looping) { looping = true; root.requestAnimationFrame(loop); } }

  function active() { return game || demo; }

  function loop(now) {
    looping = false;
    var t0 = performance.now(), g = active();
    if (!last) last = now;
    var dt = Math.min(250, now - last);
    last = now;
    var stepping = g && !g.over && (game ? screen === null : !compact());
    if (stepping) {
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 8) {
        var input = game ? tickInput() : demoInput(demo);
        g.step(input);
        handle(g, g.takeEvents(), now);
        acc -= STEP; n++;
        if (!active() || g !== active()) break;
      }
      if (n === 8) acc = 0;
    } else acc = 0;
    g = active();
    if (g) {
      Draw.frame(g, now);
      Draw.queue(g, now);
      if (game) updateHud(now);
    }
    measure(performance.now() - t0, now);
    if ((g && !g.over && (screen === null || (demo && !compact()))) || Draw.busy(now) || (shown.t0 && now - shown.t0 < 320)) schedule();
    else if (demo && demo.over) root.setTimeout(function () { if (demo && demo.over && screen) { startDemo(); schedule(); } }, 1500);
  }

  // The frame's own work, for the low-effects switch and for measuring.
  function measure(ms, now) {
    frameTimes.push(ms);
    if (frameTimes.length > 600) frameTimes.splice(0, frameTimes.length - 600);
    if (now - lastCheck < 2000 || autoLow || settings.effects === 'low') return;
    lastCheck = now;
    var recent = frameTimes.slice(-120).sort(function (a, b) { return a - b; });
    if (recent.length >= 60 && recent[recent.length >> 1] > 12) {
      autoLow = true; Draw.setLow(true);
      callout('Effects set low', 'info', null);
      refreshSettings();
    }
  }

  // Input ----------------------------------------------------------------------------------

  function tickInput() {
    var inp = queued;
    queued = {};
    // One bump a step, so quick presses all count, in order.
    if (inp.bumps) { inp.bump = inp.bumps.shift(); if (inp.bumps.length) queued.bumps = inp.bumps; delete inp.bumps; }
    if (held.dir) {
      var before = held.ms;
      held.ms += STEP;
      if (held.ms >= timing.das) {
        var name = held.dir < 0 ? 'left' : 'right';
        if (timing.arr <= 0) inp[name] = (inp[name] || 0) + game.width;
        else {
          // The first repeat comes at the delay, and the rest every repeat time after it.
          if (before < timing.das) { inp[name] = (inp[name] || 0) + 1; held.rep = held.ms - timing.das; }
          else held.rep += STEP;
          while (held.rep >= timing.arr) { held.rep -= timing.arr; inp[name] = (inp[name] || 0) + 1; }
        }
      }
    }
    if (held.soft) inp.softDrop = true;
    return inp;
  }

  function press(action) {
    Sound.start();
    if (action === 'pause') { if (game && !game.over && screen === null) pause(); else if (screen === 'pause') resume(); else if (screen) goBack(); return; }
    if (action === 'sound') { toggleSound(); return; }
    if (!game || game.over || screen !== null) return;
    if (action === 'restart') { pause(); $('restart').focus(); return; }
    if (action === 'left' || action === 'right') {
      var d = action === 'left' ? -1 : 1;
      queued[action] = (queued[action] || 0) + 1;
      held[action === 'left' ? 'l' : 'r'] = true;
      held.dir = d; held.ms = 0; held.rep = 0;
    } else if (action === 'soft') held.soft = true;
    else if (action === 'hard') queued.hardDrop = true;
    else if (action === 'cw' || action === 'ccw' || action === 'flip' || action === 'cycle') queued[action] = true;
    schedule();
  }
  // Bring the queue's piece number n (1 is the front) to the front. While the
  // falling piece is open, n takes its place, and 1 swaps it for the next.
  function bump(n) {
    Sound.start();
    if (!game || game.over || screen !== null || n < 1) return;
    (queued.bumps = queued.bumps || []).push(n - 1);
    schedule();
  }
  function release(action) {
    if (action === 'left' || action === 'right') {
      held[action === 'left' ? 'l' : 'r'] = false;
      if (held.l && !held.r) { held.dir = -1; held.ms = 0; held.rep = 0; }
      else if (held.r && !held.l) { held.dir = 1; held.ms = 0; held.rep = 0; }
      else if (!held.l && !held.r) held.dir = 0;
    } else if (action === 'soft') held.soft = false;
  }

  // Keys on a popup or page: the arrows, Home and End move between its buttons,
  // and wrap round at the ends. Left-handed keys add E, S, D and F. Tab, Enter and Space work as the browser has them.
  var navAt = 0;
  function navButtons() {
    var panel = screen && $(screen);
    if (!panel) return [];
    return Array.prototype.filter.call(panel.querySelectorAll('button, a[href]'), function (b) { return !b.disabled && b.getClientRects().length > 0; });
  }
  $('screen').addEventListener('focusin', function (e) { var i = navButtons().indexOf(e.target); if (i >= 0) navAt = i; });
  function menuKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    var step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.code];
    if (!step && handOf() === 'left') step = { KeyE: -1, KeyS: -1, KeyD: 1, KeyF: 1 }[e.code];
    var edge = e.code === 'Home' ? 0 : e.code === 'End' ? -1 : null;
    if (!step && edge === null) return false;
    var list = navButtons();
    if (!list.length) return false;
    e.preventDefault();
    var at = list.indexOf(document.activeElement), to;
    if (edge !== null) to = edge < 0 ? list.length - 1 : 0;
    // A page that rebuilds its buttons drops the focus: the first arrow returns to the same place.
    else if (at < 0) to = Math.min(navAt, list.length - 1);
    else to = (at + step + list.length) % list.length;
    list[to].focus();
    return true;
  }

  var capturing = null;
  root.addEventListener('keydown', function (e) {
    if (capturing) { captureKey(e); return; }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var a = actionOf(e.code);
    if (screen && screen !== 'pause' && e.code === 'Escape') { e.preventDefault(); goBack(); return; }
    if (screen !== null) {
      if (menuKey(e)) return;
      // Enter and Space press the focused button. A held key must not press it again.
      if ((e.code === 'Enter' || e.code === 'Space') && e.target && e.target.closest && e.target.closest('button, a[href]')) { if (e.repeat) e.preventDefault(); return; }
    }
    // The number keys bring that piece of the queue to the front.
    var num = !a && /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (num && game && !game.over && screen === null) { e.preventDefault(); if (!e.repeat) bump(+num[1]); return; }
    if (!a) return;
    if (game && screen === null || a === 'pause' || a === 'sound') e.preventDefault();
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0 && game) e.preventDefault();
    if (e.repeat) return;
    press(a);
  });
  root.addEventListener('keyup', function (e) { var a = actionOf(e.code); if (a) release(a); });
  root.addEventListener('blur', function () { held = { dir: 0, l: false, r: false, ms: 0, rep: 0, soft: false }; });

  // Touch buttons: a held button repeats as a held key does.
  Array.prototype.forEach.call(document.querySelectorAll('#pad button'), function (b) {
    var act = b.dataset.act;
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} press(act); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      b.addEventListener(t, function () { b.classList.remove('on'); release(act); });
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  // A tap on a piece in the queue brings it to the front. A tap on the first
  // piece swaps it in while the falling piece is open, and cycles otherwise.
  $('next').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (!game || screen !== null) return;
    var r = $('next').getBoundingClientRect(), i = Draw.queueSlot(e.clientX - r.left, e.clientY - r.top);
    if (i > 0 || (i === 0 && game.piece && game.piece.open)) bump(i + 1); else press('cycle');
  });

  // The main menu's game: the simulated player, at an easy pace.
  function demoInput(g) {
    if (!g.piece) return {};
    if (!demoPlan || demoPlan.id !== g.piece.id) {
      var p = Bot.plan(g, false);
      demoPlan = { id: g.piece.id, wait: 18, cycles: 0, turns: p ? Bot.turns(g.piece.o, p.o) : [], bx: p ? p.bx : g.piece.bx, tries: 0,
                   grid: p ? p.grid : null, look: 0, bestK: 0, bestV: -Infinity };
    }
    // Weigh one queue piece a step, so the main menu's game never stalls a frame.
    if (demoPlan.grid && demoPlan.look < g.queue.length) {
      var q = g.queue[demoPlan.look];
      if (q) { var v = Bot.nextValue(demoPlan.grid, q, g.hidden); if (v > demoPlan.bestV) { demoPlan.bestV = v; demoPlan.bestK = demoPlan.look; } }
      if (++demoPlan.look === g.queue.length) demoPlan.cycles = demoPlan.bestK;
    }
    if (demoPlan.wait-- > 0) return {};
    demoPlan.wait = 5;
    if (demoPlan.cycles > 0) { demoPlan.cycles--; g.cycle(); return {}; }
    if (demoPlan.turns.length) { var t = {}; t[demoPlan.turns.shift()] = true; return t; }
    if (g.piece.bx !== demoPlan.bx && demoPlan.tries++ < 20) return g.piece.bx < demoPlan.bx ? { right: 1 } : { left: 1 };
    demoPlan.wait = 0;
    return { softDrop: true };
  }

  // What happens in the game ------------------------------------------------------------------

  function handle(g, list, now) {
    if (!list.length) return;
    Draw.onEvents(list, g, now);
    if (g !== game) { if (list.some(function (e) { return e.type === 'lock'; })) Draw.setDanger(g); return; }
    list.forEach(function (e) {
      if (e.type === 'move') Sound.move();
      else if (e.type === 'rotate') Sound.rotate();
      else if (e.type === 'flip') Sound.flip();
      else if (e.type === 'cycle' || e.type === 'bump') Sound.cycle();
      else if (e.type === 'hardDrop') Sound.hardDrop();
      else if (e.type === 'lock') { if (!list.some(function (x) { return x.type === 'hardDrop'; })) Sound.lock(); Draw.setDanger(g); }
      else if (e.type === 'fill') { if (e.kind === 'deluge') Sound.deluge(); else Sound.flood(); }
      else if (e.type === 'blast') Sound.blast();
      else if (e.type === 'rowbomb') Sound.rowbomb();
      else if (e.type === 'smash') Sound.smash();
      else if (e.type === 'shatter') Sound.shatter();
      else if (e.type === 'crack') Sound.crack();
      else if (e.type === 'clear') celebrate(e);
      else if (e.type === 'combo') combo(e);
      else if (e.type === 'speed') { Sound.speed(); callout('Speed ' + e.speed, 'c2', null, null, null, null, 2); }
      else if (e.type === 'over') finish(e.result);
    });
  }

  function celebrate(e) {
    var twos = 0, threes = 0;
    e.rows.forEach(function (r) { r.values.forEach(function (v) { if (v[1] === 2) twos++; else threes++; }); });
    Sound.clear(e.n, twos, threes);
    if (e.allClear) allClear();
    var fx = $('fx');
    if (e.n >= 4 && settings.effects !== 'low' && !autoLow) {
      fx.className = 'fx'; void fx.offsetWidth;
      fx.className = 'fx ' + (e.n >= 6 ? 'flash' : e.n === 5 ? 'pulse' : 'wave');
    }
  }
  function fmtMult(m) { return '×' + String(Math.round(m * 100) / 100); }
  // A combo: the clear's name and its total multiplier, then a line for each
  // bonus, with the speed last, and the points. On a phone, one line.
  function combo(e) {
    var bonus = e.lines.filter(function (l) { return l.base == null && l.name.indexOf('Speed') !== 0; });
    var speed = e.lines.filter(function (l) { return l.name.indexOf('Speed') === 0; });
    var shown = e.n ? bonus : bonus.slice(1);
    var rows = shown.length ? shown.concat(speed) : [];
    // The better the combo, the longer it stays: more rows, more bonuses and a
    // bigger multiplier each add time. A new combo pushes the old one out.
    var hold = (e.n ? [0, 2, 2.6, 3.2, 4, 5.5, 7.5][Math.min(e.n, 6)] : 1.6) + 0.35 * rows.length +
               (e.multiplier >= 4 ? 1 : 0) + (e.multiplier >= 8 ? 1 : 0);
    Array.prototype.forEach.call($('callouts').querySelectorAll('.callout.combo'), function (old) { dismiss(old, true); });
    callout(e.name, 'combo ' + (e.n ? 'c' + Math.min(e.n, 6) : 'c1'), e.n && e.multiplier > 1 ? e.multiplier : null, e.y,
            '+' + e.points.toLocaleString('en-GB'), rows, Math.min(hold, 10));
    var mults = bonus.filter(function (l) { return l.mult; }).length;
    if (mults) Sound.combo(mults);
    var fx = $('fx');
    if (!e.n && e.lines.some(function (l) { return l.name === 'Blast'; }) && settings.effects !== 'low' && !autoLow) {
      fx.className = 'fx'; void fx.offsetWidth; fx.className = 'fx boom';
    }
  }
  function callout(text, cls, mult, gridRow, points, lines, hold) {
    var box = $('callouts'), el = document.createElement('div');
    el.className = 'callout ' + (cls || '') + (mult >= 8 ? ' x8' : mult >= 4 ? ' x4' : '');
    var name = document.createElement('span'); name.className = 'name'; name.textContent = text; el.appendChild(name);
    if (mult) { var b = document.createElement('b'); b.textContent = fmtMult(mult); el.appendChild(b); }
    if (lines && lines.length) {
      var ul = document.createElement('ul');
      lines.forEach(function (l, i) {
        var li = document.createElement('li'), t = document.createElement('i'), v = document.createElement('b');
        t.textContent = l.name;
        v.textContent = l.mult ? fmtMult(l.mult) : l.add ? '+' + l.add.toLocaleString('en-GB') : '';
        li.style.animationDelay = (0.15 + 0.12 * i) + 's';
        li.appendChild(t); li.appendChild(v); ul.appendChild(li);
      });
      el.appendChild(ul);
    }
    if (points) { var sm = document.createElement('small'); sm.textContent = points; el.appendChild(sm); }
    while (box.children.length > 3) box.removeChild(box.firstChild);
    box.appendChild(el);
    if (!isPhone() && gridRow != null) {
      var top = Draw.rowTop(gridRow) - box.offsetTop - 10;
      el.style.top = Math.max(0, Math.min(top, box.clientHeight - el.offsetHeight)) + 'px';
    } else if (!isPhone()) el.style.top = '0px';
    $('left').classList.add('celebrating');
    var ms = (hold || 1.2) * 1000;
    root.clearTimeout(callout.timer);
    callout.timer = root.setTimeout(function () { $('left').classList.remove('celebrating'); }, ms + 600);
    root.setTimeout(function () { dismiss(el, false); }, ms);
    return el;
  }
  function dismiss(el, quick) {
    if (el.classList.contains('out')) { if (quick) el.classList.add('quick'); return; }
    el.classList.add('out'); if (quick) el.classList.add('quick');
    el.addEventListener('animationend', function (ev) { if (ev.target === el) el.remove(); });
    root.setTimeout(function () { el.remove(); }, 900);
  }
  function allClear() {
    var el = document.createElement('div');
    el.className = 'allclear'; el.textContent = 'ALL CLEAR';
    el.style.top = Math.round(Draw.rowTop(Rules.HIDDEN) - 34) + 'px';
    $('well-wrap').appendChild(el);
    root.setTimeout(function () { el.remove(); }, 4100);
  }
  function finish(result) {
    var g = game;
    Draw.setDanger(g);
    if (result === 'topout') Sound.over();
    // A top out waits for the stack to finish blowing up.
    var wait = result === 'topout' ? 1400 : 350;
    if (run.lesson != null && result === 'passed') {
      var title = Lessons[run.lesson].title;
      if (passed.indexOf(title) < 0) { passed.push(title); save('lessons', passed); }
      Sound.pass();
      wait = 700;
    }
    root.setTimeout(function () { if (game === g) showOver(result); }, wait);
  }

  function showOver(result) {
    var g = game, mode = run.mode, lesson = run.lesson;
    var title = { topout: 'Game over', passed: 'Lesson passed', failed: 'Not quite' }[result] || 'Game over';
    $('over-title').textContent = title;
    $('over-title').classList.toggle('doom', result === 'topout');
    var text = '', stats = [];
    var ms = g.ticks * STEP;
    if (lesson != null) {
      text = result === 'passed' ? 'Lesson ' + (lesson + 1) + ', ' + Lessons[lesson].title + ', passed.' : Lessons[lesson].goalText + ', to pass. Try again.';
    } else {
      stats = [['Score', g.score.toLocaleString('en-GB')], ['Rows', g.rowsCleared], ['Speed', g.speed], ['Time', fmtTime(ms)], ['Pieces', g.pieces]];
      for (var n = 2; n < g.clears.length; n++) if (g.clears[n]) stats.push([n <= 6 ? Rules.clearName(n) + (g.clears[n] > 1 ? 's' : '') : n + '-row clears', g.clears[n]]);
      if (g.bestMultiplier > 1) stats.push(['Best combo', fmtMult(g.bestMultiplier)]);
      if (mode === 'custom') text = 'A custom game: it keeps no score.';
      else if (run.practice) text = 'A practice run: it keeps no score.';
    }
    var dl = $('over-stats');
    dl.textContent = '';
    stats.forEach(function (s) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = s[0]; dd.textContent = s[1]; dl.appendChild(dt); dl.appendChild(dd); });
    $('over-text').textContent = text;
    $('over-scores').textContent = '';
    var form = $('initials'); form.hidden = true;
    var value = g.score;
    if (run.key && value > 0 && qualifies(run.key, value)) {
      form.hidden = false;
      var input = $('initials-in');
      input.value = initials;
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var who = (input.value || '???').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '???';
        initials = who; save('initials', who);
        var entry = record(run.key, { v: value, i: who, d: today(), r: g.rowsCleared, s: g.speed });
        form.hidden = true;
        scoreTable($('over-scores'), run.key, entry);
        $('over-actions').querySelector('button').focus();
      };
    } else if (run.key) scoreTable($('over-scores'), run.key, null);
    var acts = $('over-actions');
    acts.textContent = '';
    function button(label, fn, primary) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.className = 'primary';
      b.addEventListener('click', fn); acts.appendChild(b); return b;
    }
    var first;
    if (lesson != null) {
      if (result === 'passed' && lesson < Lessons.length - 1) first = button('Next lesson', function () { start('tutorial', { lesson: lesson + 1 }); }, true);
      var again = button(result === 'passed' ? 'Play again' : 'Try again', function () { start('tutorial', { lesson: lesson }); }, result !== 'passed');
      first = first || again;
      button('All lessons', function () { toTitle(); buildLessons(); showScreen('lessons'); });
    } else {
      var replay = run.opts;
      first = button('Play again', function () { start(mode, replay); }, true);
      button('Main menu', toTitle);
    }
    showScreen('over');
    if (!form.hidden) { $('initials-in').focus(); $('initials-in').select(); } else first.focus();
  }

  function qualifies(key, value) {
    var list = scores[key] || [];
    return list.length < 10 || value > list[list.length - 1].v;
  }
  function record(key, entry) {
    var list = (scores[key] || []).concat([entry]);
    list.sort(function (a, b) { return b.v - a.v; });
    scores[key] = list.slice(0, 10);
    save('scores', scores);
    return entry;
  }
  function scoreTable(table, key, mine) {
    table.textContent = '';
    var list = scores[key] || [];
    if (!list.length) { var tr0 = table.insertRow(); var td0 = tr0.insertCell(); td0.colSpan = 4; td0.textContent = 'No scores yet.'; return; }
    var head = table.createTHead().insertRow();
    ['#', 'Who', 'Score', 'Date'].forEach(function (h) { var th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    var body = table.createTBody();
    list.forEach(function (s, i) {
      var tr = body.insertRow();
      if (s === mine) tr.className = 'me';
      [String(i + 1), s.i, s.v.toLocaleString('en-GB'), s.d].forEach(function (v, k) {
        var td = tr.insertCell(); td.textContent = v; if (k === 2) td.className = 'v';
      });
    });
  }

  // Pausing ------------------------------------------------------------------------------------

  function pause() {
    if (!game || game.over || screen !== null) return;
    held = { dir: 0, l: false, r: false, ms: 0, rep: 0, soft: false };
    // A lesson's pause leads back to the lesson list, a run's to the main menu.
    $('quit').textContent = run.lesson != null ? 'All lessons' : 'Main menu';
    showScreen('pause');
    $('resume').focus();
    refreshSoundButtons();
  }
  function resume() { showScreen(null); last = 0; schedule(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  $('resume').addEventListener('click', resume);
  $('restart').addEventListener('click', function () {
    if (!run) return;
    if (run.lesson != null) start('tutorial', { lesson: run.lesson }); else start(run.mode, run.opts);
  });
  // A click or tap outside the pause menu resumes, and does nothing else.
  var swallowClick = false;
  root.addEventListener('pointerdown', function (e) {
    if (screen !== 'pause' || $('pause').contains(e.target) || e.target.closest('a, .theme-toggle')) return;
    e.preventDefault(); e.stopPropagation(); swallowClick = true; resume();
  }, true);
  root.addEventListener('click', function (e) { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  $('quit').addEventListener('click', function () {
    if (run && run.lesson != null) { toTitle(); buildLessons(); showScreen('lessons'); } else toTitle();
  });
  $('pause-sound').addEventListener('click', toggleSound);
  // The logo goes back to the main menu. A lesson, a finished run or one
  // not yet started goes at once; a scored run pauses first, with Title
  // screen chosen, so the pause menu confirms.
  $('home').addEventListener('click', function () {
    if (!game) { showScreen('menu'); return; }
    if (!game.over && screen === null && run.lesson == null && (game.pieces > 0 || game.score > 0)) { pause(); $('quit').focus(); }
    else toTitle();
  });

  // Screens ------------------------------------------------------------------------------------

  var TITLE_SCREENS = ['menu', 'lessons', 'howto', 'settings', 'custom'];
  function titling() { return !game && TITLE_SCREENS.indexOf(screen) >= 0; }
  function showScreen(name) {
    var was = titling();
    ['menu', 'lessons', 'howto', 'settings', 'custom', 'pause', 'over'].forEach(function (id) { $(id).hidden = id !== name; });
    screen = name;
    if (name === null) back = [];
    document.body.classList.toggle('titling', titling());
    if (was !== titling()) layout(); else placeScreen();
    highScores();
  }
  // On a wide screen the main menu's pages take the left column, so the
  // main menu's game shows beside them. Other pages sit in the middle.
  function placeScreen() {
    var el = $('screen');
    if (titling() && !compact()) {
      var r = $('left').getBoundingClientRect();
      el.style.justifyContent = 'flex-start'; el.style.alignItems = 'flex-start';
      el.style.padding = Math.round(r.top) + 'px 0 0 ' + Math.round(r.left) + 'px';
      Array.prototype.forEach.call(el.children, function (panel) { panel.style.maxHeight = Math.round(r.height) + 'px'; });
    } else {
      el.style.justifyContent = el.style.alignItems = el.style.padding = '';
      Array.prototype.forEach.call(el.children, function (panel) { panel.style.maxHeight = panel.style.left = panel.style.top = ''; });
      // A run's pause and game-over cards sit over the middle of the well, as far as the window allows.
      if (game && (screen === 'pause' || screen === 'over')) {
        var panel = $(screen), pr = panel.getBoundingClientRect(), wr = $('well').getBoundingClientRect(), c = Draw.wellCentre(), v = viewport();
        var dx = Math.max(16 - pr.left, Math.min(v.w - 16 - pr.right, wr.left + c.x - (pr.left + pr.width / 2)));
        var dy = Math.max(16 - pr.top, Math.min(v.h - 16 - pr.bottom, wr.top + c.y - (pr.top + pr.height / 2)));
        panel.style.position = 'relative'; panel.style.left = Math.round(dx) + 'px'; panel.style.top = Math.round(dy) + 'px';
      }
    }
  }
  function open(name) {
    back.push(screen);
    if (name === 'settings') { buildControls(); refreshSettings(); }
    if (name === 'custom') refreshCustom();
    if (name === 'howto') buildHowto();
    if (name === 'lessons') buildLessons();
    showScreen(name);
    var first = $(name).querySelector('button');
    if (first) first.focus({ preventScroll: true });
    $(name).scrollTop = 0;
  }
  function goBack() {
    if (capturing) return;
    var to = back.pop();
    if (to === undefined) to = game && !game.over ? 'pause' : 'menu';
    if (to === 'menu') refreshMenu();
    showScreen(to);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) { b.addEventListener('click', function () { open(b.dataset.open); }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) { b.addEventListener('click', goBack); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () { Sound.start(); if (b.dataset.mode === 'tutorial') open('lessons'); else start(b.dataset.mode); });
  });

  // High scores over the main menu's game. Hard, Normal and Easy take turns,
  // fading in and out, and a difficulty with no scores yet is left out. On a
  // phone or a tablet the menu covers the game, so they sit in the menu.
  var HS_SHOW = 6000, HS_FADE = 700, hsTimer = 0;
  function highScores() {
    var box = $('hiscores'), list = ['hard', 'normal', 'easy'].filter(function (m) { return bestOf(scoreKey(m)); });
    root.clearTimeout(hsTimer);
    box.classList.remove('on');
    if (screen !== 'menu' || !list.length) { box.hidden = true; return; }
    var home = compact() ? $('menu') : document.body;
    if (box.parentNode !== home) home.appendChild(box);
    box.hidden = false;
    placeHighScores();
    (function show(i) {
      $('hs-title').textContent = MODES[list[i]] + ' · high scores';
      scoreTable($('hs-table'), scoreKey(list[i]), null);
      void box.offsetWidth;
      box.classList.add('on');
      if (list.length < 2) return;
      hsTimer = root.setTimeout(function () {
        box.classList.remove('on');
        hsTimer = root.setTimeout(function () { show((i + 1) % list.length); }, HS_FADE);
      }, HS_SHOW);
    })(0);
  }
  // On a wide screen the scores sit over the top half of the game's well.
  function placeHighScores() {
    var box = $('hiscores');
    box.style.left = box.style.top = box.style.width = '';
    if (box.hidden || compact()) return;
    var wr = $('well').getBoundingClientRect(), b = Draw.wellBox(), w = Math.min(320, b.w * 0.86);
    box.style.width = Math.round(w) + 'px';
    box.style.left = Math.round(wr.left + b.x + (b.w - w) / 2) + 'px';
    box.style.top = Math.round(wr.top + b.y + b.h * 0.12) + 'px';
  }

  var ABOUT = { easy: ', more helpers', normal: '', hard: ', more glass' };
  function refreshMenu() {
    DIFFICULTIES.forEach(function (m) {
      var d = C.difficulty[m], best = bestOf(scoreKey(m));
      document.querySelector('[data-about="' + m + '"]').textContent = 'From speed ' + d.speed + ABOUT[m];
      document.querySelector('[data-best="' + m + '"]').textContent = best ? 'Best ' + fmtBest(best) : '';
    });
    var done = Lessons.filter(function (ls) { return passed.indexOf(ls.title) >= 0; }).length;
    $('tut-count').textContent = done ? done + ' of ' + Lessons.length : '';
    var fresh = !passed.length && !DIFFICULTIES.some(function (m) { return bestOf(scoreKey(m)); });
    document.querySelector('[data-mode="tutorial"]').classList.toggle('suggest', fresh);
  }

  // The Custom page: each choice, kept for next time.
  function refreshCustom() {
    var cu = settings.custom;
    function seg(id, values, label, on, pick) {
      var box = $(id); box.textContent = '';
      values.forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = label(v);
        b.setAttribute('aria-pressed', on(v));
        b.addEventListener('click', function () { pick(v); save('settings', settings); refreshCustom(); b.focus(); });
        box.appendChild(b);
      });
    }
    seg('set-squares', SQUARE_SETS, function (set) { return set[1]; }, function (set) { return cu.squares === set[0]; }, function (set) { cu.squares = set[0]; });
    SQUARE_SETS.forEach(function (set) { if (set[0] === cu.squares) $('squares-hint').textContent = set[2]; });
    seg('set-width', [10, 12, 14, 16, 18], String, function (n) { return cu.width === n; }, function (n) { cu.width = n; });
    seg('set-sizes', [1, 2, 3, 4, 5], String, function (n) { return cu.sizes.indexOf(n) >= 0; }, function (n) {
      var i = cu.sizes.indexOf(n);
      if (i >= 0 && cu.sizes.length > 1) cu.sizes.splice(i, 1); else if (i < 0) cu.sizes.push(n);
      cu.sizes.sort();
    });
    seg('set-choice', [0, 1, 2, 3], String, function (n) { return cu.choiceRows === n; }, function (n) { cu.choiceRows = n; });
    $('choice-hint').textContent = cu.choiceRows ? 'A new piece can be swapped for one in the queue until it falls ' + cu.choiceRows +
      (cu.choiceRows === 1 ? ' row.' : ' rows.') : 'A new piece is fixed from the start.';
    var t = $('set-speed'); t.textContent = '';
    var label = document.createElement('span'), value = document.createElement('b'), input = document.createElement('input');
    label.textContent = 'Starting speed'; value.textContent = cu.speed + ' of ' + Rules.SPEEDS;
    input.type = 'range'; input.min = 1; input.max = Rules.SPEEDS; input.step = 1; input.value = cu.speed;
    input.setAttribute('aria-label', 'Starting speed');
    input.addEventListener('input', function () { cu.speed = +input.value; value.textContent = cu.speed + ' of ' + Rules.SPEEDS; save('settings', settings); });
    t.appendChild(label); t.appendChild(value); t.appendChild(input);
  }
  $('custom-play').addEventListener('click', function () { Sound.start(); start('custom'); });

  // The Settings page: effects, sound, full screen and the keys.
  function refreshSettings() {
    var hand = handOf();
    $('controls-left').setAttribute('aria-pressed', hand === 'left');
    $('controls-right').setAttribute('aria-pressed', hand === 'right');
    $('controls-right').title = 'Move with the arrows, turn with Z, X, A and C';
    $('controls-left').title = 'Move with S, D and F, turn with J, K, L and ;';
    $('hand-note').textContent = hand === 'custom' ? 'Custom' : '';
    var fx = settings.effects === 'low' ? 'Low' : autoLow ? 'Low (auto)' : 'Full';
    $('set-effects').textContent = fx;
    $('set-effects').setAttribute('aria-pressed', settings.effects !== 'low' && !autoLow);
    refreshSoundButtons();
  }
  function refreshSoundButtons() {
    $('set-sound').textContent = settings.sound ? 'On' : 'Off';
    $('set-sound').setAttribute('aria-pressed', settings.sound);
    $('pause-sound').textContent = 'Sound: ' + (settings.sound ? 'on' : 'off');
  }
  $('set-effects').addEventListener('click', function () {
    if (autoLow) { autoLow = false; settings.effects = 'full'; } else settings.effects = settings.effects === 'low' ? 'full' : 'low';
    Draw.setLow(settings.effects === 'low'); save('settings', settings); refreshSettings();
  });
  $('set-sound').addEventListener('click', toggleSound);
  function toggleSound() {
    settings.sound = !settings.sound; Sound.setOn(settings.sound); save('settings', settings); refreshSoundButtons();
    if (game && screen === null) callout('Sound ' + (settings.sound ? 'on' : 'off'), 'info', null, null);
  }

  // Full screen takes the whole page, so the well grows to fill it. iPhones
  // have no full-screen mode, so there its buttons stay hidden.
  var canFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFull() {
    var page = document.documentElement;
    var p = isFull() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
                     : (page.requestFullscreen || page.webkitRequestFullscreen).call(page);
    if (p && p.catch) p.catch(function () {});
  }
  function refreshFull() {
    $('set-full').textContent = isFull() ? 'On' : 'Off';
    $('set-full').setAttribute('aria-pressed', isFull());
    $('pause-full').textContent = 'Full screen: ' + (isFull() ? 'on' : 'off');
  }
  ['fs-toggle', 'full-row', 'pause-full'].forEach(function (id) { $(id).hidden = !canFull; });
  $('fs-toggle').addEventListener('click', function () { toggleFull(); $('fs-toggle').blur(); });
  $('set-full').addEventListener('click', toggleFull);
  $('pause-full').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', refreshFull);
  document.addEventListener('webkitfullscreenchange', refreshFull);
  refreshFull();

  function buildLessons() {
    var list = $('lesson-list'); list.textContent = '';
    Lessons.forEach(function (ls, i) {
      if (i === 0 || i === 13) {
        var h = document.createElement('li'); h.className = 'group';
        h.textContent = i ? 'Advanced: two or three ideas at once' : 'Basics: one new thing in each';
        list.appendChild(h);
      }
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n"></span><span class="t"><b></b><span></span></span><span class="tick"></span>';
      b.querySelector('.n').textContent = i + 1;
      b.querySelector('.t b').textContent = ls.title;
      b.querySelector('.t span').textContent = keyText(ls.says);
      b.querySelector('.tick').textContent = passed.indexOf(ls.title) >= 0 ? '✓' : '';
      b.addEventListener('click', function () { start('tutorial', { lesson: i }); });
      li.appendChild(b); list.appendChild(li);
    });
  }

  function buildHowto() {
    var box = $('special-list'); box.textContent = '';
    [['T4', 1, 2, 'A 2 counts as two squares, so its row clears with one gap.'],
     ['O4', 2, 3, 'A 3 counts as three, so its row clears with two gaps.'],
     ['S4', 1, 0, 'Glass counts nothing, so its row needs a 2 or a 3. A hard drop onto glass, and nothing else, smashes it, and glass breaks by itself after a minute.'],
     ['I3', 1, 'flood', 'A flood fills the gaps beside and below it as it lands.'],
     ['L3', 1, 'deluge', 'A deluge fills every gap below it that water could reach, however deep.'],
     ['O4', 1, 'bomb', 'A bomb destroys every square around it as it lands, its own piece too.'],
     ['I3', 1, 'rowbomb', 'A row bomb clears its whole row as it lands, whatever the row holds.']].forEach(function (s) {
      var cv = document.createElement('canvas'), p = document.createElement('span');
      Draw.icon(cv, s[0], 0, [[s[1], s[2]]], 16);
      p.textContent = s[3];
      box.appendChild(cv); box.appendChild(p);
    });
    keyTable($('howto-keys'), false);
  }

  // The controls screen: each action takes up to two keys.
  function keyTable(table, editable) {
    table.textContent = '';
    ACTIONS.forEach(function (a) {
      var tr = table.insertRow(), name = tr.insertCell(), cell = tr.insertCell();
      name.textContent = a[1];
      for (var slot = 0; slot < 2; slot++) {
        var code = keys[a[0]][slot];
        if (!editable) { if (code) { var k = document.createElement('kbd'); k.textContent = codeName(code); cell.appendChild(k); cell.appendChild(document.createTextNode(' ')); } continue; }
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mini keybtn'; b.textContent = code ? codeName(code) : '–';
        (function (action, s, btn) { btn.addEventListener('click', function () { beginCapture(action, s, btn); }); })(a[0], slot, b);
        cell.appendChild(b);
      }
      if (a[0] === 'cycle') {
        var tr2 = table.insertRow(), kb = document.createElement('kbd'), kb2 = document.createElement('kbd');
        tr2.insertCell().textContent = 'Bring a piece to the front';
        kb.textContent = '1'; kb2.textContent = String(Rules.QUEUE);
        var c2 = tr2.insertCell(); c2.appendChild(kb); c2.appendChild(document.createTextNode(' to ')); c2.appendChild(kb2);
      }
    });
  }
  function buildControls() {
    keyTable($('control-keys'), true);
    var t = $('timing'); t.textContent = '';
    [['das', 'Delay before a held key repeats', 50, 400, 10, ' ms'], ['arr', 'Time between repeats', 0, 200, 5, ' ms'],
     ['sdf', 'Soft drop speed', 5, 60, 1, ' rows a second']].forEach(function (d) {
      var label = document.createElement('span'), value = document.createElement('b'), input = document.createElement('input');
      label.textContent = d[1]; value.textContent = timing[d[0]] + d[5];
      input.type = 'range'; input.min = d[2]; input.max = d[3]; input.step = d[4]; input.value = timing[d[0]];
      input.setAttribute('aria-label', d[1]);
      input.addEventListener('input', function () { timing[d[0]] = +input.value; value.textContent = input.value + d[5]; saveControls(); });
      t.appendChild(label); t.appendChild(value); t.appendChild(input);
    });
    $('control-note').textContent = '';
  }
  function beginCapture(action, slot, btn) {
    if (capturing) capturing.btn.classList.remove('wait');
    capturing = { action: action, slot: slot, btn: btn };
    btn.classList.add('wait'); btn.textContent = 'Press a key';
  }
  function captureKey(e) {
    e.preventDefault();
    var c = capturing; capturing = null;
    var note = '';
    if (e.code === 'Escape') { buildControls(); return; }
    if (e.code === 'Backspace' || e.code === 'Delete') {
      keys[c.action].splice(c.slot, 1);
      if (!keys[c.action].length) { note = 'Every action needs a key, so ' + codeName(defaultKeys()[c.action][0]) + ' is back.'; keys[c.action] = [defaultKeys()[c.action][0]]; }
    } else {
      ACTIONS.forEach(function (a) {
        var i = keys[a[0]].indexOf(e.code);
        if (i >= 0 && !(a[0] === c.action && i === c.slot)) {
          keys[a[0]].splice(i, 1);
          if (a[0] !== c.action) note = codeName(e.code) + ' moved from ' + a[1] + '.';
          if (!keys[a[0]].length) { keys[a[0]] = [defaultKeys()[a[0]].filter(function (k) { return k !== e.code; })[0] || '']; note += ' ' + a[1] + ' went back to ' + codeName(keys[a[0]][0]) + '.'; }
        }
      });
      var list = keys[c.action];
      if (c.slot < list.length) list[c.slot] = e.code; else list.push(e.code);
      keys[c.action] = list.filter(function (k, i) { return k && list.indexOf(k) === i; }).slice(0, 2);
    }
    saveControls();
    buildControls();
    $('control-note').textContent = note.trim();
  }
  function saveControls() { save('controls', { keys: keys, timing: timing }); showKeys(); if (screen === 'settings') refreshSettings(); }
  [['controls-right', 'right', 'Right-handed'], ['controls-left', 'left', 'Left-handed']].forEach(function (c) {
    $(c[0]).addEventListener('click', function () {
      timing = Object.assign({}, DEFAULT_TIMING);
      setHand(c[1]); buildControls(); refreshSettings();
      $('control-note').textContent = c[2] + ': every key and timing is back to its default.';
    });
  });

  // The HUD ------------------------------------------------------------------------------------

  function showKeys() {
    function k(a) { return keys[a].map(function (c) { return '<kbd>' + codeName(c).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</kbd>'; }).join(' '); }
    $('keys').innerHTML = k('left') + ' ' + k('right') + ' move &nbsp;' + k('soft') + ' soft drop<br>' + k('hard') + ' hard drop &nbsp;' +
      k('flip') + ' flip<br>' + k('ccw') + ' ' + k('cw') + ' rotate<br>' + k('cycle') + ' cycle &nbsp;<kbd>1</kbd>–<kbd>' + Rules.QUEUE + '</kbd> choose<br>' + k('pause') + ' pause';
  }
  function hudForRun() {
    var left = $('left'), lesson = run.lesson;
    left.classList.toggle('in-lesson', lesson != null);
    if (lesson != null) {
      var ls = Lessons[lesson];
      $('mode-label').textContent = 'Tutorial · lesson ' + (lesson + 1) + ' of ' + Lessons.length;
      $('lesson-title').textContent = ls.title;
      $('lesson-says').textContent = keyText(ls.says);
      $('lesson-goal').textContent = ls.goalText;
    } else {
      $('mode-label').textContent = MODES[run.mode] + (run.mode === 'custom' ? ' · ' + squaresName(game.squares) + ' squares · ' + game.width + ' wide' : '') +
        (run.practice ? ' · practice' : '');
    }
    var best = run.key ? bestOf(run.key) : null;
    $('best').textContent = best ? fmtBest(best) : '–';
    $('score').textContent = '0'; $('speed').textContent = game.speed; $('rows').textContent = '0';
  }
  function hudForDemo() {
    $('left').classList.remove('in-lesson');
    $('mode-label').textContent = 'Main menu';
    $('score').textContent = '0'; $('speed').textContent = '–'; $('rows').textContent = '–'; $('time').textContent = '–';
    $('best').textContent = '–';
  }
  function setScore(v, now) { shown.from = shown.score; shown.to = v; shown.t0 = now; }
  function updateHud(now) {
    if (game.score !== shown.to) setScore(game.score, now);
    if (shown.t0) {
      var t = Math.min(1, (now - shown.t0) / 300);
      shown.score = Math.round(shown.from + (shown.to - shown.from) * t);
      if (t >= 1) shown.t0 = 0;
      $('score').textContent = shown.score.toLocaleString('en-GB');
    }
    $('speed').textContent = game.speed;
    $('rows').textContent = game.rowsCleared;
    $('time').textContent = fmtTime(game.ticks * STEP).replace(/\.\d$/, '');
  }

  // Layout ---------------------------------------------------------------------------------------

  function layout() {
    pickMode();
    var g = active(), W = g ? g.width : C.width, phone = isPhone(), v = viewport();
    Draw.logo($('logo'), phone || (mode === 'hand' && v.h < 500) ? 4 : 7);   // before measuring: a blank canvas is 300 x 150
    var board = $('board'), left = $('left'), gameEl = $('game'), next = $('next');
    var wellCols = Draw.GAUGE + W + 0.2, wellRows = Draw.TOP + Rules.ROWS + 0.4, s, q, row = false, zoom = 1, queue, sideW = 0;
    var span = 5 * Rules.QUEUE;   // the queue's length in its own squares: five to a slot
    gameEl.style.paddingTop = ''; left.style.height = ''; left.style.width = ''; next.style.marginRight = '';
    if (phone) {
      var availW = v.w - 32, availH = v.h - left.getBoundingClientRect().height - (58 * 2 + 8) - 10 - 12 - 16 - 8;
      var side = Math.floor(Math.min((availW - 4) / (wellCols + 0.6 * 5.7), availH / wellRows));
      var top = Math.floor(Math.min(availW / wellCols, (availH - 16 - 2) / (wellRows + 0.6 * 5)));
      row = top > side; s = Math.max(8, Math.max(side, top));
      // In a row the queue fits beside the gauge, across the well's width; in a column, down its height.
      q = Math.max(4, Math.floor(Math.min(s * 0.6, row ? (W + 0.2) * s / span : (Rules.ROWS + 0.4) * s / span)));
      queue = { cell: q, row: row, width: Math.round(wellCols * s), height: Math.round(wellRows * s) };
    } else if (mode === 'hand') {
      // Two columns of buttons sit in each bottom corner. The scores and the
      // queue take the space above them, either side of the well.
      var b = Math.round(Math.max(48, Math.min(72, v.h * 0.14))), corner = 2 * b + 8 + 12;
      s = Math.max(8, Math.floor(Math.min((v.h - 20) / wellRows, (v.w - 2 * corner - 64) / wellCols, 72)));
      sideW = Math.max(corner, Math.min(236, Math.floor((v.w - 40 - Math.round(wellCols * s)) / 2) - 12));
      var above = Math.round(wellRows * s) - (2 * b + 8) - 24;
      var qCol = Math.floor(Math.min(s, (above - Draw.TOP * s) / span, sideW / 5.7));
      var qRow = Math.floor(Math.min((sideW - Draw.GAUGE * s - 4) / span, (above - 16) / 5));
      row = qRow > qCol; q = Math.max(4, row ? qRow : qCol);
      queue = { cell: q, row: row, width: Math.round(Draw.GAUGE * s + span * q + 4), height: Math.round(Draw.TOP * s + span * q + 6) };
      gameEl.style.setProperty('--b', b + 'px');
      left.style.width = sideW + 'px'; left.style.height = above + 'px';
    } else {
      var leftW = titling() ? 460 : 236;
      s = Math.max(10, Math.floor(Math.min((v.h - 40) / wellRows, (v.w - leftW - 60) / (wellCols + 5.7), 72)));
      // The scores grow with the well, past the 42px squares a laptop shows.
      zoom = titling() ? 1 : Math.min(1.6, Math.max(1, s / 42));
      s = Math.max(10, Math.min(s, Math.floor((v.w - leftW * zoom - 60) / (wellCols + 5.7))));
      left.style.width = Math.round(leftW * zoom) + 'px';
      q = Math.min(s, Math.floor((Rules.ROWS + 0.4) * s / span));
      queue = { cell: q, row: false, width: Math.round(wellCols * s), height: Math.round(wellRows * s) };
    }
    $('hud').style.zoom = $('keys').style.zoom = zoom === 1 ? '' : zoom.toFixed(3);
    board.classList.toggle('top', row && phone);
    Draw.layout(W, s, queue);
    var wellH = Math.round(wellRows * s);
    if (!phone) gameEl.style.paddingTop = Math.max(0, (v.h - wellH) / 2) + 'px';
    if (mode === 'desk') left.style.height = wellH + 'px';
    // The queue's column is as wide as the scores', so the well sits in the middle.
    if (mode === 'hand') next.style.marginRight = Math.max(0, sideW - (row ? queue.width : Math.round(5.7 * q))) + 'px';
    if (g) { Draw.frame(g, performance.now()); Draw.queue(g, performance.now()); }
    placeScreen();
    placeHighScores();
  }
  function paintBackground() {
    pickMode();
    Draw.wallpaper($('wall'), isLight());
    Draw.logo($('biglogo'), compact() ? 9 : 12);
  }

  var resizeTimer = 0;
  root.addEventListener('resize', function () {
    root.clearTimeout(resizeTimer);
    resizeTimer = root.setTimeout(function () { paintBackground(); layout(); schedule(); }, 80);
  });
  new root.MutationObserver(function () {
    Draw.setTheme(isLight()); paintBackground(); layout(); if (screen === 'howto') buildHowto(); schedule();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // The address -----------------------------------------------------------------------------------

  // #mode=easy, normal, hard or custom, with speed and seed for practice,
  // and for Custom width, sizes and squares too; or #mode=tutorial&lesson=n.
  function fromAddress() {
    var h = new URLSearchParams(root.location.hash.replace(/^#/, ''));
    var mode = h.get('mode');
    if (mode === 'marathon') mode = 'normal';   // addresses from before the difficulties
    if (!mode || !MODES[mode]) return false;
    if (mode === 'tutorial') {
      var n = Math.max(1, Math.min(Lessons.length, +h.get('lesson') || 1));
      start('tutorial', { lesson: n - 1 });
      return true;
    }
    var opts = {}, speed = +(h.get('speed') || h.get('level'));
    if (speed >= 1) opts.speed = Math.min(Rules.SPEEDS, Math.floor(speed));
    if (h.get('seed') != null && h.get('seed') !== '') opts.seed = Math.floor(+h.get('seed')) >>> 0;
    if (mode === 'custom') {
      var w = +h.get('width');
      if ([10, 12, 14, 16, 18].indexOf(w) >= 0) opts.width = w;
      if (h.get('sizes')) { var sz = h.get('sizes').split('').map(Number).filter(function (x) { return x >= 1 && x <= 5; }); if (sz.length) opts.sizes = sz; }
      if (Rules.SQUARES[h.get('squares')]) opts.squares = h.get('squares');
    }
    start(mode, opts);
    return true;
  }

  // Start -------------------------------------------------------------------------------------------

  Draw.init({ well: $('well'), next: $('next'), wall: $('wall') });
  Draw.setTheme(isLight());
  Draw.setLow(settings.effects === 'low');
  Sound.setOn(settings.sound);
  showKeys();
  paintBackground();
  if (!fromAddress()) toTitle();
  root.addEventListener('hashchange', function () { if (root.location.hash.length > 1) fromAddress(); });
  root.addEventListener('pointerdown', function () { Sound.start(); }, { once: true });
})(window);
