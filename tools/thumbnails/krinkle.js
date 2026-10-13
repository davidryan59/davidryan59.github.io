/* Draws assets/thumbs/krinkle.svg: the (3, 7, 22') Modulo Krinkle tiling
   of the share card, centred on the swirl, zooming gently in and out on a
   5 s loop. Pastel 1 colours, one per wedge, as the explorer draws them.

   Run from anywhere: node tools/thumbnails/krinkle.js

   The tiles come from the explorer's own generator,
   app/tiles/krinkle/tiling.js, and the colours repeat its trackedPastels in
   app/tiles/krinkle/index.html. One SMIL animation scales the patch; the
   edges keep their width as it scales. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'app/tiles/krinkle/tiling.js'));

const OUT = path.join(ROOT, 'assets/thumbs/krinkle.svg');
const SIZE = 120;             // the viewBox, in CSS pixels at the page's size
const PX = 5;                 // pixels per unit edge at the widest view
const ZOOM = 1.35;            // the closest view, as a multiple of PX
const DUR = 5;                // seconds per loop
const INK = '#4b4a44';
const BG = '#f6f3ec';

const built = K.build({ m: 3, k: 7, t: 2, offset: 1, arrangement: 'fan' });
const info = built.info, n = info.n;

// Pastel 1: one hue track round each copy of the fan, every second wedge
// in the darker accent.
function oklch(L, Cc, hue) {
  const h = hue * Math.PI / 180, a = Cc * Math.cos(h), b = Cc * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const enc = x => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; };
  return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    .map(v => ('0' + Math.round(enc(v) * 255).toString(16)).slice(-2)).join('');
}
const per = info.w >= 2 ? info.w : n;
const COLOURS = [];
for (let i = 0; i < n; i++) {
  const j = i % per, dark = j % 2 === 1;
  COLOURS.push(oklch(dark ? 0.64 : 0.86, dark ? 0.14 : 0.09, 25 + j * 360 / per));
}

// Every tile that reaches the circle the page clips the picture to, at the
// widest view. y runs down in SVG, so it flips.
const R = (SIZE / 2 + 1) / PX;
const byColour = COLOURS.map(() => []);
let count = 0;
built.enumerate(R + info.circumradius * 2, tile => {
  const pts = built.corners(tile).map(p => [PX * (p[0] - info.centre[0]), -PX * (p[1] - info.centre[1])]);
  const near = pts.some(p => Math.hypot(p[0], p[1]) < R * PX) ||
    Math.hypot(PX * (tile.x - info.centre[0]), PX * (tile.y - info.centre[1])) < R * PX + PX * info.circumradius;
  if (!near) return;
  count++;
  byColour[tile.turn].push(pts);
});

function num(v) {
  const s = (Math.round(v * 10) / 10).toString();
  return s.replace(/^0\./, '.').replace(/^-0\./, '-.');
}
// One path per colour, each tile a closed subpath in relative steps between
// corners rounded to a tenth of a pixel, so shared corners stay shared.
function pathFor(list) {
  return list.map(t => {
    const pts = t.map(p => p.map(v => Math.round(v * 10)));
    let s = 'M' + num(pts[0][0] / 10) + ' ' + num(pts[0][1] / 10);
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i][0] - pts[i - 1][0]) / 10, dy = (pts[i][1] - pts[i - 1][1]) / 10;
      s += 'l' + num(dx) + (dy < 0 ? '' : ' ') + num(dy);
    }
    return s + 'z';
  }).join('');
}
const groups = byColour.map((list, i) => list.length ? `<path fill="${COLOURS[i]}" vector-effect="non-scaling-stroke" d="${pathFor(list)}"/>` : '').filter(Boolean);

const h = SIZE / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect x="${-h}" y="${-h}" width="${SIZE}" height="${SIZE}" fill="${BG}"/>
<g stroke="${INK}" stroke-width=".7" stroke-linejoin="round">
<animateTransform attributeName="transform" type="scale" values="1;${ZOOM};1" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="${DUR}s" repeatCount="indefinite"/>
${groups.join('\n')}
</g>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${count} tiles, ${(svg.length / 1024).toFixed(1)} KB`);
