/* Draws assets/thumbs/rcn.svg: Rational Comma Notation in miniature, a still.
   Four whole notes on a staff, C4 D4 E'4 G4, the paper's own example. E'4 is
   the Pythagorean E lowered by the comma that makes it 5/4, written as the
   numeric accidental 5 before the note.

   Run from anywhere: node tools/thumbnails/rcn.js */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets/thumbs/rcn.svg');

const INK = '#3d3c63', LINE = '#1552a1', STEP = 7;
const bottom = 70;                                   // E4 sits on the bottom line
const y = steps => bottom - steps * STEP / 2;        // steps above E4, in staff positions
const notes = [{ x: 24, steps: -4 }, { x: 48, steps: -3 }, { x: 78, steps: 0, acc: '5' }, { x: 102, steps: 2 }];  // C4 D4 E4 G4

let body = '';
for (let i = 0; i < 5; i++) body += `<path d="M 10 ${bottom - i * STEP} H 110" stroke="${INK}" stroke-width="1"/>`;
for (const t of notes) {
  const cy = y(t.steps);
  if (t.steps === -4) body += `<path d="M ${t.x - 9} ${cy} H ${t.x + 9}" stroke="${INK}" stroke-width="1"/>`;   // C4 ledger line
  body += `<ellipse cx="${t.x}" cy="${cy}" rx="5.6" ry="3.7" fill="none" stroke="${INK}" stroke-width="1.8" transform="rotate(-18 ${t.x} ${cy})"/>`;
  if (t.acc) body += `<text x="${t.x - 15}" y="${cy + 5}" text-anchor="middle" font-family="Georgia, serif" font-size="14" font-weight="700" fill="${LINE}">${t.acc}</text>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<rect width="120" height="120" fill="#fdfbf6"/>
<g transform="translate(0 -4)">${body}</g>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(OUT, svg.length + ' bytes');
