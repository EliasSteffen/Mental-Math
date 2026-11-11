// Paket B: Runden-Tagesziel, Serie mit automatischen Freezes (core/habit.ts)
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habitInfo, roundsByDay, roundsHeatmap, roundsLevel, LEGACY_ACTIVE_MS } from '../src/core/habit.ts';
import { dayKey } from '../src/core/progress.ts';

const NOW = new Date(2026, 0, 15, 17, 0).getTime();
/** Runde an Tag `off` relativ zu 15.01.2026 (Mittag + k Minuten) */
const at = (off: number, k = 0): { ts: number } => ({ ts: new Date(2026, 0, 15 + off, 12, k).getTime() });
const days = (...offs: number[]): Array<{ ts: number }> => offs.map((o) => at(o));
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const info = (sessions: Array<{ ts: number }>, o: { activity?: Record<string, number>; goal?: number; now?: number } = {}) =>
  habitInfo({ sessions, activity: o.activity ?? {}, goalRounds: o.goal ?? 3, now: o.now ?? NOW });

test('roundsByDay zählt Sessions je lokalem Tag', () => {
  const r = roundsByDay([at(0), at(0, 5), at(-1)]);
  assert.deepEqual(r, { [dayKey(at(0).ts)]: 2, [dayKey(at(-1).ts)]: 1 });
  assert.deepEqual(roundsByDay([]), {});
});

test('heute leer, nichts gespielt: Serie 0, nicht gesichert', () => {
  const h = info([]);
  assert.deepEqual(h, { todayRounds: 0, goalRounds: 3, todayDone: false, kept: false, streak: 0, best: 0, freezes: 0, frozenDays: [] });
});

test('eine Runde hält die Serie, das Ziel ist der Vorsatz', () => {
  const h = info([at(-2), at(-1), at(0)]);
  assert.equal(h.streak, 3);
  assert.equal(h.kept, true);
  assert.equal(h.todayRounds, 1);
  assert.equal(h.todayDone, false);
  assert.equal(info([at(0), at(0, 1), at(0, 2)]).todayDone, true);
  assert.equal(info([at(0), at(0, 1)], { goal: 2 }).todayDone, true);
});

test('heute noch leer bricht die Serie nicht', () => {
  const h = info(days(-3, -2, -1));
  assert.equal(h.streak, 3);
  assert.equal(h.kept, false);
  assert.equal(h.best, 3);
});

test('Lücke ohne Freeze: Serie reißt, Rekord bleibt', () => {
  const h = info(days(-6, -5, -4, 0));
  assert.equal(h.streak, 1);
  assert.equal(h.best, 3);
  assert.equal(h.freezes, 0);
  assert.deepEqual(h.frozenDays, []);
  // gestern verpasst, heute noch nichts → gebrochen
  assert.equal(info(days(-6, -5, -4, -3)).streak, 0);
});

test('Lücke mit Freeze: 7 Tage am Stück, ein verpasster Tag wird überbrückt und zählt nicht mit', () => {
  const h = info(days(...range(-8, -2), 0)); // -1 fehlt
  assert.equal(h.streak, 8, '7 Tage + heute, der Freeze-Tag zählt nicht');
  assert.equal(h.best, 8);
  assert.equal(h.freezes, 0, 'Freeze verbraucht');
  assert.deepEqual(h.frozenDays, [dayKey(at(-1).ts)]);
  // heute noch leer: Serie bleibt 7, Freeze ist schon verbraucht
  const waiting = info(days(...range(-8, -2)));
  assert.equal(waiting.streak, 7);
  assert.equal(waiting.freezes, 0);
  assert.equal(waiting.kept, false);
});

test('Ein Freeze, drei Lückentage: Serie reißt', () => {
  const h = info(days(...range(-10, -4), 0)); // -3, -2, -1 fehlen
  assert.equal(h.streak, 1);
  assert.equal(h.best, 7);
});

test('zwei Freezes überbrücken zwei Tage in Folge; der dritte Lückentag reißt', () => {
  const two = info(days(...range(-16, -3), 0)); // 14 Tage, dann -2, -1 fehlen
  assert.equal(two.streak, 15);
  assert.equal(two.freezes, 0);
  assert.equal(two.frozenDays.length, 2);
  const three = info(days(...range(-17, -4), 0)); // -3, -2, -1 fehlen
  assert.equal(three.streak, 1);
  assert.equal(three.best, 14);
  assert.deepEqual(three.frozenDays, []);
});

test('Vorrat höchstens 2 Freezes', () => {
  const h = info(days(...range(-21, -1))); // drei Wochen, heute noch leer
  assert.equal(h.streak, 21);
  assert.equal(h.freezes, 2);
  assert.equal(info(days(...range(-21, 0))).freezes, 2);
});

test('Freeze heute verdient: der 7. Serientag liefert ihn sofort', () => {
  assert.equal(info(days(...range(-6, 0))).freezes, 1);
  assert.equal(info(days(...range(-6, -1))).freezes, 0);
});

test('Altbestand: ≥ 5 aktive Minuten ohne Sessions zählen, darunter nicht', () => {
  const k = (off: number): string => dayKey(at(off).ts);
  const activity = { [k(-3)]: LEGACY_ACTIVE_MS, [k(-2)]: LEGACY_ACTIVE_MS + 1, [k(-1)]: LEGACY_ACTIVE_MS - 1 };
  const h = info([], { activity });
  assert.equal(h.streak, 0, 'gestern knapp darunter → gebrochen');
  const ok = info([], { activity: { ...activity, [k(-1)]: 20 * 60_000, [k(0)]: 6 * 60_000 } });
  assert.equal(ok.streak, 4);
  assert.equal(ok.kept, true);
  assert.equal(ok.todayRounds, 0, 'Minuten sind keine Runden');
  assert.equal(ok.todayDone, false);
});

test('Altbestand und Runden mischen sich', () => {
  const k = (off: number): string => dayKey(at(off).ts);
  const h = info(days(-1, 0), { activity: { [k(-3)]: 10 * 60_000, [k(-2)]: 10 * 60_000 } });
  assert.equal(h.streak, 4);
});

test('Zeitumstellung (Frühjahr, 29.03.2026): Tage bleiben getrennt', () => {
  const now = new Date(2026, 2, 31, 18, 0).getTime();
  const s = [
    { ts: new Date(2026, 2, 27, 23, 50).getTime() },
    { ts: new Date(2026, 2, 28, 0, 10).getTime() },
    { ts: new Date(2026, 2, 29, 0, 30).getTime() }, // vor der Umstellung (2 → 3 Uhr)
    { ts: new Date(2026, 2, 30, 0, 5).getTime() },
    { ts: new Date(2026, 2, 31, 8, 0).getTime() },
  ];
  const h = habitInfo({ sessions: s, activity: {}, goalRounds: 3, now });
  assert.equal(h.streak, 5);
  assert.equal(h.frozenDays.length, 0);
});

test('Zeitumstellung (Herbst, 25.10.2026): 25-Stunden-Tag, Serie über die Umstellung', () => {
  const now = new Date(2026, 9, 27, 18, 0).getTime();
  const s = range(20, 27).map((d) => ({ ts: new Date(2026, 9, d, 23, 30).getTime() }));
  const h = habitInfo({ sessions: s, activity: {}, goalRounds: 3, now });
  assert.equal(h.streak, 8);
  assert.equal(h.freezes, 1);
});

test('Rückblick höchstens 730 Tage, Zahlen bleiben endlich', () => {
  const s = Array.from({ length: 1000 }, (_, i) => ({ ts: new Date(2026, 0, 15 - i, 12).getTime() }));
  const h = habitInfo({ sessions: s, activity: {}, goalRounds: 3, now: NOW });
  assert.equal(h.streak, 731); // 730 Tage bis gestern + heute
  assert.equal(h.freezes, 2);
});

test('goalRounds: ungültig → Standard, 1 ist gültig', () => {
  assert.equal(info([], { goal: 0 }).goalRounds, 3);
  assert.equal(info([at(0)], { goal: 1 }).todayDone, true);
});

test('Heatmap nach Runden: Stufen relativ zum Ziel, Altbestand zählt als eine Runde', () => {
  assert.equal(roundsLevel(0, 3), 0);
  assert.equal(roundsLevel(1, 3), 1);
  assert.equal(roundsLevel(2, 3), 2);
  assert.equal(roundsLevel(3, 3), 3);
  assert.equal(roundsLevel(6, 3), 4);
  const cells = roundsHeatmap([at(0), at(0, 1), at(0, 2), at(-1)], 3, NOW, 2, { [dayKey(at(-2).ts)]: 9 * 60_000 });
  assert.equal(cells.length, 14);
  const byDate = Object.fromEntries(cells.map((c) => [c.date, c]));
  assert.equal(byDate[dayKey(at(0).ts)]?.rounds, 3);
  assert.equal(byDate[dayKey(at(0).ts)]?.level, 3);
  assert.equal(byDate[dayKey(at(-1).ts)]?.level, 1);
  assert.equal(byDate[dayKey(at(-2).ts)]?.rounds, 1);
});

test('Einstellung dailyGoalRounds: Standard 3, nur ganze Zahlen 1–10, dailyGoalMin bleibt unberührt', async () => {
  const { normalizeSettings, DEFAULT_SETTINGS } = await import('../src/data/schema.ts');
  assert.equal(DEFAULT_SETTINGS.dailyGoalRounds, 3);
  assert.equal(normalizeSettings({}).dailyGoalRounds, 3);
  assert.equal(normalizeSettings({ dailyGoalRounds: 5 }).dailyGoalRounds, 5);
  for (const bad of [0, 11, 2.5, '4', null, NaN]) assert.equal(normalizeSettings({ dailyGoalRounds: bad }).dailyGoalRounds, 3, String(bad));
  assert.equal(normalizeSettings({ dailyGoalMin: 30 }).dailyGoalMin, 30);
});
