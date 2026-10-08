/* The ring sweep, run on the traffic-sim engine. It covers the same cases
   as the Python reference model behind the research tables: 11 densities,
   humans alone, five kinds of self-driving car at 8 shares, and two
   families of mixes, each with 3 seeds. That is 1,848 runs of 50 cars per
   lane. Each run lasts 1,500 s and measures the last 900 s.

   Run from anywhere:
     node tools/traffic-sim/sweep.js [out.json] [--seeds 11,22,33]
       [--settings file.json] [--lanes 2]
   The settings file sets every driver parameter, and the road's keep-left
   switch; the default is settings/reference.json, the reference model's
   population, which the gate uses. The sweep sets the density, the mix and
   the seeds itself. It uses every core and takes about 15 s on a 10-core
   laptop for one lane of reference drivers. It writes one record per run
   in the reference model's format, so tables.js reads the output of
   either, and a copy of the settings file beside it, as
   out.settings.json. The default output is traffic-sim-sweep.json in the
   current folder. */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { readSettings } from '../../app/traffic-sim/engine/settings.js';
import { assignTypes } from '../../app/traffic-sim/engine/mix.js';
import { makeRng, hashSeed } from '../../app/traffic-sim/engine/rng.js';
import { SELFISH, TIMID, COOPERATIVE, COORDINATED, ABSORBER, TYPE_NAMES } from '../../app/traffic-sim/engine/drivers.js';

const PER_LANE = 50, T_END = 1500, T_WARM = 600;
const REFERENCE = new URL('../../app/traffic-sim/settings/reference.json', import.meta.url);
const DENSITIES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70];
const SHARES = [0.02, 0.04, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0];

function cases(seeds) {
  const runs = [];
  const add = (density, seed, label, p, mix) => runs.push({ density, seed, label, p, mix });
  for (const d of DENSITIES) {
    for (const s of seeds) {
      add(d, s, 'human', 0, []);
      for (const t of [SELFISH, TIMID, COOPERATIVE, COORDINATED, ABSORBER]) {
        for (const p of SHARES) add(d, s, TYPE_NAMES[t], p, [[t, 1]]);
      }
      for (const p of [0.2, 0.5, 1.0]) {
        for (const sf of [0.25, 0.5, 0.75]) add(d, s, `mixc_selfish_${sf}`, p, [[SELFISH, sf], [COORDINATED, 1 - sf]]);
      }
      for (const p of [0.1, 0.3]) {
        for (const sf of [0.25, 0.5, 0.75]) add(d, s, `mixa_selfish_${sf}`, p, [[SELFISH, sf], [ABSORBER, 1 - sf]]);
      }
    }
  }
  return runs;
}

// One run. The cars' places and the drivers' traits depend on the case and
// the seed but not the density, as in the reference model, so a column of
// the tables follows one set of drivers through every density.
function run({ density, seed, label, p, mix }, settings, lanes) {
  const n = PER_LANE * lanes;
  const types = assignTypes(n, p, mix, makeRng(hashSeed('types', label, p, seed)));
  const ring = new Ring({
    length: PER_LANE / density * 1000, lanes, types, seed: hashSeed('ring', label, p, seed, density),
    driverSeed: hashSeed('drivers', label, p, seed), keepLeft: settings.road.keepLeft, params: settings.params
  });
  const steps = Math.round(T_END / ring.c.dt), warm = Math.round(T_WARM / ring.c.dt);
  for (let k = 0; k < warm; k++) ring.step();
  ring.resetStats();
  for (let k = warm; k < steps; k++) ring.step();
  const m = ring.stats();
  return {
    density, label, p, seed,
    mean_v: m.meanSpeed, std_v: m.speedSpread, swing_v: m.speedSwing, flow: m.flow,
    pke: m.energy, hard: m.hardBraking, crashes: ring.crashes
  };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const flag = name => { const k = args.indexOf(name); return k < 0 ? null : args.splice(k, 2)[1]; };
  const seeds = (flag('--seeds') || '11,22,33').split(',').map(Number);
  const settingsText = readFileSync(flag('--settings') || REFERENCE, 'utf8');
  const lanes = Number(flag('--lanes') || 1);
  const out = args[0] || 'traffic-sim-sweep.json';
  writeFileSync(out.replace(/\.json$/, '') + '.settings.json', settingsText);
  const runs = cases(seeds);
  const results = new Array(runs.length);
  const t0 = Date.now();
  let next = 0, done = 0;
  const workers = Math.min(availableParallelism(), runs.length);
  await Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { settingsText, lanes } });
    const feed = () => {
      if (next >= runs.length) { w.terminate(); resolve(); return; }
      const batch = [];
      while (batch.length < 8 && next < runs.length) batch.push(next++);
      w.postMessage(batch.map(k => ({ k, run: runs[k] })));
    };
    w.on('message', list => {
      for (const { k, result } of list) results[k] = result;
      done += list.length;
      if (done % 200 < list.length || done === runs.length) {
        process.stdout.write(`${done}/${runs.length} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
      }
      feed();
    });
    w.on('error', reject);
    feed();
  })));
  writeFileSync(out, JSON.stringify(results));
  const crashes = results.reduce((a, r) => a + r.crashes, 0);
  console.log(`${results.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${crashes} collisions, written to ${out}`);
} else {
  const settings = readSettings(workerData.settingsText);
  parentPort.on('message', list => {
    parentPort.postMessage(list.map(({ k, run: r }) => ({ k, result: run(r, settings, workerData.lanes) })));
  });
}
