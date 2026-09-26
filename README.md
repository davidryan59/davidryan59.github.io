# davidryan59.github.io

David Ryan's GitHub Pages site, served at <https://drbuild.uk/>. The old
address, `davidryan59.github.io`, redirects there.

- `index.html` – the builder page: everything David has built and published,
  rendered from [docs/inventory.md](docs/inventory.md).
- `app/` – the apps a visitor can run, one folder each, served at
  `drbuild.uk/app/<name>/`.
  - `app/tiles/` – the tiling explorer: map-style viewers for the Hat and
    Spectre tilings, and the Hat with curved edges, sharing the engine in
    `app/tiles/engine/`. WebGL 2, no libraries. See
    [docs/tiling-explorer.md](docs/tiling-explorer.md).
  - `app/aperiodic-pairs/` – a gallery of six two-tile aperiodic systems, each
    drawn in the browser from its definition. `data.js` holds the two
    datasets built by `tools/aperiodic-pairs/build_data.py`. See
    [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md).
  - `app/smash/` – a device with a random picture and a hammer that breaks its
    screen: cracks, spreading black ink and lines of stuck pixels. See
    [docs/smash.md](docs/smash.md).
  - `app/parfly/` – the privacy policy of the Parfly Android app, served at
    `drbuild.uk/parfly/privacy`, where the app's store listing holds it.
- `merge-fractals/`, `moving-mondrian/` – mint pages for the two NFT
  collections, both still mintable onchain, each with its own artwork. See
  [docs/mint-pages.md](docs/mint-pages.md).
- `audits/` – three published security audits: WETH9, Uniswap V2 and DAI.
- `assets/` – files the pages share: `site.css` and `theme.js` for the
  document pages, `mint.css` and `mint.js` for the mint pages, the headshot,
  and `thumbs/`, the animated pictures beside the builder page's entries,
  each drawn by a script in `tools/thumbnails/`. See its
  [README](tools/thumbnails/README.md).
- `papers/` – David's draft papers as PDFs. Each is built from its LaTeX
  source elsewhere and copied here.
- `social/` – the 1200 × 630 share cards that each page's `og:image` names.
  `node tools/social-cards/render.js` redraws them from the live pages; its
  header says what it needs.
- `redirects/` – one page for each short or old address, sending the visitor
  to the app's current address: `drbuild.uk/tiles`, and the first addresses of
  the apps.
- `404.html` – the page GitHub Pages shows for an address with no page.
- `_config.yml` – keeps `docs/` and `tools/` off the site.
- `tools/` – scripts for people who work on the repo. `tools/check-addresses/`
  checks that every published address still works.
  `tools/tiling-video/` renders a 45-second looping video of the tiling
  explorer, with captions and a just-intonation soundtrack. See its
  [README](tools/tiling-video/README.md).

How the site is filed, and which addresses must never stop working, is in
[docs/site-layout.md](docs/site-layout.md).

There is no build step to run. Edit the files here and push. GitHub Pages
builds the site with its own Jekyll, which writes the pages in `redirects/` at
their addresses and leaves `docs/` and `tools/` out, and serves every other
file as it is. After a push, run `node tools/check-addresses/check.js`.

## Adding something to the builder page

[docs/inventory.md](docs/inventory.md) is the source list – every public item,
with its date, canonical link and whether that link still works. Add the entry
there first, then render it into `index.html`.

## Docs

- [docs/site-layout.md](docs/site-layout.md) – how the site is filed, and the addresses that must keep working
- [docs/tiling-explorer.md](docs/tiling-explorer.md) – how the Hat and Spectre viewers work
- [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md) – how each gallery tiling is generated and checked
- [docs/smash.md](docs/smash.md) – how the smash page breaks a screen, and what it costs to run
- [docs/hat-edge-research.md](docs/hat-edge-research.md) – why curved edges make the Hat two tiles, and how that was checked
- [docs/inventory.md](docs/inventory.md) – the source list the page renders
- [docs/mint-pages.md](docs/mint-pages.md) – how the two mint pages work
- [docs/roaming-diamond.md](docs/roaming-diamond.md) – a shelved intro-text
  animation, kept for the reasoning
