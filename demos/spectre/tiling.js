/* Spectre tiling generator. Runs as a Web Worker: the page asks for one
   square chunk of the plane at a time, and the worker answers with the tiles
   whose centres fall inside it.

   The substitution follows Craig Kaplan's reference code for the Spectre
   paper (Smith, Myers, Kaplan and Goodman-Strauss, 2023). Nine labelled
   prototypes are built per level, each one a list of children from the level
   below with an affine transform. The whole plane is one supertile of level
   ROOT_LEVEL, so the tiling is never generated in full: a chunk request walks
   down the hierarchy and skips any branch whose bounding circle misses it.

   Every tile also carries a level for each of its 14 edges and 14 vertices:
   the highest supertile level whose boundary runs along that edge or through
   that vertex. The page draws supertile outlines from these numbers. */
(function (global) {
  'use strict';

  var H = Math.sqrt(3) / 2;

  // Tile(1,1): 14 unit edges, every direction a multiple of 30 degrees.
  var SPECTRE = [
    [0, 0], [1, 0], [1.5, -H], [1.5 + H, 0.5 - H], [1.5 + H, 1.5 - H],
    [2.5 + H, 1.5 - H], [3 + H, 1.5], [3, 2], [3 - H, 1.5],
    [2.5 - H, 1.5 + H], [1.5 - H, 1.5 + H], [0.5 - H, 1.5 + H], [-H, 1.5], [0, 1]
  ];

  var LABELS = ['Gamma1', 'Gamma2', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi'];
  var LABEL_ID = {};
  LABELS.forEach(function (l, i) { LABEL_ID[l] = i; });

  // Supertile boundaries grow about fourfold per level, so levels stop at 5:
  // an edge or vertex marked 5 lies on a boundary of level 5 or higher.
  var LEVEL_CAP = 5;
  // A level-18 supertile spans about 10^9 tile widths. Nobody pans that far.
  var ROOT_LEVEL = 18;

  var IDENT = [1, 0, 0, 0, 1, 0];

  function mul(A, B) {
    return [
      A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
      A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]
    ];
  }
  function trot(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0]; }
  function ttrans(x, y) { return [1, 0, x, 0, 1, y]; }
  function transPt(M, p) { return [M[0] * p[0] + M[1] * p[1] + M[2], M[3] * p[0] + M[4] * p[1] + M[5]]; }
  function transTo(p, q) { return ttrans(q[0] - p[0], q[1] - p[1]); }

  function key(p) { return Math.round(p[0] * 1024) + ',' + Math.round(p[1] * 1024); }

  /* Each prototype records its boundary: its boundary vertices, and its
     boundary edges as pairs of indices into that vertex list, all in local
     coordinates. For each child, edgeMap and vertMap send the child's own
     boundary indices to the parent's, or to -1 where the child's edge or
     vertex lies inside the parent. */
  function mids(node) {
    return node.edges.map(function (e) {
      var a = node.verts[e[0]], b = node.verts[e[1]];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    });
  }

  function makeLeaf(label) {
    var sum = SPECTRE.reduce(function (s, p) { return [s[0] + p[0], s[1] + p[1]]; }, [0, 0]);
    var c = [sum[0] / 14, sum[1] / 14];
    var r = 0;
    SPECTRE.forEach(function (p) { r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1])); });
    var edges = SPECTRE.map(function (p, i) { return [i, (i + 1) % 14]; });
    return { leaf: true, label: LABEL_ID[label], level: 0, verts: SPECTRE.slice(), edges: edges, c: c, r: r };
  }

  function makeMeta(children, transforms, level, withBoundary) {
    var node = { leaf: false, level: level, children: children, transforms: transforms };

    // Bounding circle from the children's circles.
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var cs = children.map(function (ch, i) {
      var p = transPt(transforms[i], ch.c);
      x0 = Math.min(x0, p[0] - ch.r); x1 = Math.max(x1, p[0] + ch.r);
      y0 = Math.min(y0, p[1] - ch.r); y1 = Math.max(y1, p[1] + ch.r);
      return p;
    });
    node.c = [(x0 + x1) / 2, (y0 + y1) / 2];
    node.r = 0;
    cs.forEach(function (p, i) {
      node.r = Math.max(node.r, Math.hypot(p[0] - node.c[0], p[1] - node.c[1]) + children[i].r);
    });

    if (!withBoundary) return node;

    // An edge lies on the parent's boundary when exactly one child has it.
    var count = new Map();
    var edgeKeys = children.map(function (ch, i) {
      return mids(ch).map(function (m) {
        var k = key(transPt(transforms[i], m));
        count.set(k, (count.get(k) || 0) + 1);
        return k;
      });
    });
    var verts = [], vertIndex = new Map(), edges = [], edgeIndex = new Map();
    function vert(p) {
      var k = key(p);
      if (!vertIndex.has(k)) { vertIndex.set(k, verts.length); verts.push(p); }
      return vertIndex.get(k);
    }
    children.forEach(function (ch, i) {
      ch.edges.forEach(function (e, j) {
        var k = edgeKeys[i][j];
        if (count.get(k) !== 1) return;
        edgeIndex.set(k, edges.length);
        edges.push([vert(transPt(transforms[i], ch.verts[e[0]])), vert(transPt(transforms[i], ch.verts[e[1]]))]);
      });
    });
    node.verts = verts;
    node.edges = edges;
    node.edgeMaps = edgeKeys.map(function (keys) {
      return Int32Array.from(keys, function (k) { return count.get(k) === 1 ? edgeIndex.get(k) : -1; });
    });
    // A vertex lies on the parent's boundary when it ends a boundary edge.
    node.vertMaps = children.map(function (ch, i) {
      return Int32Array.from(ch.verts, function (v) {
        var k = key(transPt(transforms[i], v));
        return vertIndex.has(k) ? vertIndex.get(k) : -1;
      });
    });
    return node;
  }

  function buildBase() {
    var sys = {};
    ['Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi'].forEach(function (l) {
      sys[l] = makeLeaf(l);
    });
    // The Mystic: two Spectres, the second turned by 30 degrees. It counts as
    // one level-0 unit, so its inner edge stays a plain tile edge.
    sys.Gamma = makeMeta(
      [makeLeaf('Gamma1'), makeLeaf('Gamma2')],
      [IDENT, mul(ttrans(SPECTRE[8][0], SPECTRE[8][1]), trot(Math.PI / 6))],
      0, true);
    var quad = [SPECTRE[3], SPECTRE[5], SPECTRE[7], SPECTRE[11]];
    Object.keys(sys).forEach(function (l) { sys[l].quad = quad; });
    return sys;
  }

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

  function buildSupertiles(sys, level) {
    var quad = sys.Delta.quad;
    var R = [-1, 0, 0, 0, 1, 0];
    var rules = [[60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1], [0, 2, 0], [60, 3, 1], [-120, 3, 3]];

    var Ts = [IDENT];
    var total = 0, rot = IDENT, tquad = quad.slice();
    rules.forEach(function (rule) {
      var ang = rule[0], from = rule[1], to = rule[2];
      total += ang;
      if (ang !== 0) {
        rot = trot(total * Math.PI / 180);
        tquad = quad.map(function (p) { return transPt(rot, p); });
      }
      var ttt = transTo(tquad[to], transPt(Ts[Ts.length - 1], quad[from]));
      Ts.push(mul(ttt, rot));
    });
    Ts = Ts.map(function (T) { return mul(R, T); });

    var superQuad = [
      transPt(Ts[6], quad[2]), transPt(Ts[5], quad[1]),
      transPt(Ts[3], quad[2]), transPt(Ts[0], quad[1])
    ];

    var out = {};
    Object.keys(SUPER_RULES).forEach(function (lab) {
      var children = [], transforms = [];
      SUPER_RULES[lab].forEach(function (sub, i) {
        if (sub === null) return;
        children.push(sys[sub]);
        transforms.push(Ts[i]);
      });
      out[lab] = makeMeta(children, transforms, level, level <= LEVEL_CAP);
      out[lab].quad = superQuad;
    });
    return out;
  }

  function buildAll() {
    var sys = buildBase();
    for (var lv = 1; lv <= ROOT_LEVEL; lv++) sys = buildSupertiles(sys, lv);
    return sys.Delta;
  }

  /* Walk the hierarchy and call emit(M, edgeLevels, vertexLevels, label)
     for every tile whose centre lies inside the box [x0, x1) x [y0, y1).
     A branch is skipped before its level arrays are built, since a level-4
     supertile has over 3,000 boundary edges. */
  function walk(root, x0, y0, x1, y1, emit) {
    function inside(node, M) {
      var c = node.c;
      var cx = M[0] * c[0] + M[1] * c[1] + M[2], cy = M[3] * c[0] + M[4] * c[1] + M[5];
      if (node.leaf) return cx >= x0 && cx < x1 && cy >= y0 && cy < y1;
      var dx = Math.max(x0 - cx, 0, cx - x1), dy = Math.max(y0 - cy, 0, cy - y1);
      return dx * dx + dy * dy <= node.r * node.r;
    }
    function visit(node, M, eLv, vLv) {
      if (node.leaf) { emit(M, eLv, vLv, node.label); return; }
      for (var i = 0; i < node.children.length; i++) {
        var ch = node.children[i];
        var CM = mul(M, node.transforms[i]);
        if (!inside(ch, CM)) continue;
        var ce = null, cv = null;
        if (node.level <= LEVEL_CAP) {
          // A child's boundary edge inherits this node's level for it where
          // the edge is on this node's boundary too, else takes the child's.
          var own = ch.level, em = node.edgeMaps[i], vm = node.vertMaps[i], j;
          ce = new Uint8Array(em.length);
          for (j = 0; j < em.length; j++) ce[j] = em[j] < 0 ? own : (eLv ? eLv[em[j]] : LEVEL_CAP);
          cv = new Uint8Array(vm.length);
          for (j = 0; j < vm.length; j++) cv[j] = vm[j] < 0 ? own : (vLv ? vLv[vm[j]] : LEVEL_CAP);
        }
        visit(ch, CM, ce, cv);
      }
    }
    if (inside(root, IDENT)) visit(root, IDENT, null, null);
  }

  /* The root sits with its own transform, so the tiling's coordinates run to
     about 10^9. Start the view at the tile nearest the root's centre, which
     sits deep inside the root and far from any edge. */
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

  /* One tile packs into five 32-bit words: the position of its local origin
     as two floats relative to the chunk corner, then three words of bit
     fields. Word 2 holds the orientation (4 bits), the label (4 bits) and
     edges 0 to 7 (3 bits each). Word 3 holds edges 8 to 13 and vertices 0 to
     3. Word 4 holds vertices 4 to 13. */
  function chunk(root, x0, y0, size) {
    var cap = Math.ceil(size * size / 8) + 64;
    var buf = new ArrayBuffer(cap * 20), f = new Float32Array(buf), u = new Uint32Array(buf);
    var n = 0;
    walk(root, x0, y0, x0 + size, y0 + size, function (M, e, v, label) {
      if (n === cap) {
        cap *= 2;
        var nb = new ArrayBuffer(cap * 20);
        new Uint32Array(nb).set(u);
        buf = nb; f = new Float32Array(buf); u = new Uint32Array(buf);
      }
      // ROOT_LEVEL is even, so every tile is a pure rotation of Tile(1,1).
      var ang = Math.round(Math.atan2(M[3], M[0]) / (Math.PI / 6));
      ang = ((ang % 12) + 12) % 12;
      var b = n * 5, j;
      f[b] = M[2] - x0; f[b + 1] = M[5] - y0;
      var w2 = ang | (label << 4);
      for (j = 0; j < 8; j++) w2 |= e[j] << (8 + 3 * j);
      var w3 = 0;
      for (j = 8; j < 14; j++) w3 |= e[j] << (3 * (j - 8));
      for (j = 0; j < 4; j++) w3 |= v[j] << (18 + 3 * j);
      var w4 = 0;
      for (j = 4; j < 14; j++) w4 |= v[j] << (3 * (j - 4));
      u[b + 2] = w2; u[b + 3] = w3; u[b + 4] = w4;
      n++;
    });
    return { buffer: buf.slice(0, n * 20), count: n };
  }

  var api = {
    SPECTRE: SPECTRE, LABELS: LABELS, LEVEL_CAP: LEVEL_CAP, ROOT_LEVEL: ROOT_LEVEL,
    buildAll: buildAll, walk: walk, findStart: findStart, chunk: chunk, mul: mul, transPt: transPt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    // Loaded by the page: expose the shape, and build only if asked to.
    global.SpectreTiling = api;
  } else if (typeof importScripts === 'function') {
    var root = buildAll();
    var start = findStart(root);
    global.postMessage({ type: 'ready', start: start });
    global.onmessage = function (ev) {
      var m = ev.data;
      if (m.type !== 'chunk') return;
      var res = chunk(root, m.i * m.size, m.j * m.size, m.size);
      global.postMessage({ type: 'chunk', id: m.id, i: m.i, j: m.j, count: res.count, buffer: res.buffer }, [res.buffer]);
    };
  }
})(this);
