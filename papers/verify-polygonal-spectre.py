#!/usr/bin/env python3
"""Exact checks for the polygonal Spectre X(p, h).

Ancillary file for "A two-parameter family of polygonal Spectres" by David
Ryan. The default tile X(29/50, 13/50) is the Triangle edge, Single
arrangement, of the Spectre viewer at https://drbuild.uk/tiles.

X(p, h) replaces each unit edge of Tile(1,1) by a triangle: the polyline
(0,0), (p,h), (1,0) on even edges and its half turn (0,0), (1-p,-h), (1,0) on
odd edges, in edge coordinates (u along the edge, w towards the tile's inside).

The paper uses these facts about one tile; numbers refer to the paper.

  1. Tile(1,1) is counterclockwise with 14 unit edges; corners with even index
     have angles that are multiples of 90 degrees, odd ones multiples of 120.
  2. Lemma 3.4(1): at each original corner, X turns exactly as Tile(1,1) does.
  3. Lemma 3.4(3): both X-segments at an even corner have length^2 p^2+h^2 (a^2),
     both at an odd corner (1-p)^2+h^2 (b^2).
  4. Condition (N): for rational p, h, tan(alpha+beta) = h/(p(1-p)-h^2) is
     rational, while the four apex angles of Lemma 3.3(2) have irrational
     tan(pi - phi). So (N) holds for every rational tile with phi > pi/3.
  5. Proposition 3.2, condition (G): delta^2 = 6 - 3 sqrt 3; dents lie strictly inside Tile(1,1), bumps strictly
     outside, each slanted side meets the boundary of Tile(1,1) only at its
     own base corner, and triangles on the same side are pairwise disjoint.

Checks on the whole family, run every time:

  6. Lemma 3.3(2) and Table 2: with phi > pi/3, the angle sums at a point that
     put a red corner with an apex occur only for phi = 75, 80, 120, 150
     degrees, exactly as listed. Fact (F4) of Proposition 4.2: at those four
     angles, an apex meets a blue corner only in a row of Table 2. For
     phi = 150, two apexes at a point are a bump and a dent.
  7. Lemma 3.5: no rotation or reversal of the 27 corners keeps their angles,
     for generic phi and for phi = 90 and 120.
  8. Proposition 4.2: for phi = 75 and 80, the heights where a = b or b = 2a
     exceed delta/2 (floating point, with a margin above 0.009).
  9. Proposition 4.2: X(2/7, sqrt3/7) has a^2 = 1/7, b^2 = 4/7 and apex angle
     exactly 120 degrees.

All arithmetic is exact, in Q(sqrt 3) with rational p and h. Nothing is
floating point except the printed approximations.

Usage:
  python3 verify-polygonal-spectre.py                 # p = 29/50, h = 13/50
  python3 verify-polygonal-spectre.py 1/2 1/20        # any rational p, h
  python3 verify-polygonal-spectre.py --limit 29/50   # largest |h| passing (G)
  python3 verify-polygonal-spectre.py --svg out.svg   # draw the tile
"""
import sys, math
from fractions import Fraction as F


class Q3:
    """a + b*sqrt(3) with rational a, b."""
    __slots__ = ('a', 'b')

    def __init__(self, a, b=0):
        self.a, self.b = F(a), F(b)

    def __add__(s, o): o = lift(o); return Q3(s.a + o.a, s.b + o.b)
    __radd__ = __add__
    def __sub__(s, o): o = lift(o); return Q3(s.a - o.a, s.b - o.b)
    def __rsub__(s, o): return lift(o) - s
    def __neg__(s): return Q3(-s.a, -s.b)
    def __mul__(s, o): o = lift(o); return Q3(s.a*o.a + 3*s.b*o.b, s.a*o.b + s.b*o.a)
    __rmul__ = __mul__

    def __truediv__(s, o):
        o = lift(o); n = o.a*o.a - 3*o.b*o.b
        if n == 0: raise ZeroDivisionError
        return s * Q3(o.a/n, -o.b/n)

    def sign(s):
        a, b = s.a, s.b
        if b == 0: return (a > 0) - (a < 0)
        if a == 0: return (b > 0) - (b < 0)
        if (a > 0) == (b > 0): return 1 if a > 0 else -1
        # opposite signs: |a| versus |b| sqrt 3, never equal for rationals
        return (1 if a > 0 else -1) if a*a > 3*b*b else (1 if b > 0 else -1)

    def __eq__(s, o): o = lift(o); return s.a == o.a and s.b == o.b
    def __hash__(s): return hash((s.a, s.b))
    def __float__(s): return float(s.a) + float(s.b)*math.sqrt(3)
    def __repr__(s): return f"{s.a}+{s.b}r3"


def lift(x): return x if isinstance(x, Q3) else Q3(x)


R3H = Q3(0, F(1, 2))   # sqrt(3)/2
HALF = F(1, 2)

# Tile(1,1), counterclockwise, exactly as in demos/spectre/tiling.js.
T = [(Q3(0), Q3(0)), (Q3(1), Q3(0)), (Q3(F(3, 2)), -R3H),
     (F(3, 2) + R3H, HALF - R3H), (F(3, 2) + R3H, F(3, 2) - R3H),
     (F(5, 2) + R3H, F(3, 2) - R3H), (3 + R3H, Q3(F(3, 2))), (Q3(3), Q3(2)),
     (3 - R3H, Q3(F(3, 2))), (F(5, 2) - R3H, F(3, 2) + R3H),
     (F(3, 2) - R3H, F(3, 2) + R3H), (HALF - R3H, F(3, 2) + R3H),
     (-R3H, Q3(F(3, 2))), (Q3(0), Q3(1))]
N = len(T)

def sub(p, q): return (p[0]-q[0], p[1]-q[1])
def add(p, q): return (p[0]+q[0], p[1]+q[1])
def dot(p, q): return p[0]*q[0] + p[1]*q[1]
def crs(p, q): return p[0]*q[1] - p[1]*q[0]
def orient(o, a, b): return crs(sub(a, o), sub(b, o)).sign()
def J(v): return (-v[1], v[0])            # quarter turn anticlockwise
def scale(k, v): return (k*v[0], k*v[1])

# cos and sin of k*30 degrees, exactly
TRIG = [(Q3(1), Q3(0)), (R3H, Q3(HALF)), (Q3(HALF), R3H), (Q3(0), Q3(1)),
        (Q3(-HALF), R3H), (-R3H, Q3(HALF)), (Q3(-1), Q3(0)), (-R3H, Q3(-HALF)),
        (Q3(-HALF), -R3H), (Q3(0), Q3(-1)), (Q3(HALF), -R3H), (R3H, Q3(-HALF))]

def turn30(e0, e1):
    """Turn from unit vector e0 to unit vector e1, in multiples of 30 degrees."""
    c, s = dot(e0, e1), crs(e0, e1)
    for k, (ck, sk) in enumerate(TRIG):
        if c == ck and s == sk: return k if k <= 6 else k - 12
    raise ValueError("turn is not a multiple of 30 degrees")

def apexes(p, h):
    out = []
    for i in range(N):
        a, b = T[i], T[(i+1) % N]; e = sub(b, a)
        u, w = (p, h) if i % 2 == 0 else (1 - p, -h)
        out.append(add(add(a, scale(Q3(u), e)), scale(Q3(w), J(e))))
    return out

def on_segment(pt, a, b):
    return orient(a, b, pt) == 0 and dot(sub(pt, a), sub(pt, b)).sign() <= 0

def segs_meet(p1, p2, q1, q2):
    """Closed segments p1p2 and q1q2 share at least one point."""
    d1, d2 = orient(q1, q2, p1), orient(q1, q2, p2)
    d3, d4 = orient(p1, p2, q1), orient(p1, p2, q2)
    if d1*d2 < 0 and d3*d4 < 0: return True
    return any(o == 0 and on_segment(pt, a, b) for o, pt, a, b in
               ((d1, p1, q1, q2), (d2, p2, q1, q2), (d3, q1, p1, p2), (d4, q2, p1, p2)))

def location(pt, poly):
    """+1 strictly inside, -1 strictly outside, 0 on the boundary."""
    n = len(poly)
    for i in range(n):
        if on_segment(pt, poly[i], poly[(i+1) % n]): return 0
    inside = False
    for i in range(n):
        a, b = poly[i], poly[(i+1) % n]
        if (a[1] - pt[1]).sign() > 0 and (b[1] - pt[1]).sign() <= 0 or \
           (b[1] - pt[1]).sign() > 0 and (a[1] - pt[1]).sign() <= 0:
            x = a[0] + (pt[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if (pt[0] - x).sign() < 0: inside = not inside
    return 1 if inside else -1

def triangles(p, h):
    c = apexes(p, h)
    return c, [(T[i], c[i], T[(i+1) % N]) for i in range(N)]

def condition_G(p, h, why=None):
    """True when condition (G) holds; failures are appended to why."""
    why = [] if why is None else why
    c, tri = triangles(p, h)
    dent = [location(c[i], T) for i in range(N)]
    if 0 in dent: why.append("an apex lies on the boundary of Tile(1,1)"); return False
    dents = [i for i in range(N) if dent[i] > 0]
    bumps = [i for i in range(N) if dent[i] < 0]
    want = [i for i in range(N) if (i % 2 == 0) == (h > 0)]
    if dents != want:
        why.append(f"dents on edges {dents}, expected {want}"); return False
    for i in range(N):
        v0, ap, v1 = tri[i]
        for base, far in ((v0, ap), (v1, ap)):
            for j in range(N):
                f0, f1 = T[j], T[(j+1) % N]
                if base in (f0, f1):
                    other = f1 if base == f0 else f0
                    d, g = sub(far, base), sub(other, base)
                    if crs(d, g).sign() == 0 and dot(d, g).sign() > 0:
                        why.append(f"side of triangle {i} runs along edge {j}"); return False
                elif segs_meet(base, far, f0, f1):
                    why.append(f"side of triangle {i} meets edge {j}"); return False
    for grp in (dents, bumps):
        for x in grp:
            for y in grp:
                if y <= x: continue
                A, B = tri[x], tri[y]
                if set(A[::2]) & set(B[::2]):
                    why.append(f"triangles {x} and {y} on one side share a corner"); return False
                for k in range(2):
                    for l in range(2):
                        if segs_meet(A[k], A[k+1], B[l], B[l+1]):
                            why.append(f"triangles {x} and {y} meet"); return False
    return True

def dist2_point_segment(pt, a, b):
    """Squared distance from pt to segment ab, exactly."""
    d, v = sub(b, a), sub(pt, a)
    t = dot(v, d) / dot(d, d)
    if t.sign() <= 0: return dot(v, v)
    if (t - 1).sign() >= 0:
        w = sub(pt, b); return dot(w, w)
    return dot(v, v) - t * dot(v, d)

def delta2():
    """Squared least distance between two edges of Tile(1,1) with no common
    vertex. The edges of a simple polygon do not cross, so the least distance
    is attained at an end point of one of the two edges."""
    best = None
    for i in range(N):
        for j in range(i + 1, N):
            if j == i + 1 or (i == 0 and j == N - 1): continue
            a, b, c, d = T[i], T[(i+1) % N], T[j], T[(j+1) % N]
            for x in (dist2_point_segment(a, c, d), dist2_point_segment(b, c, d),
                      dist2_point_segment(c, a, b), dist2_point_segment(d, a, b)):
                if best is None or (x - best).sign() < 0: best = x
    return best

def fmt(x): return f"{float(x):.6f}"

def run(p, h):
    ok = True
    def check(cond, msg):
        nonlocal ok
        print(("  ok    " if cond else "  FAIL  ") + msg); ok &= bool(cond)

    print(f"X(p, h) with p = {p}, h = {h}")
    edges = [sub(T[(i+1) % N], T[i]) for i in range(N)]
    check(all(dot(e, e) == 1 for e in edges), "Tile(1,1) has 14 unit edges")
    area2 = sum((crs(T[i], T[(i+1) % N]) for i in range(N)), Q3(0))
    check(area2.sign() > 0, "Tile(1,1) is counterclockwise")
    turns = [turn30(edges[i-1], edges[i]) for i in range(N)]
    angles = [180 - 30*t for t in turns]
    check(sum(turns) == 12, "turns total 360 degrees")
    check(all((angles[i] % 90 == 0) if i % 2 == 0 else (angles[i] % 120 == 0) for i in range(N)),
          f"corner angles {angles}: even multiples of 90, odd multiples of 120")
    d2 = delta2()
    check(d2 == Q3(6, -3), f"delta^2 = 6 - 3 sqrt 3 exactly (delta = {math.sqrt(float(d2)):.6f}, "
          f"delta/2 = {math.sqrt(float(d2))/2:.6f})")
    check((4*h*h - d2).sign() < 0, f"|h| < delta/2, so Proposition 3.2 gives (G) by hand")

    c = apexes(p, h)
    a2, b2 = p*p + h*h, (1-p)**2 + h*h
    lemma_a = lemma_c = True
    for i in range(N):
        d_in, d_out = sub(T[i], c[i-1]), sub(c[i], T[i])
        cs, sn = dot(edges[i-1], edges[i]), crs(edges[i-1], edges[i])
        rotated = (cs*d_in[0] - sn*d_in[1], sn*d_in[0] + cs*d_in[1])
        lemma_a &= rotated == d_out
        want = a2 if i % 2 == 0 else b2
        lemma_c &= dot(d_in, d_in) == want and dot(d_out, d_out) == want
    check(lemma_a, "Lemma 3.4(1): X turns at each original corner exactly as Tile(1,1)")
    check(lemma_c, f"Lemma 3.4(3): segments at even corners have a^2 = {a2}, at odd b^2 = {b2}")
    print(f"        a = {math.sqrt(a2):.6f}, b = {math.sqrt(b2):.6f}, "
          f"2a = {2*math.sqrt(a2):.6f}")

    den = p*(1 - p) - h*h
    phi = 180 - math.degrees(math.atan2(abs(h), p) + math.atan2(abs(h), 1 - p))
    if den == 0:
        print("  ok    (N): phi = 90 degrees, none of 75, 80, 120, 150, so (N) holds")
    else:
        t = abs(h) / den
        # tan(pi - phi) for phi = 150, 120, 80, 75 is 1/sqrt3, sqrt3, tan 100, tan 105 = -(2+sqrt3).
        # All are irrational: tan 100 has tan(300) = -sqrt3, and tan 3x is rational when tan x is.
        tan3 = None if 1 - 3*t*t == 0 else (3*t - t**3) / (1 - 3*t*t)
        # phi > 60 degrees follows from |h| < delta/2, checked exactly above (Lemma 3.3(1)).
        check((4*h*h - d2).sign() < 0 and tan3 is not None,
              f"(N): tan(alpha+beta) = {t} is rational, so phi = {phi:.6f} deg "
              f"is none of 75, 80, 120, 150, and (N) holds")
    why = []
    check(condition_G(p, h, why), "(G): bump triangles clear of each other and of Tile(1,1)"
          + (f" -- {why[0]}" if why else ""))
    corners = [k for k in range(N) if angles[k] != 180]
    print(f"  X has {len(corners) + N} corners: {len(corners)} original, {N} apexes")
    print("PASS" if ok else "FAIL")
    return ok

def family():
    """Checks 6-9: facts about the whole family, independent of p and h."""
    ok = True
    def check(cond, msg):
        nonlocal ok
        print(("  ok    " if cond else "  FAIL  ") + msg); ok &= bool(cond)
    print("The family X(p, h)")
    T_ANG = [90, 120, 180, 240, 270]          # corners of Tile(1,1) and side interiors

    def combos(k, lo=0):
        """Multisets of k angles from T_ANG, as sorted tuples."""
        if k == 0: yield (); return
        for i in range(lo, len(T_ANG)):
            for rest in combos(k - 1, i): yield (T_ANG[i],) + rest

    def solutions(phi):
        """All ways to fill 360 degrees at a point with at least one apex."""
        out = []
        for m in range(0, 7):
            for n in range(0, 2):
                if m + n == 0: continue
                for k in range(0, 5):
                    for c in combos(k):
                        if m*phi + n*(360 - phi) + sum(c) == 360: out.append((m, n, c))
        return out

    # 6. Which phi > 60 let a red corner meet an apex? Solve m phi + n (360-phi) + sigma = 360.
    bad = {}
    for m in range(0, 7):
        for n in range(0, 2):
            if m == n: continue
            for k in range(1, 5):
                for c in combos(k):
                    if not any(x in (120, 240) for x in c): continue
                    phi = F(360 - 360*n - sum(c), m - n)
                    if 60 < phi < 180: bad.setdefault(phi, set()).add((m, n, c))
    table2 = {F(150): {(1, 0, (90, 120))},
              F(120): {(0, 1, (120,)), (1, 0, (240,)), (1, 0, (120, 120)), (2, 0, (120,))},
              F(80): {(3, 0, (120,))},
              F(75): {(2, 0, (90, 120))}}
    check(bad == table2, "Lemma 3.3(2), Table 2: red meets an apex only at phi = 75, 80, 120, 150, as listed")
    f4 = all(all(any(x in (120, 240) for x in c) for (m, n, c) in solutions(phi) if 90 in c or 270 in c)
             for phi in table2)
    check(f4, "(F4): at those angles, every sum with an apex and a blue corner is a row of Table 2")
    two = [s for s in solutions(F(150)) if s[0] + s[1] >= 2]
    check(two == [(1, 1, ())], "phi = 150: two apexes at a point are one bump and one dent")

    # 7. Lemma 3.5: corner angles of X in order v0 c0 v1 c1 ... v9 c9 c10 v11 c11 v12 c12 v13 c13.
    tv = [90, 240, 90, 120, 270, 120, 90, 120, 270, 120, None, 120, 90, 240]
    def seq(P, D):
        out = []
        for i in range(14):
            if tv[i] is not None: out.append(tv[i])
            out.append(D if i % 2 == 0 else P)      # dents on even edges when h > 0
        return out
    def rigid(q):
        n = len(q)
        rot = [r for r in range(1, n) if all(q[k] == q[(k + r) % n] for k in range(n))]
        ref = [r for r in range(n) if all(q[k] == q[(r - k) % n] for k in range(n))]
        return n == 27 and not rot and not ref
    check(all(rigid(seq(P, D)) for P, D in (("P", "D"), (90, 270), (120, 240))),
          "Lemma 3.5: no nontrivial symmetry of the corner angles (generic phi, 90, 120)")

    # 8. Heights where a = b or b = 2a, for phi = 75 and 80 degrees.
    half_delta = math.sqrt(6 - 3*math.sqrt(3)) / 2
    for deg in (75, 80):
        ph = math.radians(deg)
        h_eq = 0.5 / math.tan(ph / 2)
        h_2a = 2*math.sin(ph) / (5 - 4*math.cos(ph))
        check(min(h_eq, h_2a) > half_delta + 0.009,
              f"phi = {deg}: a = b needs |h| = {h_eq:.4f}, b = 2a needs |h| = {h_2a:.4f}, "
              f"both above delta/2 = {half_delta:.4f}")

    # 9. The excluded tile X(2/7, sqrt3/7): h^2 = 3/49.
    p0, hh = F(2, 7), F(3, 49)
    a2, b2 = p0*p0 + hh, (1 - p0)**2 + hh
    cosphi2 = (a2 + b2 - 1)**2 / (4*a2*b2)      # cos^2 of the apex angle; its sign from a2 + b2 - 1
    check(a2 == F(1, 7) and b2 == F(4, 7) and a2 + b2 - 1 < 0 and cosphi2 == F(1, 4),
          "X(2/7, sqrt3/7): a^2 = 1/7, b^2 = 4/7 = 4a^2, apex angle 120 degrees")
    print("PASS" if ok else "FAIL")
    return ok


def limit(p):
    """First |h| on a 1/100 grid where (G) fails for h or -h, refined to 1/10000."""
    good = lambda h: condition_G(p, h) and condition_G(p, -h)
    lo, hi = F(0), None
    for k in range(1, 200):
        if not good(F(k, 100)): hi = F(k, 100); break
        lo = F(k, 100)
    if hi is None: return None
    for k in range(1, 100):
        h = lo + F(k, 10000)
        if not good(h): return lo + F(k - 1, 10000), h
    return lo, hi

def svg(p, h, path):
    c = apexes(p, h)
    pts = []
    for i in range(N): pts += [T[i], c[i]]
    xs = [float(q[0]) for q in pts + T]; ys = [float(q[1]) for q in pts + T]
    s, m = 120, 0.4
    X = lambda x: (x - min(xs) + m) * s
    Y = lambda y: (max(ys) - y + m) * s
    W, H = (max(xs) - min(xs) + 2*m) * s, (max(ys) - min(ys) + 2*m) * s
    poly = lambda P: " ".join(f"{X(float(q[0])):.2f},{Y(float(q[1])):.2f}" for q in P)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.0f}" height="{H:.0f}" '
           f'viewBox="0 0 {W:.0f} {H:.0f}" font-family="serif" font-size="14">',
           f'<rect width="100%" height="100%" fill="white"/>',
           f'<polygon points="{poly(pts)}" fill="#dde6ff" stroke="black" stroke-width="1.5"/>',
           f'<polygon points="{poly(T)}" fill="none" stroke="#888" stroke-dasharray="4 3"/>']
    for i, q in enumerate(T):
        col = "#2255cc" if i % 2 == 0 else "#cc2222"
        out.append(f'<circle cx="{X(float(q[0])):.2f}" cy="{Y(float(q[1])):.2f}" r="4" fill="{col}"/>')
        out.append(f'<text x="{X(float(q[0]))+6:.2f}" y="{Y(float(q[1]))-6:.2f}">v{i}</text>')
    out.append('</svg>')
    open(path, 'w').write("\n".join(out) + "\n")
    print(f"wrote {path}")

if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--limit"]:
        p = F(args[1]) if len(args) > 1 else F(29, 50)
        r = limit(p)
        print(f"(G) holds for 0 < |h| <= {float(r[0]):.6f} at p = {p}; fails by {float(r[1]):.6f}"
              if r else f"(G) holds for every tested h at p = {p}")
    elif args[:1] == ["--svg"]:
        p, h = (F(args[2]), F(args[3])) if len(args) > 3 else (F(29, 50), F(13, 50))
        svg(p, h, args[1])
    else:
        p, h = (F(args[0]), F(args[1])) if len(args) > 1 else (F(29, 50), F(13, 50))
        ok = run(p, h)
        print()
        sys.exit(0 if family() and ok else 1)
