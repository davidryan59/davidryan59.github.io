/* Renders the Rolling Shapes video: 1080 x 1080, 60 fps, 45 s, silent.

     node tools/roll-shapes-video/render.js [out.mp4]         by default renders/rolling-shapes-v1.mp4
     node tools/roll-shapes-video/render.js --sheet 1 2 3 ... numbered stills at these seconds, on one sheet

   It serves this repo locally and opens stage.html in headless Chromium, which draws
   each frame from its time alone with the app's own engine. It needs ffmpeg and the
   Playwright install in tools/tiling-video/. CHROMIUM names a browser binary. */
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');

const ROOT = path.join(__dirname, '..', '..'), RENDERS = path.join(__dirname, 'renders');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

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

(async () => {
  const args = process.argv.slice(2);
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
    await page.goto('http://localhost:' + server.address().port + '/tools/roll-shapes-video/stage.html');
    await page.waitForFunction(() => window.stageReady);
    const { frames, fps } = await page.evaluate(() => window.stageInfo);
    fs.mkdirSync(RENDERS, { recursive: true });
    const t0 = Date.now();
    if (args[0] === '--sheet') {
      const dir = path.join(RENDERS, 'stills');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const secs = args.slice(1).map(Number);
      for (const [i, s] of secs.entries()) {
        await page.evaluate(t => window.seconds(t), s);
        fs.writeFileSync(path.join(dir, String(i + 1).padStart(2, '0') + '.png'), await page.screenshot({ type: 'png' }));
      }
      console.log(secs.length + ' stills in renders/stills, ' + Math.round((Date.now() - t0) / 1000) + ' s');
    } else {
      const out = path.resolve(args[0] || path.join(RENDERS, 'rolling-shapes-v1.mp4'));
      await new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-',
          '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', String(2 * fps),
          '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
        p.on('close', code => code ? reject(new Error('ffmpeg failed')) : resolve());
        (async () => {
          for (let n = 0; n < frames; n++) {
            await page.evaluate(k => window.frame(k), n);
            if (!p.stdin.write(await page.screenshot({ type: 'png' }))) await new Promise(r => p.stdin.once('drain', r));
            if (n % 120 === 0) console.log('frame ' + n + ' of ' + frames + ', ' + Math.round((Date.now() - t0) / 1000) + ' s');
          }
          p.stdin.end();
        })().catch(reject);
      });
      console.log(path.relative(process.cwd(), out) + ': ' + frames + ' frames, ' + Math.round((Date.now() - t0) / 1000) + ' s');
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
