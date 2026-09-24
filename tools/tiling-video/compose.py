"""Composes the final video from the three layers.

python3 compose.py [music.wav] [out.mp4]

Tiling: frames/hat/NNNN.jpg and frames/spectre/NNNN.jpg, blended by the
timeline's hatMix at the two crossfades. Overlay: overlay/frames/NNNN.png,
alpha-composited on top. Music: muxed as AAC. Without a music file the video
is silent, for checking the picture.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 1080


def mixes():
    """hatMix per frame, from the shared timeline, so the blend matches it exactly."""
    js = "const T=require('./timeline.js');console.log(JSON.stringify(Array.from({length:T.FRAMES},(_,n)=>T.hatMix(T.beatOfFrame(n)))))"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=HERE))


def load(path):
    im = Image.open(path).convert('RGB')
    if im.size != (SIZE, SIZE):
        raise ValueError(f'{path} is {im.size}, expected {SIZE} square')
    return np.asarray(im, dtype=np.float32)


def frame(n, mix):
    name = f'{n:04d}'
    if mix >= 1:
        base = load(f'{HERE}/frames/hat/{name}.jpg')
    elif mix <= 0:
        base = load(f'{HERE}/frames/spectre/{name}.jpg')
    else:
        base = mix * load(f'{HERE}/frames/hat/{name}.jpg') + (1 - mix) * load(f'{HERE}/frames/spectre/{name}.jpg')
    over = np.asarray(Image.open(f'{HERE}/overlay/frames/{name}.png').convert('RGBA'), dtype=np.float32)
    a = over[:, :, 3:4] / 255
    out = over[:, :, :3] * a + base * (1 - a)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def main():
    music = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '-' else None
    out = sys.argv[2] if len(sys.argv) > 2 else f'{HERE}/tiling-explorer.mp4'
    ms = mixes()
    cmd = ['ffmpeg', '-loglevel', 'error', '-y',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{SIZE}x{SIZE}', '-r', '30', '-i', '-']
    if music:
        cmd += ['-i', music]
    # X (Twitter) takes H.264 High with yuv420p and AAC. A high-quality upload
    # leaves X's own re-encode more to work with.
    # The conversion matrix must match the BT.709 tags, or colours shift.
    cmd += ['-vf', 'scale=out_color_matrix=bt709:out_range=tv',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-g', '60', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
    if music:
        cmd += ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest']
    cmd += ['-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n, mix in enumerate(ms):
        p.stdin.write(frame(n, mix).tobytes())
        if n % 150 == 0:
            print('frame', n, flush=True)
    p.stdin.close()
    if p.wait() != 0:
        sys.exit('ffmpeg failed')
    print('wrote', out)


if __name__ == '__main__':
    main()
