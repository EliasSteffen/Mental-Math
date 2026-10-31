/// <reference lib="webworker" />
// Service Worker. Precache-Liste und Version kommen aus /precache.json ({ version, files }),
// das scripts/precache.mjs beim Build erzeugt.
const sw = self as unknown as ServiceWorkerGlobalScope;

interface PrecacheManifest { version: string; files: string[] }

const PRECACHE_URL = '/precache.json';
const CACHE_PREFIX = 'mentalmath-';
const FALLBACK_CACHE = `${CACHE_PREFIX}dev`;

let cacheNamePromise: Promise<string> | null = null;

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

/** Cache-Name aus der Version; ohne Manifest (offline) wird der vorhandene Cache weiterverwendet. */
function cacheName(): Promise<string> {
  cacheNamePromise ??= (async () => {
    const m = await loadManifest();
    if (m) return CACHE_PREFIX + m.version;
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith(CACHE_PREFIX)) ?? FALLBACK_CACHE;
  })();
  return cacheNamePromise;
}

sw.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const m = await loadManifest();
    const name = m ? CACHE_PREFIX + m.version : FALLBACK_CACHE;
    cacheNamePromise = Promise.resolve(name);
    const cache = await caches.open(name);
    const files = m ? ['/', ...m.files] : ['/', '/index.html'];
    await Promise.all(files.map(async (url) => {
      try { await cache.add(url); } catch { /* fehlende Dateien tolerieren */ }
    }));
    await sw.skipWaiting();
  })());
});

sw.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const current = await cacheName();
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== current).map((k) => caches.delete(k)));
    await sw.clients.claim();
  })());
});

/* ---------- Push-Erinnerungen (Texte kommen fertig vom Server, siehe server/push-messages.ts) ---------- */

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

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(await cacheName());
        return (await cache.match('/index.html')) ?? (await cache.match('/')) ?? Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(await cacheName());
    const cached = await cache.match(req);
    const network: Promise<Response | null> = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) ?? Response.error();
  })());
});
