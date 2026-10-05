/* Checks how well a game or app fills the screen, at six window sizes: a
   27-inch monitor, a 16-inch laptop, an iPad upright and sideways, and a
   phone upright and sideways. The rules it checks are in docs/screen-fit.md.

   Run from anywhere:
     node tools/screen-fit/check.js <url> <play-area> [options]

   <play-area> is a CSS selector for the element the game is played in: its
   canvas, or the box round it.

   Options:
     --start <selector>     click this before measuring, to start a game
     --controls <selector>  touch controls, which must show on touch screens
     --out <folder>         where the screenshots go (default: a temp folder)

   For each size it prints how much of the window's width and height the play
   area takes, and flags these faults:
     OVERFLOW  the page is wider than the window, so it scrolls sideways
     OFFSCREEN part of the play area is outside the window
     SMALL     the play area takes under 70% of both the width and the height
     NO-PAD    on a touch screen, the touch controls are missing or off screen
   It exits with 1 if any size has a fault.

   It needs Playwright and its Chromium (npm install playwright, then
   npx playwright install chromium). Touch sizes run as a phone or tablet
   would: isMobile, so the page width behaves as on a real phone, and a
   coarse pointer, so touch controls show. A local file needs a local server,
   such as python3 -m http.server. */
const fs = require('fs'), os = require('os'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }
const CHROME = process.env.CHROMIUM || undefined;

const SIZES = [
  { id: 'monitor', w: 2560, h: 1300, touch: false },
  { id: 'laptop', w: 1728, h: 990, touch: false },
  { id: 'ipad-upright', w: 820, h: 1106, touch: true },
  { id: 'ipad-sideways', w: 1180, h: 750, touch: true },
  { id: 'phone-upright', w: 393, h: 659, touch: true },
  { id: 'phone-sideways', w: 852, h: 340, touch: true },
];

function args() {
  const a = process.argv.slice(2), opt = { url: null, area: null, start: null, controls: null, out: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--start') opt.start = a[++i];
    else if (a[i] === '--controls') opt.controls = a[++i];
    else if (a[i] === '--out') opt.out = a[++i];
    else if (!opt.url) opt.url = a[i];
    else if (!opt.area) opt.area = a[i];
  }
  if (!opt.url || !opt.area) {
    console.error('Usage: node tools/screen-fit/check.js <url> <play-area> [--start <selector>] [--controls <selector>] [--out <folder>]');
    process.exit(2);
  }
  opt.out = opt.out || fs.mkdtempSync(path.join(os.tmpdir(), 'screen-fit-'));
  fs.mkdirSync(opt.out, { recursive: true });
  return opt;
}

(async () => {
  const opt = args(), browser = await chromium.launch(CHROME ? { executablePath: CHROME } : undefined);
  let faults = 0;
  console.log('size'.padEnd(16) + 'play area'.padEnd(22) + 'width  height  faults');
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, hasTouch: s.touch, isMobile: s.touch });
    const page = await ctx.newPage();
    await page.goto(opt.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    if (opt.start) {
      try { await page.click(opt.start); } catch (e) { console.error(s.id + ': could not click ' + opt.start); }
      await page.waitForTimeout(1500);
    }
    const m = await page.evaluate(({ area, controls }) => {
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const shown = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const pads = controls ? [...document.querySelectorAll(controls)] : [];
      return {
        area: box(document.querySelector(area)),
        pageW: document.documentElement.scrollWidth,
        pads: pads.filter(shown).map(box),
      };
    }, { area: opt.area, controls: opt.controls });
    const f = [], a = m.area;
    if (m.pageW > s.w + 1) f.push('OVERFLOW');
    if (!a) f.push('OFFSCREEN');
    else {
      if (a.x < -1 || a.y < -1 || a.x + a.w > s.w + 1 || a.y + a.h > s.h + 1) f.push('OFFSCREEN');
      if (a.w / s.w < 0.7 && a.h / s.h < 0.7) f.push('SMALL');
    }
    if (s.touch && opt.controls) {
      const inside = m.pads.filter(p => p.w > 0 && p.x >= -1 && p.y >= -1 && p.x + p.w <= s.w + 1 && p.y + p.h <= s.h + 1);
      if (!inside.length) f.push('NO-PAD');
    }
    faults += f.length ? 1 : 0;
    const dims = a ? Math.round(a.w) + ' x ' + Math.round(a.h) : 'missing';
    const pw = a ? Math.round(100 * a.w / s.w) + '%' : '-', ph = a ? Math.round(100 * a.h / s.h) + '%' : '-';
    console.log((s.id + ' ').padEnd(16) + dims.padEnd(22) + pw.padEnd(7) + ph.padEnd(8) + (f.join(' ') || 'ok'));
    await page.screenshot({ path: path.join(opt.out, s.id + '.png') });
    await ctx.close();
  }
  await browser.close();
  console.log('\nScreenshots: ' + opt.out);
  process.exit(faults ? 1 : 0);
})();
