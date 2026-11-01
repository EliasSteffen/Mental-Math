import { startRouter } from './router.ts';
import { initTheme } from './ui/theme.ts';
import { startActivityTracker } from './features/activity.ts';
import { startPlatform } from './platform/index.ts';
import { getAttempts, getSettings, initStorage } from './data/storage.ts';
import { detectLang, setLang } from './i18n/index.ts';
import { restoreAccount, watchAccountRestore } from './features/account.ts';
import { startSync } from './features/sync.ts';
import { maybeShowWhatsNew } from './features/whats-new.ts';
import { shouldShowOnboarding } from './features/onboarding.ts';
import { showOnboarding } from './ui/onboarding.ts';
import { openAccountOnProfile } from './views/settings.ts';
import { startPush } from './platform/reminders.ts';
import { startAppUpdateCheck } from './features/app-store.ts';

await initStorage();

// Einführung nur bei Neuinstallation – vor maybeShowWhatsNew() entscheiden, das dabei lastSeenVersion setzt.
// Beide schließen sich aus: „Was ist neu?“ bleibt bei Neuinstallationen stumm (merkt sich nur die Version).
const { onboardingDone, lastSeenVersion } = getSettings();
const firstRun = shouldShowOnboarding({ onboardingDone, lastSeenVersion, attempts: getAttempts().length });

initTheme(getSettings().theme);
startActivityTracker();
startPlatform();
setLang(detectLang(getSettings().lang));
startRouter();
void restoreAccount();
watchAccountRestore(); // Offline-Kaltstart: Anmeldung wiederherstellen, sobald das Netz zurück ist
startSync();
startPush();
if (firstRun) showOnboarding(openAccountOnProfile);
maybeShowWhatsNew();
startAppUpdateCheck(); // nur iOS: neue Version im App Store
