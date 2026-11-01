// Update-Hinweis der iOS-App ohne DOM (testbar): wann im App Store nach einer neuen Version gefragt und wann darauf
// hingewiesen wird. features/app-store.ts verdrahtet ihn mit Start, resume, Toast und Router. Die Website meldet neue
// Versionen über den Service Worker (pwa-update.ts).
import { compareVersions } from '../releases.ts';
import { isRoundRunning } from './pwa-update.ts';

const HOUR_MS = 3_600_000;
/** Höchstens eine Store-Abfrage je Zeitraum (ms). */
export const STORE_CHECK_INTERVAL_MS = 24 * HOUR_MS;
/** Dieselbe Version frühestens nach dieser Pause erneut melden (ms). */
export const RENOTIFY_MS = 72 * HOUR_MS;

const VERSION_RE = /^\d+(?:\.\d+){0,2}$/;

/** Store fragen: noch nie oder vor ≥ 24 h (zurückgestellte Uhr zählt auch als fällig). */
export function shouldCheck(now: number, lastCheck: number): boolean {
  return !(lastCheck > 0) || now < lastCheck || now - lastCheck >= STORE_CHECK_INTERVAL_MS;
}

/** Ist die Store-Version neuer als die laufende? Ungültige Angaben: nein. */
export function isNewer(store: string, current: string): boolean {
  return VERSION_RE.test(store) && VERSION_RE.test(current) && compareVersions(store, current) > 0;
}

export interface NotifyInput { store: string; current: string; notifiedVersion: string; notifiedAt: number; now: number }

/** Hinweis zeigen: Store-Version neuer und (andere Version als zuletzt gemeldet oder ≥ 72 h seit dieser Meldung). */
export function shouldNotify(s: NotifyInput): boolean {
  if (!isNewer(s.store, s.current)) return false;
  return s.store !== s.notifiedVersion || s.now < s.notifiedAt || s.now - s.notifiedAt >= RENOTIFY_MS;
}

/** Version aus der Antwort von itunes.apple.com/lookup (Objekt oder JSON-Text, Content-Type text/javascript); sonst null. */
export function storeVersionOf(data: unknown): string | null {
  let d = data;
  if (typeof d === 'string') {
    try { d = JSON.parse(d) as unknown; } catch { return null; }
  }
  const results = (d as { results?: unknown } | null | undefined)?.results;
  if (!Array.isArray(results)) return null;
  const v = (results[0] as { version?: unknown } | null | undefined)?.version;
  return typeof v === 'string' && VERSION_RE.test(v.trim()) ? v.trim() : null;
}

/** Geräte-lokaler Stand (Einstellungen). */
export interface StoreUpdateState { lastStoreCheck: number; updateNotifiedVersion: string; updateNotifiedAt: number }

export interface StoreUpdateDeps {
  now(): number;
  hash(): string;
  /** laufende Version (BUILD_INFO.version) */
  current: string;
  load(): StoreUpdateState;
  save(p: Partial<StoreUpdateState>): void;
  /** Version im App Store oder null; wirft nie. */
  fetchVersion(): Promise<string | null>;
  /** Hinweis mit Aktion „Aktualisieren“ zeigen; liefert die Funktion zum Schließen. */
  showHint(onUpdate: () => void): () => void;
  openStore(): void;
}

export interface StoreUpdateFlow {
  /** App-Start bzw. resume: gedrosselt im Store nachfragen. */
  check(): Promise<void>;
  /** Hash hat sich geändert. */
  routeChanged(): void;
}

/** Nie während einer Runde: die Abfrage wird danach nachgeholt, ein offener Hinweis bis dahin ausgeblendet. */
export function createStoreUpdateFlow(deps: StoreUpdateDeps): StoreUpdateFlow {
  let deferred = false; // Abfrage fiel in eine Runde
  let found: string | null = null; // neue Version, noch nicht geprüft, ob sie gemeldet wird
  let pending = false; // Hinweis gilt (sichtbar oder für eine Runde ausgeblendet), bis „Aktualisieren“ gewählt wird
  let close: (() => void) | null = null;

  const busy = (): boolean => isRoundRunning(deps.hash());
  const onUpdate = (): void => {
    pending = false;
    close = null;
    deps.openStore();
  };
  const render = (): void => {
    if (busy()) {
      if (close) { close(); close = null; }
      return;
    }
    if (found !== null) {
      const store = found;
      found = null;
      const s = deps.load();
      const now = deps.now();
      if (!pending && shouldNotify({ store, current: deps.current, notifiedVersion: s.updateNotifiedVersion, notifiedAt: s.updateNotifiedAt, now })) {
        deps.save({ updateNotifiedVersion: store, updateNotifiedAt: now });
        pending = true;
      }
    }
    if (pending && !close) close = deps.showHint(onUpdate);
  };
  const check = async (): Promise<void> => {
    if (busy()) { deferred = true; return; }
    const now = deps.now();
    if (!shouldCheck(now, deps.load().lastStoreCheck)) return;
    deps.save({ lastStoreCheck: now }); // vor der Abfrage: Start und resume fragen nicht doppelt
    const store = await deps.fetchVersion();
    if (store === null) return;
    found = store;
    render();
  };

  return {
    check,
    routeChanged() {
      if (deferred && !busy()) {
        deferred = false;
        void check();
      }
      render();
    },
  };
}
