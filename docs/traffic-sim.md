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

This document describes the engine, how to check it, and the view. The
engine is written from the published models: the Intelligent Driver Model,
MOBIL and Gipps's safe speed. It uses no code from traffic-simulation.de,
which is GPL v3.

## Implementation checklist

- [x] Engine: rings with one and two lanes, six driver types, the absorber
      switch, MOBIL lane changes, Gipps's safe-speed cap, a fixed 0.1 s step
      and seeded random numbers
- [x] Node sweep that matches the reference model's one-lane tables
- [x] Checks: peak flow, Sugiyama's ring, Stern's absorber, the absorber
      switch, the two-lane ring, repeatability, a tap, adding cars
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
| `app/traffic-sim/engine/mix.js` | Which cars get which driver type |
| `app/traffic-sim/engine/rng.js` | Seeded random numbers |
| `app/traffic-sim/index.html`, `style.css` | The page: the cards and their layout |
| `app/traffic-sim/app.js` | The page's logic: controls, the clock, input, live numbers and the address |
| `app/traffic-sim/view.js` | The 3D view: the oval's shape, the meshes, the shaders and the camera |
| `tools/traffic-sim/sweep.js` | The one-lane sweep: 1,848 runs on every core |
| `tools/traffic-sim/tables.js` | The tables from a sweep, and a cell-by-cell comparison of two sweeps |
| `tools/traffic-sim/checks.js` | The other checks, each with PASS or FAIL |

## Using the engine

```js
import { Ring } from './engine/ring.js';
import { mixTypes } from './engine/mix.js';
import { makeRng } from './engine/rng.js';

const types = mixTypes(100, { coordinated: 0.3, selfish: 0.2 }, makeRng(7));
const ring = new Ring({ length: 2000, lanes: 2, types, seed: 7, absorb: false });
ring.step();            // 0.1 s
ring.stats().flow;      // vehicles per hour per lane since the last resetStats()
```

`new Ring(options)` takes:

- `length`: the ring's length in metres. Every lane has this length.
- `lanes`: 1 or more. The app uses 1 and 2.
- `types`: one driver type per car. The number of cars is the length of
  this list.
- `seed`: the seed for the start positions and the noise.
- `absorb`: the absorber switch on Coordinated Mode. Off by default. The
  view may change `ring.absorb` at any time.
- `params`: values that replace the defaults, group by group, for example
  `{ human: { T: 1.4 }, mobil: { politeness: { human: 0.5 } } }`.
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
   an acceleration. Noise is added, unless a tap holds the brakes on.
4. A first-order lag turns each command into an acceleration. Speed and
   position follow, and speed never goes below zero.
5. The collision guard acts.
6. The measures are updated while measuring.

Every car's command in a step reads the state from the step before, so the
order of the cars in step 3 makes no difference.

## Driver models

Six driver types exist. The app offers three: human, coordinated and
selfish. Timid, cooperative and absorber exist so that the engine reproduces
every column of the reference tables.

### Humans

The Intelligent Driver Model (Treiber, Hennecke and Helbing 2000):

```
s* = s0 + max(0, v T + v (v − vl) / (2 √(a b)))
command = a (1 − (v / v0)^δ − (s* / max(gap, 0.1))²), clipped to −9 … +3 m/s²
```

| Parameter | Value |
|---|---|
| Desired speed v0 | 30 m/s |
| Time gap T | 1.2 s |
| Acceleration a | 1.0 m/s² |
| Comfortable braking b | 1.5 m/s² |
| Jam gap s0 | 2 m |
| Exponent δ | 4 |
| Response lag | 0.5 s |
| Noise | 0.3 m/s² per step, normal |

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

MOBIL (Kesting, Treiber and Helbing 2007), in its symmetric form, with no
keep-left rule. Car c considers each neighbouring lane. Let n be the follower
it would join and o the follower it would leave, with a tilde for the
accelerations after the move. The car moves if both tests pass:

- **Safety.** The car fits, with a gap greater than zero to the cars ahead
  and behind, and neither it nor its new follower must brake harder than
  4 m/s².
- **Incentive.** ã_c − a_c + p (ã_n − a_n + ã_o − a_o) > 0.1 m/s².

Each acceleration comes from the same function that drives the car in the
step, without noise, so a lane change is judged by the driver's own model.
After a change, a car waits 4 s before it may change again, and a car whose
brakes a visitor holds does not change.

| Driver type | Politeness p |
|---|---|
| Selfish | 0, its own gain only |
| Human | 0.25 |
| Coordinated, cooperative, timid, absorber | 1, which minimises the total braking |

The human value is the middle of the range that MOBIL's authors give as
typical, 0 to 0.5. It needs calibration against real lane-change data.

## Collision guard

After the move, a car whose front overlaps its leader's rear goes 5 cm
behind the leader, no faster than the leader, and counts as a crash. Every
case is judged on the positions before any car is moved. The sweep and the
checks record no crashes at all.

## Measures

`stats()` returns these, from the last `resetStats()`:

| Measure | Definition |
|---|---|
| `flow` | Density per lane × mean speed, in vehicles per hour per lane |
| `meanSpeed`, `speedSpread` | Mean and standard deviation of every car's speed, sampled once a second (m/s) |
| `energy` | The positive change in speed squared, per metre travelled: a proxy for the energy spent accelerating |
| `hardBraking` | The share of car-time below −2 m/s² |
| `crashes`, `laneChangesPerCarHour` | Counts in the window |

Waves are present when the speed spread passes 1.5 m/s. The wave onset of a
case is the lowest density where they are.

## Random numbers and repeatability

`rng.js` holds sfc32, seeded through a splitmix32 hash, with normal deviates
by the polar method. One seed gives the same run in every browser and in
Node. `hashSeed()` mixes numbers and strings into a seed, so a sweep can name
each run's seed by its case.

`assignTypes()` picks round(share × cars) self-driving cars at random places,
then splits them between types. It rounds a half to the even number, as
Python does, so a mix has the same car counts as in the reference model.
`mixTypes()` takes the app's mix: the coordinated and selfish shares of all
cars.

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

`reference.json` is the reference model's results file. It is kept with the
research, not in this repo.

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

It runs in about 10 s and exits with 1 if any check fails. All passed on
2026-10-08:

- Human traffic peaks at 2,130 vehicles per hour per lane, inside the
  2,000 to 2,200 seen on real roads.
- 22 human drivers on a 230 m ring form a stop-and-go wave, as in Sugiyama
  et al. (2008), with a speed spread of 2.5 m/s.
- One absorber among them clears the wave, as in Stern et al. (2018). The
  spread falls to 0.85 m/s and flow rises 20%.
- A coordinated car with the absorber switch on drives exactly as an
  absorber behind a human, and platoons behind a coordinated car.
- The two-lane ring runs 36 runs of 100 cars with no collisions, and the
  lanes stay within 16 cars of each other.
- At 45 and 60 vehicles per km per lane, selfish cars change lane 25 to
  30 times per car-hour. Humans and coordinated mixes change at most 3.3
  times.
- A seed repeats exactly, and another seed differs.
- A tap on one car slows the tenth car behind it from about 22 m/s to
  19 m/s.
- `addCar()` packs a ring until no gap has room, with no collisions after.

### Known limits

- **Humans rarely change lane.** Every human has the same desired speed, so
  on the ring MOBIL finds little to gain: under one change per car-hour.
  Real drivers differ in desired speed. A spread of desired speeds is the
  likely fix, and needs calibration.
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

1. **Road:** one lane or two. Rebuilds the ring.
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

**The address.** The settings and the seed follow the #, for example
`#lanes=1&density=45&av=30&selfish=50&absorb=0&speed=5&colour=type&camera=top&seed=11`.
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

**Checked in a browser.** In headless Chromium on 2026-10-08, with seed 11,
humans alone at 45 cars per km jammed within 22 simulated minutes. Speeds
spread by 27 km/h, 5 cars stood still and flow fell to 1,541 cars per hour.
Two coordinated cars with the absorber switch on cleared the jam: the spread
fell to 1 km/h, no car stood still, and flow rose to 1,948.

## Speed

A one-lane run of 50 cars for 1,500 s takes about 60 ms in Node on an Apple
laptop. The sweep of 1,848 runs takes about 20 s on 10 cores. A two-lane
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
- Lane changes are symmetric, with no keep-left rule and no bias between
  lanes.
- A car waits 4 s between lane changes. MOBIL itself sets no wait. Without
  one, a car can flick between lanes.
- No research results are stored in this repo. The comparison reads the
  reference model's own results file.
