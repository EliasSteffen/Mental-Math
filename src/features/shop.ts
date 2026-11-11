// XP-Shop (v10 P) mit Speicher: Kaufen, Rahmen wählen, Stand abfragen. Regeln in src/core/shop.ts.
import { canBuy, effectiveFrame, ownsItem, shopItem, type BuyReason, type ShopItem } from '../core/shop.ts';
import { getSettings, setSettings } from '../data/storage.ts';
import { currentHabit } from './habit.ts';
import { spendXp, xpView } from './xp.ts';

export interface ShopState {
  balance: number;
  freezes: number;
  purchases: Readonly<Record<string, number>>;
  /** wirksamer Rahmen ('' = keiner) */
  frame: string;
}

export function shopState(now: number = Date.now()): ShopState {
  const s = getSettings();
  return { balance: xpView().balance, freezes: currentHabit(now).freezes, purchases: s.purchases, frame: effectiveFrame(s.frame, s.purchases) };
}

export function itemStatus(item: ShopItem, st: ShopState): { ok: boolean; reason?: BuyReason } {
  return canBuy(item, { balance: st.balance, owned: ownsItem(st.purchases, item.id), freezes: st.freezes });
}

/** Kauft einen Artikel: zieht genau den Preis ab und speichert Besitz bzw. Freeze. false (nichts geändert), wenn nicht kaufbar. */
export function buyItem(id: string, now: number = Date.now()): boolean {
  const item = shopItem(id);
  if (!item || item.price === null) return false;
  if (!itemStatus(item, shopState(now)).ok) return false;
  if (!spendXp(item.price)) return false;
  const s = getSettings();
  if (item.kind === 'freeze') setSettings({ freezesBought: [...s.freezesBought, now] });
  else setSettings({ purchases: { ...s.purchases, [item.id]: now } });
  return true;
}

/** Rahmen benutzen ('' = keinen). Nur besessene Rahmen. */
export function useFrame(id: string): boolean {
  if (id !== '' && effectiveFrame(id, getSettings().purchases) !== id) return false;
  setSettings({ frame: id });
  return true;
}

/** Gewählter und besessener Rahmen für Emblem-Anzeigen ('' = keiner). */
export function activeFrame(): string {
  const s = getSettings();
  return effectiveFrame(s.frame, s.purchases);
}
