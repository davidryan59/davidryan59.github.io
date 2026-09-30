/* Measures Pentrys's frames in headless Chromium, at 1280 x 800 and twice
   the pixel density: a frame's own work during play and during a Pentrys
   clear, and the gaps between frames while the title screen's game plays.
   It measures at full speed, then with the processor slowed four times. See
   Speed on old machines in docs/pentrys.md, where the numbers are kept.

   Run from the repo root. It needs Playwright with a Chromium. With only
   playwright-core installed, as in tools/tiling-video/, set NODE_PATH:
     NODE_PATH=tools/tiling-video/node_modules node tools/pentrys/perf.js
   CHROMIUM=<path> names a browser to use. Without Playwright's own
   Chromium, it uses Chrome, which may have a GPU and measure faster. */
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const PAGE = 'file://' + path.resolve(__dirname, '..', '..', 'app', 'pentrys', 'index.html');
const wait = ms => new Promise(r => setTimeout(r, ms));
const stats = list => {
  const s = list.slice().sort((a, b) => a - b), at = f => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return 'median ' + at(0.5).toFixed(1) + ' ms, 95% ' + at(0.95).toFixed(1) + ' ms, slowest ' + s[s.length - 1].toFixed(1) + ' ms';
};
async function launch() {
  if (process.env.CHROMIUM) return chromium.launch({ executablePath: process.env.CHROMIUM });
  try { return await chromium.launch(); } catch (e) { return chromium.launch({ channel: 'chrome' }); }
}

(async () => {
  const browser = await launch();
  for (const rate of [1, 4]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate });
    const frames = () => page.evaluate(() => window.PentrysDebug.frameTimes.slice());
    const reset = () => page.evaluate(() => { window.PentrysDebug.frameTimes.length = 0; });

    // Play: a seeded Marathon, with moves, turns, flips and drops.
    await page.goto(PAGE + '#mode=marathon&seed=8'); await wait(600); await reset();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(['ArrowLeft', 'KeyX', 'ArrowRight', 'KeyA'][i % 4]); await wait(60);
      if (i % 4 === 3) { await page.keyboard.press('Space'); await wait(90); }
    }
    const play = await frames();

    // A Pentrys: lesson 10's answer, through the clear and its celebration.
    await page.goto(PAGE + '#mode=tutorial&lesson=10'); await page.reload(); await wait(600);
    await page.keyboard.press('KeyX');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowRight'); await wait(30); }
    await reset(); await page.keyboard.press('Space'); await wait(1000);
    const clear = await frames();

    // The gaps between frames while the title screen's game plays.
    await page.goto(PAGE); await page.reload(); await wait(800);
    const gaps = await page.evaluate(() => new Promise(done => {
      const out = []; let last = 0, n = 0;
      (function f(t) { if (last) out.push(t - last); last = t; if (++n < 240) requestAnimationFrame(f); else done(out); })(0);
    }));
    console.log(`Processor ${rate === 1 ? 'at full speed' : 'slowed ' + rate + ' times'}`);
    console.log('  play, a frame\'s work:            ' + stats(play));
    console.log('  a Pentrys clear, a frame\'s work: ' + stats(clear));
    console.log('  title screen, between frames:    ' + stats(gaps));
    await ctx.close();
  }
  await browser.close();
})();
