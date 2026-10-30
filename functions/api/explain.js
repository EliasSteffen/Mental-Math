import { handleExplain } from '../../server/explain.js';

export function onRequest(context) {
  return handleExplain(context.request, context.env);
}
