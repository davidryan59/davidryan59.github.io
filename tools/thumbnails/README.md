# Thumbnails

The builder page shows a 120 px picture beside most of its entries. The two
NFT pictures are the artworks themselves. Nifty Ink's is a crop of a screenshot of one piece, `assets/thumbs/nifty-ink.jpg`. The other pictures live in `assets/thumbs/`,
and one script here draws each of them, except the four audits, which share `audits.js`. The scripts need only Node. Each
prints the file it wrote and the file's size. Rerun a script after you change
it, then check the result with `frames.js`.

| Picture | Script | What it shows |
|---|---|---|
| `assets/thumbs/tiling-explorer.svg` | `tiling-explorer.js` | A patch of the Hat tiling that morphs from chevron to comet and back on a 10 s loop: 0.5 s still, 4.5 s sliding, each way. Light-mode Pastel colours, drawn from the explorer's own engine in `app/tiles/` |
| `assets/thumbs/aperiodic-pairs.svg` | `aperiodic-pairs.js` | Penrose kites and darts in the gallery's light colours, zooming in and out about the central sun over 7 s |
| `assets/thumbs/dice-to-seed.svg` | `dice-to-seed.js` | Six red dice thrown into the corner of a craps table. They settle, rest and fade on an 11 s loop |
| `assets/thumbs/pentrys.svg` | `pentrys.js` | A still: a glowing X falls above a stack of six pieces in a dark well. The colours and lighting are the game's own, from `app/pentrys/pieces.js` and `app/pentrys/draw.js` |
| `assets/thumbs/smash.svg` | `smash.js` | A monitor showing a white web page takes a hammer blow: cracks, black ink, then lines of stuck pixels, and back to whole on an 8 s loop. The damage is the page's own, from `app/smash/damage.js` with seed 7 |
| `assets/thumbs/sieve.svg` | `sieve.js` | A hundred square, 0 to 99. 2, 3, 5 and 7 are chosen in turn and their multiples turn pale, until only primes stay grey, then it fades back on an 8 s loop. The rules and colours are the page's own, from `app/sieve/model.js` |
| `assets/thumbs/retuner.svg` | `retuner.js` | The left half of ReTuner's keyboard. The note keys breathe and the octave rings turn, slowly |
| `assets/thumbs/dino-dash.svg` | `dino-dash.js` | A lap of a Dino Dash maze on a 6.4 s loop: coins, the "Yay!" at the tenth, a dinosaur, a cat and an eagle |
| `assets/thumbs/sonic-asteroids.svg` | `sonic-asteroids.js` | Sonic fires rings at a Mario head, which bursts into two Luigis, on a 6 s loop |
| `assets/thumbs/highlight-buffs.svg` | `highlight-buffs.js` | A still: the plugin's seven ring colours round planets on a Dark Forest map |
| `assets/thumbs/weth9.svg`, `uniswap-v2.svg`, `dai.svg`, `permit2.svg` | `audits.js` | Stills of the diagrams on each audit's social card in `tools/social-cards/cards.html`, cut down to what reads at 120 px: ETH and WETH with arrows, the x·y=k curve, the price band round $1, and signers split 83% and 17% |
| `assets/thumbs/polygonal-spectre.svg` | `polygonal-spectre.js` | A still of the paper's default tile, p = 29/50 and h = 13/50, with the plain Spectre dashed beneath. Built as in `papers/verify-polygonal-spectre.py` |
| `assets/thumbs/rcn.svg` | `rcn.js` | A still: C4 D4 E'4 G4 on a staff, with the numeric accidental 5 before E'4 |
| `assets/thumbs/harmony.svg` | `harmony.js` | A still: the divisors of 60 as tiles, with the major triad 4:5:6 in blue and the minor triad 10:12:15 in red |

Run any of them from anywhere, for example `node tools/thumbnails/dino-dash.js`.

## Notes

- The page clips the tilings, ReTuner and Highlight Buffs to a circle, like
  the NFT artworks. It shows the dice, Pentrys, Smash Screen, the sieve and the two games as rounded squares:
  `.thumb-link.square` in `index.html`.
- The game pictures use each game's own colours and sprites, ported from its
  repo. The ReTuner keys are measured from a screenshot of the live app.
- The dice come from a small rigid-body simulation. The script defaults to
  seed 334. `node tools/thumbnails/dice-to-seed.js --search` tries 400 throws
  and lists the good ones, where every die lands flat, apart from the others
  and in view. Pass a seed to draw another throw.
- The dice faces animate with CSS keyframes, each written as translate,
  rotate, skewX and scale. Keep that form. Browsers blend two `matrix()`
  keyframes by taking each matrix apart, and a face nearly edge-on then
  smears across the picture for a frame.
- The other pictures animate with SMIL. SMIL and CSS animations both run
  inside an `<img>` in every current browser. Scripts do not, so none of the
  pictures uses one.
- `frames.js` renders a picture at chosen moments into one sheet, clipped as
  the page clips it. It needs the Playwright install in `tools/tiling-video/`.
