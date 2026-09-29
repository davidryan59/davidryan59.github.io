/* Draws assets/thumbs/sieve.svg: the sieve app in miniature. A hundred
   square, 0 to 99, starts grey. 2, 3, 5 and 7 are chosen in turn. Each one
   lights up, and its multiples turn pale in its colour, until only the primes
   after 7 stay grey. The square holds, then fades back to grey, on an 8 s loop.

   Run from anywhere: node tools/thumbnails/sieve.js

   The rules and colours are the page's own: the script runs app/sieve/model.js
   in Node, in light mode. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/sieve.svg');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/sieve/model.js'), 'utf8'), sandbox, { filename: 'app/sieve/model.js' });
const Sieve = sandbox.Sieve;

const SIZE = 120, MARGIN = 5, PITCH = 11, TILE = 10, LOOP = 8;
const PRIMES = [2, 3, 5, 7], AT = [0.7, 2, 3.3, 4.6];  // seconds
const RIPPLE = 0.7;          // seconds for a prime's multiples to change, in order
const FADE = [7.1, 7.7];     // back to grey
const hex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const T = Sieve.theme(false);
const GREY = hex(T.grey), GREY_TEXT = hex(T.greyText);

// When each number changes colour, and what to. A multiple keeps the colour
// of the first prime to reach it, as on the page.
const model = new Sieve.Model(), change = new Map();
PRIMES.forEach((p, i) => {
  model.choose(p);
  const c = Sieve.slotColours(model.byNumber.get(p).slot, false);
  change.set(p, { at: AT[i], fill: hex(c.bright), text: hex(c.brightText), bold: true });
  const multiples = [];
  for (let n = 2 * p; n < 100; n += p) if (!change.has(n)) multiples.push(n);
  multiples.forEach((n, k) => change.set(n, {
    at: AT[i] + 0.3 + RIPPLE * k / multiples.length, fill: hex(c.pale), text: hex(c.paleText)
  }));
});

const f = s => +(s / LOOP).toFixed(4);
function animate(attr, from, to, at, discrete) {
  return `<animate attributeName="${attr}" dur="${LOOP}s" repeatCount="indefinite"` +
    (discrete ? ` calcMode="discrete" values="${from};${to};${from}" keyTimes="0;${f(at)};${f(FADE[0])}"`
              : ` values="${from};${from};${to};${to};${from};${from}" keyTimes="0;${f(at)};${f(at + 0.18)};${f(FADE[0])};${f(FADE[1])};1"`) +
    '/>';
}

const parts = [];
for (let n = 0; n < 100; n++) {
  const x = MARGIN + (n % 10) * PITCH, y = MARGIN + Math.floor(n / 10) * PITCH, ch = change.get(n);
  const fill = n === 0 ? hex(T.zero) : n === 1 ? hex(T.one) : GREY;
  const text = n === 0 ? hex(T.zeroText) : n === 1 ? hex(T.oneText) : GREY_TEXT;
  parts.push(`<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" rx="1.4" fill="${fill}"` +
    (n === 1 ? ' stroke="rgba(0,0,0,.3)" stroke-width=".4"' : '') +
    (ch ? `>${animate('fill', fill, ch.fill, ch.at)}</rect>` : '/>'));
  parts.push(`<text x="${x + TILE / 2}" y="${y + TILE / 2 + 0.2}" fill="${text}"` +
    (ch ? `>${animate('fill', text, ch.text, ch.at)}${ch.bold ? animate('font-weight', 400, 700, ch.at, true) : ''}${n}</text>` : `>${n}</text>`));
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="${hex(T.board)}"/>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="5.2" text-anchor="middle" dominant-baseline="central">
${parts.join('\n')}
</g>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: 100 tiles, ${change.size} changing, ${(svg.length / 1024).toFixed(1)} KB`);
