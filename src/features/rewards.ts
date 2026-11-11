// Belohnungen (v9 J): Liga, Orden und Karten nach jeder Runde und beim Start auswerten und speichern.
import { currentHabit } from './habit.ts';
import {
  cardCountOf, currentBadgeTiers, emptyEvents, evaluateRewards, type ExtraRewardLine, type RewardEvents, type RewardHistory, type RewardStore,
} from '../core/rewards.ts';
import { syncXp } from './xp.ts';
import {
  getActivity, getAttempts, getChainBest, getDailyResults, getParallelStats, getSessions, getSettings, setSettings,
} from '../data/storage.ts';
import { scheduleLeagueSync } from './league-sync.ts'; // v9 K
import { toast } from '../ui/toast.ts';
import { go } from '../router.ts';
import { t } from '../i18n/index.ts';

export type { RewardEvents, ExtraRewardLine } from '../core/rewards.ts';

/* ---------- v10: Erweiterungen (Quests, Comeback, Reparatur, LP) ---------- */

export interface RewardHookContext {
  now: number;
  /** 'round' = gerade eine Runde beendet (Ergebnis-Bildschirm); 'start' = App-Start (still nachholen, nichts anzeigen) */
  trigger: 'round' | 'start';
  /** true: Zeilen werden nicht angezeigt (Start, erste Auswertung eines Bestandsnutzers) – nur still gutschreiben */
  silent: boolean;
  /** Liga-Wertung vor dieser Auswertung (−1 = unbekannt) und danach; Stufe danach */
  ratingBefore: number;
  rating: number;
  tier: number;
  /** Ereignisse der Kern-Auswertung (Aufstieg, Orden, Karten) */
  events: RewardEvents;
}
export type RewardHook = (ctx: RewardHookContext) => ExtraRewardLine[] | void;

const hooks = new Map<string, RewardHook>();

/** Erweiterung anmelden (einmal beim Start, z. B. aus src/app.ts); gleiche id ersetzt. */
export function addRewardHook(id: string, hook: RewardHook): void { hooks.set(id, hook); }

function runHooks(ctx: RewardHookContext): ExtraRewardLine[] {
  const out: ExtraRewardLine[] = [];
  for (const [id, hook] of hooks) {
    try {
      const lines = hook(ctx);
      if (lines) out.push(...lines);
    } catch (e) {
      console.error('reward hook', id, e);
    }
  }
  return out;
}

/** Historie aus dem Speicher (für Auswertung und Seite „Erfolge“). */
export function rewardHistory(now: number = Date.now()): RewardHistory {
  const settings = getSettings();
  const sessions = getSessions();
  return {
    attempts: getAttempts(), sessions, dailyResults: getDailyResults(),
    streakBest: currentHabit(now).best, // v10
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
export function updateProgressRewards(trigger: 'round' | 'start' = 'round'): RewardEvents & { first?: boolean } {
  try {
    const now = Date.now();
    syncXp(); // v10: XP-Konto mit den Aufgaben abgleichen
    const ratingBefore = getSettings().lpSeen;
    const res = evaluateRewards(rewardHistory(now), rewardStore(), now);
    if (res.changed) setSettings({ league: res.store.league, badges: res.store.badges, cards: res.store.cards });
    if (res.rating !== ratingBefore) setSettings({ lpSeen: res.rating }); // v10
    scheduleLeagueSync(); // v9 K: Wertung melden (Konto, gedrosselt, im Hintergrund)
    // v10: Erweiterungen laufen immer (still beim Start und bei der ersten Auswertung)
    const silent = trigger === 'start' || res.first;
    const extra = runHooks({
      now, trigger, silent, ratingBefore, rating: res.rating, tier: res.store.league?.tier ?? 0, events: res.events,
    });
    if (silent) return res.first ? { ...emptyEvents(), first: true } : emptyEvents();
    return extra.length ? { ...res.events, extra } : res.events;
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
  const res = updateProgressRewards('start');
  if (res.first && hadHistory) {
    toast(t('rewards.introToast'), { action: { label: t('rewards.introAction'), onClick: () => go('#/erfolge') }, durationMs: 9000 });
  }
}
