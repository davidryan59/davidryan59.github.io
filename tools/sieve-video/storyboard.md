# Sieve video: storyboard

A 30-second square video of the Sieve of Eratosthenes app at
drbuild.uk/sieve. It plays as a seamless loop: it starts and ends on the same
grey hundred square, with the title showing. There is no voice and no end
card. `timeline.js` holds every number here and is the source of truth.

## Format

- 1080 × 1080, 60 fps, exactly 1,800 frames, silent.
- 64 beats at 128 BPM, 16 bars of 4/4. Beat 64 is beat 0, the loop join.
- The app's dark theme. Captions are in Georgia, and the toolbar is in the
  site's monospace, as on the page.
- A drawn toolbar at the top left holds the two controls the video uses: Row
  width and Clear. The address sits at the top right, and the captions sit
  between them and the grid.
- A mouse pointer makes every change, and the board hears it as the page
  does. A ring follows the tile under the pointer, a pressed tile sinks, and
  pointing at a chosen number dims the rest of the board.

## Sections

| Beats | Picture |
|---|---|
| 0–16 | The hundred square, all grey. The pointer chooses 2, 3, 5 and 7. Each springs out, and its multiples light up in turn, until only the primes stay grey |
| 16–27 | Row width 30, and the camera pulls back to fit the rows. The pointer chooses 11, 13, 17, 19, 23 and 29, one on each beat. The grey numbers left are all prime, in eight columns |
| 27–40 | Row width 210, and a slow pull-back until each tile is 5 px: stripes, with every prime after 7 in 48 grey columns. Then the camera zooms back into the top left corner |
| 40–51 | Row width 10: the hundred square, with 2 to 29 lit. Clear. The pointer chooses 3, then 4, then 2, as in the app's original prompt: green, blue and yellow |
| 51–55 | The pointer rests on 4. The board dims, and the multiples of 4 are ringed |
| 55–64 | The pointer clicks Clear on beat 60 and goes back to its rest in the margin. The title fades back in for the loop |

## Captions

Captions fade in and out over 0.3 s.

| Beats | Text |
|---|---|
| 63.4–6.2 | "Sieve of Eratosthenes". Small line: "Choose a number, and it colours its multiples." |
| 6.6–15.4 | "Choose 2, 3, 5 and 7, and only the primes stay grey." |
| 16.4–26.6 | "Rows 30 wide put every prime after 5 in eight columns." |
| 27.4–38.6 | "Rows 210 wide put every prime after 7 in 48 columns." |
| 41.4–54 | "Or choose your own primes, wisely or foolishly." Small line: "Here 4 comes before 2." |
| 54.4–63.4 | "Try it yourself at drbuild.uk/sieve" |

"Wisely or foolishly" comes from the app's entry on the builder page.

## Music

The video is silent for now. A track of 16 bars of 4/4 at 128 BPM fits it
exactly, and bar 17 is bar 1 again. These are the moments a track can mark,
in Ableton's bar.beat.sixteenth:

| Position | Seconds | Event |
|---|---|---|
| 1.3.1 | 0.94 | Chooses 2 |
| 2.2.1, 2.4.1, 3.2.1 | 2.34, 3.28, 4.22 | Chooses 3, 5 and 7 |
| 5.1.1 | 7.50 | Row width 30 |
| 6.1.1 to 7.2.1 | 9.38 to 11.72 | Chooses 11, 13, 17, 19, 23 and 29, one on each beat |
| 7.4.1 | 12.66 | Row width 210, then the pull-back until 9.3.3 |
| 9.4.3 to 11.1.1 | 16.64 to 18.75 | The zoom back into the hundred square |
| 11.1.3 | 18.98 | Row width 10 |
| 11.3.1 | 19.69 | Clear |
| 12.1.3, 12.4.1, 13.2.3 | 20.86, 22.03, 23.20 | Chooses 3, 4 and 2 |
| 16.1.1 | 28.13 | Clear |

Three clicks fall on the "and" of a beat: 11.1.3, 12.1.3 and 13.2.3.
