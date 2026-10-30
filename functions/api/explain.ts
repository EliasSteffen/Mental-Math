import { handleExplain } from '../../server/explain.ts';
import type { ExplainEnv } from '../../server/explain.ts';

type PagesContext = { request: Request; env: ExplainEnv };

export function onRequest(context: PagesContext): Promise<Response> {
  return handleExplain(context.request, context.env);
}
