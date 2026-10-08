# Nopert explorer video

Renders the 30-second looping video of the Nopert Polyhedra Explorer,
made to promote the Undecanope: 1080 × 1080, 60 fps, silent, with captions.
The last frame flows into the first. The video is the real app page,
`app/nonrup/`, driven by a real mouse on a scripted clock, so it always shows
the app as it is. [storyboard.md](storyboard.md) says what happens on each
beat.

## How it fits together

- `timeline.js` – the single source of timing: 128 BPM, 64 beats, and every
  pointer move, click, drag and caption on them. Music written for the video
  can follow it.
- `clock.js` – runs before the app's own scripts. It replaces
  `performance.now()` and `requestAnimationFrame`, so the app draws each
  frame at an exact time, and seeds `Math.random()`, so the app's search
  finds the same pairs of views on every render.
- `stage.css` – lays out the app's own parts for a square frame, and styles
  the captions, the address and the pointer.
- `stage.js` – says where the pointer is and whether its button is down on
  each frame, runs the app's animation frame, holds the page's CSS
  transitions at the frame's time, and draws the captions and the pointer.
- `render.js` – serves this repo locally, opens the app in headless Chromium,
  moves the real mouse frame by frame, and pipes the screenshots to ffmpeg.
  Output: `undecanope.mp4`, silent.

## Render

Run from the repo root. It needs Node, ffmpeg, and the `playwright-core`
installed in `tools/tiling-video/`. Without Playwright's own Chromium, it
uses Chrome.

| Output | Command | Time |
|---|---|---|
| The video | `node tools/nonrup-video/render.js` | 4 min |
| Stills at chosen seconds | `node tools/nonrup-video/render.js --stills 7.6,14.6` | 15 s |
| A still every 1.5 s, on one sheet | `node tools/nonrup-video/render.js --sheet` | 15 s |

Stills go in `stills/`. The app's state on each frame depends on every frame
before it, so a still is reached by running those frames too, without
screenshots.

Every run checks its own work and stops with an error if a check fails:

- Each click lands on the button it names.
- The drag turns the solid. A press beside it would turn the camera instead,
  and the page would show Reset view.
- The frame after the last matches the first. Chrome sometimes dithers a
  gradient a level differently between screenshots, so differences of up to
  8 levels in 255 count as noise.

It also prints the pass ratio and the app's hint before each click, and the
beat on which each push ends. Use the printout to check the captions against
what the app did, such as the search's count of pairs.

## Coupling with the app

`stage.js` and `stage.css` depend on these parts of the app. After a change
to any of them, render the sheet and check it.

- The ids and classes in `app/nonrup/index.html` and `style.css`: `#shapes`,
  `.shape[data-shape]`, `.steps`, `#cut`, `#push`, `#passage`, `#search`,
  `.scene-card`, `#scene`, `.fit-panel`, `.readout`, `#ratio`, `#verdict`,
  `.fit-wrap`, `#fit`, `#hint` and `#reset-view`.
- In `viewer.js`: the starting view, `START`, `END`, `PLATE`, `CAMERA` and
  the scale that fits them, which `stage.js` repeats to find the solid on
  screen.
- `viewer.js` reads the time only from `performance.now()` and its animation
  frames, and `shadow.js` searches with `Math.random()`.
- The view through the hole sets its line joins round the first time it
  draws a copy. `stage.js` sets them round from the start, so the loop joins.

## Music

The video is silent for now. A track of 16 bars of 4/4 at 128 BPM fits it
exactly, with no new render, and every click falls on a beat.
[storyboard.md](storyboard.md) gives each one in bar.beat.sixteenth. The
tiling video's music tools do the rest, as the sieve video's README describes
([tools/sieve-video/README.md](../sieve-video/README.md)). At 60 fps, the
100 ms trim chosen for X's player is 6 frames.
