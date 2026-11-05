/* The named starting points. A pen is on the rim, at a corner, at a focus, at the
   centre, or free: x and y as shares of the inner shape's perimeter. */

const circle = size => ({ type: 'circle', size, params: {} });
const free = (x, y = 0) => ({ kind: 'free', x, y });
const rim = (u = 0) => ({ kind: 'rim', u });
const corner = i => ({ kind: 'corner', i });
const focus = i => ({ kind: 'focus', i });

/* A share of a circle's radius, as a share of its perimeter. */
const radial = r => r / (Math.PI * 2);

export const PRESETS = [
  { key: 'peanut', label: 'Circle in a peanut', status: 'rolls', closes: 5,
    outer: { type: 'peanut', size: 120, params: { waist: 0.45 } }, inner: circle(50), pens: [free(radial(0.8))] },
  { key: 'hypotrochoid', label: 'Classic hypotrochoid', status: 'rolls', closes: 3,
    outer: circle(120), inner: circle(45), pens: [free(radial(0.7))] },
  { key: 'tusi', label: 'Tusi couple', status: 'rolls', closes: 1,
    outer: circle(120), inner: circle(60), pens: [rim(0), free(radial(0.5))] },
  { key: 'deltoid', label: 'Deltoid', status: 'rolls', closes: 1,
    outer: circle(120), inner: circle(40), pens: [rim(0)] },
  { key: 'astroid', label: 'Astroid', status: 'rolls', closes: 1,
    outer: circle(120), inner: circle(30), pens: [rim(0)] },
  { key: 'ellipse-peanut', label: 'Ellipse in a peanut', status: 'rolls', closes: 1,
    outer: { type: 'peanut', size: 120, params: { waist: 0.45 } },
    inner: { type: 'ellipse', size: 30, params: { stretch: 1.6 } }, pens: [focus(0), rim(0)] },
  { key: 'flower', label: 'Small circle in a flower', status: 'rolls', closes: 2,
    outer: { type: 'flower', size: 120, params: { petals: 5, depth: 0.25 } }, inner: circle(16), pens: [free(radial(0.8))] },
  /* The builder page's picture: 120/49 closes after 49 laps with 5-fold symmetry. */
  { key: 'star', label: 'Five-point star', status: 'rolls', closes: 49,
    outer: { type: 'flower', size: 120, params: { petals: 5, depth: 0.06 } }, inner: circle(49), pens: [rim(0)] },
  { key: 'tumble', label: 'Square tumbling in a circle', status: 'tumbles', closes: 8,
    outer: circle(120), inner: { type: 'polygon', size: 45.0363, params: { sides: 4, round: 0, bulge: 0 } }, pens: [corner(0)] },
  { key: 'reuleaux', label: 'Bulged triangle in a circle', status: 'rolls', closes: 3,
    outer: circle(120), inner: { type: 'polygon', size: 45, params: { sides: 3, round: 0, bulge: 0.5 } }, pens: [corner(0)] },
  /* Spins per lap come to exactly 2 when the circle's perimeter is 2 pi side / (2 + pi). */
  { key: 'hop', label: 'Circle hopping round a square', status: 'tumbles', closes: 1,
    outer: { type: 'polygon', size: 120, params: { sides: 4, round: 0, bulge: 0 } }, inner: circle(36.66), pens: [rim(0), free(radial(0.5))] },
  { key: 'eggs', label: 'Egg in an egg', status: 'rolls', closes: 3,
    outer: { type: 'egg', size: 120, params: { egg: 0.3 } }, inner: { type: 'egg', size: 22.5, params: { egg: 0.2 } }, pens: [free(radial(0.1), radial(0.6))] },
];
