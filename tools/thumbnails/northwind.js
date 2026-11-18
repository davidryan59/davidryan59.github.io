/* Draw the light and dark static square Northwind dashboard thumbnails.
   Run from anywhere: node tools/thumbnails/northwind.js */
const fs = require('fs'), path = require('path');
const out = path.join(__dirname, '../../assets/thumbs/northwind.svg');
const bars = [18, 29, 24, 42, 35, 54, 48, 66];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
<title>Northwind dashboard with sales chart and order records</title>
<rect width="240" height="240" rx="18" fill="#e8f0fb"/>
<rect x="16" y="18" width="208" height="204" rx="10" fill="#fff" stroke="#d2dce9"/>
<path d="M26 18h188a10 10 0 0 1 10 10v28H16V28a10 10 0 0 1 10-10" fill="#1552a1"/>
<text x="29" y="43" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="700">Northwind</text>
<rect x="28" y="69" width="83" height="31" rx="5" fill="#e8f0fb"/>
<rect x="122" y="69" width="90" height="31" rx="5" fill="#edf6f0"/>
<text x="37" y="90" fill="#1552a1" font-family="system-ui,sans-serif" font-size="16" font-weight="700">830</text>
<text x="132" y="89" fill="#17703f" font-family="system-ui,sans-serif" font-size="11" font-weight="600">ORDERS</text>
<path d="M29 179H211" stroke="#d2dce9"/>
${bars.map((h, i) => `<rect x="${32 + i * 23}" y="${175 - h}" width="14" height="${h}" rx="2" fill="${i === 7 ? '#17703f' : '#1552a1'}"/>`).join('\n')}
<g stroke="#d2dce9" stroke-width="3" stroke-linecap="round">
<path d="M31 192h93m18 0h26m16 0h24M31 205h73m38 0h26m16 0h24"/>
</g>
</svg>\n`;
const darkColours = {
  '#e8f0fb': '#1d2a3d', '#fff': '#1a1c22', '#d2dce9': '#363d49',
  '#1552a1': '#7aa6e0', '#edf6f0': '#1c3429', '#17703f': '#63cf97'
};
const dark = svg.replace(/#[0-9a-f]+/g, colour => darkColours[colour] || colour);
for (const [file, content] of [[out, svg], [out.replace('.svg', '-dark.svg'), dark]]) {
  fs.writeFileSync(file, content);
  console.log(`${file} (${Buffer.byteLength(content)} bytes)`);
}
