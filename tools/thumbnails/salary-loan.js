/* Draws assets/thumbs/salary-loan.svg: the guide's one idea in miniature, a
   still. A risk scale for the loan-to-value ratio, running from green on the
   left, where low is safe, to red on the right, where it is not. A marker
   sits at 25%, and a dashed red line at 80% shows where liquidation starts.
   The same picture is the diagram on the guide's social card in
   tools/social-cards/cards.html, with the words cut down to what reads at 120 px.

   Run from anywhere: node tools/thumbnails/salary-loan.js */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets/thumbs/salary-loan.svg');

const INK = '#3d3c63', GREEN = '#2f8f5b', AMBER = '#e3b341', RED = '#c0263b', BG = '#fdfbf6';
const X = 10, W = 100, Y = 64, H = 20;
const at = pct => X + W * pct / 100;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" font-family="Georgia, serif">
<defs><clipPath id="bar"><rect x="${X}" y="${Y}" width="${W}" height="${H}" rx="6"/></clipPath></defs>
<rect width="120" height="120" fill="${BG}"/>
<g clip-path="url(#bar)">
<rect x="${at(0)}" y="${Y}" width="${at(50) - at(0)}" height="${H}" fill="${GREEN}"/>
<rect x="${at(50)}" y="${Y}" width="${at(80) - at(50)}" height="${H}" fill="${AMBER}"/>
<rect x="${at(80)}" y="${Y}" width="${at(100) - at(80)}" height="${H}" fill="${RED}"/>
</g>
<path d="M ${at(80)} ${Y - 10} V ${Y + H + 10}" stroke="${RED}" stroke-width="2" stroke-dasharray="4 3"/>
<path d="M ${at(25) - 7} ${Y - 16} H ${at(25) + 7} L ${at(25)} ${Y - 3} Z" fill="${INK}"/>
<text x="${at(25)}" y="${Y - 24}" text-anchor="middle" font-size="16" fill="${INK}">25%</text>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(OUT, svg.length + ' bytes');
