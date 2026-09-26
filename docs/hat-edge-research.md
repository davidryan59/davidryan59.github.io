# Hat edge research: curved edges and reshaping

## Summary

The Spectre's curved edges work because of how its tiles meet. This
research asked two questions of the Hat, tested against the tiling this
site draws:

1. **Can the Hat take curved edges, as the Spectre does?** Not as one tile
   and its mirror image: no curve of any shape fits, and every edge must
   stay straight.
2. **Can the Hat reshape beyond the Tile(a, b) slider?** No. The a:b slider,
   with size, is the only way to move the hat's corners and keep the tiling.

The first answer has a twist. If the mirrored hats may be a second shape,
any curve works. That second shape is the mirror image of the curved hat
with every bump turned inside out. The Hat (extended) page, at
`app/tiles/hat-extended/`, draws it. The Hat and Spectre pages stay one tile
each.

## How a shared edge constrains a curve

Every hat has 14 edges, numbered as `HAT14` in `app/tiles/hat/tiling.js`: edge
*i* runs from corner *i* to corner *i* + 1. Edges 1, 2, 3, 4, 7, 8, 11 and
12 are a-edges; edges 0, 5, 6, 9, 10 and 13 are b-edges. The tiling is edge
to edge, so each shared edge is a whole edge of both tiles. An a-edge only
ever meets an a-edge.

Two hats of the same hand run along a shared edge in opposite directions.
A hat and a mirrored hat run along it the same way, because mirroring
reverses the order of the corners. So each shared edge ties the curve on
one edge to the curve on another through a symmetry of the edge:

| Neighbours | Symmetry between their curves |
|---|---|
| Same hand | A half turn about the edge's midpoint (nr) |
| Mixed hands | A reflection in the edge's line (n) |

Going round any loop of shared edges, a curve must come back to itself. So
it must be unchanged by the product of the loop's symmetries. If some loop
multiplies out to n, the curve must equal its own reflection in the edge's
line, and only a straight edge does.

## Result 1: one tile and its mirror image, no curves

These pairs of edges meet somewhere in the tiling:

| Edges | Same hand | Mixed hands |
|---|---|---|
| a-edges | 1–2, 1–4, 1–8, 1–12, 2–3, 2–7, 2–11, 3–12, 4–7, 4–11, 7–8, 7–12, 8–11 | 1–11, 2–12, 3–11, 4–12, 7–11, 8–12 |
| b-edges | 0–5, 0–9, 5–6, 5–10, 6–9, 6–13, 9–10, 10–13 | 0–6, 0–10, 5–13, 9–13 |

Both families hold a loop of three that multiplies out to n:

- a-edges: 1–2 (same hand), 2–12 (mixed), 12–1 (same hand): nr · n · nr = n.
- b-edges: 0–5 (same hand), 5–6 (same hand), 6–0 (mixed): nr · nr · n = n.

So no curve of any kind fits: not a symmetric bump, not an S, not a
jigsaw tab. The in/out marking that works on the Spectre fails here
because both loops have odd length.

## Result 2: two tiles, any curve

Mirrored hats never share an edge with each other. Each sits in a ring of
hats, and each of its edges always meets the same hat edge. With the
mirrored hat's curves free, every loop multiplies out to 1, so any curve
works, including lopsided ones. The rule:

- **Hat:** edges 2, 4, 5, 8, 9, 12 and 13 take their curve half turned;
  edges 0, 1, 3, 6, 7, 10 and 11 take it as it is.
- **Mirrored hat:** the same, then each curve reflected in its edge's line.
  This gives the mirror image of the curved hat with every bump turned
  inside out.

Consequences, all used on the Hat (extended) page:

- Single splits the hat's edges 7 and 7, where the Spectre splits odd and
  even.
- With Double, every edge in the tiling carries the same S. The mirrored
  hats keep the S instead of turning it into a Z.
- a-edges and b-edges never meet, so each family has its own height.

The page's rule was checked end to end. Curved outlines were built as the
page builds them and placed as the engine places them. The two curves
coincided, to within 3 × 10⁻¹⁴, on every one of 7,627 shared edges. The
check covered five shapes, both arrangements, unequal and negative heights,
and four points on the a:b slider. The exact-mirror rule, run as a control,
failed on all 2,058 edges that touch a mirrored hat.

Not checked: whether the curved pair can only tile in the hat pattern.
The page shows the hat pattern, so it makes no claim either way. Nor is it
known whether this two-tile result is new.

## Result 3: no other way to reshape

Every corner match in a patch of hats was linearised, with each hat's
shift and turn and the prototype's 13 free corners as unknowns. The
solutions form a space of exactly six dimensions, in patches of 169 and
1,156 hats. All six are known motions:

- shifting the whole tiling (2)
- turning it (1)
- turning the prototype while every hat turns back (1)
- size (1)
- the a:b slider (1)

The next eigenvalue is about 10¹¹ times larger, so the gap is clear. No
second shape slider is possible, at least to first order.

## Checks

- **Edge to edge:** in a level-5 patch (7,921 hats, 53,728 shared edges),
  no corner lies inside another hat's edge.
- **Directions:** every same-hand pair runs opposite ways along its shared
  edge, and every mixed pair runs the same way.
- **Control on the Spectre:** in 4,401 tiles, all 29,208 shared edges join
  an even edge to an odd one. That is why its Single arrangement works,
  and it confirms the method.

## Re-running

The scripts are in `tools/hat-edges/`. They build tilings with the explorer's
own workers, so they check the code the pages run.

- `node edge-pairs.js [level]`: edge pairs, loops and the two-tile rule,
  with the Spectre control.
- `node verify-page.js`: the page's rule end to end, with the exact-mirror
  control.
- `python3 rigidity.py [level]`: the reshaping count. Needs numpy and
  scipy.
