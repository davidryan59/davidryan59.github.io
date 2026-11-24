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
      .controls, .numbers, .map-tools, .gesture-hint { display: none !important; }
      .share-shade { position: fixed; inset: 0; pointer-events: none;
        background: linear-gradient(90deg, #17231fee 0%, #17231fdd 30%, #17231f99 42%, #17231f33 54%, transparent 64%); }
      .share-copy { position: fixed; left: 64px; top: 92px; width: 440px; color: #fffdf4;
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy h1 { margin: 0; font-size: 68px; font-weight: 400; line-height: 0.98; letter-spacing: -0.035em; }
      .share-copy .ask { margin: 30px 0 0; color: #fffdf4; font-size: 31px; line-height: 1.15; }
      .share-copy .how { margin: 12px 0 0; color: #e0ecce; font-size: 23px; line-height: 1.28; }
      .share-copy .site { margin-top: 30px; color: #a6c887; font: 16px system-ui, sans-serif; }
    ` });
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<h1>Traffic<br>Simulator</h1><p class="ask">Selfish or Coordinated?</p>' +
        '<p class="how">How road traffic flow is affected by<br>whether AI drivers serve their owners<br>or the community.</p>' +
        '<p class="site">drbuild.uk/traffic-sim</p></div>');
      window.dispatchEvent(new Event('resize'));
    });
    // Close in on the queue before the lane drop: the top straight and the
    // left bend. A half turn puts that straight along the bottom, under the
    // text, with traffic coming down the bend at the right, which curves up
    // and off the top. Traffic still keeps left.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const { view, goal } = window.trafficSim, o = view.oval;
      const H = 630, k = 0.6 / 1.3 * 1.1;                     // metres per pixel
      const dist = k * H / (2 * Math.tan(20 * Math.PI / 180));
      // Half turned, screen right is world -x and screen down is world -z.
      // The straight's centre line, z = -R, goes 221 px below the card's
      // centre, at y = 536, midway between the address and the bottom edge.
      // The bend's outer verge, R + half + 12 from its centre, reaches 90%
      // of the way across, x = 1080.
      const bend = 1080 - (o.R + o.half + 12) / k;
      const aim = { x: (bend - 600) * k - o.S / 2, z: 221 * k - o.R, yaw: Math.PI, dist, pitch: Math.PI / 2 };
      Object.assign(goal, aim);
      Object.assign(view.cam, aim, { follow: null });
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
