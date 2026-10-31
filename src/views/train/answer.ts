// Antwort einer Aufgabe: Antwortfeld (echtes <input>, Zustände Eingabe/richtig/Korrektur/übersprungen) mit
// Tastenfeld oder Prüfen-Button im Dock, bzw. Auswahl-Raster 2 × 2 im Dock bei Auswahlaufgaben.
import type { Task } from '../../types.ts';
import { parseAnswer } from '../../core/numbers.ts';
import { h } from '../../ui/dom.ts';
import { button, icon } from '../../ui/kit.ts';
import { numpad, useKeypad } from '../../ui/keypad.ts';
import { t } from '../../i18n/index.ts';

export type AnswerState = 'good' | 'bad' | 'skip';

export interface AnswerControls {
  isChoice: boolean;
  /** Bildschirm-Tastenfeld aktiv (nur Zahlenaufgaben) */
  kp: boolean;
  input: HTMLInputElement;
  /** Bühne: Antwortfeld mit Einheit und Fehlermeldung – null bei Auswahlaufgaben */
  stageEl: HTMLElement | null;
  /** Dock: Tastenfeld, Prüfen-Button (Desktop) oder Auswahl-Raster */
  dockEl: HTMLElement;
  /** Prüfen (Enter); leere Eingabe tut nichts, ungültige zeigt einen Hinweis. */
  submit(): void;
  /** Sperrt die Eingabe und zeigt den Zustand; bei Zahlenaufgaben (falsch/übersprungen) „Richtig ist …“. */
  lock(given: number | null, state: AnswerState, right: { value: string; unit: string }): void;
  focus(): void;
}

export interface AnswerOptions {
  keypadSetting: 'auto' | 'on' | 'off';
  numpadLayout?: 'calculator' | 'phone';
  /** Auto-Submit: liefert true, wenn der Zwischenstand schon korrekt ist. */
  autoCheck?: ((value: number) => boolean) | null;
  /** Wird mit der Antwort (Zahl, Auswahl-Index oder null = übersprungen) aufgerufen. */
  onFinish(given: number | null): void;
}

/** Ab dieser Länge wird die Schrift im Antwortfeld kleiner, damit große Zahlen hineinpassen. */
const LONG = 8;
const LONGER = 11;

export function createAnswer(task: Task, { keypadSetting, numpadLayout = 'calculator', autoCheck = null, onFinish }: AnswerOptions): AnswerControls {
  const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
  return choices ? choiceAnswer(task, choices, onFinish) : numberAnswer(task, { keypadSetting, numpadLayout, autoCheck, onFinish });
}

/* ---------- Zahlenaufgabe ---------- */

function numberAnswer(task: Task, { keypadSetting, numpadLayout = 'calculator', autoCheck = null, onFinish }: AnswerOptions): AnswerControls {
  const kp = useKeypad(keypadSetting);
  const input = h('input', {
    type: 'text', class: 'train-input num', inputmode: kp ? 'none' : 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': t('common.answer'), spellcheck: 'false', autocapitalize: 'off', placeholder: ' ',
  });
  const field = h('div', { class: `train-field num${kp ? ' is-kp' : ''}` }, input, h('span', { class: 'train-caret', 'aria-hidden': 'true' }));
  const error = h('p', { class: 'train-error', role: 'alert' });

  const fit = (): void => {
    const n = input.value.length;
    field.classList.toggle('is-long', n >= LONG && n < LONGER);
    field.classList.toggle('is-longer', n >= LONGER);
  };
  input.addEventListener('input', () => {
    fit();
    if (error.textContent) error.textContent = '';
  });
  if (autoCheck) {
    input.addEventListener('input', () => {
      if (input.disabled || input.value.trim() === '') return;
      const v = parseAnswer(input.value);
      if (v !== null && autoCheck(v)) onFinish(v);
    });
  }

  const submit = (): void => {
    if (input.disabled) return;
    if (input.value.trim() === '') { input.focus(); return; }
    const v = parseAnswer(input.value);
    if (v === null) {
      error.textContent = t('train.inputError');
      input.focus();
      if (!kp) input.select();
      return;
    }
    onFinish(v);
  };

  // Ohne Tastenfeld (Desktop, Tastenfeld aus): Vorzeichen-Taste, weil Dezimal-Tastaturen oft kein Minus haben
  const sign = kp ? null : h('button', {
    type: 'button', class: 'train-sign press', 'aria-label': t('common.keySign'),
    onmousedown: (e: Event) => e.preventDefault(),
    onpointerdown: (e: Event) => e.preventDefault(),
    onclick: () => {
      if (input.disabled) return;
      const v = input.value.trim();
      input.value = /^[-−–]/.test(v) ? v.replace(/^[-−–]\s*/, '') : `−${v}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    },
  }, icon('plus-minus', 22));

  const row = h('div', { class: 'train-answer' }, sign, field, task.unit ? h('span', { class: 'train-unit' }, task.unit) : null);
  const stageEl = h('div', { class: 'train-answer-block' }, row, error);

  let dockEl: HTMLElement;
  if (kp) {
    dockEl = numpad({ input, layout: numpadLayout, onSubmit: submit }).el;
  } else {
    const check = button({ label: t('common.check'), kind: 'primary', full: true, onClick: submit });
    const sync = (): void => { check.disabled = input.disabled || input.value.trim() === ''; };
    input.addEventListener('input', sync);
    sync();
    dockEl = check;
  }

  return {
    isChoice: false, kp, input, stageEl, dockEl, submit,
    lock(_given, state, right) {
      input.disabled = true;
      error.textContent = '';
      field.classList.add(`is-${state}`);
      if (state === 'skip') {
        input.value = '–';
        fit();
      }
      // Gesperrt nur so breit wie der Inhalt, damit der Haken direkt vor der Zahl steht (Fallback zu field-sizing)
      input.size = input.value.length + 1;
      if (state === 'good') {
        field.prepend(h('span', { class: 'train-field-check draw', 'aria-hidden': 'true' }, icon('check', 26)));
      } else {
        stageEl.append(h('p', { class: 'train-correction rise' },
          h('span', { class: 'train-correction-label' }, t('train.correctIs')),
          h('span', { class: 'train-correction-value num' }, right.value),
          right.unit ? h('span', { class: 'train-unit' }, right.unit) : null));
      }
    },
    focus() { input.focus({ preventScroll: true }); },
  };
}

/* ---------- Auswahlaufgabe ---------- */

function choiceAnswer(task: Task, choices: readonly string[], onFinish: (given: number | null) => void): AnswerControls {
  const input = h('input', { type: 'hidden' });
  const buttons = choices.map((c, i) => h('button', {
    type: 'button', class: 'train-choice press num', 'aria-pressed': 'false', onclick: () => onFinish(i),
  }, h('span', { class: 'train-choice-key', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'train-choice-text' }, c)));
  const dockEl = h('div', { class: 'train-choices', role: 'group', 'aria-label': t('train.choices') }, buttons);
  return {
    isChoice: true, kp: false, input, stageEl: null, dockEl,
    submit() { /* Auswahl: Antwort per Tipp oder Taste 1–4 */ },
    lock(given) {
      buttons.forEach((b, i) => {
        b.disabled = true;
        b.setAttribute('aria-pressed', String(i === given));
        if (i === task.expected) b.classList.add('is-correct', ...(given === task.expected ? ['is-glow'] : []));
        else if (i === given) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
      });
    },
    focus() { buttons[0]?.focus({ preventScroll: true }); },
  };
}
