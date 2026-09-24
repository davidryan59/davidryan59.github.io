# Tiling explorer video: storyboard

A 45-second square video for X (Twitter) about the aperiodic tiling explorer at
drbuild.uk/tiles (the Hat and Spectre pages of David Ryan's builder site). It
plays as a seamless loop: the last frame flows into the first. No voiceover, no
end card. The video is only about the explorer.

## Fixed format

- 1080 × 1080, 30 fps, exactly 1350 frames, frame n shows time t = n / 30 s.
- Tempo 80 BPM. One beat = 0.75 s = 22.5 frames. 60 beats = 45.0 s.
- Beat b is at time t = 0.75 × b. Beat 60 is the same moment as beat 0 (the loop seam).
- Dark theme throughout. Page background `#16161a`, light ink `#d9d4c7`.
  The site's font is Georgia (serif).

## Layers

1. **Tiling** (captured from the real pages by `capture.js`, clean, no UI).
2. **Overlay** (captions, a shape slider graphic, palette and edge labels, a
   watermark). Transparent PNG frames, composited over the tiling.
3. **Music** (a new just-intonation track, calm and hypnotic, 45.0 s, loops
   seamlessly, with musical accents on the events below).

## Storyboard, in beats (b) and seconds (t)

The Hat page's shape slider runs 0°–90°: Chevron 0°, Hat 30°, Spectre 45°,
Turtle 60°, Comet 90°. Moves between stops are eased (smooth in and out).

| Beats | Seconds | Picture | Overlay |
|---|---|---|---|
| 58 → 62 (wraps to 2) | 43.5 → 1.5 | Hat page. Shape moves 30° → 0°, crossing the seam at 15° mid-move | Slider graphic visible |
| 2 | 1.5 | Arrives at **Chevron** (0°) | Chevron tick highlights |
| 3 → 6 | 2.25 → 4.5 | 0° → 30°, arrives at **Hat** at b 6 | Hat tick highlights at b 6 |
| 4 → 9.5 | 3.0 → 7.125 | | Caption C1 |
| 8 → 10 | 6.0 → 7.5 | 30° → 45°, arrives at **Spectre** at b 10 | |
| 10 → 19.5 | 7.5 → 14.625 | | Caption C2 |
| 11 → 13 | 8.25 → 9.75 | 45° → 60°, arrives at **Turtle** at b 13 | |
| 14 → 16 | 10.5 → 12.0 | 60° → 90°, arrives at **Comet** at b 16 | |
| 17 → 20 | 12.75 → 15.0 | 90° → 30°, back at **Hat** at b 20 | |
| 20.25 → 20.75 | | | Slider graphic fades out |
| 0 → 21 | 0 → 15.75 | Colours: **Rainbow** (the home palette, also from b 53) | |
| 20.67 | 15.5 | | Palette label fades in, showing "Pastel" |
| 21 | 15.75 | Colours switch to **Pastel** | label "Pastel" |
| 22.5 | 16.875 | **Greyscale** (12 even steps, black to white) | label "Greyscale" |
| 21 → 23.9 | | | Caption C3 |
| 24, 25, 26, 27 | 18.0, 18.75, 19.5, 20.25 | Dice rolls: any colour, RGB corners, black and white, greys | labels "Dice: any colour", "Dice: RGB corners", "Dice: black and white", "Dice: greys" |
| 24 → 27.9 | | | Caption C5 |
| 28 | 21.0 | **Mirrored hats** (dark grey tiles, mirrored hats blue `#6fa0e8`), kept through the zoom | label "Mirrored hats" |
| 28 → 31.6 | | | Caption C4 |
| 31 | 23.25 | | Palette label fades out |
| 30 → 34 | 22.5 → 25.5 | Zoom out, far, while panning (thousands of tiles) | |
| 34 → 38 | 25.5 → 28.5 | Zoom back in | |
| 31.9 → 37.8 | | | Caption C6 |
| 37.5 → 38 | | | Slider graphic fades in |
| 38 → 40 | 28.5 → 30.0 | Shape 30° → 45°, arrives at **Spectre** mark at b 40 | Spectre tick highlights |
| 40 → 41 | 30.0 → 30.75 | Crossfade from the Hat page to the Spectre page (straight edges) | Slider fades out b 40.5 → 41 |
| 39.5 → 44.5 | 29.625 → 33.375 | | Caption C7 |
| 41 → 43 | 30.75 → 32.25 | Edge height sweep 0 → peak (b 42) → 0: **Curve, single** | Edge label "Curve · single" |
| 43 → 45 | | **Curve, double** | "Curve · double" |
| 45 → 47 | | **Triangle, single** | "Triangle · single" |
| 47 → 49 | | **Triangle, double** | "Triangle · double" |
| 49 → 51 | | **Jigsaw, single** | "Jigsaw · single" |
| 51 → 53 | 38.25 → 39.75 | **Jigsaw, double**. Edges flat again at b 53 | "Jigsaw · double", label fades out b 53 |
| 45 → 52.5 | 33.75 → 39.375 | | Caption C8 |
| 53 → 54 | 39.75 → 40.5 | Crossfade from the Spectre page back to the Hat page at 45° | Slider graphic fades in b 53.5 → 54 |
| 54 → 58.5 | 40.5 → 43.875 | | Caption C9 |
| 55 → 57 | 41.25 → 42.75 | 45° → 30°, arrives at **Hat** at b 57 | |
| 58 → 60 | 43.5 → 45.0 | 30° → 15°, the first half of the move that the video opens with | |

Each edge sweep is eased: height 0 at the even beat, the peak at the odd beat,
0 again at the next even beat. The edge shape and single/double switch only at
height 0, where every edge is straight, so the switch itself is invisible.

## Caption text

Captions fade in and out over 0.3 s. The text lives in `timeline.js`.

- **C1**, two lines: "One tile covers the whole plane, and the pattern never repeats."
  Small second line: "The Hat · Smith, Myers, Kaplan and Goodman-Strauss, 2023"
- **C2**: "Slide from chevron to comet, and every tile changes shape at once."
- **C3**: "Colour the tiles by turn and mirror image."
- **C4**: "Blue marks the mirrored hats, about one tile in eight."
- **C5**: "Or roll the dice."
- **C6**: "Pan and zoom. Tiles are built as you move, so the plane has no edge."
- **C7**: "The Spectre covers the plane with no mirror images at all."
- **C8**: "Change the edges, and every tile still fits."
- **C9**: "Try it yourself at drbuild.uk/tiles"

## Musical accents (for the music layer)

Accent beats and what happens on screen:

- Shape arrivals: b 2 (Chevron), 6 (Hat), 10 (Spectre), 13 (Turtle), 16 (Comet),
  20 (Hat), 40 (Spectre), 57 (Hat). Consider a pitch per shape, rising from
  chevron to comet, so the ear hears the slider's position.
- Colour switches: b 21, 22.5, then dice rolls at b 24, 25, 26, 27, then Mirrored hats at b 28.
- Zoom: out over b 30 → 34 (furthest at b 34), back in over b 34 → 38. A swell suits it.
- Crossfade to the Spectre at b 40 → 41: a change of harmony suits it.
- Edge sweeps: six sweeps over b 41 → 53, each 2 beats, peak at the odd beat.
  A glide or timbre change that follows the edge height suits it.
- Crossfade back to the Hat at b 53 → 54, then home harmony for the loop.
- The seam at b 60 = b 0 falls mid-move, so the music must flow straight
  through it with no downbeat accent, no gap and no click.
