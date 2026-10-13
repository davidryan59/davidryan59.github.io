# Krinkle explorer video

Renders the 45-second looping video of the Krinkle tab of the Tiling
Explorer, version 3: 1440 × 1080 (4:3), 30 fps, light theme, silent, with
captions. The last frame
flows into the first. The video is the real app page, `app/tiles/krinkle/`,
driven by a real mouse on a scripted clock, so it always shows the app as it
is. [storyboard.md](storyboard.md) says what happens on each beat.

## How it fits together

- `timeline.js` – the single source of timing: 128 BPM, 96 beats, and every
  pointer move, click and caption on them. Music written for the video
  can follow it.
- `clock.js` – runs before the app's own scripts. It replaces
  `performance.now()` and `requestAnimationFrame`, so the app draws each
  frame at an exact time. It counts the app's pending timers, and seeds
  `Math.random()`.
- `stage.css` – hides the title card, folds the colour key to its top row,
  moves the Options panel below the address, and styles the captions, the
  address and the pointer.
- `stage.js` – says where the pointer is and whether its button is down on
  each frame, seeds the dice before each dice click, runs the app's
  animation frame, and draws the captions and the pointer.
- `render.js` – serves this repo locally, opens the app in headless
  Chromium, moves the real mouse frame by frame, waits until the map has
  drawn every tile in view, and pipes the screenshots to ffmpeg. Output:
  `renders/krinkle-v3.mp4`, silent. Stills and the loop check go in
  `renders/v3/`. Earlier versions' renders stay in `renders/`.

The page is 1280 × 960 CSS px, filmed whole at 1.125 times the density. The
video opens at twice the home zoom: `render.js` reads the home zoom from a
first page, then opens the filmed page at that zoom through the address.

## Render

Run from the repo root. It needs Node, ffmpeg, and the `playwright-core`
installed in `tools/tiling-video/`. Without Playwright's own Chromium, it
uses Chrome.

| Output | Command | Time |
|---|---|---|
| The video | `node tools/krinkle-video/render.js` | 3.5 min |
| Stills at chosen seconds | `node tools/krinkle-video/render.js --stills 7.6,14.6` | 30 s |
| A still every 3 s, on one sheet | `node tools/krinkle-video/render.js --sheet` | 15 s |

Stills go in `renders/v3/`. The app's state on each frame depends on every frame
before it, so a still is reached by running those frames too, without
screenshots. Set `DEBUG=1` to see why a frame waits more than 2 s.

Every run checks its own work and stops with an error if a check fails:

- Each click lands on the control it names.
- Each frame settles within 30 s.
- The frame after the last matches the first, within 8 levels in 255.

It also prints the app's state before each click: the colour scheme, the
zoom, the construction stage and the read-out. Use it to check the captions
against the app, such as the arm counts.

## Coupling with the app

`stage.js`, `stage.css` and `render.js` depend on these parts of the app.
After a change to any of them, render the sheet and check it.

- The ids in `app/tiles/krinkle/index.html`: `#presets` and the order of the
  presets in `tiling.js`, the k stepper, `#tab-tile`, `#tab-arrangement`,
  `#layout`, `#shape`, `#bend-zero`, `#scrub`, `#stage`, `#readout`,
  `#set-values`, `#value-m`, `#value-k`, `#value-t` and `#values-form`.
- In `engine/map.js`: `#zoom-out`, `#zoom-in`, `#turn-left`,
  `#random-colours`, `#scheme`, the colour dice's first two draws of
  `Math.random()`, the `krinkle-options-legend` storage key, and the two
  hook points `render.js` patches, shared with `tools/tiling-video/capture.js`.
- The map writes the address bar on a 300 ms timer, which `clock.js` leaves
  out of its count. A new timer of exactly 300 ms would be left out too.

## Music

The video is silent for now. A track of 24 bars of 4/4 at 128 BPM fits it
exactly, with no new render, and every click falls on a beat.
