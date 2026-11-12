// Spielerkarte oben im Profil (v9 H): Liga-Emblem, Level, Serie, Orden, Karten und Bilanz. Ruhig, eine antippbare Karte → #/erfolge.
import { tierInfo } from '../core/league.ts';
import { fmt } from '../core/numbers.ts';
import { getActivity, getDailyResults, getProfile, getSessions, getSettings, getAttempts } from '../data/storage.ts';
import { rewardView } from '../features/rewards.ts';
import * as acct from '../features/account.ts';
import { t } from '../i18n/index.ts';
import { progressBar } from '../ui/charts.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/kit.ts';
import { leagueEmblem, tierName } from '../ui/league-badge.ts';
import { championInfo } from './achievements.ts';
import { onChampionChange } from '../features/league-sync.ts';
import { addCleanup } from '../router.ts';
import { profileCardData } from './profile-card-data.ts';
import { activeFrame } from '../features/shop.ts'; // v10 P
import { xpView } from '../features/xp.ts'; // v10 P

function stat(label: string, value: string, sub?: string): HTMLElement {
  return h('div', { class: 'pcard-stat' },
    h('dt', { class: 'pcard-stat-label' }, label),
    h('dd', { class: 'pcard-stat-value num' }, value, sub ? h('span', { class: 'pcard-stat-sub' }, sub) : null));
}

/** Anzeigename nur mit Konto: gespeicherter Anzeigename, sonst der Benutzername. */
function accountName(): string | null {
  const st = acct.getAccountState();
  if (st.status !== 'signed-in') return null;
  return getProfile().displayName || st.user.username;
}

/** v11 E: Link-Ziel der Karte (Standard #/erfolge; in der Erfolge-Übersicht #/erfolge/liga). */
export interface PlayerCardOptions { href?: string }

/** Spielerkarte; tauscht sich selbst aus, wenn der Champion-Status (Paket K) später vom Server kommt – ohne rerender der Profilseite. */
export function playerCard(o: PlayerCardOptions = {}): HTMLElement {
  let el = buildPlayerCard(o);
  addCleanup(onChampionChange(() => {
    const next = buildPlayerCard(o);
    el.replaceWith(next);
    el = next;
  }));
  return el;
}

function buildPlayerCard(o: PlayerCardOptions): HTMLElement {
  const view = rewardView();
  const d = profileCardData({
    attempts: getAttempts(), sessions: getSessions(), activity: getActivity(), dailyResults: getDailyResults(),
    goalRounds: getSettings().dailyGoalRounds, boughtFreezes: getSettings().freezesBought, repairedDays: getSettings().streakRepairs, tier: view.tier, badges: view.badges, cards: view.cards, xp: xpView(),
  });
  // Champion: nur bei Meister; Platz kommt aus Paket K (setChampionProvider in achievements.ts)
  const champion = tierInfo(d.tier).step === null ? championInfo() : null;
  const league = champion ? t('rewards.championRank', { rank: champion.rank }) : tierName(d.tier);
  const name = accountName();
  const bar = progressBar(d.xpFraction * 100, { label: t('settings.cardXpAria') });
  const best = d.bestDaily ? `${d.bestDaily.correct}/${d.bestDaily.n}` : '–';
  // v10 P: Karte → #/erfolge (gestreckter Link), Guthaben-Zeile → Shop (eigener Link darüber, kein verschachteltes <a>)
  return h('div', { class: 'card pcard press' },
    h('a', { class: 'pcard-top pcard-main', href: o.href ?? '#/erfolge', 'aria-label': `${t('settings.cardTitle')}: ${league}` },
      leagueEmblem({ tier: d.tier, size: 52, champion, labelled: false, frame: activeFrame() }),
      h('span', { class: 'pcard-id' },
        name ? h('span', { class: 'pcard-name' }, name) : null,
        h('span', { class: 'pcard-league' }, league),
        h('span', { class: 'pcard-level num' }, t('settings.cardLevel', { n: d.level }))),
      h('span', { class: 'pcard-chevron', 'aria-hidden': 'true' }, icon('chevron-right', 18))),
    h('span', { class: 'pcard-xp' },
      bar,
      h('span', { class: 'pcard-xp-line num' }, t('settings.cardXp', { into: fmt(d.xpInto, 0), needed: fmt(d.xpNeeded, 0) }))),
    d.xpBalance === null ? null : h('a', { class: 'pcard-balance num', href: '#/erfolge/shop' },
      t('shop.playerBalance', { n: fmt(d.xpBalance, 0) }), h('span', { class: 'pcard-balance-go', 'aria-hidden': 'true' }, icon('chevron-right', 16))),
    h('dl', { class: 'pcard-stats' },
      stat(t('settings.cardStreak'), `${d.streak}`, ` / ${d.streakBest}`),
      stat(t('settings.cardFreezes'), String(d.freezes)),
      stat(t('settings.cardBadges'), `${d.badges.earned}`, ` / ${d.badges.total}`),
      stat(t('settings.cardCards'), `${d.cards.earned}`, ` / ${d.cards.total}`),
      stat(t('settings.cardSolved'), fmt(d.solved, 0)),
      stat(t('settings.cardRounds'), fmt(d.rounds, 0)),
      stat(t('settings.cardAccuracy'), d.accuracy === null ? '–' : `${d.accuracy} %`),
      stat(t('settings.cardBestDaily'), best)));
}
