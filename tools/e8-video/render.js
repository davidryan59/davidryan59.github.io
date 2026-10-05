/* Render the 30-second E8 explorer film from stage.html. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');
const ROOT = path.join(__dirname, '..', '..'), STILLS = path.join(__dirname, 'stills');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };

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
async function launch() {
  const options = { args:['--force-color-profile=srgb', '--hide-scrollbars'] };
  if (process.env.CHROMIUM) options.executablePath = process.env.CHROMIUM;
  try { return await chromium.launch(options); }
  catch (error) { return chromium.launch({ ...options, channel:'chrome' }); }
}
function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio:[input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    process.on('error', reject); process.on('close', code => code ? reject(new Error(command + ' failed')) : resolve());
    if (input) Promise.resolve(input(process.stdin)).catch(error => { process.kill(); reject(error); });
  });
}

(async () => {
  const args = process.argv.slice(2), server = await serve(), browser = await launch(), errors = [];
  try {
    const page = await browser.newPage({ viewport:{ width:540, height:540 }, deviceScaleFactor:2 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/tools/e8-video/stage.html');
    await page.waitForFunction(() => window.stageReady);
    const info = await page.evaluate(() => window.stageInfo);
    const draw = number => page.evaluate(frame => window.frame(frame), number);
    const shot = () => page.screenshot({ type:'png' });
    const started = Date.now();
    if (args[0] === '--stills' || args[0] === '--sheet') {
      const seconds = args[0] === '--sheet' ? Array.from({ length:20 }, (_, i) => i * 1.5) : args[1].split(',').map(Number);
      const names = []; fs.mkdirSync(STILLS, { recursive:true });
      for (let i = 0; i < seconds.length; i++) {
        await draw(Math.min(info.frames - 1, Math.round(seconds[i] * info.fps)));
        const name = args[0] === '--sheet' ? 'sheet-' + String(i).padStart(2, '0') + '.png' : 't' + seconds[i].toFixed(2) + '.png';
        fs.writeFileSync(path.join(STILLS, name), await shot()); names.push(name);
      }
      if (args[0] === '--sheet') {
        await run('ffmpeg', ['-loglevel','error','-y','-framerate','1','-i',path.join(STILLS,'sheet-%02d.png'),
          '-vf','scale=360:360,tile=5x4:padding=8:color=#16161a','-frames:v','1','-q:v','3',path.join(STILLS,'sheet.jpg')]);
        console.log('stills/sheet.jpg');
      } else console.log(names.join('\n'));
    } else {
      const output = path.resolve(args[0] || path.join(__dirname, 'e8.mp4'));
      await run('ffmpeg', ['-loglevel','error','-y','-f','image2pipe','-c:v','png','-framerate',String(info.fps),'-i','-',
        '-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
        '-profile:v','high','-g',String(2 * info.fps),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
        '-movflags','+faststart',output], async stdin => {
        for (let frame = 0; frame < info.frames; frame++) {
          await draw(frame); if (!stdin.write(await shot())) await new Promise(resolve => stdin.once('drain', resolve));
          if (frame % 60 === 0) process.stdout.write('\rframe ' + frame + ' of ' + info.frames);
        }
        stdin.end();
      });
      console.log('\r' + path.relative(process.cwd(), output) + ': ' + info.frames + ' frames at ' + info.fps + ' fps');
    }
    if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
