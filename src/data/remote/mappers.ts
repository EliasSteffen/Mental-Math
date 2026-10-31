// Reine Mapper zwischen App-Objekten und Supabase-Zeilen (docs/PLAN-data.md §2/§6); Dokument-Mapping liegt im Paket offline-sync/supabase. Keine Laufzeit-Abhängigkeiten.
import type { ErrorType, GameResult, Level, Params, SessionStats } from '../../types.ts';

export interface TrainingSessionRow {
  user_id: string;
  id: string;
  mode: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  duration_ms: number;
  avg_time_ms: number;
  created_at: string;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
  rev: number;
  server_updated_at?: string;
}

export interface TrainingResultRow {
  user_id: string;
  id: string;
  session_id: string;
  created_at: string;
  mode: string;
  category: string;
  subtype: string;
  correct: boolean;
  error_type: ErrorType | null;
  time_ms: number;
  target_ms: number;
  points: number;
  level: number | null;
  payload: Record<string, unknown>;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
  rev: number;
  server_updated_at?: string;
}

// ---------- Validierung ----------
type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
/** Zahl oder numerischer String (bigint kann als String kommen). */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const numOrNull = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : (num(v) ?? undefined));
const isoToMs = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};
const toIso = (ms: number): string => new Date(ms).toISOString();

// ---------- Sessions ----------
export function sessionToRow(s: SessionStats, userId: string): TrainingSessionRow {
  return {
    user_id: userId,
    id: s.id,
    mode: s.mode,
    score: s.points,
    correct_answers: s.correct,
    total_questions: s.n,
    duration_ms: Math.round(s.avgTimeMs * s.n),
    avg_time_ms: Math.round(s.avgTimeMs),
    created_at: toIso(s.ts),
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt,
    device_id: s.deviceId,
    rev: s.rev,
  };
}

export function rowToSession(row: unknown): SessionStats | null {
  if (!isObj(row)) return null;
  const id = str(row.id), mode = str(row.mode), deviceId = str(row.device_id);
  const points = num(row.score), correct = num(row.correct_answers), n = num(row.total_questions);
  const avg = num(row.avg_time_ms), updatedAt = num(row.updated_at), rev = num(row.rev);
  const createdAt = isoToMs(row.created_at);
  const deletedAt = numOrNull(row.deleted_at);
  if (id === null || mode === null || deviceId === null || points === null || correct === null || n === null) return null;
  if (avg === null || updatedAt === null || rev === null || createdAt === null || deletedAt === undefined) return null;
  return { id, ts: createdAt, mode, n, correct, points, avgTimeMs: avg, createdAt, updatedAt, deletedAt, deviceId, rev };
}

// ---------- Results ----------
const ERROR_TYPES: readonly string[] = ['nullen', 'knapp', 'falsch', 'skip'];

export function resultToRow(r: GameResult, userId: string): TrainingResultRow {
  const payload: Raw = { createdAt: r.createdAt, prompt: r.prompt, unit: r.unit, expected: r.expected, given: r.given, weight: r.weight };
  if (r.params !== undefined) payload.params = r.params;
  if (r.assisted !== undefined) payload.assisted = r.assisted;
  if (r.untimed !== undefined) payload.untimed = r.untimed;
  if (r.isReview !== undefined) payload.isReview = r.isReview;
  if (r.estimate !== undefined) payload.estimate = r.estimate;
  if (r.kind !== undefined) payload.kind = r.kind;
  if (r.choices !== undefined) payload.choices = r.choices;
  return {
    user_id: userId,
    id: r.id,
    session_id: r.sessionId,
    created_at: toIso(r.ts),
    mode: r.mode,
    category: r.category,
    subtype: r.subtype,
    correct: r.correct,
    error_type: r.errorType,
    time_ms: r.timeMs,
    target_ms: r.targetMs,
    points: r.points,
    level: r.level ?? null,
    payload,
    updated_at: r.updatedAt,
    deleted_at: r.deletedAt,
    device_id: r.deviceId,
    rev: r.rev,
  };
}

export function rowToResult(row: unknown): GameResult | null {
  if (!isObj(row)) return null;
  const id = str(row.id), sessionId = str(row.session_id), mode = str(row.mode), category = str(row.category);
  const subtype = str(row.subtype), deviceId = str(row.device_id);
  const ts = isoToMs(row.created_at);
  const timeMs = num(row.time_ms), targetMs = num(row.target_ms), points = num(row.points);
  const updatedAt = num(row.updated_at), rev = num(row.rev);
  const deletedAt = numOrNull(row.deleted_at);
  const p = row.payload;
  if (id === null || sessionId === null || mode === null || category === null || subtype === null || deviceId === null) return null;
  if (ts === null || timeMs === null || targetMs === null || points === null || updatedAt === null || rev === null) return null;
  if (deletedAt === undefined || typeof row.correct !== 'boolean' || !isObj(p)) return null;
  const errorType = row.error_type === null || row.error_type === undefined ? null : row.error_type;
  if (errorType !== null && (typeof errorType !== 'string' || !ERROR_TYPES.includes(errorType))) return null;
  const level = row.level === null || row.level === undefined ? null : num(row.level);
  if (level !== null && level !== 1 && level !== 2 && level !== 3) return null;
  const prompt = str(p.prompt), unit = str(p.unit), expected = num(p.expected), weight = num(p.weight);
  const given = p.given === null ? null : num(p.given);
  if (prompt === null || unit === null || expected === null || weight === null || (given === null && p.given !== null)) return null;
  const createdAt = num(p.createdAt) ?? ts;
  const out: GameResult = {
    id, createdAt, updatedAt, deletedAt, deviceId, rev,
    ts, sessionId, mode, category: category as GameResult['category'], subtype,
    prompt, unit, expected, given, correct: row.correct, errorType: errorType as ErrorType | null,
    timeMs, targetMs, weight, points,
  };
  if (isObj(p.params)) out.params = p.params as Params;
  if (typeof p.assisted === 'boolean') out.assisted = p.assisted;
  if (level !== null) out.level = level as Level;
  if (typeof p.untimed === 'boolean') out.untimed = p.untimed;
  if (typeof p.isReview === 'boolean') out.isReview = p.isReview;
  if (typeof p.estimate === 'boolean') out.estimate = p.estimate;
  if (p.kind === 'number' || p.kind === 'choice') out.kind = p.kind;
  if (Array.isArray(p.choices) && p.choices.every((c) => typeof c === 'string')) out.choices = p.choices as string[];
  return out;
}
