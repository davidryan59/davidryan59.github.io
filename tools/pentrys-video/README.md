# Pentrys film

## Summary

This tool renders a silent 30-second film of Pentrys for social media: 1080 × 1080
H.264 at 60 fps, in the dark theme. The game's own rules and drawing code make every
frame on a scripted clock. The film shows the well alone. It lays the side panel's
celebrations over the well, and it adds a camera, slow motion, wipes and particle
effects. It adds no game rule.

## Render

Run these commands from the repository root. `CHROMIUM` can name a browser binary.

```sh
node tools/pentrys-video/render.js --log           # events, and the odds shown on screen
node tools/pentrys-video/render.js --sheet         # renders/sheet.jpg, 24 frames
node tools/pentrys-video/render.js --stills 3.6,26.9
node tools/pentrys-video/render.js                 # renders/pentrys-v1.mp4
```

## Files

- `film.js` holds the sections, the camera, the effects and the captions.
- `odds.js` holds the special-square odds for the natural play section.
- `seed.js` searches for a play seed whose stretch matches those odds.
- `stage.html` loads the game's scripts and the film.
- `render.js` captures each frame and sends it to ffmpeg.
- `storyboard.md` lists the sections.
