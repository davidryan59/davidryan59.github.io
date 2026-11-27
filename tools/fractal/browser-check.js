'use strict';

const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const url = process.argv[2] || 'http://localhost:8000/app/fractal/';
const executablePath = process.env.CHROMIUM || undefined;
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); checks++; }

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
  const rows = () => page.locator('#numbers-body tr').count();
  const tabs = () => page.locator('#letter-tabs button').count();
  const activeTab = () => page.locator('#letter-tabs button.active').textContent();
  const selection = () => page.locator('#selection-name').textContent();
  const firstRow = () => page.locator('#numbers-body tr').first().textContent();

  // The Sieve in Free mode has a fixed editor layout: the parent square plus
  // an 8% margin, fitted inside a 13-pixel inset. This maps a frame point
  // to page pixels.
  async function editorPoint(p) {
    const box = await page.locator('#rule-editor').boundingBox();
    const scale = Math.min(box.width - 26, box.height - 26) / 1.16;
    return [box.x + box.width / 2 + (p[0] - 0.5) * scale, box.y + box.height / 2 + (p[1] - 0.5) * scale];
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Opened default demo.');
  await page.waitForSelector('#status-badge');
  equal(await page.locator('#status-badge').textContent(), 'Converges', 'Sieve converges');
  equal(await page.locator('#dimension').textContent(), 'log 3 / log 2', 'Sieve formula');
  check(Math.abs(Number(await page.locator('#dimension-value').textContent()) - Math.log(3) / Math.log(2)) < 0.001, 'Sieve dimension');
  equal(await rows(), 3, 'Sieve has three children');
  equal(await page.locator('[data-mode].active').textContent(), 'Free', 'Free mode is the default');
  equal(await page.locator('#selection-heading').textContent(), 'New child', 'nothing selected at start');
  await page.click('#toggle-menu');
  check(await page.locator('[data-preset="balanced"]').evaluate(button => button.classList.contains('active')), 'Balanced preset active');
  await page.click('[data-preset="fast"]');
  equal(await page.locator('#depth').inputValue(), '6', 'Fast preset depth');
  await page.click('[data-preset="balanced"]');
  equal(await page.locator('#depth').evaluate(input => input.min + '-' + input.max), '0-20', 'Iterations run from 0 to 20');
  await page.locator('#depth').evaluate(input => { input.value = 0; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
  check((await page.locator('#instance-count').textContent()).startsWith('1 copy'), '0 iterations draws the parent alone');
  await page.locator('#depth').evaluate(input => { input.value = 20; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
  check((await page.locator('#instance-count').textContent()).includes('limit'), '20 iterations stops at a limit');
  await page.click('[data-preset="balanced"]');
  check(await page.locator('[data-colour="order"]').evaluate(button => button.classList.contains('active')), 'Order is the default colour mode');
  equal(await page.locator('[data-colour]').first().textContent(), 'Order', 'Order is the first colour button');
  equal(await page.locator('#palette-label').textContent(), 'Colour by order', 'Order colours by place in the order');
  await page.click('[data-colour="top"]');
  check((await page.url()).includes('#rule='), 'the colour mode goes in the address');
  await page.click('[data-colour="order"]');
  check(await page.locator('#toggle-stacking').isDisabled(), 'Stacking is greyed out in Free mode');
  await page.click('#toggle-menu');

  // Drag between two editor points, in frame units.
  async function drag(from, to, options) {
    const a = await editorPoint(from), b = await editorPoint(to);
    const offset = (options && options.offset) || [0, 0];
    await page.mouse.move(a[0] + offset[0], a[1] + offset[1]);
    if (options && options.shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(b[0], b[1], { steps: 8 });
    await page.mouse.up();
    if (options && options.shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(50);
  }
  const cellsOf = async () => (await page.locator('#numbers-body tr').first().locator('td').allTextContents()).map(text => text.replace('−', '-'));
  const near = (text, value, tolerance) => Math.abs(Number(text) - value) < (tolerance || 0.01);

  // Child A of the Sieve fills the top-left quarter, so its centre is
  // (0.25, 0.25), its turn corner (0.5, 0) and its scale corner (0.5, 0.5).
  let cells;
  const centre = await editorPoint([0.25, 0.25]);
  await page.mouse.click(centre[0], centre[1]);
  equal(await selection(), 'A', 'a click selects the top-left child, A');
  const beforeHandle = await firstRow();

  // Turn: a press just outside the top-right corner grabs the turn knob.
  await drag([0.5, 0], [0.5, 0.5], { offset: [4, -4] });
  equal(await selection(), 'A', 'the handle drag kept the same child');
  cells = await cellsOf();
  check(near(cells[5], 0.5) && near(cells[6], 90, 0.01), 'the turn corner turns a quarter turn about the centre: ' + cells.join(' '));
  check(near(cells[3], 0.5) && near(cells[4], 0), 'the turn kept the centre in place: ' + cells.join(' '));
  await page.click('#undo');
  equal(await firstRow(), beforeHandle, 'undo restores the child');

  // A moved child sticks to edges: A's top edge lies on the parent's, so a
  // sideways drag that wobbles 2 pixels down keeps y at 0.
  {
    const from = await editorPoint([0.25, 0.25]), to = await editorPoint([0.35, 0.25]);
    await page.mouse.move(from[0], from[1]); await page.mouse.down();
    await page.mouse.move(to[0], to[1] + 2, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(50);
    cells = await cellsOf();
    check(near(cells[3], 0.1, 0.02) && cells[4] === '0.000', 'a sideways drag stays on the top edge: ' + cells.join(' '));
    await page.click('#undo');
  }

  // Turns are sticky at right angles: a drag to 93 degrees lands on 90.
  const turned = [0.25 + Math.SQRT2 * 0.25 * Math.cos((45 + 3) * Math.PI / 180), 0.25 + Math.SQRT2 * 0.25 * Math.sin((45 + 3) * Math.PI / 180)];
  await drag([0.5, 0], turned);
  cells = await cellsOf();
  equal(cells[6], '90.000', 'a turn near 90 degrees holds at 90');
  await page.click('#undo');

  // Scale: the bottom-right corner scales about the centre.
  await drag([0.5, 0.5], [0.625, 0.625]);
  cells = await cellsOf();
  check(near(cells[5], 0.75) && near(cells[6], 0), 'the scale corner scales by 3/2: ' + cells.join(' '));
  check(near(cells[3], -0.125) && near(cells[4], -0.125), 'the scale kept the centre in place: ' + cells.join(' '));
  await page.click('#undo');
  console.log('Turned and scaled a child about its centre.');

  // Edges: across the right edge stretches, and along it skews.
  await drag([0.5, 0.25], [0.75, 0.25]);
  equal(await page.locator('#numbers-head th').count(), 10, 'a stretched child shows the six affine values');
  cells = await cellsOf();
  check(near(cells[3], 0.75) && near(cells[4], 0) && near(cells[5], 0) && near(cells[6], 0.5), 'across the edge stretches width only: ' + cells.join(' '));
  check(cells[4] === '0.000', 'zero shows three decimals');
  // Rotate R turns the number inside the same rectangle: (x, y) goes to
  // (1 - y, x) in the child's frame, so the 0.75 by 0.5 outline stays put.
  await page.click('#rotate-right');
  cells = await cellsOf();
  check(near(cells[3], 0) && near(cells[4], 0.5) && near(cells[5], -0.75) && near(cells[6], 0) && near(cells[7], 0.75) && near(cells[8], 0),
    'Rotate R keeps the rectangle in place: ' + cells.join(' '));
  await page.click('#undo');
  await page.click('#undo');
  await drag([0.5, 0.25], [0.5, 0.4]);
  cells = await cellsOf();
  check(near(cells[3], 0.5) && Math.abs(Number(cells[4])) > 0.1 && near(cells[6], 0.5), 'along the edge skews: ' + cells.join(' '));
  await page.click('#undo');
  // Zero skew is sticky: a skew dragged back to within a few pixels of
  // square lands on square exactly.
  const along = await editorPoint([0.5, 0.25]), back = await editorPoint([0.5, 0.4]);
  await page.mouse.move(along[0], along[1]); await page.mouse.down();
  await page.mouse.move(back[0], back[1], { steps: 6 });
  await page.mouse.move(along[0] + 1, along[1] + 3, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(50);
  equal(await page.locator('#numbers-head th').count(), 9, 'a skew dragged back near zero holds at zero');
  if (!(await page.locator('#undo').isDisabled())) await page.click('#undo');
  // With Skew locked, an edge handle only stretches, whichever way it moves.
  await page.click('#lock-skew');
  equal(await page.locator('#lock-skew').getAttribute('aria-pressed'), 'true', 'Skew locks');
  await drag([0.5, 0.25], [0.5, 0.4]);
  cells = await cellsOf();
  check(cells.length === 9 || near(cells[4], 0), 'with Skew locked, the edge only stretches: ' + cells.join(' '));
  if (!(await page.locator('#undo').isDisabled())) await page.click('#undo');
  await page.click('#lock-stretch');
  const lockedBefore = await firstRow();
  await drag([0.47, 0.25], [0.57, 0.25]);
  const lockedAfter = await firstRow(); check(lockedAfter !== lockedBefore && (await page.locator('#numbers-head th').count()) === 9, 'with both locked, an edge press moves the child: ' + lockedBefore + ' / ' + lockedAfter + ' / ' + await selection());
  await page.click('#undo');
  await page.click('#lock-stretch'); await page.click('#lock-skew');
  console.log('Stretched, skewed and locked the edges.');

  // Editor view: the wheel zooms, empty space pans, and Fit restores.
  const editorCanvas = await page.locator('#rule-editor').boundingBox();
  check(await page.locator('#editor-fit').isDisabled(), 'Fit is greyed out while the editor fits itself');
  await page.mouse.move(editorCanvas.x + editorCanvas.width / 2, editorCanvas.y + editorCanvas.height / 2);
  await page.mouse.wheel(0, -300);
  check(!(await page.locator('#editor-fit').isDisabled()), 'the wheel zooms the editor');
  await page.click('#editor-fit');
  const corner2 = await editorPoint([1.07, 1.07]);
  await page.mouse.move(corner2[0], corner2[1]); await page.mouse.down();
  await page.mouse.move(corner2[0] - 30, corner2[1] - 20, { steps: 5 }); await page.mouse.up();
  check(!(await page.locator('#editor-fit').isDisabled()), 'a drag on empty space pans the editor');
  equal(await selection(), 'A', 'a pan keeps the selection');
  await page.click('#editor-fit');
  const away = await editorPoint([1.07, 1.07]);
  await page.mouse.click(away[0], away[1]);
  equal(await page.locator('#selection-heading').textContent(), 'New child', 'a click on empty space deselects');
  await page.mouse.click(centre[0], centre[1]);

  // The line under the editor sets its height, and a double-click resets it.
  const wrapBefore = (await page.locator('#editor-wrap').boundingBox()).height;
  const line = await page.locator('#divider-editor').boundingBox();
  await page.mouse.move(line.x + line.width / 2, line.y + line.height / 2); await page.mouse.down();
  await page.mouse.move(line.x + line.width / 2, line.y + line.height / 2 + 60, { steps: 5 }); await page.mouse.up();
  check(Math.abs((await page.locator('#editor-wrap').boundingBox()).height - wrapBefore - 60) < 2, 'the line under the editor makes it taller');
  await page.waitForTimeout(100);
  const shape = await page.locator('#rule-editor').evaluate(canvas => { const r = canvas.getBoundingClientRect(); return [canvas.width / canvas.height, r.width / r.height]; });
  check(Math.abs(shape[0] - shape[1]) < 0.01, 'the editor redraws at its new shape: ' + shape.join(' '));
  await page.locator('#divider-editor').dblclick();
  check(Math.abs((await page.locator('#editor-wrap').boundingBox()).height - wrapBefore) < 2, 'a double-click resets the editor height');
  console.log('Zoomed, panned and resized the editor.');

  // Keys on a selected child: T rotates, Cmd+D duplicates, Backspace removes.
  await page.locator('#rule-editor').focus();
  await page.keyboard.press('t');
  check((await firstRow()).includes('90'), 'T rotates the child a quarter turn');
  await page.keyboard.press('ControlOrMeta+d');
  equal(await rows(), 4, 'Cmd+D duplicates the child');
  equal(await selection(), 'B', 'the duplicate sits after its original as B and is selected');
  await page.keyboard.press('Backspace');
  equal(await rows(), 3, 'Backspace removes the selected child');
  await page.keyboard.press('Escape');
  equal(await page.locator('#selection-heading').textContent(), 'New child', 'Escape deselects');
  await page.click('#add-child');
  equal(await rows(), 4, '+ adds a child in Free mode');
  equal(await selection(), 'D', 'the new child is selected');

  // Reorder the children by dragging the first row's grip to the bottom.
  const first = await firstRow();
  const grip = await page.locator('#numbers-body tr').first().locator('.grip').boundingBox();
  const last = await page.locator('#numbers-body tr').last().boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, last.y + last.height - 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  equal((await page.locator('#numbers-body tr').last().textContent()).slice(2), first.slice(2), 'dragging a row reorders the children');
  equal((await page.locator('#numbers-body tr').last().textContent()).slice(1, 2), 'D', 'the moved child is relabelled D');

  // The edit pop-up changes nothing until OK.
  await page.locator('#numbers-body tr').first().locator('.edit-child').click();
  check(await page.locator('#edit-dialog').evaluate(dialog => dialog.open), 'the pencil opens the pop-up');
  await page.locator('#edit-fields input').nth(2).fill('1/4');
  await page.locator('#edit-form button[value="ok"]').click();
  check(!(await page.locator('#edit-dialog').evaluate(dialog => dialog.open)), 'OK closes the pop-up');
  check((await firstRow()).includes('0.250'), 'OK applies the scale');
  console.log('Edited children by key, drag and pop-up.');

  await page.selectOption('#demo', 'linked');
  console.log('Opened linked demo.');
  await page.waitForTimeout(100);
  equal(await tabs(), 2, 'linked demo has two parents');
  equal(await page.locator('#letter-tabs button').first().textContent(), '1', 'parents are numbered');
  check(Math.abs(Number(await page.locator('#dimension-value').textContent()) - 1.3885) < 0.002, 'linked dimension');
  await page.locator('#rule-editor').focus();
  await page.keyboard.press('Shift+Digit2');
  equal(await activeTab(), '2', 'Shift+2 shows parent 2');
  equal(await rows(), 3, 'parent 2 has three children');
  await page.click('#duplicate-letter');
  equal(await tabs(), 3, 'duplicate adds a parent');
  equal(await activeTab(), '3', 'the duplicate is selected');
  check(await page.locator('#numbers-body td.child-number').evaluateAll(cells => cells.some(cell => cell.textContent === '3')), 'the duplicate copies itself, not parent 2');
  await page.keyboard.press('Backspace');
  equal(await tabs(), 2, 'Backspace removes the focused parent');
  await page.click('#undo');
  equal(await tabs(), 3, 'undo restores the parent');

  // Drag parent 1 to the end. It keeps its two children under number 3.
  const tab1 = await page.locator('#letter-tabs button').first().boundingBox();
  const tab3 = await page.locator('#letter-tabs button').last().boundingBox();
  await page.mouse.move(tab1.x + tab1.width / 2, tab1.y + tab1.height / 2);
  await page.mouse.down();
  await page.mouse.move(tab3.x + tab3.width - 2, tab3.y + tab3.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  await page.locator('#letter-tabs button').last().click();
  equal(await rows(), 2, 'the moved parent keeps its children under its new number');
  console.log('Duplicated, removed and reordered parents.');

  await page.selectOption('#demo', 'blankTriangle');
  equal(await page.locator('[data-mode].active').textContent(), 'Triangle', 'blank triangle opens in Triangle mode');
  const editorBox = await page.locator('#rule-editor').boundingBox();
  await page.mouse.click(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height * 0.45);
  equal(await rows(), 1, 'a tap adds a triangle child');
  check(await page.locator('#flip-v').isDisabled(), 'Triangle mode has no vertical flip');

  await page.selectOption('#demo', 'free');
  console.log('Opened Free demo.');
  await page.click('#toggle-menu');
  equal(await page.locator('#toggle-stretch').count(), 0, 'Options has no Stretch switch');
  equal(await page.locator('#numbers-head th').count(), 9, 'similar children show x, y, scale, angle and flip');
  await page.click('#advanced-limits summary');
  await page.locator('#max-copies').fill('0');
  equal(await page.locator('#max-copies-value').textContent(), '1', 'copy limit of 1');
  check((await page.locator('#instance-count').textContent()).includes('copy limit'), 'copy limit is named');
  await page.click('#toggle-menu');
  await page.click('#add-letter');
  equal(await tabs(), 2, 'add a parent');
  check((await page.url()).includes('#rule='), 'an edit encodes the rule');

  const restored = await browser.newPage({ viewport: { width: 900, height: 700 } });
  restored.setDefaultTimeout(8000);
  await restored.goto(await page.url(), { waitUntil: 'domcontentloaded' });
  equal(await restored.locator('#letter-tabs button').count(), 2, 'the address restores the parents');
  equal(await restored.locator('[data-mode].active').textContent(), 'Free', 'the address restores the mode');
  await restored.close();

  const phone = await browser.newPage({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });
  phone.setDefaultTimeout(8000);
  await phone.goto(url, { waitUntil: 'domcontentloaded' });
  await phone.click('#toggle-menu');
  const popoverBox = await phone.locator('#toggle-popover').boundingBox();
  const stageBox = await phone.locator('#main-stage').boundingBox();
  check(popoverBox.x >= -1 && popoverBox.x + popoverBox.width <= 394, 'phone options fit across');
  check(popoverBox.y + popoverBox.height <= stageBox.y + stageBox.height + 1, 'phone options fit down');
  await phone.close();

  assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  await browser.close();
  console.log('Fractal browser: ' + checks + ' checks passed.');
})().catch(error => { console.error(error); process.exit(1); });
