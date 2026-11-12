// XP-Shop (v10 P): Tab „Shop“ in #/erfolge. Guthaben, Freeze, Themes und Emblem-Rahmen; Kauf mit Bestätigung.
import { MAX_FREEZES } from '../core/habit.ts';
import { fmt } from '../core/numbers.ts';
import { missingXp, SHOP_ITEMS, type ShopItem } from '../core/shop.ts';
import { buyItem, itemStatus, shopState, useFrame, type ShopState } from '../features/shop.ts';
import { xpView } from '../features/xp.ts';
import { setSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { h } from '../ui/dom.ts';
import { button, card, group, icon } from '../ui/kit.ts';
import { leagueEmblem } from '../ui/league-badge.ts';
import { confirmDialog } from '../ui/modal.ts';
import { applyTheme, getThemeSetting } from '../ui/theme.ts';
import { toast } from '../ui/toast.ts';
import type { ThemeSetting } from '../types.ts';

type NameKey = `shop.${string}`;
const itemName = (it: ShopItem): string => t(it.nameKey as NameKey);
const slug = (id: string): string => id.replace(/^[a-z]+:/, '');

/** „Noch 660 XP“ bzw. Preis; Knopf je nach Zustand. */
function actionFor(it: ShopItem, st: ShopState, redraw: () => void, activeTheme: ThemeSetting): HTMLElement {
  const status = itemStatus(it, st);
  if (it.kind === 'theme' && status.reason === 'owned') {
    const theme = slug(it.id) as ThemeSetting;
    return activeTheme === theme
      ? h('span', { class: 'shop-state is-active' }, icon('check', 16), t('shop.active'))
      : button({
        label: t('shop.use'), kind: 'soft',
        onClick: () => { setSettings({ theme }); applyTheme(theme); redraw(); },
      });
  }
  if (it.kind === 'frame' && status.reason === 'owned') {
    return st.frame === it.id
      ? h('span', { class: 'shop-state is-active' }, icon('check', 16), t('shop.active'))
      : button({ label: t('shop.use'), kind: 'soft', onClick: () => { useFrame(it.id); redraw(); } });
  }
  if (status.reason === 'notForSale') return h('span', { class: 'shop-state' }, icon('lock', 16), t('shop.chestOnly'));
  if (status.reason === 'max') return h('span', { class: 'shop-state' }, t('shop.stockFull', { n: st.freezes, max: MAX_FREEZES }));
  if (status.reason === 'balance') {
    return h('span', { class: 'shop-state is-short num' }, t('shop.missing', { n: fmt(missingXp(it, st.balance), 0) }));
  }
  return button({
    label: t('shop.buy'), kind: 'soft',
    onClick: () => { void purchase(it, redraw); },
  });
}

async function purchase(it: ShopItem, redraw: () => void): Promise<void> {
  if (it.price === null) return;
  const ok = await confirmDialog(t('shop.buyConfirm', { price: fmt(it.price, 0) }), {
    title: t('shop.buyTitle', { name: itemName(it) }), confirmLabel: t('shop.buy'),
  });
  if (!ok) return;
  if (!buyItem(it.id)) {
    toast(t('shop.buyFailed'), { kind: 'error' });
    redraw();
    return;
  }
  toast(it.kind === 'freeze'
    ? t('shop.boughtFreeze', { n: shopState().freezes, max: MAX_FREEZES })
    : t('shop.bought', { name: itemName(it) }), { kind: 'success' });
  redraw();
}

function itemCard(it: ShopItem, st: ShopState, tier: number, redraw: () => void, activeTheme: ThemeSetting): HTMLElement {
  const name = itemName(it);
  const owned = it.kind !== 'freeze' && itemStatus(it, st).reason === 'owned';
  let preview: HTMLElement;
  if (it.kind === 'theme') {
    preview = h('span', { class: 'shop-swatch', 'data-preview': slug(it.id), role: 'img', 'aria-label': t('shop.previewAria', { name }) },
      h('span', { class: 'shop-swatch-card' }), h('span', { class: 'shop-swatch-dot' }));
  } else if (it.kind === 'frame') {
    preview = h('span', { class: 'shop-preview' }, leagueEmblem({ tier, size: 46, labelled: false, frame: it.id }));
  } else {
    preview = h('span', { class: 'shop-preview is-icon' }, icon('snowflake', 30));
  }
  const price = it.price === null ? null : h('span', { class: 'shop-price num' }, t('shop.price', { n: fmt(it.price, 0) }));
  return h('div', { class: `shop-item${owned ? ' is-owned' : ''}`, 'data-item': it.id },
    preview,
    h('div', { class: 'shop-item-text' },
      h('h3', { class: 'shop-item-name' }, name),
      h('p', { class: 'shop-item-desc' }, t(it.descKey as NameKey, { max: MAX_FREEZES })),
      it.kind === 'freeze' ? h('p', { class: 'shop-item-desc num' }, t('shop.stock', { n: st.freezes, max: MAX_FREEZES })) : null),
    h('div', { class: 'shop-item-foot' }, owned ? null : price, actionFor(it, st, redraw, activeTheme)));
}

function noFrameCard(st: ShopState, tier: number, redraw: () => void): HTMLElement {
  return h('div', { class: 'shop-item', 'data-item': 'frame:none' },
    h('span', { class: 'shop-preview' }, leagueEmblem({ tier, size: 46, labelled: false })),
    h('div', { class: 'shop-item-text' },
      h('h3', { class: 'shop-item-name' }, t('shop.frameNone')),
      h('p', { class: 'shop-item-desc' }, t('shop.frameNoneDesc'))),
    h('div', { class: 'shop-item-foot' },
      st.frame === ''
        ? h('span', { class: 'shop-state is-active' }, icon('check', 16), t('shop.active'))
        : button({ label: t('shop.use'), kind: 'soft', onClick: () => { useFrame(''); redraw(); } })));
}

/** Inhalt des Shop-Tabs; zeichnet sich nach Kauf und Auswahl selbst neu. `tier` = Liga-Stufe für die Rahmen-Vorschau. */
export function shopView(tier: number): HTMLElement {
  const root = h('div', { class: 'ach-view shop-view' });
  const redraw = (): void => {
    const st = shopState();
    const x = xpView();
    const activeTheme = getThemeSetting();
    const items = (kind: ShopItem['kind']): ShopItem[] => SHOP_ITEMS.filter((i) => i.kind === kind);
    root.replaceChildren(
      card([
        h('p', { class: 'shop-balance num', 'aria-live': 'polite' }, t('shop.balance', { n: fmt(st.balance, 0) })),
        h('p', { class: 'shop-lifetime num' }, t('shop.lifetime', { xp: fmt(x.lifetime, 0), level: x.level })),
        h('p', { class: 'shop-explain' }, t('shop.explain')),
      ], { hero: true, label: t('shop.title'), class: 'shop-hero' }),
      group(t('shop.groupFreeze'), h('div', { class: 'shop-grid' }, ...items('freeze').map((i) => itemCard(i, st, tier, redraw, activeTheme)))),
      group(t('shop.groupTheme'), h('div', { class: 'shop-grid' }, ...items('theme').map((i) => itemCard(i, st, tier, redraw, activeTheme)))),
      group(t('shop.groupFrame'), h('div', { class: 'shop-grid' },
        noFrameCard(st, tier, redraw), ...items('frame').map((i) => itemCard(i, st, tier, redraw, activeTheme)))),
    );
  };
  redraw();
  return root;
}
