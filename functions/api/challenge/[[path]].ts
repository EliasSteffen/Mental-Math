// /api/challenge/* – Cloudflare Pages Function, leitet an server/challenge.ts weiter (Speicher: Supabase)
// Braucht dieselben Variablen wie /api/auth (Supabase, AUTH_JWT_KEY, AUTH_RP_ID, AUTH_ORIGINS) und optional RATE_LIMITER.
import { handleChallenge } from '../../../server/challenge.ts';
import type { ChallengeEnv } from '../../../server/challenge.ts';

type PagesContext = { request: Request; env: ChallengeEnv };

export function onRequest(context: PagesContext): Promise<Response> {
  return handleChallenge(context.request, context.env);
}
