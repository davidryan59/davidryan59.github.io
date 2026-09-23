# Tiling demos: Hat, Spectre and Hat (extended)

## Summary

Map-style viewers for the aperiodic monotiles found in 2023: the Hat at
`demos/hat/` and the Spectre at `demos/spectre/`. A third page,
`demos/hat-extended/`, draws the Hat with curved edges. Curved edges force
the mirrored hats to become a second tile, as
[hat-edge-research.md](hat-edge-research.md) explains, so that page keeps
the Hat and Spectre pages one tile each. All three pan, zoom and turn like a
web map, build their tiles on demand so the plane has no edge, and share one
engine. Plain JavaScript and WebGL 2, no libraries, no build step.

## Files

| File | What it holds |
|---|---|
| `demos/engine/tiling-core.js` | Worker side, shared: prototypes, supertile boundary levels, the hierarchy walk, chunk packing, corner lookup, the message loop |
| `demos/engine/map.js` | Page side, shared: WebGL drawing, chunk cache and worker pool, pan, zoom and turn, colours and the key, the grid tool, the address bar |
| `demos/engine/map.css` | Shared styling, using the site's colour tokens |
| `demos/engine/edges.js` | Edge shapes, both arrangements, the symmetry each edge takes, collision limits |
| `demos/hat/tiling.js` | Hat metatile construction and two-part lift, run as a worker |
| `demos/hat/index.html` | Hat page: the a:b slider, colour presets, About text |
| `demos/spectre/tiling.js` | Spectre substitution rules, run as a worker |
| `demos/spectre/index.html` | Spectre page: controls, colour presets, About text |
| `demos/hat-extended/index.html` | Hat (extended) page: the a:b slider, curved edges with the two-tile rule, About text. It runs the Hat's worker |
| `tools/hat-edges/` | The research scripts behind the Hat (extended) page, run under Node and Python |

## How it works

- **Hierarchy.** Each tiling is one supertile of a high level: level 18 for
  the Spectre, Kaplan level 16 for the Hat. Prototypes are shared, so the
  whole plane is a small graph.
- **Chunks.** A worker walks the graph for one 128-unit square and skips any
  branch whose bounding circle misses it. Tiles belong to the chunk that
  holds their centre. The page keeps up to 900 chunks and evicts the least
  recently drawn.
- **Tile data.** 28 bytes per tile. Two float pairs hold the position. Three
  words hold the turn (30° steps), the mirror flag, and a level for each of
  the 14 edges and 14 corners.
- **Two-part positions.** A corner sits at `a*p + b*zeta*r`, where `a` and
  `b` are the edge lengths and `zeta` turns by 30°. The Hat page moves `a`
  and `b` along its slider, and the GPU reshapes every loaded tile. The
  Spectre stores its position in `p` and leaves `r` at zero.
- **Supertile outlines.** A supertile's boundary edges are the child edges
  that only one child has. Each tile edge carries the highest level whose
  boundary it lies on, capped at 5. The fragment shader draws thicker lines
  for higher levels, and draws discs at corners so thick lines meet cleanly.
- **Strokes.** Each tile strokes the inner half of its own edges and its
  neighbour strokes the other half. Curved edges use the distance to the edge
  profile, uploaded as up to 65 points. There can be two profiles, A and B,
  and a mask picks B for some edges: the Hat (extended) page gives b-edges
  their own height this way. Each tile takes whichever of two inks contrasts
  with it more, so outlines survive any key.
- **Edge symmetries.** Each edge places the profile after one of four
  symmetries: as it is, backwards, reflected in the edge's line, or a half
  turn. The shader gets them as masks of two bits per edge, one mask for
  unmirrored tiles and one for mirrored. The Spectre's Single half turns its
  odd edges. The Hat (extended) rule is in
  [hat-edge-research.md](hat-edge-research.md).
- **Hands.** A shape with `hands: 2` has a second outline for mirrored tiles.
  The page then keeps a mesh per hand, and the vertex shader sends each tile
  of the other hand off screen, so each mesh draws only its own tiles. The
  key draws each class from its own hand's outline.
- **Fill.** Each tile shape is cut into triangles once per shape. The outline
  is tidied first: repeated corners, where edges have zero length at the
  chevron and the comet, and straight corners are removed. A corner lying on
  the edge of a candidate triangle blocks it, because at the hat and the
  turtle many corners fall on one grid line. A looser test cut triangles
  outside the tile there, and the old version left holes at the endpoints.
- **Collisions.** Past the collision limit a tile's outline crosses itself.
  The limit search tests exactly that: as a height grows from zero, the
  first two curves to touch face each other across one tile, so they touch
  as that tile's outline crosses itself. With two hands, both outlines are
  tested.
  `faces()` in `map.js` splits the outline at the crossings and labels each
  piece with its winding number. Pieces with winding 1 or 2 fill normally.
  Pieces with winding -1 (inside out) draw as red stripes in a second pass.
  Summed over all tiles, the winding is exactly 1 at every point, so the
  stripes mark every overlap.
- **Grid.** One corner: unit triangular grids at 0° and 30° through it. Two
  corners: a triangular grid with them as neighbours. Three: a slanted grid.
  The tile shader puts a dot on every corner that lies on a shown grid.

## Options

- **Panels.** Colour lives in the bottom-left panel: the scheme menu, the
  dice, the theme toggle, the key and Reset colours. Shape, supertiles and
  grid live top right, with their own Reset options. Neither reset touches
  the theme, which the whole site shares, or the view, which the home
  button resets. About sits in the title card's top right corner, and the
  compass, zoom and turn buttons stack bottom right, as on a map.
- **Colours.** Each page lists presets under its groupings. The Spectre
  groups its 12 orientations by turn modulo 30°, 60°, 90°, 120°, 180° or
  360°. The Hat has 12 colours, 2 (by hand) or 1. It has no grouping by turn
  alone, since that would pair each hat with a mirrored hat through an
  arbitrary choice of mirror line. Custom colours show as "Custom N", where
  N is the number of groups.
- **Dice.** Fills the current grouping with random colours from one of
  five palettes, each with equal chance: any colour; the 8 corners of the
  RGB cube; black and white; 8 greys; the 27 colours with each channel at
  00, 80 or ff. A palette is dealt like a shuffled deck, so each colour
  appears once before any repeats.
- **Ink.** Tile edges and supertile lines use dark ink in light mode and
  light ink in dark mode. Each tile takes the other ink when that gives the
  higher contrast ratio (WCAG) against the tile's colour.
- **Spectre edges.** The bump shape first: Line (the default), Curve,
  Triangle, Trapezium or Jigsaw. Then Single (the default) or Double, then
  Height. Line hides those two, and they sit below the menu so the menu
  never moves. Height 0 is also a straight edge. Sine, Parabola, Sawtooth
  and Square were folded in on 2026-09-23, and `OLD` in `edges.js` maps
  their ids so old links and saved settings load.
- **Hat (extended) edges.** The Hat's tile shape slider, then the same edge
  controls as the Spectre, with two heights: one for a-edges and one for
  b-edges, since the two never meet. Each height slider shows its collision
  limit with the other height held. With Line, the default, the page looks
  the same as the Hat page.
- **Tabs.** Hat, Spectre and Hat (extended), joined and of equal width.
- **Sticky stops.** A slider near a stop snaps to it, within 4% of its
  range: each Height at 0, Peak position at 0, 0.5 and 1, Rising and Falling side
  at 0 and 0.5. The Hat slider snaps within 3° at Hat, Spectre and Turtle,
  and within 1.25° at the two ends. The Jigsaw neck runs from 0 to 1, but
  the shape keeps at least 2% of it, since a zero neck hangs the head from a
  single point and the fill cannot cut that into triangles.
- **Turning.** The turn buttons turn the view 5° a press, for a mouse with
  no twist gesture. Right-drag, Ctrl-drag, Shift and the arrow keys, and a
  two-finger touch twist also turn it.

## The Hat construction

`hat/tiling.js` follows Kaplan's hatviz metatiles H, T, P and F. One patch
rule was first written down wrongly, and a search settled it:

- Child 26 is `[16, 0, 'P', 2]`. Every alternative for this rule was tested,
  and only this one leaves no overlapping hats at levels 2 and 3.
- Child 20 keeps `[19, 2, 'H', 2]`, which the search confirmed. All 24
  variants of rules 19 and 20 that keep every hat at the right scale place
  child 20 in the same spot. Child 19 overlaps child 20 in the scratch patch,
  but no metatile uses child 19.

After the fix, sampling 230,400 points at levels 4 and 5 finds every point
covered exactly once. The ratio of hats to mirrored hats tends to φ⁴.

The two-part positions come from shared hat edges. Child 0 of each supertile
sits at zero, and each other child takes the offset that makes one of its
hats share an edge with an already placed hat. The search looks first where
two metatile outlines share an edge, then descends both hierarchies
together. At levels 7 and above, metatile outlines drift too far from their
hats for the first method alone. The reshaped tiling was sampled at 0°, 15°,
20°, 30°, 45°, 60°, 75° and 90° on the slider, with no gaps and no overlaps.

## Checking a change

- Serve the site with `python3 -m http.server` from the repo root and open
  `/demos/spectre/`, `/demos/hat/` and `/demos/hat-extended/`. Opened from
  disk, the pages build
  chunks on the main thread instead of in workers, which is slower but
  works.
- The workers run under Node: `require('./demos/hat/tiling.js').build()`
  returns the root and the chunk functions. The checks above were run this
  way, by decoding chunks and testing edge pairing and point coverage.
- After a change to `edges.js` or the Hat (extended) rule, run
  `node tools/hat-edges/verify-page.js`. It checks that every shared edge
  still carries one curve from both sides.

## Removed: colour by label

Until 2026-09-23 the Spectre page had a fourth colour scheme, "Colour by
label", later renamed "Colour by tile type". It was removed as too obscure for
visitors, and is kept here in case a mathematician asks for it.

- **What it showed.** Every Spectre carries one of the nine labels of the
  substitution rules: Γ, Δ, Θ, Λ, Ξ, Π, Σ, Φ and Ψ, with Γ split into Γ₁ and
  Γ₂, the two halves of a Mystic. A label decides which cluster of tiles the
  tile grows into at the next level. Colouring by label shows each level-1
  supertile as its recipe of labels.
- **How it worked.** The worker gave each label its own leaf prototype and
  packed the label index, 0 to 9, into 4 bits of the tile data. The page had
  a 10-colour palette on hues 20, 20, 70, 110, 150, 190, 230, 270, 310 and
  350 in OKLCH, with Γ₂ lighter than Γ₁, and a key with Greek captions.
- **To restore it.** See commit `15be1c7`, files `demos/spectre/tiling.js`
  and `demos/spectre/index.html`. The tile format now has only 3 spare bits
  after the mirror flag, so the label needs a fourth: widen the record, or
  take a bit from the corner levels. Add a class mode for labels in
  `map.js`, since colour classes are currently turns and mirror flags.

## Known limits

- A trackpad twist reaches the page only in Safari. Chrome and Firefox keep
  the gesture, so they turn the map with Ctrl-drag or Shift and the arrow
  keys. Touch screens turn with two fingers in any browser.
- WebGL 2 is required.
