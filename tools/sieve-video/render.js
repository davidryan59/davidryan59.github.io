/* Renders the sieve video: 1080 x 1080, 60 fps, 30 s, silent.

     node tools/sieve-video/render.js [out.mp4]            the video, by default sieve.mp4 here
     node tools/sieve-video/render.js --stills 2.5,9,20    stills at these seconds, into stills/
     node tools/sieve-video/render.js --sheet              a still every 1.5 s, on one sheet: stills/sheet.jpg

   It serves this repo locally and opens stage.html in headless Chromium,
   which draws each frame on a clock this script sets. Each frame is
   screenshotted and piped to ffmpeg. The board's motion depends on the
   frames before it, so a still is reached by drawing every frame before it
   too, without screenshots.

   It needs ffmpeg, and Playwright with a Chromium. With only playwright-core
   installed, as in tools/tiling-video/, run it with
   NODE_PATH=tools/tiling-video/node_modules. CHROMIUM names a browser binary
   to use; without it the script tries Playwright's own, then Chrome. */
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }

const ROOT = path.join(__dirname, '..', '..');
const STILLS = path.join(__dirname, 'stills');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split(/[?#]/)[0]));
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function launch() {
  const opts = { args: ['--force-color-profile=srgb', '--hide-scrollbars'] };
  if (process.env.CHROMIUM) return chromium.launch({ ...opts, executablePath: process.env.CHROMIUM });
  try { return await chromium.launch(opts); } catch (e) { return chromium.launch({ ...opts, channel: 'chrome' }); }
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', code => code ? reject(new Error(cmd + ' failed')) : resolve());
    if (input) Promise.resolve(input(p.stdin)).catch(e => { p.kill(); reject(e); });
  });
}

(async () => {
  const args = process.argv.slice(2);
  const server = await serve();
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 540, height: 540 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
    page.on('console', m => console.log('page:', m.text()));
    await page.goto('http://localhost:' + server.address().port + '/tools/sieve-video/stage.html');
    await page.evaluate(() => window.stageReady);
    const { frames, fps } = await page.evaluate(() => window.stageInfo);
    // Playwright's own screenshot, since Chrome's raw one takes the window
    // at its own size and density, not the page's.
    const shot = () => page.screenshot({ type: 'png' });
    const draw = n => page.evaluate(k => window.frame(k), n);
    const t0 = Date.now();

    if (args[0] === '--stills' || args[0] === '--sheet') {
      const secs = args[0] === '--sheet' ? Array.from({ length: 20 }, (_, i) => i * 1.5) : args[1].split(',').map(Number);
      const want = new Map(secs.map((s, i) => [Math.min(frames - 1, Math.round(s * fps)), i]));
      const last = Math.max(...want.keys());
      fs.mkdirSync(STILLS, { recursive: true });
      const names = [];
      for (let n = 0; n <= last; n++) {
        await draw(n);
        if (!want.has(n)) continue;
        const name = args[0] === '--sheet' ? 'sheet-' + String(want.get(n)).padStart(2, '0') + '.png' : 't' + (n / fps).toFixed(2) + '.png';
        fs.writeFileSync(path.join(STILLS, name), await shot());
        names.push(name);
      }
      if (args[0] === '--sheet') {
        await run('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(STILLS, 'sheet-%02d.png'),
          '-vf', 'scale=360:360,tile=5x4:padding=8:color=white', '-frames:v', '1', '-q:v', '3', path.join(STILLS, 'sheet.jpg')]);
        console.log('stills/sheet.jpg: a still every 1.5 s, left to right');
      } else {
        console.log(names.map(n => 'stills/' + n).join('\n'));
      }
    } else {
      const out = path.resolve(args[0] || path.join(__dirname, 'sieve.mp4'));
      await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', String(2 * fps),
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out],
        async stdin => {
          for (let n = 0; n < frames; n++) {
            await draw(n);
            if (!stdin.write(await shot())) await new Promise(r => stdin.once('drain', r));
            if (n % 120 === 0) process.stdout.write('\rframe ' + n + ' of ' + frames);
          }
          stdin.end();
        });
      console.log('\r' + path.relative(process.cwd(), out) + ': ' + frames + ' frames at ' + fps + ' fps');
    }
    const pointed = await page.evaluate(() => window.stageInfo.pointed);
    console.log('pointed at a chosen number (beat, number):', JSON.stringify(pointed));
    console.log('took ' + Math.round((Date.now() - t0) / 1000) + ' s');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
