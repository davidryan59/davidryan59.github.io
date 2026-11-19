/* Captures the candidate pictures for the builder card's mosaic, for
   montage-designer.html to lay out by hand.

   Run from anywhere: node tools/social-cards/montage-candidates.js [id ...]
   With no arguments it captures every candidate. It needs Playwright and its
   Chromium, and a network connection for the live sites.

   Each picture is a full view of the app at 1200 x 800, so the designer can
   pan and zoom it to the part that reads best in a small tile. The pictures,
   and manifest.js listing them, go to renders/montage/, which git ignores.

   render.js calls capture() for the pictures the builder card's layout
   uses, into its own temporary folder. */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'renders', 'montage');
const CW = 'https://crossandwing.com';

// Explorer chrome to hide, from render.js.
const HIDE = {
  nonrup: `.topbar, footer, .shapes, .steps, .fit-panel, .scene-copy, .scene-tip, .view-reset { display: none !important; }
    body { display: block !important; }
    .stage, .play, .scene-card { position: absolute !important; inset: 0 !important; display: block !important; }`,
  e8: `.topbar, .control-panel, .details, .display-controls, .view-controls, .gesture-hint, .stage-status, .hover-card { display: none !important; }
    .workspace { position: absolute !important; inset: 0 !important; display: block !important; height: 800px !important; }
    .stage { position: absolute !important; inset: 0 !important; width: 1200px !important; height: 800px !important; }
    #viewer { inset: 0 !important; width: 1200px !important; height: 800px !important; }`,
  noble: `.topbar, .catalogue, .details, .display-controls, .face-controls, .render-controls, .view-controls, .gesture-hint { display: none !important; }
    .workspace { position: absolute !important; inset: 0 !important; display: block !important; height: 800px !important; }
    .stage { position: absolute !important; inset: 0 !important; width: 1200px !important; height: 800px !important; }
    #viewer { left: 0 !important; width: 1200px !important; }`
};

// group: 'client' for paid and product work, 'fun' for maths, art and games.
// url starting with / is served from this repo. theme sets localStorage.theme.
const CANDIDATES = [
  { id: 'cw-home', group: 'client', label: 'Cross and Wing – home', url: CW + '/' },
  { id: 'cw-books', group: 'client', label: 'Cross and Wing – book list', url: CW + '/books' },
  { id: 'cw-children', group: 'client', label: 'Cross and Wing – children’s books', url: CW + '/books?genres=Children' },
  { id: 'cw-bible', group: 'client', label: 'Cross and Wing – Bible tier', url: CW + '/books?tier=bible' },
  { id: 'cw-book', group: 'client', label: 'Cross and Wing – one book', url: CW + '/books', prep: firstBook },
  { id: 'cw-three', group: 'client', label: 'Cross and Wing – three classics', url: CW + '/books?tier=classic',
    prep: p => onlyBooks(p, ['pride-and-prejudice', 'alices-adventures-in-wonderland', 'great-expectations']) },
  { id: 'cw-authors', group: 'client', label: 'Cross and Wing – authors', url: CW + '/authors' },
  { id: 'cw-phone', group: 'client', label: 'Cross and Wing – phone', url: CW + '/', viewport: { width: 390, height: 844 } },
  { id: 'nw-home', group: 'client', label: 'Northwind – home', url: '/app/northwind/#/', theme: 'light' },
  { id: 'nw-orders', group: 'client', label: 'Northwind – orders', url: '/app/northwind/#/orders', theme: 'light' },
  { id: 'nw-order', group: 'client', label: 'Northwind – one order', url: '/app/northwind/#/orders/10248', theme: 'light' },
  { id: 'nw-report', group: 'client', label: 'Northwind – sales by quarter', url: '/app/northwind/#/reports/sales-by-period?period=quarter', theme: 'light' },
  { id: 'nw-category', group: 'client', label: 'Northwind – sales by category', url: '/app/northwind/#/reports/sales-by-category', theme: 'light' },
  { id: 'nw-products-dark', group: 'client', label: 'Northwind – products, dark', url: '/app/northwind/#/products', theme: 'dark' },
  { id: 'nw-phone', group: 'client', label: 'Northwind – phone', url: '/app/northwind/#/orders', theme: 'light', viewport: { width: 390, height: 844 } },
  { id: 'testimonial', group: 'client', label: 'Testimonials page', url: '/testimonials/', theme: 'light' },
  { id: 'audit-weth9', group: 'client', label: 'WETH9 audit', url: '/audits/weth9/', theme: 'light' },
  { id: 'audit-punks', group: 'client', label: 'CryptoPunks audit', url: '/audits/cryptopunks/', theme: 'light' },
  { id: 'traffic-sim', group: 'client', label: 'Traffic simulator', url: '/app/traffic-sim/', theme: 'dark' },
  { id: 'hat', group: 'fun', label: 'Hat tiling', url: '/app/tiles/hat/#v=0,0,14,0,0,0&c=rich&t=30&s=glow,1,0', css: '.card { display: none !important; }', wait: 5000 },
  { id: 'spectre', group: 'fun', label: 'Spectre tiling', url: '/app/tiles/spectre/#v=0,0,16,0&c=rich&e=curve&b=0.18&a=alt&p=waves%3A1&s=glow,1,0', css: '.card { display: none !important; }', wait: 5000 },
  { id: 'krinkle', group: 'fun', label: 'Krinkle tiling', url: '/app/tiles/krinkle/#v=-25,0,16,0&c=pastel&mk=3,7&t=2&o=1&a=fan&s=glow,1,0', css: '.card { display: none !important; }', wait: 5000 },
  { id: 'puzzle', group: 'fun', label: 'Tiling Puzzle', url: '/app/tiling-puzzle/#p=hat', prep: fillRings },
  { id: 'nonrup', group: 'fun', label: 'Nopert explorer', url: '/app/nonrup/#c11', theme: 'dark', css: HIDE.nonrup, prep: async p => { await p.click('#cut'); await p.waitForTimeout(700); await p.click('#push'); await p.waitForTimeout(2600); } },
  { id: 'e8', group: 'fun', label: 'E8 explorer', url: '/app/e8/#v=coxeter&s=coxeter&pause=1', theme: 'dark', css: HIDE.e8 },
  { id: 'noble', group: 'fun', label: 'Noble polyhedra', url: '/app/noble/#I-2', theme: 'dark', css: HIDE.noble, prep: async p => { await p.waitForFunction(() => document.getElementById('loading').hidden); await p.click('[data-spin="false"]'); } },
  // The Leech explorer's 36-fold view, its start view, with every control
  // hidden by the app's own H key.
  { id: 'leech', group: 'fun', label: 'Leech lattice, 36-fold', url: '/app/leech/', theme: 'dark', wait: 4000,
    prep: async p => { await p.waitForTimeout(3000); await p.click('#overlay'); await p.keyboard.press('h'); } },
  { id: 'sieve', group: 'fun', label: 'Sieve', url: '/app/sieve/', theme: 'dark', wait: 3000 },
  // Pentrys part way through a game: the well half full of 4- and 5-square
  // pieces, with the queue narrow beside it. See pentrysWell().
  { id: 'pentrys', group: 'fun', label: 'Pentrys, well half full', url: '/app/pentrys/', theme: 'dark', viewport: { width: 1200, height: 800 },
    scale: 2, prep: pentrysWell, clip: '#well, #next', wait: 250 },
  { id: 'roll-shapes', group: 'fun', label: 'Roll shapes', url: '/app/roll-shapes/', theme: 'dark', wait: 3000 },
  { id: 'aperiodic-pairs', group: 'fun', label: 'Aperiodic pairs', url: '/app/aperiodic-pairs/', theme: 'dark', wait: 3000 },
  { id: 'smash', group: 'fun', label: 'Smash', url: '/app/smash/', theme: 'dark', wait: 3000 },
  { id: 'fractal', group: 'fun', label: 'Fractal', url: '/app/fractal/', theme: 'dark', wait: 3000 },
  // Merge Fractal #1904, David's own. Its shapes change every second and its
  // background turns slowly, so the loop never quite repeats: these are ten
  // moments that each look different. The SVG is 400 px, drawn here at 2x.
  ...[0, 1, 4, 5, 8, 12, 13, 17.5, 20, 23].map(t => ({
    id: 'mf1904-' + String(t).replace('.', '-') + 's', group: 'fun', label: 'Merge Fractal 1904 at ' + t + ' s',
    url: '/merge-fractals/merge-fractal-1904.svg', viewport: { width: 400, height: 400 }, scale: 2, png: true,
    prep: p => p.evaluate(t => { const s = document.documentElement; s.pauseAnimations(); s.setCurrentTime(t); }, t)
  })),
  // dice-to-seed's thumbnail is an 11 s loop: dice tumble for about 2 s, then
  // sit until about 6.5 s. Each still freezes every animation at one moment.
  ...[0.4, 0.8, 1.3, 3].map(t => ({
    id: 'dice-' + String(t).replace('.', '-') + 's', group: 'client', label: 'dice-to-seed at ' + t + ' s',
    url: '/assets/thumbs/dice-to-seed.svg', viewport: { width: 800, height: 800 },
    prep: p => p.evaluate(t => {
      const svg = document.documentElement; svg.setAttribute('width', 800); svg.setAttribute('height', 800);
      document.getAnimations().forEach(a => { a.pause(); a.currentTime = t * 1000; });
    }, t)
  })),
  { id: 'mondrian', group: 'fun', label: 'Moving Mondrian 951', url: '/moving-mondrian/moving-mondrian-951.svg', viewport: { width: 800, height: 800 }, png: true },
  { id: 'undecanope', group: 'fun', label: 'Undecanope paper', url: '/papers/undecanope/', theme: 'light' },
  { id: 'dino-dash', group: 'fun', label: 'Dino Dash', url: 'https://pacman-dino-dash.netlify.app', wait: 2000 },
  { id: 'retuner', group: 'fun', label: 'ReTuner', url: 'https://re-tuner.web.app/', wait: 2000 }
];
// Cross and Wing covers, from the shelf in the cross-wing repo: the seven the
// builder page's animated thumbnail cycles through, each a still of its own.
const SHELF = path.join(process.env.HOME, 'code/projects/cross-wing/content/seed/covers/shelf');
const COVERS = [['two-doors', 'Two Doors'], ['the-holy-bible-world-english-bible', 'Holy Bible (WEB)'], ['anna-karenina', 'Anna Karenina'],
  ['the-princess-and-the-goblin', 'The Princess and the Goblin'], ['wuthering-heights', 'Wuthering Heights'], ['orthodoxy', 'Orthodoxy'], ['ivanhoe', 'Ivanhoe']];
// Static pictures, copied as they are. A relative path is from this repo.
const THUMBS = [
  ['cw-mark', 'client', 'Cross and Wing mark', path.join(process.env.HOME, 'code/projects/cross-wing/apps/web/public/mark-dark.svg')],
  ...COVERS.map(([slug, title]) => ['cover-' + slug, 'client', 'Cover – ' + title, path.join(SHELF, slug + '.jpg')]),
  ['harmony', 'fun', 'Harmony', 'assets/thumbs/harmony-dark.svg'],
  ['polygonal-spectre', 'fun', 'Polygonal Spectre paper', 'assets/thumbs/polygonal-spectre-dark.svg'],
  ['uniswap-curve', 'client', 'Uniswap V2 curve', 'assets/thumbs/uniswap-v2.svg'],
  ['salary-loan', 'client', 'Crypto salary guide', 'assets/thumbs/salary-loan.svg'],
  ['parfly', 'client', 'Parfly icon', 'tools/social-cards/parfly-icon.png'],
  ['headshot', 'client', 'David headshot', 'assets/david-headshot.jpg']
];

async function firstBook(p) {
  await p.waitForSelector('a[href^="/books/"]', { timeout: 30000 });
  await p.click('a[href^="/books/"]');
  await p.waitForLoadState('networkidle');
}
// Keeps only the named books on a Cross and Wing book list, in that order.
async function onlyBooks(p, slugs) {
  await p.waitForSelector('a[href^="/books/"]', { timeout: 30000 });
  await p.waitForTimeout(1500);
  const found = await p.evaluate(slugs => {
    const links = [...document.querySelectorAll('a[href^="/books/"]')];
    // A book's card is the ancestor of its link that sits directly in the list.
    const cardOf = a => { let el = a; while (el.parentElement && el.parentElement.querySelectorAll('a[href^="/books/"]').length < 4) el = el.parentElement; return el; };
    const cards = [...new Set(links.map(cardOf))];
    const want = slugs.map(s => cards.find(c => c.querySelector('a[href="/books/' + s + '"]')));
    cards.forEach(c => { if (!want.includes(c)) c.style.display = 'none'; });
    want.forEach((c, i) => { if (c) c.style.order = i; });
    return want.filter(Boolean).length;
  }, slugs);
  if (found !== slugs.length) throw new Error('found ' + found + ' of ' + slugs.length + ' books');
}

// Fills the Pentrys menu's game with a stack half the well high, built from
// 4- and 5-square pieces by the game's own shapes. Each piece drops straight
// down to the place that leaves the fewest holes and the flattest top. One
// column stays open, so no row clears, as in a real game waiting for a long
// piece. The menu is then hidden and the well undimmed.
async function pentrysWell(p) {
  await p.waitForFunction(() => window.PentrysDebug && PentrysDebug.demo);
  await p.evaluate(() => {
    const P = Pentrys.Pieces, g = PentrysDebug.demo, H = g.grid.length, W = g.grid[0].length, GAP = W - 3;
    let seed = 1904; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const grid = g.grid.map(row => row.map(() => null));
    const fits = cells => cells.every(([x, y]) => x >= 0 && x < W && y >= 0 && y < H && !grid[y][x] && x !== GAP);
    const top = x => { for (let y = 0; y < H; y++) if (grid[y][x]) return y; return H; };
    let id = 1;
    while (true) {
      const heights = [...Array(W).keys()].filter(x => x !== GAP).map(x => H - top(x));
      if (Math.max(...heights) >= H / 2) break;
      const pool = rnd() < 0.7 ? P.BY_SIZE[5] : P.BY_SIZE[4], shape = pool[Math.floor(rnd() * pool.length)];
      let best = null;
      for (let o = 0; o < 8; o++) for (let bx = -4; bx < W + 4; bx++) {
        let b = 0; while (b < H * 2 && !P.cellsAt(shape, o, bx, b).every(([, y]) => y >= 0)) b++;
        if (!fits(P.cellsAt(shape, o, bx, b))) continue;
        while (fits(P.cellsAt(shape, o, bx, b + 1))) b++;
        const cells = P.cellsAt(shape, o, bx, b);
        cells.forEach(([x, y]) => { grid[y][x] = 1; });
        let holes = 0, bump = 0, maxH = 0, prev = null;
        for (let x = 0; x < W; x++) {
          if (x === GAP) continue;
          const t = top(x); maxH = Math.max(maxH, H - t);
          for (let y = t + 1; y < H; y++) if (!grid[y][x]) holes++;
          if (prev !== null) bump += Math.abs(t - prev); prev = t;
        }
        cells.forEach(([x, y]) => { grid[y][x] = null; });
        const score = holes * 10 + bump + maxH * 2 + rnd() * 0.5;
        if (!best || score < best.score) best = { score, cells };
      }
      if (!best) break;
      const pid = 'fill' + id++;
      best.cells.forEach(([x, y]) => { grid[y][x] = { id: pid, shape, v: 1 }; });
    }
    for (let y = 0; y < H; y++) g.grid[y] = grid[y];
    g.version = (g.version || 0) + 1;
    Pentrys.Draw.setDim(false);
    document.getElementById('screen').style.display = 'none';
  });
}
async function fillRings(p) {
  await p.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
  for (let ring = 0; ring < 4; ring++) {
    await p.click('#fill-ring');
    await p.waitForFunction(() => !/Filling/.test(document.body.innerText), null, { timeout: 60000 });
  }
  await p.click('#home');
  await p.addStyleTag({ content: '.card, .bar { display: none !important; }' });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain', '.wasm': 'application/wasm' };
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split(/[?#]/)[0]));
    if (req.url.split(/[?#]/)[0].endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

// Captures the named candidates (every one, if none are named) into out, and
// writes out/manifest.js. With strict, a capture that fails stops the run.
async function capture(only, out, strict) {
  const OUT = out;
  fs.mkdirSync(OUT, { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.js');
  const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^[^[]*/, '').replace(/;\s*$/, '')) : [];
  const done = new Map(old.map(m => [m.id, m]));
  for (const [id, group, label, file] of THUMBS) {
    if (only.length && !only.includes(id)) continue;
    const dest = id + path.extname(file);
    fs.copyFileSync(path.resolve(ROOT, file), path.join(OUT, dest));
    done.set(id, { id, group, label, file: dest });
  }
  const server = await serve();
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const c of CANDIDATES) {
      if (only.length && !only.includes(c.id)) continue;
      const viewport = c.viewport || { width: 1200, height: 800 };
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: c.scale || (viewport.width < 500 ? 2 : 1.5) });
      const page = await ctx.newPage();
      try {
        if (c.theme) await page.addInitScript(t => localStorage.setItem('theme', t), c.theme);
        await page.goto(c.url.startsWith('/') ? base + c.url : c.url, { waitUntil: 'networkidle', timeout: 60000 });
        if (c.prep) await c.prep(page);
        if (c.css) await page.addStyleTag({ content: c.css });
        await page.waitForTimeout(c.wait || 1500);
        // Art on a transparent ground goes to PNG, so a tile's own colour shows round it.
        const file = c.id + (c.png ? '.png' : '.jpg');
        const shot = c.png ? { path: path.join(OUT, file), omitBackground: true } : { path: path.join(OUT, file), type: 'jpeg', quality: 85 };
        // clip names elements: the shot frames all of them, with a small margin.
        if (c.clip) shot.clip = await page.evaluate(sel => {
          const rs = [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()), m = 12;
          const x = Math.min(...rs.map(r => r.left)) - m, y = Math.min(...rs.map(r => r.top)) - m;
          return { x, y, width: Math.max(...rs.map(r => r.right)) + m - x, height: Math.max(...rs.map(r => r.bottom)) + m - y };
        }, c.clip);
        await page.screenshot(shot);
        done.set(c.id, { id: c.id, group: c.group, label: c.label, file });
        console.log('captured', c.id);
      } catch (e) {
        if (strict) throw new Error(c.id + ': ' + e.message.split('\n')[0]);
        console.log('FAILED', c.id, e.message.split('\n')[0]);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const order = [...CANDIDATES.map(c => c.id), ...THUMBS.map(t => t[0])];
  const list = [...done.values()].filter(m => order.includes(m.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  fs.writeFileSync(manifestFile, 'window.MONTAGE = ' + JSON.stringify(list, null, 1) + ';\n');
  console.log(list.length + ' candidates in ' + path.relative(ROOT, OUT));
  return list;
}

module.exports = { capture };
if (require.main === module) capture(process.argv.slice(2), OUT).catch(e => { console.error(e); process.exit(1); });
