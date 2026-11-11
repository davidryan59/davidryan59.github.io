"""Draw the animated Cross and Wing thumbnail.

The picture loops through the website's own mark, then seven covers, each held
for 1.4 s, with one blended frame of 50 ms between. Every frame is 240 px
square, so the 120 px thumbnail stays sharp on a high-density screen, on the mark's dark
page colour. A cover is shown whole, with margins at the sides.

Needs Python 3 with Pillow, and rsvg-convert for the mark. The covers are the
shelf covers in the cross-wing repo, so rerun this script after they change.
"""
import io, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..', '..'))
CODE = os.path.expanduser('~/code/projects/cross-wing')
MARK = os.path.join(CODE, 'apps/web/public/mark-dark.svg')
SHELF = os.path.join(CODE, 'content/seed/covers/shelf')
COVERS = ['two-doors', 'the-holy-bible-world-english-bible', 'anna-karenina',
          'the-princess-and-the-goblin', 'wuthering-heights', 'orthodoxy',
          'ivanhoe']
OUT = os.path.join(SITE, 'assets/thumbs/cross-wing.webp')
SIZE, BG, HOLD, FADE_STEPS, FADE_MS = 240, (14, 17, 22), 1400, 1, 50

def mark():
    png = subprocess.run(['rsvg-convert', '-h', '170', MARK], check=True,
                         capture_output=True).stdout
    return fit(Image.open(io.BytesIO(png)).convert('RGBA'))

def fit(img):
    img.thumbnail((SIZE - 16, SIZE - 16), Image.LANCZOS)
    frame = Image.new('RGB', (SIZE, SIZE), BG)
    frame.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2),
                img if img.mode == 'RGBA' else None)
    return frame

stills = [mark()] + [fit(Image.open(os.path.join(SHELF, c + '.jpg')).convert('RGB'))
                     for c in COVERS]
frames, times = [], []
for i, still in enumerate(stills):
    frames.append(still); times.append(HOLD)
    nxt = stills[(i + 1) % len(stills)]
    for s in range(1, FADE_STEPS + 1):
        frames.append(Image.blend(still, nxt, s / (FADE_STEPS + 1)))
        times.append(FADE_MS)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=times,
               loop=0, quality=int(sys.argv[1]) if len(sys.argv) > 1 else 60,
               method=6)
print(OUT, os.path.getsize(OUT), 'bytes')
