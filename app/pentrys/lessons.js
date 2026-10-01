/* The tutorial: thirteen short lessons, each teaching one thing, then
   eight advanced ones that put two or three ideas together. No lesson
   shows a clear past a Quad or a big combo: players find those themselves. See the
   Tutorial section of docs/pentrys.md.

   Each lesson starts from a set well, 10 wide. rows are its bottom rows, top
   to bottom: '#' a plain square, '.' a gap, '2' a 2 and 'g' glass. pieces
   come in order: a shape, its orientation (0 is the reference position, 4
   its mirror image), and any special squares as [[square, kind], ...]. says
   names keys as {left}, {cw} and so on, and the page puts in the player's
   own keys. goal reads what each lock did, as the rules report it.
   tools/pentrys/test.js plays every lesson's answer, and checks the obvious
   wrong move fails. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  function times(n, x) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }
  function anyRow(test) { return function (c) { return c.rows.some(test); }; }

  Pentrys.Lessons = [
    {
      title: 'Move and drop', says: 'Move with {left} and {right}, and drop with {hard}.', goalText: 'Clear a row',
      width: 10, rows: ['######...#'],
      pieces: times(3, { shape: 'I3' }),
      goal: function (c) { return c.n >= 1; }
    },
    {
      title: 'Rotate', says: '{ccw} and {cw} rotate. Stand the piece up in the slot.', goalText: 'Clear three rows at once',
      width: 10, rows: times(3, '########.#').concat(['........#.']),
      pieces: times(2, { shape: 'I3' }),
      goal: function (c) { return c.n >= 3; }
    },
    {
      title: 'Flip', says: '{flip} flips a piece. Flip this one, then stand it up.', goalText: 'Clear two rows at once',
      width: 10, rows: ['######..##', '#######.##'],
      pieces: times(2, { shape: 'S4', o: 4 }),
      goal: function (c) { return c.n >= 2; }
    },
    {
      title: 'Cycle', says: '{cycle} cycles the queue. Bring the O to the front, then drop this square in the slot on the right.',
      goalText: 'Clear two rows at once',
      width: 10, rows: ['###..####.', '###..#####'],
      pieces: [{ shape: '1' }, { shape: 'T4' }, { shape: 'S4' }, { shape: 'O4' }, { shape: 'L3' }],
      goal: function (c) { return c.n >= 2; }
    },
    {
      title: 'Twos', says: 'A 2 counts as two squares, so its row clears with one gap.', goalText: 'Clear a row with a gap',
      width: 10, rows: ['##.####.##'],
      pieces: times(2, { shape: '1', specials: [[0, 2]] }),
      goal: anyRow(function (r) { return r.gaps.length >= 1; })
    },
    {
      title: 'Threes', says: 'A 3 counts as three, so its row clears with two gaps.', goalText: 'Clear a row with two gaps',
      width: 10, rows: ['#.###.##.#'],
      pieces: times(2, { shape: '1', specials: [[0, 3]] }),
      goal: anyRow(function (r) { return r.gaps.length >= 2; })
    },
    {
      title: 'Spare', says: 'Fill every gap in a row that holds a 2, and the clear earns a spare bonus.', goalText: 'Clear a row with spare',
      width: 10, rows: ['##2###..##'],
      pieces: times(3, { shape: '2' }),
      goal: function (c) { return c.spare >= 1; }
    },
    {
      title: 'Glass', says: 'Glass counts nothing, so its row needs a 2 or a 3.', goalText: 'Clear the row with glass',
      width: 10, rows: ['###g###.##'],
      pieces: times(2, { shape: '1', specials: [[0, 2]] }),
      goal: anyRow(function (r) { return r.glass > 0; })
    },
    {
      title: 'Smash', says: 'A hard drop onto glass, and nothing else, smashes it. Glass also breaks by itself after a minute.',
      goalText: 'Smash the glass',
      width: 10, rows: ['######g###'],
      pieces: times(2, { shape: '1' }),
      goal: function (c) { return c.smashed >= 1; }
    },
    {
      title: 'Flood', says: 'A flood square fills the gaps beside and below it.', goalText: 'Clear two rows with one piece',
      width: 10, rows: ['#####...##', '#####.#.##'],
      pieces: times(2, { shape: 'I3', specials: [[1, 'flood']] }),
      goal: function (c) { return c.n >= 2 && c.flood; }
    },
    {
      title: 'Deluge', says: 'A deluge fills every hole below it that water could reach, however deep. Land it over the gap.',
      goalText: 'Clear two rows with one piece',
      width: 10, rows: ['######.###', '#####...##'],
      pieces: times(2, { shape: 'I3', specials: [[1, 'deluge']] }),
      goal: function (c) { return c.n >= 2 && c.deluge; }
    },
    {
      title: 'Bomb', says: 'Glass blocks this row for good. Drop the bomb next to the glass to blast it out, then fill the hole with the next piece.',
      goalText: 'Blast the glass, then clear the row',
      width: 10, rows: ['####g#####'],
      pieces: [{ shape: '1', specials: [[0, 'bomb']] }, { shape: 'I3' }, { shape: 'I3' }],
      goal: function (c) { return c.n >= 1; }
    },
    {
      title: 'Row bomb', says: 'A row bomb clears its whole row as it lands, whatever the row holds.', goalText: 'Clear the row with glass',
      width: 10, rows: ['##g###g.##'],
      pieces: times(2, { shape: '1', specials: [[0, 'rowbomb']] }),
      goal: anyRow(function (r) { return r.glass > 0; })
    },



    // The advanced lessons: two or three ideas at once.
    {
      title: 'Rescue', says: 'The hole in this row is buried. A 3 pays for it and the gap beside it, so the row clears anyway.',
      goalText: 'Clear a row with a buried hole',
      width: 10, rows: ['...#......', '###.####..'],
      pieces: times(2, { shape: '1', specials: [[0, 3]] }),
      goal: anyRow(function (r) { return r.gaps.length >= 2; })
    },
    {
      title: 'Two spare', says: 'Fill all three gaps in the row with the 3, and it clears with two spare: ×1.3.', goalText: 'Clear a row with two spare',
      width: 10, rows: ['#3###...##'],
      pieces: times(2, { shape: 'I3' }),
      goal: function (c) { return c.spare >= 2; }
    },

    {
      title: 'Quad', says: 'Park the O somewhere harmless, cycle the I4 to the front with {cycle}, then stand it in the slot.',
      goalText: 'Clear four rows at once',
      width: 10, rows: times(4, '#########.'),
      pieces: [{ shape: 'O4' }, { shape: 'T4' }, { shape: 'I4' }, { shape: 'O4' }],
      goal: function (c) { return c.n >= 4; }
    },


    {
      title: 'Double smash', says: 'Glass stacked on glass: a hard drop smashes through both, and the piece fills both rows.',
      goalText: 'Smash two panes and clear two rows',
      width: 10, rows: ['#######g##', '#######g##'],
      pieces: times(2, { shape: '2', o: 1 }),
      goal: function (c) { return c.n >= 2 && c.smashed >= 2; }
    },
    {
      title: 'Under the overhang', says: 'The flood reaches the gaps beside its square, even under the overhang where no piece fits.',
      goalText: 'Clear two rows with one piece',
      width: 10, rows: ['#####.####', '####...###'],
      pieces: times(2, { shape: '2', o: 1, specials: [[1, 'flood']] }),
      goal: function (c) { return c.n >= 2 && c.flood; }
    },

    {
      title: 'Crater', says: 'Drop the bomb down the gap to blast both panes of glass, then fill the crater with three standing pieces.',
      goalText: 'Clear two rows at once',
      width: 10, rows: ['####g.####', '####g#####'],
      pieces: [{ shape: '1', specials: [[0, 'bomb']] }].concat(times(4, { shape: '2', o: 1 })),
      goal: function (c) { return c.n >= 2; }
    },
    {
      title: 'Row bomb Double', says: 'One square fills the top row, and the row bomb below it clears the glass row as well.',
      goalText: 'Clear two rows, one with a row bomb',
      width: 10, rows: ['#########.', '##g###g##.', '#........#'],
      pieces: times(2, { shape: '2', o: 1, specials: [[1, 'rowbomb']] }),
      goal: function (c) { return c.n >= 2 && c.rowBomb; }
    },
    {
      title: 'Bomb and deluge', says: 'This piece carries a bomb and a deluge. The bomb goes off first, then the water refills the crater. Blast the glass in the corner.',
      goalText: 'Clear the glass row',
      width: 10, rows: ['g#########'],
      pieces: times(2, { shape: '2', specials: [[0, 'bomb'], [1, 'deluge']] }),
      goal: function (c) { return c.n >= 1 && c.deluge; }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
