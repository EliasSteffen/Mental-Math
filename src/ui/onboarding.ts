// Einführung (Schritte in features/onboarding.ts) als Schritt-Dialog: <dialog> mit showModal() wie ui/modal.ts –
// Fokusfalle liefert der Browser, Esc bzw. die Zurück-Geste überspringen, ←/→ blättern, Wisch auf Touch.
// Zählt bei isModalOpen() mit und sperrt den Seiten-Scroll. Die Höhe richtet sich nach dem längsten Schritt
// (unsichtbare Platzhalter im selben Grid-Feld), damit Knöpfe beim Blättern nicht springen.
import { h } from './dom.ts';
import { button, icon, setButtonLabel, type IconName } from './kit.ts';
import { lockScroll } from './scroll-lock.ts';
import { openModal, trackModal } from './modal.ts';
import { t } from '../i18n/index.ts';
import { ONBOARDING_STEPS, stepForKey, swipeStep, type OnboardingStep } from '../features/onboarding.ts';
import { getSettings, setSettings } from '../data/storage.ts';
import { accountEnabled, getAccountState } from '../features/account.ts';

/** Ausblenden (--dur-exit) plus Puffer, danach wird der Dialog geschlossen und entfernt. */
const EXIT_MS = 220;

export type OnboardingEnd = 'done' | 'skip';

export interface OnboardingOptions {
  /** Zusatzknopf im Schritt „Profil“ (Konto); läuft nach dem Schließen. Ohne = kein Knopf. */
  account?: { label: string; icon?: IconName; onClick: () => void } | null;
  /** Einstufungstest als letzter Schritt („Test starten“ / „Später“); läuft nach dem Schließen. Ohne = Schritt entfällt. */
  placement?: { onStart: () => void } | null;
  /** Läuft genau einmal: 'done' = „Los geht’s“ bzw. Konto, 'skip' = Überspringen, Esc, Zurück-Geste */
  onClose?: (end: OnboardingEnd) => void;
}

let uid = 0;
let active: { close(end: OnboardingEnd): void } | null = null;

/** Inhalt eines Schritts (`extra`: Konto-Knopf im letzten Schritt); ohne `ids` als Platzhalter für die Höhe. */
function panelContent(step: OnboardingStep, index: number, total: number, extra: Node | null, ids?: { title: string; text: string }): Node[] {
  return [
    h('span', { class: 'sr-only' }, t('onboarding.stepOf', { n: index + 1, total })),
    h('span', { class: 'onboard-icon', 'aria-hidden': 'true' }, icon(step.icon, 32)),
    h('h2', { class: 'onboard-title', id: ids?.title }, t(step.titleKey)),
    h('p', { class: 'onboard-text', id: ids?.text }, t(step.textKey)),
    ...(extra ? [extra] : []),
  ];
}

/** Öffnet die Einführung (höchstens eine zugleich). */
export function openOnboarding(o: OnboardingOptions = {}): { close(): void } {
  if (active) return { close: () => active?.close('skip') };
  const id = `onboard-${++uid}`;
  const ids = { title: `${id}-t`, text: `${id}-d` };
  const steps = o.placement ? ONBOARDING_STEPS : ONBOARDING_STEPS.filter((s) => s.id !== 'placement');
  const lastIndex = steps.length - 1;
  const placement = o.placement ?? null;
  const accountIndex = steps.findIndex((s) => s.id === 'profile');
  /** Letzter Schritt ist das Angebot des Einstufungstests: „Test starten“ statt „Los geht’s“, „Später“ statt „Überspringen“ */
  const offersTest = placement !== null && steps[lastIndex]?.id === 'placement';
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let index = 0;
  let state: 'open' | 'closing' | 'closed' = 'open';
  let end: OnboardingEnd = 'skip';
  let after: (() => void) | null = null;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;

  const acct = o.account ?? null;
  const accountButton = (onClick?: () => void): HTMLButtonElement =>
    button({ label: acct?.label ?? '', icon: acct?.icon ?? 'key', kind: 'soft', full: true, cta: false, onClick });
  const accountBtn = acct ? accountButton(() => {
    if (state !== 'open') return;
    after = acct.onClick;
    close('done');
  }) : null;

  // Sichtbarer Schritt als Live-Region (Screenreader lesen den neuen Schritt beim Blättern vor); darunter im selben
  // Grid-Feld alle Schritte unsichtbar, damit die Höhe der des längsten entspricht
  const live = h('div', { class: 'onboard-panel is-live', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const ghosts = steps.map((s, i) => {
    const extra = i === accountIndex && acct ? accountButton() : null;
    extra?.setAttribute('tabindex', '-1');
    return h('div', { class: 'onboard-panel is-ghost', 'aria-hidden': 'true' }, ...panelContent(s, i, steps.length, extra));
  });
  const stage = h('div', { class: 'onboard-stage' }, ...ghosts, live);

  const skipBtn = button({ label: t('onboarding.skip'), kind: 'quiet', onClick: () => close('skip') });
  const backBtn = button({ label: t('onboarding.back'), kind: 'quiet', icon: 'chevron-left', onClick: () => show(index - 1) });
  const nextBtn = button({ label: t('onboarding.next'), kind: 'primary', cta: false, onClick: () => {
    if (index < lastIndex) show(index + 1);
    else {
      if (offersTest && placement) after = placement.onStart;
      close('done');
    }
  } });
  const dots = h('div', { class: 'onboard-dots', 'aria-hidden': 'true' }, ...steps.map(() => h('span', { class: 'onboard-dot' })));

  const el = h('dialog', { class: 'modal onboard', 'aria-labelledby': ids.title, 'aria-describedby': ids.text },
    h('div', { class: 'onboard-head' }, skipBtn),
    stage,
    dots,
    h('div', { class: 'onboard-actions' }, backBtn, nextBtn));

  /** Schritt i zeigen; blendet aus der Blätter-Richtung ein (erster Aufruf ohne Animation). */
  function show(i: number): void {
    if (state !== 'open' || i < 0 || i > lastIndex) return;
    const dir = Math.sign(i - index);
    index = i;
    const step = steps[i];
    if (!step) return;
    live.replaceChildren(...panelContent(step, i, steps.length, i === accountIndex ? accountBtn : null, ids));
    live.classList.remove('is-fwd', 'is-back');
    if (dir !== 0) {
      void live.offsetWidth; // Animation neu starten
      live.classList.add(dir > 0 ? 'is-fwd' : 'is-back');
    }
    dots.querySelectorAll('.onboard-dot').forEach((d, k) => d.classList.toggle('is-active', k === i));
    backBtn.hidden = i === 0;
    const last = i === lastIndex;
    // Beim Test-Angebot bleibt oben „Später“ (schließt ohne Test); sonst entfällt „Überspringen“ am Ende
    skipBtn.hidden = last && !offersTest;
    setButtonLabel(skipBtn, t(last && offersTest ? 'onboarding.later' : 'onboarding.skip'));
    setButtonLabel(nextBtn, t(last ? (offersTest ? 'onboarding.placementStart' : 'onboarding.done') : 'onboarding.next'));
    // Fokus auf einem nun versteckten Knopf (Zurück auf Schritt 1, Überspringen am Ende) → Weiter
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !el.contains(focused) || focused.closest('[hidden]')) nextBtn.focus({ preventScroll: true });
  }

  const releaseModal = trackModal();
  const unlockScroll = lockScroll();

  /** Endgültig aufräumen (einmalig): Zählung und Scroll freigeben, entfernen, Fokus zurück, onClose, dann Folgeaktion. */
  function finish(): void {
    if (state === 'closed') return;
    state = 'closed';
    active = null;
    if (exitTimer !== null) clearTimeout(exitTimer);
    releaseModal();
    unlockScroll();
    if (el.open) el.close();
    el.remove();
    if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    o.onClose?.(end);
    after?.();
  }

  function close(how: OnboardingEnd): void {
    if (state !== 'open') return;
    state = 'closing';
    end = how;
    el.inert = true; // während des Ausblendens nichts mehr auslösbar
    el.classList.add('is-closing');
    exitTimer = setTimeout(finish, EXIT_MS);
  }

  // Esc/Zurück-Geste: animiert überspringen; schließt der Browser trotzdem, räumt 'close' auf
  el.addEventListener('cancel', (e) => { e.preventDefault(); close('skip'); });
  el.addEventListener('close', finish);
  el.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const next = stepForKey(e.key, index, steps.length);
    if (next === null) return;
    e.preventDefault();
    show(next);
  });

  // Waagerechter Wisch (Touch/Stift) über dem Inhalt; senkrecht scrollt der Inhalt weiter (touch-action: pan-y)
  let start: { x: number; y: number; id: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const d = swipeStep(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (d !== 0) show(index + d);
  });
  stage.addEventListener('pointercancel', () => { start = null; });

  show(0);
  document.body.append(el);
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');
  nextBtn.focus({ preventScroll: true });

  active = { close };
  return { close: () => close('skip') };
}

/** Nach dem Rundgang: Einstufungstest, Konto oder direkt loslegen (läuft nach dem Schließen, auf den echten Daten). */
function showTourEnd(onAccount?: () => void, onPlacement?: () => void): void {
  let next: (() => void) | null = null;
  const st = getAccountState();
  const offerAccount = onAccount && accountEnabled() && st.status !== 'disabled' && st.status !== 'signed-in';
  openModal({
    title: t('tour.endTitle'),
    body: t('tour.endText'),
    actions: [
      { label: t('tour.endLater'), primary: !onPlacement },
      ...(offerAccount ? [{ label: t('onboarding.createAccount'), onClick: () => { next = onAccount; } }] : []),
      ...(onPlacement ? [{ label: t('onboarding.placementStart'), primary: true, onClick: () => { next = onPlacement; } }] : []),
    ],
    onClose: () => { next?.(); },
  });
}

/**
 * Erster Start: Begrüßung mit dem Angebot des Rundgangs. Als gesehen gilt sie erst nach einer Wahl: „Selbst entdecken“
 * oder der Rundgang selbst (dann wieder auf den echten Daten). Esc oder Tipp daneben zählt nicht – die Begrüßung kommt
 * dann beim nächsten Start wieder. Scheitert der Rundgang, übernimmt die Einführung als Dialog.
 */
export function showWelcome(onAccount?: () => void, onPlacement?: () => void): void {
  const remember = (): void => { if (!getSettings().onboardingDone) setSettings({ onboardingDone: true }); };
  let start = false;
  let later = false;
  openModal({
    title: t('tour.welcomeTitle'),
    body: t('tour.welcomeText'),
    actions: [
      { label: t('tour.welcomeLater'), onClick: () => { later = true; } },
      { label: t('tour.welcomeStart'), primary: true, onClick: () => { start = true; } },
    ],
    onClose: () => {
      if (!start) { if (later) remember(); return; }
      void import('../features/tour.ts').then((m) => {
        m.startTour('intro', {
          onEnd: (end) => {
            remember();
            if (end === 'done') showTourEnd(onAccount, onPlacement);
            else if (end === 'error') showOnboarding(onAccount, onPlacement);
          },
        });
      });
    },
  });
}

/**
 * Einführung zeigen und als gesehen merken – beim Abschließen wie beim Überspringen (geräte-lokal).
 * `onAccount` öffnet das Konto (Profil + Konto-Sheet); ohne Konto-Funktion entfällt der Knopf.
 * `onPlacement` startet den Einstufungstest (letzter Schritt); ohne entfällt der Schritt.
 */
export function showOnboarding(onAccount?: () => void, onPlacement?: () => void): void {
  const st = getAccountState();
  const account = onAccount && accountEnabled() && st.status !== 'disabled'
    ? { label: t(st.status === 'signed-out' ? 'onboarding.createAccount' : 'onboarding.openAccount'), onClick: onAccount }
    : null;
  openOnboarding({
    account,
    placement: onPlacement ? { onStart: onPlacement } : null,
    onClose: () => { if (!getSettings().onboardingDone) setSettings({ onboardingDone: true }); },
  });
}
