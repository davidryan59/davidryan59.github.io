/* Renders the Pentrys film from stage.html. Canvas frames go straight to ffmpeg.
   node tools/pentrys-video/render.js --log           the event log and the odds shown
   node tools/pentrys-video/render.js --stills 3,7.5  single frames at those seconds
   node tools/pentrys-video/render.js --sheet         a contact sheet of 24 frames
   node tools/pentrys-video/render.js [out.mp4]       the film */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..', '..'), RENDERS = path.join(__dirname, 'renders');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const CHROME = process.env.CHROMIUM || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function serve() {
  const server = http.createServer((request, response) => {
    const url = decodeURIComponent(request.url.split(/[?#]/)[0]);
    fs.readFile(path.join(ROOT, url), (error, data) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(url)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    child.on('error', reject); child.on('close', code => code ? reject(new Error('ffmpeg failed')) : resolve());
    if (input) Promise.resolve(input(child.stdin)).catch(error => { child.kill(); reject(error); });
  });
}
(async () => {
  const args = process.argv.slice(2), server = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/tools/pentrys-video/stage.html');
    await page.waitForFunction(() => window.stageReady || window.stageError, null, { timeout: 60000 });
    const failed = await page.evaluate(() => window.stageError);
    if (failed) throw new Error(failed);
    const info = await page.evaluate(() => window.stageInfo);
    const started = Date.now();
    fs.mkdirSync(RENDERS, { recursive: true });
    const grab = number => page.evaluate(n => window.frame(n), number);
    if (args[0] === '--log') {
      const out = await page.evaluate(() => window.runLog());
      console.log(out.join('\n'));
    } else if (args[0] === '--stills' || args[0] === '--sheet') {
      const seconds = args[0] === '--sheet' ? Array.from({ length: 24 }, (_, i) => 0.02 + i * 1.3) : args[1].split(',').map(Number);
      const names = [];
      for (let i = 0; i < seconds.length; i++) {
        const number = Math.min(info.frames - 1, Math.round(seconds[i] * info.fps));
        const data = await page.evaluate(n => window.seek(n), number);
        const name = args[0] === '--sheet' ? 'sheet-' + String(i).padStart(2, '0') + '.jpg' : 't' + seconds[i].toFixed(2) + '.jpg';
        fs.writeFileSync(path.join(RENDERS, name), Buffer.from(data.split(',')[1], 'base64')); names.push(name);
      }
      if (args[0] === '--sheet') {
        await run(['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(RENDERS, 'sheet-%02d.jpg'),
          '-vf', 'scale=400:400,tile=6x4:padding=6:color=#000000', '-frames:v', '1', '-q:v', '3', path.join(RENDERS, 'sheet.jpg')]);
        console.log('renders/sheet.jpg');
      } else console.log(names.join('\n'));
    } else {
      const output = path.resolve(args[0] || path.join(RENDERS, 'pentrys-v1.mp4'));
      await run(['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(info.fps), '-i', '-',
        '-vf', 'scale=in_range=full:in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
        '-profile:v', 'high', '-g', String(2 * info.fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-movflags', '+faststart', '-an', output], async stdin => {
        for (let n = 0; n < info.frames; n++) {
          const data = await grab(n);
          if (!stdin.write(Buffer.from(data.split(',')[1], 'base64'))) await new Promise(resolve => stdin.once('drain', resolve));
          if (n % 120 === 0) console.log('frame ' + n + ' of ' + info.frames + ', ' + Math.round((Date.now() - started) / 1000) + ' s');
        }
        stdin.end();
      });
      console.log(path.relative(process.cwd(), output) + ': ' + info.frames + ' frames at ' + info.fps + ' fps');
    }
    if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
