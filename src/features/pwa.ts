// Registriert den Service Worker (nur https oder localhost) und bietet neue Versionen an; Fehler werden verschluckt.
// Ein Update wartet im SW, bis der Nutzer „Neu laden“ wählt (nie mitten in einer Runde) – Ablauf in pwa-update.ts.
import { t } from '../i18n/index.ts';
import { toast } from '../ui/toast.ts';
import { UPDATE_CHECK_INTERVAL_MS, createThrottle, createUpdateFlow } from './pwa-update.ts';

export function registerSW(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const { protocol, hostname } = location;
    const ok = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!ok) return;
    const p = (): void => { navigator.serviceWorker.register('/sw.js').then(watchUpdates).catch(() => {}); };
    if (document.readyState === 'complete') p();
    else window.addEventListener('load', p, { once: true });
  } catch { /* ignorieren */ }
}

function watchUpdates(reg: ServiceWorkerRegistration): void {
  const container = navigator.serviceWorker;
  let closeHint: (() => void) | null = null;
  const flow = createUpdateFlow({
    hash: () => location.hash,
    showHint: (onReload) => {
      closeHint = toast(t('common.updateReady'), { durationMs: 0, action: { label: t('common.updateReload'), onClick: onReload } });
    },
    hideHint: () => { closeHint?.(); closeHint = null; },
    activate: () => {
      const w = reg.waiting;
      if (!w) return false;
      w.postMessage({ type: 'SKIP_WAITING' });
      return true;
    },
    reload: () => { location.reload(); },
  }, container.controller !== null);

  const onInstalled = (): void => { if (reg.waiting) flow.waiting(); };
  const track = (w: ServiceWorker): void => {
    w.addEventListener('statechange', () => { if (w.state === 'installed') onInstalled(); });
  };
  onInstalled(); // wartet schon (z. B. in einem anderen Tab installiert)
  if (reg.installing) track(reg.installing); // Installation lief schon vor der Registrierung hier
  reg.addEventListener('updatefound', () => { if (reg.installing) track(reg.installing); });
  container.addEventListener('controllerchange', () => flow.controllerChanged());
  window.addEventListener('hashchange', () => flow.routeChanged());

  // Installierte PWA kehrt oft ohne Navigation zurück: beim Sichtbarwerden gedrosselt nach einer neuen Version fragen
  const due = createThrottle(UPDATE_CHECK_INTERVAL_MS, () => Date.now());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && due()) reg.update().catch(() => {});
  });
}
