/* Checks the Tiling Puzzle's Krinkle verdicts in app/tiling-puzzle/checker.js:
   "Phase 7 checks" in docs/tiling-puzzle.md, plus a calibration of the
   reference radius, a second route to every match set, and a test that the
   edge contacts the checker reads near the centre are all of them. Plain
   Node, no packages, except that --url drives Chrome through Playwright.

   Run from anywhere:
     node tools/tiling-puzzle/check-phase7.js [options]

   Options:
     --quick           fewer samples and presets, for a fast look
     --seed <number>   seed for the random choices (default 1)
     --only <n>        run one check, 1 to 8
     --url <url>       check 8 drives the page, for example
                       http://localhost:8000/app/tiling-puzzle/

   Checks:
     1  Calibration: random edge-connected patches of the fan, cut from the
        centre, from the zone where a wedge is narrower than the patch, and
        from 10^4 widths out, are each found at the shipped radius, for all
        13 presets. A reference at 40% of the radius must miss some, so the
        sampling has the power to see a shortfall.
     2  Known patches: patches cut from the fan are found, and so are their
        mirror images, as the fan tiling, for an odd and an even n. The
        mirror is found by brute force, not by the checker's formula.
     3  Add-one soak: Add ones on the fan and on the repeating tiling for
        five presets, each patch verified against a reference of twice the
        radius, with Fill a ring and undos now and then.
     4  Stable verdicts: a legal patch plus one random snap-valid drop gets
        the same verdict at twice the radius.
     5  Dead corner: a corner with no placement is red, and its patch fits
        no known tiling.
     6  Second route: a brute-force search of each reference, which shares
        no lookup code with the checker, finds the same matches.
     7  Contacts: the catalogue the checker reads near the centre holds every
        edge contact in the whole reference.
     8  Speed and limits: the build and the first drops, a tile that is too
        fine to check, and the page (with --url).

   Exit code 1 on any failure. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..') + '/';
const TB = require(ROOT + 'app/tiling-puzzle/board.js');
const CK = require(ROOT + 'app/tiling-puzzle/checker.js');
const KT = require(ROOT + 'app/tiles/krinkle/tiling.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const QUICK = args.includes('--quick');
const SEED = +opt('seed', 1);
const ONLY = opt('only', null);
const URL = opt('url', null);

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
const rng = prng(SEED);
const pick = list => list[Math.floor(rng() * list.length)];
const mod = (a, n) => ((a % n) + n) % n;

let failures = 0;
function fail(label, msg) { failures++; if (failures < 40) console.log('  FAIL ' + label + ': ' + msg); }
function must(label, ok, msg) { if (!ok) fail(label, msg); return ok; }

/* ------------------------------------------------------------ shared */

const PRESETS = KT.PRESETS.map(p => ({ m: p.m, k: p.k, t: p.t, offset: p.offset }));
const name = o => '(' + o.m + ', ' + o.k + ', ' + KT.directions(o.m, o.k, o.t, o.offset) + (o.offset ? ', offset' : '') + ')';
const FIVE = [0, 1, 2, 10, 12];    // 2025 Fig. 1b, 1a, 5f; Bridges 6f (n = 27, odd); Bridges 9a (k = 1)
const THREE = [1, 10, 12];

const cache = new Map();
/* The piece, the tiling files, and the checker at a radius scale, each built
   once. */
function setup(o) {
  const key = [o.m, o.k, o.t, o.offset].join(',');
  if (!cache.has(key)) {
    const piece = TB.pieceType('krinkle', o);
    cache.set(key, {
      o: o, piece: piece, n: piece.turns,
      fan: KT.build(Object.assign({}, o, { arrangement: 'fan' })),
      rep: KT.build(Object.assign({}, o, { arrangement: 'repeat' })),
      checkers: new Map()
    });
  }
  return cache.get(key);
}
/* scale 1 is the shipped radius. */
function checkerAt(o, scale) {
  const s = setup(o);
  if (!s.checkers.has(scale)) {
    const plan = CK.krinklePlan(s.piece, {});
    const opts = Object.assign({}, o, { piece: s.piece });
    if (scale !== 1) { opts.radius = Math.ceil(plan.radius * scale); opts.dmax = plan.dmax; }
    s.checkers.set(scale, CK.createKrinkleChecker(opts));
  }
  return s.checkers.get(scale);
}
function drop(o, scale) { setup(o).checkers.delete(scale); }

/* Random edge-connected patches of 2 to 40 tiles with no two centroids more
   than dmax widths apart, cut from a tiling around `centre`, at distances
   [lo, hi] from it, in absolute units. Tiles come back as {turn, ox, oy}.
   Neighbours are found by a grid on the centroids and then by a shared
   edge, for the tiles the patch reaches only. */
function cutPatches(s, ctx, centre, lo, hi, dmax, count) {
  const piece = s.piece, width = piece.width, out = [];
  const key = (a, b) => Math.round(a[0] * 1e5) + ',' + Math.round(a[1] * 1e5) + '>' + Math.round(b[0] * 1e5) + ',' + Math.round(b[1] * 1e5);
  for (let tries = 0; out.length < count && tries < count * 25; tries++) {
    const ang = rng() * 2 * Math.PI, rad = lo + (hi - lo) * rng();
    const c = [centre[0] + rad * Math.cos(ang), centre[1] + rad * Math.sin(ang)];
    const half = dmax * width + 3 * width;
    const tiles = [];
    ctx.tilesInBox([c[0] - half, c[1] - half, c[0] + half, c[1] + half], t => tiles.push(t));
    if (tiles.length < 3) continue;
    const cen = tiles.map(t => { const V = TB.variant(piece, 0, t.turn); return [t.ox + V.cx, t.oy + V.cy]; });
    const grid = new Map();
    cen.forEach((q, i) => {
      const g = Math.floor(q[0] / width) + ',' + Math.floor(q[1] / width);
      if (!grid.has(g)) grid.set(g, []);
      grid.get(g).push(i);
    });
    const corners = new Map();
    const cornersOf = i => { let v = corners.get(i); if (!v) { v = ctx.corners(tiles[i]); corners.set(i, v); } return v; };
    const adjMemo = new Map();
    const adj = i => {
      let a = adjMemo.get(i);
      if (a) return a;
      a = [];
      const gx = Math.floor(cen[i][0] / width), gy = Math.floor(cen[i][1] / width), mine = new Set();
      const ci = cornersOf(i);
      for (let e = 0; e < ci.length; e++) mine.add(key(ci[(e + 1) % ci.length], ci[e]));
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        (grid.get((gx + dx) + ',' + (gy + dy)) || []).forEach(j => {
          if (j === i) return;
          const cj = cornersOf(j);
          for (let e = 0; e < cj.length; e++) if (mine.has(key(cj[e], cj[(e + 1) % cj.length]))) { a.push(j); return; }
        });
      }
      adjMemo.set(i, a);
      return a;
    };
    let st = 0, best = Infinity;
    cen.forEach((q, i) => { const d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < best) { best = d; st = i; } });
    const size = 2 + Math.floor(rng() * 39), snake = rng() < 0.3, limit = dmax * width;
    const order = [st], inP = new Set(order), frontier = new Set(adj(st));
    while (order.length < size && frontier.size) {
      const fr = Array.from(frontier);
      let j;
      if (snake) {
        fr.sort((a, b) => Math.hypot(cen[b][0] - cen[st][0], cen[b][1] - cen[st][1]) - Math.hypot(cen[a][0] - cen[st][0], cen[a][1] - cen[st][1]));
        j = fr[Math.floor(rng() * Math.min(3, fr.length))];
      } else {
        j = pick(fr);
      }
      frontier.delete(j);
      if (order.some(q => Math.hypot(cen[q][0] - cen[j][0], cen[q][1] - cen[j][1]) > limit)) continue;
      order.push(j); inP.add(j);
      adj(j).forEach(q => { if (!inP.has(q)) frontier.add(q); });
    }
    if (order.length >= 2) out.push(order.map(i => tiles[i]));
  }
  return out;
}

/* Absolute tiles as the board sees them: the first tile at turn 0 on the
   origin. */
function toBoard(s, tiles) {
  const n = s.n, t0 = tiles[0], c = Math.cos(2 * Math.PI * t0.turn / n), sn = Math.sin(2 * Math.PI * t0.turn / n);
  const out = tiles.map(t => {
    const dx = t.ox - t0.ox, dy = t.oy - t0.oy;
    return { flip: 0, turn: mod(t.turn - t0.turn, n), x: c * dx + sn * dy, y: -sn * dx + c * dy };
  });
  out[0] = { flip: 0, turn: 0, x: 0, y: 0 };
  return out;
}

/* The mirror image of absolute tiles (x -> -x), found geometrically: each
   mirrored outline is matched to a turn of the tile by search. It uses no
   formula for the turn. */
function mirrorTiles(s, ctx, tiles) {
  const piece = s.piece, n = s.n;
  return tiles.map(t => {
    const mc = ctx.corners(t).map(p => [-p[0], p[1]]);
    // The area centroid of the mirrored outline, by the shoelace sum taken
    // about its first corner, so a tile far from the origin keeps its digits.
    const bx = mc[0][0], by = mc[0][1];
    let cx = 0, cy = 0, A = 0;
    for (let i = 0; i < mc.length; i++) {
      const j = (i + 1) % mc.length;
      const x0 = mc[i][0] - bx, y0 = mc[i][1] - by, x1 = mc[j][0] - bx, y1 = mc[j][1] - by, w = x0 * y1 - x1 * y0;
      A += w; cx += (x0 + x1) * w; cy += (y0 + y1) * w;
    }
    cx = bx + cx / (3 * A); cy = by + cy / (3 * A);
    for (let j = 0; j < n; j++) {
      const V = TB.variant(piece, 0, j), ox = cx - V.cx, oy = cy - V.cy;
      let ok = true;
      for (let i = 0; i < V.n && ok; i++) {
        let hit = false;
        for (let q = 0; q < mc.length && !hit; q++) hit = Math.abs(V.xs[i] + ox - mc[q][0]) < 1e-6 && Math.abs(V.ys[i] + oy - mc[q][1]) < 1e-6;
        ok = hit;
      }
      if (ok) return { turn: j, ox: ox, oy: oy };
    }
    throw new Error('A mirrored tile is no turn of the tile.');
  });
}

/* Replays board-frame tiles on a fresh board, or null when one is not
   snap-valid. */
function replay(piece, tiles) {
  const board = TB.createBoard(piece);
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i];
    if (!board.canPlace(t.flip, t.turn, t.x, t.y)) return null;
    board.place(t);
  }
  return board;
}

/* ------------------------------------------------------------ check 1 */

function check1() {
  console.log('1  Calibration');
  const list = process.env.ONLY_PRESET ? [+process.env.ONLY_PRESET] : QUICK ? [0, 2, 10, 12] : PRESETS.map((p, i) => i);
  const samplesBase = QUICK ? 40 : 100;
  list.forEach(idx => {
    const o = PRESETS[idx], s = setup(o), ck = checkerAt(o, 1), plan = ck.built.plan;
    const fanPart = ck.parts[0], width = s.piece.width, n = s.n;
    // A patch inside a wedge matches at every interior anchor, so a big
    // reference costs more per patch: fewer patches for it.
    const samples = Math.max(8, Math.min(samplesBase, Math.floor(samplesBase * 70000 / fanPart.matcher.ref.count)));
    const s0 = (plan.dmax + 1) * n / (2 * Math.PI) * width;       // the zone limit, absolute
    const zones = [[0, 2 * width], [2 * width, 0.5 * s0 + 4 * width], [0.5 * s0, 1.5 * s0 + 4 * width], [1.5 * s0, 3 * s0 + 8 * width], [1e4 * width, 1.2e4 * width]];
    const patches = [];
    zones.forEach(z => {
      const t = Date.now();
      cutPatches(s, s.fan, s.fan.info.centre, z[0], z[1], plan.dmax, samples).forEach(p => patches.push(toBoard(s, p)));
      if (process.env.DEBUG) console.log('     zone ' + z.map(v => (v / width).toFixed(0)).join('-') + ' widths: ' + (Date.now() - t) + ' ms');
    });
    let missed = 0;
    const tm = Date.now();
    patches.forEach((p, pi) => {
      const t1 = Date.now();
      fanPart.session.sync(p);
      if (fanPart.session.summary().status !== 'fits') missed++;
      if (process.env.DEBUG && Date.now() - t1 > 500) console.log('     patch ' + pi + ' of ' + p.length + ' tiles took ' + (Date.now() - t1) + ' ms, M ' + fanPart.session.stack().map(e => e.M ? e.M.length : -1).join(','));
    });
    if (process.env.DEBUG) console.log('     sync ' + (Date.now() - tm) + ' ms');
    const line = '   ' + name(o) + ' n ' + n + ': ' + patches.length + ' patches up to ' + plan.dmax + ' widths, radius ' + plan.radius +
                 ' (' + fanPart.matcher.ref.count + ' tiles): ' + (patches.length - missed) + ' found';
    console.log(line);
    must('calibration', missed === 0, name(o) + ': ' + missed + ' of ' + patches.length + ' patches not found at the shipped radius');
    must('calibration', patches.length >= samples * 4, name(o) + ': only ' + patches.length + ' patches sampled');
  });
  // Power: a reference at 40% of the radius must miss some patches.
  const o = PRESETS[1], s = setup(o), small = checkerAt(o, 0.4), plan = small.built.plan;
  const part = small.parts[0], width = s.piece.width, s0 = (plan.dmax + 1) * s.n / (2 * Math.PI) * width;
  const patches = cutPatches(s, s.fan, s.fan.info.centre, 0.5 * s0, 3 * s0, plan.dmax, 200).map(p => toBoard(s, p));
  let missed = 0;
  patches.forEach(p => { part.session.sync(p); if (part.session.summary().status !== 'fits') missed++; });
  console.log('   power: ' + name(o) + ' at 40% of the radius (' + plan.radius + '): ' + missed + ' of ' + patches.length + ' patches missed');
  must('power', missed > 0, 'a reference at 40% of the radius missed nothing, so the sampling cannot see a shortfall');
  drop(o, 0.4);
}

/* ------------------------------------------------------------ check 2 */

function check2() {
  console.log('2  Known patches and mirror images');
  [PRESETS[10], PRESETS[1], PRESETS[2]].forEach(o => {
    const s = setup(o), ck = checkerAt(o, 1), plan = ck.built.plan, width = s.piece.width;
    const count = QUICK ? 60 : 200, session = ck.session;
    const s0 = (plan.dmax + 1) * s.n / (2 * Math.PI) * width;
    const raw = [];
    [[0, 2 * width], [2 * width, 1.5 * s0], [1e4 * width, 1.1e4 * width]].forEach(z => {
      cutPatches(s, s.fan, s.fan.info.centre, z[0], z[1], plan.dmax, count / 3).forEach(p => raw.push(p));
    });
    let plainOk = 0, mirrorOk = 0, mirrorSeen = 0;
    raw.forEach(p => {
      session.sync(toBoard(s, p));
      const a = session.summary();
      if (must('known', a.status === 'fits' && a.source === 'fan', name(o) + ': a fan patch is ' + a.status + ' (' + a.source + ')')) plainOk++;
      const mirrored = mirrorTiles(s, s.fan, p);
      session.sync(toBoard(s, mirrored));
      const b = session.summary();
      mirrorSeen++;
      if (must('mirror', b.status === 'fits' && b.source === 'fan', name(o) + ': the mirror image of a fan patch is ' + b.status + ' (' + b.source + ')')) mirrorOk++;
    });
    // The mirror image must be found in the mirrored fan, and in the plain
    // fan only when the patch happens to be mirror-symmetric.
    console.log('   ' + name(o) + ' n ' + s.n + (s.n % 2 ? ' (odd)' : '') + ': ' + raw.length + ' fan patches found, ' + mirrorOk + ' of ' + mirrorSeen + ' mirror images found');
    // The repeating tiling and its mirror.
    const rep = cutPatches(s, s.rep, [0, 0], 0, 6 * width, plan.dmax, 20);
    let repOk = 0;
    rep.forEach(p => {
      session.sync(toBoard(s, p));
      if (session.summary().status === 'fits') repOk++;
      session.sync(toBoard(s, mirrorTiles(s, s.rep, p)));
      if (must('rep-mirror', session.summary().status === 'fits', name(o) + ': a mirrored repeating patch is not found')) repOk++;
    });
    must('rep', repOk === rep.length * 2, name(o) + ': repeating patches found ' + repOk + ' of ' + rep.length * 2);
  });
}

/* ------------------------------------------------------------ check 3 */

function check3() {
  console.log('3  Add-one soak');
  const target = QUICK ? 100 : 500;
  (QUICK ? THREE : FIVE).forEach(idx => {
    const o = PRESETS[idx], s = setup(o), ck = checkerAt(o, 1);
    // The reference of twice the radius: fan and repeating only.
    const plan = ck.built.plan;
    const bigBuilt = CK.buildKrinkleReferences(Object.assign({}, o, { piece: s.piece, radius: plan.radius * 2, dmax: plan.dmax }));
    const bigFan = CK.createMatcher(bigBuilt.refs[0], { catalogue: [] }), bigRep = CK.createMatcher(bigBuilt.refs[2], { catalogue: [] });
    [[0, bigFan, 'fan'], [2, bigRep, 'repeating']].forEach(([pi, bigMatcher, label]) => {
      const part = ck.parts[pi], big = CK.createSession(bigMatcher);
      let adds = 0, fills = 0, undos = 0, runs = 0, most = 0, rings = 0;
      while (adds < target && runs < 400) {
        runs++;
        const board = TB.createBoard(s.piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }], sizes = [];
        part.session.sync(tiles); big.sync(tiles);
        while (adds < target && tiles.length < 140) {
          const roll = rng(), info = board.rings();
          if (roll < 0.06 && tiles.length > 3) {
            const keep = tiles.length - 1 - Math.floor(rng() * Math.min(5, tiles.length - 1));
            tiles.length = keep;
            board.undoTo(keep);
            part.session.sync(tiles);
            must('undo', part.session.summary().size === sizes[keep - 1], name(o) + ' ' + label + ': undo to ' + keep + ' gave ' + part.session.summary().size + ' matches, not ' + sizes[keep - 1]);
            sizes.length = keep;
            undos++;
            continue;
          }
          let added;
          if (roll < 0.14) { added = part.session.fillRing(Array.from(info.ring), info.complete); fills++; }
          else {
            const r = part.session.addOne(Array.from(info.ring));
            if (!must('add', r, name(o) + ' ' + label + ': Add one found nothing on a legal patch of ' + tiles.length)) break;
            added = [r.tile]; adds++;
          }
          const queue = added.slice();
          while (queue.length) {
            const k = queue.findIndex(t => board.canPlace(t.flip, t.turn, t.x, t.y));
            if (k < 0) break;
            const t = queue.splice(k, 1)[0];
            board.place(t); tiles.push(t);
          }
          if (!must('snap', !queue.length, name(o) + ' ' + label + ': ' + queue.length + ' added tiles are not snap-valid at ' + tiles.length)) break;
          part.session.sync(tiles); big.sync(tiles);
          const sa = part.session.summary(), sb = big.summary();
          part.session.stack().forEach((e, i) => { sizes[i] = e.M ? e.M.length : -1; });
          if (sa.large) break;
          if (!must('legal', sb.status === 'fits', name(o) + ' ' + label + ': a computer-built patch of ' + tiles.length + ' is ' + sb.status + ' at twice the radius')) break;
          must('legal', sa.status === 'fits', name(o) + ' ' + label + ': a computer-built patch is ' + sa.status + ' at the shipped radius');
          must('corner', board.deadCorners().length === 0, name(o) + ' ' + label + ': a legal patch has a dead corner');
          most = Math.max(most, tiles.length);
          rings = Math.max(rings, board.rings().complete);
        }
      }
      console.log('   ' + name(o) + ' ' + label + ': ' + adds + ' Add ones, ' + fills + ' Fill a rings, ' + undos + ' undos in ' + runs +
                  ' runs; up to ' + most + ' tiles and ring ' + rings + '; all legal at twice the radius');
    });
  });
}

/* ------------------------------------------------------------ check 4 */

/* One random snap-valid drop on a board, or null. */
function randomDrop(board, piece) {
  for (let k = 0; k < 60; k++) {
    const fe = pick(board.freeEdges()), turn = Math.floor(rng() * piece.turns);
    const cx = (fe.ax + fe.bx) / 2 + (rng() - 0.5) * piece.width * 0.4, cy = (fe.ay + fe.by) / 2 + (rng() - 0.5) * piece.width * 0.4;
    const snap = board.snap(0, turn, cx, cy, 0.6 * piece.width);
    if (snap) return { flip: 0, turn: snap.turn, x: snap.x, y: snap.y };
  }
  return null;
}

function check4() {
  console.log('4  Stable verdicts');
  const total = QUICK ? 60 : 300;
  (QUICK ? [PRESETS[1]] : THREE.map(i => PRESETS[i])).forEach(o => {
    const s = setup(o), small = checkerAt(o, 1), big = checkerAt(o, 2), plan = small.built.plan, width = s.piece.width;
    const s0 = (plan.dmax + 1) * s.n / (2 * Math.PI) * width;
    const bases = [];
    [[0, 3 * width], [1e4 * width, 1.1e4 * width]].forEach(z => cutPatches(s, s.fan, s.fan.info.centre, z[0], z[1], plan.dmax, total).forEach(p => bases.push(toBoard(s, p))));
    let done = 0, unknown = 0, fits = 0, large = 0;
    for (const base of bases) {
      if (done >= total) break;
      const board = replay(s.piece, base);
      if (!must('replay', board, name(o) + ': a legal patch would not replay on the board')) continue;
      const d = randomDrop(board, s.piece);
      if (!d) continue;
      const tiles = base.concat([d]);
      small.session.sync(tiles); big.session.sync(tiles);
      const a = small.session.summary(), b = big.session.summary();
      if (a.status === 'large') { large++; continue; }
      if (a.status === 'unknown') unknown++; else fits++;
      must('stable', a.status !== 'unknown' || b.status === 'unknown', name(o) + ': a patch unknown at the shipped radius fits at twice it');
      must('stable', a.status !== 'fits' || b.status === 'fits', name(o) + ': a patch that fits at the shipped radius is ' + b.status + ' at twice it');
      done++;
    }
    console.log('   ' + name(o) + ': ' + done + ' patches, ' + unknown + ' unknown and ' + fits + ' fitting, the same at twice the radius (' + large + ' too large skipped)');
    must('count', done >= total * 0.8, name(o) + ': only ' + done + ' patches made');
    drop(o, 2);
  });
}

/* ------------------------------------------------------------ check 5 */

function check5() {
  console.log('5  Dead corner');
  (QUICK ? [PRESETS[1]] : [PRESETS[1], PRESETS[10], PRESETS[2], PRESETS[4]]).forEach(o => {
    const s = setup(o), ck = checkerAt(o, 1), piece = s.piece;
    let found = 0, tries = 0, notRed = 0, fitsWrongly = 0;
    while (found < 5 && tries < 4000) {
      tries++;
      // Two random snap-valid tiles beside the first.
      const board = TB.createBoard(piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }];
      for (let k = 0; k < 2; k++) {
        const d = randomDrop(board, piece);
        if (!d) break;
        board.place(d); tiles.push(d);
      }
      if (!board.deadCorners().length) continue;
      found++;
      ck.session.sync(tiles);
      const v = ck.session.summary();
      // A corner with no placement stops the patch from joining any tiling.
      if (v.status === 'fits') fitsWrongly++;
      if (!board.deadCorners().length) notRed++;
    }
    console.log('   ' + name(o) + ': ' + found + ' patches of a tile and two more with a red corner in ' + tries + ' tries, none fits a tiling');
    must('dead', found > 0, name(o) + ': no two-tile patch with a dead corner in ' + tries + ' tries');
    must('dead', fitsWrongly === 0, name(o) + ': ' + fitsWrongly + ' patches with a dead corner fit a tiling');
    must('dead', notRed === 0, name(o) + ': a dead corner was not red');
  });
}

/* ------------------------------------------------------------ check 6 */

/* The second route: every reference tile by sorted centroid x. For each
   anchor, and each turn r with the anchor's orientation (modulo the tile's
   own half turn, where it has one), place the first user tile's centroid on
   the anchor and look up every other tile's centroid and orientation. */
function bruteCount(part, tiles, s) {
  const ref = part.matcher.ref, n = s.n, piece = s.piece;
  if (!ref._byX) {
    const idx = Array.from({ length: ref.count }, (_, i) => i).sort((a, b) => ref.CX[a] - ref.CX[b]);
    ref._byX = { idx: Int32Array.from(idx), keys: Float64Array.from(idx, i => ref.CX[i]) };
    // The tile's own half turn: the outline turned by pi about its centroid.
    const V = TB.variant(piece, 0, 0);
    let sym = n % 2 === 0;
    for (let i = 0; i < V.n && sym; i++) {
      const px = 2 * V.cx - V.xs[i], py = 2 * V.cy - V.ys[i];
      let hit = false;
      for (let j = 0; j < V.n && !hit; j++) hit = Math.abs(V.xs[j] - px) < 1e-6 && Math.abs(V.ys[j] - py) < 1e-6;
      sym = hit;
    }
    ref._period = sym ? n / 2 : n;
  }
  const { idx, keys } = ref._byX, period = ref._period;
  const find = (x, y, orient) => {
    let lo = 0, hi = keys.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < x - 1e-6) lo = mid + 1; else hi = mid; }
    for (let q = lo; q < keys.length && keys[q] <= x + 1e-6; q++) {
      const i = idx[q];
      if (Math.abs(ref.CY[i] - y) < 1e-6 && mod(ref.OR[i] - orient, period) === 0) return true;
    }
    return false;
  };
  const us = tiles.map(t => { const V = TB.variant(piece, 0, t.turn); return { turn: t.turn, cx: t.x + V.cx, cy: t.y + V.cy }; });
  let count = 0;
  for (let a = 0; a < ref.count; a++) {
    if (ref.distance(a) > ref.Rin * CK.SLACK) continue;
    for (let r = 0; r < n; r++) {
      if (mod(r - ref.OR[a], period) !== 0) continue;
      const c = Math.cos(2 * Math.PI * r / n), sn = Math.sin(2 * Math.PI * r / n);
      const tx = ref.CX[a] - (c * us[0].cx - sn * us[0].cy), ty = ref.CY[a] - (sn * us[0].cx + c * us[0].cy);
      let ok = true;
      for (let i = 1; i < us.length && ok; i++) {
        ok = find(c * us[i].cx - sn * us[i].cy + tx, sn * us[i].cx + c * us[i].cy + ty, r + us[i].turn);
      }
      if (ok) count++;
    }
  }
  return count;
}

function check6() {
  console.log('6  Second route');
  const per = QUICK ? 10 : 40;
  (QUICK ? [PRESETS[1]] : [PRESETS[1], PRESETS[10], PRESETS[12]]).forEach(o => {
    const s = setup(o), ck = checkerAt(o, 1), plan = ck.built.plan, width = s.piece.width;
    const s0 = (plan.dmax + 1) * s.n / (2 * Math.PI) * width;
    const cuts = [];
    cutPatches(s, s.fan, s.fan.info.centre, 0, 1.5 * s0, plan.dmax, per).forEach(p => cuts.push(p));
    cutPatches(s, s.rep, [0, 0], 0, 5 * width, plan.dmax, per).forEach(p => cuts.push(p));
    const patches = [];
    cuts.forEach(p => {
      patches.push(toBoard(s, p));
      patches.push(toBoard(s, mirrorTiles(s, s.fan, p)));      // a mirror image, found in the mirrored fan
    });
    // Legal patches plus one random drop: mostly unknown.
    patches.slice(0, per).forEach(base => {
      const board = replay(s.piece, base);
      const d = board && randomDrop(board, s.piece);
      if (d) patches.push(base.concat([d]));
    });
    let agree = 0, matches = 0, fit = 0;
    patches.forEach((tiles, pi) => {
      ck.parts.forEach(part => {
        part.session.sync(tiles);
        const top = part.session.stack()[tiles.length - 1];
        if (top.large) return;
        const mine = top.M.length, theirs = bruteCount(part, tiles, s);
        if (must('route', mine === theirs, name(o) + ' ' + part.label + ': ' + mine + ' matches against ' + theirs + ' by brute force, patch ' + pi + ' of ' + tiles.length + ' tiles')) {
          agree++; matches += mine; if (mine) fit++;
        }
      });
    });
    console.log('   ' + name(o) + ': ' + patches.length + ' patches against 4 references: ' + agree + ' match sets agree, ' + fit + ' fit, ' + matches + ' matches in all');
  });
}

/* ------------------------------------------------------------ check 7 */

function check7() {
  console.log('7  Contacts');
  (QUICK ? [PRESETS[1]] : [PRESETS[1], PRESETS[0], PRESETS[12], PRESETS[2]]).forEach(o => {
    const ck = checkerAt(o, 1), have = new Set(ck.catalogue.map(c => c.flip + ',' + c.turn + ',' + Math.round(c.x * 1e4) + ',' + Math.round(c.y * 1e4)));
    let all = 0, missing = 0;
    ck.matchers.forEach(m => {
      const whole = m.contactsWithin(m.ref.radius, true, false, true);
      whole.forEach(c => {
        all++;
        // A contact within rounding of a catalogued one counts as held.
        let held = false;
        for (let dx = -1; dx <= 1 && !held; dx++) for (let dy = -1; dy <= 1 && !held; dy++) {
          held = have.has(c.flip + ',' + c.turn + ',' + (Math.round(c.x * 1e4) + dx) + ',' + (Math.round(c.y * 1e4) + dy));
        }
        if (!held) missing++;
      });
    });
    console.log('   ' + name(o) + ': ' + ck.catalogue.length + ' contacts in the catalogue; the whole references hold ' + all + ' listings, ' + missing + ' not in it');
    must('contacts', missing === 0, name(o) + ': ' + missing + ' contacts of the whole reference are not in the catalogue');
  });
}

/* ------------------------------------------------------------ check 8 */

async function check8() {
  console.log('8  Speed and limits');
  for (const o of PRESETS) {
    drop(o, 1);
    const t = Date.now(), ck = CK.createKrinkleChecker(Object.assign({}, o, { piece: setup(o).piece }));
    const build = Date.now() - t, s = setup(o);
    const board = TB.createBoard(s.piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }];
    ck.session.sync(tiles);
    let first = 0, worst = 0;
    for (let i = 0; i < 20; i++) {
      const r = ck.session.addOne(Array.from(board.rings().ring));
      if (!r) break;
      board.place(r.tile); tiles.push(r.tile);
      const t1 = process.hrtime.bigint();
      ck.session.sync(tiles); ck.session.verdict();
      const ms = Number(process.hrtime.bigint() - t1) / 1e6;
      if (i === 0) first = ms; else worst = Math.max(worst, ms);
    }
    const plan = ck.built.plan;
    console.log('   ' + name(o).padEnd(18) + ' build ' + String(build).padStart(5) + ' ms, ' + String(ck.built.refs.reduce((a, r) => a + r.count, 0)).padStart(7) +
                ' tiles, dmax ' + String(plan.dmax).padStart(4) + ', first drop ' + first.toFixed(0).padStart(4) + ' ms, later drops up to ' + worst.toFixed(1) + ' ms');
    must('build', build < 4000, name(o) + ': the references take ' + build + ' ms');
    must('drop', first < 400 && worst < 100, name(o) + ': drops take ' + first.toFixed(0) + ' and ' + worst.toFixed(0) + ' ms');
  }
  // A tile that is too fine has no reference and no verdict.
  const fine = { m: 1, k: 1, t: 240, offset: 0 };
  must('limit', !KT.validate(fine), 'the fine tile is valid');
  const ck = CK.createKrinkleChecker(fine);
  must('limit', ck.session === null && !ck.built.plan.available, 'a tile with n = 240 should have no check');
  const replies = [];
  const handle = CK.createHandler();
  handle({ type: 'init', kind: 'krinkle', opts: fine }, r => replies.push(r));
  handle({ type: 'verdict', id: 7, tiles: [0, 0, 0, 0] }, r => replies.push(r));
  must('limit', replies[0] && replies[0].type === 'ready' && replies[0].info.off, 'init for a fine tile did not say off');
  must('limit', replies[1] && replies[1].status === 'off' && replies[1].id === 7, 'a verdict for a fine tile did not say off');
  console.log('   n = 240 (' + name(fine) + '): no check, "off" reply');
  // The shipped plan reaches the dmax floor for every preset.
  const dmaxes = PRESETS.map(o => CK.krinklePlan(setup(o).piece, {}).dmax);
  console.log('   dmax over the 13 presets: ' + Math.min(...dmaxes) + ' to ' + Math.max(...dmaxes) + ' widths');
  must('limit', Math.min(...dmaxes) >= 4, 'a preset has dmax ' + Math.min(...dmaxes));
  if (URL) await browser();
  else console.log('   (no --url: the page check is skipped)');
}

/* The page: a Krinkle tile gets verdicts, amber and green, and the help
   buttons follow. */
async function browser() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    for (const idx of QUICK ? [1] : [1, 10, 12]) {
      const o = PRESETS[idx], s = setup(o), ck = checkerAt(o, 1);
      // A fan patch of 30 tiles from Add one, and then an unknown one.
      const board = TB.createBoard(s.piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }];
      ck.session.sync(tiles);
      while (tiles.length < 30) {
        const r = ck.session.addOne(Array.from(board.rings().ring));
        board.place(r.tile); tiles.push(r.tile); ck.session.sync(tiles);
      }
      const good = TB.linkOf(board);
      let bad = null;
      for (let k = 0; k < 200 && !bad; k++) {
        const d = randomDrop(board, s.piece);
        if (!d) continue;
        ck.session.sync(tiles.concat([d]));
        if (ck.session.summary().status === 'unknown') {
          const bb = replay(s.piece, tiles.concat([d]));
          bad = TB.linkOf(bb);
        }
      }
      must('page', bad, name(o) + ': no unknown patch found for the page');
      const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
      page.on('pageerror', e => fail('page', name(o) + ': ' + e.message));
      await page.goto(URL + '#' + good);
      await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
      let status = await page.textContent('#status');
      must('page', /Fits the fan tiling/.test(status) || /Fits the repeating tiling/.test(status), name(o) + ': status "' + status + '"');
      must('page', !(await page.isDisabled('#add-one')), name(o) + ': Add one is disabled on a fitting patch');
      await page.click('#hint');
      await page.click('#add-one');
      await page.waitForFunction(() => window.TilingPuzzle.board().count === 31, null, { timeout: 5000 });
      await page.waitForFunction(() => window.TilingPuzzle.ready(), null, { timeout: 5000 });
      status = await page.textContent('#status');
      must('page', /Fits the/.test(status), name(o) + ': after Add one the status is "' + status + '"');
      if (bad) {
        await page.goto(URL + '#' + bad);
        await page.reload();
        await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
        status = await page.textContent('#status');
        must('page', /Not part of either tiling/.test(status), name(o) + ': an unknown patch shows "' + status + '"');
        must('page', await page.isDisabled('#add-one') && await page.isDisabled('#hint') && await page.isDisabled('#fill-ring'),
             name(o) + ': help is not disabled on an unknown patch');
        must('page', !(await page.isDisabled('#undo-good')), name(o) + ': Undo to last good is disabled on an unknown patch');
        must('page', (await page.getAttribute('#add-one', 'title')) === 'Needs a patch that fits a known tiling', name(o) + ': the note is missing');
        await page.click('#undo-good');
        await page.waitForFunction(() => window.TilingPuzzle.ready(), null, { timeout: 5000 });
        status = await page.textContent('#status');
        must('page', /Fits the/.test(status), name(o) + ': after Undo to last good the status is "' + status + '"');
      }
      await page.close();
      console.log('   page ' + name(o) + ': green, help, amber, help off, Undo to last good');
    }
    // Switching tiles leaves one Krinkle checker.
    const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => fail('page', e.message));
    await page.goto(URL + '#p=krinkle&mk=3,7&t=2&o=1');
    await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
    await page.click('#krinkle-chip');
    await page.click('#presets button:nth-child(2)');
    await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
    const info = await page.evaluate(() => window.TilingPuzzle.checkerInfo());
    must('page', info && info.tiles > 0, 'no checker info after switching presets');
    await page.close();
  } finally {
    await b.close();
  }
}

/* --------------------------------------------------------------- run */

(async () => {
  const run = { 1: check1, 2: check2, 3: check3, 4: check4, 5: check5, 6: check6, 7: check7, 8: check8 };
  const t0 = Date.now();
  for (const k of Object.keys(run)) {
    if (ONLY && ONLY !== k) continue;
    const t = Date.now();
    await run[k]();
    console.log('   (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  }
  console.log(failures ? failures + ' FAILED' : 'all checks pass', '(' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, seed ' + SEED + ')');
  process.exit(failures ? 1 : 0);
})();
