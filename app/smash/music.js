/* The background music. Every part of the game has a tune: the title
   screen, a level's introduction, the smashing, the K.O., the pause and the
   end of a run.

   The tunes are sequence files in music/, one per tune. Each gives the
   tune's tempo, length and swing, each track's sound, level, pan and
   reverb, and then the notes as CSV rows. The notes are in Rational Comma
   Notation, the just intonation notation of justsynth (Ryan 2016,
   arXiv:1612.01860). A letter is Pythagorean; ' multiplies it by 80/81, .
   by 81/80 and [7] by 63/64. So with A4 at 440 Hz, C.5 is a pure minor
   third over A4, and D[7]5 the 7th harmonic of E3. The files are scripts,
   so the page reads them from a server or straight from the disk.

   The sounds are chip sounds, synthesised like every other sound on the
   page: pulse and triangle waves and noise drums, with no slides and no
   vibrato. The game says which tune it wants. A tune plays while the Sound
   and Music buttons are on and the tab is showing. One stopped part way
   picks up where it stopped when the game asks for the same run again. */
(function (global) {
  'use strict';

  var Smash = global.Smash, Sound = Smash.Sound;
  var LEVEL = 0.7;
  // Each drum's level at vel 1.
  var DRUMS = { kick: 0.2, snare: 0.08, hat: 0.03, open: 0.03, rim: 0.07, clap: 0.07, shaker: 0.025 };

  /* ------------------------------------------- Rational Comma Notation */

  // As justsynth's parse_rcn: a note as a ratio over C4 = 1/1.
  var PYTH = { C: 1, D: 9 / 8, E: 81 / 64, F: 4 / 3, G: 3 / 2, A: 27 / 16, B: 243 / 128 };
  var MOD = { b: 2048 / 2187, '#': 2187 / 2048, x: (2187 * 2187) / (2048 * 2048), "'": 80 / 81, '.': 81 / 80,
              p: 531441 / 524288, d: 524288 / 531441 };
  var RCN = /^([CDEFGAB])((?:[#bx'.pd]|\[[^\]]*\])*)(-?\d+)((?:\[[^\]]*\]|~\d+|_\d+)*)$/;

  function lg(x, b) { return Math.log(x) / Math.log(b); }
  // The DR prime comma: p times the powers of 2 and 3 that bring it nearest
  // 1/1, by the paper's comma measure. 5 gives 80/81, 7 gives 63/64.
  var commas = {};
  function primeComma(p) {
    if (commas[p]) return commas[p];
    var bMid = -0.5 * lg(p, 3), bMin = Math.min(Math.round(bMid - 5.5), Math.ceil(-lg(p, 3) - 1 / (2 * lg(3, 2))));
    var bMax = Math.max(Math.round(bMid + 5.5), 0), best = Infinity, out = 1;
    for (var b = bMin; b <= bMax; b++) {
      var a = Math.round(-lg(p, 2) - b * lg(3, 2));
      var cm = Math.abs(a + b * lg(3, 2) + lg(p, 2)) * (Math.abs(a) + Math.abs(b) * lg(3, 2) + lg(p, 2));
      if (cm < best) { best = cm; out = p * Math.pow(2, a) * Math.pow(3, b); }
    }
    return (commas[p] = out);
  }
  // One side of a bracket, such as 5*7: the commas of its primes from 5 up.
  function side(text) {
    var r = 1;
    if (!text.trim()) return r;
    text.split('*').forEach(function (tk) {
      var n = Math.abs(parseInt(tk, 10) || 1);
      while (n % 2 === 0) n /= 2;
      while (n % 3 === 0) n /= 3;
      for (var d = 5; d * d <= n; d += 2) while (n % d === 0) { r *= primeComma(d); n /= d; }
      if (n > 1) r *= primeComma(n);
    });
    return r;
  }
  function mods(text) {
    var r = 1, i = 0;
    while (i < text.length) {
      var c = text[i];
      if (MOD[c]) { r *= MOD[c]; i++; }
      else if (c === '[') {
        var j = text.indexOf(']', i), parts = text.slice(i + 1, j).split('/');
        r *= side(parts[0]) / (parts.length > 1 ? side(parts[1]) : 1);
        i = j + 1;
      } else {
        var k = i + 1;
        while (k < text.length && /\d/.test(text[k])) k++;
        r *= c === '~' ? side(text.slice(i + 1, k)) : 1 / side(text.slice(i + 1, k));
        i = k;
      }
    }
    return r;
  }
  function rcn(text) {
    var m = RCN.exec(text);
    if (!m) throw new Error('Not a note: ' + text);
    return PYTH[m[1]] * Math.pow(2, +m[3] - 4) * mods(m[2]) * mods(m[4]);
  }

  /* ----------------------------------------------------- the sequences */

  var TUNES = {}, C4 = 440 / rcn('A4');

  // CSV rows of bar, beat, track, note, length in beats and vel, with bars
  // and beats counted from 1. A track that loops every few bars repeats through
  // the tune. Swing delays the second and fourth sixteenths of each beat by
  // that share of a sixteenth.
  function compile(name, def, text) {
    var per = def.beats || 4, len = def.bars * per, events = [];
    text.split(/\r?\n/).forEach(function (line) {
      var c = line.split(',').map(function (x) { return x.trim(); });
      if (!c[0] || c[0][0] === '#' || c[0] === 'bar') return;
      var track = def.tracks[c[2]];
      if (!track) throw new Error('music/' + name + '.js: no track ' + c[2]);
      var at = (+c[0] - 1) * per + (+c[1] - 1), loop = (track.loop || def.bars) * per;
      var swung = at + (Math.round((at % 1) * 4) % 2 ? (def.swing || 0) * 0.25 : 0);
      var drum = DRUMS[c[3]] !== undefined, f = drum ? 0 : C4 * rcn(c[3]);
      for (var t = swung; t < len; t += loop) {
        events.push({ at: t, track: c[2], drum: drum ? c[3] : null, f: f, len: +c[4] || 0.25,
                      vel: c[5] === undefined || c[5] === '' ? 1 : +c[5] });
      }
    });
    events.sort(function (a, b) { return a.at - b.at; });
    return { def: def, len: len, events: events };
  }

  /* ------------------------------------------------------------ sounds */

  // Pulse waves, noise and a small room for the reverb, made once for each
  // audio context. Everything passes a low-pass at 7 kHz, so the music
  // stays soft under the smashing.
  function kit(ac) {
    if (ac.smashMusic) return ac.smashMusic;
    function pulse(duty) {
      var n = 40, re = new Float32Array(n), im = new Float32Array(n);
      for (var k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(Math.PI * k * duty);
      return ac.createPeriodicWave(re, im);
    }
    var sr = ac.sampleRate, noise = ac.createBuffer(1, sr, sr), room = ac.createBuffer(2, Math.round(sr * 1.6), sr), i, c;
    var d = noise.getChannelData(0);
    for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (c = 0; c < 2; c++) {
      d = room.getChannelData(c);
      for (i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-4 * i / sr);
    }
    var out = ac.createGain(), lp = ac.createBiquadFilter(), verb = ac.createConvolver(), wet = ac.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    lp.Q.value = 0.5;
    verb.buffer = room;
    wet.gain.value = 0.35;
    out.gain.value = LEVEL;
    verb.connect(wet);
    wet.connect(lp);
    lp.connect(out);
    ac.smashMusic = { waves: { pulse50: pulse(0.5), pulse25: pulse(0.25), pulse12: pulse(0.125) }, noise: noise,
                      lp: lp, verb: verb, out: out, dest: null };
    return ac.smashMusic;
  }

  // A session is one run of a tune. Each track has its own level, pan and
  // reverb send, and all of them pass the session's two gains, so stopping
  // it silences the notes already on their way.
  function session(ac, dest, T) {
    var k = kit(ac), dry = ac.createGain(), send = ac.createGain(), tracks = {};
    if (k.dest !== dest) { k.out.connect(dest); k.dest = dest; }
    dry.connect(k.lp);
    send.connect(k.verb);
    Object.keys(T.def.tracks).forEach(function (name) {
      var tr = T.def.tracks[name], g = ac.createGain(), rev = ac.createGain(), pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      g.gain.value = (tr.gain === undefined ? 1 : tr.gain) * (T.def.gain || 1);
      rev.gain.value = tr.reverb || 0;
      if (pan) {
        pan.pan.value = tr.pan || 0;
        g.connect(pan);
        pan.connect(dry);
      } else g.connect(dry);
      g.connect(rev);
      rev.connect(send);
      tracks[name] = { def: tr, in: g };
    });
    return { ac: ac, k: k, dry: dry, send: send, tracks: tracks, ratio: 1 };
  }

  // One flat note, as a chip plays it: a quick start, a fall to decay times
  // its level, and a quick end so that it does not click.
  function tone(s, dest, t, f, dur, gain, wave, decay, attack) {
    var o = s.ac.createOscillator(), g = s.ac.createGain(), a = attack || 0.005, end = t + dur;
    // A gain holds 1 until its first change, and a note that starts between
    // two samples can sound a sample early. Starting at 0 stops that click.
    g.gain.value = 0;
    if (s.k.waves[wave]) o.setPeriodicWave(s.k.waves[wave]); else o.type = wave;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.linearRampToValueAtTime(gain * decay, Math.max(t + a, end - 0.025));
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(end + 0.02);
  }
  function hiss(s, dest, t, dur, type, freq, q, gain, attack) {
    var src = s.ac.createBufferSource(), f = s.ac.createBiquadFilter(), g = s.ac.createGain();
    g.gain.value = 0;
    src.buffer = s.k.noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(attack ? 0.0001 : gain, t);
    if (attack) g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }
  // The drum kit. The kick falls in pitch, as a drum does; no note does.
  var KIT = {
    kick: function (s, d, t, g) {
      var o = s.ac.createOscillator(), e = s.ac.createGain();
      e.gain.value = 0;
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
      e.gain.setValueAtTime(g, t);
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(e);
      e.connect(d);
      o.start(t);
      o.stop(t + 0.2);
    },
    snare: function (s, d, t, g) {
      hiss(s, d, t, 0.13, 'bandpass', 1900, 1, g);
      tone(s, d, t, 196, 0.06, g * 0.8, 'triangle', 0.65, 0.002);
    },
    hat: function (s, d, t, g) { hiss(s, d, t, 0.03, 'highpass', 6000, 0.7, g); },
    open: function (s, d, t, g) { hiss(s, d, t, 0.22, 'highpass', 5200, 0.7, g); },
    rim: function (s, d, t, g) {
      hiss(s, d, t, 0.03, 'bandpass', 2600, 3, g);
      tone(s, d, t, 820, 0.025, g * 0.6, 'triangle', 0.5, 0.001);
    },
    clap: function (s, d, t, g) {
      for (var i = 0; i < 3; i++) hiss(s, d, t + i * 0.011, 0.02, 'bandpass', 1300, 1.5, g * 0.8);
      hiss(s, d, t + 0.033, 0.12, 'bandpass', 1300, 1.2, g);
    },
    shaker: function (s, d, t, g) { hiss(s, d, t, 0.06, 'highpass', 4500, 0.8, g, 0.012); }
  };

  function play(s, ev, t, spb) {
    var tr = s.tracks[ev.track];
    if (ev.drum) KIT[ev.drum](s, tr.in, t, ev.vel * DRUMS[ev.drum]);
    else tone(s, tr.in, t, ev.f * s.ratio, Math.max(0.03, ev.len * spb - 0.02), ev.vel, tr.def.voice || 'pulse25',
              tr.def.decay === undefined ? 0.65 : tr.def.decay, tr.def.attack);
  }

  /* ------------------------------------------------------------ player */

  var on = true, want = null, cur = null, saved = {};
  try { on = localStorage.getItem('smash-music') !== '0'; } catch (e) {}

  // Queues every note due in the next 0.15 seconds.
  function pump() {
    var ac = cur.s.ac, T = cur.T, n = T.events.length;
    while (n) {
      var ev = T.events[cur.i], t = cur.t0 + (ev.at + cur.loop * T.len - cur.b0) * cur.spb;
      if (t >= ac.currentTime + 0.15) break;
      play(cur.s, ev, t, cur.spb);
      if (++cur.i === n) { cur.i = 0; cur.loop++; }
    }
  }
  function start(w, a) {
    var T = TUNES[w.tune], s = session(a.ctx, a.out, T), t = a.ctx.currentTime + 0.05, from = saved[w.id] || 0, i = 0;
    s.ratio = w.ratio || 1;
    s.dry.gain.setValueAtTime(0, t - 0.05);
    s.dry.gain.linearRampToValueAtTime(1, t);
    while (i < T.events.length && T.events[i].at < from) i++;
    cur = { id: w.id, tune: w.tune, T: T, s: s, spb: 60 / (w.bpm || T.def.bpm), t0: t, b0: from, i: i < T.events.length ? i : 0,
            loop: i < T.events.length ? 0 : 1 };
    cur.timer = setInterval(pump, 25);
    pump();
  }
  // Stops at once, and remembers the beat now sounding, not the notes
  // already queued ahead of it.
  function stop() {
    if (!cur) return;
    var t = cur.s.ac.currentTime, s = cur.s, len = cur.T.len;
    clearInterval(cur.timer);
    saved[cur.id] = (((cur.b0 + (t - cur.t0) / cur.spb) % len) + len) % len;
    [s.dry, s.send].forEach(function (g) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.04);
    });
    setTimeout(function () { s.dry.disconnect(); s.send.disconnect(); }, 2000);
    cur = null;
  }
  function apply() {
    var a = Sound.audio();
    if (a && !a.musicHooked) {
      a.musicHooked = true;
      a.ctx.addEventListener('statechange', apply);
    }
    if (!(on && want && TUNES[want.tune] && a && !Sound.muted() && a.ctx.state === 'running' && !document.hidden)) {
      stop();
      return;
    }
    if (cur && cur.id === want.id) return;
    stop();
    start(want, a);
  }
  document.addEventListener('visibilitychange', apply);

  Smash.Music = {
    // tune: the name of a tune in music/, or null. id names this run of it:
    // the same id again resumes, a new one starts from the top. bpm and
    // ratio are optional: ratio transposes every note, 4 / 3 up a fourth.
    want: function (tune, id, bpm, ratio) {
      if (!tune) {
        if (want) { want = null; apply(); }
        return;
      }
      if (!want || want.id !== id) want = { tune: tune, id: id, bpm: bpm, ratio: ratio };
      if (!cur || cur.id !== id) apply();
    },
    refresh: apply,
    // The tune and run now playing, as 'tune/id', or null.
    playing: function () { return cur ? cur.tune + '/' + cur.id : null; },
    on: function () { return on; },
    setOn: function (v) {
      on = v;
      try { localStorage.setItem('smash-music', v ? '1' : '0'); } catch (e) {}
      apply();
    },
    // A tune's settings and its CSV rows: what each file in music/ calls.
    add: function (name, def, csv) { TUNES[name] = compile(name, def, csv); },
    // For tools and the game: the note parser, a tune's tempo, length and
    // key (its ratio to A minor), and a render of
    // a tune from the top into any audio context, such as an offline one,
    // for secs seconds.
    rcn: rcn,
    tune: function (name) {
      var T = TUNES[name];
      return T ? { bpm: T.def.bpm, beats: T.len, key: T.def.key || 1 } : null;
    },
    render: function (ac, dest, tune, secs, bpm, ratio) {
      var T = TUNES[tune], s = session(ac, dest, T), spb = 60 / (bpm || T.def.bpm);
      s.ratio = ratio || 1;
      for (var loop = 0; loop * T.len * spb < secs; loop++) {
        T.events.forEach(function (ev) {
          var t = (ev.at + loop * T.len) * spb;
          if (t < secs) play(s, ev, t, spb);
        });
      }
    }
  };
})(this);
