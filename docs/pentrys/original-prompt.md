# Original prompt

The messages David Ryan gave Claude Code on 2026-09-30, which started
Pentrys, the game in [../pentrys.md](../pentrys.md). The first is a voice
transcript. They are kept word for word, in the order he sent them.

---

Okay, we're going to try something a bit different now. Um, I'm going to put another game on my builder site. I've already got three games there, so we're going to do a fourth one. Um, it's going to be called Petris, or Pentris, which is P-E-N-T-R-Y-S. Um, it's going to be um, like a version of Tetris, but it's going to have pentominoes as well. Um, in fact, it's going to have uh, so it's going to have the um, all the Tetris shapes, which have got four squares. But it's going to have all the all the shapes with one square, two squares, three squares, four squares, and five squares. Um, they're going to be options. Um, the, the shapes will be introduced at the top of the screen and fall down. Um, we're going to have. Um, a, a variable width, I'm guessing the width can be 10, 12, 14, 16, 18, something like that. So we've got to be able to have a different width. Um, the height, I'm not quite sure how high it would be, but I'm sure you can look it up from other games. Um, it's going to be a game in a web browser. So the shapes fall from the top of the screen. Um, they fall at, um, the shapes f start by falling slowly, and as time goes on, they, they fall faster and faster. Um, and um, the um, Yeah, so, so there are going to be controls to move the shape left, move the shape right, um, rotate it left, rotate it right, and also flip it horizontally. So, um, I mean, I guess you could get away with just rotate, rotating it clockwise and flipping it horizontally, but yeah, we're going to have those controls. Um, so, most, so the normal shapes are going to have different colours. Um, you can probably have something like four, five, six uh, basic colours. Um, go check out what other games have done and do something similar. Um, but there are going to be um, special squares as well. So at random, any of the squares in the shape, probably just one per shape, but any of the squares could be a two. So um, a, a square by default is a one, but Okay, we're recording again. Um, yeah, so a basic square is a one. Um, however, a one in 30 will be a two, a one in 100 will be a three. So the idea with that is that when, uh, when you fill a complete row, it disappears. So that would be a row of squares, each square being a one. Uh, however, if, it, if one of the squares is a two, then another of the squares could be a zero, e.g. it wasn't filled at all. So a two means that you can have a gap in the row and it still disappears. And a three means that you can have two gaps in the row and it still disappears. And there can be bonus score for getting a complete row with a two or a complete row with a three or a, a row only missing one square with a three. So um, yeah, we can have extra, extra um, bonus points for that. So there'll be a scoring system. And there'll be a score for one row, a score for two rows, three rows, four rows, and I guess five rows as well. Uh, so we can have extra bonus points. Um, I guess that's the basic game. Uh, we'd want a title screen. We'd want um, probably at least, uh, I, I don't know, uh, different modes that you can try, um, figure out what those modes would be. And yeah, let's make a game of Pinterest and see what you've got. I think later on we're going to, maybe have some extensions I'm not quite sure what those extensions would be uh, in my head I've got a bomb so if you have a bomb then it puts a big hole in something or maybe it gets rid of some rows I'm not sure but really the twos and threes already uh, get rid of the rows easier so maybe we don't need a bomb um, let's spec it out let's write a spec for the game and um, yeah go think up an interesting game for me and I will read the spec and then if I like it we'll build it okay thank you very much

---

Feel free to do internet research about other games of Tetris or other similar games and other tile dropping games on the internet, take the interesting ideas and mash them up into my game, but mainly what I've said above. I am going to want this game to look nice and be interesting and colourful and animated, but for now let's concentrate on getting the underlying game and mechanics correct

---

will you research similar games and give me a summary of if my game already exists?

i might still make it. but probably want something original in there. (I did think of this myself, but perhaps someone else already thought of it and made it)

---

Shapes should be selected at random. We can go for uniform across the whole set of edge-connected shapes made out of between 1 and 5 squares on a square grid. Each initial orientation (rotation, reflection) should be equally likely. We display the next 4 shapes. There is a button to cycle the 4 random shapes so the player can control which one falls next. THere is no limit to how often the player can cycle these. The next tile shoud go to the back of this queue, and the rest come forwards

---

The shapes will need to sit somewhere, we could have them either to one side of the main area, or above the main area. Whichever one you think is best. There is likely more room to the side. The  orientation they queue in should be the same as the orientation they aappear at the top of the game area in.

---

The messages that followed, as the spec took shape, also word for word.

---

1. Yes
2. Yes
3. Actually I think it will be hard to do exact matches on pentominoes. Make it 1 in 20 and 1 in 100. I want these mechanics to be available frequently in the game
4. We'll work on the Grow concept. I think only having length 1-3 is too easy. We ought to have length 1-4 from the start, and maybe eliminate 1, 2, then 3 as we add increasing proportions of length 5. By ending on length 5 it will likely make Grow very hard to play towards the end.

Another thing is that when a shape is rotated in mid air it should not move down by a rotation. So if a player rotates a shape many times a second it might be possible for it to float back up? I wonder if that can be avoided?

---

How about the graphics, do we want to say anything about this? I'm going to ask you to build the game in one shot, so we'd better discuss

I want it to look nice. we want a beautiful game. Not too heavy on the browser though, people should be able to play it on an old machine, it should still be responsive and fast.

---

Light mode - want the well to be light, and the squares to be perhaps darker

1. That's good look
2. OK all good
3. yes

Other changes
- 21 shapes is good, but have them all a different colour. I like the 5 groupings you have. Within each grouping, perhaps similar colours. I would like to see 21 different hues in the game. Can you mock up a screen with all 21 colours so I can see it?
- I also want a "ghost" square to appear 1 in 200 which is worth 0 but is solid, maybe transparent like glass. It has to be paired with a 2 or 3 to eliminate the row. (This is why we need 2 to be relatively common)
- I also want another bonus square that when it lands it fills any gaps in the 8 squares near it. Think of a suitable interesting name for it. This one can be 1 in 200. It should not fill empty space above (leave that alone) but should fill empty space to the side or below. So I guess that's 5 squares near it in those directions. Cement square? Grow square? Plant square? none of those are quite right. Think of something that means to fill things around it.
- We ought to have a tutorial mode to get people used to using all these bonus squares. Each short tutorial level could have 1 new feature they might not be used to.

- Use common keyboard shortcuts, check out other similar games for what works. I'll be mostly playing this on my web browser, but make it work for phones too. Perhaps it could be installed as PWA on phone? (If that's not MVP then don't worry, we can do it later, but maybe have it in spec?)

User should be able to change the keyboard settings. These should be remembered between sessions

Is it worth having a player being able to save their game setup? pros and cons?

"Only the rows the piece landed in can change. So one lock clears five rows at most, and only I5 is tall enough for five."
- with the new piece that fills in gaps, there may be other ways to have 5 rows, even 6 rows in exceptional circumstances

Scoring - give more weight to higher numbers of rows
1 row - 1 points
2 rows - 3 points
3 rows - 7 points
4 rows - 13 points
5 rows - 23 points
6 rows - 71 points
x2 multiplier for 1 spare
x4 multiplier for 2 spare

If someone clears 2+ rows or has spare multipliers, increasingly make a fuss about it onscreen (but without blocking their view of the continuing game) and later on we'll add special sound effects for those

Is there anything else that will score or is it just destroying the rows? If it is only destroying rows, we can go with the exact points above. Otherwise we can use your base 100 points for 1 row.

Why are you multipliying points by level, I don't get it?

---

Asked three questions, David chose: keep the points multiplied by the level; call the two new squares Glass and Flood; score an all clear ×10.
