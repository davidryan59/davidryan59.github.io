/* The Tiling Puzzle's board: piece outlines, snapping, overlap, rings, the
   corner check and the share link. The specification is docs/tiling-puzzle.md,
   "The board (phase 5)". The file has no page code, so tools/tiling-puzzle/
   check.js runs it under Node.

   A piece type holds one outline and a turn step. A placement is
   {turn, flip, x, y}: the piece is mirrored when flip is 1, turned
   anticlockwise by turn steps about its local origin, and then moved by
   (x, y). Every outline runs anticlockwise, so edge i runs from corner i to
   corner i + 1 and the tile lies to the left of it. A mirrored piece lists
   the mirrored corners in the order that keeps them anticlockwise, with
   corner 0 still the mirror of corner 0.

   Positions are float64 in tile units. Two points are one point within
   COINCIDE, and two outlines overlap only when they cross by more than EPS. */
(function (global) {
  'use strict';

  const TAU = 2 * Math.PI;
  const EPS = 1e-9;          // the overlap tolerance of the spec
  const COINCIDE = 1e-7;     // two points are one point within this
  const ANGLE_EPS = 1e-6;    // two angles are one angle within this

  /* --------------------------------------------------------- the pieces */

  // Where each tiling file keeps its outline. In a page the scripts set a
  // global, and under Node the file is required.
  const SOURCES = {
    hat: ['HatTiling', '../tiles/hat/tiling.js'],
    spectre: ['SpectreTiling', '../tiles/spectre/tiling.js']
  };
  function source(kind) {
    const s = SOURCES[kind];
    if (global[s[0]]) return global[s[0]];
    if (typeof require === 'function') return require(s[1]);
    throw new Error('The ' + kind + ' tiling file is not loaded.');
  }

  /* kind is 'hat' or 'spectre'. */
  function pieceType(kind) {
    let outline, turns, flips, key, name;
    if (kind === 'hat') {
      outline = source('hat').HAT14; turns = 6; flips = true; key = 'hat'; name = 'Hat';
    } else if (kind === 'spectre') {
      outline = source('spectre').SPECTRE; turns = 12; flips = false; key = 'spectre'; name = 'Spectre';
    } else {
      throw new Error('Unknown piece "' + kind + '".');
    }
    const piece = {
      kind: kind, key: key, name: name, opts: {}, flips: flips,
      turns: turns, step: TAU / turns, n: outline.length,
      base: outline.map(function (p) { return [p[0], p[1]]; }),
      variants: new Map(), radius: 0, width: 0, area: 0
    };
    const v = variant(piece, 0, 0);
    piece.area = v.area;
    for (let i = 0; i < piece.n; i++) piece.radius = Math.max(piece.radius, Math.hypot(v.xs[i] - v.cx, v.ys[i] - v.cy));
    piece.width = 2 * piece.radius;
    return piece;
  }

  /* One outline of a piece, for a mirror state and a turn, relative to the
     local origin. It is cached. `dir` and `len` describe each edge, and
     (cx, cy) is the area centroid. */
  function variant(piece, flip, turn) {
    const key = flip * piece.turns + turn;
    let v = piece.variants.get(key);
    if (v) return v;
    const n = piece.n;
    let pts = piece.base;
    if (flip) {
      const m = pts.map(function (p) { return [-p[0], p[1]]; });
      pts = [];
      for (let j = 0; j < n; j++) pts.push(m[(n - j) % n]);
    }
    const a = turn * piece.step, c = Math.cos(a), s = Math.sin(a);
    const xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = c * pts[i][0] - s * pts[i][1];
      ys[i] = s * pts[i][0] + c * pts[i][1];
    }
    v = makePoly(xs, ys);
    v.dir = new Float64Array(n);
    v.len = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i];
      v.dir[i] = Math.atan2(dy, dx);
      v.len[i] = Math.hypot(dx, dy);
    }
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, w = xs[i] * ys[j] - xs[j] * ys[i];
      A += w; cx += (xs[i] + xs[j]) * w; cy += (ys[i] + ys[j]) * w;
    }
    v.area = A / 2;
    v.cx = cx / (3 * A);
    v.cy = cy / (3 * A);
    piece.variants.set(key, v);
    return v;
  }

  /* ------------------------------------------------------------ polygons */

  function makePoly(xs, ys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < x0) x0 = xs[i];
      if (xs[i] > x1) x1 = xs[i];
      if (ys[i] < y0) y0 = ys[i];
      if (ys[i] > y1) y1 = ys[i];
    }
    return { xs: xs, ys: ys, n: xs.length, x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function shifted(v, x, y) {
    const n = v.n, xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = v.xs[i] + x; ys[i] = v.ys[i] + y; }
    return { xs: xs, ys: ys, n: n, x0: v.x0 + x, y0: v.y0 + y, x1: v.x1 + x, y1: v.y1 + y };
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * dx - px, ey = ay + t * dy - py;
    return ex * ex + ey * ey;
  }

  /* True when the point lies inside the polygon and further than EPS from
     its boundary. */
  function strictlyInside(Q, x, y) {
    const xs = Q.xs, ys = Q.ys, n = Q.n;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (segDist2(x, y, xs[j], ys[j], xs[i], ys[i]) < EPS * EPS) return false;
      if ((ys[i] > y) !== (ys[j] > y)) {
        const xi = xs[i] + (y - ys[i]) * (xs[j] - xs[i]) / (ys[j] - ys[i]);
        if (x < xi) inside = !inside;
      }
    }
    return inside;
  }

  /* True when some part of an edge of P runs through the inside of Q. Each
     edge is cut where it meets the edges of Q, and the middle of every
     piece is tested. This catches a crossing, a corner inside, and an edge
     that joins two corners of Q through its inside. */
  function edgeThroughInside(P, Q) {
    const ts = [];
    for (let i = 0; i < P.n; i++) {
      const j = (i + 1) % P.n;
      const px = P.xs[i], py = P.ys[i], dx = P.xs[j] - px, dy = P.ys[j] - py;
      const len = Math.hypot(dx, dy);
      if (Math.min(px, P.xs[j]) > Q.x1 + EPS || Math.max(px, P.xs[j]) < Q.x0 - EPS ||
          Math.min(py, P.ys[j]) > Q.y1 + EPS || Math.max(py, P.ys[j]) < Q.y0 - EPS) continue;
      ts.length = 0;
      ts.push(0, 1);
      const ex0 = Math.min(px, P.xs[j]) - EPS, ex1 = Math.max(px, P.xs[j]) + EPS;
      const ey0 = Math.min(py, P.ys[j]) - EPS, ey1 = Math.max(py, P.ys[j]) + EPS;
      for (let k = 0; k < Q.n; k++) {
        const l = (k + 1) % Q.n;
        const cx = Q.xs[k], cy = Q.ys[k];
        if ((cx < ex0 && Q.xs[l] < ex0) || (cx > ex1 && Q.xs[l] > ex1) ||
            (cy < ey0 && Q.ys[l] < ey0) || (cy > ey1 && Q.ys[l] > ey1)) continue;
        const ex = Q.xs[l] - cx, ey = Q.ys[l] - cy;
        const el = Math.hypot(ex, ey), den = dx * ey - dy * ex;
        const fx = cx - px, fy = cy - py;
        if (Math.abs(den) < 1e-12 * len * el) {
          // Parallel. When collinear, the corners of Q cut the edge.
          if (Math.abs(fx * dy - fy * dx) <= EPS * len) {
            const t1 = (fx * dx + fy * dy) / (len * len);
            const t2 = ((Q.xs[l] - px) * dx + (Q.ys[l] - py) * dy) / (len * len);
            if (t1 > 0 && t1 < 1) ts.push(t1);
            if (t2 > 0 && t2 < 1) ts.push(t2);
          }
        } else {
          const t = (fx * ey - fy * ex) / den, u = (fx * dy - fy * dx) / den;
          if (t > 0 && t < 1 && u >= -EPS / el && u <= 1 + EPS / el) ts.push(t);
        }
      }
      ts.sort(function (a, b) { return a - b; });
      for (let k = 0; k + 1 < ts.length; k++) {
        if ((ts[k + 1] - ts[k]) * len <= EPS) continue;
        const m = (ts[k] + ts[k + 1]) / 2;
        if (strictlyInside(Q, px + dx * m, py + dy * m)) return true;
      }
    }
    return false;
  }

  function sameCorners(P, Q) {
    if (P.n !== Q.n) return false;
    for (let i = 0; i < P.n; i++) {
      let hit = false;
      for (let j = 0; j < Q.n && !hit; j++) {
        hit = Math.abs(P.xs[i] - Q.xs[j]) < COINCIDE && Math.abs(P.ys[i] - Q.ys[j]) < COINCIDE;
      }
      if (!hit) return false;
    }
    return true;
  }

  /* Two outlines overlap when an edge of one crosses an edge of the other, or
     a corner of one lies strictly inside the other, or they are the same
     shape in the same place. Sharing edges or corners is allowed. If no edge
     of either outline runs through the inside of the other, then each
     outline's inside lies wholly in the other's, so they coincide. That
     leaves one more case to test, the coincident pair. */
  function overlap(P, Q) {
    if (P.x1 < Q.x0 - EPS || Q.x1 < P.x0 - EPS || P.y1 < Q.y0 - EPS || Q.y1 < P.y0 - EPS) return false;
    return sameCorners(P, Q) || edgeThroughInside(P, Q) || edgeThroughInside(Q, P);
  }

  /* True when the outlines share at least one point. With no overlap a
     contact always puts a corner of one on the boundary of the other. */
  function touch(P, Q) {
    if (P.x1 < Q.x0 - COINCIDE || Q.x1 < P.x0 - COINCIDE || P.y1 < Q.y0 - COINCIDE || Q.y1 < P.y0 - COINCIDE) return false;
    const tol2 = COINCIDE * COINCIDE;
    for (let pass = 0; pass < 2; pass++) {
      const A = pass ? Q : P, B = pass ? P : Q;
      for (let i = 0; i < A.n; i++) {
        for (let k = 0; k < B.n; k++) {
          const l = (k + 1) % B.n;
          if (segDist2(A.xs[i], A.ys[i], B.xs[k], B.ys[k], B.xs[l], B.ys[l]) <= tol2) return true;
        }
      }
    }
    return false;
  }

  function wrap(a) { return ((a % TAU) + TAU) % TAU; }
  function b36(i) { return i.toString(36); }

  /* ------------------------------------------------------------ the board */

  function createBoard(piece) {
    const tiles = [];            // {turn, flip, x, y, poly, parent, shared}
    const adj = [];              // adj[i] lists the tiles that touch tile i
    const cells = new Map();     // a grid over the plane, for neighbour queries
    const cell = Math.max(piece.width, 1);
    const seen = [];
    let stamp = 0;
    let freeCache = null, dead = new Map();
    const history = [];          // the dead corners after each placement
    const allowedFlips = piece.flips ? [0, 1] : [0];

    function cellKey(ix, iy) { return (ix + 32768) * 65536 + (iy + 32768); }

    function near(x0, y0, x1, y1) {
      const out = [], m = 1e-6;
      const i0 = Math.floor((x0 - m) / cell), i1 = Math.floor((x1 + m) / cell);
      const j0 = Math.floor((y0 - m) / cell), j1 = Math.floor((y1 + m) / cell);
      stamp++;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const list = cells.get(cellKey(i, j));
          if (!list) continue;
          for (let k = 0; k < list.length; k++) {
            const t = list[k];
            if (seen[t] !== stamp) { seen[t] = stamp; out.push(t); }
          }
        }
      }
      return out;
    }

    function overlapIndex(poly, skip) {
      const nb = near(poly.x0, poly.y0, poly.x1, poly.y1);
      for (let k = 0; k < nb.length; k++) {
        if (nb[k] !== skip && overlap(poly, tiles[nb[k]].poly)) return nb[k];
      }
      return -1;
    }

    // Whether the corners of a tile's edge e and a neighbour's edge f are
    // the same two points, in opposite order.
    function sameEdge(P, e, Q, f) {
      const e2 = (e + 1) % P.n, f2 = (f + 1) % Q.n;
      return Math.abs(P.xs[e] - Q.xs[f2]) < COINCIDE && Math.abs(P.ys[e] - Q.ys[f2]) < COINCIDE &&
             Math.abs(P.xs[e2] - Q.xs[f]) < COINCIDE && Math.abs(P.ys[e2] - Q.ys[f]) < COINCIDE;
    }

    function insert(turn, flip, x, y, parent) {
      const poly = shifted(variant(piece, flip, turn), x, y);
      const i = tiles.length;
      const t = { turn: turn, flip: flip, x: x, y: y, poly: poly, parent: parent || null, shared: new Uint8Array(piece.n) };
      const nb = near(poly.x0, poly.y0, poly.x1, poly.y1);
      tiles.push(t);
      adj[i] = [];
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k], Q = tiles[j].poly;
        if (touch(poly, Q)) { adj[i].push(j); adj[j].push(i); }
        for (let e = 0; e < piece.n; e++) {
          if (t.shared[e]) continue;
          for (let f = 0; f < piece.n; f++) {
            if (!tiles[j].shared[f] && sameEdge(poly, e, Q, f)) { t.shared[e] = 1; tiles[j].shared[f] = 1; break; }
          }
        }
      }
      const i0 = Math.floor((poly.x0 - 1e-6) / cell), i1 = Math.floor((poly.x1 + 1e-6) / cell);
      const j0 = Math.floor((poly.y0 - 1e-6) / cell), j1 = Math.floor((poly.y1 + 1e-6) / cell);
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) {
          const key = cellKey(a, b);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(i);
        }
      }
      freeCache = null;
      return i;
    }

    function reset() {
      tiles.length = 0; adj.length = 0; cells.clear(); seen.length = 0;
      freeCache = null; dead = new Map(); history.length = 0;
    }

    /* The edges that no other placed tile shares. */
    function freeEdges() {
      if (freeCache) return freeCache;
      const out = [];
      for (let i = 0; i < tiles.length; i++) {
        const P = tiles[i].poly, v = variant(piece, tiles[i].flip, tiles[i].turn);
        for (let e = 0; e < piece.n; e++) {
          if (tiles[i].shared[e]) continue;
          const f = (e + 1) % piece.n;
          out.push({ tile: i, edge: e, ax: P.xs[e], ay: P.ys[e], bx: P.xs[f], by: P.ys[f], dir: v.dir[e], len: v.len[e] });
        }
      }
      freeCache = out;
      return out;
    }

    /* The placement that puts edge ej of the piece on free edge fe, when the
       piece is at (flip, turn). The piece's edge must run the opposite way
       at the same length, and the result is null when it does not. */
    function matchEdge(fe, V, ej) {
      if (Math.abs(V.len[ej] - fe.len) > COINCIDE) return null;
      const d = wrap(V.dir[ej] - fe.dir - Math.PI);
      if (d > ANGLE_EPS && TAU - d > ANGLE_EPS) return null;
      return { x: fe.bx - V.xs[ej], y: fe.by - V.ys[ej] };
    }

    /* Every geometric snap at (flip, turn): a free edge, an edge of the
       piece, and the translation that joins them. Each carries `valid`,
       which is false when the piece would overlap a placed tile. */
    function candidates(flip, turn) {
      const V = variant(piece, flip, turn), out = [];
      freeEdges().forEach(function (fe) {
        for (let j = 0; j < piece.n; j++) {
          const m = matchEdge(fe, V, j);
          if (!m) continue;
          const c = { a: fe.tile, ea: fe.edge, ej: j, flip: flip, turn: turn, x: m.x, y: m.y };
          c.valid = overlapIndex(shifted(V, m.x, m.y), -1) < 0;
          out.push(c);
        }
      });
      return out;
    }

    /* The valid snap nearest to a dragged piece whose area centroid is at
       (cx, cy), within maxDist, or null. */
    function snap(flip, turn, cx, cy, maxDist) {
      const V = variant(piece, flip, turn), list = [];
      freeEdges().forEach(function (fe) {
        for (let j = 0; j < piece.n; j++) {
          const m = matchEdge(fe, V, j);
          if (!m) continue;
          const dist = Math.hypot(m.x + V.cx - cx, m.y + V.cy - cy);
          if (dist <= maxDist) list.push({ a: fe.tile, ea: fe.edge, ej: j, flip: flip, turn: turn, x: m.x, y: m.y, dist: dist });
        }
      });
      list.sort(function (p, q) { return p.dist - q.dist; });
      for (let k = 0; k < list.length; k++) {
        if (overlapIndex(shifted(V, list[k].x, list[k].y), -1) < 0) return list[k];
      }
      return null;
    }

    /* True when a placement overlaps nothing and shares one whole edge with
       the patch. */
    function canPlace(flip, turn, x, y) {
      const poly = shifted(variant(piece, flip, turn), x, y);
      if (overlapIndex(poly, -1) >= 0) return false;
      return sharesEdge(poly);
    }
    function sharesEdge(poly) {
      const nb = near(poly.x0, poly.y0, poly.x1, poly.y1);
      for (let k = 0; k < nb.length; k++) {
        const Q = tiles[nb[k]].poly;
        for (let e = 0; e < piece.n; e++) for (let f = 0; f < piece.n; f++) if (sameEdge(poly, e, Q, f)) return true;
      }
      return false;
    }

    /* ------------------------------------------------ corners and rings */

    /* What surrounds a point: the wedges that tiles fill, the gaps between
       them, and the free edges that end there. A tile with a corner at the
       point fills the angle between its two edges. A tile with the point
       inside one of its edges fills half the turn. */
    function cornerAt(x, y) {
      const wedges = [], edges = [], m = 2 * COINCIDE;
      const nb = near(x - m, y - m, x + m, y + m);
      for (let k = 0; k < nb.length; k++) {
        const i = nb[k], P = tiles[i].poly, n = P.n;
        let hit = -1;
        for (let v = 0; v < n; v++) {
          if (Math.abs(P.xs[v] - x) < COINCIDE && Math.abs(P.ys[v] - y) < COINCIDE) { hit = v; break; }
        }
        if (hit >= 0) {
          const nx = P.xs[(hit + 1) % n] - x, ny = P.ys[(hit + 1) % n] - y;
          const px = P.xs[(hit + n - 1) % n] - x, py = P.ys[(hit + n - 1) % n] - y;
          const a1 = Math.atan2(ny, nx);
          wedges.push([wrap(a1), wrap(Math.atan2(py, px) - a1)]);
          if (!tiles[i].shared[hit]) edges.push({ tile: i, edge: hit });
          const before = (hit + n - 1) % n;
          if (!tiles[i].shared[before]) edges.push({ tile: i, edge: before });
          continue;
        }
        for (let e = 0; e < n; e++) {
          const f = (e + 1) % n;
          if (segDist2(x, y, P.xs[e], P.ys[e], P.xs[f], P.ys[f]) < COINCIDE * COINCIDE) {
            wedges.push([wrap(Math.atan2(P.ys[f] - P.ys[e], P.xs[f] - P.xs[e])), Math.PI]);
            break;
          }
        }
      }
      return { x: x, y: y, wedges: wedges, gaps: gapsOf(wedges), edges: edges };
    }

    function gapsOf(wedges) {
      if (!wedges.length) return [[0, TAU]];
      const iv = wedges.slice().sort(function (p, q) { return p[0] - q[0]; });
      const gaps = [];
      let cur = iv[0][0] + iv[0][1];
      for (let k = 1; k < iv.length; k++) {
        if (iv[k][0] > cur + ANGLE_EPS) gaps.push([cur, iv[k][0]]);
        cur = Math.max(cur, iv[k][0] + iv[k][1]);
      }
      if (iv[0][0] + TAU > cur + ANGLE_EPS) gaps.push([cur, iv[0][0] + TAU]);
      return gaps;
    }

    /* Whether a piece can lie against free edge (tile, edge) at any flip and
       any turn without overlapping. */
    function attachable(tile, edge) {
      const fe = edgeRef(tile, edge);
      for (let fi = 0; fi < allowedFlips.length; fi++) {
        const flip = allowedFlips[fi];
        for (let j = 0; j < piece.n; j++) {
          const turn = turnFor(fe, flip, j);
          if (turn < 0) continue;
          const V = variant(piece, flip, turn);
          if (overlapIndex(shifted(V, fe.bx - V.xs[j], fe.by - V.ys[j]), -1) < 0) return true;
        }
      }
      return false;
    }

    function edgeRef(tile, edge) {
      const P = tiles[tile].poly, f = (edge + 1) % piece.n, v = variant(piece, tiles[tile].flip, tiles[tile].turn);
      return { tile: tile, edge: edge, ax: P.xs[edge], ay: P.ys[edge], bx: P.xs[f], by: P.ys[f], dir: v.dir[edge], len: v.len[edge] };
    }

    function pointKey(x, y) { return Math.round(x * 1e4) + ',' + Math.round(y * 1e4); }

    /* A boundary corner is dead when no piece can lie against either free
       edge that meets there. Returns the corner's record, or null. */
    function deadAt(x, y) {
      const rec = cornerAt(x, y);
      if (!rec.gaps.length || !rec.edges.length) return null;
      for (let k = 0; k < rec.edges.length; k++) {
        if (attachable(rec.edges[k].tile, rec.edges[k].edge)) return null;
      }
      return rec;
    }

    /* After tile i goes in: test the corners it touches, and drop any dead
       corner that the tile has filled. */
    function updateDead(i) {
      const P = tiles[i].poly, pts = new Map();
      for (let v = 0; v < P.n; v++) pts.set(pointKey(P.xs[v], P.ys[v]), [P.xs[v], P.ys[v]]);
      adj[i].forEach(function (j) {
        const Q = tiles[j].poly;
        for (let v = 0; v < Q.n; v++) {
          for (let e = 0; e < P.n; e++) {
            const f = (e + 1) % P.n;
            if (segDist2(Q.xs[v], Q.ys[v], P.xs[e], P.ys[e], P.xs[f], P.ys[f]) < COINCIDE * COINCIDE) {
              pts.set(pointKey(Q.xs[v], Q.ys[v]), [Q.xs[v], Q.ys[v]]);
              break;
            }
          }
        }
      });
      const next = new Map(dead);
      dead.forEach(function (rec, key) {
        if (!cornerAt(rec.x, rec.y).gaps.length) next.delete(key);
      });
      pts.forEach(function (p, key) {
        const rec = deadAt(p[0], p[1]);
        if (rec) next.set(key, rec); else next.delete(key);
      });
      dead = next;
    }

    /* The ring index of each tile, and the highest complete ring. Ring J is
       complete when every corner of every tile in rings below J has tiles
       all round it, so the complete ring is the lowest ring that holds a
       tile with an open corner. */
    function rings() {
      const ring = new Int32Array(tiles.length).fill(-1);
      if (tiles.length) {
        ring[0] = 0;
        const queue = [0];
        for (let h = 0; h < queue.length; h++) {
          adj[queue[h]].forEach(function (j) {
            if (ring[j] < 0) { ring[j] = ring[queue[h]] + 1; queue.push(j); }
          });
        }
      }
      const open = new Map();
      let lowest = Infinity;
      for (let i = 0; i < tiles.length; i++) {
        const P = tiles[i].poly;
        for (let v = 0; v < P.n && ring[i] < lowest; v++) {
          const key = pointKey(P.xs[v], P.ys[v]);
          let isOpen = open.get(key);
          if (isOpen === undefined) {
            isOpen = cornerAt(P.xs[v], P.ys[v]).gaps.length > 0;
            open.set(key, isOpen);
          }
          if (isOpen) lowest = ring[i];
        }
      }
      return { ring: ring, complete: lowest === Infinity ? 0 : lowest };
    }

    /* ------------------------------------------------------ the share link */

    function parentOf(i) {
      const t = tiles[i];
      if (t.parent) return t.parent;
      const P = t.poly, list = adj[i].filter(function (j) { return j < i; }).sort(function (a, b) { return a - b; });
      for (let k = 0; k < list.length; k++) {
        const Q = tiles[list[k]].poly;
        for (let ea = 0; ea < piece.n; ea++) {
          for (let ej = 0; ej < piece.n; ej++) {
            if (sameEdge(P, ej, Q, ea)) return { a: list[k], ea: ea, ej: ej };
          }
        }
      }
      return null;
    }

    /* The tiles after the first as `a.ea.ej` in base 36, plus `.f` for a
       mirrored piece, joined by `-`. The parent is the lowest tile that
       shares a whole edge, so a board always gives the same text. */
    function encode() {
      const out = [];
      for (let i = 1; i < tiles.length; i++) {
        const p = canonicalParent(i);
        if (!p) throw new Error('Tile ' + i + ' shares no whole edge with an earlier tile.');
        out.push(b36(p.a) + '.' + b36(p.ea) + '.' + b36(p.ej) + (tiles[i].flip ? '.f' : ''));
      }
      return out.join('-');
    }
    function canonicalParent(i) {
      const t = tiles[i], saved = t.parent;
      t.parent = null;
      const p = parentOf(i);
      t.parent = saved;
      return p;
    }

    /* The new piece's turn for a join of edge ej to a free edge, or -1. */
    function turnFor(fe, flip, ej) {
      const V0 = variant(piece, flip, 0);
      if (Math.abs(V0.len[ej] - fe.len) > COINCIDE) return -1;
      const q = (fe.dir + Math.PI - V0.dir[ej]) / piece.step, r = Math.round(q);
      if (Math.abs(q - r) * piece.step > ANGLE_EPS) return -1;
      return ((r % piece.turns) + piece.turns) % piece.turns;
    }

    /* ----------------------------------------------------------- the API */

    const board = {
      piece: piece,
      tiles: tiles,
      near: near,
      freeEdges: freeEdges,
      candidates: candidates,
      snap: snap,
      canPlace: canPlace,
      cornerAt: cornerAt,
      rings: rings,
      encode: encode,
      turnFor: turnFor,
      edgeRef: edgeRef,
      overlapIndex: function (poly) { return overlapIndex(poly, -1); },
      attachable: attachable,
      adjacent: function (i) { return adj[i]; },
      deadCorners: function () { return Array.from(dead.values()); },
      get count() { return tiles.length; },

      /* Adds a placement the caller has already tested, and returns its
         index. `parent` is the {a, ea, ej} the snap used, if any. */
      place: function (p, parent) {
        const i = insert(p.turn, p.flip ? 1 : 0, p.x, p.y, parent);
        updateDead(i);
        history.push(dead);
        return i;
      },

      /* Takes back the last placement. The first tile stays. */
      undo: function () { return board.undoTo(tiles.length - 1); },

      /* Takes back placements until `count` tiles remain, rebuilding once.
         The first tile stays. */
      undoTo: function (count) {
        count = Math.max(1, count);
        if (count >= tiles.length) return false;
        const keep = tiles.slice(0, count).map(function (t) { return { turn: t.turn, flip: t.flip, x: t.x, y: t.y, parent: t.parent }; });
        const kept = history.slice(0, count);
        reset();
        keep.forEach(function (p) { insert(p.turn, p.flip, p.x, p.y, p.parent); });
        kept.forEach(function (d) { history.push(d); });
        dead = history.length ? history[history.length - 1] : new Map();
        return true;
      },

      /* The number of dead corners when the board held `count` tiles. */
      deadCountAt: function (count) {
        const d = history[count - 1];
        return d ? d.size : 0;
      },

      /* Back to the single first tile. */
      clear: function () {
        reset();
        insert(0, 0, 0, 0, null);
        history.push(dead);
      }
    };
    board.clear();
    return board;
  }

  /* --------------------------------------------------------- the link */

  /* The query text for a board: p, then b. */
  function linkOf(board) {
    const piece = board.piece, parts = ['p=' + piece.kind];
    const b = board.encode();
    if (b) parts.push('b=' + b);
    return parts.join('&');
  }

  /* Reads `a=1&b=2` text, with or without a leading # or ?. */
  function parseQuery(text) {
    const q = {};
    String(text || '').replace(/^[#?]/, '').split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i <= 0) return;
      try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* skip a bad escape */ }
    });
    return q;
  }

  /* The piece a link names, or null when it names none. */
  function pieceOf(q) {
    if (q.p === 'hat' || q.p === 'spectre') return pieceType(q.p);
    return null;
  }

  /* Replays the tokens of a b= list on a fresh board. It stops at the first
     token that does not snap. Returns {board, applied, total, error}, where
     error is a sentence or null. */
  function decode(piece, text) {
    const board = createBoard(piece);
    const tokens = String(text || '').split('-').filter(Boolean);
    for (let k = 0; k < tokens.length; k++) {
      const where = 'Tile ' + (k + 2) + ' of ' + (tokens.length + 1);
      const parts = tokens[k].split('.');
      const a = parseInt(parts[0], 36), ea = parseInt(parts[1], 36), ej = parseInt(parts[2], 36);
      const flip = parts[3] === 'f' ? 1 : 0;
      const fail = function (why) {
        return { board: board, applied: k, total: tokens.length, error: where + ' does not fit: ' + why + '.' };
      };
      if (parts.length < 3 || parts.length > 4 || (parts.length === 4 && parts[3] !== 'f') ||
          !(a >= 0 && ea >= 0 && ej >= 0) || !/^[0-9a-z]+$/.test(parts[0] + parts[1] + parts[2])) return fail('the token "' + tokens[k] + '" is not a placement');
      if (a >= board.count) return fail('tile ' + a + ' is not placed yet');
      if (ea >= piece.n || ej >= piece.n) return fail('the edge number is too large');
      if (flip && !piece.flips) return fail('this piece has no mirror image');
      const fe = board.edgeRef(a, ea), turn = board.turnFor(fe, flip, ej);
      if (turn < 0) return fail('the two edges differ in length or direction');
      const V = variant(piece, flip, turn), x = fe.bx - V.xs[ej], y = fe.by - V.ys[ej];
      const hit = board.overlapIndex(shifted(V, x, y));
      if (hit >= 0) return fail('it overlaps tile ' + hit);
      board.place({ turn: turn, flip: flip, x: x, y: y }, { a: a, ea: ea, ej: ej });
    }
    return { board: board, applied: tokens.length, total: tokens.length, error: null };
  }

  const api = {
    TAU: TAU, EPS: EPS, COINCIDE: COINCIDE,
    pieceType: pieceType, variant: variant, createBoard: createBoard,
    overlap: overlap, touch: touch, strictlyInside: strictlyInside, shifted: shifted,
    linkOf: linkOf, parseQuery: parseQuery, pieceOf: pieceOf, decode: decode
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TilingBoard = api;
})(typeof self !== 'undefined' ? self : this);
