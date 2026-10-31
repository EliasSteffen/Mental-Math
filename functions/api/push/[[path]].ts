// /api/push/* – Cloudflare Pages Function, leitet an server/push.ts weiter (Speicher: Supabase)
import { handlePush } from '../../../server/push.ts';
import type { PushEnv } from '../../../server/push.ts';
import { createSupabasePushStore } from '../../../server/push-store.ts';

type PagesContext = { request: Request; env: PushEnv };

export function onRequest(context: PagesContext): Promise<Response> {
  return handlePush(context.request, context.env, { createStore: createSupabasePushStore });
}
