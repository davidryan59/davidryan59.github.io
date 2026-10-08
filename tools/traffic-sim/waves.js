/* Measures of stop-and-go waves on a ring, shared by calibrate.js and
   checks.js. */

export const WAVE_SWING = 1.5;   // m/s: a swing above this, rising with density, means waves

// The speed in each of `cells` cells of lane 0: the speed of the first car
// at or ahead of the cell's centre.
export function speedField(ring, cells) {
  const out = new Float64Array(cells), o = ring.order[0], m = ring.count[0];
  if (m === 0) return out;
  let k = 0;
  for (let c = 0; c < cells; c++) {
    const x = (c + 0.5) * ring.L / cells;
    while (k < m && ring.s[o[k]] < x) k++;
    out[c] = ring.v[o[k < m ? k : 0]];
  }
  return out;
}

// The wave speed (m/s, negative upstream) from speed fields sampled once a
// second: the shift that best correlates each field with the one `lag`
// seconds later, refined by a parabola through the best three shifts.
export function waveSpeed(fields, L, lag = 10) {
  const cells = fields[0].length, cell = L / cells;
  let mean = 0;
  for (const f of fields) for (const x of f) mean += x;
  mean /= fields.length * cells;
  const lo = Math.round(-25 * lag / cell), hi = Math.round(10 * lag / cell);
  const score = [];
  for (let d = lo; d <= hi; d++) {
    let sum = 0;
    for (let t = 0; t + lag < fields.length; t++) {
      const a = fields[t], b = fields[t + lag];
      for (let c = 0; c < cells; c++) sum += (a[c] - mean) * (b[((c + d) % cells + cells) % cells] - mean);
    }
    score.push(sum);
  }
  const k = score.indexOf(Math.max(...score));
  let d = lo + k;
  if (k > 0 && k < score.length - 1) {
    const [y0, y1, y2] = [score[k - 1], score[k], score[k + 1]];
    d += 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2);
  }
  return d * cell / lag;
}

// The first of rows { d, swing } in rising density where the swing passes
// WAVE_SWING and is at least 1.5 times the least swing at any lower
// density. The second test matters on two lanes, where overtaking makes
// speeds swing in light traffic. null when no row qualifies.
export function waveOnset(rows) {
  let least = Infinity;
  for (const r of rows) {
    if (r.swing > WAVE_SWING && r.swing >= 1.5 * least) return r;
    least = Math.min(least, r.swing);
  }
  return null;
}
