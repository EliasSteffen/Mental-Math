// PushStore auf Supabase (service_role, PostgREST). Fehler werden auf den Postgres-Code reduziert –
// Meldungstexte und Schlüssel landen nie im Log.
import { createClient } from '@supabase/supabase-js';
import type { PushRow, PushStore } from './push.ts';
import type { VapidKeys } from './push-crypto.ts';

const TABLE = 'push_subscriptions';
const COLUMNS = 'id,secret_hash,endpoint,p256dh,auth,tz,lang,prefs,state,sched,next_at,last_sent_at,last_review_at,last_test_at,failures';

interface DbError { code?: string }
function check<T>(r: { data: T; error: DbError | null }): T {
  if (r.error) throw new Error(`db ${r.error.code ?? 'error'}`);
  return r.data;
}

export function createSupabasePushStore(url: string, serviceKey: string): PushStore {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async getConfig() {
      const row = check(await db.from('push_config').select('vapid,cron_token').eq('id', 1).maybeSingle()) as
        { vapid: unknown; cron_token: string } | null;
      return row ? { vapid: row.vapid, cronToken: row.cron_token } : null;
    },
    async initVapid(keys: VapidKeys) {
      return check(await db.rpc('push_init_vapid', { p_vapid: keys })) as unknown;
    },
    async get(id) {
      return check(await db.from(TABLE).select(COLUMNS).eq('id', id).maybeSingle()) as PushRow | null;
    },
    async getByEndpoint(endpoint) {
      return check(await db.from(TABLE).select(COLUMNS).eq('endpoint', endpoint).maybeSingle()) as PushRow | null;
    },
    async put(row) {
      check(await db.from(TABLE).upsert(row, { onConflict: 'id' }));
    },
    async update(id, patch) {
      check(await db.from(TABLE).update(patch).eq('id', id));
    },
    async remove(id) {
      check(await db.from(TABLE).delete().eq('id', id));
    },
    async claimDue(now, limit) {
      return (check(await db.rpc('push_claim_due', { p_now: new Date(now).toISOString(), p_limit: limit })) as PushRow[] | null) ?? [];
    },
  };
}
