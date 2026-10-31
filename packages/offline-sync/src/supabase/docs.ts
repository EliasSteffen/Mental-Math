// Zeilen-Mapping der Dokument-Tabelle (user_id, name, data, updated_at, device_id).
import type { RemoteDoc } from '../types.ts';

export interface DocRow { user_id: string; name: string; data: Record<string, unknown>; updated_at: number; device_id: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function docToRow(d: RemoteDoc, userId: string): DocRow {
  return { user_id: userId, name: d.name, data: d.data, updated_at: d.updatedAt, device_id: d.deviceId };
}

/** Zeile → Dokument; null bei fehlerhafter Zeile. bigint kann als Zahl oder numerischer String kommen. */
export function rowToDoc(row: unknown): RemoteDoc | null {
  if (!isObj(row)) return null;
  const { name, device_id: deviceId, data } = row;
  const raw = row.updated_at;
  const updatedAt = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (typeof name !== 'string' || name === '' || typeof deviceId !== 'string' || !Number.isFinite(updatedAt) || !isObj(data)) return null;
  return { name, data, updatedAt, deviceId };
}
