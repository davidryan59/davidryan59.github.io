/* Draws the four security-audit pictures in assets/thumbs/: weth9.svg,
   uniswap-v2.svg, dai.svg and permit2.svg. Each is the diagram on that
   audit's social card (tools/social-cards/cards.html), redrawn for 120 px
   with the words cut down to what still reads at that size. Stills, light
   colours, the cards' cream ground.

   Run from anywhere: node tools/thumbnails/audits.js */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets/thumbs');

const INK = '#3d3c63', LINE = '#1552a1', SOFT = '#e4e0f5', BAND = '#eef3fb', GREY = '#8a8578', RED = '#c0263b', BG = '#fdfbf6';
const n = v => +v.toFixed(1);
const svg = (body, defs) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" font-family="Georgia, serif">\n` +
  (defs ? `<defs>${defs}</defs>\n` : '') + `<rect width="120" height="120" fill="${BG}"/>\n${body}\n</svg>\n`;
const marker = id => `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill="${LINE}"/></marker>`;
const arrow = (d, id) => `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="2" marker-end="url(#${id})"/>`;

const pictures = {
  // ETH in, WETH out, one for one, and back again.
  weth9: svg(
    `<circle cx="26" cy="60" r="17" fill="${SOFT}" stroke="#5b5a8a" stroke-width="2"/>` +
    `<text x="26" y="64" text-anchor="middle" font-size="11" fill="${INK}">ETH</text>` +
    `<rect x="72" y="42" width="40" height="36" rx="8" fill="${BAND}" stroke="${LINE}" stroke-width="2" stroke-dasharray="5 4"/>` +
    `<circle cx="92" cy="60" r="13" fill="${SOFT}" stroke="#5b5a8a" stroke-width="2"/>` +
    `<text x="92" y="63.5" text-anchor="middle" font-size="8.5" fill="${INK}">WETH</text>` +
    arrow('M 46 52 C 52 43, 59 43, 66 49', 'a') + arrow('M 66 71 C 59 77, 52 77, 46 68', 'a'), marker('a')),

  // The constant product curve, with one trade along it.
  'uniswap-v2': (() => {
    const X0 = 16, Y0 = 100, W = 90, H = 76, k = 0.09;
    const px = x => X0 + x * W, py = y => Y0 - y * H;
    const pts = [];
    for (let x = 0.1; x <= 1.0001; x += 0.02) pts.push(`${n(px(x))} ${n(py(k / x))}`);
    const ax = 0.22, bx = 0.42;
    return svg(
      `<path d="M ${X0} 14 V ${Y0} H 108" fill="none" stroke="${GREY}" stroke-width="1.5"/>` +
      `<path d="M ${pts.join(' L ')}" fill="none" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M ${n(px(ax))} ${n(py(k / ax))} H ${n(px(bx))} V ${n(py(k / bx))}" fill="none" stroke="${RED}" stroke-width="1.8" stroke-dasharray="4 3"/>` +
      `<circle cx="${n(px(ax))}" cy="${n(py(k / ax))}" r="3.8" fill="${RED}"/><circle cx="${n(px(bx))}" cy="${n(py(k / bx))}" r="3.8" fill="${RED}"/>` +
      `<text x="64" y="34" font-size="13" fill="${INK}">x·y=k</text>`);
  })(),

  // A year of the price, held in a narrow band around one dollar.
  dai: (() => {
    const X0 = 14, X1 = 106, Yc = 62, pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, wob = Math.sin(t * 19 + 0.4) * 0.6 + Math.sin(t * 43 + 1.3) * 0.35;
      pts.push(`${n(X0 + t * (X1 - X0))} ${n(Yc - wob * 6)}`);
    }
    return svg(
      `<rect x="${X0}" y="${Yc - 12}" width="${X1 - X0}" height="24" fill="${BAND}"/>` +
      `<path d="M ${X0} ${Yc} H ${X1}" stroke="${GREY}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<path d="M ${pts.join(' L ')}" fill="none" stroke="${LINE}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<text x="${X0}" y="34" font-size="15" fill="${INK}">$1</text>` +
      `<path d="M ${X0} 96 H ${X1}" stroke="${GREY}" stroke-width="1.5"/>`);
  })(),

  // One code-size check sends each signer down one of two paths.
  permit2: (() => {
    const box = (y, share) => `<rect x="64" y="${y}" width="46" height="34" rx="8" fill="${BAND}" stroke="${LINE}" stroke-width="2"/>` +
      `<text x="87" y="${y + 22}" text-anchor="middle" font-size="13" fill="${INK}">${share}</text>`;
    return svg(
      `<circle cx="24" cy="60" r="15" fill="${SOFT}" stroke="#5b5a8a" stroke-width="2"/>` +
      arrow('M 36 52 C 46 36, 52 31, 61 31', 'a') + arrow('M 36 68 C 46 84, 52 89, 61 89', 'a') +
      box(14, '83%') + box(72, '17%'), marker('a'));
  })()
};

for (const [name, text] of Object.entries(pictures)) {
  const file = path.join(OUT, name + '.svg');
  fs.writeFileSync(file, text);
  console.log(file, fs.statSync(file).size + ' bytes');
}
