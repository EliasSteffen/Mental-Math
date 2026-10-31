// Training im Fokus-Modus (Ruhiger Fokus): Kopf mit ✕, Segmenten und Zeitlinie, Bühne mit der Aufgabe,
// Dock mit Tastenfeld bzw. Auswahl; nach der Antwort ersetzt das Feedback-Sheet das Dock.
// Der fachliche Ablauf (Modi, Schätzen, Auto-Submit, Auto-Fail, Ghost, Bewertung, Wiederholung) ist unverändert.
import type { Attempt, CustomRange, Evaluation, Level, Mode, Task, TimerDisplay } from '../../types.ts';
import { fmt, parseAnswer, unitFactor } from '../../core/numbers.ts';
import { CATEGORIES, SUBTYPES, LEVEL_NAMES } from '../../core/catalog.ts';
import { generate, generateForMode } from '../../core/generators/index.ts';
import { evaluate, weaknesses, levelFor } from '../../core/scoring.ts';
import { getMethod } from '../../core/methods.ts';
import { modeName } from '../../core/modes.ts';
import { getAttempts, getSessions, getSettings, addAttempt, getReviews, setReviews } from '../../data/storage.ts';
import { dailyTasks } from '../../core/daily.ts';
import { dayKey, personalBest, ghostProgress } from '../../core/progress.ts';
import { recordResult, dueReviews } from '../../core/review.ts';
import { answerFx } from '../../ui/fx.ts';
import { app, h } from '../../ui/dom.ts';
import { button, card, focusHead, group, largeTitle, segments, steps } from '../../ui/kit.ts';
import { dock, tapGuard } from '../../ui/dock.ts';
import { isSheetOpen } from '../../ui/sheet.ts';
import { isModalOpen } from '../../ui/modal.ts';
import { methodBlock, safeSteps } from '../../ui/widgets.ts';
import { setCleanup } from '../../router.ts';
import { createTimer, type TaskTimer } from './timer.ts';
import { createAnswer } from './answer.ts';
import { buildFeedback, choiceOutcome, createHelp } from './feedback.ts';
import { diagnose } from './diagnosis.ts';
import { showBreathe } from './breathe.ts';
import { showResult } from './result.ts';
import { t } from '../../i18n/index.ts';

export interface TrainResult { task: Task; given: number | null; ev: Evaluation; timeMs: number }

/** Gemeinsamer Zustand einer Trainingsrunde (von index/result genutzt). */
export interface TrainCtx {
  mode: string;
  /** #app (Fokus-Layout: Kopf, Bühne, Dock als direkte Kinder) */
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

/** Ab dieser Länge steht die Aufgabe als Text (20 px, max. 30ch) statt als große Zahl. */
const LONG_PROMPT = 22;

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

/** Ist die Seite höher als der Bildschirm, ans Ende scrollen: Antwortfeld bzw. Korrektur stehen dann direkt über Dock/Sheet. */
function revealBottom(): void {
  requestAnimationFrame(() => {
    const doc = document.documentElement;
    if (doc.scrollHeight > window.innerHeight + 1) window.scrollTo(0, doc.scrollHeight);
  });
}

/** Tastatur-Shortcuts gelten nicht, solange ein Sheet oder Modal offen ist oder eine Modifikatortaste gedrückt ist. */
function shortcutBlocked(e: KeyboardEvent): boolean {
  return e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isSheetOpen() || isModalOpen();
}

export function renderTrain(modeIn: Mode, { n: nOverride = null, intro = false, estimate = false, custom = null }: TrainOptions = {}): void {
  const settings = getSettings();
  const timed = settings.timer !== false;
  const display: TimerDisplay = settings.timerDisplay ?? 'calm';
  const precise = display === 'precise';
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
  // Ghost (Bestzeit) nur bei präziser Zeitanzeige (E13)
  const best = settings.ghost && precise && !fixedMode ? personalBest(getSessions(), mode) : null;

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
  let autoFailTimer: ReturnType<typeof setInterval> | null = null;
  let breatheStop: (() => void) | null = null;

  const stop = (): void => {
    if (timer) { timer.stop(); timer = null; }
    if (autoFailTimer !== null) { clearInterval(autoFailTimer); autoFailTimer = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (breatheStop) { breatheStop(); breatheStop = null; }
  };
  setCleanup(stop);

  const root = app;
  const ctx: TrainCtx = {
    mode, root, results: [], points: 0, index: 0,
    sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    restart: mode === 'custom' ? location.hash : `#/train/${mode}`,
    dailyKey: mode === 'daily' ? today : null,
    stop,
  };

  const setKeyHandler = (fn: (e: KeyboardEvent) => void): void => {
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = fn;
    document.addEventListener('keydown', fn);
  };

  // Kopf: bleibt über alle Aufgaben stehen (Segmente animieren weich); nur die Zeitlinie wird je Aufgabe neu gesetzt
  const seg = segments({ total: sessionLength, done: 0, current: true });
  const ghost = best ? h('span', { class: 'train-ghost', 'aria-hidden': 'true', title: t('train.personalBest') }) : null;
  const timeText = precise ? h('span', { class: 'train-time num', 'aria-hidden': 'true' }) : null;
  const head = focusHead({
    closeLabel: t('train.exit'), href: '#/',
    children: [h('div', { class: 'train-progress' }, seg.el, ghost), timeText],
  });
  let line: HTMLElement | null = null;
  const setLine = (el: HTMLElement | null): void => {
    line?.remove();
    line = el;
    if (el) head.append(el);
  };
  // Ghost läuft ab der ersten Aufgabe – nicht schon während Atempause oder Methoden-Intro (startedAt bleibt der Sessionstart)
  let ghostStart: number | null = null;
  const ghostTick = ghost && best
    ? (): void => {
      const p = ghostProgress(best, Date.now() - (ghostStart ?? Date.now()), sessionLength) ?? 0;
      ghost.style.setProperty('--w', String(Math.round(p * 1000) / 10));
    }
    : undefined;

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
    const cat = CATEGORIES.find((c) => c.id === task.category);
    const method = getMethod(task.subtype);
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
        ? (v: number): boolean => evaluate(task, v, Math.round(performance.now() - t0), { assisted: help.isAssisted(), untimed: !timed, estimate: taskEst }).correct
        : null,
      onFinish: (given) => finish(given),
    });
    const { isChoice, input } = answer;
    const help = createHelp(sub?.tip || method?.idea || '', {
      isAnswered: () => answered,
      onToggle: (open) => {
        if (open) revealBottom();
        if (!isChoice) answer.focus();
      },
    });

    // Dock: Zahlenaufgabe = Hilfe/Weiß-nicht über dem Tastenfeld; Auswahl = Raster, darunter Hilfe/Weiß-nicht
    const skip = button({ label: t('common.dontKnow'), kind: 'quiet', onClick: () => finish(null) });
    const dockRow = h('div', { class: 'train-dock-row' }, help.btn, skip);
    const dockEl = isChoice ? dock(answer.dockEl, dockRow) : dock(dockRow, answer.dockEl);
    // Zweiter Tipp eines Doppeltipps auf „Weiter“ bzw. „Los geht's“ landet sonst schon im Tastenfeld/Auswahl-Raster
    const armDock = tapGuard(dockEl);

    ghostStart ??= Date.now();
    seg.set(ctx.index, true);
    const localTimer = createTimer({ targetMs: task.targetMs, t0, display, text: timeText, onTick: ghostTick });
    setLine(localTimer.line);
    timer = localTimer;
    localTimer.start();

    // Auto-Fail: bei Ablauf der Zielzeit die aktuelle Eingabe abgeben (finish ist idempotent)
    if (settings.autoFail === true && timed) {
      autoFailTimer = setInterval(() => {
        if (answered) return;
        if (performance.now() - t0 < task.targetMs) return;
        finish(isChoice ? null : parseAnswer(input.value), true);
      }, 100);
    }

    const hint = task.hint || (!isChoice && unitFactor(task.unit) > 1 ? t('train.unitHint', { unit: task.unit }) : '');
    const long = task.prompt.length > LONG_PROMPT;
    // Steht schon vor der Antwort im DOM, damit Screenreader die Diagnose zuverlässig ansagen
    const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    const stage = h('div', { class: 'stage train-stage' },
      notice && ctx.index === 0 ? h('p', { class: 'train-notice' }, notice) : null,
      h('p', { class: 'train-cat' }, `${cat ? cat.name : task.category} · ${sub ? sub.name : task.subtype}`),
      precise ? h('p', { class: 'train-meta num' }, `${LEVEL_NAMES[task.level] ?? LEVEL_NAMES[2]} · ${t('common.pointsValue', { n: ctx.points })}`) : null,
      h('h1', { class: long ? 'train-q is-long' : 'train-q num' }, task.prompt),
      taskEst ? h('p', { class: 'train-pill' }, t('train.estimateHint')) : null,
      hint ? h('p', { class: 'train-hint' }, hint) : null,
      help.box,
      answer.stageEl,
      live);

    function finish(given: number | null, timedOut = false): void {
      if (answered) return;
      answered = true;
      const timeMs = Math.round(performance.now() - t0);
      stop();
      localTimer.freeze(timeMs);
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
      answerFx(ev.correct);
      seg.set(ctx.index + 1, false);
      help.box.remove();

      const why = isChoice ? (safeSteps(task)[0] ?? task.hint) : '';
      const diagnosis = diagnose({ task, given, ev, timeMs, timedOut, showPoints: precise, why });
      answer.lock(given, diagnosis.kind, { value: isChoice ? '' : fmt(task.expected), unit: task.unit });
      live.textContent = [diagnosis.title, diagnosis.detail].filter(Boolean).join('. ');
      const isLast = ctx.index + 1 >= sessionLength;
      let nextBtn: HTMLElement;
      if (isChoice) {
        // Auswahl: Ergebnis in der Bühne, „Weiter“ ersetzt Hilfe/Weiß-nicht im Dock
        stage.append(choiceOutcome(diagnosis, assisted));
        nextBtn = button({ label: isLast ? t('train.toResult') : t('train.next'), kind: 'primary', full: true, onClick: advance });
        nextBtn.classList.add('rise');
        dockRow.replaceWith(nextBtn);
        armDock();
      } else {
        const fb = buildFeedback({ task, given, diagnosis, assisted, method, isLast, onNext: advance });
        dockEl.replaceWith(fb.el);
        // Doppeltipp auf „Prüfen“ (oder Tippen beim Auto-Fail) überspringt sonst das Feedback; Enter gilt sofort
        tapGuard(fb.el);
        nextBtn = fb.nextBtn;
      }
      revealBottom();
      nextBtn.focus({ preventScroll: true });
    }

    setKeyHandler((e) => {
      if (shortcutBlocked(e)) return;
      if (task.kind === 'choice' && !answered && /^[1-4]$/.test(e.key) && Number(e.key) <= task.choices.length) {
        e.preventDefault();
        finish(Number(e.key) - 1);
      } else if (e.key === 'Enter') {
        const el = e.target;
        if (el instanceof Element && el.closest('button, a, summary, .ai-answer')) return;
        e.preventDefault();
        if (answered) advance();
        else answer.submit();
      } else if (e.key === 'Escape' && !answered) {
        e.preventDefault();
        finish(null);
      }
    });

    root.replaceChildren(head, stage, dockEl);
    if (!isChoice) answer.focus();
    revealBottom();
  }

  function showIntro(): void {
    const subId = SUBTYPES[mode] ? mode : null;
    const method = subId ? getMethod(subId) : null;
    if (!subId || !method) { showTask(); return; }
    const sub = SUBTYPES[subId];
    const cat = sub ? CATEGORIES.find((c) => c.id === sub.category) : undefined;
    const ex = generate(subId, Math.random, { level: levelFor(subId, getAttempts(), settings.difficulty) });
    const exSteps = safeSteps(ex);
    const start = button({ label: t('common.letsGo'), kind: 'primary', full: true, onClick: () => showTask() });
    setKeyHandler((e) => {
      if (e.key !== 'Enter' || shortcutBlocked(e)) return;
      const el = e.target;
      if (el instanceof Element && el.closest('button, a, summary')) return;
      e.preventDefault();
      start.click();
    });
    // Tippen auf die Atempause überspringt sie – ein Doppeltipp träfe sonst gleich „Los geht's“
    const introDock = dock(start);
    tapGuard(introDock);
    root.replaceChildren(
      focusHead({ closeLabel: t('train.exit'), href: '#/' }),
      h('div', { class: 'stage is-start train-intro' },
        largeTitle(sub ? sub.name : subId, cat?.name),
        methodBlock(method),
        exSteps.length ? group(t('train.example', { prompt: ex.prompt }), card([steps(exSteps)])) : null),
      introDock);
    start.focus({ preventScroll: true });
  }

  const begin = (): void => { if (intro) showIntro(); else showTask(); };

  // Atempause (E19): nicht bei Daily, Wiederholung der Fehler und kurzen Review-Runden
  const breathe = settings.breathe === true && mode !== 'daily' && mode !== 'retry' && !(mode === 'review' && sessionLength < 3);
  if (breathe) {
    const withIntro = intro && Boolean(SUBTYPES[mode] && getMethod(mode));
    const tasks = sessionLength === 1 ? t('train.tasksOne') : t('train.tasksMany', { n: sessionLength });
    breatheStop = showBreathe({
      root,
      after: t('train.breatheAfter', { mode: modeName(mode), what: withIntro ? t('train.breatheIntro', { n: sessionLength }) : tasks }),
      onDone: () => { breatheStop = null; begin(); },
    });
  } else {
    begin();
  }
}
