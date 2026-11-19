# Hyperbolic Models Explorer video: storyboard

A 30-second square video of the Hyperbolic Models Explorer at
drbuild.uk/hyperbolic, version 4. David approved its paths on 2026-11-19 in `live.html`. It plays as a seamless loop: it starts
and ends on the Poincaré disk in the app's home view, with the title
showing and the pointer resting low on the right. `timeline.js` holds
every number here and is the source of truth.

## Format

- 1080 × 1080, 30 fps, 900 frames, silent. Times are plain seconds.
- The app's own page in its light theme, filmed whole at 960 × 960 CSS px,
  with its cards hidden.
- The app's defaults: {7,3}, Many colours, shading 70%, edge width 2, and
  the Compass design, Upright, at 60% opacity.
- A real mouse pointer makes every drag. Each drag follows one smooth
  curve, a circle, a Bezier curve or a polar curve, and never returns to its
  start. Time maps to the curve through septic smootherstep, so velocity,
  acceleration and jerk are continuous and zero at both ends. Peak pointer
  speeds stay between 290 and 460 px/s in the 960 px frame.
- A change of model crossfades from the old picture over 0.5 s.
- The view drifts from 0.25 s, and nothing moves from 29.4 s to the end.

## Sections

| Seconds | Picture | Main caption | Small line |
|---|---|---|---|
| 0–3 | Poincaré disk, drifting gently | Hyperbolic Models Explorer | One tiling, many ways to draw it |
| 3–7 | The pointer drags the plane round a full circle, anticlockwise | Poincaré disk: drag the plane | Every heptagon is the same size |
| 7–11 | Klein disk, up and to the right, then turning down to end elsewhere | Klein disk: lines stay straight | Angles give way instead |
| 11–15 | Half-plane, a P: up from near the left edge, round the top and back in | Half-plane | Angles stay true; tiles shrink to the floor |
| 15–19 | Band, up from half way to the lower edge, an arc to the middle, then down diagonally | Band | A hyperbolic Mercator map |
| 19–23 | Inverted disk, from far out, a shallow curve in towards the hole, then out again | Inverted disk | Inside out: the centre is at infinity |
| 23–27 | Joukowsky, from near the slit's right end, a loop away, then back along it leftwards | Joukowsky | The disk opened out round a slit |
| 27–30 | Poincaré disk, gliding home by 29.4 s | Try it yourself at drbuild.uk/hyperbolic | |

The title fades in from 29 s, so it is whole on the loop's join.
