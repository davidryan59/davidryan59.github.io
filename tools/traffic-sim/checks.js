/* Checks for the traffic-sim engine beyond the sweep: the field
   experiments it should echo, the absorber switch, the two-lane ring, a
   seed's repeatability, and the visitor's actions, all with the reference
   model's identical humans; then the settings files, the human population,
   its calibration, keep left, and the Human Driver Model. Each check prints
   its numbers and PASS or FAIL. The script exits with 1 if any check fails.

   Run from anywhere: node tools/traffic-sim/checks.js
   It takes about 40 s. */

import { readFileSync } from 'node:fs';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { mixTypes, assignTypes, roundHalfEven } from '../../app/traffic-sim/engine/mix.js';
import { makeRng, hashSeed } from '../../app/traffic-sim/engine/rng.js';
import { HUMAN, SELFISH, COORDINATED, ABSORBER, TYPE_NAMES, P_PLATOON, P_ABSORBER, P_COOPERATIVE, makeParams } from '../../app/traffic-sim/engine/drivers.js';
import { readSettings, missingParams, G } from '../../app/traffic-sim/engine/settings.js';
import { drawTraits, traitValue, normalQuantile, TRAITS } from '../../app/traffic-sim/engine/population.js';
import { speedField, waveSpeed, waveOnset } from './waves.js';

const settingsFile = name => readFileSync(new URL(`../../app/traffic-sim/settings/${name}.json`, import.meta.url), 'utf8');
const REFERENCE = settingsFile('reference'), UK = settingsFile('uk-motorway');
const uk = readSettings(UK);

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
  if (!ok) failed++;
}

// Runs a ring for a warm-up, then measures. Times in seconds.
function run(opts, warm = 600, measure = 900) {
  const ring = new Ring(opts);
  for (let k = Math.round(warm / ring.c.dt); k > 0; k--) ring.step();
  ring.resetStats();
  for (let k = Math.round(measure / ring.c.dt); k > 0; k--) ring.step();
  return ring;
}
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
const seeds = [1, 2, 3];

// Human traffic carries 2,000 to 2,200 vehicles per hour per lane at best.
{
  const peak = Math.max(...[25, 30, 35].map(d =>
    mean(seeds.map(seed => run({ length: 50 / d * 1000, types: new Uint8Array(50), seed }).stats().flow))));
  check('Human traffic peaks at 2,000 to 2,200 veh/h/lane', peak >= 2000 && peak <= 2200, `peak ${peak.toFixed(0)} veh/h/lane`);
}

// Sugiyama et al. 2008: 22 cars on a 230 m ring form a stop-and-go wave.
// Stern et al. 2018: one wave-absorbing car among them clears it.
{
  const humans = seeds.map(seed => run({ length: 230, types: new Uint8Array(22), seed }, 300, 300).stats());
  const one = new Uint8Array(22);
  one[0] = ABSORBER;
  const absorbed = seeds.map(seed => run({ length: 230, types: one, seed }, 300, 300).stats());
  const sdH = mean(humans.map(m => m.speedSpread)), sdA = mean(absorbed.map(m => m.speedSpread));
  const gain = mean(absorbed.map(m => m.flow)) / mean(humans.map(m => m.flow)) - 1;
  check('22 human drivers on a 230 m ring form a wave', sdH > 1.5,
    `speed spread ${sdH.toFixed(2)} m/s, mean speed ${(3.6 * mean(humans.map(m => m.meanSpeed))).toFixed(0)} km/h`);
  check('One absorber among them clears the wave', sdA < 1.5,
    `speed spread ${sdA.toFixed(2)} m/s, flow ${gain >= 0 ? '+' : ''}${(100 * gain).toFixed(0)}%`);

  // The absorber switch: a coordinated car with the switch on drives as an absorber behind a human.
  const coord = new Uint8Array(22);
  coord[0] = COORDINATED;
  const same = seeds.every((seed, k) => run({ length: 230, types: coord, seed, absorb: true }, 300, 300).stats().flow === absorbed[k].flow);
  check('With the absorber switch on, a coordinated car behind a human drives as an absorber', same,
    'identical flow to an absorber, seed for seed');
}

// The switch never touches a coordinated car behind another coordinated car.
{
  const types = mixTypes(50, { coordinated: 0.6, selfish: 0 }, makeRng(5));
  const on = new Ring({ length: 50 / 45 * 1000, types, seed: 5, absorb: true });
  const off = new Ring({ length: 50 / 45 * 1000, types, seed: 5, absorb: false });
  let wrong = 0;
  for (let i = 0; i < 50; i++) {
    if (types[i] !== COORDINATED) continue;
    const behindCoord = types[on.leader[i]] === COORDINATED;
    if (behindCoord && (on.profile[i] !== P_PLATOON || off.profile[i] !== P_PLATOON)) wrong++;
    if (!behindCoord && (on.profile[i] !== P_ABSORBER || off.profile[i] !== P_COOPERATIVE)) wrong++;
  }
  check('A coordinated car platoons behind a coordinated car, switch on or off', wrong === 0, `${wrong} cars on the wrong controller`);
}

// The two-lane ring with symmetric lane changes: no collisions, lanes stay
// balanced, and selfish cars (politeness 0) change lane far more often than
// coordinated cars (politeness 1).
{
  const rows = [];
  let crashes = 0, worstSplit = 0;
  for (const [name, mix] of [['humans', { coordinated: 0, selfish: 0 }], ['half coordinated', { coordinated: 0.5, selfish: 0 }],
    ['half selfish', { coordinated: 0, selfish: 0.5 }], ['all selfish', { coordinated: 0, selfish: 1 }]]) {
    for (const d of [25, 45, 60]) {
      const ms = seeds.map(seed => {
        const ring = run({ length: 50 / d * 1000, lanes: 2, types: mixTypes(100, mix, makeRng(seed)), seed, keepLeft: false });
        crashes += ring.crashes;
        worstSplit = Math.max(worstSplit, Math.abs(ring.count[0] - ring.count[1]));
        return ring.stats();
      });
      rows.push({ name, d, flow: mean(ms.map(m => m.flow)), lc: mean(ms.map(m => m.laneChangesPerCarHour)) });
    }
  }
  check('Two-lane ring, symmetric lane changes: no collisions', crashes === 0, `${crashes} collisions in ${rows.length * seeds.length} runs of 100 cars`);
  check('Two-lane ring, symmetric lane changes: the lanes stay balanced', worstSplit <= 20, `largest difference between the lanes: ${worstSplit} cars of 100`);
  const lc = name => mean(rows.filter(r => r.name === name).map(r => r.lc));
  check('Two-lane ring, symmetric lane changes: selfish cars change lane more than coordinated cars', lc('all selfish') > 5 * lc('half coordinated'),
    rows.map(r => `${r.name} at ${r.d}/km/lane: flow ${r.flow.toFixed(0)}, ${r.lc.toFixed(1)} lane changes per car-hour`).join('\n      '));
}

// A seed repeats exactly; another seed differs.
{
  const types = mixTypes(60, { coordinated: 0.3, selfish: 0.3 }, makeRng(9));
  const a = run({ length: 1500, lanes: 2, types, seed: 42 }, 60, 60).stats();
  const b = run({ length: 1500, lanes: 2, types, seed: 42 }, 60, 60).stats();
  const c = run({ length: 1500, lanes: 2, types, seed: 43 }, 60, 60).stats();
  check('A seed repeats exactly, and another seed differs', JSON.stringify(a) === JSON.stringify(b) && a.flow !== c.flow,
    `flow ${a.flow.toFixed(3)}, again ${b.flow.toFixed(3)}, other seed ${c.flow.toFixed(3)}`);
}

// Car counts round as Python does, so the sweep's mixes match the reference model.
{
  const counts = assignTypes(50, 1, [[SELFISH, 0.25], [COORDINATED, 0.75]], makeRng(1)).filter(t => t === SELFISH).length;
  check('Mixes round halves to even, as the reference model does', roundHalfEven(12.5) === 12 && roundHalfEven(7.5) === 8 && counts === 12,
    `25% selfish of 50 cars gives ${counts} selfish cars`);
}

// A tap brakes one car; a wave travels back from it through the cars behind.
{
  const ring = run({ length: 50 / 25 * 1000, types: new Uint8Array(50), seed: 3 }, 120, 0);
  const before = ring.v[0];
  const tenthBehind = ring.order[0][(ring.rank[0] + 40) % 50];   // one lane: the order never changes
  ring.tap(0);
  let slowest = Infinity;
  for (let k = 0; k < 300; k++) {
    ring.step();
    slowest = Math.min(slowest, ring.v[tenthBehind]);
  }
  check('A tap on a car slows the cars behind it', slowest < before - 3,
    `the tapped car was at ${before.toFixed(1)} m/s; the tenth car behind it fell to ${slowest.toFixed(1)} m/s`);
}

// addCar fills the longest gap, and refuses when no gap has room.
{
  const ring = new Ring({ length: 1000, lanes: 2, types: new Uint8Array(20), seed: 1, capacity: 200 });
  let added = 0;
  while (ring.addCar(HUMAN) >= 0) added++;
  for (let k = 0; k < 600; k++) ring.step();
  check('addCar fills gaps until the ring is full, without collisions', added > 100 && ring.crashes === 0,
    `added ${added} cars to 20 on 2 × 1 km; ${ring.crashes} collisions in the next 60 s`);
}

// The settings files name every parameter. The reference file is the
// engine's defaults exactly.
{
  const missingRef = missingParams(REFERENCE), missingUk = missingParams(UK);
  const same = JSON.stringify(makeParams(readSettings(REFERENCE).params)) === JSON.stringify(makeParams());
  check('Each settings file names every parameter, and reference.json is the engine defaults', !missingRef.length && !missingUk.length && same,
    `reference.json leaves out ${missingRef.length}, uk-motorway.json ${missingUk.length}; reference equals the defaults: ${same}`);
}

// The gate's guarantee: the UK population with every spread switched off,
// and its medians and switches set to the reference values, drives exactly
// as the reference model's identical humans.
{
  const p = structuredClone(uk.params), h = p.human;
  for (const name of TRAITS) {
    const spec = h.traits[name];
    if (spec.dist === 'normal') spec.sd = 0;
    if (spec.dist === 'lognormal') spec.sigma = 0;
  }
  h.traits.desiredSpeed.mean = 30;
  h.traits.timeGap.median = 1.2;
  h.traits.acceleration.median = 1.0;
  h.traits.braking.median = 1.5;
  h.traits.reactionTime.median = 0.5;
  Object.assign(h, { reactionAs: 'lag', noise: 0.3, anticipate: 1, distanceError: 0, speedError: 0 });
  p.speedLimit = 30;
  const types = mixTypes(50, { coordinated: 0.2, selfish: 0.2 }, makeRng(4));
  const a = run({ length: 50 / 45 * 1000, types, seed: 8 }, 300, 300).stats();
  const b = run({ length: 50 / 45 * 1000, types, seed: 8, params: p }, 300, 300).stats();
  check('With every spread off, the UK population reproduces the reference humans exactly', JSON.stringify(a) === JSON.stringify(b),
    `flow ${a.flow.toFixed(3)} against ${b.flow.toFixed(3)} veh/h/lane, mixed with 20% coordinated and 20% selfish cars`);
}

// Each trait follows its distribution, and the link sets their correlation.
{
  const n = 20000, h = makeParams(uk.params).human;
  const sorted = a => Float64Array.from(a).sort();
  const at = (a, p) => a[Math.floor(p * (a.length - 1))];
  let worst = 0;
  const lines = [];
  for (const name of TRAITS) {
    const spec = h.traits[name];
    if (spec.dist === 'fixed') continue;
    const drawn = sorted(drawTraits(h, n, makeRng(3))[name]);
    const cells = [0.05, 0.5, 0.95].map(p => [at(drawn, p), traitValue(spec, normalQuantile(p))]);
    for (const [x, y] of cells) worst = Math.max(worst, Math.abs(x / y - 1));
    lines.push(`${name}: ${cells.map(([x, y]) => `${x.toPrecision(3)} (${y.toPrecision(3)})`).join(', ')}`);
  }
  check('Each human trait follows its distribution: 5th, 50th and 95th percentiles within 2%', worst < 0.02,
    `drawn (expected), in SI units, over ${n.toLocaleString('en-GB')} drivers:\n      ${lines.join('\n      ')}`);

  // Spearman's rank correlation; for a link λ between traits with loadings
  // ±1 it should be ±(6/π) asin(λ/2).
  const ranks = a => {
    const idx = Array.from(a, (_, i) => i).sort((i, j) => a[i] - a[j]), r = new Float64Array(a.length);
    idx.forEach((i, k) => { r[i] = k; });
    return r;
  };
  const spearman = (x, y) => {
    const rx = ranks(x), ry = ranks(y), m = (x.length - 1) / 2;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < x.length; i++) { sxy += (rx[i] - m) * (ry[i] - m); sxx += (rx[i] - m) ** 2; }
    return sxy / sxx;
  };
  const rows = [0, 0.5, 1].map(link => {
    const d = drawTraits({ ...h, link }, n, makeRng(5));
    const want = 6 / Math.PI * Math.asin(link / 2);
    return { link, want, fast: spearman(d.desiredSpeed, d.acceleration), gap: spearman(d.desiredSpeed, d.timeGap) };
  });
  check('The link sets the correlation between traits', rows.every(r => Math.abs(r.fast - r.want) < 0.02 && Math.abs(r.gap + r.want) < 0.02),
    rows.map(r => `link ${r.link}: rank correlation of desired speed with acceleration ${r.fast.toFixed(3)}, with time gap ${r.gap.toFixed(3)}, expected ±${r.want.toFixed(3)}`).join('\n      '));
}

// Humans alone from the UK population, against observed motorway
// breakdown: flow peaks near 2,000 veh/h/lane at 30 to 35 per km, waves
// start at 35 to 40 per km and travel back at 15 to 25 km/h, with no
// collisions and almost no braking harder than 0.5 g. Each density is the
// mean of 3 seeds, since the onset moves by a density step from seed to seed.
for (const lanes of [1, 2]) {
  const rows = [20, 25, 30, 35, 40, 45].map(d => {
    const runs = [1, 2, 3].map(seed => {
      const n = 50 * lanes;
      const ring = new Ring({ length: 50 / d * 1000, lanes, types: new Uint8Array(n), seed: hashSeed('check', seed, d, lanes),
        driverSeed: hashSeed('drivers', seed, lanes), keepLeft: true, params: uk.params });
      for (let k = 0; k < 6000; k++) ring.step();
      ring.resetStats();
      const fields = [], braking = new Uint8Array(n);
      let stops = 0;
      for (let k = 0; k < 9000; k++) {
        ring.step();
        if (k % 10 === 0) fields.push(speedField(ring, Math.round(ring.L / 10)));
        for (let i = 0; i < n; i++) {
          const hard = ring.acc[i] < -0.5 * G;
          if (hard && !braking[i]) stops++;
          braking[i] = hard;
        }
      }
      const m = ring.stats();
      return { flow: m.flow, swing: m.speedSwing, wave: waveSpeed(fields, ring.L) * 3.6, crashes: ring.crashes, stops: stops / (n * 900 / 3600) };
    });
    const avg = key => mean(runs.map(r => r[key]));
    return { d, flow: avg('flow'), swing: avg('swing'), wave: avg('wave'), crashes: runs.reduce((a, r) => a + r.crashes, 0), stops: avg('stops') };
  });
  const peak = rows.reduce((a, b) => (b.flow > a.flow ? b : a)), onset = waveOnset(rows);
  const wave = rows[rows.length - 1].wave, crashes = rows.reduce((a, r) => a + r.crashes, 0), stops = mean(rows.map(r => r.stops));
  check(`UK humans alone, ${lanes} lane${lanes > 1 ? 's' : ''}: breakdown as observed on motorways`,
    peak.flow > 1950 && peak.flow < 2200 && peak.d >= 30 && peak.d <= 35 && onset && onset.d >= 35 && onset.d <= 40 &&
    wave < -15 && wave > -25 && crashes === 0 && stops < 2,
    `peak ${peak.flow.toFixed(0)} veh/h/lane at ${peak.d} per km; waves from ${onset ? onset.d : 'none'} per km, travelling at ${wave.toFixed(0)} km/h; ` +
    `${crashes} collisions; ${stops.toFixed(1)} emergency stops per car-hour\n      ` +
    rows.map(r => `${r.d}: flow ${r.flow.toFixed(0)}, swing ${r.swing.toFixed(1)} m/s`).join(' · '));
}

// Keep left. In light traffic most cars use the left lane, and humans
// rarely pass on the left, while selfish cars sometimes do. Without keep
// left, everyone passes on either side.
{
  // Passes on the left per car-hour, by driver type: a car in lane 0 that
  // moves from behind a car in lane 1 to ahead of it, while that car moves
  // faster than queueing traffic.
  const passes = (keepLeft, mix) => {
    const n = 40, ring = new Ring({ length: 2500, lanes: 2, types: mixTypes(n, mix, makeRng(6)), seed: 6, keepLeft, params: uk.params });
    for (let k = 0; k < 3000; k++) ring.step();
    const count = {}, cars = {};
    let left = 0, samples = 0;
    for (let i = 0; i < n; i++) cars[TYPE_NAMES[ring.type[i]]] = (cars[TYPE_NAMES[ring.type[i]]] || 0) + 1;
    const ahead = new Int32Array(n), before = new Float64Array(n);
    for (let k = 0; k < 18000; k++) {
      for (let i = 0; i < n; i++) {
        ahead[i] = ring.lane[i] === 0 ? ring.ahead(1, ring.s[i]) : -1;
        before[i] = ahead[i] < 0 ? 0 : ring.dist(ring.s[i], ring.s[ahead[i]]);
      }
      ring.step();
      for (let i = 0; i < n; i++) {
        const j = ahead[i];
        if (j < 0 || ring.lane[i] !== 0 || ring.lane[j] !== 1 || ring.v[j] <= ring.c.mQueueSpeed) continue;
        if (before[i] < 50 && ring.dist(ring.s[i], ring.s[j]) > ring.L - 50) count[TYPE_NAMES[ring.type[i]]] = (count[TYPE_NAMES[ring.type[i]]] || 0) + 1;
      }
      if (k % 10 === 0) { left += ring.count[0]; samples += n; }
    }
    const rate = type => (count[type] || 0) / ((cars[type] || 1) * 0.5);
    return { left: left / samples, human: rate('human'), selfish: rate('selfish'), crashes: ring.crashes };
  };
  const on = passes(true, { coordinated: 0, selfish: 0 }), off = passes(false, { coordinated: 0, selfish: 0 });
  const mixed = passes(true, { coordinated: 0, selfish: 0.3 });
  check('Keep left: the left lane carries most cars in light traffic', on.left > 0.55 && Math.abs(off.left - 0.5) < 0.05,
    `left-lane share at 8 cars per km per lane: ${(100 * on.left).toFixed(0)}% with keep left, ${(100 * off.left).toFixed(0)}% without`);
  check('Keep left: humans rarely pass on the left, selfish cars sometimes do',
    on.human < 0.3 && off.human > 5 && mixed.selfish > 2 * mixed.human && mixed.selfish > 0.3 && on.crashes + off.crashes + mixed.crashes === 0,
    `passes on the left per car-hour: humans ${on.human.toFixed(2)} with keep left, ${off.human.toFixed(1)} without; ` +
    `with 30% selfish cars, humans ${mixed.human.toFixed(2)}, selfish cars ${mixed.selfish.toFixed(2)}; ` +
    `${on.crashes + off.crashes + mixed.crashes} collisions`);
}

// The Human Driver Model with its authors' parameters (Treiber, Kesting and
// Helbing 2006, Table 1, with 6 cars anticipated and a 1.2 s delay) makes
// stop-and-go waves that travel back at about 15 to 20 km/h, as in their
// paper, without collisions.
{
  const p = structuredClone(uk.params), h = p.human;
  h.link = 0;
  h.traits.desiredSpeed = { dist: 'fixed', value: 128 / 3.6 };
  h.traits.timeGap = { dist: 'fixed', value: 1.1 };
  h.traits.acceleration = { dist: 'fixed', value: 1 };
  h.traits.braking = { dist: 'fixed', value: 1.5 };
  h.traits.reactionTime = { dist: 'fixed', value: 1.2 };
  Object.assign(h, { reactionAs: 'delay', anticipate: 6, distanceError: 0.05, speedError: 0.01, errorTime: 20, noise: 0 });
  const waves = [], swings = [];
  let crashes = 0;
  for (const seed of [1, 2]) {
    const ring = new Ring({ length: 50 / 35 * 1000, types: new Uint8Array(50), seed, params: p });
    for (let k = 0; k < 6000; k++) ring.step();
    ring.resetStats();
    const fields = [];
    for (let k = 0; k < 9000; k++) {
      ring.step();
      if (k % 10 === 0) fields.push(speedField(ring, Math.round(ring.L / 10)));
    }
    waves.push(waveSpeed(fields, ring.L) * 3.6);
    swings.push(ring.stats().speedSwing);
    crashes += ring.crashes;
  }
  const wave = mean(waves), swing = mean(swings);
  check("The Human Driver Model, with its authors' parameters, makes waves that travel back at 10 to 25 km/h",
    swing > 1.5 && wave < -10 && wave > -25 && crashes === 0,
    `at 35 per km: speed swing ${swing.toFixed(1)} m/s, waves at ${wave.toFixed(0)} km/h, ${crashes} collisions`);
}

console.log(failed ? `\n${failed} check${failed > 1 ? 's' : ''} failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
