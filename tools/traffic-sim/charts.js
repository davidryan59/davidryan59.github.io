/* Preliminary flow charts from the traffic-sim engine: humans on one and
   two lanes, adoption of Coordinated Mode, Selfish Mode at full adoption,
   and every mix of the three driver types in steps of 10%.

   Run from anywhere: node tools/traffic-sim/charts.js [--render]
   With --render, it rebuilds only the HTML page from the saved runs.json.
   The runs use every core, the app's UK motorway drivers and a 2 km ring
   with the extra lane off. The script checks steady flow at the heaviest
   densities before running the rest of the grid. It writes every run,
   four CSV files and a standalone HTML page to renders/charts/. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { performance } from 'node:perf_hooks';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { COORDINATED, SELFISH } from '../../app/traffic-sim/engine/drivers.js';
import { assignTypes } from '../../app/traffic-sim/engine/mix.js';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { hashSeed, makeRng } from '../../app/traffic-sim/engine/rng.js';
import { readSettings } from '../../app/traffic-sim/engine/settings.js';

const SETTINGS = '../../app/traffic-sim/settings/uk-motorway.json';
const OUTPUT = new URL('renders/charts/', import.meta.url);
// Match the road defaults in app/traffic-sim/app.js, with the extra lane off.
const ROAD = { length: 2000, extraLane: false, keepLeft: true, absorb: false };
const BIN_SECONDS = 60;
const LIMIT = 0.02;
const INITIAL = { warmupSeconds: 600, measurementSeconds: 1800, seedCount: 5 };
const HEAVY_DENSITY = 100;
const MIX_DENSITIES = [40, HEAVY_DENSITY];
const HUMAN_DENSITIES = [1, 2, ...Array.from({ length: 32 }, (_, i) => (i + 1) * 5)];
const PERCENTAGES = Array.from({ length: 11 }, (_, i) => i * 10);

function chartCases() {
  const cases = new Map();
  const point = (x, lanes, density, coordinated = 0, selfish = 0) => {
    const id = [lanes, density, coordinated, selfish].join('/');
    if (!cases.has(id)) {
      cases.set(id, {
        id, lanes, density, human: 100 - coordinated - selfish, coordinated, selfish,
        cars: Math.round(density * ROAD.length / 1000 * lanes)
      });
    }
    return { x, id };
  };

  const humans = {
    name: 'humans-by-density', title: 'Flow with human drivers',
    xLabel: 'Density (cars per km per lane)', maxX: 160, tickX: 20,
    series: [1, 2].map(lanes => ({
      label: lanes === 1 ? '1 lane' : '2 lanes',
      points: HUMAN_DENSITIES.map(density => point(density, lanes, density))
    }))
  };
  const adoption = {
    name: 'coordinated-adoption', title: 'From human to Coordinated',
    xLabel: 'Self-driving share (%)', maxX: 100, tickX: 20,
    series: MIX_DENSITIES.map(density => ({
      label: `${density} cars per km per lane`,
      points: PERCENTAGES.map(share => point(share, 1, density, share))
    }))
  };
  const selfish = {
    name: 'selfish-at-full-adoption', title: 'Selfish share at full adoption',
    xLabel: 'Selfish share (%)', maxX: 100, tickX: 20,
    series: MIX_DENSITIES.map(density => ({
      label: `${density} cars per km per lane`,
      points: PERCENTAGES.map(share => point(share, 1, density, 100 - share, share))
    }))
  };
  const triangle = PERCENTAGES.flatMap(coordinated => PERCENTAGES
    .filter(selfish => coordinated + selfish <= 100)
    .map(selfish => point(null, 1, HEAVY_DENSITY, coordinated, selfish).id));

  return { cases, lines: [humans, adoption, selfish], triangle };
}

function run({ scenario, seed, warmupSeconds, measurementSeconds }, settings) {
  const { id, lanes, cars, coordinated, selfish } = scenario;
  const av = coordinated + selfish;
  const mix = av ? [[SELFISH, selfish / av], [COORDINATED, coordinated / av]] : [];
  const types = assignTypes(cars, av / 100, mix, makeRng(hashSeed('cars', seed, cars)));
  const ring = new Ring({ ...ROAD, lanes, types, seed, params: settings.params });

  const warmupSteps = Math.round(warmupSeconds / ring.c.dt);
  for (let step = 0; step < warmupSteps; step++) ring.step();
  ring.resetStats();
  const binSteps = Math.round(BIN_SECONDS / ring.c.dt);
  const flowBins = [];
  let stats, previous = 0;
  for (let bin = 1; bin <= measurementSeconds / BIN_SECONDS; bin++) {
    for (let step = 0; step < binSteps; step++) ring.step();
    stats = ring.stats();
    // Subtract the previous cumulative flow sum to get this bin's mean.
    const cumulative = stats.flow * bin;
    flowBins.push(cumulative - previous);
    previous = cumulative;
  }
  return {
    caseId: id, seed, warmupSeconds, measurementSeconds, flow: stats.flow, flowBins,
    crashes: stats.crashes, crashesIncludingWarmup: ring.crashes
  };
}

function runBatch(jobs, settingsText) {
  const results = new Array(jobs.length);
  const start = performance.now();
  let next = 0, done = 0;
  const count = Math.min(availableParallelism(), jobs.length);
  const workers = Array.from({ length: count }, () =>
    new Worker(new URL(import.meta.url), { workerData: settingsText }));
  const work = worker => new Promise((resolve, reject) => {
    const feed = () => {
      if (next === jobs.length) return resolve();
      const index = next++;
      worker.postMessage({ index, job: jobs[index] });
    };
    worker.on('message', ({ index, result }) => {
      results[index] = result;
      done++;
      if (done % 100 === 0 || done === jobs.length) {
        console.log(`${done}/${jobs.length} runs in ${((performance.now() - start) / 1000).toFixed(1)} s`);
      }
      feed();
    });
    worker.on('error', reject);
    worker.on('exit', code => reject(new Error(`Worker exited early with code ${code}`)));
    feed();
  });
  return Promise.all(workers.map(work))
    .then(() => results)
    .finally(() => Promise.all(workers.map(worker => worker.terminate())));
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function summarise(runs) {
  const flows = runs.map(run => run.flow);
  const flow = mean(flows);
  const variance = flows.reduce((sum, value) => sum + (value - flow) ** 2, 0) / (runs.length - 1);
  const standardError = Math.sqrt(variance / runs.length);
  const halfway = runs[0].flowBins.length / 2;
  const firstHalf = mean(runs.map(run => mean(run.flowBins.slice(0, halfway))));
  const secondHalf = mean(runs.map(run => mean(run.flowBins.slice(halfway))));
  return {
    flow, min: Math.min(...flows), max: Math.max(...flows), standardError, firstHalf, secondHalf,
    relativeDrift: flow ? Math.abs(firstHalf - secondHalf) / flow : 0,
    relativeStandardError: flow ? standardError / flow : 0
  };
}

async function measure(cases, settingsText) {
  const scenarios = [...cases.values()];
  const high = scenarios.filter(({ density }) => density === HUMAN_DENSITIES.at(-1) || density === HEAVY_DENSITY);
  const protocols = Object.fromEntries(scenarios.map(({ id }) => [id, { ...INITIAL }]));
  const current = Object.fromEntries(scenarios.map(({ id }) => [id, []]));
  const runs = [];
  async function sample(scenarios) {
    // Send the slow two-lane cases first, so they can finish during the batch.
    const order = [...scenarios].sort((a, b) => b.cars * b.lanes - a.cars * a.lanes);
    const jobs = [];
    for (const scenario of order) {
      const { warmupSeconds, measurementSeconds, seedCount } = protocols[scenario.id];
      for (let seed = current[scenario.id].length + 1; seed <= seedCount; seed++) {
        jobs.push({ scenario, seed, warmupSeconds, measurementSeconds });
      }
    }
    for (const run of await runBatch(jobs, settingsText)) {
      runs.push(run);
      current[run.caseId].push(run);
    }
  }

  const trials = [];
  let pending = high;
  console.log(`Initial steady-state check: ${INITIAL.warmupSeconds} s warm-up, ${INITIAL.measurementSeconds} s measurement, ${INITIAL.seedCount} seeds`);
  while (pending.length) {
    await sample(pending);
    pending = pending.filter(({ id }) => {
      const protocol = protocols[id];
      const summary = summarise(current[id]);
      const { relativeDrift, relativeStandardError } = summary;
      trials.push({ id, ...protocol, ...summary });
      if (relativeDrift <= LIMIT && relativeStandardError < LIMIT) return false;

      if (relativeStandardError >= LIMIT) {
        // Standard error falls with the square root of the seed count.
        const estimate = Math.ceil(protocol.seedCount * (relativeStandardError / (0.98 * LIMIT)) ** 2);
        protocol.seedCount = Math.min(protocol.seedCount * 8, estimate);
      } else {
        protocol.warmupSeconds *= 2;
        protocol.measurementSeconds *= 2;
        current[id] = [];
      }
      console.log(`${id}: ${(relativeDrift * 100).toFixed(3)}% drift and ${(relativeStandardError * 100).toFixed(3)}% relative standard error. Next: ${protocol.seedCount} seeds, ${protocol.warmupSeconds} s warm-up, ${protocol.measurementSeconds} s measurement`);
      return true;
    });
  }

  console.log('Running the remaining chart points');
  await sample(scenarios);
  const summaries = Object.fromEntries(scenarios.map(({ id }) => [id, summarise(current[id])]));
  return { protocols, trials, runs, summaries };
}

function write(name, contents) {
  writeFileSync(new URL(name, OUTPUT), contents);
}

function csv(ids, cases, { protocols, summaries }) {
  const unit = 'veh_per_hour_per_lane';
  const header = [
    'lanes', 'density_cars_per_km_per_lane', 'cars', 'human_share_pct', 'self_driving_share_pct',
    'coordinated_share_pct', 'selfish_share_pct', 'warmup_seconds', 'measurement_seconds', 'seed_count',
    ...['mean', 'min', 'max', 'standard_error'].map(stat => `${stat}_flow_${unit}`)
  ];
  const rows = ids.map(id => {
    const { lanes, density, cars, human, coordinated, selfish } = cases.get(id);
    const { flow, min, max, standardError } = summaries[id];
    const { warmupSeconds, measurementSeconds, seedCount } = protocols[id];
    return [lanes, density, cars, human, coordinated + selfish, coordinated, selfish, warmupSeconds, measurementSeconds, seedCount,
      flow, min, max, standardError];
  });
  return [header, ...rows].map(row => row.join(',')).join('\n') + '\n';
}

const FLOW_LABEL = 'Flow (vehicles per hour per lane)';
const number = value => Math.round(value).toLocaleString('en-GB', { useGrouping: Math.abs(value) >= 10000 });

function tickStep(range) {
  const target = range / 4;
  const power = 10 ** Math.floor(Math.log10(target));
  return power * [1, 2, 2.5, 5, 10].find(step => step * power >= target);
}

function lineChart(chart, summaries, yStep, yMax) {
  const left = 52, right = 403, top = 32, bottom = 216;
  const x = value => left + (right - left) * value / chart.maxX;
  const y = value => bottom - (bottom - top) * value / yMax;
  const grid = [];
  for (let value = 0; value <= yMax; value += yStep) {
    grid.push(`<path class="grid" d="M ${left} ${y(value)} H ${right}"/>
      <text x="${left - 8}" y="${y(value)}" dy=".35em" text-anchor="end">${number(value)}</text>`);
  }
  for (let value = 0; value <= chart.maxX; value += chart.tickX) {
    grid.push(`<path class="grid" d="M ${x(value)} ${top} V ${bottom}"/>
      <text x="${x(value)}" y="${bottom + 20}" text-anchor="middle">${number(value)}</text>`);
  }
  const path = (points, field) => points.map(point =>
    `${x(point.x).toFixed(2)} ${y(summaries[point.id][field]).toFixed(2)}`).join(' L ');
  const bands = chart.series.map(({ points }, i) =>
    `<path class="s${i} band" d="M ${path(points, 'max')} L ${path(points.toReversed(), 'min')} Z"/>`);
  const lines = chart.series.map(({ points }, i) =>
    `<path class="s${i} line" d="M ${path(points, 'flow')}"/>`);
  return `<svg viewBox="0 0 425 269" role="img" aria-label="${chart.title}. ${FLOW_LABEL} by ${chart.xLabel}.">
    <text class="axis-label" x="${left}" y="17">${FLOW_LABEL}</text>
    ${grid.join('\n')}
    <path class="axis" d="M ${left} ${top} V ${bottom} H ${right}"/>
    ${bands.join('\n')}
    ${lines.join('\n')}
    <text class="axis-label" x="${(left + right) / 2}" y="260" text-anchor="middle">${chart.xLabel}</text>
  </svg>`;
}

// Flow colours run from red (lowest) through blue to green (highest).
const COLOURS = ['#c0392b', '#2563c9', '#1e9e4a'];

function mixColour(fraction) {
  const t = Math.max(0, Math.min(1, fraction));
  const position = t * (COLOURS.length - 1);
  const index = Math.min(Math.floor(position), COLOURS.length - 2);
  const from = COLOURS[index].slice(1).match(/../g);
  const to = COLOURS[index + 1].slice(1).match(/../g);
  const channels = from.map((hex, i) => {
    const start = parseInt(hex, 16);
    return Math.round(start + (parseInt(to[i], 16) - start) * (position - index));
  });
  return `rgb(${channels.join(', ')})`;
}

const BAND = 100, LABEL_EVERY = 200;

// Keeps the part of a polygon of [x, y, flow] vertices where sign * (flow - level) >= 0.
function clip(polygon, level, sign) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = sign * (a[2] - level), db = sign * (b[2] - level);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, level]);
    }
  }
  return out;
}

function triangleChart(ids, cases, summaries) {
  const point = (coordinated, selfish) => [82 + coordinated * 1.3 + selfish * 2.6, 274 - coordinated * 2.25];
  const segment = (a, b) => `<path class="grid" d="M ${a.join(' ')} L ${b.join(' ')}"/>`;
  const tick = ([x, y], value, anchor) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" dy=".35em">${value}%</text>`;
  const fmt = v => v.toFixed(2);

  const lattice = new Map();
  for (const id of ids) {
    const { coordinated, selfish } = cases.get(id);
    lattice.set(`${coordinated / 10},${selfish / 10}`, { id, xy: point(coordinated, selfish), flow: summaries[id].flow });
  }
  const vertex = (i, j) => { const v = lattice.get(`${i},${j}`); return [...v.xy, v.flow]; };
  const cells = [];
  for (let i = 0; i < 10; i++) {
    for (let j = 0; i + j < 10; j++) {
      cells.push([vertex(i, j), vertex(i + 1, j), vertex(i, j + 1)]);
      if (i + j < 9) cells.push([vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)]);
    }
  }

  const flows = ids.map(id => summaries[id].flow);
  const min = Math.floor(Math.min(...flows) / BAND) * BAND;
  const max = Math.ceil(Math.max(...flows) / BAND) * BAND;
  const colourAt = flow => mixColour((flow - min) / (max - min));

  const bands = [];
  for (let lo = min; lo < max; lo += BAND) {
    const colour = colourAt(lo + BAND / 2);
    for (const cell of cells) {
      const piece = clip(clip(cell, lo, 1), lo + BAND, -1);
      if (piece.length < 3) continue;
      const d = 'M ' + piece.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ') + ' Z';
      bands.push(`<path d="${d}" fill="${colour}" stroke="${colour}" stroke-width=".6"/>`);
    }
  }

  const lines = [], labels = [];
  for (let level = min + BAND; level < max; level += BAND) {
    const segments = [];
    for (const cell of cells) {
      const hits = [];
      for (let k = 0; k < 3; k++) {
        const a = cell[k], b = cell[(k + 1) % 3];
        const fa = a[2] - level - 1e-9, fb = b[2] - level - 1e-9;
        if ((fa >= 0) !== (fb >= 0)) {
          const t = fa / (fa - fb);
          hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      if (hits.length === 2) segments.push(hits);
    }
    if (!segments.length) continue;
    const major = level % LABEL_EVERY === 0;
    lines.push(`<path class="contour${major ? ' major' : ''}" d="${segments.map(([a, b]) =>
      `M ${fmt(a[0])} ${fmt(a[1])} L ${fmt(b[0])} ${fmt(b[1])}`).join(' ')}"/>`);
    if (!major) continue;
    // Label the segment nearest the middle of the line, turned to lie along it.
    const mids = segments.map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const cx = mean(mids.map(m => m[0])), cy = mean(mids.map(m => m[1]));
    let best = 0;
    mids.forEach((m, k) => { if (Math.hypot(m[0] - cx, m[1] - cy) < Math.hypot(mids[best][0] - cx, mids[best][1] - cy)) best = k; });
    const [[ax, ay], [bx, by]] = segments[best];
    let angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const [mx, my] = mids[best];
    labels.push(`<text class="contour-label" x="${fmt(mx)}" y="${fmt(my)}" dy=".35em" text-anchor="middle"
      transform="rotate(${angle.toFixed(1)} ${fmt(mx)} ${fmt(my)})">${number(level)}</text>`);
  }

  const grid = [];
  for (let share = 20; share < 100; share += 20) {
    const [cx, cy] = point(share, 0);
    const [sx, sy] = point(100 - share, share);
    const [hx, hy] = point(0, 100 - share);
    grid.push(tick([cx - 10, cy - 3], share, 'end'));
    grid.push(tick([sx + 10, sy - 3], share, 'start'));
    grid.push(tick([hx, hy + 17], share, 'middle'));
  }

  const targets = ids.map(id => {
    const { human, coordinated, selfish } = cases.get(id);
    const { flow, min: low, max: high } = summaries[id];
    const [x, y] = point(coordinated, selfish);
    return `<g class="mix-target"><circle cx="${x}" cy="${y}" r="9" fill="transparent"/><circle class="mix-dot" cx="${x}" cy="${y}" r="1.6"/>
      <title>Human ${human}%, Coordinated ${coordinated}%, Selfish ${selfish}%. Flow ${number(flow)} (seed range ${number(low)} – ${number(high)})</title></g>`;
  });

  const scale = [];
  const span = max - min, x0 = 56, width = 312;
  for (let lo = min; lo < max; lo += BAND) {
    scale.push(`<rect x="${fmt(x0 + width * (lo - min) / span)}" y="352" width="${fmt(width * BAND / span + .3)}" height="16" fill="${colourAt(lo + BAND / 2)}"/>`);
  }
  const scaleLabels = [];
  for (let flow = Math.ceil(min / LABEL_EVERY) * LABEL_EVERY; flow <= max; flow += LABEL_EVERY) {
    scaleLabels.push(`<text x="${fmt(x0 + width * (flow - min) / span)}" y="386" text-anchor="middle">${number(flow)}</text>`);
  }

  return `<svg viewBox="0 0 425 395" role="img" aria-label="Contour plot of mean flow by human, Coordinated and Selfish shares">
    ${bands.join('\n')}
    ${lines.join('\n')}
    <path class="axis" d="M 82 274 L 212 49 L 342 274 Z"/>
    ${labels.join('\n')}
    ${targets.join('\n')}
    ${grid.join('\n')}
    <text class="axis-label" x="212" y="31" text-anchor="middle">Coordinated (%)</text>
    <text class="axis-label" x="82" y="318" text-anchor="middle">Human (%)</text>
    <text class="axis-label" x="342" y="318" text-anchor="middle">Selfish (%)</text>
    <text class="axis-label" x="212" y="344" text-anchor="middle">${FLOW_LABEL}</text>
    ${scale.join('\n')}
    ${scaleLabels.join('\n')}
  </svg>`;
}

function page({ lines, triangle, cases }, { protocols, summaries }) {
  const maxFlow = charts => Math.max(...charts.flatMap(chart => chart.series.flatMap(({ points }) =>
    points.map(({ id }) => summaries[id].max))));
  const cards = lines.map((chart, index) => {
    const limit = maxFlow(index === 0 ? [chart] : lines.slice(1));
    const step = tickStep(limit);
    const legend = chart.series.map(({ label }, i) => `<li class="s${i}">${label}</li>`).join('');
    return `<section>
      <h2>${chart.title}</h2>
      ${index > 0 ? '<p class="detail">1 lane</p>' : ''}
      ${lineChart(chart, summaries, step, Math.ceil(limit / step) * step)}
      <ul class="legend" aria-label="Series">${legend}</ul>
    </section>`;
  });
  const exceptions = [...cases.values()].filter(({ id }) =>
    Object.keys(INITIAL).some(key => protocols[id][key] !== INITIAL[key]));
  const details = exceptions.length ? `<details>
      <summary>Points that used longer runs or more seeds</summary>
      <ul>${exceptions.map(({ id, lanes, density, human, coordinated, selfish }) => {
        const { warmupSeconds, measurementSeconds, seedCount } = protocols[id];
        return `<li>${lanes} ${lanes === 1 ? 'lane' : 'lanes'}, ${density} cars per km per lane,
          ${human}% Human, ${coordinated}% Coordinated, ${selfish}% Selfish – ${number(warmupSeconds)} s warm-up,
          ${number(measurementSeconds)} s measurement, ${number(seedCount)} seeds.</li>`;
      }).join('')}</ul>
    </details>` : '';
  return `<!doctype html>
<html lang="en-GB">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Traffic flow on a ring road</title>
<style>
  :root { color-scheme: light dark; --bg: #eef2f5; --panel: #fff; --text: #172737; --quiet: #495e72;
    --grid: #d9e1e8; --a: #185b9c; --b: #9d4426; --point-outline: #283745; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #121a23; --panel: #1a2530; --text: #eef4fa; --quiet: #b2c4d5;
      --grid: #394b5c; --a: #85bcf1; --b: #ffa57e; --point-outline: #c9d6e2; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 1rem/1.45 system-ui, sans-serif; }
  main { max-width: 72rem; margin: auto; padding: clamp(.5rem, 2.5vw, 1.75rem); }
  header { margin: .75rem .375rem 1.25rem; }
  h1, h2, p { margin: 0; }
  h1 { font-size: clamp(1.65rem, 4vw, 2.35rem); line-height: 1.15; margin-bottom: .6rem; }
  h2 { font-size: clamp(1.1rem, 2.7vw, 1.3rem); line-height: 1.2; }
  p { color: var(--quiet); }
  header p + p { margin-top: .35rem; }
  details { margin-top: .35rem; font-size: .875rem; }
  .charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  section { padding: clamp(.6rem, 1.8vw, 1.125rem); border-radius: .5rem; background: var(--panel); }
  section svg { display: block; width: 100%; height: auto; margin: .6rem 0 0; }
  .detail { font-size: .875rem; margin-top: .3rem; }
  svg text { fill: var(--quiet); font-size: 15px; }
  svg .axis-label { fill: var(--text); font-size: 16px; font-weight: 600; }
  .grid, .axis, .line { fill: none; }
  .grid { stroke: var(--grid); }
  .axis { stroke: var(--quiet); }
  .s0 { --series: var(--a); }
  .s1 { --series: var(--b); }
  .band { fill: var(--series); opacity: .19; }
  .line { stroke: var(--series); stroke-width: 2.5; stroke-linejoin: round; }
  .s1.line { stroke-dasharray: 6 4; }
  .contour { fill: none; stroke: rgba(255, 255, 255, .55); stroke-width: .8; }
  .contour.major { stroke: rgba(255, 255, 255, .9); stroke-width: 1.6; }
  svg .contour-label { fill: #fff; font-size: 12px; font-weight: 700; paint-order: stroke;
    stroke: rgba(0, 0, 0, .55); stroke-width: 2.5px; stroke-linejoin: round; }
  .mix-dot { fill: rgba(255, 255, 255, .7); }
  .mix-target:hover .mix-dot { fill: #fff; r: 3.5; }
  .legend { display: flex; flex-wrap: wrap; gap: .35rem 1.1rem; margin: .5rem 0 0; padding: 0; list-style: none; }
  .legend li { display: flex; align-items: center; gap: .45rem; font-size: .875rem; }
  .legend li::before { content: ""; width: 1.45rem; border-top: 3px solid var(--series); }
  .legend .s1::before { border-top-style: dashed; }
  @media (max-width: 46rem) { .charts { grid-template-columns: minmax(0, 1fr); } }
</style>
<main>
  <header>
    <h1>Traffic flow on a ring road</h1>
    <p>Preliminary results for a 2 km ring with UK motorway driver settings. Keep left on, absorber off and extra lane off.</p>
    <p>${number(INITIAL.warmupSeconds)} s warm-up, ${number(INITIAL.measurementSeconds)} s measurement and ${number(INITIAL.seedCount)} seeds per point${exceptions.length ? ' for most points' : ''}. Lines show the mean and bands span the lowest to highest seed flow.</p>
    ${details}
  </header>
  <div class="charts">
    ${cards.join('\n')}
    <section>
      <h2>Flow by driver mix</h2>
      <p class="detail">1 lane, 100 cars per km per lane. Each corner is 100% of its driver type. Bands are 100 vehicles per hour per lane wide, with labelled lines every 200. Dots mark the 66 measured mixes.</p>
      ${triangleChart(triangle, cases, summaries)}
    </section>
  </div>
</main>
</html>
`;
}

async function main() {
  const started = performance.now();
  if (process.argv.includes('--render')) {
    const saved = JSON.parse(readFileSync(new URL('runs.json', OUTPUT), 'utf8'));
    write('index.html', page(chartCases(), saved));
    console.log(`Rebuilt index.html from runs.json in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return;
  }
  const settingsText = readFileSync(new URL(SETTINGS, import.meta.url), 'utf8');
  const charts = chartCases();
  const results = await measure(charts.cases, settingsText);
  mkdirSync(OUTPUT, { recursive: true });
  write('runs.json', JSON.stringify({
    road: ROAD, settings: JSON.parse(settingsText), binSeconds: BIN_SECONDS,
    flowUnit: 'vehicles per hour per lane', cases: [...charts.cases.values()], ...results
  }));
  for (const { name, series } of charts.lines) {
    write(`${name}.csv`, csv(series.flatMap(({ points }) => points.map(({ id }) => id)), charts.cases, results));
  }
  write('driver-mix.csv', csv(charts.triangle, charts.cases, results));
  write('index.html', page(charts, results));
  console.log(`${results.runs.length} runs across all trials in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

if (isMainThread) {
  await main();
} else {
  const settings = readSettings(workerData);
  parentPort.on('message', ({ index, job }) => parentPort.postMessage({ index, result: run(job, settings) }));
}
