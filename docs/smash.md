# Smash a screen

## Summary

`smash/` shows a random device, a phone, tablet, laptop or monitor, with a
random picture on its screen, and a hammer that follows the pointer. A blow
breaks the screen the way a real LCD breaks: the glass cracks, black ink
spreads from the cracks, and whole rows of pixels light up in one bright
colour. The look comes from a photo of a shattered monitor that
[Austin Griffith posted on X](https://x.com/austingriffith/status/2103545545801556280),
and the page credits it. It is not yet linked from the builder page.

## Files

| File | What it holds |
|---|---|
| `smash/index.html` | The page, its styles and the hammer, drawn in SVG |
| `smash/scenes.js` | The 14 pictures, drawn from shapes, and the seeded random generator |
| `smash/damage.js` | What one blow does to a screen, and how to draw it |
| `smash/smash.js` | Devices, layout, the view, input, the hammer's swing, sound and controls |
| `tools/smash/card.js` | Draws `social/smash.jpg`, the share card |

## Pictures

Every picture is drawn in the page, so each one is safe for any audience
and needs no download: a mountain sunset, the northern lights, a beach, a
coral reef, a ringed planet, a synthwave sunset, a pixel-art game, a
cartoon cat and a TV test card on any device; home and lock screens on
phones and tablets; a code editor and a spreadsheet on laptops and
monitors; and a white article about glass on tablets, laptops and
monitors, like the page on the monitor in the photo. Clocks and dates show
the visitor's own time. A picture never repeats within five devices.

A scene draws in screen units, where the short side of the screen is 1000
units long, and draws the same picture from the same seed every time,
because the page redraws it whenever the view changes.

## How a blow breaks the screen

- **Cracks.** Three to nine long cracks run from the impact, turning a
  little at every step, with a slowly drifting bend, so they curve like
  real glass. Most reach the edge; a few stop short, and some branch.
  Phones, tablets and some laptops add rings between neighbouring cracks, a
  spider web. A
  burst of short cracks, a crushed crater and specks of glitter mark the
  impact. Some long cracks are a band of shattered glass, drawn as a dotted
  ribbon.
- **Sectors.** The cracks that reach the edge cut the screen into sectors.
  Each sector has a fate: it floods black from the impact, bleeds black in
  from its cracks and edges, or stays alive. One bleed in eight is white
  instead, as when the backlight shows through. The first blow on a screen
  leaves at least half of it alive.
- **Black ink.** Each patch is a blob whose radius varies smoothly with
  angle. It grows over one to four seconds, faster in some directions than
  others, and is clipped to its sector, so it stops sharp at a crack. A
  fringe of short coloured spikes, in the direction of the nearest pixel
  row or column, marks its soft edge.
- **Stuck pixels.** Groups of lines, one to three pixels thick, run across a
  sector from crack to edge. Most are horizontal on laptops and monitors;
  about half are vertical on phones and tablets. They light up in the 'lighten' blend, so
  they glow on black and almost vanish on white, as in the photo. Some
  appear only where the black has spread. A few blows add one vertical line.
- **Strength.** Holding the press longer lands a harder blow, with more
  cracks and bigger patches. A blow on the bezel breaks the screen from its
  edge; a blow off the device only thuds. A device takes 40 blows.

## Drawing and cost

Everything is vector and drawn in screen units, so the page redraws it
sharply at any zoom. Two offscreen canvases hold everything that has
settled: one has the device, the picture and the finished damage, the other
the finished cracks. A frame copies both and draws only the damage still
growing. The canvas never draws at more than twice the CSS pixel size.

Zoom, from 1× to 8×, uses the scroll wheel, a trackpad or touch pinch, the
+ and − buttons, or the keys. During a gesture the page stretches the two
cached canvases, and it redraws them sharp once the gesture has rested for
0.15 seconds. Once one screen pixel spans four device pixels, the red,
green and blue subpixels show.

Measured in headless Chromium without a GPU, at twice the pixel density:

| Case | Frame time, median | 95th percentile |
|---|---|---|
| First blow on a laptop, while the damage grows | 8.3 ms | 9.1 ms |
| Ten blows in quick succession | 9.2 ms | 12.8 ms |
| A phone-sized page, one blow on a tablet | 8.3 ms | 9.4 ms |

Zooming to 8× after eleven blows raised no task over 50 ms. Once the damage
has settled the page requests no frames at all, so it uses no CPU at rest.

## Controls

- Click or tap to swing: press lifts the hammer, release strikes.
- Scroll, pinch, or − and + zoom in towards the last blow; drag moves the
  view when zoomed in.
- Keys, with the stage focused: the arrows aim, Space or Enter swings, + and
  − zoom, 0 shows the whole device. Anywhere on the page: N for a new
  device, M for sound.
- Sound is synthesised in the browser: a thud, then for glass a snap, a
  crackle and a few high pings. The mute choice is remembered.
- With reduced motion set, the device does not shake and the impact does not
  flash.

The address can ask for a device, picture, orientation and seed, as in
`#device=laptop&scene=synthwave&seed=42` or
`#device=tablet&scene=lock&orient=landscape`. Scene ids are listed at the end
of `scenes.js`.

## Share card

```sh
node tools/smash/card.js
```

It lands two random blows on a monitor showing the article and saves
`social/smash.jpg` at 1200 × 630, under 300 KB. Every run differs, so run
it a few times and keep the best. The current card was the best of four.
