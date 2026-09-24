#!/usr/bin/env python3
"""
compose.py renders tiling-loop.wav: a 45-second just-intonation loop for the
aperiodic tiling explorer video (see ../storyboard.md and ../timeline.js).

Run it with the Python environment of daily-python-music, which holds
justsynth. That repo is expected beside this one; JUSTSYNTH_REPO overrides it:

    ../../../../daily-python-music/.venv/bin/python compose.py

It renders the loop, masters it to about -16 LUFS with one static gain, writes
tiling-loop.wav (48 kHz, stereo, 16-bit, exactly 2,160,000 frames), then checks
the seam, the accent timing and the loudness, and draws spectrogram.png.

Design in one paragraph. Every pitch is a whole-number ratio of C4 = 256 Hz.
The otonal pitches are all harmonics of C2 = 64 Hz, so the whole loop stands
on one fundamental, the way one tile makes the whole plane. The slider voice
follows the shape slider: its frequency is 64 * (8 + angle / 15) Hz, a linear
slide that lands on harmonics 8, 10, 11, 12 and 14 at Chevron, Hat, Spectre,
Turtle and Comet. The mirrored hats get the mirror image of the chord: the
harmonics of 64 Hz reflected about C4 become the undertones of 1024 Hz.

The synthesis builds on David Ryan's justsynth: JI pitches are written in his
rational comma notation (split_ji_rcn), gain curves are justsynth Params
(param_general), glides are integrated to phase by
get_sample_waveform_from_freqs, the edge voice morphs through combined_wave
shapes, and plucks decay by the law in his sequencer12.m (20 dB/s at 256 Hz,
faster for higher partials, index 0.5). Reverb, panning, EQ and mastering are
plain numpy on top.

Everything is rendered on a circular buffer of exactly one loop: an event that
runs past beat 60 wraps to beat 0, the reverb is a circular convolution, and
every sustained oscillator makes a whole number of cycles per loop. The result
is the steady state of the loop playing forever, which is the same as rendering
three cycles and keeping the middle one.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import wave

from fractions import Fraction

import numpy as np

REPO = os.path.abspath(os.environ.get(
    "JUSTSYNTH_REPO", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "daily-python-music")))
if REPO not in sys.path:
    sys.path.insert(0, REPO)

from justsynth.config import PieceType as PT  # noqa: E402
from justsynth.core.param import param_const, param_general  # noqa: E402
from justsynth.core.time import BpmFixed  # noqa: E402
from justsynth.music_config import MusicConfig  # noqa: E402
from justsynth.notation.data import split_ji_rcn  # noqa: E402
from justsynth.notation.ji import parse_rcn, value_to_rcn  # noqa: E402
from justsynth.synthesis.sample import get_sample_waveform_from_freqs  # noqa: E402
from justsynth.synthesis.waveforms import combined_wave  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
OUT_WAV = os.path.join(HERE, "tiling-loop.wav")
OUT_PNG = os.path.join(HERE, "spectrogram.png")

# ---------------------------------------------------------------------------
# Format and tuning
# ---------------------------------------------------------------------------
SR = 48000
BPM = 80
BEATS = 60
SPB = SR * 60 // BPM          # 36,000 samples per beat
N = BEATS * SPB               # 2,160,000 samples = 45.000 s
TONIC_HZ = 256.0              # C4 = 1/1
FUND_HZ = 64.0                # C2: every otonal pitch is a harmonic of this
FCAP = 5000.0                 # no partial above this frequency
FTAPER = 3500.0               # partials fade out between FTAPER and FCAP
TARGET_LUFS = -16.0
TP_CEILING = -1.0

B = np.arange(N) / SPB        # beat of every sample in the loop
T = np.arange(N) / SR         # second of every sample in the loop

mc = MusicConfig(
    day_number="tiling",
    base_freq_hz=param_const(TONIC_HZ),
    global_amp=param_const(1.0),
    timeline=BpmFixed(bpm=BPM, sample_rate_hz=SR, beat_at_time_zero=0, beat_padding_end=0),
    random_seed=2023,
)
RNG = np.random.default_rng(2023)


def hz(rcn_text):
    """Frequencies in Hz from David's rational comma notation, C4 = 256 Hz."""
    return split_ji_rcn(TONIC_HZ)(rcn_text)


def hz1(rcn_text):
    return hz(rcn_text)[0]


# ---------------------------------------------------------------------------
# The video timeline, ported from ../timeline.js (checked against Node below)
# ---------------------------------------------------------------------------
MOVES = [
    (3, 6, 0, 30), (8, 10, 30, 45), (11, 13, 45, 60), (14, 16, 60, 90), (17, 20, 90, 30),
    (38, 40, 30, 45), (55, 57, 45, 30), (58, 62, 30, 0),
]


def wrap(b):
    return np.mod(np.asarray(b, dtype=float), BEATS)


def ease(x):
    x = np.clip(x, 0.0, 1.0)
    return 0.5 - 0.5 * np.cos(np.pi * x)


def _seam_beats(b):
    b = wrap(b)
    return np.where(b < 2, b + BEATS, b)


def deg(b):
    """Shape slider angle, 0 to 90 degrees."""
    b = _seam_beats(b)
    d = np.zeros_like(b)
    for b0, b1, d0, d1 in MOVES:
        d = np.where(b >= b0, d0 + (d1 - d0) * ease((b - b0) / (b1 - b0)), d)
    return d


def motion(b):
    """0 while the slider rests, sin(pi x) during a move: the eased move's speed profile."""
    b = _seam_beats(b)
    m = np.zeros_like(b)
    for b0, b1, _, _ in MOVES:
        x = (b - b0) / (b1 - b0)
        m = np.where((x > 0) & (x < 1), np.sin(np.pi * x), m)
    return m


def edge_amount(b):
    """Spectre edge height 0..1 over beats 41 to 53, six sweeps of two beats."""
    b = wrap(b)
    k = np.floor((b - 41) / 2)
    x = (b - 41 - 2 * k) / 2
    s = np.sin(np.pi * x)
    return np.where((k >= 0) & (k < 6), s * s, 0.0)


def hat_mix(b):
    """1 is all Hat page, 0 is all Spectre page."""
    b = wrap(b)
    return np.select(
        [b < 40, b < 41, b < 53, b < 54],
        [np.ones_like(b), 1 - ease(b - 40), np.zeros_like(b), ease(b - 53)],
        default=1.0,
    )


def zoom_x(b):
    """Zoom progress: 0 at normal scale, 1 at the far zoom (beat 34)."""
    b = wrap(b)
    x = np.where(b < 34, ease((b - 30) / 4), 1 - ease((b - 34) / 4))
    return np.where((b < 30) | (b >= 38), 0.0, x)


ZOOM_FAR = 0.22   # must match timeline.js; the Node check compares them


def zoom_factor(b):
    return np.exp(np.log(ZOOM_FAR) * zoom_x(b))


def slider_opacity(b):
    b = wrap(b)
    return np.select(
        [b >= 53.5, b <= 20.25, b <= 20.75, (b >= 37.5) & (b <= 38), (b > 38) & (b <= 40.5), (b > 40.5) & (b <= 41)],
        [np.clip((b - 53.5) / 0.5, 0, 1), np.ones_like(b), 1 - (b - 20.25) / 0.5, (b - 37.5) / 0.5,
         np.ones_like(b), 1 - (b - 40.5) / 0.5],
        default=0.0,
    )


# ---------------------------------------------------------------------------
# The score, in rational comma notation (C4 = 1/1 = 256 Hz)
# ---------------------------------------------------------------------------
SHAPE_NOTES = {"Chevron": "C5", "Hat": "E'5", "Spectre": "F5~11", "Turtle": "G5", "Comet": "Bb5~7"}
SHAPE_OF_DEG = {0: "Chevron", 30: "Hat", 45: "Spectre", 60: "Turtle", 90: "Comet"}
ARRIVALS = [2, 6, 10, 13, 16, 20, 40, 57]

HOME = "G3 C4 E'4 G4 Bb4~7"            # harmonics 3 4 5 6 7 of 64 Hz, over the pedal C3
SPECTRE = "G3 C4 F4~11 G4 Bb4~7 D5"    # the 5th harmonic slides up to 11/2, and 9/4 joins
MIRROR = "Ab.3 C4 D4_7 F4 Ab.4"        # the home chord reflected about C4: undertones of 1024 Hz
PEDAL = "C3"

PASTEL = "G5"                          # b 21, soft triangle-like pluck
GREYSCALE = "C5"                       # b 22.5, plain sine pluck
DICE_FACES = [5, 2, 6, 3]              # b 24-27; face d plays harmonic 6 + d of 64 Hz
MIRROR_STRUM = "C5 Ab.4 F4"            # b 28, the mirror of the major triad 4:5:6 is 1/4:1/5:1/6
SWELL = "C5 Db.5 D5_7 Eb5_13 F5 G5_11 Ab.5 Bb5 C6"   # undertones 16 down to 8 of 8192 Hz
SWELL_SUSTAIN = "C5 D5_7 F5 Ab.5 C6"   # the ladder notes that belong to the mirror chord
SWELL_PANS = [0.15, -0.2, -0.27, 0.33, 0.4, -0.45, -0.5, 0.55, 0.6]   # held notes alternate sides

SWEEPS = [("curve", "S"), ("curve", "alt"), ("triangle", "S"),
          ("triangle", "alt"), ("jigsaw", "S"), ("jigsaw", "alt")]
EDGE_NOTES = {                          # base, peak of the upward glide, peak of the downward glide
    "curve": ("C5", "D5", "Bb4~7"),         # harmonic 8 -> 9, and 8 -> 7
    "triangle": ("G5", "A5~13", "F5~11"),   # harmonic 12 -> 13, and 12 -> 11
    "jigsaw": ("C6", "C#6~17", "B'5"),      # harmonic 16 -> 17, and 16 -> 15
}
EDGE_WAVE = {                           # combined_wave(squareness, sawtoothness, triangleness, corners)
    "curve": (0.0, 0.5, 0.0, 0.0),
    "triangle": (0.0, 0.0, 1.0, 0.0),
    "jigsaw": (0.5, 0.4, 0.3, 0.5),
}

# Mix levels (linear, before the master gain) and reverb sends.
LEVEL = {"pad": 1.0, "pedal": 1.0, "slider": 1.0, "bells": 1.0, "colour": 1.0,
         "dice": 1.0, "swell": 1.0, "edge": 1.0}
SEND = {"pad": 0.12, "pedal": 0.0, "slider": 0.45, "bells": 0.45, "colour": 0.45,
        "dice": 0.4, "swell": 0.6, "edge": 0.5}
ROOMS = 4             # the reverb drifts slowly between this many rooms
ROOM_PERIOD_S = 11.25 # seconds per drift cycle; four cycles per loop


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def pan_gains(pan):
    """Equal-power pan, -1 left to +1 right."""
    theta = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.cos(theta), np.sin(theta)


def taper(f):
    return np.clip((FCAP - f) / (FCAP - FTAPER), 0.0, 1.0)


def phases_of(freqs):
    """Phase in cycles from a frequency array, integrated by justsynth."""
    return get_sample_waveform_from_freqs(mc=mc, waveform_fn=lambda p: p)(freqs, initial_phase=0.0)


def loop_phase(freq):
    """Phase in cycles for a voice that sounds through the whole loop.
    It must make a whole number of cycles per loop, or the seam would click."""
    if np.isscalar(freq):
        cycles = freq * N / SR
        assert abs(cycles - round(cycles)) < 1e-6, f"{freq} Hz is not periodic over the loop"
        return freq * T
    phi = phases_of(freq)
    cycles = phi[-1] + freq[0] / SR
    assert abs(cycles - round(cycles)) < 1e-6, f"glide makes {cycles} cycles per loop"
    return phi


def steady_phase(freq, active):
    """Phase for a sustained voice. A voice that is silent across the seam may
    use absolute time, whatever its frequency; one that sounds across the
    seam must be loop-periodic."""
    if np.isscalar(freq) and not np.isclose(freq * N / SR, round(freq * N / SR)):
        assert not active[0] and not active[-1], f"{freq} Hz sounds across the seam"
        return freq * T
    return loop_phase(freq)


def add_event(bus, start_beat, left, right):
    """Add a stereo event to a loop bus, wrapping past beat 60 to beat 0."""
    s0 = int(round(start_beat * SPB)) % N
    n = len(left)
    assert n < N
    first = min(n, N - s0)
    bus[0, s0:s0 + first] += left[:first]
    bus[1, s0:s0 + first] += right[:first]
    if first < n:
        bus[0, :n - first] += left[first:]
        bus[1, :n - first] += right[first:]


def struck(f0, weights, ref_db_per_s, dur_s, attack_s=0.003, hold_s=0.02):
    """A struck or plucked tone of harmonic partials. Each partial decays at
    ref_db_per_s * (f / 256 Hz) ** 0.5 dB per second, the decay law of
    David's sequencer12.m, so the tone mellows as it rings."""
    n = int(dur_s * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, w in enumerate(weights, start=1):
        fk = f0 * k
        if w == 0 or fk >= FCAP:
            continue
        rate = ref_db_per_s * (fk / 256.0) ** 0.5
        env = 10 ** (-rate * np.maximum(t - hold_s, 0) / 20)
        y += w * taper(fk) * env * np.sin(2 * np.pi * fk * t + RNG.uniform(0, 2 * np.pi))
    y *= 0.5 - 0.5 * np.cos(np.pi * np.minimum(t / attack_s, 1.0))
    fade = int(0.05 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y


def overlay(a, b):
    """Sum two mono events of different lengths."""
    out = np.zeros(max(len(a), len(b)))
    out[:len(a)] += a
    out[:len(b)] += b
    return out


def place(bus, beat, mono, pan, gain):
    gl, gr = pan_gains(pan)
    add_event(bus, beat, gain * gl * mono, gain * gr * mono)


def shape_spectrum(params, hmax=16):
    """Harmonic amplitudes and phases of one of justsynth's combined_wave shapes."""
    ph = np.arange(4096) / 4096
    y = combined_wave(*[np.array(v) for v in params])(ph)
    Y = np.fft.rfft(y)[1:hmax + 1]
    amps = np.abs(Y)
    return amps / amps[0], np.angle(Y)


def morph_wave(phase, m, spec, fmax):
    """Fundamental plus m times the shape's upper harmonics, band-limited."""
    amps, angles = spec
    y = np.cos(2 * np.pi * phase + angles[0])
    for h in range(2, len(amps) + 1):
        if h * fmax >= FCAP or amps[h - 1] < 1e-4:
            continue
        y += m * amps[h - 1] * taper(h * fmax) * np.cos(2 * np.pi * np.mod(h * phase, 1.0) + angles[h - 1])
    return y


def new_bus():
    return np.zeros((2, N))


# ---------------------------------------------------------------------------
# Voices
# ---------------------------------------------------------------------------
def render_pad():
    """Sustained chord of band-limited sawtooth-like voices (partials 1/k^p).
    Hat sections: harmonics 3..7 of 64 Hz. Mirrored hats (b 28 until the
    slider returns at b 38): the same chord reflected about C4, which gives
    undertones of 1024 Hz. Spectre: harmonic 5 slides to 11/2 and 9/4 joins."""
    bus = new_bus()
    g_mirror = param_general(start_beat=0, beat_diffs=[28, 1.0, 8.5, 1.0, 21.5],
                             types=[PT.CONST, PT.CUBIC, PT.CONST, PT.CUBIC, PT.CONST],
                             values=[0, 0, 1, 1, 0, 0]).values(B)
    g_hat_or_spectre = np.sqrt(1 - g_mirror ** 2)     # equal-power crossfade
    g_spectre = 1 - hat_mix(B)
    swell = zoom_x(B)
    edge = edge_amount(B)
    level = 1 + 0.6 * swell + 0.15 * edge
    bright = 1.75 - 0.45 * swell - 0.3 * edge         # partial roll-off exponent

    g3, c4, e4, g4, bb4 = hz(HOME)
    f4_11, d5 = hz1("F4~11"), hz1("D5")
    slide = e4 + (f4_11 - e4) * g_spectre              # linear slide 320 -> 352 Hz at the crossfades
    ab3, _, d4_7, f4, ab4 = hz(MIRROR)
    voices = [
        # frequency, gain curve, pan, level
        (g3, g_hat_or_spectre, -0.30, 1.0),
        (c4, 1.0, 0.05, 1.0),
        (slide, g_hat_or_spectre, 0.25, 1.0),
        (g4, g_hat_or_spectre, -0.2, 0.9),
        (bb4, g_hat_or_spectre, 0.3, 0.9),
        (d5, g_spectre, -0.38, 0.7),
        # the mirror image: each voice reflected about C4 (octave placed to keep the
        # register), panned to the other side. C4 is its own mirror and stays.
        (f4, g_mirror, 0.40, 0.9),       # mirror of G3 (3/4 -> 4/3)
        (ab3, g_mirror, -0.15, 0.9),     # mirror of E'4 (5/4 -> 4/5)
        (ab4, g_mirror, 0.3, 0.8),       # mirror of E'4 an octave up, where G4 sat
        (d4_7, g_mirror, -0.2, 0.9),     # mirror of Bb4~7 (7/4 -> 8/7)
    ]
    for v, (freq, gain, pan, lev) in enumerate(voices):
        gain = np.broadcast_to(np.asarray(gain, dtype=float), (N,))
        active = gain > 0
        phi = steady_phase(freq, active)
        fmax = float(np.max(freq))
        p = bright - 0.35 * np.clip((300 - fmax) / 150, 0, 1)   # lower voices a little brighter
        left = np.zeros(N)
        right = np.zeros(N)
        for k in range(1, 25):
            fk = k * fmax
            if fk >= FCAP:
                break
            w = np.exp(-p * np.log(k)) * taper(fk)
            th_l = RNG.uniform(0, 2 * np.pi)
            th_r = th_l + RNG.uniform(-0.8, 0.8)            # small L/R phase offsets give width
            a = 2 * np.pi * np.mod(k * phi, 1.0)
            left += w * np.sin(a + th_l)
            right += w * np.sin(a + th_r)
        # David's sequencer default: 1.5 dB tremolo over 3 beats (smoothed to a cosine here)
        trem = 10 ** (-1.5 * (0.5 - 0.5 * np.cos(2 * np.pi * (B / 3 + v / len(voices)))) / 20)
        g = 0.045 * lev * gain * level * trem
        gl, gr = pan_gains(pan)
        bus[0] += g * gl * left
        bus[1] += g * gr * right
    return bus


def render_pedal():
    """C3 = 128 Hz under the whole loop, with enough harmonics to read on a phone."""
    bus = new_bus()
    f = hz1(PEDAL)
    phi = loop_phase(f)
    y = np.zeros(N)
    for k, w in enumerate([1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04], start=1):
        y += w * np.sin(2 * np.pi * np.mod(k * phi, 1.0) + RNG.uniform(0, 2 * np.pi))
    y *= 0.034 * (1 + 0.3 * zoom_x(B))
    bus[0] += y / np.sqrt(2)
    bus[1] += y / np.sqrt(2)
    return bus


def render_slider():
    """The slider voice: frequency 64 * (8 + angle / 15) Hz, a linear slide in
    frequency that lands on harmonics 8, 10, 11, 12, 14 at the five stops. It
    sounds while the slider graphic is on screen and swells while it moves."""
    bus = new_bus()

    def ocarina(p):
        return (np.sin(2 * np.pi * p) + 0.2 * np.sin(4 * np.pi * p + 0.4)
                + 0.06 * np.sin(6 * np.pi * p + 1.1))

    for b_start, b_end in [(53.0, 81.0), (37.25, 41.25)]:   # the first one crosses the seam
        n = int(round((b_end - b_start) * SPB))
        bl = b_start + np.arange(n) / SPB
        d = deg(bl)
        f = FUND_HZ * (8 + d / 15)
        amp = slider_opacity(bl) * (0.5 + 0.5 * motion(bl))
        y = 0.055 * amp * ocarina(phases_of(f))
        gl, gr = pan_gains(0.7 * (d / 90 - 0.5))
        add_event(bus, b_start, gl * y, gr * y)
    return bus


def render_bells():
    """A bell per shape arrival, at the slider voice's pitch for that shape."""
    bus = new_bus()
    for b in ARRIVALS:
        d = float(deg(b))
        shape = SHAPE_OF_DEG[int(round(d))]
        f = hz1(SHAPE_NOTES[shape])
        assert abs(f - FUND_HZ * (8 + d / 15)) < 1e-6
        tone = struck(f, [1, 0.42, 0.2, 0.12, 0.06, 0.035], 12, 5.0)
        tone = overlay(tone, 0.3 * struck(f / 2, [1, 0.5, 0.33, 0.25, 0.2], 18, 3.5))
        place(bus, b, tone, 0.7 * (d / 90 - 0.5), 0.2)
    return bus


def render_colour():
    """Colour switches. The home palette, Rainbow, is the full pad. Pastel is a
    soft triangle-like pluck, Greyscale a plain sine, and Mirrored hats a
    downward strum of the mirror triad."""
    bus = new_bus()
    f = hz1(PASTEL)
    tone = struck(f, [1, 0, 1 / 9, 0, 1 / 25, 0, 1 / 49], 16, 3.5)
    tone = overlay(tone, 0.3 * struck(f / 2, [1, 0, 1 / 9, 0, 1 / 25], 16, 3.0))
    place(bus, 21, tone, 0.3, 0.17)
    place(bus, 22.5, struck(hz1(GREYSCALE), [1, 0.05], 13, 4.0), -0.3, 0.17)
    for (f, dt, pan, g) in zip(hz(MIRROR_STRUM), [0, 0.035, 0.07], [0.3, 0, -0.3], [0.15, 0.13, 0.12]):
        tone = struck(f, [1, 0.5, 0.33, 0.25, 0.2, 0.17, 0.14], 18, 4.0)
        place(bus, 28 + dt * BPM / 60, tone, pan, g)
    return bus


def dice_pitches():
    return [FUND_HZ * (6 + face) for face in DICE_FACES]


def render_dice():
    """Four dice rolls on the home chord's harmonics; each lands on the beat
    and bounces three times, softer and closer together."""
    bus = new_bus()
    bounces = [(0.0, 1.0), (0.14, 0.38), (0.24, 0.16), (0.30, 0.07)]
    for b, f, pan in zip([24, 25, 26, 27], dice_pitches(), [-0.35, 0.35, -0.15, 0.15]):
        for dt, g in bounces:
            tone = struck(f, [1, 0.2, 0.35, 0.08, 0.1], 40, 1.2, hold_s=0.005)
            place(bus, b + dt * BPM / 60, tone, pan, 0.2 * g)
    return bus


def render_swell():
    """Zoom out, with the mirrored hats still showing: the undertone series of
    8192 Hz climbs from 16 to 8 (C5 up to C6), the mirror image of a climb up
    the harmonic series, a note every half beat from b 30 to the far zoom at
    b 34. Notes of the mirror chord sustain and thin out as the zoom returns;
    the others are passing plucks."""
    bus = new_bus()
    swell = zoom_x(B)
    sustained = hz(SWELL_SUSTAIN)
    for i, f in enumerate(hz(SWELL)):
        entry = 30 + 0.5 * i
        pan = SWELL_PANS[i]
        place(bus, entry, struck(f, [1, 0.3, 0.1], 14, 3.0), pan, 0.06)
        if not any(np.isclose(f, x) for x in sustained):
            continue
        leave = 34.9 + 0.3 * (8 - i)
        gain = param_general(start_beat=0, beat_diffs=[entry, 0.75, leave - entry - 0.75, 0.8, 60 - leave - 0.8],
                             types=[PT.CONST, PT.CUBIC, PT.CONST, PT.CUBIC, PT.CONST],
                             values=[0, 0, 1, 1, 0, 0]).values(B)
        phi = steady_phase(f, gain > 0)
        y = np.sin(2 * np.pi * np.mod(phi, 1.0)) + 0.12 * np.sin(2 * np.pi * np.mod(2 * phi, 1.0) + 0.7)
        y *= 0.03 * gain * (0.4 + 0.6 * swell)
        gl, gr = pan_gains(pan)
        bus[0] += gl * y
        bus[1] += gr * y
    return bus


def render_edge():
    """Edge sweeps: a voice swells with the edge height and glides up one
    harmonic (single) or splits into two, one up and one down (double). Its
    wave morphs from a sine to the edge's shape: curve, triangle, jigsaw."""
    bus = new_bus()
    levels = [0.10, 0.095, 0.085, 0.08, 0.07, 0.066]
    for k, (shape, arrangement) in enumerate(SWEEPS):
        b0 = 41 + 2 * k
        n = 2 * SPB
        bl = b0 + np.arange(n) / SPB
        a = edge_amount(bl)
        f0, f_up, f_down = [hz1(x) for x in EDGE_NOTES[shape]]
        spec = shape_spectrum(EDGE_WAVE[shape])
        glides = [(f_up / f0, 0.0 if arrangement == "S" else 0.35)]
        if arrangement == "alt":
            glides.append((f_down / f0, -0.35))
        for ratio, pan in glides:
            f = f0 * (1 + a * (ratio - 1))               # linear slide in frequency
            y = morph_wave(phases_of(f), 0.85 * a, spec, float(f.max()))
            y *= levels[k] * (0.72 if arrangement == "alt" else 1.0) * a ** 0.8
            gl, gr = pan_gains(pan)
            add_event(bus, b0, gl * y, gr * y)
    return bus


# ---------------------------------------------------------------------------
# Reverb, EQ, mastering
# ---------------------------------------------------------------------------
def moving_rms(x, w):
    c = np.concatenate(([0.0], np.cumsum(x ** 2)))
    lo = np.clip(np.arange(len(x)) - w // 2, 0, len(x))
    hi = np.clip(np.arange(len(x)) + w // 2, 0, len(x))
    return np.sqrt((c[hi] - c[lo]) / np.maximum(hi - lo, 1)) + 1e-15


def make_ir(seconds=4.0, seed=7, iterations=10):
    """Stereo reverb impulse: five bands of noise, each decaying at its own
    rate (RT60 3.0 s in the lows down to 0.7 s in the highs), after a 22 ms
    pre-delay, plus a few faint early reflections.

    Plain decaying noise gives a steady tone a random level (about 5.7 dB
    standard deviation from one frequency to the next), which unbalances held
    JI notes. So each band alternates between two constraints: a flat
    magnitude response, then the decay envelope. Ten rounds bring the spread
    down to about 2 dB and keep the decay."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = np.fft.rfftfreq(n, 1 / SR)
    bands = [(250, 3.0), (1000, 2.8), (3000, 2.2), (6000, 1.4), (None, 0.7)]   # upper edge, RT60
    log_f = np.log2(np.maximum(f, 1))
    weights = []
    for i, (edge, _) in enumerate(bands):
        w = np.ones_like(f)
        if i > 0:
            w *= np.clip(0.5 + (log_f - np.log2(bands[i - 1][0])) / 0.5, 0, 1)
        if edge is not None:
            w *= np.clip(0.5 - (log_f - np.log2(edge)) / 0.5, 0, 1)
        weights.append(w)
    total = np.sqrt(sum(w ** 2 for w in weights))
    tilt = 1 / np.sqrt(1 + (f / 6000) ** 4)          # little reverb energy above 6 kHz
    weights = [tilt * w / np.maximum(total, 1e-9) for w in weights]
    after_pre = np.maximum(t - 0.022, 0)
    ir = np.zeros((2, n))
    for ch in range(2):
        for (edge, rt60), w in zip(bands, weights):
            env = 10 ** (-3 * after_pre / rt60) * (1 - np.exp(-after_pre / 0.03))
            h = rng.standard_normal(n) * env
            for _ in range(iterations):
                h = np.fft.irfft(w * np.exp(1j * np.angle(np.fft.rfft(h))), n)
                h *= env / moving_rms(h, 480)
            ir[ch] += h * np.sqrt(np.sum(w ** 2) / np.sum(h ** 2))
        scale = np.sqrt(np.mean(ir[ch, int(0.03 * SR):int(0.1 * SR)] ** 2))
        for ms, g in [(11, 0.5), (17, 0.35), (23, 0.3), (31, 0.22), (41, 0.18)]:
            ir[ch, int((ms + 3 * ch) * SR / 1000)] += g * (1 if (ms + ch) % 2 else -1) * scale * 2.5
        ir[ch] /= np.sqrt(np.sum(ir[ch] ** 2))
    return ir


def drifting_reverb(send):
    """Reverb that drifts slowly between four rooms. A steady tone gets a
    different, random level from each room, as in any real room; averaging
    four rooms keeps the pad's partials, and the two channels, even. The
    weights |sin| / sqrt(2) keep the total power constant and repeat four
    times per loop."""
    wet = new_bus()
    for k in range(ROOMS):
        ir = make_ir(seed=7 + k)
        weight = np.abs(np.sin(np.pi * T / ROOM_PERIOD_S + k * np.pi / ROOMS)) / np.sqrt(ROOMS / 2)
        for ch in range(2):
            wet[ch] += weight * circular_convolve(send[ch], ir[ch])
    return wet


def circular_convolve(x, ir):
    X = np.fft.rfft(x, N)
    H = np.fft.rfft(ir, N)
    return np.fft.irfft(X * H, N)


def master_eq(x):
    """Zero-phase circular EQ: 4th-order high-pass at 85 Hz (no rumble) and a
    2nd-order low-pass at 7 kHz (no harsh top)."""
    f = np.fft.rfftfreq(N, 1 / SR)
    with np.errstate(divide="ignore", over="ignore"):
        hp = 1 / np.sqrt(1 + (85 / np.maximum(f, 1e-9)) ** 8)
    lp = 1 / np.sqrt(1 + (f / 7000) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * hp * lp, N)


def ffmpeg_loudness(path, raw=False):
    cmd = [FFMPEG, "-hide_banner", "-nostats"]
    if raw:
        cmd += ["-f", "f32le", "-ar", str(SR), "-ac", "2"]
    cmd += ["-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    lra = float(re.search(r"LRA:\s+(-?[\d.]+) LU", summary).group(1))
    tp = float(re.search(r"True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS", summary).group(1))
    return lufs, tp, lra


def write_wav16(path, stereo, seed=11):
    """16-bit PCM with TPDF dither."""
    rng = np.random.default_rng(seed)
    dither = (rng.random(stereo.shape) - rng.random(stereo.shape))
    data = np.clip(np.round(stereo * 32767 + dither), -32768, 32767).astype("<i2")
    inter = np.empty(2 * N, dtype="<i2")
    inter[0::2] = data[0]
    inter[1::2] = data[1]
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(inter.tobytes())


def read_wav16(path):
    with wave.open(path, "rb") as w:
        info = (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes())
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(float) / 32768
    return info, data.reshape(-1, 2).T


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
def check_timeline_port():
    """Compare the Python port with timeline.js through Node, if Node is present."""
    js = os.path.join(HERE, "..", "timeline.js")
    beats = np.round(np.linspace(0, 59.95, 241), 4)
    script = ("const T=require(process.argv[1]);const bs=JSON.parse(process.argv[2]);"
              "console.log(JSON.stringify(bs.map(b=>[T.deg(b),(T.edgeAt(b)||{amount:0}).amount,"
              "T.hatMix(b),T.zoomAt(b),T.sliderOpacity(b)])))")
    try:
        out = subprocess.run(["node", "-e", script, js, str(beats.tolist())],
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"timeline check skipped: {e}")
        return None
    ref = np.array(json.loads(out))
    ours = np.stack([deg(beats), edge_amount(beats), hat_mix(beats), zoom_factor(beats),
                     slider_opacity(beats)], axis=1)
    err = np.max(np.abs(ref - ours))
    print(f"timeline port vs timeline.js: max abs difference {err:.2e} over {len(beats)} beats")
    assert err < 1e-9
    return err


ACCENTS = [(b, f"arrival {SHAPE_OF_DEG[int(round(float(deg(b))))]}") for b in ARRIVALS] + [
    (21, "colour Pastel"), (22.5, "colour Greyscale"),
    (24, "dice any colour"), (25, "dice RGB corners"), (26, "dice black and white"), (27, "dice greys"),
    (28, "colour Mirrored hats")]


def accent_pitch(b):
    if b in ARRIVALS:
        return hz1(SHAPE_NOTES[SHAPE_OF_DEG[int(round(float(deg(b))))]])
    if b in (24, 25, 26, 27):
        return dice_pitches()[b - 24]
    return {21: hz1(PASTEL), 22.5: hz1(GREYSCALE), 28: hz(MIRROR_STRUM)[0]}[b]


def _window(signal, beat, half_s):
    c = int(round(beat * SPB))
    idx = np.arange(c - int(half_s * SR), c + int(half_s * SR)) % N
    rel = (np.arange(len(idx)) - int(half_s * SR)) / SR
    return signal[idx], rel


def onset_isolated_ms(signal, beat):
    """Onset of an accent voice rendered on its own: where its 3 ms RMS
    envelope first reaches halfway from the level before the beat to the peak
    of the first 20 ms."""
    x, rel = _window(signal, beat, 0.2)
    w = int(0.003 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode="same"))
    pre = np.median(env[(rel > -0.15) & (rel < -0.03)])
    post = np.max(env[(rel >= 0) & (rel < 0.02)])
    cand = np.where((rel > -0.03) & (env >= pre + 0.5 * (post - pre)))[0]
    return rel[cand[0]] * 1000


def highpass(x, fc, order=4):
    f = np.fft.rfftfreq(N, 1 / SR)
    with np.errstate(divide="ignore", over="ignore"):
        h = 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-9)) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x) * h, N)


def onset_mix_ms(mix_mono, beat, f0):
    """Onset of an accent in the finished mix, high-passed just below the
    accent's own pitch (0.8 f0) so the pad's lower voices do not hide the
    attack; then the same half-rise rule as above."""
    return onset_isolated_ms(highpass(mix_mono, 0.8 * f0), beat)


def phone_weight(x):
    """A rough phone speaker: nothing below 300 Hz (2nd-order high-pass)."""
    f = np.fft.rfftfreq(N, 1 / SR)
    with np.errstate(divide="ignore", over="ignore"):
        hp = 1 / np.sqrt(1 + (300 / np.maximum(f, 1e-9)) ** 4)
    return np.fft.irfft(np.fft.rfft(x) * hp, N)


def rise_db(signal, beat):
    """Level change: RMS over 200 ms after the beat against 200 ms before."""
    x, rel = _window(signal, beat, 0.2)
    before = np.sqrt(np.mean(x[rel < 0] ** 2))
    after = np.sqrt(np.mean(x[rel >= 0] ** 2))
    return 20 * np.log10(after / before)


def seam_check(stereo):
    """Tile the loop twice and compare the join with the rest of the file."""
    tiled = np.concatenate([stereo, stereo], axis=1)
    jumps = np.abs(np.diff(tiled, axis=1))
    join = jumps[:, N - 1]
    typical = np.median(jumps, axis=1)
    p99 = np.percentile(jumps, 99, axis=1)
    biggest = np.max(jumps, axis=1)
    half = SR // 2
    rms_before = 20 * np.log10(np.sqrt(np.mean(tiled[:, N - half:N] ** 2, axis=1)))
    rms_after = 20 * np.log10(np.sqrt(np.mean(tiled[:, N:N + half] ** 2, axis=1)))
    # the same comparison at every other half-second boundary, for scale
    frames = stereo[:, :N - N % half].reshape(2, -1, half)
    frame_db = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=(0, 2))))
    step = np.abs(np.diff(np.concatenate([frame_db, frame_db[:1]])))
    return dict(join=join, median=typical, p99=p99, max=biggest,
                rms_before=rms_before, rms_after=rms_after,
                rms_step_typ=np.median(step), rms_step_max=np.max(step))


def draw_spectrogram(stereo, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    mono = stereo.mean(axis=0)
    nfft, hop = 4096, 480
    win = np.hanning(nfft)
    padded = np.concatenate([mono[-nfft // 2:], mono, mono[:nfft // 2]])   # circular, it is a loop
    frames = np.lib.stride_tricks.sliding_window_view(padded, nfft)[::hop][: N // hop]
    spec = np.abs(np.fft.rfft((frames * win).astype(np.float32), axis=1)) ** 2
    db = 10 * np.log10(spec / spec.max() + 1e-12)
    freqs = np.fft.rfftfreq(nfft, 1 / SR)
    beats = np.arange(db.shape[0]) * hop / SPB

    fig, (ax, ax2) = plt.subplots(2, 1, figsize=(16, 8.5), sharex=True,
                                  gridspec_kw=dict(height_ratios=[4, 1], hspace=0.06))
    keep = (freqs >= 60) & (freqs <= 9000)
    ax.pcolormesh(beats, freqs[keep], db[:, keep].T, shading="auto", cmap="Blues", vmin=-85, vmax=0,
                  rasterized=True)
    ax.set_yscale("log")
    ax.set_ylim(60, 9000)
    ax.set_yticks([100, 150, 256, 512, 1024, 2048, 4000, 8000])
    ax.set_yticklabels(["100", "150", "256", "512", "1024", "2048", "4k", "8k"])
    ax.set_ylabel("Hz (log)")
    for b in range(0, 61):
        ax.axvline(b, color="#777777", lw=0.3 if b % 5 else 0.8, alpha=0.5)
    for b, label in ACCENTS:
        ax.plot([b], [7000], marker="v", color="#d9480f", ms=7)
    for b0, b1, name in [(0, 20, "morph"), (20, 28, "recolour, dice"), (28, 38, "mirrored hats, zoom"),
                         (38, 41, "to Spectre"), (41, 53, "edge sweeps"), (53, 60, "home")]:
        ax.text((b0 + b1) / 2, 7600, name, ha="center", va="bottom", fontsize=9, color="#222222")
    ax.set_title("tiling-loop.wav: spectrogram (mono sum), triangles mark the accent beats", fontsize=11)

    rms = np.sqrt(np.mean(stereo.reshape(2, -1, SPB // 8) ** 2, axis=(0, 2)))
    peak = np.max(np.abs(stereo).reshape(2, -1, SPB // 8), axis=(0, 2))
    xb = (np.arange(len(rms)) + 0.5) / 8
    ax2.plot(xb, 20 * np.log10(peak), color="#1c7ed6", lw=1, label="sample peak")
    ax2.plot(xb, 20 * np.log10(rms), color="#495057", lw=1.4, label="RMS (94 ms)")
    ax2.axhline(0, color="#c92a2a", lw=0.8)
    ax2.set_ylim(-45, 3)
    ax2.set_ylabel("dBFS")
    ax2.legend(loc="lower right", fontsize=8, frameon=False)
    ax2.set_xlabel("beat (80 BPM; beat 60 = beat 0)")
    ax2.set_xlim(0, 60)
    ax2.set_xticks(range(0, 61, 2))
    for b, _ in ACCENTS:
        ax2.axvline(b, color="#d9480f", lw=0.6, alpha=0.6)
    fig.savefig(path, dpi=110, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def render():
    stems = {
        "pad": render_pad(),
        "pedal": render_pedal(),
        "slider": render_slider(),
        "bells": render_bells(),
        "colour": render_colour(),
        "dice": render_dice(),
        "swell": render_swell(),
        "edge": render_edge(),
    }
    dry = new_bus()
    send = new_bus()
    for name, bus in stems.items():
        dry += LEVEL[name] * bus
        send += LEVEL[name] * SEND[name] * bus
    wet = drifting_reverb(send)
    mix = np.stack([master_eq(dry[ch] + wet[ch]) for ch in range(2)])
    return mix, stems


def print_score():
    """Every pitch of the score as a ratio of C4, in RCN, and in Hz. The RCN
    must round-trip through justsynth's parser and value_to_rcn."""
    groups = [
        ("shapes (Chevron Hat Spectre Turtle Comet)", " ".join(SHAPE_NOTES.values())),
        ("pedal", PEDAL), ("home chord", HOME), ("Spectre chord", SPECTRE), ("mirror chord", MIRROR),
        ("Pastel", PASTEL), ("Greyscale", GREYSCALE),
        ("dice", " ".join(value_to_rcn(Fraction(6 + d, 4)) for d in DICE_FACES)),
        ("Mirrored hats strum", MIRROR_STRUM), ("zoom ladder", SWELL),
    ] + [(f"edge {shape} (base, up, down)", " ".join(notes)) for shape, notes in EDGE_NOTES.items()]
    print("score (ratio of C4 = 256 Hz, RCN, Hz):")
    for label, text in groups:
        cells = []
        for token in text.split():
            ratio = parse_rcn(token)
            assert value_to_rcn(ratio) == token, (token, value_to_rcn(ratio))
            cells.append(f"{ratio} {token} {float(ratio) * TONIC_HZ:.2f}")
        print(f"  {label}: " + " | ".join(cells))


def main():
    print_score()
    check_timeline_port()
    mix, stems = render()

    # Master: one static gain to the loudness target, measured by ffmpeg.
    raw = os.path.join(HERE, "_premaster.f32")
    inter = np.empty(2 * N, dtype="<f4")
    inter[0::2], inter[1::2] = mix[0], mix[1]
    inter.tofile(raw)
    lufs0, tp0, _ = ffmpeg_loudness(raw, raw=True)
    os.remove(raw)
    gain_db = TARGET_LUFS - lufs0
    print(f"pre-master: {lufs0:.2f} LUFS, true peak {tp0:.2f} dBTP -> gain {gain_db:+.2f} dB, "
          f"predicted true peak {tp0 + gain_db:.2f} dBTP")
    assert tp0 + gain_db <= TP_CEILING, "true peak would exceed the ceiling: lower the accents in the mix"
    final = mix * 10 ** (gain_db / 20)
    write_wav16(OUT_WAV, final)

    # Verify the file as written.
    (nch, width, rate, frames), data = read_wav16(OUT_WAV)
    print(f"written {OUT_WAV}: {nch} ch, {8 * width}-bit, {rate} Hz, {frames} frames = {frames / rate:.3f} s")
    assert (nch, width, rate, frames) == (2, 2, SR, N)
    lufs, tp, lra = ffmpeg_loudness(OUT_WAV)
    print(f"loudness: {lufs:.1f} LUFS integrated, true peak {tp:.2f} dBTP, LRA {lra:.1f} LU, "
          f"sample peak {20 * np.log10(np.max(np.abs(data))):.2f} dBFS")

    s = seam_check(data)
    print("seam, sample-to-sample jump at the join (L, R): "
          f"{s['join'][0] * 32768:.0f}, {s['join'][1] * 32768:.0f} LSB; "
          f"median elsewhere {s['median'][0] * 32768:.0f}, {s['median'][1] * 32768:.0f}; "
          f"99th percentile {s['p99'][0] * 32768:.0f}, {s['p99'][1] * 32768:.0f}; "
          f"max {s['max'][0] * 32768:.0f}, {s['max'][1] * 32768:.0f}")
    print(f"seam RMS 0.5 s before / after (L, R): {s['rms_before'][0]:.2f} / {s['rms_after'][0]:.2f} dBFS, "
          f"{s['rms_before'][1]:.2f} / {s['rms_after'][1]:.2f} dBFS; "
          f"step between adjacent half-seconds: median {s['rms_step_typ']:.2f} dB, max {s['rms_step_max']:.2f} dB")

    # Accent timing, on the isolated accent voices and on the finished mix.
    accent_stem = (stems["bells"] + stems["colour"] + stems["dice"]).mean(axis=0)
    mono = data.mean(axis=0)
    phone = phone_weight(mono)
    print("accent onsets, ms after the beat: isolated voice | final mix above 0.8 f0; "
          "then the mix's level rise over 200 ms, full range | above 300 Hz")
    worst = 0.0
    for b, label in ACCENTS:
        f0 = accent_pitch(b)
        on_stem = onset_isolated_ms(accent_stem, b)
        on_mix = onset_mix_ms(mono, b, f0)
        worst = max(worst, abs(on_stem), abs(on_mix))
        print(f"  b {b:>5}  t {b * 0.75:6.3f} s  {label:24s} {f0:7.2f} Hz  "
              f"{on_stem:+5.1f} ms | {on_mix:+5.1f} ms | {rise_db(mono, b):+5.1f} | {rise_db(phone, b):+5.1f} dB")
    print(f"worst accent offset {worst:.1f} ms")

    draw_spectrogram(data, OUT_PNG)
    print(f"drawn {OUT_PNG}")
    assert worst <= 10, "an accent is more than 10 ms off its beat"


if __name__ == "__main__":
    main()
