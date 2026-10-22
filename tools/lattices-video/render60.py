"""Render the 60-second unimodular lattices video: 1080 × 1080, 60 fps, silent.

    python3 tools/lattices-video/render60.py                   # the video
    python3 tools/lattices-video/render60.py --stills 7,41.5   # stills at chosen seconds
    python3 tools/lattices-video/render60.py --sheet           # a still every 2.5 s, on one sheet

It reuses the text, glow and geometry of render.py, the 30-second film, and
follows storyboard.md. Every frame is a pure function of its time.
"""

import argparse
import functools
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, zoom
from scipy.optimize import linear_sum_assignment

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geometry as G  # noqa: E402
import render as R  # noqa: E402

W, H, SS = R.W, R.H, R.SS
FPS = 60
DURATION = 60.0
FRAMES = int(FPS * DURATION)
RENDERS = R.RENDERS
INK, MUTED, GOLD, SKY, ROSE = R.INK, R.MUTED, R.GOLD, R.SKY, R.ROSE
WARM = (255, 241, 207)
CYAN = (95, 225, 255)
BLUE = (111, 140, 255)
ease, ramp, window, mix, hexrgb, rotate = R.ease, R.ramp, R.window, R.mix, R.hexrgb, R.rotate
PALETTE = [hexrgb(c) for c in R.RINGS]

CAPTIONS = [
    (-1.0, 4.85, 'Unimodular lattices',
     'Whole-number dot products, one point per unit of volume. Up to dimension 7, the only one is ℤⁿ'),
    (5.15, 9.85, 'Dimension 8: E₈',
     '240 spheres touch each one: the densest packing in 8 dimensions (Viazovska, 2016)'),
    (10.15, 14.85, '120 + 128 = 248',
     'The half-integer roots fill the deep holes, and together they make the 248 dimensions '
     'of the E₈ Lie algebra'),
    (15.15, 20.35, 'Dimension 16: two lattices, one sound',
     'Different shapes, identical shell counts: their tori ring alike (Milnor, 1964)'),
    (20.65, 24.85, 'Dimension 24: exactly 24 lattices',
     'Niemeier, 1973. Twenty-three are built from root systems, and one has none'),
    (25.15, 28.85, 'Add one hyperbolic plane, and all 24 become one',
     'N ⊕ U ≅ II₂₅,₁ for every one of them'),
    (29.15, 32.85, 'Then the count explodes',
     'Even lattices: 1, 2 and 24 in dimensions 8, 16 and 24, then over a billion in dimension 32'),
    (33.15, 39.35, 'Back in dimension 24: the Leech lattice',
     'The one with no roots. 196,560 spheres touch each one: the densest packing in 24 dimensions'),
    (39.65, 45.35, 'Add 324, and the j-function appears',
     '196,884 is its first coefficient. The modular group leaves j unchanged, and it tiles the disc below'),
    (45.65, 50.35, 'The Monster fuses three pieces into one',
     'A triality mixes ordinary and twisted string states into 196,883 dimensions '
     '(Frenkel, Lepowsky and Meurman, 1988)'),
    (50.65, 54.35, '196,884 = 1 + 196,883',
     '196,883 = 47 × 59 × 71. Monstrous moonshine: Conway and Norton, 1979, proved by Borcherds, 1992'),
    (54.65, 59.0, 'The same 15 primes, twice',
     "They divide the Monster's order, and they are exactly the primes p where X₀(p)⁺ has genus zero. "
     "Ogg offered a bottle of Jack Daniel's for the reason"),
]

PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71]
MONSTER_PRIMES = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 41, 47, 59, 71}


# ---------------------------------------------------------------- geometry

def rotation(axis, angle):
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    k = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(angle) * k + (1 - math.cos(angle)) * (k @ k)


def grid_screen(points, t):
    """The integer grid on a tilted plane, seen in perspective, with the camera pushing in."""
    yaw = 0.18 + 0.03 * t
    tilt = 0.92
    depth = 9.0 * (1 - 0.14 * ramp(t, 0, 5.2))
    c, s = math.cos(yaw), math.sin(yaw)
    xr = points[:, 0] * c - points[:, 1] * s
    yr = points[:, 0] * s + points[:, 1] * c
    z = depth + yr * math.sin(tilt)
    z = np.maximum(z, 0.5)
    sx = 540 + 504 * xr / z
    sy = 640 - 504 * yr * math.cos(tilt) / z
    size = 5.6 * (9.0 / z) ** 0.9
    blur = np.clip(np.abs(z - depth) / 4.5, 0, 1)
    alpha = np.clip((14.5 - z) / 4.5, 0, 1) ** 1.6 * np.clip((z - 3.2) / 1.6, 0, 1) * np.clip((sy - 230) / 140, 0, 1)
    return sx, sy, size, blur, alpha


@functools.lru_cache(None)
def geo60():
    g = dict(R.geo())
    roots = G.e8_roots()
    simple = G.e8_simple()
    plane, _ = G.coxeter_plane(simple)
    c = np.eye(8)
    for a in simple:
        c = c @ (np.eye(8) - 2 * np.outer(a, a) / (a @ a))
    values, vectors = np.linalg.eig(c)
    k = np.argmin(np.abs(np.angle(values) - 2 * np.pi * 7 / 30))
    n = vectors[:, k].real
    n = n - plane @ n @ plane
    n = n / np.linalg.norm(n)
    p = roots @ plane.T
    rmax = np.hypot(*p.T).max()
    g['e8_3d'] = np.concatenate([p, (roots @ n)[:, None]], 1) / rmax
    g['e8_angle'] = np.arctan2(p[:, 1], p[:, 0])
    i, j = g['e8_edges']
    mid = (g['e8'][i] + g['e8'][j]) / 2
    g['edge_order'] = np.argsort(np.argsort(np.arctan2(mid[:, 1], mid[:, 0])))

    k = np.arange(-18, 19)
    gx, gy = np.meshgrid(k, k)
    grid = np.stack([gx.ravel(), gy.ravel()], 1).astype(float)
    g['tilt_grid'] = grid
    sx, sy, size, blur, alpha = grid_screen(grid, 5.0)
    ok = np.flatnonzero(alpha > 0.5)
    near = ok[np.argsort(np.hypot(sx[ok] - 540, sy[ok] - 640))[:240]]
    tx, ty, _, _ = e8_screen(g, 6.4)
    cost = (sx[near, None] - tx[None, :]) ** 2 + (sy[near, None] - ty[None, :]) ** 2
    a, b = linear_sum_assignment(cost)
    g['tilt_fly'], g['tilt_root'] = near[a], b

    rng = np.random.default_rng(7)
    half = np.flatnonzero(g['e8_half'])
    g['drop_delay'] = dict(zip(half, rng.uniform(0, 1.3, len(half))))
    g['drop_height'] = dict(zip(half, rng.uniform(260, 420, len(half))))
    whole = np.flatnonzero(~g['e8_half'])
    g['light_rank'] = dict(zip(whole[np.argsort(g['e8_angle'][whole])], np.arange(len(whole))))

    stars = 2600
    g['star_angle'] = rng.uniform(0, 2 * np.pi, stars)
    g['star_speed'] = rng.uniform(90, 720, stars) * rng.uniform(0.6, 1.0, stars)
    g['star_swirl'] = rng.normal(0, 0.18, stars)
    g['star_size'] = rng.uniform(1.0, 3.0, stars)
    g['star_colour'] = rng.integers(0, len(PALETTE), stars)
    g['star_phase'] = rng.uniform(0, 2 * np.pi, stars)

    per = 420
    g['fuse_angle'] = [rng.uniform(0, 2 * np.pi, per) for _ in range(3)]
    g['fuse_jitter'] = [rng.normal(0, 7, per) for _ in range(3)]
    return g


def e8_screen(g, t, centre=(540, 615), radius=410.0):
    """E8 in 3D, tumbling, then settling face-on into the Coxeter plane at t = 8."""
    settle = ramp(t, 5.2, 8.0)
    turn = rotation((0.55, 0.75, 0.37), 2.3 * (1 - settle))
    p = g['e8_3d'] @ turn.T
    spin = 0.06 * (t - 8.0)
    c, s = math.cos(spin), math.sin(spin)
    x = p[:, 0] * c - p[:, 1] * s
    y = p[:, 0] * s + p[:, 1] * c
    z = p[:, 2] * (1 - settle) * 0.9
    scale = 3.2 / (3.2 - z)
    return centre[0] + radius * x * scale, centre[1] + radius * y * scale, 6.5 * scale, np.clip(np.abs(z) * 0.9, 0, 1)


def e8_flat(g, t, centre, radius):
    return rotate(g['e8'], 0.06 * (t - 8.0)) * radius + np.array(centre)


def count(t, a, b, start, end, log=False):
    u = ramp(t, start, end)
    if log:
        return int(round(math.exp(math.log(a) + (math.log(b) - math.log(a)) * u)))
    return int(round(a + (b - a) * u))


# ---------------------------------------------------------------- frame

class Frame(R.Frame):
    def __init__(self):
        super().__init__()
        self.soft = []      # (x, y, radius, rgb, alpha): drawn, then blurred
        self.rings = []     # (x, y, radius, rgb, alpha, width): outlines that glow
        self.raster = []    # (rgb, alpha, x, y): images composited over the background

    def shock(self, x, y, t, t0, colour, reach=520, duration=1.0):
        u = (t - t0) / duration
        if 0 <= u <= 1:
            r = 20 + reach * (1 - (1 - u) ** 3)
            self.rings.append((x, y, r, colour, 0.75 * (1 - u) ** 2, 2.5 + 9 * u))


def draw(items, kind):
    im = Image.new('RGB', (W * SS, H * SS), (0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    for item in items:
        if kind == 'ring':
            x, y, r, rgb, alpha, width = item
            d.ellipse((x * SS - r * SS, y * SS - r * SS, x * SS + r * SS, y * SS + r * SS),
                      outline=tuple(int(c) for c in rgb) + (int(255 * min(1, alpha)),), width=max(1, int(width * SS)))
        elif kind == 'line':
            x1, y1, x2, y2, rgb, alpha, width = item
            d.line((x1 * SS, y1 * SS, x2 * SS, y2 * SS), fill=tuple(int(c) for c in rgb) + (int(255 * min(1, alpha)),),
                   width=max(1, int(round(width * SS))))
        else:
            x, y, r, rgb, alpha = item
            r *= SS
            d.ellipse((x * SS - r, y * SS - r, x * SS + r, y * SS + r),
                      fill=tuple(int(c) for c in rgb) + (int(255 * min(1, alpha)),))
    return np.asarray(im.resize((W, H), Image.BOX), np.float32) / 255.0


def compose(fr):
    img = R.background().copy()
    for rgb, alpha, x, y in fr.raster:
        h, w = alpha.shape
        img[y:y + h, x:x + w] = img[y:y + h, x:x + w] * (1 - alpha[..., None]) + rgb * alpha[..., None]
    light = fr.light
    if fr.points:
        light = light + draw(fr.points, 'point')
    if fr.rings:
        light = light + draw(fr.rings, 'ring')
    if fr.soft:
        light = light + gaussian_filter(draw(fr.soft, 'point'), (3.5, 3.5, 0))
    small = light.reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3))
    glow = zoom(gaussian_filter(small, (3.2, 3.2, 0)), (4, 4, 1), order=1)
    light = light + glow * 1.1
    if fr.lines:
        light = light + draw(fr.lines, 'line')
    img = 1.0 - (1.0 - img) * (1.0 - np.clip(light, 0, 1))
    for colour, alpha, x, y, opacity in fr.overlays:
        h, w = alpha.shape
        xa, ya, xb, yb = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
        if xa >= xb or ya >= yb:
            continue
        a = alpha[ya - y:yb - y, xa - x:xb - x] * opacity
        c = colour if np.ndim(colour) == 1 else colour[ya - y:yb - y, xa - x:xb - x]
        img[ya:yb, xa:xb] = img[ya:yb, xa:xb] * (1 - a[..., None]) + c * a[..., None]
    return img


def focus_point(fr, x, y, r, rgb, alpha, blur):
    """A point with depth of field: sharp in focus, a soft disc out of it."""
    if blur < 0.98:
        fr.points.append((x, y, r, rgb, alpha * (1 - blur)))
    if blur > 0.02:
        fr.soft.append((x, y, r * (1 + 2.2 * blur), rgb, alpha * blur * 0.8))


# ---------------------------------------------------------------- scenes

def beat_grid(fr, g, t):
    if t >= 6.4:
        return
    grid = g['tilt_grid']
    sx, sy, size, blur, alpha = grid_screen(grid, t)
    fly = ramp(t, 5.0, 6.4)
    flying = np.zeros(len(grid), bool)
    flying[g['tilt_fly']] = True
    rest = 1 - ramp(t, 4.9, 5.6)
    dist = np.hypot(grid[:, 0], grid[:, 1])
    for i in np.flatnonzero(alpha > 0.01):
        if flying[i] and fly > 0:
            continue
        colour = mix(CYAN, BLUE, min(1.0, dist[i] / 16))
        if not (-30 < sx[i] < W + 30 and -30 < sy[i] < H + 30):
            continue
        focus_point(fr, sx[i], sy[i], size[i], colour, alpha[i] * (1 if flying[i] else rest), blur[i])
    if fly > 0:
        def place(tt):
            gx, gy, gsize, _, _ = grid_screen(grid, tt)
            ex, ey, esize, eblur = e8_screen(g, tt)
            u = ramp(tt, 5.0, 6.4)
            out = []
            for gi, ri in zip(g['tilt_fly'], g['tilt_root']):
                out.append((gx[gi] + (ex[ri] - gx[gi]) * u, gy[gi] + (ey[ri] - gy[gi]) * u,
                            gsize[gi] + (esize[ri] - gsize[gi]) * u, eblur[ri] * u,
                            mix(mix(CYAN, BLUE, min(1.0, dist[gi] / 16)), PALETTE[g['e8_ring'][ri]], u)))
            return out
        for k, fade in ((3, 0.12), (2, 0.22), (1, 0.4)):
            for x, y, r, b, colour in place(t - 0.035 * k):
                fr.points.append((x, y, r * 0.8, colour, fade * math.sin(math.pi * fly)))
        for x, y, r, b, colour in place(t):
            focus_point(fr, x, y, r, colour, 1.0, b)
    cell = (1 - ramp(t, 4.3, 4.9)) * (0.65 + 0.35 * math.sin(2 * math.pi * t / 1.6))
    if cell > 0:
        sq = np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], float)
        cx, cy, _, _, _ = grid_screen(sq, t)
        for a in range(4):
            fr.lines.append((cx[a], cy[a], cx[a + 1], cy[a + 1], GOLD, 0.9 * cell, 2.4))


def beat_e8(fr, g, t):
    """5–15 s: E8 tumbles in 3D, settles into its rosette, then rebuilds from two halves."""
    if t < 6.4 or t >= 15.0:
        return
    if t < 10.0:
        x, y, size, blur = e8_screen(g, t)
        for k in range(240):
            focus_point(fr, x[k], y[k], size[k], PALETTE[g['e8_ring'][k]], 1.0, blur[k])
        fr.shock(540, 615, t, 8.0, WARM, reach=560)
        if t > 8.0:
            p = e8_flat(g, t, (540, 615), 410)
            i, j = g['e8_edges']
            grow = (t - 8.0) / 1.4
            for e in range(len(i)):
                u = min(1.0, max(0.0, grow * 1.25 - g['edge_order'][e] / 6720 * 1.0) / 0.25)
                if u > 0:
                    a, b = p[i[e]], p[j[e]]
                    fr.lines.append((a[0], a[1], a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u,
                                     (190, 212, 245), 0.11 * (1 - 0.4 * ramp(t, 9.4, 10.2)), 1.0))
        return
    # 10–15 s: the two halves.
    move = ramp(t, 10.0, 10.6)
    centre = (540, 615 + (590 - 615) * move)
    radius = 410 + (370 - 410) * move
    p = e8_flat(g, t, centre, radius)
    i, j = g['e8_edges']
    edges = 0.066 * (1 - ramp(t, 10.0, 10.5)) + 0.05 * ramp(t, 13.8, 14.4) * (1 - ramp(t, 14.6, 15.0))
    if edges > 0.003:
        for e in range(len(i)):
            fr.lines.append((*p[i[e]], *p[j[e]], (190, 212, 245), edges, 1.0))
    ghost = 1 - 0.84 * ramp(t, 10.1, 10.5)
    for k in range(240):
        ring = PALETTE[g['e8_ring'][k]]
        if g['e8_half'][k]:
            start = 12.0 + g['drop_delay'][k]
            u = ramp(t, start, start + 0.55)
            if t < start:
                fr.points.append((*p[k], 6.0, ring, ghost * 0.9))
                continue
            x, y = p[k]
            for lag, fade in ((0.09, 0.15), (0.06, 0.25), (0.03, 0.4)):
                ul = ramp(t - lag, start, start + 0.55)
                if 0 < ul < 1:
                    fr.points.append((x, y - g['drop_height'][k] * (1 - ul), 5.0, SKY, fade))
            fr.points.append((x, y - g['drop_height'][k] * (1 - u), 6.0, SKY, max(ghost * 0.9, u)))
        else:
            rank = g['light_rank'][k]
            u = ramp(t, 10.6 + 1.1 * rank / 112, 10.8 + 1.1 * rank / 112)
            fr.points.append((*p[k], 6.0, mix(ring, GOLD, u), max(ghost * 0.9, u)))
    for c in range(8):
        a = 2 * math.pi * c / 8 + 0.06 * (t - 8.0)
        u = ramp(t, 11.2 + 0.05 * c, 11.45 + 0.05 * c)
        if u > 0:
            fr.points.append((centre[0] + 15 * math.cos(a), centre[1] + 15 * math.sin(a), 3.6, GOLD, u))
    fr.shock(centre[0], centre[1], t, 13.8, GOLD, reach=470)
    a = count(t, 0, 120, 10.6, 11.8)
    b = count(t, 0, 128, 12.0, 13.6)
    show_a = ramp(t, 10.5, 10.8)
    show_b = ramp(t, 11.9, 12.2)
    show_c = ramp(t, 13.75, 14.05)
    fr.text_row([(f'{a}', GOLD, show_a), (' + ', INK, show_b), (f'{b}', SKY, show_b), (' = 248', INK, show_c)], 46, 1012)


def beat_sixteen(fr, g, t):
    if t < 15.0 or t > 20.6:
        return
    out = 1 - ramp(t, 20.0, 20.5)
    move = ramp(t, 15.0, 15.9)
    centre = (540 + (290 - 540) * move, 590 + (610 - 590) * move)
    radius = 370 + (205 - 370) * move
    p = e8_flat(g, t, centre, radius)
    q = rotate(g['e8'], 0.06 * (t - 8.0) + math.pi / 30 * move) * radius * (1 - 0.38 * move) + np.array(centre)
    for k in range(240):
        ring = PALETTE[g['e8_ring'][k]]
        family = SKY if g['e8_half'][k] else GOLD
        fr.points.append((*p[k], 6.0 - 1.0 * move, mix(family, ring, move), out))
        if move > 0:
            fr.points.append((*q[k], 5.0 - 0.8 * move, mix(ring, INK, 0.12), move * out))
    grow = ramp(t, 15.45, 16.15)
    d = rotate(g['d16'], -0.05 * (t - 15.0)) * 205 * (0.7 + 0.3 * grow) + np.array((790, 610))
    n = g['d16_ring'].max()
    for k in range(480):
        u = g['d16_ring'][k] / n
        colour = mix(GOLD, hexrgb('#a77bff'), (u - 0.5) * 2) if u > 0.5 else mix(hexrgb('#36d6c3'), GOLD, u * 2)
        fr.points.append((*d[k], 4.4, colour, grow * out))
    for start in np.arange(16.3, 19.6, 0.8):
        u = (t - start) / 1.3
        if 0 <= u <= 1:
            for cx in (290, 790):
                fr.rings.append((cx, 610, 210 + 110 * u, (150, 220, 255), 0.32 * (1 - u) ** 2 * out, 2.0))
    labels = ramp(t, 16.0, 16.6) * out
    fr.text('E₈ ⊕ E₈', 38, INK, 290, 862, labels)
    fr.text('D₁₆⁺', 38, INK, 790, 862, labels)
    a = count(t, 0, 480, 16.6, 17.1)
    b = count(t, 0, 61920, 17.2, 17.8)
    c = count(t, 0, 1050240, 17.8, 18.5)
    for x in (290, 790):
        fr.text_row([(f'{a:,}', GOLD, ramp(t, 16.55, 16.8) * out), (' · ', MUTED, ramp(t, 17.15, 17.4) * out),
                     (f'{b:,}', GOLD, ramp(t, 17.15, 17.4) * out), (' · ', MUTED, ramp(t, 17.75, 18.0) * out),
                     (f'{c:,}', GOLD, ramp(t, 17.75, 18.0) * out), (' · …', MUTED, ramp(t, 18.5, 18.8) * out)],
                    26, 912, centre_x=x)


@functools.lru_cache(None)
def pill(label, gold, sx, sy):
    rgb, a = R.pill_image(label, gold)
    w, h = max(2, int(150 * sx)), max(2, int(62 * sy))
    im = Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    arr = np.asarray(im, np.float32) / 255.0
    return arr[:, :, :3], arr[:, :, 3]


@functools.lru_cache(None)
def big_pill():
    w, h = 300 * SS, 96 * SS
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((SS, SS, w - SS, h - SS), radius=26 * SS, fill=(62, 50, 22, 240), outline=GOLD + (255,),
                        width=3 * SS)
    main, sub = R.font(52), R.font(30)
    mw, sw = main.getlength('II'), sub.getlength('25,1')
    x0 = (w - mw - sw - 4 * SS) / 2
    box = main.getbbox('II')
    y0 = (h - (box[3] - box[1])) / 2 - box[1]
    d.text((x0, y0), 'II', font=main, fill=WARM + (255,))
    d.text((x0 + mw + 4 * SS, y0 + 30 * SS), '25,1', font=sub, fill=WARM + (255,))
    im = im.resize((300, 96), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    return a[:, :, :3], a[:, :, 3]


def beat_niemeier(fr, g, t):
    if t < 20.5 or t > 29.3:
        return
    for i, label in enumerate(R.NIEMEIER):
        x0, y0 = R.pill_xy(i)
        cx, cy = x0 + 75, y0 + 31
        flip = ramp(t, 20.6 + 0.04 * i, 20.95 + 0.04 * i)
        start = 25.2 + 0.025 * i
        for lag, fade in ((0.1, 0.15), (0.05, 0.3), (0.0, 1.0)):
            u = ramp(t - lag, start, start + 1.1)
            if lag > 0 and not 0 < u < 1:
                continue
            u2 = u * u
            x = cx + (540 - cx) * u2
            y = cy + (615 - cy) * u2
            scale = 1 - 0.65 * u2
            opacity = flip * (1 - ramp(u, 0.7, 1.0)) * fade
            if opacity > 0.003:
                sy = max(0.04, flip) * scale
                rgb, a = pill(label, i == 23, round(scale, 2), round(sy, 2))
                fr.overlays.append((rgb, a, int(round(x - a.shape[1] / 2)), int(round(y - a.shape[0] / 2)), opacity))
    flash = (t - 26.5) / 0.7
    if 0 <= flash <= 1:
        fr.soft.append((540, 615, 60 + 180 * flash, WARM, 0.8 * (1 - flash) ** 2))
    fr.shock(540, 615, t, 26.5, GOLD, reach=520)
    show = ramp(t, 26.5, 27.0) * (1 - ramp(t, 29.0, 29.15))
    if show > 0.003:
        rgb, a = big_pill()
        s = 0.6 + 0.4 * ease(min(1.0, (t - 26.5) / 0.5))
        im = Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA')
        im = im.resize((max(2, int(300 * s)), max(2, int(96 * s))), Image.LANCZOS)
        arr = np.asarray(im, np.float32) / 255.0
        fr.overlays.append((arr[:, :, :3], arr[:, :, 3], int(540 - arr.shape[1] / 2), int(615 - arr.shape[0] / 2), show))


def beat_explosion(fr, g, t):
    if t < 29.0 or t > 33.6:
        return
    fr.shock(540, 615, t, 29.0, WARM, reach=600, duration=1.2)
    implode = ramp(t, 32.55, 33.45)
    k = 1.25
    for lag, fade in ((0.08, 0.18), (0.04, 0.35), (0.0, 1.0)):
        tau = max(0.0, t - lag - 29.0)
        r = g['star_speed'] / k * (1 - math.exp(-k * tau)) * (1 - implode) ** 1.6
        a = g['star_angle'] + g['star_swirl'] * tau
        x = 540 + r * np.cos(a)
        y = 615 + r * np.sin(a)
        twinkle = 0.75 + 0.25 * np.sin(g['star_phase'] + 7 * t)
        alpha = ramp(t, 29.0, 29.15) * (1 - ramp(t, 33.1, 33.55)) * fade
        for s in range(len(x)):
            if -10 < x[s] < W + 10 and -10 < y[s] < H + 10:
                fr.points.append((x[s], y[s], g['star_size'][s], PALETTE[g['star_colour'][s]], alpha * twinkle[s]))
    steps = [(29.25, 29.85, 1, 8), (29.85, 30.45, 2, 16), (30.45, 31.05, 24, 24)]
    out = 1 - ramp(t, 32.55, 32.9)
    for a, b, value, dim in steps:
        o = min(ramp(t, a, a + 0.12), 1 - ramp(t, b - 0.06, b + 0.06)) * out
        fr.text(f'{value:,}', 100, INK, 540, 600, o)
        fr.text(f'dimension {dim}', 30, MUTED, 540, 690, o)
    o = ramp(t, 31.0, 31.12) * out
    if o > 0:
        value = count(t, 24, 1_000_000_000, 31.05, 32.1, log=True)
        text = f'{value:,}' + ('+' if t >= 32.1 else '')
        fr.text(text, 100, INK, 540, 600, o)
        fr.text('dimension 32', 30, MUTED, 540, 690, o)


def beat_leech(fr, g, t):
    if t < 33.0 or t > 40.5:
        return
    bloom = ramp(t, 33.2, 34.6)
    leave = ramp(t, 39.5, 40.3)
    bright = bloom * (1 - leave)
    if bright <= 0.003:
        return
    phase = 0.10 * ramp(t, 34.2, 38.2)
    z = (g['z1'] + np.exp(1j * phase) * g['z2']) * np.exp(1j * 0.035 * (t - 33.2))
    r = np.abs(z) / g['zscale']
    z = z / g['zscale'] * 430 * (0.25 + 0.75 * bloom) * (1 - 0.4 * leave)
    x = z.real + 540
    y = z.imag + 615
    stops = np.array([0.0, 0.3, 0.55, 0.8, 1.0])
    cols = np.array([hexrgb(c) for c in ('#fff3c4', '#ffc857', '#ff5fa8', '#a77bff', '#4cc9ff')], np.float32) / 255
    rgb = np.stack([np.interp(r, stops, cols[:, c]) for c in range(3)], 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    acc = np.zeros((3, H * W), np.float32)
    for dx, dy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        idx = yi[ok] * W + xi[ok]
        for c in range(3):
            acc[c] += np.bincount(idx, weights=(wgt * rgb[:, c])[ok], minlength=H * W).astype(np.float32)
    acc = gaussian_filter(acc.reshape(3, H, W).transpose(1, 2, 0), (0.65, 0.65, 0))
    fr.light += (1 - np.exp(-acc * 1.6)) * bright
    fr.text('All 196,560, projected along a 12-fold symmetry of the lattice', 21, MUTED, 540, 1052,
            window(t, 34.6, 39.3, 0.4) * 0.9)


@functools.lru_cache(None)
def sigma3():
    return np.array([sum(d ** 3 for d in range(1, n + 1) if n % d == 0) for n in range(1, 11)], float)


JPAL = np.array([hexrgb(c) for c in ('#4cc9ff', '#a77bff', '#ff5fa8', '#ffc857', '#36d6c3', '#4cc9ff')], float) / 255


def j_disc(radius, shift):
    """Klein's j on the Poincaré disc. Each τ is reduced to the fundamental domain first."""
    rr = int(math.ceil(radius))
    yy, xx = np.mgrid[-rr:rr, -rr:rr].astype(float) + 0.5
    w = (xx - 1j * yy) / radius
    inside = np.abs(w) < 0.999
    w = w[inside]
    tau = 1j * (1 + w) / (1 - w) + shift
    parity = np.zeros(tau.shape, bool)
    for _ in range(80):
        tau = tau - np.round(tau.real)
        m = np.abs(tau) < 1
        if not m.any():
            break
        tau[m] = -1 / tau[m]
        parity[m] ^= True
    big = tau.imag > 3
    q = np.exp(2j * np.pi * np.where(big, 3j, tau))
    s3 = sigma3()
    e4 = 1 + 240 * sum(s3[n - 1] * q ** n for n in range(1, 11))
    delta = q.copy()
    for n in range(1, 11):
        delta *= (1 - q ** n) ** 24
    j = e4 ** 3 / delta
    angle = np.where(big, -2 * np.pi * tau.real, np.angle(j))
    level = np.where(big, 2 * np.pi * tau.imag, np.log(np.abs(j) + 1e-300))
    h = (angle / (2 * np.pi)) % 1.0
    k = h * 5
    i0 = np.minimum(np.floor(k).astype(int), 4)
    f = (k - i0)[:, None]
    sheen = JPAL[i0] * (1 - f) + JPAL[i0 + 1] * f
    base = np.where(parity[:, None], np.array([0.10, 0.13, 0.30]), np.array([0.05, 0.20, 0.24]))
    near = np.exp(-np.clip(level, 0, None) / 18.0)[:, None]
    d = np.minimum(np.abs(tau) - 1, 0.5 - np.abs(tau.real))
    edge = np.exp(-(d / 0.010) ** 2)[:, None]
    halo = np.exp(-(d / 0.05) ** 2)[:, None]
    fade = (np.clip((1 - np.abs(w)) / 0.16, 0, 1) ** 1.2)[:, None]
    rgb = (base + sheen * 0.5 * near) * (0.35 + 0.65 * fade) + (edge * 0.85 + halo * 0.2) * np.array([0.75, 0.92, 1.0]) * fade
    img = np.zeros((2 * rr, 2 * rr, 3), np.float32)
    img[inside] = np.clip(rgb, 0, 1)
    yy, xx = np.mgrid[-rr:rr, -rr:rr].astype(float) + 0.5
    alpha = np.clip(radius - np.hypot(xx, yy), 0, 1).astype(np.float32)
    return img, alpha


def beat_j(fr, g, t):
    if t < 39.5 or t > 45.6:
        return
    show = ramp(t, 39.8, 40.8) * (1 - ramp(t, 45.0, 45.5))
    if show > 0.003:
        radius = 330 * (0.85 + 0.15 * ramp(t, 39.8, 40.8))
        img, alpha = j_disc(radius, 0.12 * (t - 39.5))
        h, w = alpha.shape
        fr.raster.append((img, alpha * show, 540 - w // 2, 700 - h // 2))
        fr.text('j(τ) on the hyperbolic disc, flowing along τ → τ + t', 21, MUTED, 540, 1052,
                window(t, 41.0, 45.2, 0.4) * 0.9)
    out = 1 - ramp(t, 45.0, 45.5)
    a = ramp(t, 40.0, 40.4) * out
    b = ramp(t, 40.6, 41.0) * out
    c = ramp(t, 41.2, 41.5) * out
    fr.text_row([('196,560', INK, a), (' + 324', INK, b), (' = ', INK, c), ('196,884', GOLD, c)], 68, 262)
    fr.shock(540, 262, t, 41.25, GOLD, reach=430, duration=0.9)
    d = ramp(t, 41.9, 42.4) * out
    fr.text_row([('j(τ) = q⁻¹ + 744 + ', INK, d), ('196,884', GOLD, d), (' q + …', INK, d)], 36, 338)


FUSE = [(170, SKY, 0.35, '299'), (250, ROSE, -0.24, '98,280'), (330, GOLD, 0.16, '98,304')]


def monster_dots(t, scale=1.0):
    dots = []
    for n, radius, colour, speed, step in R.MONSTER:
        k = np.arange(n)
        angle = 2 * np.pi * k / n - np.pi / 2 + speed * (t - 50.5)
        p = np.stack([np.cos(angle), np.sin(angle)], 1) * radius * scale + np.array((540, 630))
        dots.append((n, p, colour, step, radius * scale))
    return dots


def beat_fusion(fr, g, t):
    if t < 45.5 or t > 51.6:
        return
    appear = ramp(t, 45.6, 46.4)
    braid = ramp(t, 47.6, 49.4)
    collapse = ramp(t, 50.5, 51.5)
    targets = np.concatenate([p for _, p, _, _, _ in monster_dots(t)])
    index = 0
    for band, (radius, colour, speed, label) in enumerate(FUSE):
        theta0 = g['fuse_angle'][band]
        jitter = g['fuse_jitter'][band]
        tt = t - 45.5
        theta = theta0 + speed * tt * (1 - braid) + 0.22 * tt * braid
        r = ((1 - braid) * (radius + jitter) * (0.85 + 0.15 * appear)
             + braid * (280 + 8 * np.sin(5 * theta))
             + 70 * math.sin(math.pi * braid) * np.sin(3 * theta + 2 * math.pi * band / 3))
        x = 540 + r * np.cos(theta)
        y = 630 + r * np.sin(theta)
        c = mix(colour, WARM, braid)
        for s in range(len(x)):
            px, py = x[s], y[s]
            if collapse > 0:
                tx, ty = targets[index % len(targets)]
                px, py = px + (tx - px) * collapse, py + (ty - py) * collapse
            fr.points.append((px, py, 2.2 + 1.2 * collapse, c, appear * (1 - 0.6 * collapse) * (1 - ramp(t, 51.3, 51.6))))
            index += 1
        lo = ramp(t, 46.2, 46.8) * (1 - ramp(t, 47.6, 48.2))
        a = -0.5
        fr.text(label, 26, colour, 540 + (radius + 36) * math.cos(a), 630 + (radius + 36) * math.sin(a), lo)
    one = ramp(t, 46.4, 46.8) * (1 - ramp(t, 49.4, 49.9))
    if one > 0:
        fr.points.append((540, 630, 7, WARM, one))
        fr.text('1', 30, WARM, 568, 604, one)
    fr.shock(540, 630, t, 49.4, WARM, reach=480)


def beat_monster(fr, g, t):
    if t < 49.5:
        return
    shrink = 1 - 0.22 * ramp(t, 54.5, 55.3)
    if t >= 51.3:
        dots = monster_dots(t, shrink)
        for n, p, colour, step, radius in dots:
            offset = {47: 0.0, 59: 0.15, 71: 0.3}[n]
            chords = ramp(t, 51.3 + offset, 52.3 + offset)
            for i in range(n):
                j = (i + step) % n
                fr.lines.append((*p[i], *p[j], colour, 0.16 * chords, 1.2))
            for i in range(n):
                fr.points.append((*p[i], 6.0 * (0.8 + 0.2 * shrink), colour, ramp(t, 51.3, 51.5)))
            la = -math.pi / 2 - 0.42
            fr.text(str(n), 24, colour, 540 + (radius + 26) * math.cos(la), 630 + (radius + 26) * math.sin(la),
                    ramp(t, 51.6 + offset, 52.1 + offset) * (1 - ramp(t, 54.5, 55.0)))
    fr.text('196,883', 80, INK, 540, 605, ramp(t, 49.6, 50.1))
    fr.text('47 × 59 × 71', 40, MUTED, 540, 690, ramp(t, 51.2, 51.7))
    for k, p in enumerate(PRIMES):
        a = -math.pi / 2 + 2 * math.pi * k / len(PRIMES)
        x, y = 540 + 405 * math.cos(a), 630 + 405 * math.sin(a)
        show = ramp(t, 55.0 + 0.06 * k, 55.2 + 0.06 * k)
        if p in MONSTER_PRIMES:
            rank = sorted(MONSTER_PRIMES).index(p)
            lit = ramp(t, 56.3 + 0.08 * rank, 56.5 + 0.08 * rank)
            if lit > 0:
                fr.soft.append((x, y, 20, GOLD, 0.2 * lit))
            fr.text(str(p), 30, mix(MUTED, WARM, lit), x, y, show * (0.55 + 0.45 * lit))
            fr.shock(x, y, t, 56.3 + 0.08 * rank, GOLD, reach=60, duration=0.6)
        else:
            fr.text(str(p), 30, MUTED, x, y, show * 0.4)


def captions(fr, t):
    for start, end, main, sub in CAPTIONS:
        o = window(t, start, end, 0.35)
        if o <= 0.003:
            continue
        lines = R.wrap(main, 44, 960)
        for i, line in enumerate(lines):
            fr.text(line, 44, INK, 540, 66 + 52 * i, o)
        y = 118 + 52 * (len(lines) - 1)
        for i, line in enumerate(R.wrap(sub, 26, 900)):
            fr.text(line, 26, MUTED, 540, y + 34 * i, o)


def scene(t):
    g = geo60()
    fr = Frame()
    beat_grid(fr, g, t)
    beat_e8(fr, g, t)
    beat_sixteen(fr, g, t)
    beat_niemeier(fr, g, t)
    beat_explosion(fr, g, t)
    beat_leech(fr, g, t)
    beat_j(fr, g, t)
    beat_fusion(fr, g, t)
    beat_monster(fr, g, t)
    captions(fr, t)
    return compose(fr)


def frame(t):
    img = scene(t)
    loop = ramp(t, 59.0, 60.0)
    if loop > 0:
        img = img * (1 - loop) + scene(t - DURATION) * loop
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def frame_bytes(n):
    return frame(n / FPS).tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='comma-separated times in seconds')
    ap.add_argument('--sheet', action='store_true', help='a still every 2.5 s on one sheet')
    ap.add_argument('--out', default=os.path.join(RENDERS, 'unimodular-lattices-v2.mp4'))
    args = ap.parse_args()
    os.makedirs(RENDERS, exist_ok=True)
    workers = min(10, os.cpu_count() or 4)

    if args.stills:
        times = [float(s) for s in args.stills.split(',')]
        with Pool(workers) as pool:
            images = pool.map(frame, times)
        for s, im in zip(times, images):
            path = os.path.join(RENDERS, f'still60-{s:05.2f}.png')
            Image.fromarray(im).save(path)
            print(path)
        return

    if args.sheet:
        times = np.arange(1.25, DURATION, 2.5)
        with Pool(workers) as pool:
            images = pool.map(frame, times)
        tile, cols = 270, 6
        rows = math.ceil(len(images) / cols)
        sheet = Image.new('RGB', (cols * tile, rows * tile), (8, 10, 14))
        for i, im in enumerate(images):
            sheet.paste(Image.fromarray(im).resize((tile - 6, tile - 6), Image.LANCZOS),
                        ((i % cols) * tile + 3, (i // cols) * tile + 3))
        path = os.path.join(RENDERS, 'sheet60.png')
        sheet.save(path)
        print(path)
        return

    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-framerate', str(FPS), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
           '-g', str(2 * FPS), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
           '-movflags', '+faststart', args.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(workers) as pool:
        for n, data in enumerate(pool.imap(frame_bytes, range(FRAMES), chunksize=4)):
            ff.stdin.write(data)
            if n % 300 == 0:
                print(f'frame {n}/{FRAMES}', flush=True)
    ff.stdin.close()
    ff.wait()
    first, after_last = frame(0.0), frame(DURATION)
    print('loop check: max difference between the first frame and the frame after the last =',
          int(np.abs(first.astype(int) - after_last.astype(int)).max()))
    print(args.out)


if __name__ == '__main__':
    main()
