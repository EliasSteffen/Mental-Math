// App-Shell (Ruhiger Fokus): Tab-Leiste mit 4 Tabs, schwebender Primärbutton (CTA) und Fokus-Modus.
// Der Router ruft vor jedem render*() setShell(...) und setPrimaryAction(null); die View setzt ihre CTA danach selbst.
import { app } from './dom.ts';
import { button, type IconName } from './kit.ts';
import { onLangChange, t } from '../i18n/index.ts';

export type TabId = 'today' | 'learn' | 'progress' | 'profile';

export interface PrimaryAction {
  label: string;
  /** Zusatz nach „·“, z. B. „ca. 4 min“ */
  meta?: string;
  href?: string;
  onClick?: () => void;
  icon?: IconName;
}

/** Kanonische Adressen der Tabs (Aliase #/analyse und #/settings löst der Router auf). */
export const TAB_HREF: Readonly<Record<TabId, string>> = {
  today: '#/', learn: '#/lernen', progress: '#/fortschritt', profile: '#/profil',
};

const TAB_LABEL: Readonly<Record<TabId, 'common.tabToday' | 'common.tabLearn' | 'common.tabProgress' | 'common.tabProfile'>> = {
  today: 'common.tabToday', learn: 'common.tabLearn', progress: 'common.tabProgress', profile: 'common.tabProfile',
};

const isTabId = (x: string | undefined): x is TabId => x !== undefined && Object.hasOwn(TAB_LABEL, x);

let ready = false;
let currentTab: TabId | null = null;

function tabbar(): HTMLElement | null { return document.querySelector<HTMLElement>('nav.tabbar'); }
function tabLinks(): HTMLAnchorElement[] { return [...(tabbar()?.querySelectorAll<HTMLAnchorElement>('a[data-tab]') ?? [])]; }

/** Beschriftungen der Tab-Leiste in der aktuellen Sprache. */
function paintLabels(): void {
  tabbar()?.setAttribute('aria-label', t('common.mainNav'));
  for (const a of tabLinks()) {
    const id = a.dataset['tab'];
    const label = a.querySelector('.tab-label');
    if (isTabId(id) && label) label.textContent = t(TAB_LABEL[id]);
  }
}

/** Einmalig: Labels setzen und bei jedem Sprachwechsel nachziehen (idempotent). */
export function initShell(): void {
  if (ready) return;
  ready = true;
  paintLabels();
  onLangChange(() => paintLabels());
}

/** Aktiver Tab (null = Fokus-Modus). */
export function getShellTab(): TabId | null { return currentTab; }

/**
 * Markiert den aktiven Tab (aria-current); null = Fokus-Modus: Tab-Leiste und CTA ausgeblendet, body.is-focus.
 * Setzt außerdem die Layout-Klasse von #app (.screen bzw. .focus).
 */
export function setShell(tab: TabId | null): void {
  initShell();
  currentTab = tab;
  const focus = tab === null;
  document.body.classList.toggle('is-focus', focus);
  app.classList.toggle('screen', !focus);
  app.classList.toggle('focus', focus);
  for (const a of tabLinks()) {
    if (a.dataset['tab'] === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/** Setzt den schwebenden Primärbutton des aktuellen Tabs (ab 768 px am Inhaltsende); null entfernt ihn. */
export function setPrimaryAction(action: PrimaryAction | null): void {
  const slot = document.getElementById('cta');
  if (!slot) return;
  slot.replaceChildren();
  slot.hidden = action === null;
  document.body.classList.toggle('has-cta', action !== null);
  if (!action) return;
  slot.append(button({
    label: action.label, meta: action.meta, href: action.href, onClick: action.onClick, icon: action.icon,
    kind: 'primary', full: true, cta: true,
  }));
}
