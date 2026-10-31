// Generische Merge-Bausteine für Dokumente. Reine Funktionen, tolerant gegen kaputte Eingaben (→ {}).
import type { MergeContext, SyncMeta } from './types.ts';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);
const obj = (x: unknown): Obj => (isObj(x) ? x : {});
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const keysOf = (a: Obj, b: Obj): string[] => [...new Set([...Object.keys(a), ...Object.keys(b)])];

/** Schlüsselreihenfolge-unabhängiger Tiefenvergleich. */
export function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => stableEqual(x, b[i]));
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && stableEqual(a[k], b[k]));
  }
  return false;
}

/** Ordnung nach (updatedAt, rev, deviceId). */
export function compareMeta(a: SyncMeta, b: SyncMeta): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
  if (a.rev !== b.rev) return a.rev < b.rev ? -1 : 1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

/** Pro Schlüssel das Maximum (nur Zahlenwerte; Nicht-Zahlen entfallen). */
export function maxByKey(l: unknown, r: unknown): Record<string, number> {
  const a = obj(l);
  const b = obj(r);
  const out: Record<string, number> = {};
  for (const k of keysOf(a, b)) {
    const x = num(a[k]);
    const y = num(b[k]);
    if (x !== null && y !== null) out[k] = Math.max(x, y);
    else if (x !== null) out[k] = x;
    else if (y !== null) out[k] = y;
  }
  return out;
}

/** Pro Schlüssel gewinnt das Objekt mit größerem Zahlenfeld `field`; bei Gleichstand bleibt `l`. */
export function lwwByKey(l: unknown, r: unknown, field: string): Record<string, unknown> {
  const a = obj(l);
  const b = obj(r);
  const out: Record<string, unknown> = {};
  for (const k of keysOf(a, b)) {
    const x = a[k];
    const y = b[k];
    if (!isObj(y)) { if (isObj(x)) out[k] = x; continue; }
    if (!isObj(x)) { out[k] = y; continue; }
    out[k] = (num(y[field]) ?? 0) > (num(x[field]) ?? 0) ? y : x;
  }
  return out;
}

/** Ganzes Dokument: Remote gewinnt nur, wenn es echt neuer ist als das lokale (Gleichstand → lokal). */
export function lwwDoc(l: unknown, r: unknown, ctx: MergeContext): Record<string, unknown> {
  return ctx.remoteUpdatedAt > (ctx.localUpdatedAt ?? -Infinity) ? { ...obj(r) } : { ...obj(l) };
}

/** Die genannten Schlüssel aus `local` ins Ergebnis übernehmen; fehlen sie lokal, werden sie auch im Ergebnis entfernt. */
export function keepKeys(merged: unknown, local: unknown, keys: readonly string[]): Record<string, unknown> {
  const out: Obj = { ...obj(merged) };
  const loc = obj(local);
  for (const k of keys) {
    if (Object.hasOwn(loc, k)) out[k] = loc[k];
    else delete out[k];
  }
  return out;
}

/** Summe pro Schlüssel über mehrere Maps (nur Zahlenwerte). */
export function sumByKey(...maps: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(obj(m))) {
      const n = num(v);
      if (n !== null) out[k] = (out[k] ?? 0) + n;
    }
  }
  return out;
}
