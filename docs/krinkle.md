# Krinkle tab: Modulo Krinkle tilings in the tiling explorer

## Summary

A fourth tab for the tiling explorer, after Hat, Spectre and Hat (extended),
showing Miki Imura's Modulo Krinkle tilings. One equilateral tile, set by
three whole numbers and an offset switch, fills the plane in a fan of
congruent wedges that swirl round a centre. Unlike the Hat and Spectre, the
same tile also tiles periodically, and the tab shows both arrangements.

This document is the build specification. It gives every formula the code
needs, so no one has to work them out from the papers again. It splits the
work into four phases, each with its own checks. The tab reuses the explorer's
engine, which first needs one careful change: it assumes 12 turns of 30° and
tiles with 14 edges, while Krinkle needs n turns and up to 62 edges.

Every picture is computed from the definitions below. The papers' figures are
used only to check the output, never copied.

## Implementation checklist

- [x] Phase 1: Krinkle maths in a worker, with Node checks (2026-10-11)
- [x] Phase 2: Engine change for n turns and longer outlines, with the three
      existing tabs unchanged (2026-10-11)
- [x] Phase 3: The Krinkle tab page (2026-10-11)
- [x] Phase 4: Construction playback and scripting hooks (2026-10-11)
- [ ] Later list reviewed, once the tab is live

## Sources

- M. Imura, *A family of non-periodic tilings, describable using elementary
  tools and exhibiting a new kind of structural regularity*,
  [arXiv:2506.07638](https://arxiv.org/abs/2506.07638), 2025. The construction
  and its proof, and the presets in Figures 1 and 5.
- M. Imura, *Spiral tilings derived from modular arithmetic*, Bridges 2026,
  pp. 77–84,
  [archive page](https://archive.bridgesmathart.org/2026/bridges2026-77.html).
  More presets (Figure 6), the spiral arm counts, the variants m, p and q,
  the (1, 1) rhombus case and edge modification.
- M. Fujiwara, *Farey structure in Modulo Krinkle tilings*,
  [arXiv:2609.01270](https://arxiv.org/abs/2609.01270), 2026. Mediant
  splicing; states that the placement rule for the variant tilings is so far
  given only in pictures.
- Imura's own generator, the
  [Modulo Krinkle Playground](https://mk.tiling.jp/playground). Useful for a
  visual comparison; no code is taken from it.

## The maths

### Parameters

| Name | Values | Meaning |
|---|---|---|
| m | 1 ≤ m ≤ k − 1 with gcd(m, k) = 1; or m = 1 when k = 1 | Rhythm of the zigzag |
| k | 1 to 30 | Length of the zigzag; the tile has 2k + 2 edges |
| t | 2 or more | Number of fan copies round the centre |
| offset | 0 or 1 | Selects the second family, with only 2-fold symmetry |

- n = t·k without offset, and n = 2(t·k − m) with offset.
- n is the number of directions, wedges and tile orientations. The tile's
  angles depend on n, so offset and t change the tile itself.
- Valid only when n ≥ 3. For k ≥ 2 this always holds. For k = 1 it needs
  t ≥ 3 in both cases.
- The page caps n at 240. That keeps the turn in 8 bits and the stroke cost
  bounded.
- The papers name a tiling by (m, k, n). The page shows that triple, and
  stores m, k, t and offset.

### Directions and the prototile

- v_d = (cos 2πd/n, sin 2πd/n), with d taken mod n. R_i turns the plane by
  2πi/n, so R_i v_d = v_{d+i}.
- s_j = j·m mod k, for j = 0 … k − 1. This is a permutation of 0 … k − 1
  with s_0 = 0. For k = 1, s = (0).
- Lower sequence ℓ = (s_0, s_1, …, s_{k−1}, k). Upper sequence
  u = (k, s_1, …, s_{k−1}, 0): ℓ with its first and last terms swapped.
- Lower corners: P_0 = 0, then P_{j+1} = P_j + v_{ℓ_j} for j = 0 … k.
  Upper corners: U_0 = 0, then U_{j+1} = U_j + v_{u_j}. Both paths end at
  Q = P_{k+1} = U_{k+1}.
- Outline, anticlockwise, 2k + 2 corners:
  C = (P_0, P_1, …, P_{k+1}, U_k, U_{k−1}, …, U_1).
  Edge e runs from C_e to C_{e+1}, wrapping at the end.
  - Edges e = 0 … k are the lower edges, walked forwards along hour ℓ_e.
  - Edges e = k + 1 … 2k + 1 are the upper edges, walked backwards. Edge e
    is upper edge 2k + 1 − e.
- When n = 2k, the corners P_0 and Q are straight, at 180°. Keep them as
  corners for the edge shapes. The engine's fill already drops straight
  corners before it cuts triangles.
- Reference point (the tile's centre for chunks): Q/2. It lies on the tile's
  axis of mirror symmetry, inside the tile.
- Every Krinkle tile is mirror-symmetric about the perpendicular bisector of
  P_0Q, because s_{k−j} = k − s_j. At a fixed n, m and k − m give the same
  tile. Nothing on the page depends on this. The puzzle uses it to skip a
  flip button.

### The wedge

- d_0 = Σ_{d=0}^{k−1} v_d and d_1 = v_k − v_0.
- In wedge-local coordinates, tile T_{r,c} is the prototile shifted by
  r·d_0 + c·d_1, for rows r ≥ 0 and columns 0 ≤ c ≤ r.
- The wedge's lower boundary repeats ℓ_0 … ℓ_{k−1}. Tile T_{r,0} contributes
  its edges e = 0 … k − 1.
- The upper boundary repeats u_0 … u_{k−1}. Tile T_{r,r} contributes its
  edges e = k + 2 … 2k + 1.
- The two boundaries run on average along d_0 and R_1 d_0, so the wedge
  opens at exactly 2π/n.

### Placing the wedges

There are n wedges, i = 0 … n − 1. Wedge i has rotation index i and apex A_i.
Tile (i, r, c) is

> X = A_i + R_i(prototile + r·d_0 + c·d_1), and its turn is i.

The fan uses w wedges: w = k without offset, and w = n/2 with offset. For
i < w the apex comes from the front-tracking rule of the 2025 paper, §5, in
closed form:

- m⁻¹ is the inverse of m mod k. For k = 1, set j*_i = 0.
- j*_i = (i · m⁻¹) mod k.
- win_i(x) = i + ((x − i) mod k), the value congruent to x in the window
  i … i + k − 1.
- A_i = Σ_{j=0}^{j*_i − 1} v_{win_i(s_j)}. The empty sum gives A_0 = 0.

The front before wedge i reads win_i(s_j) for j = 0, 1, 2, …. A_i walks it
from the origin to the first step at hour i. The papers draw the same front
in the window i + 1 … i + k, so the step that starts wedge i reads i + k
there, as in the sequences of check 2. No earlier step is congruent to i, so
both windows give the same apex.

The rest of the plane:

- **Without offset:** wedge i ≥ k is wedge (i mod k) turned about the origin
  by q = ⌊i/k⌋ copies. So A_i = R_{qk}(A_{i mod k}), with rotation index i.
  The result has t-fold rotational symmetry.
- **With offset:** wedge i + n/2 is wedge i given a half turn about
  M = v_0/2. So A_{i+n/2} = v_0 − A_i, with rotation index i + n/2. The
  result has 2-fold symmetry about M.

Bookkeeping fields for colours, outlines and playback:

- copy q = ⌊i/w⌋.
- Position in the fan j = i mod w.
- Centre of the tiling: the origin without offset, M with offset.

### Repeating arrangement

The same prototile at a·d_0 + b·d_1 for all integers a and b, all at turn 0.
The page centres it on tile (0, 0) and stores r = a and c = b for the
colours.

### Spiral arms (from the Bridges paper)

Without offset there are t·m⁻¹ anticlockwise arms and t·(k − m⁻¹)
clockwise arms. Here m⁻¹ is taken in 1 … k − 1. For example, (3, 7, 14)
has 10 anticlockwise and 4 clockwise. The page shows these two counts as a
read-out. It shows none with offset, where no formula is published, or when
k = 1.

### Edge shapes

Every edge is a step of one hour, and both tiles that share it hold it as
the same forward step from the same point. One tile holds it on its lower
path and the other on its upper path. Using the symmetry numbers in
`engine/edges.js`:

- **Single:** lower edges (e ≤ k) take symmetry 0 and upper edges take
  symmetry 3, a half turn. Any hump then fits, because no symmetry of the
  hump itself is needed.
- **Double:** every edge takes symmetry 0, since the S is unchanged by a half
  turn.
- **With offset, Single is not available.** The edge from 0 to v_0 is the
  base edge of tile (0, 0, 0) and of tile (n/2, 0, 0). Both tiles walk it as
  a lower edge, in opposite directions, so only a shape unchanged by a half
  turn fits there. The page forces Double, and says why in one line under
  the control. The Bridges paper limits edge modification to the case
  without offset for the same reason.
- The repeating arrangement takes Single or Double.

## Phase 1: the worker and its checks

Files:

- `app/tiles/krinkle/tiling.js` is the worker. It follows the pattern of
  the Hat and Spectre tiling files and answers the same messages.
- `tools/krinkle/check.js` holds the checks, run under Node.

The worker:

- **`init` options:** `{m, k, t, offset, arrangement: 'fan' | 'repeat'}`.
  It rejects invalid sets with a message naming the rule broken.
- **`ready` info:**
  - the outline corners;
  - n, w and the centre;
  - the edge count;
  - j*_i and A_i for every wedge, for the playback;
  - the arm counts;
  - the triple (m, k, n).
- **Chunk query:** the page asks for the tiles whose reference point lies
  in a square. For each wedge i:
  - map the square's corners into lattice coordinates by solving
    R_i⁻¹(p − A_i) − Q/2 = r·d_0 + c·d_1;
  - take the integer box that covers them, clipped to r ≥ 0 and 0 ≤ c ≤ r;
  - skip the wedge when that box is empty;
  - enumerate, then keep only the tiles whose centre is inside the square.

  The repeating arrangement does the same over all (a, b).
- **Per-tile fields:**
  - centre position, in float64 inside the worker;
  - turn i;
  - row r and column c;
  - copy q and fan position j;
  - two flags: on the lower wedge boundary (c = 0) and on the upper wedge
    boundary (c = r).
- **Chunk size:** chosen per tiling so that a chunk holds about 2,000
  tiles. It scales with the square root of the tile's area. The rhombus case
  (1, 1, 30) has tiny tiles, so this matters there.
- **Construction order:** without offset, wedges 0 … k − 1 build first,
  then the t − 1 copies. With offset, wedges 0 … n/2 − 1 build first, then
  the other half. Within a wedge, tiles build row by row.

Checks in `tools/krinkle/check.js`, run on the presets and on 200 random
valid parameter sets with k ≤ 20, t ≤ 4 and both offsets. Run it with
`node tools/krinkle/check.js`. The presets use a disc of 40 tile lengths and
100,000 points, and the random sets 12 tile lengths and 20,000 points. Each
set is checked in both arrangements:

1. **Prototile:** the outline does not cross itself, and its signed area is
   positive.
2. **Front sequences:** for (3, 7, 14), the fronts before wedges 1, 2 and 3
   read 7,3,6,2,5,8,4…, then 7,3,6,9,5,8,4…, then 7,10,6,9,5,8,4…, matching
   Bridges Figure 5.
3. **Edge pairing:** in a disc of radius 40 tile lengths, take every edge
   whose ends lie at least 2 tile lengths inside. Each must belong to
   exactly two tiles, which walk it in opposite directions in their
   anticlockwise outlines.
4. **Coverage:** of 100,000 random points in that inner disc, each lies in
   exactly one tile.
5. **Chunks:** the tiles from chunk queries over a 6 × 6 grid of chunks
   equal the tiles from direct enumeration, each exactly once.
6. **Edge rule:** under Single, every shared edge draws one curve from both
   sides. The one exception is the central edge with offset. It is the only
   failure, and Double removes it.
7. **Timing:** a chunk builds in under 30 ms on a laptop, at the default
   view, for every preset.

## Phase 2: the engine change

The engine lives in `engine/map.js` and `engine/tiling-core.js`. The Hat,
Spectre and Hat (extended) tabs must look and behave exactly as before. The
known assumptions to lift:

- **Turn:** the turn is stored in 4 bits as 30° steps (map.js line 834,
  `c.turn * Math.PI / 6`, and the vertex shader).
  - A tiling declares its turn count: 12 for Hat and Spectre, n for Krinkle.
  - The angle per turn becomes 2π divided by that count.
  - Krinkle needs 8 bits for the turn.
- **Corners and edges:** the shaders fix 14 corners (`u_corners[14]` and the
  loops at map.js lines 280, 359 and 384), and the levels and symmetry masks
  hold 14 edges.
  - Make the corner count a per-page compile-time constant: 14 for the
    current tabs, 64 for Krinkle.
  - Give each tiling an edge rule that returns each edge's symmetry, instead
    of a 28-bit mask. Krinkle uses the rule in "Edge shapes" above.
- **Tile record:** the 28-byte record stays as it is for the current tabs.
  For Krinkle:
  - words 0–1 hold the centre, relative to the chunk origin;
  - words 2–3 hold r and c as integers, since the R part is always zero;
  - word 4 holds the turn (8 bits) and the two boundary flags;
  - q and j are derived from the turn in the shader, with n and w as
    uniforms.
- **Colours:** `u_class[12]` becomes a palette texture of up to 256 entries,
  and Krinkle's class comes from a scheme function of (i, r, c, q).
- **Outlines:** the supertile outline levels come from the per-edge levels
  in the record. Krinkle instead derives its levels from the two flags and
  the edge ranges:
  - lower boundary edges e = 0 … k − 1, upper boundary edges
    e = k + 2 … 2k + 1, drawn at level 2;
  - edges of the first wedge in each copy (j = 0) on the lower boundary,
    drawn at level 4.
- **Rebuild:** the explorer can currently reshape tiles on the GPU without a
  rebuild. Krinkle's steppers need a true rebuild: `map.rebuild(options)`
  re-initialises the workers, flushes the chunk cache and keeps the view.
  Stepper clicks wait 250 ms before a rebuild, so a fast run of clicks
  builds once.
- **Grid tool:** hidden for Krinkle.
- **Collision limits:** the existing search, which raises the height until
  the outline crosses itself, runs on the Krinkle outline too.

Non-regression checks:

- Capture the Hat, Spectre and Hat (extended) pages at three fixed views
  each, before and after the change, in headless Chrome. The images must
  match within antialiasing noise.
- Run `node tools/hat-edges/verify-page.js`.
- Check that `tools/tiling-video/capture.js` still finds its two hooks.
- Measure the frame time at Krinkle's default view on a phone-sized
  viewport. The stroke shader loops over every edge, so 62 edges cost more
  than 14. If a frame takes over 16 ms, first test only the edges whose
  bounding box holds the pixel.

### As built

The engine change follows the plan above, with four departures:

- **Corners in a texture.** WebGL 2 promises only 224 uniform vectors to a
  fragment shader, and the current shader already uses about 185. So the
  corners go in a float texture, one row per hand, with each edge's code in
  the third channel: its symmetry for unmirrored tiles in bits 0–1, for
  mirrored tiles in bits 2–3, and in bit 4 whether it takes profile B. The
  palette is a second float texture of 256 entries.
- **Edge rule.** A page's profile gives `symAt(i, flip)` and `selAt(i)`.
  The 28-bit masks still work for up to 14 edges, so the current tabs did
  not change.
- **Seams on both sides.** Each tile strokes only its own half of a line.
  The seam between copies therefore takes level 4 on both sides: the lower
  boundary of fan position j = 0, and the upper boundary of j = w − 1.
- **Rebuild.** `map.rebuild(options, wait)` takes the 250 ms wait itself,
  so a run of clicks builds once. The old tiles stay on screen until the
  new workers are ready. An invalid set calls `cfg.onError(message)` once
  and leaves the map as it was.

For phase 3, the page sets:

- `record: 'krinkle'`, `maxCorners: 64`, `grid: false`, `options`, and
  `handler: KrinkleTiling.createHandler` for the fallback without workers;
- corners relative to the reference point Q/2, since the record holds the
  tile's centre;
- each colour grouping with its class `mode`: 0 for the wedge, 2 for
  alternate wedges, 3 for copies, 4 for rings, 5 for columns and 6 for one
  colour. `classes` may be a function of the grouping.

The worker's `info` gained `turns: n` and `start`, and its chunk bounds
gained two zero entries for the engine.

Results, 2026-10-11:

- Hat, Spectre and Hat (extended), three views each in headless Chrome
  (straight and curved edges, rotation, dark mode, supertiles, the grid):
  identical to the pixel before and after.
- `node tools/hat-edges/verify-page.js`: no mismatched edges.
- Both hooks of `tools/tiling-video/capture.js` are in place.
- Frame time at a 390 × 844 viewport, 3× pixels, on the Mac's GPU, at the
  default view of (3, 7, 22): 4.8 ms with straight edges and 9.1 ms with
  curves, against 2.6 ms and 7.3 ms for the Spectre. The worst case found,
  k = 30 with Jigsaw edges far out, took 25 ms, against 18 ms for the
  Spectre's own worst case. No change was needed.
- Collision limits: `tools/krinkle/check.js` gained check 8. The search
  runs on every preset in under 100 ms, for every edge shape.
- The Bridges Fig. 6i preset, (9, 10, 20) with Jigsaw edges, collides above
  a height of +0.079 under Single and fits down to −0.699. Its preset needs a
  negative height.

## Phase 3: the tab page

Files:

- `app/tiles/krinkle/index.html`;
- a fourth tab link on all four pages;
- updates to [tiling-explorer.md](tiling-explorer.md) and
  [site-layout.md](site-layout.md);
- a redirect page at `redirects/` for the short address drbuild.uk/krinkle.

Title: "Modulo Krinkle tiling – one tile, a fan of wedges".

Layout follows the explorer's four corners, most important at the top left.

**Top left: tiling type.** The title card and the four tabs: Hat, Spectre,
Hat (extended), Krinkle. If four tabs do not fit at 360 px, wrap them into
two rows of two.

**Top right: parameters** (the Options panel), in this order:

1. **Presets.** The first four are large buttons; the rest are smaller.
   Each shows its triple, with a mark for offset.

   | Preset (m, k, n) | t | Offset | Source |
   |---|---|---|---|
   | (3, 7, 22) — opens the page | 2 | yes | 2025 Fig. 1b |
   | (3, 7, 14) | 2 | no | 2025 Fig. 1a |
   | (5, 16, 54) | 2 | yes | 2025 Fig. 5f |
   | (1, 4, 20) | 5 | no | Bridges Fig. 6d |
   | (2, 5, 10) | 2 | no | 2025 Fig. 5a |
   | (1, 4, 14) | 2 | yes | 2025 Fig. 5b |
   | (3, 8, 24) | 3 | no | 2025 Fig. 5c |
   | (2, 9, 32) | 2 | yes | 2025 Fig. 5d |
   | (7, 17, 34) | 2 | no | 2025 Fig. 5e |
   | (3, 4, 28) | 7 | no | Bridges Fig. 6e |
   | (2, 9, 27) | 3 | no | Bridges Fig. 6f |
   | (9, 10, 20) with Jigsaw edges | 2 | no | Bridges Fig. 6i |
   | (1, 1, 30), rhombus fan | 16 | yes | Bridges Fig. 9a |

2. **Steppers.**
   - Each of m, k and t has − and + buttons, followed by an Offset switch.
   - The m stepper visits only valid values. When k changes, m moves to the
     nearest valid value, preferring the lower.
   - t stops where n would pass 240.
   - A dice button picks a random valid set with k ≤ 20 and t ≤ 4.
3. **Read-out.**
   - "n = 22: 22 directions, 22 wedges · tile with 16 edges".
   - The symmetry: t-fold, or 2-fold with offset.
   - The arm counts, where they apply.
4. **Tile figure.** The prototile, drawn by the same code and colour as the
   map, with each edge labelled by its hour when k ≤ 12. It redraws on each
   stepper click.
5. **Arrangement:** Fan or Repeating, opening on Fan.
6. **Edges:** the Spectre's controls (shape menu, Single or Double, Height
   and the shape settings), under the offset rule above.
7. **Wedge outlines:** a checkbox, like Supertiles.
8. **Playback** (phase 4).
9. **Reset options.**

**Bottom left: colours.** The explorer's colour panel, with these
groupings:

- **Fan, the default:** one colour per wedge, graded round the circle. For
  n classes, Pastel is OKLCH with lightness about 0.86, chroma about 0.09
  and hue stepping evenly. Tune it by eye against the Hat's Pastel. The
  other palettes are sampled the same way.
- **Alternate wedges:** i mod 2.
- **Copies:** q, giving t groups, or 2 with offset.
- **Rings:** ⌊r/2⌋ mod 2, giving bands round the centre.
- **Columns:** c mod 2.
- **One colour.**

Every orientation is equally common, since every wedge has the same
opening angle, so no grouping needs a rare-colour rule. The page opens in
Pastel, in light mode.

**Bottom right: the map buttons**, as on the other tabs.

**Address bar keys:**

- `mk=3,7`, `t=2` and `o=1` for the tile;
- `a=fan` or `a=rep` for the arrangement;
- `wo=1` for wedge outlines;
- `pb=` for the playback position;
- the edge keys are the same as on the Spectre page;
- `c=` and `v=` keep their current meanings.

The page opens with the centre in view, zoomed so that about 8 tile
lengths (|Q|) span the shorter side of the screen.

**About text.** Plain words, in the site's register:

- the tile, from two routes of unit steps;
- the zigzag, counting in jumps of m on a k-hour clock;
- the wedge;
- the fan, and why the staircases fit;
- closing the circle, with and without offset;
- a line that the same tile also tiles periodically (the Repeating
  arrangement), which makes this tiling non-periodic, where the Hat and
  Spectre are aperiodic;
- credit to Imura's two papers, with links, and to Fujiwara for the Farey
  structure.

There is no proof-status wording.

**Done when:**
- every preset matches its source figure by eye;
- `tools/screen-fit/check.js` passes at all six sizes;
- David has seen one screenshot per arrangement.

### As built

Phase 3 follows the plan above, with these departures and additions:

- **Address-bar key for the edge arrangement.** The plan gives `a=fan|rep`
  to the tiling arrangement and says the edge keys match the Spectre's, but
  the Spectre uses `a` for Single or Double. The page keeps `a` for the
  tiling and names the edge arrangement `ea=alt|S`. It still reads an
  old-style `a=alt` or `a=S` as the edge arrangement. `wo=1` is written only
  when wedge outlines are on, and a link with `mk` and no `wo` turns them off.
- **Tabs.** Four tabs of equal width do not fit the title card, so each tab
  takes the width of its label. They fit at 320 px, so the two-row wrap was
  not needed. The change is in `engine/map.css` and applies to all four pages.
- **Engine hooks.** `startScale` may be a function of `(info, W, H)`;
  `map.home(scale)`, `map.scheme(id)` and `map.outlines(on)` are new; the
  chunk margin grows to 1.25 times `info.circumradius` plus 2 for the Krinkle
  record, since a large tile far outside the view still reaches into it; a
  custom colour set whose group count changes with a rebuild is dropped; and
  extras in the address bar keep their commas, so `mk=3,7` reads plainly.
- **Lattice colouring.** Class mode 7 colours by (r mod 2, c mod 2), four
  colours. Repeating has one orientation, so every wedge colouring shows one
  colour there. The page switches to Lattice on Repeating, and back to
  Pastel on Fan, unless the colours were chosen to suit already.
- **Layout.** The Options card has two columns from 960 px wide: the tile on
  the left, and how it is drawn on the right. It stands left of the zoom
  buttons so they never cover it. The tile figure turns the tile so that its
  long axis, P_0 to Q, runs left to right, which gives the labels room.
- **Jigsaw preset.** (9, 10, 20) opens with Jigsaw edges, Single, at height
  −0.3 and zoom 22, because the opening zoom hides a small tab.
- **Presets** carry marks: `o` for offset and `j` for jigsaw edges. The four
  large buttons show t, and the tooltip names the source figure.
- **Playback** is left to phase 4. The panel has no playback section yet.

Results, 2026-10-11:

- `node tools/krinkle/check.js --quick --random 40`: all checks pass.
- `tools/screen-fit/check.js` on `#map`: all six sizes pass, no faults.
- All 13 presets build and draw without console errors; steppers, the dice,
  both arrangements, custom colours across a change of n, Reset options, a
  shared link, a malformed link and an in-place hash change all behave.
- The Hat, Spectre and Hat (extended) pages load without errors with the
  fourth tab, and `node tools/hat-edges/verify-page.js` finds no mismatched
  edges. Both hooks of `tools/tiling-video/capture.js` are in place.
- Not done: the by-eye comparison of each preset with its source figure,
  since the figures are not in the repo. The numeric check of the front
  sequences against Bridges Figure 5 passes.

## Phase 4: construction playback and scripting hooks

The playback is a clock τ running from 0 to w + 1. It only hides tiles, so
it costs a uniform update and a redraw, and the scrubber can follow the drag.

- **τ in [0, 1):** wedge 0 grows row by row, up to the rows needed to pass
  the farthest screen corner.
- **τ in [g, g + 1), for g = 1 … w − 1:** wedge g grows. Wedges before it
  stay whole.
- **τ in [w, w + 1]:** every wedge of every other copy grows together, row
  by row.
- **Controls:** Play/Pause, and a scrubber in the top-right panel. Playback
  is available in Fan only.
- **Timing:** a full play takes about 20 seconds whatever w is.
- **Optional:** a faint outline of the current front, the dashed line in
  Bridges Figure 4.

Scripting hooks for the video tools:

- The map object gains `setParams(options)` and `setPlayback(τ)`.
- The address bar accepts `pb=`.
- `tools/tiling-video/capture.js` can then film the Krinkle page on a
  scripted clock, as it films the Hat and Spectre.

### As built

Phase 4 follows the plan above, with these additions and departures:

- **The clock lives in the vertex shader.** A tile hides unless its wedge's
  stage has reached it. Stage g < w is wedge g, and every wedge of the other
  copies shares stage w. Within a stage, tile (r, c) comes in at
  `r + (c + 1) / (r + 1)` rows, so a row fills tile by tile rather than all
  at once. A stage that has finished shows every tile, whatever the row count.
- **Rows come from the view.** The worker's `info` gained `rowStep` (the
  least distance a row of a wedge lies from its apex per row, taken from the
  distance of the segment d_0 to d_0 + d_1 to the origin, less 0.1%) and
  `rowBase` (the circumradius, the centre's distance from the origin, the
  largest apex distance and |Q|/2). The engine takes the farthest screen
  corner D from the centre and shows `ceil((D + rowBase) / rowStep) + 1`
  rows, so a stage crosses the screen in the same time at any zoom. The
  front moves if the view moves during a play. A still or a scripted frame
  has a fixed view, so it is exact.
- **Controls.** A Construction section in the right column of the Options
  card, after Wedge outlines: a Play/Pause button, a scrubber and one line
  that names the stage ("Wedge 5 of 11", "The other copy of the fan",
  "The second half" with offset, or "Whole tiling"). The scrubber runs 0 to
  1000 and means 0 to w + 1. Play from the whole tiling starts again from
  nothing, and reaching the end returns to the whole tiling. A full play takes
  20 seconds, whatever w is.
- **Whole is the resting state.** `pb` is null when the whole tiling shows,
  and then the address bar carries no `pb`. A stepper, preset, dice or
  arrangement click, or Reset options, returns to it. A link with `pb` keeps
  its position through the rebuild that its tile asks for, and the engine
  takes the clock only once the new workers are ready, so a link never flashes
  the wrong stage over the old tiling.
- **Repeating.** The control is disabled with a one-line reason, and a `pb`
  with `a=rep` is ignored.
- **Hooks.** `map.setPlayback(tau)` and `map.playback()` set and read the
  clock, `map.busy()` says a rebuild is pending, and the page adds
  `map.setParams({m, k, t, offset, arrangement, pb})`, which refuses an
  invalid set with its message and returns `null` otherwise.
- **Film.** `node capture.js krinkle` writes `frames/krinkle/`: one frame per
  `pb`, 20 seconds of growth then 3 of the whole tiling at 30 fps. Its
  settings are `look.json` under `krinkle`. Frame 0 sits at `startPb` 0.3,
  since `pb = 0` is an empty map and the other captures read a small frame as
  a crash. The krinkle mode checks the page is alive instead. The loop
  video's timeline does not use it yet.
- **Not done.** The faint outline of the current front, marked optional in
  the plan.

Results, 2026-10-11, in headless Chrome with software rendering:

- Stills at `pb` = 0.5, 3.25, 3.5, 4.6, 10.5 and 11.5 on (3, 7, 22):
  - 0.5: wedge 0 half grown.
  - 3.25: wedges 0 to 2 whole, and wedge 3 with its first rows in and the
    row in progress filling tile by tile.
  - 3.5: wedge 3 half grown.
  - 4.6: wedges 0 to 3 whole and wedge 4 grown.
  - 10.5: wedges 0 to 9 whole and wedge 10 half grown.
  - 11.5: the first copy whole and the second half grown.
  At the opening zoom a half-grown wedge's front is past the screen edge,
  since the rows are counted to the farthest corner.
- Controls: a scrub to 400 reads "Wedge 5 of 11" and writes `pb=4.8`. That
  link reopens at the same place. Play moved the scrubber at 47.7 units a
  second against 50 ideal. Pause holds. A `t` click returns to the whole
  tiling. Repeating disables the control with its note. A link that changes
  the tile and sets `pb` together lands on the right stage of the new tiling.
  `pb=99`, `pb=-2` and `pb` with `a=rep` all show the whole tiling.
- Hooks: an invalid set is refused with the rule broken; a valid set builds
  (3, 8, 24) with `pb` intact; `busy()` is true until the workers are ready.
- No console errors in any of these runs.
- `node tools/krinkle/check.js --quick --random 40`: all checks pass, after
  the move of the row-distance loop out of `enumerate`.
- `node tools/hat-edges/verify-page.js`: no mismatched edges.
- `tools/screen-fit/check.js` on `#map` for all four pages: all six sizes
  pass.
- `node capture.js krinkle` took 0.125 s a frame, so a full film of 690
  frames takes about 90 seconds.

## Later

- **Variants m, p and q** (Bridges Table 1). Each prototile splits into two
  mirror-image parts, and the tiling uses both, so reflections are allowed.
  The placement of the parts inside a wedge is so far only drawn, in
  Bridges Figure 7. Fujiwara reports a closed-form rule, "a union of two
  triangular cones, one per part, cut out of translation lattices of the
  single parts", in a companion paper still to appear. Two routes:
  - wait for that paper;
  - derive the rule by search and check it against Figure 7 and the
    playground.
- **Squished wedges** (Bridges Figure 7c and 7f). For the variants, one
  column of tiles is removed from chosen wedges.
- **Colour by spiral arm.** It needs a rule that follows each arm across the
  wedge boundaries. The arm counts above give a check.
- **The Farey splice view** (Fujiwara). Show the two parent tiles beside the
  child for any m/k.
- **Voderberg and Versatiles.** Bridges places them at (m, k) = (1, 1), but
  only after edges are modified from a tiling by isosceles triangles. That
  makes a separate tab, not a preset.
- **SVG export** of the current view, for makers who laser-cut these
  tilings.
