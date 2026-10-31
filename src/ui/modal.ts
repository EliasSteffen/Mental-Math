// Dialog (Bestätigung, „Was ist neu?“) als <dialog> mit showModal(): liegt im Top-Layer und ist damit auch über
// einem offenen Sheet bedienbar. Fokusfalle und Esc liefert der Browser; Tipp auf den Scrim schließt. Sperrt wie
// ein Sheet den Seiten-Scroll (gemeinsamer Zähler).
import { h, appendChildren } from './dom.ts';
import { button } from './kit.ts';
import { isSheetOpen } from './sheet.ts';
import { lockScroll } from './scroll-lock.ts';
import { t } from '../i18n/index.ts';

export interface ModalAction { label: string; onClick?: () => void; primary?: boolean; danger?: boolean; closes?: boolean }
export interface ModalOptions { title: string; body: Node | string; actions?: ModalAction[]; onClose?: () => void }

/** Ausblenden (--dur-exit) plus Puffer, danach wird der Dialog geschlossen und entfernt. */
const EXIT_MS = 220;

let openCount = 0;
let uid = 0;

/** True, solange mindestens ein Dialog offen ist (für Shortcuts). */
export function isModalOpen(): boolean { return openCount > 0; }

export function openModal(o: ModalOptions): { close(): void } {
  const id = `modal-${++uid}`;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let state: 'open' | 'closing' | 'closed' = 'open';
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  let unlockScroll: (() => void) | null = null;

  const body = h('div', { class: 'modal-body' });
  appendChildren(body, [o.body]);
  const el = h('dialog', { class: 'modal', 'aria-labelledby': `${id}-t` },
    h('h2', { class: 'modal-title', id: `${id}-t` }, o.title),
    body);

  /** Endgültig aufräumen (einmalig): Scroll freigeben, entfernen, Fokus zurück, onClose. */
  function finish(): void {
    if (state === 'closed') return;
    state = 'closed';
    if (exitTimer !== null) clearTimeout(exitTimer);
    openCount = Math.max(0, openCount - 1);
    unlockScroll?.();
    if (el.open) el.close();
    el.remove();
    if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    o.onClose?.();
  }

  function close(): void {
    if (state !== 'open') return;
    state = 'closing';
    // Während des Ausblendens nichts mehr auslösbar (Klick, Enter, Tab)
    el.inert = true;
    el.classList.add('is-closing');
    exitTimer = setTimeout(finish, EXIT_MS);
  }

  const actions = o.actions ?? [];
  if (actions.length > 0) {
    el.append(h('div', { class: 'modal-actions' }, actions.map((a) => button({
      label: a.label,
      kind: a.danger ? 'soft' : a.primary ? 'primary' : 'quiet',
      tone: a.danger ? 'danger' : undefined,
      cta: false,
      onClick: () => {
        if (state !== 'open') return; // Ausblendphase: z. B. zweiter Tipp auf „Löschen“
        a.onClick?.();
        if (a.closes !== false) close();
      },
    }))));
  }

  // Esc: animiert schließen statt sofort; schließt der Browser trotzdem, räumt 'close' auf
  el.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  el.addEventListener('close', finish);
  // Tipp auf den Scrim: Klick auf den Dialog selbst außerhalb seines Rechtecks
  el.addEventListener('click', (e) => {
    if (e.target !== el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });

  openCount += 1;
  unlockScroll = lockScroll();
  document.body.append(el);
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');
  return { close };
}

export function confirmDialog(
  text: string,
  o: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let result = false;
    openModal({
      title: o.title ?? t('settings.areYouSure'),
      body: h('p', null, text),
      actions: [
        { label: o.cancelLabel ?? t('settings.cancel') },
        { label: o.confirmLabel ?? t('settings.ok'), primary: !o.danger, danger: o.danger === true, onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/**
 * Ergebnis-Shortcuts der Spielmodi: Enter = Nochmal, Esc = Übersicht (nicht bei offenem Dialog/Sheet, nicht in
 * Eingabefeldern und nicht auf Buttons oder Links – dort löst Enter das Element selbst aus). Gibt die Aufräumfunktion zurück.
 */
export function bindResultKeys(onAgain: () => void, onOverview: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (isModalOpen() || isSheetOpen() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Enter') {
      if (target instanceof Element && target.closest('a, summary, button')) return;
      e.preventDefault(); onAgain();
    } else if (e.key === 'Escape') { e.preventDefault(); onOverview(); }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
