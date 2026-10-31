import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
type Role = 'service_role' | 'authenticated' | 'anon';

const SIM = readFileSync(join(import.meta.dirname, 'helpers/supabase-sim.sql'), 'utf8');
const SCHEMA = readFileSync(join(import.meta.dirname, '../sql/001_passkey_auth.sql'), 'utf8');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

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

const createUser = (tx: Tx, id: string, name: string, cred: string): Promise<unknown> =>
  tx.query(`select public.pa_create_user_with_passkey($1,$2,$3,'pk',0,'internal','multiDevice',true)`, [id, name, cred]);

/** Basisdaten (als Superuser) für Rollen-Tests: A und B mit je einem Passkey. */
async function seedBase(): Promise<void> {
  await db.exec(`truncate public.users, public.auth_challenges cascade`);
  await createUser(db as unknown as Tx, A, 'alice', 'cred-a1');
  await createUser(db as unknown as Tx, B, 'bob', 'cred-b1');
}

describe('passkey-auth SQL', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SIM);
    await db.exec(SCHEMA);
    await db.exec(SCHEMA); // Idempotenz
  });

  it('service_role: legt User und Passkey an, doppelte credential_id scheitert', async () => {
    await as('service_role', null, async (tx) => {
      await createUser(tx, A, 'alice', 'cred-1');
      const u = await tx.query<{ username: string }>('select username from public.users');
      const p = await tx.query<{ credential_id: string; name: string | null }>('select credential_id, name from public.passkeys');
      assert.equal(u.rows.length, 1);
      assert.equal(p.rows[0]?.credential_id, 'cred-1');
      assert.equal(p.rows[0]?.name, null);
      await tx.exec('savepoint s');
      await rejects(createUser(tx, B, 'bob', 'cred-1'), /duplicate key|unique/i);
      await tx.exec('rollback to savepoint s');
      const n = await tx.query<{ n: number }>('select count(*)::int as n from public.users');
      assert.equal(n.rows[0]?.n, 1);
    });
  });

  it('RLS: A sieht nur eigene Zeilen, B nichts von A', async () => {
    await seedBase();
    await as('authenticated', A, async (tx) => {
      const u = await tx.query<{ id: string }>('select id from public.users');
      const p = await tx.query<{ user_id: string }>('select user_id from public.passkeys');
      assert.deepEqual(u.rows.map((r) => r.id), [A]);
      assert.deepEqual(p.rows.map((r) => r.user_id), [A]);
    });
    await as('authenticated', B, async (tx) => {
      const u = await tx.query<{ id: string }>('select id from public.users where id = $1', [A]);
      const p = await tx.query<{ user_id: string }>('select user_id from public.passkeys where user_id = $1', [A]);
      assert.equal(u.rows.length, 0);
      assert.equal(p.rows.length, 0);
    });
  });

  it('authenticated: verbotene Operationen', async () => {
    await seedBase();
    const denied = /permission denied/i;
    const stmts = [
      `insert into public.passkeys (user_id, credential_id, public_key) values ('${A}', 'evil', 'pk')`,
      `update public.passkeys set public_key = 'x'`,
      `update public.passkeys set counter = 5`,
      `update public.users set id = gen_random_uuid()`,
      `select * from public.auth_challenges`,
      `select * from public.auth_sessions`,
      `select * from public.pa_consume_challenge(gen_random_uuid(), 'login')`,
      `select public.pa_create_user_with_passkey(gen_random_uuid(), 'zed', 'c9', 'pk', 0, null, null, false)`,
      `select * from public.pa_rotate_session('a', 'b', now())`,
    ];
    for (const sql of stmts) {
      await as('authenticated', A, (tx) => rejects(tx.exec(sql), denied));
    }
  });

  it('authenticated: eigenen name/username ändern, fremde Zeilen nicht', async () => {
    await seedBase();
    await as('authenticated', A, async (tx) => {
      const own = await tx.query(`update public.passkeys set name = 'Laptop' where user_id = $1`, [A]);
      assert.equal(own.affectedRows, 1);
      const un = await tx.query(`update public.users set username = 'alice2' where id = $1`, [A]);
      assert.equal(un.affectedRows, 1);
      const otherP = await tx.query(`update public.passkeys set name = 'hax' where user_id = $1`, [B]);
      assert.equal(otherP.affectedRows, 0);
      const otherU = await tx.query(`update public.users set username = 'hax' where id = $1`, [B]);
      assert.equal(otherU.affectedRows, 0);
    });
  });

  it('anon: kein Lesen, keine Funktion', async () => {
    await seedBase();
    await as('anon', null, async (tx) => {
      await tx.exec('savepoint s');
      await rejects(tx.exec('select * from public.users'), /permission denied/i);
      await tx.exec('rollback to savepoint s');
      await rejects(tx.exec('select * from public.passkeys'), /permission denied/i);
      await tx.exec('rollback to savepoint s');
      await rejects(tx.exec(`select public.pa_delete_passkey(gen_random_uuid())`), /permission denied/i);
    });
  });

  it('pa_consume_challenge: einmalig, falscher Zweck verbraucht, abgelaufen leer', async () => {
    await as('service_role', null, async (tx) => {
      const ins = async (purpose: string, interval: string): Promise<string> => {
        const r = await tx.query<{ id: string }>(
          `insert into public.auth_challenges (challenge, purpose, expires_at) values ('c', $1, now() + $2::interval) returning id`,
          [purpose, interval],
        );
        return r.rows[0]?.id ?? '';
      };
      const consume = (id: string, purpose: string) =>
        tx.query<{ id: string }>('select * from public.pa_consume_challenge($1, $2)', [id, purpose]);

      const id1 = await ins('login', '5 minutes');
      assert.equal((await consume(id1, 'login')).rows[0]?.id, id1);
      assert.equal((await consume(id1, 'login')).rows.length, 0);

      const id2 = await ins('login', '5 minutes');
      assert.equal((await consume(id2, 'register')).rows.length, 0);
      assert.equal((await consume(id2, 'login')).rows.length, 0);

      const id3 = await ins('login', '-1 minute');
      assert.equal((await consume(id3, 'login')).rows.length, 0);

      const old = await ins('login', '-2 hours');
      await consume(id1, 'login');
      const left = await tx.query('select 1 from public.auth_challenges where id = $1', [old]);
      assert.equal(left.rows.length, 0);
    });
  });

  it('pa_rotate_session: gültig, unbekannt, abgelaufen', async () => {
    await db.exec('truncate public.users cascade');
    await as('service_role', null, async (tx) => {
      await createUser(tx, A, 'alice', 'cred-a1');
      await tx.query(
        `insert into public.auth_sessions (user_id, token_hash, expires_at) values ($1,'old', now() + interval '1 day'), ($1,'exp', now() - interval '1 day')`,
        [A],
      );
      const rot = (o: string, n: string) =>
        tx.query<{ user_id: string; username: string }>(`select * from public.pa_rotate_session($1, $2, now() + interval '7 days')`, [o, n]);

      const ok = await rot('old', 'new');
      assert.deepEqual(ok.rows, [{ user_id: A, username: 'alice' }]);
      assert.equal((await rot('old', 'new2')).rows.length, 0);
      assert.equal((await rot('nope', 'new3')).rows.length, 0);
      assert.equal((await rot('new', 'new4')).rows.length, 1);

      assert.equal((await rot('exp', 'new5')).rows.length, 0);
      const gone = await tx.query(`select 1 from public.auth_sessions where token_hash in ('exp','new5')`);
      assert.equal(gone.rows.length, 0);
    });
  });

  it('pa_delete_passkey: last_passkey, löschen bei zwei, fremde id not_found', async () => {
    await seedBase();
    const idOf = async (cred: string): Promise<string> => {
      const r = await db.query<{ id: string }>('select id from public.passkeys where credential_id = $1', [cred]);
      return r.rows[0]?.id ?? '';
    };
    const a1 = await idOf('cred-a1');
    const b1 = await idOf('cred-b1');

    await as('authenticated', A, async (tx) => {
      await rejects(tx.query('select public.pa_delete_passkey($1)', [a1]), /last_passkey/);
    });
    await as('authenticated', A, async (tx) => {
      await rejects(tx.query('select public.pa_delete_passkey($1)', [b1]), /not_found/);
    });

    await db.query(`insert into public.passkeys (user_id, credential_id, public_key) values ($1, 'cred-a2', 'pk')`, [A]);
    await as('authenticated', A, async (tx) => {
      await tx.query('select public.pa_delete_passkey($1)', [a1]);
      const r = await tx.query<{ credential_id: string }>('select credential_id from public.passkeys');
      assert.deepEqual(r.rows.map((x) => x.credential_id), ['cred-a2']);
    });
  });

  it('pa_delete_account: löscht User, Passkeys und Sessions per Cascade', async () => {
    await seedBase();
    await db.query(`insert into public.auth_sessions (user_id, token_hash, expires_at) values ($1, 'h', now() + interval '1 day')`, [A]);
    await db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: A })]);
      await tx.query('select public.pa_delete_account()');
      await tx.exec('reset role');
      const u = await tx.query('select 1 from public.users where id = $1', [A]);
      const p = await tx.query('select 1 from public.passkeys where user_id = $1', [A]);
      const s = await tx.query('select 1 from public.auth_sessions where user_id = $1', [A]);
      assert.equal(u.rows.length + p.rows.length + s.rows.length, 0);
      const b = await tx.query('select 1 from public.users where id = $1', [B]);
      assert.equal(b.rows.length, 1);
      await tx.rollback();
    });
  });
});
