// Bildschirm-Tastenfeld „Ruhiger Fokus“ (Dock in Training, Ketten, Parallel): 4 Spalten,
// 7 8 9 ⌫ / 4 5 6 ± / 1 2 3 [Prüfen, 2 Zeilen] / , 0 000. Es schreibt in ein echtes <input inputmode="none">,
// damit Tastatur und Screenreader weiter funktionieren.
import { h, appendChildren } from './dom.ts';
import { icon } from './kit.ts';
import { haptic } from './fx.ts';
import { getLang, t } from '../i18n/index.ts';

export function useKeypad(setting: 'auto' | 'on' | 'off' | string): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

/* ---------- Tastenfeld „Ruhiger Fokus“ ---------- */

export interface NumpadOptions {
  input: HTMLInputElement;
  onSubmit: () => void;
  /** 'calculator' = 7-8-9 oben, 'phone' = 1-2-3 oben */
  layout?: 'calculator' | 'phone';
  /** Beschriftung der Prüfen-Taste (Standard „Prüfen“) */
  submitLabel?: string;
}

export interface Numpad {
  el: HTMLElement;
  /** „Prüfen“ – deaktiviert, solange das Eingabefeld leer ist */
  submit: HTMLButtonElement;
}

const MINUS = /^[-−–]\s*/;

/** Dezimal- und Tausendertrennzeichen der aktuellen Sprache (parseAnswer liest beide so). */
function separators(): { dec: string; group: string } {
  return getLang() === 'de' ? { dec: ',', group: '.' } : { dec: '.', group: ',' };
}

/** Zerlegt den Feldinhalt in Vorzeichen und Ziffern (ohne Tausendertrennzeichen). */
function split(value: string): { neg: boolean; body: string } {
  const v = value.trim();
  const neg = MINUS.test(v);
  const { group } = separators();
  return { neg, body: v.replace(MINUS, '').split(group).join('') };
}

/** Ziffern mit Tausendertrennzeichen wie im Artboard („1.200“, „−4.500,5“). */
function compose(neg: boolean, body: string): string {
  const { dec, group } = separators();
  const [int = '', frac] = body.split(dec);
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${neg ? '−' : ''}${grouped}${frac === undefined ? '' : dec + frac}`;
}

export function numpad({ input, onSubmit, layout = 'calculator', submitLabel = t('common.check') }: NumpadOptions): Numpad {
  const { dec } = separators();

  const edit = (fn: (s: { neg: boolean; body: string }) => { neg: boolean; body: string } | null): void => {
    if (input.disabled) return;
    const next = fn(split(input.value));
    if (!next) return;
    haptic('tap');
    input.value = compose(next.neg, next.body);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    try { input.scrollLeft = input.scrollWidth; } catch { /* ignorieren */ }
  };

  const digit = (d: string) => edit(({ neg, body }) => ({ neg, body: body === '0' ? d : body + d }));
  const actions = {
    comma: () => edit(({ neg, body }) => (body.includes(dec) ? null : { neg, body: `${body || '0'}${dec}` })),
    zeros: () => edit(({ neg, body }) => (body === '' || body === '0' || body.includes(dec) ? null : { neg, body: body + '000' })),
    back: () => edit(({ neg, body }) => (body === '' && !neg ? null : body === '' ? { neg: false, body } : { neg, body: body.slice(0, -1) })),
    sign: () => edit(({ neg, body }) => ({ neg: !neg, body })),
  };

  /** Taste behält den Fokus im Eingabefeld (Klick soll ihn nicht stehlen). */
  const key = (label: string | Node, cls: string, run: () => void, aria?: string): HTMLButtonElement => h('button', {
    type: 'button', class: `numpad-key press ${cls}`.trim(), 'aria-label': aria ?? null,
    onpointerdown: (e: Event) => e.preventDefault(),
    onmousedown: (e: Event) => e.preventDefault(),
    onclick: run,
  }, label);
  const d = (n: string): HTMLButtonElement => key(n, 'num', () => digit(n));

  const submit = key(submitLabel, 'numpad-check cta', () => onSubmit());
  const sync = (): void => { submit.disabled = input.disabled || input.value.trim() === ''; };
  input.addEventListener('input', sync);
  sync();

  const rows = layout === 'phone'
    ? [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]
    : [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3']];
  const grid = h('div', { class: 'numpad', role: 'group', 'aria-label': t('common.keypad') });
  appendChildren(grid, [
    ...rows[0]!.map(d), key(icon('backspace', 24), 'is-aux', actions.back, t('common.keyDelete')),
    ...rows[1]!.map(d), key(icon('plus-minus', 24), 'is-aux', actions.sign, t('common.keySign')),
    ...rows[2]!.map(d), submit,
    key(dec, 'num', actions.comma, t('common.keyComma')), d('0'),
    key('000', 'num is-zeros', actions.zeros, t('common.keyZeros')),
  ]);
  return { el: grid, submit };
}
