// Speicher der Challenges: dünne, typisierte Schicht über die SQL-Funktionen aus sql/006_challenges.sql.
// Produktion ruft sie per Supabase-RPC (service_role) auf, die Tests direkt in PGlite – dieselbe Logik.
// Zeitstempel kommen je nach Treiber als Date oder ISO-String, Zähler als number oder bigint: hier vereinheitlicht.
import { createClient } from '@supabase/supabase-js';
import type { AttemptStatus, ChallengeAnswer, ChallengeKind, LocalizedText } from '../src/core/challenge.ts';
import type { Task } from '../src/types.ts';

/** Ruft eine Funktion public.<fn>(named args) auf und liefert ihre Zeilen. Fehler: DbError mit Postgres-Code. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;

export class DbError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`db ${code}`);
    this.name = 'DbError';
    this.code = code;
  }
}

export interface ChallengeRow {
  id: string;
  kind: ChallengeKind;
  title: LocalizedText | null;
  startsAt: number;
  endsAt: number;
  config: unknown;
  seed: string;
  tasks: { de: Task[]; en: Task[] } | null;
  groupId: string | null;
}

export interface ListedChallenge {
  id: string;
  kind: ChallengeKind;
  title: LocalizedText | null;
  startsAt: number;
  endsAt: number;
  config: unknown;
  groupId: string | null;
  groupName: string | null;
  participants: number;
}

export interface AttemptRow {
  startedAt: number;
  finishedAt: number | null;
  answers: ChallengeAnswer[] | null;
  n: number | null;
  correct: number | null;
  points: number | null;
  timeMs: number | null;
  status: AttemptStatus;
}

export interface BoardRow {
  rank: number;
  name: string | null;
  points: number;
  timeMs: number;
  correct: number;
  days: number;
  me: boolean;
  total: number;
}

export interface ProfileRow { displayName: string; listed: boolean }
export interface GroupRow { id: string; name: string; code: string; owner: boolean; members: number }

export type StartOutcome = 'created' | 'exists' | 'not_found' | 'not_member' | 'upcoming' | 'closed';
export type JoinOutcome = 'joined' | 'already' | 'not_found' | 'full' | 'too_many';

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

function challengeRow(r: Record<string, unknown>): ChallengeRow {
  return {
    id: String(r.id), kind: r.kind === 'daily' ? 'daily' : 'competition', title: json<LocalizedText>(r.title),
    startsAt: ms(r.starts_at) ?? 0, endsAt: ms(r.ends_at) ?? 0, config: json(r.config), seed: String(r.seed ?? ''),
    tasks: json<{ de: Task[]; en: Task[] }>(r.tasks), groupId: str(r.group_id),
  };
}

function attemptRow(r: Record<string, unknown>): AttemptRow {
  const status = r.status;
  return {
    startedAt: ms(r.started_at) ?? 0, finishedAt: ms(r.finished_at), answers: json<ChallengeAnswer[]>(r.answers),
    n: r.n === null || r.n === undefined ? null : num(r.n),
    correct: r.correct === null || r.correct === undefined ? null : num(r.correct),
    points: r.points === null || r.points === undefined ? null : num(r.points),
    timeMs: r.time_ms === null || r.time_ms === undefined ? null : num(r.time_ms),
    status: status === 'finished' || status === 'expired' || status === 'flagged' ? status : 'running',
  };
}

function boardRow(r: Record<string, unknown>): BoardRow {
  return {
    rank: num(r.rank), name: str(r.display_name), points: num(r.points), timeMs: num(r.time_ms), correct: num(r.correct),
    days: num(r.days), me: r.is_me === true, total: num(r.total),
  };
}

export interface ChallengeStore {
  get(id: string): Promise<ChallengeRow | null>;
  create(row: Omit<ChallengeRow, 'tasks'> & { tasks: ChallengeRow['tasks']; createdBy: string | null }): Promise<ChallengeRow>;
  setTasks(id: string, tasks: NonNullable<ChallengeRow['tasks']>): Promise<ChallengeRow | null>;
  list(userId: string | null, now: number): Promise<ListedChallenge[]>;
  counts(ids: string[]): Promise<Map<string, number>>;
  attempt(challengeId: string, userId: string): Promise<AttemptRow | null>;
  start(challengeId: string, userId: string, now: number): Promise<{ outcome: StartOutcome; startedAt: number | null; status: AttemptStatus | null }>;
  finish(challengeId: string, userId: string, now: number, a: {
    answers: ChallengeAnswer[]; n: number; correct: number; points: number; timeMs: number; status: AttemptStatus;
  }): Promise<AttemptRow | null>;
  board(challengeId: string, userId: string | null, groupId: string | null, limit: number): Promise<BoardRow[]>;
  weekBoard(ids: string[], userId: string | null, groupId: string | null, limit: number): Promise<BoardRow[]>;
  profile(userId: string): Promise<ProfileRow | null>;
  putProfile(userId: string, displayName: string, listed: boolean): Promise<ProfileRow>;
  groups(userId: string): Promise<GroupRow[]>;
  membership(userId: string, groupId: string): Promise<{ member: boolean; owner: boolean }>;
  createGroup(userId: string, name: string, code: string, maxGroups: number): Promise<{ outcome: 'created' | 'too_many'; id: string | null }>;
  joinGroup(userId: string, code: string, maxMembers: number, maxGroups: number): Promise<{ outcome: JoinOutcome; id: string | null }>;
  leaveGroup(userId: string, groupId: string): Promise<'left' | 'deleted' | 'not_member'>;
}

export function createRpcChallengeStore(rpc: Rpc): ChallengeStore {
  const first = async (fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> =>
    (await rpc(fn, args))[0] ?? null;
  return {
    async get(id) {
      const r = await first('challenge_get', { p_id: id });
      return r ? challengeRow(r) : null;
    },
    async create(row) {
      const r = await first('challenge_create', {
        p_id: row.id, p_kind: row.kind, p_title: row.title, p_starts_at: iso(row.startsAt), p_ends_at: iso(row.endsAt),
        p_config: row.config, p_seed: row.seed, p_tasks: row.tasks, p_group: row.groupId, p_created_by: row.createdBy,
      });
      if (!r) throw new DbError('no_row');
      return challengeRow(r);
    },
    async setTasks(id, tasks) {
      const r = await first('challenge_set_tasks', { p_id: id, p_tasks: tasks });
      return r ? challengeRow(r) : null;
    },
    async list(userId, now) {
      const rows = await rpc('challenge_list', { p_user: userId, p_now: iso(now) });
      return rows.map((r) => ({
        id: String(r.id), kind: r.kind === 'daily' ? 'daily' : 'competition', title: json<LocalizedText>(r.title),
        startsAt: ms(r.starts_at) ?? 0, endsAt: ms(r.ends_at) ?? 0, config: json(r.config), groupId: str(r.group_id),
        groupName: str(r.group_name), participants: num(r.participants),
      }));
    },
    async counts(ids) {
      const out = new Map<string, number>();
      if (ids.length === 0) return out;
      for (const r of await rpc('challenge_counts', { p_ids: ids })) out.set(String(r.challenge_id), num(r.participants));
      return out;
    },
    async attempt(challengeId, userId) {
      const r = await first('challenge_attempt_get', { p_challenge: challengeId, p_user: userId });
      return r ? attemptRow(r) : null;
    },
    async start(challengeId, userId, now) {
      const r = await first('challenge_attempt_start', { p_challenge: challengeId, p_user: userId, p_now: iso(now) });
      const outcome = String(r?.outcome ?? 'not_found') as StartOutcome;
      const status = r?.status;
      return {
        outcome, startedAt: ms(r?.started_at),
        status: status === 'running' || status === 'finished' || status === 'expired' || status === 'flagged' ? status : null,
      };
    },
    async finish(challengeId, userId, now, a) {
      const r = await first('challenge_attempt_finish', {
        p_challenge: challengeId, p_user: userId, p_now: iso(now), p_answers: a.answers, p_n: a.n, p_correct: a.correct,
        p_points: a.points, p_time_ms: a.timeMs, p_status: a.status,
      });
      return r ? attemptRow(r) : null;
    },
    async board(challengeId, userId, groupId, limit) {
      return (await rpc('challenge_board', { p_challenge: challengeId, p_user: userId, p_group: groupId, p_limit: limit })).map(boardRow);
    },
    async weekBoard(ids, userId, groupId, limit) {
      return (await rpc('challenge_week_board', { p_ids: ids, p_user: userId, p_group: groupId, p_limit: limit })).map(boardRow);
    },
    async profile(userId) {
      const r = await first('challenge_profile_get', { p_user: userId });
      return r ? { displayName: String(r.display_name), listed: r.listed === true } : null;
    },
    async putProfile(userId, displayName, listed) {
      const r = await first('challenge_profile_put', { p_user: userId, p_name: displayName, p_listed: listed });
      if (!r) throw new DbError('no_row');
      return { displayName: String(r.display_name), listed: r.listed === true };
    },
    async groups(userId) {
      return (await rpc('challenge_groups_of', { p_user: userId })).map((r) => ({
        id: String(r.id), name: String(r.name), code: String(r.code), owner: r.owner === true, members: num(r.members),
      }));
    },
    async membership(userId, groupId) {
      const r = await first('challenge_membership', { p_user: userId, p_group: groupId });
      return { member: r?.member === true, owner: r?.owner === true };
    },
    async createGroup(userId, name, code, maxGroups) {
      const r = await first('challenge_group_create', { p_user: userId, p_name: name, p_code: code, p_max_groups: maxGroups });
      return { outcome: r?.outcome === 'created' ? 'created' : 'too_many', id: str(r?.id) };
    },
    async joinGroup(userId, code, maxMembers, maxGroups) {
      const r = await first('challenge_group_join', { p_user: userId, p_code: code, p_max_members: maxMembers, p_max_groups: maxGroups });
      return { outcome: String(r?.outcome ?? 'not_found') as JoinOutcome, id: str(r?.id) };
    },
    async leaveGroup(userId, groupId) {
      const r = await first('challenge_group_leave', { p_user: userId, p_group: groupId });
      const o = r?.outcome;
      return o === 'left' || o === 'deleted' ? o : 'not_member';
    },
  };
}

/** RPC über Supabase (PostgREST, service_role). Fehler nur mit Postgres-Code, nie mit Meldungstext. */
export function supabaseRpc(url: string, serviceKey: string): Rpc {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return async (fn, args) => {
    const r = await db.rpc(fn, args);
    if (r.error) throw new DbError(r.error.code || 'error');
    const data: unknown = r.data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    return data === null || data === undefined ? [] : [data as Record<string, unknown>];
  };
}
