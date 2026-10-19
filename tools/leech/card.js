/* Draws social/leech.jpg from the real Leech lattice explorer.

   Run from the repository root:
     CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tools/leech/card.js
     node tools/leech/card.js --dark      a draft, renders/temp_leech_alt.jpg

   The card is E8 inside Leech with the E8 edges on, in the light theme. The
   dark draft is the 36-fold opening view in Shapes colour, the first frame
   of the promo video. It goes to renders/ until David chooses it. Both stay
   below 300 KB because some messaging apps reject larger previews.
   CHROMIUM can name a local Chrome or Chromium binary. */
'use strict';

const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const ROOT = path.join(__dirname, '..', '..');
const DARK = process.argv.includes('--dark');
const OUT = DARK ? path.join(__dirname, 'renders', 'temp_leech_alt.jpg') : path.join(ROOT, 'social', 'leech.jpg');
const LOOK = DARK ? {
  theme: 'dark', view: 'z=1.250&pan=1.650,0.000&s=1.10', page: '17,19,24', ink: '#f2f0ea', text: '#b9b6ad', accent: '#7aa6e0'
} : {
  theme: 'light', view: 'v=petrie&e=e8&z=1.250&pan=1.650,0.000&s=1.30', page: '246,243,236', ink: '#1a1a1a', text: '#4d4a43', accent: '#1552a1'
};
const MAX_BYTES = 300 * 1024;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const TAGLINE = 'A 24D sphere packing with 196,560 balls round one – John Leech, 1967';

function serve() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(request.url.split(/[?#]/)[0]);
    let file = path.join(ROOT, requestPath);
    if (requestPath.endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--force-color-profile=srgb', '--hide-scrollbars']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.addInitScript(theme => localStorage.setItem('theme', theme), LOOK.theme);
    // Hidden controls give a full-window stage. The pan moves the picture's centre right of the text.
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/leech/#ui=0&' + LOOK.view, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__leechExplorer);
    await page.addStyleTag({ content: `
      .show-controls { display: none !important; }
      .share-shade { position: fixed; inset: 0; z-index: 20; pointer-events: none;
        background: linear-gradient(90deg, rgba(${LOOK.page},.99) 0, rgba(${LOOK.page},.95) 34%, rgba(${LOOK.page},.4) 50%, transparent 66%); }
      .share-copy { position: fixed; left: 72px; top: 112px; z-index: 21; width: 500px; color: ${LOOK.ink};
        font-family: Georgia, "Times New Roman", serif; }
      .share-copy .eyebrow { margin-bottom: 17px; color: ${LOOK.accent}; font: 750 15px/1 ui-monospace, "SF Mono", Menlo, monospace;
        letter-spacing: .14em; text-transform: uppercase; }
      .share-copy h1 { margin: 0; font-size: 69px; font-weight: 400; line-height: .98; letter-spacing: -.025em; }
      .share-copy p { margin: 24px 0 0; max-width: 430px; color: ${LOOK.text}; font-size: 25px; line-height: 1.36; }
      .share-copy .site { margin-top: 30px; color: ${LOOK.accent}; font-size: 21px; }
    ` });
    await page.evaluate(tagline => {
      document.body.insertAdjacentHTML('beforeend', '<div class="share-shade"></div><div class="share-copy">' +
        '<div class="eyebrow">24D explorer</div><h1>Leech<br>lattice</h1>' +
        '<p>' + tagline + '</p><div class="site">drbuild.uk/leech</div></div>');
    }, TAGLINE);
    await page.mouse.move(1190, 620);
    await page.waitForTimeout(2800);
    let quality = 92, image;
    do { image = await page.screenshot({ type: 'jpeg', quality }); quality -= 4; }
    while (image.length > MAX_BYTES && quality >= 48);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, image);
    console.log(path.relative(ROOT, OUT) + ': ' + Math.round(image.length / 1024) + ' KB, quality ' + (quality + 4));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
