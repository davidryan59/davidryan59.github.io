/* Draws assets/thumbs/sonic-asteroids.svg: Sonic "The Asteroids" in miniature, with
   the game's own sprites. Sonic hovers on the left and fires rings; a Mario
   head drifts in, takes a hit, bursts and splits into two Luigis, as the
   asteroids do. A Wario and a Luigi drift past, two rings spin, stars
   twinkle, and the checked Green Hill loop turns behind it all. The loop
   runs 6 seconds.

   Run from anywhere: node tools/thumbnails/sonic-asteroids.js

   The sprites are ported from sonic-asteroids.html in
   davidryan59/game-sonic-the-asteroids, drawn at three quarters of the
   game's size. The picture is 240 units across and shows at 120 px. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/sonic-asteroids.svg');

const W = 240, LOOP = 6, Z = 0.75;          // Z: game pixels to picture units
const LOOPING = `dur="${LOOP}s" repeatCount="indefinite"`;
const n = v => (Math.round(v * 100) / 100).toString().replace(/^0\./, '.').replace(/^-0\./, '-.');
const kt = v => n(Math.min(1, Math.max(0, v)));
const deg = r => n(r * 180 / Math.PI);
function mulberry32(seed) {
  return function () {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(5);
const r = (a, b) => a + (b - a) * rand();

/* ------------------------------------------------------------ the sprites */

// Drawn in unit coordinates, as the game draws them, then scaled.
const SKIN = '#ffd3a3', SKIN_D = '#8a4a1e', OUT_ = '#071e5c';
function ellipse(cx, cy, rx, ry, rot, attrs) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${deg(rot)} ${cx} ${cy})"` : ''} ${attrs}/>`;
}
function arcPath(cx, cy, rad, a0, a1) {
  const p = a => [n(cx + rad * Math.cos(a)), n(cy + rad * Math.sin(a))];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0} ${y0}A${rad} ${rad} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

const SONIC = (() => {
  const quills = [[-0.12, -0.22, -1.18, -0.62], [-0.12, -0.02, -1.32, -0.10], [-0.12, 0.20, -1.10, 0.44]]
    .map(([bx, by, tx, ty]) => `M${bx} ${n(by - 0.2)}L${tx} ${ty}L${bx} ${n(by + 0.2)}Z`).join('');
  return `<g stroke-linejoin="round" stroke-linecap="round">` +
    // Boost streaks, flickering.
    `<g stroke="#a0d7ff" stroke-width=".11">${[-1, 0, 1].map((i, k) => `<line x1="-1.15" y1="${n(i * 0.34)}" x2="${n(-2.9 - 0.3 * k)}" y2="${n(i * 0.52)}">` +
      `<animate attributeName="stroke-opacity" values=".5;.9;.4;.85;.5" dur="${n(0.19 + 0.05 * k)}s" repeatCount="indefinite"/></line>`).join('')}</g>` +
    `<path d="${quills}M-.06-.5 .1-.96 .28-.44Z" fill="#1e5fd8" stroke="${OUT_}" stroke-width=".075"/>` +
    `<circle r=".6" fill="url(#sonic-head)" stroke="${OUT_}" stroke-width=".075"/>` +
    ellipse(0.44, 0.16, 0.44, 0.34, -0.08, `fill="${SKIN}" stroke="${SKIN_D}" stroke-width=".05"`) +
    ellipse(0.76, 0.02, 0.15, 0.13, 0, 'fill="#120d1c"') +
    `<path d="${arcPath(0.52, 0.24, 0.22, 0.15, 1.15)}" fill="none" stroke="#120d1c" stroke-width=".045"/>` +
    ellipse(0.20, -0.24, 0.23, 0.30, -0.18, `fill="#fdfdff" stroke="${OUT_}" stroke-width=".045"`) +
    ellipse(0.50, -0.26, 0.21, 0.28, -0.18, `fill="#fdfdff" stroke="${OUT_}" stroke-width=".045"`) +
    ellipse(0.55, -0.24, 0.10, 0.16, 0, 'fill="#1c7a3c"') +
    ellipse(0.58, -0.24, 0.055, 0.115, 0, 'fill="#100c18"') +
    ellipse(0.27, -0.22, 0.055, 0.115, 0, 'fill="#100c18"') +
    `<circle cx="-.2" cy=".46" r=".19" fill="#fdfdff" stroke="${OUT_}" stroke-width=".055"/>` +
    `<rect x="-.34" y="-.17" width=".62" height=".34" rx=".16" transform="translate(-.06 .7) rotate(12.6)" fill="#e52521" stroke="#7d1108" stroke-width=".055"/>` +
    `<g transform="translate(.4 .6) rotate(-9.2)"><rect x="-.34" y="-.18" width=".7" height=".36" rx=".17" fill="#e52521" stroke="#7d1108" stroke-width=".055"/>` +
    `<rect x="-.02" y="-.2" width=".14" height=".4" rx=".05" fill="#fdfdff"/><circle cx=".05" cy="-.16" r=".07" fill="#ffce2e"/></g></g>`;
})();

const BROS = [
  { cap: '#e52521', capDk: '#9d130f', hair: '#4a2410', mark: [[-0.14, 0.13], [-0.14, -0.13], [0, 0.03], [0.14, -0.13], [0.14, 0.13]] },
  { cap: '#3fbf4f', capDk: '#1f7a2c', hair: '#4a2410', mark: [[-0.09, -0.13], [-0.09, 0.13], [0.13, 0.13]] },
  { cap: '#f5c518', capDk: '#a8820a', hair: '#6b4a12', mark: [[-0.17, -0.13], [-0.10, 0.13], [0, -0.02], [0.10, 0.13], [0.17, -0.13]] }
];
function bro(tier) {
  const b = BROS[tier];
  const skin = `fill="${SKIN}" stroke="${SKIN_D}"`;
  return `<g stroke-linejoin="round" stroke-linecap="round">` +
    [-1, 1].map(sx => ellipse(sx * 0.8, 0.08, 0.2, 0.24, 0, `${skin} stroke-width=".055"`)).join('') +
    `<circle r=".85" ${skin} stroke-width=".055"/>` +
    [-1, 1].map(sx => ellipse(sx * 0.68, 0.16, 0.2, 0.32, sx * 0.25, `fill="${b.hair}"`)).join('') +
    `<path d="M-.87-.06A.87 .87 0 0 1 .87-.06Z" fill="${b.cap}"/>` +
    ellipse(0.5, -0.1, 0.62, 0.19, -0.16, `fill="${b.capDk}"`) +
    `<circle cx="-.02" cy="-.48" r=".27" fill="#fdfdff"/>` +
    `<path d="M${b.mark.map(p => n(p[0] - 0.02) + ' ' + n(p[1] - 0.48)).join('L')}" fill="none" stroke="${b.cap}" stroke-width=".075"/>` +
    [-1, 1].map(sx => ellipse(sx * 0.3, -0.02, 0.15, 0.21, 0, `fill="#fdfdff" stroke="${SKIN_D}" stroke-width=".04"`)).join('') +
    [-1, 1].map(sx => ellipse(n(sx * 0.3 + 0.03), 0.01, 0.075, 0.12, 0, 'fill="#1a2f6b"')).join('') +
    `<circle cy=".26" r=".27" ${skin} stroke-width=".05"/>` +
    [-1, 1].map(sx => ellipse(sx * 0.32, 0.5, 0.3, 0.2, sx * 0.3, `fill="${b.hair}"`)).join('') +
    ellipse(0, 0.44, 0.2, 0.13, 0, `fill="${b.hair}"`) + `</g>`;
}
// A gold ring of radius rr, spinning edge-on and back, as the game's rings do.
function ring(rr, spin, glow) {
  return `<g>${glow ? `<circle r="${n(rr * 0.74)}" fill="none" stroke="#ffce2e" stroke-width="${n(rr * 0.6)}" opacity=".55" filter="url(#glow)"/>` : ''}` +
    `<g><animateTransform attributeName="transform" type="scale" values="1 1;.2 1;1 1" dur="${spin}s" repeatCount="indefinite"/>` +
    `<circle r="${n(rr * 0.74)}" fill="none" stroke="#ffce2e" stroke-width="${n(rr * 0.46)}"/>` +
    `<path d="${arcPath(0, 0, n(rr * 0.8), -2.5, -1.2)}" fill="none" stroke="#fff7cd" stroke-opacity=".95" stroke-width="${n(rr * 0.15)}" stroke-linecap="round"/>` +
    `<path d="${arcPath(0, 0, n(rr * 0.62), 0.5, 2.0)}" fill="none" stroke="#a36600" stroke-opacity=".6" stroke-width="${n(rr * 0.1)}" stroke-linecap="round"/></g></g>`;
}

/* ---------------------------------------------------------- the backdrop */

const stars = [];
for (let i = 0; i < 46; i++) {
  const layer = i < 26 ? 0 : i < 40 ? 1 : 2;
  const x = r(4, W - 4), y = r(4, W - 4), rad = [0.7, 1.1, 1.6][layer] * Z * 1.2;
  const c = ['#ffffff', '#cfe2ff', '#ffe9a8', '#a8d8ff'][Math.floor(r(0, 4))];
  const tw = i % 3 === 0 ? `<animate attributeName="opacity" values="1;.25;1" dur="${n(r(1.5, 3))}s" begin="${n(-r(0, 3))}s" repeatCount="indefinite"/>` : '';
  stars.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${c}">${tw}</circle>`);
}
// The Green Hill loop: 24 checks, green and dark green. It turns two checks
// a loop, 30 degrees, so the picture repeats exactly.
const LOOP_C = [124, 128], R1 = 92, R2 = 116;
const checks = [];
for (let i = 0; i < 24; i++) {
  const a0 = i * Math.PI / 12, a1 = (i + 1) * Math.PI / 12, p = (rad, a) => n(rad * Math.cos(a)) + ' ' + n(rad * Math.sin(a));
  checks.push(`<path d="M${p(R2, a0)}A${R2} ${R2} 0 0 1 ${p(R2, a1)}L${p(R1, a1)}A${R1} ${R1} 0 0 0 ${p(R1, a0)}Z" fill="${i % 2 ? '#3fbf4f' : '#0d5f2a'}"/>`);
}

/* ------------------------------------------------------------ the action */

// Sonic hovers on the left, aimed a little upward at the incoming Mario.
const SONIC_AT = [66, 132], SONIC_S = 17 * Z * 1.25, AIM = -0.12;
// Mario drifts in from the right; the first of three quick shots hits him.
const MARIO_R = 46 * Z, MARIO_V = [-50, 6], MARIO_FROM = [292, 96];
const FIRE = [2.5, 2.68, 2.86], SHOT_V = 420;
const muzzle = [SONIC_AT[0] + Math.cos(AIM) * 22 * Z * 1.25, SONIC_AT[1] + Math.sin(AIM) * 22 * Z * 1.25];
const marioAt = t => [MARIO_FROM[0] + MARIO_V[0] * t, MARIO_FROM[1] + MARIO_V[1] * t];
// Where the first shot meets Mario's edge: step along until it does.
let HIT = FIRE[0];
while (HIT < FIRE[0] + 1) {
  const s = (HIT - FIRE[0]) * SHOT_V, p = [muzzle[0] + Math.cos(AIM) * s, muzzle[1] + Math.sin(AIM) * s], m = marioAt(HIT);
  if (Math.hypot(p[0] - m[0], p[1] - m[1]) < MARIO_R + 4) break;
  HIT += 0.002;
}
if (HIT >= FIRE[0] + 1) throw new Error('the first shot misses Mario: change AIM or the timings');
const HIT_AT = marioAt(HIT);

const f = t => kt(t / LOOP);
function drift(from, to, t0, t1, body, spin, tier) {
  return `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;${f(t0)};${f(t0)};${f(t1)};${f(t1)};1" calcMode="discrete" ${LOOPING}/>` +
    `<animateMotion path="M${n(from[0])} ${n(from[1])}L${n(to[0])} ${n(to[1])}" keyPoints="0;0;1;1" keyTimes="0;${f(t0)};${f(t1)};1" calcMode="linear" ${LOOPING}/>` +
    `<g><animateTransform attributeName="transform" type="rotate" values="0;${n(spin * LOOP)}" ${LOOPING}/>${body}</g></g>`;
}

const scene = [];
// A Wario across the top and a Luigi along the bottom, each crossing once a loop.
scene.push(`<g><animateMotion path="M-20 34L262 52" ${LOOPING}/><g><animateTransform attributeName="transform" type="rotate" values="0;-360" ${LOOPING}/>` +
  `<g transform="scale(${n(17 * Z)})">${bro(2)}</g></g></g>`);
scene.push(`<g><animateMotion path="M268 214L-28 196" ${LOOPING}/><g><animateTransform attributeName="transform" type="rotate" values="0;360" ${LOOPING}/>` +
  `<g transform="scale(${n(28 * Z)})">${bro(1)}</g></g></g>`);
// Two rings to collect, bobbing.
[[196, 170, 1.1], [36, 64, 1.3]].forEach(([x, y, spin]) => {
  scene.push(`<g transform="translate(${x} ${y})"><g><animateTransform attributeName="transform" type="translate" values="0 -2.5;0 2.5;0 -2.5" keyTimes="0;.5;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" dur="2s" repeatCount="indefinite"/>${ring(12 * Z * 1.2, spin, true)}</g></g>`);
});
// Mario, until the hit.
scene.push(drift(MARIO_FROM, HIT_AT, 0, HIT, `<g transform="scale(${n(MARIO_R)})">${bro(0)}</g>`, 0.7, 0));
// Two Luigis fly apart from the hit, and are out of the picture before the loop ends.
[[[-18, -44], 1.2], [[36, 40], -1.0]].forEach(([v, spin]) => {
  const t1 = LOOP - 0.05, span = t1 - HIT;
  scene.push(drift(HIT_AT, [HIT_AT[0] + v[0] * span, HIT_AT[1] + v[1] * span], HIT, t1, `<g transform="scale(${n(28 * Z)})">${bro(1)}</g>`, spin, 1));
});
// The shots: rings fired from Sonic's nose. The first stops at Mario; the
// others fly on out of the picture.
FIRE.forEach((t0, i) => {
  const dist = i === 0 ? (HIT - t0) * SHOT_V : 260;
  const to = [muzzle[0] + Math.cos(AIM) * dist, muzzle[1] + Math.sin(AIM) * dist];
  scene.push(drift(muzzle, to, t0, t0 + dist / SHOT_V, ring(7 * Z * 1.2, 0.25, true), 0, -1));
});
// The burst: bits of cap, skin and hair flying out and fading.
const bits = [];
for (let i = 0; i < 16; i++) {
  const a = r(0, 2 * Math.PI), sp = r(50, 140), life = r(0.45, 0.8);
  const c = ['#e52521', '#9d130f', SKIN, '#fdfdff', '#4a2410'][i % 5];
  const to = [HIT_AT[0] + Math.cos(a) * sp * life, HIT_AT[1] + Math.sin(a) * sp * life];
  bits.push(`<circle r="${n(r(1.6, 3.2))}" fill="${c}" opacity="0">` +
    `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;${f(HIT)};${f(HIT + 0.01)};${f(HIT + life)};1" ${LOOPING}/>` +
    `<animateMotion path="M${n(HIT_AT[0])} ${n(HIT_AT[1])}L${n(to[0])} ${n(to[1])}" keyPoints="0;0;1;1" keyTimes="0;${f(HIT)};${f(HIT + life)};1" keySplines="0 0 1 1;.2 .6 .5 1;0 0 1 1" calcMode="spline" ${LOOPING}/></circle>`);
}
scene.push(`<circle cx="${n(HIT_AT[0])}" cy="${n(HIT_AT[1])}" r="${n(MARIO_R)}" fill="#fff4c2" opacity="0">` +
  `<animate attributeName="opacity" values="0;0;.5;0;0" keyTimes="0;${f(HIT)};${f(HIT + 0.01)};${f(HIT + 0.16)};1" ${LOOPING}/>` +
  `<animate attributeName="r" values="${n(MARIO_R * 0.5)};${n(MARIO_R * 0.5)};${n(MARIO_R * 0.6)};${n(MARIO_R * 1.2)};${n(MARIO_R * 1.2)}" keyTimes="0;${f(HIT)};${f(HIT + 0.01)};${f(HIT + 0.16)};1" ${LOOPING}/></circle>`);
scene.push(bits.join(''));
// Sonic, bobbing gently, over everything but the burst.
scene.push(`<g transform="translate(${SONIC_AT[0]} ${SONIC_AT[1]})"><g><animateTransform attributeName="transform" type="translate" values="0 -2;0 2;0 -2" keyTimes="0;.5;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1" dur="1.5s" repeatCount="indefinite"/>` +
  `<g transform="rotate(${deg(AIM)}) scale(${n(SONIC_S)})">${SONIC}</g></g></g>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="120" height="120">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071141"/><stop offset=".55" stop-color="#04081f"/><stop offset="1" stop-color="#080c28"/></linearGradient>
<radialGradient id="sonic-head" cx=".5" cy=".5" r=".6" fx=".35" fy=".27"><stop offset="0" stop-color="#66b0ff"/><stop offset=".55" stop-color="#2b7bef"/><stop offset="1" stop-color="#1746a8"/></radialGradient>
<filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect width="${W}" height="${W}" fill="url(#sky)"/>
<g transform="translate(${LOOP_C[0]} ${LOOP_C[1]})" opacity=".09"><g><animateTransform attributeName="transform" type="rotate" values="0;30" ${LOOPING}/>${checks.join('')}</g></g>
<circle cx="${LOOP_C[0]}" cy="${LOOP_C[1]}" r="${R1 - 4}" fill="none" stroke="#8a5a2b" stroke-width="7" opacity=".06"/>
${stars.join('\n')}
${scene.join('\n')}
<rect x="2" y="2" width="${W - 4}" height="${W - 4}" rx="26" fill="none" stroke="#ffce2e" stroke-width="3"/>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: hit at ${HIT.toFixed(2)} s, (${HIT_AT.map(v => v.toFixed(0)).join(', ')}), ${(svg.length / 1024).toFixed(1)} KB`);
