import { startRouter } from './router.ts';
import { initTheme } from './ui/theme.ts';
import { startActivityTracker } from './features/activity.ts';
import { registerSW } from './features/pwa.ts';
import { getSettings } from './data/storage.ts';
import { detectLang, setLang } from './i18n/index.ts';
import { restoreAccount } from './features/account.ts';
import { maybeShowWhatsNew } from './features/whats-new.ts';

initTheme(getSettings().theme);
startActivityTracker();
registerSW();
setLang(detectLang(getSettings().lang));
startRouter();
void restoreAccount();
maybeShowWhatsNew();
