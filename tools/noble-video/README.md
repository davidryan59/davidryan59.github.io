# Noble Polyhedra video

## Summary

This tool renders the 30-second Noble Polyhedra Explorer film for social
media. The output is a silent, captioned 1080 × 1080 H.264 video at 30 fps.
It uses the explorer's model catalogue and reproduces its depth rendering,
palettes, lighting, textures and specialist views.

## Render

Run these commands from the repository root. They use the Playwright package
already installed for the tiling video.

```sh
NODE_PATH=tools/tiling-video/node_modules node tools/noble-video/render.js --sheet
NODE_PATH=tools/tiling-video/node_modules node tools/noble-video/render.js
```

The first command writes a contact sheet to `stills/sheet.jpg`. The second
writes `noble-polyhedra.mp4`. Set `CHROMIUM` when Playwright cannot find a
browser.

## Files

- `timeline.js` controls every scene and caption.
- `stage.html` draws the models and presentation at an exact frame time.
- `render.js` captures each frame and sends it to ffmpeg.
- `storyboard.md` describes the finished film.
