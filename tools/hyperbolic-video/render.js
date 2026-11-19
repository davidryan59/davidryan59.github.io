/* Render the looping Hyperbolic Models Explorer video from the real app
   page, app/hyperbolic/. See README.md. The version named in timeline.js
   names the outputs.

     node tools/hyperbolic-video/render.js                the video, renders/hyperbolic-<version>.mp4
     node tools/hyperbolic-video/render.js out.mp4        the video, to another file
     node tools/hyperbolic-video/render.js --stills 5,12  stills at chosen seconds
     node tools/hyperbolic-video/render.js --review       the review page of numbered stills

   SHAPE=wide films 4:3 with the model card showing, and THEME=dark the
   dark theme; the defaults are square and light. The app's state on each
   frame depends on every frame before it, so stills are reached by running
   those frames too, without screenshots. A run that reaches the end checks
   the loop: it draws one frame past the end and compares it with the
   first. CHROMIUM can name a Chrome or Chromium binary. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('../tiling-video/node_modules/playwright-core');
const T = require('./timeline.js');

const ROOT = path.join(__dirname, '..', '..'), RENDERS = path.join(__dirname, 'renders', T.VERSION);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };

// The review page: the script's stills, and one moment in each shape and
// theme, for the open choices.
const REVIEW_STILLS = [0, 1.6, 3.6, 5.2, 7.25, 8.6, 10.2, 12.4, 14.0, 16.2, 17.8, 20.2, 21.8, 24.2, 25.8, 27.5, 29.7];
const OPTION_AT = 9.0;
const OPTIONS = [
  { id: 'A', shape: 'square', theme: 'light', name: 'Square, light', note: 'Recommended. Panels hidden; the captions name each model.' },
  { id: 'B', shape: 'square', theme: 'dark', name: 'Square, dark', note: 'Panels hidden, on the app’s dark background.' },
  { id: 'C', shape: 'wide', theme: 'light', name: '4:3, light', note: 'The model card shows; the pointer would click each model.' },
  { id: 'D', shape: 'wide', theme: 'dark', name: '4:3, dark', note: 'As C, in the dark theme.' }
];

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

// Open the app in one shape and theme, with the stage ready on frame 0.
async function film(browser, port, shape, theme, errors) {
  const size = T.SHAPES[shape];
  const context = await browser.newContext({ viewport:{ width:size[0], height:size[1] }, deviceScaleFactor:1080 / size[1],
    reducedMotion:'no-preference', colorScheme:theme });
  await context.addInitScript(t => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
  await context.addInitScript({ path:path.join(__dirname, 'clock.js') });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:' + port + '/app/hyperbolic/');
  await page.waitForFunction(() => window.Hyper);
  await page.evaluate(([s, t]) => document.body.classList.add('video-' + s, 'video-' + t), [shape, theme]);
  await page.addStyleTag({ path:path.join(__dirname, 'stage.css') });
  await page.addScriptTag({ path:path.join(__dirname, 'timeline.js') });
  await page.addScriptTag({ path:path.join(__dirname, 'stage.js') });
  await page.evaluate(() => window.video.ready);
  const rest = await page.evaluate(() => window.video.start());
  let mouse = { x:rest[0], y:rest[1], down:false };
  await page.mouse.move(mouse.x, mouse.y);

  const shot = () => page.screenshot({ type:'png' });
  async function step(frame) {
    const plan = await page.evaluate(n => window.video.plan(n), frame);
    // A change of model fades from a still of the frame before it, taken
    // without the video's own layer.
    if (plan.change) {
      await page.evaluate(() => document.body.classList.add('video-still'));
      const still = await shot();
      await page.evaluate(() => document.body.classList.remove('video-still'));
      await page.evaluate(src => window.video.fade(src), 'data:image/png;base64,' + still.toString('base64'));
    }
    if (plan.x !== mouse.x || plan.y !== mouse.y) await page.mouse.move(plan.x, plan.y);
    if (plan.down !== mouse.down) await (plan.down ? page.mouse.down() : page.mouse.up());
    mouse = plan;
    await page.evaluate(n => window.video.draw(n), frame);
  }
  return { page, shot, step, close: () => context.close() };
}

// The frame after the last must match the first. Differences of up to 8
// levels in 255 are raster noise.
async function checkLoop(f, first, errors) {
  await f.step(T.FRAMES);
  const next = await f.shot();
  fs.writeFileSync(path.join(RENDERS, 'loop-first.png'), first);
  fs.writeFileSync(path.join(RENDERS, 'loop-next.png'), next);
  const join = await f.page.evaluate(async images => {
    const pixels = async src => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const [a, b] = await Promise.all(images.map(pixels));
    let noise = 0, real = 0;
    for (let i = 0; i < a.length; i += 4) {
      const most = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (most > 8) real++; else if (most) noise++;
    }
    return { noise, real };
  }, [first.toString('base64'), next.toString('base64')]);
  console.log('loop join: ' + (join.real + join.noise ? join.real + ' pixels differ by more than 8 levels, ' +
    join.noise + ' by 1 to 8' : 'the frame after the last is identical to the first'));
  if (join.real) errors.push('the loop join does not match');
}

// Run the frames up to the last wanted second, saving a still at each.
async function stills(f, seconds, name, loop, errors) {
  const wanted = new Map(seconds.map((s, i) => [Math.min(T.FRAMES - 1, Math.round(s * T.FPS)), i]));
  const last = loop ? T.FRAMES - 1 : Math.max(...wanted.keys());
  let first = null;
  const started = Date.now();
  for (let frame = 0; frame <= last; frame++) {
    await f.step(frame);
    if (frame === 0) first = await f.shot();
    if (!wanted.has(frame)) continue;
    const i = wanted.get(frame), file = name(seconds[i], i);
    fs.writeFileSync(path.join(RENDERS, file), await f.shot());
    console.log('renders/' + T.VERSION + '/' + file + '  ' + Math.round((Date.now() - started) / 1000) + ' s');
  }
  if (loop) await checkLoop(f, first, errors);
}

function caption(t) {
  const c = T.CAPTIONS.filter(c => t >= c[0] && t <= c[1]).pop() || T.CAPTIONS.filter(c => t - T.SECONDS >= c[0]).pop();
  return c ? { main: c[2], sub: c[3] || '' } : { main: '', sub: '' };
}
function picture(t) {
  const names = { poincare:'Poincaré disk', klein:'Klein disk', halfplane:'Half-plane', band:'Band', inverted:'Inverted disk', joukowsky:'Joukowsky' };
  let model = 'poincare', changed = -1;
  T.CHANGES.forEach(c => { if (c[0] <= t) { model = c[1]; changed = c[0]; } });
  const parts = [names[model]];
  if (changed >= 0 && t < changed + T.FADE_CHANGE) parts.push('crossfading in');
  if (T.GLIDES.some(g => t >= g[0] && t < g[1])) parts.push('drifting');
  if (T.pressed(t)) parts.push('the pointer drags');
  if (changed === T.CHANGES[T.CHANGES.length - 1][0] && t < T.HOME_AT) parts.push('gliding home');
  if (t >= T.HOME_AT || (t < 0.25)) parts.push('still');
  return parts.join(', ');
}

function reviewPage() {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cell = (src, head, lines) => '<figure><img src="' + src + '" alt=""><figcaption><b>' + esc(head) + '</b>' +
    lines.map(l => '<span>' + esc(l) + '</span>').join('') + '</figcaption></figure>';
  const options = OPTIONS.map(o => cell('option-' + o.id + '.png', o.id + ' – ' + o.name, [o.note])).join('\n');
  const script = REVIEW_STILLS.map((t, i) => {
    const c = caption(t);
    return cell('still-' + String(i + 1).padStart(2, '0') + '.png', (i + 1) + ' · ' + t.toFixed(1) + ' s',
      [picture(t), c.main ? '“' + c.main + '”' + (c.sub ? ' / ' + c.sub : '') : 'No caption']);
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hyperbolic video stills ${T.VERSION}</title>
<style>
  :root { --bg:#f6f3ec; --text:#2a2722; --muted:#6d685c; --card:#fffdf8; --rule:#ddd8cc; }
  @media (prefers-color-scheme: dark) { :root { --bg:#16161a; --text:#ece8dd; --muted:#a29d91; --card:#202026; --rule:#3a3a3a; } }
  body { margin:0; padding:20px 16px 48px; background:var(--bg); color:var(--text); font:15px/1.4 Georgia, serif; }
  h1 { font-size:24px; margin:0 0 4px; } h2 { font-size:19px; margin:28px 0 8px; } p { margin:0 0 10px; color:var(--muted); max-width:72ch; }
  .grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; }
  @media (max-width:800px) { .grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
  figure { margin:0; background:var(--card); border:1px solid var(--rule); border-radius:8px; overflow:hidden; }
  figure img { display:block; width:100%; height:auto; background:#000; }
  figcaption { padding:7px 10px 9px; display:flex; flex-direction:column; gap:2px; font-size:13.5px; }
  figcaption span { color:var(--muted); }
</style></head><body>
<h1>Hyperbolic Models Explorer video – stills ${T.VERSION}</h1>
<p>30 s silent loop. {7,3}, Many colours, shading 70%, edge width 2, Compass design Upright at 60%: the app’s defaults. Draft 2 of the stills, 2026-11-19.</p>
<h2>Shape and theme, at ${OPTION_AT.toFixed(1)} s</h2>
<div class="grid">
${options}
</div>
<h2>The script, in option A</h2>
<div class="grid">
${script}
</div>
</body></html>
`;
}

(async () => {
  const args = process.argv.slice(2), server = await serve(), browser = await launch(), errors = [];
  const port = server.address().port, started = Date.now();
  const shape = process.env.SHAPE || 'square', theme = process.env.THEME || 'light';
  fs.mkdirSync(RENDERS, { recursive:true });
  try {
    if (args[0] === '--review') {
      for (const o of OPTIONS) {
        const f = await film(browser, port, o.shape, o.theme, errors);
        if (o.id === 'A') {
          await stills(f, REVIEW_STILLS.concat([OPTION_AT]), (t, i) => i < REVIEW_STILLS.length ? 'still-' + String(i + 1).padStart(2, '0') + '.png' : 'option-A.png', true, errors);
        } else {
          await stills(f, [OPTION_AT], () => 'option-' + o.id + '.png', false, errors);
        }
        if (o.id === 'A') {
          for (const entry of await f.page.evaluate(() => window.video.log)) console.log(entry.t + ' s  ' + entry.before.model + ' -> ' + entry.model);
        }
        await f.close();
      }
      fs.writeFileSync(path.join(RENDERS, 'stills.html'), reviewPage());
      console.log('renders/' + T.VERSION + '/stills.html');
    } else if (args[0] === '--stills') {
      const f = await film(browser, port, shape, theme, errors);
      await stills(f, args[1].split(',').map(Number), t => shape + '-' + theme + '-t' + t.toFixed(2) + '.png', false, errors);
      await f.close();
    } else {
      const f = await film(browser, port, shape, theme, errors);
      const output = path.resolve(args[0] || path.join(RENDERS, '..', 'hyperbolic-' + T.VERSION + '.mp4'));
      let first = null;
      await run('ffmpeg', ['-loglevel','error','-y','-f','image2pipe','-c:v','png','-framerate',String(T.FPS),'-i','-',
        '-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p',
        '-profile:v','high','-g',String(2 * T.FPS),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
        '-movflags','+faststart',output], async stdin => {
        for (let frame = 0; frame < T.FRAMES; frame++) {
          await f.step(frame);
          const image = await f.shot();
          if (frame === 0) first = image;
          if (!stdin.write(image)) await new Promise(resolve => stdin.once('drain', resolve));
          if (frame % 30 === 0) process.stdout.write('\rframe ' + frame + ' of ' + T.FRAMES + ', ' + Math.round((Date.now() - started) / 1000) + ' s');
        }
        stdin.end();
      });
      console.log('\r' + path.relative(process.cwd(), output) + ': ' + T.FRAMES + ' frames at ' + T.FPS + ' fps');
      await checkLoop(f, first, errors);
      await f.close();
    }
    if (errors.length) throw new Error('Problems:\n' + errors.join('\n'));
    console.log('took ' + Math.round((Date.now() - started) / 1000) + ' s');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error.message || error); process.exit(1); });
