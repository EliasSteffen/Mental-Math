// XP-Konto (v10, DOM-frei): Level aus allen je verdienten XP, ausgeben nur vom Guthaben.
// Aufgaben-XP = Summe der Punkte der gespeicherten Versuche. Weil höchstens 5.000 Versuche bleiben, wird der Zuwachs
// aufsummiert (earned) statt jedes Mal neu gezählt – so sinken Level und Guthaben nie, wenn alte Versuche wegfallen.
import type { Attempt, XpLedger } from '../types.ts';

export const EMPTY_LEDGER: XpLedger = { earned: 0, seen: 0, bonus: 0, spent: 0 };

/** Punkte aller gespeicherten Versuche. */
export function attemptXp(attempts: readonly Pick<Attempt, 'points'>[] | null | undefined): number {
  return Math.max(0, Math.round((attempts || []).reduce((s, a) => s + (Number.isFinite(a.points) ? a.points : 0), 0)));
}

/**
 * Abgleich mit den aktuellen Aufgaben-XP: Zuwachs seit dem letzten Abgleich zählt dazu, ein Rückgang (gelöschte oder
 * vom Speicherlimit entfernte Versuche) nicht. Nie weniger als die gerade gezählten Aufgaben-XP (Bestandsnutzer, Import).
 */
export function syncLedger(l: XpLedger, currentAttemptXp: number): XpLedger {
  const now = Math.max(0, Math.floor(currentAttemptXp));
  const delta = now - l.seen;
  const earned = Math.max(delta > 0 ? l.earned + delta : l.earned, now);
  return { ...l, earned, seen: now };
}

/** Alle je verdienten XP (Aufgaben + Geschenke) – Grundlage für das Level. */
export const lifetimeXp = (l: XpLedger): number => l.earned + l.bonus;

/** Ausgebbares Guthaben. */
export const xpBalance = (l: XpLedger): number => Math.max(0, lifetimeXp(l) - l.spent);

export interface LevelInfo { level: number; into: number; needed: number }

/** Level aus XP: Level n braucht 500 × n XP bis Level n + 1 (wie bisher `xpInfo`). */
export function levelOf(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= 500 * level) { rest -= 500 * level; level++; }
  return { level, into: rest, needed: 500 * level };
}

/** Geschenkte XP gutschreiben (Quests, Truhen, Comeback). Nicht-positive oder ungültige Beträge ändern nichts. */
export function withGrant(l: XpLedger, amount: number): XpLedger {
  const n = Math.floor(amount);
  return Number.isFinite(n) && n > 0 ? { ...l, bonus: l.bonus + n } : l;
}

/** XP ausgeben; null, wenn das Guthaben nicht reicht oder der Betrag ungültig ist. */
export function withSpend(l: XpLedger, amount: number): XpLedger | null {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n <= 0 || n > xpBalance(l)) return null;
  return { ...l, spent: l.spent + n };
}
