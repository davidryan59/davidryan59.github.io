# Unimodular lattices video

Renders two films about unimodular lattices, 30 and 60 seconds long. Both are
1080 × 1080, 60 fps and silent, with captions. They run from ℤⁿ through E₈,
the two 16-dimensional lattices, the 24 Niemeier lattices and the Leech
lattice, and end on 196,884 and the Monster group. No app is involved. Every
point set is computed from the mathematics, and the last frame of each film
flows into its first.

The 60-second film adds five beats: E₈ built from two halves, the 24 lattices
merging into one, the explosion in the count, Klein's j-function on the
hyperbolic disc, and the Monster fusing three pieces into one.
[storyboard.md](storyboard.md) lists its beats and captions.

## How it fits together

- `geometry.py` builds the point sets:
  - the 240 E₈ roots and the 480 D₁₆ roots, each projected onto its Coxeter
    plane, where the Coxeter element turns by 2π/30
  - the 196,560 minimal vectors of the Leech lattice, built from the cyclic
    Golay code
  - an order-12 symmetry of the Leech lattice: a Möbius map from PSL₂(23)
    with two 12-cycles, which the code checks against the Golay code
- `render.py` holds the 30-second film's timeline, captions and drawing. Each
  frame is a pure function of its time, so frames render in parallel.
- `render60.py` holds the 60-second film. It reuses the text, glow and
  geometry of `render.py`. It adds depth of field, motion trails, shockwave
  rings, rolling counters, a starfield and particle streams. The j-function
  disc reduces each pixel's τ to the fundamental domain before it sums the
  q-series, so every frame computes it exactly.

The Leech picture projects all 196,560 vectors onto a plane in the
e^{2πi/12} eigenspace of that symmetry, so it has exact 12-fold symmetry. As
the film runs, the plane turns within the eigenspace, and the picture changes
from a sparse quasicrystal to a dense mandala.

## Render

Run from the repo root. It needs Python 3 with NumPy, SciPy and Pillow,
ffmpeg, and the STIX Two Math font that macOS ships in
`/System/Library/Fonts/Supplemental/`.

| Output | Command | Time |
|---|---|---|
| The 30-second video | `python3 tools/lattices-video/render.py` | 80 s |
| The 60-second video | `python3 tools/lattices-video/render60.py` | 3 min |
| Stills at chosen seconds | `python3 tools/lattices-video/render60.py --stills 7,41.5` | 10 s |
| The five pictures for the tweet thread | `python3 tools/lattices-video/stills.py` | 5 s |
| A still every 2.5 s, on one sheet | `python3 tools/lattices-video/render60.py --sheet` | 10 s |

The output goes to `renders/`. A full render ends with a loop check: it
prints the largest difference between the first frame and the frame after
the last, which should be 0.

## Timeline of the 30-second film

| Time | Picture |
|---|---|
| 0–3.6 s | The integer grid ℤ², with one unit cell outlined |
| 3.6–4.8 s | 240 grid points fly onto the E₈ roots |
| 4.8–10 s | E₈ in its Coxeter plane, with the 6,720 edges. Then the roots are coloured by family: 112 integer roots and 128 half-integer roots |
| 10–14 s | E₈ ⊕ E₈ and D₁₆, side by side, with their shared shell counts |
| 14–17.6 s | The 24 Niemeier root systems. All but the Leech lattice fade |
| 17.5–25 s | The Leech lattice's 196,560 minimal vectors in the 12-fold projection |
| 21–25 s | 196,560 + 324 = 196,884, and the j-function |
| 25–29.4 s | Rings of 47, 59 and 71 points around 196,883 |
| 29.4–30 s | A crossfade back to the first frame |
