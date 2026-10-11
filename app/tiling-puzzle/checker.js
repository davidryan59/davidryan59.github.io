/* The Tiling Puzzle's checker for the Hat and the Spectre, run as a Web
   Worker by puzzle.js. The specification is docs/tiling-puzzle.md, "The Hat
   and Spectre checker (phase 6)".

   The worker builds a large patch of the real tiling, the reference, and
   searches it for the visitor's patch. Every Hat tiling holds the same
   finite patches, so a patch that appears nowhere in the reference cannot
   grow into a tiling, as long as the reference is large enough. The
   calibration in tools/tiling-puzzle/check-phase6.js sets R_REF.

   Frames. The reference sits in the explorer's own frame, moved so that
   corner 0 of the tile nearest the hierarchy's start lies on the origin.
   Positions are subtracted in exact two-part form before they become
   floats, since that tile lies about 10^8 tile widths from the file's
   origin. Tiles use the board's convention: a tile is {flip, turn, x, y},
   the piece mirrored when flip is 1 (x -> -x), turned by turn steps, then
   moved by (x, y). A motion g is {f, k, tx, ty}: mirror when f is 1, turn
   by k steps, then move by (tx, ty). A tile is the motion (flip, turn, x, y)
   applied to the piece at turn 0.

   A match is a motion g that carries every tile of the visitor's patch onto
   a reference tile. Corners match to 1e-6: a grid on each tile's area
   centroid finds the one candidate, and then the full corner set is
   compared. The match set M holds every match with its anchor, the image of
   the first tile, within R_in = R_ref - D_MAX of the centre. Each new tile
   filters M with one lookup per motion.

   The file has a Node fallback, createHandler, so tools/tiling-puzzle runs
   the same code under Node, and the page runs it without workers. */
(function (global) {
  'use strict';

  const inWorker = typeof importScripts === 'function' && typeof window === 'undefined';
  if (inWorker && !global.TilingBoard) {
    importScripts('../tiles/engine/tiling-core.js', '../tiles/hat/tiling.js', '../tiles/spectre/tiling.js', 'board.js');
  }
  const C = global.TilingCore || require('../tiles/engine/tiling-core.js');
  const TB = global.TilingBoard || require('./board.js');

  const D_MAX = 25;          // the largest patch checked, in tile widths
  const TOL = 1e-6;          // two corners are one corner within this
  const CATALOGUE_R = 30;    // the edge contacts are read within this, in tile widths
  // Radii are whole numbers of tile widths, and the Hat's width is sqrt 39,
  // so a centroid can lie exactly on the rim. The slack settles such a tie
  // the same way whichever route measures it.
  const SLACK = 1 + 1e-9;

  /* The shipped reference radius in tile widths: twice the radius at which
     every calibration sample is found (docs/tiling-puzzle.md). */
  const R_REF = { hat: 240, spectre: 240 };

  const KINDS = {
    hat: { global: 'HatTiling', path: '../tiles/hat/tiling.js', tp: 'HAT_TP', b: Math.sqrt(3), name: 'Hat', reflect: true },
    spectre: { global: 'SpectreTiling', path: '../tiles/spectre/tiling.js', tp: 'SPECTRE_TP', b: 1, name: 'Spectre', reflect: false }
  };
  function tilingFile(kind) {
    const k = KINDS[kind];
    if (!k) throw new Error('No checker for the piece "' + kind + '".');
    return global[k.global] || require(k.path);
  }

  const H3 = Math.sqrt(3) / 2;
  function zeta(r) { return [H3 * r[0] - 0.5 * r[1], 0.5 * r[0] + H3 * r[1]]; }
  function mod(a, n) { return ((a % n) + n) % n; }

  /* ------------------------------------------------------------ motions */

  /* The motion tables for a piece: cos and sin of each turn. */
  function motionKit(piece) {
    const T = piece.turns, COS = new Float64Array(T), SIN = new Float64Array(T);
    for (let k = 0; k < T; k++) { COS[k] = Math.cos(k * piece.step); SIN[k] = Math.sin(k * piece.step); }
    // Exact zeros keep the 90-degree turns clean.
    for (let k = 0; k < T; k++) { if (Math.abs(COS[k]) < 1e-15) COS[k] = 0; if (Math.abs(SIN[k]) < 1e-15) SIN[k] = 0; }
    return {
      T: T, COS: COS, SIN: SIN,
      /* g applied to the point (x, y). */
      point: function (g, x, y) {
        const u = g.f ? -x : x;
        return [COS[g.k] * u - SIN[g.k] * y + g.tx, SIN[g.k] * u + COS[g.k] * y + g.ty];
      },
      /* g applied to a tile. */
      tile: function (g, t) {
        const u = g.f ? -t.x : t.x;
        return {
          flip: g.f ^ t.flip, turn: mod(g.k + (g.f ? -t.turn : t.turn), T),
          x: COS[g.k] * u - SIN[g.k] * t.y + g.tx, y: SIN[g.k] * u + COS[g.k] * t.y + g.ty
        };
      },
      /* The motion undone: mirror, turn back, move back. */
      inverse: function (g) {
        const k = g.f ? g.k : mod(-g.k, T);
        const u = g.f ? -g.tx : g.tx;
        return { f: g.f, k: k, tx: -(COS[k] * u - SIN[k] * g.ty), ty: -(SIN[k] * u + COS[k] * g.ty) };
      },
      /* The motion that carries the piece at turn 0 onto a tile. */
      ofTile: function (t) { return { f: t.flip, k: t.turn, tx: t.x, ty: t.y }; }
    };
  }

  /* Whether two corner lists are the same set of points, within TOL. The
     first corner of P picks its partner in Q, and the rest follow in order
     or in reverse. A full search covers any other case. */
  function sameCornerSet(pxs, pys, qxs, qys, n) {
    let j0 = -1;
    for (let j = 0; j < n; j++) {
      if (Math.abs(pxs[0] - qxs[j]) < TOL && Math.abs(pys[0] - qys[j]) < TOL) { j0 = j; break; }
    }
    if (j0 < 0) return false;
    for (let dir = 1; dir >= -1; dir -= 2) {
      let ok = true;
      for (let i = 1; i < n && ok; i++) {
        const j = mod(j0 + dir * i, n);
        ok = Math.abs(pxs[i] - qxs[j]) < TOL && Math.abs(pys[i] - qys[j]) < TOL;
      }
      if (ok) return true;
    }
    for (let i = 0; i < n; i++) {
      let hit = false;
      for (let j = 0; j < n && !hit; j++) hit = Math.abs(pxs[i] - qxs[j]) < TOL && Math.abs(pys[i] - qys[j]) < TOL;
      if (!hit) return false;
    }
    return true;
  }

  /* Whether two outlines share a whole edge, one running each way. */
  function shareEdge(P, Q) {
    const n = P.n, m = Q.n, e2 = 1e-7;
    for (let e = 0; e < n; e++) {
      const e1 = (e + 1) % n;
      for (let f = 0; f < m; f++) {
        const f1 = (f + 1) % m;
        if (Math.abs(P.xs[e] - Q.xs[f1]) < e2 && Math.abs(P.ys[e] - Q.ys[f1]) < e2 &&
            Math.abs(P.xs[e1] - Q.xs[f]) < e2 && Math.abs(P.ys[e1] - Q.ys[f]) < e2) return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------- the reference */

  /* Every tile whose area centroid lies within `radius` tile widths of the
     centre tile. The centre tile is the one nearest the hierarchy's start,
     moved by `at` (in tile units) for a distant region. Options:
       radius   in tile widths (default R_REF[kind])
       at       [dx, dy] from the start, in tile units (default [0, 0])
       ctx      a tiling built before, to share
       piece    a piece type built before, to share */
  function buildReference(kind, opts) {
    opts = opts || {};
    const started = Date.now();
    const K = KINDS[kind], file = tilingFile(kind), TP = file[K.tp];
    const piece = opts.piece || TB.pieceType(kind);
    const ctx = opts.ctx || file.build();
    const builtAt = Date.now();
    const T = piece.turns, n = piece.n, width = piece.width, b = K.b;
    const nO = (piece.flips ? 2 : 1) * T;
    const VAR = [];
    for (let o = 0; o < nO; o++) VAR.push(TB.variant(piece, o >= T ? 1 : 0, o % T));
    const per30 = 12 / T;
    const radius = opts.radius || R_REF[kind];
    const R = radius * width, Rin = Math.max(0, radius - D_MAX) * width;

    // The board's orientation for a two-part transform. The file turns by
    // (2k + h) * 30 degrees after a reflection y -> -y, which is a half turn
    // after the board's mirror x -> -x.
    function orient(Tt) {
      let j = 2 * Tt.k + (Tt.h ? 1 : 0), flip = 0;
      if (Tt.f) {
        if (!piece.flips) throw new Error('A mirrored ' + K.name + ' in the tiling.');
        flip = 1; j += 6;
      }
      j = mod(j, 12);
      if (j % per30) throw new Error('A ' + K.name + ' turned off the step of ' + (360 / T) + ' degrees.');
      return flip * T + j / per30;
    }
    function absCorner0(Tt) {
      const c = C.tpApply(Tt, TP[0]), P = C.zw.val(c.p), z = zeta(C.zw.val(c.r));
      return [P[0] + b * z[0], P[1] + b * z[1]];
    }

    const st = ctx.info.start, zs = zeta(st.R), at = opts.at || [0, 0];
    const cf = [st.P[0] + b * zs[0] + at[0], st.P[1] + b * zs[1] + at[1]];

    // The centre tile: its corner 0 becomes the origin, exactly.
    let O = null, oc = 0, bestD = Infinity;
    C.walk(ctx.root, ctx.rootM, [cf[0] - width, cf[1] - width, cf[0] + width, cf[1] + width], function (M, Tt) {
      const o = orient(Tt), c0 = absCorner0(Tt), V = VAR[o];
      const d = Math.hypot(c0[0] - V.xs[0] + V.cx - cf[0], c0[1] - V.ys[0] + V.cy - cf[1]);
      if (d < bestD) { bestD = d; O = C.tpApply(Tt, TP[0]); oc = o; }
    });
    if (!O) throw new Error('No tile near the centre.');
    const centre = [VAR[oc].cx - VAR[oc].xs[0], VAR[oc].cy - VAR[oc].ys[0]];

    // The tiles, as area centroids and orientations.
    let cap = Math.ceil(Math.PI * R * R / piece.area * 1.1) + 64;
    let CX = new Float64Array(cap), CY = new Float64Array(cap), OR = new Uint8Array(cap), count = 0;
    const reach = R + width;
    C.walk(ctx.root, ctx.rootM, [cf[0] - reach, cf[1] - reach, cf[0] + reach, cf[1] + reach], function (M, Tt) {
      const o = orient(Tt), c = C.tpApply(Tt, TP[0]);
      const P = C.zw.val(C.zw.sub(c.p, O.p)), z = zeta(C.zw.val(C.zw.sub(c.r, O.r))), V = VAR[o];
      const cx = P[0] + b * z[0] - V.xs[0] + V.cx, cy = P[1] + b * z[1] - V.ys[0] + V.cy;
      const dx = cx - centre[0], dy = cy - centre[1];
      if (dx * dx + dy * dy > R * R * SLACK) return;
      if (count === cap) {
        cap *= 2;
        const a = new Float64Array(cap), bb = new Float64Array(cap), cc = new Uint8Array(cap);
        a.set(CX); bb.set(CY); cc.set(OR); CX = a; CY = bb; OR = cc;
      }
      CX[count] = cx; CY[count] = cy; OR[count] = o; count++;
    });
    CX = CX.slice(0, count); CY = CY.slice(0, count); OR = OR.slice(0, count);

    // A grid of cells one tile width across, over the centroids. A centroid
    // within TOL of a cell's side goes in both cells, so a lookup only ever
    // reads the one cell its point falls in.
    const cell = width, G = Math.ceil((R + 2 * width) / cell), gn = 2 * G + 1;
    const gx0 = centre[0] - G * cell, gy0 = centre[1] - G * cell;
    const head = new Int32Array(gn * gn).fill(-1);
    let eTile = new Int32Array(count + 1024), eNext = new Int32Array(count + 1024), entries = 0;
    function push(c, i) {
      if (entries === eTile.length) {
        const a = new Int32Array(entries * 2), bb = new Int32Array(entries * 2);
        a.set(eTile); bb.set(eNext); eTile = a; eNext = bb;
      }
      eTile[entries] = i; eNext[entries] = head[c]; head[c] = entries++;
    }
    for (let i = 0; i < count; i++) {
      const ix0 = Math.floor((CX[i] - TOL - gx0) / cell), ix1 = Math.floor((CX[i] + TOL - gx0) / cell);
      const iy0 = Math.floor((CY[i] - TOL - gy0) / cell), iy1 = Math.floor((CY[i] + TOL - gy0) / cell);
      for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) push(ix * gn + iy, i);
    }

    /* The tile whose centroid is (cx, cy) within TOL, or -1. */
    function find(cx, cy) {
      const ix = Math.floor((cx - gx0) / cell), iy = Math.floor((cy - gy0) / cell);
      if (ix < 0 || iy < 0 || ix >= gn || iy >= gn) return -1;
      for (let e = head[ix * gn + iy]; e >= 0; e = eNext[e]) {
        const i = eTile[e];
        if (Math.abs(CX[i] - cx) < TOL && Math.abs(CY[i] - cy) < TOL) return i;
      }
      return -1;
    }
    /* The tiles whose centroids lie within r of (cx, cy). */
    function near(cx, cy, r) {
      const out = [], seen = new Set();
      const ix0 = Math.max(0, Math.floor((cx - r - gx0) / cell)), ix1 = Math.min(gn - 1, Math.floor((cx + r - gx0) / cell));
      const iy0 = Math.max(0, Math.floor((cy - r - gy0) / cell)), iy1 = Math.min(gn - 1, Math.floor((cy + r - gy0) / cell));
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iy = iy0; iy <= iy1; iy++) {
          for (let e = head[ix * gn + iy]; e >= 0; e = eNext[e]) {
            const i = eTile[e];
            if (seen.has(i)) continue;
            seen.add(i);
            if (Math.hypot(CX[i] - cx, CY[i] - cy) <= r) out.push(i);
          }
        }
      }
      return out;
    }
    function tileOf(i) {
      const o = OR[i], V = VAR[o];
      return { flip: o >= T ? 1 : 0, turn: o % T, x: CX[i] - V.cx, y: CY[i] - V.cy };
    }
    function poly(i) {
      const V = VAR[OR[i]];
      return TB.shifted(V, CX[i] - V.cx, CY[i] - V.cy);
    }
    function distance(i) { return Math.hypot(CX[i] - centre[0], CY[i] - centre[1]); }

    return {
      kind: kind, name: K.name, reflect: K.reflect, piece: piece, ctx: ctx, VAR: VAR,
      radius: radius, R: R, Rin: Rin, width: width, centre: centre, origin: O,
      count: count, CX: CX, CY: CY, OR: OR,
      find: find, near: near, tileOf: tileOf, poly: poly, distance: distance,
      ms: { tiling: builtAt - started, reference: Date.now() - builtAt }
    };
  }

  /* --------------------------------------------------------- the matcher */

  /* The matching machinery over one reference: the shift templates, the
     motions of the anchors, lookups and the edge contact catalogue. */
  function createMatcher(ref, opts) {
    opts = opts || {};
    const piece = ref.piece, n = piece.n, T = piece.turns, VAR = ref.VAR;
    const kit = motionKit(piece);
    const COS = kit.COS, SIN = kit.SIN;
    const classes = piece.flips ? 2 : 1;

    // Shift templates. For each orientation class of anchor, test every
    // cyclic shift of its corner list, and of the reversed list where
    // reflections are allowed: a shift is kept when every edge length and
    // turning angle agrees. Lengths and angles do not change under a
    // motion, so one test per class serves every anchor in it.
    function shape(V) {
      const len = new Float64Array(n), ext = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, h = (i + n - 1) % n;
        len[i] = Math.hypot(V.xs[j] - V.xs[i], V.ys[j] - V.ys[i]);
        const a0 = Math.atan2(V.ys[i] - V.ys[h], V.xs[i] - V.xs[h]), a1 = Math.atan2(V.ys[j] - V.ys[i], V.xs[j] - V.xs[i]);
        ext[i] = mod(a1 - a0 + Math.PI, 2 * Math.PI) - Math.PI;
      }
      return { len: len, ext: ext };
    }
    const U = VAR[0], US = shape(U);
    const templates = [];
    for (let cls = 0; cls < classes; cls++) {
      const A = shape(VAR[cls * T]), list = [];
      for (let rev = 0; rev <= (ref.reflect ? 1 : 0); rev++) {
        for (let s = 0; s < n; s++) {
          let ok = true;
          for (let j = 0; j < n && ok; j++) {
            const lenA = rev ? A.len[mod(s - j - 1, n)] : A.len[(s + j) % n];
            const extA = rev ? A.ext[mod(s - j, n)] : A.ext[(s + j) % n];
            ok = Math.abs(US.len[j] - lenA) < TOL && Math.abs(US.ext[j] - extA) < TOL;
          }
          if (ok) list.push({ rev: rev, s: s });
        }
      }
      templates.push(list);
    }
    const NT = Math.max(1, Math.max.apply(null, templates.map(function (l) { return l.length; })));

    // For each anchor orientation and template, the motion's mirror, turn
    // and the part of its move that the orientation fixes. The first tile
    // sits at turn 0 on the origin, so its corners are VAR[0].
    const MT = [];
    for (let o = 0; o < VAR.length; o++) {
      const A = VAR[o], cls = o >= T ? 1 : 0, row = [];
      templates[cls].forEach(function (tp) {
        const s = tp.s, s1 = tp.rev ? mod(s - 1, n) : (s + 1) % n, f = tp.rev;
        const ax = A.xs[s1] - A.xs[s], ay = A.ys[s1] - A.ys[s];
        const ux = (U.xs[1] - U.xs[0]) * (f ? -1 : 1), uy = U.ys[1] - U.ys[0];
        const k = mod(Math.round((Math.atan2(ay, ax) - Math.atan2(uy, ux)) / piece.step), T);
        const u0 = f ? -U.xs[0] : U.xs[0];
        row.push({ f: f, k: k, sx: A.xs[s] - (COS[k] * u0 - SIN[k] * U.ys[0]), sy: A.ys[s] - (SIN[k] * u0 + COS[k] * U.ys[0]) });
      });
      MT.push(row);
    }

    /* The motion with id = anchor * NT + template. */
    function motion(id) {
      const i = Math.floor(id / NT), m = MT[ref.OR[i]][id - i * NT], V = VAR[ref.OR[i]];
      return { f: m.f, k: m.k, tx: ref.CX[i] - V.cx + m.sx, ty: ref.CY[i] - V.cy + m.sy };
    }
    function anchorOf(id) { return Math.floor(id / NT); }

    /* Every motion whose anchor lies within R_in. */
    function allMotions() {
      const out = [];
      for (let i = 0; i < ref.count; i++) {
        if (ref.distance(i) > ref.Rin * SLACK) continue;
        const k = MT[ref.OR[i]].length;
        for (let t = 0; t < k; t++) out.push(i * NT + t);
      }
      return Int32Array.from(out);
    }

    /* A user tile with its corners and centroid, for lookups. */
    function userTile(t) {
      const V = VAR[(t.flip ? T : 0) + t.turn];
      return { flip: t.flip ? 1 : 0, turn: t.turn, x: t.x, y: t.y, cx: t.x + V.cx, cy: t.y + V.cy, V: V };
    }

    /* The reference tile that motion g carries user tile u onto, or -1.
       The centroid finds the candidate, and the full corner set decides. */
    const gx = new Float64Array(64), gy = new Float64Array(64);
    function lookup(g, u) {
      const c = COS[g.k], s = SIN[g.k];
      let x = g.f ? -u.cx : u.cx;
      const cx = c * x - s * u.cy + g.tx, cy = s * x + c * u.cy + g.ty;
      const i = ref.find(cx, cy);
      if (i < 0) return -1;
      const o = (g.f ^ u.flip) * T + mod(g.k + (g.f ? -u.turn : u.turn), T);
      if (ref.OR[i] !== o) return -1;
      const V = u.V, R = VAR[o], ox = ref.CX[i] - R.cx, oy = ref.CY[i] - R.cy;
      for (let j = 0; j < n; j++) {
        x = V.xs[j] + u.x;
        if (g.f) x = -x;
        const y = V.ys[j] + u.y;
        gx[j] = c * x - s * y + g.tx - ox;
        gy[j] = s * x + c * y + g.ty - oy;
      }
      return sameCornerSet(gx, gy, R.xs, R.ys, n) ? i : -1;
    }

    /* The motions of M that also carry u onto the reference. */
    function filter(M, u) {
      const out = new Int32Array(M.length);
      let k = 0;
      for (let q = 0; q < M.length; q++) if (lookup(motion(M[q]), u) >= 0) out[k++] = M[q];
      return out.slice(0, k);
    }

    // The edge contacts: every way a tile shares an edge with another in
    // the reference, as the second tile in the first tile's frame. The
    // catalogue allows the same motions as a match. It is read within
    // CATALOGUE_R of the centre, and check-phase6.js confirms that the whole
    // reference holds no other contact.
    function frameOf(t, rotOnly) {
      const g = kit.ofTile(t);
      if (rotOnly) g.f = 0;
      return kit.inverse(g);
    }
    function sameTile(a, b) {
      return a.flip === b.flip && a.turn === b.turn && Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;
    }
    function contactsWithin(radiusWidths, rotOnly, split) {
      const lists = split ? [[], []] : [[]];
      const rr = radiusWidths * ref.width;
      for (let i = 0; i < ref.count; i++) {
        if (ref.distance(i) > rr) continue;
        const A = ref.tileOf(i), P = ref.poly(i), inv = frameOf(A, rotOnly), list = lists[split ? A.flip : 0];
        ref.near(ref.CX[i], ref.CY[i], ref.width).forEach(function (j) {
          if (j === i || !shareEdge(P, ref.poly(j))) return;
          const c = kit.tile(inv, ref.tileOf(j));
          if (!list.some(function (d) { return sameTile(c, d); })) list.push(c);
        });
      }
      return split ? lists : lists[0];
    }
    const catalogue = opts.catalogue || contactsWithin(CATALOGUE_R, !ref.reflect, false);
    function inCatalogue(c) { return catalogue.some(function (d) { return sameTile(c, d); }); }
    /* Whether tile b touches tile a in a way the reference holds. */
    function contactKnown(a, b) { return inCatalogue(kit.tile(frameOf(a, !ref.reflect), b)); }

    return {
      ref: ref, kit: kit, templates: templates, NT: NT, catalogue: catalogue,
      motion: motion, anchorOf: anchorOf, allMotions: allMotions, userTile: userTile,
      lookup: lookup, filter: filter, contactsWithin: contactsWithin, contactKnown: contactKnown,
      frameOf: frameOf, sameTile: sameTile
    };
  }

  /* ------------------------------------------------------------ a session */

  /* The visitor's board as the checker sees it. sync(tiles) takes the whole
     list each time and keeps the match sets of the longest prefix it has
     seen before, so a drop costs one filter, and undo restores a saved set. */
  function createSession(matcher) {
    const ref = matcher.ref, piece = ref.piece, kit = matcher.kit, width = ref.width;
    let stack = [];      // per tile: {t, u, M, diam, large}
    let all = null;

    function same(a, b) {
      return a.flip === b.flip && a.turn === b.turn && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
    }

    function sync(tiles) {
      if (!tiles.length) throw new Error('The board has no tiles.');
      const t0 = tiles[0];
      if (t0.flip || t0.turn || Math.abs(t0.x) > 1e-9 || Math.abs(t0.y) > 1e-9) {
        throw new Error('The first tile must sit at turn 0 on the origin.');
      }
      let keep = 0;
      while (keep < stack.length && keep < tiles.length && same(stack[keep].t, tiles[keep])) keep++;
      stack.length = keep;
      for (let i = keep; i < tiles.length; i++) {
        const t = { flip: tiles[i].flip ? 1 : 0, turn: tiles[i].turn, x: tiles[i].x, y: tiles[i].y };
        const u = matcher.userTile(t);
        if (i === 0) {
          if (!all) all = matcher.allMotions();
          stack.push({ t: t, u: u, M: all, diam: 0, large: false });
          continue;
        }
        const prev = stack[i - 1];
        let diam = prev.diam;
        for (let j = 0; j < i; j++) diam = Math.max(diam, Math.hypot(stack[j].u.cx - u.cx, stack[j].u.cy - u.cy));
        const large = prev.large || diam > D_MAX * width;
        let M = null;
        if (!large) M = prev.M.length ? matcher.filter(prev.M, u) : prev.M;
        stack.push({ t: t, u: u, M: M, diam: diam, large: large });
      }
      return stack.length;
    }

    /* The state of the current list. */
    function summary() {
      const top = stack[stack.length - 1];
      let deadFrom = 0, largeFrom = 0, last = null;
      for (let i = 0; i < stack.length; i++) {
        if (!largeFrom && stack[i].large) largeFrom = i + 1;
        if (!stack[i].large) last = stack[i];
        if (!deadFrom && stack[i].M && !stack[i].M.length) deadFrom = i + 1;
      }
      const lastFits = last ? last.M.length > 0 : true;
      return {
        count: stack.length, size: top.M ? top.M.length : -1, large: top.large,
        // A dead patch stays dead however large it grows.
        status: deadFrom ? 'dead' : top.large ? 'large' : 'fits',
        lastFits: lastFits, deadFrom: deadFrom, largeFrom: largeFrom, diameter: top.diam / width
      };
    }

    /* The pairs of tiles that share an edge in a way the reference never
       does. */
    function badEdges() {
      const out = [];
      for (let i = 0; i < stack.length; i++) {
        const a = stack[i];
        let P = null;
        for (let j = i + 1; j < stack.length; j++) {
          const b = stack[j];
          if (Math.hypot(a.u.cx - b.u.cx, a.u.cy - b.u.cy) > width) continue;
          P = P || TB.shifted(a.u.V, a.t.x, a.t.y);
          if (!shareEdge(P, TB.shifted(b.u.V, b.t.x, b.t.y))) continue;
          if (!matcher.contactKnown(a.t, b.t)) out.push([i, j]);
        }
      }
      return out;
    }

    function verdict() {
      const s = summary();
      s.redTile = s.deadFrom ? s.deadFrom - 1 : -1;
      s.redEdges = s.deadFrom ? badEdges() : [];
      return s;
    }

    function current() {
      const top = stack[stack.length - 1];
      if (top.large) throw new Error('The patch is too large to check.');
      if (!top.M.length) throw new Error('The patch is in no ' + ref.name + ' tiling.');
      return top;
    }

    /* The match whose anchor lies farthest from the reference's edge. */
    function bestMotion(M) {
      let best = -1, bestD = Infinity;
      for (let q = 0; q < M.length; q++) {
        const d = ref.distance(matcher.anchorOf(M[q]));
        if (d < bestD) { bestD = d; best = M[q]; }
      }
      return matcher.motion(best);
    }

    /* Every placement that shares an edge with the patch in a way the
       catalogue holds, and is not already placed. */
    function edgeCandidates() {
      const out = [];
      stack.forEach(function (a) {
        const g = kit.ofTile(a.t);
        matcher.catalogue.forEach(function (c) {
          const t = kit.tile(g, c), u = matcher.userTile(t);
          for (let q = 0; q < stack.length; q++) {
            if (Math.abs(stack[q].u.cx - u.cx) < TOL && Math.abs(stack[q].u.cy - u.cy) < TOL) return;
          }
          for (let q = 0; q < out.length; q++) {
            if (out[q].t.flip === t.flip && out[q].t.turn === t.turn && Math.abs(out[q].u.cx - u.cx) < TOL && Math.abs(out[q].u.cy - u.cy) < TOL) return;
          }
          out.push({ t: t, u: u });
        });
      });
      return out;
    }

    function ringOf(t, rings) {
      const P = TB.shifted(matcher.userTile(t).V, t.x, t.y);
      let best = Infinity;
      stack.forEach(function (a, i) {
        if (rings[i] < best && TB.touch(P, TB.shifted(a.u.V, a.t.x, a.t.y))) best = rings[i];
      });
      return best;
    }

    /* Add one: a reference tile next to g(patch) for the best match g,
       preferring one that touches the lowest unfinished ring, then the one
       nearest the first tile. */
    function addOne(rings) {
      const top = current(), g = bestMotion(top.M);
      const legal = edgeCandidates().filter(function (c) { return matcher.lookup(g, c.u) >= 0; });
      if (!legal.length) return null;
      let best = null, bestRing = Infinity, bestD = Infinity;
      legal.forEach(function (c) {
        const r = rings ? ringOf(c.t, rings) : 0, d = Math.hypot(c.u.cx - stack[0].u.cx, c.u.cy - stack[0].u.cy);
        if (r < bestRing || (r === bestRing && d < bestD)) { best = c; bestRing = r; bestD = d; }
      });
      return { tile: best.t, options: legal.length };
    }

    /* Hint: every legal next placement, the union over all matches. A
       candidate is legal when some match also carries it onto the
       reference. */
    function hint() {
      const top = current();
      return edgeCandidates().filter(function (c) {
        if (!fitsBeside(c)) return false;
        for (let q = 0; q < top.M.length; q++) if (matcher.lookup(matcher.motion(top.M[q]), c.u) >= 0) return true;
        return false;
      }).map(function (c) { return c.t; });
    }

    /* A quick test that rules a candidate out before the scan over M: it
       overlaps a placed tile, or shares an edge with one in a way the
       reference never does. Either way no match can carry it onto the
       reference, so the test changes no answer. */
    function fitsBeside(c) {
      const P = TB.shifted(c.u.V, c.t.x, c.t.y);
      for (let q = 0; q < stack.length; q++) {
        const a = stack[q];
        if (Math.hypot(a.u.cx - c.u.cx, a.u.cy - c.u.cy) > width) continue;
        const Q = TB.shifted(a.u.V, a.t.x, a.t.y);
        if (TB.overlap(P, Q)) return false;
        if (shareEdge(Q, P) && !matcher.contactKnown(a.t, c.t)) return false;
      }
      return true;
    }

    /* Fill a ring: for the best match g, every reference tile with a corner
       of a tile in rings 0 to `complete` on its outline, mapped back. */
    function fillRing(rings, complete) {
      const top = current(), g = bestMotion(top.M), back = kit.inverse(g);
      const placed = new Set(), out = [];
      const images = stack.map(function (a) { return matcher.lookup(g, a.u); });
      images.forEach(function (i) { placed.add(i); });
      if (images.some(function (i) { return i < 0; })) throw new Error('The best match lost a tile.');
      const add = new Set();
      stack.forEach(function (a, s) {
        if (rings[s] > complete) return;
        const P = ref.poly(images[s]);
        ref.near(ref.CX[images[s]], ref.CY[images[s]], ref.width * 1.01).forEach(function (j) {
          if (placed.has(j) || add.has(j)) return;
          const Q = ref.poly(j);
          for (let v = 0; v < P.n; v++) {
            if (onOutline(Q, P.xs[v], P.ys[v])) { add.add(j); return; }
          }
        });
      });
      add.forEach(function (j) {
        if (ref.distance(j) > ref.R - ref.width) throw new Error('The ring runs off the reference.');
        out.push(kit.tile(back, ref.tileOf(j)));
      });
      // Sweep round the first tile.
      const c0 = stack[0].u;
      out.sort(function (a, b) {
        const ua = matcher.userTile(a), ub = matcher.userTile(b);
        return Math.atan2(ua.cy - c0.cy, ua.cx - c0.cx) - Math.atan2(ub.cy - c0.cy, ub.cx - c0.cx);
      });
      return out;
    }

    return {
      sync: sync, summary: summary, verdict: verdict, addOne: addOne, hint: hint, fillRing: fillRing,
      badEdges: badEdges, matches: function () { const top = stack[stack.length - 1]; return top.M; },
      stack: function () { return stack; }
    };
  }

  function onOutline(Q, x, y) {
    for (let e = 0; e < Q.n; e++) {
      const f = (e + 1) % Q.n, ax = Q.xs[e], ay = Q.ys[e], dx = Q.xs[f] - ax, dy = Q.ys[f] - ay;
      const l2 = dx * dx + dy * dy;
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) < 1e-7) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ serving */

  /* Tiles travel as flat arrays: flip, turn, x, y for each tile. */
  function unpack(flat) {
    const out = [];
    for (let i = 0; i + 3 < flat.length; i += 4) out.push({ flip: flat[i], turn: flat[i + 1], x: flat[i + 2], y: flat[i + 3] });
    return out;
  }
  function pack(tiles) {
    const out = [];
    tiles.forEach(function (t) { out.push(t.flip, t.turn, t.x, t.y); });
    return out;
  }

  /* Returns handle(message, reply). Requests:
       init {kind}                         -> ready {kind, info}
       match {id, tiles}                   -> match {id, count, size, status, deadFrom, largeFrom}
       verdict {id, tiles}                 -> verdict {..., redTile, redEdges}
       add-one {id, tiles, rings}          -> add-one {id, tile, options}
       hint {id, tiles}                    -> hint {id, tiles}
       fill-ring {id, tiles, rings, complete} -> fill-ring {id, tiles}
     A request that fails answers {type: 'error', id, message}. */
  function createHandler() {
    let kind = null, matcher = null, session = null, info = null;
    return function handle(msg, reply) {
      try {
        if (msg.type === 'init') {
          if (msg.kind !== kind || !matcher) {
            const t = Date.now();
            const ref = buildReference(msg.kind, { radius: msg.radius });
            matcher = createMatcher(ref);
            session = createSession(matcher);
            kind = msg.kind;
            info = { radius: ref.radius, tiles: ref.count, contacts: matcher.catalogue.length, ms: Date.now() - t };
          }
          reply({ type: 'ready', kind: kind, info: info });
          return;
        }
        if (!session) throw new Error('The checker is not ready.');
        const tiles = unpack(msg.tiles || []);
        session.sync(tiles);
        if (msg.type === 'match') {
          reply(Object.assign({ type: 'match', id: msg.id }, session.summary()));
        } else if (msg.type === 'verdict') {
          reply(Object.assign({ type: 'verdict', id: msg.id }, session.verdict()));
        } else if (msg.type === 'add-one') {
          const r = session.addOne(msg.rings);
          reply({ type: 'add-one', id: msg.id, tile: r ? pack([r.tile]) : null, options: r ? r.options : 0 });
        } else if (msg.type === 'hint') {
          reply({ type: 'hint', id: msg.id, tiles: pack(session.hint()) });
        } else if (msg.type === 'fill-ring') {
          reply({ type: 'fill-ring', id: msg.id, tiles: pack(session.fillRing(msg.rings, msg.complete)) });
        } else {
          throw new Error('Unknown request "' + msg.type + '".');
        }
      } catch (e) {
        reply({ type: 'error', id: msg.id, request: msg.type, message: e.message });
      }
    };
  }

  const api = {
    D_MAX: D_MAX, TOL: TOL, SLACK: SLACK, R_REF: R_REF, CATALOGUE_R: CATALOGUE_R, KINDS: KINDS,
    buildReference: buildReference, createMatcher: createMatcher, createSession: createSession,
    createHandler: createHandler, motionKit: motionKit, sameCornerSet: sameCornerSet, shareEdge: shareEdge,
    pack: pack, unpack: unpack
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TilingChecker = api;

  if (inWorker) {
    const handle = createHandler();
    global.onmessage = function (ev) {
      handle(ev.data, function (msg) { global.postMessage(msg); });
    };
  }
})(typeof self !== 'undefined' ? self : this);
