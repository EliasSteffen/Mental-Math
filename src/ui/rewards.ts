// Belohnungszeilen auf den Ergebnis-Bildschirmen (v9 J): ruhig, höchstens 3 Zeilen, der Rest als „+N weitere“.
import { splitRewardLines, type RewardEvents, type RewardLine } from '../core/rewards.ts';
import { SUBTYPES } from '../core/catalog.ts';
import { h } from './dom.ts';
import { icon, list, row } from './kit.ts';
import { leagueEmblem, tierName } from './league-badge.ts';
import { badgeMedal, badgeName, cardMini, openCardSheet, tierLabel } from './collectibles.ts';
import { badgeMaxTier } from '../core/badges.ts';
import { cardCountOf } from '../core/rewards.ts';
import { rewardView } from '../features/rewards.ts';
import { t } from '../i18n/index.ts';

function lineRow(line: RewardLine): HTMLElement {
  // v10: Zeile einer Erweiterung (Quests, Comeback, Reparatur, LP)
  if (line.kind === 'extra') {
    const x = line.line;
    return row({
      leading: h('span', { class: 'reward-icon', 'aria-hidden': 'true' }, icon(x.icon, 22)),
      label: x.label, sub: x.sub, href: x.href,
      class: x.tone === 'good' ? 'reward-row is-good' : 'reward-row is-quiet',
    });
  }
  if (line.kind === 'league') {
    const name = tierName(line.to);
    return row({
      leading: leagueEmblem({ tier: line.to, size: 26, labelled: false }),
      label: line.up ? t('rewards.promoted', { league: name }) : t('rewards.leagueNow', { league: name }),
      href: '#/erfolge', class: line.up ? 'reward-row is-good' : 'reward-row is-quiet',
    });
  }
  if (line.kind === 'badge') {
    return row({
      leading: badgeMedal(line.id, line.tier, 30),
      label: t('rewards.newBadge', { name: badgeName(line.id) }),
      sub: badgeMaxTier(line.id) > 1 ? tierLabel(line.tier) : undefined,
      href: '#/erfolge/orden', class: 'reward-row is-good',
    });
  }
  const id = line.id;
  return row({
    leading: cardMini(id), label: t('rewards.newCard'), sub: SUBTYPES[id]?.name ?? id,
    onClick: () => openCardSheet(id), chevron: true, class: 'reward-row is-good',
  });
}

/** Zeilen für die neuen Belohnungen einer Runde; null, wenn es nichts zu melden gibt. */
export function rewardBlock(events: RewardEvents): HTMLElement | null {
  const { shown, more } = splitRewardLines(events);
  if (!shown.length) return null;
  return h('section', { class: 'reward-block', 'aria-label': t('rewards.blockLabel') },
    list(shown.map(lineRow)),
    more > 0
      ? h('a', { class: 'reward-more press', href: '#/erfolge' }, t('rewards.more', { n: more }), icon('chevron-right', 16))
      : null);
}

/** Einstiegszeile „Erfolge“ (Fortschritt → Überblick): Emblem, Liga, Zahl der Orden und Karten. */
export function achievementsRow(): HTMLElement {
  const v = rewardView();
  const badges = Object.values(v.badges).filter((tier) => tier > 0).length;
  return row({
    leading: leagueEmblem({ tier: v.tier, size: 26, labelled: false }),
    label: t('rewards.rowTitle'), sub: t('rewards.rowSub', { badges, cards: cardCountOf(v.cards) }),
    value: tierName(v.tier), href: '#/erfolge', class: 'ach-entry',
  });
}
