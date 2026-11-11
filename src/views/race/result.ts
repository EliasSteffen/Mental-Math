// Ergebnis des Raketen-Rennens (v12 R1): Zeitraffer-Wiederholung aller Raketen, dann Podest, Platzierungen und deine Aufgaben.
// Wiederverwendbar: R2 zeigt damit die Rangliste eines Geister-Rennens, R3 das Live-Ergebnis (ohne Wiederholung).
import {
  altitudeAt, raceDurationMs, raceRanking, replayMs, type RaceConfig, type RaceRanked, type RaceRun,
} from '../../core/race.ts';
import { fmtSeconds } from '../../core/numbers.ts';
import { answerText, givenAnswerText } from '../train/diagnosis.ts';
import { openSolutionSheet } from '../train/result.ts';
import { t } from '../../i18n/index.ts';
import { h } from '../../ui/dom.ts';
import { button, focusHead, group, list, resultRow, row, type ButtonOptions } from '../../ui/kit.ts';
import { dock } from '../../ui/dock.ts';
import { setTitle } from '../../ui/title.ts';
import type { RaceAnswer } from './play.ts';
import { createTrack, laneColor, rocketSvg } from './track.ts';

export interface RaceResultOptions {
  root: HTMLElement;
  cfg: RaceConfig;
  /** Alle Teilnehmenden mit ihren Zeitleisten; `me` markiert die eigene Rakete */
  runs: readonly RaceRun[];
  /** Aufgabenlisten zum Aufklappen (je Person) */
  tasks?: ReadonlyArray<{ name: string; answers: readonly RaceAnswer[] }>;
  /** Zeitraffer vor dem Podest (Reihum, Geister-Rennen) */
  replay?: boolean;
  /** „Gemischt · 60 s · Mittel“ über dem Titel */
  summary: string;
  /** Belohnungszeilen (`rewardBlock(updateProgressRewards())`) */
  rewards?: Node | null;
  /** Ziel des ✕ im Zeitraffer */
  closeHref: string;
  primary: ButtonOptions;
  secondary: readonly ButtonOptions[];
}

export interface RaceResultHandle { stop(): void }

const REPLAY_END_HOLD_MS = 700;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** „0:45“ */
const clockText = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Reihenfolge auf dem Podest: 2 · 1 · 3 (bei zwei Teilnehmenden 2 · 1) */
function podiumOrder(top: readonly RaceRanked[]): RaceRanked[] {
  const pick = (i: number): RaceRanked | undefined => top[i];
  return (top.length >= 3 ? [pick(1), pick(0), pick(2)] : top.length === 2 ? [pick(1), pick(0)] : [pick(0)]).filter((x): x is RaceRanked => x !== undefined);
}

/** Podest mit den ersten drei (Raketen auf Stufen, Name und Ergebnis). */
export function podium(ranked: readonly RaceRanked[]): HTMLElement {
  const cols = podiumOrder(ranked.slice(0, 3)).map((r) => {
    const col = h('div', { class: `race-podium-col is-p${Math.min(r.rank, 3)}${r.me ? ' is-me' : ''}` },
      h('span', { class: 'race-podium-name' }, r.name),
      h('span', { class: 'race-podium-rocket' }, rocketSvg()),
      h('span', { class: 'race-podium-block', 'aria-hidden': 'true' }, h('span', { class: 'num' }, String(r.rank))),
      h('span', { class: 'race-podium-score num' }, t('race.correctN', { n: r.correct })));
    col.style.setProperty('--lane', laneColor(r.index));
    col.setAttribute('aria-label', `${t('race.rankAria', { rank: r.rank })}: ${r.name}, ${t('race.correctN', { n: r.correct })}`);
    return col;
  });
  return h('div', { class: 'race-podium', role: 'group', 'aria-label': t('race.podium') }, ...cols);
}

/** Titel: „Anna gewinnt“, bei Gleichstand an der Spitze „Unentschieden“, allein „12 richtig“. */
export function winnerLine(ranked: readonly RaceRanked[]): string {
  const first = ranked[0];
  if (!first) return t('race.title');
  if (ranked.length === 1) return t('race.correctN', { n: first.correct });
  return ranked.filter((r) => r.rank === 1).length > 1 ? t('race.tie') : t('race.winner', { name: first.name });
}

function givenText(a: RaceAnswer): string {
  if (a.given === null) return '–';
  if (a.task.kind === 'choice') return String(a.task.choices[a.given] ?? '–');
  return givenAnswerText(a.task, a.given);
}

function taskRow(a: RaceAnswer, prevMs: number): HTMLElement {
  const right = answerText(a.task);
  const sub = a.ok ? fmtSeconds(Math.max(0, a.ms - prevMs))
    : a.given === null ? t('train.rowSkipped', { right }) : t('train.rowWrong', { given: givenText(a), right });
  return resultRow({ ok: a.ok, label: a.task.prompt, sub, onClick: () => openSolutionSheet(a.task) });
}

/** Aufklappbare Aufgabenliste einer Person (falsche zuerst); die Zeilen entstehen erst beim Öffnen. */
function taskFold(name: string, answers: readonly RaceAnswer[]): HTMLElement {
  const okN = answers.filter((a) => a.ok).length;
  const body = h('div', { class: 'race-tasks-body' });
  const det = h('details', { class: 'race-tasks' },
    h('summary', { class: 'race-tasks-sum press' },
      h('span', { class: 'race-tasks-name' }, t('race.tasksOf', { name })),
      h('span', { class: 'race-tasks-meta num' }, t('race.correctOf', { c: okN, n: answers.length }))),
    body);
  det.addEventListener('toggle', () => {
    if (!det.open || body.childElementCount > 0) return;
    const rows = answers.map((a, i) => ({ a, prev: answers[i - 1]?.ms ?? 0 }));
    const wrong = rows.filter((r) => !r.a.ok).map((r) => taskRow(r.a, r.prev));
    const right = rows.filter((r) => r.a.ok).map((r) => taskRow(r.a, r.prev));
    body.append(list([...wrong, ...right]));
  });
  return det;
}

export function showRaceResult(o: RaceResultOptions): RaceResultHandle {
  const { root, cfg } = o;
  const durationMs = raceDurationMs(cfg);
  const ranked = raceRanking(o.runs, durationMs);
  let alive = true;
  let raf = 0;
  let tick: ReturnType<typeof setInterval> | null = null;
  let hold: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    cancelAnimationFrame(raf);
    if (tick !== null) { clearInterval(tick); tick = null; }
    if (hold !== null) { clearTimeout(hold); hold = null; }
  };
  const stop = (): void => { alive = false; clearTimers(); };

  const showFinal = (): void => {
    if (!alive) return;
    clearTimers();
    const title = h('h1', { class: 'train-result-title', tabindex: '-1' }, winnerLine(ranked));
    const places = ranked.map((r) => {
      const no = h('span', { class: `race-rank-no num${r.rank === 1 ? ' is-first' : ''}`, 'aria-label': t('race.rankAria', { rank: r.rank }) }, String(r.rank));
      no.style.setProperty('--lane', laneColor(r.index));
      return row({ leading: no, label: r.name, value: t('race.placeValue', { c: r.correct, w: r.wrong }), class: r.me ? 'is-me' : undefined });
    });
    root.replaceChildren(
      h('div', { class: 'stage is-start train-result race-result' },
        h('header', { class: 'train-result-head' },
          h('p', { class: 'train-result-sub' }, `${t('race.title')} · ${o.summary}`),
          title),
        podium(ranked),
        o.rewards ?? null,
        group(t('race.places'), list(places)),
        o.tasks?.length ? group(t('race.tasks'), h('div', { class: 'race-tasks-list' }, ...o.tasks.map((x) => taskFold(x.name, x.answers)))) : null),
      dock(
        h('div', { class: 'train-result-actions' }, ...o.secondary.map((b) => button(b))),
        button({ ...o.primary, kind: 'primary', full: true })));
    setTitle(t('common.roundDone'));
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
  };

  if (!o.replay || !ranked.some((r) => r.correct > 0)) {
    showFinal();
    return { stop };
  }

  /* ---------- Zeitraffer ---------- */
  const track = createTrack(o.runs.map((r) => ({ name: r.name, ...(r.me ? { me: true } : {}) })));
  track.el.classList.add('is-big');
  const timeEl = h('p', { class: 'race-replay-time num', 'aria-hidden': 'true' }, `0:00 / ${clockText(durationMs)}`);
  const skip = button({ label: t('race.skipReplay'), kind: 'soft', full: true, onClick: () => showFinal() });
  root.replaceChildren(
    focusHead({ closeLabel: t('race.close'), href: o.closeHref, title: t('race.replay') }),
    h('div', { class: 'stage race-stage race-replay' },
      h('p', { class: 'race-replay-label' }, t('race.replayHint', { n: Math.round(durationMs / replayMs(durationMs)) })),
      track.el, timeEl),
    dock(skip));
  setTitle(t('race.replay'));
  window.scrollTo(0, 0);

  const total = replayMs(durationMs);
  const start = performance.now();
  const paint = (): void => {
    if (!alive) return;
    const p = Math.min(1, (performance.now() - start) / total);
    const tMs = p * durationMs;
    track.set(o.runs.map((r) => altitudeAt(r.steps, tMs)), { instant: true });
    timeEl.textContent = `${clockText(tMs)} / ${clockText(durationMs)}`;
    if (p >= 1) {
      clearTimers();
      hold = setTimeout(showFinal, REPLAY_END_HOLD_MS);
    }
  };
  paint();
  // Mit „weniger Bewegung“ springt die Anzeige im Viertelsekundentakt statt zu gleiten
  if (reducedMotion()) tick = setInterval(paint, 250);
  else {
    const loop = (): void => { paint(); if (alive && hold === null) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
  return { stop };
}
