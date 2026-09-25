/* Captures the tiling layer of the video from the real explorer pages.

   node capture.js probe                     test stills and the Spectre edge limits
   node capture.js shots list.json           test stills from a list of settings
   node capture.js hat [from to] [--resume]  Hat page frames into frames/hat/
   node capture.js spectre [from to] [--resume]

   Frames are overwritten, so a change to the look needs no delete. With
   --resume, frames already on disk are kept: use it after a crash.
   CHROMIUM, if set, names the Chromium binary to use.

   It serves the site repo locally. The served copy of the engine gets a
   small hook, window.__tm, so the script can place the camera exactly and
   wait until every chunk in view is drawn. The repo itself is not changed. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const T = require('./timeline.js');

const SITE = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROMIUM || undefined;
const OUT = path.join(__dirname, 'frames');
const CSS_SIZE = 540, DPR = 2;          // 1080 device pixels

// The look, tuned with the probe. S0 is the Hat's normal scale in CSS px per
// unit; the Spectre's is matched to the Hat's tile size at 45 degrees.
const LOOK = JSON.parse(fs.readFileSync(path.join(__dirname, 'look.json'), 'utf8'));

const HOOK = `
    window.__tm = {
      state: function () {
        return { ready: !!info, inFlight: inFlight.size, missing: window.__tmMissing, draws: window.__tmDraws || 0,
                 s: view.s, ab: ab.slice(), slope: slope, edge: (function () {
                   var c = cfg.shape.corners(); if (!c || c.length < 2) return null;
                   return Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]); })() };
      },
      // The camera at q, in the tiling's reference coordinates: for the Hat
      // the tiles under the screen stay put while the shape changes.
      setView: function (q, s, rotDeg) {
        var st = info.start;
        if (slope) {
          var dp = cmul(slope, q), dr = unzeta(q);
          view.P = [st.P[0] + dp[0], st.P[1] + dp[1]];
          view.R = [st.R[0] + dr[0], st.R[1] + dr[1]];
        } else {
          view.P = [st.P[0] + q[0] / ab[0], st.P[1] + q[1] / ab[0]];
          view.R = st.R.slice();
        }
        view.s = s;
        view.rot = rotDeg * Math.PI / 180;
        requestDraw();
      },
      // World displacement per unit of q, as a complex factor.
      worldPerQ: function () { return slope ? [ab[0] * slope[0] + ab[1], ab[0] * slope[1]] : [ab[0], 0]; },
      setCustom: function (gid, list) { customs[gid] = list; sel = 'custom:' + gid; requestDraw(); },
      redraw: requestDraw
    };
    return map;`;

function patch(src) {
  const a = 'statusEl.hidden = missing === 0;';
  const b = '    return map;\n  }\n\n  global.TilingMap';
  if (!src.includes(a) || !src.includes(b)) throw new Error('map.js changed: hook points not found');
  return src.replace(a, a + ' window.__tmMissing = missing; window.__tmDraws = (window.__tmDraws || 0) + 1;')
            .replace(b, HOOK + '\n  }\n\n  global.TilingMap');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split(/[?#]/)[0]);
    let file = path.join(SITE, p);
    if (p.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      if (p === '/demos/engine/map.js') data = Buffer.from(patch(data.toString()));
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function openPage(browser, base, url) {
  const ctx = await browser.newContext({ viewport: { width: CSS_SIZE, height: CSS_SIZE }, deviceScaleFactor: DPR, colorScheme: 'dark' });
  await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  page.on('crash', () => console.error('PAGE CRASH'));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('console:', m.text().slice(0, 300)); });
  await page.goto(base + url);
  await page.addStyleTag({ content: 'body > *:not(#map) { display: none !important; }' });
  await page.waitForFunction(() => window.__tm && window.__tm.state().ready, null, { timeout: 60000 });
  return page;
}

// Apply settings in one call: the address bar (as a visitor's link would),
// custom colours and the camera. Then wait until a draw has run since the
// change and nothing in view is missing. The draw count is read before the
// change, since the redraw can finish before a separate wait would start.
async function apply(page, o) {
  const ms = await page.evaluate(o => new Promise(resolve => {
    const t0 = performance.now(), d0 = window.__tm.state().draws;
    if (o.hash) {
      history.replaceState(null, '', '#' + o.hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    if (o.custom) window.__tm.setCustom(o.custom[0], o.custom[1]);
    if (o.view) window.__tm.setView(o.view[0], o.view[1], o.view[2]);
    window.__tm.redraw();
    (function check() {
      const s = window.__tm.state();
      if (s.draws > d0 && s.missing === 0 && s.inFlight === 0) resolve(performance.now() - t0);
      else if (performance.now() - t0 > 20000) resolve(-1);
      else requestAnimationFrame(check);
    })();
  }), o);
  if (ms < 0) console.error('warning: frame did not settle in 20 s', JSON.stringify(o).slice(0, 200));
}

/* ------------------------------------------------------------ the Hat */

// Seeded random numbers, so every run deals the same dice colours.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const hex2 = x => ('0' + Math.round(x).toString(16)).slice(-2);
const DICE = {
  rgb: ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00'],
  bw: ['#ffffff', '#000000'],
  greys: Array.from({ length: 8 }, (x, i) => { const h = hex2(255 * i / 7); return '#' + h + h + h; })
};
// The page's own dice method: a small palette dealt like a shuffled deck.
function diceColours(kind, n, seed) {
  const r = rng(seed);
  const shuffled = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (kind === 'any') return Array.from({ length: n }, () => '#' + hex2(r() * 255) + hex2(r() * 255) + hex2(r() * 255));
  let out = [];
  while (out.length < n) out = out.concat(shuffled(DICE[kind]));
  return shuffled(out.slice(0, n));
}

// The Hat camera drifts in q through every beat the Hat shows, from beat 53
// round the seam to beat 41. It is at rest from the seam through the opening
// pause, and eases to and from rest over RAMP beats, so the loop joins on a
// still frame. travel(u) is the distance covered u beats after starting from
// rest, in units of full speed times beats.
const RAMP = 2;
function travel(u) {
  if (u <= 0) return 0;
  if (u >= RAMP) return RAMP / 2 + (u - RAMP);
  return u / 2 - RAMP * Math.sin(Math.PI * u / RAMP) / (2 * Math.PI);
}
function hatTau(b) { return b >= 45 ? b - 60 : b; }
function hatState(b) {
  const tau = hatTau(b), c = T.colourAt(b);
  const k = tau >= 0 ? travel(tau - T.PAUSE) : -travel(-tau);
  const q = [LOOK.hat.q0[0] + LOOK.hat.drift[0] * k, LOOK.hat.q0[1] + LOOK.hat.drift[1] * k];
  return { deg: T.deg(b), colour: c.id, q, s: LOOK.hat.s0 * T.zoomAt(b), rot: LOOK.hat.rot };
}

async function applyHat(page, st) {
  const dice = st.colour.startsWith('dice:');
  const o = { hash: 't=' + st.deg.toFixed(6) + (dice ? '' : '&c=' + st.colour), view: [st.q, st.s, st.rot] };
  if (dice) { const kind = st.colour.slice(5); o.custom = ['turnhand', diceColours(kind, 12, LOOK.hat.diceSeeds[kind])]; }
  await apply(page, o);
}

/* -------------------------------------------------------- the Spectre */

function spectreState(b) {
  const e = T.edgeAt(b);
  const tau = b - 47;                  // the middle of the Spectre's time on screen
  const q = [LOOK.spectre.q0[0] + LOOK.spectre.drift[0] * tau, LOOK.spectre.q0[1] + LOOK.spectre.drift[1] * tau];
  let edges = 'e=line';
  if (e) {
    const key = e.shape + ':' + e.arrangement, peak = LOOK.spectre.peaks[key];
    const p = LOOK.spectre.params[e.shape];
    edges = 'e=' + e.shape + '&a=' + e.arrangement + '&b=' + (peak * e.amount).toFixed(5) + (p ? '&p=' + encodeURIComponent(p) : '');
  }
  return { edges, colour: LOOK.spectre.colour, q, s: LOOK.spectre.s0, rot: LOOK.spectre.rot };
}

async function applySpectre(page, st) {
  await apply(page, { hash: 'c=' + st.colour + '&' + st.edges, view: [st.q, st.s, st.rot] });
}

/* ---------------------------------------------------------------- run */

// A crashed page screenshots as a small grey icon on white, so a frame
// under this size is treated as a failure and taken again.
const MIN_BYTES = 30000;

async function capture(browser, base, which, from, to, resume) {
  const dir = path.join(OUT, which);
  fs.mkdirSync(dir, { recursive: true });
  const url = which === 'hat' ? '/demos/hat/' : '/demos/spectre/';
  let page = null;
  async function reopen() {
    if (page) await page.context().close().catch(() => {});
    page = await openPage(browser, base, url);
  }
  await reopen();
  const t0 = Date.now();
  let done = 0;
  for (let n = from; n < to; n++) {
    const b = T.beatOfFrame(n), mix = T.hatMix(b);
    if (which === 'hat' ? mix <= 0 : mix >= 1) continue;
    const file = path.join(dir, String(n).padStart(4, '0') + '.jpg');
    if (resume && fs.existsSync(file) && fs.statSync(file).size >= MIN_BYTES) continue;
    for (let attempt = 1; ; attempt++) {
      try {
        if (which === 'hat') await applyHat(page, hatState(b)); else await applySpectre(page, spectreState(b));
        const shot = await page.screenshot({ type: 'jpeg', quality: 94 });
        if (shot.length < MIN_BYTES) throw new Error('frame too small, ' + shot.length + ' bytes');
        fs.writeFileSync(file, shot);
        break;
      } catch (e) {
        console.error(which, 'frame', n, 'attempt', attempt, 'failed:', e.message.split('\n')[0]);
        if (attempt >= 4) throw e;
        await reopen();
      }
    }
    if (++done % 50 === 0) console.log(which, 'frame', n, ((Date.now() - t0) / done / 1000).toFixed(2) + ' s/frame');
  }
  console.log(which, 'done:', done, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}

async function probe(browser, base) {
  const dir = path.join(__dirname, 'probe');
  fs.mkdirSync(dir, { recursive: true });
  const hat = await openPage(browser, base, '/demos/hat/');
  const shot = async (page, name) => fs.writeFileSync(path.join(dir, name + '.jpg'), await page.screenshot({ type: 'jpeg', quality: 90 }));
  for (const b of LOOK.probe.hatBeats) {
    const t1 = Date.now();
    await applyHat(hat, hatState(b));
    console.log('hat beat', b, JSON.stringify(await hat.evaluate(() => window.__tm.state())), (Date.now() - t1) + ' ms');
    await shot(hat, 'hat-b' + b);
  }
  await apply(hat, { hash: 't=45' });
  const hatEdge45 = (await hat.evaluate(() => window.__tm.state())).edge;
  const sp = await openPage(browser, base, '/demos/spectre/');
  const specEdge = (await sp.evaluate(() => window.__tm.state())).edge;
  console.log('edge length: hat at 45 =', hatEdge45, ' spectre =', specEdge, ' so spectre s0 =', LOOK.hat.s0 * hatEdge45 / specEdge);
  for (const [shape, arr] of [['curve', 'S'], ['curve', 'alt'], ['triangle', 'S'], ['triangle', 'alt'], ['jigsaw', 'S'], ['jigsaw', 'alt']]) {
    const p = LOOK.spectre.params[shape];
    await apply(sp, { hash: 'e=' + shape + '&a=' + arr + '&b=0.1' + (p ? '&p=' + encodeURIComponent(p) : '') });
    await sp.waitForTimeout(700);
    console.log('limit', shape, arr, JSON.stringify(await sp.evaluate(() => document.getElementById('limit-note').textContent)));
  }
  for (const b of LOOK.probe.spectreBeats) {
    await applySpectre(sp, spectreState(b));
    await shot(sp, 'spectre-b' + b);
  }
}

// Arbitrary test stills: a JSON list of { name, page, hash, view, custom }.
async function shots(browser, base, list) {
  const dir = path.join(__dirname, 'probe'), pages = {};
  fs.mkdirSync(dir, { recursive: true });
  for (const sh of list) {
    if (!pages[sh.page]) pages[sh.page] = await openPage(browser, base, '/demos/' + sh.page + '/');
    await apply(pages[sh.page], sh);
    fs.writeFileSync(path.join(dir, sh.name + '.jpg'), await pages[sh.page].screenshot({ type: 'jpeg', quality: 90 }));
  }
}

(async () => {
  const args = process.argv.slice(2), resume = args.includes('--resume');
  const [mode, from, to] = args.filter(a => a !== '--resume');
  const server = await serve();
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, args: LOOK.chromeArgs });
  try {
    if (mode === 'probe') await probe(browser, base);
    else if (mode === 'shots') await shots(browser, base, JSON.parse(fs.readFileSync(from, 'utf8')));
    else if (mode === 'hat' || mode === 'spectre') await capture(browser, base, mode, +(from || 0), +(to || T.FRAMES), resume);
    else console.error('usage: node capture.js probe | shots list.json | hat|spectre [from to] [--resume]');
  } finally {
    await browser.close();
    server.close();
  }
})();
