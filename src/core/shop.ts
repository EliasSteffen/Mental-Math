// XP-Shop (v10 P, DOM-frei): Artikel, Preise und Kaufregeln. Ausgeben/Speichern liegt in src/features/shop.ts.
import { MAX_FREEZES } from './habit.ts';
import type { Theme, ThemeSetting } from '../types.ts';

export type ShopKind = 'freeze' | 'theme' | 'frame';

export interface ShopItem {
  id: string;
  kind: ShopKind;
  /** XP; null = nur aus Truhen */
  price: number | null;
  nameKey: string;
  descKey: string;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'freeze', kind: 'freeze', price: 1500, nameKey: 'shop.item_freeze', descKey: 'shop.desc_freeze' },
  { id: 'theme:sunset', kind: 'theme', price: 4000, nameKey: 'shop.item_theme_sunset', descKey: 'shop.desc_theme_sunset' },
  { id: 'theme:sand', kind: 'theme', price: 6000, nameKey: 'shop.item_theme_sand', descKey: 'shop.desc_theme_sand' },
  { id: 'theme:ocean', kind: 'theme', price: 8000, nameKey: 'shop.item_theme_ocean', descKey: 'shop.desc_theme_ocean' },
  { id: 'frame:silver', kind: 'frame', price: 3000, nameKey: 'shop.item_frame_silver', descKey: 'shop.desc_frame_silver' },
  { id: 'frame:gold', kind: 'frame', price: 6000, nameKey: 'shop.item_frame_gold', descKey: 'shop.desc_frame_gold' },
  { id: 'frame:diamond', kind: 'frame', price: 12000, nameKey: 'shop.item_frame_diamond', descKey: 'shop.desc_frame_diamond' },
  { id: 'frame:chest', kind: 'frame', price: null, nameKey: 'shop.item_frame_chest', descKey: 'shop.desc_frame_chest' },
];

export type BuyReason = 'owned' | 'balance' | 'max' | 'notForSale';

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((x) => x.id === id);
}

/** Kaufbar? Reihenfolge der Gründe: schon im Besitz, nicht verkäuflich, Freeze-Vorrat voll, Guthaben zu klein. */
export function canBuy(
  item: ShopItem,
  o: { balance: number; owned: boolean; freezes: number },
): { ok: boolean; reason?: BuyReason } {
  if (item.kind !== 'freeze' && o.owned) return { ok: false, reason: 'owned' };
  if (item.price === null) return { ok: false, reason: 'notForSale' };
  if (item.kind === 'freeze' && o.freezes >= MAX_FREEZES) return { ok: false, reason: 'max' };
  if (o.balance < item.price) return { ok: false, reason: 'balance' };
  return { ok: true };
}

/** Fehlende XP bis zum Preis (0, wenn genug oder nicht verkäuflich). */
export function missingXp(item: ShopItem, balance: number): number {
  return item.price === null ? 0 : Math.max(0, item.price - Math.max(0, Math.floor(balance)));
}

/* ---------- Themes und Rahmen ---------- */

/** Themes, die gekauft werden müssen. */
export const PREMIUM_THEMES: readonly Theme[] = ['sunset', 'sand', 'ocean'];

export const themeItemId = (theme: ThemeSetting): string => `theme:${theme}`;
export const isPremiumTheme = (theme: ThemeSetting): boolean => (PREMIUM_THEMES as readonly string[]).includes(theme);

export function ownsItem(purchases: Readonly<Record<string, number>> | null | undefined, id: string): boolean {
  return Boolean(purchases) && Object.hasOwn(purchases as object, id);
}

/** Theme, das wirklich gezeigt wird: ein nicht besessenes Premium-Theme (z. B. durch Import) fällt auf `system` zurück. */
export function effectiveTheme(setting: ThemeSetting, purchases: Readonly<Record<string, number>> | null | undefined): ThemeSetting {
  return isPremiumTheme(setting) && !ownsItem(purchases, themeItemId(setting)) ? 'system' : setting;
}

/** Gewählter Rahmen, der wirklich gezeigt wird ('' bei unbekannt oder nicht besessen). */
export function effectiveFrame(frame: string, purchases: Readonly<Record<string, number>> | null | undefined): string {
  const item = shopItem(frame);
  return item?.kind === 'frame' && ownsItem(purchases, frame) ? frame : '';
}

/** Rahmenname im CSS: 'frame:gold' → 'gold'. */
export const frameClass = (frame: string): string => frame.replace(/^frame:/, '');
