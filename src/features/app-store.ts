// App Store in der iOS-App: Hinweis auf eine neue Version (app-update.ts) und die Bitte um eine Bewertung
// (review-prompt.ts). Auf der Website ohne Wirkung – dort meldet der Service Worker neue Versionen.
import { BUILD_INFO } from '../generated/build-info.ts';
import { getSessions, getSettings, setDeviceSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { toast } from '../ui/toast.ts';
import { fetchStoreVersion, isNative, onAppResume, openStorePage, requestStoreReview } from '../platform/index.ts';
import { createStoreUpdateFlow } from './app-update.ts';
import { REVIEW_DELAY_MS, shouldAskForReview, type ReviewRound } from './review-prompt.ts';

/** Einmal beim Start: gedrosselt im App Store nach einer neuen Version fragen, erneut bei jeder Rückkehr in die App. */
export function startAppUpdateCheck(): void {
  if (!isNative()) return;
  const flow = createStoreUpdateFlow({
    now: () => Date.now(),
    hash: () => location.hash,
    current: BUILD_INFO.version,
    load: () => getSettings(),
    save: (p) => { setDeviceSettings(p); },
    fetchVersion: fetchStoreVersion,
    showHint: (onUpdate) => toast(t('common.storeUpdate'), {
      durationMs: 0, action: { label: t('common.storeUpdateAction'), onClick: onUpdate },
    }),
    openStore: () => { void openStorePage(false); },
  });
  window.addEventListener('hashchange', () => flow.routeChanged());
  onAppResume(() => { void flow.check(); });
  void flow.check();
}

/**
 * Nach dem Ergebnis einer Runde um eine Bewertung bitten (nur iOS), wenn review-prompt.ts es erlaubt. Wartet kurz, damit
 * zuerst das Ergebnis zu sehen ist; ein Routenwechsel oder die gelieferte Funktion (Aufräumen der View) bricht ab.
 */
export function maybeAskForReview(round: ReviewRound): () => void {
  if (!isNative()) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => {
    clearTimeout(timer);
    window.removeEventListener('hashchange', cancel);
  };
  window.addEventListener('hashchange', cancel);
  timer = setTimeout(() => {
    cancel();
    // Nicht über einen offenen Dialog bzw. im Hintergrund
    if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
    const s = getSettings();
    const now = Date.now();
    const version = BUILD_INFO.version;
    if (!shouldAskForReview({ sessions: getSessions(), now, round, askedVersion: s.reviewAskedVersion, askedAt: s.reviewAskedAt, version })) return;
    setDeviceSettings({ reviewAskedVersion: version, reviewAskedAt: now });
    void requestStoreReview();
  }, REVIEW_DELAY_MS);
  return cancel;
}
