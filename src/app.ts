import { startRouter } from './router.ts';
import { initTheme } from './ui/theme.ts';
import { startActivityTracker } from './features/activity.ts';
import { registerSW } from './features/pwa.ts';
import { getSettings } from './data/storage.ts';

initTheme(getSettings().theme);
startActivityTracker();
registerSW();
startRouter();
