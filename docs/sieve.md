# Sieve of Eratosthenes

## Summary

`app/sieve/` is the Sieve of Eratosthenes as an educational toy. Every number
from 0 up is a tile in a grid. Every tile starts grey, except 0, which is
black, and 1, which is white. The visitor chooses grey numbers as primes, in
any order. Each chosen number turns bright, and its multiples turn a pale
shade of the same colour. Chosen as 2, 3, 5, 7 and so on, the grey numbers
left are the true primes. Chosen any other way, they show what the visitor's
own sieve leaves. The row width and the base can change, and the grid scrolls
in both directions, up to 10¹⁵.

The page is served at drbuild.uk/app/sieve/, and the short address
drbuild.uk/sieve redirects there. The builder page lists it under Apps &
Websites, after the Aperiodic Pair Gallery.
[sieve/original-prompt.md](sieve/original-prompt.md) keeps the prompt that
started it, word for word, off the site with the rest of `docs/`.

## Implementation checklist

- [x] Choose a grey number, colour its multiples, and remove chosen numbers in
      any order
- [x] Undo and Clear
- [x] Next prime: choose the smallest grey number
- [x] Bases 2 to 16, 20 and 60, with the decimal value under the number,
      except in dozenal
- [x] Pitman's digits for dozenal, drawn turned, with a two-glyph font for
      the text boxes
- [x] Row width from 1 to 10⁹, written in the base, with presets; a new base
      keeps the width's digits
- [x] Drag, scroll, pinch and zoom, Go to, and a keyboard cursor
- [x] A status line that says what each number is, and whether it is a true
      prime
- [x] The address keeps the width, base, primes and view
- [x] Light and dark themes
- [x] Motion: a new prime springs out, its multiples light up in turn, and
      every other change moves too, with none for reduced motion
- [x] Glow and sheen on chosen tiles, squared-paper dots round the grid, and
      a toolbar and status bar in the site's monospace
- [x] Builder page entry, thumbnail, share card and short address
- [ ] David tries it, then it is pushed and the address checker run
- [ ] Try it on a real phone and in Safari

## Rules

- **Kinds.** Every number is one of five kinds. 0 and 1 are fixed and cannot
  be chosen. A chosen number is one the visitor picked. A multiple is a
  number that a chosen number divides. Every other number from 2 up is grey,
  and only a grey number can be chosen.
- **Colour.** A multiple takes the colour of the first chosen number, in the
  order picked, that divides it. So if the visitor picks 3, then 4, then 2,
  12 stays with 3, 8 goes to 4, and 10 goes to 2. A chosen number keeps its
  own bright colour even when a later choice divides it, as 4 does here.
- **Removing.** Any chosen number can be removed, in any order. Its
  multiples go back to grey, or to the next chosen number that divides them.
  No chosen number is a multiple of one chosen before it, and removing any
  of them keeps that true, so every list the visitor can reach is one they
  could have picked in that order.
- **Colour slots.** Each chosen number holds a slot: the lowest free when it
  was picked. Removing one frees its slot and leaves the others' colours as
  they were.
- **Undo** reverses the last choice, removal or Clear, back 2,000 steps.
- **Next prime** chooses the smallest grey number. That number is always a
  true prime, whatever was chosen before. Any smaller factor of it is
  coloured, so a chosen number divides that factor, divides the number too,
  and would have coloured it.

## Colours

`Sieve.slotColours()` and `Sieve.theme()` in `model.js` hold every colour,
as OKLCH turned into sRGB.

- **Bright.** The first three slots follow the brief: green, blue, yellow.
  Then red, purple, orange, cyan, magenta, lime, brown, teal, pink, indigo and
  olive, chosen by hand. After those, each slot turns the hue by the golden
  angle and steps the lightness, so neighbouring slots stay apart. Text on a
  bright tile is dark when its lightness is 0.6 or more, and white below.
- **Pale.** In light mode, lightness 0.92 and 0.42 of the bright chroma. In
  dark mode, lightness 0.36 and half the chroma.
- **Grey.** Lightness 0.85 in light mode, between the pale multiples and the
  board, and 0.47 in dark mode, above them. Either way, the numbers still in
  the sieve stand out from the ones sieved out.
- **0 and 1.** Black and white in both themes, each with a thin edge, so they
  show on either board.
- **The board.** Lighter in the middle, and shading to `boardEdge` at the
  corners. A dot marks each corner of the squares round the grid, as on
  squared paper, and the dots stop at the grid's edge.
- **Glow and sheen.** A chosen tile glows with its own colour: a wide halo,
  added as light, in dark mode, and a close shadow under the tile in light
  mode. It also carries a sheen, lighter at the top and darker at the foot.
  `theme()` holds the strengths, and `veil`, which dims the board round a
  prime under the pointer.

## Bases

2 to 16, 20 and 60, each named in the menu, from binary to sexagesimal. The
base comes first in the controls, and the row width and Go to take numbers
written in it.

- **Digits.** Past 9, most bases use lower-case letters, as JavaScript writes
  them: hexadecimal uses a to f. Base 60 writes each place as a decimal
  number, padded to two digits after the first, with colons between, as a
  clock does: 3,725 is 1:02:05.
- **Decimal values.** In any base but 10 and 12, a tile shows its number in
  large figures and the decimal value in small figures below. A long number
  wraps onto up to six lines, split from the right so that a short line comes
  first, and the decimal value drops out first when a tile is too small for
  both. The status line gives both forms, as 150₇ = 84.
- **Dozenal** shows no decimal values anywhere: on the tiles, the prime
  buttons, the status line or the range under the grid. `num()` in
  `index.html` writes every number in dozenal there. Counts and ordinals
  follow, so the thirteenth prime is the 11th.
- **Pitman's digits.** Dozenal writes ten and eleven as ↊ (U+218A) and ↋
  (U+218B), a turned 2 and a turned 3. No font that ships with macOS carries
  them, and Chrome there draws a placeholder box. So the grid draws each one as
  its digit turned about the digit's own centre, in the tile's own font
  (`fillLine()` in `board.js`). The status line, the range and the prime
  buttons wrap each in a span turned by CSS, labelled with its character for
  a screen reader. A text box cannot do either, so the page loads
  `app/sieve/pitman.woff` for the two characters only, through
  `unicode-range`. That font is 3.9 KB: DejaVu Sans Mono's 2 and 3, turned,
  built by `tools/sieve/pitman-font.py`. A tooltip cannot use it, so no
  tooltip names a number.
- **Typing.** Letters may be either case, and commas, spaces and underscores
  are ignored. Dozenal also takes X or T for ten and E for eleven, and the box
  then shows the Pitman digit. Base 60 wants colons between places.

## Row width in the base

The width box shows the width in the chosen base, and the up and down arrow
keys step it by one. A new base keeps the width's digits and reads them in
the new base: a width of 10 is always one column for each last digit, and 100
one for each last two. So decimal 10 becomes twelve in dozenal and 1:00 in
base 60. A width with a digit the new base lacks, as f in hexadecimal going
to decimal, becomes 10 in the new base.

The presets start with 10 and 100 in the chosen base. The rest are fixed
widths named in words, such as "Thirty: every prime after five in eight
columns", since their decimal figures would be wrong in any other base.

## Limits

The grid runs from 0 to 999,999,999,999,999, one less than 10¹⁵, and a row
holds from 1 to 10⁹ numbers.

- **Why 10¹⁵.** Colouring a tile needs one remainder for each chosen number.
  It never needs a factorisation, so a number's size costs nothing.
  JavaScript holds whole numbers exactly only up to 2⁵³, about 9 × 10¹⁵, and
  10¹⁵ is the round number below that.
- **Exact arithmetic.** `fill()` finds the first multiple in a row with a
  remainder, never a division, since dividing two numbers near 10¹⁵ can round
  to the wrong whole number.
- **A steady view.** The view keeps its top edge as a whole row and a
  fraction of a row, apart. Rows run past 10¹⁴, where one float would round
  the fraction away and the tiles would shake as they scroll.
- **True primes.** The status line says whether a grey or chosen number is a
  true prime. Trial division settles every number below 4 × 10¹⁰, and gives
  the smallest factor where it finds one. Above that, Miller–Rabin with the
  primes up to 23 as bases settles every number below 3.8 × 10¹⁸, which
  covers the grid.

## Controls

- Click or tap a grey number to choose it, and a chosen one to remove it.
  Clicking a multiple, 0 or 1 only describes it.
- Point at a number to describe it in the line under the grid, beside a
  small tile in its colour. Point at a chosen number, or its button under the
  grid, to dim the rest of the board and ring its multiples.
- Drag, or scroll, to move. A drag let go while moving carries on and slows.
  At the top of the grid, scrolling up scrolls the page. Pinch, Ctrl +
  scroll, or − and + under the grid zoom. Fit, beside the row width, sizes the
  tiles so that a whole row fits, up to 72 px.
- Go to jumps to a number, typed in the chosen base, and flashes its tile.
  The box then shows the number as the page writes it.
- The buttons under the grid remove a prime each, and name them in the order
  chosen.
- With the grid focused: the arrow keys move a cursor, Page Up and Page Down
  move a screen, Home and End go to either end of the row, Enter or Space
  chooses or removes, + and − zoom, and Escape hides the cursor. Tab to the
  grid, and the cursor starts on the first tile in view.
- Anywhere outside a text box: N is Next prime, and Ctrl+Z or Cmd+Z is Undo.
  Both buttons show their key, except on a touch screen.
- A screen reader hears each change and each cursor move, but not the
  pointer passing over tiles.

The first view fits ten rows of ten, 0 to 99, as the classroom hundred square
does.

## Motion

The board moves only to show a change, and no move takes more than 0.9 s,
the length of the Go to pulse.

- **A new prime** springs past its size and back, and sends out a ring in its
  colour. Its multiples in view then light up one after another, in the
  order of their numbers, as the sieve reaches them. Each flashes the prime's
  bright colour, sinks a little, and settles to the pale colour. The run
  takes 0.35 s at most, however many multiples are in view.
- **A removal** greys the prime, and its multiples change back in turn over
  0.21 s. Clear, Undo and a new address run every change in number order
  over 0.3 s.
- **A large change.** When more than 2,500 tiles in view change, or the tiles
  are too small to draw one by one, the change spreads as one circle from
  the prime, or from the middle of the board.
- **The opening** brings the tiles in from the top left, one diagonal after
  another.
- **Jumps.** Go to, Fit, and a new width, base or theme fade the old board
  out over 0.12 s. Go to then sends three rings out from its tile.
- **The pointer.** The ring round the number under the pointer glides from
  tile to tile, and so does the keyboard cursor. A pressed tile sinks a
  little. The zoom buttons and the + and − keys ease to their size.
- **The buttons** of the primes spring in when chosen, and slide to their
  new places when one goes.
- **Reduced motion.** When the system asks for reduced motion, every change
  shows at once, and nothing glides, fades or carries on.

A move follows the time since it began, not the count of frames, so it runs
at one speed at any frame rate. The model keeps no record of a change for the
board. `animate()` in `board.js` compares the tiles drawn before a change
with the tiles after it, and moves the ones that differ.

## The address

The page keeps its state after the `#`, and rewrites it 0.4 s after the last
change, without adding to the browser's history.

| Key | Holds | Default |
|---|---|---|
| `w` | Row width, in decimal whatever the base | 10 |
| `b` | Base | 10 |
| `p` | The chosen numbers, in the order picked. A colon and a slot follow a number whose slot is not its place in the list, as in `4:1` | none |
| `at` | The first number wholly in view, at the top left | 0 |
| `z` | Tile size in CSS pixels | fits ten rows of ten |

For example, `#w=30&p=2,3,5,7,11,13,17,19&z=24` is the share card's grid,
with smaller tiles. On load the page keeps only the numbers that could have
been picked in that order.

## Drawing and cost

The board is one canvas. Each frame, `fill()` in `model.js` works out the
tile code for every tile in view: grey, 0, 1, or a slot's bright or pale
colour. It fills in the chosen numbers first. Then each chosen number, in the
order picked, marks its multiples in view, and a tile keeps the first mark.
A number whose smallest multiple, twice itself, lies past the view is
skipped. When the view spans whole rows, the numbers run on unbroken and
each chosen number walks one range; otherwise it walks each row.

- **Tiles of 12 device pixels or more** are drawn one by one: one path per
  colour, with a gap and rounded corners from 20 CSS px, and the number when
  its font would be 7 CSS px or more.
- **Smaller tiles** go into an image, one pixel per tile, which the canvas
  scales up without smoothing. Below 12 device pixels the tile size snaps to
  a whole number of pixels, so every tile is the same size.
- **A tile in motion** is drawn on its own, over the rest. A tile still
  waiting its turn stays in its old colour's path.
- The page draws only when something changes, and runs frames only while
  something moves.

Measured in headless Chromium, on a board of 1216 × 590 CSS px at twice the
pixel density: the script's time to build one frame, after a scroll, over
nine frames.

| Case | Tile | Median | Longest |
|---|---|---|---|
| 25 primes, width 210, at 0 | 1 px | 1.5 ms | 1.8 ms |
| 25 primes, width 210, at 0 | 24 px | 1.3 ms | 1.8 ms |
| 500 primes, width 210, at 10⁶ | 24 px | 1.9 ms | 2.1 ms |
| 2,000 primes, width 1,000, at 10⁹ | 1 px | 7.0 ms | 8.5 ms |
| 500 primes, width 10⁹, at 5 × 10¹⁴ | 1 px | 12.5 ms | 15.1 ms |

The last case is the slowest there is: 717,000 tiles in view, none of them in
whole rows, so each chosen number walks all 590 rows. The glow, sheen and
dots add under 0.3 ms to any case, measured on the same machine against the
board before them.

While a change moves, the page holds 60 frames a second in a visible
Chromium at twice the pixel density. The heaviest case tried, Clear with ten
primes at width 210 and 24 px tiles, moves about 1,100 tiles at once and
dropped one frame in 90.

## Files

| File | What it holds |
|---|---|
| `app/sieve/index.html` | The page: its styles, the controls, the status line, the prime buttons, the address, and the text |
| `app/sieve/model.js` | The rules, the tile codes, the bases and the colours. No drawing, so Node can run it |
| `app/sieve/board.js` | The board: the view, drawing, motion, and pointer, wheel and key input |
| `app/sieve/pitman.woff` | Pitman's two dozenal digits, for the text boxes |
| `docs/sieve/original-prompt.md` | The prompt that started the app, word for word |
| `redirects/sieve.html` | The short address, drbuild.uk/sieve |
| `tools/sieve/card.js` | Draws `social/sieve.jpg`, the share card |
| `tools/sieve/pitman-font.py` | Builds `app/sieve/pitman.woff` from DejaVu Sans Mono, with fontTools |
| `tools/sieve/check-model.js` | Checks the rules in `model.js` against brute force, over random lists, widths and blocks, some near 10¹⁵. Run it after any change to `model.js` |
| `tools/thumbnails/sieve.js` | Draws `assets/thumbs/sieve.svg`, the builder page's animated picture |

## Share card and builder picture

```sh
node tools/sieve/card.js
node tools/thumbnails/sieve.js
```

The card is the page's own board, drawn by `board.js` in light mode, at
1200 × 630: rows 30 wide, with 2, 3, 5, 7, 11, 13, 17 and 19 chosen. Every
grey number left in view is below 23 × 23, so each is prime, and they stand
in the eight columns under 1, 7, 11, 13, 17, 19, 23 and 29. The card script
needs Playwright; with only `playwright-core` installed, as in
`tools/tiling-video/`, run it with
`NODE_PATH=tools/tiling-video/node_modules`.

The builder picture is a hundred square. 2, 3, 5 and 7 are chosen in turn
and their multiples turn pale, until only primes stay grey, then it fades
back to grey on an 8 s loop.
