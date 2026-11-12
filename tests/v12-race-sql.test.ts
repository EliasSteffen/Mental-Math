// sql/008_races.sql (v12 R2): Text (idempotent, RLS, Rechte) und Verhalten in PGlite, dazu die Routen gegen das echte SQL
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { _resetChallengeState, handleChallenge } from '../server/challenge.ts';
import { DbError } from '../server/challenge-store.ts';
import type { Rpc } from '../server/challenge-store.ts';
import { raceTasks } from '../src/core/race.ts';
import type { RaceBoardRow, RaceInfo, RaceListItem } from '../src/core/race-api.ts';

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'packages/passkey-auth/tests/helpers/supabase-sim.sql'), 'utf8');
const AUTH_SQL = readFileSync(join(root, 'packages/passkey-auth/sql/001_passkey_auth.sql'), 'utf8');
const CHALLENGES = readFileSync(join(root, 'sql/006_challenges.sql'), 'utf8');
const SQL = readFileSync(join(root, 'sql/008_races.sql'), 'utf8');

const FUNCTIONS = [
  'race_create(text, uuid, uuid, text, jsonb, bigint, timestamptz, timestamptz, integer, integer)',
  'race_get(text, uuid)', 'race_list(uuid, uuid, timestamptz, integer)', 'race_board(text, uuid)', 'race_missing(text, uuid)',
  'race_run_start(text, uuid, timestamptz)',
  'race_run_finish(text, uuid, timestamptz, jsonb, integer, integer, integer, text)',
  'race_go(text, uuid, timestamptz, integer, integer)',
];

describe('008_races.sql (Text)', () => {
  const code = SQL.replace(/--.*$/gm, '');
  it('nur hinzufügend und idempotent', () => {
    for (const t of ['races', 'race_runs']) assert.match(code, new RegExp(`create table if not exists public\\.${t}\\b`));
    assert.match(code, /create index if not exists races_group/);
    for (const fn of FUNCTIONS) assert.match(code, new RegExp(`create or replace function public\\.${fn.split('(')[0]}\\(`));
    assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
    assert.doesNotMatch(code, /\balter\s+table\s+public\.(?!races\b|race_runs\b)/i);
    assert.doesNotMatch(code, /\btruncate\b/i);
    assert.doesNotMatch(code, /create table (?!if not exists)/i);
  });
  it('Spalten und Grenzen', () => {
    assert.match(code, /kind\s+text not null check \(kind in \('ghost', 'live'\)\)/);
    assert.match(code, /seed\s+bigint not null check \(seed between 0 and 4294967295\)/);
    assert.match(code, /starts_at\s+timestamptz,/);
    assert.match(code, /ends_at\s+timestamptz not null/);
    assert.match(code, /pg_column_size\(answers\) <= 32768/);
    assert.match(code, /status in \('running', 'finished', 'expired', 'flagged'\)/);
    assert.match(code, /primary key \(race_id, user_id\)/);
    assert.match(code, /references public\.challenge_groups\(id\) on delete cascade/);
    assert.match(code, /references public\.races\(id\) on delete cascade/);
  });
  it('RLS an, keine Policies, nur service_role, feste search_path', () => {
    for (const t of ['races', 'race_runs']) assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.doesNotMatch(code, /create policy/i);
    assert.match(code, /revoke all on public\.races, public\.race_runs from anon, authenticated/);
    assert.match(code, /grant all on public\.races, public\.race_runs to service_role/);
    assert.match(code, /revoke execute on function public\.%s from public, anon, authenticated/);
    assert.match(code, /grant execute on function public\.%s to service_role/);
    for (const sig of FUNCTIONS) assert.ok(code.includes(`'${sig}'`), sig);
    assert.equal((code.match(/set search_path = ''/g) ?? []).length, FUNCTIONS.length);
  });
  it('Mitgliedschaft wird in jeder Funktion geprüft', () => {
    for (const fn of FUNCTIONS) {
      const name = fn.split('(')[0] ?? '';
      const start = code.indexOf(`function public.${name}(`);
      const end = code.indexOf('create or replace function', start + 10);
      const body = code.slice(start, end === -1 ? undefined : end);
      assert.match(body, /challenge_group_members/, name);
    }
  });
});

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const T0 = Date.parse('2026-11-11T12:00:00Z');
const CFG = { durationS: 30, cat: 'mult', lvl: 2 };
let db: PGlite;
let now = T0;

/** Wie supabase.rpc: benannte Argumente; jsonb als JSON-Text */
const rpc: Rpc = async (fn, args) => {
  const keys = Object.keys(args);
  const values = keys.map((k) => {
    const v = args[k];
    if (v === undefined) return null;
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
const iso = (t: number): string => new Date(t).toISOString();
const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<T>(sql, params)).rows[0] as T;

async function create(id: string, user = 1, kind = 'ghost', group = G, openMs = 86_400_000, maxOpen = 5): Promise<{ outcome: string; id: string | null }> {
  return one('select * from public.race_create($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 120)', [
    id, group, U(user), kind, JSON.stringify(CFG), 4_000_000_000, iso(now), iso(now + (kind === 'live' ? 900_000 : openMs)), maxOpen]);
}
const start = (id: string, user: number, at = now) => one<{ outcome: string; started_at: Date | null; status: string | null }>(
  'select * from public.race_run_start($1, $2, $3)', [id, U(user), iso(at)]);
const finish = (id: string, user: number, steps: unknown[], correct: number, wrong: number, lastOk: number, status = 'finished') => one<{
  outcome: string; status: string | null; correct: number | null; wrong: number | null; last_ok_ms: number | null; started_at: Date | null;
}>('select * from public.race_run_finish($1, $2, $3, $4::jsonb, $5, $6, $7, $8)', [id, U(user), iso(now), JSON.stringify(steps), correct, wrong, lastOk, status]);
const board = async (id: string, user: number) => (await db.query<{
  rank: string; display_name: string | null; is_me: boolean; correct: number; wrong: number; last_ok_ms: number; status: string; steps: unknown;
}>('select * from public.race_board($1, $2)', [id, U(user)])).rows;

describe('008_races.sql (PGlite)', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SIM);
    await db.exec(AUTH_SQL);
    await db.exec(CHALLENGES);
    await db.exec(SQL);
    await db.exec(SQL); // Idempotenz
  });
  after(async () => { await db.close(); });
  beforeEach(async () => {
    now = T0;
    _resetChallengeState();
    await db.exec('delete from public.race_runs; delete from public.races; delete from public.challenge_group_members; delete from public.challenge_groups; delete from public.challenge_profiles; delete from public.users;');
    for (let n = 1; n <= 5; n++) await db.query('insert into public.users (id, username) values ($1, $2)', [U(n), `user${n}`]);
    await db.query(`insert into public.challenge_groups (id, name, code, owner_id) values ($1, 'Klasse 7a', 'ABC234', $2), ($3, 'Andere', 'XYZ234', $4)`, [G, U(1), G2, U(4)]);
    await db.query('insert into public.challenge_group_members (group_id, user_id) values ($1, $2), ($1, $3), ($1, $4), ($5, $6)', [G, U(1), U(2), U(3), G2, U(4)]);
    for (const [n, name] of [[1, 'Anna'], [2, 'Ben'], [3, 'Cleo'], [4, 'Dora']] as const) {
      await db.query('insert into public.challenge_profiles (user_id, display_name, listed) values ($1, $2, false)', [U(n), name]);
    }
  });

  it('Rechte: anon/authenticated sehen Tabellen und Funktionen nicht', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query('select * from public.races'), /permission denied/);
        await assert.rejects(db.query('select * from public.race_runs'), /permission denied/);
        await assert.rejects(db.query(`select * from public.race_get('abcdefghjkmn', '${U(1)}')`), /permission denied/);
        await assert.rejects(db.query(`select * from public.race_go('abcdefghjkmn', '${U(1)}', now(), 5000, 60000)`), /permission denied/);
      } finally { await db.exec('reset role'); }
    }
  });

  it('Tabellen: Wertebereiche', async () => {
    await create('abcdefghjkmn');
    await assert.rejects(db.query(`insert into public.races (id, group_id, kind, config, seed, ends_at) values ('BAD', $1, 'ghost', '{}', 1, now() + interval '1 day')`, [G]), /check/);
    await assert.rejects(db.query(`insert into public.races (id, group_id, kind, config, seed, ends_at) values ('abcdefghjkmx', $1, 'duell', '{}', 1, now() + interval '1 day')`, [G]), /check/);
    await assert.rejects(db.query(`insert into public.races (id, group_id, kind, config, seed, ends_at) values ('abcdefghjkmx', $1, 'ghost', '{}', 4294967296, now() + interval '1 day')`, [G]), /check/);
    await assert.rejects(db.query(`insert into public.races (id, group_id, kind, config, seed, starts_at, ends_at) values ('abcdefghjkmx', $1, 'ghost', '{}', 1, now(), now() + interval '1 day')`, [G]), /check/);
    await start('abcdefghjkmn', 1);
    await assert.rejects(finish('abcdefghjkmn', 1, [], 0, 0, 0, 'ok'), /race: bad status/);
  });

  it('race_create: Mitglied, höchstens 5 offene je Gruppe, nur offene zählen, Aufräumen alter Rennen', async () => {
    assert.deepEqual(await create('aaaaaaaaaaa1', 4), { outcome: 'not_member', id: null });
    for (let i = 1; i <= 5; i++) assert.equal((await create(`aaaaaaaaaaa${i}`, 1)).outcome, 'created');
    assert.equal((await create('aaaaaaaaaaa6', 2)).outcome, 'too_many');
    assert.equal((await create('aaaaaaaaaaa7', 4, 'ghost', G2)).outcome, 'created'); // andere Gruppe
    await db.query(`update public.races set ends_at = created_at + interval '1 minute' where id = 'aaaaaaaaaaa1'`);
    now += 120_000;
    assert.equal((await create('aaaaaaaaaaa8', 2)).outcome, 'created'); // aaaaaaaaaaa1 ist abgelaufen
    // alte Rennen (Ende vor mehr als 120 Tagen) verschwinden beim Anlegen
    await db.query(`update public.races set created_at = created_at - interval '200 days', ends_at = ends_at - interval '200 days' where id = 'aaaaaaaaaaa2'`);
    now += 1000;
    await create('aaaaaaaaaaa9', 2);
    assert.equal((await db.query(`select 1 from public.races where id = 'aaaaaaaaaaa2'`)).rows.length, 0);
  });

  it('race_get: Mitglieder sehen alles samt eigenem Lauf, Fremde nur die Mitgliedschaft', async () => {
    await create('abcdefghjkmn', 1);
    const m = await one<{ member: boolean; created_by_name: string; seed: string; my_status: string | null }>(`select * from public.race_get('abcdefghjkmn', $1)`, [U(2)]);
    assert.deepEqual([m.member, m.created_by_name, Number(m.seed), m.my_status], [true, 'Anna', 4_000_000_000, null]);
    await start('abcdefghjkmn', 2);
    assert.equal((await one<{ my_status: string }>(`select * from public.race_get('abcdefghjkmn', $1)`, [U(2)])).my_status, 'running');
    const f = await one<Record<string, unknown>>(`select * from public.race_get('abcdefghjkmn', $1)`, [U(4)]);
    assert.equal(f.member, false);
    assert.equal(f.id, 'abcdefghjkmn');
    for (const k of ['created_by', 'created_by_name', 'kind', 'config', 'seed', 'created_at', 'starts_at', 'ends_at', 'my_status', 'my_started_at']) assert.equal(f[k], null, k);
    assert.equal((await db.query(`select * from public.race_get('zzzzzzzzzzzz', $1)`, [U(1)])).rows.length, 0);
  });

  it('race_run_start: ein Lauf je Person, Zeitraum, Fremde', async () => {
    await create('abcdefghjkmn', 1);
    const a = await start('abcdefghjkmn', 2);
    assert.deepEqual([a.outcome, a.started_at?.getTime(), a.status], ['created', now, 'running']);
    const b = await start('abcdefghjkmn', 2, now + 5000);
    assert.deepEqual([b.outcome, b.started_at?.getTime(), b.status], ['already', now, 'running']); // Startzeit bleibt
    assert.equal((await start('abcdefghjkmn', 4)).outcome, 'not_member');
    assert.equal((await start('zzzzzzzzzzzz', 1)).outcome, 'not_found');
    assert.equal((await start('abcdefghjkmn', 3, now + 86_400_000)).outcome, 'closed');
    assert.equal((await start('abcdefghjkmn', 3, now + 86_399_999)).outcome, 'created');
  });

  it('race_run_finish: einmal, danach unveränderlich; Geister brauchen einen Start', async () => {
    await create('abcdefghjkmn', 1);
    assert.equal((await finish('abcdefghjkmn', 2, [], 0, 0, 0)).outcome, 'no_run');
    assert.equal((await finish('abcdefghjkmn', 4, [], 0, 0, 0)).outcome, 'not_member');
    assert.equal((await finish('zzzzzzzzzzzz', 1, [], 0, 0, 0)).outcome, 'not_found');
    await start('abcdefghjkmn', 2);
    const a = await finish('abcdefghjkmn', 2, [[1000, 1], [2000, 0]], 1, 1, 1000);
    assert.deepEqual([a.outcome, a.status, a.correct, a.wrong, a.last_ok_ms], ['saved', 'finished', 1, 1, 1000]);
    const b = await finish('abcdefghjkmn', 2, [[1000, 1], [2000, 1]], 2, 0, 2000);
    assert.deepEqual([b.outcome, b.status, b.correct, b.wrong, b.last_ok_ms], ['already', 'finished', 1, 1, 1000]);
    await start('abcdefghjkmn', 3);
    await assert.rejects(db.query(`select * from public.race_run_finish('abcdefghjkmn', $1, now(), $2::jsonb, 1000, 0, 0, 'finished')`, [U(3), '[]']), /check/);
  });

  it('race_board: nur gewertete Läufe, Rang mit Gleichstand, Namen für Mitglieder, nichts für Fremde', async () => {
    await create('abcdefghjkmn', 1);
    for (const n of [1, 2, 3]) await start('abcdefghjkmn', n);
    await finish('abcdefghjkmn', 1, [[1000, 1], [2000, 1], [3000, 0]], 2, 1, 2000);
    await finish('abcdefghjkmn', 2, [[1500, 1], [2500, 1]], 2, 0, 2500);
    await finish('abcdefghjkmn', 3, [[1000, 1]], 1, 0, 1000, 'flagged');
    const rows = await board('abcdefghjkmn', 1);
    assert.deepEqual(rows.map((r) => [Number(r.rank), r.display_name, r.is_me, r.correct, r.wrong, r.status]), [
      [1, 'Ben', false, 2, 0, 'finished'], [2, 'Anna', true, 2, 1, 'finished'],
    ]);
    assert.deepEqual(rows[0]?.steps, [[1500, 1], [2500, 1]]);
    assert.equal((await board('abcdefghjkmn', 4)).length, 0);
    // Gleichstand in allen drei Werten teilt den Rang
    await db.query(`update public.race_runs set correct = 2, wrong = 0, last_ok_ms = 2500 where user_id = $1`, [U(1)]);
    assert.deepEqual((await board('abcdefghjkmn', 1)).map((r) => Number(r.rank)), [1, 1]);
  });

  it('race_missing: Mitglieder ohne gewerteten Lauf, nur für Mitglieder', async () => {
    await create('abcdefghjkmn', 1);
    const missing = async (user: number) => (await db.query<{ display_name: string }>('select * from public.race_missing($1, $2)', ['abcdefghjkmn', U(user)])).rows.map((r) => r.display_name);
    assert.deepEqual(await missing(1), ['Anna', 'Ben', 'Cleo']);
    await start('abcdefghjkmn', 2);
    await finish('abcdefghjkmn', 2, [[1000, 1]], 1, 0, 1000);
    await start('abcdefghjkmn', 3);
    await finish('abcdefghjkmn', 3, [[1000, 1]], 1, 0, 1000, 'flagged');
    assert.deepEqual(await missing(1), ['Anna', 'Cleo']); // ein markierter Lauf zählt nicht als gespielt
    assert.deepEqual(await missing(4), []);
  });

  it('race_list: offene zuerst, dann beendete mit Lauf (höchstens p_ended), eigener Status, nur Mitglieder', async () => {
    await create('aaaaaaaaaaa1', 1, 'ghost', G, 3_600_000);
    await create('aaaaaaaaaaa2', 2, 'ghost', G, 7_200_000);
    await create('aaaaaaaaaaa3', 2, 'live', G);
    await start('aaaaaaaaaaa1', 1);
    await finish('aaaaaaaaaaa1', 1, [[1000, 1]], 1, 0, 1000);
    const list = async (user: number, at: number, ended = 10) => (await db.query<{ id: string; my_status: string | null; runs: string; created_by_name: string | null }>(
      'select * from public.race_list($1, $2, $3, $4)', [G, U(user), iso(at), ended])).rows;
    assert.deepEqual((await list(1, now)).map((r) => [r.id, r.my_status, Number(r.runs)]), [
      ['aaaaaaaaaaa3', null, 0], ['aaaaaaaaaaa1', 'finished', 1], ['aaaaaaaaaaa2', null, 0],
    ]); // nach ends_at: Live-Lobby (15 min) vor 1 h vor 2 h
    assert.equal((await list(1, now))[0]?.created_by_name, 'Ben');
    assert.equal((await list(4, now)).length, 0);
    // nach 1 h: aaaaaaaaaaa1 und die Lobby sind vorbei; beendet erscheint nur das mit Lauf
    const later = await list(2, now + 3_700_000);
    assert.deepEqual(later.map((r) => r.id), ['aaaaaaaaaaa2', 'aaaaaaaaaaa1']);
    assert.equal((await list(2, now + 3_700_000, 0)).length, 1);
  });

  it('race_go: einmal, nur Live, nur Mitglieder, nur solange die Lobby offen ist; Ende = Start + Dauer + 60 s', async () => {
    await create('abcdefghjkmn', 1, 'live');
    await create('ghostghost22', 1, 'ghost');
    const go = (id: string, user: number, at = now) => one<{ outcome: string; starts_at: Date | null }>('select * from public.race_go($1, $2, $3, 5000, 60000)', [id, U(user), iso(at)]);
    assert.equal((await go('abcdefghjkmn', 4)).outcome, 'not_member');
    assert.equal((await go('ghostghost22', 1)).outcome, 'not_live');
    assert.equal((await go('zzzzzzzzzzzz', 1)).outcome, 'not_found');
    // vor go: Start nicht möglich, Abgabe nicht möglich
    assert.equal((await start('abcdefghjkmn', 1)).outcome, 'upcoming');
    assert.equal((await finish('abcdefghjkmn', 1, [], 0, 0, 0)).outcome, 'not_started');
    const r = await go('abcdefghjkmn', 2);
    assert.deepEqual([r.outcome, r.starts_at?.getTime()], ['set', now + 5000]);
    const row = await one<{ starts_at: Date; ends_at: Date }>(`select starts_at, ends_at from public.races where id = 'abcdefghjkmn'`);
    assert.equal(row.ends_at.getTime(), now + 5000 + 30_000 + 60_000);
    const again = await go('abcdefghjkmn', 1, now + 1000);
    assert.deepEqual([again.outcome, again.starts_at?.getTime()], ['already', now + 5000]);
    // Lauf: started_at = starts_at, auch bei Start nach go; Abgabe ohne Start legt den Lauf an
    const s = await start('abcdefghjkmn', 1, now + 1000);
    assert.deepEqual([s.outcome, s.started_at?.getTime()], ['created', now + 5000]);
    const f = await finish('abcdefghjkmn', 3, [[1500, 1]], 1, 0, 1500);
    assert.deepEqual([f.outcome, f.started_at?.getTime()], ['saved', now + 5000]);
    // verfallene Lobby
    await create('lobbylobby22', 1, 'live');
    assert.equal((await go('lobbylobby22', 1, now + 900_000)).outcome, 'closed');
  });

  it('Löschen der Gruppe räumt Rennen und Läufe ab', async () => {
    await create('abcdefghjkmn', 1);
    await start('abcdefghjkmn', 2);
    await db.query('delete from public.challenge_groups where id = $1', [G]);
    assert.equal((await db.query('select 1 from public.races')).rows.length, 0);
    assert.equal((await db.query('select 1 from public.race_runs')).rows.length, 0);
  });

  it('Routen gegen das echte SQL: anlegen, spielen, Rangliste, Liste', async () => {
    const tokens: Record<string, string> = { 'token-of-user-1-xxxxxxxx': U(1), 'token-of-user-2-xxxxxxxx': U(2), 'token-of-user-4-xxxxxxxx': U(4) };
    let seq = 0;
    const call = async <T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, user: number, body?: unknown): Promise<{ status: number; body: T }> => {
      const headers: Record<string, string> = { 'CF-Connecting-IP': `10.1.${user}.${(seq += 1) % 250}`, Authorization: `Bearer token-of-user-${user}-xxxxxxxx` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await handleChallenge(new Request(`https://mm.test/api/challenge${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), {}, {
        rpc, now: () => now, verify: async (t) => tokens[t] ?? null, random: () => ((seq = (seq * 9301 + 49297) % 233280) / 233280),
      });
      return { status: res.status, body: (await res.json()) as T };
    };
    const made = await call<{ race: RaceInfo }>('POST', '/race/create', 1, { groupId: G, kind: 'ghost', config: CFG, open: '1h' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const race = made.body.race;
    assert.deepEqual([race.createdByName, race.config, race.kind, race.startsAt], ['Anna', CFG, 'ghost', null]);
    assert.equal(Date.parse(race.endsAt) - now, 3_600_000);
    assert.equal((await call('POST', '/race/create', 4, { groupId: G, kind: 'ghost', config: CFG })).status, 403);
    assert.equal((await call('POST', `/race/${race.id}/start`, 2)).status, 201);
    assert.equal((await call('POST', `/race/${race.id}/start`, 2)).status, 409);
    now += 40_000;
    const tasks = raceTasks(race.seed, race.config, 4);
    const answers = tasks.map((t, i) => ({ i, input: t.expected, ms: 1500 + i * 1500 }));
    const fin = await call('POST', `/race/${race.id}/finish`, 2, { answers });
    assert.deepEqual(fin.body, { rank: 1, correct: 4, wrong: 0, status: 'finished' });
    const view = await call<{ board: RaceBoardRow[]; me: { status: string } }>('GET', `/race/${race.id}`, 1);
    assert.deepEqual(view.body.board.map((b) => [b.name, b.correct, b.steps.length]), [['Ben', 4, 4]]);
    assert.deepEqual((view.body as unknown as { missing: string[] }).missing, ['Anna', 'Cleo']);
    assert.equal(view.body.me, null);
    assert.equal((await call('GET', `/race/${race.id}`, 4)).status, 403);
    const list = await call<{ races: RaceListItem[] }>('GET', `/race/list?group=${G}`, 1);
    assert.deepEqual(list.body.races.map((r) => [r.id, r.runs, r.myStatus]), [[race.id, 1, 'none']]);
    // Live
    const live = (await call<{ race: RaceInfo }>('POST', '/race/create', 1, { groupId: G, kind: 'live', config: CFG })).body.race;
    const go = await call<{ startsAt: string }>('POST', `/race/${live.id}/go`, 2);
    assert.equal(go.status, 200);
    assert.equal(Date.parse(go.body.startsAt), now + 5000);
    assert.equal((await call('POST', `/race/${live.id}/go`, 1)).status, 409);
  });
});
