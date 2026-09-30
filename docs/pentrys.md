# Pentrys

## Summary

Pentrys is a falling-block game for the builder page, the fourth under
Games. Pieces of one to five squares, chosen at random, fall down a well.
The player moves, rotates and flips each one to fill rows. A full row
clears. The pieces fall faster as the game goes on, and the game ends when
the stack reaches the top.

Two rules are new. Some squares are special, and a row clears when its
squares add up to the width of the well. A 2 lets its row clear with one
gap and a 3 with two, glass counts nothing, and a flood square fills the
gaps beside and below it as it lands. The queue of the next four pieces
also cycles without limit, so the player picks which one falls next. Other
games already have falling pentominoes, all 29 pieces of one to five
squares, a flip control and a choice of well width.
[Similar games](#similar-games) lists them. No game found gives a square a
value towards its row, or lets the player cycle the queue.

The game lives in `app/pentrys/`, served at drbuild.uk/app/pentrys/, and
drbuild.uk/pentrys redirects there. This spec covers the rules, the look,
the sound and a tutorial. `tools/pentrys/look.html` draws a still frame of
the look, and `tools/pentrys/colours.html` shows all 21 colours. Music
comes later. David's request is kept word for word in
[pentrys/original-prompt.md](pentrys/original-prompt.md).

## Implementation checklist

- [x] A still frame of the look and a sheet of the 21 colours, in
      `tools/pentrys/`
- [x] The 21 shapes and their orientations, with rotation, flip and the
      shifts, in `pieces.js`
- [x] The rules in `rules.js`: the well, choosing pieces, the queue and its
      cycle, special squares, falling, locking, the flood, clearing,
      scoring, levels and the modes
- [x] Tests for both, in Node: 42, all passing
- [x] A simulated player in Node, and its first measurements
- [x] The page: the well, the queue, the score, and keyboard and touch
      controls, in the look of the still frame
- [x] The motion, the celebrations, the title screen's game, pause and game
      over
- [x] The tutorial's eleven lessons
- [x] Settings, the controls screen, high scores and the address
- [x] Sound effects, not yet heard by a person: a headless browser plays
      no sound
- [x] Frame times measured, at full speed and on a slowed processor
- [x] The short address, drbuild.uk/pentrys
- [ ] David plays each mode, and the speeds and special-square rates are
      tuned
- [ ] Try it on a real phone and in Safari
- [ ] The builder page entry, the share card and the builder picture
- [ ] Music, later
- [ ] Install on a phone as an app, later

## The well

- 20 rows high, and 10, 12, 14, 16 or 18 columns wide. 12 is the default.
- Four hidden rows above the top edge, where pieces appear: room for I5
  standing on the top row. Since no move raises a piece, nothing goes
  higher.
- The height stays at 20 for every width, as in Pent-up, which offers 10,
  12 and 14 columns. A wider well already holds more before it fills: 85
  pieces at width 18, against 47 at width 10.
- At width 12 a row takes 2.8 pieces on average, close to the 2.5 of a
  10-wide well of four-square pieces. The pieces here average 4.2 squares,
  so two more columns keep a similar pace.

## Pieces

### The set

Every shape of one to five squares joined edge to edge. A shape and its
mirror image count as one shape, since a flip turns one into the other.
Counted apart, as other games often count them, they make 29 pieces. With
every rotation and reflection counted apart, they make 91 orientations.

| Squares | Shapes | Mirror images apart | Orientations |
|---|---|---|---|
| 1 | 1 | 1 | 1 |
| 2 | 1 | 1 | 2 |
| 3 | 2 | 2 | 6 |
| 4 | 5 | 7 | 19 |
| 5 | 12 | 18 | 63 |
| All | 21 | 29 | 91 |

### Families and colours

Each shape has a colour of its own, 21 hues in all. The shapes fall into
five families, and each family keeps its colours close together, so the
colour says both what kind of shape is coming and which one. A mirror pair
is one shape, so a flip never changes the colour.

| Family | Colours | Shapes | Share of pieces |
|---|---|---|---|
| Straights | Turquoise to blue | 1, 2, I3, I4, I5 | 5 in 21 |
| Corners | Coral to orange | L3, L4, L5, V5 | 4 in 21 |
| Boxes | Amber to yellow | O4, P5, U5 | 3 in 21 |
| Zigzags | Lime to sea green | S4, N5, W5, Z5 | 4 in 21 |
| Tees | Violet to pink | T4, T5, Y5, F5, X5 | 5 in 21 |

Each shape in its reference position, the one rotation starts from. One
form of each mirror pair is drawn. In play, a piece may appear in any
orientation.

```
Straights
██    ████    ██████    ████████    ██████████
1     2       I3        I4          I5

Corners
                              ██
██          ██          ██    ██
████    ██████    ████████    ██████
L3      L4        L5          V5

Boxes
████    ████      ██  ██
████    ██████    ██████
O4      P5        U5

Zigzags
                      ██        ████
  ████    ████        ████        ██
████        ██████      ████      ████
S4        N5          W5        Z5

Tees
            ██                    ██        ██
  ██        ██          ██        ████    ██████
██████    ██████    ████████    ████        ██
T4        T5        Y5          F5        X5
```

The letters are the usual pentomino and tetromino names, with the size
added. The four-square mirror pairs keep their usual names, J4 and L4, S4
and Z4. A mirrored five-square piece takes a prime: L5′ is the mirror
image of L5.

The modern standard gives each of its seven pieces a colour. Pentrys does
the same for its 21 shapes. [Colours](#colours) gives the exact values,
and `tools/pentrys/colours.html` shows them all.

### Choosing pieces

- Each new piece is chosen at random in two steps. First the shape: each
  shape in play is equally likely. Grow sets the share of each size
  instead, as its table shows.
- Then its orientation: one of the 8 ways to rotate and reflect it, each
  equally likely. A shape with symmetry has fewer distinct orientations,
  and each of those is equally likely too.
- With every size on, five-square pieces make up 12 in 21 of all pieces,
  four-square pieces 5 in 21, and the smaller ones 4 in 21. The two forms
  of a mirror pair come equally often.
- I5, the only piece tall enough for five rows on its own, comes 1 time in
  21.
- The choice has no memory, so a shape can come twice in a row, or not for
  a long while. The queue and its cycle give the player control.

### The queue

- The next four pieces wait in a queue, each in the orientation it will
  have when it falls.
- Cycle sends the front piece to the back of the queue, and the other
  three move forward. It has no limit, so the player chooses which of the
  four falls next.
- It works at any time during play, while a piece falls or during a
  clear's pause.
- When the falling piece locks, the front piece falls next, and a new
  random piece joins the back.
- On a wide screen the queue sits to the right of the well: four slots in
  a column, with the front piece at the top, nearest to where it will
  appear. A slot fits any piece, 5 × 5 cells, so at the well's own scale
  the column is exactly as tall as the well. Each piece shows at the size
  it will have in the well.
- On a phone the queue shrinks to 0.6 of the well's scale. It goes beside
  the well or above it as a row, whichever leaves the larger well. A tall
  phone puts it above, with the front piece on the left.

### Where a piece appears

- In the orientation it had in the queue, centred at the top of the well,
  rounded to the left.
- Its bottom row sits in the well's top row. The rest is in the hidden
  rows, drawn over the top edge.

## Special squares

A plain square is worth 1. Four kinds of special square change that.

| Square | Chance, per square | Worth | What it does |
|---|---|---|---|
| 2 | 1 in 20 | 2 | Its row clears with one gap |
| 3 | 1 in 100 | 3 | Its row clears with two gaps |
| Glass | 1 in 200 | 0 | Solid, but counts nothing: its row needs a 2 or a 3 to clear |
| Flood | 1 in 200 | 1 | When its piece locks, it fills the gaps beside it and below it |

- A piece carries one special square at most. The game decides when the
  piece joins the queue. A piece of n squares carries one with chance
  n × 7/100. It is a 2, a 3, glass or a flood in the ratio 10 : 2 : 1 : 1,
  on a square chosen at random. The long-run rates stay exactly as the
  table says.
- A five-square piece carries one about 1 time in 3, and a single square 1
  time in 14. Across all shapes, 3 pieces in 10 carry one.
- The rates are high on purpose. Clean rows are hard to build from
  five-square pieces, and the 2s pay for the glass.
- A special square shows from the moment its piece joins the queue, and
  moves with its piece through the queue, rotation and flip. [Style](#style)
  says how each looks.

### Flood

- When a piece with a flood square locks, the flood fills each empty cell
  among the five beside it and below it: left, right, below left, below
  and below right. It leaves the three cells above alone, as water would.
- The filled cells become plain squares of the same piece, so the piece
  grows into the gaps. The flood square becomes a plain square.
- The flood reaches buried holes too. A hole under an overhang,
  diagonally below the flood, fills.
- Before the piece lands, its landing outline shows the cells the flood
  would fill.
- Rows are added up after the flood.

## Moving a piece

| Action | Keys | Touch |
|---|---|---|
| Move left or right | ← → | ◀ ▶ |
| Soft drop | ↓ | ▼ |
| Hard drop | Space | ⤓ |
| Rotate clockwise | X or ↑ | ↻ |
| Rotate anticlockwise | Z | ↺ |
| Flip, left to right | A or F | ⇆ |
| Cycle the queue | C or Shift | Cycle, or a tap on the queue |
| Pause | Escape or P | ⏸ |
| Restart | R | From the pause menu |
| Sound on or off | M | From the pause menu |

- The keys follow the modern standard's keyboard layout, as TetrisWiki
  records it: the arrows move, Space drops, and ↑, X and Z rotate. C and
  Shift, the keys other games give to hold, cycle the queue, the nearest
  thing to hold. A, the key some modern games give to a half turn, flips.
  The standard also rotates anticlockwise with Ctrl. Pentrys leaves Ctrl
  alone, since a browser acts on keys pressed with it.
- Keys go by position, so the layout works on any keyboard. The game keeps
  the arrows and Space for itself, so the page never scrolls during play.
- A click or a tap on the queue also cycles it.
- A held left or right moves once, again after 170 ms, then every 50 ms.
- Soft drop falls 20 rows a second, or at the level's speed if that is
  faster.
- Hard drop falls straight down and locks at once.
- Restart asks first while a run is on: R opens the pause menu with
  Restart chosen, so Enter restarts.
- An outline in the well, the landing outline, shows where the piece will
  land.

### The controls screen

- It opens from the title screen and from the pause menu.
- Each action takes up to two keys. Click an action's key, then press the
  new key. A key taken by another action moves across, and the screen
  says so.
- It also sets the three timings: the delay before a held key repeats
  (170 ms), the time between repeats (50 ms) and the soft drop speed (20
  rows a second).
- Reset puts every key and timing back to its default.
- The choices are kept in this browser between visits.

### Rotating and flipping

- A rotation or a flip keeps the piece's bottom row where it was. A piece
  lying down stands up on that row, and a piece standing up falls over
  onto it.
- Left to right, each piece turns about the centre of a square box as wide
  as its longest side, 1 to 5 cells. In its reference position, as drawn
  above, the piece fills the box's width and sits halfway down it, rounded
  towards the top. Rotate turns the box a quarter turn, and flip mirrors it
  left to right. So four rotations, or two flips, bring a piece back to
  exactly where it started.
- If the result overlaps a wall or a square, the game tries these shifts
  in order and keeps the first that fits. For anticlockwise, swap left and
  right. Flip uses the clockwise order.
  1. 1 left
  2. 1 right
  3. 2 left
  4. 2 right
- If nothing fits, the piece stays as it was.
- No shift goes up or down, so no move ever raises a piece, however fast
  the player rotates it.
- Rotation never delays the fall. The piece drops a row on the level's
  clock, however often it turns.
- Left to right, the four-square pieces turn as in the Super Rotation
  System of modern falling-block games. That system also moves pieces up
  and down as they turn, and a player spinning a piece against the stack
  can climb it. The cost of a fixed bottom row: a piece wedged in a tight
  spot may not turn until the player moves it.

### Falling and locking

- The piece falls one row at a time, at the level's speed.
- Once it rests on the floor or the stack, it locks after 0.5 s.
- A move, rotation or flip that works resets that time, up to 15 times per
  piece. A piece that falls to a new lowest row gets its 15 back.
- After the 15th reset, the piece locks as soon as it rests.
- When a piece locks, its flood square fills first, and then the rows are
  added up.
- The next piece appears at once, or after a clear's pause.
- A piece may lock with squares in the hidden rows. They stay there, and
  count towards their rows.
- The game ends when a new piece overlaps the stack where it appears.

## Clearing rows

- After a piece locks and any flood fills, each row is added up: 1 for a
  plain or flood square, 2 or 3 for a 2 or a 3, and 0 for glass or a gap.
- A row clears when its total reaches the width of the well. With no
  special squares that means a full row, as in every falling-block game.
- So a 2 lets its row clear with one gap, and a 3 with two. They add
  together: a row with a 2 and a 3 clears with three gaps. Glass takes one
  back, so a full row with glass and no 2 or 3 stays.
- A cleared row vanishes with its gaps, and every row above drops by one.
  Nothing else falls.
- Only the rows the piece landed in, and the row just below a flood
  square, can change. So one lock clears six rows at most: I5 standing up,
  with a flood square at its foot that completes the row below. A piece
  four rows tall, with a flood square at its foot, can clear five.
- A 2 or a 3 can rescue a buried hole. A 2 in a row whose only gap is
  covered clears that row, hole and all.
- Beside each row that holds a 2, a 3 or glass, the margin shows the row's
  balance: a hollow gold square for each gap the row may keep, or a small
  glass square for each point it lacks.
- Play pauses for 0.3 s while cleared rows vanish.

### Spare

- A row's spare is its total minus the width, when it clears. A row with
  no 2 or 3 has no spare.
- A 2 in a row with no gaps: 1 spare. A 3 with one gap: 1 spare. A 3 with
  no gaps: 2 spare.
- A row clears the moment its total reaches the width. So spare comes only
  when the last piece into the row fills two or more gaps at once, or
  brings the 2 or 3 with it.
- That gives the player a choice with each 2 or 3. Use it to clear a row
  with a gap now, or make it the last square of a clean row and take the
  bonus.

## Scoring

| Rows at once | Name | Points |
|---|---|---|
| 1 | Single | 1 × level |
| 2 | Double | 3 × level |
| 3 | Triple | 7 × level |
| 4 | Quad | 13 × level |
| 5 | Pentrys | 23 × level |
| 6 | Hextrys | 71 × level |

- Each point of spare doubles the clear: ×2 for 1 spare, ×4 for 2, ×8 for
  3, counting the spare of all the clear's rows together.
- A clear that empties the well, an all clear, scores ×10.
- Only clears score. Drops score nothing, so the score measures clearing,
  not fast fingers.
- The level that counts is the one in play before the clear. The level
  multiplies the points because a clear at level 15, where pieces fall in
  a blink, is harder than the same clear at level 1.
- For example, a Double at level 5 whose rows hold a 2 and no gaps scores
  3 × 5 × 2 = 30. A Pentrys at level 10 with a 3 and no gaps scores
  23 × 10 × 4 = 920.
- Four rows are a Quad, as in TETR.IO, so the game never uses the word
  Tetris. Five rows take the game's name, and six rows are a Hextrys.
- [Celebrations](#celebrations) says how the page marks each clear.

## Levels and speed

- The level rises by 1 for every 10 rows cleared, at any width.
- At level L a piece falls one row every 0.82^(L − 1) seconds, so each
  level cuts the time by 18%. The speed stops rising at level 20. The
  level keeps counting, for the score.

| Level | Seconds a row | Time to fall 20 rows |
|---|---|---|
| 1 | 1.00 | 20 s |
| 5 | 0.45 | 9 s |
| 10 | 0.17 | 3.4 s |
| 15 | 0.062 | 1.2 s |
| 20 on | 0.023 | 0.46 s |

- The modern standard starts the same but is steeper: 0.064 s a row by
  level 10. Five-square pieces need more thought, so Pentrys climbs more
  gently. The 0.5 s lock keeps level 20 playable.
- Speed rises with rows cleared, as in other falling-block games. A player
  who clears fast speeds up fast.

## Modes

### Title screen

PENTRYS, a button for each of the five modes, Settings, Controls, the best
scores for the chosen mode and settings, and How to play. On a first visit
the Tutorial button is the one lit. How to play says:

> Move, rotate and flip the falling pieces to fill rows. A full row
> clears. Cycle the queue to choose which piece falls next. A 2 counts as
> two squares, so its row clears with one gap, and a 3 counts as three.
> Glass counts nothing. A flood square fills the gaps beside and below it.
> Clear a row that holds a 2 or a 3 and has no gaps, and the clear scores
> double or more.

The simulated player plays a slow game in a dimmed well. On a wide screen
the menu takes the left column, widened, and the game plays beside it. On a
phone the menu covers the well, and its game waits.

### Tutorial

Eleven short lessons, each teaching one thing. A lesson starts from a set
well 10 wide, with its pieces set in order and one line of instruction.
Pieces fall at half the level 1 speed, a row every 2 s. Meeting the goal
passes the lesson and offers the next. If the last piece locks without it,
the lesson offers Try again. Passed lessons show a tick, kept in this
browser, and any lesson can be played in any order. Lessons record no
score.

The wells below show the bottom rows, top to bottom: `#` a plain square,
`.` a gap, `2` a 2 and `g` glass. The queue shows the lesson's remaining
pieces, and its empty slots stay empty.

| # | Lesson | Says | Well | Pieces | Goal |
|---|---|---|---|---|---|
| 1 | Move and drop | Move with ← and →, and drop with Space | `######...#` | I3 lying flat, three times | Clear a row |
| 2 | Rotate | Z and X rotate. Stand the piece up in the slot | `########.#` three times | I3 lying flat, twice | A Triple |
| 3 | Flip | A flips a piece. Flip this one, then stand it up | `######..##` over `#######.##` | Z4, twice | A Double |
| 4 | Cycle | C cycles the queue. Bring the O to the front, then drop this square in the slot on the right | `###..####.` over `###..#####` | A single square, then T4, S4, O4 and L3 | A Double |
| 5 | Twos | A 2 counts as two squares, so its row clears with one gap | `##.####.##` | A single square carrying a 2, twice | Clear a row with a gap |
| 6 | Threes | A 3 counts as three, so its row clears with two gaps | `#.###.##.#` | A single square carrying a 3, twice | Clear a row with two gaps |
| 7 | Spare | Fill every gap in a row that holds a 2, and the clear scores double | `##2###..##` | 2 lying flat, three times | A clear worth ×2 |
| 8 | Glass | Glass counts nothing, so its row needs a 2 or a 3 | `###g###.##` | A single square carrying a 2, twice | Clear the row with glass |
| 9 | Flood | A flood square fills the gaps beside and below it | `#####...##` over `#####.#.##` | I3 lying flat, with a flood square in the middle, twice | A Double |
| 10 | Pentrys | Stand the long piece up in the slot for five rows at once | `#########.` five times | I5 lying flat, twice | A Pentrys |
| 11 | Hextrys | A flood at the foot of I5 fills the row below too. Which way must it turn? | `#########.` five times, over `########.#` | I5 lying flat, with a flood square at its left end, twice | A Hextrys |

- The set squares of a lesson's well are stone grey.
- A lesson's clear shows only its spare's multiplier. A lesson's well
  often empties, and an all clear's ×10 would muddle the lesson.
- Lesson 3 needs S4 standing up, and its mirror, Z4, fits nowhere. So the
  player must flip.
- In lesson 11 an anticlockwise turn brings the left end, and the flood,
  to the foot. A clockwise turn puts the flood at the top, which gives
  only a Pentrys.

### Marathon

Endless. The level rises every 10 rows, and the run ends when the stack
reaches the top.

### Grow

The pieces grow with the level. Level 1 has the pieces of one to four
squares. Then five-square pieces come in at a rising share, and the
smallest size drops out each level, until only five-square pieces are
left.

| Level | Sizes | Five-square share |
|---|---|---|
| 1 | 1–4 | none |
| 2 | 1–5 | 20% |
| 3 | 2–5 | 40% |
| 4 | 3–5 | 60% |
| 5 | 4–5 | 80% |
| 6 on | 5 | all |

- The smaller sizes share the rest, with each of their shapes equally
  likely. So four-square pieces are 56% of level 1, and 20% of level 5.
- With every size on, as in Marathon, five-square pieces are 57% of all
  pieces. Grow passes that at level 4.
- A banner at each change shows the pieces that arrive or leave.
- The pieces already in the queue stay. New pieces come from the new mix.
- Otherwise as Marathon. The Pieces setting does not apply.
- Level 1 suits a first game: no five-square pieces, at the slowest speed.
  The end is very hard: from level 6, five-square pieces only, at a speed
  that keeps rising.

### Sprint

- Clear 40 rows as fast as possible. The speed stays at level 1, so hard
  drop is the main tool.
- The clock counts up, and the best times are kept.
- Topping out ends the run with no time.

### Blitz

- Score as much as possible in three minutes. The level rises every 10
  rows, as in Marathon.
- Topping out ends the run early, and its score stands.

## Settings and scores

- Width: 10, 12, 14, 16 or 18. Default 12.
- Pieces: any mix of sizes 1 to 5, at least one. Default all five. Grow
  ignores it.
- Special squares: on or off, all four kinds together. Default on.
- Effects: full or low. Default full, and the game switches to low by
  itself on a slow machine.
- Sound: on or off, and M does the same.
- The theme follows the site's light and dark switch, as Smash Screen
  does.
- The settings are kept in this browser, so the last setup is ready on the
  next visit.
- High scores are kept in this browser: the top 10 for each mode and set
  of settings. A top-10 run asks for three initials, as Smash Screen does.
  Sprint keeps times, best first.
- A run started from the address with a level or a seed is practice, and
  records no score.
- Pause offers Resume, Restart, Controls, Sound and Title screen. Hiding
  the tab pauses.
- Game over shows the score, rows, level, time and pieces, the count of
  each clear and the best multiplier. Then Play again and Title screen.

## Look

`tools/pentrys/look.html` draws a still frame of the look, with a stack
from a simulated game. `tools/pentrys/colours.html` shows all 21 colours
on both wells. The pictures beside them show the frame on a desktop, in
both themes, and on a phone. The build matches them, and can lift the
drawing functions in `tools/pentrys/look.js` as they are.

### Style

- Pentrys looks like a pentomino puzzle lit from inside. Each piece is one
  rounded shape, lit from above, with faint seams between its squares. It
  keeps that outline in the stack, and a thin gap separates it from its
  neighbours. So the stack reads as a set of whole shapes, as a pentomino
  puzzle does.
- A piece cut by a cleared row keeps the outline of what is left.
- In the dark theme the well is a night-blue panel, and the pieces are
  bright and glow against it. In the light theme the well is near white,
  and the pieces are deeper, with a thin dark edge. Both wells have a
  faint dot at each cell corner.
- The page around the game follows the site's theme. Behind it lies a
  wallpaper: the twelve pentominoes tiling a 10 × 6 rectangle, repeated,
  each in its own colour, pastel on the light page and dim on the dark
  one, fading towards the centre.

  ```
  ZIIIIIXPPP
  ZZZTWXXXPP
  LVZTWWXUUU
  LVTTTWWUFU
  LVVVNNYFFF
  LLNNNYYYYF
  ```

- The title is PENTRYS in block letters made of squares. P, N, T and Y take
  the colours of P5, N5, T5 and Y5, and S that of S4. E takes the colour
  of I3, and R that of L4.
- The falling piece glows in its colour. Its landing outline is its
  outline, with a faint fill.
- A 2 shows its number in a white ring. A 3 shows its number in a gold
  ring, with a soft gold glow.
- Glass is a pane you can see through: the well shows behind a faint tint
  of its piece's colour, with a sheen across it and a bright rim.
- A flood square shows a white drop in a pale aqua ring.
- The row gauge sits left of the well: small hollow gold squares for the
  gaps a row may keep, and small glass squares for the points it lacks.
- Text uses the system's own font. Numbers are bold, with figures of equal
  width, so the score does not jitter as it changes.

### Colours

Each shape's colour on the dark well and on the light well, from
`tools/pentrys/look.js`. The colours were chosen in OKLCH, a colour space
where equal numbers look equally light, with a hue for each shape along
its family's band and the strongest colour the screen can show.

| Shape | Family | Dark well | Light well |
|---|---|---|---|
| 1 | Straights | `#03e8e3` | `#039a97` |
| 2 | Straights | `#01d5ee` | `#0091a3` |
| I3 | Straights | `#06c2f8` | `#0588af` |
| I4 | Straights | `#3aadff` | `#057dc2` |
| I5 | Straights | `#5d94ff` | `#2867e4` |
| L3 | Corners | `#ff7267` | `#de3c37` |
| L4 | Corners | `#fe8056` | `#e44d05` |
| L5 | Corners | `#ff8c40` | `#db6902` |
| V5 | Corners | `#fe981a` | `#d57d04` |
| O4 | Boxes | `#feb930` | `#e9a60d` |
| P5 | Boxes | `#fbc906` | `#e1b303` |
| U5 | Boxes | `#f2da0d` | `#d5c006` |
| S4 | Zigzags | `#abe841` | `#78ab08` |
| N5 | Zigzags | `#76ec6b` | `#34b02a` |
| W5 | Zigzags | `#11ed8f` | `#04a964` |
| Z5 | Zigzags | `#04e5b4` | `#04a17e` |
| T4 | Tees | `#8782fe` | `#5d4ed6` |
| T5 | Tees | `#ac78ff` | `#7f45cd` |
| Y5 | Tees | `#cd70f0` | `#9b3ebc` |
| F5 | Tees | `#e96bd8` | `#b337a5` |
| X5 | Tees | `#fe6ab9` | `#c63288` |

| Use | Dark theme | Light theme |
|---|---|---|
| The well | `#151b3d` at the top, `#0a0d20` at the bottom | `#ffffff` at the top, `#edf0f7` at the bottom |
| Gold: 3s, multipliers and the gauge | `#ffd66b` | `#ffd66b` on pieces, `#a86f00` on the page |
| Danger | `#ff4d6d` | `#ff4d6d` |

### Motion

The rules move at once, and the drawing catches up within a few frames. No
animation holds up the player or the rules.

| Event | What moves | Time |
|---|---|---|
| Move, or fall a row | The piece slides to its new place, unless it falls faster than that | 40 ms |
| Rotate | The piece turns through the quarter turn, about the point that carries its old squares onto the new | 70 ms |
| Flip | The piece narrows to a line and opens mirrored, like a card turning over | 90 ms |
| Hard drop | A fading trail from where the piece was to where it lands. The well dips 3 px and springs back | 120 ms |
| Lock | The piece flashes bright | 90 ms |
| Flood | The new squares swell out of the flood square into the gaps | 150 ms |
| Clear | The rows flash. A gold line runs from each 2 or 3 to the gaps it fills. Each square bursts into small squares that fly and fade, and the rows above drop into place | The 0.3 s pause, then 400 ms |
| A 3 in the stack | A slow gold shimmer | Every 2.5 s |
| Score | Counts up to its new value | 300 ms |
| Level up | The well's rim glows, and the new level shows beside the well | 1 s |
| Cycle | The front piece slides to the back, and the others move up | 150 ms |
| Danger | Once the stack reaches the top four rows, the well's top edge glows red and pulses | Once a second |
| Game over | The stack drains to grey from the top down, then the game-over card rises | 1 s |

With reduced motion set in the browser, nothing slides, turns, dips,
bursts or pulses, and clears fade instead.

### Celebrations

The fuss grows with the clear, and never covers the well. On a wide
screen the clear's name, multiplier and points appear beside the well, at
the height of the rows that cleared. On a phone they take the title's
place in the bar across the top. The effects play on the well's rim, the
wallpaper and the page, and inside the well only the clearing rows flash.

| Clear | Fuss |
|---|---|
| Single | The name, small |
| Double | The name, larger, and a spray of squares from the ends of the rows |
| Triple | Larger again, and the well's rim glows |
| Quad | A wave of light crosses the wallpaper |
| Pentrys | The rim runs through all 21 colours, and the wallpaper pulses |
| Hextrys | All of that for twice as long, with the whole page flashing its colours |
| Any multiplier | The multiplier in gold beside the name, and bigger for ×4 and ×8 |
| All clear | ALL CLEAR in gold across the top of the well's frame |

- The names and numbers are page text, moved and faded with CSS, which the
  browser draws cheaply.
- Special sounds for the big clears come later.

### Layout

- A wide screen shows the scores on the left, the well in the centre and
  the queue on the right. The window's height sets the cell size, up to
  42 px, so the 20 rows and the room above them fill it. The key reminder
  sits at the foot of the left column, and the celebrations between.
- A phone shows the scores in a bar across the top, the buttons across the
  bottom and the well between them. The queue goes beside the well or
  above it, as [The queue](#the-queue) says.
- The touch buttons are two rows of four. The bottom row, nearest the
  thumbs, holds the ones used most: ◀ ▶ ↺ ↻. The top row holds ▼ ⤓ ⇆ and
  Cycle. A button held down repeats, as a held key does.
- Sizes snap to whole pixels, so edges stay sharp.

### Speed on old machines

- Canvas 2D, in three layers: the wallpaper, the well and the queue. No
  WebGL, libraries, image files or web fonts.
- The wallpaper is drawn once, and again only when the window's size or
  the theme changes.
- What stands still in the well is drawn once and kept: the panel, the
  dots and the stack. The stack is redrawn only when a piece locks or rows
  clear. Each frame copies these, and draws only what moves: the falling
  piece, its landing outline and the effects.
- Glows are drawn once into small images and copied. A frame uses no
  canvas shadows or filters.
- The canvas draws at the screen's pixel density, at most 2.
- At most 200 small squares fly at once.
- Frames run only while something moves. None run while the game is
  paused, while the tab is hidden, or once the game-over screen settles.
- When the median frame over the last 2 s takes longer than 12 ms, the
  game switches to low effects by itself: no bursts, trails or shimmer,
  and moves without slides. The Effects setting does the same by hand.
- The budget: in headless Chromium without a GPU, at 1280 × 800 and twice
  the pixel density, a frame's own work stays under 4 ms at the median
  during a Pentrys clear, and under 12 ms with the processor slowed four
  times.

Measured on 2026-10-01 in headless Chromium without a GPU, at 1280 × 800
and twice the pixel density. A frame's work is the script's time in the
frame: stepping the rules and issuing the drawing.

| Case | Median | 95th percentile |
|---|---|---|
| Play, at full speed | 0.3 ms | 0.9 ms |
| A Pentrys clear, at full speed | 0.2 ms | 0.4 ms |
| Play, with the processor slowed four times | 1.2 ms | 4.0 ms |
| A Pentrys clear, slowed four times | 0.6 ms | 1.3 ms |

- The slowest single frame is the one where a Pentrys clears: 16 ms at
  full speed and 49 ms slowed. It falls in the clear's pause, when nothing
  moves.
- The title screen's game held 60 frames a second at both speeds: 16.7 ms
  between frames at the median and 16.8 ms at the 95th percentile, with
  one frame dropped when slowed. Its simulated player weighs one queued
  piece a step, so its thinking never stalls a frame.
- The budget holds with room to spare.
- `tools/pentrys/perf.js` measures all of this again. From the repo root:
  `NODE_PATH=tools/tiling-video/node_modules node tools/pentrys/perf.js`,
  with `CHROMIUM` set to Playwright's headless Chromium.

## Sound

- Synthesised in the browser, as in Smash Screen, with no sound files.
- Short sounds for a move, a rotation, a flip, a cycle, a lock, a hard
  drop, a flood, a level up and the end of a game.
- A clear plays a chord from the harmonic series, in just intonation, that
  grows with the rows: harmonics 4 and 5 for a Single, 4 to 6 for a
  Double, and so on up to 4 to 10 for a Hextrys, all of one low C. Each 2
  or 3 in the cleared rows adds a bell.
- Sound starts after the player's first click or key, since browsers allow
  none before.
- Music comes later, as in Smash Screen.

## The address

| Address | Opens |
|---|---|
| `#mode=marathon` | Marathon with the saved settings. Also `grow`, `sprint`, `blitz` and `tutorial` |
| `#mode=marathon&width=14&sizes=45&specials=0` | Marathon at width 14, with four- and five-square pieces and no special squares |
| `#mode=grow&level=6` | Grow from level 6, as practice |
| `#mode=sprint&seed=42` | Sprint with a fixed run of pieces and special squares, as practice |
| `#mode=tutorial&lesson=9` | The tutorial at lesson 9 |

## Code

`rules.js` holds the game and nothing else: no page, no drawing and no
clock. It moves on in steps of 1/60 s, and takes its random numbers from a
seeded generator. So a seed and a list of inputs replay a game exactly.
The tests, the simulated player and a later promo video all run it this
way. The page runs it from the display's frames.

| File | What it holds |
|---|---|
| `app/pentrys/index.html` | The page, its styles, the screens and the touch buttons |
| `app/pentrys/pieces.js` | The 21 shapes, their orientations and colours, rotation, flip and the shifts |
| `app/pentrys/rules.js` | The well, choosing pieces, the queue, special squares, falling, locking, the flood, clearing, scoring, levels and modes |
| `app/pentrys/lessons.js` | The tutorial's eleven lessons: wells, pieces, words and goals |
| `app/pentrys/bot.js` | The simulated player's choice of placement, for the title screen and `sim.js` |
| `app/pentrys/draw.js` | Drawing: the wallpaper, the well, the pieces, the queue and every effect |
| `app/pentrys/sound.js` | The sounds, synthesised |
| `app/pentrys/game.js` | The main loop, input, the screens, settings, controls, high scores and the address |
| `tools/pentrys/test.js` | The tests, in Node |
| `tools/pentrys/sim.js` | The simulated player, in Node, with `bot.js` |
| `tools/pentrys/perf.js` | Frame times, measured in headless Chromium |
| `tools/pentrys/look.html`, `look.js`, `colours.html` | The still frame of the look and the colour sheet, with their pictures |

The tests cover:

- The shapes: 21 in all, 1, 1, 2, 5 and 12 by size, none repeated, with 91
  orientations. Four rotations bring each piece back to its start. A flip
  turns each piece into its mirror, and a second flip turns it back.
- Where a piece appears at each width. A rotation or a flip keeps the
  bottom row, a piece against each wall rotates, and a thousand fast
  rotations never lift a piece.
- The clear rule: a full row, a 2 with one gap, a 3 with two, a 2 and a 3
  with three, glass with and without a 2, and rows one short of each.
- The flood: it fills left, right and the three cells below, never above,
  and joins its piece. I5 with a flood at its foot clears six rows.
- Spare, the multipliers, the all clear and the level in the score.
- The lock time and its 15 resets, and the end of the game.
- The queue: cycle sends the front piece to the back, and a lock takes the
  front piece and adds a new one at the back.
- Over a million pieces, each shape comes 1 time in 21 and each of its
  orientations equally often. Special squares land at their rates.
- Grow's mix at each level matches its table.
- Each lesson: its intended moves meet its goal, and the obvious wrong
  move does not.

## Simulated player

- `sim.js` plays with no page. For the falling piece it tries every
  column, rotation and flip. It picks the placement that leaves the fewest
  holes and the lowest, flattest stack, and favours rows cleared. Then it
  cycles the queue to bring forward the piece that best fits the new
  stack.
- It plays a dozen games of Marathon at each width by default, with
  special squares on and off, and with the cycle used and unused. It
  reports rows per game, the share of clears that use a gap or earn a
  spare, how often each clear size comes, and how long games last.
- Those numbers tune the special-square rates. The rates are four numbers
  to change.
- It places pieces at once, so the speeds need a person to play them.
- The title screen shows it playing, with the same `bot.js`.

The first measurements, on 2026-10-01: 12 games for each setting, each
stopped at 1,500 pieces if it lasted that long.

| Width | Special squares | Cycle | Pieces a game | Rows a game | Rows that kept a gap | Clears with spare | Rows with a special square | Rows with glass |
|---|---|---|---|---|---|---|---|---|
| 12 | on | used | 1,118, 1 game of 12 lasting | 398 | 44% | 20% | 58% | 2.0% |
| 12 | off | used | 1,500, every game lasting | 527 | – | – | – | – |
| 12 | on | unused | 862, none lasting | 304 | 43% | 20% | 56% | 2.5% |
| 12 | off | unused | 1,500, every game lasting | 526 | – | – | – | – |
| 10 | on | used | 1,016, none lasting | 436 | 39% | 17% | 51% | 1.5% |
| 14 | on | used | 1,236, 2 lasting | 378 | 48% | 22% | 63% | 3.0% |
| 16 | on | used | 1,383, 5 lasting | 371 | 53% | 24% | 68% | 3.8% |
| 18 | on | used | 1,415, 7 lasting | 338 | 57% | 25% | 72% | 5.0% |

- For this player the special squares shorten games, because of glass. It
  never aims a 2 at a row that holds glass, so such a row stays for good.
  A person who does will fare better.
- The cycle lengthens its games by a third: 1,118 pieces against 862.
- It clears one row at a time: at width 12, 93% of its clears are Singles
  and 6.5% Doubles, since its measure keeps the stack low. A person
  building for a Pentrys plays otherwise.
- A flood came 2 times in 100 pieces, at every width.

## Later

- Music, as in Smash Screen, once David has written it, and special
  sounds for the big clears.
- Install on a phone as an app. A web app manifest, icons drawn from the
  title's letters by a tools script, and a service worker that keeps the
  game's files for offline play, versioned so that an update replaces
  them. It waits until the game is stable, so the phone never holds on to
  an early build.
- Resume a run. Leaving the page keeps the run in one slot, and resuming
  deletes the slot, so a saved run cannot be replayed for a better score.
  Useful on a phone, where a call ends a run today.
- Bombs. A square that blasts a hole around it when its row clears.
  Bombliss did this in 1991, and four of its bombs in a 2 × 2 fuse into a
  big one.
- Six-square pieces after Grow's last level: 35 more shapes, as MultiMino
  has.
- A daily game. One seed a day gives everyone the same pieces, and the
  score can be shared.
- Combos and back-to-back bonuses from the modern standard.
- Swipe controls on phones.

## Similar games

Most of Pentrys exists somewhere already. The special squares were not
found in any game, and nor were spare, its multiplier, or a queue the
player can cycle.

| Game | What it shares with Pentrys |
|---|---|
| Pentix, a DOS game, and clones such as [Pentris](https://amanon.itch.io/pentris), [Pentrix](https://adi-mathur.itch.io/pentrix) and Pentix Nova | Falling pentominoes |
| [Pent-up](https://tetris.wiki/Pent-up), 2019 | All 29 pieces of one to five squares, wells 10, 12 or 14 wide and 20 high, six pieces of preview, hold, and a five-row clear named Pentris |
| [Techmino](https://tetris.wiki/Techmino) | A 40-row sprint with the 18 five-square pieces, and one with the pieces of one to three squares |
| [Pentis](https://hellsnake.itch.io/pentis) | Pentominoes with a flip key |
| Pokémon Tetris | A flip control, in a licensed game |
| EGAint, a DOS game | Harder settings with bigger pieces, up to eight squares |
| [MultiMino](https://stellartophat.itch.io/multimino) | The modern standard carried to five- and six-square pieces |
| [TETR.IO](https://tetrio.wiki.gg/wiki/Pieces) | Four rows called a Quad, and a pentomino event |
| [Tetris 2 + BomBliss](https://tetris.wiki/Bombliss), Super Tetris, Tetris Blast | Bombs in pieces that go off when their row clears |
| [TetriNET](https://en.wikipedia.org/wiki/TetriNET) | Special blocks, collected when their row clears |
| [Bloxeed](https://tetris.wiki/Bloxeed) | Power blocks marked with letters and numbers, each with its own effect |
| Tenfall, Tregolis, Block X | Numbered falling blocks that clear when neighbours add up to a target |

The searches for squares worth more than one, joker or wild blocks, rows
that clear with a gap, and a queue the player can reorder found nothing.
TetrisWiki's page on [line clears](https://tetris.wiki/Line_clear) lists
no game where a row clears before it is full. The nearest thing to the
cycle is hold, the modern standard's one-piece swap.

The modern standard's numbers and keys come from TetrisWiki's pages on the
[guideline](https://tetris.wiki/Tetris_Guideline),
[scoring](https://tetris.wiki/Scoring) and
[Marathon](https://tetris.wiki/Marathon).

The look must be Pentrys's own. In
[Tetris Holding v. Xio Interactive](https://www.loeb.com/en/insights/publications/2012/06/tetris-holding-llc-v-xio-interactive-inc),
2012, a US court held that the rules of Tetris are free to use, but the
look of its pieces and its well is protected. Pentrys has its own piece
set, colours and default width.
