/* Draws social/e8.jpg from the real E8 explorer.

   Run from the repository root:
     CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tools/e8/card.js

   The card stays below 300 KB because some messaging apps reject larger
   previews. CHROMIUM can name a local Chrome or Chromium binary. */
'use strict';

const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'social', 'e8.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(request.url.split(/[?#]/)[0]);
    let file = path.join(ROOT, requestPath);
    if (requestPath.endsWith('/')) file = path.join(file, 'index.html');
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
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/e8/#v=coxeter&s=coxeter&pause=1', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__e8Explorer);
    await page.addStyleTag({ content: `
      .topbar, .control-panel, .details, .display-controls, .view-controls,
      .gesture-hint, .stage-status, .hover-card { display: none !important; }
      html, body { width: 1200px !important; height: 630px !important; overflow: hidden !important; }
      body { background: #16161a !important; }
      .workspace { position: absolute !important; inset: 0 !important; display: block !important; height: 630px !important; }
      .stage { position: absolute !important; inset: 0 !important; width: 1200px !important; height: 630px !important;
        background: radial-gradient(circle at 70% 48%, #292e38 0, #1d2027 42%, #16161a 78%) !important; }
      .stage::before { opacity: .45 !important; mask-image: radial-gradient(circle at 70% 50%, black, transparent 76%) !important; }
      #viewer { inset: 0 auto 0 350px !important; width: 850px !important; height: 630px !important; }
      .share-shade { position: fixed; inset: 0; z-index: 20; pointer-events: none;
        background: linear-gradient(90deg, rgba(22,22,26,.99) 0, rgba(22,22,26,.95) 32%, rgba(22,22,26,.45) 48%, transparent 70%); }
      .share-copy { position: fixed; left: 72px; top: 116px; z-index: 21; width: 510px; color: #f5f3ec;
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy .eyebrow { margin-bottom: 17px; color: #7aa6e0; font: 750 15px/1 ui-monospace, "SF Mono", Menlo, monospace;
        letter-spacing: .14em; text-transform: uppercase; }
      .share-copy h1 { margin: 0; font-size: 69px; font-weight: 400; line-height: .98; letter-spacing: -.025em; }
      .share-copy p { margin: 24px 0 0; max-width: 470px; color: #c8c4b9; font-size: 25px; line-height: 1.36; }
      .share-copy .site { margin-top: 30px; color: #7aa6e0; font-size: 21px; }
    ` });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<div class="eyebrow">8D explorer</div><h1>E<sub>8</sub> root<br>system</h1>' +
        '<p>Rotate, pull and inspect all 240 roots through eight dimensions.</p><div class="site">drbuild.uk/e8</div></div>');
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(400);
    let quality = 92, image;
    do { image = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; }
    while (image.length > MAX_BYTES && quality >= 48);
    fs.writeFileSync(OUT, image);
    console.log('social/e8.jpg: ' + Math.round(image.length / 1024) + ' KB, quality ' + (quality + 4));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
