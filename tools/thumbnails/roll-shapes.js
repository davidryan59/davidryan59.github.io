/* Draws assets/thumbs/roll-shapes.svg and roll-shapes-dark.svg: the share card's
   Rolling Shapes curve drawing itself. A circle rolls inside a rounded heptagon of
   size 120, with one flat edge at the bottom and the pen on the circle's rim. The
   circle's size is 120 * 51/182, so the curve closes after 51 laps, and 7 divides
   182, so it has 7-fold symmetry. It draws slowly over 7 s, holds for 2 s, and
   undraws in 0.5 s, on a 9.8 s loop.

   The rainbow runs round seven times along the path. A turn of one seventh moves a
   point a whole number of sevenths along the path, so the colours keep the rotation.
   The pen starts over the bottom edge's midpoint, so the curve is mirror-symmetric.

   Run from anywhere: node tools/thumbnails/roll-shapes.js

   The curve is the app's own: the script runs app/roll-shapes/ in Node. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const SIZE = 1200, RADIUS = 570, SEGMENTS = 84, TOLERANCE = 0.45, RAINBOWS = 7;
const LOOP = 9.8, DRAW = [0, 7], UNDRAW = [9, 9.5];
const LOOKS = {
  'roll-shapes.svg': { bg: '#fdfbf6', outline: '#b9b4a8', lightness: 44 },
  'roll-shapes-dark.svg': { bg: '#14151a', outline: '#4b4c55', lightness: 62 },
};

/* Douglas-Peucker: keeps the corners of a line to within a tolerance. */
function simplify(points, tolerance) {
  const keep = new Uint8Array(points.length), stack = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b], ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey) || 1;
    let far = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(ex * (points[i][1] - ay) - ey * (points[i][0] - ax)) / len;
      if (d > far) { far = d; at = i; }
    }
    if (far > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/* Whole numbers in a 1200-unit frame: small relative steps keep the file small. */
function pathData(points) {
  let d = '', x = Math.round(points[0][0]), y = Math.round(points[0][1]), length = 0;
  d = 'M' + x + ' ' + y + 'l';
  const steps = [];
  for (let i = 1; i < points.length; i++) {
    const nx = Math.round(points[i][0]), ny = Math.round(points[i][1]), dx = nx - x, dy = ny - y;
    if (!dx && !dy) continue;
    steps.push(dx + (dy < 0 ? '' : ' ') + dy);
    length += Math.hypot(dx, dy);
    x = nx; y = ny;
  }
  return { d: d + steps.join(' '), length };
}

(async () => {
  const { buildShape, bounds } = await import('../../app/roll-shapes/shapes.js');
  const { formulaPoses } = await import('../../app/roll-shapes/rolling.js');
  const size = 120 * 51 / 182;
  const outer = buildShape('polygon', { sides: 7, round: 0.5, bulge: 0 }, 120), inner = buildShape('circle', {}, size);
  const { poses, count } = formulaPoses(outer, inner, 51, { maxPoses: 51 * 700 });

  /* The polygon's own frame has its flat edge at the bottom. World y points up. */
  const k = RADIUS / bounds(outer).far, c = SIZE / 2;
  const place = (x, y) => [c + k * x, c - k * y];

  /* The arc at the bottom edge's midpoint: a rim pen touches the wall there. */
  let mid = 0, low = Infinity;
  for (let i = 0; i < outer.n; i++) {
    const j = (i + 1) % outer.n;
    if (outer.x[i] * outer.x[j] > 0) continue;
    const t = outer.x[i] === outer.x[j] ? 0 : -outer.x[i] / (outer.x[j] - outer.x[i]), y = outer.y[i] + t * (outer.y[j] - outer.y[i]);
    if (y < low) { low = y; mid = outer.cum[i] + t * outer.len[i]; }
  }
  const angle = (mid % size) / size * Math.PI * 2, radius = size / (Math.PI * 2);
  const penX = radius * Math.cos(angle), penY = radius * Math.sin(angle);
  const curve = [];
  for (let i = 0; i < count; i++) {
    const p = i * 4, x = poses[p] * penX - poses[p + 1] * penY + poses[p + 2], y = poses[p + 1] * penX + poses[p] * penY + poses[p + 3];
    curve.push(place(x, y));
  }
  const outline = [];
  for (let v = 0; v < outer.n; v++) outline.push(place(outer.x[v], outer.y[v]));

  const pieces = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const a = Math.floor(s / SEGMENTS * (curve.length - 1)), b = Math.floor((s + 1) / SEGMENTS * (curve.length - 1));
    pieces.push(pathData(simplify(curve.slice(a, b + 1), TOLERANCE)));
  }
  const edge = pathData(simplify(outline, 0.6)).d + 'Z';

  const share = t => (t / LOOP).toFixed(4);
  for (const [file, look] of Object.entries(LOOKS)) {
    const lines = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="120" height="120">`,
      `<rect width="${SIZE}" height="${SIZE}" fill="${look.bg}"/>`,
      `<path d="${edge}" fill="none" stroke="${look.outline}" stroke-width="7"/>`,
      '<g fill="none" stroke-width="5.5" stroke-linejoin="round">',
    ];
    pieces.forEach((piece, s) => {
      const L = Math.ceil(piece.length) + 1;
      const hue = Math.round((s / SEGMENTS * RAINBOWS % 1) * 360);
      const d0 = DRAW[0] + (DRAW[1] - DRAW[0]) * s / SEGMENTS, d1 = DRAW[0] + (DRAW[1] - DRAW[0]) * (s + 1) / SEGMENTS;
      const u0 = UNDRAW[0] + (UNDRAW[1] - UNDRAW[0]) * s / SEGMENTS, u1 = UNDRAW[0] + (UNDRAW[1] - UNDRAW[0]) * (s + 1) / SEGMENTS;
      /* The dash pattern repeats every 2L, so the offset only ever falls: from 3L to 2L
         the line appears from its start, and from 2L to L it goes from its start. */
      lines.push(`<path stroke="hsl(${hue} 90% ${look.lightness}%)" stroke-dasharray="${L} ${L}" stroke-dashoffset="${3 * L}" d="${piece.d}">` +
        `<animate attributeName="stroke-dashoffset" values="${3 * L};${3 * L};${2 * L};${2 * L};${L};${L}" keyTimes="0;${share(d0)};${share(d1)};${share(u0)};${share(u1)};1" dur="${LOOP}s" repeatCount="indefinite"/></path>`);
    });
    lines.push('</g></svg>');
    const out = path.join(ROOT, 'assets/thumbs', file), text = lines.join('\n') + '\n';
    fs.writeFileSync(out, text);
    console.log(path.relative(ROOT, out), Math.round(text.length / 1024) + ' KB');
  }
})();
