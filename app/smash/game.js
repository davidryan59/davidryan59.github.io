/* The rules of Smash Screen: the title screen and the two modes.

   Fun Mode is the toy: every weapon, no clock, no score, a new device
   whenever you like, and your own picture if you want one. Anger Mode is
   the game: destroy every pixel of the picture before the clock runs out,
   one device per level, earning the weapons as you go. The screen has its
   Damage bar and you have your Health bar. Loose glass and keys fly at
   you, your own left hand holds the device, and a weapon held back too
   long comes back at you.

   The engine in smash.js draws and takes input; it calls the hooks below
   when something happens. Everything here that is timed runs on the game's
   own clock, which stops while the game is paused. */
(function () {
  'use strict';

  var S = window.Smash, E = S.engine, D = S.Damage, Sound = S.Sound, Music = S.Music, Hands = S.Hands;
  var TAU = 2 * Math.PI;
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + (b - a) * Math.random(); }
  function pad(n) { return String(Math.max(0, Math.round(n))).padStart(6, '0'); }

  var stage = $('stage'), fx = $('fx'), fc = fx.getContext('2d');
  var hud = $('hud'), bar = $('weapons'), announceEl = $('announce'), statusEl = $('status');
  var hoverNone = window.matchMedia && matchMedia('(hover: none)').matches;

  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function tell(text) { statusEl.textContent = text; }

  /* ------------------------------------------------------------ voice */

  // An announcer in the browser's own speech voice, as in Dino Dash.
  var voiceOn = load('smash-voice', true);
  function say(text) {
    if (!voiceOn || Sound.muted() || !('speechSynthesis' in window)) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 0.6;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ------------------------------------------------------------- state */

  var ORDER = ['phone', 'tablet', 'laptop', 'monitor'];
  var UNLOCK = { finger: 1, fist: 1, hammer: 1, fish: 2, banana: 3, bomb: 4, lightning: 5 };
  var SELF = { hammer: [10, 'BONK!'], fist: [8, 'STOP HITTING YOURSELF!'], finger: [6, 'OW, MY EYE!'], fish: [5, 'SPLAT!'],
               banana: [4, 'SQUISH!'], bomb: [35, 'KABOOM!'], lightning: [30, 'ZAP!'] };
  var GRIP = { phone: 64, tablet: 56, monitor: 40 };
  // The screen is K.O. when 1% of the picture is left, and what is left
  // flashes once less than 5% remains.
  var KO = 0.99, WARN = 0.95;

  var G = {
    mode: 'title', phase: 'idle', level: 1, score: 0, health: 100, power: 0, combo: 0, lastHitAt: -9,
    practice: false, timeLeft: 0, limit: 0, lost: false, weapons: {}, prev: 'hammer', paused: false,
    fun: { done: false, start: 0, blows: 0, count: 0 },
    hand: { x: 320, y: 0, reach: 0, hurt: -1, hurtAt: -9, pullAt: -9, dev: null, hidden: true }
  };
  var gt = 0, lastT = 0, timers = [], shots = [], pending = [], pops = [], effects = [];
  var pointer = { x: -999, y: -999, shown: false };
  var fw = 0, fh = 0, fdpr = 1, lastSecond = -1, hintAt = 0, nearly = false, attract = { next: 0, blows: 0 }, runs = 0;

  function later(sec, fn) { timers.push({ at: gt + sec, fn: fn }); }

  // How long each level allows. Early levels are generous; each level
  // takes about 7% off, down to a floor.
  function timeLimit(L, type) {
    var f = { phone: 1.1, tablet: 0.95, laptop: 1, monitor: 1 }[type] || 1;
    return Math.max(36, Math.round(90 * f * Math.max(0.45, Math.pow(0.93, L - 1))));
  }
  function flight() { return G.mode === 'anger' ? Math.max(0.5, 0.95 - 0.035 * (G.level - 1)) : 0.95; }
  function unlocked(id) { return G.mode !== 'anger' || G.level >= UNLOCK[id]; }

  /* ------------------------------------------------------------ layout */

  E.hooks.resize = function (sw, sh, dpr) {
    fw = sw;
    fh = sh;
    fdpr = dpr;
    fx.width = Math.round(sw * dpr);
    fx.height = Math.round(sh * dpr);
  };

  function setPads() {
    E.pads.top = G.mode === 'anger' ? hud.offsetHeight + 4 : 0;
    E.pads.bottom = G.mode === 'title' ? 0 : bar.offsetHeight + 6;
  }

  /* ------------------------------------------------------ the announcer */

  var annTimer = 0;
  function announce(text, style, hold) {
    announceEl.textContent = text;
    announceEl.className = 'announce ' + (style || '');
    void announceEl.offsetWidth;
    announceEl.classList.add('show');
    clearTimeout(annTimer);
    annTimer = setTimeout(function () { announceEl.classList.remove('show'); }, (hold || 1.1) * 1000);
  }
  function pop(text, x, y, color, size) {
    pops.push({ text: text, x: x, y: y, t0: gt, color: color || '#ffe14d', size: size || 18 });
  }

  /* --------------------------------------------------------------- HUD */

  function updateHud() {
    if (G.mode !== 'anger') return;
    $('hp').style.width = G.health + '%';
    $('hp').className = G.health < 30 ? 'low' : '';
    $('pw').style.width = G.power + '%';
    $('pw').className = G.power >= 100 ? 'full' : '';
    $('score').textContent = pad(G.score);
    $('level').textContent = 'LEVEL ' + G.level;
    var d = E.device();
    if (d) $('dev-name').textContent = d.type.toUpperCase();
    refreshBar();
  }
  // The bar reads 100% at the K.O., with 1% of the picture still alive.
  function updateDamage(frac) {
    frac = Math.min(1, frac / KO);
    var pct = Math.floor(frac * 100);
    $('dmg').style.width = (100 - frac * 100).toFixed(1) + '%';
    $('dmg-text').textContent = 'DAMAGE ' + pct + '%';
  }
  function updateTimer() {
    var s = Math.max(0, Math.ceil(G.timeLeft));
    if (s === lastSecond) return;
    lastSecond = s;
    var el = $('timer');
    el.textContent = s;
    el.className = 'timer' + (s <= 10 && G.phase === 'play' ? ' low' : '');
    if (s <= 10 && s > 0 && G.phase === 'play') Sound.tick();
  }

  /* ------------------------------------------------------------ music */

  // The title screen has its tune. The game's plays only while the player
  // is smashing: not in a level's introduction, at a K.O., at the end of a
  // run or while paused. Each level starts it from the top, a little
  // faster each level; a pause resumes it where it stopped.
  function syncMusic() {
    if (G.mode === 'title') Music.want('title', 'title');
    else if (G.mode === 'anger' && G.phase === 'play' && !G.paused) Music.want('game', 'level-' + runs, Math.min(156, 138 + 3 * (G.level - 1)));
    else if (G.mode === 'fun' && !G.fun.done) Music.want('game', 'fun-' + runs);
    else Music.want(null);
  }

  /* ---------------------------------------------------------- weapons */

  function buildBar() {
    bar.innerHTML = '';
    Hands.WEAPONS.forEach(function (w) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wpn';
      b.dataset.id = w.id;
      b.innerHTML = Hands.icon(w.id) + '<span class="k">' + w.key + '</span><span class="lock" aria-hidden="true"></span>';
      b.addEventListener('click', function () {
        pick(w.id);
        stage.focus({ preventScroll: true });
      });
      bar.appendChild(b);
    });
    refreshBar();
  }
  function refreshBar() {
    Array.prototype.forEach.call(bar.children, function (b) {
      var id = b.dataset.id, w = Hands.weapon(id), open = unlocked(id);
      var ready = !w.special || G.mode !== 'anger' || G.power >= 100;
      b.classList.toggle('on', E.weapon === id);
      b.classList.toggle('locked', !open);
      b.classList.toggle('dim', open && !ready);
      b.setAttribute('aria-pressed', E.weapon === id ? 'true' : 'false');
      var label = w.label + ' (key ' + w.key + ')' + (!open ? ', unlocks at level ' + UNLOCK[id] : !ready ? ', needs a full Power bar' : '');
      b.title = label;
      b.setAttribute('aria-label', label);
    });
  }
  function pick(id) {
    if (G.mode === 'title') return;
    if (!unlocked(id)) {
      pop('UNLOCKS AT LEVEL ' + UNLOCK[id], fw / 2, fh - 90, '#ff9e9e', 14);
      E.request();
      return;
    }
    E.setWeapon(id);
    if (!Hands.weapon(id).special) G.prev = id;
    refreshBar();
    tell(Hands.weapon(id).label + ' selected.');
  }

  /* ------------------------------------------------------ the left hand */

  // A grip the left hand might take: where along the edge, and how far
  // the fingers reach over the glass. It ranges further at each level.
  function grip(d, L) {
    if (d.type === 'laptop') return { x: rand(190, 620), y: 0, reach: 0 };
    var w = GRIP[d.type] || 40, base = w * Math.min(2.4, 0.25 + 0.14 * (L - 1)), amp = w * Math.min(1.6, 0.5 + 0.1 * L);
    return { x: 320, y: d.H * rand(0.3, 0.7), reach: base + amp * Math.random() };
  }
  function gripAt(h, T) {
    var f = clamp((T - h.moveAt) / h.moveDur, 0, 1), a = h.from, b = h.to;
    f = f * f * (3 - 2 * f);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, reach: a.reach + (b.reach - a.reach) * f };
  }

  // In Anger Mode the hand holds still, then now and then shuffles to a
  // new grip, more often at each level.
  function updateLeft(T) {
    var d = E.device(), h = G.hand;
    if (!d) return;
    var w = GRIP[d.type] || 40, pull = clamp(1 - (T - h.pullAt) / 1.6, 0, 1), p;
    if (G.mode === 'anger') {
      var L = G.level;
      if (h.dev !== d) {
        h.dev = d;
        h.from = h.to = grip(d, L);
        h.moveAt = -9;
        h.moveDur = 1;
        h.nextAt = T + rand(1, 3);
      }
      if (T >= h.nextAt) {
        h.from = gripAt(h, T);
        h.to = grip(d, L);
        h.moveAt = T;
        h.moveDur = d.type === 'laptop' ? rand(0.35, 0.7) : rand(0.25, 0.5);
        h.nextAt = T + h.moveDur + rand(1.2, 4.5) / (1 + 0.12 * (L - 1));
      }
      p = gripAt(h, T);
    } else {
      p = { x: 320, y: d.H * 0.56, reach: d.type === 'laptop' ? 0 : w * 0.35 };
    }
    h.x = p.x;
    h.y = p.y;
    h.reach = d.type === 'laptop' ? 0 : p.reach - pull * w * 2;
  }

  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    var t = L ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L, 0, 1) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
  }

  E.hooks.drawOver = function (c, t, d) {
    if (G.hand.hidden || !d) return;
    updateLeft(gt);
    Hands.drawLeft(c, d, { x: G.hand.x, y: G.hand.y, reach: G.hand.reach, hurt: G.hand.hurt, hurtAt: G.hand.hurtAt, t: gt });
  };

  // A blow on the player's own fingers lands there and not on the screen.
  // A bomb's blast still breaks the screen, and hurts the hand as well.
  E.hooks.beforeContact = function (info) {
    if (G.mode === 'title' || G.hand.hidden) return true;
    var d = E.device(), m = Math.min(d.W, d.H), w = info.weapon;
    var r = Hands.weapon(w).reach * m * (w === 'bomb' ? 1 : 0.5), hit = null;
    Hands.parts(d, G.hand).forEach(function (p) {
      if (!hit && segDist(info.u, p.a, p.b) <= p.r + r) hit = p;
    });
    if (!hit) return true;
    G.hand.hurt = hit.i;
    G.hand.hurtAt = gt;
    G.hand.pullAt = gt;
    var st = E.toStage(info.u);
    if (w === 'bomb') {
      hurt(20, st[0], st[1]);
      pop('OUCH!', st[0], st[1] - 30, '#ff7a6e', 22);
      return true;
    }
    hurt(12, st[0], st[1]);
    pop('OUCH!', st[0], st[1] - 30, '#ff7a6e', 22);
    say('Ouch!');
    return false;
  };

  /* ---------------------------------------------------- flying things */

  // Loose glass and keys fly at the player, growing as they come. Each one
  // leaves in a random direction away from the weapon, so it does not fly
  // into the hand by itself. The hand swats one by passing over it. One
  // that arrives hurts. Glass takes 2 to 4 times as long as a key.
  function heading(x0, y0) {
    var on = pointer.x > -900 && Math.hypot(x0 - pointer.x, y0 - pointer.y) > 4, away = Math.atan2(y0 - pointer.y, x0 - pointer.x);
    var D = Math.max(110, Math.min(fw, fh) * rand(0.22, 0.4)), end = null;
    for (var i = 0; i < 10; i++) {
      var a = on && i < 6 ? away + rand(-1.2, 1.2) : rand(0, TAU), x = x0 + Math.cos(a) * D, y = y0 + Math.sin(a) * D;
      end = [clamp(x, 40, fw - 40), clamp(y, 40, fh - 40)];
      if (end[0] === x && end[1] === y) break;
    }
    return end;
  }
  function spawnChip(poly) {
    var img = E.chipImage(poly), c = [0, 0];
    poly.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; });
    var st = img ? [img.x, img.y] : E.toStage([c[0] / poly.length, c[1] / poly.length]), end = heading(st[0], st[1]);
    var w = img ? img.w : 10, h = img ? img.h : 10;
    shots.push({ kind: 'chip', img: img && img.canvas, x0: st[0], y0: st[1], x1: end[0], y1: end[1], w: Math.max(5, w), h: Math.max(5, h),
                 t0: gt, dur: flight() * rand(0.9, 1.15) * rand(2, 4), spin: rand(-7, 7), dmg: 6 });
    Sound.whoosh();
  }
  function spawnKey(k) {
    var st = E.toStage(k.c), w = Math.max(16, 100 * E.scale()), end = heading(st[0], st[1]);
    shots.push({ kind: 'key', label: k.label, x0: st[0], y0: st[1], x1: end[0], y1: end[1], w: w, h: w * 0.8, t0: gt,
                 dur: flight() * rand(0.95, 1.2), spin: rand(-9, 9), dmg: 5 });
  }
  // Fast off the glass, then slower as it closes on the player.
  function shotState(s, T) {
    var el = T - s.t0, tau = clamp(el / s.dur, 0, 1), grow = clamp(90 / Math.max(s.w, s.h), 2.5, 10), go = 1 - (1 - tau) * (1 - tau);
    if (s.swat) {
      var e2 = T - s.swat;
      return { x: s.sx + s.svx * e2, y: s.sy + s.svy * e2 + 400 * e2 * e2, sc: s.ssc, rot: s.spin * el * 3, tau: tau, a: clamp(1 - e2 / 0.45, 0, 1) };
    }
    return { x: s.x0 + (s.x1 - s.x0) * go, y: s.y0 + (s.y1 - s.y0) * go,
             sc: 1 + (grow - 1) * Math.pow(tau, 2.2), rot: s.spin * el, tau: tau, a: 1 };
  }
  // A piece leaves from right under the weapon, so it cannot be swatted
  // until it has flown a quarter of the way: the hand has to go after it.
  function shotAt(x, y) {
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      if (s.swat || gt - s.t0 < s.dur * 0.25) continue;
      var p = shotState(s, gt), r = Math.max(s.w, s.h) * p.sc / 2 + (hoverNone ? 26 : 16);
      if (Math.hypot(p.x - x, p.y - y) <= r) return s;
    }
    return null;
  }
  function swat(s, x, y) {
    var p = shotState(s, gt), dx = p.x - x, dy = p.y - y, L = Math.hypot(dx, dy) || 1;
    s.swat = gt;
    s.sx = p.x;
    s.sy = p.y;
    s.ssc = p.sc;
    s.svx = dx / L * 900 + (dx >= 0 ? 200 : -200);
    s.svy = dy / L * 600 - 200;
    Sound.swat();
    pop('SWAT!', p.x, p.y - 20, '#8fe3ff', 16);
    if (G.mode === 'anger' && G.phase === 'play') {
      G.score += 20;
      G.power = Math.min(100, G.power + 4);
      updateHud();
    }
  }

  E.hooks.pointer = function (x, y, shown) {
    pointer.x = x;
    pointer.y = y;
    pointer.shown = shown;
  };
  // A press on something flying swats it, and does not swing.
  E.hooks.press = function (x, y) {
    if (G.mode === 'title') return false;
    var s = shotAt(x, y);
    if (s) {
      swat(s, x, y);
      E.request();
      return false;
    }
    return true;
  };

  /* ------------------------------------------------------------- harm */

  function hurt(n, x, y) {
    effects.push({ kind: 'red', t0: gt, dur: 0.45, a: Math.min(0.55, 0.22 + n / 40) });
    Sound.hurt();
    if (G.mode !== 'anger' || G.phase !== 'play') return;
    // Rounded, so that fractions of a point do not pile up float error.
    G.health = Math.max(0, Math.round((G.health - n) * 100) / 100);
    G.lost = true;
    if (x !== undefined) pop('-' + n, x, y, '#ff5a5a', 18);
    updateHud();
    if (G.health <= 0) die();
    else if (G.health < 30) tell('Health low: ' + G.health + '.');
  }

  E.hooks.selfHit = function (w) {
    var s = SELF[w];
    announce(s[1], 'self', 1.3);
    say(s[1].replace(/!/g, '').toLowerCase());
    effects.push({ kind: 'self-' + w, t0: gt, dur: w === 'bomb' ? 2.4 : 1.7, seed: Math.random() * 1e9 });
    if (w === 'finger') {
      var bl = $('blur');
      bl.className = 'blur ' + (Math.random() < 0.5 ? 'left' : 'right') + ' on';
      setTimeout(function () { bl.className = 'blur'; }, 1400);
    }
    hurt(s[0]);
    if (Hands.weapon(w).special) E.hooks.used(w);
  };

  E.hooks.used = function (id) {
    if (G.mode !== 'anger') return;
    G.power = 0;
    E.setWeapon(G.prev || 'hammer');
    updateHud();
  };

  E.hooks.canPress = function (id) {
    if (G.mode !== 'anger') return true;
    if (G.phase !== 'play' || G.paused) return false;
    if (Hands.weapon(id).special && G.power < 100) {
      pop('NEED FULL POWER', pointer.x, pointer.y - 40, '#b9a2ff', 14);
      E.request();
      return false;
    }
    return true;
  };

  /* ------------------------------------------------------ each blow */

  E.hooks.contact = function (info) {
    if (G.mode === 'title') return;
    var d = E.device(), gl = E.glass(), hit = info.hit, st = E.toStage(info.u), m = Math.min(d.W, d.H);
    // Poking cracked glass cuts the finger.
    if (info.weapon === 'finger' && info.region === 'screen' && D.nearCrack(gl, info.u[0], info.u[1], m * 0.012)) {
      hurt(0.2, st[0], st[1]);
      pop('CUT!', st[0], st[1] - 34, '#ff7a6e', 16);
    }
    // Lightning finds any finger on the glass.
    if (info.weapon === 'lightning' && !G.hand.hidden && Hands.onGlass(d, G.hand)) {
      G.hand.hurt = 1;
      G.hand.hurtAt = gt;
      G.hand.pullAt = gt;
      effects.push({ kind: 'shock', t0: gt, dur: 0.7 });
      announce('SHOCKED!', 'self', 1.1);
      hurt(25);
    }
    if (hit) {
      hit.holes.forEach(function (h) { pending.push({ at: gt + h.t, poly: h.poly }); });
      G.weapons[hit.index] = info.weapon;
    }
    info.keys.forEach(spawnKey);
    if (G.mode === 'fun' && hit) {
      if (!G.fun.blows) G.fun.start = info.t;
      G.fun.blows++;
    }
    if (G.mode !== 'anger' || G.phase !== 'play') return;

    var pct = hit ? hit.newDead / gl.grid.count * 100 : 0, gain = 0, labels = [];
    if (pct > 0.05) {
      G.combo = gt - G.lastHitAt < 1.6 ? G.combo + 1 : 1;
      G.lastHitAt = gt;
    } else {
      G.combo = 0;
    }
    var mult = Math.max(1, Math.min(8, G.combo)), base = 10 * pct * (info.weapon === 'banana' ? 2 : 1) * (info.perfect ? 1.5 : 1);
    gain += Math.round(base * mult);
    var power = pct;
    if (info.perfect) { labels.push('PERFECT!'); power += 8; }
    if (mult > 1) { labels.push('COMBO ×' + mult); power += 4; }
    if (pct >= 15) { gain += 300; labels.push('BLACKOUT!'); power += 12; say('Blackout!'); }
    if (hit && hit.lit >= 20) { gain += 150; labels.push('RAINBOW!'); power += 8; }
    gain += info.keys.length * 15 + (info.dent ? 10 : 0);
    var was = G.power;
    G.power = Math.min(100, G.power + power);
    if (was < 100 && G.power >= 100 && (unlocked('bomb') || unlocked('lightning'))) {
      Sound.chime();
      announce('POWER READY!', 'power', 1.2);
      say('Power ready');
    }
    G.score += gain;
    if (gain) pop('+' + gain, st[0], st[1] - 18, '#ffe14d', 20);
    labels.forEach(function (l, i) { pop(l, st[0], st[1] - 44 - i * 22, i ? '#9fe8ff' : '#ffffff', 15); });
    updateHud();
  };

  /* ---------------------------------------------------- level and run */

  function clearFx() {
    shots = [];
    pending = [];
    pops = [];
    effects = [];
    E.offset = [0, 0];
    $('blur').className = 'blur';
  }

  function startLevel(L) {
    G.level = L;
    runs++;
    G.phase = 'intro';
    G.lost = false;
    G.weapons = {};
    G.combo = 0;
    G.lastHitAt = -9;
    lastSecond = -1;
    hintAt = gt + 2;
    var type = ORDER[(L - 1) % 4];
    clearFx();
    E.newDevice({ device: type });
    G.limit = G.timeLeft = timeLimit(L, type);
    G.hand.dev = null;
    G.hand.hurt = -1;
    G.hand.hidden = false;
    G.hand.pullAt = -9;
    E.locked = true;
    if (!unlocked(E.weapon)) E.setWeapon('hammer');
    updateHud();
    updateDamage(0);
    updateTimer();
    var pic = E.picture();
    $('caption').textContent = 'Level ' + L + ': a ' + type + ' showing ' + pic.scene.label + '. ' + G.limit + ' seconds.';
    tell('Level ' + L + '. A ' + type + '. You have ' + G.limit + ' seconds.');
    Sound.level();
    announce('LEVEL ' + L, 'big', 1);
    say('Level ' + L);
    var fresh = Hands.WEAPONS.filter(function (w) { return UNLOCK[w.id] === L && L > 1; }), at = 1.1;
    fresh.forEach(function (w) {
      later(at, function () {
        announce('NEW WEAPON: ' + w.label.toUpperCase(), 'power', 1.3);
        say('New weapon. ' + w.label);
        Sound.chime();
        var b = bar.querySelector('[data-id="' + w.id + '"]');
        if (b) { b.classList.remove('new'); void b.offsetWidth; b.classList.add('new'); }
      });
      at += 1.4;
    });
    later(at, function () {
      announce('FIGHT!', 'big', 0.8);
      say('Fight!');
      G.phase = 'play';
      E.locked = false;
    });
  }

  function ko() {
    G.phase = 'ko';
    E.locked = true;
    E.lower();
    Sound.ko();
    announce('K.O.!', 'big ko', 1.2);
    say('K O!');
    tell('K.O. The screen is destroyed.');
    var bonus = [], killer = G.weapons[D.lastBlow(E.glass(), KO)];
    if (killer === 'banana') bonus.push(['BANANALITY!', 1500, 'Bananality!']);
    if (killer === 'fish') bonus.push(['FISHALITY!', 1500, 'Fishality!']);
    if (!G.lost) bonus.push(['FLAWLESS!', 1000, 'Flawless!']);
    var tb = Math.floor(G.timeLeft) * 20;
    if (tb > 0) bonus.push(['TIME BONUS', tb]);
    var at = 1.4;
    bonus.forEach(function (b) {
      later(at, function () {
        G.score += b[1];
        announce(b[0] + ' +' + b[1], 'bonus', 1);
        if (b[2]) say(b[2]);
        Sound.chime();
        updateHud();
      });
      at += 1.15;
    });
    later(at, function () {
      if (G.health < 100) pop('+25 HEALTH', fw * 0.2, 70, '#7dff9a', 16);
      G.health = Math.min(100, G.health + 25);
      updateHud();
    });
    later(at + 1, function () { startLevel(G.level + 1); });
  }

  function stopPlay() {
    E.locked = true;
    E.lower();
    E.stopBombs();
    shots = [];
    pending = [];
  }

  function timeout() {
    G.phase = 'timeout';
    stopPlay();
    announce('TIME UP!', 'big', 1);
    say("Time's up!");
    tell('Time up.');
    G.hand.hidden = true;
    var ending = Math.random() < 0.5 ? 'legs' : 'repair';
    later(0.9, function () {
      effects.push({ kind: ending, t0: gt, dur: 3, hold: true, clean: ending === 'repair' ? E.cleanImage() : null });
      if (ending === 'legs') Sound.run();
      else { Sound.repair(); later(1.5, function () { say('Nice try!'); }); }
    });
    later(4.2, function () { gameOver('Out of time'); });
  }

  function die() {
    G.phase = 'dead';
    stopPlay();
    var drips = [];
    for (var i = 0; i < 22; i++) drips.push([Math.random(), rand(8, 30), rand(90, 300), rand(0, 0.8)]);
    effects.push({ kind: 'blood', t0: gt, dur: 3.2, hold: true, drips: drips });
    Sound.over();
    later(0.4, function () { announce('GAME OVER', 'big over', 2.2); say('Game over'); });
    tell('Game over. Out of Health.');
    later(3, function () { gameOver('Out of Health'); });
  }

  /* ------------------------------------------------------ high scores */

  function scores() { return load('smash-scores', []); }
  function renderScores(el, list, mark) {
    el.innerHTML = '';
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'none';
      li.textContent = 'No scores yet. Be the first.';
      el.appendChild(li);
      return;
    }
    list.forEach(function (s, i) {
      var li = document.createElement('li');
      if (i === mark) li.className = 'mine';
      li.innerHTML = '<span class="n"></span><span class="s"></span><span class="l"></span>';
      li.children[0].textContent = s.n;
      li.children[1].textContent = pad(s.s);
      li.children[2].textContent = 'L' + s.l;
      el.appendChild(li);
    });
  }

  function gameOver(reason) {
    G.phase = 'over';
    var list = scores(), fits = !G.practice && G.score > 0 && (list.length < 10 || G.score > list[list.length - 1].s);
    $('over-reason').textContent = reason + '. You reached level ' + G.level + '.' + (G.practice ? ' A run started part way is practice, and not scored.' : '');
    $('over-score').textContent = pad(G.score);
    $('initials').hidden = !fits;
    renderScores($('over-scores'), list);
    show('over');
    if (fits) {
      var inp = $('initials-in');
      inp.value = load('smash-initials', '');
      setTimeout(function () { inp.focus({ preventScroll: true }); inp.select(); }, 50);
    } else {
      setTimeout(function () { $('again').focus({ preventScroll: true }); }, 50);
    }
  }
  $('initials').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = ($('initials-in').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'YOU';
    save('smash-initials', n);
    var entry = { n: n, s: G.score, l: G.level, d: new Date().toISOString().slice(0, 10) };
    var list = scores().concat([entry]).sort(function (a, b) { return b.s - a.s; }).slice(0, 10);
    save('smash-scores', list);
    $('initials').hidden = true;
    renderScores($('over-scores'), list, list.indexOf(list.filter(function (s) { return s === entry || (s.n === entry.n && s.s === entry.s && s.d === entry.d); })[0]));
    $('again').focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------ modes */

  var PANELS = ['title', 'over', 'paused'];
  function show(name) {
    PANELS.forEach(function (p) { $(p).hidden = p !== name; });
  }

  function setMode(mode) {
    G.mode = mode;
    E.mode = mode;
    G.paused = false;
    timers = [];
    E.stopBombs();
    stage.className = 'stage mode-' + mode;
    hud.hidden = mode !== 'anger';
    bar.hidden = mode === 'title';
    $('fun-tools').hidden = mode !== 'fun';
    $('zoom').hidden = mode !== 'fun';
    $('pause').hidden = mode !== 'anger';
    $('menu').hidden = mode === 'title';
    E.zoomable = mode === 'fun';
    E.maxHits = mode === 'fun' ? 160 : mode === 'anger' ? 800 : 40;
    E.resetView();
    var touch = hoverNone;
    $('hint').textContent = mode === 'title' ? 'Pick a mode. Fun Mode is for smashing; Anger Mode is the game.'
      : mode === 'fun' ? (touch ? 'Tap to swing. Hold longer for a harder hit. Pinch to zoom. Pick a weapon below.'
                                : 'Click to swing. Hold longer for a harder hit. Keys 1–7 pick a weapon. Scroll to zoom.')
      : (touch ? 'Destroy every pixel before the clock runs out. Swipe away flying glass. Mind your own fingers.'
               : 'Destroy every pixel before the clock runs out. Swat flying glass with your hand. Mind your own fingers.');
    if (mode !== 'title') buildBar();
    setPads();
  }

  function showTitle() {
    setMode('title');
    clearFx();
    E.locked = true;
    G.hand.hidden = true;
    show('title');
    renderScores($('title-scores'), scores().slice(0, 5));
    $('caption').textContent = '';
    E.newDevice();
    attract = { next: gt + 0.6, blows: 0 };
    E.request();
    setTimeout(function () { $('play-fun').focus({ preventScroll: true }); }, 30);
  }

  function startFun(want) {
    setMode('fun');
    runs++;
    clearFx();
    show(null);
    E.locked = false;
    G.hand.hidden = false;
    G.hand.hurt = -1;
    E.hideHand();
    E.setWeapon(G.prev || 'hammer');
    refreshBar();
    E.newDevice(want || {});
    stage.focus({ preventScroll: true });
    tell('Fun Mode. Swing away.');
  }

  function startAnger(level, practice) {
    setMode('anger');
    show(null);
    G.score = 0;
    G.health = 100;
    G.power = 0;
    G.practice = !!practice;
    G.prev = 'hammer';
    E.hideHand();
    E.setWeapon('hammer');
    stage.focus({ preventScroll: true });
    startLevel(level || 1);
  }

  function setPaused(on) {
    if (G.mode !== 'anger' || (G.phase !== 'play' && G.phase !== 'intro' && !G.paused)) return;
    G.paused = on;
    syncMusic();
    E.locked = on || G.phase !== 'play';
    if (on) E.lower();
    show(on ? 'paused' : null);
    $('pause').textContent = on ? 'Resume' : 'Pause';
    if (on) setTimeout(function () { $('resume').focus({ preventScroll: true }); }, 30);
    else stage.focus({ preventScroll: true });
    E.request();
  }

  /* ----------------------------------------------- Fun Mode's finish */

  // Fun Mode keeps no score, but destroying every pixel still earns a
  // cheer. The wreck stays up until the player asks for the next device,
  // so there is time to zoom in and admire it.
  function funVictory(t) {
    var f = G.fun, secs = Math.max(1, Math.round(t - f.start));
    f.done = true;
    f.count++;
    Sound.ko();
    announce('SCREEN DESTROYED!', 'big', 1.8);
    say('Screen destroyed!');
    $('victory-stats').textContent = 'In ' + secs + ' seconds and ' + f.blows + (f.blows === 1 ? ' blow' : ' blows') + '. ' +
      (f.count === 1 ? 'Your first screen today.' : 'Screens destroyed today: ' + f.count + '.');
    $('victory').hidden = false;
    syncMusic();
    tell('Screen destroyed, in ' + secs + ' seconds and ' + f.blows + ' blows.');
  }
  E.hooks.device = function () {
    G.fun.done = false;
    G.fun.blows = 0;
    $('victory').hidden = true;
    hintAt = gt + 2;
  };
  $('next-device').addEventListener('click', function () {
    E.newDevice();
    stage.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------ your picture */

  // A picture from the visitor's own device. The browser reads the file
  // and the page draws it: nothing leaves the browser.
  function loadPicture(file) {
    if (!file || !/^image\//.test(file.type)) {
      tell('That file is not a picture.');
      return;
    }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      // The device whose screen best fits the picture's shape.
      var a = c.width / c.height, type = a < 0.62 ? 'phone' : a < 1.45 ? 'tablet' : a < 1.7 ? 'laptop' : 'monitor';
      var scene = { id: 'yours', label: 'your picture', fits: ORDER, chrome: false, draw: function (ctx, W, H) {
        var s = Math.max(W / c.width, H / c.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(c, (W - c.width * s) / 2, (H - c.height * s) / 2, c.width * s, c.height * s);
      } };
      if (G.mode !== 'fun') startFun();
      E.newDevice({ device: type, orient: a < 1.05 ? 'portrait' : 'landscape', sceneObj: scene });
      stage.focus({ preventScroll: true });
      tell('Your picture is on a ' + type + '. Smash it.');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      tell('That picture could not be read.');
    };
    img.src = url;
  }
  $('picture').addEventListener('click', function () { $('picture-in').click(); });
  $('picture-in').addEventListener('change', function (e) {
    loadPicture(e.target.files[0]);
    e.target.value = '';
  });
  stage.addEventListener('dragover', function (e) {
    if (G.mode !== 'fun') return;
    e.preventDefault();
    stage.classList.add('drop');
  });
  stage.addEventListener('dragleave', function () { stage.classList.remove('drop'); });
  stage.addEventListener('drop', function (e) {
    stage.classList.remove('drop');
    if (G.mode !== 'fun') return;
    e.preventDefault();
    if (e.dataTransfer.files.length) loadPicture(e.dataTransfer.files[0]);
  });

  /* ------------------------------------------------------ every frame */

  E.hooks.frame = function (t) {
    var dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    if (!G.paused) gt += dt;
    syncMusic();
    var i;
    for (i = timers.length - 1; i >= 0; i--) {
      if (gt >= timers[i].at) {
        var fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
    }
    if (G.mode === 'title') runAttract();
    nearly = false;
    if (G.mode === 'anger' && G.phase === 'play' && !G.paused) {
      G.timeLeft -= dt;
      updateTimer();
      var dmg = D.damageAt(E.glass(), t);
      updateDamage(dmg);
      if (dmg >= KO) ko();
      else if (G.timeLeft <= 0) timeout();
      else if (dmg >= WARN && gt >= hintAt) warn(dmg);
    } else if (G.mode === 'anger' && G.phase === 'ko') {
      updateDamage(1);
    } else if (G.mode === 'fun' && !G.fun.done && E.hits()) {
      var fd = D.damageAt(E.glass(), t);
      nearly = fd >= WARN && fd < KO;
      if (fd >= KO) funVictory(t);
      else if (nearly && gt >= hintAt) warn(fd);
    }
    if (!G.paused) {
      for (i = pending.length - 1; i >= 0; i--) {
        if (gt >= pending[i].at) {
          spawnChip(pending[i].poly);
          pending.splice(i, 1);
        }
      }
      for (i = shots.length - 1; i >= 0; i--) {
        var s = shots[i], p = shotState(s, gt);
        if (s.swat) {
          if (gt - s.swat > 0.45) shots.splice(i, 1);
          continue;
        }
        if (pointer.shown && shotAt(pointer.x, pointer.y) === s) { swat(s, pointer.x, pointer.y); continue; }
        if (p.tau >= 1) {
          shots.splice(i, 1);
          effects.push({ kind: 'splat', t0: gt, dur: 0.9, x: p.x, y: p.y, seed: Math.random() * 1e9 });
          hurt(s.dmg, p.x, p.y);
        }
      }
    }
    drawFx(t);
    // Fun Mode rests without frames, except while what is left flashes.
    return G.mode === 'anger' || G.mode === 'title' || nearly || shots.length > 0 || pending.length > 0 || pops.length > 0 ||
           effects.length > 0 || timers.length > 0;
  };

  // Nearly there: what is left of the picture flashes twice every two
  // seconds, yellow at 5% left and turning red as it nears 1%.
  function warn(dmg) {
    var f = clamp((dmg - WARN) / (KO - WARN), 0, 1);
    hintAt = gt + 2;
    effects.push({ kind: 'flash', t0: gt, dur: 0.42, rgb: [255, Math.round(225 - 185 * f), Math.round(40 - 10 * f)] });
  }

  // The title screen smashes a device by itself.
  function runAttract() {
    var d = E.device(), h = E.hand();
    if (!d || gt < attract.next || h.phase !== 'rest') return;
    if (attract.blows >= 9) {
      E.newDevice();
      attract.blows = 0;
      attract.next = gt + 0.8;
      return;
    }
    var roll = Math.random();
    E.setWeapon(roll < 0.55 ? 'hammer' : roll < 0.7 ? 'fist' : roll < 0.8 ? 'fish' : roll < 0.9 ? 'banana' : 'lightning');
    var st = E.toStage([d.W * rand(0.1, 0.9), d.H * rand(0.1, 0.9)]);
    E.autoSwing(st[0], st[1], rand(0.5, 0.95));
    attract.blows++;
    attract.next = gt + rand(1.5, 2.2);
  }

  /* ----------------------------------------------------------- drawing */

  function star(c, x, y, r, col) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = col;
    c.fill();
  }
  function font(px) { return 'italic 900 ' + px + 'px "Arial Black", "Helvetica Neue", Impact, sans-serif'; }

  // The effects canvas is hidden while it has nothing on it, so an empty
  // layer costs nothing to draw over the stage.
  var fxBlank = false;
  function drawFx(t) {
    var c = fc;
    effects = effects.filter(function (e) { return e.hold || gt - e.t0 < e.dur; });
    pops = pops.filter(function (p) { return gt - p.t0 < 1; });
    if (!effects.length && !shots.length && !pops.length) {
      if (!fxBlank) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, fx.width, fx.height);
        fx.style.visibility = 'hidden';
        fxBlank = true;
      }
      return;
    }
    if (fxBlank) {
      fx.style.visibility = '';
      fxBlank = false;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fx.width, fx.height);
    c.setTransform(fdpr, 0, 0, fdpr, 0, 0);
    effects.forEach(function (e) { drawEffect(c, e, gt - e.t0, t); });
    shots.forEach(function (s) {
      var p = shotState(s, gt);
      c.save();
      c.globalAlpha = p.a;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(p.sc, p.sc);
      if (s.kind === 'chip') {
        if (s.img) c.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
        else {
          c.fillStyle = 'rgba(210,228,255,0.7)';
          c.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        }
        c.strokeStyle = 'rgba(255,255,255,0.5)';
        c.lineWidth = 1 / p.sc;
        c.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
      } else {
        // A keycap, from the side it flies at you on.
        c.fillStyle = '#202227';
        S.draw.fillRound(c, -s.w / 2, -s.h / 2, s.w, s.h, s.w * 0.14, '#2a2c32');
        S.draw.fillRound(c, -s.w * 0.4, -s.h * 0.44, s.w * 0.8, s.h * 0.7, s.w * 0.1, '#3a3d45');
        c.fillStyle = '#e8eaf0';
        c.font = '700 ' + (s.h * 0.42).toFixed(1) + 'px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(s.label, 0, -s.h * 0.1);
      }
      c.restore();
    });
    pops.forEach(function (p) {
      var e = gt - p.t0;
      c.save();
      c.globalAlpha = clamp(1.4 - e * 1.4, 0, 1);
      c.font = font(p.size);
      c.textAlign = 'center';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText(p.text, p.x, p.y - e * 44);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y - e * 44);
      c.restore();
    });
  }

  function drawEffect(c, e, el, t) {
    var f = clamp(el / e.dur, 0, 1), i, r;
    if (e.kind === 'red') {
      var g = c.createRadialGradient(fw / 2, fh / 2, Math.min(fw, fh) * 0.25, fw / 2, fh / 2, Math.max(fw, fh) * 0.75);
      g.addColorStop(0, 'rgba(220,20,20,0)');
      g.addColorStop(1, 'rgba(220,20,20,' + (e.a * (1 - f)).toFixed(3) + ')');
      c.fillStyle = g;
      c.fillRect(0, 0, fw, fh);
    } else if (e.kind === 'splat') {
      // Glass hits the lens: a white star of cracks where it lands.
      r = S.rng(e.seed);
      c.save();
      c.globalAlpha = 1 - f;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      for (i = 0; i < 9; i++) {
        var a = r.range(0, TAU), L = r.range(18, 55);
        c.moveTo(e.x, e.y);
        c.lineTo(e.x + Math.cos(a) * L, e.y + Math.sin(a) * L);
      }
      c.stroke();
      c.beginPath();
      c.arc(e.x, e.y, 14, 0, TAU);
      c.stroke();
      c.restore();
    } else if (e.kind === 'flash') {
      var on = Math.max(Math.sin(Math.PI * clamp(el / 0.16, 0, 1)), Math.sin(Math.PI * clamp((el - 0.24) / 0.16, 0, 1)));
      if (on > 0.01) drawLeftover(c, e.rgb, 0.85 * on, t);
    } else if (e.kind === 'self-hammer' || e.kind === 'self-fist') {
      // Stars round the player's head: the top of the stage.
      for (i = 0; i < 5; i++) {
        var sa = el * 5 + i * TAU / 5;
        c.globalAlpha = f > 0.8 ? (1 - f) * 5 : 1;
        star(c, fw / 2 + Math.cos(sa) * Math.min(120, fw * 0.25), 44 + Math.sin(sa) * 16, 11, i % 2 ? '#ffe14d' : '#ffffff');
      }
      c.globalAlpha = 1;
    } else if (e.kind === 'self-fish') {
      r = S.rng(e.seed);
      c.fillStyle = 'rgba(150,196,220,' + (0.45 * (1 - f)).toFixed(3) + ')';
      for (i = 0; i < 10; i++) {
        var x = r.range(0, fw), w = r.range(10, 34), L2 = Math.min(fh, el * r.range(200, 420) + 30);
        S.draw.fillRound(c, x, 0, w, L2, w / 2, c.fillStyle);
      }
    } else if (e.kind === 'self-banana') {
      r = S.rng(e.seed);
      for (i = 0; i < 6; i++) {
        var bx = r.range(0.1, 0.9) * fw, by = r.range(0, 0.3) * fh + el * r.range(20, 60), br = r.range(26, 60);
        c.globalAlpha = 1 - f * f;
        S.draw.circle(c, bx, by, br, '#f4e296');
        S.draw.circle(c, bx + br * 0.3, by - br * 0.2, br * 0.12, '#7a4d1c');
        S.draw.circle(c, bx - br * 0.35, by + br * 0.1, br * 0.08, '#7a4d1c');
      }
      c.globalAlpha = 1;
    } else if (e.kind === 'self-bomb') {
      // Soot over everything, clearing slowly.
      r = S.rng(e.seed);
      c.fillStyle = 'rgba(12,10,8,' + (0.88 * Math.pow(1 - f, 0.7)).toFixed(3) + ')';
      c.fillRect(0, 0, fw, fh);
      for (i = 0; i < 12; i++) {
        S.draw.circle(c, r.range(0, fw), r.range(0, fh) - el * 40, r.range(30, 90), 'rgba(60,56,52,' + (0.5 * (1 - f)).toFixed(3) + ')');
      }
    } else if (e.kind === 'self-lightning' || e.kind === 'shock') {
      var h = E.hand(), pts = [];
      if (e.kind === 'shock') {
        var d = E.device();
        if (d) Hands.parts(d, G.hand).forEach(function (p) { pts.push(E.toStage(p.b)); });
      } else pts.push([h.x, h.y]);
      c.strokeStyle = 'rgba(140,220,255,' + (1 - f).toFixed(3) + ')';
      c.lineWidth = 2.5;
      pts.forEach(function (p) {
        for (i = 0; i < 4; i++) {
          var za = Math.random() * TAU, zx = p[0], zy = p[1];
          c.beginPath();
          c.moveTo(zx, zy);
          for (var k = 0; k < 4; k++) {
            zx += Math.cos(za) * 10 + (Math.random() - 0.5) * 10;
            zy += Math.sin(za) * 10 + (Math.random() - 0.5) * 10;
            c.lineTo(zx, zy);
          }
          c.stroke();
        }
      });
    } else if (e.kind === 'blood') {
      drawBlood(c, e, el);
    } else if (e.kind === 'legs') {
      drawLegs(c, e, el);
    } else if (e.kind === 'repair') {
      drawRepair(c, e, el);
    }
  }

  // What is left of the picture, as a soft-edged patch of colour: the damage
  // grid drawn one pixel a sample point, then scaled up smoothly over the
  // screen.
  var maskCv = null;
  function drawLeftover(c, rgb, a, t) {
    var d = E.device(), gl = E.glass();
    if (!d || !gl) return;
    var m = D.aliveMask(gl, t);
    if (!maskCv) maskCv = document.createElement('canvas');
    if (maskCv.width !== m.nx || maskCv.height !== m.ny) {
      maskCv.width = m.nx;
      maskCv.height = m.ny;
    }
    var x = maskCv.getContext('2d'), img = x.createImageData(m.nx, m.ny), px = img.data;
    for (var i = 0; i < m.mask.length; i++) {
      px[i * 4] = rgb[0];
      px[i * 4 + 1] = rgb[1];
      px[i * 4 + 2] = rgb[2];
      px[i * 4 + 3] = m.mask[i] ? 255 : 0;
    }
    x.putImageData(img, 0, 0);
    var tl = E.toStage([0, 0]), br = E.toStage([d.W, d.H]);
    c.save();
    c.globalAlpha = a;
    c.imageSmoothingEnabled = true;
    c.drawImage(maskCv, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
    c.restore();
  }

  // Cartoon blood runs down from the top of the stage.
  function drawBlood(c, e, el) {
    var top = Math.min(1, el / 0.5) * 26;
    c.fillStyle = '#b3001b';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(fw, 0);
    c.lineTo(fw, top);
    for (var x = fw; x >= 0; x -= 20) c.lineTo(x, top + Math.sin(x * 0.07) * 5);
    c.closePath();
    c.fill();
    e.drips.forEach(function (d) {
      var len = Math.max(0, el - d[3]) * d[2], x = d[0] * fw, w = d[1];
      if (!len) return;
      len = Math.min(len, fh * 1.1);
      S.draw.fillRound(c, x - w / 2, 0, w, len + top, w / 2, '#b3001b');
      S.draw.circle(c, x, len + top - w * 0.2, w * 0.62, '#b3001b');
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x - w * 0.25, 0, w * 0.12, len + top - w * 0.6);
    });
  }

  // The device grows legs and runs off the stage.
  function drawLegs(c, e, el) {
    var d = E.device();
    if (!d) return;
    var b = d.bounds, L = 60, grow = Math.min(1, el / 0.5), run = Math.max(0, el - 0.6);
    var ox = run * run * 700, oy = -L * grow - (run ? Math.abs(Math.sin(run * 16)) * 10 : 0);
    E.offset = [ox, oy];
    var left = E.toStage([b[0], b[3]]), right = E.toStage([b[2], b[3]]), wide = right[0] - left[0];
    var feet = [left[0] + wide * 0.3 + ox, left[0] + wide * 0.7 + ox], y0 = left[1] + oy;
    c.lineCap = 'round';
    feet.forEach(function (x, i) {
      var swing = run ? Math.sin(run * 16 + i * Math.PI) * 0.6 : 0, len = L * grow;
      var fx2 = x + Math.sin(swing) * len, fy = y0 + Math.cos(swing) * len;
      c.strokeStyle = '#1d1d22';
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(x, y0);
      c.lineTo(fx2, fy);
      c.stroke();
      c.fillStyle = '#c7372f';
      c.beginPath();
      c.ellipse(fx2 + 9, fy + 2, 16, 8, 0, 0, TAU);
      c.fill();
    });
    if (el > 0.4 && el < 2.4) {
      var top = E.toStage([b[2], b[1]]), bx = top[0] + ox - 20, by = top[1] + oy - 10;
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#111';
      c.lineWidth = 2;
      c.beginPath();
      S.draw.roundRect(c, bx - 140, by - 50, 140, 40, 14);
      c.fill();
      c.stroke();
      c.fillStyle = '#111';
      c.font = font(18);
      c.textAlign = 'center';
      c.fillText('Too slow!', bx - 70, by - 23);
    }
    E.request();
  }

  // The screen mends itself, top to bottom, then gloats.
  function drawRepair(c, e, el) {
    var d = E.device();
    if (!d || !e.clean) return;
    var tl = E.toStage([0, 0]), br = E.toStage([d.W, d.H]), f = Math.min(1, el / 1.5);
    var ys = tl[1] + (br[1] - tl[1]) * f;
    c.save();
    c.beginPath();
    c.rect(tl[0], tl[1], br[0] - tl[0], ys - tl[1]);
    c.clip();
    c.drawImage(e.clean, 0, 0, e.clean.width / fdpr, e.clean.height / fdpr);
    c.restore();
    if (f < 1) {
      c.fillStyle = 'rgba(160,255,210,0.9)';
      c.fillRect(tl[0], ys - 2, br[0] - tl[0], 4);
      c.fillStyle = 'rgba(160,255,210,0.25)';
      c.fillRect(tl[0], ys - 14, br[0] - tl[0], 28);
    } else {
      var cx = (tl[0] + br[0]) / 2, cy = (tl[1] + br[1]) / 2, R = Math.min(br[0] - tl[0], br[1] - tl[1]) * 0.16;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      S.draw.circle(c, cx, cy - R * 0.4, R, '#ffd23f');
      S.draw.circle(c, cx - R * 0.35, cy - R * 0.6, R * 0.1, '#111');
      S.draw.circle(c, cx + R * 0.35, cy - R * 0.6, R * 0.1, '#111');
      c.strokeStyle = '#111';
      c.lineWidth = R * 0.08;
      c.beginPath();
      c.arc(cx + R * 0.1, cy - R * 0.25, R * 0.45, 0.2, Math.PI - 0.8);
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = font(Math.max(18, R * 0.55));
      c.textAlign = 'center';
      c.fillText('NICE TRY', cx, cy + R * 1.2);
    }
    E.request();
  }

  /* ------------------------------------------------------------ input */

  $('play-fun').addEventListener('click', function () { Sound.ensure(); startFun(); });
  $('play-anger').addEventListener('click', function () { Sound.ensure(); startAnger(1, false); });
  $('again').addEventListener('click', function () { Sound.ensure(); startAnger(G.practice ? G.startAt : 1, G.practice); });
  $('to-title').addEventListener('click', showTitle);
  $('resume').addEventListener('click', function () { setPaused(false); });
  $('quit').addEventListener('click', showTitle);
  $('pause').addEventListener('click', function () { setPaused(!G.paused); });
  $('menu').addEventListener('click', function () {
    if (G.mode === 'anger' && (G.phase === 'play' || G.phase === 'intro')) setPaused(true);
    else showTitle();
  });
  $('new-device').addEventListener('click', function () { if (G.mode === 'fun') E.newDevice(); });

  var soundBtn = $('sound'), voiceBtn = $('voice'), musicBtn = $('music');
  function syncButtons() {
    musicBtn.setAttribute('aria-pressed', Music.on() ? 'true' : 'false');
    musicBtn.textContent = Music.on() ? 'Music on' : 'Music off';
    soundBtn.setAttribute('aria-pressed', Sound.muted() ? 'false' : 'true');
    soundBtn.textContent = Sound.muted() ? 'Sound off' : 'Sound on';
    voiceBtn.setAttribute('aria-pressed', voiceOn ? 'true' : 'false');
    voiceBtn.textContent = voiceOn ? 'Voice on' : 'Voice off';
  }
  soundBtn.addEventListener('click', function () { Sound.ensure(); Sound.setMuted(!Sound.muted()); syncButtons(); Music.refresh(); });
  musicBtn.addEventListener('click', function () {
    Sound.ensure();
    Music.setOn(!Music.on());
    syncButtons();
    syncMusic();
  });
  voiceBtn.addEventListener('click', function () {
    voiceOn = !voiceOn;
    save('smash-voice', voiceOn);
    if (!voiceOn && 'speechSynthesis' in window) speechSynthesis.cancel();
    syncButtons();
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k >= '1' && k <= '7' && G.mode !== 'title') {
      pick(Hands.WEAPONS[+k - 1].id);
    } else if ((k === 'n' || k === 'N') && G.mode === 'fun') {
      E.newDevice();
    } else if (k === 'm' || k === 'M') {
      Sound.ensure();
      Sound.setMuted(!Sound.muted());
      syncButtons();
      Music.refresh();
    } else if (k === 'v' || k === 'V') {
      voiceBtn.click();
    } else if ((k === 'p' || k === 'P' || k === 'Escape') && G.mode === 'anger') {
      e.preventDefault();
      setPaused(!G.paused);
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'anger' && G.phase === 'play' && !G.paused) setPaused(true);
  });

  /* ------------------------------------------------------------ start */

  // Browsers without overflow: clip can still scroll the stage to a focused
  // button; keep it at the top.
  stage.addEventListener('scroll', function () { stage.scrollTop = 0; stage.scrollLeft = 0; });
  syncButtons();
  // The browser starts audio only after a click or a key. The first one
  // anywhere on the page starts it, and with it the title screen's tune.
  function wake() { Sound.ensure(); syncMusic(); }
  document.addEventListener('click', wake, { once: true });
  document.addEventListener('keydown', wake, { once: true });
  // The address can ask for a mode, or for a device, picture, orientation
  // and seed, as in #device=laptop&scene=synthwave&seed=42, which opens
  // Fun Mode. #mode=anger&level=12 starts Anger Mode at level 12, as
  // practice: a run that starts part way records no high score.
  var want = {};
  location.hash.slice(1).split('&').forEach(function (kv) {
    var p = kv.split('=');
    if (p[0]) want[p[0]] = decodeURIComponent(p[1] || '');
  });
  want.seed = +want.seed || 0;
  if (want.device || want.scene || want.seed || want.orient || want.mode === 'fun') startFun(want);
  else if (want.mode === 'anger') {
    G.startAt = Math.max(1, Math.floor(+want.level || 1));
    startAnger(G.startAt, !!want.level);
  } else showTitle();
})();
