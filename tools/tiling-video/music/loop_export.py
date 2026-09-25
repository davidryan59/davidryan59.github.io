"""Makes the soundtrack loop from David's own mix, exported from Ableton.

python3 music/loop_export.py EXPORT.wav

Export from bar 1, at the tempo MUSIC_BPM in timeline.js, and run the export
a bar past the end of the loop so it carries the reverb and delay tail. The
loop is as long as the video, LOOP_SECONDS in timeline.js. This folds
everything after the loop's end back over its start, which is what a listener
hears when the loop repeats, so the join is seamless. One static gain then
brings the loop to -18 LUFS, the level of the earlier soundtracks, unless
that would lift the sample peak above -3 dBFS. The result is
music/tiling-loop.wav, for deliver.py.

Ableton takes a tempo to two decimals, so the music's loop may differ from
the video's by a millisecond or so. The fold happens at the video's length,
which keeps the join continuous.
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.dirname(HERE)
sys.path.insert(0, TOOL)
import check_audio  # noqa: E402

OUT_WAV = os.path.join(HERE, "tiling-loop.wav")
TARGET_LUFS = -18.0
PEAK_CEILING_DB = -3.0


def timeline():
    js = "const T=require(process.argv[1]);console.log(JSON.stringify({loop:T.LOOP_SECONDS,bpm:T.MUSIC_BPM}))"
    return json.loads(subprocess.check_output(["node", "-e", js, os.path.join(TOOL, "timeline.js")]))


def write(path, data, sr):
    with wave.open(path, "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.astype("<i2").tobytes())


def rms_db(x):
    return 10 * np.log10(np.mean((x / 32768) ** 2) + 1e-20)


def main(export):
    tl = timeline()
    with wave.open(export) as w:
        if w.getsampwidth() != 2:
            sys.exit("export as 16-bit PCM")
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()).astype(float)
    n = int(round(tl["loop"] * sr))
    if len(x) < n:
        sys.exit(f"the export is {len(x) / sr:.3f} s, shorter than the {tl['loop']} s loop")

    # The music should stop at the loop's end and only the tail ring on. An
    # export at the wrong tempo stops early or plays on past it.
    half = sr // 2
    before, after = rms_db(x[n - half:n]), rms_db(x[n + sr // 50:n + half])
    if len(x) >= n + half and not before - after > 6:
        sys.exit(f"no drop in level at the loop's end ({before:.1f} dB before, {after:.1f} dB after): "
                 f"export at {tl['bpm']:.2f} BPM from bar 1")

    loop = x[:n].copy()
    tail = x[n:2 * n]
    loop[:len(tail)] += tail

    with tempfile.TemporaryDirectory() as tmp:
        probe = os.path.join(tmp, "probe.wav")
        write(probe, np.round(loop), sr)
        lufs, _ = check_audio.true_peak(probe)
    peak_db = 20 * np.log10(np.abs(loop).max() / 32768)
    gain_db = min(TARGET_LUFS - lufs, PEAK_CEILING_DB - peak_db)
    out = np.round(loop * 10 ** (gain_db / 20))
    write(OUT_WAV, out, sr)
    lufs_out, tp_out = check_audio.true_peak(OUT_WAV)
    print(f"wrote {OUT_WAV}: {n} samples, {n / sr:.3f} s, a {len(tail) / sr:.2f} s tail folded over the start")
    print(f"  level {lufs:.1f} LUFS, gain {gain_db:+.2f} dB, now {lufs_out:.1f} LUFS, "
          f"sample peak {20 * np.log10(np.abs(out).max() / 32768):.1f} dBFS, true peak {tp_out:.1f} dBTP")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
