// Liga-Wertung und Champions (v9 K): Routen POST /league und GET /league/champions von /api/challenge.
// Speicher: SQL-Funktionen aus sql/007_league.sql. Die Wertung meldet das Gerät; der Server prüft Bereich und Stufe
// (tier === tierIndex(rating)), das SQL begrenzt den Zuwachs pro Tag und verlangt für Champions gewertete Dailys.
import {
  ACTIVE_DAYS, CHAMPION_DEFAULT, CHAMPION_MAX, CHAMPION_MIN, MASTER_RATING, MAX_DAILY_GAIN, MIN_RANKED_DAILIES,
} from '../src/core/champion.ts';
import { MAX_RATING, MAX_TIER, tierIndex } from '../src/core/league.ts';
import { DbError } from './challenge-store.ts';
import type { Rpc } from './challenge-store.ts';

export { ACTIVE_DAYS, CHAMPION_MAX, CHAMPION_MIN, MASTER_RATING, MAX_DAILY_GAIN, MIN_RANKED_DAILIES };

/** Anzahl der Champions aus der Pages-Variable CHAMPION_COUNT: Standard 10, begrenzt auf 1–1000 (Unsinn → Standard). */
export function parseChampionCount(raw: unknown): number {
  if (raw === undefined || raw === null) return CHAMPION_DEFAULT;
  const s = String(raw).trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return CHAMPION_DEFAULT;
  return Math.max(CHAMPION_MIN, Math.min(CHAMPION_MAX, Math.floor(Number(s))));
}

export interface ChampionRow { rank: number | null; name: string | null; rating: number; me: boolean; total: number }
export interface PutResult { rating: number; tier: number; capped: boolean }

export interface LeagueStore {
  put(userId: string, rating: number, tier: number, maxDailyGain: number): Promise<PutResult>;
  champions(o: { minRating: number; limit: number; userId: string | null; activeDays: number; minRanked: number }): Promise<ChampionRow[]>;
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0));

export function createRpcLeagueStore(rpc: Rpc): LeagueStore {
  return {
    async put(userId, rating, tier, maxDailyGain) {
      const r = (await rpc('league_put', { p_user: userId, p_rating: rating, p_tier: tier, p_max_daily_gain: maxDailyGain }))[0];
      if (!r) throw new DbError('no_row');
      return { rating: num(r.rating), tier: num(r.tier), capped: r.capped === true };
    },
    async champions(o) {
      const rows = await rpc('league_champions', {
        p_min_rating: o.minRating, p_limit: o.limit, p_user: o.userId, p_active_days: o.activeDays, p_min_ranked: o.minRanked,
      });
      return rows.map((r) => ({
        rank: r.rank === null || r.rank === undefined ? null : num(r.rank),
        name: typeof r.display_name === 'string' ? r.display_name : null,
        rating: num(r.rating), me: r.is_me === true, total: num(r.total),
      }));
    },
  };
}

/** Tabelle/Funktion fehlt (SQL 007 nicht ausgeführt): Postgres 42883/42P01, PostgREST PGRST202/PGRST205 */
export function isMissing(e: unknown): boolean {
  return e instanceof DbError && ['42883', '42P01', 'PGRST202', 'PGRST205'].includes(e.code);
}

export interface LeagueReply { status: number; body: unknown }
const err = (status: number, code: string): LeagueReply => ({ status, body: { error: { code } } });
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** POST /league { rating, tier } – angemeldet; Stufe muss zur Wertung passen. */
export async function putLeague(store: LeagueStore, userId: string | null, body: Record<string, unknown>): Promise<LeagueReply> {
  if (!userId) return err(401, 'unauthorized');
  const { rating, tier } = body;
  if (!isInt(rating, 0, MAX_RATING) || !isInt(tier, 0, MAX_TIER) || tier !== tierIndex(rating)) return err(400, 'invalid');
  try {
    const r = await store.put(userId, rating, tier, MAX_DAILY_GAIN);
    return { status: 200, body: { rating: r.rating, tier: r.tier, capped: r.capped } };
  } catch (e) {
    if (isMissing(e)) return err(503, 'unavailable');
    throw e;
  }
}

/** GET /league/champions – öffentlich; mit Anmeldung zusätzlich die eigene Position. */
export async function getChampions(store: LeagueStore, userId: string | null, count: number): Promise<LeagueReply> {
  try {
    const rows = await store.champions({
      minRating: MASTER_RATING, limit: count, userId, activeDays: ACTIVE_DAYS, minRanked: MIN_RANKED_DAILIES,
    });
    const champions = rows
      .filter((r) => r.rank !== null && r.rank <= count)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((r) => ({ rank: r.rank ?? 0, name: r.name ?? '', rating: r.rating, me: r.me }));
    const mine = rows.find((r) => r.me);
    const me = mine
      ? { rank: mine.rank, rating: mine.rating, champion: mine.rank !== null && mine.rank <= count }
      : null;
    return { status: 200, body: { count, total: rows[0]?.total ?? 0, champions, me } };
  } catch (e) {
    if (isMissing(e)) return err(503, 'unavailable');
    throw e;
  }
}
