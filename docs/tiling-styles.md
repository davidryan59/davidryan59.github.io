# Tiling explorer: tile styles

## Summary

The Hat, Spectre and Hat (extended) pages can draw each tile in one of eight
styles, picked from a Style menu on the colour panel's top row. Each style shades the
inside of a tile on the graphics card, from the tile's own coordinates, so
the map keeps its frame rate as it pans, zooms and reshapes. The styles come
from a set first drawn for printed posters. Krinkle keeps flat colour.

The same change adds a Rich colour scheme, which becomes the default on the
three pages. Pastel stays in the list, below it.

## Implementation checklist

- [x] Rich colour scheme, first in the list and the default.
- [x] Style menu and controls in the colour panel, above the colour menu.
- [x] Style and settings in the address bar and in saved options.
- [x] Per-tile seed from the tile's place in the tiling.
- [x] Glow points and depth worked out per tile shape.
- [x] The eight styles in the tile shader.
- [x] Dome membrane solved per shape after the shape stops changing.
- [x] Zoom fade for the four pattern styles.
- [ ] Check on a phone and an iPad.

## The styles

| Style | Slider | Switch | What it draws |
|---|---|---|---|
| Flat | none | none | One colour per tile, as before. |
| Glow | Strength | Centre: Random or Top left | A radial gradient from a glow point, with dark lead lines. Random takes each tile's own seeded point; Top left takes a point towards the light. |
| Bevel | Rim | Light: Sun or Lamp | A sloped rim round each tile. Sun lights from the top left of the screen; Lamp lights each pixel from a lamp near the top left, dimming with distance. |
| Dome | Light, 5% to 15% | none | A smooth cushion: a membrane held at the tile's edge and pushed up from below. |
| Engraved | Glow, 0 to 1.5 | none | Fine lines at 15° in the tile's frame, cross-hatched on mirrored tiles. Each line thickens away from the glow point. |
| Halftone | Glow, 0% to 100% | none | Dots on a 45° grid in the tile's frame, on a tint at the tile's own colour, or 12% lighter on a dark tile. Each dot grows away from the glow point. |
| Mosaic | Glow | Layout: Grid or Rings | Square tesserae in four close shades, from 6% lighter at the glow point to 10% darker at the far corner, on joints of the tile's deep rim colour. They lie on a grid or in rings round the glow point. |
| Weave | Glow | Glow as: Shade or Gaps | Strips woven over and under. Shade lightens near the glow point; Gaps narrows the strips away from it. |

A Glow slider at 0 gives the plain version of each pattern style. The
defaults match the posters: Glow at full strength, Engraved at 1, which runs
each line from 0.03 to 0.6 of its maximum weight, Dome at 10%, Halftone at
75%. Halftone and Mosaic in the Rich scheme match the printed posters that
use them: a tint at the tile's own colour, and tesserae in full colour.

## How it works

- **Seed.** Each tile's position is an exact pair of Z[w] numbers. The vertex
  shader rounds the chunk's origin and the tile's offset to integer pairs,
  adds them, and hashes the four integers. The seed depends only on the
  tile's place, so it holds through panning, zooming, reshaping and
  rebuilding chunks.
- **Glow points.** For each tile shape and hand, the page finds the point
  deepest inside the outline, then 16 candidate points: each starts from the
  deepest point towards a seeded corner, and stops where it would come
  closer to the edge than 30% of the depth. A tile's seed picks one. The
  points follow the shape continuously as the slider moves. Top left mode
  puts the point 0.6 depths from the deepest point towards the light.
- **Light.** The light falls from the top left of the screen, as on the
  posters, so it stays put as the map turns. The vertex shader carries it
  into each tile's own frame.
- **Colour.** Every style shifts the tile's scheme colour in OKLCH
  lightness and chroma, so it works with every scheme, the dice and custom
  colours.
- **Edge distance.** Bevel and the Dome's stand-in need the distance to the
  nearest edge, which the shader already measures for the outlines. They
  widen its culling distance to reach it.
- **Dome.** The membrane is solved on a 128 × 128 grid per hand, 250 ms
  after the shape last changed, and kept in a float texture with its
  gradient. Until then, a dome built from the edge distance stands in. It
  shows faint creases along the middle of each tile.
- **Zoom fade.** A pattern fades to its average colour as its spacing falls
  from 6 to 3 device pixels, so it never shimmers.

## The colour panel

On these three pages the panel runs from the general to the particular. The
Style menu takes the top row, with the theme toggle and Hide. The style's
slider and switch come next, then the colour menu with the dice, then the
key. Hide folds the slider, switch and key; both menus stay. No style
carries a caption: the menu, slider and switch labels say enough, and a
line of text under them was clutter. Krinkle keeps its own panel, with the colour menu on top.

## Address bar and storage

`s=<style>,<slider>,<switch>` holds the style when it is not Flat. Each style
remembers its own settings in saved options. Reset colours also resets the
style to Flat and every setting to its default.
