// Freund herausfordern (v9 I): Link-Payload, Aufgaben, Ausgang
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUEL_MAX_LEN, cleanDuelName, decodeDuel, duelBase, duelOutcome, duelTasks, encodeDuel } from '../src/core/duel-link.ts';
import type { DuelPayload } from '../src/core/duel-link.ts';
import { dailyTasks } from '../src/core/daily.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/data/schema.ts';
import { parseMode } from '../src/core/modes.ts';

const sample: DuelPayload = { v: 1, kind: 'set', seed: 123456789, cat: 'all', n: 10, lvl: 2, name: 'Anna', c: 8, p: 640, t: 52_300 };
const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

test('Roundtrip: encode → decode liefert denselben Payload, Link bleibt kurz', () => {
  const enc = encodeDuel(sample);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.ok(enc.length < 200, `Länge ${enc.length}`);
  assert.deepEqual(decodeDuel(enc), sample);
  const daily: DuelPayload = { v: 1, kind: 'daily', day: '2026-11-11', cat: 'all', n: 15, lvl: 2, c: 12, p: 900, t: 180_000 };
  assert.deepEqual(decodeDuel(encodeDuel(daily)), daily);
  const noName = { ...sample };
  delete noName.name;
  assert.deepEqual(decodeDuel(encodeDuel(noName)), noName);
});

test('Umlaute und Emoji im Namen überstehen den Roundtrip', () => {
  const p = { ...sample, name: 'Jörg 🚀 Ä' };
  assert.equal(decodeDuel(encodeDuel(p))?.name, 'Jörg 🚀 Ä');
});

test('Manipulierte und zu große Links werden abgelehnt', () => {
  const good = encodeDuel(sample);
  assert.equal(decodeDuel(null), null);
  assert.equal(decodeDuel(''), null);
  assert.equal(decodeDuel(42), null);
  assert.equal(decodeDuel('!!!'), null);
  assert.equal(decodeDuel('a'.repeat(DUEL_MAX_LEN + 1)), null);
  assert.equal(decodeDuel(good.slice(0, -3)), null);
  assert.equal(decodeDuel(b64([1, 2])), null);
  assert.equal(decodeDuel(b64('x')), null);
  const bad = (patch: Record<string, unknown>): string | null => {
    const d = decodeDuel(b64({ ...sample, ...patch }));
    return d === null ? null : 'ok';
  };
  assert.equal(bad({}), 'ok');
  assert.equal(bad({ v: 2 }), null);
  assert.equal(bad({ kind: 'x' }), null);
  assert.equal(bad({ cat: 'custom' }), null);
  assert.equal(bad({ cat: '__proto__' }), null);
  assert.equal(bad({ n: 7 }), null);
  assert.equal(bad({ lvl: 4 }), null);
  assert.equal(bad({ seed: -1 }), null);
  assert.equal(bad({ seed: 2 ** 32 }), null);
  assert.equal(bad({ seed: 1.5 }), null);
  assert.equal(bad({ c: '8' }), null);
  assert.equal(bad({ t: Number.NaN }), null);
  assert.equal(bad({ name: 'x'.repeat(25) }), null);
  assert.equal(bad({ name: 'a\u0000b' }), null);
  assert.equal(bad({ name: 'a‮b' }), null);
  assert.equal(bad({ name: 5 }), null);
  assert.equal(bad({ name: '' }), null);
  assert.equal(decodeDuel(b64({ ...sample, kind: 'daily', day: '2026-13-40' })), null);
  assert.equal(decodeDuel(b64({ ...sample, kind: 'daily', day: 'heute' })), null);
});

test('Zahlen werden begrenzt', () => {
  const d = decodeDuel(b64({ ...sample, c: 99, p: 9e9, t: 9e12 }));
  assert.ok(d);
  assert.equal(d.c, 10);
  assert.equal(d.p, 99_999);
  assert.equal(d.t, 3_600_000);
  assert.equal(decodeDuel(b64({ ...sample, c: -5, p: -1, t: -1 }))?.c, 0);
  // encode begrenzt ebenfalls
  assert.equal(decodeDuel(encodeDuel({ ...sample, c: 50 }))?.c, 10);
});

test('Namen: Steuerzeichen raus, höchstens 24 Zeichen', () => {
  assert.equal(cleanDuelName('  a\u0000b\nc  '), 'a b c');
  assert.equal(cleanDuelName('x'.repeat(40)).length, 24);
  assert.equal(cleanDuelName(7), '');
  assert.equal(decodeDuel(encodeDuel({ ...sample, name: 'a\u0007b' }))?.name, 'a b');
});

test('duelTasks: gleicher Payload → gleiche Aufgaben, anderer Seed → andere', () => {
  const a = duelTasks(sample);
  const b = duelTasks({ ...sample });
  assert.equal(a.length, 10);
  assert.deepEqual(a.map((x) => [x.prompt, x.subtype, x.level]), b.map((x) => [x.prompt, x.subtype, x.level]));
  assert.ok(a.every((x) => x.mode === 'duel' && x.level === 2));
  assert.notDeepEqual(a.map((x) => x.prompt), duelTasks({ ...sample, seed: 987 }).map((x) => x.prompt));
  // Kategorie: nur Subtypen dieser Kategorie
  const pct = duelTasks({ ...sample, cat: 'pct', n: 15, lvl: 3 });
  assert.equal(pct.length, 15);
  assert.ok(pct.every((x) => x.category === 'pct' && x.level === 3));
  // „Gemischt“ geht reihum durch mehrere Kategorien
  assert.ok(new Set(a.map((x) => x.category)).size >= 5);
});

test('duelTasks: Daily-Variante = Tagesrunde', () => {
  const p: DuelPayload = { v: 1, kind: 'daily', day: '2026-11-11', cat: 'all', n: 15, lvl: 2, c: 1, p: 1, t: 1 };
  const t = duelTasks(p);
  assert.deepEqual(t.map((x) => x.prompt), dailyTasks('2026-11-11').map((x) => x.prompt));
  // Ein Daily-Link behauptet nie etwas anderes als 15 Aufgaben (Stufe 2)
  const dec = decodeDuel(b64({ ...p, n: 5, lvl: 3, cat: 'pct' }));
  assert.equal(dec?.n, 15);
  assert.equal(dec?.lvl, 2);
  assert.equal(dec?.cat, 'all');
  assert.equal(duelBase(p).kind, 'daily');
});

test('duelOutcome: mehr richtige gewinnt, bei Gleichstand die kürzere Zeit', () => {
  assert.equal(duelOutcome({ c: 9, t: 90_000 }, { c: 8, t: 10_000 }), 'win');
  assert.equal(duelOutcome({ c: 7, t: 10_000 }, { c: 8, t: 90_000 }), 'lose');
  assert.equal(duelOutcome({ c: 8, t: 40_000 }, { c: 8, t: 50_000 }), 'win');
  assert.equal(duelOutcome({ c: 8, t: 60_000 }, { c: 8, t: 50_000 }), 'lose');
  assert.equal(duelOutcome({ c: 8, t: 50_000 }, { c: 8, t: 50_000 }), 'draw');
});

test('Modus duel ist gültig; Einstellung duelName wird normalisiert', () => {
  assert.equal(parseMode('duel'), 'duel');
  assert.equal(DEFAULT_SETTINGS.duelName, '');
  assert.equal(normalizeSettings({ duelName: 'Anna' }).duelName, 'Anna');
  assert.equal(normalizeSettings({ duelName: 5 }).duelName, '');
  assert.equal(normalizeSettings({ duelName: 'y'.repeat(60) }).duelName.length, 24);
  assert.equal(normalizeSettings({ duelName: 'a\u0000b' }).duelName, 'a b');
});
