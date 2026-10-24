/* Draws social/pentrys.jpg, the 1200 x 630 share card for app/pentrys/, in
   the style of the site's other cards: one full-bleed picture. The card is
   the inside of a dark well, 22 columns wide. The game's title sits at the
   top left, a glowing X falls on the right, and a stack of pieces of 3 to 5
   squares fills the bottom, with special squares scattered through it.

   Run from anywhere: node tools/pentrys/card.js [seed] [out.jpg]
   The seed picks how the stack is tiled; the default draws the card as
   published. The pieces, colours, specials and title are drawn by the game's
   own app/pentrys/draw.js, in its dark theme. It saves a JPEG at the best
   quality under 300 KB, since WhatsApp shows no picture for anything larger.
   It needs Playwright and its Chromium, as tools/social-cards/render.js does.
   CHROMIUM names a browser binary to use instead. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const SEED = args.length ? +args[0] : 7;
const OUT = args[1] ? path.resolve(args[1]) : path.join(ROOT, 'social', 'pentrys.jpg');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const SCENE = {
  cols: 22,
  // The stack's height in each column, left to right. Low under the X.
  heights: [4, 4, 3, 3, 4, 5, 5, 4, 3, 3, 4, 4, 3, 3, 2, 2, 2, 3, 4, 4, 5, 5],
  // The falling X: its box's left column and its lowest row, counted up from 0.
  fall: { shape: 'X5', col: 14, row: 4, specials: [[2, 'bomb']] },
  // One special square each on this many pieces of the stack.
  specials: [2, 3, 0, 'flood', 2, 'rowbomb', 3, 'deluge', 2, 0],
  // The title fits this box, clear of the stack below it and the X to its right.
  title: { left: 60, top: 28, w: 500, h: 300 },
  seed: SEED
};

const CARD = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; background: linear-gradient(#151b3d, #0a0d20); }
  canvas { position: absolute; display: block; }
</style></head><body>
<canvas id="dots"></canvas>
<script src="/app/pentrys/pieces.js"></script>
<script src="/app/pentrys/config.js"></script>
<script src="/app/pentrys/rules.js"></script>
<script src="/app/pentrys/title.js"></script>
<script src="/app/pentrys/draw.js"></script>
<script>
  var P = Pentrys, Pieces = P.Pieces, Draw = P.Draw, S = ${JSON.stringify(SCENE)};
  var W = 1200, H = 630, s = W / S.cols, DPR = 2;
  Draw.setTheme(false);

  function canvas(x, y) {
    var cv = document.createElement('canvas');
    cv.style.left = x + 'px'; cv.style.top = y + 'px';
    document.body.appendChild(cv); return cv;
  }
  // Column c and row r, counted up from the bottom, to the card's pixels.
  function px(c) { return c * s; }
  function py(r) { return H - (r + 1) * s; }

  // The well's dot grid, at the corners of the cells.
  var dots = document.getElementById('dots');
  dots.width = W * DPR; dots.height = H * DPR; dots.style.width = W + 'px'; dots.style.height = H + 'px';
  var dc = dots.getContext('2d'); dc.scale(DPR, DPR); dc.fillStyle = 'rgba(170,190,255,0.16)';
  for (var c = 1; c < S.cols; c++) for (var r = 0; py(r) > 0; r++) { dc.beginPath(); dc.arc(px(c), py(r), 1.6, 0, Math.PI * 2); dc.fill(); }

  // A seeded random number, so a seed always tiles the stack the same way.
  var seed = S.seed >>> 0 || 1;
  function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Tile the stack with pieces of 3 to 5 squares, by backtracking. Each step
  // fills the lowest, leftmost empty cell. No two touching pieces share a shape.
  var shapes = Pieces.SHAPES.filter(function (n) { return Pieces.SHAPE[n].size >= 3; });
  var owner = S.heights.map(function () { return []; }), placed = [];
  function inside(c, r) { return c >= 0 && c < S.cols && r >= 0 && r < S.heights[c]; }
  function firstEmpty() {
    for (var r = 0; r < 5; r++) for (var c = 0; c < S.cols; c++) if (inside(c, r) && owner[c][r] == null) return [c, r];
    return null;
  }
  function fits(shape, o, at) {
    var cells = Pieces.shapeCells(shape, o), a = cells[0];
    cells.forEach(function (q) { if (q[1] > a[1] || (q[1] === a[1] && q[0] < a[0])) a = q; });
    var out = cells.map(function (q) { return [at[0] + q[0] - a[0], at[1] - (q[1] - a[1])]; });
    for (var i = 0; i < out.length; i++) if (!inside(out[i][0], out[i][1]) || owner[out[i][0]][out[i][1]] != null) return null;
    for (i = 0; i < out.length; i++) {
      var n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var k = 0; k < 4; k++) {
        var x = out[i][0] + n[k][0], y = out[i][1] + n[k][1];
        if (inside(x, y) && owner[x][y] != null && placed[owner[x][y]].shape === shape) return null;
      }
    }
    return out;
  }
  var steps = 0;
  function solve() {
    var at = firstEmpty();
    if (!at) return true;
    if (++steps > 200000) return false;
    var tries = [];
    shuffle(shapes.slice()).forEach(function (n) { shuffle([0, 1, 2, 3, 4, 5, 6, 7]).forEach(function (o) { tries.push([n, o]); }); });
    for (var t = 0; t < tries.length; t++) {
      var cells = fits(tries[t][0], tries[t][1], at);
      if (!cells) continue;
      var id = placed.length;
      placed.push({ shape: tries[t][0], o: tries[t][1], cells: cells });
      cells.forEach(function (q) { owner[q[0]][q[1]] = id; });
      if (solve()) return true;
      cells.forEach(function (q) { owner[q[0]][q[1]] = null; });
      placed.pop();
    }
    return false;
  }
  if (!solve()) throw new Error('no tiling for seed ' + S.seed);

  // Draw one piece with the game's own icon drawing: cells in card columns
  // and rows, specials as [cell index, kind] in the order of shapeCells.
  function drawPiece(shape, o, col, row, specials) {
    var cells = Pieces.shapeCells(shape, o), h = 0;
    cells.forEach(function (q) { h = Math.max(h, q[1] + 1); });
    var cv = canvas(px(col) - 1, py(row + h - 1) - 1);
    Draw.icon(cv, shape, o, specials, s);
    return cv;
  }
  // A placed piece's box: its left column and its lowest row.
  function box(p) {
    var cells = Pieces.shapeCells(p.shape, p.o), col = 1e9, row = 1e9;
    p.cells.forEach(function (q) { col = Math.min(col, q[0]); row = Math.min(row, q[1]); });
    return { col: col, row: row, cells: cells };
  }
  // Specials go on pieces spread across the stack, each on a cell in the top
  // half of its piece, where it shows.
  var order = placed.map(function (p, i) { return i; }).sort(function (a, b) {
    return Math.min.apply(null, placed[a].cells.map(function (q) { return q[0]; })) - Math.min.apply(null, placed[b].cells.map(function (q) { return q[0]; }));
  });
  var gets = {}, step = order.length / S.specials.length;
  S.specials.forEach(function (kind, i) { gets[order[Math.floor(i * step + step / 2)]] = kind; });
  placed.forEach(function (p, i) {
    var b = box(p), sp = [];
    if (i in gets) {
      var top = 0;
      b.cells.forEach(function (q, k) { if (q[1] < b.cells[top][1]) top = k; });
      sp.push([top, gets[i]]);
    }
    drawPiece(p.shape, p.o, b.col, b.row, sp);
  });

  // The falling X, with the game's glow behind it.
  var f = S.fall, fcells = Pieces.shapeCells(f.shape, 0), glow = canvas(px(f.col) - 2 * s, py(f.row + 2) - 2 * s);
  glow.width = 7 * s * DPR; glow.height = 7 * s * DPR; glow.style.width = 7 * s + 'px'; glow.style.height = 7 * s + 'px';
  var g = glow.getContext('2d'); g.scale(DPR, DPR); g.filter = 'blur(' + Math.round(s * 0.4) + 'px)';
  g.globalAlpha = 0.8; g.fillStyle = Draw.colour(f.shape);
  fcells.forEach(function (q) { g.beginPath(); g.roundRect((q[0] + 2) * s + 4, (q[1] + 2) * s + 4, s - 8, s - 8, s * 0.2); g.fill(); });
  drawPiece(f.shape, 0, f.col, f.row, f.specials);

  // The title, at the top left.
  Draw.logo(canvas(S.title.left, S.title.top), S.title.w, S.title.h);
  document.body.dataset.ready = '1';
</script>
</body></html>`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = req.url.split(/[?#]/)[0];
    if (url === '/__card.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(CARD); return; }
    const file = path.join(ROOT, decodeURIComponent(url));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:' + server.address().port + '/__card.html');
    await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 }).catch(() => {
      throw new Error('the card did not draw: ' + (errors.join('; ') || 'no error reported'));
    });
    let quality = 90, shot;
    do { shot = await page.screenshot({ type: 'jpeg', quality, scale: 'css' }); quality -= 5; } while (shot.length > MAX_BYTES && quality >= 50);
    fs.writeFileSync(OUT, shot);
    console.log(path.relative(process.cwd(), OUT), 'seed ' + SEED, Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
