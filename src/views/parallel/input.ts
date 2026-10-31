// Parallel · Eingabe (Fokus-Modus): je Kette ein Feld in einer Liste, nacheinander ausfüllen; Weiter/Prüfen im Dock.
import type { ParallelState } from '../../types.ts';
import { submitAnswer } from '../../core/parallel.ts';
import { fmt } from '../../core/numbers.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { focusHead } from '../../ui/kit.ts';
import { answerDock, answerInput, parseNumber } from '../play-ui.ts';
import { t } from '../../i18n/index.ts';

export function renderInput(initial: ParallelState, onDone: (state: ParallelState) => void): () => void {
  let state = initial;
  const input = answerInput(t('parallel.chainResultAria', { id: initial.chains[0]?.id ?? '' }), { compact: true });
  const fields = h('ol', { class: 'list play-fields' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });

  function commit(value: number | null): void {
    state = submitAnswer(state, value);
    if (state.phase === 'result') { onDone(state); return; }
    update();
    focusField();
  }
  function submit(): void {
    const given = parseNumber(input.value);
    if (given !== null) commit(given);
  }
  function skip(): void { commit(null); }

  const answer = answerDock({ input, submitLabel: t('parallel.next'), onSubmit: submit, onSkip: skip });

  /**
   * Fokus ins aktive Feld (Tastatur tippt direkt; mit Tastenfeld gilt inputmode="none", keine Bildschirmtastatur).
   * Auf kleinen Bildschirmen so weit scrollen, dass das Dock das Feld nicht verdeckt (scroll-margin = Dock-Höhe).
   */
  function focusField(): void {
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'nearest' });
  }

  /** Liste neu zeichnen: erledigte Ketten mit Wert (– = übersprungen), die aktive mit dem Feld, offene mit „·“. */
  function update(): void {
    const idx = state.inputIndex;
    fields.replaceChildren(...state.chains.map((c, i) => {
      const a = state.answers[i];
      const active = i === idx;
      const cls = active ? 'play-field is-active' : i < idx ? 'play-field is-done' : 'play-field';
      const value = active
        ? input
        : h('span', { class: 'play-field-value num' }, i > idx ? '·' : a === null || a === undefined ? '–' : fmt(a));
      return h('li', { class: cls, 'aria-current': active ? 'step' : null },
        h('span', { class: 'play-field-label' }, t('parallel.chain', { id: c.id })), value);
    }));
    const current = state.chains[idx];
    if (current) {
      input.setAttribute('aria-label', t('parallel.chainResultAria', { id: current.id }));
      live.textContent = t('parallel.chainPrompt', { id: current.id });
    }
    input.value = '';
    input.dispatchEvent(new Event('input'));
    answer.setSubmitLabel(idx >= state.chains.length - 1 ? t('common.check') : t('parallel.next'));
  }

  app.replaceChildren();
  appendChildren(app, [
    focusHead({ title: t('parallel.title'), shortTitle: t('parallel.titleShort') }),
    h('div', { class: 'stage' }, h('p', { class: 'play-caption' }, t('parallel.question')), fields, live),
    answer.el,
  ]);
  update();
  fields.style.setProperty('--play-dock-h', `${answer.el.offsetHeight}px`);
  focusField();

  // Keine eigenen Timer oder Listener: das Tastenfeld liegt im Dock und verschwindet mit dem Inhalt
  return (): void => undefined;
}
