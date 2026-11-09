// Einstufungstest (src/core/placement.ts) und Startstufen je Typ (src/core/adaptive.ts → startStep, setPlacement)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Attempt } from '../src/types.ts';
import { MAX_ITEMS, RUNGS, START_RUNG, passed, placementState, probeTask, summary } from '../src/core/placement.ts';
import type { PlacementAnswer } from '../src/core/placement.ts';
import { THETA_MAX, TIER, adaptiveStep, getPlacement, planTask, setPlacement, startStep } from '../src/core/adaptive.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { normalizePlacement, normalizeSettings } from '../src/data/schema.ts';

afterEach(() => setPlacement(null));

const ok: PlacementAnswer = { correct: true, timeMs: 3000, targetMs: 5000 };
const bad: PlacementAnswer = { correct: false, timeMs: 3000, targetMs: 5000 };
const slow: PlacementAnswer = { correct: true, timeMs: 11000, targetMs: 5000 };

/** Spielt eine Person mit fester Fähigkeit: besteht jede Sprosse ≤ ability, sonst nicht. */
function simulate(ability: number, slip = false): { theta: number; items: number } {
  const answers: PlacementAnswer[] = [];
  let slipped = false;
  for (let i = 0; i < 50; i++) {
    const st = placementState(answers);
    if (!st.next) return { theta: st.theta, items: answers.length };
    let pass = st.next.rung <= ability;
    if (pass && slip && !slipped) { pass = false; slipped = true; } // ein Patzer
    answers.push(pass ? ok : bad);
  }
  throw new Error('Test endet nicht');
}

test('passed: richtig und höchstens doppelte Zielzeit', () => {
  assert.equal(passed(ok), true);
  assert.equal(passed(bad), false);
  assert.equal(passed(slow), false);
  assert.equal(passed({ correct: true, timeMs: 10000, targetMs: 5000 }), true);
});

test('Ablauf: Start auf Sprosse 2, rauf bei Erfolg, zweite Chance, runter nach zwei Fehlern', () => {
  assert.deepEqual(placementState([]), { next: { rung: START_RUNG, probe: 0 }, theta: 0 });
  assert.deepEqual(placementState([ok]), { next: { rung: 3, probe: 0 }, theta: 2 });
  assert.deepEqual(placementState([ok, bad]), { next: { rung: 3, probe: 1 }, theta: 2 });
  assert.deepEqual(placementState([ok, bad, ok]), { next: { rung: 4, probe: 0 }, theta: 3 });
  assert.deepEqual(placementState([ok, bad, bad]), { next: null, theta: 2 });
  assert.deepEqual(placementState([bad, bad]), { next: { rung: 1, probe: 0 }, theta: 0 });
  assert.deepEqual(placementState([bad, bad, ok]), { next: null, theta: 1 });
  assert.deepEqual(placementState([bad, bad, bad, bad]), { next: null, theta: 0 });
  assert.deepEqual(placementState([bad, bad, bad, ok]), { next: null, theta: 1 });
});

test('Ergebnis = Fähigkeit, auch mit einem Patzer; nie mehr als MAX_ITEMS Aufgaben', () => {
  for (let ability = 0; ability <= RUNGS.length; ability++) {
    for (const slip of [false, true]) {
      const r = simulate(ability, slip);
      assert.equal(r.theta, ability, `Fähigkeit ${ability}, Patzer ${slip}`);
      assert.ok(r.items <= MAX_ITEMS, `${r.items} Aufgaben`);
      assert.ok(r.items >= 2);
    }
  }
  assert.equal(MAX_ITEMS, 10);
  // Schlimmster Fall: auf jeder Sprosse 2–6 ein Patzer, dann bestanden → genau MAX_ITEMS
  const worst = Array.from({ length: 5 }, () => [bad, ok]).flat();
  assert.deepEqual(placementState(worst), { next: null, theta: 6 });
  assert.equal(worst.length, MAX_ITEMS);
  assert.equal(simulate(3).items, 4); // Sprosse 2 und 3 bestanden, zweimal daneben auf 4
});

test('probeTask: Typ und Stufe der Sprosse, Modus placement', () => {
  RUNGS.forEach(([a, b], i) => {
    for (const [probe, spec] of [[0, a], [1, b]] as const) {
      assert.ok(SUBTYPES[spec.subtype], spec.subtype);
      const t = probeTask(i + 1, probe);
      assert.equal(t.subtype, spec.subtype);
      assert.equal(t.level, spec.level);
      assert.equal(t.mode, 'placement');
    }
  });
});

test('startStep: theta − Anspruch, Vorstufe nur bei schwachem Ergebnis', () => {
  for (const id of Object.keys(TIER)) assert.ok(SUBTYPES[id], id);
  assert.equal(startStep('table.mul', 0), 0);
  assert.equal(startStep('mult.2x2', 0), 0);
  assert.equal(startStep('table.mul', 1), 1);
  assert.equal(startStep('mult.2x1', 1), 0);
  assert.equal(startStep('mult.2x1', 2), 1);
  assert.equal(startStep('growth.cagr', 2), 1);
  assert.equal(startStep('table.mul', 3), 3);
  assert.equal(startStep('mult.2x1', 3), 2);
  assert.equal(startStep('pct.of', 4), 2);
  assert.equal(startStep('mult.2x2', 4), 1);
  assert.equal(startStep('mult.2x2', THETA_MAX), 3);
  for (let th = 0; th <= THETA_MAX; th++) {
    for (const id of Object.keys(SUBTYPES)) {
      const s = startStep(id, th);
      assert.ok(s >= 0 && s <= 3);
      if (th > 0) assert.ok(s >= startStep(id, th - 1), 'monoton');
    }
  }
});

test('setPlacement: Startstufe der Treppe; Verlauf passt sie danach weiter an', () => {
  const att = (subtype: string, correct: boolean): Attempt => ({
    ts: 0, sessionId: 's', mode: 'all', prompt: '', unit: '', expected: 0, given: 0, weight: 1,
    category: subtype.split('.')[0] as Attempt['category'], subtype, correct, errorType: correct ? null : 'falsch',
    timeMs: 1000, targetMs: 10000, points: 0,
  });
  assert.equal(adaptiveStep('pct.of', []), 1);
  setPlacement(4);
  assert.equal(getPlacement(), 4);
  assert.equal(adaptiveStep('pct.of', []), 2);
  assert.equal(adaptiveStep('table.mul', []), 3);
  assert.equal(adaptiveStep('pct.of', [att('pct.of', false), att('pct.of', false)]), 1);
  setPlacement(0);
  assert.deepEqual(planTask('table.mul', [], () => 0), { subtype: 'table.mul', level: 1, basic: true, foundationFor: null });
  assert.equal(planTask('mult.2x1', [], () => 0).subtype, 'table.mul', 'Grundlage zuerst');
  setPlacement(99);
  assert.equal(getPlacement(), THETA_MAX);
  setPlacement(null);
  assert.equal(adaptiveStep('pct.of', []), 1);
});

test('summary und Speicherung in den Einstellungen', () => {
  const s = summary(3);
  assert.equal(s.length, 6);
  assert.deepEqual(s.find((x) => x.subtype === 'table.mul'), { subtype: 'table.mul', step: 3 });
  assert.equal(normalizePlacement({ theta: 3, ts: 5 })?.theta, 3);
  assert.equal(normalizePlacement({ theta: 7, ts: 5 }), null);
  assert.equal(normalizePlacement({ theta: 2.5, ts: 5 }), null);
  assert.equal(normalizePlacement('x'), null);
  assert.equal(normalizeSettings({}).placement, null);
  assert.deepEqual(normalizeSettings({ placement: { theta: 0, ts: 1 } }).placement, { theta: 0, ts: 1 });
});
