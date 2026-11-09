// Gewertete Challenges im Client: API (/api/challenge), Outbox für die Abgabe und ein kleiner lokaler Stand.
// Die Abgabe übersteht Neuladen, Schließen und Funklöcher: Nach jeder Antwort steht der Fortschritt in localStorage,
// flushPending() schickt ihn beim nächsten Start (bzw. sobald das Netz zurück ist) ab. Ein Abbruch zählt als Versuch.
import type { Task } from '../types.ts';
import type {
  ChallengeAnswer, ChallengeInfo, ChallengeResult, GroupInfo, Leaderboard, PublicProfile,
} from '../core/challenge.ts';
import { accessToken, accountEnabled, getAccountState, onAccountChange } from './account.ts';
import { apiUrl } from '../platform/index.ts';
import { getLang } from '../i18n/index.ts';

const PENDING_KEY = 'mm:v3:challenge.pending';
const RESULTS_KEY = 'mm:v3:challenge.results';
const MAX_RESULTS = 60;
const TIMEOUT_MS = 15_000;

export type ChallengeErrorCode =
  | 'invalid' | 'unauthorized' | 'not_found' | 'already_played' | 'closed' | 'upcoming' | 'not_member' | 'not_owner'
  | 'name_taken' | 'name_invalid' | 'no_profile' | 'full' | 'too_many' | 'rate_limited' | 'server_error' | 'no_attempt'
  | 'network';

export class ChallengeError extends Error {
  readonly code: ChallengeErrorCode;
  constructor(code: ChallengeErrorCode) {
    super(code);
    this.name = 'ChallengeError';
    this.code = code;
  }
}

const KNOWN: readonly string[] = [
  'invalid', 'unauthorized', 'not_found', 'already_played', 'closed', 'upcoming', 'not_member', 'not_owner', 'name_taken',
  'name_invalid', 'no_profile', 'full', 'too_many', 'rate_limited', 'server_error', 'no_attempt',
];

export function challengeErrorCode(e: unknown): ChallengeErrorCode {
  return e instanceof ChallengeError ? e.code : 'network';
}

/** Gewertete Challenges brauchen ein Konto (Supabase + Passkeys konfiguriert und angemeldet). */
export function rankedAvailable(): boolean {
  return accountEnabled() && getAccountState().status === 'signed-in';
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, o: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (o.auth !== false) {
    const token = await accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/challenge${path}`), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, cache: 'no-store',
    });
  } catch {
    throw new ChallengeError('network');
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* leer oder kein JSON */ }
  if (!res.ok) {
    const code = (data as { error?: { code?: unknown } } | null)?.error?.code;
    throw new ChallengeError(typeof code === 'string' && KNOWN.includes(code) ? code as ChallengeErrorCode : 'server_error');
  }
  // Ein Server ohne diese Route liefert z. B. die HTML-Startseite (200): das ist kein Netzproblem, sondern der Server
  if (data === null || typeof data !== 'object') throw new ChallengeError('server_error');
  return data as T;
}

/* ---------- Lokaler Stand ---------- */

function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Speicher voll oder gesperrt */ }
}

/** Zuletzt bekannte Ergebnisse je Challenge (für Heute, auch offline). */
export function cachedResult(id: string): ChallengeResult | null {
  return readJson<Record<string, ChallengeResult>>(RESULTS_KEY)?.[id] ?? null;
}

function cacheResult(id: string, r: ChallengeResult | null): void {
  if (!r) return;
  const all = readJson<Record<string, ChallengeResult>>(RESULTS_KEY) ?? {};
  all[id] = r;
  const keys = Object.keys(all).sort();
  while (keys.length > MAX_RESULTS) delete all[keys.shift() ?? ''];
  writeJson(RESULTS_KEY, all);
}

/** Laufender bzw. noch nicht abgegebener Versuch (höchstens einer). */
export interface PendingAttempt {
  id: string;
  lang: 'de' | 'en';
  startedAt: string;
  deadline: string;
  count: number;
  answers: ChallengeAnswer[];
  /** true: beendet (fertig oder abgebrochen), wartet nur noch auf die Abgabe */
  closed: boolean;
}

export function pendingAttempt(): PendingAttempt | null {
  const p = readJson<PendingAttempt>(PENDING_KEY);
  return p && typeof p.id === 'string' && Array.isArray(p.answers) ? p : null;
}

function savePending(p: PendingAttempt | null): void { writeJson(PENDING_KEY, p); }

/** Versuch, der gerade in dieser Seite gespielt wird – flushPending lässt ihn in Ruhe, bis er beendet ist. */
let liveId: string | null = null;

/** Antwort im laufenden Versuch festhalten (nach jeder Aufgabe). */
export function recordAnswer(id: string, a: ChallengeAnswer): void {
  const p = pendingAttempt();
  if (!p || p.id !== id || p.closed) return;
  if (!p.answers.some((x) => x.i === a.i)) p.answers.push(a);
  savePending(p);
}

/* ---------- API ---------- */

export interface Overview {
  day: string;
  daily: ChallengeInfo;
  competitions: ChallengeInfo[];
  profile: PublicProfile | null;
  groups: GroupInfo[];
  signedIn: boolean;
}

export async function loadOverview(): Promise<Overview> {
  await flushPending();
  const o = await request<Overview>('GET', '/overview');
  cacheResult(o.daily.id, o.daily.result);
  for (const c of o.competitions) cacheResult(c.id, c.result);
  return o;
}

export async function loadChallenge(id: string): Promise<ChallengeInfo> {
  await flushPending();
  const { challenge } = await request<{ challenge: ChallengeInfo }>('GET', `/info?id=${encodeURIComponent(id)}`);
  cacheResult(challenge.id, challenge.result);
  return challenge;
}

export interface StartedAttempt { id: string; tasks: Task[]; startedAt: string; deadline: string }

/** Startet den einen gewerteten Versuch: ab hier zählt er. Legt die Outbox an, bevor die erste Aufgabe erscheint. */
export async function startAttempt(id: string): Promise<StartedAttempt> {
  const lang = getLang();
  const s = await request<StartedAttempt>('POST', '/start', { id, lang });
  savePending({ id, lang, startedAt: s.startedAt, deadline: s.deadline, count: s.tasks.length, answers: [], closed: false });
  liveId = id;
  return s;
}

/** Versuch beenden (fertig oder abgebrochen) und abgeben. Ohne Netz bleibt er in der Outbox: null. */
export async function finishAttempt(id: string): Promise<ChallengeResult | null> {
  if (liveId === id) liveId = null;
  const p = pendingAttempt();
  if (!p || p.id !== id) return null;
  if (!p.closed) savePending({ ...p, closed: true });
  return flushPending();
}

/** Runde ohne Ergebnis verlassen (Zurück, anderer Link): gilt als abgebrochen und wird abgegeben. */
export function abandonLive(id: string): void {
  if (liveId !== id) return;
  void finishAttempt(id);
}

let flushing: Promise<ChallengeResult | null> | null = null;

/**
 * Wartenden Versuch abgeben. Ein nicht beendeter Versuch (App geschlossen, neu geladen) gilt als abgebrochen –
 * offene Aufgaben zählen 0 Punkte. Liefert das Ergebnis oder null (nichts zu tun, kein Netz, nicht angemeldet).
 */
export function flushPending(): Promise<ChallengeResult | null> {
  flushing ??= (async (): Promise<ChallengeResult | null> => {
    const p = pendingAttempt();
    if (!p || !rankedAvailable() || (p.id === liveId && !p.closed)) return null;
    try {
      const { result } = await request<{ result: ChallengeResult }>('POST', '/finish', { id: p.id, lang: p.lang, answers: p.answers });
      savePending(null);
      cacheResult(p.id, result);
      return result;
    } catch (e) {
      const code = challengeErrorCode(e);
      // Endgültig: Versuch fehlt, Challenge weg oder Abgabe ungültig – sonst (Netz, Server) später erneut
      if (code === 'no_attempt' || code === 'not_found' || code === 'invalid') savePending(null);
      return null;
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function loadProfile(): Promise<PublicProfile | null> {
  return (await request<{ profile: PublicProfile | null }>('GET', '/profile')).profile;
}

/** Läuft ein Versuch ohne Antworten auf diesem Gerät (anderes Gerät, Speicher gelöscht): jetzt so abgeben. */
export async function submitEmpty(id: string): Promise<ChallengeResult> {
  const { result } = await request<{ result: ChallengeResult }>('POST', '/finish', { id, lang: getLang(), answers: [] });
  cacheResult(id, result);
  return result;
}

export async function loadReview(id: string): Promise<{ tasks: Task[]; answers: ChallengeAnswer[] }> {
  return request('GET', `/review?id=${encodeURIComponent(id)}&lang=${getLang()}`);
}

export async function loadBoard(id: string, groupId: string | null): Promise<Leaderboard> {
  const q = `?id=${encodeURIComponent(id)}${groupId ? `&group=${encodeURIComponent(groupId)}` : ''}`;
  return (await request<{ board: Leaderboard }>('GET', `/board${q}`)).board;
}

export async function loadWeek(day: string, groupId: string | null): Promise<Leaderboard> {
  const q = `?day=${encodeURIComponent(day)}${groupId ? `&group=${encodeURIComponent(groupId)}` : ''}`;
  return (await request<{ board: Leaderboard }>('GET', `/week${q}`)).board;
}

export async function saveProfile(displayName: string, listed: boolean): Promise<PublicProfile> {
  return (await request<{ profile: PublicProfile }>('POST', '/profile', { displayName, listed })).profile;
}

export async function loadGroups(): Promise<GroupInfo[]> {
  return (await request<{ groups: GroupInfo[] }>('GET', '/groups')).groups;
}

export async function createGroup(name: string): Promise<GroupInfo> {
  return (await request<{ group: GroupInfo }>('POST', '/groups/create', { name })).group;
}

export async function joinGroup(code: string): Promise<{ group: GroupInfo; joined: boolean }> {
  return request('POST', '/groups/join', { code });
}

export async function leaveGroup(id: string): Promise<'left' | 'deleted'> {
  return (await request<{ outcome: 'left' | 'deleted' }>('POST', '/groups/leave', { id })).outcome;
}

export interface CompetitionInput {
  groupId: string;
  title: string;
  count: number;
  level: 1 | 2 | 3;
  days: number;
  categories: string[] | null;
}

export async function createCompetition(o: CompetitionInput): Promise<ChallengeInfo> {
  return (await request<{ challenge: ChallengeInfo }>('POST', '/groups/compete', o)).challenge;
}

/** Wartende Abgabe erneut senden, sobald das Netz zurück ist (idempotent). */
let watching = false;
export function watchPending(win: Pick<EventTarget, 'addEventListener'> | undefined = globalThis.window): void {
  if (watching || !win) return;
  watching = true;
  win.addEventListener('online', () => { void flushPending(); });
  onAccountChange((st) => { if (st.status === 'signed-in') void flushPending(); });
}
