"""Count the ways the hat's shape can change while the hat tiling stays a
tiling: linearise every corner match and find the null space.

Unknowns: each hat's shift (2) and turn (1), and the prototype's corners
1..13 (corner 0 stays at the origin). A hat's corner u sits at
t + R M c_u, where R turns by the hat's angle and M reflects mirrored hats.
Expected null space: shifting the plane (2), turning it (1), turning the
prototype while every hat turns back (1), and the Tile(a, b) family (2,
counting size). Anything above 6 would be a new way to reshape the hat."""
import json, os, subprocess, sys
import numpy as np
from scipy.sparse import lil_matrix

# Usage: python3 rigidity.py [level], default 3. Needs numpy and scipy.
level = sys.argv[1] if len(sys.argv) > 1 else '3'
here = os.path.dirname(os.path.abspath(__file__))
d = json.loads(subprocess.run(['node', os.path.join(here, 'export-patch.js'), level],
                              capture_output=True, text=True, check=True).stdout)
tiles, pairs, proto = d['tiles'], d['pairs'], d['proto']
N = len(tiles)
c = [complex(*p) for p in proto]
nu = 3 * N + 26
def col_t(t): return 3 * t
def col_c(u): return 3 * N + 2 * (u - 1)

def corner_terms(t, u):
    """Linear terms of corner u of hat t, as {col: complex coefficient}."""
    tl = tiles[t]
    R = np.exp(1j * np.pi / 3 * tl['k'])
    mirrored = tl['f'] == 1
    base = R * (c[u].conjugate() if mirrored else c[u])
    terms = {col_t(t): 1 + 0j, col_t(t) + 1: 1j, col_t(t) + 2: 1j * base}
    if u > 0:
        # d(R M c) for a change dc = x + iy in the prototype corner.
        terms[col_c(u)] = R                       # x
        terms[col_c(u) + 1] = R * (-1j if mirrored else 1j)   # y
    return terms

A = lil_matrix((2 * len(pairs), nu))
for e, (t1, u1, t2, u2) in enumerate(pairs):
    for sign, (t, u) in ((1, (t1, u1)), (-1, (t2, u2))):
        for col, z in corner_terms(t, u).items():
            A[2 * e, col] += sign * z.real
            A[2 * e + 1, col] += sign * z.imag
A = A.tocsr()
M = (A.T @ A).toarray()
w = np.linalg.eigvalsh(M)
print('hats', N, 'unknowns', nu, 'equations', A.shape[0])
print('smallest eigenvalues of A^T A:', ' '.join('%.2e' % x for x in w[:10]))
print('null space dimension (eigenvalue < 1e-9):', int((w < 1e-9).sum()))

# The six known motions, built directly, should span the null space.
tr = [complex(*t['tr']) for t in tiles]; T0 = [complex(*t['t']) for t in tiles]
cR = [complex(*p) for p in d['protoR']]
def vec(dt, dphi, dc):
    v = np.zeros(nu)
    for t in range(N):
        v[col_t(t)], v[col_t(t) + 1], v[col_t(t) + 2] = dt(t).real, dt(t).imag, dphi(t)
    for u in range(1, 14):
        v[col_c(u)], v[col_c(u) + 1] = dc(u).real, dc(u).imag
    return v
known = [
    vec(lambda t: 1, lambda t: 0, lambda u: 0),                         # shift x
    vec(lambda t: 1j, lambda t: 0, lambda u: 0),                        # shift y
    vec(lambda t: 1j * T0[t], lambda t: 1, lambda u: 0),                # turn the plane
    vec(lambda t: 0, lambda t: 1 if tiles[t]['f'] else -1, lambda u: 1j * c[u]),   # turn the prototype
    vec(lambda t: T0[t], lambda t: 0, lambda u: c[u]),                  # size
    vec(lambda t: tr[t], lambda t: 0, lambda u: cR[u]),                 # b, the Tile(a, b) family
]
K = np.array(known).T
print('residual |A v| / |v| for each known motion:', ' '.join('%.1e' % (np.linalg.norm(A @ k) / np.linalg.norm(k)) for k in known))
print('rank of the six known motions:', np.linalg.matrix_rank(K))
ev, V = np.linalg.eigh(M)
Z = V[:, :6]
proj = K - Z @ (Z.T @ K)
print('largest part of a known motion outside the null space:', '%.1e' % (np.linalg.norm(proj, axis=0) / np.linalg.norm(K, axis=0)).max())
