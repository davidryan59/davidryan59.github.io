/* Draws thumbs/highlight-buffs.svg: a still of the Highlight Buffs plugin at
   work on a patch of the Dark Forest map. Planets sit in dark space and
   nebula, and the plugin rings the good ones in its seven colours: 2x
   energy cap, energy growth, defence, speed and range, spacetime rips and
   artifacts. Simplified: no plugin panel, no text.

   Run from anywhere: node tools/thumbnails/highlight-buffs.js

   Ring colours, the 75% opacity and the ring sizes follow the plugin's
   drawHighlights in davidryan59/df-mud-plugins, highlight-buffs.js: a ring
   sits 1.15 times out from the planet, widens by up to 2.3 times as it
   pulses, and its line thickens with the planet's level. The still catches
   each ring at a different point in its pulse, as the plugin's desync does. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'thumbs/highlight-buffs.svg');

const SIZE = 120;
const n = v => (Math.round(v * 100) / 100).toString().replace(/^0\./, '.').replace(/^-0\./, '-.');
function mulberry32(seed) {
  return function () {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(11);
const r = (a, b) => a + (b - a) * rand();

const BUFF = {
  cap: [255, 160, 60], growth: [120, 255, 120], defence: [180, 140, 255], speed: [255, 100, 255],
  range: [225, 225, 80], rip: [80, 200, 255], artifact: [255, 100, 100]
};
const rgb = c => `rgb(${c.join(',')})`;
// Biome colours for the planets, dark to bright.
const BIOMES = ['#2f6fd6', '#2e8b57', '#8fbf4a', '#c9d3d8', '#6e7c3a', '#d9b04c', '#9fe3ff', '#8a4b35', '#ff6a2a', '#8e5bd6'];

// [x, y, level, biome, buffs as [kind, pulse 0..1]]. Level sets the size.
const PLANETS = [
  [-28, -30, 4, 0, [['speed', 0.35]]],
  [18, -34, 2, 2, []],
  [34, -10, 5, 5, [['range', 0.2], ['cap', 0.7]]],
  [-6, 4, 6, 1, [['growth', 0.45]]],
  [-38, 16, 3, 3, [['defence', 0.6]]],
  [22, 26, 3, 9, [['rip', 0.3]]],
  [-14, 38, 4, 8, [['artifact', 0.15]]],
  [44, 36, 1, 7, []], [-46, -6, 1, 4, []], [2, -48, 1, 6, []], [-22, -12, 1, 2, []],
  [12, 8, 1, 3, []], [48, -32, 2, 1, []], [-2, 24, 1, 5, []], [28, 48, 1, 0, []], [-40, 40, 1, 9, []]
];
const radiusOf = level => 1.2 + 0.85 * level;

/* ---------------------------------------------------------------- space */

// Nebula and deep space, as soft patches over black.
const nebula = [];
for (let i = 0; i < 9; i++) {
  const x = r(-60, 60), y = r(-60, 60), rad = r(18, 34);
  nebula.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${i % 3 === 2 ? '#1c1036' : '#0c1a3e'}" opacity="${n(r(0.5, 0.9))}"/>`);
}
const dust = [];
for (let i = 0; i < 70; i++) dust.push(`<circle cx="${n(r(-60, 60))}" cy="${n(r(-60, 60))}" r="${n(r(0.25, 0.6))}" fill="#c9d6ff" opacity="${n(r(0.25, 0.7))}"/>`);

/* -------------------------------------------------------------- planets */

const bodies = [], rings = [];
PLANETS.forEach(([x, y, level, biome, buffs]) => {
  const rad = radiusOf(level);
  bodies.push(`<circle cx="${x}" cy="${y}" r="${n(rad)}" fill="${BIOMES[biome]}"/>` +
    `<circle cx="${x}" cy="${y}" r="${n(rad)}" fill="url(#shade)"/>`);
  // Bigger planets carry Dark Forest's thin tilted ring.
  if (level >= 5) bodies.push(`<ellipse cx="${x}" cy="${y}" rx="${n(rad * 1.7)}" ry="${n(rad * 0.45)}" transform="rotate(-24 ${x} ${y})" fill="none" stroke="#e6e0cf" stroke-opacity=".55" stroke-width=".7"/>`);
  buffs.forEach(([kind, pulse]) => {
    // The plugin's triangle wave: radius and width grow together, opacity too.
    const ringR = (rad * 1.15 + 2) * (1 + 1.3 * pulse * 0.6);
    const width = (1 + 0.5 * level) * (0.5 + pulse) * 0.45;
    rings.push(`<circle cx="${x}" cy="${y}" r="${n(ringR)}" fill="none" stroke="${rgb(BUFF[kind])}" stroke-opacity="${n(0.75 + 0.2 * (1 - pulse))}" stroke-width="${n(width)}"/>`);
  });
  if (buffs.some(b => b[0] === 'artifact')) {
    // An artifact circling the planet.
    const a = -0.8, d = rad + 3.4, ax = x + d * Math.cos(a), ay = y + d * Math.sin(a);
    bodies.push(`<path d="M${n(ax)} ${n(ay - 2)}l1.6 2-1.6 2-1.6-2z" fill="#ffe7a8" stroke="#8a5a1a" stroke-width=".4"/>`);
  }
});

const h = SIZE / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<defs>
<filter id="haze" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="9"/></filter>
<radialGradient id="shade" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
</defs>
<rect x="${-h}" y="${-h}" width="${SIZE}" height="${SIZE}" fill="#05060b"/>
<g filter="url(#haze)">${nebula.join('')}</g>
<g>${dust.join('')}</g>
${bodies.join('\n')}
${rings.join('\n')}
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${(svg.length / 1024).toFixed(1)} KB`);
