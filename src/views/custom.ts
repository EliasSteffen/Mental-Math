import { getSettings } from '../data/storage.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { go } from '../router.ts';

type Kind = 'mul' | 'square';

function field(label: string, value: number): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const input: HTMLInputElement = h('input', {
    type: 'number', inputmode: 'numeric', min: 1, max: 999, step: 1, value: String(value), 'aria-label': label,
  });
  return { wrap: h('label', { class: 'field' }, h('span', null, label), input), input };
}

export function renderCustom(): void {
  let kind: Kind = 'mul';
  const a1 = field('a von', 13);
  const a2 = field('a bis', 19);
  const b1 = field('b von', 2);
  const b2 = field('b bis', 9);
  const r1 = field('n von', 11);
  const r2 = field('n bis', 30);
  const len: HTMLSelectElement = h('select', { class: 'select', 'aria-label': 'Rundenlänge' },
    [5, 10, 15, 20, 30].map((n) => h('option', { value: n, selected: n === (getSettings().sessionLength || 10) ? true : null }, `${n} Aufgaben`)));
  const error = h('div', { class: 'form-error', role: 'alert' });
  const mulBox = h('div', { class: 'form-grid' }, a1.wrap, a2.wrap, b1.wrap, b2.wrap);
  const sqBox = h('div', { class: 'form-grid' }, r1.wrap, r2.wrap);
  const kindBox = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Art' });

  const paint = (): void => {
    mulBox.hidden = kind !== 'mul';
    sqBox.hidden = kind !== 'square';
    kindBox.replaceChildren(
      ...([['mul', 'Einmaleins'], ['square', 'Quadrate']] as const).map(([v, t]) => h('button', {
        type: 'button', class: v === kind ? 'active' : null, 'aria-pressed': String(v === kind),
        onclick: () => { kind = v; error.textContent = ''; paint(); },
      }, t)));
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
      if (!a || !b) { error.textContent = 'Bitte ganze Zahlen von 1 bis 999 eingeben, „von“ darf nicht größer als „bis“ sein.'; return; }
      go(`#/train/custom?k=mul&a=${a[0]}-${a[1]}&b=${b[0]}-${b[1]}&n=${n}`);
    } else {
      const r = range(r1.input, r2.input);
      if (!r) { error.textContent = 'Bitte ganze Zahlen von 1 bis 999 eingeben, „von“ darf nicht größer als „bis“ sein.'; return; }
      go(`#/train/custom?k=square&r=${r[0]}-${r[1]}&n=${n}`);
    }
  };

  paint();
  appendChildren(app, [
    h('a', { class: 'back-link', href: '#/' }, '← Zurück'),
    h('h1', { class: 'page-title' }, 'Eigenes Training'),
    h('p', { class: 'muted' }, 'Wähle selbst, welche Zahlenbereiche du üben willst.'),
    h('div', { class: 'card stack' },
      h('div', { class: 'label' }, 'Art'),
      kindBox,
      mulBox,
      sqBox,
      h('div', { class: 'label' }, 'Rundenlänge'),
      len,
      error),
    h('button', { type: 'button', class: 'btn primary', onclick: start }, 'Training starten'),
  ]);
}
