// Erfolge-Übersicht (v11 E, DOM-frei): zuletzt verdiente Orden, neueste Karten, nächster Shop-Artikel.
import { BADGES, type BadgeId } from './badges.ts';
import { CARD_IDS } from './cards.ts';
import { canBuy, ownsItem, SHOP_ITEMS, type ShopItem } from './shop.ts';

/**
 * Verdiente Orden, die zuletzt erreichten zuerst (nach Zeitstempel der gespeicherten Stufe; ohne Zeitstempel zuletzt,
 * Gleichstand in Katalogreihenfolge). `tiers` = wirksame Stufen, `stored` = gespeicherter Stand mit Zeitstempeln.
 */
export function recentBadges(
  tiers: Readonly<Partial<Record<BadgeId, number>>>,
  stored: Readonly<Record<string, { ts: number }>> | null | undefined,
  limit = 5,
): BadgeId[] {
  const earned = BADGES.map((b, i) => ({ id: b.id, i, ts: stored?.[b.id]?.ts ?? 0 })).filter((b) => (tiers[b.id] ?? 0) > 0);
  earned.sort((a, b) => b.ts - a.ts || a.i - b.i);
  return earned.slice(0, Math.max(0, limit)).map((b) => b.id);
}

/** Freigeschaltete Karten, die neuesten zuerst (Zeitstempel = Freischaltung); Gleichstand in Katalogreihenfolge. */
export function newestCards(cards: Readonly<Record<string, number>>, limit = 3): string[] {
  const have = CARD_IDS.map((id, i) => ({ id, i, ts: Number(cards[id]) || 0 })).filter((c) => Object.hasOwn(cards, c.id));
  have.sort((a, b) => b.ts - a.ts || a.i - b.i);
  return have.slice(0, Math.max(0, limit)).map((c) => c.id);
}

/** Günstigster noch nicht gekaufter, verkäuflicher Artikel (Freeze nur, solange der Vorrat nicht voll ist); null, wenn nichts mehr offen ist. */
export function cheapestOpenItem(o: { purchases: Readonly<Record<string, number>>; freezes: number }): ShopItem | null {
  let best: ShopItem | null = null;
  for (const it of SHOP_ITEMS) {
    if (it.price === null) continue;
    if (it.kind !== 'freeze' && ownsItem(o.purchases, it.id)) continue;
    if (!canBuy(it, { balance: Number.POSITIVE_INFINITY, owned: false, freezes: o.freezes }).ok) continue; // z. B. Freeze-Vorrat voll
    if (!best || (best.price ?? 0) > it.price) best = it;
  }
  return best;
}
