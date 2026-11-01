'use strict';

const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const url = process.argv[2] || 'http://localhost:8000/app/fractal/';
const executablePath = process.env.CHROMIUM || undefined;

(async () => {
  const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8000);
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.hostname === '127.0.0.1' || target.hostname === 'localhost') route.continue();
    else route.abort();
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Opened default demo.');
  await page.waitForSelector('#status-badge');
  assert.strictEqual(await page.locator('#status-badge').textContent(), 'Converges');
  assert.strictEqual(await page.locator('#dimension').textContent(), 'log 3 / log 2');
  assert(Math.abs(Number(await page.locator('#dimension-value').textContent()) - Math.log(3) / Math.log(2)) < 0.001);
  assert.strictEqual(await page.locator('#numbers-body tr').count(), 3);
  await page.click('#toggle-menu');
  assert(await page.locator('[data-preset="balanced"]').evaluate(button => button.classList.contains('active')));
  await page.click('[data-preset="fast"]');
  assert.strictEqual(await page.locator('#depth').inputValue(), '6');
  assert.strictEqual(await page.locator('#max-copies-value').textContent(), '10,000');
  await page.click('[data-preset="balanced"]');
  assert.strictEqual(await page.locator('#depth').inputValue(), '7');
  await page.click('#toggle-menu');

  await page.selectOption('#demo', 'linked');
  console.log('Opened linked demo.');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.locator('#letter-tabs button').count(), 2);
  assert(Math.abs(Number(await page.locator('#dimension-value').textContent()) - 1.3885) < 0.002);

  await page.selectOption('#demo', 'blankTriangle');
  assert.strictEqual(await page.locator('#mode').inputValue(), 'triangle');
  await page.locator('#rule-editor').click({ position: { x: 125, y: 90 } });
  assert.strictEqual(await page.locator('#numbers-body tr').count(), 1);

  await page.selectOption('#demo', 'free');
  console.log('Opened Free demo.');
  await page.locator('#rule-editor').click({ position: { x: 105, y: 85 } });
  await page.waitForTimeout(50);
  assert((await page.locator('#selection-name').textContent()) !== 'None');
  const beforeDrag = await page.url();
  const editor = await page.locator('#rule-editor').boundingBox();
  await page.mouse.move(editor.x + 105, editor.y + 85);
  await page.mouse.down();
  await page.mouse.move(editor.x + 145, editor.y + 112, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert.notStrictEqual(await page.url(), beforeDrag);
  await page.click('#toggle-menu');
  await page.check('#toggle-stretch');
  assert.strictEqual(await page.locator('#numbers-head th').count(), 7);
  await page.click('#advanced-limits summary');
  await page.locator('#max-copies').fill('0');
  assert.strictEqual(await page.locator('#max-copies-value').textContent(), '1,000');
  assert(await page.locator('[data-preset="custom"]').evaluate(button => button.classList.contains('active')));
  assert((await page.locator('#instance-count').textContent()).includes('copy limit'));

  await page.click('#add-letter');
  console.log('Edited and encoded a rule.');
  assert.strictEqual(await page.locator('#letter-tabs button').count(), 2);
  assert((await page.url()).includes('#rule='));

  const restored = await browser.newPage({ viewport: { width: 900, height: 700 } });
  restored.setDefaultTimeout(8000);
  await restored.goto(await page.url(), { waitUntil: 'domcontentloaded' });
  assert.strictEqual(await restored.locator('#letter-tabs button').count(), 2);
  assert.strictEqual(await restored.locator('#mode').inputValue(), 'free');
  await restored.click('#toggle-menu');
  await restored.click('#advanced-limits summary');
  assert.strictEqual(await restored.locator('#max-copies-value').textContent(), '1,000');
  await restored.close();

  const phone = await browser.newPage({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });
  phone.setDefaultTimeout(8000);
  await phone.goto(url, { waitUntil: 'domcontentloaded' });
  await phone.click('#toggle-menu');
  const popoverBox = await phone.locator('#toggle-popover').boundingBox();
  const stageBox = await phone.locator('#main-stage').boundingBox();
  assert(popoverBox.x >= -1 && popoverBox.x + popoverBox.width <= 394);
  assert(popoverBox.y + popoverBox.height <= stageBox.y + stageBox.height + 1);
  await phone.close();

  assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  await browser.close();
  console.log('Fractal browser: 26 checks passed.');
})().catch(error => { console.error(error); process.exit(1); });
