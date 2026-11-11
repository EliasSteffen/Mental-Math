// Live-Rennen (v12 R3): kurzlebiges Ticket für den WebSocket zum Rennraum.
// POST /api/challenge/race/:id/ticket (nur Live-Rennen, nur Mitglieder, nicht verfallen) → { ticket, expiresAt }.
// Das Ticket ist HMAC-SHA-256 über { raceId, userId, name, d, exp } mit AUTH_JWT_KEY (Domänentrennung per Präfix, damit es nie
// als JWT durchgeht). Geprüft wird es von der Pages Function functions/api/race/live (server/race-live.ts); das Durable Object
// im Worker vertraut den von ihr gesetzten Headern, weil der Worker nur über das Pages-Binding erreichbar ist (workers_dev = false).
// WebCrypto: läuft in Cloudflare Workers/Pages und Node ≥ 20.
import type { RaceInfo } from '../src/core/race-room.ts'; // TODO(v12-merge): aus race-api.ts

/** Gültigkeit eines Tickets (nur für den Verbindungsaufbau nötig) */
export const TICKET_TTL_MS = 60_000;
const PREFIX = 'race-ticket.v1.';
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface TicketClaims {
  raceId: string;
  userId: string;
  name: string;
  /** Dauer des Rennens in Sekunden (der Raum braucht sie für Ende und Takt; sie kommt vom Server, nicht vom Client) */
  d: number;
  /** Ablauf, ms Unix */
  exp: number;
}

function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function b64uDecode(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const hmacKey = (key: string, usage: 'sign' | 'verify'): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/** Ticket ausstellen: `<Nutzlast base64url>.<Signatur base64url>` */
export async function signTicket(claims: TicketClaims, key: string): Promise<string> {
  const payload = b64uEncode(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(key, 'sign'), enc.encode(PREFIX + payload)));
  return `${payload}.${b64uEncode(sig)}`;
}

const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;

/** Ticket prüfen (Signatur, Aufbau, Ablauf); jede Abweichung → null. */
export async function verifyTicket(token: string, key: string, now: number): Promise<TicketClaims | null> {
  if (!key || token.length > 1024) return null;
  const parts = token.split('.');
  const [payload, sig] = parts;
  if (parts.length !== 2 || !payload || !sig) return null;
  const sigBytes = b64uDecode(sig);
  if (!sigBytes) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(key, 'verify'), sigBytes, enc.encode(PREFIX + payload));
  } catch {
    return null;
  }
  if (!ok) return null;
  const bytes = b64uDecode(payload);
  if (!bytes) return null;
  let c: unknown;
  try { c = JSON.parse(dec.decode(bytes)); } catch { return null; }
  if (c === null || typeof c !== 'object') return null;
  const { raceId, userId, name, d, exp } = c as Record<string, unknown>;
  if (!isStr(raceId, 64) || !isStr(userId, 64) || !isStr(name, 64) || typeof d !== 'number' || typeof exp !== 'number') return null;
  if (!Number.isFinite(d) || !Number.isFinite(exp) || now >= exp) return null;
  return { raceId, userId, name, d, exp };
}

/* ---------- Route ---------- */

export const TICKET_PATH_RE = /^\/race\/([A-Za-z0-9_-]{4,64})\/ticket$/;

type TicketCode = 'unauthorized' | 'unavailable' | 'not_found' | 'not_member' | 'closed' | 'no_profile' | 'invalid';
const STATUS: Record<TicketCode, number> = {
  invalid: 400, unauthorized: 401, not_member: 403, not_found: 404, no_profile: 409, closed: 410, unavailable: 503,
};
export interface TicketReply { status: number; body: unknown }
const err = (code: TicketCode): TicketReply => ({ status: STATUS[code], body: { error: { code } } });

export interface TicketRoute {
  path: string;
  userId: string | null;
  now: number;
  /** AUTH_JWT_KEY */
  key: string | undefined;
  /** Aus dem Store von R2 (`RaceStore.info`); fehlt er, antwortet die Route mit `unavailable` */
  info: ((raceId: string, userId: string) => Promise<{ race: RaceInfo; member: boolean } | null>) | undefined;
  /** Anzeigename wie in den Gruppen-Ranglisten (Profil) */
  name: (userId: string) => Promise<string | null>;
}

export async function raceTicketRoute(r: TicketRoute): Promise<TicketReply> {
  const raceId = TICKET_PATH_RE.exec(r.path)?.[1];
  if (!raceId) return err('not_found');
  if (!r.userId) return err('unauthorized');
  const key = (r.key ?? '').trim();
  if (!r.info || !key) return err('unavailable');
  const found = await r.info(raceId, r.userId);
  if (!found || found.race.kind !== 'live') return err('not_found');
  if (!found.member) return err('not_member');
  const endsAt = Date.parse(found.race.endsAt);
  if (!Number.isFinite(endsAt) || endsAt <= r.now) return err('closed');
  const name = await r.name(r.userId);
  if (!name) return err('no_profile');
  const exp = r.now + TICKET_TTL_MS;
  const ticket = await signTicket({ raceId, userId: r.userId, name, d: found.race.config.durationS, exp }, key);
  return { status: 200, body: { ticket, expiresAt: new Date(exp).toISOString() } };
}
