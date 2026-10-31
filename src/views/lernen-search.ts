// Reine Helfer für den Lernen-Tab (ohne DOM, testbar): Suchtext normalisieren, Treffer prüfen, nächsten Subtyp wählen.

/**
 * Text für die Suche vereinheitlichen: Kleinbuchstaben, ohne Akzente (é → e, ä → a), ß → ss,
 * × → x (Nutzer tippen „x“), hochgestellte Ziffern als Ziffern (² → 2), Leerraum zusammengefasst.
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/×/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True, wenn jeder Begriff der (normalisierten) Suche im (normalisierten) Text vorkommt; leere Suche passt immer. */
export function matchesSearch(haystack: string, query: string): boolean {
  const terms = query.split(' ').filter(Boolean);
  return terms.every((term) => haystack.includes(term));
}

/**
 * Erstes Element mit dem kleinsten Rang (Reihenfolge entscheidet bei Gleichstand), z. B. der erste Subtyp
 * mit der niedrigsten Meisterung in Kategorienreihenfolge. Leere Liste → null.
 */
export function pickNext<T>(items: readonly T[], rank: (item: T) => number): T | null {
  let best: T | null = null;
  let bestRank = Infinity;
  for (const item of items) {
    const r = rank(item);
    if (r < bestRank) {
      best = item;
      bestRank = r;
    }
  }
  return best;
}
