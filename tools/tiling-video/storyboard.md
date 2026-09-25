# Tiling explorer video: storyboard

A 48.8-second square video about the aperiodic tiling explorer at
drbuild.uk/tiles (the Hat and Spectre pages of David Ryan's builder site). It
plays as a seamless loop: the last frame flows into the first. No voiceover, no
end card. The video is only about the explorer. `timeline.js` holds every
number here and is the source of truth.

## Format

- 1080 × 1080, 30 fps, exactly 1,464 frames.
- The timeline counts 60 video beats of 0.8133 s. Beat 60 is beat 0, the
  loop join.
- The music is 24 bars of 4/4 at 118.03 BPM. A bar is 2.5 video beats and a
  music beat is 0.625 video beats. The shape moves and colour changes sit on
  music beats.
- Dark theme. Page background `#16161a`, light ink `#d9d4c7`, Georgia.

## Layers

1. **Tiling**: the real pages, captured frame by frame by `capture.js`.
2. **Overlay**: captions, the shape slider graphic, palette and edge labels,
   and the watermark, drawn by `overlay/`.
3. **Music**: David's own mix, exported from Ableton and looped by
   `music/loop_export.py`.

## Sections

The shape slider runs 0°–90°: Chevron 0°, Hat 30°, Spectre 45°, Turtle 60°,
Comet 90°. Moves are eased. The Hat camera drifts slowly, and is at rest at
the loop join and through the opening 0.25 s.

| Music | Bars | Video beats | Picture |
|---|---|---|---|
| Groove | 0–7 | 0–20 | Opens still on the Hat. Arrives at Spectre (bar 1), Turtle (bar 2), Comet (bar 3), sweeps down to Chevron (bar 5), back to the Hat (bar 7) |
| Busier groove | 8–15 | 20–40 | Rainbow (bar 8), Greyscale (bar 8½), four dice rolls on the beats of bar 9, Mirrored hats (bar 10) and kept through the zoom (bars 12–15). The shape moves to the Spectre mark (bar 15¾) |
| Build | 16–23 | 40–60 | Crossfade to the Spectre page (bar 16), six edge sweeps (bars 16.4–21.2), crossfade back to the Hat at 45° (bar 21.2), back to the Hat (bar 23), held to the loop join |

Edge sweeps are eased, each 2 video beats: height 0 at the start, the peak
in the middle, 0 at the end. The shape and single or double switch only at
height 0, so the switch is invisible.

## Captions

Captions fade in and out over 0.3 s.

| Caption | Video beats | Text |
|---|---|---|
| C1 | 0.5–6.5 | "One tile covers the whole plane, and the pattern never repeats." Small second line: "The Hat · Smith, Myers, Kaplan and Goodman-Strauss, 2023" |
| C2 | 7–17 | "Slide from chevron to comet, and every tile changes shape at once." |
| C3 | 18–22.3 | "Colour the tiles by turn and mirror image." |
| C5 | 22.5–24.8 | "Or roll the dice." |
| C4 | 25–29.4 | "Blue marks the mirrored hats, about one tile in eight." |
| C6 | 29.7–37.3 | "Pan and zoom. Tiles are built as you move, so the plane has no edge." |
| C7 | 39.5–44.5 | "The Spectre covers the plane with no mirror images at all." |
| C8 | 45–52.5 | "Change the edges, and every tile still fits." |
| C9 | 54–58.5 | "Try it yourself at drbuild.uk/tiles" |

The slider graphic shows while the shape can move: to beat 19.75, from 37 to
41, and from 53.5 round the loop join. The palette labels show from 19.67 to
29.5, the edge labels from 41 to 53.

## Music

The track's form, tempo and level are in [music/notes.md](music/notes.md).
The build ends in a drum fill, and the kick comes back at the loop join, so
the music's drop falls where the video restarts.
