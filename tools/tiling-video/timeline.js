/* The video's timeline, shared by the tiling capture and the overlay, so the
   slider graphic and the real tile shape agree on every frame. See storyboard.md.
   Time is in beats: 80 BPM, so beat b is at 0.75 b seconds, and the video is
   60 beats long. Beat 60 is beat 0: the video loops. Works in Node and in a
   browser (as window.Timeline). */
(function (root) {
  // The loop is 48.8 s: 1,464 frames, and 24 bars of music at 118.03 BPM. A bar is 2.5 of these beats and a music beat is 0.625, so
  // events the music marks sit on multiples of 0.625.
  var FPS = 30, BEATS = 60, LOOP_SECONDS = 48.8, BARS = 24;
  var SEC_PER_BEAT = LOOP_SECONDS / BEATS;
  var BPM = 60 / SEC_PER_BEAT;
  var MUSIC_BPM = BARS * 4 * 60 / LOOP_SECONDS;
  var FRAMES = Math.round(LOOP_SECONDS * FPS);          // 1464

  function wrap(b) { return ((b % BEATS) + BEATS) % BEATS; }
  function beatOfFrame(n) { return n / FPS / SEC_PER_BEAT; }
  // Smooth in and out, with zero speed at both ends.
  function ease(x) { return x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x); }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // Shape slider moves: from beat b0 to b1, from one angle to another. The
  // video opens on the Hat, still for 0.25 s, then goes
  // up through Spectre and Turtle to Comet, sweeps down to Chevron, and
  // returns to the Hat. It ends on the Hat, so the loop joins at rest.
  var STOPS = [[0, 'Chevron'], [30, 'Hat'], [45, 'Spectre'], [60, 'Turtle'], [90, 'Comet']];
  var PAUSE = 0.25 / SEC_PER_BEAT;
  var MOVES = [
    [PAUSE, 2.5, 30, 45], [3.125, 5, 45, 60], [5.625, 7.5, 60, 90], [8.75, 12.5, 90, 0], [15, 17.5, 0, 30],
    [37.5, 39.375, 30, 45], [55, 57.5, 45, 30]
  ];
  function deg(b) {
    b = wrap(b);
    var d = 30;                       // before the first move of the cycle: the Hat
    for (var i = 0; i < MOVES.length; i++) {
      var m = MOVES[i];
      if (b < m[0]) break;
      d = m[2] + (m[3] - m[2]) * ease((b - m[0]) / (m[1] - m[0]));
    }
    return d;
  }
  // The named stop the slider sits at, or null while it moves. A sweep that
  // passes a stop at speed does not count.
  function stopAt(b) {
    var d = deg(b), dBefore = deg(b - 0.1), dAfter = deg(b + 0.1);
    for (var i = 0; i < STOPS.length; i++) {
      var s0 = STOPS[i][0];
      if (Math.abs(d - s0) < 0.5 && Math.abs(dBefore - s0) < 2 && Math.abs(dAfter - s0) < 2) return STOPS[i][1];
    }
    return null;
  }

  // Hat colours: a preset id, or a dice roll. Each entry starts at its beat.
  var COLOURS = [
    [0, 'pastel', 'Pastel'], [20, 'rainbow', 'Rainbow'], [21.25, 'grey', 'Greyscale'],
    [22.5, 'dice:any', 'Dice: any colour'], [23.125, 'dice:rgb', 'Dice: RGB corners'],
    [23.75, 'dice:bw', 'Dice: black and white'], [24.375, 'dice:greys', 'Dice: greys'],
    [25, 'hands', 'Mirrored hats'], [53, 'pastel', 'Pastel']
  ];
  function colourAt(b) {
    b = wrap(b);
    var c = COLOURS[0];
    COLOURS.forEach(function (x) { if (b >= x[0]) c = x; });
    return { id: c[1], label: c[2] };
  }

  // Spectre edges: six sweeps of two beats from beat 41. Height is zero at
  // each sweep's ends, where the shape and arrangement switch unseen.
  var SWEEPS = [
    ['curve', 'S', 'Curve · single'], ['curve', 'alt', 'Curve · double'],
    ['triangle', 'S', 'Triangle · single'], ['triangle', 'alt', 'Triangle · double'],
    ['jigsaw', 'S', 'Jigsaw · single'], ['jigsaw', 'alt', 'Jigsaw · double']
  ];
  var SWEEP_START = 41, SWEEP_LEN = 2;
  // Returns { shape, arrangement, label, amount } with amount 0..1 of the
  // sweep's peak height, or null outside the edge section.
  function edgeAt(b) {
    b = wrap(b);
    var k = Math.floor((b - SWEEP_START) / SWEEP_LEN);
    if (k < 0 || k >= SWEEPS.length) return null;
    var x = (b - SWEEP_START - k * SWEEP_LEN) / SWEEP_LEN, s = Math.sin(Math.PI * x);
    return { index: k, shape: SWEEPS[k][0], arrangement: SWEEPS[k][1], label: SWEEPS[k][2], amount: s * s };
  }

  // Which page shows: 1 is all Hat, 0 is all Spectre. Crossfades over beats
  // 40 to 41 and 53 to 54.
  function hatMix(b) {
    b = wrap(b);
    if (b < 40) return 1;
    if (b < 41) return 1 - ease(b - 40);
    if (b < 53) return 0;
    if (b < 54) return ease(b - 53);
    return 1;
  }

  // Zoom, as a factor on the Hat page's normal scale: out over beats 30 to
  // 34, back in over 34 to 38. ZOOM_FAR sets how far out it goes.
  var ZOOM_FAR = 0.22;
  function zoomAt(b) {
    b = wrap(b);
    if (b < 30 || b >= 38) return 1;
    var x = b < 34 ? ease((b - 30) / 4) : 1 - ease((b - 34) / 4);
    return Math.exp(Math.log(ZOOM_FAR) * x);
  }

  // Captions: [id, start beat, end beat, main text, small second line].
  var CAPTIONS = [
    ['C1', 0.5, 6.5, 'One tile covers the whole plane, and the pattern never repeats.',
      'The Hat · Smith, Myers, Kaplan and Goodman-Strauss, 2023'],
    ['C2', 7, 17, 'Slide from chevron to comet, and every tile changes shape at once.'],
    ['C3', 18, 22.3, 'Colour the tiles by turn and mirror image.'],
    ['C5', 22.5, 24.8, 'Or roll the dice.'],
    ['C4', 25, 29.4, 'Blue marks the mirrored hats, about one tile in eight.'],
    ['C6', 29.7, 37.3, 'Pan and zoom. Tiles are built as you move, so the plane has no edge.'],
    ['C7', 39.5, 44.5, 'The Spectre covers the plane with no mirror images at all.'],
    ['C8', 45, 52.5, 'Change the edges, and every tile still fits.'],
    ['C9', 54, 58.5, 'Try it yourself at drbuild.uk/tiles']
  ];
  var FADE_BEATS = 0.4;   // 0.3 s
  function fadeWindow(b, b0, b1, f) {
    return clamp01(Math.min((b - b0) / f, (b1 - b) / f));
  }
  // Each visible caption with its opacity.
  function captionsAt(b) {
    b = wrap(b);
    return CAPTIONS.map(function (c) {
      return { id: c[0], text: c[3], sub: c[4] || null, opacity: fadeWindow(b, c[1], c[2], FADE_BEATS) };
    }).filter(function (c) { return c.opacity > 0; });
  }

  // The bottom slot holds the slider graphic, a palette label or an edge
  // label. Slider: beats 53.5 to 19.75 across the seam, and 37 to 41.
  function sliderOpacity(b) {
    b = wrap(b);
    if (b >= 53.5) return clamp01((b - 53.5) / 0.5);
    if (b <= 19.25) return 1;
    if (b <= 19.75) return 1 - (b - 19.25) / 0.5;
    if (b >= 37 && b <= 37.5) return (b - 37) / 0.5;
    if (b > 37.5 && b <= 40.5) return 1;
    if (b > 40.5 && b <= 41) return 1 - (b - 40.5) / 0.5;
    return 0;
  }
  // Palette label from 19.67 to 29.5, edge label from 41 to 53, fading 0.33 beat.
  function labelAt(b) {
    b = wrap(b);
    if (b >= 19.67 && b < 29.5) return { text: colourAt(Math.max(b, 20)).label, opacity: fadeWindow(b, 19.67, 29.5, 0.33) };
    var e = edgeAt(b);
    if (e) return { text: e.label, opacity: fadeWindow(b, 41, 53, 0.33) };
    return null;
  }

  var T = {
    FPS: FPS, BPM: BPM, MUSIC_BPM: MUSIC_BPM, BEATS: BEATS, BARS: BARS, LOOP_SECONDS: LOOP_SECONDS, FRAMES: FRAMES, SEC_PER_BEAT: SEC_PER_BEAT,
    PAUSE: PAUSE, STOPS: STOPS, MOVES: MOVES, COLOURS: COLOURS, SWEEPS: SWEEPS, CAPTIONS: CAPTIONS, ZOOM_FAR: ZOOM_FAR,
    wrap: wrap, ease: ease, beatOfFrame: beatOfFrame,
    deg: deg, stopAt: stopAt, colourAt: colourAt, edgeAt: edgeAt, hatMix: hatMix, zoomAt: zoomAt,
    captionsAt: captionsAt, sliderOpacity: sliderOpacity, labelAt: labelAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.Timeline = T;
})(this);
