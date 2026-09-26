/* Checks that every address the site has published still works.

   Run from anywhere: node tools/check-addresses/check.js [base-url [list.json]]

   The base URL defaults to https://drbuild.uk. Run it after each push, once
   GitHub Pages has finished building. It reads addresses.json, the list that
   docs/site-layout.md describes. It needs Node 18 or later and no packages.

   For each page it follows a redirect page once, checks the page it lands on,
   then fetches every stylesheet, script and image that page names on the
   same site. A page marked "direct" must answer at once, with no redirect of
   any kind, because a store listing or a blockchain record holds its address.
   A page marked "stub" must be a redirect page that sends the visitor to the
   address named there and keeps the #settings in the link. A page with a
   "source" must match that file in this repo, byte for byte, once its front
   matter is removed. The exit code is 1 if anything fails. */
const fs = require('fs'), path = require('path');

const base = (process.argv[2] || 'https://drbuild.uk').replace(/\/+$/, '');
const list = JSON.parse(fs.readFileSync(process.argv[3] || path.join(__dirname, 'addresses.json'), 'utf8'));
const root = process.env.SITE_ROOT || path.join(__dirname, '..', '..');
let failures = 0, checked = 0;

function say(ok, what, why) {
  checked++;
  if (!ok) failures++;
  if (!ok || !process.env.QUIET) console.log((ok ? 'ok    ' : 'FAIL  ') + what + (ok || !why ? '' : '  (' + why + ')'));
}

// GET a URL and follow HTTP redirects by hand, so the number of hops is known.
async function get(url) {
  for (let hops = 0; hops < 6; hops++) {
    const res = await fetch(url, { redirect: 'manual' });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, url).href; continue; }
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, url, hops, body, text: body.toString('utf8') };
  }
  throw new Error('too many redirects from ' + url);
}

const redirectOf = html => (html.match(/<meta http-equiv="refresh" content="0; url=([^"]+)"/i) || [])[1];
const titleOf = html => (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';

// The stylesheets, scripts and images a page loads from this site.
function partsOf(html, pageUrl) {
  const found = new Set();
  const add = ref => {
    if (!ref || /^(data:|#|mailto:)/.test(ref)) return;
    const u = new URL(ref, pageUrl);
    u.hash = '';
    if (u.origin === new URL(base).origin) found.add(u.href);
  };
  for (const m of html.matchAll(/<(?:script|img)\b[^>]*?\bsrc="([^"]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*?\bhref="([^"]+)"/gi)) if (!/rel="canonical"/i.test(m[0])) add(m[1]);
  return [...found];
}

async function checkPage(entry) {
  const first = await get(base + entry.path);
  const target = first.status === 200 ? redirectOf(first.text) : undefined;
  if (entry.direct) {
    say(first.status === 200 && first.hops === 0 && !target, entry.path + ' answers directly',
        'status ' + first.status + ', ' + first.hops + ' redirects' + (target ? ', and it is a redirect page' : ''));
  }
  if (entry.stub) {
    const to = target && new URL(target, first.url).pathname;
    say(to === entry.stub && first.text.includes('location.hash'), entry.path + ' redirects to ' + entry.stub + ', keeping #settings',
        target ? 'it goes to ' + to : 'no redirect page found');
  }
  const landed = target ? await get(new URL(target, first.url).href) : first;
  const html = landed.status === 200 ? landed.text : '';
  say(landed.status === 200 && titleOf(html).includes(entry.title), entry.path + ' lands on "' + entry.title + '"',
      'status ' + landed.status + ', title "' + titleOf(html) + '"');
  if (entry.source) {
    const source = fs.readFileSync(path.join(root, entry.source), 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    say(landed.body.equals(Buffer.from(source)), entry.path + ' matches ' + entry.source,
        'the live page differs from the file: not built yet, or the build changed it');
  }
  for (const part of partsOf(html, landed.url)) {
    const r = await get(part);
    if (r.status !== 200) say(false, '  part of ' + entry.path + ': ' + part.replace(base, ''), 'status ' + r.status);
    else checked++;
  }
}

(async () => {
  console.log('Checking ' + base);
  for (const entry of list.pages) await checkPage(entry);
  for (const file of list.files) {
    const r = await get(base + file);
    say(r.status === 200, file, 'status ' + r.status);
  }
  for (const gone of list.absent) {
    const r = await get(base + gone);
    say(r.status === 404, gone + ' is not published', 'status ' + r.status);
  }
  console.log(failures ? failures + ' of ' + checked + ' checks FAILED' : 'All ' + checked + ' checks passed');
  process.exit(failures ? 1 : 0);
})();
