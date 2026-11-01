import { startRouter } from './router.ts';
import { initTheme } from './ui/theme.ts';
import { startActivityTracker } from './features/activity.ts';
import { startPlatform } from './platform/index.ts';
import { getSettings, initStorage } from './data/storage.ts';
import { detectLang, setLang } from './i18n/index.ts';
import { restoreAccount, watchAccountRestore } from './features/account.ts';
import { startSync } from './features/sync.ts';
import { maybeShowWhatsNew } from './features/whats-new.ts';
import { startPush } from './platform/reminders.ts';
import { startAppUpdateCheck } from './features/app-store.ts';

await initStorage();

initTheme(getSettings().theme);
startActivityTracker();
startPlatform();
setLang(detectLang(getSettings().lang));
startRouter();
void restoreAccount();
watchAccountRestore(); // Offline-Kaltstart: Anmeldung wiederherstellen, sobald das Netz zurück ist
startSync();
startPush();
maybeShowWhatsNew();
startAppUpdateCheck(); // nur iOS: neue Version im App Store
