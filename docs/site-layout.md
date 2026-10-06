# Site layout and addresses

## Summary

GitHub Pages serves each file at the address of its path, so the folders are
the addresses. Moving a file changes a link that may already sit in a paper, a
store listing or a post. This document says how the repo is filed, which
addresses other people hold, and how a redirect keeps an old address alive.
`tools/check-addresses/check.js` tests every address listed here.

## How the repo is filed

```
index.html                       the builder page
app/<name>/                      one folder for each app a visitor can run
    e8/  noble/  nonrup/  tiles/  aperiodic-pairs/  smash/  sieve/  pentrys/  parfly/
assets/                          files the pages share
    site.css  theme.js           the document pages: audits, guides, gallery, Smash Screen, sieve, Pentrys, 404
    mint.css  mint.js            the two mint pages
    david-headshot.jpg  thumbs/  the builder page's pictures
audits/  papers/                 published reports and papers
guides/<name>/                   one folder for each written guide
merge-fractals/  moving-mondrian/   mint pages, each with its own artwork
social/                          the share cards that each page's og:image names
redirects/                       one page for each short or old address
404.html                         the page shown for an address with no page
_config.yml                      tells GitHub Pages to leave docs/ and tools/ out
docs/  tools/                    for people who work on the repo; not published
favicon.svg  favicon-32.png  apple-touch-icon.png   browsers look for these at the root
```

## Rules

- **Everything a visitor runs is an app.** It lives in `app/<name>/` and is
  served at `drbuild.uk/app/<name>/`, whether or not an app store lists it.
  The folder name is the app's name in lower case. The site has no `demos/`
  folder.
- **A page reaches shared files by relative path.** From
  `app/tiles/hat/index.html` the theme script is `../../../assets/theme.js`.
- **A short or old address is one file in `redirects/`.** The app keeps one
  real address.
- **An app's privacy policy is `app/<name>/privacy.html`,** served at
  `drbuild.uk/app/<name>/privacy`. Parfly is the exception. Its policy was
  published before the move, so a `permalink` keeps it at `/parfly/privacy`.
- **A file with front matter is a template.** GitHub Pages reads any file that
  starts with a `---` block as a Jekyll page, and Jekyll acts on `{{` and `{%`
  in it. Keep those two strings out of such files. A file without front matter
  is copied as it is.
- **The build is GitHub Pages' own.** Nothing here needs a build step.

## Addresses that must keep working

| Address | Who holds it | Where it lives |
|---|---|---|
| `/` | Profile links on GitHub, LinkedIn, ORCID, X and Facebook | `index.html` |
| `/parfly/privacy` | The Parfly store listing. No redirect: a store reads it directly | `app/parfly/privacy.html`, with a `permalink` |
| `/moving-mondrian/?token=N` | The `external_url` of every token, recorded onchain. It cannot change once the contract owner gives up ownership | `moving-mondrian/index.html` |
| `/merge-fractals/` | Links to the mint page | `merge-fractals/index.html` |
| `/audits/weth9/`, `/audits/uniswap-v2/`, `/audits/dai/`, `/audits/permit2/` | Posts and CVs that cite an audit | `audits/<name>/index.html` |
| `/guides/salary-loan/` | Posts that link the guide | `guides/salary-loan/index.html` |
| `/papers/polygonal-spectre.pdf`, `/papers/undecanope.pdf` | Posts about each paper. Always the newest draft | `papers/` |
| `/papers/polygonal-spectre/`, `/papers/undecanope/` | The paper pages, which carry the share cards. Share these | `papers/<name>/index.html` |
| `/papers/<name>/draft-<n>.pdf` | Each draft, kept as it was published | `papers/<name>/` |
| `/e8` | A short address for the E8 Root System Explorer | `redirects/e8.html` |
| `/noble` | The Noble Polyhedra video and other shared links | `redirects/noble.html` |
| `/nonrup` | A short address for the Non-Rupert Polyhedra Explorer | `redirects/nonrup.html` |
| `/tiles` | The paper, and the corner label of the tiling video | `redirects/tiles.html` |
| `/demos/hat/`, `/demos/spectre/`, `/demos/hat-extended/` | Shared links to the explorer, each with its settings after the `#`. The `index.html` form of each is a link too | `redirects/demos-*.html` |
| `/aperiodic-pairs/` | The builder page's first link to the gallery | `redirects/aperiodic-pairs.html` |
| `/smash` | A short address to share. The first address, `/smash/`, also works | `redirects/smash.html` |
| `/sieve` | A short address to share | `redirects/sieve.html` |
| `/pentrys` | A short address to share | `redirects/pentrys.html` |
| `/social/*.jpg` | Share cards that social sites have cached. An image cannot redirect, so these stay put | `social/` |
| `/app/e8/`, `/app/noble/`, `/app/nonrup/`, `/app/tiles/`, `/app/tiles/hat/`, `/app/tiles/spectre/`, `/app/tiles/hat-extended/`, `/app/aperiodic-pairs/`, `/app/smash/`, `/app/sieve/`, `/app/pentrys/`, `/app/parfly/` | The real addresses of the apps. Apple's listing for Parfly takes `/app/parfly/` as its support address | `app/` |

`tools/check-addresses/addresses.json` holds this list in a form the checker
reads. Add an address there when you publish one.

## How a redirect works

GitHub Pages has no server redirects, so a redirect is a small page. Each file
in `redirects/` starts with front matter:

```
---
layout: none
permalink: /tiles/
---
```

`permalink` makes Jekyll write the page at that address, whichever folder the
file sits in. `layout: none` stops the site wrapping it in a theme. The page
then sends the visitor on in three ways:

- a script, `location.replace(target + location.hash)`, which keeps the
  settings after the `#` (the explorer stores its view there);
- a `<meta http-equiv="refresh">` tag, for a browser without scripts;
- a `<link rel="canonical">`, so search engines list the real address.

The page also carries the app's `og:` and `twitter:` tags. A social site that
does not follow redirects then still shows the app's share card.

`app/tiles/index.html` is the one redirect that is a plain file, not a
permalink page, because it sits in the folder it serves.

## Adding an app

1. Make `app/<name>/index.html`. Reach `favicon.svg` and `assets/` by relative
   path, and set `og:url` and `og:image` to the real address and a card.
   Follow [screen-fit.md](screen-fit.md), and run `tools/screen-fit/check.js`
   until every size passes.
2. Draw the card into `social/` and add the address to `docs/inventory.md`
   and `index.html`.
3. Add the address to `tools/check-addresses/addresses.json`.
4. If people will type or share a short address, add `redirects/<name>.html`
   with `permalink: /<name>/`.
5. Push, wait for GitHub Pages to build (about a minute), then run the
   checker.

## Publishing a paper

A PDF carries no share card, so a paper that people will share gets a page.
`papers/<name>/index.html` holds the title, the status, the abstract, the
list of drafts and the `og:` tags. Each draft lives at
`papers/<name>/draft-<n>.pdf` and never changes once published, as on arXiv.
`papers/<name>.pdf` is a copy of the newest draft, so one address always
gives the current version. To publish a new draft, add `draft-<n>.pdf`, copy
it over `papers/<name>.pdf`, add a row to the page's table, and redraw the
card with `tools/papers/card.js`. While a draft is still being finished, its
`draft-<n>.pdf` may be replaced; once the next draft is published it is
frozen.

The ancillary files of the Polygonal Spectre paper stay at
`papers/<file>.py`, the addresses the paper prints.

## Checking

```sh
node tools/check-addresses/check.js            # the live site, https://drbuild.uk
node tools/check-addresses/check.js <base-url>  # another base address
```

For each page it follows a redirect page once, checks the page it lands on,
and fetches every stylesheet, script and image that page names. A page marked
`direct` must answer with no redirect, and a page with a `source` must match
that file byte for byte. It also checks that `docs/` and `tools/` are not
published. It exits with 1 if anything fails.

A plain local server such as `python3 -m http.server` does not build the site
as GitHub Pages does. It shows neither the redirect pages nor the hidden
folders. Run the checker against the live site after every push.

## Notes

- `app/parfly/index.html` links the privacy policy as `/parfly/privacy`, its published address.
  A path from the folder, `privacy`, would point at `/app/parfly/privacy`, which does not exist.
- `papers/search-exceptional-tile.py` and `papers/verify-polygonal-spectre.py`
  are copies of the paper's ancillary files. They keep their original wording,
  including the old path `demos/spectre/tiling.js`, now `app/tiles/spectre/tiling.js`.
