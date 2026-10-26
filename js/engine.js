/* Чистая механика: линии, сиды, генерация прокрута. Без DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KSEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const REELS = 5;
  const ROWS = 3;

  // Пять линий: три горизонтали + V и Λ.
  const LINES = [
    { id: "top", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { id: "mid", cells: [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]] },
    { id: "bot", cells: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]] },
    { id: "v", cells: [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]] },
    { id: "lambda", cells: [[0, 2], [1, 1], [2, 0], [3, 1], [4, 2]] }
  ];

  const WIN_RATE = 1 / 20;

  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function detectWins(grid) {
    const wins = [];
    for (const line of LINES) {
      const ids = line.cells.map(([r, y]) => grid[r][y]);
      const real = ids.filter(id => id !== "joker");
      if (real.length === 0) { wins.push({ line, partyId: null, blank: true }); continue; }
      if (real.every(id => id === real[0])) wins.push({ line, partyId: real[0], blank: false });
    }
    return wins;
  }

  /**
   * @param {string} seed
   * @param {number} spin  1-based номер прокрута
   * @param {string[]} ids идентификаторы символов, включая "joker"
   * @param {number} winRate целевая частота выигрыша
   */
  function generate(seed, spin, ids, winRate) {
    const rate = winRate == null ? WIN_RATE : winRate;
    const rnd = mulberry32(hash32(seed + ":" + spin));
    const grid = [[], [], [], [], []];
    const parties = ids.filter(id => id !== "joker");

    if (rnd() < rate) {
      const line = LINES[Math.floor(rnd() * LINES.length)];
      const partyId = parties[Math.floor(rnd() * parties.length)];
      const jokerAt = rnd() < 0.22 ? Math.floor(rnd() * 5) : -1;
      line.cells.forEach(([r, y], i) => { grid[r][y] = i === jokerAt ? "joker" : partyId; });
    }

    for (let r = 0; r < REELS; r++) {
      for (let y = 0; y < ROWS; y++) {
        if (grid[r][y]) continue;
        grid[r][y] = ids[Math.floor(rnd() * ids.length)];
      }
    }

    return { grid, wins: detectWins(grid) };
  }

  return { REELS, ROWS, LINES, WIN_RATE, generate, detectWins, hash32, mulberry32 };
});
