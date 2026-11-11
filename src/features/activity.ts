// Activity tracker: counts active time in 5 s ticks.
import { addActivityMs } from '../data/storage.ts';

const TICK = 5000;
const IDLE = 60000;

export function startActivityTracker(): void {
  let lastInput = Date.now();
  const mark = (): void => { lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'input']) document.addEventListener(ev, mark, { passive: true, capture: true });
  setInterval(() => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || now - lastInput >= IDLE) return;
    // Nur die Minuten (Tempo-Statistik); das Tagesziel zählt seit v9 Runden (core/habit.ts, Ergebnis-Ansicht)
    addActivityMs(TICK, now);
  }, TICK);
}
