// Meisterung zählen für die Lernkarte im Lernen-Tab (DOM-frei, getestet).

/** Stufe je Aufgabentyp; die Schwellen liegen in ui/kit.ts (masteryOf). */
export type MasteryLevel = 'full' | 'half' | 'empty';

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
