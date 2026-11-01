// Worker „mental-math-rate-limiter“: stellt das Durable Object RateLimiter für die Pages Functions /api/explain und
// /api/auth bereit (je eine Objekt-Instanz „explain“ bzw. „auth“ mit eigenen Schlüsseln).
// Pages kann Durable Objects nicht selbst definieren, nur per Binding aus einem Worker nutzen (Binding-Name RATE_LIMITER).
// Der Worker selbst hat keine öffentliche Route (workers_dev = false); erreichbar ist nur das Durable Object über das Binding.
import { DAY, hitLimits, parseChecks } from '../../../server/rate-limit.ts';
import type { Hits } from '../../../server/rate-limit.ts';

// Nur die genutzten Teile der Durable-Object-Storage-API (SQLite-Backend, Key-Value-Methoden)
export interface DoStorage {
  get<T>(keys: string[]): Promise<Map<string, T>>;
  put<T>(entries: Record<string, T>): Promise<void>;
  delete(keys: string[]): Promise<number>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
}
export interface DoState { storage: DoStorage }

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export class RateLimiter {
  state: DoState;
  now: () => number;

  constructor(state: DoState, _env?: unknown, now: () => number = Date.now) {
    this.state = state;
    this.now = now;
  }

  // Storage-Zugriffe einer Anfrage laufen hinter dem Input-Gate des Objekts, Prüfen und Zählen sind damit atomar.
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'invalid' });
    }
    const checks = parseChecks(body);
    if (!checks) return json(400, { error: 'invalid' });
    const keys = checks.map((c) => c.key);
    const stored = await this.state.storage.get<number[]>(keys);
    const hits: Hits = Object.fromEntries(keys.map((k) => [k, stored.get(k) ?? []]));
    const r = hitLimits(hits, checks, this.now());
    const keep: Hits = {};
    const drop: string[] = [];
    for (const [k, v] of Object.entries(r.hits)) {
      if (v.length) keep[k] = v;
      else drop.push(k);
    }
    if (Object.keys(keep).length) await this.state.storage.put(keep);
    if (drop.length) await this.state.storage.delete(drop);
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(this.now() + DAY);
    return json(200, { ok: r.ok });
  }

  // Einmal am Tag: Schlüssel ohne Treffer in den letzten 24 h entfernen
  async alarm(): Promise<void> {
    const now = this.now();
    const all = await this.state.storage.list<number[]>({ prefix: 'ip:' });
    const stale = [...all].filter(([, v]) => !v.length || now - (v[v.length - 1] ?? 0) >= DAY).map(([k]) => k);
    for (let i = 0; i < stale.length; i += 128) await this.state.storage.delete(stale.slice(i, i + 128));
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
