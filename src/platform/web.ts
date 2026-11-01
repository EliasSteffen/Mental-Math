// Website/PWA: Browser-APIs der Plattform-Schicht (Service Worker, Vibration, Download, Web Share).

/** Registriert den Service Worker (nur https oder localhost); Fehler werden verschluckt. */
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

export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'failed';

/** Teilen-Menü des Systems, sonst in die Zwischenablage. */
export async function webShareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ text }); return 'shared'; } catch { return 'cancelled'; }
  }
  if (!navigator.clipboard) return 'cancelled';
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
