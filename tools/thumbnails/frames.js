/* Renders an animated thumbnail at chosen moments and lays the frames side by
   side, each clipped to the shape the builder page shows it in. Use it to
   check a picture after changing its script.

   node tools/thumbnails/frames.js <file.svg> <out.png> <circle|square> <scale> <seconds...>
   e.g. node tools/thumbnails/frames.js assets/thumbs/dice-to-seed.svg /tmp/dice.png square 2 0 0.5 1 3

   It pauses both kinds of animation the pictures use, SMIL and CSS, at each
   time. It needs the Playwright install in tools/tiling-video: run npm
   install in that folder first. Like the other tools it takes its browser
   from CHROMIUM, and falls back to an installed Google Chrome. */
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'tiling-video', 'node_modules', 'playwright-core'));

(async () => {
  const [file, out, shape, scaleArg, ...times] = process.argv.slice(2);
  if (!times.length) { console.error('usage: frames.js <file.svg> <out.png> <circle|square> <scale> <seconds...>'); process.exit(1); }
  const scale = +scaleArg || 2;
  let browser;
  try { browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined }); }
  catch (e) { browser = await chromium.launch({ channel: 'chrome' }); }
  const page = await browser.newPage({ viewport: { width: 120, height: 120 }, deviceScaleFactor: scale });
  await page.goto('file://' + path.resolve(file));
  await page.waitForTimeout(300);
  const shots = [];
  for (const t of times) {
    await page.evaluate(s => {
      const svg = document.documentElement;
      if (svg.pauseAnimations) { svg.pauseAnimations(); svg.setCurrentTime(s); }
      document.getAnimations().forEach(a => { a.pause(); a.currentTime = s * 1000; });
    }, +t);
    await page.waitForTimeout(80);
    shots.push((await page.screenshot()).toString('base64'));
  }
  // The page's own clipping: a circle, or a square with rounded corners.
  const W = 120 * scale;
  const radius = shape === 'square' ? `${14.4 * scale}px` : '50%';
  const cols = Math.min(times.length, Math.max(1, Math.floor(1500 / (W + 16))));
  const sheet = await browser.newPage({ viewport: { width: 16 + cols * (W + 16), height: 100 } });
  await sheet.setContent(`<body style="margin:0;background:#f6f3ec;font:14px sans-serif">
    <div style="display:grid;grid-template-columns:repeat(${cols},${W}px);gap:16px;padding:16px">
    ${shots.map((s, i) => `<div><img src="data:image/png;base64,${s}" style="display:block;width:${W}px;height:${W}px;border-radius:${radius};box-shadow:0 0 0 1px rgba(0,0,0,.14)"><div>t = ${times[i]} s</div></div>`).join('')}
    </div></body>`);
  await sheet.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(out);
})();
