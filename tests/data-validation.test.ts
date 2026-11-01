// S1: Pflichtfelder für Versuche/Runden – Import, Migration und Supabase-Mapper nutzen dieselbe Prüfung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAttempt, isValidSession, normalize } from '../src/data/schema.ts';
import { importJSON } from '../src/data/transfer.ts';
import { migrateV1, LEGACY_KEY } from '../src/data/migrate.ts';
import { MemoryAdapter } from '../src/data/adapters.ts';
import type { LegacyStore } from '../src/data/adapters.ts';
import { Repository } from '../src/vendor/storage.ts';
import { APP_SUPABASE_SCHEMA } from '../src/data/remote/supabase-schema.ts';
import { getAttempts, getSessions, getSyncState, invalidateCache, resetAll } from '../src/data/storage.ts';
import { createMeta } from '../src/data/meta.ts';
import type { Attempt, GameResult, Session, SessionStats, SyncRecord } from '../src/types.ts';

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 1000, targetMs: 2000, weight: 1, points: 100, ...o,
});
const ses = (o: Partial<Session> = {}): Session => ({ id: 's1', ts: 1, mode: 'all', n: 1, correct: 1, points: 100, avgTimeMs: 1000, ...o });

/** Kopie ohne ein Feld (wie ein Datensatz, dem es fehlt). */
function without<T extends object>(x: T, key: keyof T): Record<string, unknown> {
  const c: Record<string, unknown> = { ...(x as Record<string, unknown>) };
  delete c[key as string];
  return c;
}

test('isValidAttempt: vollständig ok, jedes Pflichtfeld fehlend oder falsch typisiert → ungültig', () => {
  assert.equal(isValidAttempt(att()), true);
  assert.equal(isValidAttempt(att({ given: null, errorType: 'skip' })), true, 'given/errorType sind keine Pflichtfelder');
  assert.equal(isValidAttempt({ ...att(), id: 'x', rev: 2, kind: 'choice', choices: ['a'] }), true, 'Zusatzfelder stören nicht');
  for (const k of ['sessionId', 'mode', 'category', 'subtype', 'prompt', 'unit', 'ts', 'timeMs', 'targetMs', 'points', 'expected', 'weight', 'correct'] as const) {
    assert.equal(isValidAttempt(without(att(), k)), false, `fehlend: ${k}`);
  }
  assert.equal(isValidAttempt(att({ unit: 5 as unknown as string })), false);
  assert.equal(isValidAttempt(att({ ts: '1' as unknown as number })), false);
  assert.equal(isValidAttempt(att({ expected: Number.NaN })), false);
  assert.equal(isValidAttempt(att({ timeMs: Number.POSITIVE_INFINITY })), false);
  assert.equal(isValidAttempt(att({ correct: 1 as unknown as boolean })), false);
  for (const x of [null, undefined, 'x', 1, [], [att()]]) assert.equal(isValidAttempt(x), false);
});

test('isValidSession: Pflichtfelder mode, ts, n, correct, points, avgTimeMs; id optional', () => {
  assert.equal(isValidSession(ses()), true);
  assert.equal(isValidSession(without(ses(), 'id')), true);
  for (const k of ['mode', 'ts', 'n', 'correct', 'points', 'avgTimeMs'] as const) {
    assert.equal(isValidSession(without(ses(), k)), false, `fehlend: ${k}`);
  }
  assert.equal(isValidSession(ses({ n: Number.NaN })), false);
  assert.equal(isValidSession(ses({ mode: 3 as unknown as string })), false);
  assert.equal(isValidSession(null), false);
});

test('normalize: verwirft ungültige Versuche und Runden', () => {
  const s = normalize({ attempts: [att({ ts: 1 }), without(att(), 'unit'), null], sessions: [ses(), { ts: 1 }] });
  assert.deepEqual(s.attempts.map((a) => a.ts), [1]);
  assert.equal(s.sessions.length, 1);
});

test('importJSON: zählt übersprungene Einträge, nichts Ungültiges landet in Daten oder Outbox', () => {
  invalidateCache();
  resetAll();
  const data = {
    version: 3,
    attempts: [att({ ts: 10 }), without(att({ ts: 11 }), 'weight'), att({ ts: 12, points: Number.NaN }), { ts: 13 }],
    sessions: [ses({ id: 'a' }), without(ses({ id: 'b' }), 'avgTimeMs')],
  };
  const res = importJSON(JSON.stringify(data)); // NaN wird beim Serialisieren zu null
  assert.deepEqual(res, { ok: true, attempts: 1, sessions: 1, skipped: 4 });
  assert.deepEqual(getAttempts().map((a) => a.ts), [10]);
  assert.deepEqual(getSessions().map((x) => x.id), ['a']);
  for (const a of getAttempts()) assert.ok(isValidAttempt(a));
  const pendingResults = getSyncState().pending.filter((c) => c.target === 'results');
  assert.equal(pendingResults.length, 1);
  resetAll();
});

test('importJSON: ohne ungültige Einträge skipped = 0', () => {
  invalidateCache();
  resetAll();
  const res = importJSON(JSON.stringify({ attempts: [att()], sessions: [] }));
  assert.deepEqual(res, { ok: true, attempts: 1, sessions: 0, skipped: 0 });
  resetAll();
});

test('migrateV1: unvollständige Versuche/Runden werden nicht übernommen', () => {
  const raw = new Map<string, string>([[LEGACY_KEY, JSON.stringify({
    version: 1,
    attempts: [att({ ts: 42 }), without(att({ ts: 43 }), 'prompt'), 'x', att({ ts: 44, correct: false })],
    sessions: [ses({ id: 's1' }), without(ses({ id: 's2' }), 'mode')],
  })]]);
  const legacy: LegacyStore = {
    get: (k) => raw.get(k) ?? null,
    set: (k, v) => { raw.set(k, v); },
    remove: (k) => { raw.delete(k); },
  };
  const repo = new Repository(new MemoryAdapter());
  assert.equal(migrateV1(repo, legacy), 'migrated');
  assert.deepEqual(repo.list<GameResult>('results').map((a) => a.ts), [42, 44]);
  assert.deepEqual(repo.list<SessionStats>('sessions').map((x) => x.id), ['s1']);
  assert.equal(repo.getSyncState().pending.filter((c) => c.target === 'results').length, 2);
});

test('Supabase-Mapper: toRow nutzt dieselbe Prüfung (gültig → Zeile, ungültig → TypeError)', () => {
  const { results, sessions } = APP_SUPABASE_SCHEMA.collections;
  assert.ok(results && sessions);
  const good = { ...att({ ts: 5 }), ...createMeta(5, 'dev', 'r1') } as unknown as SyncRecord;
  assert.equal(results.toRow(good, 'u1').id, 'r1');
  const bad = { ...without(att(), 'unit'), ...createMeta(5, 'dev', 'r2') } as unknown as SyncRecord;
  assert.throws(() => results.toRow(bad, 'u1'), TypeError);
  const nan = { ...att({ expected: Number.NaN }), ...createMeta(5, 'dev', 'r3') } as unknown as SyncRecord;
  assert.throws(() => results.toRow(nan, 'u1'), TypeError);
  const goodSes = { ...ses(), ...createMeta(1, 'dev', 's1') } as unknown as SyncRecord;
  assert.equal(sessions.toRow(goodSes, 'u1').id, 's1');
  const badSes = { ...without(ses(), 'n'), ...createMeta(1, 'dev', 's2') } as unknown as SyncRecord;
  assert.throws(() => sessions.toRow(badSes, 'u1'), TypeError);
});
