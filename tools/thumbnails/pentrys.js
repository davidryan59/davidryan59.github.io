/* Draws assets/thumbs/pentrys.svg: a still of a Pentrys well on an 8 by 8
   grid. A glowing X falls above a stack of six pieces, with two gaps left
   in the stack's top row. Simplified: no special squares, no seams.

   Run from anywhere: node tools/thumbnails/pentrys.js

   The well, the dot grid, the lighting and the piece colours are the game's
   own dark theme, from app/pentrys/draw.js and app/pentrys/pieces.js. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/pentrys.svg');
require(path.join(ROOT, 'app/pentrys/pieces.js'));
const COLOURS = global.Pentrys.Pieces.COLOURS;

const SIZE = 120, S = 15;

// [shape, cells as [column, row]]. The first piece is the one falling.
const PIECES = [
  ['X5', [[4, 0], [3, 1], [4, 1], [5, 1], [4, 2]]],
  ['I4', [[0, 7], [1, 7], [2, 7], [3, 7]]],
  ['L4', [[4, 7], [5, 7], [6, 7], [6, 6]]],
  ['I3', [[7, 5], [7, 6], [7, 7]]],
  ['S4', [[0, 6], [1, 6], [1, 5], [2, 5]]],
  ['T4', [[2, 6], [3, 6], [4, 6], [3, 5]]],
  ['P5', [[5, 4], [6, 4], [5, 5], [6, 5], [5, 6]]]
];

const dots = [];
for (let c = 1; c < 8; c++) for (let r = 1; r < 8; r++) dots.push(`<circle cx="${c * S}" cy="${r * S}" r=".7"/>`);

const w = S - 1.6;
const pieces = PIECES.map(([shape, cells], i) => {
  const [base, rim] = COLOURS[shape];
  const glow = i === 0
    ? `<g fill="${base}" filter="url(#glow)" opacity=".8">` +
      cells.map(([c, r]) => `<rect x="${c * S + 1}" y="${r * S + 1}" width="${S - 2}" height="${S - 2}" rx="3"/>`).join('') + '</g>'
    : '';
  return glow + cells.map(([c, r]) => {
    const x = c * S + .8, y = r * S + .8;
    return `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="3" fill="${base}"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="3" fill="url(#lit)" stroke="${rim}" stroke-opacity=".7" stroke-width="1.1"/>`;
  }).join('');
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<defs>
<linearGradient id="well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b3d"/><stop offset="1" stop-color="#0a0d20"/></linearGradient>
<linearGradient id="lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".45" stop-color="#fff" stop-opacity=".05"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<filter id="glow" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect width="${SIZE}" height="${SIZE}" fill="url(#well)"/>
<g fill="#aabeff" fill-opacity=".16">${dots.join('')}</g>
${pieces.join('\n')}
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${(svg.length / 1024).toFixed(1)} KB`);
