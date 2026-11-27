# Fractal Explorer

## Summary

The Fractal Explorer edits graph-directed iterated function systems in the
browser. A visitor places labelled copies of a square or triangle inside a
parent frame. The app applies those affine maps repeatedly, draws levels zero
to four, and renders the limit. It also reports convergence, dimension, the
convex hull, and likely overlap. The complete rule lives in the address.

## Implementation Checklist

- [x] Represent any number of linked parents as sets of affine maps.
- [x] Draw levels zero to four and a deeper limit view.
- [x] Report convergence, dimension, box count, convex hull, and overlap.
- [x] Move, turn, scale, flip, stretch, and skew children.
- [x] Snap children to an optional grid of 2 to 8 columns and rows.
- [x] Switch the frame between square and triangle, with a triangular snap grid.
- [x] List the children in drawing order, reorder them by drag, and edit
      exact values in a pop-up.
- [x] Number the parents; add, duplicate, remove and reorder them.
- [x] Choose each parent's colour from a swatch in the parent row.
- [x] Open on the Sieve, with Gasket, Linked pair and Free placement demos.
- [x] Store edited rules in the address.
- [x] Offer Fast, Balanced, Detailed, and editable calculation limits.
- [x] Use the four-corner control layout and fit all six browser sizes.
- [x] Add the builder-page entry and `/fractal` short address.
- [x] Draw copies in colour batches and skip branches wholly off screen.

## Rule model

A rule has a frame shape, a snap grid, a list of parents, and a list of
children for each parent. Each parent has an internal id (`p1`, `p2` and so
on). The number on screen is the parent's position in the list, so reordering
renumbers the parents without rewriting any reference. Each child names the
id of the parent it copies, and stores the six coefficients of an affine map:

```text
x' = a x + c y + e
y' = b x + d y + f
```

The editor changes the coefficients directly. The frame is one shape for the
whole rule, `square` or `triangle`: the unit square, or the upright
equilateral triangle of side 1 with its apex at (1/2, 0). Every parent and
child draws in it. Frame, in Options, switches it and keeps every map, so the
fractal stays the same and only the outlines change; the switch is one undo
step. A triangle's Flip V mirrors the child across its own bottom edge, so
it lands upside down on the other side of that edge. The edge is a grid line,
so the child stays on the snap grid, and a second Flip V brings it back. With
no child selected, Flip V turns the new-child preview upside down about its
centre, so + still places the child where it would have gone. Each frame carries its parent's number with an underline beneath
it, which fixes which side is down. The number uses Times, whose lining
figures sit on the baseline; Georgia's old-style figures dropped onto the
underline. In the editor, the child's letter at its top left fixes the
orientation. The rule format is version 2; version 1 rules, which
used letters, are not read.

Until 2026-11-27 the app also had Square and Triangle grid modes, where a tap
placed a child in a cell. They were never finished and were removed, because
Free mode with the snap grid covers grid layouts. Rules saved then carry
`mode`, `toggles` (Stretch, Blocks, Stacking and Grid per letter), a
per-parent grid and cell placements on each child. `normaliseRule()` drops
those fields on load. The maps alone define the rule, so it draws the same.

The pure model is in `app/fractal/model.js`. The browser controller and canvas
views are in `app/fractal/app.js`. `tools/fractal/check.js` runs model checks
in Node. `tools/fractal/browser-check.js` checks the main interactions.

## Editing

The editor draws child frames over a dashed parent. Drag
inside a child to move it. A moved child sticks on each axis by itself: its
corners' x values stick to any x within 6 pixels, and likewise y. The
targets are the parent's corners, the other children's corners and, with
Snap corners on, the grid lines. So a child lined up with an edge slides
along it while the hand wobbles across it. Alt moves it freely. The selected child has two corner knobs, on its
own corners, so they turn and flip with it. The top-right corner (a
triangle: its top point) shows a circular arrow and turns the child about
its centre. A turn holds at 0°, 90°, 180° and 270° within 4° (a triangle:
every 60°), and at other 15° steps within 2°. The bottom-right corner shows a
two-headed arrow and scales the child about its centre, snapping to simple
ratios such as 1/2 and 3/2. Shift on the scale corner stretches both ways in
the child's own frame. The other corners have no handle.

Each edge has one bar-shaped handle at its middle, lying along the edge. The
first 4 pixels of a drag pick its job, which then holds: across the edge
stretches one way, with the opposite edge fixed (a triangle: the opposite
corner), and along the edge skews it. Zero skew holds within 6 pixels: the
point where the dragged edge stands square to the line from the fixed side,
so a square child's corners are right angles again. Together the handles reach every affine map: move, turn,
scale, stretch and skew. The knobs catch the pointer within 11 pixels and
the edge bars within 8, or less on a small child. A press on the selected
child or its handles keeps it, even under another child; otherwise a press
takes the topmost child.

The editor zooms and pans. A drag on empty space pans it, the wheel or a
two-finger pinch zooms about the pointer, and the magnifier buttons zoom
about the centre. The editor fits its children on its own until the first
zoom or pan; from then the view holds still, so a far child does not shrink
the rest, until Fit hands control back. Changing parent or rule fits
again. A click on empty space without a drag deselects. The line under the
editor sets its height, kept with the panel widths in `fractal-panels`;
a double-click resets it. Each canvas redraws when its own box changes size,
so dragging a panel line zooms the picture and never stretches it. The strip above the editor holds the view buttons
on the left and the child buttons (add, duplicate, randomise and remove) on the right.

Snap corners, in Options, draws the snap grid across the editor. The grid
follows the frame: Cols by Rows (2 to 8 each) on a square, and Per side (2 to
8) on a triangle, which cuts each side into that many pieces. The triangular
lattice has lines parallel to the triangle's three sides. `snapLattice()`
holds each grid as families of lines, n · p = offset + k × spacing, and finds
the nearest lattice point. The rule stores the grid as `grid.rows`,
`grid.cols` and `grid.side`. While a drag moves a corner within 6 pixels of a grid point, the
corner snaps to it, and it lets go when the pointer moves on. A scale moves
its corner along a line from the centre, so that corner snaps onto a grid
line, preferring a grid point. A turn snaps by angle only. During a drag the editor and the
main view keep their scale, and refit on release. With Snap corners on,
the + button adds a child one grid cell in size, in the first free cell in
reading order: 1/Cols by 1/Rows on a square, and 1/Per side on a triangle.
On a triangle it takes an upright cell, or an upside-down one when the
preview is upside down. With Snap corners off, + adds a half-size child in
the centre, or in the first free corner. A duplicate keeps its original's
size.

Rotate L, Rotate R, Flip H and Flip V act inside the child's own frame. Each
is a symmetry of the frame (a quarter turn or mirror of the square; a third
of a turn or mirror of the triangle), so the child's outline stays exactly in
place, whether it is a square, a rectangle or a skewed shape. Only the number
and underline turn or reverse inside it. Rotate R turns the number clockwise
as seen on screen, so on a flipped child it turns the other way in the
child's frame. Each child has a letter, A, B, C
and on, from its place in its parent's list. The letter sits at the child's
top left (a triangle: its bottom-left corner, off the centre line, so Flip H
shows) and relabels when the list is reordered. With no child selected they set the orientation of new children,
shown in the preview beside the panel heading. The dice between Duplicate and Remove randomises the
orientation of every child of the current parent. The dice in the parent row
does the same for every child of every parent. Each child also copies a
parent picked at random from all the parents, so a linked system can lose
some of its links; that is part of the roll. A click picks one of all the
frame's orientations, 8 on a square or 6 on a triangle: a random number of
Rotate R steps, after a Flip H half the time. Shift-click leaves out the flip,
so it picks one of the 4 or 3 turns and a flipped child stays flipped. Each
child keeps its outline, as with the orientation buttons, and one Undo
reverses the whole randomise. A roll that changes nothing rolls again. Each
dice says this in its tooltip. A duplicate goes to the right
of its original, or else above, left or below, whichever is free first. A duplicated parent goes after the original, and
its children that copied the original copy the duplicate. Removing a parent
removes every child that copied it.

The children list shows each child in drawing order: the first is drawn at
the back. Its grip reorders by drag. The pencil opens a pop-up
that accepts decimals and the forms `1/3`, `sqrt(2)/2`, and `√2/2`, and
applies them on OK as one undo step. The list shows x, y, scale, angle and
flip while every child of the parent is a similarity, and the six affine
values once one is stretched or skewed. Real values show three decimals,
0.000 included, right-aligned in tabular figures so the points line up.
Names, parent numbers and whole numbers are centred.

## Rendering

`expand()` splits the largest copy first. A copy's size is its largest
singular value, sorted into bands 2^(1/8) wide (about 9%) in a bucket queue;
within a band copies split first in, first out, so a rule whose copies all
shrink alike still expands level by level. When a limit stops the splitting,
the copies left are all of a similar size. Level by level, a rule with one
large and one small child ran out of copies while its slow branch was still
large: 200,000 copies left one copy at 2.6% of the frame beside copies of
1/5,000,000. Largest first, the same 200,000 copies all lie between 0.016%
and 0.15%. The order is loose on purpose: the band width hardly changes the
cost (1, 2 or 8 bands per doubling all ran within a few milliseconds), and a
strict order would gain nothing visible. The copies come out in the order
they were made, so roughly largest first, with each split's children
together in child order. Putting the result in strict child order, depth
first, cost more than the splitting itself, so it was dropped; level by
level was never in child order either. Working out 200,000 copies takes
about 30 to 45 ms against 20 to 30 ms level by level, and drawing them
takes several times longer, so a frame costs about 10% more.

The iteration strip shows levels zero through four. The main view expands the
selected parent to the chosen depth, unless Maximum copies, Minimum scale or
Frame time stops it first, so a large branching rule stays responsive. During a child drag or a
Iterations drag it draws within 12 ms a frame, at most 200,000 copies, then
draws in full on release. Drag frames learn their own time per copy, apart
from full frames. Pointer moves are merged so each screen frame draws once.
In Chrome on an M-series Mac a drag holds 60 frames a second with about
30,000 Dragon copies or 43,000 Sieve copies, against a fixed 4000 before.

`drawBatch()` draws the main view and the iteration strip. Copies of one
colour and opacity share one `Path2D`, so the canvas fills and strokes each
colour once. Every outline goes in anticlockwise, so overlapping copies,
flipped or not, never cancel to a hole under the nonzero fill rule. Outlines
end with a line back to their start: `closePath()` on a large `Path2D` slows
as the path grows, and took 15 s of a 3 s-per-frame profile. Copies large
enough for a number get one, drawn on top. Colour groups draw in the order
they first appear, so overlap order follows the colours. 500,000 Dragon
copies draw in about 240 ms in Chrome on an M-series Mac.

The main view skips branches wholly off screen, so the copy and time limits
are spent on what shows. `coverDiscs()` in the model gives each parent a disc
that holds its frame and every copy below it, at any depth. The radii are the
least solution of r = max(frame radius, |f(c′) − c| + σ₁(f) r′), raised by
0.1% and then checked against that inequality, so the bound is proved rather
than sampled. `expand()` takes a `cull` test and drops a child whose mapped
disc lies off the canvas. A rule with a copy that does not shrink has no
discs and is not pruned, and Grows and Cycles views are never pruned.

Converging rules share one fitted camera. Growing and cycling rules show the
latest four levels together. The main view can show or hide its convex hull.
Options has three colour modes: Order, Parent and Top copy. Order numbers
every copy in order, first child first at every level, and colours it by its
place on a scale from red (hue 0) through orange, yellow, green and cyan to
blue (hue 225). At each level a copy's share of the scale splits equally
among its children, and the copy takes the middle of its share. Parent gives
each parent its own colour. A round swatch after the parent numbers shows the
selected parent's colour and opens a picker: the 10 palette colours, a
Custom colour input and Default. The choice is stored as `colour` on the
parent, a six-digit hex value, so it travels in the address and in saved
fractals, and each choice is one undo step. A parent with no `colour` takes
the default for its position: yellow, red, blue and green for parents 1 to
4 (`#e9b44c`, `#dc6f82`, `#57a9d8`, `#7fc66c`), then the rest of the palette.
Every parent keeps its colour when parents are reordered, added or removed:
where the colour differs from the default for its new number, the app
stores it as `colour` on the parent. The colour always shows on the parent
and child buttons and in the children table. In Parent colour mode it also
colours every view. Top copy colours each copy by the top-level child
it sits inside. Order is the default for every rule, so adding or removing a
parent never changes the mode. The mode
travels in the address as `colour`; older addresses and saved fractals held
true or false for Top copy, and still open.

## Readouts

The status check brackets the joint spectral radius of the linear parts.
`growthBounds()` follows every chain of children for up to ten levels, or
until 20,000 chains. For each chain that returns to its starting parent, the
largest eigenvalue to the power 1/length is a lower bound. For each length,
the largest singular value over all chains, to the power 1/length, is an upper
bound. A lower bound above one grows. An upper bound below one converges. A
lower bound of one cycles. Anything else is Unclear: a strong skew can have
eigenvalues below one and singular values above one for many levels. Grows
and Cycles show the latest four levels in the main view.

For similarity maps, the app solves the Mauldin-Williams equation. It finds
the value `s` where the spectral radius of the weighted child-count matrix is
one. When every copy shares one ratio r, the value is log ρ / log (1/r), where
ρ is the spectral radius of the child-count matrix. The Formula row names it
when ρ is a whole number, a square root or a power of the golden ratio φ, and
1/r is a whole number or a square root: `log 3 / log 2` for the Sieve,
`2 log φ / log 2` for the Linked pair, `log 2 / log √2` for the Dragon.
Otherwise the row reads Method, and names Similarity equation or Affinity
estimate. When overlap is likely the value shows as an upper limit, `≤ 1.4181`.
A parent with no children reads Empty, with dashes in every row.

For affine maps, the app estimates Falconer's affinity dimension from products
of singular values. The estimate is numerical. A separate box count fits the
slope of occupied boxes on 8, 16, 32 and 64 square grids, shown to 2 places.
A converging rule is analysed at the deepest level holding at most 20,000
copies, starting from Analysis depth, so a two-copy rule such as the Dragon
has enough sample points.

The convex hull comes from the transformed frame corners at the rendered
depth. Andrew's monotone-chain algorithm returns its corners and area. The
overlap flag combines direct child-polygon intersections, a similarity
dimension above two, and a formula more than 0.35 above the box count. The
box count reads low for a solid shape with a rough edge (the Dragon reads
1.75 for 2), so a smaller gap gives false alarms.

## Address and demos

Unedited demos use short hashes: `#demo=sieve`, `#demo=gasket`,
`#demo=linked`, and `#demo=free`. An edit replaces this with a URL-safe base-64 encoding of the
rule and view settings. Loading that address restores the complete design.

The Sieve opens by default. It has three half-size upright
copies and reports `log 3 / log 2`. Gasket is the equilateral Sierpinski
triangle: a triangle frame with a half-size copy in each corner, also
`log 3 / log 2`. Linked pair uses the child-count matrix
`[[1,1],[1,2]]`.
Free placement demonstrates continuous position, angle, scale, and a flip.

## Calculation limits

Every expansion stops at the first applicable limit. The stage names that
limit beside its copy count. No limit is ever passed by work in the
background: a high Iterations value with a copy limit of 25,000 builds at most
25,000 copies. Frame time covers a whole frame: working out the copies and
drawing them. Each full frame measures its time per copy, and the next frame
turns Frame time into a copy limit. Drag frames do not teach the estimate:
they stop at shallower levels, where larger copies cost more each to fill. A
frame stopped this way reads "time limit". To keep a view fast, set the other
limits high and Frame time low: at 50 ms the Dragon draws about 105,000
copies a frame. Minimum iterations sets the fewest iterations before Minimum
scale may stop a copy splitting. Analysis depth sets the fewest iterations
behind the readouts (box dimension, overlap and the hull) and does not change
the drawing. Minimum scale uses the affine map's largest
singular value, so the same limit works for any frame shape and for stretched
copies.

| Limit | Fast | Balanced | Detailed |
|---|---:|---:|---:|
| Iterations | 6 | 7 | 10 |
| Minimum iterations | 3 | 4 | 5 |
| Maximum copies | 10,000 | 25,000 | 120,000 |
| Minimum linear scale | 1/1000 | 1/2500 | Unlimited |
| Frame time | 100 ms | 250 ms | 1,000 ms |
| Analysis depth | 5 | 7 | 9 |
| Hull refinement | 16 | 32 | 64 steps |

Maximum copies, Minimum scale and Frame time sit under the presets, in view
whenever Options is open. Below them, Advanced folds away Minimum iterations,
Analysis depth and Hull refinement, which most visitors never need. Each control has a tooltip.
Maximum copies, minimum scale, and frame time use logarithmic stepped
sliders. Iteration depths use linear
sliders. Hull refinement uses a select. Changing one of these values marks the
settings Custom. Selecting a preset restores all seven values.

The selectable ranges are 1 to 500,000 copies, minimum scales from 1/1 to
1/1,000,000 or Unlimited, and frame times from 1 to 2000 ms.
Iterations run from 0, the parent alone, to 32. These limits and the selected view travel
with a shared address.

## Layout and input

The left panel holds the rule name and demos, the parent row, the frame editor, the child panel and the children
list. Readouts and saved fractals sit at the right. The iteration strip and
limit fill the centre, with three corner groups: levels, grid and toggles;
colour; and camera. The views draw the parent selected in the parent row.

Keys: 1 to 9, and 0 for 10, set a child's parent; Shift with a digit selects
that parent. R and T rotate left and right, H and V flip, Backspace or Delete
removes the last thing clicked (a child or a parent), Cmd+D or Ctrl+D
duplicates it, and Escape deselects.

Saved fractals use the browser key `fractal-library-v2` and files with
`{ format: "fractal-explorer", version: 2, fractals: [...] }`. The version 1
key is deleted on load.

On an upright touch screen, the editor and readouts become horizontally
scrolling cards below the limit. On a short sideways touch screen, the editor
becomes a narrow right rail. Every canvas uses Pointer Events. The full-screen
button appears only where the browser supports it.

## Later

Three-dimensional rules, PNG and SVG export, more colour modes, and a larger
demo gallery remain outside version 1.
