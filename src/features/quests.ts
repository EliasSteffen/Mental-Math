// Tagesquests und Wochentruhe (v10 Q) mit Speicher: Auswahl festhalten, Fortschritt, Gutschrift genau einmal, Truhe öffnen.
// Logik in src/core/quests.ts; die Gutschrift läuft als Belohnungs-Hook (nach jeder Runde und still beim Start).
import {
  CHEST_STARS, chestContents, dayPicks, newlyDone, questLevel, questProgress, questTitle, questXp, readyChest, weekStart, weekStars,
  withDone, withPicks, type ChestContents, type ChestTier, type PickContext, type QuestData,
} from '../core/quests.ts';
import { mixCategories } from '../core/catalog.ts';
import { dueReviews } from '../core/review.ts';
import { dayKey } from '../core/progress.ts';
import { weaknesses } from '../core/scoring.ts';
import { getAttempts, getDailyResults, getReviews, getSessions, getSettings, setSettings } from '../data/storage.ts';
import { addRewardHook, type ExtraRewardLine } from './rewards.ts';
import { currentHabit } from './habit.ts';
import { grantXp } from './xp.ts';
import { t } from '../i18n/index.ts';
import { fmt } from '../core/numbers.ts';

export interface QuestItem {
  id: string;
  level: 1 | 2 | 3;
  xp: number;
  title: string;
  value: number;
  target: number;
  /** Ziel erreicht (heute) */
  complete: boolean;
  /** XP schon gutgeschrieben */
  credited: boolean;
}

export interface QuestsView {
  day: string;
  quests: QuestItem[];
  /** gutgeschriebene Quests heute (0–3) */
  doneToday: number;
  /** Montag der Woche, Sterne der Woche, höchste geöffnete Truhe, bereite Truhe (0 = keine) */
  week: string;
  stars: number;
  opened: number;
  ready: 0 | ChestTier;
}

function pickContext(): PickContext {
  const s = getSettings();
  return {
    categories: mixCategories(s.enabledCategories).map((c) => c.id),
    weakSubtypes: weaknesses(getAttempts(), 3, { enabledCategories: s.enabledCategories }).map((w) => w.subtype),
    dueCount: dueReviews(getReviews()).length,
  };
}

const dataNow = (): QuestData => ({
  attempts: getAttempts(), sessions: getSessions(), dailyResults: getDailyResults(), goalRounds: getSettings().dailyGoalRounds,
});

/** Auswahl des Tages; beim ersten Abruf wird sie gespeichert und gilt dann den ganzen Tag. */
export function ensurePicks(now: number = Date.now()): string[] {
  const day = dayKey(now);
  const log = getSettings().questLog;
  const { picks, fresh } = dayPicks(log, day, pickContext());
  if (fresh) setSettings({ questLog: withPicks(log, day, picks) });
  return picks;
}

/** Anzeigestand: Quests des Tages mit Fortschritt, Wochensterne und Truhen. */
export function questsView(now: number = Date.now()): QuestsView {
  const day = dayKey(now);
  const picks = ensurePicks(now);
  const s = getSettings();
  const data = dataNow();
  const credited = new Set(s.questLog[day]?.done ?? []);
  const quests = picks.map((id): QuestItem => {
    const p = questProgress(id, day, data);
    return {
      id, level: questLevel(id), xp: questXp(id), title: questTitle(id), value: p.value, target: p.target,
      complete: p.value >= p.target, credited: credited.has(id),
    };
  });
  const week = weekStart(day);
  const stars = weekStars(s.questLog, week);
  const opened = s.chests[week] ?? 0;
  return { day, quests, doneToday: quests.filter((q) => q.credited).length, week, stars, opened, ready: readyChest(stars, opened) };
}

/** Truhe der Woche öffnen (die nächste bereite): speichern, dann gutschreiben. null, wenn keine bereit ist (kein doppeltes Öffnen). */
export function openChest(now: number = Date.now()): ChestContents | null {
  const week = weekStart(dayKey(now));
  const s = getSettings();
  const tier = readyChest(weekStars(s.questLog, week), s.chests[week] ?? 0);
  if (tier === 0) return null;
  const contents = chestContents(week, tier, { freezes: currentHabit(now).freezes, hasFrame: s.purchases['frame:chest'] !== undefined });
  // Zuerst als geöffnet markieren (und Sachgewinne eintragen), dann XP: bei einem Abbruch geht höchstens ein Geschenk verloren, nie doppelt
  setSettings({
    chests: { ...s.chests, [week]: tier },
    ...(contents.freeze ? { freezesBought: [...s.freezesBought, now] } : {}),
    ...(contents.frame ? { purchases: { ...s.purchases, 'frame:chest': now } } : {}),
  });
  grantXp(contents.xp);
  return contents;
}

/** Erledigte, noch nicht gutgeschriebene Quests des Tages gutschreiben (genau einmal). Gibt die Zeilen der Ergebnisansicht zurück. */
export function creditQuests(now: number): Array<{ id: string; title: string; xp: number }> {
  const day = dayKey(now);
  const picks = ensurePicks(now);
  const s = getSettings();
  const data = dataNow();
  const fresh = newlyDone(s.questLog, day, picks, data);
  if (!fresh.length) return [];
  // Erst als erledigt festhalten, dann gutschreiben
  setSettings({ questLog: withDone(s.questLog, day, fresh) });
  for (const id of fresh) grantXp(questXp(id));
  return fresh.map((id) => ({ id, title: questTitle(id), xp: questXp(id) }));
}

/** Bei Belohnungen anmelden (einmal beim Start, src/app.ts). */
export function registerQuestHooks(): void {
  addRewardHook('quests', (ctx) => {
    const day = dayKey(ctx.now);
    const week = weekStart(day);
    const starsBefore = weekStars(getSettings().questLog, week);
    const done = creditQuests(ctx.now);
    if (ctx.silent || !done.length) return;
    const s = getSettings();
    const starsAfter = weekStars(s.questLog, week);
    const opened = s.chests[week] ?? 0;
    const lines: ExtraRewardLine[] = done.map((q) => ({
      id: `quest-${q.id}`, order: 10, icon: 'target', tone: 'good',
      label: t('quests.lineDone', { title: q.title }), sub: t('quests.lineXp', { xp: fmt(q.xp) }), href: '#/quests',
    }));
    // Truhe wird durch diese Quests bereit: Schwelle gerade erreicht, Stufe noch nicht geöffnet
    const crossed = CHEST_STARS.findIndex((n) => starsBefore < n && starsAfter >= n);
    if (crossed >= 0 && crossed + 1 > opened) {
      lines.push({
        id: 'quest-chest', order: 15, icon: 'gift', tone: 'good',
        label: t('quests.lineChest', { tier: t(`quests.tier${crossed + 1}`) }), sub: t('quests.lineChestSub'), href: '#/quests',
      });
    }
    return lines;
  });
}
