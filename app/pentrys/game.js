/* The page: the main loop, input, the screens, settings, controls, high
   scores, the tutorial and the address. See docs/pentrys.md.

   The rules run in fixed steps of a sixtieth of a second, as many as the
   time since the last frame needs. Frames run only while something moves:
   a game in play, the title screen's own game, or an animation finishing.
   The choices, keys, high scores and lessons passed are kept in this
   browser, and the page works without them. */
(function (root) {
  'use strict';
  var P = root.Pentrys, Pieces = P.Pieces, Rules = P.Rules, Draw = P.Draw, Sound = P.Sound, Bot = P.Bot, Lessons = P.Lessons;
  var STEP = 1000 / 60, STORE = 'pentrys.v1.';
  var MODES = { tutorial: 'Tutorial', marathon: 'Marathon', grow: 'Grow', sprint: 'Sprint', blitz: 'Blitz' };
  function $(id) { return document.getElementById(id); }
  function load(k, d) { try { var v = root.localStorage.getItem(STORE + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { root.localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* private window: keep going */ } }
  function isPhone() { return root.matchMedia('(max-width: 640px)').matches; }
  function isLight() { return document.documentElement.dataset.theme === 'light'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // Settings, keys and records -------------------------------------------------------

  var savedSettings = load('settings', {});
  var settings = Object.assign({ width: 12, sizes: [1, 2, 3, 4, 5], squares: 'pentrys', hand: 'right', effects: 'full', sound: true }, savedSettings);
  if (savedSettings.squares == null && savedSettings.specials === false) settings.squares = 'pure';   // the old on/off switch
  delete settings.specials;
  if (!Rules.SQUARES[settings.squares]) settings.squares = 'pentrys';
  var SQUARE_SETS = [['pure', 'Pure', 'The 21 shapes and nothing else.'], ['plus', 'Plus', 'The 21 shapes, with 2s and 3s.'],
                     ['pentrys', 'Pentrys', 'Every special square: 2s, 3s, glass, floods, deluges, bombs and row bombs.']];
  function squaresName(k) { for (var i = 0; i < SQUARE_SETS.length; i++) if (SQUARE_SETS[i][0] === k) return SQUARE_SETS[i][1]; return k; }
  var ACTIONS = [
    ['left', 'Move left'], ['right', 'Move right'], ['soft', 'Soft drop'], ['hard', 'Hard drop'],
    ['cw', 'Rotate clockwise'], ['ccw', 'Rotate anticlockwise'], ['flip', 'Flip'], ['cycle', 'Cycle the queue'],
    ['pause', 'Pause'], ['restart', 'Restart'], ['sound', 'Sound on or off']
  ];
  // Two standard layouts. Right-handed moves on the arrows and turns with the
  // left hand; left-handed moves on A, S and D and turns with the right hand.
  var LAYOUTS = {
    right: { left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'], cw: ['KeyX', 'ArrowUp'],
             ccw: ['KeyZ'], flip: ['KeyA', 'KeyF'], cycle: ['KeyC', 'ShiftLeft'], pause: ['Escape', 'KeyP'], restart: ['KeyR'], sound: ['KeyM'] },
    left: { left: ['KeyA'], right: ['KeyD'], soft: ['KeyS'], hard: ['Space'], cw: ['KeyL', 'ArrowRight'],
            ccw: ['KeyJ', 'ArrowLeft'], flip: ['KeyK', 'ArrowDown'], cycle: ['KeyI', 'ArrowUp'], pause: ['Escape', 'KeyP'], restart: ['KeyR'], sound: ['KeyM'] }
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

  // High scores, kept for each mode and set of settings. The points changed on
  // 2026-10-01, so the keys name the square set, and older scores stay unused.
  function scoreKey(mode, w, sizes, squares) {
    return [mode, w, mode === 'grow' ? 'g' : sizes.join(''), squares].join('|');
  }
  function currentKey(mode) { return scoreKey(mode, settings.width, settings.sizes, settings.squares); }
  function bestOf(key) { var list = scores[key]; return list && list.length ? list[0] : null; }
  function fmtTime(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0') + (ms < 600000 ? '.' + String(Math.floor(ms / 100) % 10) : '');
  }
  function fmtBest(mode, entry) {
    if (!entry) return '';
    return mode === 'sprint' ? fmtTime(entry.v) : entry.v.toLocaleString('en-GB');
  }

  function start(mode, opts) {
    opts = opts || {};
    var lessonIndex = mode === 'tutorial' ? (opts.lesson || 0) : null;
    var practice = !!(opts.level > 1 || opts.seed != null);
    game = Rules.create({
      mode: mode, width: opts.width || settings.width, sizes: opts.sizes || settings.sizes,
      squares: opts.squares || settings.squares, seed: opts.seed, level: opts.level,
      lesson: lessonIndex == null ? null : Lessons[lessonIndex], softDropRate: timing.sdf
    });
    run = { mode: mode, practice: practice, lesson: lessonIndex, key: scoreKey(mode, game.width, opts.sizes || settings.sizes, game.squares),
            started: performance.now() };
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
    demo = Rules.create({ mode: 'demo', width: settings.width, sizes: settings.sizes, squares: settings.squares, level: 3 });
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
    var stepping = g && !g.over && (game ? screen === null : !isPhone());
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
    if ((g && !g.over && (screen === null || (demo && !isPhone()))) || Draw.busy(now) || (shown.t0 && now - shown.t0 < 320)) schedule();
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
  function release(action) {
    if (action === 'left' || action === 'right') {
      held[action === 'left' ? 'l' : 'r'] = false;
      if (held.l && !held.r) { held.dir = -1; held.ms = 0; held.rep = 0; }
      else if (held.r && !held.l) { held.dir = 1; held.ms = 0; held.rep = 0; }
      else if (!held.l && !held.r) held.dir = 0;
    } else if (action === 'soft') held.soft = false;
  }

  var capturing = null;
  root.addEventListener('keydown', function (e) {
    if (capturing) { captureKey(e); return; }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var a = actionOf(e.code);
    if (screen && screen !== 'pause' && e.code === 'Escape') { e.preventDefault(); goBack(); return; }
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
  $('next').addEventListener('pointerdown', function (e) { e.preventDefault(); if (game && screen === null) press('cycle'); });

  // The title screen's game: the simulated player, at an easy pace.
  function demoInput(g) {
    if (!g.piece) return {};
    if (!demoPlan || demoPlan.id !== g.piece.id) {
      var p = Bot.plan(g, false);
      demoPlan = { id: g.piece.id, wait: 18, cycles: 0, turns: p ? Bot.turns(g.piece.o, p.o) : [], bx: p ? p.bx : g.piece.bx, tries: 0,
                   grid: p ? p.grid : null, look: 0, bestK: 0, bestV: -Infinity };
    }
    // Weigh one queue piece a step, so the title screen's game never stalls a frame.
    if (demoPlan.grid && demoPlan.look < 4) {
      var q = g.queue[demoPlan.look];
      if (q) { var v = Bot.nextValue(demoPlan.grid, q, g.hidden); if (v > demoPlan.bestV) { demoPlan.bestV = v; demoPlan.bestK = demoPlan.look; } }
      if (++demoPlan.look === 4) demoPlan.cycles = demoPlan.bestK;
    }
    if (demoPlan.wait-- > 0) return {};
    demoPlan.wait = 5;
    if (demoPlan.cycles > 0) { demoPlan.cycles--; return { cycle: true }; }
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
      else if (e.type === 'cycle') Sound.cycle();
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
      else if (e.type === 'level') { Sound.level(); levelUp(e); }
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
  // bonus, with the level last, and the points. On a phone, one line.
  function combo(e) {
    var bonus = e.lines.filter(function (l) { return l.base == null && l.name.indexOf('Level') !== 0; });
    var level = e.lines.filter(function (l) { return l.name.indexOf('Level') === 0; });
    var shown = e.n ? bonus : bonus.slice(1);
    var rows = shown.length ? shown.concat(level) : [];
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
  function levelUp(e) {
    callout('Level ' + e.level, 'c2', null, null, null, null, 2);
    if (e.grow) {
      var sizes = e.grow.sizes, five = Math.round(e.grow.five * 100);
      root.setTimeout(function () {
        callout(five === 100 ? 'Five squares only' : five ? 'Sizes ' + sizes[0] + '–' + sizes[sizes.length - 1] + ', ' + five + '% five' : 'Sizes 1–4', 'info', null, null);
      }, 700);
    }
  }

  function finish(result) {
    var g = game;
    Draw.setDanger(g);
    if (result === 'topout') Sound.over();
    var wait = result === 'topout' ? 1100 : 350;
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
    var title = { topout: 'Game over', won: 'Sprint complete', time: 'Time up', passed: 'Lesson passed', failed: 'Not quite' }[result] || 'Game over';
    if (mode === 'sprint' && result === 'topout') title = 'Topped out';
    $('over-title').textContent = title;
    var text = '', stats = [];
    var ms = g.ticks * STEP;
    if (lesson != null) {
      text = result === 'passed' ? 'Lesson ' + (lesson + 1) + ', ' + Lessons[lesson].title + ', passed.' : Lessons[lesson].goalText + ', to pass. Try again.';
    } else {
      stats = [['Score', g.score.toLocaleString('en-GB')], ['Rows', g.rowsCleared], ['Level', g.level], ['Time', fmtTime(ms)], ['Pieces', g.pieces]];
      for (var n = 2; n < g.clears.length; n++) if (g.clears[n]) stats.push([n <= 6 ? Rules.clearName(n) + (g.clears[n] > 1 ? 's' : '') : n + '-row clears', g.clears[n]]);
      if (g.bestMultiplier > 1) stats.push(['Best combo', fmtMult(g.bestMultiplier)]);
      if (run.practice) text = 'A practice run: it records no score.';
    }
    var dl = $('over-stats');
    dl.textContent = '';
    stats.forEach(function (s) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = s[0]; dd.textContent = s[1]; dl.appendChild(dt); dl.appendChild(dd); });
    $('over-text').textContent = text;
    $('over-scores').textContent = '';
    var form = $('initials'); form.hidden = true;
    var value = mode === 'sprint' ? (result === 'won' ? Math.round(ms) : null) : g.score;
    if (lesson == null && !run.practice && value != null && value > 0 && qualifies(run.key, mode, value)) {
      form.hidden = false;
      var input = $('initials-in');
      input.value = initials;
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var who = (input.value || '???').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || '???';
        initials = who; save('initials', who);
        var entry = record(run.key, mode, { v: value, i: who, d: today(), r: g.rowsCleared, l: g.level });
        form.hidden = true;
        scoreTable($('over-scores'), run.key, mode, entry);
        $('over-actions').querySelector('button').focus();
      };
    } else if (lesson == null && !run.practice) scoreTable($('over-scores'), run.key, mode, null);
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
      first = button('Play again', function () { start(mode, run.practice ? {} : {}); }, true);
      button('Title screen', toTitle);
    }
    showScreen('over');
    if (!form.hidden) { $('initials-in').focus(); $('initials-in').select(); } else first.focus();
  }

  function qualifies(key, mode, value) {
    var list = scores[key] || [];
    if (list.length < 10) return true;
    var worst = list[list.length - 1].v;
    return mode === 'sprint' ? value < worst : value > worst;
  }
  function record(key, mode, entry) {
    var list = (scores[key] || []).concat([entry]);
    list.sort(function (a, b) { return mode === 'sprint' ? a.v - b.v : b.v - a.v; });
    scores[key] = list.slice(0, 10);
    save('scores', scores);
    return entry;
  }
  function scoreTable(table, key, mode, mine) {
    table.textContent = '';
    var list = scores[key] || [];
    if (!list.length) { var tr0 = table.insertRow(); var td0 = tr0.insertCell(); td0.colSpan = 4; td0.textContent = 'No scores yet.'; return; }
    var head = table.createTHead().insertRow();
    ['#', 'Who', mode === 'sprint' ? 'Time' : 'Score', 'Date'].forEach(function (h) { var th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    var body = table.createTBody();
    list.forEach(function (s, i) {
      var tr = body.insertRow();
      if (s === mine) tr.className = 'me';
      [String(i + 1), s.i, mode === 'sprint' ? fmtTime(s.v) : s.v.toLocaleString('en-GB'), s.d].forEach(function (v, k) {
        var td = tr.insertCell(); td.textContent = v; if (k === 2) td.className = 'v';
      });
    });
  }

  // Pausing ------------------------------------------------------------------------------------

  function pause() {
    if (!game || game.over || screen !== null) return;
    held = { dir: 0, l: false, r: false, ms: 0, rep: 0, soft: false };
    // A lesson's pause leads back to the lesson list, a run's to the title screen.
    $('quit').textContent = run.lesson != null ? 'All lessons' : 'Title screen';
    showScreen('pause');
    refreshSoundButtons();
  }
  function resume() { showScreen(null); last = 0; schedule(); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  $('resume').addEventListener('click', resume);
  $('restart').addEventListener('click', function () {
    if (!run) return;
    if (run.lesson != null) start('tutorial', { lesson: run.lesson }); else start(run.mode, {});
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
  // The logo goes back to the title screen. A lesson, a finished run or one
  // not yet started goes at once; a scored run pauses first, with Title
  // screen chosen, so the pause menu confirms.
  $('home').addEventListener('click', function () {
    if (!game) { showScreen('menu'); return; }
    if (!game.over && screen === null && run.lesson == null && (game.pieces > 0 || game.score > 0)) { pause(); $('quit').focus(); }
    else toTitle();
  });

  // Screens ------------------------------------------------------------------------------------

  var TITLE_SCREENS = ['menu', 'lessons', 'howto', 'controls', 'scores'];
  function titling() { return !game && TITLE_SCREENS.indexOf(screen) >= 0; }
  function showScreen(name) {
    var was = titling();
    ['menu', 'lessons', 'howto', 'controls', 'scores', 'pause', 'over'].forEach(function (id) { $(id).hidden = id !== name; });
    screen = name;
    if (name === null) back = [];
    document.body.classList.toggle('titling', titling());
    if (was !== titling()) layout(); else placeScreen();
  }
  // On a wide screen the title screen's pages take the left column, so the
  // title screen's game shows beside them. Other pages sit in the middle.
  function placeScreen() {
    var el = $('screen');
    if (titling() && !isPhone()) {
      var r = $('left').getBoundingClientRect();
      el.style.justifyContent = 'flex-start'; el.style.alignItems = 'flex-start';
      el.style.padding = Math.round(r.top) + 'px 0 0 ' + Math.round(r.left) + 'px';
      Array.prototype.forEach.call(el.children, function (panel) { panel.style.maxHeight = Math.round(r.height) + 'px'; });
    } else {
      el.style.justifyContent = el.style.alignItems = el.style.padding = '';
      Array.prototype.forEach.call(el.children, function (panel) { panel.style.maxHeight = ''; });
    }
  }
  function open(name) {
    back.push(screen);
    if (name === 'controls') buildControls();
    if (name === 'howto') buildHowto();
    if (name === 'scores') buildScores(scoresMode);
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

  function refreshMenu() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-best]'), function (em) {
      var mode = em.dataset.best, best = bestOf(currentKey(mode));
      em.textContent = best ? (mode === 'sprint' ? '' : 'Best ') + fmtBest(mode, best) : '';
    });
    var done = Lessons.filter(function (ls) { return passed.indexOf(ls.title) >= 0; }).length;
    $('tut-count').textContent = done ? done + ' of ' + Lessons.length : '';
    var fresh = !passed.length && !Object.keys(scores).length;
    document.querySelector('[data-mode="tutorial"]').classList.toggle('suggest', fresh);
    refreshSettings();
  }

  function refreshSettings() {
    var w = $('set-width'); w.textContent = '';
    [10, 12, 14, 16, 18].forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = n;
      b.setAttribute('aria-pressed', settings.width === n);
      b.addEventListener('click', function () { settings.width = n; changed(); });
      w.appendChild(b);
    });
    var z = $('set-sizes'); z.textContent = '';
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = n;
      b.title = 'Pieces of ' + n + (n === 1 ? ' square' : ' squares');
      b.setAttribute('aria-pressed', settings.sizes.indexOf(n) >= 0);
      b.addEventListener('click', function () {
        var i = settings.sizes.indexOf(n);
        if (i >= 0 && settings.sizes.length > 1) settings.sizes.splice(i, 1);
        else if (i < 0) settings.sizes.push(n);
        settings.sizes.sort(); changed();
      });
      z.appendChild(b);
    });
    var sq = $('set-squares'); sq.textContent = '';
    SQUARE_SETS.forEach(function (set) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = set[1];
      b.setAttribute('aria-pressed', settings.squares === set[0]);
      b.addEventListener('click', function () { settings.squares = set[0]; changed(); });
      sq.appendChild(b);
    });
    SQUARE_SETS.forEach(function (set) { if (set[0] === settings.squares) $('squares-hint').textContent = set[2]; });
    var hd = $('set-hand'), hand = handOf(); hd.textContent = '';
    [['left', 'Left-handed'], ['right', 'Right-handed']].forEach(function (h) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = h[1];
      b.title = h[0] === 'right' ? 'Move with the arrows, turn with Z, X, A and C' : 'Move with A, S and D, turn with J, K, L and I';
      b.setAttribute('aria-pressed', hand === h[0]);
      b.addEventListener('click', function () { setHand(h[0]); refreshSettings(); });
      hd.appendChild(b);
    });
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
  function changed() {
    save('settings', settings);
    refreshMenu();
    if (!game) { startDemo(); layout(); hudForDemo(); schedule(); }
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
  function saveControls() { save('controls', { keys: keys, timing: timing }); showKeys(); if (screen === 'menu') refreshSettings(); }
  [['controls-right', 'right', 'Right-handed'], ['controls-left', 'left', 'Left-handed']].forEach(function (c) {
    $(c[0]).addEventListener('click', function () {
      timing = Object.assign({}, DEFAULT_TIMING);
      setHand(c[1]); buildControls();
      $('control-note').textContent = c[2] + ': every key and timing is back to its default.';
    });
  });

  var scoresMode = 'marathon';
  function buildScores(mode) {
    scoresMode = mode;
    var tabs = $('scores-tabs'); tabs.textContent = '';
    ['marathon', 'grow', 'sprint', 'blitz'].forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = MODES[m];
      b.setAttribute('aria-pressed', m === mode);
      b.addEventListener('click', function () { buildScores(m); });
      tabs.appendChild(b);
    });
    $('scores-scope').textContent = 'For the settings now chosen: ' + settings.width + ' wide' +
      (mode === 'grow' ? '' : ', pieces of ' + settings.sizes.join(', ') + ' squares') + ', ' + squaresName(settings.squares) + '. Kept in this browser.';
    scoreTable($('scores-table'), currentKey(mode), mode, null);
  }

  // The HUD ------------------------------------------------------------------------------------

  function showKeys() {
    function k(a) { return keys[a].map(function (c) { return '<kbd>' + codeName(c).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</kbd>'; }).join(' '); }
    $('keys').innerHTML = k('left') + ' ' + k('right') + ' move &nbsp;' + k('soft') + ' soft drop<br>' + k('hard') + ' hard drop &nbsp;' +
      k('flip') + ' flip<br>' + k('ccw') + ' ' + k('cw') + ' rotate<br>' + k('cycle') + ' cycle &nbsp;' + k('pause') + ' pause';
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
      $('mode-label').textContent = MODES[run.mode] + ' · ' + squaresName(game.squares) + ' · ' + game.width + ' wide' + (run.practice ? ' · practice' : '');
    }
    $('time-label').textContent = run.mode === 'blitz' ? 'Time left' : 'Time';
    var best = bestOf(run.key);
    $('best').textContent = best ? fmtBest(run.mode, best) : '–';
    $('score').textContent = '0'; $('level').textContent = game.level; $('rows').textContent = run.mode === 'sprint' ? '0 of 40' : '0';
  }
  function hudForDemo() {
    $('left').classList.remove('in-lesson');
    $('mode-label').textContent = 'Title screen';
    $('score').textContent = '0'; $('level').textContent = '–'; $('rows').textContent = '–'; $('time').textContent = '–';
    var best = bestOf(currentKey('marathon'));
    $('best').textContent = best ? fmtBest('marathon', best) : '–';
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
    $('level').textContent = game.level;
    $('rows').textContent = run.mode === 'sprint' ? Math.min(game.rowsCleared, 40) + ' of 40' : game.rowsCleared;
    var ms = game.ticks * STEP;
    $('time').textContent = run.mode === 'blitz' ? fmtTime(Math.max(0, Rules.BLITZ_TICKS * STEP - ms)).replace(/\.\d$/, '') : fmtTime(ms).replace(/\.\d$/, '');
  }

  // Layout ---------------------------------------------------------------------------------------

  function layout() {
    var g = active(), W = g ? g.width : settings.width, phone = isPhone();
    Draw.logo($('logo'), phone ? 4 : 7);   // before measuring: a blank canvas is 300 x 150
    var board = $('board'), left = $('left'), gameEl = $('game');
    var wellCols = Draw.GAUGE + W + 0.2, wellRows = Draw.TOP + Rules.ROWS + 0.4, s, row = false;
    if (phone) {
      gameEl.style.paddingTop = ''; left.style.height = ''; left.style.width = '';
      var availW = root.innerWidth - 32, availH = root.innerHeight - left.getBoundingClientRect().height - (58 * 2 + 8) - 10 - 12 - 16 - 8;
      var side = Math.floor(Math.min((availW - 4) / (wellCols + 0.6 * 5.7), availH / wellRows));
      var top = Math.floor(Math.min(availW / wellCols, (availH - 16 - 2) / (wellRows + 0.6 * 5)));
      row = top > side; s = Math.max(8, Math.max(side, top));
    } else {
      var leftW = titling() ? 460 : 236;
      left.style.width = leftW + 'px';
      s = Math.max(10, Math.floor(Math.min((root.innerHeight - 40) / wellRows, (root.innerWidth - leftW - 60) / (wellCols + 5.7), 42)));
    }
    board.classList.toggle('top', row);
    var q = phone ? Math.round(s * 0.6) : s;
    Draw.layout(W, s, { cell: q, row: row, width: Math.round(wellCols * s), height: Math.round(wellRows * s) });
    var wellH = Math.round(wellRows * s);
    if (!phone) { gameEl.style.paddingTop = Math.max(0, (root.innerHeight - wellH) / 2) + 'px'; left.style.height = wellH + 'px'; }
    if (g) { Draw.frame(g, performance.now()); Draw.queue(g, performance.now()); }
    placeScreen();
  }
  function paintBackground() {
    Draw.wallpaper($('wall'), isLight());
    Draw.logo($('biglogo'), isPhone() ? 9 : 12);
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

  function fromAddress() {
    var h = new URLSearchParams(root.location.hash.replace(/^#/, ''));
    var mode = h.get('mode');
    if (!mode || !MODES[mode]) return false;
    if (mode === 'tutorial') {
      var n = Math.max(1, Math.min(Lessons.length, +h.get('lesson') || 1));
      start('tutorial', { lesson: n - 1 });
      return true;
    }
    var opts = {};
    var w = +h.get('width');
    if ([10, 12, 14, 16, 18].indexOf(w) >= 0) opts.width = w;
    if (h.get('sizes')) { var sz = h.get('sizes').split('').map(Number).filter(function (x) { return x >= 1 && x <= 5; }); if (sz.length) opts.sizes = sz; }
    if (Rules.SQUARES[h.get('squares')]) opts.squares = h.get('squares');
    else if (h.get('specials') != null) opts.squares = h.get('specials') === '0' ? 'pure' : 'pentrys';
    if (+h.get('level') > 1) opts.level = Math.min(Rules.TOP_LEVEL, Math.floor(+h.get('level')));
    if (h.get('seed') != null && h.get('seed') !== '') opts.seed = Math.floor(+h.get('seed')) >>> 0;
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
