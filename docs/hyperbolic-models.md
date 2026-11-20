# Hyperbolic Models Explorer

## Summary

The hyperbolic plane has no flat map that keeps both angles and sizes true,
so mathematicians draw it in many models. This app shows several tiling
patterns in fourteen models. Drag the plane through any of them. It
lives at `app/hyperbolic/`, served at `drbuild.uk/app/hyperbolic/`, with the
short address `drbuild.uk/hyperbolic`. Plain JavaScript and WebGL 2, with no
library and no build step.

## Implementation Checklist

- [x] Fourteen models, each with an inverse map from the screen to the hyperboloid, in GLSL and in JavaScript
- [x] Tilings from the triangle group (p, q, r), as tiles or as triangles, with eleven presets and steppers
- [x] Two full rows of four pattern buttons, each column as wide as its longest label. Below them, a tall Goldberg button with its m and n steppers and its hand. A phone uses a pattern menu. Expanded is the default pattern (2026-11-20)
- [x] Straight and twisted Goldberg tilings with a size stepper, shared handedness, tile-type colours and designs (2026-11-20)
- [x] Drag, glide after release, pan (Pan switch, Shift-drag, right-drag, two fingers), zoom about the pointer, arrow keys, Spin, Fly and Reset
- [x] Tile type (default), Few, Plain and Many, each showing its colour count in brackets, with shading (default 70%), edge width (default 2) and mirror lines
- [x] Design menu: None, then Compass, then the other 14 pictures from `app/hyperbolic/designs.js`, Letter R, Letter F and the viewer's own letter (`d=<id>`, `g=<char>`); default Compass. Upright (default) or One point (`o=point`); design opacity 0–100%, default 60% (`da=`). Other defaults: Tile type colours, shading 70%, edge width 2, mirror lines off (2026-11-19)
- [x] Designs fit each tile. All tiles is the default. Largest tiles selects the tiles with the largest circumradius (`on=largest`).
- [x] The view snaps home every frame, so the picture stays crisp however far it travels (2026-11-19)
- [x] Live builder-page thumbnail, `assets/hyperbolic-thumb.js`
- [x] Tile preview above the tiling controls, drawn by the same shader
- [x] Settings in the address after the `#`
- [x] Light and dark themes; full-screen button
- [x] `tools/screen-fit/check.js` passes at all six sizes with Goldberg GP(2,1), Tile type and Letter F (2026-11-20)
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
4. The folded point gives the tile. Snub and Goldberg also use the parity of the fold
   and the snaps home to select one of two triangles. The tile gives its
   type, centre, scale and colour action. For Many and Few, the recorded
   mirrors act on the tile's point in that action, last first.
5. The shader uses distance to the tile edges, with anti-aliasing from
   `fwidth`. Regular uses the third mirror. The Wythoff patterns use
   segments in the triangle. Snub and Goldberg use the edges of the selected polygon.
6. Where one pixel covers more than about a third of a tile, the colour fades
   to the palette's average, so the rim of a disk does not shimmer.

## The mirrors

With the corner of angle π/p at the origin:

- n₁ = (0, −1, 0), the x-axis;
- n₂ = (−sin π/p, cos π/p, 0), the line at angle π/p;
- n₃ = (a, b, c), with b = cos π/q, a = (cos π/r + cos π/q cos π/p) / sin π/p
  and c = √(a² + b² − 1).

A point is inside when ⟨p, nᵢ⟩ ≤ 0 for all three, under the Minkowski product
⟨u, v⟩ = uₓvₓ + u_y v_y − u_z v_z. The Regular pattern groups 2p triangles
round each corner of angle π/p. With r = 2 these are the regular {p, q}
tiles. Their edges lie on n₃.

## Uniform patterns

The top-left card has two headed groups. **Model** shows six large buttons in two rows of three: Poincaré disk, Klein disk, Half-plane, Band, Hyperboloid and Joukowsky. The other eight models follow in two rows of four. **Pattern** shows eight buttons in two rows of four. Each column takes the width of its longest label, and the columns share the spare width equally. Below them, a Goldberg button two rows tall shows the size, such as GP(2,1). To its right sit the m and n steppers and the Left and Right buttons. Snub left and Snub right choose the snub and its hand. A phone shows both groups as menus. The steppers and presets choose the group. The 6.6.7, 3.4.7.4 and GP(3,0) presets also set the pattern on {7,3}.
Tiles shows the selected pattern. Triangles shows the reflection triangles
and keeps the pattern selected. Shared addresses save the choice as
`pattern=<id>`. Expanded is the default. The hash always saves the pattern, so a link with `t=` and no `pattern=` comes from before that default and opens Regular.

| Pattern | Hash value | Active mirrors | Vertex figure on {7,3} |
| --- | --- | --- | --- |
| Regular | `regular` | n₂ | 7.7.7 |
| Rectified | `rectified` | n₁ | 3.7.3.7 |
| Truncated | `truncated` | n₁, n₂ | 3.14.14 |
| Expanded | `expanded` | n₂, n₃ | 3.4.7.4 |
| Omnitruncated | `omnitruncated` | n₁, n₂, n₃ | 4.6.14 |
| Truncated dual | `truncated-dual` | n₁, n₃ | 6.6.7 |
| Snub | `snub` | rotations | 3.3.3.3.7 |
| Goldberg | `goldberg` | reflections or rotations, by size | 6.6.7 and 6.6.6 |

For the Wythoff patterns, JavaScript solves ⟨W, nᵢ⟩ = −1 on the active mirrors and zero on the
others. It scales W onto the hyperboloid, so the active mirrors all lie
at the same distance from W. Each segment joins W to its perpendicular
foot on an active mirror. Reflection in that mirror continues the segment
to the next corner. Every tiling corner belongs to the reflection orbit
of W, so every corner has the same vertex figure.

Each chamber corner P, Q or R can be the centre of a tile. If its angle is
π/k, one active incident mirror makes a k-gon and two make a 2k-gon. At a
right angle, one active mirror gives an edge midpoint. The shader's
`tileAt` uses the sides of the cuts through W to find the tile's centre orbit.
Congruent polygons can belong to different orbits.

The preview shows the tiles around one vertex in the Poincaré disk.

Regular keeps the original mirror-edge rendering and its single-tile
preview. For r > 2, its polygons have 2p sides and alternating corners at Q
and R. That view uses both corner orbits instead of a single Wythoff point.

## Snub

The vertex W lies inside the triangle of mirrors. A rotation by twice the
angle at P, Q or R takes W along an edge. JavaScript chooses W so these
three edges have the same length. The orbit of W under even products of
reflections gives every vertex. Each odd triangle contributes one
equilateral triangle formed by the seeds from its three neighbouring even
triangles. A corner with angle π/2 gives an edge between two of those
triangles. On {7,3}, four triangles and a heptagon meet at every vertex.

The two-triangle domain stores both halves in folded coordinates. Each half
lists the convex faces that meet its interior. A face stores its centre,
circumradius, design scale, colour orbit, tile type and all its edge planes.
The fragment shader reads these rows from a texture. Complete faces let the
shader draw an edge or a design across a mirror with the same geometry on
both sides. The domain can also hold the precomputed cells of a Goldberg tiling.

The Snub left and Snub right buttons set the hand. Right is the default. Left swaps
the domain halves, reflects the colour actions and saves `hand=left`.
At Reset, reflection in the horizontal mirror n₁ takes either hand to
the other. Designs follow their selected orientation in each hand.

## Goldberg

Goldberg starts with the equilateral triangles dual to a regular {p,3}
tiling. It divides their lattice into smaller triangles and takes the dual.
Each original vertex gives one p-gon and the new sites give hexagons. On
{7,3}, the shortest path between neighbouring heptagons is m + n tile
steps, with directions along the two lattice axes.

JavaScript places the parent triangle corners at (0,0), (m,n) and
(−n,m+n) in a triangular lattice. It maps each integer site in the
triangle to the hyperboloid by its barycentric weights. Rotations fill
the parent triangles around its three corners. JavaScript cuts the sites'
Voronoi cells with hyperbolic bisectors, which are straight in the Klein disk.
Each domain half keeps the complete cells that meet its interior. The
shader reads them from the same texture format as Snub. Face uploads use
`UNPACK_FLIP_Y_WEBGL = false`. Design uploads turn it on for the picture
and reset it to false afterwards.

Two unlabelled steppers set m and n, within 1 ≤ m ≤ 6 and 0 ≤ n ≤ m.
The `GOLDBERG_MAX` constant holds the top value of m. Lowering m below n
lowers n with it. GP(1,0) is the plain {p,3}. GP(n,m) is the mirror image
of GP(m,n), so Left and Right cover n > m. They are enabled only for
twisted sizes, 0 < n < m. The steppers and the hand buttons are disabled
until Goldberg is selected. They share the hand with
Snub. The hash saves `pattern=goldberg&gp=2,1&hand=left`
for a left-handed GP(2,1). Right is the default.

**Goldberg relax** (`rx=`, 0–100%, default 0) is a slider in the Tiling
card, disabled outside Goldberg. At 0%, each grid point is a straight
blend of its large triangle's corners. At 100%, the points sit where
springs between neighbouring hexagon centres settle, all with one common
rest length, the mean spacing. The large-tile centres stay fixed and
have no springs, so each large tile takes the size its ring gives it.
Every symmetric copy of a point moves with it, so the symmetry holds.
The springs settle in 56 rounds for GP(3,1) on {8,3} and 464 for GP(6,5)
on {12,3}. The settled points are cached per p, m and n, and the slider
blends between the two sets. Settling narrows the spread of neighbour
spacings from 0.84–1.46 times the mean to 0.86–1.35 on {12,3} GP(6,5).
The rest of the unevenness comes from the hyperbolic plane itself.

The Sides stepper changes p. Goldberg uses q = 3 and r = 2, which give
the equilateral parent triangles. Selecting Goldberg from a different
group keeps p, with 7 at least, and sets q = 3 and r = 2. So {8,4,3}
becomes {8,3}.

On 2026-11-20, Chrome on an Apple M1 Max held 60 fps for GP(4,0) and
GP(3,2) during Fly in the Poincaré disk with Many colours and Compass.
The viewport was 1728 × 990 CSS pixels and the canvas was 2954 × 1693.
With the frame cap disabled and a GPU wait after each draw, the same
run averaged about 533 draws per second at GP(4,0) and 517 at GP(3,2).

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
It then folds the view centre into the triangle in double precision and
replaces T by T G⁻¹, where G is the product of the reflections in the fold.
The shader counts the parity of G when selecting a Snub or Goldberg domain half. The picture
stays the same, the shader's points stay near home, and a 40-unit flight
draws as crisply as the start.

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

The shader translates each tile centre to the origin. The design scale
comes from the radius of the largest circle centred on the tile that fits
inside its edges. The **Largest tiles only** checkbox (`on=largest`) limits designs to
the tiles with the largest circumradius, including ties. Two rules turn each frame.

- **Upright** (default). The top follows "up" in the Poincaré disk of the
  view where the designs were aimed, so every design stands upright there
  and turns as the plane moves. JavaScript keeps Wref, the value of T at
  aiming, moved by each snap as T is. The map A = Wref T⁻¹ from the current
  view's disk to the aimed one is the Möbius map
  z ↦ e^{iφ} (z − z₀)/(1 − z̄₀ z), passed as z₀ and φ. Up at z pulls back to
  the angle π/2 − φ + 2 arg(1 − z̄₀ z). The shader builds the fold matrix M
  as it folds, finds the tile centre M⁻¹C, takes that angle there and
  carries the direction into the tile frame. The angle stays
  accurate far from the aimed view, since it needs only the argument of a
  sum that does not cancel on screen.
- **One point.** The top faces a fixed boundary point ξ, which the shader
  reflects alongside the pixel at every fold step. It then translates the
  boundary point into the tile frame.

Choosing a design from None, the orientation buttons, Reset and a new tiling
aim the designs from the current view. On an odd count of reflections,
counting those in the snaps home (`par0`), the shader mirrors the frame, so
every design keeps its hand.

## Colour

The Colours card opens with a heading. Each button shows its colour count in
brackets at 60% opacity, such as Many (11).

**Tile type** (`c=type`, the default) gives each polygon shape one colour. The uniform
patterns have equal edge lengths, so regular polygons of the same side
count share a colour. The two triangle orbits in the {7,3} snub share a
colour. Goldberg groups cells by side count and hyperbolic area. For
example, GP(3,0) on {7,3} has three colours: one for the heptagons and two
for the hexagons. **Plain** (`c=mono`) uses one neutral fill.

**Many** (`c=many`) and **Few** (`c=few`) give each tile orbit
its own permutation action and palette range. The action uses involutions
s₁, s₂, s₃ with (s₁s₂)ᵖ = (s₁s₃)^q = (s₂s₃)ʳ = 1. The two mirrors through
the centre P, Q or R fix point 0. The opposite mirror moves it. A tile
reached by the group element g takes colour g·0. The extra Snub triangles
use the P action with point 0 anchored to the whole chamber. Snaps home
update the stored permutations so the colours follow the plane. For
Goldberg, each centre uses an action fixed by the mirrors it lies on.
Centres inside a chamber use a separate palette range with the P action.

`findAction` searches in the manner of a coset table. It numbers points in
order of first use and searches from 2 to 32 points, with a budget of 200,000
steps per size. **Many** chooses the size nearest seven between five and
12, or the smallest size of at least three if that range yields none.
**Few** chooses the smallest size found. An orbit with no action found
gets one colour. On Regular {7,3}, both choices find eight colours. On
Expanded {7,3}, the P, Q and R actions use 8, 22 and 9 colours respectively.

## Models left out

HyperRogue's [models page](https://roguetemple.com/z/hyper/models.php) lists
more. These need a 3D view, a series fit or a free formula, so the app leaves
them out: the spiral, polygonal and formula models, the hemisphere, the
Poincaré ball, the four surfaces of constant curvature, the Hypersian rug,
the paper model, the Mollweide and Collignon types, the two-point azimuthal
and hybrid maps, and the fisheye, which is not hyperbolic.
