import { getSettings } from '../data/storage.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { go } from '../router.ts';
import { t } from '../i18n/index.ts';

type Kind = 'mul' | 'square';

function field(label: string, value: number): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const input: HTMLInputElement = h('input', {
    type: 'number', inputmode: 'numeric', min: 1, max: 999, step: 1, value: String(value), 'aria-label': label,
  });
  return { wrap: h('label', { class: 'field' }, h('span', null, label), input), input };
}

export function renderCustom(): void {
  let kind: Kind = 'mul';
  const a1 = field(t('custom.aFrom'), 13);
  const a2 = field(t('custom.aTo'), 19);
  const b1 = field(t('custom.bFrom'), 2);
  const b2 = field(t('custom.bTo'), 9);
  const r1 = field(t('custom.nFrom'), 11);
  const r2 = field(t('custom.nTo'), 30);
  const len: HTMLSelectElement = h('select', { class: 'select', 'aria-label': t('custom.roundLength') },
    [5, 10, 15, 20, 30].map((n) => h('option', { value: n, selected: n === (getSettings().sessionLength || 10) ? true : null }, t('custom.tasksN', { n }))));
  const error = h('div', { class: 'form-error', role: 'alert' });
  const mulBox = h('div', { class: 'form-grid' }, a1.wrap, a2.wrap, b1.wrap, b2.wrap);
  const sqBox = h('div', { class: 'form-grid' }, r1.wrap, r2.wrap);
  const kindBox = h('div', { class: 'segmented', role: 'group', 'aria-label': t('custom.kind') });

  const paint = (): void => {
    mulBox.hidden = kind !== 'mul';
    sqBox.hidden = kind !== 'square';
    kindBox.replaceChildren(
      ...([['mul', t('custom.mul')], ['square', t('custom.square')]] as const).map(([v, label]) => h('button', {
        type: 'button', class: v === kind ? 'active' : null, 'aria-pressed': String(v === kind),
        onclick: () => { kind = v; error.textContent = ''; paint(); },
      }, label)));
  };

  const range = (lo: HTMLInputElement, hi: HTMLInputElement): [number, number] | null => {
    const x = Number(lo.value);
    const y = Number(hi.value);
    const ok = Number.isInteger(x) && Number.isInteger(y) && x >= 1 && y <= 999 && x <= y;
    return ok ? [x, y] : null;
  };

  const start = (): void => {
    const n = Number(len.value);
    if (kind === 'mul') {
      const a = range(a1.input, a2.input);
      const b = range(b1.input, b2.input);
      if (!a || !b) { error.textContent = t('custom.rangeError'); return; }
      go(`#/train/custom?k=mul&a=${a[0]}-${a[1]}&b=${b[0]}-${b[1]}&n=${n}`);
    } else {
      const r = range(r1.input, r2.input);
      if (!r) { error.textContent = t('custom.rangeError'); return; }
      go(`#/train/custom?k=square&r=${r[0]}-${r[1]}&n=${n}`);
    }
  };

  paint();
  appendChildren(app, [
    h('a', { class: 'back-link', href: '#/' }, t('common.backLink')),
    h('h1', { class: 'page-title' }, t('custom.title')),
    h('p', { class: 'muted' }, t('custom.intro')),
    h('div', { class: 'card stack' },
      h('div', { class: 'label' }, t('custom.kind')),
      kindBox,
      mulBox,
      sqBox,
      h('div', { class: 'label' }, t('custom.roundLength')),
      len,
      error),
    h('button', { type: 'button', class: 'btn primary', onclick: start }, t('custom.start')),
  ]);
}
