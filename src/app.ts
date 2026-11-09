import { go, startRouter } from './router.ts';
import { initTheme } from './ui/theme.ts';
import { startActivityTracker } from './features/activity.ts';
import { appReady, bootPlatform, startPlatform } from './platform/index.ts';
import { getAttempts, getSettings, initStorage, onChange } from './data/storage.ts';
import { setPlacement } from './core/adaptive.ts';
import { detectLang, setLang } from './i18n/index.ts';
import { restoreAccount, watchAccountRestore } from './features/account.ts';
import { startSync } from './features/sync.ts';
import { watchPending } from './features/challenge.ts';
import { maybeShowWhatsNew } from './features/whats-new.ts';
import { shouldShowOnboarding } from './features/onboarding.ts';
import { showOnboarding } from './ui/onboarding.ts';
import { openAccountOnProfile } from './views/settings.ts';
import { startPush } from './platform/reminders.ts';
import { startAppUpdateCheck } from './features/app-store.ts';
import { watchKeyboardInset } from './ui/keyboard-inset.ts';

// iOS-App: vorgemerktes Live-Update anwenden, bevor etwas gezeichnet wird (docs/PLAN-live-updates.md). Lädt die WebView
// nicht binnen 5 s neu, geht es mit dem laufenden Bundle weiter.
if (await bootPlatform() === 'reload') await new Promise((r) => setTimeout(r, 5_000));

await initStorage();

// Einstufungstest: Startstufen je Aufgabentyp (auch nach Sync von einem anderen Gerät)
setPlacement(getSettings().placement?.theta ?? null);
onChange(() => setPlacement(getSettings().placement?.theta ?? null));

// Einführung nur bei Neuinstallation – vor maybeShowWhatsNew() entscheiden, das dabei lastSeenVersion setzt.
// Beide schließen sich aus: „Was ist neu?“ bleibt bei Neuinstallationen stumm (merkt sich nur die Version).
const { onboardingDone, lastSeenVersion } = getSettings();
const firstRun = shouldShowOnboarding({ onboardingDone, lastSeenVersion, attempts: getAttempts().length });

/** Startschritt ausführen; ein Fehler darf die übrigen Schritte nicht verhindern (sonst bleibt die Seite leer). */
const safely = (label: string, fn: () => unknown): void => {
  try { fn(); } catch (e) { console.error(`start: ${label}`, e); }
};

safely('theme', () => initTheme(getSettings().theme));
safely('keyboard', () => { watchKeyboardInset(); }); // Sheets und Dialoge über der Bildschirmtastatur (iOS)
safely('activity', startActivityTracker);
safely('platform', startPlatform);
safely('lang', () => setLang(detectLang(getSettings().lang)));
safely('router', startRouter); // zeichnet selbst fehlertolerant (Fehlerkarte statt leerer Seite)
safely('account', () => { void restoreAccount(); });
safely('account-watch', () => watchAccountRestore()); // Offline-Kaltstart: Anmeldung wiederherstellen, sobald das Netz zurück ist
safely('challenge', () => watchPending()); // Gewertete Challenge: offene Abgabe senden, sobald angemeldet bzw. wieder online
safely('sync', startSync);
safely('push', startPush);
// Neuinstallation: Einführung, am Ende das Angebot des Einstufungstests
if (firstRun) safely('onboarding', () => showOnboarding(openAccountOnProfile, () => go('#/einstufung')));
safely('whats-new', maybeShowWhatsNew);
safely('app-store', startAppUpdateCheck); // nur iOS: neue Version im App Store
appReady(); // nur iOS: Oberfläche läuft – bestätigt ein Live-Update, sucht nach neuen
