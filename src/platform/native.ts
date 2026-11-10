// iOS-App (Capacitor): lädt die Plugins bei Bedarf und richtet die App beim Start ein – externe Links im In-App-Browser,
// Statusleiste passend zum Theme, kein Zoom, Antippen einer Erinnerung öffnet die passende Seite.
type NativeModule = typeof import('../vendor/native.ts');

let mod: NativeModule | null = null;
let loading: Promise<NativeModule> | null = null;

/** Plugins, einmal geladen. */
export function loadNative(): Promise<NativeModule> {
  loading ??= import('../vendor/native.ts').then((m) => (mod = m));
  return loading;
}

/** Schon geladene Plugins oder null – für synchrone Aufrufe wie die Haptik. */
export function nativeIfLoaded(): NativeModule | null {
  return mod;
}

/** Eigenes Plugin der App (ios/App/App/NativeAuthPlugin.swift); alle Binärwerte als base64url. */
export interface NativeAuthPlugin {
  create(o: { rpId: string; challenge: string; userId: string; userName: string; exclude: string[] }):
    Promise<{ id: string; clientDataJSON: string; attestationObject: string }>;
  get(o: { rpId: string; challenge: string; allow: string[] }):
    Promise<{ id: string; clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string | null }>;
  /** Keychain (nur dieses Gerät, nach dem ersten Entsperren) */
  secureGet(o: { key: string }): Promise<{ value: string | null }>;
  secureSet(o: { key: string; value: string | null }): Promise<void>;
}

let authPlugin: NativeAuthPlugin | null = null;

/** NativeAuth als schlichtes Objekt: Capacitors Plugin-Proxy beantwortet jede Eigenschaft, auch `then`. Liefert ein
 *  Promise den Proxy selbst, hält await ihn für ein Promise und wartet ewig (kein Passkey-Dialog, keine Meldung). */
export async function nativeAuthPlugin(): Promise<NativeAuthPlugin> {
  const m = await loadNative();
  if (!authPlugin) {
    const p = m.registerPlugin<NativeAuthPlugin>('NativeAuth');
    authPlugin = {
      create: (o) => p.create(o),
      get: (o) => p.get(o),
      secureGet: (o) => p.secureGet(o),
      secureSet: (o) => p.secureSet(o),
    };
  }
  return authPlugin;
}

/** Eigenes Plugin der App (ios/App/App/AppStorePlugin.swift): Bewertungsdialog und App-Store-Seite. */
export interface AppStorePlugin {
  /** requested: Dialog angefragt – ob er erscheint, entscheidet iOS. */
  requestReview(): Promise<{ requested: boolean }>;
  /** appId: nur Ziffern; writeReview öffnet gleich „Bewertung schreiben“. */
  openStorePage(o: { appId: string; writeReview: boolean }): Promise<void>;
}

let storePlugin: AppStorePlugin | null = null;

/** AppStore als schlichtes Objekt (Proxy-`then`, siehe nativeAuthPlugin). */
export async function appStorePlugin(): Promise<AppStorePlugin> {
  const m = await loadNative();
  if (!storePlugin) {
    const p = m.registerPlugin<AppStorePlugin>('AppStore');
    storePlugin = {
      requestReview: () => p.requestReview(),
      openStorePage: (o) => p.openStorePage(o),
    };
  }
  return storePlugin;
}

/** Antwort von LiveUpdate.info(); running/null: eingebautes Bundle, sonst Ordnername (Bundle-ID). */
export interface LiveUpdateInfo {
  /** CFBundleShortVersionString des Binarys */
  nativeVersion: string;
  nativeBuild: string;
  /** TestFlight-Installation (Sandbox-Beleg) */
  testFlight: boolean;
  running: string | null;
  /** vom Wächter bzw. Startschutz verworfene Bundles */
  failed: string[];
}

/** Eigenes Plugin der App (ios/App/App/LiveUpdatePlugin.swift): Bundle umschalten, Wächter, Startschutz. */
export interface LiveUpdatePlugin {
  info(): Promise<LiveUpdateInfo>;
  /** Bundle probeweise laden (nicht gespeichert); ohne ready() binnen timeoutMs zurück zum vorherigen. */
  trial(o: { id: string; timeoutMs: number }): Promise<void>;
  /** Oberfläche läuft: Wächter aus; ein geladenes Bundle wird zum Startbundle. */
  ready(): Promise<{ running: string | null }>;
  /** zurück zum eingebauten Bundle (lädt neu) */
  reset(): Promise<void>;
}

let livePlugin: LiveUpdatePlugin | null = null;

/** LiveUpdate als schlichtes Objekt (Proxy-`then`, siehe nativeAuthPlugin). */
export async function liveUpdatePlugin(): Promise<LiveUpdatePlugin> {
  const m = await loadNative();
  if (!livePlugin) {
    const p = m.registerPlugin<LiveUpdatePlugin>('LiveUpdate');
    livePlugin = {
      info: () => p.info(),
      trial: (o) => p.trial(o),
      ready: () => p.ready(),
      reset: () => p.reset(),
    };
  }
  return livePlugin;
}

/** App kommt zurück in den Vordergrund (Capacitor App „resume“). */
export function onNativeResume(fn: () => void): void {
  void loadNative().then((m) => m.App.addListener('resume', fn)).catch(() => undefined);
}

/** Statusleiste: helle Schrift auf dunklen Themes, dunkle auf Papier (theme.ts setzt color-scheme). */
function syncStatusBar(m: NativeModule): void {
  const scheme = document.querySelector('meta[name="color-scheme"]')?.getAttribute('content');
  void m.StatusBar.setStyle({ style: scheme === 'light' ? m.Style.Light : m.Style.Dark }).catch(() => undefined);
}

/** Ab dieser Scroll-Position (px) liegt Inhalt unter der Statusleiste. */
const SCROLLED_PX = 8;

/** Schleier hinter der Statusleiste nur, solange Inhalt darunter liegt (html.is-scrolled, base.css). */
function trackScrolled(): void {
  const sync = (): void => { document.documentElement.classList.toggle('is-scrolled', window.scrollY > SCROLLED_PX); };
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

/** Erinnerung angetippt: Hash-Route aus extra.url ('/#/train/review') öffnen. */
function openRoute(extra: unknown): void {
  const url = (extra as { url?: unknown } | null)?.url;
  if (typeof url !== 'string') return;
  const hash = url.slice(url.indexOf('#'));
  if (hash.startsWith('#/')) location.hash = hash;
}

/** Externe Links (http/https) im In-App-Browser statt in der WebView; interne Hash-Links bleiben unberührt. */
function onLinkClick(e: MouseEvent): void {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!(a instanceof HTMLAnchorElement)) return;
  let url: URL;
  try { url = new URL(a.href); } catch { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  e.preventDefault();
  void loadNative().then((m) => m.Browser.open({ url: url.href })).catch(() => undefined);
}

export function startNative(): void {
  document.documentElement.classList.add('is-native');
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  document.addEventListener('click', onLinkClick, true);
  trackScrolled();
  void loadNative().then((m) => {
    syncStatusBar(m);
    new MutationObserver(() => syncStatusBar(m)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    void m.LocalNotifications.addListener('localNotificationActionPerformed', (a) => openRoute(a.notification.extra));
  }).catch(() => undefined);
}
