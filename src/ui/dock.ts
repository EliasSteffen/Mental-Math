// Dock (Ruhiger Fokus): Glasfläche unten im Fokus-Modus (Training, Ergebnis, Spielmodi).
// Oben gerundet (Radius 24), Safe-Area-Abstand unten, bleibt per position: sticky im Daumenbereich.
import { h, type Child } from './dom.ts';

/** `.dock` mit beliebigem Inhalt (Tastenfeld, Auswahl, Buttons). Nach der Antwort ersetzt ein inlineSheet das Dock. */
export function dock(...children: Child[]): HTMLElement {
  return h('div', { class: 'dock' }, ...children);
}

/** So lange nach dem Erscheinen gelten Zeiger-Klicks als Rest eines Doppeltipps (ms). */
export const TAP_GUARD_MS = 300;

/**
 * Doppeltipp-Schutz für Dock und Sheet: Zeiger-Klicks in `el` werden in den ersten TAP_GUARD_MS nach dem
 * Scharfschalten verworfen – sonst träfe der zweite Tipp auf „Prüfen“ schon „Weiter“ im Feedback-Sheet, der auf
 * „Weiter“ schon das Tastenfeld der nächsten Aufgabe. Ohne disabled (kein Flackern), nur per Zeitstempel; Klicks
 * per Tastatur (detail 0, z. B. Enter auf „Weiter“) gelten sofort. Rückgabe: erneut scharfschalten.
 */
export function tapGuard(el: HTMLElement, ms = TAP_GUARD_MS): () => void {
  let armedAt = performance.now();
  // Capture am Container: läuft vor den Klick-Handlern der Tasten und Buttons darin
  el.addEventListener('click', (e) => {
    if (e.detail > 0 && performance.now() - armedAt < ms) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });
  return () => { armedAt = performance.now(); };
}
