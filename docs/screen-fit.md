# Screen fit: how a game or app uses the screen

## Summary

A player gives a game the whole window, so the game should use it. The play
area should be large and clear on a 27-inch monitor, a laptop, an iPad either
way round, and a phone either way round. These rules come from a review of
four games on 2026-10-01: Pentrys, Smash Screen, Dino Dash and Sonic "The
Asteroids". Between them they showed every fault listed here. Follow the rules
for every new game or app, and run the check below before it ships.

## Checklist

- [ ] The play area fits the space both ways, and nothing is cut off
- [ ] It grows with the window, with no low fixed size or cap
- [ ] It keeps its shape at every size
- [ ] The layout reads the page's size, not `window.innerWidth`
- [ ] Touch controls show on every touch screen, whatever its width
- [ ] There is a layout for a keyboard, for touch held upright and for touch held sideways
- [ ] On a phone, the play area, the scores and the controls all fit on the first screen
- [ ] The scores and bars stay in proportion as the play area grows
- [ ] A full-screen button shows where the browser supports it
- [ ] Panels taller than their box scroll from the top
- [ ] The layout follows a turn of the device
- [ ] `tools/screen-fit/check.js` passes at all six sizes

## Rules

### Size

- **Fit both ways.** Scale the play area by
  `min(availableWidth / worldWidth, availableHeight / worldHeight)`, and
  centre it. Sonic scaled by width alone, so a wide window cut off the bottom
  of its world: 16% on a laptop and 70% on a phone held sideways.
- **Grow with the window.** Measure the space and fill it. Dino Dash drew a
  fixed 532 x 420 canvas, which filled 7% of a monitor. Pentrys capped its
  squares at 42 px and Smash Screen capped its stage at 1200 x 800, so both
  left most of a monitor empty. A cap, if any, belongs far above a laptop's
  size: Pentrys now stops at 72 px squares.
- **Aim high.** On a computer, the play area should fill 75% or more of the
  window's width or of its height, whichever runs out first. Reference text,
  such as rules and credits, goes below the play area, where it may scroll.
- **Keep the shape.** Set one dimension and let the other follow, or compute
  both from one scale. Dino Dash fixed its height while `max-width: 100%`
  shrank its width, so a phone stretched the maze 1.5 times.
- **Keep a fixed world in its own units.** Draw in the game's own units and
  scale the canvas transform. Game logic, speeds and hit sizes then never
  change with the screen.

### Measuring

- **Read the page's size.** Use `document.documentElement.clientWidth` and
  `clientHeight`. On a phone, `window.innerWidth` grows with any content wider
  than the screen. A layout sized from it then grows the content, and never
  shrinks back. Pentrys rendered 531 px wide on a 393 px phone this way.
- **Use the small viewport for heights.** `100svh` or `100dvh`, with `100vh`
  first as the fallback. The phone's toolbars then never cover the controls.
- **Fit a fixed shape with a container query.** A wrapper with
  `container-type: size` and a box of
  `width: min(100cqw, 100cqh * 4 / 3); aspect-ratio: 4 / 3` gives the largest
  4:3 box that fits the space left over.

### Layouts

Plan three layouts, and choose between them by input and shape, not by width
alone.

| Layout | When | Arrangement |
| --- | --- | --- |
| Keyboard | A fine pointer | Play area as large as the window allows, scores beside or above it, keys listed |
| Touch, upright | A coarse pointer, height ≥ width, or any window 640 px wide or less | Scores in one compact row, the play area, the touch buttons at the bottom |
| Touch, sideways | A coarse pointer, width > height | Play area the full height in the middle, buttons in the side columns or bottom corners, scores in a side column |

- **Show touch controls by input.** Use `(pointer: coarse)`. Pentrys showed
  its buttons only below 640 px wide, so an iPad, or a phone turned sideways,
  had no way to play.
- **Put the thumbs where they rest.** Held sideways, moves go under the left
  thumb and actions under the right, at the screen's edges. Keep the same
  split as the upright layout, so a player who turns the phone finds each
  button on the same side.
- **Respect the notch.** Pad side columns with `env(safe-area-inset-left)`
  and `env(safe-area-inset-right)`.
- **Hide what a short screen has no room for.** A phone held sideways is
  about 340 px tall. Drop the tagline, the back link and the less important
  scores there, and keep the title small.

### Proportion

- **Scale the scores with the play area.** On a monitor, Pentrys zooms its
  score panel with the well, up to 1.6 times.
- **Cap long bars.** Smash Screen's health bars stop at 1300 px across, so a
  full-width stage on a monitor does not stretch them.

### Full screen

- Offer a button that calls `requestFullscreen()` on
  `document.documentElement`, so the existing layout grows to fill the screen.
- Show it only where `document.fullscreenEnabled` (or the `webkit` form) is
  true. An iPhone has no full-screen mode for a page; a home-screen web app
  is the way to full screen there.
- On a keyboard game, give it the F key, unless F already does something.
- Blur the button after a click. Otherwise Space, often a game key, presses
  it again.
- Ignore the promise's rejection: a browser may refuse.

### Panels and turning

- **Scroll a tall panel from its top.** Write `justify-content: center`
  followed by `justify-content: safe center` on a centred flex panel with
  `overflow: auto`. Plain centring cut the top off Smash Screen's title on a
  phone.
- **Lay out again on every resize.** A turn of the device fires `resize`.
  Recompute everything derived from the layout, such as the room kept for a
  toolbar, not only the canvas size.

## Checking

Run the checker against a local server or the live site, at all six sizes:

```sh
node tools/screen-fit/check.js <url> <play-area> [--start <selector>] [--controls <selector>]
```

| Size | Window in CSS pixels | Stands for |
| --- | --- | --- |
| monitor | 2560 x 1300, mouse | A 27-inch 5K monitor, browser maximised |
| laptop | 1728 x 990, mouse | A 16-inch MacBook Pro, browser maximised |
| ipad-upright | 820 x 1106, touch | An iPad in Safari, upright |
| ipad-sideways | 1180 x 750, touch | An iPad in Safari, sideways |
| phone-upright | 393 x 659, touch | An iPhone in Safari, upright |
| phone-sideways | 852 x 340, touch | An iPhone in Safari, sideways |

It flags a page that scrolls sideways, a play area partly off the screen, a
play area under 70% of both the width and the height, and touch controls that
are missing on a touch screen. It saves a screenshot of each size: look at
them, since the checker cannot see inside a canvas. A world cut off inside
its own canvas, as Sonic's was, shows only in the pictures.

The four games as checked:

```sh
node tools/screen-fit/check.js http://localhost:8000/app/pentrys/ '#board' --start '[data-mode="marathon"]' --controls '#pad button'
node tools/screen-fit/check.js http://localhost:8000/app/smash/ '#stage' --start '#play-anger'
node tools/screen-fit/check.js https://pacman-dino-dash.netlify.app/ '#game' --start '#ov-buttons button' --controls '.pad button'
node tools/screen-fit/check.js https://sonic-the-asteroids.netlify.app/ 'canvas#game' --controls '.touch button'
```

The emulator stands in for a real device, and is close but not exact. Try a
new game on a real phone and a real iPad before calling it done.
