// Erinnerungen ohne Server (iOS-App, lokale Benachrichtigungen): spielt den Minutentakt des Servers (decide + replan aus
// reminders.ts) im Voraus durch. Dieselben Regeln wie bei Web Push; ändern sich die Regeln, folgt die App automatisch.
import { decide, nextAt, planAll, replan } from './reminders.ts';
import type { ReminderKind, ReminderPrefs, ReminderState } from './reminders.ts';

export interface PlannedReminder { at: number; kind: ReminderKind }

export interface LocalPlanInput {
  prefs: ReminderPrefs;
  /** Lernstand beim Planen (at = jetzt: Wer gerade in der App war, bekommt die nächsten 20 Minuten nichts) */
  state: ReminderState | null;
  tz: string;
  now: number;
  /** Letzte zugestellte Benachrichtigung bzw. Wiederholungs-Erinnerung (aus dem vorigen Plan) */
  lastSentAt: number | null;
  lastReviewSent: number | null;
  /** Wie weit vorausplanen (ms); danach plant die App beim nächsten Öffnen neu */
  horizonMs: number;
  /** iOS hält höchstens 64 ausstehende Benachrichtigungen */
  max: number;
}

const TICK_MS = 60_000;
const MAX_STEPS = 5000;

/** Zeitpunkte und Arten, die der Server-Takt bei unverändertem Lernstand senden würde. */
export function planLocal(o: LocalPlanInput): PlannedReminder[] {
  const { prefs, state, tz } = o;
  let lastSentAt = o.lastSentAt;
  let lastReviewSent = o.lastReviewSent;
  let sched = planAll({ prefs, state, tz, from: o.now, lastReviewSent });
  const end = o.now + o.horizonMs;
  const out: PlannedReminder[] = [];
  let prev = o.now - TICK_MS;
  for (let i = 0; i < MAX_STEPS && out.length < o.max; i++) {
    const next = nextAt(sched);
    if (next === null) break;
    // Wie der Cron: frühestens eine Minute nach dem vorigen Takt
    const t = Math.max(next, prev + TICK_MS);
    if (t > end) break;
    prev = t;
    const d = decide({ now: t, tz, prefs, state, sched, lastSentAt });
    if (d.kind) {
      out.push({ at: t, kind: d.kind });
      lastSentAt = t;
      if (d.kind === 'review') lastReviewSent = t;
    }
    sched = replan({ now: t, tz, prefs, state, sched, lastSentAt, kinds: d.due, lastReviewSent });
  }
  return out;
}
