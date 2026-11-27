'use strict';

// Writes an animated SVG thumbnail of a Sierpinski sieve whose three copies
// take turns to rotate 90 degrees at full size. Every level of the nested
// copies carries the same animation, so the whole fractal turns, not just the
// top level.
//
//   node tools/fractal/thumb-svg.js [levels] [seconds] [out.svg] [dark|light] [still]
//
// Defaults: 5 levels, a 30 s loop, renders/thumb-e4.svg beside this script,
// dark theme. The builder-page thumbnails are made with:
//
//   node tools/fractal/thumb-svg.js 5 30 assets/thumbs/fractal.svg light
//   node tools/fractal/thumb-svg.js 5 30 assets/thumbs/fractal-dark.svg dark
//   node tools/fractal/thumb-svg.js 5 30 assets/thumbs/fractal-still.svg light still
//   node tools/fractal/thumb-svg.js 5 30 assets/thumbs/fractal-dark-still.svg dark still
//
// A still file shows one frame, for visitors who ask for reduced motion. The
// page picks it in assets/theme.js: Chrome ignores prefers-reduced-motion
// inside an SVG shown as an image.

const fs = require('fs');
const path = require('path');

const levels = Number(process.argv[2] || 5);
const seconds = Number(process.argv[3] || 30);
const out = process.argv[4] || path.join(__dirname, 'renders', 'thumb-e4.svg');
const theme = process.argv[5] || 'dark';
const isStill = process.argv[6] === 'still';

const STEPS = 12;        // quarter turns per loop, shared round the three copies
const HOLD = 0.025;      // still time at each end of a step, as a fraction of it
const SINE = '0.37 0 0.63 1'; // cubic Bezier close to (1 - cos(pi u)) / 2
const FLAT = '0 0 1 1';
const CELLS = ['0 0', '0 .5', '.5 .5']; // top left, bottom left, bottom right
// Light mode deepens each colour so it holds up on cream.
const THEMES = {
  dark: { background: '#10151d', colours: ['#ffd84a', '#ff514d', '#3f8cff'] },
  light: { background: '#fffdf8', colours: ['#c28a00', '#d7372f', '#2b67d1'] },
};
const { background, colours: COLOURS } = THEMES[theme];
const num = x => Number(x.toFixed(5)).toString();

// Key times and angles for copy i: it turns on steps i, i + 3, i + 6 and i + 9.
function animation(i) {
  const times = [0], values = [0], splines = [];
  let angle = 0;
  for (let s = i; s < STEPS; s += 3) {
    const start = (s + HOLD) / STEPS, end = (s + 1 - HOLD) / STEPS;
    times.push(start); values.push(angle); splines.push(FLAT);
    angle += 90;
    times.push(end); values.push(angle); splines.push(SINE);
  }
  times.push(1); values.push(angle); splines.push(FLAT);
  return `<animateTransform attributeName="transform" type="rotate" dur="${seconds}s" repeatCount="indefinite" calcMode="spline"` +
    ` keyTimes="${times.map(num).join(';')}" values="${values.map(v => `${v} .5 .5`).join(';')}" keySplines="${splines.join(';')}"/>`;
}

const anim = [0, 1, 2].map(animation);
const copies = href => CELLS.map((cell, i) =>
  `<g transform="translate(${cell}) scale(.5)"><use href="#${href}">${anim[i]}</use></g>`).join('');

// The still frame: the top-left copy has made its first quarter turn.
const STILL = [90, 0, 0];
const still = href => CELLS.map((cell, i) =>
  `<g transform="translate(${cell}) scale(.5) rotate(${STILL[i]} .5 .5)"><use href="#${href}"/></g>`).join('');

const defs = ['<rect id="s0" x=".04" y=".04" width=".92" height=".92" rx=".04" fill="currentColor"/>'];
for (let n = 1; n < levels; n++) defs.push(`<g id="s${n}">${isStill ? still('s' + (n - 1)) : copies('s' + (n - 1))}</g>`);
const top = CELLS.map((cell, i) => isStill
  ? `<g transform="translate(${cell}) scale(.5) rotate(${STILL[i]} .5 .5)" color="${COLOURS[i]}"><use href="#s${levels - 1}"/></g>`
  : `<g transform="translate(${cell}) scale(.5)" color="${COLOURS[i]}"><use href="#s${levels - 1}">${anim[i]}</use></g>`).join('\n    ');

const label = isStill ? 'A Sierpinski sieve with its top-left copy turned a quarter, at every level'
  : 'A Sierpinski sieve whose three copies take turns to rotate, at every level';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${label}">
  <rect width="120" height="120" fill="${background}"/>
  <defs>
    ${defs.join('\n    ')}
  </defs>
  <g transform="translate(12 12) scale(96)">
    ${top}
  </g>
</svg>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);
console.log(`${out}: ${theme}${isStill ? ' still' : ''}, ${levels} levels, ${3 ** levels} squares, ${isStill ? 'no motion' : seconds + ' s loop'}, ${svg.length} bytes`);
