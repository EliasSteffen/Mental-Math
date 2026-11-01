// Rate-Limit für /api/explain und /api/auth: gleitende Zeitfenster je Schlüssel (DOM-frei, Cloudflare Workers + Node >= 20).
// Zählt bevorzugt global über ein Durable Object (workers/rate-limiter), sonst best effort pro Isolate im Speicher.

export interface LimitCheck { key: string; windowMs: number; max: number }
export type Hits = Record<string, number[]>;
/** Prüfliste je IP; legt Schlüssel und Grenzen eines Limiters fest */
export type ChecksFor = (ip: string) => LimitCheck[];

const MIN = 60_000;
export const DAY = 86_400_000;

/** Prüft alle Fenster; nur wenn keines voll ist, zählt der Treffer in allen. Liefert die bereinigten Listen. */
export function hitLimits(hits: Hits, checks: readonly LimitCheck[], now: number): { ok: boolean; hits: Hits } {
  const next: Hits = {};
  let ok = true;
  for (const c of checks) {
    const arr = (hits[c.key] ?? []).filter((x) => now - x < c.windowMs);
    if (arr.length >= c.max) ok = false;
    next[c.key] = arr;
  }
  if (ok) for (const c of checks) next[c.key]?.push(now);
  return { ok, hits: next };
}

/** Grenzen der KI-Erklärungen: 60/min insgesamt, je IP 15/min und 200/Tag */
export function explainChecks(ip: string): LimitCheck[] {
  return [
    { key: 'g:min', windowMs: MIN, max: 60 },
    { key: `ip:${ip}:min`, windowMs: MIN, max: 15 },
    { key: `ip:${ip}:day`, windowMs: DAY, max: 200 },
  ];
}

/** Grenze für /api/auth/*: je IP 30/min über alle Routen; eigene Schlüssel, teilt nichts mit explain */
export function authChecks(ip: string): LimitCheck[] {
  return [{ key: `ip:${ip}:auth:min`, windowMs: MIN, max: 30 }];
}

/** Gültige Prüfliste aus einem Request-Body (für das Durable Object) oder null */
export function parseChecks(body: unknown): LimitCheck[] | null {
  const raw = body && typeof body === 'object' ? (body as { checks?: unknown }).checks : null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return null;
  const out: LimitCheck[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') return null;
    const { key, windowMs, max } = c as Record<string, unknown>;
    if (typeof key !== 'string' || key.length === 0 || key.length > 80) return null;
    if (typeof windowMs !== 'number' || !(windowMs > 0 && windowMs <= DAY)) return null;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 10_000) return null;
    out.push({ key, windowMs, max });
  }
  return out;
}

export interface RateLimiter { limited(ip: string, now: number): Promise<boolean> }

/** Best effort pro Isolate: zählt nur Anfragen, die zufällig in derselben Instanz landen */
export function memoryLimiter(checksFor: ChecksFor = explainChecks): RateLimiter & { reset(): void } {
  let hits: Hits = {};
  return {
    async limited(ip, now) {
      const checks = checksFor(ip);
      const r = hitLimits(hits, checks, now);
      hits = { ...hits, ...r.hits };
      if (Object.keys(hits).length > 10_000) {
        for (const [k, v] of Object.entries(hits)) if (!v.length || now - (v[v.length - 1] ?? 0) >= DAY) delete hits[k];
      }
      return !r.ok;
    },
    reset() { hits = {}; },
  };
}

// Durable-Object-Binding (Cloudflare): nur die genutzten Teile typisiert
export interface DoStub { fetch(input: string, init?: RequestInit): Promise<Response> }
export interface DoNamespace { idFromName(name: string): unknown; get(id: unknown): DoStub }

/**
 * Global über ein Durable Object; ist es nicht erreichbar, entscheidet der Fallback (nie offen ohne Limit).
 * name wählt die Objekt-Instanz (eigener Speicher je Name), checksFor die Schlüssel und Grenzen; Default: explain.
 */
export function durableLimiter(
  ns: DoNamespace, fallback: RateLimiter, opts: { name?: string; checksFor?: ChecksFor } = {},
): RateLimiter {
  const { name = 'explain', checksFor = explainChecks } = opts;
  return {
    async limited(ip, now) {
      try {
        const stub = ns.get(ns.idFromName(name));
        const res = await stub.fetch('https://rate-limiter/hit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checks: checksFor(ip) }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { ok?: unknown };
        if (typeof data.ok !== 'boolean') throw new Error('invalid response');
        return !data.ok;
      } catch (e) {
        console.error('rate-limit: Durable Object nicht erreichbar, nutze In-Memory-Limit', e instanceof Error ? e.message : e);
        return fallback.limited(ip, now);
      }
    },
  };
}
