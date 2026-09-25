# Aperiodic pairs gallery

## Summary

`aperiodic-pairs/` shows six tilings built from two tiles: Penrose kites and
darts, Penrose rhombs, Ammann A2, the trilobite and crab, the Taylor–Socolar
hexagon and a two-shape Spectre tiling. Every picture is computed from the
published definition; none is copied from a paper. Each canvas pans and
zooms. Four patches are generated in the browser on load. The other two are
precomputed into `aperiodic-pairs/data.js`, because one needs exact
arithmetic and the other a SAT solver.

## How each tiling is made

| Tiling | Method | Check |
|---|---|---|
| Kites and darts | Seven rounds of Robinson-triangle subdivision from a sun of ten half-kites. The apex of each half-tile is its second vertex; halves pair across the edge opposite the first vertex, so that edge is not stroked | Every half-tile away from the rim pairs with exactly one partner into a true kite or dart |
| Rhombs | The same method from a wheel of ten half-rhombs, with the apex first and halves paired across the far edge | Thick : thin halves come out 1,440 : 890 at six rounds, a ratio of φ |
| Ammann A2 | The big tile has sides 1, Ψ, Ψ², Ψ⁵, Ψ⁴, Ψ³ with Ψ = 1/√φ. A big tile splits into a big tile (turned a quarter, scaled by Ψ) and a small one (mirrored, scaled by Ψ²); a small tile becomes a big one | 200,000 random points in the parent each fall in exactly one child, and the areas agree |
| Trilobite and crab | The two tiles are drawn in the square-grid encoding of Goodman-Strauss's 2016 proof. The patch is the chair tiling behind his 1999 trilobite and cross, from five rounds of the rep-4 chair dissection | The chair's dissection is the only rep-4 dissection of the L-triomino |
| Taylor–Socolar | A SAT solver fills a hexagon of radius 12 with the tile and its mirror image in any of six turns, under rules R1 and R2 as read from the prototile of Socolar and Taylor's Fig. 2 | The same encoding admits no periodic tiling on any torus up to 16 × 32, and regions of radius 15 still solve, so the rules are neither too loose nor too tight |
| Two-shape Spectre | A level-4 Spectre supertile of 4,401 tiles, computed exactly in Q(ζ₁₂). The page gives the even-direction edges length a and the odd-direction edges length b | Tile areas sum to the patch area at stretch ratios from 0.1 to 10 in both directions, so no two tiles overlap there |

## Rebuilding the data

```sh
python3 tools/aperiodic-pairs/build_data.py   # needs cryptominisat5 on the PATH
python3 tools/aperiodic-pairs/card.py         # needs Pillow; draws social/aperiodic-pairs.jpg
```

`build_data.py` stops without writing if any small torus satisfies the
Taylor–Socolar rules, since that would mean the encoding is wrong. The share
card is drawn by `card.py`, not by `tools/social-cards/render.js`.

## What the pictures leave out

- Matching marks. Penrose's tiles, A2 and the trilobite and crab all need
  marks or bumps to force aperiodicity. The pictures show the tilings those
  marks allow, not the marks themselves.
- Trilobite placements. The patch shows the chair hierarchy the pair forces,
  not where each trilobite and crab sits in it.
- The Spectre-family status. Stretched Spectre tilings are tilings with two
  shapes. Nobody claims the two shapes force aperiodicity on their own, and
  the page says so.
