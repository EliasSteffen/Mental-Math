// Activity tracker: counts active time in 5 s ticks.
import { addActivityMs, getActivity, getSettings, setSettings } from './storage.js';
import { dayKey } from './progress.js';
import { confetti, toast } from './charts.js';

const TICK = 5000;
const IDLE = 60000;

export function startActivityTracker() {
  let lastInput = Date.now();
  const mark = () => { lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'keydown', 'input']) document.addEventListener(ev, mark, { passive: true, capture: true });
  setInterval(() => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || now - lastInput >= IDLE) return;
    const before = getActivity()[dayKey(now)] || 0;
    addActivityMs(TICK, now);
    const s = getSettings();
    const goal = (s.dailyGoalMin || 15) * 60000;
    if (before < goal && before + TICK >= goal && s.celebrated !== dayKey(now)) {
      setSettings({ celebrated: dayKey(now) });
      confetti();
      toast('Tagesziel geschafft 🔥');
    }
  }, TICK);
}
