# davidryan59.github.io

David Ryan's GitHub Pages site, served at <https://drbuild.uk/>. The old
address, `davidryan59.github.io`, redirects there.

- `index.html` – the builder page: everything David has built and published,
  rendered from [docs/inventory.md](docs/inventory.md).
- `app/` – the apps a visitor can run, one folder each, served at
  `drbuild.uk/app/<name>/`.
  - `app/e8/` – a direct-manipulation explorer for all 240 roots and 6,720
    edges of E8. Rotate its 2D projection through eight dimensions or grab
    one root and pull the complete system. See [docs/e8-explorer.md](docs/e8-explorer.md).
  - `app/non-rupert/` – Through its own shadow: cut a solid's shadow out of a
    plate, then try to push a copy through it. Compares the Platonic solids,
    a buckyball and three cuboids with the C15 Noperthedron and an 88-vertex C11 solid. See [docs/non-rupert-candidates.md](docs/non-rupert-candidates.md).
  - `app/noble/` – a 3D explorer for the two infinite families and all 146
    exceptional noble polyhedra. Select any face, isolate its neighbours and
    combine solid, glass, X-ray, wire, exploded and cutaway views. See
    [docs/noble-polyhedra.md](docs/noble-polyhedra.md).
  - `app/tiles/` – the tiling explorer: map-style viewers for the Hat and
    Spectre tilings, and the Hat with curved edges, sharing the engine in
    `app/tiles/engine/`. WebGL 2, no libraries. See
    [docs/tiling-explorer.md](docs/tiling-explorer.md).
  - `app/aperiodic-pairs/` – a gallery of six two-tile aperiodic systems, each
    drawn in the browser from its definition. `data.js` holds the two
    datasets built by `tools/aperiodic-pairs/build_data.py`. See
    [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md).
  - `app/smash/` – Smash Screen, a game: break a device's screen with a hammer,
    a fish, a bomb and more, in Fun Mode or against the clock in Anger Mode. See
    [docs/smash.md](docs/smash.md).
  - `app/pentrys/` – Pentrys, a falling-block game with all 21 shapes of one
    to five squares, special squares worth 0, 2 or 3, a flood square, a queue
    that cycles, and a tutorial. See [docs/pentrys.md](docs/pentrys.md).
  - `app/sieve/` – the Sieve of Eratosthenes as a toy: choose any numbers as
    primes, and each colours its multiples, on a grid of any width, in bases
    from 2 to 60. See [docs/sieve.md](docs/sieve.md).
  - `app/parfly/` – a placeholder page for the Parfly Android app, and its
    privacy policy, which is served at `drbuild.uk/parfly/privacy`, where the
    app's store listing holds it.
- `merge-fractals/`, `moving-mondrian/` – mint pages for the two NFT
  collections, both still mintable onchain, each with its own artwork. See
  [docs/mint-pages.md](docs/mint-pages.md).
- `guides/` – written guides, one folder each. `guides/salary-loan/` explains how to
  save a salary as crypto and borrow stablecoins against it on Aave.
- `audits/` – four published security audits: WETH9, Uniswap V2, DAI and
  Permit2.
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
  checks that every published address still works. `tools/screen-fit/`
  checks that a game or app fills the screen at six window sizes, from a
  monitor to a phone held sideways; see [docs/screen-fit.md](docs/screen-fit.md).
  `tools/e8-video/` and `tools/noble-video/` render 30-second showcase films.
  `tools/tiling-video/` renders a 45-second looping video of the tiling
  explorer, with captions and a just-intonation soundtrack. See its
  [README](tools/tiling-video/README.md). `tools/sieve-video/` renders a
  30-second looping video of the sieve, with captions. See its
  [README](tools/sieve-video/README.md). `tools/pentrys/` holds Pentrys's
  tests and simulated player, run in Node, and the still frame and colour
  sheet the game's look was chosen from.

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
- [docs/e8-explorer.md](docs/e8-explorer.md) – the E8 roots, projection model, direct manipulation and structural views
- [docs/noble-polyhedra.md](docs/noble-polyhedra.md) – the 3D noble polyhedra explorer, model data and view controls
- [docs/non-rupert-candidates.md](docs/non-rupert-candidates.md) – the pass-through app, its pass ratio, push test and search
- [docs/screen-fit.md](docs/screen-fit.md) – how a game or app fills a monitor, a laptop, an iPad and a phone, and how to check it
- [docs/tiling-explorer.md](docs/tiling-explorer.md) – how the Hat and Spectre viewers work
- [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md) – how each gallery tiling is generated and checked
- [docs/smash.md](docs/smash.md) – the rules of Smash Screen, how a blow breaks a screen, and what it costs to run
- [docs/sieve.md](docs/sieve.md) – the rules of the sieve, how the grid is drawn, and why it stops at 10¹⁵
- [docs/sieve/original-prompt.md](docs/sieve/original-prompt.md) – the prompt that started the sieve, word for word
- [docs/pentrys.md](docs/pentrys.md) – the rules and look of Pentrys, how it is built and measured, and the games like it
- [docs/pentrys/original-prompt.md](docs/pentrys/original-prompt.md) – the messages that started Pentrys, word for word
- [docs/hat-edge-research.md](docs/hat-edge-research.md) – why curved edges make the Hat two tiles, and how that was checked
- [docs/inventory.md](docs/inventory.md) – the source list the page renders
- [docs/mint-pages.md](docs/mint-pages.md) – how the two mint pages work
- [docs/roaming-diamond.md](docs/roaming-diamond.md) – a shelved intro-text
  animation, kept for the reasoning
