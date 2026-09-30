/* The drawing shared by the Pentrys look mock-ups, look.html and
   colours.html: the 21 colours, the shapes, and how pieces, special squares,
   the well and the wallpaper are drawn. Add ?theme=light to either page's
   address for the light theme. Not the game: a reference for building it. */
'use strict';
const Look = (function () {
  const PAGE_LIGHT = new URLSearchParams(location.search).get('theme') === 'light';
  if (PAGE_LIGHT) document.documentElement.dataset.theme = 'light';
  let LIGHT = PAGE_LIGHT;   // the well being drawn: colours.html draws both
  const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // The five families, each with its shapes in order along its band of hue.
  const FAMILIES = [
    ['Straights', ['1', '2', 'I3', 'I4', 'I5']],
    ['Corners', ['L3', 'L4', 'L5', 'V5']],
    ['Boxes', ['O4', 'P5', 'U5']],
    ['Zigzags', ['S4', 'N5', 'W5', 'Z5']],
    ['Tees', ['T4', 'T5', 'Y5', 'F5', 'X5']]
  ];
  // Each shape's colour on the dark well and its rim light, then on the light well and its rim light.
  const COLOURS = {
    '1': ['#03e8e3', '#d6fffc', '#039a97', '#6dd9d5'],
    '2': ['#01d5ee', '#b8f4ff', '#0091a3', '#67d0e2'],
    'I3': ['#06c2f8', '#abe5fe', '#0588af', '#6dc6eb'],
    'I4': ['#3aadff', '#a3d4fe', '#057dc2', '#7bbaef'],
    'I5': ['#5d94ff', '#a1c2fc', '#2867e4', '#8baeee'],
    'L3': ['#ff7267', '#febab2', '#de3c37', '#f8a59b'],
    'L4': ['#fe8056', '#ffc3b0', '#e44d05', '#feaf95'],
    'L5': ['#ff8c40', '#fecdb0', '#db6902', '#ffbb94'],
    'V5': ['#fe981a', '#fed5b1', '#d57d04', '#fec898'],
    'O4': ['#feb930', '#fef0d9', '#e9a60d', '#ffecce'],
    'P5': ['#fbc906', '#fef5da', '#e1b303', '#ffedc0'],
    'U5': ['#f2da0d', '#fff7c1', '#d5c006', '#fdf1a2'],
    'S4': ['#abe841', '#e7ffcd', '#78ab08', '#c4e59d'],
    'N5': ['#76ec6b', '#e2ffde', '#34b02a', '#ade3a6'],
    'W5': ['#11ed8f', '#d6ffe3', '#04a964', '#95e1b1'],
    'Z5': ['#04e5b4', '#bfffe7', '#04a17e', '#80ddbd'],
    'T4': ['#8782fe', '#b4b7f7', '#5d4ed6', '#9a9de2'],
    'T5': ['#ac78ff', '#cab6f5', '#7f45cd', '#b19adf'],
    'Y5': ['#cd70f0', '#dfb6ef', '#9b3ebc', '#c599d7'],
    'F5': ['#e96bd8', '#f0b7e6', '#b337a5', '#d799cc'],
    'X5': ['#fe6ab9', '#febad9', '#c63288', '#e59abd']
  };
  const colour = shape => LIGHT ? COLOURS[shape][2] : COLOURS[shape][0];
  const rimLight = shape => LIGHT ? COLOURS[shape][3] : COLOURS[shape][1];
  // Each shape in its reference position, as the spec draws it.
  const REF = {
    '1': ['#'], '2': ['##'], I3: ['###'], L3: ['#.', '##'], I4: ['####'], O4: ['##', '##'],
    T4: ['.#.', '###'], S4: ['.##', '##.'], L4: ['..#', '###'], I5: ['#####'], L5: ['...#', '####'],
    Y5: ['..#.', '####'], N5: ['##..', '.###'], P5: ['##.', '###'], U5: ['#.#', '###'],
    T5: ['.#.', '.#.', '###'], V5: ['#..', '#..', '###'], W5: ['#..', '##.', '.##'],
    X5: ['.#.', '###', '.#.'], Z5: ['##.', '.#.', '.##'], F5: ['.#.', '.##', '##.']
  };
  const cellsOf = rows => rows.flatMap((r, y) => [...r].flatMap((c, x) => c === '#' ? [[x, y]] : []));

  const WELLS = {
    light: { top: '#ffffff', bottom: '#edf0f7', dot: 'rgba(40,50,100,0.18)', rim: 'rgba(20,30,70,0.16)',
             shadow: 'rgba(70,55,20,0.22)', slot: 'rgba(255,255,255,0.96)', slotFront: '#ffffff',
             slotEdge: 'rgba(20,30,70,0.12)', slotEdgeFront: 'rgba(20,30,70,0.34)', wash: 'rgba(244,246,251,0.78)',
             ink: '#1d2140', muted: '#7c786d' },
    dark: { top: '#151b3d', bottom: '#0a0d20', dot: 'rgba(170,190,255,0.16)', rim: 'rgba(200,215,255,0.18)',
            shadow: 'rgba(0,0,0,0.55)', slot: 'rgba(12,15,33,0.9)', slotFront: 'rgba(21,27,61,0.96)',
            slotEdge: 'rgba(200,215,255,0.1)', slotEdgeFront: 'rgba(200,215,255,0.34)', wash: 'rgba(13,17,40,0.72)',
            ink: '#ffffff', muted: '#918c80' }
  };
  let WELL = LIGHT ? WELLS.light : WELLS.dark;
  function useTheme(light) { LIGHT = light; WELL = light ? WELLS.light : WELLS.dark; }
  const GOLD = '#ffd66b', GOLD_ON_PAGE = PAGE_LIGHT ? '#a86f00' : '#ffd66b';

  const DPR = Math.min(2, window.devicePixelRatio || 1);
  function setup(cv, w, h) {
    cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); return ctx;
  }

  // Split squares into edge-connected parts: a cleared row can cut a piece in two.
  function parts(cells) {
    const key = (x, y) => x + ',' + y, all = new Map(cells.map(c => [key(c[0], c[1]), c])), seen = new Set(), out = [];
    for (const c of cells) {
      if (seen.has(key(c[0], c[1]))) continue;
      const part = [], todo = [c]; seen.add(key(c[0], c[1]));
      while (todo.length) {
        const [x, y] = todo.pop(); part.push([x, y]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = key(x + dx, y + dy);
          if (all.has(k) && !seen.has(k)) { seen.add(k); todo.push(all.get(k)); }
        }
      }
      out.push(part);
    }
    return out;
  }
  // The outline of one part, clockwise on screen, corners only.
  function outline(part) {
    const has = new Set(part.map(([x, y]) => x + ',' + y)), next = new Map();
    for (const [x, y] of part) {
      if (!has.has(x + ',' + (y - 1))) next.set(x + ',' + y, [x + 1, y]);
      if (!has.has((x + 1) + ',' + y)) next.set((x + 1) + ',' + y, [x + 1, y + 1]);
      if (!has.has(x + ',' + (y + 1))) next.set((x + 1) + ',' + (y + 1), [x, y + 1]);
      if (!has.has((x - 1) + ',' + y)) next.set(x + ',' + (y + 1), [x, y]);
    }
    const start = next.keys().next().value.split(',').map(Number), pts = [start];
    for (let p = next.get(start.join(',')); p[0] !== start[0] || p[1] !== start[1]; p = next.get(p.join(','))) pts.push(p);
    return pts.filter((b, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], c = pts[(i + 1) % pts.length];
      return (b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0]);
    });
  }
  // Move every edge inwards by d cells, so neighbouring pieces show a gap.
  function inset(v, d) {
    const n = v.length, unit = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
    return v.map((p, i) => {
      const a = unit(v[(i + n - 1) % n], p), b = unit(p, v[(i + 1) % n]);
      return [p[0] + d * (-a[1] - b[1]), p[1] + d * (a[0] + b[0])];
    });
  }
  function trace(ctx, v, ox, oy, s, r) {
    const n = v.length, P = i => [ox + v[(i + n) % n][0] * s, oy + v[(i + n) % n][1] * s];
    const a = P(-1), b = P(0);
    ctx.beginPath(); ctx.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) { const p = P(i), q = P(i + 1); ctx.arcTo(p[0], p[1], q[0], q[1], r); }
    ctx.closePath();
  }

  // One piece: a single rounded shape, lit from above, with faint seams between its squares.
  function piece(ctx, cells, shape, ox, oy, s, glow) {
    const base = colour(shape), rim = rimLight(shape), r = s * 0.2;
    for (const part of parts(cells)) {
      const v = inset(outline(part), 0.055);
      ctx.save();
      trace(ctx, v, ox, oy, s, r);
      if (glow) { ctx.shadowColor = base; ctx.shadowBlur = s * (LIGHT ? 0.5 : 0.9); }
      ctx.fillStyle = base; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      if (LIGHT) { ctx.strokeStyle = 'rgba(20,20,50,0.22)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.clip();
      for (const [x, y] of part) {
        const py = oy + y * s, g = ctx.createLinearGradient(0, py, 0, py + s);
        g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
        g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
        ctx.fillStyle = g; ctx.fillRect(ox + x * s, py, s, s);
      }
      const has = new Set(part.map(([x, y]) => x + ',' + y));
      ctx.beginPath();
      for (const [x, y] of part) {
        if (has.has((x + 1) + ',' + y)) { ctx.moveTo(ox + (x + 1) * s, oy + (y + 0.2) * s); ctx.lineTo(ox + (x + 1) * s, oy + (y + 0.8) * s); }
        if (has.has(x + ',' + (y + 1))) { ctx.moveTo(ox + (x + 0.2) * s, oy + (y + 1) * s); ctx.lineTo(ox + (x + 0.8) * s, oy + (y + 1) * s); }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
      trace(ctx, v, ox, oy, s, r);
      ctx.globalAlpha = 0.7; ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1.5, s * 0.11); ctx.stroke();
      ctx.restore();
    }
  }
  // The landing outline: where the falling piece will land.
  function ghost(ctx, cells, shape, ox, oy, s) {
    for (const part of parts(cells)) {
      const v = inset(outline(part), 0.08);
      ctx.save(); trace(ctx, v, ox, oy, s, s * 0.2);
      ctx.globalAlpha = 0.12; ctx.fillStyle = colour(shape); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = colour(shape); ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.stroke();
      ctx.restore();
    }
  }
  function ring(ctx, cx, cy, s, style, glow) {
    ctx.save(); ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.strokeStyle = style;
    if (glow) { ctx.shadowColor = style; ctx.shadowBlur = s * 0.5; }
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // A special square: 2 or 3 (a number in a ring), 0 (glass) or 'flood' (a drop in a ring).
  function special(ctx, x, y, kind, shape, ox, oy, s) {
    const px = ox + x * s, py = oy + y * s, cx = px + s / 2, cy = py + s / 2;
    ctx.save();
    if (kind === 2 || kind === 3) {
      ring(ctx, cx, cy, s, kind === 3 ? GOLD : 'rgba(255,255,255,0.92)', kind === 3);
      ctx.font = `800 ${Math.round(s * 0.52)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.11; ctx.strokeStyle = 'rgba(12,14,34,0.5)';
      ctx.strokeText(String(kind), cx, cy + s * 0.03);
      ctx.fillStyle = kind === 3 ? '#fff3c4' : '#ffffff'; ctx.fillText(String(kind), cx, cy + s * 0.03);
    } else if (kind === 0) {
      // Glass: the piece's colour washed out, a pane you can see through, with a sheen across it.
      const m = s * 0.1;
      ctx.beginPath(); ctx.roundRect(px + m, py + m, s - 2 * m, s - 2 * m, s * 0.14);
      ctx.save(); ctx.clip();
      ctx.fillStyle = WELL.wash; ctx.fillRect(px, py, s, s);
      ctx.globalAlpha = 0.3; ctx.fillStyle = colour(shape); ctx.fillRect(px, py, s, s); ctx.globalAlpha = 1;
      ctx.fillStyle = WELL.dot; ctx.beginPath(); ctx.arc(px + s, py + s, Math.max(1, s * 0.045), 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(px, py, px + s, py + s);
      g.addColorStop(0.2, 'rgba(255,255,255,0)'); g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.4, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(0.56, 'rgba(255,255,255,0.35)'); g.addColorStop(0.62, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(px, py, s, s);
      ctx.restore();
      ctx.beginPath(); ctx.roundRect(px + m, py + m, s - 2 * m, s - 2 * m, s * 0.14);
      ctx.lineWidth = Math.max(1.2, s * 0.06); ctx.strokeStyle = LIGHT ? colour(shape) : 'rgba(255,255,255,0.85)'; ctx.stroke();
    } else if (kind === 'flood') {
      ring(ctx, cx, cy, s, 'rgba(170,236,255,0.95)', false);
      const r = s * 0.17, top = cy - s * 0.25, mid = cy + s * 0.07;
      ctx.beginPath(); ctx.moveTo(cx, top);
      ctx.quadraticCurveTo(cx + r * 1.1, cy - s * 0.04, cx + r, mid);
      ctx.arc(cx, mid, r, 0, Math.PI, false);
      ctx.quadraticCurveTo(cx - r * 1.1, cy - s * 0.04, cx, top); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.1; ctx.strokeStyle = 'rgba(12,14,34,0.5)'; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
  }

  // The well: a rounded panel with a faint dot at each inside cell corner.
  function well(ctx, ox, oy, w, h, s) {
    ctx.save();
    ctx.shadowColor = WELL.shadow; ctx.shadowBlur = s * 0.9; ctx.shadowOffsetY = s * 0.12;
    ctx.beginPath(); ctx.roundRect(ox, oy, w * s, h * s, s * 0.35);
    const g = ctx.createLinearGradient(0, oy, 0, oy + h * s); g.addColorStop(0, WELL.top); g.addColorStop(1, WELL.bottom);
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.fillStyle = WELL.dot;
    for (let i = 1; i < w; i++) for (let j = 1; j < h; j++) {
      ctx.beginPath(); ctx.arc(ox + i * s, oy + j * s, Math.max(1, s * 0.045), 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.roundRect(ox + 0.5, oy + 0.5, w * s - 1, h * s - 1, s * 0.35);
    ctx.strokeStyle = WELL.rim; ctx.lineWidth = 1; ctx.stroke();
  }

  // The wallpaper: the twelve pentominoes tiling a 10 x 6 rectangle, each in its own colour.
  const TILING = ['ZIIIIIXPPP', 'ZZZTWXXXPP', 'LVZTWWXUUU', 'LVTTTWWUFU', 'LVVVNNYFFF', 'LLNNNYYYYF'];
  function wall(cv) {
    const w = innerWidth, h = innerHeight, ctx = setup(cv, w, h), b = Math.max(18, Math.round(Math.min(w, h) / 30));
    const tile = document.createElement('canvas'), tctx = setup(tile, 10 * b, 6 * b), byLetter = {};
    TILING.forEach((row, y) => [...row].forEach((ch, x) => (byLetter[ch] = byLetter[ch] || []).push([x, y])));
    for (const [ch, cells] of Object.entries(byLetter)) {
      const c = COLOURS[ch + '5'][0], v = inset(outline(cells), 0.09);
      trace(tctx, v, 0, 0, b, b * 0.22);
      tctx.globalAlpha = PAGE_LIGHT ? 0.2 : 0.075; tctx.fillStyle = c; tctx.fill();
      tctx.globalAlpha = PAGE_LIGHT ? 0.35 : 0.14; tctx.strokeStyle = c; tctx.lineWidth = 1; tctx.stroke();
    }
    const pattern = ctx.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix([1 / DPR, 0, 0, 1 / DPR, 0, 0]));
    ctx.save(); ctx.translate(-b * 3, -b * 2); ctx.fillStyle = pattern; ctx.fillRect(0, 0, w + b * 6, h + b * 4); ctx.restore();
    const bg = PAGE_LIGHT ? '246,243,236' : '22,22,26', g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, `rgba(${bg},0.9)`); g.addColorStop(0.55, `rgba(${bg},0.55)`); g.addColorStop(1, `rgba(${bg},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // The title in block letters, each letter in the colour of the shape it names where one does.
  const LETTERS = {
    P: ['###', '#.#', '###', '#..', '#..'], E: ['###', '#..', '###', '#..', '###'],
    N: ['#..#', '##.#', '#.##', '#..#', '#..#'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
    R: ['###', '#.#', '##.', '#.#', '#.#'], Y: ['#.#', '#.#', '###', '.#.', '.#.'],
    S: ['###', '#..', '###', '..#', '###']
  };
  const TITLE_SHAPE = { P: 'P5', E: 'I3', N: 'N5', T: 'T5', R: 'L4', Y: 'Y5', S: 'S4' };
  function title(cv, t) {
    const word = 'PENTRYS', cols = [...word].reduce((n, ch) => n + LETTERS[ch][0].length + 1, -1);
    const ctx = setup(cv, cols * t, 5 * t);
    let x0 = 0;
    for (const ch of word) {
      const rows = LETTERS[ch], base = colour(TITLE_SHAPE[ch]), rim = rimLight(TITLE_SHAPE[ch]);
      rows.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '#') return;
        const px = (x0 + x) * t, py = y * t, g = ctx.createLinearGradient(0, py, 0, py + t);
        g.addColorStop(0, rim); g.addColorStop(0.5, base); g.addColorStop(1, base);
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(px + 0.6, py + 0.6, t - 1.2, t - 1.2, t * 0.28); ctx.fill();
      }));
      x0 += rows[0].length + 1;
    }
  }

  return { PAGE_LIGHT, FONT, FAMILIES, COLOURS, REF, GOLD, GOLD_ON_PAGE, cellsOf, colour, setup, parts, piece, ghost,
           special, well, wall, title, useTheme, wellStyle: () => WELL };
})();
