// Gruppen-Rennen im Client (v12 R2): API-Aufrufe (/api/challenge/race/*) und eine Outbox für die Abgabe.
// Wie bei der Daily übersteht die Abgabe Funklöcher: Nach dem Rennen steht sie in localStorage, flushRacePending() schickt
// sie ab, sobald das Netz zurück ist. Ein nicht beendeter Lauf (App geschlossen) wird als leer abgegeben – ein Lauf je Person.
import type { RaceConfig } from '../core/race.ts';
import type { RaceAnswerIn, RaceBoardRow, RaceInfo, RaceKind, RaceListItem, RaceOpen, RunStatus } from '../core/race-api.ts';
import { accountEnabled, getAccountState, onAccountChange } from './account.ts';
import { challengeErrorCode, challengeRequest } from './challenge.ts';

export { challengeErrorCode as raceErrorCode } from './challenge.ts';

const PENDING_KEY = 'mm:v3:race.pending';
const MAX_PENDING = 6;

/** Gruppen-Rennen brauchen ein Konto (wie die gewertete Daily). */
export const raceGroupsAvailable = (): boolean => accountEnabled() && getAccountState().status === 'signed-in';

/* ---------- API ---------- */

export interface RaceDetail {
  race: RaceInfo;
  board: RaceBoardRow[];
  /** Mitglieder der Gruppe ohne gewerteten Lauf („wer noch fehlt“), nur Namen */
  missing?: string[];
  me: { status: RunStatus; startedAt: string } | null;
}

export interface RaceFinish { rank: number; correct: number; wrong: number; status: RunStatus }

export async function createRace(o: { groupId: string; kind: RaceKind; config: RaceConfig; open?: RaceOpen }): Promise<RaceInfo> {
  return (await challengeRequest<{ race: RaceInfo }>('POST', '/race/create', o)).race;
}

export async function listRaces(groupId: string): Promise<RaceListItem[]> {
  return (await challengeRequest<{ races: RaceListItem[] }>('GET', `/race/list?group=${encodeURIComponent(groupId)}`)).races;
}

export async function getRace(id: string): Promise<RaceDetail> {
  await flushRacePending();
  return challengeRequest<RaceDetail>('GET', `/race/${encodeURIComponent(id)}`);
}

/** Startet den einen Lauf (Geister): ab hier zählt er. Legt die Outbox an, bevor die erste Aufgabe erscheint. */
export async function startRun(id: string): Promise<{ startedAt: string }> {
  const s = await challengeRequest<{ startedAt: string }>('POST', `/race/${encodeURIComponent(id)}/start`, {});
  setPending(id, { answers: [], closed: false });
  liveId = id;
  return s;
}

/** Live: Start setzen (jedes Mitglied, einmal). Bei `already` ist der Start schon gesetzt – dann per `getRace` lesen. */
export async function goLive(id: string): Promise<{ startsAt: string }> {
  return challengeRequest<{ startsAt: string }>('POST', `/race/${encodeURIComponent(id)}/go`, {});
}

/** Abgabe: legt sie in die Outbox und sendet sie. Ohne Netz bleibt sie dort: null. */
export async function finishRun(id: string, answers: readonly RaceAnswerIn[]): Promise<RaceFinish | null> {
  if (liveId === id) liveId = null;
  setPending(id, { answers: answers.map((a) => ({ i: a.i, input: a.input, ms: a.ms })), closed: true });
  return (await flushRacePending()).get(id) ?? null;
}

/** Lauf verlassen (✕ bestätigt): zählt als leere Abgabe. */
export function abandonRun(id: string): void {
  if (liveId === id) void finishRun(id, []);
}

/* ---------- Outbox ---------- */

interface PendingRun { answers: RaceAnswerIn[]; closed: boolean }

function readPending(): Record<string, PendingRun> {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage.getItem(PENDING_KEY) ?? '{}');
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, PendingRun> : {};
  } catch {
    return {};
  }
}

function writePending(all: Record<string, PendingRun>): void {
  try {
    const ids = Object.keys(all);
    while (ids.length > MAX_PENDING) delete all[ids.shift() ?? ''];
    if (ids.length === 0) globalThis.localStorage.removeItem(PENDING_KEY);
    else globalThis.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
  } catch { /* Speicher voll oder gesperrt */ }
}

function setPending(id: string, p: PendingRun | null): void {
  const all = readPending();
  if (p) all[id] = p;
  else delete all[id];
  writePending(all);
}

/** Ids mit wartender Abgabe (für Hinweise in der Liste) */
export function pendingRaceIds(): string[] { return Object.keys(readPending()); }

/** Lauf, der gerade in dieser Seite gespielt wird – flushRacePending lässt ihn in Ruhe, bis er beendet ist. */
let liveId: string | null = null;
let flushing: Promise<Map<string, RaceFinish>> | null = null;

/** Endgültige Fehler: die Abgabe ist hinfällig (Lauf fehlt, Rennen weg, ungültig) – nicht erneut senden. */
const FINAL = new Set(['invalid', 'not_found', 'not_member', 'no_run', 'not_started', 'unavailable']);

/**
 * Alle wartenden Abgaben senden. Nicht beendete Läufe anderer Seiten gelten als abgebrochen (leere Abgabe).
 * Liefert die Ergebnisse je Rennen; ohne Anmeldung oder Netz bleibt alles liegen (`unauthorized` und Netzfehler sind nicht endgültig).
 */
export function flushRacePending(): Promise<Map<string, RaceFinish>> {
  flushing ??= (async (): Promise<Map<string, RaceFinish>> => {
    const out = new Map<string, RaceFinish>();
    for (const [id, p] of Object.entries(readPending())) {
      if (id === liveId && !p.closed) continue;
      try {
        const r = await challengeRequest<RaceFinish>('POST', `/race/${encodeURIComponent(id)}/finish`, { answers: p.closed ? p.answers : [] });
        setPending(id, null);
        out.set(id, r);
      } catch (e) {
        if (FINAL.has(challengeErrorCode(e))) setPending(id, null);
      }
    }
    return out;
  })().finally(() => { flushing = null; });
  return flushing;
}

let watching = false;
/** Wartende Abgaben senden, sobald das Netz zurück ist oder man sich anmeldet. */
export function watchRacePending(win: Pick<EventTarget, 'addEventListener'> | undefined = globalThis.window): void {
  if (watching || !win) return;
  watching = true;
  win.addEventListener('online', () => { void flushRacePending(); });
  onAccountChange((st) => { if (st.status === 'signed-in') void flushRacePending(); });
}
