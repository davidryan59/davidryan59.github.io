"""Find the views that rotations of the Leech lattice give, and choose the
planes for the explorer's rotation scenes.

Co0, the lattice's symmetry group, is built from Conway's generators in the
explorer's coordinates: the cyclic shift and doubling maps on positions 0..22,
the map i -> -1/i, a sign change on one octad, and Conway's xi on the sextet
of the tetrad {0, 1, 2, 3}, with one tetrad negated. Each generator is checked
against all 196,560 shortest vectors. Matrices are stored times 8, so all
arithmetic is exact.

A rotation of order n turns some planes by 360/n degrees. Projecting onto one
gives an n-fold picture, doubled when n is odd by x -> -x. A plane is fixed
when its eigenvalue is simple; then the picture depends only on the class.

Commands:
  survey   Sample Co0 until every class has an element, then list the distinct
           pictures from all fixed planes (444 planes, 46 pictures).
  coxeter  Match the pictures inside octad O1 with the Coxeter planes of E8's
           root subsystems. E7, D8, E6 and D5 give the four octad scenes.
  choose   For each scene, find the copy of its plane nearest the opening view.
           With --write, save docs/leech/co0-views.json.
  sheet    Draw the planes in co0-views.json to renders/co0-views-sheet.png.

Usage: python3 co0_views.py survey|coxeter|choose [--write]|sheet
Needs numpy, matplotlib for sheet, and node for choose. Reads the class table
from docs/leech/co0-classes.json (see co0_classes.py). Caches the sampled
elements in the system temp folder; survey rebuilds them in about 3 minutes."""
import hashlib, json, os, pickle, random, subprocess, sys, tempfile
from itertools import combinations
from math import gcd
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
CLASSES = os.path.join(ROOT, 'docs', 'leech', 'co0-classes.json')
VIEWS = os.path.join(ROOT, 'docs', 'leech', 'co0-views.json')
CACHE = os.path.join(tempfile.gettempdir(), 'leech-co0')
OCTAD = [0, 2, 4, 5, 6, 10, 11, 23]  # Leech.TRIO[0], octad O1
# Scene classes: (class, order of the eigenvalue on the plane, subsystem in O1 or None).
SCENES = [('84A', 84, None), ('33A', 33, None), ('60C', 60, None), ('21B', 21, None),
          ('40A', 40, None), ('36A', 36, None), ('15D', 15, None),
          ('18D', 18, 'E7'), ('14C', 14, 'D8'), ('24D', 12, 'E6'), ('16A', 8, 'D5')]


# ---- the lattice
def golay():
    code = []
    for message in range(4096):
        word = 0
        for bit in range(12):
            if message >> bit & 1:
                word ^= 0xC75 << bit
        if bin(word & 0x7fffff).count('1') & 1:
            word |= 0x800000
        code.append(word)
    return code


CODE = golay()
OCTADS = [w for w in CODE if bin(w).count('1') == 8]


def vectors():
    out = []
    for i, j in combinations(range(24), 2):
        for si in (4, -4):
            for sj in (4, -4):
                v = [0] * 24; v[i] = si; v[j] = sj; out.append(v)
    for o in OCTADS:
        pos = [p for p in range(24) if o >> p & 1]
        for s in range(256):
            if bin(s).count('1') % 2 == 0:
                v = [0] * 24
                for k, p in enumerate(pos):
                    v[p] = -2 if s >> k & 1 else 2
                out.append(v)
    for w in CODE:
        for special in range(24):
            out.append([(-1 if w >> p & 1 else 1) * (-3 if p == special else 1) for p in range(24)])
    return np.array(out, dtype=np.int64)


V = vectors()
VF = V / np.sqrt(8)


# ---- Co0
def mul(a, b):
    c = a @ b
    assert not np.any(c % 8)
    return c // 8


def generators():
    keys = set(map(bytes, (V + 8).astype(np.uint8)))
    def preserves(m8):
        w = V @ m8.T
        return not np.any(w % 8) and all(bytes(r) in keys for r in (w // 8 + 8).astype(np.uint8))
    def perm(images):
        m = np.zeros((24, 24), dtype=np.int64)
        for i, j in enumerate(images):
            m[j, i] = 8
        return m
    inv = {i: pow(i, 21, 23) for i in range(1, 23)}
    shift = [(i + 1) % 23 if i < 23 else 23 for i in range(24)]
    double = [2 * i % 23 if i < 23 else 23 for i in range(24)]
    flip = [0 if i == 23 else 23 if i == 0 else -inv[i] % 23 for i in range(24)]
    tetrads = [0b1111]
    for p in range(24):
        if not any(t >> p & 1 for t in tetrads):
            o = [o for o in OCTADS if o & (0b1111 | 1 << p) == 0b1111 | 1 << p][0]
            tetrads.append(o & ~0b1111)
    xi = np.zeros((24, 24), dtype=np.int64)
    for k, t in enumerate(tetrads):
        pos = [p for p in range(24) if t >> p & 1]
        for a in pos:
            for b in pos:
                xi[a, b] = (4 - 8 * (a == b)) * (-1 if k == 0 else 1)
    eps = np.diag([-8 if OCTADS[0] >> p & 1 else 8 for p in range(24)]).astype(np.int64)
    gens = [perm(shift), perm(double), perm(flip), xi, eps]
    assert all(preserves(g) for g in gens)
    return gens + [np.round(np.linalg.inv(g / 8) * 8).astype(np.int64) for g in gens]


def mobius(n):
    r, p = 1, 2
    while p * p <= n:
        if n % p == 0:
            n //= p
            if n % p == 0:
                return 0
            r = -r
        p += 1
    return -r if n > 1 else r


def class_key(g):
    eye, pw, traces = 8 * np.eye(24, dtype=np.int64), 8 * np.eye(24, dtype=np.int64), []
    for n in range(1, 200):
        pw = mul(pw, g); traces.append(int(np.trace(pw)) // 8)
        if np.array_equal(pw, eye):
            break
    divs = [d for d in range(1, n + 1) if n % d == 0]
    frame = {}
    for m in divs:
        s = sum(mobius(m // d) * traces[d - 1] for d in divs if m % d == 0)
        if s:
            frame[str(m)] = s // m
    return n, json.dumps(frame, sort_keys=True)


def table():
    return {c['name']: c for c in json.load(open(CLASSES))['classes']}


def sample():
    """One element of every class, keyed 'name' or 'name/name' where two classes
    share a frame shape. Random products, then their powers."""
    path = os.path.join(CACHE, 'reps.pkl')
    if os.path.exists(path):
        return pickle.load(open(path, 'rb'))
    lookup = {}
    for c in table().values():
        lookup.setdefault((c['order'], json.dumps(c['frame_exponents'], sort_keys=True)), []).append(c['name'])
    random.seed(1)
    gens = generators(); state = [g.copy() for g in gens] * 2; reps = {}
    for step in range(30000):
        i, j = random.sample(range(len(state)), 2)
        state[i] = mul(state[i], state[j]) if random.random() < .5 else mul(state[j], state[i])
        if step < 200:
            continue
        g = state[i]; n = class_key(g)[0]; pw = 8 * np.eye(24, dtype=np.int64)
        for k in range(1, n + 1):
            pw = mul(pw, g)
            if k > 1 and gcd(k, n) == 1:
                continue
            key = '/'.join(lookup[class_key(pw)])
            reps.setdefault(key, pw.copy())
    names = {name for key in reps for name in key.split('/')}
    assert len(names) == 167, f'only {len(names)} classes found'
    os.makedirs(CACHE, exist_ok=True); pickle.dump(reps, open(path, 'wb'))
    return reps


def rep(reps, name):
    return next(g for key, g in reps.items() if name in key.split('/'))


# ---- planes and pictures
def plane(g, n, k, rng):
    """The real plane where g (order n, times 8) turns by 2 pi k / n."""
    G = g / 8.0; Q = np.zeros((24, 24)); P = np.eye(24)
    for j in range(n):
        Q += 2 * np.cos(2 * np.pi * j * k / n) * P; P = P @ G
    u = Q @ rng.standard_normal(24); u /= np.linalg.norm(u)
    w = G @ u - np.cos(2 * np.pi * k / n) * u; w /= np.linalg.norm(w)
    return np.array([u, w])


def picture(rows):
    x = VF @ np.asarray(rows).T
    r2 = np.round((x ** 2).sum(1), 8)
    return dict(spots=len(np.unique(np.round(x, 6), axis=0)), radii=len(np.unique(r2)),
                sig=hashlib.md5(np.round(np.sort(r2), 6).tobytes()).hexdigest()[:8])


def cosines(a, b):
    return np.linalg.svd(np.asarray(a) @ np.asarray(b).T, compute_uv=False).sum()


def motion(c):
    """RMS screen distance a ball moves between two planes, best turn within the plane."""
    return float(np.sqrt(max(0, (4 - 2 * c) / 6)))


def align(rows, target):
    u, _, vt = np.linalg.svd(np.asarray(target) @ np.asarray(rows).T)
    return (u @ vt) @ np.asarray(rows)


def survey():
    reps, classes, rng, pictures = sample(), table(), np.random.default_rng(0), {}
    for key, g in reps.items():
        c = classes[key.split('/')[0]]; n = c['order']
        for m, mult in c['eigenvalues'].items():
            m = int(m)
            if m < 3 or mult != 1:
                continue
            for j in range(1, (m + 1) // 2):
                if gcd(j, m) == 1:
                    p = picture(plane(g, n, j * n // m, rng))
                    pictures.setdefault(p['sig'], dict(p, symmetry=m if m % 2 == 0 else 2 * m, planes=0, classes=set()))
                    pictures[p['sig']]['planes'] += 1; pictures[p['sig']]['classes'].add(key)
    print(f"{sum(p['planes'] for p in pictures.values())} fixed planes, {len(pictures)} distinct pictures")
    for p in sorted(pictures.values(), key=lambda p: (-p['symmetry'], p['spots'])):
        print(f"{p['symmetry']:3d}-fold {p['spots']:7d} spots {p['radii']:5d} radii  {', '.join(sorted(p['classes']))}")


# ---- E8 inside octad O1
E = np.eye(8)
SIMPLE = [0.5 * np.array([1, -1, -1, -1, -1, -1, -1, 1]), E[0] + E[1]] + [E[i] - E[i - 1] for i in range(1, 7)]
CHAIN = [E[i + 1] - E[i] for i in range(7)]
SUBSYSTEMS = {'E8': (SIMPLE, 30), 'E7': (SIMPLE[:7], 18), 'E6': (SIMPLE[:6], 12),
              'D8': (CHAIN + [E[0] + E[1]], 14), 'D7': (CHAIN[:6] + [E[0] + E[1]], 12),
              'D5': (CHAIN[:4] + [E[0] + E[1]], 8), 'D4': (CHAIN[:3] + [E[0] + E[1]], 6)}
REFLECT = [np.eye(8) - 2 * np.outer(a, a) / a.dot(a) for a in SIMPLE]


def coxeter_plane(name):
    roots, h = SUBSYSTEMS[name]; w = np.eye(8)
    for r in roots:
        w = (np.eye(8) - 2 * np.outer(r, r) / r.dot(r)) @ w
    vec = np.linalg.svd(w - np.exp(2j * np.pi / h) * np.eye(8))[2][-1].conj()
    rows8 = np.linalg.qr(np.array([vec.real, vec.imag]).T)[0].T
    rows = np.zeros((2, 24)); rows[:, OCTAD] = rows8
    return rows


def coxeter():
    reps, classes, rng = sample(), table(), np.random.default_rng(0)
    for name, (roots, h) in SUBSYSTEMS.items():
        p = picture(coxeter_plane(name))
        match = [c for c, m, sub in SCENES if sub == name]
        if match:
            c = match[0]; n = classes[c]['order']; m = [m for cc, m, _ in SCENES if cc == c][0]
            q = picture(plane(rep(reps, c), n, n // m, rng))
            assert q['sig'] == p['sig'], f'{name} does not match {c}'
        print(f"{name}: {h}-fold Coxeter plane, {p['spots']} spots, {p['radii']} radii" + (f", same picture as class {match[0]}" if match else ''))


# ---- choose planes near the opening view
def opening_plane():
    script = ("const E8=require('./app/e8/model.js'),Leech=require('./app/leech/lattice.js'),"
              "Frame=require('./app/leech/frame.js'),S=require('./app/leech/scenes.js');"
              "const s=S.build({Leech,Frame,E8,data:Leech.build()}).find(x=>x.id==='petrie');"
              "console.log(JSON.stringify(s.rows.map(r=>Array.from(r))));")
    out = subprocess.run(['node', '-e', script], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return np.array(json.loads(out))


def nearest_in_octad(rows, target, rng):
    best, b8 = None, -1
    r8, t8 = rows[:, OCTAD], target[:, OCTAD]
    for _ in range(30000):
        u = np.eye(8)
        for _ in range(rng.integers(1, 50)):
            u = REFLECT[rng.integers(8)] @ u
        c = cosines((u @ r8.T).T, t8)
        if c > b8:
            best, b8 = u, c
    for _ in range(20000):
        u2 = REFLECT[rng.integers(8)] @ best; c = cosines((u2 @ r8.T).T, t8)
        if c >= b8:
            best, b8 = u2, c
    out = np.zeros((2, 24)); out[:, OCTAD] = (best @ r8.T).T
    return out


def nearest_in_co0(rows, target):
    gens = [g / 8.0 for g in generators()]; pairs = [a @ b for a in gens for b in gens]
    random.seed(7); state = [g.copy() for g in gens] * 2; best = []
    for step in range(150000):
        i, j = random.sample(range(len(state)), 2)
        state[i] = state[i] @ state[j]
        if step % 50 == 0:
            state[i] = np.round(state[i] * 8) / 8
        c = cosines((state[i] @ rows.T).T, target)
        if len(best) < 12 or c > best[-1][0]:
            best = sorted(best + [(c, state[i].copy())], key=lambda t: -t[0])[:12]
    top, htop = best[0]
    for c0, h0 in best:
        h, c, temp = h0, c0, 0.06
        for _ in range(15000):
            h2 = random.choice(pairs if random.random() < .3 else gens) @ h; c2 = cosines((h2 @ rows.T).T, target)
            if c2 >= c or random.random() < np.exp((c2 - c) / temp):
                h, c = h2, c2
                if c > top:
                    top, htop = c, np.round(h * 8) / 8
            temp *= 0.9997
    return (htop @ rows.T).T


def choose(write):
    reps, classes, rng, target = sample(), table(), np.random.default_rng(7), opening_plane()
    views = []
    for c, m, sub in SCENES:
        n = classes[c]['order']
        start = coxeter_plane(sub) if sub else plane(rep(reps, c), n, n // m, np.random.default_rng(0))
        rows = align(nearest_in_octad(start, target, rng) if sub else nearest_in_co0(start, target), target)
        assert np.allclose(rows @ rows.T, np.eye(2), atol=1e-12)
        p = picture(rows); moved = motion(cosines(rows, target))
        print(f"{c:4s} {m * (1 + m % 2):3d}-fold {p['spots']:7d} spots  motion from the opening view "
              f"{motion(cosines(start, target)):.2f} -> {moved:.2f}")
        views.append({'class': c, 'co1': classes[c]['co1'], 'turn': f'360°/{m}', 'symmetry': m * (1 + m % 2),
                      'window': 8 if sub else 24, 'spots': p['spots'], 'radii': p['radii'],
                      'motion_from_opening': round(moved, 3), 'rows': rows.tolist()})
    if write:
        old = json.load(open(VIEWS)); old['views'] = views
        with open(VIEWS, 'w') as fh:
            json.dump(old, fh, indent=1, ensure_ascii=False); fh.write('\n')
        print('wrote', VIEWS)


def sheet():
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    views = json.load(open(VIEWS))['views']
    cols = 4; rows_n = -(-len(views) // cols)
    fig, axes = plt.subplots(rows_n, cols, figsize=(16, 4.3 * rows_n), facecolor='#111318')
    for ax in axes.flat:
        ax.axis('off'); ax.set_facecolor('#111318')
    for ax, v in zip(axes.flat, views):
        x = VF @ np.array(v['rows']).T
        pts, counts = np.unique(np.round(x, 6), axis=0, return_counts=True)
        ax.set_xlim(-2.05, 2.05); ax.set_ylim(-2.05, 2.05); ax.set_aspect('equal')
        if len(pts) < 30000:
            ax.scatter(pts[:, 0], pts[:, 1], s=0.6 + 1.2 * np.log10(counts), c=np.log10(counts), cmap='plasma', linewidths=0)
        else:
            h = np.histogram2d(x[:, 0], x[:, 1], bins=1000, range=[[-2.05, 2.05]] * 2)[0]
            ax.imshow(np.log1p(h.T) ** 0.8, origin='lower', extent=[-2.05, 2.05, -2.05, 2.05], cmap='magma')
        ax.set_title(f"{v['class']} · {v['symmetry']}-fold\n{v['spots']:,} spots · {v['radii']:,} radii", color='#e8e4da')
    os.makedirs(os.path.join(HERE, 'renders'), exist_ok=True)
    target = os.path.join(HERE, 'renders', 'co0-views-sheet.png')
    plt.tight_layout(); plt.savefig(target, dpi=110, facecolor='#111318'); print('wrote', target)


if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command == 'survey':
        survey()
    elif command == 'coxeter':
        coxeter()
    elif command == 'choose':
        choose('--write' in sys.argv)
    elif command == 'sheet':
        sheet()
    else:
        print(__doc__)
