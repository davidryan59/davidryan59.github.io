/* The shape library. Every shape is a closed polygon with its vertices listed
   counter-clockwise, in its own frame, scaled so that its perimeter equals the
   size it was asked for. A straight side is one edge, and a smooth curve is many
   short edges of equal length. Stretching, rounding and bulging rescale the
   result, so the perimeter holds while the shape changes.

   Every shape is star-shaped about its origin. The fast depth test relies on it. */

export const TAU = Math.PI * 2;

/* A turn above this at a vertex is a corner, and rolling pivots on it. */
const SHARP = 0.15;

/* What a visitor may set on each shape. Slider order follows the spec. */
export const SHAPES = {
  circle: { label: 'Circle', params: [] },
  ellipse: { label: 'Ellipse', params: [
    { key: 'stretch', label: 'Stretch', min: 1, max: 4, step: 0.01, value: 1.7 },
  ] },
  squircle: { label: 'Squircle', params: [
    { key: 'stretch', label: 'Stretch', min: 1, max: 3, step: 0.01, value: 1 },
    { key: 'square', label: 'Squareness', min: -1, max: 1, step: 0.01, value: 0.4 },
  ] },
  rectangle: { label: 'Rectangle', params: [
    { key: 'ratio', label: 'Width to height', min: 1, max: 5, step: 0.01, value: 1.6 },
    { key: 'round', label: 'Corner rounding', min: 0, max: 1, step: 0.01, value: 0 },
  ] },
  polygon: { label: 'Polygon', params: [
    { key: 'sides', label: 'Sides', min: 3, max: 12, step: 1, value: 4 },
    { key: 'round', label: 'Corner rounding', min: 0, max: 1, step: 0.01, value: 0 },
    { key: 'bulge', label: 'Edge bulge', min: 0, max: 1, step: 0.01, value: 0 },
  ] },
  egg: { label: 'Egg', params: [
    { key: 'egg', label: 'Egginess', min: 0, max: 0.4, step: 0.005, value: 0.22 },
  ] },
  flower: { label: 'Flower', params: [
    { key: 'petals', label: 'Petals', min: 3, max: 12, step: 1, value: 5 },
    { key: 'depth', label: 'Depth', min: 0.02, max: 0.6, step: 0.005, value: 0.25 },
  ] },
  peanut: { label: 'Peanut', params: [
    { key: 'waist', label: 'Waist', min: 0.05, max: 0.7, step: 0.005, value: 0.45 },
  ] },
};

export function defaultParams(type) {
  const out = {};
  for (const p of SHAPES[type].params) out[p.key] = p.value;
  return out;
}

/* A piece is one stretch of outline between two corners, or a whole smooth loop.
   It is either a straight line or a curve f(t), t from t0 to t1. */
const line = (a, b) => ({ straight: true, a, b });
const curve = (f, t0, t1) => ({ f, t0, t1 });

function arcPiece(cx, cy, r, a0, a1) {
  return curve(t => [cx + r * Math.cos(t), cy + r * Math.sin(t)], a0, a1);
}

const polar = r => t => { const v = r(t); return [v * Math.cos(t), v * Math.sin(t)]; };

function pieces(type, p) {
  switch (type) {
    case 'circle':
      return [curve(t => [Math.cos(t), Math.sin(t)], 0, TAU)];
    case 'ellipse':
      return [curve(t => [p.stretch * Math.cos(t), Math.sin(t)], 0, TAU)];
    case 'squircle':
      return squircle(p);
    case 'rectangle':
      return rectangle(p);
    case 'polygon':
      return polygon(p);
    case 'egg': {
      /* Pointed end up. The factor bends a circle's width towards its lower half,
         and the frame is centred so that the origin stays well inside. */
      const e = p.egg;
      return [curve(t => { const c = Math.cos(t), s = Math.sin(t); return [c * (1 - e * s), 1.25 * s]; }, 0, TAU)];
    }
    case 'flower':
      return [curve(polar(t => 1 + p.depth * Math.cos(p.petals * t)), 0, TAU)];
    case 'peanut':
      return [curve(polar(t => 1 + p.waist * Math.cos(2 * t)), 0, TAU)];
    default:
      throw new Error('Unknown shape: ' + type);
  }
}

/* Squareness runs from -1 (a diamond) through 0 (a circle) to 1 (near a
   rectangle). It sets the superellipse power, 1 to 2 to 12. */
function squirclePower(square) {
  return square <= 0 ? 2 + square : 2 * Math.pow(6, square);
}

function squircle(p) {
  const n = squirclePower(p.square), e = 2 / n, a = p.stretch;
  const sgn = (v, power) => Math.sign(v) * Math.pow(Math.abs(v), power);
  const f = t => [a * sgn(Math.cos(t), e), sgn(Math.sin(t), e)];
  /* A piece per quadrant, so that a tip stays a vertex at every squareness. */
  return [0, 1, 2, 3].map(q => curve(f, q * TAU / 4, (q + 1) * TAU / 4));
}

/* Starts at the right side's midpoint, so that arc 0 faces the same way on every shape. */
function rectangle(p) {
  const w = p.ratio, h = 1, r = p.round * Math.min(w, h) / 2 * 0.9999;
  const x = w / 2, y = h / 2;
  if (r <= 0) {
    const a = [x, y], b = [-x, y], c = [-x, -y], d = [x, -y];
    return [line([x, 0], a), line(a, b), line(b, c), line(c, d), line(d, [x, 0])];
  }
  const out = [];
  out.push(line([x, 0], [x, y - r]));
  out.push(arcPiece(x - r, y - r, r, 0, TAU / 4));
  out.push(line([x - r, y], [-x + r, y]));
  out.push(arcPiece(-x + r, y - r, r, TAU / 4, TAU / 2));
  out.push(line([-x, y - r], [-x, -y + r]));
  out.push(arcPiece(-x + r, -y + r, r, TAU / 2, 3 * TAU / 4));
  out.push(line([-x + r, -y], [x - r, -y]));
  out.push(arcPiece(x - r, -y + r, r, 3 * TAU / 4, TAU));
  out.push(line([x, -y + r], [x, 0]));
  return out;
}

/* One flat side down. Bulge bends each side into an arc through its two corners:
   half-angle bulge * pi / n, so 0 is straight, 0.5 is Reuleaux-style and 1 is the
   circumscribed circle. Rounding is a fillet tangent to the two sides. */
function polygon(p) {
  const n = Math.round(p.sides), step = TAU / n;
  const phase = -TAU / 4 + step / 2;
  const corner = k => [Math.cos(phase + k * step), Math.sin(phase + k * step)];
  const halfAngle = p.bulge * Math.PI / n;
  const side = 2 * Math.sin(Math.PI / n);
  const apothem = Math.cos(Math.PI / n);

  if (halfAngle <= 1e-9) {
    const rho = p.round * apothem * 0.9999;
    if (rho <= 0) {
      const out = [];
      for (let k = 0; k < n; k++) out.push(line(corner(k), corner(k + 1)));
      return out;
    }
    const d = (apothem - rho) / apothem;
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = phase + k * step, cx = d * Math.cos(c), cy = d * Math.sin(c);
      const a0 = c - Math.PI / n, a1 = c + Math.PI / n;
      out.push(arcPiece(cx, cy, rho, a0, a1));
      const c2 = c + step, nx = d * Math.cos(c2), ny = d * Math.sin(c2);
      out.push(line([cx + rho * Math.cos(a1), cy + rho * Math.sin(a1)],
        [nx + rho * Math.cos(c2 - Math.PI / n), ny + rho * Math.sin(c2 - Math.PI / n)]));
    }
    return out;
  }

  /* Each side is an arc of radius ra, centred on the far side of the origin. */
  const ra = side / (2 * Math.sin(halfAngle));
  const centre = k => {
    const m = phase + (k + 0.5) * step, dist = ra * Math.cos(halfAngle) - apothem;
    return [-dist * Math.cos(m), -dist * Math.sin(m)];
  };
  const inradius = ra - Math.hypot(...centre(0));
  const rho = p.round * inradius * 0.9999;
  const angle = (c, q) => Math.atan2(q[1] - c[1], q[0] - c[0]);
  const up = (a, ref) => { while (a < ref) a += TAU; return a; };

  if (rho <= 0) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const c = centre(k), a0 = angle(c, corner(k)), a1 = up(angle(c, corner(k + 1)), a0);
      out.push(arcPiece(c[0], c[1], ra, a0, a1));
    }
    return out;
  }

  /* The fillet centre sits on the ray through the corner, at ra - rho from the
     centres of both side arcs. The tangent points lie on the lines from those
     centres through the fillet centre. */
  const fillet = k => {
    const dirA = phase + k * step, ux = Math.cos(dirA), uy = Math.sin(dirA);
    const c = centre(k), b = ux * c[0] + uy * c[1];
    const q = c[0] * c[0] + c[1] * c[1] - (ra - rho) * (ra - rho);
    const d = b + Math.sqrt(Math.max(0, b * b - q));
    return [d * ux, d * uy];
  };
  const tangent = (c, f) => {
    const l = Math.hypot(f[0] - c[0], f[1] - c[1]) || 1;
    return [c[0] + (f[0] - c[0]) / l * ra, c[1] + (f[1] - c[1]) / l * ra];
  };
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = centre(k), f0 = fillet(k), f1 = fillet(k + 1);
    const t0 = tangent(c, f0), t1 = tangent(c, f1);
    const a0 = angle(c, t0), a1 = up(angle(c, t1), a0);
    out.push(arcPiece(c[0], c[1], ra, a0, a1));
    const nc = centre(k + 1), nt = tangent(nc, f1);
    const b0 = angle(f1, t1), b1 = up(angle(f1, nt), b0);
    if (b1 - b0 > 1e-9) out.push(arcPiece(f1[0], f1[1], rho, b0, b1));
  }
  return out;
}

/* Samples a curve piece densely, for its length and for equal-arc vertices. */
function sampleCurve(piece, raw) {
  const xs = new Float64Array(raw + 1), ys = new Float64Array(raw + 1), cum = new Float64Array(raw + 1);
  for (let i = 0; i <= raw; i++) {
    const [x, y] = piece.f(piece.t0 + (piece.t1 - piece.t0) * i / raw);
    xs[i] = x; ys[i] = y;
    if (i) cum[i] = cum[i - 1] + Math.hypot(x - xs[i - 1], y - ys[i - 1]);
  }
  return { xs, ys, cum, length: cum[raw] };
}

function polyline(list, detail) {
  const samples = list.map(p => p.straight ? null : sampleCurve(p, Math.max(600, detail * 6)));
  const length = list.reduce((sum, p, i) => sum + (p.straight ? Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) : samples[i].length), 0);
  const curved = samples.reduce((sum, s) => sum + (s ? s.length : 0), 0);
  const px = [], py = [];
  const push = (x, y) => {
    const m = px.length;
    if (m && Math.hypot(x - px[m - 1], y - py[m - 1]) < length * 1e-9) return;
    px.push(x); py.push(y);
  };
  list.forEach((piece, index) => {
    if (piece.straight) { push(piece.a[0], piece.a[1]); return; }
    const s = samples[index];
    const count = Math.max(2, Math.round(detail * s.length / (curved || 1)));
    let j = 0;
    for (let i = 0; i < count; i++) {
      const target = s.length * i / count;
      while (s.cum[j + 1] < target) j++;
      const u = (target - s.cum[j]) / ((s.cum[j + 1] - s.cum[j]) || 1);
      push(s.xs[j] + u * (s.xs[j + 1] - s.xs[j]), s.ys[j] + u * (s.ys[j + 1] - s.ys[j]));
    }
  });
  /* Drop a closing vertex that repeats the first. */
  while (px.length > 3 && Math.hypot(px[px.length - 1] - px[0], py[py.length - 1] - py[0]) < length * 1e-9) { px.pop(); py.pop(); }
  return { px, py };
}

/* Turns a list of vertices into the arrays that rolling needs. */
function finish(x, y, perimeter) {
  const n = x.length;
  const len = new Float64Array(n), ang = new Float64Array(n), cum = new Float64Array(n + 1);
  const turn = new Float64Array(n), angU = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = x[j] - x[i], dy = y[j] - y[i];
    len[i] = Math.hypot(dx, dy);
    ang[i] = Math.atan2(dy, dx);
    cum[i + 1] = cum[i] + len[i];
  }
  for (let i = 0; i < n; i++) {
    let d = ang[i] - ang[(i + n - 1) % n];
    while (d > Math.PI) d -= TAU;
    while (d <= -Math.PI) d += TAU;
    turn[i] = d;
  }
  angU[0] = ang[0];
  for (let i = 1; i < n; i++) angU[i] = angU[i - 1] + turn[i];

  /* The tangent angle at the two ends of each edge. A smooth vertex shares its
     turn between its two edges, and a corner keeps it as a jump. */
  const sharp = new Uint8Array(n), thA = new Float64Array(n), thB = new Float64Array(n);
  for (let i = 0; i < n; i++) sharp[i] = Math.abs(turn[i]) > SHARP ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    thA[i] = angU[i] - (sharp[i] ? 0 : turn[i] / 2);
    thB[i] = angU[i] + (sharp[j] ? 0 : turn[j] / 2);
  }

  /* Curvature on each edge. A corner's turn is a jump, so it does not count. */
  const kappa = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    kappa[i] = ((sharp[i] ? 0 : turn[i]) + (sharp[j] ? 0 : turn[j])) / (2 * len[i]);
  }
  return { n, x, y, len, ang, cum, turn, sharp, thA, thB, kappa, P: perimeter };
}

export function buildShape(type, params, size, detail = 1024) {
  const p = { ...defaultParams(type), ...params };
  const { px, py } = polyline(pieces(type, p), detail);
  /* Size is the perimeter, exactly, so that the ratio of two sizes is exact. */
  let raw = 0;
  for (let i = 0; i < px.length; i++) {
    const j = (i + 1) % px.length;
    raw += Math.hypot(px[j] - px[i], py[j] - py[i]);
  }
  const k = size / raw, n = px.length, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = px[i] * k; y[i] = py[i] * k; }
  const shape = finish(x, y, size);
  shape.type = type;
  shape.params = p;
  shape.scale = k;
  shape.polar = makePolar(shape);
  shape.foci = fociOf(type, p, k);
  return shape;
}

/* The same outline traversed the other way, for rolling outside. Vertex i is the
   base shape's vertex n - i. Depth tests still use the base shape's table. */
export function reversed(shape) {
  const n = shape.n, x = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { const k = (n - i) % n; x[i] = shape.x[k]; y[i] = shape.y[k]; }
  const rev = finish(x, y, shape.P);
  rev.base = shape;
  rev.polar = shape.polar;
  return rev;
}

/* Snap targets on a shape. A pen may sit on the centre, a focus or a corner. */
function fociOf(type, p, k) {
  if (type === 'ellipse') {
    const f = Math.sqrt(Math.max(0, p.stretch * p.stretch - 1)) * k;
    return f > 1e-9 ? [[f, 0], [-f, 0]] : [];
  }
  return [];
}

export function cornersOf(shape) {
  const out = [];
  for (let i = 0; i < shape.n; i++) if (shape.sharp[i] && shape.turn[i] > 0) out.push([shape.x[i], shape.y[i]]);
  return out;
}

/* A pseudo-angle: monotonic with the true angle, in [0, 4), with no trigonometry. */
function pseudo(x, y) {
  const d = Math.abs(x) + Math.abs(y);
  if (d === 0) return 0;
  const q = x / d;
  return y >= 0 ? 1 - q : 3 + q;
}

/* Bins by pseudo-angle, each naming the edge whose ray span holds the bin's start. */
function makePolar(shape) {
  const { n, x, y } = shape, B = Math.max(1024, n * 4);
  const va = new Float64Array(n), first = new Int32Array(B);
  let lowest = 0;
  for (let i = 0; i < n; i++) {
    va[i] = pseudo(x[i], y[i]);
    if (va[i] < va[lowest]) lowest = i;
  }
  /* Walk the vertices in angle order from the lowest pseudo-angle. */
  const order = new Int32Array(n), sorted = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const k = (lowest + i) % n;
    order[i] = k;
    sorted[i] = va[k];
  }
  sorted[n] = sorted[0] + 4;
  let j = 0;
  for (let b = 0; b < B; b++) {
    const a = b / B * 4;
    while (j + 1 < n && sorted[j + 1] <= a) j++;
    first[b] = j;
  }
  return { B, first, order, sorted, n };
}

/* The position in angle order of the edge that the ray at pseudo-angle a meets. */
function edgeSlot(pol, a) {
  if (a < pol.sorted[0]) return pol.n - 1;
  let j = pol.first[Math.floor(a / 4 * pol.B) % pol.B];
  while (j + 1 < pol.n && pol.sorted[j + 1] <= a) j++;
  return j;
}

/* Signed distance from a point to the edge met by the ray from the origin through
   it, positive inside. Exact on that edge, and a close bound near a corner. */
export function depthInside(shape, px, py) {
  const pol = shape.polar, src = shape.base || shape;
  const v = pol.order[edgeSlot(pol, pseudo(px, py))], w = v + 1 === pol.n ? 0 : v + 1;
  const ax = src.x[v], ay = src.y[v], ex = src.x[w] - ax, ey = src.y[w] - ay;
  return (ex * (py - ay) - ey * (px - ax)) / (src.len[v] || 1);
}

/* The base edge met by the ray through a point, for moving the contact. */
export function edgeAt(shape, px, py) {
  const pol = shape.polar;
  return pol.order[edgeSlot(pol, pseudo(px, py))];
}

export function bounds(shape) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, far = 0;
  for (let i = 0; i < shape.n; i++) {
    const x = shape.x[i], y = shape.y[i];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    const r = Math.hypot(x, y); if (r > far) far = r;
  }
  return { minX, maxX, minY, maxY, far };
}

/* True when no vertex turns the wrong way, beyond the error of sampling. */
export function isConvex(shape) {
  for (let i = 0; i < shape.n; i++) if (shape.turn[i] < -1e-6) return false;
  return true;
}
