"""Render the 30-second unimodular lattices video: 1080 × 1080, 60 fps, silent.

    python3 tools/lattices-video/render.py                  # the video
    python3 tools/lattices-video/render.py --stills 5,12.5  # stills at chosen seconds
    python3 tools/lattices-video/render.py --sheet          # a still every 1.5 s, on one sheet

Every frame is a pure function of its time, so frames render in parallel.
"""

import argparse
import functools
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, zoom
from scipy.optimize import linear_sum_assignment

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geometry as G  # noqa: E402

RENDERS = os.path.join(HERE, 'renders')
W = H = 1080
SS = 2                      # supersampling for discs, lines and text
FPS = 60
DURATION = 30.0
FRAMES = int(FPS * DURATION)
FONT = '/System/Library/Fonts/Supplemental/STIXTwoMath.otf'

INK = (245, 243, 236)
MUTED = (178, 173, 162)
GOLD = (255, 200, 87)
SKY = (76, 201, 255)
ROSE = (255, 95, 168)
RINGS = ['#36d6c3', '#4cc9ff', '#6f8cff', '#a77bff', '#e86bff', '#ff5fa8', '#ff8a5c', '#ffc857']
CENTRE = (540, 615)

CAPTIONS = [
    (-1.0, 3.8, 'Unimodular lattices',
     'Whole-number dot products, one point per unit of volume. Up to dimension 7, the only one is ℤⁿ'),
    (4.3, 7.3, 'Dimension 8: E₈',
     '240 spheres touch each one: the densest packing in 8 dimensions (Viazovska, 2016)'),
    (7.5, 10.1, '112 + 128 = 240',
     'The 128 half-integer roots sit in the deep holes between the 112 integer ones'),
    (10.4, 14.0, 'Dimension 16: two lattices, one sound',
     'E₈ ⊕ E₈ and D₁₆⁺ have identical shell counts, so their tori ring alike (Milnor, 1964)'),
    (14.4, 17.3, 'Dimension 24: exactly 24 lattices',
     'Niemeier, 1973. Twenty-three are built from root systems'),
    (17.7, 21.0, 'One has no roots: the Leech lattice',
     '196,560 spheres touch each one (Leech, 1967)'),
    (21.3, 24.9, 'Add 324 and the j-function appears',
     '324 = 300 + 24, the vibrations of a string on the Leech torus'),
    (25.3, 29.4, '196,884 = 1 + 196,883',
     '196,883 = 47 × 59 × 71, the smallest non-trivial representation of the Monster group. '
     'Monstrous moonshine (Conway and Norton, 1979)'),
]

NIEMEIER = ['D₂₄', 'D₁₆E₈', 'E₈³', 'A₂₄', 'D₁₂²', 'A₁₇E₇', 'D₁₀E₇²', 'A₁₅D₉', 'D₈³', 'A₁₂²', 'A₁₁D₇E₆', 'E₆⁴',
            'A₉²D₆', 'D₆⁴', 'A₈³', 'A₇²D₅²', 'A₆⁴', 'A₅⁴D₄', 'D₄⁶', 'A₄⁶', 'A₃⁸', 'A₂¹²', 'A₁²⁴', 'Leech']

MONSTER = [(47, 255, SKY, 0.10, 13), (59, 330, ROSE, -0.07, 17), (71, 405, GOLD, 0.05, 21)]


# ---------------------------------------------------------------- timing

def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ramp(t, a, b):
    return ease((t - a) / (b - a))


def window(t, a, b, fade=0.3):
    return min(ramp(t, a, a + fade), 1.0 - ramp(t, b - fade, b))


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, u):
    return tuple(x + (y - x) * u for x, y in zip(a, b))


# ---------------------------------------------------------------- geometry

@functools.lru_cache(None)
def geo():
    g = {}
    roots = G.e8_roots()
    plane, _ = G.coxeter_plane(G.e8_simple())
    p = roots @ plane.T
    r = np.hypot(*p.T)
    g['e8'] = p / r.max()
    g['e8_ring'] = G.rings(r, 1e-4)
    g['e8_half'] = np.abs(roots[:, 0]) == 0.5
    i, j = np.nonzero(np.triu(np.isclose(roots @ roots.T, 1.0)))
    g['e8_edges'] = (i, j)
    assert len(i) == 6720

    d16 = G.d16_roots()
    plane, _ = G.coxeter_plane(G.d16_simple())
    q = d16 @ plane.T
    rq = np.hypot(*q.T)
    g['d16'] = q / rq.max()
    g['d16_ring'] = G.rings(rq, 1e-4)

    vectors = G.leech_minimal()
    z1, z2 = G.leech_order12(vectors / np.sqrt(8))
    g['z1'], g['z2'] = z1, z2
    scale = max(np.percentile(np.abs(z1 + np.exp(1j * ph) * z2), 99.7) for ph in np.linspace(0, np.pi / 12, 5))
    g['zscale'] = scale

    # The integer grid, and the 240 grid points that fly onto the E8 roots.
    k = np.arange(-14, 15)
    gx, gy = np.meshgrid(k, k)
    grid = np.stack([gx.ravel(), gy.ravel()], 1).astype(float)
    g['grid'] = grid
    pos = grid_positions(grid, 3.6)
    target = e8_positions(g, 4.8)
    near = np.argsort(np.hypot(pos[:, 0] - CENTRE[0], pos[:, 1] - CENTRE[1]))[:240]
    cost = ((pos[near, None, :] - target[None, :, :]) ** 2).sum(2)
    a, b = linear_sum_assignment(cost)
    g['fly'] = near[a]          # grid index for each root b
    g['fly_root'] = b
    return g


def grid_positions(grid, t):
    angle = 0.10 + 0.03 * t
    spacing = 56.0 * (1.0 + 0.012 * t)
    c, s = math.cos(angle), math.sin(angle)
    x = (grid[:, 0] * c - grid[:, 1] * s) * spacing + CENTRE[0]
    y = (grid[:, 0] * s + grid[:, 1] * c) * spacing + CENTRE[1]
    return np.stack([x, y], 1)


def rotate(p, angle):
    c, s = math.cos(angle), math.sin(angle)
    return np.stack([p[:, 0] * c - p[:, 1] * s, p[:, 0] * s + p[:, 1] * c], 1)


def e8_positions(g, t, centre=CENTRE, radius=410.0):
    return rotate(g['e8'], 0.06 * (t - 4.8)) * radius + np.array(centre)


# ---------------------------------------------------------------- text

@functools.lru_cache(None)
def font(size):
    return ImageFont.truetype(FONT, size * SS)


@functools.lru_cache(None)
def text_image(text, size, colour):
    f = font(size)
    box = f.getbbox(text)
    w, h = box[2] - box[0] + 8 * SS, box[3] - box[1] + 8 * SS
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).text((4 * SS - box[0], 4 * SS - box[1]), text, font=f, fill=255)
    im = im.resize((w // SS, h // SS), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    return a, np.array(colour, np.float32) / 255.0, f.getlength(text) / SS


def wrap(text, size, width):
    """Greedy wrap, then the narrowest width that keeps the same number of lines, so lines balance."""
    f = font(size)

    def greedy(limit):
        lines, line = [], ''
        for word in text.split(' '):
            trial = (line + ' ' + word).strip()
            if f.getlength(trial) / SS > limit and line:
                lines.append(line)
                line = word
            else:
                line = trial
        return lines + [line]

    count = len(greedy(width))
    lo, hi = 0.0, float(width)
    while hi - lo > 2:
        mid = (lo + hi) / 2
        if len(greedy(mid)) > count:
            lo = mid
        else:
            hi = mid
    return greedy(hi)


@functools.lru_cache(None)
def pill_image(label, gold):
    w, h = 150 * SS, 62 * SS
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    edge = GOLD if gold else (120, 150, 190)
    fill = (60, 48, 20, 235) if gold else (30, 36, 48, 235)
    d.rounded_rectangle((SS, SS, w - SS, h - SS), radius=16 * SS, fill=fill, outline=edge + (255,), width=2 * SS)
    f = font(30)
    box = f.getbbox(label)
    d.text(((w - (box[2] - box[0])) / 2 - box[0], (h - (box[3] - box[1])) / 2 - box[1]), label, font=f,
           fill=(GOLD if gold else INK) + (255,))
    im = im.resize((150, 62), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    return a[:, :, :3], a[:, :, 3]


class Frame:
    def __init__(self):
        self.light = np.zeros((H, W, 3), np.float32)
        self.points = []        # (x, y, radius, rgb, alpha)
        self.lines = []         # (x1, y1, x2, y2, rgb, alpha, width)
        self.overlays = []      # (rgb array or colour, alpha array, x, y, opacity)

    def text(self, text, size, colour, x, y, opacity, anchor='mm'):
        if opacity <= 0.003:
            return
        a, c, length = text_image(text, size, colour)
        h, w = a.shape
        x0 = x - w / 2 if anchor[0] == 'm' else x
        self.overlays.append((c, a, int(round(x0)), int(round(y - h / 2)), opacity))
        return length

    def text_row(self, parts, size, y, centre_x=540):
        """parts: (text, colour, opacity). Lays the parts out as one centred line."""
        widths = [text_image(p[0], size, p[1])[2] for p in parts]
        x = centre_x - sum(widths) / 2
        for (text, colour, opacity), w in zip(parts, widths):
            if opacity > 0.003:
                a, c, _ = text_image(text, size, colour)
                self.overlays.append((c, a, int(round(x - 4)), int(round(y - a.shape[0] / 2)), opacity))
            x += w


# ---------------------------------------------------------------- scenes

def scene_grid(fr, g, t):
    pos = grid_positions(g['grid'], t)
    d = np.hypot(pos[:, 0] - CENTRE[0], pos[:, 1] - CENTRE[1])
    flying = np.zeros(len(pos), bool)
    flying[g['fly']] = True
    fade_rest = 1.0 - ramp(t, 3.55, 4.25)
    fly = ramp(t, 3.6, 4.8)
    targets = e8_positions(g, t)
    for i in range(len(pos)):
        x, y = pos[i]
        if not (-40 < x < W + 40 and 150 < y < H + 40):
            continue
        fall = max(0.0, 1.0 - max(0.0, d[i] - 330) / 260)
        colour = mix(hexrgb('#5fe1ff'), hexrgb('#6f8cff'), min(1.0, d[i] / 600))
        alpha = fall * (1.0 if flying[i] else fade_rest)
        if alpha > 0.01 and not (flying[i] and fly > 0):
            fr.points.append((x, y, 5.2, colour, alpha))
    if fly > 0:
        for gi, ri in zip(g['fly'], g['fly_root']):
            x0, y0 = pos[gi]
            x1, y1 = targets[ri]
            colour0 = mix(hexrgb('#5fe1ff'), hexrgb('#6f8cff'), min(1.0, d[gi] / 600))
            colour1 = hexrgb(RINGS[g['e8_ring'][ri]])
            fr.points.append((x0 + (x1 - x0) * fly, y0 + (y1 - y0) * fly, 5.2 + 1.3 * fly, mix(colour0, colour1, fly), 1.0))
    # One unit cell, outlined in gold.
    cell = 1.0 - ramp(t, 3.0, 3.6)
    if cell > 0:
        sq = np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], float)
        p = grid_positions(sq, t)
        for a, b in zip(p[:-1], p[1:]):
            fr.lines.append((*a, *b, GOLD, 0.85 * cell, 2.2))


def scene_e8(fr, g, t):
    if t < 4.8 or t >= 10.9:
        return
    move = ramp(t, 10.0, 10.9)
    centre = (CENTRE[0] + (290 - CENTRE[0]) * move, CENTRE[1] + (610 - CENTRE[1]) * move)
    radius = 410 + (205 - 410) * move
    p = e8_positions(g, t, centre, radius)
    family = ramp(t, 7.4, 8.1) * (1.0 - ramp(t, 9.9, 10.5))
    edges = ramp(t, 4.9, 5.9) * (1.0 - ramp(t, 9.8, 10.3))
    if edges > 0:
        for a, b in zip(*g['e8_edges']):
            fr.lines.append((*p[a], *p[b], (190, 210, 240), 0.10 * edges, 1.0))
    for k in range(240):
        ring = hexrgb(RINGS[g['e8_ring'][k]])
        fam = SKY if g['e8_half'][k] else GOLD
        fr.points.append((*p[k], 6.5 - 1.5 * move, mix(ring, fam, family), 1.0))
    # The second copy of E8, splitting off to make E8 ⊕ E8.
    if move > 0:
        q = rotate(g['e8'], 0.06 * (t - 4.8) + math.pi / 30 * move) * radius * (1 - 0.38 * move) + np.array(centre)
        for k in range(240):
            colour = mix(hexrgb(RINGS[g['e8_ring'][k]]), INK, 0.12)
            fr.points.append((*q[k], 5.0 - 0.8 * move, colour, move))


def scene_sixteen(fr, g, t):
    if t < 10.0 or t > 14.5:
        return
    out = 1.0 - ramp(t, 13.9, 14.4)
    if t >= 10.9:
        angle = 0.06 * (t - 4.8)
        for centre, scale, alpha in (((290, 610), 1.0, 1.0), ((290, 610), 0.62, 1.0)):
            q = rotate(g['e8'], angle + (math.pi / 30 if scale < 1 else 0)) * 205 * scale + np.array(centre)
            for k in range(240):
                colour = hexrgb(RINGS[g['e8_ring'][k]])
                if scale < 1:
                    colour = mix(colour, INK, 0.12)
                fr.points.append((*q[k], 5.0 if scale == 1 else 4.2, colour, out))
    grow = ramp(t, 10.45, 11.15)
    q = rotate(g['d16'], -0.05 * (t - 10.0)) * 205 * (0.7 + 0.3 * grow) + np.array((790, 610))
    n = g['d16_ring'].max()
    for k in range(480):
        u = g['d16_ring'][k] / n
        colour = mix(hexrgb('#ffc857'), hexrgb('#a77bff'), u) if u > 0.5 else mix(hexrgb('#36d6c3'), hexrgb('#ffc857'), u * 2)
        fr.points.append((*q[k], 4.4, colour, grow * out))
    labels = ramp(t, 10.9, 11.5) * out
    fr.text('E₈ ⊕ E₈', 38, INK, 290, 862, labels)
    fr.text('D₁₆⁺', 38, INK, 790, 862, labels)
    shells = ramp(t, 11.4, 12.0) * out
    for x in (290, 790):
        fr.text('480 · 61,920 · 1,050,240 · …', 26, GOLD, x, 912, shells)


def pill_xy(i):
    row, col = divmod(i, 6)
    return 55 + col * 164, 467 + row * 78


def scene_niemeier(fr, g, t):
    if t < 14.2 or t > 18.3:
        return
    for i, label in enumerate(NIEMEIER):
        leech = i == 23
        show = ramp(t, 14.35 + 0.035 * i, 14.65 + 0.035 * i)
        x, y = pill_xy(i)
        y += 12 * (1 - show)
        if leech:
            go = ramp(t, 16.9, 17.6)
            x = x + (CENTRE[0] - 75 - x) * go
            y = y + (CENTRE[1] - 31 - y) * go
            opacity = show * (1.0 - ramp(t, 17.6, 18.2))
        else:
            opacity = show * (1.0 - ramp(t, 16.8, 17.4))
        if opacity > 0.003:
            rgb, a = pill_image(label, leech)
            fr.overlays.append((rgb, a, int(round(x)), int(round(y)), opacity))


def leech_cloud(fr, g, t):
    if t < 17.4 or t > 25.7:
        return
    bloom = ramp(t, 17.5, 18.9)
    bright = bloom * (1.0 - 0.6 * ramp(t, 21.0, 21.8)) * (1.0 - ramp(t, 24.8, 25.6))
    if bright <= 0.003:
        return
    phase = math.pi / 12 * ramp(t, 18.6, 24.6)
    z = (g['z1'] + np.exp(1j * phase) * g['z2']) * np.exp(1j * 0.035 * (t - 17.5))
    r = np.abs(z) / g['zscale']
    z = z / g['zscale'] * 430 * (0.25 + 0.75 * bloom)
    x = z.real + CENTRE[0]
    y = z.imag + CENTRE[1]
    stops = np.array([0.0, 0.3, 0.55, 0.8, 1.0])
    cols = np.array([hexrgb(c) for c in ('#fff3c4', '#ffc857', '#ff5fa8', '#a77bff', '#4cc9ff')], np.float32) / 255
    rgb = np.stack([np.interp(r, stops, cols[:, c]) for c in range(3)], 1)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    acc = np.zeros((3, H * W), np.float32)
    for dx, dy, wgt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        idx = yi[ok] * W + xi[ok]
        for c in range(3):
            acc[c] += np.bincount(idx, weights=(wgt * rgb[:, c])[ok], minlength=H * W).astype(np.float32)
    acc = acc.reshape(3, H, W).transpose(1, 2, 0)
    acc = gaussian_filter(acc, (0.65, 0.65, 0))
    fr.light += (1.0 - np.exp(-acc * 1.6)) * bright
    note = window(t, 18.6, 24.8, 0.4)
    fr.text('All 196,560, projected along a 12-fold symmetry of the lattice', 21, MUTED, 540, 1048, note * 0.9)


def scene_moonshine(fr, g, t):
    if t < 21.2 or t > 25.3:
        return
    out = 1.0 - ramp(t, 24.7, 25.2)
    a = ramp(t, 21.4, 21.8) * out
    b = ramp(t, 22.0, 22.4) * out
    c = ramp(t, 22.6, 23.0) * out
    fr.text_row([('196,560', INK, a), (' + 324', INK, b), (' = ', INK, c), ('196,884', GOLD, c)], 74, 575)
    d = ramp(t, 23.1, 23.6) * out
    fr.text_row([('j(τ) = q⁻¹ + 744 + ', INK, d), ('196,884', GOLD, d), (' q + …', INK, d)], 40, 690)


def scene_monster(fr, g, t):
    if t < 25.0:
        return
    centre = np.array((540, 630))
    for n, radius, colour, speed, step in MONSTER:
        k = np.arange(n)
        angle = 2 * np.pi * k / n - np.pi / 2 + speed * (t - 25.0)
        p = np.stack([np.cos(angle), np.sin(angle)], 1) * radius + centre
        offset = {47: 0.0, 59: 0.15, 71: 0.3}[n]
        appear = np.array([ramp(t, 25.0 + offset + 1.1 * i / n, 25.25 + offset + 1.1 * i / n) for i in k])
        chords = ramp(t, 26.0 + offset, 27.0 + offset)
        if chords > 0:
            for i in k:
                j = (i + step) % n
                fr.lines.append((*p[i], *p[j], colour, 0.16 * chords, 1.2))
        for i in k:
            if appear[i] > 0:
                fr.points.append((*p[i], 6.0, colour, appear[i]))
        label_angle = -math.pi / 2 - 0.42
        fr.text(str(n), 24, colour, centre[0] + (radius + 26) * math.cos(label_angle),
                centre[1] + (radius + 26) * math.sin(label_angle), ramp(t, 25.6 + offset, 26.1 + offset))
    fr.text('196,883', 80, INK, 540, 605, ramp(t, 25.9, 26.4))
    fr.text('47 × 59 × 71', 40, MUTED, 540, 690, ramp(t, 26.4, 26.9))


def captions(fr, t):
    for start, end, main, sub in CAPTIONS:
        o = window(t, start, end, 0.28)
        if o <= 0.003:
            continue
        fr.text(main, 44, INK, 540, 66, o)
        for i, line in enumerate(wrap(sub, 26, 900)):
            fr.text(line, 26, MUTED, 540, 118 + 34 * i, o)


# ---------------------------------------------------------------- drawing

@functools.lru_cache(None)
def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.hypot(xx - 540, yy - 600) / 760
    inner, mid, outer = (np.array(hexrgb(c), np.float32) / 255 for c in ('#272d3a', '#1b1f28', '#121318'))
    u = np.clip(d / 0.55, 0, 1)[..., None]
    v = np.clip((d - 0.55) / 0.45, 0, 1)[..., None]
    return inner * (1 - u) + mid * u * (1 - v) + outer * v


def draw_layer(items, kind):
    im = Image.new('RGB', (W * SS, H * SS), (0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    for item in items:
        if kind == 'line':
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
    """Points and the Leech cloud glow; lines do not, so dense edge sets stay fine."""
    if fr.points:
        fr.light += draw_layer(fr.points, 'point')
    small = fr.light.reshape(H // 4, 4, W // 4, 4, 3).mean((1, 3))
    glow = zoom(gaussian_filter(small, (3.2, 3.2, 0)), (4, 4, 1), order=1)
    light = fr.light + glow * 1.1
    if fr.lines:
        light = light + draw_layer(fr.lines, 'line')
    img = 1.0 - (1.0 - background()) * (1.0 - np.clip(light, 0, 1))
    for colour, alpha, x, y, opacity in fr.overlays:
        h, w = alpha.shape
        xa, ya, xb, yb = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
        if xa >= xb or ya >= yb:
            continue
        a = alpha[ya - y:yb - y, xa - x:xb - x] * opacity
        c = colour if np.ndim(colour) == 1 else colour[ya - y:yb - y, xa - x:xb - x]
        region = img[ya:yb, xa:xb]
        img[ya:yb, xa:xb] = region * (1 - a[..., None]) + c * a[..., None]
    return img


def scene(t):
    g = geo()
    fr = Frame()
    if t < 4.8:
        scene_grid(fr, g, t)
    scene_e8(fr, g, t)
    scene_sixteen(fr, g, t)
    leech_cloud(fr, g, t)
    scene_monster(fr, g, t)
    scene_niemeier(fr, g, t)
    scene_moonshine(fr, g, t)
    captions(fr, t)
    return compose(fr)


def frame(t):
    img = scene(t)
    loop = ramp(t, 29.4, 30.0)
    if loop > 0:
        img = img * (1 - loop) + scene(t - DURATION) * loop
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def frame_bytes(n):
    return frame(n / FPS).tobytes()


# ---------------------------------------------------------------- output

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='comma-separated times in seconds')
    ap.add_argument('--sheet', action='store_true', help='a still every 1.5 s on one sheet')
    ap.add_argument('--out', default=os.path.join(RENDERS, 'unimodular-lattices.mp4'))
    args = ap.parse_args()
    os.makedirs(RENDERS, exist_ok=True)

    if args.stills:
        for s in args.stills.split(','):
            path = os.path.join(RENDERS, f'still-{float(s):05.2f}.png')
            Image.fromarray(frame(float(s))).save(path)
            print(path)
        return

    if args.sheet:
        times = np.arange(0.75, DURATION, 1.5)
        with Pool(min(10, os.cpu_count() or 4)) as pool:
            images = pool.map(frame, times)
        tile = 270
        cols = 5
        rows = math.ceil(len(images) / cols)
        sheet = Image.new('RGB', (cols * tile, rows * tile), (8, 10, 14))
        for i, im in enumerate(images):
            sheet.paste(Image.fromarray(im).resize((tile - 6, tile - 6), Image.LANCZOS), ((i % cols) * tile + 3, (i // cols) * tile + 3))
        path = os.path.join(RENDERS, 'sheet.png')
        sheet.save(path)
        print(path)
        return

    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-framerate', str(FPS), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
           '-g', str(2 * FPS), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
           '-movflags', '+faststart', args.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(min(10, os.cpu_count() or 4)) as pool:
        for n, data in enumerate(pool.imap(frame_bytes, range(FRAMES), chunksize=4)):
            ff.stdin.write(data)
            if n % 120 == 0:
                print(f'frame {n}/{FRAMES}', flush=True)
    ff.stdin.close()
    ff.wait()
    first = frame(0.0)
    after_last = frame(DURATION)
    print('loop check: max difference between the first frame and the frame after the last =',
          int(np.abs(first.astype(int) - after_last.astype(int)).max()))
    print(args.out)


if __name__ == '__main__':
    main()
