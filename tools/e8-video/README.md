# E8 explorer video

## Summary

This tool renders the 30-second E8 Root System Explorer film for social
media. The output is a silent, captioned 1080 × 1080 H.264 video at 30 fps.
It uses the explorer's real roots, edges, Coxeter cycles and projection code.

## Render

Run these commands from the repository root. `CHROMIUM` can name Chrome or
Chromium when Playwright has no bundled browser.

```sh
CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node tools/e8-video/render.js --sheet
CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node tools/e8-video/render.js
```

The first command writes `stills/sheet.jpg`. The second writes `e8.mp4`.
Both outputs are ignored because they are generated delivery files.

## Files

- `timeline.js` controls every scene, projection and caption.
- `stage.html` draws the model at an exact frame time.
- `render.js` captures each frame and sends it to ffmpeg.
- `storyboard.md` describes the finished film.
