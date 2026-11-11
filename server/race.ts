// Raketen-Rennen in Gruppen (v12 R2): Routen /race/* von /api/challenge – Geister-Rennen und die Zeit-/Wertungsseite der
// Live-Rennen (Anlegen, `go`, Abgabe). Speicher: SQL-Funktionen aus sql/008_races.sql. Schnittstelle: docs/PLAN-v12-rennen.md §3a.
// Der Server ist maßgeblich: Er erzeugt die Aufgaben aus dem Seed, wertet die Antworten neu (judgeRaceRun) und speichert nur
// die Zeitleiste. Das Live-Gerüst (Durable Object, Ticket) liefert R3 und braucht von hier nur `RaceStore.info`.
import type { RaceConfig } from '../src/core/race.ts';
import {
  RACE_LIST_ENDED, RACE_KEEP_DAYS, RACE_LIVE_LEAD_MS, RACE_LIVE_LOBBY_MS, RACE_LIVE_TAIL_MS, RACE_MAX_OPEN_PER_GROUP,
  RACE_OPEN_DEFAULT, RACE_OPEN_MS, isRaceId, isRaceKind, isRaceOpen, judgeRaceRun, newRaceId, newRaceSeedFrom, parseRaceAnswers,
  parseRaceConfig,
} from '../src/core/race-api.ts';
import type { RaceBoardRow, RaceInfo, RaceKind, RaceListItem, RunStatus } from '../src/core/race-api.ts';
import { raceRanking } from '../src/core/race.ts';
import { DbError } from './challenge-store.ts';
import type { Rpc } from './challenge-store.ts';
import { hitLimits } from './rate-limit.ts';
import type { Hits } from './rate-limit.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- Speicher ---------- */

export type StartOutcome = 'created' | 'already' | 'not_found' | 'not_member' | 'closed' | 'upcoming';
export type FinishOutcome = 'saved' | 'already' | 'no_run' | 'not_found' | 'not_member' | 'not_started';
export type GoOutcome = 'set' | 'already' | 'closed' | 'not_live' | 'not_found' | 'not_member';

export interface RaceDetail {
  race: RaceInfo;
  member: boolean;
  /** Bei `member = false` sind bis auf `id` und `groupId` alle Felder von `race` leer */
  myStatus: RunStatus;
  myStartedAt: number | null;
}

export interface SavedRun { status: RunStatus; correct: number; wrong: number; lastOkMs: number; startedAt: number | null }

export interface RaceStore {
  /** Das Rennen und ob die Person Mitglied der Gruppe ist (R3 baut den Ticket-Handler gegen genau diese Signatur). */
  info(raceId: string, userId: string): Promise<{ race: RaceInfo; member: boolean } | null>;
  get(raceId: string, userId: string): Promise<RaceDetail | null>;
  member(userId: string, groupId: string): Promise<boolean>;
  create(o: {
    id: string; groupId: string; userId: string; kind: RaceKind; config: RaceConfig; seed: number; now: number; endsAt: number;
  }): Promise<'created' | 'not_member' | 'too_many'>;
  list(groupId: string, userId: string, now: number): Promise<RaceListItem[]>;
  board(raceId: string, userId: string): Promise<RaceBoardRow[]>;
  /** Namen der Mitglieder ohne gewerteten Lauf */
  missing(raceId: string, userId: string): Promise<string[]>;
  runStart(raceId: string, userId: string, now: number): Promise<{ outcome: StartOutcome; startedAt: number | null; status: RunStatus | null }>;
  runFinish(raceId: string, userId: string, now: number, r: {
    steps: Array<[number, 0 | 1]>; correct: number; wrong: number; lastOkMs: number; status: 'finished' | 'flagged' | 'expired';
  }): Promise<{ outcome: FinishOutcome; run: SavedRun | null }>;
  go(raceId: string, userId: string, now: number): Promise<{ outcome: GoOutcome; startsAt: number | null }>;
}

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0));
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
function ms(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}
const json = <T>(v: unknown): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  return v as T;
};
const iso = (t: number): string => new Date(t).toISOString();
const DEFAULT_CONFIG: RaceConfig = { durationS: 60, cat: 'all', lvl: 2 };

function runStatus(v: unknown): RunStatus {
  return v === 'running' || v === 'finished' || v === 'expired' || v === 'flagged' ? v : 'none';
}

function infoRow(r: Record<string, unknown>): RaceInfo {
  const t = (v: unknown): string => iso(ms(v) ?? 0);
  return {
    id: String(r.id), groupId: String(r.group_id), createdBy: str(r.created_by) ?? '', createdByName: str(r.created_by_name) ?? '',
    kind: r.kind === 'live' ? 'live' : 'ghost', config: parseRaceConfig(json(r.config)) ?? DEFAULT_CONFIG, seed: num(r.seed),
    createdAt: t(r.created_at), startsAt: ms(r.starts_at) === null ? null : t(r.starts_at), endsAt: t(r.ends_at),
  };
}

export function createRpcRaceStore(rpc: Rpc): RaceStore {
  const first = async (fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> => (await rpc(fn, args))[0] ?? null;
  const getRow = async (raceId: string, userId: string): Promise<RaceDetail | null> => {
    const r = await first('race_get', { p_race: raceId, p_user: userId });
    if (!r) return null;
    return { race: infoRow(r), member: r.member === true, myStatus: runStatus(r.my_status), myStartedAt: ms(r.my_started_at) };
  };
  return {
    async info(raceId, userId) {
      const d = await getRow(raceId, userId);
      return d ? { race: d.race, member: d.member } : null;
    },
    get: getRow,
    async member(userId, groupId) {
      return (await first('challenge_membership', { p_user: userId, p_group: groupId }))?.member === true;
    },
    async create(o) {
      const r = await first('race_create', {
        p_id: o.id, p_group: o.groupId, p_user: o.userId, p_kind: o.kind, p_config: o.config, p_seed: o.seed, p_now: iso(o.now),
        p_ends_at: iso(o.endsAt), p_max_open: RACE_MAX_OPEN_PER_GROUP, p_keep_days: RACE_KEEP_DAYS,
      });
      const outcome = r?.outcome;
      return outcome === 'created' || outcome === 'not_member' ? outcome : 'too_many';
    },
    async list(groupId, userId, now) {
      return (await rpc('race_list', { p_group: groupId, p_user: userId, p_now: iso(now), p_ended: RACE_LIST_ENDED })).map((r) => ({
        ...infoRow(r), myStatus: runStatus(r.my_status), runs: num(r.runs),
      }));
    },
    async board(raceId, userId) {
      return (await rpc('race_board', { p_race: raceId, p_user: userId })).map((r) => ({
        rank: num(r.rank), name: str(r.display_name) ?? '', me: r.is_me === true, correct: num(r.correct), wrong: num(r.wrong),
        lastOkMs: num(r.last_ok_ms), status: runStatus(r.status),
        steps: (json<unknown[]>(r.steps) ?? []).flatMap((s): Array<[number, 0 | 1]> =>
          Array.isArray(s) && typeof s[0] === 'number' ? [[s[0], s[1] === 1 ? 1 : 0]] : []),
      }));
    },
    async missing(raceId, userId) {
      return (await rpc('race_missing', { p_race: raceId, p_user: userId })).map((r) => str(r.display_name)).filter((n): n is string => n !== null);
    },
    async runStart(raceId, userId, now) {
      const r = await first('race_run_start', { p_race: raceId, p_user: userId, p_now: iso(now) });
      const o = String(r?.outcome ?? 'not_found');
      const outcome: StartOutcome = (['created', 'already', 'not_member', 'closed', 'upcoming'] as const).find((x) => x === o) ?? 'not_found';
      return { outcome, startedAt: ms(r?.started_at), status: r?.status === undefined || r?.status === null ? null : runStatus(r.status) };
    },
    async runFinish(raceId, userId, now, v) {
      const r = await first('race_run_finish', {
        p_race: raceId, p_user: userId, p_now: iso(now), p_steps: v.steps, p_correct: v.correct, p_wrong: v.wrong,
        p_last_ok_ms: v.lastOkMs, p_status: v.status,
      });
      const o = String(r?.outcome ?? 'not_found');
      const outcome: FinishOutcome = (['saved', 'already', 'no_run', 'not_member', 'not_started'] as const).find((x) => x === o) ?? 'not_found';
      const run: SavedRun | null = r && (outcome === 'saved' || outcome === 'already')
        ? { status: runStatus(r.status), correct: num(r.correct), wrong: num(r.wrong), lastOkMs: num(r.last_ok_ms), startedAt: ms(r.started_at) }
        : null;
      return { outcome, run };
    },
    async go(raceId, userId, now) {
      const r = await first('race_go', { p_race: raceId, p_user: userId, p_now: iso(now), p_lead_ms: RACE_LIVE_LEAD_MS, p_tail_ms: RACE_LIVE_TAIL_MS });
      const o = String(r?.outcome ?? 'not_found');
      const outcome: GoOutcome = (['set', 'already', 'closed', 'not_live', 'not_member'] as const).find((x) => x === o) ?? 'not_found';
      return { outcome, startsAt: ms(r?.starts_at) };
    },
  };
}

/* ---------- Fake für Tests (im Speicher, gleiche Regeln wie das SQL) ---------- */

interface FakeRun { startedAt: number; finishedAt: number | null; steps: Array<[number, 0 | 1]>; correct: number; wrong: number; lastOkMs: number; status: RunStatus }
interface FakeRace { info: RaceInfo; runs: Map<string, FakeRun> }

export interface FakeRaceStore extends RaceStore {
  /** Gruppen und ihre Mitglieder (Nutzer-ID → Anzeigename) festlegen */
  setGroup(groupId: string, members: Record<string, string>): void;
  races: Map<string, FakeRace>;
  /** Alle Aufrufe wie im Produktivbetrieb mit `DbError('42883')` beantworten (SQL 008 fehlt) */
  unavailable: boolean;
}

export function createFakeRaceStore(): FakeRaceStore {
  const groups = new Map<string, Map<string, string>>();
  const races = new Map<string, FakeRace>();
  const check = (): void => { if (store.unavailable) throw new DbError('42883'); };
  const isMember = (groupId: string, userId: string): boolean => groups.get(groupId)?.has(userId) === true;
  const nameOf = (groupId: string, userId: string): string => groups.get(groupId)?.get(userId) ?? '';
  const blank = (race: RaceInfo): RaceInfo => ({
    id: race.id, groupId: race.groupId, createdBy: '', createdByName: '', kind: 'ghost', config: DEFAULT_CONFIG, seed: 0,
    createdAt: iso(0), startsAt: null, endsAt: iso(0),
  });
  const rankRows = (r: FakeRace, userId: string): RaceBoardRow[] => {
    const entries = [...r.runs.entries()].filter(([, x]) => x.status === 'finished')
      .sort((a, b) => (a[1].finishedAt ?? 0) - (b[1].finishedAt ?? 0) || a[0].localeCompare(b[0]));
    const ranked = raceRanking(entries.map(([uid, x]) => ({ name: uid, steps: x.steps.map(([m, ok]) => ({ ms: m, ok: ok === 1 })) })), r.info.config.durationS * 1000);
    return ranked.map((x) => {
      const run = r.runs.get(x.name);
      return {
        rank: x.rank, name: nameOf(r.info.groupId, x.name), me: x.name === userId, correct: x.correct, wrong: x.wrong,
        lastOkMs: x.lastOkMs, status: 'finished' as RunStatus, steps: run?.steps ?? [],
      };
    });
  };
  const store: FakeRaceStore = {
    races, unavailable: false,
    setGroup(groupId, members) { groups.set(groupId, new Map(Object.entries(members))); },
    async info(raceId, userId) {
      check();
      const r = races.get(raceId);
      if (!r) return null;
      const member = isMember(r.info.groupId, userId);
      return { race: member ? r.info : blank(r.info), member };
    },
    async get(raceId, userId) {
      check();
      const r = races.get(raceId);
      if (!r) return null;
      const member = isMember(r.info.groupId, userId);
      const run = r.runs.get(userId);
      return {
        race: member ? r.info : blank(r.info), member, myStatus: member ? (run?.status ?? 'none') : 'none',
        myStartedAt: member ? (run?.startedAt ?? null) : null,
      };
    },
    async member(userId, groupId) { check(); return isMember(groupId, userId); },
    async create(o) {
      check();
      if (!isMember(o.groupId, o.userId)) return 'not_member';
      const open = [...races.values()].filter((r) => r.info.groupId === o.groupId && Date.parse(r.info.endsAt) > o.now).length;
      if (open >= RACE_MAX_OPEN_PER_GROUP) return 'too_many';
      races.set(o.id, {
        info: {
          id: o.id, groupId: o.groupId, createdBy: o.userId, createdByName: nameOf(o.groupId, o.userId), kind: o.kind,
          config: o.config, seed: o.seed, createdAt: iso(o.now), startsAt: null, endsAt: iso(o.endsAt),
        },
        runs: new Map(),
      });
      return 'created';
    },
    async list(groupId, userId, now) {
      check();
      if (!isMember(groupId, userId)) return [];
      const all = [...races.values()].filter((r) => r.info.groupId === groupId).map((r): RaceListItem => ({
        ...r.info, myStatus: r.runs.get(userId)?.status ?? 'none', runs: [...r.runs.values()].filter((x) => x.status === 'finished').length,
      }));
      const open = all.filter((r) => Date.parse(r.endsAt) > now).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt) || a.id.localeCompare(b.id));
      const ended = all.filter((r) => Date.parse(r.endsAt) <= now && r.runs > 0)
        .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt) || a.id.localeCompare(b.id)).slice(0, RACE_LIST_ENDED);
      return [...open, ...ended];
    },
    async board(raceId, userId) {
      check();
      const r = races.get(raceId);
      return r && isMember(r.info.groupId, userId) ? rankRows(r, userId) : [];
    },
    async missing(raceId, userId) {
      check();
      const r = races.get(raceId);
      if (!r || !isMember(r.info.groupId, userId)) return [];
      return [...(groups.get(r.info.groupId)?.entries() ?? [])]
        .filter(([uid]) => r.runs.get(uid)?.status !== 'finished').map(([, name]) => name).filter((n) => n !== '')
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    },
    async runStart(raceId, userId, now) {
      check();
      const r = races.get(raceId);
      if (!r) return { outcome: 'not_found', startedAt: null, status: null };
      if (!isMember(r.info.groupId, userId)) return { outcome: 'not_member', startedAt: null, status: null };
      const have = r.runs.get(userId);
      if (have) return { outcome: 'already', startedAt: have.startedAt, status: have.status };
      if (r.info.kind === 'live' && r.info.startsAt === null) return { outcome: 'upcoming', startedAt: null, status: null };
      if (now >= Date.parse(r.info.endsAt)) return { outcome: 'closed', startedAt: null, status: null };
      const startedAt = r.info.kind === 'live' ? Date.parse(r.info.startsAt ?? '') : now;
      r.runs.set(userId, { startedAt, finishedAt: null, steps: [], correct: 0, wrong: 0, lastOkMs: 0, status: 'running' });
      return { outcome: 'created', startedAt, status: 'running' };
    },
    async runFinish(raceId, userId, now, v) {
      check();
      const r = races.get(raceId);
      if (!r) return { outcome: 'not_found', run: null };
      if (!isMember(r.info.groupId, userId)) return { outcome: 'not_member', run: null };
      if (r.info.kind === 'live') {
        if (r.info.startsAt === null) return { outcome: 'not_started', run: null };
        if (!r.runs.has(userId)) {
          r.runs.set(userId, { startedAt: Date.parse(r.info.startsAt), finishedAt: null, steps: [], correct: 0, wrong: 0, lastOkMs: 0, status: 'running' });
        }
      }
      const run = r.runs.get(userId);
      if (!run) return { outcome: 'no_run', run: null };
      let outcome: FinishOutcome = 'already';
      if (run.status === 'running') {
        Object.assign(run, { finishedAt: now, steps: v.steps, correct: v.correct, wrong: v.wrong, lastOkMs: v.lastOkMs, status: v.status });
        outcome = 'saved';
      }
      return { outcome, run: { status: run.status, correct: run.correct, wrong: run.wrong, lastOkMs: run.lastOkMs, startedAt: run.startedAt } };
    },
    async go(raceId, userId, now) {
      check();
      const r = races.get(raceId);
      if (!r) return { outcome: 'not_found', startsAt: null };
      if (!isMember(r.info.groupId, userId)) return { outcome: 'not_member', startsAt: null };
      if (r.info.kind !== 'live') return { outcome: 'not_live', startsAt: null };
      if (r.info.startsAt !== null) return { outcome: 'already', startsAt: Date.parse(r.info.startsAt) };
      if (now >= Date.parse(r.info.endsAt)) return { outcome: 'closed', startsAt: null };
      const startsAt = now + RACE_LIVE_LEAD_MS;
      r.info = { ...r.info, startsAt: iso(startsAt), endsAt: iso(startsAt + r.info.config.durationS * 1000 + RACE_LIVE_TAIL_MS) };
      return { outcome: 'set', startsAt };
    },
  };
  return store;
}

/* ---------- Routen ---------- */

export interface RaceReply { status: number; body: unknown }

export interface RaceCtx {
  store: RaceStore;
  userId: string | null;
  now: number;
  random: () => number;
  /** JSON-Körper der Anfrage (wirft bei ungültigem Inhalt – der Aufrufer macht daraus `invalid`) */
  body: () => Promise<Record<string, unknown>>;
}

type RaceError =
  | 'invalid' | 'unauthorized' | 'not_member' | 'not_found' | 'closed' | 'already' | 'too_many' | 'rate_limited'
  | 'no_run' | 'not_started' | 'unavailable';

const ERROR_STATUS: Record<RaceError, number> = {
  invalid: 400, unauthorized: 401, not_member: 403, not_found: 404, closed: 409, already: 409, too_many: 409, no_run: 409,
  not_started: 409, rate_limited: 429, unavailable: 503,
};
const err = (code: RaceError, extra: Record<string, unknown> = {}): RaceReply => ({ status: ERROR_STATUS[code], body: { error: { code }, ...extra } });
const ok = (body: unknown, status = 200): RaceReply => ({ status, body });

/** Tabelle/Funktion fehlt (SQL 008 nicht ausgeführt): Postgres 42883/42P01, PostgREST PGRST202/PGRST205 */
export function isRaceMissing(e: unknown): boolean {
  return e instanceof DbError && ['42883', '42P01', 'PGRST202', 'PGRST205'].includes(e.code);
}

/** Anlegen: je Person höchstens 12 pro Stunde (zusätzlich zur Grenze von 5 offenen je Gruppe im SQL) */
const CREATE_WINDOW_MS = 3_600_000;
const CREATE_MAX = 12;
let createHits: Hits = {};
/** Nur für Tests */
export function _resetRaceState(): void { createHits = {}; }

async function create(ctx: RaceCtx): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const body = await ctx.body();
  const { groupId, kind } = body;
  const config = parseRaceConfig(body.config);
  if (typeof groupId !== 'string' || !UUID_RE.test(groupId) || !isRaceKind(kind) || !config) return err('invalid');
  if (body.open !== undefined && !isRaceOpen(body.open)) return err('invalid');
  const open = isRaceOpen(body.open) ? body.open : RACE_OPEN_DEFAULT;
  if (!(await ctx.store.member(userId, groupId))) return err('not_member');
  const limited = hitLimits(createHits, [{ key: `race:create:${userId}`, windowMs: CREATE_WINDOW_MS, max: CREATE_MAX }], ctx.now);
  createHits = { ...createHits, ...limited.hits };
  if (!limited.ok) return err('rate_limited');
  const id = newRaceId(ctx.random);
  const endsAt = ctx.now + (kind === 'live' ? RACE_LIVE_LOBBY_MS : RACE_OPEN_MS[open]);
  const outcome = await ctx.store.create({ id, groupId, userId, kind, config, seed: newRaceSeedFrom(ctx.random), now: ctx.now, endsAt });
  if (outcome === 'not_member') return err('not_member');
  if (outcome === 'too_many') return err('too_many');
  const made = await ctx.store.info(id, userId);
  return made ? ok({ race: made.race }, 201) : err('not_found');
}

async function list(ctx: RaceCtx, query: URLSearchParams): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const group = query.get('group');
  if (!group || !UUID_RE.test(group)) return err('invalid');
  if (!(await ctx.store.member(userId, group))) return err('not_member');
  return ok({ races: await ctx.store.list(group, userId, ctx.now) });
}

async function show(ctx: RaceCtx, id: string): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const d = await ctx.store.get(id, userId);
  if (!d) return err('not_found');
  if (!d.member) return err('not_member');
  const board = await ctx.store.board(id, userId);
  const missing = await ctx.store.missing(id, userId);
  const me = d.myStatus === 'none' || d.myStartedAt === null ? null : { status: d.myStatus, startedAt: iso(d.myStartedAt) };
  return ok({ race: d.race, board, missing, me });
}

async function start(ctx: RaceCtx, id: string): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const r = await ctx.store.runStart(id, userId, ctx.now);
  switch (r.outcome) {
    case 'created': return ok({ startedAt: iso(r.startedAt ?? ctx.now) }, 201);
    case 'already': return err('already', { startedAt: r.startedAt === null ? null : iso(r.startedAt) });
    case 'not_found': return err('not_found');
    case 'not_member': return err('not_member');
    case 'upcoming': return err('not_started');
    default: return err('closed');
  }
}

async function goLive(ctx: RaceCtx, id: string): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const r = await ctx.store.go(id, userId, ctx.now);
  switch (r.outcome) {
    case 'set': return ok({ startsAt: iso(r.startsAt ?? ctx.now) });
    case 'already': return err('already', { startsAt: r.startsAt === null ? null : iso(r.startsAt) });
    case 'not_found': return err('not_found');
    case 'not_member': return err('not_member');
    case 'not_live': return err('invalid');
    default: return err('closed');
  }
}

async function finish(ctx: RaceCtx, id: string): Promise<RaceReply> {
  const userId = ctx.userId;
  if (!userId) return err('unauthorized');
  const answers = parseRaceAnswers((await ctx.body()).answers);
  if (!answers) return err('invalid');
  const d = await ctx.store.get(id, userId);
  if (!d) return err('not_found');
  if (!d.member) return err('not_member');
  const race = d.race;
  if (race.kind === 'live' && race.startsAt === null) return err('not_started');
  const startedAt = d.myStartedAt ?? (race.kind === 'live' && race.startsAt ? Date.parse(race.startsAt) : null);
  if (startedAt === null) return err('no_run');
  const verdict = judgeRaceRun({ seed: race.seed, config: race.config, answers, elapsedMs: Math.max(0, ctx.now - startedAt) });
  const saved = await ctx.store.runFinish(id, userId, ctx.now, {
    steps: verdict.steps, correct: verdict.correct, wrong: verdict.wrong, lastOkMs: verdict.lastOkMs, status: verdict.status,
  });
  switch (saved.outcome) {
    case 'saved': case 'already': break;
    case 'no_run': return err('no_run');
    case 'not_started': return err('not_started');
    case 'not_member': return err('not_member');
    default: return err('not_found');
  }
  const run = saved.run;
  if (!run) return err('not_found');
  let rank = 0;
  if (run.status === 'finished') rank = (await ctx.store.board(id, userId)).find((r) => r.me)?.rank ?? 0;
  return ok({ rank, correct: run.correct, wrong: run.wrong, status: run.status });
}

/**
 * Routen /race/* (Pfad ohne /api/challenge). Gibt null zurück, wenn der Pfad keine Route von R2 ist – der Aufrufer
 * antwortet dann wie bisher (`not_found`/`method`). Fehlendes SQL 008 → 503 `unavailable`.
 */
export async function handleRace(ctx: RaceCtx, method: string, path: string, query: URLSearchParams): Promise<RaceReply | null> {
  const m = /^\/race\/([^/]+)(?:\/(start|go|finish))?$/.exec(path);
  if (!m) return null;
  const seg = m[1] ?? '';
  const action = m[2];
  let route: (() => Promise<RaceReply>) | null = null;
  if (!action && seg === 'create' && method === 'POST') route = () => create(ctx);
  else if (!action && seg === 'list' && method === 'GET') route = () => list(ctx, query);
  else if (seg !== 'create' && seg !== 'list') {
    if (!isRaceId(seg)) return err('invalid');
    if (!action && method === 'GET') route = () => show(ctx, seg);
    else if (action === 'start' && method === 'POST') route = () => start(ctx, seg);
    else if (action === 'go' && method === 'POST') route = () => goLive(ctx, seg);
    else if (action === 'finish' && method === 'POST') route = () => finish(ctx, seg);
  }
  if (!route) return null;
  try {
    return await route();
  } catch (e) {
    if (isRaceMissing(e)) return err('unavailable');
    throw e;
  }
}
