// Erinnerungen mit einer API für beide Plattformen: Web Push auf der Website (der Server plant und sendet), lokale
// Benachrichtigungen in der iOS-App (das Gerät plant). Die Regeln stehen für beide in core/reminders.ts.
import type { ReminderPrefs } from '../core/reminders.ts';
import { isNative } from './index.ts';
import * as local from './native-reminders.ts';
import * as web from './web-push.ts';
import type { EnableResult, PushConfig, PushSupport, TestResult } from './web-push.ts';

export type { EnableResult, PushConfig, PushSupport, TestResult } from './web-push.ts';

export const pushSupport = (): PushSupport => (isNative() ? local.pushSupport() : web.pushSupport());
export const notificationPermission = (): NotificationPermission | 'unsupported' =>
  (isNative() ? local.notificationPermission() : web.notificationPermission());
export const pushConfig = (): Promise<PushConfig> => (isNative() ? local.pushConfig() : web.pushConfig());
export const isPushEnabled = (): boolean => (isNative() ? local.isPushEnabled() : web.isPushEnabled());
export const getPushPrefs = (): ReminderPrefs => (isNative() ? local.getPushPrefs() : web.getPushPrefs());
export const enablePush = (): Promise<EnableResult> => (isNative() ? local.enablePush() : web.enablePush());
export const disablePush = (): Promise<void> => (isNative() ? local.disablePush() : web.disablePush());
export const setPushPrefs = (prefs: ReminderPrefs): void => (isNative() ? local.setPushPrefs(prefs) : web.setPushPrefs(prefs));
export const sendTestPush = (): Promise<TestResult> => (isNative() ? local.sendTestPush() : web.sendTestPush());
export const startPush = (): void => (isNative() ? local.startPush() : web.startPush());
