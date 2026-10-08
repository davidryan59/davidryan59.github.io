/* Driver mixes: which cars on a ring get which driver type. */

import { HUMAN, SELFISH, COORDINATED } from './drivers.js';

// Rounds to the nearest whole number, and a half to the even one, as
// Python's round() does, so car counts match the reference model.
export function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/* Driver types for n cars. round(avShare × n) of them drive themselves,
   at random places round the ring. avMix splits those cars by share,
   as [[type, share], ...], and the last type takes what the rounding
   leaves. This mirrors make_types in the reference model. */
export function assignTypes(n, avShare, avMix, rng) {
  const types = new Uint8Array(n).fill(HUMAN);
  const k = roundHalfEven(avShare * n);
  if (k === 0) return types;
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let q = 0; q < k; q++) {
    const r = q + rng.int(n - q);
    [idx[q], idx[r]] = [idx[r], idx[q]];
  }
  let pos = 0;
  avMix.forEach(([type, share], m) => {
    const count = m === avMix.length - 1 ? k - pos : roundHalfEven(share * k);
    for (let q = 0; q < count; q++) types[idx[pos + q]] = type;
    pos += count;
  });
  return types;
}

// The app's mix: shares of all cars that are coordinated and selfish, with
// humans making up the rest. A point in the mix triangle.
export function mixTypes(n, { coordinated, selfish }, rng) {
  const av = coordinated + selfish;
  return assignTypes(n, av, av > 0 ? [[SELFISH, selfish / av], [COORDINATED, coordinated / av]] : [], rng);
}
