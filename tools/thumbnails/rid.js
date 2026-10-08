/* Writes assets/thumbs/rid.svg, the builder-page still for David Ryan's
   audit of the Rhombicosidodecahedron Nopert certificate.

   Run from anywhere: node tools/thumbnails/rid.js */
const fs = require('fs'), path = require('path');
const { buildModel } = require('../../app/nonrup/models.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets', 'thumbs', 'rid.svg');
const SIZE = 120, DISTANCE = 5, SCALE = SIZE * 0.4;
const LIGHT = [-0.42, 0.66, 0.62];
const model = buildModel('rid');

function place([x0, y0, z], spin) {
  const x = x0 * Math.cos(spin) - y0 * Math.sin(spin);
  const y = x0 * Math.sin(spin) + y0 * Math.cos(spin);
  const tilt = -1.02;
  return [x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
}

const points = model.vertices.map(vertex => place(vertex, 0.3));
const projected = points.map(([x, y, z]) => {
  const perspective = DISTANCE / (DISTANCE - z);
  return [SIZE / 2 + x * SCALE * perspective, SIZE / 2 - y * SCALE * perspective];
});

const paths = [];
for (const face of model.facets) {
  const [a, b, c] = face.slice(0, 3).map(index => points[index]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * -a[0] + n[1] * -a[1] + n[2] * (DISTANCE - a[2]) <= 0) continue;
  const size = Math.hypot(...n) || 1;
  const lit = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / size);
  const lightness = 25 + lit * 39 + (n[0] / size + 1) * 2.5;
  const hue = 304 + n[1] / size * 12;
  const d = face.map((index, i) => (i ? 'L' : 'M') + projected[index].map(value => value.toFixed(1)).join(' ')).join(' ') + 'Z';
  paths.push(`<path d="${d}" fill="hsl(${hue.toFixed(1)} 54% ${lightness.toFixed(1)}%)"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="#f6f3ec"/>
<g stroke="rgba(74, 24, 70, .30)" stroke-width="0.6" stroke-linejoin="round">
${paths.join('\n')}
</g>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(path.relative(ROOT, OUT) + ': ' + Math.round(svg.length / 1024) + ' KB');
