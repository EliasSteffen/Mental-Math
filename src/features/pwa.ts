// Registriert den Service Worker (nur https oder localhost); Fehler werden verschluckt.
export function registerSW(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const { protocol, hostname } = location;
    const ok = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!ok) return;
    const p = (): void => { navigator.serviceWorker.register('/sw.js').catch(() => {}); };
    if (document.readyState === 'complete') p();
    else window.addEventListener('load', p, { once: true });
  } catch { /* ignorieren */ }
}
