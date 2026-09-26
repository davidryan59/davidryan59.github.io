/* Draws thumbs/smash.svg: the Smash a screen page in miniature. A monitor
   shows a white web page. The hammer lifts and strikes, cracks run out from
   the blow, black ink spreads and bright lines of stuck pixels flicker on.
   The broken screen holds, then fades back to whole, on an 8 s loop.

   Run from anywhere: node tools/thumbnails/smash.js [seed]

   The damage is the page's own: the script runs smash/damage.js in Node and
   turns one hit into SVG. Each ink blob grows as one shape, where the page
   also grows some directions later than others; the fringe of coloured
   pixels is left out, since at this size it would only be noise. The
   hammer is the page's own too, read from smash/index.html. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'thumbs/smash.svg');
const SEED = +process.argv[2] || 7;

const sandbox = {};
vm.createContext(sandbox);
['smash/scenes.js', 'smash/damage.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));
const Smash = sandbox.Smash;

// The monitor's screen, 1778 x 1000 screen units, fills 100 x 56 px.
const W = 1778, H = 1000, X0 = 10, Y0 = 16, S = 100 / W;
const LOOP = 8, HIT = 1.1;
const hit = Smash.Damage.make({ x: W * 0.6, y: H * 0.56, W, H, seed: SEED, t0: 0, device: 'monitor', px: S * 1.1, strength: 0.9, first: false });

const n = v => (Math.round(v * 100) / 100).toString().replace(/^0\./, '.').replace(/^-0\./, '-.');
const px = p => [X0 + p[0] * S, Y0 + p[1] * S];

// Douglas-Peucker, in picture pixels. A sector starts and ends at the
// point of the blow, so where a span's ends meet, distance is to that point.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length), stack = [[0, pts.length - 1]];
  keep[0] = keep[pts.length - 1] = 1;
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, far = 0;
    const [ax, ay] = pts[a], [bx, by] = pts[b], len = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
                           : Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
      if (d > far) { far = d; best = i; }
    }
    if (far > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
function pathD(pts, close) {
  return 'M' + pts.map(p => n(p[0]) + ' ' + n(p[1])).join('L') + (close ? 'Z' : '');
}

// One animated attribute over the loop, from [seconds, value] pairs. Key
// times keep four decimals: two would merge nearby times, which makes the
// whole animation invalid.
const key = t => (Math.round(t / LOOP * 1e4) / 1e4).toString().replace(/^0\./, '.');
function anim(attr, pairs, mode, splines) {
  const times = pairs.map(p => key(p[0])).join(';'), values = pairs.map(p => p[1]).join(';');
  const calc = mode === 'discrete' ? ' calcMode="discrete"' : splines ? ` calcMode="spline" keySplines="${splines}"` : '';
  return `<animate attributeName="${attr}" values="${values}" keyTimes="${times}"${calc} dur="${LOOP}s" repeatCount="indefinite"/>`;
}
function turn(type, pairs, splines) {
  const times = pairs.map(p => key(p[0])).join(';'), values = pairs.map(p => p[1]).join(';');
  const calc = splines ? ` calcMode="spline" keySplines="${splines}"` : '';
  return `<animateTransform attributeName="transform" type="${type}" values="${values}" keyTimes="${times}"${calc} dur="${LOOP}s" repeatCount="indefinite"/>`;
}
const EASE_OUT = '.2 .8 .3 1', LINEAR = '0 0 1 1';

const defs = [], lcd = [], lines = [], glass = [];

// Sectors clip the ink, so it stops sharp at a crack.
hit.sectors.forEach((sec, i) => {
  defs.push(`<clipPath id="s${i}"><path d="${pathD(simplify(sec.poly.map(px), 0.1), true)}"/></clipPath>`);
});

// Ink blobs, each growing about its own centre.
hit.blobs.forEach(b => {
  const pts = [];
  for (let j = 0; j < b.shape.length; j++) {
    const a = 2 * Math.PI * j / b.shape.length, r = b.R * b.shape[j] * S;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const t0 = HIT + b.delay, t1 = Math.min(6.4, t0 + b.dur * 1.2), c = px([b.cx, b.cy]);
  lcd.push(`<g clip-path="url(#s${b.sector})"><g transform="translate(${n(c[0])} ${n(c[1])})"><g transform="scale(0)">` +
    turn('scale', [[0, 0], [t0, 0], [t1, 1], [LOOP, 1]], [LINEAR, EASE_OUT, LINEAR].join(';')) +
    `<path d="${pathD(simplify(pts, 0.12), true)}" fill="${b.white ? '#eef3ff' : '#07060e'}"/></g></g></g>`);
});

// Lines of stuck pixels, in groups that switch on together. A line clipped
// to the ink on the page waits here until its ink has mostly spread.
const groups = {};
hit.lines.forEach(l => {
  let t = HIT + l.t;
  if (l.clip >= 0) hit.blobs.forEach(b => { if (b.sector === l.clip) t = Math.max(t, HIT + b.delay + b.dur * 0.6); });
  const key = Math.min(6, Math.round(t * 10) / 10).toFixed(1) + (l.clip >= 0 ? ':' + l.clip : ':-');
  (groups[key] = groups[key] || []).push(l);
});
Object.keys(groups).sort().forEach(key => {
  const t = parseFloat(key), si = +key.split(':')[1];
  const rects = groups[key].map(l => l.segs.map(sg => {
    const a = l.horiz ? px([sg[0], l.pos]) : px([l.pos, sg[0]]), len = (sg[1] - sg[0]) * S, th = Math.max(0.7, l.th * S);
    const fill = l.dead ? '#000' : l.color;
    return l.horiz ? `<rect x="${n(a[0])}" y="${n(a[1])}" width="${n(len)}" height="${n(th)}" fill="${fill}"/>`
                   : `<rect x="${n(a[0])}" y="${n(a[1])}" width="${n(th)}" height="${n(len)}" fill="${fill}"/>`;
  }).join('')).join('');
  lines.push(`<g${isNaN(si) ? '' : ` clip-path="url(#s${si})"`} opacity="0">` +
    anim('opacity', [[0, 0], [t, 1], [t + 0.05, 0], [t + 0.09, 1], [LOOP, 1]], 'discrete') + rects + '</g>');
});

// Cracks run out from the blow, as fast as they do on the page.
const shadow = [], core = [], ribbons = [];
let last = HIT;
hit.cracks.forEach(c => {
  const pts = simplify(c.pts.map(px), 0.3);
  if (pts.length < 2) return;
  const t0 = HIT + c.start, t1 = t0 + c.len / c.speed;
  last = Math.max(last, t1);
  const d = pathD(pts), reveal = anim('stroke-dashoffset', [[0, 1], [t0, 1], [t1, 0], [LOOP, 0]]);
  const draw = `pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"`;
  if (c.style === 'ribbon') ribbons.push(`<path d="${d}" ${draw} stroke-width="1.7">${reveal}</path>`);
  shadow.push(`<path d="${d}" ${draw}>${reveal}</path>`);
  core.push(`<path d="${d}" ${draw}>${reveal}</path>`);
});
glass.push(`<g fill="none" stroke="#c3c9d4" stroke-opacity=".8" stroke-linecap="round">${ribbons.join('')}</g>`);
glass.push(`<g fill="none" stroke="#000" stroke-opacity=".5" stroke-width=".9" transform="translate(.25 .25)">${shadow.join('')}</g>`);
glass.push(`<g fill="none" stroke="#f5f8ff" stroke-opacity=".92" stroke-width=".5" stroke-linecap="round">${core.join('')}</g>`);
const P = px(hit.P);
glass.push(`<path d="${pathD(hit.crater.map(px), true)}" fill="#eef2ff" opacity="0">${anim('opacity', [[0, 0], [HIT, 1], [LOOP, 1]], 'discrete')}</path>`);

// The page's hammer, with its striking face on the point of the blow.
const page = fs.readFileSync(path.join(ROOT, 'smash/index.html'), 'utf8');
const hammer = page.match(/<svg id="hammer"[^>]*>([\s\S]*?)<\/svg>/)[1];
const FACE = [15.5, 58.3], PIVOT = [110, 140], HS = 0.4;
const rot = a => `${a} ${PIVOT[0]} ${PIVOT[1]}`;

// The white web page. A second copy fades in over the damage at the end of
// the loop, so the screen looks whole again before the next blow.
const picture = `<rect x="${X0}" y="${Y0}" width="100" height="${n(H * S)}" fill="#fff"/>
<rect x="${X0}" y="${Y0}" width="100" height="2.6" fill="#dee1e6"/>
<rect x="${X0 + 6}" y="${Y0 + 3.3}" width="88" height="1.8" rx=".9" fill="#f1f3f4"/>
<rect x="${X0 + 4}" y="${Y0 + 8}" width="15" height="3.2" fill="#222"/>
<rect x="${X0 + 4}" y="${Y0 + 12.5}" width="72" height=".3" fill="#a2a9b1"/>
${[15, 17.2, 19.4, 23, 25.2, 27.4, 29.6, 35.4, 37.6, 39.8, 44.6, 46.8, 49].map((y, i) =>
  `<rect x="${X0 + 4}" y="${n(Y0 + y)}" width="${i % 3 === 2 ? 40 : 58}" height=".8" fill="#9a9ea6"/>`).join('')}
<rect x="${X0 + 4}" y="${n(Y0 + 32)}" width="16" height="1.8" fill="#333"/>
<rect x="${X0 + 72}" y="${Y0 + 14}" width="22" height="30" fill="#f8f9fa" stroke="#a2a9b1" stroke-width=".3"/>
<path d="M${X0 + 78} ${Y0 + 18}l1.5 11h7l1.5-11z" fill="#9fd0f5"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eeeae2"/><stop offset="1" stop-color="#d6d1c6"/></linearGradient>
<radialGradient id="flash"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<clipPath id="screen"><rect x="${X0}" y="${Y0}" width="100" height="${n(H * S)}"/></clipPath>
${defs.join('\n')}
</defs>
<rect width="120" height="120" fill="url(#bg)"/>
<ellipse cx="60" cy="106" rx="27" ry="3" fill="#000" opacity=".16"/>
<path d="M55.5 76.5h9l-.8 26h-7.4z" fill="#b7bac0"/>
<ellipse cx="60" cy="103" rx="19" ry="2.4" fill="#c9ccd1"/>
<rect x="${X0 - 2.5}" y="${Y0 - 2.5}" width="105" height="${n(H * S + 8)}" rx="2" fill="#26272c"/>
<circle cx="${X0 + 96}" cy="${n(Y0 + H * S + 3)}" r=".6" fill="#3fdc6a"/>
<g clip-path="url(#screen)">
${picture}
${lcd.join('\n')}
<g style="mix-blend-mode:lighten">${lines.join('\n')}</g>
${glass.join('\n')}
<g opacity="0">${anim('opacity', [[0, 0], [6.9, 0], [7.5, 1], [LOOP, 1]])}
${picture}
</g>
<circle cx="${n(P[0])}" cy="${n(P[1])}" r="14" fill="url(#flash)" opacity="0">${anim('opacity', [[0, 0], [HIT, 0], [HIT + 0.02, 1], [HIT + 0.22, 0], [LOOP, 0]])}</circle>
</g>
<g opacity="0">${anim('opacity', [[0, 0], [0.3, 0], [0.6, 1], [1.7, 1], [2.2, 0], [LOOP, 0]])}
<g transform="translate(${n(P[0])} ${n(P[1])}) scale(${HS}) translate(${-FACE[0]} ${-FACE[1]})">
<g>${turn('rotate', [[0, rot(0)], [0.65, rot(0)], [HIT - 0.08, rot(38)], [HIT, rot(0)], [HIT + 0.09, rot(-7)], [HIT + 0.2, rot(0)], [1.7, rot(0)], [2.2, rot(-20)], [LOOP, rot(-20)]],
  [LINEAR, EASE_OUT, '.6 0 1 1', LINEAR, LINEAR, LINEAR, LINEAR, LINEAR].join(';'))}
${hammer.trim()}
</g>
</g>
</g>
</svg>
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${path.relative(ROOT, OUT)}: seed ${SEED}, ${hit.cracks.length} cracks, ${hit.blobs.length} blobs, ${hit.lines.length} lines, ` +
            `last crack at ${last.toFixed(2)} s, ${(svg.length / 1024).toFixed(1)} KB`);
