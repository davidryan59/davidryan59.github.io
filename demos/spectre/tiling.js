/* Spectre tiling generator, run as a Web Worker by index.html. The shared
   machinery (supertile outlines, chunks, corner lookups) lives in
   ../engine/tiling-core.js; this file holds only the Spectre's own rules.

   The substitution follows Craig Kaplan's reference code for the Spectre
   paper (Smith, Myers, Kaplan and Goodman-Strauss, 2023). Nine labelled
   prototypes are built per level, each a list of children from the level
   below with an affine transform. The whole plane is one supertile of level
   ROOT_LEVEL, so the tiling is never generated in full.

   Each prototype also keeps its children's transforms exactly, as two-part
   transforms (see tiling-core.js). Every corner of the tiling lies in
   Z[zeta], and splits exactly into a part along the six directions at even
   multiples of 30 degrees and a part along the six odd ones. The page gives
   those parts the edge lengths a and b, so it can stretch the tiling. */
(function (global) {
  'use strict';

  if (typeof importScripts === 'function' && typeof window === 'undefined' && !global.TilingCore) {
    importScripts('../engine/tiling-core.js');
  }
  var C = global.TilingCore || require('../engine/tiling-core.js');
  var mul = C.mul, transPt = C.transPt, IDENT = C.IDENT, zw = C.zw;

  var H = Math.sqrt(3) / 2;

  // Tile(1,1): 14 unit edges, every direction a multiple of 30 degrees.
  var SPECTRE = [
    [0, 0], [1, 0], [1.5, -H], [1.5 + H, 0.5 - H], [1.5 + H, 1.5 - H],
    [2.5 + H, 1.5 - H], [3 + H, 1.5], [3, 2], [3 - H, 1.5],
    [2.5 - H, 1.5 + H], [1.5 - H, 1.5 + H], [0.5 - H, 1.5 + H], [-H, 1.5], [0, 1]
  ];
  // The same corners as two-part points p + zeta*r. A corner
  // a + b zeta + c zeta^2 + d zeta^3 has p = a + c w and r = b + d w.
  var SPECTRE_TP = [
    [0, 0, 0, 0], [1, 0, 0, 0], [2, 0, -1, 0], [2, 1, -1, 0], [2, 1, -1, 1],
    [3, 1, -1, 1], [3, 1, 0, 1], [3, 0, 0, 2], [3, -1, 0, 2], [2, -1, 1, 2],
    [1, -1, 1, 2], [0, -1, 1, 2], [0, -1, 0, 2], [0, 0, 0, 1]
  ].map(function (v) { return { p: [v[0], v[2]], r: [v[1], v[3]] }; });

  // A level-18 supertile spans about 10^9 tile widths. The level is even, so
  // every tile comes out as a pure rotation of Tile(1,1).
  var ROOT_LEVEL = 18;

  function trot(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0]; }
  function ttrans(x, y) { return [1, 0, x, 0, 1, y]; }
  function transTo(p, q) { return ttrans(q[0] - p[0], q[1] - p[1]); }

  // Exact counterparts: a translation by a two-part point, a turn by n * 60
  // degrees, a 30-degree turn, and the reflection x -> -x of each level.
  function tpShift(v) { return { k: 0, f: 0, p: v.p, r: v.r }; }
  function tpTurn(n) { return { k: ((n % 6) + 6) % 6, f: 0, p: [0, 0], r: [0, 0] }; }
  var TP_TURN30 = { k: 0, h: 1, f: 0, p: [0, 0], r: [0, 0] };
  var TP_FLIP = { k: 3, f: 1, p: [0, 0], r: [0, 0] };
  function tpSub(x, y) { return { p: zw.sub(x.p, y.p), r: zw.sub(x.r, y.r) }; }

  var SUPER_RULES = {
    Gamma:  ['Pi', 'Delta', null, 'Theta', 'Sigma', 'Xi', 'Phi', 'Gamma'],
    Delta:  ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
    Theta:  ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
    Lambda: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
    Xi:     ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
    Pi:     ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
    Sigma:  ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Lambda', 'Gamma'],
    Phi:    ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
    Psi:    ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma']
  };

  function buildBase() {
    var leaf = C.makeLeaf(SPECTRE);
    var sys = {};
    ['Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi'].forEach(function (l) { sys[l] = leaf; });
    // The Mystic: two Spectres, the second turned by 30 degrees. It counts as
    // one level-0 unit, so its inner edge stays a plain tile edge.
    sys.Gamma = C.makeMeta([leaf, leaf], [IDENT, mul(ttrans(SPECTRE[8][0], SPECTRE[8][1]), trot(Math.PI / 6))], 0, true);
    sys.Gamma.TP = [C.TP_IDENT, C.tpCompose(tpShift(SPECTRE_TP[8]), TP_TURN30)];
    sys.quad = [SPECTRE[3], SPECTRE[5], SPECTRE[7], SPECTRE[11]];
    sys.quadTP = [SPECTRE_TP[3], SPECTRE_TP[5], SPECTRE_TP[7], SPECTRE_TP[11]];
    return sys;
  }

  function buildSupertiles(sys, level) {
    var quad = sys.quad, quadTP = sys.quadTP;
    var R = [-1, 0, 0, 0, 1, 0];
    var rules = [[60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1], [0, 2, 0], [60, 3, 1], [-120, 3, 3]];
    var Ts = [IDENT], total = 0, rot = IDENT, tquad = quad.slice();
    var Te = [C.TP_IDENT], rotE = C.TP_IDENT, tquadE = quadTP.slice();
    rules.forEach(function (rule) {
      total += rule[0];
      if (rule[0] !== 0) {
        rot = trot(total * Math.PI / 180);
        tquad = quad.map(function (p) { return transPt(rot, p); });
        rotE = tpTurn(total / 60);
        tquadE = quadTP.map(function (p) { return C.tpApply(rotE, p); });
      }
      Ts.push(mul(transTo(tquad[rule[2]], transPt(Ts[Ts.length - 1], quad[rule[1]])), rot));
      var shift = tpSub(C.tpApply(Te[Te.length - 1], quadTP[rule[1]]), tquadE[rule[2]]);
      Te.push(C.tpCompose(tpShift(shift), rotE));
    });
    Ts = Ts.map(function (T) { return mul(R, T); });
    Te = Te.map(function (T) { return C.tpCompose(TP_FLIP, T); });
    var out = {};
    Object.keys(SUPER_RULES).forEach(function (lab) {
      var children = [], transforms = [], exact = [];
      SUPER_RULES[lab].forEach(function (sub, i) {
        if (sub === null) return;
        children.push(sys[sub]);
        transforms.push(Ts[i]);
        exact.push(Te[i]);
      });
      out[lab] = C.makeMeta(children, transforms, level, level <= C.LEVEL_CAP);
      out[lab].TP = exact;
    });
    out.quad = [transPt(Ts[6], quad[2]), transPt(Ts[5], quad[1]), transPt(Ts[3], quad[2]), transPt(Ts[0], quad[1])];
    out.quadTP = [C.tpApply(Te[6], quadTP[2]), C.tpApply(Te[5], quadTP[1]), C.tpApply(Te[3], quadTP[2]), C.tpApply(Te[0], quadTP[1])];
    return out;
  }

  function cornersTP(T) {
    return SPECTRE_TP.map(function (v) { var x = C.tpApply(T, v); return { P: zw.val(x.p), R: zw.val(x.r) }; });
  }
  function zetaOf(v) { return [H * v[0] - 0.5 * v[1], 0.5 * v[0] + H * v[1]]; }

  // Start at the tile nearest the root's centre: deep inside, far from any
  // edge. Returns its centre as a two-part point.
  function findStart(root) {
    var node = root, M = IDENT, T = C.TP_IDENT, target = root.c;
    while (!node.leaf) {
      var best = -1, bestD = Infinity;
      for (var i = 0; i < node.children.length; i++) {
        var p = transPt(mul(M, node.transforms[i]), node.children[i].c);
        var d = Math.hypot(p[0] - target[0], p[1] - target[1]);
        if (d < bestD) { bestD = d; best = i; }
      }
      M = mul(M, node.transforms[best]);
      T = C.tpCompose(T, node.TP[best]);
      node = node.children[best];
    }
    var sp = [0, 0], sr = [0, 0];
    cornersTP(T).forEach(function (c) {
      sp[0] += c.P[0] / 14; sp[1] += c.P[1] / 14; sr[0] += c.R[0] / 14; sr[1] += c.R[1] / 14;
    });
    return { P: sp, R: sr };
  }

  function build() {
    var sys = buildBase();
    for (var lv = 1; lv <= ROOT_LEVEL; lv++) sys = buildSupertiles(sys, lv);
    var root = sys.Delta;
    var start = findStart(root);

    // The large-scale slope between the two parts: p is close to
    // kappa * zeta * r for distant tiles. The page uses it to guess where
    // tiles land when a and b differ.
    var ks = [0, 0], nk = 0;
    for (var a = 0; a < root.children.length; a++) for (var b = a + 1; b < root.children.length; b++) {
      var dp = zw.val(zw.sub(root.TP[b].p, root.TP[a].p));
      var dr = zetaOf(zw.val(zw.sub(root.TP[b].r, root.TP[a].r)));
      var den = dr[0] * dr[0] + dr[1] * dr[1];
      if (den < 1) continue;
      ks[0] += (dp[0] * dr[0] + dp[1] * dr[1]) / den; ks[1] += (dp[1] * dr[0] - dp[0] * dr[1]) / den; nk++;
    }
    var kappa = [ks[0] / nk, ks[1] / nk];

    // How far single tiles stray from that slope, over the tiles near the
    // start as they sit in the plane. Inside a supertile's own frame the
    // slope would differ: every odd level is mirrored, which conjugates it.
    var devs = [], zs = zetaOf(start.R), cx = start.P[0] + zs[0], cy = start.P[1] + zs[1];
    C.walk(root, IDENT, [cx - 300, cy - 300, cx + 300, cy + 300], function (M, T) {
      var P = zw.val(T.p), R = zetaOf(zw.val(T.r));
      devs.push([P[0] - (kappa[0] * R[0] - kappa[1] * R[1]), P[1] - (kappa[0] * R[1] + kappa[1] * R[0])]);
    });
    var mx = 0, my = 0;
    devs.forEach(function (d) { mx += d[0] / devs.length; my += d[1] / devs.length; });
    var spread = 0;
    devs.forEach(function (d) { spread = Math.max(spread, Math.hypot(d[0] - mx, d[1] - my)); });

    return {
      root: root,
      rootM: IDENT,
      place: function (M, T) { return { p: T.p, r: T.r, turn: 2 * T.k + (T.h || 0), flip: T.f }; },
      corners: function (M, T) { return cornersTP(T); },
      info: { start: start, kappa: kappa, spread: spread }
    };
  }

  var api = { SPECTRE: SPECTRE, SPECTRE_TP: SPECTRE_TP, ROOT_LEVEL: ROOT_LEVEL, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SpectreTiling = api;
  if (typeof window === 'undefined') C.serve(build);
})(typeof self !== 'undefined' ? self : this);
