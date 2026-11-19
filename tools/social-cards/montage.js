/* Draws the builder card's mosaic from a layout: a grid of tiles, each a
   picture or the name block. Shared by cards.html, which renders the card,
   and montage-designer.html, which lays it out. builder-layout.json holds
   the card's layout, as the designer's Copy layout gives it.

   A layout: { v: 2, cols, rows, gap, bg, name: { style, font, kicker,
   title, tag, site, backdrop }, tiles: [{ id, c, r, w, h, px, py, z, fit,
   pad, bg }] }. The tile with id "__name" is the name block. */
(function (root) {
  'use strict';
  var W = 1200, H = 630;

  // A tile with every field filled in.
  function norm(t) {
    return { id: t.id, c: t.c, r: t.r, w: t.w || 1, h: t.h || 1, px: t.px == null ? 50 : t.px, py: t.py == null ? 50 : t.py,
             z: t.z || 1, fit: t.fit || 'cover', pad: t.pad || 0, bg: t.bg && t.bg !== '#17161c' ? t.bg : '' };
  }
  function geom(L) {
    var cw = (W - L.gap * (L.cols - 1)) / L.cols, ch = (H - L.gap * (L.rows - 1)) / L.rows;
    return { cw: cw, ch: ch, sx: cw + L.gap, sy: ch + L.gap };
  }
  function rect(L, t, g) {
    return { x: t.c * g.sx, y: t.r * g.sy, w: t.w * g.cw + (t.w - 1) * L.gap, h: t.h * g.ch + (t.h - 1) * L.gap };
  }
  // Where a picture sits in its tile. The picture is scaled to fill the box
  // inside the padding (cover) or to fit inside it (contain), then by the zoom.
  // px and py place the picture's centre, as a percentage of the box: 50 50 is
  // centred. They may run past 0 and 100, so a picture can hang off an edge,
  // with the tile's fill colour (the card's, unless set) behind it.
  // nat is the picture's natural size, { w, h }.
  function place(t, b, nat) {
    if (!nat) return null;
    var tw = b.w - 2 * t.pad, th = b.h - 2 * t.pad;
    var s0 = t.fit === 'contain' ? Math.min(tw / nat.w, th / nat.h) : Math.max(tw / nat.w, th / nat.h);
    var pw = nat.w * s0 * t.z, ph = nat.h * s0 * t.z;
    return { tw: tw, th: th, W: pw, H: ph, left: t.pad + tw * t.px / 100 - pw / 2, top: t.pad + th * t.py / 100 - ph / 2 };
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // src(id) gives a picture's address, or nothing when there is none.
  function nameHTML(n, src) {
    var body = '';
    if (n.kicker) body += '<div class="k">' + esc(n.kicker) + '</div>';
    body += '<h2 class="t">' + esc(n.title) + '</h2>';
    if (n.tag) body += '<div class="g">' + esc(n.tag) + '</div>';
    if (n.site) body += '<div class="s">' + esc(n.site) + '</div>';
    var pre = '';
    if (n.style === 'glass' && src(n.backdrop)) pre = '<img class="backdrop" src="' + src(n.backdrop) + '" alt="">';
    if (n.style === 'photo' && src('headshot')) pre = '<img class="face" src="' + src('headshot') + '" alt="">';
    return pre + '<div class="body">' + body + '</div>';
  }

  // The mosaic's inner HTML. o.src(id) and o.nat(id) give each picture's
  // address and size. o.extra(t, i), if given, returns { cls, inner, attrs }
  // to add to tile i, for the designer's selection and handles. o.before is
  // HTML to put under the tiles.
  function html(L, o) {
    var g = geom(L), out = o.before || '';
    L.tiles.forEach(function (t, i) {
      var b = rect(L, t, g), cls = 'tile', inner, style = 'left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px;';
      if (t.id === '__name') {
        cls += ' name st-' + L.name.style + ' ' + L.name.font;
        inner = nameHTML(L.name, o.src);
      } else {
        style += 'background:' + (t.bg || L.bg) + ';';
        var url = o.src(t.id), q = url && place(t, b, o.nat(t.id));
        inner = q ? '<img class="pic" src="' + url + '" alt="" style="left:' + q.left + 'px;top:' + q.top + 'px;width:' + q.W + 'px;height:' + q.H + 'px">'
                  : '<div style="color:#f66;padding:8px">missing ' + esc(t.id) + '</div>';
      }
      var x = o.extra ? o.extra(t, i) : {};
      out += '<div class="' + cls + (x.cls || '') + '"' + (x.attrs || '') + ' style="' + style + '">' + inner + (x.inner || '') + '</div>';
    });
    return out;
  }

  // Loads each picture once, to learn its size. Resolves to { id: { w, h } }.
  function sizes(list) {
    var nat = {};
    return Promise.all(list.map(function (p) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = function () { nat[p.id] = { w: im.naturalWidth || 1200, h: im.naturalHeight || 800 }; res(); };
        im.onerror = res;
        im.src = p.url;
      });
    })).then(function () { return nat; });
  }

  root.Montage = { W: W, H: H, norm: norm, geom: geom, rect: rect, place: place, html: html, sizes: sizes, esc: esc };
})(this);
