import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, SUBTYPES, LEVEL_WEIGHT, generate, generateForMode } from '../src/core/generators/index.ts';
import { activeCategories } from '../src/core/catalog.ts';
import { solutionSteps } from '../src/core/solutions/index.ts';
import { getMethod } from '../src/core/methods.ts';
import { evaluate } from '../src/core/scoring.ts';
import { dailyTasks, dailyShareText, mulberry32, seedFromString } from '../src/core/daily.ts';
import { chainTask, chainStepLabel } from '../src/core/chain.ts';
import { personalBest, ghostProgress, apmSeries, recommendation } from '../src/core/progress.ts';
import { fmt } from '../src/core/numbers.ts';
import { mkTask } from './helpers.ts';
import type { Attempt, ChainOp, CustomRange, Level, Session, Task } from '../src/types.ts';

const LEVELS: Level[] = [1, 2, 3];
const NEW_IDS = ['tricks.x11', 'tricks.diffsq', 'tricks.near100', 'tricks.square5', 'tricks.pctswap', 'tricks.subround', 'custom.mul', 'custom.square'];
const num = (t: Task): number => {
  assert.notEqual(t.kind, 'choice');
  return t.expected;
};

test('Katalog: tricks sichtbar, custom versteckt, 8 neue Subtypen mit Methode', () => {
  const tricks = CATEGORIES.find((c) => c.id === 'tricks');
  assert.equal(tricks?.name, 'Rechentricks');
  assert.ok(!tricks?.hidden);
  assert.equal(CATEGORIES.find((c) => c.id === 'custom')?.hidden, true);
  assert.ok(activeCategories(null).every((c) => c.id !== 'custom'));
  assert.ok(activeCategories(['custom']).every((c) => c.id !== 'custom'));
  assert.ok(activeCategories(null).some((c) => c.id === 'tricks'));
  for (const id of NEW_IDS) {
    assert.ok(SUBTYPES[id], id);
    assert.ok(getMethod(id), id);
  }
});

for (const id of NEW_IDS) {
  test(`neue Subtypen × Level: ${id}`, () => {
    for (const level of LEVELS) {
      for (let i = 0; i < 200; i++) {
        const t = generate(id, Math.random, { level });
        const steps = solutionSteps(t);
        const ctx = `L${level} ${t.prompt} → ${JSON.stringify(steps)}`;
        assert.equal(t.level, level);
        assert.ok(Math.abs(t.weight - SUBTYPES[id]!.weight * LEVEL_WEIGHT[level]) < 1e-9);
        assert.ok(Number.isInteger(num(t)), ctx);
        assert.ok(steps.length >= 3 && steps.length <= 6, ctx);
        assert.ok((steps[steps.length - 1] ?? '').includes(fmt(t.expected)), ctx);
        assert.equal(evaluate(t, t.expected, 1000).correct, true, ctx);
        assert.doesNotMatch(`${t.prompt} ${steps.join(' ')}`, /NaN|undefined|Infinity/);
        assert.ok(Object.keys(t.params).length > 0);
      }
    }
  });
}

test('Tricks: Aufgaben erfüllen die Voraussetzung des Tricks', () => {
  for (const level of LEVELS) {
    for (let i = 0; i < 300; i++) {
      const x = generate('tricks.x11', Math.random, { level });
      const n = Number(x.params.n);
      assert.equal(x.expected, n * 11);
      if (level === 1) assert.ok(n < 100 && Math.floor(n / 10) + (n % 10) <= 9, `x11 L1 ${n}`);
      if (level === 3) assert.ok(n >= 100 && n <= 999);
      else assert.ok(n >= 10 && n <= 99);

      const d = generate('tricks.diffsq', Math.random, { level });
      const [a, b, m, dd] = [d.params.a, d.params.b, d.params.m, d.params.d].map(Number) as [number, number, number, number];
      assert.equal(m % 10, 0);
      assert.equal(a + b, 2 * m);
      assert.equal(d.expected, a * b);
      assert.ok(dd >= 1 && dd < 10);

      const c = generate('tricks.near100', Math.random, { level });
      assert.ok(Number(c.params.a) >= 85 && Number(c.params.a) <= 99 && Number(c.params.b) >= 85 && Number(c.params.b) <= 99);
      if (level !== 3) assert.ok(Number(c.params.a) >= 88 && Number(c.params.b) >= 88);

      const q = generate('tricks.square5', Math.random, { level });
      const s = Number(q.params.n);
      assert.equal(s % 10, 5);
      assert.ok(level === 3 ? s >= 105 && s <= 195 : s >= 15 && s <= 95);

      const p = generate('tricks.pctswap', Math.random, { level });
      assert.ok([10, 20, 25, 50].includes(Number(p.params.y)));
      assert.equal(p.expected, (Number(p.params.p) * Number(p.params.y)) / 100);

      const r = generate('tricks.subround', Math.random, { level });
      assert.ok(Number(r.params.b) % 10 >= 7);
      assert.equal(r.expected, Number(r.params.a) - Number(r.params.b));
    }
  }
  assert.match(solutionSteps(mkTaskOf('tricks.near100', { a: 97, b: 96 }, 9312)).join(' '), /9\.312/);
});

function mkTaskOf(subtype: string, params: Record<string, number>, expected: number): Task {
  return mkTask({ subtype, params, expected });
}

test('Tricks: Beispiele aus dem Plan', () => {
  assert.match(solutionSteps(mkTaskOf('tricks.diffsq', { a: 47, b: 53, m: 50, d: 3 }, 2491)).join(' '), /50² − 3²/);
  assert.match(solutionSteps(mkTaskOf('tricks.x11', { n: 47 }, 517)).join(' '), /4 \| 4\+7 \| 7/);
  assert.match(solutionSteps(mkTaskOf('tricks.subround', { a: 83, b: 38 }, 45)).join(' '), /83 − 40/);
});

test('Custom-Bereiche', () => {
  const mul: CustomRange = { kind: 'mul', aMin: 13, aMax: 19, bMin: 2, bMax: 9 };
  const sq: CustomRange = { kind: 'square', aMin: 11, aMax: 30 };
  for (let i = 0; i < 300; i++) {
    const t = generate('custom.mul', Math.random, { custom: mul });
    assert.ok(Number(t.params.a) >= 13 && Number(t.params.a) <= 19);
    assert.ok(Number(t.params.b) >= 2 && Number(t.params.b) <= 9);
    assert.equal(t.expected, Number(t.params.a) * Number(t.params.b));
    const s = generate('custom.square', Math.random, { custom: sq });
    assert.ok(Number(s.params.n) >= 11 && Number(s.params.n) <= 30);
    assert.equal(s.expected, Number(s.params.n) ** 2);
    // Fallback ohne Bereich
    const f = generate('custom.mul');
    assert.ok(Number(f.params.a) >= 2 && Number(f.params.a) <= 9 && Number(f.params.b) >= 2 && Number(f.params.b) <= 9);
    const g = generate('custom.square');
    assert.ok(Number(g.params.n) >= 11 && Number(g.params.n) <= 20);
  }
  // vertauschte Grenzen werden korrigiert
  const swapped = generate('custom.square', Math.random, { custom: { kind: 'square', aMin: 30, aMax: 25 } });
  assert.ok(Number(swapped.params.n) >= 25 && Number(swapped.params.n) <= 30);
  // generateForMode('custom')
  assert.equal(generateForMode('custom', { custom: sq }).subtype, 'custom.square');
  assert.equal(generateForMode('custom', { custom: mul }).subtype, 'custom.mul');
  assert.equal(generateForMode('custom', { custom: mul }).mode, 'custom');
  assert.equal(generateForMode('custom').subtype, 'custom.mul');
  // einstellige und große Bereiche haben gültige Lösungswege
  for (const r of [{ kind: 'mul', aMin: 1, aMax: 1, bMin: 1, bMax: 1 }, { kind: 'mul', aMin: 100, aMax: 999, bMin: 10, bMax: 99 }, { kind: 'mul', aMin: 20, aMax: 20, bMin: 7, bMax: 7 }] as CustomRange[]) {
    const t = generate('custom.mul', Math.random, { custom: r });
    const st = solutionSteps(t);
    assert.ok(st.length >= 3 && (st[st.length - 1] ?? '').includes(fmt(t.expected)), JSON.stringify(st));
  }
});

test('Versteckte Kategorien erscheinen nie in all/weak/review/Empfehlung', () => {
  for (let i = 0; i < 400; i++) {
    for (const mode of ['all', 'weak', 'review']) {
      const t = generateForMode(mode, { weakSubtypes: ['custom.mul', 'pct.of'], reviewSubtypes: ['custom.square', 'biz.roi'] });
      assert.notEqual(t.category, 'custom', mode);
    }
  }
  const now = Date.now();
  const rec = recommendation([], { 'custom.mul': { box: 1, dueAt: now - 1, lastTs: now - 100 } }, now);
  assert.notEqual(rec.kind, 'review');
  const attempts: Attempt[] = Array.from({ length: 6 }, (_, i) => ({
    ts: now - i, sessionId: 's', mode: 'custom', category: 'custom', subtype: 'custom.mul', prompt: '', unit: '', expected: 1, given: 2,
    correct: false, errorType: 'falsch', timeMs: 9000, targetMs: 5000, weight: 1, points: 0,
  }));
  const r2 = recommendation(attempts, {}, now);
  assert.ok(!r2.mode.startsWith('custom'));
  // neue Aufgaben in der Empfehlung kommen nie aus custom
  assert.notEqual(SUBTYPES[r2.subtype ?? 'pct.of']?.category, 'custom');
});

test('Schätzmodus: ±5 % und Punkte × 0,7', () => {
  const t = mkTask({ expected: 1000, weight: 1, targetMs: 10000 });
  const exact = evaluate(t, 1000, 1000);
  assert.equal(exact.correct, true);
  assert.equal(evaluate(t, 1040, 1000).correct, false);
  const e = evaluate(t, 1040, 1000, { estimate: true });
  assert.equal(e.correct, true);
  assert.equal(e.points, Math.round(100 * 1 * e.timeFactor * 0.7));
  assert.equal(evaluate(t, 1000, 1000, { estimate: true }).points, Math.round(exact.points * 0.7));
  assert.equal(evaluate(t, 960, 1000, { estimate: true }).correct, true);
  assert.equal(evaluate(t, 1100, 1000, { estimate: true }).correct, false);
  // vorhandene Toleranz bleibt, wenn größer
  const wide = mkTask({ expected: 1000, tolerance: { abs: 0, rel: 0.08 } });
  assert.equal(evaluate(wide, 1070, 1000, { estimate: true }).correct, true);
  // ausgenommen: Auswahl, mag.*, frac.topct
  const mag = mkTask({ subtype: 'mag.exponent', category: 'mag', expected: 7 });
  assert.equal(evaluate(mag, 7.3, 1000, { estimate: true }).correct, false);
  const topct = mkTask({ subtype: 'frac.topct', category: 'frac', expected: 100 });
  assert.equal(evaluate(topct, 104, 1000, { estimate: true }).correct, false);
  const choice = { ...mkTask({ expected: 2 }), kind: 'choice' as const, choices: ['a', 'b', 'c', 'd'] };
  assert.equal(evaluate(choice, 2, 1000, { estimate: true }).points, evaluate(choice, 2, 1000).points);
  assert.equal(evaluate(choice, 3, 1000, { estimate: true }).correct, false);
});

test('mulberry32 / seedFromString deterministisch', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.equal(seedFromString('2026-10-30'), seedFromString('2026-10-30'));
  assert.notEqual(seedFromString('2026-10-30'), seedFromString('2026-10-31'));
});

test('dailyTasks: 15 deterministische Aufgaben, Level 2, sichtbare Kategorien ohne Drills reihum', () => {
  const a = dailyTasks('2026-10-30'), b = dailyTasks('2026-10-30'), c = dailyTasks('2026-10-31');
  assert.equal(a.length, 15);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((t) => t.prompt), c.map((t) => t.prompt));
  const vis = CATEGORIES.filter((x) => !x.hidden && !x.drill);
  a.forEach((t, i) => {
    assert.equal(t.level, 2);
    assert.equal(t.mode, 'daily');
    assert.equal(t.category, vis[i % vis.length]!.id);
    assert.notEqual(t.category, 'custom');
  });
  assert.equal(new Set(a.map((t) => t.id)).size, 15);
});

test('dailyShareText', () => {
  const txt = dailyShareText({ n: 15, correct: 13, points: 1240, timeMs: 151000, ts: 0 }, '2026-10-30', 'https://example.org/');
  assert.equal(txt, 'Mental Math Daily 30.10.2026: 13/15 · 1.240 Pkt · 2:31 min\nhttps://example.org/');
});

test('chainTask: korrekt, ganzzahlig, Level-Struktur', () => {
  const lens: Record<Level, number> = { 1: 5, 2: 7, 3: 9 };
  for (const level of LEVELS) {
    for (let i = 0; i < 300; i++) {
      const t = chainTask(level);
      assert.equal(t.steps.length, lens[level]);
      let cur = t.start;
      for (const s of t.steps) {
        const op: ChainOp = s.op;
        cur = op === '+' ? cur + s.value : op === '−' ? cur - s.value : op === '×' ? cur * s.value : cur / s.value;
        assert.ok(Number.isInteger(cur) && cur >= 1, `${level}: ${cur}`);
        if (level < 3) assert.ok(s.value >= 1 && s.value <= 9);
        if (level === 1) assert.ok(op === '+' || op === '−');
      }
      assert.equal(cur, t.result);
      const ops = t.steps.map((s) => s.op);
      if (level >= 2) assert.ok(ops.includes('×'));
      if (level === 3) assert.ok(ops.includes('÷'));
    }
  }
  assert.equal(chainStepLabel({ op: '+', value: 5 }), '+ 5');
  assert.equal(chainStepLabel({ op: '×', value: 3 }), '× 3');
  // deterministisch mit seeded rng
  assert.deepEqual(chainTask(3, mulberry32(7)), chainTask(3, mulberry32(7)));
});

const sess = (o: Partial<Session>): Session => ({ id: 'x', ts: 1, mode: 'pct', n: 10, correct: 9, points: 500, avgTimeMs: 5000, ...o });

test('personalBest', () => {
  const list = [
    sess({ id: 'a', avgTimeMs: 6000, ts: 10 }),
    sess({ id: 'b', avgTimeMs: 4000, ts: 20, points: 700 }),
    sess({ id: 'c', avgTimeMs: 2000, correct: 7 }), // < 80 %
    sess({ id: 'd', avgTimeMs: 1000, n: 4, correct: 4 }), // n < 5
    sess({ id: 'e', avgTimeMs: 500, mode: 'mult' }), // anderer Modus
  ];
  assert.deepEqual(personalBest(list, 'pct'), { mode: 'pct', avgMs: 4000, points: 700, ts: 20 });
  assert.equal(personalBest(list, 'biz'), null);
  assert.equal(personalBest([], 'pct'), null);
  assert.equal(personalBest([sess({ correct: 8 })], 'pct')?.avgMs, 5000); // genau 80 %
});

test('ghostProgress', () => {
  const best = { mode: 'pct', avgMs: 5000, points: 1, ts: 1 };
  assert.equal(ghostProgress(null, 1000, 10), null);
  assert.equal(ghostProgress(best, 0, 10), 0);
  assert.equal(ghostProgress(best, 25000, 10), 0.5);
  assert.equal(ghostProgress(best, 99999, 10), 1);
});

test('apmSeries', () => {
  const now = new Date(2026, 5, 15, 12).getTime();
  const day = (off: number): number => new Date(2026, 5, 15 + off, 12).getTime();
  const key = (off: number): string => {
    const d = new Date(day(off));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const mk = (ts: number, correct: boolean): Attempt => ({
    ts, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1, correct,
    errorType: correct ? null : 'falsch', timeMs: 1000, targetMs: 1000, weight: 1, points: 0,
  });
  const attempts = [mk(day(0), true), mk(day(0), true), mk(day(0), false), mk(day(0), true), mk(day(-1), true)];
  const series = apmSeries(attempts, { [key(0)]: 120000, [key(-1)]: 30000 }, { days: 30, now });
  assert.equal(series.length, 30);
  const last = series[series.length - 1]!;
  assert.equal(last.date, key(0));
  assert.equal(last.perMinute, 2); // 4 Aufgaben / 2 Minuten
  assert.equal(last.accuracy, 0.75);
  const prev = series[series.length - 2]!;
  assert.equal(prev.perMinute, null); // < 1 Minute
  assert.equal(prev.accuracy, 1);
  assert.equal(series[0]!.perMinute, null);
  assert.equal(series[0]!.accuracy, null);
  assert.equal(apmSeries([], {}, { days: 7, now }).length, 7);
});
