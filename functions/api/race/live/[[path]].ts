// /api/race/live/<raceId>?t=<ticket> – Cloudflare Pages Function (Live-Rennen, v12 R3): prüft das Ticket und reicht den
// WebSocket-Upgrade an das Durable Object RaceRoom weiter. Braucht AUTH_JWT_KEY und das Binding RACE_ROOM (siehe README →
// Live-Rennen); ohne Binding antwortet sie mit 503 unavailable, und die App blendet Live-Rennen aus.
import { handleRaceLive } from '../../../../server/race-live.ts';
import type { RaceLiveEnv } from '../../../../server/race-live.ts';

type PagesContext = { request: Request; env: RaceLiveEnv };

export function onRequest(context: PagesContext): Promise<Response> {
  return handleRaceLive(context.request, context.env);
}
