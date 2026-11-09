// Wisch nach unten auf einem Sheet (DOM-frei): Zieht der Finger das Sheet, oder bleibt die Bewegung beim Inhalt?

/** Ab dieser Bewegung (px) ist die Richtung entschieden. So früh, weil iOS touchmove nicht mehr abbrechen lässt, sobald es selbst scrollt. */
const DECIDE_PX = 2;

export type PullIntent = 'undecided' | 'pull' | 'none';

/** atTop: nichts unter dem Finger ist nach unten gescrollt (sonst scrollt der Wisch den Inhalt zurück). */
export function pullIntent(dx: number, dy: number, atTop: boolean): PullIntent {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_PX) return 'undecided';
  return atTop && dy > 0 && dy >= Math.abs(dx) ? 'pull' : 'none';
}
