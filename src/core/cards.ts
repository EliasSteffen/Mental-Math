// Trick-Karten (v9 J): eine Karte je Aufgabentyp, frei sobald der Typ einmal „sicher“ ist; bleibt für immer. DOM-frei.
import type { Attempt, SubtypeId } from '../types.ts';
import { SUBTYPES } from './catalog.ts';
import { MASTERY_FULL, masteryLevel } from './mastery.ts';
import { RANKED_SUBTYPE_IDS } from './league.ts';
import { subtypeStats } from './scoring.ts';

export type Rarity = 'common' | 'rare' | 'epic';

/** Skill, ab dem die Karte frei wird (= „sicher“) */
export const CARD_UNLOCK_SCORE = MASTERY_FULL;

/** Alle Karten (Aufgabentypen der sichtbaren Kategorien) */
export const CARD_IDS: readonly SubtypeId[] = RANKED_SUBTYPE_IDS;

/** Seltenheit nach Gewicht: < 1,5 gewöhnlich, 1,5 selten, ≥ 2 episch. */
export function rarityOf(weight: number): Rarity {
  if (weight >= 2) return 'epic';
  if (weight >= 1.5) return 'rare';
  return 'common';
}

export function cardRarity(id: SubtypeId): Rarity {
  return rarityOf(SUBTYPES[id]?.weight ?? 1);
}

/** Aufgabentypen, die nach den Versuchen „sicher“ sind (Skill ≥ 70). */
export function unlockedCards(attempts: readonly Attempt[]): SubtypeId[] {
  const stats = subtypeStats(attempts as Attempt[]);
  return CARD_IDS.filter((id) => masteryLevel(stats[id]?.score) === 'full');
}

/** Skill-Fortschritt zum Freischalten (null = noch zu wenig Daten). */
export function cardProgress(id: SubtypeId, attempts: readonly Attempt[]): { score: number | null; needed: number } {
  return { score: subtypeStats(attempts as Attempt[])[id]?.score ?? null, needed: CARD_UNLOCK_SCORE };
}

/** Gespeicherte Karten (Subtyp → ts) um neu verdiente ergänzen; nie entfernen. `fresh` = erstmals freigeschaltet. */
export function mergeCards(
  stored: Readonly<Record<string, number>>, earned: readonly SubtypeId[], now: number,
): { cards: Record<string, number>; fresh: SubtypeId[] } {
  const cards: Record<string, number> = { ...stored };
  const fresh: SubtypeId[] = [];
  for (const id of earned) {
    if (!Object.hasOwn(cards, id)) { cards[id] = now; fresh.push(id); }
  }
  return { cards, fresh };
}
