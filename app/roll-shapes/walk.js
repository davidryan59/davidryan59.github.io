/* The walk method, for shapes that would cross. Every shape is a polygon, and
   rolling is a run along an edge followed by a pivot on a corner. During a run the
   inner shape lies still and the contact moves along both edges by equal lengths.
   Only a pivot moves the shape, so only a pivot can make a new touch. A touch stops
   the pivot and moves the contact there. The pose stays continuous, so the shape
   never teleports, and a sharp corner needs no special handling. */

import { TAU, depthInside, edgeAt, bounds } from './shapes.js';
import { PoseList, testPoints, outerTestPoints, forSide } from './rolling.js';

const wrap = a => { while (a > Math.PI) a -= TAU; while (a <= -Math.PI) a += TAU; return a; };

/* A contact move further than this share of the outer perimeter counts as a jump.
   A smaller one is a slip, too small to see. */
const JUMP = 0.015;

const DEFAULTS = {
  testCount: 128,      /* coarse test points on the inner shape */
  outerCount: 128,     /* test points on the outer shape, where it can poke in */
  stepMax: 0.05,       /* the largest pivot step between touch tests, in radians */
  spinFloor: 0.01,     /* spins per lap below this, in place, reads as Stuck */
  stuckWindow: 3,      /* laps over which Stuck looks for progress */
  rattleJumps: 8,      /* jumps over which Stuck looks for progress */
  rattleTurn: 0.02,    /* radians */
  rattleMove: 0.005,   /* share of the outer perimeter */
  closeTol: 1e-4,      /* how near, as a share of the outer perimeter, counts as back at the start */
  settleLaps: 2,       /* laps run past N, looking for a state that repeats */
  maxPoses: 900000,
  maxMs: Infinity,
  maxLaps: Infinity,
};

export function walk(outer, base, side, laps, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const started = Date.now();
  const inner = side > 0 ? base : forSide(base, side);
  const eps = outer.P * 8e-6;
  const itests = testPoints(inner, opt.testCount), otests = outerTestPoints(outer, side, opt.outerCount);
  const bodyFar = bounds(base).far;
  const skipArc = Math.max(inner.P * 0.004, eps * 4);
  const recordMove = outer.P / 3000;

  /* The pose. */
  let A = 0, c = 1, s = 0, tx = 0, ty = 0;
  const setAngle = a => { A = a; c = Math.cos(a); s = Math.sin(a); };

  /* The contact, as an edge and a distance along it, on each shape. */
  let oe = 0, uo = 0, ie = 0, ui = 0;
  let travel = 0, itravel = 0, jumps = 0, slips = 0, pivots = 0, checks = 0;

  /* The state at each whole lap, and the pose at each recent jump. */
  let sections = [];
  const marks = [];
  let wantMark = false;
  const recentJumps = [];
  let rattling = false;

  /* The deepest crossing for a trial pose. The contact's own neighbourhood on the
     inner shape is skipped, since rolling keeps it on the wall. */
  let touchKind = 0, touchIndex = -1;
  const contactArc = () => inner.cum[ie] + ui;
  function deepest(C, S, X, Y, moving) {
    checks++;
    let best = -Infinity, kind = 0, index = -1;
    const here = contactArc(), P = inner.P;
    const ix = itests.x, iy = itests.y, margin = itests.margin;
    const visit = i => {
      if (moving) {
        let gap = inner.cum[i] - here;
        if (gap < 0) gap = -gap;
        if (gap > P / 2) gap = P - gap;
        if (gap < skipArc) return -Infinity;
      }
      const x = C * ix[i] - S * iy[i] + X, y = S * ix[i] + C * iy[i] + Y;
      const d = side * -depthInside(outer, x, y);
      if (d > best) {
        /* A crossing that this move does not deepen cannot block the move. */
        if (moving && d > eps && d <= side * -depthInside(outer, c * ix[i] - s * iy[i] + tx, s * ix[i] + c * iy[i] + ty) + 1e-12) return d;
        best = d; kind = 1; index = i;
      }
      return d;
    };
    for (let a = 0; a < itests.m; a++) {
      const d = visit(itests.index[a]);
      if (d > -margin && margin > 0) {
        /* Near a touch, so look at the vertices beside this test point. */
        const i = itests.index[a], forward = itests.gap[a], back = itests.gap[(a + itests.m - 1) % itests.m];
        for (let k = 1; k < forward; k++) visit((i + k) % itests.n);
        for (let k = 1; k < back; k++) visit((i - k + itests.n) % itests.n);
      }
    }
    for (let a = 0; a < otests.m; a++) {
      const v = otests.index[a];
      const dx = outer.x[v] - X, dy = outer.y[v] - Y;
      const qx = C * dx + S * dy, qy = -S * dx + C * dy;
      const d = depthInside(base, qx, qy);
      if (d > best) {
        /* Away from the contact only: the contact's own wall vertex does not count. */
        if (moving) {
          let gap = outer.cum[v] - (outer.cum[oe] + uo);
          if (gap < 0) gap = -gap;
          if (gap > outer.P / 2) gap = outer.P - gap;
          if (gap < skipArc) continue;
          const nx = outer.x[v] - tx, ny = outer.y[v] - ty;
          if (d > eps && d <= depthInside(base, c * nx + s * ny, -s * nx + c * ny) + 1e-12) continue;
        }
        best = d; kind = 2; index = v;
      }
    }
    touchKind = kind; touchIndex = index;
    return best;
  }

  const list = new PoseList(1 << 14);
  let lastX = 0, lastY = 0, lastA = 0, recTol = recordMove;
  function record(force) {
    const moved = Math.abs(tx - lastX) + Math.abs(ty - lastY) + Math.abs(A - lastA) * bodyFar;
    if (!force && moved < recTol) return;
    list.push(c, s, tx, ty);
    lastX = tx; lastY = ty; lastA = A;
    if (list.count >= opt.maxPoses) {
      list.halve();
      recTol *= 2;
      for (const e of sections) e.index = Math.ceil(e.index / 2);
    }
  }

  const contactWorld = () => {
    const a = outer.ang[oe];
    return [outer.x[oe] + uo * Math.cos(a), outer.y[oe] + uo * Math.sin(a)];
  };

  /* Pose after pivoting by phi about point (px, py). */
  let tA = 0, tC = 1, tS = 0, tX = 0, tY = 0;
  function trial(phi, px, py) {
    const C = Math.cos(phi), S = Math.sin(phi), dx = tx - px, dy = ty - py;
    tA = A + phi;
    tC = Math.cos(tA); tS = Math.sin(tA);
    tX = px + C * dx - S * dy; tY = py + S * dx + C * dy;
  }

  /* Pivots about the contact, stopping at the first touch. Returns the angle turned. */
  let touched = false;
  function pivot(phi) {
    pivots++;
    touched = false;
    const [px, py] = contactWorld();
    const steps = Math.max(1, Math.ceil(Math.abs(phi) / opt.stepMax));
    let done = 0, hitAt = null;
    for (let k = 1; k <= steps; k++) {
      const f = phi * k / steps;
      trial(f, px, py);
      if (deepest(tC, tS, tX, tY, true) > eps) { hitAt = f; break; }
      done = f;
    }
    let turned = phi, kind = 0, index = -1;
    if (hitAt !== null) {
      let lo = done, hi = hitAt;
      for (let q = 0; q < 24; q++) {
        const m = (lo + hi) / 2;
        trial(m, px, py);
        if (deepest(tC, tS, tX, tY, true) > eps) hi = m; else lo = m;
      }
      trial(hi, px, py);
      deepest(tC, tS, tX, tY, true);
      kind = touchKind; index = touchIndex;
      turned = lo;
      touched = kind !== 0;
    }
    /* Commit, recording the arc for pens far from the pivot. */
    const startA = A, sx = tx, sy = ty, parts = Math.max(1, Math.ceil(Math.abs(turned) / 0.05));
    if (parts > 1) {
      for (let k = 1; k < parts; k++) {
        const f = turned * k / parts, C = Math.cos(f), S = Math.sin(f), dx = sx - px, dy = sy - py;
        setAngle(startA + f);
        tx = px + C * dx - S * dy; ty = py + S * dx + C * dy;
        record(true);
      }
    }
    {
      const C = Math.cos(turned), S = Math.sin(turned), dx = sx - px, dy = sy - py;
      setAngle(startA + turned);
      tx = px + C * dx - S * dy; ty = py + S * dx + C * dy;
    }
    record(parts > 1);
    touchKind = kind; touchIndex = index;
    return turned;
  }

  /* Moves the contact to a touch. A forward jump adds to the distance travelled. */
  function moveContact(kind, index) {
    const before = outer.cum[oe] + uo, beforeI = contactArc();
    let wallX, wallY;
    if (kind === 1) {
      const bx = inner.x[index], by = inner.y[index];
      const x = c * bx - s * by + tx, y = s * bx + c * by + ty;
      const e = edgeAt(outer, x, y), ux = Math.cos(outer.ang[e]), uy = Math.sin(outer.ang[e]);
      const u = Math.max(0, Math.min(outer.len[e], (x - outer.x[e]) * ux + (y - outer.y[e]) * uy));
      oe = e; uo = u; ie = index; ui = 0;
      wallX = outer.x[e] + u * ux; wallY = outer.y[e] + u * uy;
      /* Touching points agree to within the tolerance. Closing that gap stops a
         slow drift of the shape away from the wall. */
      tx += wallX - x; ty += wallY - y;
    } else {
      const dx = outer.x[index] - tx, dy = outer.y[index] - ty;
      const qx = c * dx + s * dy, qy = -s * dx + c * dy;
      const be = edgeAt(base, qx, qy);
      const e = side > 0 ? be : (inner.n - be - 1 + inner.n) % inner.n;
      const ux = Math.cos(inner.ang[e]), uy = Math.sin(inner.ang[e]);
      const u = Math.max(0, Math.min(inner.len[e], (qx - inner.x[e]) * ux + (qy - inner.y[e]) * uy));
      oe = index; uo = 0; ie = e; ui = u;
    }
    let d = (outer.cum[oe] + uo - before) % outer.P;
    if (d < 0) d += outer.P;
    if (d > outer.P * 0.99) d -= outer.P;
    travel += d;
    let di = (contactArc() - beforeI) % inner.P;
    if (di < 0) di += inner.P;
    if (di > inner.P * 0.99) di -= inner.P;
    itravel += di;
    if (Math.abs(d) > outer.P * JUMP) {
      jumps++;
      /* The first jump after each lap: a stair step in spins against travel that
         falls at the same phase each time, so a rate read between marks is smooth. */
      if (wantMark) { marks.push({ spin: -side * (A - startA) / TAU, travel: travel / outer.P }); wantMark = false; }
      if (opt.onJump) opt.onJump(A, travel / outer.P);
      /* Many jumps with no net turn and no net move is a rattle in place. */
      recentJumps.push({ A, tx, ty });
      if (recentJumps.length > opt.rattleJumps) {
        const old = recentJumps.shift();
        if (Math.abs(A - old.A) < opt.rattleTurn && Math.hypot(tx - old.tx, ty - old.ty) < outer.P * opt.rattleMove) rattling = true;
      }
    } else slips++;
  }

  const done = (status, extra = {}) => {
    if (list.count === 0) list.push(c, s, tx, ty);
    const spinTotal = -side * (A - startA) / TAU;
    return {
      method: 'walk', status, poses: list.trimmed(), count: list.count,
      laps: travel / outer.P, trips: itravel / inner.P, spins: spinTotal,
      jumps, slips, pivots, checks, ms: Date.now() - started, closes: null,
      lapSpins: sections.map(e => -side * (e.A - startA) / TAU), marks, ...extra,
    };
  };

  /* The start: the formula's own pose if it is free, or else a free spot found by
     searching, moved until it touches the wall. */
  const free = (C, S, X, Y) => deepest(C, S, X, Y, false) <= eps;
  function formulaStart() {
    const a0 = outer.ang[0] - inner.ang[0];
    setAngle(a0);
    tx = outer.x[0] - (c * inner.x[0] - s * inner.y[0]);
    ty = outer.y[0] - (s * inner.x[0] + c * inner.y[0]);
    return free(c, s, tx, ty);
  }
  let startA = 0;
  function searchStart() {
    const a0 = A, o = bounds(outer), i = bounds(base);
    if (side < 0) {
      const far = o.far + i.far + 1;
      let lo = 0, hi = far;
      if (!free(c, s, hi, 0)) return false;
      for (let q = 0; q < 40; q++) { const m = (lo + hi) / 2; if (free(c, s, m, 0)) hi = m; else lo = m; }
      tx = hi; ty = 0;
      deepest(c, s, lo, 0, false);
      return placeTouch();
    }
    const steps = 16;
    for (let t = 0; t < 24; t++) {
      const a = a0 + (t % 2 ? -1 : 1) * Math.ceil(t / 2) * TAU / 24, C = Math.cos(a), S = Math.sin(a);
      const seeds = [[0, 0]];
      for (let v = 1; v <= steps; v++) for (let h = -steps; h <= steps; h++) {
        seeds.push([o.maxX * v / steps, o.maxY * h / steps], [o.minX * v / steps, o.maxY * h / steps]);
      }
      for (const [X, Y] of seeds) {
        if (!free(C, S, X, Y)) continue;
        /* Move right until something touches. */
        setAngle(a);
        let lo = X, hi = o.maxX - o.minX + X + 1;
        for (let q = 0; q < 40; q++) { const m = (lo + hi) / 2; if (free(C, S, m, Y)) lo = m; else hi = m; }
        tx = lo; ty = Y;
        deepest(C, S, hi, Y, false);
        return placeTouch();
      }
    }
    return false;
  }
  function placeTouch() {
    if (touchKind === 0) return false;
    moveContact(touchKind, touchIndex);
    travel = 0; itravel = 0; jumps = 0; slips = 0;
    return true;
  }

  if (!formulaStart() && !searchStart()) {
    /* Nothing fits: park at the formula's pose so the crossing is visible. */
    const a0 = outer.ang[0] - inner.ang[0];
    setAngle(a0);
    tx = outer.x[0] - (c * inner.x[0] - s * inner.y[0]);
    ty = outer.y[0] - (s * inner.x[0] + c * inner.y[0]);
    startA = A;
    return done('stuck', { nofit: true });
  }
  startA = A;
  record(true);

  /* The first lap may still be settling, so a state can first repeat one lap late.
     Running on past N laps lets a curve that closes in N laps show it, and the poses
     past lap N are dropped again if it does not. */
  const total = (laps + opt.settleLaps) * outer.P, normal = side > 0 ? -1 : 1;
  const tol = outer.P * opt.closeTol;
  sections = [{ lap: 0, index: 1, A, c, s, tx, ty, arc: outer.cum[oe] + uo, jumps: 0 }];
  const stillLimit = (outer.n + inner.n) * 2 + 64;
  let wholeLaps = 0, pinned = 0, still = 0, events = 0;

  /* Tries to turn by a small step against the normal way, which a sampled wall
     asks for each time it turns towards the shape. The step is refused if it
     drives another part of the shape through the wall. */
  function tryCounterPivot(phi) {
    const [px, py] = contactWorld();
    trial(phi, px, py);
    const a = tA, cc = tC, ss = tS, x = tX, y = tY;
    if (deepest(cc, ss, x, y, true) > eps) return false;
    setAngle(a); tx = x; ty = y;
    record(false);
    return true;
  }

  /* The inner point just ahead that lies nearest the wall, if it is all but touching. */
  function touchAhead() {
    const here = contactArc();
    let best = -Infinity, index = -1;
    for (let a = 0; a < itests.m; a++) {
      const i = itests.index[a];
      let ahead = inner.cum[i] - here;
      if (ahead < 0) ahead += inner.P;
      if (ahead < skipArc || ahead > inner.P / 2) continue;
      const x = c * inner.x[i] - s * inner.y[i] + tx, y = s * inner.x[i] + c * inner.y[i] + ty;
      const d = side * -depthInside(outer, x, y);
      if (d > best) { best = d; index = i; }
    }
    return best > -eps * 8 ? index : -1;
  }

  /* At each whole lap: is the state back where it was, and is it making progress? */
  function atLap() {
    const lapNow = Math.floor(travel / outer.P + 1e-9);
    if (lapNow <= wholeLaps) return null;
    wholeLaps = lapNow;
    wantMark = true;
    record(true);
    const here = { lap: lapNow, index: list.count, A, c, s, tx, ty, arc: outer.cum[oe] + uo, jumps };
    for (let j = sections.length - 1; j >= 0; j--) {
      const e = sections[j];
      if (lapNow - e.lap > laps) break;
      const near = Math.abs(e.tx - tx) + Math.abs(e.ty - ty) + (Math.abs(e.c - c) + Math.abs(e.s - s)) * bodyFar;
      if (near > tol * 2) continue;
      let da = Math.abs(e.arc - here.arc);
      if (da > outer.P / 2) da = outer.P - da;
      if (da > outer.P * 2e-3) continue;
      const spins = Math.round(-side * (A - e.A) / TAU);
      if (spins === 0) return done('stuck');
      return done(jumps ? 'tumbles' : 'rolls', {
        closes: { laps: lapNow - e.lap, spins, fromLap: e.lap, startIndex: e.index, endIndex: list.count },
      });
    }
    sections.push(here);
    /* Going round the outline with no net turn, and staying put: Stuck. */
    if (sections.length > opt.stuckWindow) {
      const old = sections[sections.length - 1 - opt.stuckWindow];
      const spinRate = Math.abs(A - old.A) / TAU / opt.stuckWindow;
      if (spinRate < opt.spinFloor && Math.hypot(tx - old.tx, ty - old.ty) < outer.P * 0.05) return done('stuck');
    }
    return null;
  }

  while (travel < total) {
    if ((++events & 255) === 0) {
      const ms = Date.now() - started;
      if (ms > opt.maxMs) return done(jumps ? 'tumbles' : 'rolls', { truncated: true });
      if (opt.onProgress && (events & 16383) === 0) opt.onProgress(Math.min(1, travel / (laps * outer.P)));
    }
    if (rattling || ++still > stillLimit) return done('stuck');

    const finished = atLap();
    if (finished) return finished;

    /* Lay the current inner edge along the current wall, turning the normal way. */
    const phi = wrap(outer.ang[oe] - A - inner.ang[ie]);
    if (Math.abs(phi) > 1e-12) {
      if (phi * normal > 0) {
        const turned = pivot(phi);
        if (Math.abs(turned) > 1e-7) { still = 0; pinned = 0; }
        if (touched) {
          const kind = touchKind, index = touchIndex;
          moveContact(kind, index);
          /* A second touch stopped the pivot at once, so the shape is pinned. */
          if (Math.abs(turned) <= 1e-7 && ++pinned > 16) return done('stuck');
          continue;
        }
      } else if (Math.abs(phi) < 0.15 && tryCounterPivot(phi)) {
        if (Math.abs(phi) > 1e-7) { still = 0; pinned = 0; }
      } else {
        const ahead = touchAhead();
        if (ahead >= 0) {
          moveContact(1, ahead);
          if (++pinned > 16) return done('stuck');
          continue;
        }
      }
    }

    /* Run: both contact points move by equal arc length, and the shape lies still. */
    const restO = outer.len[oe] - uo, restI = inner.len[ie] - ui, d = Math.min(restO, restI);
    travel += d; itravel += d; uo += d; ui += d;
    if (restI <= d) { ie = (ie + 1) % inner.n; ui = 0; }
    if (restO <= d) { oe = (oe + 1) % outer.n; uo = 0; }

  }
  const finished = atLap();
  if (finished) return finished;
  record(true);
  /* No repeat turned up, so drop the poses from past lap N. */
  const end = sections.find(e => e.lap >= laps);
  if (!end) return done(jumps ? 'tumbles' : 'rolls');
  return done(end.jumps ? 'tumbles' : 'rolls', {
    count: end.index, laps: end.lap, jumps: end.jumps, spins: -side * (end.A - startA) / TAU,
    poses: list.data.slice(0, end.index * 4),
  });
}
