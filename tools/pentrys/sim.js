/* The simulated player plays many games of Marathon and reports how the
   rules play: rows per game, the size of each clear, how often clears use
   a gap or earn a spare, how often glass is smashed and bombs and deluges go
   off, the score, and how long games last. It measures the special squares
   by playing each set, Pentrys, Plus and Pure, and the cycle by playing with
   the queue used and unused. See the Simulated player section of
   docs/pentrys.md.

   Run from anywhere: node tools/pentrys/sim.js [games] [most pieces]
   Defaults: 12 games of at most 1500 pieces for each setting. Pieces go
   straight to their place, so speed plays no part: that needs a person. Nor
   does glass break with age, since the clock barely moves. */
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app', 'pentrys');
['pieces.js', 'config.js', 'rules.js', 'bot.js'].forEach(f => require(path.join(APP, f)));
const { Rules, Bot } = globalThis.Pentrys;

const GAMES = +process.argv[2] || 12, MOST = +process.argv[3] || 1500;
const SETTINGS = [
  { width: 12, squares: 'normal', cycle: true },
  { width: 12, squares: 'plus', cycle: true },
  { width: 12, squares: 'pure', cycle: true },
  { width: 12, squares: 'normal', cycle: false },
  { width: 10, squares: 'normal', cycle: true },
  { width: 14, squares: 'normal', cycle: true },
  { width: 16, squares: 'normal', cycle: true },
  { width: 18, squares: 'normal', cycle: true }
];
const COUNTS = ['pieces', 'rows', 'gapRows', 'spareClears', 'clearsAll', 'glassRows', 'smashes', 'blasts', 'deluges', 'rowBombs', 'score'];

function playOne(setting, seed) {
  const g = Rules.create({ width: setting.width, squares: setting.squares, seed, mode: 'marathon' });
  const s = { capped: false, clears: new Array(25).fill(0) };
  COUNTS.forEach(k => { s[k] = 0; });
  while (!g.over) {
    if (s.pieces >= MOST) { s.capped = true; break; }
    const p = Bot.plan(g, setting.cycle);
    if (p) for (let c = 0; c < p.cycles; c++) g.cycle();
    const placed = p && g.placeDirect(p.o, p.bx);
    if (!placed) { g.step({ hardDrop: true }); while (!g.over && g.pause) g.step({}); }
    s.pieces++;
    for (const e of g.takeEvents()) {
      if (e.type === 'smash') s.smashes++;
      if (e.type === 'blast') s.blasts++;
      if (e.type === 'fill' && e.kind === 'deluge') s.deluges++;
      if (e.type === 'rowbomb') s.rowBombs++;
      if (e.type !== 'clear') continue;
      s.clears[e.n]++; s.clearsAll++;
      if (e.spare > 0) s.spareClears++;
      for (const r of e.rows) { if (r.gaps.length) s.gapRows++; if (r.glass) s.glassRows++; }
    }
  }
  s.rows = g.rowsCleared; s.score = g.score;
  return s;
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';
const per100 = (a, b) => (100 * a / b).toFixed(2);
console.log(`${GAMES} games per setting, at most ${MOST} pieces each\n`);
console.log('width  squares  cycle   pieces  capped   rows  rows/100  gap rows  spare clears  glass rows  smashes/100  blasts/100  deluges/100  row bombs/100    score/game     1s     2s     3s     4s     5s     6s    7+');
for (const st of SETTINGS) {
  const t = { capped: 0, clears: new Array(25).fill(0) };
  COUNTS.forEach(k => { t[k] = 0; });
  for (let i = 0; i < GAMES; i++) {
    const s = playOne(st, 1000 + i);
    COUNTS.forEach(k => { t[k] += s[k]; });
    s.clears.forEach((n, k) => { t.clears[k] += n; });
    if (s.capped) t.capped++;
  }
  const big = t.clears.slice(7).reduce((a, b) => a + b, 0);
  const line = [String(st.width).padEnd(5), st.squares.padEnd(7), (st.cycle ? 'used' : 'unused').padEnd(6),
    String(Math.round(t.pieces / GAMES)).padStart(7), `${t.capped}/${GAMES}`.padStart(7), String(Math.round(t.rows / GAMES)).padStart(6),
    (100 * t.rows / t.pieces).toFixed(1).padStart(9), pct(t.gapRows, t.rows).padStart(9), pct(t.spareClears, t.clearsAll).padStart(13),
    pct(t.glassRows, t.rows).padStart(11), per100(t.smashes, t.pieces).padStart(12), per100(t.blasts, t.pieces).padStart(11),
    per100(t.deluges, t.pieces).padStart(12), per100(t.rowBombs, t.pieces).padStart(14), String(Math.round(t.score / GAMES)).padStart(13)]
    .concat(t.clears.slice(1, 7).map(n => pct(n, t.clearsAll).padStart(6)), [pct(big, t.clearsAll).padStart(5)]);
  console.log(line.join('  '));
}
