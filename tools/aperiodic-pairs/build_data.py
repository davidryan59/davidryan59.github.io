#!/usr/bin/env python3
"""Build app/aperiodic-pairs/data.js: the two datasets the page cannot compute
cheaply in the browser.

* spectre: a level-4 Spectre supertile of 4,401 tiles, from the substitution
  rules of Smith, Myers, Kaplan and Goodman-Strauss, computed exactly in the
  cyclotomic field Q(zeta_12). Each tile is stored as its turn, its mirror
  flag and its position, as integer coordinates in the basis
  1, zeta, zeta^2, zeta^3, doubled. The page splits every corner into its
  even and odd parts, which is what lets it stretch the two edge classes.
* taylor_socolar: a hexagonal patch obeying Socolar and Taylor's rules R1 and
  R2 everywhere, found by a SAT solver. The rules are encoded from the
  prototile of their Fig. 2. As a check of that encoding, every periodic
  torus up to 16 x 32 is unsatisfiable, as the theorem requires.

Run with Python 3.8 or later: python3 tools/aperiodic-pairs/build_data.py
The Taylor-Socolar step needs cryptominisat5 on the PATH.
"""

from __future__ import annotations

import itertools
import json
import os
import shutil
import subprocess
import sys
import tempfile
from fractions import Fraction
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app" / "aperiodic-pairs" / "data.js"


# ---------------------------------------------------------------------------
# Exact arithmetic in Q(zeta), zeta = exp(i pi / 6), zeta^4 = zeta^2 - 1.

class K(NamedTuple):
    a: Fraction
    b: Fraction
    c: Fraction
    d: Fraction

    @staticmethod
    def of(a=0, b=0, c=0, d=0) -> "K":
        return K(Fraction(a), Fraction(b), Fraction(c), Fraction(d))

    def __add__(self, o): return K(self.a + o.a, self.b + o.b, self.c + o.c, self.d + o.d)
    def __sub__(self, o): return K(self.a - o.a, self.b - o.b, self.c - o.c, self.d - o.d)
    def __neg__(self): return K(-self.a, -self.b, -self.c, -self.d)

    def __mul__(self, o):
        c0 = self.a * o.a
        c1 = self.a * o.b + self.b * o.a
        c2 = self.a * o.c + self.b * o.b + self.c * o.a
        c3 = self.a * o.d + self.b * o.c + self.c * o.b + self.d * o.a
        c4 = self.b * o.d + self.c * o.c + self.d * o.b
        c5 = self.c * o.d + self.d * o.c
        c6 = self.d * o.d
        return K(c0 - c4 - c6, c1 - c5, c2 + c4, c3 + c5)

    def scale(self, f): return K(self.a * f, self.b * f, self.c * f, self.d * f)
    def conj(self): return K(self.a + self.c, self.b, -self.c, -self.b - self.d)


ONE = K.of(1)
ZERO = K.of()
ZETA = K.of(0, 1)
I_UNIT = K.of(0, 0, 0, 1)
SQRT3 = K.of(0, 2, 0, -1)
ZETA_POWERS = [ONE]
for _ in range(11):
    ZETA_POWERS.append(ZETA_POWERS[-1] * ZETA)


class Sim(NamedTuple):
    """z -> alpha * (conj z if reflect else z) + beta."""
    alpha: K
    beta: K
    reflect: bool

    def __call__(self, z):
        return self.alpha * (z.conj() if self.reflect else z) + self.beta

    def compose(self, inner):
        ia = inner.alpha.conj() if self.reflect else inner.alpha
        ib = inner.beta.conj() if self.reflect else inner.beta
        return Sim(self.alpha * ia, self.alpha * ib + self.beta, self.reflect != inner.reflect)


IDENT = Sim(ONE, ZERO, False)


def spectre_points():
    h = SQRT3.scale(Fraction(1, 2))
    r = lambda v: K.of(Fraction(v))
    q = Fraction
    raw = [
        (r(0), r(0)), (r(1), r(0)), (r(q(3, 2)), -h), (r(q(3, 2)) + h, r(q(1, 2)) - h),
        (r(q(3, 2)) + h, r(q(3, 2)) - h), (r(q(5, 2)) + h, r(q(3, 2)) - h),
        (r(3) + h, r(q(3, 2))), (r(3), r(2)), (r(3) - h, r(q(3, 2))),
        (r(q(5, 2)) - h, r(q(3, 2)) + h), (r(q(3, 2)) - h, r(q(3, 2)) + h),
        (r(q(1, 2)) - h, r(q(3, 2)) + h), (-h, r(q(3, 2))), (r(0), r(1)),
    ]
    return [x + I_UNIT * y for x, y in raw]


SPECTRE = spectre_points()
SUPER_RULES = {
    "Gamma": ("Pi", "Delta", None, "Theta", "Sigma", "Xi", "Phi", "Gamma"),
    "Delta": ("Xi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Phi", "Gamma"),
    "Theta": ("Psi", "Delta", "Pi", "Phi", "Sigma", "Pi", "Phi", "Gamma"),
    "Lambda": ("Psi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Phi", "Gamma"),
    "Xi": ("Psi", "Delta", "Pi", "Phi", "Sigma", "Psi", "Phi", "Gamma"),
    "Pi": ("Psi", "Delta", "Xi", "Phi", "Sigma", "Psi", "Phi", "Gamma"),
    "Sigma": ("Xi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Lambda", "Gamma"),
    "Phi": ("Psi", "Delta", "Psi", "Phi", "Sigma", "Pi", "Phi", "Gamma"),
    "Psi": ("Psi", "Delta", "Psi", "Phi", "Sigma", "Psi", "Phi", "Gamma"),
}


class Meta:
    def __init__(self, children, quad):
        self.children = children
        self.quad = quad


LEAF = "leaf"


def spectre_system(levels):
    quad = [SPECTRE[3], SPECTRE[5], SPECTRE[7], SPECTRE[11]]
    system = {name: Meta([(IDENT, LEAF)], quad) for name in SUPER_RULES if name != "Gamma"}
    mystic_second = Sim(ONE, SPECTRE[8], False).compose(Sim(ZETA, ZERO, False))
    system["Gamma"] = Meta([(IDENT, LEAF), (mystic_second, LEAF)], quad)
    reflect_x = Sim(K.of(-1), ZERO, True)
    for _ in range(levels):
        quad = system["Delta"].quad
        transforms = [IDENT]
        total, turn, turned = 0, IDENT, list(quad)
        for angle, source, target in ((60, 3, 1), (0, 2, 0), (60, 3, 1), (60, 3, 1), (0, 2, 0), (60, 3, 1), (-120, 3, 3)):
            if angle:
                total += angle
                turn = Sim(ZETA_POWERS[(total // 30) % 12], ZERO, False)
                turned = [turn(p) for p in quad]
            shift = Sim(ONE, transforms[-1](quad[source]) - turned[target], False)
            transforms.append(shift.compose(turn))
        transforms = [reflect_x.compose(t) for t in transforms]
        super_quad = [transforms[6](quad[2]), transforms[5](quad[1]), transforms[3](quad[2]), transforms[0](quad[1])]
        system = {
            name: Meta([(t, system[s]) for s, t in zip(rule, transforms) if s], super_quad)
            for name, rule in SUPER_RULES.items()
        }
    return system["Delta"]


def flatten(node):
    stack = [(node, IDENT)]
    while stack:
        geom, current = stack.pop()
        for transform, child in geom.children:
            combined = current.compose(transform)
            if child == LEAF:
                yield combined
            else:
                stack.append((child, combined))


def doubled_ints(z):
    out = []
    for c in z:
        v = c * 2
        if v.denominator != 1:
            raise ValueError("coordinate is not a half-integer")
        out.append(int(v))
    return out


def spectre_data(levels=4):
    tiles = []
    reference = None
    for t in flatten(spectre_system(levels)):
        k = ZETA_POWERS.index(t.alpha)
        if reference is None:
            reference = t.beta
        tiles.append([k, int(t.reflect)] + doubled_ints(t.beta - reference))
    return {"outline": [doubled_ints(p) for p in SPECTRE], "tiles": tiles}


# ---------------------------------------------------------------------------
# Taylor-Socolar rules on pointy-top hexagons. Vertex j sits at angle
# 90 - 60 j degrees; edge j joins vertex j to vertex j + 1; the neighbour
# across edge j lies in direction 60 - 60 j degrees.

COLOUR = [1, 0, 1, 0, 0, 1]  # half-diameter colour by vertex: 1 red, 0 blue
STRIPE = [0, 1, 3, 3, 5, 0]  # edge j: its black stripe ends next to this vertex
DIRS = [(1, -1), (1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1)]


def features(rotation, mirror):
    colour, stripe = list(COLOUR), list(STRIPE)
    if mirror:
        vmap = lambda v: (-v) % 6
        colour = [1 - COLOUR[(-v) % 6] for v in range(6)]
        new = [None] * 6
        for e in range(6):
            ma, mb = vmap(e), vmap((e + 1) % 6)
            new[mb if (mb + 1) % 6 == ma else ma] = vmap(STRIPE[e])
        stripe = new
    colour = [colour[(v - rotation) % 6] for v in range(6)]
    stripe = [(stripe[(e - rotation) % 6] + rotation) % 6 for e in range(6)]
    return colour, stripe


STATES = [(r, m) for m in (0, 1) for r in range(6)]
FEATURES = [features(r, m) for r, m in STATES]


def r1_ok(sx, sy, k):
    ex, ey = FEATURES[sx][1][k], FEATURES[sy][1][(k + 3) % 6]
    return (ex == k and ey == (k + 4) % 6) or (ex == (k + 1) % 6 and ey == (k + 3) % 6)


def r2_ok(sp, sq, k):
    return FEATURES[sp][0][(k + 2) % 6] != FEATURES[sq][0][(k - 1) % 6]


def solve(cells, neighbour):
    solver = shutil.which("cryptominisat5")
    if solver is None:
        raise SystemExit("cryptominisat5 is not on the PATH")
    index = {c: i for i, c in enumerate(cells)}
    var = lambda i, s: i * 12 + s + 1
    clauses = []
    for i in range(len(cells)):
        lits = [var(i, s) for s in range(12)]
        clauses.append(lits)
        clauses += [[-a, -b] for a, b in itertools.combinations(lits, 2)]
    for c in cells:
        for k in range(6):
            y = neighbour(c, k)
            if y is not None:
                for sx in range(12):
                    clauses.append([-var(index[c], sx)] + [var(index[y], sy) for sy in range(12) if r1_ok(sx, sy, k)])
            zp, zq = neighbour(c, (k - 1) % 6), neighbour(c, (k + 1) % 6)
            if zp is not None and zq is not None:
                for sp in range(12):
                    clauses.append([-var(index[zp], sp)] + [var(index[zq], sq) for sq in range(12) if r2_ok(sp, sq, k)])
    with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as handle:
        handle.write(f"p cnf {len(cells) * 12} {len(clauses)}\n")
        for clause in clauses:
            handle.write(" ".join(map(str, clause)) + " 0\n")
        name = handle.name
    out = subprocess.run([solver, "--verb", "0", name], capture_output=True, text=True).stdout
    os.unlink(name)
    if "s UNSATISFIABLE" in out:
        return None
    values = {int(t) for line in out.splitlines() if line.startswith("v ") for t in line[2:].split() if int(t) > 0}
    return {c: STATES[s] for c in cells for s in range(12) if var(index[c], s) in values}


def torus(n, m):
    cells = [(q, r) for q in range(n) for r in range(m)]
    return solve(cells, lambda c, k: ((c[0] + DIRS[k][0]) % n, (c[1] + DIRS[k][1]) % m))


def hex_region(radius):
    cells = [(q, r) for q in range(-radius, radius + 1) for r in range(-radius, radius + 1) if abs(q + r) <= radius]
    present = set(cells)

    def neighbour(c, k):
        y = (c[0] + DIRS[k][0], c[1] + DIRS[k][1])
        return y if y in present else None

    return solve(cells, neighbour)


def taylor_socolar_data(radius=12):
    for n in (1, 2, 3, 4, 6, 8, 16):
        for m in (n, 2 * n):
            if torus(n, m) is not None:
                raise SystemExit(f"a periodic {n} x {m} torus satisfies the rules: the encoding is wrong")
    solution = hex_region(radius)
    if solution is None:
        raise SystemExit("no patch found")
    return [[q, r, s[0], s[1]] for (q, r), s in sorted(solution.items())]


def main():
    data = {"spectre": spectre_data(4), "taylorSocolar": taylor_socolar_data(12)}
    text = json.dumps(data, separators=(",", ":"))
    OUT.write_text(
        "/* Generated by tools/aperiodic-pairs/build_data.py. Do not edit by hand. */\n"
        f"window.PAIRS_DATA = {text};\n"
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(data['spectre']['tiles'])} Spectre tiles, "
          f"{len(data['taylorSocolar'])} Taylor-Socolar hexagons")


if __name__ == "__main__":
    main()
