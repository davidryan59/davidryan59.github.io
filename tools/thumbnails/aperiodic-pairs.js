/* Draws assets/thumbs/aperiodic-pairs.svg: Penrose kites and darts in the gallery's
   light-mode colours, zooming gently in and out on a 7-second loop about
   the sun of five kites at the centre.

   Run from anywhere: node tools/thumbnails/aperiodic-pairs.js

   The patch is grown the way app/aperiodic-pairs/index.html grows it: a sun of
   ten half-kites, split again and again at the golden ratio. Halves pair
   across their shared edge, so each kite and dart is drawn whole. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/aperiodic-pairs.svg');

const SIZE = 120;
const EDGE = 11;       // a long edge in pixels, zoomed out
const ZOOM = 1.8;      // how far it zooms in
const DUR = 7;         // seconds per loop, in and out
const STEPS = 6;       // rounds of subdivision
const KITE = '#9db4dc', DART = '#ecc680', LINE = '#2a2922', BG = '#f6f3ec';

const PHI = (1 + Math.sqrt(5)) / 2;
function lerp(p, q, f) { return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; }
function polar(r, t) { return [r * Math.cos(t), r * Math.sin(t)]; }

// Half-kites (0) and half-darts (1), as the gallery builds them.
let tris = [];
for (let i = 0; i < 10; i++) {
  let A = polar(PHI, (-18 + 36 * i) * Math.PI / 180);
  let Cc = polar(PHI, (18 + 36 * i) * Math.PI / 180);
  if (i % 2) { const t = A; A = Cc; Cc = t; }
  tris.push([0, A, [0, 0], Cc]);
}
for (let s = 0; s < STEPS; s++) {
  const next = [];
  for (const [c, P1, P2, P3] of tris) {
    if (c === 0) {
      const Q = lerp(P1, P2, 1 / PHI), R = lerp(P2, P3, 1 / PHI);
      next.push([1, R, Q, P2], [0, Q, P1, R], [0, P3, P1, R]);
    } else {
      const P = lerp(P3, P1, 1 / PHI);
      next.push([1, P2, P, P1], [0, P, P3, P2]);
    }
  }
  tris = next;
}

// Every split shrinks the tiles by the golden ratio, and the sun's long
// edges start at PHI, so a long edge is now PHI^(1 - STEPS).
const k = EDGE / Math.pow(PHI, 1 - STEPS);
function px(p) { return [p[0] * k, -p[1] * k]; }

// Pair halves across their shared edge P2-P3 into whole tiles.
function key(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6); }
const byEdge = new Map();
tris.forEach((t, i) => {
  const e = [key(t[2]), key(t[3])].sort().join('|') + '|' + t[0];
  if (!byEdge.has(e)) byEdge.set(e, []);
  byEdge.get(e).push(i);
});
const tiles = [];
byEdge.forEach(list => {
  const a = tris[list[0]];
  const pts = list.length === 2 ? [a[1], a[2], tris[list[1]][1], a[3]] : [a[1], a[2], a[3]];
  tiles.push({ kind: a[0], pts: pts.map(px) });
});

// Keep the tiles that reach the circle when zoomed out, the widest view.
const R = SIZE / 2 + 1;
const keep = tiles.filter(t => t.pts.some(p => Math.hypot(p[0], p[1]) < R + EDGE));

function num(v) { return (Math.round(v * 10) / 10).toString().replace(/^0\./, '.').replace(/^-0\./, '-.'); }
function d(list) {
  return list.map(t => {
    const p = t.pts.map(q => q.map(v => Math.round(v * 10)));
    let s = 'M' + num(p[0][0] / 10) + ' ' + num(p[0][1] / 10);
    for (let i = 1; i < p.length; i++) {
      const dy = (p[i][1] - p[i - 1][1]) / 10;
      s += 'l' + num((p[i][0] - p[i - 1][0]) / 10) + (dy < 0 ? '' : ' ') + num(dy);
    }
    return s + 'z';
  }).join('');
}

const h = SIZE / 2;
const ease = '.45 0 .55 1';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect x="${-h}" y="${-h}" width="${SIZE}" height="${SIZE}" fill="${BG}"/>
<g stroke="${LINE}" stroke-width=".9" stroke-linejoin="round">
<animateTransform attributeName="transform" type="scale" values="1;${ZOOM};1" keyTimes="0;.5;1" calcMode="spline" keySplines="${ease};${ease}" dur="${DUR}s" repeatCount="indefinite"/>
<path fill="${KITE}" vector-effect="non-scaling-stroke" d="${d(keep.filter(t => t.kind === 0))}"/>
<path fill="${DART}" vector-effect="non-scaling-stroke" d="${d(keep.filter(t => t.kind === 1))}"/>
</g>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${keep.length} tiles, ${(svg.length / 1024).toFixed(1)} KB`);
