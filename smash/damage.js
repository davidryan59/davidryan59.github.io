/* What one hammer blow does to a screen, and how to draw it.

   A real LCD fails in layers, and so does this model. The cover glass cracks
   from the point of impact: long curving cracks that run to the edge, a
   burst of short ones, and on phones rings between them. The panel behind
   breaks along those cracks. Its liquid crystal spreads into black patches
   that grow for a second or two. The patches stop sharp at a crack and end
   in a soft, ragged edge elsewhere, with a fringe of coloured pixels where
   dead meets live. Damaged row and column wiring lights whole lines of
   pixels in one bright colour, from a crack to the edge of the screen.

   The cracks from the impact to the edge cut the screen into sectors. Each
   sector has a fate: it floods black, bleeds in from its cracks, or stays
   alive. Lines run across a sector from crack to edge.

   Everything is in screen units, where the short side is 1000, and is
   vector, so the page can redraw it sharply at any zoom. A hit is fixed at
   the moment it lands; drawing it at time t shows it t seconds later. */
(function (global) {
  'use strict';

  var Smash = global.Smash;
  var TAU = 2 * Math.PI;

  var DARK = 'rgba(6,5,13,0.972)';
  var WHITE = 'rgba(238,243,255,0.97)';
  var FRINGE_DARK = ['#3d3dff', '#3d3dff', '#6b2bff', '#6b2bff', '#9d4dff', '#1ec8ff', '#ffe14d', '#22e07a'];
  var FRINGE_WHITE = ['#2a2aa0', '#5a1f9e', '#1a1a60', '#8f7dff'];
  var LINE_SETS = [['#ff2bd6', '#3d5afe', '#ffffff'], ['#00e676', '#ff5722'], ['#7c4dff', '#00e5ff'], ['#ff1744', '#ffea00'],
                   ['#2979ff', '#d500f9', '#76ff03'], ['#ff9100', '#00b0ff', '#ffffff'], ['#ff2bd6', '#00e676', '#3d5afe']];
  var PATH_STEPS = 180;

  /* -------------------------------------------------------- geometry */

  function cumulative(pts) {
    var cum = new Float32Array(pts.length);
    for (var i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return cum;
  }

  function area(poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }

  function box(poly) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    poly.forEach(function (p) {
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]);
      b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    });
    return b;
  }

  // Where the line y = c (or x = c) crosses the polygon: the inside spans.
  function chords(poly, c, horiz) {
    var xs = [], n = poly.length, i;
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var ay = horiz ? a[1] : a[0], by = horiz ? b[1] : b[0];
      if ((ay <= c && by > c) || (by <= c && ay > c)) {
        var t = (c - ay) / (by - ay);
        xs.push(horiz ? a[0] + t * (b[0] - a[0]) : a[1] + t * (b[1] - a[1]));
      }
    }
    xs.sort(function (p, q) { return p - q; });
    var out = [];
    for (i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 1) out.push([xs[i], xs[i + 1]]);
    return out;
  }

  /* ------------------------------------------------------------- a hit */

  // o: { x, y, W, H, seed, t0, device, px, strength, first }. px is CSS
  // pixels per screen unit at the whole-device view, so pixel-sized details
  // come out a pixel or two wide on arrival.
  function make(o) {
    var r = Smash.rng(o.seed), W = o.W, H = o.H, m = Math.min(W, H), P = [o.x, o.y];
    var glassy = o.device === 'phone' || o.device === 'tablet', s = o.strength;
    var u = 1 / o.px, cell = Math.max(u * 0.8, 0.6), speed = m * 6;
    var hit = { P: P, t0: o.t0, u: u, cell: cell, cracks: [], sectors: [], blobs: [], lines: [], end: 0 };
    var perimeter = 2 * (W + H), branches = [], i, k;

    function edgeS(p) {
      var d = [p[1], W - p[0], H - p[1], p[0]], e = d.indexOf(Math.min(d[0], d[1], d[2], d[3]));
      return e === 0 ? p[0] : e === 1 ? W + p[1] : e === 2 ? W + H + (W - p[0]) : 2 * W + H + (H - p[1]);
    }

    // A crack walks in short steps, turning a little at each one. Curvature
    // drifts slowly, so long cracks make the gentle S-bends of real glass.
    function grow(x, y, ang, maxLen, step, wiggle, start, branchP) {
      var pts = [[x, y]], len = 0, bend = r.normal() * 0.0012, exit = false;
      for (var n = 0; n < 4000 && len < maxLen; n++) {
        bend = Math.max(-0.003, Math.min(0.003, bend * 0.99 + r.normal() * 0.00025));
        ang += bend * step + r.normal() * wiggle;
        var nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
        if (nx <= 0 || ny <= 0 || nx >= W || ny >= H) {
          var t = 1;
          if (nx < 0) t = Math.min(t, -x / (nx - x));
          if (nx > W) t = Math.min(t, (W - x) / (nx - x));
          if (ny < 0) t = Math.min(t, -y / (ny - y));
          if (ny > H) t = Math.min(t, (H - y) / (ny - y));
          nx = Math.max(0, Math.min(W, x + (nx - x) * t));
          ny = Math.max(0, Math.min(H, y + (ny - y) * t));
          pts.push([nx, ny]);
          exit = true;
          break;
        }
        x = nx;
        y = ny;
        len += step;
        var j = r.normal() * 0.35 * cell;
        pts.push([x - Math.sin(ang) * j, y + Math.cos(ang) * j]);
        if (branchP && r() < branchP) branches.push([x, y, ang + (r.chance(0.5) ? 1 : -1) * r.range(0.3, 0.8), start + len / speed]);
      }
      var c = { pts: pts, cum: cumulative(pts), exit: exit, start: start, speed: speed, style: 'hair' };
      c.len = c.cum[c.cum.length - 1];
      if (exit) c.s = edgeS(pts[pts.length - 1]);
      hit.cracks.push(c);
      return c;
    }

    var n = (glassy ? r.int(5, 8) : r.int(3, 6)) + (s > 0.85 ? 1 : 0), base = r.range(0, TAU), mains = [];
    for (i = 0; i < n; i++) {
      var through = i < 2 || r.chance(0.75);
      mains.push(grow(P[0], P[1], base + (i + r.range(-0.3, 0.3)) * TAU / n, through ? Infinity : r.range(0.15, 0.6) * m,
                      4, 0.02, 0, glassy ? 0.006 : 0.004));
    }
    branches.forEach(function (b) { grow(b[0], b[1], b[2], r.range(0.04, 0.35) * m, 3, 0.03, b[3], 0); });

    // Rings join neighbouring cracks, as in the spider web of a phone.
    function pointAt(c, dist) {
      for (var j = 1; j < c.pts.length; j++) {
        if (Math.hypot(c.pts[j][0] - P[0], c.pts[j][1] - P[1]) >= dist) return c.pts[j];
      }
      return null;
    }
    var rings = glassy ? r.int(1, 3) : r.chance(0.3) ? 1 : 0;
    for (k = 0; k < rings; k++) {
      var rad = m * r.range(0.05, 0.1) * (k + 1) * (glassy ? 1.4 : 1);
      for (i = 0; i < mains.length; i++) {
        if (!r.chance(0.7)) continue;
        var A = pointAt(mains[i], rad * r.range(0.9, 1.1)), B = pointAt(mains[(i + 1) % mains.length], rad * r.range(0.9, 1.1));
        if (!A || !B) continue;
        var aA = Math.atan2(A[1] - P[1], A[0] - P[0]), d = Math.atan2(B[1] - P[1], B[0] - P[0]) - aA;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        var rA = Math.hypot(A[0] - P[0], A[1] - P[1]), rB = Math.hypot(B[0] - P[0], B[1] - P[1]), pts = [];
        for (var q = 0; q <= 16; q++) {
          var f = q / 16, rr = (rA + (rB - rA) * f) * (1 + 0.05 * Math.sin(Math.PI * f)) + r.normal() * cell * 0.6;
          pts.push([Math.max(0, Math.min(W, P[0] + Math.cos(aA + d * f) * rr)), Math.max(0, Math.min(H, P[1] + Math.sin(aA + d * f) * rr))]);
        }
        var ring = { pts: pts, cum: cumulative(pts), start: rad / speed, speed: speed * 0.5, style: 'hair' };
        ring.len = ring.cum[ring.cum.length - 1];
        hit.cracks.push(ring);
      }
    }

    // The burst of short cracks around the impact.
    for (i = r.int(10, 22); i > 0; i--) {
      var ray = grow(P[0], P[1], r.range(0, TAU), m * (0.008 + 0.03 * Math.pow(r(), 2)), 2, 0.08, 0, 0);
      ray.style = 'fine';
      ray.speed = speed * 0.5;
    }
    hit.crater = [];
    var cr = m * r.range(0.004, 0.009) * (0.7 + 0.5 * s);
    for (i = 0, k = r.int(8, 13); i < k; i++) {
      var ca = TAU * i / k, cd = cr * r.range(0.6, 1.3);
      hit.crater.push([P[0] + Math.cos(ca) * cd, P[1] + Math.sin(ca) * cd]);
    }
    hit.glitter = [];
    for (i = r.int(20, 60); i > 0; i--) {
      var ga = r.range(0, TAU), gd = m * 0.04 * r() * r();
      hit.glitter.push([P[0] + Math.cos(ga) * gd, P[1] + Math.sin(ga) * gd, cell * r.range(0.6, 1.8), r.range(0.3, 1)]);
    }

    var exits = mains.filter(function (c) { return c.exit; });
    exits.forEach(function (c) {
      if (r() < (glassy ? 0.25 : 0.4)) c.style = 'ribbon';
      c.half = u * r.range(2, 5);
    });

    /* Sectors between neighbouring cracks that reach the edge. */
    exits.sort(function (a, b) { return a.s - b.s; });
    var corners = [[W, 0, W], [W, H, W + H], [0, H, 2 * W + H], [0, 0, perimeter]];
    if (exits.length < 2) {
      hit.sectors.push({ poly: [[0, 0], [W, 0], [W, H], [0, H]], whole: true });
    } else {
      for (i = 0; i < exits.length; i++) {
        var ca2 = exits[i], cb = exits[(i + 1) % exits.length], sA = ca2.s, sB = cb.s;
        if (sB <= sA) sB += perimeter;
        var poly = ca2.pts.slice(), list = [];
        corners.forEach(function (c) {
          [c[2], c[2] + perimeter].forEach(function (cs) { if (cs > sA && cs < sB) list.push([cs, c[0], c[1]]); });
        });
        list.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (c) { poly.push([c[1], c[2]]); });
        for (k = cb.pts.length - 1; k >= 0; k--) poly.push(cb.pts[k]);
        hit.sectors.push({ poly: poly, sides: [ca2, cb] });
      }
    }
    hit.sectors.forEach(function (sec) {
      sec.frac = area(sec.poly) / (W * H);
      sec.box = box(sec.poly);
      sec.reach = 0;
      sec.poly.forEach(function (p) { sec.reach = Math.max(sec.reach, Math.hypot(p[0] - P[0], p[1] - P[1])); });
    });

    /* Fates. The first hit on a screen leaves at least half of it alive. */
    var dark = 0, limit = o.first ? 0.5 : 0.85, active = 0;
    hit.sectors.forEach(function (sec) {
      var roll = r();
      if (roll < 0.45 && dark + sec.frac <= limit) { sec.fate = 'dark'; dark += sec.frac; }
      else if (roll < 0.8) sec.fate = 'bleed';
      else sec.fate = 'live';
      sec.white = sec.fate === 'bleed' && r.chance(0.12);
      if (sec.fate !== 'live') active++;
    });
    if (!active) hit.sectors.reduce(function (a, b) { return a.frac < b.frac ? a : b; }).fate = 'dark';

    function blob(cx, cy, R, delay, dur, sector, white) {
      var harm = [], j;
      for (j = 2; j <= 7; j++) harm.push([j, r.range(0.03, 0.22) / Math.pow(j, 0.7), r.range(0, TAU)]);
      for (j = 9; j <= 21; j += 3) harm.push([j, r.range(0.002, 0.008), r.range(0, TAU)]);
      var lagDir = r.range(0, TAU), lag = r.range(0.1, 0.45);
      function shape(a) {
        var v = 1;
        harm.forEach(function (h) { v += h[1] * Math.cos(h[0] * a + h[2]); });
        return v;
      }
      function lagAt(a) { return lag * dur * (0.5 + 0.5 * Math.cos(a - lagDir)); }
      var b = { cx: cx, cy: cy, R: R, delay: delay, dur: dur, sector: sector, white: white,
                shape: new Float32Array(PATH_STEPS), lag: new Float32Array(PATH_STEPS) };
      for (j = 0; j < PATH_STEPS; j++) {
        b.shape[j] = shape(TAU * j / PATH_STEPS);
        b.lag[j] = lagAt(TAU * j / PATH_STEPS);
      }
      // The fringe: short spikes of coloured pixels, clustered, that hang
      // off the edge in the direction of the nearest row or column.
      var N = Math.min(2400, Math.ceil(TAU * R * 1.2 / cell)), p1 = r.range(0, TAU), p2 = r.range(0, TAU);
      var pal = white ? FRINGE_WHITE : FRINGE_DARK;
      b.fringe = { n: N, a: new Float32Array(N), shape: new Float32Array(N), lag: new Float32Array(N),
                   len: new Float32Array(N), dot: new Float32Array(N), col: new Uint8Array(N), pal: pal };
      for (j = 0; j < N; j++) {
        var a = TAU * j / N, env = Math.max(0, 0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(7 * a + p2));
        b.fringe.a[j] = a;
        b.fringe.shape[j] = shape(a);
        b.fringe.lag[j] = lagAt(a);
        b.fringe.len[j] = r() < 0.5 ? 0 : cell * (r.range(0.5, 2.5) + (r() < 0.06 ? r.range(4, 12) : 0)) * (0.35 + env * 1.4);
        b.fringe.dot[j] = r() < 0.12 ? cell * r.range(1, 5) : 0;
        b.fringe.col[j] = Math.floor(r() * pal.length);
      }
      b.done = delay + dur * (1 + lag);
      hit.blobs.push(b);
      return b;
    }

    function pointOn(c, f) {
      var target = c.len * f;
      for (var j = 1; j < c.pts.length; j++) if (c.cum[j] >= target) return c.pts[j];
      return c.pts[c.pts.length - 1];
    }

    hit.sectors.forEach(function (sec, si) {
      if (sec.fate === 'dark') {
        blob(P[0] + r.normal() * cell * 3, P[1] + r.normal() * cell * 3, sec.reach * r.range(0.8, 1.2),
             r.range(0.05, 0.2), r.range(1.1, 2.2) * Math.sqrt(Math.min(1.5, sec.reach / m)), si, false);
        if (r.chance(0.5)) {
          var far = sec.poly[Math.floor(r() * sec.poly.length)];
          blob(far[0], far[1], sec.reach * r.range(0.3, 0.6), r.range(0.3, 0.8), r.range(1, 2), si, false);
        }
      } else if (sec.fate === 'bleed') {
        for (var j = r.int(1, 3); j > 0; j--) {
          var at = sec.sides && r.chance(0.75) ? pointOn(r.pick(sec.sides), r.range(0.15, 0.8)) : sec.poly[Math.floor(r() * sec.poly.length)];
          blob(at[0], at[1], m * r.range(0.1, 0.35) * (0.75 + 0.5 * s), r.range(0.1, 0.6), r.range(1.2, 2.6), si, sec.white);
        }
      }
    });

    /* Lines of stuck pixels. */
    function addLines(sec, si, groups, clip, faint) {
      var horiz = r() < (glassy ? 0.55 : 0.85), pal = r.pick(LINE_SETS);
      for (var g = 0; g < groups; g++) {
        var lo = horiz ? sec.box[1] : sec.box[0], hi = horiz ? sec.box[3] : sec.box[2];
        var c0 = r.range(lo, hi), band = m * r.range(0.05, 0.3), pos = c0 - band / 2, gDelay = r.range(0.05, 1);
        var count = 0;
        while (pos < c0 + band / 2 && count < (faint ? 3 : 30)) {
          pos += m * (0.006 + 0.04 * r() * r());
          var th = r.pick([1, 1, 1.5, 2, 2.5]) * u, spans = chords(sec.poly, pos, horiz);
          if (!spans.length) continue;
          var edge = horiz ? W : H, pair = r.chance(0.25), colours = [r.pick(pal)];
          if (pair) colours.push(r.pick(pal));
          colours.forEach(function (col, ci) {
            var y = pos + ci * th, segs = spans.map(function (sp) {
              var a = sp[0] > 0.5 ? sp[0] + r.range(0, 3) * u : sp[0];
              var b = sp[1] < edge - 0.5 ? sp[1] - r.range(0, 3) * u : sp[1];
              return [a, b];
            });
            hit.lines.push({ horiz: horiz, pos: y, th: th, segs: segs, color: col, dead: r.chance(0.1), alpha: faint ? 0.45 : 1,
                             t: gDelay + r.range(0, 0.35), clip: clip ? si : -1 });
          });
          pos += th * colours.length;
          count++;
        }
      }
    }
    hit.sectors.forEach(function (sec, si) {
      if (sec.fate === 'dark') addLines(sec, si, r.int(1, 3), true, false);
      else if (sec.fate === 'bleed') addLines(sec, si, r.int(1, 2), r.chance(0.7), false);
      else if (r.chance(0.4)) addLines(sec, si, 1, false, true);
    });
    var broken = hit.sectors.filter(function (sec) { return sec.fate !== 'live'; });
    if (broken.length && r() < (glassy ? 0.3 : 0.5)) {
      var vs = r.pick(broken), vx = r.range(vs.box[0], vs.box[2]), vspans = chords(vs.poly, vx, false);
      if (vspans.length) {
        hit.lines.push({ horiz: false, pos: vx, th: r.range(1.5, 2.5) * u, segs: vspans, color: r.pick(['#ff6d00', '#ff1744', '#00e676', '#ffffff']),
                         dead: false, alpha: 1, t: r.range(0.2, 1.2), clip: hit.sectors.indexOf(vs) });
      }
    }

    hit.end = 0.25;
    hit.cracks.forEach(function (c) { hit.end = Math.max(hit.end, c.start + c.len / c.speed); });
    hit.blobs.forEach(function (b) { hit.end = Math.max(hit.end, b.done); });
    hit.lines.forEach(function (l) { hit.end = Math.max(hit.end, l.t + 0.12); });
    return hit;
  }

  /* ---------------------------------------------------------- drawing */

  function tracePoly(ctx, poly) {
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  function growth(b, lag, dt) {
    var g = (dt - b.delay - lag) / b.dur;
    return g <= 0 ? 0 : g >= 1 ? 1 : 1 - Math.pow(1 - g, 3);
  }

  function traceBlob(ctx, b, dt) {
    var any = false;
    for (var j = 0; j < PATH_STEPS; j++) {
      var a = TAU * j / PATH_STEPS, rr = b.R * b.shape[j] * growth(b, b.lag[j], dt);
      var x = b.cx + Math.cos(a) * rr, y = b.cy + Math.sin(a) * rr;
      if (rr > 0) any = true;
      if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    return any;
  }

  function clipSector(ctx, hit, si) {
    var sec = hit.sectors[si];
    if (sec.whole) return;
    ctx.beginPath();
    tracePoly(ctx, sec.poly);
    ctx.clip();
  }

  function drawFringe(ctx, hit, b, dt) {
    var f = b.fringe, w = hit.cell;
    for (var c = 0; c < f.pal.length; c++) {
      ctx.beginPath();
      for (var j = 0; j < f.n; j++) {
        if (f.col[j] !== c || (!f.len[j] && !f.dot[j])) continue;
        var g = growth(b, f.lag[j], dt);
        if (g <= 0) continue;
        var a = f.a[j], ca = Math.cos(a), sa = Math.sin(a), rr = b.R * f.shape[j] * g;
        var x = b.cx + ca * rr, y = b.cy + sa * rr, L = f.len[j] * g;
        if (L > 0) {
          if (Math.abs(sa) >= Math.abs(ca)) ctx.rect(x - w / 2, sa > 0 ? y : y - L, w, L);
          else ctx.rect(ca > 0 ? x : x - L, y - w / 2, L, w);
        }
        if (f.dot[j]) ctx.rect(x + ca * (L + f.dot[j]) - w / 2, y + sa * (L + f.dot[j]) - w / 2, w, w);
      }
      ctx.fillStyle = f.pal[c];
      ctx.fill();
    }
  }

  // env: { k: CSS pixels per screen unit now, dpr, zoom, still }.
  function drawLCD(ctx, hits, t, env) {
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      hit.blobs.forEach(function (b) {
        if (dt < b.delay) return;
        ctx.save();
        clipSector(ctx, hit, b.sector);
        drawFringe(ctx, hit, b, dt);
        ctx.restore();
      });
    });
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      hit.blobs.forEach(function (b) {
        if (dt < b.delay) return;
        ctx.save();
        clipSector(ctx, hit, b.sector);
        ctx.beginPath();
        if (traceBlob(ctx, b, dt)) {
          ctx.fillStyle = b.white ? WHITE : DARK;
          ctx.fill();
        }
        ctx.restore();
      });
    });
    var minTh = 0.9 / (env.k * env.dpr);
    hits.forEach(function (hit) {
      var dt = t - hit.t0, groups = {};
      hit.lines.forEach(function (l) {
        if (dt < l.t || (dt > l.t + 0.05 && dt < l.t + 0.09)) return;
        (groups[l.clip] = groups[l.clip] || []).push(l);
      });
      Object.keys(groups).forEach(function (key) {
        var si = +key;
        ctx.save();
        if (si >= 0) {
          clipSector(ctx, hit, si);
          ctx.beginPath();
          var any = false;
          hit.blobs.forEach(function (b) { if (b.sector === si && dt >= b.delay && traceBlob(ctx, b, dt)) any = true; });
          if (!any) { ctx.restore(); return; }
          ctx.clip();
        }
        groups[key].forEach(function (l) {
          var th = Math.max(l.th, minTh);
          ctx.globalAlpha = l.alpha;
          ctx.globalCompositeOperation = l.dead ? 'source-over' : 'lighten';
          ctx.fillStyle = l.dead ? 'rgba(0,0,0,0.85)' : l.color;
          l.segs.forEach(function (sg) {
            if (l.horiz) ctx.fillRect(sg[0], l.pos, sg[1] - sg[0], th);
            else ctx.fillRect(l.pos, sg[0], th, sg[1] - sg[0]);
          });
        });
        ctx.restore();
      });
    });
  }

  function traceCrack(ctx, c, dt, ox, oy) {
    var L = (dt - c.start) * c.speed, p = c.pts, cum = c.cum;
    if (L <= 0) return;
    ctx.moveTo(p[0][0] + ox, p[0][1] + oy);
    for (var i = 1; i < p.length; i++) {
      if (cum[i] <= L) {
        ctx.lineTo(p[i][0] + ox, p[i][1] + oy);
        continue;
      }
      var f = (L - cum[i - 1]) / (cum[i] - cum[i - 1]);
      ctx.lineTo(p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f + ox, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f + oy);
      return;
    }
  }

  // The two edges of a ribbon crack, a band of shattered glass that is
  // widest a little way from the impact and tapers towards its end.
  function ribbonEdges(c, dt, hit) {
    var L = Math.min(c.len, (dt - c.start) * c.speed), left = [], right = [], p = c.pts;
    for (var i = 0; i < p.length && c.cum[i] <= L; i++) {
      var a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      var s = c.cum[i], hw = c.half * Math.min(1, s / (40 * hit.u)) * (1 - 0.6 * s / c.len);
      left.push([p[i][0] - dy / d * hw, p[i][1] + dx / d * hw]);
      right.push([p[i][0] + dy / d * hw, p[i][1] - dx / d * hw]);
    }
    return [left, right];
  }

  var stipple = null;
  // The dots stay near a pixel apart as the view zooms in, like the grain
  // of the glass rather than a printed pattern.
  function stipplePattern(ctx, hit, zoom) {
    if (!stipple) {
      stipple = document.createElement('canvas');
      stipple.width = stipple.height = 4;
      var sc = stipple.getContext('2d');
      sc.fillStyle = 'rgba(214,220,232,0.9)';
      sc.fillRect(0, 0, 1, 1);
      sc.fillRect(2, 2, 1, 1);
      sc.fillStyle = 'rgba(120,128,140,0.55)';
      sc.fillRect(2, 0, 1, 1);
      sc.fillRect(0, 2, 1, 1);
    }
    var pat = ctx.createPattern(stipple, 'repeat');
    if (pat && pat.setTransform && global.DOMMatrix) {
      var sz = 0.8 * hit.u * Math.pow(Math.max(1, zoom), -0.6);
      pat.setTransform(new DOMMatrix([sz, 0, 0, sz, 0, 0]));
      return pat;
    }
    return 'rgba(190,196,208,0.55)';
  }

  function drawGlass(ctx, hits, t, env) {
    var css = 1 / env.k, boost = Math.pow(Math.max(1, env.zoom), 0.35);
    hits.forEach(function (hit) {
      var dt = t - hit.t0;
      if (dt < 0) return;
      var m = hit.P;
      if (!env.still && dt < 0.18) {
        var fl = ctx.createRadialGradient(m[0], m[1], 0, m[0], m[1], 160 * hit.u);
        fl.addColorStop(0, 'rgba(255,255,255,' + (0.85 * (1 - dt / 0.18)).toFixed(3) + ')');
        fl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fl;
        ctx.fillRect(m[0] - 160 * hit.u, m[1] - 160 * hit.u, 320 * hit.u, 320 * hit.u);
      }
      var edges = [];
      hit.cracks.forEach(function (c) {
        if (c.style !== 'ribbon' || dt <= c.start) return;
        var e = ribbonEdges(c, dt, hit);
        if (e[0].length < 2) return;
        edges.push(e[0], e[1]);
        ctx.beginPath();
        e[0].forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
        for (var i = e[1].length - 1; i >= 0; i--) ctx.lineTo(e[1][i][0], e[1][i][1]);
        ctx.closePath();
        ctx.fillStyle = stipplePattern(ctx, hit, env.zoom);
        ctx.fill();
      });
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      [[0.6 * css, 'rgba(0,0,0,0.5)', 1.7], [0, 'rgba(210,225,255,0.14)', 4], [0, 'rgba(245,248,255,0.9)', 0.9]].forEach(function (pass) {
        ctx.beginPath();
        hit.cracks.forEach(function (c) {
          if (c.style === 'ribbon') return;
          traceCrack(ctx, c, dt, pass[0], pass[0]);
        });
        edges.forEach(function (e) {
          e.forEach(function (p, i) { if (i) ctx.lineTo(p[0] + pass[0], p[1] + pass[0]); else ctx.moveTo(p[0] + pass[0], p[1] + pass[0]); });
        });
        ctx.strokeStyle = pass[1];
        ctx.lineWidth = pass[2] * css * boost;
        ctx.stroke();
      });
      ctx.beginPath();
      tracePoly(ctx, hit.crater);
      ctx.fillStyle = 'rgba(235,240,255,0.92)';
      ctx.fill();
      hit.glitter.forEach(function (g) {
        ctx.fillStyle = 'rgba(255,255,255,' + g[3].toFixed(2) + ')';
        ctx.fillRect(g[0] - g[2] / 2, g[1] - g[2] / 2, g[2], g[2]);
      });
    });
  }

  Smash.Damage = { make: make, drawLCD: drawLCD, drawGlass: drawGlass };
})(this);
