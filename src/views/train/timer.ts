import type { Task } from '../../types.ts';
import { fmtSeconds } from '../../core/numbers.ts';
import { h } from '../../ui/dom.ts';

export interface TaskTimer {
  /** Text „x,x s / Ziel“ (Zeile unter dem Balken) */
  label: HTMLElement;
  /** Zeitbalken (aria-hidden) */
  bar: HTMLElement;
  /** Startet das 100-ms-Intervall und zeichnet sofort. */
  start(): void;
  /** Stoppt das Intervall (idempotent). */
  stop(): void;
  /** Friert die Anzeige auf die endgültige Zeit ein. */
  freeze(timeMs: number): void;
}

/** Zeit- und Druckanzeige für eine Aufgabe; t0 = performance.now() beim Aufgabenstart. */
export function createTimer(task: Task, t0: number): TaskTimer {
  const label = h('div', { class: 'timer' }, '');
  const fill = h('span', { class: 'timerbar-fill' });
  const bar = h('div', { class: 'timerbar', 'aria-hidden': 'true' }, fill);
  let timerId: ReturnType<typeof setInterval> | null = null;

  const update = (): void => {
    const el = performance.now() - t0;
    label.textContent = `${fmtSeconds(el)} / ${fmtSeconds(task.targetMs)}`;
    fill.style.setProperty('--w', String(Math.min(100, (el / task.targetMs) * 100)));
    // Druck sichtbar machen: über Zielzeit orange, über doppelter Zielzeit rot
    const warn = el > task.targetMs;
    const over = el > 2 * task.targetMs;
    label.classList.toggle('is-warn', warn && !over);
    label.classList.toggle('is-over', over);
    bar.classList.toggle('is-warn', warn && !over);
    bar.classList.toggle('is-over', over);
  };

  return {
    label,
    bar,
    start() {
      update();
      timerId = setInterval(update, 100);
    },
    stop() {
      if (timerId !== null) { clearInterval(timerId); timerId = null; }
    },
    freeze(timeMs: number) {
      label.textContent = `${fmtSeconds(timeMs)} / ${fmtSeconds(task.targetMs)}`;
    },
  };
}
