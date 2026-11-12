// sql/007_league.sql (v9 K): Text (idempotent, RLS, Rechte) und Verhalten in PGlite (Zuwachs-Grenze, Champions)
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'packages/passkey-auth/tests/helpers/supabase-sim.sql'), 'utf8');
const AUTH_SQL = readFileSync(join(root, 'packages/passkey-auth/sql/001_passkey_auth.sql'), 'utf8');
const CHALLENGES = readFileSync(join(root, 'sql/006_challenges.sql'), 'utf8');
const SQL = readFileSync(join(root, 'sql/007_league.sql'), 'utf8');

describe('007_league.sql (Text)', () => {
  const code = SQL.replace(/--.*$/gm, '');
  it('nur hinzufügend und idempotent', () => {
    assert.match(code, /create table if not exists public\.league_scores/);
    assert.match(code, /create index if not exists league_scores_rating/);
    for (const fn of ['league_put', 'league_champions']) assert.match(code, new RegExp(`create or replace function public\\.${fn}\\(`));
    assert.doesNotMatch(code, /\bdrop\s+(table|function|column)\b/i);
    assert.doesNotMatch(code, /\balter\s+table\s+public\.(?!league_scores)/i);
    assert.doesNotMatch(code, /\btruncate\b/i);
    assert.doesNotMatch(code, /create table (?!if not exists)/i);
  });
  it('Wertebereiche und Fremdschlüssel', () => {
    assert.match(code, /references public\.users\(id\) on delete cascade/);
    assert.match(code, /rating\s+integer not null check \(rating between 0 and 1000\)/);
    assert.match(code, /tier\s+smallint not null check \(tier between 0 and 15\)/);
  });
  it('RLS an, keine Policies, nur service_role', () => {
    assert.match(code, /alter table public\.league_scores enable row level security/);
    assert.doesNotMatch(code, /create policy/i);
    assert.match(code, /revoke all on public\.league_scores from anon, authenticated/);
    assert.match(code, /grant all on public\.league_scores to service_role/);
    assert.match(code, /revoke execute on function public\.%s from public, anon, authenticated/);
    assert.match(code, /grant execute on function public\.%s to service_role/);
    for (const sig of ['league_put(uuid, integer, smallint, integer)', 'league_champions(integer, integer, uuid, integer, integer)']) {
      assert.ok(code.includes(`'${sig}'`), sig);
    }
    assert.equal((code.match(/set search_path = ''/g) ?? []).length, 2);
  });
});

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
type Put = { rating: number; tier: number; capped: boolean };

async function put(n: number, rating: number, tier = 0): Promise<Put> {
  const r = await db.query<Put>('select * from public.league_put($1, $2, $3::smallint, 150)', [U(n), rating, tier]);
  return r.rows[0] as Put;
}
const champs = async (user: number | null, limit = 10) =>
  (await db.query<{ rank: string | null; display_name: string | null; rating: number; is_me: boolean; total: string }>(
    'select * from public.league_champions(780, $1, $2, 30, 3)', [limit, user ? U(user) : null])).rows;

let challengeSeq = 0;
/** `count` beendete gewertete Dailys, beendet vor `daysAgo` Tagen */
async function dailies(n: number, count: number, daysAgo = 1, status = 'finished'): Promise<void> {
  for (let i = 0; i < count; i++) {
    const id = `daily-2025-${String(1 + (challengeSeq % 12)).padStart(2, '0')}-${String(1 + Math.floor(challengeSeq / 12)).padStart(2, '0')}`;
    challengeSeq++;
    await db.query(`insert into public.challenges (id, kind, starts_at, ends_at, config, seed) values ($1, 'daily', now() - interval '2 days', now() + interval '2 days', '{}', 'seedseedseed')`, [id]);
    await db.query(`insert into public.challenge_attempts (challenge_id, user_id, started_at, finished_at, status, points) values ($1, $2, now(), now() - make_interval(days => $3), $4, 10)`, [id, U(n), daysAgo, status]);
  }
}

const score = (n: number, rating: number, ago = '1 hour') => db.query(
  `insert into public.league_scores (user_id, rating, tier, updated_at, day_key, day_start_rating) values ($1, $2, 15, now() - $3::interval, current_date, $2)`, [U(n), rating, ago]);

describe('007_league.sql (PGlite)', () => {
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
    await db.exec('delete from public.league_scores; delete from public.challenge_attempts; delete from public.challenges; delete from public.challenge_profiles; delete from public.users;');
    for (let n = 1; n <= 16; n++) await db.query('insert into public.users (id, username) values ($1, $2)', [U(n), `user${n}`]);
  });

  it('Rechte: anon/authenticated sehen Tabelle und Funktionen nicht', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(db.query('select * from public.league_scores'), /permission denied/);
        await assert.rejects(db.query(`select * from public.league_put('${U(1)}', 10, 0::smallint, 150)`), /permission denied/);
        await assert.rejects(db.query(`select * from public.league_champions(780, 10, null, 30, 3)`), /permission denied/);
      } finally { await db.exec('reset role'); }
    }
  });

  it('league_put: erste Meldung höchstens 150, am selben Tag kein Mehr, Abstieg sofort, Stufe bleibt bei Kürzung', async () => {
    assert.deepEqual(await put(1, 400, 8), { rating: 150, tier: 0, capped: true });
    assert.deepEqual(await put(1, 140, 0), { rating: 140, tier: 0, capped: false });
    assert.deepEqual(await put(1, 300, 6), { rating: 150, tier: 0, capped: true }); // Bezug Tagesbeginn 0
    // neuer Tag: Bezug ist die letzte Wertung
    await db.query(`update public.league_scores set day_key = day_key - 1, rating = 500, tier = 9 where user_id = $1`, [U(1)]);
    assert.deepEqual(await put(1, 700, 12), { rating: 650, tier: 9, capped: true });
    assert.deepEqual(await put(1, 640, 11), { rating: 640, tier: 11, capped: false });
    await assert.rejects(put(1, 1001, 15), /league: out of range/);
    await assert.rejects(put(1, 10, 16), /league: out of range/);
  });

  it('league_champions: Reihenfolge, Namen nur listed, eigene Zeile', async () => {
    for (let n = 1; n <= 6; n++) {
      await score(n, 900 - n * 10, `${n} minutes`);
      await dailies(n, 3);
    }
    await db.query('update public.league_scores set rating = 900 where user_id = $1', [U(2)]); // Nr. 2 überholt Nr. 1
    await db.query(`insert into public.challenge_profiles (user_id, display_name, listed) values ($1, 'Anna', true), ($2, 'Ben', false)`, [U(1), U(2)]);
    const rows = await champs(3);
    assert.deepEqual(rows.map((r) => Number(r.rank)), [1, 2, 3, 4, 5, 6]);
    assert.equal(rows[0]?.rating, 900);
    assert.equal(rows[0]?.display_name, null); // Ben nicht listed
    assert.equal(rows[1]?.display_name, 'Anna');
    assert.equal(rows[2]?.is_me, true);
    assert.equal(Number(rows[0]?.total), 6);
    assert.equal((await champs(null, 3)).length, 3);
    const ben = (await champs(2)).find((r) => r.is_me);
    assert.equal(ben?.display_name, 'Ben'); // die eigene Zeile zeigt den eigenen Namen
  });

  it('league_champions: Gleichstand -> früher gemeldet gewinnt; Ausschlüsse', async () => {
    await score(1, 850, '2 hours'); await score(2, 850, '5 hours'); await dailies(1, 3); await dailies(2, 3);
    await score(3, 999); await dailies(3, 2);                 // zu wenige gewertete Dailys
    await score(4, 999); await dailies(4, 3, 40);             // Dailys zu alt
    await score(5, 999, '40 days'); await dailies(5, 3);      // zu lange nicht gemeldet
    await score(6, 700); await dailies(6, 3);                 // kein Meister
    await score(7, 999); await dailies(7, 3, 1, 'flagged');   // markierte zählen nicht
    await score(8, 999);                                      // gar keine Dailys
    const rows = await champs(null);
    assert.deepEqual(rows.map((r) => r.rating), [850, 850]);
    assert.deepEqual(rows.map((r) => Number(r.rank)), [1, 2]);
    assert.deepEqual(rows.map((r) => r.is_me), [false, false]);
    // Eigene Zeile ohne Rang, wenn sie (noch) nicht zählt
    const mine = (await champs(3)).find((r) => r.is_me);
    assert.equal(mine?.rank, null);
    assert.equal(mine?.rating, 999);
    assert.equal(Number(mine?.total), 2);
  });
});
