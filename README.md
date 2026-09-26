# davidryan59.github.io

David Ryan's GitHub Pages site, served at <https://drbuild.uk/>. The old
address, `davidryan59.github.io`, redirects there.

- `index.html` — the builder page: everything David has built and published,
  rendered from [docs/inventory.md](docs/inventory.md).
- `merge-fractals/`, `moving-mondrian/` — mint pages for the two NFT
  collections, both still mintable onchain. See
  [docs/mint-pages.md](docs/mint-pages.md).
- `mint.css`, `mint.js` — shared styling and mint logic for those pages.
- `demos/hat/`, `demos/spectre/`, `demos/hat-extended/` — map-style viewers
  for the Hat and Spectre tilings, and the Hat with curved edges, sharing the
  engine in `demos/engine/`. WebGL 2, no libraries. See
  [docs/tiling-demos.md](docs/tiling-demos.md).
- `aperiodic-pairs/` — a gallery of six two-tile aperiodic systems, each
  drawn in the browser from its definition. `data.js` holds the two
  datasets built by `tools/aperiodic-pairs/build_data.py`. See
  [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md).
- `papers/` — David's draft papers as PDFs. Each is built from its LaTeX
  source elsewhere and copied here.
- `social/` — the 1200 × 630 share cards that each page's `og:image` names.
  `node tools/social-cards/render.js` redraws them from the live pages; its
  header says what it needs.
- `thumbs/` — the animated pictures beside the builder page's entries, each
  drawn by a script in `tools/thumbnails/`. See its
  [README](tools/thumbnails/README.md).
- `smash/` — a device with a random picture and a hammer that breaks its
  screen: cracks, spreading black ink and lines of stuck pixels. Not yet
  linked from the builder page. See [docs/smash.md](docs/smash.md).
- `tiles/` — the short address drbuild.uk/tiles, which redirects to the Hat
  page.
- `tools/tiling-video/` — renders a 45-second looping video of the tiling
  explorer, with captions and a just-intonation soundtrack. See its
  [README](tools/tiling-video/README.md).

There is no build step. Edit the files here and push; GitHub Pages serves the
repo as it stands.

## Adding something to the builder page

[docs/inventory.md](docs/inventory.md) is the source list — every public item,
with its date, canonical link and whether that link still works. Add the entry
there first, then render it into `index.html`.

## Docs

- [docs/tiling-demos.md](docs/tiling-demos.md) — how the Hat and Spectre viewers work
- [docs/aperiodic-pairs.md](docs/aperiodic-pairs.md) — how each gallery tiling is generated and checked
- [docs/smash.md](docs/smash.md) — how the smash page breaks a screen, and what it costs to run
- [docs/hat-edge-research.md](docs/hat-edge-research.md) — why curved edges make the Hat two tiles, and how that was checked
- [docs/inventory.md](docs/inventory.md) — the source list the page renders
- [docs/mint-pages.md](docs/mint-pages.md) — how the two mint pages work
- [docs/roaming-diamond.md](docs/roaming-diamond.md) — a shelved intro-text
  animation, kept for the reasoning
