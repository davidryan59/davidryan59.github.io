/* Human drivers who differ. Each human has a desired speed, a time gap, an
   acceleration, a comfortable braking, a reaction time and a politeness,
   each drawn from its own distribution. One hidden assertiveness score
   links them: an assertive driver wants a higher speed, accelerates and
   brakes harder, keeps a shorter time gap and reacts faster.

   The link strength λ runs from 0 to 1. Each trait's score on the normal
   scale is z = w √λ A + √(1 − w²λ) e, where A is the driver's
   assertiveness, e is noise for that trait alone, and w is the trait's
   loading: +1 or −1 for a trait that rises or falls with assertiveness.
   Two traits with loadings ±1 then correlate by λ on the normal scale.
   λ = 0 makes the traits independent, and λ = 1 sets every trait from A.

   A distribution can keep only the draws between two percentiles. The score
   z maps to a probability, the probability is squeezed into that range, and
   the trait is the distribution's quantile there. Each driver uses seven
   normal draws whatever the distributions, so changing one trait's spread
   leaves every other trait of every driver unchanged. */

export const TRAITS = ['desiredSpeed', 'timeGap', 'acceleration', 'braking', 'reactionTime', 'politeness'];

// The standard normal distribution function, through the complementary
// error function of Numerical Recipes (relative error below 1.2e-7).
export function normalCdf(z) {
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.5 * x);
  const r = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return z >= 0 ? 1 - 0.5 * r : 0.5 * r;
}

// Its inverse, by Acklam's rational approximation (relative error below 1.2e-9).
const QA = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const QB = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const QC = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549671010173382e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const QD = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
export function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const tail = q => (((((QC[0] * q + QC[1]) * q + QC[2]) * q + QC[3]) * q + QC[4]) * q + QC[5]) /
    ((((QD[0] * q + QD[1]) * q + QD[2]) * q + QD[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5, r = q * q;
  return (((((QA[0] * r + QA[1]) * r + QA[2]) * r + QA[3]) * r + QA[4]) * r + QA[5]) * q /
    (((((QB[0] * r + QB[1]) * r + QB[2]) * r + QB[3]) * r + QB[4]) * r + 1);
}

/* The trait for normal score z. A distribution is one of
     { dist: 'fixed', value }
     { dist: 'normal', mean, sd }
     { dist: 'lognormal', median, sigma }   sigma: the spread of the natural log
   with optional percentiles: [low, high], in per cent, the range kept. */
export function traitValue(spec, z) {
  if (spec.dist === 'fixed') return spec.value;
  const spread = spec.dist === 'normal' ? spec.sd : spec.sigma;
  if (spread === 0) return spec.dist === 'normal' ? spec.mean : spec.median;
  const [lo, hi] = spec.percentiles || [0, 100];
  const q = lo === 0 && hi === 100 ? z : normalQuantile((lo + (hi - lo) * normalCdf(z)) / 100);
  if (spec.dist === 'normal') return spec.mean + spec.sd * q;
  if (spec.dist === 'lognormal') return spec.median * Math.exp(spec.sigma * q);
  throw new Error(`unknown distribution ${spec.dist}`);
}

/* Draws n drivers. human: the human group of the parameters, with link and
   traits. Returns one Float64Array per trait, indexed by car. */
export function drawTraits(human, n, rng) {
  const out = {};
  for (const name of TRAITS) out[name] = new Float64Array(n);
  const link = human.link;
  for (let i = 0; i < n; i++) {
    const A = rng.normal();
    for (const name of TRAITS) {
      const e = rng.normal(), spec = human.traits[name], w = spec.assertive || 0;
      const z = w * Math.sqrt(link) * A + Math.sqrt(1 - w * w * link) * e;
      out[name][i] = traitValue(spec, z);
    }
  }
  return out;
}

// The median of a distribution, with its percentiles taken into account.
export function traitMedian(spec) {
  return traitValue(spec, 0);
}
