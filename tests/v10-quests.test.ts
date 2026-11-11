// v10 Q: Tagesquests und Wochentruhe – Pool, Auswahl, Fortschritt, Wochen, Truhen, Gutschrift genau einmal.
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHEST_STARS, CHEST_XP, QUEST_BASES, QUEST_XP, chestContents, dayPicks, msUntilNextDay, newlyDone, parseQuestId, pickQuests, questCandidates,
  questLevel, questProgress, questTitle, questXp, readyChest, weekDays, weekStars, weekStart, withDone, withPicks,
  type PickContext, type QuestData,
} from '../src/core/quests.ts';
import { MAX_FREEZES } from '../src/core/habit.ts';
import { dayKey } from '../src/core/progress.ts';
import { allKeys, setLang, t } from '../src/i18n/index.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { att, sess } from './v9-rewards-helpers.ts';

const DAY = '2026-11-11'; // Mittwoch
const noon = (d: string): number => new Date(`${d}T12:00:00`).getTime();
const ctx: PickContext = { categories: ['mult', 'pct', 'frac'], weakSubtypes: ['pct.change', 'mult.2x2'], dueCount: 4 };
const data = (o: Partial<QuestData> = {}): QuestData => ({ attempts: [], sessions: [], dailyResults: {}, goalRounds: 3, ...o });
const today = (o: Parameters<typeof att>[0] = {}) => att({ ts: noon(DAY), ...o });
const round = (o: Parameters<typeof sess>[0] = {}) => sess({ ts: noon(DAY), ...o });

/* ---------- Pool ---------- */

test('Pool: mindestens 14 Quests, XP 100/200/300 je Stufe, Texte in de und en', () => {
  const bases = Object.keys(QUEST_BASES);
  assert.ok(bases.length >= 14);
  assert.deepEqual(QUEST_XP, { 1: 100, 2: 200, 3: 300 });
  for (const lang of ['de', 'en'] as const) {
    assert.ok(allKeys(lang).includes('quests.q_round'));
    for (const b of bases) assert.ok(allKeys(lang).includes(`quests.q_${b}`), `${lang}: q_${b}`);
  }
  setLang('de');
  assert.equal(questTitle('round'), 'Eine Runde spielen');
  assert.equal(questTitle('weak:pct.change'), `5 richtige Antworten in deiner Schwäche: ${SUBTYPES['pct.change']?.name}`);
  assert.match(questTitle('cat:mult'), /^Eine Runde in .+/);
  assert.equal(questXp('perfect'), 300);
  assert.equal(questLevel('weak:pct.change'), 2);
  assert.equal(parseQuestId('nope'), null);
  assert.deepEqual(parseQuestId('review:3'), { base: 'review', param: '3' });
});

/* ---------- Auswahl ---------- */

test('Auswahl: je eine Quest pro Stufe, deterministisch, nur verfügbare', () => {
  const a = pickQuests(DAY, ctx);
  assert.deepEqual(a, pickQuests(DAY, ctx));
  assert.deepEqual(a.map(questLevel), [1, 2, 3]);
  for (const [i, id] of a.entries()) assert.ok(questCandidates((i + 1) as 1 | 2 | 3, DAY, ctx).includes(id));
  // ohne Schwäche und ohne fällige Wiederholungen nie weak/review
  const bare: PickContext = { categories: [], weakSubtypes: [], dueCount: 0 };
  for (let i = 0; i < 60; i++) {
    const day = dayKey(noon(DAY) + i * 86_400_000);
    const ids = pickQuests(day, bare);
    assert.ok(!ids.some((id) => id.startsWith('weak:') || id.startsWith('review:') || id.startsWith('cat:')), `${day}: ${ids.join()}`);
  }
  // mit allem verfügbar kommen im Lauf der Tage verschiedene Quests vor
  const seen = new Set<string>();
  for (let i = 0; i < 120; i++) for (const id of pickQuests(dayKey(noon(DAY) + i * 86_400_000), ctx)) seen.add(id.split(':')[0] ?? '');
  assert.ok(seen.size >= 12, `Vielfalt ${seen.size}`);
});

test('Auswahl wird den Tag über festgehalten, auch wenn sich der Kontext ändert', () => {
  const first = dayPicks({}, DAY, ctx);
  assert.equal(first.fresh, true);
  const log = withPicks({}, DAY, first.picks);
  const other: PickContext = { categories: ['biz'], weakSubtypes: [], dueCount: 0 };
  const again = dayPicks(log, DAY, other);
  assert.equal(again.fresh, false);
  assert.deepEqual(again.picks, first.picks);
  // kaputte gespeicherte Auswahl wird ersetzt
  assert.equal(dayPicks({ [DAY]: { picks: ['xyz'], done: [] } }, DAY, ctx).fresh, true);
});

test('Kategorie-Quest geht reihum durch die Kategorien', () => {
  const ids = [0, 1, 2, 3].map((i) => questCandidates(1, dayKey(noon(DAY) + i * 86_400_000), ctx).find((x) => x.startsWith('cat:')));
  assert.equal(new Set(ids.slice(0, 3)).size, 3);
  assert.equal(ids[0], ids[3]);
});

/* ---------- Fortschritt ---------- */

test('Fortschritt: Runden und Antworten zählen nur heute', () => {
  const old = noon('2026-11-10');
  const d = data({
    sessions: [round(), round({ id: 's2' }), sess({ ts: old, id: 's3' })],
    attempts: [...Array.from({ length: 12 }, () => today()), att({ ts: old })],
  });
  assert.deepEqual(questProgress('round', DAY, d), { value: 1, target: 1 });
  assert.deepEqual(questProgress('rounds2', DAY, d), { value: 2, target: 2 });
  assert.deepEqual(questProgress('correct10', DAY, d), { value: 10, target: 10 });
  assert.deepEqual(questProgress('goal', DAY, d), { value: 2, target: 3 });
  assert.deepEqual(questProgress('goal', DAY, data({ goalRounds: 1, sessions: d.sessions })), { value: 1, target: 1 });
  assert.equal(questProgress('round', DAY, data()).value, 0);
});

test('Fortschritt: Daily, Kette, Kategorie, Mini-Case', () => {
  assert.equal(questProgress('daily', DAY, data({ dailyResults: { [DAY]: { n: 15, correct: 10, points: 1, timeMs: 1, ts: 1 } } })).value, 1);
  assert.equal(questProgress('daily', DAY, data({ dailyResults: { '2026-11-10': { n: 15, correct: 10, points: 1, timeMs: 1, ts: 1 } } })).value, 0);
  assert.equal(questProgress('chain', DAY, data({ sessions: [round({ mode: 'chain', n: 1 })] })).value, 1);
  assert.equal(questProgress('cat:mult', DAY, data({ sessions: [round({ mode: 'mult' })] })).value, 1);
  assert.equal(questProgress('cat:mult', DAY, data({ sessions: [round({ mode: 'mult.2x2' })] })).value, 1);
  assert.equal(questProgress('cat:mult', DAY, data({ sessions: [round({ mode: 'pct' })] })).value, 0);
  assert.equal(questProgress('case', DAY, data({ sessions: [round({ mode: 'case:margin', n: 4, correct: 3 })] })).value, 1);
  assert.equal(questProgress('casePerfect', DAY, data({ sessions: [round({ mode: 'case:margin', n: 4, correct: 3 })] })).value, 0);
  assert.equal(questProgress('casePerfect', DAY, data({ sessions: [round({ mode: 'case:margin', n: 4, correct: 4 })] })).value, 1);
});

test('Fortschritt: Genauigkeit, perfekte Runde, ohne Hilfe', () => {
  assert.equal(questProgress('acc90', DAY, data({ sessions: [round({ n: 10, correct: 9 })] })).value, 1);
  assert.equal(questProgress('acc90', DAY, data({ sessions: [round({ n: 10, correct: 8 })] })).value, 0);
  assert.equal(questProgress('acc90', DAY, data({ sessions: [round({ n: 2, correct: 2 })] })).value, 0, 'zu kurz');
  assert.equal(questProgress('perfect', DAY, data({ sessions: [round({ n: 5, correct: 5 })] })).value, 1);
  assert.equal(questProgress('perfect', DAY, data({ sessions: [round({ n: 4, correct: 4 })] })).value, 0, 'ab 5 Aufgaben');
  assert.equal(questProgress('perfect', DAY, data({ sessions: [round({ n: 10, correct: 9 })] })).value, 0);
  const s = round({ id: 'r1', n: 10, correct: 10 });
  assert.equal(questProgress('noassist10', DAY, data({ sessions: [s] })).value, 1);
  assert.equal(questProgress('noassist10', DAY, data({ sessions: [s], attempts: [today({ sessionId: 'r1', assisted: true })] })).value, 0);
  assert.equal(questProgress('noassist10', DAY, data({ sessions: [round({ n: 9, correct: 9 })] })).value, 0, '10 Aufgaben nötig');
});

test('Fortschritt: Tempo, Schwäche, Wiederholungen', () => {
  const fast = (timeMs: number) => today({ timeMs, targetMs: 9000 });
  const a = data({ attempts: [...Array.from({ length: 7 }, () => fast(3000)), ...Array.from({ length: 5 }, () => fast(8000)), today({ timeMs: 1000, targetMs: 9000, assisted: true }), today({ timeMs: 1000, targetMs: 9000, untimed: true }), today({ timeMs: 1000, targetMs: 9000, correct: false })] });
  assert.deepEqual(questProgress('fast10', DAY, a), { value: 10, target: 10 }, 'Hilfe, ohne Zeit und falsche zählen nicht');
  assert.deepEqual(questProgress('speed5', DAY, a), { value: 5, target: 5 });
  assert.equal(questProgress('speed5', DAY, data({ attempts: [fast(3500)] })).value, 0, 'über einem Drittel');
  const w = data({ attempts: [today({ subtype: 'pct.change' }), today({ subtype: 'pct.change' }), today({ subtype: 'pct.change', correct: false }), today({ subtype: 'mult.2x1' })] });
  assert.deepEqual(questProgress('weak:pct.change', DAY, w), { value: 2, target: 5 });
  const r = data({ attempts: [today({ isReview: true }), today({ isReview: true }), today()] });
  assert.deepEqual(questProgress('review:3', DAY, r), { value: 2, target: 3 });
});

/* ---------- Woche, Sterne, Truhen ---------- */

test('Woche: Montag bis Sonntag, auch über die Zeitumstellung', () => {
  assert.equal(weekStart('2026-11-11'), '2026-11-09'); // Mittwoch
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Montag
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // Sonntag
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(weekStart('2026-03-29'), '2026-03-23'); // Umstellung auf Sommerzeit (Sonntag)
  assert.equal(weekStart('2026-10-25'), '2026-10-19'); // zurück auf Winterzeit
  assert.deepEqual(weekDays('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(weekDays('2026-03-23')[6], '2026-03-29');
  assert.equal(weekStart('2026-12-31'), '2026-12-28');
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'Jahreswechsel');
});

test('Sterne: erledigte Quests der Woche, höchstens 21, nur diese Woche', () => {
  const log = {
    '2026-11-08': { picks: [], done: ['a', 'b', 'c'] }, // Vorwoche
    '2026-11-09': { picks: [], done: ['a', 'b', 'c'] },
    '2026-11-11': { picks: [], done: ['a', 'b'] },
    '2026-11-15': { picks: [], done: ['a'] },
    '2026-11-16': { picks: [], done: ['a', 'b', 'c'] }, // nächste Woche
  };
  assert.equal(weekStars(log, '2026-11-09'), 6);
  assert.equal(weekStars({}, '2026-11-09'), 0);
  const full = Object.fromEntries(weekDays('2026-11-09').map((d) => [d, { picks: [], done: ['a', 'b', 'c'] }]));
  assert.equal(weekStars(full, '2026-11-09'), 21);
});

test('Truhen: Schwellen 5/10/15, der Reihe nach, nie doppelt', () => {
  assert.deepEqual([...CHEST_STARS], [5, 10, 15]);
  assert.equal(readyChest(4, 0), 0);
  assert.equal(readyChest(5, 0), 1);
  assert.equal(readyChest(5, 1), 0, 'Bronze schon geöffnet');
  assert.equal(readyChest(12, 1), 2);
  assert.equal(readyChest(12, 2), 0);
  assert.equal(readyChest(21, 2), 3);
  assert.equal(readyChest(21, 3), 0);
  assert.equal(readyChest(21, 0), 1, 'zuerst Bronze');
});

test('Truhen-Inhalt: Spannen, deterministisch, Ersatz bei vollem Vorrat und vorhandenem Rahmen', () => {
  const open = { freezes: 0, hasFrame: false };
  for (let i = 0; i < 30; i++) {
    const week = dayKey(noon(DAY) + i * 7 * 86_400_000);
    const b = chestContents(week, 1, open);
    assert.ok(b.xp >= 300 && b.xp <= 600 && !b.freeze && !b.frame);
    const s = chestContents(week, 2, open);
    assert.ok(s.xp >= 800 && s.xp <= 1200 && s.freeze && !s.frame);
    const g = chestContents(week, 3, open);
    assert.ok(g.xp >= 1500 && g.xp <= 2500 && !g.freeze && g.frame);
    assert.deepEqual(chestContents(week, 3, open), g, 'deterministisch');
  }
  const xps = new Set(Array.from({ length: 30 }, (_, i) => chestContents(dayKey(noon(DAY) + i * 7 * 86_400_000), 1, open).xp));
  assert.ok(xps.size > 5, 'variiert');
  const full = chestContents('2026-11-09', 2, { freezes: MAX_FREEZES, hasFrame: false });
  const base = chestContents('2026-11-09', 2, open);
  assert.equal(full.freeze, false);
  assert.equal(full.xp, base.xp + 500);
  const owned = chestContents('2026-11-09', 3, { freezes: 0, hasFrame: true });
  assert.equal(owned.frame, false);
  assert.equal(owned.xp, chestContents('2026-11-09', 3, open).xp + 1000);
  assert.deepEqual(CHEST_XP[1], [300, 600]);
});

test('Protokoll-Helfer und Countdown', () => {
  let log = withPicks({}, DAY, ['round', 'rounds2', 'perfect']);
  log = withDone(log, DAY, ['round']);
  log = withDone(log, DAY, ['round', 'perfect']);
  assert.deepEqual(log[DAY], { picks: ['round', 'rounds2', 'perfect'], done: ['round', 'perfect'] });
  assert.equal(msUntilNextDay(new Date(2026, 10, 11, 18, 48).getTime()), (5 * 60 + 12) * 60_000);
  // Tag der Zeitumstellung (25 Stunden) bleibt bis Mitternacht korrekt
  assert.equal(msUntilNextDay(new Date(2026, 9, 25, 0, 0).getTime()), 25 * 3_600_000);
  assert.ok(t('quests.title').length > 0);
});

test('Gutschrift genau einmal: erledigt → einmal fällig, danach nie wieder (auch nach weiteren Runden)', () => {
  const picks = ['round', 'rounds2', 'perfect'];
  let log = withPicks({}, DAY, picks);
  assert.deepEqual(newlyDone(log, DAY, picks, data()), []);
  const one = data({ sessions: [round()] });
  assert.deepEqual(newlyDone(log, DAY, picks, one), ['round']);
  log = withDone(log, DAY, newlyDone(log, DAY, picks, one));
  assert.deepEqual(newlyDone(log, DAY, picks, one), [], 'schon gutgeschrieben');
  const two = data({ sessions: [round(), round({ id: 's2', n: 5, correct: 5 })] });
  assert.deepEqual(newlyDone(log, DAY, picks, two), ['rounds2', 'perfect']);
  log = withDone(log, DAY, ['rounds2', 'perfect']);
  assert.deepEqual(newlyDone(log, DAY, picks, two), []);
  assert.equal(weekStars(log, weekStart(DAY)), 3);
  assert.equal(newlyDone(log, '2026-11-12', picks, two).length, 0, 'andere Tage zählen nicht');
});
