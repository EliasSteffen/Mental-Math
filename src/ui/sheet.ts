// Sheets (Ruhiger Fokus): inline im Training (ersetzt das Dock an Ort und Stelle) und modal als <dialog>.
// Modal: showModal() liefert Fokusfalle und Esc; dazu Scrim (::backdrop), Griff, Wisch nach unten ab 80 px
// (per Touch auf dem ganzen Sheet), ✕-Button, Tipp auf den Scrim, Sperre des Seiten-Scrolls und Rückfokus auf das
// auslösende Element.
import { appendChildren, h, type Child } from './dom.ts';
import { icon } from './kit.ts';
import { lockScroll } from './scroll-lock.ts';
import { pullIntent } from './sheet-gesture.ts';
import { t } from '../i18n/index.ts';

/** Ab dieser Zugstrecke (px) schließt das Sheet beim Loslassen. */
const SWIPE_CLOSE_PX = 80;
/** Ausblenden (--dur-exit 200 ms) plus Puffer, danach wird der Dialog geschlossen und entfernt. */
const EXIT_MS = 220;
/** Bis zu dieser Zugstrecke (px) gilt die Bewegung noch als Tippen; der Klick darf durch. */
const TAP_SLOP_PX = 10;
/** In Eingaben gehört ein Wisch dem Cursor und der Auswahl, nicht dem Sheet. */
const NO_PULL = 'input, textarea, select, [contenteditable="true"]';

/** Nichts zwischen dem berührten Element und dem Sheet (einschließlich) ist nach unten gescrollt. */
function atTop(target: EventTarget | null, sheet: HTMLElement): boolean {
  for (let n = target instanceof Element ? target : null; n; n = n === sheet ? null : n.parentElement) {
    if (n.scrollTop > 0) return false;
  }
  return true;
}

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

  let dragY = 0;
  const beginDrag = (): void => { dragY = 0; el.classList.add('is-dragging'); };
  const moveDrag = (dy: number): void => { dragY = Math.max(0, dy); el.style.setProperty('--drag', `${dragY}px`); };
  const endDrag = (): void => {
    if (dragY >= SWIPE_CLOSE_PX) { close(true); return; }
    el.classList.remove('is-dragging');
    el.style.setProperty('--drag', '0px');
  };

  // Maus/Stift: am Griff/Titel (touch-action: none in layout.css)
  let pointerY: number | null = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || state !== 'open' || e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
    pointerY = e.clientY;
    try { head.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
    beginDrag();
  });
  head.addEventListener('pointermove', (e) => { if (pointerY !== null) moveDrag(e.clientY - pointerY); });
  const endPointer = (): void => {
    if (pointerY === null) return;
    pointerY = null;
    endDrag();
  };
  head.addEventListener('pointerup', endPointer);
  head.addEventListener('pointercancel', endPointer);

  // Touch: auf dem ganzen Sheet, solange es ganz oben steht; sonst scrollt der Finger den Inhalt
  let touch: { x: number; y: number; pulling: boolean } | null = null;
  el.addEventListener('touchstart', (e) => {
    if (touch?.pulling) return;
    const first = e.touches[0];
    const onSheet = first !== undefined && first.clientY >= el.getBoundingClientRect().top;
    const inField = e.target instanceof Element && e.target.closest(NO_PULL) !== null;
    touch = state === 'open' && e.touches.length === 1 && first && onSheet && !inField
      ? { x: first.clientX, y: first.clientY, pulling: false }
      : null;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const first = e.touches[0];
    if (!touch || !first) return;
    const dy = first.clientY - touch.y;
    if (!touch.pulling) {
      const intent = pullIntent(first.clientX - touch.x, dy, atTop(e.target, el));
      if (intent === 'undecided') return;
      if (intent === 'none' || !e.cancelable) { touch = null; return; }
      touch.pulling = true;
      beginDrag();
    }
    e.preventDefault();
    moveDrag(dy);
  }, { passive: false });
  const endTouch = (e: TouchEvent): void => {
    const pulled = touch?.pulling === true;
    touch = null;
    if (!pulled) return;
    if (dragY > TAP_SLOP_PX && e.cancelable) e.preventDefault(); // kein Klick auf die Zeile, auf der der Wisch begann
    endDrag();
  };
  el.addEventListener('touchend', endTouch);
  el.addEventListener('touchcancel', endTouch);

  window.addEventListener('hashchange', onRoute);
  openCount += 1;
  unlockScroll = lockScroll();
  document.body.append(el);
  if (typeof el.showModal === 'function') el.showModal();
  else el.setAttribute('open', '');

  return { el, close: () => close() };
}
