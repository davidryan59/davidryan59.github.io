/* Extract Appendix A metadata from the paper's TeX source.
   Usage: node tools/noble/import-paper-catalogue.js /path/to/main.tex */
const fs = require('fs');
const path = require('path');

const source = process.argv[2];
if (!source) throw new Error('Pass the path to the paper main.tex file.');
const text = fs.readFileSync(source, 'utf8');
const appendix = text.split('Appendix A: List of Noble Polyhedra')[1].split('Appendix B: Noble Polyhedron Orbits')[0];
const catalogue = {};

for (const line of appendix.split(/\r?\n/)) {
  const cells = line.split('&').map(cell => cell.trim());
  if (cells.length !== 7 || !/^[A-Za-z]+-\d+(?:\.\d+)?$/.test(cells[0])) continue;
  const clean = value => value.replace(/\$|\{|\}|\\/g, '').trim();
  catalogue[cells[0]] = { paperSymmetry: clean(cells[5]), dual: clean(cells[6]) };
}

if (Object.keys(catalogue).length !== 146) throw new Error(`Expected 146 entries, found ${Object.keys(catalogue).length}`);
const target = path.join(__dirname, 'paper-catalogue.json');
fs.writeFileSync(target, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Wrote ${Object.keys(catalogue).length} paper catalogue entries to ${target}`);
