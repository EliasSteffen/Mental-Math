import { startRouter } from './router.js';
import { initTheme } from './theme.js';
import { startActivityTracker } from './activity.js';
import { registerSW } from './pwa.js';
import { getSettings } from './storage.js';

initTheme(getSettings().theme);
startActivityTracker();
registerSW();
startRouter();
