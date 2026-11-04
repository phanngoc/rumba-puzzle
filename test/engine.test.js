/* Rumba engine tests. Run: npm test */
'use strict';
const assert = require('node:assert');
const R = require('../engine.js');

let pass = 0;
function t(name, fn) { fn(); pass++; console.log('  ok  ' + name); }

function valid(N, b, hRel, vRel) {
  const half = N / 2;
  for (let i = 0; i < N; i++) {
    let r0 = 0, c0 = 0;
    for (let j = 0; j < N; j++) { if (b[i * N + j] === 0) r0++; if (b[j * N + i] === 0) c0++; }
    if (r0 !== half || c0 !== half) return false;
  }
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = b[r * N + c];
    if (c <= N - 3 && b[r * N + c + 1] === v && b[r * N + c + 2] === v) return false;
    if (r <= N - 3 && b[(r + 1) * N + c] === v && b[(r + 2) * N + c] === v) return false;
    if (c < N - 1) { const h = hRel[r * (N - 1) + c]; if (h === R.EQ && b[r * N + c + 1] !== v) return false; if (h === R.NE && b[r * N + c + 1] === v) return false; }
    if (r < N - 1) { const w = vRel[r * N + c]; if (w === R.EQ && b[(r + 1) * N + c] !== v) return false; if (w === R.NE && b[(r + 1) * N + c] === v) return false; }
  }
  return true;
}

t('200 hard 8x8 seeds: unique, logic-solvable, each < 1s', () => {
  let worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const t0 = Date.now();
    const p = R.generate({ N: 8, difficulty: 'hard', seed });
    const ms = Date.now() - t0; worst = Math.max(worst, ms);
    assert.ok(ms < 1000, 'seed ' + seed + ' took ' + ms + 'ms');
    const ls = R.logicSolve(p, { advanced: true });
    assert.ok(ls.solved, 'hard seed ' + seed + ' not solvable by logic');
    assert.deepStrictEqual(Array.from(ls.board), Array.from(p.solution), 'logic result != solution, seed ' + seed);
    assert.strictEqual(R.countSolutions(p, 2), 1, 'not unique, seed ' + seed);
  }
  console.log('      worst generation time ' + worst + 'ms');
});

t('200 hard 6x6 seeds are logic-solvable', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = R.generate({ N: 6, difficulty: 'hard', seed });
    assert.ok(R.logicSolve(p, { advanced: true }).solved, 'seed ' + seed);
  }
});

t('easy/medium are solvable by basic rules alone', () => {
  for (const N of [6, 8]) for (const difficulty of ['easy', 'medium']) for (let seed = 1; seed <= 30; seed++) {
    const p = R.generate({ N, difficulty, seed });
    assert.ok(R.logicSolve(p).solved, N + ' ' + difficulty + ' ' + seed);
  }
});

t('solutions are valid boards', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const p = R.generate({ N: 8, difficulty: 'medium', seed });
    assert.ok(valid(8, p.solution, p.hRel, p.vRel));
  }
});

t('same seed -> same puzzle (daily reproducible)', () => {
  const a = R.generate({ N: 6, difficulty: 'medium', seed: 20261104 });
  const b = R.generate({ N: 6, difficulty: 'medium', seed: 20261104 });
  assert.deepStrictEqual(Array.from(a.cells), Array.from(b.cells));
  assert.deepStrictEqual(Array.from(a.hRel), Array.from(b.hRel));
});

t('logic steps carry source cells for hint highlighting', () => {
  const p = R.generate({ N: 6, difficulty: 'hard', seed: 7 });
  const steps = R.logicSolve(p, { advanced: true }).steps;
  assert.ok(steps.length > 0);
  for (const s of steps) assert.ok(Array.isArray(s.src) && s.src.length > 0 && typeof s.reason === 'string');
});

console.log(pass + ' passed');
