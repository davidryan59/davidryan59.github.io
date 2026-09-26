/* Draws assets/thumbs/dino-dash.svg: a 7 x 7 corner of a Dino Dash maze, with the
   game's own sprites. The runner laps a ring of corridor eating coins and
   shouts "Yay!" at the tenth, a dinosaur plods five tiles behind, a cat
   darts through and an eagle flies straight over the walls. At the end of
   each lap the maze flashes gold and the coins come back, as when the game
   clears a level. The loop runs 6.4 seconds.

   Run from anywhere: node tools/thumbnails/dino-dash.js

   Sizes are the game's own: tiles of 28 units, sprites as drawn in
   index.html of davidryan59/game-pacman-dino-dash. The picture shows six
   tiles across at 120 px, so one unit is about 0.7 px. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/dino-dash.svg');

const TS = 28, N = 7, W = TS * N;
const LAP = 6.4;              // seconds per loop: 16 tiles at 2.5 tiles a second
// '#' wall, 'o' the runner's ring, '.' floor with a coin, 'R' a relic.
const MAZE = [
  '###R###',
  '#ooooo#',
  '#o###o#',
  '.o###o.',
  '#o###o#',
  '#ooooo#',
  '###.###'
];
// The ring clockwise from the top-left corner, as [row, col].
const RING = [];
for (let c = 1; c <= 5; c++) RING.push([1, c]);
for (let r = 2; r <= 5; r++) RING.push([r, 5]);
for (let c = 4; c >= 1; c--) RING.push([5, c]);
for (let r = 4; r >= 2; r--) RING.push([r, 1]);
const centre = (r, c) => [(c + 0.5) * TS, (r + 0.5) * TS];
const n = v => (Math.round(v * 100) / 100).toString().replace(/^0\./, '.').replace(/^-0\./, '-.');
const kt = v => n(Math.min(1, Math.max(0, v)));
const LOOPING = `dur="${LAP}s" repeatCount="indefinite"`;

/* -------------------------------------------------------------- the maze */

const walls = [];
MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch !== '#') return;
  const x = c * TS + 1.5, y = r * TS + 1.5, s = TS - 3;
  walls.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="5"/>`);
}));
const highlights = [];
MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch === '#') highlights.push(`<rect x="${c * TS + 4.5}" y="${r * TS + 4.5}" width="${TS - 9}" height="${n((TS - 9) / 2.4)}" rx="3"/>`);
}));
const grid = [];
for (let i = 1; i < N; i++) grid.push(`M${i * TS} 0V${W}M0 ${i * TS}H${W}`);

/* ------------------------------------------------------------- the coins */

// A ring coin goes when the runner reaches it, and every coin comes back in
// the last third of a second, just before the lap starts again.
const coins = [];
RING.forEach(([r, c], k) => {
  const [x, y] = centre(r, c), eaten = k / RING.length;
  const anim = k === 0
    ? `values="0;0;1;1" keyTimes="0;.94;.99;1"`
    : `values="1;1;0;0;1;1" keyTimes="0;${kt(eaten)};${kt(eaten + 0.004)};.94;.99;1"`;
  coins.push(`<circle cx="${x}" cy="${y}" r="2.7"><animate attributeName="opacity" ${anim} ${LOOPING}/></circle>`);
});
MAZE.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch === '.') { const [x, y] = centre(r, c); coins.push(`<circle cx="${x}" cy="${y}" r="2.7"/>`); }
}));

/* ----------------------------------------------------------- the sprites */

// Each sprite is drawn about its own centre, facing right, as in the game.
// Legs and arms swing on a short loop; SMIL moves them.
function legs(colour, width, xs, y1, y2, spread, time) {
  return xs.map((x, i) => {
    const s = i ? -spread : spread;
    return `<line x1="${x}" y1="${y1}" x2="${x + s}" y2="${y2}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round">` +
      `<animate attributeName="x2" values="${x + s};${x - s};${x + s}" dur="${time}s" repeatCount="indefinite"/></line>`;
  }).join('');
}
const RUNNER = `<g>` +
  `<line x1="0" y1="2" x2="4.5" y2="9" stroke="#2A1052" stroke-width="3" stroke-linecap="round"><animate attributeName="x2" values="4.5;-4.5;4.5" dur=".42s" repeatCount="indefinite"/></line>` +
  `<line x1="0" y1="2" x2="-4.5" y2="9" stroke="#2A1052" stroke-width="3" stroke-linecap="round"><animate attributeName="x2" values="-4.5;4.5;-4.5" dur=".42s" repeatCount="indefinite"/></line>` +
  `<rect x="-3.5" y="-5" width="7" height="8" rx="2.5" fill="#FFD166"/>` +
  `<line x1="-1" y1="-3" x2="-6" y2="1" stroke="#FFD166" stroke-width="2.6" stroke-linecap="round"><animate attributeName="x2" values="-6;4;-6" dur=".42s" repeatCount="indefinite"/></line>` +
  `<line x1="1" y1="-3" x2="7" y2="-1" stroke="#FFD166" stroke-width="2.6" stroke-linecap="round"><animate attributeName="x2" values="7;-3;7" dur=".42s" repeatCount="indefinite"/></line>` +
  `<circle cx=".5" cy="-9" r="4.4" fill="#FFE0A3"/>` +
  `<path d="M${n(0.5 + 4.3 * Math.cos(Math.PI * 1.05))} ${n(-10.4 + 4.3 * Math.sin(Math.PI * 1.05))}A4.3 4.3 0 0 1 ${n(0.5 + 4.3 * Math.cos(Math.PI * 2.1))} ${n(-10.4 + 4.3 * Math.sin(Math.PI * 2.1))}Z" fill="#5B2E8F"/>` +
  `<circle cx="2.4" cy="-8.6" r="1" fill="#2A1052"/></g>`;
const DINO = `<g>` + legs('#2FA866', 2.6, [-2, 3], 6, 10, 3, 0.6) +
  `<g><animateTransform attributeName="transform" type="translate" values="0 -1.2;0 1.2;0 -1.2" dur=".6s" repeatCount="indefinite"/>` +
  `<path d="M-4 1-13 5-4 6Z" fill="#5AE38C"/><ellipse cx="0" cy="1" rx="7.5" ry="6" fill="#5AE38C"/>` +
  `<ellipse cx="6" cy="-4" rx="5" ry="4" transform="rotate(11.5 6 -4)" fill="#5AE38C"/>` +
  `<path d="M-5-5-2.5-8.5-1.5-5ZM-1-5 1.5-8.5 2.5-5ZM3-5 5.5-8.5 6.5-5Z" fill="#2FA866"/>` +
  `<circle cx="7.5" cy="-5" r="1.1" fill="#1B0A33"/></g></g>`;
const CAT = `<g>` + legs('#FF6FA5', 2.2, [-2, 3], 6, 9.5, 3, 0.32) +
  `<path d="M-6 2Q-12 0-10-6" fill="none" stroke="#FF6FA5" stroke-width="2.4" stroke-linecap="round"/>` +
  `<ellipse cx="0" cy="2" rx="6.5" ry="4.6" fill="#FF6FA5"/><circle cx="5" cy="-3" r="4.4" fill="#FF6FA5"/>` +
  `<path d="M2.5-6.5 3-11 6-7.5ZM6.5-7 9-10.5 9-6Z" fill="#FF6FA5"/><circle cx="6.6" cy="-3.6" r="1" fill="#1B0A33"/></g>`;
const EAGLE = `<g><ellipse cx="0" cy="11" rx="6" ry="2.2" fill="#0E0620" opacity=".28"/>` +
  `<path fill="#7FD8FF"><animate attributeName="d" values="M-1-1-13-10-4 2ZM1-1 11-10 4 2Z;M-1-1-13 0-4 2ZM1-1 11 0 4 2Z;M-1-1-13-10-4 2ZM1-1 11-10 4 2Z" dur=".36s" repeatCount="indefinite"/></path>` +
  `<ellipse cx="0" cy="0" rx="4.2" ry="6" fill="#7FD8FF"/><circle cx=".5" cy="-6" r="3.2" fill="#7FD8FF"/>` +
  `<path d="M3-6.5 7.5-5 3-3.8Z" fill="#FFD166"/><circle cx="1.8" cy="-6.8" r="1" fill="#1B0A33"/></g>`;

// Facing: a discrete scale flip at the given lap fractions, [time, face].
function facing(turns, begin) {
  const times = turns.map(t => kt(t[0])), values = turns.map(t => `${t[1]} 1`);
  if (times[0] !== '0') { times.unshift('0'); values.unshift(values[values.length - 1]); }
  return `<animateTransform attributeName="transform" type="scale" values="${values.join(';')}" keyTimes="${times.join(';')}" calcMode="discrete" ${begin ? `begin="${begin}s" ` : ''}${LOOPING}/>`;
}

const ringPath = `M${centre(1, 1).join(' ')}H${centre(1, 5)[0]}V${centre(5, 5)[1]}H${centre(5, 1)[0]}Z`;

// The runner: faces right along the top and down the right side, left along
// the bottom and up the left side, since the game only turns the runner on
// a sideways move. The tenth coin, at ring tile 9, brings the jump and shout.
const YAY_AT = 9 / RING.length;
const runner = `<g><animateMotion path="${ringPath}" ${LOOPING}/>` +
  `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -11;0 0;0 0" keyTimes="0;${kt(YAY_AT)};${kt(YAY_AT + 0.048)};${kt(YAY_AT + 0.097)};1" calcMode="spline" keySplines="0 0 1 1;.3 .6 .6 1;.4 0 .7 .4;0 0 1 1" ${LOOPING}/>` +
  `<g>${facing([[0, 1], [0.5, -1]])}${RUNNER}</g>` +
  `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${kt(YAY_AT)};${kt(YAY_AT + 0.02)};${kt(YAY_AT + 0.17)};${kt(YAY_AT + 0.21)};1" ${LOOPING}/>` +
  `<path d="M-19-40h38a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H4l-4 6-4-6h-15a5 5 0 0 1-5-5v-10a5 5 0 0 1 5-5z" fill="#FFE0A3" fill-opacity=".96"/>` +
  `<text x="0" y="-26.5" text-anchor="middle" font-family="'Courier New',Courier,monospace" font-weight="700" font-size="12" fill="#5B2E8F">YAY!</text></g></g></g>`;

// The dinosaur runs the same ring five tiles behind. Enemies face right
// when they move up or down, as the game draws them.
const DINO_LAG = 5 / RING.length;
const dino = `<g><animateMotion path="${ringPath}" begin="${n(-(1 - DINO_LAG) * LAP)}s" ${LOOPING}/>` +
  `<g>${facing([[0, 1], [0.5, -1], [0.75, 1]], n(-(1 - DINO_LAG) * LAP))}${DINO}</g></g>`;

// The cat comes up from below, runs left along the bottom and up the left
// side, and leaves by the left-hand exit, all while the runner is round the
// far side. Outside that it waits off the picture.
const catPath = `M${centre(8, 3).join(' ')}V${centre(5, 3)[1]}H${centre(5, 1)[0]}V${centre(3, 1)[1]}H${centre(3, -2)[0]}`;
const catFrom = 1.8 / LAP, catTo = 3.3 / LAP;
// Its four legs of path are 3, 2, 2 and 3 tiles: the turns fall at those shares.
const catTurns = [0.3, 0.5, 0.7].map(f => catFrom + f * (catTo - catFrom));
const cat = `<g><animateMotion path="${catPath}" keyPoints="0;0;1;1" keyTimes="0;${kt(catFrom)};${kt(catTo)};1" calcMode="linear" ${LOOPING}/>` +
  `<g>${facing([[0, 1], [catTurns[0], -1], [catTurns[1], 1], [catTurns[2], -1], [catTo + 0.02, 1]])}${CAT}</g></g>`;

// The eagle ignores the maze and flies straight across it, over the walls.
const eagleFrom = 3.5 / LAP, eagleTo = 6.2 / LAP;
const eagle = `<g><animateMotion path="M225-30L-30 215" keyPoints="0;0;1;1" keyTimes="0;${kt(eagleFrom)};${kt(eagleTo)};1" calcMode="linear" ${LOOPING}/>` +
  `<g transform="scale(-1 1)">${EAGLE}</g></g>`;

// The relic: a jagged shard in the Scare power's colour, turning and bobbing.
const [rx, ry] = centre(0, 3);
const relic = `<g transform="translate(${rx} ${ry})"><g>` +
  `<animateTransform attributeName="transform" type="translate" values="0 -2;0 2;0 -2" keyTimes="0;.5;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" dur="3.2s" repeatCount="indefinite"/>` +
  `<g><animateTransform attributeName="transform" type="rotate" values="0;360" dur="4.5s" repeatCount="indefinite"/>` +
  `<path d="M0-10 5.5-2.5 8 5 0 10-7 4-5-3.5Z" fill="#FF4FD8" filter="url(#relic-glow)"/>` +
  `<path d="M0-10 5.5-2.5 8 5 0 10-7 4-5-3.5Z" fill="#FF4FD8" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="M0-10 4-2 0 3Z" fill="#fff" fill-opacity=".55"/></g></g></g>`;

// The picture crops half a tile off each side and the bottom row, so the
// sprites show larger. The relic's row at the top stays whole.
const VIEW = `${TS / 2} 0 ${W - TS} ${W - TS}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="120" height="120">
<defs>
<linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E1259"/><stop offset="1" stop-color="#210B45"/></linearGradient>
<filter id="wall-glow" x="-.1" y="-.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="3.5"/></filter>
<filter id="coin-glow" x="-.2" y="-.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="relic-glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="${W}" height="${W}" fill="url(#floor)"/>
<path d="${grid.join('')}" stroke="#9A5CFF" stroke-opacity=".07"/>
<g fill="#9A5CFF" fill-opacity=".75" filter="url(#wall-glow)">${walls.join('')}</g>
<g fill="#3A1C6E" stroke="#9A5CFF" stroke-opacity=".55" stroke-width="1.2">${walls.join('')}</g>
<g fill="#fff" fill-opacity=".05">${highlights.join('')}</g>
<g fill="#FFE45C" filter="url(#coin-glow)">${coins.join('')}</g>
${relic}
${cat}
${dino}
${runner}
${eagle}
<rect width="${W}" height="${W}" fill="#FFD166" opacity=".1"><animate attributeName="opacity" values=".1;0;0;.3;.1" keyTimes="0;.03;.93;.985;1" ${LOOPING}/></rect>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${(svg.length / 1024).toFixed(1)} KB`);
