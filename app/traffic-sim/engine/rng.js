/* Seeded random numbers for the traffic engine. The generator is sfc32
   (Chris Doty-Humphrey's small fast counting generator), seeded through a
   splitmix32 hash, so one seed gives the same stream in every browser and
   in Node. Normal deviates come from Marsaglia's polar method. */

// Mixes any number of integers or strings into one 32-bit seed.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 0x01000193);
    h = Math.imul(h ^ 0xff, 0x01000193);
  }
  return fmix(h);
}

function fmix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function makeRng(seed) {
  let x = seed >>> 0;
  const split = () => fmix(x = (x + 0x9e3779b9) | 0);
  let a = split(), b = split(), c = split(), d = 1;
  function next() {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }
  for (let k = 0; k < 15; k++) next();

  let spare = 0, hasSpare = false;
  const uniform = () => next() / 4294967296;
  return {
    uniform,
    // A whole number from 0 to n - 1.
    int: n => Math.floor(uniform() * n),
    normal() {
      if (hasSpare) { hasSpare = false; return spare; }
      let p, q, r;
      do {
        p = 2 * uniform() - 1;
        q = 2 * uniform() - 1;
        r = p * p + q * q;
      } while (r >= 1 || r === 0);
      const f = Math.sqrt(-2 * Math.log(r) / r);
      spare = q * f;
      hasSpare = true;
      return p * f;
    }
  };
}
