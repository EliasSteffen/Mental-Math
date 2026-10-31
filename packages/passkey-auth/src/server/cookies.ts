// Minimaler Cookie-Helfer (HttpOnly, SameSite=Strict).

export interface CookieOpts { path: string; maxAgeSec: number; secure: boolean }

export function serializeCookie(name: string, value: string, o: CookieOpts): string {
  return `${name}=${value}; Path=${o.path}; Max-Age=${Math.floor(o.maxAgeSec)}; HttpOnly; SameSite=Strict${o.secure ? '; Secure' : ''}`;
}

export const clearCookie = (name: string, o: { path: string; secure: boolean }): string =>
  serializeCookie(name, '', { path: o.path, maxAgeSec: 0, secure: o.secure });

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue; // erster Wert gewinnt
    out[k] = part.slice(i + 1).trim();
  }
  return out;
}
