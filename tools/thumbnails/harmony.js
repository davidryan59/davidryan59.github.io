/* Draws assets/thumbs/harmony.svg: the divisors of 60 in order, in a grid of
   tiles, a still. The major triad 4:5:6 lights up blue and the minor triad
   10:12:15 red. Both score 60 on the paper's measure, and where they sit
   among the divisors tells the two apart.

   Run from anywhere: node tools/thumbnails/harmony.js */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets/thumbs/harmony.svg');

const DIVISORS = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60];
const MAJOR = [4, 5, 6], MINOR = [10, 12, 15];
const COLS = 4, PITCH = 25, TILE = 23, X0 = 10.5, Y0 = 23.5;

let body = '';
DIVISORS.forEach((d, i) => {
  const x = X0 + (i % COLS) * PITCH, y = Y0 + Math.floor(i / COLS) * PITCH;
  const [fill, ink] = MAJOR.includes(d) ? ['#1552a1', '#ffffff'] : MINOR.includes(d) ? ['#c0263b', '#ffffff'] : ['#e6e2d6', '#8a8578'];
  body += `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="4" fill="${fill}"/>` +
    `<text x="${x + TILE / 2}" y="${y + TILE / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" fill="${ink}">${d}</text>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<rect width="120" height="120" fill="#fffdf8"/>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" font-weight="600">${body}</g>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(OUT, svg.length + ' bytes');
