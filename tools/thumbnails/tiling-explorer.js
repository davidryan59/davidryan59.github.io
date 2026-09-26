/* Draws assets/thumbs/tiling-explorer.svg: a patch of the Hat tiling that morphs
   from the chevron to the comet and back, as the explorer's shape slider
   does. The loop runs 10 seconds: 0.5 s still at the chevron, 4.5 s
   sliding to the comet, 0.5 s still, 4.5 s sliding back. Pastel colours,
   light mode, no text.

   Run from anywhere: node tools/thumbnails/tiling-explorer.js

   Every hat corner sits at a*P + b*zeta*R (see app/tiles/engine/tiling-core.js),
   so the slider's tiling at angle t is k(t) * (sin t * P + cos t * zeta*R),
   with k keeping the hat's area. A straight blend of the chevron and comet
   paths gives the same shapes at a smaller or larger size, so the file
   needs only those two paths: one SMIL animation blends them, with a
   spline timing that keeps the slider's speed even, and a second one
   scales the patch to hold the tile area steady. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'app/tiles/engine/tiling-core.js'));
const HT = require(path.join(ROOT, 'app/tiles/hat/tiling.js'));

const OUT = path.join(ROOT, 'assets/thumbs/tiling-explorer.svg');
const SIZE = 120;             // the viewBox, in CSS pixels at the page's size
const PX = 5.0;               // pixels per unit of edge a at the hat's own shape
const DUR = 10;               // seconds per loop
const HOLD = 0.05;            // share of the loop held still at each end
const INK = '#4b4a44';        // the explorer's edge ink at 85% over a pastel fill
const BG = '#f6f3ec';

const H3 = Math.sqrt(3) / 2;
function zeta(v) { return [H3 * v[0] - 0.5 * v[1], 0.5 * v[0] + H3 * v[1]]; }
function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
}

// The explorer's Pastel preset in light mode, as app/tiles/hat/index.html has it.
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
const COLOURS = [];
for (let k = 0; k < 12; k++) {
  const m = k >= 6, hue = (k % 6) * 60 + 25;
  COLOURS.push(oklch(m ? 0.60 : 0.88, m ? 0.15 : 0.075, hue));
}

/* ------------------------------------------------------------- the patch */

const built = HT.build();
let node = built.root, T = C.TP_IDENT;
while (node.level > 4) { T = C.tpCompose(T, node.TP[0]); node = node.children[0]; }
const hats = [];
(function walk(n, Tn) {
  if (n.leaf) { hats.push(Tn); return; }
  n.children.forEach((c, i) => walk(c, C.tpCompose(Tn, n.TP[i])));
})(node, T);

// Each hat as 14 corners, each corner as its two parts P and zeta*R.
const tiles = hats.map(h => ({
  cls: (((h.k % 6) + 6) % 6) + (h.f ? 6 : 0),
  corners: built.info.outline.map((v, u) => {
    const x = C.tpApply(h, HT.HAT_TP[u]);
    return { P: C.zw.val(x.p), Z: zeta(C.zw.val(x.r)) };
  })
}));

// The camera sits at a two-part point, as the explorer's does, so the
// same tiles stay under it at every shape. It sits on the centre of a
// mirrored hat near the middle of the patch, the dark tile that the
// morph then turns about.
function centroid(t, key) {
  const s = [0, 0];
  t.corners.forEach(c => { s[0] += c[key][0] / 14; s[1] += c[key][1] / 14; });
  return s;
}
const midP = [0, 0];
tiles.forEach(t => { const c = centroid(t, 'P'); midP[0] += c[0] / tiles.length; midP[1] += c[1] / tiles.length; });
const PICK = 0;   // 0 for the nearest mirrored hat, 1 for the next, and so on
const anchor = tiles.filter(t => t.cls >= 6)
  .map(t => ({ t, d: Math.hypot(centroid(t, 'P')[0] - midP[0], centroid(t, 'P')[1] - midP[1]) }))
  .sort((x, y) => x.d - y.d)[PICK].t;
const camP = centroid(anchor, 'P'), camZ = centroid(anchor, 'Z');

function hatArea(a, b) {
  return area(built.info.outline.map(v => {
    const z = zeta(v.R);
    return [a * v.P[0] + b * z[0], a * v.P[1] + b * z[1]];
  }));
}
const A0 = hatArea(1, Math.sqrt(3));
function abAt(deg) {
  const t = deg * Math.PI / 180, a = Math.sin(t), b = Math.cos(t);
  const k = Math.sqrt(A0 / hatArea(a, b));
  return [a * k, b * k];
}
// A corner relative to the camera, in pixels, y down.
function place(c, a, b) {
  return [PX * (a * (c.P[0] - camP[0]) + b * (c.Z[0] - camZ[0])),
          -PX * (a * (c.P[1] - camP[1]) + b * (c.Z[1] - camZ[1]))];
}

// Keep every hat that reaches the view at any shape along the slider. The
// page shows the picture in a circle, so hats outside it are left out.
const R = SIZE / 2 + 1;
function distToCentre(pts) {
  let inside = false, d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[j];
    if ((y1 > 0) !== (y2 > 0) && 0 < (x2 - x1) * (0 - y1) / (y2 - y1) + x1) inside = !inside;
    const ex = x2 - x1, ey = y2 - y1, L = ex * ex + ey * ey;
    const f = L ? Math.max(0, Math.min(1, -(x1 * ex + y1 * ey) / L)) : 0;
    d = Math.min(d, Math.hypot(x1 + f * ex, y1 + f * ey));
  }
  return inside ? 0 : d;
}
const keep = tiles.filter(t => {
  for (let d = 0; d <= 90; d += 2.5) {
    const ab = abAt(d);
    if (distToCentre(t.corners.map(c => place(c, ab[0], ab[1]))) < R) return true;
  }
  return false;
});

/* ------------------------------------------------------------ the timing */

// Chevron is Tile(0, beta), comet Tile(alpha, 0). A straight blend at u is
// Tile(u alpha, (1 - u) beta), the slider's shape at angle t with
// tan t = u alpha / ((1 - u) beta), at a size lambda too large or small.
const beta = abAt(0)[1], alpha = abAt(90)[0];
function uOfDeg(deg) {
  const t = deg * Math.PI / 180;
  return beta * Math.sin(t) / (beta * Math.sin(t) + alpha * Math.cos(t));
}
function degOfU(u) { return Math.atan2(u * alpha, (1 - u) * beta) * 180 / Math.PI; }
function lambdaOfU(u) {
  const ab = abAt(degOfU(u));
  return ab[0] / (u * alpha) || ab[1] / ((1 - u) * beta);
}

// SMIL spline timing: y(x) from the cubic Bezier through (0,0), (x1,y1),
// (x2,y2), (1,1). Fit it to u over an even slider sweep, 0 to 90 degrees.
function bez(p1, p2, s) { const m = 1 - s; return 3 * m * m * s * p1 + 3 * m * s * s * p2 + s * s * s; }
function splineY(sp, x) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (bez(sp[0], sp[2], mid) < x) lo = mid; else hi = mid; }
  return bez(sp[1], sp[3], (lo + hi) / 2);
}
// The worst gap, in slider degrees, between the spline and an even sweep.
function fitError(sp) {
  let e = 0;
  for (let i = 1; i < 40; i++) { const x = i / 40; e = Math.max(e, Math.abs(degOfU(splineY(sp, x)) - 90 * x)); }
  return e;
}
let best = [0.25, 0.25, 0.75, 0.75], bestE = fitError(best);
for (let step = 0.1; step > 1e-4; step /= 2) {
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < 4; i++) for (const d of [-step, step]) {
      const c = best.slice(); c[i] = Math.min(1, Math.max(0, c[i] + d));
      const e = fitError(c);
      if (e < bestE) { best = c; bestE = e; improved = true; }
    }
  }
}
const fwd = best.map(v => +v.toFixed(4));
const back = [1 - fwd[2], 1 - fwd[3], 1 - fwd[0], 1 - fwd[1]].map(v => +v.toFixed(4));

// The size correction, sampled along the loop from the spline as drawn,
// so the tile area holds steady even where the fit is off.
const scaleTimes = [], scaleValues = [];
const STEPS = 24;
function pushScale(time, u) { scaleTimes.push(+time.toFixed(4)); scaleValues.push(+lambdaOfU(u).toFixed(4)); }
pushScale(0, 0);
for (let i = 0; i <= STEPS; i++) pushScale(HOLD + (0.5 - HOLD) * i / STEPS, splineY(fwd, i / STEPS));
for (let i = 0; i <= STEPS; i++) pushScale(0.5 + HOLD + (0.5 - HOLD) * i / STEPS, 1 - splineY(back, i / STEPS));
// Clamp the ends to exactly 1: lambda is 1 at both pure shapes.
scaleValues[0] = scaleValues[1] = scaleValues[scaleValues.length - 1] = 1;

/* ------------------------------------------------------------- the paths */

function num(v) {
  const s = (Math.round(v * 10) / 10).toString();
  return s.replace(/^0\./, '.').replace(/^-0\./, '-.');
}
// One path per colour, each hat a closed subpath in relative steps between
// corners rounded to a tenth of a pixel, so shared corners stay shared.
function pathFor(list, a, b) {
  return list.map(t => {
    const pts = t.corners.map(c => place(c, a, b).map(v => Math.round(v * 10)));
    let s = 'M' + num(pts[0][0] / 10) + ' ' + num(pts[0][1] / 10);
    for (let i = 1; i < pts.length; i++) {
      const dx = (pts[i][0] - pts[i - 1][0]) / 10, dy = (pts[i][1] - pts[i - 1][1]) / 10;
      s += 'l' + num(dx) + (dy < 0 ? '' : ' ') + num(dy);
    }
    return s + 'z';
  }).join('');
}

const chev = abAt(0), comet = abAt(90);
const TIMING = `dur="${DUR}s" repeatCount="indefinite"`;
const keyTimes = `0;${HOLD};.5;${0.5 + HOLD};1`;
const splines = `0 0 1 1;${fwd.join(' ')};0 0 1 1;${back.join(' ')}`;
const groups = [];
for (let cls = 0; cls < 12; cls++) {
  const list = keep.filter(t => t.cls === cls);
  if (!list.length) continue;
  const d0 = pathFor(list, chev[0], chev[1]), d1 = pathFor(list, comet[0], comet[1]);
  groups.push(`<path fill="${COLOURS[cls]}" d="${d0}"><animate attributeName="d" values="${d0};${d0};${d1};${d1};${d0}" keyTimes="${keyTimes}" calcMode="spline" keySplines="${splines}" ${TIMING}/></path>`);
}

const h = SIZE / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect x="${-h}" y="${-h}" width="${SIZE}" height="${SIZE}" fill="${BG}"/>
<g stroke="${INK}" stroke-width=".8" stroke-linejoin="round">
<animateTransform attributeName="transform" type="scale" values="${scaleValues.join(';')}" keyTimes="${scaleTimes.join(';')}" ${TIMING}/>
${groups.join('\n')}
</g>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: ${keep.length} hats, ${(svg.length / 1024).toFixed(1)} KB, ` +
            `spline ${fwd.join(' ')} (slider off by at most ${bestE.toFixed(2)} degrees), ` +
            `scale ${Math.min(...scaleValues).toFixed(3)}..${Math.max(...scaleValues).toFixed(3)}`);
