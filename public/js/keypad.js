import { h, appendChildren } from './ui.js';

export function useKeypad(setting) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

export function createKeypad({ input, onSubmit, onSkip, haptics = false }) {
  const buzz = () => {
    if (haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(5); } catch { /* ignore */ }
    }
  };
  const changed = () => input.dispatchEvent(new Event('input', { bubbles: true }));

  const insert = (text) => { input.value += text; };
  const actions = {
    digit: (d) => insert(d),
    comma: () => { if (!/[,.]/.test(input.value)) insert(','); },
    zeros: () => insert('000'),
    back: () => { input.value = input.value.slice(0, -1); },
    sign: () => {
      const v = input.value.replace(/^\s+/, '');
      input.value = /^[-−–]/.test(v) ? v.replace(/^[-−–]\s*/, '') : `-${v}`;
    },
  };

  function key(label, cls, run, { aria = null, vibrate = true } = {}) {
    return h('button', {
      type: 'button', class: `key ${cls}`.trim(), 'aria-label': aria,
      onpointerdown: (e) => e.preventDefault(),
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { if (vibrate) buzz(); run(); },
    }, label);
  }
  const digit = (d) => key(d, 'key-digit', () => { actions.digit(d); changed(); });
  const edit = (label, cls, fn, aria) => key(label, cls, () => { fn(); changed(); }, { aria });

  const grid = h('div', { class: 'keypad-grid' });
  appendChildren(grid, [
    digit('7'), digit('8'), digit('9'), edit('⌫', 'key-aux', actions.back, 'Löschen'),
    digit('4'), digit('5'), digit('6'), edit('±', 'key-aux', actions.sign, 'Vorzeichen wechseln'),
    digit('1'), digit('2'), digit('3'),
    key('Prüfen ↵', 'key-submit', onSubmit, { aria: 'Prüfen' }),
    edit(',', 'key-digit', actions.comma, 'Komma'), digit('0'),
    edit('000', 'key-digit', actions.zeros, 'Drei Nullen'),
  ]);

  const skip = h('button', {
    type: 'button', class: 'linkbtn keypad-skip',
    onpointerdown: (e) => e.preventDefault(),
    onmousedown: (e) => e.preventDefault(),
    onclick: onSkip,
  }, 'Weiß nicht');

  return h('div', { class: 'keypad', role: 'group', 'aria-label': 'Zahlentastatur' },
    h('div', { class: 'keypad-top' }, skip), grid);
}
