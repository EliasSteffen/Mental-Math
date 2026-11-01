// E2E: echter Server-Stack (@simplewebauthn/server, jose) gegen den echten Client-Kern; nur das Netzwerk ist ersetzt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import type { JWK } from 'jose';
import { createAuthHandler, MemoryAuthStore } from '../src/server/index.ts';
import { createAuthCore } from '../src/client/auth.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';
import type {
  AuthenticationOptionsJSON, AuthenticationResponseJSON, PasskeyAuthClient, WebAuthnApi,
} from '../src/shared/types.ts';
import { createSoftAuthenticator } from './helpers/soft-authenticator.ts';
import type { SoftAuthenticator } from './helpers/soft-authenticator.ts';

const ORIGIN = 'https://example.test';
const BASE = `${ORIGIN}/api/auth`;
const COOKIE = 'mm_rt';
const DAY = 86_400_000;

type GetOverride = { origin?: string; credentialId?: string; userHandle?: string | null; counter?: number };

// ES256-Schlüssel wie bei Supabase (privater JWK mit kid und key_ops)
async function makeKey(): Promise<{ privateJson: string; publicJwk: JWK }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const kid = 'test-kid-1';
  return {
    privateJson: JSON.stringify({ ...priv, kid, alg: 'ES256', key_ops: ['sign', 'verify'] }),
    publicJwk: { ...pub, kid, alg: 'ES256' },
  };
}

async function setup(softOpts: { counterStart?: number } = {}) {
  const clock = { t: Date.UTC(2026, 5, 1, 12, 0, 0) };
  const now = (): number => clock.t;
  const { privateJson, publicJwk } = await makeKey();
  const store = new MemoryAuthStore({ now });
  const handler = createAuthHandler({
    rpId: 'example.test', rpName: 'Test', origins: [ORIGIN],
    jwt: { key: privateJson, issuer: BASE },
  }, store, { now });

  // Cookie-Jar: Name → Wert
  const jar = new Map<string, string>();
  const log: { path: string; body: string }[] = [];
  const rawFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set('Origin', ORIGIN);
    if (jar.size > 0) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await handler(new Request(url, { ...init, headers }));
    for (const sc of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = sc.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const maxAge = attrs.find((a) => a.toLowerCase().startsWith('max-age='));
      if (maxAge !== undefined && Number(maxAge.slice(8)) <= 0) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1));
    }
    return res;
  };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    log.push({ path: new URL(url).pathname.replace('/api/auth', ''), body: typeof init?.body === 'string' ? init.body : '' });
    return rawFetch(url, init);
  };

  // Steuerbarer Authenticator-Adapter
  const ctl: { soft: SoftAuthenticator; override: GetOverride; beforeGet?: () => void } = {
    soft: createSoftAuthenticator({ origin: ORIGIN, ...softOpts }),
    override: {},
  };
  const softWebAuthn: WebAuthnApi = {
    support: () => Promise.resolve({ webauthn: true, platform: true, conditional: true }),
    async create(options) {
      try { return await ctl.soft.create(options); } catch (e) { throw mapError(e); }
    },
    async get(options: AuthenticationOptionsJSON): Promise<AuthenticationResponseJSON> {
      ctl.beforeGet?.();
      try { return await ctl.soft.get(options, ctl.override); } catch (e) { throw mapError(e); }
    },
  };
  const newClient = (): PasskeyAuthClient =>
    createAuthCore({ baseUrl: BASE, fetch: fakeFetch, webauthn: softWebAuthn, now });
  return { clock, store, handler, jar, log, ctl, publicJwk, newClient, rawFetch, auth: newClient() };
}

// Wie der echte Wrapper: DOMException-Namen auf Fehlercodes abbilden
function mapError(e: unknown): unknown {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') return new PasskeyAuthError('cancelled');
    if (e.name === 'InvalidStateError') return new PasskeyAuthError('already_registered');
  }
  return e;
}

async function rejectsWith(p: Promise<unknown>, code: string, message?: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof PasskeyAuthError, 'PasskeyAuthError erwartet');
    assert.equal(e.code, code);
    if (message !== undefined) assert.equal(e.message, message);
    return true;
  });
}

test('1: register liefert Session, gültiges JWT, je 1 User/Passkey/Session', async () => {
  const s = await setup();
  const session = await s.auth.register('Anna');
  assert.equal(session.user.username, 'Anna');
  const key = await importJWK(s.publicJwk, 'ES256');
  const { payload, protectedHeader } = await jwtVerify(session.accessToken, key, { currentDate: new Date(s.clock.t) });
  assert.equal(payload.sub, session.user.id);
  assert.equal(payload['role'], 'authenticated');
  assert.equal(payload.aud, 'authenticated');
  assert.equal(protectedHeader.kid, 'test-kid-1');
  assert.equal(decodeProtectedHeader(session.accessToken).alg, 'ES256');
  assert.equal(decodeJwt(session.accessToken).sub, session.user.id);
  const snap = s.store.snapshot();
  assert.deepEqual([snap.users, snap.passkeys, snap.sessions], [1, 1, 1]);
  assert.ok(s.jar.has(COOKIE));
});

test('2: register, logout, login ergibt dieselbe User-ID; Counter bleibt 0', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  await s.auth.logout();
  assert.equal(s.auth.getSession(), null);
  assert.equal(s.jar.has(COOKIE), false);
  const login = await s.auth.login();
  assert.equal(login.user.id, reg.user.id);
  assert.equal(s.auth.getSession()?.user.id, reg.user.id);
  const pk = await s.store.findPasskey(s.ctl.soft.credentials[0]!.id);
  assert.equal(pk?.counter, 0);
});

// /refresh mit einem bestimmten Cookie am Cookie-Jar vorbei (Antwort erreicht den Client nicht)
const refreshRaw = (s: Awaited<ReturnType<typeof setup>>, cookie: string): Promise<Response> =>
  s.handler(new Request(`${BASE}/refresh`, {
    method: 'POST', headers: { Origin: ORIGIN, Cookie: `${COOKIE}=${cookie}`, 'Content-Type': 'application/json' }, body: '{}',
  }));

test('3: restore nach Reload nutzt /refresh; altes Cookie ist nach der Gnadenfrist ungültig', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  const oldCookie = s.jar.get(COOKIE)!;
  const reloaded = s.newClient();
  assert.equal(reloaded.getSession(), null);
  const restored = await reloaded.restore();
  assert.equal(restored?.user.id, reg.user.id);
  assert.notEqual(s.jar.get(COOKIE), oldCookie);
  s.clock.t += 61_000;
  const replay = await refreshRaw(s, oldCookie);
  assert.equal(replay.status, 401);
  assert.equal(s.store.snapshot().sessions, 0, 'Wiederverwendung löscht die Session');
});

test('4: zweiter Passkey per addPasskey; Login mit beiden; excludeCredentials greift', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  const first = s.ctl.soft;
  // Derselbe Authenticator darf sich nicht erneut eintragen
  await rejectsWith(s.auth.addPasskey(), 'already_registered', 'already_registered');
  // Zweiter Authenticator
  const second = createSoftAuthenticator({ origin: ORIGIN });
  s.ctl.soft = second;
  await s.auth.addPasskey();
  assert.equal(s.store.snapshot().passkeys, 2);
  const [c1, c2] = [first.credentials[0]!, second.credentials[0]!];
  assert.notEqual(c1.id, c2.id);
  // Login mit jedem Credential
  for (const [auth, cred] of [[first, c1], [second, c2]] as const) {
    s.ctl.soft = auth;
    s.ctl.override = { credentialId: cred.id };
    const login = await s.newClient().login();
    assert.equal(login.user.id, reg.user.id);
  }
  // Auch der zweite Authenticator ist nun ausgeschlossen
  await rejectsWith(s.auth.addPasskey(), 'already_registered', 'already_registered');
});

test('5: Replay des /login/verify-Bodys führt zu challenge_expired', async () => {
  const s = await setup();
  await s.auth.register('Anna');
  await s.auth.logout();
  await s.auth.login();
  const captured = s.log.filter((l) => l.path === '/login/verify').at(-1)!;
  const res = await s.rawFetch(`${BASE}/login/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: captured.body,
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'challenge_expired');
});

test('6: abgelaufene Challenge (301 s) führt zu challenge_expired', async () => {
  const s = await setup();
  await s.auth.register('Anna');
  await s.auth.logout();
  s.ctl.beforeGet = () => { s.clock.t += 301_000; };
  await rejectsWith(s.auth.login(), 'challenge_expired');
  assert.equal(s.auth.getSession(), null);
});

test('7: falsche Origin im clientDataJSON wird abgelehnt', async () => {
  const s = await setup();
  await s.auth.register('Anna');
  await s.auth.logout();
  s.ctl.override = { origin: 'https://evil.test' };
  await rejectsWith(s.auth.login(), 'verification_failed');
});

test('8: fremder userHandle wird abgelehnt', async () => {
  const s = await setup();
  await s.auth.register('Anna');
  const other = createSoftAuthenticator({ origin: ORIGIN });
  const mine = s.ctl.soft;
  s.ctl.soft = other;
  await s.newClient().register('Berta');
  s.ctl.soft = mine;
  await s.auth.logout();
  s.ctl.override = { userHandle: other.credentials[0]!.userHandle };
  await rejectsWith(s.auth.login(), 'verification_failed');
});

test('9: Counter-Regression (Klon) wird abgelehnt', async () => {
  const s = await setup({ counterStart: 5 });
  await s.auth.register('Anna');
  await s.auth.logout();
  await s.auth.login(); // Counter 6
  const pk = await s.store.findPasskey(s.ctl.soft.credentials[0]!.id);
  assert.equal(pk?.counter, 6);
  s.ctl.override = { counter: 3 };
  await rejectsWith(s.auth.login(), 'verification_failed');
});

test('10: abgelaufenes Access-Token löst genau einen /refresh aus', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  const refreshes = (): number => s.log.filter((l) => l.path === '/refresh').length;
  assert.equal(await s.auth.getAccessToken(), reg.accessToken);
  assert.equal(refreshes(), 0);
  s.clock.t += 901_000;
  const [a, b] = await Promise.all([s.auth.getAccessToken(), s.auth.getAccessToken()]);
  assert.equal(refreshes(), 1);
  assert.equal(a, b);
  assert.notEqual(a, reg.accessToken);
  assert.equal(await s.auth.getAccessToken(), a);
  assert.equal(refreshes(), 1);
});

test('11: abgelaufenes Refresh-Token: restore() ist null, Session serverseitig entfernt', async () => {
  const s = await setup();
  await s.auth.register('Anna');
  s.clock.t += 30 * DAY + 1000;
  const reloaded = s.newClient();
  assert.equal(await reloaded.restore(), null);
  assert.equal(reloaded.getSession(), null);
  assert.equal(s.store.snapshot().sessions, 0);
  // Cookie bleibt bewusst stehen (wertlos): ein 401 darf das frisch rotierte Cookie eines anderen Tabs nicht löschen
  assert.equal(s.jar.has(COOKIE), true);
});

test('12: Benutzername wird normalisiert; doppelte Namen sind erlaubt', async () => {
  const s = await setup();
  const a = await s.auth.register('  Anna   B ');
  assert.equal(a.user.username, 'Anna B');
  s.ctl.soft = createSoftAuthenticator({ origin: ORIGIN });
  const b = await s.newClient().register('Anna B');
  assert.equal(b.user.username, 'Anna B');
  assert.notEqual(a.user.id, b.user.id);
  assert.equal(s.store.snapshot().users, 2);
});

test('13: register liefert Wiederherstellungscode; recover auf neuem Gerät legt Passkey an und ersetzt den Code', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  assert.match(reg.recoveryCode ?? '', /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
  assert.equal((s.auth.getSession() as { recoveryCode?: string } | null)?.recoveryCode, undefined, 'Code nicht in der Session');
  await s.auth.logout();
  s.ctl.soft = createSoftAuthenticator({ origin: ORIGIN }); // neues Gerät, alter Passkey ist weg
  const rec = await s.auth.recover((reg.recoveryCode ?? '').toLowerCase().replace(/-/g, ' '));
  assert.equal(rec.user.id, reg.user.id);
  assert.ok(rec.recoveryCode && rec.recoveryCode !== reg.recoveryCode, 'neuer Code nach Benutzung');
  assert.equal(s.store.snapshot().passkeys, 2);
  await s.auth.logout();
  assert.equal((await s.auth.login()).user.id, reg.user.id, 'Login mit dem neuen Passkey');
  await s.auth.logout();
  await rejectsWith(s.auth.recover(reg.recoveryCode ?? ''), 'invalid_recovery_code');
});

test('14: recover mit ungültigem Code; Code neu erzeugen macht den alten ungültig; Status nur angemeldet', async () => {
  const s = await setup();
  await rejectsWith(s.auth.recover('nope'), 'invalid_recovery_code');
  await rejectsWith(s.auth.recover('ABCDE-FGHJK-MNPQR-STVWX'), 'invalid_recovery_code');
  const reg = await s.auth.register('Ben');
  const st = await s.auth.recoveryStatus();
  assert.equal(st.exists, true);
  assert.equal(st.createdAt, new Date(s.clock.t).toISOString());
  const fresh = await s.auth.createRecoveryCode();
  assert.notEqual(fresh, reg.recoveryCode);
  await s.auth.logout();
  await rejectsWith(s.auth.recoveryStatus(), 'unauthorized');
  await rejectsWith(s.auth.createRecoveryCode(), 'unauthorized');
  await rejectsWith(s.auth.recover(reg.recoveryCode ?? ''), 'invalid_recovery_code');
  s.ctl.soft = createSoftAuthenticator({ origin: ORIGIN });
  assert.equal((await s.auth.recover(fresh)).user.id, reg.user.id);
});

test('15: verlorene /refresh-Antwort: zweiter Refresh mit altem Cookie innerhalb von 60 s, danach Diebstahlsignal', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  const c1 = s.jar.get(COOKIE)!;
  assert.equal((await refreshRaw(s, c1)).status, 200); // Server rotiert, der Jar behält c1
  s.clock.t += 20_000;
  const reloaded = s.newClient();
  assert.equal((await reloaded.restore())?.user.id, reg.user.id, 'kein Zwangs-Logout');
  assert.notEqual(s.jar.get(COOKIE), c1);
  assert.equal(s.store.snapshot().sessions, 1);
  // Das alte Cookie taucht nach der Frist erneut auf (z. B. gestohlen): Session weg, auch für den Client
  s.clock.t += 60_000;
  assert.equal((await refreshRaw(s, c1)).status, 401);
  assert.equal(s.store.snapshot().sessions, 0);
  assert.equal(await s.newClient().restore(), null);
});

test('16: absolute Sitzungsdauer (90 Tage) greift trotz regelmäßiger Rotation', async () => {
  const s = await setup();
  const reg = await s.auth.register('Anna');
  for (let day = 20; day <= 80; day += 20) {
    s.clock.t += 20 * DAY;
    assert.equal((await s.newClient().restore())?.user.id, reg.user.id, `Tag ${day}`);
  }
  s.clock.t += 10 * DAY;
  assert.equal(await s.newClient().restore(), null);
  assert.equal(s.store.snapshot().sessions, 0);
});
