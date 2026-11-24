/* Bakes a clockwise ring and a backwards-moving jam into two 120 px SVGs.
   Run from anywhere with node tools/thumbnails/traffic-sim.js. */
import { readFileSync, writeFileSync } from 'node:fs';
import { Ring } from '../../app/traffic-sim/engine/ring.js';
import { readSettings } from '../../app/traffic-sim/engine/settings.js';
import { makeOval } from '../../app/traffic-sim/view.js';
import { speedField, waveSpeed } from '../traffic-sim/waves.js';

const settingsFile = new URL('../../app/traffic-sim/settings/reference.json', import.meta.url);
const { params } = readSettings(readFileSync(settingsFile, 'utf8'));
const length = 1000, count = 48;
const ring = new Ring({ length, types: new Uint8Array(count), seed: 11,
  params: { ...params, human: { ...params.human, noise: 0 } } });
const oval = makeOval(length, 1);
for (let k = 0; k < 30000; k++) ring.step();

// A full wave circuit takes about three minutes. Search that neighbourhood
// for a cut where the traffic pattern comes back to its starting positions.
// Cars are interchangeable at the cut. They keep their identities within it.
const frames = [], fields = [];
for (let frame = 0; frame <= 510; frame++) {
  frames.push({ s: ring.s.slice(), v: ring.v.slice() });
  if (frame % 2 === 0) fields.push(speedField(ring, 100));
  for (let step = 0; step < 5; step++) ring.step();
}
const first = frames[0];
const routeOrder = [...first.s.keys()].sort((a, b) => first.s[a] - first.s[b]);
const near = (a, b) => {
  const delta = a - b;
  return delta - Math.round(delta / length) * length;
};
let best = { error: Infinity };
for (let frame = 330; frame < frames.length; frame++) {
  const end = frames[frame];
  const sorted = [...end.s.keys()].sort((a, b) => end.s[a] - end.s[b]);
  for (let shift = 0; shift < count; shift++) {
    let error = 0;
    for (let k = 0; k < count; k++) {
      const a = routeOrder[k], b = sorted[(k + shift) % count];
      error += near(first.s[a], end.s[b]) ** 2 + 3 * (first.v[a] - end.v[b]) ** 2;
    }
    if (error < best.error) best = { error, frame, shift, sorted };
  }
}

const wave = waveSpeed(fields.slice(0, Math.floor(best.frame / 2)), length);
if (!(wave < 0)) throw new Error('Expected a jam travelling against the traffic');

const scale = 0.247;
const xy = (s, d = 0) => {
  const [x, z] = oval.at(s / length, d);
  return [+(x * scale + 60).toFixed(2), +(z * scale + 60).toFixed(2)];
};
const radius = +(oval.R * scale).toFixed(2), xLeft = 60 - radius, xRight = 60 + radius;
const track = (offset = 0) => {
  const r = radius + offset;
  return `M${xLeft},${60 - r}H${xRight}a${r},${r} 0 0 1 0,${2 * r}H${xLeft}a${r},${r} 0 0 1 0,${-2 * r}Z`;
};

function makeThumbnail(palette) {
  const { ground, field, hedge, shoulder, road, fast, slow } = palette;
  const colour = speed => {
    const t = Math.min(1, Math.max(0, (speed - 2) / 19));
    return '#' + slow.map((v, i) => Math.round(v + (fast[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const cars = [];
  const sampleCount = Math.ceil(best.frame / 3);
  for (let k = 0; k < count; k++) {
    const finish = best.sorted[(k + best.shift) % count];
    const positions = [], colours = [];
    for (let f = 0; f <= sampleCount; f++) {
      const progress = f / sampleCount, frame = frames[Math.round(progress * best.frame)];
      // Ease the last few samples onto the first frame's nearest cyclic match.
      const join = Math.max(0, (progress - 0.95) / 0.05) ** 2;
      const s = frame.s[finish] + join * near(first.s[routeOrder[k]], frames[best.frame].s[finish]);
      const v = frame.v[finish] + join * (first.v[routeOrder[k]] - frames[best.frame].v[finish]);
      positions.push(xy(s).join(' '));
      colours.push(colour(v));
    }
    cars.push(`<circle r="1.22" fill="${colours[0]}" transform="translate(${positions[0]})"><animateTransform attributeName="transform" type="translate" values="${positions.join(';')}" dur="10s" repeatCount="indefinite"/><animate attributeName="fill" values="${colours.join(';')}" dur="10s" repeatCount="indefinite"/></circle>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
<title>A jam travelling backwards around a ring road</title>
<path fill="${ground}" d="M0 0h120v120H0z"/>
<g fill="${field}" stroke="${hedge}" stroke-width="1">
<path d="M-3 17 29 8 52 16 57 38 22 47-3 38zM56-3 83 0 89 21 71 34 52 16zM93 43 122 36 123 70 103 86 86 66zM-4 83 17 64 40 76 37 105 16 123H-4zM46 59 67 49 86 66 78 92 52 84zM64 112 78 92 103 86 121 98v28H60z"/>
</g>
<g fill="none" stroke-linejoin="round">
<path stroke="${hedge}" stroke-width="10" d="${track(-2.4)}"/>
<path stroke="${shoulder}" stroke-width="7.5" d="${track(-2.1)}"/>
<path stroke="${road}" stroke-width="2.7" d="${track(-4.1)}"/>
<path stroke="${road}" stroke-width="3.2" d="${track()}"/>
</g>
${cars.join('\n')}
</svg>\n`;
}

for (const [suffix, palette] of Object.entries({
  '': { ground: '#a4b875', field: '#bdc788', hedge: '#71854f', shoulder: '#989d85',
    road: '#495350', fast: [236, 240, 206], slow: [255, 75, 40] },
  '-dark': { ground: '#445d38', field: '#60764c', hedge: '#364934', shoulder: '#777b66',
    road: '#2f3a3a', fast: [226, 240, 185], slow: [255, 96, 57] }
})) {
  const name = `traffic-sim${suffix}.svg`;
  const svg = makeThumbnail(palette);
  writeFileSync(new URL(`../../assets/thumbs/${name}`, import.meta.url), svg);
  console.log(`${name}: ${Buffer.byteLength(svg)} bytes`);
}
console.log(`10 s loop from ${best.frame / 2} s of traffic; RMS cut distance ${Math.sqrt(best.error / count).toFixed(1)} m equivalent; wave at ${(wave * 3.6).toFixed(1)} km/h`);
