/* The simulated player plays many games of Marathon and reports how the
   rules play: rows per game, the size of each clear, how often clears use
   a gap or earn a spare, and how long games last. It measures the special
   squares by playing with them on and off, and the cycle by playing with
   the queue used and unused. See the Simulated player section of
   docs/pentrys.md.

   Run from anywhere: node tools/pentrys/sim.js [games] [most pieces]
   Defaults: 12 games of at most 1500 pieces for each setting. Pieces go
   straight to their place, so speed plays no part: that needs a person. */
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app', 'pentrys');
['pieces.js', 'rules.js', 'bot.js'].forEach(f => require(path.join(APP, f)));
const { Rules, Bot } = globalThis.Pentrys;

const GAMES = +process.argv[2] || 12, MOST = +process.argv[3] || 1500;
const SETTINGS = [
  { width: 12, specials: true, cycle: true },
  { width: 12, specials: false, cycle: true },
  { width: 12, specials: true, cycle: false },
  { width: 12, specials: false, cycle: false },
  { width: 10, specials: true, cycle: true },
  { width: 14, specials: true, cycle: true },
  { width: 16, specials: true, cycle: true },
  { width: 18, specials: true, cycle: true }
];

function playOne(setting, seed) {
  const g = Rules.create({ width: setting.width, specials: setting.specials, seed, mode: 'marathon' });
  const s = { pieces: 0, rows: 0, clears: [0, 0, 0, 0, 0, 0, 0], gapRows: 0, spareClears: 0, clearsAll: 0,
              specialRows: 0, glassRows: 0, floods: 0, capped: false, score: 0 };
  while (!g.over) {
    if (s.pieces >= MOST) { s.capped = true; break; }
    const p = Bot.plan(g, setting.cycle);
    if (p) for (let c = 0; c < p.cycles; c++) g.cycle();
    const placed = p && g.placeDirect(p.o, p.bx);
    if (!placed) { g.step({ hardDrop: true }); while (!g.over && g.pause) g.step({}); }
    s.pieces++;
    for (const e of g.takeEvents()) {
      if (e.type === 'flood') s.floods++;
      if (e.type !== 'clear') continue;
      s.clears[e.n]++; s.clearsAll++;
      if (e.spare > 0) s.spareClears++;
      for (const r of e.rows) {
        if (r.gaps.length) s.gapRows++;
        if (r.values.length || r.glass) s.specialRows++;
        if (r.glass) s.glassRows++;
      }
    }
  }
  s.rows = g.rowsCleared; s.score = g.score;
  return s;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
console.log(`${GAMES} games per setting, at most ${MOST} pieces each\n`);
console.log('width  specials  cycle   pieces  capped   rows  rows/100  gap rows  spare clears  special rows  glass rows  floods/100   1s    2s    3s    4s    5s   6s');
for (const st of SETTINGS) {
  const t = { pieces: 0, rows: 0, clears: [0, 0, 0, 0, 0, 0, 0], gapRows: 0, spareClears: 0, clearsAll: 0, specialRows: 0, glassRows: 0, floods: 0, capped: 0 };
  for (let i = 0; i < GAMES; i++) {
    const s = playOne(st, 1000 + i);
    for (const k of ['pieces', 'rows', 'gapRows', 'spareClears', 'clearsAll', 'specialRows', 'glassRows', 'floods']) t[k] += s[k];
    s.clears.forEach((n, k) => { t.clears[k] += n; });
    if (s.capped) t.capped++;
  }
  const line = [String(st.width).padEnd(5), (st.specials ? 'on' : 'off').padEnd(8), (st.cycle ? 'used' : 'unused').padEnd(6),
    String(Math.round(t.pieces / GAMES)).padStart(7), `${t.capped}/${GAMES}`.padStart(7), String(Math.round(t.rows / GAMES)).padStart(6),
    (100 * t.rows / t.pieces).toFixed(1).padStart(9), pct(t.gapRows, t.rows).padStart(9), pct(t.spareClears, t.clearsAll).padStart(13),
    pct(t.specialRows, t.rows).padStart(13), pct(t.glassRows, t.rows).padStart(11), (100 * t.floods / t.pieces).toFixed(2).padStart(11)]
    .concat(t.clears.slice(1).map((n, k) => pct(n, t.clearsAll).padStart(k === 5 ? 5 : 6)));
  console.log(line.join('  '));
}
