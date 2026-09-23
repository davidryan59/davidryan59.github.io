/* Checks the Hat (extended) page's rule end to end: builds curved outlines
   as the page does, places every hat of a level-4 patch as the engine does
   (reflect, then turn, then shift), and compares the two curves on every
   shared edge. The same run with the exact-mirror rule is the control: it
   should fail on every edge that touches a mirrored hat.
   See docs/hat-edge-research.md. */
const path = require('path');
const R = path.join(__dirname, '..', '..') + '/';
const fs = require('fs');
const C = require(R + 'demos/engine/tiling-core.js');
const HT = require(R + 'demos/hat/tiling.js');
const ES = require(R + 'demos/engine/edges.js');
// The rule, read from the page itself.
const page = fs.readFileSync(R + 'demos/hat-extended/index.html', 'utf8');
const HAT_SYM = JSON.parse(page.match(/var HAT_SYM = (\[[^\]]*\])/)[1]);
const pageSym = hand => i => HAT_SYM[i] ^ (hand ? 2 : 0);
const naiveSym = () => i => HAT_SYM[i];          // mirrored hat = exact mirror image

const built = HT.build();
let node = built.root, T = C.TP_IDENT;
while (node.level > 4) { T = C.tpCompose(T, node.TP[0]); node = node.children[0]; }
const hats = [];
(function walk(n, Tn) { if (n.leaf) { hats.push(Tn); return; } n.children.forEach((c, i) => walk(c, C.tpCompose(Tn, n.TP[i]))); })(node, T);
const TP = HT.HAT_TP, H3 = Math.sqrt(3) / 2;
const outlineTP = TP.map(v => ({ P: C.zw.val(v.p), R: C.zw.val(v.r) }));
const isB = outlineTP.map((v, i) => { const w = outlineTP[(i + 1) % 14]; return v.R[0] !== w.R[0] || v.R[1] !== w.R[1]; });
const ck = x => x.p.join(',') + '|' + x.r.join(',');
const seg = new Map();
hats.forEach((h, t) => {
  const cs = TP.map(v => ck(C.tpApply(h, v)));
  for (let u = 0; u < 14; u++) {
    const a = cs[u], b = cs[(u + 1) % 14], k = a < b ? a + '#' + b : b + '#' + a;
    if (!seg.has(k)) seg.set(k, []);
    seg.get(k).push({ t, u, fwd: a < b });
  }
});
const links = [...seg.values()].filter(l => l.length === 2);

function run(deg, st, symFor) {
  const th = deg * Math.PI / 180, a0 = Math.sin(th), b0 = Math.cos(th);
  const corners = outlineTP.map(v => [a0 * v.P[0] + b0 * (H3 * v.R[0] - 0.5 * v.R[1]), a0 * v.P[1] + b0 * (0.5 * v.R[0] + H3 * v.R[1])]);
  const pA = ES.fitted({ ...st, bend: st.bend }, 3), pB = ES.fitted({ ...st, bend: st.bendB }, 3);
  const prof = i => isB[i] ? pB : pA;
  // One edge's curve in the hat's frame, both ends included.
  function edgeCurve(hand, i) {
    const a = corners[i], b = corners[(i + 1) % 14], p = prof(i);
    if (!p) return [a, b];
    const q = ES.transform(p, symFor(hand)(i)), ex = b[0] - a[0], ey = b[1] - a[1];
    return q.map(pt => [a[0] + pt[0] * ex - pt[1] * ey, a[1] + pt[0] * ey + pt[1] * ex]);
  }
  // outlineWith must be these curves joined up.
  for (const hand of [0, 1]) {
    const joined = [];
    for (let i = 0; i < 14; i++) edgeCurve(hand, i).slice(0, -1).forEach(p => joined.push(p));
    const ow = ES.outlineWith(corners, prof, symFor(hand));
    if (ow.length !== joined.length || ow.some((p, k) => Math.hypot(p[0] - joined[k][0], p[1] - joined[k][1]) > 1e-12)) throw new Error('outlineWith differs');
  }
  const place = (h, p) => {
    let x = p[0], y = h.f ? -p[1] : p[1];
    const ang = h.k * Math.PI / 3, c = Math.cos(ang), s = Math.sin(ang);
    const P = C.zw.val(h.p), Q = C.zw.val(h.r);
    return [a0 * P[0] + b0 * (H3 * Q[0] - 0.5 * Q[1]) + c * x - s * y, a0 * P[1] + b0 * (0.5 * Q[0] + H3 * Q[1]) + s * x + c * y];
  };
  let worst = 0, bad = 0;
  for (const [x, y] of links) {
    const cx = edgeCurve(hats[x.t].f, x.u).map(p => place(hats[x.t], p));
    let cy = edgeCurve(hats[y.t].f, y.u).map(p => place(hats[y.t], p));
    if (x.fwd !== y.fwd) cy = cy.slice().reverse();
    let d = 0;
    if (cx.length !== cy.length) d = Infinity;
    else cx.forEach((p, k) => { d = Math.max(d, Math.hypot(p[0] - cy[k][0], p[1] - cy[k][1])); });
    worst = Math.max(worst, d);
    if (d > 1e-9) bad++;
  }
  return { worst, bad };
}
const cases = [
  { shape: 'curve', bend: 0.2, bendB: 0.12, arrangement: 'alt', params: { ...ES.DEFAULTS } },
  { shape: 'curve', bend: -0.1, bendB: 0.3, arrangement: 'S', params: { ...ES.DEFAULTS, waves: 2 } },
  { shape: 'triangle', bend: 0.25, bendB: -0.2, arrangement: 'alt', params: { ...ES.DEFAULTS, peak: 0.3 } },
  { shape: 'trapezium', bend: 0.2, bendB: 0.2, arrangement: 'alt', params: { ...ES.DEFAULTS, rise: 0.1, fall: 0.4 } },
  { shape: 'jigsaw', bend: 0.3, bendB: 0.25, arrangement: 'S', params: { ...ES.DEFAULTS } },
  { shape: 'jigsaw', bend: 0.3, bendB: 0, arrangement: 'alt', params: { ...ES.DEFAULTS, neck: 0.8 } }
];
console.log('patch: hats', hats.length, 'shared edges', links.length);
for (const deg of [30, 12, 45, 71]) for (const st of cases) {
  const r = run(deg, st, pageSym), n = run(deg, st, naiveSym);
  console.log(('deg ' + deg).padEnd(7), (st.shape + ' ' + st.arrangement).padEnd(15), 'page rule: worst', r.worst.toExponential(1), 'mismatched', r.bad,
              '| exact mirror: mismatched', n.bad);
}
