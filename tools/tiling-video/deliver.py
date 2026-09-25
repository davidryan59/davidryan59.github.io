"""Adds the soundtrack to a finished video, makes a listening copy, and checks
both for distortion.

python3 deliver.py VIDEO.mp4 MUSIC.wav OUT.mp4 [OUT.mp3]

VIDEO.mp4 is the picture from compose.py; any sound in it is replaced. Its
video is copied, not re-encoded, so this takes a few seconds.

An AAC encoder starts cold: the first 20 ms or so of a file come out wrong,
by up to -12 dBFS with ffmpeg's own encoder, which is a click at the start of
the video. So the encoder gets the loop's last second first, as it would
hear it when the video loops, and that second is cut away afterwards, to the
sample. AAC works in blocks of 1,024 samples and 45 s is not a whole number
of them, so the audio ends at the last whole block, up to 21 ms before the
picture: a player that loops the file hears that much silence at the join.
Apple's AAC encoder is used where ffmpeg has it, since it is the more exact.

OUT.mp3, if given, holds the loop twice, so the join can be heard in the
middle. Both files then go through check_audio.py against the master, and the
exit status is 1 if either fails.
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

import check_audio

FFMPEG = check_audio.FFMPEG
PRE_S, POST_S = 1.0, 0.2


def encoder():
    out = subprocess.run([FFMPEG, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return "aac_at" if " aac_at " in out else "aac"


def main(video, music, out_mp4, out_mp3=None):
    with wave.open(music) as w:
        sr, frames = w.getframerate(), w.getnframes()
        data = np.frombuffer(w.readframes(frames), "<i2").reshape(-1, w.getnchannels())
    pre, post = int(PRE_S * sr), int(POST_S * sr)
    with tempfile.TemporaryDirectory() as tmp:
        rolled = os.path.join(tmp, "rolled.wav")
        with wave.open(rolled, "wb") as w:
            w.setnchannels(data.shape[1])
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(np.concatenate([data[-pre:], data, data[:post]]).tobytes())
        m4a = os.path.join(tmp, "rolled.m4a")
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", rolled, "-c:a", encoder(), "-b:a", "192k", m4a], check=True)
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", video, "-ss", str(PRE_S), "-i", m4a, "-map", "0:v", "-map", "1:a",
                        "-c", "copy", "-shortest", "-movflags", "+faststart", out_mp4], check=True)
    outputs = [out_mp4]
    if out_mp3:
        subprocess.run([FFMPEG, "-v", "error", "-y", "-stream_loop", "1", "-i", music, "-c:a", "libmp3lame", "-q:a", "2", out_mp3],
                       check=True)
        outputs.append(out_mp3)
    master = check_audio.decode(music)
    results = [check_audio.check(p, master) for p in outputs]
    return all(results)


if __name__ == "__main__":
    if len(sys.argv) not in (4, 5):
        sys.exit(__doc__)
    sys.exit(0 if main(*sys.argv[1:]) else 1)
