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
- [x] Edit exact square grids from 2 by 2 to 5 by 5.
- [x] Edit subdivided equilateral-triangle grids.
- [x] Move, turn, scale, flip, stretch, and skew children in Free mode.
- [x] Support Stretch, Stacking, and Grid per letter.
- [x] List the children in drawing order, reorder them by drag, and edit
      exact values in a pop-up.
- [x] Number the parents; add, duplicate, remove and reorder them.
- [x] Open on the Sieve in Free mode, with Linked pair and Free placement demos.
- [ ] Resize square-grid children across cells by dragging their corners.
- [x] Store edited rules in the address.
- [x] Offer Fast, Balanced, Detailed, and editable calculation limits.
- [x] Use the four-corner control layout and fit all six browser sizes.
- [x] Add the builder-page entry and `/fractal` short address.

## Rule model

A rule has a frame shape, an editing mode, a list of parents, and a list of
children for each parent. Each parent has an internal id (`p1`, `p2` and so
on). The number on screen is the parent's position in the list, so reordering
renumbers the parents without rewriting any reference. Each child names the
id of the parent it copies, and stores the six coefficients of an affine map:

```text
x' = a x + c y + e
y' = b x + d y + f
```

This one representation serves every mode. Grid modes make exact rational
coefficients. Free mode changes the coefficients directly. A square child
uses the unit square. A triangle child uses the upright unit equilateral
triangle. Each frame carries its parent's number with an underline beneath
it, which fixes which side is down. The number uses Times, whose lining
figures sit on the baseline; Georgia's old-style figures dropped onto the
underline. In the editor, the child's letter at its top left fixes the
orientation. The rule format is version 2; version 1 rules, which
used letters, are not read.

The pure model is in `app/fractal/model.js`. The browser controller and canvas
views are in `app/fractal/app.js`. `tools/fractal/check.js` runs model checks
in Node. `tools/fractal/browser-check.js` checks the main interactions.

## Editing modes

Free mode is the default. It draws child frames over a dashed parent. Drag
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
so a square child's corners are right angles again. The Stretch and Skew buttons under
Rotate L and Rotate R lock those jobs; a locked job loses its handles, and
with both locked the edges have none. The locks are kept in the browser key
`fractal-locks`. Together the handles reach every affine map: move, turn,
scale, stretch and skew. The knobs catch the pointer within 11 pixels and
the edge bars within 8, or less on a small child. A press on the selected
child or its handles keeps it, even under another child; otherwise a press
takes the topmost child.

The editor zooms and pans. A drag on empty space pans it, the wheel or a
two-finger pinch zooms about the pointer, and the magnifier buttons zoom
about the centre. The editor fits its children on its own until the first
zoom or pan; from then the view holds still, so a far child does not shrink
the rest, until Fit hands control back. Changing parent, mode or rule fits
again. A click on empty space without a drag deselects. The line under the
editor sets its height, kept with the panel widths in `fractal-panels`;
a double-click resets it. Each canvas redraws when its own box changes size,
so dragging a panel line zooms the picture and never stretches it. The strip above the editor holds the view buttons
on the left and the child buttons (add, duplicate and remove) on the right.

Snap corners, in Options, draws the grid of Rows by Cols (2 to 8) across the
editor. While a drag moves a corner within 6 pixels of a grid point, the
corner snaps to it, and it lets go when the pointer moves on. A scale moves
its corner along a line from the centre, so that corner snaps onto a grid
line, preferring a grid point. A turn snaps by angle only. During a drag the editor and the
main view keep their scale, and refit on release. The + button adds a
half-size child in the centre, or in the first free corner.

Square mode divides a parent's frame into rows and columns. A tap adds one
child. Another tap selects the top child in that cell. Unequal Rows and Cols
make rectangular copies; there is no separate Stretch switch. Stacking lets a tap add another child to an occupied cell.

Triangle mode divides an equilateral triangle into `N²` small triangles.
Both upright and downward cells accept children. Rotate turns by 120°, and
Flip V is disabled, since it would turn an upright cell into a downward one.

Rotate L, Rotate R, Flip H and Flip V act inside the child's own frame. Each
is a symmetry of the frame (a quarter turn or mirror of the square; a third
of a turn or mirror of the triangle), so the child's outline stays exactly in
place, whether it is a square, a rectangle or a skewed shape. Only the number
and underline turn or reverse inside it. Rotate R turns the number clockwise
as seen on screen, so on a flipped child it turns the other way in the
child's frame. Each child has a letter, A, B, C
and on, from its place in its parent's list. The letter sits at the child's
top left (a triangle: near its top) and relabels when the list is reordered. With no child selected they set the orientation of new children,
shown in the preview beside the panel heading. A duplicate goes to the right
of its original, or else above, left or below, whichever is free first; in a
grid, the nearest free cell. A duplicated parent goes after the original, and
its children that copied the original copy the duplicate. Removing a parent
removes every child that copied it.

The children list shows each child in drawing order: the first is drawn at
the back. Its grip reorders by drag. In Free mode the pencil opens a pop-up
that accepts decimals and the forms `1/3`, `sqrt(2)/2`, and `√2/2`, and
applies them on OK as one undo step. Free mode lists x, y, scale, angle and
flip while every child of the parent is a similarity, and the six affine
values once one is stretched or skewed. Real values show three decimals,
0.000 included, right-aligned in tabular figures so the points line up.
Names, parent numbers and whole numbers are centred.

A grid rule always moves to Free mode. A Free rule moves back only when every
map lies exactly on the requested grid. The mode control explains a refused
move and leaves the rule unchanged.

## Rendering

The iteration strip shows levels zero through four. The main view expands the
selected starting letter to the chosen depth. It stops expanding after 60,000
frames, so a large branching rule stays responsive. During a child drag or a
Iterations drag it draws at most 4000 copies within 40 ms, then draws in full
on release. Copies wholly off the canvas are not drawn, though the calculation
still spends its copy budget on them.

Converging rules share one fitted camera. Growing and cycling rules show the
latest four levels together. The main view can show or hide its convex hull.
Options has three colour modes: Order, Parent and Top copy. Order numbers
every copy in order, first child first at every level, and colours it by its
place on a scale from red (hue 0) through orange, yellow, green and cyan to
blue (hue 225). At each level a copy's share of the scale splits equally
among its children, and the copy takes the middle of its share. Parent gives
each parent its own colour. Top copy colours each copy by the top-level child
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
one. Equal ratios also get an exact display such as `log 3 / log 2`.

For affine maps, the app estimates Falconer's affinity dimension from products
of singular values. The estimate is numerical. A separate box count fits the
slope of occupied boxes at several resolutions.

The convex hull comes from the transformed frame corners at the rendered
depth. Andrew's monotone-chain algorithm returns its corners and area. The
overlap flag combines direct child-polygon intersections, a similarity
dimension above two, and disagreement between the formula and box count.

## Address and demos

Unedited demos use short hashes: `#demo=sieve`, `#demo=linked`, and
`#demo=free`. An edit replaces this with a URL-safe base-64 encoding of the
rule and view settings. Loading that address restores the complete design.

The Sieve opens by default, in Free mode. It has three half-size upright
copies and reports `log 3 / log 2`. Linked pair uses the child-count matrix
`[[1,1],[1,2]]`.
Free placement demonstrates continuous position, angle, scale, and a flip.

## Calculation limits

Every expansion stops at the first applicable limit. The stage names that
limit beside its copy count. No limit is ever passed by work in the
background: a high Iterations value with a copy limit of 25,000 builds at most
25,000 copies. Frame time covers a whole frame: working out the copies and
drawing them. Drawing takes most of it: working out 25,000 Dragon copies
takes about 5 ms, and drawing them about 35 ms. Each frame measures its time
per copy, and the next frame turns Frame time into a copy limit. A frame
stopped this way reads "time limit". To keep a view fast, set the other
limits high and Frame time low, such as 50 ms. Minimum iterations sets the
fewest iterations before Minimum scale may stop a copy splitting. Analysis
depth sets the iterations behind the readouts (box dimension, overlap and the
hull) and does not change the drawing. Minimum scale uses the affine map's largest
singular value, so the same limit works for any frame shape and for stretched
copies.

| Limit | Fast | Balanced | Detailed |
|---|---:|---:|---:|
| Iterations | 6 | 7 | 10 |
| Minimum iterations | 3 | 4 | 5 |
| Maximum copies | 10,000 | 60,000 | 120,000 |
| Minimum linear scale | 1/1,000 | 1/10,000 | Unlimited |
| Frame time | 100 ms | 250 ms | 1,000 ms |
| Analysis depth | 5 | 7 | 9 |
| Hull refinement | 16 | 32 | 64 steps |

Advanced controls expose every value. Maximum copies, minimum scale, and
frame time use logarithmic stepped sliders. Iteration depths use linear
sliders. Hull refinement uses a select. Changing one advanced value marks the
settings Custom. Selecting a preset restores all seven values.

The selectable ranges are 1,000 to 250,000 copies, minimum scales from 1/10
to 1/1,000,000 or Unlimited, and frame times from 25 to 2,000 ms.
Iterations run from 0, the parent alone, to 20. These limits and the selected view travel
with a shared address.

## Layout and input

The left panel holds the rule name and demos, the Free, Square and Triangle
buttons, the parent row, the frame editor, the child panel and the children
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
