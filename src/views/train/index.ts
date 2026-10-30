import type { Attempt, CustomRange, Evaluation, Level, Mode, Task } from '../../types.ts';
import { unitFactor, parseAnswer } from '../../core/numbers.ts';
import { SUBTYPES, LEVEL_NAMES } from '../../core/catalog.ts';
import { generate, generateForMode } from '../../core/generators/index.ts';
import { evaluate, weaknesses, levelFor } from '../../core/scoring.ts';
import { getMethod } from '../../core/methods.ts';
import { modeName } from '../../core/modes.ts';
import { getAttempts, getSessions, getSettings, addAttempt, getReviews, setReviews } from '../../data/storage.ts';
import { dailyTasks } from '../../core/daily.ts';
import { dayKey, personalBest, ghostProgress } from '../../core/progress.ts';
import { recordResult, dueReviews } from '../../core/review.ts';
import { feedbackFx } from '../../ui/fx.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { methodBlock, safeSteps, stepsList } from '../../ui/widgets.ts';
import { setCleanup } from '../../router.ts';
import { createTimer, type TaskTimer } from './timer.ts';
import { createAnswer } from './answer.ts';
import { createHelp, buildFeedback } from './feedback.ts';
import { showResult } from './result.ts';
import { t } from '../../i18n/index.ts';

export interface TrainResult { task: Task; given: number | null; ev: Evaluation; timeMs: number }

/** Gemeinsamer Zustand einer Trainingsrunde (von index/result genutzt). */
export interface TrainCtx {
  mode: string;
  root: HTMLElement;
  results: TrainResult[];
  points: number;
  index: number;
  sessionId: string;
  startedAt: number;
  /** Hash für „Nochmal“ */
  restart: string;
  /** dayKey, nur im Daily-Modus */
  dailyKey: string | null;
  stop(): void;
}

export interface TrainOptions {
  n?: number | null;
  intro?: boolean;
  estimate?: boolean;
  custom?: CustomRange | null;
}

function loadRetryTasks(): Task[] | null {
  try {
    const raw = sessionStorage.getItem('mm.retry');
    if (!raw) return null;
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0 ? (arr as Task[]) : null;
  } catch {
    return null;
  }
}

export function renderTrain(modeIn: Mode, { n: nOverride = null, intro = false, estimate = false, custom = null }: TrainOptions = {}): void {
  const settings = getSettings();
  const timed = settings.timer !== false;
  let mode: Mode = modeIn;
  let notice: string | null = null;
  const today = dayKey(Date.now());

  // Feste Aufgabenlisten (Daily / Retry); Custom wird pro Aufgabe generiert
  let fixedTasks: Task[] | null = null;
  if (mode === 'daily') fixedTasks = dailyTasks(today);
  else if (mode === 'retry') {
    fixedTasks = loadRetryTasks();
    if (!fixedTasks) { mode = 'all'; notice = t('train.noRetry'); }
  } else if (mode === 'custom' && !custom) {
    mode = 'all';
    notice = t('train.noRange');
  }
  const fixedMode = mode === 'daily' || mode === 'retry' || mode === 'custom';
  const sessionLength = fixedTasks ? fixedTasks.length : mode === 'daily' ? 15 : nOverride || settings.sessionLength || 10;
  const est = (estimate || settings.estimateMode === true) && !fixedMode;
  const best = settings.ghost && !fixedMode ? personalBest(getSessions(), mode) : null;

  let weakSubtypes: string[] = [];
  let genMode = mode;
  if (mode === 'weak') {
    weakSubtypes = weaknesses(getAttempts(), undefined, { enabledCategories: settings.enabledCategories }).map((w) => w.subtype);
    if (weakSubtypes.length === 0) {
      genMode = 'all';
      notice = t('train.noWeak');
    }
  }

  let reviewSubtypes: string[] = [];
  if (mode === 'review') {
    reviewSubtypes = dueReviews(getReviews(), Date.now()).map((r) => r.subtype);
    if (reviewSubtypes.length === 0) {
      genMode = 'all';
      notice = t('train.noReview');
    }
  }

  let timer: TaskTimer | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let ghostTimer: ReturnType<typeof setInterval> | null = null;
  let ghostEl: HTMLElement | null = null;
  let autoFailTimer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer) { timer.stop(); timer = null; }
    if (autoFailTimer !== null) { clearInterval(autoFailTimer); autoFailTimer = null; }
    if (ghostTimer !== null) { clearInterval(ghostTimer); ghostTimer = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    document.body.classList.remove('has-keypad', 'kp-scroll');
  };
  setCleanup(stop);

  const root = h('div', { class: 'train play' });
  app.append(root);

  const ctx: TrainCtx = {
    mode, root, results: [], points: 0, index: 0,
    sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    restart: mode === 'custom' ? location.hash : `#/train/${mode}`,
    dailyKey: mode === 'daily' ? today : null,
    stop,
  };

  const setKeyHandler = (fn: (e: KeyboardEvent) => void): void => {
    onKey = fn;
    document.addEventListener('keydown', fn);
  };

  // Kopf: Zurück + Level/Punkte, darunter Fortschritts- und Zeitbalken mit Beschriftung rechts
  function header(levelName: string, timerRow: HTMLElement | null): HTMLElement[] {
    ghostEl = null;
    if (best) {
      ghostEl = h('span', { class: 'ghost-marker', 'aria-hidden': 'true', title: t('train.personalBest') }, h('span', { class: 'ghost-label' }, t('train.bestLabel')));
      const g = ghostEl;
      const tick = (): void => g.style.setProperty('--ghost', String(Math.max(0, Math.min(100, (ghostProgress(best, Date.now() - ctx.startedAt, sessionLength) ?? 0) * 100))));
      tick();
      ghostTimer = setInterval(tick, 200);
    }
    const fill = h('span');
    fill.style.setProperty('--w', String((ctx.index / sessionLength) * 100));
    return [
      h('div', { class: 'play-head' },
        h('div', { class: 'train-head' },
          h('a', { class: 'back-link', href: '#/' }, t('train.backMode', { mode: modeName(mode) })),
          h('span', { class: 'muted' }, `${levelName ? `${levelName} · ` : ''}${t('common.pointsValue', { n: ctx.points })}`)),
        h('div', { class: 'bar-row' },
          h('div', { class: 'progress-wrap' },
            h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(sessionLength), 'aria-valuenow': String(ctx.index) }, fill),
            ghostEl),
          h('span', { class: 'bar-label' }, `${ctx.index + 1}/${sessionLength}`)),
        timerRow),
    ];
  }

  function next(): void {
    ctx.index += 1;
    if (ctx.index >= sessionLength) showResult(ctx);
    else showTask();
  }

  function showTask(): void {
    stop();
    const task: Task = fixedTasks
      ? fixedTasks[ctx.index]!
      : mode === 'custom' && custom
      ? generate(custom.kind === 'mul' ? 'custom.mul' : 'custom.square', Math.random, { level: 2, custom })
      : generateForMode(genMode, {
        enabledCategories: settings.enabledCategories,
        weakSubtypes, reviewSubtypes,
        levelFor: (id: string): Level => levelFor(id, getAttempts(), settings.difficulty),
      });
    const taskEst = est && task.kind !== 'choice';
    const sub = SUBTYPES[task.subtype];
    const method = getMethod(task.subtype);
    const t0 = performance.now();
    let answered = false;
    const question = h('div', { class: `question${task.prompt.length > 22 ? ' long' : ''}` }, task.prompt);
    const actions = h('div', { class: 'actions', 'aria-live': 'polite' });

    const answer = createAnswer(task, {
      keypadSetting: settings.keypad || 'auto',
      haptics: settings.haptics !== false,
      numpadLayout: settings.numpadLayout === 'phone' ? 'phone' : 'calculator',
      autoCheck: settings.autoSubmit && task.kind !== 'choice'
        ? (v: number): boolean => evaluate(task, v, Math.round(performance.now() - t0), { assisted: help.isAssisted(), untimed: !timed, estimate: taskEst }).correct
        : null,
      onFinish: (given) => finish(given),
    });
    const { isChoice, input } = answer;
    const help = createHelp(method, { isAnswered: () => answered, focusInput: isChoice ? null : () => input.focus() });
    actions.append(...answer.actionNodes);

    const localTimer = timed ? createTimer(task, t0) : null;
    timer = localTimer;
    if (localTimer) localTimer.start();

    // Auto-Fail: bei Ablauf der Zielzeit die aktuelle Eingabe abgeben (finish ist idempotent)
    if (settings.autoFail === true && timed) {
      autoFailTimer = setInterval(() => {
        if (answered) return;
        if (performance.now() - t0 < task.targetMs) return;
        finish(isChoice ? null : parseAnswer(input.value), true);
      }, 100);
    }

    function finish(given: number | null, timedOut = false): void {
      if (answered) return;
      answered = true;
      const timeMs = Math.round(performance.now() - t0);
      stop();
      if (localTimer) localTimer.freeze(timeMs);
      answer.lock(given);
      help.wrap.remove();
      answer.removeKeypad();
      const assisted = help.isAssisted();
      const ev = evaluate(task, given, timeMs, { assisted, untimed: !timed, estimate: taskEst });
      ctx.points += ev.points;
      ctx.results.push({ task, given, ev, timeMs });
      const attempt: Attempt = {
        ts: Date.now(), sessionId: ctx.sessionId, mode, category: task.category, subtype: task.subtype,
        prompt: task.prompt, unit: task.unit, expected: task.expected, given,
        correct: ev.correct, errorType: ev.errorType, timeMs, targetMs: task.targetMs,
        weight: task.weight, points: ev.points, params: task.params, assisted,
        ...(task.kind === 'choice' ? { kind: 'choice' as const, choices: task.choices.slice() } : {}),
        level: task.level, untimed: !timed, isReview: mode === 'review',
        ...(taskEst ? { estimate: true } : {}),
      };
      addAttempt(attempt);
      setReviews(recordResult(getReviews(), {
        subtype: task.subtype, correct: ev.correct, ts: Date.now(), isReview: mode === 'review',
      }));
      feedbackFx(ev.correct);
      question.classList.add(ev.correct ? 'anim-pop' : 'anim-shake');
      const fb = buildFeedback({
        task, ev, timeMs, given, assisted, method,
        isLast: ctx.index + 1 >= sessionLength, onNext: next, timedOut,
      });
      actions.replaceChildren(...fb.nodes);
      fb.nextBtn.focus();
    }

    setKeyHandler((e) => {
      if (isChoice && task.kind === 'choice' && !answered && /^[1-4]$/.test(e.key) && Number(e.key) <= task.choices.length) {
        e.preventDefault();
        finish(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        const el = e.target;
        if (el instanceof Element && (el.closest('button, a, summary, .ai-box'))) return;
        e.preventDefault();
        if (answered) next();
        else if (!isChoice) answer.check.click();
      } else if (e.key === 'Escape' && !answered) {
        e.preventDefault();
        finish(null);
      }
    });

    root.replaceChildren();
    appendChildren(root, [
      ...header(LEVEL_NAMES[task.level] || LEVEL_NAMES[2], localTimer ? h('div', { class: 'bar-row' }, localTimer.bar, localTimer.label) : null),
      notice ? h('p', { class: 'notice' }, notice) : null,
      h('div', { class: 'task' },
        // Typ nur zeigen, wenn er nicht schon in der Kopfzeile steht (gemischte Runden)
        SUBTYPES[mode] ? null : h('div', { class: 'task-type' }, sub ? sub.name : task.subtype),
        question,
        taskEst ? h('div', { class: 'est-hint' }, t('train.estimateHint')) : null,
        h('div', { class: 'hint' }, task.hint || (!isChoice && unitFactor(task.unit) > 1 ? t('train.unitHint', { unit: task.unit }) : '')),
        answer.answerRow,
        help.wrap,
        answer.choicesEl,
        actions)]);
    answer.mountKeypad(root, help.btn);
    if (!isChoice) input.focus();
  }

  function showIntro(): void {
    const subId = SUBTYPES[mode] ? mode : null;
    const method = subId ? getMethod(subId) : null;
    if (!subId || !method) { showTask(); return; }
    const ex = generate(subId, Math.random, { level: levelFor(subId, getAttempts(), settings.difficulty) });
    const steps = safeSteps(ex);
    const start = h('button', { type: 'button', class: 'btn primary', onclick: () => showTask() }, t('common.letsGo'));
    setKeyHandler((e) => {
      if (e.key !== 'Enter') return;
      const el = e.target;
      if (el instanceof Element && el.closest('button, a, summary')) return;
      e.preventDefault();
      start.click();
    });
    root.replaceChildren(
      h('div', { class: 'train-head' }, h('a', { class: 'back-link', href: '#/' }, t('train.backMode', { mode: modeName(mode) }))),
      h('div', { class: 'intro-card' },
        h('h1', { class: 'page-title' }, SUBTYPES[subId]?.name),
        methodBlock(method),
        steps.length
          ? h('div', null, h('h3', { class: 'fb-heading' }, t('train.example', { prompt: ex.prompt })), stepsList(steps))
          : null,
        start));
    start.focus();
  }

  if (intro) showIntro();
  else showTask();
}

