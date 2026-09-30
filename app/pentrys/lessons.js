/* The tutorial: eleven short lessons, each teaching one thing. See the
   Tutorial section of docs/pentrys.md.

   Each lesson starts from a set well, 10 wide. rows are its bottom rows, top
   to bottom: '#' a plain square, '.' a gap, '2' a 2 and 'g' glass. pieces
   come in order: a shape, its orientation (0 is the reference position, 4
   its mirror image), and any special square as [square, kind]. goal reads
   each clear the rules report. tools/pentrys/test.js plays every lesson's
   answer, and checks the obvious wrong move fails. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  function times(n, x) { var a = []; for (var i = 0; i < n; i++) a.push(x); return a; }
  function anyRow(test) { return function (c) { return c.rows.some(test); }; }

  Pentrys.Lessons = [
    {
      title: 'Move and drop', says: 'Move with ← and →, and drop with Space.', goalText: 'Clear a row',
      width: 10, rows: ['######...#'],
      pieces: times(3, { shape: 'I3' }),
      goal: function (c) { return c.n >= 1; }
    },
    {
      title: 'Rotate', says: 'Z and X rotate. Stand the piece up in the slot.', goalText: 'Clear three rows at once',
      width: 10, rows: times(3, '########.#'),
      pieces: times(2, { shape: 'I3' }),
      goal: function (c) { return c.n >= 3; }
    },
    {
      title: 'Flip', says: 'A flips a piece. Flip this one, then stand it up.', goalText: 'Clear two rows at once',
      width: 10, rows: ['######..##', '#######.##'],
      pieces: times(2, { shape: 'S4', o: 4 }),
      goal: function (c) { return c.n >= 2; }
    },
    {
      title: 'Cycle', says: 'C cycles the queue. Bring the O to the front, then drop this square in the slot on the right.',
      goalText: 'Clear two rows at once',
      width: 10, rows: ['###..####.', '###..#####'],
      pieces: [{ shape: '1' }, { shape: 'T4' }, { shape: 'S4' }, { shape: 'O4' }, { shape: 'L3' }],
      goal: function (c) { return c.n >= 2; }
    },
    {
      title: 'Twos', says: 'A 2 counts as two squares, so its row clears with one gap.', goalText: 'Clear a row with a gap',
      width: 10, rows: ['##.####.##'],
      pieces: times(2, { shape: '1', special: [0, 2] }),
      goal: anyRow(function (r) { return r.gaps.length >= 1; })
    },
    {
      title: 'Threes', says: 'A 3 counts as three, so its row clears with two gaps.', goalText: 'Clear a row with two gaps',
      width: 10, rows: ['#.###.##.#'],
      pieces: times(2, { shape: '1', special: [0, 3] }),
      goal: anyRow(function (r) { return r.gaps.length >= 2; })
    },
    {
      title: 'Spare', says: 'Fill every gap in a row that holds a 2, and the clear scores double.', goalText: 'Score a clear worth ×2',
      width: 10, rows: ['##2###..##'],
      pieces: times(3, { shape: '2' }),
      goal: function (c) { return c.multiplier >= 2; }
    },
    {
      title: 'Glass', says: 'Glass counts nothing, so its row needs a 2 or a 3.', goalText: 'Clear the row with glass',
      width: 10, rows: ['###g###.##'],
      pieces: times(2, { shape: '1', special: [0, 2] }),
      goal: anyRow(function (r) { return r.glass > 0; })
    },
    {
      title: 'Flood', says: 'A flood square fills the gaps beside and below it.', goalText: 'Clear two rows with one piece',
      width: 10, rows: ['#####...##', '#####.#.##'],
      pieces: times(2, { shape: 'I3', special: [1, 'flood'] }),
      goal: function (c) { return c.n >= 2 && c.flood; }
    },
    {
      title: 'Pentrys', says: 'Stand the long piece up in the slot for five rows at once.', goalText: 'Clear five rows at once',
      width: 10, rows: times(5, '#########.'),
      pieces: times(2, { shape: 'I5' }),
      goal: function (c) { return c.n >= 5; }
    },
    {
      title: 'Hextrys', says: 'A flood at the foot of I5 fills the row below too. Which way must it turn?',
      goalText: 'Clear six rows at once',
      width: 10, rows: times(5, '#########.').concat(['########.#']),
      pieces: times(2, { shape: 'I5', special: [0, 'flood'] }),
      goal: function (c) { return c.n >= 6; }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
