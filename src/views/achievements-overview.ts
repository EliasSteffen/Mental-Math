// Erfolge-Übersicht (v11 E, #/erfolge): Spielerkarte · Quests heute · Liga · Orden · Trick-Karten · Shop · Statistik.
// Jeder Abschnitt ist antippbar und führt zur Unterseite; alles aus vorhandenen Daten, nichts neu berechnet.
import type { ChampionInfo } from '../core/league.ts';
import { BADGES, badgeMaxTier } from '../core/badges.ts';
import { CARD_IDS } from '../core/cards.ts';
import { cheapestOpenItem, newestCards, recentBadges } from '../core/erfolge.ts';
import { tierInfo, tierProgress } from '../core/league.ts';
import { fmt } from '../core/numbers.ts';
import { cardCountOf } from '../core/rewards.ts';
import { CHEST_STARS } from '../core/quests.ts';
import { getSettings } from '../data/storage.ts';
import { rewardView } from '../features/rewards.ts';
import { questsView, type QuestItem } from '../features/quests.ts';
import { activeFrame, shopState } from '../features/shop.ts';
import { xpView } from '../features/xp.ts';
import { t } from '../i18n/index.ts';
import { progressBar } from '../ui/charts.ts';
import { badgeMedal, cardMini } from '../ui/collectibles.ts';
import { h, type Child } from '../ui/dom.ts';
import { columns, group, icon, list, row } from '../ui/kit.ts';
import { leagueEmblem, tierName } from '../ui/league-badge.ts';
import type { SubtypeId } from '../types.ts';
import { SUBTYPES } from '../core/catalog.ts';
import { playerCard } from './profile-card.ts';

type View = ReturnType<typeof rewardView>;

/** Abschnitt: Titel + eine antippbare Karte (ganzer Block ist der Link) mit Pfeil. */
function section(title: string, href: string, body: Child[], cls = ''): HTMLElement {
  return group(title,
    h('a', { class: `card ach-sec press${cls ? ` ${cls}` : ''}`, href },
      h('div', { class: 'ach-sec-body' }, ...body),
      h('span', { class: 'ach-sec-chevron', 'aria-hidden': 'true' }, icon('chevron-right', 18))));
}

/* ---------- Quests heute ---------- */

function questLine(q: QuestItem): HTMLElement {
  const finished = q.credited || q.complete;
  return h('li', { class: `quest ach-quest${finished ? ' is-done' : ''}` },
    h('span', { class: 'quest-mark', 'aria-hidden': 'true' },
      finished ? icon('check', 18) : h('span', { class: `quest-level is-${q.level}` })),
    h('p', { class: 'quest-title' }, q.title),
    h('span', { class: 'ach-quest-state num' }, finished ? t('quests.done') : t('quests.progress', { value: q.value, target: q.target })));
}

function questsSection(): HTMLElement {
  const v = questsView();
  const chestAt = CHEST_STARS[CHEST_STARS.length - 1] ?? 15;
  return section(t('rewards.secQuests'), '#/quests', [
    h('p', { class: 'ach-sec-meta num' }, t('quests.todayMeta', { done: v.doneToday })),
    h('ul', { class: 'quest-list ach-quests' }, ...v.quests.map(questLine)),
    h('p', { class: 'ach-quest-week num' },
      icon('star', 14), t('quests.weekMeta', { n: Math.min(v.stars, chestAt) }),
      v.ready > 0 ? h('span', { class: 'ach-chip' }, icon('gift', 14), t('rewards.chestReady')) : null),
  ]);
}

/* ---------- Liga ---------- */

function leagueSection(v: View, champion: ChampionInfo | null): HTMLElement {
  const info = tierInfo(v.tier);
  const shown = info.step === null ? champion : null;
  const name = shown ? t('rewards.championRank', { rank: shown.rank }) : tierName(v.tier);
  const prog = tierProgress(v.tier, v.rating);
  const nextName = info.next === null ? null : tierName(v.tier + 1);
  return section(t('rewards.secLeague'), '#/erfolge/liga', [
    h('div', { class: 'ach-league' },
      leagueEmblem({ tier: v.tier, size: 56, champion: shown, labelled: false, frame: activeFrame() }),
      h('div', { class: 'ach-league-text' },
        h('p', { class: 'ach-sec-main' }, name),
        h('p', { class: 'ach-sec-meta num' }, t('rewards.rating', { n: fmt(v.rating, 0) })))),
    h('p', { class: 'ach-sec-meta num' },
      nextName === null ? t('rewards.masterReached') : t('rewards.toNext', { rating: fmt(v.rating, 0), next: fmt(info.next ?? 0, 0), name: nextName })),
    progressBar(prog.fraction * 100, { label: t('rewards.progressAria'), decorative: info.next === null }),
  ]);
}

/* ---------- Orden ---------- */

function badgesSection(v: View): HTMLElement {
  const earned = BADGES.filter((b) => (v.badges[b.id] ?? 0) > 0).length;
  const recent = recentBadges(v.badges, v.store.badges, 5);
  return section(t('rewards.secBadges'), '#/erfolge/orden', [
    h('p', { class: 'ach-sec-main num' }, t('rewards.badgeCount', { n: earned, total: BADGES.length })),
    recent.length
      ? h('div', { class: 'ach-medals' }, ...recent.map((id) => badgeMedal(id, v.badges[id] ?? badgeMaxTier(id), 40)))
      : h('p', { class: 'ach-sec-meta' }, t('rewards.badgesEmpty')),
  ]);
}

/* ---------- Trick-Karten ---------- */

function cardsSection(v: View): HTMLElement {
  const have = cardCountOf(v.cards);
  const newest = newestCards(v.cards, 3);
  return section(t('rewards.secCards'), '#/erfolge/karten', [
    h('p', { class: 'ach-sec-main num' }, t('rewards.cardCount', { n: have, total: CARD_IDS.length })),
    newest.length
      ? h('ul', { class: 'ach-cards' }, ...newest.map((id) =>
        h('li', { class: 'ach-card-item' }, cardMini(id as SubtypeId), h('span', { class: 'ach-card-name' }, SUBTYPES[id as SubtypeId]?.name ?? id))))
      : h('p', { class: 'ach-sec-meta' }, t('rewards.cardsEmpty')),
  ]);
}

/* ---------- Shop ---------- */

function shopSection(): HTMLElement {
  const st = shopState();
  const next = cheapestOpenItem({ purchases: getSettings().purchases, freezes: st.freezes });
  const xp = xpView();
  return section(t('rewards.secShop'), '#/erfolge/shop', [
    h('p', { class: 'ach-sec-main num' }, t('shop.balance', { n: fmt(xp.balance, 0) })),
    h('p', { class: 'ach-sec-meta num' }, next && next.price !== null
      ? t('rewards.shopNext', { name: t(next.nameKey as `shop.${string}`), price: fmt(next.price, 0) })
      : t('rewards.shopAllOwned')),
  ]);
}

/* ---------- Statistik ---------- */

function statsSection(): HTMLElement {
  return group(null, list([row({
    icon: 'bars', label: t('rewards.secStats'), sub: t('rewards.statsRowSub'), href: '#/fortschritt', class: 'ach-stats-row',
  })]));
}

/** Übersicht; `champion` kommt von der Seite (Paket K), damit hier kein Kreisimport entsteht. */
export function overviewView(champion: ChampionInfo | null): HTMLElement {
  const v = rewardView();
  const left = [playerCard({ href: '#/erfolge/liga' }), questsSection()];
  const right = [leagueSection(v, champion), badgesSection(v), cardsSection(v), shopSection(), statsSection()];
  // Unter 1024 px steht alles in DOM-Reihenfolge untereinander (columns() = display:contents)
  return h('div', { class: 'ach-view ach-overview' }, columns(left, right, { wideOnly: true }));
}
