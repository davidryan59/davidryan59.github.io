/* Writes renders/examples.html: a review page of rolling-shape examples, computed
   by engine.js. Run: node tools/roll-shapes/make-examples.js */
const fs = require('fs'), path = require('path'), E = require('./engine.js');
const S = E.SHAPES, gcd = (a, b) => b ? gcd(b, a % b) : a;
const defs = {
  c: () => S.circle(), f5: () => S.flower(5, .25), p: () => S.peanut(.45), e: () => S.ellipse(1, .6), f3: () => S.flower(3, .12), f3b: () => S.flower(3, .25),
};
function stat(o, i, so, si) {
  const laps = si / gcd(so, si), r = E.overlap(E.makeShape(defs[o](), so), E.makeShape(defs[i](), si), laps);
  return { clean: r.depth < 0.002, share: Math.round(r.share * 100), depth: +(r.depth * 100).toFixed(1), laps };
}
const pairs = [
  ['Small circle in a flower', 'f5', 'c', 120, 15],
  ['Larger circle in a flower', 'f5', 'c', 120, 40],
  ['Circle in a peanut', 'p', 'c', 120, 50],
  ['Circle too wide for the waist', 'p', 'c', 120, 60],
  ['Ellipse in a peanut', 'p', 'e', 120, 30],
  ['Flower in a flower', 'f5', 'f3', 120, 30],
  ['Flower in a circle', 'c', 'f3b', 120, 40],
];
const nonconvex = pairs.map(([title, o, i, so, si]) => ({ title, o, i, so, si, ...stat(o, i, so, si) }));
nonconvex.forEach(p => console.log(p.title, p.so, p.si, 'clean', p.clean, 'cross', p.share + '%', 'depth', p.depth + '%', 'laps', p.laps));
const engine = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, 'examples-template.html'), 'utf8')
  .replace('/*ENGINE*/', () => engine).replace('/*NONCONVEX*/', () => 'const NONCONVEX = ' + JSON.stringify(nonconvex) + ';');
fs.mkdirSync(path.join(__dirname, 'renders'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'renders', 'examples.html'), page);
