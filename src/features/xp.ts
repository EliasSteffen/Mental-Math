// XP-Konto (v10) mit Speicher: Anzeige, Gutschrift, Ausgabe. Logik in src/core/xp.ts.
import { attemptXp, levelOf, lifetimeXp, syncLedger, withGrant, withSpend, xpBalance, type LevelInfo } from '../core/xp.ts';
import { getAttempts, getSettings, setSettings } from '../data/storage.ts';
import type { XpLedger } from '../types.ts';

export interface XpView extends LevelInfo {
  /** alle je verdienten XP (Level) */
  lifetime: number;
  /** ausgebbar */
  balance: number;
  ledger: XpLedger;
}

const synced = (): XpLedger => syncLedger(getSettings().xp, attemptXp(getAttempts()));

const viewOf = (ledger: XpLedger): XpView => ({ ...levelOf(lifetimeXp(ledger)), lifetime: lifetimeXp(ledger), balance: xpBalance(ledger), ledger });

/** Aktueller Stand (ohne zu speichern). */
export function xpView(): XpView {
  return viewOf(synced());
}

/** Abgleich mit den Aufgaben speichern (nach jeder Runde und beim Start; ändert nur, wenn nötig). */
export function syncXp(): XpView {
  const before = getSettings().xp;
  const next = synced();
  if (next.earned !== before.earned || next.seen !== before.seen) setSettings({ xp: next });
  return viewOf(next);
}

/** Geschenkte XP gutschreiben (Quests, Truhen, Comeback). */
export function grantXp(amount: number): XpView {
  const next = withGrant(synced(), amount);
  setSettings({ xp: next });
  return viewOf(next);
}

/** XP ausgeben (Shop, Serien-Reparatur). false, wenn das Guthaben nicht reicht – dann ändert sich nichts. */
export function spendXp(amount: number): boolean {
  const next = withSpend(synced(), amount);
  if (!next) return false;
  setSettings({ xp: next });
  return true;
}
