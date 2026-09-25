"""Checks finished audio for distortion, as a listener would get it.

python3 check_audio.py [--master music/tiling-loop.wav] FILE [FILE ...]

Each file (WAV, MP3 or MP4) is decoded with ffmpeg the way a player decodes
it, then checked. Lossy encoding can push peaks above the master's, so run
this on the files that get shared, not only on the master.

- Clipped samples: decoded samples at full scale. Must be none.
- True peak: ffmpeg's ebur128 measure, oversampled 4 times, which catches
  peaks between samples. Must be at or below -1 dBTP.
- Clicks: a click is a spike across every frequency, so it shows above
  15 kHz, where this soundtrack, low-passed at 7 kHz, has almost nothing. A
  1 ms window counts as a click when it stands 15 dB above the windows on
  both sides. A hat, which rises and then rings for tens of milliseconds,
  does not. Must be none. A WAV file is treated as a loop, its end joined to
  its start, so its loop join is checked too. An MP3 or MP4 skips its first
  and last 10 ms: every encoder starts cold and stops there, which the
  filter would read as a click. The two-loop MP3 carries the loop join in
  its middle, where it is checked.
- With --master: the decoded audio must start in step with the master, to
  the sample, and last a whole number of loops. An AAC file may end up to
  one block, 1,024 samples, short, since AAC works in whole blocks. The
  first and last 30 ms, where encoders are least exact, must be no more
  than 1.5 times as far from the master as the worst of the rest: a cold
  encoder start can put a click there.
- Sub-bass: the share of power below 60 Hz. Phone and laptop speakers cannot
  play it and can distort on it. Reported as a warning above 40%.

The exit status is 1 if any file fails.
"""
import shutil
import subprocess
import sys

import numpy as np

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
SR = 48000
TP_CEILING = -1.0
CLICK_MARGIN_DB = 15       # a click window stands this far above both neighbours
CLICK_FLOOR_DB = -80       # and above this absolute level
SUB_WARN = 0.40


def decode(path):
    raw = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-map", "0:a:0", "-f", "s16le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, "<i2").reshape(-1, 2).T.astype(float) / 32768


def true_peak(path):
    out = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    summary = out[out.rindex("Summary:"):]
    return float(summary.split("I:")[1].split("LUFS")[0]), float(summary.split("Peak:")[1].split("dBFS")[0])


def check(path, master=None):
    x = decode(path)
    n = x.shape[1]
    clipped = int((np.abs(x) >= 32767 / 32768).sum())
    lufs, tp = true_peak(path)

    mono = x.mean(axis=0)
    spec = np.fft.rfft(mono)
    f = np.fft.rfftfreq(n, 1 / SR)
    power = np.abs(spec) ** 2
    sub = power[(f > 0) & (f < 60)].sum() / power[f > 0].sum()
    high = np.fft.irfft(spec * (f > 15000), n)
    w = SR // 1000
    level = 10 * np.log10((high[: n // w * w].reshape(-1, w) ** 2).mean(axis=1) + 1e-20)
    lossless = path.lower().endswith(".wav")
    padded = np.pad(level, 9, mode="wrap" if lossless else "reflect")
    before = np.array([padded[i + 1:i + 7].max() for i in range(len(level))])
    after = np.array([padded[i + 12:i + 18].max() for i in range(len(level))])
    spike = (level > np.maximum(before, after) + CLICK_MARGIN_DB) & (level > CLICK_FLOOR_DB)
    if not lossless:
        spike[:10] = spike[-10:] = False
    clicks = np.nonzero(spike)[0]
    median = np.median(level)

    ok = clipped == 0 and tp <= TP_CEILING and len(clicks) == 0
    report = []
    if master is not None:
        loops = round(n / master.shape[1])
        ref = np.tile(master, max(loops, 1))[0]
        short = ref.size - n
        seg = slice(SR, 3 * SR)
        lag = max(range(-200, 201), key=lambda o: np.dot(x[0, SR + o:3 * SR + o], ref[seg]))
        in_step = loops >= 1 and 0 <= short < 1024 and lag == 0
        if in_step:
            err = np.abs(x[0] - ref[:n]) * 32768
            k = 3 * SR // 100
            edge, body = max(err[:k].max(), err[-k:].max()), err[k:-k].max()
            clean_edges = edge <= 1.5 * body + 32
            report.append(f"      against the master: {loops} loop(s), in step, {1000 * short / SR:.1f} ms short; error first 30 ms "
                          f"{err[:k].max():.0f}, last 30 ms {err[-k:].max():.0f}, elsewhere at most {body:.0f} LSB"
                          + ("" if clean_edges else "  (FAIL: an edge is much worse than the rest)"))
            in_step = clean_edges
        else:
            report.append(f"      against the master: NOT in step (lag {lag}, {n} samples, master {master.shape[1]})")
        ok = ok and in_step
    print(f"{'PASS' if ok else 'FAIL'}  {path}")
    print(f"      {n / SR:.3f} s, {lufs:.1f} LUFS, true peak {tp:.1f} dBTP (limit {TP_CEILING}), "
          f"clipped samples {clipped}")
    print(f"      above 15 kHz: median {median:.0f} dBFS, loudest 1 ms {level.max():.0f} dBFS, clicks {len(clicks)}"
          + (f" at {', '.join(f'{c * w / SR:.3f} s' for c in clicks[:8])}" if len(clicks) else ""))
    print(f"      sub-bass below 60 Hz: {100 * sub:.0f}% of the power" + ("  (warning: high for small speakers)" if sub > SUB_WARN else ""))
    for line in report:
        print(line)
    return ok


if __name__ == "__main__":
    args = sys.argv[1:]
    master = None
    if args[:1] == ["--master"]:
        master = decode(args[1])
        args = args[2:]
    results = [check(p, master) for p in args]
    sys.exit(0 if results and all(results) else 1)
