/* Draws assets/thumbs/puzzle.jpg: a still of a Hat patch built in the
   Tiling Puzzle by three presses of Fill a ring, coloured by ring in
   light-mode Pastel. The page draws it, so the picture is the puzzle's own.

   Run from anywhere: node tools/thumbnails/puzzle.js

   Unlike the other thumbnail scripts it needs a browser: the Playwright
   install in tools/tiling-video, as frames.js does. It takes its browser
   from CHROMIUM, and falls back to an installed Google Chrome. It serves
   the repo itself, so it needs no server. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'tiling-video', 'node_modules', 'playwright-core'));

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'assets/thumbs/puzzle.jpg');
const SIZE = 240;             // twice the page's 120 px, for sharp screens
const RINGS = 3;
const VIEW = 600;             // the board's window, in CSS pixels
const CROP = 380;             // the centre square kept, in CSS pixels

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
  let browser;
  try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }); }
  catch (e) { browser = await chromium.launch({ channel: 'chrome' }); }
  try {
    const page = await browser.newPage({ viewport: { width: VIEW, height: VIEW }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:' + server.address().port + '/app/tiling-puzzle/#p=hat');
    await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
    for (let ring = 0; ring < RINGS; ring++) {
      await page.click('#fill-ring');
      await page.waitForFunction(() => !/Filling/.test(document.body.innerText), null, { timeout: 60000 });
    }
    await page.click('#home');
    await page.addStyleTag({ content: '.card, .bar { display: none !important; }' });
    await page.waitForTimeout(1000);
    const at = (VIEW - CROP) / 2;
    const shot = await page.screenshot({ clip: { x: at, y: at, width: CROP, height: CROP } });
    // Scale down in a canvas, which smooths better than a small window would.
    const small = await browser.newPage();
    const url = await small.evaluate(async ({ src, size }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, size, size);
      return c.toDataURL('image/jpeg', 0.9);
    }, { src: 'data:image/png;base64,' + shot.toString('base64'), size: SIZE });
    fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
    console.log(path.relative(ROOT, OUT), Math.round(fs.statSync(OUT).size / 1024) + ' KB');
  } finally {
    await browser.close();
    server.close();
  }
})();
