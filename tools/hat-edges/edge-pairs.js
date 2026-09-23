/* Which edges of the hat meet in the hat tiling, and what that allows.

   Builds a patch of hats (Kaplan level given as the first argument, default
   5), finds every shared edge exactly from the two-part corner positions,
   and reports:
   - whether the tiling is edge to edge (no corner inside another edge),
   - which prototype edges meet, and across which hands,
   - the holonomy of the edge curves, for one tile and its mirror image, and
     for a hat and a mirrored hat curved freely,
   - the two-tile rule written out,
   - a control on the Spectre, where every shared edge should join an even
     edge to an odd one.
   See docs/hat-edge-research.md. Run with node from anywhere. */
const path = require('path');
const R = path.join(__dirname, '..', '..', 'demos') + '/';
const C = require(R + 'engine/tiling-core.js');
const HT = require(R + 'hat/tiling.js');
const ST = require(R + 'spectre/tiling.js');

const LEVEL = +(process.argv[2] || 5);
const built = HT.build();
let node = built.root, T0 = C.TP_IDENT;
while (node.level > LEVEL) { T0 = C.tpCompose(T0, node.TP[0]); node = node.children[0]; }
const hats = [];
(function walk(n, T) { if (n.leaf) { hats.push(T); return; } n.children.forEach((c, i) => walk(c, C.tpCompose(T, n.TP[i]))); })(node, T0);
const TP = HT.HAT_TP;
// An a-edge changes the p part of the corner, a b-edge the r part.
const kind = TP.map((v, u) => (v.p.join() !== TP[(u + 1) % 14].p.join()) ? 'a' : 'b');
console.log('Hat patch: level', node.level, '| hats', hats.length, '| mirrored', hats.filter(h => h.f).length);
console.log('Edge kinds, edges 0 to 13:', kind.join(' '));

// Shared edges, keyed exactly by their two corners.
const key = x => x.p.join(',') + '|' + x.r.join(',');
const seg = new Map();
hats.forEach((h, t) => {
  const cs = TP.map(v => key(C.tpApply(h, v)));
  for (let u = 0; u < 14; u++) {
    const a = cs[u], b = cs[(u + 1) % 14], k = a < b ? a + '#' + b : b + '#' + a;
    if (!seg.has(k)) seg.set(k, []);
    seg.get(k).push({ t, u, f: h.f, fwd: a < b });
  }
});
const links = [...seg.values()].filter(l => l.length === 2);
console.log('Shared edges', links.length, '| edges on more than two hats', [...seg.values()].filter(l => l.length > 2).length);

// Edge to edge: at a generic shape, no corner may sit inside another edge.
const A = 1, B = 1.2345, H3 = Math.sqrt(3) / 2;
const val = x => { const P = C.zw.val(x.p), Q = C.zw.val(x.r); return [A * P[0] + B * (H3 * Q[0] - 0.5 * Q[1]), A * P[1] + B * (0.5 * Q[0] + H3 * Q[1])]; };
const pts = [], grid = new Map(), G = 2;
hats.forEach(h => TP.forEach(v => pts.push(val(C.tpApply(h, v)))));
pts.forEach((p, i) => { const k = Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
let inside = 0;
hats.forEach(h => {
  const cs = TP.map(v => val(C.tpApply(h, v)));
  for (let u = 0; u < 14; u++) {
    const p = cs[u], q = cs[(u + 1) % 14], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (let gx = Math.floor(Math.min(p[0], q[0]) / G) - 1; gx <= Math.floor(Math.max(p[0], q[0]) / G) + 1; gx++) {
      for (let gy = Math.floor(Math.min(p[1], q[1]) / G) - 1; gy <= Math.floor(Math.max(p[1], q[1]) / G) + 1; gy++) {
        (grid.get(gx + ',' + gy) || []).forEach(i => {
          const c = pts[i], s = ((c[0] - p[0]) * (q[0] - p[0]) + (c[1] - p[1]) * (q[1] - p[1])) / (L * L);
          const d = Math.abs((c[0] - p[0]) * (q[1] - p[1]) - (c[1] - p[1]) * (q[0] - p[0])) / L;
          if (s > 1e-6 && s < 1 - 1e-6 && d < 1e-6) inside++;
        });
      }
    }
  }
});
console.log('Corners lying inside another edge:', inside);

// Which prototype edges meet, and how the two hats run along the edge.
const table = {}, dir = { sameHandOpposite: 0, sameHandSameWay: 0, mixedOpposite: 0, mixedSameWay: 0 };
links.forEach(([x, y]) => {
  const same = x.f === y.f, i = Math.min(x.u, y.u), j = Math.max(x.u, y.u);
  const k = i + '-' + j + (same ? ' same hand' : ' mixed');
  table[k] = (table[k] || 0) + 1;
  dir[(same ? 'sameHand' : 'mixed') + (x.fwd === y.fwd ? 'SameWay' : 'Opposite')]++;
});
console.log('Directions along shared edges:', JSON.stringify(dir));
console.log('Prototype edges that meet:');
Object.keys(table).sort((p, q) => { const a = p.split(/[- ]/).map(Number), b = q.split(/[- ]/).map(Number); return a[0] - b[0] || a[1] - b[1]; })
  .forEach(k => { const ij = k.split(' ')[0].split('-'); console.log('  ' + k.padEnd(16), kind[ij[0]] + '-edges', String(table[k]).padStart(6)); });

/* Holonomy. A shared edge ties the curve on one edge to the curve on the
   other through a symmetry of the edge, stored as bits: 1 runs the curve
   backwards (r), 2 reflects it in the edge's line (n). Same hand: a half
   turn, nr = 3. Mixed hands: n = 2. Round any loop the curve must come
   back to itself, so it must be fixed by every loop's product. */
const NM = ['1', 'r', 'n', 'nr'];
function holonomy(nodeOf, title) {
  const adj = new Map(), add = (x, y, g) => { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([y, g]); };
  links.forEach(([x, y]) => { const g = x.f === y.f ? 3 : 2, a = nodeOf(x), b = nodeOf(y); add(a, b, g); add(b, a, g); });
  const value = new Map();
  console.log('\n' + title);
  for (const start of [...adj.keys()].sort()) {
    if (value.has(start)) continue;
    const H = new Set([0]), nodes = [], queue = [start];
    value.set(start, 0);
    while (queue.length) {
      const x = queue.shift(); nodes.push(x);
      for (const [y, g] of adj.get(x)) {
        const want = value.get(x) ^ g;
        if (!value.has(y)) { value.set(y, want); queue.push(y); } else H.add(value.get(y) ^ want);
      }
    }
    for (const p of [...H]) for (const q of [...H]) H.add(p ^ q);
    const verdict = H.has(2) ? 'straight edges only' : H.has(1) ? 'symmetric bumps work' : H.has(3) ? 'S-curves work' : 'any curve works';
    console.log('  edges ' + nodes.sort().join(' ') + '\n    loop products {' + [...H].sort().map(g => NM[g]).join(', ') + '} -> ' + verdict);
  }
  return value;
}
holonomy(x => kind[x.u] + x.u, 'One tile and its mirror image (a mirrored hat carries the mirror image of each curve):');
const v = holonomy(x => (x.f ? 'm' : 'h') + kind[x.u] + x.u, 'Two tiles (hat h and mirrored hat m curved freely):');

// The two-tile rule, from the solution above, and which hat edge each
// mirrored-hat edge meets.
const meets = {};
links.forEach(([x, y]) => { if (x.f !== y.f) { const m = x.f ? x : y, h = x.f ? y : x; (meets[m.u] = meets[m.u] || new Set()).add(h.u); } });
const base = { h: v.get('ha1'), hb: v.get('hb0') };
const rel = (hand, u) => NM[v.get(hand + kind[u] + u) ^ (kind[u] === 'a' ? base.h : base.hb)];
console.log('\nTwo-tile rule, relative to hat edges 1 (a) and 0 (b):');
console.log('  hat           ' + TP.map((x, u) => u + ':' + rel('h', u)).join(' '));
console.log('  mirrored hat  ' + TP.map((x, u) => u + ':' + rel('m', u)).join(' '));
console.log('  shared edges between two mirrored hats:', links.filter(([x, y]) => x.f && y.f).length);
console.log('  mirrored-hat edge -> hat edge it meets: ' + Object.keys(meets).map(u => u + '->' + [...meets[u]].join('/')).join(' '));

// Control: the Spectre, where Single works because every shared edge joins
// an even edge to an odd one.
const sb = ST.build();
let sn = sb.root, F = C.IDENT;
while (sn.level > 4) { F = C.mul(F, sn.transforms[0]); sn = sn.children[0]; }
const tiles = [];
(function walk(n, M) { if (n.leaf) { tiles.push(M); return; } n.children.forEach((c, i) => walk(c, C.mul(M, n.transforms[i]))); })(sn, F);
const fk = p => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5);
const sseg = new Map();
tiles.forEach(M => {
  const cs = ST.SPECTRE.map(p => fk(C.transPt(M, p)));
  for (let u = 0; u < 14; u++) {
    const a = cs[u], b = cs[(u + 1) % 14], k = a < b ? a + '#' + b : b + '#' + a;
    if (!sseg.has(k)) sseg.set(k, []);
    sseg.get(k).push(u);
  }
});
const sl = [...sseg.values()].filter(l => l.length === 2);
console.log('\nControl, Spectre level', sn.level, '| tiles', tiles.length, '| shared edges', sl.length,
  '| even to odd', sl.filter(l => (l[0] + l[1]) % 2).length);
