// Website auf iPhone und iPad: Dialog „Mental Math gibt’s als App“ mit dem Weg in den App Store (Regeln: core/app-offer.ts).
// Der Router meldet jede gezeichnete Seite (scheduleAppOffer); kurz danach wird geprüft, höchstens einmal je Start gefragt.
// In der iOS-App selbst und auf anderen Geräten ohne Wirkung.
import { isAppleMobile, readAppOffer, shouldOfferApp, writeAppOffer } from '../core/app-offer.ts';
import { getSessions, isDemoData } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { APP_STORE_URL, isNative } from '../platform/index.ts';
import { h } from '../ui/dom.ts';
import { icon, type IconName } from '../ui/kit.ts';
import { isModalOpen, openModal } from '../ui/modal.ts';

/** Erst die Seite in Ruhe zeigen, dann fragen (ms) */
const OFFER_DELAY_MS = 2500;

let armed = false;
let firstRun = false;
let askedThisLaunch = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Stand der zuletzt gezeichneten Seite (der Router zeichnet schon vor armAppOffer) */
let onTabStart = false;

function isAppleDevice(): boolean {
  const nav = globalThis.navigator as Navigator | undefined;
  return nav !== undefined && isAppleMobile({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints });
}

/** Einmal beim Start (app.ts); `firstRun` = dieser Start bringt die Einführung (dann wird nicht gefragt). */
export function armAppOffer(o: { firstRun: boolean }): void {
  if (isNative() || !isAppleDevice()) return;
  armed = true;
  firstRun = o.firstRun;
  scheduleAppOffer(onTabStart);
}

/** Nach jedem Zeichnen einer Seite (router.ts): fragt kurz danach, wenn es jetzt passt; ein neuer Seitenwechsel verwirft. */
export function scheduleAppOffer(tabStart: boolean): void {
  onTabStart = tabStart;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (!armed || askedThisLaunch || !tabStart) return;
  timer = setTimeout(() => {
    timer = null;
    try { maybeOffer(); } catch (e) { console.error('app-offer', e); }
  }, OFFER_DELAY_MS);
}

function maybeOffer(): void {
  if (document.visibilityState !== 'visible') return;
  const state = readAppOffer();
  const now = Date.now();
  const ok = shouldOfferApp({
    state, now, native: isNative(), apple: true, firstRun, tabStart: true,
    rounds: getSessions().filter((s) => s.n > 0).length,
    dialogOpen: isModalOpen() || document.querySelector('dialog[open], .sheet, .nav-hint, .tour-ui, .toast') !== null,
    tourRunning: isDemoData() || document.documentElement.dataset['tour'] !== undefined,
  });
  if (!ok) return;
  askedThisLaunch = true;
  writeAppOffer({ ...state, shown: state.shown + 1, lastAt: now });
  openAppOffer();
}

/** Der Dialog selbst; „Zum App Store“ öffnet die App-Seite und beendet das Fragen auf diesem Gerät. */
export function openAppOffer(): void {
  const perk = (name: IconName, text: string): HTMLElement =>
    h('li', { class: 'app-offer-perk' }, h('span', { class: 'app-offer-perk-icon', 'aria-hidden': 'true' }, icon(name, 18)), h('span', {}, text));
  openModal({
    title: t('common.appOfferTitle'),
    body: h('div', { class: 'app-offer' },
      h('div', { class: 'app-offer-head' },
        h('img', { class: 'app-offer-icon', src: '/icons/apple-touch-icon-180.png', alt: '', width: 56, height: 56 }),
        h('p', { class: 'app-offer-lead' }, t('common.appOfferLead'))),
      h('ul', { class: 'app-offer-perks' },
        perk('bell', t('common.appOfferReminders')),
        perk('sparkles', t('common.appOfferFeel')),
        perk('sync', t('common.appOfferSync')))),
    actions: [
      { label: t('common.appOfferLater') },
      // Link: apps.apple.com öffnet auf iPhone und iPad direkt den App Store
      { label: t('common.appOfferOpen'), primary: true, href: APP_STORE_URL, onClick: () => { writeAppOffer({ ...readAppOffer(), done: true }); } },
    ],
  });
}
