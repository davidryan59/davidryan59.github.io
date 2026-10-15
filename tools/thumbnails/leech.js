/* Draw the animated Leech explorer thumbnail from the explorer's own model.

   Seen through one octad, all 196,560 balls fall on 2,641 spots: the centre,
   240 outer spots (E8's roots), an inner copy of them at half size, and 2,160
   middle spots. The picture moves through Petrie, Squares and Octagonal and
   back on a 6 s loop, with true 8-dimensional steps inside the octad.

   Each ring of dots is one path of zero-length round-capped strokes, so 240
   moving dots cost one animated path. The inner ring re-uses the outer path at
   half scale, with a larger inherited stroke width. The middle spots are three
   still layers, one per preset, that crossfade. */
'use strict';

const fs = require('fs'), path = require('path');
const E8 = require('../../app/e8/model.js');
const Leech = require('../../app/leech/lattice.js');
const Frame = require('../../app/leech/frame.js');
const LeechScenes = require('../../app/leech/scenes.js');

const SQRT8 = Math.sqrt(8), DURATION = 6, RADIUS = 55, MAX_BYTES = 300 * 1024;
const data = Leech.build(), positions = Leech.TRIO[0];
const scenes = LeechScenes.build({ Leech: Leech, Frame: Frame, E8: E8, data: data });
const sceneFrame = id => {
  const scene = scenes.find(item => item.id === id);
  return Frame.octadFrame(scene.rows[0], scene.rows[1], positions);
};
// Align each preset to the one before, as the explorer does, but return to the
// starting Petrie frame exactly so the loop has no jump.
function aligned(from, to) { return Frame.complete(Frame.alignPlane(from.slice(0, 2), to.slice(0, 2)), to.slice(2)); }
const petrie = sceneFrame('petrie'), squares = aligned(petrie, sceneFrame('squares'));
const octagonal = aligned(squares, sceneFrame('octagonal'));

const keyframes = [], times = [];
function add(time, frame) { times.push(time); keyframes.push(frame); }
function change(start, end, from, to) {
  for (let step = 1; step <= 6; step++) add(start + (end - start) * step / 6, Frame.interpolate(from, to, step / 6));
}
add(0, petrie); add(0.10, petrie);
change(0.10, 0.30, petrie, squares); add(0.38, squares);
change(0.38, 0.58, squares, octagonal); add(0.66, octagonal);
change(0.66, 0.92, octagonal, petrie); add(1, petrie);

const grouping = Leech.octadSpots(data.coords, data.shape, positions);
const byShell = [0, 1, 2, 3].map(shell => grouping.spots.filter(spot => spot.shell === shell));
const key = (coords, factor) => Array.from(coords, value => value * factor).join(',');
const outerKeys = new Set(byShell[3].map(spot => key(spot.coords, 1)));
if (byShell[3].length !== 240 || byShell[1].length !== 240 || byShell[2].length !== 2160) throw new Error('unexpected octad spots');
if (!byShell[1].every(spot => outerKeys.has(key(spot.coords, 2)))) throw new Error('the inner spots are not the outer spots at half size');

function project(frame, spot) {
  let x = 0, y = 0;
  for (let k = 0; k < 8; k++) { x += frame[0][positions[k]] * spot.coords[k] / SQRT8; y += frame[1][positions[k]] * spot.coords[k] / SQRT8; }
  return [x, y];
}
const scale = RADIUS / Math.max(...keyframes.flatMap(frame => byShell[3].map(spot => Math.hypot(...project(frame, spot)))));
const n = value => value.toFixed(1).replace(/\.0$/, '');
function dots(frame, spots) {
  return spots.map(spot => { const p = project(frame, spot); return 'M' + n(60 + p[0] * scale) + ' ' + n(60 - p[1] * scale) + 'h0'; }).join('');
}

const keyTimes = times.map(time => time.toFixed(3)).join(';');
const outerValues = keyframes.map(frame => dots(frame, byShell[3]));
// Each middle layer shows while its preset holds, fading over the first and last 30% of a change.
function opacity(times) { return `<animate attributeName="opacity" dur="${DURATION}s" repeatCount="indefinite" calcMode="linear" keyTimes="${times.map(t => t[0].toFixed(3)).join(';')}" values="${times.map(t => t[1]).join(';')}"/>`; }
const middle = [
  [petrie, [[0, 1], [0.10, 1], [0.16, 0], [0.86, 0], [0.92, 1], [1, 1]]],
  [squares, [[0, 0], [0.24, 0], [0.30, 1], [0.38, 1], [0.44, 0], [1, 0]]],
  [octagonal, [[0, 0], [0.52, 0], [0.58, 1], [0.66, 1], [0.74, 0], [1, 0]]]
].map(([frame, fade]) => `<path d="${dots(frame, byShell[2])}">${opacity(fade)}</path>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="120" height="120" viewBox="0 0 120 120">
<defs><radialGradient id="b"><stop stop-color="#1c2029"/><stop offset=".68" stop-color="#101217"/><stop offset="1" stop-color="#06070a"/></radialGradient><clipPath id="c"><circle cx="60" cy="60" r="59"/></clipPath>
<path id="o" d="${outerValues[0]}"><animate attributeName="d" dur="${DURATION}s" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" values="${outerValues.join(';')}"/></path></defs>
<g clip-path="url(#c)" fill="none" stroke-linecap="round"><rect width="120" height="120" fill="url(#b)"/>
<g stroke="#64a9f3" stroke-width="1.15" opacity=".8">${middle}</g>
<use xlink:href="#o" href="#o" transform="translate(60 60) scale(.5) translate(-60 -60)" stroke="#a78bfa" stroke-width="3.6"/>
<use xlink:href="#o" href="#o" stroke="#f2cf55" stroke-width="2.3"/>
<path d="M60 60h0" stroke="#8995a7" stroke-width="2.6"/></g>
<circle cx="60" cy="60" r="59" fill="none" stroke="#343945"/>
</svg>`;

if (outerValues[0] !== outerValues[outerValues.length - 1]) throw new Error('first and last keyframes differ');
const bytes = Buffer.byteLength(svg);
if (bytes > MAX_BYTES) throw new Error('thumbnail is ' + bytes + ' bytes, over the 300 KB budget');
const output = path.join(__dirname, '../../assets/thumbs/leech.svg');
fs.writeFileSync(output, svg);
console.log(output + ' ' + bytes + ' bytes');
