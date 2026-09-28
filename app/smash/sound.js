/* Every sound on the page, synthesised in the browser from noise and
   oscillators: no audio files. The browser starts audio only after a click
   or a key, so nothing plays until the visitor has touched the page. */
(function (global) {
  'use strict';

  var Smash = global.Smash;
  var audio = null, muted = false;
  try { muted = localStorage.getItem('smash-muted') === '1'; } catch (e) {}

  function ensure() {
    if (audio) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    var ac = new AC(), comp = ac.createDynamicsCompressor(), out = ac.createGain();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.2;
    out.gain.value = muted ? 0 : 0.7;
    out.connect(comp);
    comp.connect(ac.destination);
    var buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio = { ctx: ac, out: out, noise: buf };
    return audio;
  }

  function live() { return audio && !muted ? audio : null; }

  function envelope(a, t, attack, dur, gain) {
    var g = a.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(a.out);
    return g;
  }
  function noise(a, t, dur, type, freq, q, gain) {
    var src = a.ctx.createBufferSource(), f = a.ctx.createBiquadFilter();
    src.buffer = a.noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    f.connect(envelope(a, t, 0.001, dur, gain));
    src.start(t, Math.random() * 0.5, dur + 0.05);
    return f;
  }
  function tone(a, t, f0, f1, dur, gain, wave) {
    var o = a.ctx.createOscillator();
    o.type = wave || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(envelope(a, t, 0.002, dur, gain));
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function now(a) { return a.ctx.currentTime + 0.005; }

  var S = {
    ensure: ensure,
    // The audio context and the output every sound goes to, once made.
    audio: function () { return audio; },
    muted: function () { return muted; },
    setMuted: function (m) {
      muted = m;
      try { localStorage.setItem('smash-muted', m ? '1' : '0'); } catch (e) {}
      if (audio) audio.out.gain.setTargetAtTime(m ? 0 : 0.7, audio.ctx.currentTime, 0.02);
    },

    swing: function (strength) {
      var a = live();
      if (!a) return;
      var t = a.ctx.currentTime, f = noise(a, t, 0.09, 'bandpass', 500, 1.2, 0.02 + 0.05 * strength);
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
    },
    // A thud, then for glass a sharp snap, a crackle of tiny grains and a
    // few high pings.
    hit: function (strength, onGlass) {
      var a = live();
      if (!a) return;
      var t = now(a), g = 0.25 + 0.75 * strength, i;
      tone(a, t, 150, 50, 0.22, 0.55 * g);
      noise(a, t, 0.06, 'bandpass', 1800, 1.1, 0.35 * g);
      if (!onGlass) return;
      noise(a, t, 0.06 + 0.08 * strength, 'highpass', 2600, 0.7, 0.5 * g);
      for (i = 0; i < 3 + Math.round(21 * strength); i++) {
        noise(a, t + Math.pow(Math.random(), 2) * 0.35 * g, 0.006 + Math.random() * 0.02, 'bandpass',
              2500 + Math.random() * 6500, 4 + Math.random() * 8, (0.08 + Math.random() * 0.25) * g);
      }
      for (i = 0; i < Math.round(1 + 3 * strength); i++) {
        var f0 = 3000 + Math.random() * 4500;
        tone(a, t + 0.02 + Math.random() * 0.3, f0, f0 * 0.98, 0.15 + Math.random() * 0.35, 0.025 + Math.random() * 0.03);
      }
    },
    poke: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 1100, 760, 0.05, 0.14, 'triangle');
      noise(a, t, 0.025, 'bandpass', 3200, 2, 0.12);
    },
    punch: function (s) {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 125, 52, 0.2, 0.6 * (0.4 + 0.6 * s));
      noise(a, t, 0.09, 'lowpass', 420, 0.8, 0.45 * (0.4 + 0.6 * s));
    },
    slap: function (s) {
      var a = live();
      if (!a) return;
      var t = now(a);
      noise(a, t, 0.13, 'bandpass', 900, 0.7, 0.55 * (0.5 + 0.5 * s));
      tone(a, t + 0.02, 420, 130, 0.2, 0.22);
    },
    squish: function (s) {
      var a = live();
      if (!a) return;
      var t = now(a), f = noise(a, t, 0.22, 'lowpass', 900, 3, 0.4 * (0.5 + 0.5 * s));
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(220, t + 0.2);
      tone(a, t, 270, 170, 0.13, 0.12);
    },
    // A fuse hisses until stop() is called.
    fuse: function () {
      var a = live();
      if (!a) return { stop: function () {} };
      var src = a.ctx.createBufferSource(), f = a.ctx.createBiquadFilter(), g = a.ctx.createGain();
      src.buffer = a.noise;
      src.loop = true;
      f.type = 'highpass';
      f.frequency.value = 4500;
      g.gain.value = 0.05;
      src.connect(f);
      f.connect(g);
      g.connect(a.out);
      src.start();
      return { stop: function () { try { g.gain.setTargetAtTime(0.0001, a.ctx.currentTime, 0.02); src.stop(a.ctx.currentTime + 0.1); } catch (e) {} } };
    },
    boom: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 72, 26, 1.2, 0.9);
      noise(a, t, 1.1, 'lowpass', 320, 0.7, 0.95);
      noise(a, t, 0.25, 'bandpass', 1400, 0.8, 0.5);
      for (var i = 0; i < 14; i++) noise(a, t + 0.05 + Math.random() * 0.6, 0.02, 'bandpass', 600 + Math.random() * 3000, 4, 0.15);
    },
    zap: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      noise(a, t, 0.1, 'highpass', 2800, 0.8, 0.7);
      tone(a, t, 2200, 260, 0.22, 0.2, 'sawtooth');
      tone(a, t, 92, 88, 0.5, 0.16, 'sawtooth');
      tone(a, t, 97, 93, 0.5, 0.12, 'sawtooth');
      noise(a, t + 0.08, 0.5, 'lowpass', 500, 1, 0.5);
    },
    swat: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 2700, 2400, 0.09, 0.22, 'triangle');
      noise(a, t, 0.03, 'bandpass', 5200, 2, 0.2);
    },
    hurt: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 190, 105, 0.22, 0.2, 'square');
      noise(a, t, 0.1, 'lowpass', 500, 0.7, 0.35);
    },
    keyPop: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      noise(a, t, 0.035, 'bandpass', 2800, 3, 0.45);
      tone(a, t, 1500, 1300, 0.035, 0.1, 'triangle');
    },
    dent: function (s) {
      var a = live();
      if (!a) return;
      var t = now(a), g = 0.4 + 0.6 * s;
      tone(a, t, 523, 510, 0.4, 0.16 * g, 'triangle');
      tone(a, t, 787, 770, 0.32, 0.1 * g, 'triangle');
      tone(a, t, 1244, 1230, 0.22, 0.06 * g);
      noise(a, t, 0.05, 'bandpass', 2100, 1.5, 0.3 * g);
    },
    bonk: function () {
      var a = live();
      if (!a) return;
      var t = now(a), o = a.ctx.createOscillator();
      o.frequency.setValueAtTime(260, t);
      o.frequency.linearRampToValueAtTime(720, t + 0.08);
      o.frequency.linearRampToValueAtTime(240, t + 0.35);
      o.connect(envelope(a, t, 0.005, 0.4, 0.35));
      o.start(t);
      o.stop(t + 0.45);
      noise(a, t, 0.05, 'lowpass', 600, 1, 0.3);
    },
    ko: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 880, 876, 1.3, 0.28);
      tone(a, t, 1320, 1314, 1.0, 0.13);
      tone(a, t, 2217, 2210, 0.6, 0.05);
    },
    level: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      [523, 659, 784, 1047].forEach(function (f, i) { tone(a, t + i * 0.1, f, f, 0.2, 0.14, 'triangle'); });
    },
    over: function () {
      var a = live();
      if (!a) return;
      tone(a, now(a), 300, 45, 1.2, 0.16, 'square');
    },
    tick: function () {
      var a = live();
      if (!a) return;
      tone(a, now(a), 1500, 1500, 0.035, 0.08, 'square');
    },
    chime: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 1319, 1319, 0.45, 0.12, 'triangle');
      tone(a, t + 0.09, 1760, 1760, 0.5, 0.1, 'triangle');
    },
    run: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      for (var i = 0; i < 14; i++) noise(a, t + i * 0.085, 0.03, 'bandpass', i % 2 ? 900 : 700, 2, 0.25);
    },
    repair: function () {
      var a = live();
      if (!a) return;
      var t = now(a);
      tone(a, t, 400, 1600, 1.4, 0.1, 'triangle');
      var f = noise(a, t, 1.4, 'bandpass', 800, 4, 0.12);
      f.frequency.setValueAtTime(800, t);
      f.frequency.exponentialRampToValueAtTime(6000, t + 1.3);
    },
    drip: function () {
      var a = live();
      if (!a) return;
      tone(a, now(a), 900, 480, 0.07, 0.12);
    },
    whoosh: function () {
      var a = live();
      if (!a) return;
      var t = now(a), f = noise(a, t, 0.25, 'bandpass', 400, 1.5, 0.06);
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
    }
  };

  Smash.Sound = S;
})(this);
