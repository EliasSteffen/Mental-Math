// /api/push – Push-Erinnerungen (Cloudflare Pages Function + Node >= 20).
// Abos ohne Konto: Das Gerät erzeugt id + Geheimnis, gespeichert wird nur der SHA-256-Hash des Geheimnisses.
// Takt: pg_cron ruft jede Minute POST /api/push/tick mit dem Token aus public.push_config (sql/005_push_cron.sql).
// VAPID-Schlüssel erzeugt der Server beim ersten Aufruf selbst und legt sie in public.push_config ab.
import {
  DEFAULT_REMINDER_PREFS, decide, nextAt, normalizeTimeZone, parsePrefs, parseSchedule, parseState, planAll, replan,
} from '../src/core/reminders.ts';
import type { ReminderPrefs, ReminderSchedule, ReminderState } from '../src/core/reminders.ts';
import { b64uDecode, b64uEncode, generateVapidKeys, sendPush, validVapidKeys } from './push-crypto.ts';
import type { FetchLike, SendResult, VapidKeys } from './push-crypto.ts';
import { composeMessage } from '../src/core/reminder-messages.ts';
import type { MessageKind } from '../src/core/reminder-messages.ts';
import { hitLimits } from './rate-limit.ts';
import type { Hits } from './rate-limit.ts';

export interface PushEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** VAPID-„sub“ (https-URL oder mailto:); Standard: Origin der Anfrage */
  PUSH_SUBJECT?: string;
}

/** Zeile in public.push_subscriptions (Zeitstempel als ISO-Strings) */
export interface PushRow {
  id: string;
  secret_hash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz: string;
  lang: 'de' | 'en';
  prefs: unknown;
  state: unknown;
  sched: unknown;
  next_at: string | null;
  last_sent_at: string | null;
  last_review_at: string | null;
  last_test_at: string | null;
  failures: number;
  updated_at?: string;
}

export interface PushStore {
  /** VAPID-Schlüssel (oder null) und Token des Cron-Takts; null, wenn die Konfiguration fehlt */
  getConfig(): Promise<{ vapid: unknown; cronToken: string } | null>;
  /** Setzt die Schlüssel, falls noch keine da sind; liefert die gespeicherten */
  initVapid(keys: VapidKeys): Promise<unknown>;
  get(id: string): Promise<PushRow | null>;
  getByEndpoint(endpoint: string): Promise<PushRow | null>;
  /** Anlegen oder vollständig ersetzen (gleiche id) */
  put(row: PushRow): Promise<void>;
  update(id: string, patch: Partial<PushRow>): Promise<void>;
  remove(id: string): Promise<void>;
  /** Fällige Zeilen holen und kurz reservieren (RPC push_claim_due) */
  claimDue(now: number, limit: number): Promise<PushRow[]>;
}

export interface PushDeps {
  createStore: (url: string, serviceKey: string) => PushStore;
  fetchImpl?: FetchLike;
  now?: () => number;
}

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const MAX_BODY = 4096;
const TEST_INTERVAL_MS = 30_000;
const CLAIM_LIMIT = 100;
const CONCURRENCY = 8;
/** Abo nach so vielen dauerhaften Fehlern (4xx außer 404/410/429) entfernen */
const MAX_FAILURES = 3;
const TTL: Record<MessageKind, number> = { daily: 3 * 3600, streak: 3 * 3600, review: 6 * 3600, tip: 12 * 3600, test: 300 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const ms = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/* ---------- Validierung ---------- */

/** Nur bekannte Push-Dienste (Chrome/Edge/Android, Firefox, Safari/iOS, Windows) – der Server ruft keine beliebigen URLs auf. */
export function allowedEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return null;
  const host = u.hostname;
  const ok = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com')
    || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
  return ok ? u.href : null;
}

export interface SubscriptionInput { endpoint: string; p256dh: string; auth: string }

export function parseSubscription(raw: unknown): SubscriptionInput | null {
  if (!isObj(raw) || !isObj(raw.keys)) return null;
  const endpoint = allowedEndpoint(raw.endpoint);
  const { p256dh, auth } = raw.keys;
  if (!endpoint || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  const pub = b64uDecode(p256dh);
  const sec = b64uDecode(auth);
  if (!pub || pub.length !== 65 || pub[0] !== 4 || !sec || sec.length !== 16) return null;
  return { endpoint, p256dh, auth };
}

const parseLang = (v: unknown): 'de' | 'en' => (v === 'en' ? 'en' : 'de');

async function sha256(s: string): Promise<string> {
  return b64uEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

/** Vergleich in konstanter Zeit (gleich lange ASCII-Strings) */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function originOk(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

async function readJson(req: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, res: json(400, { error: 'invalid' }) };
  }
  if (raw.length > MAX_BODY) return { ok: false, res: json(413, { error: 'too_large' }) };
  try {
    const body: unknown = JSON.parse(raw);
    if (isObj(body)) return { ok: true, body };
  } catch { /* unten */ }
  return { ok: false, res: json(400, { error: 'invalid' }) };
}

/* ---------- Begrenzung pro IP (best effort pro Isolate) ---------- */

let hits: Hits = {};
const HOUR = 3_600_000;
function limited(req: Request, now: number): boolean {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const r = hitLimits(hits, [{ key: `push:${ip}`, windowMs: HOUR, max: 300 }], now);
  hits = { ...hits, ...r.hits };
  if (Object.keys(hits).length > 5000) hits = {};
  return !r.ok;
}

/** Für Tests */
export function _resetPushState(): void {
  hits = {};
  cache = null;
}

/* ---------- Kontext (pro Isolate gecacht) ---------- */

interface Ctx { store: PushStore; vapid: VapidKeys | null; cronToken: string | null; loadedAt: number }
let cache: { fingerprint: string; ctx: Ctx } | null = null;
const CONFIG_TTL = 5 * 60_000;

const clean = (v: string | undefined): string => (v ?? '').trim();

function context(env: PushEnv, deps: PushDeps): Ctx | null {
  const url = clean(env.SUPABASE_URL);
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return null;
  const fingerprint = `${url}|${key.length}`;
  if (!cache || cache.fingerprint !== fingerprint) {
    cache = { fingerprint, ctx: { store: deps.createStore(url, key), vapid: null, cronToken: null, loadedAt: 0 } };
  }
  return cache.ctx;
}

/** Lädt Token und VAPID-Schlüssel; erzeugt die Schlüssel beim allerersten Aufruf. */
async function loadConfig(ctx: Ctx, now: number): Promise<{ vapid: VapidKeys; cronToken: string }> {
  if (ctx.vapid && ctx.cronToken && now - ctx.loadedAt < CONFIG_TTL) return { vapid: ctx.vapid, cronToken: ctx.cronToken };
  const cfg = await ctx.store.getConfig();
  if (!cfg) throw new Error('push_config missing');
  let vapid = cfg.vapid;
  if (!validVapidKeys(vapid)) vapid = await ctx.store.initVapid(await generateVapidKeys());
  if (!validVapidKeys(vapid)) throw new Error('vapid invalid');
  ctx.vapid = { publicKey: vapid.publicKey, privateKey: vapid.privateKey };
  ctx.cronToken = cfg.cronToken;
  ctx.loadedAt = now;
  return { vapid: ctx.vapid, cronToken: cfg.cronToken };
}

function subjectFor(req: Request, env: PushEnv): string {
  const s = clean(env.PUSH_SUBJECT);
  if (/^(https:\/\/|mailto:)/.test(s)) return s;
  const origin = new URL(req.url).origin;
  return origin.startsWith('https://') ? origin : 'mailto:push@localhost';
}

/* ---------- Senden ---------- */

interface SendCtx { vapid: VapidKeys; subject: string; now: number; fetchImpl?: FetchLike }

async function deliver(row: PushRow, kind: MessageKind, state: ReminderState | null, c: SendCtx): Promise<SendResult> {
  const msg = composeMessage(kind, { lang: row.lang, state, now: c.now, tz: normalizeTimeZone(row.tz) });
  try {
    return await sendPush(row, msg, {
      keys: c.vapid, subject: c.subject, now: c.now, ttl: TTL[kind],
      topic: kind === 'test' ? 'test' : 'reminder', urgency: kind === 'test' ? 'high' : 'normal', fetchImpl: c.fetchImpl,
    });
  } catch {
    return { ok: false, status: 0, gone: false };
  }
}

const transient = (r: SendResult): boolean => r.status === 0 || r.status === 429 || r.status >= 500;

export type TickOutcome = 'sent' | 'skipped' | 'retry' | 'failed' | 'removed';

/** Ein fälliges Abo im Takt: entscheiden, ggf. senden, neu planen. */
export async function processRow(store: PushStore, row: PushRow, c: SendCtx): Promise<TickOutcome> {
  const prefs = parsePrefs(row.prefs) ?? { ...DEFAULT_REMINDER_PREFS };
  const state = parseState(row.state);
  const sched = parseSchedule(row.sched);
  const tz = normalizeTimeZone(row.tz);
  const lastSentAt = ms(row.last_sent_at);
  let lastReviewSent = ms(row.last_review_at);
  const d = decide({ now: c.now, tz, prefs, state, sched, lastSentAt });

  let outcome: TickOutcome = 'skipped';
  let failures = row.failures;
  let sentAt = lastSentAt;
  if (d.kind) {
    const r = await deliver(row, d.kind, state, c);
    if (r.gone || (!r.ok && !transient(r) && failures + 1 >= MAX_FAILURES)) {
      await store.remove(row.id);
      return 'removed';
    }
    if (r.ok) {
      outcome = 'sent';
      failures = 0;
      sentAt = c.now;
      if (d.kind === 'review') lastReviewSent = c.now;
    } else if (transient(r)) {
      outcome = 'retry';
    } else {
      outcome = 'failed';
      failures += 1;
    }
  }
  const next: ReminderSchedule = replan({ now: c.now, tz, prefs, state, sched, lastSentAt: sentAt, kinds: d.due, lastReviewSent });
  // Vorübergehender Fehler: diese Art im nächsten Takt erneut versuchen (nach STALE_MS gibt decide() auf)
  if (outcome === 'retry' && d.kind) next[d.kind] = sched[d.kind];
  await store.update(row.id, {
    sched: next, next_at: iso(nextAt(next)), last_sent_at: iso(sentAt), last_review_at: iso(lastReviewSent), failures,
  });
  return outcome;
}

async function inBatches<T, R>(items: readonly T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

/* ---------- Routen ---------- */

interface Authed { row: PushRow; body: Record<string, unknown> }

/** id + Geheimnis prüfen; Antwort bei Fehler */
async function authenticate(store: PushStore, body: Record<string, unknown>): Promise<{ ok: true; row: PushRow } | { ok: false; res: Response }> {
  const id = typeof body.id === 'string' ? body.id.toLowerCase() : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  if (!UUID_RE.test(id) || !SECRET_RE.test(secret)) return { ok: false, res: json(400, { error: 'invalid' }) };
  const row = await store.get(id);
  if (!row) return { ok: false, res: json(404, { error: 'not_found' }) };
  if (!sameString(row.secret_hash, await sha256(secret))) return { ok: false, res: json(403, { error: 'forbidden' }) };
  return { ok: true, row };
}

/** Optionale Felder tz/lang/prefs/state; null bei ungültigen Werten */
function parseSettings(body: Record<string, unknown>): { prefs?: ReminderPrefs; state?: ReminderState | null; tz?: string; lang?: 'de' | 'en' } | null {
  const out: { prefs?: ReminderPrefs; state?: ReminderState | null; tz?: string; lang?: 'de' | 'en' } = {};
  if (body.prefs !== undefined) {
    const p = parsePrefs(body.prefs);
    if (!p) return null;
    out.prefs = p;
  }
  if (body.state !== undefined) {
    const s = body.state === null ? null : parseState(body.state);
    if (body.state !== null && !s) return null;
    out.state = s;
  }
  if (body.tz !== undefined) out.tz = normalizeTimeZone(body.tz);
  if (body.lang !== undefined) out.lang = parseLang(body.lang);
  return out;
}

async function onSubscribe(store: PushStore, body: Record<string, unknown>, now: number): Promise<Response> {
  const id = typeof body.id === 'string' ? body.id.toLowerCase() : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const sub = parseSubscription(body.subscription);
  const settings = parseSettings(body);
  if (!UUID_RE.test(id) || !SECRET_RE.test(secret) || !sub || !settings) return json(400, { error: 'invalid' });
  const hash = await sha256(secret);
  const existing = await store.get(id);
  if (existing && !sameString(existing.secret_hash, hash)) return json(403, { error: 'forbidden' });
  // Derselbe Browser mit neuer id (z. B. nach gelöschten Websitedaten): das alte Abo ersetzen – wer den Endpoint kennt, ist dieser Browser
  const other = await store.getByEndpoint(sub.endpoint);
  if (other && other.id !== id) await store.remove(other.id);

  const prefs = settings.prefs ?? (parsePrefs(existing?.prefs) ?? { ...DEFAULT_REMINDER_PREFS });
  const state = settings.state !== undefined ? settings.state : parseState(existing?.state);
  const tz = settings.tz ?? normalizeTimeZone(existing?.tz);
  const lastReviewSent = ms(existing?.last_review_at);
  const sched = planAll({ prefs, state, tz, from: now, lastReviewSent });
  await store.put({
    id, secret_hash: hash, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, tz,
    lang: settings.lang ?? existing?.lang ?? 'de', prefs, state, sched, next_at: iso(nextAt(sched)),
    last_sent_at: existing?.last_sent_at ?? null, last_review_at: existing?.last_review_at ?? null,
    last_test_at: existing?.last_test_at ?? null, failures: 0, updated_at: iso(now) ?? undefined,
  });
  return json(200, { ok: true, next: nextAt(sched) });
}

async function onUpdate(store: PushStore, { row, body }: Authed, now: number): Promise<Response> {
  const settings = parseSettings(body);
  let sub: SubscriptionInput | null = null;
  if (body.subscription !== undefined) {
    sub = parseSubscription(body.subscription);
    if (!sub) return json(400, { error: 'invalid' });
  }
  if (!settings) return json(400, { error: 'invalid' });
  const prefs = settings.prefs ?? (parsePrefs(row.prefs) ?? { ...DEFAULT_REMINDER_PREFS });
  const state = settings.state !== undefined ? settings.state : parseState(row.state);
  const tz = settings.tz ?? normalizeTimeZone(row.tz);
  const lastReviewSent = ms(row.last_review_at);
  const timing = settings.prefs !== undefined || (settings.tz !== undefined && settings.tz !== row.tz);
  // Neue Einstellungen/Zeitzone → alles neu; nur Lernstand → nur Wiederholungen (Uhrzeiten bleiben)
  const sched = timing
    ? planAll({ prefs, state, tz, from: now, lastReviewSent })
    : replan({ now, tz, prefs, state, sched: parseSchedule(row.sched), lastSentAt: ms(row.last_sent_at), kinds: ['review'], lastReviewSent });
  const patch: Partial<PushRow> = { prefs, state, tz, sched, next_at: iso(nextAt(sched)), updated_at: iso(now) ?? undefined };
  if (settings.lang) patch.lang = settings.lang;
  if (sub && sub.endpoint !== row.endpoint) {
    const other = await store.getByEndpoint(sub.endpoint);
    if (other && other.id !== row.id) await store.remove(other.id);
  }
  if (sub) Object.assign(patch, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, failures: 0 });
  await store.update(row.id, patch);
  return json(200, { ok: true, next: nextAt(sched) });
}

async function onTest(store: PushStore, row: PushRow, c: SendCtx): Promise<Response> {
  const last = ms(row.last_test_at);
  if (last !== null && c.now - last < TEST_INTERVAL_MS) return json(429, { error: 'rate_limited' });
  await store.update(row.id, { last_test_at: iso(c.now) });
  const r = await deliver(row, 'test', parseState(row.state), c);
  if (r.gone) {
    await store.remove(row.id);
    return json(410, { error: 'gone' });
  }
  return r.ok ? json(200, { ok: true }) : json(502, { error: 'push_failed', status: r.status });
}

async function onRenew(store: PushStore, body: Record<string, unknown>, now: number): Promise<Response> {
  const old = allowedEndpoint(body.oldEndpoint);
  const sub = parseSubscription(body.subscription);
  if (!old || !sub) return json(400, { error: 'invalid' });
  const row = await store.getByEndpoint(old);
  if (!row) return json(404, { error: 'not_found' });
  const other = await store.getByEndpoint(sub.endpoint);
  if (other && other.id !== row.id) await store.remove(other.id);
  await store.update(row.id, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, failures: 0, updated_at: iso(now) ?? undefined });
  return json(200, { ok: true });
}

async function onTick(req: Request, ctx: Ctx, c: Omit<SendCtx, 'vapid'>): Promise<Response> {
  const cfg = await loadConfig(ctx, c.now);
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !sameString(token, cfg.cronToken)) return json(401, { error: 'unauthorized' });
  const rows = await ctx.store.claimDue(c.now, CLAIM_LIMIT);
  const send: SendCtx = { ...c, vapid: cfg.vapid };
  const outcomes = await inBatches(rows, CONCURRENCY, async (row) => {
    try {
      return await processRow(ctx.store, row, send);
    } catch {
      return 'failed' as const;
    }
  });
  const count = (o: TickOutcome): number => outcomes.filter((x) => x === o).length;
  return json(200, { claimed: rows.length, sent: count('sent'), skipped: count('skipped'), retry: count('retry'), failed: count('failed'), removed: count('removed') });
}

const ROUTES: Readonly<Record<string, 'GET' | 'POST'>> = {
  config: 'GET', subscribe: 'POST', update: 'POST', test: 'POST', unsubscribe: 'POST', renew: 'POST', tick: 'POST',
};

export async function handlePush(req: Request, env: PushEnv, deps: PushDeps): Promise<Response> {
  const now = (deps.now ?? Date.now)();
  const route = new URL(req.url).pathname.replace(/^\/api\/push\/?/, '').replace(/\/$/, '');
  const method = Object.hasOwn(ROUTES, route) ? ROUTES[route] : undefined;
  if (!method) return json(404, { error: 'not_found' });
  if (req.method !== method) return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...JSON_HEADERS, Allow: method } });

  let ctx: Ctx | null;
  try {
    ctx = context(env, deps);
  } catch (err) {
    console.error(`push: store init failed (${err instanceof Error ? err.name : 'unknown'})`);
    ctx = null;
  }

  if (route === 'config') {
    if (!ctx) return json(200, { enabled: false });
    try {
      const cfg = await loadConfig(ctx, now);
      return json(200, { enabled: true, publicKey: cfg.vapid.publicKey });
    } catch (err) {
      console.error(`push: config unavailable (${err instanceof Error ? err.message : 'unknown'})`);
      return json(200, { enabled: false });
    }
  }
  if (!ctx) return json(503, { error: 'unavailable' });
  const send = { subject: subjectFor(req, env), now, fetchImpl: deps.fetchImpl };

  try {
    if (route === 'tick') return await onTick(req, ctx, send);
    if (!originOk(req)) return json(403, { error: 'forbidden' });
    if (limited(req, now)) return json(429, { error: 'rate_limited' });
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.res;
    const { body } = parsed;
    if (route === 'subscribe') return await onSubscribe(ctx.store, body, now);
    if (route === 'renew') return await onRenew(ctx.store, body, now);

    const a = await authenticate(ctx.store, body);
    if (!a.ok) return route === 'unsubscribe' && a.res.status === 404 ? json(200, { ok: true }) : a.res;
    if (route === 'unsubscribe') {
      await ctx.store.remove(a.row.id);
      return json(200, { ok: true });
    }
    if (route === 'update') return await onUpdate(ctx.store, { row: a.row, body }, now);
    const cfg = await loadConfig(ctx, now);
    return await onTest(ctx.store, a.row, { ...send, vapid: cfg.vapid });
  } catch (err) {
    console.error(`push: ${route} failed (${err instanceof Error ? err.message : 'unknown'})`);
    return json(500, { error: 'server_error' });
  }
}
