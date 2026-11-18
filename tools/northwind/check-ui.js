/* Browser checks for Northwind's round 1 flows. Run with a local server:
   CHROMIUM=<Chrome binary> node tools/northwind/check-ui.js [base URL]
   Renders go beside this script in renders/. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }
const base = process.argv[2] || 'http://localhost:8000/app/northwind/';
const out = path.join(__dirname, 'renders');
const sizes = [[2560,1300], [1728,990], [820,1106], [1180,750], [393,659], [852,340]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  try {
    for (const theme of ['light', 'dark']) for (const [width,height] of sizes) {
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1200, isMobile: width < 1200 });
      await ctx.addInitScript(t => localStorage.setItem('theme', t), theme);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const go = async hash => { await page.goto(base + hash); await page.waitForFunction(() => document.querySelector('#main .page')); };
      const fit = async () => {
        const faults = await page.evaluate(() => {
          const root = document.documentElement, main = document.querySelector('#main');
          return { page: root.scrollWidth > root.clientWidth + 1, main: main.scrollWidth > main.clientWidth + 1 };
        });
        assert.deepStrictEqual(faults, { page: false, main: false });
      };
      await go('');
      assert.strictEqual(await page.locator('html').getAttribute('data-theme'), theme);
      const customer = page.locator('#main td a[href^="#/customers/"]').first();
      assert.ok(await customer.count());
      const colour = await customer.evaluate(el => getComputedStyle(el).color);
      assert.strictEqual(colour, theme === 'light' ? 'rgb(21, 82, 161)' : 'rgb(122, 166, 224)');
      await fit();
      const bar = page.locator('.chart .col').last(), href = await bar.getAttribute('href');
      await bar.focus();
      assert.strictEqual(await page.locator('#tip').isVisible(), true);
      await bar.press('Enter');
      await page.waitForURL('**' + href);
      await page.getByText('Clear period', { exact: true }).waitFor();
      await fit();
      await go('');
      await page.locator('.tile').first().click();
      await page.waitForURL('**#/reports/sales-by-period?period=month');
      await page.locator('[data-period="month"]').waitFor();
      assert.strictEqual(await page.locator('[data-period="month"]').getAttribute('aria-pressed'), 'true');
      for (const period of ['week','quarter','year','month']) {
        await page.locator('[data-period="' + period + '"]').click();
        await page.waitForURL('**period=' + period);
        await page.locator('[data-period="' + period + '"][aria-pressed="true"]').waitFor();
        assert.strictEqual(await page.locator('[data-period="' + period + '"]').getAttribute('aria-pressed'), 'true');
        await fit();
      }
      await page.screenshot({ path: path.join(out, theme + '-' + width + '-period.png') });
      await page.locator('.hbars a.track').first().click();
      await page.waitForURL('**#/orders?from=**');
      await page.locator('#q').waitFor();
      const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
      const dates = await page.locator('#rows tr td:nth-child(3)').allTextContents();
      assert.ok(dates.length);
      const expected = await page.evaluate(({from,to}) => {
        const m = NorthwindModel.create(NORTHWIND_SEED, {today: new Date().toLocaleDateString('en-CA')});
        return m.ordersInPeriod(from,to).length;
      }, {from:params.get('from'),to:params.get('to')});
      assert.ok((await page.locator('#count').textContent()).endsWith('of ' + expected));
      await go('#/orders');
      const before = page.url();
      await page.locator('#rows tr td').nth(2).click();
      if (width > 760) assert.strictEqual(page.url(), before);
      else await page.waitForURL('**#/orders/*');
      await go('');
      await page.locator('#find').fill('no');
      assert.ok((await page.locator('#found').textContent()).includes('Products ('));
      assert.ok(await page.locator('#found a[href^="#/products/"]').count());
      if (width === 393 || width === 1728) await page.screenshot({path:path.join(out,theme + '-' + width + '-search.png')});
      await page.locator('#found a[href*="type=Product"]').click();
      await page.waitForURL('**type=Product');
      await page.locator('.search-results').waitFor();
      assert.ok(await page.locator('.search-results a[href^="#/products/"]').count() > 3);
      await fit();
      await go('#/orders/new?customer=ALFKI');
      const picker = page.locator('[data-picker]').first();
      await picker.focus();
      assert.ok((await page.locator('.product-choices button').first().textContent()).includes('Recent for this customer'));
      await picker.press('ArrowUp');
      assert.strictEqual(await picker.getAttribute('aria-activedescendant'), await page.locator('.product-choices button').last().getAttribute('id'));
      if (width === 393 || width === 1728) await page.screenshot({path:path.join(out,theme + '-' + width + '-choices.png')});
      await picker.fill('beverages chai');
      assert.strictEqual(await page.locator('.product-choices button').count(), 1);
      await picker.press('ArrowDown'); await picker.press('Enter');
      assert.strictEqual(await picker.inputValue(), 'Chai');
      assert.strictEqual(await page.locator('[data-f="unitPrice"]').first().inputValue(), '18');
      assert.strictEqual(await picker.evaluate(el => el.checkValidity()), true);
      await picker.fill('no such product');
      assert.strictEqual(await picker.evaluate(el => el.checkValidity()), false);
      await picker.fill('cote'); await picker.press('Enter');
      assert.strictEqual(await picker.inputValue(), 'Côte de Blaye');
      await page.locator('[data-action="add"]').click();
      const second = page.locator('[data-picker]').nth(1);
      await second.fill('seafood');
      assert.ok(await page.locator('#choices-1 button').count() > 1);
      await page.locator('#choices-1 button').first().click();
      await fit();
      await page.screenshot({path:path.join(out, theme + '-' + width + '-picker.png')});
      await page.getByRole('button', { name: 'Save order', exact: true }).click();
      await page.waitForURL(/#\/orders\/\d+$/);
      await page.getByRole('heading', {name:/Order 11078/}).waitFor();
      await go('#/orders/10248/invoice');
      await fit();
      if (theme === 'dark' && width === 1728) {
        await page.emulateMedia({media:'print'});
        assert.strictEqual(await page.locator('.invoice').evaluate(el => getComputedStyle(el).color), 'rgb(0, 0, 0)');
        await page.pdf({path:path.join(out,'invoice-10248.pdf'), format:'A4', printBackground:true, margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}});
      }
      assert.deepStrictEqual(errors, []);
      await ctx.close();
      console.log(theme + ' ' + width + '×' + height + ': search, periods, chart, links, picker, save, invoice passed');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
