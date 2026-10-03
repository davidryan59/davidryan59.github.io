/* Structural checks for the 146 bundled OFF models. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const modelDir = path.join(root, 'app', 'noble', 'models');
const files = fs.readdirSync(modelDir).filter(file => file.endsWith('.off'));
const paperCatalogue = JSON.parse(fs.readFileSync(path.join(__dirname, 'paper-catalogue.json'), 'utf8'));
let checks = 0;

function assert(condition, message) {
  checks++;
  if (!condition) throw new Error(message);
}

function parse(file) {
  const lines = fs.readFileSync(path.join(modelDir, file), 'utf8').split(/\r?\n/)
    .map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  assert(lines.shift() === 'OFF', `${file}: missing OFF header`);
  const [nv, nf] = lines.shift().split(/\s+/).map(Number);
  const vertices = lines.splice(0, nv).map(line => line.split(/\s+/).slice(0, 3).map(Number));
  const faces = lines.slice(0, nf).map(line => { const values = line.split(/\s+/).map(Number); return values.slice(1, values[0] + 1); });
  return { vertices, faces };
}

assert(files.length === 146, `expected 146 models, found ${files.length}`);
assert(Object.keys(paperCatalogue).length === 146, `expected 146 paper entries, found ${Object.keys(paperCatalogue).length}`);
for (const file of files) {
  const name = path.basename(file, '.off');
  assert(paperCatalogue[name], `${file}: missing from paper catalogue`);
  assert(paperCatalogue[name].paperSymmetry && paperCatalogue[name].dual, `${file}: incomplete paper metadata`);
  const { vertices, faces } = parse(file);
  assert(vertices.length >= 4, `${file}: fewer than four vertices`);
  assert(faces.length >= 4, `${file}: fewer than four faces`);
  assert(vertices.every(v => v.length === 3 && v.every(Number.isFinite)), `${file}: invalid vertex`);
  assert(faces.every(face => face.length === faces[0].length), `${file}: faces are not congruent in vertex count`);
  assert(faces.every(face => face.every(v => Number.isInteger(v) && v >= 0 && v < vertices.length)), `${file}: invalid face index`);
  const incidences = new Map();
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length];
    const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
    incidences.set(edge, (incidences.get(edge) || 0) + 1);
  }
  assert([...incidences.values()].every(count => count === 2), `${file}: an edge does not meet exactly two faces`);
  const q = 2 * incidences.size / vertices.length;
  assert(Number.isInteger(q), `${file}: vertex degree is not integral`);
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function stephanoid(n, p, q, kind) {
  const vertices = [];
  const faces = [];
  const seen = new Set();
  const addFace = face => {
    face = face.map(i => (i % vertices.length + vertices.length) % vertices.length);
    const key = [...face].sort((a, b) => a - b).join(':');
    if (!seen.has(key)) { seen.add(key); faces.push(face); }
  };
  if (kind === 'PC') {
    const a = i => (i % n + n) % n;
    const b = i => n + (i % n + n) % n;
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; vertices.push([Math.cos(a), Math.sin(a), 1]); }
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; vertices.push([Math.cos(a), Math.sin(a), -1]); }
    for (let r = 0; r < n; r++) {
      addFace([a(r), b(r + q), a(r + p), b(r + p - q)]);
      addFace([b(r), a(r + q), b(r + p), a(r + p - q)]);
    }
  } else {
    for (let i = 0; i < 2 * n; i++) { const a = Math.PI * i / n; vertices.push([Math.cos(a), Math.sin(a), i % 2 ? 1 : -1]); }
    for (let r = 0; r < n; r++) {
      addFace([2 * r, 2 * r + q, 2 * r + 2 * p, 2 * r + 2 * p - q]);
      addFace([2 * r + 1, 2 * r + 1 - q, 2 * r + 1 - 2 * p, 2 * r + 1 - 2 * p + q]);
    }
  }
  return { vertices, faces };
}

function checkStephanoid(n, p, q, kind) {
  const { vertices, faces } = stephanoid(n, p, q, kind);
  assert(vertices.length === 2 * n, `${kind}(${n},${p},${q}): wrong vertex count`);
  assert(faces.length === 2 * n, `${kind}(${n},${p},${q}): wrong face count`);
  assert(faces.every(face => face.length === 4), `${kind}(${n},${p},${q}): a face is not quadrilateral`);
  assert(faces.every(face => {
    const [a, b, c, d] = face.map(i => vertices[i]);
    const u = b.map((value, i) => value - a[i]);
    const v = c.map((value, i) => value - a[i]);
    const w = d.map((value, i) => value - a[i]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return Math.abs(cross[0] * w[0] + cross[1] * w[1] + cross[2] * w[2]) < 1e-9;
  }), `${kind}(${n},${p},${q}): a face is not planar`);
  const incidences = new Map();
  for (const face of faces) for (let i = 0; i < 4; i++) {
    const [a, b] = [face[i], face[(i + 1) % 4]].sort((x, y) => x - y);
    const edge = `${a}:${b}`;
    incidences.set(edge, (incidences.get(edge) || 0) + 1);
  }
  assert(incidences.size === 4 * n, `${kind}(${n},${p},${q}): wrong edge count`);
  assert([...incidences.values()].every(count => count === 2), `${kind}(${n},${p},${q}): an edge does not meet twice`);
}

let familyCases = 0;
for (let n = 5; n <= 18; n++) for (let p = 1; p < n; p++) for (let q = 1; q < p; q++) {
  if (gcd(gcd(n, p), q) !== 1) continue;
  if (2 * p - n < 2 * q && 2 * q < p) { checkStephanoid(n, p, q, 'PC'); familyCases++; }
  if (q % 2 === 1 && 2 * p - n < q && q < p) { checkStephanoid(n, p, q, 'AC'); familyCases++; }
}

console.log(`${checks} checks passed across ${files.length} exceptional models and ${familyCases} stephanoid cases`);
