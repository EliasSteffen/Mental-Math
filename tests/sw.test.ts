// Service Worker (src/sw.ts) mit minimalem SW-Ersatz: Navigation mit Timeout, atomarer Precache, Update wartet auf
// SKIP_WAITING, Assets ohne Aktualisierung im Hintergrund. Die Version setzt injectVersion ein – wie der Build.
import { test, mock, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { injectVersion } from '../scripts/precache.ts';

const ORIGIN = 'https://app.test';
const SW_SOURCE: string = readFileSync(new URL('../src/sw.ts', import.meta.url), 'utf8');
const FILES: readonly string[] = ['/index.html', '/js/app.js', '/css/app.css'];

type Req = string | { url: string };
const abs = (r: Req): string => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;

class FakeCache {
  readonly store = new Map<string, Response>();
  async match(r: Req): Promise<Response | undefined> { return this.store.get(abs(r))?.clone(); }
  async put(r: Req, res: Response): Promise<void> { this.store.set(abs(r), res); }
  async add(r: Req): Promise<void> {
    const res = await fetch(r as RequestInfo);
    if (!res.ok) throw new TypeError(`add: HTTP ${res.status}`);
    this.store.set(abs(r), res);
  }
  async text(r: Req): Promise<string | undefined> { return (await this.match(r))?.text(); }
}

class FakeCaches {
  readonly map = new Map<string, FakeCache>();
  async open(name: string): Promise<FakeCache> {
    const c = this.map.get(name) ?? new FakeCache();
    this.map.set(name, c);
    return c;
  }
  async has(name: string): Promise<boolean> { return this.map.has(name); }
  async delete(name: string): Promise<boolean> { return this.map.delete(name); }
  async keys(): Promise<string[]> { return [...this.map.keys()]; }
  async match(r: Req, opts: { cacheName?: string } = {}): Promise<Response | undefined> {
    const list = opts.cacheName ? [this.map.get(opts.cacheName)] : [...this.map.values()];
    for (const c of list) {
      const hit = await c?.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Listener = (event: unknown) => void;
interface Scope { listeners: Map<string, Listener>; skipped: number; claimed: number }
type Route = (url: string, input: unknown) => Response | Promise<Response>;

const g = globalThis as unknown as Record<string, unknown>;
const realFetch = globalThis.fetch;
let caches = new FakeCaches();
let route: Route = () => new Response('nicht gefunden', { status: 404 });
let fetched: string[] = [];
let dir: string | null = null;
let seq = 0;

globalThis.fetch = (async (input: unknown) => {
  const url = abs(input as Req);
  fetched.push(url);
  return route(url, input);
}) as typeof fetch;

beforeEach(() => {
  caches = new FakeCaches();
  g.caches = caches;
  fetched = [];
});
afterEach(() => { mock.timers.reset(); });
after(() => {
  globalThis.fetch = realFetch;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Frische SW-Instanz (eigene Datei = eigenes Modul); version wie vom Build eingesetzt, active = Update-Fall. */
async function loadSW(opts: { version?: string; active?: boolean } = {}): Promise<Scope> {
  const scope: Scope = { listeners: new Map(), skipped: 0, claimed: 0 };
  g.self = {
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { active: opts.active ? {} : null },
    clients: { claim: async () => { scope.claimed += 1; } },
    skipWaiting: async () => { scope.skipped += 1; },
    addEventListener: (type: string, fn: Listener) => { scope.listeners.set(type, fn); },
  };
  dir ??= mkdtempSync(join(tmpdir(), 'mm-sw-'));
  seq += 1;
  const file = join(dir, `sw-${seq}.mts`);
  writeFileSync(file, opts.version ? injectVersion(SW_SOURCE, opts.version) : SW_SOURCE);
  await import(pathToFileURL(file).href);
  return scope;
}

function listener(scope: Scope, type: string): Listener {
  const fn = scope.listeners.get(type);
  assert.ok(fn, `kein ${type}-Listener`);
  return fn;
}

/** install/activate auslösen; liefert das waitUntil-Promise. */
function lifecycle(scope: Scope, type: 'install' | 'activate'): Promise<unknown> {
  let p: Promise<unknown> = Promise.resolve();
  listener(scope, type)({ waitUntil: (x: Promise<unknown>) => { p = x; } });
  return p;
}

function message(scope: Scope, data: unknown): void {
  listener(scope, 'message')({ data, waitUntil: (x: Promise<unknown>) => { void x; } });
}

interface Fetched { response: Promise<Response> | null; waits: Promise<unknown>[] }
function request(scope: Scope, path: string, mode = 'cors'): Fetched {
  const out: Fetched = { response: null, waits: [] };
  listener(scope, 'fetch')({
    request: { method: 'GET', url: abs(path), mode },
    respondWith: (p: Promise<Response>) => { out.response = p; },
    waitUntil: (p: Promise<unknown>) => { out.waits.push(p); },
  });
  return out;
}

function responseOf(f: Fetched): Promise<Response> {
  assert.ok(f.response, 'respondWith nicht aufgerufen');
  return f.response;
}

/** Ist p nach allen anstehenden Microtasks erledigt? (setImmediate ist nicht gemockt) */
async function isSettled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  await new Promise((r) => setImmediate(r));
  return done;
}

/** Server einer Version: precache.json + Dateien; overrides ersetzen einzelne Pfade. */
function server(version: string, overrides: Record<string, () => Response | Promise<Response>> = {}): Route {
  return (url) => {
    const path = new URL(url).pathname;
    const own = overrides[path];
    if (own) return own();
    if (path === '/precache.json') return Response.json({ version, files: FILES });
    return new Response(`${version}:${path}`);
  };
}

/* ---------- install / activate / message ---------- */

test('install: lädt alle Manifest-Dateien frisch (no-cache), Erstinstallation aktiviert sofort', async () => {
  const sw = await loadSW({ version: 'abc123' });
  const modes: string[] = [];
  const base = server('abc123');
  route = (url, input) => {
    if (input instanceof Request) modes.push(input.cache);
    return base(url, input);
  };
  await lifecycle(sw, 'install');
  const cache = caches.map.get('mentalmath-abc123');
  assert.ok(cache);
  assert.deepEqual([...cache.store.keys()].sort(), ['/', ...FILES].map(abs).sort());
  assert.equal(await cache.text('/js/app.js'), 'abc123:/js/app.js');
  assert.deepEqual([...new Set(modes)], ['no-cache']);
  assert.equal(sw.skipped, 1);
});

test('install: Update wartet ohne skipWaiting; erst SKIP_WAITING aktiviert', async () => {
  const sw = await loadSW({ version: 'abc123', active: true });
  route = server('abc123');
  await lifecycle(sw, 'install');
  assert.equal(sw.skipped, 0);
  message(sw, { type: 'anders' });
  message(sw, 'SKIP_WAITING');
  message(sw, null);
  assert.equal(sw.skipped, 0);
  message(sw, { type: 'SKIP_WAITING' });
  assert.equal(sw.skipped, 1);
});

test('install: ein Retry je Datei', async () => {
  const sw = await loadSW({ version: 'abc123', active: true });
  let tries = 0;
  route = server('abc123', {
    '/js/app.js': () => { tries += 1; return tries === 1 ? new Response('', { status: 503 }) : new Response('ok'); },
  });
  await lifecycle(sw, 'install');
  assert.equal(tries, 2);
  assert.equal(await caches.map.get('mentalmath-abc123')?.text('/js/app.js'), 'ok');
});

test('install: fehlt eine Datei, wird der neue Cache verworfen und install schlägt fehl – der alte bleibt', async () => {
  const old = await caches.open('mentalmath-old');
  await old.put('/index.html', new Response('alt'));
  const sw = await loadSW({ version: 'abc123', active: true });
  let tries = 0;
  route = server('abc123', {
    '/css/app.css': () => { tries += 1; throw new TypeError('offline'); },
  });
  await assert.rejects(lifecycle(sw, 'install'), /Precache unvollständig/);
  assert.equal(tries, 2);
  assert.deepEqual(await caches.keys(), ['mentalmath-old']);
  assert.equal(await old.text('/index.html'), 'alt');
  assert.equal(sw.skipped, 0);
});

test('install: Manifest einer anderen Version (Deploy dazwischen) → Abbruch', async () => {
  const sw = await loadSW({ version: 'abc123', active: true });
  route = server('def456');
  await assert.rejects(lifecycle(sw, 'install'), /passt nicht/);
  assert.deepEqual(await caches.keys(), []);
});

test('install ohne Manifest: Erstinstallation tolerant (nur Shell), Update bricht ab', async () => {
  const shellOnly: Route = (url) => (new URL(url).pathname === '/' ? new Response('shell') : new Response('', { status: 404 }));

  const first = await loadSW({ version: 'abc123' });
  route = shellOnly;
  await lifecycle(first, 'install');
  assert.equal(await caches.map.get('mentalmath-abc123')?.text('/'), 'shell');
  assert.equal(first.skipped, 1);

  caches = new FakeCaches();
  g.caches = caches;
  const update = await loadSW({ version: 'abc123', active: true });
  await assert.rejects(lifecycle(update, 'install'), /precache\.json/);
  assert.deepEqual(await caches.keys(), []);

  // Ohne eingesetzte Version (Quelltext, Dev) bleibt es tolerant wie bisher
  const dev = await loadSW({ active: true });
  await lifecycle(dev, 'install');
  assert.equal(await caches.map.get('mentalmath-dev')?.text('/'), 'shell');
});

test('activate: löscht die Caches anderer Versionen und übernimmt die Clients', async () => {
  await caches.open('mentalmath-old');
  await caches.open('mentalmath-abc123');
  const sw = await loadSW({ version: 'abc123' });
  await lifecycle(sw, 'activate');
  assert.deepEqual(await caches.keys(), ['mentalmath-abc123']);
  assert.equal(sw.claimed, 1);
});

/* ---------- Navigation ---------- */

async function withShell(paths: Record<string, Response>): Promise<FakeCache> {
  const cache = await caches.open('mentalmath-abc123');
  for (const [p, res] of Object.entries(paths)) await cache.put(p, res);
  return cache;
}

test('Navigation: Netz innerhalb des Timeouts gewinnt; der versionierte Cache bleibt unverändert', async () => {
  const cache = await withShell({ '/index.html': new Response('gecacht') });
  const sw = await loadSW({ version: 'abc123' });
  route = () => new Response('frisch');
  const res = await responseOf(request(sw, '/', 'navigate'));
  assert.equal(await res.text(), 'frisch');
  assert.deepEqual([...cache.store.keys()], [abs('/index.html')]);
  assert.equal(await cache.text('/index.html'), 'gecacht');
});

test('Navigation: hängt das Netz, nach 3 s die gecachte /index.html', async () => {
  await withShell({ '/index.html': new Response('gecacht') });
  const sw = await loadSW({ version: 'abc123' });
  route = () => new Promise<Response>(() => {});
  mock.timers.enable({ apis: ['setTimeout'] });
  const p = responseOf(request(sw, '/?src=pwa', 'navigate'));
  mock.timers.tick(2999);
  assert.equal(await isSettled(p), false);
  mock.timers.tick(1);
  assert.equal(await isSettled(p), true); // ohne Timeout schlägt der Test fehl, statt zu hängen
  assert.equal(await (await p).text(), 'gecacht');
});

test('Navigation: Netzfehler → sofort die Shell, ersatzweise „/“', async () => {
  await withShell({ '/': new Response('wurzel') });
  const sw = await loadSW({ version: 'abc123' });
  route = () => { throw new TypeError('offline'); };
  const res = await responseOf(request(sw, '/', 'navigate'));
  assert.equal(await res.text(), 'wurzel');
});

test('Navigation: ohne Cache-Treffer weiter aufs Netz warten, statt sofort Response.error()', async () => {
  const sw = await loadSW({ version: 'abc123' });
  let deliver: (r: Response) => void = () => {};
  route = () => new Promise<Response>((r) => { deliver = r; });
  mock.timers.enable({ apis: ['setTimeout'] });
  const p = responseOf(request(sw, '/', 'navigate'));
  mock.timers.tick(5000);
  assert.equal(await isSettled(p), false);
  deliver(new Response('spät'));
  assert.equal(await isSettled(p), true);
  assert.equal(await (await p).text(), 'spät');

  // Scheitert das Netz dann doch, gibt es den Netzwerkfehler
  route = () => { throw new TypeError('offline'); };
  const err = await responseOf(request(sw, '/', 'navigate'));
  assert.equal(err.type, 'error');
});

test('Navigation: weitergeleitete Shell (/index.html → /) wird neu verpackt', async () => {
  const redirected = new Response('shell', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(redirected, 'redirected', { value: true });
  const sw = await loadSW({ version: 'abc123' });
  // FakeCache liefert Klone – die Markierung dort setzen, wo der SW sie liest
  g.caches = Object.assign(caches, {
    match: async (r: Req) => (abs(r) === abs('/index.html') ? redirected : undefined),
  });
  route = () => { throw new TypeError('offline'); };
  const res = await responseOf(request(sw, '/', 'navigate'));
  assert.equal(res.redirected, false);
  assert.equal(res.headers.get('Content-Type'), 'text/html');
  assert.equal(await res.text(), 'shell');
});

/* ---------- Assets ---------- */

test('Assets: Treffer kommt aus dem Cache der Version, ohne Netz; Fehlendes wird geholt und abgelegt', async () => {
  const cache = await withShell({ '/js/app.js': new Response('v1') });
  const sw = await loadSW({ version: 'abc123' });
  route = (url) => new Response(`netz:${new URL(url).pathname}`);

  const hit = await responseOf(request(sw, '/js/app.js'));
  assert.equal(await hit.text(), 'v1');
  assert.deepEqual(fetched, [], 'keine Aktualisierung im Hintergrund');

  const miss = request(sw, '/js/vendor/auth.js');
  assert.equal(await (await responseOf(miss)).text(), 'netz:/js/vendor/auth.js');
  await Promise.all(miss.waits);
  assert.equal(await cache.text('/js/vendor/auth.js'), 'netz:/js/vendor/auth.js');

  route = () => { throw new TypeError('offline'); };
  assert.equal((await responseOf(request(sw, '/css/fehlt.css'))).type, 'error');
});

test('Fetch: /api/, fremde Origins und POST bleiben beim Browser', async () => {
  const sw = await loadSW({ version: 'abc123' });
  assert.equal(request(sw, '/api/push/renew').response, null);
  assert.equal(request(sw, 'https://cdn.example/x.js').response, null);
  const out: Fetched = { response: null, waits: [] };
  listener(sw, 'fetch')({ request: { method: 'POST', url: abs('/x'), mode: 'cors' }, respondWith: (p: Promise<Response>) => { out.response = p; } });
  assert.equal(out.response, null);
});

/* ---------- Build: Version in sw.js ---------- */

test('injectVersion: setzt die Version genau einmal ein, sonst Fehler', () => {
  const out = injectVersion(SW_SOURCE, '0123abcdef');
  assert.ok(out.includes("const BUILD_VERSION: string = '0123abcdef';"));
  assert.ok(!out.includes('__PRECACHE_VERSION__'));
  assert.equal(injectVersion('var v = "__PRECACHE_VERSION__";', 'ab12'), 'var v = "ab12";');
  assert.throws(() => injectVersion('var v = 1;', 'ab12'), /0× statt 1×/);
  assert.throws(() => injectVersion("'__PRECACHE_VERSION__' + '__PRECACHE_VERSION__'", 'ab12'), /2× statt 1×/);
  assert.throws(() => injectVersion(SW_SOURCE, 'nicht-hex'), /ungültige Version/);
});
