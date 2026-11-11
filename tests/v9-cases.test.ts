// v9 C: Mini-Case-Vorlagen – Zahlen, Verkettung, Entscheidung, Determinismus, de/en.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, t } from '../src/i18n/index.ts';
import { mulberry32, seedFromString } from '../src/core/daily.ts';
import { fmt } from '../src/core/numbers.ts';
import { evaluate } from '../src/core/scoring.ts';
import { CASE_TEMPLATES, caseBest, caseById, generateCase, randomCaseId } from '../src/core/cases/index.ts';
import type { CaseNumberStep, CaseStep, MiniCase } from '../src/core/cases/index.ts';
import { stepTask } from '../src/core/cases/task.ts';
import { modeName } from '../src/core/modes.ts';

afterEach(() => setLang('de'));

const SEEDS = 300;
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
const nums = (c: MiniCase): CaseNumberStep[] => c.steps.filter((s): s is CaseNumberStep => s.kind === 'number');
const gen = (id: string, seed: number): MiniCase => generateCase(id, mulberry32(seedFromString(`${id}:${seed}`)));

/** Unabhängige Neuberechnung: erwartete Werte der Zahlenschritte und Index der richtigen Wahl aus den Basiszahlen. */
function recompute(id: string, b: Record<string, number>): { values: number[]; correct: number } {
  const v = (k: string): number => b[k] as number;
  switch (id) {
    case 'market': {
      const g = (v('pop') * v('share')) / 100, f = g * v('rides'), m = f * v('price'), r = (m * v('target')) / 100;
      return { values: [g, f, m, r], correct: r > v('min') ? 0 : 1 };
    }
    case 'profit': {
      const u = v('q') * v('price'), vv = v('q') * v('vc'), g = u - vv - v('fix');
      return { values: [u, vv, g, (g / u) * 100], correct: 0.05 * u > 0.1 * v('fix') ? 0 : 1 };
    }
    case 'breakeven': {
      const db = v('db'), be = v('fix') / db, months = be / v('rate');
      return { values: [db, (db / v('price')) * 100, be, months], correct: months <= v('limit') ? 0 : 1 };
    }
    case 'invest': {
      const c = v('n') * v('k'), s = v('w') * v('kma') - v('wart'), pb = (c * 1000) / s;
      return { values: [c, s, pb, ((5 * s - c * 1000) / (c * 1000)) * 100], correct: pb <= v('limit') ? 0 : 1 };
    }
    case 'pricing': {
      const p1 = v('price') * (1 + v('x') / 100), q1 = v('q') * (1 - v('y') / 100), r0 = v('price') * v('q'), r1 = p1 * q1;
      return { values: [p1, q1, r1, (r1 / r0 - 1) * 100], correct: r1 > r0 ? 0 : 1 };
    }
    case 'ops': {
      const h = (v('v') * v('m')) / 60, fte = h / 8, cost = fte * v('k'), saving = (cost * v('a')) / 100;
      return { values: [h, fte, cost, saving], correct: saving > v('tool') ? 0 : 1 };
    }
    case 'growth': {
      const g = (72 * Math.log2(v('factor'))) / v('n'), big = v('a') * v('factor');
      const r1 = big * (1 + g / 100), r2 = r1 * (1 + g / 100);
      return { values: [v('factor'), g, r1, r2], correct: r2 >= v('target') ? 0 : 1 };
    }
    case 'exhibit': {
      const rev = [v('r0'), v('r1'), v('r2')], m = [v('m0'), v('m1'), v('m2')];
      const total = rev[0]! + rev[1]! + rev[2]!, gain = rev.reduce((s, r, i) => s + (r * m[i]!) / 100, 0);
      return { values: [total, (Math.max(...rev) / total) * 100, gain, (gain / total) * 100], correct: m.indexOf(Math.max(...m)) };
    }
    default: throw new Error(id);
  }
}

/** Welche früheren Zahlenschritte (Index) ein Folgeschritt im Prompt nennen muss (Verkettung). */
const CARRIES: Record<string, number[][]> = {
  market: [[], [0], [1], [2]],
  profit: [[], [], [0, 1], [0, 2]],
  breakeven: [[], [0], [0], [2]],
  invest: [[], [], [0, 1], [0, 1]],
  pricing: [[], [], [0, 1], [2]],
  ops: [[], [0], [1], [2]],
  growth: [[], [0], [1], [1, 2]],
  exhibit: [[], [0], [0], [2, 0]],
};

const text = (c: MiniCase): string[] => [
  c.title, c.brief,
  ...c.steps.flatMap((s) => s.kind === 'number'
    ? [s.prompt, ...(s.unit ? [s.unit] : []), ...(s.hint ? [s.hint] : []), ...s.solution]
    : [s.prompt, s.why, ...s.choices]),
];

test('mindestens acht Vorlagen mit den geplanten IDs', () => {
  const ids = CASE_TEMPLATES.map((c) => c.id);
  assert.ok(ids.length >= 8);
  for (const id of ['market', 'profit', 'breakeven', 'invest', 'pricing', 'ops', 'growth', 'exhibit']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(caseById('nope'), null);
});

for (const lang of ['de', 'en'] as const) {
  for (const tpl of CASE_TEMPLATES) {
    test(`Case ${tpl.id} (${lang}): ${SEEDS} Seeds – Zahlen, Verkettung, Entscheidung, Texte`, () => {
      setLang(lang);
      for (let seed = 0; seed < SEEDS; seed++) {
        const c = gen(tpl.id, seed);
        const where = `${tpl.id}/${lang}/${seed}`;
        assert.equal(c.templateId, tpl.id);
        assert.ok(c.steps.length >= 4 && c.steps.length <= 5, `${where}: Schrittzahl`);
        assert.equal(c.steps.at(-1)?.kind, 'choice', `${where}: letzter Schritt ist die Entscheidung`);
        assert.equal(c.steps.filter((s) => s.kind === 'choice').length, 1);

        // Zahlen endlich, Neuberechnung stimmt
        const numbers = nums(c);
        const re = recompute(tpl.id, c.base);
        assert.equal(numbers.length, re.values.length, where);
        numbers.forEach((s, i) => {
          assert.ok(Number.isFinite(s.expected), `${where}: Schritt ${i} endlich`);
          assert.ok(near(s.expected, re.values[i] as number, 1e-4), `${where}: Schritt ${i} erwartet ${s.expected} ≠ ${re.values[i]}`);
          assert.ok(s.solution.length >= 1 && s.solution.every((l) => l.trim() !== ''), `${where}: Lösungsweg ${i}`);
          assert.ok(s.targetMs > 0 && s.tol.abs >= 0 && s.tol.rel >= 0);
          assert.ok(s.unit !== undefined);
        });

        // Verkettung: Folgeschritte nennen den richtigen Wert des vorigen
        (CARRIES[tpl.id] ?? []).forEach((need, i) => {
          for (const j of need) {
            assert.ok(c.steps[i]?.prompt.includes(fmt(numbers[j]?.expected ?? NaN)) ||
              // Geldbeträge stehen formatiert im Prompt; die Zahl selbst muss trotzdem vorkommen
              c.steps[i]?.prompt.includes(fmt(numbers[j]?.expected ?? NaN, 2)), `${where}: Schritt ${i} nennt Wert von Schritt ${j}`);
          }
        });

        // Genau eine richtige Wahl, aus den Zahlen abgeleitet
        const choice = c.steps.at(-1);
        assert.ok(choice?.kind === 'choice');
        if (choice?.kind === 'choice') {
          assert.ok(choice.choices.length >= 2 && choice.choices.length <= 4);
          assert.equal(new Set(choice.choices).size, choice.choices.length, `${where}: Wahlmöglichkeiten verschieden`);
          assert.ok(Number.isInteger(choice.correctIndex) && choice.correctIndex >= 0 && choice.correctIndex < choice.choices.length);
          assert.equal(choice.correctIndex, re.correct, `${where}: Entscheidung folgt aus den Zahlen`);
          assert.ok(choice.why.length > 10);
          // Wertung: richtige Wahl zählt, jede andere nicht
          const task = stepTask(choice, tpl.id, c.steps.length - 1);
          choice.choices.forEach((_, k) => assert.equal(evaluate(task, k, 5000).correct, k === choice.correctIndex));
        }

        // Richtige Eingabe wird gewertet (inkl. voll ausgeschriebene Zahl bei Mio./Tsd.)
        numbers.forEach((s, i) => {
          const task = stepTask(s, tpl.id, i);
          assert.ok(evaluate(task, s.expected, 5000).correct, `${where}: Wertung Schritt ${i}`);
        });

        // Texte ohne NaN/undefined/Platzhalter
        for (const s of text(c)) {
          assert.ok(!/NaN|undefined|null|\{\w+\}|Infinity|\[object/.test(s), `${where}: Text „${s}“`);
          assert.ok(s.trim() !== '');
        }
        if (c.exhibit) {
          for (const v of Object.values(c.exhibit)) assert.ok(!/NaN|undefined/.test(String(v)));
        }
      }
    });
  }
}

test('Exhibit-Case: Tabelle passt zu den Zahlen', () => {
  const c = gen('exhibit', 7);
  assert.ok(c.exhibit);
  const ex = c.exhibit as Record<string, string | number>;
  assert.equal(ex['ex'], 'table');
  assert.equal(String(ex['lab']).split('|').length, 3);
  assert.equal(String(ex['hd']).split('|').length, 3);
  assert.deepEqual(String(ex['s1']).split('|').map(Number), [c.base['r0'], c.base['r1'], c.base['r2']]);
  assert.deepEqual(String(ex['s2']).split('|').map(Number), [c.base['m0'], c.base['m1'], c.base['m2']]);
  for (const tpl of CASE_TEMPLATES) if (tpl.id !== 'exhibit') assert.equal(gen(tpl.id, 1).exhibit, null);
});

test('Determinismus: gleicher Seed, gleiche Sprache = gleicher Case', () => {
  for (const lang of ['de', 'en'] as const) {
    setLang(lang);
    for (const tpl of CASE_TEMPLATES) {
      for (const seed of [0, 1, 42, 999]) assert.deepEqual(gen(tpl.id, seed), gen(tpl.id, seed), `${tpl.id}/${seed}`);
    }
  }
});

test('Variation: verschiedene Seeds liefern verschiedene Zahlen', () => {
  for (const tpl of CASE_TEMPLATES) {
    const briefs = new Set(Array.from({ length: 40 }, (_, s) => JSON.stringify(gen(tpl.id, s).base)));
    assert.ok(briefs.size >= 8, `${tpl.id}: nur ${briefs.size} Varianten`);
  }
});

test('Zahlen sind case-tauglich: höchstens zwei Nachkommastellen in Prompts', () => {
  for (const tpl of CASE_TEMPLATES) {
    for (let seed = 0; seed < 50; seed++) {
      const c = gen(tpl.id, seed);
      for (const s of nums(c)) assert.ok(Math.abs(Math.round(s.expected * 100) / 100 - s.expected) < 1e-9 || s.tol.rel > 0, `${tpl.id}/${seed}: ${s.expected}`);
    }
  }
});

test('Schätzschritte haben eine Toleranz', () => {
  const c = gen('growth', 3);
  const step = nums(c)[1] as CaseNumberStep;
  assert.ok(step.tol.rel > 0);
  // 72er-Regel: nahe am echten Wachstum wird akzeptiert
  const task = stepTask(step, 'growth', 1);
  assert.ok(evaluate(task, step.expected * 1.05, 5000).correct);
  assert.ok(!evaluate(task, step.expected * 1.5, 5000).correct);
});

test('modeName für case:<id>, Zufall und Bestwerte', () => {
  setLang('de');
  assert.equal(modeName('case:market'), `Mini-Case · ${t('cases.market.title')}`);
  assert.equal(modeName('case:unbekannt'), 'Mini-Case');
  setLang('en');
  assert.match(modeName('case:profit'), /^Mini case · /);

  const rng = mulberry32(5);
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const id = randomCaseId(rng, 'market');
    assert.notEqual(id, 'market');
    seen.add(id);
  }
  assert.equal(seen.size, CASE_TEMPLATES.length - 1);

  const sessions = [
    { mode: 'case:market', n: 5, correct: 3 }, { mode: 'case:market', n: 5, correct: 4 },
    { mode: 'case:profit', n: 5, correct: 5 }, { mode: 'all', n: 10, correct: 10 },
  ];
  assert.deepEqual(caseBest(sessions, 'market'), { correct: 4, n: 5 });
  assert.equal(caseBest(sessions, 'ops'), null);
});

test('Schritte sind Zahlen- oder Auswahlschritte mit Pflichtfeldern', () => {
  const c = gen('market', 2);
  c.steps.forEach((s: CaseStep, i) => {
    const task = stepTask(s, 'market', i);
    assert.equal(task.prompt, s.prompt);
    assert.equal(task.kind === 'choice', s.kind === 'choice');
  });
});
