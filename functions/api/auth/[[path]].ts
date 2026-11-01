// /api/auth/* – Cloudflare Pages Function, leitet an server/auth.ts weiter
// env enthält Variablen und Bindings des Pages-Projekts, auch RATE_LIMITER (Durable Object für das Rate-Limit)
import { handleAuth } from '../../../server/auth.ts';
import type { AuthEnv } from '../../../server/auth.ts';

type PagesContext = { request: Request; env: AuthEnv };

export function onRequest(context: PagesContext): Promise<Response> {
  return handleAuth(context.request, context.env);
}
