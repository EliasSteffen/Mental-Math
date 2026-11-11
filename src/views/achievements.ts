// Erfolge (v9 J, v11 E): Übersicht #/erfolge und Unterseiten Liga · Orden · Karten · Shop. Alles aus der Historie berechnet.
import type { BadgeInput } from '../core/badges.ts';
import { BADGES } from '../core/badges.ts';
import { CARD_IDS } from '../core/cards.ts';
import { CATEGORIES, SUBTYPES } from '../core/catalog.ts';
import { LEAGUES, TIER_MINS, tierInfo, tierOf, tierProgress, type ChampionInfo } from '../core/league.ts';
import { fmt } from '../core/numbers.ts';
import { cardCountOf } from '../core/rewards.ts';
import { rewardView } from '../features/rewards.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { app, appendChildren, h } from '../ui/dom.ts';
import { backLink, card, columns, group, largeTitle, list, row } from '../ui/kit.ts';
import { progressBar } from '../ui/charts.ts';
import { leagueEmblem, leagueLabel, tierName } from '../ui/league-badge.ts';
import { badgeMaxTier } from '../core/badges.ts';
import {
  badgeMedal, badgeName, openBadgeSheet, openCardSheet, rarityLabel, tierPips,
} from '../ui/collectibles.ts';
import { cardRarity } from '../core/cards.ts';
import { isTablet } from '../ui/viewport.ts';
import { championAvailable, championCount, championInfo as cachedChampionInfo, onChampionChange, syncLeague } from '../features/league-sync.ts'; // v9 K
import { addCleanup } from '../router.ts'; // v9 K
import { activeFrame } from '../features/shop.ts'; // v10 P
import { shopView } from './shop.ts'; // v10 P
import { overviewView } from './achievements-overview.ts'; // v11 E
import { t } from '../i18n/index.ts';

export type AchievementTab = 'liga' | 'orden' | 'karten' | 'shop';
export const ACHIEVEMENT_TABS: readonly AchievementTab[] = ['liga', 'orden', 'karten', 'shop']; // v10 P: Shop
/** Champion-Status (Paket K): standardmäßig aus dem Zwischenspeicher von league-sync. */
let championProvider: () => ChampionInfo | null = cachedChampionInfo;
export function setChampionProvider(fn: () => ChampionInfo | null): void { championProvider = fn; }
/** v9 H: aktueller Champion-Status (Spielerkarte im Profil); null, solange Paket K nichts liefert. */
export function championInfo(): ChampionInfo | null { return championProvider(); }

type View = ReturnType<typeof rewardView>;

/* ---------- Liga ---------- */

function heroCard(v: View, champion: ChampionInfo | null): HTMLElement {
  const isMaster = tierInfo(v.tier).step === null;
  const shownChampion = isMaster ? champion : null;
  const info = tierInfo(v.tier);
  const prog = tierProgress(v.tier, v.rating);
  const nextName = info.next === null ? null : tierName(v.tier + 1);
  const name = shownChampion ? t('rewards.championRank', { rank: shownChampion.rank }) : tierName(v.tier);
  return card([
    h('div', { class: 'ach-hero' },
      leagueEmblem({ tier: v.tier, size: 84, champion: shownChampion, labelled: false, frame: activeFrame() }),
      h('div', { class: 'ach-hero-text' },
        h('h2', { class: 'ach-hero-name' }, name),
        h('p', { class: 'ach-hero-rating num' }, t('rewards.rating', { n: fmt(v.rating, 0) })))),
    h('div', { class: 'ach-hero-bar' },
      h('p', { class: 'ach-hero-line num' },
        nextName === null
          ? t('rewards.masterReached')
          : t('rewards.toNext', { rating: fmt(v.rating, 0), next: fmt(info.next ?? 0, 0), name: nextName })),
      progressBar(prog.fraction * 100, { label: t('rewards.progressAria'), decorative: info.next === null })),
    v.peak > v.tier ? h('p', { class: 'ach-peak' }, t('rewards.peak', { name: tierName(v.peak) })) : null,
  ], { hero: true, label: t('rewards.leagueLabel'), class: 'ach-hero-card' });
}

function ladder(v: View): HTMLElement {
  const rows = [...LEAGUES].reverse().map((l) => {
    const first = tierOf(l.id, 1);
    const current = tierInfo(v.tier).league === l.id;
    const steps = l.mins.length === 1
      ? t('rewards.ladderFrom', { n: fmt(l.mins[0] ?? 0, 0) })
      : l.mins.map((m, i) => `${['I', 'II', 'III'][i]} ${fmt(m, 0)}`).join(' · ');
    return row({
      leading: leagueEmblem({ tier: first + (l.mins.length === 1 ? 0 : (current ? tierInfo(v.tier).step ?? 1 : 1) - 1), size: 30, labelled: false }),
      label: leagueLabel(l.id), sub: `${steps} ${t('rewards.lp')}`, numeric: false,
      value: current ? t('rewards.you') : undefined, valueTone: current ? 'accent' : undefined,
      class: current ? 'ladder-row is-current' : 'ladder-row',
      attrs: current ? { 'aria-current': 'true' } : {},
    });
  });
  return group({ title: t('rewards.ladder'), meta: `${TIER_MINS.length} ${t('rewards.steps')}` }, list(rows));
}

function leagueView(v: View, champion: ChampionInfo | null): HTMLElement {
  const info = h('div', { class: 'ach-info' },
    h('p', null, t('rewards.leagueExplain')),
    championAvailable() ? h('p', null, t('rewards.championLine', { n: championCount() })) : null); // v9 K: ohne Liga-SQL ausgeblendet
  const left = [heroCard(v, champion), info];
  if (isTablet()) return h('div', { class: 'ach-view' }, columns(left, [ladder(v)]));
  return h('div', { class: 'ach-view' }, ...left, ladder(v));
}

/* ---------- Orden ---------- */

function badgeInput(v: View): BadgeInput {
  const hist = v.history;
  return {
    attempts: hist.attempts, sessions: hist.sessions, dailyResults: hist.dailyResults, streakBest: hist.streakBest,
    chainBest: hist.chainBest, parallelBest: hist.parallelBest, leaguePeak: v.peak, cardCount: cardCountOf(v.cards),
    placement: hist.placement,
  };
}

function badgesView(v: View): HTMLElement {
  const input = badgeInput(v);
  const earned = BADGES.filter((b) => (v.badges[b.id] ?? 0) > 0).length;
  const tiles = BADGES.map((b) => {
    const tier = v.badges[b.id] ?? 0;
    const max = badgeMaxTier(b.id);
    const tile = h('button', {
      type: 'button', class: `badge-tile press${tier === 0 ? ' is-locked' : ''}`,
      onclick: () => openBadgeSheet(b.id, input, tier),
    },
    badgeMedal(b.id, tier, 56),
    h('span', { class: 'badge-tile-name' }, badgeName(b.id)),
    tierPips(tier, max),
    tier === 0 ? h('span', { class: 'sr-only' }, t('rewards.locked')) : null);
    return tile;
  });
  return h('div', { class: 'ach-view' },
    h('p', { class: 'ach-count num' }, t('rewards.badgeCount', { n: earned, total: BADGES.length })),
    h('div', { class: 'badge-grid' }, tiles));
}

/* ---------- Karten ---------- */

function cardsView(v: View): HTMLElement {
  const have = cardCountOf(v.cards);
  const total = CARD_IDS.length;
  const groups = CATEGORIES.filter((c) => !c.hidden).map((c) => {
    const ids = CARD_IDS.filter((id) => SUBTYPES[id]?.category === c.id);
    if (!ids.length) return null;
    const got = ids.filter((id) => Object.hasOwn(v.cards, id)).length;
    const tiles = ids.map((id) => {
      const unlocked = Object.hasOwn(v.cards, id);
      const rarity = cardRarity(id);
      return h('button', {
        type: 'button', class: `card-tile is-${rarity}${unlocked ? '' : ' is-locked'} press`,
        onclick: () => openCardSheet(id),
      },
      h('span', { class: 'card-tile-mark', 'aria-hidden': 'true' }, unlocked ? '★' : '?'),
      h('span', { class: 'card-tile-name' }, SUBTYPES[id]?.name ?? id),
      h('span', { class: 'sr-only' }, `${rarityLabel(rarity)}, ${unlocked ? t('rewards.earned') : t('rewards.locked')}`));
    });
    return group({ title: c.name, meta: `${got} / ${ids.length}` }, h('div', { class: 'card-grid' }, tiles));
  });
  return h('div', { class: 'ach-view' },
    card([
      h('p', { class: 'ach-count num' }, t('rewards.cardCount', { n: have, total })),
      progressBar(total > 0 ? (have / total) * 100 : 0, { label: t('rewards.cardCountAria'), decorative: true }),
      h('p', { class: 'ach-info-line' }, t('rewards.cardsHow')),
    ]),
    ...groups);
}

/* ---------- Seite ---------- */

/** Titel und Untertitel der Unterseiten. */
const SUB_TITLE: Record<AchievementTab, { title: string; sub: string }> = {
  liga: { title: 'rewards.leagueLabel', sub: 'rewards.subLeague' },
  orden: { title: 'rewards.tabBadges', sub: 'rewards.subBadges' },
  karten: { title: 'rewards.secCards', sub: 'rewards.subCards' },
  shop: { title: 'shop.title', sub: 'rewards.sub' },
};

/** v11 E: `#/erfolge` (tabIn = null) ist die Übersicht; `#/erfolge/liga|orden|karten|shop` die Unterseiten mit „‹ Erfolge“. */
export function renderAchievements(tabIn: string | null = null): void {
  const tab = ACHIEVEMENT_TABS.find((x) => x === tabIn) ?? null;
  if (tab === null) {
    const panel = h('div', { class: 'ach-panel' }, overviewView(championProvider()));
    appendChildren(app, [largeTitle(t('rewards.title'), t('rewards.sub')), panel]);
    setPrimaryAction(null);
    addCleanup(onChampionChange(() => panel.replaceChildren(overviewView(championProvider()))));
    void syncLeague();
    return;
  }
  const v = rewardView();
  const build = (): HTMLElement =>
    tab === 'orden' ? badgesView(v) : tab === 'karten' ? cardsView(v) : tab === 'shop' ? shopView(v.tier) : leagueView(v, championProvider());
  const panel = h('div', { class: 'ach-panel' }, build());
  const head = SUB_TITLE[tab];
  appendChildren(app, [
    backLink({ label: t('rewards.back'), href: '#/erfolge' }),
    largeTitle(t(head.title as 'rewards.title'), tab === 'shop' ? undefined : t(head.sub as 'rewards.sub')),
    panel,
  ]);
  setPrimaryAction(null);
  if (tab === 'liga') addCleanup(onChampionChange(() => panel.replaceChildren(build()))); // v9 K
  void syncLeague();
}
