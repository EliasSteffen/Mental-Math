import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

type Tx = Parameters<Parameters<PGlite['transaction']>[0]>[0];

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'packages/passkey-auth/tests/helpers/supabase-sim.sql'), 'utf8');
const PUSH = readFileSync(join(root, 'sql/004_push.sql'), 'utf8');

const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
const HASH = 'a'.repeat(43);
const P256 = 'B' + 'x'.repeat(86);
const AUTH = 'y'.repeat(22);

let db: PGlite;

/** Führt fn unter einer Rolle aus und rollt immer zurück. */
async function as(role: 'anon' | 'authenticated' | 'service_role', fn: (tx: Tx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      await fn(tx);
      await tx.rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Error) || !/rollback/i.test(e.message)) throw e;
    });
}

async function rejects(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof Error && pattern.test(e.message));
}

const insertSub = (id: string, endpoint: string, nextAt: string | null) =>
  db.query(
    `insert into public.push_subscriptions (id, secret_hash, endpoint, p256dh, auth, next_at) values ($1,$2,$3,$4,$5,$6)`,
    [id, HASH, endpoint, P256, AUTH, nextAt],
  );

describe('push SQL', () => {
  before(async () => {
    db = new PGlite();
    await db.exec(SIM);
    await db.exec(PUSH);
    await db.exec(PUSH); // Idempotenz
  });
  beforeEach(async () => {
    await db.exec('truncate public.push_subscriptions');
    await db.exec('update public.push_config set vapid = null');
  });

  it('push_config: genau eine Zeile mit zufälligem Token', async () => {
    const r = await db.query<{ n: number; token: string; url: string }>(
      'select count(*)::int as n, min(cron_token) as token, min(tick_url) as url from public.push_config');
    assert.equal(r.rows[0]?.n, 1);
    assert.match(r.rows[0]?.token ?? '', /^[0-9a-f]{64}$/);
    assert.match(r.rows[0]?.url ?? '', /^https:\/\/.+\/api\/push\/tick$/);
    await rejects(db.query('insert into public.push_config (id) values (2)'), /check constraint/i);
  });

  it('anon und authenticated haben keinen Zugriff', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await as(role, async (tx) => { await rejects(tx.query('select * from public.push_subscriptions'), /permission denied/i); });
      await as(role, async (tx) => { await rejects(tx.query('select * from public.push_config'), /permission denied/i); });
      await as(role, async (tx) => { await rejects(tx.query(`select public.push_claim_due(now(), 10)`), /permission denied/i); });
      await as(role, async (tx) => { await rejects(tx.query(`select public.push_init_vapid('{}')`), /permission denied/i); });
    }
  });

  it('service_role: Abos anlegen und lesen; Constraints', async () => {
    await as('service_role', async (tx) => {
      await tx.query(
        `insert into public.push_subscriptions (id, secret_hash, endpoint, p256dh, auth) values ($1,$2,'https://fcm.googleapis.com/x',$3,$4)`,
        [ID1, HASH, P256, AUTH]);
      const r = await tx.query<{ n: number }>('select count(*)::int as n from public.push_subscriptions');
      assert.equal(r.rows[0]?.n, 1);
    });
    await rejects(insertSub(ID1, 'http://insecure.example/x', null), /check constraint/i);
    await insertSub(ID1, 'https://fcm.googleapis.com/a', null);
    await rejects(insertSub(ID2, 'https://fcm.googleapis.com/a', null), /duplicate key/i);
    await rejects(db.query(`update public.push_subscriptions set lang = 'fr' where id = $1`, [ID1]), /check constraint/i);
  });

  it('push_init_vapid: erster Schlüssel gewinnt', async () => {
    const first = await db.query<{ v: unknown }>(`select public.push_init_vapid('{"publicKey":"A","privateKey":"a"}') as v`);
    assert.deepEqual(first.rows[0]?.v, { publicKey: 'A', privateKey: 'a' });
    const second = await db.query<{ v: unknown }>(`select public.push_init_vapid('{"publicKey":"B","privateKey":"b"}') as v`);
    assert.deepEqual(second.rows[0]?.v, { publicKey: 'A', privateKey: 'a' });
  });

  it('push_claim_due: nur fällige, sortiert, begrenzt, reserviert', async () => {
    await insertSub(ID1, 'https://fcm.googleapis.com/1', '2026-01-15T17:00:00Z');
    await insertSub(ID2, 'https://fcm.googleapis.com/2', '2026-01-15T16:00:00Z');
    await insertSub(ID3, 'https://fcm.googleapis.com/3', '2026-01-15T18:00:00Z');
    const now = '2026-01-15T17:00:30Z';

    const one = await db.query<{ id: string }>('select id from public.push_claim_due($1, 1)', [now]);
    assert.deepEqual(one.rows.map((r) => r.id), [ID2], 'ältester zuerst, Limit 1');
    const rest = await db.query<{ id: string; next_at: Date }>('select id, next_at from public.push_claim_due($1, 50)', [now]);
    assert.deepEqual(rest.rows.map((r) => r.id), [ID1], 'reservierte und nicht fällige fehlen');
    assert.equal(rest.rows[0]?.next_at.toISOString(), '2026-01-15T17:05:30.000Z', '5 Minuten reserviert');
    const again = await db.query('select id from public.push_claim_due($1, 50)', [now]);
    assert.equal(again.rows.length, 0);
    const later = await db.query<{ id: string }>(`select id from public.push_claim_due('2026-01-15T18:10:00Z', 50) order by id`);
    assert.deepEqual(later.rows.map((r) => r.id), [ID1, ID2, ID3], 'Reservierung läuft ab');
  });
});
