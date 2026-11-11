// Live-Rennen (v12 R3): GET /api/race/live/<raceId>?t=<ticket> (WebSocket). Die Pages Function prüft das Ticket selbst
// (AUTH_JWT_KEY liegt hier im env) und reicht den Upgrade an das Durable Object RaceRoom weiter (Binding RACE_ROOM aus
// workers/race-room). Die geprüfte Identität reist in internen Headern: Der Worker hat keine öffentliche Adresse und ist
// nur über dieses Binding erreichbar, deshalb darf das Durable Object ihnen trauen und braucht kein eigenes Secret.
// Anfrage-Header des Clients mit denselben Namen werden nie weitergegeben (es wird ein neues Header-Objekt gebaut).
import { verifyTicket } from './race-ticket.ts';

export const RACE_HEADERS = {
  user: 'X-Race-User',
  name: 'X-Race-Name',
  race: 'X-Race-Id',
  duration: 'X-Race-Duration',
} as const;

export interface RoomStub { fetch(request: Request): Promise<Response> }
export interface RoomNamespace { idFromName(name: string): unknown; get(id: unknown): RoomStub }

export interface RaceLiveEnv {
  AUTH_JWT_KEY?: string;
  RACE_ROOM?: RoomNamespace;
}

const BASE = '/api/race/live';
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const fail = (status: number, code: string): Response => new Response(JSON.stringify({ error: { code } }), { status, headers: JSON_HEADERS });

export async function handleRaceLive(req: Request, env: RaceLiveEnv, now: number = Date.now()): Promise<Response> {
  const key = (env.AUTH_JWT_KEY ?? '').trim();
  if (!env.RACE_ROOM || !key) return fail(503, 'unavailable');
  const url = new URL(req.url);
  const rest = (url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname).replace(/^\/+|\/+$/g, '');
  const upgrade = req.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  // Ohne Raum-ID: Erreichbarkeitsprüfung des Clients („gibt es Live-Rennen auf diesem Server?“)
  if (rest === '' && !upgrade) return new Response(JSON.stringify({ live: true }), { status: 200, headers: JSON_HEADERS });
  if (req.method !== 'GET') return fail(405, 'method');
  if (!upgrade) return fail(426, 'upgrade_required');
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(rest)) return fail(404, 'not_found');
  const claims = await verifyTicket(url.searchParams.get('t') ?? '', key, now);
  if (!claims || claims.raceId !== rest) return fail(401, 'unauthorized');

  const headers = new Headers();
  headers.set('Upgrade', 'websocket');
  headers.set(RACE_HEADERS.user, claims.userId);
  headers.set(RACE_HEADERS.name, encodeURIComponent(claims.name));
  headers.set(RACE_HEADERS.race, claims.raceId);
  headers.set(RACE_HEADERS.duration, String(claims.d));
  const stub = env.RACE_ROOM.get(env.RACE_ROOM.idFromName(claims.raceId));
  return stub.fetch(new Request('https://race-room.internal/connect', { method: 'GET', headers }));
}
