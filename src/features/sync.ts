// Sync-Besitzer: einzige Stelle, die SyncEngine + SyncManager hält (docs/PLAN-data.md §4).
import type { RemoteSyncProvider, SyncStatus } from 'offline-sync';
import { SyncEngine, SyncManager, browserSyncEnv } from '../vendor/storage.ts';
import { APP_SYNC_SCHEMA } from '../data/sync-schema.ts';
import {
  emitDataChange, getAttempts, getProfile, getRepository, getSessions, getSettings, getSyncState, onChange, resetAll, updateProfile,
} from '../data/storage.ts';
import { createSyncProvider, getAccountState, logout, onAccountChange } from './account.ts';
import type { AccountState } from './account.ts';
import { applyTheme } from '../ui/theme.ts';
import { detectLang, getLang, setLang, t } from '../i18n/index.ts';

export type LinkDecision = 'first' | 'same' | 'other';
export interface StatusEntry { key: `account.${string}`; params?: Record<string, string | number> }

const SCHEMA_TARGETS: ReadonlySet<string> = new Set([
  ...APP_SYNC_SCHEMA.collections.map((c) => c.name),
  ...APP_SYNC_SCHEMA.docs.map((d) => d.name),
]);

/** Nur Ziele aus dem Sync-Schema lösen einen Sync aus (nicht z. B. `profile`). */
export function isSchemaTarget(target: string): boolean { return SCHEMA_TARGETS.has(target); }

/** Kontoschutz: erste Verknüpfung, dasselbe Konto oder ein fremdes Konto. */
export function decideLink(profileCloudUserId: string | null, userId: string): LinkDecision {
  if (profileCloudUserId === null || profileCloudUserId === '') return 'first';
  return profileCloudUserId === userId ? 'same' : 'other';
}

/**
 * Statuszeilen für die UI: erster Eintrag = Hauptstatus, danach optional 'pending' und 'rejected'.
 * Schlüssel liegen im Namespace `account` (t('account.sync.…')) – hier mit Präfix `account.sync.`.
 */
export function syncStatusEntries(s: SyncStatus, now: number = Date.now()): StatusEntry[] {
  const out: StatusEntry[] = [];
  if (s.phase === 'syncing') out.push({ key: 'account.sync.syncing' });
  else if (s.phase === 'offline') out.push({ key: 'account.sync.offline' });
  else if (s.phase === 'error') out.push({ key: s.lastError === 'auth' ? 'account.sync.authError' : 'account.sync.failed' });
  else if (s.lastSyncAt === null) out.push({ key: 'account.sync.notYet' });
  else {
    const min = Math.floor(Math.max(0, now - s.lastSyncAt) / 60000);
    out.push(min < 1 ? { key: 'account.sync.syncedJustNow' } : { key: 'account.sync.syncedAgo', params: { min } });
  }
  if (s.pending > 0) out.push({ key: 'account.sync.pending', params: { n: s.pending } });
  if (s.rejected > 0) out.push({ key: 'account.sync.rejected', params: { n: s.rejected } });
  return out;
}

/** Hauptstatus als einzelner Eintrag (erster von syncStatusEntries). */
export function syncStatusKey(s: SyncStatus, now: number = Date.now()): StatusEntry {
  return syncStatusEntries(s, now)[0] as StatusEntry;
}

const DISABLED: SyncStatus = { phase: 'disabled', lastSyncAt: null, lastError: null, pending: 0, pushed: 0, pulled: 0, rejected: 0 };
let engine: SyncEngine | null = null;
let manager: SyncManager | null = null;
let status: SyncStatus = DISABLED;
let linkGen = 0;
const listeners = new Set<(s: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus { return manager ? manager.getStatus() : status; }

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export async function syncNow(): Promise<SyncStatus> {
  return manager ? manager.syncNow() : DISABLED;
}

/** Löscht alle Cloud-Daten des Kontos; wirft bei Fehler (auch wenn der Sync gerade nicht aktiv ist). */
export async function wipeCloudData(): Promise<void> {
  if (!engine || !manager || manager.getStatus().phase === 'disabled') throw new Error('sync disabled');
  await engine.wipeRemote();
}

function hasLocalData(): boolean { return getAttempts().length > 0 || getSessions().length > 0; }

/** Noch nicht hochgeladene Änderungen (nur Sync-Ziele); steht ein Vollabgleich aus, zählen alle lokalen Datensätze. */
export function unsyncedCount(): number {
  const st = getSyncState();
  const n = st.pending.filter((c) => isSchemaTarget(c.target)).length;
  return st.fullPushNeeded ? Math.max(n, getAttempts().length + getSessions().length, 1) : n;
}

export interface ForgetDeviceOptions {
  /** Zweite Nachfrage: `pending` Änderungen sind nicht in der Cloud und gingen verloren. true = trotzdem entfernen. */
  confirmLoss(pending: number): Promise<boolean>;
  /** Nur für Tests ersetzbar */
  online?: () => boolean;
  sync?: () => Promise<unknown>;
  signOut?: () => Promise<void>;
}

/**
 * Abmelden und alle Trainingsdaten von diesem Gerät entfernen (A5). Ausstehende Änderungen werden – wenn online –
 * erst synchronisiert; was danach noch fehlt, geht nur nach `confirmLoss` verloren. false = abgebrochen, nichts
 * geändert. Scheitert das Abmelden, wird der Fehler weitergereicht und lokal bleibt alles.
 */
export async function logoutAndForgetDevice(o: ForgetDeviceOptions): Promise<boolean> {
  const online = o.online ?? ((): boolean => globalThis.navigator?.onLine !== false);
  let pending = unsyncedCount();
  if (pending > 0 && online()) {
    try { await (o.sync ?? syncNow)(); } catch { /* bleibt ausstehend */ }
    pending = unsyncedCount();
  }
  if (pending > 0 && !(await o.confirmLoss(pending))) return false;
  await (o.signOut ?? logout)(); // → 'signed-out' → applyAccount schaltet den Sync ab, bevor gelöscht wird
  resetAll();
  updateProfile({ cloudUserId: null }); // nächste Anmeldung verknüpft neu ('first')
  emitDataChange('remote'); // wie beim Remote-Wipe: Theme, Sprache und Ansicht folgen den Standardwerten
  return true;
}

/** Verknüpft das lokale Profil mit dem Konto; false = nicht aktivieren (fremdes Konto, abgemeldet). */
async function linkAccount(userId: string): Promise<boolean> {
  const decision = decideLink(getProfile().cloudUserId, userId);
  if (decision === 'same') return true;
  if (decision === 'first') {
    updateProfile({ cloudUserId: userId });
    getRepository().setAppliedWipe(Date.now()); // frühere Löschungen betreffen dieses Gerät nicht
    if (hasLocalData()) getRepository().markFullPush();
    return true;
  }
  const { confirmDialog } = await import('../ui/modal.ts'); // lazy: braucht das DOM
  const replace = await confirmDialog(t('account.sync.otherAccountText'), {
    title: t('account.sync.otherAccountTitle'), confirmLabel: t('account.sync.replaceLocal'),
    cancelLabel: t('account.logout'), danger: true,
  });
  if (!replace) {
    try { await logout(); } catch { /* Abmelden best effort */ }
    return false;
  }
  resetAll(); // frischer Cursor → vollständiger Pull
  getRepository().setAppliedWipe(Date.now());
  updateProfile({ cloudUserId: userId });
  return true;
}

async function applyAccount(st: AccountState): Promise<void> {
  if (!manager) return;
  const gen = ++linkGen;
  if (st.status !== 'signed-in') { manager.disable(); return; } // auch 'offline' (A1): Sync aus bis zur Wiederherstellung
  try {
    if (!(await linkAccount(st.user.id))) { if (gen === linkGen) manager.disable(); return; }
    const provider: RemoteSyncProvider | null = await createSyncProvider();
    if (gen !== linkGen || !provider) return; // inzwischen abgemeldet/gewechselt
    manager.enable(provider);
    try { void navigator.storage?.persist?.(); } catch { /* optional */ }
  } catch {
    if (gen === linkGen) manager.disable(); // Modul nicht ladbar (offline): beim nächsten Kontowechsel neu
  }
}

let rerenderTimer: ReturnType<typeof setTimeout> | null = null;
const RUNNING = ['#/train', '#/parallel', '#/chain', '#/custom'];
/** Erneute Prüfung, solange eine Runde läuft oder ein Sheet/Dialog offen ist (ms). */
const RETRY_MS = 500;

/** Nach fremden Änderungen (Pull, Löschung von einem anderen Gerät, anderer Tab) übernehmen und neu zeichnen. */
function scheduleRerender(): void {
  if (rerenderTimer !== null) clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    void applyRemoteChange(true);
  }, 300);
}

/**
 * Theme sofort übernehmen; Sprache und Neuzeichnen (Scroll-Position bleibt) erst, wenn keine Runde läuft und kein
 * Sheet/Dialog offen ist – sonst gingen Runde bzw. Eingaben verloren. Nach einer Runde hat der Routenwechsel die
 * Seite schon mit frischen Daten gezeichnet (`redraw` = false); dann fehlt höchstens noch die Sprache.
 */
async function applyRemoteChange(redraw: boolean): Promise<void> {
  const settings = getSettings();
  applyTheme(settings.theme);
  // lazy: brauchen das DOM bzw. ziehen alle Views mit
  const [{ isSheetOpen }, { isModalOpen }, { rerender }] = await Promise.all([
    import('../ui/sheet.ts'), import('../ui/modal.ts'), import('../router.ts'),
  ]);
  const running = RUNNING.some((p) => location.hash.startsWith(p));
  if (running || isSheetOpen() || isModalOpen()) {
    // Eine neuere Änderung hat schon einen eigenen Lauf geplant
    if (rerenderTimer === null) {
      rerenderTimer = setTimeout(() => {
        rerenderTimer = null;
        void applyRemoteChange(redraw && !running);
      }, RETRY_MS);
    }
    return;
  }
  const lang = detectLang(getSettings().lang);
  if (lang !== getLang()) setLang(lang); // onLangChange zeichnet ohnehin neu (kein zweites rerender)
  else if (redraw) rerender({ keepScroll: true });
}

/** Startet Engine + Manager (idempotent). Nach `await initStorage()` aufrufen. */
export function startSync(): void {
  if (manager) return;
  const repo = getRepository();
  engine = new SyncEngine(repo, {
    schema: APP_SYNC_SCHEMA,
    deviceId: () => getRepository().deviceId,
    onRemoteWipe: () => {
      resetAll();
      emitDataChange('remote'); // → scheduleRerender: Theme und Sprache fallen auf die Standardwerte zurück
      void import('../ui/toast.ts').then((m) => m.toast(t('account.sync.remoteWiped'))); // lazy: braucht das DOM
    },
  });
  manager = new SyncManager(engine, {
    env: browserSyncEnv(),
    subscribeWrites: (cb) => getRepository().onTrackedChange((target) => { if (isSchemaTarget(target)) cb(); }),
  });
  let prev: SyncStatus = manager.getStatus();
  manager.onStatus((s) => {
    status = s;
    const finished = prev.phase === 'syncing' && s.phase !== 'syncing';
    prev = s;
    for (const cb of [...listeners]) cb(s);
    if (finished && s.pulled > 0) emitDataChange('remote');
  });
  onChange((source) => { if (source === 'remote' || source === 'external') scheduleRerender(); });
  onAccountChange((st) => { void applyAccount(st); });
  void applyAccount(getAccountState());
}
