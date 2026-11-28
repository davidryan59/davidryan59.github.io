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
    if (target.protocol === 'file:' || target.hostname === '127.0.0.1' || target.hostname === 'localhost') route.continue();
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
  // The table names each child and its parent. The exact values live in
  // the page address, so the checks read each child's map from there and
  // write it the way the edit pop-up does: x, y, scale, angle and flip, or
  // the six affine values once a child is stretched or skewed.
  const mapRows = () => page.evaluate(() => {
    const M = window.FractalModel, hash = location.hash.slice(1);
    let rule, current;
    if (hash.startsWith('demo=')) { rule = M.demos()[hash.slice(5)]; current = rule.letters[0].id; }
    else {
      let text = hash.slice(5).replace(/-/g, '+').replace(/_/g, '/'); while (text.length % 4) text += '=';
      const binary = atob(text); let escaped = '';
      for (let i = 0; i < binary.length; i++) escaped += '%' + binary.charCodeAt(i).toString(16).padStart(2, '0');
      const saved = JSON.parse(decodeURIComponent(escaped)); rule = saved.rule; current = saved.current || rule.letters[0].id;
    }
    const letter = rule.letters.find(l => l.id === current), affine = letter.children.some(c => !M.isSimilarity(c.matrix, 1e-6));
    const fixed3 = v => (Math.abs(v) < .0005 ? '0.000' : v.toFixed(3)).replace('-', '−');
    const rows = letter.children.map((child, index) => {
      const m = child.matrix, parent = String(rule.letters.findIndex(l => l.id === child.letter) + 1);
      let values;
      if (affine) values = m.map(fixed3);
      else {
        const flip = M.determinant(m) < 0, sv = M.singularValues(m);
        let angle = (flip ? Math.atan2(-m[1], -m[0]) : Math.atan2(m[1], m[0])) * 180 / Math.PI; if (angle <= -180 + 1e-9) angle += 360;
        values = [m[4], m[5], (sv[0] + sv[1]) / 2, angle].map(fixed3).concat([flip ? '1' : '0']);
      }
      return ['⠿', String.fromCharCode(65 + index), parent].concat(values);
    });
    return { affine, rows, own: letter.children.map(c => c.letter === current), lockParent: letter.children.map(c => !!c.lockParent), direction: letter.children.map(c => c.direction || 'all'), frame: rule.frame, matrices: letter.children.map(c => c.matrix) };
  });
  const rowText = async index => { const all = (await mapRows()).rows; return all[index < 0 ? all.length + index : index].join(''); };
  const firstRow = () => rowText(0);
  const lastRow = () => rowText(-1);
  const affineShown = async () => (await mapRows()).affine;

  // The Sieve has a fixed editor layout: the parent square plus an 8%
  // margin, fitted inside a 24-pixel inset, with the frame's centre, the
  // origin, in the middle. This maps a point, with y up, to page pixels.
  async function editorPoint(p) {
    const box = await page.locator('#rule-editor').boundingBox();
    const scale = Math.min(box.width - 48, box.height - 48) / 1.16;
    return [box.x + box.width / 2 + p[0] * scale, box.y + box.height / 2 - p[1] * scale];
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('Opened default demo.');
  await page.waitForSelector('#status-badge');
  equal(await page.locator('#status-badge').textContent(), 'Converges', 'Sieve converges');
  equal(await page.locator('#dimension').textContent(), 'log 3 / log 2', 'Sieve formula');
  check(/^\d\.\d\d$/.test(await page.locator('#box-dimension').textContent()), 'box count shows two decimals');
  check(Math.abs(Number(await page.locator('#dimension-value').textContent()) - Math.log(3) / Math.log(2)) < 0.001, 'Sieve dimension');
  equal(await rows(), 3, 'Sieve has three children');
  equal(await page.locator('#selection-heading').textContent(), 'New child', 'nothing selected at start');
  await page.click('#toggle-menu');
  check(await page.locator('[data-preset="balanced"]').evaluate(button => button.classList.contains('active')), 'Balanced preset active');
  await page.click('[data-preset="fast"]');
  equal(await page.locator('#depth').inputValue(), '6', 'Fast preset depth');
  await page.click('[data-preset="balanced"]');
  equal(await page.locator('#depth').evaluate(input => input.min + '-' + input.max), '0-32', 'Iterations run from 0 to 32');
  await page.locator('#depth').evaluate(input => { input.value = 0; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
  check((await page.locator('#instance-count').textContent()).startsWith('1 copy'), '0 iterations draws the parent alone');
  await page.locator('#depth').evaluate(input => { input.value = 32; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); });
  check((await page.locator('#instance-count').textContent()).includes('limit'), '32 iterations stops at a limit');
  const setRange = (id, value) => page.locator(id).evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); }, value);
  const slide = (id, end) => page.locator(id).evaluate((input, end) => { input.value = end === 'max' ? input.max : input.min; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change')); }, end);
  await slide('#max-copies', 'max'); await slide('#min-scale', 'max'); await slide('#max-time', 'min');
  await slide('#max-time', 'min');
  check((await page.locator('#instance-count').textContent()).includes('time limit'), 'a low frame time stops the drawing');
  await page.click('[data-preset="balanced"]');
  check(await page.locator('[data-colour="order"]').evaluate(button => button.classList.contains('active')), 'Order is the default colour mode');
  equal(await page.locator('[data-colour]').first().textContent(), 'Order', 'Order is the first colour button');
  equal(await page.locator('#palette-label').textContent(), 'Colour by order', 'Order colours by place in the order');
  await page.click('[data-colour="top"]');
  check((await page.url()).includes('#rule='), 'the colour mode goes in the address');
  await page.click('[data-colour="order"]');
  check(!(await page.locator('#toggle-snap').isChecked()), 'Snap corners is off by default');
  await page.click('#toggle-menu');

  // Drag between two editor points, in frame units.
  async function drag(from, to, options) {
    const a = await editorPoint(from), b = await editorPoint(to);
    const offset = (options && options.offset) || [0, 0];
    await page.mouse.move(a[0] + offset[0], a[1] + offset[1]);
    if (options && options.shift) await page.keyboard.down('Shift');
    if (options && options.alt) await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(b[0], b[1], { steps: 8 });
    await page.mouse.up();
    if (options && options.shift) await page.keyboard.up('Shift');
    if (options && options.alt) await page.keyboard.up('Alt');
    await page.waitForTimeout(50);
  }
  const cellsOf = async () => (await mapRows()).rows[0].map(text => text.replace('−', '-'));
  const near = (text, value, tolerance) => Math.abs(Number(text) - value) < (tolerance || 0.01);

  // Child A of the Sieve fills the top-left quarter, so its centre is
  // (−0.25, 0.25), its top edge's middle (−0.25, 0.5), with the turn knob
  // on a stalk 20 pixels above it, and its bottom-right corner (0, 0).
  // The table's columns are grip, name, parent, then x, y, scale, angle
  // and flip, or the six affine values.
  let cells;
  const centre = await editorPoint([-0.25, 0.25]);
  await page.mouse.click(centre[0], centre[1]);
  equal(await selection(), 'A', 'a click selects the top-left child, A');
  const beforeHandle = await firstRow();

  cells = await cellsOf();
  check(near(cells[3], -0.25) && near(cells[4], 0.25) && near(cells[5], 0.5), 'A sits at (−0.25, 0.25), half size: ' + cells.join(' '));
  // Turn: the stalk knob starts straight above the centre. Dragging it
  // round to the right of the centre turns A a quarter turn clockwise,
  // which is −90 degrees.
  await drag([-0.25, 0.5], [0.2, 0.25], { offset: [0, -20] });
  equal(await selection(), 'A', 'the handle drag kept the same child');
  cells = await cellsOf();
  check(near(cells[5], 0.5) && near(cells[6], -90, 0.01), 'the stalk knob turns a quarter turn clockwise about the centre: ' + cells.join(' '));
  check(near(cells[3], -0.25) && near(cells[4], 0.25), 'the turn kept the centre in place: ' + cells.join(' '));
  await page.click('#undo');
  equal(await firstRow(), beforeHandle, 'undo restores the child');

  // A moved child sticks to edges: A's top edge lies on the parent's, so a
  // sideways drag that wobbles 2 pixels down keeps y at 0.25.
  {
    const from = await editorPoint([-0.25, 0.25]), to = await editorPoint([-0.15, 0.25]);
    await page.mouse.move(from[0], from[1]); await page.mouse.down();
    await page.mouse.move(to[0], to[1] + 2, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(50);
    cells = await cellsOf();
    check(near(cells[3], -0.15, 0.02) && cells[4] === '0.250', 'a sideways drag stays on the top edge: ' + cells.join(' '));
    await page.click('#undo');
  }

  // Turns are sticky at right angles: the stalk knob starts at 90 degrees
  // from A's centre, and a drag to −3 degrees, 93 clockwise, lands on −90.
  const turned = [-0.25 + 0.4 * Math.cos(-3 * Math.PI / 180), 0.25 + 0.4 * Math.sin(-3 * Math.PI / 180)];
  await drag([-0.25, 0.5], turned, { offset: [0, -20] });
  cells = await cellsOf();
  equal(cells[6], '-90.000', 'a turn near 90 degrees clockwise holds at −90');
  await page.click('#undo');

  // Corners: a corner drag holds the opposite corner, here the top left at
  // (−0.5, 0.5), and stretches each way to meet the pointer. The six
  // affine values are a, b, c, d, e, f in columns 3 to 8.
  await drag([0, 0], [0.25, -0.125]);
  cells = await cellsOf();
  check(near(cells[3], 0.75) && near(cells[4], 0) && near(cells[5], 0) && near(cells[6], 0.625) && near(cells[7], -0.125) && near(cells[8], 0.1875),
    'a corner drag stretches each way about the opposite corner: ' + cells.join(' '));
  await page.click('#undo');
  // Shift keeps the shape: 3/2 the size, still about the top-left corner.
  await drag([0, 0], [0.25, -0.24], { shift: true });
  cells = await cellsOf();
  check(near(cells[3], -0.125) && near(cells[4], 0.125) && near(cells[5], 0.75) && near(cells[6], 0), 'Shift on a corner scales by 3/2 about the opposite corner: ' + cells.join(' '));
  await page.click('#undo');
  // Alt scales about the centre, as the old scale corner did.
  await drag([0, 0], [0.125, -0.125], { alt: true });
  cells = await cellsOf();
  check(near(cells[3], -0.25) && near(cells[4], 0.25) && near(cells[5], 0.75) && near(cells[6], 0), 'Alt on a corner scales by 3/2 about the centre: ' + cells.join(' '));
  await page.click('#undo');
  // Past the opposite corner the width turns negative, which flips the
  // child: it now spans x from −0.75 to −0.5.
  await drag([0, 0], [-0.75, 0]);
  cells = await cellsOf();
  check(near(cells[3], -0.25) && near(cells[4], 0) && near(cells[5], 0) && near(cells[6], 0.5) && near(cells[7], -0.625) && near(cells[8], 0.25),
    'a corner dragged past the opposite corner flips the child: ' + cells.join(' '));
  await page.click('#undo');
  console.log('Turned a child on its stalk and dragged its corners.');

  // Edges: across the right edge stretches, and along it skews. Stretching
  // the right edge from x = 0 to 0.25 keeps the left edge at −0.5.
  await drag([0, 0.25], [0.25, 0.25]);
  check(await affineShown(), 'a stretched child has six affine values');
  cells = await cellsOf();
  check(near(cells[3], 0.75) && near(cells[4], 0) && near(cells[5], 0) && near(cells[6], 0.5) && near(cells[7], -0.125) && near(cells[8], 0.25),
    'across the edge stretches width only: ' + cells.join(' '));
  check(cells[4] === '0.000', 'zero shows three decimals');
  // Rotate R turns the number clockwise inside the same rectangle: (x, y)
  // goes to (y, −x) in the child's frame, so the 0.75 by 0.5 outline stays put.
  await page.click('#rotate-right');
  cells = await cellsOf();
  check(near(cells[3], 0) && near(cells[4], -0.5) && near(cells[5], 0.75) && near(cells[6], 0) && near(cells[7], -0.125) && near(cells[8], 0.25),
    'Rotate R keeps the rectangle in place: ' + cells.join(' '));
  // The dice reorient each child inside its own outline. Shift-click turns
  // only, so the determinant keeps its sign. One Undo reverses a randomise.
  const outline = c => [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, y]) => [c[3] * x + c[5] * y + c[7], c[4] * x + c[6] * y + c[8]].map(v => Math.round(v * 1000) / 1000 + 0).join(',')).sort().join(' ');
  const det = c => Math.sign(c[3] * c[6] - c[4] * c[5]);
  const diceStart = (await cellsOf()).map(Number), turnedRow = await firstRow();
  for (const [button, shift] of [['#randomise-parent', false], ['#randomise-parent', true], ['#randomise-all', false], ['#randomise-all', true]]) {
    for (let i = 0; i < 6; i++) {
      await page.click(button, shift ? { modifiers: ['Shift'] } : undefined);
      const after = (await cellsOf()).map(Number);
      equal(outline(after), outline(diceStart), button + ' keeps the outline in place');
      if (shift) equal(det(after), det(diceStart), button + ' with Shift does not flip');
      await page.click('#undo');
      equal(await firstRow(), turnedRow, 'one Undo reverses ' + button);
    }
  }
  check(/8 orientations/.test(await page.locator('#randomise-parent').getAttribute('title')), 'the dice tooltip explains the square choices');
  console.log('Randomised orientations.');
  await page.click('#undo');
  await page.click('#undo');
  await drag([0, 0.25], [0, 0.1]);
  cells = await cellsOf();
  check(near(cells[3], 0.5) && Math.abs(Number(cells[4])) > 0.1 && near(cells[6], 0.5), 'along the edge skews: ' + cells.join(' '));
  await page.click('#undo');
  // Shift frees the edge: the right edge's middle follows the pointer to
  // (0.25, 0.1), so the child stretches by 3/2 and skews at once, and the
  // left edge stays put.
  await drag([0, 0.25], [0.25, 0.1], { shift: true });
  cells = await cellsOf();
  check(near(cells[3], 0.75) && near(cells[4], -0.15) && near(cells[5], 0) && near(cells[6], 0.5) && near(cells[7], -0.125) && near(cells[8], 0.175),
    'Shift on an edge stretches and skews at once: ' + cells.join(' '));
  await page.click('#undo');
  // Zero skew is sticky: a skew dragged back to within a few pixels of
  // square lands on square exactly.
  const along = await editorPoint([0, 0.25]), back = await editorPoint([0, 0.1]);
  await page.mouse.move(along[0], along[1]); await page.mouse.down();
  await page.mouse.move(back[0], back[1], { steps: 6 });
  await page.mouse.move(along[0] + 1, along[1] + 3, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(50);
  check(!(await affineShown()), 'a skew dragged back near zero holds at zero');
  if (!(await page.locator('#undo').isDisabled())) await page.click('#undo');
  console.log('Stretched and skewed the edges.');

  // Editor view: the wheel zooms, empty space pans, and Fit restores.
  const editorCanvas = await page.locator('#rule-editor').boundingBox();
  check(await page.locator('#editor-fit').isDisabled(), 'Fit is greyed out while the editor fits itself');
  await page.mouse.move(editorCanvas.x + editorCanvas.width / 2, editorCanvas.y + editorCanvas.height / 2);
  await page.mouse.wheel(0, -300);
  check(!(await page.locator('#editor-fit').isDisabled()), 'the wheel zooms the editor');
  await page.click('#editor-fit');
  const corner2 = await editorPoint([0.57, -0.57]);
  await page.mouse.move(corner2[0], corner2[1]); await page.mouse.down();
  await page.mouse.move(corner2[0] - 30, corner2[1] - 20, { steps: 5 }); await page.mouse.up();
  check(!(await page.locator('#editor-fit').isDisabled()), 'a drag on empty space pans the editor');
  equal(await selection(), 'A', 'a pan keeps the selection');
  await page.click('#editor-fit');
  const away = await editorPoint([0.57, -0.57]);
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
  check((await firstRow()).includes('−90.000'), 'T rotates the child a quarter turn clockwise');
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
  equal((await lastRow()).slice(2), first.slice(2), 'dragging a row reorders the children');
  equal(await page.locator('#numbers-body tr').last().locator('.child-name').textContent(), 'D', 'the moved child is relabelled D');

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
  equal(await page.locator('#dimension').textContent(), '2 log φ / log 2', 'linked formula names the golden ratio');
  const tabColour = () => page.locator('#letter-tabs button').first().evaluate(button => button.style.getPropertyValue('--dot'));
  const before = await tabColour();
  await page.click('#parent-colour');
  check(await page.locator('#colour-picker').isVisible(), 'the swatch opens the colour picker');
  equal(await page.locator('#colour-swatches button').count(), 10, 'the picker offers ten colours');
  await page.locator('#colour-swatches button').nth(3).click();
  equal(await tabColour(), '#8297e8', 'a swatch sets the parent colour');
  check((await page.url()).includes('#rule='), 'the colour goes in the address');
  await page.click('#colour-default');
  equal(await tabColour(), before, 'Default restores the palette colour');
  await page.click('#undo');
  equal(await tabColour(), '#8297e8', 'undo brings the chosen colour back');
  await page.keyboard.press('Escape');
  check(await page.locator('#colour-picker').isHidden(), 'Escape closes the picker');
  await page.click('#undo');
  equal(await tabColour(), before, 'undo again returns to the palette colour');
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

  // Parents 1 to 3 default to yellow, red and blue, and each keeps its
  // colour when dragged to a new number.
  const tabColours = () => page.locator('#letter-tabs button').evaluateAll(buttons => buttons.map(button => button.style.getPropertyValue('--dot')));
  const coloursBefore = await tabColours();
  equal(coloursBefore.join(' '), '#e9b44c #dc6f82 #57a9d8', 'parents default to yellow, red and blue');
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
  equal((await tabColours()).join(' '), [coloursBefore[1], coloursBefore[2], coloursBefore[0]].join(' '), 'each parent keeps its colour when reordered');
  console.log('Duplicated, removed and reordered parents.');
  // With several parents, the dice also pick each child's parent at random.
  const parentsSeen = new Set(), linkedRow = await firstRow(), linkedTab = await activeTab();
  for (let i = 0; i < 12; i++) {
    await page.click('#randomise-all');
    (await page.locator('#numbers-body td.child-number').allTextContents()).forEach(text => parentsSeen.add(text));
    await page.click('#undo');
  }
  // Undo also returns to the parent edited when the step was saved.
  await page.locator('#letter-tabs button', { hasText: linkedTab }).click();
  equal(await firstRow(), linkedRow, 'Undo reverses each linked roll');
  check(parentsSeen.size >= 2, 'the dice pick children\'s parents at random: ' + [...parentsSeen].join(' '));
  console.log('Randomised parents.');

  // The frame is only a picture: switching it keeps every map.
  await page.selectOption('#demo', 'gasket');
  equal(await page.locator('#dimension').textContent(), 'log 3 / log 2', 'the gasket is log 3 / log 2');
  equal(await rows(), 3, 'the gasket has three children');
  // Flip V mirrors a triangle child across its own bottom edge: A drops
  // into the gasket's middle hole, upside down, and a second press undoes it.
  // The middle hole shares the parent's centre, so it sits at (0, 0), turned
  // 180 degrees and flipped.
  await page.locator('#numbers-body tr').first().click();
  await page.click('#flip-v');
  check((await firstRow()).includes('0.0000.0000.500180.0001'), 'Flip V puts A in the middle hole, at (0, 0): ' + await firstRow());
  // OK on the pop-up, with nothing changed, leaves the flipped child as it was.
  const flippedRow = await firstRow();
  await page.locator('#numbers-body tr').first().locator('.edit-child').click();
  await page.locator('#edit-form button[value="ok"]').click();
  equal(await firstRow(), flippedRow, 'an unchanged pop-up leaves a flipped child as it was');
  await page.click('#flip-v');
  check((await firstRow()).includes('0.0000.2890.5000.0000'), 'a second Flip V brings A back to (0, 0.289)');
  await page.selectOption('#demo', 'gasket');
  await page.click('#toggle-menu');
  equal(await page.locator('[data-frame].active').textContent(), 'Triangle', 'the gasket opens on a triangle frame');
  check(await page.locator('#side-field').isVisible() && !(await page.locator('#cols-field').isVisible()), 'a triangle frame shows Per side, not Cols and Rows');
  const tableBefore = JSON.stringify((await mapRows()).matrices);
  await page.click('[data-frame="square"]');
  equal(JSON.stringify((await mapRows()).matrices), tableBefore, 'switching the frame keeps every map');
  equal(await page.locator('#dimension').textContent(), 'log 3 / log 2', 'and the same fractal');
  check(await page.locator('#cols-field').isVisible() && !(await page.locator('#side-field').isVisible()), 'a square frame shows Cols and Rows');
  await page.click('#undo');
  equal(await page.locator('[data-frame].active').textContent(), 'Triangle', 'undo brings the triangle frame back');
  await page.click('#grid-side button:text-is("4")');
  check((await page.url()).includes('#rule='), 'Per side is an edit');
  await page.click('#toggle-menu');
  console.log('Switched frames on the gasket.');

  // With Snap corners on, + fills one grid cell: the first free one that
  // matches the preview, upright or upside down.
  await page.selectOption('#demo', 'gasket');
  await page.click('#toggle-menu');
  if (!(await page.locator('#toggle-snap').isChecked())) await page.check('#toggle-snap');
  await page.click('#grid-side button:text-is("2")');
  await page.click('#toggle-menu');
  await page.click('#flip-v');
  await page.click('#add-child');
  equal(await rows(), 4, '+ adds a fourth child to the gasket');
  check((await lastRow()).includes('0.0000.0000.500'), 'an upside-down new child fills the middle cell, at (0, 0): ' + await lastRow());
  await page.selectOption('#demo', 'sieve');
  await page.click('#add-child');
  check((await lastRow()).includes('0.2500.2500.500'), 'a new child fills the free top-right cell: ' + await lastRow());
  console.log('Added children one grid cell in size.');

  // + fills an empty parent from the bottom left, along the row, then up,
  // with Snap corners off too. Once the frame is full, it goes outside,
  // nearest the frame first.
  const centres = async () => (await mapRows()).matrices.map(m => [m[4], m[5]].map(v => Math.round(v * 1000) / 1000 + 0).join(','));
  await page.selectOption('#demo', 'sieve');
  await page.click('#toggle-menu');
  if (await page.locator('#toggle-snap').isChecked()) await page.uncheck('#toggle-snap');
  await page.click('#toggle-menu');
  await page.click('#add-letter');
  for (let i = 0; i < 5; i++) await page.click('#add-child');
  equal((await centres()).slice(0, 4).join(' '), '-0.25,-0.25 0.25,-0.25 -0.25,0.25 0.25,0.25', '+ fills the 2 by 2 grid from the bottom left, Snap corners off');
  check((await centres())[4].split(',').map(Number).some(v => Math.abs(v) > 0.5), 'with the frame full, + goes just outside it: ' + (await centres())[4]);
  equal((await mapRows()).matrices[0][0], 0.5, 'a new child is one grid cell in size');
  // Shift-click on Remove clears every child of the parent as one step.
  await page.click('#remove-child', { modifiers: ['Shift'] });
  equal(await rows(), 0, 'Shift-click on Remove clears every child');
  await page.click('#undo');
  equal(await rows(), 5, 'one Undo brings them all back');
  await page.locator('#rule-editor').focus();
  await page.keyboard.press('Shift+Backspace');
  equal(await rows(), 0, 'Shift+Backspace clears every child');
  check((await page.locator('#remove-child').getAttribute('title')).includes('Shift-click'), 'the Remove tooltip names Shift-click');
  // A triangle with 3 per side fills its 6 upright cells, then its 3
  // upside-down cells, turned a half turn.
  await page.selectOption('#demo', 'gasket');
  await page.click('#add-letter');
  await page.click('#toggle-menu');
  await page.click('#grid-side button:text-is("3")');
  await page.click('#toggle-menu');
  for (let i = 0; i < 9; i++) await page.click('#add-child');
  const tri = (await mapRows()).matrices;
  equal(tri.slice(0, 6).map(m => Math.sign(m[3])).join(','), '1,1,1,1,1,1', 'the first 6 new children fill the upright cells');
  equal(tri.slice(6).map(m => Math.sign(m[3])).join(','), '-1,-1,-1', 'the next 3 fill the upside-down cells');
  check(tri.slice(6).every(m => Math.abs(m[0] + 1 / 3) < 1e-9 && Math.abs(m[3] + 1 / 3) < 1e-9), 'an upside-down cell takes a half turn, not a mirror');
  const triCentres = await centres();
  equal(triCentres.slice(0, 3).join(' '), '-0.333,-0.192 0,-0.192 0.333,-0.192', 'the bottom row fills first, left to right');
  // The grid runs from 2 to 12.
  await page.click('#toggle-menu');
  equal((await page.locator('#grid-side button').allTextContents()).join(' '), '2 3 4 5 6 7 8 9 10 11 12', 'Per side has a button for each size from 2 to 12');
  const sizes = await page.locator('#grid-side').boundingBox(), popover = await page.locator('#toggle-popover').boundingBox();
  check(sizes.x + sizes.width <= popover.x + popover.width + 1, 'the 11 size buttons fit across Options');
  await page.click('#toggle-menu');
  console.log('Filled grids from the bottom left and cleared them.');

  // Each child has a parent lock and a three-state Direction. With both
  // locked, Randomise leaves the child as it was. Partly locked on a square
  // allows only the rectangle's flips, so each entry keeps its size.
  await page.selectOption('#demo', 'linked');
  const firstLocks = () => page.locator('#numbers-body tr').first();
  equal(await page.locator('#numbers-head th').nth(3).textContent(), 'Direction', 'the Lock column is now Direction');
  await firstLocks().locator('.lock-parent').click();
  check((await mapRows()).lockParent[0], 'the padlock in the Parent cell locks the parent of child A');
  await firstLocks().locator('td.whole .lock-child').click();
  equal((await mapRows()).direction[0], 'part', 'one click on Direction locks it partly');
  check((await firstLocks().locator('td.whole .lock-child').innerHTML()).includes('<rect x="7.5"'), 'a partly locked square child shows a tall rectangle');
  await firstLocks().locator('td.whole .lock-child').click();
  equal((await mapRows()).direction[0], 'lock', 'a second click locks Direction');
  const lockedA = JSON.stringify((await mapRows()).rows[0]);
  for (let i = 0; i < 8; i++) await page.click('#randomise-all');
  equal(JSON.stringify((await mapRows()).rows[0]), lockedA, 'Randomise leaves a child with both locks as it was');
  check((await page.locator('#randomise-all').getAttribute('title')).includes('parent lock and Direction'), 'the Randomise tooltip mentions the locks');
  await firstLocks().locator('td.whole .lock-child').click();
  equal((await mapRows()).direction[0], 'all', 'a third click unlocks Direction');
  await firstLocks().locator('td.whole .lock-child').click();
  await firstLocks().locator('.lock-parent').click();
  check(!(await mapRows()).lockParent[0], 'a second click unlocks the parent');
  equal((await mapRows()).frame, 'square', 'the linked demo uses the square frame');
  const startA = (await mapRows()).matrices[0].map(v => Math.abs(v).toFixed(6));
  const lockTestParents = new Set();
  for (let i = 0; i < 16; i++) {
    await page.click('#randomise-all');
    const now = await mapRows();
    equal(JSON.stringify(now.matrices[0].slice(0, 4).map(v => Math.abs(v).toFixed(6))), JSON.stringify(startA.slice(0, 4)), 'a partly locked child takes only rectangle symmetries');
    lockTestParents.add(now.rows[0][2]);
  }
  check(lockTestParents.size > 1, 'an unlocked parent still changes under Randomise');
  // Option-click on a dice sets every child upright: unmirrored, no turn.
  for (let i = 0; i < 3; i++) await page.click('#randomise-all');
  await page.click('#randomise-all', { modifiers: ['Alt'] });
  for (const m of (await mapRows()).matrices) check(m[0] > 0 && m[3] > 0 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9, 'Option-click sets each child upright: ' + m.join(','));
  check((await mapRows()).own.every(Boolean), 'Option-click points each child back at its own parent');
  check((await page.locator('#randomise-all').getAttribute('title')).includes('Option-click'), 'the dice tooltip mentions Option-click');
  await page.locator('#rule-editor').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Escape');
  const tabsBefore = await tabs();
  await page.keyboard.press('p');
  equal(await tabs(), tabsBefore + 1, 'P adds a parent');
  await page.keyboard.press('Meta+z');
  equal(await tabs(), tabsBefore, 'one undo removes the added parent');
  const beforeD = JSON.stringify((await mapRows()).matrices) + JSON.stringify((await mapRows()).rows.map(r => r[2]));
  await page.keyboard.press('d');
  check(JSON.stringify((await mapRows()).matrices) + JSON.stringify((await mapRows()).rows.map(r => r[2])) !== beforeD, 'D rolls the dice for every parent');
  await page.keyboard.press('Alt+d');
  check((await mapRows()).own.every(Boolean), 'Option+D resets every child to its own parent');
  console.log('Locked a child\'s parent and direction against Randomise.');

  // Shape and Numbers: Hull and Hide by default. They travel with the
  // address and with a saved fractal. A fractal saved without them opens
  // with the defaults.
  await page.selectOption('#demo', 'sieve');
  await page.click('#toggle-menu');
  equal(await page.locator('#shape-mode .active').textContent(), 'Hull', 'Shape defaults to Hull');
  equal(await page.locator('#numbers-mode .active').textContent(), 'Hide', 'Numbers defaults to Hide');
  equal(await page.locator('#numbers-mode button').first().textContent(), 'Hide', 'Hide comes first');
  equal((await page.locator('#style-mode button').allTextContents()).join(' '), 'Solid Blend Auto Outline', 'Style offers four push buttons, Solid first');
  equal(await page.locator('#style-mode .active').textContent(), 'Solid', 'Style defaults to Solid');
  equal(await page.locator('#hull-cap-value').textContent(), '16', 'Balanced caps a hull at 16 corners');
  equal(await page.locator('#hull-iterations-value').textContent(), '30 steps', 'Balanced refines a hull up to 30 steps');
  await page.click('[data-preset="detailed"]');
  equal(await page.locator('#hull-cap-value').textContent(), '24', 'Detailed caps a hull at 24 corners');
  await page.click('[data-preset="fast"]');
  equal(await page.locator('#hull-cap-value').textContent(), '12', 'Fast caps a hull at 12 corners');
  await page.click('#copy-limits');
  check(!(await page.locator('#paste-limits').isDisabled()), 'Copy makes Paste available');
  await page.click('[data-shape="frame"]'); await page.click('[data-numbers="show"]'); await page.click('[data-style="blend"]');
  check((await page.url()).includes('#rule='), 'Shape and Numbers go in the address');
  await page.fill('#save-name', 'Check settings');
  await page.click('#save-fractal');
  await page.click('[data-preset="balanced"]'); await page.click('[data-shape="hull"]'); await page.click('[data-numbers="hide"]');
  await page.click('#toggle-menu');
  await page.locator('.library-list .open-saved', { hasText: 'Check settings' }).click();
  await page.click('#toggle-menu');
  equal(await page.locator('#shape-mode .active').textContent(), 'Frame', 'a saved fractal keeps its shape');
  equal(await page.locator('#numbers-mode .active').textContent(), 'Show', 'a saved fractal keeps its numbers');
  equal(await page.locator('#style-mode .active').textContent(), 'Blend', 'a saved fractal keeps its style');
  equal(await page.locator('[data-preset].active').textContent(), 'Fast', 'a saved fractal keeps its limits');
  await page.click('[data-preset="balanced"]');
  await page.click('#paste-limits');
  // Paste sets the limits but not Iterations, which Fast also sets.
  equal(await page.locator('#hull-cap-value').textContent(), '12', 'Paste sets the copied limits');
  equal(await page.locator('#max-copies-value').textContent(), '10,000', 'Paste sets every copied limit');
  await page.click('#toggle-menu');
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('fractal-library'));
    const old = list.find(entry => entry.name === 'Check settings');
    list.push({ name: 'Old save', savedAt: old.savedAt, rule: old.rule, current: old.current, level: 7, colourMode: null });
    localStorage.setItem('fractal-library', JSON.stringify(list));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.library-list .open-saved', { hasText: 'Old save' }).click();
  await page.click('#toggle-menu');
  equal(await page.locator('#shape-mode .active').textContent(), 'Hull', 'an old save opens with Shape Hull');
  equal(await page.locator('#numbers-mode .active').textContent(), 'Hide', 'an old save opens with Numbers hidden');
  equal(await page.locator('#style-mode .active').textContent(), 'Solid', 'an old save opens with Style Solid');
  equal(await page.locator('[data-preset].active').textContent(), 'Balanced', 'an old save opens with the Balanced limits');
  check(!(await page.locator('#toggle-snap').isChecked()), 'an old save opens with Snap corners off');
  await page.click('#toggle-menu');
  await page.evaluate(() => { localStorage.removeItem('fractal-library'); localStorage.removeItem('fractal-limits-copy'); });
  console.log('Saved the view settings with a fractal.');

  // The iterations panel hides, shows and resizes, and never scrolls.
  const strip = page.locator('#iteration-strip');
  const stripScrolls = () => strip.evaluate(s => s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1);
  check(!(await stripScrolls()), 'the iterations do not scroll');
  const panelBefore = (await page.locator('#iteration-panel').boundingBox()).height;
  await page.click('#toggle-strip');
  check(await strip.isHidden(), 'the arrow hides the iterations');
  check((await page.locator('#iteration-panel').boundingBox()).height < 40, 'hidden, the panel is one thin row');
  await page.click('#toggle-strip');
  check(await strip.isVisible(), 'the arrow shows them again');
  const stripLine = await page.locator('#divider-strip').boundingBox();
  await page.mouse.move(stripLine.x + 200, stripLine.y + stripLine.height / 2); await page.mouse.down();
  await page.mouse.move(stripLine.x + 200, stripLine.y + stripLine.height / 2 + 100, { steps: 5 }); await page.mouse.up();
  check(Math.abs((await page.locator('#iteration-panel').boundingBox()).height - panelBefore - 100) < 3, 'the line under the iterations makes them taller');
  check(!(await stripScrolls()), 'taller, the iterations still do not scroll');
  await page.mouse.move(stripLine.x + 200, stripLine.y + 100 + stripLine.height / 2); await page.mouse.down();
  await page.mouse.move(stripLine.x + 200, stripLine.y - 400, { steps: 5 }); await page.mouse.up();
  equal((await page.locator('#iteration-panel').boundingBox()).height, 110, 'the iterations stop at 110 pixels high');
  await page.locator('#divider-strip').dblclick();
  check(Math.abs((await page.locator('#iteration-panel').boundingBox()).height - panelBefore) < 2, 'a double-click resets their height');
  console.log('Hid, showed and resized the iterations.');

  await page.selectOption('#demo', 'free');
  console.log('Opened Free demo.');
  await page.click('#toggle-menu');
  check(!(await affineShown()), 'similar children have x, y, scale, angle and flip');
  equal((await page.locator('#numbers-head th').allTextContents()).join('|'), '|Child|Parent|Direction|', 'the table shows child, parent, lock and edit only');
  check(await page.locator('#max-copies').isVisible(), 'Options shows the copy limit without a fold');
  check(!(await page.locator('#min-depth').isVisible()), 'Advanced folds away Minimum iterations');
  await page.locator('#max-copies').fill('0');
  equal(await page.locator('#max-copies-value').textContent(), '1', 'copy limit of 1');
  check((await page.locator('#instance-count').textContent()).includes('copy limit'), 'copy limit is named');
  await page.click('#toggle-menu');
  await page.click('#add-letter');
  equal(await tabs(), 2, 'add a parent');
  equal(await page.locator('#status-badge').textContent(), 'Empty', 'a parent with no children reads Empty');
  check((await page.url()).includes('#rule='), 'an edit encodes the rule');

  // With Snap corners on, a skew lands exactly on a grid corner. A child 3
  // cells by 2 on a 4 by 4 grid has its right edge lifted one cell.
  {
    const rule = { version: 3, frame: 'square', grid: { rows: 4, cols: 4, side: 2 }, letters: [{ id: 'p1', children: [{ id: 'a', letter: 'p1', matrix: [0.75, 0, 0, 0.5, -0.125, -0.25] }] }] };
    const text = Buffer.from(encodeURIComponent(JSON.stringify({ rule, current: 'p1', depth: 3, snap: true })).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))), 'binary')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const skewPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await skewPage.goto(url + '#rule=' + text, { waitUntil: 'domcontentloaded' });
    await skewPage.waitForSelector('#status-badge');
    const box = await skewPage.locator('#rule-editor').boundingBox(), scale = Math.min(box.width - 48, box.height - 48) / 1.16;
    const px = p => [box.x + box.width / 2 + p[0] * scale, box.y + box.height / 2 - p[1] * scale];
    await skewPage.mouse.click(...px([-0.3, -0.3]));
    const a = px([0.25, -0.25]), b = px([0.25, 0]);
    await skewPage.mouse.move(a[0], a[1]); await skewPage.mouse.down();
    await skewPage.mouse.move(b[0] + 4, b[1] + 3, { steps: 12 }); await skewPage.mouse.up();
    await skewPage.waitForTimeout(50);
    const m = await skewPage.evaluate(() => {
      let t = location.hash.slice(6).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
      const bin = atob(t); let e = ''; for (let i = 0; i < bin.length; i++) e += '%' + bin.charCodeAt(i).toString(16).padStart(2, '0');
      return JSON.parse(decodeURIComponent(e)).rule.letters[0].children[0].matrix;
    });
    const topRight = [m[0] * 0.5 + m[2] * 0.5 + m[4], m[1] * 0.5 + m[3] * 0.5 + m[5]];
    check(Math.abs(topRight[0] - 0.25) < 1e-9 && Math.abs(topRight[1] - 0.25) < 1e-9, 'a skew with Snap corners on lands exactly on a grid corner: ' + topRight.join(', '));
    await skewPage.close();
  }

  // With Snap corners on, a 1 by 1 child in the bottom-left cell of a 4 by
  // 4 grid grows to 2 by 1 and 2 by 2 from its top-right corner, and its
  // bottom-left corner stays at (−0.5, −0.5). A snap never lands on a flat
  // child: dragged to 3 pixels from the opposite corner's line, the width
  // follows the pointer instead of snapping to zero.
  {
    const rule = { version: 3, frame: 'square', grid: { rows: 4, cols: 4, side: 2 }, letters: [{ id: 'p1', children: [{ id: 'a', letter: 'p1', matrix: [0.25, 0, 0, 0.25, -0.375, -0.375] }] }] };
    const text = Buffer.from(encodeURIComponent(JSON.stringify({ rule, current: 'p1', depth: 3, snap: true })).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))), 'binary')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const cornerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await cornerPage.goto(url + '#rule=' + text, { waitUntil: 'domcontentloaded' });
    await cornerPage.waitForSelector('#status-badge');
    const box = await cornerPage.locator('#rule-editor').boundingBox(), scale = Math.min(box.width - 48, box.height - 48) / 1.16;
    const px = p => [box.x + box.width / 2 + p[0] * scale, box.y + box.height / 2 - p[1] * scale];
    const matrix = () => cornerPage.evaluate(() => {
      let t = location.hash.slice(6).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
      const bin = atob(t); let e = ''; for (let i = 0; i < bin.length; i++) e += '%' + bin.charCodeAt(i).toString(16).padStart(2, '0');
      return JSON.parse(decodeURIComponent(e)).rule.letters[0].children[0].matrix;
    });
    const same = (m, want) => m.every((v, i) => Math.abs(v - want[i]) < 1e-9);
    await cornerPage.mouse.click(...px([-0.375, -0.375]));
    for (const [to, want, what] of [
      [[0, -0.25], [0.5, 0, 0, 0.25, -0.25, -0.375], '2 by 1'],
      [[0, 0], [0.5, 0, 0, 0.5, -0.25, -0.25], '2 by 2']]) {
      const a = px([-0.25, -0.25]), b = px(to);
      await cornerPage.mouse.move(a[0], a[1]); await cornerPage.mouse.down();
      await cornerPage.mouse.move(b[0] + 4, b[1] - 3, { steps: 12 }); await cornerPage.mouse.up();
      await cornerPage.waitForTimeout(50);
      const m = await matrix();
      check(same(m, want), 'a corner drag with Snap corners on makes ' + what + ': ' + m.join(', '));
      await cornerPage.click('#undo');
    }
    const a = px([-0.25, -0.25]), b = px([-0.5, -0.25]);
    await cornerPage.mouse.move(a[0], a[1]); await cornerPage.mouse.down();
    await cornerPage.mouse.move(b[0] + 3, b[1], { steps: 12 }); await cornerPage.mouse.up();
    await cornerPage.waitForTimeout(50);
    const m = await matrix();
    check(m[0] > 0 && Math.abs(m[0] - 3 / scale) < 0.3 * 3 / scale, 'a corner snap never makes a flat child: width ' + m[0]);
    await cornerPage.close();
  }

  // Triangle handles, with Snap corners on and 2 per side. Child A is per
  // side 1 in the bottom-left corner: apex (−0.25, h/6), bottom right
  // (0, −h/3) and bottom left (−0.5, −h/3), with h the triangle's height.
  {
    const h = Math.sqrt(3) / 2;
    const rule = { version: 3, frame: 'triangle', grid: { rows: 4, cols: 4, side: 2 }, letters: [{ id: 'p1', children: [{ id: 'a', letter: 'p1', matrix: [0.5, 0, 0, 0.5, -0.25, -h / 6] }] }] };
    const text = Buffer.from(encodeURIComponent(JSON.stringify({ rule, current: 'p1', depth: 3, snap: true })).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))), 'binary')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const triPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await triPage.goto(url + '#rule=' + text, { waitUntil: 'domcontentloaded' });
    await triPage.waitForSelector('#status-badge');
    // The editor fits the parent triangle plus an 8% margin inside a
    // 24-pixel inset, centred on the middle of its height.
    const box = await triPage.locator('#rule-editor').boundingBox(), scale = Math.min((box.width - 48) / 1.16, (box.height - 48) / (h + 0.16));
    const px = p => [box.x + box.width / 2 + p[0] * scale, box.y + box.height / 2 + h / 6 * scale - p[1] * scale];
    const matrix = () => triPage.evaluate(() => {
      let t = location.hash.slice(6).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '=';
      const bin = atob(t); let e = ''; for (let i = 0; i < bin.length; i++) e += '%' + bin.charCodeAt(i).toString(16).padStart(2, '0');
      return JSON.parse(decodeURIComponent(e)).rule.letters[0].children[0].matrix;
    });
    const corners = m => [[0, 2 * h / 3], [0.5, -h / 3], [-0.5, -h / 3]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const same = (got, want) => got.every((p, i) => Math.abs(p[0] - want[i][0]) < 1e-9 && Math.abs(p[1] - want[i][1]) < 1e-9);
    const show = m => corners(m).map(p => p.map(v => v.toFixed(4)).join(',')).join(' ');
    async function triDrag(from, to, wobble, options) {
      const a = px(from), b = px(to), o = (options && options.offset) || [0, 0];
      await triPage.mouse.move(a[0] + o[0], a[1] + o[1]);
      if (options && options.shift) await triPage.keyboard.down('Shift');
      await triPage.mouse.down();
      await triPage.mouse.move(b[0] + wobble[0], b[1] + wobble[1], { steps: 12 }); await triPage.mouse.up();
      if (options && options.shift) await triPage.keyboard.up('Shift');
      await triPage.waitForTimeout(50);
      return matrix();
    }
    await triPage.mouse.click(...px([-0.25, -h / 6]));
    const bl = [-0.5, -h / 3], br = [0, -h / 3], apex = [-0.25, h / 6];
    let m = await triDrag([-0.125, -h / 12], [0.25, h / 6], [3, 2]);
    check(same(corners(m), [[0, 2 * h / 3], [0.5, -h / 3], bl]), 'a triangle edge resizes per side 1 to 2 about the opposite corner: ' + show(m));
    await triPage.click('#undo');
    m = await triDrag(apex, [-0.25, 2 * h / 3], [2, -1]);
    check(same(corners(m), [[-0.25, 2 * h / 3], br, bl]), 'a triangle corner dragged across its opposite edge stretches onto the next row: ' + show(m));
    await triPage.click('#undo');
    m = await triDrag(apex, [0.25, h / 6], [1, 2]);
    check(same(corners(m), [[0.25, h / 6], br, bl]), 'a triangle corner dragged along its opposite edge skews onto a grid point: ' + show(m));
    await triPage.click('#undo');
    m = await triDrag(apex, [0, 2 * h / 3], [3, -2], { shift: true });
    check(same(corners(m), [[0, 2 * h / 3], br, bl]), 'Shift frees a triangle corner onto any grid point: ' + show(m));
    await triPage.click('#undo');
    // The turn knob stands 20 pixels below the bottom edge. A drag from
    // there round 62 degrees anticlockwise holds at 60.
    const c = [-0.25, -h / 6], end = [c[0] + 0.4 * Math.cos(-28 * Math.PI / 180), c[1] + 0.4 * Math.sin(-28 * Math.PI / 180)];
    m = await triDrag([-0.25, -h / 3], end, [0, 0], { offset: [0, 20] });
    check(Math.abs(m[0] - 0.25) < 1e-9 && Math.abs(m[1] - 0.25 * Math.sqrt(3)) < 1e-9 && Math.abs(m[4] - c[0]) < 1e-9 && Math.abs(m[5] - c[1]) < 1e-9,
      'the stalk below a triangle turns it and holds at 60 degrees: ' + m.join(', '));
    await triPage.close();
  }
  console.log('Resized, stretched, skewed and turned a triangle child.');

  const restored = await browser.newPage({ viewport: { width: 900, height: 700 } });
  restored.setDefaultTimeout(8000);
  await restored.goto(await page.url(), { waitUntil: 'domcontentloaded' });
  equal(await restored.locator('#letter-tabs button').count(), 2, 'the address restores the parents');
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
