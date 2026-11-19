# Hyperbolic Models Explorer

## Summary

The hyperbolic plane has no flat map that keeps both angles and sizes true,
so mathematicians draw it in many models. This app shows one tiling in
fourteen of them, and lets a visitor drag the plane through each one. It
lives at `app/hyperbolic/`, served at `drbuild.uk/app/hyperbolic/`, with the
short address `drbuild.uk/hyperbolic`. Plain JavaScript and WebGL 2, with no
library and no build step.

## Implementation Checklist

- [x] Fourteen models, each with an inverse map from the screen to the hyperboloid, in GLSL and in JavaScript
- [x] Tilings from the triangle group (p, q, r), as tiles or as triangles, with eight presets and steppers
- [x] Drag, glide after release, pan (Pan switch, Shift-drag, right-drag, two fingers), zoom about the pointer, arrow keys, Spin, Fly and Reset
- [x] Symmetric colourings, Many, Few and Plain, with shading (default 70%), edge width (default 2) and mirror lines
- [x] Design menu: None, 15 pictures from `app/hyperbolic/designs.js`, Letter R, Letter F and the viewer's own letter (`d=<id>`, `g=<char>`); default Compass. Upright (default) or One point (`o=point`); design opacity 0–100%, default 60% (`da=`). Other defaults: Many colours, shading 70%, edge width 2, mirror lines off (2026-11-19)
- [x] The view snaps home every frame, so the picture stays crisp however far it travels (2026-11-19)
- [x] Live builder-page thumbnail, `assets/hyperbolic-thumb.js`
- [x] Tile preview above the tiling controls, drawn by the same shader
- [x] Settings in the address after the `#`
- [x] Light and dark themes; full-screen button
- [x] `tools/screen-fit/check.js` passes at all six sizes (2026-11-19)
- [x] Share card and thumbnail from `tools/hyperbolic/card.js`
- [ ] A quick check on a real phone and iPad
- [ ] Run `tools/check-addresses/check.js` after the push

## How a pixel is drawn

1. The model's inverse map takes the pixel to a point v on the hyperboloid
   x² + y² − z² = −1, z > 0, in the view's frame. A pixel outside the
   model's image takes the background colour.
2. The inverse of the view matrix T takes v to the world frame. T is a
   Lorentz matrix. Dragging and motion change T only. The inverse of a
   Lorentz matrix is J Tᵀ J, with J = diag(1, 1, −1).
3. Reflections in the three mirrors of the triangle with angles π/p, π/q and
   π/r fold the point into that triangle. The shader records each mirror it
   uses, two bits each, up to 256.
4. The recorded mirrors, applied last first to point 0 of the colouring,
   give the tile's colour (see Colour below). A gentle radial shade, lighter
   at the tile's centre, follows from the folded point's distance to the
   centre.
5. The distance to each mirror, asinh |⟨p, n⟩|, draws the edges with
   anti-aliasing from `fwidth`.
6. Where one pixel covers more than about a third of a tile, the colour fades
   to the palette's average, so the rim of a disk does not shimmer.

## The mirrors

With the corner of angle π/p at the origin:

- n₁ = (0, −1, 0), the x-axis;
- n₂ = (−sin π/p, cos π/p, 0), the line at angle π/p;
- n₃ = (a, b, c), with b = cos π/q, a = (cos π/r + cos π/q cos π/p) / sin π/p
  and c = √(a² + b² − 1).

A point is inside when ⟨p, nᵢ⟩ ≤ 0 for all three, under the Minkowski product
⟨u, v⟩ = uₓvₓ + u_y v_y − u_z v_z. The tiles are the groups of 2p triangles
round each corner of angle π/p. With r = 2 they are the regular {p, q} tiles.
The tile edges lie on n₃.

## The models

Each model's scale `k` sits in the `MODELS` table in `hyperbolic.js`, which
both the shader and the drag code read.

| Model | Screen to hyperboloid |
|---|---|
| Poincaré disk | d = s / 0.95, then the disk map P = (2d, 1 + |d|²) / (1 − |d|²) |
| Klein disk | k = s / 0.95, P = (k, 1) / √(1 − |k|²) |
| Gans plane | g = k s, P = (g, √(1 + |g|²)) |
| Inverted disk | q = s / 0.42, d = −q / |q|², valid outside the unit circle |
| Half-plane | w = k s + i, d = (w − i) / (w + i) |
| Band | b = s (π/2) / 0.9, d = tanh(b/2), valid for |Im b| < π/2 |
| Joukowsky | w = k s, d = w − √(w − 1) √(w + 1), then a Möbius shift by 0.85 so the view centre sits near the slit's tip |
| Azimuthal equidistant | distance t = k |s| from the centre |
| Azimuthal equal-area | t = 2 asinh(k |s| / 2), since a disk of radius t has area 4π sinh²(t/2) |
| Cylindrical equidistant | Fermi coordinates (x, y) = k s: P = (cosh y sinh x, sinh y, cosh y cosh x) |
| Cylindrical equal-area | x = k sₓ, y = asinh(k s_y) |
| Sinusoidal | y = k s_y, x = k sₓ / cosh y |
| Two-point equidistant | the point whose distances from (∓1, 0) along the axis equal the screen distances r₁, r₂ from the two focal points: tanh x = (k − 1) / ((k + 1) tanh 1) with k = cosh r₁ / cosh r₂, then cosh y = cosh r₁ / cosh(x + 1) |
| Hyperboloid | a ray from a camera above the bowl, cut at z = 5.5 |

## Motion and precision

- **Drag:** the translation L(b) L(a)⁻¹ takes the point under the pointer at
  the last event, a, to the point under it now, b. L(p) is the translation
  from the origin to p.
- **Glide:** after a quick release the plane keeps moving and slows over
  about a second.
- **Spin:** a turn about the view centre at 0.25 rad/s.
- **Fly:** forward in a straight line at 0.45 units/s, for ever, since the
  snap home keeps the numbers small. Models with a middle line fly along it.
- **Pan and zoom:** pan shifts the model on the screen, without moving the
  plane, so a user can zoom into the rim of a disk. The wheel and a pinch
  zoom about the pointer. Reset (R) returns the plane, pan and zoom home.

## Precision

The shader works in single floats, about seven significant digits. A point
at hyperbolic distance t from the world origin has coordinates near eᵗ/2, so
its rounding error grows as eᵗ. The first build moved the world back only
when the view was 8 units from home. Pixels near a disk's rim lie 5 to 7
units further out, so the shader met coordinates near 10⁵ and drew speckle
(reported 2026-11-19).

Now every change to T passes through `setT`. It refuses a matrix that is not
finite, which once froze the Joukowsky view. The update is all or nothing: if
the snap below produces a non-finite matrix, T, the colour permutation and
the F's boundary point all go back to their old values. A drag that starts
on the Joukowsky slit once produced such a matrix and turned the view black
(reported 2026-11-19). A drag point further out than z = 10⁵ is also refused.
It then folds the view centre
into the triangle in double precision and replaces T by T G⁻¹, where G is
the symmetry of the tiling that did the fold. The picture is the same, the
shader's points stay within a tile of home, and a 40-unit flight draws as
crisply as the start.

## Shading and the letter F

Shading darkens each tile towards its corners and lifts its centre towards
white. The slider value s is eased as g = s^1.6. The colour is multiplied by
1 − 0.7 g t², then mixed towards white by 0.2 g (1 − t²), where t is the
distance from the tile centre over the tile's radius. At 100% the corners
fall to 30% brightness.

A design gives each tile a frame, so the picture shows how a model bends
and turns shapes. The pictures live in `designs.js`, each drawn on a clear
128-pixel canvas; letters are drawn the same way. The canvas becomes a
texture. Black in it draws in the edge colour, white draws white, and alpha
sets the opacity.

The frame is centred on the tile, which the fold puts at the origin. Two
rules turn it:

- **Upright** (default). The top follows "up" in the Poincaré disk of the
  view where the designs were aimed, so every design stands upright there
  and turns as the plane moves. JavaScript keeps Wref, the value of T at
  aiming, moved by each snap as T is. The map A = Wref T⁻¹ from the current
  view's disk to the aimed one is the Möbius map
  z ↦ e^{iφ} (z − z₀)/(1 − z̄₀ z), passed as z₀ and φ. Up at z pulls back to
  the angle π/2 − φ + 2 arg(1 − z̄₀ z). The shader builds the fold matrix M
  as it folds, finds the tile centre M⁻¹O, takes that angle there and
  carries the direction into the folded frame by M T⁻¹. The angle stays
  accurate far from the aimed view, since it needs only the argument of a
  sum that does not cancel on screen.
- **One point.** The top faces a fixed boundary point ξ, which the shader
  reflects alongside the pixel's point at every fold step.

Choosing a design from None, the orientation buttons, Reset and a new tiling
aim the designs from the current view. On an odd count of reflections,
counting those in the snaps home (`par0`), the shader mirrors the frame, so
every design keeps its hand.

## Colour

A colouring of the tiling comes from a permutation action of the triangle
group on n points: involutions s₁, s₂, s₃ with (s₁s₂)ᵖ = (s₁s₃)^q = (s₂s₃)ʳ = 1,
where s₁ and s₂ fix point 0 and s₃ moves it. A tile reached by the group
element g takes colour g·0. Since s₃ moves 0, two tiles that share an edge
never share a colour, and every symmetry of the tiling permutes the colours.
The snap home multiplies a stored permutation P₀ by the same reflections, so
it never changes a colour.

`findAction` searches for such actions in the manner of a coset table, with
points numbered in order of first use, for n from 2 to 32 and a budget of
200,000 steps each. It takes a few milliseconds. **Many** takes the n nearest
7 between 5 and 12, or else the smallest n of 3 or more. **Few** takes the
smallest n. Examples: {7,3} has 8 and nothing smaller; {3,7} needs 22; {5,4}
has 2, 6, 11 and 12; {6,4} has every even n. Twelve fixed bright colours
cover n up to 12, and further hues follow round the colour wheel.


## Models left out

HyperRogue's [models page](https://roguetemple.com/z/hyper/models.php) lists
more. These need a 3D view, a series fit or a free formula, so the app leaves
them out: the spiral, polygonal and formula models, the hemisphere, the
Poincaré ball, the four surfaces of constant curvature, the Hypersian rug,
the paper model, the Mollweide and Collignon types, the two-point azimuthal
and hybrid maps, and the fisheye, which is not hyperbolic.
