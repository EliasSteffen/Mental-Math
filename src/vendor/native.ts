// Vendor-Einstieg der iOS-App: Capacitor-Kern und offizielle Plugins. Wird von scripts/vendor.ts mit esbuild gebündelt und
// nur in der App geladen (src/platform/native.ts); auf der Website nicht im Precache.
export { Capacitor, registerPlugin } from '@capacitor/core';
export { App } from '@capacitor/app';
export { Browser } from '@capacitor/browser';
export { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
export { Haptics, ImpactStyle } from '@capacitor/haptics';
export { LocalNotifications } from '@capacitor/local-notifications';
export { Share } from '@capacitor/share';
export { StatusBar, Style } from '@capacitor/status-bar';
