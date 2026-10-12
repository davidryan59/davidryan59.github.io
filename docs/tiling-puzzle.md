# Tiling Puzzle: build Hat and Spectre tilings by hand

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
add tiles that can never break a legal patch.

This document is the build specification. It relies on the explorer's Hat
and Spectre tiling files.

## Implementation checklist

- [x] Phase 5: The board: pieces, hand, turning, snapping, undo, rings,
      share link and screen fit; no legality checks yet (built 2026-10-11;
      check 6, the phone, is David's)
- [x] Phase 6: The Hat and Spectre checker: reference tiling, match set,
      verdicts, Add one, Hint and Fill a ring (built 2026-10-11)
- [x] Remove the Krinkle mode after reviewing its puzzle logic (2026-10-12)
- [ ] Release: builder page entry, share card, short address, and a "Build it
      yourself" link on the Hat and Spectre tabs

## Decisions (2026-10-11)

- **A separate app.** The explorer drags the view, while the puzzle drags
  pieces. Shared code covers the tile outlines, colours and reference
  tilings.
- **Pieces.** The Hat and Spectre are the standard shapes, with no shape
  slider and straight edges.
- **Turning.**
  - Fixed steps: 60° for the Hat and 30° for the Spectre. These are the
    turns that occur in each tiling.
  - The Hat has a flip button, because about one Hat in eight is mirrored
    in a real tiling.
  - The Spectre has no flip. The straight-edged Spectre tiles periodically
    when mixed with its mirror image.
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
  - Large buttons for Hat and Spectre. Changing the piece clears the board,
    after a confirm once 5 or more tiles are placed.
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
  - `p=hat` or `p=spectre`.
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
- **Cost.** A snap takes under 1 ms for the Hat and Spectre on 300 tiles.

Results, 2026-10-12:

- `node tools/tiling-puzzle/check.js`: all five checks pass.
  1. In 1,000 random drops over the Hat and Spectre, the shared edge ends
     are within 4.0e-15. A sampling test, which shares no code with the
     overlap test, finds no overlap.
  2. The check examined 3,304 copies, nudges, turns and snaps. It refused
     every overlapping placement, and a repeated link token stops the
     decode.
  3. 100 random builds of 2 to 60 tiles round-trip unchanged, and a bad token
     stops the decode at its tile with a sentence.
  4. Patches of 1, 2 and 3 rings from the Hat's tiling (8, 22 and 44 tiles)
     and the Spectre's (7, 21 and 41) replay to counters 1, 2 and 3, with no
     dead corner. The start tile lies 10^8 tile widths from the file's
     origin, so the check subtracts exact two-part positions before it makes
     floats.
  5. In 20 random builds, all 1,147 dead corners have no placement on either
     free edge. The check tries every flip, turn and edge without the board's
     own turn rule.
- `tools/screen-fit/check.js` on `#board`, with `.hand button` as the
  controls: all six sizes pass. The play area is the whole window.
- `node tools/hat-edges/verify-page.js` passes. Phase 5 changed no explorer
  file.
- Touch drag, a two-finger twist while carrying, drop and pinch were driven
  with dispatched touch events at 393 x 659. Real fingers are check 6.

For check 6, David's phone test: drag the piece from the hand and see it ride
above the finger; twist a second finger while it is held; hold ⟲ and ⟳ until
they repeat; drop it away from the patch and see it slide back; pan with one
finger, pinch, and twist two fingers on empty board; try the Hat flip; copy
the link and open it in another tab.

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
  - **Shipped:** R_ref = 240 tile widths for the Hat and the Spectre. Both
    pass at the starting 120.

### Matches

- **A match** is a rigid motion g that carries the whole user patch onto
  tiles of the reference.
- **Allowed motions:** rotations for both pieces, and reflections for the
  Hat.
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

Measured 2026-10-11 by `tools/tiling-puzzle/check-phase6.js`, check 6. The
central tile is turned, never mirrored, into its own frame:

| Central tile | Distinct first rings | Distinct edge contacts |
| --- | --- | --- |
| Hat | 120 | 23 |
| Mirrored Hat | 8 | 4 |
| Spectre | 18 | 25 |

- The first-ring counts are the same over the tiles within 60 and within
  100 widths: 27,774 and 77,161 Hats, 4,050 and 11,264 mirrored Hats, and
  35,036 and 97,327 Spectres.
- A mirrored Hat has only 4 edge neighbours, each sharing several edges,
  and 2 more that touch it at a point.
- When matches may mirror, as the checker's catalogue allows for the Hat,
  the Hat has 25 edge contacts.

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

### As built

Phase 6 follows the plan above, with these departures and additions:

- **Files.** `app/tiling-puzzle/checker.js` is the worker. It also runs in
  the page when the browser has no workers or refuses one, and under Node
  through `createHandler`. The checks are in
  `tools/tiling-puzzle/check-phase6.js`.
- **The reference.** It is centred on the tile nearest the hierarchy's
  start, `info.start`, whose corner 0 becomes the origin. Every position is
  subtracted in exact two-part form before it becomes a float. The Hat
  reference holds 509,328 tiles and the Spectre's 560,613.
- **The index.** The plan hashes the rounded reference point. The checker
  uses a grid of cells one tile width across, over the area centroids. A
  centroid within 1e-6 of a cell's side goes in both cells, so rounding
  never splits a lookup. A lookup must agree on the centroid to 1e-6 and on
  the orientation, and then on the full corner set.
- **Radii have a slack of 1e-9.** The Hat's width is √39, so a centroid can
  lie exactly on a rim measured in whole widths. The slack settles such a
  tie the same way in both routes of check 5.
- **Shift templates.** Each class of anchor keeps exactly one shift: the
  Hat keeps one proper shift and, for mirrored anchors, one reversed shift.
  The Spectre keeps one proper shift. So every anchor gives one motion, and
  the match set starts at 408,731 motions for the Hat and 449,896 for the
  Spectre.
- **Diameter.** A patch's diameter is the largest distance between two tile
  centroids. Above 25 widths the status reads "Too large to check. Up to N
  tiles it fitted a Hat tiling". A dead patch stays dead however large it
  grows, so its red verdict stays.
- **One request syncs the whole board.** Each request carries every tile.
  The worker keeps the match set of each prefix it has seen, so a drop
  filters once and an undo restores a saved set. The requests are `init`,
  `match`, `verdict`, `add-one`, `hint` and `fill-ring`.
- **The edge contact catalogue** is read within 30 widths of the centre, to
  keep the build short. Check 6 confirms that the whole reference holds the
  same 25 contacts for each piece.
- **Hint** builds every placement that meets the patch by a catalogued
  contact, then keeps those that some match carries onto the reference.
  That is the plan's union, found from the other side. A candidate that
  overlaps a placed tile, or meets one by an unknown contact, is ruled out
  before the scan over M. The answers do not change, and the Spectre's
  slowest hint dropped from 445 ms to 75 ms.
- **Fill a ring** places, each time, the first remaining tile that shares an
  edge with the patch. A ring tile can touch the patch only at a point until
  a neighbour goes in. The status reads "Filling ring N…" meanwhile, and
  any other action completes the fill first.
- **Red marking.** The red tile is a saturated red with light stripes,
  since the pastel ring 0 colour is pink. Unknown shared edges are drawn
  as thick red lines.
- **Undo steps.** The page keeps the tile count after each step, so a Fill
  a ring undoes as one. `board.js` gained `undoTo(count)`, which rebuilds
  once, and `deadCountAt(count)` for Undo to last good.
- **Layout.** The play panel holds seven buttons. On a window under 480 px
  tall the view-turn buttons go, as they already do under 500 px wide, so
  the play panel's status line clears the zoom column on a phone held
  sideways.
- **A hook for checks.** `window.TilingPuzzle` gives read-only views of the
  board and verdict, and the screen point of a drop that snaps. Check 4 and
  the screenshots use it.

Results, 2026-10-11:

- `node tools/tiling-puzzle/check-phase6.js --url <page>`: all six checks
  pass.
  1. Calibration: 2,000 patches per piece of 2 to 60 tiles, up to 25.0
     widths across, a quarter of them grown as snakes, from about 10^4
     widths away. All are found at 120 widths and at the shipped 240. Below
     120 the Hat first passes at 70 widths and the Spectre at 60.
  2. Add-one soak: 1,000 Add ones per piece, with about 100 Fill a rings and
     75 undos, in runs of up to 158 tiles and ring 6. Every patch fits at
     2 R_ref, every placement is snap-valid, no legal patch has a dead
     corner, and every undo restores the saved match set.
  3. Stable verdicts: 500 patches per piece, each a legal patch plus one
     random drop. 421 Hat and 415 Spectre patches are dead at R_ref, and
     every verdict is the same at 2 R_ref.
  4. Speed: the reference builds in 0.4 s for the Hat and 0.65 s for the
     Spectre in Node, and in 0.4 s and 0.53 s in a Chrome worker. A drop
     onto 60 tiles, with Chrome's CPU throttled 4x, reaches its verdict on
     screen in 21 to 38 ms. Chrome's throttle does not slow a worker, so
     the check runs again with the checker in the page. The drops still
     take 23 to 38 ms, and the reference takes 1.5 s and 2.0 s.
  5. Second route: for 200 patches per piece, a brute-force search finds
     exactly the checker's match set. It reads every corner again from the
     two-part outline, tries all twelve 30° turns and both mirrors, and
     looks tiles up by sorted x. The patches are legal cuts, cuts plus one
     random drop, and random builds: 83 Hat and 78 Spectre patches fit, and
     43,739 and 58,765 matches agree one by one.
  6. By-products: the table above.
- `node tools/tiling-puzzle/check.js`: checks 1 to 5 still pass.
- `tools/screen-fit/check.js` on `#board`, with `.hand button` as the
  controls: all six sizes pass. The longest status, a dead end with red
  corners, fits on a phone held either way.
- `node tools/hat-edges/verify-page.js` passes. Phase 6 changed no explorer
  file.
- Screenshots: a green verdict at ring 2, Hint ghosts, Fill a ring
  mid-animation, and a dead end with its red tile and red edge.

## Removed Krinkle mode

The Krinkle mode was removed on 2026-10-12 before release. A finite patch
of its repeating lattice also occurs inside a sufficiently large fan wedge.
The checker could therefore recognise selected constructions, but it could
not decide whether an unmatched patch was a dead end.

That uncertainty broke the puzzle's main rule. Legal random additions often
produced an amber unknown state and disabled the computer help. The Krinkle
explorer keeps its fan, repeating arrangement and construction playback.
[krinkle.md](krinkle.md) records the mathematical assessment and other known
arrangements.

## Release

- **Builder page:** an entry in `index.html` and a share card, drawn from a
  real build.
- **Short address:** a redirect page at `redirects/` for drbuild.uk/puzzle.
  Add the address to the list in [site-layout.md](site-layout.md).
- **Link from the explorer:** a "Build it yourself" link on the Hat and
  Spectre tabs, in the top-left area under the tabs. Hat (extended) opens
  the Hat. The Krinkle tab has no puzzle link.
- **About text:** the dead-end idea in plain words, crediting Smith, Myers,
  Kaplan and Goodman-Strauss. There is no proof-status wording.

## Later

- **Islands:** separate patches that must later join, to show patches that
  each look fine but cannot meet.
- **Curved edges** from the explorer, and the Hat's shape slider, on pieces.
- **A verdict on the ghost while dragging**, as an optional setting.
- **Challenges,** such as "Find the repeating pattern with Spectres and
  their mirror images", which needs Spectre flips turned on.
