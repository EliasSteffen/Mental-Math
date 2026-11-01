/// <reference lib="webworker" />
// Service Worker. Precache-Liste kommt aus /precache.json ({ version, files }), das scripts/precache.ts beim Build erzeugt.
// Dasselbe Skript setzt die Version auch hier ein: so ändert sich sw.js mit jedem Deploy, der Browser installiert die neue
// Version im Hintergrund, und sie wartet, bis die Seite sie anfordert (Hinweis „Neu laden“, platform/web.ts).
const sw = self as unknown as ServiceWorkerGlobalScope;

interface PrecacheManifest { version: string; files: string[] }

const PRECACHE_URL = '/precache.json';
const CACHE_PREFIX = 'mentalmath-';
/** Vom Build durch den Inhalts-Hash ersetzt; bleibt nur ohne scripts/precache.ts stehen (z. B. in Tests). */
const BUILD_VERSION: string = '__PRECACHE_VERSION__';
const VERSION: string | null = /^[0-9a-f]+$/.test(BUILD_VERSION) ? BUILD_VERSION : null;
/** Cache genau dieser Version: Seite und nachgeladene Module kommen immer aus demselben Stand. */
const CACHE_NAME = CACHE_PREFIX + (VERSION ?? 'dev');
/** Navigation: so lange aufs Netz warten, danach die gecachte App-Shell (ms). */
const NAV_TIMEOUT_MS = 3000;
/** Precache: Versuche je Datei (ein Retry). */
const PRECACHE_ATTEMPTS = 2;
const SHELL: readonly string[] = ['/', '/index.html'];

async function loadManifest(): Promise<PrecacheManifest | null> {
  try {
    const res = await fetch(PRECACHE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const { version, files } = data as Partial<PrecacheManifest>;
    if (typeof version !== 'string' || !Array.isArray(files)) return null;
    return { version, files: files.filter((f): f is string => typeof f === 'string') };
  } catch {
    return null;
  }
}

/** Ergebnis von p, oder null bei Fehler bzw. nach ms (p läuft dann weiter). */
function settleWithin<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** Datei frisch vom Server (HTTP-Cache wird revalidiert) in den Cache laden, mit einem zweiten Versuch. */
async function addFresh(cache: Cache, path: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await cache.add(new Request(new URL(path, sw.location.href).href, { cache: 'no-cache' }));
      return;
    } catch (e) {
      if (attempt >= PRECACHE_ATTEMPTS) throw e;
    }
  }
}

/**
 * Alle Dateien der Version in ihren Cache – ganz oder gar nicht. Fehlt eine Datei auch im zweiten Versuch, wird der neue
 * Cache verworfen und install schlägt fehl: die laufende Version bleibt aktiv, der Browser versucht es später erneut.
 * Ohne Manifest (offline, Dev-Server ohne precache.json) nur die App-Shell, tolerant.
 */
async function precache(): Promise<void> {
  const m = await loadManifest();
  if (!m) {
    // Ein Update ohne Manifest abbrechen: der Shell-Cache verdrängte beim Aktivieren den vollständigen der laufenden Version
    if (VERSION && sw.registration.active) throw new Error('precache.json nicht ladbar');
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)));
    return;
  }
  // Deploy zwischen sw.js und precache.json: die Dateien gehörten zu einer anderen Version
  if (VERSION && m.version !== VERSION) throw new Error(`precache.json (${m.version}) passt nicht zu sw.js (${VERSION})`);
  const existed = await caches.has(CACHE_NAME);
  const cache = await caches.open(CACHE_NAME);
  const files = [...new Set(['/', ...m.files])];
  const results = await Promise.allSettled(files.map((f) => addFresh(cache, f)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed === 0) return;
  if (!existed) await caches.delete(CACHE_NAME);
  throw new Error(`Precache unvollständig: ${failed} von ${files.length} Dateien fehlen`);
}

sw.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precache();
    // Erstinstallation (noch keine aktive Version, also kein kontrollierter Client): sofort aktivieren. Ein Update wartet,
    // bis die Seite es per SKIP_WAITING anfordert oder alle Tabs zu sind – sonst bekäme eine laufende alte Seite ihre
    // nachgeladenen Module (z. B. ui/modal.ts, Auth-Vendor) unter demselben Pfad aus der neuen Version.
    if (!sw.registration.active) await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await sw.clients.claim();
  })());
});

// Die Seite fordert die wartende Version an („Neu laden“ im Update-Hinweis)
sw.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING') {
    event.waitUntil(sw.skipWaiting());
  }
});

/* ---------- Push-Erinnerungen (Texte kommen fertig vom Server, siehe src/core/reminder-messages.ts) ---------- */

interface PushPayload { title: string; body: string; url: string; tag: string }

/** Nur Pfade dieser Origin als Ziel zulassen (auch „/\host“ o. ä. darf die Origin nicht wechseln) */
function safePath(v: unknown): string {
  if (typeof v !== 'string' || !v.startsWith('/')) return '/';
  try {
    const u = new URL(v.slice(0, 200), sw.location.origin);
    return u.origin === sw.location.origin ? `${u.pathname}${u.search}${u.hash}` : '/';
  } catch {
    return '/';
  }
}

function parsePush(data: PushMessageData | null): PushPayload {
  const fallback: PushPayload = { title: 'Mental Math', body: '', url: '/', tag: 'mm-reminder' };
  if (!data) return fallback;
  try {
    const p = data.json() as Record<string, unknown>;
    const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
    return { title: str(p.title, 100) || fallback.title, body: str(p.body, 300), url: safePath(p.url), tag: str(p.tag, 40) || fallback.tag };
  } catch {
    return fallback;
  }
}

sw.addEventListener('push', (event) => {
  const p = parsePush(event.data);
  // renotify: Eine neue Erinnerung meldet sich auch dann, wenn die alte (gleiches Tag) noch in der Mitteilungszentrale liegt
  const options: NotificationOptions & { renotify?: boolean } = {
    body: p.body, tag: p.tag, renotify: true, icon: '/icons/icon-192.png', data: { url: p.url },
  };
  event.waitUntil(sw.registration.showNotification(p.title, options));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath((event.notification.data as { url?: unknown } | null)?.url), sw.location.origin).href;
  event.waitUntil((async () => {
    const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((c) => new URL(c.url).origin === sw.location.origin);
    if (!open) {
      await sw.clients.openWindow(target);
      return;
    }
    await open.focus();
    await open.navigate(target).catch(() => null);
  })());
});

// Der Browser hat das Abo erneuert: neuen Endpoint melden (der alte Endpoint weist das Abo aus)
sw.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as ExtendableEvent & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null };
  e.waitUntil((async () => {
    const old = e.oldSubscription ?? null;
    const key = old?.options.applicationServerKey ?? null;
    const sub = e.newSubscription ?? (key ? await sw.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
    if (!old || !sub) return;
    await fetch('/api/push/renew', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: sub.toJSON() }),
    });
  })().catch(() => undefined));
});

/* ---------- Fetch ---------- */

/** Weitergeleitete Antwort (z. B. /index.html → /) neu verpacken: Navigationen lehnen „redirected“-Antworten ab. */
function unredirected(res: Response): Response {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/**
 * Navigation: zuerst das Netz, aber höchstens NAV_TIMEOUT_MS – danach (oder bei Netzfehler) die gecachte App-Shell.
 * Ohne Cache-Treffer weiter aufs Netz warten (langsame Leitung). Navigationsantworten landen bewusst nicht im Cache:
 * er gehört zu einer Version, und eine neuere index.html darin passte nicht mehr zu deren Modulen.
 */
async function navigate(req: Request): Promise<Response> {
  const network = fetch(req);
  const res = await settleWithin(network, NAV_TIMEOUT_MS);
  if (res) return res;
  const shell = (await caches.match('/index.html', { cacheName: CACHE_NAME })) ?? (await caches.match('/', { cacheName: CACHE_NAME }));
  if (shell) return unredirected(shell);
  return network.catch(() => Response.error());
}

/**
 * Assets: aus dem Cache der eigenen Version, ohne Aktualisierung im Hintergrund (Dateinamen ohne Hash – eine neuere Datei
 * im Cache mischte Versionen; neue Stände kommen als Ganzes über install). Fehlt eine Datei (z. B. der nicht precachte
 * Auth-Vendor), aus dem Netz holen und für diese Version ablegen.
 */
async function asset(event: FetchEvent): Promise<Response> {
  const req = event.request;
  const cached = await caches.match(req, { cacheName: CACHE_NAME });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => undefined));
    }
    return res;
  } catch {
    return Response.error();
  }
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(req.mode === 'navigate' ? navigate(req) : asset(event));
});
