import { startRouter } from "./router.js";
import { initTheme } from "./ui/theme.js";
import { startActivityTracker } from "./features/activity.js";
import { registerSW } from "./features/pwa.js";
import { getSettings } from "./data/storage.js";
initTheme(getSettings().theme);
startActivityTracker();
registerSW();
startRouter();
