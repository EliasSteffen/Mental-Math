// Karte auf „Heute“ (v10 C): Serie reparieren (Vorrang) oder Willkommen zurück. Freundlich, ohne Vorwurf.
import { COMEBACK_XP, REPAIR_ROUNDS } from '../core/comeback.ts';
import { currentComeback, currentRepairOffer, repairWithXp } from '../features/comeback.ts';
import { xpView } from '../features/xp.ts';
import { h } from '../ui/dom.ts';
import { button, icon } from '../ui/kit.ts';
import { confirmDialog } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';
import { rerender } from '../router.ts';
import { t } from '../i18n/index.ts';

/** Karte oder null (nichts zu zeigen). `playHref` = Ziel von „Runde spielen“ (die Empfehlung). */
export function comebackCard(now: number, playHref: string, todayRounds: number): HTMLElement | null {
  const offer = currentRepairOffer(now);
  if (offer) {
    const canPay = xpView().balance >= offer.xpCost;
    const dots = h('span', { class: 'comeback-dots', 'aria-hidden': 'true' },
      ...Array.from({ length: offer.roundsNeeded }, (_, i) => h('span', { class: `comeback-dot${i < offer.roundsDone ? ' is-on' : ''}` })));
    const repair = (): void => {
      void confirmDialog(t('comeback.repairConfirm', { xp: offer.xpCost.toLocaleString(), lost: offer.lost }), {
        title: t('comeback.repairConfirmTitle'), confirmLabel: t('comeback.repairConfirmYes'),
      }).then((yes) => {
        if (!yes) return;
        const streak = repairWithXp();
        if (streak === false) { toast(t('comeback.repairFailed')); return; }
        toast(t('comeback.repairedToast', { n: streak }));
        rerender({ keepScroll: true });
      });
    };
    return h('section', { class: 'card comeback-card is-repair', 'aria-label': t('comeback.repairTitle') },
      h('div', { class: 'comeback-head' },
        h('span', { class: 'comeback-icon' }, icon('flame', 22)),
        h('h2', { class: 'comeback-title' }, t('comeback.repairTitle'))),
      h('p', { class: 'comeback-text' }, t('comeback.repairText', { lost: offer.lost, rounds: REPAIR_ROUNDS, xp: offer.xpCost.toLocaleString() })),
      h('div', { class: 'comeback-progress' }, dots, h('span', { class: 'num' }, t('comeback.repairProgress', { done: offer.roundsDone, need: offer.roundsNeeded }))),
      h('div', { class: 'comeback-actions' },
        button({ label: t('comeback.repairPlay'), kind: 'primary', href: playHref }),
        canPay ? button({ label: t('comeback.repairXp'), kind: 'outline', onClick: repair }) : null));
  }
  const st = currentComeback(now);
  if (st.eligible && todayRounds === 0) {
    return h('section', { class: 'card comeback-card', 'aria-label': t('comeback.welcomeTitle') },
      h('div', { class: 'comeback-head' },
        h('span', { class: 'comeback-icon' }, icon('sparkles', 22)),
        h('h2', { class: 'comeback-title' }, t('comeback.welcomeTitle'))),
      h('p', { class: 'comeback-text' }, t('comeback.welcomeText', { n: st.away, xp: COMEBACK_XP })),
      h('div', { class: 'comeback-actions' }, button({ label: t('comeback.welcomeGo'), kind: 'primary', href: '#/train/warmup' })));
  }
  return null;
}
