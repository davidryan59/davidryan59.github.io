/* Checks for the traffic-sim engine beyond the sweep: the field
   experiments it should echo, the absorber switch, the two-lane ring, a
   seed's repeatability, and the visitor's actions. Each check prints its
   numbers and PASS or FAIL. The script exits with 1 if any check fails.

   Run from anywhere: node tools/traffic-sim/checks.js
   It takes about 15 s. */

import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { mixTypes, assignTypes, roundHalfEven } from '../../app/traffic-sim/engine/mix.js';
import { makeRng } from '../../app/traffic-sim/engine/rng.js';
import { HUMAN, SELFISH, COORDINATED, ABSORBER, P_PLATOON, P_ABSORBER, P_COOPERATIVE } from '../../app/traffic-sim/engine/drivers.js';

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

// The two-lane ring: no collisions, lanes stay balanced, and selfish cars
// (politeness 0) change lane far more often than coordinated cars (politeness 1).
{
  const rows = [];
  let crashes = 0, worstSplit = 0;
  for (const [name, mix] of [['humans', { coordinated: 0, selfish: 0 }], ['half coordinated', { coordinated: 0.5, selfish: 0 }],
    ['half selfish', { coordinated: 0, selfish: 0.5 }], ['all selfish', { coordinated: 0, selfish: 1 }]]) {
    for (const d of [25, 45, 60]) {
      const ms = seeds.map(seed => {
        const ring = run({ length: 50 / d * 1000, lanes: 2, types: mixTypes(100, mix, makeRng(seed)), seed });
        crashes += ring.crashes;
        worstSplit = Math.max(worstSplit, Math.abs(ring.count[0] - ring.count[1]));
        return ring.stats();
      });
      rows.push({ name, d, flow: mean(ms.map(m => m.flow)), lc: mean(ms.map(m => m.laneChangesPerCarHour)) });
    }
  }
  check('Two-lane ring: no collisions', crashes === 0, `${crashes} collisions in ${rows.length * seeds.length} runs of 100 cars`);
  check('Two-lane ring: the lanes stay balanced', worstSplit <= 20, `largest difference between the lanes: ${worstSplit} cars of 100`);
  const lc = name => mean(rows.filter(r => r.name === name).map(r => r.lc));
  check('Two-lane ring: selfish cars change lane more than coordinated cars', lc('all selfish') > 5 * lc('half coordinated'),
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

console.log(failed ? `\n${failed} check${failed > 1 ? 's' : ''} failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
