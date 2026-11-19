/* Renders the site's social cards: the 1200 x 630 pictures that X,
   LinkedIn, WhatsApp and the like show when someone shares a page. Each
   page's og:image names one of them, in social/.

   Run from anywhere: node tools/social-cards/render.js [card ...]
   With no arguments it renders every card. It needs Playwright and its
   Chromium (npm install playwright, then npx playwright install chromium),
   and a network connection: the builder card shows the live Cross and Wing
   site, and the audit cards read the five audited contracts' bytecode from a
   public Ethereum RPC.

   Stage 1 draws the pictures the cards are made from into a temporary
   folder: the tiling tabs with their panels hidden, two patches built in
   the Tiling Puzzle, the Merge Fractals part way through their animation,
   the bytecode, and the builder card's pictures, which
   montage-candidates.js captures for the tiles in builder-layout.json.
   Stage 2 lays out each card in cards.html and saves a JPEG,
   at the best quality that stays under 300 KB, since WhatsApp shows no
   picture for anything larger. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { capture } = require('./montage-candidates');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('../tiling-video/node_modules/playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'social');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'social-cards-'));
const MAX_BYTES = 300 * 1024;
const CARDS = ['builder', 'hat', 'spectre', 'hat-extended', 'krinkle', 'puzzle', 'merge-fractals', 'moving-mondrian',
               'weth9', 'uniswap-v2', 'dai', 'permit2', 'cryptopunks', 'parfly', 'salary-loan', 'fractal'];
// Cards drawn from their own words and diagram, with no picture from stage 1.
const STANDALONE = ['parfly', 'salary-loan', 'fractal'];

// The tiling views, as each tab's address bar holds them. The four tabs
// with tile styles show Rich colours in Glow, each tile lit from its own
// random point, as chosen on 2026-10-31.
const TILINGS = {
  hat: '/app/tiles/hat/#v=0,0,14,0,0,0&c=rich&t=30&s=glow,1,0',
  spectre: '/app/tiles/spectre/#v=0,0,16,0&c=rich&e=curve&b=0.18&a=alt&p=waves%3A1&s=glow,1,0',
  'hat-extended': '/app/tiles/hat-extended/#v=0,0,34,0,0,0&c=rich&t=30&e=jigsaw&ha=0.22&hb=0.22&a=S&p=neck%3A0.55&s=glow,1,0',
  // The (3, 7, 22') tile. The centre of the fan sits right of the card's
  // panel, so the swirl shows.
  krinkle: '/app/tiles/krinkle/#v=-25,0,16,0&c=pastel&mk=3,7&t=2&o=1&a=fan&s=glow,1,0'
};
// The Tiling Puzzle's card shows a Hat patch and a Spectre patch, each built
// by four presses of Fill a ring, so its rings show in their colours.
const PUZZLES = { 'puzzle-hat': 'hat', 'puzzle-spectre': 'spectre' };
// Merge Fractals animate: every few seconds the two diamonds break into
// fractal shapes and back. Each is caught at a moment of seconds into its
// animation where the shapes are clearest.
const FRACTALS = { '1509': 17.5, '1904': 17.5, '2757': 11.5 };
// The audited contracts. Uniswap V2's card uses the USDC/WETH pair.
const CONTRACTS = {
  weth9: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'uniswap-v2': '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
  dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  cryptopunks: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB'
};
const RPC = 'https://ethereum-rpc.publicnode.com';

// A static server for the repo, with stage 1's pictures under /__cards/.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split(/[?#]/)[0]);
    let file = p.startsWith('/__cards/') ? path.join(TMP, p.slice(9)) : path.join(ROOT, p);
    if (file.endsWith(path.sep) || p.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function stageOne(browser, base, ids) {
  // The builder card: the pictures its layout's tiles use, into montage/.
  if (ids.includes('builder')) {
    const layout = JSON.parse(fs.readFileSync(path.join(__dirname, 'builder-layout.json'), 'utf8'));
    const want = layout.tiles.map(t => t.id).filter(id => id !== '__name');
    if (layout.name.style === 'glass') want.push(layout.name.backdrop);
    if (layout.name.style === 'photo') want.push('headshot');
    const got = await capture(want, path.join(TMP, 'montage'), true);
    const missing = want.filter(id => !got.some(m => m.id === id));
    if (missing.length) throw new Error('builder-layout.json names unknown pictures: ' + missing.join(', '));
  }
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  for (const [name, view] of Object.entries(TILINGS)) {
    // WebGL sometimes loses its context on the first load and draws a blank
    // page, which is under 50 KB. Draw again, up to three times.
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await ctx.newPage();
      await page.goto(base + view);
      await page.addStyleTag({ content: '.card { display: none !important; }' });
      await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(TMP, name + '.png') });
      await page.close();
      if (fs.statSync(path.join(TMP, name + '.png')).size > 50 * 1024) break;
    }
    console.log('drew ' + name + '.png', Math.round(fs.statSync(path.join(TMP, name + '.png')).size / 1024) + ' KB');
  }
  await ctx.close();
  if (ids.includes('puzzle')) {
    const board = await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 2 });
    for (const [name, piece] of Object.entries(PUZZLES)) {
      const page = await board.newPage();
      await page.goto(base + '/app/tiling-puzzle/#p=' + piece);
      await page.waitForFunction(() => window.TilingPuzzle && window.TilingPuzzle.ready(), null, { timeout: 60000 });
      for (let ring = 0; ring < 4; ring++) {
        await page.click('#fill-ring');
        await page.waitForFunction(() => !/Filling/.test(document.body.innerText), null, { timeout: 60000 });
      }
      await page.click('#home');
      await page.addStyleTag({ content: '.card, .bar { display: none !important; }' });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(TMP, name + '.png') });
      await page.close();
      console.log('drew ' + name + '.png');
    }
    await board.close();
  }
  // A run that asks only for tiling cards needs nothing from the network.
  if (ids.every(id => id in TILINGS || id === 'puzzle')) return;
  const art = await browser.newContext({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 2 });
  for (const [id, t] of Object.entries(FRACTALS)) {
    const page = await art.newPage();
    await page.goto(base + '/merge-fractals/merge-fractal-' + id + '.svg');
    await page.evaluate(t => { const svg = document.documentElement; svg.pauseAnimations(); svg.setCurrentTime(t); }, t);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(TMP, 'merge-fractal-' + id + '.png'), omitBackground: true });
    await page.close();
  }
  await art.close();
  for (const [name, address] of Object.entries(CONTRACTS)) {
    const res = await fetch(RPC, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] })
    });
    const code = (await res.json()).result;
    if (!code || code.length < 100) throw new Error('no bytecode for ' + name);
    fs.writeFileSync(path.join(TMP, name + '.txt'), code);
  }
}

async function stageTwo(browser, base, ids) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const page = await ctx.newPage();
    await page.goto(base + '/tools/social-cards/cards.html?card=' + id);
    // A picture that failed to load gets one more try before the run stops.
    for (let attempt = 0; ; attempt++) {
      await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
      const broken = await page.$eval('body', b => b.dataset.broken);
      if (!broken) break;
      if (attempt) throw new Error(id + ': pictures failed to load: ' + broken);
      await page.reload();
    }
    let quality = 90, shot;
    do { shot = await page.screenshot({ type: 'jpeg', quality }); quality -= 5; } while (shot.length > MAX_BYTES && quality >= 50);
    fs.writeFileSync(path.join(OUT, id + '.jpg'), shot);
    console.log('social/' + id + '.jpg', Math.round(shot.length / 1024) + ' KB, quality ' + (quality + 5));
    await page.close();
  }
  await ctx.close();
}

(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : CARDS;
  const server = await serve();
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    if (ids.some(id => !STANDALONE.includes(id))) await stageOne(browser, base, ids);
    await stageTwo(browser, base, ids);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})();
