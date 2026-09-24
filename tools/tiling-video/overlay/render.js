// Renders the overlay layer as transparent PNG frames, frames/0000.png to
// frames/1349.png, frame n at time n / 30 s.
//   node render.js              every frame
//   node render.js 100 200      frames 100 to 200
//   node render.js 23,112,270   just these frames
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const Timeline = require(path.join(__dirname, '..', 'timeline.js'));

const CHROME = process.env.CHROMIUM || undefined;   // a Chromium binary, if Playwright's own is missing
const OUT = path.join(__dirname, 'frames');
const PAGES = 4;

function framesFromArgs(args) {
  if (args.length === 1 && args[0].includes(',')) return args[0].split(',').map(Number);
  const from = args.length ? Number(args[0]) : 0;
  const to = args.length > 1 ? Number(args[1]) : Timeline.FRAMES - 1;
  const list = [];
  for (let n = from; n <= to; n++) list.push(n);
  return list;
}

(async () => {
  const frames = framesFromArgs(process.argv.slice(2));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
  const url = 'file://' + path.join(__dirname, 'overlay.html');
  const pages = await Promise.all(Array.from({ length: PAGES }, async () => {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.overlayReady === true);
    return page;
  }));

  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(pages.map(async (page) => {
    while (next < frames.length) {
      const n = frames[next++];
      await page.evaluate((f) => window.renderFrame(f), n);
      const file = path.join(OUT, String(n).padStart(4, '0') + '.png');
      await page.screenshot({ path: file, omitBackground: true });
      if (++done % 150 === 0) console.log(done + ' / ' + frames.length + ' frames, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
  }));
  await browser.close();
  console.log('Rendered ' + done + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
})();
