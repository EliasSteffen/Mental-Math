// Rückmeldung (Ruhiger Fokus): kurze Haptik und ein leiser Zweiklang nur bei „richtig“.
// Kein Fehlerton, kein Vibrationsmuster für Fehler – Feedback informiert statt zu urteilen.
import { getSettings } from '../data/storage.ts';
import { haptic as platformHaptic } from '../platform/index.ts';
import type { HapticKind } from '../platform/index.ts';

export type { HapticKind } from '../platform/index.ts';

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

/** Kurze Haptik, nur wenn sie eingeschaltet ist (Browser: Vibration, iOS-App: Taptic Engine). */
export function haptic(kind: HapticKind): void {
  try {
    if (!getSettings().haptics) return;
    platformHaptic(kind);
  } catch { /* ignorieren */ }
}

/** Leiser Zweiklang 660 → 880 Hz, je 80 ms. Prüft die Einstellung nicht selbst (siehe answerFx). */
export function tone(): void {
  try {
    const g0 = globalThis as typeof globalThis & { webkitAudioContext?: AudioCtor };
    const AC: AudioCtor | undefined = g0.AudioContext || g0.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(660, t0);
    o.frequency.setValueAtTime(880, t0 + 0.08);
    // weiche Hüllkurve gegen Knacken
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.01);
    g.gain.setValueAtTime(0.05, t0 + 0.15);
    g.gain.linearRampToValueAtTime(0, t0 + 0.16);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + 0.17);
  } catch { /* ignorieren */ }
}

/** Rückmeldung auf eine Antwort: richtig → Haptik 'success' + Zweiklang (wenn Ton an); falsch → nur 'soft', kein Ton. */
export function answerFx(correct: boolean): void {
  if (correct) {
    haptic('success');
    try {
      if (getSettings().sound) tone();
    } catch { /* ignorieren */ }
  } else {
    haptic('soft');
  }
}

/** @deprecated Kompatibilität bis Welle 2 (Training stellt auf answerFx um). */
export const feedbackFx: (ok: boolean) => void = answerFx;
