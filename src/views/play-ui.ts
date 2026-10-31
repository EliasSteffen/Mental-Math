// Gemeinsame Bausteine der Spielmodi (Kettenrechnen, Parallel): Dock, Antwortfeld und Eingabe-Dock.
// Klassen mit Präfix play- (public/css/views/play.css); das Tastenfeld ist numpad() aus ui/keypad.ts wie im Training.
import { getSettings } from '../data/storage.ts';
import { parseAnswer } from '../core/numbers.ts';
import { numpad, useKeypad } from '../ui/keypad.ts';
import { h, type Child } from '../ui/dom.ts';
import { dock } from '../ui/dock.ts';
import { button, setButtonLabel } from '../ui/kit.ts';
import { t } from '../i18n/index.ts';

/**
 * Zahl aus dem Antwortfeld; null = keine gültige Zahl. Liest Tausender- und Dezimaltrennzeichen der Sprache
 * (das Tastenfeld schreibt „1.200“ bzw. „1,200“) und Minus in allen Schreibweisen.
 */
export function parseNumber(raw: string): number | null {
  return parseAnswer(raw.replace(/–/g, '−'));
}

/** Dock der Spielmodi, unten im Daumenbereich. */
export function playDock(...children: Child[]): HTMLElement {
  return dock(...children);
}

/** Antwortfeld als echtes <input>; compact für die Ketten-Liste (Parallel). */
export function answerInput(label: string, o: { compact?: boolean } = {}): HTMLInputElement {
  return h('input', {
    type: 'text', class: `play-answer num${o.compact ? ' is-compact' : ''}`, inputmode: 'decimal',
    autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
    'aria-label': label, placeholder: '?',
  });
}

export interface AnswerDock {
  el: HTMLElement;
  /** Beschriftung der Primäraktion („Weiter“, „Prüfen“) */
  setSubmitLabel(label: string): void;
}

/**
 * Eingabe-Dock wie im Training: oben rechts „Weiß nicht“, darunter das Tastenfeld mit „Prüfen“ (Touch bzw.
 * Einstellung „an“) oder ohne Tastenfeld die Primäraktion (56 px). Die Primäraktion ist gedimmt, solange das Feld
 * leer ist; Enter im Feld löst sie aus. Das Feld bleibt ein echtes <input> (mit Tastenfeld inputmode="none").
 */
export function answerDock(o: {
  input: HTMLInputElement; submitLabel: string; onSubmit: () => void; onSkip: () => void;
}): AnswerDock {
  const settings = getSettings();
  o.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); o.onSubmit(); }
  });
  const top = h('div', { class: 'play-dock-top' },
    button({ label: t('common.dontKnow'), kind: 'quiet', onClick: o.onSkip }));
  if (useKeypad(settings.keypad)) {
    o.input.inputMode = 'none';
    const pad = numpad({ input: o.input, onSubmit: o.onSubmit, layout: settings.numpadLayout, submitLabel: o.submitLabel });
    return { el: playDock(top, pad.el), setSubmitLabel: (label) => { pad.submit.textContent = label; } };
  }
  const primary = button({ label: o.submitLabel, kind: 'primary', full: true, onClick: o.onSubmit });
  const paint = (): void => primary.setAttribute('aria-disabled', String(o.input.value.trim() === ''));
  o.input.addEventListener('input', paint);
  paint();
  return { el: playDock(top, primary), setSubmitLabel: (label) => setButtonLabel(primary, label) };
}
