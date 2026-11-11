// v10 Fundament: XP-Konto, Serie mit gekauften Freezes und Reparaturen, neue Einstellungen, Erweiterungszeilen.
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_LEDGER, attemptXp, levelOf, lifetimeXp, syncLedger, withGrant, withSpend, xpBalance } from '../src/core/xp.ts';
import { habitInfo, MAX_FREEZES } from '../src/core/habit.ts';
import { dayKey } from '../src/core/progress.ts';
import { normalizeSettings, normalizeQuestLog, normalizeChests, normalizeDays, normalizeStamps, normalizeXp } from '../src/data/schema.ts';
import { rewardLines, splitRewardLines, emptyEvents, MAX_REWARD_LINES } from '../src/core/rewards.ts';

/* ---------- XP-Konto ---------- */

test('attemptXp summiert Punkte, ignoriert Unsinn', () => {
  assert.equal(attemptXp([{ points: 100 }, { points: 50 }, { points: Number.NaN }]), 150);
  assert.equal(attemptXp(null), 0);
});

test('syncLedger: Zuwachs zählt, Rückgang (Speicherlimit) nicht', () => {
  let l = syncLedger(EMPTY_LEDGER, 1000);
  assert.deepEqual(l, { earned: 1000, seen: 1000, bonus: 0, spent: 0 }, 'Bestandsnutzer: alles übernehmen');
  l = syncLedger(l, 1300);
  assert.equal(l.earned, 1300);
  l = syncLedger(l, 900); // alte Versuche fallen weg
  assert.equal(l.earned, 1300, 'sinkt nicht');
  assert.equal(l.seen, 900);
  l = syncLedger(l, 1000); // +100 nach dem Wegfall
  assert.equal(l.earned, 1400, 'Zuwachs nach dem Wegfall zählt sofort');
  assert.deepEqual(syncLedger(l, 1000), l, 'ohne Änderung stabil');
});

test('Lebenszeit, Guthaben, Geschenk, Ausgabe', () => {
  let l = syncLedger(EMPTY_LEDGER, 2000);
  l = withGrant(l, 300);
  assert.equal(lifetimeXp(l), 2300);
  assert.equal(xpBalance(l), 2300);
  assert.equal(withGrant(l, -5), l, 'negativ ändert nichts');
  assert.equal(withSpend(l, 3000), null, 'zu teuer');
  assert.equal(withSpend(l, 0), null, 'ungültig');
  const after = withSpend(l, 1500);
  assert.ok(after);
  assert.equal(xpBalance(after), 800);
  assert.equal(lifetimeXp(after), 2300, 'Ausgeben senkt das Level nicht');
});

test('levelOf wie bisher: 500 × Level bis zum nächsten', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, needed: 500 });
  assert.deepEqual(levelOf(499), { level: 1, into: 499, needed: 500 });
  assert.deepEqual(levelOf(500), { level: 2, into: 0, needed: 1000 });
  assert.deepEqual(levelOf(1500), { level: 3, into: 0, needed: 1500 });
});

/* ---------- Serie: gekaufte Freezes, Reparaturen, gerissen ---------- */

const NOW = new Date(2026, 0, 15, 17, 0).getTime();
const at = (off: number): { ts: number } => ({ ts: new Date(2026, 0, 15 + off, 12).getTime() });
const day = (off: number): string => dayKey(at(off).ts);
const range = (from: number, to: number): Array<{ ts: number }> => Array.from({ length: to - from + 1 }, (_, i) => at(from + i));
const info = (sessions: Array<{ ts: number }>, o: { bought?: number[]; repaired?: string[] } = {}) =>
  habitInfo({ sessions, activity: {}, goalRounds: 3, now: NOW, boughtFreezes: o.bought, repairedDays: o.repaired });

test('gestern verpasst ohne Freeze: Serie gerissen, broken meldet die Länge davor', () => {
  const h = info(range(-5, -2));
  assert.equal(h.streak, 0);
  assert.deepEqual(h.broken, { day: day(-1), lost: 4 });
  const today = info([...range(-5, -2), at(0)]);
  assert.equal(today.streak, 1);
  assert.deepEqual(today.broken, { day: day(-1), lost: 4 }, 'auch wenn heute schon gespielt wurde');
});

test('reparierter Tag überbrückt ohne Freeze und zählt nicht mit', () => {
  const h = info([...range(-5, -2), at(0)], { repaired: [day(-1)] });
  assert.equal(h.streak, 5);
  assert.deepEqual(h.repairedDays, [day(-1)]);
  assert.equal(h.broken, null);
});

test('gekaufter Freeze überbrückt einen späteren verpassten Tag', () => {
  const without = info([...range(-5, -2), at(0)]);
  assert.equal(without.streak, 1);
  const withFreeze = info([...range(-5, -2), at(0)], { bought: [at(-3).ts] });
  assert.equal(withFreeze.streak, 5);
  assert.deepEqual(withFreeze.frozenDays, [day(-1)]);
  assert.equal(withFreeze.freezes, 0);
});

test('gekaufte Freezes heute erhöhen den Vorrat, höchstens MAX_FREEZES', () => {
  const h = info([at(0)], { bought: [NOW, NOW, NOW] });
  assert.equal(h.freezes, MAX_FREEZES);
});

test('alter Fehltag vor dem Serienbeginn wird nicht als gerissen gemeldet', () => {
  assert.equal(info(range(-3, 0)).broken, null);
});

/* ---------- Einstellungen ---------- */

test('neue Einstellungen: Defaults und strenge Normalisierung', () => {
  const s = normalizeSettings({});
  assert.deepEqual(s.xp, { earned: 0, seen: 0, bonus: 0, spent: 0 });
  assert.deepEqual(s.purchases, {});
  assert.equal(s.frame, '');
  assert.equal(s.lpSeen, -1);
  assert.deepEqual(normalizeXp({ earned: 5, seen: -1, bonus: 1.5, spent: '3' }), { earned: 5, seen: 0, bonus: 0, spent: 0 });
  assert.deepEqual(normalizeStamps([3, 'x', 1, Number.NaN, 2]), [1, 2, 3]);
  assert.deepEqual(normalizeDays(['2026-01-02', 'kaputt', '2026-01-01', '2026-01-02']), ['2026-01-01', '2026-01-02']);
  const log = normalizeQuestLog({ '2026-01-01': { picks: ['a', 'b', 'a', 7], done: ['a'] }, kaputt: { picks: ['x'] }, '2026-01-02': 'x' });
  assert.deepEqual(log, { '2026-01-01': { picks: ['a', 'b'], done: ['a'] } });
  assert.deepEqual(normalizeChests({ '2026-01-05': 2, '2026-01-12': 4, x: 1 }), { '2026-01-05': 2 });
  assert.equal(normalizeSettings({ lpSeen: 1200 }).lpSeen, -1);
  assert.equal(normalizeSettings({ frame: 'frame:gold' }).frame, 'frame:gold');
  // alte Clients: unbekannte Felder bleiben erhalten (Spread)
  assert.equal((normalizeSettings({ zukunft: 1 }) as unknown as Record<string, unknown>).zukunft, 1);
});

/* ---------- Erweiterungszeilen ---------- */

test('rewardLines: Aufstieg, Erweiterungen (nach order), Orden, Karten, Abstieg', () => {
  const ev = {
    ...emptyEvents(),
    promoted: { from: 2, to: 3 },
    badges: [{ id: 'perfect' as const, tier: 1 as const }],
    cards: ['mult.2x1'],
    extra: [
      { id: 'b', order: 20, icon: 'target' as const, label: 'B', tone: 'good' as const },
      { id: 'a', order: 10, icon: 'target' as const, label: 'A', tone: 'quiet' as const },
    ],
  };
  const kinds = rewardLines(ev).map((l) => (l.kind === 'extra' ? `extra:${l.line.id}` : l.kind));
  assert.deepEqual(kinds, ['league', 'extra:a', 'extra:b', 'badge', 'card']);
  assert.equal(MAX_REWARD_LINES, 4);
  assert.deepEqual(splitRewardLines(ev).more, 1);
});
