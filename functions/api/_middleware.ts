// Läuft vor allen /api/*-Functions: CORS für die native App (capacitor://localhost), siehe server/app-origin.ts
import { withAppCors } from '../../server/app-origin.ts';

type PagesContext = { request: Request; next: () => Promise<Response> };

export function onRequest(context: PagesContext): Promise<Response> {
  return withAppCors(context.request, () => context.next());
}
