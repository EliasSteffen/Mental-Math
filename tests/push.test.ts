import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { _resetPushState, allowedEndpoint, handlePush, parseSubscription } from '../server/push.ts';
import type { PushDeps, PushEnv, PushRow, PushStore } from '../server/push.ts';
import { b64uEncode, concat, validVapidKeys } from '../server/push-crypto.ts';
import type { Bytes, FetchLike, VapidKeys } from '../server/push-crypto.ts';
import { clip, composeMessage, pickTipSubtype } from '../src/core/reminder-messages.ts';
import { DEFAULT_REMINDER_PREFS } from '../src/core/reminders.ts';
import type { ReminderState } from '../src/core/reminders.ts';

const ORIGIN = 'https://mental-math.elias-steffen.de';
const ENV: PushEnv = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const TOKEN = 'f'.repeat(64);
const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const ID2 = '7a1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SECRET = 'S'.repeat(43);
const EP = 'https://fcm.googleapis.com/fcm/send/device-1';
const EP2 = 'https://web.push.apple.com/QGuQyavXutnMH-device-2';
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- Speicher wie Supabase, nur im Speicher ---------- */
class MemoryStore implements PushStore {
  rows = new Map<string, PushRow>();
  config: { vapid: unknown; cronToken: string } | null = { vapid: null, cronToken: TOKEN };
  async getConfig() { return this.config ? { ...this.config } : null; }
  async initVapid(keys: VapidKeys) {
    if (!this.config) throw new Error('missing');
    if (!validVapidKeys(this.config.vapid)) this.config.vapid = keys;
    return this.config.vapid;
  }
  async get(id: string) { const r = this.rows.get(id); return r ? structuredClone(r) : null; }
  async getByEndpoint(endpoint: string) {
    const r = [...this.rows.values()].find((x) => x.endpoint === endpoint);
    return r ? structuredClone(r) : null;
  }
  async put(row: PushRow) { this.rows.set(row.id, structuredClone(row)); }
  async update(id: string, patch: Partial<PushRow>) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...structuredClone(patch) });
  }
  async remove(id: string) { this.rows.delete(id); }
  async claimDue(now: number, limit: number) {
    const due = [...this.rows.values()]
      .filter((r) => r.next_at !== null && Date.parse(r.next_at) <= now)
      .sort((a, b) => Date.parse(a.next_at ?? '') - Date.parse(b.next_at ?? ''))
      .slice(0, limit);
    for (const r of due) r.next_at = new Date(now + 5 * 60_000).toISOString();
    return due.map((r) => structuredClone(r));
  }
}

/* ---------- Browser-Seite: Schlüssel + Entschlüsseln (RFC 8291) ---------- */
interface Device { p256dh: string; auth: string; priv: CryptoKey; pub: Bytes; secret: Bytes }
async function device(): Promise<Device> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const secret = crypto.getRandomValues(new Uint8Array(16));
  return { p256dh: b64uEncode(pub), auth: b64uEncode(secret), priv: kp.privateKey, pub, secret };
}
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, len: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
async function decrypt(body: Bytes, d: Device): Promise<Record<string, unknown>> {
  const salt = body.slice(0, 16);
  const asPublic = body.slice(21, 21 + (body[20] ?? 0));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, d.priv, 256));
  const ikm = await hkdf(d.secret, ecdh, concat(enc.encode('WebPush: info\0'), d.pub, asPublic), 32);
  const key = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const iv = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body.slice(21 + asPublic.length)));
  return JSON.parse(dec.decode(plain.slice(0, -1))) as Record<string, unknown>;
}

/* ---------- Push-Dienst ---------- */
interface Sent { url: string; headers: Record<string, string>; body: Bytes }
let sent: Sent[] = [];
let status = 201;
const fetchImpl: FetchLike = async (url, init) => {
  sent.push({ url, headers: init.headers as Record<string, string>, body: init.body as Bytes });
  return new Response(null, { status });
};

let store: MemoryStore;
let clock = Date.parse('2026-01-15T10:00:00Z'); // Do 11:00 Berlin
let deps: PushDeps;

beforeEach(() => {
  _resetPushState();
  store = new MemoryStore();
  sent = [];
  status = 201;
  clock = Date.parse('2026-01-15T10:00:00Z');
  deps = { createStore: () => store, fetchImpl, now: () => clock };
});

function call(path: string, body?: unknown, o: { method?: string; origin?: string | null; auth?: string; env?: PushEnv } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (o.origin !== null) headers.Origin = o.origin ?? ORIGIN;
  if (o.auth) headers.Authorization = o.auth;
  const method = o.method ?? (body === undefined ? 'GET' : 'POST');
  return handlePush(new Request(`${ORIGIN}/api/push/${path}`, {
    method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  }), o.env ?? ENV, deps);
}

const state = (o: Partial<ReminderState> = {}): ReminderState => ({
  day: '2026-01-15', todayMin: 0, goalMin: 15, goalDone: false, streak: 0, reviewsDue: 0, nextReviewAt: null, weak: [],
  at: Date.parse('2026-01-15T06:00:00Z'), ...o,
});

async function subscribe(d: Device, extra: Record<string, unknown> = {}, id = ID, endpoint = EP): Promise<Response> {
  return call('subscribe', {
    id, secret: SECRET, subscription: { endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
    tz: 'Europe/Berlin', lang: 'de', prefs: DEFAULT_REMINDER_PREFS, state: state(), ...extra,
  });
}

const tick = (auth = `Bearer ${TOKEN}`): Promise<Response> => call('tick', {}, { origin: null, auth });

/* ---------- Tests ---------- */

test('Endpoint-Allowlist und Abo-Validierung', async () => {
  assert.equal(allowedEndpoint(EP), EP);
  assert.ok(allowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
  assert.ok(allowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc'));
  assert.ok(allowedEndpoint(EP2));
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://fcm.googleapis.com:8443/x', 'https://u:p@fcm.googleapis.com/x', 'not a url', 42]) {
    assert.equal(allowedEndpoint(bad), null, String(bad));
  }
  const d = await device();
  assert.ok(parseSubscription({ endpoint: EP, keys: { p256dh: d.p256dh, auth: d.auth } }));
  assert.equal(parseSubscription({ endpoint: EP, keys: { p256dh: d.auth, auth: d.auth } }), null);
  assert.equal(parseSubscription({ endpoint: EP, keys: { p256dh: d.p256dh, auth: d.p256dh } }), null);
  assert.equal(parseSubscription({ endpoint: EP }), null);
});

test('config: ohne Supabase aus; sonst VAPID-Schlüssel einmal erzeugt', async () => {
  assert.deepEqual(await (await call('config', undefined, { env: {} })).json(), { enabled: false });
  const a = await (await call('config')).json() as { enabled: boolean; publicKey: string };
  assert.equal(a.enabled, true);
  assert.ok(validVapidKeys(store.config?.vapid));
  _resetPushState(); // neue Instanz liest denselben Schlüssel
  const b = await (await call('config')).json() as { publicKey: string };
  assert.equal(b.publicKey, a.publicKey);
  store.config = null; // SQL fehlt
  _resetPushState();
  assert.deepEqual(await (await call('config')).json(), { enabled: false });
});

test('Routen, Methoden, Origin, Body', async () => {
  assert.equal((await call('nope')).status, 404);
  assert.equal((await call('config', {})).status, 405);
  assert.equal((await call('subscribe')).status, 405);
  assert.equal((await call('subscribe', {}, { origin: null })).status, 403);
  assert.equal((await call('subscribe', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('subscribe', { x: 'y'.repeat(5000) })).status, 413);
  assert.equal((await call('subscribe', {}, { env: {} })).status, 503);
});

test('subscribe: Validierung, Hash statt Geheimnis, Zeitplan', async () => {
  const d = await device();
  for (const extra of [{ id: 'nope' }, { secret: 'short' }, { prefs: { dailyAt: 9999 } }, { state: { day: 'x' } },
    { subscription: { endpoint: 'https://evil.example/x', keys: { p256dh: d.p256dh, auth: d.auth } } }]) {
    assert.equal((await subscribe(d, extra)).status, 400, JSON.stringify(extra));
  }
  const res = await subscribe(d);
  assert.equal(res.status, 200);
  const body = await res.json() as { next: number };
  const row = store.rows.get(ID);
  assert.ok(row);
  assert.notEqual(row.secret_hash, SECRET);
  assert.equal(row.secret_hash.length, 43);
  assert.equal(row.tz, 'Europe/Berlin');
  assert.equal(new Date(body.next).toISOString(), '2026-01-15T17:00:00.000Z', 'nächste: heute 18:00 Berlin');
  assert.equal(row.next_at, '2026-01-15T17:00:00.000Z');

  // gleiche id, falsches Geheimnis → 403
  assert.equal((await subscribe(d, { secret: 'T'.repeat(43) })).status, 403);
  // gleicher Endpoint, neue id → altes Abo ersetzt
  assert.equal((await subscribe(d, {}, ID2)).status, 200);
  assert.deepEqual([...store.rows.keys()], [ID2]);
});

test('update: Einstellungen planen neu, Lernstand nur Wiederholungen, Abo-Wechsel', async () => {
  const d = await device();
  await subscribe(d);
  assert.equal((await call('update', { id: ID, secret: 'T'.repeat(43) })).status, 403);
  assert.equal((await call('update', { id: ID2, secret: SECRET })).status, 404);
  assert.equal((await call('update', { id: ID, secret: SECRET, prefs: 'x' })).status, 400);

  let r = await call('update', { id: ID, secret: SECRET, prefs: { ...DEFAULT_REMINDER_PREFS, dailyAt: 7 * 60 + 30 } });
  assert.equal(r.status, 200);
  assert.equal((store.rows.get(ID)?.sched as { daily: number }).daily, Date.parse('2026-01-16T06:30:00Z'), 'morgen 07:30');

  // Nur Lernstand: tägliche Uhrzeit bleibt, Wiederholung wird geplant
  await call('update', { id: ID, secret: SECRET, prefs: { ...DEFAULT_REMINDER_PREFS, review: true } });
  const dailyBefore = (store.rows.get(ID)?.sched as { daily: number }).daily;
  clock += 60_000;
  r = await call('update', { id: ID, secret: SECRET, state: state({ nextReviewAt: Date.parse('2026-01-15T12:00:00Z'), at: clock }) });
  assert.equal(r.status, 200);
  const s = store.rows.get(ID)?.sched as { daily: number; review: number };
  assert.equal(s.daily, dailyBefore);
  assert.equal(s.review, Date.parse('2026-01-15T12:00:00Z'));

  const d2 = await device();
  await call('update', { id: ID, secret: SECRET, subscription: { endpoint: EP2, keys: { p256dh: d2.p256dh, auth: d2.auth } } });
  assert.equal(store.rows.get(ID)?.endpoint, EP2);
  assert.equal(store.rows.get(ID)?.p256dh, d2.p256dh);
});

test('test: Benachrichtigung verschlüsselt zugestellt, begrenzt, 410 entfernt', async () => {
  const d = await device();
  await subscribe(d, { lang: 'en' });
  const r = await call('test', { id: ID, secret: SECRET });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, EP);
  assert.match(sent[0]?.headers.Authorization ?? '', /^vapid t=.+, k=.+$/);
  assert.equal(sent[0]?.headers.Urgency, 'high');
  const msg = await decrypt(sent[0]?.body ?? new Uint8Array(), d);
  assert.equal(msg.title, 'Reminders are on');
  assert.equal(msg.url, '/#/profil');

  assert.equal((await call('test', { id: ID, secret: SECRET })).status, 429);
  clock += 31_000;
  status = 410;
  assert.equal((await call('test', { id: ID, secret: SECRET })).status, 410);
  assert.equal(store.rows.size, 0);
});

test('unsubscribe und renew', async () => {
  const d = await device();
  await subscribe(d);
  const d2 = await device();
  const renew = await call('renew', { oldEndpoint: EP, subscription: { endpoint: EP2, keys: { p256dh: d2.p256dh, auth: d2.auth } } });
  assert.equal(renew.status, 200);
  assert.equal(store.rows.get(ID)?.endpoint, EP2);
  assert.equal((await call('renew', { oldEndpoint: EP, subscription: { endpoint: EP2, keys: { p256dh: d2.p256dh, auth: d2.auth } } })).status, 404);

  assert.equal((await call('unsubscribe', { id: ID, secret: 'T'.repeat(43) })).status, 403);
  assert.equal((await call('unsubscribe', { id: ID, secret: SECRET })).status, 200);
  assert.equal(store.rows.size, 0);
  assert.equal((await call('unsubscribe', { id: ID, secret: SECRET })).status, 200, 'idempotent');
});

test('tick: Token nötig; tägliche Erinnerung genau einmal, dann morgen', async () => {
  const d = await device();
  await subscribe(d);
  assert.equal((await tick('Bearer wrong')).status, 401);
  assert.equal((await tick('')).status, 401);

  assert.deepEqual(await (await tick()).json(), { claimed: 0, sent: 0, skipped: 0, retry: 0, failed: 0, removed: 0 }, 'noch nicht fällig');
  clock = Date.parse('2026-01-15T17:00:20Z');
  assert.deepEqual(await (await tick()).json(), { claimed: 1, sent: 1, skipped: 0, retry: 0, failed: 0, removed: 0 });
  const msg = await decrypt(sent[0]?.body ?? new Uint8Array(), d);
  assert.equal(msg.title, 'Zeit für Kopfrechnen');
  assert.equal(sent[0]?.headers.Topic, 'reminder');
  const row = store.rows.get(ID);
  assert.equal(row?.last_sent_at, new Date(clock).toISOString());
  assert.equal(row?.next_at, '2026-01-15T19:00:00.000Z', 'als Nächstes: Serie retten um 20 Uhr');

  clock += 60_000;
  assert.equal((await (await tick()).json() as { claimed: number }).claimed, 0, 'nicht doppelt');
});

test('tick: Ziel erreicht → still übersprungen; Serie in Gefahr → Serie retten', async () => {
  const d = await device();
  await subscribe(d, { state: state({ goalDone: true, todayMin: 20, streak: 3 }) });
  clock = Date.parse('2026-01-15T17:00:20Z');
  assert.deepEqual(await (await tick()).json(), { claimed: 1, sent: 0, skipped: 1, retry: 0, failed: 0, removed: 0 });
  assert.equal(sent.length, 0);

  await call('update', { id: ID, secret: SECRET, state: state({ day: '2026-01-14', goalDone: true, streak: 3, at: Date.parse('2026-01-14T20:00:00Z') }) });
  clock = Date.parse('2026-01-15T19:00:20Z');
  assert.equal((await (await tick()).json() as { sent: number }).sent, 1);
  const msg = await decrypt(sent[0]?.body ?? new Uint8Array(), d);
  assert.equal(msg.title, '🔥 3 Tage in Folge');
});

test('tick: 410 entfernt; vorübergehender Fehler versucht es erneut; dauerhafte Fehler zählen', async () => {
  const d = await device();
  await subscribe(d);
  clock = Date.parse('2026-01-15T17:00:20Z');

  status = 503;
  assert.equal((await (await tick()).json() as { retry: number }).retry, 1);
  assert.equal(store.rows.get(ID)?.next_at, '2026-01-15T17:00:00.000Z', 'bleibt fällig');
  clock += 60_000;
  status = 400;
  assert.equal((await (await tick()).json() as { failed: number }).failed, 1);
  assert.equal(store.rows.get(ID)?.failures, 1);

  status = 410;
  clock = Date.parse('2026-01-15T19:00:20Z');
  await call('update', { id: ID, secret: SECRET, state: state({ streak: 2, at: Date.parse('2026-01-15T08:00:00Z') }) });
  const last = await (await tick()).json() as { removed: number };
  assert.equal(last.removed, 1);
  assert.equal(store.rows.size, 0);
});

test('Nachrichten: Varianten, Sprache, Tipp-Auswahl, Kürzen', () => {
  const now = Date.parse('2026-01-15T17:00:00Z');
  const base = { lang: 'de' as const, now, tz: 'Europe/Berlin' };
  const daily = composeMessage('daily', { ...base, state: state({ todayMin: 5 }) });
  assert.equal(daily.body, 'Noch 10 Minuten bis zu deinem Tagesziel.');
  const review = composeMessage('daily', { ...base, state: state({ nextReviewAt: now - 1, reviewsDue: 1 }) });
  assert.match(review.body, /1 Aufgabentyp auf Wiederholung/);
  assert.equal(review.url, '/#/train/review');
  const tip = composeMessage('tip', { ...base, lang: 'en', state: state({ weak: ['pct.of'] }) });
  assert.equal(tip.url, '/#/lernen/pct.of');
  assert.match(tip.title, /^Math trick: /);
  assert.ok(tip.body.length <= 180);
  assert.equal(pickTipSubtype(state({ weak: ['nope.nope'] }), now) !== 'nope.nope', true, 'unbekannte Typen ignoriert');
  assert.ok(pickTipSubtype(null, now));
  assert.equal(clip('kurz', 10), 'kurz');
  assert.equal(clip('ein ziemlich langer Satz mit vielen Wörtern', 20), 'ein ziemlich langer…');
});
