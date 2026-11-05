/* Draws social/roll-shapes.jpg, the 1200 x 630 share card for app/roll-shapes/, in
   the style of the site's other explorer cards: words on the left and the picture
   on the right. The picture is the builder page thumbnail's curve, drawn by the
   app's own engine: a circle of size 49 rolling inside a 5-petal flower of size
   120, closing after 49 laps. The rainbow runs round five times along the path, so
   the colours keep the 5-fold symmetry.

   Run from anywhere: node tools/roll-shapes/card.js [out.jpg]
   It saves a JPEG at the best quality under 300 KB, since WhatsApp shows no picture
   for anything larger. It needs the Playwright install in tools/tiling-video/.
   CHROMIUM names a browser binary to use instead of its own. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'social', 'roll-shapes.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.js': 'text/javascript' };
const TAGLINE = 'Roll any shape inside or around any other. Pens draw the curve, and corners tumble.';

const CARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #14151a; }
  canvas { position: fixed; left: 0; top: 0; width: 1200px; height: 630px; }
  .copy { position: fixed; left: 72px; top: 150px; width: 470px; color: #f2f0ea; font-family: Georgia, "Times New Roman", serif; }
  .eyebrow { margin-bottom: 17px; color: #7aa6e0; font: 750 15px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 69px; font-weight: 400; line-height: .98; letter-spacing: -.025em; }
  p { margin: 24px 0 0; max-width: 430px; color: #b9b6ad; font-size: 25px; line-height: 1.36; }
  .site { margin-top: 30px; color: #7aa6e0; font-size: 21px; }
</style></head><body>
<canvas id="card" width="2400" height="1260"></canvas>
<div class="copy"><div class="eyebrow">Spirograph explorer</div><h1>Rolling<br>Shapes</h1>
<p>${TAGLINE}</p><div class="site">drbuild.uk/roll-shapes</div></div>
<script type="module">
  import { buildShape, bounds } from '/app/roll-shapes/shapes.js';
  import { formulaPoses } from '/app/roll-shapes/rolling.js';
  const outer = buildShape('flower', { petals: 5, depth: 0.06 }, 120), inner = buildShape('circle', {}, 49);
  const { poses, count } = formulaPoses(outer, inner, 49, { maxPoses: 49 * 1500 });
  const ctx = document.getElementById('card').getContext('2d');
  /* Scale 2. The picture sits right of the words. One petal points straight down,
     so that the star in the middle points up. */
  const k = 580 / bounds(outer).far, cx = 1740, cy = 630;
  const X = (x, y) => cx + k * y, Y = (x, y) => cy + k * x;
  const penX = inner.x[0], penY = inner.y[0], parts = 300;
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  for (let s = 0; s < parts; s++) {
    ctx.strokeStyle = 'hsl(' + (s / parts * 5 % 1) * 360 + ' 90% 62%)';
    ctx.beginPath();
    const a = Math.floor(s / parts * (count - 1)), b = Math.floor((s + 1) / parts * (count - 1));
    for (let i = a; i <= b; i++) {
      const p = i * 4, x = poses[p] * penX - poses[p + 1] * penY + poses[p + 2], y = poses[p + 1] * penX + poses[p] * penY + poses[p + 3];
      if (i === a) ctx.moveTo(X(x, y), Y(x, y)); else ctx.lineTo(X(x, y), Y(x, y));
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(235,232,222,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let v = 0; v < outer.n; v++) ctx.lineTo(X(outer.x[v], outer.y[v]), Y(outer.x[v], outer.y[v]));
  ctx.closePath();
  ctx.stroke();
  document.body.dataset.ready = '1';
</script>
</body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = req.url.split(/[?#]/)[0];
    if (url === '/__card.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(CARD); return; }
    fs.readFile(path.join(ROOT, decodeURIComponent(url)), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(url)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:' + server.address().port + '/__card.html');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    let quality = 92, shot;
    do { shot = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; } while (shot.length > MAX_BYTES && quality >= 48);
    fs.writeFileSync(OUT, shot);
    console.log(path.relative(process.cwd(), OUT), Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 4));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
