/* The Non-Rupert explorer video's timeline: every pointer move, click, drag
   and caption, in beats. stage.js draws each frame from it, render.js drives
   the mouse from it, and music for the video can be written to it. See
   storyboard.md.

   128 BPM: a beat is 0.46875 s, and the video is 64 beats, 16 bars of 4/4.
   That is exactly 30 s, 1,800 frames at 60 fps. Beat 64 is beat 0: the
   video loops, starting and ending on the Undecanope turning before its
   hole is cut. Works in Node and in a browser, as window.NonrupTimeline. */
(function () {
  'use strict';

  var BPM = 128, BEATS = 64, FPS = 60;
  var SEC_PER_BEAT = 60 / BPM;
  var FRAMES = Math.round(BEATS * SEC_PER_BEAT * FPS);

  // The app runs PREROLL frames before the video starts, so the Undecanope
  // is already turning on the first frame. The last click, on C11, lands on
  // beat LOOP_CLICK, PREROLL frames before the end. The solid then turns
  // from its resting pose for exactly as long as it had on the first frame,
  // so the last frame flows into the first. LOOP_CLICK must fall on a frame:
  // a beat is 28.125 frames, so it must be a multiple of 8 beats.
  var LOOP_CLICK = 56;
  var PREROLL = FRAMES + 1 - Math.round(LOOP_CLICK * SEC_PER_BEAT * FPS);   // 226 frames

  // The pointer's rest, in the empty right side of the 3D view. Stage
  // coordinates are CSS px on the 540 px square.
  var REST = [458, 438];

  // Pointer moves: from beat b0 to b1, to a target. A target is a shape
  // button (c11, c15, cube), an action button (cut, push, passage,
  // search), the solid in the 3D view, or the rest.
  var MOVES = [
    [5.6, 7.2, 'cube'],
    [8.4, 9.3, 'passage'],
    [10.4, 11.3, 'push'],
    [16.6, 18.4, 'c11'],
    [19.4, 20.3, 'cut'],
    [21.4, 22.4, 'solid'],
    [25.6, 26.5, 'push'],
    [29.4, 30.4, 'search'],
    [36.8, 37.4, 'search'],     // the button now reads Stop and is narrower
    [38.4, 39.3, 'push'],
    [43.6, 45.3, 'c15'],
    [54.2, 55.4, 'c11'],
    [56.8, 59.8, 'rest']
  ];

  // Clicks, each on a beat: the button goes down PRESS seconds before and
  // comes up on the beat, as a mouse button does. The name is what the
  // pointer must be on; the stage checks it.
  var PRESS = 0.09;
  var CLICKS = [
    [8, 'cube'],
    [10, 'passage'],
    [12, 'push'],
    [19, 'c11'],
    [21, 'cut'],
    [27, 'push'],
    [31, 'search'],
    [38, 'search'],             // Stop
    [40, 'push'],
    [46, 'c15'],
    [LOOP_CLICK, 'c11']
  ];

  // Drags on the solid in the 3D view: press on beat b0, move by [dx, dy]
  // px, release on beat b1. Dragging the solid turns it, as on the page.
  var DRAGS = [
    [23, 25, [64, -22]]
  ];

  // Captions: from beat b0 to b1, fading in and out over FADE seconds. The
  // first starts before beat 0, so it is whole on the first frame. Each
  // main line fits on one line, so the card clears the pass ratio below it.
  // The search's count is the app's own, from the render's log.
  var FADE = 0.3;
  var CAPTIONS = [
    [-0.64, 6, 'The Undecanope', 'A non-Rupert polyhedron with only 88 vertices'],
    [6.6, 18.4, 'Cut a hole in a cube, and a copy passes through.', 'A solid that lets a copy of itself through is Rupert.'],
    [19.4, 30.6, 'Cut a hole in the Undecanope, and its copy jams.', 'Red shows where it sticks out.'],
    [31.2, 45.4, 'Search 15,000 pairs of views.', 'The best still sticks out.'],
    [46.4, 55.4, 'The first non-Rupert solid was found in 2025.', 'The Noperthedron has 90 vertices. The Undecanope has only 88.'],
    [56.4, 63.36, 'Try it yourself at drbuild.uk/nonrup']
  ];

  // Smooth start and stop, with no jerk at either end.
  function smooth(u) {
    u = u <= 0 ? 0 : u >= 1 ? 1 : u;
    return u * u * u * (u * (u * 6 - 15) + 10);
  }

  // Is the mouse button down at beat b?
  function pressed(b) {
    var press = PRESS / SEC_PER_BEAT;
    return CLICKS.some(function (c) { return b >= c[0] - press && b < c[0]; }) ||
      DRAGS.some(function (d) { return b >= d[0] && b < d[1]; });
  }

  var Timeline = {
    BPM: BPM, BEATS: BEATS, FPS: FPS, FRAMES: FRAMES, SEC_PER_BEAT: SEC_PER_BEAT,
    PREROLL: PREROLL, LOOP_CLICK: LOOP_CLICK, REST: REST, MOVES: MOVES, PRESS: PRESS,
    CLICKS: CLICKS, DRAGS: DRAGS, FADE: FADE, CAPTIONS: CAPTIONS,
    smooth: smooth, pressed: pressed
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Timeline;
  else window.NonrupTimeline = Timeline;
})();
