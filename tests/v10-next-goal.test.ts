// v10 F: Nächstes Ziel – Auswahl nach Fortschritt, Grenzen 0 und 1, Meister ohne nächste Liga, Texte (de).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextGoals, leagueTierName, CARD_GOAL_MIN, type GoalInput } from '../src/core/next-goal.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { tierIndex } from '../src/core/league.ts';
import type { BadgeInput } from '../src/core/badges.ts';
import type { Session } from '../src/types.ts';

const sess = (i: number): Session => ({ id: `s${i}`, ts: 1000 + i, mode: 'all', n: 5, correct: 5, points: 100, avgTimeMs: 3000 });

const badgeInput = (sessions: Session[] = []): BadgeInput => ({
  attempts: [], sessions, dailyResults: {}, streakBest: 0, chainBest: {}, parallelBest: 0, leaguePeak: 0, cardCount: 0, placement: false,
});

/** Nichts fortgeschritten: alle Schritte bei 0 oder erreicht – nur das, was der Test setzt, zählt */
const quiet = (over: Partial<GoalInput> = {}): GoalInput => ({
  rating: 0, tier: 0,
  badges: { input: badgeInput(), tiers: {} },
  cardSkills: [],
  xp: { level: 1, into: 0, needed: 500 },
  habit: { todayRounds: 3, goalRounds: 3 }, // Tagesziel erreicht: kein Ersatz-Ziel
  ...over,
});

test('Liga: nächste Stufe mit LP-Fehlbetrag und Fortschritt im Band', () => {
  const tier = tierIndex(412); // Gold III (400–449), nächste Stufe Platin I bei 450
  const [g] = nextGoals(quiet({ rating: 412, tier }), 5);
  assert.ok(g);
  assert.equal(g.kind, 'league');
  assert.equal(g.remaining, 38);
  assert.ok(Math.abs(g.progress - 0.24) < 1e-9);
  assert.equal(g.href, '#/erfolge');
  assert.match(g.label, /38/);
  assert.match(g.label, /Platin I/);
});

test('Meister: keine nächste Liga', () => {
  const tier = tierIndex(812);
  assert.equal(tier, 15);
  assert.deepEqual(nextGoals(quiet({ rating: 812, tier }), 5), []);
});

test('Liga-Grenze: Stufe bereits erreicht oder Fortschritt 0 zählt nicht', () => {
  // Stufenbeginn (Fortschritt 0) fällt weg
  assert.deepEqual(nextGoals(quiet({ rating: 400, tier: tierIndex(400) }), 5).filter((g) => g.kind === 'league'), []);
});

test('Tagesziel: erreicht fällt weg, Teilfortschritt zählt, 0 nur als Ersatz ohne andere Ziele', () => {
  const [fresh, ...rest] = nextGoals(quiet({ habit: { todayRounds: 0, goalRounds: 3 } }), 5);
  assert.equal(fresh?.kind, 'goal', 'neuer Tag ohne anderes Ziel: Tagesziel als Anstoß');
  assert.equal(fresh?.remaining, 3);
  assert.deepEqual(rest, []);
  const withOther = nextGoals(quiet({ habit: { todayRounds: 0, goalRounds: 3 }, xp: { level: 2, into: 400, needed: 1000 } }), 5);
  assert.deepEqual(withOther.map((g) => g.kind), ['level'], 'gibt es ein angefangenes Ziel, kein Ersatz');
  assert.deepEqual(nextGoals(quiet({ habit: { todayRounds: 3, goalRounds: 3 } }), 5), []);
  const [g] = nextGoals(quiet({ habit: { todayRounds: 1, goalRounds: 3 } }), 5);
  assert.ok(g);
  assert.equal(g.kind, 'goal');
  assert.equal(g.remaining, 2);
  assert.ok(Math.abs(g.progress - 1 / 3) < 1e-9);
  assert.equal(g.href, '#/train/all');
  assert.match(g.label, /2 Runden/);
});

test('Tagesziel: Einzahl bei einer Runde', () => {
  const [g] = nextGoals(quiet({ habit: { todayRounds: 2, goalRounds: 3 } }), 5);
  assert.ok(g);
  assert.equal(g.remaining, 1);
  assert.match(g.label, /1 Runde /);
});

test('Level: Fortschritt im Level, Text nennt das nächste Level', () => {
  const [g] = nextGoals(quiet({ xp: { level: 2, into: 380, needed: 1000 } }), 5);
  assert.ok(g);
  assert.equal(g.kind, 'level');
  assert.equal(g.remaining, 620);
  assert.ok(Math.abs(g.progress - 0.38) < 1e-9);
  assert.equal(g.href, '#/fortschritt');
  assert.match(g.label, /620 XP/);
  assert.match(g.label, /Level 3/);
  assert.deepEqual(nextGoals(quiet({ xp: { level: 2, into: 0, needed: 1000 } }), 5), []);
});

test('Trick-Karte: Skill 50 bis 69 zählt, darunter und ab 70 nicht', () => {
  const id = 'mult.2x1';
  const name = SUBTYPES[id]?.name ?? id;
  const card = (score: number | null) => nextGoals(quiet({ cardSkills: [{ id, score }] }), 5);
  assert.equal(CARD_GOAL_MIN, 50);
  const [g] = card(62);
  assert.ok(g);
  assert.equal(g.kind, 'card');
  assert.equal(g.remaining, 8);
  assert.match(g.label, /8 Skill/);
  assert.ok(g.label.includes(name));
  assert.equal(g.href, '#/erfolge/karten');
  assert.deepEqual(card(49), []);
  assert.deepEqual(card(70), []);
  assert.deepEqual(card(null), []);
});

test('Orden: nächste Stufe über badgeProgress, gespeicherte höhere Stufe fällt weg', () => {
  // Ausdauer: 3 Runden, Bronze ab 10 → 7 fehlen, 30 %. Keine fehlerfreie Runde, sonst läge „Fehlerfrei“ gleichauf.
  const sessions = [sess(1), sess(2), sess(3)].map((s) => ({ ...s, correct: 2 }));
  const [g] = nextGoals(quiet({ badges: { input: badgeInput(sessions), tiers: {} } }), 5);
  assert.ok(g);
  assert.equal(g.kind, 'badge');
  assert.equal(g.remaining, 7);
  assert.ok(Math.abs(g.progress - 0.3) < 1e-9);
  assert.match(g.label, /Ausdauer/);
  assert.match(g.label, /Bronze/);
  assert.equal(g.href, '#/erfolge/orden');
  // Gespeichert Silber, berechnet nur Gesperrt → kein berechenbarer Schritt (andere Orden bleiben unberührt)
  const withStored = nextGoals(quiet({ badges: { input: badgeInput(sessions), tiers: { rounds: 2 } } }), 9);
  assert.equal(withStored.some((g) => g.label.includes('Ausdauer')), false);
});

test('Auswahl: größter Fortschritt zuerst, max begrenzt', () => {
  const input = quiet({ xp: { level: 2, into: 400, needed: 1000 }, habit: { todayRounds: 1, goalRounds: 3 } });
  const all = nextGoals(input, 5);
  assert.deepEqual(all.map((g) => g.kind), ['level', 'goal']); // 0,4 vor 0,33
  assert.equal(nextGoals(input, 1).length, 1);
  assert.equal(nextGoals(input, 1)[0]?.kind, 'level');
  assert.equal(nextGoals(input).length, 2);
});

test('Gleichstand: Reihenfolge goal, badge, card, league, level', () => {
  // Tagesziel 1/2 und Level 500/1000 haben beide 50 % → goal zuerst
  const input = quiet({ xp: { level: 2, into: 500, needed: 1000 }, habit: { todayRounds: 1, goalRounds: 2 } });
  assert.deepEqual(nextGoals(input, 5).map((g) => g.kind), ['goal', 'level']);
});

test('Nichts offen: leere Liste', () => {
  assert.deepEqual(nextGoals(quiet(), 2), []);
});

test('leagueTierName: Stufe mit Zahl, Meister ohne', () => {
  assert.equal(leagueTierName(8), 'Gold III');
  assert.equal(leagueTierName(15), 'Meister');
  assert.equal(leagueTierName(0), 'Bronze I');
});
