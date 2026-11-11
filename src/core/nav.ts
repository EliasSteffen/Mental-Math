// Navigation (v11 N), DOM-frei: Route → Tab, Profil als Modal-Seite, gemerkter letzter Tab.

export type TabId = 'today' | 'learn' | 'achievements' | 'compete';

/** Namen der Routen des Routers (src/router.ts). */
export type RouteName =
  | 'today' | 'progress' | 'profile' | 'achievements' | 'learn' | 'chain' | 'case' | 'parallel' | 'custom'
  | 'compete' | 'board' | 'challenge' | 'placement' | 'duel' | 'quests' | 'train'
  | 'race' | 'race-reihum' // v12 R1: Raketen-Rennen (Übersicht, „Reihum“ im Fokus-Modus)
  | 'race-group'; // v12 R2: Geister-Rennen einer Gruppe (Fokus-Modus)

export interface ShellState {
  /** Aktiver Tab; null = kein Tab */
  tab: TabId | null;
  /** Profil: ohne Tab-Leiste auf dem Telefon, Seitenleiste auf dem iPad bleibt */
  modal: boolean;
}

/** Tab einer Route; Training, Ketten, Parallel, Spiel eines Mini-Cases: kein Tab (Fokus-Modus). Profil: Modal. */
export function shellOf(name: RouteName, o: { caseId?: string | null } = {}): ShellState {
  switch (name) {
    case 'today': case 'custom': case 'quests': return { tab: 'today', modal: false };
    case 'case': return { tab: o.caseId ? null : 'today', modal: false }; // Auswahl mit Tab, Spiel im Fokus-Modus
    case 'compete': case 'board': case 'challenge': case 'duel': case 'race': return { tab: 'compete', modal: false };
    case 'learn': return { tab: 'learn', modal: false };
    case 'progress': case 'achievements': return { tab: 'achievements', modal: false }; // Statistik gehört zu Erfolge
    case 'profile': return { tab: null, modal: true };
    default: return { tab: null, modal: false };
  }
}

export const tabOf = (name: RouteName, o: { caseId?: string | null } = {}): TabId | null => shellOf(name, o).tab;

/** Sitzungsspeicher-Schlüssel des zuletzt gezeigten Tab-Hashs. */
export const LAST_TAB_KEY = 'mm.lastTab';

/** Gemerkten Hash prüfen: nur Adressen innerhalb der App, nie das Profil selbst (sonst führte „Schließen“ im Kreis). */
export function lastTabHash(stored: string | null | undefined, fallback = '#/'): string {
  if (typeof stored !== 'string' || !/^#\/\S*$/.test(stored) || stored.length > 200) return fallback;
  if (/^#\/(profil|settings)(\/|\?|$)/.test(stored)) return fallback;
  return stored;
}
