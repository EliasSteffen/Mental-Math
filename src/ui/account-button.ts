// Profil-Knopf (v11 N): rundes Liga-Emblem oben rechts auf den Tab-Startseiten → #/profil. Der Router setzt ihn nach dem
// Zeichnen in das erste .large-title ein (die Views wissen nichts davon). Auf dem iPad (ab 720 px) steht stattdessen der
// Eintrag „Profil“ unten in der Seitenleiste (index.html, a.tabbar-profile); das CSS blendet je eines von beiden aus.
import { tierInfo } from '../core/league.ts';
import { getProfile, getSettings } from '../data/storage.ts';
import * as acct from '../features/account.ts';
import { championInfo } from '../features/league-sync.ts';
import { activeFrame } from '../features/shop.ts';
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { leagueEmblem } from './league-badge.ts';

function emblem(size: number): SVGElement {
  const tier = getSettings().league?.tier ?? 0;
  const champion = tierInfo(tier).step === null ? championInfo() : null;
  return leagueEmblem({ tier, size, champion, labelled: false, frame: activeFrame() });
}

/** Runder Knopf (44 × 44 Trefferfläche) mit dem Liga-Emblem. */
export function accountButton(): HTMLAnchorElement {
  return h('a', { class: 'account-button press', href: '#/profil', 'aria-label': t('common.profileButton') }, emblem(30));
}

/** Knopf in den ersten Large Title von `root` setzen (idempotent); false, wenn es keinen gibt. */
export function mountAccountButton(root: ParentNode): boolean {
  const title = root.querySelector<HTMLElement>('.large-title');
  if (!title) return false;
  if (title.querySelector(':scope > .account-button')) return true;
  title.classList.add('has-action');
  title.append(accountButton());
  return true;
}

/** Eintrag „Profil“ der Seitenleiste: Emblem, Beschriftung und mit Konto der Anzeigename. */
export function paintSidebarProfile(): void {
  const link = document.querySelector<HTMLElement>('a.tabbar-profile');
  if (!link) return;
  const st = acct.getAccountState();
  const name = st.status === 'signed-in' ? getProfile().displayName || st.user.username : '';
  link.replaceChildren(
    h('span', { class: 'tab-pill' }, emblem(22)),
    h('span', { class: 'tab-label' }, t('common.profileEntry'), name ? h('span', { class: 'tab-sub' }, name) : null),
  );
  link.setAttribute('aria-label', name ? `${t('common.profileEntry')}: ${name}` : t('common.profileButton'));
}
