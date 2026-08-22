# Roaming Ethereum diamond — shelved

**Status:** Shelved 2026-08-19, not in `site/index.html` · **Owner:** David

## Summary

A small Ethereum diamond that lived in the intro text, ran from the pointer,
and bent the surrounding words out of its way as it moved. Built and verified
working on 2026-08-19, then pulled the same day: David tried it live and
found it too disruptive for a builder page a stranger reads once. The code
below is not on disk in `site/index.html` — it was removed with `git stash`,
which is not a safe place to leave anything long-term, so the working source
is kept in full in the appendix here instead. Bring it back by pasting the
three pieces below into their matching spots in `site/index.html`.

This was also a trial run for a bigger idea David has: several different
characters roaming the page, each interacting with the text and with each
other in its own way. That is a separate, bigger effort and stays out of
scope for now. This doc exists so the working parts — the technique, the
tuning, the source — don't have to be rediscovered when it's picked up again.

## Why it was pulled

Too much motion for a page whose job is to be scanned and trusted quickly.
David's call, made after seeing it live rather than in the abstract — nothing
technical was wrong with it.

## The technique, for reuse

**The constraint that shapes everything:** a line of text is one rectangle to
the browser's layout engine. A float with `shape-outside` (as used for the
portrait higher up the page) can shorten that rectangle from the left or the
right, but it can never open a hole in the middle of it. So a diamond free to
roam anywhere in the column cannot use a real float — the words have to move
themselves.

**Words move vertically only, never sideways.** The first attempt pushed
words directly away from the diamond and ran neighbouring words into each
other, because the gap between two words is a few pixels while the words
themselves are tens of pixels wide — any sideways push strong enough to clear
the diamond closes those gaps first. Vertically there's headroom, so instead
each line leans out of the way as a whole, keeping its own letter spacing
intact, and the gap opens between one line and the next.

**The falloff is a raised cosine sideways, linear vertically**, spread over
roughly 240px sideways and 150px vertically — much wider than the 44px
diamond itself. A tight field either collides adjacent lines or gives
neighbouring words on the same line wildly different heights, so the line
looks shattered rather than bent.

**Words are wrapped in spans by script at load time**, via `TreeWalker` over
the body's text nodes, not written into the HTML. The source markdown-like
text stays plain and easy to edit; the wrapping happens only in the browser.

**The diamond itself is `pointer-events: none`**, so clicks and taps pass
straight through it to the text and links underneath. That's what makes it
uncatchable — it never needs to detect a click, because it can never receive
one.

**Colours** are the official ethereum.org purple palette, sampled directly
from the pixels of `eth-diamond-purple.png` in the `ethereum-org-website`
repo's brand assets (the coloured logo ships as PNG only, not SVG): `#8A92B2`
on the outer-left faces, `#62688F` on the outer-right and inner-left,
`#454A75` on the inner-right. Geometry is the canonical six-facet polygon
outline, redrawn as inline SVG.

Verified in headless Chromium at the time: zero glyph collisions across a
45-step pointer chase, stayed inside the text column from 320px to 1200px
viewport widths, escaped when cornered and pinned, zero animation frames
while idle, and both `prefers-reduced-motion` and no-JS left it sitting
inline in the sentence rather than breaking.

## Bringing it back

Three pieces, all self-contained, from the last known-working version. Drop
each into the matching spot in `site/index.html`.

**1. CSS**, after the `p.intro` rule:

```css
/* The Ethereum diamond starts inline, in the sentence it is written into.
   That is where a reader with no script, or with reduced motion, finds it,
   and it is the position the script measures to launch it from. .is-loose
   then lifts it out of the flow, so from that point on it is driven by
   transform alone and moving it costs no layout.

   pointer-events: none is what makes it uncatchable. Clicks and taps pass
   straight through to the text and links underneath, so the diamond can
   never swallow one, and its only answer to a pointer is to leave. */
.eth-diamond {
  display: inline-block;
  width: 0.9em;
  margin-left: 0.2em;
  vertical-align: -0.15em;
}
.eth-diamond svg {
  display: block;
  width: 100%;
  height: auto;
}
.eth-diamond.is-loose {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 1;
  width: 44px;
  margin: 0;
  pointer-events: none;
  will-change: transform;
}
@media (max-width: 480px) {
  .eth-diamond.is-loose { width: 34px; }
}
/* One span per word, built by script at load time rather than written into
   the HTML, so the source stays plain text and stays easy to edit. Words
   move by transform, which CSS applies to atomic inlines only, hence
   inline-block. The same rule stops a link's underline reaching its own
   words, so link words draw their own; it lands in the same place, in the
   same currentColor, as the one it replaces. */
.w {
  display: inline-block;
}
a .w {
  text-decoration: underline;
}
```

**2. HTML**, the diamond itself, spliced into the end of the last intro
paragraph:

```html
<p class="intro">
  Hope you enjoy looking at some of the interesting stuff I've built!<span class="eth-diamond" id="eth-diamond" aria-hidden="true"><svg viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg"><polygon fill="#62688F" points="127.9611 0 125.1661 9.5 125.1661 285.168 127.9611 287.958 255.9231 212.32"/><polygon fill="#8A92B2" points="127.962 0 0 212.32 127.962 287.959 127.962 154.158"/><polygon fill="#62688F" points="127.9611 312.1866 126.3861 314.1066 126.3861 412.3056 127.9611 416.9066 255.9991 236.5866"/><polygon fill="#8A92B2" points="127.962 416.9052 127.962 312.1852 0 236.5852"/><polygon fill="#454A75" points="127.9611 287.9577 255.9211 212.3207 127.9611 154.1587"/><polygon fill="#62688F" points="0.0009 212.3208 127.9609 287.9578 127.9609 154.1588"/></svg></span>
</p>
```

**3. JavaScript**, as its own `<script>` block at the foot of the page,
alongside the theme-toggle and droste scripts:

```javascript
/* The Ethereum diamond roams the text column and shoves the words aside.

   Text can only be displaced two ways. A float with shape-outside rewraps
   it for real, which is what the portrait does higher up, but a line box is
   one rectangle: a float can shorten it from the left or the right and can
   never open a hole in the middle of it. A diamond that goes anywhere in
   the column therefore cannot use one. So the words move instead of
   rewrapping. Each is wrapped in a span here at load time, and any word the
   diamond comes near slides clear of it and eases home once it has passed.
   Nothing reflows, so the page never jumps and the line breaks a reader is
   part-way through never change under them.

   Words move up and down only, never sideways. The gap between two words is
   a fraction of the width of either, so the smallest sideways shove closes
   it and runs them together; there is no strength of horizontal push that
   both clears the diamond and keeps the words apart. Vertically there is
   room, and a whole line can lean out of the way at once. So each line
   bends around the diamond, keeping its own spacing exactly, and the gap
   opens between one line and the next.

   That is also what fixes the reach. Opening a gap anywhere squeezes the
   lines either side of it, and the squeeze is the gap divided by how far
   the push carries. Clearing a 72px diamond takes about 80px of gap, so the
   push has to fade out over roughly 175px to leave the lines above and
   below still legible. Hence a soft, wide field rather than a tight one.

   The diamond and the words all work in one coordinate space: pixels from
   the top left of body's padding box, which is the containing block the
   diamond is positioned in. Those coordinates belong to the page rather
   than the viewport, so the diamond scrolls with the text it is sitting in
   and stays where it was left. */
(function () {
  var diamond = document.getElementById('eth-diamond');
  if (!diamond) return;
  // Reduced motion keeps it exactly where the HTML puts it: inline, in the
  // sentence, moving for nobody.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var FLEE_RADIUS = 135;  // how near the pointer gets before the diamond bolts
  var FLEE_FORCE = 3.6;   // px/frame² at the moment of contact
  var DAMPING = 0.87;     // what fraction of its speed it keeps each frame
  var MAX_SPEED = 24;     // px/frame, so a fast pointer can still herd it
  var PUSH_X = 240;       // how far to either side a word feels the diamond
  var PUSH_Y = 150;       // and how far above and below, over which it fades
  var PUSH_MAX = 34;      // furthest a word is moved, directly under it
  var EASE = 0.22;        // fraction of the way a word travels home each frame
  var REST = 0.05;        // below this, in px, everything counts as stopped

  var body = document.body;
  var words = [];         // every word on the page, sorted top to bottom
  var ys = [];            // their y coordinates alone, for the band search
  var active = [];        // only those currently displaced or easing home
  var halfW = 0, halfH = 0;
  var minX = 0, maxX = 0, minY = 0, maxY = 0;
  var pageLeft = 0, pageTop = 0;
  var x = 0, y = 0, vx = 0, vy = 0, tilt = 0;
  var pointerX = 0, pointerY = 0, hasPointer = false;
  var running = false;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* Split every text node into words, wrapping each in a span and putting
     the whitespace back as it was. Keeping the gaps as plain text is what
     leaves line breaking, spacing and copy-paste identical to before. */
  function wordify() {
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var parent = node.parentNode;
        if (!parent || !parent.closest) return NodeFilter.FILTER_REJECT;
        if (parent.closest('script, style, .eth-diamond, .theme-toggle')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var found = [];
    while (walker.nextNode()) found.push(walker.currentNode);
    found.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (!part.trim()) {
          frag.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement('span');
        span.className = 'w';
        span.textContent = part;
        frag.appendChild(span);
        words.push({ el: span, x: 0, y: 0, dy: 0, ty: 0, on: false });
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* Read every resting position in one pass. Offsets are cleared first, so
     what gets measured is where each word belongs rather than where it
     happens to be sitting. */
  function measure() {
    words.forEach(function (w) {
      w.el.style.transform = '';
      w.dy = 0; w.ty = 0; w.on = false;
    });
    active.length = 0;

    var rect = body.getBoundingClientRect();
    pageLeft = rect.left + window.scrollX;
    pageTop = rect.top + window.scrollY;

    var cs = getComputedStyle(body);
    var padL = parseFloat(cs.paddingLeft);
    var padR = parseFloat(cs.paddingRight);
    var padT = parseFloat(cs.paddingTop);
    var padB = parseFloat(cs.paddingBottom);
    halfW = diamond.offsetWidth / 2;
    halfH = diamond.offsetHeight / 2;
    minX = padL + halfW;
    maxX = body.clientWidth - padR - halfW;
    minY = padT + halfH;
    maxY = body.clientHeight - padB - halfH;

    words.forEach(function (w) {
      var r = w.el.getBoundingClientRect();
      w.x = r.left - rect.left + r.width / 2;
      w.y = r.top - rect.top + r.height / 2;
    });
    words.sort(function (a, b) { return a.y - b.y; });
    ys = words.map(function (w) { return w.y; });
  }

  // First word at or below a given y, so a frame only ever visits the few
  // lines the diamond actually reaches rather than all 900 words.
  function firstAt(target) {
    var lo = 0, hi = ys.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (ys[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* Aim every word near the diamond out of its way and move the displaced
     ones a step towards where they are aimed. A word leans away from the
     side of the diamond it is already on, hardest directly under it and
     fading to nothing at the edge of the field, so a line bends smoothly
     rather than stepping. */
  function reach(w) {
    var side = Math.abs(w.x - x);
    if (side >= PUSH_X) return 0;
    var gap = w.y - y;
    if (Math.abs(gap) >= PUSH_Y) return 0;
    // Sideways the fall-off is a raised cosine, and it is spread over a good
    // part of the column rather than the width of the diamond. Two words
    // side by side must not be given wildly different heights or the line
    // shatters instead of bending, and a word is 50px wide, so the curve has
    // to be shallow enough to still read as one line. Vertically it falls
    // off straight, which for a given reach is the gentlest squeeze on the
    // lines above and below.
    var far = 0.5 * (1 + Math.cos(Math.PI * side / PUSH_X)) *
      (1 - Math.abs(gap) / PUSH_Y) * PUSH_MAX;
    // A word level with the diamond is behind it, hidden, and goes either
    // way. Which way flips as the diamond passes, and the ease carries it
    // across rather than snapping.
    return gap >= 0 ? far : -far;
  }

  function shove(immediate) {
    for (var i = firstAt(y - PUSH_Y), end = firstAt(y + PUSH_Y); i < end; i++) {
      var w = words[i];
      w.ty = reach(w);
      if (w.ty && !w.on) { w.on = true; active.push(w); }
    }

    var busy = false;
    var keep = [];
    for (var j = 0; j < active.length; j++) {
      var a = active[j];
      // Out of the field this frame, so it is on its way home.
      if (Math.abs(a.y - y) >= PUSH_Y) a.ty = 0;

      a.dy += (a.ty - a.dy) * (immediate ? 1 : EASE);
      if (Math.abs(a.dy - a.ty) < REST) a.dy = a.ty; else busy = true;

      if (a.dy === 0) {
        a.el.style.transform = '';
        a.on = false; // home, and dropped from the active list below
      } else {
        a.el.style.transform = 'translateY(' + a.dy.toFixed(2) + 'px)';
        keep.push(a);
      }
    }
    active = keep;
    return busy;
  }

  function place() {
    // A lean into the direction of travel, which unwinds as it slows.
    tilt += (clamp(vx * 0.7, -16, 16) - tilt) * 0.15;
    diamond.style.transform = 'translate(' + (x - halfW).toFixed(2) + 'px,' +
      (y - halfH).toFixed(2) + 'px) rotate(' + tilt.toFixed(2) + 'deg)';
  }

  function step() {
    if (hasPointer) {
      var ax = x - pointerX, ay = y - pointerY;
      var len = Math.sqrt(ax * ax + ay * ay);
      if (len < FLEE_RADIUS) {
        if (len < 0.001) { ax = 1; ay = 0; len = 1; }
        var t = 1 - len / FLEE_RADIUS;
        var f = FLEE_FORCE * t * t; // barely stirs at the edge, bolts up close
        vx += (ax / len) * f;
        vy += (ay / len) * f;
        // Pinned flat against a wall by a pointer coming straight at it,
        // there is no sideways push in that force at all. Send it along the
        // wall, towards whichever end has more room.
        var onSide = x <= minX + 0.5 || x >= maxX - 0.5;
        var onEnd = y <= minY + 0.5 || y >= maxY - 0.5;
        if (onSide && Math.abs(vy) < 0.4) {
          vy += (y - (minY + maxY) / 2 > 0 ? -1 : 1) * f;
        } else if (onEnd && Math.abs(vx) < 0.4) {
          vx += (x - (minX + maxX) / 2 > 0 ? -1 : 1) * f;
        }
      }
    }

    vx *= DAMPING;
    vy *= DAMPING;
    var speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > MAX_SPEED) {
      vx = vx / speed * MAX_SPEED;
      vy = vy / speed * MAX_SPEED;
    }
    x += vx;
    y += vy;

    // Walls stop it dead rather than bouncing it, so a diamond driven into
    // one slides along it instead of rebounding into the pointer.
    if (x < minX) { x = minX; vx = 0; }
    if (x > maxX) { x = maxX; vx = 0; }
    if (y < minY) { y = minY; vy = 0; }
    if (y > maxY) { y = maxY; vy = 0; }
  }

  // The loop runs only while something is moving. At rest it stops entirely,
  // which is why an idle page costs nothing, and every copy the droste frame
  // opens costs nothing either until a pointer enters it.
  function tick() {
    step();
    var busy = shove(false);
    place();
    if (busy || Math.sqrt(vx * vx + vy * vy) > REST || Math.abs(tilt) > 0.1) {
      requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function wake() {
    if (running) return;
    running = true;
    requestAnimationFrame(tick);
  }

  // Where it stands in the sentence is where it starts, so the launch point
  // follows the text if that paragraph is ever reworded.
  var start = diamond.getBoundingClientRect();
  var origin = body.getBoundingClientRect();
  var startX = start.left - origin.left + start.width / 2;
  var startY = start.top - origin.top + start.height / 2;

  diamond.classList.add('is-loose');
  wordify();
  measure();
  x = clamp(startX, minX, maxX);
  y = clamp(startY, minY, maxY);
  shove(true); // open the gap before the first paint, not after it
  place();

  document.addEventListener('pointermove', function (e) {
    pointerX = e.pageX - pageLeft;
    pointerY = e.pageY - pageTop;
    hasPointer = true;
    wake();
  }, { passive: true });

  // A touch reads as a pointer for as long as it lasts. Nothing is
  // cancelled or captured, so a finger dragging the page still scrolls it.
  document.addEventListener('pointerdown', function (e) {
    pointerX = e.pageX - pageLeft;
    pointerY = e.pageY - pageTop;
    hasPointer = true;
    wake();
  }, { passive: true });

  document.addEventListener('pointerup', function () { hasPointer = false; wake(); });
  document.addEventListener('pointercancel', function () { hasPointer = false; wake(); });
  document.addEventListener('mouseleave', function () { hasPointer = false; wake(); });

  var settle;
  window.addEventListener('resize', function () {
    clearTimeout(settle);
    settle = setTimeout(function () {
      measure();
      x = clamp(x, minX, maxX);
      y = clamp(y, minY, maxY);
      shove(true);
      place();
    }, 150);
  });

  // Images carry their own width and height, so nothing here should shift
  // after load. Measuring once more costs one frame and covers the case
  // where something did.
  window.addEventListener('load', function () {
    measure();
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
    shove(true);
    place();
  });
})();
```

One thing to double-check on revival: `wordify()` walks the whole `<body>`,
so if new elements have been added to the page since 2026-08-19, extend the
`.closest('script, style, .eth-diamond, .theme-toggle')` exclusion list to
cover anything new that shouldn't have its text wrapped (the droste backdrop,
for instance, only exists after it's opened, so it was never an issue here,
but a similarly script-built element added later would need the same
treatment).

## For the bigger idea — several roaming characters

If this comes back as part of that larger idea rather than as this diamond
alone, the two pieces worth keeping are the vertical-only word displacement
(section above) and the flee behaviour in `step()` — inverse-square-ish force
near the pointer, damping, a speed cap, and walls that stop dead rather than
bounce. Multiple characters would each need their own `x`/`y`/`vx`/`vy` and
their own call into a shared `reach()`-like field, summed per word rather
than overwritten, so two characters near the same word don't fight over its
`transform`. That summing is new work, not present in this version, since
only one diamond ever existed at a time here.
