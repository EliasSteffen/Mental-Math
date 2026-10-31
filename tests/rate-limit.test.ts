import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, durableLimiter, explainChecks, hitLimits, memoryLimiter, parseChecks } from '../server/rate-limit.ts';
import type { DoNamespace, RateLimiter as Limiter } from '../server/rate-limit.ts';
import { RateLimiter } from '../workers/rate-limiter/src/index.ts';
import type { DoStorage } from '../workers/rate-limiter/src/index.ts';

test('hitLimits: zählt nur, wenn kein Fenster voll ist', () => {
  const checks = [{ key: 'a', windowMs: 1000, max: 2 }, { key: 'b', windowMs: 10_000, max: 3 }];
  let r = hitLimits({}, checks, 0);
  assert.equal(r.ok, true);
  r = hitLimits(r.hits, checks, 100);
  assert.equal(r.ok, true);
  r = hitLimits(r.hits, checks, 200);
  assert.equal(r.ok, false, 'a ist voll');
  assert.deepEqual(r.hits, { a: [0, 100], b: [0, 100] }, 'abgelehnter Treffer zählt nicht');
  r = hitLimits(r.hits, checks, 1050);
  assert.equal(r.ok, true, 'altes a fällt aus dem Fenster');
  r = hitLimits(r.hits, checks, 1060);
  assert.equal(r.ok, false, 'b ist voll (3 in 10 s)');
});

test('parseChecks: nur gültige Prüflisten', () => {
  assert.deepEqual(parseChecks({ checks: explainChecks('1.2.3.4') }), explainChecks('1.2.3.4'));
  for (const bad of [null, {}, { checks: [] }, { checks: [{ key: '', windowMs: 1, max: 1 }] }, { checks: [{ key: 'x', windowMs: DAY + 1, max: 1 }] },
    { checks: [{ key: 'x', windowMs: 1000, max: 0.5 }] }, { checks: Array(9).fill({ key: 'x', windowMs: 1, max: 1 }) }]) {
    assert.equal(parseChecks(bad), null, JSON.stringify(bad));
  }
});

test('memoryLimiter: 15 pro Minute und IP, andere IPs unabhängig', async () => {
  const m = memoryLimiter();
  for (let i = 0; i < 15; i++) assert.equal(await m.limited('1.1.1.1', 1000 + i), false);
  assert.equal(await m.limited('1.1.1.1', 2000), true);
  assert.equal(await m.limited('2.2.2.2', 2000), false);
  assert.equal(await m.limited('1.1.1.1', 1000 + 60_000), false, 'nach einer Minute wieder frei');
  m.reset();
  assert.equal(await m.limited('1.1.1.1', 2000), false);
});

// In-Memory-Storage mit der Teilmenge der Durable-Object-API
function fakeStorage(): DoStorage & { data: Map<string, unknown>; alarm: number | null } {
  const data = new Map<string, unknown>();
  const s = {
    data, alarm: null as number | null,
    async get<T>(keys: string[]) { return new Map(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k) as T])); },
    async put<T>(entries: Record<string, T>) { for (const [k, v] of Object.entries(entries)) data.set(k, v); },
    async delete(keys: string[]) { let n = 0; for (const k of keys) if (data.delete(k)) n++; return n; },
    async list<T>({ prefix }: { prefix: string }) { return new Map([...data].filter(([k]) => k.startsWith(prefix)) as Array<[string, T]>); },
    async getAlarm() { return s.alarm; },
    async setAlarm(t: number) { s.alarm = t; },
  };
  return s;
}

const hit = (obj: RateLimiter, ip: string): Promise<Response> =>
  obj.fetch(new Request('https://rate-limiter/hit', { method: 'POST', body: JSON.stringify({ checks: explainChecks(ip) }) }));

test('Durable Object: zählt global, speichert, setzt Aufräum-Alarm, räumt auf', async () => {
  let now = 1_000_000;
  const storage = fakeStorage();
  const obj = new RateLimiter({ storage }, {}, () => now);
  for (let i = 0; i < 15; i++) assert.deepEqual(await (await hit(obj, '9.9.9.9')).json(), { ok: true });
  assert.deepEqual(await (await hit(obj, '9.9.9.9')).json(), { ok: false });
  assert.equal((storage.data.get('ip:9.9.9.9:min') as number[]).length, 15);
  assert.equal(storage.alarm, 1_000_000 + DAY);
  assert.equal((await obj.fetch(new Request('https://x', { method: 'GET' }))).status, 405);
  assert.equal((await obj.fetch(new Request('https://x', { method: 'POST', body: '{"checks":1}' }))).status, 400);
  now += DAY + 1;
  await obj.alarm();
  assert.equal([...storage.data.keys()].some((k) => k.startsWith('ip:')), false, 'alte IP-Schlüssel entfernt');
});

test('durableLimiter: nutzt das Durable Object, fällt bei Fehlern auf den Fallback zurück', async () => {
  const obj = new RateLimiter({ storage: fakeStorage() });
  const ns: DoNamespace = { idFromName: (n) => n, get: () => ({ fetch: (url, init) => obj.fetch(new Request(url, init)) }) };
  const fallbackCalls: string[] = [];
  const fallback: Limiter = { async limited(ip) { fallbackCalls.push(ip); return true; } };
  const d = durableLimiter(ns, fallback);
  assert.equal(await d.limited('5.5.5.5', 0), false);
  assert.deepEqual(fallbackCalls, []);
  const broken: DoNamespace = { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error('down'); } }) };
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(await durableLimiter(broken, fallback).limited('6.6.6.6', 0), true);
    const bad: DoNamespace = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response('{}', { status: 200 }) }) };
    assert.equal(await durableLimiter(bad, fallback).limited('7.7.7.7', 0), true);
  } finally {
    console.error = origError;
  }
  assert.deepEqual(fallbackCalls, ['6.6.6.6', '7.7.7.7']);
});
