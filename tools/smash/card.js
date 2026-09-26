/* Draws social/smash.jpg, the 1200 x 630 share card for app/smash/, in the
   style of the site's other cards: one full-bleed picture, no text. It is a
   close-up of a broken monitor, as in the photo that inspired the page: the
   white article about glass fills the frame, two full-strength blows have
   broken it, and the hammer is raised over the second.

   Run from anywhere: node tools/smash/card.js [seed1 seed2] [out.jpg]
   The two seeds pick the blows; the defaults draw the card as published. It
   saves a JPEG at the best quality under 300 KB, since WhatsApp shows no
   picture for anything larger. It needs Playwright and its Chromium, as
   tools/social-cards/render.js does. CHROMIUM names a browser binary to use
   instead. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const SEEDS = args.length >= 2 ? [+args[0], +args[1]] : [5, 30];
const OUT = args[2] ? path.resolve(args[2]) : path.join(ROOT, 'social', 'smash.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// The blows, as fractions of the screen, and the hammer over the second.
const HITS = [[0.33, 0.34, SEEDS[0]], [0.64, 0.6, SEEDS[1]]];
const hammer = fs.readFileSync(path.join(ROOT, 'app/smash/index.html'), 'utf8').match(/<svg id="hammer"[\s\S]*?<\/svg>/)[0];

const CARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { margin: 0; background: #000; }
  canvas { display: block; width: 1200px; height: 630px; }
  #hammer { position: absolute; left: 0; top: 0; width: 130px; height: 150px; transform-origin: 110px 140px;
            filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.5)); }
</style></head><body>
<canvas id="card" width="2400" height="1260"></canvas>
${hammer}
<script src="/app/smash/scenes.js"></script>
<script src="/app/smash/damage.js"></script>
<script>
  var W = 1778, H = 1000, k = 1200 / W, oy = (630 - H * k) / 2, HITS = ${JSON.stringify(HITS)};
  var ctx = document.getElementById('card').getContext('2d');
  ctx.setTransform(2 * k, 0, 0, 2 * k, 0, 2 * oy);
  var scene = Smash.scenes.filter(function (s) { return s.id === 'article'; })[0];
  Smash.drawPicture(ctx, W, H, { scene: scene, seed: 1, device: 'monitor', time: new Date(2026, 8, 26, 10, 42) });
  // Pixel-sized details are drawn about three times their size on the page,
  // so the lines still show when the card is shown small.
  var hits = HITS.map(function (h, i) {
    return Smash.Damage.make({ x: h[0] * W, y: h[1] * H, W: W, H: H, seed: h[2], t0: 0, device: 'monitor',
                               px: 0.3, strength: 1, first: i === 0 });
  });
  var env = { k: k, dpr: 2, zoom: 1, still: true };
  Smash.Damage.drawLCD(ctx, hits, 30, env);
  Smash.Damage.drawGlass(ctx, hits, 30, env);
  // The page's hammer, half as large again, lifted for another blow.
  var el = document.getElementById('hammer'), b = 1.5, last = HITS[HITS.length - 1];
  var x = last[0] * W * k + 14, y = last[1] * H * k + oy - 10;
  el.style.transform = 'translate(' + (x - 110 - b * (15.5 - 110)) + 'px,' + (y - 140 - b * (58.3 - 140)) + 'px) rotate(22deg) scale(' + b + ')';
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:' + server.address().port + '/__card.html');
    await page.waitForTimeout(500);
    let quality = 90, shot;
    do { shot = await page.screenshot({ type: 'jpeg', quality, scale: 'css' }); quality -= 5; } while (shot.length > MAX_BYTES && quality >= 50);
    fs.writeFileSync(OUT, shot);
    console.log(path.relative(process.cwd(), OUT), 'seeds ' + SEEDS.join(' '), Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
