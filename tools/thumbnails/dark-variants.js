/* Writes dark-mode versions of the approved builder-page thumbnails. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(ROOT, 'assets', 'thumbs');
const files = ['sieve', 'salary-loan', 'weth9', 'uniswap-v2', 'dai', 'permit2', 'rcn', 'harmony', 'polygonal-spectre', 'undecanope', 'rid'];
const swap = {
  '#fdfbf6':'#1e1e23', '#fffdf8':'#1e1e23', '#f6f3ec':'#1e1e23', '#eef3fb':'#293243', '#e4e0f5':'#36304b', '#e6e2d6':'#36363d',
  '#3d3c63':'#e6e2d8', '#4b4a44':'#e6e2d8', '#8a8578':'#b6b1a7', '#1552a1':'#7aa6e0', '#2f8f5b':'#63c58d', '#e3b341':'#f0c866', '#c0263b':'#ef7a8c', '#a9c4ec':'#567eb6'
};
for (const name of files) {
  let text = fs.readFileSync(path.join(DIR, name + '.svg'), 'utf8');
  for (const [from, to] of Object.entries(swap)) text = text.replaceAll(from, to);
  fs.writeFileSync(path.join(DIR, name + '-dark.svg'), text);
}
console.log('wrote ' + files.length + ' dark thumbnails');
