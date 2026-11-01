// Hilfe („Wie geht das?“) und Rückmeldung nach der Antwort: Feedback-Sheet bei Zahlenaufgaben (ersetzt das Dock),
// Ergebniszeile in der Bühne bei Auswahlaufgaben. Diagnose-Texte kommen aus diagnosis.ts (E15).
import type { Method, Task } from '../../types.ts';
import { aiExplainTask, isAiAvailable } from '../../features/ai-client.ts';
import { aiControl } from '../../features/ai-view.ts';
import { h, type Child } from '../../ui/dom.ts';
import { button, feedbackHead, fold, icon, steps } from '../../ui/kit.ts';
import { inlineSheet, openSheet } from '../../ui/sheet.ts';
import { methodBlock, safeSteps } from '../../ui/widgets.ts';
import { t } from '../../i18n/index.ts';
import type { Diagnosis } from './diagnosis.ts';

/* ---------- Hilfe ---------- */

export interface Help {
  /** „Wie geht das?“ für die Dock-Zeile (null, wenn es weder Tipp noch Methode gibt) */
  btn: HTMLElement | null;
  /** Hinweisbox mit Glühbirne für die Bühne (anfangs versteckt) */
  box: HTMLElement;
  /** Wurde die Hilfe geöffnet (halbe Punkte)? */
  isAssisted(): boolean;
}

let helpUid = 0;

/** Tipp des Subtyps (kurz), sonst die Idee der Methode. Öffnen zählt als Hilfe (halbe Punkte). */
export function createHelp(
  tip: string,
  { isAnswered, onToggle }: { isAnswered: () => boolean; onToggle?: (open: boolean) => void },
): Help {
  let assisted = false;
  const id = `train-tip-${++helpUid}`;
  const box = h('div', { class: 'train-tip rise', id, hidden: true },
    h('span', { class: 'train-tip-icon' }, icon('bulb', 20)),
    h('span', { class: 'train-tip-text' }, tip, h('span', { class: 'train-tip-note' }, t('train.helpUsed'))));
  const btn = tip
    ? button({
      label: t('train.howTo'), kind: 'link', icon: 'bulb',
      onClick: () => {
        if (isAnswered()) return;
        const opening = box.hidden;
        if (opening) assisted = true;
        box.hidden = !opening;
        btn?.setAttribute('aria-expanded', String(opening));
        onToggle?.(opening);
      },
    })
    : null;
  btn?.setAttribute('aria-expanded', 'false');
  btn?.setAttribute('aria-controls', id);
  return { btn, box, isAssisted: () => assisted };
}

/** Dezenter Hinweis „Hilfe genutzt – halbe Punkte“ („Zeit abgelaufen“ steht schon im Detail, E15). */
const helpNote = (assisted: boolean): HTMLElement | null =>
  assisted ? h('p', { class: 'fb-note' }, t('train.helpUsed')) : null;

/* ---------- Feedback-Sheet (Zahlenaufgaben) ---------- */

export interface FeedbackParams {
  task: Task;
  given: number | null;
  diagnosis: Diagnosis;
  assisted: boolean;
  method: Method | null;
  isLast: boolean;
  onNext: () => void;
}

/** Inline-Sheet anstelle des Docks: Kopf, Lösungsweg (E16), Methode/KI (E17, E18), CTA „Weiter“. */
export function buildFeedback({ task, given, diagnosis, assisted, method, isLast, onNext }: FeedbackParams): { el: HTMLElement; nextBtn: HTMLElement } {
  const { kind } = diagnosis;
  const head = feedbackHead({
    tone: kind, title: diagnosis.title, detail: diagnosis.detail || undefined,
    note: assisted ? t('train.helpUsed') : undefined,
  });

  const list = safeSteps(task);
  const solution = list.length
    ? fold({ label: t('train.solution'), open: kind !== 'good', children: [steps(list)] })
    : null;

  const methodBtn = method
    ? button({ label: t('train.method'), icon: 'book', onClick: () => openMethodSheet(method) })
    : null;
  const ai = isAiAvailable() ? aiControl(t('train.aiExplain'), () => aiExplainTask(task, given, kind === 'good'), { kind: 'outline' }) : null;
  ai?.classList.add('train-fb-ai');
  const actions = methodBtn || ai
    ? h('div', { class: `train-fb-actions${methodBtn && ai ? '' : ' is-single'}` }, methodBtn, ai)
    : null;

  const nextBtn = button({ label: isLast ? t('train.toResult') : t('train.next'), kind: 'primary', full: true, onClick: onNext });
  const el = inlineSheet({ label: t('train.feedback'), children: [head, solution, actions, nextBtn] });
  return { el, nextBtn };
}

/**
 * Methode in einem zweiten Sheet über dem Feedback (E18), damit die Runde nicht abbricht. Ohne Link „In Lernen öffnen“:
 * im selben Tab bräche er die Runde ab, und ein neuer Tab öffnet in der installierten PWA den Browser. Das Sheet
 * zeigt die Methode ohnehin vollständig; nach der Runde führt das Ergebnis (Aufgabe antippen) in den Lernbereich.
 */
export function openMethodSheet(method: Method): void {
  openSheet({
    title: t('train.method'),
    children: [methodBlock(method, { pitfalls: true })],
  });
}

/* ---------- Auswahlaufgabe: Ergebnis in der Bühne ---------- */

/** Ergebniszeile unter der Aufgabe (rise; angesagt über die Live-Region der Bühne): Haken + „Richtig“ bzw. „Richtig ist …“ und Detail. */
export function choiceOutcome(diagnosis: Diagnosis, assisted: boolean): HTMLElement {
  const good = diagnosis.kind === 'good';
  const title: Child[] = [
    good ? h('span', { class: 'train-outcome-check draw', 'aria-hidden': 'true' }, icon('check', 22)) : null,
    diagnosis.title,
  ];
  return h('div', { class: 'train-outcome rise' },
    h('p', { class: `train-outcome-title${good ? ' is-good' : ''}` }, ...title),
    diagnosis.detail ? h('p', { class: 'train-outcome-detail num' }, diagnosis.detail) : null,
    helpNote(assisted));
}
