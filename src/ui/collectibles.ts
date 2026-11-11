// Orden und Trick-Karten (v9 J): Medaille, Stufen-Punkte, Kartenvorderseite und die zugehörigen Sheets.
import type { SubtypeId } from '../types.ts';
import { badgeDef, badgeMaxTier, badgeProgress, type BadgeId, type BadgeInput, type BadgeTier } from '../core/badges.ts';
import { CARD_UNLOCK_SCORE, cardRarity, type Rarity } from '../core/cards.ts';
import { tierName } from './league-badge.ts';
import { CATEGORIES, SUBTYPES } from '../core/catalog.ts';
import { getMethod } from '../core/methods.ts';
import { fmt } from '../core/numbers.ts';
import { subtypeStats } from '../core/scoring.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { progressBar } from './charts.ts';
import { h } from './dom.ts';
import { button, icon, type IconName } from './kit.ts';
import { openSheet } from './sheet.ts';
import { t } from '../i18n/index.ts';

const BADGE_ICON: Record<BadgeId, IconName> = {
  streak: 'flame', perfect: 'check', solved: 'plus-minus', rounds: 'play', blitz: 'sparkles', daily: 'calendar',
  dailyPerfect: 'target', bests: 'trophy', noHelp: 'key', reviews: 'refresh', variety: 'grid', categories: 'book',
  cards: 'bulb', cases: 'chat', exhibits: 'bars', estimate: 'search', chain: 'link', parallel: 'pause', climber: 'upload',
  early: 'sun', night: 'moon', placement: 'person',
};

export const badgeName = (id: BadgeId): string => t(`rewards.badge_${id}`);
export const badgeDesc = (id: BadgeId): string => t(`rewards.badge_${id}_desc`);
const TIER_KEY = ['rewards.tier_0', 'rewards.tier_1', 'rewards.tier_2', 'rewards.tier_3'] as const;
export const tierLabel = (tier: number): string => t(TIER_KEY[Math.max(0, Math.min(3, tier))] ?? 'rewards.tier_0');

/** Stufe als Bronze/Silber/Gold; einstufige Orden zählen als Gold. */
const colorTier = (tier: number, max: number): number => (tier > 0 && max === 1 ? 3 : tier);

/** Runde Medaille mit Symbol; Farbe nach Stufe (Tokens --league-bronze/-silver/-gold), gesperrt grau. */
export function badgeMedal(id: BadgeId, tier: BadgeTier, size = 52): HTMLElement {
  const max = badgeMaxTier(id);
  const el = h('span', { class: `medal is-t${colorTier(tier, max)}`, 'aria-hidden': 'true' }, icon(BADGE_ICON[id], Math.round(size * 0.5)));
  el.style.setProperty('--medal-size', `${size}px`);
  return el;
}

/** Stufen-Punkte ●○○ mit Text für Screenreader; leer bei einstufigen Orden. */
export function tierPips(tier: number, max: number): HTMLElement | null {
  if (max <= 1) return null;
  const dots = Array.from({ length: max }, (_, i) => h('span', { class: `pip${i < tier ? ' is-on' : ''}`, 'aria-hidden': 'true' }));
  return h('span', { class: 'pips' }, dots, h('span', { class: 'sr-only' }, t('rewards.tierOf', { n: tier, max })));
}

/** Schwelle als Text: bei „Aufsteiger“ als Liga-Stufe, sonst als Zahl. */
function thresholdText(id: BadgeId, n: number): string {
  return id === 'climber' ? tierName(n) : fmt(n, 0);
}

/** Orden-Sheet: Beschreibung, Stufen-Leiter, Fortschritt zur nächsten Stufe. */
export function openBadgeSheet(id: BadgeId, input: BadgeInput, tier: BadgeTier): void {
  const max = badgeMaxTier(id);
  const prog = badgeProgress(id, input);
  const shownTier = Math.max(tier, prog.tier) as BadgeTier;
  const thresholds = badgeDef(id)?.thresholds() ?? [];
  const ladder = max > 1
    ? h('ul', { class: 'badge-ladder' }, Array.from({ length: max }, (_, i) => {
      const reached = shownTier >= i + 1;
      return h('li', { class: reached ? 'is-on' : null },
        h('span', { class: `pip${reached ? ' is-on' : ''}`, 'aria-hidden': 'true' }),
        h('span', null, tierLabel(i + 1)),
        h('span', { class: 'badge-ladder-at num' }, thresholdText(id, thresholds[i] ?? 0)),
        h('span', { class: 'sr-only' }, reached ? t('rewards.reached') : t('rewards.notReached')));
    }))
    : null;
  const next = prog.nextAt;
  const progress = next !== null && shownTier < max
    ? h('div', { class: 'badge-progress' },
      h('p', { class: 'badge-progress-line num' },
        t('rewards.progressTo', { value: thresholdText(id, prog.value), next: thresholdText(id, next) })),
      progressBar(next > 0 ? (prog.value / next) * 100 : 0, { decorative: true }))
    : h('p', { class: 'badge-done' }, icon('check', 16), t('rewards.allTiers'));
  openSheet({
    title: badgeName(id),
    children: [
      h('div', { class: 'badge-sheet-head' }, badgeMedal(id, shownTier, 64),
        h('p', { class: 'badge-sheet-tier' }, shownTier > 0 ? (max === 1 ? t('rewards.earned') : tierLabel(shownTier)) : t('rewards.locked'))),
      h('p', { class: 'badge-desc' }, badgeDesc(id)),
      ladder,
      progress,
    ],
  });
}

/* ---------- Trick-Karten ---------- */

const RARITY_KEY: Record<Rarity, 'rewards.rarity_common' | 'rewards.rarity_rare' | 'rewards.rarity_epic'> = {
  common: 'rewards.rarity_common', rare: 'rewards.rarity_rare', epic: 'rewards.rarity_epic',
};
export const rarityLabel = (r: Rarity): string => t(RARITY_KEY[r]);

export interface CardState { unlocked: boolean; score: number | null }

/** Zustand einer Karte: freigeschaltet (gespeichert oder aktuell sicher) und aktueller Skill. */
export function cardState(id: SubtypeId): CardState {
  const score = subtypeStats(getAttempts())[id]?.score ?? null;
  return { unlocked: Object.hasOwn(getSettings().cards, id) || (score ?? 0) >= CARD_UNLOCK_SCORE, score };
}

/** Kartenvorderseite; gesperrt als Silhouette mit „?“ und Fortschritt. */
export function trickCard(id: SubtypeId, state: CardState): HTMLElement {
  const sub = SUBTYPES[id];
  const rarity = cardRarity(id);
  const category = CATEGORIES.find((c) => c.id === sub?.category)?.name ?? '';
  const head = h('div', { class: 'tc-top' }, h('span', { class: 'tc-cat' }, category), h('span', { class: 'tc-rarity' }, rarityLabel(rarity)));
  const name = h('h3', { class: 'tc-name' }, sub?.name ?? id);
  if (!state.unlocked) {
    const score = state.score ?? 0;
    return h('div', { class: `trick-card is-${rarity} is-locked` }, head, name,
      h('div', { class: 'tc-silhouette', 'aria-hidden': 'true' }, '?'),
      h('p', { class: 'tc-progress num' }, t('rewards.cardSkill', { score, needed: CARD_UNLOCK_SCORE })),
      progressBar((score / CARD_UNLOCK_SCORE) * 100, { decorative: true }));
  }
  const trick = getMethod(id)?.trick ?? '';
  return h('div', { class: `trick-card is-${rarity}` }, head, name,
    trick ? h('p', { class: 'tc-trick' }, trick) : null,
    sub?.tip ? h('p', { class: 'tc-example num' }, h('span', { class: 'tc-example-label' }, t('rewards.cardExample')), ' ', sub.tip) : null);
}

/** Kleine Kartenvorschau (Ergebniszeile): Rahmen in der Seltenheitsfarbe. */
export function cardMini(id: SubtypeId): HTMLElement {
  return h('span', { class: `card-mini is-${cardRarity(id)}`, 'aria-hidden': 'true' }, icon('sparkles', 18));
}

/** Karten-Sheet: große Karte und Link zur Methode. */
export function openCardSheet(id: SubtypeId): void {
  const state = cardState(id);
  openSheet({
    title: SUBTYPES[id]?.name ?? id,
    children: [
      trickCard(id, state),
      button({ label: t('rewards.cardMethod'), kind: 'link', icon: 'book', href: `#/lernen/${id}` }),
    ],
  });
}
