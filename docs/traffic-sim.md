# traffic-sim

## Summary

traffic-sim is a 3D traffic simulator. A visitor watches traffic jam on a
ring road, then sees what changes when self-driving cars drive selfishly or
in coordination. The app lives at `app/traffic-sim/`. Once shipped, it is
served at drbuild.uk/app/traffic-sim/, with the short address
drbuild.uk/traffic-sim.

The engine came first. It is a set of plain ES modules in
`app/traffic-sim/engine/` with no drawing code, so the same files run in the
browser and in Node. The browser runs it for visitors. Node runs it for
research sweeps, so a published figure and the live app come from one engine
with the same seeds. Before any drawing was built, the engine had to
reproduce the one-lane ring tables of a Python reference model within a few
percent. It passed on 2026-10-08.

Each human driver is different. A desired speed, a time gap, an
acceleration, a braking and a reaction time are drawn for each driver from
observed or approximate distributions, linked by one assertiveness score. A
settings file describes every population exactly, so a published result
can be rebuilt driver by driver.

This document describes the engine, the human population and its
calibration, how to check the engine, and the view. The engine is written
from the published models: the Intelligent Driver Model, the Human Driver
Model, MOBIL and Gipps's safe speed. It uses no code from
traffic-simulation.de, which is GPL v3.

## Implementation checklist

- [x] Engine: rings with one and two lanes, six driver types, the absorber
      switch, MOBIL lane changes, Gipps's safe-speed cap, a fixed 0.1 s step
      and seeded random numbers
- [x] Node sweep that matches the reference model's one-lane tables
- [x] Checks: peak flow, Sugiyama's ring, Stern's absorber, the absorber
      switch, the two-lane ring, repeatability, a tap, adding cars
- [x] Human population: per-driver traits linked by assertiveness, the
      Human Driver Model's estimation errors, anticipation and delay,
      reaction as a lag or a delay, keep left, settings files, and a
      calibration against observed motorway breakdown (2026-10-08)
- [ ] Calibrate lane changes, politeness and the keep-left bias against
      highD
- [x] v0.1, first part: both rings in WebGL 2, with traffic, mix and speed
      controls, the absorber switch, tap-the-brakes, colour by driver or by
      speed, V2V links, three cameras, live numbers, the settings in the
      address, and light and dark themes. The screen-fit check passes at all
      six sizes
- [ ] v0.1, the rest: the space-time strip, find-the-limit in a Web Worker,
      the energy figure and an About panel
- [ ] Ship v0.1: version marker, both addresses, builder page entry, share
      card, and a try on a real phone and a real iPad
- [ ] v0.2: the T-junction, with one lane per arm, six routes and four
      junction rules
- [ ] v0.3: two lanes per arm, AI turn-taking and capacity heatmaps

## Files

| File | What it holds |
|---|---|
| `app/traffic-sim/engine/ring.js` | The ring road: cars, lanes, the step, lane changes, the collision guard and the measures |
| `app/traffic-sim/engine/drivers.js` | Driver types, parameters, controller profiles, and the acceleration each car asks for |
| `app/traffic-sim/engine/population.js` | Each human's traits, drawn from their distributions and linked by assertiveness |
| `app/traffic-sim/engine/settings.js` | Reads a settings file, with its units, into the engine's parameters |
| `app/traffic-sim/engine/mix.js` | Which cars get which driver type |
| `app/traffic-sim/engine/rng.js` | Seeded random numbers |
| `app/traffic-sim/settings/reference.json` | The reference model's identical humans, which the gate uses |
| `app/traffic-sim/settings/uk-motorway.json` | UK motorway humans, the app's population |
| `app/traffic-sim/index.html`, `style.css` | The page: the cards and their layout |
| `app/traffic-sim/app.js` | The page's logic: controls, the clock, input, live numbers and the address |
| `app/traffic-sim/view.js` | The 3D view: the oval's shape, the meshes, the shaders and the camera |
| `tools/traffic-sim/sweep.js` | The one-lane sweep: 1,848 runs on every core |
| `tools/traffic-sim/tables.js` | The tables from a sweep, and a cell-by-cell comparison of two sweeps |
| `tools/traffic-sim/calibrate.js` | Humans alone over a grid of parameters: peak flow, wave onset, wave speed, emergency stops, collisions |
| `tools/traffic-sim/waves.js` | The wave measures that calibrate.js and checks.js share |
| `tools/traffic-sim/checks.js` | The other checks, each with PASS or FAIL |

## Using the engine

```js
import { Ring } from './engine/ring.js';
import { mixTypes } from './engine/mix.js';
import { makeRng } from './engine/rng.js';
import { readSettings } from './engine/settings.js';

const uk = readSettings(settingsFileText);   // e.g. settings/uk-motorway.json
const types = mixTypes(100, { coordinated: 0.3, selfish: 0.2 }, makeRng(7));
const ring = new Ring({ length: 2000, lanes: 2, types, seed: 7, keepLeft: true, params: uk.params });
ring.step();            // 0.1 s
ring.stats().flow;      // vehicles per hour per lane since the last resetStats()
```

`new Ring(options)` takes:

- `length`: the ring's length in metres. Every lane has this length.
- `lanes`: 1 or more. The app uses 1 and 2. Lane 0 is the left lane.
- `types`: one driver type per car. The number of cars is the length of
  this list.
- `seed`: the seed for the start positions and the noise.
- `driverSeed`: the seed for each human's traits and estimation errors;
  the seed by default. A sweep keeps it the same at every density, so a
  column of its tables follows one set of drivers.
- `absorb`: the absorber switch on Coordinated Mode. Off by default. The
  view may change `ring.absorb` at any time.
- `keepLeft`: the keep-left switch. On by default. The view may change
  `ring.keepLeft` at any time.
- `params`: values that replace the defaults, group by group, for example
  `{ human: { noise: 0.2 }, mobil: { politeness: { selfish: 0.1 } } }`. A
  distribution, an object with a `dist` key, is replaced whole. Without
  params the ring has the reference model's identical humans.
- `capacity`: room for cars that `addCar()` adds later.

The view reads these arrays, indexed by car, for the first `ring.n` cars:

| Array | Meaning |
|---|---|
| `s` | Position of the car's front along the ring, from 0 to `length` (m) |
| `v`, `acc` | Speed (m/s) and acceleration (m/s²) |
| `lane` | Lane, from 0 |
| `fromLane`, `laneAge` | The lane before the last change, and the time since it (s). The view slides a car across over the first seconds |
| `type` | Driver type. The view may change it mid-run |
| `profile` | The controller the car used in the last step. `P_PLATOON` marks a V2V link to the car ahead |
| `leader`, `gap` | The car ahead in the same lane, and the gap to its rear (m). −1 and Infinity for a car alone in its lane |
| `brakeLeft` | Time left on a tap of the brakes (s) |
| `desiredSpeed`, `timeGap`, `acceleration`, `braking`, `reactionTime`, `politeness` | Each car's human traits, in SI units, used while the car is human |

`order[lane]` lists each lane's cars by position, with `count[lane]` cars.
`ring.time` is the simulated time in seconds. `ring.crashes` and
`ring.laneChanges` count since the start.

Methods:

- `step()` advances the ring by one fixed step of 0.1 s. The view calls it
  as often as the chosen speed needs, separate from the frame rate.
- `tap(i)` makes car `i` brake at 4 m/s² for 2 s, whatever is ahead.
- `addCar(type)` puts a car in the middle of the longest gap, at the mean
  speed of the cars either side. It returns the new index, or −1 when the
  ring is full or no gap has room for a car with a jam gap on each side.
- `resetStats()` starts a new measuring window, and `stats()` returns the
  measures since then.

## The step

Each step of 0.1 s runs in this order:

1. Each car updates its 60-second average of its own speed.
2. With two or more lanes, each car in index order considers a lane change
   by MOBIL. A car that moves joins its new lane at once, so the cars after
   it see the move.
3. Each car finds its leader, the next car round in its lane, and asks for
   an acceleration. With keep left on, the passing rule caps it. Noise is
   added, unless a tap holds the brakes on.
4. A first-order lag turns each command into an acceleration. Speed and
   position follow, and speed never goes below zero.
5. The collision guard acts.
6. The measures are updated while measuring. Each car's history and each
   human's estimation errors move on.

Every car's command in a step reads the state from the step before, so the
order of the cars in step 3 makes no difference.

## Driver models

Six driver types exist. The app offers three: human, coordinated and
selfish. Timid, cooperative and absorber exist so that the engine reproduces
every column of the reference tables.

### Humans

Each human follows the Intelligent Driver Model (Treiber, Hennecke and
Helbing 2000) with their own desired speed v0, time gap T, acceleration a
and comfortable braking b:

```
s* = s0 + max(0, v T + v (v − vl) / (2 √(a b)))
command = a (1 − (v / v0)^δ − (s* / max(gap, 0.1))²), clipped to −9 … +3 m/s²
```

The jam gap s0 is 2 m and the exponent δ is 4 for everyone.

**Reaction.** Each human also has a reaction time, which acts in one of two
ways, chosen by `human.reactionAs`:

- `lag`, the default: a first-order lag between the command and the car's
  acceleration, with the reaction time as its time constant, as in the
  reference model.
- `delay`: the Human Driver Model's pure delay (Treiber, Kesting and
  Helbing 2006). The driver sees the road as it was one reaction time ago,
  interpolated between steps. They make up for it by projecting their own
  speed forward at their old acceleration, and each gap forward at its old
  closing speed (the paper's eq. 9–11). There is no lag. A pair of cars
  where either changed lane within the reaction time is seen as it is now,
  because a real lane change takes longer than a reaction time.

**Estimation errors.** As in the Human Driver Model, a driver misjudges each
gap s as s·exp(Vs ws) and each closing speed Δv as Δv + s rc wv. ws and wv
are the driver's own Wiener processes of variance 1, which persist for a
correlation time τ:

```
w ← exp(−dt/τ) w + √(2 dt/τ) η,   η normal
```

**Anticipation.** A driver may respond to the na cars ahead in their lane,
each through IDM's braking term with the summed gaps to that car. The jam
gap and the time gap shrink by γ = √(Σ 1/k², k = 1 … na), so the gap in
steady traffic stays as with one car ahead (the paper's eq. 13–20).

With na = 1, no delay and no estimation errors, the Human Driver Model is
the plain IDM, and the step uses the plain formula above.

**The two populations.** Every value below sits in a settings file
(see [Settings files](#settings-files)).

| Parameter | `reference.json` | `uk-motorway.json` | Source of the UK value |
|---|---|---|---|
| Desired speed v0 | 30 m/s | Normal, mean 111 km/h, sd 14 km/h | DfT vehicle speed compliance statistics 2024, table SPE0102, cars on motorways in free flow |
| Time gap T | 1.2 s | Log-normal, median 1.2 s, σ 0.25 | Zhang and Sun (2024), highD, recorded 2017–2018; the spread is provisional |
| Acceleration a | 1.0 m/s² | Log-normal, median 0.17 g (1.67 m/s²), σ 0.34 | Accident-reconstruction and telematics ranges for pulling away |
| Comfortable braking b | 1.5 m/s² | As acceleration | The same disposition |
| Reaction time | 0.5 s, as a lag | Log-normal, median 0.8 s, σ 0.25, as a lag | Calibrated, below |
| Politeness | 0.25 | 0.25 | The middle of MOBIL's typical range |
| Link λ | – | 0.5 | Untested; the paper runs 0 and 1 |
| Cars anticipated na | 1 | 1 | Calibrated, below |
| Distance error Vs | 0 | 5% | Human Driver Model, Table 1 |
| Closing-speed error rc | 0 | 0.01 /s | Human Driver Model, Table 1 |
| Error time τ | – | 20 s | Human Driver Model, Table 1 |
| White noise | 0.3 m/s² per step | 0 | – |
| Self-driving speed limit | 30 m/s | 70 mph (31.29 m/s) | The posted limit |

Every UK distribution keeps only the draws between its 1st and 99th
percentiles. σ is the spread of the natural log. With the medians above,
90% of drivers want 89–133 km/h, accelerate at 0.10–0.29 g, and keep time
gaps of 0.8–1.8 s.

**Linked traits.** One hidden assertiveness score A per driver links the
traits. Each trait's normal score is

```
z = w √λ A + √(1 − w² λ) e
```

where e is that trait's own noise and w is its loading: +1 for desired
speed, acceleration and braking, −1 for time gap, reaction time and
politeness. So an assertive driver wants a higher speed, accelerates and
brakes harder, keeps a shorter gap, reacts faster and is less polite. Two
traits with loadings ±1 correlate by ±λ on the normal scale, and λ runs from
0 (independent) to 1 (one score sets every trait). The score z maps to a
probability through the normal distribution, the probability is squeezed
into the kept percentiles, and the trait is the distribution's quantile
there. Each driver uses seven normal draws whatever the distributions, from
a stream seeded by `driverSeed`, so changing one trait's spread leaves every
other trait of every driver unchanged.

### Self-driving cars

A constant-time-gap controller with an actuator lag:

```
command = k1 (gap − 2 − T v) + k2 (vl − v) + kU (U − v) + ff uL
```

U is the car's own 60-second average speed, and uL is the leader's command
from the step before, received over V2V. Then, in order:

- the command is capped at 0.5 (30 − v), which holds the car to the 30 m/s
  speed limit;
- Gipps's safe speed caps it at (vSafe − v) / τ, where
  vSafe = −bτ + √((bτ)² + vl² + 2b (gap − 1)), with b = 7 m/s² and a
  reaction time τ of 0.5 s, or 0.3 s in a platoon;
- it is clipped to −8 … +2 m/s².

The actuator lag is 0.4 s. A command below −2 m/s², and below the car's
present acceleration, acts through a lag of 0.2 s instead. Noise is
0.02 m/s² per step.

| Profile | T (s) | k1 (1/s²) | k2 (1/s) | kU (1/s) | ff |
|---|---|---|---|---|---|
| Selfish | 0.7 | 0.20 | 0.50 | 0 | 0 |
| Timid | 2.0 | 0.20 | 0.80 | 0 | 0 |
| Cooperative | 1.2 | 0.20 | 0.80 | 0 | 0 |
| Platoon | 0.6 | 0.20 | 0.80 | 0 | 0.8 |
| Absorber | 2.0 | 0.02 | 0.30 | 0.30 | 0 |

A selfish car keeps a tight gap and responds softly, so it amplifies a
speed swing as it passes, like the commercial cruise control that Gunter et
al. (2021) measured. The absorber follows its own average speed more than
the car ahead, so its gap stretches and shrinks and a wave dies in it, after
Stern et al. (2018).

### Which profile a self-driving car uses

| Type | Behind a coordinated car | Behind any other car |
|---|---|---|
| Coordinated, absorber switch off | Platoon | Cooperative |
| Coordinated, absorber switch on | Platoon | Absorber |
| Selfish, timid, cooperative, absorber | Its own profile | Its own profile |

The leader can change at every lane change, so the profile is chosen again
at every step.

## Lane changes

MOBIL (Kesting, Treiber and Helbing 2007). Car c considers each neighbouring
lane. Let n be the follower it would join and o the follower it would leave,
with a tilde for the accelerations after the move. Two tests decide.

**Safety.** The car fits, with more than the least gap to the cars ahead and
behind, and neither it nor its new follower must brake harder than 4 m/s².
The least gap is 0 m in the reference population and 2 m, the jam gap, in
the UK one.

**Incentive, without keep left.** The symmetric rule:
ã_c − a_c + p (ã_n − a_n + ã_o − a_o) > 0.1 m/s².

**Incentive, with keep left.** The asymmetric rule of MOBIL's authors
(eq. 5–7 of the paper), mirrored from keep right to keep left. Lane 0 is the
left lane.

- *Passing rule.* A car may not go faster than it could behind the car ahead
  in the lane to its right, while it is faster than that car and that car
  moves faster than queueing traffic, 60 km/h. The rule replaces the car's
  acceleration in the step itself, and in each of its accelerations in the
  incentive. It only slows a car, and never brakes it harder than 4 m/s².
  A car already alongside a slower car on its right matches that car's
  speed over about a second instead, a case the published rule leaves open.
- *A move right,* to overtake: ã_c − a_c + p (ã_n − a_n) > 0.1 + 0.3 m/s².
  Only the follower it joins counts.
- *A move left:* ã_c − a_c + p (ã_o − a_o) > 0.1 − 0.3 m/s². Only the
  follower it leaves counts.

The 0.3 m/s² bias towards the left lane is the paper's value.

**Selfish cars pass on the left sometimes.** A selfish car keeps to the
passing rule unless keeping to it would cost it more than 0.5 m/s² (0.05 g)
of acceleration. Then it passes on the left. In light traffic, a selfish car
passes on the left about 1.3 times an hour, a human about 0.04 times.

Each acceleration comes from the plain IDM or the self-driving controller,
without noise, delay or estimation error, on the present positions. A lane
change is judged by the driver's own model. After a change, a car waits 4 s
before it may change again, and a car whose brakes a visitor holds does not
change.

| Driver type | Politeness p |
|---|---|
| Selfish | 0, its own gain only |
| Human | Each driver's own: 0.25 in both populations |
| Coordinated, cooperative, timid, absorber | 1, which minimises the total braking |

The human value is the middle of the range that MOBIL's authors give as
typical, 0 to 0.5. It, the bias and the least gap need calibration against
highD's lane changes.

## Collision guard

After the move, a car whose front overlaps its leader's rear goes 5 cm
behind the leader, no faster than the leader, and counts as a crash. Every
case is judged on the positions before any car is moved. The checks record
no crashes. Neither does the sweep, with either population on one lane, or
with the reference population on two lanes.

With the UK population on two lanes, a sweep of 5,544 runs recorded 8
collisions, about one per 29,000 car-hours, all with 30% to 70% selfish
cars at 45 to 70 per km. In each, a car that changed lane 3 to 6 s earlier
braked at 0.7 to 0.9 g in a wave, and the car behind could not match it
through its response lag. A shorter lag for hard braking, as the
self-driving cars have, is the likely fix.

## Measures

`stats()` returns these, from the last `resetStats()`:

| Measure | Definition |
|---|---|
| `flow` | Density per lane × mean speed, in vehicles per hour per lane |
| `meanSpeed`, `speedSpread` | Mean and standard deviation of every car's speed, sampled once a second (m/s) |
| `speedSwing` | How much each car's own speed swings: the root mean of each car's variance over time (m/s) |
| `energy` | The positive change in speed squared, per metre travelled: a proxy for the energy spent accelerating |
| `hardBraking` | The share of car-time below −2 m/s² |
| `crashes`, `laneChangesPerCarHour` | Counts in the window |

Waves are present when the speed spread passes 1.5 m/s. The wave onset of a
case is the lowest density where they are. That test suits identical
drivers. When desired speeds differ, cars driving freely at different speeds
widen the spread with no waves at all, so the swing replaces it: waves start
where the swing passes 1.5 m/s and is at least 1.5 times the least swing at
any lower density. The second test matters on two lanes, where overtaking
makes speeds swing by about 2 m/s in light traffic.

## Random numbers and repeatability

`rng.js` holds sfc32, seeded through a splitmix32 hash, with normal deviates
by the polar method. One seed gives the same run in every browser and in
Node. `hashSeed()` mixes numbers and strings into a seed, so a sweep can name
each run's seed by its case.

Each ring has three streams. The seed drives the start positions and the
white noise. `driverSeed` drives each human's traits, through its own
stream, and each human's estimation errors, through another. So the
reference population, with no spreads and no errors, draws exactly the noise
it drew before the population existed.

`assignTypes()` picks round(share × cars) self-driving cars at random places,
then splits them between types. It rounds a half to the even number, as
Python does, so a mix has the same car counts as in the reference model.
`mixTypes()` takes the app's mix: the coordinated and selfish shares of all
cars.

## Settings files

A settings file describes a run exactly: the road, the mix of drivers, the
seed, and every parameter of every driver type, including each distribution
that human traits are drawn from. It is JSON, in
`app/traffic-sim/settings/`. Every quantity with a dimension is a string
that names its unit, such as `"111 km/h"`, `"0.17 g"` or `"1.2 s"`;
`readSettings()` turns them into SI units. The units are m, km, s, m/s,
km/h, mph, m/s², g (9.80665 m/s²), /s and /s².

```json
{
  "settings": "traffic-sim 1",
  "name": "uk-motorway",
  "about": "…",
  "seed": 11,
  "road": { "layout": "ring", "lanes": 2, "laneLength": "800 m", "density": 30, "keepLeft": true },
  "mix": { "coordinated": 0, "selfish": 0, "absorb": false },
  "params": {
    "speedLimit": "70 mph",
    "human": {
      "link": 0.5,
      "traits": {
        "desiredSpeed": { "dist": "normal", "mean": "111 km/h", "sd": "14 km/h", "percentiles": [1, 99], "assertive": 1, "source": "…" },
        "timeGap": { "dist": "lognormal", "median": "1.2 s", "sigma": 0.25, "percentiles": [1, 99], "assertive": -1 },
        "politeness": { "dist": "fixed", "value": 0.25, "assertive": -1 }
      },
      "reactionAs": "lag",
      "…": "every other parameter"
    },
    "av": {}, "profiles": {}, "mobil": {}, "tap": {}
  }
}
```

`params` mirrors the engine's `DEFAULTS` in `drivers.js`, group by group.
A distribution is `fixed` with a `value`, `normal` with a `mean` and `sd`,
or `lognormal` with a `median` and `sigma`, the spread of the natural log.
`percentiles` keeps the draws between two percentiles, and `assertive` is
the trait's loading on the assertiveness score. `density` is in cars per km
per lane. A file may leave parameters out, and those take the engine's
defaults; `missingParams()` lists them. Both files here name every
parameter, so neither depends on the defaults. A sweep copies its settings
file beside its results.

## Calibrating the human population

`tools/traffic-sim/calibrate.js` runs humans alone over a grid of
parameters, on one lane and on two:

```sh
node tools/traffic-sim/calibrate.js app/traffic-sim/settings/uk-motorway.json --lanes 1,2 \
  --vary human.traits.reactionTime.median=0.7s,0.8s,0.9s --vary human.anticipate=1,2
```

**The targets,** from observed data from the last ten years:

| Target | Observed | Source |
|---|---|---|
| Density at peak flow | About 28 cars per km per lane | Highway Capacity Manual, 7th edition (2022): 45 passenger cars per mile per lane at capacity |
| Peak flow | 2,000 to 2,400 cars per hour per lane | HCM 7th edition; highD (2017–2018) |
| Waves start | Speeds collapse from about 40 vehicles per km per lane | highD, recorded 2017–2018 (Kruber, Wurst, Chakraborty and Botsch 2019) |
| Wave speed | 15 to 21 km/h upstream | I-24 MOTION, November to December 2022 |
| Collisions and emergency stops | None, and almost no braking harder than 0.5 g | The project's own test: real stop-and-go traffic does not crash, and rarely brakes so hard |

A ring has no bottleneck, so it should carry its peak near 30 per km and
break into waves near 40, as a motorway does away from its bottlenecks.

**The result on 2026-10-08.** With reaction time as a lag of median 0.8 s,
one car anticipated and the Human Driver Model's estimation errors:

| Ring | Peak flow | Waves from | Wave speed | Emergency stops | Collisions |
|---|---|---|---|---|---|
| One lane | 2,066 per hour per lane at 32.5 per km | 35 per km | −20 km/h | 1.3 per car-hour | 0 |
| Two lanes, keep left | 2,004 at 35 | 40 | −20 km/h | 0.1 per car-hour | 0 |

The fit holds for link λ from 0 to 1: waves from 35 to 40, travelling at 18
to 22 km/h, with no collisions. A median of 0.7 s moves the onset to 45 to
50; 0.9 s to 32.5 to 35, with 3 to 14 emergency stops per car-hour; 1.0 s
brings collisions.

**The Human Driver Model's delay does not fit.** With reaction as a pure
delay, there is no setting that meets the targets:

- With one car anticipated, any delay from 0.6 s makes collisions.
- Anticipating 2 to 7 cars removes most of them up to about 0.9 s. Waves
  then start near 30 to 40 per km, but travel back at 26 to 62 km/h. A
  driver who watches several cars ahead starts almost with them, so a jam's
  front races backwards.
- Whenever the delay makes waves, drivers brake harder than 0.5 g 7 to 137
  times per car-hour. The delay lets a driver close in, and IDM's braking
  term then has no limit short of 9 m/s². With its authors' own parameters
  the model brakes harder than 0.6 g 67 times per car-hour on the ring.
- Different drivers bring collisions back: a driver with a short time gap
  and a long delay runs into the car ahead at walking pace in stop-and-go
  traffic. With the link at 0.5, collisions start from a median of about
  0.9 s. With the link at 1, so that drivers with short gaps react fast,
  they start from about 1.0 s on two lanes and 1.1 s on one.

The implementation reproduces the paper: with its parameters, waves travel
back at about 19 km/h, against about 15 km/h for the paper's moving jams,
with no collisions. The lag smooths a driver's response, so stop-and-go traffic
forms with braking that stays under 0.5 g almost always, as on real roads.

**The acceleration is uncertain.** The 0.17 g median comes from pulling away
in town. IDM fitted to highD car-following gives a much smaller
acceleration, 0.29 to 0.55 m/s² (0.03 to 0.06 g), with comfortable braking
of 1.2 to 2.1 m/s² (Zhang and Sun 2024). In IDM the acceleration sets how
fast a queue pulls away, so it sets the wave speed. With the Human Driver
Model's own parameters, waves travel at 19 km/h with its authors' 1 m/s²
(0.10 g), and at 29 km/h with 0.17 g. The lag calibration above meets the
wave-speed target at 0.17 g.

## Matching the reference model

The reference is a vectorised Python model of the one-lane ring, built for
the project's research before the engine. The engine follows it step for
step, with its own random numbers. The sweep runs the same 1,848 cases: 50
cars, densities from 10 to 70 vehicles per kilometre, humans alone, five
self-driving types at shares from 2% to 100%, and mixes of selfish cars
with coordinated cars and with absorbers. Each run lasts 1,500 s, the last
900 s measured, with 3 seeds.

```sh
node tools/traffic-sim/sweep.js engine.json
node tools/traffic-sim/tables.js engine.json reference.json
```

The second `reference.json` is the reference model's results file, kept
with the research, not in this repo. The sweep runs
`settings/reference.json`, the reference model's population, unless
`--settings` names another file; `--lanes 2` runs it on two lanes, with 50
cars per lane.

**Spreads off.** The human population replaced every fixed human parameter
with a per-driver trait. With every spread switched off, the engine must
still match the reference. It does exactly: on 2026-10-08 the sweep gave
the same numbers, bit for bit, as the engine before the population existed,
and a check confirms that the UK population, with its spreads off and its
medians set to the reference values, drives exactly as the reference.

**The gate.** Every cell of the published tables must lie within 5% of the
reference. The differences must also look like seed noise: about the size
of the reference model's differences from itself when run with other seeds.
A wavy run's flow varies by about 5% from seed to seed, so a mean of 3 seeds
cannot match more closely than a few percent.

**The result on 2026-10-08.** Passed. With 3 seeds, the mean difference
over every case was 0.5%, against 0.4% for the reference with other seeds.
With 9 seeds for each model it fell to 0.3%, so the differences are seed
noise.

| Cells compared | Engine against reference, 3 seeds | Reference against itself, other seeds | Engine against reference, 9 seeds each |
|---|---|---|---|
| Flow at 45 vehicles per km, one type | 0.8% mean, 4.4% largest | 0.7–1.0% mean, 6.5% largest | 0.6% mean, 4.2% largest |
| Peak flow | 0.2% mean, 2.3% largest | 0.1% mean, 1.9% largest | 0.1% mean, 0.6% largest |
| Flow at 45 vehicles per km, mixes | 0.9% mean, 3.8% largest | 0.8–1.0% mean, 4.3% largest | 0.3% mean, 1.8% largest |
| Every case at every density, flow | 0.5% mean, 447 of 451 within 5% | 0.4% mean, 447–448 of 451 within 5% | 0.3% mean, 450 of 451 within 5% |
| Wave onset | 37 of 41 match; 3 one density step off; absorbers at 30% at 20 against none | 38–40 of 41 match | 40 of 41 match |

Human traffic peaks at 2,128 vehicles per hour per lane, against 2,130 in
the reference, and waves start at 40 vehicles per kilometre in both. The one
case outside 5% with 9 seeds, selfish cars at 70% and 30 vehicles per km, is
bistable: a run either stays smooth or breaks into waves. Over 40 seeds,
the reference stayed smooth in 5 runs and the engine in 4. Humans alone at
45 vehicles per km carried 1,700 ± 11 vehicles per hour in the reference
and 1,694 ± 12 in the engine, over 40 seeds each.

## Checks

```sh
node tools/traffic-sim/checks.js
```

It runs in about 20 s and exits with 1 if any check fails. All passed on
2026-10-08. With the reference population:

- Human traffic peaks at 2,130 vehicles per hour per lane, inside the
  2,000 to 2,200 seen on real roads.
- 22 human drivers on a 230 m ring form a stop-and-go wave, as in Sugiyama
  et al. (2008), with a speed spread of 2.5 m/s.
- One absorber among them clears the wave, as in Stern et al. (2018). The
  spread falls to 0.85 m/s and flow rises 20%.
- A coordinated car with the absorber switch on drives exactly as an
  absorber behind a human, and platoons behind a coordinated car.
- With symmetric lane changes, the two-lane ring runs 36 runs of 100 cars
  with no collisions, and the lanes stay within 16 cars of each other.
- At 45 and 60 vehicles per km per lane, selfish cars change lane 25 to
  30 times per car-hour. Humans and coordinated mixes change at most 3.3
  times.
- A seed repeats exactly, and another seed differs.
- A tap on one car slows the tenth car behind it from about 22 m/s to
  19 m/s.
- `addCar()` packs a ring until no gap has room, with no collisions after.

With the settings files and the UK population:

- Each settings file names every parameter, and `reference.json` is the
  engine's defaults exactly.
- With every spread off, and its medians and switches set to the reference
  values, the UK population drives exactly as the reference humans, seed
  for seed, in a mix with coordinated and selfish cars.
- Over 20,000 drivers, each trait's 5th, 50th and 95th percentiles lie
  within 2% of its distribution's, and within 1.1% at worst.
- The link sets the rank correlation between traits: 0.47 against 0.48
  expected at λ = 0.5, none at 0, and exactly 1 at 1.
- Humans alone, the mean of 3 seeds: on one lane, flow peaks at 2,068 per
  hour per lane at 35 per km, and waves start at 40 per km and travel back
  at 21 km/h. On two lanes with keep left, 2,020 at 35, waves from 40 at
  19 km/h. No collisions, and under 1 emergency stop per car-hour.
- With keep left, 56% of cars use the left lane at 8 per km per lane,
  against 50% without. Humans pass on the left 0.15 times per car-hour,
  against 24 times without keep left. Among 30% selfish cars, selfish cars
  pass on the left 6.5 times per car-hour and humans 0.14 times.
- The Human Driver Model with its authors' parameters, a 1.2 s delay and 6
  cars anticipated, makes waves at 35 per km that travel back at 21 km/h,
  with no collisions.

### Known limits

- **Lane changes are not calibrated.** With the UK population, humans
  change lane 10 to 40 times per car-hour in light traffic, and pass on the
  left about 0.04 times per car-hour with keep left on. Politeness, the
  keep-left bias and the least gap need calibration against highD.
- **One lane holds a slow platoon.** On one lane nobody can pass, so in
  light traffic every car ends up behind the slowest driver, at about
  80 km/h. Flow at 10 per km is then 19% lower than with identical humans.
  Two lanes let cars pass.
- **Sugiyama's ring crawls.** The wave forms, but at a mean speed of 8 km/h
  rather than the test's 30 km/h or so. Cars 5 m long with a 2 m jam gap fill
  most of the 230 m track. The test's cars were shorter, and its drivers
  closed up more at low speed.

## The view

`view.js` draws the ring with hand-written WebGL 2, in a low-poly "toy
town" style. Each frame draws, in order:

1. the ground, a plain square with fog that starts beyond the point the
   camera looks at;
2. the road, whose shader draws the solid edge lines and the dashed lines
   between lanes, antialiased;
3. a soft shadow under each car, and a halo under the chosen car;
4. a faint line from each car in a platoon to the car it follows over V2V;
5. the cars: one mesh of 11 boxes, drawn for every car in one instanced
   call. The brake lights glow from −0.4 m/s² and fully at −2.8 m/s², and
   whenever a car stands still or a visitor holds its brakes.

**The road.** Each lane holds 800 m of ring, so the number of cars is the
density times 0.8 times the lanes: 36 cars on one lane at 45 per km. The
oval's straights are twice its radius. A lane change slides the car across
over 3 s.

**The clock.** Each frame runs as many 0.1 s steps as the speed and the
real time since the last frame need, up to 400. A slow device then drops
time rather than stalls. The view draws each car between its last two
positions, so motion stays smooth at 1×. The speed starts at 5×, because a
jam takes a few simulated minutes to form.

**The controls,** top left as numbered steps:

1. **Road:** one lane or two, which rebuilds the ring, and the keep-left
   switch, on by default and live on two lanes.
2. **Traffic:** cars per km of lane, 10 to 80. It rebuilds the ring, so it
   applies on release, and only its number follows the drag.
3. **Drivers:** the self-driving share, the selfish share of those, and the
   absorber switch. These change cars in place, so a jam forms or clears
   live. The cars keep a fixed random order and a random rank, so a slider
   changes as few cars as it can.
4. **Run:** pause, a single step while paused, new cars from a new seed, and
   speeds from 1× to 50×.
5. **View:** colour by driver type or by speed; the camera from above,
   tilted, or riding behind the chosen car; and a button that fits the road
   to the screen again.

The step with the next action is lit: Drivers while every car is human, and
Run while paused.

**Input.** Drag to pan. The wheel or a pinch zooms about the pointer. A
right-drag or a ctrl-drag turns the view, and tilts it when moved up or
down; a two-finger twist turns it. A tap on a car brakes it and chooses it
for the ride-along camera. Space runs or pauses, the full stop steps, and F
goes full screen.

**Live numbers,** top right: flow, mean speed, the spread of speeds, the
cars standing still, and the share of cars braking hard. Each is an average
over about the last 15 s of simulated time, except the count of stopped
cars, which is the present one.

**The drivers.** The page loads `settings/uk-motorway.json` at the start,
and every ring it builds uses that population. Each car keeps its own human
traits when a slider turns it human again.

**The address.** The controls and the seed follow the #, for example
`#lanes=1&keep=1&density=45&av=30&selfish=50&absorb=0&speed=5&colour=type&camera=top&seed=11`.
The same address replays the same run.

**Screen fit.** The 3D view fills the window. The road fits the part of the
screen that the cards leave clear: a card that is narrow for the screen
takes a side, and a wide one a strip. On a phone the steps fold behind the
title, and the numbers move to a strip along the bottom, or to a column on
the right when the phone is sideways. `tools/screen-fit/check.js` passes at
all six sizes:

```sh
node tools/screen-fit/check.js http://localhost:8000/app/traffic-sim/ '#view' --controls '#fold'
```

**Checked in a browser.** In headless Chromium on 2026-10-08, with seed 11
and the UK population, humans alone at 45 cars per km formed waves within 22
simulated minutes. Speeds spread by 11 km/h, no car stood still, and flow
was 1,883 cars per hour. Two coordinated cars with the absorber switch on
damped the waves over the next 15 minutes: the spread fell to 6 km/h and
flow rose to 1,910. With the reference population, the same test had 5 cars
standing still and a spread of 27 km/h, which two absorbers cleared. The
keep-left switch turns keep left on and off live, and the page records it
in the address.

## Speed

A one-lane run of 50 cars for 1,500 s takes about 60 ms in Node on an Apple
laptop with the reference population, and about 120 ms with the UK one,
whose estimation errors use the Human Driver Model's step. The sweep of
1,848 runs takes about 15 s on 10 cores with the reference population, 25 s
with the UK one, and 80 s with the UK one on two lanes. A two-lane
run of 100 cars takes 0.2 to 0.4 s, because MOBIL tests every car at every
step: about 130 to 290 ns per car per step. With 500 cars at 50 times real
speed, the engine needs about 250,000 car-steps a second, which is 3% to 7%
of one core in Node.

## Decisions taken in the engine

- Every lane of a ring has the same length. The view stretches each lane to
  its drawn line, so the physics stays simple and the drawing still fits.
- A car alone in its lane drives on an empty road.
- The absorber switch acts behind every car that is not coordinated,
  selfish cars included.
- Lane 0 is the left lane. Keep left is the asymmetric MOBIL rule, mirrored,
  and is on by default. A world that drives on the right will mirror the
  drawing, not the physics. Without keep left, lane changes are symmetric.
- Each human's reaction time acts as a first-order lag by default. The Human
  Driver Model's pure delay is an option, kept for comparison: it does not
  meet the calibration targets.
- Lane changes are judged on the present positions, with no delay or
  estimation error, by each driver's plain model.
- A car waits 4 s between lane changes. MOBIL itself sets no wait. Without
  one, a car can flick between lanes.
- No research results are stored in this repo. The comparison reads the
  reference model's own results file.
