#!/usr/bin/env python3
"""Draw social/aperiodic-pairs.jpg, the 1200 x 630 share card for the
aperiodic pairs page: Penrose kites and darts on the left, rhombs on the
right, in the page's light colours. It uses the same subdivision rules as
the page. Needs Pillow: python3 tools/aperiodic-pairs/card.py
"""

import cmath
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "social" / "aperiodic-pairs.jpg"
PHI = (1 + 5 ** 0.5) / 2
W, H, SS = 1200, 630, 3
GROUND, TILE_A, TILE_B, LINE = "#f6f3ec", "#9db4dc", "#ecc680", "#2a2922"


def kites_and_darts(steps):
    tris = []
    for i in range(10):
        a = cmath.rect(PHI, math.radians(-18 + 36 * i))
        c = cmath.rect(PHI, math.radians(18 + 36 * i))
        if i % 2:
            a, c = c, a
        tris.append((0, a, 0j, c))
    for _ in range(steps):
        out = []
        for col, a, b, c in tris:
            if col == 0:
                q = a + (b - a) / PHI
                r = b + (c - b) / PHI
                out += [(1, r, q, b), (0, q, a, r), (0, c, a, r)]
            else:
                p = c + (a - c) / PHI
                out += [(1, b, p, a), (0, p, c, b)]
        tris = out
    # Halves pair across BC, so stroke AB and AC.
    return [(col, (a, b, c), [(a, b), (a, c)]) for col, a, b, c in tris]


def rhombs(steps):
    tris = []
    for i in range(10):
        b = cmath.rect(1, (2 * i - 1) * math.pi / 10)
        c = cmath.rect(1, (2 * i + 1) * math.pi / 10)
        if i % 2 == 0:
            b, c = c, b
        tris.append((0, 0j, b, c))
    for _ in range(steps):
        out = []
        for col, a, b, c in tris:
            if col == 0:
                p = a + (b - a) / PHI
                out += [(0, c, p, b), (1, p, c, a)]
            else:
                q = b + (a - b) / PHI
                r = b + (c - b) / PHI
                out += [(1, r, c, a), (1, q, r, b), (0, r, q, a)]
        tris = out
    # Colour 1 halves thick rhombs; halves pair across BC.
    return [(1 - col, (a, b, c), [(c, a), (a, b)]) for col, a, b, c in tris]


def draw(image, tris, centre, scale):
    draw = ImageDraw.Draw(image)
    cx, cy = centre

    def xy(z):
        return (cx + z.real * scale, cy - z.imag * scale)

    for col, pts, _ in tris:
        draw.polygon([xy(z) for z in pts], fill=TILE_B if col else TILE_A)
    width = max(1, round(1.1 * SS))
    for _, _, edges in tris:
        for u, v in edges:
            draw.line([xy(u), xy(v)], fill=LINE, width=width)


def half(tris, radius):
    """Fill one half of the card: the patch's inscribed circle covers it."""
    image = Image.new("RGB", (W // 2 * SS, H * SS), GROUND)
    reach = math.hypot(W / 4, H / 2) * SS / math.cos(math.pi / 10)
    draw(image, tris, (W // 4 * SS, H // 2 * SS), reach / radius)
    return image


def main():
    image = Image.new("RGB", (W * SS, H * SS), GROUND)
    image.paste(half(kites_and_darts(6), PHI), (0, 0))
    image.paste(half(rhombs(6), 1.0), (W // 2 * SS, 0))
    ImageDraw.Draw(image).line([(W // 2 * SS, 0), (W // 2 * SS, H * SS)], fill=GROUND, width=4 * SS)
    image = image.resize((W, H), Image.LANCZOS)
    for quality in (90, 85, 80, 75, 70):
        image.save(OUT, "JPEG", quality=quality, optimize=True)
        if OUT.stat().st_size <= 300 * 1024:
            break
    print(f"wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
