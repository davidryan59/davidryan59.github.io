/* The simulated player. For the falling piece it tries every column,
   rotation and flip, and scores the stack each would leave. Then it picks
   which piece in the queue to bring forward, the one that best fits that
   stack. The title screen shows it playing, and tools/pentrys/sim.js plays
   hundreds of games with it to measure the rules.

   The score is El-Tetris's: six measures of a stack, each with a weight
   found by a genetic search on classic Tetris (Yiyuan Lee, 2013). It knows
   nothing of special squares beyond what clearing rows does. */
(function (root) {
  'use strict';
  var Pentrys = root.Pentrys || (root.Pentrys = {});
  var Pieces = Pentrys.Pieces, Rules = Pentrys.Rules;

  var W_LANDING = -4.500158825082766, W_ERODED = 3.4181268101392694, W_ROW_TRANS = -3.2178882868487753,
      W_COL_TRANS = -9.348695305445199, W_HOLES = -7.899265427351652, W_WELLS = -3.3855972247263626;

  function fits(grid, shape, o, bx, bottom) {
    var cells = Pieces.cellsAt(shape, o, bx, bottom), w = grid[0].length;
    for (var i = 0; i < cells.length; i++) {
      var x = cells[i][0], y = cells[i][1];
      if (x < 0 || x >= w || y < 0 || y >= grid.length || grid[y][x]) return false;
    }
    return true;
  }

  function score(out, cells) {
    var g = out.grid, h = g.length, w = g[0].length;
    var bottom = -1, top = h;
    for (var i = 0; i < cells.length; i++) { bottom = Math.max(bottom, cells[i][1]); top = Math.min(top, cells[i][1]); }
    var landing = h - (bottom + top) / 2;
    var cleared = out.rows.length, eroded = 0;
    if (cleared) {
      var gone = {};
      out.rows.forEach(function (r) { gone[r.y] = true; });
      for (var c = 0; c < cells.length; c++) if (gone[cells[c][1]]) eroded++;
      eroded *= cleared;
    }
    var rowTrans = 0, colTrans = 0, holes = 0, wells = 0, x, y;
    for (y = 0; y < h; y++) {
      var prev = true;
      for (x = 0; x < w; x++) { var f = !!g[y][x]; if (f !== prev) rowTrans++; prev = f; }
      if (!prev) rowTrans++;
    }
    for (x = 0; x < w; x++) {
      var above = false, filledAbove = false;
      for (y = 0; y < h; y++) {
        var here = !!g[y][x];
        if (y > 0 && here !== above) colTrans++;
        if (!here && filledAbove) holes++;
        if (here) filledAbove = true;
        above = here;
      }
      if (!above) colTrans++;
      var depth = 0;
      for (y = 0; y < h; y++) {
        var left = x === 0 || !!g[y][x - 1], right = x === w - 1 || !!g[y][x + 1];
        if (!g[y][x] && left && right) { depth++; wells += depth; } else depth = 0;
      }
    }
    return W_LANDING * landing + W_ERODED * eroded + W_ROW_TRANS * rowTrans + W_COL_TRANS * colTrans +
      W_HOLES * holes + W_WELLS * wells;
  }

  // The best place for a piece on a grid: { o, bx, bottom, value, out }, or null.
  function best(grid, piece, top) {
    var shape = Pieces.SHAPE[piece.shape], w = grid[0].length, found = null;
    for (var o = 0; o < 8; o++) {
      var or = shape.orients[o];
      for (var bx = -or.minX; bx + or.maxX < w; bx++) {
        if (!fits(grid, piece.shape, o, bx, top)) continue;
        var bottom = top;
        while (fits(grid, piece.shape, o, bx, bottom + 1)) bottom++;
        var cells = Pieces.cellsAt(piece.shape, o, bx, bottom);
        var out = Rules.settle(grid, cells, piece.special, -1, piece.shape), value = score(out, cells);
        if (!found || value > found.value) found = { o: o, bx: bx, bottom: bottom, value: value, out: out };
      }
    }
    return found;
  }

  // A plan for the game's falling piece: where it goes, and how many times to
  // cycle the queue before it locks. lookAhead false skips the queue.
  function plan(game, lookAhead) {
    var p = game.piece;
    if (!p) return null;
    var here = best(game.grid, p, p.bottom);
    if (!here) return null;
    var cycles = 0;
    if (lookAhead !== false) {
      var top = game.hidden, bestValue = -Infinity;
      for (var k = 0; k < game.queue.length; k++) {
        if (!game.queue[k]) break;
        var next = best(here.out.grid, game.queue[k], top);
        if (next && next.value > bestValue) { bestValue = next.value; cycles = k; }
      }
    }
    return { o: here.o, bx: here.bx, bottom: here.bottom, cycles: cycles, grid: here.out.grid };
  }

  // How well a piece would fit a grid: its best placement's score.
  function nextValue(grid, piece, top) { var b = best(grid, piece, top); return b ? b.value : -Infinity; }

  // The turns that take orientation from to orientation to: a flip first if
  // needed, then the fewest quarter turns.
  function turns(from, to) {
    var out = [], o = from;
    if ((o >> 2) !== (to >> 2)) { out.push('flip'); o = Pieces.flip(o); }
    var d = ((to & 3) - (o & 3) + 4) & 3;
    if (d === 1) out.push('cw');
    else if (d === 2) out.push('cw', 'cw');
    else if (d === 3) out.push('ccw');
    return out;
  }

  Pentrys.Bot = { plan: plan, best: best, nextValue: nextValue, turns: turns, score: score };
})(typeof window !== 'undefined' ? window : globalThis);
