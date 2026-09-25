"""Makes loop candidates that end a few frames early, for players that pause at
the loop join.

python3 loop_trim.py VIDEO.mp4 MUSIC.wav OUT_PREFIX N [N ...]

Writes OUT_PREFIX-trimN.mp4 for each N: the picture and the music, both cut N
frames short of the full loop. VIDEO.mp4 is the silent picture from
compose.py, and MUSIC.wav the loop from music/loop_export.py.

A player that loops a video pauses briefly when it jumps back to the start.
X's player did, and so did deliver.py's own output: Apple's AAC encoder ends
on a whole block of 1,024 samples, so its audio stops up to 21 ms before the
picture. Here, instead:

- The audio is ffmpeg's own AAC, which ends on the exact sample. The encoder
  gets the loop's last second first, which is cut away afterwards, as in
  deliver.py, so the file does not start with a click.
- The audio fades out over 8 ms and in over 2 ms at the join, so a pause is
  a dip, not a click.
- Cutting N frames shortens the loop by N/30 s, which the player's pause
  then fills. Pick N by ear in the real player: David posted trim 3, 100 ms,
  on X, and a small glitch remained.

The picture is re-encoded with compose.py's settings, since cutting H.264 with
B-frames in place can damage the last frames. Each file then goes through
check_audio.py against its own trimmed master, and the exit status is 1 if any
fails. check_audio.py flags two off-beat hits at 39.0 s and 39.4 s in David's
mix as clicks. Their waveforms are smooth, and Apple's encoder happens to
soften them, so only this script's output shows them.
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

import check_audio

FFMPEG = check_audio.FFMPEG
FFPROBE = FFMPEG.replace("ffmpeg", "ffprobe")
PRE_S = 1.0
FADE_OUT_S, FADE_IN_S = 0.008, 0.002
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", "60",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]


def frames_and_rate(video):
    out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-count_frames",
                          "-show_entries", "stream=nb_read_frames,r_frame_rate", "-of", "json", video],
                         capture_output=True, text=True, check=True).stdout
    s = json.loads(out)["streams"][0]
    num, den = map(int, s["r_frame_rate"].split("/"))
    return int(s["nb_read_frames"]), num, den


def write_wav(path, data, sr):
    with wave.open(path, "wb") as w:
        w.setnchannels(data.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(np.round(data).astype("<i2").tobytes())


def main(video, music, prefix, *trims):
    frames, num, den = frames_and_rate(video)
    with wave.open(music) as w:
        sr = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()).astype(float)
    fade_out, fade_in = int(FADE_OUT_S * sr), int(FADE_IN_S * sr)
    results = []
    with tempfile.TemporaryDirectory() as tmp:
        for n in map(int, trims):
            keep = frames - n
            samples = keep * sr * den // num
            y = data[:samples].copy()
            y[:fade_in] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(fade_in) / fade_in))[:, None]
            y[-fade_out:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(fade_out) + 1) / fade_out))[:, None]
            loop, rolled = os.path.join(tmp, f"loop{n}.wav"), os.path.join(tmp, f"rolled{n}.wav")
            m4a, pic = os.path.join(tmp, f"audio{n}.m4a"), os.path.join(tmp, f"picture{n}.mp4")
            write_wav(loop, y, sr)
            write_wav(rolled, np.concatenate([y[-int(PRE_S * sr):], y]), sr)
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", rolled, "-c:a", "aac", "-b:a", "192k", m4a], check=True)
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", video, "-frames:v", str(keep), "-an"] + X264 + [pic],
                           check=True)
            out = f"{prefix}-trim{n}.mp4"
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", pic, "-ss", str(PRE_S), "-i", m4a, "-map", "0:v",
                            "-map", "1:a", "-c", "copy", "-movflags", "+faststart", out], check=True)
            print(f"{out}: {keep} frames, {samples} samples")
            results.append(check_audio.check(out, check_audio.decode(loop)))
    return all(results)


if __name__ == "__main__":
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    sys.exit(0 if main(*sys.argv[1:]) else 1)
