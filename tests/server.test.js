import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateExplainRequest, buildPrompt, callGemini, handleExplain, _resetRateLimits } from '../server/explain.js';
import { METHODS } from '../public/js/methods.js';

beforeEach(() => _resetRateLimits());

const ORIGIN = 'https://mental-math.elias-steffen.de';
const goodTask = () => ({
  kind: 'task',
  subtype: 'mult.2x2',
  prompt: '34 × 27',
  params: { a: 34, b: 27 },
  expected: 918,
  unit: '',
  given: 900,
});

const mkReq = (body, { method = 'POST', origin = ORIGIN, ip = '1.2.3.4' } = {}) => {
  const headers = { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request(ORIGIN + '/api/explain', {
    method,
    headers,
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
};

const okFetch = (calls = []) => async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '1. Zerlegen' }, { text: ' fertig' }] } }] }), { status: 200 });
};
const statusFetch = (status) => async () => new Response('{}', { status });

test('validate: gültige task/method', () => {
  assert.equal(validateExplainRequest(goodTask()).ok, true);
  assert.equal(validateExplainRequest({ kind: 'method', subtype: 'pct.of' }).ok, true);
  assert.equal(validateExplainRequest({ ...goodTask(), given: null }).value.given, null);
});

test('validate: ungültige Fälle', () => {
  const bad = [
    null,
    [],
    { ...goodTask(), kind: 'x' },
    { ...goodTask(), subtype: 'nope.nope' },
    { ...goodTask(), subtype: '__proto__' },
    { ...goodTask(), prompt: 'x'.repeat(161) },
    { ...goodTask(), prompt: 5 },
    { ...goodTask(), expected: Infinity },
    { ...goodTask(), expected: '918' },
    { ...goodTask(), given: NaN },
    { ...goodTask(), given: 'x' },
    { ...goodTask(), unit: 'u'.repeat(21) },
    { ...goodTask(), params: Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['k' + i, i])) },
    { ...goodTask(), params: { a: 'y'.repeat(41) } },
    { ...goodTask(), params: { a: {} } },
  ];
  for (const b of bad) assert.deepEqual(validateExplainRequest(b), { ok: false, error: 'invalid' });
});

test('buildPrompt enthält Zahlen und Namen', () => {
  const { system, user } = buildPrompt(validateExplainRequest(goodTask()).value);
  assert.match(system, /Consulting/);
  assert.match(user, /34 × 27/);
  assert.match(user, /918/);
  assert.match(user, /900/);
  assert.match(user, /a=34/);
  assert.match(user, /Multiplikation/);
});

test('buildPrompt: Methode, falls vorhanden', () => {
  const m = METHODS['mult.2x2'];
  const { user } = buildPrompt(validateExplainRequest(goodTask()).value);
  if (m) assert.ok(user.includes(m.idea));
  else assert.ok(!user.includes('Bevorzugte Methode'));
  const mp = buildPrompt({ kind: 'method', subtype: 'pct.of' });
  assert.match(mp.user, /x % von y/);
});

test('callGemini: Fehler tragen status', async () => {
  await assert.rejects(callGemini({ apiKey: 'k', model: 'm', system: 's', user: 'u', fetchImpl: statusFetch(500) }), (e) => e.status === 500);
});

test('200: Key nur im Header, Modell in URL', async () => {
  const calls = [];
  const res = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'SECRET123' }, { fetchImpl: okFetch(calls) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /application\/json; charset=utf-8/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const data = await res.json();
  assert.equal(data.text, '1. Zerlegen fertig');
  assert.equal(data.model, 'gemini-flash-lite-latest');
  assert.ok(!JSON.stringify(data).includes('SECRET123'));
  const { url, init } = calls[0];
  assert.ok(url.includes('/models/gemini-flash-lite-latest:generateContent'));
  assert.ok(!url.includes('SECRET123'));
  assert.equal(init.headers['x-goog-api-key'], 'SECRET123');
  assert.ok(!init.body.includes('SECRET123'));
  const sent = JSON.parse(init.body);
  assert.equal(sent.generationConfig.maxOutputTokens, 600);
  assert.equal(sent.contents[0].role, 'user');
});

test('GEMINI_MODEL überschreibt', async () => {
  const calls = [];
  await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k', GEMINI_MODEL: 'foo-model' }, { fetchImpl: okFetch(calls) });
  assert.ok(calls[0].url.includes('/models/foo-model:'));
});

test('405 bei GET', async () => {
  const res = await handleExplain(mkReq(null, { method: 'GET' }), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch() });
  assert.equal(res.status, 405);
});

test('403 ohne/fremder Origin', async () => {
  for (const origin of [null, 'https://evil.example']) {
    const res = await handleExplain(mkReq(goodTask(), { origin }), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch() });
    assert.equal(res.status, 403);
  }
});

test('400 bei kaputtem JSON und ungültiger Eingabe', async () => {
  let res = await handleExplain(mkReq('{nope'), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch() });
  assert.equal(res.status, 400);
  res = await handleExplain(mkReq({ ...goodTask(), subtype: 'zzz' }), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch() });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid' });
});

test('413 bei zu großem Body', async () => {
  const res = await handleExplain(mkReq('x'.repeat(4001)), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch() });
  assert.equal(res.status, 413);
});

test('503 ohne Key', async () => {
  const res = await handleExplain(mkReq(goodTask()), {}, { fetchImpl: okFetch() });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'not_configured' });
});

test('Upstream 429 → quota, 500 → upstream, leer → upstream', async () => {
  let res = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: statusFetch(429) });
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'quota' });
  res = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: statusFetch(500) });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'upstream' });
  const empty = async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 });
  res = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: empty });
  assert.equal(res.status, 502);
});

test('Rate-Limit: 16. Anfrage pro Minute → 429 rate_limited', async () => {
  const now = () => 1_000_000;
  for (let i = 0; i < 15; i++) {
    const r = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch(), now });
    assert.equal(r.status, 200);
  }
  const res = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch(), now });
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'rate_limited' });
  const later = await handleExplain(mkReq(goodTask()), { GOOGLE_API_KEY: 'k' }, { fetchImpl: okFetch(), now: () => 1_000_000 + 61_000 });
  assert.equal(later.status, 200);
});
