/* Draws social/smash.jpg, the 1200 x 630 share card for smash/. It opens
   the page at exactly that size, lands two hammer blows on a monitor showing
   the white article, waits for the damage to settle and saves a JPEG at the
   best quality under 300 KB, since WhatsApp shows no picture for anything
   larger. Each blow is random, so every run draws a different card.

   Run from anywhere: node tools/smash/card.js
   It needs Playwright and its Chromium, as tools/social-cards/render.js
   does. CHROMIUM names a browser binary to use instead. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'social', 'smash.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split(/[?#]/)[0]));
    if (req.url.split(/[?#]/)[0].endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 800 }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:' + server.address().port + '/smash/#device=monitor&scene=article');
    await page.addStyleTag({ content: 'body { max-width: none; margin: 0; padding: 0; } header, .controls, .credit, .theme-toggle { display: none !important; } ' +
                                      '.stage { width: 1200px; height: 630px; border: 0; border-radius: 0; }' });
    await page.waitForTimeout(400);
    const stage = page.locator('#stage'), box = await stage.boundingBox();
    for (const [fx, fy, hold] of [[0.36, 0.3, 300], [0.6, 0.52, 450]]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      await page.mouse.down();
      await page.waitForTimeout(hold);
      await page.mouse.up();
      await page.waitForTimeout(3500);
    }
    let quality = 90, shot;
    do { shot = await stage.screenshot({ type: 'jpeg', quality, scale: 'css' }); quality -= 5; } while (shot.length > MAX_BYTES && quality >= 50);
    fs.writeFileSync(OUT, shot);
    console.log('social/smash.jpg', Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
