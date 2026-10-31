// Toasts (nur Export/Import, Sync-Fehler, Konto – E21): gestapelt unten, im Top-Layer (popover="manual"), damit sie
// auch über einem offenen Sheet oder Dialog sichtbar sind. Ohne Popover-API: fester Stapel mit hohem z-index.
// Die Höhe über dem unteren Rand folgt dem, was dort gerade schwebt (Tab-Leiste, CTA, Dock, Feedback-Sheet).
// Ansage: nur eine Ebene – jeder Toast ist selbst status bzw. alert, der Stapel ist keine Live-Region (sonst doppelt).
import { h } from './dom.ts';

export type ToastKind = 'info' | 'success' | 'error';
export interface ToastOptions { kind?: ToastKind; durationMs?: number }

const MAX_VISIBLE = 4;
/** Abstand über dem obersten unten verankerten Element (px). */
const GAP = 12;
let stack: HTMLElement | null = null;

const hasPopover = (el: HTMLElement): boolean => typeof el.showPopover === 'function';

function getStack(): HTMLElement {
  if (stack && stack.isConnected) return stack;
  stack = h('div', { class: 'toast-stack', popover: 'manual' });
  document.body.append(stack);
  return stack;
}

/**
 * Oberkante der unten schwebenden Bedienelemente (Tab-Leiste, CTA, Dock, Sheet) → Abstand des Stapels vom unteren Rand.
 * Berücksichtigt nur sichtbare, fest bzw. klebend positionierte Elemente, die unten anliegen (nicht die Seitenleiste).
 */
function bottomOffset(): number {
  const vh = window.innerHeight;
  // Offener Dialog/Sheet verdeckt Tab-Leiste und Dock: dann unten am Rand über dem Dialog
  if (document.querySelector('dialog[open]')) return Math.max(16, GAP);
  let top = vh;
  for (const el of document.querySelectorAll<HTMLElement>('nav.tabbar, #cta, #app > .dock, #app > .sheet')) {
    const pos = getComputedStyle(el).position;
    if (el.hidden || (pos !== 'fixed' && pos !== 'sticky')) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.height > vh / 2 || r.bottom < vh - 80) continue;
    top = Math.min(top, r.top);
  }
  return Math.max(0, vh - top) + GAP;
}

/** Stapel in den Top-Layer heben bzw. (erneut) nach oben legen, damit er über später geöffneten Dialogen liegt. */
function raise(el: HTMLElement): void {
  el.style.setProperty('--toast-bottom', `${bottomOffset()}px`);
  if (!hasPopover(el)) return;
  try {
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  } catch { /* Popover nicht verfügbar: der Stapel liegt per z-index oben */ }
}

function dismiss(el: HTMLElement): void {
  if (el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  const done = (): void => {
    el.remove();
    const parent = stack;
    if (parent && !parent.querySelector('.toast') && hasPopover(parent)) {
      try { parent.hidePopover(); } catch { /* schon geschlossen */ }
    }
  };
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400); // Fallback (Reduced Motion / keine Animation)
}

/** Zeigt eine gestapelte Meldung unten über Tab-Leiste, CTA bzw. Dock. */
export function toast(text: string, opts: ToastOptions = {}): void {
  const kind: ToastKind = opts.kind ?? 'info';
  const parent = getStack();
  const el = h('div', { class: `toast is-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, String(text));
  // Erst den Stapel sichtbar machen, dann einfügen: ein Toast in einem noch verborgenen Popover wird sonst nicht angesagt
  raise(parent);
  parent.append(el);
  const live = parent.querySelectorAll('.toast:not(.is-leaving)');
  for (let i = 0; i < live.length - MAX_VISIBLE; i += 1) dismiss(live[i] as HTMLElement);
  setTimeout(() => dismiss(el), opts.durationMs ?? 3200);
}
