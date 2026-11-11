// Nächstes Ziel (v10 F, DOM-frei): die Schritte mit dem größten Fortschritt – Liga, Orden, Trick-Karte, Level, Tagesziel.
import { t } from '../i18n/index.ts';
import { SUBTYPES } from './catalog.ts';
import { MASTERY_FULL } from './mastery.ts';
import { badgeMaxTier, badgeProgress, BADGE_IDS, type BadgeId, type BadgeInput, type BadgeTier } from './badges.ts';
import { MAX_TIER, tierInfo, tierProgress } from './league.ts';

export type GoalKind = 'goal' | 'badge' | 'card' | 'league' | 'level';

/** Reihenfolge bei Gleichstand */
export const GOAL_ORDER: readonly GoalKind[] = ['goal', 'badge', 'card', 'league', 'level'];
/** Ab so viel Skill beginnt der Weg zur Trick-Karte (Karte ab MASTERY_FULL) */
export const CARD_GOAL_MIN = 50;

const HREF: Record<GoalKind, string> = {
  goal: '#/train/all', badge: '#/erfolge/orden', card: '#/erfolge/karten', league: '#/erfolge', level: '#/fortschritt',
};

export interface NextGoal {
  kind: GoalKind;
  label: string;
  sub?: string;
  href: string;
  /** Anteil erreicht, 0–1 (Auswahl nur bei 0 < progress < 1) */
  progress: number;
  /** Was noch fehlt (LP, Schritte, XP, Runden) */
  remaining: number;
}

export interface GoalInput {
  /** Liga-Wertung 0–1000 und gespeicherte Stufe (0–15, mit Hysterese) */
  rating: number;
  tier: number;
  /** Orden: Werte für badgeProgress; tiers = wirksame Stufen (gespeichert ∪ berechnet) */
  badges: { input: BadgeInput; tiers: Readonly<Partial<Record<BadgeId, BadgeTier>>> };
  /** Skill je Trick-Karten-Aufgabentyp (null = ungeübt) */
  cardSkills: ReadonlyArray<{ id: string; score: number | null }>;
  /** XP-Konto: Level und Fortschritt im Level */
  xp: { level: number; into: number; needed: number };
  habit: { todayRounds: number; goalRounds: number };
}

const ROMAN = ['I', 'II', 'III'] as const;

/** Name einer Liga-Stufe wie „Gold III“ (Meister ohne Zahl). */
export function leagueTierName(tier: number): string {
  const info = tierInfo(tier);
  const league = t(`rewards.league_${info.league}` as 'rewards.league_bronze');
  return info.step === null ? league : `${league} ${ROMAN[info.step - 1] ?? ''}`;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function leagueGoal(i: GoalInput): NextGoal | null {
  const info = tierInfo(i.tier);
  if (info.next === null || i.tier >= MAX_TIER) return null; // Meister: keine nächste Liga
  const remaining = Math.ceil(info.next - i.rating);
  if (remaining <= 0) return null;
  return {
    kind: 'league', label: t('goals.league', { n: remaining, name: leagueTierName(i.tier + 1) }),
    href: HREF.league, progress: clamp01(tierProgress(i.tier, i.rating).fraction), remaining,
  };
}

function badgeGoals(i: GoalInput): NextGoal[] {
  const out: NextGoal[] = [];
  for (const id of BADGE_IDS) {
    const prog = badgeProgress(id, i.badges.input);
    if (prog.nextAt === null) continue; // höchste Stufe erreicht
    // Gespeichert ist eine höhere Stufe als berechenbar: kein nachvollziehbarer Schritt
    if ((i.badges.tiers[id] ?? 0) > prog.tier) continue;
    const remaining = prog.nextAt - prog.value;
    if (remaining <= 0) continue;
    const name = t(`rewards.badge_${id}` as 'rewards.badge_streak');
    const label = badgeMaxTier(id) > 1
      ? t('goals.badgeTier', { n: remaining, name, tier: t(`rewards.tier_${prog.tier + 1}` as 'rewards.tier_1') })
      : t('goals.badge', { n: remaining, name });
    out.push({
      kind: 'badge', label, sub: t('rewards.progressTo', { value: prog.value, next: prog.nextAt }), href: HREF.badge,
      progress: clamp01(prog.value / prog.nextAt), remaining,
    });
  }
  return out;
}

function cardGoals(i: GoalInput): NextGoal[] {
  const out: NextGoal[] = [];
  for (const c of i.cardSkills) {
    if (c.score === null || !Number.isFinite(c.score) || c.score < CARD_GOAL_MIN || c.score >= MASTERY_FULL) continue;
    const remaining = Math.ceil(MASTERY_FULL - c.score);
    out.push({
      kind: 'card', label: t('goals.card', { n: remaining, name: SUBTYPES[c.id]?.name ?? c.id }),
      sub: t('goals.cardSub', { score: Math.round(c.score), full: MASTERY_FULL }), href: HREF.card,
      progress: clamp01(c.score / MASTERY_FULL), remaining,
    });
  }
  return out;
}

function levelGoal(i: GoalInput): NextGoal | null {
  const remaining = i.xp.needed - i.xp.into;
  if (!(i.xp.needed > 0) || remaining <= 0) return null;
  return {
    kind: 'level', label: t('goals.level', { n: remaining, level: i.xp.level + 1 }), href: HREF.level,
    progress: clamp01(i.xp.into / i.xp.needed), remaining,
  };
}

function goalGoal(i: GoalInput): NextGoal | null {
  const remaining = i.habit.goalRounds - i.habit.todayRounds;
  if (!(i.habit.goalRounds > 0) || remaining <= 0) return null;
  return {
    kind: 'goal', label: t(remaining === 1 ? 'goals.goalOne' : 'goals.goal', { n: remaining }), href: HREF.goal,
    progress: clamp01(i.habit.todayRounds / i.habit.goalRounds), remaining,
  };
}

/**
 * Nächste Ziele, größter Fortschritt zuerst. Nur Schritte mit 0 < Fortschritt < 1 zählen (Anfang und Erreichtes fallen weg);
 * bei Gleichstand gilt GOAL_ORDER. `max` begrenzt die Zahl (Heute und Ergebnis zeigen eines).
 */
export function nextGoals(input: GoalInput, max = 2): NextGoal[] {
  const all: NextGoal[] = [];
  const league = leagueGoal(input);
  if (league) all.push(league);
  all.push(...badgeGoals(input), ...cardGoals(input));
  const level = levelGoal(input);
  if (level) all.push(level);
  const goal = goalGoal(input);
  if (goal) all.push(goal);
  const open = all.filter((g) => g.progress > 0 && g.progress < 1 && g.remaining > 0);
  open.sort((a, b) => b.progress - a.progress || GOAL_ORDER.indexOf(a.kind) - GOAL_ORDER.indexOf(b.kind));
  return open.slice(0, Math.max(0, Math.floor(max)));
}
