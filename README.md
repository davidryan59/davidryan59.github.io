# davidryan59.github.io

David Ryan's GitHub Pages site, served at <https://davidryan59.github.io/>.

- `index.html` — the builder page: everything David has built and published,
  rendered from [docs/inventory.md](docs/inventory.md).
- `merge-fractals/`, `moving-mondrian/` — mint pages for the two NFT
  collections, both still mintable onchain. See
  [docs/mint-pages.md](docs/mint-pages.md).
- `mint.css`, `mint.js` — shared styling and mint logic for those pages.

There is no build step. Edit the files here and push; GitHub Pages serves the
repo as it stands.

## Adding something to the builder page

[docs/inventory.md](docs/inventory.md) is the source list — every public item,
with its date, canonical link and whether that link still works. Add the entry
there first, then render it into `index.html`.

## Docs

- [docs/inventory.md](docs/inventory.md) — the source list the page renders
- [docs/mint-pages.md](docs/mint-pages.md) — how the two mint pages work
- [docs/roaming-diamond.md](docs/roaming-diamond.md) — a shelved intro-text
  animation, kept for the reasoning
