# Krinkle explorer video: storyboard

A 46-second 4:3 video of the Krinkle tab at drbuild.uk/krinkle, version 4.
It plays as a seamless loop: it starts and ends on the (3, 7, 22') fan in
Pastel 1 at twice the home zoom, with the title showing and the pointer on
the zoom-out button. There is no voice, music or end card. `timeline.js`
holds every number here and is the source of truth. David approved the
plan on 2026-10-13. Versions 2 and 3 are in git history.

## Format

- 1440 × 1080, 30 fps, 1,380 frames, silent. Times are plain seconds.
- The app's own page in its light theme, filmed whole at 1280 × 960 CSS px.
- A real mouse pointer makes every click. Pointer moves and zoom glides
  follow half a sine wave. The opening and closing zooms glide in the
  background while the pointer only hovers on the zoom buttons.
- A change of tiling crossfades from the old picture over 0.5 s, while the
  zoom glides to the new tiling's home over 0.8 s.
- Something moves from 0.25 s, and nothing moves from 44.6 s to the end.

## Sections

| Seconds | Picture | Colours |
|---|---|---|
| 0–6.6 | (3, 7, 22'). Glide out to 1/6 of the opening zoom (0.25–2.85 s), pause, glide in to home (3.65–5.75 s), pause | Pastel 1 |
| 7–17.9 | Five presets, 2.2 s each: (5, 16, 54'), (1, 4, 20), (3, 4, 28), (2, 9, 27), (9, 10, 20) | Pastel 1 |
| 17.4–21.1 | Set tile: m = 26, k = 67, t = 3, Apply | Pastel 1 |
| 21.2–30.9 | The pointer leaves Apply 0.1 s after it, and five dice rolls follow, 1.67 s apart | The 27 colours, a hue ring, a gradient, the 27 colours, an accented Pastel |
| 31.3–39.9 | Four schemes from the menu, 2 s each | Copies, Two tones, Greyscale, Pastel 6 |
| 39.9–46 | Pastel 1, then (3, 7, 22'). Glide in to the opening zoom (42.4–44 s), and the pointer returns to zoom-out | Pastel 1 |

The dice is seeded before each roll: seeds 1 and 2 deal the 27 colours,
seed 7 a hue ring, seed 8 a gradient and seed 9 an accented Pastel.

## Captions

| Seconds | Text |
|---|---|
| 44–6.6 | "Modulo Krinkle tiling". Small line: "A spiral monotile by Miki Imura, 2025" |
| 7–17.9 | Each preset's (m, k, n), with the paper and figure it comes from |
| 18.2–22.3 | "Or set your own tile". Small line: "m = 26, k = 67, t = 3: 201 directions" |
| 22.6–31.1 | "Roll the colours". Small line: "One tile, 201 wedges" |
| 31.35–39.85 | Each scheme's name, with a line on what it shows |
| 40–43.7 | "Try it yourself at drbuild.uk/krinkle" |

The figure numbers are the `source` of each preset in
`app/tiles/krinkle/tiling.js`.
