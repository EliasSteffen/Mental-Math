// Training im Fokus-Modus (Ruhiger Fokus): Kopf mit ✕, Segmenten und Zeitlinie, Bühne mit der Aufgabe,
// Dock mit Tastenfeld bzw. Auswahl; nach der Antwort ersetzt das Feedback-Sheet das Dock.
// Der fachliche Ablauf (Modi, Schätzen, Auto-Submit, Auto-Fail, Ghost, Bewertung, Wiederholung) ist unverändert.
import type { Attempt, CustomRange, Evaluation, Level, Mode, Task, TimerDisplay } from '../../types.ts';
import { fmt, parseAnswer, unitFactor } from '../../core/numbers.ts';
import { CATEGORIES, SUBTYPES, LEVEL_NAMES } from '../../core/catalog.ts';
import { generate, generateForMode, noRepeat } from '../../core/generators/index.ts';
import { evaluate, weaknesses, levelFor } from '../../core/scoring.ts';
import { planTask } from '../../core/adaptive.ts';
import { getMethod } from '../../core/methods.ts';
import { renderExhibit } from '../../ui/exhibit.ts';
import { modeName } from '../../core/modes.ts';
import { getAttempts, getSessions, getSettings, addAttempt, getReviews, setReviews, isDemoData } from '../../data/storage.ts';
import { dailyTasks } from '../../core/daily.ts';
import { dayKey, personalBest, ghostProgress } from '../../core/progress.ts';
import { recordResult, dueReviews } from '../../core/review.ts';
import { answerFx } from '../../ui/fx.ts';
import { app, h } from '../../ui/dom.ts';
import { button, card, focusHead, group, largeTitle, segments, steps } from '../../ui/kit.ts';
import { dock, tapGuard } from '../../ui/dock.ts';
import { isSheetOpen } from '../../ui/sheet.ts';
import { confirmDialog, isModalOpen } from '../../ui/modal.ts';
import { methodBlock, safeSteps } from '../../ui/widgets.ts';
import { setCleanup } from '../../router.ts';
import { abandonLive, recordAnswer } from '../../features/challenge.ts';
import { createTimer, type TaskTimer } from './timer.ts';
import { createAnswer } from './answer.ts';
import { buildFeedback, choiceOutcome, createHelp } from './feedback.ts';
import { diagnose } from './diagnosis.ts';
import { AUTO_ADVANCE_MS, shouldAutoAdvance } from '../../core/auto-advance.ts';
import { showBreathe } from './breathe.ts';
import { showResult } from './result.ts';
import { duelTasks, type DuelBase } from '../../core/duel-link.ts'; // v9 I
import { loadDuel, type DuelOpponent } from '../../features/duel.ts'; // v9 I
import { warmupPlan } from '../../core/comeback.ts'; // v10 C
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
  /** Gewertete Runde (Daily mit einem Versuch, Wettbewerb); sonst null */
  ranked: RankedRound | null;
  /** Herausforderung (v9 I): Aufgabensatz und – wenn ein Freund schon gespielt hat – sein Ergebnis */
  duel?: { base: DuelBase; them: DuelOpponent | null };
  stop(): void;
}

/**
 * Einstufungstest: Die nächste Aufgabe hängt an den bisherigen Antworten (src/core/placement.ts); bis zu `max`.
 * Gleiche strenge Bedingungen wie gewertete Runden (ohne Hilfe, Zeit läuft, kein Auto-Prüfen).
 */
export interface PlacementRound {
  max: number;
  /** Nächste Aufgabe nach den bisherigen Ergebnissen; null = Test fertig */
  next(results: readonly TrainResult[]): Task | null;
  onDone(results: readonly TrainResult[]): void;
}

/**
 * Gewertete Runde: feste Aufgaben vom Server, gleiche Bedingungen für alle – Zeit läuft immer, kein „Wie geht das?“,
 * keine Atempause, kein Auto-Prüfen (das verriete richtige Eingaben), kein Schätzen. Jede Antwort geht sofort in die Outbox.
 */
export interface RankedRound {
  id: string;
  /** 'daily' oder 'challenge' (Wettbewerb) – Modus der lokalen Statistik */
  mode: 'daily' | 'challenge';
  title: string;
  tasks: Task[];
  /** Abbruch über ✕ (nach Rückfrage): Versuch abgeben und zur Challenge-Seite */
  onAbort(): void;
}

export interface TrainOptions {
  n?: number | null;
  intro?: boolean;
  estimate?: boolean;
  custom?: CustomRange | null;
  ranked?: RankedRound | null;
  placement?: PlacementRound | null;
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

/**
 * Auto-Weiter (v9 A): nach AUTO_ADVANCE_MS `advance()`. Abbruch bei jeder Interaktion außerhalb von „Weiter“
 * (Lösungsweg, Methode, KI); Pause, solange die Seite verborgen ist. Liefert die Abbruchfunktion.
 */
function startAutoAdvance(nextBtn: HTMLElement, root: HTMLElement, advance: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const arm = (): void => {
    clear();
    nextBtn.classList.remove('is-auto');
    if (document.hidden) return;
    nextBtn.style.setProperty('--auto-ms', `${AUTO_ADVANCE_MS}ms`);
    // Animation neu starten
    void nextBtn.offsetWidth;
    nextBtn.classList.add('is-auto');
    timer = setTimeout(() => { cancel(); advance(); }, AUTO_ADVANCE_MS);
  };
  const onInteract = (e: Event): void => {
    if (e instanceof KeyboardEvent && (e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt')) return;
    const el = e.target;
    if (el instanceof Node && nextBtn.contains(el)) return;
    cancel();
  };
  const onVisibility = (): void => {
    if (document.hidden) { clear(); nextBtn.classList.remove('is-auto'); } else arm();
  };
  function cancel(): void {
    clear();
    nextBtn.classList.remove('is-auto');
    root.removeEventListener('pointerdown', onInteract, true);
    root.removeEventListener('keydown', onInteract, true);
    document.removeEventListener('visibilitychange', onVisibility);
  }
  root.addEventListener('pointerdown', onInteract, true);
  root.addEventListener('keydown', onInteract, true);
  document.addEventListener('visibilitychange', onVisibility);
  arm();
  return cancel;
}

export function renderTrain(modeIn: Mode, { n: nOverride = null, intro: introIn = false, estimate = false, custom = null, ranked = null, placement = null }: TrainOptions = {}): void {
  const settings = getSettings();
  // Strenge Bedingungen (gewertet oder Einstufung): Zeit immer, keine Hilfe, kein Auto-Prüfen, kein Schätzen
  const strict = ranked !== null || placement !== null;
  const timed = strict ? true : settings.timer !== false;
  const intro = strict ? false : introIn;
  let mode: Mode = ranked ? ranked.mode : placement ? 'placement' : modeIn === 'challenge' || modeIn === 'placement' ? 'all' : modeIn;
  // v10 C: Aufwärmrunde ohne Zeitdruck-Anzeige (nur die ruhige Zeitlinie)
  const display: TimerDisplay = mode === 'warmup' ? 'calm' : settings.timerDisplay ?? 'calm';
  const precise = display === 'precise';
  let notice: string | null = null;
  const today = dayKey(Date.now());

  // Feste Aufgabenlisten (Gewertet / Daily / Retry); Custom wird pro Aufgabe generiert
  let fixedTasks: Task[] | null = null;
  let duelCtx: { base: DuelBase; them: DuelOpponent | null } | null = null; // v9 I
  if (ranked) fixedTasks = ranked.tasks;
  else if (mode === 'daily') fixedTasks = dailyTasks(today);
  else if (mode === 'retry') {
    fixedTasks = loadRetryTasks();
    if (!fixedTasks) { mode = 'all'; notice = t('train.noRetry'); }
  } else if (mode === 'duel') {
    const d = loadDuel(); // v9 I
    if (d) { fixedTasks = duelTasks(d.base); duelCtx = d; } else { mode = 'all'; notice = t('duel.none'); }
  } else if (mode === 'warmup') {
    // v10 C: 5 leichte Aufgaben aus den stärksten Themen
    const wf = noRepeat();
    fixedTasks = warmupPlan(getAttempts(), settings.enabledCategories).map((slot) => wf.next(() => generate(slot.subtype, Math.random, { level: slot.level })));
  } else if (mode === 'custom' && !custom) {
    mode = 'all';
    notice = t('train.noRange');
  }
  const fixedMode = strict || mode === 'daily' || mode === 'retry' || mode === 'custom' || mode === 'duel' || mode === 'warmup';
  const sessionLength = placement ? placement.max : fixedTasks ? fixedTasks.length : mode === 'daily' ? 15 : nOverride || settings.sessionLength || 10;
  const est = !strict && (estimate || settings.estimateMode === true) && !fixedMode;
  // Einstufung: nächste Aufgabe ergibt sich aus den bisherigen Antworten
  let queued: Task | null = placement ? placement.next([]) : null;
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

  // Wiederholungssperre der Sitzung: keine Aufgabe, die einer der letzten 8 gleicht (Daily/Retry bleiben feste Listen)
  const fresh = noRepeat();
  // „Auto“: Stufe je Typ folgt der Treppe; unter „Leicht“ kommen Grundlagen bzw. ein Einstieg (src/core/adaptive.ts)
  const adaptive = settings.difficulty === undefined || settings.difficulty === 'auto';

  let timer: TaskTimer | null = null;
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  let autoFailTimer: ReturnType<typeof setInterval> | null = null;
  let breatheStop: (() => void) | null = null;
  // v9 A: Auto-Weiter nach richtiger Antwort (Abbruch/Aufräumen)
  let autoCancel: (() => void) | null = null;

  const stop = (): void => {
    if (timer) { timer.stop(); timer = null; }
    if (autoFailTimer !== null) { clearInterval(autoFailTimer); autoFailTimer = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
    if (breatheStop) { breatheStop(); breatheStop = null; }
    if (autoCancel) { autoCancel(); autoCancel = null; }
  };
  // Gewertet: Verlässt die Runde die Ansicht auf anderem Weg (Zurück, Link), gilt sie als abgebrochen – die Outbox
  // gibt sie beim nächsten Laden ab. Nach dem Ergebnis ist das ein No-op.
  setCleanup(ranked ? () => { stop(); abandonLive(ranked.id); } : stop);

  const root = app;
  const ctx: TrainCtx = {
    mode, root, results: [], points: 0, index: 0,
    sessionId: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    restart: ranked ? `#/challenge/${ranked.id}` : mode === 'custom' ? location.hash : `#/train/${mode}`,
    dailyKey: !ranked && mode === 'daily' ? today : null,
    ranked,
    ...(duelCtx ? { duel: duelCtx } : {}), // v9 I
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
  // Gewertet: ✕ fragt nach – ein Abbruch verbraucht den einen Versuch
  const confirmAbort = ranked
    ? (): void => {
      void confirmDialog(t('compete.abortText'), { title: t('compete.abortTitle'), confirmLabel: t('compete.abortConfirm'), danger: true })
        .then((yes) => { if (yes) { stop(); ranked.onAbort(); } });
    }
    : undefined;
  const head = focusHead({
    closeLabel: ranked ? t('compete.abortTitle') : t('train.exit'), href: ranked ? undefined : '#/', onClose: confirmAbort,
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
    if (placement) {
      queued = ctx.index < sessionLength ? placement.next(ctx.results) : null;
      if (queued) showTask();
      else { stop(); placement.onDone(ctx.results); }
      return;
    }
    if (ctx.index >= sessionLength) showResult(ctx);
    else showTask();
  }

  function showTask(): void {
    stop();
    const task: Task = queued
      ? queued
      : fixedTasks
      ? fixedTasks[ctx.index]!
      : mode === 'custom' && custom
      ? fresh.next(() => generate(custom.kind === 'mul' ? 'custom.mul' : 'custom.square', Math.random, { level: 2, custom }))
      : fresh.next(() => generateForMode(genMode, {
        enabledCategories: settings.enabledCategories,
        weakSubtypes, reviewSubtypes,
        levelFor: (id: string): Level => levelFor(id, getAttempts(), settings.difficulty),
        plan: adaptive ? (id: string) => planTask(id, getAttempts()) : undefined,
      }));
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
      autoCheck: !strict && settings.autoSubmit && task.kind !== 'choice'
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

    // Dock: Zahlenaufgabe = Hilfe/Weiß-nicht über dem Tastenfeld; Auswahl = Raster, darunter Hilfe/Weiß-nicht.
    // Gewertet: ohne Hilfe – nur „Weiß nicht“.
    const skip = button({ label: t('common.dontKnow'), kind: 'quiet', onClick: () => finish(null) });
    const dockRow = h('div', { class: 'train-dock-row' }, strict ? null : help.btn, skip);
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
    if (!strict && settings.autoFail === true && timed) {
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
      precise ? h('p', { class: 'train-meta num' }, `${task.basic ? t('train.levelBasic') : LEVEL_NAMES[task.level] ?? LEVEL_NAMES[2]} · ${t('common.pointsValue', { n: ctx.points })}`) : null,
      task.foundationFor && SUBTYPES[task.foundationFor]
        ? h('p', { class: 'train-pill' }, t('train.foundationPill', { sub: SUBTYPES[task.foundationFor]?.name ?? '' }))
        : null,
      ranked && ctx.index === 0 ? h('p', { class: 'train-pill' }, t('compete.rankedPill')) : null,
      placement && ctx.index === 0 ? h('p', { class: 'train-pill' }, t('placement.pill')) : null,
      renderExhibit(task.params),
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
      if (ranked) recordAnswer(ranked.id, { i: ctx.index, input: given, ms: timeMs });
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
      // v9 A: Auto-Weiter; nicht im Rundgang/in der Demo (die Skripte tippen „Weiter“ selbst)
      if (shouldAutoAdvance({ enabled: settings.autoAdvance && !isDemoData(), correct: ev.correct, timedOut })) {
        autoCancel = startAutoAdvance(nextBtn, root, advance);
      }
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
    // Das Beispiel nicht gleich als erste Aufgabe wiederholen
    fresh.remember(ex);
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
        exSteps.length ? group(t('train.example', { prompt: ex.prompt }), card([renderExhibit(ex.params), steps(exSteps)])) : null),
      introDock);
    start.focus({ preventScroll: true });
  }

  const begin = (): void => { if (intro) showIntro(); else showTask(); };

  // Atempause (E19): nicht bei Daily, Wiederholung der Fehler und kurzen Review-Runden
  const breathe = !strict && settings.breathe === true && mode !== 'daily' && mode !== 'retry' && mode !== 'duel' && mode !== 'warmup' && !(mode === 'review' && sessionLength < 3);
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
