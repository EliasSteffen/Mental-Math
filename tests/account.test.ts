import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthSession } from '../src/vendor/auth.ts';
import * as acct from '../src/features/account.ts';
import type { VendorModuleLike } from '../src/features/account.ts';

const ON = { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' };
const user = { id: 'u1', username: 'Anna' };
const session: AuthSession = { user, accessToken: 't', expiresAt: Date.now() + 60_000 };

// localStorage-Stub
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
} as unknown as Storage;

let restored = 0;
function fakeModule(restoreResult: AuthSession | null = null): VendorModuleLike {
  let cb: ((s: AuthSession | null) => void) | null = null;
  const auth = {
    support: async () => ({ webauthn: true, platform: true, conditional: false }),
    register: async () => { cb?.(session); return { ...session, recoveryCode: 'AAAAA-BBBBB-CCCCC-DDDDD' }; },
    recover: async () => { cb?.(session); return { ...session, recoveryCode: 'EEEEE-FFFFF-GGGGG-HHHHH' }; },
    createRecoveryCode: async () => 'JJJJJ-KKKKK-MMMMM-NNNNN',
    recoveryStatus: async () => ({ exists: true, createdAt: '2026-10-31T12:00:00.000Z' }),
    login: async () => { cb?.(session); return session; },
    addPasskey: async () => {},
    restore: async () => { restored += 1; return restoreResult; },
    logout: async () => { cb?.(null); },
    getAccessToken: async () => 't',
    getSession: () => null,
    onChange: (f: (s: AuthSession | null) => void) => { cb = f; return () => { cb = null; }; },
  };
  const api = {
    getProfile: async () => user,
    renameUser: async (_id: string, n: string) => n,
    listPasskeys: async () => [],
    renamePasskey: async () => {},
    deletePasskey: async () => {},
    deleteAccount: async () => {},
  };
  return { createPasskeyAuth: () => auth, createPasskeySupabaseClient: () => ({}), createAccountApi: () => api, createSupabaseSyncProvider: () => ({}) as never };
}

beforeEach(() => { store.clear(); restored = 0; });

test('accountEnabled: leer = aus, gefüllt = an', () => {
  acct._setModuleForTests(null, { supabaseUrl: '', supabaseKey: '' });
  assert.equal(acct.accountEnabled(), false);
  assert.equal(acct.getAccountState().status, 'disabled');
  acct._setModuleForTests(null, ON);
  assert.equal(acct.accountEnabled(), true);
});

test('restoreAccount ohne Hint wird übersprungen', async () => {
  acct._setModuleForTests(fakeModule(session), ON);
  await acct.restoreAccount();
  assert.equal(restored, 0);
  assert.equal(acct.getAccountState().status, 'signed-out');
});

test('restoreAccount mit Hint stellt Sitzung wieder her', async () => {
  acct._setModuleForTests(fakeModule(session), ON);
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(restored, 1);
  assert.deepEqual(acct.getAccountState(), { status: 'signed-in', user });
});

/** Modul, dessen restore() nacheinander die Ergebnisse aus `steps` liefert (Error → wird geworfen). */
function restoreSequence(steps: Array<AuthSession | null | Error>): VendorModuleLike {
  const m = fakeModule();
  return {
    ...m,
    createPasskeyAuth: () => {
      const auth = m.createPasskeyAuth();
      return {
        ...auth,
        restore: async () => {
          restored += 1;
          const next = steps.shift() ?? null;
          if (next instanceof Error) throw next;
          return next;
        },
      };
    },
  };
}
const authError = (code: string, status?: number): Error => Object.assign(new Error(code), { name: 'PasskeyAuthError', code, status });
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

test('restoreAccount: Netzwerkfehler → offline, Hint bleibt', async () => {
  acct._setModuleForTests(restoreSequence([authError('network')]), ON);
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'offline');
  assert.equal(store.get('mm:v3:auth.hint'), '1');
});

test('restoreAccount: Serverfehler und unbekannte Fehler → offline', async () => {
  acct._setModuleForTests(restoreSequence([authError('server_error', 503), new Error('Failed to fetch')]), ON);
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'offline');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'offline');
});

test('restoreAccount: Modul nicht ladbar (offline) → offline', async () => {
  const m = fakeModule();
  acct._setModuleForTests({ ...m, createPasskeyAuth: () => { throw authError('network'); } }, ON);
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'offline');
});

test('restoreAccount: 401 bzw. keine Sitzung → signed-out, Hint weg', async () => {
  acct._setModuleForTests(restoreSequence([null]), ON); // Client liefert nach 401 null
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'signed-out');
  assert.equal(store.has('mm:v3:auth.hint'), false);

  acct._setModuleForTests(restoreSequence([authError('unauthorized', 401)]), ON);
  store.set('mm:v3:auth.hint', '1');
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'signed-out');
  assert.equal(store.has('mm:v3:auth.hint'), false);
});

test('restoreAccount: parallele Aufrufe teilen sich einen Lauf', async () => {
  acct._setModuleForTests(restoreSequence([session]), ON);
  store.set('mm:v3:auth.hint', '1');
  await Promise.all([acct.restoreAccount(), acct.restoreAccount()]);
  assert.equal(restored, 1);
  assert.equal(acct.getAccountState().status, 'signed-in');
});

test('watchAccountRestore: online-Event nach Offline-Start → erneuter restore → signed-in', async () => {
  acct._setModuleForTests(restoreSequence([authError('network'), session]), ON);
  store.set('mm:v3:auth.hint', '1');
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  acct.watchAccountRestore(win, doc);
  acct.watchAccountRestore(win, doc); // idempotent: kein zweiter Hörer
  const seen: string[] = [];
  acct.onAccountChange((s) => seen.push(s.status));
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'offline');
  win.dispatchEvent(new Event('online'));
  await tick();
  assert.equal(restored, 2);
  assert.deepEqual(acct.getAccountState(), { status: 'signed-in', user });
  assert.ok(!seen.slice(1).includes('loading'), 'erneuter Versuch zeigt weiter den Offline-Hinweis');
  // angemeldet: weitere Events lösen nichts aus
  win.dispatchEvent(new Event('online'));
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(restored, 2);
});

test('watchAccountRestore: sichtbarer Tab versucht es erneut, verborgener nicht', async () => {
  acct._setModuleForTests(restoreSequence([authError('network'), authError('network'), session]), ON);
  store.set('mm:v3:auth.hint', '1');
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  acct.watchAccountRestore(win, doc);
  await acct.restoreAccount();
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(restored, 1, 'verborgen: kein Versuch');
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(restored, 2);
  assert.equal(acct.getAccountState().status, 'offline', 'weiter offline');
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(restored, 3);
  assert.equal(acct.getAccountState().status, 'signed-in');
});

test('watchAccountRestore: abgemeldet (kein offline) → Events lösen nichts aus', async () => {
  acct._setModuleForTests(restoreSequence([null, session]), ON);
  store.set('mm:v3:auth.hint', '1');
  const win = new EventTarget();
  acct.watchAccountRestore(win, Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  await acct.restoreAccount();
  assert.equal(acct.getAccountState().status, 'signed-out');
  win.dispatchEvent(new Event('online'));
  await tick();
  assert.equal(restored, 1);
});

test('register: signed-out → signed-in, Hint gesetzt; logout entfernt ihn', async () => {
  acct._setModuleForTests(fakeModule(), ON);
  const seen: string[] = [];
  acct.onAccountChange((s) => seen.push(s.status));
  await acct.register('Anna');
  assert.equal(acct.getAccountState().status, 'signed-in');
  assert.equal(store.get('mm:v3:auth.hint'), '1');
  await acct.logout();
  assert.equal(acct.getAccountState().status, 'signed-out');
  assert.equal(store.has('mm:v3:auth.hint'), false);
  assert.ok(seen.includes('signed-in') && seen.at(-1) === 'signed-out');
});

test('login setzt Hint, renameUser aktualisiert Namen', async () => {
  acct._setModuleForTests(fakeModule(), ON);
  await acct.login();
  assert.equal(store.get('mm:v3:auth.hint'), '1');
  await acct.renameUser('Berta');
  const st = acct.getAccountState();
  assert.equal(st.status === 'signed-in' && st.user.username, 'Berta');
});

test('errorCode-Mapping', () => {
  assert.equal(acct.errorCode({ code: 'cancelled' }), 'cancelled');
  assert.equal(acct.errorCode(Object.assign(new Error('x'), { code: 'rate_limited' })), 'rate_limited');
  assert.equal(acct.errorCode({ code: 'bogus' }), 'server_error');
  assert.equal(acct.errorCode(new Error('x')), 'server_error');
  assert.equal(acct.errorCode(null), 'server_error');
});

test('Wiederherstellungscode: register/recover liefern den Code, recover meldet an', async () => {
  acct._setModuleForTests(fakeModule(), ON);
  assert.equal(await acct.register('Anna'), 'AAAAA-BBBBB-CCCCC-DDDDD');
  await acct.logout();
  assert.equal(acct.getAccountState().status, 'signed-out');
  assert.equal(await acct.recover('aaaaa bbbbb ccccc ddddd'), 'EEEEE-FFFFF-GGGGG-HHHHH');
  assert.deepEqual(acct.getAccountState(), { status: 'signed-in', user });
  assert.equal(await acct.createRecoveryCode(), 'JJJJJ-KKKKK-MMMMM-NNNNN');
  assert.deepEqual(await acct.recoveryStatus(), { exists: true, createdAt: '2026-10-31T12:00:00.000Z' });
  assert.equal(acct.errorCode({ code: 'invalid_recovery_code' }), 'invalid_recovery_code');
});
