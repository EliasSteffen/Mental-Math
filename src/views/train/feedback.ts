import type { Evaluation, Method, Task } from '../../types.ts';
import { fmt, fmtSeconds, unitFactor } from '../../core/numbers.ts';
import { aiExplainTask, isAiAvailable } from '../../features/ai-client.ts';
import { aiControl } from '../../features/ai-view.ts';
import { appendChildren, h } from '../../ui/dom.ts';
import { fold, methodBlock, safeSteps, stepsList } from '../../ui/widgets.ts';
import { t } from '../../i18n/index.ts';

export interface Help {
  /** Container („Wie geht das?“ + Hilfebox); wird nach der Antwort entfernt */
  wrap: HTMLElement;
  /** Der Hilfe-Button (null, wenn es keine Methode gibt) */
  btn: HTMLElement | null;
  /** Wurde die Hilfe geöffnet (halbe Punkte)? */
  isAssisted(): boolean;
}

export function createHelp(
  method: Method | null,
  { isAnswered, focusInput }: { isAnswered: () => boolean; focusInput: (() => void) | null },
): Help {
  let assisted = false;
  const box = h('div', { class: 'help', hidden: true });
  const btn: HTMLButtonElement | null = method
    ? h('button', {
      type: 'button', class: 'linkbtn', 'aria-expanded': 'false',
      onclick: () => {
        if (isAnswered()) return;
        const opening = box.hidden;
        if (opening && !assisted) {
          assisted = true;
          box.replaceChildren(
            h('p', { class: 'small muted' }, t('train.helpUsed')),
            methodBlock(method));
        }
        box.hidden = !opening;
        btn?.setAttribute('aria-expanded', String(opening));
        // mit offener Hilfe darf die Seite trotz Tastenfeld scrollen
        document.body.classList.toggle('kp-scroll', opening);
        if (focusInput) focusInput();
      },
    }, t('train.howTo'))
    : null;
  const wrap = h('div', { class: 'help-wrap' }, btn, box);
  return { wrap, btn, isAssisted: () => assisted };
}

export interface FeedbackParams {
  task: Task;
  ev: Evaluation;
  timeMs: number;
  given: number | null;
  assisted: boolean;
  method: Method | null;
  isLast: boolean;
  onNext: () => void;
  /** Zeit abgelaufen (Auto-Fail) */
  timedOut?: boolean;
}

const LABELS: Record<string, () => string> = {
  nullen: () => t('train.errZeros'), knapp: () => t('train.errClose'), falsch: () => t('common.wrong'), skip: () => t('common.skipped'),
};

/** Baut die Aktionszeile nach der Antwort und liefert sie samt „Weiter“-Button (für Fokus). */
export function buildFeedback({ task, ev, timeMs, given, assisted, method, isLast, onNext, timedOut = false }: FeedbackParams): { nodes: Node[]; nextBtn: HTMLButtonElement } {
  const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
  const fb = h('div', { class: `feedback ${ev.correct ? 'good anim-pop' : 'bad anim-shake'}` });
  const uF = unitFactor(task.unit);
  const fullText = uF > 1
    ? ` (= ${fmt(Number((task.expected * uF).toPrecision(12)))}${task.unit.includes('€') ? ' €' : ''})`
    : '';
  const answerText = choices ? String(choices[task.expected]) : `${fmt(task.expected)}${task.unit ? ' ' + task.unit : ''}${fullText}`;
  const timeoutNote = timedOut ? h('div', { class: 'fb-tip' }, t('train.timeUp')) : null;
  const assistNote = assisted ? h('div', { class: 'fb-tip' }, t('train.helpUsed')) : null;
  if (ev.correct) {
    appendChildren(fb, [
      h('div', { class: 'fb-title' }, `✓ ${t('common.correct')}`),
      h('div', { class: 'fb-detail' }, `${fmtSeconds(timeMs)} · +${t('common.pointsValue', { n: ev.points })}`),
      timeoutNote,
      assistNote]);
  } else {
    appendChildren(fb, [
      h('div', { class: 'fb-title' }, `✗ ${(ev.errorType && LABELS[ev.errorType]?.()) || t('common.wrong')}`),
      h('div', { class: 'fb-detail' }, t('train.rightAnswer', { answer: answerText })),
      h('div', { class: 'fb-detail' }, `${fmtSeconds(timeMs)} · ${ev.points > 0 ? '+' : ''}${t('common.pointsValue', { n: ev.points })}`),
      timeoutNote,
      assistNote]);
  }
  const steps = safeSteps(task);
  const solution = steps.length
    ? (ev.correct
      ? fold(t('train.viewSolution'), stepsList(steps))
      : h('section', { class: 'fb-section' }, h('h3', { class: 'fb-heading' }, t('train.solution')), stepsList(steps)))
    : null;
  const methodFold = method
    ? fold(t('train.howToSolve'), methodBlock(method, { pitfalls: true, link: `#/lernen/${task.subtype}` }))
    : null;
  const ai = isAiAvailable() ? aiControl(t('train.aiExplain'), () => aiExplainTask(task, given)) : null;
  const nextBtn = h('button', { type: 'button', class: 'btn primary next-btn', onclick: onNext },
    isLast ? t('common.resultEnter') : t('common.nextEnter'));
  const nodes: Node[] = [fb, solution, methodFold, ai, nextBtn].filter((n): n is HTMLElement => n !== null);
  return { nodes, nextBtn };
}
