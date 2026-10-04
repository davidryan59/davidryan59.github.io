/* Draws social/noble.jpg from the real Noble Polyhedra Explorer.

   Run from the repository root:
     NODE_PATH=tools/tiling-video/node_modules node tools/noble/card.js

   The card stays below 300 KB because some messaging apps reject larger
   previews. CHROMIUM can name a local Chrome or Chromium binary. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'social', 'noble.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };

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
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/noble/#I-2', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('loading').hidden);
    await page.click('[data-spin="false"]');
    await page.addStyleTag({ content: `
      .topbar, .catalogue, .details, .display-controls, .face-controls,
      .render-controls, .view-controls, .gesture-hint { display: none !important; }
      html, body { width: 1200px !important; height: 630px !important; overflow: hidden !important; }
      body { background: #16161a !important; }
      .workspace { position: absolute !important; inset: 0 !important; display: block !important; height: 630px !important; }
      .stage { position: absolute !important; inset: 0 !important; width: 1200px !important; height: 630px !important;
        background: radial-gradient(circle at 68% 48%, #292e38 0, #1d2027 42%, #16161a 76%) !important; }
      .stage::before { opacity: .48 !important; mask-image: radial-gradient(circle at 68% 50%, black, transparent 78%) !important; }
      #viewer { left: 400px !important; width: 800px !important; }
      .share-shade { position: fixed; inset: 0; z-index: 20; pointer-events: none;
        background: linear-gradient(90deg, rgba(22,22,26,.98) 0, rgba(22,22,26,.94) 31%, rgba(22,22,26,.3) 50%, transparent 68%); }
      .share-copy { position: fixed; left: 72px; top: 138px; z-index: 21; width: 485px; color: #f5f3ec;
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy .eyebrow { margin-bottom: 17px; color: #7aa6e0; font: 750 15px/1 ui-monospace, "SF Mono", Menlo, monospace;
        letter-spacing: .14em; text-transform: uppercase; }
      .share-copy h1 { margin: 0; font-size: 65px; font-weight: 400; line-height: 1.02; letter-spacing: -.02em; }
      .share-copy p { margin: 22px 0 0; max-width: 450px; color: #c8c4b9; font-size: 25px; line-height: 1.36; }
      .share-copy .site { margin-top: 30px; color: #7aa6e0; font-size: 21px; }
    ` });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<div class="eyebrow">3D explorer</div><h1>Noble<br>Polyhedra</h1>' +
        '<p>Two infinite families and 146 exceptional forms.</p><div class="site">drbuild.uk/noble</div></div>');
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);
    let quality = 92, image;
    do { image = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; }
    while (image.length > MAX_BYTES && quality >= 48);
    fs.writeFileSync(OUT, image);
    console.log('social/noble.jpg: ' + Math.round(image.length / 1024) + ' KB, quality ' + (quality + 4));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
