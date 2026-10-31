// Zeitanzeige einer Aufgabe (E3): Gemessen wird immer, angezeigt je nach settings.timerDisplay.
// calm = nur die Zeitlinie, precise = Linie + „x,x s / y s“ im Kopf, off = nichts. Takt 250 ms,
// ab der Zielzeit wechselt die Linie einmal weich nach Ocker (kein Puls). Der Tab-Titel bleibt ruhig.
import type { TimerDisplay } from '../../types.ts';
import { fmtSeconds } from '../../core/numbers.ts';
import { locale } from '../../i18n/index.ts';
import { timeLine } from '../../ui/kit.ts';

export const TICK_MS = 250;

export interface TaskTimer {
  /** Zeitlinie für den Kopf (null bei 'off') */
  line: HTMLElement | null;
  /** Startet den Takt und zeichnet sofort. */
  start(): void;
  /** Stoppt den Takt (idempotent). */
  stop(): void;
  /** Friert die Anzeige auf die endgültige Zeit ein. */
  freeze(timeMs: number): void;
}

export interface TimerOptions {
  targetMs: number;
  /** performance.now() beim Aufgabenstart */
  t0: number;
  display: TimerDisplay;
  /** Text „x,x s / y s“ im Kopf (nur bei 'precise') */
  text?: HTMLElement | null;
  /** Läuft bei jedem Takt mit (z. B. Ghost-Marke) */
  onTick?: () => void;
}

const secFormat = new Map<string, Intl.NumberFormat>();

/** Laufende Zeit immer mit einer Nachkommastelle („0,0 s“), damit der Text nicht springt. */
export function runningSeconds(ms: number): string {
  const loc = locale();
  let f = secFormat.get(loc);
  if (!f) {
    f = new Intl.NumberFormat(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    secFormat.set(loc, f);
  }
  return `${f.format(Math.max(0, ms) / 1000)} s`;
}

export function createTimer({ targetMs, t0, display, text = null, onTick }: TimerOptions): TaskTimer {
  const tl = display === 'off' ? null : timeLine();
  const target = fmtSeconds(targetMs);
  let timerId: ReturnType<typeof setInterval> | null = null;

  const paint = (elapsed: number): void => {
    const over = elapsed >= targetMs;
    tl?.set(targetMs > 0 ? elapsed / targetMs : 1, over);
    if (text) {
      text.textContent = `${runningSeconds(elapsed)} / ${target}`;
      text.classList.toggle('is-over', over);
    }
  };
  const update = (): void => {
    paint(performance.now() - t0);
    onTick?.();
  };

  return {
    line: tl ? tl.el : null,
    start() {
      update();
      if (timerId === null && (tl || text || onTick)) timerId = setInterval(update, TICK_MS);
    },
    stop() {
      if (timerId !== null) { clearInterval(timerId); timerId = null; }
    },
    freeze(timeMs: number) {
      paint(timeMs);
    },
  };
}
