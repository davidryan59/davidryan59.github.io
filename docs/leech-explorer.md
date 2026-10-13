# Leech Lattice Explorer

## Summary

In the 24-dimensional Leech lattice, every ball touches 196,560 others. This
explorer shows all of them. Each touching ball is a vector from the centre of
the central ball, and the page projects every vector onto the screen through
an orthonormal 24-dimensional frame, as the E8 explorer does with its 240
roots. John Leech described the lattice in 1967.

A prototype on 2026-10-13 settled the design. A view that mixes all 24
coordinates turns the 196,560 points into a smooth glow, whatever symmetry the
view has. Structure appears only where many vectors land on the same spot. One
octad's eight coordinates carry just 2,641 distinct patterns: the centre,
E8's 240 roots, a half-size copy of those roots, and a half-size copy of E8's
next 2,160 vectors. So every E8 view works inside the Leech lattice, with E8's
own symmetry. The explorer therefore has two windows. The 8-dimension window
rotates inside one octad and draws 2,641 crisp spots on Canvas 2D. The
24-dimension window rotates through everything and draws the full cloud with
WebGL 2.

This document is the build specification, in ten phases, each with its own
checks. It gives every definition and expected number, so no one needs to work
them out again. The checks reproduce the prototype's numbers exactly. Read
`app/e8/` and [e8-explorer.md](e8-explorer.md) first: this explorer adapts
their frame maths, interaction and checks, and loads `app/e8/model.js` for its
preset frames. Leave `app/e8/` unchanged.

## Implementation checklist

- [ ] Phase 1: Lattice model and Node checks
- [ ] Phase 2: Frame maths in 24 dimensions
- [ ] Phase 3: The sixteen scenes
- [ ] Phase 4: Page, layout and the 8-dimension window
- [ ] Phase 5: WebGL 2 cloud renderer
- [ ] Phase 6: The 24-dimension window, selection, tilt and tour
- [ ] Phase 7: Publish: credits, builder page, addresses and full checks
- [ ] Phase 8: Share card
- [ ] Phase 9: Builder thumbnail
- [ ] Phase 10: Silent film
- [ ] Tried on a real phone, an iPad and Safari

Phases 1 to 3 run under Node alone and can be built in one session. Phase 4
gives a working app with the seven 8-dimension scenes. Phases 5 and 6 add the
cloud and the other nine scenes.

## Sources

- J. Leech, *Notes on sphere packings*, Canadian Journal of Mathematics 19
  (1967), 251–267,
  [doi:10.4153/CJM-1967-017-0](https://doi.org/10.4153/CJM-1967-017-0). The
  lattice and its 196,560 shortest vectors.
- J. H. Conway and N. J. A. Sloane, *Sphere Packings, Lattices and Groups*,
  chapter 4, section 11. The coordinates used here: vectors scaled by √8 and
  built from the binary Golay code.
- The site's E8 explorer, `app/e8/` and [e8-explorer.md](e8-explorer.md): the
  preset frames, the rigid-rotation drag and the checks. Its sources credit
  David A. Madore, David A. Richter and Pierre-Philippe Dechant.

Every picture is computed from the definitions below. No figure is copied
from a paper.

## Terms

- **Ball, vector.** Each touching ball is the vector from the central ball's
  centre to its own. With unit balls, every vector has length 2.
- **Integer coordinates.** The code stores each vector as 24 integers x. The
  real vector is x / √8. An integer inner product is 8 times the real one.
- **Shape.** A is (±4, ±4, 0²²), 1,104 vectors. B is (±2⁸, 0¹⁶), 97,152
  vectors. C is (∓3, ±1²³), 98,304 vectors.
- **Layer.** The inner product with the selected ball sorts every ball into
  one of seven layers.
- **Octad.** A Golay codeword of weight 8, read as a set of 8 of the 24
  positions.
- **Restriction.** A vector's 8 coordinates at an octad's positions.
- **Spot, pile.** A spot is one screen position where one or more vectors
  land. Its pile is the set of vectors there.
- **Frame.** A 24 × 24 orthonormal matrix. Rows 0 and 1 are the screen axes.
  Rows 2 to 23 are hidden directions.
- **Window.** The frame rows that a drag or a drift may mix: rows 0–7 inside
  one octad (8 dimensions), or rows 0–23 (24 dimensions).
- **Scene.** A named frame with its settings and caption.

## What works and what does not

The prototype tested each idea below. The decisions follow from its numbers.

| Idea | Result | Decision |
|---|---|---|
| All 196,560 in a generic view | A smooth glow. Only 26 balls lie beyond radius 1.5 | One scene, as the contrast |
| The plane turned by the 23-cycle | Exact 46-fold symmetry, but 8,546 rings on about 3,900 radii merge into a glow. All 11 such planes give the same picture | Three scenes. Filters to the 1,104 shape-A balls, or to one ball's 4,600 neighbours, show clean circles |
| Elements of order 35 or 39 | Not tried. They have more orbits than order 23, so expect the same glow | Left out |
| E8 frames on one octad | At most 2,641 spots, with exact E8 symmetry | The opening view and the 8-dimension window |
| Planes through lattice vectors | 25 or 29 spots | The Hexagon and Coordinates scenes |
| Tilting 4° out of the octad | 70,081 spots in a woven texture | The Weave scene and the tilt slider |
| Every edge | 452 million | Never |
| Edges among one ball's 4,600 neighbours | 891 each, about 2 million in all | Never |
| E8 edges among one octad's 240 balls | 6,720 | Offered |
| Spokes from one ball to its 4,600 neighbours | 4,600 lines | Offered |
| Dragging any point of the full cloud | The grabbed point is invisible, and the cloud leaves no empty space to drag | A tap selects the nearest ball. The selected marker can be dragged |
| The second shell | 16,773,120 vectors, 403 MB as bytes | Never |
| Canvas 2D for the cloud | 196,560 arcs a frame is too slow | WebGL 2 for the cloud. Canvas 2D for at most 6,000 discs and for lines |
| Float render targets | They need extensions that some phones lack | RGBA8 counts. A generic view puts a few vectors on each device pixel |
| Grouping points into spots every frame | 30 ms a pass | Only when the picture rests |

Timings on an Apple M1 Max under Node 24:

- 12 ms to build the code and all vectors;
- 6 ms to project all vectors on the CPU;
- 30 ms to group them into spots;
- 5 ms to compute every ball's layer;
- 0.2 ms to project 4,600 spokes.

The budgets below allow for phones being 3 to 6 times slower.

## The maths

### Positions and the Golay code

Positions 0 to 22 are the elements of GF(23). Position 23 is ∞.

The generator polynomial is g(x) = x¹¹ + x¹⁰ + x⁶ + x⁵ + x⁴ + x² + 1, bit
mask `0xC75`. For each message m = 0 … 4095:

1. c(m) = the carry-less product of m and `0xC75`, which fills bits 0 to 22;
2. set bit 23 when bits 0 to 22 hold an odd number of ones.

Bit i is position i.

- c(1) = `0x800C75`, c(2) = `0x8018EA`, c(3) = `0x00149F`.
- Weights: 1 word of weight 0, 759 of 8, 2,576 of 12, 759 of 16, 1 of 24.
- The all-ones word is c(2787).
- The code is unchanged by i → i + 1 and by i → 2i (both mod 23, ∞ fixed),
  and by i → −1/i (0 and ∞ swap). These maps lie in M24.

The octads are the weight-8 words, in increasing m. Three of them matter:

- **O1** = c(1) = positions {0, 2, 4, 5, 6, 10, 11, 23};
- **O2** = the first octad disjoint from O1 = {1, 3, 7, 8, 12, 13, 15, 18};
- **O3** = the remaining 8 positions = {9, 14, 16, 17, 19, 20, 21, 22}, also an
  octad.

Together they form a trio. The explorer cycles through them: the next octad
after O1 is O2, after O2 is O3, and after O3 is O1.

### The 196,560 vectors, in canonical order

The order is part of the interface, because the address stores an index.

- **Indices 0 to 1,103, shape A.** For i = 0 … 23, then j = i + 1 … 23, then
  si in (+4, −4), then sj in (+4, −4): x_i = si, x_j = sj.
- **Indices 1,104 to 98,255, shape B.** For each octad in order, with
  positions p0 < … < p7: for s = 0 … 255 with an even number of bits set, in
  increasing s, x at p_k = −2 if bit k of s is set, else +2.
- **Indices 98,256 to 196,559, shape C.** For m = 0 … 4095, then
  p = 0 … 23: x_p = −3 and every other x_i = +1. Then negate every x_i whose
  bit i is set in c(m).

Checksums, FNV-1a 32-bit:

- over the 4,717,440 coordinate bytes, each taken as `x & 0xFF`: `0x8fd9cb85`;
- over the 196,560 shape bytes (0, 1, 2): `0xfacaff85`.

Landmarks:

| Index | Vector |
|---|---|
| 0 | (4, 4, 0²²) |
| 6 | (−4, 0, 4, 0²¹) |
| 1,104 | +2 at every position of O1 |
| 98,256 | (−3, 1²³) |
| 98,279 | (1²³, −3), fixed by i → i + 1 |
| 165,167 | (−1²³, 3), its opposite, also fixed |

A vector of integers lies in the scaled lattice when all its entries have
the same parity, and:

- if they are even: the positions with x ≡ 2 (mod 4) form a codeword, and the
  sum is 0 (mod 8);
- if they are odd: the positions with x ≡ 3 (mod 4) form a codeword, and the
  sum is 4 (mod 8).

Use a modulus that is never negative.

### Inner products and layers

For two of the 196,560 vectors, the integer inner product is one of these
seven values:

| Layer | Product | Angle | Balls | Meaning |
|---:|---:|---:|---:|---|
| 0 | 32 | 0° | 1 | the ball itself |
| 1 | 16 | 60° | 4,600 | touches it |
| 2 | 8 | 75.52° | 47,104 | |
| 3 | 0 | 90° | 93,150 | |
| 4 | −8 | 104.48° | 47,104 | |
| 5 | −16 | 120° | 4,600 | |
| 6 | −32 | 180° | 1 | the opposite ball |

The counts hold from every ball. Two balls at 60° touch each other.

The number of balls touching both v and w depends only on w's layer: 891 at
60°, 275 at 75.52°, 44 at 90°, 0 at 104.48° and 1 at 120°. At 120° the one
common neighbour is v + w.

### One octad: 2,641 spots

Group the 196,560 vectors by their restriction to O1. Every octad gives the
same table:

| Shell | Spots | Pile per spot | Restriction norm | Shape in each spot | In E8 terms |
|---|---:|---:|---:|---|---|
| Centre | 1 | 4,320 | 0 | 480 A and 3,840 B | no coordinates in the octad |
| Inner | 240 | 512 | 1 | B in 112 spots, C in 128 | E8's 240 roots at half size |
| Middle | 2,160 | 32 | 2 | A in 16, B in 1,120, C in 1,024 | E8's 2,160 vectors of norm 4, at half size |
| Outer | 240 | 1 | 4 | A in 112, B in 128 | E8's 240 roots |

The restriction norm is the real norm, Σ x_p² / 8 over the octad.

- The total is 4,320 + 240 × 512 + 2,160 × 32 + 240 = 196,560.
- Every spot holds balls of one shape only.
- The outer 240 are the balls whose non-zero coordinates all lie in the
  octad: a copy of E8, scaled by √2.
- Their 6,720 pairs at 60° are E8's edges, with 56 at every ball.
- Each inner spot is exactly half of an outer spot.

E8's Weyl group keeps this weighted set unchanged. Every E8 projection
therefore shows its E8 symmetry here: 30-fold in the four Coxeter planes,
8-fold in Octagonal and 4-fold in Squares.

To place an E8 frame on an octad O, with positions in increasing order, set
row[O[k]] = e8row[k] for k = 0 … 7 and 0 elsewhere. The E8 rows are rows 0 and
1 of `E8.makePresets()[name]` from `app/e8/model.js`.

### Tilt toward the next octad

The tilt target of a frame is its screen rows moved to the next octad: the
value at the current octad's k-th position goes to the next octad's k-th
position. These target rows are orthonormal and orthogonal to rows 0–7. At
tilt t:

- displayed row 0 = cos t · row 0 + sin t · target 0;
- displayed row 1 = cos t · row 1 + sin t · target 1.

At 90°, the same E8 view forms again, from different balls in the next
octad. From the Petrie view, a tilt of 4° gives 70,081 spots and a tilt of
45° gives 17,665.

### Two symmetric planes outside the octads

- **23-fold.** For i = 0 … 22, row0[i] = √(2/23) · cos(2πi/23) and
  row1[i] = √(2/23) · sin(2πi/23). Position 23 is 0 in both rows.
  - The map i → i + 1 turns this plane by 2π/23.
  - The two fixed balls, 98,279 and 165,167, project onto the centre.
  - Rows built from cos(2πik/23) and sin(2πik/23), for k = 2 … 11, give the
    same picture, because i → 2i maps one plane to another.
- **11-fold.** Take q_j = 2^j mod 23 for j = 0 … 10, that is
  (1, 2, 4, 8, 16, 9, 18, 13, 3, 6, 12).
  - Set row0[q_j] = row0[23 − q_j] = cos(2πj/11) / √11, and row1 the same
    with sin. Positions 0 and 23 are 0.
  - The map i → 2i turns this plane by 2π/11. With the central symmetry, the
    picture is 22-fold.

### Projection and scale

A vector x with integer coordinates appears on screen at:

- X = (row0 · x) / √8 and Y = (row1 · x) / √8;
- canvas position (cx + X · scale, cy − Y · scale).

The scale is 0.2 × min(stage width, stage height) × zoom CSS pixels per unit.
The dashed guide circle at radius 2 then spans 40% of the shorter side at zoom
1, as in E8.

Over all 196,560 vectors, the mean of X² + Y² is exactly 1/3 for every
frame. It makes a good check.

---

## Phase 1: lattice model and checks

Files:

- `app/leech/lattice.js`: the pure model. It runs in the browser and in
  Node, with the same wrapper as `app/e8/model.js`, and exports `Leech`.
- `tools/leech/check.js`: the checks. Run `node tools/leech/check.js`.

Later phases depend on these names:

```js
Leech.COUNT       // 196560
Leech.FIXED       // 98279
Leech.FIXED_NEG   // 165167
Leech.TRIO        // [[0,2,4,5,6,10,11,23], [1,3,7,8,12,13,15,18], [9,14,16,17,19,20,21,22]]
Leech.golay()     // Uint32Array(4096), index m
Leech.octads(code)// Uint32Array(759) of position masks, increasing m
Leech.build()     // { code, octads, coords: Int8Array(196560 * 24), shape: Uint8Array(196560) }
Leech.dot(coords, i, j)        // integer inner product
Leech.layer(product)           // 0..6, from the layer table
Leech.layers(coords, i)        // Uint8Array(196560): every ball's layer from ball i
Leech.neighbours(coords, i)    // Int32Array(4600), increasing index
Leech.indexOf(x)               // index of a 24-integer vector, or -1
Leech.inLattice(x)             // the parity, codeword and sum test
Leech.shells(coords, positions)// Uint8Array(196560): 0 centre, 1 inner, 2 middle, 3 outer
Leech.octadSpots(coords, shape, positions)
Leech.checksum(bytes)          // FNV-1a 32 as an 8-digit hex string
```

`indexOf` inverts the canonical order directly, with no hash map of all
vectors:

- **Shape A** (two entries ±4, i < j). The pair rank is
  i(47 − i)/2 + (j − i − 1). The index is 4 × rank + 2 × [x_i < 0] +
  [x_j < 0].
- **Shape B** (eight entries ±2). Look up the octad's rank in a map from
  mask to rank. Bit k of s is set when the k-th position holds −2. The index
  is 1,104 + 128 × octad rank + the number of even-weight bytes below s.
- **Shape C** (all entries odd, one of them ±3, at p). Bit i of the sign word
  is set when x_i = −1 for i ≠ p, or when x_p = +3. Look up the message m of
  that word in a map of 4,096 entries. The index is 98,256 + 24m + p.
- Rebuild the vector at the index found, and return −1 unless it equals x.

`octadSpots` returns `{ positions, count, spot, order, spots }`:

- `spot`: an Int32Array(196560), each ball's spot id.
- `order`: an Int32Array(196560), ball indices grouped by spot, in increasing
  index within each spot.
- `spots`: one entry per spot, `{ id, coords: Int8Array(8), shell, pile,
  shape, start, end }`, where `order.slice(start, end)` lists the pile.

Spot ids run by shell (centre, inner, middle, outer), then by key, where the
key is Σ_k (x at p_k + 4) · 9^(7 − k).

Budgets: `Leech.build()` under 30 ms, and `octadSpots` under 60 ms, on a
laptop.

Checks:

1. **Code.**
   - There are 4,096 distinct words, with the weights listed above.
   - c(1), c(2), c(3) and c(2787) are as given.
   - c(a) XOR c(b) = c(a XOR b) for 200,000 random pairs.
   - The code is unchanged by i → i + 1, i → 2i and i → −1/i.
2. **Octads.** There are 759. O1, O2 and O3 are as given, are disjoint, and
   together cover all 24 positions.
3. **Vectors.**
   - There are 196,560, split 1,104, 97,152 and 98,304 by shape.
   - Every integer norm is 32, and every vector is distinct.
   - The set is closed under negation.
   - Every vector passes `inLattice`.
   - Both checksums match, and so do all the landmarks.
4. **`indexOf`.** It returns i for every vector i. It returns −1 for
   (4, 4, 4, 0²¹), for (2, 2, 0²²), and for (1²³, 3), whose sign word is not a
   codeword.
5. **Layers.** From every 997th ball, and from balls 0, 1,104, 98,256 and
   98,279, the seven counts are 1, 4,600, 47,104, 93,150, 47,104, 4,600 and 1.
6. **Common neighbours.** Take ten random pairs in each layer from 1 to 5. The
   counts are 891, 275, 44, 0 and 1.
7. **Octad spots, for each of O1, O2 and O3.**
   - Every row of the shell table holds exactly.
   - The outer spots are the 240 balls that lie inside the octad.
   - Each inner spot is half an outer spot.
   - The outer balls have 6,720 pairs at 60°, with 56 at each ball.

## Phase 2: frame maths in 24 dimensions

Files: `app/leech/frame.js`, which exports `Frame` and uses the same wrapper.
Add its checks to `tools/leech/check.js` under a `Frames` heading.

Copy E8's conventions. A frame is an array of 24 `Float64Array(24)` rows.
`rotateRows(frame, a, b, angle)` sets row a to cos · a + sin · b and row b to
−sin · a + cos · b.

```js
Frame.N                                   // 24
Frame.dot(a, b)
Frame.orthonormalise(rows)                // Gram–Schmidt; drops rows shorter than 1e-9
Frame.complete(firstRows, candidates)     // 24 rows: firstRows, then candidates, then e0..e23
Frame.copy(frame)
Frame.rotateRows(frame, a, b, angle)
Frame.place(rows8, positions)             // [row0, row1]: E8 rows placed on an octad
Frame.octadFrame(row0, row1, positions)   // rows 0–7 span the octad, rows 8–23 the rest
Frame.tiltTarget(row0, row1, from, to)    // the screen rows moved from one octad to the next
Frame.tilted(frame, t, from, to)          // displayed [row0, row1] at tilt t
Frame.alignPlane(fromRows, toRows)        // toRows turned within their plane to match fromRows
Frame.interpolate(from, to, t)            // complete(lerp of all 24 rows), as E8.interpolateFrames
Frame.planeAngle(rowsA, rowsB)            // the larger principal angle between two screen planes
Frame.orbit(frame, depth, dx, dy)         // E8's orbitDrag: rows (0, depth) and (1, depth)
Frame.roll(frame, dx)                     // rows (0, 1) by dx * 0.007
Frame.pull(frame, x, dx, dy, scale, last) // E8's minimumRootRotation over rows 0..last
Frame.drift(frame, dt, speed, last)       // chained rotations over rows 0..last
Frame.encode(rows, positions)             // base64url of int16 values
Frame.decode(text, positions)             // [row0, row1], or null
```

Details:

- **`octadFrame`.** It completes [row0, row1] with these candidates, in
  order: the unit vectors at the octad's positions, then the unit vectors at
  the other 16 positions.
- **`alignPlane`.** It solves the 2 × 2 Procrustes problem in closed form.
  - Let A_ij = from_i · to_j.
  - The best rotation by θ, with θ = atan2(A01 − A10, A00 + A11), scores
    √((A00 + A11)² + (A01 − A10)²).
  - The best reflection, with θ = atan2(A01 + A10, A00 − A11), scores
    √((A00 − A11)² + (A01 + A10)²).
  - Return whichever scores higher. With c = cos θ and s = sin θ, the
    rotation gives (c · to0 + s · to1, −s · to0 + c · to1), and the
    reflection gives (c · to0 + s · to1, s · to0 − c · to1).
- **`pull`.** It is E8's `minimumRootRotation`, with `x` a real 24-vector.
  - `dx` and `dy` are canvas pixels with y pointing down, as in E8, so the
    target in the plane is (dx / scale, −dy / scale).
  - Only pairs (0, b) and (1, b) with b ≤ `last` move the picture.
  - Keep E8's regularisation, 0.0005, and its step cap, 0.16 radians.
  - Do nothing when |x| < 1e-9, as for the centre spot.
- **`drift` rates**, in radians per second at speed 1:
  - pairs (0, 2), (1, 3), (2, 4), (3, 5), (4, 6) and (5, 7) at 0.19, 0.153,
    0.083, 0.067, 0.047 and 0.037, as in E8;
  - with `last` = 23, also pairs (k, k + 2) for k = 6 … 21, at
    0.037 × 0.93^(k − 5).
- **`encode`.** Each value is stored as round(value × 32767) in an int16. The
  string is unpadded base64url.
  - With the 8 positions of an octad, it stores 16 values in 32 bytes.
  - With all 24 positions, it stores 48 values in 96 bytes.
- **`planeAngle`.** Let M = A Bᵀ, a 2 × 2 matrix. Its singular values are the
  cosines of the two principal angles. Return the arccosine of the smaller.

Checks:

1. **Orthonormality.** After 10,000 random steps mixing `rotateRows`,
   `orbit`, `roll`, `pull` and `drift`, the largest entry of F Fᵀ − I is below
   1e-9.
2. **Pull.**
   - Take 200 random frames and vectors. One pull of (3, −2) px at scale 200
     moves the screen position within 2% of that target.
   - With `last` = 7, rows 8 to 23 do not change.
3. **The 8-dimension window.** After 1,000 steps of orbit, pull and drift with
   `last` = 7, rows 0 to 7 have entries below 1e-12 outside the octad.
4. **Tilt.** `tilted(frame, π/2)` equals the tilt target. Phase 3's checks
   count its spots.
5. **Alignment.** Turn a plane by 37° within itself, or reflect it, then align
   it back. It matches within 1e-12.
6. **Interpolation.**
   - The endpoints are exact, and every step is orthonormal.
   - For 20 aligned random pairs, `planeAngle` to the target falls
     monotonically.
7. **Encoding.** A round trip errs by less than 1/32767 per value. A malformed
   string decodes to null.

## Phase 3: the sixteen scenes

Files: `app/leech/scenes.js`, which exports `LeechScenes`. Add its checks to
`tools/leech/check.js` under a `Scenes` heading.

`LeechScenes.build({ Leech, Frame, E8, data })` returns the scenes in table
order. Each scene has these fields:

- `id`, `label`, `sub`, `caption`, `featured`;
- `window` (8 or 24) and `octad` (0, 1 or 2 in `Leech.TRIO`);
- `rows` ([row0, row1]) and `tilt` (radians);
- `colour`: `shells`, `shapes`, `layers` or `mono`;
- `weights`: per class, from 0 to 1. Leave it out for all 1;
- `edges`: `none`, `e8` or `spokes`;
- `selected`: an index, or null for the default;
- `expect`: the numbers that the checks test.

Featured scenes get the large buttons, in this order: E8 inside Leech,
Squares, All 196,560, 23-fold rings, Hexagon, Seven layers.

Scenes 1 to 8 use the octad O1 and E8's frames, placed with `Frame.place`.

| # | id | Button: label · sub | Window | Screen rows | Settings |
|---:|---|---|---:|---|---|
| 1 | `petrie` | **E8 inside Leech** · 30-fold · 2,641 spots | 8 | E8 `coxeter` | shells. The opening view |
| 2 | `cox7` | Coxeter 84° · 30-fold | 8 | E8 `coxeter7` | shells |
| 3 | `cox11` | Coxeter 132° · 30-fold | 8 | E8 `coxeter11` | shells |
| 4 | `cox13` | Coxeter 156° · 30-fold | 8 | E8 `coxeter13` | shells |
| 5 | `octagonal` | Octagonal · 8-fold | 8 | E8 `octagonal` | shells |
| 6 | `squares` | **Squares** · 1,821 spots | 8 | E8 `squares` | shells |
| 7 | `e8edges` | E8 edges · 6,720 edges | 8 | E8 `coxeter` | shells; weights 0.25, 0.25, 0.25, 1; edges e8 |
| 8 | `weave` | Weave · tilt 4° | 8 | E8 `coxeter`, tilt 4° | shells |
| 9 | `cloud` | **All 196,560** · 24 dimensions | 24 | generic, below | shapes |
| 10 | `hexagon` | **Hexagon** · 25 spots | 24 | balls 0 and 6, orthonormalised | shapes |
| 11 | `coordinates` | Coordinates · 29 spots | 24 | e0 and e1 | shapes |
| 12 | `layers` | **Seven layers** · around one ball | 24 | ball 98,279 / √32, and the 23-fold row 0 | layers; selected 98,279 |
| 13 | `rings23` | **23-fold rings** · 1,104 balls | 24 | 23-fold | shapes; weights 1, 0, 0 |
| 14 | `cloud23` | 23-fold cloud · 46-fold | 24 | 23-fold | shapes |
| 15 | `sunburst` | Sunburst · 4,600 spokes | 24 | 23-fold | layers; selected 98,279; only layers 0 and 1 shown; edges spokes |
| 16 | `rosette11` | 11-fold rosette · 22-fold | 24 | 11-fold | shapes |

The generic rows come from `mulberry32(24)`. Take 24 draws minus 0.5 for row
0, then the next 24 for row 1, and orthonormalise:

```js
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

For the hexagon, the orthonormalised rows are (1, 1, 0, …) / √2 and
(−1, 1, 2, 0, …) / √6. This is the first three coordinates seen along the
diagonal (1, −1, 1).

Captions. Each has at most two sentences and goes in the results panel:

1. **petrie:** Seen through one octad, all 196,560 balls fall on 2,641 spots.
   The 240 gold dots are a copy of E8, one ball each.
2. **cox7:** The same octad in E8's second Coxeter plane. Its order-30
   symmetry turns each ring by 84°.
3. **cox11:** The same octad in E8's third Coxeter plane. Its order-30
   symmetry turns each ring by 132°.
4. **cox13:** The same octad in E8's fourth Coxeter plane. Its order-30
   symmetry turns each ring by 156°.
5. **octagonal:** E8's octagonal view of the same octad, with eight-fold
   symmetry.
6. **squares:** E8's squares view of the same octad. Some spots merge here, so
   1,821 remain.
7. **e8edges:** The 240 gold balls touch each other in 6,720 pairs. These are
   the edges of the E8 picture, inside the Leech lattice.
8. **weave:** The octad view tilted 4° toward the next octad. Each pile
   spreads into a small cloud, and 2,641 spots become 70,081.
9. **cloud:** A view that mixes all 24 coordinates. The 196,560 balls average
   into a smooth glow, as most views in high dimensions do.
10. **hexagon:** The first three coordinates, seen along the diagonal
    (1, −1, 1). All 196,560 balls land on 25 spots.
11. **coordinates:** The first two coordinates alone. All 196,560 balls land
    on 29 spots.
12. **layers:** The horizontal axis points at one ball. The others stand in
    seven layers by their angle from it.
13. **rings23:** The 1,104 balls of shape (±4, ±4, 0²²), in a plane that the
    23-cycle of M24 turns. They lie on 23 circles.
14. **cloud23:** The same plane with all 196,560 balls. The symmetry is exact,
    but 8,546 rings of 23 merge into a glow.
15. **sunburst:** The 23-cycle fixes the selected ball, so it hides behind
    the centre. Its 4,600 neighbours lie on 100 circles of 46.
16. **rosette11:** A plane turned by i → 2i, which cycles 22 coordinates in
    two loops of 11. The picture has 22-fold symmetry.

The legend under the Shells colours carries the pile sizes, so the opening
caption can stay short: "Inner: 240 spots × 512 balls. Middle: 2,160 × 32.
Centre: 4,320."

**Zoom** is computed when a scene opens, then cached:

- zoom = 1.9 / extent, clamped to 0.5–4. This puts the extent at 38% of the
  stage's shorter side.
- For a view drawn as spots or discs, the extent is the largest radius among
  the visible spots.
- For a cloud, it is the 99.9th percentile radius of the visible balls.

Checks:

- **Spots.** Count the distinct screen positions of the visible balls,
  rounded to 1e-6.
- **Symmetry.** Rotate every spot by 2π/n. It must land within 2e-6 of a spot
  with the same pile.

| Scene | Spots | Symmetry | Also |
|---|---:|---|---|
| petrie, cox7, cox11, cox13, e8edges | 2,641 | 30-fold, and not 60-fold | |
| octagonal | 2,641 | 8-fold, and not 16-fold | |
| squares | 1,821 | 4-fold | |
| weave | 70,081 | 2-fold | tilt 45° gives 17,665; tilt 90° gives 2,641 and 30-fold |
| cloud | 196,560 | 2-fold | the largest radius is 1.6532 |
| hexagon | 25 | 6-fold | the largest radius is 2 |
| coordinates | 29 | 4-fold | the largest radius is 2 |
| layers | 146,907 | 2-fold | X takes the values ±2, ±1, ±0.5 and 0, with counts 1, 4,600, 47,104 and 93,150 |
| rings23 | 1,058 | 23-fold and 46-fold | 23 radii: 22 hold 46 balls each; one holds 92 balls on 46 spots, since a nonzero last coordinate projects to 0; the largest radius is 0.8321 |
| cloud23 | 191,407 | 23-fold and 46-fold | exactly two balls at the centre, 98,279 and 165,167 |
| sunburst | 4,601 | 23-fold and 46-fold | the 4,600 neighbours on 100 radii of 46 balls, plus ball 98,279 at the centre; the largest radius is 1.0927 |
| rosette11 | 126,061 | 11-fold and 22-fold | |

For every scene, the mean of X² + Y² over all 196,560 balls is 1/3 within
1e-9.

## Phase 4: page, layout and the 8-dimension window

Files:

- `app/leech/index.html`, `style.css`, `viewer.js`, `overlay.js` and
  `credits.html` (a stub until Phase 7);
- `tools/leech/browser-check.js`.

The page loads, in order: `../../assets/theme.js`, `../e8/model.js`,
`lattice.js`, `frame.js`, `scenes.js`, `overlay.js` and `viewer.js`.

### Head and header

Copy `app/e8/index.html`, with these changes:

- the title "Leech Lattice Explorer";
- the canonical address `https://drbuild.uk/app/leech/`;
- an `og:` and `twitter:` description;
- the GoatCounter script;
- an inline SVG favicon: a dark disc, a ring of twelve small dots and a + at
  the centre.

Leave out `og:image` until Phase 8.

The header follows E8's top bar:

- "← David Ryan's builder page" at the top left;
- the title centred, with a tagline beneath it;
- the theme toggle and full screen at the right.

The tagline credits John Leech and the year. Until its wording is chosen,
use "196,560 balls around one · John Leech, 1967".

### Layout

The stage, `#stage`, fills the window below the header. On a wide screen it
shares the width with a results panel at the right. On a phone held upright,
the results panel sits below the stage and scrolls.

Four corner cards sit over the stage, following the tiling explorer's
pattern in `app/tiles/engine/map.css`:

- **Top left, Show.**
  - The Dimensions switch, [8 · one octad | 24 · all]. Phase 6 adds the 24
    option.
  - The six featured scenes as large buttons, each with a label and a
    sub-line.
  - The other scenes as small buttons after them.
- **Top right, Options.**
  - Motion: Play | Pause and Drift | Tour. Phase 6 adds Tour.
  - Speed.
  - Drag through dimension: 3–8 in the 8 window, 3–24 in the 24 window.
  - Tilt toward the next E8, and Next E8. Phase 6 adds both.
  - Edges: None | E8 | Spokes.
- **Bottom left, Look.**
  - Colour: Shells | Shapes | Layers | Mono.
  - The legend, with counts. A click on a legend row hides that class, and a
    second click shows it.
  - Dot size, 0.5–2 times.
  - Edge strength.
  - Brightness, shown only while the cloud draws (Phase 6).
- **Bottom right.** Zoom in, zoom out and reset.

The cards fold on a phone, as the tiling explorer's do. Until Phase 6, only
scenes 1 to 7 appear, and the Show card holds just their buttons.

The results panel holds:

- the scene's name and caption;
- the selected ball:
  - its index and shape;
  - its 24 coordinates, written "( … ) ÷ √8";
  - its octad positions (shape B) or its codeword (shape C);
- in the 8 window, the ball's spot:
  - its shell and pile;
  - a stepper, "ball 1 of 512" with ‹ and ›, which walks through the pile and
    makes each ball the selected one;
- the seven-layer table, with angles and counts;
- a short "How to explore";
- the sources and a link to `credits.html`.

### Drawing the 8-dimension window

`overlay.js` draws on a Canvas 2D context, scaled for the device pixel ratio
(capped at 2). It draws, in this order:

1. **Guides.** E8's dashed guide circle at radius 2, and the + at the centre
   with 6 px arms.
2. **Edges.**
   - E8: the 6,720 lines between outer spots, in E8's style, with the
     strength slider.
   - Spokes: one line from the selected ball's spot to each distinct spot
     that holds one of its 4,600 neighbours. A line's opacity grows with the
     number of neighbours in that spot.
3. **Spots.** 2,641 discs.
   - Radius r = R × (pile / 4320)^(1/3), with R = 0.012 × the stage's
     shorter side × dot size, and a floor of 1.6 px.
   - Draw the centre first, then the inner, middle and outer shells, so the E8
     balls stay on top.
   - Outer spots get a 1 px ring in the outline colour.
   - The selected spot comes last, with E8's halo.
   - Batch the discs into one path per colour, with `moveTo` and `arc` per
     disc, then one `fill`. With per-disc state changes, 2,641 discs are too
     slow on a phone.

Colours:

- **Shells and Shapes:** one colour per class.
- **Layers:** a spot takes the mean colour of its balls' layers, measured
  from the selected ball.
- **Mono:** one colour.
- A class weight below 1 dims that class. A weight of 0 hides it.

The palette reuses E8's colours:

| Class | Dark | Light |
|---|---|---|
| Shells: centre | `#8995a7` | `#76808d` |
| Shells: inner | `#a78bfa` | `#7447b8` |
| Shells: middle | `#64a9f3` | `#2563b8` |
| Shells: outer (E8) | `#f2cf55` | `#947000` |
| Shapes: A | `#f2cf55` | `#947000` |
| Shapes: B | `#64a9f3` | `#2563b8` |
| Shapes: C | `#ef83c2` | `#b52b75` |
| Layers: the ball | `#f0b96e` | `#9a6300` |
| Layers: 60° | `#58d4c2` | `#087f72` |
| Layers: 75.5° | `#83d58a` | `#387b42` |
| Layers: 90° | `#8995a7` | `#76808d` |
| Layers: 104.5° | `#b59be7` | `#7756b0` |
| Layers: 120° | `#f17f9f` | `#b93f60` |
| Layers: opposite | `#fb9b61` | `#bf5a24` |
| Mono | `#b9c5d4` | `#46566a` |

### Interaction in the 8-dimension window

Adapt `app/e8/viewer.js`.

- **Press on a spot.** The hit radius is the spot's radius plus 7 px for a
  mouse, or plus 13 px for touch. The press selects the spot's first ball.
  Dragging then pulls the spot with `Frame.pull` over rows 0–7. The centre
  spot can be selected but not pulled.
- **Press elsewhere.** Dragging orbits through the chosen hidden row.
- **Pointer types.**
  - Shift-drag or right-drag rolls the picture.
  - Two fingers pinch to zoom and turn.
  - The wheel zooms, from 0.5 to 4.
  - Hovering a spot shows a card with its shell, its pile and one ball's
    coordinates.
- **Keys.**
  - Space or P plays and pauses. R resets. F toggles full screen.
  - + and − zoom. The arrows rotate through the drag row.
  - 1 to 6 open the featured scenes.
  - [ and ] step through the selected spot's balls.
  - Phase 6 adds M, which switches dimensions, and T, which starts the tour.
- **Scenes.** A scene button runs a 900 ms smoothstep transition with
  `Frame.alignPlane` and `Frame.interpolate`. Within the 8 window, every step
  stays inside the octad, so the spots stay crisp throughout.
- **Motion.**
  - Drift starts 2.6 s after load, unless the visitor prefers reduced motion.
  - Drift pauses during a drag, as in E8.
- **Default selection.** On load, select the outer spot furthest from the
  centre, as E8 does.

### Address and check hooks

The address hash follows E8's pattern, and leaves out any default value:

| Key | Meaning |
|---|---|
| `v` | scene id |
| `p` | encoded rows, for a free view |
| `w` | window, 8 or 24 |
| `o` | octad, 0–2 |
| `t` | tilt in degrees |
| `c` | colour |
| `e` | edges |
| `h` | hidden-class bitmask |
| `r` | selected index |
| `z` | zoom |
| `pause` | `1` when paused |
| `speed` | motion speed |
| `d` | drag row |
| `s` | dot size |
| `m` | `tour` when the tour runs |

An invalid value falls back to the default.

For the checks, `window.__leechExplorer.snapshot()` returns `{ scene, window,
octad, tilt, selected, selectedScreen, orthogonalityError, renderer,
spotCount, visibleCount, spokeCount, colour, edges, zoom, playing, motion }`.

- `renderer` is `spots`, `discs` or `cloud`.
- The hook only reads state, as E8's does.

### Checks

Run them with `tools/leech/browser-check.js`, which copies E8's.

1. The page loads with no page errors, the canonical address and the title.
2. After Pause, the stage is at least 700 × 700 in a 1440 × 900 window.
3. The opening state is scene `petrie`, window 8, renderer `spots` and
   spotCount 2,641.
4. An orbit drag changes the frame, and orthogonalityError stays below 1e-9.
5. Dragging the selected outer spot by (60, 20) px moves it at least half
   that distance toward the pointer.
6. Each 8-window scene button writes `v=` to the address. A reload restores
   the scene, colour, edges, zoom and selection.
7. One screenshot in each theme goes to `tools/leech/renders/`.
8. Time a draw of the 8 window inside the page, over 120 frames of drift at
   1440 × 900. Report the average. Fail only above 16 ms, since a headless
   browser may draw in software.
9. `node tools/screen-fit/check.js http://localhost:8000/app/leech/ '#stage'`
   passes at all six sizes.

## Phase 5: WebGL 2 cloud renderer

Files:

- `app/leech/cloud.js`, which exports `LeechCloud`;
- `tools/leech/cloud-test.html`, a bare test page that is never linked.

Write it by hand, with no library, as `app/tiles/engine/map.js` does.

```js
var cloud = LeechCloud.create(canvas, { coords, shape, shells: [s0, s1, s2] });
cloud.supported       // false without WebGL 2; then nothing else is called
cloud.resize(cssWidth, cssHeight, dpr)
cloud.draw({
  rows,               // Float32Array(48): rows 0 and 1, already divided by √8
  centre, scale,      // CSS px, as in the overlay
  pointSize,          // CSS px
  mode,               // 0 shapes, 1 shells, 2 layers, 3 mono
  octad,              // 0..2, chooses the shell byte
  selected,           // Int8Array(24) of the selected ball, for layers; or null
  colours,            // Float32Array(24): eight RGB colours, 0..1
  weights,            // Float32Array(8): per-class visibility, 0..1
  background,         // [r, g, b], 0..1
  brightness,         // 0.25..4
  opacity             // 0..1, for crossfades
});
cloud.destroy()
```

### Vertex data

Each vector takes 28 bytes:

- 24 signed coordinates;
- its shape, as one byte;
- its shell in O1, O2 and O3, as one byte each.

The coordinates feed six `vec4` attributes (`gl.BYTE`, not normalised). The
four class bytes feed one `uvec4` attribute (`vertexAttribIPointer`,
`gl.UNSIGNED_BYTE`). The buffer is 5.5 MB.

### Vertex shader

- X and Y are each the sum of six `dot` calls with the row uniforms.
- The class depends on the mode:
  - shapes: the shape byte;
  - shells: the byte for `octad`;
  - layers: p, the sum of six `dot` calls with the selected ball, mapped 32 →
    0, 16 → 1, 8 → 2, 0 → 3, −8 → 4, −16 → 5, −32 → 6;
  - mono: 0.
- If the class's weight is 0, place the vertex outside clip space.
- Pass the class to the fragment shader as a flat varying.

### Pass 1: count

- Render into a framebuffer with two RGBA8 textures at device resolution,
  using `drawBuffers` for both attachments.
- Clear them to 0, and blend with `ONE, ONE`.
- The fragment adds 1/255 to its class's channel: classes 0–3 in the first
  texture and 4–7 in the second. Each channel then holds an exact count.
- At a point size of 2 device pixels or more, discard the fragments outside
  the disc.

### Pass 2: show

Draw one full-screen triangle to the canvas:

- n_k = round(255 × the texel for class k).
- n = Σ w_k n_k. If n = 0, show the background.
- The colour is Σ w_k n_k c_k / n.
- The brightness is b = clamp(log(1 + brightness · n) / log(1 + brightness ·
  nRef), 0, 1).
- nRef = max(2, 196,560 × 11 / (4π) / (scale × dpr)²). This is the peak
  count that a generic view puts on one device pixel.
- out = mix(background, colour, b × opacity).
- Above b = 0.85, lift toward white by up to 60% × opacity.

A channel saturates at 255 balls on one device pixel. That happens only where
balls pile up, and Phase 6 draws piles as spots.

### Robustness

- Call `preventDefault` on `webglcontextlost`, and rebuild everything on
  `webglcontextrestored`. While the context is lost, `draw` does nothing.
- Cap the device pixel ratio at 2.
- Use no float textures and no extensions.

### Checks

Run these on the test page, through a `--cloud` option of
`tools/leech/browser-check.js`:

1. `supported` is true in Chrome.
2. The generic frame draws a round glow centred on the stage.
   - The share of lit pixels within radius 0.4 is at least ten times the
     share beyond radius 1.5.
   - The centre of the lit pixels lies within 2% of the shorter side from the
     stage's centre.
3. In layers mode, with ball 98,279 selected and the `layers` rows, the pixel
   columns at X = −1, −0.5, 0, 0.5 and 1 carry the colours for layers 5, 4, 3,
   2 and 1.
4. A weight of 0 for shape B removes every blue pixel.
5. Time 300 frames of drift at 1440 × 900 with a device pixel ratio of 2. Use
   `EXT_disjoint_timer_query_webgl2` where it exists, and wall-clock time where
   it does not. Report the average without failing, since headless Chrome may
   render WebGL in software. In a normal Chrome window on a laptop, expect
   under 6 ms.
6. After `WEBGL_lose_context` loses and restores the context, the cloud draws
   again.

## Phase 6: the 24-dimension window, selection, tilt and tour

### Windows and renderers

- **The Dimensions switch.**
  - 8 to 24 keeps the frame.
  - 24 to 8 projects rows 0 and 1 onto the current octad and orthonormalises
    them. If either projected row is shorter than 0.3, it opens `petrie`
    instead.
- **Choosing the renderer, each frame.**
  1. In the 8 window at tilt 0, draw spots, as in Phase 4.
  2. Otherwise, if at most 6,000 balls are visible, draw discs. Each visible
     ball becomes an overlay disc of 2 px × dot size, projected on the CPU
     every frame. The `rings23` and `sunburst` scenes use this.
  3. Otherwise, draw the cloud from Phase 5, with the overlay on top for the
     guides, markers and spokes.
- **Crystallising at rest.** While the cloud draws and the frame has not
  changed for 200 ms:
  - Group the visible balls by screen position on the CPU, with numeric keys
    at 1e-6 units. This takes about 30 ms on a laptop.
  - If there are at most 4,000 groups, crossfade over 300 ms to spots. Size
    them as in Phase 4, with the scene's largest pile in place of 4,320.
  - Any frame change cancels a pending grouping and returns to the cloud at
    once.
  - Cache the groupings by scene id.
- **Without WebGL 2.** The 24 option and the cloud scenes show "Needs WebGL
  2" and stay disabled. The 8 window still works.

### Selection in the 24-dimension window

- **Selecting.** A click or tap without movement selects the nearest visible
  ball within 12 px for a mouse, or 20 px for touch. Use a CPU projection, and
  cache the last one.
- **Markers.** The selected ball shows as a ring with a halo, and its
  opposite as a small ring. Escape clears the selection.
- **Dragging.**
  - A press within the selected marker's hit radius pulls the marker, with
    `Frame.pull` over rows 0–23.
  - A press elsewhere orbits through the drag row, from 3 to 24, or rolls
    with Shift.
- **Spokes.** Lines join the selected ball to its 4,600 neighbours, at an
  opacity from 0.04 to 0.2 set by the strength slider. Cache the neighbours
  for each selection, and project them every frame.
- **Layers colour.** It measures angles from the selected ball, and it is
  disabled while no ball is selected.

### Tilt and Next E8

- The tilt slider runs from 0° to 90°, and is shown in the 8 window only.
  - It updates on every input, since only the frame changes.
  - Its ends read "this E8" and "next E8".
  - Above 0°, the cloud draws, and the spots return at rest.
- Next E8 animates the tilt from 0° to 90° over 4 s, with smoothstep.
  - At the end, the next octad becomes the current one, with the frame
    rebuilt by `Frame.octadFrame` at tilt 0.
  - The Shells colours then follow the new octad.
  - Its spots come from `octadSpots`, run on first use.
  - The selected ball stays selected. Its spot is looked up in the new
    grouping.

### Tour

Motion offers Drift and Tour. The tour visits these scenes in order, then
starts again:

1. petrie
2. cox7
3. octagonal
4. squares
5. e8edges
6. weave
7. cloud
8. hexagon
9. coordinates
10. layers
11. rings23
12. sunburst
13. rosette11
14. cloud23

- **Timing.** Each transition takes 3 s, with smoothstep and
  `Frame.alignPlane`. Each scene then dwells for 5 s.
- **Settings.**
  - The colour mode, edges and selection change at the midpoint of the
    transition, where the picture is most blurred.
  - Class weights fade linearly across the transition.
- **Interruptions.** A drag pauses the tour, and Play resumes it from the
  current scene.
- **Reduced motion.** A visitor who prefers reduced motion gets no automatic
  tour.

The address gains `w=24` and 24-position `p` values. The other keys follow
Phase 4.

### Checks

Extend `tools/leech/browser-check.js`:

1. **Crystallising.** In the 24 window, the renderer is `cloud` while it
   moves. At rest:
   - `hexagon` shows renderer `spots` with spotCount 25;
   - `coordinates` shows 29;
   - `petrie` in the 24 window shows 2,641.
2. **Selection.** With Edges set to Spokes, a tap near the centre of `cloud`
   changes `selected`, and `spokeCount` is 4,600.
3. **Tilt.** With the slider at 90°, the spot count at rest is 2,641.
4. **Next E8.** After 4.5 s, the octad is 1, the tilt is 0 and the spot count
   is 2,641.
5. **Tour.** A test hook, `window.__leechExplorer.advanceTour()`, steps the
   tour through every scene in order.
6. **Screenshots.**
   - Every scene writes a dark-theme screenshot to
     `tools/leech/renders/scenes/<id>.png`.
   - A four-column contact sheet goes to
     `tools/leech/renders/scenes-sheet.png`.
   - Inspect the sheet.
7. **Address.** A free 24-dimension view survives a reload.
8. **Screen fit.** All six sizes pass again.

## Phase 7: publish

- **`credits.html`.** The method and sources:
  - Leech's paper, with its DOI;
  - Conway and Sloane, chapter 4;
  - the Golay code as a cyclic code, with its generator polynomial;
  - the E8 explorer and its credits;
  - a short account of the prototype's finding about octads.

  Describe what a visitor sees and how it is built. Make no claims about
  proofs.
- **The builder page.**
  - Add the Leech Lattice Explorer under Apps & Websites, directly after the
    E8 explorer.
  - Give it the tagline, and a link to Leech's paper with `target="_blank"
    rel="noopener"`.
  - Show the Phase 9 thumbnail, or a still of the opening view until then.
- **The short address.** Add `redirects/leech.html` with `permalink:
  /leech/`, following `redirects/e8.html`.
- **The address check.** Add `/app/leech/` and `/leech` to
  `tools/check-addresses/addresses.json`.
- **Docs.**
  - Add the app to the app list and the address table in
    [site-layout.md](site-layout.md).
  - Add it to [inventory.md](inventory.md), and to the repo README if that
    lists apps.
- **Checks.** Run the Node checks, the browser check and the screen-fit check.
  After a push, run the address check.
- **Real devices.** Try a phone held both ways, an iPad and Safari on a Mac:
  drag, pinch, tap to select, the tour and full screen.
- **This spec.** Tick the checklist with dates, and add "As built" notes under
  each phase, as [krinkle.md](krinkle.md) does.

## Phase 8: share card

- **The card.** Write `tools/leech/card.js`, adapted from `tools/e8/card.js`.
  It renders `social/leech.jpg` from the real app.
  - The card is 1200 × 630, under 300 KB, in the light theme.
  - It shows the `petrie` scene with the E8 edges on.
  - It carries the title and the tagline.
  - It uses the saturated light-theme colours, so the card catches the eye.
- **Tags.** Add `og:image` with its width, height and alt, `twitter:card` set
  to `summary_large_image`, and `twitter:image:alt`.
  - They go in `app/leech/index.html` and `redirects/leech.html`.
  - The browser check then tests them, as E8's does.

## Phase 9: builder thumbnail

- **The tool.** Write `tools/thumbnails/leech.js`. It produces
  `assets/thumbs/leech.svg`, an animated SMIL image like `e8.svg`.
  - The image is a dark circle on a 6 s loop.
  - It moves through Petrie, Squares, Octagonal and back to Petrie, with true
    8-dimensional steps from `Frame.interpolate` inside the octad.
- **The budget is 300 KB.**
  - At E8's rate of about 1 KB per moving dot, the 2,641 spots cannot all
    move. Keyframe the 240 outer spots.
  - The inner copy is the outer group scaled by one half in every frame. Draw
    it with `<use transform="scale(0.5)">` and a larger inherited
    `stroke-width`, so its dots stay bigger than the outer ones.
  - Show the 2,160 middle spots as three still layers that crossfade at each
    preset, or thin them out.
- **Checks.** The file is at most 300 KB, it parses, and its first and last
  keyframes match.
- **Docs.** Add a row to `tools/thumbnails/README.md`.

## Phase 10: silent film

Start from `tools/krinkle-video/`: its README, storyboard, timeline, clock,
stage and render script. The film should have:

- the real app page, driven by a real Playwright mouse on a scripted clock;
- the light theme, at 1080 × 1080, or 1440 × 1080 if the results panel
  crowds the picture;
- smooth sine-shaped pointer moves and zooms;
- captions, with the address at the top right;
- a title card that credits John Leech, 1967;
- "Try it yourself at drbuild.uk/leech" as the last caption;
- no sound;
- a seamless loop:
  - the first frame shows the title;
  - something moves within 0.25 s;
  - the last 0.5 s is still.

The outputs are `tools/leech-video/renders/leech-v1.mp4`, with stills in
`renders/v1/`. Raise the version for each new cut, and keep the old ones.

Plan the film before any render, in this order:

1. Settle the open questions.
2. Write a script table with the seconds, the picture, a main caption of at
   most 7 words and a small line of at most 10 words. Add the total length
   and the loop join.
3. Take 10 to 25 numbered stills from the real app, with captions, on contact
   sheets.
4. Render once the script and stills are approved.

Suggested beats, about 30 s in all:

1. The title over E8 inside Leech.
2. A drift in 8 dimensions, with the spots moving crisply.
3. The E8 edges appear.
4. Next E8: the picture dissolves and forms again.
5. The switch to 24 dimensions shows the cloud.
6. A tap brings out 4,600 spokes.
7. Seven layers.
8. The hexagon crystallises.
9. The 23-fold rings.
10. The opening view returns, with the address.

## Later

These stay out of this version:

- motion trails, as E8 has;
- a 4-dimension window on one tetrad, with 193 spots;
- a scrubber between any two scenes;
- planes of elements of order 35 or 39;
- a 12-dimension window on a dodecad, with 43,545 spots and mostly glow;
- the second shell;
- one lattice explorer combining E8 and Leech.
