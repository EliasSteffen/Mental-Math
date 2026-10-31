// Sync-Besitzer: einzige Stelle, die SyncEngine + SyncManager hält (docs/PLAN-data.md §4).
import type { RemoteSyncProvider, SyncStatus } from 'offline-sync';
import { SyncEngine, SyncManager, browserSyncEnv } from '../vendor/storage.ts';
import { APP_SYNC_SCHEMA } from '../data/sync-schema.ts';
import { emitDataChange, getAttempts, getProfile, getRepository, getSessions, onChange, resetAll, updateProfile } from '../data/storage.ts';
import { createSyncProvider, getAccountState, logout, onAccountChange } from './account.ts';
import type { AccountState } from './account.ts';
import { t } from '../i18n/index.ts';

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

/** Verknüpft das lokale Profil mit dem Konto; false = nicht aktivieren (fremdes Konto, abgemeldet). */
async function linkAccount(userId: string): Promise<boolean> {
  const decision = decideLink(getProfile().cloudUserId, userId);
  if (decision === 'same') return true;
  if (decision === 'first') {
    updateProfile({ cloudUserId: userId });
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
  updateProfile({ cloudUserId: userId });
  return true;
}

async function applyAccount(st: AccountState): Promise<void> {
  if (!manager) return;
  const gen = ++linkGen;
  if (st.status !== 'signed-in') { manager.disable(); return; }
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

/** Nach fremden Änderungen neu rendern, aber nicht mitten im Training. */
function scheduleRerender(): void {
  if (rerenderTimer !== null) clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    if (RUNNING.some((p) => location.hash.startsWith(p))) return;
    void import('../router.ts').then((r) => r.rerender()); // lazy: Router zieht alle Views mit
  }, 300);
}

/** Startet Engine + Manager (idempotent). Nach `await initStorage()` aufrufen. */
export function startSync(): void {
  if (manager) return;
  const repo = getRepository();
  engine = new SyncEngine(repo, { schema: APP_SYNC_SCHEMA, deviceId: () => getRepository().deviceId });
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
