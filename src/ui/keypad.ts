import { h, appendChildren } from './dom.ts';
import { t } from '../i18n/index.ts';

export function useKeypad(setting: 'auto' | 'on' | 'off' | string): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

export interface KeypadOptions {
  input: HTMLInputElement;
  onSubmit: () => void;
  onSkip: () => void;
  haptics?: boolean;
  /** 'calculator' = 7-8-9 oben, 'phone' = 1-2-3 oben */
  layout?: 'calculator' | 'phone';
}

export function createKeypad({ input, onSubmit, onSkip, haptics = false, layout = 'calculator' }: KeypadOptions): HTMLDivElement {
  const buzz = (): void => {
    if (haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(5); } catch { /* ignore */ }
    }
  };
  const changed = (): void => { input.dispatchEvent(new Event('input', { bubbles: true })); };

  const insert = (text: string): void => { input.value += text; };
  const actions = {
    digit: (d: string): void => insert(d),
    comma: (): void => { if (!/[,.]/.test(input.value)) insert(','); },
    zeros: (): void => insert('000'),
    back: (): void => { input.value = input.value.slice(0, -1); },
    sign: (): void => {
      const v = input.value.replace(/^\s+/, '');
      input.value = /^[-−–]/.test(v) ? v.replace(/^[-−–]\s*/, '') : `-${v}`;
    },
  };

  function key(label: string, cls: string, run: () => void, { aria = null, vibrate = true }: { aria?: string | null; vibrate?: boolean } = {}): HTMLButtonElement {
    return h('button', {
      type: 'button', class: `key ${cls}`.trim(), 'aria-label': aria,
      onpointerdown: (e: Event) => e.preventDefault(),
      onmousedown: (e: Event) => e.preventDefault(),
      onclick: () => { if (vibrate) buzz(); run(); },
    }, label);
  }
  const digit = (d: string): HTMLButtonElement => key(d, 'key-digit', () => { actions.digit(d); changed(); });
  const edit = (label: string, cls: string, fn: () => void, aria: string): HTMLButtonElement =>
    key(label, cls, () => { fn(); changed(); }, { aria });

  const grid = h('div', { class: 'keypad-grid' });
  const phone = layout === 'phone';
  const rows: HTMLButtonElement[][] = phone
    ? [[digit('1'), digit('2'), digit('3')], [digit('4'), digit('5'), digit('6')], [digit('7'), digit('8'), digit('9')]]
    : [[digit('7'), digit('8'), digit('9')], [digit('4'), digit('5'), digit('6')], [digit('1'), digit('2'), digit('3')]];
  appendChildren(grid, [
    ...rows[0]!, edit('⌫', 'key-aux', actions.back, t('common.keyDelete')),
    ...rows[1]!, edit('±', 'key-aux', actions.sign, t('common.keySign')),
    ...rows[2]!,
    key(t('common.checkEnter'), 'key-submit', onSubmit, { aria: t('common.check') }),
    edit(',', 'key-digit', actions.comma, t('common.keyComma')), digit('0'),
    edit('000', 'key-digit', actions.zeros, t('common.keyZeros')),
  ]);

  const skip = h('button', {
    type: 'button', class: 'linkbtn keypad-skip',
    onpointerdown: (e: Event) => e.preventDefault(),
    onmousedown: (e: Event) => e.preventDefault(),
    onclick: onSkip,
  }, t('common.dontKnow'));

  return h('div', { class: 'keypad', role: 'group', 'aria-label': t('common.keypad') },
    h('div', { class: 'keypad-top' }, skip), grid);
}
