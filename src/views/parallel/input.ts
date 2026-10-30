import type { ParallelState } from '../../types.ts';
import { submitAnswer } from '../../core/parallel.ts';
import { fmt } from '../../core/numbers.ts';
import { getSettings } from '../../data/storage.ts';
import { createKeypad, useKeypad } from '../../ui/keypad.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { t } from '../../i18n/index.ts';

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function renderInput(initial: ParallelState, onDone: (state: ParallelState) => void): () => void {
  let state = initial;
  let keypadEl: HTMLElement | null = null;
  const settings = getSettings();

  const progress = h('div', { class: 'pl-progress', 'aria-live': 'polite' });
  const grid = h('div', { class: 'pl-grid' });
  const prompt = h('div', { class: 'label pl-prompt' });
  const input: HTMLInputElement = h('input', {
    type: 'text', inputmode: 'none', autocomplete: 'off', 'aria-label': t('parallel.chainResultAria'), placeholder: '?',
  });

  const update = (): void => {
    const idx = state.inputIndex;
    const marks = state.chains.map((c, i) => {
      const a = state.answers[i];
      const mark = i === idx ? '?' : i > idx ? '·' : a === null || a === undefined ? '–' : '✓';
      return `${c.id} ${mark}`;
    });
    progress.textContent = marks.join(' · ');
    grid.replaceChildren(...state.chains.map((c, i) => {
      const a = state.answers[i];
      const text = i === idx ? '?' : i > idx ? '·' : a === null || a === undefined ? '–' : fmt(a);
      const cls = i === idx ? 'pl-card is-active' : i < idx ? 'pl-card is-answered' : 'pl-card';
      return h('article', { class: cls, 'aria-current': i === idx ? 'step' : null },
        h('div', { class: 'pl-card-head' }, h('span', { class: 'pl-id' }, t('parallel.chain', { id: c.id }))),
        h('div', { class: 'pl-main is-answer' }, text));
    }));
    const current = state.chains[idx];
    prompt.textContent = current ? t('parallel.chainPrompt', { id: current.id }) : '';
    input.value = '';
  };

  const commit = (value: number | null): void => {
    state = submitAnswer(state, value);
    if (state.phase === 'result') { onDone(state); return; }
    update();
    if (!keypadEl) input.focus();
  };

  const submit = (): void => {
    const given = parseNumber(input.value);
    if (given === null) return;
    commit(given);
  };
  const skip = (): void => commit(null);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  const kp = useKeypad(settings.keypad);
  const actions = kp
    ? null
    : h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: submit }, t('common.nextEnter')),
      h('button', { type: 'button', class: 'btn', onclick: skip }, t('common.dontKnow')));

  app.replaceChildren();
  appendChildren(app, [h('div', { class: 'parallel' },
    h('h1', { class: 'page-title' }, t('parallel.question')),
    progress, grid,
    h('div', { class: 'pl-answer' }, prompt, h('div', { class: 'answer' }, input)),
    actions)]);
  update();

  if (kp) {
    input.readOnly = true;
    keypadEl = createKeypad({
      input, onSubmit: submit, onSkip: skip, haptics: settings.haptics, layout: settings.numpadLayout,
    });
    document.body.append(keypadEl);
    document.body.classList.add('has-keypad');
  } else {
    input.inputMode = 'decimal';
    input.removeAttribute('readonly');
    input.focus();
  }

  return (): void => {
    if (keypadEl) { keypadEl.remove(); keypadEl = null; }
    document.body.classList.remove('has-keypad');
  };
}
