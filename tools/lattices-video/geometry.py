"""Lattice geometry for the unimodular lattices video.

Every point set here is computed from the mathematics: the E8 and D16 roots,
their Coxeter-plane projections, and the 196,560 minimal vectors of the Leech
lattice built from the cyclic Golay code.
"""

from itertools import combinations, product

import numpy as np


def coxeter_plane(simple):
    """Orthonormal basis of the plane on which the Coxeter element turns by 2π/h."""
    n = simple.shape[1]
    c = np.eye(n)
    for a in simple:
        c = c @ (np.eye(n) - 2 * np.outer(a, a) / (a @ a))
    values, vectors = np.linalg.eig(c)
    angles = np.angle(values)
    k = np.argmin(np.where(angles > 1e-9, angles, np.inf))
    v = vectors[:, k]
    u, w = v.real, v.imag
    u = u / np.linalg.norm(u)
    w = w - (w @ u) * u
    w = w / np.linalg.norm(w)
    h = round(2 * np.pi / angles[k])
    return np.stack([u, w]), h


def e8_roots():
    roots = []
    for i, j in combinations(range(8), 2):
        for si, sj in product((1, -1), repeat=2):
            x = np.zeros(8)
            x[i], x[j] = si, sj
            roots.append(x)
    for signs in product((0.5, -0.5), repeat=8):
        if sum(s < 0 for s in signs) % 2 == 0:
            roots.append(np.array(signs))
    return np.array(roots)


def e8_simple():
    e = np.eye(8)
    simple = [np.array([0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5]), e[0] + e[1]]
    simple += [e[i] - e[i - 1] for i in range(1, 7)]
    return np.array(simple)


def d16_roots():
    roots = []
    for i, j in combinations(range(16), 2):
        for si, sj in product((1, -1), repeat=2):
            x = np.zeros(16)
            x[i], x[j] = si, sj
            roots.append(x)
    return np.array(roots)


def d16_simple():
    e = np.eye(16)
    simple = [e[i] - e[i + 1] for i in range(15)] + [e[14] + e[15]]
    return np.array(simple)


def golay_code():
    """Extended binary Golay code: the cyclic [23,12] code plus a parity bit."""
    g = [1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1]
    rows = []
    for s in range(12):
        w = [0] * 23
        for i, c in enumerate(g):
            w[(i + s) % 23] ^= c
        rows.append(w + [sum(w) % 2])
    rows = np.array(rows)
    bits = np.array(list(product((0, 1), repeat=12)))
    return (bits @ rows) % 2


def leech_minimal():
    """The 196,560 minimal vectors, as integer vectors x with x/√8 in the lattice."""
    code = golay_code()
    vectors = []
    for i, j in combinations(range(24), 2):
        for si, sj in product((4, -4), repeat=2):
            x = np.zeros(24, int)
            x[i], x[j] = si, sj
            vectors.append(x)
    octads = code[code.sum(1) == 8]
    for o in octads:
        pos = np.flatnonzero(o)
        for signs in product((2, -2), repeat=8):
            if sum(s < 0 for s in signs) % 2 == 0:
                x = np.zeros(24, int)
                x[pos] = signs
                vectors.append(x)
    odd = []
    for c in code:
        base = np.where(c == 1, -1, 1)
        for i in range(24):
            x = base.copy()
            x[i] = -3 * x[i]
            odd.append(x)
    odd = np.array(odd)
    # Keep the odd vectors whose difference from (-3, 1^23) lies in the even part.
    d = odd - np.array([-3] + [1] * 23)
    half = (d // 2) % 2
    codeset = {tuple(c) for c in code}
    keep = [k for k in range(len(odd)) if tuple(half[k]) in codeset and d[k].sum() % 8 == 0]
    vectors = np.concatenate([np.array(vectors), odd[keep]])
    assert len(vectors) == 196560
    return vectors


# A Möbius map of PSL2(23) on the coordinates 0..22 and ∞ (index 23). It has
# order 12, two 12-cycles, and it preserves the Golay code, so it is a symmetry
# of the Leech lattice. Found by searching all of PSL2(23).
ORDER_12 = [1, 4, 21, 13, 11, 8, 3, 16, 9, 23, 14, 7, 20, 15, 12, 10, 2, 19, 22, 6, 18, 5, 17, 0]


def cycles(perm):
    seen, out = set(), []
    for s in range(len(perm)):
        if s not in seen:
            cycle, x = [s], perm[s]
            seen.add(s)
            while x != s:
                cycle.append(x)
                seen.add(x)
                x = perm[x]
            out.append(cycle)
    return out


def leech_order12(vectors):
    """Complex coordinates z1, z2 of each vector on the two 12-cycles.

    Any z1 + c·z2 lies in the e^(2πi/12) eigenspace of the symmetry, so its
    picture has exact 12-fold rotational symmetry for every complex c.
    """
    code = golay_code()
    codeset = {tuple(c) for c in code}
    for row in code[[1 << k for k in range(12)]]:
        moved = np.zeros(24, int)
        moved[ORDER_12] = row
        assert tuple(moved) in codeset
    a, b = cycles(ORDER_12)
    assert len(a) == len(b) == 12
    zeta = np.exp(2j * np.pi * np.arange(12) / 12)
    return vectors[:, a] @ zeta, vectors[:, b] @ zeta


def rings(radii, tol=1e-6):
    """Index of each point's ring, numbered from the outside in."""
    levels = []
    for r in sorted(radii, reverse=True):
        if not levels or abs(levels[-1] - r) > tol:
            levels.append(r)
    return np.array([min(range(len(levels)), key=lambda i: abs(levels[i] - r)) for r in radii])
