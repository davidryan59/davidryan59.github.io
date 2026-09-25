# Tiling video

Renders the 48.8-second looping video of the tiling explorer, for posting on
social media: 1080 × 1080, 30 fps, with captions and a just-intonation
soundtrack, David's own track, mixed by him in Ableton. The last frame flows into the first. The scripts capture the real
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
- `music/` — the soundtrack. David exports his own mix from Ableton at the
  timeline's tempo. `loop_export.py` folds the export's reverb tail over its
  start, sets the level and writes `music/tiling-loop.wav`.
  [music/notes.md](music/notes.md) describes the track. Two earlier
  soundtracks are kept for reference, and each also writes
  `music/tiling-loop.wav`: `compose.py` arranged sections of his first set
  on synth sounds, from `sections.json`, which `read_ableton.py` fills
  ([music/compose-notes.md](music/compose-notes.md)). `house.py` is the
  tropical house track before it, on the 45 s timeline.
- `compose.py` — the picture. It blends the two pages at the crossfades and
  lays the captions on top. Output: `tiling-explorer.mp4`, silent.
- `deliver.py` — adds the music to the picture, makes a two-loop MP3 to
  listen to, and runs `check_audio.py` on both.
- `loop_trim.py` — makes loop candidates for players that pause at the loop
  join, such as X's. Each one ends a few frames early, with audio exactly as
  long as the picture and short fades at the join. The posted video is trim 3.
- `check_audio.py` — checks finished audio for distortion as a listener gets
  it: clipped samples, true peak, clicks, sub-bass, and with `--master`,
  sync and the encoder's error at the start and end of the file.

## Setup

- Node 18 or later, Python 3 with numpy and Pillow, and ffmpeg.
- Run `npm install` here. It installs playwright-core, which has no browser
  of its own: set `CHROMIUM` to a Chromium binary, or run
  `npx playwright@1.57.0 install chromium` once.
- For the earlier synthesised music, `music/compose.py`, clone
  daily-python-music beside this repo and set up its `.venv`. Set
  `JUSTSYNTH_REPO` if it lives somewhere else.

## Render

Run each step from this folder. Times are from an Apple silicon Mac.

| Step | Command | Time |
|---|---|---|
| Tiling, Hat | `node capture.js hat` | 3 min |
| Tiling, Spectre | `node capture.js spectre` | 4 min |
| Captions | `node overlay/render.js` | 30 s |
| Music | `python3 music/loop_export.py EXPORT.wav` | 5 s |
| Picture | `python3 compose.py` | 1 min |
| Delivery and checks | `python3 deliver.py tiling-explorer.mp4 music/tiling-loop.wav out.mp4 out.mp3` | 10 s |
| Loop candidates for X | `python3 loop_trim.py tiling-explorer.mp4 music/tiling-loop.wav out 2 3 4` | 1 min each |

- The two captures can run at the same time.
- A capture overwrites its frames. After a crash, add `--resume` to keep the
  frames already taken.
- `node capture.js probe` renders test stills into `probe/` and prints each
  Spectre edge shape's collision limit. Use it when tuning `look.json`.

## After a change

| Change | Rerun |
|---|---|
| David's mix in Ableton | A new export, then music, delivery |
| Caption text or timing, labels, watermark | Captions, picture, delivery |
| Colours, zoom, pan speed or edge heights | The capture of each page it touches, picture, delivery |
| The time of an event | The captures, captions, picture, delivery. Keep shape moves and colour changes on music beats, multiples of 0.625 video beats |
| The tempo | `LOOP_SECONDS` in `timeline.js`, then everything, with the music exported at the new `MUSIC_BPM` |
| The music | Music, delivery |

Deliver only files that pass `check_audio.py`. Check the MP3 and MP4 that get
shared, not only the WAV: lossy encoding can add peaks and clicks the master
does not have.

`loop_export.py` reads the loop's length and tempo from `timeline.js`, and
stops if the export's music does not end where the loop does, which is the
sign of an export at the wrong tempo.

A change to the music needs only the music and delivery steps: delivery
copies the picture across without re-encoding it.

## Coupling with the explorer

`capture.js` hooks two lines of `demos/engine/map.js`:
`statusEl.hidden = missing === 0;` in the draw loop, and the `return map;` at
the end of `start()`. If either changes, the capture stops with "hook points
not found". Update `patch()` in `capture.js` to match.
