// Champion-Regeln (v9 K), gemeinsam für Server (server/league.ts) und Anzeige. DOM-frei.
import { CHAMPION_DEFAULT, MASTER_TIER, TIER_MINS } from './league.ts';

export { CHAMPION_DEFAULT };
/** Höchstens so viele LP Zuwachs pro Berliner Kalendertag (gegenüber der Wertung zu Tagesbeginn) */
export const MAX_DAILY_GAIN = 150;
/** Champion nur mit Meldung und gewerteten Dailys in diesem Zeitraum (Tage) … */
export const ACTIVE_DAYS = 30;
/** … und mindestens so vielen beendeten gewerteten Dailys darin */
export const MIN_RANKED_DAILIES = 3;
/** Grenzen der Server-Variable CHAMPION_COUNT */
export const CHAMPION_MIN = 1;
export const CHAMPION_MAX = 1000;
/** Mindestwertung für Champion = Schwelle von Meister */
export const MASTER_RATING: number = TIER_MINS[MASTER_TIER] ?? 780;
