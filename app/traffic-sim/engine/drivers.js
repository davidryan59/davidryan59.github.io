/* The driver models. Humans follow the Intelligent Driver Model (Treiber,
   Hennecke and Helbing 2000) with a response lag and noise. Self-driving
   cars follow a constant-time-gap controller with an actuator lag, capped
   by Gipps's safe speed (Gipps 1981). Lane changes follow MOBIL (Kesting,
   Treiber and Helbing 2007), with the politeness factor set by driver type.
   Units are metres, seconds and metres per second throughout.

   Six driver types exist. The app offers three of them: human, coordinated
   and selfish. Timid, cooperative and absorber are kept so that the engine
   reproduces every column of the research tables. */

export const HUMAN = 0, SELFISH = 1, TIMID = 2, COOPERATIVE = 3, COORDINATED = 4, ABSORBER = 5;
export const TYPE_NAMES = ['human', 'selfish', 'timid', 'cooperative', 'coordinated', 'absorber'];

/* A self-driving car's controller profile. A coordinated car uses the
   platoon profile behind another coordinated car. Elsewhere it uses the
   cooperative profile, or the absorber profile when the ring's absorber
   switch is on. */
export const P_SELFISH = 0, P_TIMID = 1, P_COOPERATIVE = 2, P_PLATOON = 3, P_ABSORBER = 4, P_HUMAN = 5;
export const PROFILE_NAMES = ['selfish', 'timid', 'cooperative', 'platoon', 'absorber', 'human'];

export const DEFAULTS = {
  dt: 0.1,               // fixed time step (s)
  carLength: 5,
  speedLimit: 30,        // a human's desired speed, and the self-driving cars' limit
  human: {
    T: 1.2,              // time gap (s)
    a: 1.0,              // acceleration (m/s²)
    b: 1.5,              // comfortable braking (m/s²)
    s0: 2,               // jam gap (m)
    delta: 4,            // acceleration exponent
    minGap: 0.1,         // the gap below which IDM stops growing its braking (m)
    maxAccel: 3,
    maxBrake: 9,
    lag: 0.5,            // first-order response lag (s)
    noise: 0.3           // acceleration noise per step (m/s²)
  },
  av: {
    s0: 2,
    limitGain: 0.5,      // the pull towards the speed limit (1/s)
    maxAccel: 2,
    maxBrake: 8,
    lag: 0.4,            // actuator lag (s)
    hardBrake: 2,        // a command below minus this, and falling, ...
    brakeLag: 0.2,       // ... acts with this shorter lag (s)
    noise: 0.02,
    safeBrake: 7,        // the braking Gipps's cap assumes for leader and follower (m/s²)
    reaction: 0.5,       // reaction time in the cap (s)
    reactionV2V: 0.3,    // the same behind a coordinated leader
    safeMargin: 1,       // the gap the cap keeps at a stop (m)
    averageTime: 60      // the absorber's averaging time for its own speed (s)
  },
  // Controller gains: time gap T (s), gap gain k1 (1/s²), speed-difference
  // gain k2 (1/s), own-average gain kU (1/s), and the share of the leader's
  // command fed forward over V2V, ff.
  profiles: {
    selfish: { T: 0.7, k1: 0.20, k2: 0.50, kU: 0, ff: 0 },
    timid: { T: 2.0, k1: 0.20, k2: 0.80, kU: 0, ff: 0 },
    cooperative: { T: 1.2, k1: 0.20, k2: 0.80, kU: 0, ff: 0 },
    platoon: { T: 0.6, k1: 0.20, k2: 0.80, kU: 0, ff: 0.8 },
    absorber: { T: 2.0, k1: 0.02, k2: 0.30, kU: 0.30, ff: 0 }
  },
  mobil: {
    threshold: 0.1,      // the least gain worth a lane change (m/s²)
    safeBrake: 4,        // the hardest braking a lane change may force on anyone (m/s²)
    cooldown: 4,         // the least time between one car's lane changes (s)
    politeness: { human: 0.25, selfish: 0, timid: 1, cooperative: 1, coordinated: 1, absorber: 1 }
  },
  tap: { brake: 4, time: 2 }   // a tap on a car: brake this hard (m/s²) for this long (s)
};

// The defaults with some values replaced, group by group:
// makeParams({ human: { T: 1.4 }, mobil: { politeness: { human: 0.5 } } }).
export function makeParams(over = {}) {
  const merge = (base, add) => {
    const out = {};
    for (const key of Object.keys(base)) {
      const b = base[key], a = add ? add[key] : undefined;
      out[key] = b && typeof b === 'object' ? merge(b, a) : (a === undefined ? b : a);
    }
    return out;
  };
  return merge(DEFAULTS, over);
}

export function profileFor(type, leaderType, absorb) {
  switch (type) {
    case HUMAN: return P_HUMAN;
    case SELFISH: return P_SELFISH;
    case TIMID: return P_TIMID;
    case COOPERATIVE: return P_COOPERATIVE;
    case ABSORBER: return P_ABSORBER;
    default:
      if (leaderType === COORDINATED) return P_PLATOON;
      return absorb ? P_ABSORBER : P_COOPERATIVE;
  }
}

/* Flattens the parameters into the numbers the step loop reads, so the hot
   path touches no nested objects. */
export function compileParams(par) {
  const order = ['selfish', 'timid', 'cooperative', 'platoon', 'absorber'];
  const col = key => Float64Array.from(order, name => par.profiles[name][key]);
  const h = par.human, av = par.av;
  return {
    dt: par.dt, len: par.carLength, vMax: par.speedLimit,
    hT: h.T, hA: h.a, hS0: h.s0, hDelta: h.delta, hMinGap: h.minGap, hMaxAccel: h.maxAccel,
    hMaxBrake: h.maxBrake, hLag: h.lag, hNoise: h.noise, hSqrtAB: Math.sqrt(h.a * h.b),
    aS0: av.s0, aLimitGain: av.limitGain, aMaxAccel: av.maxAccel, aMaxBrake: av.maxBrake,
    aLag: av.lag, aHardBrake: av.hardBrake, aBrakeLag: av.brakeLag, aNoise: av.noise,
    aSafeBrake: av.safeBrake, aReaction: av.reaction, aReactionV2V: av.reactionV2V,
    aSafeMargin: av.safeMargin, aAverageTime: av.averageTime,
    pT: col('T'), pK1: col('k1'), pK2: col('k2'), pKU: col('kU'), pFF: col('ff'),
    politeness: Float64Array.from(TYPE_NAMES, name => par.mobil.politeness[name]),
    mThreshold: par.mobil.threshold, mSafeBrake: par.mobil.safeBrake, mCooldown: par.mobil.cooldown,
    tapBrake: par.tap.brake, tapTime: par.tap.time
  };
}

/* The acceleration car i asks for behind car j at the given gap, before
   noise and lag. j = -1 means an empty road ahead, with an infinite gap.
   The step loop and MOBIL's what-if tests both call this, so a lane change
   is judged by the same model that drives the car. */
export function command(ring, i, j, gap) {
  const c = ring.c;
  const v = ring.v[i];
  const vl = j < 0 ? v : ring.v[j];
  const type = ring.type[i];

  if (type === HUMAN) {
    const sStar = c.hS0 + Math.max(0, v * c.hT + v * (v - vl) / (2 * c.hSqrtAB));
    const r = v / c.vMax;
    const free = c.hDelta === 4 ? (r * r) * (r * r) : Math.pow(r, c.hDelta);
    const q = sStar / Math.max(gap, c.hMinGap);
    const a = c.hA * (1 - free - q * q);
    return a < -c.hMaxBrake ? -c.hMaxBrake : a > c.hMaxAccel ? c.hMaxAccel : a;
  }

  const k = profileFor(type, j < 0 ? -1 : ring.type[j], ring.absorb);
  let u = c.pK1[k] * (gap - c.aS0 - c.pT[k] * v) + c.pK2[k] * (vl - v) + c.pKU[k] * (ring.U[i] - v);
  if (j >= 0 && c.pFF[k] !== 0) u += c.pFF[k] * ring.u[j];
  u = Math.min(u, c.aLimitGain * (c.vMax - v));
  const tau = k === P_PLATOON ? c.aReactionV2V : c.aReaction;
  const bt = c.aSafeBrake * tau;
  const vSafe = -bt + Math.sqrt(Math.max(bt * bt + vl * vl + 2 * c.aSafeBrake * (gap - c.aSafeMargin), 0));
  u = Math.min(u, (vSafe - v) / tau);
  return u < -c.aMaxBrake ? -c.aMaxBrake : u > c.aMaxAccel ? c.aMaxAccel : u;
}
