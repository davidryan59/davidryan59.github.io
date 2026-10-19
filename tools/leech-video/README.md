# Leech explorer video

Renders the 42-second looping video of the Leech Lattice Explorer:
1440 × 1080 (4:3), 30 fps, dark theme, silent, with captions. The last frame
flows into the first. The video is the real app page, `app/leech/`, driven
by a real mouse on a scripted clock, so it always shows the app as it is.
[storyboard.md](storyboard.md) says what happens in each section.

## How it fits together

- `timeline.js` – the single source of timing, in plain seconds: every
  pointer move, click and caption, the outro fade, and the version, which
  names the outputs.
- `clock.js` – runs before the app's own scripts. It replaces
  `performance.now()` and `requestAnimationFrame`, so the app draws each
  frame at an exact time.
- `stage.css` – hides the top bar, folds the Look card to its colour buttons
  and legend, moves the Options card below the address, and styles the
  captions, the address and the pointer.
- `stage.js` – opens every scene group, says where the pointer is and
  whether its button is down on each frame, runs the app's animation frame,
  and draws the captions, the pointer and the outro.
- `render.js` – serves this repo locally, opens the app in headless
  Chromium in the dark theme with the details panel collapsed, moves the
  real mouse frame by frame, and pipes the screenshots to ffmpeg. Output:
  `renders/leech-v1.mp4`, silent. Stills and the loop check go in
  `renders/v1/`. Raise the version in `timeline.js` before rendering a new
  one, and keep the old ones.

The app turns each new plane to keep a scene change short, so the return to
36-fold can land at a slight angle, and a ball selected by Seven layers
stays marked. The outro covers both: a still of the first frame fades in
over the last second.

## Render

Run from the repo root. It needs Node, ffmpeg, and the `playwright-core`
installed in `tools/tiling-video/`. Without Playwright's own Chromium, it
uses Chrome.

| Output | Command | Time |
|---|---|---|
| The video | `node tools/leech-video/render.js` | about 1 min |
| Numbered stills, on contact sheets of 12 | `node tools/leech-video/render.js --stills 0,7.6,14.6` | 15 s |

The app's state on each frame depends on every frame before it, so a still
is reached by running those frames too, without screenshots.

Every run checks its own work and stops with an error if a check fails:

- Each click lands on the control it names.
- The frame after the last matches the first, within 8 levels in 255.

It also prints the app's state before each click: the scene, the colour,
the window, the octad, the renderer and the status line. Use it to check
the captions against the app.

## Coupling with the app

`stage.js`, `stage.css` and `render.js` depend on these parts of the app.
After a change to any of them, render the stills and check them.

- In `app/leech/index.html`: `#step`, `#next-octad`, `[data-colour]`, the
  card classes `.show-card`, `.options-card`, `.look-card`, `.topbar` and
  `.hover-card`, and the Look card's `.colour-options` and `.legend`.
- In `viewer.js`: the scene buttons `.scene-button[data-scene]`, the group
  headings `.scene-group-heading[data-group]`, the `ct` address field, the
  `leech-details-open-wide` storage key, `window.__leechExplorer.snapshot()`,
  and the fixed 4 s of Next E8.
- `viewer.js` reads the time only from `performance.now()` and its
  animation frames.
