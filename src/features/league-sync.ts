// Liga-Wertung melden und Champion-Status holen (v9 K). Nie blockierend: alles läuft im Hintergrund, Fehler sind still.
// Hoch geladen wird nur mit Konto, nur bei geänderter Wertung und höchstens alle 10 Minuten. Der Champion-Status
// (Platz, Anzahl, „nicht verfügbar“) liegt zwischengespeichert in localStorage und gilt nur für Meister (Stufe 15).
import { CHAMPION_DEFAULT, MASTER_TIER, leagueRating, tierIndex } from '../core/league.ts';
import type { ChampionInfo } from '../core/league.ts';
import { getAttempts } from '../data/storage.ts';
import { getAccountState, onAccountChange } from './account.ts';
import { challengeErrorCode, challengeRequest, rankedAvailable } from './challenge.ts';

export const UPLOAD_INTERVAL_MS = 10 * 60_000;
/** Champion-Status höchstens so oft erneut holen (Start, Wettkampf-Seite holen selbst frisch) */
export const STATUS_MAX_AGE_MS = 10 * 60_000;
const KEY = 'mm:v9:league.sync';

export interface ChampionEntry { rank: number; name: string; rating: number; me: boolean }
export interface ChampionBoard {
  count: number;
  total: number;
  champions: ChampionEntry[];
  me: { rank: number | null; rating: number; champion: boolean } | null;
}

interface Saved {
  /** Konto, zu dem der Stand gehört (anderes Konto → verwerfen) */
  user: string;
  /** zuletzt hochgeladene Wertung */
  rating: number | null;
  uploadedAt: number;
  /** Platz, wenn Champion (sonst null) */
  champion: { rank: number } | null;
  /** Anzahl der Champions laut Server */
  count: number;
  checkedAt: number;
  /** Server ohne Liga-SQL: Champion ausblenden */
  unavailable: boolean;
}

const EMPTY = (user: string): Saved => ({ user, rating: null, uploadedAt: 0, champion: null, count: CHAMPION_DEFAULT, checkedAt: 0, unavailable: false });

function read(): Saved | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    if (!v || typeof v.user !== 'string') return null;
    return {
      ...EMPTY(v.user),
      rating: typeof v.rating === 'number' ? v.rating : null,
      uploadedAt: typeof v.uploadedAt === 'number' ? v.uploadedAt : 0,
      champion: v.champion && typeof v.champion.rank === 'number' ? { rank: v.champion.rank } : null,
      count: typeof v.count === 'number' && v.count >= 1 ? v.count : CHAMPION_DEFAULT,
      checkedAt: typeof v.checkedAt === 'number' ? v.checkedAt : 0,
      unavailable: v.unavailable === true,
    };
  } catch {
    return null;
  }
}

function write(s: Saved | null): void {
  try {
    if (s) globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
    else globalThis.localStorage?.removeItem(KEY);
  } catch { /* Speicher gesperrt: dann eben ohne Zwischenspeicher */ }
}

function userId(): string | null {
  const st = getAccountState();
  return st.status === 'signed-in' ? st.user.id : null;
}

/** Gespeicherter Stand des angemeldeten Kontos (ein anderes Konto zählt nicht). */
function mine(): Saved | null {
  const id = userId();
  const s = read();
  return id && s && s.user === id ? s : null;
}

const listeners = new Set<() => void>();
/** Meldet, wenn sich der Champion-Status geändert hat (z. B. zum Neuzeichnen einer Seite). */
export function onChampionChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function save(update: (s: Saved) => Saved): void {
  const id = userId();
  if (!id) return;
  const before = mine() ?? EMPTY(id);
  const next = update(before);
  write(next);
  const changed = before.champion?.rank !== next.champion?.rank || before.unavailable !== next.unavailable || before.count !== next.count;
  if (changed) for (const cb of [...listeners]) cb();
}

/* ---------- Anzeige (synchron, aus dem Zwischenspeicher) ---------- */

/** Champion-Status für die Liga-Anzeige; null = kein Konto, nicht Champion oder unbekannt. */
export function championInfo(): ChampionInfo | null {
  const s = mine();
  return s && !s.unavailable && s.champion ? { rank: s.champion.rank } : null;
}

/** Wie viele Champions es gibt (Server-Konfiguration, sonst Standard). */
export function championCount(): number {
  return mine()?.count ?? CHAMPION_DEFAULT;
}

/** false, sobald der Server meldet, dass es Champion nicht gibt (SQL fehlt): dann alles Champion-Bezogene ausblenden. */
export function championAvailable(): boolean {
  return !mine()?.unavailable;
}

/* ---------- Netz ---------- */

/** Aktuelle Wertung aus der Historie (kann ohne Netz berechnet werden). */
export function currentRating(): number {
  return ratingSource();
}
let ratingSource = (): number => leagueRating(getAttempts());
/** Nur für Tests: Wertung vorgeben (statt aus der Historie) */
export function _setRatingSourceForTests(fn: (() => number) | null): void {
  ratingSource = fn ?? ((): number => leagueRating(getAttempts()));
}

function applyBoard(b: ChampionBoard, rating: number): void {
  save((s) => ({
    ...s, unavailable: false, count: b.count, checkedAt: Date.now(),
    // Champion zeigt nur, wer lokal auch Meister ist; sonst gilt die Meldung des Servers nicht für die Anzeige
    champion: b.me?.champion && b.me.rank !== null && tierIndex(rating) === MASTER_TIER ? { rank: b.me.rank } : null,
  }));
}

/**
 * Top-Liste der Champions laden (frisch, aktualisiert nebenbei den eigenen Status). Wirft ChallengeError;
 * Code 'unavailable' heißt: Server ohne Liga-SQL (Champion ausblenden).
 */
export async function loadChampions(): Promise<ChampionBoard> {
  try {
    const b = await challengeRequest<ChampionBoard>('GET', '/league/champions', undefined, { auth: userId() !== null });
    if (userId()) applyBoard(b, currentRating());
    return b;
  } catch (e) {
    if (challengeErrorCode(e) === 'unavailable') save((s) => ({ ...s, unavailable: true, champion: null, checkedAt: Date.now() }));
    throw e;
  }
}

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wertung hochladen (gedrosselt, nur bei Änderung) und, wenn nötig, den Champion-Status auffrischen.
 * Nie blockierend und nie werfend. `force` überspringt Drosselung und Änderungsprüfung (nicht die Anmeldung).
 */
export function syncLeague(force = false): Promise<void> {
  running ??= run(force).catch(() => { /* still */ }).finally(() => { running = null; });
  return running;
}

async function run(force: boolean): Promise<void> {
  if (!rankedAvailable()) return;
  const saved = mine();
  if (saved?.unavailable && !force && Date.now() - saved.checkedAt < 6 * 3_600_000) return; // Server kann es nicht; selten neu prüfen
  const rating = currentRating();
  const now = Date.now();
  const changed = !saved || saved.rating !== rating;
  if (changed) {
    const wait = saved ? saved.uploadedAt + UPLOAD_INTERVAL_MS - now : 0;
    if (!force && wait > 0) { schedule(wait); return; }
    try {
      const r = await challengeRequest<{ rating?: unknown }>('POST', '/league', { rating, tier: tierIndex(rating) });
      // Hat der Server gekürzt (Tageszuwachs), gilt seine Wertung: später wird erneut gemeldet
      save((s) => ({ ...s, rating: typeof r.rating === 'number' ? r.rating : rating, uploadedAt: now, unavailable: false }));
    } catch (e) {
      if (challengeErrorCode(e) === 'unavailable') save((s) => ({ ...s, unavailable: true, champion: null, checkedAt: now }));
      return;
    }
  }
  // Status nur für Meister (und wer bisher Champion war) – sonst gibt es nichts anzuzeigen
  const after = mine();
  const relevant = tierIndex(rating) === MASTER_TIER || Boolean(after?.champion);
  if (relevant && (force || changed || !after || now - after.checkedAt >= STATUS_MAX_AGE_MS)) {
    try { await loadChampions(); } catch { /* still */ }
  }
}

function schedule(ms: number): void {
  if (timer) return;
  timer = setTimeout(() => { timer = null; void syncLeague(); }, Math.min(ms, UPLOAD_INTERVAL_MS) + 1000);
}

/** Nach jeder Runde (aus updateProgressRewards) – gedrosselt. */
export function scheduleLeagueSync(): void {
  void syncLeague();
}

let started = false;
/** Beim Start: mit Konto melden, nach der Anmeldung erneut; beim Abmelden den Zwischenspeicher leeren. */
export function startLeagueSync(win: Pick<EventTarget, 'addEventListener'> | undefined = globalThis.window): void {
  if (started) return;
  started = true;
  void syncLeague();
  onAccountChange((st) => {
    if (st.status === 'signed-in') void syncLeague();
    else if (st.status === 'signed-out') write(null);
  });
  win?.addEventListener('online', () => { void syncLeague(); });
}

/** Nur für Tests */
export function _resetLeagueSync(): void {
  started = false;
  running = null;
  if (timer) clearTimeout(timer);
  timer = null;
  write(null);
}
