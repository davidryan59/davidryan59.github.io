# E8 root system explorer

## Summary

The explorer projects all 240 E8 roots from eight dimensions onto the screen.
Every drag changes an orthonormal 8D viewing frame, so the roots keep their
exact distances and angles while their two-dimensional shadow moves. A visitor
can orbit through one hidden direction, grab a root, animate a free 8D drift,
inspect four structural views and open four high-symmetry projections.

## Implementation Checklist

- [x] Generate all 240 roots from their exact coordinate definition.
- [x] Derive all 6,720 edges and verify that each root has 56 neighbours.
- [x] Keep the projection as two rows of an orthonormal 8D frame.
- [x] Rotate through a chosen hidden dimension by dragging empty space.
- [x] Find a minimum-change rigid 8D rotation when a root is dragged.
- [x] Animate a free drift that mixes all eight coordinate directions.
- [x] Show four main projections, all four Coxeter planes and five specialist
  projections from the original explorer.
- [x] Show the complete root system, one neighbourhood, eight order-30 cycles
  and the E8 Dynkin diagram.
- [x] Colour by order-30 orbit, root type, current projection or one colour.
- [x] Show no edges, one root's 56 edges or all 6,720 edges.
- [x] Preserve a view in the address and support mouse, keyboard and touch.
- [x] Fit all six browser sizes in the screen-fit check.
- [ ] Try the explorer on a real phone, an iPad and Safari.

## Root data

The explorer constructs E8 in its standard coordinate form. The first 112
roots have two coordinates equal to plus or minus 1 and six zero coordinates.
The other 128 roots have eight coordinates equal to plus or minus one half,
with an even number of minus signs. Every root has squared length 2.

Two roots share a polytope edge when their inner product is 1. The page derives
the edge list rather than storing it. The resulting graph has 6,720 edges and
degree 56 at every root. Relative to one root, the system contains 56 roots at
60 degrees, 126 at 90 degrees, 56 at 120 degrees and one opposite root.

`app/e8/model.js` holds the pure model and matrix operations. It runs in both
the browser and Node. `tools/e8/check.js` checks the root counts, edge counts,
angle counts, order-30 cycles, preset frames and rigid rotation invariants.

## Projection and motion

The first two rows of an orthonormal 8 by 8 frame define the screen projection.
For a root `r`, the screen coordinates before scaling are the two inner
products with those rows. The other six rows complete the frame and give the
directions hidden from the screen.

An empty-space drag rotates the two screen rows through one selected hidden
row. Shift-drag or right-drag rotates within the screen plane. A two-finger
gesture zooms and turns the projection.

Dragging a root has no unique 8D answer. For each pointer movement, the viewer
solves two linear constraints over the 28 plane-rotation generators. It takes
the minimum-norm solution, caps its step size and applies the rotations. This
keeps the response deterministic and preserves the orthonormal frame.

Automatic motion uses six plane rotations at different rates. Two couple the
screen to hidden directions. Four carry that movement through the remaining
coordinates. The rates do not share a short period.

Projection presets interpolate as orthonormal frames. The page constructs a
valid projection at every animation frame rather than moving the screen points
independently.

## Coxeter planes and original projections

The order-30 Coxeter element has eight primitive 30th-root eigenvalues. Four
complex-conjugate pairs give four mutually orthogonal real planes:

| Exponent pair | Rotation | Display |
|---|---:|---|
| 1 and 29 | 12° | Primary Petrie view |
| 7 and 23 | 84° | Specialist Coxeter plane |
| 11 and 19 | 132° | Specialist Coxeter plane |
| 13 and 17 | 156° | Specialist Coxeter plane |

Every plane places the 240 roots on eight rings. The Coxeter element advances
each of its eight 30-root orbits by the stated angle. The mathematical checker
verifies the four angles, eight radii and orthonormal frames numerically.

The four main buttons keep Petrie, Octagonal, Squares and Generic close at
hand. The specialist menu holds the other three Coxeter planes and five views
from Madore's explorer: Alternate, 10 × 24-gons, 12 × 20-gons, blurred
18-fold and blurred 14-fold. Samim's page embeds that explorer unchanged.

## Structural views

- **Root system** shows all 240 roots. The connection control chooses no
  edges, the 56 edges from the selected root or all 6,720 edges.
- **Neighbourhood** keeps the selected root, its 56 neighbours and its
  opposite root strong. The other roots remain as a faint reference.
- **Coxeter cycles** follows an order-30 Weyl element through its eight cycles.
  The Petrie projection makes those cycles eight regular 30-gons.
- **Simple roots** keeps the eight chosen simple roots strong and joins the
  pairs with inner product minus 1. These links form the E8 Dynkin diagram.
  A searched orthogonal projection shows this tree without crossing links.

The full edge view is intentionally optional. Its density shows the complete
graph, while the local and cycle views reveal more structure.

## Address state

The address hash stores the projection, structural view, connection mode,
colour mode, selected root, zoom, motion settings and chosen hidden direction.
A preset uses its short name. A free view stores the first two frame rows as
16 signed 16-bit values, encoded into a URL-safe string.

## Thumbnail, film and sharing

The builder page loads `assets/thumbs/e8.svg` as an image. Its 240 light roots
nearly fill a black circle and move through the Petrie, Octagonal and Squares
presets on a six-second loop. Sampled orthonormal frames keep each transition
close to a rigid 8D rotation. The SVG uses SMIL because scripts do not run
inside an image element. `assets/thumbs/e8-light.svg` preserves the earlier
light 12-second version. Rebuild both with `node tools/thumbnails/e8.js`.

`tools/e8-video/` renders a silent, captioned 30-second showcase film at
1080 × 1080 and 30 fps. It uses the real model and shows 8D motion, the
octagonal projection, one neighbourhood, all 6,720 edges, Coxeter cycles and
the Dynkin diagram. Its README gives the contact-sheet and film commands.

The canonical page and the `drbuild.uk/e8` shortcut publish
`social/e8.jpg` as a 1200 × 630 large sharing card. Run `node tools/e8/card.js`
after a deliberate change to the default projection or the card design.

## Sources and credit

David A. Madore's public-domain
[Weyl-group explorer](http://www.madore.org/~david/math/e8w.html) supplies the
coordinate convention, the order-30 Weyl word and its matching Petrie
projection. His
[continuous G2 rotation](http://www.madore.org/~david/math/e8rotate.html)
demonstrated a smooth E8 projection in 2012. The
[Samim page](https://samim.io/p/2025-01-27-the-e8-root-system/) embedded the
first explorer and prompted this version.

David A. Richter's
[triacontagonal coordinates](https://arxiv.org/abs/0704.3091) explain the
cyclic order-30 symmetry. Pierre-Philippe Dechant's
[Clifford treatment](https://arxiv.org/abs/1603.04805) describes the four
orthogonal invariant planes and the exponent angles 1, 7, 11 and 13.

## Checking a change

Run the mathematical checks:

```sh
node tools/e8/check.js
```

Serve the repository, then run the interaction and six-size browser checks:

```sh
python3 -m http.server 8000
CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node tools/e8/browser-check.js http://localhost:8000/app/e8/
CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node tools/screen-fit/check.js http://localhost:8000/app/e8/ '#stage'
```

Inspect all six screen-fit images. Also try mouse, keyboard and touch input on
real devices. Render `tools/e8-video/stills/sheet.jpg` after a change to the
film, model or palettes.
