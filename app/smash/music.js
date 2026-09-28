/* The background music: a short tune for the title screen, and a fuller
   version of it for the game. Both are in A minor and in just intonation.
   Every chord is tuned pure, from ratios of 2, 3 and 5, and the one E7
   takes its seventh from the 7th harmonic. They play on chip sounds: a
   pulse-wave lead, a triangle bass and noise drums, synthesised like every
   other sound on the page, with no slides and no vibrato.

   The game says which tune it wants. The music plays only while that is
   set, the Sound and Music buttons are on and the tab is showing. A tune
   stopped part way picks up where it stopped, if the game asks for the
   same one again. */
(function (global) {
  'use strict';

  var Smash = global.Smash, Sound = Smash.Sound;
  var LEVEL = 0.7;

  // Each note as a ratio over A. G# is for E major, and Dh, the 7th
  // harmonic of E, is the seventh of E7.
  var RATIO = { A: 1, B: 9 / 8, C: 6 / 5, D: 4 / 3, Dh: 21 / 16, E: 3 / 2, F: 8 / 5, G: 9 / 5, 'G#': 15 / 8 };
  // 'C5' or 'G#4' in hertz, with A4 = 440. An octave starts at C, so A and
  // B sit above the C of their own octave.
  function hz(name) {
    var m = /^([A-G][h#]?)(\d)$/.exec(name), o = +m[2] - (m[1][0] === 'A' || m[1][0] === 'B' ? 4 : 5);
    return 440 * RATIO[m[1]] * Math.pow(2, o);
  }
  var CHORD = { Am: ['A', 'C', 'E'], F: ['F', 'A', 'C'], Dm: ['D', 'F', 'A'], E: ['E', 'G#', 'B'], E7: ['E', 'G#', 'B', 'Dh'] };
  // A chord's notes upwards from its root in octave o, each one pure
  // against the root.
  function voicing(chord, o) {
    var out = [];
    CHORD[chord].forEach(function (n) {
      var f = hz(n + o);
      while (out.length && f <= out[out.length - 1]) f *= 2;
      out.push(f);
    });
    return out;
  }

  /* The tunes, one eighth note to a token: a note starts, '-' holds it and
     '.' rests. The game tune plays the title's eight bars, then eight more
     that climb through D minor to E and E7. */
  var TITLE = ['A4 - C5 - E5 - D5 C5', 'E5 - - - . . . .', 'F5 - E5 - C5 - A4 -', 'B4 - - - G#4 - - -',
               'A4 - C5 - E5 - A5 -', 'G5 - E5 - . . . .', 'F5 - E5 - D5 - C5 -', 'B4 - G#4 - E4 - - -'];
  var CLIMB = ['D5 - F5 - A5 - F5 -', 'E5 - D5 - . . . .', 'C5 - E5 - A5 - E5 -', 'B4 - C5 - . . . .',
               'D5 - F5 - A5 - F5 E5', 'F5 - - - D5 - - -', 'E5 - G#5 - B5 - G#5 -', 'Dh5 - B4 - G#4 - E4 -'];
  function lead(bars) {
    var tokens = bars.join(' ').split(/\s+/), out = [];
    tokens.forEach(function (tk, i) {
      if (tk === '-' || tk === '.') { out.push(null); return; }
      var n = 1;
      while (tokens[i + n] === '-') n++;
      out.push({ f: hz(tk), n: n });
    });
    return out;
  }
  var TUNES = {
    title: { bpm: 100, chords: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'F', 'E'], lead: lead(TITLE), gain: 0.075, band: titleBand },
    game: { bpm: 138, chords: ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'F', 'E', 'Dm', 'Dm', 'Am', 'Am', 'Dm', 'Dm', 'E', 'E7'],
            lead: lead(TITLE.concat(CLIMB)), gain: 0.06, band: gameBand }
  };

  /* ------------------------------------------------------------ sounds */

  // Pulse waves for the lead and the arpeggio, noise for the drums and a
  // small room for the reverb, made once for each audio context.
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
    // Everything passes a low-pass at 7 kHz, so the music stays soft
    // under the smashing.
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
    ac.smashMusic = { pulse25: pulse(0.25), pulse12: pulse(0.125), noise: noise, lp: lp, verb: verb, out: out, dest: null };
    return ac.smashMusic;
  }

  // A session is one run of a tune. Its notes go through its own two
  // gains, dry and to the reverb, so stopping it silences the notes
  // already on their way.
  function session(ac, dest) {
    var k = kit(ac), dry = ac.createGain(), send = ac.createGain();
    if (k.dest !== dest) { k.out.connect(dest); k.dest = dest; }
    dry.connect(k.lp);
    send.connect(k.verb);
    return { ac: ac, k: k, dry: dry, send: send };
  }

  // One flat note, as a chip plays it: a quick start, a slight fall, and a
  // quick end so that it does not click.
  function note(s, t, f, dur, gain, wave, wet, attack) {
    var ac = s.ac, o = ac.createOscillator(), g = ac.createGain(), a = attack || 0.005, end = t + dur;
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.linearRampToValueAtTime(gain * 0.65, Math.max(t + a, end - 0.025));
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(g);
    g.connect(s.dry);
    if (wet) g.connect(s.send);
    o.start(t);
    o.stop(end + 0.02);
  }
  function hiss(s, t, dur, type, freq, gain) {
    var ac = s.ac, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = s.k.noise;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(s.dry);
    src.start(t, Math.random() * 0.5, dur + 0.02);
  }
  function kick(s, t, gain) {
    var ac = s.ac, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g);
    g.connect(s.dry);
    o.start(t);
    o.stop(t + 0.2);
  }
  function snare(s, t, gain) {
    hiss(s, t, 0.13, 'bandpass', 1900, gain);
    note(s, t, 196, 0.06, gain * 0.8, 'triangle', false, 0.002);
  }

  /* The parts under the lead, for eighth i of a bar, at time t, with an
     eighth lasting e seconds. */
  function titleBand(s, chord, bar, i, t, e) {
    var b = voicing(chord, 2), pad = voicing(chord, 3);
    if (i === 0) pad.slice(1).forEach(function (f) { note(s, t, f, 8 * e, 0.016, 'triangle', true, 0.12); });
    if (i === 0) note(s, t, b[0], 2.8 * e, 0.16, 'triangle');
    if (i === 3) note(s, t, b[0], 0.9 * e, 0.16, 'triangle');
    if (i === 4) note(s, t, b[2], 1.8 * e, 0.16, 'triangle');
    if (i === 6) note(s, t, b[0] * 2, 1.8 * e, 0.14, 'triangle');
  }
  var ARP = [0, 1, 2, 1, 2, 1, 0, 2], ARP7 = [0, 1, 2, 3, 2, 1, 3, 2];
  function gameBand(s, chord, bar, i, t, e) {
    var b = voicing(chord, 2), arp = voicing(chord, 3), fill = bar % 8 === 7;
    note(s, t, b[0] * (i % 2 ? 2 : 1), 0.85 * e, 0.15, 'triangle');
    note(s, t, arp[(arp.length > 3 ? ARP7 : ARP)[i]], 0.8 * e, 0.024, s.k.pulse12, true);
    if (i === 0 || (i === 4 && !fill) || (i === 5 && bar % 2 && !fill)) kick(s, t, 0.24);
    if (i === 2 || i === 6 || (fill && i > 3)) snare(s, t, fill && i > 3 ? 0.04 + 0.015 * (i - 4) : 0.07);
    if (i % 2) hiss(s, t, 0.03, 'highpass', 6000, 0.03);
  }

  // Everything that starts on eighth n of a tune.
  function play(s, T, n, t, e) {
    var bar = Math.floor(n / 8) % T.chords.length, L = T.lead[n % T.lead.length];
    if (L) note(s, t, L.f, L.n * e - 0.02, T.gain, s.k.pulse25, true);
    T.band(s, T.chords[bar], bar, n % 8, t, e);
  }

  /* ------------------------------------------------------------ player */

  var on = true, want = null, cur = null, saved = { id: null, step: 0 };
  try { on = localStorage.getItem('smash-music') !== '0'; } catch (e) {}

  function pump() {
    var ac = cur.s.ac, len = cur.T.chords.length * 8;
    while (cur.next < ac.currentTime + 0.15) {
      play(cur.s, cur.T, cur.step, cur.next, cur.e);
      cur.next += cur.e;
      cur.step = (cur.step + 1) % len;
    }
  }
  function start(w, a) {
    var T = TUNES[w.tune], s = session(a.ctx, a.out), t = a.ctx.currentTime;
    s.dry.gain.setValueAtTime(0, t);
    s.dry.gain.linearRampToValueAtTime(1, t + 0.05);
    cur = { id: w.id, T: T, s: s, e: 30 / (w.bpm || T.bpm), next: t + 0.05, step: saved.id === w.id ? saved.step : 0 };
    cur.timer = setInterval(pump, 25);
    pump();
  }
  // Stops at once, and remembers the eighth now sounding, not the ones
  // already queued ahead of it.
  function stop() {
    if (!cur) return;
    var ac = cur.s.ac, t = ac.currentTime, len = cur.T.chords.length * 8, s = cur.s;
    clearInterval(cur.timer);
    saved = { id: cur.id, step: ((cur.step - Math.ceil((cur.next - t) / cur.e)) % len + len) % len };
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
    if (!(on && want && a && !Sound.muted() && a.ctx.state === 'running' && !document.hidden)) { stop(); return; }
    if (cur && cur.id === want.id) return;
    stop();
    start(want, a);
  }
  document.addEventListener('visibilitychange', apply);

  Smash.Music = {
    // tune: 'title', 'game' or null. id names this run of it: the same id
    // again resumes, a new one starts from the top. bpm is optional.
    want: function (tune, id, bpm) {
      if (!tune) {
        if (want) { want = null; apply(); }
        return;
      }
      if (!want || want.id !== id) want = { tune: tune, id: id, bpm: bpm };
      if (!cur || cur.id !== id) apply();
    },
    refresh: apply,
    // The id of the run now playing, or null.
    playing: function () { return cur ? cur.id : null; },
    on: function () { return on; },
    setOn: function (v) {
      on = v;
      try { localStorage.setItem('smash-music', v ? '1' : '0'); } catch (e) {}
      apply();
    },
    // Plays a tune from the top into any audio context, such as an offline
    // one, for secs seconds. For tools that record it.
    render: function (ac, dest, tune, secs, bpm) {
      var T = TUNES[tune], s = session(ac, dest), e = 30 / (bpm || T.bpm);
      for (var n = 0; n * e < secs; n++) play(s, T, n % (T.chords.length * 8), n * e, e);
    },
    bars: function (tune) { return TUNES[tune].chords.length; },
    bpm: function (tune) { return TUNES[tune].bpm; }
  };
})(this);
