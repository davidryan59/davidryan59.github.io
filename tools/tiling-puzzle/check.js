/* Checks the Tiling Puzzle board in app/tiling-puzzle/board.js: items 1 to 4
   of "Phase 5 checks" in docs/tiling-puzzle.md, plus one more on the corner
   check. Plain Node, no packages.

   Run from anywhere:
     node tools/tiling-puzzle/check.js [options]

   Options:
     --quick          fewer drops and builds, for a fast look
     --seed <number>  seed for the random choices (default 1)
     --only <n>       run one check, 1 to 5

   Checks:
     1  Snapping: random drops near free edges give placements whose shared
        edge ends coincide to within 1e-9, and none overlaps. The overlap
        test is repeated by sampling points, which shares no code with it.
     2  Overlap refusal: copies of placed tiles, nudged copies, and every
        snap that sampling finds overlapping are refused by the board and
        never returned by snap.
     3  Share link: random builds survive a round trip through the link
        unchanged, and a bad token stops the decode where it falls.
     4  Ring counter: a patch of 1, 2 and 3 rings cut from the Hat explorer's
        tiling, and from the Spectre's, replays to the same counter. So do
        patches of the Krinkle fan and repeating tilings for four tiles. A
        patch cut from a legal tiling has no dead corner.
     5  Corner check: in random builds every dead corner has no placement on
        either free edge, found by trying every turn without the board's own
        turn rule.

   Exit code 1 on any failure. */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..') + '/';
const TB = require(ROOT + 'app/tiling-puzzle/board.js');
const HatTiling = require(ROOT + 'app/tiles/hat/tiling.js');
const SpectreTiling = require(ROOT + 'app/tiles/spectre/tiling.js');
const KrinkleTiling = require(ROOT + 'app/tiles/krinkle/tiling.js');
const TC = require(ROOT + 'app/tiles/engine/tiling-core.js');

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i < 0 ? dflt : args[i + 1]; };
const QUICK = args.includes('--quick');
const SEED = +opt('seed', 1);
const ONLY = opt('only', null);

function prng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}
const rng = prng(SEED);
const pick = list => list[Math.floor(rng() * list.length)];

let failures = 0;
function fail(label, msg) { failures++; console.log('  FAIL ' + label + ': ' + msg); }
function must(label, ok, msg) { if (!ok) fail(label, msg); return ok; }

/* The piece types the random checks use: both aperiodic tiles and five
   Krinkle tiles, odd and even n, with and without offset. */
const PIECES = [
  ['hat'], ['spectre'],
  ['krinkle', { m: 3, k: 7, t: 2, offset: 1 }],
  ['krinkle', { m: 1, k: 4, t: 5, offset: 0 }],
  ['krinkle', { m: 5, k: 16, t: 2, offset: 1 }],
  ['krinkle', { m: 2, k: 5, t: 2, offset: 0 }],
  ['krinkle', { m: 1, k: 1, t: 16, offset: 1 }]
].map(a => TB.pieceType(a[0], a[1]));

/* ------------------------------------------------- independent geometry */

function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.n - 1; i < poly.n; j = i++) {
    if ((poly.ys[i] > y) !== (poly.ys[j] > y) &&
        x < poly.xs[i] + (y - poly.ys[i]) * (poly.xs[j] - poly.xs[i]) / (poly.ys[j] - poly.ys[i])) inside = !inside;
  }
  return inside;
}
function boundaryDist(poly, x, y) {
  let best = Infinity;
  for (let i = 0; i < poly.n; i++) {
    const j = (i + 1) % poly.n, dx = poly.xs[j] - poly.xs[i], dy = poly.ys[j] - poly.ys[i];
    const t = Math.max(0, Math.min(1, ((x - poly.xs[i]) * dx + (y - poly.ys[i]) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(poly.xs[i] + t * dx - x, poly.ys[i] + t * dy - y));
  }
  return best;
}
/* Points well inside a polygon, by rejection sampling. */
function interiorPoints(poly, count) {
  const out = [];
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    const x = poly.x0 + rng() * (poly.x1 - poly.x0), y = poly.y0 + rng() * (poly.y1 - poly.y0);
    if (pip(poly, x, y) && boundaryDist(poly, x, y) > 1e-3) out.push([x, y]);
  }
  return out;
}
/* True when a sampled point inside `poly` is also inside another outline. */
function sampledOverlap(poly, others, samples) {
  const pts = interiorPoints(poly, samples);
  return others.some(q => {
    if (q.x1 < poly.x0 || q.x0 > poly.x1 || q.y1 < poly.y0 || q.y0 > poly.y1) return false;
    return pts.some(p => pip(q, p[0], p[1]) && boundaryDist(q, p[0], p[1]) > 1e-6);
  });
}
function polyOf(board, flip, turn, x, y) {
  return TB.shifted(TB.variant(board.piece, flip, turn), x, y);
}

/* A random build: drops near random free edges, snapped by the board. */
function randomBuild(piece, size, onDrop) {
  const board = TB.createBoard(piece);
  for (let attempts = 0; board.count < size && attempts < size * 40; attempts++) {
    const edges = board.freeEdges(), fe = pick(edges);
    const flip = piece.flips && rng() < 0.5 ? 1 : 0, turn = Math.floor(rng() * piece.turns);
    const V = TB.variant(piece, flip, turn);
    const cx = (fe.ax + fe.bx) / 2 + (rng() - 0.5) * piece.width * 0.4;
    const cy = (fe.ay + fe.by) / 2 + (rng() - 0.5) * piece.width * 0.4;
    const s = board.snap(flip, turn, cx, cy, 0.6 * piece.width);
    if (!s) continue;
    const before = board.tiles.map(t => t.poly);
    const i = board.place({ turn: s.turn, flip: s.flip, x: s.x, y: s.y }, { a: s.a, ea: s.ea, ej: s.ej });
    if (onDrop) onDrop(board, i, s, before);
  }
  return board;
}

/* ------------------------------------------------------------ check 1 */

function check1() {
  console.log('1  Snapping');
  const total = QUICK ? 200 : 1000;
  let drops = 0, worst = 0, refused = 0;
  const perPiece = Math.ceil(total / PIECES.length);
  PIECES.forEach(piece => {
    let done = 0;
    while (done < perPiece) {
      const board = TB.createBoard(piece);
      for (let guard = 0; board.count < 40 && done < perPiece && guard < 400; guard++) {
        const fe = pick(board.freeEdges());
        const flip = piece.flips && rng() < 0.5 ? 1 : 0, turn = Math.floor(rng() * piece.turns);
        const cx = (fe.ax + fe.bx) / 2 + (rng() - 0.5) * piece.width * 0.6;
        const cy = (fe.ay + fe.by) / 2 + (rng() - 0.5) * piece.width * 0.6;
        const s = board.snap(flip, turn, cx, cy, 0.6 * piece.width);
        if (!s) { refused++; continue; }
        const others = board.tiles.map(t => t.poly);
        const A = others[s.a], P = polyOf(board, s.flip, s.turn, s.x, s.y);
        // The shared edge: a's edge ea runs a to b, the new edge ej runs b to a.
        const e2 = (s.ea + 1) % piece.n, j2 = (s.ej + 1) % piece.n;
        const gap = Math.max(
          Math.hypot(P.xs[s.ej] - A.xs[e2], P.ys[s.ej] - A.ys[e2]),
          Math.hypot(P.xs[j2] - A.xs[s.ea], P.ys[j2] - A.ys[s.ea]));
        worst = Math.max(worst, gap);
        must('drop ' + drops, gap < 1e-9, piece.key + ': shared edge ends are ' + gap + ' apart');
        must('drop ' + drops, !others.some(q => TB.overlap(P, q)), piece.key + ': the snap overlaps a tile');
        must('drop ' + drops, !sampledOverlap(P, others, 150), piece.key + ': sampling finds the snap overlapping');
        board.place({ turn: s.turn, flip: s.flip, x: s.x, y: s.y }, { a: s.a, ea: s.ea, ej: s.ej });
        done++; drops++;
      }
    }
  });
  console.log('   ' + drops + ' drops on ' + PIECES.length + ' pieces, worst edge gap ' + worst.toExponential(1) +
              ', ' + refused + ' drops with no snap in reach');
}

/* ------------------------------------------------------------ check 2 */

function check2() {
  console.log('2  Overlap refusal');
  let tried = 0, caught = 0, invalid = 0;
  PIECES.forEach(piece => {
    const board = randomBuild(piece, QUICK ? 15 : 30);
    const polys = board.tiles.map(t => t.poly);
    // A copy of every placed tile, and of the piece at the same corner.
    board.tiles.forEach((t, i) => {
      tried++;
      if (!must('copy', !board.canPlace(t.flip, t.turn, t.x, t.y), piece.key + ': a copy of tile ' + i + ' was accepted')) return;
      caught++;
    });
    // The same tile nudged, and turned in place by one step.
    board.tiles.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const ang = rng() * 2 * Math.PI, d = (0.15 + rng() * 0.6) * piece.radius;
        const x = t.x + d * Math.cos(ang), y = t.y + d * Math.sin(ang);
        const P = polyOf(board, t.flip, t.turn, x, y);
        tried++;
        if (!sampledOverlap(P, polys, 150)) continue;
        if (must('nudge', !board.canPlace(t.flip, t.turn, x, y), piece.key + ': a nudged copy of tile ' + i + ' was accepted')) caught++;
      }
      const turn = (t.turn + 1) % piece.turns, V = TB.variant(piece, t.flip, t.turn), W = TB.variant(piece, t.flip, turn);
      const x = t.x + V.cx - W.cx, y = t.y + V.cy - W.cy;
      tried++;
      if (turn !== t.turn && sampledOverlap(polyOf(board, t.flip, turn, x, y), polys, 150)) {
        if (must('turned', !board.canPlace(t.flip, turn, x, y), piece.key + ': a turned copy of tile ' + i + ' was accepted')) caught++;
      }
    });
    // Every geometric snap at a few turns: the invalid ones overlap, and
    // snap never returns one.
    for (let k = 0; k < 4; k++) {
      const flip = piece.flips ? k & 1 : 0, turn = Math.floor(rng() * piece.turns);
      board.candidates(flip, turn).forEach(c => {
        const P = polyOf(board, c.flip, c.turn, c.x, c.y);
        tried++;
        if (c.valid) {
          must('valid', !sampledOverlap(P, polys, 150), piece.key + ': a snap marked valid overlaps by sampling');
        } else {
          invalid++;
          if (must('invalid', !board.canPlace(c.flip, c.turn, c.x, c.y), piece.key + ': an overlapping snap passes canPlace')) caught++;
        }
      });
      for (let q = 0; q < 12; q++) {
        const fe = pick(board.freeEdges());
        const s = board.snap(flip, turn, (fe.ax + fe.bx) / 2, (fe.ay + fe.by) / 2, piece.width);
        if (s) must('snap', board.canPlace(s.flip, s.turn, s.x, s.y), piece.key + ': snap returned a placement canPlace refuses');
      }
    }
  });
  // A link that puts a tile over another is refused where it falls.
  const hat = PIECES[0];
  const base = randomBuild(hat, 6), text = base.encode(), first = text.split('-')[0];
  const dup = TB.decode(hat, text + '-' + first);
  must('link', dup.error !== null && dup.applied === 5, 'a repeated token was not refused (' + dup.error + ')');
  console.log('   ' + tried + ' overlapping or checked candidates, ' + caught + ' refused, ' + invalid + ' invalid snaps seen');
}

/* ------------------------------------------------------------ check 3 */

function sameBoard(a, b) {
  if (a.count !== b.count) return 'count ' + a.count + ' against ' + b.count;
  for (let i = 0; i < a.count; i++) {
    const p = a.tiles[i], q = b.tiles[i];
    if (p.turn !== q.turn || p.flip !== q.flip) return 'tile ' + i + ' turn or flip differs';
    if (Math.abs(p.x - q.x) > 1e-9 || Math.abs(p.y - q.y) > 1e-9) return 'tile ' + i + ' is ' + Math.hypot(p.x - q.x, p.y - q.y) + ' away';
  }
  return null;
}

function check3() {
  console.log('3  Share link');
  const builds = QUICK ? 40 : 100;
  let longest = 0;
  for (let b = 0; b < builds; b++) {
    const piece = PIECES[b % PIECES.length], size = 2 + Math.floor(rng() * 59);
    const board = randomBuild(piece, size);
    const link = TB.linkOf(board);
    const q = TB.parseQuery('#' + link), back = TB.pieceOf(q);
    must('piece', back && back.key === piece.key, 'the link names ' + (back && back.key) + ', not ' + piece.key);
    if (!back) continue;
    const res = TB.decode(back, q.b || '');
    must('round trip ' + b, res.error === null, piece.key + ': ' + res.error);
    const diff = sameBoard(board, res.board);
    must('round trip ' + b, diff === null, piece.key + ': ' + diff);
    must('again ' + b, TB.linkOf(res.board) === link, piece.key + ': a second encode gave different text');
    longest = Math.max(longest, link.length);
  }
  // A token that does not snap stops the decode and says which.
  const piece = PIECES[0], board = randomBuild(piece, 12), tokens = board.encode().split('-');
  const bad = tokens.slice();
  bad[6] = '99.0.0';
  const res = TB.decode(piece, bad.join('-'));
  must('stop', res.error && res.applied === 6 && /Tile 8 of 12/.test(res.error), 'stopped with: ' + res.error);
  must('stop', res.board.count === 7, 'the board holds ' + res.board.count + ' tiles after a stop at token 7');
  // The Spectre has no mirror flag, and a mirror token is refused for it.
  const sp = TB.decode(PIECES[1], '0.0.0.f');
  must('flag', sp.error !== null, 'a mirrored Spectre token was accepted');
  // A Krinkle link that the explorer would reject throws a sentence.
  let threw = null;
  try { TB.pieceOf(TB.parseQuery('p=krinkle&mk=4,8&t=2&o=0')); } catch (e) { threw = e.message; }
  must('invalid', threw !== null, 'm=4, k=8 (common factor) was accepted');
  console.log('   ' + builds + ' builds round-tripped, longest link ' + longest + ' characters');
}

/* ------------------------------------------------------------ check 4 */

/* Every tile of a tiling file within `reach` of its start tile, as outlines
   in the explorer's frame, with that tile's first corner at the origin.
   Corners come from the exact two-part positions and are subtracted before
   they become floats, since the start tile lies 10^8 tile widths from the
   file's own origin. `bScale` is the length of the b edges. */
function explorerPatch(ctx, tpOutline, startFloat, reach, bScale) {
  const zeta = r => [Math.sqrt(3) / 2 * r[0] - 0.5 * r[1], 0.5 * r[0] + Math.sqrt(3) / 2 * r[1]];
  const found = [];
  TC.walk(ctx.root, ctx.rootM, [startFloat[0] - reach, startFloat[1] - reach, startFloat[0] + reach, startFloat[1] + reach],
    (M, T) => {
      const pts = ctx.corners(M, T);
      let x = 0, y = 0;
      pts.forEach(c => { const z = zeta(c.R); x += c.P[0] + bScale * z[0]; y += c.P[1] + bScale * z[1]; });
      found.push({ T: T, d: Math.hypot(x / pts.length - startFloat[0], y / pts.length - startFloat[1]) });
    });
  const centre = found.reduce((a, b) => (b.d < a.d ? b : a));
  const o = TC.tpApply(centre.T, tpOutline[0]);
  const polys = found.map(f => {
    const pts = tpOutline.map(v => {
      const q = TC.tpApply(f.T, v);
      const P = TC.zw.val(TC.zw.sub(q.p, o.p)), z = zeta(TC.zw.val(TC.zw.sub(q.r, o.r)));
      return [P[0] + bScale * z[0], P[1] + bScale * z[1]];
    });
    const xs = Float64Array.from(pts, p => p[0]), ys = Float64Array.from(pts, p => p[1]);
    return { xs: xs, ys: ys, n: xs.length, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
  return { polys: polys, first: found.indexOf(centre) };
}

/* The (flip, turn, x, y) that puts a piece's outline on a polygon, by
   matching corner sets, or null. */
function placementOf(piece, poly) {
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.n; i++) { cx += poly.xs[i]; cy += poly.ys[i]; }
  cx /= poly.n; cy /= poly.n;
  const flips = piece.flips ? [0, 1] : [0];
  for (const flip of flips) {
    for (let turn = 0; turn < piece.turns; turn++) {
      const V = TB.variant(piece, flip, turn);
      let vx = 0, vy = 0;
      for (let i = 0; i < V.n; i++) { vx += V.xs[i]; vy += V.ys[i]; }
      const x = cx - vx / V.n, y = cy - vy / V.n;
      const P = TB.shifted(V, x, y);
      let ok = true;
      for (let i = 0; i < P.n && ok; i++) {
        let hit = false;
        for (let j = 0; j < poly.n && !hit; j++) hit = Math.hypot(P.xs[i] - poly.xs[j], P.ys[i] - poly.ys[j]) < 1e-6;
        ok = hit;
      }
      if (ok) return { flip: flip, turn: turn, x: x, y: y };
    }
  }
  return null;
}

function transformPoly(poly, g) {
  const xs = new Float64Array(poly.n), ys = new Float64Array(poly.n);
  for (let i = 0; i < poly.n; i++) { const p = g(poly.xs[i], poly.ys[i]); xs[i] = p[0]; ys[i] = p[1]; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); y0 = Math.min(y0, ys[i]); y1 = Math.max(y1, ys[i]);
  }
  return { xs: xs, ys: ys, n: poly.n, x0: x0, y0: y0, x1: x1, y1: y1 };
}

function ringCheck(name, piece, found) {
  // The tile nearest the start is the first tile; move the patch so that
  // it sits at turn 0 on the origin.
  const patch = found.polys, first = found.first;
  const here = placementOf(piece, patch[first]);
  if (!must(name, here, 'the start tile matches no turn of the piece')) return;
  const a = here.turn * piece.step, ca = Math.cos(a), sa = Math.sin(a);
  // g undoes the first tile's turn, mirror and place.
  const g = (x, y) => {
    x -= here.x; y -= here.y;
    const u = ca * x + sa * y, v = -sa * x + ca * y;
    return here.flip ? [-u, v] : [u, v];
  };
  const moved = patch.map(p => transformPoly(p, g));
  // The tiles by touching distance from the first tile.
  const dist = new Array(moved.length).fill(-1);
  dist[first] = 0;
  const queue = [first];
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (dist[i] >= 3) continue;
    for (let j = 0; j < moved.length; j++) {
      if (dist[j] < 0 && TB.touch(moved[i], moved[j])) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  [1, 2, 3].forEach(rings => {
    const want = moved.map((p, i) => i).filter(i => dist[i] >= 0 && dist[i] <= rings);
    const board = TB.createBoard(piece);
    const left = new Set(want.filter(i => i !== first));
    let progress = true;
    while (left.size && progress) {
      progress = false;
      left.forEach(i => {
        const pl = placementOf(piece, moved[i]);
        if (pl && board.canPlace(pl.flip, pl.turn, pl.x, pl.y)) {
          board.place(pl);
          left.delete(i);
          progress = true;
        }
      });
    }
    must(name, left.size === 0, rings + ' rings: ' + left.size + ' of ' + want.length + ' tiles would not replay');
    const got = board.rings().complete;
    must(name, got === rings, rings + ' rings of ' + board.count + ' tiles: counter is ' + got);
    must(name, board.deadCorners().length === 0, rings + ' rings: ' + board.deadCorners().length + ' dead corners in a legal patch');
    console.log('   ' + name + ': ' + rings + ' rings, ' + board.count + ' tiles, counter ' + got);
  });
}

function check4() {
  console.log('4  Ring counter');
  const R3 = Math.sqrt(3), H3 = Math.sqrt(3) / 2;
  const zeta = r => [H3 * r[0] - 0.5 * r[1], 0.5 * r[0] + H3 * r[1]];
  const hat = HatTiling.build();
  let st = hat.info.start, z = zeta(st.R);
  let sf = [st.P[0] + R3 * z[0], st.P[1] + R3 * z[1]];
  ringCheck('Hat', PIECES[0], explorerPatch(hat, HatTiling.HAT_TP, sf, 30, R3));

  const spectre = SpectreTiling.build();
  st = spectre.info.start; z = zeta(st.R);
  sf = [st.P[0] + z[0], st.P[1] + z[1]];
  ringCheck('Spectre', PIECES[1], explorerPatch(spectre, SpectreTiling.SPECTRE_TP, sf, 24, 1));

  // Krinkle patches of the fan and of the repeating tiling, away from the
  // centre of the fan, where the tiles are regular.
  [[3, 7, 2, 1], [1, 4, 5, 0], [5, 16, 2, 1], [2, 5, 2, 0]].forEach(a => {
    ['fan', 'repeat'].forEach(arrangement => {
      const o = { m: a[0], k: a[1], t: a[2], offset: a[3] };
      const ctx = KrinkleTiling.build(Object.assign({ arrangement: arrangement }, o));
      const piece = TB.pieceType('krinkle', o), at = [ctx.info.Qlen * 5, ctx.info.Qlen * 3];
      const tiles = [];
      ctx.enumerate(ctx.info.Qlen * 20, t => {
        if (Math.hypot(t.x - at[0], t.y - at[1]) < ctx.info.circumradius * 8) tiles.push(t);
      });
      let first = 0;
      tiles.forEach((t, i) => {
        if (Math.hypot(t.x - at[0], t.y - at[1]) < Math.hypot(tiles[first].x - at[0], tiles[first].y - at[1])) first = i;
      });
      const polys = tiles.map(t => {
        const pts = ctx.corners(t), xs = Float64Array.from(pts, p => p[0]), ys = Float64Array.from(pts, p => p[1]);
        return { xs: xs, ys: ys, n: xs.length, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      });
      ringCheck('Krinkle ' + o.m + ',' + o.k + ',' + o.t + ',' + o.offset + ' ' + arrangement, piece, { polys: polys, first: first });
    });
  });
}

/* ------------------------------------------------------------ check 5 */

function check5() {
  console.log('5  Corner check');
  let corners = 0, dead = 0, builds = 0;
  PIECES.forEach(piece => {
    for (let b = 0; b < (QUICK ? 4 : 10); b++) {
      builds++;
      const board = randomBuild(piece, 8 + Math.floor(rng() * 30));
      const polys = board.tiles.map(t => t.poly);
      board.deadCorners().forEach(rec => {
        corners++; dead++;
        const now = board.cornerAt(rec.x, rec.y);
        must('dead', now.gaps.length > 0, piece.key + ': a dead corner is closed');
        // Try every flip, turn and own edge against each free edge there.
        now.edges.forEach(e => {
          const fe = board.edgeRef(e.tile, e.edge);
          const flips = piece.flips ? [0, 1] : [0];
          flips.forEach(flip => {
            for (let turn = 0; turn < piece.turns; turn++) {
              const V = TB.variant(piece, flip, turn);
              for (let j = 0; j < piece.n; j++) {
                const x = fe.bx - V.xs[j], y = fe.by - V.ys[j], j2 = (j + 1) % piece.n;
                if (Math.hypot(V.xs[j2] + x - fe.ax, V.ys[j2] + y - fe.ay) > 1e-7) continue;
                const P = TB.shifted(V, x, y);
                const hit = polys.some(q => TB.overlap(P, q));
                must('dead', hit, piece.key + ': a dead corner at (' + rec.x.toFixed(2) + ', ' + rec.y.toFixed(2) +
                     ') has a placement that fits, flip ' + flip + ' turn ' + turn);
              }
            }
          });
        });
      });
    }
  });
  // A corner left open with a free edge that fits is not dead.
  const hat = TB.createBoard(PIECES[0]);
  must('single', hat.deadCorners().length === 0, 'one tile has a dead corner');
  console.log('   ' + builds + ' random builds, ' + dead + ' dead corners, each confirmed to have no placement');
}

/* --------------------------------------------------------------- run */

const checks = { 1: check1, 2: check2, 3: check3, 4: check4, 5: check5 };
const started = Date.now();
Object.keys(checks).forEach(k => {
  if (ONLY && ONLY !== k) return;
  const t = Date.now(), before = failures;
  checks[k]();
  console.log('   ' + (failures === before ? 'PASS' : 'FAIL') + ' (' + (Date.now() - t) + ' ms)');
});
console.log(failures ? failures + ' failure' + (failures > 1 ? 's' : '') : 'All checks passed', '(' + (Date.now() - started) + ' ms)');
process.exit(failures ? 1 : 0);
