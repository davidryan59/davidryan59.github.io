/* Draws social/nonrup.jpg from the real Nopert Polyhedra Explorer: P11/20
   cuts its hole, then pushes until it jams against the rim.

   Run from the repository root:
     NODE_PATH=tools/tiling-video/node_modules node tools/non-rupert/card.js

   The card stays below 300 KB because some messaging apps reject larger
   previews. CHROMIUM can name a local Chrome or Chromium binary. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'social', 'nonrup.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = http.createServer((request, response) => {
    let file = path.join(ROOT, decodeURIComponent(request.url.split(/[?#]/)[0]));
    if (request.url.split(/[?#]/)[0].endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--force-color-profile=srgb', '--hide-scrollbars']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/nonrup/#stellated', { waitUntil: 'networkidle' });
    await page.click('#cut');
    await page.waitForTimeout(700);
    await page.click('#push');
    await page.waitForTimeout(2600);
    await page.addStyleTag({ content: `
      .topbar, footer, .shapes, .steps, .fit-panel, .scene-copy, .scene-tip, .view-reset { display: none !important; }
      html, body { width: 1200px !important; height: 630px !important; overflow: hidden !important; }
      body { display: block !important; background: #050b14 !important; }
      .stage { position: absolute !important; inset: 0 !important; display: block !important; background: none !important; }
      .play { position: absolute !important; top: 0 !important; bottom: 0 !important; left: 380px !important; width: 820px !important;
        display: block !important; background: radial-gradient(circle at 50% 52%, hsl(38 45% 42% / .2), transparent 55%), #07111e !important; }
      .scene-card { position: absolute !important; inset: 0 !important; }
      .share-shade { position: fixed; inset: 0; z-index: 20; pointer-events: none;
        background: linear-gradient(90deg, #050b14 0, rgba(5, 11, 20, .96) 30%, rgba(5, 11, 20, .25) 47%, transparent 60%); }
      .share-copy { position: fixed; left: 70px; top: 112px; z-index: 21; width: 520px; color: #eef5ff;
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy .eyebrow { margin-bottom: 18px; color: #71e1d6; font: 750 15px/1 Inter, ui-sans-serif, system-ui, sans-serif;
        letter-spacing: .14em; text-transform: uppercase; }
      .share-copy h1 { margin: 0; font-size: 72px; font-weight: 400; line-height: 1; letter-spacing: -.02em; }
      .share-copy p { margin: 24px 0 0; max-width: 430px; color: #c9d8e8; font-size: 25px; line-height: 1.36; }
      .share-copy sub { font-size: .62em; line-height: 0; vertical-align: -.14em; }
      .share-copy .site { margin-top: 32px; color: #7aa6e0; font-size: 21px; }
    ` });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<h1>Nopert<br>Polyhedra<br>Explorer</h1>' +
        '<p>P<sub>11/20</sub> is an 8-vertex non-Rupert polyhedron. Its copy jams against the hole.</p>' +
        '<div class="site">drbuild.uk/nopert</div></div>');
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(600);
    let quality = 92, image;
    do { image = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; }
    while (image.length > MAX_BYTES && quality >= 48);
    fs.writeFileSync(OUT, image);
    console.log('social/nonrup.jpg: ' + Math.round(image.length / 1024) + ' KB, quality ' + (quality + 4));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
