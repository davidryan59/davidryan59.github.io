/* Draws assets/thumbs/polygonal-spectre.svg: the polygonal Spectre X(p, h)
   of the 2026 pre-print, a still. Each of the Spectre's 14 unit edges is
   replaced by a triangle, as in papers/verify-polygonal-spectre.py: the
   polyline (0,0), (p,h), (1,0) on even edges and its half turn
   (0,0), (1-p,-h), (1,0) on odd edges, in edge coordinates (u along the
   edge, w towards the inside). The picture uses the paper's default tile,
   p = 29/50 and h = 13/50, filled in the explorer's light Pastel blue, with
   the original Spectre dashed beneath it.

   Run from anywhere: node tools/thumbnails/polygonal-spectre.js */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets/thumbs/polygonal-spectre.svg');

const H = Math.sqrt(3) / 2, P = 29 / 50, HT = 13 / 50;
// Tile(1,1), counterclockwise, as in app/tiles/spectre/tiling.js.
const SPECTRE = [
  [0, 0], [1, 0], [1.5, -H], [1.5 + H, 0.5 - H], [1.5 + H, 1.5 - H],
  [2.5 + H, 1.5 - H], [3 + H, 1.5], [3, 2], [3 - H, 1.5],
  [2.5 - H, 1.5 + H], [1.5 - H, 1.5 + H], [0.5 - H, 1.5 + H], [-H, 1.5], [0, 1]
];

const poly = [];
SPECTRE.forEach((a, i) => {
  const b = SPECTRE[(i + 1) % SPECTRE.length];
  const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
  const ux = ex / len, uy = ey / len, nx = -uy, ny = ux;   // left normal = inside
  const [u, w] = i % 2 === 0 ? [P, HT] : [1 - P, -HT];
  poly.push(a, [a[0] + len * (u * ux) + w * nx, a[1] + len * (u * uy) + w * ny]);
});

// Fit to the 120 square, flipping y for the screen.
const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
const s = 100 / Math.max(maxX - minX, maxY - minY);
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const pt = p => `${(60 + (p[0] - cx) * s).toFixed(1)} ${(60 - (p[1] - cy) * s).toFixed(1)}`;
const path_ = pts => 'M ' + pts.map(pt).join(' L ') + ' Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<rect width="120" height="120" fill="#f6f3ec"/>
<path d="${path_(poly)}" fill="#a9c4ec" stroke="#4b4a44" stroke-width="1.6" stroke-linejoin="round"/>
<path d="${path_(SPECTRE)}" fill="none" stroke="#4b4a44" stroke-width="1" stroke-dasharray="3 2.5" opacity=".7"/>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(OUT, svg.length + ' bytes');
