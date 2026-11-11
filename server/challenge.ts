// /api/challenge – gewertete Daily, Wettbewerbe, Ranglisten, Gruppen (Cloudflare Pages Function + Node >= 20).
// Der Server ist maßgeblich: Er erzeugt und speichert die Aufgaben, gibt sie erst beim Start heraus, lässt genau einen
// Versuch zu und bewertet die Abgabe mit evaluate() neu. Anmeldung über das Access-Token von /api/auth (Bearer).
// Speicher: SQL-Funktionen aus sql/006_challenges.sql (server/challenge-store.ts). Plan: docs/PLAN-wettbewerb.md.
import { createTokenService } from 'passkey-auth/server';
import type { TokenService } from 'passkey-auth/server';
import {
  ATTEMPT_WINDOW_MS, COUNT_CHOICES, DAILY_CONFIG, DURATION_DAYS, FLAG_AFTER_FAST, GROUP_MAX_MEMBERS, GROUPS_PER_USER,
  LEADERBOARD_LIMIT, LEVEL_CHOICES, addDays, challengeDay, challengeTaskSet, dailyId, dayOfDailyId, dayStart, isChallengeId,
  isDay, newCompetitionId, newGroupCode, normalizeDisplayName, normalizeGroupCode, normalizeGroupName, parseAnswers,
  parseConfig, percentile, scoreAttempt, stateOf, weekDays, weekStart,
} from '../src/core/challenge.ts';
import type {
  AttemptStatus, ChallengeConfig, ChallengeInfo, ChallengeResult, GroupInfo, Leaderboard, LeaderboardEntry, PublicProfile,
} from '../src/core/challenge.ts';
import type { Task } from '../src/types.ts';
import { readAuthConfig } from './auth.ts';
import { DbError, createRpcChallengeStore, supabaseRpc } from './challenge-store.ts';
import type { AttemptRow, BoardRow, ChallengeRow, ChallengeStore, Rpc } from './challenge-store.ts';
import { createRpcLeagueStore, getChampions, parseChampionCount, putLeague } from './league.ts'; // v9 K
import type { LeagueStore } from './league.ts'; // v9 K
import { _resetRaceState, createRpcRaceStore, handleRace } from './race.ts'; // v12 R2
import type { RaceStore } from './race.ts'; // v12 R2
import { challengeChecks, durableLimiter, memoryLimiter } from './rate-limit.ts';
import type { DoNamespace, RateLimiter } from './rate-limit.ts';

const BASE = '/api/challenge';
const MAX_BODY = 16_384;
/** Nach Ablauf des Zeitfensters noch angenommen (langsames Netz), dann als 'expired' gewertet */
const LATE_GRACE_MS = 60_000;
const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChallengeEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUTH_JWT_KEY?: string;
  AUTH_RP_ID?: string;
  AUTH_ORIGINS?: string;
  RATE_LIMITER?: DoNamespace;
  /** Anzahl der Champions (v9 K), Standard 10, 1–1000 */
  CHAMPION_COUNT?: string;
}

export interface ChallengeDeps {
  /** Statt Supabase (Tests: PGlite) */
  rpc?: Rpc;
  /** Statt der JWT-Prüfung (Tests): Token → Nutzer-ID oder null */
  verify?: (token: string) => Promise<string | null>;
  now?: () => number;
  random?: () => number;
  /** Statt der SQL-Funktionen aus 007_league.sql (Tests) */
  league?: LeagueStore; // v9 K
  /** Statt der SQL-Funktionen aus 008_races.sql (Tests) */
  race?: RaceStore; // v12 R2
}

type ErrorCode =
  | 'invalid' | 'unauthorized' | 'not_found' | 'already_played' | 'closed' | 'upcoming' | 'not_member' | 'not_owner'
  | 'name_taken' | 'name_invalid' | 'no_profile' | 'full' | 'too_many' | 'rate_limited' | 'server_error' | 'no_attempt'
  | 'method' | 'unavailable'; // v9 K: unavailable

const STATUS: Record<ErrorCode, number> = {
  invalid: 400, name_invalid: 400, unauthorized: 401, not_member: 403, not_owner: 403, not_found: 404, no_attempt: 404,
  method: 405, already_played: 409, upcoming: 409, name_taken: 409, no_profile: 409, full: 409, too_many: 409, closed: 410,
  rate_limited: 429, server_error: 503, unavailable: 503,
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const fail = (code: ErrorCode): Response => json(STATUS[code], { error: { code } });
const iso = (t: number): string => new Date(t).toISOString();
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

class HttpError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

/* ---------- Anmeldung ---------- */

let tokenCache: { fingerprint: string; service: TokenService } | null = null;

function verifierFor(env: ChallengeEnv, now: () => number): ((token: string) => Promise<string | null>) | null {
  const config = readAuthConfig(env);
  if (!config) return null;
  const fingerprint = `${config.jwt.issuer}|${config.jwt.key.length}`;
  try {
    if (!tokenCache || tokenCache.fingerprint !== fingerprint) tokenCache = { fingerprint, service: createTokenService(config.jwt, now) };
  } catch (e) {
    console.error(`challenge: token service init failed (${e instanceof Error ? e.name : 'unknown'})`);
    return null;
  }
  const service = tokenCache.service;
  return async (token) => (await service.verify(token))?.userId ?? null;
}

async function userOf(req: Request, verify: ((t: string) => Promise<string | null>) | null): Promise<string | null> {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(req.headers.get('Authorization') ?? '');
  if (!m?.[1] || !verify) return null;
  return verify(m[1]);
}

/* ---------- Hilfen ---------- */

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > MAX_BODY) throw new HttpError('invalid');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError('invalid');
  try {
    const body: unknown = JSON.parse(text || '{}');
    if (!isObj(body)) throw new HttpError('invalid');
    return body;
  } catch {
    throw new HttpError('invalid');
  }
}

const langOf = (v: unknown): 'de' | 'en' => (v === 'en' ? 'en' : 'de');

function hex(random: () => number, bytes: number): string {
  const b = new Uint8Array(bytes);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < bytes; i++) b[i] = Math.floor(random() * 256);
  }
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function configOf(row: { kind: string; config: unknown }): ChallengeConfig {
  return parseConfig(row.config) ?? DAILY_CONFIG;
}

function entryOf(r: BoardRow): LeaderboardEntry {
  return { rank: r.rank, name: r.name ?? '', points: r.points, timeMs: r.timeMs, correct: r.correct, days: r.days, me: r.me };
}

/* ---------- Kern ---------- */

interface Ctx {
  store: ChallengeStore;
  now: number;
  random: () => number;
  userId: string | null;
  league: LeagueStore; // v9 K
  championCount: number; // v9 K
  race: RaceStore; // v12 R2
}

/** Daily eines Tages; legt sie beim ersten Aufruf an (parallele Aufrufe: alle bekommen dieselbe). */
async function ensureDaily(ctx: Ctx, day: string): Promise<ChallengeRow> {
  const id = dailyId(day);
  const found = await ctx.store.get(id);
  if (found?.tasks) return found;
  if (found) return ensureTasks(ctx, found);
  const seed = hex(ctx.random, 16);
  return ctx.store.create({
    id, kind: 'daily', title: null, startsAt: dayStart(day), endsAt: dayStart(addDays(day, 1)), config: DAILY_CONFIG,
    seed, tasks: challengeTaskSet(seed, DAILY_CONFIG, id), groupId: null, createdBy: null,
  });
}

/** Per SQL angelegte Wettbewerbe haben noch keine Aufgaben: aus Seed und Konfiguration erzeugen und speichern. */
async function ensureTasks(ctx: Ctx, row: ChallengeRow): Promise<ChallengeRow> {
  if (row.tasks) return row;
  const set = challengeTaskSet(row.seed, configOf(row), row.id);
  return (await ctx.store.setTasks(row.id, set)) ?? { ...row, tasks: set };
}

/** Challenge laden; eine Daily wird bei Bedarf angelegt, aber nur für vergangene Tage bis heute (nie im Voraus). */
async function loadChallenge(ctx: Ctx, id: string): Promise<ChallengeRow> {
  const day = dayOfDailyId(id);
  if (day) {
    if (day > challengeDay(ctx.now)) throw new HttpError('not_found');
    if (day === challengeDay(ctx.now)) return ensureDaily(ctx, day);
  }
  const row = await ctx.store.get(id);
  if (!row) throw new HttpError('not_found');
  if (row.groupId) {
    if (!ctx.userId || !(await ctx.store.membership(ctx.userId, row.groupId)).member) throw new HttpError('not_found');
  }
  return ensureTasks(ctx, row);
}

/** Ergebnis eines abgeschlossenen Versuchs mit Platz und richtig/falsch je Aufgabe (aus den Antworten neu bewertet). */
async function resultOf(ctx: Ctx, challengeId: string, a: AttemptRow, tasks?: readonly Task[] | null): Promise<ChallengeResult> {
  if (a.status === 'running') {
    // Zeitfenster abgelaufen ohne Abgabe: zählt mit 0 Punkten
    return { status: 'expired', n: 0, correct: 0, points: 0, timeMs: 0, rank: null, total: 0, percentile: null, marks: [] };
  }
  const rows = await ctx.store.board(challengeId, ctx.userId, null, 1);
  const me = rows.find((r) => r.me);
  const total = rows[0]?.total ?? 0;
  const rank = a.status === 'finished' && me ? me.rank : null;
  let marks: boolean[] = [];
  if (a.answers) {
    const list = tasks ?? (await ctx.store.get(challengeId))?.tasks?.de ?? null;
    if (list) marks = scoreAttempt(list, a.answers).marks;
  }
  return {
    status: a.status, n: a.n ?? 0, correct: a.correct ?? 0, points: a.points ?? 0, timeMs: a.timeMs ?? 0,
    rank, total, percentile: rank === null ? null : percentile(rank, total), marks,
  };
}

async function infoOf(ctx: Ctx, row: Pick<ChallengeRow, 'id' | 'kind' | 'title' | 'startsAt' | 'endsAt' | 'config' | 'groupId'>
  & { tasks?: ChallengeRow['tasks'] }, extra: { participants?: number; groupName?: string | null } = {}): Promise<ChallengeInfo> {
  const config = configOf(row);
  const attempt = ctx.userId ? await ctx.store.attempt(row.id, ctx.userId) : null;
  const state = stateOf(row, attempt, ctx.now);
  const participants = extra.participants ?? (await ctx.store.counts([row.id])).get(row.id) ?? 0;
  return {
    id: row.id, kind: row.kind, title: row.title, startsAt: iso(row.startsAt), endsAt: iso(row.endsAt), count: config.count,
    level: config.level, categories: config.categories, groupId: row.groupId, groupName: extra.groupName ?? null, state,
    participants,
    result: attempt && state === 'done' ? await resultOf(ctx, row.id, attempt, row.tasks?.de) : null,
    deadline: attempt && state === 'running' ? iso(attempt.startedAt + ATTEMPT_WINDOW_MS) : null,
  };
}

/* ---------- Routen ---------- */

async function today(ctx: Ctx): Promise<Response> {
  const row = await ensureDaily(ctx, challengeDay(ctx.now));
  return json(200, { challenge: await infoOf(ctx, row) });
}

async function overview(ctx: Ctx): Promise<Response> {
  const day = challengeDay(ctx.now);
  const daily = await infoOf(ctx, await ensureDaily(ctx, day));
  const listed = await ctx.store.list(ctx.userId, ctx.now);
  const competitions: ChallengeInfo[] = [];
  for (const c of listed) competitions.push(await infoOf(ctx, c, { participants: c.participants, groupName: c.groupName }));
  const profile = ctx.userId ? await ctx.store.profile(ctx.userId) : null;
  const groups: GroupInfo[] = ctx.userId ? await ctx.store.groups(ctx.userId) : [];
  return json(200, { day, daily, competitions, profile, groups, signedIn: ctx.userId !== null });
}

async function info(ctx: Ctx, url: URL): Promise<Response> {
  const id = url.searchParams.get('id');
  if (!isChallengeId(id)) return fail('invalid');
  const row = await loadChallenge(ctx, id);
  let groupName: string | null = null;
  if (row.groupId && ctx.userId) groupName = (await ctx.store.groups(ctx.userId)).find((g) => g.id === row.groupId)?.name ?? null;
  return json(200, { challenge: await infoOf(ctx, row, { groupName }) });
}

async function start(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const userId = ctx.userId;
  if (!userId) return fail('unauthorized');
  const id = body.id;
  if (!isChallengeId(id)) return fail('invalid');
  const row = await loadChallenge(ctx, id);
  const r = await ctx.store.start(id, userId, ctx.now);
  if (r.outcome === 'exists') return fail('already_played');
  if (r.outcome === 'not_found') return fail('not_found');
  if (r.outcome === 'not_member') return fail('not_member');
  if (r.outcome === 'upcoming') return fail('upcoming');
  if (r.outcome === 'closed') return fail('closed');
  const tasks: Task[] = row.tasks?.[langOf(body.lang)] ?? [];
  const startedAt = r.startedAt ?? ctx.now;
  return json(201, { id, tasks, startedAt: iso(startedAt), deadline: iso(startedAt + ATTEMPT_WINDOW_MS) });
}

async function finish(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const userId = ctx.userId;
  if (!userId) return fail('unauthorized');
  const id = body.id;
  if (!isChallengeId(id)) return fail('invalid');
  const row = await ctx.store.get(id);
  if (!row?.tasks) return fail('not_found');
  const attempt = await ctx.store.attempt(id, userId);
  if (!attempt) return fail('no_attempt');
  if (attempt.status !== 'running') return json(200, { result: await resultOf(ctx, id, attempt, row.tasks.de) });

  const tasks = row.tasks[langOf(body.lang)];
  const answers = parseAnswers(body.answers, tasks.length);
  if (!answers) return fail('invalid');
  const score = scoreAttempt(tasks, answers);
  const elapsed = Math.max(0, ctx.now - attempt.startedAt);
  const status: AttemptStatus = elapsed > ATTEMPT_WINDOW_MS + LATE_GRACE_MS ? 'expired'
    : score.fast >= FLAG_AFTER_FAST ? 'flagged' : 'finished';
  const saved = await ctx.store.finish(id, userId, ctx.now, {
    answers, n: score.n, correct: score.correct, points: score.points, timeMs: Math.min(score.timeMs, elapsed), status,
  });
  if (!saved) return fail('no_attempt');
  return json(200, { result: await resultOf(ctx, id, saved, tasks) });
}

/** Aufgaben und eigene Antworten zum Nachspielen – erst nach dem eigenen Versuch (oder nach dem Ende der Challenge). */
async function review(ctx: Ctx, url: URL): Promise<Response> {
  const id = url.searchParams.get('id');
  if (!isChallengeId(id)) return fail('invalid');
  const row = await loadChallenge(ctx, id);
  const attempt = ctx.userId ? await ctx.store.attempt(id, ctx.userId) : null;
  const done = attempt ? stateOf(row, attempt, ctx.now) === 'done' : false;
  if (!done && ctx.now < row.endsAt) return fail(ctx.userId ? 'no_attempt' : 'unauthorized');
  return json(200, { id, tasks: row.tasks?.[langOf(url.searchParams.get('lang'))] ?? [], answers: attempt?.answers ?? [] });
}

async function groupParam(ctx: Ctx, url: URL): Promise<string | null> {
  const g = url.searchParams.get('group');
  if (!g) return null;
  if (!UUID_RE.test(g)) throw new HttpError('invalid');
  if (!ctx.userId || !(await ctx.store.membership(ctx.userId, g)).member) throw new HttpError('not_member');
  return g;
}

function boardOf(rows: BoardRow[], base: Omit<Leaderboard, 'top' | 'me' | 'total'>): Leaderboard {
  const top = rows.filter((r) => r.rank <= LEADERBOARD_LIMIT).map(entryOf);
  const me = rows.find((r) => r.me);
  return { ...base, total: rows[0]?.total ?? 0, top, me: me ? entryOf(me) : null };
}

async function board(ctx: Ctx, url: URL): Promise<Response> {
  const id = url.searchParams.get('id') ?? dailyId(challengeDay(ctx.now));
  if (!isChallengeId(id)) return fail('invalid');
  const groupId = await groupParam(ctx, url);
  const row = await loadChallenge(ctx, id);
  const rows = await ctx.store.board(id, ctx.userId, groupId, LEADERBOARD_LIMIT);
  return json(200, { board: boardOf(rows, { scope: row.kind === 'daily' ? 'day' : 'challenge', id, title: row.title, groupId }) });
}

async function week(ctx: Ctx, url: URL): Promise<Response> {
  const raw = url.searchParams.get('day') ?? challengeDay(ctx.now);
  if (!isDay(raw)) return fail('invalid');
  const groupId = await groupParam(ctx, url);
  const monday = weekStart(raw);
  const ids = weekDays(monday).map(dailyId);
  const rows = await ctx.store.weekBoard(ids, ctx.userId, groupId, LEADERBOARD_LIMIT);
  return json(200, { board: boardOf(rows, { scope: 'week', id: monday, title: null, groupId }) });
}

async function getProfile(ctx: Ctx): Promise<Response> {
  if (!ctx.userId) return fail('unauthorized');
  const p: PublicProfile | null = await ctx.store.profile(ctx.userId);
  return json(200, { profile: p });
}

async function putProfile(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.userId) return fail('unauthorized');
  const name = normalizeDisplayName(body.displayName);
  if (!name) return fail('name_invalid');
  if (typeof body.listed !== 'boolean') return fail('invalid');
  try {
    return json(200, { profile: await ctx.store.putProfile(ctx.userId, name, body.listed) });
  } catch (e) {
    if (e instanceof DbError && e.code === '23505') return fail('name_taken');
    throw e;
  }
}

async function listGroups(ctx: Ctx): Promise<Response> {
  if (!ctx.userId) return fail('unauthorized');
  return json(200, { groups: await ctx.store.groups(ctx.userId) });
}

async function groupById(ctx: Ctx, userId: string, id: string | null): Promise<GroupInfo | null> {
  return (await ctx.store.groups(userId)).find((g) => g.id === id) ?? null;
}

async function createGroup(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const userId = ctx.userId;
  if (!userId) return fail('unauthorized');
  const name = normalizeGroupName(body.name);
  if (!name) return fail('name_invalid');
  if (!(await ctx.store.profile(userId))) return fail('no_profile');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await ctx.store.createGroup(userId, name, newGroupCode(ctx.random), GROUPS_PER_USER);
      if (r.outcome === 'too_many') return fail('too_many');
      const g = await groupById(ctx, userId, r.id);
      return g ? json(201, { group: g }) : fail('server_error');
    } catch (e) {
      if (!(e instanceof DbError && e.code === '23505')) throw e; // Code schon vergeben: neuer Versuch
    }
  }
  return fail('server_error');
}

async function joinGroup(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const userId = ctx.userId;
  if (!userId) return fail('unauthorized');
  const code = normalizeGroupCode(body.code);
  if (!code) return fail('invalid');
  if (!(await ctx.store.profile(userId))) return fail('no_profile');
  const r = await ctx.store.joinGroup(userId, code, GROUP_MAX_MEMBERS, GROUPS_PER_USER);
  if (r.outcome === 'not_found') return fail('not_found');
  if (r.outcome === 'full') return fail('full');
  if (r.outcome === 'too_many') return fail('too_many');
  const g = await groupById(ctx, userId, r.id);
  return g ? json(200, { group: g, joined: r.outcome === 'joined' }) : fail('server_error');
}

async function leaveGroup(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  if (!ctx.userId) return fail('unauthorized');
  if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) return fail('invalid');
  const outcome = await ctx.store.leaveGroup(ctx.userId, body.id);
  if (outcome === 'not_member') return fail('not_member');
  return json(200, { outcome });
}

/** Wettbewerb einer Gruppe (nur die Besitzerin): ab jetzt bis Mitternacht (Berlin) nach 1, 3 oder 7 Tagen. */
async function compete(ctx: Ctx, body: Record<string, unknown>): Promise<Response> {
  const userId = ctx.userId;
  if (!userId) return fail('unauthorized');
  const groupId = body.groupId;
  if (typeof groupId !== 'string' || !UUID_RE.test(groupId)) return fail('invalid');
  const m = await ctx.store.membership(userId, groupId);
  if (!m.member) return fail('not_member');
  if (!m.owner) return fail('not_owner');
  const title = normalizeGroupName(body.title);
  const config = parseConfig({ count: body.count, level: body.level, categories: body.categories ?? null });
  const days = body.days;
  if (!title || !config || !COUNT_CHOICES.includes(config.count) || !LEVEL_CHOICES.includes(config.level)
    || typeof days !== 'number' || !DURATION_DAYS.includes(days)) return fail('invalid');
  const id = newCompetitionId(ctx.random);
  const seed = hex(ctx.random, 16);
  const row = await ctx.store.create({
    id, kind: 'competition', title: { de: title, en: title }, startsAt: ctx.now,
    endsAt: dayStart(addDays(challengeDay(ctx.now), days)), config, seed, tasks: challengeTaskSet(seed, config, id),
    groupId, createdBy: userId,
  });
  const g = await groupById(ctx, userId, groupId);
  return json(201, { challenge: await infoOf(ctx, row, { participants: 0, groupName: g?.name ?? null }) });
}

/* ---------- Einstieg ---------- */

const memory = memoryLimiter(challengeChecks);
const limiterFor = (env: ChallengeEnv): RateLimiter =>
  env.RATE_LIMITER ? durableLimiter(env.RATE_LIMITER, memory, { name: 'challenge', checksFor: challengeChecks }) : memory;

/** Nur für Tests: Limits und Token-Cache zurücksetzen. */
export function _resetChallengeState(): void {
  memory.reset();
  tokenCache = null;
  _resetRaceState(); // v12 R2
}

export async function handleChallenge(req: Request, env: ChallengeEnv, deps: ChallengeDeps = {}): Promise<Response> {
  const now = (deps.now ?? Date.now)();
  const url = new URL(req.url);
  const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) || '/' : url.pathname;
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limiterFor(env).limited(ip, now)) return fail('rate_limited');

  let rpc = deps.rpc;
  if (!rpc) {
    const sbUrl = (env.SUPABASE_URL ?? '').trim();
    const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    if (!sbUrl || !key) {
      console.error('challenge: config unavailable (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)');
      return fail('server_error');
    }
    rpc = supabaseRpc(sbUrl, key);
  }
  const verify = deps.verify ?? verifierFor(env, deps.now ?? Date.now);
  const ctx: Ctx = { store: createRpcChallengeStore(rpc), now, random: deps.random ?? Math.random, userId: null,
    league: deps.league ?? createRpcLeagueStore(rpc), championCount: parseChampionCount(env.CHAMPION_COUNT),
    race: deps.race ?? createRpcRaceStore(rpc) }; // v12 R2

  try {
    ctx.userId = await userOf(req, verify);
    if (req.headers.get('Authorization') && !ctx.userId) return fail('unauthorized');
    if (path.startsWith('/race/')) { // v12 R2: Raketen-Rennen (Geister, Live-Zeiten)
      const r = await handleRace({ store: ctx.race, userId: ctx.userId, now, random: ctx.random, body: () => readBody(req) }, req.method, path, url.searchParams); // v12 R2
      if (r) return json(r.status, r.body); // v12 R2
    } // v12 R2
    const route = `${req.method} ${path}`;
    switch (route) {
      case 'GET /today': return await today(ctx);
      case 'GET /overview': return await overview(ctx);
      case 'GET /info': return await info(ctx, url);
      case 'GET /review': return await review(ctx, url);
      case 'GET /board': return await board(ctx, url);
      case 'GET /week': return await week(ctx, url);
      case 'GET /profile': return await getProfile(ctx);
      case 'GET /groups': return await listGroups(ctx);
      case 'POST /start': return await start(ctx, await readBody(req));
      case 'POST /finish': return await finish(ctx, await readBody(req));
      case 'POST /profile': return await putProfile(ctx, await readBody(req));
      case 'POST /groups/create': return await createGroup(ctx, await readBody(req));
      case 'POST /groups/join': return await joinGroup(ctx, await readBody(req));
      case 'POST /groups/leave': return await leaveGroup(ctx, await readBody(req));
      case 'POST /groups/compete': return await compete(ctx, await readBody(req));
      case 'POST /league': { const r = await putLeague(ctx.league, ctx.userId, await readBody(req)); return json(r.status, r.body); } // v9 K
      case 'GET /league/champions': { const r = await getChampions(ctx.league, ctx.userId, ctx.championCount); return json(r.status, r.body); } // v9 K
      default: return req.method === 'GET' || req.method === 'POST' ? fail('not_found') : fail('method');
    }
  } catch (e) {
    if (e instanceof HttpError) return fail(e.code);
    console.error(`challenge: ${e instanceof DbError ? e.message : e instanceof Error ? e.name : 'error'}`);
    return fail('server_error');
  }
}
