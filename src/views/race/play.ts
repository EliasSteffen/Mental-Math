// Renn-Bildschirm (v12 R1, Fokus-Modus): Rennbahn oben, Restzeit als Ring, Aufgabe und Tastenfeld wie im Training.
// Wiederverwendbar für alle Spielweisen: Gegner kommen über `RaceOpponents` (Reihum: keine; R2: Geister; R3: Live).
// Keine Hilfe, kein Feedback-Sheet, keine Lösungswege – richtig → sofort weiter, falsch → kurzes Rot, weiter.
import type { Task } from '../../types.ts';
import {
  NO_OPPONENTS, RACE_COUNTDOWN_STEPS, raceDurationMs,
  type RaceConfig, type RaceOpponents, type RaceStep,
} from '../../core/race.ts';
import { unitFactor } from '../../core/numbers.ts';
import { evaluate } from '../../core/scoring.ts';
import { getSettings } from '../../data/storage.ts';
import { t } from '../../i18n/index.ts';
import { answerFx } from '../../ui/fx.ts';
import { h, svg } from '../../ui/dom.ts';
import { button, focusHead } from '../../ui/kit.ts';
import { dock } from '../../ui/dock.ts';
import { numpad } from '../../ui/keypad.ts';
import { isModalOpen, openModal } from '../../ui/modal.ts';
import { isSheetOpen } from '../../ui/sheet.ts';
import { renderExhibit } from '../../ui/exhibit.ts';
import { createAnswer, type AnswerControls } from '../train/answer.ts';
import { createTrack } from './track.ts';
import { setSwipeBackBlocked } from '../../core/swipe-back.ts';

export type { RaceOpponents } from '../../core/race.ts';

/** Eine beantwortete Aufgabe samt Antwort (für die Liste danach; R2 gibt `{ i, input, ms }` an den Server) */
export interface RaceAnswer { i: number; task: Task; given: number | null; ms: number; ok: boolean }

export interface RaceOutcome {
  cfg: RaceConfig;
  /** Zeitleiste: ms seit „Los“ und richtig/falsch je beantworteter Aufgabe */
  steps: RaceStep[];
  answers: RaceAnswer[];
}

export interface RacePlayOptions {
  /** #app */
  root: HTMLElement;
  cfg: RaceConfig;
  /** Aufgabenstrom aus `raceTasks` – für alle Mitspielenden derselbe */
  tasks: readonly Task[];
  /** Eigener Name unter der Rakete */
  name: string;
  /** Titel im Kopf (Reihum: „Anna“) */
  title?: string;
  /** Gegner-Raketen (Standard: keine) */
  opponents?: RaceOpponents;
  /**
   * Zeitpunkt von „Los“ als `performance.now()`-Wert (für gemeinsame Starts in R3, nach Uhrabgleich).
   * Standard: jetzt + Countdown.
   */
  startPerf?: number;
  /** Nach jeder gewerteten Antwort (Live-Rennen schickt damit die Position an den Raum) */
  onAnswer?(a: RaceAnswer): void;
  /** Zeit ist um (nach kurzem „Zeit!“) oder alle Aufgaben beantwortet */
  onDone(out: RaceOutcome): void;
  /** Text der Rückfrage beim ✕ (Standard: „nicht gewertet“; Gruppen-Rennen: zählt als leerer Lauf) */
  abortText?: string;
  /** ✕ nach Rückfrage bestätigt */
  onExit(): void;
}

export interface RacePlayHandle {
  /** Alles aufräumen (Timer, Listener); idempotent. Der Router ruft das über setCleanup. */
  stop(): void;
}

const END_HOLD_MS = 900;
const LOS_HOLD_MS = 600;
const MISS_MS = 380;
const CLOCK_R = 16;
const CLOCK_LEN = 2 * Math.PI * CLOCK_R;
/** Nach so langer Abwesenheit des Tabs erscheint der Hinweis „Die Zeit lief weiter“ */
const AWAY_NOTE_MS = 1500;
const LONG_PROMPT = 22;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Restzeit-Ring: Zahl der Sekunden in der Mitte, Bogen schrumpft. */
function clock(totalS: number): { el: HTMLElement; set(leftMs: number, smooth: boolean): void } {
  const fg = svg('circle', { class: 'race-clock-fg', cx: 20, cy: 20, r: CLOCK_R, 'stroke-dasharray': CLOCK_LEN.toFixed(2), 'stroke-dashoffset': 0 });
  const ring = svg('svg', { viewBox: '0 0 40 40', width: 40, height: 40, 'aria-hidden': 'true', focusable: 'false' });
  ring.append(svg('circle', { class: 'race-clock-bg', cx: 20, cy: 20, r: CLOCK_R }), fg);
  const num = h('span', { class: 'race-clock-num num' }, String(totalS));
  const el = h('div', { class: 'race-clock', role: 'timer', 'aria-label': t('race.timeLeft', { n: totalS }) }, ring, num);
  let lastS = totalS;
  return {
    el,
    set(leftMs, smooth) {
      const s = Math.max(0, Math.ceil(leftMs / 1000));
      if (s !== lastS) {
        lastS = s;
        num.textContent = String(s);
        el.setAttribute('aria-label', t('race.timeLeft', { n: s }));
        el.classList.toggle('is-low', s <= 5);
      }
      if (smooth) {
        const used = 1 - Math.max(0, Math.min(1, leftMs / (totalS * 1000)));
        fg.setAttribute('stroke-dashoffset', (CLOCK_LEN * used).toFixed(2));
      }
    },
  };
}

export function playRace(o: RacePlayOptions): RacePlayHandle {
  const { root, cfg, tasks } = o;
  const settings = getSettings();
  const durationMs = raceDurationMs(cfg);
  const opponents = o.opponents ?? NO_OPPONENTS;
  const oppNames = opponents.names();
  const reduced = reducedMotion();

  const steps: RaceStep[] = [];
  const answers: RaceAnswer[] = [];
  let correct = 0;
  let index = 0;
  let phase: 'count' | 'run' | 'over' = 'count';
  let stopped = false;
  let abortDlg: { close(): void } | null = null;
  let answer: AnswerControls | null = null;
  let answered = false;
  let curDock: HTMLElement;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let raf = 0;
  let tick: ReturnType<typeof setInterval> | null = null;
  let hiddenAt: number | null = null;
  let lastAltKey = '';
  let lastSecond = -1;

  const startPerf = o.startPerf ?? performance.now() + RACE_COUNTDOWN_STEPS * 1000;
  const later = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms);
    timers.add(id);
  };

  /* ---------- Aufbau ---------- */
  const track = createTrack([{ name: o.name, me: true }, ...oppNames.map((n) => ({ name: n }))]);
  const score = h('span', { class: 'race-score num', role: 'img', 'aria-label': t('race.scoreAria', { n: 0 }) }, '0');
  const clk = clock(cfg.durationS);
  const head = focusHead({
    closeLabel: t('race.abort'),
    onClose: () => {
      if (abortDlg || stopped) return;
      // Die Zeit läuft weiter; endet das Rennen hinter dem Dialog, schließt end() ihn.
      let yes = false;
      abortDlg = openModal({
        title: t('race.abortTitle'),
        body: h('p', null, o.abortText ?? t('race.abortText')),
        actions: [
          { label: t('settings.cancel') },
          { label: t('race.abortConfirm'), danger: true, onClick: () => { yes = true; } },
        ],
        onClose: () => { abortDlg = null; if (yes && !stopped) { stop(); o.onExit(); } },
      });
    },
    ...(o.title ? { title: o.title } : {}),
    children: [h('span', { class: 'race-head-gap' }), score, clk.el],
  });
  const taskBlock = h('div', { class: 'race-task' });
  const note = h('p', { class: 'race-note', role: 'status' });
  const stage = h('div', { class: 'stage race-stage' }, track.el, taskBlock, note);

  const idleDock = (): HTMLElement => {
    const dummy = h('input', { type: 'text', disabled: true, 'aria-hidden': 'true', tabindex: '-1' });
    const pad = numpad({ input: dummy, onSubmit: () => undefined, layout: settings.numpadLayout === 'phone' ? 'phone' : 'calculator' });
    return dock(h('div', { class: 'train-dock-row' }, h('span', { class: 'race-dock-spacer' })), h('div', { class: 'race-dock-idle', 'aria-hidden': 'true' }, pad.el));
  };
  curDock = idleDock();
  root.replaceChildren(head, stage, curDock);
  track.set([0, ...oppNames.map(() => 0)], { instant: true });

  const bigText = (text: string, cls = ''): HTMLElement => h('p', { class: `race-big${cls ? ` ${cls}` : ''}`, 'aria-live': 'assertive' }, text);

  /* ---------- Aufgaben ---------- */
  function showTask(i: number): void {
    const task = tasks[i];
    if (!task) { end(); return; }
    answered = false;
    const ctl = createAnswer(task, {
      keypadSetting: settings.keypad || 'auto',
      numpadLayout: settings.numpadLayout === 'phone' ? 'phone' : 'calculator',
      // Auto-Prüfen: sobald die getippte Zahl stimmt, zählt sie – maximales Tempo
      autoCheck: task.kind === 'choice' ? null : (v: number): boolean => evaluate(task, v, 0).correct,
      onFinish: (given) => finish(given),
    });
    answer = ctl;
    const skip = button({ label: t('race.skip'), kind: 'quiet', onClick: () => finish(null) });
    const row = h('div', { class: 'train-dock-row' }, skip);
    const next = ctl.isChoice ? dock(ctl.dockEl, row) : dock(row, ctl.dockEl);
    curDock.replaceWith(next);
    curDock = next;

    const hint = task.hint || (!ctl.isChoice && unitFactor(task.unit) > 1 ? t('train.unitHint', { unit: task.unit }) : '');
    const parts = [
      renderExhibit(task.params),
      h('h1', { class: task.prompt.length > LONG_PROMPT ? 'train-q is-long' : 'train-q num' }, task.prompt),
      hint ? h('p', { class: 'train-hint' }, hint) : null,
      ctl.stageEl,
    ];
    taskBlock.replaceChildren(...parts.filter((x): x is HTMLElement => x !== null));
    if (!ctl.isChoice) ctl.focus();
  }

  function finish(given: number | null): void {
    if (phase !== 'run' || answered) return;
    const task = tasks[index];
    if (!task) return;
    answered = true;
    const ms = Math.round(performance.now() - startPerf);
    if (ms > durationMs) { end(); return; } // zu spät: zählt nicht
    const ok = given !== null && evaluate(task, given, ms).correct;
    steps.push({ ms, ok });
    answers.push({ i: index, task, given, ms, ok });
    o.onAnswer?.({ i: index, task, given, ms, ok });
    answerFx(ok);
    if (ok) {
      correct += 1;
      score.textContent = String(correct);
      score.setAttribute('aria-label', t('race.scoreAria', { n: correct }));
    } else {
      stage.classList.add('is-miss');
      later(() => stage.classList.remove('is-miss'), MISS_MS);
    }
    paintTrack(ms);
    index += 1;
    if (index >= tasks.length) { end(); return; }
    showTask(index);
  }

  /* ---------- Takt ---------- */
  function paintTrack(tMs: number, instant = false): void {
    const alts = [correct, ...opponents.altitudes(Math.max(0, tMs))];
    const key = alts.join(',');
    if (key === lastAltKey) return;
    lastAltKey = key;
    track.set(alts, instant ? { instant: true } : {});
  }

  function frame(): void {
    if (stopped || phase === 'over') return;
    const elapsed = performance.now() - startPerf;
    if (phase === 'count') {
      if (elapsed < 0) {
        const left = Math.ceil(-elapsed / 1000);
        if (left !== lastSecond) {
          lastSecond = left;
          taskBlock.replaceChildren(bigText(String(left), 'is-count'));
        }
        return;
      }
      phase = 'run';
      lastSecond = -1;
      // Die erste Aufgabe erscheint sofort; „Los!“ steht nur kurz als Hinweis darüber
      showTask(0);
      note.textContent = t('race.go');
      later(() => { note.textContent = ''; }, LOS_HOLD_MS);
      return;
    }
    const left = durationMs - elapsed;
    if (left <= 0) { clk.set(0, true); end(); return; }
    const sec = Math.ceil(left / 1000);
    clk.set(left, !reduced || sec !== lastSecond);
    lastSecond = sec;
    if (oppNames.length) paintTrack(elapsed);
  }

  function loop(): void {
    if (stopped || phase === 'over') return;
    frame();
    raf = requestAnimationFrame(loop);
  }

  function end(): void {
    if (phase === 'over') return;
    phase = 'over';
    answer = null;
    abortDlg?.close();
    const finalMs = Math.min(durationMs, Math.round(performance.now() - startPerf));
    paintTrack(finalMs, true);
    clk.set(0, true);
    taskBlock.replaceChildren(bigText(t('race.timeUp'), 'is-end'));
    const done = idleDock();
    curDock.replaceWith(done);
    curDock = done;
    later(() => {
      stop();
      o.onDone({ cfg, steps: steps.slice(), answers: answers.slice() });
    }, END_HOLD_MS);
  }

  /* ---------- Tastatur, Sichtbarkeit ---------- */
  const onKey = (e: KeyboardEvent): void => {
    if (phase !== 'run' || answered || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isSheetOpen() || isModalOpen()) return;
    const task = tasks[index];
    if (task?.kind === 'choice' && /^[1-4]$/.test(e.key) && Number(e.key) <= task.choices.length) {
      e.preventDefault();
      finish(Number(e.key) - 1);
    } else if (e.key === 'Enter') {
      const el = e.target;
      if (el instanceof Element && el.closest('button, a, summary')) return;
      e.preventDefault();
      answer?.submit();
    }
  };
  const onVisibility = (): void => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    const away = hiddenAt === null ? 0 : performance.now() - hiddenAt;
    hiddenAt = null;
    frame(); // Die Zeit lief ehrlich weiter – ggf. ist das Rennen schon vorbei
    if (phase === 'run' && away > AWAY_NOTE_MS) {
      note.textContent = t('race.awayNote');
      later(() => { note.textContent = ''; }, 3500);
    }
  };

  function stop(): void {
    if (stopped) return;
    stopped = true;
    setSwipeBackBlocked(false);
    abortDlg?.close();
    cancelAnimationFrame(raf);
    if (tick !== null) { clearInterval(tick); tick = null; }
    for (const id of timers) clearTimeout(id);
    timers.clear();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  // Ab Countdown bis stop(): kein Zurück-Wisch (er bräche das Rennen ohne Rückfrage ab)
  setSwipeBackBlocked(true);
  // Im Hintergrund pausiert requestAnimationFrame: der Intervall sorgt dafür, dass das Ende nicht verpasst wird
  tick = setInterval(frame, 250);
  frame();
  raf = requestAnimationFrame(loop);
  return { stop };
}
