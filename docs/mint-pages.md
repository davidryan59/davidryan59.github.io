# Mint pages for Merge Fractals and Moving Mondrian

**Built:** 2026-08-14 · **Status:** Live, confirmed with a real mint

## Summary

Both NFT collections are still mintable onchain, but neither had a working
mint site. mint.fun shut down, and the original Merge Fractals site at
`ethereum-merge-fractals.surge.sh` stopped resolving. This document records
what the two contracts actually do, why the old third-party listing broke, and
how the two replacement pages work.

The pages are deliberately small: plain HTML, one shared stylesheet, one shared
script, no framework and no build step. They match the hand-written style of
the index page and deploy through the same [deploy.sh](../deploy.sh).

## Implementation checklist

- [x] Read both contracts from source and verify every function against the
  live deployments
- [x] Shared `site/mint.css` and `site/mint.js`
- [x] `site/moving-mondrian/index.html`, fixed price, batch minting
- [x] `site/merge-fractals/index.html`, rising price read at click time
- [x] Wallet connection through EIP-6963
- [x] Holdings panel on both pages, rendering the onchain art
- [x] Linked from the Ethereum & NFTs section of the index page
- [x] Tested against both live chains and in a real browser
- [x] Confirmed with a real mint, 2026-08-19: David minted a Moving Mondrian
  through MetaMask, connect through to success message
- [ ] WalletConnect, so mobile wallets can mint by scanning a QR code

## The contracts

Everything below was read from the live chains on 2026-08-14, not from the
repo source. That matters, because the Moving Mondrian source in GitHub is
stale: it shows a mint limit of 200, while the deployed contract has been
raised to 100,000.

### Merge Fractals

| Item | Detail |
|---|---|
| Address | [0xCeaAb19BaB4AdBc831b98A4Cf54A6A85A79218a4](https://etherscan.io/address/0xCeaAb19BaB4AdBc831b98A4Cf54A6A85A79218a4) |
| Chain | Ethereum mainnet |
| Supply | 3,386 minted of 5,875 |
| Price | 0.001 ETH at the start, rising 0.0002 ETH every 50 pieces. 0.0144 ETH as of 2026-08-14 |
| Mint call | `mintItem()`, payable, one piece per call, no batch |
| Enumeration | Yes, the OpenZeppelin 3.x `ERC721` of the day included it |
| Proceeds | Forwarded to a fixed recipient during the mint, so nothing accumulates in the contract |

### Moving Mondrian

| Item | Detail |
|---|---|
| Address | [0x423021c7ab37a289e47c3f39f3978bd14fd580b4](https://optimistic.etherscan.io/address/0x423021c7ab37a289e47c3f39f3978bd14fd580b4) |
| Chain | Optimism mainnet |
| Supply | 1,085 minted, limit raised onchain to 100,000 |
| Price | Fixed 0.0001 ETH, owner-adjustable through `updateMintCost` |
| Mint call | `mintBatch(uint256)`, payable, up to 50 per call |
| Enumeration | No. OpenZeppelin 4.x split it out, so there is no `totalSupply` or `tokenOfOwnerByIndex` |

Both contracts draw their art and traits entirely onchain, so the pages need
no image hosting and no metadata server.

## Why mint.fun broke

Merge Fractals checks the payment for exact equality:

```solidity
require(msg.value == getPriceNext(), "NEED TO SEND ETH");
```

The price climbs every 50 mints, so any site holding a cached price eventually
sends the wrong amount and every mint reverts. A third-party aggregator that
stores one price per contract cannot track that.

The fix is small, because `getPriceNext()` is a public view function. The page
reads it inside the click handler, immediately before building the
transaction, and sends exactly what it returns. A price that moves between the
read and the confirmation still fails, so the page catches that revert, reads
the price again and tells the visitor to press mint once more. Nothing is lost
beyond gas.

The window is narrow. The price only steps as the token id crosses a multiple
of 50, so most mints are nowhere near a boundary. The page shows how many
pieces remain at the current price, which comes from the same arithmetic the
contract uses.

## How the pages work

- **Reads** go to public RPC endpoints, so the collection state is visible
  before anyone connects a wallet. Each page carries four endpoints and falls
  through them in turn, promoting whichever one answered. Every endpoint was
  checked from a browser origin for both a working `eth_call` and a permissive
  CORS header. `1rpc.io` was dropped for refusing browser origins, and
  `rpc.flashbots.net` for not serving `eth_call`.
- **Wallets** are discovered through EIP-6963, so MetaMask, Rabby, Coinbase
  Wallet and Frame each appear as their own button instead of competing for
  `window.ethereum`. A wallet older than the standard is picked up by a
  `window.ethereum` fallback.
- **Chain switching** uses `wallet_switchEthereumChain`, falling back to
  `wallet_addEthereumChain` when the wallet answers 4902.
- **Holdings** differ by contract. Merge Fractals supports enumeration, so the
  ids come from `tokenOfOwnerByIndex`. Moving Mondrian does not, so the page
  calls `balanceOf` first, which answers the common case of owning none, and
  only a real holder pays for an `ownerOf` sweep. Both routes batch through
  [Multicall3](https://www.multicall3.com), which is at the same address on
  each chain.
- **Art** comes from `tokenURI`, which returns base64 JSON wrapping a base64
  SVG. Each piece is tens of kilobytes, so the gallery loads twelve at a time
  behind a "Show more" button.
- **Function selectors** are hard-coded next to the signatures they came from,
  which keeps a keccak implementation out of the browser. Each one was checked
  against the live contract before being written down.
- **The success message** names the exact token id, e.g. "Minted. Your new NFT
  with id 1086 is below, and on Optimistic Etherscan: …". The id comes from the
  transaction receipt's `Transfer` event, not from a mint count read before and
  after, which could be thrown off by someone else's mint landing in the same
  block. A batch mint reports the range, "ids 1086–1088". If a receipt ever
  arrives with no decodable log, the message falls back to plainer wording
  rather than showing a wrong id.
- **The holdings list sorts newest id first.** A piece just minted always
  carries the highest id, so it appears at the top of the list on the same
  reload that already runs after every successful mint. No separate
  "just minted" case was needed.
- **Moving Mondrian's page states where the money goes**: proceeds are split
  evenly between the artist and Protocol Guild, to support Ethereum core
  development. The beneficiary address was checked onchain before writing
  that: its bytecode delegates to the exact implementation address that
  0xSplits' `SplitMain` contract itself reports as `walletImplementation()`,
  confirming it is a genuine Splits wallet rather than a plain address. The
  exact percentages are David's own record, not something read from chain.
  Merge Fractals has no equivalent line, since it pays a single fixed
  recipient rather than a split.

Two bugs turned up only once real browser testing started, both fixed in
`mint.css` / `mint.js` rather than the page markup:

- `.btn { display: inline-block }` outranked the browser's own `[hidden]`
  rule, so a hidden button (the "Show more" gallery control, in particular)
  stayed visible. Fixed with `[hidden] { display: none !important; }`.
- The EIP-6963 wallet-discovery callback only fired when a wallet was found,
  so a visitor with no extension installed saw an empty list and no
  explanation instead of the "install a wallet" notice. Fixed to always call
  back after the discovery window, whether or not anything was found.

## Testing

Open `site/index.html` straight from disk and click through. That works
because every internal link names `index.html` in full, rather than relying on
a directory URL. A browser reading `file://` has no server to resolve
`merge-fractals/` into `merge-fractals/index.html`, so it lists the folder
instead. The explicit form behaves the same way on disk and on GitHub Pages,
and the tidy URL still works for anyone who types or shares
`davidryan59.github.io/merge-fractals/`.

The RPC reads work from `file://` as well, since the chosen endpoints send
`Access-Control-Allow-Origin: *`, which allows a file origin.

For a test that matches production exactly, serve the folder over HTTP:

```sh
cd projects/david-builder-site/site && python3 -m http.server 8899
```

What was checked on 2026-08-14:

- The ABI coder and the Multicall3 encoder, against both live chains. The
  Mondrian owner sweep returned all 1,085 owners and 26 distinct holders,
  matching an independent reference implementation.
- The price step, cross-checked against the contract's own `getPriceById`:
  0.0144 ETH holds to token 3400 and becomes 0.0146 at 3401.
- Both mint calls, simulated with `eth_call` and a balance override. Correct
  amounts succeed. Amounts one wei out revert with the contract's own message.
- Both pages in headless Chromium, light and dark, desktop and 390px mobile.
  No console errors and no horizontal overflow.
- Connect, holdings and mint, driven through a stand-in EIP-6963 wallet. The
  transaction the page builds was compared field by field against the expected
  target, calldata and value.
- The success-message wording and the newest-first sort, added 2026-08-19:
  unit tests on the id-extraction and wording logic, plus a browser check of
  the holdings order against David's real holdings (23 Merge Fractals, 528
  Moving Mondrians at the time).

On 2026-08-19, David minted a real Moving Mondrian through MetaMask in a live
browser, the one path the automated tests could not cover. That surfaced the
last real bug: MetaMask does not inject into `file://` pages unless a
per-extension setting is turned on, which read as "wallet not found" until
David switched to testing over `http://localhost` instead.

## Open questions

- Whether to add a custom domain. The pages use relative links throughout, so
  a domain change breaks nothing except the two absolute `og:` URLs in each
  head.
- Merge Fractals now costs 0.0144 ETH per piece and keeps climbing. That is
  worth a decision before promoting the page widely.
