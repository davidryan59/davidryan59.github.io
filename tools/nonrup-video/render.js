/* Render the 30-second Non-Rupert Polyhedra Explorer video from the real
   app page, app/nonrup/. See README.md.

     node tools/nonrup-video/render.js                the video, undecanope.mp4
     node tools/nonrup-video/render.js out.mp4        the video, to another file
     node tools/nonrup-video/render.js --sheet        a still every 1.5 s, on one sheet
     node tools/nonrup-video/render.js --stills 5,12  stills at chosen seconds

   The app's state on each frame depends on every frame before it, so stills
   are reached by running those frames too, without screenshots. Every run
   also checks the loop: it draws one frame past the end and compares it
   with the first. CHROMIUM can name a Chrome or Chromium binary. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');
const T = require('./timeline.js');

const ROOT = path.join(__dirname, '..', '..'), STILLS = path.join(__dirname, 'stills');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };

function serve() {
  const server = http.createServer((request, response) => {
    let url = decodeURIComponent(request.url.split(/[?#]/)[0]);
    if (url.endsWith('/')) url += 'index.html';
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
    const child = spawn(command, args, { stdio:[input ? 'pipe' : 'ignore', 'inherit', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => code ? reject(new Error(command + ' failed: ' + errors)) : resolve(errors));
    if (input) Promise.resolve(input(child.stdin)).catch(error => { child.kill(); reject(error); });
  });
}

(async () => {
  const args = process.argv.slice(2), server = await serve(), browser = await launch(), errors = [];
  const sheet = args[0] === '--sheet', stills = args[0] === '--stills';
  const seconds = sheet ? Array.from({ length:20 }, (_, i) => i * 1.5) : stills ? args[1].split(',').map(Number) : [];
  const wanted = new Map(seconds.map((s, i) => [Math.min(T.FRAMES - 1, Math.round(s * T.FPS)), i]));
  try {
    const context = await browser.newContext({ viewport:{ width:540, height:540 }, deviceScaleFactor:2,
      reducedMotion:'no-preference', colorScheme:'dark' });
    await context.addInitScript({ path:path.join(__dirname, 'clock.js') });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/nonrup/#c11');
    await page.addStyleTag({ path:path.join(__dirname, 'stage.css') });
    await page.addScriptTag({ path:path.join(__dirname, 'timeline.js') });
    await page.addScriptTag({ path:path.join(__dirname, 'stage.js') });
    await page.evaluate(() => window.video.ready);

    // The pointer rests in the 3D view from before the first frame, so
    // nothing on the first frame is still reacting to it arriving.
    let mouse = { x:T.REST[0], y:T.REST[1], down:false };
    await page.mouse.move(mouse.x, mouse.y);
    await page.evaluate(() => window.video.preroll());

    const shot = () => page.screenshot({ type:'png' });
    async function step(frame) {
      const plan = await page.evaluate(n => window.video.plan(n), frame);
      if (plan.x !== mouse.x || plan.y !== mouse.y) await page.mouse.move(plan.x, plan.y);
      if (plan.down !== mouse.down) await (plan.down ? page.mouse.down() : page.mouse.up());
      mouse = plan;
      await page.evaluate(n => window.video.draw(n), frame);
    }

    const started = Date.now();
    let first = null;
    fs.mkdirSync(STILLS, { recursive:true });
    if (sheet || stills) {
      for (let frame = 0; frame < T.FRAMES; frame++) {
        await step(frame);
        if (frame === 0) first = await shot();
        if (!wanted.has(frame)) continue;
        const i = wanted.get(frame);
        const name = sheet ? 'sheet-' + String(i).padStart(2, '0') + '.png' : 't' + seconds[i].toFixed(2) + '.png';
        fs.writeFileSync(path.join(STILLS, name), await shot());
        if (stills) console.log('stills/' + name);
      }
      if (sheet) {
        await run('ffmpeg', ['-loglevel','error','-y','-framerate','1','-i',path.join(STILLS,'sheet-%02d.png'),
          '-vf','scale=360:360,tile=5x4:padding=8:color=#050b14','-frames:v','1','-q:v','3',path.join(STILLS,'sheet.jpg')]);
        console.log('stills/sheet.jpg');
      }
    } else {
      const output = path.resolve(args[0] || path.join(__dirname, 'undecanope.mp4'));
      await run('ffmpeg', ['-loglevel','error','-y','-f','image2pipe','-c:v','png','-framerate',String(T.FPS),'-i','-',
        '-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
        '-profile:v','high','-g',String(2 * T.FPS),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
        '-movflags','+faststart',output], async stdin => {
        for (let frame = 0; frame < T.FRAMES; frame++) {
          await step(frame);
          const image = await shot();
          if (frame === 0) first = image;
          if (!stdin.write(image)) await new Promise(resolve => stdin.once('drain', resolve));
          if (frame % 60 === 0) process.stdout.write('\rframe ' + frame + ' of ' + T.FRAMES);
        }
        stdin.end();
      });
      console.log('\r' + path.relative(process.cwd(), output) + ': ' + T.FRAMES + ' frames at ' + T.FPS + ' fps');
    }

    // The loop: the frame after the last must match the first. Chrome's
    // raster sometimes dithers a gradient a level differently from one
    // screenshot to the next, so differences of up to 8 levels in 255 are
    // noise. Anything larger means the app's state differs at the join.
    await step(T.FRAMES);
    const next = await shot();
    fs.writeFileSync(path.join(STILLS, 'loop-first.png'), first);
    fs.writeFileSync(path.join(STILLS, 'loop-next.png'), next);
    const join = await page.evaluate(async images => {
      const pixels = async src => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + src;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [a, b] = await Promise.all(images.map(pixels));
      let noise = 0, real = 0;
      for (let i = 0; i < a.length; i += 4) {
        const most = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (most > 8) real++;
        else if (most) noise++;
      }
      return { noise, real };
    }, [first.toString('base64'), next.toString('base64')]);
    console.log('loop join: ' + (join.real + join.noise ? join.real + ' pixels differ by more than 8 levels, ' +
      join.noise + ' by 1 to 8' : 'the frame after the last is identical to the first'));
    if (join.real) errors.push('the loop join does not match');

    // What happened: each click on its target, and the app's state before
    // each click and at each drag.
    const log = await page.evaluate(() => window.video.log);
    for (const entry of log) {
      if (entry.click) { if (!entry.onTarget) errors.push('beat ' + entry.beat + ': the click missed ' + entry.click); continue; }
      if (entry.pushed) { console.log('beat ' + String(entry.beat).padEnd(6) + 'the copy ' + entry.pushed); continue; }
      const s = entry.state;
      console.log('beat ' + String(entry.beat).padEnd(6) + (entry.before ? 'before ' + entry.before : 'drag ' + entry.drag).padEnd(16) +
        (s.ratio + ' ' + s.verdict).padEnd(22) + (s.cursor ? '[cursor ' + s.cursor + '] ' : '') + s.hint);
      if (s.resetShown) errors.push('beat ' + entry.beat + ': the view moved, and Reset view is showing');
    }
    if (errors.length) throw new Error('Problems:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error.message || error); process.exit(1); });
