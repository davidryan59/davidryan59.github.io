/* The builder page's traffic-sim thumbnails, light and dark: a close view of
   the lane drop, where the extra lane ends and its cars merge right. The
   background is a still of the real app: countryside, road and trees. The
   cars on top are small rectangles in the app's driver colours, moving as
   the engine moves them, with each car turned along its path.

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
import { HUMAN, SELFISH, COORDINATED } from '../../app/traffic-sim/engine/drivers.js';
import { assignTypes } from '../../app/traffic-sim/engine/mix.js';
import { makeRng } from '../../app/traffic-sim/engine/rng.js';
import { makeOval } from '../../app/traffic-sim/view.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const APP_URL = process.env.APP_URL || 'http://localhost:8123/app/traffic-sim/';
const length = 2000, lanes = 2, density = 60, av = 0.10, selfish = 0.20;
const CLIP = 24;        // seconds of traffic shown
const PLAY = 12;        // seconds it takes on screen, so twice real speed
const FRAME = 0.25;     // seconds of traffic between samples
const SPAN = 70;        // metres of road across the thumbnail
const SIZE = 120, STILL = 240;
const LANE_SLIDE = 3;   // seconds a lane change takes on screen, as in the app

// The traffic, from the engine.
const uk = readSettings(readFileSync(new URL('../../app/traffic-sim/settings/uk-motorway.json', import.meta.url), 'utf8'));
const count = density * lanes * length / 1000;
const types = assignTypes(count, av, [[SELFISH, selfish], [COORDINATED, 1 - selfish]], makeRng(5));
const ring = new Ring({ length, lanes, extraLane: true, types, seed: 5, params: uk.params });
const oval = makeOval(length, lanes, ring.extraEnd, ring.extraGain, ring.extraDrop);
for (let k = 0; k < 6000; k++) ring.step();
const frames = [];
for (let f = 0; f <= CLIP / FRAME; f++) {
  frames.push({ s: ring.s.slice(0, count), lane: ring.lane.slice(0, count),
    from: ring.fromLane.slice(0, count), age: ring.laneAge.slice(0, count) });
  for (let k = 0; k < Math.round(FRAME / ring.c.dt); k++) ring.step();
}

// The view's centre: on the road just before the last usable point of the
// extra lane, where its cars merge.
const centreAt = ring.extraLimit - 20;
const [cx, cz] = oval.at(centreAt / length, oval.half - 1);  // over the busy carriageway

async function still(dark) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: STILL, height: STILL }, colorScheme: dark ? 'dark' : 'light' });
    const url = new URL(APP_URL);
    url.hash = `length=${length}&lanes=${lanes}&extra=1&density=1&speed=1&camera=top&seed=5`;
    await page.goto(url.href);
    await page.waitForFunction(() => window.trafficSim);
    await page.evaluate(() => document.getElementById('run').click());
    await page.addStyleTag({ content: '.card, .map-tools, .gesture-hint { display: none !important; }' });
    const viewProj = await page.evaluate(([x, z, span, size]) => {
      const { view, goal, ring } = window.trafficSim;
      // The app's own few cars shrink to nothing; the thumbnail draws its own.
      ring.len.fill(0);
      ring.width.fill(0);
      const aim = { x, z, yaw: 0, dist: span / size * size / (2 * Math.tan(20 * Math.PI / 180)), pitch: Math.PI / 2 };
      Object.assign(goal, aim);
      Object.assign(view.cam, aim, { follow: null });
      return Array.from(view.camera().viewProj);
    }, [cx, cz, SPAN, STILL]);
    await page.waitForTimeout(1500);
    const image = await page.screenshot({ type: 'jpeg', quality: 82 });
    return { image, viewProj };
  } finally {
    await browser.close();
  }
}

function makeThumbnail({ image, viewProj: m }, colours) {
  const project = (x, z) => {
    const px = m[0] * x + m[8] * z + m[12], py = m[1] * x + m[9] * z + m[13], w = m[3] * x + m[11] * z + m[15];
    return [(px / w + 1) / 2 * SIZE, (1 - py / w) / 2 * SIZE];
  };
  const scale = SIZE / SPAN;
  const offset = (f, i, s) => {
    const fr = frames[f], d = oval.laneOffset(fr.lane[i], s);
    if (fr.age[i] >= LANE_SLIDE) return d;
    const t = fr.age[i] / LANE_SLIDE, ease = t * t * (3 - 2 * t), d0 = oval.laneOffset(fr.from[i], s);
    return d0 + (d - d0) * ease;
  };
  const cars = [];
  for (let i = 0; i < count; i++) {
    const at = frames.map((fr, f) => {
      const s = fr.s[i] - ring.len[i] / 2;
      const [x, z] = oval.at(s / length, offset(f, i, s));
      return project(x, z);
    });
    if (!at.some(([x, y]) => x > -8 && x < SIZE + 8 && y > -8 && y < SIZE + 8)) continue;
    const angles = at.map(([x, y], f) => {
      const [nx, ny] = at[Math.min(f + 1, at.length - 1)], [px, py] = at[Math.max(f - 1, 0)];
      if (Math.hypot(nx - px, ny - py) > 0.08) return Math.atan2(ny - py, nx - px) * 180 / Math.PI;
      const s = frames[f].s[i];
      const [x0, z0] = oval.at(s / length, 0), [x1, z1] = oval.at((s + 2) / length, 0);
      const [a, b] = project(x0, z0), [c, d] = project(x1, z1);
      return Math.atan2(d - b, c - a) * 180 / Math.PI;
    });
    const L = (ring.len[i] * scale).toFixed(2), W = (ring.width[i] * scale).toFixed(2);
    const fill = colours[types[i]];
    cars.push(`<g><animateTransform attributeName="transform" type="translate" values="${at.map(p => p.map(v => v.toFixed(1)).join(' ')).join(';')}" dur="${PLAY}s" repeatCount="indefinite"/>` +
      `<rect x="${(-L / 2).toFixed(2)}" y="${(-W / 2).toFixed(2)}" width="${L}" height="${W}" rx="0.5" fill="${fill}" stroke="#0006" stroke-width="0.3">` +
      `<animateTransform attributeName="transform" type="rotate" values="${angles.map(a => a.toFixed(0)).join(';')}" dur="${PLAY}s" repeatCount="indefinite"/></rect></g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<title>Cars merging where a motorway lane ends, among fields</title>
<image width="${SIZE}" height="${SIZE}" href="data:image/jpeg;base64,${image.toString('base64')}"/>
<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.95;1" dur="${PLAY}s" repeatCount="indefinite"/>
${cars.join('\n')}
</g>
</svg>\n`;
}

// The app's driver colours, light and dark.
const hex = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
for (const [suffix, dark, colours] of [
  ['', false, { [HUMAN]: hex([0.98, 0.97, 0.94]), [COORDINATED]: hex([0.16, 0.45, 0.95]), [SELFISH]: hex([0.98, 0.45, 0.1]) }],
  ['-dark', true, { [HUMAN]: hex([0.86, 0.83, 0.76]), [COORDINATED]: hex([0.26, 0.56, 1.0]), [SELFISH]: hex([1.0, 0.5, 0.16]) }]
]) {
  const name = `traffic-sim${suffix}.svg`;
  const svg = makeThumbnail(await still(dark), colours);
  writeFileSync(new URL(`../../assets/thumbs/${name}`, import.meta.url), svg);
  console.log(`${name}: ${Buffer.byteLength(svg)} bytes`);
}
let merges = 0;
for (let f = 1; f < frames.length; f++) {
  for (let i = 0; i < count; i++) {
    if (frames[f].lane[i] !== frames[f - 1].lane[i] && Math.abs(frames[f].s[i] - centreAt) < SPAN / 2) merges++;
  }
}
console.log(`${CLIP} s of traffic at the lane drop, played over ${PLAY} s; ${merges} lane changes in view`);
