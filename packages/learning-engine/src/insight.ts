// Runden-Erkenntnis: häufigste Fehlerart einer Runde und der Aufgabentyp, bei dem sie am öftesten vorkam.
import type { ErrorType, RoundInsight, RoundItem } from './types.ts';

/** Bei Gleichstand gewinnt die aussagekräftigere Fehlerart. */
const TYPE_ORDER: readonly ErrorType[] = ['nullen', 'knapp', 'falsch', 'skip'];

/** Erst ab 2 Fehlern, sonst null. Fehler ohne Art zählen als 'falsch'. */
export function roundInsight(items: readonly RoundItem[]): RoundInsight | null {
  const wrong = items.filter((r) => !r.correct);
  if (wrong.length < 2) return null;
  const byType = new Map<ErrorType, string[]>();
  for (const r of wrong) {
    const type: ErrorType = r.errorType ?? 'falsch';
    byType.set(type, [...(byType.get(type) ?? []), r.subtype]);
  }
  let best: ErrorType | null = null;
  for (const type of TYPE_ORDER) {
    const n = byType.get(type)?.length ?? 0;
    if (n > 0 && (best === null || n > (byType.get(best)?.length ?? 0))) best = type;
  }
  if (best === null) return null;
  const subs = byType.get(best) ?? [];
  const counts = new Map<string, number>();
  for (const s of subs) counts.set(s, (counts.get(s) ?? 0) + 1);
  let subtype = subs[0] ?? '';
  for (const [s, n] of counts) if (n > (counts.get(subtype) ?? 0)) subtype = s;
  return { type: best, count: subs.length, subtype };
}
