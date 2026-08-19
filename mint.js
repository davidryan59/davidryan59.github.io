/* Shared plumbing for the two mint pages: theme, RPC, ABI coding, wallet
   discovery and the token gallery. Each page supplies its own contract
   knowledge on top, because the two contracts differ enough that hiding the
   difference behind one abstraction would obscure both.

   No build step and no dependencies. Function selectors are hard-coded rather
   than derived, which keeps a keccak implementation out of the browser. Each
   one is written next to the signature it came from, and every selector used
   here was checked against the live contracts before being written down. */
(function (global) {
  'use strict';

  var Mint = {};

  /* Theme ------------------------------------------------------------- */
  /* Called from an inline script in <head>, before first paint, so the page
     never flashes the wrong theme. */
  Mint.initTheme = function () {
    try {
      var t = localStorage.getItem('theme');
      if (t !== 'light' && t !== 'dark') {
        t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.dataset.theme = t;
    } catch (e) {}
  };

  Mint.wireThemeToggle = function () {
    var root = document.documentElement;
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.hidden = false;
    function describe() {
      btn.title = 'Switch to ' + (root.dataset.theme === 'dark' ? 'light' : 'dark') + ' mode';
      btn.setAttribute('aria-label', btn.title);
    }
    describe();
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
      describe();
    });
  };

  /* RPC ---------------------------------------------------------------- */
  /* Free endpoints go down, rate-limit and occasionally return nonsense, so
     every read tries each URL in turn and only fails once all of them have.
     The working endpoint moves to the front, so later reads in the same visit
     skip the dead ones. */
  Mint.makeRpc = function (urls) {
    var order = urls.slice();

    async function send(method, params) {
      var lastErr = null;
      for (var i = 0; i < order.length; i++) {
        var url = order[i];
        try {
          var res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var body = await res.json();
          if (body.error) throw new Error(body.error.message || 'RPC error');
          if (body.result === undefined || body.result === null) throw new Error('empty result');
          if (i > 0) { order.splice(i, 1); order.unshift(url); }
          return body.result;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('every RPC endpoint failed');
    }

    return {
      send: send,
      call: function (to, data) {
        return send('eth_call', [{ to: to, data: data }, 'latest']);
      }
    };
  };

  /* ABI coding --------------------------------------------------------- */
  var A = {};

  A.uint = function (n) { return BigInt(n).toString(16).padStart(64, '0'); };
  A.address = function (a) { return a.toLowerCase().replace(/^0x/, '').padStart(64, '0'); };
  A.toBigInt = function (hex) { return BigInt(hex === '0x' || !hex ? '0x0' : hex); };
  A.toNumber = function (hex) { return Number(A.toBigInt(hex)); };
  A.toBool = function (hex) { return A.toBigInt(hex) !== 0n; };

  /* Last 20 bytes of a 32-byte word. */
  A.toAddress = function (hex) {
    return '0x' + hex.replace(/^0x/, '').slice(-40);
  };

  /* A dynamic string return: offset word, then length word, then the bytes.
     Decoded as UTF-8 rather than latin-1, since the token JSON can carry
     non-ASCII characters. */
  A.toString = function (hex) {
    var h = hex.replace(/^0x/, '');
    var off = Number(BigInt('0x' + h.slice(0, 64))) * 2;
    var len = Number(BigInt('0x' + h.slice(off, off + 64)));
    var body = h.slice(off + 64, off + 64 + len * 2);
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = parseInt(body.substr(i * 2, 2), 16);
    return new TextDecoder().decode(bytes);
  };

  Mint.abi = A;

  /* Multicall3 --------------------------------------------------------- */
  /* Canonical deployment, the same address on Ethereum and Optimism. It turns
     a per-token sweep into one request, which is what makes the holdings
     panel quick on a contract with no enumeration. */
  Mint.MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
  var AGGREGATE3 = '0x82ad56cb'; // aggregate3((address,bool,bytes)[])

  function encodeAggregate3(calls) {
    var blobs = calls.map(function (c) {
      var cd = c.data.replace(/^0x/, '');
      var b = A.address(c.target);
      b += (c.allowFailure ? '1' : '0').padStart(64, '0');
      b += (0x60).toString(16).padStart(64, '0'); // offset of the bytes inside this struct
      b += (cd.length / 2).toString(16).padStart(64, '0');
      b += cd.padEnd(Math.ceil(cd.length / 64) * 64, '0');
      return b;
    });
    var running = calls.length * 32;
    var offsets = blobs.map(function (b) {
      var at = running;
      running += b.length / 2;
      return at;
    });
    return AGGREGATE3 +
      (0x20).toString(16).padStart(64, '0') +
      calls.length.toString(16).padStart(64, '0') +
      offsets.map(function (o) { return o.toString(16).padStart(64, '0'); }).join('') +
      blobs.join('');
  }

  function decodeAggregate3(hex) {
    var h = hex.replace(/^0x/, '');
    var base = Number(BigInt('0x' + h.slice(0, 64))) * 2;
    var len = Number(BigInt('0x' + h.slice(base, base + 64)));
    var head = base + 64;
    var out = [];
    for (var i = 0; i < len; i++) {
      var off = Number(BigInt('0x' + h.slice(head + i * 64, head + (i + 1) * 64))) * 2;
      var s = head + off;
      var ok = BigInt('0x' + h.slice(s, s + 64)) === 1n;
      var bs = s + Number(BigInt('0x' + h.slice(s + 64, s + 128))) * 2;
      var bLen = Number(BigInt('0x' + h.slice(bs, bs + 64)));
      out.push({ success: ok, data: '0x' + h.slice(bs + 64, bs + 64 + bLen * 2) });
    }
    return out;
  }

  /* Chunked, because the calldata for a whole collection can outgrow what a
     free endpoint accepts in one POST. */
  Mint.multicall = async function (rpc, calls, chunkSize) {
    var size = chunkSize || 400;
    var results = [];
    for (var i = 0; i < calls.length; i += size) {
      var slice = calls.slice(i, i + size);
      var raw = await rpc.call(Mint.MULTICALL3, encodeAggregate3(slice));
      results = results.concat(decodeAggregate3(raw));
    }
    return results;
  };

  /* Formatting --------------------------------------------------------- */
  Mint.formatEth = function (wei, maxDp) {
    var dp = maxDp === undefined ? 6 : maxDp;
    var w = BigInt(wei);
    var whole = w / 1000000000000000000n;
    var frac = (w % 1000000000000000000n).toString().padStart(18, '0').slice(0, dp).replace(/0+$/, '');
    return frac ? whole + '.' + frac : String(whole);
  };

  Mint.formatCount = function (n) { return Number(n).toLocaleString('en-GB'); };

  Mint.shortAddress = function (a) {
    return a.slice(0, 6) + '…' + a.slice(-4);
  };

  /* Wallets ------------------------------------------------------------ */
  /* EIP-6963 lets every installed wallet announce itself, so MetaMask, Rabby,
     Coinbase Wallet and Frame all appear side by side instead of fighting over
     window.ethereum. A wallet that predates the standard is picked up by the
     window.ethereum fallback below. */
  Mint.discoverWallets = function (onChange) {
    var found = new Map();

    function announce(event) {
      var detail = event.detail;
      if (!detail || !detail.info || !detail.provider) return;
      found.set(detail.info.uuid, detail);
      onChange(Array.from(found.values()));
    }

    global.addEventListener('eip6963:announceProvider', announce);
    global.dispatchEvent(new Event('eip6963:requestProvider'));

    /* Give the announcements a moment, then fall back to window.ethereum for a
       wallet that predates the standard. This reports back even when nothing
       turned up, so a visitor with no wallet at all gets told so rather than
       being left looking at an empty list. */
    setTimeout(function () {
      if (found.size === 0 && global.ethereum) {
        found.set('injected', {
          info: { uuid: 'injected', name: 'Browser wallet', icon: '' },
          provider: global.ethereum
        });
      }
      onChange(Array.from(found.values()));
    }, 350);

    return function () { return Array.from(found.values()); };
  };

  /* Ask the wallet to move to the chain this page mints on. A wallet that has
     never seen the chain answers 4902, and then it needs the full definition
     before it can switch. */
  Mint.ensureChain = async function (provider, chain) {
    var current = await provider.request({ method: 'eth_chainId' });
    if (current.toLowerCase() === chain.chainId.toLowerCase()) return;
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chain.chainId }]
      });
    } catch (err) {
      if (err && (err.code === 4902 || (err.data && err.data.originalError && err.data.originalError.code === 4902))) {
        await provider.request({ method: 'wallet_addEthereumChain', params: [chain] });
        return;
      }
      throw err;
    }
  };

  /* Turns the wallet's error codes and the contract's revert strings into
     something a visitor can act on. */
  Mint.describeError = function (err) {
    if (!err) return 'Something went wrong.';
    var code = err.code;
    if (code === 4001 || code === 'ACTION_REJECTED') return 'You cancelled the transaction.';
    if (code === -32002) return 'Your wallet is already asking. Open it and finish the prompt.';
    var msg = (err.message || String(err));
    if (/NEED TO SEND ETH/i.test(msg)) {
      return 'The price moved while you were confirming. Reading it again, then try once more.';
    }
    if (/Failed to send mintCost/i.test(msg)) {
      return 'The amount sent did not match the price. Reading it again, then try once more.';
    }
    if (/MINT LIMIT REACHED/i.test(msg)) return 'Minting has finished, the whole collection is gone.';
    if (/mintLimit would be hit/i.test(msg)) return 'That many would pass the mint limit. Try a smaller number.';
    if (/insufficient funds/i.test(msg)) return 'That wallet does not hold enough ETH for the mint plus gas.';
    /* Wallet errors nest the useful sentence one or two levels down. */
    var inner = err.data && (err.data.message || (err.data.originalError && err.data.originalError.message));
    return inner || msg.split('\n')[0].slice(0, 200);
  };

  /* Poll for the receipt through the wallet, which is already pointed at the
     right chain, so this needs no second RPC list. */
  Mint.waitForReceipt = async function (provider, hash, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 300000);
    while (Date.now() < deadline) {
      var receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [hash]
      });
      if (receipt) return receipt;
      await new Promise(function (r) { setTimeout(r, 3000); });
    }
    return null;
  };

  /* Every log in a receipt was caused by that one transaction, so reading the
     Transfer events straight out of it gives the exact minted ids, rather
     than inferring them from a mint count that could race with someone
     else's mint landing in the same block. All three ERC721 Transfer
     arguments are indexed, so the topics array is [sig, from, to, tokenId]. */
  var TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  Mint.extractMintedIds = function (receipt, contract, minter) {
    if (!receipt || !receipt.logs) return [];
    var c = contract.toLowerCase();
    var m = minter.toLowerCase();
    var ids = [];
    receipt.logs.forEach(function (log) {
      if (log.address.toLowerCase() !== c) return;
      if (!log.topics || log.topics.length !== 4) return;
      if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return;
      if (A.toAddress(log.topics[2]).toLowerCase() !== m) return; // "to"
      ids.push(Number(A.toBigInt(log.topics[3])));
    });
    ids.sort(function (a, b) { return a - b; });
    return ids;
  };

  /* Wording for "your new NFT(s) with id(s) N" shared by both pages, so a
     single mint and a batch mint read consistently. Falls back to a plainer
     line if the receipt carried no decodable Transfer log. */
  Mint.describeMinted = function (ids) {
    if (!ids.length) return { text: 'Your new NFT is', ids: '' };
    if (ids.length === 1) return { text: 'Your new NFT with id ' + ids[0] + ' is', ids: String(ids[0]) };
    var contiguous = ids.every(function (id, i) { return i === 0 || id === ids[i - 1] + 1; });
    var idsText = contiguous ? (ids[0] + '–' + ids[ids.length - 1]) : ids.join(', ');
    return { text: 'Your new NFTs with ids ' + idsText + ' are', ids: idsText };
  };

  /* Token gallery ------------------------------------------------------ */
  var TOKEN_URI = '0xc87b56dd'; // tokenURI(uint256)

  Mint.tokenUriCall = function (id) { return TOKEN_URI + A.uint(id); };

  /* Both contracts return a base64 data URI wrapping JSON, whose image field
     is itself a base64 data URI wrapping SVG. Nothing is fetched off-chain. */
  Mint.parseTokenUri = function (uri) {
    var marker = 'base64,';
    var at = uri.indexOf(marker);
    if (at === -1) return null;
    try {
      var bin = atob(uri.slice(at + marker.length));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  };

  /* Each token's art is tens of kilobytes, so they are fetched a few at a time
     and drawn as they land rather than all at the end. */
  Mint.renderTokens = async function (opts) {
    var list = opts.container;
    var ids = opts.ids;
    var rpc = opts.rpc;
    var contract = opts.contract;
    var itemUrl = opts.itemUrl;
    /* Paging appends into the same grid, so a later page must not wipe the
       earlier ones. */
    if (!opts.append) list.innerHTML = '';

    var figures = ids.map(function (id) {
      var fig = document.createElement('figure');
      fig.className = 'token';
      var art = document.createElement('div');
      art.className = 'token-art';
      art.textContent = 'Loading…';
      var cap = document.createElement('figcaption');
      cap.textContent = '#' + id;
      fig.appendChild(art);
      fig.appendChild(cap);
      list.appendChild(fig);
      return fig;
    });

    var next = 0;
    async function worker() {
      while (next < ids.length) {
        var i = next++;
        var id = ids[i];
        var fig = figures[i];
        try {
          var raw = await rpc.call(contract, Mint.tokenUriCall(id));
          var meta = Mint.parseTokenUri(A.toString(raw));
          if (!meta || !meta.image) throw new Error('no image');
          var img = document.createElement('img');
          img.src = meta.image;
          img.alt = meta.name || ('Token #' + id);
          img.loading = 'lazy';
          fig.replaceChild(img, fig.firstChild);
          var cap = fig.lastChild;
          cap.textContent = '';
          var link = document.createElement('a');
          link.href = itemUrl(id);
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = '#' + id;
          cap.appendChild(link);
        } catch (e) {
          fig.firstChild.textContent = 'Could not load';
        }
      }
    }

    var workers = [];
    for (var w = 0; w < Math.min(4, ids.length); w++) workers.push(worker());
    await Promise.all(workers);
  };

  /* Status line -------------------------------------------------------- */
  Mint.status = function (el) {
    return function (message, kind) {
      el.textContent = message || '';
      el.className = 'status' + (kind ? ' is-' + kind : '');
    };
  };

  global.Mint = Mint;
})(window);
