// Minimaler deterministischer CBOR-Encoder (nur was WebAuthn-Tests brauchen).

export type CborValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | CborValue[]
  | Map<number | string, CborValue>;

// Kopfbyte + Länge/Wert je nach Größe kodieren
function head(major: number, n: number): number[] {
  const m = major << 5;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('invalid cbor length');
  if (n < 24) return [m | n];
  if (n < 0x100) return [m | 24, n];
  if (n < 0x10000) return [m | 25, n >> 8, n & 0xff];
  if (n < 0x100000000) return [m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const hi = Math.floor(n / 0x100000000);
  const lo = n >>> 0;
  return [
    m | 27,
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff,
  ];
}

function encodeInto(value: CborValue, out: number[]): void {
  if (value === null) { out.push(0xf6); return; }
  if (typeof value === 'boolean') { out.push(value ? 0xf5 : 0xf4); return; }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError('only integers supported');
    if (value >= 0) out.push(...head(0, value));
    else out.push(...head(1, -1 - value));
    return;
  }
  if (typeof value === 'string') {
    const b = new TextEncoder().encode(value);
    out.push(...head(3, b.length));
    for (const x of b) out.push(x);
    return;
  }
  if (value instanceof Uint8Array) {
    out.push(...head(2, value.length));
    for (const x of value) out.push(x);
    return;
  }
  if (Array.isArray(value)) {
    out.push(...head(4, value.length));
    for (const v of value) encodeInto(v, out);
    return;
  }
  out.push(...head(5, value.size));
  for (const [k, v] of value) {
    encodeInto(k, out);
    encodeInto(v, out);
  }
}

export function encodeCbor(value: CborValue): Uint8Array {
  const out: number[] = [];
  encodeInto(value, out);
  return Uint8Array.from(out);
}
