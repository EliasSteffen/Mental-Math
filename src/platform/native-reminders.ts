// Erinnerungen in der iOS-App: lokale Benachrichtigungen, die das Gerät selbst plant (core/reminder-plan.ts spielt die
// Server-Regeln durch). Ohne Server und ohne Konto; neu geplant wird beim Start, bei Änderungen und beim Verlassen der App.
import { DEFAULT_REMINDER_PREFS, parsePrefs, REMINDER_KINDS } from '../core/reminders.ts';
import type { ReminderKind, ReminderPrefs } from '../core/reminders.ts';
import { planLocal } from '../core/reminder-plan.ts';
import type { PlannedReminder } from '../core/reminder-plan.ts';
import { composeMessage } from '../core/reminder-messages.ts';
import { onChange } from '../data/storage.ts';
import { currentReminderState } from '../features/reminder-input.ts';
import { getLang, onLangChange } from '../i18n/index.ts';
import { loadNative } from './native.ts';
import type { EnableResult, PushConfig, PushSupport, TestResult } from './web-push.ts';

const KEY = 'mm:v3:reminders.local';
/** Zwei Wochen vorausplanen; wer so lange nicht öffnet, bekommt danach keine Erinnerungen mehr */
const HORIZON_MS = 14 * 86_400_000;
/** iOS hält höchstens 64 ausstehende Benachrichtigungen */
const MAX_PENDING = 60;
const ID_BASE = 1000;
const TEST_ID = 999;
const CHANGE_DELAY_MS = 15_000;

interface Local {
  enabled: boolean;
  prefs: ReminderPrefs;
  /** Zuletzt geplante Benachrichtigungen (ms, Art); was davon fällig war, gilt beim nächsten Planen als zugestellt */
  plan: PlannedReminder[];
  lastSentAt: number | null;
  lastReviewSent: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isKind = (v: unknown): v is ReminderKind => (REMINDER_KINDS as readonly unknown[]).includes(v);

function read(): Local {
  try {
    const r = JSON.parse(globalThis.localStorage.getItem(KEY) ?? 'null') as Record<string, unknown> | null;
    if (r && typeof r === 'object') {
      const plan = Array.isArray(r.plan) ? r.plan : [];
      return {
        enabled: r.enabled === true,
        prefs: parsePrefs(r.prefs) ?? { ...DEFAULT_REMINDER_PREFS },
        plan: plan.flatMap((p: unknown) => {
          const o = p as { at?: unknown; kind?: unknown } | null;
          const at = num(o?.at);
          return at !== null && isKind(o?.kind) ? [{ at, kind: o.kind }] : [];
        }),
        lastSentAt: num(r.lastSentAt),
        lastReviewSent: num(r.lastReviewSent),
      };
    }
  } catch { /* Speicher nicht verfügbar */ }
  return { enabled: false, prefs: { ...DEFAULT_REMINDER_PREFS }, plan: [], lastSentAt: null, lastReviewSent: null };
}

function write(l: Local): void {
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* Speicher nicht verfügbar */ }
}

const latest = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));

const timeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

/* ---------- Erlaubnis ---------- */

let perm: NotificationPermission | 'unsupported' = 'default';
let permReady: Promise<void> | null = null;

const mapPerm = (display: string): NotificationPermission =>
  display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';

function refreshPermission(): Promise<void> {
  permReady = loadNative()
    .then((m) => m.LocalNotifications.checkPermissions())
    .then((p) => { perm = mapPerm(p.display); })
    .catch(() => { perm = 'unsupported'; });
  return permReady;
}

/* ---------- Planen ---------- */

/** Ausstehende Erinnerungen ersetzen. Was vom alten Plan schon fällig war, gilt als zugestellt (Abstands-Regeln). */
async function replanNow(): Promise<void> {
  const m = await loadNative();
  const now = Date.now();
  const old = read();
  let { lastSentAt, lastReviewSent } = old;
  for (const p of old.plan) {
    if (p.at > now) continue;
    lastSentAt = latest(lastSentAt, p.at);
    if (p.kind === 'review') lastReviewSent = latest(lastReviewSent, p.at);
  }
  const pending = await m.LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.id >= ID_BASE);
  if (ours.length) await m.LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  let plan: PlannedReminder[] = [];
  if (old.enabled && perm === 'granted') {
    const tz = timeZone();
    const state = currentReminderState(now);
    const lang = getLang();
    plan = planLocal({ prefs: old.prefs, state, tz, now, lastSentAt, lastReviewSent, horizonMs: HORIZON_MS, max: MAX_PENDING });
    if (plan.length) {
      await m.LocalNotifications.schedule({
        notifications: plan.map((p, i) => {
          const msg = composeMessage(p.kind, { lang, state, now: p.at, tz });
          return { id: ID_BASE + i, title: msg.title, body: msg.body, schedule: { at: new Date(p.at) }, extra: { url: msg.url } };
        }),
      });
    }
  }
  write({ ...read(), plan, lastSentAt, lastReviewSent });
}

let queue: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Nacheinander planen (nie zwei Durchläufe gleichzeitig). */
function replan(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  queue = queue.then(replanNow).catch(() => undefined);
  return queue;
}

function replanSoon(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void replan(); }, ms);
}

/* ---------- Öffentliche API (wie web-push.ts) ---------- */

export function pushSupport(): PushSupport {
  return 'ok';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return perm;
}

/** Lokale Erinnerungen sind immer verfügbar; wartet, bis die Erlaubnis bekannt ist. */
export async function pushConfig(): Promise<PushConfig> {
  await (permReady ?? refreshPermission());
  return { enabled: true, publicKey: '' };
}

export function isPushEnabled(): boolean {
  return read().enabled && perm === 'granted';
}

export function getPushPrefs(): ReminderPrefs {
  return read().prefs;
}

export async function enablePush(): Promise<EnableResult> {
  try {
    const m = await loadNative();
    perm = mapPerm((await m.LocalNotifications.requestPermissions()).display);
    if (perm !== 'granted') return 'denied';
    write({ ...read(), enabled: true });
    await replan();
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function disablePush(): Promise<void> {
  write({ ...read(), enabled: false });
  await replan();
}

export function setPushPrefs(prefs: ReminderPrefs): void {
  write({ ...read(), prefs });
  replanSoon(600);
}

export async function sendTestPush(): Promise<TestResult> {
  if (!isPushEnabled()) return 'error';
  try {
    const m = await loadNative();
    const msg = composeMessage('test', { lang: getLang(), state: null, now: Date.now(), tz: timeZone() });
    await m.LocalNotifications.schedule({
      // Die Probe soll auch in der offenen App als Banner erscheinen (Erinnerungen dort nur in der Mitteilungszentrale)
      notifications: [{
        id: TEST_ID, title: msg.title, body: msg.body, schedule: { at: new Date(Date.now() + 1500) }, extra: { url: msg.url }, foreground: true,
      }],
    });
    return 'ok';
  } catch {
    return 'error';
  }
}

let started = false;

export function startPush(): void {
  if (started) return;
  started = true;
  void refreshPermission().then(() => replan());
  onChange(() => { if (read().enabled) replanSoon(CHANGE_DELAY_MS); });
  onLangChange(() => { if (read().enabled) replanSoon(600); });
  void loadNative().then((m) => {
    // Beim Verlassen: „gerade aktiv“ zählt ab jetzt; beim Zurückkehren kann die Erlaubnis in den Einstellungen geändert sein
    void m.App.addListener('pause', () => { void replan(); });
    void m.App.addListener('resume', () => { void refreshPermission().then(() => replan()); });
  }).catch(() => undefined);
}
