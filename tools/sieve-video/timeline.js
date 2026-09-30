/* The sieve video's timeline: every click, pointer move, camera move and
   caption, in beats. stage.html draws each frame from it, and music for the
   video can be written to it. See storyboard.md.

   128 BPM: a beat is 0.46875 s, and the video is 64 beats, 16 bars of 4/4.
   That is exactly 30 s, 1,800 frames at 60 fps. Beat 64 is beat 0: the
   video loops, and it starts and ends on the same grey hundred square.
   Works in Node and in a browser, as window.Timeline. */
(function () {
  'use strict';

  var BPM = 128, BEATS = 64, FPS = 60;
  var SEC_PER_BEAT = 60 / BPM;
  var FRAMES = Math.round(BEATS * SEC_PER_BEAT * FPS);

  // The stage is 540 CSS px square, drawn at twice the pixel density, so
  // 1080 px of video. The captions sit above TOP and the grid below it. A
  // view is the tile size s, and the place (x, y) on the stage of the top
  // left corner of 0, the grid's first tile.
  var TOP = 140;
  var VIEWS = {
    hundred: { s: 38, x: 80, y: TOP },       // ten rows of ten, as the classroom hundred square
    w30: { s: 17.2, x: 12, y: TOP },         // rows 30 wide
    w210: { s: 2.5, x: 7.5, y: TOP }         // rows 210 wide, each tile 5 px of video
  };
  var FIRST_VIEW = 'hundred';

  // Camera moves: from beat b0 to b1, to a view. Between moves it holds.
  var CAMERA = [[16.1, 18.6, 'w30'], [27.3, 34.5, 'w210'], [35.5, 40, 'hundred']];

  // Clicks, each landing on its beat. The button goes down PRESS seconds
  // before, as a mouse button does.
  //   [b, 'tile', n]    choose n, which must be grey
  //   [b, 'width', w]   in the Row width field: the rows become w wide
  //   [b, 'clear']      Clear: every chosen number goes
  var PRESS = 0.09;
  var FIRST_WIDTH = 10;
  var CLICKS = [
    [2, 'tile', 2], [5, 'tile', 3], [7, 'tile', 5], [9, 'tile', 7],
    [16, 'width', 30],
    [20, 'tile', 11], [21, 'tile', 13], [22, 'tile', 17], [23, 'tile', 19], [24, 'tile', 23], [25, 'tile', 29],
    [27, 'width', 210],
    [40.5, 'width', 10],
    [42, 'clear'],
    [44.5, 'tile', 3], [47, 'tile', 4], [49.5, 'tile', 2],
    [60, 'clear']
  ];

  // Pointer moves: from beat b0 to b1, to a tile, the Row width field, the
  // Clear button, or its rest in the right margin. A fourth entry names a
  // tile the path bends towards. Pointing at a chosen number dims the board
  // round it, so the paths keep off chosen numbers except where the video
  // points at one on purpose.
  var MOVES = [
    [0.5, 1.7, 2],
    [4.1, 4.75, 3],
    [6.1, 6.75, 5],
    [8.1, 8.75, 7],
    [13.6, 15.6, 'width'],
    [18.2, 19.6, 11],
    [20.2, 20.75, 13], [21.2, 21.75, 17], [22.2, 22.75, 19], [23.2, 23.75, 23], [24.2, 24.75, 29],
    [25.4, 26.7, 'width'],
    [41, 41.75, 'clear'],
    [42.6, 44.2, 3],
    [45.9, 46.7, 4],
    [48.1, 49.2, 2, 23],
    [50.3, 51.3, 4, 23],   // points at 4: the board dims, and its multiples are ringed
    [55, 57.2, 'clear'],
    [60.8, 62.6, 'rest']
  ];

  // Captions: from beat b0 to b1, fading in and out over FADE seconds. The
  // first starts before beat 0, so it is whole on the first frame.
  var FADE = 0.3;
  var CAPTIONS = [
    [-0.64, 6.2, 'Sieve of Eratosthenes', 'Choose a number, and it colours its multiples.'],
    [6.6, 15.4, 'Choose 2, 3, 5 and 7, and only the primes stay grey.'],
    [16.4, 26.6, 'Rows 30 wide put every prime after 5 in eight columns.'],
    [27.4, 38.6, 'Rows 210 wide put every prime after 7 in 48 columns.'],
    [41.4, 54, 'Or choose your own primes, wisely or foolishly.', 'Here 4 comes before 2.'],
    [54.4, 63.36, 'Try it yourself at drbuild.uk/sieve']
  ];

  // Smooth start and stop, with no jerk at either end.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }

  // The camera at beat b. The tile size moves on a log scale, so a zoom
  // runs at one pace from start to end.
  function view(b) {
    var v = VIEWS[FIRST_VIEW];
    for (var i = 0; i < CAMERA.length; i++) {
      var m = CAMERA[i], to = VIEWS[m[2]];
      if (b < m[0]) break;
      if (b >= m[1]) { v = to; continue; }
      var u = smooth((b - m[0]) / (m[1] - m[0]));
      return {
        s: Math.exp(Math.log(v.s) + (Math.log(to.s) - Math.log(v.s)) * u),
        x: v.x + (to.x - v.x) * u,
        y: v.y + (to.y - v.y) * u
      };
    }
    return v;
  }

  function widthAt(b) {
    var w = FIRST_WIDTH;
    CLICKS.forEach(function (c) { if (c[1] === 'width' && c[0] <= b) w = c[2]; });
    return w;
  }

  var Timeline = {
    BPM: BPM, BEATS: BEATS, FPS: FPS, FRAMES: FRAMES, SEC_PER_BEAT: SEC_PER_BEAT,
    TOP: TOP, VIEWS: VIEWS, CAMERA: CAMERA, PRESS: PRESS, FIRST_WIDTH: FIRST_WIDTH,
    CLICKS: CLICKS, MOVES: MOVES, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, view: view, widthAt: widthAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.Timeline = Timeline;
})();
