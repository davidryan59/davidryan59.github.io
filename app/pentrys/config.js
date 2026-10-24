/* The numbers that tune Pentrys: special square odds, the difficulties,
   speeds, timings, glass, and points. Change one here and the game, the tests and
   the simulated player all follow. docs/pentrys.md says what each one does.

   Runs in the browser and in Node: it hangs Pentrys.Config on the global
   object. Load it before rules.js. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  Pentrys.Config = {
    // How rare each kind of special square is, for each set of special
    // squares. Each entry is [kind, N]: any one square of a new piece is that
    // kind with chance 1 in N, so a bigger N is rarer. Kinds: 2, 3, 0 (glass),
    // 'flood', 'deluge', 'bomb' and 'rowbomb'. Easy, Normal and Hard each play
    // their own set, and Custom offers all five.
    squares: {
      pure: [],
      plus: [[2, 25], [3, 100]],
      easy: [               // more of the helpful squares, less glass
        [0, 5000],
        [2, 3],
        [3, 1600],
        ['flood', 1600],
        ['deluge', 2000],
        ['bomb', 2000],
        ['rowbomb', 2500]
      ],
      normal: [
        [0, 40],
        [2, 25],
        [3, 45],
        ['flood', 25],
        ['deluge', 40],
        ['bomb', 30],
        ['rowbomb', 50]
      ],
      hard: [               // fewer of the helpful squares, more glass
        [0, 12],
        [2, 12],
        [3, 50],
        ['flood', 50],
        ['deluge', 80],
        ['bomb', 40],
        ['rowbomb', 80]
      ]
    },

    // Easy, Normal and Hard: how fast its speed 1 falls, in seconds a row,
    // its set of special squares, and its choice rows. A new piece can still
    // be swapped for one in the queue until it has fallen choiceRows rows,
    // or the player drops it at all. All three play the same well and pieces.
    difficulty: {
      easy:   { firstRowSeconds: 1,    squares: 'easy',   choiceRows: 3 },
      normal: { firstRowSeconds: 0.55, squares: 'normal', choiceRows: 2 },
      hard:   { firstRowSeconds: 0.3,  squares: 'hard',   choiceRows: 1 }
    },
    width: 12,                  // the well, in squares, for Easy, Normal and Hard
    sizes: [3, 4, 5],           // the pieces they deal, by squares

    // Custom: the choices it starts with, before a player changes them. Its
    // width and sizes start from the two above. pace names the difficulty
    // whose first-row time it uses; speed is its starting speed.
    custom: { squares: 'normal', pace: 'normal', speed: 1, choiceRows: 2 },
    customWidths: [10, 12, 14, 16, 18],   // the wells Custom offers

    // The pieces shown in the queue, numbered 1 to queueLength.
    queueLength: 5,

    // Speeds 1 to speeds. Every game starts at speed 1, which falls at its
    // difficulty's firstRowSeconds a row, and climbs to the top speed, which
    // falls at lastRowSeconds a row for all three. Each speed falls the same
    // number of times faster than the one before. The speed goes up one
    // after every clearsPerSpeed clears, whatever their size. Points multiply
    // by ×1 at 1 s a row, up to topSpeedMultiplier at lastRowSeconds a row,
    // on a log scale, so a faster game scores more. The lessons stay at
    // Easy's speed 1, at half pace.
    speeds: 20,
    lastRowSeconds: 0.023,
    topSpeedMultiplier: 10,
    clearsPerSpeed: 5,

    // Timings, in sixtieths of a second unless named in seconds.
    lockTicks: 18,              // the shortest rest before a piece locks: 0.3 s
    lockRows: 1.25,             // a resting piece locks after this many rows' worth of falling time
    maxResets: 15,              // moves and turns that restart the lock time
    clearTicks: 18,             // the pause while cleared rows vanish

    // Key repeat, which a player can change in Settings. das is the delay
    // before a held key repeats, arr the time between repeats (0 jumps to
    // the wall), both in milliseconds; sdf is the soft drop, in rows a second.
    // Shows, below the well, how often each special square has been dealt this
    // game, against the odds above. Set false to hide it.
    oddsPanel: true,

    keyRepeat: { das: 170, arr: 50, sdf: 20 },

    // Glass cracks, flashes, then breaks, at these ages in seconds.
    glassCrackSeconds: [30, 45],
    glassFlashSeconds: 57,
    glassBreakSeconds: 60,

    // Points. A clear of n rows scores rowPoints[n]; past six rows, each row
    // adds half as much again.
    rowPoints: [0, 100, 300, 700, 1300, 2300, 7100],
    spareOne: 1.5,              // multiplier for 1 spare; n spare, from 2, multiplies by n
    glassBonus: 1.5,            // multiplier for each glass square cleared
    crystalBonus: 1.5,          // multiplier for each row cleared with both glass and spare
    allClearBonus: 2,
    streakFrom: 2,              // a streak of n clears in a row, from this many, multiplies by n
    smashPoints: 100,           // each pane of glass a hard drop smashes
    blastGlassPoints: 100,      // each pane of glass a bomb destroys; other squares score nothing
    softDropPoints: 1,          // each row
    hardDropPoints: 2           // each row
  };
})(typeof window !== 'undefined' ? window : globalThis);
