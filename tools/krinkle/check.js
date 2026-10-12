/* Checks the Modulo Krinkle maths in app/tiles/krinkle/tiling.js, the Phase 1
   checks of docs/krinkle.md. Plain Node, no packages.

   Run from anywhere:
     node tools/krinkle/check.js [options]

   Options:
     --random <count>   random valid sets to add after the presets (default 200)
     --seed <number>    seed for the random sets (default 1)
     --quick            smaller discs and fewer points, for a fast look
     --only <m,k,t,o>   check one set, e.g. --only 3,7,2,1

   Every set is built in all three arrangements and put through:
     1  prototile: outline simple, signed area positive, area equals the
        lattice cell |d_0 x d_1|
     2  front sequences, and the apex as a sum along the front (3, 7, 14
        only, but the apex agreement runs on every set)
     3  edge pairing: every edge inside the disc has exactly two tiles,
        walking it in opposite directions
     4  coverage: each random point inside the disc lies in one tile
     5  chunks: a 6 x 6 grid of chunk queries, and a 2 x 2 block further out,
        equal the brute-force enumeration, each tile once; the packed record
        decodes to the same tiles
     6  edge rule: under Single, every shared edge draws one curve from both
        sides, except the central edge with offset; Double has no exception
     7  timing: a chunk at the default view builds in under 30 ms
     8  collision limits (presets only): the page's search for the heights
        where tiles overlap runs on the Krinkle outline in under 200 ms,
        and the outline crosses itself just past each limit, not before
   plus the arm counts, and that invalid sets are rejected with a reason.

   The disc is 40 tile lengths (|Q|) across its radius for the presets and
   12 for the random sets. Points: 100,000 and 20,000. Exit code 1 on any
   failure. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..') + '/';
const K = require(ROOT + 'app/tiles/krinkle/tiling.js');
const ES = require(ROOT + 'app/tiles/engine/edges.js');
const TM = require(ROOT + 'app/tiles/engine/map.js').TilingMap;

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const QUICK = args.includes('--quick');
const RANDOM = +opt('random', 200);
const SEED = +opt('seed', 1);
const ONLY = opt('only', null);

// A small seeded generator, so a failing random set can be run again.
function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

let failures = 0;
function fail(label, msg) { failures++; console.log('  FAIL ' + label + ': ' + msg); }
function must(label, ok, msg) { if (!ok) fail(label, msg); return ok; }

/* ------------------------------------------------------------- geometry */

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentsMeet(a, b, c, d) {
  const e = 1e-9;
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
  if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
  const on = (p, q, r) => Math.abs(cross(p, q, r)) <= e &&
    Math.min(p[0], q[0]) - e <= r[0] && r[0] <= Math.max(p[0], q[0]) + e &&
    Math.min(p[1], q[1]) - e <= r[1] && r[1] <= Math.max(p[1], q[1]) + e;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
// Does the closed polygon touch or cross itself? Edges sharing a corner may
// meet at that corner only.
function selfTouching(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Neighbouring edges meet at their shared corner and nowhere else:
        // the far end of each must not lie on the other.
        const [p, q, r] = j === i + 1 ? [poly[i], poly[j], poly[(j + 1) % n]] : [poly[j], poly[0], poly[1]];
        if (Math.abs(cross(p, q, r)) < 1e-12 &&
            ((q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1])) < 0) return true;
        continue;
      }
      if (segmentsMeet(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const ptKey = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);

/* --------------------------------------------------------------- checks */

function check1(label, ctx) {
  const I = ctx.info;
  must(label + ' prototile', !selfTouching(I.outline), 'outline touches or crosses itself');
  must(label + ' prototile', I.area > 0, 'signed area ' + I.area + ' is not positive');
  const det = Math.abs(I.d0[0] * I.d1[1] - I.d0[1] * I.d1[0]);
  must(label + ' prototile', Math.abs(det - I.area) < 1e-9 * Math.max(1, det), 'area ' + I.area + ' differs from |d0 x d1| ' + det);
  must(label + ' prototile', I.edgeCount === 2 * I.k + 2, 'edge count ' + I.edgeCount);
  // The two boundaries of a wedge: d_0 + d_1 is d_0 turned by one step.
  const a = 2 * Math.PI / I.n, c = Math.cos(a), s = Math.sin(a);
  const rx = c * I.d0[0] - s * I.d0[1], ry = s * I.d0[0] + c * I.d0[1];
  must(label + ' prototile', Math.hypot(rx - (I.d0[0] + I.d1[0]), ry - (I.d0[1] + I.d1[1])) < 1e-9, 'd0 + d1 is not d0 turned one step');
}

function check2(label, ctx) {
  const I = ctx.info;
  // The apex rule equals the sum along the front, for every wedge built by rule.
  for (let i = 0; i < I.w; i++) {
    const f = ctx.front(i);
    // The step that starts wedge i is the one congruent to i, at hour i + k.
    const js = f.indexOf(i + I.k);
    let x = 0, y = 0;
    for (let j = 0; j < js; j++) { x += ctx.vx(f[j]); y += ctx.vy(f[j]); }
    if (js !== I.jstar[i] || Math.hypot(x - I.apex[i][0], y - I.apex[i][1]) > 1e-9) {
      fail(label + ' front', 'apex of wedge ' + i + ' differs from the sum along the front');
      return;
    }
  }
  if (I.k === 7 && I.m === 3 && I.n === 14) {
    const want = { 1: '7,3,6,2,5,8,4', 2: '7,3,6,9,5,8,4', 3: '7,10,6,9,5,8,4' };
    for (const i of [1, 2, 3]) {
      must(label + ' front', ctx.front(i).join() === want[i], 'front before wedge ' + i + ' reads ' + ctx.front(i).join() + ', want ' + want[i]);
    }
  }
}

// Every tile within the disc, with its corners.
function gather(ctx, radius) {
  const I = ctx.info, tiles = [];
  ctx.enumerate(radius + I.circumradius, (t) => { tiles.push(t); });
  return tiles;
}

/* The two geometric checks share one gather. R is the disc radius in plane
   units; edges count when both ends lie at least 2 tile lengths inside. */
function checks34(label, ctx, R, points, rnd) {
  const I = ctx.info, E = R - 2 * I.Qlen, inner = R - 2 * I.Qlen;
  const tiles = gather(ctx, E);
  const dir = new Map();
  const edges = [];       // {a, b, tile, e}
  tiles.forEach((t, ti) => {
    const cs = ctx.corners(t);
    for (let e = 0; e < cs.length; e++) {
      const a = cs[e], b = cs[(e + 1) % cs.length];
      const ka = ptKey(a), kb = ptKey(b);
      const k = ka + '>' + kb;
      dir.set(k, (dir.get(k) || 0) + 1);
      // A corner can sit exactly on the disc's rim, so keep the margin
      // clear of rounding noise.
      if (Math.hypot(a[0], a[1]) > E - 1e-6 || Math.hypot(b[0], b[1]) > E - 1e-6) continue;
      edges.push({ a, b, ka, kb, ti, e });
    }
  });
  // Edge pairing. Each directed edge appears once, and so does its reverse.
  let bad = 0, first = null;
  edges.forEach((ed) => {
    const fwd = dir.get(ed.ka + '>' + ed.kb), rev = dir.get(ed.kb + '>' + ed.ka);
    if (fwd !== 1 || rev !== 1) { bad++; if (!first) first = ed; }
  });
  must(label + ' pairing', bad === 0,
    bad + ' of ' + edges.length + ' edges not shared by exactly two tiles in opposite directions' +
    (first ? ' (first: tile ' + first.ti + ' edge ' + first.e + ')' : ''));

  // Coverage by random points, bucketed by tile centre.
  const cell = I.circumradius, grid = new Map();
  tiles.forEach((t, ti) => {
    const k = Math.floor(t.x / cell) + ',' + Math.floor(t.y / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(ti);
  });
  const cache = new Map();
  const cornersOf = (ti) => { let c = cache.get(ti); if (!c) { c = ctx.corners(tiles[ti]); cache.set(ti, c); } return c; };
  let wrong = 0, ex = null;
  for (let p = 0; p < points; p++) {
    const ang = rnd() * 2 * Math.PI, rad = inner * Math.sqrt(rnd());
    const pt = [rad * Math.cos(ang), rad * Math.sin(ang)];
    const gx = Math.floor(pt[0] / cell), gy = Math.floor(pt[1] / cell);
    let hits = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = grid.get((gx + dx) + ',' + (gy + dy));
      if (!list) continue;
      for (const ti of list) {
        const t = tiles[ti];
        if (Math.hypot(pt[0] - t.x, pt[1] - t.y) > I.circumradius + 1e-9) continue;
        if (inPoly(pt, cornersOf(ti))) hits++;
      }
    }
    if (hits !== 1) { wrong++; if (!ex) ex = { pt, hits }; }
  }
  must(label + ' coverage', wrong === 0,
    wrong + ' of ' + points + ' points not in exactly one tile' + (ex ? ' (first: ' + ex.pt.map((v) => v.toFixed(3)) + ' in ' + ex.hits + ')' : ''));
  return { tiles, edges, E };
}

function decode(buf, count) {
  const f = new Float32Array(buf), iv = new Int32Array(buf), u = new Uint32Array(buf), out = [];
  for (let i = 0; i < count; i++) {
    const b = i * 7;
    out.push({ x: f[b], y: f[b + 1], r: iv[b + 2], c: iv[b + 3], turn: u[b + 4] & 255, lo: !!(u[b + 4] & 256), hi: !!(u[b + 4] & 512) });
  }
  return out;
}

function check5(label, ctx, arr) {
  const I = ctx.info, size = I.chunkSize;
  const handler = K.createHandler();
  let ready = null;
  handler({ type: 'init', options: { m: I.m, k: I.k, t: I.t, offset: I.offset, arrangement: arr } }, (m) => { ready = m; });
  must(label + ' chunks', ready && ready.type === 'ready', 'init did not answer ready');
  const key = (t) => t.turn + ':' + t.r + ':' + t.c;
  function region(i0, j0, nx, ny) {
    const got = new Map();
    for (let i = i0; i < i0 + nx; i++) for (let j = j0; j < j0 + ny; j++) {
      let res = null;
      handler({ type: 'chunk', i, j, size }, (m) => { res = m; });
      decode(res.buffer, res.count).forEach((t) => {
        const world = [t.x + res.P0[0], t.y + res.P0[1]];
        // Chunk membership: the centre lies in this chunk's square.
        if (!(world[0] >= i * size - 1e-3 && world[0] < (i + 1) * size + 1e-3 && world[1] >= j * size - 1e-3 && world[1] < (j + 1) * size + 1e-3)) {
          fail(label + ' chunks', 'tile outside its chunk');
        }
        const k = key(t);
        if (got.has(k)) fail(label + ' chunks', 'tile ' + k + ' built twice');
        got.set(k, { t, world });
      });
    }
    return got;
  }
  [[-3, -3, 6, 6], [5, -4, 2, 2]].forEach(([i0, j0, nx, ny]) => {
    const got = region(i0, j0, nx, ny);
    // Brute force over a disc that covers the whole block.
    const far = Math.max(Math.abs(i0), Math.abs(i0 + nx), Math.abs(j0), Math.abs(j0 + ny)) * size * Math.SQRT2 + 1;
    const want = new Map();
    ctx.enumerate(far, (t) => {
      if (t.x >= i0 * size && t.x < (i0 + nx) * size && t.y >= j0 * size && t.y < (j0 + ny) * size) {
        want.set(t.turn + ':' + t.r + ':' + t.c, t);
      }
    });
    let missing = 0, extra = 0, off = 0, flag = 0;
    want.forEach((t, k) => {
      const g = got.get(k);
      if (!g) { missing++; return; }
      if (Math.hypot(g.world[0] - t.x, g.world[1] - t.y) > 1e-3 * Math.max(1, Math.hypot(t.x, t.y)) + 1e-3) off++;
      if (g.t.lo !== t.lo || g.t.hi !== t.hi) flag++;
    });
    got.forEach((g, k) => { if (!want.has(k)) extra++; });
    must(label + ' chunks', missing === 0 && extra === 0 && off === 0 && flag === 0,
      'block (' + i0 + ',' + j0 + ' ' + nx + 'x' + ny + '): ' + missing + ' missing, ' + extra + ' extra, ' + off + ' misplaced, ' + flag + ' wrong flags of ' + want.size);
  });
}

/* The edge rule. Each tile's curve along a shared edge is the profile after
   the edge's symmetry, placed as engine/edges.js does. Both tiles must give
   the same polyline. Returns how many shared edges disagree. */
function curveKey(a, b, pts) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  return pts.map((p) => ptKey([a[0] + p[0] * ex - p[1] * ey, a[1] + p[0] * ey + p[1] * ex]));
}
function check6(label, ctx, found, arrangementName) {
  const I = ctx.info;
  const out = {};
  [['single', true], ['double', false]].forEach(([name, single]) => {
    const st = { shape: 'triangle', bend: 0.25, params: { peak: 0.3 }, arrangement: single ? 'alt' : 'both' };
    const prof = ES.profile(st, 3);
    const byEdge = new Map();
    found.edges.forEach((ed) => {
      const k = ed.ka < ed.kb ? ed.ka + '#' + ed.kb : ed.kb + '#' + ed.ka;
      if (!byEdge.has(k)) byEdge.set(k, []);
      byEdge.get(k).push(ed);
    });
    let badCount = 0; const badEnds = [];
    byEdge.forEach((list) => {
      if (list.length !== 2) return;
      const curves = list.map((ed) => {
        const tile = found.tiles[ed.ti];
        // Under Single the symmetry comes from the tile's edge number. The
        // repeating arrangement uses the same rule.
        const g = ctx.edgeSym(ed.e, single);
        const pts = ES.transform(prof, g);
        const ks = curveKey(ed.a, ed.b, pts);
        return ks.slice().sort().join(';');
      });
      if (curves[0] !== curves[1]) { badCount++; badEnds.push(list[0]); }
    });
    out[name] = { bad: badCount, ends: badEnds };
  });
  must(label + ' edge-rule ' + arrangementName + ' double', out.double.bad === 0, out.double.bad + ' shared edges draw two curves under Double');
  if (I.offset && arrangementName === 'fan') {
    const ok = out.single.bad === 1;
    must(label + ' edge-rule fan single', ok, out.single.bad + ' shared edges draw two curves under Single, want exactly the central edge');
    if (ok) {
      const ed = out.single.ends[0];
      const c = I.centre;
      const mid = [(ed.a[0] + ed.b[0]) / 2, (ed.a[1] + ed.b[1]) / 2];
      must(label + ' edge-rule fan single', Math.hypot(mid[0] - c[0], mid[1] - c[1]) < 1e-6, 'the one failing edge is not the central edge');
    }
  } else {
    must(label + ' edge-rule ' + arrangementName + ' single', out.single.bad === 0, out.single.bad + ' shared edges draw two curves under Single');
  }
}

function check7(label, ctx) {
  const I = ctx.info, size = I.chunkSize;
  // The default view is centred on the centre of the tiling.
  const ci = Math.floor(I.centre[0] / size), cj = Math.floor(I.centre[1] / size);
  const run = () => {
    let worst = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const t0 = process.hrtime.bigint();
      ctx.chunk(i, j, size);
      worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return worst;
  };
  run();                       // let the engine warm up, as a page would
  const worst = run();
  must(label + ' timing', worst < 30, 'worst chunk at the default view took ' + worst.toFixed(1) + ' ms');
  return worst;
}

function checkArms(label, ctx) {
  const I = ctx.info;
  if (I.offset || I.k === 1) { must(label + ' arms', I.arms === null, 'arm counts shown where none are published'); return; }
  must(label + ' arms', I.arms && I.arms.ccw + I.arms.cw === I.t * I.k && I.arms.ccw === I.t * ctx.minv && (ctx.minv * I.m) % I.k === 1,
    'arm counts are not t m^-1 and t (k - m^-1)');
  if (I.k === 7 && I.m === 3 && I.t === 2) {
    must(label + ' arms', I.arms.ccw === 10 && I.arms.cw === 4, '(3, 7, 14) has ' + I.arms.ccw + ' and ' + I.arms.cw + ' arms, want 10 and 4');
  }
}

// The search the page runs under its Height slider, for each edge shape and
// each arrangement allowed: Double only with offset.
function check8(label, ctx) {
  const I = ctx.info;
  ES.SHAPES.filter((sh) => sh.id !== 'line').forEach((sh) => {
    (I.offset ? ['S'] : ['alt', 'S']).forEach((arr) => {
      const at = (h) => {
        const p = ES.fitted({ shape: sh.id, bend: h, params: ES.DEFAULTS, arrangement: arr }, 2);
        return ES.outlineWith(I.outline, () => p, (e) => K.edgeSymmetry(I.k, e, arr === 'alt'));
      };
      const hits = (h) => TM.crossings(at(h), true).length > 0;
      const t0 = Date.now(), L = ES.limitsBy(hits), ms = Date.now() - t0;
      const tag = label + ' limits ' + sh.id + ' ' + arr;
      must(tag, ms < 200, 'the search took ' + ms + ' ms');
      L.forEach((lim) => {
        if (lim !== null) must(tag, !hits(lim * 0.98) && hits(lim * 1.02 > 0.75 ? lim : lim * 1.02), 'no crossing change at ' + lim.toFixed(3));
      });
    });
  });
}

/* ----------------------------------------------------------------- main */

function run(setup, tag, big, rnd) {
  const R = (big ? 40 : 12) * 1; // tile lengths
  const points = QUICK ? 5000 : big ? 100000 : 20000;
  const opts = { m: setup.m, k: setup.k, t: setup.t, offset: setup.offset };
  const t0 = Date.now();
  let tilesSeen = 0, worst = 0;
  const fails0 = failures;
  ['fan', 'boundary', 'repeat'].forEach((arr) => {
    const label = tag + ' ' + arr;
    const err = K.validate(Object.assign({ arrangement: arr }, opts));
    if (err) { fail(label, 'valid set rejected: ' + err); return; }
    const ctx = K.build(Object.assign({ arrangement: arr }, opts));
    const radius = (QUICK ? Math.min(R, 8) : R) * ctx.info.Qlen;
    check1(label, ctx);
    if (arr === 'fan') { check2(label, ctx); checkArms(label, ctx); if (big) check8(label, ctx); }
    const found = checks34(label, ctx, radius, points, rnd);
    tilesSeen += found.tiles.length;
    check5(label, ctx, arr);
    check6(label, ctx, found, arr);
    worst = Math.max(worst, check7(label, ctx));
  });
  console.log((failures === fails0 ? 'ok   ' : 'FAIL ') + tag + '  tiles ' + tilesSeen + '  chunk ' + worst.toFixed(1) + ' ms  ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

function validSets(rnd, count) {
  const out = [];
  while (out.length < count) {
    // k reaches the cap, but favours small values as the page's dice does.
    const k = 1 + Math.floor(K.MAX_K * Math.pow(rnd(), 2)), t = 2 + Math.floor(rnd() * 3), offset = rnd() < 0.5 ? 1 : 0;
    const ms = [];
    for (let m = 1; m < Math.max(k, 2); m++) if (K.validate({ m, k, t, offset }) === null) ms.push(m);
    if (!ms.length) continue;
    out.push({ m: ms[Math.floor(rnd() * ms.length)], k, t, offset });
  }
  return out;
}

function checkRejections() {
  const bad = [
    [{ m: 1, k: 0, t: 2, offset: 0 }, 'k'], [{ m: 1, k: 121, t: 2, offset: 0 }, 'k'],
    [{ m: 2, k: 4, t: 2, offset: 0 }, 'common factor'], [{ m: 4, k: 4, t: 2, offset: 0 }, 'm'],
    [{ m: 2, k: 1, t: 3, offset: 0 }, 'm'], [{ m: 1, k: 5, t: 1, offset: 0 }, 't'],
    [{ m: 1, k: 1, t: 2, offset: 1 }, 'n'], [{ m: 1, k: 1, t: 2, offset: 0 }, 'n'],
    [{ m: 1, k: 30, t: 9, offset: 0 }, '240'], [{ m: 1, k: 120, t: 2, offset: 1 }, '240'], [{ m: 1, k: 5, t: 2, offset: 2 }, 'offset'],
    [{ m: 1, k: 5, t: 2, offset: 0, arrangement: 'ring' }, 'arrangement']
  ];
  bad.forEach(([o, word]) => {
    const msg = K.validate(o);
    must('rejection ' + JSON.stringify(o), msg && msg.includes(word), 'got ' + JSON.stringify(msg));
  });
  [{ m: 1, k: 1, t: 3, offset: 0 }, { m: 1, k: 1, t: 3, offset: 1 }, { m: 29, k: 30, t: 8, offset: 0 }, { m: 119, k: 120, t: 2, offset: 0 },
   { m: 118, k: 119, t: 2, offset: 1 }].forEach((o) => {
    must('acceptance ' + JSON.stringify(o), K.validate(o) === null, 'rejected: ' + K.validate(o));
  });
  // The page-side handler answers an error message, not a throw.
  let reply = null;
  K.createHandler()({ type: 'init', options: { m: 2, k: 4, t: 2, offset: 0 } }, (m) => { reply = m; });
  must('rejection handler', reply && reply.type === 'error' && /common factor/.test(reply.message), 'handler answered ' + JSON.stringify(reply));
}

(function main() {
  const rnd = prng(SEED);
  checkRejections();
  if (ONLY) {
    const [m, k, t, o] = ONLY.split(',').map(Number);
    run({ m, k, t, offset: o }, '(' + m + ',' + k + ',' + K.directions(m, k, t, o) + ') t=' + t + (o ? ' offset' : ''), true, rnd);
  } else {
    K.PRESETS.forEach((p) => {
      run(p, '(' + p.m + ',' + p.k + ',' + K.directions(p.m, p.k, p.t, p.offset) + ') t=' + p.t + (p.offset ? ' offset' : '') + '  [' + p.source + ']', true, rnd);
    });
    validSets(rnd, RANDOM).forEach((p, i) => {
      run(p, 'random ' + (i + 1) + ' (' + p.m + ',' + p.k + ',' + K.directions(p.m, p.k, p.t, p.offset) + ') t=' + p.t + (p.offset ? ' offset' : ''), false, rnd);
    });
  }
  console.log(failures ? '\n' + failures + ' failure' + (failures > 1 ? 's' : '') : '\nAll checks pass.');
  process.exit(failures ? 1 : 0);
})();
