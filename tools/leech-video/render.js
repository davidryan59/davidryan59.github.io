/* Render the looping Leech explorer video from the real app page,
   app/leech/. See README.md. The version named in timeline.js names the
   outputs.

     node tools/leech-video/render.js                the video, renders/leech-<version>.mp4
     node tools/leech-video/render.js out.mp4        the video, to another file
     node tools/leech-video/render.js --stills 5,12  numbered stills at chosen seconds, on contact sheets

   The app's state on each frame depends on every frame before it, so stills
   are reached by running those frames too, without screenshots. Every run
   also checks the loop: it draws one frame past the end and compares it
   with the first. CHROMIUM can name a Chrome or Chromium binary. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');
const T = require('./timeline.js');

const ROOT = path.join(__dirname, '..', '..'), RENDERS = path.join(__dirname, 'renders', T.VERSION);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg' };
const DPR = 1080 / T.CLIP[3];
const SHEET = 12;         // stills on each contact sheet, 4 × 3

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
  const stills = args[0] === '--stills';
  const seconds = stills ? args[1].split(',').map(Number) : [];
  const wanted = new Map(seconds.map((s, i) => [Math.min(T.FRAMES - 1, Math.round(s * T.FPS)), i]));
  try {
    const context = await browser.newContext({ viewport:{ width:T.PAGE[0], height:T.PAGE[1] }, deviceScaleFactor:DPR,
      reducedMotion:'no-preference', colorScheme:'dark' });
    // The dark theme, and the details panel collapsed to its rail.
    await context.addInitScript(() => {
      try { localStorage.setItem('theme', 'dark'); localStorage.setItem('leech-details-open-wide', '0'); } catch (e) {}
    });
    await context.addInitScript({ path:path.join(__dirname, 'clock.js') });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/app/leech/' + T.HASH);
    await page.waitForFunction(() => window.__leechExplorer);
    await page.addStyleTag({ path:path.join(__dirname, 'stage.css') });
    await page.addScriptTag({ path:path.join(__dirname, 'timeline.js') });
    await page.addScriptTag({ path:path.join(__dirname, 'stage.js') });
    await page.evaluate(() => window.video.ready);

    // The pointer rests on its first target from before the first frame.
    const rest = await page.evaluate(() => window.video.rest());
    let mouse = { x:rest[0], y:rest[1], down:false };
    console.log('rest ' + rest.map(v => v.toFixed(3)).join(', '));
    await page.mouse.move(mouse.x, mouse.y);

    const shot = () => page.screenshot({ type:'png', clip:{ x:T.CLIP[0], y:T.CLIP[1], width:T.CLIP[2], height:T.CLIP[3] } });
    async function step(frame) {
      const plan = await page.evaluate(n => window.video.plan(n), frame);
      if (plan.x !== mouse.x || plan.y !== mouse.y) await page.mouse.move(plan.x, plan.y);
      if (plan.down !== mouse.down) await (plan.down ? page.mouse.down() : page.mouse.up());
      mouse = plan;
      await page.evaluate(n => window.video.draw(n), frame);
    }

    // The first frame, without the video's own layer, is the outro's still.
    async function first() {
      await step(0);
      await page.evaluate(() => document.body.classList.add('video-still'));
      const still = await shot();
      await page.evaluate(() => document.body.classList.remove('video-still'));
      await page.evaluate(src => window.video.outro(src), 'data:image/png;base64,' + still.toString('base64'));
      return shot();
    }

    const started = Date.now();
    let opening = null;
    fs.mkdirSync(RENDERS, { recursive:true });
    if (stills) {
      for (let frame = 0; frame < T.FRAMES; frame++) {
        if (frame === 0) opening = await first(); else await step(frame);
        if (!wanted.has(frame)) continue;
        const i = wanted.get(frame);
        const name = 's' + String(i + 1).padStart(2, '0') + '.png';
        fs.writeFileSync(path.join(RENDERS, name), frame === 0 ? opening : await shot());
        console.log('renders/' + T.VERSION + '/' + name + '  ' + seconds[i].toFixed(2) + ' s  ' + Math.round((Date.now() - started) / 1000) + ' s');
      }
      for (let sheet = 0; sheet * SHEET < seconds.length; sheet++) {
        const name = 'sheet-' + (sheet + 1) + '.jpg';
        await run('ffmpeg', ['-loglevel','error','-y','-framerate','1','-start_number',String(sheet * SHEET + 1),
          '-i',path.join(RENDERS,'s%02d.png'),'-vf','scale=640:480,tile=4x3:padding=8:color=#2a2d35',
          '-frames:v','1','-q:v','3',path.join(RENDERS,name)]);
        console.log('renders/' + T.VERSION + '/' + name);
      }
    } else {
      const output = path.resolve(args[0] || path.join(RENDERS, '..', 'leech-' + T.VERSION + '.mp4'));
      await run('ffmpeg', ['-loglevel','error','-y','-f','image2pipe','-c:v','png','-framerate',String(T.FPS),'-i','-',
        '-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
        '-profile:v','high','-g',String(2 * T.FPS),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
        '-movflags','+faststart',output], async stdin => {
        for (let frame = 0; frame < T.FRAMES; frame++) {
          const image = frame === 0 ? (opening = await first()) : (await step(frame), await shot());
          if (!stdin.write(image)) await new Promise(resolve => stdin.once('drain', resolve));
          if (frame % 30 === 0) process.stdout.write('\rframe ' + frame + ' of ' + T.FRAMES + ', ' + Math.round((Date.now() - started) / 1000) + ' s');
        }
        stdin.end();
      });
      console.log('\r' + path.relative(process.cwd(), output) + ': ' + T.FRAMES + ' frames at ' + T.FPS + ' fps');
    }

    // The loop: the frame after the last must match the first. Differences
    // of up to 8 levels in 255 are raster noise.
    await step(T.FRAMES);
    const next = await shot();
    console.log('end pointer ' + (await page.evaluate(() => window.video.point())).map(v => v.toFixed(3)).join(', '));
    fs.writeFileSync(path.join(RENDERS, 'loop-first.png'), opening);
    fs.writeFileSync(path.join(RENDERS, 'loop-next.png'), next);
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
    }, [opening.toString('base64'), next.toString('base64')]);
    console.log('loop join: ' + (join.real + join.noise ? join.real + ' pixels differ by more than 8 levels, ' +
      join.noise + ' by 1 to 8' : 'the frame after the last is identical to the first'));
    if (join.real) errors.push('the loop join does not match');

    // Each click on its target, with the app's state just before it.
    const log = await page.evaluate(() => window.video.log);
    for (const entry of log) {
      const s = entry.state;
      console.log(String(entry.time).padEnd(7) + entry.click.padEnd(13) + s.scene.padEnd(12) + s.colour.padEnd(8) +
        (s.window + 'D').padEnd(5) + ('octad ' + s.octad).padEnd(9) + s.renderer.padEnd(8) + s.status);
      if (!entry.onTarget) errors.push(entry.time + ' s: the click missed ' + entry.click);
    }
    console.log('end state: ' + JSON.stringify(await page.evaluate(() => window.video.state())));
    if (errors.length) throw new Error('Problems:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error.message || error); process.exit(1); });
