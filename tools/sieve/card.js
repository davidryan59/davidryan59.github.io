/* Draws social/sieve.jpg, the 1200 x 630 share card for app/sieve/, in the
   style of the site's other cards: one full-bleed picture, no text. It is the
   page's own board, drawn by app/sieve/board.js in light mode: rows 30 wide,
   with 2, 3, 5, 7, 11, 13, 17 and 19 chosen. Every grey number left in view is
   below 23 x 23, so each one is prime, and they stand in the eight columns
   under 1, 7, 11, 13, 17, 19, 23 and 29.

   Run from anywhere: node tools/sieve/card.js [out.jpg]
   It saves a JPEG at the best quality under 300 KB, since WhatsApp shows no
   picture for anything larger. It needs Playwright and its Chromium, as
   tools/social-cards/render.js does. CHROMIUM names a browser binary to use
   instead. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'social', 'sieve.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const CARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { margin: 0; background: #fffdf8; }
  canvas { display: block; width: 1200px; height: 630px; }
</style></head><body>
<canvas id="card"></canvas>
<script src="/app/sieve/model.js"></script>
<script src="/app/sieve/board.js"></script>
<script>
  var model = new Sieve.Model();
  [2, 3, 5, 7, 11, 13, 17, 19].forEach(function (p) { model.choose(p); });
  var board = new Sieve.Board(document.getElementById('card'), model, {});
  board.resize();
  board.width = 30;
  board.fit();
  board.render();
</script>
</body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = req.url.split(/[?#]/)[0];
    if (url === '/__card.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(CARD); return; }
    const file = path.join(ROOT, decodeURIComponent(url));
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
  let browser;
  try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }); }
  catch (e) { browser = await chromium.launch({ channel: 'chrome' }); }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:' + server.address().port + '/__card.html');
    await page.waitForTimeout(500);
    let quality = 90, shot;
    do { shot = await page.screenshot({ type: 'jpeg', quality, scale: 'css' }); quality -= 5; } while (shot.length > MAX_BYTES && quality >= 50);
    fs.writeFileSync(OUT, shot);
    console.log(path.relative(process.cwd(), OUT), Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
