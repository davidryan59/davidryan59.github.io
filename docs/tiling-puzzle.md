# Tiling Puzzle: build Hat, Spectre and Krinkle tilings by hand

## Summary

A new app, the Tiling Puzzle, at `app/tiling-puzzle/`. The tiling explorer
lets the computer build an endless tiling. Here the visitor builds one piece
by piece.

One tile sits in the middle of the board, and the next piece waits in the
hand. The visitor turns it, drags it against the patch, and it snaps edge to
edge. The app says whether the patch can still grow forever. A patch can be
free of overlaps and still be a dead end.

The Hat and Spectre make this exact. Every Hat tiling holds the same finite
patches as every other, so the app can test any patch by searching for it in
a large tiling that it generates itself. The same search lets the computer
add tiles that can never break a legal patch. Krinkle pieces get weaker
checks, because the Krinkle tile tiles in many different ways.

This document is the build specification, in three phases. It relies on the
explorer's tiling files and on the Krinkle worker from
[krinkle.md](krinkle.md), phase 1.

## Implementation checklist

- [x] Phase 5: The board: pieces, hand, turning, snapping, undo, rings,
      share link and screen fit; no legality checks yet (built 2026-10-11;
      check 6, the phone, is David's)
- [ ] Phase 6: The Hat and Spectre checker: reference tiling, match set,
      verdicts, Add one, Hint and Fill a ring
- [ ] Phase 7: Krinkle pieces: corner check, matching against the fan and
      repeating tilings
- [ ] Release: builder page entry, share card, short address, and a "Build it
      yourself" link on each explorer tab

## Decisions (2026-10-11)

- **A separate app.** The explorer drags the view, while the puzzle drags
  pieces. Shared code covers the tile outlines, colours and reference
  tilings.
- **Pieces.**
  - The Hat and Spectre are the standard shapes, with no shape slider and
    straight edges.
  - The Krinkle piece is any (m, k, n) the explorer allows. The explorer
    link passes it in.
- **Turning.**
  - Fixed steps: 60° for the Hat, 30° for the Spectre, one hour (360°/n)
    for Krinkle. These are the turns that occur in each tiling.
  - The Hat has a flip button, because about one Hat in eight is mirrored
    in a real tiling.
  - The Spectre has no flip. The straight-edged Spectre tiles periodically
    when mixed with its mirror image.
  - Krinkle needs no flip, since the tile is mirror-symmetric.
- **Mistakes.**
  - Overlaps are refused, so the piece goes back to the hand.
  - Any edge-to-edge drop is accepted.
  - Definite dead ends show in red, with "Undo to last good" offered.
- **Pieces must touch.** Every new piece shares at least one whole edge with
  the patch, so there are no separate islands.
- **Computer help:** Add one, Hint, Fill a ring and Undo. There is no
  Autoplay.
- **Goal:** a sandbox with a ring counter.
- **Name:** Tiling Puzzle, at drbuild.uk/app/tiling-puzzle/, with the short
  address drbuild.uk/puzzle.

## Layout

The explorer's four corners, most important at the top left, plus the hand
at the bottom centre:

- **Header:** the site's explorer pattern: "← David Ryan's builder page" at
  top left, the title centred, and the full-screen button at right.
- **Top left: piece type.**
  - Large buttons for Hat, Spectre and Krinkle.
  - For Krinkle, a chip such as "(3, 7, 22)" opens the explorer's presets
    and steppers, which are shared code. Changing the piece type or the
    Krinkle numbers clears the board, after a confirm once 5 or more tiles
    are placed.
  - Below them, the numbered step hint, with the next action lit:
    1. "Drag the piece from the hand against the first tile."
    2. "Turn it with ⟲ ⟳, or twist two fingers, until an edge lines up."
    3. "Surround the first tile to complete ring 1."
    4. "Can you surround it again?"
- **Top right: play.**
  - Buttons: Undo, Undo to last good, Hint, Add one, Fill a ring and Clear.
  - A status line that is always visible, for example "12 tiles · ring 1
    complete · fits a Hat tiling".
- **Bottom left: colours.**
  - Groupings: By ring (the default), By orientation (as on the explorer
    tabs) and One colour.
  - The explorer's palettes, opening in Pastel and light mode.
- **Bottom right:** zoom, turn and home, as on the explorer.
- **Bottom centre: the hand.**
  - The next piece, at its current turn.
  - ⟲ and ⟳ on either side, and the flip button for the Hat.
  - On a phone this sits in thumb reach.
- **Small screens:** on a phone held upright, the top two panels fold to
  one line each, and the status line stays.

## The board (phase 5)

Files:

- `app/tiling-puzzle/index.html` is the page.
- `board.js` handles geometry, snapping, overlap, rings, corners and the
  share link.
- `puzzle.js` handles input, drawing and panels.
- `tools/tiling-puzzle/check.js` holds the Node checks.

Drawing uses Canvas 2D, with one cached Path2D per piece type and turn.

### Pieces and placements

- **Outlines** come from the same code as the explorer:
  - the Hat at the Hat page's own a:b;
  - the Spectre as Tile(1, 1);
  - Krinkle from the phase 1 worker.

  The Hat counts its long side as two edges (14 edges), as the explorer
  does.
- **A placement** is `{turn, flip, x, y}`, the translation of the piece's
  local origin, held in float64.
- **The first tile** sits at turn 0 at the origin. The hand starts at
  turn 0.

### Dragging and snapping

- **Picking up the piece.**
  - A drag that starts on the hand piece picks it up.
  - On a touch screen the piece rides 60 px above the finger, so the finger
    does not hide it.
  - A drag on empty board pans the view, pinch zooms, and a two-finger twist
    on empty board turns the view.
- **Turning while dragging.**
  - A second finger twisting turns the piece by whole steps.
  - With a mouse, the wheel turns it.
  - The keys Q and E turn it, and F flips the Hat.
  - The ⟲ and ⟳ buttons repeat when held.
- **Finding a snap.** Every edge of a placed tile that no other placed tile
  shares is free. For every free edge and every piece edge that runs the
  opposite way at equal length, there is one translation that makes the two
  edges coincide.
  - Drop any candidate whose piece would overlap a placed tile.
  - Among the rest, pick the one nearest the dragged piece, within 0.6 of
    the piece's width.
  - While dragging, show that candidate as a neutral outline ghost. It does
    not give a verdict, since the verdict comes after the drop.
- **Drop.** With a candidate, place the piece there. Without one, the piece
  slides back to the hand. A new piece then appears in the hand, at the same
  turn.
- **Overlap.** Two outlines overlap when an edge of one properly crosses an
  edge of the other, or a corner of one lies strictly inside the other.
  Sharing edges or corners is allowed. Use a tolerance of 1e-9.

### Rings

- **Ring index:** the step distance from the first tile, where two tiles are
  one step apart when they share at least one point.
- **Ring J is complete** when every corner of every tile with ring index
  below J has tiles all round it, so the angles there sum to 360°.
- **The counter** shows the highest complete ring. "By ring" colours each
  tile by its ring index.

### Corner check

A boundary corner of the patch is dead when no piece placement can be
attached to either free edge that meets at it without overlapping. This
uses the same snap test, over every allowed turn. A dead corner shows a red
wedge, and the status reads "No piece fits at the red corner". The check
runs after each drop, on the corners that the new tile touched.

### Undo, Clear, the share link and storage

- **Undo** steps back one placement. Each Fill a ring counts as one
  placement. **Clear** returns to the single first tile.
- **The share link** encodes the piece type and its numbers:
  - `p=hat`, `p=spectre`, or `p=krinkle&mk=3,7&t=2&o=1`.
  - `b=` lists every tile after the first as `a.ea.ej` (plus `.f` for a
    flipped Hat), in base 36, separated by `-`. The tile attaches to tile a
    by matching a's edge ea with its own edge ej, and the turn follows from
    those two edges.
  - Decoding replays the placements. It stops at the first token that does
    not snap, and says so.
- **Storage:** the current board for each piece type is kept in
  localStorage, wrapped in try/catch. The page works without it.

### Phase 5 checks

1. **Snapping:** 1,000 random drops near free edges give placements whose
   shared edge ends coincide to within 1e-9, and none overlaps.
2. **Overlap refusal:** a set of deliberately overlapping candidates is
   always refused.
3. **Share link:** 100 random builds survive a round trip through the link
   unchanged.
4. **Ring counter:** taking a ring-2 patch from the Hat explorer's tiling and
   replaying it gives a counter of 2.
5. **Screen fit:** `tools/screen-fit/check.js` passes at all six sizes.
6. **On a phone:** David tries dragging, twisting, the turn buttons, pan and
   pinch.

### As built

Phase 5 follows the plan above, with these departures and additions:

- **Presets and steppers are not shared code.** The plan says the Krinkle
  chip opens the explorer's own presets and steppers. They sit inline in
  `app/tiles/krinkle/index.html`, so the puzzle has a small copy of its own,
  built on `KrinkleTiling.PRESETS`, `validate` and `directions`. It follows
  the same stepping rules, so the two pages accept the same tiles.
- **The overlap test is wider than the plan's wording.** An edge that
  crosses an edge, or a corner strictly inside, misses two cases: a copy
  exactly on top of a tile, and an edge that joins two corners of the other
  tile through its inside. `board.js` cuts each edge where it meets the other
  outline, tests the middle of every piece, and adds a same-corners test. The
  tolerance is still 1e-9.
- **The corner check is literal.** A boundary corner is dead when no piece,
  at any allowed turn and, for the Hat, either flip, lies against either free
  edge that meets there without overlapping. It runs on the corners the new
  tile touches. Random drops make dead corners often: 4,378 in 70 random
  builds of 8 to 37 tiles. A patch cut from a real tiling has none.
- **Ring counter.** Ring J is complete when no tile below ring J has an open
  corner, so the counter is the lowest ring that holds a tile with an open
  corner. A point inside the edge of another tile counts as 180° there,
  which covers the Hat's split long side.
- **Added: Copy link.** The play panel has one button beyond the plan. The
  address bar also stays current, as on the explorer, in the hash:
  `#p=hat&b=...`. A link in the query string is read too.
- **Left for phase 6:** Undo to last good, Hint, Add one and Fill a ring.
  Undo to last good needs a verdict to mean anything.
- **Opens in light mode** until the visitor picks a theme, as the plan's
  Layout says. The explorer follows the system theme.
- **Confirm.** Clear asks first once 5 or more tiles are placed, as a change
  of piece does. A change of piece or numbers clears the board, and the last
  board of each piece stays in localStorage for the next visit.
- **Snap reach.** 0.6 of the piece's width, with the width taken as twice the
  largest distance from the area centroid to a corner. The nearest valid snap
  by area centroid wins.
- **Edge numbers in the link.** Corner 0 is the first corner of the
  explorer's outline. A mirrored Hat lists the mirrored corners in order
  from corner 0, then back round, so its edges still run anticlockwise. The
  parent in a token is the lowest tile that shares a whole edge with the new
  one, so one board always gives the same link.
- **Layout.** Up to 900 px wide on a tall window, and below 700 px wide on
  any window, the colours and zoom panels sit above a full-width hand. Under
  500 px wide the two view-turn buttons go, since a twist turns the view.
  A short wide window, such as a phone held sideways, keeps the four corners
  and a centred hand, with the colours panel as two rows.
- **Cost.** A snap takes under 1 ms for the Hat and Spectre on 300 tiles. A
  drop with a 62-edge Krinkle piece (k = 30) takes about 70 ms, mostly in
  the corner check.

Results, 2026-10-11:

- `node tools/tiling-puzzle/check.js`: all five checks pass.
  1. 1,001 random drops over the Hat, Spectre and five Krinkle tiles: the
     shared edge ends are within 7.3e-15, and a sampling test, which shares
     no code with the overlap test, finds no overlap.
  2. 8,662 copies, nudges, turns and snaps tried: every overlapping one is
     refused, and a repeated link token stops the decode.
  3. 100 random builds of 2 to 60 tiles round-trip unchanged, and a bad token
     stops the decode at its tile with a sentence.
  4. Patches of 1, 2 and 3 rings from the Hat's tiling (8, 22 and 44 tiles)
     and the Spectre's (7, 21 and 41) replay to counters 1, 2 and 3, with no
     dead corner. So do 1 to 3 rings of the Krinkle fan and the repeating
     tiling for four tiles. The start tile lies 10^8 tile widths from the
     file's origin, so the check subtracts exact two-part positions before it
     makes floats.
  5. In 70 random builds, every dead corner has no placement on either free
     edge, found by trying every flip, turn and edge without the board's own
     turn rule.
- `tools/screen-fit/check.js` on `#board`, with `.hand button` as the
  controls: all six sizes pass. The play area is the whole window.
- `node tools/krinkle/check.js --quick --random 40` and
  `node tools/hat-edges/verify-page.js`: both pass. Phase 5 changed no
  explorer file.
- Touch drag, a two-finger twist while carrying, drop and pinch were driven
  with dispatched touch events at 393 x 659. Real fingers are check 6.

For check 6, David's phone test: drag the piece from the hand and see it ride
above the finger; twist a second finger while it is held; hold ⟲ and ⟳ until
they repeat; drop it away from the patch and see it slide back; pan with one
finger, pinch, and twist two fingers on empty board; try the Hat flip; open
the Krinkle chip and pick a preset; copy the link and open it in another
tab.

## The Hat and Spectre checker (phase 6)

`app/tiling-puzzle/checker.js` is a worker. It loads
`../tiles/engine/tiling-core.js` and the tiling file for the piece, calls the
file's `build()`, and walks `ctx.root` with `TilingCore.walk`. Using
`ctx.place` keeps every position exact before it converts to float64.

### The reference tiling

- **Contents:** every tile whose reference point lies within R_ref of the
  hierarchy's origin, stored as an outline in world coordinates.
- **Index:** a hash on the rounded reference point, to 1e-6. Two tiles of a
  tiling never share a reference point, so a lookup returns at most one tile.
  A match then compares the full corner set.
- **Anchors:** only tiles within R_in = R_ref − D_max may serve as the
  image of the first user tile. D_max is the largest patch diameter the app
  checks, 25 tile widths. A larger patch shows the status "Too large to
  check", and its last verdict stays.
- **Calibration** sets R_ref:
  - Sample 2,000 random edge-connected legal patches of 2 to 60 tiles, with
    diameter up to D_max, from a distant region of the same hierarchy (for
    example around (10⁴, 10⁴)).
  - Start at R_ref = 120 tile widths, and grow it until every sample is
    found with an anchor inside R_in.
  - Ship twice the passing radius, and record the number in this document.

### Matches

- **A match** is a rigid motion g that carries the whole user patch onto
  tiles of the reference.
- **Allowed motions:** rotations for all pieces; reflections too for the Hat
  and for Krinkle.
- **Candidates:** for each anchor, test every cyclic shift of its corner
  list, and every reversed list where reflections are allowed. Keep the
  shifts where edge lengths and turning angles all agree. Each one kept
  gives one motion.
- **Incremental filter:** the match set M starts with all motions from all
  anchors for the first tile. Each new tile filters M, keeping only the
  motions that carry the new tile onto a reference tile. One hash lookup per
  motion, so a drop costs O(|M|).
- **Undo** restores the saved M of the earlier state.

### Verdicts and marking

- **M not empty:** green, "Fits a Hat tiling, so it can go on forever".
- **M becomes empty:** red, "Dead end: this patch is in no Hat tiling".
  - The tile whose drop emptied M turns red.
  - Any shared edge whose two tiles never touch that way in the reference
    is also drawn red. A catalogue of every edge contact in the reference,
    in the first tile's frame, decides this.
  - The corner check from phase 5 adds red wedges where no piece fits at
    all.
  - Add one, Fill a ring and Hint are disabled, and Undo to last good is
    lit.
- **Later drops** onto a dead patch stay possible, and the status stays red.

### Computer help

- **Add one:** choose a match g with its anchor farthest from the reference
  edge. Take the reference tiles that share an edge with g(patch), and
  prefer one that touches the lowest unfinished ring. Map it back with g⁻¹
  and place it, with a short slide in from the hand. The patch stays legal
  by construction.
- **Hint:**
  - Draw a faint ghost at every legal next placement: the union, over all g
    in M, of the reference tiles sharing an edge with g(patch), mapped back.
  - Ghosts at the hand's current turn and flip are drawn stronger.
  - The ghosts fade after 4 seconds or at the next action.
- **Fill a ring:**
  - Using one match g, add every reference tile that touches a corner of a
    tile in the rings below the next one.
  - Animate the tiles in one by one, over about 1.5 seconds.
  - The whole fill counts as one undo step.

### By-products to record here

Measured from the reference and written into this document:

- the number of distinct first rings (all tiles touching a central tile, in
  that tile's frame) for the Hat, for the mirrored Hat and for the Spectre;
- the number of distinct edge contacts for each.

These answer "how many ways can a tile be surrounded?".

### Phase 6 checks

1. **Calibration**, as above, passes at the shipped R_ref.
2. **Add-one soak:** 1,000 Add ones from a single tile each stay legal
   against a reference of twice the radius. Run it for the Hat and for the
   Spectre.
3. **Stable verdicts:** every patch judged dead at R_ref is still dead at
   2·R_ref. Test 500 patches made by one random snap-valid drop onto a legal
   patch.
4. **Speed:** the verdict arrives within 100 ms of a drop, with 60 tiles on
   the board, on a laptop with Chrome's CPU throttled 4×. The reference
   builds in under 2 seconds.

## Krinkle pieces (phase 7)

- **References:** two tilings of the same (m, k, n) tile from the phase 1
  worker, the fan and the repeating lattice, plus their mirror images.
  - For odd n, a mirror image lands on half-hour turns. Turn the mirrored
    reference by half an hour so it uses whole hours.
  - Matching and the index work as in phase 6.
- **Verdicts:**
  - Green: "Fits the fan tiling" or "Fits the repeating tiling".
  - Amber: "Not part of either tiling the app knows. It may still
    continue". The tile tiles in other ways too, so this is not a dead end.
  - Red: only from the corner check, "No piece fits at the red corner".
- **Computer help:**
  - Add one, Hint and Fill a ring work from whichever reference matches,
    preferring the fan.
  - In the amber state they are disabled, with the note "Needs a patch that
    fits a known tiling".
- **Turning:** one hour per step. For large n, holding a turn button repeats,
  and a twist or the wheel moves in whole hours in proportion to the angle.

### Phase 7 checks

1. **Add-one soak:** 500 Add ones on the fan and on the repeating tiling,
   for five presets, each verified against a reference twice the size.
2. **Known patches:** patches cut from the fan tiling are found, and so are
   mirror images of fan patches, for one odd-n preset.
3. **Dead corner:** two tiles placed to leave an angle smaller than the
   tile's smallest corner show a red corner.

## Release

- **Builder page:** an entry in `index.html` and a share card, drawn from a
  real build.
- **Short address:** a redirect page at `redirects/` for drbuild.uk/puzzle.
  Add the address to the list in [site-layout.md](site-layout.md).
- **Link from the explorer:** a "Build it yourself" link on each explorer
  tab, in the top-left area under the tabs. It opens the puzzle with that
  tab's piece and, for Krinkle, its numbers. Hat (extended) opens the Hat.
- **About text:** the dead-end idea in plain words, crediting Smith, Myers,
  Kaplan and Goodman-Strauss, and Imura. There is no proof-status wording.

## Later

- **Islands:** separate patches that must later join, to show patches that
  each look fine but cannot meet.
- **Curved edges** from the explorer, and the Hat's shape slider, on pieces.
- **A verdict on the ghost while dragging**, as an optional setting.
- **Krinkle variant pieces** (m, p, q). These need flipping, and wait for
  the variant rule in [krinkle.md](krinkle.md).
- **Challenges,** such as "Find the repeating pattern with Spectres and
  their mirror images", which needs Spectre flips turned on.
