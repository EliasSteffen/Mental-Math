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
