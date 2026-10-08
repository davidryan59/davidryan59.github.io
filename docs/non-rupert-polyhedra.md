# Nopert Polyhedra Explorer

## Summary

A solid is Rupert when a hole can be cut through it that a copy of the same solid passes through. The test reduces to shadows. The hole is the solid's shadow in one view. The copy passes when its shadow in another view, turned and slid in the plane, fits strictly inside that hole. A solid is non-Rupert when no pair of views works. “Nopert” means non-Rupert.

The app at `app/nonrup/`, served at `drbuild.uk/app/nonrup/` with the short addresses `drbuild.uk/nonrup` and `drbuild.uk/nopert`, lets a visitor run that test. They turn a solid and cut its shadow out of a plate as a hole. Then they turn a copy and push it through. The five Platonic solids, the buckyball and three cuboids have views that pass. The 90-vertex C15 Noperthedron of Steininger and Yurkevich, the 88-vertex C11 Undecanope and the 60-vertex rhombicosidodecahedron are the contrast. Hervay's public computer-assisted proof for the rhombicosidodecahedron awaits independent audit. The page calls the Undecanope non-Rupert and links its paper, Draft 1, whose status box says the proof is computer-assisted and not yet reviewed outside the project. David dropped the word "candidate" on 2026-10-06. The Undecanope's name joins *undecim*, Latin for eleven, to the Noperthedron's "nope". The page uses no external libraries.

## Implementation Checklist

- [x] Generate the C15 Noperthedron from its three published generators and their antipodes.
- [x] Generate the C11 Undecanope from four rotational orbits and their antipodes.
- [x] Generate the 60-vertex rhombicosidodecahedron from its standard golden-ratio coordinates.
- [x] Add the five Platonic solids, the buckyball and three cuboids, scaled to unit circumradius.
- [x] Recover each polygonal convex hull and its edges in the browser.
- [x] Compute the pass ratio, with the best twist and shift, for any pair of views.
- [x] Draw the plate, the hole, the copy and the red overlap in a 3D scene and a straight-on view.
- [x] Push the copy through, or stop it at its first contact with the rim.
- [x] Search pairs of views by a restarted hill-climb.
- [x] Store a passing pair of views for every solid except C15, C11 and the rhombicosidodecahedron.
- [x] Keep a dragged copy's twist near its last value, then ease it to the best twist on release.
- [x] Orbit and zoom the camera round the plate, with a reset.
- [x] Show the fixed solid as a glass ghost on the plate once the hole is cut.
- [x] Draw the builder page's animated thumbnail and the share card from the Undecanope.
- [x] Fit the page on the six standard screen sizes.

## How to use it

The page opens on the Undecanope, C11. The controls sit above the 3D view, in the order a visitor uses them.

1. Choose a solid from the row of buttons. C11, C15 and the rhombicosidodecahedron lead as large cards. The Platonic solids, the buckyball and the cuboids follow as smaller buttons. On a phone the row scrolls sideways.
2. Drag either view to turn the solid. Its shadow falls on the plate.
3. Press **Cut hole**. The shadow becomes a hole, and a copy of the solid appears in front of the plate.
4. Drag to turn the copy. The view through the hole shows the copy's shadow over the hole, red where it sticks out.
5. Press **Push**. A copy that fits slides through. A copy that does not stops where its cross-section first meets the rim, and that slice shows in red.

In the 3D view, dragging the solid turns it, and dragging anywhere else orbits the camera round the plate. Scroll, pinch or the plus and minus keys zoom. **Reset view** returns to the starting view. The cursor shows which drag a press will start: a hand over the solid, a move cross elsewhere. The view through the hole always turns the solid.

Once the hole is cut, the fixed solid stays on the plate as a glass ghost. Its outline, seen along the push, is the rim of the hole. This is Rupert's own picture: the copy passes along a tunnel through the solid. From an angle the rim and the ghost's outline part company, because the edges that cast the outline lie at different depths. The copy starts 2.15 units from the plate, so at rest it never meets the ghost.

A numbered hint beside the buttons names the current step, and the button for the next step is the bright one. **New hole** returns to turning the hole. **Passage** loads a stored passing pair of views; C15, C11 and the rhombicosidodecahedron have none. **Search** hill-climbs over pairs of views for ten seconds and shows the best pair found. The address keeps the solid, for example `#cube` or `#box-123`.

The header follows the site's other explorers: a link back to the builder page at top left, the title in the middle and the full-screen button at right.

## Geometry

[`models.js`](../app/nonrup/models.js) holds each solid's vertices or generators, colour and starting turn. It applies the cyclic rotation and central inversion to build every orbit vertex. The Noperthedron's generators are the ones published in [arXiv:2508.18475](https://arxiv.org/abs/2508.18475).

| Solid | Vertices | Edges | Faces | Centrally symmetric |
| --- | ---: | ---: | ---: | --- |
| Tetrahedron | 4 | 6 | 4 | no |
| Cube | 8 | 12 | 6 | yes |
| Octahedron | 6 | 12 | 8 | yes |
| Dodecahedron | 20 | 30 | 12 | yes |
| Icosahedron | 12 | 30 | 20 | yes |
| Buckyball (truncated icosahedron) | 60 | 90 | 32 | yes |
| Cuboids 1 × 1 × 2, 1 × 2 × 3, 1 × 3 × 3 | 8 | 12 | 6 | yes |
| C15 Noperthedron | 90 | 240 | 152 | yes |
| C11 Undecanope | 88 | 242 | 156 | yes |
| Rhombicosidodecahedron | 60 | 120 | 62 | yes |

The Platonic solids and the buckyball come from their standard coordinates, built from signs and cyclic shifts in `models.js`.

The page finds each supporting plane directly. SciPy's `ConvexHull` gives the same face counts for C15, C11 and the rhombicosidodecahedron.

## The pass ratio

[`shadow.js`](../app/nonrup/shadow.js) holds the fit. The plate lies in the plane z = 0, and the copy moves along the z axis. A shadow is the convex hull of the solid's vertices projected onto that plane.

The hole's edges give half-planes n<sub>i</sub> · x ≤ b<sub>i</sub>. Turn the copy's shadow Q by an angle θ, and let h<sub>i</sub>(θ) be its reach along n<sub>i</sub>. The pass ratio at θ is the largest s with a shift v that satisfies

s · h<sub>i</sub>(θ) + n<sub>i</sub> · v ≤ b<sub>i</sub> for every hole edge.

This is a linear programme in three variables. For a centrally symmetric solid both shadows are symmetric about the origin, so the best shift is zero and s is the smallest b<sub>i</sub> / h<sub>i</sub>. For the tetrahedron the app solves the programme at every meeting point of three constraints. The hole has at most four edges, so that is at most four points.

The app samples 120 twists, over half a turn for a symmetric solid and a full turn otherwise. It refines the three best peaks by golden-section search, then turns and slides the copy to the best fit. The visitor chooses only the two views.

A symmetric shadow often has two or more twists with almost equal ratios. During a drag, the best twist overall can then jump between them from one frame to the next. On the octahedron it jumped by 90° on most steps of a test drag. So while the visitor turns the copy, the app searches only within 0.04 radians of the copy's last twist, and the copy follows the pointer. When the visitor stops for 180 ms, the app finds the best twist overall and eases the copy round to it over 320 ms.

A ratio above 1 means the copy passes with room to spare. A ratio within 10⁻⁸ of 1 counts as a touch: the copy meets the rim and cannot pass. That margin sits far above rounding error, about 10⁻¹⁵, and far below the narrowest real passages found in the C11 search, which clear 1 by about 5 × 10⁻⁵. Within 0.001 of 1 the page shows seven decimals, so a narrow pass and a near miss look different. A copy in the same view as the hole always has ratio 1.

## Pushing the copy through

A copy that passes slides from in front of the plate to behind it. For any other copy the app slices the solid at the plate as it moves. The slice is the set of points where the copy's edges cross z = 0. It steps 400 depths and bisects to the first depth where a slice point reaches the rim. The copy stops there, and the slice shows in red in both views.

## Search

The search starts from two random views, chosen evenly over all rotations. It nudges the hole's view, the copy's view or both by a random small turn, and keeps a nudge that raises the ratio. The step grows after a success and shrinks after a failure. When the step falls below 0.0002 radians, it restarts from new random views. It uses 48 twist samples per pair to run faster.

From seeded runs of 6 to 8 seconds for each solid:

| Solid | Best pass ratio | Note |
| --- | ---: | --- |
| Tetrahedron | 1.014609 | Needs a shift |
| Cube | 1.060660 | 3√2/4 |
| Octahedron | 1.060660 | Equal to the cube |
| Dodecahedron | 1.010815 | |
| Icosahedron | 1.010815 | Equal to the dodecahedron |
| Buckyball | 1.001961 | The tightest stored passage |
| Cuboid 1 × 1 × 2 | 1.414212 | |
| Cuboid 1 × 2 × 3 | 1.581136 | |
| Cuboid 1 × 3 × 3 | 1.195705 | |
| C15 | 0.9999997 | The copy lined up with the hole |
| C11 Undecanope | 0.9999995 | The copy lined up with the hole |
| Rhombicosidodecahedron | 1.0000000 | The copy lined up with the hole |

These are the best ratios the search found in that time, not proven maxima.

[`tools/non-rupert/find-passages.js`](../tools/non-rupert/find-passages.js) runs this search for every solid without a rotational order, or for the solids named after the time. It prints the views as quaternions for the `passage` field in `models.js`.

## Controls

Drag either view to turn the solid that is in play: the hole's solid before **Cut hole**, the copy after it. The 3D view turns about the screen's axes, and the straight-on view about the plate's axes. The arrow keys do the same on a focused view. Before the first drag, the hole's solid spins slowly, unless the visitor prefers reduced motion.

## Thumbnail and share card

The builder page lists the explorer first under Apps & Websites. Its thumbnail is a canvas, `assets/nonrup-thumb.js`, that turns the Undecanope about its eleven-fold axis. [`tools/thumbnails/nonrup.js`](../tools/thumbnails/nonrup.js) writes that script with the solid's vertices and faces baked in, so the builder page never computes a hull. Rerun it if the Undecanope's generators change. The thumbnail stops when it is off screen, and holds still for a visitor who prefers reduced motion.

The share card, `social/nonrup.jpg`, comes from the real app. [`tools/non-rupert/card.js`](../tools/non-rupert/card.js) cuts the Undecanope's hole, pushes the copy until it jams, and captures the 3D view beside the title:

```sh
NODE_PATH=tools/tiling-video/node_modules node tools/non-rupert/card.js
```

## The paper

The explorer's builder-page entry links to the Undecanope paper, which sits
first under Pre-prints. Its page, `papers/undecanope/index.html`, carries
the status, the abstract and the list of drafts, as
[site-layout.md](site-layout.md#publishing-a-paper) describes. The paper's
source and build live in the author's research repository, and only the
built PDF comes here.

The paper's share card, `social/undecanope-paper.jpg`, shows the title
beside the first page of `papers/undecanope.pdf`. Redraw it after each new
draft. It needs Poppler's `pdftoppm`:

```sh
NODE_PATH=tools/tiling-video/node_modules node tools/papers/card.js undecanope
```

The Pre-prints thumbnail, `assets/thumbs/undecanope.svg`, is a still drawn by
[`tools/thumbnails/undecanope.js`](../tools/thumbnails/undecanope.js).

## Checks

Run the geometry and fit checks with:

```sh
node tools/non-rupert/test.js
```

They confirm the face counts and the outward faces. They check that a copy in the same view as its hole has ratio 1 for every solid. They confirm that every stored passage passes, with every slice clear of the rim, and that the cube's ratio is 3√2/4. They check that a jammed C15 copy touches the rim at its contact slice. A simulated drag on the cube, the octahedron and C15 checks that no step moves the copy by more than 0.06.

Run the screen check from a local server with:

```sh
node tools/screen-fit/check.js 'http://127.0.0.1:8765/app/nonrup/' .stage --controls '.actions button'
```
