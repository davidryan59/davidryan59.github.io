/* Render the looping Krinkle explorer video from the real app page,
   app/tiles/krinkle/. See README.md. The version named in timeline.js
   names the outputs.

     node tools/krinkle-video/render.js                the video, renders/krinkle-<version>.mp4
     node tools/krinkle-video/render.js out.mp4        the video, to another file
     node tools/krinkle-video/render.js --sheet        a still every 3 s, on one sheet
     node tools/krinkle-video/render.js --stills 5,12  stills at chosen seconds

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

// The served copy of the map engine tells the stage when every tile in
// view is drawn. The repo's own file is not changed. The hook points are
// the ones tools/tiling-video/capture.js uses.
const HOOK = `
    window.__tm = {
      state: function () { return { ready: !!info, inFlight: inFlight.size, missing: window.__tmMissing, s: view.s }; },
      // The video's zoom glides set the zoom about the middle of the map,
      // and take over the app's own zoom after a change of tiling.
      setScale: function (s) { anim.zoomTo = null; zoomAbout(s / view.s, W / 2, Hh / 2); },
      takeZoom: function () { var z = anim.zoomTo; anim.zoomTo = null; return z; },
      busy: function () { return map.busy ? map.busy() : false; }
    };
    return map;`;
function patch(src) {
  const a = 'statusEl.hidden = missing === 0;';
  const b = '    return map;\n  }\n\n  global.TilingMap';
  if (!src.includes(a) || !src.includes(b)) throw new Error('map.js changed: hook points not found');
  return src.replace(a, a + ' window.__tmMissing = missing;').replace(b, HOOK + '\n  }\n\n  global.TilingMap');
}

function serve() {
  const server = http.createServer((request, response) => {
    let url = decodeURIComponent(request.url.split(/[?#]/)[0]);
    if (url.endsWith('/')) url += 'index.html';
    fs.readFile(path.join(ROOT, url), (error, data) => {
      if (error) { response.writeHead(404); response.end(); return; }
      if (url === '/app/tiles/engine/map.js') data = Buffer.from(patch(data.toString()));
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
  const seconds = sheet ? Array.from({ length:16 }, (_, i) => i * 3) : stills ? args[1].split(',').map(Number) : [];
  const wanted = new Map(seconds.map((s, i) => [Math.min(T.FRAMES - 1, Math.round(s * T.FPS)), i]));
  try {
    const context = await browser.newContext({ viewport:{ width:T.PAGE[0], height:T.PAGE[1] }, deviceScaleFactor:DPR,
      reducedMotion:'no-preference', colorScheme:'light' });
    await context.addInitScript(() => {
      try { localStorage.setItem('theme', 'light'); localStorage.setItem('krinkle-options-legend', 'closed'); } catch (e) {}
    });
    await context.addInitScript({ path:path.join(__dirname, 'clock.js') });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // The opening view is the home view zoomed in. A first page reads the
    // home zoom, and the filmed page opens at a multiple of it.
    const url = 'http://127.0.0.1:' + server.address().port + '/app/tiles/krinkle/';
    const probe = await context.newPage();
    await probe.goto(url);
    await probe.waitForFunction(() => window.__tm && window.__tm.state().ready);
    const home = await probe.evaluate(() => window.__tm.state().s);
    await probe.close();
    await page.goto(url + '#v=0,0,' + home * T.START_ZOOM + ',0&c=pastel&mk=3,7&t=2&o=1&a=fan');
    await page.addStyleTag({ path:path.join(__dirname, 'stage.css') });
    await page.addScriptTag({ path:path.join(__dirname, 'timeline.js') });
    await page.addScriptTag({ path:path.join(__dirname, 'stage.js') });
    await page.evaluate(() => window.video.ready);

    // Wait until the map has drawn every tile in view and no timer is
    // pending, running the app's frame again at the same time meanwhile.
    async function settle(label) {
      const t0 = Date.now();
      for (;;) {
        const why = await page.evaluate(() => window.video.settled());
        if (why === true) return;
        if (Date.now() - t0 > 30000) { errors.push(label + ': the map did not settle in 30 s: ' + why); return; }
        if (process.env.DEBUG && Date.now() - t0 > 2000) { console.log(label + ' waiting: ' + why); await page.waitForTimeout(500); }
        await page.waitForTimeout(8);
      }
    }

    // The pointer rests on its first target from before the first frame.
    const rest = await page.evaluate(() => window.video.rest());
    let mouse = { x:rest[0], y:rest[1], down:false };
    await page.mouse.move(mouse.x, mouse.y);
    await settle('the opening');

    const shot = () => page.screenshot({ type:'png', clip:{ x:T.CLIP[0], y:T.CLIP[1], width:T.CLIP[2], height:T.CLIP[3] } });
    async function step(frame) {
      const plan = await page.evaluate(n => window.video.plan(n), frame);
      // A change of tiling fades from a still of the frame before it, taken
      // before the click and without the video's own layer.
      if (plan.extra.some(e => e.change)) {
        await page.evaluate(() => document.body.classList.add('video-still'));
        const still = await shot();
        await page.evaluate(() => document.body.classList.remove('video-still'));
        await page.evaluate(([src, n]) => window.video.fade(src, n), ['data:image/png;base64,' + still.toString('base64'), frame]);
      }
      if (plan.x !== mouse.x || plan.y !== mouse.y) await page.mouse.move(plan.x, plan.y);
      if (plan.down !== mouse.down) await (plan.down ? page.mouse.down() : page.mouse.up());
      mouse = plan;
      for (const e of plan.extra) {
        if (e.select) await page.selectOption(e.select, e.value);
        if (e.fill) await page.fill(e.fill, e.value);
      }
      await page.evaluate(n => window.video.draw(n), frame);
      await settle('frame ' + frame);
    }

    const started = Date.now();
    let first = null;
    fs.mkdirSync(RENDERS, { recursive:true });
    if (sheet || stills) {
      for (let frame = 0; frame < T.FRAMES; frame++) {
        await step(frame);
        if (frame === 0) first = await shot();
        if (!wanted.has(frame)) continue;
        const i = wanted.get(frame);
        const name = sheet ? 'sheet-' + String(i).padStart(2, '0') + '.png' : 't' + seconds[i].toFixed(2) + '.png';
        fs.writeFileSync(path.join(RENDERS, name), await shot());
        console.log('renders/' + T.VERSION + '/' + name + '  ' + Math.round((Date.now() - started) / 1000) + ' s');
      }
      if (sheet) {
        await run('ffmpeg', ['-loglevel','error','-y','-framerate','1','-i',path.join(RENDERS,'sheet-%02d.png'),
          '-vf','scale=480:360,tile=4x4:padding=8:color=#e9e5dc','-frames:v','1','-q:v','3',path.join(RENDERS,'sheet.jpg')]);
        console.log('renders/' + T.VERSION + '/sheet.jpg');
      }
    } else {
      const output = path.resolve(args[0] || path.join(RENDERS, '..', 'krinkle-' + T.VERSION + '.mp4'));
      await run('ffmpeg', ['-loglevel','error','-y','-f','image2pipe','-c:v','png','-framerate',String(T.FPS),'-i','-',
        '-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
        '-profile:v','high','-g',String(2 * T.FPS),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
        '-movflags','+faststart',output], async stdin => {
        for (let frame = 0; frame < T.FRAMES; frame++) {
          await step(frame);
          const image = await shot();
          if (frame === 0) first = image;
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
    fs.writeFileSync(path.join(RENDERS, 'loop-first.png'), first);
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
    }, [first.toString('base64'), next.toString('base64')]);
    console.log('loop join: ' + (join.real + join.noise ? join.real + ' pixels differ by more than 8 levels, ' +
      join.noise + ' by 1 to 8' : 'the frame after the last is identical to the first'));
    if (join.real) errors.push('the loop join does not match');

    // Each click on its target, with the app's state just before it.
    const log = await page.evaluate(() => window.video.log);
    for (const entry of log) {
      const s = entry.state;
      console.log('beat ' + String(entry.beat).padEnd(7) + entry.click.padEnd(16) + s.scheme.padEnd(16) +
        ('zoom ' + s.scale).padEnd(13) + s.stage.padEnd(16) + s.readout.slice(0, 60));
      if (!entry.onTarget) errors.push('beat ' + entry.beat + ': the click missed ' + entry.click);
    }
    console.log('end state: ' + JSON.stringify(await page.evaluate(() => window.video.state())));
    if (errors.length) throw new Error('Problems:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error.message || error); process.exit(1); });
