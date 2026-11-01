# Plan v9 – Passkey-Auth (Benutzername + WebAuthn, Supabase)

Ziel: Konten ohne E-Mail und ohne Recovery. Ein frei wählbarer, **nicht eindeutiger** Benutzername plus ein oder mehrere Passkeys. Die Logik steckt in einem wiederverwendbaren Paket `passkey-auth` (npm-Workspace in diesem Repo, ohne App-Bezug). Mental Math bindet es in den Tab „Daten & Account“ ein. Cloud-Sync selbst ist **nicht** Teil von v9, er wird erst durch das Konto möglich.

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) gelten weiter: strict TS, `.ts`-Imports, kein `any`, DOM nur über `h()`, 320 px tauglich. Das Paket enthält **keinen** App-Code (keine `h()`, kein i18n), nur Logik.

---

## 0. Architekturentscheidungen (inkl. Korrekturen an der Vorgabe)

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Der Server prüft und speichert Passkeys, nie der Client.** Vorgabe Schritt 3 („Client speichert Credential ID in `passkeys`“) wird so umgesetzt: Der Client schickt die Attestation an den Server, der Server verifiziert und schreibt mit `service_role`. | Dürfte der Client selbst in `passkeys` schreiben, könnte jeder einen beliebigen Public Key an fremde Konten hängen. `authenticated`/`anon` haben **kein INSERT** auf `passkeys`. |
| D2 | **Supabase Auth (`auth.users`) wird nicht genutzt.** Der Server stellt nach erfolgreicher Prüfung selbst ein Supabase-kompatibles Access-JWT aus (`sub = users.id`, `role = authenticated`, `aud = authenticated`, TTL 15 min). | Supabase Auth bietet keinen Login nur mit Benutzername und Passkey und kann für einen bestehenden User ohne E-Mail keine Session erzeugen. PostgREST/RLS braucht nur ein gültig signiertes JWT, denn `auth.uid()` liest den `sub`-Claim. |
| D3 | **Signatur des JWT: ES256 mit eigenem, in Supabase importiertem Schlüssel** (`AUTH_JWT_KEY` = privater JWK mit `kid`). Der Server signiert mit `jose` und setzt `alg: 'ES256'` und `kid` im Header. Den HS256-Pfad (Secret-String) unterstützt der Code für andere Projekte weiterhin. | Das Projekt `anrfpvgcaplyjkmraald` nutzt asymmetrische Signing Keys (ES256), ein gemeinsames Secret gibt es also nicht. Laut Supabase-Doku akzeptiert die Data API einen importierten Key, sobald er rotiert und damit „current“ ist. Ein Standby-Key reicht nicht. |
| D4 | **Eigener Refresh-Token** (zufällig, 32 Byte, in der DB nur als SHA-256) als **HttpOnly-Cookie** `mm_rt` (`Secure`, `SameSite=Strict`, `Path=/api/auth`), Rotation bei jeder Nutzung, 30 Tage gleitend, höchstens 90 Tage ab Anmeldung (absolute Dauer). Der alte Token gilt nach einer Rotation noch 60 s (Gnadenfrist); kommt er später, wird die Session gelöscht (Wiederverwendungserkennung). Das Access-Token liegt nur im Speicher. | Ohne Supabase Auth gibt es auch keine Refresh-Tokens von Supabase. Das Cookie ist für JS unlesbar. Das funktioniert nur same-origin, siehe D5. Die Gnadenfrist fängt verlorene `/refresh`-Antworten und parallele Tabs ab; ein später wieder auftauchender alter Token ist dagegen ein Diebstahlsignal. |
| D5 | **Die Auth-Endpunkte laufen als Cloudflare Pages Function** (`/api/auth/*`) auf derselben Origin wie die App. Der Paket-Kern ist ein reiner Fetch-API-Handler `(Request) => Promise<Response>` und läuft unverändert auch in Supabase Edge Functions (Deno), Workers oder Node 20+. | Same-origin bedeutet: kein CORS, das Cookie funktioniert, die Pipeline und das Secret-Handling sind vorhanden (wie bei `/api/explain`). Andere Projekte können den Handler woanders mounten. |
| D6 | **Login ohne Benutzername** (Discoverable Credential): `residentKey: 'required'`, `allowCredentials: []`, `userVerification: 'required'`. Der Benutzername ist nur Anzeigename und `user.name` im Passkey-Dialog. Als WebAuthn-`user.id` dient die User-UUID (16 Byte, keine personenbezogenen Daten). | Weil Namen doppelt vorkommen dürfen, kann der Name nicht zum Login dienen. Der Login identifiziert ausschließlich über `credential_id`, abgeglichen mit dem `userHandle`. |
| D7 | **Der User wird erst nach erfolgreicher Prüfung angelegt.** `register/options` erzeugt die UUID und legt sie nur in der Challenge-Zeile ab. `register/verify` legt `users` und `passkeys` in **einer** SQL-Funktion (Transaktion) an. | Abgebrochene Registrierungen hinterlassen keine verwaisten User. supabase-js kennt keine Transaktionen, deshalb übernehmen RPC-Funktionen diese Schritte. |
| D8 | **Challenges werden serverseitig gespeichert** (`auth_challenges`), sind 5 min gültig, nur einmal verwendbar und werden atomar per `DELETE … RETURNING` verbraucht. Der Client bekommt eine opake `flowId`. | Schützt vor Replay. Zustandslose Varianten (signierte Challenge) könnten nicht verhindern, dass dieselbe Challenge zweimal verwendet wird. |
| D9 | **Das Client-Paket hat keine Laufzeitabhängigkeiten.** Es wandelt WebAuthn-JSON selbst um (base64url) und nutzt `PublicKeyCredential.parse*OptionsFromJSON` / `toJSON()`, wenn der Browser es kann, sonst eigene Konvertierung. Der Server nutzt `@simplewebauthn/server` und `jose`. Der Supabase-Adapter nutzt `@supabase/supabase-js` als Peer-Abhängigkeit. | Kleiner Client und keine Krypto im Browser. Die Server-Prüfung baut auf einer etablierten Bibliothek auf statt auf Eigenbau (CBOR/COSE/Signaturen). |
| D10 | **Keine Recovery, also aktiv abfedern:** Nach der Registrierung ein Hinweis „Zweiten Passkey hinzufügen“. Die Anzeige „synchronisiert“ (`backed_up`) macht iCloud- oder Google-Passkeys sichtbar. Der letzte Passkey lässt sich nicht löschen. Die lokalen Trainingsdaten bleiben ohnehin im Browser. | Wer alle Passkeys verliert, verliert das Konto. Das steht so ausdrücklich in der UI. |
| D11 | **Bundling in der App:** Nur `src/vendor/auth.ts` darf npm-Pakete importieren. Ein neuer Build-Schritt bündelt diese eine Datei mit esbuild über die tsc-Ausgabe (`dist/js/vendor/auth.js`). Die App lädt sie erst per `import()`, wenn der Account-Tab oder eine gespeicherte Session das braucht. | Die App ist ungebündelt (tsc → ES-Module). Bare Specifier wie `@supabase/supabase-js` laufen im Browser sonst nicht. Ein Import-Map-Inline-Script würde die strikte CSP brechen. |
| D12 | **RP-ID** = `mental-math.elias-steffen.de`. Erlaubte Origins kommen per Env (`AUTH_ORIGINS`). Lokal wird **`http://localhost:8788`** geöffnet, nicht `127.0.0.1`: WebAuthn akzeptiert keine IP als RP-ID. | Preview-Deployments (`*.pages.dev`) können keine Passkeys verwenden. Das ist so gewollt. |

### Stand der Einrichtung (31.10.2026)
- **Projekt:** Supabase `anrfpvgcaplyjkmraald`. Es dient vorerst auch für die lokale Entwicklung, ein eigenes Dev-Projekt gibt es nicht.
- **`.env`, lokal:** Alle Variablen sind gesetzt, mit `AUTH_RP_ID=localhost` und `AUTH_ORIGINS=http://localhost:8788`.
- **Cloudflare, Production-Secrets:**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`)
  - `AUTH_JWT_KEY`
  - `AUTH_RP_ID=mental-math.elias-steffen.de`
  - `AUTH_ORIGINS=https://mental-math.elias-steffen.de`
- **GitHub, Actions-Variablen (nicht geheim):** `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (`sb_publishable_…`). B3 reicht sie im Build-Step als `env: PUBLIC_…: ${{ vars.PUBLIC_… }}` durch. Server-Secrets liegen bewusst nicht in GitHub.
- **Eigener Signing Key:** `kid 95587f83-4fe4-4d19-8ab2-2976f021ca47`. **Import und Rotation im Dashboard stehen noch aus** (O1).

### Offene Punkte (Phase 0, Nutzer)
- **O1** Den eigenen ES256-Key importieren: Dashboard → Project Settings → JWT Keys → „Create standby key“ → „Import“ → den privaten JWK einfügen, dann „Rotate keys“, damit er zum Current Key wird. Die Kontrolle: `https://anrfpvgcaplyjkmraald.supabase.co/auth/v1/.well-known/jwks.json` enthält danach `kid 95587f83-…`.
- **O2** `sql/001_passkey_auth.sql` im SQL-Editor ausführen (sobald A1 fertig ist).
- **O3** ✅ erledigt (siehe „Stand der Einrichtung“). Secrets setzen, in Cloudflare (Production) und in `.env` (lokal, wird von wrangler gelesen):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (oder den neuen `sb_secret_…`)
  - `AUTH_JWT_KEY`
  - `AUTH_RP_ID`
  - `AUTH_ORIGINS`

  Öffentlich und zur Build-Zeit über CI-Variablen: `PUBLIC_SUPABASE_URL` und `PUBLIC_SUPABASE_ANON_KEY` (oder `sb_publishable_…`).
- **O4** ✅ im Code umgesetzt: `server/auth.ts` begrenzt alle Routen unter `/api/auth/*` auf 30 Anfragen pro Minute und IP (darüber 429 `rate_limited`), global über das Durable Object aus `workers/rate-limiter` (eigene Instanz „auth“, teilt nichts mit `/api/explain`), ohne Binding pro Instanz. Ohne E-Mail und Captcha ist das der wichtigste Schutz gegen massenhaft angelegte Konten. Eine zusätzliche Cloudflare-WAF-Regel auf `POST /api/auth/*/options` bleibt optional.

---

## 1. Datenbank (Supabase / Postgres) – `packages/passkey-auth/sql/001_passkey_auth.sql`

```sql
create table public.users (
  id          uuid primary key,                       -- vom Server erzeugt (D7)
  username    text not null check (char_length(username) between 2 and 32),
  created_at  timestamptz not null default now()
);

create table public.passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  credential_id text not null unique,                 -- base64url
  public_key    text not null,                        -- COSE-Key, base64url
  counter       bigint not null default 0 check (counter >= 0),
  transports    text,                                 -- CSV, z. B. 'internal,hybrid'
  device_type   text check (device_type in ('singleDevice','multiDevice')),
  backed_up     boolean not null default false,
  name          text check (char_length(name) <= 40), -- vom Nutzer umbenennbar
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index passkeys_user_id_idx on public.passkeys(user_id);

create table public.auth_challenges (                 -- nur service_role
  id          uuid primary key default gen_random_uuid(),   -- = flowId
  challenge   text not null,                          -- base64url
  purpose     text not null check (purpose in ('register','login','add')),
  user_id     uuid,                                   -- register: neue UUID; add: eingeloggter User
  username    text,                                   -- nur register
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index auth_challenges_expires_idx on public.auth_challenges(expires_at);

create table public.auth_sessions (                   -- nur service_role
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token_hash   text not null unique,                  -- SHA-256(refresh token), base64url
  expires_at   timestamptz not null,                  -- gleitend, je Rotation neu (höchstens absolute_expires_at)
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  prev_hash    text,                                  -- Hash vor der letzten Rotation (Gnadenfrist, Wiederverwendung)
  rotated_at   timestamptz,                           -- Zeitpunkt der letzten Rotation über token_hash
  absolute_expires_at timestamptz                     -- harte Grenze ab Login; null = unbegrenzt (Altbestand)
);
```

Die drei letzten Spalten (samt Index auf `prev_hash`) rüstet das Skript per `add column if not exists` nach; es ist idempotent und wird nach einem Update erneut ausgeführt.

Warum `text` statt `bytea`: Die Vorgabe erlaubt beides. Über PostgREST/supabase-js kommt `bytea` als Hex-String `\x…` an. base64url-Text spart Konvertierungsfehler und ist direkt WebAuthn-JSON-kompatibel.

### RLS und Rechte (streng)

```sql
alter table public.users           enable row level security;
alter table public.passkeys        enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.auth_sessions   enable row level security;

-- Supabase vergibt in public Default-Grants an anon/authenticated → explizit entziehen
revoke all on public.users, public.passkeys, public.auth_challenges, public.auth_sessions from anon, authenticated;

-- users: nur eigene Zeile lesen, nur username ändern
grant select on public.users to authenticated;
grant update (username) on public.users to authenticated;
create policy users_select_own on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_update_own on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- passkeys: eigene lesen, nur name ändern; kein INSERT (D1), kein direktes DELETE (→ RPC)
grant select on public.passkeys to authenticated;
grant update (name) on public.passkeys to authenticated;
create policy passkeys_select_own on public.passkeys for select to authenticated using (user_id = (select auth.uid()));
create policy passkeys_update_own on public.passkeys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- auth_challenges / auth_sessions: RLS an, KEINE Policies, KEINE Grants → nur service_role (bypasst RLS)
```

### SQL-Funktionen
Alle Funktionen sind `security definer`, haben `set search_path = ''` und voll qualifizierte Namen. `revoke execute … from public, anon, authenticated` ist Pflicht, weil Postgres `EXECUTE` standardmäßig an PUBLIC vergibt.

| Funktion | Aufrufer | Inhalt |
|---|---|---|
| `pa_consume_challenge(p_id uuid, p_purpose text)` → Zeile oder leer | service_role | `delete … where id = p_id and purpose = p_purpose returning *`. Liefert nur, wenn `expires_at > now()`. Räumt dabei abgelaufene Challenges ab (`delete where expires_at < now() - interval '1 hour'`). |
| `pa_create_user_with_passkey(p_user_id, p_username, p_credential_id, p_public_key, p_counter, p_transports, p_device_type, p_backed_up, p_name)` | service_role | Legt beide Zeilen in **einer** Transaktion an (D7). |
| `pa_rotate_session(p_old_hash text, p_new_hash text, p_expires_at timestamptz)` → `(user_id, username)` oder leer | service_role | Sperrt die Session (`for update`) und rotiert in derselben Zeile: neuer Hash in `token_hash`, der alte in `prev_hash`, `rotated_at = now()`, `expires_at` höchstens bis `absolute_expires_at`. Ein Treffer über `prev_hash` innerhalb von 60 s seit `rotated_at` rotiert erneut (Gnadenfrist, die Frist gleitet nicht); danach gilt er als Wiederverwendung und die Session wird gelöscht. Abgelaufen (gleitend oder absolut) → löschen. Unbekannter Hash, Ablauf oder Wiederverwendung ergeben ein leeres Ergebnis (der Server antwortet dann mit 401). |
| `pa_delete_passkey(p_id uuid)` | authenticated | Sperrt alle Passkeys von `auth.uid()` (`for update`). Bei ≤ 1 bricht sie mit `raise exception 'last_passkey'` ab. Sonst löscht sie `where id = p_id and user_id = auth.uid()`. |
| `pa_delete_account()` | authenticated | `delete from public.users where id = auth.uid()`. Passkeys und Sessions werden per Cascade mitgelöscht. |

#### Vertrag zwischen SQL und Supabase-Adapter (verbindlich für A1 und A6)

```sql
-- service_role (A6 ruft per rpc; Ergebnis von setof/table = Array, A6 nimmt [0])
pa_consume_challenge(p_id uuid, p_purpose text) returns setof public.auth_challenges
  -- löscht die Zeile mit p_id IMMER (falls vorhanden); liefert sie nur, wenn purpose = p_purpose und expires_at > now();
  -- räumt zusätzlich Challenges mit expires_at < now() - interval '1 hour' ab
pa_create_user_with_passkey(p_user_id uuid, p_username text, p_credential_id text, p_public_key text,
  p_counter bigint, p_transports text, p_device_type text, p_backed_up boolean) returns void
pa_rotate_session(p_old_hash text, p_new_hash text, p_expires_at timestamptz)
  returns table (user_id uuid, username text)   -- leer, wenn alter Hash unbekannt oder abgelaufen (abgelaufen → trotzdem löschen);
  -- prev_hash-Treffer: ≤ 60 s nach rotated_at erneut rotieren, sonst Session löschen (Wiederverwendung)
-- authenticated
pa_delete_passkey(p_id uuid) returns void        -- raise exception 'last_passkey' using errcode = 'P0001'; fremde/unbekannte id → 'not_found' (P0002)
pa_delete_account() returns void
```

Direkte Tabellenzugriffe von A6 mit service_role:
- `insert auth_challenges(id, challenge, purpose, user_id, username, expires_at)`
- `insert passkeys(user_id, credential_id, public_key, counter, transports, device_type, backed_up)`
- `select passkeys.*, users(username)` über `credential_id`
- `select credential_id` über `user_id`
- `update passkeys set counter, last_used_at = now()` über `id`
- `insert auth_sessions(user_id, token_hash, expires_at, absolute_expires_at)` (ohne `absolute_expires_at`, solange die Spalte fehlt)
- `delete auth_sessions` über `token_hash`

`transports` wird als CSV gespeichert, `expires_at` ist `timestamptz` (ISO-String ↔ ms epoch im Adapter).

**Automatischer Test:** `tests/sql.test.ts` nutzt PGlite (`@electric-sql/pglite`, Postgres als WASM). Ein Vorspann `tests/helpers/supabase-sim.sql` bildet Supabase nach: die Rollen `anon`, `authenticated` und `service_role` (mit `bypassrls`), `auth.uid()` aus `request.jwt.claims` sowie die **Default-Grants** von Supabase (`alter default privileges in schema public grant all on tables/functions to anon, authenticated, service_role`). So prüft der Test auch, dass alle `revoke` greifen.

Dazu gehört `sql/tests/rls_test.sql`, ein Skript für den SQL-Editor in einer Transaktion mit `rollback`. Es legt zwei User an und setzt `set local role authenticated; set local request.jwt.claims = '{"sub":"…","role":"authenticated"}'`. Dann prüft es:
- Fremde Zeilen sind unsichtbar.
- Die Updates auf `public_key` und `counter` werden abgewiesen.
- `insert` in `passkeys` schlägt fehl.
- Challenges und Sessions sind nicht lesbar.
- `pa_consume_challenge` ist für `authenticated` nicht ausführbar.
- Der letzte Passkey lässt sich nicht löschen.

Jede Prüfung meldet sich mit `raise notice 'OK …'`, ein Fehler bricht ab.

---

## 2. Paketstruktur – `packages/passkey-auth/`

```
package.json        name "passkey-auth", private, type module, exports:
                      "./client"   → dist/client/index.js   (+ .d.ts)   – keine Laufzeit-Deps
                      "./server"   → dist/server/index.js               – @simplewebauthn/server, jose
                      "./supabase" → dist/supabase/index.js             – peer @supabase/supabase-js
                      "./sql/*"    → sql/*
tsconfig.json       wie App (strict, .ts-Imports, rewriteRelativeImportExtensions), declaration: true, outDir dist
src/shared/         types.ts (VERTRAG, Phase 0), base64url.ts, errors.ts, username.ts
src/client/         index.ts, webauthn.ts, api.ts, session.ts
src/server/         index.ts, handler.ts, ceremonies.ts, tokens.ts, cookies.ts, memory-store.ts
src/supabase/       index.ts, store.ts (AuthStore via service_role), client.ts (supabase-js mit Passkey-Token)
sql/                001_passkey_auth.sql, tests/rls_test.sql
tests/              *.test.ts (node --test, importieren src relativ), helpers/soft-authenticator.ts
README.md           Einbindung, Endpunkte, Env, Sicherheitsmodell, „keine Recovery“
```

Im Root-`package.json` kommt `"workspaces": ["packages/*"]` dazu. `build`, `typecheck` und `test` bauen bzw. testen das Paket zuerst (`npm run build -w passkey-auth`). Die App und die Function importieren den **gebauten** Stand über `passkey-auth/*`. Node kann TS-Dateien in `node_modules` nicht direkt ausführen, deshalb gehen die Paket-Tests relativ auf `src`.

### 2.1 Gemeinsame Typen (`src/shared/types.ts`, lege ich in Phase 0 an)

```ts
export type AuthErrorCode =
  | 'invalid_username' | 'invalid_request' | 'challenge_expired' | 'verification_failed'
  | 'unknown_credential' | 'unauthorized' | 'last_passkey' | 'rate_limited'
  | 'not_supported' | 'cancelled' | 'network' | 'server_error';

export interface AuthUser { id: string; username: string }
export interface AuthSession { user: AuthUser; accessToken: string; expiresAt: number /* ms epoch */ }
export interface PasskeyInfo {
  id: string; name: string | null; createdAt: string; lastUsedAt: string | null;
  backedUp: boolean; deviceType: 'singleDevice' | 'multiDevice' | null; transports: string[];
}

// HTTP-Vertrag (alle POST, JSON; Fehler: { error: { code: AuthErrorCode; message?: string } })
export interface RegisterOptionsReq  { username: string }
export interface OptionsRes<T>       { flowId: string; options: T }      // T = WebAuthn *JSON-Options
export interface VerifyReq<R>        { flowId: string; response: R }    // R = WebAuthn *ResponseJSON
export interface SessionRes          { user: AuthUser; accessToken: string; expiresAt: number }
// /refresh, /logout: leerer Body, Cookie mm_rt

// WebAuthn-JSON-Typen (L3), selbst definiert, damit client/ keine Deps hat
export interface RegistrationOptionsJSON { /* rp, user{id,name,displayName}, challenge, pubKeyCredParams,
  timeout, excludeCredentials, authenticatorSelection, attestation */ }
export interface AuthenticationOptionsJSON { /* challenge, timeout, rpId, allowCredentials, userVerification */ }
export interface RegistrationResponseJSON { /* id, rawId, type, response{clientDataJSON, attestationObject,
  transports?}, clientExtensionResults, authenticatorAttachment? */ }
export interface AuthenticationResponseJSON { /* id, rawId, type, response{clientDataJSON, authenticatorData,
  signature, userHandle?}, clientExtensionResults */ }

// Server-Persistenz (Supabase-Adapter + Memory-Adapter implementieren das)
export interface ChallengeRecord { id: string; challenge: string; purpose: 'register' | 'login' | 'add';
  userId: string | null; username: string | null; expiresAt: number }
export interface StoredPasskey { id: string; userId: string; credentialId: string; publicKey: string;
  counter: number; transports: string[]; deviceType: 'singleDevice' | 'multiDevice'; backedUp: boolean }
export interface AuthStore {
  createChallenge(c: ChallengeRecord): Promise<void>;
  consumeChallenge(id: string, purpose: ChallengeRecord['purpose']): Promise<ChallengeRecord | null>;
  createUserWithPasskey(user: AuthUser, pk: Omit<StoredPasskey, 'id' | 'userId'>): Promise<void>;
  addPasskey(userId: string, pk: Omit<StoredPasskey, 'id' | 'userId'>): Promise<void>;
  findPasskey(credentialId: string): Promise<(StoredPasskey & { username: string }) | null>;
  listCredentialIds(userId: string): Promise<string[]>;
  touchPasskey(id: string, counter: number): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void>;
  rotateSession(oldHash: string, newHash: string, expiresAt: number): Promise<AuthUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export interface ServerConfig {
  rpId: string; rpName: string; origins: string[];
  jwt: { key: string /* HS256-Secret oder privater JWK als JSON */; issuer: string; ttlSec?: number /* 900 */ };
  refresh?: { ttlSec?: number /* 30 d */; absoluteTtlSec?: number /* 90 d */; cookieName?: string /* mm_rt */; cookiePath?: string /* /api/auth */ };
  challengeTtlSec?: number;  // 300
  basePath?: string;         // '/api/auth'
}
```

### 2.2 Server – `createAuthHandler(config, store, deps?) → (req: Request) => Promise<Response>`
`deps` = `{ now?, randomBytes? }` für deterministische Tests.

| Endpunkt | Auth | Ablauf |
|---|---|---|
| `POST /register/options` | – | Validiert den Namen (`username.ts`: trim, NFC, 2–32 Zeichen, keine Steuer- oder Zero-Width-Zeichen). Erzeugt UUID und Challenge (32 Byte) und speichert die Challenge mit `register`, `userId`, `username`. Liefert Options mit `residentKey: 'required'`, `userVerification: 'required'`, `attestation: 'none'`, Algorithmen `[-7 ES256, -257 RS256]` und `timeout: 120000`. |
| `POST /register/verify` | – | Verbraucht die Challenge (falls nicht vorhanden: `challenge_expired`). Dann `verifyRegistrationResponse` mit expectedChallenge, `expectedOrigin = origins`, `expectedRPID`, `requireUserVerification: true`. Anschließend `createUserWithPasskey` und Session ausstellen. |
| `POST /login/options` | – | Challenge mit `login`, `allowCredentials: []`, `userVerification: 'required'`. |
| `POST /login/verify` | – | Verbraucht die Challenge und sucht `findPasskey(response.id)` (fehlt er: `unknown_credential`). Wenn `userHandle` vorhanden ist, muss er zu `userId` passen, sonst `verification_failed`. Dann `verifyAuthenticationResponse` mit dem gespeicherten Key und Counter. **Counter-Regel:** Sind beide Werte > 0 und ist der neue ≤ dem alten, wird abgelehnt (geklonter Authenticator); synchronisierte Passkeys liefern 0. Danach `touchPasskey` und Session ausstellen. |
| `POST /refresh` | Cookie | `rotateSession` liefert bei Erfolg neues Cookie (`Max-Age` höchstens bis zur absoluten Grenze) und neues Access-Token, sonst 401 und das Cookie wird gelöscht. Der alte Token wirkt 60 s nach (Gnadenfrist), danach löscht seine Wiederverwendung die Session. |
| `POST /logout` | Cookie | `deleteSession` und Cookie löschen (`Max-Age=0`). Antwortet immer mit 204. |
| `POST /passkeys/options` | Bearer | Prüft das JWT (eigener Key). Challenge mit `add` und `userId`. `excludeCredentials = listCredentialIds`. |
| `POST /passkeys/verify` | Bearer | Wie register/verify, ruft am Ende aber `addPasskey` auf. |

- **Session ausstellen:** Access-JWT (`sub`, `role: 'authenticated'`, `aud: 'authenticated'`, `iss`, `iat`, `exp`, `user_metadata: { username }`), dazu Refresh-Token (32 Byte zufällig, SHA-256 in der DB) und `Set-Cookie`.
- **Querschnitt für jeden Request:**
  - Methode muss POST sein.
  - `Content-Type: application/json`, Body ≤ 16 KB.
  - Der `Origin`-Header muss in `origins` stehen. Das schützt die Cookie-Endpunkte gegen CSRF, zusätzlich zu `SameSite=Strict`.
  - Antworten tragen `Cache-Control: no-store`.
  - Fehler laufen einheitlich über `{ error: { code } }`. Keine Stacktraces oder Bibliotheksmeldungen nach außen. Die interne Ursache geht per `console.error` in die Logs.

### 2.3 Client – `createPasskeyAuth({ baseUrl = '/api/auth', fetch? }) → PasskeyAuthClient`

```ts
export interface PasskeyAuthClient {
  support(): Promise<{ webauthn: boolean; platform: boolean; conditional: boolean }>;
  register(username: string): Promise<AuthSession>;
  login(o?: { conditional?: boolean; signal?: AbortSignal }): Promise<AuthSession>;
  addPasskey(): Promise<void>;
  restore(): Promise<AuthSession | null>;        // POST /refresh; null bei 401
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;      // erneuert automatisch, wenn < 60 s Restlaufzeit
  getSession(): AuthSession | null;
  onChange(cb: (s: AuthSession | null) => void): () => void;
}
export class PasskeyAuthError extends Error { readonly code: AuthErrorCode }
```

- **`webauthn.ts`:** `createCredential(optionsJSON, signal)` und `getCredential(optionsJSON, { mediation, signal })`. Die Konvertierung JSON ↔ ArrayBuffer läuft nativ (`parseCreationOptionsFromJSON`, `toJSON`), mit Fallback auf `base64url.ts`. Fehler werden zugeordnet: `NotAllowedError`/`AbortError` → `cancelled`, `InvalidStateError` → `verification_failed` (Passkey schon registriert), `SecurityError` → `not_supported`.
- **`session.ts`:** Hält die Session im Speicher und deduppliziert parallele Refreshes (ein laufendes Promise). Über Tabs hinweg läuft `/refresh` nacheinander unter dem Web Lock `pa-refresh` (sofern vorhanden). Bei 401 wird die Session entfernt und `onChange(null)` ausgelöst.
- **`api.ts`:** `postJSON`, `credentials: 'same-origin'` und Fehler-Mapping. Ein Netzwerkfehler wird zu `network`.

### 2.4 Supabase-Adapter – `passkey-auth/supabase`
- **`createSupabaseAuthStore(supabaseAdmin)`:** implementiert `AuthStore`. Tabellen-Calls für find, list, touch, create und delete. Die Funktionen `pa_consume_challenge`, `pa_create_user_with_passkey` und `pa_rotate_session` laufen über `rpc`. Der Parameter ist ein schmales Interface `SupabaseLike` (nur `from` und `rpc`), damit Tests ohne supabase-js auskommen.
- **`createPasskeySupabaseClient(auth, url, anonKey)`:** `createClient(url, anonKey, { accessToken: () => auth.getAccessToken() })`. supabase-js schickt dann bei jedem Request das Passkey-JWT. `supabase.auth` ist in diesem Modus deaktiviert, das ist gewollt.
- **`createAccountApi(supabase)`** (Komfortfunktionen für Apps):
  - `listPasskeys()`, `renamePasskey(id, name)`
  - `deletePasskey(id)` → `rpc('pa_delete_passkey')`; `last_passkey` wird zu `PasskeyAuthError`
  - `renameUser(name)`, `deleteAccount()`

---

## 3. Protokoll-Flows

```
Registrierung
App            Client-Paket                 /api/auth (Function)                 Supabase (service_role)
 │ register(name) │                                │                                    │
 │───────────────>│ POST /register/options {name} ─>│ validate, uuid, challenge         │
 │                │                                │──────── insert auth_challenges ───>│
 │                │<── {flowId, options} ──────────│                                    │
 │                │ navigator.credentials.create() (Face ID / Touch ID / Sicherheitsschlüssel)
 │                │ POST /register/verify {flowId, response} ─>│                        │
 │                │                                │──────── rpc pa_consume_challenge ─>│
 │                │                                │ verifyRegistrationResponse         │
 │                │                                │──── rpc pa_create_user_with_passkey>│
 │                │                                │──────── insert auth_sessions ─────>│
 │                │<── {user, accessToken, expiresAt} + Set-Cookie mm_rt ───────────────│
 │<── AuthSession │

Login (usernameless)
 │ login()        │ POST /login/options ──────────>│ challenge (allowCredentials: [])   │
 │                │ navigator.credentials.get()  → Gerät zeigt eigene Passkeys für die RP-ID
 │                │ POST /login/verify ───────────>│ consume → findPasskey(credentialId)│
 │                │                                │ userHandle == user_id? → verify sig│
 │                │                                │ counter-Check → touch → Session    │
 │<── AuthSession │

Datenzugriff (später: Cloud-Sync)
App → supabase-js (accessToken: getAccessToken) → PostgREST prüft JWT → RLS: user_id = auth.uid()
```

---

## 4. Einbindung in Mental Math

- **Function:** `functions/api/auth/[[path]].ts` → `server/auth.ts`. Dort Env-Validierung und der Aufbau von `createAuthHandler(config, createSupabaseAuthStore(createClient(url, serviceKey)))`, einmal pro Isolate gecacht. Fehlende Env-Variablen führen zu 503 `server_error`. Vor dem Handler greift das Rate-Limit (30 Anfragen/min je IP, Durable-Object-Instanz „auth“, siehe O4).
- **Öffentliche Konfiguration:** `scripts/build-info.ts` schreibt zusätzlich `src/generated/public-config.ts` (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` aus `process.env`, leer, wenn nicht gesetzt). Ist sie leer, blendet die App das Konto-Feature aus.
- **Vendor-Bundle (D11):**
  - `src/vendor/auth.ts` re-exportiert `createPasskeyAuth`, `createPasskeySupabaseClient` und `createAccountApi`.
  - `scripts/vendor.ts` (esbuild, `format: 'esm'`, `minify`) überschreibt `dist/js/vendor/auth.js`.
  - `src/features/account.ts` kapselt den Lazy-Load, ein Singleton und den Zustand.
- **CSP** (`public/_headers`): `connect-src 'self' https://<projekt>.supabase.co` ergänzen. Der Wert wird beim Build aus `PUBLIC_SUPABASE_URL` eingesetzt (in `copy-static.ts`).
- **UI:** Einstellungen → „Daten & Account“. Die Cloud-Karte wird durch eine Konto-Karte ersetzt.
  - *Abgemeldet:* Hinweis, dass es keine Recovery gibt. Feld „Anzeigename“ mit „Konto erstellen“, darunter „Mit Passkey anmelden“. Wird WebAuthn nicht unterstützt, gibt es einen Hinweis statt der Buttons.
  - *Angemeldet:*
    - Name (änderbar)
    - Passkey-Liste mit Name, „synchronisiert“-Badge, Erstell- und Nutzungsdatum, Umbenennen und Löschen (beim letzten Passkey gesperrt)
    - „Passkey hinzufügen“, „Abmelden“
    - „Konto löschen“ (über `confirmDialog` mit `danger`)
  - Nach der Registrierung erscheint ein Toast mit der Empfehlung für einen zweiten Passkey.
- **Start:** `app.ts` ruft `account.restore()` nur auf, wenn `mm:v3:auth.hint = '1'` gesetzt ist (wird beim Login gesetzt, beim Logout entfernt). So gibt es für Nutzer ohne Konto keinen Netzwerkaufruf beim Start.
- **i18n:** neuer Namespace `account` (de/en), Fehlercodes werden zu Texten.
- **Release:** 1.9.0 mit Eintrag in `src/releases.ts` und neu erzeugtem `CHANGELOG.md`.
- **Nicht in v9:** `RemoteSyncProvider` und die Verknüpfung von `UserProfile.id` mit `users.id`. Das kommt mit der nächsten Stufe (Cloud-Sync).

---

## 5. Tests

| Ebene | Was | Wo |
|---|---|---|
| Unit Paket | base64url (Roundtrip, Padding, URL-Zeichen), Username-Regeln, Fehler-Mapping, Session-Refresh-Deduplizierung, JWT-Claims (TTL, `role`, `aud`, `sub`), Cookie-Attribute, Origin- und Methoden-Abwehr | `packages/passkey-auth/tests/*.test.ts` |
| Zeremonien Ende-zu-Ende | **Soft-Authenticator** (ES256 per WebCrypto, eigener kleiner CBOR-Encoder, `fmt: 'none'`) gegen `createAuthHandler` plus `MemoryAuthStore`, mit diesen Fällen:<br>• registrieren, abmelden, anmelden<br>• zweiter Passkey<br>• Challenge-Replay wird abgelehnt<br>• abgelaufene Challenge<br>• falsche Origin<br>• fremder `userHandle`<br>• Counter-Rückschritt<br>• Refresh-Rotation, alter Refresh-Token nach der Gnadenfrist ungültig<br>• verlorene `/refresh`-Antwort: alter Token innerhalb von 60 s, danach Diebstahlsignal<br>• absolute Sitzungsdauer (90 Tage) trotz Rotation<br>• Logout | `tests/ceremonies.e2e.test.ts` |
| Adapter | `SupabaseAuthStore` gegen ein Fake-`SupabaseLike`: richtige Tabellen, RPC-Namen und Parameter, Zuordnung der Zeilen | `tests/supabase-store.test.ts` |
| SQL/RLS | `sql/tests/rls_test.sql` im Supabase-SQL-Editor (O2) | manuell, Nutzer oder Phase 3 |
| App | Typecheck, alle bestehenden Tests, i18n-Parität mit `account` | wie bisher |
| Echtgerät | iPhone (Face ID, iCloud-Schlüsselbund) und Mac (Touch ID) auf `localhost:8788` mit dem Dev-Projekt, danach Produktion | Phase 3 mit dem Nutzer |

---

## 6. Delegation (Phase 2)

**Phase 0, ich:** Workspace und Paketgerüst (`package.json`, `tsconfig`, Exports), `src/shared/types.ts` (Vertrag aus 2.1) und das Interface des Soft-Authenticators in `tests/helpers/soft-authenticator.ts` (nur Signaturen). Die Abhängigkeiten installiere ich mit gepinnten Versionen: `@simplewebauthn/server`, `jose`, `@supabase/supabase-js`, `esbuild`. Danach können alle Pakete parallel laufen.

### Phase 2a – parallel, nur innerhalb von `packages/passkey-auth/`

| Paket | Modell | Dateien (exklusiv) | Abnahme |
|---|---|---|---|
| **A1 SQL & RLS** | Sonnet, low | `sql/001_passkey_auth.sql`, `sql/tests/rls_test.sql` | Genau Abschnitt 1, idempotent (`if not exists`, `create or replace`, `drop policy if exists`), alle `revoke`. Ich prüfe jede Policy und jeden Grant per Review. |
| **A2 WebAuthn-Wrapper** | Haiku | `src/shared/base64url.ts`, `src/client/webauthn.ts`, `tests/base64url.test.ts`, `tests/webauthn.test.ts` | Konvertierung nativ und per Fallback, Fehler-Mapping, Tests mit Fake-`navigator.credentials` |
| **A3 Client-Session & API** | Sonnet, low | `src/client/{api,session,index}.ts`, `src/shared/errors.ts`, `tests/client.test.ts` | API aus 2.3. Fake-fetch-Tests: Refresh wird einmal ausgelöst, Retry nach 401, `onChange`. A3 importiert A2 nur über den Typvertrag und prüft mit einem gemockten `webauthn`-Modul. |
| **A4 Server-Handler** | Sonnet, low | `src/server/*`, `src/shared/username.ts`, `tests/server-*.test.ts` | Endpunkte und Querschnitt aus 2.2 gegen `MemoryAuthStore`. `@simplewebauthn/server`-Aufrufe in Unit-Tests über `deps.verify*` injizierbar. |
| **A5 Soft-Authenticator** | Sonnet, low | `tests/helpers/soft-authenticator.ts`, `tests/helpers/cbor.ts`, `tests/soft-authenticator.test.ts` | Erzeugt Antworten, die `@simplewebauthn/server` direkt akzeptiert (Selbsttest ohne A4). |
| **A6 Supabase-Adapter** | Sonnet, low | `src/supabase/*`, `tests/supabase-store.test.ts` | 2.4, nur gegen `SupabaseLike`. RPC-Namen und Parameter genau wie in Abschnitt 1. |

### Phase 2b – nach 2a, parallel

| Paket | Modell | Dateien (exklusiv) | Abnahme |
|---|---|---|---|
| **B1 E2E-Zeremonien** | Sonnet, low | `packages/passkey-auth/tests/ceremonies.e2e.test.ts`, `README.md` | Alle Fälle aus Abschnitt 5 grün mit echtem `@simplewebauthn/server` |
| **B2 App: Server-Anbindung** | Haiku | `functions/api/auth/[[path]].ts`, `server/auth.ts`, `tests/auth-env.test.ts` | Env-Validierung, 503 ohne Konfiguration, Handler-Cache |
| **B3 App: Build & Konfiguration** | Haiku | `package.json` (Workspaces, Scripts), `scripts/{build-info,vendor,copy-static}.ts`, `public/_headers`, `.github/workflows/deploy.yml` (Build-Env `PUBLIC_*`) | `npm run build` erzeugt `dist/js/vendor/auth.js` ohne bare Imports. CSP enthält die Supabase-URL nur, wenn sie gesetzt ist. |
| **B4 App: Konto-UI** | Sonnet, low | `src/features/account.ts`, `src/views/settings.ts` (nur der Konto-Abschnitt), `src/i18n/locales/{de,en}/account.ts`, `src/i18n/index.ts` (Namespace registrieren), `public/css/style.css` (nur Konto-Abschnitt), `src/app.ts` (restore), `src/releases.ts` + `CHANGELOG.md` | UI aus Abschnitt 4 bei 320 px, alle Texte über `t()`, Fehlercodes übersetzt |

### Phase 3 – ich
1. **Review gegen eine Sicherheits-Checkliste:**
   - Policies und Grants (inkl. Default-Grants)
   - `security definer` mit `search_path`, `revoke execute`
   - Challenge einmalig und mit Ablaufzeit
   - Origin- und RP-ID-Prüfung, UV erzwungen
   - Prüfung des Counters und des `userHandle`
   - Cookie-Flags, JWT-Claims und TTL
   - keine Secrets im Client-Bundle (`grep` in `dist/` nach `service_role` und `sb_secret`)
   - Fehlermeldungen ohne interne Details
2. **Gesamtlauf:** Typecheck, App-Tests und Paket-Tests, Build, Precache.
3. **Lokal:** `wrangler pages dev` auf `localhost:8788` mit dem Dev-Supabase-Projekt. Registrieren, abmelden, anmelden, zweiter Passkey, letzten löschen (wird abgelehnt), Konto löschen. Zusätzlich RLS mit zwei Konten: Konto B sieht die Passkeys von A nicht.
4. **Echtgerät** mit dem Nutzer (iPhone und Mac), dann Deploy. Commit und Push macht der Nutzer.
