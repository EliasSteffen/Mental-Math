// Rundenbilanz auf dem Ergebnis (v9 A). DOM-frei.
import type { Attempt, Mode, Session, SubtypeId } from '../types.ts';
import { personalBest, xpInfo } from './progress.ts';
import { subtypeStats } from './scoring.ts';
import { leagueRating, nextTier } from './league.ts'; // v10 F
import { levelOf } from './xp.ts'; // v10 F

export interface RoundRecap {
  /** n ≥ 3, alle richtig, keine Hilfe genutzt */
  perfect: boolean;
  newBest: { avgMs: number; prevAvgMs: number | null } | null;
  /** gegen die letzte Runde desselben Modus; deltaAvgMs = jetzt − vorher (negativ = schneller) */
  vsLast: { deltaAvgMs: number; deltaAcc: number } | null;
  /** größter Zuwachs (> 0) unter den Subtypen der Runde */
  skill: { subtype: SubtypeId; before: number | null; after: number } | null;
  /** Level aus dem XP-Konto (xp) bzw. aus den Aufgaben-XP; gained = XP dieser Runde (inkl. Geschenke) */
  level: { level: number; into: number; needed: number; gained: number; levelUp: boolean };
  /** v10 F: Liga-Wertung (LP) vor und nach der Runde; tier = Stufe danach (mit Hysterese ab der gespeicherten Stufe) */
  lp: { before: number; after: number; delta: number; tier: number };
}

/** Feste oder fremde Runden: kein Bestzeit-Vergleich */
export const NO_BEST = new Set(['daily', 'retry', 'review', 'placement', 'challenge', 'custom']);

export function roundRecap(o: {
  mode: Mode; n: number; correct: number; avgMs: number; assistedAny: boolean;
  sessionsBefore: readonly Session[]; attemptsBefore: readonly Attempt[]; attemptsAfter: readonly Attempt[];
  /** v10 F: alle je verdienten XP (XP-Konto) vor und nach der Runde; fehlt → Aufgaben-XP der Versuche */
  xp?: { before: number; after: number };
  /** v10 F: gespeicherte Liga-Stufe vor der Runde (null = noch nie ausgewertet) */
  leagueTier?: number | null;
}): RoundRecap {
  const { mode, n, correct, avgMs } = o;
  const perfect = n >= 3 && correct === n && !o.assistedAny;

  let newBest: RoundRecap['newBest'] = null;
  if (!NO_BEST.has(mode) && n >= 5 && correct / n >= 0.8 && avgMs > 0) {
    const prev = personalBest(o.sessionsBefore as Session[], mode);
    if (!prev || avgMs < prev.avgMs) newBest = { avgMs, prevAvgMs: prev ? prev.avgMs : null };
  }

  // Letzte Runde desselben Modus (nach Zeitpunkt)
  let last: Session | null = null;
  for (const s of o.sessionsBefore) if (s.mode === mode && s.n > 0 && (!last || s.ts > last.ts)) last = s;
  const vsLast = last && n > 0
    ? { deltaAvgMs: avgMs - last.avgTimeMs, deltaAcc: correct / n - last.correct / last.n }
    : null;

  // Skill: größter Zuwachs unter den Subtypen, die in dieser Runde vorkamen
  const before = subtypeStats(o.attemptsBefore as Attempt[]);
  const after = subtypeStats(o.attemptsAfter as Attempt[]);
  const count = (list: readonly Attempt[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const a of list) m.set(a.subtype, (m.get(a.subtype) ?? 0) + 1);
    return m;
  };
  const cb = count(o.attemptsBefore);
  const touched = [...count(o.attemptsAfter)].filter(([id, c]) => c > (cb.get(id) ?? 0)).map(([id]) => id);
  let skill: RoundRecap['skill'] = null;
  let bestGain = 0;
  for (const id of touched) {
    const a = after[id]?.score;
    if (a === null || a === undefined) continue;
    const b = before[id]?.score ?? null;
    const gain = a - (b ?? 0);
    if (gain > bestGain) { bestGain = gain; skill = { subtype: id, before: b, after: a }; }
  }

  // v10 F: Level aus dem XP-Konto (Geschenke zählen mit); ohne Angabe wie bisher aus den Aufgaben-XP
  let level: RoundRecap['level'];
  if (o.xp) {
    const a = levelOf(o.xp.after);
    const b = levelOf(o.xp.before);
    level = { level: a.level, into: a.into, needed: a.needed, gained: o.xp.after - o.xp.before, levelUp: a.level > b.level };
  } else {
    const xb = xpInfo(o.attemptsBefore as Attempt[]);
    const xa = xpInfo(o.attemptsAfter as Attempt[]);
    level = { level: xa.level, into: xa.into, needed: xa.needed, gained: xa.xp - xb.xp, levelUp: xa.level > xb.level };
  }

  // v10 F: Liga-Wertung vor/nach der Runde, Stufe nach der Runde
  const ratingBefore = leagueRating(o.attemptsBefore as Attempt[]);
  const ratingAfter = leagueRating(o.attemptsAfter as Attempt[]);
  const lp = { before: ratingBefore, after: ratingAfter, delta: ratingAfter - ratingBefore, tier: nextTier(o.leagueTier ?? null, ratingAfter) };

  return { perfect, newBest, vsLast, skill, level, lp };
}
