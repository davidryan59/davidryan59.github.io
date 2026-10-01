# Smash Screen

## Summary

`app/smash/` is a game about breaking screens. A phone, tablet, laptop or
monitor shows a picture, and the player breaks it with one of seven
weapons, held in a cartoon hand that follows the pointer. The screen breaks
the way a real LCD breaks: the glass cracks, black ink spreads from the
cracks, and whole rows of pixels light up in one bright colour. The look
comes from a photo of a shattered monitor that
[Austin Griffith posted on X](https://x.com/austingriffith/status/2103545545801556280),
and the page credits it.

The page opens on a title screen with two modes. Fun Mode is the toy: every
weapon, no clock and no score. Anger Mode is the game: destroy the picture
before the clock runs out, one device per level, and earn the
weapons on the way. The builder page lists it third under Games, after
Sonic. It is served at drbuild.uk/app/smash/, and the short address
drbuild.uk/smash redirects there.

## Implementation checklist

- [x] One crack network per screen: a new crack stops where it meets an
      older one, so no two cracks cross
- [x] Loose pieces of glass fly out and leave holes
- [x] Details from the photo: faint lines across white, a dark purple black,
      dotted cracks, bands of shattered glass drawn pixel by pixel, fuzz
      along cracks, and lines of stuck pixels that stop short of a crack
- [x] Damage measured on a grid of sample points
- [x] Title screen, Fun Mode and Anger Mode
- [x] Seven weapons, both hands, and a weapon held too long hitting the player
- [x] Flying glass and keys to swat, and dents in the frame
- [x] Levels, a clock, scoring, the Power bar and weapon unlocks
- [x] Two time-out endings, death, local high scores and an announcer voice
- [x] A visitor's own picture in Fun Mode, and Fun Mode's cheer for a
      destroyed screen
- [x] Fits every screen: a full-width stage, a side layout for a screen
      held sideways, and a full-screen button, checked with
      `tools/screen-fit/check.js`
- [ ] Play an early and a late level of Anger Mode, and tune the time limits
- [ ] Try the game on a real phone and in Safari
- [ ] Redraw the share card with the new glass, if wanted

## Modes

### Title screen

SMASH SCREEN over a device that a hand smashes by itself, two buttons for
the modes, and the top five high scores. The title screen's tune starts at
the visitor's first click or key anywhere on the page: the browser starts
audio only after one.

### Fun Mode

Every weapon is available at once, with no clock, no Health and no score.
The Help! Give me a new device button brings a new device and picture, and
zoom works as before. Everything comic still happens, from flying glass to
a hammer held too long, but nothing costs anything.

**Smash your own picture** opens the file picker, and an image dropped on the
stage does the same. The browser reads the file and draws it on the screen;
nothing is uploaded. The page picks the device whose screen best fits the
picture's shape, and scales the picture to fill the screen.

When only 1% of the picture is left, the K.O. bell rings, SCREEN
DESTROYED! lands, and a banner gives the time, the number of blows and how
many screens the visitor has destroyed on this visit. The wreck stays until
the visitor presses Next device, so there is time to zoom in on it.

### Anger Mode

- **The goal.** Destroy the picture before the clock runs out. The screen
  is K.O. when 1% of the picture is left. Its Damage bar, top right, reads
  100% at that point.
- **Health.** The player's bar, top left. It carries from level to level,
  and each level cleared gives back 25, up to 100.
- **Power.** The thin purple bar under Health. Good play fills it. A bomb or
  a lightning strike needs a full bar, and empties it.
- **Levels.** One device each, in the order phone, tablet, laptop, monitor,
  then round again, without end.
- **The run ends** when Health or time runs out. A top-ten score asks for
  three initials, kept in this browser only.

A run started part way, as in `#mode=anger&level=12`, is practice. It plays
as normal and records no high score.

## Levels and time

| Level | Device | New weapon |
|---|---|---|
| 1 | Phone | Finger, fist and hammer |
| 2 | Tablet | Fish |
| 3 | Laptop | Banana |
| 4 | Monitor | Bomb |
| 5 | Phone | Lightning |
| 6 on | Tablet, laptop, monitor, phone… | – |

The time limit starts at 90 seconds, times 1.1 for a phone and 0.95 for a
tablet, and falls by 7% a level, down to 45% of the start and never below
36 seconds. The last ten seconds tick.

The first limits came from a simulated player who aims every full swing at
what is left of the picture and pokes the last specks with the finger. It
clears a screen in 6 to 9 full swings and 13 to 23 pokes, about 16 to 23
seconds of swinging. The limits allow for aiming, swatting and the left hand.
They still need a person to play an early and a late level.

Once less than 5% of the picture is left, what is left flashes twice every
two seconds. The flash is yellow at 5% left and turns through orange to red
as it nears 1%. It shows in Fun Mode too.

## Scoring and Power

- 10 points for each 1% of the picture a blow destroys. A blow on a part
  that is already dead scores nothing.
- **Combo.** A blow that destroys something within 1.6 seconds of the last
  one multiplies its points, from ×2 up to ×8.
- **Perfect.** Released during the first 0.22 seconds of the tremble at the
  top of the swing: full strength and half as many points again.
- **Banana.** Every banana blow scores double.
- **Blackout.** One blow destroys 15% of the picture: 300 points.
- **Rainbow.** One blow lights 20 or more lines of stuck pixels: 150 points.
- **Swat.** 20 points for each piece of glass or key knocked away.
- **Keys and dents.** 15 points for each key knocked off, 10 for a dent.
- **After a K.O.** 20 points for each second left, 1,000 for a Flawless
  level with no Health lost, and 1,500 for a Bananality or a Fishality: the
  K.O. blow made with the banana or the fish.

Power grows by the share of the picture destroyed, plus 4 for a combo, 8
for a Perfect, 12 for a Blackout, 8 for a Rainbow and 4 for a swat.

## Harm to the player

| Cause | Health |
|---|---|
| A piece of glass that reaches the player | −6 |
| A key that reaches the player | −5 |
| A blow on the player's own left hand | −12, and the blow does not reach the screen |
| A finger poked into cracked glass | −0.2 |
| Lightning while a finger of the left hand is on the glass | −25 |
| A bomb that goes off by the left hand | −20 |
| A weapon held too long | hammer −10, fist −8, finger −6, fish −5, banana −4, lightning −30, bomb −35 |

Each hurt flashes the edges of the stage red. At zero Health, cartoon blood
runs down from the top and GAME OVER lands.

**Flying glass and keys** fly towards the player and grow as they come.
Each leaves in a random direction away from the weapon, fast at first and
slower as it closes, so it does not fly into the hand by itself. A key
takes 0.95 seconds at level 1, 0.035 seconds less each level, down to 0.5.
A piece of glass takes 2 to 4 times as long as a key, at random. Nothing
can be swatted for the first quarter of its flight. After that, the hand
swats it by passing over it. On a touchscreen, a tap or a finger dragged
across it does the same.

**The left hand** grips the left edge of a phone, tablet or monitor with
its fingers over the screen, and rests on the keyboard of a laptop. In Anger
Mode the hand holds still, then now and then shuffles to a new grip in
under half a second: along the edge, and further in or out over the glass.
It waits 1.2 to 4.5 seconds between shuffles at level 1, less at each
level, and reaches further in. A finger that is hit throbs, and the hand
pulls back for a moment.

**Held too long.** After about 1.6 seconds at the top of the swing the weapon
shakes harder and the hand sweats. Held on, the weapon hits the player: the
hammer bonks and stars circle, the fist punches (STOP HITTING YOURSELF!),
the finger pokes an eye and half the view blurs, the fish slaps and the view
drips, the banana squashes and mush slides down, lightning shows the hand's
bones, and the bomb goes off in the hand and covers the view in soot. The
bomb's fuse is the limit: 2.4 seconds from the press.

**Time up** ends the run with one of two endings, at random: the device grows
legs and runs off the stage saying Too slow!, or the screen mends itself from
top to bottom and a smiley says NICE TRY.

## Weapons

| Key | Weapon | Swing | Crater | What it does |
|---|---|---|---|---|
| 1 | Finger | An instant poke | 4.7% | Kills a small round patch exactly where it lands: the tool for the last specks |
| 2 | Fist | Full in 0.45 s | 2–5.5% | A wide crater, a spider web and few long cracks. Quick, so it builds combos |
| 3 | Hammer | Full in 0.87 s | 1.5–6.5% | The all-rounder, with long cracks to the edge |
| 4 | Fish | Full in 0.7 s | 6–15% | Hardly cracks and throws no glass. Its crater is a wet patch that spreads for 3 to 4.5 seconds, and it leaves slime on the glass |
| 5 | Banana | Full in 0.6 s | 1.2–3.5% | The weakest blow, but double points. Leaves mush on the glass |
| 6 | Bomb | A throw | 20–28% | Left on the glass with its fuse burning. Scorches a wide circle, cracks the screen from edge to edge and throws a lot of glass |
| 7 | Lightning | Full in 0.9 s | 3–6% | A bolt from the top of the stage burns a path of pixels, and 20 to 36 lines light right across the screen |

The crater is the radius a blow destroys outright, as a share of the
screen's short side, from a tap to a full swing. It runs across cracks.

## How a blow breaks the screen

- **The crack network.** `glass()` in `damage.js` keeps every crack on a
  screen. A crack grows in short steps, turning a little at each one, and
  checks each step against the older cracks nearby, kept in a grid of 24-unit
  cells. Where it meets one, it stops there. A blow that lands on a crack
  starts its cracks on that crack. The network remembers where each crack
  starts and ends: at a blow's hub, on another crack, at the edge of the
  screen, or free.
- **Long cracks.** Three to nine run from the impact with a slowly drifting
  bend. A full swing sends at least two to the edge, or to an older crack.
  Some branch.
- **Crushed glass.** Short arcs close round the blow join neighbouring
  cracks and cut the wedges between them into small pieces. Phones and
  tablets add wider rings, a spider web. A burst of short cracks, a crater
  and specks of glitter mark the impact.
- **The crater.** Every blow kills the panel within its crater radius, set
  by the weapon and the strength of the swing. The crater is not clipped to
  a sector, so it runs across old and new cracks alike. Its edge is nearly
  round, and never falls inside the radius.
- **Sectors.** The long cracks and branches of every blow, with the edge of
  the screen, make a planar graph. The faces round the new blow are its
  sectors. Each has a fate: it floods black, bleeds in from its cracks, or
  stays alive. One bleed in eight is white instead. Ink stops at old long
  cracks as well as new ones. The first blow on a screen leaves at least half
  of it alive.
- **Loose glass.** All the cracks but the finest make a second graph. Its
  small faces near a hard blow are loose pieces, and some fly out. Each one
  leaves a hole with a bright rim, and carries its bit of picture as it flies
  at the player.
- **Black ink.** Each patch is a blob whose radius varies smoothly with
  angle. It grows over one to four seconds, is clipped to its sector, and
  has a fringe of short coloured spikes. The black is a very dark purple with
  a faint grain, as in the photo.
- **White.** A white patch shows the pixel grid, and faint pastel lines run
  across it, with the odd darker line.
- **Stuck pixels.** Groups of lines, half a pixel to one and a half pixels
  thick, run across a sector. Each stops 2 to 12 pixels short of the crack
  at its end, at its own distance, so the ends make a ragged edge. Most are
  horizontal on laptops and monitors, about half vertical on phones and
  tablets. They glow in the 'lighten' blend, so they show on black and
  almost vanish on white.
- **How cracks look.** The bright core of a crack is a string of lit dots.
  Some long cracks are bands of shattered glass, drawn pixel by pixel with
  stair-stepped edges, a lit pixel grid and a bright hairline along one
  side; their width wanders along their length. A few cracks shimmer with
  colour. Some have a fuzz of lit ticks, pixel-aligned, and a hard blow
  leaves a haze of yellow-green pixels and a small yellow blotch.
- **Strength.** The weapon rises while the press lasts, and the height it
  reaches sets the blow. A quick tap only chips the glass; cracks to the
  edge and ink need a longer hold, a black flood and the bright lines a full
  swing. A blow on the bezel breaks the screen from its edge.
- **The body.** A blow on the frame leaves a dent: a shaded hollow,
  scratches and chipped paint. A blow on a laptop's keyboard knocks keys
  off, which fly at the player.

### Measuring damage

`glass()` also keeps a grid of sample points, about sixty across the short
side of the screen: 6,000 to 8,000 in all. Points outside the rounded
corners or under the phone's camera cut-out do not count. When a blow
makes its ink, `damage.js` works out, for every point each blob will cover,
the moment the blob grows out to it, and keeps the earliest. Holes count
from the moment their piece flies out. Stuck lines, cracks, slime and mush do
not count. So the Damage shown rises as the ink spreads. The screen is
K.O. when 99% of the points are dead, and the bar is scaled to read 100%
there.

## Music

Every part of the game has a tune. `music.js` plays them, synthesised in
the browser like every other sound: pulse and triangle waves and noise
drums, through a low-pass filter at 7 kHz and a little reverb. No note
slides or wavers. All are funky, swung and full of minor sevenths, and in
just intonation.

| Tune | Plays | Key | Tempo | What makes it different |
|---|---|---|---|---|
| `title` | The title screen | A minor | 96 BPM | The game tune's first half, laid back |
| `fun` | Fun Mode's smashing | A minor | 124 BPM | The game tune, bouncy and short-noted, with a light kit |
| `level1` | Levels 1, 6, 11… | A minor | 138 BPM | The game tune, with a syncopated bass and off-beat stabs |
| `level2` | Levels 2, 7, 12… | D minor | as the level | Disco funk: octave bass, four on the floor, off-beat stabs, a pushed melody |
| `level3` | Levels 3, 8, 13… | E minor | as the level | Slap funk: popped octaves, ghost notes, ninth chords, a breakbeat |
| `level4` | Levels 4, 9, 14… | C minor | as the level | Half-time: long bass notes, held chords, snare on 3, the melody in octaves |
| `level5` | Levels 5, 10, 15… | A minor | as the level | The boss: sixteenth-note bass, a dub echo on the lead, E7#9 to finish |
| `intro` | A level's introduction, up to FIGHT! | The level's | as the level | Two bars on the level's dominant seventh, leading into its tune |
| `ko` | The K.O. and its bonuses, and Fun Mode's SCREEN DESTROYED! | C major | 112 BPM | Cmaj7 Fmaj7 Dm7 E7, with a rising lead |
| `pause` | The pause screen | – | 88 BPM | Drums only |
| `over` | Death, time up and the game-over screen | A minor | 76 BPM | Am9 Dm9 Fmaj7 E7, slow |

The five level tunes share the game tune's melody and its 16 bars: Am7 Am7
Fmaj7 E7 twice, then Dm7 Dm7 Am7 Am7 Dm7 Dm7 E7 E7, moved to each tune's
key. Levels never run out, so the five repeat from level 6. The tempo is
138 BPM at level 1, 3 more each level, up to 156 from level 7.

- **Where it restarts.** A pause stops a level's tune, and resuming picks
  it up at the same beat. Each new level starts its tune from the top.
- **On and off.** The Music button turns it on and off, and the browser
  keeps the choice. Sound off silences it too. Hiding the tab stops it. The
  title tune starts at the visitor's first click or key.
- **Level.** Rendered through the page's compressor, the tunes measure −24
  to −26 LUFS and the pause loop −30 LUFS, 5 dB quieter. Before the
  compressor no tune peaks above −14 dBFS, its threshold. Each note's gain
  starts at 0: a gain holds 1 until its first change, and a note that
  starts between two samples, as swung notes do, would otherwise click.

### Sequence files

Each tune is one file in `app/smash/music/`, such as `title.js`. The file
gives the tune's settings, then its notes as CSV rows, a row per note, between
backticks. Edit a row and reload the page to hear it. The files are scripts,
so the page reads them whether it is opened from the disk or from a server.

```js
Smash.Music.add('title', {
  bpm: 96, bars: 8, swing: 0.2, gain: 1.45,
  tracks: {
    lead: { voice: 'pulse25', gain: 0.075, pan: 0.15, reverb: 0.4 },
    drums: { loop: 2 }
  }
}, `
bar,beat,track,note,length,vel
1,1,lead,A4,1,1
1,2,drums,rim,0.25,0.8
1,2.5,keys,C.4,0.25,1
`);
```

The rows:

- **bar** and **beat** count from 1. Beat 2.5 is the "and" of 2, and 2.25
  and 2.75 the sixteenths either side.
- **track** names one of the tune's tracks.
- **note** is in Rational Comma Notation, as justsynth writes it: a
  Pythagorean letter and octave, with `'` for 80/81, `.` for 81/80 and
  `[7]` for 63/64, and any other DR prime comma in brackets. A4 is 440 Hz,
  so C.5 is a pure minor third above it, G#'4 a pure major third above E4,
  and D[7]5 the 7th harmonic of E3. On a drum track the note is a drum:
  `kick`, `snare`, `hat`, `open`, `rim`, `clap` or `shaker`.
- **length** is in beats. A drum ignores it.
- **vel** runs from 0 to 1, and is 1 if left out. A drum at 1 plays at a
  level set for that drum.
- Lines starting `#` are comments.

The settings:

- **bpm**, **bars** and **swing**. Swing delays the second and fourth
  sixteenths of each beat by that share of a sixteenth.
- **gain** scales the whole tune.
- **key**, on a level tune, is its ratio to A minor, such as `4 / 3` for D
  minor. The level's introduction is moved by the same ratio.
- Each track sets its sound (`voice`: `pulse50`, `pulse25`, `pulse12`,
  `triangle` or `sine`; drums need none), `gain`, `pan` from −1 to 1,
  `reverb` send, `attack` in seconds and `decay`, the share of its level a
  note falls to by its end.
- A track with `loop` repeats its first bars through the tune: the drums in
  `play` are two bars, looping.

Every note, including every hat, is written out; nothing is generated. A
new tune needs a file in `music/`, a `<script>` line for it in `index.html`,
and a line in `syncMusic()` in `game.js` saying when it plays.

`music.js` parses the notes with a port of justsynth's `parse_rcn`, and
gives the same ratio as justsynth for every note in the files.

`tools/smash/score.html` draws a tune as a score, straight from its file in
`music/`. Open it from the disk: it draws `level1`, and `?tune=level2` on its
address draws another tune. It fetches VexFlow from jsDelivr, and the number
of bars on a line follows the window.

- **The staff is Pythagorean**, as RCN's letters are. A plain note is its
  Pythagorean pitch, and C# and Db are different notes.
- **Each prime from 5 up is a red fraction** before the note, and before any
  sharp or flat. `'` shows as 5, `.` as 1/5 and `[7]` as 7, and they
  combine, so C#.[17]4 would show as 17/5 before the sharp.
- **A fraction holds to the end of the bar**, as a sharp does, and 1/1
  cancels it.
- One staff per pitched track, clef chosen by its middle note, and one
  percussion staff for every drum track. Looped tracks are written out in
  every bar, and swung notes are written straight.

## Drawing and cost

Everything is vector and drawn in screen units, where the short side of the
screen is 1000 units, so the page redraws it sharply at any zoom. Two
offscreen canvases hold everything that has settled: one has the device's
body, the picture and the finished damage, the other the finished cracks. A
frame copies both and draws only what still moves. A new dent or a missing
key repaints only the body round the screen. The effects canvas above the
stage hides itself while it is empty. The canvas never draws at more than
twice the CSS pixel size.

In Anger Mode and on the title screen the frames run all the time, for the
clock and the left hand. In Fun Mode the page requests no frames at rest.

Measured in headless Chromium without a GPU, at twice the pixel density,
1280 × 860:

| Case | Frame time, median | 95th percentile |
|---|---|---|
| Fun Mode, idle | 8.3 ms | 9.3 ms |
| Fun Mode, one weapon after another | 8.4 ms | 17 ms |
| Anger Mode, seven full blows | 8.4 ms | 41 ms |

The long frames in these runs include the test's own screenshots, which
stop the page while they are taken. One hammer blow takes about 8 ms to
work out in Chromium, and 14 ms at worst. In Node, the slowest of 240 random
blows with every weapon took 13 ms, and 4,200 cracks from them had no
crossings.

## Layout

The stage takes the window's full width, and its height less room for the
title above and the buttons below. The device is drawn to fit the stage,
so a bigger window shows a bigger device. Anger Mode's bars stop at 1300 px
across, however wide the stage. The rules all the site's games follow are
in [screen-fit.md](screen-fit.md).

- A touch screen held sideways, or any window under 520 px tall, puts the
  title and buttons in a narrow column on the left. The stage takes the full
  height beside them, and the weapons run down its left edge, so they take
  no height from the device.
- A Full screen button sits with the sound buttons. It shows only where the
  browser supports full screen, which an iPhone does not.
- A title or end sheet taller than the stage scrolls from its top.

## Controls

- Click or tap to swing: press lifts the weapon, release strikes. Hold
  longer for a harder blow.
- Keys 1 to 7, or the buttons at the foot of the stage, pick a weapon.
- Keys, with the stage focused: the arrows aim, Space or Enter swings.
  Anywhere on the page: P or Escape pauses Anger Mode, N gives a new device
  in Fun Mode, M turns sound on and off, V turns the voice on and off, F
  fills the screen.
- Fun Mode only: scroll, pinch, or − and + zoom towards the last blow;
  drag moves the view when zoomed in; 0 shows the whole device.
- The Menu button pauses Anger Mode, with a choice to quit. In Fun Mode the
  same button reads Title screen, and goes there.
- The Smash Screen title at the top of the page goes back to the title
  screen too. During a run of Anger Mode it pauses and asks first, with Keep
  playing as the default and Escape to back out. Hiding the tab pauses Anger Mode too.
- Sound and music are synthesised in the browser. The Music button turns
  the music on and off. The announcer uses the browser's own speech voice,
  as Dino Dash does. The choices for sound, voice and music, the high scores
  and the last initials are kept in this browser.
- With reduced motion set, the device does not shake, the impact and the
  lightning do not flash, and the announcer does not zoom.

## The address

| Address | Opens |
|---|---|
| `#device=laptop&scene=synthwave&seed=42` | Fun Mode on that device and picture. `orient=portrait` or `landscape` sets a tablet's way up |
| `#mode=fun` | Fun Mode |
| `#mode=anger` | Anger Mode from level 1 |
| `#mode=anger&level=12` | Anger Mode from level 12, as practice |

Scene ids are listed at the end of `scenes.js`.

## Files

| File | What it holds |
|---|---|
| `app/smash/index.html` | The page, its styles, the HUD, the weapon bar and the title, pause and game-over screens |
| `app/smash/scenes.js` | The 14 pictures, drawn from shapes, and the seeded random generator |
| `app/smash/damage.js` | The crack network, what one blow does to a screen, the damage measure, and how to draw it all |
| `app/smash/hands.js` | The seven weapons, the right hand that holds them, the left hand, and the weapon icons |
| `app/smash/sound.js` | Every sound, synthesised |
| `app/smash/music.js` | The music player: reads the sequence files and synthesises them |
| `app/smash/music/` | The tunes, one sequence file each |
| `app/smash/smash.js` | The engine: devices, the view, input, the swing, contact with the device, and drawing |
| `app/smash/game.js` | The rules: the title screen, both modes, the HUD, scoring, flying glass and keys, the left hand, self-hits, endings, high scores and the voice |
| `tools/smash/card.js` | Draws `social/smash.jpg`, the share card |
| `tools/thumbnails/smash.js` | Draws `assets/thumbs/smash.svg`, the builder page's animated picture, from the page's own damage model |

## Share card and builder picture

```sh
node tools/smash/card.js
```

It draws the card in the style of the site's other cards: one full-bleed
picture, no text. The white article about glass fills the frame, two
full-strength blows break it, and the page's hammer, without its hand, is
raised over the second. Both blows break the same glass, from fixed seeds, 5
and 30, so the card redraws exactly. Pass two other seeds to try another. It
saves `social/smash.jpg` at 1200 × 630, under 300 KB.

The published card and builder picture were drawn before the game, and stay
as they were. Both scripts run on the new code; rerun them to redraw.
