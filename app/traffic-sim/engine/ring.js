/* A ring road with one or more lanes: the closed layout of traffic-sim.
   The ring holds a fixed number of cars, so its length sets the density.
   Each call to step() advances it by one fixed step of 0.1 s:

   1. Each car updates its 60-second average speed.
   2. With two or more lanes, each car considers a lane change by MOBIL,
      one car at a time in index order, so each sees the moves before it.
   3. Each car finds its leader and asks for an acceleration (drivers.js),
      plus noise, or the brakes if a visitor tapped it.
   4. Lags, then the update of speed and position.
   5. A collision guard puts any car that overlaps its leader just behind it.
   6. The measures, while measuring.

   A position runs from 0 to the ring's length, measured to the car's front
   along the ring. Every lane has the same length, and the view stretches
   each lane to fit its own drawn line. Nothing here draws, so the same file
   runs in the browser and in Node. */

import { HUMAN, makeParams, compileParams, command, profileFor } from './drivers.js';
import { makeRng } from './rng.js';

const HARD = -2;          // a deceleration that counts as hard braking (m/s²)
const SAMPLE_EVERY = 10;  // steps between speed samples, so once a second
const PARKED = 1e9;       // laneAge of a car that has never changed lane

export class Ring {
  /* length: metres. lanes: 1 or more. types: one driver type per car.
     seed: for the start positions and the noise. absorb: the absorber
     switch on Coordinated Mode. params: values to replace in DEFAULTS.
     capacity: room for cars that addCar() adds later. */
  constructor({ length, lanes = 1, types, seed = 1, absorb = false, params, capacity = 0 }) {
    const n = types.length, cap = Math.max(capacity, n);
    this.L = length;
    this.lanes = lanes;
    this.n = n;
    this.capacity = cap;
    this.absorb = absorb;
    this.par = makeParams(params);
    this.c = compileParams(this.par);
    this.rng = makeRng(seed);
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

    this.place();
    this.findLeaders();
    for (let i = 0; i < n; i++) {
      const j = this.leader[i];
      this.profile[i] = profileFor(this.type[i], j < 0 ? -1 : this.type[j], absorb);
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

  step() {
    const { n, c, s, v, U, acc, L } = this;
    const dt = c.dt;

    for (let i = 0; i < n; i++) U[i] += (v[i] - U[i]) * dt / c.aAverageTime;
    if (this.lanes > 1) this.changeLanes();
    this.findLeaders();

    const u = this.uNext;
    for (let i = 0; i < n; i++) {
      const j = this.leader[i];
      let cmd = command(this, i, j, this.gap[i]);
      this.profile[i] = profileFor(this.type[i], j < 0 ? -1 : this.type[j], this.absorb);
      if (this.brakeLeft[i] > 0) {
        cmd = -c.tapBrake;
        this.brakeLeft[i] -= dt;
      } else {
        cmd += (this.type[i] === HUMAN ? c.hNoise : c.aNoise) * this.rng.normal();
      }
      u[i] = cmd;
    }

    // A first-order lag between command and acceleration. A self-driving
    // car brakes hard through a shorter lag.
    const sNew = this.sNew, vNew = this.vNew;
    for (let i = 0; i < n; i++) {
      const ui = u[i], a0 = acc[i];
      const tau = this.type[i] === HUMAN ? c.hLag
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
        }
      }
      if (sample) st.samples += n;
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
  }

  // The distance forward round the ring from position a to position b.
  dist(a, b) {
    const d = b - a;
    return d < 0 ? d + this.L : d;
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
      let best = -1, bestGain = c.mThreshold;
      for (let to = from - 1; to <= from + 1; to += 2) {
        if (to < 0 || to >= this.lanes) continue;
        const gain = this.laneGain(i, from, to);
        if (gain > bestGain) {
          best = to;
          bestGain = gain;
        }
      }
      if (best >= 0) this.moveToLane(i, best);
    }
  }

  /* MOBIL's incentive for car i to move to another lane: its own gain in
     acceleration, plus its politeness times the gains of the follower it
     leaves and the follower it joins. -Infinity where the move would overlap
     a car, or force the car or its new follower to brake harder than the
     safe limit. */
  laneGain(i, from, to) {
    const { s, c } = this;
    const x = s[i], len = c.len;

    const ot = this.order[to], mt = this.count[to];
    let lead = -1, back = -1;
    if (mt > 0) {
      let lo = 0, hi = mt;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s[ot[mid]] > x) hi = mid; else lo = mid + 1;
      }
      lead = ot[lo === mt ? 0 : lo];
      back = ot[lo === 0 ? mt - 1 : lo - 1];
    }
    const gapNew = lead < 0 ? Infinity : this.dist(x, s[lead]) - len;
    const gapBack = back < 0 ? Infinity : this.dist(s[back], x) - len;
    if (gapNew <= 0 || gapBack <= 0) return -Infinity;
    const aNew = command(this, i, lead, gapNew);
    if (aNew < -c.mSafeBrake) return -Infinity;

    let others = 0;
    if (back >= 0) {
      const backAfter = command(this, back, i, gapBack);
      if (backAfter < -c.mSafeBrake) return -Infinity;
      const backLead = mt > 1 ? lead : -1;
      const backBefore = command(this, back, backLead,
        backLead < 0 ? Infinity : this.dist(s[back], s[backLead]) - len);
      others += backAfter - backBefore;
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
      others += backAfter - backBefore;
    } else {
      aOld = command(this, i, -1, Infinity);
    }
    return aNew - aOld + c.politeness[this.type[i]] * others;
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
    return i;
  }

  // Starts a new measuring window. The view calls it every few seconds for
  // live numbers; a sweep calls it once, at the end of the warm-up.
  resetStats() {
    this.measuring = true;
    this.st = { steps: 0, carSteps: 0, samples: 0, sumV: 0, sumV2: 0, pke: 0, dist: 0, hard: 0, crashes: 0, laneChanges: 0 };
  }

  /* The measures since resetStats(). Speeds are sampled once a second.
     flow = density × mean speed, per lane. energy is the positive change in
     speed squared per metre travelled, a proxy for the energy spent
     accelerating. hardBraking is the share of car-time spent below −2 m/s². */
  stats() {
    const st = this.st, n = this.n;
    const mean = st.samples ? st.sumV / st.samples : 0;
    const spread = st.samples ? Math.sqrt(Math.max(st.sumV2 / st.samples - mean * mean, 0)) : 0;
    const density = n / (this.L / 1000) / this.lanes;
    const hours = st.steps * this.c.dt / 3600;
    return {
      time: st.steps * this.c.dt,
      density,
      meanSpeed: mean,
      speedSpread: spread,
      flow: density * mean * 3.6,
      energy: st.pke / Math.max(st.dist, 1),
      hardBraking: st.carSteps ? st.hard / st.carSteps : 0,
      crashes: st.crashes,
      laneChangesPerCarHour: hours > 0 ? st.laneChanges / (n * hours) : 0
    };
  }
}
