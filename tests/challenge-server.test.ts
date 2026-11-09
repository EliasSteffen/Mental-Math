// /api/challenge mit echtem SQL (sql/006_challenges.sql in PGlite): ein Versuch, Neubewertung, Ranglisten, Gruppen, Rechte
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { _resetChallengeState, handleChallenge } from '../server/challenge.ts';
import type { ChallengeDeps } from '../server/challenge.ts';
import { DbError } from '../server/challenge-store.ts';
import type { Rpc } from '../server/challenge-store.ts';
import { ATTEMPT_WINDOW_MS, dailyId, dayStart } from '../src/core/challenge.ts';
import type { ChallengeInfo, ChallengeResult, GroupInfo, Leaderboard } from '../src/core/challenge.ts';
import type { Task } from '../src/types.ts';

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'packages/passkey-auth/tests/helpers/supabase-sim.sql'), 'utf8');
const AUTH_SQL = readFileSync(join(root, 'packages/passkey-auth/sql/001_passkey_auth.sql'), 'utf8');
const SQL = readFileSync(join(root, 'sql/006_challenges.sql'), 'utf8');

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TOKENS: Record<string, string> = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`token-of-user-${n}-xxxxxxxx`, U(n)]));
const tokenOf = (n: number): string => `token-of-user-${n}-xxxxxxxx`;

const DAY = '2026-11-08';
const NOON = Date.parse('2026-11-08T11:00:00Z');

let db: PGlite;
let now = NOON;

/** Wie supabase.rpc: benannte Argumente; jsonb als JSON-Text, text[] als Array. */
const rpc: Rpc = async (fn, args) => {
  const keys = Object.keys(args);
  const values = keys.map((k) => {
    const v = args[k];
    if (v === undefined) return null;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
    if (v !== null && typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  try {
    return (await db.query<Record<string, unknown>>(sql, values)).rows;
  } catch (e) {
    throw new DbError((e as { code?: string }).code ?? 'error');
  }
};

let seq = 0;
const deps = (): ChallengeDeps => ({
  rpc, now: () => now, random: () => ((seq = (seq * 9301 + 49297) % 233280) / 233280),
  verify: async (t) => TOKENS[t] ?? null,
});

async function call<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, o: { user?: number; body?: unknown; ip?: string } = {}):
  Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'CF-Connecting-IP': o.ip ?? `10.0.0.${o.user ?? 0}` };
  if (o.user) headers.Authorization = `Bearer ${tokenOf(o.user)}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(`https://mm.test/api/challenge${path}`, {
    method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const res = await handleChallenge(req, {}, deps());
  return { status: res.status, body: (await res.json()) as T };
}

const errCode = (b: unknown): string | undefined => (b as { error?: { code?: string } }).error?.code;

async function play(user: number, id: string, pick: (t: Task, i: number) => number | null, ms = 3000):
  Promise<{ result: ChallengeResult; tasks: Task[] }> {
  const s = await call<{ tasks: Task[] }>('POST', '/start', { user, body: { id, lang: 'de' } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const answers = s.body.tasks.map((t, i) => ({ i, input: pick(t, i), ms }));
  now += answers.length * ms + 5000; // die Uhr läuft während der Runde weiter
  const f = await call<{ result: ChallengeResult }>('POST', '/finish', { user, body: { id, lang: 'de', answers } });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  return { result: f.body.result, tasks: s.body.tasks };
}

async function profile(user: number, name: string, listed = true): Promise<void> {
  const r = await call('POST', '/profile', { user, body: { displayName: name, listed } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

describe('challenge server + SQL', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SIM);
    await db.exec(AUTH_SQL);
    await db.exec(SQL);
    await db.exec(SQL); // Idempotenz
  });
  after(async () => { await db.close(); });
  beforeEach(async () => {
    _resetChallengeState();
    now = NOON;
    await db.exec('delete from public.challenges; delete from public.challenge_groups; delete from public.challenge_profiles; delete from public.users;');
    for (let n = 1; n <= 5; n++) await db.query('insert into public.users (id, username) values ($1, $2)', [U(n), `user${n}`]);
  });

  it('Rechte: anon/authenticated sehen keine Tabelle und keine Funktion', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query('select * from public.challenge_attempts'), /permission denied/);
        await assert.rejects(db.query('select * from public.challenge_profiles'), /permission denied/);
        await assert.rejects(db.query(`select * from public.challenge_get('daily-2026-11-08')`), /permission denied/);
      } finally {
        await db.exec('reset role');
      }
    }
  });

  it('today: legt die Daily einmal an (15 Aufgaben, de + en), ohne Aufgaben in der Antwort', async () => {
    const a = await call<{ challenge: ChallengeInfo }>('GET', '/today');
    assert.equal(a.status, 200);
    assert.equal(a.body.challenge.id, dailyId(DAY));
    assert.equal(a.body.challenge.state, 'open');
    assert.equal(a.body.challenge.count, 15);
    assert.equal(a.body.challenge.startsAt, new Date(dayStart(DAY)).toISOString());
    assert.equal(JSON.stringify(a.body).includes('expected'), false);
    const b = await call<{ challenge: ChallengeInfo }>('GET', '/today');
    assert.equal(b.body.challenge.id, a.body.challenge.id);
    const rows = await db.query<{ n: number; de: number; en: number }>(
      `select count(*)::int as n, max(jsonb_array_length(tasks->'de'))::int as de, max(jsonb_array_length(tasks->'en'))::int as en from public.challenges`);
    assert.deepEqual(rows.rows[0], { n: 1, de: 15, en: 15 });
  });

  it('Zukunft: Daily von morgen gibt es noch nicht', async () => {
    const r = await call('GET', `/info?id=${dailyId('2026-11-09')}`);
    assert.equal(r.status, 404);
  });

  it('ein Versuch: zweiter Start 409, parallel nur einer, Abgabe idempotent', async () => {
    const id = dailyId(DAY);
    assert.equal((await call('POST', '/start', { body: { id } })).status, 401);
    const [x, y] = await Promise.all([
      call('POST', '/start', { user: 1, body: { id, lang: 'de' } }),
      call('POST', '/start', { user: 1, body: { id, lang: 'de' } }),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [201, 409]);
    const tasks = ((x.status === 201 ? x.body : y.body) as { tasks: Task[] }).tasks;
    assert.equal(tasks.length, 15);
    const info = await call<{ challenge: ChallengeInfo }>('GET', `/info?id=${id}`, { user: 1 });
    assert.equal(info.body.challenge.state, 'running');
    assert.ok(info.body.challenge.deadline);

    const answers = tasks.map((t, i) => ({ i, input: i < 10 ? t.expected : null, ms: 4000 }));
    const f1 = await call<{ result: ChallengeResult }>('POST', '/finish', { user: 1, body: { id, lang: 'de', answers } });
    assert.equal(f1.status, 200);
    assert.equal(f1.body.result.correct, 10);
    assert.equal(f1.body.result.status, 'finished');
    assert.equal(f1.body.result.rank, 1);
    assert.equal(f1.body.result.marks.filter(Boolean).length, 10);
    // Zweite Abgabe mit besseren Antworten ändert nichts
    const better = tasks.map((t, i) => ({ i, input: t.expected, ms: 1000 }));
    const f2 = await call<{ result: ChallengeResult }>('POST', '/finish', { user: 1, body: { id, lang: 'de', answers: better } });
    assert.equal(f2.body.result.correct, 10);
    assert.equal(f2.body.result.points, f1.body.result.points);
    assert.equal((await call('POST', '/start', { user: 1, body: { id } })).status, 409);
    const done = await call<{ challenge: ChallengeInfo }>('GET', `/info?id=${id}`, { user: 1 });
    assert.equal(done.body.challenge.state, 'done');
    assert.equal(done.body.challenge.result?.correct, 10);
  });

  it('Neubewertung: der Server zählt nur seine eigene Wertung; Abgabe ohne Start 404', async () => {
    const id = dailyId(DAY);
    assert.equal((await call('POST', '/finish', { user: 2, body: { id, answers: [] } })).status, 404);
    const s = await call<{ tasks: Task[] }>('POST', '/start', { user: 2, body: { id, lang: 'en' } });
    const wrong = s.body.tasks.map((t, i) => ({ i, input: t.kind === 'choice' ? (t.expected + 1) % t.choices.length : t.expected * 7 + 13, ms: 2000, points: 999 }));
    const f = await call<{ result: ChallengeResult }>('POST', '/finish', { user: 2, body: { id, lang: 'en', answers: wrong, points: 99999 } });
    assert.equal(f.body.result.correct, 0);
    assert.ok(f.body.result.points < 200, `points ${f.body.result.points}`);
    assert.equal((await call('POST', '/finish', { user: 3, body: { id, answers: 'x' } })).status, 404);
  });

  it('Zeitfenster: zu späte Abgabe zählt als abgelaufen, nicht in der Rangliste', async () => {
    const id = dailyId(DAY);
    const s = await call<{ tasks: Task[] }>('POST', '/start', { user: 3, body: { id, lang: 'de' } });
    now += ATTEMPT_WINDOW_MS + 5 * 60_000;
    const answers = s.body.tasks.map((t, i) => ({ i, input: t.expected, ms: 3000 }));
    const f = await call<{ result: ChallengeResult }>('POST', '/finish', { user: 3, body: { id, lang: 'de', answers } });
    assert.equal(f.body.result.status, 'expired');
    assert.equal(f.body.result.rank, null);
    const b = await call<{ board: Leaderboard }>('GET', `/board?id=${id}`, { user: 3 });
    assert.equal(b.body.board.total, 0);
  });

  it('unplausibel schnell: markiert, nicht öffentlich', async () => {
    const id = dailyId(DAY);
    const { result } = await play(4, id, (t) => t.expected, 100);
    assert.equal(result.status, 'flagged');
    assert.equal(result.rank, null);
    const b = await call<{ board: Leaderboard }>('GET', `/board?id=${id}`);
    assert.equal(b.body.board.total, 0);
  });

  it('Rangliste: Punkte, dann Zeit; Name nur mit Opt-in, sonst anonym; eigene Zeile immer', async () => {
    const id = dailyId(DAY);
    await profile(1, 'Anna');
    await profile(2, 'Ben', false);
    await play(1, id, (t) => t.expected, 5000);
    await play(2, id, (t) => t.expected, 3000);
    await play(3, id, (t, i) => (i < 5 ? t.expected : null), 3000);
    const pub = await call<{ board: Leaderboard }>('GET', `/board?id=${id}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.board.total, 3);
    assert.deepEqual(pub.body.board.top.map((e) => [e.rank, e.name]), [[1, ''], [2, 'Anna'], [3, '']]);
    assert.equal(pub.body.board.me, null);
    const own = await call<{ board: Leaderboard }>('GET', `/board?id=${id}`, { user: 2 });
    assert.deepEqual(own.body.board.me && [own.body.board.me.rank, own.body.board.me.name, own.body.board.me.me], [1, 'Ben', true]);
    const info = await call<{ challenge: ChallengeInfo }>('GET', `/info?id=${id}`, { user: 3 });
    assert.equal(info.body.challenge.result?.rank, 3);
    assert.equal(info.body.challenge.result?.percentile, 0);
    assert.equal(info.body.challenge.participants, 3);
  });

  it('Wochen-Rangliste: Summe Mo–So über die Dailys', async () => {
    await profile(1, 'Anna');
    await profile(2, 'Ben');
    now = Date.parse('2026-11-03T10:00:00Z'); // Dienstag
    await play(1, dailyId('2026-11-03'), (t) => t.expected);
    await play(2, dailyId('2026-11-03'), (t) => t.expected);
    now = Date.parse('2026-11-04T10:00:00Z');
    await play(2, dailyId('2026-11-04'), (t) => t.expected);
    now = NOON; // Sonntag derselben Woche
    const w = await call<{ board: Leaderboard }>('GET', '/week', { user: 1 });
    assert.equal(w.status, 200);
    assert.equal(w.body.board.id, '2026-11-02');
    assert.deepEqual(w.body.board.top.map((e) => [e.name, e.days]), [['Ben', 2], ['Anna', 1]]);
    assert.equal(w.body.board.me?.rank, 2);
    const next = await call<{ board: Leaderboard }>('GET', '/week?day=2026-11-09');
    assert.equal(next.body.board.total, 0);
    assert.equal((await call('GET', '/week?day=2026-02-30')).status, 400);
  });

  it('Profil: Name geprüft und eindeutig (Groß/Klein egal)', async () => {
    assert.equal((await call('GET', '/profile')).status, 401);
    assert.equal((await call('POST', '/profile', { user: 1, body: { displayName: 'ab', listed: true } })).status, 400);
    await profile(1, 'Anna');
    const taken = await call('POST', '/profile', { user: 2, body: { displayName: 'ANNA', listed: true } });
    assert.equal(taken.status, 409);
    assert.equal(errCode(taken.body), 'name_taken');
    await profile(1, 'Anna K', false);
    const p = await call<{ profile: { displayName: string; listed: boolean } }>('GET', '/profile', { user: 1 });
    assert.deepEqual(p.body.profile, { displayName: 'Anna K', listed: false });
  });

  it('Gruppen: anlegen, beitreten, Gruppen-Rangliste mit Namen, Wettbewerb nur für Mitglieder, verlassen', async () => {
    assert.equal(errCode((await call('POST', '/groups/create', { user: 1, body: { name: 'Team' } })).body), 'no_profile');
    await profile(1, 'Anna', false);
    await profile(2, 'Ben', false);
    await profile(3, 'Cleo', true);
    const g = await call<{ group: GroupInfo }>('POST', '/groups/create', { user: 1, body: { name: 'Team Strategy' } });
    assert.equal(g.status, 201);
    assert.equal(g.body.group.owner, true);
    assert.match(g.body.group.code, /^[A-Z2-9]{6}$/);
    const j = await call<{ group: GroupInfo; joined: boolean }>('POST', '/groups/join', { user: 2, body: { code: g.body.group.code.toLowerCase() } });
    assert.equal(j.status, 200);
    assert.equal(j.body.joined, true);
    assert.equal(j.body.group.members, 2);
    assert.equal(j.body.group.owner, false);
    assert.equal((await call('POST', '/groups/join', { user: 2, body: { code: 'ZZZZZZ' } })).status, 404);

    const id = dailyId(DAY);
    await play(1, id, (t) => t.expected, 4000);
    await play(2, id, (t) => t.expected, 3000);
    await play(3, id, (t) => t.expected, 2000);
    const gb = await call<{ board: Leaderboard }>('GET', `/board?id=${id}&group=${g.body.group.id}`, { user: 1 });
    assert.equal(gb.status, 200);
    assert.deepEqual(gb.body.board.top.map((e) => [e.rank, e.name]), [[1, 'Ben'], [2, 'Anna']]);
    assert.equal((await call('GET', `/board?id=${id}&group=${g.body.group.id}`, { user: 3 })).status, 403);

    // Wettbewerb der Gruppe: nur die Besitzerin legt an, nur Mitglieder sehen und spielen ihn
    const bad = await call('POST', '/groups/compete', { user: 2, body: { groupId: g.body.group.id, title: 'Prozente', count: 10, level: 2, days: 3 } });
    assert.equal(errCode(bad.body), 'not_owner');
    const c = await call<{ challenge: ChallengeInfo }>('POST', '/groups/compete', {
      user: 1, body: { groupId: g.body.group.id, title: 'Prozente', count: 10, level: 2, days: 3, categories: ['pct'] },
    });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.challenge.endsAt, new Date(dayStart('2026-11-11')).toISOString());
    const cid = c.body.challenge.id;
    const ov2 = await call<{ competitions: ChallengeInfo[] }>('GET', '/overview', { user: 2 });
    assert.deepEqual(ov2.body.competitions.map((x) => [x.id, x.groupName]), [[cid, 'Team Strategy']]);
    const ov3 = await call<{ competitions: ChallengeInfo[] }>('GET', '/overview', { user: 3 });
    assert.equal(ov3.body.competitions.length, 0);
    assert.equal((await call('POST', '/start', { user: 3, body: { id: cid } })).status, 404);
    const { tasks } = await play(2, cid, (t) => t.expected);
    assert.equal(tasks.length, 10);
    assert.ok(tasks.every((t) => t.category === 'pct'));

    // Verlassen; Besitzerin löscht die Gruppe für alle (samt Wettbewerb)
    const left = await call<{ outcome: string }>('POST', '/groups/leave', { user: 2, body: { id: g.body.group.id } });
    assert.equal(left.body.outcome, 'left');
    const del = await call<{ outcome: string }>('POST', '/groups/leave', { user: 1, body: { id: g.body.group.id } });
    assert.equal(del.body.outcome, 'deleted');
    const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.challenges where id = $1`, [cid]);
    assert.equal(rows.rows[0]?.n, 0);
  });

  it('per SQL angelegter Wettbewerb: Aufgaben entstehen beim ersten Aufruf, Zeitraum wird geprüft', async () => {
    await db.query(`insert into public.challenges (id, kind, title, starts_at, ends_at, config, seed)
      values ('comp-test-woche', 'competition', '{"de":"Test-Woche","en":"Test week"}', $1, $2, '{"count":10,"level":3,"categories":null}', 'abcdefgh12345678')`,
    [new Date(NOON + 86_400_000).toISOString(), new Date(NOON + 3 * 86_400_000).toISOString()]);
    const ov = await call<{ competitions: ChallengeInfo[] }>('GET', '/overview');
    assert.equal(ov.body.competitions[0]?.state, 'upcoming');
    assert.equal(errCode((await call('POST', '/start', { user: 1, body: { id: 'comp-test-woche' } })).body), 'upcoming');
    now = NOON + 2 * 86_400_000;
    const { tasks } = await play(1, 'comp-test-woche', (t) => t.expected);
    assert.equal(tasks.length, 10);
    assert.ok(tasks.every((t) => t.level === 3));
    now = NOON + 4 * 86_400_000;
    assert.equal(errCode((await call('POST', '/start', { user: 2, body: { id: 'comp-test-woche' } })).body), 'closed');
    const r = await call<{ tasks: Task[] }>('GET', '/review?id=comp-test-woche&lang=en', { user: 2 });
    assert.equal(r.status, 200); // nach dem Ende für alle zum Nachspielen
    assert.equal(r.body.tasks.length, 10);
  });

  it('review: vor dem eigenen Versuch keine Aufgaben', async () => {
    const id = dailyId(DAY);
    assert.equal((await call('GET', `/review?id=${id}`, { user: 1 })).status, 404);
    assert.equal((await call('GET', `/review?id=${id}`)).status, 401);
    await play(1, id, () => null);
    const r = await call<{ tasks: Task[]; answers: unknown[] }>('GET', `/review?id=${id}&lang=en`, { user: 1 });
    assert.equal(r.status, 200);
    assert.equal(r.body.tasks.length, 15);
    assert.equal(r.body.answers.length, 15);
  });

  it('Konto löschen entfernt Versuche, Profil und Gruppen (Cascade)', async () => {
    await profile(1, 'Anna');
    await call('POST', '/groups/create', { user: 1, body: { name: 'Solo' } });
    await play(1, dailyId(DAY), (t) => t.expected);
    await db.query('delete from public.users where id = $1', [U(1)]);
    const r = await db.query<{ a: number; p: number; g: number }>(`select
      (select count(*) from public.challenge_attempts)::int as a, (select count(*) from public.challenge_profiles)::int as p,
      (select count(*) from public.challenge_groups)::int as g`);
    assert.deepEqual(r.rows[0], { a: 0, p: 0, g: 0 });
  });

  it('Fehler: unbekannte Route, ungültiges Token, ungültige IDs, Rate-Limit', async () => {
    assert.equal((await call('GET', '/nope')).status, 404);
    const req = new Request('https://mm.test/api/challenge/today', { headers: { Authorization: 'Bearer invalid-token-xxxxxxxxxxxx' } });
    assert.equal((await handleChallenge(req, {}, deps())).status, 401);
    assert.equal((await call('GET', '/info?id=x')).status, 400);
    assert.equal((await call('POST', '/start', { user: 1, body: { id: 'daily-2026-13-01' } })).status, 400);
    assert.equal((await call('POST', '/groups/leave', { user: 1, body: { id: 'x' } })).status, 400);
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await call('GET', '/nope', { ip: '10.9.9.9' })).status;
    assert.equal(last, 429);
  });
});
