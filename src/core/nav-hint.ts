// Einmaliger Hinweis nach dem Update auf v11 (DOM-frei): „Profil und Einstellungen liegen jetzt hinter dem Liga-Emblem“.
// Nur Bestandsnutzer sehen ihn; wer neu startet, bekommt die Einführung statt des Hinweises. Der Merker liegt geräte-lokal
// in localStorage (nicht in den Einstellungen, nicht im Sync).

export const NAV_HINT_KEY = 'mm.navHint.v11';

export type HintStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface NavHintInput {
  /** Merker gesetzt (Hinweis schon gezeigt bzw. für Neulinge übersprungen) */
  seen: boolean;
  /** Einführung/Begrüßung schon gewählt */
  onboardingDone: boolean;
  /** Anzahl gespeicherter Versuche */
  attempts: number;
  /** Fokus-/Spielmodus (Training, Kette, Mini-Case …) */
  focus: boolean;
  /** Ein Dialog ist offen (Willkommen, „Was ist neu?“, Einführung …) */
  dialogOpen: boolean;
  /** Der Rundgang läuft */
  tourRunning: boolean;
  /** Das Ziel (Emblem bzw. Seitenleisten-Eintrag) ist sichtbar */
  targetVisible: boolean;
}

/** Bestandsnutzer: hat die Einführung hinter sich oder schon geübt. */
export function isExistingUser(o: Pick<NavHintInput, 'onboardingDone' | 'attempts'>): boolean {
  return o.onboardingDone || o.attempts > 0;
}

export function shouldShowNavHint(i: NavHintInput): boolean {
  if (i.seen || !isExistingUser(i)) return false;
  return !i.focus && !i.dialogOpen && !i.tourRunning && i.targetVisible;
}

/** Ziel des Hinweises: iPad (ab 720 px) der Seitenleisten-Eintrag, sonst das Emblem im Titel. */
export function navHintTarget(wide: boolean): '.tabbar-profile' | '.account-button' {
  return wide ? '.tabbar-profile' : '.account-button';
}

function store(s?: HintStorage | null): HintStorage | null {
  if (s !== undefined) return s;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readNavHintSeen(s?: HintStorage | null): boolean {
  try { return store(s)?.getItem(NAV_HINT_KEY) === '1'; } catch { return false; }
}

export function markNavHintSeen(s?: HintStorage | null): void {
  try { store(s)?.setItem(NAV_HINT_KEY, '1'); } catch { /* ohne Speicher: höchstens ein zweites Mal */ }
}
