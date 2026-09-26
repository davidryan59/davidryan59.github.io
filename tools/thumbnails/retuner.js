/* Draws assets/thumbs/retuner.svg: the left and middle of ReTuner's keyboard, from
   the number row down to the space bar, in the app's own colours. Barely
   moving: the coloured keys breathe a few per cent and the dashed rings on
   the octave keys turn slowly. No text: at thumbnail size the labels would
   only be noise.

   Run from anywhere: node tools/thumbnails/retuner.js

   Key centres and sizes are measured from a 1280 x 900 screenshot of
   re-tuner.web.app, in its pixels. The picture crops a circle from them,
   with the space bar moved left so that it fits. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/retuner.svg');

const CROP = { x: 360, y: 335, r: 255 };     // the circle cut from the screenshot
const SIZE = 120;
const k = (SIZE / 2) / CROP.r;

const GREY = '#cdcdcd', DARK = '#a9a9a9', PANEL = '#dddddd', OUTLINE = '#6e6e6e', RING = '#505096';
// [x, y, radius, fill, kind]: kind is 'note', 'octave' (dashed ring), 'fn'
// (a darker function key), 'reset' (a yellow ring) or '' for a plain key.
const KEYS = [
  [168, 165, 43, DARK, 'fn'], [252, 163, 40, GREY, ''], [333, 158, 40, GREY, ''], [413, 158, 40, GREY, ''],
  [492, 158, 40, GREY, ''], [571, 163, 43, DARK, 'fn'], [653, 165, 43, DARK, 'reset'],
  [93, 218, 43, DARK, 'fn'], [540, 243, 40, GREY, ''], [615, 243, 40, GREY, ''],
  [94, 287, 28, GREY, ''], [93, 340, 28, GREY, ''], [238, 332, 40, GREY, ''], [315, 332, 40, GREY, ''],
  [560, 323, 40, GREY, ''], [635, 323, 43, DARK, 'fn'],
  [110, 405, 40, GREY, ''], [195, 403, 43, DARK, 'fn'], [277, 403, 40, GREY, ''], [354, 403, 40, GREY, ''],
  [598, 395, 40, GREY, ''], [676, 395, 40, GREY, ''],
  [94, 485, 28, GREY, ''], [173, 485, 40, GREY, ''], [253, 483, 40, GREY, ''], [348, 485, 40, GREY, ''],
  // The notes, drawn last since they overlap their neighbours, as in the app.
  [190, 250, 57, '#f83333', 'octave'],   // Q, 1/2
  [291, 245, 56, '#3ae83a', 'note'],     // W, 2/3
  [377, 238, 54, '#f1f22c', 'note'],     // E, 3/4
  [462, 240, 51, '#f2c62e', 'note'],     // R, 4/5
  [395, 325, 50, '#f4ab2e', 'note'],     // D, 5/6
  [482, 328, 48, '#f68130', 'note'],     // F, 8/9
  [437, 400, 48, '#f67930', 'note'],     // C, 9/10
  [518, 400, 46, '#f65e32', 'note'],     // V, 15/16
  [470, 487, 58, '#f83333', 'octave']    // space, 1/1, moved in from x = 637 to sit in the circle
];

function darker(hex, f) {
  return '#' + [1, 3, 5].map(i => ('0' + Math.round(parseInt(hex.substr(i, 2), 16) * f).toString(16)).slice(-2)).join('');
}
const n = v => (Math.round(v * 100) / 100).toString().replace(/^0\./, '.').replace(/^-0\./, '-.');

const parts = [];
let note = 0;
KEYS.forEach(([x, y, r, fill, kind]) => {
  const cx = (x - CROP.x) * k, cy = (y - CROP.y) * k, R = r * k;
  if (Math.hypot(cx, cy) - R > SIZE / 2) return;
  if (kind === 'note' || kind === 'octave') {
    // A thick band of the key's own colour, darker, inside a thin navy ring.
    // Each breathes on its own phase, so they never pulse together.
    const phase = -(note++ * 1.37 % 7).toFixed(2);
    const ring = kind === 'octave'
      ? `<g><circle r="${n(R - 0.5)}" fill="none" stroke="${RING}" stroke-width="1.1" stroke-dasharray="2.6 1.6"/>` +
        `<animateTransform attributeName="transform" type="rotate" values="0;${note % 2 ? 360 : -360}" dur="40s" repeatCount="indefinite"/></g>`
      : `<circle r="${n(R - 0.5)}" fill="none" stroke="${RING}" stroke-width="1"/>`;
    parts.push(`<g transform="translate(${n(cx)} ${n(cy)})"><g>` +
      `<animateTransform attributeName="transform" type="scale" values="1;1.035;1" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="7s" begin="${phase}s" repeatCount="indefinite"/>` +
      `<circle r="${n(R - 1.1)}" fill="${fill}" stroke="${darker(fill, 0.86)}" stroke-width="1.5"/>${ring}</g></g>`);
  } else {
    const stroke = kind === 'reset' ? '#e6e619' : OUTLINE;
    parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R - 0.4)}" fill="${fill}" stroke="${stroke}" stroke-opacity="${kind === 'reset' ? 1 : 0.85}" stroke-width="${kind === 'reset' ? 1 : 0.8}"/>`);
  }
});

const h = SIZE / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect x="${-h}" y="${-h}" width="${SIZE}" height="${SIZE}" fill="${PANEL}"/>
${parts.join('\n')}
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${parts.length} keys, ${(svg.length / 1024).toFixed(1)} KB`);
