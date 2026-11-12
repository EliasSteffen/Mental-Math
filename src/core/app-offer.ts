// Hinweis auf die iOS-App für Besucher der Website auf iPhone und iPad (DOM-frei, testbar). Oberfläche und Zeitpunkt:
// features/app-offer.ts. Fragt erst, wenn jemand die App kennt (mindestens eine Runde, nicht beim ersten Start), nie mitten
// in einer Runde oder über einem anderen Dialog, höchstens dreimal mit einer Woche Pause. Wer zum App Store geht, wird
// nicht mehr gefragt. Der Merker liegt geräte-lokal in localStorage (nicht in den Einstellungen, nicht im Sync).

export const APP_OFFER_KEY = 'mm.appOffer';
/** So oft höchstens fragen … */
export const APP_OFFER_MAX = 3;
/** … mit so viel Pause dazwischen (ms). */
export const APP_OFFER_PAUSE_MS = 7 * 86_400_000;
/** Erst nach so vielen abgeschlossenen Runden. */
export const APP_OFFER_MIN_ROUNDS = 1;

export interface AppOfferState {
  /** So oft schon gezeigt */
  shown: number;
  /** Zuletzt gezeigt (ms; 0 = nie) */
  lastAt: number;
  /** Zum App Store gegangen: nie wieder fragen */
  done: boolean;
}

export const NO_OFFER_YET: AppOfferState = { shown: 0, lastAt: 0, done: false };

export interface AppOfferInput {
  state: AppOfferState;
  now: number;
  /** Läuft schon als iOS-App */
  native: boolean;
  /** iPhone oder iPad (Website) */
  apple: boolean;
  /** Abgeschlossene Runden */
  rounds: number;
  /** Dieser Start brachte die Einführung */
  firstRun: boolean;
  /** Auf einer Tab-Startseite (nicht in einer Runde, nicht in Unterseiten) */
  tabStart: boolean;
  /** Ein Dialog, Sheet oder Hinweis ist offen */
  dialogOpen: boolean;
  /** Der Rundgang läuft (Demo-Daten) */
  tourRunning: boolean;
}

export function shouldOfferApp(i: AppOfferInput): boolean {
  if (i.native || !i.apple || i.state.done || i.state.shown >= APP_OFFER_MAX) return false;
  if (i.now - i.state.lastAt < APP_OFFER_PAUSE_MS) return false;
  if (i.firstRun || i.rounds < APP_OFFER_MIN_ROUNDS) return false;
  return i.tabStart && !i.dialogOpen && !i.tourRunning;
}

/** iPhone, iPod oder iPad – auch iPadOS, das sich als Mac mit Touchscreen ausgibt. */
export function isAppleMobile(nav: { userAgent: string; platform: string; maxTouchPoints: number }): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function parseAppOffer(raw: string | null): AppOfferState {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (v === null || typeof v !== 'object') return { ...NO_OFFER_YET };
    const o = v as Record<string, unknown>;
    const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
    return { shown: Math.floor(n(o.shown)), lastAt: n(o.lastAt), done: o.done === true };
  } catch {
    return { ...NO_OFFER_YET };
  }
}

export type OfferStorage = Pick<Storage, 'getItem' | 'setItem'>;

function store(s?: OfferStorage | null): OfferStorage | null {
  if (s !== undefined) return s;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readAppOffer(s?: OfferStorage | null): AppOfferState {
  try { return parseAppOffer(store(s)?.getItem(APP_OFFER_KEY) ?? null); } catch { return { ...NO_OFFER_YET }; }
}

export function writeAppOffer(state: AppOfferState, s?: OfferStorage | null): void {
  try { store(s)?.setItem(APP_OFFER_KEY, JSON.stringify(state)); } catch { /* ohne Speicher: höchstens einmal mehr fragen */ }
}
