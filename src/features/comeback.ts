// Comeback und Serie reparieren (v10 C) mit Speicher: Hooks nach jeder Runde, Reparatur mit XP. Logik in src/core/comeback.ts.
import { COMEBACK_XP, REPAIR_ROUNDS, comebackState, repairOffer, type ComebackState, type RepairOffer } from '../core/comeback.ts';
import { dayKey } from '../core/progress.ts';
import type { ExtraRewardLine } from '../core/rewards.ts';
import { getActivity, getSessions, getSettings, setSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { currentHabit } from './habit.ts';
import { addRewardHook } from './rewards.ts';
import { grantXp, spendXp } from './xp.ts';

/** Aktuelles Reparatur-Angebot (null = nichts zu reparieren). */
export function currentRepairOffer(now: number = Date.now()): RepairOffer | null {
  return repairOffer({ habit: currentHabit(now), repairs: getSettings().streakRepairs, now });
}

/** Comeback-Zustand heute (Tage weg, Bonus offen). */
export function currentComeback(now: number = Date.now()): ComebackState {
  return comebackState({ sessions: getSessions(), activity: getActivity(), now, claimedDays: getSettings().comebackDays });
}

function markRepaired(day: string): void {
  const s = getSettings();
  if (!s.streakRepairs.includes(day)) setSettings({ streakRepairs: [...s.streakRepairs, day] });
}

/** Serie mit XP reparieren: false, wenn nichts zu reparieren ist oder das Guthaben nicht reicht. Liefert sonst die neue Serienlänge. */
export function repairWithXp(now: number = Date.now()): number | false {
  const offer = currentRepairOffer(now);
  if (!offer || !spendXp(offer.xpCost)) return false;
  markRepaired(offer.day);
  return currentHabit(now).streak;
}

/** In src/app.ts vor startProgressRewards() aufrufen. */
export function registerComebackHooks(): void {
  addRewardHook('comeback', (ctx) => {
    const lines: ExtraRewardLine[] = [];
    // Reparatur durch Runden (auch still nachholen)
    const offer = currentRepairOffer(ctx.now);
    if (offer && currentHabit(ctx.now).todayRounds >= REPAIR_ROUNDS) {
      markRepaired(offer.day);
      lines.push({ id: 'repair', order: 0, icon: 'flame', tone: 'good', label: t('comeback.lineRepaired', { n: currentHabit(ctx.now).streak }) });
    }
    // Comeback-Bonus nur nach einer Runde; „vorher weg“ = aktive Tage ohne heute
    if (ctx.trigger === 'round') {
      const st = currentComeback(ctx.now);
      if (st.eligible) {
        grantXp(COMEBACK_XP);
        setSettings({ comebackDays: [...getSettings().comebackDays, dayKey(ctx.now)] });
        lines.push({ id: 'comeback', order: 5, icon: 'sparkles', tone: 'good', label: t('comeback.lineWelcome', { xp: COMEBACK_XP }) });
      }
    }
    return ctx.silent ? undefined : lines;
  });
}
