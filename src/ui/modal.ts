import { h, appendChildren } from './dom.ts';
import { t } from '../i18n/index.ts';

export interface ModalAction { label: string; onClick?: () => void; primary?: boolean; danger?: boolean; closes?: boolean }
export interface ModalOptions { title: string; body: Node | string; actions?: ModalAction[]; onClose?: () => void }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const open = new Set<HTMLElement>();
let uid = 0;

/** True, solange mindestens ein Modal offen ist (für Shortcuts). */
export function isModalOpen(): boolean { return open.size > 0; }

export function openModal(o: ModalOptions): { close(): void } {
  const id = `modal-${++uid}`;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;

  const body = h('div', { class: 'modal-body' });
  appendChildren(body, [o.body]);
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, tabindex: '-1' },
    h('h2', { class: 'modal-title', id: `${id}-t` }, o.title),
    body);
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    open.delete(backdrop);
    backdrop.remove();
    if (open.size === 0) document.body.classList.remove('modal-open');
    if (previous && previous.isConnected) previous.focus();
    o.onClose?.();
  }

  const actions = o.actions ?? [];
  if (actions.length > 0) {
    const row = h('div', { class: 'modal-actions' });
    for (const a of actions) {
      row.append(h('button', {
        type: 'button', class: `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`,
        onclick: () => { a.onClick?.(); if (a.closes !== false) close(); },
      }, a.label));
    }
    dialog.append(row);
  }

  function onKey(e: KeyboardEvent): void {
    // Nur das oberste Modal reagiert
    if ([...open].pop() !== backdrop) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('hidden'));
    if (items.length === 0) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    else if (!dialog.contains(active)) { e.preventDefault(); first.focus(); }
  }

  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);
  open.add(backdrop);
  document.body.classList.add('modal-open');
  document.body.append(backdrop);
  const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
  (first ?? dialog).focus();
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

/** Ergebnis-Shortcuts: Enter = Nochmal, Esc = Übersicht (nicht bei offenem Modal oder in Eingabefeldern). Gibt die Aufräumfunktion zurück. */
export function bindResultKeys(onAgain: () => void, onOverview: () => void): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (isModalOpen() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Enter') {
      if (t instanceof Element && t.closest('a, summary, button:not(.fab-btn.primary)')) return;
      e.preventDefault(); onAgain();
    } else if (e.key === 'Escape') { e.preventDefault(); onOverview(); }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
