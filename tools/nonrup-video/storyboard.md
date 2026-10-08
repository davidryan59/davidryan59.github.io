# Nopert explorer video: storyboard

A 30-second square video of the Nopert Polyhedra Explorer at
drbuild.uk/nonrup, made to promote the Undecanope. It plays as a seamless
loop: it starts and ends on the Undecanope turning before its hole is cut,
with the title showing. There is no voice and no end card. `timeline.js`
holds every number here and is the source of truth.

## Format

- 1080 × 1080, 60 fps, exactly 1,800 frames, silent.
- 64 beats at 128 BPM, 16 bars of 4/4. Beat 64 is beat 0, the loop join.
- The app's own page, its dark theme and its controls, laid out for a square
  frame by `stage.css`. Captions are in Georgia, as in the sieve and tiling
  videos.
- The row of solids runs across the top, cut off at the right as on a phone.
  The action buttons sit below it, with the address at the right. The 3D
  view fills the rest. The pass ratio sits at its top right, and a small
  view through the hole at its top left.
- A mouse pointer makes every change, and the page hears it as it hears a
  real mouse: buttons light under it and sink while pressed, and dragging
  the solid turns it.

## Sections

| Beats | Seconds | Picture |
|---|---|---|
| 0–8 | 0–3.75 | The Undecanope turns, and its shadow lies on the plate. The pointer rests at right |
| 8–19 | 3.75–8.91 | The pointer chooses the cube, then Passage, a stored pair of views with pass ratio 1.0607, which is 3√2/4. Push: the copy slides through the hole |
| 19–31 | 8.91–14.53 | C11, then Cut hole. The copy sticks out at 0.9765. The pointer drags it round, and the red grows (0.9480). On release the app eases it to its best twist (0.9748). Push: it jams on the rim |
| 31–46 | 14.53–21.56 | Search for 7 beats: 15,169 pairs of views. The best reaches 0.9999998 and still sticks out. Stop, then Push: it jams halfway, red all round the rim |
| 46–56 | 21.56–26.25 | C15: the Noperthedron turns |
| 56–64 | 26.25–30 | C11 again, on the loop click. The pointer goes back to rest, and the title fades in for the loop |

The search is the app's own, with its random numbers seeded, so every render
finds the same pairs. `clock.js` sets how many pairs it tries a frame, about
what a recent laptop manages.

## Captions

Captions fade in and out over 0.3 s. Each main line fits on one line, so the
card clears the pass ratio below it.

| Beats | Text |
|---|---|
| 63.36–6 | "The Undecanope". Small line: "A non-Rupert polyhedron with only 88 vertices" |
| 6.6–18.4 | "Cut a hole in a cube, and a copy passes through." Small line: "A solid that lets a copy of itself through is Rupert." |
| 19.4–30.6 | "Cut a hole in the Undecanope, and its copy jams." Small line: "Red shows where it sticks out." |
| 31.2–45.4 | "Search 15,000 pairs of views." Small line: "The best still sticks out." |
| 46.4–55.4 | "The first non-Rupert solid was found in 2025." Small line: "The Noperthedron has 90 vertices. The Undecanope has only 88." |
| 56.4–63.36 | "Try it yourself at drbuild.uk/nonrup" |

The wording follows the builder page and the app as of 2026-10-06, which call
the Undecanope non-Rupert, without "candidate". The search caption's count
comes from the render's log: 15,169 pairs.

## Music

The video is silent for now. A track of 16 bars of 4/4 at 128 BPM fits it
exactly, and bar 17 is bar 1 again. Every click falls on a beat. These are
the moments a track can mark, in Ableton's bar.beat.sixteenth:

| Position | Seconds | Event |
|---|---|---|
| 3.1.1 | 3.75 | Chooses the cube |
| 3.3.1 | 4.69 | Passage |
| 4.1.1 | 5.63 | Push. The copy slides through until 5.1.4 (7.90 s) |
| 5.4.1 | 8.91 | Chooses C11 |
| 6.2.1 | 9.84 | Cut hole |
| 6.4.1 to 7.2.1 | 10.78 to 11.72 | Drags the copy round |
| 7.4.1 | 12.66 | Push. The copy jams at 8.2.1 (13.65 s) |
| 8.4.1 | 14.53 | Search |
| 10.3.1 | 17.81 | Stop |
| 11.1.1 | 18.75 | Push. The copy jams at 11.3.1 (19.80 s) |
| 12.3.1 | 21.56 | Chooses C15 |
| 15.1.1 | 26.25 | Chooses C11, the loop click |

The two jams land a little after a beat, since the app pushes the copy at its
own speed until it meets the rim.
