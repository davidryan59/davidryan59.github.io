# Hyperbolic Models Explorer video

Renders a 30-second looping video of the Hyperbolic Models Explorer,
version 4: 1080 × 1080, 30 fps, light theme, silent, with captions. The
video is the real app page, `app/hyperbolic/`, driven by a real mouse on a
scripted clock, so it always shows the app as it is. The last frame flows
into the first. [storyboard.md](storyboard.md) says what happens when.

## How it fits together

- `timeline.js` – the single source of timing, in seconds: every model
  change, view glide, pointer move, drag and caption, and the version,
  which names the outputs.
- `clock.js` – runs before the app's own scripts. It replaces
  `performance.now()` and `requestAnimationFrame`, so the app draws each
  frame at an exact time. The drag's glide after release reads this clock
  too, so it runs the same way on every render.
- `stage.css` – hides the app's cards, or all but the model card in 4:3,
  and styles the captions, the address and the pointer, in either theme.
- `stage.js` – says where the pointer is and whether its button is down on
  each frame, makes the model changes and view glides through the app's
  `window.Hyper`, runs the app's animation frame, and draws the captions
  and the pointer.
- `render.js` – serves this repo locally, opens the app in headless
  Chromium, moves the real mouse frame by frame, and pipes the screenshots
  to ffmpeg. Output: `renders/hyperbolic-v4.mp4`, silent. Stills, the
  review page and the loop check go in `renders/v4/`. Earlier versions
  stay beside it. Raise the version in `timeline.js` before a new render.

A change of model crossfades: `render.js` takes a still of the frame before
the change, and the stage fades it out over the new model. The last change
returns to the app's home view through `Hyper.resetView()`, the exact state
the app opens in, so the loop's join matches to the pixel.

## Render

Run from the repo root. It needs Node, ffmpeg, and the `playwright-core`
installed in `tools/tiling-video/`. Without Playwright's own Chromium, it
uses Chrome.

| Output | Command | Time |
|---|---|---|
| The video | `node tools/hyperbolic-video/render.js` | about 2 min |
| Stills at chosen seconds | `node tools/hyperbolic-video/render.js --stills 7.6,14.6` | 15 s |
| The review page | `node tools/hyperbolic-video/render.js --review` | 30 s |
| The pointer pages | `node tools/hyperbolic-video/render.js --paths` | 15 s |
| The video the motion page plays | `node tools/hyperbolic-video/render.js --preview` | 3 min |

Check the motion before the final render. `live.html` is the main check:
it runs the real explorer and drags it along each path in real time. Serve
the repo root on port 8765 and open
`http://localhost:8765/tools/hyperbolic-video/live.html`. The two pages
below are older and slower to use. `paths.html` animates each
drag's pointer over a still, with a speed graph. `animate.html` loops each
drag's part of `preview.mp4`, so the plane can be seen moving.

`SHAPE=wide` films 4:3 (1440 × 1080) with the model card showing, and
`THEME=dark` uses the dark theme. The review page,
`renders/<version>/stills.html`, shows one moment in all four, then the script's
stills in the square light version.

Every run that reaches the end checks the loop: the frame after the last
must match the first, within 8 levels in 255.

## Coupling with the app

`stage.js`, `stage.css` and `render.js` depend on these parts of the app.
After a change to any of them, render the review page and check it.

- `window.Hyper` in `app/hyperbolic/hyperbolic.js`: `state`, `setModel`,
  `resetView`, `setT`, `step`, `mul` and `invalidate`.
- The model ids in `MODELS`, and the drag on `#view`, with its glide after
  release.
- The card classes in `app/hyperbolic/index.html`: `.card.title`,
  `.card.options`, `.card.colours`, `.card.motion`, `.card.about`,
  `.card.fail` and `.title-tools`.
- The `theme` storage key in `assets/theme.js`.
