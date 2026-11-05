/* Finds a seed for the film's natural play section. It plays each seed with the
   game's own simulated player at the film's special-square odds, and scores the
   stretch that the film shows. Run: node tools/pentrys-video/seed.js [seeds] */
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'app', 'pentrys');
require(path.join(APP, 'pieces.js')); require(path.join(APP, 'config.js'));
const { FILM_ODDS, BASE_PIECES, SHOWN_PIECES } = require('./odds.js');
globalThis.Pentrys.Config.squares.film = FILM_ODDS;
require(path.join(APP, 'rules.js')); require(path.join(APP, 'bot.js'));
const { Rules, Bot } = globalThis.Pentrys;
const SEEDS = +process.argv[2] || 4000;
let best = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = Rules.create({ mode: 'marathon', width: 12, sizes: [1, 2, 3, 4, 5], squares: 'film', seed, speed: 6, firstRowSeconds: 0.55, choiceRows: 0 });
  for (let i = 0; i < BASE_PIECES && !g.over; i++) { const p = Bot.plan(g, false); if (!p || !g.placeDirect(p.o, p.bx)) break; }
  g.takeEvents();
  const s = { seed, rows: 0, clears: [0, 0, 0, 0, 0, 0, 0], kinds: {}, streak: 0, first: -1, dealt: 0, most: 0 };
  const each = {};
  for (let i = 0; i < SHOWN_PIECES && !g.over; i++) {
    const p = Bot.plan(g, false);
    if (g.piece) { g.piece.specials.forEach(k => { s.dealt++; each[k.kind] = (each[k.kind] || 0) + 1; s.most = Math.max(s.most, each[k.kind]); }); }
    if (!p || !g.placeDirect(p.o, p.bx)) break;
    g.takeEvents().forEach(e => {
      if (e.type === 'clear') { s.rows += e.n; s.clears[Math.min(6, e.n)]++; s.streak = Math.max(s.streak, e.streak); if (s.first < 0) s.first = i; }
      if (e.type === 'fill') s.kinds[e.kind] = 1;
      if (e.type === 'blast') s.kinds.bomb = 1;
      if (e.type === 'rowbomb') s.kinds.rowbomb = 1;
      if (e.type === 'smash') s.kinds.smash = 1;
    });
  }
  // Clears early and often, and a double or a triple. The special sections come later, so plain play scores best.
  s.score = s.rows + 3 * s.clears[2] + 6 * s.clears[3] + 10 * s.clears[4] + 2 * s.streak - (s.first > 3 ? 4 : 0) - 2 * Object.keys(s.kinds).length;
  // The stretch must look like the odds: about 50 squares, so few specials and no kind repeated much.
  if (s.dealt <= 4 && s.most <= 2) best.push(s);
}
best.sort((a, b) => b.score - a.score);
best.slice(0, 8).forEach(s => console.log(JSON.stringify(s)));
