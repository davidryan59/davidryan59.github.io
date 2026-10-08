/* A ring road with one or more lanes: the closed layout of traffic-sim.
   The ring holds a fixed number of cars, so its length sets the density.
   Each call to step() advances it by one fixed step of 0.1 s:

   1. Each car updates its 60-second average speed.
   2. With two or more lanes, each car considers a lane change by MOBIL,
      one car at a time in index order, so each sees the moves before it.
   3. Each car finds its leader and asks for an acceleration (drivers.js),
      or the Human Driver Model's acceleration for a human when it is on.
      With keep left on, a car may not pass a car on its right. Then noise,
      or the brakes if a visitor tapped it.
   4. Lags, then the update of speed and position.
   5. A collision guard puts any car that overlaps its leader just behind it.
   6. The measures, while measuring, then each car's history and estimation
      errors for the Human Driver Model.

   A position runs from 0 to the ring's length, measured to the car's front
   along the ring. Every lane has the same length, and the view stretches
   each lane to fit its own drawn line. Lane 0 is the left lane, where
   traffic keeps left; a world that drives on the right mirrors the drawing,
   not the physics. Nothing here draws, so the same file runs in the browser
   and in Node. */

import { HUMAN, SELFISH, makeParams, compileParams, command, profileFor } from './drivers.js';
import { drawTraits } from './population.js';
import { makeRng, hashSeed } from './rng.js';

const HARD = -2;          // a deceleration that counts as hard braking (m/s²)
const SAMPLE_EVERY = 10;  // steps between speed samples, so once a second
const PARKED = 1e9;       // laneAge of a car that has never changed lane

export class Ring {
  /* length: metres. lanes: 1 or more. types: one driver type per car.
     seed: for the start positions and the noise. driverSeed: for each
     human's traits and estimation errors, the seed by default. absorb: the
     absorber switch on Coordinated Mode. keepLeft: the keep-left switch.
     params: values to replace in DEFAULTS. capacity: room for cars that
     addCar() adds later. */
  constructor({ length, lanes = 1, types, seed = 1, driverSeed = seed, absorb = false, keepLeft = true, params, capacity = 0 }) {
    const n = types.length, cap = Math.max(capacity, n);
    this.L = length;
    this.lanes = lanes;
    this.n = n;
    this.capacity = cap;
    this.absorb = absorb;
    this.keepLeft = keepLeft;
    this.par = makeParams(params);
    this.c = compileParams(this.par);
    this.rng = makeRng(seed);
    this.errorRng = makeRng(hashSeed('errors', driverSeed));
    this.time = 0;
    this.crashes = 0;        // since the start
    this.laneChanges = 0;    // since the start

    const f = () => new Float64Array(cap);
    this.s = f();            // position along the ring (m)
    this.v = f();            // speed (m/s)
    this.acc = f();          // acceleration (m/s²)
    this.u = f();            // last step's command, with noise: a platoon's V2V message
    this.uNext = f();
    this.U = f();            // the 60-second average speed
    this.gap = f();          // gap to the leader (m); Infinity for a car alone in its lane
    this.laneAge = f();      // time since the last lane change (s)
    this.brakeLeft = f();    // time left on a tap of the brakes (s)
    this.sNew = f();
    this.vNew = f();
    this.hitGap = f();
    this.hitV = f();
    this.hitList = new Int32Array(cap);
    this.type = new Uint8Array(cap);
    this.profile = new Uint8Array(cap);   // the controller each car used in the last step
    this.lane = new Uint8Array(cap);
    this.fromLane = new Uint8Array(cap);
    this.leader = new Int32Array(cap);    // -1 for a car alone in its lane
    this.rank = new Int32Array(cap);      // place in its lane's order
    this.order = Array.from({ length: lanes }, () => new Int32Array(cap));  // each lane's cars by position
    this.count = new Int32Array(lanes);
    this.type.set(types);

    // Each car's human traits, drawn whatever its type, so a car that the
    // view turns human mid-run drives with traits of its own.
    const traits = drawTraits(this.par.human, cap, makeRng(hashSeed('drivers', driverSeed)));
    this.desiredSpeed = traits.desiredSpeed;
    this.timeGap = traits.timeGap;
    this.acceleration = traits.acceleration;
    this.braking = traits.braking;
    this.reactionTime = traits.reactionTime;
    this.politeness = traits.politeness;
    this.sqrtAB = Float64Array.from(this.acceleration, (a, i) => Math.sqrt(a * this.braking[i]));

    // A reaction time acting as a lag sets each human's response lag, no
    // shorter than a step. The Human Driver Model's delay needs each car's
    // recent history, to look back by a reaction time, and each human's
    // estimation errors.
    const c = this.c;
    this.lag = Float64Array.from(this.reactionTime, t => c.hDelay ? c.dt : Math.max(t, c.dt));
    this.delay = c.hDelay ? this.reactionTime : new Float64Array(cap);
    this.errors = c.hDistanceError > 0 || c.hSpeedError > 0;
    this.hdm = this.errors || c.hAnticipate > 1 || this.delay.some(t => t > 0);
    this.slots = Math.floor(Math.max(...this.delay) / c.dt) + 2;
    this.slot = 0;           // the history slot that holds the present
    this.histS = new Float64Array(cap * this.slots);
    this.histV = new Float64Array(cap * this.slots);
    this.histA = new Float64Array(cap * this.slots);
    this.errS = f();         // the gap error's Wiener process
    this.errV = f();         // the closing-speed error's Wiener process
    if (this.errors) for (let i = 0; i < cap; i++) { this.errS[i] = this.errorRng.normal(); this.errV[i] = this.errorRng.normal(); }

    this.place();
    this.findLeaders();
    for (let i = 0; i < n; i++) {
      const j = this.leader[i];
      this.profile[i] = profileFor(this.type[i], j < 0 ? -1 : this.type[j], absorb);
      this.fillHistory(i);
    }
    this.resetStats();
  }

  /* Spreads the cars evenly, lane by lane, at the speed that suits the
     spacing, with up to half a metre of jitter. With one lane this is the
     reference model's start. */
  place() {
    const { n, lanes, L, c } = this;
    this.count.fill(0);
    for (let lane = 0; lane < lanes; lane++) {
      const inLane = Math.ceil((n - lane) / lanes);
      if (inLane <= 0) continue;
      const spacing = L / inLane;
      const v0 = Math.min(Math.max((spacing - c.len - 2) / 1.4, 0), c.vMax);
      for (let i = lane, k = 0; i < n; i += lanes, k++) {
        const x = (k + lane / lanes) * spacing + this.rng.uniform() - 0.5;
        this.s[i] = x - Math.floor(x / L) * L;
        this.v[i] = v0;
        this.U[i] = v0;
        this.lane[i] = this.fromLane[i] = lane;
        this.laneAge[i] = PARKED;
        this.order[lane][this.count[lane]++] = i;
      }
    }
    this.sortLanes();
  }

  // Fills every history slot of car i with its present state.
  fillHistory(i) {
    for (let k = 0, o = i; k < this.slots; k++, o += this.capacity) {
      this.histS[o] = this.s[i];
      this.histV[o] = this.v[i];
      this.histA[o] = this.acc[i];
    }
  }

  step() {
    const { n, c, s, v, U, acc, L } = this;
    const dt = c.dt;

    for (let i = 0; i < n; i++) U[i] += (v[i] - U[i]) * dt / c.aAverageTime;
    if (this.lanes > 1) this.changeLanes();
    this.findLeaders();

    const u = this.uNext, keepLeft = this.keepLeft && this.lanes > 1;
    for (let i = 0; i < n; i++) {
      const j = this.leader[i], human = this.type[i] === HUMAN;
      let cmd = human && this.hdm ? this.humanCommand(i) : command(this, i, j, this.gap[i]);
      if (keepLeft) cmd = this.keepLeftCap(i, this.lane[i], cmd);
      this.profile[i] = profileFor(this.type[i], j < 0 ? -1 : this.type[j], this.absorb);
      if (this.brakeLeft[i] > 0) {
        cmd = -c.tapBrake;
        this.brakeLeft[i] -= dt;
      } else {
        const noise = human ? c.hNoise : c.aNoise;
        if (noise !== 0) cmd += noise * this.rng.normal();
      }
      u[i] = cmd;
    }

    // A first-order lag between command and acceleration. A self-driving
    // car brakes hard through a shorter lag.
    const sNew = this.sNew, vNew = this.vNew;
    for (let i = 0; i < n; i++) {
      const ui = u[i], a0 = acc[i];
      const tau = this.type[i] === HUMAN ? this.lag[i]
        : ui < -c.aHardBrake && ui < a0 ? c.aBrakeLag : c.aLag;
      let a = a0 + (ui - a0) * dt / tau;
      let vn = v[i] + a * dt;
      if (vn <= 0) {
        vn = 0;
        if (a < 0) a = 0;
      }
      acc[i] = a;
      vNew[i] = vn;
      sNew[i] = s[i] + 0.5 * (v[i] + vn) * dt;
    }

    // The collision guard. A car that overlaps its leader goes 5 cm behind
    // it, no faster than the leader, and counts as a crash. Every case is
    // judged before any car moves, as in the reference model.
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const j = this.leader[i];
      if (j < 0) continue;
      let d = sNew[j] - sNew[i];
      d -= Math.floor(d / L) * L;
      if (d - c.len < 0) {
        this.hitList[hits] = i;
        this.hitGap[hits] = d - c.len;
        this.hitV[hits] = Math.min(vNew[i], vNew[j]);
        hits++;
      }
    }
    for (let h = 0; h < hits; h++) {
      const i = this.hitList[h];
      sNew[i] += this.hitGap[h] - 0.05;
      vNew[i] = this.hitV[h];
    }
    this.crashes += hits;

    const st = this.st;
    if (this.measuring) {
      st.crashes += hits;
      const sample = st.steps % SAMPLE_EVERY === 0;
      for (let i = 0; i < n; i++) {
        const vn = vNew[i], vo = v[i];
        if (vn * vn > vo * vo) st.pke += vn * vn - vo * vo;
        st.dist += sNew[i] - s[i];
        if (acc[i] < HARD) st.hard++;
        if (sample) {
          st.sumV += vn;
          st.sumV2 += vn * vn;
          st.carV[i] += vn;
          st.carV2[i] += vn * vn;
        }
      }
      if (sample) {
        st.samples += n;
        st.carSamples++;
      }
      st.steps++;
      st.carSteps += n;
    }

    for (let i = 0; i < n; i++) {
      const x = sNew[i];
      s[i] = x - Math.floor(x / L) * L;
      v[i] = vNew[i];
      this.laneAge[i] += dt;
    }
    this.uNext = this.u;
    this.u = u;
    this.time += dt;
    this.sortLanes();

    if (this.hdm) {
      this.slot = (this.slot + 1) % this.slots;
      const o = this.slot * this.capacity;
      this.histS.set(s.subarray(0, n), o);
      this.histV.set(v.subarray(0, n), o);
      this.histA.set(acc.subarray(0, n), o);
    }
    if (this.errors) {
      // Wiener processes of variance 1 (HDM eq. 7).
      const keep = Math.exp(-dt / c.hErrorTime), kick = Math.sqrt(2 * dt / c.hErrorTime);
      for (let i = 0; i < n; i++) {
        this.errS[i] = keep * this.errS[i] + kick * this.errorRng.normal();
        this.errV[i] = keep * this.errV[i] + kick * this.errorRng.normal();
      }
    }
  }

  /* The Human Driver Model's acceleration for human i (Treiber, Kesting and
     Helbing 2006). With reaction as a delay, the driver sees the road as it
     was one reaction time ago, interpolated between steps (eq. 2), and makes
     up for the delay by projecting their own speed forward at their old
     acceleration, and each gap forward at its old closing speed (eq. 9–11).
     With reaction as a lag, they see the road as it is now. Either way they
     misjudge each gap and closing speed with persistent errors (eq. 3–4),
     and respond to the cars ahead in their lane, up to the number
     anticipated, each through IDM's braking term with a renormalised jam
     gap and time gap (eq. 13–20). A pair of cars where either changed lane
     within the reaction time is seen as it is now: a lane change takes
     longer than a reaction time on a real road, though it is instant here. */
  humanCommand(i) {
    const c = this.c, cap = this.capacity, len = this.c.len, L = this.L;
    const react = this.delay[i];
    const back = react / c.dt, steps = Math.floor(back), beta = back - steps;
    const newer = ((this.slot - steps) % this.slots + this.slots) % this.slots * cap;
    const older = ((this.slot - steps - 1) % this.slots + this.slots) % this.slots * cap;
    const hs = this.histS, hv = this.histV;
    const pastS = j => {
      const s0 = hs[newer + j];
      let d = s0 - hs[older + j];
      if (d < 0) d += L;
      const x = s0 - beta * d;
      return x < 0 ? x + L : x;
    };
    const pastV = j => hv[newer + j] - beta * (hv[newer + j] - hv[older + j]);

    const vPast = pastV(i), aPast = this.histA[newer + i] - beta * (this.histA[newer + i] - this.histA[older + i]);
    const vSeen = Math.max(vPast + react * aPast, 0);
    const a = this.acceleration[i];
    const r = vSeen / this.desiredSpeed[i];
    let out = a * (1 - (c.hDelta === 4 ? (r * r) * (r * r) : Math.pow(r, c.hDelta)));

    const lane = this.lane[i], o = this.order[lane], m = this.count[lane];
    const ahead = Math.min(c.hAnticipate, m - 1);
    if (ahead > 0) {
      const g = c.hGamma[ahead];
      const T = this.timeGap[i] / g, s0 = c.hS0 / g, root = 2 * this.sqrtAB[i];
      const errS = this.errors ? Math.exp(c.hDistanceError * this.errS[i]) : 1;
      const errV = this.errors ? c.hSpeedError * this.errV[i] : 0;
      const sPast = pastS(i), moved = this.laneAge[i] < react;
      for (let k = 1, q = this.rank[i]; k <= ahead; k++) {
        q = q + 1 < m ? q + 1 : 0;
        const j = o[q];
        let gap, dv;
        if (moved || this.laneAge[j] < react) {
          gap = this.dist(this.s[i], this.s[j]) - k * len;
          dv = this.v[i] - this.v[j];
        } else {
          gap = this.dist(sPast, pastS(j)) - k * len;
          dv = vPast - pastV(j);
        }
        const dvSeen = dv + gap * errV;
        const gapSeen = gap * errS - react * dvSeen;
        const sStar = s0 + Math.max(0, vSeen * T + vSeen * dvSeen / root);
        const q2 = sStar / Math.max(gapSeen, c.hMinGap);
        out -= a * q2 * q2;
      }
    }
    return out < -c.hMaxBrake ? -c.hMaxBrake : out > c.hMaxAccel ? c.hMaxAccel : out;
  }

  /* Keep left's passing rule (Kesting, Treiber and Helbing 2007, eq. 5,
     mirrored). Car i in the given lane may not go faster than it could
     behind the car ahead in the lane to its right, while it is faster than
     that car and that car moves faster than queueing traffic. A car already
     alongside that car, a case the published rule leaves open, matches its
     speed over about a second instead. The rule only slows a car down, and
     never brakes it harder than MOBIL's safe limit. A selfish car breaks
     the rule when keeping to it would cost it more than undertakeGain.
     Returns the acceleration a, capped by the rule. */
  keepLeftCap(i, lane, a) {
    if (lane + 1 >= this.lanes) return a;
    const c = this.c, j = this.ahead(lane + 1, this.s[i]);
    if (j < 0) return a;
    const vi = this.v[i], vj = this.v[j];
    if (!(vi > vj && vj > c.mQueueSpeed)) return a;
    const gap = this.dist(this.s[i], this.s[j]) - c.len;
    const capped = Math.max(gap > 0 ? command(this, i, j, gap) : vj - vi, -c.mSafeBrake);
    if (capped >= a) return a;
    if (this.type[i] === SELFISH && a - capped > c.mUndertake) return a;
    return capped;
  }

  // The distance forward round the ring from position a to position b.
  dist(a, b) {
    const d = b - a;
    return d < 0 ? d + this.L : d;
  }

  // The car in a lane just ahead of position x, and the car just behind it,
  // in this.aheadCar and this.behindCar; -1 for an empty lane. A car at x
  // itself counts as behind. Returns the car ahead.
  ahead(lane, x) {
    const s = this.s, o = this.order[lane], m = this.count[lane];
    if (m === 0) return (this.aheadCar = this.behindCar = -1);
    let lo = 0, hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[o[mid]] > x) hi = mid; else lo = mid + 1;
    }
    this.behindCar = o[lo === 0 ? m - 1 : lo - 1];
    return (this.aheadCar = o[lo === m ? 0 : lo]);
  }

  // Keeps each lane's order sorted by position. Cars rarely pass within a
  // lane, so insertion sort does little work; a car that crosses the start
  // line moves from the end of the order to the front.
  sortLanes() {
    const s = this.s;
    for (let lane = 0; lane < this.lanes; lane++) {
      const o = this.order[lane], m = this.count[lane];
      for (let k = 1; k < m; k++) {
        const i = o[k], x = s[i];
        let q = k - 1;
        while (q >= 0 && s[o[q]] > x) {
          o[q + 1] = o[q];
          q--;
        }
        o[q + 1] = i;
      }
      for (let k = 0; k < m; k++) this.rank[o[k]] = k;
    }
  }

  findLeaders() {
    const s = this.s, len = this.c.len;
    for (let lane = 0; lane < this.lanes; lane++) {
      const o = this.order[lane], m = this.count[lane];
      for (let k = 0; k < m; k++) {
        const i = o[k];
        if (m === 1) {
          this.leader[i] = -1;
          this.gap[i] = Infinity;
        } else {
          const j = o[k + 1 < m ? k + 1 : 0];
          this.leader[i] = j;
          this.gap[i] = this.dist(s[i], s[j]) - len;
        }
      }
    }
  }

  changeLanes() {
    const c = this.c;
    for (let i = 0; i < this.n; i++) {
      if (this.laneAge[i] < c.mCooldown || this.brakeLeft[i] > 0) continue;
      const from = this.lane[i];
      let best = -1, bestMargin = 0;
      for (let to = from - 1; to <= from + 1; to += 2) {
        if (to < 0 || to >= this.lanes) continue;
        const margin = this.laneGain(i, from, to);
        if (margin > bestMargin) {
          best = to;
          bestMargin = margin;
        }
      }
      if (best >= 0) this.moveToLane(i, best);
    }
  }

  /* MOBIL's incentive for car i to move to another lane, less the threshold
     the move must pass, so the car moves when this is above zero. -Infinity
     where the move would leave a gap ahead or behind of no more than the
     least gap, or force the car or its new follower to brake harder than
     the safe limit.

     Without keep left the rule is symmetric: the car's own gain in
     acceleration, plus its politeness times the gains of the follower it
     leaves and the follower it joins, against the threshold. With keep left
     it is the asymmetric rule (Kesting, Treiber and Helbing 2007, eq. 6–7,
     mirrored). The passing rule caps each of the car's accelerations. A
     move right counts only the follower it joins, against the threshold
     plus a bias. A move left counts only the follower it leaves, against
     the threshold less the bias. */
  laneGain(i, from, to) {
    const { s, c } = this;
    const x = s[i], len = c.len;

    const lead = this.ahead(to, x), back = this.behindCar, mt = this.count[to];
    const gapNew = lead < 0 ? Infinity : this.dist(x, s[lead]) - len;
    const gapBack = back < 0 ? Infinity : this.dist(s[back], x) - len;
    if (gapNew <= c.mMinGap || gapBack <= c.mMinGap) return -Infinity;
    let aNew = command(this, i, lead, gapNew);
    if (aNew < -c.mSafeBrake) return -Infinity;

    let joined = 0, left = 0;
    if (back >= 0) {
      const backAfter = command(this, back, i, gapBack);
      if (backAfter < -c.mSafeBrake) return -Infinity;
      const backLead = mt > 1 ? lead : -1;
      const backBefore = command(this, back, backLead,
        backLead < 0 ? Infinity : this.dist(s[back], s[backLead]) - len);
      joined = backAfter - backBefore;
    }

    const of = this.order[from], mf = this.count[from], k = this.rank[i];
    let aOld;
    if (mf > 1) {
      const oldLead = of[k + 1 < mf ? k + 1 : 0];
      const oldBack = of[k > 0 ? k - 1 : mf - 1];
      aOld = command(this, i, oldLead, this.dist(x, s[oldLead]) - len);
      const backBefore = command(this, oldBack, i, this.dist(s[oldBack], x) - len);
      const nextLead = oldLead === oldBack ? -1 : oldLead;
      const backAfter = command(this, oldBack, nextLead,
        nextLead < 0 ? Infinity : this.dist(s[oldBack], s[nextLead]) - len);
      left = backAfter - backBefore;
    } else {
      aOld = command(this, i, -1, Infinity);
    }

    const p = this.type[i] === HUMAN ? this.politeness[i] : c.politeness[this.type[i]];
    if (!this.keepLeft) return aNew - aOld + p * (joined + left) - c.mThreshold;
    aNew = this.keepLeftCap(i, to, aNew);
    aOld = this.keepLeftCap(i, from, aOld);
    return to > from
      ? aNew - aOld + p * joined - (c.mThreshold + c.mBias)
      : aNew - aOld + p * left - (c.mThreshold - c.mBias);
  }

  moveToLane(i, to) {
    const from = this.lane[i], rank = this.rank, s = this.s;
    const of = this.order[from], mf = this.count[from];
    for (let k = rank[i]; k < mf - 1; k++) {
      of[k] = of[k + 1];
      rank[of[k]] = k;
    }
    this.count[from] = mf - 1;

    const ot = this.order[to], mt = this.count[to], x = s[i];
    let k = mt;
    while (k > 0 && s[ot[k - 1]] > x) {
      ot[k] = ot[k - 1];
      rank[ot[k]] = k;
      k--;
    }
    ot[k] = i;
    rank[i] = k;
    this.count[to] = mt + 1;

    this.lane[i] = to;
    this.fromLane[i] = from;
    this.laneAge[i] = 0;
    this.laneChanges++;
    if (this.measuring) this.st.laneChanges++;
  }

  // A visitor's tap: car i brakes hard for a moment, whatever is ahead.
  tap(i) {
    this.brakeLeft[i] = this.c.tapTime;
  }

  /* Puts a new car of the given type in the middle of the longest gap, at
     the mean speed of the cars either side. Returns its index, or -1 when
     the ring is full or no gap has room for a car with a jam gap each side. */
  addCar(type) {
    if (this.n >= this.capacity) return -1;
    const { s, v, L, c } = this;
    let bestLane = -1, bestK = -1, room = 0;
    for (let lane = 0; lane < this.lanes; lane++) {
      const o = this.order[lane], m = this.count[lane];
      if (m === 0) {
        if (L > room) { room = L; bestLane = lane; bestK = -1; }
        continue;
      }
      for (let k = 0; k < m; k++) {
        const d = m === 1 ? L : this.dist(s[o[k]], s[o[k + 1 < m ? k + 1 : 0]]);
        if (d > room) { room = d; bestLane = lane; bestK = k; }
      }
    }
    if (room / 2 - c.len < this.par.human.s0) return -1;

    const i = this.n++, o = this.order[bestLane], m = this.count[bestLane];
    let x = 0, speed = 0;
    if (bestK >= 0) {
      const back = o[bestK], lead = o[bestK + 1 < m ? bestK + 1 : 0];
      x = s[back] + room / 2;
      speed = (v[back] + v[lead]) / 2;
    }
    s[i] = x - Math.floor(x / L) * L;
    v[i] = speed;
    this.U[i] = speed;
    this.acc[i] = this.u[i] = this.uNext[i] = 0;
    this.brakeLeft[i] = 0;
    this.type[i] = type;
    this.lane[i] = this.fromLane[i] = bestLane;
    this.laneAge[i] = PARKED;
    o[this.count[bestLane]++] = i;
    this.sortLanes();
    this.fillHistory(i);
    return i;
  }

  // Starts a new measuring window. The view calls it every few seconds for
  // live numbers; a sweep calls it once, at the end of the warm-up.
  resetStats() {
    this.measuring = true;
    this.st = {
      steps: 0, carSteps: 0, samples: 0, sumV: 0, sumV2: 0, pke: 0, dist: 0, hard: 0, crashes: 0, laneChanges: 0,
      carSamples: 0, carV: new Float64Array(this.capacity), carV2: new Float64Array(this.capacity)
    };
  }

  /* The measures since resetStats(). Speeds are sampled once a second.
     flow = density × mean speed, per lane. speedSpread is the spread of
     every speed sample. speedSwing is how much each car's own speed swings
     over time: the root mean of each car's variance. With identical drivers
     the two agree; when desired speeds differ, cars driving freely at
     different speeds widen the spread but not the swing. energy is the
     positive change in speed squared per metre travelled, a proxy for the
     energy spent accelerating. hardBraking is the share of car-time spent
     below −2 m/s². A car added after resetStats() is left out of the swing. */
  stats() {
    const st = this.st, n = this.n;
    const mean = st.samples ? st.sumV / st.samples : 0;
    const spread = st.samples ? Math.sqrt(Math.max(st.sumV2 / st.samples - mean * mean, 0)) : 0;
    let swing = 0;
    if (st.carSamples) {
      for (let i = 0; i < n; i++) {
        const m = st.carV[i] / st.carSamples;
        swing += Math.max(st.carV2[i] / st.carSamples - m * m, 0);
      }
      swing = Math.sqrt(swing / n);
    }
    const density = n / (this.L / 1000) / this.lanes;
    const hours = st.steps * this.c.dt / 3600;
    return {
      time: st.steps * this.c.dt,
      density,
      meanSpeed: mean,
      speedSpread: spread,
      speedSwing: swing,
      flow: density * mean * 3.6,
      energy: st.pke / Math.max(st.dist, 1),
      hardBraking: st.carSteps ? st.hard / st.carSteps : 0,
      crashes: st.crashes,
      laneChangesPerCarHour: hours > 0 ? st.laneChanges / (n * hours) : 0
    };
  }
}
