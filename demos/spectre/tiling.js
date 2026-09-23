/* Spectre tiling generator, run as a Web Worker by index.html. The shared
   machinery (supertile outlines, chunks, corner lookups) lives in
   ../engine/tiling-core.js; this file holds only the Spectre's own rules.

   The substitution follows Craig Kaplan's reference code for the Spectre
   paper (Smith, Myers, Kaplan and Goodman-Strauss, 2023). Nine labelled
   prototypes are built per level, each a list of children from the level
   below with an affine transform. The whole plane is one supertile of level
   ROOT_LEVEL, so the tiling is never generated in full. */
(function (global) {
  'use strict';

  if (typeof importScripts === 'function' && typeof window === 'undefined' && !global.TilingCore) {
    importScripts('../engine/tiling-core.js');
  }
  var C = global.TilingCore || require('../engine/tiling-core.js');
  var mul = C.mul, transPt = C.transPt, IDENT = C.IDENT;

  var H = Math.sqrt(3) / 2;

  // Tile(1,1): 14 unit edges, every direction a multiple of 30 degrees.
  var SPECTRE = [
    [0, 0], [1, 0], [1.5, -H], [1.5 + H, 0.5 - H], [1.5 + H, 1.5 - H],
    [2.5 + H, 1.5 - H], [3 + H, 1.5], [3, 2], [3 - H, 1.5],
    [2.5 - H, 1.5 + H], [1.5 - H, 1.5 + H], [0.5 - H, 1.5 + H], [-H, 1.5], [0, 1]
  ];

  // A level-18 supertile spans about 10^9 tile widths. The level is even, so
  // every tile comes out as a pure rotation of Tile(1,1).
  var ROOT_LEVEL = 18;

  function trot(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0]; }
  function ttrans(x, y) { return [1, 0, x, 0, 1, y]; }
  function transTo(p, q) { return ttrans(q[0] - p[0], q[1] - p[1]); }

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
    sys.quad = [SPECTRE[3], SPECTRE[5], SPECTRE[7], SPECTRE[11]];
    return sys;
  }

  function buildSupertiles(sys, level) {
    var quad = sys.quad;
    var R = [-1, 0, 0, 0, 1, 0];
    var rules = [[60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1], [0, 2, 0], [60, 3, 1], [-120, 3, 3]];
    var Ts = [IDENT], total = 0, rot = IDENT, tquad = quad.slice();
    rules.forEach(function (rule) {
      total += rule[0];
      if (rule[0] !== 0) {
        rot = trot(total * Math.PI / 180);
        tquad = quad.map(function (p) { return transPt(rot, p); });
      }
      Ts.push(mul(transTo(tquad[rule[2]], transPt(Ts[Ts.length - 1], quad[rule[1]])), rot));
    });
    Ts = Ts.map(function (T) { return mul(R, T); });
    var out = {};
    Object.keys(SUPER_RULES).forEach(function (lab) {
      var children = [], transforms = [];
      SUPER_RULES[lab].forEach(function (sub, i) {
        if (sub === null) return;
        children.push(sys[sub]);
        transforms.push(Ts[i]);
      });
      out[lab] = C.makeMeta(children, transforms, level, level <= C.LEVEL_CAP);
    });
    out.quad = [transPt(Ts[6], quad[2]), transPt(Ts[5], quad[1]), transPt(Ts[3], quad[2]), transPt(Ts[0], quad[1])];
    return out;
  }

  // Start at the tile nearest the root's centre: deep inside, far from any edge.
  function findStart(root) {
    var node = root, M = IDENT, target = root.c;
    while (!node.leaf) {
      var best = -1, bestD = Infinity;
      for (var i = 0; i < node.children.length; i++) {
        var p = transPt(mul(M, node.transforms[i]), node.children[i].c);
        var d = Math.hypot(p[0] - target[0], p[1] - target[1]);
        if (d < bestD) { bestD = d; best = i; }
      }
      M = mul(M, node.transforms[best]);
      node = node.children[best];
    }
    return transPt(M, node.c);
  }

  function build() {
    var sys = buildBase();
    for (var lv = 1; lv <= ROOT_LEVEL; lv++) sys = buildSupertiles(sys, lv);
    var root = sys.Delta;
    var start = findStart(root);
    return {
      root: root,
      rootM: IDENT,
      place: function (M) {
        var turn = Math.round(Math.atan2(M[3], M[0]) / (Math.PI / 6));
        return { P: [M[2], M[5]], turn: ((turn % 12) + 12) % 12, flip: 0 };
      },
      corners: function (M) {
        return SPECTRE.map(function (v) { return { P: transPt(M, v), R: [0, 0] }; });
      },
      info: { start: { P: start, R: [0, 0] } }
    };
  }

  var api = { SPECTRE: SPECTRE, ROOT_LEVEL: ROOT_LEVEL, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.SpectreTiling = api;
  if (typeof window === 'undefined') C.serve(build);
})(typeof self !== 'undefined' ? self : this);
