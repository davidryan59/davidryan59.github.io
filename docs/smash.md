# Smash Screen

## Summary

`app/smash/` shows a random device, a phone, tablet, laptop or monitor, with a
random picture on its screen, and a hammer that follows the pointer. A blow
breaks the screen the way a real LCD breaks: the glass cracks, black ink
spreads from the cracks, and whole rows of pixels light up in one bright
colour. The look comes from a photo of a shattered monitor that
[Austin Griffith posted on X](https://x.com/austingriffith/status/2103545545801556280),
and the page credits it. The builder page lists it under Apps & Websites,
after dice-to-seed. It is served at drbuild.uk/app/smash/, and the short address
drbuild.uk/smash redirects there.

## Files

| File | What it holds |
|---|---|
| `app/smash/index.html` | The page, its styles and the hammer, drawn in SVG |
| `app/smash/scenes.js` | The 14 pictures, drawn from shapes, and the seeded random generator |
| `app/smash/damage.js` | What one blow does to a screen, and how to draw it |
| `app/smash/smash.js` | Devices, layout, the view, input, the hammer's swing, sound and controls |
| `tools/smash/card.js` | Draws `social/smash.jpg`, the share card |
| `tools/thumbnails/smash.js` | Draws `assets/thumbs/smash.svg`, the builder page's animated picture, from the page's own damage model |

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
- **Stuck pixels.** Groups of fine lines, half a pixel to one and a half
  pixels thick, run across a sector from crack to edge. Most are horizontal
  on laptops and monitors; about half are vertical on phones and tablets.
  Some come in runs of two or three colours side by side, some glow less
  than others, and some break into dashes where only part of a row is
  stuck. They light up in the 'lighten' blend, so they glow on black and
  almost vanish on white, as in the photo. Some appear only where the black
  has spread. A few hard blows add one vertical line.
- **Strength.** The hammer rises while the press lasts, to 70 degrees after
  about 0.9 s, and trembles at the top. The height it reaches sets the blow.
  A quick click is a tap: it chips the glass and may kill a few pixels.
  Cracks to the edge and patches of ink need a longer hold; a black flood
  and the bright lines need a full swing. A blow on the bezel breaks the
  screen from its edge; a blow off the device only thuds. A device takes 40
  blows.

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
| First blow on a laptop, while the damage grows | 8.3 ms | 9.3 ms |
| Ten full-strength blows, about a second apart | 8.3 ms | 9.2 ms |
| A phone-sized page, one blow on a tablet | 8.3 ms | 9.2 ms |

Across the ten full blows one frame took 0.19 s: the first press, when the
browser starts its audio. No blow itself slowed a frame past 55 ms. Zooming
to 8× after eleven blows raised no task over 50 ms. Once the damage has
settled the page requests no frames at all, so it uses no CPU at rest.

## Controls

- Click or tap to swing: press lifts the hammer, release strikes. Hold
  longer for a harder blow.
- The Help! Give me a new device button, top right, brings a new device
  and picture.
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

It draws the card in the style of the site's other cards: one full-bleed
picture, no text. The white article about glass fills the frame, two
full-strength blows break its right half, and the page's hammer is raised
over the second. It uses the page's own drawing code, and the blows come
from fixed seeds, 5 and 30, so the card redraws exactly. Pass two other
seeds to try another. It saves `social/smash.jpg` at 1200 × 630, under
300 KB.
