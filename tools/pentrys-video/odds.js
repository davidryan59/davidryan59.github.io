/* The special-square odds the film deals in its natural play section, as
   [kind, N] for 1 in N. David's brief: most kinds at about 1 in 30, 1 in 50 or
   1 in 100. The numbers below apply to this film alone. BASE_PIECES build the
   stack before the section starts, and SHOWN_PIECES play on screen. */
(function (root) {
  var odds = {
    FILM_ODDS: [[2, 30], [3, 50], [0, 50], ['flood', 50], ['deluge', 100], ['bomb', 50], ['rowbomb', 100]],
    BASE_PIECES: 9,
    SHOWN_PIECES: 12
  };
  if (typeof module !== 'undefined') module.exports = odds; else root.PentrysFilmOdds = odds;
})(this);
