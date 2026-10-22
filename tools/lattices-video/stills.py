"""Five 1080 × 1080 pictures for the tweet thread that goes with the 60-second film.

    python3 tools/lattices-video/stills.py

Each picture illustrates one reply without repeating its words: short labels
only, in the film's dark theme and glow. Output: renders/tweet-2.png … tweet-6.png.
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, zoom

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geometry as G  # noqa: E402
import render as R  # noqa: E402

W, H, SS = R.W, R.H, R.SS
INK, MUTED, GOLD, SKY, ROSE = R.INK, R.MUTED, R.GOLD, R.SKY, R.ROSE
WARM = (255, 241, 207)
CYAN = (95, 225, 255)
VIOLET = (167, 123, 255)
DARK = (34, 38, 48)


def rgba(colour, alpha):
    return tuple(int(c) for c in colour) + (int(255 * max(0.0, min(1.0, alpha))),)


class Canvas:
    """Three layers: translucent fills, light that glows, and crisp lines; then text on top."""

    def __init__(self):
        self.fill = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
        self.glow = Image.new('RGB', (W * SS, H * SS), (0, 0, 0))
        self.crisp = Image.new('RGB', (W * SS, H * SS), (0, 0, 0))
        self.df = ImageDraw.Draw(self.fill, 'RGBA')
        self.dg = ImageDraw.Draw(self.glow, 'RGBA')
        self.dc = ImageDraw.Draw(self.crisp, 'RGBA')
        self.texts = []

    def draw(self, glow):
        return self.dg if glow else self.dc

    def dot(self, x, y, r, colour, alpha=1.0, glow=True):
        self.draw(glow).ellipse(((x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS), fill=rgba(colour, alpha))

    def line(self, points, colour, alpha=1.0, width=2.0, glow=True):
        self.draw(glow).line([(x * SS, y * SS) for x, y in points], fill=rgba(colour, alpha),
                             width=max(1, int(width * SS)), joint='curve')

    def poly(self, points, colour, alpha):
        self.df.polygon([(x * SS, y * SS) for x, y in points], fill=rgba(colour, alpha))

    def rect(self, x0, y0, x1, y1, colour, alpha, radius=6, glow=True):
        d = self.dg if glow else self.df
        d.rounded_rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), radius=radius * SS, fill=rgba(colour, alpha))

    def triangle(self, points, colour, alpha=1.0, glow=True):
        self.draw(glow).polygon([(x * SS, y * SS) for x, y in points], fill=rgba(colour, alpha))

    def text(self, text, size, colour, x, y, opacity=1.0):
        self.texts.append((text, size, colour, x, y, opacity))

    def arrow(self, points, colour, alpha=1.0, width=2.5, head=14, glow=True):
        self.line(points, colour, alpha, width, glow)
        (x1, y1), (x2, y2) = points[-2], points[-1]
        a = math.atan2(y2 - y1, x2 - x1)
        self.triangle([(x2, y2), (x2 - head * math.cos(a - 0.4), y2 - head * math.sin(a - 0.4)),
                       (x2 - head * math.cos(a + 0.4), y2 - head * math.sin(a + 0.4))], colour, alpha, glow)

    def render(self):
        img = R.background().copy()
        f = np.asarray(self.fill.resize((W, H), Image.BOX), np.float32) / 255
        img = img * (1 - f[..., 3:]) + f[..., :3] * f[..., 3:]
        light = np.asarray(self.glow.resize((W, H), Image.BOX), np.float32) / 255
        small = light.reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3))
        light = light + zoom(gaussian_filter(small, (3.2, 3.2, 0)), (4, 4, 1), order=1) * 1.1
        light = light + np.asarray(self.crisp.resize((W, H), Image.BOX), np.float32) / 255
        img = 1 - (1 - img) * (1 - np.clip(light, 0, 1))
        for text, size, colour, x, y, opacity in self.texts:
            a, c, _ = R.text_image(text, size, colour)
            h, w = a.shape
            x0, y0 = int(round(x - w / 2)), int(round(y - h / 2))
            a = a * opacity
            img[y0:y0 + h, x0:x0 + w] = img[y0:y0 + h, x0:x0 + w] * (1 - a[..., None]) + c * a[..., None]
        return img


def bezier(p0, p1, p2, n=40):
    t = np.linspace(0, 1, n)[:, None]
    return list(map(tuple, (1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(p1) + t ** 2 * np.array(p2)))


# ---------------------------------------------------------------- 2: every cell has area 1

def cells():
    cv = Canvas()
    spacing, angle, cx, cy = 78.0, 0.12, 540.0, 560.0
    c, s = math.cos(angle), math.sin(angle)

    def at(gx, gy):
        return cx + (gx * c - gy * s) * spacing, cy - (gx * s + gy * c) * spacing

    shapes = [((-5, 2), (1, 0), (0, 1), SKY), ((-2, 2), (1, 0), (1, 1), ROSE), ((1, 1), (2, 1), (1, 1), GOLD),
              ((-4, -4), (3, 2), (1, 1), VIOLET), ((3, -4), (1, 3), (0, 1), CYAN)]
    for (ox, oy), (ax, ay), (bx, by), colour in shapes:
        corners = [at(ox, oy), at(ox + ax, oy + ay), at(ox + ax + bx, oy + ay + by), at(ox + bx, oy + by)]
        cv.poly(corners, colour, 0.22)
        cv.line(corners + [corners[0]], colour, 0.95, 2.4)
        cv.text('1', 34, colour, sum(p[0] for p in corners) / 4, sum(p[1] for p in corners) / 4)
    for gx in range(-9, 10):
        for gy in range(-9, 10):
            x, y = at(gx, gy)
            if 30 < x < W - 30 and 40 < y < H - 30:
                fade = max(0.0, 1 - max(0.0, math.hypot(x - cx, y - cy) - 380) / 260)
                cv.dot(x, y, 4.6, R.mix(CYAN, (111, 140, 255), min(1.0, math.hypot(gx, gy) / 9)), fade)
    return cv.render()


# ---------------------------------------------------------------- 3: the shapes of the shortest vectors

def barcodes():
    cv = Canvas()
    vectors = G.leech_minimal()
    support = (vectors != 0).sum(1)
    leech = [vectors[np.flatnonzero(support == n)[k]] for n, k in ((2, 137), (8, 4321), (24, 777))]
    e8 = [np.array([0, 1, 0, 0, -1, 0, 0, 0.0]), np.array([0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5])]

    def cell(v, top):
        if v == 0:
            return DARK, 0.9
        return (GOLD if v > 0 else SKY), (0.35 + 0.65 * abs(v) / top) * 0.6

    def label(v, half):
        if half:
            return '½' if v > 0 else '−½'
        return str(int(v)) if v >= 0 else '−' + str(int(-v))

    cv.text('E₈', 40, INK, 540, 150)
    size, gap = 64, 8
    x0 = 540 - (8 * size + 7 * gap) / 2
    for r, (vec, count) in enumerate(zip(e8, ('× 112', '× 128'))):
        y = 205 + r * 86
        for i, v in enumerate(vec):
            colour, a = cell(v, 1.0)
            x = x0 + i * (size + gap)
            cv.rect(x, y, x + size, y + size, colour, a, glow=bool(v))
            if v:
                cv.text(label(v, r == 1), 24, (16, 18, 24), x + size / 2, y + size / 2)
        cv.text(count, 28, MUTED, x0 + 8 * (size + gap) + 70, y + size / 2)

    cv.text('Leech, in units of 1/√8', 40, INK, 540, 520)
    size, gap = 34, 4
    x0 = 540 - (24 * size + 23 * gap) / 2 - 40
    for r, (vec, count) in enumerate(zip(leech, ('× 1,104', '× 97,152', '× 98,304'))):
        y = 575 + r * 120
        for i, v in enumerate(vec):
            colour, a = cell(v, 4.0)
            x = x0 + i * (size + gap)
            cv.rect(x, y, x + size, y + 64, colour, a, radius=5, glow=bool(v))
            if v:
                cv.text(label(v, False), 18, (16, 18, 24), x + size / 2, y + 32)
        cv.text(count, 26, MUTED, x0 + 24 * (size + gap) + 62, y + 32)
    cv.text('Gold positive, blue negative. The middle row’s 8 nonzero entries sit on an octad of the Golay code',
            20, MUTED, 540, 975)
    return cv.render()


# ---------------------------------------------------------------- 4: how much of each j coefficient is Leech vectors alone

def shares():
    cv = Canvas()
    theta = [196560, 16773120, 398034000, 4629381120]
    j = [196884, 21493760, 864299970, 20245856256]
    names = ['q¹', 'q²', 'q³', 'q⁴']
    rows, cols, step, bottom = 50, 10, 11, 830
    for b, (t, total) in enumerate(zip(theta, j)):
        share = t / total
        gold_rows = round(share * rows)
        left = 160 + b * 220
        middle = left + (cols - 1) * step / 2
        for row in range(rows):
            for col in range(cols):
                cv.dot(left + col * step, bottom - row * step, 3.3, GOLD if row < gold_rows else ROSE, 0.95)
        text = f'{100 * share:.1f}%' if share > 0.99 else f'{100 * share:.0f}%'
        cv.text(text, 30, GOLD, middle, bottom - rows * step - 30)
        cv.text(names[b], 34, INK, middle, bottom + 46)
        cv.text(f'{total:,}', 21, MUTED, middle, bottom + 88)
    # The first bar's 324 states with vibrations are too thin for a row of dots.
    top = bottom - (rows - 1) * step - 6
    cv.line([(155, top), (165 + (cols - 1) * step, top)], ROSE, 1.0, 3)
    cv.text('324', 22, ROSE, 160 + (cols - 1) * step + 36, top)
    cv.dot(150, 170, 7, GOLD)
    cv.text('Leech vectors alone', 26, INK, 272, 170)
    cv.dot(560, 170, 7, ROSE)
    cv.text('states with vibrations', 26, INK, 690, 170)
    cv.text('Each bar is one coefficient of j', 22, MUTED, 540, 1020)
    return cv.render()


# ---------------------------------------------------------------- 5: the torus folds into a pillowcase

def pillowcase():
    cv = Canvas()
    x0, y0, side = 90, 330, 380
    sq = [(x0, y0), (x0 + side, y0), (x0 + side, y0 + side), (x0, y0 + side)]
    cv.poly(sq, (60, 70, 130), 0.35)
    cv.line(sq + [sq[0]], CYAN, 0.9, 2.4)
    # Arrows mark which edges are glued: one arrow left and right, two top and bottom.
    for (ax, ay), (bx, by), n in (((x0, y0 + side), (x0, y0), 1), ((x0 + side, y0 + side), (x0 + side, y0), 1),
                                  ((x0, y0), (x0 + side, y0), 2), ((x0, y0 + side), (x0 + side, y0 + side), 2)):
        mx, my = (ax + bx) / 2, (ay + by) / 2
        a = math.atan2(by - ay, bx - ax)
        ux, uy, vx, vy = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
        for k in range(n):
            off = (k - (n - 1) / 2) * 18
            tx, ty = mx + off * ux, my + off * uy
            cv.triangle([(tx + 9 * ux, ty + 9 * uy), (tx - 7 * ux + 7 * vx, ty - 7 * uy + 7 * vy),
                         (tx - 7 * ux - 7 * vx, ty - 7 * uy - 7 * vy)], CYAN, 0.9)
    # The square runs from −1/4 to 3/4 in each direction, so the 4 fixed points of v → −v,
    # at 0 and 1/2, all sit inside it.
    fixed = [(x0 + side * u, y0 + side * w) for u in (0.25, 0.75) for w in (0.25, 0.75)]
    for x, y in fixed:
        cv.dot(x, y, 8, GOLD)
    # Twisted strings run from x to −x, around a fixed point.
    for (fx, fy), (dx, dy) in ((fixed[0], (52, -30)), (fixed[3], (-46, -40)), (fixed[1], (40, 48))):
        p, q = (fx + dx, fy + dy), (fx - dx, fy - dy)
        cv.line(bezier(p, (fx - dy * 0.8, fy + dx * 0.8), q), ROSE, 0.95, 3)
        cv.dot(*p, 5, ROSE)
        cv.dot(*q, 5, ROSE)
    cv.text('torus', 30, INK, x0 + side / 2, y0 + side + 60)
    cv.arrow([(505, 520), (590, 520)], MUTED, 0.9, 3)

    corners = [(660, 330), (1000, 395), (960, 720), (625, 650)]
    centre = (812, 525)
    edges = []
    for k in range(4):
        a, b = corners[k], corners[(k + 1) % 4]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        edges += bezier(a, (mid[0] + (mid[0] - centre[0]) * 0.28, mid[1] + (mid[1] - centre[1]) * 0.28), b)
    cv.poly(edges, (60, 70, 130), 0.55)
    cv.line(edges + [edges[0]], CYAN, 0.9, 2.4)
    seam = bezier((838, 368), centre, (786, 679))
    for k in range(0, len(seam) - 1, 4):
        cv.line(seam[k:k + 3], CYAN, 0.35, 1.6)
    for x, y in corners:
        cv.dot(x, y, 9, GOLD)
    for (x, y), (rx, ry) in zip(corners[:3], ((34, 24), (30, 36), (36, 26))):
        cv.line([(x + rx * math.cos(u), y + ry * math.sin(u)) for u in np.linspace(0, 2 * math.pi, 60)], ROSE, 0.95, 3)
    cv.text('pillowcase', 30, INK, 812, 790)
    cv.text('The 4 corners are the fixed points. A twisted string loops around a corner', 22, MUTED, 540, 900)
    cv.text('The Leech torus folds into a pillowcase with 2²⁴ corners', 26, INK, 540, 960)
    return cv.render()


# ---------------------------------------------------------------- 6: triality on the D4 diagram

def triality():
    cv = Canvas()
    cx, cy, arm = 540, 600, 230
    outer = []
    for k, (colour, name) in enumerate(((SKY, 'vector'), (ROSE, 'spinor'), (GOLD, 'spinor'))):
        a = -math.pi / 2 + 2 * math.pi * k / 3
        outer.append((cx + arm * math.cos(a), cy + arm * math.sin(a), a, colour, name))
        cv.line([(cx, cy), outer[-1][:2]], (200, 215, 240), 0.85, 5)
    for x, y, a, colour, name in outer:
        cv.dot(x, y, 30, colour)
        cv.text(name, 28, colour, cx + (arm + 72) * math.cos(a), cy + (arm + 72) * math.sin(a))
    cv.dot(cx, cy, 30, WARM)
    ring = 345
    for k in range(3):
        a0 = -math.pi / 2 + 2 * math.pi * k / 3 + 0.32
        a1 = a0 + 2 * math.pi / 3 - 0.64
        cv.arrow([(cx + ring * math.cos(u), cy + ring * math.sin(u)) for u in np.linspace(a0, a1, 50)],
                 (225, 230, 245), 0.75, 3, head=18)
    cv.text('D₄', 44, INK, 540, 140)
    cv.text('Rotating the diagram swaps the vector with the two spinors of Spin(8)', 24, MUTED, 540, 196)
    return cv.render()


SHOTS = {'tweet-2': cells, 'tweet-3': barcodes, 'tweet-4': shares, 'tweet-5': pillowcase, 'tweet-6': triality}


def main():
    os.makedirs(R.RENDERS, exist_ok=True)
    for name, make in SHOTS.items():
        img = make()
        path = os.path.join(R.RENDERS, f'{name}.png')
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)
        print(path)


if __name__ == '__main__':
    main()
