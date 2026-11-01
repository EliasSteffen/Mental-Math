# passkey-auth

Anmeldung mit **Benutzername + Passkey (WebAuthn)**, ohne E-Mail, ohne Passwort und **ohne Recovery**. Der Benutzername ist nur ein Anzeigename und darf mehrfach vorkommen. Das Paket ist framework-frei und besteht aus einem Fetch-API-Handler (Server), einem Browser-Client und einem Supabase-Adapter.

Wer alle Passkeys verliert, verliert das Konto. Die UI sollte deshalb nach der Registrierung einen zweiten Passkey anbieten (`addPasskey`).

## Sicherheitsmodell (Kurzfassung)

- **D1** Der Server prüft und speichert Passkeys (`service_role`), der Client hat kein INSERT auf `passkeys`.
- **D2** `auth.users` wird nicht genutzt. Der Server stellt selbst ein Supabase-kompatibles Access-JWT aus (`role`/`aud` = `authenticated`, 15 min).
- **D3** Signatur ES256 mit eigenem, in Supabase importiertem Key (`kid` im Header). HS256 mit Secret geht für andere Projekte.
- **D4** Refresh-Token: zufällig, in der DB nur als SHA-256, HttpOnly-Cookie `mm_rt` (`SameSite=Strict`, `Path=/api/auth`), Rotation bei jeder Nutzung, 30 Tage gleitend, höchstens 90 Tage ab Anmeldung. Alter Token: 60 s Gnadenfrist, danach gilt er als gestohlen (siehe unten). Das Access-Token liegt nur im Speicher.
- **D5** Same-origin (kein CORS); jeder Request braucht einen erlaubten `Origin`-Header (CSRF-Schutz).
- **D6** Login ohne Benutzername über Discoverable Credentials; `userHandle` muss zum Passkey-Besitzer passen. Counter-Regression bei Zähler > 0 wird abgelehnt.
- **D7** Der User entsteht erst nach erfolgreicher Prüfung (eine SQL-Transaktion).
- **D8** Challenges liegen serverseitig, gelten 5 min und sind einmalig (`DELETE … RETURNING`).

## Sitzungen: Rotation, Gnadenfrist, absolute Dauer

Eine Session ist eine Zeile in `auth_sessions`. `/refresh` rotiert sie über `pa_rotate_session` (der `MemoryAuthStore` bildet dieselbe Logik nach):

- **Normale Rotation:** Der Hash des Cookies steht in `token_hash`. Die Zeile bekommt den neuen Hash, der alte wandert nach `prev_hash`, `rotated_at = now()`. `expires_at` wird neu gesetzt (Default 30 Tage), aber nie über `absolute_expires_at` hinaus.
- **Gnadenfrist (60 s):** Kommt der alte Token noch einmal (Antwort von `/refresh` ging verloren, paralleler Tab), wird erneut rotiert und der User geliefert. `prev_hash` und `rotated_at` bleiben dabei, die Frist gleitet also nicht.
- **Mehrere Tabs:** Der Client schickt `/refresh` unter `navigator.locks.request('pa-refresh', …)` (exklusiv, wartend), damit sich parallele Rotationen nicht überholen und das Cookie kein schon ersetztes Token behält. Ohne Web Locks wie bisher; Option `locks` zum Injizieren, `null` schaltet den Lock ab.
- **Wiederverwendung:** Kommt der alte Token nach Ablauf der Frist, wird die ganze Session gelöscht (Diebstahlsignal). Auch der aktuelle Token ist dann wertlos, der Nutzer meldet sich neu an.
- **Absolute Dauer:** Beim Anlegen (Registrierung, Login, Wiederherstellung) setzt der Server `absolute_expires_at = jetzt + refresh.absoluteTtlSec` (Default 90 Tage). Danach hilft keine Rotation mehr. Das Cookie-`Max-Age` ist höchstens `min(ttlSec, absoluteTtlSec)`.
- **Altbestand:** Sessions aus Versionen vor dieser Logik haben `absolute_expires_at = null` und gelten als unbegrenzt (sie gleiten weiter, solange sie alle 30 Tage genutzt werden). Begrenzen per Hand: `update public.auth_sessions set absolute_expires_at = now() + interval '90 days' where absolute_expires_at is null;`

DB und Server lassen sich unabhängig ausrollen: Die Signatur von `pa_rotate_session` ist unverändert. Ein neuer Server ohne die neuen Spalten legt Sessions ohne absolute Grenze an (mit Log-Eintrag), ein alter Server mit neuer DB bekommt Gnadenfrist und Wiederverwendungserkennung, aber keine absolute Grenze.

## Installation und Exports

Npm-Workspace (`packages/passkey-auth`), gebaut mit `npm run build -w passkey-auth`.

| Export | Inhalt | Abhängigkeiten |
|---|---|---|
| `passkey-auth/client` | `createPasskeyAuth`, `PasskeyAuthError`, `normalizeUsername` | keine |
| `passkey-auth/server` | `createAuthHandler`, `MemoryAuthStore` | `@simplewebauthn/server`, `jose` |
| `passkey-auth/supabase` | `createSupabaseAuthStore`, `createPasskeySupabaseClient`, `createAccountApi` | Peer: `@supabase/supabase-js` |
| `passkey-auth/shared` | Typen, Fehlercodes, Base64url | keine |
| `passkey-auth/sql/*` | SQL-Dateien | |

## SQL-Setup

1. `sql/001_passkey_auth.sql` im Supabase-SQL-Editor ausführen (Tabellen, RLS, Funktionen), danach `sql/003_recovery_codes.sql` (Wiederherstellungscodes). Optional `sql/tests/rls_test.sql` (läuft in einer Transaktion mit Rollback). Beide Dateien sind idempotent; nach einem Update des Pakets `001` erneut ausführen (rüstet z. B. `prev_hash`, `rotated_at`, `absolute_expires_at` nach und ersetzt `pa_rotate_session`).
2. Eigenen Signing Key importieren (nur bei Projekten mit ES256): Dashboard, Project Settings, JWT Keys, „Create standby key“, „Import“, privaten JWK einfügen, dann „Rotate keys“. Die Data API akzeptiert nur den **aktuellen** Key, ein Standby-Key reicht nicht. Kontrolle: `<projekt>/auth/v1/.well-known/jwks.json` enthält die `kid`.
3. Supabase-JWKs tragen `key_ops: ["sign","verify"]`. Das Paket entfernt `key_ops`/`use` beim Import selbst, der JWK kann also unverändert in `AUTH_JWT_KEY` stehen.

## Server (Cloudflare Pages Function)

```ts
// functions/api/auth/[[path]].ts
import { createClient } from '@supabase/supabase-js';
import { createAuthHandler } from 'passkey-auth/server';
import { createSupabaseAuthStore } from 'passkey-auth/supabase';

interface Env {
  SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; AUTH_JWT_KEY: string;
  AUTH_RP_ID: string; AUTH_ORIGINS: string;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const handler = createAuthHandler({
    rpId: env.AUTH_RP_ID,
    rpName: 'Meine App',
    origins: env.AUTH_ORIGINS.split(','),
    jwt: { key: env.AUTH_JWT_KEY, issuer: `${new URL(request.url).origin}/api/auth` },
    // optional: refresh: { ttlSec: 30 * 86400, absoluteTtlSec: 90 * 86400 }
  }, createSupabaseAuthStore(admin));
  return handler(request);
};
```

Das Paket selbst begrenzt keine Anfragen. Ein Rate-Limit gehört vor den Handler, da es weder E-Mail noch Captcha gibt und `/login/options` bzw. `/register/options` bei jedem anonymen Aufruf eine Challenge-Zeile schreiben. In dieser App macht das `server/auth.ts`: 30 Anfragen/min je IP über alle Auth-Routen, darüber `429` mit `{ "error": { "code": "rate_limited" } }`.

## Client

```ts
import { createPasskeyAuth } from 'passkey-auth/client';
import { createPasskeySupabaseClient, createAccountApi } from 'passkey-auth/supabase';

const auth = createPasskeyAuth({ baseUrl: '/api/auth' });
const supabase = createPasskeySupabaseClient(auth, PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const account = createAccountApi(supabase); // Passkeys auflisten/umbenennen/löschen, Konto löschen

await auth.restore();                 // beim Start: Session per Cookie wiederherstellen
const { recoveryCode } = await auth.register('Anna'); // neues Konto + erster Passkey + Wiederherstellungscode (einmalig anzeigen)
await auth.login();                   // Discoverable Credential, ohne Benutzername
await auth.addPasskey();              // zweiten Passkey ergänzen
await auth.createRecoveryCode();      // angemeldet: neuer Code, der alte wird ungültig
await auth.recover('ABCDE-FGHJK-MNPQR-STVWX'); // alle Passkeys verloren: neuer Passkey per Code, liefert neuen Code
auth.onChange((s) => console.log(s?.user.username ?? 'abgemeldet'));
await auth.logout();
```

Fehler sind `PasskeyAuthError` mit `code` (`cancelled`, `challenge_expired`, `verification_failed`, `unauthorized`, `last_passkey`, `rate_limited`, `invalid_recovery_code`, `network` …).

## Endpunkte

Alle `POST`, JSON, `Content-Type: application/json`, Body bis 16 KB, `Origin` erforderlich. Fehler: `{ "error": { "code": "…" } }`.

| Pfad | Auth | Zweck |
|---|---|---|
| `/register/options` | - | Name prüfen, Challenge + User-UUID |
| `/register/verify` | - | Attestation prüfen, User + Passkey anlegen, Session |
| `/login/options` | - | Challenge, `allowCredentials: []` |
| `/login/verify` | - | Assertion prüfen, Session |
| `/refresh` | Cookie | Refresh-Token rotieren, neues Access-Token (sonst 401; alter Token 60 s Gnadenfrist) |
| `/logout` | Cookie | Session löschen, Cookie entfernen (immer 204) |
| `/passkeys/options` | Bearer | Challenge für zusätzlichen Passkey |
| `/passkeys/verify` | Bearer | Zusätzlichen Passkey speichern |
| `/recovery/status` | Bearer | Gibt es einen Wiederherstellungscode, seit wann |
| `/recovery/create` | Bearer | Neuen Code erzeugen (ersetzt den alten), Antwort `{ code }` |
| `/recovery/options` | - | Code prüfen, Challenge für neuen Passkey (`invalid_recovery_code` bei falschem Code) |
| `/recovery/verify` | - | Passkey anlegen, Code ersetzen, Session + neuer `recoveryCode` |

## Umgebungsvariablen

| Variable | Wo | Inhalt |
|---|---|---|
| `SUPABASE_URL` | Server | Projekt-URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server, geheim | `service_role` bzw. `sb_secret_…` |
| `AUTH_JWT_KEY` | Server, geheim | Privater ES256-JWK (JSON, mit `kid`) |
| `AUTH_RP_ID` | Server | Domain ohne Schema, z. B. `app.example.com` |
| `AUTH_ORIGINS` | Server | Erlaubte Origins, kommagetrennt |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Build | Öffentlich, für den Supabase-Client |

## Lokale Entwicklung

- `http://localhost:<port>` öffnen, **nicht** `127.0.0.1`: WebAuthn akzeptiert keine IP als RP-ID. Dann `AUTH_RP_ID=localhost` und `AUTH_ORIGINS=http://localhost:<port>`.
- Das Refresh-Cookie ist standardmäßig `Secure`. Auf `http://localhost` muss `refresh: { secure: false }` in der Server-Konfiguration stehen (nur lokal).
- `*.pages.dev`-Previews können keine Passkeys der Produktions-RP-ID nutzen.

## Tests

```
node --test tests/*.test.ts      # alle Tests
npm run typecheck -w passkey-auth
```

- Unit-Tests je Modul, SQL-Tests laufen gegen **PGlite** (Postgres als WASM) mit Supabase-Simulation (Rollen, Default-Grants, `auth.uid()`).
- `tests/helpers/soft-authenticator.ts` ist ein Software-Authenticator (ES256, `fmt: none`) mit echter Kryptografie.
- `tests/ceremonies.e2e.test.ts` verbindet Client, Handler und `MemoryAuthStore` mit echter WebAuthn-Prüfung; nur das Netzwerk ist ersetzt (Cookie-Jar, steuerbare Uhr).
