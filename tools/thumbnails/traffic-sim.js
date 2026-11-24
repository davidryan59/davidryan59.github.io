/* The builder page's traffic-sim thumbnails, light and dark: the app's own
   countryside, road and trees as a still, with the cars on top as dots that
   change colour with speed, from red when stopped to pale when free.

   The road and traffic are the app's defaults: 2 km, two lanes and the
   extra lane, 60 cars per km of lane, 10% self-driving and 20% of those
   selfish, with the UK human population. The engine runs here in Node. The
   still comes from the real app in a browser, so serve the repository
   root first:
     python3 -m http.server 8123
     node tools/thumbnails/traffic-sim.js
   APP_URL and CHROMIUM override the local URL and browser executable. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { readSettings } from '../../app/traffic-sim/engine/settings.js';
import { SELFISH, COORDINATED } from '../../app/traffic-sim/engine/drivers.js';
import { assignTypes } from '../../app/traffic-sim/engine/mix.js';
import { makeRng } from '../../app/traffic-sim/engine/rng.js';
import { makeOval } from '../../app/traffic-sim/view.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const APP_URL = process.env.APP_URL || 'http://localhost:8123/app/traffic-sim/';
const length = 2000, lanes = 2, density = 60, av = 0.10, selfish = 0.20;
const PLAY = 30;        // seconds the loop takes on screen
const FRAME = 0.5;      // seconds of traffic between frames
const SIZE = 120, STILL = 240;

// The traffic, from the engine.
const uk = readSettings(readFileSync(new URL('../../app/traffic-sim/settings/uk-motorway.json', import.meta.url), 'utf8'));
const count = density * lanes * length / 1000;
const types = assignTypes(count, av, [[SELFISH, selfish], [COORDINATED, 1 - selfish]], makeRng(5));
const ring = new Ring({ length, lanes, extraLane: true, types, seed: 5, params: uk.params });
const oval = makeOval(length, lanes, ring.extraEnd, ring.extraGain, ring.extraDrop);
for (let k = 0; k < 6000; k++) ring.step();
const frames = [];
for (let f = 0; f <= 480; f++) {
  frames.push({ s: ring.s.slice(0, count), v: ring.v.slice(0, count), lane: ring.lane.slice(0, count) });
  for (let k = 0; k < FRAME / ring.c.dt; k++) ring.step();
}

// A cut where the pattern of cars comes back to its start. Cars are
// interchangeable at the cut, so the search matches them by order round
// the ring, then eases each car onto its match over the last few frames.
const first = frames[0];
const near = (a, b) => { const d = a - b; return d - Math.round(d / length) * length; };
const byPosition = frame => [...frame.s.keys()].sort((a, b) => frame.s[a] - frame.s[b]);
const startOrder = byPosition(first);
let best = { error: Infinity };
for (let f = 240; f < frames.length; f++) {
  const end = frames[f], sorted = byPosition(end);
  for (let shift = -3; shift <= 3; shift++) {
    let error = 0;
    for (let k = 0; k < count; k++) {
      const a = startOrder[k], b = sorted[(k + shift + count) % count];
      error += near(first.s[a], end.s[b]) ** 2 + 3 * (first.v[a] - end.v[b]) ** 2;
    }
    if (error < best.error) best = { error, f, shift, sorted };
  }
}

// The still, and the camera that drew it, from the real app.
async function still(dark) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: STILL, height: STILL }, colorScheme: dark ? 'dark' : 'light' });
    const url = new URL(APP_URL);
    // One car per km of lane, too small to see at this size.
    url.hash = `length=${length}&lanes=${lanes}&extra=1&density=1&speed=1&camera=top&seed=5`;
    await page.goto(url.href);
    await page.waitForFunction(() => window.trafficSim);
    await page.evaluate(() => document.getElementById('run').click());
    await page.addStyleTag({ content: '.card, .map-tools, .gesture-hint { display: none !important; }' });
    // With the controls hidden, the app frames the road in the whole still.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(2500);
    const viewProj = await page.evaluate(() => Array.from(window.trafficSim.view.camera().viewProj));
    const image = await page.screenshot({ type: 'jpeg', quality: 80 });
    return { image, viewProj };
  } finally {
    await browser.close();
  }
}

function makeThumbnail({ image, viewProj: m }, palette) {
  const project = (x, z) => {
    const cx = m[0] * x + m[8] * z + m[12], cy = m[1] * x + m[9] * z + m[13], w = m[3] * x + m[11] * z + m[15];
    return [((cx / w + 1) / 2 * SIZE).toFixed(1), ((1 - cy / w) / 2 * SIZE).toFixed(1)];
  };
  const colour = speed => {
    const t = Math.min(1, Math.max(0, (speed - 2) / 22));
    return '#' + palette.slow.map((v, i) => Math.round(v + (palette.fast[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const samples = 48, cars = [];
  for (let k = 0; k < count; k++) {
    const car = best.sorted[(k + best.shift + count) % count], start = startOrder[k];
    const positions = [], colours = [];
    for (let q = 0; q <= samples; q++) {
      const progress = q / samples, frame = frames[Math.round(progress * best.f)];
      const join = Math.max(0, (progress - 0.92) / 0.08) ** 2;
      const s = frame.s[car] + join * near(first.s[start], frames[best.f].s[car]);
      const d0 = oval.laneOffset(frame.lane[car], frame.s[car]);
      const d = d0 + join * (oval.laneOffset(first.lane[start], first.s[start]) - d0);
      const v = frame.v[car] + join * (first.v[start] - frames[best.f].v[car]);
      const [x, z] = oval.at(s / length, d);
      positions.push(project(x, z).join(' '));
      colours.push(colour(v));
    }
    cars.push(`<circle r="0.95" fill="${colours[0]}" transform="translate(${positions[0]})"><animateTransform attributeName="transform" type="translate" values="${positions.join(';')}" dur="${PLAY}s" repeatCount="indefinite"/><animate attributeName="fill" values="${colours.join(';')}" dur="${PLAY}s" repeatCount="indefinite"/></circle>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<title>Traffic queueing where a lane ends, on a motorway ring among fields and woods</title>
<image width="${SIZE}" height="${SIZE}" href="data:image/jpeg;base64,${image.toString('base64')}"/>
${cars.join('\n')}
</svg>\n`;
}

for (const [suffix, dark, palette] of [
  ['', false, { fast: [250, 250, 244], slow: [235, 45, 25] }],
  ['-dark', true, { fast: [236, 240, 226], slow: [255, 80, 50] }]
]) {
  const name = `traffic-sim${suffix}.svg`;
  const svg = makeThumbnail(await still(dark), palette);
  writeFileSync(new URL(`../../assets/thumbs/${name}`, import.meta.url), svg);
  console.log(`${name}: ${Buffer.byteLength(svg)} bytes`);
}
console.log(`${(best.f * FRAME).toFixed(0)} s of traffic, played over ${PLAY} s; ${count} cars; RMS cut distance ${Math.sqrt(best.error / count).toFixed(1)} m equivalent`);
