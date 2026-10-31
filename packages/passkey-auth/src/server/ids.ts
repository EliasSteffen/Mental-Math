// UUID-Hilfen (16 Byte <-> kanonische Schreibweise).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID_RE.test(x);

export function uuidToBytes(uuid: string): Uint8Array<ArrayBuffer> {
  if (!isUuid(uuid)) throw new TypeError('invalid uuid');
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(new ArrayBuffer(16));
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToUuid(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new TypeError('uuid needs 16 bytes');
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
