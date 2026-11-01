# Fractal Explorer

## Summary

The Fractal Explorer edits graph-directed iterated function systems in the
browser. A visitor places labelled copies of a square or triangle inside a
parent frame. The app applies those affine maps repeatedly, draws levels zero
to four, and renders the limit. It also reports convergence, dimension, the
convex hull, and likely overlap. The complete rule lives in the address.

## Implementation Checklist

- [x] Represent any number of linked letters as sets of affine maps.
- [x] Draw levels zero to four and a deeper limit view.
- [x] Report convergence, dimension, box count, convex hull, and overlap.
- [x] Edit exact square grids from 2 by 2 to 5 by 5.
- [x] Edit subdivided equilateral-triangle grids.
- [x] Move, turn, scale, flip, stretch, and skew children in Free mode.
- [x] Support Stretch, Blocks, Stacking, and Grid per letter.
- [x] Edit each child through a numbers table.
- [x] Add linked letters and change a child's letter.
- [x] Open on the Sieve and include Linked F and R and Free placement demos.
- [x] Store edited rules in the address.
- [x] Offer Fast, Balanced, Detailed, and editable calculation limits.
- [x] Use the four-corner control layout and fit all six browser sizes.
- [x] Add the builder-page entry and `/fractal` short address.

## Rule model

A rule has a frame shape, an editing mode, a list of letters, and a list of
children for each letter. Each child names its target letter and stores the
six coefficients of an affine map:

```text
x' = a x + c y + e
y' = b x + d y + f
```

This one representation serves every mode. Grid modes make exact rational
coefficients. Free mode changes the coefficients directly. A square child
uses the unit square. A triangle child uses the upright unit equilateral
triangle. A corner mark and an asymmetric letter preserve orientation.

The pure model is in `app/fractal/model.js`. The browser controller and canvas
views are in `app/fractal/app.js`. `tools/fractal/check.js` runs model checks
in Node. `tools/fractal/browser-check.js` checks the main interactions.

## Editing modes

Square mode divides a letter's frame into rows and columns. A tap adds one
child. Another tap selects the top child in that cell. Turn and Flip change
one of eight exact placements. Blocks lets a child cover several cells.
Stretch permits rectangular grids and rectangular blocks. Stacking lets a
tap add another child to an occupied cell.

Triangle mode divides an equilateral triangle into `N²` small triangles.
Both upright and downward cells accept children. The child's orientation
follows its cell, then Turn and Flip alter its placement. Blocks scales a
child across a larger triangular block.

Free mode draws child frames over a dashed parent. Drag inside a child to
move it. Drag a corner to turn and scale it. When Stretch is on, drag a side
handle to stretch or skew it. The numbers table accepts decimals and the
forms `1/3`, `sqrt(2)/2`, and `√2/2`.

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

The status check enumerates simple directed loops through the linked letters.
It multiplies the linear maps around each loop and inspects the largest
singular value. Values below one converge, values at one cycle, and values
above one grow. Stretch rules with competing directions can return Unclear.

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

The Sieve opens by default. It has three half-size upright copies and reports
`log 3 / log 2`. Linked F and R uses the child-count matrix `[[1,1],[1,2]]`.
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

The frame editor sits at the left on a computer. Readouts sit at the right.
The iteration strip and limit fill the centre. Four control groups occupy the
limit's corners: mode and letters, grid and toggles, colour, and camera.

On an upright touch screen, the editor and readouts become horizontally
scrolling cards below the limit. On a short sideways touch screen, the editor
becomes a narrow right rail. Every canvas uses Pointer Events. The full-screen
button appears only where the browser supports it.

## Later

Three-dimensional rules, PNG and SVG export, more colour modes, and a larger
demo gallery remain outside version 1.
