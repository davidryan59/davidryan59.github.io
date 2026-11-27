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
triangle. Each frame carries its parent's number, an underline beneath it,
and a dot near the bottom-right corner. The underline fixes which side is
down and the dot fixes which end, so all eight square placements differ even
for a symmetric number. The rule format is version 2; version 1 rules, which
used letters, are not read.

The pure model is in `app/fractal/model.js`. The browser controller and canvas
views are in `app/fractal/app.js`. `tools/fractal/check.js` runs model checks
in Node. `tools/fractal/browser-check.js` checks the main interactions.

## Editing modes

Free mode is the default. It draws child frames over a dashed parent. Drag
inside a child to move it. Drag a corner to turn and scale it about the
opposite corner (a triangle: about the opposite edge's midpoint). When Stretch
is on, drag a side handle to move that edge; the corner after it stays fixed,
and three corners decide the new affine map. Handles catch the pointer within
14 pixels, inside or outside the frame. A press tries the selected child's
handles first, then takes the topmost child. During a drag the editor and the
main view keep their scale, and refit on release. The + button adds a
half-size child in the centre, or in the first free corner.

Square mode divides a parent's frame into rows and columns. A tap adds one
child. Another tap selects the top child in that cell. Stretch permits
rectangular grids. Stacking lets a tap add another child to an occupied cell.

Triangle mode divides an equilateral triangle into `N²` small triangles.
Both upright and downward cells accept children. Rotate turns by 120°, and
Flip V is disabled, since it would turn an upright cell into a downward one.

Rotate L, Rotate R, Flip H and Flip V act as the child looks on screen, about
its centre. With no child selected they set the orientation of new children,
shown in the preview beside the panel heading. A duplicate goes to the right
of its original, or else above, left or below, whichever is free first; in a
grid, the nearest free cell. A duplicated parent goes after the original, and
its children that copied the original copy the duplicate. Removing a parent
removes every child that copied it.

The children list shows each child in drawing order: the first is drawn at
the back. Its grip reorders by drag. In Free mode the pencil opens a pop-up
that accepts decimals and the forms `1/3`, `sqrt(2)/2`, and `√2/2`, and
applies them on OK as one undo step.

A grid rule always moves to Free mode. A Free rule moves back only when every
map lies exactly on the requested grid. The mode control explains a refused
move and leaves the rule unchanged.

## Rendering

The iteration strip shows levels zero through four. The main view expands the
selected starting letter to the chosen depth. It stops expanding after 60,000
frames, so a large branching rule stays responsive. During a pointer drag it
uses two fewer levels, then restores the complete view on release.

Converging rules share one fitted camera. Growing and cycling rules show the
latest four levels together. The main view can show or hide its convex hull.
Colour follows the current letter.

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
limit beside its copy count. Minimum scale uses the affine map's largest
singular value, so the same limit works for any frame shape and for stretched
copies.

| Limit | Fast | Balanced | Detailed |
|---|---:|---:|---:|
| Iterations | 6 | 7 | 10 |
| Minimum iterations | 3 | 4 | 5 |
| Maximum copies | 10,000 | 60,000 | 120,000 |
| Minimum linear scale | 1/1,000 | 1/10,000 | Unlimited |
| Calculation time per pass | 100 ms | 250 ms | 1,000 ms |
| Analysis depth | 5 | 7 | 9 |
| Hull refinement | 16 | 32 | 64 steps |

Advanced controls expose every value. Maximum copies, minimum scale, and
calculation time use logarithmic stepped sliders. Iteration depths use linear
sliders. Hull refinement uses a select. Changing one advanced value marks the
settings Custom. Selecting a preset restores all seven values.

The selectable ranges are 1,000 to 250,000 copies, minimum scales from 1/10
to 1/1,000,000 or Unlimited, and calculation times from 25 to 2,000 ms.
Iteration depth runs from 1 to 12. These limits and the selected view travel
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
