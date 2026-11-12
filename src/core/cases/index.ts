// Mini-Case-Vorlagen: Liste, Zugriff, Erzeugung (v9 C).
import type { Rng } from '../numbers.ts';
import { breakeven, invest, market, profit } from './templates-a.ts';
import { exhibit, growth, ops, pricing } from './templates-b.ts';
import type { CaseTemplate, MiniCase } from './types.ts';

export type * from './types.ts';

export const CASE_TEMPLATES: readonly CaseTemplate[] = [market, profit, breakeven, invest, pricing, ops, growth, exhibit];

export function caseById(id: string): CaseTemplate | null {
  return CASE_TEMPLATES.find((c) => c.id === id) ?? null;
}

export function generateCase(id: string, rng: Rng): MiniCase {
  const tpl = caseById(id);
  if (!tpl) throw new Error(`Unbekannte Case-Vorlage: ${id}`);
  return tpl.generate(rng);
}

/** Zufällige Vorlage, möglichst nicht die zuletzt gespielte. */
export function randomCaseId(rng: Rng, exclude: string | null = null): string {
  const pool = CASE_TEMPLATES.filter((c) => c.id !== exclude);
  const list = pool.length > 0 ? pool : CASE_TEMPLATES;
  return (list[Math.min(list.length - 1, Math.floor(rng() * list.length))] as CaseTemplate).id;
}

/** Bestes Ergebnis einer Vorlage aus den Runden (`case:<id>`): größter Anteil richtiger Schritte; null = noch nicht gespielt. */
export function caseBest(sessions: ReadonlyArray<{ mode: string; n: number; correct: number }>, id: string): { correct: number; n: number } | null {
  let best: { correct: number; n: number } | null = null;
  for (const s of sessions) {
    if (s.mode !== `case:${id}` || s.n <= 0) continue;
    if (!best || s.correct / s.n > best.correct / best.n) best = { correct: s.correct, n: s.n };
  }
  return best;
}
