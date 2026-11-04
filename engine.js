/*
 * Rumba engine — Binairo / Tohu-wa-Vohu (LinkedIn "Tango" family) puzzle logic.
 *
 * Rules on an N x N grid (N even), two symbols 0 (SUN) and 1 (MOON):
 *   1. Each row and each column has exactly N/2 of each symbol (balance).
 *   2. No three of the same symbol consecutive in any row or column.
 *   3. "=" between two orthogonally-adjacent cells => they must be equal.
 *      "x" between two adjacent cells => they must differ.
 *
 * A puzzle is: fixed cell givens + a subset of edge constraints, with a
 * unique solution.
 *
 * This file works both in the browser (defines global `Rumba`) and in Node
 * (module.exports), so the generator/solver can be unit-tested with `node`.
 */
(function (root) {
  'use strict';

  var EQ = 1;   // "=" constraint
  var NE = 2;   // "x" constraint

  // ---- seedable PRNG (mulberry32) so "daily" puzzles are reproducible ----
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ---------------------------------------------------------------------
  // Full-solution generator: random valid completed grid.
  // ---------------------------------------------------------------------
  function generateSolution(N, rng) {
    var half = N / 2;
    var board = new Int8Array(N * N).fill(-1);
    var rowCount = [new Int16Array(N), new Int16Array(N)]; // rowCount[v][r]
    var colCount = [new Int16Array(N), new Int16Array(N)];

    function idx(r, c) { return r * N + c; }

    // would placing v at (r,c) keep the partial grid legal (balance + no-3)?
    function ok(r, c, v) {
      if (rowCount[v][r] >= half) return false;
      if (colCount[v][c] >= half) return false;
      // horizontal triple: (r,c-2)(r,c-1)(r,c)
      if (c >= 2 && board[idx(r, c - 1)] === v && board[idx(r, c - 2)] === v) return false;
      // vertical triple
      if (r >= 2 && board[idx(r - 1, c)] === v && board[idx(r - 2, c)] === v) return false;
      return true;
    }

    function solve(pos) {
      if (pos === N * N) return true;
      var r = (pos / N) | 0, c = pos % N;
      var vals = rng() < 0.5 ? [0, 1] : [1, 0];
      for (var k = 0; k < 2; k++) {
        var v = vals[k];
        if (!ok(r, c, v)) continue;
        board[idx(r, c)] = v;
        rowCount[v][r]++; colCount[v][c]++;
        if (solve(pos + 1)) return true;
        board[idx(r, c)] = -1;
        rowCount[v][r]--; colCount[v][c]--;
      }
      return false;
    }

    solve(0);
    return board;
  }

  // ---------------------------------------------------------------------
  // Backtracking solver — counts solutions up to `limit` (default 2).
  // puzzle: { N, cells:Int8Array(-1 empty / 0 / 1), hRel, vRel }
  //   hRel[r*(N-1)+c] : constraint between (r,c)-(r,c+1), 0/EQ/NE
  //   vRel[r*N+c]     : constraint between (r,c)-(r+1,c), 0/EQ/NE
  // ---------------------------------------------------------------------
  function countSolutions(puzzle, limit) {
    limit = limit || 2;
    var N = puzzle.N, half = N / 2;
    var board = Int8Array.from(puzzle.cells);
    var hRel = puzzle.hRel, vRel = puzzle.vRel;
    var rowCount = [new Int16Array(N), new Int16Array(N)];
    var colCount = [new Int16Array(N), new Int16Array(N)];
    var order = [];

    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var v = board[r * N + c];
        if (v >= 0) { rowCount[v][r]++; colCount[v][c]++; }
        else order.push(r * N + c);
      }
    }

    function relOk(r, c, v) {
      // check the (up to 4) constraints touching (r,c) against already-set neighbours
      var i;
      if (c > 0) { i = board[r * N + (c - 1)]; if (i >= 0) { var rel = hRel[r * (N - 1) + (c - 1)]; if (rel === EQ && i !== v) return false; if (rel === NE && i === v) return false; } }
      if (c < N - 1) { i = board[r * N + (c + 1)]; if (i >= 0) { var rel2 = hRel[r * (N - 1) + c]; if (rel2 === EQ && i !== v) return false; if (rel2 === NE && i === v) return false; } }
      if (r > 0) { i = board[(r - 1) * N + c]; if (i >= 0) { var rel3 = vRel[(r - 1) * N + c]; if (rel3 === EQ && i !== v) return false; if (rel3 === NE && i === v) return false; } }
      if (r < N - 1) { i = board[(r + 1) * N + c]; if (i >= 0) { var rel4 = vRel[r * N + c]; if (rel4 === EQ && i !== v) return false; if (rel4 === NE && i === v) return false; } }
      return true;
    }

    function noTriple(r, c, v) {
      if (c >= 2 && board[r * N + c - 1] === v && board[r * N + c - 2] === v) return false;
      if (c <= N - 3 && board[r * N + c + 1] === v && board[r * N + c + 2] === v) return false;
      if (c >= 1 && c <= N - 2 && board[r * N + c - 1] === v && board[r * N + c + 1] === v) return false;
      if (r >= 2 && board[(r - 1) * N + c] === v && board[(r - 2) * N + c] === v) return false;
      if (r <= N - 3 && board[(r + 1) * N + c] === v && board[(r + 2) * N + c] === v) return false;
      if (r >= 1 && r <= N - 2 && board[(r - 1) * N + c] === v && board[(r + 1) * N + c] === v) return false;
      return true;
    }

    function legal(r, c, v) {
      if (rowCount[v][r] >= half) return false;
      if (colCount[v][c] >= half) return false;
      if (!noTriple(r, c, v)) return false;
      if (!relOk(r, c, v)) return false;
      return true;
    }

    var found = 0;
    function search(k) {
      if (found >= limit) return;
      if (k === order.length) { found++; return; }
      var pos = order[k];
      var r = (pos / N) | 0, c = pos % N;
      for (var v = 0; v < 2; v++) {
        if (!legal(r, c, v)) continue;
        board[pos] = v; rowCount[v][r]++; colCount[v][c]++;
        search(k + 1);
        board[pos] = -1; rowCount[v][r]--; colCount[v][c]--;
        if (found >= limit) return;
      }
    }
    search(0);
    return found;
  }

  // ---------------------------------------------------------------------
  // Logic solver — deduction only (no guessing). Returns how far pure logic
  // gets. Used for hints and difficulty grading.
  //   opts.advanced: also use one-cell lookahead ("if this cell were X, the
  //   basic rules hit a contradiction right away, so it is not X"). That is
  //   still a deduction a person can make on paper; it is what makes "hard".
  // Returns { board, solved, steps, level } where steps lists forced fills in
  // order ({r,c,v,reason,src:[cell indexes that justify it]}) and level is
  // 1 (basic rules were enough) or 2 (lookahead was needed).
  // ---------------------------------------------------------------------
  function logicSolve(puzzle, opts) {
    opts = opts || {};
    var N = puzzle.N, half = N / 2;
    var hRel = puzzle.hRel, vRel = puzzle.vRel;
    var board = Int8Array.from(puzzle.cells);
    var steps = [];
    var level = 1;

    // basic rules to a fixpoint on b; returns false on contradiction
    function basic(b, out) {
      function get(r, c) { return (r < 0 || c < 0 || r >= N || c >= N) ? -2 : b[r * N + c]; }
      var bad = false;
      function set(r, c, v, reason, srcCells) {
        var p = r * N + c;
        if (b[p] === -1) { b[p] = v; if (out) out.push({ r: r, c: c, v: v, reason: reason, src: srcCells }); return true; }
        if (b[p] !== v) bad = true;
        return false;
      }
      var changed = true, guard = 0;
      while (changed && !bad && guard++ < 10000) {
        changed = false;
        var r, c, v, p;
        // Rule A: = / x constraints
        for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
          p = r * N + c; v = b[p];
          if (v < 0) continue;
          if (c < N - 1) { var hr = hRel[r * (N - 1) + c]; if (hr && set(r, c + 1, hr === EQ ? v : 1 - v, hr === EQ ? 'eq' : 'ne', [p])) changed = true; }
          if (c > 0) { var hl = hRel[r * (N - 1) + c - 1]; if (hl && set(r, c - 1, hl === EQ ? v : 1 - v, hl === EQ ? 'eq' : 'ne', [p])) changed = true; }
          if (r < N - 1) { var vd = vRel[r * N + c]; if (vd && set(r + 1, c, vd === EQ ? v : 1 - v, vd === EQ ? 'eq' : 'ne', [p])) changed = true; }
          if (r > 0) { var vu = vRel[(r - 1) * N + c]; if (vu && set(r - 1, c, vu === EQ ? v : 1 - v, vu === EQ ? 'eq' : 'ne', [p])) changed = true; }
        }
        // Rule B: no three in a row
        for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
          var a = get(r, c);
          if (a < 0) continue;
          if (get(r, c + 1) === a) {
            if (get(r, c - 1) === -1 && set(r, c - 1, 1 - a, 'no3', [r * N + c, r * N + c + 1])) changed = true;
            if (get(r, c + 2) === -1 && set(r, c + 2, 1 - a, 'no3', [r * N + c, r * N + c + 1])) changed = true;
          }
          if (get(r, c + 2) === a && get(r, c + 1) === -1 && set(r, c + 1, 1 - a, 'no3', [r * N + c, r * N + c + 2])) changed = true;
          if (get(r + 1, c) === a) {
            if (get(r - 1, c) === -1 && set(r - 1, c, 1 - a, 'no3', [r * N + c, (r + 1) * N + c])) changed = true;
            if (get(r + 2, c) === -1 && set(r + 2, c, 1 - a, 'no3', [r * N + c, (r + 1) * N + c])) changed = true;
          }
          if (get(r + 2, c) === a && get(r + 1, c) === -1 && set(r + 1, c, 1 - a, 'no3', [r * N + c, (r + 2) * N + c])) changed = true;
        }
        // Rule C: balance — a line with N/2 of one symbol gets the other
        for (var line = 0; line < N; line++) {
          for (var dir = 0; dir < 2; dir++) {
            var cnt = [0, 0], cells = [], i;
            for (i = 0; i < N; i++) { p = dir ? i * N + line : line * N + i; cells.push(p); if (b[p] >= 0) cnt[b[p]]++; }
            if (cnt[0] > half || cnt[1] > half) { bad = true; break; }
            for (var s = 0; s < 2; s++) {
              if (cnt[s] === half && cnt[0] + cnt[1] < N) {
                for (i = 0; i < N; i++) { p = cells[i]; if (b[p] === -1 && set((p / N) | 0, p % N, 1 - s, 'balance', cells)) changed = true; }
              }
            }
          }
        }
      }
      if (bad) return false;
      // final consistency check (triples)
      for (var q = 0; q < N * N; q++) {
        var x = b[q]; if (x < 0) continue;
        var qr = (q / N) | 0, qc = q % N;
        if (qc <= N - 3 && b[q + 1] === x && b[q + 2] === x) return false;
        if (qr <= N - 3 && b[q + N] === x && b[q + 2 * N] === x) return false;
      }
      return true;
    }

    function full(b) { for (var q = 0; q < N * N; q++) if (b[q] < 0) return false; return true; }

    basic(board, steps);
    if (opts.advanced) {
      var progress = true;
      while (progress && !full(board)) {
        progress = false;
        for (var p = 0; p < N * N && !progress; p++) {
          if (board[p] !== -1) continue;
          for (var v = 0; v < 2; v++) {
            var trial = Int8Array.from(board);
            trial[p] = v;
            if (!basic(trial, null)) {
              level = 2;
              board[p] = 1 - v;
              steps.push({ r: (p / N) | 0, c: p % N, v: 1 - v, reason: 'lookahead', src: [p] });
              basic(board, steps);
              progress = true;
              break;
            }
          }
        }
      }
    }

    return { board: board, solved: full(board), steps: steps, level: level };
  }

  // ---------------------------------------------------------------------
  // Puzzle generator.
  //   opts: { N, difficulty: 'easy'|'medium'|'hard', seed }
  // Returns { N, solution, cells, given, hRel, vRel, difficulty, stats }
  //
  // Strategy: start from a fully-clued board (all cells given + all edge
  // constraints) and greedily remove clues. The removal *predicate* is what
  // sets difficulty:
  //   hard   -> unique AND solvable by logic incl. one-cell lookahead
  //             (never needs guessing; Nikoli rule)
  //   medium -> unique AND solvable by the basic rules alone
  //   easy   -> like medium, then reveal a handful of extra given cells
  // ---------------------------------------------------------------------
  function generate(opts) {
    opts = opts || {};
    var N = opts.N || 6;
    var difficulty = opts.difficulty || 'medium';
    var seed = (opts.seed == null) ? (Math.floor(Math.random() * 2147483647)) : opts.seed;
    var rng = makeRng(seed);

    var sol = generateSolution(N, rng);

    // full edge-constraint tables derived from the solution
    var r, c, i;
    var hFull = new Int8Array(N * (N - 1));
    var vTable = new Int8Array((N - 1) * N);
    for (r = 0; r < N; r++)
      for (c = 0; c < N - 1; c++)
        hFull[r * (N - 1) + c] = (sol[r * N + c] === sol[r * N + c + 1]) ? EQ : NE;
    for (r = 0; r < N - 1; r++)
      for (c = 0; c < N; c++)
        vTable[r * N + c] = (sol[r * N + c] === sol[(r + 1) * N + c]) ? EQ : NE;

    var hRel = Int8Array.from(hFull);
    var vRel = Int8Array.from(vTable);
    var cells = Int8Array.from(sol);
    var given = new Uint8Array(N * N).fill(1);

    function puzzleView() { return { N: N, cells: cells, hRel: hRel, vRel: vRel }; }

    // build removal order; try edges/cells interleaved but cells first so the
    // finished puzzle leans on constraints (Tango-style, fewer fixed cells)
    var clues = [];
    for (i = 0; i < N * N; i++) clues.push({ t: 'c', i: i });
    for (i = 0; i < hRel.length; i++) clues.push({ t: 'h', i: i });
    for (i = 0; i < vRel.length; i++) clues.push({ t: 'v', i: i });
    shuffle(clues, rng);
    clues.sort(function (a, b) { return (a.t === 'c' ? 0 : 1) - (b.t === 'c' ? 0 : 1); });

    var logicOpts = { advanced: difficulty === 'hard' };

    for (var k = 0; k < clues.length; k++) {
      var cl = clues[k], saved;
      if (cl.t === 'h') { saved = hRel[cl.i]; if (!saved) continue; hRel[cl.i] = 0; }
      else if (cl.t === 'v') { saved = vRel[cl.i]; if (!saved) continue; vRel[cl.i] = 0; }
      else { saved = cells[cl.i]; if (saved < 0) continue; cells[cl.i] = -1; given[cl.i] = 0; }

      var keepRemoved = countSolutions(puzzleView(), 2) === 1;
      if (keepRemoved) keepRemoved = logicSolve(puzzleView(), logicOpts).solved;

      if (!keepRemoved) { // revert
        if (cl.t === 'h') hRel[cl.i] = saved;
        else if (cl.t === 'v') vRel[cl.i] = saved;
        else { cells[cl.i] = saved; given[cl.i] = 1; }
      }
    }

    // easy: reveal extra given cells on top of the logic-solvable core
    if (difficulty === 'easy') {
      var empties = [];
      for (i = 0; i < N * N; i++) if (cells[i] < 0) empties.push(i);
      shuffle(empties, rng);
      var extra = Math.round(N * N * 0.18);
      for (i = 0; i < empties.length && extra > 0; i++, extra--) {
        cells[empties[i]] = sol[empties[i]];
        given[empties[i]] = 1;
      }
    }

    var nGiven = 0, nCon = 0;
    for (i = 0; i < cells.length; i++) if (cells[i] >= 0) nGiven++;
    for (i = 0; i < hRel.length; i++) if (hRel[i]) nCon++;
    for (i = 0; i < vRel.length; i++) if (vRel[i]) nCon++;
    var ls = logicSolve(puzzleView(), { advanced: true });
    var logicSolvable = ls.solved;

    return {
      N: N, difficulty: difficulty, seed: seed,
      solution: sol, cells: cells, given: given, hRel: hRel, vRel: vRel,
      stats: { givens: nGiven, constraints: nCon, logicSolvable: logicSolvable, level: ls.level }
    };
  }

  var Rumba = {
    EQ: EQ, NE: NE,
    makeRng: makeRng, shuffle: shuffle,
    generateSolution: generateSolution,
    countSolutions: countSolutions,
    logicSolve: logicSolve,
    generate: generate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Rumba;
  root.Rumba = Rumba;
})(typeof window !== 'undefined' ? window : globalThis);
