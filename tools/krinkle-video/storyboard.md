# Krinkle explorer video: storyboard

A 60-second square video of the Krinkle tab at drbuild.uk/krinkle. It plays
as a seamless loop: it starts and ends on the (3, 7, 22) fan in Pastel 1,
with the title showing. There is no voice and no end card. `timeline.js`
holds every number here and is the source of truth. David approved the
script and stills on 2026-10-12, before the render.

## Format

- 1080 × 1080, 30 fps, exactly 1,800 frames, silent.
- 128 beats at 128 BPM, 32 bars of 4/4. Beat 128 is beat 0, the loop join.
- The app's own page in its dark theme. The map fills the frame, with the
  Options panel at right below the address, and the colour key's top row at
  bottom left. Captions sit at top left, in Georgia.
- A mouse pointer makes every change, and the page hears it as it hears a
  real mouse.
- Every preset has straight edges; curves appear in one scene only.

## Sections

| Bars | Seconds | Picture | Colours |
|---|---|---|---|
| 1–2 | 0–3.75 | The (3, 7, 22) fan | Pastel 1 |
| 3–7 | 3.75–13.1 | (5, 16, 54), zoom out, Arrangement tab. The pointer drags the construction scrubber, and the fan builds wedge by wedge | Pastel 1 |
| 8–10 | 13.1–18.75 | The colour dice | The 27 colours |
| 11–13 | 18.75–24.4 | Tile tab, (3, 7, 14). k up and back down, then the dice | An ordered hue ring |
| 14–16 | 24.4–30 | (1, 4, 20), then zoom out | Copies |
| 17–19 | 30–35.6 | (3, 4, 28), then four turns of 5° | Rainbow |
| 20–22 | 35.6–41.25 | (3, 7, 14), Arrangement tab, Curve edges, zoom in, then the dice | An accented Pastel |
| 23–25 | 41.25–46.9 | Height 0, then Repeating, then zoom out | Lattice |
| 26–29 | 46.9–54.4 | Fan, Tile tab, Set tile: m = 49, k = 120, Apply. Zoom out, then the dice | Pastel 1, then the 27 colours |
| 30–32 | 54.4–60 | Pastel 1 from the menu, then (3, 7, 22). The view eases home, and the pointer goes back to rest | Pastel 1 |

The dice is seeded before each roll: seed 1 deals the 27 colours, seed 7 an
ordered hue ring and seed 9 an accented Pastel. These are the seeds the
approved stills used.

## Captions

| Beats | Text |
|---|---|
| 127.36–7.4 | "Krinkle tilings". Small line: "One tile, spiralling out forever" |
| 8.4–27.4 | "Built one wedge at a time". Small line: "Each wedge is a slice of a plain lattice" |
| 28.4–39.4 | "Roll the colours". Small line: "54 wedges, dealt from 27 colours" |
| 40.4–51.4 | "Pick m, k and t". Small line: "Count in jumps of m on a k-hour clock" |
| 52.4–63.4 | "Five copies of the spiral". Small line: "5 arms one way, 15 the other" |
| 64.4–75.4 | "Seven copies, 28 directions". Small line: "21 arms one way, 7 the other" |
| 76.4–90.4 | "Curve the edges". Small line: "Each tile still fits its neighbours" |
| 91.2–99.4 | "The same tile also tiles in rows". Small line: "So the spiral is non-periodic, not aperiodic" |
| 100.4–108.4 | "Up to 240 directions". Small line: "k = 120: a tile with 242 edges" |
| 109.4–115.4 | "240 wedges, 27 colours". Small line: "Every roll is a new picture" |
| 116.4–127.36 | "Try it yourself at drbuild.uk/krinkle" |

The arm counts and the edge count are the page's own read-out.
