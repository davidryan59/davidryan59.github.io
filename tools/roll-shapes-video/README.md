# Rolling Shapes video

Renders the 45-second looping video of Rolling Shapes, for posting on social media:
1080 × 1080, 60 fps, silent, dark, with captions. The last frame matches the first.
[storyboard.md](storyboard.md) says what happens in each section.

## How it fits together

- `timeline.js` holds every scene, slider, pen, layer and caption, in plain seconds.
  Each frame is a pure function of its time, so a still at any second costs one frame.
- `stage.html` draws one frame with the app's own engine, from `app/roll-shapes/`. It
  draws the slider and the pointer itself, since the picture fills the frame.
- `render.js` steps the stage through every frame in headless Chromium and pipes the
  screenshots to ffmpeg.
- `check.js` confirms that the app would draw every setting on screen with the formula,
  so nothing in the video would tumble for a visitor, and that the loop joins.

## Render

Run from the repo root. It needs ffmpeg and the Playwright install in
`tools/tiling-video/`. `CHROMIUM` names a browser binary.

| Output | Command |
|---|---|
| The check | `node tools/roll-shapes-video/check.js` |
| The video | `node tools/roll-shapes-video/render.js [out.mp4]` |
| Numbered stills | `node tools/roll-shapes-video/render.js --sheet 0 2.5 5.5` |

Output goes to `renders/`, which git ignores. Name each new version
`rolling-shapes-v2.mp4` and so on.
