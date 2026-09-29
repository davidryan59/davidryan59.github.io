/* Checks the sieve's rules in app/sieve/model.js against brute force.

   Run from anywhere: node tools/sieve/check-model.js

   It builds 400 random lists of chosen numbers, with removals and undos
   mixed in, some near the top of the grid at 10^15. For each list it checks
   that no chosen number is a multiple of one chosen before it. Then it
   fills a random block of a grid of random width, and checks every tile
   against kindOf(), which tests one number at a time. It also checks the
   example from the original prompt, Next prime, and the bases. It exits
   with 1 if anything fails. Needs only Node. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'app/sieve/model.js'), 'utf8'), sandbox, { filename: 'app/sieve/model.js' });
const S = sandbox.Sieve, C = S.CODES, LIMIT = S.LIMIT;

let seed = 12345, checks = 0, fails = 0;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function expect(ok, what) {
  checks++;
  if (!ok && fails++ < 10) console.log('FAIL', what);
}

// The code fill() should write for n, found one number at a time.
function codeOf(m, n) {
  if (n >= LIMIT) return C.NONE;
  const k = m.kindOf(n);
  if (k.kind === 'zero') return C.ZERO;
  if (k.kind === 'one') return C.ONE;
  if (k.kind === 'chosen') return 5 + 2 * k.entry.slot;
  if (k.kind === 'struck') return 4 + 2 * k.entry.slot;
  return C.GREY;
}

for (let t = 0; t < 400; t++) {
  const m = new S.Model(), high = t % 4 === 3, base = high ? between(0, LIMIT - 1e6) : 0;
  for (let k = between(0, 25); k > 0; k--) {
    const n = high && rnd() < 0.5 ? base + between(0, 1e5) : between(2, 60);
    if (m.isGrey(n)) m.choose(n);
    else if (rnd() < 0.3) m.remove(n);
    if (rnd() < 0.1) m.undo();
  }
  for (let i = 0; i < m.list.length; i++) {
    for (let j = 0; j < i; j++) expect(m.list[i].n % m.list[j].n !== 0, `${m.list[i].n} chosen after its factor ${m.list[j].n}`);
  }
  const width = [1, 2, 7, 10, 12, 30, 97, 1000, 1e9][between(0, 8)];
  const r0 = Math.floor((high ? base : between(0, 200)) / width), r1 = r0 + between(0, 30);
  const c0 = rnd() < 0.5 ? 0 : between(0, width - 1);
  const c1 = rnd() < 0.5 ? width - 1 : Math.min(width - 1, c0 + between(0, 50));
  const w = c1 - c0 + 1, h = r1 - r0 + 1;
  if (w * h > 3e5) continue;
  const out = new Int32Array(w * h);
  m.fill(width, r0, r1, c0, c1, out);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const n = (r0 + r) * width + c0 + c, want = codeOf(m, n);
      expect(out[r * w + c] === want, `width ${width}: tile ${n} is ${out[r * w + c]}, not ${want}`);
    }
  }
}

// The prompt's example: 3 green, then 4 blue, then 2 yellow.
const m = new S.Model();
[3, 4, 2].forEach(n => m.choose(n));
const owner = n => { const k = m.kindOf(n); return k.kind === 'struck' ? k.entry.n : k.kind; };
[[4, 'chosen'], [12, 3], [24, 3], [36, 3], [8, 4], [16, 4], [20, 4], [28, 4], [32, 4], [10, 2], [14, 2], [22, 2], [26, 2]]
  .forEach(([n, want]) => expect(owner(n) === want, `prompt example: ${n} belongs to ${owner(n)}, not ${want}`));
m.remove(3);
expect(owner(12) === 4 && owner(6) === 2 && m.kindOf(9).kind === 'grey', 'removing 3 recolours 12, 6 and 9');
m.undo();
expect(owner(12) === 3 && m.list.map(e => e.n).join() === '3,4,2', 'undo puts 3 back first');

// Next prime gives the primes in order.
const e = new S.Model(), got = [];
for (let i = 0; i < 25; i++) { const p = e.nextGrey(); got.push(p); e.choose(p); }
expect(got.join() === '2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97', 'Next prime: ' + got.join());

// Bases, including the top of the grid.
expect(S.write(3725, 60) === '1:02:05', 'base 60');
expect(S.write(10, 12) === '\u218A' && S.write(11, 12) === '\u218B', 'dozenal ten and eleven are Pitman digits');
expect(S.write(143, 12) === '\u218B\u218B' && S.write(144, 12) === '100' && S.write(131, 12) === '\u218A\u218B', 'dozenal places');
expect(S.write(10, 13) === 'a' && S.write(11, 16) === 'b', 'other bases keep letters');
expect(Object.keys(S.TURNED).every(ch => S.TURNED[ch] === { '\u218A': '2', '\u218B': '3' }[ch]), 'turned digits are 2 and 3');

// Reading numbers typed in a base, and carrying a width's digits to a new base.
expect(S.read('x0', 12) === 120 && S.read('\u218A\u218B', 12) === 131 && S.read('E', 12) === 11 && S.read('T', 12) === 10, 'dozenal input');
expect(S.read('ff', 16) === 255 && S.read('FF', 16) === 255 && S.read('g', 16) === null, 'hexadecimal input');
expect(S.read('1:02:05', 60) === 3725 && S.read('1:60', 60) === null && S.read('1:2:5', 60) === 3725, 'base 60 input');
expect(S.read('1,000', 10) === 1000 && S.read('12a', 10) === null && S.read('', 10) === null, 'decimal input');
expect(S.read('1000000000000000', 10) === Infinity && S.read('999999999999999', 10) === LIMIT - 1, 'input past the grid');
expect(S.read('7', 7) === null && S.read('66', 7) === 48, 'base 7 input');
expect(S.fromDigits(S.digitsOf(10, 10), 12) === 12 && S.fromDigits(S.digitsOf(10, 10), 60) === 60, 'width 10 keeps its digits');
expect(S.fromDigits(S.digitsOf(30, 10), 12) === 36 && S.digitsOf(15, 16).join() === '15', 'digits carried between bases');
expect(!S.showsDecimal(10) && !S.showsDecimal(12) && S.showsDecimal(16) && S.showsDecimal(2), 'which bases show decimals');
expect(S.write(LIMIT - 1, 16) === '38d7ea4c67fff', 'hexadecimal at the top');
expect(S.write(LIMIT - 1, 2).length === 50, 'binary at the top has 50 digits');
expect(S.grouped(LIMIT - 1) === '999,999,999,999,999', 'grouping');

console.log(`${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
