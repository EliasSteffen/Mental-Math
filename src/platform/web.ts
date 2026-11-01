// Website/PWA: Browser-APIs der Plattform-Schicht (Service Worker, Vibration, Download, Web Share).
import { UPDATE_CHECK_INTERVAL_MS, createThrottle, createUpdateFlow } from '../features/pwa-update.ts';

/**
 * Registriert den Service Worker (nur https oder localhost) und bietet neue Versionen an; Fehler werden verschluckt.
 * Ein Update wartet im SW, bis der Nutzer „Neu laden“ wählt (nie mitten in einer Runde) – Ablauf in features/pwa-update.ts.
 */
export function registerSW(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    const { protocol, hostname } = location;
    const ok = protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!ok) return;
    const p = (): void => { navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      // lazy: Toast und i18n brauchen das DOM (diese Datei wird auch in Node-Tests geladen)
      const [{ t }, { toast }] = await Promise.all([import('../i18n/index.ts'), import('../ui/toast.ts')]);
      watchUpdates(reg, t, toast);
    }).catch(() => {}); };
    if (document.readyState === 'complete') p();
    else window.addEventListener('load', p, { once: true });
  } catch { /* ignorieren */ }
}

type Translate = typeof import('../i18n/index.ts').t;
type Toast = typeof import('../ui/toast.ts').toast;

function watchUpdates(reg: ServiceWorkerRegistration, t: Translate, toast: Toast): void {
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

/** Kurze Vibration, wenn das Gerät sie kann. Ohne vorherige Nutzergeste (z. B. Parallel-Stream direkt nach dem Laden)
 * blockiert der Browser vibrate() und meldet einen Fehler – dann still. */
export function webHaptic(ms: number): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch { /* ignorieren */ }
}

export function webSaveFile(name: string, mime: string, text: string): Promise<boolean> {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve(true);
}

/** 'saved': Bild heruntergeladen, weil der Browser keine Dateien teilen kann (shareImage) */
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed' | 'saved';

/** Teilen-Menü des Systems, sonst in die Zwischenablage. */
export async function webShareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared'; } catch { return 'cancelled'; }
  }
  if (!navigator.clipboard) return 'cancelled';
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

/** Datei als Download anbieten (Anker + Objekt-URL wie webSaveFile). */
function downloadBlob(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bild über das Teilen-Menü (Web Share mit Datei), sonst als PNG herunterladen. Kein await vor share():
 * der Aufruf muss noch in der Nutzergeste liegen. Abbruch → 'cancelled'; andere Fehler → Download.
 */
export async function webShareImage(blob: Blob, name: string, text: string): Promise<ShareResult> {
  const data: ShareData = { files: [new File([blob], name, { type: blob.type || 'image/png' })], text };
  if (typeof navigator.share === 'function' && navigator.canShare?.(data) === true) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  return downloadBlob(blob, name) ? 'saved' : 'failed';
}
