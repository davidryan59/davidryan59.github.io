/* Turns a ring sweep's results into the research tables, and compares two
   sweeps cell by cell. It reads the output of sweep.js, or of the Python
   reference model, which writes the same format.

   node tools/traffic-sim/tables.js results.json               the tables
   node tools/traffic-sim/tables.js results.json reference.json  each cell against the reference

   Each cell is the mean of the seeds. Waves start at the first density
   where the spread of speeds passes 1.5 m/s. */

import { readFileSync } from 'node:fs';

const WAVE_SD = 1.5;
const LABELS = ['selfish', 'timid', 'cooperative', 'coordinated', 'absorber'];
const SHARES = [0.02, 0.04, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0];
const SELFISH_SHARES = [0, 0.25, 0.5, 0.75, 1];

function load(file) {
  const groups = new Map();
  for (const r of JSON.parse(readFileSync(file, 'utf8'))) {
    const key = `${r.label}|${r.p}|${r.density}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const densities = [...new Set([...groups.values()].map(g => g[0].density))].sort((a, b) => a - b);
  const mean = (label, p, d, key) => {
    const g = groups.get(`${p === 0 ? 'human' : label}|${p}|${d}`);
    return g ? g.reduce((a, r) => a + r[key], 0) / g.length : NaN;
  };
  const stats = (label, p) => {
    const flows = densities.map(d => mean(label, p, d, 'flow'));
    const k = densities.findIndex(d => mean(label, p, d, 'std_v') > WAVE_SD);
    return { cap: Math.max(...flows), onset: k < 0 ? null : densities[k], q45: mean(label, p, 45, 'flow') };
  };
  const crashes = [...groups.values()].flat().reduce((a, r) => a + r.crashes, 0);
  return { mean, stats, densities, crashes, runs: [...groups.values()].flat().length };
}

const res = load(process.argv[2]);
const ref = process.argv[3] ? load(process.argv[3]) : null;
const fmt = x => Number.isFinite(x) ? Math.round(x).toLocaleString('en-GB') : '–';
const diffs = {};   // table name -> list of [cell, percent difference]

function cell(table, name, x, y) {
  if (!ref) return fmt(x);
  const d = 100 * (x - y) / y;
  (diffs[table] = diffs[table] || []).push([name, d]);
  return `${fmt(x)} (${fmt(y)}, ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%)`;
}
const onsetText = x => x === null ? 'none' : String(x);
const row = cells => console.log(`| ${cells.join(' | ')} |`);
const head = cols => { row(cols); row(cols.map(() => '---')); };
const share = p => `${Math.round(p * 100)}%`;

console.log(`${res.runs} runs, ${res.crashes} collisions` + (ref ? `; reference ${ref.runs} runs, ${ref.crashes} collisions` : ''));
if (ref) console.log('Each cell: this sweep (reference, difference).');

console.log('\nHumans alone by density: flow (veh/h/lane) · speed spread (m/s)');
head(['Density', 'Flow', 'Spread']);
for (const d of res.densities) {
  row([d, cell('human', `human ${d}`, res.mean('human', 0, d, 'flow'), ref && ref.mean('human', 0, d, 'flow')),
    res.mean('human', 0, d, 'std_v').toFixed(2) + (ref ? ` (${ref.mean('human', 0, d, 'std_v').toFixed(2)})` : '')]);
}

console.log('\nFlow at 45 veh/km (veh/h/lane), each behaviour alone');
head(['AV share', ...LABELS]);
row(['0% (humans)', cell('q45', 'human', res.stats('human', 0).q45, ref && ref.stats('human', 0).q45), '', '', '', '']);
for (const p of SHARES) row([share(p), ...LABELS.map(l => cell('q45', `${l} ${share(p)}`, res.stats(l, p).q45, ref && ref.stats(l, p).q45))]);

console.log('\nPeak flow (veh/h/lane), with the density where waves start (veh/km)');
head(['AV share', ...LABELS]);
const onsets = [];
const peak = (l, p) => {
  const a = res.stats(l, p), b = ref && ref.stats(l, p), name = p === 0 ? 'human' : `${l} ${share(p)}`;
  if (b) onsets.push([name, a.onset, b.onset]);
  return `${cell('cap', name, a.cap, b && b.cap)} · ${onsetText(a.onset)}${b ? ` (${onsetText(b.onset)})` : ''}`;
};
row(['0% (humans)', peak('human', 0), '', '', '', '']);
for (const p of SHARES) row([share(p), ...LABELS.map(l => peak(l, p))]);

function mixTable(title, prefix, end, shares) {
  console.log(`\n${title}`);
  head(['AV share', ...SELFISH_SHARES.map(s => `${share(s)} selfish`)]);
  for (const p of shares) {
    row([share(p), ...SELFISH_SHARES.map(sf => {
      const label = sf === 0 ? end : sf === 1 ? 'selfish' : `${prefix}${sf}`;
      return cell('mix', `${label} ${share(p)}`, res.stats(label, p).q45, ref && ref.stats(label, p).q45);
    })]);
  }
}
mixTable('Flow at 45 veh/km: selfish and coordinated self-driving cars', 'mixc_selfish_', 'coordinated', [0.2, 0.5, 1.0]);
mixTable('Flow at 45 veh/km: selfish cars and absorbers', 'mixa_selfish_', 'absorber', [0.1, 0.3]);

console.log('\nHard braking at 45 veh/km (share of time below −2 m/s²) and acceleration energy against humans alone');
head(['Case', 'Hard braking', 'Energy ÷ human']);
const energy = (r, l, p) => r.mean(l, p, 45, 'pke') / r.mean('human', 0, 45, 'pke');
for (const [l, p] of [['human', 0], ['selfish', 0.1], ['selfish', 0.3], ['selfish', 0.5], ['selfish', 1], ['absorber', 0.04]]) {
  const h = res.mean(l, p, 45, 'hard'), e = energy(res, l, p);
  row([`${l} ${share(p)}`, (100 * h).toFixed(1) + '%' + (ref ? ` (${(100 * ref.mean(l, p, 45, 'hard')).toFixed(1)}%)` : ''),
    e.toFixed(2) + (ref ? ` (${energy(ref, l, p).toFixed(2)})` : '')]);
}

if (ref) {
  // Every case at every density, not only the cells in the tables.
  const every = [];
  for (const d of res.densities) {
    for (const l of ['human', ...LABELS]) {
      for (const p of l === 'human' ? [0] : SHARES) {
        every.push([`${l === 'human' ? l : `${l} ${share(p)}`} at ${d}`, 100 * (res.mean(l, p, d, 'flow') / ref.mean(l, p, d, 'flow') - 1)]);
      }
    }
  }
  diffs.every = every;
  console.log('\nDifferences in flow from the reference');
  head(['Cells', 'Count', 'Mean difference', 'Mean size', 'Largest', 'Within 5%']);
  const names = { q45: 'Flow at 45, one behaviour', cap: 'Peak flow', mix: 'Flow at 45, mixes', human: 'Humans by density', every: 'Every case at every density' };
  for (const [key, list] of Object.entries(diffs)) {
    const sizes = list.map(([, d]) => Math.abs(d));
    const worst = list[sizes.indexOf(Math.max(...sizes))];
    row([names[key], list.length,
      `${(list.reduce((a, [, d]) => a + d, 0) / list.length).toFixed(1)}%`,
      `${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}%`,
      `${worst[1].toFixed(1)}% (${worst[0]})`,
      `${sizes.filter(x => x <= 5).length} of ${sizes.length}`]);
  }
  const step = d => res.densities.indexOf(d);
  const same = onsets.filter(([, a, b]) => a === b).length;
  const near = onsets.filter(([, a, b]) => a !== null && b !== null && Math.abs(step(a) - step(b)) === 1).length;
  console.log(`\nWave onset: ${same} of ${onsets.length} cases match, ${near} differ by one density step.`);
  for (const [name, a, b] of onsets) if (a !== b) console.log(`  ${name}: ${onsetText(a)} against ${onsetText(b)}`);
}
