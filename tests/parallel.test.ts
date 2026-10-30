import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAIN_IDS, DEFAULT_PARALLEL_CONFIG, createParallelState, nextOp, applyOp, opLabel, tick, submitAnswer,
  replayTotals, scoreParallel, updateParallelStats,
} from '../src/core/parallel.ts';
import { mulberry32 } from '../src/core/daily.ts';
import { getParallelStats, setParallelStats, load, resetAll, invalidateCache } from '../src/data/storage.ts';
import type { Level, ParallelConfig, ParallelResult, ParallelState, ParallelStats } from '../src/types.ts';

const cfg = (o: Partial<ParallelConfig> = {}): ParallelConfig => ({ ...DEFAULT_PARALLEL_CONFIG, ...o });

function runStream(state: ParallelState, rng: () => number): ParallelState {
  let s = state;
  for (let t = 0; s.phase === 'stream' && t < 1_000_000; t += 500) s = tick(s, t, rng).state;
  return s;
}

test('Determinismus mit seeded RNG', () => {
  const a = runStream(createParallelState(cfg(), mulberry32(7)), mulberry32(8));
  const b = runStream(createParallelState(cfg(), mulberry32(7)), mulberry32(8));
  assert.deepEqual(a, b);
  assert.deepEqual(CHAIN_IDS, ['A', 'B', 'C', 'D']);
});

test('createParallelState: Startzustand', () => {
  const s = createParallelState(cfg({ startChains: 3 }), mulberry32(1));
  assert.equal(s.phase, 'stream');
  assert.equal(s.chains.length, 3);
  assert.equal(s.nextEventAt, 4000);
  assert.equal(s.remainingMs, 45000);
  for (const c of s.chains) {
    assert.ok(c.currentTotal >= 2 && c.currentTotal <= 20);
    assert.deepEqual(c.history, [`Start ${c.currentTotal}`]);
  }
});

test('nextOp: ganzzahlig, Bereich [1, 999], Level-Regeln', () => {
  for (const level of [1, 2, 3] as Level[]) {
    const rng = mulberry32(level * 31);
    let total = 10;
    for (let i = 0; i < 10000; i++) {
      const { op, value } = nextOp(total, level, rng);
      if (level === 1) assert.ok(op === '+' || op === '−');
      if (level === 2) assert.ok(op !== '÷');
      if (op === '×') assert.ok(total * value <= 500 && value >= 2);
      if (op === '÷') assert.ok(total % value === 0);
      const next = applyOp(total, op, value);
      assert.ok(Number.isInteger(next) && next >= 1 && next <= 999, `${total} ${op} ${value} = ${next}`);
      total = next;
    }
  }
});

test('nextOp: bei hohem Stand bevorzugt − oder ÷', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 200; i++) assert.ok(['−', '÷'].includes(nextOp(400, 3, rng).op));
});

test('opLabel / applyOp', () => {
  assert.equal(opLabel('+', 7), '+ 7');
  assert.equal(opLabel('−', 3), '− 3');
  assert.equal(applyOp(12, '÷', 4), 3);
});

test('tick feuert im richtigen Takt (höchstens 1 Event)', () => {
  const rng = mulberry32(5);
  let s = createParallelState(cfg(), rng);
  let r = tick(s, 3999, rng);
  assert.equal(r.event, null);
  r = tick(r.state, 4000, rng);
  assert.ok(r.event);
  assert.equal(r.event?.at, 4000);
  assert.equal(r.state.nextEventAt, 8000);
  r = tick(r.state, 20000, rng); // nur 1 Event trotz großem Sprung
  assert.equal(r.state.eventCount, 2);
  s = r.state;
  assert.equal(tick(s, 20000, rng).state.eventCount, 3);
});

test('tick ist rein', () => {
  const rng = mulberry32(5);
  const s = createParallelState(cfg(), rng);
  const snap = JSON.stringify(s);
  tick(s, 4000, rng);
  assert.equal(JSON.stringify(s), snap);
});

test('Dynamic Scaling bis max, Ketten A..D', () => {
  const rng = mulberry32(11);
  let s = createParallelState(cfg({ durationMs: 10 ** 7, stepsPerChain: 100, intervalMs: 1000 }), rng);
  const added: string[] = [];
  for (let i = 1; i <= 40; i++) {
    const r = tick(s, i * 1000, rng);
    s = r.state;
    if (r.addedChain) { added.push(r.addedChain.id); assert.equal(r.state.eventCount % 5, 0); }
  }
  assert.deepEqual(added, ['C', 'D']);
  assert.equal(s.chains.length, 4);
});

test('Ende: Zeit', () => {
  const rng = mulberry32(2);
  let s = createParallelState(cfg({ durationMs: 10000 }), rng);
  s = tick(s, 4000, rng).state;
  const r = tick(s, 10000, rng);
  assert.equal(r.ended, true);
  assert.equal(r.state.phase, 'input');
  assert.deepEqual(r.state.answers, r.state.chains.map(() => null));
  assert.equal(r.state.remainingMs, 0);
});

test('Ende: alle Ketten haben stepsPerChain Schritte', () => {
  const rng = mulberry32(2);
  const s = runStream(createParallelState(cfg({ stepsPerChain: 3, durationMs: 10 ** 7, intervalMs: 1000, addChainEvery: 99 }), rng), rng);
  assert.equal(s.phase, 'input');
  for (const c of s.chains) assert.equal(c.history.length - 1, 3);
});

test('submitAnswer: Navigation bis result', () => {
  const rng = mulberry32(4);
  let s = runStream(createParallelState(cfg({ durationMs: 5000 }), rng), rng);
  assert.equal(s.phase, 'input');
  s = submitAnswer(s, 5);
  assert.equal(s.phase, 'input');
  assert.equal(s.inputIndex, 1);
  s = submitAnswer(s, null);
  assert.equal(s.phase, 'result');
  assert.deepEqual(s.answers, [5, null]);
});

test('replayTotals == currentTotal', () => {
  for (const level of [1, 2, 3] as Level[]) {
    const rng = mulberry32(level);
    const s = runStream(createParallelState(cfg({ level, durationMs: 10 ** 7, stepsPerChain: 40, intervalMs: 100, startChains: 4 }), rng), rng);
    for (const c of s.chains) {
      const t = replayTotals(c.history);
      assert.equal(t.length, c.history.length);
      assert.equal(t[t.length - 1], c.currentTotal);
    }
  }
  assert.deepEqual(replayTotals(['Start 12', '+ 7', '× 2', '÷ 4', '− 3']), [12, 19, 38, 9.5, 6.5]);
});

function resultFor(n: number, rightIdx: number[]): ParallelState {
  const rng = mulberry32(9);
  let s = createParallelState(cfg({ startChains: n as 2 | 3 | 4, stepsPerChain: 4, durationMs: 10 ** 7, intervalMs: 100, addChainEvery: 99 }), rng);
  s = runStream(s, rng);
  s.chains.forEach((c, i) => { s = submitAnswer(s, rightIdx.includes(i) ? c.currentTotal : -1); });
  return s;
}

test('Scoring: Faktor nach Kettenzahl', () => {
  const r2 = scoreParallel(resultFor(2, [0, 1]));
  assert.equal(r2.allCorrect, true);
  assert.equal(r2.points, 2 * 100 + 5 * 8);
  const r3 = scoreParallel(resultFor(3, [0, 1, 2]));
  assert.equal(r3.points, 3 * 150 + 5 * 12);
  const r4 = scoreParallel(resultFor(4, [0, 2]));
  assert.equal(r4.correct, 2);
  assert.equal(r4.allCorrect, false);
  assert.equal(r4.points, 2 * 200 + 5 * 8);
  assert.equal(scoreParallel(resultFor(2, [])).points, 0);
});

test('updateParallelStats: nextStart, Bestwerte, rounds', () => {
  const base: ParallelStats = { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 };
  const res = (correct: number, total: number): ParallelResult => ({ chains: [], correct, total, allCorrect: correct === total, points: 0 });
  let s = updateParallelStats(base, res(2, 2), 1);
  assert.deepEqual(s, { nextStart: 3, bestChains: 2, bestCorrectStreak: 1, rounds: 1 });
  s = updateParallelStats(s, res(3, 3), 2);
  s = updateParallelStats(s, res(4, 4), 3);
  assert.equal(s.nextStart, 4);
  s = updateParallelStats(s, res(4, 4), 4);
  assert.equal(s.nextStart, 4);
  assert.equal(s.bestChains, 4);
  s = updateParallelStats(s, res(2, 4), 0);
  assert.equal(s.nextStart, 4);
  assert.equal(s.bestCorrectStreak, 4);
  s = updateParallelStats(s, res(1, 4), 0);
  assert.equal(s.nextStart, 3);
  s = updateParallelStats({ ...base }, res(0, 2), 0);
  assert.equal(s.nextStart, 2);
  assert.equal(s.bestChains, 0);
});

test('Storage: Default, Migration, set/get', () => {
  const raw = new Map<string, string>([['kopfrechner.v1', JSON.stringify({ version: 1, attempts: [] })]]);
  const ls = {
    get length() { return raw.size; }, clear() { raw.clear(); }, key: (i: number) => [...raw.keys()][i] ?? null,
    getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => { raw.set(k, String(v)); },
    removeItem: (k: string) => { raw.delete(k); },
  } as Storage;
  resetAll();
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  invalidateCache();
  try {
    assert.deepEqual(load().parallel, { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 });
    setParallelStats({ nextStart: 3, bestChains: 4, bestCorrectStreak: 2, rounds: 5 });
    invalidateCache();
    assert.deepEqual(getParallelStats(), { nextStart: 3, bestChains: 4, bestCorrectStreak: 2, rounds: 5 });
    raw.set('kopfrechner.v1', JSON.stringify({ version: 2, parallel: { nextStart: 9, rounds: 'x' } }));
    invalidateCache();
    assert.deepEqual(getParallelStats(), { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 });
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetAll();
  }
});

test('Kettenauswahl: nie zweimal dieselbe Kette hintereinander, ausgeglichene Verteilung', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = mulberry32(seed);
    let st = createParallelState({ ...DEFAULT_PARALLEL_CONFIG, intervalMs: 3000, level: 2 }, rng);
    let last: string | null = null;
    for (let t = 0; t <= 46000 && st.phase === 'stream'; t += 100) {
      const r = tick(st, t, rng);
      st = r.state;
      if (r.event) {
        if (st.chains.filter((c) => c.history.length - 1 < st.config.stepsPerChain).length > 1 || last !== r.event.chainId) {
          assert.notEqual(r.event.chainId, last, `seed ${seed}: Kette ${r.event.chainId} doppelt`);
        }
        last = r.event.chainId;
      }
    }
    const steps = st.chains.map((c) => c.history.length - 1);
    assert.ok(Math.max(...steps) - Math.min(...steps) <= 6, `seed ${seed}: Schritte ${steps.join('/')}`);
  }
});
