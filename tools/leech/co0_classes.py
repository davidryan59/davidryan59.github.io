"""Build the table of the 167 conjugacy classes of Co0, the symmetry group of
the Leech lattice, from GAP's character table library (ctbllib).

Co0 is 2.Co1 in the library. The script reads the tables of 2.Co1 and Co1, the
map from one onto the other, and the 24-dimensional character. For each class
it works out the element order, the class name, the Co1 class below it, the
class of -x, the trace on the 24 dimensions, the frame shape and the
eigenvalue orders. It checks the class equation, the centraliser orders, the
norm of the character, and that 160 distinct frame shapes appear (Kondo,
1985).

Usage: python3 co0_classes.py path/to/ctbllib/data/ctoconja.tbl
The library is at https://www.math.rwth-aachen.de/~Thomas.Breuer/ctbllib/
(version 1.3.9 was used). Writes docs/leech/co0-classes.json and .md."""
import json, os, re, sys
from fractions import Fraction

PRIMES = [2, 3, 5, 7, 11, 13, 23]
ORDER = 8315553613086720000


def tokens(s):
    i = 0
    while i < len(s):
        c = s[i]
        if c.isspace():
            i += 1
        elif c == '"':
            j = i + 1
            while s[j] != '"':
                j += 2 if s[j] == '\\' else 1
            yield ('str', s[i + 1:j]); i = j + 1
        elif c.isdigit() or (c == '-' and s[i + 1].isdigit()):
            m = re.match(r'-?\d+', s[i:]); yield ('int', int(m.group())); i += len(m.group())
        elif c.isalpha() or c == '_':
            m = re.match(r'[A-Za-z_][A-Za-z_0-9.]*', s[i:]); yield ('id', m.group()); i += len(m.group())
        else:
            yield ('p', c); i += 1


class Reader:
    """Reads the GAP literals in the library: lists with holes, calls,
    records, permutations and arithmetic, which it keeps but never evaluates."""
    END = (('p', ','), ('p', ']'), ('p', ')'))

    def __init__(self, s): self.t, self.k = list(tokens(s)), 0
    def peek(self): return self.t[self.k]
    def next(self): self.k += 1; return self.t[self.k - 1]

    def value(self):
        v = self.primary()
        parts = [v]
        while self.peek() not in self.END:
            t = self.next()
            parts.append(self.items(')') if t == ('p', '(') else self.items(']') if t == ('p', '[') else t)
        return v if len(parts) == 1 else ('expr', parts)

    def primary(self):
        t = self.next()
        if t == ('p', '['):
            return self.items(']')
        if t == ('p', '('):
            cycles = [self.items(')')]
            while self.peek() == ('p', '('):
                self.next(); cycles.append(self.items(')'))
            return ('perm', cycles)
        if t[0] == 'id' and self.peek() == ('p', '('):
            self.next(); return ('call', t[1], self.items(')'))
        if t[0] == 'id' and self.peek() == ('p', ':'):
            self.next(); self.next(); return ('field', t[1], self.value())
        return t[1]

    def items(self, close):
        out = []
        while True:
            if self.peek() == ('p', close):
                self.next(); return out
            if self.peek() == ('p', ','):
                self.next(); out.append(None); continue
            out.append(self.value())
            t = self.next()
            if t == ('p', close):
                return out


def call(text, start):
    i = text.index(start)
    return Reader(text[i:i + 400000]).primary()[2]


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


def orders(power):
    n = len(power[1])
    def order(i):
        for k in range(1, 300):
            j, rest = i, k
            for p in PRIMES:
                while rest % p == 0:
                    j = power[p - 1][j - 1]; rest //= p
            if rest == 1 and j == 1:
                return k
    return [order(i) for i in range(1, n + 1)]


def names(ords):
    seen, out = {}, []
    for o in ords:
        seen[o] = seen.get(o, 0) + 1
        out.append(f'{o}{"ABCDEFGHIJKLMNOPQRSTUVWXYZ"[seen[o] - 1]}')
    return out


def frame_text(frame):
    def side(sign):
        return '·'.join(f'{m}' + (f'^{abs(e)}' if abs(e) != 1 else '')
                        for m, e in frame.items() if e * sign > 0)
    down = side(-1)
    return side(1) + (f' / {down}' if down else '')


def main(path):
    text = open(path).read()
    big, small = call(text, 'MOT("2.Co1"'), call(text, 'MOT("Co1"')
    fusion = call(text, 'ALF("2.Co1","Co1"')[2]
    chi_small = call(text, 'ARC("Co1","projectives"')[2][1][0]
    cent, power = big[2], big[3]
    o_big, o_small = orders(power), orders(small[3])
    n_big, n_small = names(o_big), names(o_small)
    assert len(cent) == 167 and len(small[2]) == 101 and cent[0] == ORDER == 2 * small[2][0]
    assert sum(Fraction(ORDER, c) for c in cent) == ORDER

    lifts = {}
    for i, f in enumerate(fusion):
        lifts.setdefault(f, []).append(i)
    chi = []
    for i, f in enumerate(fusion):
        chi.append(chi_small[f - 1] * (1 if lifts[f][0] == i else -1))
        assert cent[i] == small[2][f - 1] * len(lifts[f])
    assert chi[0] == 24 and chi[1] == -24
    assert sum(Fraction(c * c, z) for c, z in zip(chi, cent)) == 1

    def pw(i, k):
        for p in PRIMES:
            while k % p == 0:
                i = power[p - 1][i - 1]; k //= p
        return i

    rows = []
    for i in range(167):
        n = o_big[i]
        divs = [d for d in range(1, n + 1) if n % d == 0]
        frame = {}
        for m in divs:
            s = sum(mobius(m // d) * chi[pw(i + 1, d) - 1] for d in divs if m % d == 0)
            assert s % m == 0
            if s:
                frame[m] = s // m
        assert sum(m * e for m, e in frame.items()) == 24
        eigen = {k: sum(e for m, e in frame.items() if m % k == 0) for k in divs}
        f = fusion[i]
        rows.append({
            'name': n_big[i], 'order': n, 'co1': n_small[f - 1],
            'negative': n_big[[j for j in lifts[f] if j != i][0]] if len(lifts[f]) == 2 else n_big[i],
            'centraliser': str(cent[i]), 'trace': chi[i],
            'frame': frame_text(frame), 'frame_exponents': {str(m): e for m, e in frame.items()},
            'eigenvalues': {str(k): v for k, v in eigen.items() if v},
            'powers': {str(p): n_big[power[p - 1][i] - 1] for p in PRIMES if n % p == 0},
        })
    assert len({r['frame'] for r in rows}) == 160
    split = sum(1 for v in lifts.values() if len(v) == 2)
    assert (split, len(lifts) - split) == (66, 35)

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'leech')
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, 'co0-classes.json'), 'w') as fh:
        json.dump({'group': 'Co0 = 2.Co1', 'order': str(ORDER),
                   'source': 'GAP ctbllib 1.3.9, data/ctoconja.tbl', 'classes': rows}, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    table = '\n'.join(f"| {r['name']} | {r['order']} | {r['co1']} | {r['negative']} | {r['trace']} | "
                      f"{r['frame']} | {int(r['centraliser']):,} |" for r in rows)
    with open(os.path.join(out, 'co0-classes.md'), 'w') as fh:
        fh.write(MARKDOWN.replace('TABLE', table))
    print('167 classes, 101 Co1 classes, 66 split, 35 fused, 160 frame shapes')


MARKDOWN = """# The 167 conjugacy classes of Co0

## Summary

Co0 is the group of all rotations that map the Leech lattice to itself. It has
order 8,315,553,613,086,720,000 and 167 conjugacy classes. This page lists
them. [co0-classes.json](co0-classes.json) holds the same data with power maps
and eigenvalue counts. The script
[tools/leech/co0_classes.py](../../tools/leech/co0_classes.py) builds both
files from GAP's character table library, ctbllib 1.3.9.

## Names

- The ATLAS names the 101 classes of Co1 = Co0 / {±1}. These names are official.
- The ATLAS gives no names to the classes of Co0 = 2.Co1. The names here follow
  GAP's rule: the number is the element order, and the letters run in the
  library's class order. So 1A is the identity, 2A is -1, and 84A has order 84.
- Each element x has a partner -x over the same Co1 class. For 66 Co1 classes,
  x and -x lie in different classes. For the other 35, they are conjugate, and
  the "-x" column repeats the class.

## Columns

- **Trace:** the trace of the element on the 24 dimensions.
- **Frame shape:** the characteristic polynomial, written as a product of
  (t^m - 1) to the given powers. For example, 1·23 means (t - 1)(t^23 - 1).
  The 167 classes have 160 distinct frame shapes.
- **Centraliser:** the order of the centraliser. The class has
  |Co0| / centraliser elements.

## Checks

The script checks that the class sizes sum to |Co0|, that each centraliser
order agrees with the map onto Co1, and that the 24-dimensional character has
norm 1.

## Classes

| Class | Order | Co1 class | -x | Trace | Frame shape | Centraliser |
|---|---|---|---|---|---|---|
TABLE
"""

if __name__ == '__main__':
    main(sys.argv[1])
