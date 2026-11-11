import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMEBACK_MIN_DAYS, REPAIR_COOLDOWN_DAYS, REPAIR_MIN_STREAK, REPAIR_ROUNDS, REPAIR_XP, WARMUP_SUBTYPES, WARMUP_TASKS,
  comebackState, daysBetween, repairOffer, warmupPlan,
} from '../src/core/comeback.ts';
import { habitInfo, LEGACY_ACTIVE_MS } from '../src/core/habit.ts';
import { dayKey } from '../src/core/progress.ts';
import type { Attempt } from '../src/types.ts';

const NOW = new Date(2026, 10, 11, 14, 0).getTime();
const at = (off: number, h = 10): number => new Date(2026, 10, 11 + off, h).getTime();
const sess = (...offs: number[]): { ts: number }[] => offs.map((o) => ({ ts: at(o) }));

test('daysBetween zählt Kalendertage', () => {
  assert.equal(daysBetween('2026-11-06', '2026-11-11'), 5);
  assert.equal(daysBetween('2026-10-25', '2026-10-27'), 2);
  assert.equal(daysBetween('2026-11-11', '2026-11-11'), 0);
});

test('comebackState: away ignoriert heute, eligible ab 3 Tagen, nur einmal pro Tag', () => {
  const base = { activity: {}, now: NOW, claimedDays: [] as string[] };
  const five = comebackState({ ...base, sessions: sess(-5, -9) });
  assert.deepEqual(five, { away: 5, eligible: true, claimedToday: false });
  // eine Runde heute ändert nichts an „away“
  assert.equal(comebackState({ ...base, sessions: sess(-5, 0) }).away, 5);
  assert.equal(comebackState({ ...base, sessions: sess(-COMEBACK_MIN_DAYS) }).eligible, true);
  assert.equal(comebackState({ ...base, sessions: sess(-2) }).eligible, false);
  const claimed = comebackState({ ...base, sessions: sess(-5), claimedDays: [dayKey(NOW)] });
  assert.equal(claimed.eligible, false);
  assert.equal(claimed.claimedToday, true);
});

test('comebackState: ohne Historie nicht berechtigt; Altbestand-Minuten zählen', () => {
  assert.equal(comebackState({ sessions: [], activity: {}, now: NOW, claimedDays: [] }).eligible, false);
  assert.equal(comebackState({ sessions: sess(0), activity: {}, now: NOW, claimedDays: [] }).eligible, false);
  const legacy = comebackState({ sessions: [], activity: { [dayKey(at(-6))]: LEGACY_ACTIVE_MS }, now: NOW, claimedDays: [] });
  assert.equal(legacy.away, 6);
  assert.equal(legacy.eligible, true);
  // zu wenig Minuten zählen nicht
  assert.equal(comebackState({ sessions: [], activity: { [dayKey(at(-6))]: LEGACY_ACTIVE_MS - 1 }, now: NOW, claimedDays: [] }).eligible, false);
});

const habit = (offs: number[], repairedDays: string[] = []) => habitInfo({ sessions: sess(...offs), activity: {}, goalRounds: 3, now: NOW, repairedDays });
// 12 aktive Tage, gestern verpasst. Der Freeze (nach 7 Tagen verdient) ist schon für die Lücke bei −7 verbraucht.
const streak12 = [-14, -13, -12, -11, -10, -9, -8, -6, -5, -4, -3, -2];

test('repairOffer: gestern gerissen, Serie ab Schwelle', () => {
  const h = habit(streak12);
  assert.equal(h.broken?.lost, 12);
  const o = repairOffer({ habit: h, repairs: [], now: NOW });
  assert.ok(o);
  assert.equal(o.lost, 12);
  assert.equal(o.day, dayKey(at(-1)));
  assert.equal(o.roundsDone, 0);
  assert.equal(o.roundsNeeded, REPAIR_ROUNDS);
  assert.equal(o.xpCost, REPAIR_XP);
  // Runden heute zählen hoch, gedeckelt
  const h2 = habit([...streak12, 0, 0, 0, 0]);
  assert.equal(repairOffer({ habit: h2, repairs: [], now: NOW })?.roundsDone, REPAIR_ROUNDS);
  assert.equal(repairOffer({ habit: habit([0, 0]), repairs: [], now: NOW }), null);
});

test('repairOffer: zu kurze Serie, nichts gerissen, schon repariert, Cooldown', () => {
  const short = Array.from({ length: REPAIR_MIN_STREAK - 1 }, (_, i) => -REPAIR_MIN_STREAK - i);
  assert.equal(repairOffer({ habit: habit(short), repairs: [], now: NOW }), null);
  const edge = Array.from({ length: REPAIR_MIN_STREAK }, (_, i) => -REPAIR_MIN_STREAK - 1 + i);
  assert.ok(repairOffer({ habit: habit(edge), repairs: [], now: NOW }));
  // gestern aktiv: nichts gerissen
  assert.equal(repairOffer({ habit: habit([...streak12, -1]), repairs: [], now: NOW }), null);
  // gestern schon repariert: Serie läuft, nichts gerissen
  const y = dayKey(at(-1));
  assert.equal(repairOffer({ habit: habit(streak12, [y]), repairs: [], now: NOW }), null);
  assert.equal(repairOffer({ habit: habit(streak12), repairs: [y], now: NOW }), null);
  // Cooldown: letzte Reparatur vor 29 Tagen blockiert, vor 30 nicht
  const d = (n: number): string => dayKey(at(-n));
  assert.equal(repairOffer({ habit: habit(streak12), repairs: [d(REPAIR_COOLDOWN_DAYS - 1)], now: NOW }), null);
  assert.ok(repairOffer({ habit: habit(streak12), repairs: [d(REPAIR_COOLDOWN_DAYS)], now: NOW }));
});

test('repairOffer: nach der Reparatur zählt die Serie weiter', () => {
  const h = habit([...streak12, 0], [dayKey(at(-1))]);
  assert.equal(h.broken, null);
  assert.equal(h.streak, 13);
});

function att(subtype: string, category: string, n: number, correct: (i: number) => boolean, level = 2): Attempt[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: NOW - (n - i) * 1000, sessionId: 's', mode: 'all', category, subtype, prompt: '1+1', unit: '', expected: 2, given: 2,
    correct: correct(i), errorType: null, timeMs: 3000, targetMs: 6000, weight: 1, points: 10, level,
  })) as Attempt[];
}

test('warmupPlan: stärkste Subtypen, eine Stufe leichter, mindestens Leicht', () => {
  const attempts = [
    ...att('mult.2x1', 'mult', 12, () => true, 3),
    ...att('pct.of', 'pct', 12, () => true, 2),
    ...att('table.mul', 'table', 12, (i) => i % 2 === 0, 1),
    ...att('div.exact', 'div', 12, () => false, 2),
    ...att('mult.2x2', 'mult', 12, (i) => i < 3, 2),
  ];
  const plan = warmupPlan(attempts);
  assert.equal(plan.length, WARMUP_TASKS);
  const ids = [...new Set(plan.map((p) => p.subtype))];
  assert.equal(ids.length, WARMUP_SUBTYPES);
  assert.ok(ids.includes('mult.2x1') && ids.includes('pct.of'));
  assert.ok(!ids.includes('div.exact'));
  for (const p of plan) assert.ok(p.level >= 1 && p.level <= 3);
  const m = plan.find((p) => p.subtype === 'mult.2x1')!;
  assert.ok(m.level <= 3 && m.level >= 1);
  // Stufe 2 → 1: Subtyp ohne Aufstieg bleibt höchstens bei Leicht
  assert.equal(warmupPlan(att('pct.of', 'pct', 12, () => true, 2)).every((p) => p.level >= 1), true);
});

test('warmupPlan: ohne Historie leichte Grundlagen; Kategorien filtern', () => {
  const plan = warmupPlan([]);
  assert.equal(plan.length, WARMUP_TASKS);
  assert.ok(plan.every((p) => p.level === 1));
  const only = warmupPlan(att('mult.2x1', 'mult', 10, () => true), ['pct']);
  assert.ok(only.every((p) => !p.subtype.startsWith('mult')));
});
