/* The numbers that tune Pentrys: special square odds, the difficulties,
   speeds, timings, glass, and points. Change one here and the game, the tests and
   the simulated player all follow. docs/pentrys.md says what each one does.

   Runs in the browser and in Node: it hangs Pentrys.Config on the global
   object. Load it before rules.js. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});

  Pentrys.Config = {
    // The chance that any one square of a new piece is each kind, for each
    // set of special squares. Kinds: 2, 3, 0 (glass), 'flood', 'deluge',
    // 'bomb' and 'rowbomb'. Easy, Normal and Hard each play their own set,
    // and Custom offers all five.
    squares: {
      pure: [],
      plus: [[2, 1 / 25], [3, 1 / 100]],
      easy: [               // more of the helpful squares, less glass
        [2, 1 / 6],
        [3, 1 / 16],
        [0, 1 / 50],
        ['flood', 1 / 16],
        ['deluge', 1 / 20],
        ['bomb', 1 / 20],
        ['rowbomb', 1 / 25]
      ],
      normal: [
        [2, 1 / 8],
        [3, 1 / 25],
        [0, 1 / 25],
        ['flood', 1 / 25],
        ['deluge', 1 / 25],
        ['bomb', 1 / 25],
        ['rowbomb', 1 / 25]
      ],
      hard: [               // fewer of the helpful squares, more glass
        [2, 1 / 12],
        [3, 1 / 50],
        [0, 1 / 12],
        ['flood', 1 / 50],
        ['deluge', 1 / 80],
        ['bomb', 1 / 40],
        ['rowbomb', 1 / 80]
      ]
    },

    // Easy, Normal and Hard: the speed each starts at, its set of special
    // squares, and its choice rows. A new piece can still be swapped for one
    // in the queue until it has fallen choiceRows rows, or the player drops
    // it at all. All three play the same well and pieces.
    difficulty: {
      easy:   { speed: 1, squares: 'easy',   choiceRows: 3 },
      normal: { speed: 4, squares: 'normal', choiceRows: 2 },
      hard:   { speed: 7, squares: 'hard',   choiceRows: 1 }
    },
    width: 12,                  // the well, in squares, for Easy, Normal and Hard
    sizes: [3, 4, 5],           // the pieces they deal, by squares

    // The pieces shown in the queue, numbered 1 to queueLength.
    queueLength: 5,

    // Speeds 1 to speeds. Each falls the same number of times faster than
    // the one before, from firstRowSeconds a row at speed 1 to lastRowSeconds
    // a row at the top speed. The speed goes up one after every
    // clearsPerSpeed clears, whatever their size. The lessons stay at speed 1.
    speeds: 20,
    firstRowSeconds: 1,
    lastRowSeconds: 0.023,
    clearsPerSpeed: 5,

    // Timings, in sixtieths of a second unless named in seconds.
    lockTicks: 30,              // the shortest rest before a piece locks
    lockRows: 1.25,             // a resting piece locks after this many rows' worth of falling time
    maxResets: 15,              // moves and turns that restart the lock time
    clearTicks: 18,             // the pause while cleared rows vanish

    // Glass cracks, flashes, then breaks, at these ages in seconds.
    glassCrackSeconds: [30, 45],
    glassFlashSeconds: 57,
    glassBreakSeconds: 60,

    // Points. A clear of n rows scores rowPoints[n]; past six rows, each row
    // adds half as much again.
    rowPoints: [0, 100, 300, 700, 1300, 2300, 7100],
    spare: [1, 1.2, 1.3, 1.5, 1.8],   // multiplier by the clear's spare, 4 or more taking the last
    glassBonus: 1.5,            // multiplier for each glass square cleared
    crystalBonus: 2,            // multiplier for each row cleared with both glass and spare
    allClearBonus: 2,
    streakFrom: 3,              // clears in a row before the streak bonus starts
    streakStep: 0.1,            // a streak of n multiplies by 1 + streakStep × (n − 1)
    smashPoints: 100,           // each pane of glass a hard drop smashes
    blastGlassPoints: 100,      // each pane of glass a bomb destroys
    blastPoints: 10,            // each other square a bomb destroys
    fillPoints: 10,             // each gap a flood or deluge fills
    softDropPoints: 1,          // each row
    hardDropPoints: 2           // each row
  };
})(typeof window !== 'undefined' ? window : globalThis);
