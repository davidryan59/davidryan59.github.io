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

- [x] Phase 1: Lattice model and Node checks (2026-10-13)
- [x] Phase 2: Frame maths in 24 dimensions (2026-10-13)
- [x] Phase 3: The sixteen scenes (2026-10-13)
- [x] Phase 4: Page, layout and the 8-dimension window (2026-10-13)
- [x] Phase 5: WebGL 2 cloud renderer (2026-10-13)
- [x] Phase 6: The 24-dimension window, selection, tilt and tour (2026-10-13)
- [x] Phase 6b: Rotation scenes, raw points and scene controls (2026-10-14)
- [x] Phase 6c: 36-fold opening, Spin, pan and a clean screen (2026-10-15)
- [x] Phase 7: Publish: credits, builder page, addresses and full checks (2026-10-15, not yet pushed)
- [x] Phase 8: Share card (2026-10-15)
- [x] Phase 9: Builder thumbnail (2026-10-15)
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
- T. Breuer, GAP's character table library ctbllib 1.3.9, from the ATLAS of
  Finite Groups. [leech/co0-classes.md](leech/co0-classes.md) lists the 167
  conjugacy classes of Co0, the lattice's symmetry group, built from it.

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
| Rotations of order 35 to 84 | Tried 2026-10-14. Orders 52 to 84 glow. Middle orders give clean pictures | Eleven rotation scenes, Phase 6b |
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
- Every non-centre spot holds balls of one shape only. The centre mixes 480
  shape-A balls with 3,840 shape-B balls.
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
  shape, start, end }`, where `order.slice(start, end)` lists the pile. Shape
  is 0, 1 or 2, except for the mixed centre spot, where it is 255.

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
   - The centre uses shape sentinel 255 and contains exactly 480 A and 3,840 B.
   - The outer spots are the 240 balls that lie inside the octad.
   - Each inner spot is half an outer spot.
   - The outer balls have 6,720 pairs at 60°, with 56 at each ball.

**As built, 2026-10-13.** `lattice.js` generates the code and all 196,560
vectors in canonical order. The checker verifies every inverse index, lattice
test and negation, plus the layer and common-neighbour counts. On the build
machine, vector generation took 11.9 ms. The three octad groupings took 13.5,
8.3 and 14.6 ms, within the 30 ms and 60 ms guides.

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

**As built, 2026-10-13.** `frame.js` keeps typed 24-dimensional rows through
rotation, direct pulling, drift, tilt, alignment and interpolation. The Node
checker mixes 10,000 operations, tests 200 pulls and checks both 8-coordinate
and 24-coordinate address encodings.

## Phase 3: the sixteen scenes

Phase 6b changes this list. It removes three scenes and adds eleven.

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

**As built, 2026-10-13.** `scenes.js` defines all sixteen scenes in table
order. The checker reproduces every spot count, stated symmetry, radius,
layer column and tilt landmark. All sixteen projection means equal 1/3 within
the required tolerance.

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

**As built, 2026-10-13.** The page opens on the 2,641-spot Petrie view and
keeps its controls over a full-size stage. Canvas draws the exact spots,
edges, guides, selections and sparse scenes. The results panel shows the
selected vector, its octad or codeword, its pile and the seven layer counts.
Mouse, touch, wheel and keyboard input share the 24-dimensional frame. All
six screen sizes pass. The phone layouts start with their corner cards folded.

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

**As built, 2026-10-13.** `cloud.js` packs every vector into 28 bytes and
uses two RGBA8 count targets. It needs no extension or float texture. The
browser check finds the generic cloud centred, confirms that class filtering
removes its pixels and restores the renderer after a forced context loss. A
Three 1440 × 900 headless Chrome runs averaged 1.87 to 2.22 ms in the page's
draw loop.

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

**As built, 2026-10-13.** The viewer switches among exact spots, sparse
Canvas discs and the WebGL cloud from the visible count and current motion.
Structured 24-dimensional views crystallise after 200 ms, with a 300 ms
crossfade. Tour weights fade through each transition, and settings change at
its midpoint. Selection, 4,600 spokes, layer colours, 90° tilt, Next E8, the
fourteen-scene tour and free 24-dimensional addresses pass in Chrome. The
sixteen dark-theme scene
screenshots and their contact sheet are in `tools/leech/renders/` for local
review.

## Phase 6b: rotation scenes, raw points and scene controls

David reviewed the explorer on 2026-10-14 and asked for these changes before
Phase 7. The explorer gains eleven scenes from rotations of the lattice. It
loses three scenes that repeat a picture or confuse. The scene buttons fall
into four groups. Raw points become the default look, with the density glow
as an option. A scene change keeps the zoom and takes a time the viewer sets.
Build it in one session, with the Node checks first.

### Background

Co0 is the group of every rotation that maps the lattice to itself.
[leech/co0-classes.md](leech/co0-classes.md) lists its 167 conjugacy classes.
A rotation of order n turns some planes by 360°/n. Project the lattice onto
such a plane, and the picture has n-fold symmetry. The central symmetry
x → −x doubles an odd n.

A survey of all 167 classes found 444 fixed planes and 46 distinct pictures.
The planes of order 52, 56, 70, 78 and 84 put every ball on its own spot,
so they glow, as the 23-fold cloud does. Middle orders give clean pictures.
Three scenes already show such planes: the opening view, Hexagon (D4's
Coxeter plane) and the 23-fold scenes.

[leech/co0-views.json](leech/co0-views.json) holds the eleven chosen planes.
The group carries each plane to many copies with the same picture. The
search kept the copy nearest the opening view, so a scene change moves the
balls less. The RMS distance a ball moves from the opening view fell from
0.46–0.79 to 0.23–0.49. A ball sits 0.58 from the centre on average, so the
scenes are nearer, but not close. Four of the planes lie inside octad O1.
They are the Coxeter planes of E7, D8, E6 and D5, which are root systems
inside E8.

Coxeter 84°, 132° and 156° show the same 2,641 spots on the same 65 radii
as the opening view. E8's symmetry carries each of their planes onto the
opening plane, so the four scenes share one still picture, with the balls in
different places.

### Files

- `app/leech/scenes.js`, `viewer.js`, `cloud.js`, `overlay.js`,
  `index.html`, `style.css` and `credits.html`.
- `tools/leech/check.js` and `browser-check.js`.
- This document, for the "As built" paragraph. The checklist, the Phase 3
  note, the "What works" row and the "Later" list are already updated.

### Scenes

- **Remove** `cox11`, `cox13` and `sunburst`. Sunburst showed one ball's
  4,600 neighbours. The page never explained it, and nothing else looks
  like it.
- **Retired addresses.** `v=cox11` and `v=cox13` open `cox7`. `v=sunburst`
  opens `layers`.
- **Keep `cox7`** with the sub "same spots, new places" and this caption:
  "The same 2,641 spots as the opening view, from another of E8's Coxeter
  planes. Each ball sits somewhere else. Switch between the two and watch
  every ball move."
- **Rename** two buttons. `cloud23` becomes "46-fold · 191,407 spots".
  `rosette11` becomes "22-fold · 126,061 spots". Their ids, rows and
  captions stay.
- **Add** the eleven scenes below. Copy each scene's rows from
  `co0-views.json` into a `ROTATIONS` table in `scenes.js`, keyed by class,
  with every digit. The 8-window rows are zero outside `Leech.TRIO[0]`. The
  8-window scenes use octad 0 and shells colour, and the 24-window scenes
  use shapes colour. None is featured.

| id | Button: label · sub | Window | Class | Spots | Symmetry | Radii | Max radius |
|---|---|---:|---|---:|---:|---:|---:|
| `oct18` | E7 plane · 18-fold | 8 | 18D | 955 | 18 | 42 | 1.6881 |
| `oct14` | D8 plane · 14-fold | 8 | 14C | 1,331 | 14 | 65 | 1.6986 |
| `oct12` | E6 plane · 12-fold | 8 | 24D | 193 | 12 | 15 | 1.7761 |
| `oct8` | D5 plane · 8-fold | 8 | 16A | 193 | 8 | 20 | 1.8478 |
| `rot84` | 84-fold · 196,560 spots | 24 | 84A | 196,560 | 84 | 1,290 | 1.4637 |
| `rot66` | 66-fold · 172,657 spots | 24 | 33A | 172,657 | 66 | 1,366 | 1.5251 |
| `rot60` | 60-fold · 70,081 spots | 24 | 60C | 70,081 | 60 | 673 | 1.4534 |
| `rot42` | 42-fold · 25,957 spots | 24 | 21B | 25,957 | 42 | 336 | 1.4823 |
| `rot40` | 40-fold · 70,081 spots | 24 | 40A | 70,081 | 40 | 881 | 1.5120 |
| `rot36` | 36-fold · 47,953 spots | 24 | 36A | 47,953 | 36 | 703 | 1.4934 |
| `rot30` | 30-fold · 7,861 spots | 24 | 15D | 7,861 | 30 | 165 | 1.5210 |

Give each new scene `expect: { spots, symmetry, notSymmetry, radii,
maxRadius }`, with `notSymmetry` twice `symmetry`. The Phase 3 checker's
method, run on the stored rows on 2026-10-14, gave every number in the table.

Captions:

- `oct18`: "Inside one octad, a rotation of the lattice turns this plane by
  20°. It is E7's Coxeter plane: 955 spots on 42 circles."
- `oct14`: "Inside one octad, a rotation turns this plane by a fourteenth of
  a turn. It is D8's Coxeter plane: 1,331 spots on 65 circles."
- `oct12`: "Inside one octad, a rotation turns this plane by 30°. It is E6's
  Coxeter plane: 193 spots on 15 circles."
- `oct8`: "Inside one octad, a rotation turns this plane by 45°. It is D5's
  Coxeter plane: 193 spots on 20 circles."
- `rot84`: "The lattice's rotation of highest order, 84, turns this plane by
  an 84th of a turn. Every ball lands on its own spot, so the picture is a
  glow with exact 84-fold symmetry."
- `rot66`: "A rotation of order 33 turns this plane. With the central
  symmetry, the picture is 66-fold: 172,657 spots on 1,366 circles."
- `rot60`: "A rotation of order 60 turns this plane by 6°. 70,081 spots lie
  on 673 circles."
- `rot42`: "A rotation of order 21 turns this plane. With the central
  symmetry, the picture is 42-fold: 25,957 spots on 336 circles."
- `rot40`: "A rotation of order 40 turns this plane by 9°. 70,081 spots lie
  on 881 circles."
- `rot36`: "A rotation of order 36 turns this plane by 10°. 47,953 spots lie
  on 703 circles."
- `rot30`: "A rotation of order 15 turns this plane by 24°. With the central
  symmetry, the picture is 30-fold, like the opening view, but with 7,861
  spots on 165 circles."

### The grouped scene panel

Give each scene a `group`. `LeechScenes.build` returns the scenes in panel
order:

1. **E8 inside Leech · one octad:** `petrie`, `cox7`, `octagonal`,
   `squares`, `e8edges`, `weave`.
2. **Coxeter planes · one octad:** `oct18`, `oct14`, `oct12`, `oct8`.
3. **Rotations · all 24 dimensions:** `rot84`, `rot66`, `rot60`, `cloud23`,
   `rot42`, `rot40`, `rot36`, `rot30`, `rosette11`, `rings23`.
4. **Other views · all 24 dimensions:** `cloud`, `hexagon`, `coordinates`,
   `layers`.

- Each group gets a small heading across both button columns. The card body
  scrolls when the groups do not fit.
- The tour visits every scene in panel order.
- The six featured scenes and the keys 1 to 6 stay as they are.

### Raw points and density

- **The control.** Add a segmented control, "Points: Raw | Density", to the
  Look card. Raw is the default. Density adds `g=1` to the address.
- **Raw.**
  - Every spot is a dot of radius 2.5 px × dot size, whatever its pile.
    Discs stay at 2 px × dot size.
  - The cloud gives full colour to every pixel that holds at least one
    visible ball. Pass a `u_raw` uniform to the show pass, and set the
    brightness b to 1 with no white lift. Hide the Brightness slider.
- **Density.** This is today's look. Spot size grows with the pile, and
  cloud brightness grows with the count.
- **The marker.** Twelve scenes have more than 4,000 spots, so Density
  draws them as a glow: `weave`, `rot84`, `rot66`, `rot60`, `cloud23`,
  `rot42`, `rot40`, `rot36`, `rot30`, `rosette11`, `cloud` and `layers`.
  Their buttons show a small "◐" after the label. One line under the Points
  control explains it: "◐ marks scenes that Density shows as a glow."
- Crystallising at rest runs in both modes, and the status line still
  counts spots.

### Zoom across scene changes

- If the zoom differs from the current scene's zoom by more than 0.1%, the
  viewer has zoomed. A scene change then keeps that zoom.
- Otherwise the zoom eases to the new scene's zoom over the transition.
- Reset, the R key and the first load still set the scene's zoom.
- The view has no pan, so position needs no change.

### Transition time

- Rename "Speed" to "Drift speed". The control is unchanged, and it sets
  only the drift.
- Add a "Scene change" slider under it, with the steps 0, 0.25, 0.5, 1,
  1.5, 2, 3, 5 and 10 s. The default is 1 s, and 0 changes at once. The
  output shows the time, for example "1.5 s".
- The time applies to scene buttons, Reset and the tour. The tour rests 5 s
  after each change.
- A time other than 1 s adds `ct=<seconds>` to the address.
- Transitions still align the new plane to the current one with
  `Frame.alignPlane`, which keeps the motion as small as the planes allow.

### The dimensions control

The "8 · one octad | 24 · all" switch sits at the top of the Show card, but
it changes only how drift and drag move afterwards. Pressed while the view
is paused, it seems to do nothing. Every scene already sets its own window.

- Remove the switch from the Show card.
- Add it to the Options card under Drift and Tour, as "Drift and drag
  through: One octad | All 24". The behaviour stays as in Phase 6.
- One line under it explains it: "All 24 lets E8's spots dissolve into the
  glow."
- The M key still toggles it. Without WebGL 2, "All 24" is disabled.

### Text

- `index.html`, "How to explore": describe the four groups, the Points
  control and the Scene change slider. Remove "Switch to 24 dimensions".
- `credits.html`: add one paragraph. "Each rotation scene shows a plane that
  an element of Co0, the lattice's symmetry group, turns. The conjugacy
  classes come from the ATLAS of Finite Groups, through Thomas Breuer's GAP
  character table library."
- `scenes.js`: the header comment says "The 24 named views".

### Checks

Extend `tools/leech/check.js`:

1. There are 24 scenes, in panel order, with the groups above. The featured
   list is unchanged.
2. Each `ROTATIONS` row matches `docs/leech/co0-views.json` within 1e-15.
   Each pair of rows is orthonormal within 1e-12. The 8-window rows are
   exactly zero outside `Leech.TRIO[0]`.
3. The scene loop also checks `expect.radii` where it is set. Every new
   scene passes its spots, symmetry, missing double symmetry, radii, maximum
   radius and projection mean of 1/3.
4. Remove the Sunburst checks.

Extend `tools/leech/browser-check.js`:

1. **Points.** The snapshot gains `points`. The default is `raw`. Density
   sets `density`, and it survives a reload through `g=1`.
2. **Zoom.** From `petrie`, press zoom in twice, then click the Squares
   button. After the transition, the zoom is unchanged. Reset restores the
   scene's zoom.
3. **Transition time.** The snapshot gains `transitioning`. At 0 s, a click
   opens the scene at once. At 3 s, the transition is still running after
   1 s.
4. **Dimensions.** The Show card has no `[data-window]` control. The
   Options control switches the window, as Phase 6 describes.
5. **Retired addresses.** `#v=cox11` opens `cox7`, and `#v=sunburst` opens
   `layers`.
6. **Tour.** The tour visits all 24 scenes in panel order.
7. **Screenshots.** Write all 24 scenes in Raw to `scenes-sheet.png`, and
   again in Density to `scenes-density-sheet.png`. Inspect both.
8. **Screen fit.** All six sizes pass `tools/screen-fit/check.js`.

Update every check that names `cox11`, `cox13` or `sunburst`.

### This document

After the build, tick Phase 6b in the checklist and add an "As built"
paragraph here.

**As built, 2026-10-14.** The explorer has 24 scenes in four groups, including
eleven exact Co0 rotation planes. Raw points are the default, while Density
keeps the pile-sized spots and glow. Scene changes keep a user zoom and use a
0 to 10 second control. The movement dimensions now sit with Drift and Tour.
Retired scene addresses redirect to their replacements. Node, browser and all
six screen-fit checks pass, and both 24-scene contact sheets show complete
pictures.

**Fixes, 2026-10-14.** David's review removed `23-fold rings`, which looked
like the retired Sunburst. `v=rings23` now opens `cloud23`, which takes its
place as featured scene 4, so 23 scenes remain. Other fixes:

- A page address without `ct` now keeps the 1 s scene change. It used to
  read as 0 s.
- Zoom reaches 8 instead of 4.
- The rested-spot cache is keyed by scale and centre as well as scene. Before
  this fix, Hexagon and Coordinates kept their old spot positions when
  zoomed.
- A small dot replaces the cross at the centre. It has the gold of shape A
  and the size of a raw dot, since the centre is the zero vector.
- A new colour, Rings, colours each ball by its distance from the centre in
  the current plane, in eight bands of 0.25 from 0 to 2. The shader and the
  CPU use the same bands.
- A scene change keeps the colour. Only Seven layers, which needs Layers,
  and E8 edges, which needs shell weights, still set one.
- The page opens with no ball selected. A Clear button in the Selected ball
  panel does what Esc does.
- The ring around the opposite ball is gone. Canvas could not read the
  theme's `light-dark()` colours, so the selection ring, the guide circle and
  the centre dot drew in black. The overlay now resolves each colour through
  a hidden element.

Node, browser and screen-fit checks pass again.

**Changes, 2026-10-15.** David asked for a dotted opening view and slower
scene changes. They replace the defaults stated above.

- The page opens on `rot60`, paused, in Shapes colour. Drift dissolves any
  24-dimension view into the glow within about 2 s, so Play stays off until
  the visitor presses it. The address writes `play=1` while playing.
- Without WebGL 2, the page opens on `petrie` instead. Reset on a free view
  returns to the opening scene.
- A scene change takes 3 s by default. `ct` appears only for other times.
- Every scene button shows its spot count at the right of its sub-line,
  taken from `expect.spots`. A note at the top of the Show card says what the
  number counts.
- At rest, the status line counts spots even when the cloud draws them, for
  example "70,081 spots · 196,560 balls".
- The address omits `v` for the opening scene, `w` when it matches the
  scene's window, and `c` when it matches the scene's colour.
- The `cox7` and `rot30` captions name E8 inside Leech, where they said "the
  opening view".

---
## Phase 6c: 36-fold opening, Spin, pan and a clean screen

David reviewed the explorer again on 2026-10-15 and asked for these changes
before Phase 7, so the share card, thumbnail and film show them. The page
opens on the 36-fold view. A new Spin motion turns the picture in its own
plane, so every dot stays exact while the view moves. The viewer can pan when
zoomed, light up one circle of spots, and hide every control. Build it in one
session, in the order below, with the Node checks first.

### The 36-fold opening

- Set `DEFAULT_SCENE` to `rot36`. It still opens paused, in Shapes colour.
  Without WebGL 2, it still opens on `petrie`.
- The bare address now opens `rot36`, and the address omits `v` for it.
  Phase 7 is not yet live, so no old bare link needs a redirect.
- Phase 6b chose each rotation plane near the old opening view, `petrie`.
  Re-aim the search at `rot36`:
  - In `tools/leech/co0_views.py`, `choose` targets the `rot36` plane, and
    keeps the stored `rot36` rows unchanged.
  - Rename the JSON field `motion_from_opening` to `motion_from_rot36`, and
    update `about` and `motion` to name `rot36`.
  - Run `choose --write`, then copy the new rows into `ROTATIONS` in
    `scenes.js`.
  - Record the old and new RMS motion of each scene in the "As built"
    paragraph. A change that moves the balls further than before is
    allowed, since the four octad scenes must stay inside octad 0.
- The E8 scenes keep their frames, since E8's own presets set them.

### Show every preset

At laptop size (1,728 × 990), the Show card hides 7 of the 23 scene buttons
below its fold, from `rot36` to `layers`.

- Each group heading becomes a button that opens and closes its group, with
  a ▸ or ▾ before the label.
- On load, the group that holds the current scene opens. The other groups
  open too, as far as all of them fit without the card scrolling.
- A scene change from a key, the tour or the address opens that scene's
  group.
- At every screen-fit size, every group heading shows without scrolling.

### Spin and Step

- The Motion control becomes "Drift | Spin | Tour". The Speed slider
  applies to Drift and Spin, so rename "Drift speed" back to "Speed".
- **Spin** calls `Frame.roll` every frame. At 40% the picture makes one
  turn in 60 s, and speed scales the rate in proportion.
- Spin leaves the plane unchanged. The scene button stays lit, the caption
  stays true, and the status line keeps its spot count.
- Spin works in both windows and in every scene, including a free view.
- **Step** is a button beside Spin. It turns the picture by exactly
  360°/n, where n is the scene's symmetry, over the scene-change time.
  It shows only when the scene has a `symmetry`.
- Step needs no new data. Each rotation scene's plane is fixed by an
  element of Co0 that turns it by 360°/n. That element sends each ball to
  a ball whose spot is turned by 360°/n, so one roll draws exactly what the
  rotation does. Each ball keeps its colour as it moves.
- After a Step, the status line reads "Turned by 10°: every spot landed on
  a spot", with the scene's own angle.
- `m=spin` joins `m=tour` in the address, and `play=1` with it starts
  spinning. Drift is still the
  default motion.

### Keep the caption honest

- Once drift, a drag or a tilt moves the frame off the scene's plane, the
  scene is left. Its button loses the lit state and gains an outline.
- The panel title becomes "Drifting from 36-fold", or "Moved from 36-fold"
  after a drag. The caption becomes "A view between scenes. Pause, and the
  status line counts its spots."
- Spin, zoom and pan do not leave the scene.

### Pan when zoomed

The view has had no pan, so zoom showed only the centre. The rotation
scenes keep their separate dots on the outer circles.

- Shift with a drag pans with a mouse. A two-finger drag pans on touch,
  alongside the pinch zoom and roll. Shift with an arrow key pans by 8 px.
- Pan is an offset of the centre, in units of the scale. It stops when the
  picture's edge reaches the centre of the stage.
- A scene change keeps the pan when it keeps the zoom. Reset and R clear
  both.
- Pan adds `pan=<x>,<y>` to the address, to three decimal places. The
  address already uses `o` for the octad.

### Light up a circle

- With a mouse, hovering over a spot lights every spot on the same circle,
  within 1e-6 of its radius. The status line says "60 spots · 120 balls on
  this circle".
- Selecting a ball lights its circle in the same way. This is the route on
  touch.
- The highlight draws on the overlay. Spots on other circles dim to 40%.
- In the cloud renderer, read the circle from the rested-spot cache. While
  the view moves, no circle lights.

### Hide controls

- H hides the header, all the cards, the status line and the results
  panel. The stage fills the screen.
- A small "Show controls" button fades in at the top right when the pointer
  moves, and fades out after 2 s. H or the button brings the controls back.
- On touch, a "Hide controls" button sits in the Options card. A tap on the
  stage shows the "Show controls" button.
- With Tour and the 3 s scene change, this gives a slideshow for Phase 10.
- Hidden controls add `ui=0` to the address.

### Rings colour, set once

Today Rings colours each ball by its distance from the centre in the current
plane, on every frame. The colour then only repeats what the position shows.
Set it once instead, so the balls carry a picture's circles as they move.

- Choosing Rings colours each ball by its distance from the centre at that
  moment, in the same eight bands of 0.25. The balls keep that colour
  through drift, Spin, drags and scene changes.
- Choosing Rings again recolours from the current view.
- Store the band per ball in one `Uint8Array` of 196,560 entries. The cloud
  reads it as a vertex attribute in place of the live radius, and the spot
  renderer reads the same array.
- The legend gives each band's ball count, filled in when Rings is chosen.
- An address with `c=rings` sets the colours from the view it opens on.
- The opening view keeps Shapes colour.
- The two inner bands in the light theme are a muddy olive (`#8a6a00`,
  `#b25a00`). Replace them with brighter colours that keep 3:1 contrast on
  the light background, and check `colours-light.png` again.

### Checks

Extend `tools/leech/check.js`:

1. Each `ROTATIONS` row matches the new `co0-views.json` within 1e-15, and
   every rotation scene still passes its spots, symmetry, radii and maximum
   radius.
2. **Step.** For each scene with a `symmetry`, roll the frame by 360°/n.
   The set of spots, rounded to 1e-9, equals the set before the roll, and
   each spot keeps its pile.

Extend `tools/leech/browser-check.js`:

1. **Opening.** The bare address opens `rot36`, paused, in Shapes colour.
2. **Groups.** At laptop size, every group heading is in view, and a click
   opens and closes its group.
3. **Spin.** After 1 s of Spin, the snapshot's scene is still `rot36`, and
   the plane matches within 1e-9. After 1 s of Drift, the scene is `custom`
   and the title starts "Drifting from".
4. **Step.** After a Step on `rot36`, the frame equals the scene's frame
   rolled by 10°, within 1e-9.
5. **Pan.** At zoom 4, a Shift-drag moves the centre, and `pan` appears in the
   address. Reset clears it.
6. **Circle.** Selecting a ball in `rot36` lights a circle, and the status
   line gives its spot and ball counts.
7. **Hide.** H hides every control, and H brings them back.
8. **Rings.** Choose Rings on `rot36`, then change to `rot60`. Each ball
   keeps its band from `rot36`, and the legend counts sum to 196,560.
9. **Screen fit.** All six sizes pass, with the controls shown and hidden.

### This document

After the build, tick Phase 6c in the checklist and add an "As built"
paragraph here.

**As built, 2026-10-15.** The page opens paused on `rot36` in Shapes colour.
`choose` now aims at the stored `rot36` plane and leaves that plane alone.
Every other scene moves less from the opening view than its old plane did.
The table gives the RMS motion from `rot36`:

| Class | Scene | Old plane | New plane |
|---|---|---:|---:|
| 84A | `rot84` | 0.591 | 0.485 |
| 33A | `rot66` | 0.631 | 0.475 |
| 60C | `rot60` | 0.617 | 0.490 |
| 21B | `rot42` | 0.664 | 0.488 |
| 40A | `rot40` | 0.632 | 0.482 |
| 15D | `rot30` | 0.542 | 0.465 |
| 18D | `oct18` | 0.492 | 0.482 |
| 14C | `oct14` | 0.538 | 0.465 |
| 24D | `oct12` | 0.511 | 0.489 |
| 16A | `oct8` | 0.586 | 0.504 |

Other notes:

- A roll keeps the plane, so a right-drag, an Alt-drag or a pinch turn leaves
  the scene lit, as Spin does. Shift-drag now pans, so a roll moved off Shift.
- Choosing Drift, Spin or Tour also starts it playing.
- Reset returns to the scene a view drifted or moved from.
- A selected ball lights its circle only when the visitor chose it. The ball
  that Seven layers selects for itself lights nothing, so the layers stay
  bright.
- The hovered circle takes the status line first, then the Step message for
  5 s, then the selected ball's circle. A ring at the circle's radius marks it.
- The Rings legend uses two columns, and the Look card stops above the Show
  card. The light theme's two inner bands are now `#b47e00` and `#d26800`,
  3.2:1 and 3.3:1 on the background.
- Below 800 px of height, the scene buttons tighten and the note above them
  hides. A phone held sideways now gets the drop-down cards that an upright
  phone has, with three button columns in Show. Before this, its folded cards
  left empty boxes.
- The address is written again when a transition ends, so a Reset clears
  `pan` and `z`.

Node checks, the browser check and the screen-fit check pass at all six
sizes, with the controls shown and hidden.

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

**As built, 2026-10-15.** David chose the tagline "A 24D sphere packing
with 196,560 balls round one – John Leech, 1967". It heads the app, the
builder page entry and the share card. The builder page lists the explorer
after E8 under Apps & Websites, with the tagline's last words linked to
Leech's paper. `credits.html` now covers what a visitor sees, the Golay code
and its generator polynomial, the octad finding, the rotation scenes, the
sources and the build. `redirects/leech.html`, the address list, the site
layout, the inventory and the README carry the new app. The address check
waits for a push. Real phones, an iPad and Safari are still to try.

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

**As built, 2026-10-15.** `tools/leech/card.js` draws `social/leech.jpg`,
167 KB, from the real app with its controls hidden. It shows E8 inside Leech
with the E8 edges on, panned right of the title and tagline, in the light
theme. The app page and the short address carry the card tags, and the
browser check tests them.

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

**As built, 2026-10-15.** `tools/thumbnails/leech.js` writes
`assets/thumbs/leech.svg`, 143 KB. Each ring of dots is one path of
zero-length round-capped strokes, so the 240 outer spots cost one animated
path. The inner copy is a `<use>` of that path at half scale with a wider
stroke. The 2,160 middle spots are three still paths, one per preset, which
crossfade. The last change returns to the stored Petrie frame without
alignment, so the first and last keyframes match and the loop has no jump.
The script checks the spot counts, the half-size inner copy, the matching
keyframes and the budget.

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
- a 12-dimension window on a dodecad, with 43,545 spots and mostly glow;
- the second shell;
- one lattice explorer combining E8 and Leech.
