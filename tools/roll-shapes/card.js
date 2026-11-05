/* Draws social/roll-shapes.jpg, the 1200 x 630 share card for app/roll-shapes/, in
   the style of the site's other explorer cards: words on the left and the picture
   on the right. The picture is drawn by the app's own engine: a circle rolling
   inside a rounded heptagon with one flat edge at the bottom. Its size is 120 * b/a,
   so the curve closes after b laps, and 7 divides a, so it has 7-fold symmetry. The
   pen starts over the bottom edge's midpoint, so the curve is mirror-symmetric too.
   The rainbow runs round seven times along the path, so the colours keep the
   rotation.

   Run from anywhere: node tools/roll-shapes/card.js [out.jpg] [a/b] [pen]
   pen is the pen's distance from the circle's centre, as a share of its radius.
   It saves a JPEG at the best quality under 300 KB, since WhatsApp shows no picture
   for anything larger. It needs the Playwright install in tools/tiling-video/.
   CHROMIUM names a browser binary to use instead of its own. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'social', 'roll-shapes.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.js': 'text/javascript' };
const TAGLINE = 'Draw beautiful patterns by rolling two different shapes around each other. Watch the patterns change as you vary size, pen position, or other parameters.';
const [A, B] = (process.argv[3] || '182/51').split('/').map(Number), PEN = +(process.argv[4] || 1), ROUND = 0.5;

const CARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #14151a; }
  canvas { position: fixed; left: 0; top: 0; width: 1200px; height: 630px; }
  .copy { position: fixed; left: 72px; top: 118px; width: 470px; color: #f2f0ea; font-family: Georgia, "Times New Roman", serif; }
  .eyebrow { margin-bottom: 17px; color: #7aa6e0; font: 750 15px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; font-size: 69px; font-weight: 400; line-height: .98; letter-spacing: -.025em; }
  p { margin: 24px 0 0; max-width: 440px; color: #b9b6ad; font-size: 23px; line-height: 1.36; }
  .site { margin-top: 30px; color: #7aa6e0; font-size: 21px; }
</style></head><body>
<canvas id="card" width="2400" height="1260"></canvas>
<div class="copy"><div class="eyebrow">Spirograph-style explorer</div><h1>Rolling<br>Shapes</h1>
<p>${TAGLINE}</p><div class="site">drbuild.uk/roll-shapes</div></div>
<script type="module">
  import { buildShape, bounds } from '/app/roll-shapes/shapes.js';
  import { formulaPoses } from '/app/roll-shapes/rolling.js';
  const size = 120 * ${B} / ${A};
  const outer = buildShape('polygon', { sides: 7, round: ${ROUND}, bulge: 0 }, 120), inner = buildShape('circle', {}, size);
  const { poses, count } = formulaPoses(outer, inner, ${B}, { maxPoses: ${B} * 1500 });
  const ctx = document.getElementById('card').getContext('2d');
  /* Scale 2. The picture sits right of the words, with its flat edge at the bottom. */
  const b = bounds(outer), k = Math.min(1160 / (b.maxY - b.minY), 1160 / (b.maxX - b.minX));
  const cx = 1740 - k * (b.minX + b.maxX) / 2, cy = 630 + k * (b.minY + b.maxY) / 2;
  const X = x => cx + k * x, Y = y => cy - k * y;
  /* The arc at the bottom edge's midpoint: a rim pen touches the wall there. */
  let mid = 0, low = Infinity;
  for (let i = 0; i < outer.n; i++) {
    const j = (i + 1) % outer.n;
    if (outer.x[i] * outer.x[j] > 0) continue;
    const t = outer.x[i] === outer.x[j] ? 0 : -outer.x[i] / (outer.x[j] - outer.x[i]), y = outer.y[i] + t * (outer.y[j] - outer.y[i]);
    if (y < low) { low = y; mid = outer.cum[i] + t * outer.len[i]; }
  }
  const angle = (mid % size) / size * Math.PI * 2, radius = ${PEN} * size / (Math.PI * 2);
  const penX = radius * Math.cos(angle), penY = radius * Math.sin(angle), parts = 490;
  ctx.lineWidth = 1.9;
  ctx.lineJoin = 'round';
  for (let s = 0; s < parts; s++) {
    ctx.strokeStyle = 'hsl(' + (s / parts * 7 % 1) * 360 + ' 90% 62%)';
    ctx.beginPath();
    const a = Math.floor(s / parts * (count - 1)), e = Math.floor((s + 1) / parts * (count - 1));
    for (let i = a; i <= e; i++) {
      const p = i * 4, x = poses[p] * penX - poses[p + 1] * penY + poses[p + 2], y = poses[p + 1] * penX + poses[p] * penY + poses[p + 3];
      if (i === a) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(235,232,222,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let v = 0; v < outer.n; v++) ctx.lineTo(X(outer.x[v]), Y(outer.y[v]));
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
