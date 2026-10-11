/* Checks the Tiling Puzzle's Hat and Spectre checker in
   app/tiling-puzzle/checker.js: items 1 to 4 of "Phase 6 checks" in
   docs/tiling-puzzle.md, a second route to every verdict, and the
   by-products the spec asks for. Plain Node, no packages, except that
   --url drives Chrome through Playwright for the speed check.

   Run from anywhere:
     node tools/tiling-puzzle/check-phase6.js [options]

   Options:
     --quick           fewer samples, for a fast look
     --seed <number>   seed for the random choices (default 1)
     --only <n>        run one check, 1 to 6
     --piece <kind>    hat or spectre (default both)
     --calibrate       check 1 searches for the passing radius, from
                       --from widths (default 120) in steps of --step (20)
     --url <url>       check 4 also times the page in Chrome with the CPU
                       throttled 4x, for example
                       http://localhost:8000/app/tiling-puzzle/

   Checks:
     1  Calibration: 2,000 random legal patches of 2 to 60 tiles, with
        diameter up to D_MAX, cut from a region about 10^4 tile widths away,
        are each found with an anchor inside R_in, at the shipped R_ref.
     2  Add-one soak: 1,000 Add ones from a single tile, with a Fill a ring
        and an undo now and then. Every patch stays legal against a
        reference of twice the radius, every placement is snap-valid, and
        no dead corner appears.
     3  Stable verdicts: 500 patches made by one random snap-valid drop onto
        a legal patch. Every patch judged dead at R_ref is dead at 2 R_ref.
     4  Speed: the reference build, and the verdict for a drop onto a
        60-tile board.
     5  Second route: for 200 patches, a brute-force search of the reference
        that shares no lookup code with the checker finds the same match
        set.
     6  By-products: the distinct edge contacts and first rings of the Hat,
        the mirrored Hat and the Spectre, and a test that the catalogue the
        checker reads near the centre holds every contact in the reference.

   Exit code 1 on any failure. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..') + '/';
const TB = require(ROOT + 'app/tiling-puzzle/board.js');
const CK = require(ROOT + 'app/tiling-puzzle/checker.js');
const TC = require(ROOT + 'app/tiles/engine/tiling-core.js');
const HatTiling = require(ROOT + 'app/tiles/hat/tiling.js');
const SpectreTiling = require(ROOT + 'app/tiles/spectre/tiling.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const QUICK = args.includes('--quick');
const SEED = +opt('seed', 1);
const ONLY = opt('only', null);
const KINDS = opt('piece', null) ? [opt('piece')] : ['hat', 'spectre'];
const CALIBRATE = args.includes('--calibrate');
const URL = opt('url', null);

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
const rng = prng(SEED);
const pick = list => list[Math.floor(rng() * list.length)];

let failures = 0;
function fail(label, msg) { failures++; if (failures < 40) console.log('  FAIL ' + label + ': ' + msg); }
function must(label, ok, msg) { if (!ok) fail(label, msg); return ok; }

/* ------------------------------------------------------------ shared */

const FILES = { hat: HatTiling, spectre: SpectreTiling };
const cache = {};
/* The tiling, the piece, and references by radius, built once each. */
function setup(kind) {
  if (!cache[kind]) {
    const t = Date.now();
    cache[kind] = { ctx: FILES[kind].build(), piece: TB.pieceType(kind), refs: {}, ms: 0 };
    cache[kind].ms = Date.now() - t;
  }
  return cache[kind];
}
function reference(kind, radius, at) {
  const s = setup(kind), key = radius + '|' + (at || [0, 0]).join(',');
  if (!s.refs[key]) {
    const ref = CK.buildReference(kind, { radius: radius, at: at, ctx: s.ctx, piece: s.piece });
    s.refs[key] = { ref: ref, matcher: CK.createMatcher(ref) };
  }
  return s.refs[key];
}
function dropReference(kind, radius) { delete setup(kind).refs[radius + '|0,0']; }

/* Edge neighbours in a reference, cached. */
function adjacency(ref) {
  const memo = new Map();
  return i => {
    let a = memo.get(i);
    if (!a) {
      const P = ref.poly(i);
      a = ref.near(ref.CX[i], ref.CY[i], ref.width).filter(j => j !== i && CK.shareEdge(P, ref.poly(j)));
      memo.set(i, a);
    }
    return a;
  };
}

/* A random edge-connected patch grown from tile `start`: a blob grows at a
   random frontier tile, a snake at the frontier tile farthest from the
   start. No two tile centres lie more than D_MAX widths apart. */
function growPatch(ref, adj, start, size, mode) {
  const order = [start], inP = new Set(order), frontier = new Set(adj(start));
  const limit = CK.D_MAX * ref.width;
  while (order.length < size && frontier.size) {
    const fr = Array.from(frontier);
    let j;
    if (mode === 'snake') {
      fr.sort((a, b) => Math.hypot(ref.CX[b] - ref.CX[start], ref.CY[b] - ref.CY[start]) -
                        Math.hypot(ref.CX[a] - ref.CX[start], ref.CY[a] - ref.CY[start]));
      j = fr[Math.floor(rng() * Math.min(3, fr.length))];
    } else {
      j = pick(fr);
    }
    frontier.delete(j);
    if (order.some(q => Math.hypot(ref.CX[q] - ref.CX[j], ref.CY[q] - ref.CY[j]) > limit)) continue;
    order.push(j); inP.add(j);
    adj(j).forEach(k => { if (!inP.has(k)) frontier.add(k); });
  }
  return order;
}

/* A patch of reference tiles in the board's frame, with the first tile at
   turn 0 on the origin. A mirrored first tile is mirrored back, as a
   visitor building the mirror image would. */
function toBoardFrame(matcher, ref, order) {
  const kit = matcher.kit, inv = matcher.frameOf(ref.tileOf(order[0]), false);
  const tiles = order.map(i => kit.tile(inv, ref.tileOf(i)));
  tiles[0] = { flip: 0, turn: 0, x: 0, y: 0 };
  return tiles;
}

/* Replays tiles on a fresh board. Returns the board, or null when a tile
   is not snap-valid. */
function replay(piece, tiles) {
  const board = TB.createBoard(piece);
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i];
    if (!board.canPlace(t.flip, t.turn, t.x, t.y)) return null;
    board.place(t);
  }
  return board;
}

/* True when some motion of the matcher carries every tile onto the
   reference. Stops at the first. The last tile is tried first, since a
   dropped tile is the one most likely to fail. */
function findAny(matcher, tiles, all) {
  const us = tiles.map(t => matcher.userTile(t));
  if (us.length > 2) us.splice(1, 0, us.pop());
  for (let q = 0; q < all.length; q++) {
    const g = matcher.motion(all[q]);
    let ok = true;
    for (let i = 1; i < us.length && ok; i++) ok = matcher.lookup(g, us[i]) >= 0;
    if (ok) return true;
  }
  return false;
}

/* Legal patches from a distant region of the hierarchy, about 10^4 tile
   widths from the start. */
function distantPatches(kind, count, matcherFor) {
  const s = setup(kind), out = [];
  while (out.length < count) {
    const at = [(1 + rng()) * 1e4 * s.piece.width, (1 + rng()) * 1e4 * s.piece.width];
    const region = CK.buildReference(kind, { radius: CK.D_MAX + 4, at: at, ctx: s.ctx, piece: s.piece });
    const matcher = matcherFor || CK.createMatcher(region, { catalogue: [] });
    const adj = adjacency(region);
    const starts = region.near(region.centre[0], region.centre[1], 3 * region.width);
    for (let k = 0; k < 20 && out.length < count; k++) {
      const size = 2 + Math.floor(rng() * 59), mode = rng() < 0.25 ? 'snake' : 'blob';
      const order = growPatch(region, adj, pick(starts), size, mode);
      out.push({ tiles: toBoardFrame(matcher, region, order), mode: mode });
    }
  }
  return out;
}

/* ------------------------------------------------------------ check 1 */

function check1() {
  console.log('1  Calibration');
  KINDS.forEach(kind => {
    const s = setup(kind), samples = QUICK ? 400 : 2000;
    const patches = distantPatches(kind, samples);
    const sizes = patches.map(p => p.tiles.length);
    let diam = 0;
    patches.forEach(p => {
      const u = p.tiles.map(t => { const V = TB.variant(s.piece, t.flip, t.turn); return [t.x + V.cx, t.y + V.cy]; });
      for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) diam = Math.max(diam, Math.hypot(u[i][0] - u[j][0], u[i][1] - u[j][1]));
    });
    console.log('   ' + kind + ': ' + samples + ' patches of ' + Math.min(...sizes) + ' to ' + Math.max(...sizes) +
                ' tiles, widest ' + (diam / s.piece.width).toFixed(1) + ' widths, ' +
                patches.filter(p => p.mode === 'snake').length + ' grown as snakes');
    const radii = [];
    if (CALIBRATE) {
      for (let r = +opt('from', 120); r <= 400; r += +opt('step', 20)) radii.push(r);
    } else {
      radii.push(CK.R_REF[kind]);
    }
    for (const r of radii) {
      const t = Date.now(), m = reference(kind, r).matcher, all = m.allMotions();
      let missed = 0;
      patches.forEach((p, i) => { if (!findAny(m, p.tiles, all)) missed++; });
      console.log('   ' + kind + ' at R_ref ' + r + ' widths (' + m.ref.count + ' tiles, ' + all.length + ' anchors): ' +
                  (samples - missed) + ' of ' + samples + ' found (' + (Date.now() - t) + ' ms)');
      if (r !== CK.R_REF[kind]) dropReference(kind, r);
      if (CALIBRATE && !missed) { console.log('   ' + kind + ' passes at ' + r + ' widths; ship ' + 2 * r); break; }
      if (!CALIBRATE) must('calibration', missed === 0, kind + ': ' + missed + ' samples not found at the shipped R_ref');
    }
  });
}

/* ------------------------------------------------------------ check 2 */

function check2() {
  console.log('2  Add-one soak');
  KINDS.forEach(kind => {
    const s = setup(kind), R = CK.R_REF[kind];
    const small = reference(kind, R).matcher, big = reference(kind, 2 * R).matcher;
    const target = QUICK ? 200 : 1000;
    let adds = 0, fills = 0, undos = 0, runs = 0, most = 0, deadCorners = 0, notLegal = 0, ringsMax = 0;
    while (adds < target) {
      runs++;
      const board = TB.createBoard(s.piece), a = CK.createSession(small), b = CK.createSession(big);
      const tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }], sizes = [];
      a.sync(tiles); b.sync(tiles);
      while (adds < target && tiles.length < 140) {
        const roll = rng(), info = board.rings();
        if (roll < 0.06 && tiles.length > 3) {
          // Undo a few tiles: the saved match set comes back.
          const keep = tiles.length - 1 - Math.floor(rng() * Math.min(5, tiles.length - 1));
          tiles.length = keep;
          board.undoTo(keep);
          a.sync(tiles);
          must('undo', a.summary().size === sizes[keep - 1], kind + ': undo to ' + keep + ' tiles gave ' + a.summary().size + ' matches, not ' + sizes[keep - 1]);
          sizes.length = keep;
          undos++;
          continue;
        }
        let added;
        if (roll < 0.14) {
          added = a.fillRing(Array.from(info.ring), info.complete);
          fills++;
        } else {
          const r = a.addOne(Array.from(info.ring));
          if (!must('add', r, kind + ': Add one found nothing on a legal patch of ' + tiles.length)) break;
          added = [r.tile];
          adds++;
        }
        // A ring tile may touch the patch only at a point until a
        // neighbour goes in, so the ring goes in as the page places it: the
        // first tile that shares an edge, each time.
        const queue = added.slice();
        while (queue.length) {
          const k = queue.findIndex(t => board.canPlace(t.flip, t.turn, t.x, t.y));
          if (k < 0) break;
          const t = queue.splice(k, 1)[0];
          board.place(t); tiles.push(t);
        }
        const what = roll < 0.14 ? 'Fill a ring left ' + queue.length + ' of ' + added.length + ' tiles' : 'Add one';
        if (!must('snap', !queue.length, kind + ': ' + what + ' that are not snap-valid, at ' + tiles.length + ' tiles')) break;
        if (roll < 0.14) {
          const now = board.rings().complete;
          must('fill', now >= info.complete + 1, kind + ': Fill a ring took the counter from ' + info.complete + ' to ' + now);
        }
        a.sync(tiles); b.sync(tiles);
        const sa = a.summary(), sb = b.summary();
        a.stack().forEach((e, i) => { sizes[i] = e.M ? e.M.length : -1; });
        if (sa.large) break;
        if (!must('legal', sb.status === 'fits', kind + ': a computer-built patch of ' + tiles.length + ' tiles is ' + sb.status + ' at 2 R_ref')) { notLegal++; break; }
        must('legal', sa.status === 'fits', kind + ': a computer-built patch is ' + sa.status + ' at R_ref');
        if (board.deadCorners().length) { deadCorners++; fail('corner', kind + ': a legal patch has a dead corner'); }
        most = Math.max(most, tiles.length);
        ringsMax = Math.max(ringsMax, board.rings().complete);
      }
    }
    console.log('   ' + kind + ': ' + adds + ' Add ones, ' + fills + ' Fill a rings and ' + undos + ' undos in ' + runs +
                ' runs; up to ' + most + ' tiles and ring ' + ringsMax + '; all legal at 2 R_ref');
  });
}

/* ------------------------------------------------------------ check 3 */

function check3() {
  console.log('3  Stable verdicts');
  KINDS.forEach(kind => {
    const s = setup(kind), R = CK.R_REF[kind];
    const small = reference(kind, R).matcher, big = reference(kind, 2 * R).matcher;
    const allS = small.allMotions(), allB = big.allMotions();
    const total = QUICK ? 100 : 500;
    let dead = 0, fits = 0, done = 0, flipped = 0;
    const bases = distantPatches(kind, total * 2, small);
    for (const base of bases) {
      if (done >= total) break;
      const board = replay(s.piece, base.tiles);
      if (!must('replay', board, kind + ': a legal patch would not replay on the board')) continue;
      let snap = null;
      for (let k = 0; k < 40 && !snap; k++) {
        const fe = pick(board.freeEdges()), flip = s.piece.flips && rng() < 0.5 ? 1 : 0, turn = Math.floor(rng() * s.piece.turns);
        const cx = (fe.ax + fe.bx) / 2 + (rng() - 0.5) * s.piece.width * 0.4, cy = (fe.ay + fe.by) / 2 + (rng() - 0.5) * s.piece.width * 0.4;
        snap = board.snap(flip, turn, cx, cy, 0.6 * s.piece.width);
      }
      if (!snap) continue;
      const tiles = base.tiles.concat([{ flip: snap.flip, turn: snap.turn, x: snap.x, y: snap.y }]);
      const atS = findAny(small, tiles, allS), atB = findAny(big, tiles, allB);
      if (atS) fits++; else dead++;
      if (snap.flip) flipped++;
      must('stable', atS || !atB, kind + ': a patch dead at R_ref fits at 2 R_ref');
      must('stable', !atS || atB, kind + ': a patch that fits at R_ref is dead at 2 R_ref');
      done++;
      if (process.env.PROGRESS && done % 20 === 0) console.log('     ' + done + ' (' + dead + ' dead)');
    }
    must('count', done === total, kind + ': only ' + done + ' patches made');
    console.log('   ' + kind + ': ' + done + ' patches, ' + dead + ' dead and ' + fits + ' fitting at R_ref, the same at 2 R_ref');
  });
}

/* ------------------------------------------------------------ check 4 */

async function check4() {
  console.log('4  Speed');
  for (const kind of KINDS) {
    const s = setup(kind), file = FILES[kind];
    let t = Date.now();
    const ctx = file.build();
    const tTiling = Date.now() - t;
    t = Date.now();
    const ref = CK.buildReference(kind, { ctx: ctx, piece: s.piece });
    const matcher = CK.createMatcher(ref);
    const tRef = Date.now() - t;
    must('build', tTiling + tRef < 2000, kind + ': the reference takes ' + (tTiling + tRef) + ' ms');
    // A 60-tile board from Add one, then the verdict for one more drop.
    const session = CK.createSession(matcher), board = TB.createBoard(s.piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }];
    session.sync(tiles);
    while (tiles.length < 60) {
      const r = session.addOne(Array.from(board.rings().ring));
      board.place(r.tile); tiles.push(r.tile); session.sync(tiles);
    }
    const r = session.addOne(Array.from(board.rings().ring));
    t = process.hrtime.bigint();
    board.place(r.tile);
    const tPlace = Number(process.hrtime.bigint() - t) / 1e6;
    tiles.push(r.tile);
    t = process.hrtime.bigint();
    session.sync(tiles);
    const v = session.verdict();
    const tVerdict = Number(process.hrtime.bigint() - t) / 1e6;
    console.log('   ' + kind + ': tiling ' + tTiling + ' ms, reference ' + tRef + ' ms (' + ref.count + ' tiles); drop onto 60 tiles: board ' +
                tPlace.toFixed(1) + ' ms, verdict ' + tVerdict.toFixed(2) + ' ms (' + v.size + ' matches, ' + v.status + ')');
    must('verdict', tPlace + tVerdict < 25, kind + ': a drop takes ' + (tPlace + tVerdict).toFixed(1) + ' ms unthrottled');
  }
  if (URL) await browserSpeed();
  else console.log('   (no --url: the throttled browser timing is skipped)');
}

/* The page in Chrome with the CPU throttled 4x: the reference build, and
   five drops onto a 60-tile board. The board comes from Add one, through a
   share link. Each drop is a real mouse drag from the hand, and the time
   runs from the drop to the first frame that shows its verdict. Chrome's
   throttle slows the page but not its workers, so a second pass removes
   Worker and runs the checker in the throttled page too. */
async function browserSpeed() {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    for (const pass of ['worker', 'page'])
    for (const kind of KINDS) {
      const s = setup(kind), { matcher } = reference(kind, CK.R_REF[kind]);
      const session = CK.createSession(matcher), board = TB.createBoard(s.piece), tiles = [{ flip: 0, turn: 0, x: 0, y: 0 }];
      session.sync(tiles);
      while (tiles.length < 60) {
        const r = session.addOne(Array.from(board.rings().ring));
        board.place(r.tile); tiles.push(r.tile); session.sync(tiles);
      }
      const page = await browser.newPage({ viewport: { width: 1728, height: 990 } });
      page.on('pageerror', e => fail('page', e.message));
      if (pass === 'page') await page.addInitScript(() => { delete window.Worker; });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      await page.goto(URL + '#' + TB.linkOf(board));
      await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
      const ready = Date.now() - t0;
      const refMs = await page.evaluate(() => window.TilingPuzzle.checkerInfo().ms);
      must('browser build', pass === 'worker' || refMs < 4 * 2000, kind + ': the reference takes ' + refMs + ' ms in the throttled page');
      const times = [];
      for (let k = 0; k < 5; k++) {
        const target = await page.evaluate(() => window.TilingPuzzle.dropTarget());
        if (!target) break;
        const hand = await page.locator('#hand-canvas').boundingBox();
        const before = await page.evaluate(() => window.TilingPuzzle.board().count);
        await page.mouse.move(hand.x + hand.width / 2, hand.y + hand.height / 2);
        await page.mouse.down();
        await page.mouse.move((hand.x + target[0]) / 2, (hand.y + target[1]) / 2, { steps: 4 });
        await page.mouse.move(target[0], target[1], { steps: 4 });
        await page.mouse.up();
        await page.waitForFunction(n => window.TilingPuzzle.shown().count === n + 1, before, { timeout: 20000 });
        times.push(await page.evaluate(() => window.TilingPuzzle.shown().ms));
        await page.click('#undo');
        await page.waitForFunction(n => window.TilingPuzzle.shown().count === n, before, { timeout: 20000 });
      }
      const worst = Math.max(...times);
      console.log('   ' + kind + ' in Chrome, CPU 4x slower, checker in the ' + pass + ': page ready in ' + ready + ' ms, reference ' + refMs +
                  ' ms; drops onto 60 tiles: ' + times.map(x => x.toFixed(0)).join(', ') + ' ms to the verdict on screen');
      must('browser drop', times.length === 5 && worst < 100, kind + ' (' + pass + '): a throttled drop took ' + worst.toFixed(0) + ' ms to its verdict');
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------ check 5 */

/* The second route. It reads the reference again, every corner exactly
   from the tiling file's two-part outline, and indexes the tiles by
   sorted x. For each anchor it tries every turn in 30-degree steps, and the
   mirror image where allowed, maps the first tile by its area centroid and
   compares corner sets point by point. A survivor must carry every other
   tile onto a reference tile with the same corner set. Nothing here uses
   the checker's grid, orientation codes or shift templates. */
function bruteReference(kind, ref) {
  const s = setup(kind), K = CK.KINDS[kind], TP = FILES[kind][K.tp], b = K.b, O = ref.origin;
  const H3 = Math.sqrt(3) / 2, zeta = r => [H3 * r[0] - 0.5 * r[1], 0.5 * r[0] + H3 * r[1]];
  const st = s.ctx.info.start, zs = zeta(st.R), cf = [st.P[0] + b * zs[0], st.P[1] + b * zs[1]];
  const reach = ref.R + ref.width, tiles = [];
  TC.walk(s.ctx.root, s.ctx.rootM, [cf[0] - reach, cf[1] - reach, cf[0] + reach, cf[1] + reach], (M, T) => {
    const xs = [], ys = [];
    TP.forEach(v => {
      const q = TC.tpApply(T, v), P = TC.zw.val(TC.zw.sub(q.p, O.p)), z = zeta(TC.zw.val(TC.zw.sub(q.r, O.r)));
      xs.push(P[0] + b * z[0]); ys.push(P[1] + b * z[1]);
    });
    const c = areaCentroid(xs, ys);
    if (Math.hypot(c[0] - ref.centre[0], c[1] - ref.centre[1]) > ref.R * Math.sqrt(CK.SLACK)) return;
    tiles.push({ xs: xs, ys: ys, cx: c[0], cy: c[1] });
  });
  const byX = tiles.slice().sort((p, q) => p.cx - q.cx);
  const keys = Float64Array.from(byX, t => t.cx);
  function findTile(xs, ys) {
    const c = areaCentroid(xs, ys);
    let lo = 0, hi = keys.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < c[0] - 1e-6) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < keys.length && keys[i] <= c[0] + 1e-6; i++) {
      if (Math.abs(byX[i].cy - c[1]) < 1e-6 && sameSet(xs, ys, byX[i].xs, byX[i].ys)) return byX[i];
    }
    return null;
  }
  return { tiles: tiles, findTile: findTile, anchors: tiles.filter(t => Math.hypot(t.cx - ref.centre[0], t.cy - ref.centre[1]) <= ref.Rin * CK.SLACK) };
}
function areaCentroid(xs, ys) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length, w = xs[i] * ys[j] - xs[j] * ys[i];
    A += w; cx += (xs[i] + xs[j]) * w; cy += (ys[i] + ys[j]) * w;
  }
  return [cx / (3 * A), cy / (3 * A)];
}
function sameSet(axs, ays, bxs, bys) {
  if (axs.length !== bxs.length) return false;
  for (let i = 0; i < axs.length; i++) {
    let hit = false;
    for (let j = 0; j < bxs.length && !hit; j++) hit = Math.abs(axs[i] - bxs[j]) < 1e-6 && Math.abs(ays[i] - bys[j]) < 1e-6;
    if (!hit) return false;
  }
  return true;
}
/* A match as text: mirror, turn in 30-degree steps, and the anchor's
   centroid to 1e-4, with -0 written as 0. */
function matchKey(f, k, x, y) {
  return f + '|' + k + '|' + (Math.round(x * 1e4) + 0) + '|' + (Math.round(y * 1e4) + 0);
}
function bruteMatches(kind, brute, piece, tiles) {
  const reflect = CK.KINDS[kind].reflect, out = new Set();
  const polys = tiles.map(t => { const V = TB.variant(piece, t.flip, t.turn); return { xs: Array.from(V.xs, x => x + t.x), ys: Array.from(V.ys, y => y + t.y) }; });
  const c0 = areaCentroid(polys[0].xs, polys[0].ys);
  for (let f = 0; f <= (reflect ? 1 : 0); f++) {
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, cs = Math.cos(a), sn = Math.sin(a);
      const L = (x, y) => { const u = f ? -x : x; return [cs * u - sn * y, sn * u + cs * y]; };
      const lc = L(c0[0], c0[1]);
      const mapped = polys.map(p => {
        const xs = [], ys = [];
        for (let i = 0; i < p.xs.length; i++) { const q = L(p.xs[i], p.ys[i]); xs.push(q[0]); ys.push(q[1]); }
        return { xs: xs, ys: ys };
      });
      brute.anchors.forEach(A => {
        const tx = A.cx - lc[0], ty = A.cy - lc[1];
        // Quick reject on the first corner, then the whole set.
        let hit = false;
        for (let j = 0; j < A.xs.length && !hit; j++) hit = Math.abs(mapped[0].xs[0] + tx - A.xs[j]) < 1e-6 && Math.abs(mapped[0].ys[0] + ty - A.ys[j]) < 1e-6;
        if (!hit) return;
        const shift = p => ({ xs: p.xs.map(x => x + tx), ys: p.ys.map(y => y + ty) });
        const m0 = shift(mapped[0]);
        if (!sameSet(m0.xs, m0.ys, A.xs, A.ys)) return;
        for (let i = 1; i < mapped.length; i++) {
          const mi = shift(mapped[i]);
          if (!brute.findTile(mi.xs, mi.ys)) return;
        }
        out.add(matchKey(f, k, A.cx, A.cy));
      });
    }
  }
  return out;
}

function check5() {
  console.log('5  Second route');
  KINDS.forEach(kind => {
    const s = setup(kind), radius = 60;
    const { ref, matcher } = reference(kind, radius);
    let t = Date.now();
    const brute = bruteReference(kind, ref);
    must('tiles', brute.tiles.length === ref.count, kind + ': the second route reads ' + brute.tiles.length + ' tiles, the checker ' + ref.count);
    console.log('   ' + kind + ': reference of ' + radius + ' widths read twice, ' + ref.count + ' tiles (' + (Date.now() - t) + ' ms)');
    const total = QUICK ? 40 : 200, patches = [];
    // Legal patches cut from the reference itself, the same with one random
    // drop, and random builds.
    const adj = adjacency(ref), near = ref.near(ref.centre[0], ref.centre[1], 10 * ref.width);
    while (patches.length < total) {
      const r = patches.length % 3;
      if (r < 2) {
        const order = growPatch(ref, adj, pick(near), 2 + Math.floor(rng() * 25), rng() < 0.3 ? 'snake' : 'blob');
        const tiles = toBoardFrame(matcher, ref, order);
        if (r === 1) {
          const board = replay(s.piece, tiles);
          let snap = null;
          for (let k = 0; k < 40 && !snap; k++) {
            const fe = pick(board.freeEdges()), flip = s.piece.flips && rng() < 0.5 ? 1 : 0;
            snap = board.snap(flip, Math.floor(rng() * s.piece.turns), (fe.ax + fe.bx) / 2, (fe.ay + fe.by) / 2, 0.6 * s.piece.width);
          }
          if (!snap) continue;
          tiles.push({ flip: snap.flip, turn: snap.turn, x: snap.x, y: snap.y });
        }
        patches.push({ kind: r ? 'legal + drop' : 'legal', tiles: tiles });
      } else {
        const board = TB.createBoard(s.piece), size = 2 + Math.floor(rng() * 10);
        for (let g = 0; board.count < size && g < 200; g++) {
          const fe = pick(board.freeEdges()), flip = s.piece.flips && rng() < 0.5 ? 1 : 0;
          const sn = board.snap(flip, Math.floor(rng() * s.piece.turns), (fe.ax + fe.bx) / 2, (fe.ay + fe.by) / 2, 0.6 * s.piece.width);
          if (sn) board.place(sn);
        }
        patches.push({ kind: 'random', tiles: board.tiles.map(x => ({ flip: x.flip, turn: x.turn, x: x.x, y: x.y })) });
      }
    }
    t = Date.now();
    let same = 0, fitsN = 0, matchesN = 0;
    const perStep = 12 / s.piece.turns;
    patches.forEach((p, n) => {
      const session = CK.createSession(matcher);
      session.sync(p.tiles);
      const viaHash = new Set();
      session.matches().forEach(id => {
        const g = matcher.motion(id), i = matcher.anchorOf(id);
        viaHash.add(matchKey(g.f, (g.k * perStep) % 12, ref.CX[i], ref.CY[i]));
      });
      const viaBrute = bruteMatches(kind, brute, s.piece, p.tiles);
      let agree = viaHash.size === viaBrute.size;
      if (agree) viaHash.forEach(k => { if (!viaBrute.has(k)) agree = false; });
      if (agree) same++;
      if (viaHash.size) fitsN++;
      matchesN += viaHash.size;
      if (!agree) {
        const only = Array.from(viaHash).filter(k => !viaBrute.has(k)).concat(Array.from(viaBrute).filter(k => !viaHash.has(k)).map(k => 'brute ' + k));
        fail('route', kind + ' patch ' + n + ' (' + p.kind + ', ' + p.tiles.length + ' tiles): the checker finds ' +
             viaHash.size + ' matches, the brute force ' + viaBrute.size + '; differing: ' + only.slice(0, 4).join(', '));
      }
    });
    console.log('   ' + kind + ': ' + same + ' of ' + total + ' match sets agree exactly; ' + fitsN + ' patches fit, ' +
                (total - fitsN) + ' are dead; ' + matchesN + ' matches in all (' + (Date.now() - t) + ' ms)');
  });
}

/* ------------------------------------------------------------ check 6 */

function check6() {
  console.log('6  By-products');
  KINDS.forEach(kind => {
    const s = setup(kind), R = CK.R_REF[kind];
    const { ref, matcher } = reference(kind, R);
    let t = Date.now();
    // The catalogue the checker reads near the centre against the contacts
    // of the whole reference.
    const full = matcher.contactsWithin(R, !ref.reflect, false);
    const missing = full.filter(c => !matcher.catalogue.some(d => matcher.sameTile(c, d)));
    must('catalogue', missing.length === 0 && full.length === matcher.catalogue.length,
         kind + ': the whole reference has ' + full.length + ' contacts, the catalogue ' + matcher.catalogue.length);
    console.log('   ' + kind + ': ' + matcher.catalogue.length + ' edge contacts within ' + CK.CATALOGUE_R +
                ' widths, the same ' + full.length + ' over all ' + R + ' widths (' + (Date.now() - t) + ' ms)');
    // Contacts and first rings by the class of the central tile, turned
    // but never mirrored into its frame.
    t = Date.now();
    const split = matcher.contactsWithin(R, true, true);
    const names = s.piece.flips ? ['Hat', 'mirrored Hat'] : ['Spectre'];
    names.forEach((name, cls) => console.log('   ' + name + ': ' + split[cls].length + ' distinct edge contacts'));
    [QUICK ? 30 : 60, QUICK ? 50 : 100].forEach(rw => {
      const rings = names.map(() => new Map()), counts = names.map(() => 0);
      for (let i = 0; i < ref.count; i++) {
        if (ref.distance(i) > rw * ref.width) continue;
        const A = ref.tileOf(i), P = ref.poly(i), inv = matcher.frameOf(A, true);
        const ring = ref.near(ref.CX[i], ref.CY[i], ref.width * 1.01).filter(j => j !== i && TB.touch(P, ref.poly(j)))
          .map(j => { const c = matcher.kit.tile(inv, ref.tileOf(j)); return c.flip + ',' + c.turn + ',' + (c.x + 0).toFixed(4) + ',' + (c.y + 0).toFixed(4); })
          .sort().join(' ');
        const cls = A.flip;
        counts[cls]++;
        rings[cls].set(ring, (rings[cls].get(ring) || 0) + 1);
      }
      names.forEach((name, cls) => console.log('   ' + name + ': ' + rings[cls].size + ' distinct first rings among ' +
                                                counts[cls] + ' tiles within ' + rw + ' widths'));
    });
    console.log('   (' + (Date.now() - t) + ' ms)');
    console.log('   ' + kind + ': shift templates ' + JSON.stringify(matcher.templates) + ', R_ref ' + R + ' widths, ' + ref.count + ' tiles');
  });
}

/* --------------------------------------------------------------- run */

(async () => {
  const checks = { 1: check1, 2: check2, 3: check3, 4: check4, 5: check5, 6: check6 };
  const started = Date.now();
  for (const k of Object.keys(checks)) {
    if (ONLY && ONLY !== k) continue;
    const t = Date.now(), before = failures;
    await checks[k]();
    console.log('   ' + (failures === before ? 'PASS' : 'FAIL') + ' (' + (Date.now() - t) + ' ms)');
  }
  console.log(failures ? failures + ' failure' + (failures > 1 ? 's' : '') : 'All checks passed', '(' + (Date.now() - started) + ' ms)');
  process.exit(failures ? 1 : 0);
})();
