/* Prints a patch of hats as JSON for rigidity.py: each hat's turn, hand and
   placement at the hat's own shape, the prototype corners, and every pair
   of hat corners that coincide. The first argument is the Kaplan level. */
const path = require('path');
const R = path.join(__dirname, '..', '..', 'app', 'tiles') + '/';
const C = require(R + 'engine/tiling-core.js');
const HT = require(R + 'hat/tiling.js');
const built = HT.build();
const LEVEL = +(process.argv[2] || 3);
let node = built.root, T = C.TP_IDENT;
while (node.level > LEVEL) { T = C.tpCompose(T, node.TP[0]); node = node.children[0]; }
const hats = [];
(function walk(n, Tn) { if (n.leaf) { hats.push(Tn); return; } n.children.forEach((c, i) => walk(c, C.tpCompose(Tn, n.TP[i]))); })(node, T);
const TP = HT.HAT_TP, H3 = Math.sqrt(3) / 2, b = Math.sqrt(3);
const val = x => { const P = C.zw.val(x.p), Q = C.zw.val(x.r); return [P[0] + b * (H3 * Q[0] - 0.5 * Q[1]), P[1] + b * (0.5 * Q[0] + H3 * Q[1])]; };
const ck = x => x.p.join(',') + '|' + x.r.join(',');
const corners = new Map();
const tiles = hats.map((h, t) => {
  TP.forEach((v, u) => { const k = ck(C.tpApply(h, v)); if (!corners.has(k)) corners.set(k, []); corners.get(k).push([t, u]); });
  const x = C.tpApply(h, TP[0]), Q = C.zw.val(x.r);
  return { k: h.k, f: h.f, t: val(x), tr: [H3 * Q[0] - 0.5 * Q[1], 0.5 * Q[0] + H3 * Q[1]] };
});
const pairs = [];
corners.forEach(l => { for (let i = 1; i < l.length; i++) pairs.push([l[0][0], l[0][1], l[i][0], l[i][1]]); });
const proto = TP.map(v => val(v));
const protoR = TP.map(v => { const Q = C.zw.val(v.r); return [H3 * Q[0] - 0.5 * Q[1], 0.5 * Q[0] + H3 * Q[1]]; });
process.stdout.write(JSON.stringify({ tiles, pairs, proto, protoR }));
