/* What one blow does to a screen, and how to draw it.

   A real LCD fails in layers, and so does this model. The cover glass cracks
   from the point of impact: long curving cracks that run to the edge, a
   burst of short ones, and on phones rings between them. A running crack
   stops where it meets an older one, as in real glass, so two cracks never
   cross. The panel behind breaks along those cracks. Its liquid crystal
   spreads into black patches that grow for a second or two. The patches
   stop sharp at a crack and end in a soft, ragged edge elsewhere, with a
   fringe of coloured pixels where dead meets live. Damaged row and column
   wiring lights whole lines of pixels in one bright colour, from a crack
   to the edge of the screen.

   All the cracks on one screen form one network, which glass() keeps. The
   long cracks cut the screen into sectors, and each blow gives the sectors
   round it a fate: flood black, bleed in from the cracks, or stay alive.
   All the cracks together cut the glass into pieces. A small loose piece
   near a blow can fly out and leave a hole.

   The network also keeps a grid of sample points, about sixty across the
   short side, and records when ink or a hole first covers each one. The
   game measures damage with it.

   Everything is in screen units, where the short side is 1000, and is
   vector, so the page can redraw it sharply at any zoom. A hit is fixed at
   the moment it lands; drawing it at time t shows it t seconds later. */
(function (global) {
  'use strict';

  var Smash = global.Smash;
  var TAU = 2 * Math.PI;

  // The black is a very dark purple, as in the photo, not flat black.
  var DARK = 'rgba(16,9,25,0.976)';
  var WHITE = 'rgba(236,241,252,0.97)';
  var WET = 'rgba(10,16,36,0.965)';
  var HOLE = 'rgba(5,4,9,0.97)';
  var FRINGE_DARK = ['#3d3dff', '#3d3dff', '#6b2bff', '#6b2bff', '#9d4dff', '#1ec8ff', '#ffe14d', '#22e07a'];
  var FRINGE_WHITE = ['#2a2aa0', '#5a1f9e', '#1a1a60', '#8f7dff'];
  var FRINGE_WET = ['#00e5ff', '#ff4fd8', '#ffe14d', '#3dff9a', '#6b8cff', '#00e5ff'];
  var LINE_SETS = [['#ff2bd6', '#3d5afe', '#ffffff'], ['#00e676', '#ff5722'], ['#7c4dff', '#00e5ff'], ['#ff1744', '#ffea00'],
                   ['#2979ff', '#d500f9', '#76ff03'], ['#ff9100', '#00b0ff', '#ffffff'], ['#ff2bd6', '#00e676', '#3d5afe']];
  // Faint lines across a white patch show as pale tints, darker than white.
  var PASTEL = ['#d9a3cc', '#b6a6e0', '#e0d7a0', '#b7bbc6', '#c7a0e2', '#a8c2e0', '#e6b0b8'];
  var PATH_STEPS = 180;
  var CELL = 24;

  // How each weapon breaks the glass, against a hammer's 1. n: long cracks.
  // through: how readily they reach the edge. rings: spider-web rings.
  // crush: a ring of crushed glass close round the blow. crater and burst:
  // the crushed spot and its short cracks. dark and bleed: how readily a
  // sector floods or bleeds. chips: how readily loose pieces fly out.
  // kill: the radius the blow destroys outright, cracks or no cracks, as a
  // share of the short side, from a tap to a full swing.
  var WEAPON = {
    hammer:    { n: 1, through: 1, rings: 1, crush: 0.7, crater: 1, burst: 1, dark: 1, bleed: 1, lines: 1, chips: 1, kill: [0.015, 0.065] },
    fist:      { n: 0.6, through: 0.55, rings: 1.8, crush: 1, crater: 2.6, burst: 1.5, dark: 0.8, bleed: 1.3, lines: 0.5, chips: 1.5, kill: [0.02, 0.055] },
    finger:    { n: 0, through: 0, rings: 0, crush: 0, crater: 0.35, burst: 0.25, dark: 0, bleed: 0, lines: 0, chips: 0, kill: [0.047, 0.047] },
    fish:      { n: 0, through: 0, rings: 0, crush: 0, crater: 0.6, burst: 0.4, dark: 0, bleed: 0, lines: 0, chips: 0, kill: [0.06, 0.15] },
    banana:    { n: 0, through: 0, rings: 0, crush: 0, crater: 0.5, burst: 0.35, dark: 0, bleed: 0, lines: 0, chips: 0, kill: [0.012, 0.035] },
    bomb:      { n: 2.2, through: 3, rings: 2, crush: 1, crater: 4, burst: 2.2, dark: 2.2, bleed: 0.6, lines: 1.6, chips: 3, kill: [0.2, 0.28] },
    lightning: { n: 0.9, through: 1, rings: 0.6, crush: 0.6, crater: 1.2, burst: 1, dark: 1, bleed: 1, lines: 1, chips: 0.6, kill: [0.03, 0.06] }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* -------------------------------------------------------- geometry */

  function cumulative(pts) {
    var cum = new Float32Array(pts.length);
    for (var i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return cum;
  }

  // Positive for a face walked the way graph() walks the inside of a piece.
  function signedArea(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function centroid(poly) {
    var x = 0, y = 0;
    poly.forEach(function (p) { x += p[0]; y += p[1]; });
    return [x / poly.length, y / poly.length];
  }

  function box(poly) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    poly.forEach(function (p) {
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]);
      b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    });
    return b;
  }

  // Where the line y = c (or x = c) crosses the polygon: the inside spans.
  function chords(poly, c, horiz) {
    var xs = [], n = poly.length, i;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var ay = horiz ? a[1] : a[0], by = horiz ? b[1] : b[0];
      if ((ay <= c && by > c) || (by <= c && ay > c)) {
        var t = (c - ay) / (by - ay);
        xs.push(horiz ? a[0] + t * (b[0] - a[0]) : a[1] + t * (b[1] - a[1]));
      }
    }
    xs.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1) out.push([xs[i], xs[i + 1]]);
    return out;
  }

  function inside(poly, x, y) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // Where segment a-b crosses segment c-d, as fractions along each, or null.
  function cross(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    var qx = cx - ax, qy = cy - ay, t = (qx * sy - qy * sx) / den, v = (qx * ry - qy * rx) / den;
    if (t < 0 || t > 1 || v < 0 || v > 1) return null;
    return [t, v];
  }

  // Distance round the edge of the screen, clockwise from the top left.
  function edgeS(W, H, p) {
    var d = [p[1], W - p[0], H - p[1], p[0]], e = d.indexOf(Math.min(d[0], d[1], d[2], d[3]));
    return e === 0 ? p[0] : e === 1 ? W + p[1] : e === 2 ? W + H + (W - p[0]) : 2 * W + H + (H - p[1]);
  }

  /* ------------------------------------------------- the glass network */

  // opt: { radius, notch }. radius is the screen's corner radius, one number
  // or four; notch is a rectangle [x, y, w, h] of the screen with no picture.
  function glass(W, H, opt) {
    opt = opt || {};
    var m = Math.min(W, H), G = { W: W, H: H, m: m, cracks: [], hubs: [], holes: [], hits: 0 };
    G.gx = Math.ceil(W / CELL) + 1;
    G.gy = Math.ceil(H / CELL) + 1;
    G.cells = [];
    for (var i = 0; i < G.gx * G.gy; i++) G.cells.push([]);

    var nx = Math.max(1, Math.round(W / (m / 60))), ny = Math.max(1, Math.round(H / (m / 60)));
    var g = { nx: nx, ny: ny, sx: W / nx, sy: H / ny, valid: new Uint8Array(nx * ny),
              dead: new Float64Array(nx * ny), who: new Int32Array(nx * ny), count: 0 };
    g.dead.fill(Infinity);
    g.who.fill(-1);
    var rad = opt.radius || 0, rc = Array.isArray(rad) ? rad : [rad, rad, rad, rad], notch = opt.notch;
    for (var j = 0; j < ny; j++) {
      for (i = 0; i < nx; i++) {
        var x = (i + 0.5) * g.sx, y = (j + 0.5) * g.sy, ok = true;
        [[rc[0], rc[0], rc[0]], [rc[1], W - rc[1], rc[1]], [rc[2], W - rc[2], H - rc[2]], [rc[3], rc[3], H - rc[3]]].forEach(function (c, k) {
          var inX = k === 0 || k === 3 ? x < c[1] : x > c[1], inY = k < 2 ? y < c[2] : y > c[2];
          if (c[0] > 0 && inX && inY && Math.hypot(x - c[1], y - c[2]) > c[0]) ok = false;
        });
        if (notch && x > notch[0] && x < notch[0] + notch[2] && y > notch[1] && y < notch[1] + notch[3]) ok = false;
        if (ok) { g.valid[j * nx + i] = 1; g.count++; }
      }
    }
    G.grid = g;
    return G;
  }

  function insertCrack(G, c) {
    var p = c.pts;
    for (var k = 0; k + 1 < p.length; k++) {
      var i0 = clamp(Math.floor(Math.min(p[k][0], p[k + 1][0]) / CELL), 0, G.gx - 1), i1 = clamp(Math.floor(Math.max(p[k][0], p[k + 1][0]) / CELL), 0, G.gx - 1);
      var j0 = clamp(Math.floor(Math.min(p[k][1], p[k + 1][1]) / CELL), 0, G.gy - 1), j1 = clamp(Math.floor(Math.max(p[k][1], p[k + 1][1]) / CELL), 0, G.gy - 1);
      for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) G.cells[j * G.gx + i].push(c.id, k);
    }
    c.box = box(p);
  }

  // The nearest older crack that the segment a-b meets. A meeting within
  // guard of (sx, sy), where the new crack began, does not count: that is
  // the crack or the hub it grew from.
  function firstCross(G, ax, ay, bx, by, sx, sy, guard) {
    var best = null;
    var i0 = clamp(Math.floor(Math.min(ax, bx) / CELL), 0, G.gx - 1), i1 = clamp(Math.floor(Math.max(ax, bx) / CELL), 0, G.gx - 1);
    var j0 = clamp(Math.floor(Math.min(ay, by) / CELL), 0, G.gy - 1), j1 = clamp(Math.floor(Math.max(ay, by) / CELL), 0, G.gy - 1);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var list = G.cells[j * G.gx + i];
        for (var q = 0; q < list.length; q += 2) {
          var c = G.cracks[list[q]], k = list[q + 1], p = c.pts[k], e = c.pts[k + 1];
          var x = cross(ax, ay, bx, by, p[0], p[1], e[0], e[1]);
          if (!x || (best && x[0] >= best.t)) continue;
          var ix = ax + (bx - ax) * x[0], iy = ay + (by - ay) * x[0];
          if (guard && Math.hypot(ix - sx, iy - sy) < guard) continue;
          best = { t: x[0], id: c.id, seg: k, u: x[1], x: ix, y: iy };
        }
      }
    }
    return best;
  }

  // The closest crack to (x, y) within r, or null.
  function nearest(G, x, y, r) {
    var best = null;
    var i0 = clamp(Math.floor((x - r) / CELL), 0, G.gx - 1), i1 = clamp(Math.floor((x + r) / CELL), 0, G.gx - 1);
    var j0 = clamp(Math.floor((y - r) / CELL), 0, G.gy - 1), j1 = clamp(Math.floor((y + r) / CELL), 0, G.gy - 1);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var list = G.cells[j * G.gx + i];
        for (var q = 0; q < list.length; q += 2) {
          var c = G.cracks[list[q]], k = list[q + 1], a = c.pts[k], b = c.pts[k + 1];
          var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
          var t = L > 0 ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / L, 0, 1) : 0;
          var px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(x - px, y - py);
          if (d <= r && (!best || d < best.d)) best = { id: c.id, seg: k, u: t, x: px, y: py, d: d };
        }
      }
    }
    return best;
  }

  function inHole(G, p) {
    for (var i = 0; i < G.holes.length; i++) {
      var h = G.holes[i];
      if (p[0] >= h.box[0] && p[0] <= h.box[2] && p[1] >= h.box[1] && p[1] <= h.box[3] && inside(h.poly, p[0], p[1])) return true;
    }
    return false;
  }

  /* A planar graph of some of the cracks and the edge of the screen.
     Vertices sit at crack ends, where one crack meets another, at each
     blow's hub and at the corners. Each edge is a stretch of one crack, or
     of the screen's edge, between two vertices. Walking each half-edge to
     the next one clockwise round its end vertex traces the faces: the
     pieces the cracks cut the screen into. A crack with a free end sits
     inside its face as a slit, walked down one side and back up the other. */
  function graph(G, set) {
    var W = G.W, H = G.H, per = 2 * (W + H);
    var vx = [], vy = [], parent = [], inSet = {}, splits = {}, hubV = {}, ends = [], bnd = [], edges = [];
    function vert(x, y) { vx.push(x); vy.push(y); parent.push(vx.length - 1); return vx.length - 1; }
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function join(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    function split(id, seg, t, v) { (splits[id] = splits[id] || []).push([seg + t, v]); }
    set.forEach(function (c) { inSet[c.id] = true; });
    function hubVertex(h) {
      if (hubV[h.id] === undefined) {
        hubV[h.id] = vert(h.p[0], h.p[1]);
        if (h.on && inSet[h.on.id]) split(h.on.id, h.on.seg, h.on.t, hubV[h.id]);
      }
      return hubV[h.id];
    }
    function endVertex(a, p) {
      if (a.type === 'hub') return hubVertex(G.hubs[a.hub]);
      var v = vert(p[0], p[1]);
      if (a.type === 'crack' && inSet[a.id]) split(a.id, a.seg, a.t, v);
      else if (a.type === 'edge') bnd.push([edgeS(W, H, p), v]);
      return v;
    }
    set.forEach(function (c) { ends.push([endVertex(c.from, c.pts[0]), endVertex(c.to, c.pts[c.pts.length - 1])]); });
    [[0, 0, 0], [W, 0, W], [W, H, W + H], [0, H, 2 * W + H]].forEach(function (k) { bnd.push([k[2], vert(k[0], k[1])]); });

    set.forEach(function (c, ci) {
      var n = c.pts.length - 1;
      var list = [[0, ends[ci][0]]].concat((splits[c.id] || []).sort(function (a, b) { return a[0] - b[0]; }), [[n, ends[ci][1]]]);
      list.forEach(function (e) { e[0] = clamp(e[0], 0, n); });
      list.sort(function (a, b) { return a[0] - b[0]; });
      for (var i = 1; i < list.length; i++) {
        if (list[i][0] - list[i - 1][0] < 1e-9) join(list[i - 1][1], list[i][1]);
        else edges.push([list[i - 1][1], list[i][1], c, list[i - 1][0], list[i][0]]);
      }
    });
    bnd.sort(function (a, b) { return a[0] - b[0]; });
    var i;
    for (i = 1; i < bnd.length; i++) if (bnd[i][0] - bnd[i - 1][0] < 1e-6) join(bnd[i - 1][1], bnd[i][1]);
    for (i = 0; i < bnd.length; i++) {
      var a = bnd[i], b = bnd[(i + 1) % bnd.length], s0 = a[0], s1 = i === bnd.length - 1 ? b[0] + per : b[0];
      if (s1 - s0 >= 1e-6) edges.push([a[1], b[1], null, s0, s1]);
    }

    function at(c, pos) {
      var n = c.pts.length - 1, k = Math.min(Math.floor(pos), n - 1), t = pos - k, a = c.pts[k], b = c.pts[k + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    function rim(s) {
      s = ((s % per) + per) % per;
      return s < W ? [s, 0] : s < W + H ? [W, s - W] : s < 2 * W + H ? [W - (s - W - H), H] : [0, H - (s - 2 * W - H)];
    }
    function pts(e) {
      var out = [], k;
      if (e[2]) {
        out.push(at(e[2], e[3]));
        for (k = Math.floor(e[3]) + 1; k < e[4]; k++) out.push(e[2].pts[k]);
        out.push(at(e[2], e[4]));
      } else {
        out.push(rim(e[3]));
        [W, W + H, 2 * W + H, per, per + W, per + W + H, per + 2 * W + H].forEach(function (cs) {
          if (cs > e[3] + 1e-9 && cs < e[4] - 1e-9) out.push(rim(cs));
        });
        out.push(rim(e[4]));
      }
      return out;
    }
    // The direction a half-edge leaves its first vertex in.
    function leave(p) {
      for (var j = 1; j < p.length; j++) {
        var dx = p[j][0] - p[0][0], dy = p[j][1] - p[0][1];
        if (dx * dx + dy * dy > 1e-14) return Math.atan2(dy, dx);
      }
      return 0;
    }

    var from = [], to = [], hedge = [], ang = [], out = [], pos = [];
    for (i = 0; i < vx.length; i++) out.push([]);
    edges.forEach(function (e, ei) {
      var a = find(e[0]), b = find(e[1]), p = pts(e);
      if (p.length < 2) return;
      var h = from.length;
      from.push(a, b);
      to.push(b, a);
      hedge.push(ei, ei);
      ang.push(leave(p), leave(p.slice().reverse()));
      out[a].push(h);
      out[b].push(h + 1);
    });
    out.forEach(function (list) {
      list.sort(function (p, q) { return ang[p] - ang[q]; });
      list.forEach(function (h, k) { pos[h] = k; });
    });
    function next(h) {
      var t = h ^ 1, L = out[from[t]];
      return L[(pos[t] - 1 + L.length) % L.length];
    }
    // Walks the face on the inside of h, marking every half-edge on it seen.
    // Past cap points it stops building the outline and returns null.
    function cycle(h0, seen, cap) {
      var poly = [], cracks = [], h = h0, n = 0, over = false;
      do {
        seen[h] = 1;
        var e = edges[hedge[h]];
        if (e[2]) cracks.push(e[2]);
        if (!over) {
          var p = pts(e);
          if (h & 1) p.reverse();
          for (var j = 0; j < p.length - 1; j++) poly.push(p[j]);
          if (cap && poly.length > cap) over = true;
        }
        h = next(h);
      } while (h !== h0 && ++n < 200000);
      return over ? null : { poly: poly, cracks: cracks };
    }
    return { hubV: hubV, out: out, count: from.length, cycle: cycle, find: find };
  }

  /* ------------------------------------------------------------- a hit */

  // o: { x, y, W, H, seed, t0, device, px, strength, first, weapon, glass }.
  // px is CSS pixels per screen unit at the whole-device view, so
  // pixel-sized details come out a pixel or two wide on arrival. glass is
  // the screen's network from glass(); without one, the hit makes its own.
  function make(o) {
    var G = o.glass || glass(o.W, o.H);
    var r = Smash.rng(o.seed), W = o.W, H = o.H, m = Math.min(W, H);
    var weapon = WEAPON[o.weapon] ? o.weapon : 'hammer', wp = WEAPON[weapon];
    var glassy = o.device === 'phone' || o.device === 'tablet', s = clamp(o.strength, 0, 1);
    var u = 1 / o.px, cell = Math.max(u * 0.8, 0.6), speed = m * 6;
    var hit = { P: [o.x, o.y], t0: o.t0, u: u, cell: cell, weapon: weapon, strength: s, index: G.hits++,
                cracks: [], sectors: [], blobs: [], lines: [], holes: [], haze: [], smears: [], end: 0 };
    var P = hit.P, i, k, spawns = [];
    var bare = inHole(G, P), soft = weapon === 'fish' || weapon === 'banana' || weapon === 'finger';

    // The blow's hub, where its cracks start. A blow right on an old crack
    // starts on it, so that its cracks leave that crack instead of crossing.
    var hub = null;
    if (!bare) {
      hub = { id: G.hubs.length, p: P.slice(), on: null };
      var near = nearest(G, P[0], P[1], 6.5);
      if (near) { hub.p = [near.x, near.y]; hub.on = { id: near.id, seg: near.seg, t: near.u }; }
      G.hubs.push(hub);
      P = hit.P = hub.p.slice();
    }

    function addCrack(pts, kind, from, to, start, spd) {
      if (pts.length < 2) return null;
      var c = { id: G.cracks.length, hit: hit.index, kind: kind, pts: pts, from: from, to: to,
                start: start, speed: spd, style: 'hair', exit: to.type === 'edge' };
      c.cum = cumulative(pts);
      c.len = c.cum[c.cum.length - 1];
      if (c.exit) c.s = edgeS(W, H, pts[pts.length - 1]);
      G.cracks.push(c);
      insertCrack(G, c);
      hit.cracks.push(c);
      return c;
    }

    // A crack walks in short steps, turning a little at each one. Curvature
    // drifts slowly, so long cracks make the gentle S-bends of real glass. It
    // stops at the edge of the screen or where it meets an older crack.
    function grow(x, y, ang, maxLen, step, wiggle, start, from, branchP, kind) {
      var pts = [[x, y]], len = 0, bend = r.normal() * 0.0012, to = { type: 'free' }, mine = [];
      // A branch leaves its parent straight for a few steps, so that it
      // clears the parent's own small zigzags before it starts to wander.
      var branch = kind === 'branch', guard = branch ? 2.5 : step * 1.6;
      for (var n = 0; n < 4000 && len < maxLen; n++) {
        bend = Math.max(-0.003, Math.min(0.003, bend * 0.99 + r.normal() * 0.00025));
        ang += bend * step + (branch && n < 3 ? 0 : r.normal() * wiggle);
        var nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step, j = branch && n < 3 ? 0 : r.normal() * 0.35 * cell;
        var last = pts[pts.length - 1], qx = nx - Math.sin(ang) * j, qy = ny + Math.cos(ang) * j, exit = false;
        if (qx <= 0 || qy <= 0 || qx >= W || qy >= H) {
          var t = 1, dx = qx - last[0], dy = qy - last[1], side = -1;
          if (qx < 0 && -last[0] / dx < t) { t = -last[0] / dx; side = 0; }
          if (qx > W && (W - last[0]) / dx < t) { t = (W - last[0]) / dx; side = 1; }
          if (qy < 0 && -last[1] / dy < t) { t = -last[1] / dy; side = 2; }
          if (qy > H && (H - last[1]) / dy < t) { t = (H - last[1]) / dy; side = 3; }
          qx = clamp(last[0] + dx * t, 0, W);
          qy = clamp(last[1] + dy * t, 0, H);
          if (side === 0) qx = 0; else if (side === 1) qx = W; else if (side === 2) qy = 0; else if (side === 3) qy = H;
          exit = true;
        }
        var met = firstCross(G, last[0], last[1], qx, qy, pts[0][0], pts[0][1], guard);
        if (met) {
          pts.push([met.x, met.y]);
          to = { type: 'crack', id: met.id, seg: met.seg, t: met.u };
          break;
        }
        pts.push([qx, qy]);
        if (exit) { to = { type: 'edge' }; break; }
        x = nx;
        y = ny;
        len += step;
        if (branchP && r() < branchP) mine.push([pts.length - 1, ang + (r.chance(0.5) ? 1 : -1) * r.range(0.4, 0.9), start + len / speed]);
      }
      var c = addCrack(pts, kind, from, to, start, speed);
      if (c) mine.forEach(function (b) { spawns.push([c, b[0], b[1], b[2]]); });
      return c;
    }

    function onCrack(c, j) {
      var n = c.pts.length - 1;
      return { type: 'crack', id: c.id, seg: Math.min(j, n - 1), t: j < n ? 0 : 1 };
    }
    function reachIndex(c, dist) {
      for (var j = 1; j < c.pts.length; j++) if (Math.hypot(c.pts[j][0] - P[0], c.pts[j][1] - P[1]) >= dist) return j;
      return -1;
    }
    // An arc round the blow from a point on crack ca to a point on crack cb,
    // stopping early if it meets another crack on the way.
    function arc(ca, ja, cb, jb, steps, start, spd, kind) {
      var A = ca.pts[ja], B = cb.pts[jb];
      var aA = Math.atan2(A[1] - P[1], A[0] - P[0]), d = Math.atan2(B[1] - P[1], B[0] - P[0]) - aA;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      var rA = Math.hypot(A[0] - P[0], A[1] - P[1]), rB = Math.hypot(B[0] - P[0], B[1] - P[1]), want = [A.slice()];
      for (var q = 1; q < steps; q++) {
        var f = q / steps, rr = (rA + (rB - rA) * f) * (1 + 0.05 * Math.sin(Math.PI * f)) + r.normal() * cell * 0.6;
        want.push([clamp(P[0] + Math.cos(aA + d * f) * rr, 0, W), clamp(P[1] + Math.sin(aA + d * f) * rr, 0, H)]);
      }
      want.push(B.slice());
      var pts = [want[0]], to = onCrack(cb, jb);
      for (q = 1; q < want.length; q++) {
        var a = pts[pts.length - 1], b = want[q], met = firstCross(G, a[0], a[1], b[0], b[1], A[0], A[1], 1.5);
        if (met) {
          pts.push([met.x, met.y]);
          to = { type: 'crack', id: met.id, seg: met.seg, t: met.u };
          break;
        }
        pts.push(b);
      }
      return addCrack(pts, kind, onCrack(ca, ja), to, start, spd);
    }

    /* The long cracks. Strength runs from 0, a tap, to 1, a full swing. A
       tap only chips the glass. Cracks that reach the edge, black ink and
       the bright lines all take a real swing. */
    var tap = s < 0.25, mains = [];
    var nBase = tap ? r.int(2, 4) : (glassy ? r.int(4, 7) : r.int(3, 5)) + (s > 0.8 ? 1 : 0);
    var n = bare ? 0 : Math.max(0, Math.round(nBase * wp.n));
    if (!bare && (weapon === 'fish' || weapon === 'banana') && s > 0.75 && r.chance(0.5)) n = r.int(1, 2);
    var forced = s > 0.45 ? Math.min(n, Math.round(2 * wp.through)) : 0;
    var throughP = tap || soft ? 0 : Math.min(0.95, (s - 0.25) * 1.2 * wp.through);
    var base = r.range(0, TAU);
    for (i = 0; i < n; i++) {
      var through = !tap && !soft && (i < forced || r() < throughP);
      var reach = through ? Infinity : m * r.range(0.02, 0.06 + 0.5 * s) * (soft ? 0.25 : 1);
      var c = grow(P[0], P[1], base + (i + r.range(-0.3, 0.3)) * TAU / n, reach, 4, 0.02, 0,
                   { type: 'hub', hub: hub.id }, (glassy ? 0.006 : 0.004) * s, 'main');
      if (c) mains.push(c);
    }

    // Crushed glass: short arcs close round the blow join neighbouring
    // cracks, cutting the wedges between them into small loose pieces.
    if (mains.length > 1 && wp.crush && s > 0.4) {
      var rcr = m * r.range(0.012, 0.028) * (0.6 + 0.6 * s) * Math.pow(wp.crater, 0.3);
      for (i = 0; i < mains.length; i++) {
        if (!r.chance((0.45 + 0.4 * s) * wp.crush)) continue;
        var ja = reachIndex(mains[i], rcr * r.range(0.8, 1.2)), jb = reachIndex(mains[(i + 1) % mains.length], rcr * r.range(0.8, 1.2));
        if (ja > 0 && jb > 0) arc(mains[i], ja, mains[(i + 1) % mains.length], jb, 6, rcr / speed, speed * 0.5, 'crush');
      }
    }

    // Rings join neighbouring cracks, as in the spider web of a phone.
    var rings = s < 0.5 || !mains.length ? 0 : Math.round((glassy ? r.int(1, 3) : r.chance(0.3) ? 1 : 0) * wp.rings);
    for (k = 0; k < rings; k++) {
      var rad = m * r.range(0.05, 0.1) * (k + 1) * (glassy ? 1.4 : 1);
      for (i = 0; i < mains.length && mains.length > 1; i++) {
        if (!r.chance(0.7)) continue;
        var ia = reachIndex(mains[i], rad * r.range(0.9, 1.1)), ib = reachIndex(mains[(i + 1) % mains.length], rad * r.range(0.9, 1.1));
        if (ia > 0 && ib > 0) arc(mains[i], ia, mains[(i + 1) % mains.length], ib, 16, rad / speed, speed * 0.5, 'ring');
      }
    }

    // Branches leave the long cracks and run until they meet another.
    spawns.slice().forEach(function (b) {
      var par = b[0], p = par.pts[b[1]];
      grow(p[0], p[1], b[2], r.range(0.04, 0.35) * m, 3, 0.03, b[3], onCrack(par, b[1]), 0, 'branch');
    });

    // The burst of short cracks round the impact.
    for (i = bare ? 0 : Math.round((r.int(4, 8) + 14 * s) * wp.burst); i > 0; i--) {
      var ray = grow(P[0], P[1], r.range(0, TAU), m * (0.008 + 0.03 * Math.pow(r(), 2)) * (0.5 + s), 2, 0.08, 0,
                     { type: 'hub', hub: hub.id }, 0, 'fine');
      if (ray) { ray.style = 'fine'; ray.speed = speed * 0.5; }
    }
    hit.crater = [];
    var cr = m * r.range(0.004, 0.009) * (0.4 + 0.8 * s) * wp.crater;
    for (i = 0, k = r.int(8, 13); i < k; i++) {
      var ca = TAU * i / k, cd = cr * r.range(0.6, 1.3);
      hit.crater.push([P[0] + Math.cos(ca) * cd, P[1] + Math.sin(ca) * cd]);
    }
    hit.glitter = [];
    for (i = Math.round((r.int(8, 12) + 45 * s) * Math.min(2, wp.burst)); i > 0; i--) {
      var ga = r.range(0, TAU), gd = m * 0.04 * r() * r() * Math.sqrt(wp.crater);
      hit.glitter.push([P[0] + Math.cos(ga) * gd, P[1] + Math.sin(ga) * gd, cell * r.range(0.6, 1.8), r.range(0.3, 1)]);
    }

    /* How each crack looks. Some long cracks are a band of shattered glass;
       some shimmer with colour; some have a fuzz of lit pixels along them. */
    hit.cracks.forEach(function (c) {
      if (c.kind !== 'main' && c.kind !== 'branch') return;
      if (c.kind === 'main' && c.len > m * 0.25 && s > 0.5 && r() < (glassy ? 0.25 : 0.4)) {
        c.style = 'ribbon';
        c.half = u * r.range(3, 7);
        ribbon(c, r, u);
      } else if (c.len > m * 0.15 && r.chance(0.18)) {
        c.rainbow = true;
      }
      if (r.chance(c.kind === 'main' ? 0.4 : 0.25)) fuzz(c, r, u, P, m);
    });

    /* Sectors: the faces the long cracks cut the screen into, round the
       blow. Old cracks close them too, so ink stops at every long crack. */
    if (hub && mains.length) {
      var gm = graph(G, G.cracks.filter(function (c) { return c.kind === 'main' || c.kind === 'branch'; }));
      var hv = gm.hubV[hub.id], seen = {};
      if (hv !== undefined) {
        gm.out[gm.find(hv)].forEach(function (h) {
          if (seen[h]) return;
          var cyc = gm.cycle(h, seen);
          if (!cyc || signedArea(cyc.poly) < W * H * 1e-6) return;
          hit.sectors.push({ poly: cyc.poly, sides: cyc.cracks.filter(function (c) { return c.hit === hit.index && c.kind === 'main'; }) });
        });
      }
    }
    if (!hit.sectors.length) hit.sectors.push({ poly: [[0, 0], [W, 0], [W, H], [0, H]], whole: true });
    hit.sectors.forEach(function (sec) {
      sec.frac = Math.abs(signedArea(sec.poly)) / (W * H);
      sec.box = box(sec.poly);
      sec.reach = 0;
      sec.poly.forEach(function (p) { sec.reach = Math.max(sec.reach, Math.hypot(p[0] - P[0], p[1] - P[1])); });
    });

    /* Fates. Only a hard blow floods a sector black. The first hit on a
       screen leaves at least half of it alive. */
    var dark = 0, limit = o.first ? 0.5 : weapon === 'bomb' ? 1 : 0.85, active = 0, whole = hit.sectors[0].whole;
    var pDark = whole || s < 0.5 ? 0 : Math.min(0.95, (0.2 + 0.5 * (s - 0.5)) * wp.dark);
    var pBleed = tap ? 0 : Math.min(0.6, (0.15 + 0.4 * s) * wp.bleed);
    hit.sectors.forEach(function (sec) {
      var roll = r();
      if (roll < pDark && dark + sec.frac <= limit) { sec.fate = 'dark'; dark += sec.frac; }
      else if (roll < pDark + pBleed) sec.fate = 'bleed';
      else sec.fate = 'live';
      sec.white = sec.fate === 'bleed' && r.chance(0.12);
      if (sec.fate !== 'live') active++;
    });
    if (!active && s >= 0.6 && pDark) hit.sectors.reduce(function (a, b) { return a.frac < b.frac ? a : b; }).fate = 'dark';

    // round: a nearly round blob that covers at least radius R everywhere.
    function blob(cx, cy, R, delay, dur, sector, kind, fringe, round) {
      var harm = [], j, wob = round ? 0.3 : 1;
      for (j = 2; j <= 7; j++) harm.push([j, r.range(0.03, 0.22) / Math.pow(j, 0.7) * wob, r.range(0, TAU)]);
      for (j = 9; j <= 21; j += 3) harm.push([j, r.range(0.002, 0.008), r.range(0, TAU)]);
      var lagDir = r.range(0, TAU), lag = r.range(0.1, 0.45);
      function shape(a) {
        var v = 1;
        harm.forEach(function (h) { v += h[1] * Math.cos(h[0] * a + h[2]); });
        return v;
      }
      function lagAt(a) { return lag * dur * (0.5 + 0.5 * Math.cos(a - lagDir)); }
      var white = kind === 'white';
      var b = { cx: cx, cy: cy, R: R, delay: delay, dur: dur, sector: sector, white: white, kind: kind || 'dark',
                shape: new Float32Array(PATH_STEPS), lag: new Float32Array(PATH_STEPS), top: 0 };
      var low = Infinity;
      for (j = 0; j < PATH_STEPS; j++) {
        b.shape[j] = shape(TAU * j / PATH_STEPS);
        b.lag[j] = lagAt(TAU * j / PATH_STEPS);
        b.top = Math.max(b.top, b.shape[j]);
        low = Math.min(low, b.shape[j]);
      }
      if (round) b.R = R = R / low;
      // The fringe: short spikes of coloured pixels, clustered, that hang
      // off the edge in the direction of the nearest row or column.
      var N = Math.min(2400, Math.ceil(TAU * R * 1.2 / cell * (fringe === undefined ? 1 : fringe))), p1 = r.range(0, TAU), p2 = r.range(0, TAU);
      var pal = kind === 'white' ? FRINGE_WHITE : kind === 'wet' ? FRINGE_WET : FRINGE_DARK;
      b.fringe = { n: N, a: new Float32Array(N), shape: new Float32Array(N), lag: new Float32Array(N),
                   len: new Float32Array(N), dot: new Float32Array(N), col: new Uint8Array(N), pal: pal };
      for (j = 0; j < N; j++) {
        // The outline's shape and lag, read from its table between steps.
        var a = TAU * j / N, env = Math.max(0, 0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(7 * a + p2));
        var q = j * PATH_STEPS / N, q0 = Math.floor(q), q1 = (q0 + 1) % PATH_STEPS, f = q - q0;
        b.fringe.a[j] = a;
        b.fringe.shape[j] = b.shape[q0] + (b.shape[q1] - b.shape[q0]) * f;
        b.fringe.lag[j] = b.lag[q0] + (b.lag[q1] - b.lag[q0]) * f;
        b.fringe.len[j] = r() < 0.5 ? 0 : cell * (r.range(0.5, 2.5) + (r() < 0.06 ? r.range(4, 12) : 0)) * (0.35 + env * 1.4);
        b.fringe.dot[j] = r() < 0.12 ? cell * r.range(1, 5) : 0;
        b.fringe.col[j] = Math.floor(r() * pal.length);
      }
      b.done = delay + dur * (1 + lag);
      hit.blobs.push(b);
      return b;
    }

    function pointOn(c, f) {
      var target = c.len * f;
      for (var j = 1; j < c.pts.length; j++) if (c.cum[j] >= target) return c.pts[j];
      return c.pts[c.pts.length - 1];
    }

    hit.sectors.forEach(function (sec, si) {
      if (sec.fate === 'dark') {
        blob(P[0] + r.normal() * cell * 3, P[1] + r.normal() * cell * 3, sec.reach * r.range(0.8, 1.2),
             r.range(0.05, 0.2), r.range(1.1, 2.2) * Math.sqrt(Math.min(1.5, sec.reach / m)), si);
        if (r.chance(0.5)) {
          var far = sec.poly[Math.floor(r() * sec.poly.length)];
          blob(far[0], far[1], sec.reach * r.range(0.3, 0.6), r.range(0.3, 0.8), r.range(1, 2), si);
        }
      } else if (sec.fate === 'bleed') {
        for (var j = r.int(1, s > 0.6 ? 3 : 2); j > 0; j--) {
          var at = sec.whole ? P : sec.sides && sec.sides.length && r.chance(0.75) ? pointOn(r.pick(sec.sides), r.range(0.15, 0.8))
                 : sec.poly[Math.floor(r() * sec.poly.length)];
          blob(at[0], at[1], m * r.range(0.06, 0.2 + 0.2 * s) * (0.5 + 0.7 * s), r.range(0.1, 0.6), r.range(1.2, 2.6), si, sec.white ? 'white' : 'dark');
        }
      }
    });
    /* The crater. Every blow destroys the panel within its kill radius,
       which grows with the weapon and the strength of the swing. It is not
       clipped to a sector, so it runs across cracks. The fish's is a wet
       patch that keeps spreading for a few seconds. */
    var kill = m * (wp.kill[0] + (wp.kill[1] - wp.kill[0]) * s) * r.range(0.9, 1.1);
    if (weapon === 'fish') blob(P[0], P[1], kill, 0.05, r.range(3, 4.5), -1, 'wet', undefined, true);
    else blob(P[0], P[1], kill, 0.03, weapon === 'finger' ? r.range(0.3, 0.45) : r.range(0.4, 0.7), -1, 'dark', undefined, true);

    /* What the softer weapons and the specials do to the panel. */
    if (weapon === 'fish') {
      if (r.chance(0.6)) {
        var wa = r.range(0, TAU), wd = m * r.range(0.05, 0.1);
        blob(P[0] + Math.cos(wa) * wd, P[1] + Math.sin(wa) * wd, m * r.range(0.04, 0.08) * (0.55 + 0.6 * s), 0.6, r.range(2.5, 3.5), -1, 'wet');
      }
      hit.smears.push({ kind: 'slime', x: P[0], y: P[1], rx: m * r.range(0.06, 0.09) * (0.6 + 0.5 * s), ry: m * r.range(0.025, 0.04),
                        rot: r.range(0, TAU), seed: r.int(1, 1e9), t: 0.02 });
    } else if (weapon === 'banana') {
      hit.smears.push({ kind: 'mush', x: P[0], y: P[1], R: m * r.range(0.022, 0.03) * (0.6 + 0.6 * s), seed: r.int(1, 1e9), t: 0.02 });
    } else if (weapon === 'lightning') {
      bolt(r, P, W, H, m, hit, blob);
    }

    /* Lines of stuck pixels: fine, close together and uneven, like the
       photo. Most are one pixel. Some come in runs of two or three colours
       side by side, some glow less than others, and some break into dashes
       where only part of the row is stuck. They stop a few pixels short of
       a crack, each line at its own distance. On a white patch they show as
       faint pale tints, with the odd darker line across. */
    function addLines(sec, si, groups, clip, faint) {
      var horiz = r() < (glassy ? 0.55 : 0.85), pal = sec.white ? PASTEL : r.pick(LINE_SETS);
      for (var g = 0; g < groups; g++) {
        var lo = horiz ? sec.box[1] : sec.box[0], hi = horiz ? sec.box[3] : sec.box[2];
        var c0 = r.range(lo, hi), band = m * r.range(0.05, 0.3) * (sec.white ? 2 : 1), pos = c0 - band / 2, gDelay = r.range(0.05, 1);
        var count = 0;
        while (pos < c0 + band / 2 && count < (faint ? 4 : 60)) {
          pos += m * (0.003 + 0.022 * r() * r());
          var th = r.pick([0.5, 0.5, 0.75, 1, 1, 1.5]) * u, spans = chords(sec.poly, pos, horiz);
          if (!spans.length) continue;
          var edge = horiz ? W : H, colours = [r.pick(pal)];
          if (!sec.white && r.chance(0.35)) {
            colours.push(r.pick(pal));
            if (r.chance(0.3)) colours.push(r.pick(pal));
          }
          var dashed = r.chance(0.15), alpha = faint ? 0.45 : sec.white ? r.range(0.35, 0.7) : r.range(0.6, 1);
          var strong = sec.white && r.chance(0.04);
          var gapA = u * (r.chance(0.2) ? r.range(0, 2) : r.range(2, 12)), gapB = u * (r.chance(0.2) ? r.range(0, 2) : r.range(2, 12));
          colours.forEach(function (col, ci) {
            var y = pos + ci * th, segs = [];
            spans.forEach(function (sp) {
              var a = sp[0] > 0.5 ? sp[0] + gapA : sp[0];
              var b = sp[1] < edge - 0.5 ? sp[1] - gapB : sp[1];
              if (b - a < u) return;
              if (!dashed) { segs.push([a, b]); return; }
              for (var x = a; x < b;) {
                var dash = u * r.range(4, 40);
                segs.push([x, Math.min(b, x + dash)]);
                x += dash + u * r.range(1, 8);
              }
            });
            if (!segs.length) return;
            hit.lines.push({ horiz: horiz, pos: y, th: th, segs: segs, color: strong ? '#6f5a96' : col, dead: !sec.white && r.chance(0.08),
                             alpha: strong ? 0.8 : alpha, blend: sec.white ? 'multiply' : 'lighten',
                             t: gDelay + r.range(0, 0.35), clip: clip ? si : -1 });
          });
          pos += th * colours.length;
          count++;
        }
      }
    }
    var lineK = wp.lines;
    hit.sectors.forEach(function (sec, si) {
      if (!lineK) return;
      if (sec.fate === 'dark') addLines(sec, si, Math.max(1, Math.round((r.int(1, 2) + (s > 0.7 ? 1 : 0) + (s > 0.9 ? 1 : 0)) * lineK)), true, false);
      else if (sec.fate === 'bleed' && s > 0.3 && r.chance(sec.white ? 0.95 : 0.8)) addLines(sec, si, r.int(1, 2) + (sec.white ? 1 : 0), true, false);
      else if (sec.fate === 'live' && s > 0.75 && r.chance(0.35)) addLines(sec, si, 1, false, true);
    });
    var broken = hit.sectors.filter(function (sec) { return sec.fate !== 'live'; });
    if (lineK && s > 0.6 && broken.length && r() < (glassy ? 0.3 : 0.5)) {
      var vs = r.pick(broken), vx = r.range(vs.box[0], vs.box[2]), vspans = chords(vs.poly, vx, false);
      if (vspans.length) {
        hit.lines.push({ horiz: false, pos: vx, th: r.range(0.75, 1.5) * u, segs: vspans, color: r.pick(['#ff6d00', '#ff1744', '#00e676', '#ffffff']),
                         dead: false, alpha: 1, blend: 'lighten', t: r.range(0.2, 1.2), clip: hit.sectors.indexOf(vs) });
      }
    }
    // Lightning shorts the wiring: dozens of lines light right across.
    if (weapon === 'lightning') {
      var lh = r() < (glassy ? 0.5 : 0.85), lpal = r.pick(LINE_SETS);
      for (i = r.int(20, 36); i > 0; i--) {
        var lp = r.range(0, lh ? H : W);
        hit.lines.push({ horiz: lh, pos: lp, th: r.pick([0.5, 1, 1, 1.5]) * u, segs: [[0, lh ? W : H]], color: r.pick(lpal), dead: false,
                         alpha: r.range(0.6, 1), blend: 'lighten', t: r.range(0.02, 0.5), clip: -1 });
      }
    }
    hit.lit = hit.lines.filter(function (l) { return !l.dead; }).length;

    // A haze of lit pixels round a hard blow, and a small yellow blotch.
    if (!soft && s > 0.5 && !bare) {
      for (i = r.int(20, 50); i > 0; i--) {
        var ha = r.range(0, TAU), hd = m * 0.035 * Math.sqrt(r()) * (0.5 + s);
        hit.haze.push([P[0] + Math.cos(ha) * hd, P[1] + Math.sin(ha) * hd, cell * r.range(0.6, 2), r.pick(['#b8c24a', '#9fb03c', '#d8d860', '#7f9a40'])]);
      }
      if (r.chance(0.5)) {
        var ba = r.range(0, TAU), bd = m * r.range(0.004, 0.012), bR = m * r.range(0.004, 0.009), bl = [];
        for (i = 0; i < 12; i++) bl.push([P[0] + Math.cos(ba) * bd + Math.cos(TAU * i / 12) * bR * r.range(0.7, 1.2),
                                          P[1] + Math.sin(ba) * bd + Math.sin(TAU * i / 12) * bR * r.range(0.7, 1.2)]);
        hit.blotch = bl;
      }
    }

    chips(G, hit, r, weapon, wp, s, bare, m, speed);
    hit.newDead = doom(G, hit);

    hit.end = 0.25;
    hit.cracks.forEach(function (c) { hit.end = Math.max(hit.end, c.start + c.len / c.speed); });
    hit.blobs.forEach(function (b) { hit.end = Math.max(hit.end, b.done); });
    hit.lines.forEach(function (l) { hit.end = Math.max(hit.end, l.t + 0.12); });
    hit.holes.forEach(function (h) { hit.end = Math.max(hit.end, h.t + 0.05); });
    return hit;
  }

  // A band of shattered glass, drawn pixel by pixel as the photo shows it:
  // stair-stepped edges, lit grey pixels, and a bright hairline along one
  // side. Its width wanders gently along its length.
  function ribbon(c, r, u) {
    var p = c.pts, cum = c.cum, xs = [], ys = [], ws = [], hs = [], ds = [], hair = [];
    var f1 = r.range(0.004, 0.01), f2 = r.range(0.02, 0.04), p1 = r.range(0, TAU), p2 = r.range(0, TAU), side = r.chance(0.5) ? 1 : -1;
    function snap(v) { return Math.floor(v / u) * u; }
    for (var d = 0, k = 0; d <= c.len; d += u) {
      while (k < p.length - 2 && cum[k + 1] < d) k++;
      var seg = cum[k + 1] - cum[k] || 1, t = clamp((d - cum[k]) / seg, 0, 1);
      var x = p[k][0] + (p[k + 1][0] - p[k][0]) * t, y = p[k][1] + (p[k + 1][1] - p[k][1]) * t;
      var a = p[Math.max(0, k - 3)], b = p[Math.min(p.length - 1, k + 4)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      var hw = c.half * Math.min(1, d / (40 * u)) * (1 - 0.55 * d / c.len) * (1 + 0.35 * Math.sin(d * f1 + p1) + 0.18 * Math.sin(d * f2 + p2));
      if (Math.abs(dy) > Math.abs(dx)) {
        var ex = hw * L / Math.abs(dy);
        xs.push(snap(x - ex)); ys.push(snap(y)); ws.push(snap(x + ex) - snap(x - ex) + u); hs.push(u);
      } else {
        var ey = hw * L / Math.abs(dx);
        xs.push(snap(x)); ys.push(snap(y - ey)); ws.push(u); hs.push(snap(y + ey) - snap(y - ey) + u);
      }
      ds.push(d);
      hair.push([x - dy / L * hw * 0.7 * side, y + dx / L * hw * 0.7 * side, d]);
    }
    c.rib = { x: xs, y: ys, w: ws, h: hs, d: ds, hair: hair };
  }

  // Short ticks of lit pixels that stick out from a crack like the teeth of
  // a comb, in the direction of the nearest pixel row or column.
  function fuzz(c, r, u, P, m) {
    var p = c.pts, t = [];
    for (var i = 1; i < p.length - 1; i++) {
      if (r() > 0.3) continue;
      var dx = p[i + 1][0] - p[i - 1][0], dy = p[i + 1][1] - p[i - 1][1], len = u * r.range(1, 6) * (r() < 0.1 ? 2 : 1);
      var near = Math.hypot(p[i][0] - P[0], p[i][1] - P[1]) < m * 0.08;
      var col = near && r.chance(0.6) ? 'rgba(200,208,96,0.7)' : 'rgba(226,232,255,0.5)';
      var sgn = r.chance(0.5) ? 1 : -1, x = p[i][0], y = p[i][1];
      if (Math.abs(dx) > Math.abs(dy)) t.push([x - u * 0.4, sgn > 0 ? y : y - len, u * 0.8, len, c.cum[i], col]);
      else t.push([sgn > 0 ? x : x - len, y - u * 0.4, len, u * 0.8, c.cum[i], col]);
    }
    c.fuzz = t;
  }

  // A bolt from the top of the screen to the blow, burning the pixels on its
  // way, with a few forks.
  function bolt(r, P, W, H, m, hit, blob) {
    var x0 = clamp(P[0] + r.normal() * m * 0.12, W * 0.04, W * 0.96), main = [[x0, 0]], steps = 18, i, k;
    for (i = 1; i < steps; i++) {
      var f = i / steps;
      main.push([clamp(x0 + (P[0] - x0) * f + r.normal() * m * 0.03 * (1 - f * 0.6), 0, W), clamp(P[1] * f + r.normal() * m * 0.008, 0, H)]);
    }
    main.push(P.slice());
    var forks = [];
    for (k = r.int(2, 4); k > 0; k--) {
      var st = main[r.int(2, steps - 3)], fa = Math.PI / 2 + r.range(-1, 1), fp = [st.slice()];
      for (i = r.int(4, 7); i > 0; i--) {
        fa += r.range(-0.5, 0.5);
        var q = fp[fp.length - 1];
        fp.push([clamp(q[0] + Math.cos(fa) * m * 0.04, 0, W), clamp(q[1] + Math.sin(fa) * m * 0.04, 0, H)]);
      }
      forks.push(fp);
    }
    hit.bolt = { main: main, forks: forks };
    [main].concat(forks).forEach(function (path, fi) {
      var cum = cumulative(path), L = cum[cum.length - 1], gap = m * (fi ? 0.04 : 0.03);
      for (var d = gap * 0.5, j = 1; d < L; d += gap) {
        while (j < path.length - 1 && cum[j] < d) j++;
        var f = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1), a = path[j - 1], b = path[j];
        blob(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, m * r.range(0.012, 0.024) * (fi ? 0.7 : 1),
             0.01 + 0.06 * d / L, r.range(0.25, 0.45), -1, 'dark', 0.3);
      }
    });
  }

  /* Loose glass. The pieces that all the cracks cut near the blow are the
     faces of the graph of every crack but the finest. A small piece near a
     hard blow can fly out, leaving a hole. */
  function chips(G, hit, r, weapon, wp, s, bare, m, speed) {
    if (bare || !wp.chips || s < 0.35) return;
    var P = hit.P, D = m * (weapon === 'bomb' ? 0.3 : 0.1) * (0.6 + 0.6 * s), Dq = D + m * 0.15;
    var local = G.cracks.filter(function (c) {
      return c.kind !== 'fine' && c.box[0] < P[0] + Dq && c.box[2] > P[0] - Dq && c.box[1] < P[1] + Dq && c.box[3] > P[1] - Dq;
    });
    if (local.length < 2) return;
    var gf = graph(G, local), seen = {}, found = [];
    var amin = Math.pow(m * 0.006, 2), amax = Math.pow(m * (weapon === 'bomb' ? 0.09 : 0.06), 2);
    for (var h = 0; h < gf.count; h++) {
      if (seen[h]) continue;
      var cyc = gf.cycle(h, seen, 600);
      if (!cyc) continue;
      var a = signedArea(cyc.poly);
      if (a < amin || a > amax) continue;
      var cen = centroid(cyc.poly), d = Math.hypot(cen[0] - P[0], cen[1] - P[1]);
      if (d > D || inHole(G, cen)) continue;
      found.push({ poly: cyc.poly, area: a, c: cen, d: d });
    }
    found.sort(function (a, b) { return a.d - b.d; });
    var max = weapon === 'bomb' ? 12 : 5, pop = 0.6 * s * s * wp.chips;
    found.forEach(function (f) {
      if (hit.holes.length >= max || r() > pop * (1 - 0.6 * f.d / D)) return;
      var far = 0;
      f.poly.forEach(function (p) { far = Math.max(far, Math.hypot(p[0] - P[0], p[1] - P[1])); });
      var hole = { poly: f.poly, box: box(f.poly), c: f.c, area: f.area, t: 0.06 + far / speed + r.range(0, 0.12) };
      hit.holes.push(hole);
      G.holes.push(hole);
    });
  }

  /* When ink or a hole first covers each sample point. A blob covers a
     point once it has grown out to it, so the damage shown rises as the
     ink spreads. Returns how many points this blow dooms that no earlier
     blow already had. */
  function doom(G, hit) {
    var g = G.grid, fresh = 0;
    function mark(k, t) {
      if (!g.valid[k]) return;
      if (g.dead[k] === Infinity) fresh++;
      if (t < g.dead[k]) { g.dead[k] = t; g.who[k] = hit.index; }
    }
    hit.blobs.forEach(function (b) {
      var sec = b.sector >= 0 ? hit.sectors[b.sector] : null, top = b.R * b.top;
      var i0 = Math.max(0, Math.floor((b.cx - top) / g.sx)), i1 = Math.min(g.nx - 1, Math.ceil((b.cx + top) / g.sx));
      var j0 = Math.max(0, Math.floor((b.cy - top) / g.sy)), j1 = Math.min(g.ny - 1, Math.ceil((b.cy + top) / g.sy));
      for (var j = j0; j <= j1; j++) {
        var y = (j + 0.5) * g.sy, spans = sec && !sec.whole ? chords(sec.poly, y, true) : null;
        if (spans && !spans.length) continue;
        for (var i = i0; i <= i1; i++) {
          var x = (i + 0.5) * g.sx, ok = !spans;
          for (var q = 0; spans && q < spans.length; q++) if (x >= spans[q][0] && x <= spans[q][1]) { ok = true; break; }
          if (!ok) continue;
          var dx = x - b.cx, dy = y - b.cy, dist = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          var idx = ((Math.round(a / TAU * PATH_STEPS) % PATH_STEPS) + PATH_STEPS) % PATH_STEPS, rr = b.R * b.shape[idx];
          if (dist > rr) continue;
          var need = 1 - Math.cbrt(1 - Math.min(1, dist / rr));
          mark(j * g.nx + i, hit.t0 + b.delay + b.lag[idx] + need * b.dur);
        }
      }
    });
    hit.holes.forEach(function (h) {
      var j0 = Math.max(0, Math.floor(h.box[1] / g.sy)), j1 = Math.min(g.ny - 1, Math.ceil(h.box[3] / g.sy));
      for (var j = j0; j <= j1; j++) {
        chords(h.poly, (j + 0.5) * g.sy, true).forEach(function (sp) {
          for (var i = Math.max(0, Math.ceil(sp[0] / g.sx - 0.5)); i < g.nx && (i + 0.5) * g.sx <= sp[1]; i++) mark(j * g.nx + i, hit.t0 + h.t);
        });
      }
    });
    return fresh;
  }

  // The share of the screen's picture destroyed at time t, from 0 to 1.
  function damageAt(G, t) {
    var g = G.grid, n = 0;
    for (var i = 0; i < g.dead.length; i++) if (g.valid[i] && g.dead[i] <= t) n++;
    return g.count ? n / g.count : 0;
  }

  // The sample grid, with each point still alive at time t marked 1.
  function aliveMask(G, t) {
    var g = G.grid, mask = new Uint8Array(g.nx * g.ny);
    for (var i = 0; i < mask.length; i++) mask[i] = g.valid[i] && g.dead[i] > t ? 1 : 0;
    return { nx: g.nx, ny: g.ny, mask: mask };
  }

  // The hit that takes the damage to frac, 1 by default: the one behind the
  // point whose death does it. -1 if the damage never gets there.
  function lastBlow(G, frac) {
    var g = G.grid, dead = [], need = Math.ceil((frac === undefined ? 1 : frac) * g.count);
    for (var i = 0; i < g.dead.length; i++) if (g.valid[i] && g.dead[i] < Infinity) dead.push(i);
    if (!need || dead.length < need) return -1;
    dead.sort(function (a, b) { return g.dead[a] - g.dead[b]; });
    return g.who[dead[need - 1]];
  }

  /* ---------------------------------------------------------- drawing */

  function tracePoly(ctx, poly) {
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  function growth(b, lag, dt) {
    var g = (dt - b.delay - lag) / b.dur;
    return g <= 0 ? 0 : g >= 1 ? 1 : 1 - Math.pow(1 - g, 3);
  }

  function traceBlob(ctx, b, dt) {
    var any = false;
    for (var j = 0; j < PATH_STEPS; j++) {
      var a = TAU * j / PATH_STEPS, rr = b.R * b.shape[j] * growth(b, b.lag[j], dt);
      var x = b.cx + Math.cos(a) * rr, y = b.cy + Math.sin(a) * rr;
      if (rr > 0) any = true;
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    return any;
  }

  function clipSector(ctx, hit, si) {
    if (si < 0) return;
    var sec = hit.sectors[si];
    if (sec.whole) return;
    ctx.beginPath();
    tracePoly(ctx, sec.poly);
    ctx.clip();
  }

  function drawFringe(ctx, hit, b, dt) {
    var f = b.fringe, w = hit.cell;
    for (var c = 0; c < f.pal.length; c++) {
      ctx.beginPath();
      for (var j = 0; j < f.n; j++) {
        if (f.col[j] !== c || (!f.len[j] && !f.dot[j])) continue;
        var g = growth(b, f.lag[j], dt);
        if (g <= 0) continue;
        var a = f.a[j], ca = Math.cos(a), sa = Math.sin(a), rr = b.R * f.shape[j] * g;
        var x = b.cx + ca * rr, y = b.cy + sa * rr, L = f.len[j] * g;
        if (L > 0) {
          if (Math.abs(sa) >= Math.abs(ca)) ctx.rect(x - w / 2, sa > 0 ? y : y - L, w, L);
          else ctx.rect(ca > 0 ? x : x - L, y - w / 2, L, w);
        }
        if (f.dot[j]) ctx.rect(x + ca * (L + f.dot[j]) - w / 2, y + sa * (L + f.dot[j]) - w / 2, w, w);
      }
      ctx.fillStyle = f.pal[c];
      ctx.fill();
    }
  }

  /* Small repeating textures, one screen pixel to a tile: the faint grain of
     a dead panel, the pixel grid that shows through white, and the lit grid
     inside a band of shattered glass. */
  var tiles = {};
  function tile(name) {
    if (tiles[name] || typeof document === 'undefined') return tiles[name];
    var c = document.createElement('canvas'), x;
    c.width = c.height = 4;
    x = c.getContext('2d');
    if (name === 'grain') {
      x.fillStyle = 'rgba(70,52,96,0.22)';
      x.fillRect(0, 0, 1, 1);
      x.fillRect(2, 2, 1, 1);
      x.fillStyle = 'rgba(40,30,60,0.18)';
      x.fillRect(3, 0, 1, 1);
      x.fillRect(1, 3, 1, 1);
    } else {
      x.fillStyle = name === 'grid' ? '#ffffff' : '#ffffff';
      x.fillRect(0, 0, 4, 4);
      x.fillStyle = name === 'grid' ? '#c9ccd6' : '#8d8aa6';
      x.fillRect(3, 0, 1, 4);
      x.fillRect(0, 3, 4, 1);
    }
    tiles[name] = c;
    return c;
  }
  function pattern(ctx, name, u) {
    var t = tile(name);
    if (!t) return null;
    var pat = ctx.createPattern(t, 'repeat');
    if (!pat || !pat.setTransform || !global.DOMMatrix) return null;
    pat.setTransform(new DOMMatrix([u / 4, 0, 0, u / 4, 0, 0]));
    return pat;
  }

  // env: { k: CSS pixels per screen unit now, dpr, zoom, still }.
  function drawLCD(ctx, hits, t, env) {
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      hit.blobs.forEach(function (b) {
        if (dt < b.delay) return;
        ctx.save();
        clipSector(ctx, hit, b.sector);
        drawFringe(ctx, hit, b, dt);
        ctx.restore();
      });
    });
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      hit.blobs.forEach(function (b) {
        if (dt < b.delay) return;
        ctx.save();
        clipSector(ctx, hit, b.sector);
        ctx.beginPath();
        if (traceBlob(ctx, b, dt)) {
          ctx.fillStyle = b.kind === 'white' ? WHITE : b.kind === 'wet' ? WET : DARK;
          ctx.fill();
          var pat = pattern(ctx, b.kind === 'white' ? 'grid' : 'grain', hit.u);
          if (pat) {
            ctx.globalCompositeOperation = b.kind === 'white' ? 'multiply' : 'source-over';
            ctx.globalAlpha = b.kind === 'white' ? 0.55 : 1;
            ctx.fillStyle = pat;
            ctx.fill();
          }
        }
        ctx.restore();
      });
    });
    var minTh = 0.9 / (env.k * env.dpr);
    hits.forEach(function (hit) {
      var dt = t - hit.t0, groups = {};
      hit.lines.forEach(function (l) {
        if (dt < l.t || (dt > l.t + 0.05 && dt < l.t + 0.09)) return;
        (groups[l.clip] = groups[l.clip] || []).push(l);
      });
      Object.keys(groups).forEach(function (key) {
        var si = +key;
        ctx.save();
        if (si >= 0) {
          clipSector(ctx, hit, si);
          ctx.beginPath();
          var any = false;
          hit.blobs.forEach(function (b) { if (b.sector === si && dt >= b.delay && traceBlob(ctx, b, dt)) any = true; });
          if (!any) { ctx.restore(); return; }
          ctx.clip();
        }
        groups[key].forEach(function (l) {
          var th = Math.max(l.th, minTh);
          ctx.globalAlpha = l.alpha;
          ctx.globalCompositeOperation = l.dead ? 'source-over' : l.blend || 'lighten';
          ctx.fillStyle = l.dead ? 'rgba(0,0,0,0.85)' : l.color;
          l.segs.forEach(function (sg) {
            if (l.horiz) ctx.fillRect(sg[0], l.pos, sg[1] - sg[0], th);
            else ctx.fillRect(l.pos, sg[0], th, sg[1] - sg[0]);
          });
        });
        ctx.restore();
      });
    });
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      if (dt < 0.02 || (!hit.haze.length && !hit.blotch)) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighten';
      var f = Math.min(1, dt / 0.3);
      hit.haze.forEach(function (h) {
        ctx.fillStyle = h[3];
        ctx.globalAlpha = 0.7 * f;
        ctx.fillRect(h[0] - h[2] / 2, h[1] - h[2] / 2, h[2], h[2]);
      });
      if (hit.blotch) {
        ctx.globalAlpha = 0.85 * f;
        ctx.beginPath();
        tracePoly(ctx, hit.blotch);
        ctx.fillStyle = '#c9c24c';
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function traceCrack(ctx, c, dt, ox, oy) {
    var L = (dt - c.start) * c.speed, p = c.pts, cum = c.cum;
    if (L <= 0) return;
    ctx.moveTo(p[0][0] + ox, p[0][1] + oy);
    for (var i = 1; i < p.length; i++) {
      if (cum[i] <= L) {
        ctx.lineTo(p[i][0] + ox, p[i][1] + oy);
        continue;
      }
      var f = (L - cum[i - 1]) / (cum[i] - cum[i - 1]);
      ctx.lineTo(p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f + ox, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f + oy);
      return;
    }
  }

  function drawRibbon(ctx, hit, c, dt, css, boost) {
    var L = Math.min(c.len, (dt - c.start) * c.speed), R = c.rib;
    if (L <= 0 || !R) return;
    ctx.beginPath();
    for (var i = 0; i < R.d.length && R.d[i] <= L; i++) ctx.rect(R.x[i], R.y[i], R.w[i], R.h[i]);
    ctx.fillStyle = 'rgba(190,188,218,0.82)';
    ctx.fill();
    var pat = pattern(ctx, 'lit', hit.u);
    if (pat) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pat;
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    for (i = 0; i < R.hair.length && R.hair[i][2] <= L; i++) {
      if (i) ctx.lineTo(R.hair[i][0], R.hair[i][1]); else ctx.moveTo(R.hair[i][0], R.hair[i][1]);
    }
    ctx.strokeStyle = 'rgba(250,251,255,0.95)';
    ctx.lineWidth = 0.9 * css * boost;
    ctx.stroke();
  }

  function drawSmear(ctx, sm, dt) {
    if (dt < sm.t) return;
    var r = Smash.rng(sm.seed), f = Math.min(1, (dt - sm.t) / 0.12), i;
    ctx.save();
    if (sm.kind === 'slime') {
      // A glossy wet streak where the fish slapped the glass.
      ctx.translate(sm.x, sm.y);
      ctx.rotate(sm.rot);
      ctx.scale(f, f);
      ctx.fillStyle = 'rgba(170,215,235,0.16)';
      ctx.beginPath();
      ctx.ellipse(0, 0, sm.rx, sm.ry, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235,250,255,0.55)';
      ctx.lineWidth = sm.ry * 0.08;
      ctx.lineCap = 'round';
      for (i = 0; i < 5; i++) {
        var y = r.range(-0.6, 0.6) * sm.ry, x0 = r.range(-0.8, -0.2) * sm.rx, x1 = r.range(0.2, 0.8) * sm.rx;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo((x0 + x1) / 2, y - sm.ry * r.range(-0.3, 0.3), x1, y);
        ctx.stroke();
      }
      for (i = 0; i < 9; i++) {
        ctx.fillStyle = 'rgba(225,245,255,' + r.range(0.3, 0.7).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(r.range(-1.2, 1.2) * sm.rx, r.range(-1.4, 1.4) * sm.ry, sm.ry * r.range(0.05, 0.14), 0, TAU);
        ctx.fill();
      }
    } else {
      // A splat of banana mush with dark flecks.
      ctx.translate(sm.x, sm.y);
      ctx.scale(f, f);
      var n = 14, pts = [];
      for (i = 0; i < n; i++) pts.push(sm.R * r.range(0.6, 1.25));
      ctx.beginPath();
      for (i = 0; i <= n; i++) {
        var a = TAU * i / n, rr = pts[i % n];
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(244,226,150,0.88)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,150,60,0.6)';
      ctx.lineWidth = sm.R * 0.05;
      ctx.stroke();
      for (i = 0; i < 10; i++) {
        ctx.fillStyle = r.chance(0.5) ? 'rgba(110,70,30,0.7)' : 'rgba(255,245,200,0.8)';
        ctx.beginPath();
        ctx.arc(r.range(-0.7, 0.7) * sm.R, r.range(-0.7, 0.7) * sm.R, sm.R * r.range(0.03, 0.08), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGlass(ctx, hits, t, env) {
    var css = 1 / env.k, boost = Math.pow(Math.max(1, env.zoom), 0.35);
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      if (dt < 0) return;
      var m = hit.P;
      if (!env.still && dt < 0.18) {
        var fl = ctx.createRadialGradient(m[0], m[1], 0, m[0], m[1], 160 * hit.u);
        fl.addColorStop(0, 'rgba(255,255,255,' + (0.85 * (1 - dt / 0.18)).toFixed(3) + ')');
        fl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fl;
        ctx.fillRect(m[0] - 160 * hit.u, m[1] - 160 * hit.u, 320 * hit.u, 320 * hit.u);
      }
      // Where a piece has flown out, the glass is gone.
      hit.holes.forEach(function (h) {
        if (dt < h.t) return;
        ctx.beginPath();
        tracePoly(ctx, h.poly);
        ctx.fillStyle = HOLE;
        ctx.fill();
      });
      hit.cracks.forEach(function (c) { if (c.style === 'ribbon') drawRibbon(ctx, hit, c, dt, css, boost); });
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      [[0.6 * css, 'rgba(0,0,0,0.5)', 1.7], [0, 'rgba(210,225,255,0.14)', 4], [0, 'rgba(245,248,255,0.5)', 0.9]].forEach(function (pass) {
        ctx.beginPath();
        hit.cracks.forEach(function (c) { if (c.style !== 'ribbon') traceCrack(ctx, c, dt, pass[0], pass[0]); });
        ctx.strokeStyle = pass[1];
        ctx.lineWidth = pass[2] * css * boost;
        ctx.stroke();
      });
      // A few cracks shimmer with colour, like a thin prism.
      hit.cracks.forEach(function (c) {
        if (!c.rainbow || dt <= c.start) return;
        var a = c.pts[0], b = c.pts[c.pts.length - 1], gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        ['#ff4d6d', '#ffd84d', '#4dff88', '#4dd8ff', '#8a5bff', '#ff4dd8'].forEach(function (col, i, all) { gr.addColorStop(i / (all.length - 1), col); });
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        traceCrack(ctx, c, dt, 0, 0);
        ctx.strokeStyle = gr;
        ctx.lineWidth = 1.7 * css * boost;
        ctx.stroke();
        ctx.restore();
      });
      // The bright core is a string of lit dots, as the photo shows.
      ctx.save();
      ctx.lineCap = 'butt';
      ctx.setLineDash([1.1 * css * boost, 1 * css * boost]);
      ctx.beginPath();
      hit.cracks.forEach(function (c) { if (c.style !== 'ribbon') traceCrack(ctx, c, dt, 0, 0); });
      ctx.strokeStyle = 'rgba(250,252,255,0.95)';
      ctx.lineWidth = 0.95 * css * boost;
      ctx.stroke();
      ctx.restore();
      hit.cracks.forEach(function (c) {
        if (!c.fuzz || dt <= c.start) return;
        var L = (dt - c.start) * c.speed;
        c.fuzz.forEach(function (f) {
          if (f[4] > L) return;
          ctx.fillStyle = f[5];
          ctx.fillRect(f[0], f[1], f[2], f[3]);
        });
      });
      hit.holes.forEach(function (h) {
        if (dt < h.t) return;
        ctx.beginPath();
        tracePoly(ctx, h.poly);
        ctx.strokeStyle = 'rgba(235,242,255,0.8)';
        ctx.lineWidth = 1.1 * css * boost;
        ctx.stroke();
      });
      ctx.beginPath();
      tracePoly(ctx, hit.crater);
      ctx.fillStyle = 'rgba(235,240,255,0.92)';
      ctx.fill();
      hit.glitter.forEach(function (g) {
        ctx.fillStyle = 'rgba(255,255,255,' + g[3].toFixed(2) + ')';
        ctx.fillRect(g[0] - g[2] / 2, g[1] - g[2] / 2, g[2], g[2]);
      });
      hit.smears.forEach(function (sm) { drawSmear(ctx, sm, dt); });
    });
  }

  Smash.Damage = {
    glass: glass, make: make, drawLCD: drawLCD, drawGlass: drawGlass,
    damageAt: damageAt, aliveMask: aliveMask, lastBlow: lastBlow,
    nearCrack: function (G, x, y, r) { return !!nearest(G, x, y, r); },
    inHole: inHole, WEAPONS: Object.keys(WEAPON)
  };
})(this);
