// Plattform-Schicht: die einzige Stelle, an der sich Website (Browser/PWA) und iOS-App (Capacitor) unterscheiden.
// Feature-Code ruft nur diese Funktionen auf; tests/platform-guard.test.ts verbietet Web-only-APIs außerhalb von src/platform/.
import { PUBLIC_CONFIG } from '../generated/public-config.ts';
import type { PasskeyAuthOptions } from '../vendor/auth.ts';
import { loadNative, nativeIfLoaded, startNative } from './native.ts';
import { registerSW, webHaptic, webSaveFile, webShareImage, webShareText } from './web.ts';
import type { ShareResult } from './web.ts';

export type { ShareResult } from './web.ts';

/** Läuft die App in der iOS-Hülle? */
export function isNative(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.() === true) return true;
  return typeof location !== 'undefined' && location.protocol === 'capacitor:';
}

/** Adresse eines API-Pfads ('/api/…'): relativ auf der Website, absolut in der App. */
export function apiUrl(path: string): string {
  return isNative() ? `${PUBLIC_CONFIG.apiOrigin}${path}` : path;
}

/** Öffentliche Adresse der App, z. B. für geteilte Links. */
export function publicUrl(): string {
  return isNative() ? `${PUBLIC_CONFIG.apiOrigin}/` : `${location.origin}${location.pathname}`;
}

export type HapticKind = 'tap' | 'success' | 'soft';

/** Vibrationsdauer in ms je Art (bewusst kurz, nie ein Muster). */
const HAPTIC_MS: Record<HapticKind, number> = { tap: 8, success: 18, soft: 10 };

/** Kurze Haptik; in der App über die Taptic Engine. Prüft die Einstellung nicht selbst (siehe ui/fx.ts). */
export function haptic(kind: HapticKind): void {
  if (!isNative()) { webHaptic(HAPTIC_MS[kind]); return; }
  const m = nativeIfLoaded();
  if (!m) return;
  void m.Haptics.impact({ style: kind === 'success' ? m.ImpactStyle.Medium : m.ImpactStyle.Light }).catch(() => undefined);
}

/** Datei speichern: Download im Browser, Teilen-Menü („In Dateien sichern“) in der App. false = abgebrochen/fehlgeschlagen. */
export async function saveFile(name: string, mime: string, text: string): Promise<boolean> {
  if (!isNative()) return webSaveFile(name, mime, text);
  try {
    const m = await loadNative();
    const { uri } = await m.Filesystem.writeFile({ path: name, data: text, directory: m.Directory.Cache, encoding: m.Encoding.UTF8 });
    await m.Share.share({ title: name, files: [uri] });
    return true;
  } catch {
    return false;
  }
}

/** Text teilen (Teilen-Menü; im Browser ohne Web Share in die Zwischenablage). */
export async function shareText(text: string): Promise<ShareResult> {
  if (!isNative()) return webShareText(text);
  try {
    const m = await loadNative();
    await m.Share.share({ text });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}

/** Blob → base64 ohne data:-Präfix (Filesystem.writeFile schreibt base64 ohne encoding als Binärdatei). */
function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('FileReader'));
    r.readAsDataURL(blob);
  });
}

/**
 * Bild (PNG) mit Begleittext teilen: im Browser Web Share mit Datei, sonst Download ('saved');
 * in der App über den Cache ins Teilen-Menü wie saveFile („Bild sichern“ braucht NSPhotoLibraryAddUsageDescription).
 */
export async function shareImage(blob: Blob, fileName: string, text: string): Promise<ShareResult> {
  // synchron bis navigator.share(): die Nutzergeste muss noch gelten
  if (!isNative()) return webShareImage(blob, fileName, text);
  let m: Awaited<ReturnType<typeof loadNative>>;
  let uri: string;
  try {
    m = await loadNative();
    ({ uri } = await m.Filesystem.writeFile({ path: fileName, data: await blobBase64(blob), directory: m.Directory.Cache }));
  } catch {
    return 'failed';
  }
  try {
    await m.Share.share({ text, files: [uri] });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}

/** Einmal beim Start: Service Worker auf der Website, App-Einrichtung in iOS. */
export function startPlatform(): void {
  if (isNative()) startNative();
  else registerSW();
}

/** Optionen für den Passkey-Client: Browser-Standard auf der Website, native Passkeys + Keychain in der App. */
export async function authOptions(): Promise<PasskeyAuthOptions> {
  if (!isNative()) return {};
  const m = await import('./native-auth.ts');
  return m.nativeAuthOptions();
}
