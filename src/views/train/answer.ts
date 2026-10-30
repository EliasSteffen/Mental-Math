import type { Task } from '../../types.ts';
import { parseAnswer } from '../../core/numbers.ts';
import { icon } from '../../ui/charts.ts';
import { h } from '../../ui/dom.ts';
import { useKeypad, createKeypad } from '../../ui/keypad.ts';

export interface AnswerControls {
  isChoice: boolean;
  /** Bildschirm-Tastatur aktiv (nur bei Zahlenaufgaben) */
  kp: boolean;
  input: HTMLInputElement;
  /** „Prüfen“-Button (nur bei Zahlenaufgaben sichtbar im DOM, wenn !kp) */
  check: HTMLButtonElement;
  /** Anfangsinhalt der Aktionszeile (Fehlerhinweis, Prüfen/Weiß nicht) */
  actionNodes: Node[];
  /** Eingabezeile (Vorzeichen, Input, Einheit) – null bei Auswahlaufgaben */
  answerRow: HTMLElement | null;
  /** Auswahl-Buttons – null bei Zahlenaufgaben */
  choicesEl: HTMLElement | null;
  /** Hängt das Tastenfeld an root; hilfeBtn wandert in dessen Kopfzeile. */
  mountKeypad(root: HTMLElement, helpBtn: HTMLElement | null): void;
  /** Sperrt Eingabe/Buttons nach der Antwort und markiert richtig/falsch. */
  lock(given: number | null): void;
  /** Entfernt das Tastenfeld (falls vorhanden). */
  removeKeypad(): void;
}

export interface AnswerOptions {
  keypadSetting: 'auto' | 'on' | 'off';
  haptics: boolean;
  numpadLayout?: 'calculator' | 'phone';
  /** Auto-Submit: liefert true, wenn der Zwischenstand schon korrekt ist. */
  autoCheck?: ((value: number) => boolean) | null;
  /** Wird mit der Antwort (Zahl, Auswahl-Index oder null = übersprungen) aufgerufen. */
  onFinish(given: number | null): void;
}

export function createAnswer(task: Task, { keypadSetting, haptics, numpadLayout = 'calculator', autoCheck = null, onFinish }: AnswerOptions): AnswerControls {
  const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
  const isChoice = choices !== null;
  const kp = isChoice ? false : useKeypad(keypadSetting);
  const choiceBtns: HTMLButtonElement[] = [];
  let keypadEl: HTMLElement | null = null;

  const input = h('input', {
    type: 'text', inputmode: kp ? 'none' : 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    'aria-label': 'Antwort', spellcheck: 'false', autocapitalize: 'off',
  });

  const signBtn = h('button', {
    type: 'button', class: 'sign-toggle', 'aria-label': 'Vorzeichen wechseln',
    onmousedown: (e: Event) => e.preventDefault(),
    onpointerdown: (e: Event) => e.preventDefault(),
    onclick: () => {
      const v = input.value.replace(/^\s+/, '');
      input.value = /^[-−–]/.test(v) ? v.replace(/^[-−–]\s*/, '') : `-${v}`;
      input.focus();
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch { /* ignore */ }
    },
  }, icon('plus-minus', { size: 20 }));

  if (autoCheck) {
    input.addEventListener('input', () => {
      if (input.disabled || input.value.trim() === '') return;
      const v = parseAnswer(input.value);
      if (v !== null && autoCheck(v)) onFinish(v);
    });
  }

  const inputError = h('div', { class: 'hint', role: 'alert' });
  const check = h('button', {
    type: 'button', class: 'btn primary',
    onclick: () => {
      const v = parseAnswer(input.value);
      if (input.value.trim() === '') { input.focus(); return; }
      if (v === null) {
        inputError.textContent = 'Bitte nur die Zahl eingeben, z. B. 2,4 – ohne „min“, „Jahre“ o. Ä.';
        input.focus();
        input.select();
        return;
      }
      onFinish(v);
    },
  }, 'Prüfen ↵');
  const skip = h('button', { type: 'button', class: 'btn', onclick: () => onFinish(null) }, 'Weiß nicht');

  const actionNodes: Node[] = [];
  if (isChoice) actionNodes.push(h('div', { class: 'btn-row' }, skip));
  else if (kp) actionNodes.push(inputError);
  else actionNodes.push(inputError, h('div', { class: 'btn-row' }, check, skip));

  const choicesEl = choices
    ? h('div', { class: 'choices', role: 'group', 'aria-label': 'Antwortmöglichkeiten' },
      choices.map((c, i) => {
        const b = h('button', { type: 'button', class: 'choice', onclick: () => onFinish(i) },
          h('span', { class: 'choice-text' }, c));
        choiceBtns.push(b);
        return b;
      }))
    : null;

  const answerRow = isChoice
    ? null
    : h('div', { class: 'answer' }, kp ? null : signBtn, input, task.unit ? h('span', { class: 'unit' }, task.unit) : null);

  return {
    isChoice, kp, input, check, actionNodes, answerRow, choicesEl,
    mountKeypad(root, helpBtn) {
      if (!kp) return;
      const pad = createKeypad({
        input, haptics, layout: numpadLayout,
        onSubmit: () => check.click(), onSkip: () => onFinish(null),
      });
      keypadEl = pad;
      // „Wie geht das?“ wandert in die Kopfzeile des Tastenfelds, damit es nicht verdeckt wird
      if (helpBtn) {
        helpBtn.classList.add('keypad-help');
        pad.querySelector('.keypad-top')?.prepend(helpBtn);
      }
      root.append(pad);
      document.body.classList.add('has-keypad');
    },
    lock(given) {
      input.disabled = true;
      if (isChoice) {
        choiceBtns.forEach((b, i) => {
          b.disabled = true;
          if (i === task.expected) b.classList.add('is-correct');
          else if (i === given) b.classList.add('is-wrong');
        });
      }
    },
    removeKeypad() {
      if (keypadEl) { keypadEl.remove(); keypadEl = null; }
    },
  };
}
