// Auto-Weiter nach richtigen Antworten (v9 A). DOM-frei.

/** So lange bleibt das Feedback nach einer richtigen Antwort stehen, bevor die nächste Aufgabe kommt. */
export const AUTO_ADVANCE_MS = 700;

/** Nur richtige, nicht abgelaufene Antworten gehen von selbst weiter; Fehler und Übersprungenes warten auf „Weiter“. */
export function shouldAutoAdvance(o: { enabled: boolean; correct: boolean; timedOut: boolean }): boolean {
  return o.enabled && o.correct && !o.timedOut;
}
