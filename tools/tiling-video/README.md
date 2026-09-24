# Tiling video

Renders the 45-second looping video of the tiling explorer, for posting on
social media: 1080 × 1080, 30 fps, with captions and a just-intonation
soundtrack. The last frame flows into the first. The scripts capture the real
Hat and Spectre pages frame by frame, so the video always shows the explorer
as it is. [storyboard.md](storyboard.md) says what happens on each beat.

## How it fits together

- `timeline.js` — the single source of timing: 80 BPM, 60 beats, the shape,
  colours, edges and zoom on each beat, and the caption text. The capture, the
  captions and the music all read it.
- `look.json` — how the tiling looks: zoom, pan speed, dice seeds, and the
  Spectre's palette and edge heights.
- `capture.js` — the tiling layer. It serves this repo locally and adds a
  small hook to the served copy of `demos/engine/map.js`, so it can place the
  camera exactly and wait until every chunk in view is drawn. Output:
  `frames/hat/` and `frames/spectre/`.
- `overlay/` — the caption layer. `overlay.html` draws the captions, the
  shape slider, the labels and the watermark for any frame. `render.js` saves
  them as transparent PNGs in `overlay/frames/`. `contact.js` builds a sheet
  of sample frames over busy, white and black backgrounds.
- `music/compose.py` — the soundtrack, built on justsynth from
  [daily-python-music](https://github.com/davidryan59/daily-python-music).
  Output: `music/tiling-loop.wav`. [music/notes.md](music/notes.md) explains
  the tuning and the design.
- `compose.py` — the final mix. It blends the two pages at the crossfades,
  lays the captions on top and adds the music. Output: `tiling-explorer.mp4`.

## Setup

- Node 18 or later, Python 3 with numpy and Pillow, and ffmpeg.
- Run `npm install` here. It installs playwright-core, which has no browser
  of its own: set `CHROMIUM` to a Chromium binary, or run
  `npx playwright@1.57.0 install chromium` once.
- For the music, clone daily-python-music beside this repo and set up its
  `.venv`. Set `JUSTSYNTH_REPO` if it lives somewhere else.

## Render

Run each step from this folder. Times are from an Apple silicon Mac.

| Step | Command | Time |
|---|---|---|
| Tiling, Hat | `node capture.js hat` | 3.5 min |
| Tiling, Spectre | `node capture.js spectre` | 3 min |
| Captions | `node overlay/render.js` | 30 s |
| Music | `cd music && ../../../../daily-python-music/.venv/bin/python compose.py` | 20 s |
| Final mix | `python3 compose.py music/tiling-loop.wav` | 1 min |

- The two captures can run at the same time.
- A capture overwrites its frames. After a crash, add `--resume` to keep the
  frames already taken.
- `node capture.js probe` renders test stills into `probe/` and prints each
  Spectre edge shape's collision limit. Use it when tuning `look.json`.

## After a change

| Change | Rerun |
|---|---|
| Caption text or timing, labels, watermark | Captions, final mix |
| Colours, zoom, pan speed or edge heights | The capture of each page it touches, final mix |
| The time of an event | Everything. `music/compose.py` keeps its own copy of the accent beats and `ZOOM_FAR`, so update those too |
| The music | Music, final mix |

The music script checks its copy of the timeline's curves against
`timeline.js` and stops if they differ.

## Coupling with the explorer

`capture.js` hooks two lines of `demos/engine/map.js`:
`statusEl.hidden = missing === 0;` in the draw loop, and the `return map;` at
the end of `start()`. If either changes, the capture stops with "hook points
not found". Update `patch()` in `capture.js` to match.
