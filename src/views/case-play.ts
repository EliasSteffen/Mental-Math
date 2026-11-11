// Mini-Case spielen (v9 C): Kopf mit ✕ und Schritt-Segmenten, Fallbeschreibung (einklappbar), aktueller Schritt, Dock mit
// Tastenfeld bzw. Auswahl, Feedback-Sheet; am Ende Ergebnis mit Schrittliste. Aufbau und Bausteine wie das Training
// (src/views/train/*); es werden keine Attempts gespeichert, nur eine Session `case:<Vorlage>`.
import type { Evaluation, Task } from '../types.ts';
import { generateCase } from '../core/cases/index.ts';
import type { CaseStep, MiniCase } from '../core/cases/index.ts';
import { stepTask } from '../core/cases/task.ts';
import { mulberry32 } from '../core/daily.ts';
import { evaluate } from '../core/scoring.ts';
import { fmt, fmtSeconds, unitFactor } from '../core/numbers.ts';
import { addSession, getSettings } from '../data/storage.ts';
import { app, h } from '../ui/dom.ts';
import { go, setCleanup } from '../router.ts';
import { answerFx } from '../ui/fx.ts';
import { dock, tapGuard } from '../ui/dock.ts';
import { renderExhibit } from '../ui/exhibit.ts';
import { bindResultKeys, isModalOpen } from '../ui/modal.ts';
import { button, feedbackHead, focusHead, fold, group, icon, list, resultRow, resultSegments, segments, steps } from '../ui/kit.ts';
import { inlineSheet, isSheetOpen, openSheet } from '../ui/sheet.ts';
import { setTitle } from '../ui/title.ts';
import { createAnswer } from './train/answer.ts';
import { diagnose, answerText, givenAnswerText } from './train/diagnosis.ts';
import { choiceOutcome } from './train/feedback.ts';
import { createTimer, type TaskTimer } from './train/timer.ts';
import { t } from '../i18n/index.ts';

interface StepResult { step: CaseStep; task: Task; given: number | null; ev: Evaluation; timeMs: number }

/** Ist die Seite höher als der Bildschirm, ans Ende scrollen (Antwortfeld bzw. Korrektur stehen dann über Dock/Sheet). */
function revealBottom(): void {
  requestAnimationFrame(() => {
    const doc = document.documentElement;
    if (doc.scrollHeight > window.innerHeight + 1) window.scrollTo(0, doc.scrollHeight);
  });
}

/** Kurzform eines Schritts für Listen: nur die Frage nach dem „weiterrechnen:“, Entscheidungen als „Entscheidung“. */
function shortPrompt(step: CaseStep): string {
  if (step.kind === 'choice') return t('cases.decision');
  const i = step.prompt.lastIndexOf(': ');
  const q = i >= 0 ? step.prompt.slice(i + 2) : step.prompt;
  return q.charAt(0).toUpperCase() + q.slice(1);
}

/** Gegebene Antwort als Text (Auswahl-Option oder Zahl mit Einheit). */
function givenText(r: StepResult): string {
  if (r.given === null) return '–';
  if (r.task.kind === 'choice') return String(r.task.choices[r.given] ?? '–');
  return givenAnswerText(r.task, r.given);
}

export function renderCasePlay(templateId: string, fromRandom: boolean): void {
  const settings = getSettings();
  const timed = settings.timer !== false;
  const display = settings.timerDisplay ?? 'calm';
  const mc: MiniCase = generateCase(templateId, mulberry32(Math.floor(Math.random() * 4294967296)));
  const total = mc.steps.length;
  const results: StepResult[] = [];
  const startedAt = Date.now();
  const sessionId = `s${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let points = 0;
  let index = 0;
  let briefOpen = true;

  let timer: TaskTimer | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let unbindResult: (() => void) | null = null;
  const stop = (): void => {
    if (timer) { timer.stop(); timer = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (unbindResult) { unbindResult(); unbindResult = null; }
  };
  setCleanup(stop);

  const seg = segments({ total, done: 0, current: true });
  const head = focusHead({
    closeLabel: t('cases.exit'), href: '#/case',
    children: [h('div', { class: 'train-progress' }, seg.el)],
  });
  let line: HTMLElement | null = null;
  const setLine = (el: HTMLElement | null): void => {
    line?.remove();
    line = el;
    if (el) head.append(el);
  };
  const setKeyHandler = (fn: (e: KeyboardEvent) => void): void => {
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = fn;
    document.addEventListener('keydown', fn);
  };

  /** Fallbeschreibung mit Exhibit; nach dem ersten Schritt eingeklappt (bleibt antippbar). */
  function briefBlock(): HTMLElement {
    const el = h('details', { class: 'case-brief' },
      h('summary', { class: 'case-brief-sum press' },
        h('span', { class: 'case-brief-text' },
          h('span', { class: 'case-brief-label' }, t('cases.caseLabel')),
          h('span', { class: 'case-brief-title' }, mc.title)),
        h('span', { class: 'case-brief-chevron', 'aria-hidden': 'true' }, icon('chevron-down', 18))),
      h('div', { class: 'case-brief-body' },
        h('p', { class: 'case-brief-p' }, mc.brief),
        renderExhibit(mc.exhibit)));
    el.open = briefOpen;
    el.addEventListener('toggle', () => { briefOpen = el.open; });
    return el;
  }

  function next(): void {
    index += 1;
    if (index >= total) showResult();
    else showStep();
  }

  function showStep(): void {
    stop();
    const step = mc.steps[index] as CaseStep;
    const task = stepTask(step, templateId, index);
    const isLast = index + 1 >= total;
    if (index === 1) briefOpen = false;
    const t0 = performance.now();
    let answered = false;
    let advanced = false;
    const advance = (): void => {
      if (advanced) return;
      advanced = true;
      next();
    };

    const answer = createAnswer(task, {
      keypadSetting: settings.keypad || 'auto',
      numpadLayout: settings.numpadLayout === 'phone' ? 'phone' : 'calculator',
      autoCheck: settings.autoSubmit && task.kind !== 'choice'
        ? (v: number): boolean => evaluate(task, v, Math.round(performance.now() - t0), { untimed: !timed }).correct
        : null,
      onFinish: (given) => finish(given),
    });
    const { isChoice, input } = answer;
    const skip = button({ label: t('common.dontKnow'), kind: 'quiet', onClick: () => finish(null) });
    const dockRow = h('div', { class: 'train-dock-row' }, skip);
    const dockEl = isChoice ? dock(answer.dockEl, dockRow) : dock(dockRow, answer.dockEl);
    const armDock = tapGuard(dockEl);

    seg.set(index, true);
    const localTimer = createTimer({ targetMs: task.targetMs, t0, display });
    setLine(localTimer.line);
    timer = localTimer;
    localTimer.start();

    const hint = task.hint || (!isChoice && unitFactor(task.unit) > 1 ? t('train.unitHint', { unit: task.unit }) : '');
    const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    const stage = h('div', { class: 'stage train-stage case-stage' },
      h('p', { class: 'train-cat' },
        isChoice ? `${t('cases.decision')} · ${t('cases.stepOf', { n: index + 1, total })}` : t('cases.stepOf', { n: index + 1, total })),
      briefBlock(),
      h('h1', { class: 'train-q is-long case-q' }, step.prompt),
      hint ? h('p', { class: 'train-hint' }, hint) : null,
      answer.stageEl,
      live);

    function finish(given: number | null): void {
      if (answered) return;
      answered = true;
      const timeMs = Math.round(performance.now() - t0);
      stop();
      localTimer.freeze(timeMs);
      const ev = evaluate(task, given, timeMs, { untimed: !timed });
      points += ev.points;
      results.push({ step, task, given, ev, timeMs });
      answerFx(ev.correct);
      seg.set(index + 1, false);

      const diagnosis = diagnose({ task, given, ev, timeMs, why: step.kind === 'choice' ? step.why : '' });
      answer.lock(given, diagnosis.kind, { value: isChoice ? '' : fmt(task.expected), unit: task.unit });
      live.textContent = [diagnosis.title, diagnosis.detail].filter(Boolean).join('. ');
      const nextLabel = isLast ? t('train.toResult') : t('train.next');
      let nextBtn: HTMLElement;
      if (step.kind === 'choice') {
        stage.append(choiceOutcome(diagnosis, false));
        nextBtn = button({ label: nextLabel, kind: 'primary', full: true, onClick: advance });
        nextBtn.classList.add('rise');
        dockRow.replaceWith(nextBtn);
        armDock();
      } else {
        nextBtn = button({ label: nextLabel, kind: 'primary', full: true, onClick: advance });
        const sheet = inlineSheet({
          label: t('train.feedback'),
          children: [
            feedbackHead({ tone: diagnosis.kind, title: diagnosis.title, detail: diagnosis.detail || undefined }),
            fold({ label: t('train.solution'), open: diagnosis.kind !== 'good', children: [steps(step.solution)] }),
            nextBtn,
          ],
        });
        dockEl.replaceWith(sheet);
        tapGuard(sheet);
      }
      revealBottom();
      nextBtn.focus({ preventScroll: true });
    }

    setKeyHandler((e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isSheetOpen() || isModalOpen()) return;
      if (step.kind === 'choice' && !answered && /^[1-4]$/.test(e.key) && Number(e.key) <= step.choices.length) {
        e.preventDefault();
        finish(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        const el = e.target;
        if (el instanceof Element && el.closest('button, a, summary')) return;
        e.preventDefault();
        if (answered) advance();
        else answer.submit();
      } else if (e.key === 'Escape' && !answered) {
        e.preventDefault();
        finish(null);
      }
    });

    app.replaceChildren(head, stage, dockEl);
    if (!isChoice) answer.focus();
    revealBottom();
  }

  /** Lösungsweg bzw. Begründung eines Schritts im Sheet. */
  function openStepSheet(r: StepResult): void {
    const body = r.step.kind === 'choice'
      ? h('p', { class: 'case-why' }, r.step.why)
      : steps(r.step.solution);
    openSheet({
      title: r.step.prompt,
      children: [
        h('p', { class: 'case-sheet-answer num' }, `${t('train.correctIs')} ${answerText(r.task)}`),
        body,
      ],
    });
  }

  function stepRow(r: StepResult): HTMLElement {
    const ok = r.ev.correct;
    const right = answerText(r.task);
    const sub = ok
      ? fmtSeconds(r.timeMs)
      : r.given === null ? t('train.rowSkipped', { right }) : t('train.rowWrong', { given: givenText(r), right });
    return resultRow({ ok, label: shortPrompt(r.step), sub, onClick: () => openStepSheet(r) });
  }

  function showResult(): void {
    stop();
    const n = results.length;
    const correct = results.filter((r) => r.ev.correct).length;
    const avg = n ? results.reduce((s, r) => s + r.timeMs, 0) / n : 0;
    // Keine Attempts: nur eine Runde, die fürs Tagesziel zählt
    addSession({ id: sessionId, ts: startedAt, mode: `case:${templateId}`, n, correct, points, avgTimeMs: Math.round(avg) });

    const wrongRows = results.filter((r) => !r.ev.correct).map(stepRow);
    const rightRows = results.filter((r) => r.ev.correct).map(stepRow);
    const title = h('h1', { class: 'train-result-title num', tabindex: '-1' }, t('cases.resultScore', { good: correct, n }));
    const nextHash = fromRandom ? '#/case/random' : `#/case/${templateId}`;
    app.replaceChildren(
      h('div', { class: 'stage is-start train-result' },
        h('header', { class: 'train-result-head' },
          h('p', { class: 'train-result-sub' }, mc.title),
          title,
          h('p', { class: 'train-result-avg num' }, t('cases.avgPerStep', { time: fmtSeconds(avg) }))),
        n ? resultSegments(results.map((r) => r.ev.correct)) : null,
        n ? group({ title: t('cases.steps'), meta: wrongRows.length ? t('train.wrongFirst') : undefined }, list([...wrongRows, ...rightRows])) : null),
      dock(
        h('div', { class: 'train-result-actions' }, button({ label: t('train.done'), href: '#/' })),
        button({ label: t('cases.nextCase'), kind: 'primary', full: true, onClick: () => go(nextHash) })));
    setTitle(t('common.roundDone'));
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
    unbindResult = bindResultKeys(() => go(nextHash), () => go('#/'));
  }

  showStep();
}
