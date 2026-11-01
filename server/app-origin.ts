// Native App-Hülle (Capacitor, iOS): Die Seiten laufen unter capacitor://localhost und rufen /api/* cross-origin auf.
// CORS gibt es nur für genau diese Origin; Browser-Seiten anderer Origins bekommen keine CORS-Header.
export const APP_ORIGIN = 'capacitor://localhost';

const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Refresh-Token',
  'Access-Control-Expose-Headers': 'X-Refresh-Token',
  'Access-Control-Max-Age': '600',
};

export const isAppOrigin = (req: Request): boolean => req.headers.get('Origin') === APP_ORIGIN;

/** CORS für die App: Preflight direkt beantworten, sonst die Header an die Antwort hängen. Andere Anfragen unverändert. */
export async function withAppCors(req: Request, next: () => Promise<Response>): Promise<Response> {
  if (!isAppOrigin(req)) return next();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS_HEADERS, Vary: 'Origin' } });
  const res = await next();
  // Kopie, weil die Header der Antwort unveränderlich sein können
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
  out.headers.append('Vary', 'Origin');
  return out;
}
