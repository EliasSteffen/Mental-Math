import { h } from './dom.ts';

export type ToastKind = 'info' | 'success' | 'error';
export interface ToastOptions { kind?: ToastKind; durationMs?: number }

const MAX_VISIBLE = 4;
let stack: HTMLElement | null = null;

function getStack(): HTMLElement {
  if (stack && stack.isConnected) return stack;
  stack = h('div', { class: 'toast-stack' });
  document.body.append(stack);
  return stack;
}

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  const done = (): void => el.remove();
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400); // Fallback (reduced motion / keine Animation)
}

/** Zeigt eine gestapelte Meldung unten über Tab-Leiste/FAB. */
export function toast(text: string, opts: ToastOptions = {}): void {
  const kind: ToastKind = opts.kind ?? 'info';
  const parent = getStack();
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, String(text));
  parent.append(el);
  const live = parent.querySelectorAll('.toast:not(.is-leaving)');
  for (let i = 0; i < live.length - MAX_VISIBLE; i += 1) dismiss(live[i] as HTMLElement);
  setTimeout(() => dismiss(el), opts.durationMs ?? 3200);
}
