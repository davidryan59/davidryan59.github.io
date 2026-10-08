/* Calibrates the human population against observed motorway breakdown.
   For each combination of the varied parameters, it runs humans alone on
   the ring over a range of densities, and reports the peak flow, the
   density where waves start, the speed at which waves travel, emergency
   stops and collisions. Each run lasts 1,500 s and measures the last
   900 s, as the sweep does, with 50 cars per lane.

   node tools/traffic-sim/calibrate.js settings.json [--lanes 1,2]
     [--vary human.traits.reactionTime.median=0.8s,1s] [--vary human.anticipate=1,3]
     [--seeds 11,22,33] [--json out.json]

   Each --vary names a parameter by its path in the settings file's params,
   and the values to try, with units as in a settings file. The grid runs
   every combination. Without --vary, the settings file runs as it is.

   Waves start where each car's own speed swings by more than 1.5 m/s, and
   by at least 1.5 times the least swing at any lower density (waves.js).
   The wave speed comes from the densest wavy run between 25 and 50 per km:
   the shift in space that best lines up the speed field of the left lane
   with itself 10 s later. Emergency stops counts each start of braking
   harder than 0.5 g, per car-hour, averaged over every density; real
   drivers almost never brake so hard. */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { readSettings, quantity, G } from '../../app/traffic-sim/engine/settings.js';
import { hashSeed } from '../../app/traffic-sim/engine/rng.js';
import { speedField, waveSpeed, waveOnset } from './waves.js';

const PER_LANE = 50, T_END = 1500, T_WARM = 600;
const DENSITIES = [10, 15, 20, 22.5, 25, 27.5, 30, 32.5, 35, 40, 45, 50, 60];
const CELL = 10;               // metres per cell of the speed field
const EMERGENCY = 0.5 * G;     // braking harder than this counts as an emergency stop

// Sets the parameter at a path such as "human.anticipate" in params.
function setPath(params, path, value) {
  const keys = path.split('.');
  let o = params;
  for (const k of keys.slice(0, -1)) o = o[k] = o[k] || {};
  o[keys[keys.length - 1]] = value;
}

function run({ density, seed, lanes, set, wave }, base) {
  const params = structuredClone(base.params);
  for (const [path, value] of set) setPath(params, path, value);
  const n = PER_LANE * lanes;
  const ring = new Ring({
    length: PER_LANE / density * 1000, lanes, types: new Uint8Array(n),
    seed: hashSeed('calibrate', seed, density, lanes), driverSeed: hashSeed('drivers', seed, lanes),
    keepLeft: base.road.keepLeft, params
  });
  const steps = Math.round(T_END / ring.c.dt), warm = Math.round(T_WARM / ring.c.dt);
  for (let k = 0; k < warm; k++) ring.step();
  ring.resetStats();
  const fields = [], cells = Math.round(ring.L / CELL), braking = new Uint8Array(n);
  let stops = 0;
  for (let k = warm; k < steps; k++) {
    ring.step();
    if (wave && k % 10 === 0) fields.push(speedField(ring, cells));
    for (let i = 0; i < n; i++) {
      const hard = ring.acc[i] < -EMERGENCY;
      if (hard && !braking[i]) stops++;
      braking[i] = hard;
    }
  }
  const m = ring.stats();
  return {
    flow: m.flow, swing: m.speedSwing, crashes: ring.crashes, wave: wave ? waveSpeed(fields, ring.L) : null,
    left: lanes > 1 ? ring.count[0] / n : 1, stops: stops / (n * (T_END - T_WARM) / 3600)
  };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const flag = (name, def) => { const k = args.indexOf(name); return k < 0 ? def : args.splice(k, 2)[1]; };
  const list = (text, def) => text === null ? def : text.split(',').map(Number);
  const lanesList = list(flag('--lanes', null), [1]);
  const seeds = list(flag('--seeds', null), [11, 22, 33]);
  const jsonOut = flag('--json', null);
  const varies = [];
  for (let text; (text = flag('--vary', null)) !== null;) {
    const [path, values] = text.split('=');
    varies.push(values.split(',').map(v => [path, quantity(v), v]));
  }
  const settingsText = readFileSync(args[0], 'utf8');

  // Every combination of the varied values: lists of [path, value, text].
  let grid = [[]];
  for (const options of varies) grid = grid.flatMap(g => options.map(o => [...g, o]));
  const runs = [];
  for (const lanes of lanesList) for (const set of grid) {
    for (const density of DENSITIES) for (const seed of seeds) {
      runs.push({ density, seed, lanes, set, wave: density >= 25 && density <= 50 });
    }
  }
  const results = new Array(runs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), runs.length) }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { settingsText } });
    const feed = () => {
      if (next >= runs.length) { w.terminate(); resolve(); return; }
      const k = next++;
      w.postMessage({ k, r: runs[k] });
    };
    w.on('message', ({ k, result }) => { results[k] = result; feed(); });
    w.on('error', reject);
    feed();
  })));

  const groups = new Map();
  runs.forEach((r, k) => {
    const key = [r.lanes, ...r.set.map(s => s[2])].join('|');
    if (!groups.has(key)) groups.set(key, { ...r, byDensity: new Map() });
    const g = groups.get(key).byDensity;
    if (!g.has(r.density)) g.set(r.density, []);
    g.get(r.density).push(results[k]);
  });
  const mean = (list, key) => list.reduce((a, r) => a + r[key], 0) / list.length;
  const names = varies.map(v => v[0][0].split('.').slice(-2).join('.'));
  console.log(`| Lanes | ${names.map(x => x + ' | ').join('')}Peak flow (veh/h/lane) at density | Waves from (veh/km/lane) | Wave speed (km/h) | Emergency stops per car-hour | Left-lane share at 20 | Collisions |`);
  console.log(`| --- | ${names.map(() => '--- | ').join('')}--- | --- | --- | --- | --- | --- |`);
  const summary = [];
  for (const g of groups.values()) {
    const rows = [...g.byDensity.entries()].map(([d, list]) => ({
      d, flow: mean(list, 'flow'), swing: mean(list, 'swing'), crashes: list.reduce((a, r) => a + r.crashes, 0),
      wave: list[0].wave === null ? null : mean(list, 'wave'), left: mean(list, 'left'), stops: mean(list, 'stops')
    }));
    const peak = rows.reduce((a, b) => (b.flow > a.flow ? b : a));
    const onset = waveOnset(rows);
    const wavy = onset ? rows.filter(r => r.wave !== null && r.d >= onset.d) : [];
    const wave = wavy.length ? wavy[wavy.length - 1].wave * 3.6 : null;
    const crashes = rows.reduce((a, r) => a + r.crashes, 0);
    const stops = mean(rows, 'stops');
    const left = rows.find(r => r.d === 20).left;
    summary.push({ lanes: g.lanes, set: g.set.map(s => [s[0], s[2]]), peak: peak.flow, peakAt: peak.d,
      onset: onset ? onset.d : null, wave, stops, crashes, rows });
    console.log(`| ${g.lanes} | ${g.set.map(s => s[2] + ' | ').join('')}${Math.round(peak.flow)} at ${peak.d} | ${onset ? onset.d : 'none'} | ${wave === null ? '–' : wave.toFixed(0)} | ${stops.toFixed(1)} | ${(100 * left).toFixed(0)}% | ${crashes} |`);
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
} else {
  const base = readSettings(workerData.settingsText);
  parentPort.on('message', ({ k, r }) => parentPort.postMessage({ k, result: run(r, base) }));
}
