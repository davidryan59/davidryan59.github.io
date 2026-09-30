# Sieve video

Renders the 30-second looping video of the sieve app, for posting on social
media: 1080 × 1080, 60 fps, silent, with captions. The last frame flows into
the first. The video shows the real board from `app/sieve/`, drawn frame by
frame, so it always shows the app as it is. [storyboard.md](storyboard.md)
says what happens on each beat.

## How it fits together

- `timeline.js` – the single source of timing: 128 BPM, 64 beats, and every
  click, pointer move, camera move and caption on them. Music written for the
  video can follow it.
- `stage.html` – draws one frame at a time. It loads `app/sieve/model.js` and
  `board.js`, sets the board's clock for the frame, places the camera, moves
  the pointer, and draws the toolbar and the captions.
- `render.js` – serves this repo locally, steps `stage.html` through every
  frame in headless Chromium, and pipes the screenshots to ffmpeg. Output:
  `sieve.mp4`, silent.

## Render

Run from the repo root. It needs Node, ffmpeg, and Playwright with a Chromium.
With only `playwright-core` installed, as in `tools/tiling-video/`, set
`NODE_PATH` as below. Without Playwright's own Chromium, it uses Chrome.

| Output | Command | Time |
|---|---|---|
| The video | `NODE_PATH=tools/tiling-video/node_modules node tools/sieve-video/render.js` | 2.5 min |
| Stills at chosen seconds | `NODE_PATH=... node tools/sieve-video/render.js --stills 2.5,9,20` | 2 s |
| A still every 1.5 s, on one sheet | `NODE_PATH=... node tools/sieve-video/render.js --sheet` | 5 s |

Stills go in `stills/`. The board's motion depends on every frame before it,
so a still is reached by drawing those frames too, without screenshots.

At the end, the script lists each beat where the pointer came to rest on a
chosen number, which dims the rest of the board. Only beats 51 to 55,
pointing at 4, are meant. Any other entry means a pointer path crosses a
chosen number: bend it with a fourth entry in `MOVES`.

## Coupling with the app

`stage.html` replaces three drawing methods of `Sieve.Board` for the video:

- `clamp`, so the camera can place the view anywhere
- `snap`, so tiles under 6 px keep their exact size
- `renderPixels`, so a zoom through those tiles glides instead of stepping

It also calls `choose`, `clear`, `kindOf`, `changed`, `setWidth`, `pressOn`,
`release`, `setHover`, `numberAt` and `render`. After a change to any of
these in `board.js` or `model.js`, render the sheet and check it.

## Music

The video is silent for now. A track of 16 bars of 4/4 at 128 BPM fits it
exactly, with no new render. [storyboard.md](storyboard.md) gives the bar and
beat of every click. Export the track from bar 1, and run it a bar past the
end so it carries the reverb tail. The tiling video's music tools do the rest
([tools/tiling-video/README.md](../tiling-video/README.md)):

- `music/loop_export.py` folds the tail over the start and sets the level. It
  reads the loop's length from the tiling video's timeline, so it must be
  pointed at this one first.
- `deliver.py` adds the music to `sieve.mp4` without encoding the picture
  again, and checks the audio for distortion.
- `loop_trim.py` makes copies that end a few frames early, for X's player,
  which pauses at the loop join. At 60 fps, the 100 ms trim chosen for the
  tiling video is 6 frames.

A track at another tempo changes the video's length: set `BPM` in
`timeline.js` and render again. Every event keeps its beat, so at 120 BPM
the video is 32 s.
