// Sheets (Ruhiger Fokus): inline im Training (ersetzt das Dock an Ort und Stelle) und modal als <dialog>.
// Modal: showModal() liefert Fokusfalle und Esc; dazu Scrim (::backdrop), Griff, Wisch nach unten ab 80 px,
// ✕-Button, Tipp auf den Scrim, Sperre des Seiten-Scrolls und Rückfokus auf das auslösende Element.
import { appendChildren, h, type Child } from './dom.ts';
import { icon } from './kit.ts';
import { lockScroll } from './scroll-lock.ts';
import { t } from '../i18n/index.ts';

/** Ab dieser Zugstrecke (px) schließt das Sheet beim Loslassen. */
const SWIPE_CLOSE_PX = 80;
/** Ausblenden (--dur-exit 200 ms) plus Puffer, danach wird der Dialog geschlossen und entfernt. */
const EXIT_MS = 220;

let uid = 0;
let openCount = 0;

/** True, solange ein modales Sheet offen ist (für Tastatur-Shortcuts, analog zu isModalOpen). */
export function isSheetOpen(): boolean { return openCount > 0; }

/** Inline-Sheet: ersetzt ein Dock an Ort und Stelle (Training). Einblenden mit sheet-in (320 ms). */
export function inlineSheet(o: { label: string; children: Child[] }): HTMLElement {
  const el = h('section', { class: 'sheet', role: 'dialog', 'aria-label': o.label },
    h('span', { class: 'sheet-grip', 'aria-hidden': 'true' }));
  appendChildren(el, o.children);
  return el;
}

export interface SheetHandle { el: HTMLDialogElement; close(): void }

export interface SheetOptions {
  title: string;
  children: Child[];
  /** Läuft genau einmal, egal auf welchem Weg geschlossen wurde (auch bei Routenwechsel). */
  onClose?: () => void;
}

/** Modales Bottom Sheet (ab 768 px zentrierter Dialog). Schließt auch bei einem Routenwechsel. */
export function openSheet(o: SheetOptions): SheetHandle {
  const id = `sheet-${++uid}`;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const closeBtn = h('button', {
    type: 'button', class: 'sheet-close press', 'aria-label': t('common.close'), onclick: () => close(),
  }, icon('close', 22));
  const head = h('div', { class: 'sheet-head' },
    h('span', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-bar' }, h('h2', { class: 'sheet-title', id: `${id}-t` }, o.title), closeBtn));
  const body = h('div', { class: 'sheet-body' });
  appendChildren(body, o.children);
  const el = h('dialog', { class: 'sheet is-modal', 'aria-labelledby': `${id}-t` }, head, body);

  let state: 'open' | 'closing' | 'closed' = 'open';
  let exitTimer: ReturnType<typeof setTimeout> | null = null;
  let unlockScroll: (() => void) | null = null;

  /** Endgültig aufräumen (einmalig): Scroll freigeben, entfernen, Fokus zurück, onClose. */
  function finish(): void {
    if (state === 'closed') return;
    state = 'closed';
    if (exitTimer !== null) clearTimeout(exitTimer);
    window.removeEventListener('hashchange', onRoute);
    openCount = Math.max(0, openCount - 1);
    unlockScroll?.();
    if (el.open) el.close();
    el.remove();
    if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    o.onClose?.();
  }

  /** Animiert schließen; `swiped`: nach dem Wischen weiter nach unten gleiten statt sheet-out. */
  function close(swiped = false): void {
    if (state !== 'open') return;
    state = 'closing';
    el.classList.remove('is-dragging');
    if (swiped) {
      el.classList.add('is-swiped');
      el.style.setProperty('--drag', '100%');
    }
    el.classList.add('is-closing');
    exitTimer = setTimeout(finish, EXIT_MS);
  }

  function onRoute(): void { finish(); }

  // Esc: der Browser würde sofort schließen – stattdessen animiert. Schließt er trotzdem, räumt 'close' auf.
  el.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  el.addEventListener('close', finish);

  // Tipp auf den Scrim: Klick auf den Dialog selbst außerhalb seines Rechtecks (Start und Ende draußen)
  const outside = (e: MouseEvent): boolean => {
    if (e.target !== el) return false;
    const r = el.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let downOutside = false;
  el.addEventListener('pointerdown', (e) => { downOutside = outside(e); });
  el.addEventListener('click', (e) => {
    if (downOutside && outside(e)) close();
    downOutside = false;
  });

  // Wisch nach unten am Griff/Titel (touch-action: none in layout.css)
  let startY: number | null = null;
  let dy = 0;
  head.addEventListener('pointerdown', (e) => {
    if (state !== 'open' || e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
    startY = e.clientY;
    dy = 0;
    try { head.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
    el.classList.add('is-dragging');
  });
  head.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    el.style.setProperty('--drag', `${dy}px`);
  });
  const endDrag = (): void => {
    if (startY === null) return;
    startY = null;
    if (dy >= SWIPE_CLOSE_PX) { close(true); return; }
    el.classList.remove('is-dragging');
    el.style.setProperty('--drag', '0px');
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  window.addEventListener('hashchange', onRoute);
  openCount += 1;
  unlockScroll = lockScroll();
  document.body.append(el);
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');

  return { el, close: () => close() };
}
