/* The sounds, synthesised in the browser: no sound files. See the Sound
   section of docs/pentrys.md.

   Every pitch is a harmonic of one low C (65.4 Hz), so all of it is in just
   intonation. A clear plays the harmonics 4 and 5 for a Single, one more for
   each row, up to 4 to 10 for a Hextrys, and a rising bell for each bonus
   in its combo. Notes start and stop cleanly: each
   gain starts at 0, and no note slides. Nothing plays until the player's
   first click or key, since browsers allow no sound before one. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});
  var F0 = 65.406;   // C2: harmonic 4 is middle C
  var ac = null, master = null, noiseBuf = null, on = true;

  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = 0.55;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  function ready() { return on && ac && ac.state === 'running'; }

  // A note: harmonic h of F0, starting after delay, lasting dur seconds.
  function note(h, delay, dur, vol, type) {
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = F0 * h;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // A bell: a note with a quiet partial a twelfth above.
  function bell(h, delay, dur, vol) { note(h, delay, dur, vol); note(h * 3, delay, dur * 0.4, vol * 0.18); }
  function thud(delay, dur, vol, cutoff) {
    var t = ac.currentTime + (delay || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.03);
  }

  var S = {
    start: start,
    setOn: function (v) { on = !!v; },
    isOn: function () { return on; },
    move: function () { if (ready()) note(12, 0, 0.035, 0.025, 'triangle'); },
    rotate: function () { if (ready()) { note(10, 0, 0.05, 0.04, 'triangle'); note(15, 0.004, 0.04, 0.015); } },
    flip: function () { if (ready()) { note(10, 0, 0.04, 0.035, 'triangle'); note(12, 0.04, 0.05, 0.035, 'triangle'); } },
    cycle: function () { if (ready()) { note(18, 0, 0.04, 0.025); note(24, 0.02, 0.04, 0.012); } },
    lock: function () { if (ready()) { note(2, 0, 0.09, 0.1); thud(0, 0.04, 0.05, 1400); } },
    hardDrop: function () { if (ready()) { note(1.5, 0, 0.14, 0.16); thud(0, 0.09, 0.09, 900); } },
    flood: function () { if (ready()) { note(20, 0, 0.06, 0.05); note(15, 0.06, 0.09, 0.05); note(12, 0.13, 0.12, 0.035); } },
    deluge: function () { if (ready()) [24, 20, 16, 15, 12, 10, 8].forEach(function (h, i) { note(h, i * 0.035, 0.12, 0.045); }); },
    blast: function () { if (ready()) { thud(0, 0.35, 0.22, 380); note(1, 0, 0.4, 0.14); note(1.5, 0.01, 0.25, 0.06); } },
    rowbomb: function () { if (ready()) { thud(0, 0.25, 0.14, 2600); [8, 10, 12, 16].forEach(function (h, i) { note(h, i * 0.025, 0.18, 0.04, 'triangle'); }); } },
    smash: function () { if (ready()) { thud(0, 0.12, 0.12, 7000); [30, 36, 45].forEach(function (h, i) { note(h, i * 0.02, 0.16, 0.025); }); } },
    shatter: function () { if (ready()) { thud(0, 0.08, 0.06, 7000); note(36, 0, 0.12, 0.015); note(45, 0.03, 0.1, 0.012); } },
    crack: function () { if (ready()) { thud(0, 0.025, 0.04, 5000); note(40, 0, 0.03, 0.01); } },
    // A bell for each bonus in a combo, rising.
    combo: function (bonuses) { if (ready()) for (var i = 0; i < Math.min(bonuses, 5); i++) bell([16, 20, 24, 30, 32][i], 0.25 + i * 0.09, 0.5, 0.045); },
    clear: function (n, twos, threes) {
      if (!ready()) return;
      var top = 4 + Math.min(n, 6), count = top - 3;
      for (var h = 4; h <= top; h++) bell(h, (h - 4) * 0.012, 1.1 + 0.1 * n, 0.12 / Math.sqrt(count));
      for (var i = 0; i < Math.min(twos, 4); i++) bell(16, 0.12 + i * 0.06, 0.6, 0.05);
      for (var j = 0; j < Math.min(threes, 3); j++) bell(24, 0.15 + j * 0.07, 0.7, 0.05);
    },
    level: function () { if (ready()) [4, 5, 6, 8].forEach(function (h, i) { bell(h * 2, i * 0.07, 0.5, 0.05); }); },
    over: function () { if (ready()) [8, 6, 5, 4].forEach(function (h, i) { bell(h, i * 0.18, 0.9, 0.06); }); },
    pass: function () { if (ready()) [4, 5, 6, 8, 10, 12].forEach(function (h, i) { bell(h * 2, i * 0.06, 0.6, 0.05); }); },
    begin: function () { if (ready()) [4, 6, 8].forEach(function (h, i) { bell(h * 2, i * 0.05, 0.35, 0.04); }); }
  };
  Pentrys.Sound = S;
})(typeof window !== 'undefined' ? window : globalThis);
