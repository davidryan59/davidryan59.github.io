/* Draws the share card for a paper's page at /papers/<name>/. A PDF carries
   no share card, so a post links the page, and the page names this card. The
   card shows the title beside the paper's own first page, rendered from
   papers/<name>.pdf, the newest draft. Redraw it after each new draft.

   Run from the repository root:
     NODE_PATH=tools/tiling-video/node_modules node tools/papers/card.js [name ...]

   With no names it draws every paper below. It needs pdftoppm (Poppler).
   Each card stays below 300 KB because some messaging apps reject larger
   previews. CHROMIUM can name a local Chrome or Chromium binary. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const MAX_BYTES = 300 * 1024;
const PAPERS = {
  undecanope: {
    card: 'undecanope-paper.jpg', draft: 1, hue: 38,
    title: 'The<br>Undecanope',
    line: "An 88-vertex convex polyhedron without Rupert's property."
  },
  'polygonal-spectre': {
    card: 'polygonal-spectre-paper.jpg', draft: 2, hue: 215,
    title: 'Polygonal<br>Spectres',
    line: 'A two-parameter family of 27-sided strictly chiral aperiodic monotiles.'
  }
};

function html(name, paper, page1) {
  return `<!doctype html><html><head><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; background: radial-gradient(circle at 78% 40%, hsl(${paper.hue} 45% 42% / .22), transparent 55%), #050b14; }
  .copy { position: absolute; left: 70px; top: 112px; width: 560px; color: #eef5ff; font-family: Georgia, "Times New Roman", serif; }
  .eyebrow { margin-bottom: 18px; color: #71e1d6; font: 750 15px/1 Inter, ui-sans-serif, system-ui, sans-serif;
    letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 72px; font-weight: 400; line-height: 1; letter-spacing: -.02em; }
  p { margin: 24px 0 0; max-width: 470px; color: #c9d8e8; font-size: 25px; line-height: 1.36; }
  .site { margin-top: 32px; color: #7aa6e0; font-size: 21px; }
  .page { position: absolute; left: 690px; top: 56px; width: 470px; transform: rotate(2.5deg);
    box-shadow: 0 24px 60px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .4); }
  .page img { display: block; width: 100%; }
</style></head><body>
  <div class="copy">
    <div class="eyebrow">Pre-print · Draft ${paper.draft}</div>
    <h1>${paper.title}</h1>
    <p>${paper.line}</p>
    <div class="site">drbuild.uk/papers/${name}</div>
  </div>
  <div class="page"><img src="${page1}" alt=""></div>
</body></html>`;
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAPERS);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-card-'));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--force-color-profile=srgb', '--hide-scrollbars']
  });
  try {
    for (const name of names) {
      const paper = PAPERS[name];
      if (!paper) throw new Error('no paper called ' + name);
      execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-r', '120', '-png', '-singlefile',
        path.join(ROOT, 'papers', name + '.pdf'), path.join(tmp, name)]);
      const page1 = 'data:image/png;base64,' + fs.readFileSync(path.join(tmp, name + '.png')).toString('base64');
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
      await page.setContent(html(name, paper, page1), { waitUntil: 'load' });
      let quality = 92, image;
      do { image = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; }
      while (image.length > MAX_BYTES && quality >= 48);
      fs.writeFileSync(path.join(ROOT, 'social', paper.card), image);
      console.log('social/' + paper.card + ': ' + Math.round(image.length / 1024) + ' KB, quality ' + (quality + 4));
      await page.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
