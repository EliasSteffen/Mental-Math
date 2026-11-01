// Fachregeln der Cloud-Synchronisierung (docs/PLAN-data.md §0, Merge-Tabelle) als SyncSchema für das Paket offline-sync.
// Reine Funktionen, tolerant gegen kaputte Eingaben. `profile` ist bewusst nicht enthalten (wird nie hochgeladen).
import type { MergeContext, SyncSchema } from 'offline-sync';
import { keepKeys, lwwByKey, lwwDoc, maxByKey } from '../vendor/storage.ts';

/** Einstellungen, die pro Gerät gelten und nie hochgeladen bzw. überschrieben werden. */
export const DEVICE_LOCAL_SETTINGS: readonly string[] = [
  'keypad', 'lastSeenVersion',
  'lastStoreCheck', 'updateNotifiedVersion', 'updateNotifiedAt', 'reviewAskedVersion', 'reviewAskedAt',
  'onboardingDone',
];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const obj = (x: unknown): Obj => (isObj(x) ? x : {});
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function stripDeviceLocal(settings: unknown): Record<string, unknown> {
  const out: Obj = { ...obj(settings) };
  for (const k of DEVICE_LOCAL_SETTINGS) delete out[k];
  return out;
}

/** LWW über das Feld `updatedAt`; Geräte-lokale Schlüssel bleiben lokal; `updatedAt` stammt vom Gewinner. */
function mergeSettings(local: Obj, remote: Obj): Obj {
  const lt = num(local.updatedAt) ?? 0;
  const rt = num(remote.updatedAt) ?? 0;
  const ctx: MergeContext = { localUpdatedAt: lt, remoteUpdatedAt: rt };
  const winner = lwwDoc(local, remote, ctx);
  const out = keepKeys(winner, local, DEVICE_LOCAL_SETTINGS);
  const wt = num(winner.updatedAt);
  if (wt !== null) out.updatedAt = wt;
  return out;
}

/** Pro Datum gewinnt der Eintrag mit mehr Punkten, bei Gleichstand der frühere `ts`. */
function mergeDaily(local: Obj, remote: Obj): Obj {
  const out: Obj = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k];
    const r = remote[k];
    if (!isObj(r)) { if (isObj(l)) out[k] = l; continue; }
    if (!isObj(l)) { out[k] = r; continue; }
    const lp = num(l.points) ?? 0;
    const rp = num(r.points) ?? 0;
    if (rp !== lp) out[k] = rp > lp ? r : l;
    else out[k] = (num(r.ts) ?? Infinity) < (num(l.ts) ?? Infinity) ? r : l; // früherer ts gewinnt
  }
  return out;
}

/** Bestwerte nach Maximum; `nextStart` ist pro Gerät adaptiv und bleibt lokal. */
function mergeParallel(local: Obj, remote: Obj): Obj {
  const out: Obj = {};
  for (const k of ['bestChains', 'bestCorrectStreak', 'rounds']) {
    out[k] = Math.max(num(local[k]) ?? 0, num(remote[k]) ?? 0);
  }
  out.nextStart = local.nextStart ?? 2;
  return out;
}

export const APP_SYNC_SCHEMA: SyncSchema = {
  collections: [
    { name: 'results', limit: 5000 },
    { name: 'sessions', limit: 500 },
  ],
  docs: [
    {
      name: 'settings',
      merge: (l, r) => mergeSettings(obj(l), obj(r)),
      toRemote: (l) => stripDeviceLocal(l),
      updatedAt: (l) => num(obj(l).updatedAt),
    },
    { name: 'reviews', merge: (l, r) => lwwByKey(l, r, 'lastTs') },
    { name: 'dailyResults', merge: (l, r) => mergeDaily(obj(l), obj(r)) },
    { name: 'chainBest', merge: (l, r) => maxByKey(l, r) },
    { name: 'parallel', merge: (l, r) => mergeParallel(obj(l), obj(r)) },
    { name: 'activity', merge: (l, r) => maxByKey(l, r), perDevice: true },
  ],
};
