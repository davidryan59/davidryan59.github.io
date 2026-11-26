/* Draw the light and dark square Northwind dashboard thumbnails, animated
   with SMIL on an 8 s loop. The sales bars grow in, then a new order arrives:
   a green row slides into the order list, the count ticks from 829 to 830, the
   ORDERS badge flashes and the latest bar rises. Everything below the header
   fades out at the end, so the loop restarts cleanly.
   Run from anywhere: node tools/thumbnails/northwind.js */
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '../../assets/thumbs/northwind.svg');
const LOOP = 8;
const EASE = '0.4 0 0.2 1';

/* One SMIL animation from [seconds, value] stops. The first stop must be at
   0 s and the last at LOOP s. */
function anim(attr, stops, extra = '') {
  const keyTimes = stops.map(([t]) => +(t / LOOP).toFixed(4)).join(';');
  const values = stops.map(([, v]) => v).join(';');
  const splines = stops.slice(1).map(() => EASE).join(';');
  return `<animate attributeName="${attr}" dur="${LOOP}s" repeatCount="indefinite" calcMode="spline" keyTimes="${keyTimes}" values="${values}" keySplines="${splines}"${extra}/>`;
}
function animMove(stops) {
  const keyTimes = stops.map(([t]) => +(t / LOOP).toFixed(4)).join(';');
  const values = stops.map(([, v]) => `0 ${v}`).join(';');
  const splines = stops.slice(1).map(() => EASE).join(';');
  return `<animateTransform attributeName="transform" type="translate" dur="${LOOP}s" repeatCount="indefinite" calcMode="spline" keyTimes="${keyTimes}" values="${values}" keySplines="${splines}"/>`;
}

const ORDER = 3; // seconds: the new order arrives
const OUT = 7.2; // seconds: the lower panel starts to fade
const fadeInOut = [[0, 0], [0.4, 1], [OUT, 1], [OUT + 0.4, 0], [LOOP, 0]];

const bars = [18, 29, 24, 42, 35, 54, 48, 66];
const base = 175;
const barSvg = bars.map((h, i) => {
  const last = i === bars.length - 1;
  const start = 0.2 + i * 0.2, end = start + 0.6;
  const first = last ? 50 : h;
  const heights = [[0, 0], [start, 0], [end, first]];
  if (last) heights.push([ORDER + 0.2, first], [ORDER + 0.8, h]);
  heights.push([OUT, h], [OUT + 0.5, 0], [LOOP, 0]);
  const ys = heights.map(([t, v]) => [t, base - v]);
  return `<rect x="${32 + i * 23}" y="${base}" width="14" height="0" rx="2" fill="${last ? '#17703f' : '#1552a1'}">
${anim('height', heights)}
${anim('y', ys)}
</rect>`;
}).join('\n');

/* Order rows. Each row is a few line segments, like columns of a table. */
const rowA = 'M31 0h93m18 0h26m16 0h24';
const rowB = 'M31 0h73m38 0h26m16 0h24';
const rowNew = 'M31 0h84m27 0h26m16 0h24';
const shift = [[0, 0], [ORDER, 0], [ORDER + 0.5, 13], [LOOP, 13]];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 240 240">
<title>Northwind dashboard: sales bars grow and a new order arrives</title>
<defs><clipPath id="rows"><rect x="20" y="185" width="200" height="27"/></clipPath></defs>
<rect width="240" height="240" rx="18" fill="#e8f0fb"/>
<rect x="16" y="18" width="208" height="204" rx="10" fill="#fff" stroke="#d2dce9"/>
<path d="M26 18h188a10 10 0 0 1 10 10v28H16V28a10 10 0 0 1 10-10" fill="#1552a1"/>
<text x="29" y="43" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="700">Northwind</text>
<rect x="28" y="69" width="83" height="31" rx="5" fill="#e8f0fb"/>
<rect x="122" y="69" width="90" height="31" rx="5" fill="#edf6f0">
${anim('fill', [[0, '#edf6f0'], [ORDER, '#edf6f0'], [ORDER + 0.3, '#b9e3c9'], [ORDER + 1.2, '#edf6f0'], [LOOP, '#edf6f0']])}
</rect>
<text x="132" y="89" fill="#17703f" font-family="system-ui,sans-serif" font-size="11" font-weight="600">ORDERS</text>
<g font-family="system-ui,sans-serif" font-size="16" font-weight="700" fill="#1552a1">
${anim('opacity', fadeInOut)}
<g transform="translate(51 84)">
<g>
<animateTransform attributeName="transform" type="scale" dur="${LOOP}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;${+((ORDER + 0.25) / LOOP).toFixed(4)};${+((ORDER + 0.45) / LOOP).toFixed(4)};${+((ORDER + 0.9) / LOOP).toFixed(4)};1" values="1;1;1.25;1;1" keySplines="${EASE};${EASE};${EASE};${EASE}"/>
<text x="-14" y="6">829<animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${+((ORDER + 0.25) / LOOP).toFixed(4)}" values="1;0"/></text>
<text x="-14" y="6" opacity="0">830<animate attributeName="opacity" dur="${LOOP}s" repeatCount="indefinite" calcMode="discrete" keyTimes="0;${+((ORDER + 0.25) / LOOP).toFixed(4)}" values="0;1"/></text>
</g>
</g>
</g>
<path d="M29 179H211" stroke="#d2dce9"/>
${barSvg}
<g clip-path="url(#rows)" stroke-width="3" stroke-linecap="round">
${anim('opacity', fadeInOut)}
<g>
${animMove(shift)}
<rect x="24" y="${179 - 6}" width="192" height="12" rx="3" fill="#edf6f0" opacity="0">
${anim('opacity', [[0, 0], [ORDER, 0], [ORDER + 0.3, 1], [ORDER + 2.2, 1], [ORDER + 3.2, 0], [LOOP, 0]])}
</rect>
<path d="${rowNew.replace('M31 0', 'M31 179')}" stroke="#17703f">
${anim('stroke', [[0, '#17703f'], [ORDER + 2.2, '#17703f'], [ORDER + 3.2, '#d2dce9'], [LOOP, '#d2dce9']])}
</path>
<path d="${rowA.replace('M31 0', 'M31 192')}" stroke="#d2dce9"/>
<path d="${rowB.replace('M31 0', 'M31 205')}" stroke="#d2dce9"/>
</g>
</g>
</svg>\n`;
const darkColours = {
  '#e8f0fb': '#1d2a3d', '#fff': '#1a1c22', '#d2dce9': '#363d49',
  '#1552a1': '#7aa6e0', '#edf6f0': '#1c3429', '#17703f': '#63cf97',
  '#b9e3c9': '#2b6b48'
};
const dark = svg.replace(/#[0-9a-f]+\b/g, colour => darkColours[colour] || colour);
for (const [file, content] of [[out, svg], [out.replace('.svg', '-dark.svg'), dark]]) {
  fs.writeFileSync(file, content);
  console.log(`${file} (${Buffer.byteLength(content)} bytes)`);
}
