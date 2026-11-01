// Plattform-Schicht: die einzige Stelle, an der sich Website (Browser/PWA) und iOS-App (Capacitor) unterscheiden.
// Feature-Code ruft nur diese Funktionen auf; tests/platform-guard.test.ts verbietet Web-only-APIs außerhalb von src/platform/.
import { PUBLIC_CONFIG } from '../generated/public-config.ts';
import type { PasskeyAuthOptions } from '../vendor/auth.ts';
import { appStorePlugin, loadNative, nativeIfLoaded, onNativeResume, startNative } from './native.ts';
import { storeVersionOf } from '../features/app-update.ts';
import { registerSW, webHaptic, webSaveFile, webShareText } from './web.ts';
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

/* ---------- App Store (nur iOS) ---------- */

/** Apple-ID der App im App Store */
export const APP_STORE_ID = '6829427727';
/** App-Seite im App Store (Website: Verweis auf die iOS-App) */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
/** Bundle-ID der iOS-App (appId in capacitor.config.json) */
export const APP_BUNDLE_ID = 'de.eliassteffen.mentalmath';

/** Systemdialog „App bewerten“ anfragen; ob er erscheint, entscheidet iOS. true = angefragt. */
export async function requestStoreReview(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const p = await appStorePlugin();
    return (await p.requestReview()).requested === true;
  } catch {
    return false;
  }
}

/** App-Seite im App Store öffnen, mit writeReview gleich „Bewertung schreiben“. */
export async function openStorePage(writeReview: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const p = await appStorePlugin();
    await p.openStorePage({ appId: APP_STORE_ID, writeReview });
  } catch { /* kein App Store (z. B. Simulator) */ }
}

/** Aktuelle Version im App Store oder null (noch nicht veröffentlicht, offline, Fehler); wirft nie. Natives HTTP: ohne CORS. */
export async function fetchStoreVersion(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const m = await loadNative();
    const res = await m.CapacitorHttp.get({
      url: `https://itunes.apple.com/lookup?bundleId=${APP_BUNDLE_ID}&country=de&t=${Date.now()}`,
      connectTimeout: 10_000,
      readTimeout: 10_000,
    });
    return res.status === 200 ? storeVersionOf(res.data) : null;
  } catch {
    return null;
  }
}

/** App kommt zurück in den Vordergrund (nur iOS; die Website prüft beim Sichtbarwerden selbst). */
export function onAppResume(fn: () => void): void {
  if (isNative()) onNativeResume(fn);
}
