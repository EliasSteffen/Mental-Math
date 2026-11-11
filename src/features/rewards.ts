// Belohnungen (v9 J): Liga, Orden und Karten nach jeder Runde und beim Start auswerten und speichern.
import { habitInfo } from '../core/habit.ts';
import { cardCountOf, currentBadgeTiers, emptyEvents, evaluateRewards, type RewardEvents, type RewardHistory, type RewardStore } from '../core/rewards.ts';
import {
  getActivity, getAttempts, getChainBest, getDailyResults, getParallelStats, getSessions, getSettings, setSettings,
} from '../data/storage.ts';
import { toast } from '../ui/toast.ts';
import { go } from '../router.ts';
import { t } from '../i18n/index.ts';

export type { RewardEvents } from '../core/rewards.ts';

/** Historie aus dem Speicher (für Auswertung und Seite „Erfolge“). */
export function rewardHistory(now: number = Date.now()): RewardHistory {
  const settings = getSettings();
  const sessions = getSessions();
  return {
    attempts: getAttempts(), sessions, dailyResults: getDailyResults(),
    streakBest: habitInfo({ sessions, activity: getActivity(), goalRounds: settings.dailyGoalRounds, now }).best,
    chainBest: getChainBest(), parallelBest: getParallelStats().bestChains,
    placement: settings.placement !== null,
  };
}

export function rewardStore(): RewardStore {
  const { league, badges, cards } = getSettings();
  return { league, badges, cards };
}

/**
 * Liga, Orden und Karten neu berechnen, Neues speichern und melden.
 * Die erste Auswertung (Einstellung `league` leer, z. B. Bestandsnutzer nach dem Update) übernimmt alles still.
 */
export function updateProgressRewards(): RewardEvents & { first?: boolean } {
  try {
    const res = evaluateRewards(rewardHistory(), rewardStore(), Date.now());
    if (res.changed) setSettings({ league: res.store.league, badges: res.store.badges, cards: res.store.cards });
    return res.first ? { ...emptyEvents(), first: true } : res.events;
  } catch (e) {
    console.error('rewards', e);
    return emptyEvents();
  }
}

/** Anzeigewerte der Seite: Wertung, Stufe, Peak, wirksame Ordensstufen und Karten (gespeichert ∪ berechnet). */
export function rewardView(): {
  history: RewardHistory; store: RewardStore; rating: number; tier: number; peak: number;
  badges: ReturnType<typeof currentBadgeTiers>; cards: Record<string, number>;
} {
  const history = rewardHistory();
  const store = rewardStore();
  const res = evaluateRewards(history, store, Date.now());
  const league = res.store.league;
  return {
    history, store: res.store, rating: res.rating, tier: league?.tier ?? 0, peak: league?.peak ?? 0,
    badges: currentBadgeTiers(history, res.store, league?.peak ?? 0, cardCountOf(res.store.cards)),
    cards: res.store.cards,
  };
}

/**
 * Beim Start: still nachholen. Bestandsnutzer (bisherige Versuche, Liga noch nie ausgewertet) bekommen einmalig einen Hinweis.
 */
export function startProgressRewards(): void {
  const hadHistory = getAttempts().length > 0 || getSessions().length > 0;
  const res = updateProgressRewards();
  if (res.first && hadHistory) {
    toast(t('rewards.introToast'), { action: { label: t('rewards.introAction'), onClick: () => go('#/erfolge') }, durationMs: 9000 });
  }
}
