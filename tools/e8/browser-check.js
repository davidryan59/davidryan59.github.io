/* Browser interaction check for the E8 explorer.
   CHROMIUM may name the Chrome or Chromium executable. */
'use strict';

const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const url = process.argv[2] || 'http://127.0.0.1:8000/app/e8/';
const shots = process.argv[3] || null;
const executablePath = process.env.CHROMIUM || undefined;

(async () => {
  const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__e8Explorer);
  assert.strictEqual(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://drbuild.uk/app/e8/', 'canonical address');
  assert.strictEqual(await page.locator('meta[property="og:image"]').getAttribute('content'), 'https://drbuild.uk/social/e8.jpg', 'sharing card');
  assert.strictEqual(await page.locator('meta[name="twitter:card"]').getAttribute('content'), 'summary_large_image', 'large Twitter card');
  await page.click('#pause');
  if (shots) fs.mkdirSync(shots, { recursive: true });
  if (shots) {
    await page.click('.theme-toggle');
    await page.screenshot({ path: path.join(shots, 'dark.png') });
    await page.click('.theme-toggle');
  }

  const canvas = await page.locator('#viewer').boundingBox();
  assert.ok(canvas && canvas.width > 700 && canvas.height > 700, 'large stage');
  const before = await page.evaluate(() => window.__e8Explorer.snapshot());

  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 75, canvas.y + canvas.height / 2 + 24, { steps: 8 });
  await page.mouse.up();
  const orbited = await page.evaluate(() => window.__e8Explorer.snapshot());
  assert.strictEqual(orbited.preset, 'custom', 'empty-space drag creates a free view');
  assert.ok(orbited.orthogonalityError < 1e-10, 'orbit keeps the frame orthonormal');
  assert.notDeepStrictEqual(orbited.frame[0], before.frame[0], 'orbit changes the frame');

  const rootPoint = orbited.selectedScreen;
  await page.mouse.move(canvas.x + rootPoint[0], canvas.y + rootPoint[1]);
  await page.mouse.down();
  await page.mouse.move(canvas.x + rootPoint[0] + 32, canvas.y + rootPoint[1] + 17, { steps: 8 });
  await page.mouse.up();
  const pulled = await page.evaluate(() => window.__e8Explorer.snapshot());
  assert.ok(pulled.orthogonalityError < 1e-10, 'root drag keeps the frame orthonormal');
  assert.ok(Math.hypot(pulled.selectedScreen[0] - rootPoint[0], pulled.selectedScreen[1] - rootPoint[1]) > 8, 'selected root follows the drag');

  for (const preset of ['coxeter', 'octagonal', 'squares', 'generic']) {
    await page.click(`[data-preset="${preset}"]`);
    await page.waitForTimeout(800);
    assert.strictEqual((await page.evaluate(() => window.__e8Explorer.snapshot())).preset, preset, preset + ' preset');
  }
  for (const preset of ['coxeter7', 'coxeter11', 'coxeter13', 'alternate', 'order24', 'order20', 'order18', 'order14']) {
    await page.selectOption('#more-projections', preset);
    await page.waitForTimeout(800);
    assert.strictEqual((await page.evaluate(() => window.__e8Explorer.snapshot())).preset, preset, preset + ' specialist preset');
    if (shots && preset.startsWith('coxeter')) await page.screenshot({ path: path.join(shots, preset + '.png') });
  }
  for (const view of ['roots', 'neighbourhood', 'coxeter', 'simple']) {
    await page.click(`[data-view="${view}"]`);
    if (view === 'coxeter' || view === 'simple') await page.waitForTimeout(800);
    assert.strictEqual((await page.evaluate(() => window.__e8Explorer.snapshot())).view, view, view + ' view');
    if (shots) await page.screenshot({ path: path.join(shots, view + '.png') });
  }
  await page.click('[data-view="roots"]');
  await page.click('[data-edges="all"]');
  await page.click('[data-colour="projection"]');
  if (shots) await page.screenshot({ path: path.join(shots, 'all-edges.png') });
  const configured = await page.evaluate(() => window.__e8Explorer.snapshot());
  assert.strictEqual(configured.edges, 'all', 'all-edge view');
  assert.strictEqual(configured.colour, 'projection', 'projection colours');

  const sharedUrl = page.url();
  await page.goto(sharedUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__e8Explorer);
  const restored = await page.evaluate(() => window.__e8Explorer.snapshot());
  assert.strictEqual(restored.view, configured.view, 'shared view restores');
  assert.strictEqual(restored.edges, configured.edges, 'shared edges restore');
  assert.strictEqual(restored.colour, configured.colour, 'shared colour restores');
  assert.ok(restored.orthogonalityError < 1e-7, 'shared projection is orthonormal');

  const home = new URL('/', url).href;
  await page.goto(home, { waitUntil: 'networkidle' });
  const builderLink = page.getByRole('link', { name: 'E8 Root System Explorer' });
  assert.strictEqual(await builderLink.getAttribute('href'), 'app/e8/index.html', 'builder-page link');
  assert.strictEqual(await page.locator('img[src="assets/thumbs/e8.svg"]').evaluate(image => image.naturalWidth), 120, 'builder-page thumbnail');
  if (shots) {
    const item = page.locator('li').filter({ has: builderLink });
    await item.screenshot({ path: path.join(shots, 'builder-entry.png') });
  }

  const redirect = fs.readFileSync(path.join(__dirname, '..', '..', 'redirects', 'e8.html'), 'utf8');
  assert.match(redirect, /permalink: \/e8\//, 'short-address permalink');
  assert.match(redirect, /location\.replace\('\/app\/e8\//, 'short-address destination');
  assert.match(redirect, /https:\/\/drbuild\.uk\/social\/e8\.jpg/, 'short-address sharing card');
  const thumbnail = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'thumbs', 'e8.svg'), 'utf8');
  assert.match(thumbnail, /dur="6s"/, 'six-second thumbnail animation');
  assert.match(thumbnail, /stop-color="#050609"/, 'dark thumbnail background');
  assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'assets', 'thumbs', 'e8-light.svg')), 'preserved light thumbnail');
  assert.ok(fs.statSync(path.join(__dirname, '..', '..', 'social', 'e8.jpg')).size > 20 * 1024, 'sharing-card image');

  assert.deepStrictEqual(errors, [], 'browser errors');
  await browser.close();
  console.log('E8 browser checks passed: orbit, root drag, presets, views, edges, colours and shared state.');
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
