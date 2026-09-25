#!/usr/bin/env python3
"""Condition (R) for the two tiles X(2/7, sqrt3/7) and X(2/7, -sqrt3/7).

Ancillary file for "A two-parameter family of polygonal Spectres". For these
two tiles the apex angle is 120 degrees and b = 2a, and the length argument of
the paper does not separate a red corner of Tile(1,1) from an apex. The paper
proves by hand that every tiling by such a tile is edge-to-edge once each side
of length 2a is cut at its midpoint, so that every tile is a 42-gon with sides
of length a. This file searches all patches around a red corner at which an
apex also lies, and finds that none reaches distance 6a from that corner.

The logic. Suppose a tiling had such a point. Put one of its tiles with the red
corner at the origin, unreflected and in a fixed rotation (reflect and rotate
the whole tiling if needed). The search keeps a patch of tiles and chooses a
patch corner whose full angle is not yet covered. The tile of the tiling next
to the patch across the short side bounding the gap shares that short side, by
the edge-to-edge lemma, so it is one of the placements the search tries. So
the tiles of the tiling form a branch that never dies. Every branch dies, so
there is no such tiling. A placement is rejected only if it overlaps a tile
already placed, or if it completes the angle at the origin without an apex.
Every rejection is confirmed by a second, independent test: a sampled point
inside both tiles for an overlap, and the recorded corners for the origin.

Coordinates. Every side of every tile is u0 * zeta^k, where u0 has length a
and zeta = exp(i pi/6). After dividing by u0, all corners lie in Z[zeta],
stored as integer 4-tuples in the basis 1, zeta, zeta^2, zeta^3. Reflection is
complex conjugation there. The search uses exact arithmetic in Z[sqrt3]. The
file also checks that its two tiles agree exactly with the construction of the
paper, and that the angle sums at a point are the ones it assumes.

Usage:
  python3 search-exceptional-tile.py            # radius 6a, both tiles, all checks
  python3 search-exceptional-tile.py 8          # a larger radius
  python3 search-exceptional-tile.py --control  # red-only starts, which must survive
"""
import math
import sys
from fractions import Fraction as F
from functools import lru_cache
from itertools import combinations_with_replacement

# ---------------------------------------------------------------- Z[zeta]

def zmul(n):
    """Multiply by zeta."""
    return (-n[3], n[0], n[1] + n[3], n[2])

ZP = [(1, 0, 0, 0)]
for _ in range(11):
    ZP.append(zmul(ZP[-1]))
DIRECTION = {v: k for k, v in enumerate(ZP)}


def zrot(n, r):
    for _ in range(r % 12):
        n = zmul(n)
    return n


def zadd(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3])
def zsub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3])
def zconj(n): return (n[0] + n[2], n[1], -n[2], -n[1] - n[3])


def xy(n):
    """Doubled real coordinates: 2x = A1 + B1 sqrt3, 2y = A2 + B2 sqrt3."""
    return (2 * n[0] + n[2], n[1], n[1] + 2 * n[3], n[2])


R3 = math.sqrt(3)


def fxy(n):
    a1, b1, a2, b2 = xy(n)
    return ((a1 + b1 * R3) / 2, (a2 + b2 * R3) / 2)


def sgn(A, B):
    """Sign of A + B sqrt3, exactly."""
    if A >= 0 and B >= 0:
        return 0 if (A == 0 and B == 0) else 1
    if A <= 0 and B <= 0:
        return -1
    if A > 0:
        return 1 if A * A > 3 * B * B else -1
    return 1 if 3 * B * B > A * A else -1


def orient(p, q, r):
    """Sign of cross(q - p, r - p)."""
    ux, uxb, uy, uyb = xy(zsub(q, p))
    vx, vxb, vy, vyb = xy(zsub(r, p))
    A = ux * vy + 3 * uxb * vyb - vx * uy - 3 * vxb * uyb
    B = ux * vyb + uxb * vy - vx * uyb - vxb * uy
    return sgn(A, B)


def dot_sign(u, v):
    ux, uxb, uy, uyb = xy(u)
    vx, vxb, vy, vyb = xy(v)
    A = ux * vx + 3 * uxb * vxb + uy * vy + 3 * uyb * vyb
    B = ux * vxb + uxb * vx + uy * vyb + uyb * vy
    return sgn(A, B)


def ycmp(p, q):
    """Sign of p.y - q.y."""
    _, _, a, b = xy(zsub(p, q))
    return sgn(a, b)


def locate(p, poly):
    """1 if p is strictly inside poly, 0 if on its boundary, -1 if outside."""
    wn = 0
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        o = orient(a, b, p)
        if o == 0 and dot_sign(zsub(a, p), zsub(b, p)) <= 0:
            return 0
        if ycmp(a, p) <= 0:
            if ycmp(b, p) > 0 and o > 0:
                wn += 1
        elif ycmp(b, p) <= 0 and o < 0:
            wn -= 1
    return 1 if wn else -1


def crosses(a, b, c, d):
    """True if segments ab and cd cross at a single interior point of both."""
    o1, o2 = orient(a, b, c), orient(a, b, d)
    if o1 * o2 >= 0:
        return False
    return orient(c, d, a) * orient(c, d, b) < 0

# ---------------------------------------------------------------- the tile

# Directions of the edges e_0 .. e_13 of Tile(1,1), in units of 30 degrees.
EDGE_DIR = [0, 10, 1, 3, 0, 2, 5, 7, 4, 6, 6, 8, 11, 9]
# Interior angles of Tile(1,1) at v_0 .. v_13, in units of 30 degrees.
T_ANGLE = [3, 8, 3, 4, 9, 4, 3, 4, 9, 4, 6, 4, 3, 8]
Q_TYPES = {'R', 'P', 'D'}


def base_tile(sign):
    """The 42 marks of X(2/7, sign*sqrt3/7), anticlockwise, in u0 units.

    Each mark is (position, type, angle in units of 30 degrees). Types: B blue
    corner, V the point v10, R red corner, P bump apex, D dent apex, M midpoint
    of a b-side. With u0 = a*exp(+-i alpha), a-sides point along zeta^e and
    b-sides along zeta^(e -+ 2), where e is the direction of the edge of T.
    """
    marks, dirs = [], []
    s = -2 if sign > 0 else 2
    for i in range(14):
        e = EDGE_DIR[i]
        vt = 'R' if i % 2 else ('V' if i == 10 else 'B')
        marks.append((vt, T_ANGLE[i]))
        if i % 2 == 0:      # a-side first, then the b-side
            apex = ('D', 8) if sign > 0 else ('P', 4)
            marks += [apex, ('M', 6)]
            dirs += [e, (e + s) % 12, (e + s) % 12]
        else:               # b-side first, then the a-side
            apex = ('P', 4) if sign > 0 else ('D', 8)
            marks += [('M', 6), apex]
            dirs += [(e + s) % 12, (e + s) % 12, e]
    pos = [(0, 0, 0, 0)]
    for d in dirs[:-1]:
        pos.append(zadd(pos[-1], ZP[d]))
    assert zadd(pos[-1], ZP[dirs[-1]]) == (0, 0, 0, 0), "tile does not close"
    return pos, [m[0] for m in marks], [m[1] for m in marks]


def mirror(pos, typ, ang):
    """The reflected tile, listed anticlockwise."""
    pos = [zconj(p) for p in pos][::-1]
    return pos, typ[::-1], ang[::-1]


class Shape:
    """One hand of the tile, with its 42 marks and their sectors."""

    def __init__(self, pos, typ, ang):
        n = len(pos)
        self.pos, self.typ, self.ang = pos, typ, ang
        self.cls = ['Q' if t in Q_TYPES else 'K' for t in typ]
        self.out = [DIRECTION[zsub(pos[(k + 1) % n], pos[k])] for k in range(n)]
        for k in range(n):
            back = DIRECTION[zsub(pos[k - 1], pos[k])]
            assert (back - self.out[k]) % 12 == ang[k], ("angle", k, typ[k])
        assert sum(ang) == 6 * (n - 2), "angle sum"
        # simple polygon: no two non-adjacent edges meet
        for i in range(n):
            for j in range(i + 2, n):
                if i == 0 and j == n - 1:
                    continue
                a, b, c, d = pos[i], pos[(i + 1) % n], pos[j], pos[(j + 1) % n]
                assert not crosses(a, b, c, d), "not simple"
                for p, (u, v) in ((a, (c, d)), (b, (c, d)), (c, (a, b)), (d, (a, b))):
                    if orient(u, v, p) == 0 and dot_sign(zsub(u, p), zsub(v, p)) <= 0:
                        assert p in (u, v), "not simple"
        self.rot = [[zrot(p, r) for p in pos] for r in range(12)]

# ---------------------------------------------------------------- vertices

FULL = (1 << 12) - 1
CONFIGS = {'Q': [(4, 4, 4), (4, 8)],
           'K': [(3, 3, 3, 3), (3, 9), (3, 3, 6), (6, 6)]}


def sector(out, ang):
    m = 0
    for i in range(ang):
        m |= 1 << ((out + i) % 12)
    return m


def gaps(mask):
    """Lengths of the maximal runs of free slots around a vertex."""
    if mask == FULL:
        return ()
    start = next(i for i in range(12) if mask >> i & 1)
    out, run = [], 0
    for j in range(1, 13):
        if mask >> ((start + j) % 12) & 1:
            if run:
                out.append(run)
                run = 0
        else:
            run += 1
    return tuple(sorted(out))


@lru_cache(maxsize=None)
def fill(rem, gs):
    """Can the multiset rem be split into groups with sums gs?"""
    if not gs:
        return not rem
    n = len(rem)
    for m in range(1, 1 << n):
        part = [rem[i] for i in range(n) if m >> i & 1]
        if sum(part) != gs[0]:
            continue
        left = list(rem)
        for x in part:
            left.remove(x)
        if fill(tuple(left), gs[1:]):
            return True
    return False


@lru_cache(maxsize=None)
def feasible(cls, angles, mask):
    """Can the angles already at a vertex be completed to a full turn?"""
    for conf in CONFIGS[cls]:
        rem = list(conf)
        try:
            for x in angles:
                rem.remove(x)
        except ValueError:
            continue
        if fill(tuple(sorted(rem)), gaps(mask)):
            return True
    return False

# ---------------------------------------------------------------- the search


class Search:
    def __init__(self, shapes, radius, want_apex):
        self.shapes = shapes            # {'U': Shape, 'R': Shape}
        self.radius = radius
        self.want_apex = want_apex      # True: origin must hold an apex
        self.tiles = []                 # (hand, pts, vset, fpts, box)
        self.V = {}                     # point -> [mask, cls, angles, types]
        self.nodes = 0
        self.empty = 0                  # dead ends where no placement was tried
        self.depth = 0
        self.max_depth = 0
        self.survivor = None

    # --- placing and removing tiles

    def place(self, hand, r, t):
        sh = self.shapes[hand]
        pts = [zadd(t, p) for p in sh.rot[r]]
        vset = set(pts)
        self.why = None
        # vertex bookkeeping
        for k, v in enumerate(pts):
            bits = sector(sh.out[k] + r, sh.ang[k])
            e = self.V.get(v)
            if e is None:
                continue
            if e[1] != sh.cls[k]:
                self.why = ('class', v)
                return False
            if e[0] & bits:
                self.why = ('sector', v)
                return False
            if not feasible(e[1], tuple(sorted(e[2] + [sh.ang[k]])), e[0] | bits):
                self.why = ('count', v, tuple(sorted(e[2] + [sh.ang[k]])), e[0] | bits)
                return False
        # the origin must end up holding an apex (or, for the control, no apex)
        o = self.V.get((0, 0, 0, 0))
        if o is not None:
            k = pts.index((0, 0, 0, 0)) if (0, 0, 0, 0) in vset else None
            types = o[3] + ([sh.typ[k]] if k is not None else [])
            mask = o[0] | (sector(sh.out[k] + r, sh.ang[k]) if k is not None else 0)
            if mask == FULL:
                has_apex = any(x in ('P', 'D') for x in types)
                if has_apex != self.want_apex:
                    self.why = ('origin', tuple(types))
                    return False
        # geometric overlap with nearby tiles
        fpts = [fxy(p) for p in pts]
        box = (min(x for x, _ in fpts) - 1e-6, max(x for x, _ in fpts) + 1e-6,
               min(y for _, y in fpts) - 1e-6, max(y for _, y in fpts) + 1e-6)
        for (_, pts2, vset2, fpts2, box2) in self.tiles:
            if box[1] < box2[0] or box2[1] < box[0] or box[3] < box2[2] or box2[3] < box[2]:
                continue
            if self.overlap(pts, vset, fpts, box, pts2, vset2, fpts2, box2):
                self.why = ('overlap', pts2)
                return False
        # commit
        self.tiles.append((hand, pts, vset, fpts, box))
        for k, v in enumerate(pts):
            bits = sector(sh.out[k] + r, sh.ang[k])
            e = self.V.get(v)
            if e is None:
                self.V[v] = [bits, sh.cls[k], [sh.ang[k]], [sh.typ[k]]]
            else:
                e[0] |= bits
                e[2].append(sh.ang[k])
                e[3].append(sh.typ[k])
        return True

    def remove(self):
        hand, pts, _, _, _ = self.tiles.pop()
        sh = self.shapes[hand]
        # recover r from the first edge direction
        r = (DIRECTION[zsub(pts[1], pts[0])] - sh.out[0]) % 12
        for k, v in enumerate(pts):
            e = self.V[v]
            e[0] &= ~sector(sh.out[k] + r, sh.ang[k])
            e[2].remove(sh.ang[k])
            e[3].remove(sh.typ[k])
            if not e[2]:
                del self.V[v]

    @staticmethod
    def overlap(pts, vset, fpts, box, pts2, vset2, fpts2, box2):
        def inbox(f, b):
            return b[0] <= f[0] <= b[1] and b[2] <= f[1] <= b[3]
        for p, f in zip(pts, fpts):
            if p not in vset2 and inbox(f, box2) and locate(p, pts2) >= 0:
                return True
        for q, f in zip(pts2, fpts2):
            if q not in vset and inbox(f, box) and locate(q, pts) >= 0:
                return True
        n, m = len(pts), len(pts2)
        for i in range(n):
            a, b = pts[i], pts[(i + 1) % n]
            fa, fb = fpts[i], fpts[(i + 1) % n]
            x0, x1 = min(fa[0], fb[0]) - 1e-6, max(fa[0], fb[0]) + 1e-6
            y0, y1 = min(fa[1], fb[1]) - 1e-6, max(fa[1], fb[1]) + 1e-6
            if x1 < box2[0] or box2[1] < x0 or y1 < box2[2] or box2[3] < y0:
                continue
            for j in range(m):
                fc, fd = fpts2[j], fpts2[(j + 1) % m]
                if max(fc[0], fd[0]) < x0 or min(fc[0], fd[0]) > x1:
                    continue
                if max(fc[1], fd[1]) < y0 or min(fc[1], fd[1]) > y1:
                    continue
                if crosses(a, b, pts2[j], pts2[(j + 1) % m]):
                    return True
        return False

    # --- choosing where to extend

    def pick(self):
        best = None
        for v, e in self.V.items():
            if e[0] == FULL:
                continue
            f = fxy(v)
            d = math.hypot(f[0], f[1])
            if d > self.radius:
                continue
            free = 12 - bin(e[0]).count('1')
            key = (v != (0, 0, 0, 0), free, d)
            if best is None or key < best[0]:
                best = (key, v)
        return None if best is None else best[1]

    def candidates(self, v):
        e = self.V[v]
        mask = e[0]
        s0 = next(i for i in range(12)
                  if not mask >> i & 1 and mask >> ((i - 1) % 12) & 1)
        run = 0
        while run < 12 and not mask >> ((s0 + run) % 12) & 1:
            run += 1
        for hand in ('U', 'R'):
            sh = self.shapes[hand]
            for k in range(len(sh.pos)):
                if sh.cls[k] != e[1] or sh.ang[k] > run:
                    continue
                r = (s0 - sh.out[k]) % 12
                t = zsub(v, sh.rot[r][k])
                yield hand, r, t

    def run(self):
        self.nodes += 1
        self.max_depth = max(self.max_depth, len(self.tiles))
        v = self.pick()
        if v is None:
            self.survivor = list(self.tiles)
            return True
        tried = 0
        for hand, r, t in self.candidates(v):
            tried += 1
            if self.place(hand, r, t):
                if self.run():
                    return True
                self.remove()
        self.empty += tried == 0
        return False

# ---------------------------------------------------------------- checks: exact coordinates

class Q3:
    """a + b sqrt3 with rational a, b."""
    def __init__(s, a, b=0): s.a, s.b = F(a), F(b)
    def __add__(s, o): o = o if isinstance(o, Q3) else Q3(o); return Q3(s.a + o.a, s.b + o.b)
    __radd__ = __add__
    def __sub__(s, o): o = o if isinstance(o, Q3) else Q3(o); return Q3(s.a - o.a, s.b - o.b)
    def __rsub__(s, o): return Q3(o) - s
    def __mul__(s, o): o = o if isinstance(o, Q3) else Q3(o); return Q3(s.a*o.a + 3*s.b*o.b, s.a*o.b + s.b*o.a)
    __rmul__ = __mul__
    def __eq__(s, o): o = o if isinstance(o, Q3) else Q3(o); return s.a == o.a and s.b == o.b

H = Q3(0, F(1, 2))                      # sqrt3/2
T = [(Q3(0), Q3(0)), (Q3(1), Q3(0)), (Q3(F(3, 2)), -1*H), (F(3, 2) + H, F(1, 2) - H),
     (F(3, 2) + H, F(3, 2) - H), (F(5, 2) + H, F(3, 2) - H), (3 + H, Q3(F(3, 2))),
     (Q3(3), Q3(2)), (3 - H, Q3(F(3, 2))), (F(5, 2) - H, F(3, 2) + H),
     (F(3, 2) - H, F(3, 2) + H), (F(1, 2) - H, F(3, 2) + H), (-1*H, Q3(F(3, 2))), (Q3(0), Q3(1))]


def construction(sign):
    """Marks of X(2/7, sign sqrt3/7) in the order of search_y.base_tile."""
    p, h = Q3(F(2, 7)), Q3(0, F(sign, 7))
    out = []
    for i in range(14):
        v, w = T[i], T[(i + 1) % 14]
        d = (w[0] - v[0], w[1] - v[1])
        J = (-1 * d[1], d[0])
        def E(u, t): return (v[0] + u*d[0] + t*J[0], v[1] + u*d[1] + t*J[1])
        out.append(v)
        if i % 2 == 0:
            c = E(p, h)
            out += [c, ((c[0] + w[0]) * F(1, 2), (c[1] + w[1]) * F(1, 2))]
        else:
            c = E(1 - p, -1 * h)
            out += [((v[0] + c[0]) * F(1, 2), (v[1] + c[1]) * F(1, 2)), c]
    return out


def from_z(n, sign):
    """Real point u0 * z for z in Z[zeta], u0 = (2 + sign i sqrt3)/7."""
    x2a, x2b, y2a, y2b = xy(n)                  # 2x, 2y of z
    zx, zy = Q3(F(x2a, 2), F(x2b, 2)), Q3(F(y2a, 2), F(y2b, 2))
    ux, uy = Q3(F(2, 7)), Q3(0, F(sign, 7))
    return (ux*zx - uy*zy, ux*zy + uy*zx)


def check_coordinates():
    ok = True
    for sign in (1, -1):
        pos, typ, ang = base_tile(sign)
        want = construction(sign)
        same = all(from_z(p, sign)[0] == w[0] and from_z(p, sign)[1] == w[1]
                   for p, w in zip(pos, want))
        print(f"  {'ok' if same else 'FAIL'}  sign {sign:+d}: the 42 marks match the construction exactly")
        ok &= same
    return ok

# ---------------------------------------------------------------- checks: angle sums

def check_configs():
    found = {'Q': set(), 'K': set(), 'mixed': set()}
    for k in range(1, 5):
        for c in combinations_with_replacement([3, 4, 6, 8, 9], k):
            if sum(c) != 12:
                continue
            q = [x for x in c if x in (4, 8)]
            kk = [x for x in c if x in (3, 6, 9)]
            found['mixed' if q and kk else ('Q' if q else 'K')].add(tuple(sorted(c)))
    ok = (found['mixed'] == set() and found['Q'] == set(CONFIGS['Q'])
          and found['K'] == set(CONFIGS['K']))
    print(f"  {'ok' if ok else 'FAIL'}  angle sums: Q {sorted(found['Q'])}, "
          f"K {sorted(found['K'])}, mixed {sorted(found['mixed'])}")
    return ok

# ---------------------------------------------------------------- checks: every rejection

def inside(pt, poly, margin=1e-7):
    """Float test: pt strictly inside poly and at least margin from its edges."""
    x, y = pt
    n = len(poly)
    wn = False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        t = max(0.0, min(1.0, ((x - x1)*dx + (y - y1)*dy) / (dx*dx + dy*dy)))
        if math.hypot(x - x1 - t*dx, y - y1 - t*dy) < margin:
            return False
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * dx / dy:
            wn = not wn
    return wn


def common_point(A, B, centre=None):
    """A float point strictly inside both polygons, or None."""
    if centre is not None:
        cx, cy = centre
        for r in (0.02, 0.1):
            for j in range(48):
                th = math.pi * (2*j + 1) / 48
                p = (cx + r*math.cos(th), cy + r*math.sin(th))
                if inside(p, A) and inside(p, B):
                    return p
    xs = [x for x, _ in A] + [x for x, _ in B]
    ys = [y for _, y in A] + [y for _, y in B]
    x0, x1 = max(min(x for x, _ in A), min(x for x, _ in B)), min(max(x for x, _ in A), max(x for x, _ in B))
    y0, y1 = max(min(y for _, y in A), min(y for _, y in B)), min(max(y for _, y in A), max(y for _, y in B))
    if x0 > x1 or y0 > y1:
        return None
    steps = 200
    for i in range(steps + 1):
        for j in range(steps + 1):
            p = (x0 + (x1 - x0) * (i + 0.37) / (steps + 1), y0 + (y1 - y0) * (j + 0.61) / (steps + 1))
            if inside(p, A) and inside(p, B):
                return p
    return None


def completable(angles, mask):
    """Brute force: can more angles fill the free slots so the total is allowed?"""
    free = [i for i in range(12) if not mask >> i & 1]
    allowed = set(CONFIGS['Q']) | set(CONFIGS['K'])
    # fill the free slots greedily in every way: walk round the circle
    runs, run = [], 0
    start = next(i for i in range(12) if mask >> i & 1)
    for j in range(1, 13):
        if mask >> ((start + j) % 12) & 1:
            if run:
                runs.append(run)
            run = 0
        else:
            run += 1
    def ways(n):
        if n == 0:
            yield ()
            return
        for a in (3, 4, 6, 8, 9):
            if a <= n:
                for rest in ways(n - a):
                    yield (a,) + rest
    def go(i, acc):
        if i == len(runs):
            return tuple(sorted(acc)) in allowed
        return any(go(i + 1, acc + list(w)) for w in ways(runs[i]))
    return go(0, list(angles))


class Checked(Search):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.log = {}
        self.bad = []

    def place(self, hand, r, t):
        before = [tl[1] for tl in self.tiles]
        okay = super().place(hand, r, t)
        if okay or self.why is None:
            return okay
        kind = self.why[0]
        self.log[kind] = self.log.get(kind, 0) + 1
        sh = self.shapes[hand]
        new = [fxy(zadd(t, p)) for p in sh.rot[r]]
        if kind == 'class':
            return okay                      # a Q-mark on a K-point: impossible by 2
        if kind == 'origin':
            if any(x in ('P', 'D') for x in self.why[1]) == self.want_apex:
                self.bad.append(self.why)
            return okay
        if kind == 'count':
            _, v, angles, mask = self.why
            if completable(angles, mask):
                self.bad.append(self.why)
            return okay
        if kind == 'sector':
            v = self.why[1]
            centre = fxy(v)
            hit = any(common_point(new, [fxy(p) for p in pts], centre)
                      for pts in before if v in pts)
        else:
            hit = common_point(new, [fxy(p) for p in self.why[1]]) is not None
        if not hit:
            self.bad.append((kind, hand, r, t))
        return okay


def check_search(radius):
    ok = True
    for sign in (1, -1):
        pos, typ, ang = base_tile(sign)
        shapes = {'U': Shape(pos, typ, ang), 'R': Shape(*mirror(pos, typ, ang))}
        U = shapes['U']
        total, bad, dead, nodes, empty, big = {}, [], True, 0, 0, 0
        for k in [k for k in range(42) if U.typ[k] == 'R']:
            s = Checked(shapes, radius, want_apex=True)
            assert s.place('U', 0, zsub((0, 0, 0, 0), U.rot[0][k]))
            dead &= not s.run()
            nodes, empty, big = nodes + s.nodes, empty + s.empty, max(big, s.max_depth)
            for key, n in s.log.items():
                total[key] = total.get(key, 0) + n
            bad += s.bad
        good = dead and not bad and not empty
        print(f"  {'ok' if good else 'FAIL'}  sign {sign:+d}: every branch dies; {nodes} patches, "
              f"largest {big} tiles; rejections {dict(sorted(total.items()))}, "
              f"unconfirmed {len(bad)}, dead ends with nothing to try {empty}")
        ok &= good
    return ok


def main():
    args = sys.argv[1:]
    control = '--control' in args
    args = [x for x in args if x != '--control']
    radius = float(args[0]) if args else 6.0
    if control:
        ok = True
        for sign in (1, -1):
            pos, typ, ang = base_tile(sign)
            shapes = {'U': Shape(pos, typ, ang), 'R': Shape(*mirror(pos, typ, ang))}
            U = shapes['U']
            for k in [k for k in range(42) if U.typ[k] == 'R']:
                s = Search(shapes, radius, want_apex=False)
                assert s.place('U', 0, zsub((0, 0, 0, 0), U.rot[0][k]))
                ok &= s.run()
        print(f"control, red corners meeting only red corners, radius {radius}: "
              + ("every start survives, as it must" if ok else "FAIL: a start died"))
        sys.exit(0 if ok else 1)
    print(f"Condition (R) for X(2/7, +-sqrt3/7), searching to radius {radius}a")
    results = [check_coordinates(), check_configs(), check_search(radius)]
    print("PASS" if all(results) else "FAIL")
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
