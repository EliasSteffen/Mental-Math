// Feedback effects: haptics + tiny WebAudio beep.
import { getSettings } from './storage.js';

let ctx = null;

function beep(ok) {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.1 : 0.2));
  } catch { /* ignore */ }
}

export function feedbackFx(ok) {
  const s = getSettings();
  try {
    if (s.haptics && navigator.vibrate) navigator.vibrate(ok ? 15 : [30, 40, 30]);
  } catch { /* ignore */ }
  if (s.sound) beep(ok);
}
