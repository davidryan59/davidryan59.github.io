#!/usr/bin/env python3
"""
compose.py renders tiling-loop.wav, the soundtrack of the tiling explorer
video: David's own music, arranged A B A.

The music comes from his Ableton set, copied into sections.json by
read_ableton.py: two drum kits, a bassline and a piano tune, in two 8-bar
sections, with a 7-note just intonation scale. Every note, rhythm and
velocity plays as he wrote it. The drums play his kits' own 707 and 808
samples, read from Ableton's Core Library at render time; the piano becomes
soft synth keys and the bass an analogue-style synth bass. The one addition
is a quiet pad that holds his chords. His mix carries over: track levels
and pans, the pads' levels and velocity response, the 2.5 s reverb on the
bass and the eighth-note delay on the piano.

    ../../../../daily-python-music/.venv/bin/python compose.py

ABLETON_CORE_LIBRARY names the Core Library folder if Ableton Live 12 Lite
is not in /Applications; without the samples the drums fall back to
synthesised ones.

Tuning: in the set, MIDI 55 is C4 = 261.63 Hz and each MIDI key is the next
note of his scale, 7 to the octave, so MIDI 60 is A4 and the music sits in
A minor. Here it is transposed up a pure fourth, 4/3, into D minor. The tempo is his 118 BPM, rounded to 118.03 so the 24-bar loop is
48.8 s, a whole number of video frames. Everything renders onto a circular
buffer of one loop, so the file loops with no seam. The master is linear:
filters and one static gain, never above -3 dBFS.
"""

import json
import os
import shutil
import subprocess
import wave
from fractions import Fraction as F

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.dirname(HERE)
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
OUT_WAV = os.path.join(HERE, "tiling-loop.wav")
CORE_LIBRARY = os.environ.get("ABLETON_CORE_LIBRARY",
                              "/Applications/Ableton Live 12 Lite.app/Contents/App-Resources/Core Library")
SECTIONS = json.load(open(os.path.join(HERE, "sections.json")))
RNG = np.random.default_rng(2026)

# ---------------------------------------------------------------------------
# Timing, from the video's timeline
# ---------------------------------------------------------------------------
js = ("const T=require(process.argv[1]);console.log(JSON.stringify({bars:T.BARS,loop:T.LOOP_SECONDS,bpm:T.MUSIC_BPM}))")
TL = json.loads(subprocess.check_output(["node", "-e", js, os.path.join(TOOL, "timeline.js")]))
SR = 48000
N = int(round(TL["loop"] * SR))              # 2,342,400 samples
BEATS = TL["bars"] * 4                       # 96
SPB = N // BEATS                             # 24,400 samples a beat
assert SPB * BEATS == N and abs(SECTIONS["tempo"] - TL["bpm"]) < 0.1
TARGET_LUFS = -18.0
PEAK_CEILING_DB = -3.0
# The drums use his real samples and settings. The synth bass and keys stand
# in for instruments whose output level is unknown, so they are trimmed to
# sit with the drums, the piano tune just above them. The bass plays an
# octave below his part. The pad is quiet, and the reverb and delay returns
# play at a quarter of their full level.
BASS_TRIM = 0.234
KEYS_TRIM = 0.23
BASS_OCTAVES = -1
PAD_LEVEL = 0.0011
# Everything pitched is transposed up a pure fourth, 4/3: his A minor becomes
# D minor with every interval unchanged. The drums stay as sampled.
TRANSPOSE = F(4, 3)
# Stereo, from -1 (left) to +1 (right): low sounds in the middle, high ones to
# the outside, snare and open hat on opposite sides. Each piano chord and each
# pad pair splits its two notes, lower left and upper right.
DRUM_PAN = {"Bassdrum": 0.0, "Snare": -0.35, "Open Hi Hat": 0.8, "Tamb": 0.9, "Ride": -0.9,
            "Maracas": -0.85, "Rim Shot": 0.6}
BASS_PAN = 0.0
PIANO_SPREAD = 0.4
PAD_SPREAD = 0.55
REVERB_LEVEL = 0.25
DELAY_LEVEL = 0.25
TP_CEILING = -1.0


def at(beat):
    return int(round(beat * SPB))


# ---------------------------------------------------------------------------
# Tuning: David's scale, as Ableton maps it
# ---------------------------------------------------------------------------
TUNING = SECTIONS["tuning"]
SCALE = [F(r) for r in TUNING["ratios"]]       # C D E F G A B
REF_HZ = TUNING["reference"]["hz"]             # C4
C4_KEY = 55
USED = set()


def key_ratio(key):
    octave, index = divmod(key - C4_KEY, 7)
    return SCALE[index] * F(2) ** octave


def key_hz(key, octaves=0):
    r = key_ratio(key) * TRANSPOSE * F(2) ** octaves
    USED.add(r)
    return REF_HZ * float(r)


# ---------------------------------------------------------------------------
# David's parts, laid out as A B A
# ---------------------------------------------------------------------------
TRACKS = {t["name"]: t for t in SECTIONS["tracks"]}
KIT707, KIT808, BASS, PIANO = (TRACKS[n] for n in ("1-707 Core Kit", "2-808 Core Kit", "3-Analog Bass", "4-Grand Piano"))
FORM = [("A", 0), ("B", 8), ("A", 16)]


def placed(track):
    """Every note of a track across the loop: (beat, beats long, key, velocity)."""
    out = []
    for sec, bar in FORM:
        clip = track["sections"][sec]
        for rep in range(int(32 / clip["length"])):
            for n in clip["notes"]:
                out.append((bar * 4 + rep * clip["length"] + n["time"], n["duration"], n["key"], n["velocity"]))
    return out


def human(v, spread=0.05):
    """A velocity, nudged a little up or down."""
    return v * (1 + spread * (2 * RNG.random() - 1))


def vel_gain(velocity, sensitivity):
    """Volume from velocity: full sensitivity follows velocity, none ignores it."""
    return (velocity / 127) ** (2 * sensitivity)


# The pad: two quiet notes between the bass and the piano, each held for a
# whole bar and changing only at bar lines. choose_pad() takes, bar by bar,
# the two notes of the scale that sound best against every piano and bass
# note in that bar, weighted by how long they overlap, a third, fourth, fifth
# or sixth apart. Consonance is measured by Tenney height, log2(n * d) of each
# interval's ratio: a pure fifth, 3/2, scores 2.6, while the scale's
# out-of-tune fifth between its 2nd and 5th notes, 40/27, scores 10.1. A small
# penalty keeps the pad from jumping between bars.
PAD_RANGE_HZ = (150, 420)
PAD_INTERVALS = {F(6, 5), F(5, 4), F(4, 3), F(3, 2), F(8, 5), F(5, 3)}
PAD_TAIL_S = 0.5
NOTE_NAMES = ["F", "G", "A", "Bb", "C", "D", "E"]       # his C D E F G A B, a fourth up


def note_name(r):
    """The name of a transposed note of the scale, such as D4."""
    base = r / TRANSPOSE
    octave = int(np.floor(np.log2(float(base)) + 1e-9))
    index = SCALE.index(base / F(2) ** octave)
    return f"{NOTE_NAMES[index]}{4 + octave + (1 if index >= 4 else 0)}"


def tenney(r):
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return np.log2(r.numerator * r.denominator)


def choose_pad():
    """The pad's pair for each bar: (start beat, end beat, (low, high) ratios, names)."""
    sounding = ([(t, t + d, key_ratio(k) * TRANSPOSE) for t, d, k, v in placed(PIANO)]
                + [(t, t + d, key_ratio(k) * TRANSPOSE * F(2) ** BASS_OCTAVES) for t, d, k, v in placed(BASS)])
    tones = sorted(r for r in (SCALE[i] * F(2) ** o * TRANSPOSE for o in range(-3, 2) for i in range(7))
                   if PAD_RANGE_HZ[0] <= REF_HZ * float(r) <= PAD_RANGE_HZ[1])
    out, prev = [], None
    for bar in range(BEATS // 4):
        b0, b1 = bar * 4, bar * 4 + 4
        around = [(min(e, b1) - max(s, b0), r) for s, e, r in sounding if s < b1 and b0 < e]
        total = sum(w for w, r in around)
        dis = {c: sum(w * tenney(c / r) for w, r in around) / total for c in tones}
        best = None
        for r1 in tones:
            for r2 in tones:
                if r2 <= r1 or r2 / r1 not in PAD_INTERVALS:
                    continue
                cost = dis[r1] + dis[r2]
                if prev:
                    cost += 3 * (abs(np.log2(float(r1 / prev[0]))) + abs(np.log2(float(r2 / prev[1]))))
                if best is None or cost < best[0]:
                    best = (cost, (r1, r2))
        out.append((b0, b1, best[1], tuple(note_name(r) for r in best[1])))
        prev = best[1]
    return out


# ---------------------------------------------------------------------------
# Sounds
# ---------------------------------------------------------------------------
def osc(f, n, kind="triangle", duty=0.5, cap=4000.0, soft=None):
    """Band-limited additive oscillator at a fixed frequency."""
    phi = 2 * np.pi * f * np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, max(1, int(cap // f)) + 1):
        if kind == "triangle":
            if k % 2 == 0:
                continue
            a, term = (8 / np.pi ** 2) * (-1) ** ((k - 1) // 2) / k ** 2, np.sin(k * phi)
        elif kind == "saw":
            a, term = 2 / (np.pi * k), np.sin(k * phi)
        else:
            a, term = (4 / (np.pi * k)) * np.sin(np.pi * k * duty), np.cos(k * phi)
        if soft:
            a /= 1 + (k * f / soft) ** 2
        out += a * term
    return out


def keys(f, seconds):
    """Soft synth keys for the piano part: pulse and triangle, with a piano-like decay and release."""
    held = int(seconds * SR)
    n = held + int(0.45 * SR)
    sig = 0.5 * osc(f, n, "pulse", 0.25, cap=4000, soft=2200) + 0.5 * osc(f, n, "triangle", cap=4000)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.003) * (0.5 * np.exp(-t / 0.3) + 0.5 * np.exp(-t / 2.5))
    env[held:] *= np.exp(-np.arange(n - held) / SR / 0.12)
    return sig * env


def synth_bass(f, seconds):
    """Analogue-style bass: saw and square, dark, with a brighter pluck at the start."""
    n = int(seconds * SR) + int(0.04 * SR)
    t = np.arange(n) / SR
    dark = 0.6 * osc(f, n, "saw", cap=3000, soft=500) + 0.4 * osc(f, n, "pulse", 0.5, cap=3000, soft=500)
    bright = 0.6 * osc(f, n, "saw", cap=3000, soft=1400) + 0.4 * osc(f, n, "pulse", 0.5, cap=3000, soft=1400)
    pluck = np.exp(-t / 0.08)
    sig = np.tanh(1.6 * (dark * (1 - pluck) + bright * pluck)) / np.tanh(1.6)
    env = np.minimum(1, t / 0.004) * (0.7 + 0.3 * np.exp(-t / 0.25))
    held = int(seconds * SR)
    env[held:] *= np.linspace(1, 0, n - held)
    return sig * env


def pad_note(f, seconds):
    n = int(seconds * SR) + int(PAD_TAIL_S * SR)
    t = np.arange(n) / SR
    sig = osc(f, n, "triangle", cap=2000)
    env = np.clip(t / 0.4, 0, 1) ** 2
    held = int(seconds * SR)
    env[held:] *= np.linspace(1, 0, n - held)
    return sig * env


_samples = {}


def drum_sample(rel):
    """One of his kits' samples from Ableton's Core Library, as float stereo at 48 kHz."""
    if rel not in _samples:
        path = os.path.join(CORE_LIBRARY, rel)
        raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                             capture_output=True, check=True).stdout
        _samples[rel] = np.frombuffer(raw, "<f4").reshape(-1, 2).T.astype(float)
    return _samples[rel]


def synth_drum(name):
    """Fallback drums, if the Core Library is missing."""
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    if "Kick" in name:
        sig = np.sin(2 * np.pi * np.cumsum(55 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.15)
    elif "Snare" in name:
        sig = 0.5 * noise * np.exp(-t / 0.06) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    elif "Rim" in name:
        sig = np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.015)
    else:
        sig = noise * np.exp(-t / (0.08 if "Open" in name else 0.02)) * 0.4
    return np.stack([sig, sig])


# ---------------------------------------------------------------------------
# Mixing: stems on a circular buffer of one loop, then his two returns
# ---------------------------------------------------------------------------
STEMS = {k: np.zeros((2, N)) for k in ("drums", "bass", "keys", "pad")}
SENDS = {"reverb": np.zeros((2, N)), "delay": np.zeros((2, N))}


def pan_gains(pan):
    th = (pan + 1) * np.pi / 4
    return np.sqrt(2) * np.cos(th), np.sqrt(2) * np.sin(th)


def add(buf, start, sig, pan=0.0, gain=1.0):
    """Adds mono or stereo sig at a sample offset, wrapping round the loop."""
    if sig.ndim == 1:
        sig = np.stack([sig, sig])
    gl, gr = pan_gains(pan)
    sig = sig * np.array([[gl * gain], [gr * gain]])
    start, n = int(start) % N, sig.shape[1]
    first = min(n, N - start)
    buf[:, start:start + first] += sig[:, :first]
    if n > first:
        buf[:, :n - first] += sig[:, first:]


def fft_filter(x, lo=None, hi=None):
    f = np.fft.rfftfreq(N, 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask /= np.sqrt(1 + (lo / np.maximum(f, 1.0)) ** 4)
    if hi:
        mask /= np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(np.fft.rfft(x, axis=-1) * mask, N, axis=-1)


def band_noise(n, lo, hi, seed):
    x = np.random.default_rng(seed).standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask /= 1 + (lo / np.maximum(f, 1.0)) ** 4
    if hi:
        mask /= 1 + (f / hi) ** 4
    return np.fft.irfft(np.fft.rfft(x) * mask, n)


def reverb(bus, decay=2.5):
    """His A-Reverb return: a decaying-noise room, as a circular convolution."""
    n = int(decay * 1.2 * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, N))
    for ch in range(2):
        low = band_noise(n, None, 2500, 60 + ch) * np.exp(-6.9 * t / decay)
        high = band_noise(n, 2500, 8000, 70 + ch) * np.exp(-6.9 * t / (decay * 0.4))
        ir = np.zeros(N)
        pre = int(0.0025 * SR)
        ir[pre:pre + n] = low + 0.5 * high
        ir /= np.sqrt((ir ** 2).sum())
        out[ch] = np.fft.irfft(np.fft.rfft(bus[ch]) * np.fft.rfft(ir), N)
    return out


def delay(bus, beats=0.5, feedback=0.3468):
    """His B-Delay return: eighth-note echoes, fully wet, feedback 35%."""
    out = np.zeros_like(bus)
    for i in range(1, 12):
        out += np.roll(bus, i * at(beats), axis=1) * feedback ** (i - 1)
    return out


def render():
    have_samples = os.path.isdir(CORE_LIBRARY)
    for kit in (KIT707, KIT808):
        mix = kit["mixer"]
        for t, d, key, v in placed(kit):
            pad = kit["drum_pads"].get(str(key))
            if not pad:
                continue
            sig = drum_sample(pad["sample"]) if have_samples else synth_drum(pad["name"])
            g = vel_gain(human(v), pad["velocity_to_volume"]) * 10 ** (pad["volume_db"] / 20) * mix["volume"]
            add(STEMS["drums"], at(t), sig, pan=DRUM_PAN.get(pad["name"], 0.0), gain=g)

    mix = BASS["mixer"]
    for t, d, key, v in placed(BASS):
        sig = synth_bass(key_hz(key, BASS_OCTAVES), d * SPB / SR)
        g = vel_gain(human(v), 0.5) * mix["volume"] * BASS_TRIM
        add(STEMS["bass"], at(t), sig, pan=BASS_PAN, gain=g)
        add(SENDS["reverb"], at(t), sig, pan=BASS_PAN, gain=g * mix["sends"][0])

    mix = PIANO["mixer"]
    piano = placed(PIANO)
    chords = {}
    for t, d, key, v in piano:
        chords.setdefault(round(t, 6), []).append(key)
    for t, d, key, v in piano:
        chord = sorted(chords[round(t, 6)])
        pan = 0.0 if len(chord) == 1 else (-PIANO_SPREAD if key == chord[0] else PIANO_SPREAD)
        sig = keys(key_hz(key), d * SPB / SR)
        g = vel_gain(human(v), 0.5) * 10 ** (-8 / 20) * mix["volume"] * KEYS_TRIM
        add(STEMS["keys"], at(t), sig, pan=pan, gain=g)
        add(SENDS["delay"], at(t), sig, pan=pan, gain=g * mix["sends"][1])
        add(SENDS["reverb"], at(t), sig, pan=pan, gain=g * 0.15)      # the piano rack's own reverb

    # Pad: a note held on while the next pair keeps it, including across the loop join.
    voices = [[], []]
    for b0, b1, pair, names in choose_pad():
        for v, r in enumerate(pair):
            if voices[v] and voices[v][-1][2] == r and abs(voices[v][-1][1] - b0) < 1e-9:
                voices[v][-1][1] = b1
            else:
                voices[v].append([b0, b1, r])
    for notes in voices:
        if len(notes) > 1 and notes[-1][2] == notes[0][2] and notes[-1][1] == BEATS and notes[0][0] == 0:
            notes[-1][1] += notes[0][1]
            notes.pop(0)
    for v, notes in enumerate(voices):
        for b0, b1, r in notes:
            USED.add(r)
            sig = pad_note(REF_HZ * float(r), (b1 - b0) * SPB / SR)
            add(STEMS["pad"], at(b0), sig, pan=(-PAD_SPREAD, PAD_SPREAD)[v], gain=PAD_LEVEL)
            add(SENDS["reverb"], at(b0), sig, pan=(-PAD_SPREAD, PAD_SPREAD)[v], gain=PAD_LEVEL * 0.3)


def write_wav(path, y):
    rng = np.random.default_rng(7)
    dither = (rng.random(y.shape) - rng.random(y.shape)) / 32768
    data = np.clip(np.round((y + dither) * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.T.reshape(-1).tobytes())


def measure(y):
    tmp = os.path.join(HERE, "_measure.wav")
    write_wav(tmp, np.clip(y, -1, 1))
    out = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", tmp, "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    os.remove(tmp)
    summary = out[out.rindex("Summary:"):]
    return float(summary.split("I:")[1].split("LUFS")[0]), float(summary.split("Peak:")[1].split("dBFS")[0])


def master():
    """Linear: filters and one static gain, never above PEAK_CEILING_DB."""
    mix = sum(STEMS.values()) + REVERB_LEVEL * reverb(SENDS["reverb"]) + DELAY_LEVEL * delay(SENDS["delay"])
    mix = fft_filter(mix, lo=35, hi=12000)
    peak = np.abs(mix).max()
    lufs, _ = measure(mix / peak)
    gain = 10 ** ((TARGET_LUFS - lufs) / 20) / peak
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    if peak * gain > ceiling:
        gain = ceiling / peak
        print(f"note: the peak ceiling holds the track below {TARGET_LUFS} LUFS")
    y = mix * gain
    lufs, tp = measure(y)
    assert np.abs(y).max() <= ceiling + 1e-9 and tp <= TP_CEILING, f"true peak {tp} dBTP is over {TP_CEILING}"
    return y, lufs, tp


def main():
    render()
    y, lufs, tp = master()
    write_wav(OUT_WAV, y)
    with wave.open(OUT_WAV) as w:
        assert w.getnframes() == N
    print(f"tempo {60 * SR / SPB:.4f} BPM, {BEATS // 4} bars, {N / SR} s, A B A; drums from "
          + ("the Core Library" if os.path.isdir(CORE_LIBRARY) else "synthesised fallbacks"))
    print(f"pitches: {len(USED)} ratios of C4 = {REF_HZ} Hz, all from the scale {' '.join(TUNING['ratios'])}")
    print(f"loudness {lufs:.1f} LUFS, true peak {tp:.1f} dBTP")
    print("pad, bar by bar:", " ".join(f"{n[0]}+{n[1]}" for b0, b1, pair, n in choose_pad()))
    for k, v in STEMS.items():
        loud, _ = measure(v / np.abs(v).max() * 0.5)
        print(f"  stem {k:5s} loudness {loud + 20 * np.log10(2 * np.abs(v).max()):6.1f} LUFS (before master gain)")
    print("wrote", OUT_WAV)


if __name__ == "__main__":
    main()
