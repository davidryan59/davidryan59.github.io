// Builds contact-sheet.png: rendered overlay frames over a busy screenshot
// of the real Hat page, and over pure white and pure black, at about the
// size a phone shows them. Needs the frames already rendered, and the site
// served on port 8765 the first time (for test-bg.png):
//   python3 -m http.server 8765    (from the repo root)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const CHROME = process.env.CHROMIUM || undefined;   // a Chromium binary, if Playwright's own is missing
const BG = path.join(__dirname, 'test-bg.png');
const TILE = 370, GAP = 14;

// [beat, background]. Beats 21.3 and 27.3 rather than 21 and 27, since a
// label change dissolves over 0.15 s centred on its beat.
const SHEET = [
  [1, 'busy'], [5, 'busy'], [12, 'busy'], [21.3, 'busy'],
  [24.5, 'busy'], [27.3, 'busy'], [33, 'busy'], [39, 'busy'],
  [42, 'busy'], [48, 'busy'], [55, 'busy'], [59, 'busy'],
  [5, 'white'], [27.3, 'white'], [12, 'black'], [48, 'black']
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  if (!fs.existsSync(BG)) {
    await page.goto('http://127.0.0.1:8765/demos/hat/#v=0,0,40,0,0,0&c=rainbow&t=30');
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      const s = document.createElement('style');
      s.textContent = '.card{display:none!important}';
      document.head.appendChild(s);
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: BG });
  }

  const cols = 4, rows = Math.ceil(SHEET.length / cols);
  const tiles = SHEET.map(([b, bg]) => {
    const n = Math.round(b * 22.5);
    const frame = 'frames/' + String(n).padStart(4, '0') + '.png';
    const back = bg === 'busy' ? 'background:url(test-bg.png) center/cover' : 'background:' + bg;
    return '<figure><div style="' + back + '"><img src="' + frame + '"></div>' +
      '<figcaption>b ' + b + ' · frame ' + n + ' · ' + bg + '</figcaption></figure>';
  }).join('');
  const html = '<!doctype html><style>body{margin:0;background:#555;font:15px Georgia;color:#eee;' +
    'display:grid;grid-template-columns:repeat(' + cols + ',' + TILE + 'px);gap:' + GAP + 'px;padding:' + GAP + 'px;width:max-content}' +
    'figure{margin:0}div{width:' + TILE + 'px;height:' + TILE + 'px}img{width:100%;height:100%;display:block}' +
    'figcaption{padding-top:4px}</style>' + tiles;
  const file = path.join(__dirname, 'contact.html');
  fs.writeFileSync(file, html);
  await page.setViewportSize({ width: cols * (TILE + GAP) + GAP, height: rows * (TILE + 26 + GAP) + GAP });
  await page.goto('file://' + file);
  await page.waitForLoadState('load');
  await page.screenshot({ path: path.join(__dirname, 'contact-sheet.png'), fullPage: true });
  fs.unlinkSync(file);
  await browser.close();
  console.log('Wrote contact-sheet.png');
})();
