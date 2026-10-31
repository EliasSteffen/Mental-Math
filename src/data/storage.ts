// Öffentliche Storage-API (unverändert) über dem v3-Repository (`mm:v3:*`, SyncMeta, Änderungsprotokoll).
// Alles synchron (localStorage). Ein späterer async/IndexedDB-Adapter läuft hinter demselben Repository.
import type {
  Activity, Attempt, DailyResult, GameResult, IGameRepository, Level, ParallelStats, Reviews, Session, SessionStats, Settings, State,
  SyncState, UserProfile,
} from '../types.ts';
import type { PersistentAdapter, StorageAdapter } from '../types.ts';
import type { IdbOptions } from 'offline-sync';
import { Repository, sumByKey } from '../vendor/storage.ts';
import { createLegacyStore, getDefaultAdapter, initStorageAdapter, setDefaultAdapter, V3_PREFIX } from './adapters.ts';
import { LEGACY_BACKUP_KEY, LEGACY_KEY, migrateV1 } from './migrate.ts';
import { createMeta, touch } from './meta.ts';
import { DEFAULT_PARALLEL_STATS, DEFAULT_SETTINGS, isObj, normalize, normalizeParallel } from './schema.ts';

export { DEFAULT_PARALLEL_STATS, DEFAULT_SETTINGS, normalize };

const MAX_ATTEMPTS = 5000;
const MAX_SESSIONS = 500;
const MAX_ACTIVITY_DAYS = 400;
const KEEP_ON_RESET = ['deviceId', 'doc:profile'];

let repo = new Repository(getDefaultAdapter());
let initPromise: Promise<void> | null = null;
const legacy = createLegacyStore();
let ready = false;

// ---------- Änderungsmeldungen ----------
export type ChangeSource = 'local' | 'remote' | 'external';
const listeners = new Set<(source: ChangeSource) => void>();
let unbindRepo: () => void = () => {};

/** Meldet eine Datenänderung an alle `onChange`-Hörer (z. B. 'remote' nach einem Pull). */
export function emitDataChange(source: ChangeSource): void {
  for (const cb of [...listeners]) {
    try {
      cb(source);
    } catch {
      /* ein Hörer darf die anderen nicht blockieren */
    }
  }
}

/** Hängt die lokale Änderungsmeldung ans aktuelle Repository (bei Austausch neu aufrufen). */
function bindRepo(): void {
  unbindRepo();
  unbindRepo = repo.onTrackedChange(() => emitDataChange('local'));
}
bindRepo();

/** Registriert einen Hörer für Datenänderungen; Rückgabe: Abmelden. */
export function onChange(cb: (source: ChangeSource) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Repository; führt beim ersten Zugriff (und nach Invalidierung) die Migration von `kopfrechner.v1` aus. */
function r(): Repository {
  if (!ready) {
    ready = true;
    try {
      migrateV1(repo, legacy);
    } catch {
      /* Migration darf die App nie blockieren */
    }
  }
  return repo;
}

// ---------- abgeleitete Sichten (pro Revision gecacht, stabile Objektidentität zwischen Schreibzugriffen) ----------
const views = new Map<string, { rev: number; v: unknown }>();
function view<T>(key: string, build: () => T): T {
  const rp = r();
  const hit = views.get(key);
  if (hit && hit.rev === rp.revision) return hit.v as T;
  const v = build();
  views.set(key, { rev: rp.revision, v });
  return v;
}

if (typeof globalThis.addEventListener === 'function') {
  // Änderungen aus anderen Tabs: Cache verwerfen
  globalThis.addEventListener('storage', (e: Event) => {
    const key = (e as StorageEvent).key;
    if (key === null || key === undefined || key.startsWith(V3_PREFIX) || key === LEGACY_KEY) {
      invalidateCache();
      emitDataChange('external');
    }
  });
}

function isPersistent(a: StorageAdapter): a is PersistentAdapter {
  return typeof (a as Partial<PersistentAdapter>).onExternalChange === 'function';
}

/** Das lebende, migrierte Repository (für die SyncEngine). Nach `initStorage` ist es ein anderes Objekt als davor. */
export function getRepository(): Repository {
  return r();
}

/** Wählt den Adapter (IndexedDB, sonst localStorage) und baut das Repository neu auf; idempotent (gemeinsames Promise). */
export function initStorage(o?: IdbOptions): Promise<void> {
  initPromise ??= (async (): Promise<void> => {
    const a = await initStorageAdapter(o);
    setDefaultAdapter(a);
    repo = new Repository(a);
    views.clear();
    ready = false;
    bindRepo();
    if (isPersistent(a)) {
      a.onExternalChange(() => {
        invalidateCache();
        emitDataChange('external');
      });
    }
  })();
  return initPromise;
}

/** Cache verwerfen (z. B. für Tests oder nach externen Änderungen) */
export function invalidateCache(): void {
  repo.invalidate();
  views.clear();
  ready = false;
}

// ---------- Profil & Sync ----------
export function getProfile(): UserProfile {
  const rp = r();
  const p = rp.getDoc<UserProfile>('profile');
  if (p && typeof p.id === 'string' && p.schemaVersion === 3) return p;
  const created: UserProfile = { ...createMeta(Date.now(), rp.deviceId), displayName: null, cloudUserId: null, schemaVersion: 3 };
  rp.putDoc('profile', created);
  return created;
}

export function updateProfile(patch: Partial<Pick<UserProfile, 'displayName' | 'cloudUserId'>>): UserProfile {
  const next: UserProfile = { ...touch(getProfile(), Date.now(), r().deviceId), ...patch };
  r().putDoc('profile', next);
  return next;
}

export const getSyncState = (): SyncState => r().getSyncState();

// ---------- State-Sicht (Kompatibilität) ----------
/** Gesamter Stand als State v2 (abgeleitet; Schreiben über die Setter bzw. `save`). */
export function load(): State {
  return {
    version: 2,
    attempts: getAttempts(), sessions: getSessions(), settings: getSettings(), reviews: getReviews(), activity: ownActivity(),
    dailyResults: getDailyResults(), chainBest: getChainBest(), parallel: getParallelStats(),
  };
}

/** Kompletten State v2 übernehmen (ersetzt alles; Einträge ohne SyncMeta bekommen eine). */
export function save(state: State): void {
  const s = normalize(state);
  const rp = r();
  const dev = rp.deviceId;
  const now = Date.now();
  const withMeta = <T extends { ts: number }>(x: T, id?: string): T & ReturnType<typeof createMeta> => {
    const m = x as Partial<ReturnType<typeof createMeta>>;
    if (typeof m.id === 'string' && typeof m.rev === 'number' && typeof m.createdAt === 'number') return x as T & ReturnType<typeof createMeta>;
    return { ...x, ...createMeta(now, dev, id) };
  };
  setSettings(s.settings);
  setReviews(s.reviews);
  rp.putDoc('activity', s.activity);
  rp.putDoc('dailyResults', s.dailyResults);
  rp.putDoc('chainBest', s.chainBest);
  setParallelStats(s.parallel);
  rp.replaceCollection('results', s.attempts.map((a) => withMeta(a)));
  rp.replaceCollection('sessions', s.sessions.map((x) => withMeta(x, x.id)));
}

// ---------- Ergebnisse & Runden ----------
export const getAttempts = (): GameResult[] => r().list<GameResult>('results');
export const getSessions = (): SessionStats[] => r().list<SessionStats>('sessions');

export function addAttempt(attempt: Attempt): void {
  const rp = r();
  rp.upsert<GameResult>('results', { ...attempt, ...createMeta(Date.now(), rp.deviceId) });
  rp.trim('results', MAX_ATTEMPTS);
}

export function addSession(session: Session): void {
  const rp = r();
  rp.upsert<SessionStats>('sessions', { ...session, ...createMeta(Date.now(), rp.deviceId, session.id) });
  rp.trim('sessions', MAX_SESSIONS);
}

// ---------- Settings ----------
export const getSettings = (): Settings => view('settings', () => {
  const { updatedAt: _u, ...rest } = (r().getDoc<Record<string, unknown>>('settings') ?? {}) as Record<string, unknown>;
  void _u;
  return { ...DEFAULT_SETTINGS, ...(rest as Partial<Settings>) };
});

export function setSettings(partial: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...partial };
  r().putDoc('settings', { ...next, updatedAt: Date.now() });
  return getSettings();
}

// ---------- Dokumente ----------
export const getReviews = (): Reviews => view('reviews', () => {
  const d = r().getDoc<unknown>('reviews');
  return isObj(d) ? (d as Reviews) : {};
});

export function setReviews(reviews: Reviews): Reviews {
  const doc = isObj(reviews) ? reviews : {};
  r().putDoc('reviews', doc);
  return doc;
}

/** Eigene Aktivität (Dokument `activity`; wird als einziges geschrieben und hochgeladen). */
function ownActivity(): Activity {
  const d = r().getDoc<unknown>('activity');
  return isObj(d) ? (d as Activity) : {};
}

/** Sicht: eigene Aktivität + Aktivität fremder Geräte (`activityRemote`: { [deviceId]: Activity }), tolerant gegen kaputte Daten. */
export const getActivity = (): Activity => view('activity', () => {
  const remote = r().getDoc<unknown>('activityRemote');
  return sumByKey(ownActivity(), ...Object.values(isObj(remote) ? remote : {}));
});

export function addActivityMs(ms: number, ts: number = Date.now()): number {
  const act: Activity = { ...ownActivity() };
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  act[key] = (Number(act[key]) || 0) + (Number(ms) || 0);
  const keys = Object.keys(act).sort();
  if (keys.length > MAX_ACTIVITY_DAYS) for (const k of keys.slice(0, keys.length - MAX_ACTIVITY_DAYS)) delete act[k];
  r().putDoc('activity', act);
  return act[key] ?? 0;
}

// ---------- v2: Daily & Kettenrechnen ----------
export const getDailyResults = (): Record<string, DailyResult> => view('dailyResults', () => {
  const d = r().getDoc<unknown>('dailyResults');
  return isObj(d) ? (d as Record<string, DailyResult>) : {};
});

export function setDailyResult(dateKey: string, result: DailyResult): Record<string, DailyResult> {
  const next = { ...getDailyResults(), [dateKey]: result };
  r().putDoc('dailyResults', next);
  return next;
}

export const getChainBest = (): Partial<Record<Level, number>> => view('chainBest', () => {
  const d = r().getDoc<unknown>('chainBest');
  return isObj(d) ? (d as Partial<Record<Level, number>>) : {};
});

export function setChainBest(level: Level, value: number): Partial<Record<Level, number>> {
  const next = { ...getChainBest(), [level]: value };
  r().putDoc('chainBest', next);
  return next;
}

export const getParallelStats = (): ParallelStats => view('parallel', () => normalizeParallel(r().getDoc<unknown>('parallel')));

export function setParallelStats(stats: ParallelStats): ParallelStats {
  const next = normalizeParallel(stats);
  r().putDoc('parallel', next);
  return next;
}

// ---------- Reset & Export ----------
/** Löscht alle Daten inkl. Backup und Sync-Protokoll; Profil und deviceId bleiben. */
export function resetAll(): void {
  repo.clear(KEEP_ON_RESET);
  legacy.remove(LEGACY_KEY);
  legacy.remove(LEGACY_BACKUP_KEY);
  views.clear();
  ready = false;
}

/** Export v3: alle Daten inkl. Profil und SyncMeta der Ergebnisse/Runden (ohne Tombstones). */
export function exportJSON(): string {
  const s = load();
  return JSON.stringify({
    ...s, version: 3, exportedAt: Date.now(), deviceId: r().deviceId, profile: getProfile(),
  }, null, 2);
}

/** Fassade für die App (Interface in src/types.ts). */
export const gameRepository = {
  getProfile, updateProfile, getSyncState, load, save, getAttempts, getSessions, addAttempt, addSession,
  getSettings, setSettings, getReviews, setReviews, getActivity, addActivityMs, getDailyResults, setDailyResult,
  getChainBest, setChainBest, getParallelStats, setParallelStats, resetAll, exportJSON, onChange,
} satisfies IGameRepository;
