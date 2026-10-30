// Registers the service worker (https or localhost only); errors are swallowed.
export function registerSW() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const { protocol, hostname } = location;
    const ok = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!ok) return;
    const p = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') p();
    else window.addEventListener('load', p, { once: true });
  } catch (_) { /* ignore */ }
}
