#!/usr/bin/env python3
"""
house.py is the calm chiptune tropical house soundtrack that David approved
on 2026-09-24, kept for reference. It was written for the 45-second, 20-bar
timeline (80 BPM video beats, 320/3 BPM music) and will not run against the
48.8-second timeline without changes.

It rendered tiling-loop.wav: a 45-second loop of calm chiptune tropical
house for the tiling explorer video (see ../storyboard.md and ../timeline.js).

Run it with the Python environment of daily-python-music, whose justsynth
prints the chords in David's rational comma notation. That repo is expected
beside this one; JUSTSYNTH_REPO overrides it:

    ../../../../daily-python-music/.venv/bin/python compose.py

The brief: background music, calm and gentle, with subtle emphases. A soft
four-to-the-floor kick, a muted snare, a bass that pulses on the off-beats,
and a muted lead, with little treble. Just intonation with no prime above 7.
No sliding notes. An A B A form, each section with its own fixed chord
progression and reused melodic material, and B related to A. About 60% major
chords, 25% minor and 15% other.

Tempo 320/3 BPM: a bar is 2.25 s, three of the video's beats, and the loop is
exactly 20 bars. The script reads the video's events from timeline.js and
stops if one is off the beat grid. Everything renders onto a circular buffer
of one loop, and the reverb and the echoes wrap round, so the file loops with
no seam.
"""

import json
import os
import shutil
import subprocess
import sys
import wave
from fractions import Fraction as F

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.dirname(HERE)
REPO = os.path.abspath(os.environ.get(
    "JUSTSYNTH_REPO", os.path.join(HERE, "..", "..", "..", "..", "daily-python-music")))
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
OUT_WAV = os.path.join(HERE, "house-loop.wav")
OUT_PNG = os.path.join(HERE, "house-spectrogram.png")

try:
    sys.path.insert(0, REPO)
    from justsynth.notation.ji import value_to_rcn  # noqa: E402
except ImportError:
    value_to_rcn = None

# ---------------------------------------------------------------------------
# Format, tempo and tuning
# ---------------------------------------------------------------------------
SR = 48000
N = 45 * SR                  # 2,160,000 samples, one loop
BEATS = 80                   # music beats per loop, 20 bars of 4/4
SPB = N // BEATS             # 27,000 samples per music beat
S16 = SPB // 4               # 6,750 samples per sixteenth
VIDEO_BEAT = N // 60         # 36,000 samples per video beat
TONIC_HZ = 256.0             # C4 = 1/1
TARGET_LUFS = -18.0          # background music, with headroom for small speakers
PEAK_CEILING_DB = -3.0       # highest sample allowed in the master
TP_CEILING = -1.0            # highest true peak allowed, in dBTP
LOWPASS_HZ = 7000            # the whole mix, for little treble


def at(m):
    """Sample index of music beat m."""
    return int(round(m * SPB))


# ---------------------------------------------------------------------------
# Harmony
# ---------------------------------------------------------------------------
USED = set()


def use(r):
    USED.add(F(r))
    return F(r)


def hz(r):
    return TONIC_HZ * float(r)


# Every chord is pure. Ratios are to C4.
CHORD = {
    "I": (F(1), F(5, 4), F(3, 2)),                   # C E G       4:5:6
    "IV": (F(4, 3), F(5, 3), F(2)),                  # F A C       4:5:6
    "V": (F(3, 2), F(15, 8), F(9, 4)),               # G B D       4:5:6
    "vi": (F(5, 3), F(2), F(5, 2)),                  # A C E       10:12:15
    "iii": (F(5, 4), F(3, 2), F(15, 8)),             # E G B       10:12:15
    "IVsus2": (F(4, 3), F(3, 2), F(2)),              # F G C       8:9:12
    "Vsus4": (F(3, 2), F(2), F(9, 4)),               # G C D       6:8:9
    "q4": (F(27, 32), F(9, 8), F(3, 2), F(2)),       # A D G C     pure fourths
    "V7": (F(3, 2), F(15, 8), F(9, 4), F(21, 8)),    # G B D F     4:5:6:7
}
KIND = {"I": "major", "IV": "major", "V": "major", "vi": "minor", "iii": "minor",
        "IVsus2": "other", "Vsus4": "other", "q4": "other", "V7": "other"}
BASS = {"I": F(1, 4), "IV": F(1, 3), "V": F(3, 8), "vi": F(5, 12), "iii": F(5, 16),
        "IVsus2": F(1, 3), "Vsus4": F(3, 8), "q4": F(9, 32), "V7": F(3, 8)}
# The chord of fourths keeps its stacked voicing; the rest fold into range.
FIXED_VOICING = {"q4": (F(27, 32), F(9, 8), F(3, 2), F(2))}

# A B A. A is the shape morph and, as A', the edge sweeps and the return to
# the Hat. B is the colours and the zoom. A tuple splits the bar in two. A
# ends on the dominant seventh, which resolves across the loop join.
A = ["I", "V", "vi", "IV", "I", ("I", "V7")]
B = ["vi", ("IV", "IVsus2"), "I", "iii", "IV", "q4", "vi", ("Vsus4", "V")]
PROGRESSION = A + B + A
SECTIONS = [(0, 6, "A"), (6, 14, "B"), (14, 20, "A'")]


def chord_at(m):
    c = PROGRESSION[int(m // 4) % 20]
    if isinstance(c, tuple):
        c = c[0] if (m % 4) < 2 else c[1]
    return c


def chord_spans():
    spans = []
    for bar, c in enumerate(PROGRESSION):
        if isinstance(c, tuple):
            spans += [(bar * 4, bar * 4 + 2, c[0]), (bar * 4 + 2, bar * 4 + 4, c[1])]
        else:
            spans.append((bar * 4, bar * 4 + 4, c))
    return spans


# Melody letters. A few change with the chord, so every held interval stays
# pure: A is 27/16 over V, Vsus4 and the fourths, D is 10/9 over IV and vi,
# and F is the 7th harmonic of G, 21/16, over V7.
LETTER = {"C": F(1), "D": F(9, 8), "E": F(5, 4), "F": F(4, 3), "G": F(3, 2), "A": F(5, 3), "B": F(15, 8)}


def note(name, chord):
    letter, octave = name[0], int(name[1:])
    r = LETTER[letter]
    if letter == "A" and chord in ("V", "V7", "Vsus4", "q4"):
        r = F(27, 16)
    if letter == "D" and chord in ("IV", "vi"):
        r = F(10, 9)
    if letter == "F" and chord == "V7":
        r = F(21, 16)
    return use(r * F(2) ** (octave - 4))


def voicing(chord, lo, hi):
    if chord in FIXED_VOICING:
        tones = [r * 2 ** round(np.log2(float(lo / F(27, 32)))) for r in FIXED_VOICING[chord]]
        return [use(r) for r in tones]
    tones = set()
    for r in CHORD[chord]:
        while r < lo:
            r *= 2
        while r >= hi:
            r /= 2
        tones.add(use(r))
    return sorted(tones)


def max_prime(r):
    worst = 1
    for x in (r.numerator, r.denominator):
        p = 2
        while x > 1:
            while x % p == 0:
                x //= p
                worst = max(worst, p)
            p += 1
    return worst


# ---------------------------------------------------------------------------
# The video's events, read from timeline.js
# ---------------------------------------------------------------------------
def load_timeline():
    js = ("const T=require(process.argv[1]);const g=[];for(let i=0;i<=24000;i++)g.push(i*T.BEATS/24000);"
          "console.log(JSON.stringify({moves:T.MOVES,colours:T.COLOURS,stops:T.STOPS,zoomFar:T.ZOOM_FAR,"
          "musicBpm:T.MUSIC_BPM,bpm:T.BPM,beats:T.BEATS,sweeps:T.SWEEPS,grid:g,"
          "edge:g.map(b=>{const e=T.edgeAt(b);return e?[e.index,e.amount]:[-1,0];}),"
          "zoom:g.map(b=>T.zoomAt(b))}))")
    return json.loads(subprocess.check_output(["node", "-e", js, os.path.join(TOOL, "timeline.js")]))


TL = load_timeline()
assert TL["bpm"] == 80 and TL["beats"] == 60 and abs(TL["musicBpm"] - 320 / 3) < 1e-9, "tempo changed in timeline.js"


def on_grid(video_beat):
    """Music beat of a video beat. Events the music marks must be on the 16th grid."""
    m = video_beat * 4 / 3
    assert abs(m * 4 - round(m * 4)) < 1e-6, f"video beat {video_beat} is off the music grid"
    return round(m * 4) / 4


ARRIVALS = []
for b0, b1, d0, d1 in TL["moves"]:
    name = [s[1] for s in TL["stops"] if s[0] == d1][0]
    ARRIVALS.append((on_grid(b1), name))
COLOUR_EVENTS = [(on_grid(b), cid) for b, cid, label in TL["colours"] if b > 0 and cid != "pastel"]

# Per-sample curves: the edge sweep and its height, and the zoom depth
# (0 normal, 1 furthest out).
_s = np.array(TL["grid"]) * VIDEO_BEAT
_idx = np.arange(N)
EDGE_AMOUNT = np.interp(_idx, _s, [e[1] for e in TL["edge"]])
EDGE_INDEX = np.array([e[0] for e in TL["edge"]])[np.clip(np.searchsorted(_s, _idx, side="right") - 1, 0, len(_s) - 1)]
ZOOM_DEPTH = np.clip(np.log(np.interp(_idx, _s, TL["zoom"])) / np.log(TL["zoomFar"]), 0, 1)

# ---------------------------------------------------------------------------
# Sound sources. No pitch ever moves: every note holds one frequency.
# ---------------------------------------------------------------------------
def osc(f, n, kind="triangle", duty=0.5, cap=2500.0, soft=None):
    """Band-limited additive oscillator at a fixed frequency f, n samples."""
    phi = 2 * np.pi * f * np.arange(n) / SR
    if kind == "sine":
        return np.sin(phi)
    out = np.zeros(n)
    for k in range(1, max(1, int(cap // f)) + 1):
        if kind == "triangle":
            if k % 2 == 0:
                continue
            a, term = (8 / np.pi ** 2) * (-1) ** ((k - 1) // 2) / k ** 2, np.sin(k * phi)
        else:
            a, term = (4 / (np.pi * k)) * np.sin(np.pi * k * duty), np.cos(k * phi)
        if soft:
            a /= 1 + (k * f / soft) ** 2
        out += a * term
    return out


def envelope(n, a=0.005, d=0.3, s=0.0, r=0.02):
    t = np.arange(n) / SR
    e = np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * np.minimum(t / a, 1)), s + (1 - s) * np.exp(-(t - a) / d))
    nr = min(n, int(r * SR))
    if nr:
        e[n - nr:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(nr) / nr)
    return e


def fade_out(sig, seconds=0.01):
    k = min(len(sig), int(seconds * SR))
    sig[len(sig) - k:] *= np.linspace(1, 0, k)
    return sig


def band_noise(n, lo, hi, seed):
    x = np.random.default_rng(seed).standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask /= 1 + (lo / np.maximum(f, 1.0)) ** 4
    if hi:
        mask /= 1 + (f / hi) ** 4
    y = np.fft.irfft(np.fft.rfft(x) * mask, n)
    return y / y.std()


def kick():
    """Soft kick. Its thump settles on G1, 48 Hz, a note of the key."""
    n = int(0.36 * SR)
    t = np.arange(n) / SR
    phi = 2 * np.pi * np.cumsum(48 + 60 * np.exp(-t / 0.03)) / SR
    body = np.sin(phi) + 0.08 * np.sin(2 * phi)
    return fade_out(body * np.minimum(1, t / 0.003) * np.exp(-t / 0.15), 0.02)


def snare(seed):
    """Muted snare: dark noise and a body on G3, 192 Hz. No clap."""
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    nz = band_noise(n, 300, 3000, seed)
    sig = 0.35 * nz * np.exp(-t / 0.045) * np.minimum(1, t / 0.002)
    sig += 0.6 * np.sin(2 * np.pi * hz(use(F(3, 4))) * t) * np.exp(-t / 0.06)
    return fade_out(sig, 0.02)


def hat(is_open, seed):
    n = int((0.12 if is_open else 0.04) * SR)
    t = np.arange(n) / SR
    nz = band_noise(n, 4500, 9000, seed)
    return fade_out(nz * np.exp(-t / (0.05 if is_open else 0.012)) * np.minimum(1, t / 0.001))


def marimba(r, seconds=0.45, decay=0.18):
    """Wooden pluck: the fundamental and a quick 4th harmonic, as a tuned bar."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = hz(use(r))
    sig = np.sin(2 * np.pi * f * t) * np.exp(-t / decay) + 0.25 * np.sin(8 * np.pi * f * t) * np.exp(-t / 0.03)
    return fade_out(sig * np.minimum(1, t / 0.002), 0.02)


def bell(r, seconds=1.4):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = hz(use(r))
    sig = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.8) + 0.2 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.3)
    return fade_out(sig * np.minimum(1, t / 0.004), 0.05)


# ---------------------------------------------------------------------------
# Mixing helpers: everything adds onto a circular buffer of one loop
# ---------------------------------------------------------------------------
STEMS = {k: np.zeros((2, N)) for k in
         ["kick", "bass", "snare", "hats", "pluck", "pad", "lead", "arp", "bells", "fx", "edge", "riser"]}


def add(stem, start, sig, pan=0.0, gain=1.0):
    th = (pan + 1) * np.pi / 4
    gl, gr = np.sqrt(2) * np.cos(th) * gain, np.sqrt(2) * np.sin(th) * gain
    start, n = int(start) % N, len(sig)
    first = min(n, N - start)
    STEMS[stem][0, start:start + first] += gl * sig[:first]
    STEMS[stem][1, start:start + first] += gr * sig[:first]
    if n > first:
        STEMS[stem][0, :n - first] += gl * sig[first:]
        STEMS[stem][1, :n - first] += gr * sig[first:]


def fft_filter(x, lo=None, hi=None):
    """Zero-phase circular filter over the whole loop."""
    f = np.fft.rfftfreq(N, 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask /= np.sqrt(1 + (lo / np.maximum(f, 1.0)) ** 4)
    if hi:
        mask /= np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(np.fft.rfft(x, axis=-1) * mask, N, axis=-1)


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------
# Lead melody: (bar, sixteenth, length in sixteenths, note). The motif is
# E G A G in a 3 + 3 + 2 + long rhythm. A states it on each chord. B keeps
# the rhythm, turns the contour upside down under the mirrored hats, and
# restates the motif as the zoom returns. A' slows it down under the edge
# sweeps, then states it once more before the turnaround.
MELODY = [
    # A: the shape morph
    (0, 0, 3, "E5"), (0, 3, 3, "G5"), (0, 6, 2, "A5"), (0, 8, 6, "G5"),
    (1, 0, 3, "D5"), (1, 3, 3, "G5"), (1, 6, 2, "A5"), (1, 8, 6, "G5"),
    (2, 0, 3, "C5"), (2, 3, 3, "E5"), (2, 6, 2, "A5"), (2, 8, 6, "E5"),
    (3, 0, 3, "C5"), (3, 3, 3, "F5"), (3, 6, 2, "A5"), (3, 8, 6, "F5"),
    (4, 0, 4, "G5"), (4, 4, 2, "E5"), (4, 6, 2, "D5"), (4, 8, 8, "C5"),
    (5, 8, 2, "B4"), (5, 10, 2, "D5"), (5, 12, 4, "F5"),
    # B: the colours and the zoom
    (6, 4, 4, "A4"), (6, 8, 3, "C5"), (6, 11, 3, "E5"), (6, 14, 2, "D5"),
    (7, 4, 4, "C5"), (7, 12, 4, "G5"),
    (9, 0, 3, "B5"), (9, 3, 3, "G5"), (9, 6, 2, "E5"), (9, 8, 6, "G5"),
    (10, 0, 8, "F5"), (10, 8, 8, "A5"),
    (11, 0, 8, "D5"), (11, 8, 8, "G5"),
    (12, 0, 3, "C5"), (12, 3, 3, "E5"), (12, 6, 2, "A5"), (12, 8, 6, "E5"),
    (13, 0, 4, "D5"), (13, 4, 4, "C5"), (13, 8, 8, "B4"),
    # A': the edge sweeps and the return to the Hat
    (14, 0, 6, "E5"), (14, 8, 6, "G5"),
    (15, 0, 6, "D5"), (15, 8, 6, "B4"),
    (16, 0, 6, "C5"), (16, 8, 6, "E5"),
    (17, 0, 6, "A4"), (17, 8, 6, "C5"),
    (18, 0, 3, "E5"), (18, 3, 3, "G5"), (18, 6, 2, "A5"), (18, 8, 6, "G5"),
    (19, 8, 2, "B4"), (19, 10, 2, "D5"), (19, 12, 4, "F5"),
]

# A bell for each named shape, rising from Chevron to Comet, panned with the
# slider. Each is a tone of the chord it lands on.
STOP_NOTE = {"Chevron": F(2), "Hat": F(5, 2), "Spectre": F(3), "Turtle": F(10, 3), "Comet": F(4)}
STOP_PAN = {"Chevron": -0.4, "Hat": -0.13, "Spectre": 0.0, "Turtle": 0.13, "Comet": 0.4}

# Edge sweeps: held chord tones that swell with the edge height, one voice
# for a single edge and two for a double. The notes change only with the
# chord, and the wave follows the edge shape. Nothing slides.
EDGE_TONES = {"I": (F(3), F(5, 2)), "V": (F(9, 4), F(15, 8)), "vi": (F(5, 2), F(2)), "IV": (F(2), F(5, 3))}
EDGE_WAVE = {"curve": ("sine", 0.5), "triangle": ("triangle", 0.5), "jigsaw": ("pulse", 0.5)}


def render():
    # Drums: a soft kick on every beat, a muted snare on 2 and 4, soft open
    # hats on the off-beats and quieter closed hats between.
    k = kick()
    snares = [snare(s) for s in (11, 12)]
    open_hats = [hat(True, s) for s in (21, 22, 23)]
    closed_hats = [hat(False, s) for s in (31, 32)]
    for m in range(BEATS):
        add("kick", at(m), k, gain=0.36)
        if m % 4 in (1, 3):
            add("snare", at(m), snares[m % 2], gain=0.2)
        add("hats", at(m + 0.5), open_hats[m % 3], pan=0.2, gain=0.035)
        add("hats", at(m + 0.75), closed_hats[m % 2], pan=-0.2, gain=0.015)

    # Bass: the chord's root on every off-beat, a soft triangle.
    for m in range(BEATS):
        mm = m + 0.5
        n = int(0.22 * SR)
        sig = osc(hz(use(BASS[chord_at(mm)])), n, "triangle", cap=1200) * envelope(n, a=0.008, d=0.16, s=0.5, r=0.04)
        add("bass", at(mm), sig, gain=0.3)

    # Marimba chords: the motif's 3 + 3 + 2 rhythm in A, off-beats in B.
    for bar in range(20):
        in_b = 6 <= bar < 14
        for pos in ((2, 6, 10, 14) if in_b else (0, 3, 6, 8, 11, 14)):
            m = bar * 4 + pos / 4
            stab = any(abs(m - mm) < 1e-9 for mm, cid in COLOUR_EVENTS if cid == "hands")
            for i, r in enumerate(voicing(chord_at(m), F(6, 5), F(12, 5))):
                add("pluck", at(m), marimba(r, 0.6 if stab else 0.45, 0.3 if stab else 0.18),
                    pan=(-0.3, 0.0, 0.3, 0.15)[i], gain=(0.065 if stab else 0.045) * (1.15 if pos in (0, 8) else 1))

    # Pad: the chord held quietly under everything, swelling with the zoom.
    for m0, m1, c in chord_spans():
        n = at(m1) - at(m0) + int(0.12 * SR)
        for i, r in enumerate(voicing(c, F(1), F(2))):
            sig = osc(hz(r), n, "triangle", cap=1500) * envelope(n, a=0.1, d=1e9, s=1, r=0.15)
            add("pad", at(m0), sig, pan=(-0.3, 0.1, 0.3, -0.1)[i], gain=0.012)

    # Lead: a soft triangle, no vibrato, with a dark dotted-eighth echo.
    for bar, pos, dur, name in MELODY:
        m = bar * 4 + pos / 4
        n = int(dur * S16 * 0.95)
        sig = osc(hz(note(name, chord_at(m))), n, "triangle", cap=2000, soft=1200)
        add("lead", at(m), sig * envelope(n, a=0.02, d=0.5, s=0.5, r=0.08), gain=0.13)
    dry = STEMS["lead"].mean(axis=0)
    echo = np.zeros((2, N))
    for i in range(1, 4):
        echo[i % 2] += np.roll(dry, i * at(0.75)) * 0.22 ** i
    STEMS["lead"] += fft_filter(echo, hi=1800)

    # A soft arpeggio in sixteenths through the dice and the zoom (B).
    step = 0
    m = 32.0
    while m < 51:
        tones = voicing(chord_at(m), F(2), F(4))
        level = np.clip((m - 32) / 2, 0.4, 1) * np.clip((51 - m) / 1.5, 0, 1)
        n = int(0.14 * SR)
        sig = osc(hz(tones[step % len(tones)]), n, "triangle", cap=2500) * envelope(n, a=0.002, d=0.06, r=0.01)
        add("arp", at(m), sig, pan=0.35 if step % 2 else -0.35, gain=0.05 * level)
        step += 1
        m = 32 + step * 0.25

    # Bells for the shapes.
    for m, name in ARRIVALS:
        add("bells", at(m), bell(STOP_NOTE[name]), pan=STOP_PAN[name], gain=0.09)

    # Colour switches: Rainbow rises through the IV chord, Greyscale falls
    # through the sus2 chord, the dice play the motif, and the mirrored hats
    # get a low bell with the minor chord.
    dice_notes = iter([F(5, 2), F(3), F(10, 3), F(3)])       # E G A G, the motif
    for m, cid in COLOUR_EVENTS:
        if cid == "rainbow":
            for i, r in enumerate((F(8, 3), F(10, 3), F(4))):
                add("fx", at(m + i / 4), marimba(r, 0.4, 0.15), pan=-0.3 + 0.3 * i, gain=0.07)
        elif cid == "grey":
            for i, r in enumerate((F(4), F(3), F(8, 3))):
                add("fx", at(m + i / 4), marimba(r, 0.4, 0.15), pan=0.3 - 0.3 * i, gain=0.07)
        elif cid.startswith("dice:"):
            add("fx", at(m), marimba(next(dice_notes), 0.35, 0.12), pan=0.25 if cid in ("dice:rgb", "dice:greys") else -0.25, gain=0.08)
        elif cid == "hands":
            add("bells", at(m), bell(F(15, 8)), pan=0.15, gain=0.08)

    # Zoom: a faint wash of low noise that grows as the view pulls out.
    x = ZOOM_DEPTH
    for ch, seed in ((0, 41), (1, 42)):
        STEMS["riser"][ch] += 0.02 * x ** 1.5 * band_noise(N, 300, 2500, seed)

    # Edge sweeps: held chord tones, swelling with the edge height.
    edge_on = EDGE_INDEX >= 0
    kinds = {i: EDGE_WAVE[s[0]] for i, s in enumerate(TL["sweeps"])}
    double = np.array([s[1] == "alt" for s in TL["sweeps"]])
    for m0, m1, c in chord_spans():
        s0, s1 = at(m0), at(m1)
        if not edge_on[s0:s1].any():
            continue
        n = s1 - s0
        ramp = np.ones(n)
        k = int(0.015 * SR)
        ramp[:k] = np.linspace(0, 1, k)
        ramp[-k:] = np.linspace(1, 0, k)
        amount = EDGE_AMOUNT[s0:s1]
        idx = EDGE_INDEX[s0:s1]
        for voice, r in enumerate(EDGE_TONES[c]):
            sig = np.zeros(n)
            for kidx in set(idx[idx >= 0].tolist()):
                kind, duty = kinds[kidx]
                if voice == 1 and not double[kidx]:
                    continue
                part = idx == kidx
                sig[part] = osc(hz(use(r)), n, kind, duty, cap=1800, soft=900)[part]
            add("edge", s0, sig * ramp * 0.05 * amount ** 0.8, pan=(0.2, -0.2)[voice])

    # No kick pump: a fast dip on held chords sounds like crackle.
    STEMS["pad"] *= 1 + 0.5 * x


def reverb():
    """Two-band decaying-noise room, applied as a circular convolution."""
    sends = {"snare": 0.2, "pluck": 0.3, "lead": 0.25, "bells": 0.4, "fx": 0.3, "edge": 0.35,
             "arp": 0.3, "pad": 0.2, "hats": 0.1, "riser": 0.2}
    bus = sum(STEMS[k] * v for k, v in sends.items())
    n = int(1.8 * SR)
    t = np.arange(n) / SR
    pre = int(0.015 * SR)
    wet = np.zeros((2, N))
    for ch in range(2):
        low = band_noise(n, None, 2000, 60 + ch) * np.exp(-6.9 * t / 1.4)
        high = band_noise(n, 2000, 6000, 70 + ch) * np.exp(-6.9 * t / 0.4)
        ir = np.zeros(N)
        ir[pre:pre + n] = low + 0.4 * high
        ir /= np.sqrt((ir ** 2).sum())
        wet[ch] = np.fft.irfft(np.fft.rfft(bus[ch]) * np.fft.rfft(ir), N)
    return 0.35 * wet


# ---------------------------------------------------------------------------
# Mastering and checks
# ---------------------------------------------------------------------------
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
    """A linear master: filters and one static gain, so nothing distorts. The
    gain aims at TARGET_LUFS but never lets a sample pass PEAK_CEILING_DB,
    which leaves room for the overshoot of MP3 and AAC encoding. When the
    two disagree, the track comes out quieter rather than louder."""
    mix = fft_filter(sum(STEMS.values()) + reverb(), lo=40, hi=LOWPASS_HZ)
    lufs, _ = measure(mix / np.abs(mix).max())
    gain = 10 ** ((TARGET_LUFS - lufs) / 20) / np.abs(mix).max()
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    if np.abs(mix).max() * gain > ceiling:
        gain = ceiling / np.abs(mix).max()
        print(f"note: the peak ceiling holds the track below {TARGET_LUFS} LUFS")
    y = mix * gain
    lufs, tp = measure(y)
    assert np.abs(y).max() <= ceiling + 1e-9 and tp <= TP_CEILING, f"true peak {tp} dBTP is over {TP_CEILING}"
    return y, (lufs, tp), 20 * np.log10(gain)


def spectrogram(y):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(15, 8), gridspec_kw={"height_ratios": [4, 1]}, sharex=True)
    mono = y.mean(axis=0)
    ax.specgram(mono, NFFT=4096, Fs=SR, noverlap=3072, cmap="magma", vmin=-120)
    ax.set_yscale("log")
    ax.set_ylim(40, 12000)
    ax.set_ylabel("Hz")
    for b0, b1, name in SECTIONS:
        ax.axvline(b0 * 4 * SPB / SR, color="w", lw=1.2)
        ax.text(b0 * 4 * SPB / SR + 0.2, 60, name, color="w", fontsize=12)
    for m, name in ARRIVALS:
        ax.text(m * SPB / SR, 9000, name, color="c", fontsize=7, rotation=90)
    for m, cid in COLOUR_EVENTS:
        ax.text(m * SPB / SR, 5000, cid.replace("dice:", ""), color="y", fontsize=7, rotation=90)
    ax.set_title("tiling-loop.wav: sections A B A', shape arrivals in cyan, colour switches in yellow")
    blocks = mono[: N // 2400 * 2400].reshape(-1, 2400)
    ax2.plot(np.arange(len(blocks)) * 2400 / SR, 20 * np.log10(np.sqrt((blocks ** 2).mean(axis=1)) + 1e-9))
    ax2.set_ylabel("RMS dBFS")
    ax2.set_xlabel("seconds")
    fig.tight_layout()
    fig.savefig(OUT_PNG, dpi=90)


def main():
    render()
    y, (lufs, tp), gain_db = master()
    write_wav(OUT_WAV, y)

    worst = max(max_prime(r) for r in USED)
    assert worst <= 7, f"a pitch uses prime {worst}"
    print(f"pitches: {len(USED)} ratios, highest prime {worst}")
    if value_to_rcn:
        for c in CHORD:
            print(f"  {c:7s}", " ".join(value_to_rcn(f"{r.numerator}/{r.denominator}") for r in CHORD[c]))
    halves = [KIND[chord_at(h * 2)] for h in range(BEATS // 2)]
    print("chords by half-bar: " + ", ".join(f"{k} {100 * halves.count(k) / len(halves):.0f}%" for k in ("major", "minor", "other")))
    for b0, b1, name in SECTIONS:
        print(f"  {name:2s} bars {b0}-{b1 - 1}: " + " | ".join(c if isinstance(c, str) else " ".join(c) for c in PROGRESSION[b0:b1]))
    print("accents (music beat, seconds):")
    for m, what in sorted(ARRIVALS + COLOUR_EVENTS):
        print(f"  {m:6.2f}  {m * SPB / SR:6.3f} s  {what}  over {chord_at(m)}")

    with wave.open(OUT_WAV) as w:
        frames = w.getnframes()
        data = np.frombuffer(w.readframes(frames), "<i2").reshape(-1, 2).T.astype(float)
    assert frames == N, frames
    join = np.abs(np.concatenate([data, data], axis=1)[:, N] - data[:, -1])
    elsewhere = np.abs(np.diff(data, axis=1))
    print(f"loop join jump: {join[0]:.0f} / {join[1]:.0f} LSB; elsewhere median "
          f"{np.median(elsewhere[0]):.0f} / {np.median(elsewhere[1]):.0f}, 99th percentile "
          f"{np.percentile(elsewhere[0], 99):.0f} / {np.percentile(elsewhere[1], 99):.0f}")
    spec = np.abs(np.fft.rfft(data.mean(axis=0)))
    f = np.fft.rfftfreq(N, 1 / SR)
    print(f"share of power above 4 kHz: {100 * (spec[f > 4000] ** 2).sum() / (spec ** 2).sum():.2f}%")
    print(f"loudness {lufs:.1f} LUFS, true peak {tp:.1f} dBTP, gain {gain_db:+.1f} dB")
    for k, v in STEMS.items():
        print(f"  stem {k:6s} RMS {20 * np.log10(np.sqrt((v ** 2).mean()) + 1e-12):6.1f} dB (before master gain)")
    spectrogram(y)
    print("wrote", OUT_WAV, "and", OUT_PNG)


if __name__ == "__main__":
    main()
