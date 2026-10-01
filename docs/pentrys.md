# Pentrys

## Summary

Pentrys is a falling-block game for the builder page, the fourth under
Games. Pieces of one to five squares, chosen at random, fall down a well.
The player moves, rotates and flips each one to fill rows. A full row
clears. The pieces fall faster as the game goes on, and the game ends when
the stack reaches the top.

Two rules are new. Some squares are special, and a row clears when its
squares add up to the width of the well. A 2 lets its row clear with one
gap and a 3 with two, and glass counts nothing. Floods and deluges fill
gaps as they land, a bomb blasts a hole, and a row bomb clears its whole
row. The queue of the next four pieces also cycles without limit, so the
player picks which one falls next. Other games already have falling
pentominoes, all 29 pieces of one to five squares, a flip control and a
choice of well width.
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
- [x] Tests for both, in Node
- [x] A simulated player in Node, and its first measurements
- [x] The page: the well, the queue, the score, and keyboard and touch
      controls, in the look of the still frame
- [x] The motion, the celebrations, the title screen's game, pause and game
      over
- [x] The tutorial's lessons: thirteen basics, then eight advanced
- [x] Settings, the controls screen, high scores and the address
- [x] Sound effects, not yet heard by a person: a headless browser plays
      no sound
- [x] Frame times measured, at full speed and on a slowed processor
- [x] The short address, drbuild.uk/pentrys
- [x] David's first review: each square special on its own, the deluge,
      bombs and row bombs, three ways for glass to break, the Pure, Plus
      and Pentrys square sets, left-handed keys, combo scoring and its
      display, and a gentler climb in speed
- [x] Tests in Node: 80, all passing
- [x] The builder page entry and its picture
- [x] Fits every screen: a larger well on a monitor, touch buttons on an
      iPad and on a phone held sideways, and a full-screen button, checked
      with `tools/screen-fit/check.js`
- [ ] David plays each mode again, and the speeds and special-square rates
      are tuned
- [ ] Try it on a real phone and in Safari
- [ ] The share card
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
- On a touch screen held sideways the queue shares its column with the
  buttons below it, so it shrinks to fit. It goes in a column or a row,
  whichever gives the larger slots: a column on an iPad, a row on a phone.

### Where a piece appears

- In the orientation it had in the queue, centred at the top of the well,
  rounded to the left.
- Its bottom row sits in the well's top row. The rest is in the hidden
  rows, drawn over the top edge.

## Special squares

A plain square is worth 1. Seven kinds of special square change that, or
act as they land.

| Square | Chance, per square | Worth | What it does |
|---|---|---|---|
| 2 | 1 in 25 | 2 | Its row clears with one gap |
| 3 | 1 in 100 | 3 | Its row clears with two gaps |
| Glass | 1 in 100 | 0 | Solid, but counts nothing: its row needs a 2 or a 3. It also breaks three ways |
| Flood | 1 in 100 | 1 | Fills the gaps beside it and below it as it lands |
| Deluge | 1 in 300 | 1 | Fills the gaps a flood would, and every hole they lead to, however deep |
| Bomb | 1 in 50 | – | Destroys every square in the 3 × 3 block round it as it lands, its own piece included |
| Row bomb | 1 in 300 | – | Clears its whole row as it lands, whatever the row holds |

- Each square of a new piece is special or not on its own, at the rates
  above, so a piece can carry several special squares.
- 1 piece in 3 carries at least one. 1 in 17 carries two or more, 1 in 190
  three or more, 1 in 4,000 four or more, and about 1 in 200,000 carries
  five.
- The game decides when the piece joins the queue. A special square shows
  from that moment, and moves with its piece through the queue, rotation
  and flip. [Style](#style) says how each looks.
- Glass comes as often as a 3, since three things break it.

### Square sets

The title screen offers three sets of special squares, and every mode plays
with any of them.

| Set | Special squares |
|---|---|
| Pure | None: the 21 shapes and nothing else |
| Plus | 2s and 3s, at the rates above |
| Pentrys | All seven. The default |

### When a piece lands

One order settles any mix of special squares on a piece:

1. Hard drop: a piece that lands on glass, and nothing else, smashes it and
   falls on.
2. Every bomb on the piece goes off, and the squares above each crater
   break into single squares and fall as far as they can.
3. Every flood and deluge fills. One caught in a blast still pours, from
   where its square was.
4. Every row that adds up to the width clears, along with each row bomb's
   row, as one clear.

A 2, a 3 or glass caught in a blast is destroyed with it.

### Flood

- A flood fills each empty cell among the five beside it and below it:
  left, right, below left, below and below right. It leaves the three cells
  above alone, as water would.
- The filled cells become plain squares of the same piece, so the piece
  grows into the gaps. The flood square becomes a plain square.
- The flood reaches buried holes too. A hole under an overhang, diagonally
  below the flood, fills.

### Deluge

- A deluge fills the five cells a flood fills, then every hole those cells
  lead to through other holes, below its own row, however deep.
- A hole is a gap with a square somewhere above it. So the water fills
  caves and shafts under the stack, and stays out of the open well above
  it. A deluge on top of a tower fills no more than a flood.
- The filled cells become plain squares of the deluge's piece.

### Bombs

- A bomb goes off as its piece locks. It destroys every square in the
  3 × 3 block round it: the stack's squares, glass, and its own piece.
- Then the crater closes. In all three of the blast's columns, every
  square above the blast's top row breaks away from its piece as a single
  square and falls as far as it can: through the crater, and on through
  any gaps below it. That holds even in a column where the blast hit only
  air.
  This is the one place in Pentrys where squares fall.
- A flood, deluge or row bomb on the same piece falls with its square. One
  the blast took acts from where it was.
- A bomb's own square always goes, so no bomb stays in the stack.

### Row bombs

- A row bomb clears its whole row as its piece locks, whatever the row
  holds, gaps and glass included. The rows above drop by one, as in any
  clear.
- Its row joins any other rows the piece clears, and they score as one
  clear.

### Glass

Glass counts nothing, so a full row with glass stays until a 2 or a 3 pays
for it. Three other things break it.

- A hard drop. A piece hard-dropped onto glass, and nothing else, smashes
  it and falls on through. If other squares also hold the piece up, the
  glass holds, since breaking it would leave a hole under the piece. A
  soft landing never smashes glass.
- A bomb, as with any other square.
- Age. Glass shows a crack after 30 s in the stack, a second crack at
  45 s, flashes from 57 s, and breaks at 60 s. Paused time does not count.
  The rest of its piece stays, and its outline splits if the glass joined
  two parts. Glass in a lesson never ages.

### The landing outline

For a piece with special squares, or one that will smash glass, the
landing outline shows what a hard drop would do. [Style](#style) gives the
colours.

## Moving a piece

| Action | Right-handed keys | Left-handed keys | Touch |
|---|---|---|---|
| Move left or right | ← → | A D | ◀ ▶ |
| Soft drop | ↓ | S | ▼ |
| Hard drop | Space | Space | ⤓ |
| Rotate clockwise | X or ↑ | L or → | ↻ |
| Rotate anticlockwise | Z | J or ← | ↺ |
| Flip, left to right | A or F | K or ↓ | ⇆ |
| Cycle the queue | C or Shift | I or ↑ | Cycle, or a tap on the queue |
| Pause | Escape or P | Escape or P | ⏸ |
| Restart | R | R | From the pause menu |
| Sound on or off | M | M | From the pause menu |

- The title screen's Keys setting picks a layout. Right-handed is the
  default.
- Left-handed puts the moves under the left hand, on A, S and D, and the
  turns under the right, on J, K, L and I or the arrows. Space stays the
  hard drop. The phone buttons already work this way round: the moves sit
  under the left thumb, and the turns under the right.
- The right-handed keys follow the modern standard's keyboard layout, as TetrisWiki
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
- Left-handed and Right-handed, at the top of the screen, put every key back to that layout, and
  every timing back to its default. Once a key changes by hand, the title
  screen's Keys setting shows Custom.
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
- Once it rests on the floor or the stack, it locks after 1.25 times the
  time it takes to fall a row: 1.25 s at level 1, 0.92 s at level 5 and
  0.63 s at level 10. It never locks sooner than 0.5 s, which holds from
  level 13 on. A lesson falls at half speed, so a resting piece there
  waits 2.5 s.
- That time to slide a resting piece sideways, under an overhang or into a
  gap, matters more here than in most games.
- A move, rotation or flip that works resets that time, up to 15 times per
  piece. A piece that falls to a new lowest row gets its 15 back.
- After the 15th reset, the piece locks as soon as it rests.
- When a piece locks, its special squares act in the order
  [When a piece lands](#when-a-piece-lands) gives, and then the rows are
  added up.
- The next piece appears at once, or after a clear's pause.
- A piece may lock with squares in the hidden rows. They stay there, and
  count towards their rows.
- The game ends when a new piece overlaps the stack where it appears.

## Clearing rows

- After a piece locks and its special squares act, each row is added up:
  1 for a plain square, 2 or 3 for a 2 or a 3, and 0 for glass or a gap.
- A row clears when its total reaches the width of the well. With no
  special squares that means a full row, as in every falling-block game.
- So a 2 lets its row clear with one gap, and a 3 with two. They add
  together: a row with a 2 and a 3 clears with three gaps. Glass takes one
  back, so a full row with glass and no 2 or 3 stays.
- A cleared row vanishes with its gaps, and every row above drops by one.
  Nothing else falls.
- A deluge reaches holes far below its piece, so one lock can clear more
  than six rows. Without one, six is the most: I5 standing up, with a
  flood square at its foot that completes the row below.
- A row bomb's row clears too, whatever it holds.
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

A lock scores its rows, times every bonus they earn, plus flat points for
smashing, blasting and filling, all times the level. Drops score on top,
without the level.

| Rows at once | Name | Points |
|---|---|---|
| 1 | Single | 100 |
| 2 | Double | 300 |
| 3 | Triple | 700 |
| 4 | Quad | 1,300 |
| 5 | Pentrys | 2,300 |
| 6 | Hextrys | 7,100 |
| 7 | 7 rows | 10,650 |
| 8 | 8 rows | 15,975 |
| More | The count | Each row past six adds half the points of one row fewer |

Bonuses multiply the row points, and each other.

| Bonus | When | Multiplier |
|---|---|---|
| Spare | The clear's rows hold 1, 2, 3, or 4 or more spare between them | ×1.2, ×1.3, ×1.5, ×1.8 |
| Glass | Each glass square in a cleared row | ×1.5 each |
| Crystal | Each cleared row that holds glass and has spare | ×2 each |
| Streak | The 3rd clear on consecutive pieces, then the 4th, and on | ×1.2, ×1.3, and on |
| All clear | The clear empties the well | ×2 |

Flat points, added after the bonuses and multiplied by the level:

| What | Points |
|---|---|
| Smash: glass broken by a hard drop | 100 each |
| Blast: squares a bomb destroys | 10 each, and 100 for glass |
| Flood or deluge | 10 for each gap filled |
| Glass that breaks with age | 0 |

Drops, not multiplied by the level:

| Drop | Points |
|---|---|
| Soft drop | 1 for each row the piece falls while it is held |
| Hard drop | 2 for each row the piece falls |

- So a lock scores level × (row points × bonuses + flat points), plus its
  drops.
- Each clear scores more than the same rows cleared in smaller groups: a
  Triple's 700 beats the 400 of a Double and a Single.
- A row bomb's row counts in the clear like any other.
- A streak counts consecutive pieces that each clear. A piece that clears
  nothing ends it.
- A flat bonus for a hard drop would pay more for a soft drop to the floor
  and then a hard drop. So the hard drop pays by the row.
- The level that counts is the one in play before the clear. A clear at
  level 15, where pieces fall fast, is harder than the same clear at
  level 1.
- For example, a Double at level 5 whose rows hold a 2 and no gaps scores
  300 × 1.2 × 5 = 1,800. A Triple at level 3 that clears glass in a row
  with 1 spare scores 700 × 1.2 × 1.5 × 2 × 3 = 7,560.
- Four rows are a Quad, as in TETR.IO, so the game never uses the word
  Tetris. Five rows take the game's name, and six rows are a Hextrys.
- [Celebrations](#celebrations) says how the page shows each combo.

## Levels and speed

- The level rises by 1 for every 10 rows cleared, at any width.
- At level L a piece falls one row every 1.08^−(L − 1) seconds, so each
  level falls 8% faster than the one before. The speed stops rising at
  level 50, at 0.023 s a row. The level keeps counting, for the score.

| Level | Seconds a row | Time to fall 20 rows |
|---|---|---|
| 1 | 1.00 | 20 s |
| 10 | 0.50 | 10 s |
| 20 | 0.23 | 4.6 s |
| 30 | 0.11 | 2.1 s |
| 40 | 0.050 | 1.0 s |
| 50 on | 0.023 | 0.46 s |

- The modern standard starts the same but is far steeper: 0.064 s a row by
  level 10. Pentrys is harder and less familiar, so it climbs gently, and
  reaches that speed only at level 37. The lock's 0.5 s floor keeps the top speed
  playable.
- Speed rises with rows cleared, as in other falling-block games. A player
  who clears fast speeds up fast.

## Modes

### Title screen

PENTRYS, then three groups, each holding the choices that work together:

- Learn: the Tutorial, and How to play. The square sets, width and pieces
  do not apply to the tutorial, which sets its own.
- Play: the three square sets with a line on the one chosen, the width,
  the piece sizes, a button for each of the four playing modes with its
  best score for those settings, and High scores.
- Set up: the key layout with a button to Controls, effects and sound,
  which apply everywhere.

On a first visit the Tutorial button is the one lit. How to play says how to move, then shows each special
square with a picture and one line, then the points and bonuses, then the
keys. Its opening:

> Move, rotate and flip the falling pieces to fill rows. A full row
> clears. Cycle the queue to choose which piece falls next.

The simulated player plays a slow game in a dimmed well. With a keyboard
the menu takes the left column, widened, and the game plays beside it. On a
touch screen the menu covers the well, and its game waits.

### Tutorial

21 short lessons. The first thirteen teach one thing each, and the
advanced eight put two or three ideas together. No lesson shows a clear
past a Quad, a Triple or Quad with a bonus, or the rarer bonuses: Crystal,
Streak and the all clear. Players find those, and the Pentrys and Hextrys,
for themselves. A lesson starts from a set
well 10 wide, with its pieces set in order and one line of instruction.
Pieces fall at half the level 1 speed, a row every 2 s. Meeting the goal
passes the lesson and offers the next. If the last piece locks without it,
the lesson offers Try again. Passed lessons show a tick, kept in this
browser by title, and any lesson can be played in any order. Lessons
record no score.

The wells below show the bottom rows, top to bottom: `#` a plain square,
`.` a gap, `2` a 2 and `g` glass. The queue shows the lesson's remaining
pieces, and its empty slots stay empty.

| # | Lesson | Says | Well | Pieces | Goal |
|---|---|---|---|---|---|
| 1 | Move and drop | Move with ← and →, and drop with Space | `######...#` | I3 lying flat, three times | Clear a row |
| 2 | Rotate | Z and X rotate. Stand the piece up in the slot | `########.#` three times, over `........#.` | I3 lying flat, twice | A Triple |
| 3 | Flip | A flips a piece. Flip this one, then stand it up | `######..##` over `#######.##` | Z4, twice | A Double |
| 4 | Cycle | C cycles the queue. Bring the O to the front, then drop this square in the slot on the right | `###..####.` over `###..#####` | A single square, then T4, S4, O4 and L3 | A Double |
| 5 | Twos | A 2 counts as two squares, so its row clears with one gap | `##.####.##` | A single square carrying a 2, twice | Clear a row with a gap |
| 6 | Threes | A 3 counts as three, so its row clears with two gaps | `#.###.##.#` | A single square carrying a 3, twice | Clear a row with two gaps |
| 7 | Spare | Fill every gap in a row that holds a 2, and the clear earns a spare bonus | `##2###..##` | 2 lying flat, three times | A clear with spare |
| 8 | Glass | Glass counts nothing, so its row needs a 2 or a 3 | `###g###.##` | A single square carrying a 2, twice | Clear the row with glass |
| 9 | Smash | A hard drop onto glass, and nothing else, smashes it. Glass also breaks by itself after a minute | `######g###` | A single square, twice | Smash the glass |
| 10 | Flood | A flood square fills the gaps beside and below it | `#####...##` over `#####.#.##` | I3 lying flat, with a flood square in the middle, twice | A Double |
| 11 | Deluge | A deluge fills every hole below it that water could reach, however deep. Land it over the gap | `######.###` over `#####...##` | I3 lying flat, with a deluge in the middle, twice | A Double |
| 12 | Bomb | Glass blocks this row for good. Drop the bomb next to the glass to blast it out, then fill the hole with the next piece | `####g#####` | A single square carrying a bomb, then I3 lying flat, twice | Blast the glass, then clear the row |
| 13 | Row bomb | A row bomb clears its whole row as it lands, whatever the row holds | `##g###g.##` | A single square carrying a row bomb, twice | Clear the row with glass |
| 14 | Rescue | The hole in this row is buried. A 3 pays for it and the gap beside it, so the row clears anyway | `...#......` over `###.####..` | A single square carrying a 3, twice | Clear a row with a buried hole |
| 15 | Two spare | Fill all three gaps in the row with the 3, and it clears with two spare: ×1.3 | `#3###...##` | I3 lying flat, twice | Clear a row with two spare |
| 16 | Quad | Park the O somewhere harmless, cycle the I4 to the front, then stand it in the slot | `#########.` four times | O4, T4, I4 and O4 | A Quad |
| 17 | Double smash | Glass stacked on glass: a hard drop smashes through both, and the piece fills both rows | `#######g##` twice | 2 standing, twice | Two smashes and a Double |
| 18 | Under the overhang | The flood reaches the gaps beside its square, even under the overhang where no piece fits | `#####.####` over `####...###` | 2 standing, with a flood at its foot, twice | A Double |
| 19 | Crater | Drop the bomb down the gap to blast both panes of glass, then fill the crater with three standing pieces | `####g.####` over `####g#####` | A single square carrying a bomb, then 2 standing, four times | A Double |
| 20 | Row bomb Double | One square fills the top row, and the row bomb below it clears the glass row as well | `#########.` over `##g###g##.` over `#........#` | 2 standing, with a row bomb at its foot, twice | A Double with a row bomb |
| 21 | Bomb and deluge | This piece carries a bomb and a deluge. The bomb goes off first, then the water refills the crater. Blast the glass in the corner | `g#########` | 2 lying flat, with a bomb on its left square and a deluge on its right, twice | Clear the glass row |

- The set squares of a lesson's well are stone grey.
- The keys in a lesson's words are the player's own. With the left-handed
  layout, lesson 1 says A and D.
- A lesson's clear shows its combo like any other.
- Lesson 3 needs S4 standing up, and its mirror, Z4, fits nowhere. So the
  player must flip.
- In lesson 9 the row is full apart from its glass, so only a smash clears
  it. A soft landing leaves the glass whole.
- In lesson 2 a stone square under the slot keeps the well from emptying,
  so the Triple shows no all clear.
- In lesson 11 the deluge must land over the gap. Anywhere else, the cells
  below it are full, and nothing fills.
- In lesson 12 the bomb lands beside the glass and blasts a crater three
  wide in the stuck row, glass and all. I3 lying flat fills it, and the row
  clears. Dropped straight onto the glass, the bomb smashes it first, then
  blasts, and the crater still takes I3.

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
- Squares: Pure, Plus or Pentrys, on the title screen above the modes.
  Default Pentrys.
- Keys: Right-handed or Left-handed. Default right-handed.
- Effects: full or low. Default full, and the game switches to low by
  itself on a slow machine.
- Sound: on or off, and M does the same.
- The theme follows the site's light and dark switch, as Smash Screen
  does.
- The settings are kept in this browser, so the last setup is ready on the
  next visit.
- High scores are kept in this browser: the top 10 for each mode and set
  of settings, the square set included. A top-10 run asks for three
  initials, as Smash Screen does. Sprint keeps times, best first.
- The points changed with the first review, so scores from before it stay
  in the browser unused.
- A run started from the address with a level or a seed is practice, and
  records no score.
- Pause offers Resume, Restart, Controls, Sound and Title screen. In a
  lesson the last is All lessons. A click or tap anywhere outside the menu
  resumes. Hiding the tab pauses.
- The way back is always in sight. Each page off the title screen has a
  ← Back button in a header that stays put as the page scrolls. In a run,
  the PENTRYS logo at the top of the scores goes back to the title screen:
  at once from a lesson, a finished run or one not yet started, and
  through the pause menu, with Title screen chosen, from a scored run in
  play. The buttons after a game stay at the foot of its card as it
  scrolls.
- Game over shows the score, rows, level, time and pieces, the count of
  each clear and the best combo's multiplier. Then Play again and Title
  screen.

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
- A flood square shows a white drop in a pale aqua ring, and a deluge two
  smaller drops in a blue ring.
- A bomb shows a round black bomb with a lit fuse, in an orange ring. A row
  bomb shows a smaller bomb on a white double arrow across the square, in a
  pink ring.
- Ageing glass shows one white crack from 30 s and three more from 45 s,
  and flashes white over its last 3 s.
- The landing outline of a piece with special squares, or one that will
  smash glass, shows what a hard drop would do: rows that will clear in
  faint gold, a row bomb's row in pink, squares a bomb will destroy in
  orange, gaps a flood or deluge will fill as aqua dashes, and glass that
  will smash cracked.
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
| Deluge | The water reaches each gap in turn, nearest first, and lights it aqua | 300 ms |
| Blast | A flash swells from the bomb, the destroyed squares burst, and the well shakes | 320 ms |
| Row bomb | A beam runs from the bomb along its row to both walls | 300 ms |
| Smash | The glass flashes white and bursts into shards | 220 ms |
| Glass breaking with age | The same shards | 220 ms |
| Clear | The rows flash. A gold line runs from each 2 or 3 to the gaps it fills. Each square bursts into small squares that fly and fade, and the rows above drop into place | The 0.3 s pause, then 400 ms |
| A 3 in the stack | A slow gold shimmer | Every 2.5 s |
| Score | Counts up to its new value | 300 ms |
| Level up | The well's rim glows, and the new level shows beside the well | 1 s |
| Cycle | The front piece slides to the back, and the others move up | 150 ms |
| Danger | Once the stack reaches the top four rows, the well's top edge glows red and pulses | Once a second |
| Game over | The stack drains to grey from the top down, then the game-over card rises | 1 s |

With reduced motion set in the browser, nothing slides, turns, dips,
shakes, bursts or pulses, and clears fade instead.

### Celebrations

Every lock that scores shows a combo, and the fuss grows with it, but
never covers the well. The effects play on the well's rim, the wallpaper
and the page, and inside the well only the clearing rows flash.

- Beside the well the combo appears at the height of the
  rows that cleared: the clear's name and its total multiplier, then a
  line for each bonus with its multiplier or points, the level last, and
  the points scored. The lines arrive one by one, and the combo stays
  longer the more lines it has.
- On a phone the clear's name and total multiplier take the title's place
  in the bar across the top.
- A lock that clears nothing but smashes, blasts or fills shows a small
  combo of its own.
- A combo plays a rising bell for each bonus that multiplies.

| Clear | Fuss |
|---|---|
| Single | The name, small |
| Double | The name, larger, and a spray of squares from the ends of the rows |
| Triple | Larger again, and the well's rim glows |
| Quad | A wave of light crosses the wallpaper |
| Pentrys | The rim runs through all 21 colours, and the wallpaper pulses |
| Hextrys | All of that for twice as long, with the whole page flashing its colours |
| Any multiplier | The multiplier in gold beside the name, and bigger for ×4 and ×8 |
| A blast that clears nothing | A warm glow pulses across the page |
| All clear | ALL CLEAR in gold across the top of the well's frame |

- The names and numbers are page text, moved and faded with CSS, which the
  browser draws cheaply.
- Special sounds for the big clears come later.

### Layout

The game picks one of three layouts, and sets it as a class on the page:
`phone`, `hand`, or neither for a keyboard. It reads the page's own size,
`clientWidth` and `clientHeight`, since a phone's `innerWidth` grows with
anything wider than the screen. The rules all the site's games follow are in
[screen-fit.md](screen-fit.md).

- **Keyboard**, for a fine pointer: the scores on the left, the well in
  the centre and the queue on the right. The window's height sets the cell
  size, up to 72 px, so the 20 rows and the room above them fill it. Past
  the 42 px squares a laptop shows, the score panel and key reminder zoom
  with the well, up to 1.6 times. The key reminder sits at the foot of the
  left column, and the celebrations between.
- **Phone**, for a touch screen held upright or any window 640 px wide or
  less: the scores in a bar across the top, the buttons across the bottom
  and the well between them. The queue goes beside the well or above it,
  as [The queue](#the-queue) says. An iPad held upright uses this layout
  too.
- **Hand**, for a touch screen held sideways: the well in the middle at the
  full height, the scores on its left and the queue on its right. The
  buttons sit in the two bottom corners, 48 to 72 px square. On a phone,
  under 500 px tall, the scores keep only Score, Level and Rows, and the
  theme and full-screen buttons move to the menu.
- The touch buttons are two rows of four. The bottom row, nearest the
  thumbs, holds the ones used most: ◀ ▶ ↺ ↻. The top row holds ▼ ⤓ ⇆ and
  Cycle. Held sideways, the left two columns go to the left corner and the
  right two to the right corner, so each button stays under the same thumb.
  A button held down repeats, as a held key does.
- A full-screen button sits beside the theme button, and the menu's Set up
  group and the pause menu each have one. They show only where the browser
  supports full screen, which an iPhone does not.
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
  during a big clear, and under 12 ms with the processor slowed four
  times.

Measured on 2026-10-01, after the first review, in headless Chromium
without a GPU, at 1280 × 800 and twice the pixel density. A frame's work
is the script's time in the frame: stepping the rules and issuing the
drawing.

| Case | Median | 95th percentile |
|---|---|---|
| Play, at full speed | 0.4 ms | 2.4 ms |
| A Quad clear, at full speed | 0.3 ms | 0.4 ms |
| A deluge, at full speed | 0.2 ms | 0.3 ms |
| A blast, at full speed | 0.2 ms | 0.4 ms |
| Play, with the processor slowed four times | 1.5 ms | 7.4 ms |
| A Quad clear, slowed four times | 0.9 ms | 2.6 ms |
| A deluge, slowed four times | 0.7 ms | 1.2 ms |
| A blast, slowed four times | 0.8 ms | 1.4 ms |

- The slowest single frames redraw the stack after a lock or a clear:
  18 ms at full speed and 43 ms slowed. They fall as a piece locks or in a
  clear's pause, when nothing moves.
- At full speed the title screen's game held 60 frames a second, 16.7 ms
  apart at the 95th percentile. Slowed four times, about 1 frame in 16
  comes late, as before the review: three runs of 8 s found 88 late frames
  in 1,434, against 78 for the earlier build. Its simulated player weighs
  one queued piece a step, so its thinking never stalls a frame.
- The budget holds with room to spare.
- `tools/pentrys/perf.js` measures all of this again. From the repo root:
  `NODE_PATH=tools/tiling-video/node_modules node tools/pentrys/perf.js`,
  with `CHROMIUM` set to Playwright's headless Chromium.

## Sound

- Synthesised in the browser, as in Smash Screen, with no sound files.
- Short sounds for a move, a rotation, a flip, a cycle, a lock, a hard
  drop, a flood, a deluge, a blast, a row bomb, a smash, glass cracking and
  breaking, a level up and the end of a game.
- A clear plays a chord from the harmonic series, in just intonation, that
  grows with the rows: harmonics 4 and 5 for a Single, 4 to 6 for a
  Double, and so on up to 4 to 10 for a Hextrys, all of one low C. Each 2
  or 3 in the cleared rows adds a bell, and each bonus in the combo a
  rising one.
- Sound starts after the player's first click or key, since browsers allow
  none before.
- Music comes later, as in Smash Screen.

## The address

| Address | Opens |
|---|---|
| `#mode=marathon` | Marathon with the saved settings. Also `grow`, `sprint`, `blitz` and `tutorial` |
| `#mode=marathon&squares=plus` | Marathon with 2s and 3s only. Also `pure` and `pentrys` |
| `#mode=marathon&width=14&sizes=45&squares=pure` | Marathon at width 14, with four- and five-square pieces and no special squares. The older `specials=0` means the same |
| `#mode=grow&level=6` | Grow from level 6, as practice. Levels run up to 50 |
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
| `app/pentrys/rules.js` | The well, choosing pieces, the queue, special squares, falling, locking, smashing, bombs, floods, clearing, scoring, levels and modes |
| `app/pentrys/lessons.js` | The tutorial's 21 lessons: wells, pieces, words and goals |
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
- The deluge: it fills holes however deep, and stays out of the open well,
  even on top of a tower.
- Bombs: the 3 × 3 blast, its own piece included, and its points. A row
  bomb clears its row whatever it holds. With several special squares on
  a piece, the bombs go off before the water fills, and a flood caught in
  a blast still pours.
- Smashing: a hard drop onto glass alone smashes it, and the glass holds
  when something else also holds the piece up, or when it lands softly.
- Ageing glass: cracks at 30 s and 45 s, breaks at 60 s and leaves the
  rest of its piece, and never ages in a lesson.
- The score: the row points past six, spare, glass, Crystal, a streak, the
  all clear, the level, and soft and hard drops.
- The speed: 8% faster a level, up to level 50.
- The lock time and its 15 resets, and the end of the game.
- The queue: cycle sends the front piece to the back, and a lock takes the
  front piece and adds a new one at the back.
- Over a million pieces, each shape comes 1 time in 21 and each of its
  orientations equally often. Each kind of special square lands at its
  rate, square by square, and Plus and Pure deal only their own.
- Grow's mix at each level matches its table.
- Each lesson: its intended moves meet its goal, and the obvious wrong
  move does not.

## Simulated player

- `sim.js` plays with no page. For the falling piece it tries every
  column, rotation and flip, and works out what each landing would do,
  smashed glass, bombs and floods included. It picks the placement that
  leaves the fewest holes and the lowest, flattest stack, and favours rows
  cleared. Then it cycles the queue to bring forward the piece that best
  fits the new stack.
- It plays a dozen games of Marathon at each width by default, with each
  square set, and with the cycle used and unused. It reports rows per
  game, the share of clears that use a gap or earn a spare, how often glass
  is smashed and bombs and deluges go off, the score, how often each clear
  size comes, and how long games last.
- Those numbers tune the special-square rates, which are seven numbers in
  `rules.js`.
- It places pieces at once, so the speeds need a person to play them, and
  glass never breaks with age in its games.
- The title screen shows it playing, with the same `bot.js`.

Measured after the first review, on 2026-10-01, with bombs at 1 in 100
and before craters closed: 12 games for each setting, each stopped at
1,500 pieces. Every game lasted that long.

| Width | Squares | Cycle | Rows a game | Rows that kept a gap | Clears with spare | Rows with glass | Smashes in 100 pieces | Blasts in 100 pieces | Score a game |
|---|---|---|---|---|---|---|---|---|---|
| 12 | Pentrys | used | 545 | 37% | 17% | 2.7% | 3.0 | 4.1 | 2,066,193 |
| 12 | Plus | used | 551 | 36% | 17% | – | – | – | 1,801,295 |
| 12 | Pure | used | 527 | – | – | – | – | – | 1,590,211 |
| 12 | Pentrys | unused | 542 | 37% | 19% | 2.9% | 2.9 | 4.1 | 2,113,793 |
| 10 | Pentrys | used | 651 | 32% | 16% | 1.9% | 3.1 | 4.1 | 2,895,700 |
| 14 | Pentrys | used | 469 | 42% | 19% | 3.8% | 2.7 | 4.1 | 1,554,133 |
| 16 | Pentrys | used | 411 | 46% | 20% | 4.6% | 2.6 | 4.1 | 1,242,843 |
| 18 | Pentrys | used | 367 | 50% | 21% | 5.4% | 2.6 | 4.1 | 1,011,435 |

- Glass no longer ends this player's games. Before the review, rows
  holding glass stayed for good, and its games with special squares lasted
  1,118 pieces at width 12. Now smashes and bombs break the glass, and
  every game reaches 1,500.
- A deluge came 1.3 times in 100 pieces, and so did a row bomb.
- It still clears one row at a time: at width 12 with the Pentrys set, 92%
  of its clears are Singles and 8% Doubles. So it never builds a long
  streak or a big deluge clear. A person building for a Pentrys plays
  otherwise.
- With every game reaching 1,500 pieces, the cycle makes little
  difference to it.

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
- Six-square pieces after Grow's last level: 35 more shapes, as MultiMino
  has.
- A daily game. One seed a day gives everyone the same pieces, and the
  score can be shared.
- Back-to-back bonuses from the modern standard, beyond the streak.
- Swipe controls on phones.
- On a touch screen, a lesson's words name the touch buttons. Today they
  name keys, which a phone or iPad player does not have.

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
