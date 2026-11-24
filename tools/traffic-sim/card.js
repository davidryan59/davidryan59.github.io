/* Capture social/traffic-sim.jpg from the real WebGL app.
   Serve the repository root, then run node tools/traffic-sim/card.js.
   APP_URL and CHROMIUM override the local URL and browser executable. */
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const APP_URL = process.env.APP_URL || 'http://localhost:8123/app/traffic-sim/';
const OUT = path.resolve(__dirname, '../../social/traffic-sim.jpg');
const MAX_BYTES = 300000;

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--force-color-profile=srgb', '--hide-scrollbars']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'dark' });
    const url = new URL(APP_URL);
    // The app's defaults, with a fixed seed.
    url.hash = 'length=2000&lanes=2&extra=1&keep=1&density=60&av=10&selfish=20&speed=1&colour=type&camera=top&seed=11';
    await page.goto(url.href);
    await page.waitForFunction(() => window.trafficSim);
    await page.click('#run');
    await page.evaluate(() => {
      const { ring } = window.trafficSim;
      while (ring.time < 900) ring.step();
    });
    await page.addStyleTag({ content: `
      .numbers, .map-tools, .gesture-hint { display: none !important; }
      .controls { width: 382px; opacity: 0; }
      .share-shade { position: fixed; inset: 0; pointer-events: none;
        background: linear-gradient(90deg, #17231f 0%, #17231f 25%, #17231fd9 32%, #17231f32 45%, transparent 55%); }
      .share-copy { position: fixed; left: 64px; top: 154px; width: 310px; color: #fffdf4;
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy h1 { margin: 0; font-size: 72px; font-weight: 400; line-height: 0.98; letter-spacing: -0.035em; }
      .share-copy p { margin: 24px 0 0; color: #e0ecce; font-size: 25px; line-height: 1.2; }
      .share-copy .site { margin-top: 34px; color: #a6c887; font: 16px system-ui, sans-serif; }
    ` });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<h1>Traffic<br>Simulator</h1><p>Watch a jam form,<br>then fix it</p><p class="site">drbuild.uk/app/traffic-sim/</p></div>');
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(450);
    for (let quality = 92; quality >= 40; quality -= 4) {
      const image = await page.screenshot({ type: 'jpeg', quality });
      if (image.length >= MAX_BYTES) continue;
      fs.writeFileSync(OUT, image);
      console.log(`social/traffic-sim.jpg: ${image.length} bytes at quality ${quality}`);
      return;
    }
    throw new Error('The share card exceeds 300 KB');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
