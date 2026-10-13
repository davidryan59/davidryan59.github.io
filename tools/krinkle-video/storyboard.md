# Krinkle explorer video: storyboard

A 45-second 4:3 video of the Krinkle tab at drbuild.uk/krinkle, version 3.
It plays as a seamless loop: it starts and ends on the (3, 7, 22') fan in
Pastel 1, zoomed in one step from home, with the title showing. There is no
voice and no end card. `timeline.js` holds every number here and is the
source of truth. David approved the stills on 2026-10-13, before the
render. Version 2, the 60-second square video in the dark theme, is in git
history.

## Format

- 1440 × 1080, 30 fps, exactly 1,350 frames, silent.
- 96 beats at 128 BPM, 24 bars of 4/4. Beat 96 is beat 0, the loop join.
- The app's own page in its light theme, filmed whole at 1280 × 960 CSS px.
  The Options panel sits at right below the address, and the colour key's
  top row at bottom left. Captions sit at top left, in Georgia.
- A mouse pointer makes every change, and the page hears it as it hears a
  real mouse.
- The first click lands at 0.23 s. Nothing moves in the last 3 s.

## Sections

| Bars | Seconds | Picture | Colours |
|---|---|---|---|
| 1–2 | 0–3.75 | (3, 7, 22') at twice the home zoom. Three zoom-outs, then two zoom-ins, to home | Pastel 1 |
| 3–9 | 3.75–16.9 | Five presets: (5, 16, 54'), (1, 4, 20), (3, 4, 28), (2, 9, 27), (9, 10, 20) | Pastel 1 |
| 10–12 | 16.9–23.4 | Set tile: m = 26, k = 67, t = 3, Apply | Pastel 1 |
| 13–19 | 23.4–35.6 | Five dice rolls | The 27 colours, a hue ring, a gradient, the 27 colours, an accented Pastel |
| 20–21 | 35.6–39.4 | Pastel 6 from the menu | Pastel 6 |
| 22–24 | 39.4–45 | Pastel 1 from the menu, then (3, 7, 22'). The view eases home, zooms in once, and the pointer goes back to the zoom-out button | Pastel 1 |

The dice is seeded before each roll: seeds 1 and 2 deal the 27 colours,
seed 7 a hue ring, seed 8 a gradient and seed 9 an accented Pastel.

## Captions

| Beats | Text |
|---|---|
| 89.6–7.4 | "Modulo Krinkle tiling". Small line: "A spiral monotile by Miki Imura, 2025" |
| 8.2–35.6 | Each preset's (m, k, n), with the paper and figure it comes from |
| 36.2–49.4 | "Or set your own tile". Small line: "m = 26, k = 67, t = 3: 201 directions" |
| 50.2–75.4 | "Roll the colours". Small line: "One tile, 201 wedges" |
| 76.2–83.4 | "Pastel 6". Small line: "Six hue tracks round the fan" |
| 84.2–89.6 | "Try it yourself at drbuild.uk/krinkle" |

The figure numbers are the `source` of each preset in
`app/tiles/krinkle/tiling.js`.
