import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
type Role = 'service_role' | 'authenticated' | 'anon';

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'packages/passkey-auth/tests/helpers/supabase-sim.sql'), 'utf8');
const AUTH = readFileSync(join(root, 'packages/passkey-auth/sql/001_passkey_auth.sql'), 'utf8');
const GUARD = readFileSync(join(root, 'packages/offline-sync/sql/offline_sync_guard.sql'), 'utf8');
const DATA = readFileSync(join(root, 'sql/002_training_data.sql'), 'utf8');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const UUID = '123e4567-e89b-42d3-a456-426614174000';

let db: PGlite;

/** Führt fn in einer Transaktion unter der Rolle aus; rollt immer zurück. */
async function as<T>(role: Role, sub: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await db
    .transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      if (sub) await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub })]);
      result = await fn(tx);
      await tx.rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Error) || !/rollback/i.test(e.message)) throw e;
    });
  return result as T;
}

async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof Error && pattern.test(e.message));
}

/** Upsert wie PostgREST: insert … on conflict (user_id,id) do update. */
const upsertSession = (tx: Tx, user: string, id: string, updatedAt: number, rev = 1, device = 'd1', score = 10) =>
  tx.query(
    `insert into public.training_sessions (user_id,id,mode,score,correct_answers,total_questions,duration_ms,avg_time_ms,created_at,updated_at,device_id,rev)
     values ($1,$2,'all',$6,1,1,1000,1000,now(),$3,$5,$4)
     on conflict (user_id,id) do update set mode=excluded.mode, score=excluded.score, correct_answers=excluded.correct_answers,
       total_questions=excluded.total_questions, duration_ms=excluded.duration_ms, avg_time_ms=excluded.avg_time_ms,
       created_at=excluded.created_at, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, device_id=excluded.device_id, rev=excluded.rev`,
    [user, id, updatedAt, rev, device, score],
  );

const upsertResult = (tx: Tx, user: string, id: string) =>
  tx.query(
    `insert into public.training_results (user_id,id,session_id,created_at,mode,category,subtype,correct,error_type,time_ms,target_ms,points,level,payload,updated_at,device_id,rev)
     values ($1,$2,'s1',now(),'all','pct','pct.of',true,null,100,200,5,2,'{"prompt":"x"}',1,'d1',1)
     on conflict (user_id,id) do update set points=excluded.points`,
    [user, id],
  );

const upsertDoc = (tx: Tx, user: string, name: string, updatedAt = 1, device = 'd1') =>
  tx.query(
    `insert into public.user_documents (user_id,name,data,updated_at,device_id) values ($1,$2,'{}',$3,$4)
     on conflict (user_id,name) do update set data=excluded.data, updated_at=excluded.updated_at, device_id=excluded.device_id`,
    [user, name, updatedAt, device],
  );

const count = async (tx: Tx, table: string): Promise<number> =>
  (await tx.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0]?.n ?? -1;

async function seedUsers(): Promise<void> {
  await db.exec('truncate public.users cascade');
  // service_role-Aufruf als Superuser (Rollenwechsel nicht nötig, Funktion ist security definer)
  for (const [id, name] of [[A, 'alice'], [B, 'bob']] as const) {
    await db.query(`select public.pa_create_user_with_passkey($1,$2,$3,'pk',0,'internal','multiDevice',true)`, [id, name, `cred-${name}`]);
  }
}

/** Wie as(), aber mit Commit (für Tests, die Folgezustand prüfen). */
async function asCommit(sub: string, sql: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub })]);
    await tx.query(sql);
  });
}

describe('training data SQL', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SIM);
    await db.exec(AUTH);
    await db.exec(GUARD);
    await db.exec(DATA);
    await db.exec(DATA); // Idempotenz
  });
  beforeEach(seedUsers);

  it('A schreibt/upsertet eigene Zeilen, B sieht sie nicht', async () => {
    await as('authenticated', A, async (tx) => {
      await upsertSession(tx, A, 's1', 10);
      await upsertSession(tx, A, 's1', 20, 2);
      await upsertResult(tx, A, 'r1');
      await upsertDoc(tx, A, 'settings');
      assert.equal(await count(tx, 'training_sessions'), 1);
      assert.equal(await count(tx, 'training_results'), 1);
      assert.equal(await count(tx, 'user_documents'), 1);
    });
    await db.query(`insert into public.training_sessions (user_id,id,mode,score,correct_answers,total_questions,duration_ms,avg_time_ms,created_at,updated_at,device_id,rev)
      values ($1,'sA','all',1,1,1,1,1,now(),1,'d',1)`, [A]);
    await as('authenticated', B, async (tx) => {
      assert.equal(await count(tx, 'training_sessions'), 0);
      assert.equal(await count(tx, 'training_results'), 0);
    });
  });

  it('fremde user_id wird beim Insert abgewiesen', async () => {
    await as('authenticated', A, async (tx) => {
      await rejects(upsertSession(tx, B, 's1', 1), /row-level security/i);
    });
    await as('authenticated', A, async (tx) => {
      await rejects(upsertDoc(tx, B, 'settings'), /row-level security/i);
    });
  });

  it('anon hat keinen Zugriff', async () => {
    await as('anon', null, async (tx) => {
      await rejects(tx.query('select * from public.training_sessions'), /permission denied/i);
    });
    await as('anon', null, async (tx) => {
      await rejects(upsertResult(tx, A, 'r1'), /permission denied/i);
    });
  });

  it('LWW: älterer Stand ändert nichts, neuerer ja, server_updated_at steigt', async () => {
    await db.query(`insert into public.training_sessions (user_id,id,mode,score,correct_answers,total_questions,duration_ms,avg_time_ms,created_at,updated_at,device_id,rev,server_updated_at)
      values ($1,'s1','all',10,1,1,1,1,now(),100,'d1',1,'2000-01-01')`, [A]);
    await as('authenticated', A, async (tx) => {
      const get = async () => (await tx.query<{ score: number; sua: string }>(`select score, server_updated_at::text as sua from public.training_sessions where id='s1'`)).rows[0]!;
      const before = await get();
      await upsertSession(tx, A, 's1', 50, 9, 'd9', 99); // älter
      assert.deepEqual(await get(), before);
      await upsertSession(tx, A, 's1', 100, 1, 'd1', 77); // identisch (updated_at, rev, device_id)
      assert.deepEqual(await get(), before);
      await upsertSession(tx, A, 's1', 200, 2, 'd1', 42); // neuer
      const after = await get();
      assert.equal(after.score, 42);
      // now() hat in PGlite ggf. nur ms-Auflösung → nie kleiner; Gleichstände löst der Keyset-Cursor über id auf
      assert.ok(new Date(after.sua) >= new Date(before.sua));
      await upsertSession(tx, A, 's1', 200, 3, 'd0', 43); // Gleichstand updated_at -> rev entscheidet
      assert.equal((await get()).score, 43);
    });
  });

  it('user_documents: Namensregel', async () => {
    await as('authenticated', A, async (tx) => {
      await upsertDoc(tx, A, `activity:${UUID}`);
      await upsertDoc(tx, A, 'chainBest');
      await upsertDoc(tx, A, 'wipe');
      for (const bad of ['profile', 'activity:xyz']) {
        await tx.exec('savepoint s');
        await rejects(upsertDoc(tx, A, bad), /check constraint/i);
        await tx.exec('rollback to savepoint s');
      }
      assert.equal(await count(tx, 'user_documents'), 3);
      await upsertDoc(tx, A, 'chainBest', 0); // älter -> No-op
      await upsertDoc(tx, A, 'chainBest', 5, 'd2');
    });
  });

  it('authenticated darf nicht löschen', async () => {
    await db.query(`insert into public.user_documents (user_id,name,data,updated_at,device_id) values ($1,'settings','{}',1,'d')`, [A]);
    await as('authenticated', A, async (tx) => {
      await rejects(tx.query('delete from public.user_documents'), /permission denied/i);
    });
  });

  it('mm_delete_my_data löscht nur die Daten von A', async () => {
    for (const u of [A, B]) {
      await db.query(`insert into public.user_documents (user_id,name,data,updated_at,device_id) values ($1,'settings','{}',1,'d')`, [u]);
      await db.query(`insert into public.training_sessions (user_id,id,mode,score,correct_answers,total_questions,duration_ms,avg_time_ms,created_at,updated_at,device_id,rev)
        values ($1,'s1','all',1,1,1,1,1,now(),1,'d',1)`, [u]);
    }
    await asCommit(A, 'select public.mm_delete_my_data()');
    const n = (t: string, u: string) => db.query<{ n: number }>(`select count(*)::int as n from public.${t} where user_id=$1`, [u]);
    assert.equal((await n('user_documents', A)).rows[0]?.n, 0);
    assert.equal((await n('training_sessions', A)).rows[0]?.n, 0);
    assert.equal((await n('training_sessions', B)).rows[0]?.n, 1);
    assert.equal((await n('user_documents', B)).rows[0]?.n, 1);
    await as('anon', null, async (tx) => { await rejects(tx.query('select public.mm_delete_my_data()'), /permission denied/i); });
    await as('authenticated', null, async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', '{}', true)`);
      await rejects(tx.query('select public.mm_delete_my_data()'), /not_authenticated/);
    });
  });

  it('pa_delete_account kaskadiert auf Trainingsdaten', async () => {
    await db.query(`insert into public.user_documents (user_id,name,data,updated_at,device_id) values ($1,'settings','{}',1,'d')`, [A]);
    await db.query(`insert into public.training_sessions (user_id,id,mode,score,correct_answers,total_questions,duration_ms,avg_time_ms,created_at,updated_at,device_id,rev)
      values ($1,'s1','all',1,1,1,1,1,now(),1,'d',1)`, [A]);
    await as('authenticated', A, async (tx) => {
      await tx.query('select public.pa_delete_account()');
      await tx.exec('reset role');
      assert.equal(await count(tx, 'user_documents'), 0);
      assert.equal(await count(tx, 'training_sessions'), 0);
    });
  });
});
