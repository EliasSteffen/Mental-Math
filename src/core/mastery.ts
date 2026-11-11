// Meisterung zählen für die Lernkarte im Lernen-Tab (DOM-frei, getestet).

/** Stufe je Aufgabentyp (Schwellen: MASTERY_FULL / MASTERY_HALF, Auswertung: masteryLevel). */
export type MasteryLevel = 'full' | 'half' | 'empty';

/** Skill ab dem ein Aufgabentyp „sicher“ ist bzw. halb sitzt (v9 J: eine Quelle für Anzeige, Karten und Orden). */
export const MASTERY_FULL = 70;
export const MASTERY_HALF = 40;

/** Meisterung aus dem Skill-Wert: ≥ 70 voll, 40–69 halb, sonst (auch ohne Daten) leer. */
export function masteryLevel(score: number | null | undefined): MasteryLevel {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'empty';
  if (score >= MASTERY_FULL) return 'full';
  if (score >= MASTERY_HALF) return 'half';
  return 'empty';
}

export interface MasteryCounts {
  full: number;
  half: number;
  empty: number;
  total: number;
}

export interface MasteryItem {
  category: string;
  mastery: MasteryLevel;
}

const EMPTY: MasteryCounts = { full: 0, half: 0, empty: 0, total: 0 };

/** Zählt die Stufen über alle Einträge und je Kategorie. Unbekannte Stufen zählen als „offen“. */
export function masteryCounts(items: readonly MasteryItem[]): {
  overall: MasteryCounts;
  categories: Record<string, MasteryCounts>;
} {
  const overall: MasteryCounts = { ...EMPTY };
  const categories: Record<string, MasteryCounts> = {};
  for (const item of items) {
    const level: MasteryLevel = item.mastery === 'full' || item.mastery === 'half' ? item.mastery : 'empty';
    const cat = categories[item.category] ?? (categories[item.category] = { ...EMPTY });
    for (const c of [overall, cat]) {
      c[level] += 1;
      c.total += 1;
    }
  }
  return { overall, categories };
}
