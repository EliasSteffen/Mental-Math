// Eigenes Training (Tab Heute, kein Fokus-Modus): Art und Rundenlänge als Segmente, Zahlenbereiche als Felder
// in Listenzeilen; die schwebende CTA „Starten“ führt zu #/train/custom?… (gültig: ganze Zahlen 1–999, von ≤ bis).
import { getSettings } from '../data/storage.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { go } from '../router.ts';
import { backLink, group, icon, largeTitle, list, segmented } from '../ui/kit.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { t } from '../i18n/index.ts';

type Kind = 'mul' | 'square';
const LENGTHS = ['5', '10', '15', '20', '30'] as const;
type Length = typeof LENGTHS[number];
const MIN = 1;
const MAX = 999;

interface RangeRow { row: HTMLElement; lo: HTMLInputElement; hi: HTMLInputElement }

let uid = 0;

/** Listenzeile „Label  [von] – [bis]“ mit zwei Zahlenfeldern. */
function rangeRow(label: string, lo: number, hi: number, o: { onEdit: () => void; onEnter: () => void }): RangeRow {
  const id = `play-range-${++uid}`;
  const field = (aria: string, value: number): HTMLInputElement => {
    const input: HTMLInputElement = h('input', {
      type: 'number', class: 'play-range-input num', inputmode: 'numeric', min: MIN, max: MAX, step: 1,
      value: String(value), 'aria-label': aria, enterkeyhint: 'go',
    });
    input.addEventListener('input', o.onEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); o.onEnter(); }
    });
    return input;
  };
  const loInput = field(t('custom.from', { label }), lo);
  const hiInput = field(t('custom.to', { label }), hi);
  const row = h('div', { class: 'row' },
    h('span', { class: 'row-text' }, h('span', { class: 'row-label', id }, label)),
    h('span', { class: 'play-range-inputs', role: 'group', 'aria-labelledby': id },
      loInput, h('span', { class: 'play-range-dash', 'aria-hidden': 'true' }, '–'), hiInput));
  return { row, lo: loInput, hi: hiInput };
}

/** Gültiger Bereich [von, bis] oder null (ganze Zahlen, 1 ≤ von ≤ bis ≤ 999 – wie die Route es prüft). */
function rangeOf(r: RangeRow): [number, number] | null {
  const x = Number(r.lo.value);
  const y = Number(r.hi.value);
  const ok = Number.isInteger(x) && Number.isInteger(y) && x >= MIN && y <= MAX && x <= y;
  return ok ? [x, y] : null;
}

export function renderCustom(): void {
  let kind: Kind = 'mul';
  const preferred = String(getSettings().sessionLength || 10);
  let length: Length = LENGTHS.find((n) => n === preferred) ?? '10';
  let showErrors = false;

  const edit = { onEdit: () => { if (showErrors) validate(); }, onEnter: () => start() };
  const a = rangeRow(t('custom.factorA'), 13, 19, edit);
  const b = rangeRow(t('custom.factorB'), 2, 9, edit);
  const n = rangeRow(t('custom.base'), 11, 30, edit);
  const mulList = list([a.row, b.row]);
  const squareList = list([n.row]);
  // Live-Region bleibt stehen; der Hinweis erscheint darin, sobald ein Bereich ungültig ist
  const hint = h('div', { 'aria-live': 'polite' });

  const active = (): RangeRow[] => (kind === 'mul' ? [a, b] : [n]);

  /** Prüft die sichtbaren Bereiche, markiert ungültige Felder und zeigt den Hinweis; true = alles gültig. */
  function validate(): boolean {
    let valid = true;
    for (const r of [a, b, n]) {
      const bad = active().includes(r) && rangeOf(r) === null;
      if (bad) valid = false;
      for (const input of [r.lo, r.hi]) {
        if (bad) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    }
    if (valid) hint.replaceChildren();
    else hint.replaceChildren(h('p', { class: 'play-hint' }, icon('info', 18), h('span', null, t('custom.rangeError'))));
    if (valid) showErrors = false;
    return valid;
  }

  function paintKind(): void {
    mulList.hidden = kind !== 'mul';
    squareList.hidden = kind !== 'square';
  }

  function start(): void {
    showErrors = true;
    if (!validate()) return;
    if (kind === 'mul') {
      const ra = rangeOf(a);
      const rb = rangeOf(b);
      if (ra && rb) go(`#/train/custom?k=mul&a=${ra[0]}-${ra[1]}&b=${rb[0]}-${rb[1]}&n=${length}`);
    } else {
      const rn = rangeOf(n);
      if (rn) go(`#/train/custom?k=square&r=${rn[0]}-${rn[1]}&n=${length}`);
    }
  }

  paintKind();
  appendChildren(app, [
    backLink({ label: t('common.tabToday'), href: '#/', ariaLabel: t('custom.backToday') }),
    largeTitle(t('custom.title')),
    h('p', { class: 'play-intro' }, t('custom.intro')),
    group(t('custom.groupTasks'), list([
      segmented<Kind>({
        label: t('custom.kind'), options: [['mul', t('custom.mul')], ['square', t('custom.square')]], value: kind,
        onChange: (v) => {
          kind = v;
          paintKind();
          if (showErrors) validate();
        },
      }).el,
      segmented<Length>({
        label: t('custom.roundLength'), inline: true, numeric: true, options: LENGTHS.map((x) => [x, x] as const), value: length,
        onChange: (v) => { length = v; },
      }).el,
    ])),
    group({ title: t('custom.groupRanges'), meta: t('custom.rangeMeta') }, mulList, squareList, hint),
  ]);
  setPrimaryAction({ label: t('custom.start'), onClick: start });
}
