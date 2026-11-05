/* Drives Rolling Shapes in headless Chromium: the page loads with no errors, the
   opening plays, every preset gives its readout, a pen drags, a slider redraws, and
   a walk finishes in the worker. It saves pictures to tools/roll-shapes/renders/.

   Run with a local server: node tools/roll-shapes/browser-check.js [base-url]
   Set CHROMIUM to a browser's path if Playwright cannot find its own. */
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const base = process.argv[2] || 'http://localhost:8000';
const out = path.join(__dirname, 'renders');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : undefined);
  const page = await (await browser.newContext({ viewport: { width: 1728, height: 990 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_/.test(m.text())) problems.push('console: ' + m.text()); });
  const readout = () => page.evaluate(() => document.getElementById('state').textContent + ' | ' + document.getElementById('detail').textContent);
  const settle = async () => {
    await page.waitForFunction(() => document.getElementById('progress').hidden, null, { timeout: 60000 });
    await page.waitForTimeout(250);
  };
  const shot = name => page.screenshot({ path: path.join(out, name + '.png') });

  await page.goto(base + '/app/roll-shapes/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  console.log('opening:', await readout(), '| play button:', await page.textContent('#play'));
  await shot('opening-playing');

  const presets = await page.evaluate(() => [...document.querySelectorAll('#preset option')].map(o => o.value).filter(Boolean));
  for (const key of presets) {
    await page.selectOption('#preset', key);
    await settle();
    console.log(key.padEnd(18), await readout());
    await shot('preset-' + key);
  }

  await page.selectOption('#preset', 'peanut');
  await settle();
  const canvasBox = await page.locator('#shapes').boundingBox();
  const size = page.locator('#inner-sliders input').first();
  await size.focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await settle();
  console.log('size up:', await readout());
  await page.click('#close');
  await settle();
  console.log('after Close:', await readout());

  await page.selectOption('#preset', 'tumble');
  await settle();
  await size.count();
  const innerSize = page.locator('#inner-sliders input').first();
  await innerSize.focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowLeft');
  await settle();
  console.log('tumble moved:', await readout());
  await page.click('#close');
  await page.waitForFunction(() => document.getElementById('close').textContent === 'Close', null, { timeout: 60000 });
  await settle();
  console.log('tumble Close:', await readout());

  await page.check('#overlap');
  await settle();
  console.log('overlap on:', await readout());
  await shot('overlap');
  await page.uncheck('#overlap');
  await settle();

  /* Pens: tap to add, drag to move, tap to remove. */
  await page.selectOption('#preset', 'peanut');
  await settle();
  const pens = () => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('pens'));
  const wait = () => page.waitForTimeout(350);
  const at = (fx, fy) => [canvasBox.x + canvasBox.width * fx, canvasBox.y + canvasBox.height * fy];
  await wait();
  const before = await pens();
  await page.mouse.click(...at(0.6, 0.5));
  await wait();
  const added = await pens();
  console.log('pens:', before, '-> tap adds ->', added);
  if (added.split(';').length !== before.split(';').length + 1) problems.push('A tap did not add a pen');
  /* The added pen sits at the tap, on the parked shape's frame. Drag it. */
  await page.mouse.move(...at(0.6, 0.5));
  await page.mouse.down();
  await page.mouse.move(...at(0.65, 0.42), { steps: 6 });
  await page.mouse.up();
  await wait();
  const dragged = await pens();
  console.log('drag moves ->', dragged);
  if (dragged === added || dragged.split(';').length !== added.split(';').length) problems.push('A drag did not move the pen');
  await shot('two-pens');
  await page.mouse.click(...at(0.65, 0.42));
  await wait();
  const removed = await pens();
  console.log('tap on a pen removes ->', removed);
  if (removed.split(';').length !== added.split(';').length - 1) problems.push('A tap on a pen did not remove it');

  /* Layers, then a shared link rebuilds them. */
  await page.click('#keep');
  await page.selectOption('#preset', 'tumble');
  await settle();
  await page.click('#keep');
  await page.check('#rainbow');
  await page.waitForTimeout(400);
  await shot('layers');
  const address = await page.evaluate(() => location.href);
  const fresh = await (await browser.newContext({ viewport: { width: 1728, height: 990 } })).newPage();
  fresh.on('pageerror', e => problems.push('shared link: ' + e.message));
  await fresh.goto(address, { waitUntil: 'load' });
  await fresh.waitForTimeout(1500);
  const layered = await fresh.evaluate(() => {
    const c = document.getElementById('kept'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let inked = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i]) inked++;
    return { inked, playing: document.getElementById('play').textContent, clearOn: !document.getElementById('clear').disabled, rainbow: document.getElementById('rainbow').checked };
  });
  console.log('shared link:', JSON.stringify(layered));
  if (!layered.inked || !layered.clearOn || !layered.rainbow || layered.playing !== 'Play') problems.push('A shared link did not restore its layers');
  await fresh.close();
  await page.click('#clear');

  /* Saving. */
  for (const [button, name] of [['#png', 'rolling-shapes.png'], ['#svg', 'rolling-shapes.svg']]) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
    const file = path.join(out, 'saved-' + download.suggestedFilename());
    await download.saveAs(file);
    console.log(name, fs.statSync(file).size, 'bytes');
    if (download.suggestedFilename() !== name || fs.statSync(file).size < 2000) problems.push(name + ' looks wrong');
  }

  /* Outside, a stuck pair, and dark. */
  await page.click('#side-out');
  await settle();
  console.log('outside:', await readout());
  await shot('outside');
  await page.click('#side-in');
  await page.selectOption('#preset', 'peanut');
  await settle();
  await page.selectOption('#inner-type', 'polygon');
  await settle();
  const tooBig = page.locator('#inner-sliders input').first();
  await tooBig.focus();
  for (let i = 0; i < 180; i++) await page.keyboard.press('ArrowRight');
  await settle();
  console.log('too large:', await readout());
  await shot('stuck');
  await page.selectOption('#preset', 'tumble');
  await settle();
  await page.click('.theme-toggle');
  await page.waitForTimeout(300);
  await shot('dark');

  /* A slider on the move must leave the page responsive. */
  await page.selectOption('#preset', 'hop');
  await settle();
  const slider = await page.locator('#inner-sliders input').first().boundingBox();
  await page.mouse.move(slider.x + slider.width * 0.55, slider.y + slider.height / 2);
  await page.mouse.down();
  const started = Date.now();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 30 });
  console.log('slider drag of 30 steps on a tumble:', Date.now() - started, 'ms');
  await page.mouse.up();
  await settle();
  console.log('after drag:', await readout());

  console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'No page errors');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
