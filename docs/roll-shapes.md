# Rolling Shapes

## Summary

Rolling Shapes rolls any shape inside or around any shape, and pens on the rolling
shape draw the curve. Corners and poor fits tumble instead of refusing to run. The
app lives at `app/roll-shapes/`, and it will be served at
`drbuild.uk/app/roll-shapes/`. It has no build step and no libraries, and all its
settings live in the address.

## Implementation checklist

- [x] Shape library: circle, ellipse, squircle, rectangle, polygon, egg, flower, peanut
- [x] Formula, walk, method choice, Stuck check, and Close for both methods
- [x] Tests against known results, and a browser check
- [x] View, pens, play, four-corner controls, presets, layers, PNG, SVG, shared links
- [x] `tools/screen-fit/check.js` passes at all six sizes
- [x] Builder page entry, thumbnail, share card and short address
- [ ] A try on a real phone and iPad

## Files

| File | What it holds |
| --- | --- |
| `app/roll-shapes/shapes.js` | The shape library, and the fast depth test |
| `app/roll-shapes/rolling.js` | The formula, the method choice, exact fractions, Close for clean rolling |
| `app/roll-shapes/walk.js` | The walk |
| `app/roll-shapes/close.js` | Close for a shape that tumbles |
| `app/roll-shapes/compute.js` | Settings to path, and the readout's words |
| `app/roll-shapes/worker.js` | Runs the walk and the tumbling Close away from the page |
| `app/roll-shapes/presets.js` | The named starting points |
| `app/roll-shapes/draw.js` | Curves, shapes and pens on a canvas, and SVG paths |
| `app/roll-shapes/app.js` | The page: settings, sliders, pens, play and saving |
| `tools/roll-shapes/test.js` | The engine tests |
| `tools/roll-shapes/browser-check.js` | Drives the page in headless Chromium |
| `tools/roll-shapes/card.js` | Draws `social/roll-shapes.jpg` |
| `tools/thumbnails/roll-shapes.js` | Draws the builder page's two animated thumbnails |

`tools/roll-shapes/engine.js` and `make-examples.js` build the early examples page.
The app does not use them.

## Shapes

A shape is a closed polygon with its vertices listed counter-clockwise. A straight
side is one edge. A curve is many short edges of equal length, 1,024 at full detail.
Size is the perimeter, exactly, so the ratio of two sizes is exact. A turn above
0.15 rad at a vertex counts as a corner.

Every shape is star-shaped about its origin. The depth test relies on this: a
pseudo-angle lookup finds the edge that the ray through a point meets, with no
trigonometry, and the signed distance to that edge is the depth.

## Paths

Both methods produce a path: a list of poses (cos, sin, tx, ty). Each pen's curve
comes from that list, so a pen drag never repeats the rolling. Play steps along the
same list.

## Which method

1. **Blaschke's rolling theorem.** Inside, two convex shapes never cross if the
   inner shape's lowest curvature is above the outer shape's highest. Outside, two
   convex shapes never cross.
2. **Otherwise, a sample.** The formula's poses are tested for a crossing.
3. **Any crossing sends the pair to the walk,** unless Allow overlap is on. Then the
   formula runs anyway, and the readout says Overlaps.

## Formula

Each pose is a direct calculation from two arc positions. Rolling outside traverses
the inner outline backwards, so one code path serves both sides. A corner is a pivot
on the contact point, with no travel. Spins follow from trips and laps: trips − laps
inside, trips + laps outside.

## Walk

During a run, the inner shape lies still and the contact moves along both edges by
equal lengths. Only a pivot moves the shape, so only a pivot can make a new touch.

- **Pivot the normal way:** clockwise inside, anticlockwise outside. This lays the
  inner edge along the wall. A touch stops it and moves the contact there.
- **Pivot the other way:** a sampled wall asks for this each time it turns towards
  the shape. The step is refused if it drives another part through the wall. The
  contact then moves to the point just ahead that is all but touching.
- **A crossing that the move does not deepen cannot block the move.** Without this
  rule, a rear point within tolerance blocks the pivot and the shape rattles.
- **Touch test.** It uses a coarse ring of 128 points and every corner. A coarse point
  near the wall brings in the vertices beside it. Inside, only outer vertices that
  dent inwards can poke into the inner shape. Outside, all of them can.
- **Contact moves.** A move over 1.5% of the outer perimeter is a jump, and the
  status reads Tumbles. A smaller move is a slip, too small to see.

**Start.** The formula's pose at arc 0 if it is free. Otherwise the walk searches
for a free spot at 24 angles, then moves right until something touches. If nothing
fits, the status is Stuck and the formula's pose shows the crossing in red.

**Stuck.** Any of these:

- a pivot stopped at once, 16 times running;
- 8 jumps with under 0.02 rad of net turn and almost no net move;
- 3 laps under 0.01 spins per lap with almost no net move;
- a return to an earlier state with no net spin;
- the contact going round both outlines with no movement.

**Closing.** At each whole lap the state is compared with every earlier lap. A pose
within 0.01% of the outer perimeter, with the contact at the same place, means the
curve repeats from there. The walk runs 2 laps past N to allow for a first lap that
is still settling, and it drops those poses if nothing repeats.

## Close

**Clean rolling.** The ratio of perimeters becomes the nearest fraction with a
denominator of at most N. The move is largest beside a simple fraction, where the
next fraction sits about 1/N away: under 2.5% at N = 10, under 1.3% at N = 20, and
under 0.13% at N = 200.

**Tumbling.** Spins per lap is a rotation number, and the curve closes when that
number is a fraction with at most N laps. A secant search moves the inner size until
the rate lands on the nearest such fraction. The rate is read between the first jumps
after each lap, because lap ends fall at stair steps of a hop. If that fails, the
search tries nearby sizes, since a chaotic tumble often locks onto a closed orbit. It
runs in the worker for at most 25 s, and it says so if it finds nothing.

## View

Three canvases stack: kept layers, the live curves, and the shapes with their pens.
Long strokes go in pieces of 900 points, and points under a third of a pixel apart
are skipped. With the cards open, the picture keeps clear of their columns. Where the
corners have no room (a stage under 540 px tall, or under 460 px of side space in
total), each card folds to its name and one opens at a time.

During a slider drag, the formula draws at most 50,000 points for a pen and 72,000 among all the pens, and the walk
runs at 240 vertices for at most 70 ms. On release both run in full. New input
cancels a running worker job.

A tap on empty space adds a pen, up to 6. A tap on a pen removes it. Only a press
during play goes to the whole curve, with no pen added.

## Checking

```sh
node tools/roll-shapes/test.js
python3 -m http.server 8000
node tools/roll-shapes/browser-check.js
node tools/screen-fit/check.js http://localhost:8000/app/roll-shapes/ '#stage' --controls '.transport button' --out tools/roll-shapes/renders/screen-fit
```

Set `CHROMIUM` to a browser's path if Playwright cannot find its own.
