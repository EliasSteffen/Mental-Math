// Paket J: Orden (core/badges.ts) – jede Definition an den Schwellen, nie verlieren
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BADGES, BADGE_IDS, badgeMaxTier, badgeProgress, badgeTiers, countBests, effectiveTiers, mergeBadges, type BadgeId, type BadgeInput,
} from '../src/core/badges.ts';
import { CASE_TEMPLATES } from '../src/core/cases/index.ts';
import { RANKED_SUBTYPE_IDS } from '../src/core/league.ts';
import { SUBTYPES, CATEGORIES } from '../src/core/catalog.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';
import { att, emptyInput, perfectFor, sess, subtypeAttempts } from './v9-rewards-helpers.ts';

const tierOf = (id: BadgeId, input: BadgeInput): number => badgeTiers(input)[id];
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Prüft eine Definition an ihren drei Schwellen: Wert − 1 → vorherige Stufe, Wert → Stufe */
function checkThresholds(id: BadgeId, make: (n: number) => BadgeInput, th: readonly number[]): void {
  assert.equal(tierOf(id, make(0)), 0, `${id}: 0 → Stufe 0`);
  th.forEach((n, i) => {
    assert.equal(tierOf(id, make(n)), i + 1, `${id}: ${n} → Stufe ${i + 1}`);
    assert.equal(tierOf(id, make(n - 1)), i, `${id}: ${n - 1} → Stufe ${i}`);
  });
}

test('Katalog: 22 Orden, eindeutige IDs, Texte in beiden Sprachen', () => {
  assert.equal(BADGES.length, 22);
  assert.equal(new Set(BADGE_IDS).size, 22);
  for (const id of BADGE_IDS) {
    for (const key of [`badge_${id}`, `badge_${id}_desc`]) {
      assert.ok((de.rewards as Record<string, string>)[key], `de ${key}`);
      assert.ok((en.rewards as Record<string, string>)[key], `en ${key}`);
    }
  }
  assert.equal(badgeMaxTier('placement'), 1);
  assert.equal(badgeMaxTier('streak'), 3);
});

test('streak: beste Serie 7 / 30 / 100', () => {
  checkThresholds('streak', (n) => emptyInput({ streakBest: n }), [7, 30, 100]);
});

test('perfect: fehlerfreie Runden ab 5 Aufgaben, 1 / 10 / 50', () => {
  checkThresholds('perfect', (n) => emptyInput({ sessions: range(n).map((i) => sess({ id: `s${i}`, n: 5, correct: 5 })) }), [1, 10, 50]);
  const notEnough = [sess({ n: 4, correct: 4 }), sess({ n: 5, correct: 4 }), sess({ n: 1, correct: 1, mode: 'chain' })];
  assert.equal(tierOf('perfect', emptyInput({ sessions: notEnough })), 0);
});

test('solved: richtige Aufgaben 100 / 1.000 / 5.000', () => {
  checkThresholds('solved', (n) => emptyInput({ attempts: range(n).map(() => att()) }), [100, 1000, 5000]);
  assert.equal(tierOf('solved', emptyInput({ attempts: range(200).map(() => att({ correct: false })) })), 0);
});

test('rounds: Runden 10 / 100 / 500', () => {
  checkThresholds('rounds', (n) => emptyInput({ sessions: range(n).map((i) => sess({ id: `s${i}` })) }), [10, 100, 500]);
});

test('blitz: richtig in ≤ ⅓ der Zielzeit, ohne Hilfe und nicht untimed', () => {
  const fast = (): ReturnType<typeof att> => att({ targetMs: 3000, timeMs: 1000 });
  checkThresholds('blitz', (n) => emptyInput({ attempts: range(n).map(fast) }), [25, 250, 1000]);
  const no = [att({ targetMs: 3000, timeMs: 1001 }), att({ targetMs: 3000, timeMs: 500, correct: false }),
    att({ targetMs: 3000, timeMs: 500, assisted: true }), att({ targetMs: 3000, timeMs: 500, untimed: true })];
  assert.equal(badgeProgress('blitz', emptyInput({ attempts: no })).value, 0);
});

test('daily und dailyPerfect', () => {
  const daily = (n: number, perfect: number): BadgeInput => emptyInput({
    dailyResults: Object.fromEntries(range(n).map((i) => [`2026-01-${String(i + 1).padStart(2, '0')}x${i}`, { n: 5, correct: i < perfect ? 5 : 4, points: 1, timeMs: 1, ts: i }])),
  });
  checkThresholds('daily', (n) => daily(n, 0), [7, 30, 100]);
  checkThresholds('dailyPerfect', (n) => daily(n, n), [1, 5, 20]);
  assert.equal(tierOf('dailyPerfect', daily(30, 0)), 0);
});

test('bests: neue Bestzeiten chronologisch je Modus', () => {
  const s = (mode: string, ts: number, avg: number, o: Partial<ReturnType<typeof sess>> = {}): ReturnType<typeof sess> =>
    sess({ id: `${mode}${ts}`, mode, ts, avgTimeMs: avg, n: 10, correct: 9, ...o });
  // Reihenfolge der Liste spielt keine Rolle: es wird nach ts sortiert
  const list = [s('mult', 30, 3000), s('mult', 10, 5000), s('mult', 20, 4000), s('mult', 25, 4500)];
  assert.equal(countBests(list), 3);
  assert.equal(countBests([s('mult', 1, 5000), s('pct', 2, 6000)]), 2, 'jeder Modus zählt für sich');
  assert.equal(countBests([s('daily', 1, 5000), s('retry', 2, 5000), s('review', 3, 5000), s('placement', 4, 5000)]), 0);
  assert.equal(countBests([s('mult', 1, 5000, { n: 4 }), s('mult', 2, 4000, { correct: 7 }), s('mult', 3, 0)]), 0);
  assert.equal(countBests([s('chain', 1, 5000), s('parallel', 2, 5000), s('case:market', 3, 5000)]), 0);
  checkThresholds('bests', (n) => emptyInput({ sessions: range(n).map((i) => s('mult', i + 1, 5000 - i)) }), [1, 10, 50]);
});

test('noHelp: ≥ 10 Aufgaben, ≥ 90 %, keine Hilfe', () => {
  const ok = (n: number): BadgeInput => emptyInput({ sessions: range(n).map((i) => sess({ id: `s${i}`, n: 10, correct: 9 })) });
  checkThresholds('noHelp', ok, [1, 10, 50]);
  const base = [sess({ id: 'a', n: 10, correct: 9 })];
  assert.equal(tierOf('noHelp', emptyInput({ sessions: base, attempts: [att({ sessionId: 'a', assisted: true })] })), 0);
  assert.equal(tierOf('noHelp', emptyInput({ sessions: [sess({ id: 'a', n: 9, correct: 9 })] })), 0);
  assert.equal(tierOf('noHelp', emptyInput({ sessions: [sess({ id: 'a', n: 10, correct: 8 })] })), 0);
});

test('reviews: richtige Wiederholungen 10 / 100 / 500', () => {
  checkThresholds('reviews', (n) => emptyInput({ attempts: range(n).map(() => att({ isReview: true })) }), [10, 100, 500]);
  assert.equal(tierOf('reviews', emptyInput({ attempts: range(50).map(() => att({ isReview: true, correct: false })) })), 0);
  assert.equal(tierOf('reviews', emptyInput({ attempts: range(50).map(() => att()) })), 0);
});

test('variety: verschiedene Typen 10 / 25 / alle', () => {
  const ids = RANKED_SUBTYPE_IDS;
  const make = (n: number): BadgeInput => emptyInput({ attempts: ids.slice(0, n).map((subtype) => att({ subtype })) });
  checkThresholds('variety', make, [10, 25, ids.length]);
  assert.equal(tierOf('variety', emptyInput({ attempts: [att({ subtype: 'custom.mul' })] })), 0);
});

test('categories: Kategorien mit lauter sicheren Typen 1 / 5 / alle', () => {
  const visible = CATEGORIES.filter((c) => !c.hidden);
  const make = (n: number): BadgeInput => emptyInput({
    attempts: visible.slice(0, n).flatMap((c) => RANKED_SUBTYPE_IDS.filter((id) => SUBTYPES[id]?.category === c.id).flatMap((id) => subtypeAttempts(id, 3, 3))),
  });
  checkThresholds('categories', make, [1, 5, visible.length]);
  // Ein Typ der Kategorie nicht sicher → zählt nicht
  const table = RANKED_SUBTYPE_IDS.filter((id) => id.startsWith('table.'));
  const partial = table.flatMap((id, i) => subtypeAttempts(id, 7, i === 0 ? 3 : 7));
  assert.equal(tierOf('categories', emptyInput({ attempts: partial })), 0);
});

test('cards: Karten 10 / 25 / alle', () => {
  checkThresholds('cards', (n) => emptyInput({ cardCount: n }), [10, 25, RANKED_SUBTYPE_IDS.length]);
});

test('cases: Bronze 1, Silber alle Vorlagen, Gold 50 insgesamt', () => {
  const perfect = (id: string, i = 0): ReturnType<typeof sess> => sess({ id: `${id}${i}`, mode: `case:${id}`, n: 5, correct: 5 });
  assert.equal(tierOf('cases', emptyInput()), 0);
  assert.equal(tierOf('cases', emptyInput({ sessions: [sess({ mode: 'case:market', n: 5, correct: 4 })] })), 0, 'mit Fehler zählt nicht');
  assert.equal(tierOf('cases', emptyInput({ sessions: [perfect('market')] })), 1);
  const all = CASE_TEMPLATES.map((c) => perfect(c.id));
  assert.equal(tierOf('cases', emptyInput({ sessions: all.slice(0, -1) })), 1, 'eine Vorlage fehlt');
  assert.equal(tierOf('cases', emptyInput({ sessions: all })), 2);
  const many = Array.from({ length: 50 }, (_, i) => perfect('market', i));
  assert.equal(tierOf('cases', emptyInput({ sessions: many })), 3, 'Gold zählt insgesamt, auch nur mit einer Vorlage');
  assert.equal(tierOf('cases', emptyInput({ sessions: [sess({ mode: 'case:gibtsnicht', n: 5, correct: 5 })] })), 1);
  // Fortschritt
  assert.deepEqual(badgeProgress('cases', emptyInput()), { tier: 0, value: 0, nextAt: 1 });
  assert.deepEqual(badgeProgress('cases', emptyInput({ sessions: all.slice(0, 3) })), { tier: 1, value: 3, nextAt: CASE_TEMPLATES.length });
  assert.deepEqual(badgeProgress('cases', emptyInput({ sessions: all })), { tier: 2, value: CASE_TEMPLATES.length, nextAt: 50 });
});

test('exhibits und estimate: nur richtige Aufgaben der Art', () => {
  checkThresholds('exhibits', (n) => emptyInput({ attempts: range(n).map(() => att({ category: 'exhibit' })) }), [10, 100, 500]);
  checkThresholds('estimate', (n) => emptyInput({ attempts: range(n).map(() => att({ category: 'est' })) }), [10, 100, 500]);
  checkThresholds('estimate', (n) => emptyInput({ attempts: range(n).map(() => att({ estimate: true })) }), [10, 100, 500]);
  assert.equal(tierOf('exhibits', emptyInput({ attempts: range(20).map(() => att({ category: 'exhibit', correct: false })) })), 0);
});

test('chain: bester Wert über alle Level; parallel: beste Kettenzahl 2 / 3 / 4', () => {
  checkThresholds('chain', (n) => emptyInput({ chainBest: { 1: Math.floor(n / 2), 3: n } }), [5, 15, 30]);
  assert.equal(tierOf('chain', emptyInput({ chainBest: { 1: 5 } })), 1);
  checkThresholds('parallel', (n) => emptyInput({ parallelBest: n }), [2, 3, 4]);
});

test('climber: höchste Liga Silber I / Gold I / Diamant I', () => {
  checkThresholds('climber', (n) => emptyInput({ leaguePeak: n }), [3, 6, 12]);
});

test('early und night: Runden vor 7 Uhr bzw. ab 22 Uhr (lokale Zeit)', () => {
  const at = (h: number, m: number, i: number): ReturnType<typeof sess> => sess({ id: `s${i}`, ts: new Date(2026, 0, 15 + i, h, m).getTime() });
  assert.equal(tierOf('early', emptyInput({ sessions: [at(6, 59, 0)] })), 1);
  assert.equal(tierOf('early', emptyInput({ sessions: [at(7, 0, 0)] })), 0);
  assert.equal(tierOf('night', emptyInput({ sessions: [at(22, 0, 0)] })), 1);
  assert.equal(tierOf('night', emptyInput({ sessions: [at(21, 59, 0)] })), 0);
  checkThresholds('early', (n) => emptyInput({ sessions: range(n).map((i) => at(5, 0, i)) }), [1, 10, 50]);
  checkThresholds('night', (n) => emptyInput({ sessions: range(n).map((i) => at(23, 0, i)) }), [1, 10, 50]);
});

test('placement: einstufig', () => {
  assert.equal(tierOf('placement', emptyInput()), 0);
  assert.equal(tierOf('placement', emptyInput({ placement: true })), 1);
});

test('badgeProgress: Messwert, nächste Schwelle, höchste Stufe → null', () => {
  assert.deepEqual(badgeProgress('streak', emptyInput({ streakBest: 12 })), { tier: 1, value: 12, nextAt: 30 });
  assert.deepEqual(badgeProgress('streak', emptyInput({ streakBest: 100 })), { tier: 3, value: 100, nextAt: null });
  assert.deepEqual(badgeProgress('placement', emptyInput({ placement: true })), { tier: 1, value: 1, nextAt: null });
  assert.deepEqual(badgeProgress('nope' as BadgeId, emptyInput()), { tier: 0, value: 0, nextAt: null });
});

test('leere Historie: kein Orden', () => {
  assert.ok(Object.values(badgeTiers(emptyInput())).every((t) => t === 0));
  assert.ok(perfectFor(1).length > 0);
});

test('mergeBadges: Stufe = max(gespeichert, berechnet), nie verlieren, nur Neues melden', () => {
  const computed = badgeTiers(emptyInput({ streakBest: 7 }));
  const first = mergeBadges({}, computed, 100);
  assert.deepEqual(first.badges, { streak: { tier: 1, ts: 100 } });
  assert.deepEqual(first.fresh, [{ id: 'streak', tier: 1 }]);
  // Historie weggefallen (Limits): gespeicherte Stufe bleibt, nichts Neues
  const kept = mergeBadges({ streak: { tier: 3, ts: 5 }, solved: { tier: 2, ts: 6 } }, badgeTiers(emptyInput()), 200);
  assert.deepEqual(kept.badges, { streak: { tier: 3, ts: 5 }, solved: { tier: 2, ts: 6 } });
  assert.deepEqual(kept.fresh, []);
  // höher berechnet als gespeichert: neue Stufe, ts erneuert
  const up = mergeBadges({ streak: { tier: 1, ts: 5 } }, badgeTiers(emptyInput({ streakBest: 30 })), 300);
  assert.deepEqual(up.badges.streak, { tier: 2, ts: 300 });
  assert.deepEqual(up.fresh, [{ id: 'streak', tier: 2 }]);
  // gleiche Stufe: unverändert
  assert.equal(mergeBadges(up.badges, badgeTiers(emptyInput({ streakBest: 30 })), 400).fresh.length, 0);
  // wirksame Stufe für die Anzeige
  assert.equal(effectiveTiers({ streak: { tier: 3, ts: 1 } }, badgeTiers(emptyInput()))['streak'], 3);
});
