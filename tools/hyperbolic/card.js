/* Draws the Hyperbolic Models Explorer's share card and its builder-page
   thumbnail from the app itself.

   Run from the repo root, with a local server on port 8765:
     python3 -m http.server 8765 &
     node tools/hyperbolic/card.js          both
     node tools/hyperbolic/card.js card     the share card only
     node tools/hyperbolic/card.js thumb    the thumbnail only

   The card is social/hyperbolic.jpg, 1200 x 630, in the style of
   tools/social-cards/cards.html. The thumbnail is drawn live on the builder
   page by assets/hyperbolic-thumb.js. This script writes only its still
   stand-in, assets/thumbs/hyperbolic.webp: 240 x 240 with a transparent
   background, used where WebGL 2 is missing.

   It needs the Playwright install in tools/tiling-video/, or set CHROMIUM
   to a Chromium binary, and python3 with Pillow to assemble the WebP.
   WebGL runs in SwiftShader, so no graphics card is needed. */
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.BASE || 'http://localhost:8765';
const VIEW = '/app/hyperbolic/#m=poincare&t=7,3&s=tiles&c=many&e=2&sh=70';
const HIDE = '.card { display: none !important; }';
const what = process.argv[2] || 'both';

// The words on the card. Change them here, then run with "card".
const CARD = {
  title: 'Hyperbolic Models Explorer',
  sub: 'The hyperbolic plane can be drawn in multiple ways. Using tessellations to illustrate the geometry, this interactive app allows you to explore and move about the hyperbolic plane for various models: the Poincaré disk, the Klein disk, the half-plane and the band.',
  site: 'Maths explorer · drbuild.uk/hyperbolic'
};

async function card(browser) {
  const page = await browser.newPage({ viewport: { width: 660, height: 630 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await page.goto(BASE + VIEW);
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1500);
  const disk = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.close();
  const c = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await c.setContent(`<!DOCTYPE html><html><head><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; overflow: hidden; background: #f6f3ec; font-family: Georgia, "Times New Roman", serif; }
    img { position: absolute; right: 0; top: 0; width: 660px; height: 630px; }
    .panel { position: absolute; left: 64px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; }
    h1 { font-size: 56px; font-weight: normal; line-height: 1.08; color: #1a1a1a; }
    p { font-size: 23px; line-height: 1.32; color: #55524a; margin-top: 18px; }
    .site { font-size: 21px; color: #1552a1; margin-top: 22px; letter-spacing: 0.02em; }
  </style></head><body>
    <img src="data:image/png;base64,${disk}" alt="">
    <div class="panel"><h1>${CARD.title}</h1><p>${CARD.sub}</p><div class="site">${CARD.site}</div></div>
  </body></html>`);
  await c.waitForTimeout(300);
  let quality = 90, jpg;
  do { jpg = await c.screenshot({ type: 'jpeg', quality }); quality -= 5; } while (jpg.length > 300 * 1024 && quality > 40);
  fs.writeFileSync(path.join(ROOT, 'social', 'hyperbolic.jpg'), jpg);
  console.log('social/hyperbolic.jpg', jpg.length, 'bytes');
}

async function thumb(browser) {
  const FRAMES = 1, SECONDS = 1, RADIUS = 0.42;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperbolic-thumb-'));
  const page = await browser.newPage({ viewport: { width: 120, height: 120 }, deviceScaleFactor: 2, colorScheme: 'light' });
  await page.goto(BASE + VIEW + '&bg=none');
  await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(1200);
  for (let i = 0; i < FRAMES; i++) {
    const a = 2 * Math.PI * i / FRAMES;
    await page.evaluate(([x, y]) => {
      const H = window.Hyper; H.resetView(); H.setT(H.step(x, y)); H.invalidate();
    }, [RADIUS * Math.cos(a), RADIUS * Math.sin(a)]);
    await page.waitForTimeout(60);
    await page.screenshot({ path: path.join(tmp, String(i).padStart(3, '0') + '.png'), omitBackground: true });
  }
  await page.close();
  const out = path.join(ROOT, 'assets', 'thumbs', 'hyperbolic.webp');
  execFileSync('python3', ['-I', '-c', `
import sys, glob
from PIL import Image
frames = [Image.open(f).convert('RGBA') for f in sorted(glob.glob(sys.argv[1] + '/*.png'))]
frames[0].save(sys.argv[2], quality=82, method=6)
`, tmp, out, String(Math.round(SECONDS * 1000 / FRAMES))]);
  console.log('assets/thumbs/hyperbolic.webp', fs.statSync(out).size, 'bytes');
  fs.rmSync(tmp, { recursive: true, force: true });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  if (what === 'both' || what === 'card') await card(browser);
  if (what === 'both' || what === 'thumb') await thumb(browser);
  await browser.close();
})();
