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
- `social/` — the 1200 × 630 share cards that each page's `og:image` names.
  `node tools/social-cards/render.js` redraws them from the live pages; its
  header says what it needs.

There is no build step. Edit the files here and push; GitHub Pages serves the
repo as it stands.

## Adding something to the builder page

[docs/inventory.md](docs/inventory.md) is the source list — every public item,
with its date, canonical link and whether that link still works. Add the entry
there first, then render it into `index.html`.

## Docs

- [docs/tiling-demos.md](docs/tiling-demos.md) — how the Hat and Spectre viewers work
- [docs/hat-edge-research.md](docs/hat-edge-research.md) — why curved edges make the Hat two tiles, and how that was checked
- [docs/inventory.md](docs/inventory.md) — the source list the page renders
- [docs/mint-pages.md](docs/mint-pages.md) — how the two mint pages work
- [docs/roaming-diamond.md](docs/roaming-diamond.md) — a shelved intro-text
  animation, kept for the reasoning
