// base64url ohne Padding (RFC 4648 §5), läuft in Browsern, Workers, Deno und Node.

export function toBase64Url(data: ArrayBuffer | ArrayBufferView): string {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Wirft TypeError bei ungültiger Eingabe. */
export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new TypeError('invalid base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const isBase64Url = (s: unknown): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9_-]*$/.test(s) && s.length % 4 !== 1;

export const utf8Encode = (s: string): Uint8Array<ArrayBuffer> => {
  const enc = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(enc.length));
  out.set(enc);
  return out;
};

export const utf8Decode = (b: ArrayBuffer | ArrayBufferView): string => new TextDecoder().decode(b);
