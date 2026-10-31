// Push-Erinnerungen im Browser: Unterstützung erkennen, Erlaubnis + Abo, Einstellungen und Lernstand an /api/push melden.
// Ohne Konto: Das Gerät erzeugt id + Geheimnis (localStorage); der Server speichert nur den Hash des Geheimnisses.
import { DEFAULT_REMINDER_PREFS, parsePrefs } from '../core/reminders.ts';
import type { ReminderPrefs, ReminderState } from '../core/reminders.ts';
import { dayKey, streakInfo } from '../core/progress.ts';
import { dueReviews, nextDue } from '../core/review.ts';
import { weaknesses } from '../core/scoring.ts';
import { getActivity, getAttempts, getReviews, getSettings, onChange } from '../data/storage.ts';
import { getLang, onLangChange } from '../i18n/index.ts';
import type { Activity, Attempt, CategoryId, Reviews } from '../types.ts';

const KEY = 'mm:v3:push';
const SW_TIMEOUT_MS = 10_000;
/** Lernstand spätestens so oft melden, auch wenn er gleich bleibt (Zeitpunkt der letzten Nutzung) */
const REFRESH_MS = 10 * 60_000;
const REPORT_DELAY_MS = 15_000;

/* ---------- Lokaler Zustand ---------- */

interface Local {
  id: string;
  secret: string;
  enabled: boolean;
  prefs: ReminderPrefs;
  endpoint: string;
  publicKey: string;
  /** Zuletzt gemeldeter Lernstand (ohne Zeitstempel) und wann */
  sent: string;
  sentAt: number;
}

function readLocal(): Local | null {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.secret !== 'string') return null;
    return {
      id: r.id, secret: r.secret, enabled: r.enabled === true,
      prefs: parsePrefs(r.prefs) ?? { ...DEFAULT_REMINDER_PREFS },
      endpoint: typeof r.endpoint === 'string' ? r.endpoint : '',
      publicKey: typeof r.publicKey === 'string' ? r.publicKey : '',
      sent: typeof r.sent === 'string' ? r.sent : '',
      sentAt: typeof r.sentAt === 'number' ? r.sentAt : 0,
    };
  } catch {
    return null;
  }
}

function writeLocal(l: Local): void {
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* Speicher nicht verfügbar */ }
}

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ensureLocal(): Local {
  return readLocal() ?? {
    id: crypto.randomUUID(), secret: b64u(crypto.getRandomValues(new Uint8Array(32))), enabled: false,
    prefs: { ...DEFAULT_REMINDER_PREFS }, endpoint: '', publicKey: '', sent: '', sentAt: 0,
  };
}

/* ---------- Unterstützung ---------- */

export type PushSupport = 'ok' | 'unsupported' | 'ios-install';

/** iOS/iPadOS kennt Web Push nur in der installierten App (Home-Bildschirm). */
export function detectSupport(o: { serviceWorker: boolean; push: boolean; ios: boolean; standalone: boolean }): PushSupport {
  if (o.serviceWorker && o.push) return 'ok';
  return o.ios && !o.standalone ? 'ios-install' : 'unsupported';
}

export function pushSupport(): PushSupport {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  if (!nav) return 'unsupported';
  return detectSupport({
    serviceWorker: 'serviceWorker' in nav,
    push: 'PushManager' in globalThis && 'Notification' in globalThis,
    ios: /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1),
    standalone: nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches),
  });
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in globalThis ? Notification.permission : 'unsupported';
}

/* ---------- Lernstand ---------- */

export interface StateInput {
  activity: Activity;
  goalMin: number;
  reviews: Reviews;
  attempts: Attempt[];
  enabledCategories: CategoryId[] | null;
}

/** Was der Server für Erinnerungen braucht – nicht mehr. */
export function buildReminderState(o: StateInput, now: number = Date.now()): ReminderState {
  const goalMin = Math.max(1, Math.round(o.goalMin));
  const st = streakInfo(o.activity, goalMin * 60_000, now);
  return {
    day: dayKey(now),
    todayMin: Math.floor(st.todayMs / 60_000),
    goalMin,
    goalDone: st.todayDone,
    streak: st.current,
    reviewsDue: dueReviews(o.reviews, now).length,
    nextReviewAt: nextDue(o.reviews),
    weak: weaknesses(o.attempts, 3, { enabledCategories: o.enabledCategories }).map((w) => w.subtype),
    at: now,
  };
}

function currentState(now = Date.now()): ReminderState {
  const s = getSettings();
  return buildReminderState({
    activity: getActivity(), goalMin: s.dailyGoalMin, reviews: getReviews(), attempts: getAttempts(),
    enabledCategories: s.enabledCategories,
  }, now);
}

/** Vergleichsschlüssel ohne Zeitstempel */
const stateKey = (s: ReminderState): string => JSON.stringify({ ...s, at: 0 });

const timeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

/* ---------- Server ---------- */

interface ApiResult { status: number; data: Record<string, unknown> }

async function api(path: string, body?: unknown, keepalive = false): Promise<ApiResult> {
  const init: RequestInit = body === undefined
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive };
  const res = await fetch(`/api/push/${path}`, init);
  let data: Record<string, unknown> = {};
  try { data = (await res.json()) as Record<string, unknown>; } catch { /* leer */ }
  return { status: res.status, data };
}

export interface PushConfig { enabled: boolean; publicKey: string }
let configPromise: Promise<PushConfig> | null = null;

/** Ist Push auf dem Server eingerichtet? (einmal pro Sitzung; bei Netzfehler erneut) */
export function pushConfig(): Promise<PushConfig> {
  configPromise ??= api('config').then(({ data }) => {
    const publicKey = typeof data.publicKey === 'string' ? data.publicKey : '';
    return { enabled: data.enabled === true && publicKey !== '', publicKey };
  }).catch(() => {
    configPromise = null;
    return { enabled: false, publicKey: '' };
  });
  return configPromise;
}

function swReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw timeout')), SW_TIMEOUT_MS)),
  ]);
}

const sameKey = (a: ArrayBuffer | null | undefined, publicKey: string): boolean => a != null && b64u(new Uint8Array(a)) === publicKey;

/** Abo des Browsers passend zum Serverschlüssel (bei Schlüsselwechsel neu). */
async function browserSubscription(publicKey: string): Promise<PushSubscription> {
  const reg = await swReady();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, publicKey)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(publicKey) });
}

async function register(local: Local, publicKey: string, sub: PushSubscription): Promise<boolean> {
  const state = currentState();
  const res = await api('subscribe', {
    id: local.id, secret: local.secret, subscription: sub.toJSON(), tz: timeZone(), lang: getLang(), prefs: local.prefs, state,
  });
  if (res.status !== 200) return false;
  writeLocal({ ...local, enabled: true, endpoint: sub.endpoint, publicKey, sent: stateKey(state), sentAt: state.at });
  return true;
}

/* ---------- Öffentliche API ---------- */

export function isPushEnabled(): boolean {
  return readLocal()?.enabled === true && notificationPermission() === 'granted';
}

export function getPushPrefs(): ReminderPrefs {
  return readLocal()?.prefs ?? { ...DEFAULT_REMINDER_PREFS };
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'unavailable' | 'error';

/** Einschalten – aus einem Klick heraus aufrufen: Die Erlaubnis wird vor allem anderen erfragt (iOS verlangt die Geste). */
export async function enablePush(): Promise<EnableResult> {
  if (pushSupport() !== 'ok') return 'unsupported';
  let perm: NotificationPermission;
  try {
    perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  } catch {
    return 'denied';
  }
  if (perm !== 'granted') return 'denied';
  try {
    const cfg = await pushConfig();
    if (!cfg.enabled) return 'unavailable';
    const local = ensureLocal();
    const sub = await browserSubscription(cfg.publicKey);
    return (await register(local, cfg.publicKey, sub)) ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function disablePush(): Promise<void> {
  const local = readLocal();
  if (local) writeLocal({ ...local, enabled: false, sent: '', sentAt: 0 });
  try {
    const sub = await (await swReady()).pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch { /* kein Abo im Browser */ }
  if (local) await api('unsubscribe', { id: local.id, secret: local.secret }).catch(() => undefined);
}

let prefsTimer: ReturnType<typeof setTimeout> | null = null;

/** Einstellungen sofort lokal speichern, gebündelt an den Server melden. */
export function setPushPrefs(prefs: ReminderPrefs): void {
  const local = readLocal();
  if (!local) return;
  writeLocal({ ...local, prefs });
  if (!local.enabled) return;
  if (prefsTimer) clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    prefsTimer = null;
    const l = readLocal();
    if (l?.enabled) void api('update', { id: l.id, secret: l.secret, prefs: l.prefs, tz: timeZone(), lang: getLang() }).catch(() => undefined);
  }, 600);
}

export type TestResult = 'ok' | 'wait' | 'gone' | 'error';

export async function sendTestPush(): Promise<TestResult> {
  const local = readLocal();
  if (!local?.enabled) return 'error';
  try {
    const res = await api('test', { id: local.id, secret: local.secret });
    if (res.status === 200) return 'ok';
    if (res.status === 429) return 'wait';
    if (res.status === 410 || res.status === 404) {
      writeLocal({ ...local, enabled: false });
      return 'gone';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

/** Lernstand melden, wenn er sich geändert hat (oder `REFRESH_MS` vergangen sind). */
async function reportState(o: { keepalive?: boolean; refresh?: boolean } = {}): Promise<void> {
  const local = readLocal();
  if (!local?.enabled) return;
  const state = currentState();
  const key = stateKey(state);
  if (key === local.sent && !(o.refresh && state.at - local.sentAt >= REFRESH_MS)) return;
  try {
    const res = await api('update', { id: local.id, secret: local.secret, state, tz: timeZone(), lang: getLang() }, o.keepalive);
    if (res.status === 200) writeLocal({ ...readLocal() ?? local, sent: key, sentAt: state.at });
    else if (res.status === 404) void verify(true); // Abo auf dem Server verschwunden → neu anmelden
  } catch { /* offline: beim nächsten Mal */ }
}

/** Beim Start: Erlaubnis, Browser-Abo und Serverschlüssel abgleichen. */
async function verify(force = false): Promise<void> {
  const local = readLocal();
  if (!local?.enabled) return;
  const perm = notificationPermission();
  if (perm !== 'granted') {
    // In den Browser-Einstellungen widerrufen → abmelden
    if (perm === 'denied' || perm === 'unsupported') await disablePush();
    return;
  }
  try {
    const cfg = await pushConfig();
    if (!cfg.enabled) return;
    const sub = await browserSubscription(cfg.publicKey);
    if (force || sub.endpoint !== local.endpoint || local.publicKey !== cfg.publicKey) await register(local, cfg.publicKey, sub);
    else await reportState({ refresh: true });
  } catch { /* offline oder ohne Service Worker */ }
}

let started = false;
let reportTimer: ReturnType<typeof setTimeout> | null = null;

/** Einmal beim App-Start: Abo prüfen und Lernstand bei Änderungen melden. */
export function startPush(): void {
  if (started || pushSupport() !== 'ok') return;
  started = true;
  void verify();
  onChange(() => {
    if (!readLocal()?.enabled) return;
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => { reportTimer = null; void reportState(); }, REPORT_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void reportState({ keepalive: true, refresh: true });
  });
  onLangChange((lang) => {
    const l = readLocal();
    if (l?.enabled) void api('update', { id: l.id, secret: l.secret, lang }).catch(() => undefined);
  });
}
