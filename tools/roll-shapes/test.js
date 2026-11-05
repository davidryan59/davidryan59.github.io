/* Tests for the Rolling Shapes engine against known results: the shape library,
   the formula, the walk, the Stuck check and both kinds of Close. Each check prints
   its numbers and PASS or FAIL. The script exits with 1 if any check fails.

   Run from anywhere: node tools/roll-shapes/test.js
   It takes about a minute and a half. */

import { TAU, SHAPES, buildShape, defaultParams, depthInside, isConvex, bounds } from '../../app/roll-shapes/shapes.js';
import { formulaPoses, forSide, cleanByTheory, measureCrossing, exactRatio, fareyNeighbours, closeBySize, spinsFor } from '../../app/roll-shapes/rolling.js';
import { walk } from '../../app/roll-shapes/walk.js';
import { closeByWalk } from '../../app/roll-shapes/close.js';
import { chooseMethod, formulaPath, buildPair, describe, walkPath, QUALITY } from '../../app/roll-shapes/compute.js';
import { PRESETS } from '../../app/roll-shapes/presets.js';

let failed = 0, passed = 0;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
  if (ok) passed++; else failed++;
}
const section = title => console.log('\n' + title);
const pct = v => (v * 100).toFixed(4) + '%';

const circle = P => buildShape('circle', {}, P);
const polygon = (sides, P, extra = {}) => buildShape('polygon', { sides, ...extra }, P);
const ellipse = (stretch, P) => buildShape('ellipse', { stretch }, P);
const peanut = (waist, P) => buildShape('peanut', { waist }, P);
const flower = (petals, depth, P) => buildShape('flower', { petals, depth }, P);

/* Where a pen goes under each pose. */
function penPath(path, px, py) {
  const out = new Float64Array(path.count * 2), d = path.poses;
  for (let k = 0; k < path.count; k++) {
    const i = k * 4;
    out[2 * k] = d[i] * px - d[i + 1] * py + d[i + 2];
    out[2 * k + 1] = d[i + 1] * px + d[i] * py + d[i + 3];
  }
  return out;
}

/* Net turn of the inner shape over a path, in whole turns, from the pose list. */
function netTurns(path) {
  let total = 0, d = path.poses, last = Math.atan2(d[1], d[0]);
  for (let k = 1; k < path.count; k++) {
    const a = Math.atan2(d[k * 4 + 1], d[k * 4]);
    let delta = a - last;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    total += delta; last = a;
  }
  return total / TAU;
}

/* The deepest crossing over a path, using every vertex of the inner shape at full
   detail and every outer vertex: a check independent of the walk's test points. */
function worstCrossing(outer, inner, side, path, poseStep = 1) {
  let worst = 0;
  const d = path.poses;
  const vertexStep = Math.max(1, Math.floor(inner.n / 512));
  for (let k = 0; k < path.count; k += poseStep) {
    const i = k * 4, c = d[i], s = d[i + 1], tx = d[i + 2], ty = d[i + 3];
    for (let v = 0; v < inner.n; v += vertexStep) {
      const x = c * inner.x[v] - s * inner.y[v] + tx, y = s * inner.x[v] + c * inner.y[v] + ty;
      const depth = side * -depthInside(outer, x, y);
      if (depth > worst) worst = depth;
    }
  }
  return worst / outer.P;
}

/* The largest step of any point on the inner shape between two poses. A teleport
   would show here. */
function largestStep(inner, path) {
  const far = bounds(inner).far, d = path.poses;
  let worst = 0;
  for (let k = 1; k < path.count; k++) {
    const a = (k - 1) * 4, b = k * 4;
    const move = Math.hypot(d[b + 2] - d[a + 2], d[b + 3] - d[a + 3]) + Math.hypot(d[b] - d[a], d[b + 1] - d[a + 1]) * far;
    if (move > worst) worst = move;
  }
  return worst;
}

/* Spots where a pen stops dead: cusps. */
function countCusps(pts) {
  const n = pts.length / 2, speed = new Float64Array(n - 1);
  let top = 0;
  for (let i = 0; i < n - 1; i++) {
    speed[i] = Math.hypot(pts[2 * i + 2] - pts[2 * i], pts[2 * i + 3] - pts[2 * i + 1]);
    if (speed[i] > top) top = speed[i];
  }
  let cusps = 0;
  for (let i = 1; i < n - 2; i++) if (speed[i] < top * 0.02 && speed[i] <= speed[i - 1] && speed[i] < speed[i + 1]) cusps++;
  /* A cusp that falls exactly on the start or end of the run counts once. */
  if (speed[0] < top * 0.02 || speed[n - 2] < top * 0.02) cusps++;
  return cusps;
}

section('Shape library');
{
  let worstP = 0, star = true, inside = true, onRim = 0;
  const extremes = [];
  for (const type of Object.keys(SHAPES)) {
    const list = SHAPES[type].params;
    const variants = [defaultParams(type)];
    for (const p of list) for (const v of [p.min, p.max]) variants.push({ ...defaultParams(type), [p.key]: v });
    for (const params of variants) {
      for (const detail of [1024, 240]) {
        const s = buildShape(type, params, 137);
        void detail;
        let total = 0;
        for (let i = 0; i < s.n; i++) total += s.len[i];
        worstP = Math.max(worstP, Math.abs(total / 137 - 1));
        if (Math.abs(s.P - 137) > 0) worstP = 1;
        if (depthInside(s, 0, 0) <= 0) inside = false;
        for (let i = 0; i < s.n; i += 7) {
          onRim = Math.max(onRim, Math.abs(depthInside(s, s.x[i] * 0.999, s.y[i] * 0.999) - depthInside(s, s.x[i] * 0.999, s.y[i] * 0.999)));
          if (depthInside(s, s.x[i] * 0.98, s.y[i] * 0.98) <= 0 || depthInside(s, s.x[i] * 1.02, s.y[i] * 1.02) >= 0) star = false;
        }
        let area = 0;
        for (let i = 0; i < s.n; i++) { const j = (i + 1) % s.n; area += s.x[i] * s.y[j] - s.x[j] * s.y[i]; }
        if (area <= 0) star = false;
        extremes.push(type);
      }
    }
  }
  check('Every shape at every slider end has exactly the perimeter asked for', worstP < 1e-12, 'worst error ' + worstP.toExponential(1));
  check('Every shape is star-shaped about its origin, and counter-clockwise', star && inside, extremes.length + ' variants');

  const a = polygon(4, 120), b = polygon(4, 120, { round: 0.5 }), c = polygon(4, 120, { bulge: 0.5 });
  check('A square has four corners and straight sides of one edge', a.n === 4 && a.sharp.reduce((x, y) => x + y) === 4);
  check('Rounding removes the corners and keeps the perimeter', b.sharp.reduce((x, y) => x + y) === 0 && b.P === 120);
  check('Bulge keeps the corners and curves the sides', c.sharp.reduce((x, y) => x + y) === 4 && c.n > 100);
  const full = buildShape('rectangle', { ratio: 2, round: 1 }, 120);
  let straight = 0;
  for (let i = 0; i < full.n; i++) if (full.len[i] > 20) straight++;
  check('A fully rounded rectangle is a stadium: two long sides, no corners', straight === 2 && full.sharp.reduce((x, y) => x + y) === 0);
  const reuleaux = polygon(3, 120, { bulge: 0.5 });
  const widths = [];
  for (let t = 0; t < 180; t += 15) {
    const u = t * Math.PI / 180, c0 = Math.cos(u), s0 = Math.sin(u);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < reuleaux.n; i++) { const v = c0 * reuleaux.x[i] + s0 * reuleaux.y[i]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    widths.push(hi - lo);
  }
  check('Bulge 0.5 on a triangle gives a Reuleaux triangle: constant width', Math.max(...widths) / Math.min(...widths) - 1 < 1e-3, 'spread ' + pct(Math.max(...widths) / Math.min(...widths) - 1));
  check('A diamond squircle has four corners', buildShape('squircle', { stretch: 1, square: -1 }, 100).sharp.reduce((x, y) => x + y) === 4);
  check('A polygon with bulge 1 is the circumscribed circle', isConvex(polygon(5, 100, { bulge: 1 })) && polygon(5, 100, { bulge: 1 }).sharp.reduce((x, y) => x + y) === 0);
  check('A peanut and a flower are not convex', !isConvex(peanut(0.45, 120)) && !isConvex(flower(5, 0.25, 120)));
}

section('Formula: known curves');
{
  const R = 60 / Math.PI * 2 / 2;
  const tusi = formulaPoses(circle(120), circle(60), 1);
  const rim = buildShape('circle', {}, 60);
  const pts = penPath(tusi, rim.x[0], rim.y[0]);
  let off = 0, reach = 0;
  for (let k = 0; k < tusi.count; k++) { off = Math.max(off, Math.abs(pts[2 * k + 1])); reach = Math.max(reach, Math.abs(pts[2 * k])); }
  const bigR = 120 / TAU;
  check('Tusi couple: a rim point draws a straight line', off < bigR * 2e-3, 'off the line by ' + pct(off / bigR) + ' of R');
  check('Tusi couple: the line spans the diameter', Math.abs(reach / bigR - 1) < 1e-3, 'half length ' + (reach / bigR).toFixed(5) + ' R');
  void R;

  for (const [name, ratio, cusps, spins] of [['Deltoid', 3, 3, 2], ['Astroid', 4, 4, 3], ['Five-cusp hypocycloid', 5, 5, 4]]) {
    const inner = circle(120 / ratio), path = formulaPoses(circle(120), inner, 1, { maxPoses: 6000 });
    const p = penPath(path, inner.x[0], inner.y[0]);
    const gap = Math.hypot(p[0] - p[p.length - 2], p[1] - p[p.length - 1]);
    const r = exactRatio(120 / inner.P, 500);
    check(name + ': closes in one lap with ' + spins + ' spins', r && r.b === 1 && spinsFor(r.a, r.b, 1) === spins && gap < 1e-2, 'gap ' + gap.toExponential(1));
    check(name + ': ' + cusps + ' cusps', countCusps(p) === cusps, 'counted ' + countCusps(p));
  }
}

section('Formula: spins = trips - laps inside, trips + laps outside');
{
  for (const [name, outer, inner, side, laps] of [
    ['circle in circle', circle(120), circle(50), 1, 5],
    ['ellipse in circle', circle(120), ellipse(1.5, 40), 1, 3],
    ['circle in peanut', peanut(0.45, 120), circle(50), 1, 5],
    ['egg in egg', buildShape('egg', { egg: 0.3 }, 120), buildShape('egg', { egg: 0.1 }, 30), 1, 1],
    ['circle round circle', circle(120), circle(50), -1, 5],
    ['ellipse round square', polygon(4, 120), ellipse(2, 40), -1, 3],
    ['square round triangle', polygon(3, 120), polygon(4, 40), -1, 1],
  ]) {
    const path = formulaPoses(outer, forSide(inner, side), laps, { maxPoses: 60000 });
    const trips = laps * outer.P / inner.P, want = side > 0 ? trips - laps : trips + laps;
    const got = -side * netTurns(path);
    check(name + ': spins', Math.abs(got - want) < 1e-3, 'want ' + want.toFixed(3) + ', got ' + got.toFixed(4));
  }
  const open = formulaPath({ outer: { size: 120 }, inner: { size: 50 }, side: 1, laps: 100 }, peanut(0.45, 120), circle(50), 'preview', false);
  check('The opening pair reads "Closes after 5 laps, 7 spins"', describe(open, { laps: 100 }).detail === 'Closes after 5 laps, 7 spins', describe(open, { laps: 100 }).detail);
  const wide = formulaPath({ outer: { size: 120 }, inner: { size: 47.31 }, side: 1, laps: 100 }, circle(120), circle(47.31), 'preview', false);
  check('An irrational-looking pair reads "100 laps drawn, still open"', describe(wide, { laps: 100 }).detail === '100 laps drawn, still open' && wide.laps === 100, describe(wide, { laps: 100 }).detail);
}

section('Formula: every pose has the contact points together and the tangents in line');
{
  const outer = peanut(0.3, 120), inner = ellipse(1.3, 25);
  const path = formulaPoses(outer, inner, 3, { maxPoses: 3000 });
  let worst = 0;
  for (let k = 0; k < path.count; k++) {
    const i = k * 4, c = path.poses[i], s = path.poses[i + 1], tx = path.poses[i + 2], ty = path.poses[i + 3];
    let nearest = Infinity;
    for (let v = 0; v < inner.n; v += 2) {
      const x = c * inner.x[v] - s * inner.y[v] + tx, y = s * inner.x[v] + c * inner.y[v] + ty;
      nearest = Math.min(nearest, Math.abs(depthInside(outer, x, y)));
    }
    worst = Math.max(worst, nearest);
  }
  check('The inner shape touches the outer shape at every pose', worst < outer.P * 2e-4, 'largest gap ' + pct(worst / outer.P) + ' of perimeter');
}

section('Which method: the pairs in the spec');
{
  const method = (outer, inner, side = 1) => chooseMethod({ outer: { size: outer.P }, inner: { size: inner.P }, side, laps: 100, overlap: false }, outer, inner).method;
  check('More curved everywhere rolls by theory', cleanByTheory(circle(120), ellipse(1.5, 30), 1));
  check('Square in circle needs the walk', method(circle(120), polygon(4, 45)) === 'walk');
  check('Rounded square in circle needs the walk', method(circle(120), polygon(4, 45, { round: 0.5 })) === 'walk');
  /* Square of perimeter 80, side 20. Bulge radius below the circle radius of 19.1. */
  const bulgedTight = polygon(4, 70, { bulge: 0.9 }), bulgedFlat = polygon(4, 70, { bulge: 0.2 });
  check('Bulged square rolls when its bulge radius is below the circle radius', method(circle(120), bulgedTight) === 'formula');
  check('Bulged square needs the walk when its bulge radius is above it', method(circle(120), bulgedFlat) === 'walk');
  check('Circle in square needs the walk', method(polygon(4, 120), circle(40)) === 'walk');
  /* Rounded square of perimeter 120. The corner radius follows the rounding. */
  check('Circle in rounded square rolls when the corner radius is above the circle radius',
    method(polygon(4, 120, { round: 0.6 }), circle(30)) === 'formula');
  check('Circle in rounded square needs the walk when the corner radius is below it',
    method(polygon(4, 120, { round: 0.2 }), circle(40)) === 'walk');
  check('Two convex shapes outside always roll', cleanByTheory(polygon(5, 100), ellipse(3, 200), -1) && cleanByTheory(polygon(4, 100), polygon(3, 40), -1));
  check('Circle fits the waist: the formula is enough', method(peanut(0.45, 120), circle(50)) === 'formula');
  check('Circle too wide for the waist needs the walk', method(peanut(0.45, 120), circle(60)) === 'walk');
  check('Small circle in a flower: the formula is enough', method(flower(5, 0.25, 120), circle(15)) === 'formula');
  check('Larger circle in a flower needs the walk', method(flower(5, 0.25, 120), circle(40)) === 'walk');
  check('Circle round a peanut with a big dent needs the walk', method(peanut(0.6, 120), circle(120), -1) === 'walk');
  const m = measureCrossing(peanut(0.45, 120), circle(60), 1, 20);
  check('Allow overlap on still measures the crossing', m.crosses && m.share > 0.05 && m.share < 0.9, 'crossing at ' + (m.share * 100).toFixed(0) + '% of poses');
}

section('Walk against the known results');
{
  for (const [sides, side] of [[3, 0.8], [4, 0.6], [4, 1.0], [5, 0.7], [6, 0.5]]) {
    /* In a circle of perimeter tau, so R = 1. */
    const angles = [];
    const r = walk(circle(TAU), polygon(sides, sides * side), 1, 10, { onJump: a => angles.push(a) });
    const want = TAU / sides - 2 * Math.asin(side / 2);
    let worst = 0, n = 0;
    for (let i = 2; i < angles.length; i++) { worst = Math.max(worst, Math.abs(Math.abs(angles[i] - angles[i - 1]) / want - 1)); n++; }
    check(sides + '-gon side ' + side + ' in a circle: every hop turns 2pi/' + sides + ' - 2 asin(a/2R)', worst < 0.003 && n > 5 && r.status === 'tumbles', n + ' hops, worst ' + pct(worst));
  }
  for (const r of [0.15, 0.3, 0.6]) {
    const L = 2, want = 2 * (L - 2 * r) / (Math.PI * r);
    const path = walk(polygon(4, 8), circle(TAU * r), 1, 20);
    const got = (path.marks.at(-1).spin - path.marks[0].spin) / (path.marks.at(-1).travel - path.marks[0].travel);
    check('Circle r = ' + r + ' in a square: spins per lap', Math.abs(got / want - 1) < 2e-3 && path.status === 'tumbles', 'want ' + want.toFixed(4) + ', got ' + got.toFixed(4));
    check('Circle r = ' + r + ' in a square: hops each corner', Math.abs(path.jumps / path.laps - 4) < 0.2, path.jumps + ' jumps in ' + path.laps.toFixed(0) + ' laps');
  }
  const waist = walk(peanut(0.45, 120), circle(50), 1, 5);
  check('Circle fits a peanut\'s waist: 1.4 spins per lap, and no jumps', Math.abs(waist.spins / waist.laps - 1.4) < 2e-3 && waist.jumps === 0, (waist.spins / waist.laps).toFixed(4) + ' spins per lap');
  check('Circle fits a peanut\'s waist: the walk sees it close after 5 laps', waist.closes && waist.closes.laps === 5 && waist.closes.spins === 7);

  const wide = walk(peanut(0.45, 120), circle(60), 1, 20);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < wide.count; k++) { const x = wide.poses[k * 4 + 2]; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  check('Circle too wide for the waist stays in one lobe', lo > 0 && wide.status === 'tumbles', 'centre x from ' + lo.toFixed(1) + ' to ' + hi.toFixed(1));

  /* A square on a long wall, far from the wall's ends: each quarter turn moves it by a side. */
  const spinner = walk(polygon(4, 800), polygon(4, 8), 1, 0.2, { settleLaps: 0 });
  check('Square on a flat wall pivots corner to corner, a quarter turn per side', Math.abs(spinner.spins / (spinner.laps * 800 / 8) - 1) < 0.1, spinner.spins.toFixed(2) + ' spins over ' + (spinner.laps * 800 / 8).toFixed(2) + ' perimeters');

  for (const [name, outer, inner, side, laps] of [
    ['Circle round a peanut with a dent', peanut(0.6, 120), circle(120), -1, 5],
    ['Square round a flower', flower(5, 0.3, 120), polygon(4, 60), -1, 5],
    ['Flower round a flower', flower(4, 0.3, 100), flower(3, 0.2, 70), -1, 5],
  ]) {
    const r = walk(outer, inner, side, laps);
    check(name + ': hops across the dents', r.status === 'tumbles' && r.laps >= laps - 0.01 && r.jumps >= 1, r.jumps + ' jumps, ' + r.laps.toFixed(1) + ' laps');
  }
}

section('Walk: nothing crosses, and nothing teleports');
{
  const pairs = [
    ['Square in circle', circle(120), polygon(4, 45), 1],
    ['Rounded square in circle', circle(120), polygon(4, 45, { round: 0.4 }), 1],
    ['Circle in square', polygon(4, 120), circle(37), 1],
    ['Rounded triangle in rounded square', polygon(4, 120, { round: 0.3 }), polygon(3, 32, { round: 0.25 }), 1],
    ['Square in ellipse', ellipse(1.4, 120), polygon(4, 30), 1],
    ['Triangle in square', polygon(4, 120), polygon(3, 27), 1],
    ['Pentagon in triangle', polygon(3, 120), polygon(5, 20), 1],
    ['Circle too wide for the waist', peanut(0.45, 120), circle(60), 1],
    ['Square in peanut', peanut(0.45, 120), polygon(4, 30), 1],
    ['Egg in egg', buildShape('egg', { egg: 0.3 }, 120), buildShape('egg', { egg: 0.2 }, 45), 1],
    ['Squircle in rectangle', buildShape('rectangle', { ratio: 2, round: 0.2 }, 120), buildShape('squircle', { stretch: 1.3, square: 0.6 }, 30), 1],
    ['Square round flower', flower(5, 0.3, 120), polygon(4, 60), -1],
    ['Circle round peanut', peanut(0.6, 120), circle(120), -1],
  ];
  let top = 0;
  for (const [name, outer, inner, side] of pairs) {
    const t0 = Date.now(), r = walk(outer, inner, side, 12), ms = Date.now() - t0;
    const depth = worstCrossing(outer, inner, side, r, 2);
    const step = largestStep(inner, r) / outer.P;
    top = Math.max(top, depth);
    check(name, depth < 0.0006 && step < 0.05 && r.count > 10 && Number.isFinite(r.spins), r.status + ', crossing ' + pct(depth) + ', largest step ' + pct(step) + ', ' + ms + ' ms');
  }
  check('Worst crossing beats the throwaway test\'s 0.09% of the perimeter', top < 0.0009, pct(top));
}

section('Open item: flowers with Allow overlap off');
{
  let worstDepth = 0, worstStep = 0, ran = 0, stuck = 0, bad = [];
  for (const petals of [3, 4, 5, 6, 8, 12]) {
    for (const depth of [0.1, 0.25, 0.5]) {
      for (const size of [15, 30, 50, 75]) {
        for (const [innerName, inner] of [['circle', circle(size)], ['square', polygon(4, size)], ['ellipse', ellipse(1.6, size)]]) {
          const outer = flower(petals, depth, 120);
          const r = walk(outer, inner, 1, 4, { maxMs: 3000 });
          const d = worstCrossing(outer, inner, 1, r, 4), step = largestStep(inner, r) / outer.P;
          if (!r.nofit) worstDepth = Math.max(worstDepth, d);
          worstStep = Math.max(worstStep, step); ran++;
          if (r.status === 'stuck') stuck++;
          const label = petals + ' petals depth ' + depth + ' ' + innerName + ' ' + size;
          if (!Number.isFinite(r.spins) && !r.nofit) bad.push(label + ' gave no number');
          if (r.status !== 'stuck' && !r.closes && !r.truncated && r.laps < 3.99) bad.push(label + ' stopped at ' + r.laps.toFixed(2));
          if (!r.nofit && d > 0.0009) bad.push(label + ' crossed by ' + pct(d));
          if (step > 0.05) bad.push(label + ' stepped by ' + pct(step));
        }
      }
    }
  }
  check(ran + ' flower pairs run with nothing crossing and nothing teleporting', bad.length === 0, 'worst crossing ' + pct(worstDepth) + ', largest step ' + pct(worstStep) + ', ' + stuck + ' read Stuck' + (bad.length ? '; ' + bad.slice(0, 5).join('; ') : ''));
  const small = flower(5, 0.25, 120), r = chooseMethod({ outer: { size: 120 }, inner: { size: 15 }, side: 1, laps: 8, overlap: false }, small, circle(15));
  check('Small circle in a flower rolls round the whole outline', r.method === 'formula');
  const large = walk(flower(5, 0.25, 120), circle(50), 1, 8);
  check('A circle too big for the dents rolls on the tips with hops', large.status === 'tumbles' && large.jumps >= 5, large.jumps + ' jumps');
}

section('Open item: speed');
{
  const t0 = Date.now(), r = walk(polygon(4, 8), circle(TAU * 0.3), 1, 20), ms = Date.now() - t0;
  check('Circle in a square at 1,024 corners, 20 laps: well under the old 6 s', ms < 2000 && r.laps >= 20, ms + ' ms, ' + r.checks + ' touch tests');
  const t1 = Date.now(), r2 = walk(polygon(4, 120, { round: 0.3 }), polygon(3, 32, { round: 0.25 }), 1, 100), ms2 = Date.now() - t1;
  check('Rounded triangle in rounded square, 100 laps at 1,024 corners', ms2 < 8000 && r2.laps >= 100, ms2 + ' ms');
  const t2 = Date.now(), path = walkPath({ outer: { type: 'polygon', params: { sides: 4 }, size: 120 }, inner: { type: 'circle', params: {}, size: 37 }, side: 1, laps: 100 }, 'preview'), ms3 = Date.now() - t2;
  check('A preview run stops at its time limit', ms3 < 300, ms3 + ' ms, reached ' + path.laps.toFixed(1) + ' laps');
  const t3 = Date.now(), f = formulaPoses(circle(120), circle(47.31), 500), ms4 = Date.now() - t3;
  check('Formula, 500 laps', ms4 < 1000, f.count + ' poses, ' + ms4 + ' ms');
}

section('Open item: Stuck');
{
  const jam = walk(buildShape('squircle', { stretch: 1, square: -1 }, 4), ellipse(12, 2.42), 1, 100);
  check('A thin ellipse in a diamond reads Stuck, and stops rattling', jam.status === 'stuck' && jam.laps < 20, jam.status + ' after ' + jam.laps.toFixed(2) + ' laps, ' + jam.ms + ' ms');
  const jam2 = walk(polygon(4, 4), ellipse(12.5, 2.2), 1, 100);
  check('A long thin ellipse in a small square reads Stuck', jam2.status === 'stuck', jam2.status + ' after ' + jam2.laps.toFixed(2) + ' laps');
  const big = walk(circle(TAU), polygon(4, 6), 1, 5);
  check('A square too large for the circle reads Stuck', big.status === 'stuck' && big.nofit === true);
  const inscribed = walk(circle(120), polygon(4, 120 / TAU * Math.SQRT2 * 4), 1, 5);
  check('A square that just fits its circle reads Stuck', inscribed.status === 'stuck', inscribed.status + (inscribed.nofit ? ', no fit' : ''));
  const small = walk(buildShape('squircle', { stretch: 1, square: -1 }, 4), ellipse(3, 0.5), 1, 10);
  check('A small ellipse in the same diamond keeps moving', small.status === 'tumbles', small.status);
  const same = chooseMethod({ outer: { size: 100 }, inner: { size: 200 }, side: 1, laps: 5, overlap: false }, circle(100), circle(200));
  check('A circle larger than its circle needs the walk', same.method === 'walk');
  check('... and that reads Stuck', walk(circle(100), circle(200), 1, 5).status === 'stuck');
  const label = describe(jam, { laps: 100 });
  check('The readout says so', label.state === 'Stuck', label.state + ': ' + label.detail);
}

section('Close: clean rolling');
{
  /* The move is largest beside a simple fraction, where the next fraction with at
     most N laps sits about 1 / N away. */
  let worst10 = 0, worst20 = 0, worst200 = 0, longest = 0;
  for (let size = 30; size <= 60; size += 0.137) {
    const a = closeBySize(120, size, 10), b = closeBySize(120, size, 20), c = closeBySize(120, size, 200);
    worst10 = Math.max(worst10, Math.abs(a.size / size - 1));
    worst20 = Math.max(worst20, Math.abs(b.size / size - 1));
    worst200 = Math.max(worst200, Math.abs(c.size / size - 1));
    longest = Math.max(longest, c.laps);
    const exact = exactRatio(120 / c.size, 200);
    if (!exact || exact.b !== c.laps) worst200 = 1;
    if (a.laps > 10 || b.laps > 20 || c.laps > 200) worst200 = 1;
  }
  check('N = 10 moves the inner size by under 2.5%', worst10 < 0.025, pct(worst10));
  check('N = 20 moves the inner size by under 1.3%', worst20 < 0.013, pct(worst20));
  check('N = 200 moves it by under 0.13%, and the result is exact', worst200 < 0.0013, pct(worst200) + ', longest ' + longest + ' laps');
  const n = fareyNeighbours(2.37, 10);
  check('The two neighbouring fractions bracket the ratio', n.low.a / n.low.b <= 2.37 && n.high.a / n.high.b >= 2.37 && n.low.b <= 10 && n.high.b <= 10, n.low.a + '/' + n.low.b + ', ' + n.high.a + '/' + n.high.b);
  const close = closeBySize(120, 47.3, 20), spec = { outer: { type: 'circle', params: {}, size: 120 }, inner: { type: 'circle', params: {}, size: close.size }, side: 1, laps: 20, overlap: false };
  const { outer, inner } = buildPair(spec, 1024);
  const path = formulaPath(spec, outer, inner, 'full', false);
  const pen = penPath(path, 3, 1), gap = Math.hypot(pen[0] - pen[pen.length - 2], pen[1] - pen[pen.length - 1]);
  check('After Close the curve really closes', gap < 1e-3 && path.closes.laps === close.laps, 'gap ' + gap.toExponential(1) + ', ' + path.closes.laps + ' laps');
}

section('Open item: Close while tumbling');
{
  const sq = { type: 'polygon', params: { sides: 4 } };
  const ci = { type: 'circle', params: {} };
  for (const [name, outer, inner, side, N, moved] of [
    ['Square in circle', { ...ci, size: 120 }, { ...sq, size: 45 }, 1, 20, 0.01],
    ['Circle in square', { ...sq, size: 120 }, { ...ci, size: 37 }, 1, 20, 0.012],
    ['Rounded square in circle', { ...ci, size: 120 }, { type: 'polygon', params: { sides: 4, round: 0.4 }, size: 47 }, 1, 20, 0.012],
    ['Circle too wide for the waist', { type: 'peanut', params: { waist: 0.45 }, size: 120 }, { ...ci, size: 61 }, 1, 20, 0.012],
    ['Ellipse in square', { ...sq, size: 120 }, { type: 'ellipse', params: { stretch: 1.7 }, size: 31 }, 1, 20, 0.012],
    ['Square round a flower, a chaotic tumble', { type: 'flower', params: { petals: 5, depth: 0.3 }, size: 120 }, { ...sq, size: 60.5 }, -1, 20, 0.025],
  ]) {
    const spec = { outer, inner, side, laps: N, overlap: false };
    const t0 = Date.now(), r = closeByWalk(spec, { maxMs: 20000 }), ms = Date.now() - t0;
    if (!r.ok) { check(name + ': Close finds a size', false, r.reason); continue; }
    /* A separate run at the new size, compared pose to pose. */
    const check2 = walk(buildShape(outer.type, outer.params, outer.size, 720), buildShape(inner.type, inner.params, r.size, 720), side, N);
    const c = check2.closes;
    let gap = Infinity;
    if (c) {
      const P = check2.poses, a = (c.startIndex - 1) * 4, b = (c.endIndex - 1) * 4, far = bounds(buildShape(inner.type, inner.params, r.size)).far;
      gap = (Math.hypot(P[a + 2] - P[b + 2], P[a + 3] - P[b + 3]) + Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1]) * far) / outer.size;
    }
    check(name + ': N = ' + N, c && c.laps <= N && gap < 1e-3 && Math.abs(r.size / inner.size - 1) < moved,
      'moved ' + pct(Math.abs(r.size / inner.size - 1)) + ', closes after ' + r.laps + ' laps, ' + r.spins + ' spins, gap ' + pct(gap) + ', ' + ms + ' ms');
  }
  /* The known law: a square in a circle closes when hops per lap / 4 - 1 is a fraction. */
  const spec = { outer: { type: 'circle', params: {}, size: 120 }, inner: { type: 'polygon', params: { sides: 4 }, size: 45 }, side: 1, laps: 20, overlap: false };
  const r = closeByWalk(spec);
  const R = 120 / TAU, a = r.size / 4, alpha = Math.asin(a / (2 * R)), rate = Math.PI / alpha / 4 - 1;
  check('A closed square in a circle obeys the hop law', Math.abs(rate * r.laps - r.spins) < 1e-3, 'spins per lap ' + rate.toFixed(5) + ' = ' + r.spins + '/' + r.laps);
  const stuck = closeByWalk({ ...spec, inner: { ...spec.inner, size: 400 } });
  check('A stuck pair reports no closing size', !stuck.ok, stuck.reason);
}

section('Presets');
{
  for (const p of PRESETS) {
    const spec = { outer: p.outer, inner: p.inner, side: p.side || 1, overlap: false, laps: 100 };
    const { outer, inner } = buildPair(spec, QUALITY.full.detail);
    const choice = chooseMethod(spec, outer, inner);
    const path = choice.method === 'formula' ? formulaPath(spec, outer, inner, 'full', false) : walkPath(spec, 'full');
    const closes = path.closes ? path.closes.laps : null;
    check(p.label, path.status === p.status && closes === p.closes, describe(path, spec).state + ': ' + describe(path, spec).detail);
  }
}

section('Repeatable');
{
  const run = () => walk(flower(5, 0.25, 120), polygon(3, 24), 1, 8);
  const a = run(), b = run();
  check('Two runs give the same poses', a.count === b.count && a.poses.every((v, i) => v === b.poses[i]));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
