// Erinnerungen per Push (DOM-frei, von App und Server genutzt): Einstellungen, gemeldeter Lernstand,
// Zeitplan in der Zeitzone des Geräts (DST-sicher über Intl) und die Entscheidung, was zu einem Zeitpunkt gesendet wird.

export type ReminderKind = 'daily' | 'streak' | 'review' | 'tip';
/** Reihenfolge = Priorität, wenn mehrere Erinnerungen gleichzeitig fällig sind. */
export const REMINDER_KINDS: readonly ReminderKind[] = ['daily', 'streak', 'review', 'tip'];

export interface ReminderPrefs {
  /** Tägliche Erinnerung zur gewählten Uhrzeit */
  daily: boolean;
  /** Uhrzeit der täglichen Erinnerung in Minuten nach Mitternacht (lokal), 0–1439 */
  dailyAt: number;
  /** Wochentage der täglichen Erinnerung als Bitmaske: Bit 0 = Montag … Bit 6 = Sonntag */
  days: number;
  /** Tägliche Erinnerung entfällt, wenn das Tagesziel heute schon erreicht ist */
  onlyIfOpen: boolean;
  /** „Serie retten“: abends, wenn die Serie sonst reißt */
  streak: boolean;
  /** Fällige Wiederholungen (Leitner-Boxen), höchstens einmal am Tag */
  review: boolean;
  /** Wöchentlicher Lern-Hinweis (Rechentrick, bevorzugt zu einer Schwäche) */
  tip: boolean;
}

/** Lernstand, den das Gerät meldet – nur, was die Erinnerungen brauchen. */
export interface ReminderState {
  /** Lokaler Tag der Meldung, 'YYYY-MM-DD' */
  day: string;
  /** Aktive Minuten an `day` */
  todayMin: number;
  /** Tagesziel in Minuten */
  goalMin: number;
  /** Tagesziel an `day` erreicht */
  goalDone: boolean;
  /** Aktuelle Serie in Tagen (enthält `day` nur, wenn dort das Ziel erreicht ist) */
  streak: number;
  /** Fällige Wiederholungen (Aufgabentypen) zum Zeitpunkt der Meldung */
  reviewsDue: number;
  /** Nächste Fälligkeit einer Wiederholung (ms) oder null */
  nextReviewAt: number | null;
  /** Schwächste Aufgabentypen (Subtyp-IDs), höchstens 3 */
  weak: string[];
  /** Zeitpunkt der Meldung (ms) */
  at: number;
}

/** Geplante Zeitpunkte je Art (ms, UTC) */
export type ReminderSchedule = Record<ReminderKind, number | null>;

const ALL_DAYS = 0b1111111;
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  daily: true, dailyAt: 18 * 60, days: ALL_DAYS, onlyIfOpen: true, streak: true, review: false, tip: true,
};

/** „Serie retten“ um 20:00 Uhr lokal */
export const STREAK_AT = 20 * 60;
/** Lern-Hinweis sonntags um 10:00 Uhr lokal */
export const TIP_AT = 10 * 60;
export const TIP_DAYS = 1 << 6;
/** Wiederholungen nur zwischen 9 und 20 Uhr lokal */
export const REVIEW_FROM = 9 * 60;
export const REVIEW_UNTIL = 20 * 60;
/** Mindestabstand zur letzten Benachrichtigung (gilt nicht für die tägliche, die der Nutzer selbst gewählt hat) */
export const MIN_GAP_MS = 90 * 60_000;
/** Wer gerade in der App war, bekommt keine Erinnerung */
export const RECENT_ACTIVITY_MS = 20 * 60_000;
/** Verpasste Zeitpunkte (z. B. Ausfall des Cron) werden nach dieser Spanne nicht mehr nachgeholt */
export const STALE_MS = 2 * 60 * 60_000;

const MIN = 60_000;
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SUBTYPE_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;

/* ---------- Validierung (Eingaben von Gerät/Netz) ---------- */

/** Einstellungen aus beliebiger Eingabe: fehlende Felder → Standard, falscher Typ → null. */
export function parsePrefs(raw: unknown): ReminderPrefs | null {
  if (!isObj(raw)) return null;
  const out: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS };
  for (const k of ['daily', 'onlyIfOpen', 'streak', 'review', 'tip'] as const) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return null;
    out[k] = v;
  }
  if (raw.dailyAt !== undefined) {
    const v = raw.dailyAt;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= 24 * 60) return null;
    out.dailyAt = v;
  }
  if (raw.days !== undefined) {
    const v = raw.days;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > ALL_DAYS) return null;
    out.days = v;
  }
  return out;
}

const nonNegInt = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : null;

/** Gemeldeter Lernstand; ungültig → null. */
export function parseState(raw: unknown): ReminderState | null {
  if (!isObj(raw)) return null;
  const { day, goalDone, nextReviewAt, weak } = raw;
  if (typeof day !== 'string' || !DAY_RE.test(day)) return null;
  if (typeof goalDone !== 'boolean') return null;
  const todayMin = nonNegInt(raw.todayMin, 24 * 60);
  const goalMin = nonNegInt(raw.goalMin, 24 * 60);
  const streak = nonNegInt(raw.streak, 100_000);
  const reviewsDue = nonNegInt(raw.reviewsDue, 10_000);
  const at = nonNegInt(raw.at, Number.MAX_SAFE_INTEGER);
  if (todayMin === null || goalMin === null || streak === null || reviewsDue === null || at === null) return null;
  let next: number | null = null;
  if (nextReviewAt !== null && nextReviewAt !== undefined) {
    next = nonNegInt(nextReviewAt, Number.MAX_SAFE_INTEGER);
    if (next === null) return null;
  }
  if (weak !== undefined && !Array.isArray(weak)) return null;
  const weakIds = (Array.isArray(weak) ? weak : [])
    .filter((w): w is string => typeof w === 'string' && w.length <= 40 && SUBTYPE_RE.test(w))
    .slice(0, 3);
  return { day, todayMin, goalMin, goalDone, streak, reviewsDue, nextReviewAt: next, weak: weakIds, at };
}

/** Gültige IANA-Zeitzone (laut Intl), sonst 'UTC'. */
export function normalizeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/* ---------- Zeit in einer Zeitzone ---------- */

interface LocalParts { y: number; m: number; d: number; hh: number; mm: number; ss: number }

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const x of formatter(tz).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { y: p.year ?? 1970, m: p.month ?? 1, d: p.day ?? 1, hh: (p.hour ?? 0) % 24, mm: p.minute ?? 0, ss: p.second ?? 0 };
}

/** Abstand Ortszeit − UTC (ms) zum Zeitpunkt `ms` */
function offsetMs(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

/** Ortszeit (Tag + Minuten) → UTC-ms. Fällt die Uhrzeit in eine DST-Lücke, wird sie um die Lücke verschoben. */
export function localToUtc(y: number, m: number, d: number, minutes: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const o1 = offsetMs(guess, tz);
  const t = guess - o1;
  const o2 = offsetMs(t, tz);
  return o2 === o1 ? t : guess - o2;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Lokaler Tag 'YYYY-MM-DD' von `ms` in `tz` */
export function localDay(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Minuten nach Mitternacht (lokal) */
export function localMinutes(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return p.hh * 60 + p.mm;
}

/** Tag davor/danach als 'YYYY-MM-DD' */
export function shiftDay(day: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Nächster Zeitpunkt > `now` mit Ortszeit `minutes` an einem Wochentag aus `days` (Bit 0 = Montag); null bei leerer Maske. */
export function nextLocalTime(now: number, tz: string, minutes: number, days: number = ALL_DAYS): number | null {
  if ((days & ALL_DAYS) === 0) return null;
  const p = localParts(now, tz);
  for (let i = 0; i <= 8; i++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const weekday = (dt.getUTCDay() + 6) % 7;
    if ((days & (1 << weekday)) === 0) continue;
    const t = localToUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), minutes, tz);
    if (t > now) return t;
  }
  return null;
}

/* ---------- Lernstand zum Zeitpunkt now ---------- */

/** Ziel heute (lokal) schon erreicht? */
export function goalDoneToday(state: ReminderState | null, today: string): boolean {
  return Boolean(state && state.day === today && state.goalDone);
}

/** Serie, die heute noch zu retten ist (0 = keine oder schon gesichert). */
export function streakAtRisk(state: ReminderState | null, today: string): number {
  if (!state) return 0;
  if (state.day === today) return state.goalDone ? 0 : state.streak;
  if (state.day === shiftDay(today, -1)) return state.goalDone ? state.streak : 0;
  return 0;
}

/** Wiederholungen fällig? (Anzahl, mindestens 1, wenn die nächste Fälligkeit verstrichen ist) */
export function reviewsDueAt(state: ReminderState | null, now: number): number {
  if (!state) return 0;
  if (state.nextReviewAt !== null && state.nextReviewAt <= now) return Math.max(1, state.reviewsDue);
  return 0;
}

/* ---------- Zeitplan ---------- */

/** Nächster Zeitpunkt für Wiederholungen: frühestens zur Fälligkeit, nur im Tagesfenster, höchstens einmal pro Tag. */
function nextReviewTime(state: ReminderState | null, tz: string, from: number, lastReviewSent: number | null): number | null {
  if (!state || state.nextReviewAt === null) return null;
  const sentDay = lastReviewSent === null ? null : localDay(lastReviewSent, tz);
  let t = Math.max(state.nextReviewAt, from);
  for (let i = 0; i < 4; i++) {
    const mins = localMinutes(t, tz);
    if (localDay(t, tz) !== sentDay && mins >= REVIEW_FROM && mins < REVIEW_UNTIL) return t;
    // sonst: nächster Fensterbeginn (heute um 9, falls noch davor, sonst morgen)
    const next = nextLocalTime(t, tz, REVIEW_FROM);
    if (next === null) return null;
    t = next;
  }
  return null;
}

export interface ScheduleInput {
  prefs: ReminderPrefs;
  state: ReminderState | null;
  tz: string;
  /** Zeitpunkte nach diesem Moment planen */
  from: number;
  /** Letzte gesendete Wiederholungs-Erinnerung (höchstens einmal pro Tag) */
  lastReviewSent?: number | null;
}

/** Plant jede Art einzeln. */
export function planKind(kind: ReminderKind, o: ScheduleInput): number | null {
  const { prefs, tz, from } = o;
  switch (kind) {
    case 'daily': return prefs.daily ? nextLocalTime(from, tz, prefs.dailyAt, prefs.days) : null;
    case 'streak': return prefs.streak ? nextLocalTime(from, tz, STREAK_AT) : null;
    case 'review': return prefs.review ? nextReviewTime(o.state, tz, from, o.lastReviewSent ?? null) : null;
    case 'tip': return prefs.tip ? nextLocalTime(from, tz, TIP_AT, TIP_DAYS) : null;
  }
}

export function planAll(o: ScheduleInput): ReminderSchedule {
  return { daily: planKind('daily', o), streak: planKind('streak', o), review: planKind('review', o), tip: planKind('tip', o) };
}

/** Frühester geplanter Zeitpunkt oder null */
export function nextAt(s: Partial<ReminderSchedule>): number | null {
  let best: number | null = null;
  for (const k of REMINDER_KINDS) {
    const v = s[k];
    if (typeof v === 'number' && Number.isFinite(v) && (best === null || v < best)) best = v;
  }
  return best;
}

/** Gespeicherten Zeitplan (JSON) lesen; Unbekanntes → null */
export function parseSchedule(raw: unknown): ReminderSchedule {
  const s: Record<string, unknown> = isObj(raw) ? raw : {};
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { daily: num(s.daily), streak: num(s.streak), review: num(s.review), tip: num(s.tip) };
}

/* ---------- Entscheidung im Takt des Cron ---------- */

export interface DecideInput {
  now: number;
  tz: string;
  prefs: ReminderPrefs;
  state: ReminderState | null;
  sched: ReminderSchedule;
  /** Letzte gesendete Benachrichtigung (beliebiger Art) */
  lastSentAt: number | null;
}

export interface Decision {
  /** Zu sendende Art oder null */
  kind: ReminderKind | null;
  /** Fällige Arten (werden neu geplant, egal ob gesendet) */
  due: ReminderKind[];
}

/** Welche Arten sind fällig, und welche davon wird gesendet? Höchstens eine Benachrichtigung je Takt. */
export function decide(o: DecideInput): Decision {
  const due = REMINDER_KINDS.filter((k) => {
    const t = o.sched[k];
    return t !== null && t <= o.now;
  });
  const today = localDay(o.now, o.tz);
  const recentlyActive = o.state !== null && o.state.at <= o.now && o.now - o.state.at < RECENT_ACTIVITY_MS;
  const gapOk = o.lastSentAt === null || o.now - o.lastSentAt >= MIN_GAP_MS;
  const wanted = (k: ReminderKind): boolean => {
    const t = o.sched[k];
    if (t === null || o.now - t > STALE_MS || recentlyActive) return false;
    switch (k) {
      case 'daily': return o.prefs.daily && !(o.prefs.onlyIfOpen && goalDoneToday(o.state, today));
      case 'streak': return o.prefs.streak && gapOk && streakAtRisk(o.state, today) >= 1;
      case 'review': return o.prefs.review && gapOk && reviewsDueAt(o.state, o.now) >= 1;
      case 'tip': return o.prefs.tip && gapOk;
    }
  };
  return { kind: due.find(wanted) ?? null, due };
}

export interface ReplanInput extends DecideInput {
  /** Arten, die neu geplant werden (fällige bzw. vom Lernstand abhängige) */
  kinds: readonly ReminderKind[];
  lastReviewSent: number | null;
}

/**
 * Plant `kinds` ab `now` neu; alle anderen Arten bleiben unverändert – auch überfällige, über die erst der Takt
 * entscheidet (sonst ginge eine Erinnerung verloren, wenn kurz nach ihrem Zeitpunkt ein neuer Lernstand eintrifft).
 * Wiederholungen warten zusätzlich den Mindestabstand und eine gerade laufende Nutzung ab, statt jede Minute erneut zu prüfen.
 */
export function replan(o: ReplanInput): ReminderSchedule {
  const out: ReminderSchedule = { ...o.sched };
  for (const k of REMINDER_KINDS) {
    if (!o.kinds.includes(k)) continue;
    let from = o.now;
    if (k === 'review') {
      if (o.lastSentAt !== null) from = Math.max(from, o.lastSentAt + MIN_GAP_MS);
      if (o.state && o.state.at <= o.now) from = Math.max(from, o.state.at + RECENT_ACTIVITY_MS);
    }
    out[k] = planKind(k, { prefs: o.prefs, state: o.state, tz: o.tz, from, lastReviewSent: o.lastReviewSent });
  }
  return out;
}

/* ---------- Anzeige ---------- */

/** 'HH:MM' ↔ Minuten */
export function formatTime(minutes: number): string {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
}
