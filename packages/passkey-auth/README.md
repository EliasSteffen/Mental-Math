# passkey-auth

Anmeldung mit **Benutzername + Passkey (WebAuthn)**, ohne E-Mail, ohne Passwort und **ohne Recovery**. Der Benutzername ist nur ein Anzeigename und darf mehrfach vorkommen. Das Paket ist framework-frei und besteht aus einem Fetch-API-Handler (Server), einem Browser-Client und einem Supabase-Adapter.

Wer alle Passkeys verliert, verliert das Konto. Die UI sollte deshalb nach der Registrierung einen zweiten Passkey anbieten (`addPasskey`).

## Sicherheitsmodell (Kurzfassung)

- **D1** Der Server prüft und speichert Passkeys (`service_role`), der Client hat kein INSERT auf `passkeys`.
- **D2** `auth.users` wird nicht genutzt. Der Server stellt selbst ein Supabase-kompatibles Access-JWT aus (`role`/`aud` = `authenticated`, 15 min).
- **D3** Signatur ES256 mit eigenem, in Supabase importiertem Key (`kid` im Header). HS256 mit Secret geht für andere Projekte.
- **D4** Refresh-Token: zufällig, in der DB nur als SHA-256, HttpOnly-Cookie `mm_rt` (`SameSite=Strict`, `Path=/api/auth`), Rotation bei jeder Nutzung, 30 Tage. Das Access-Token liegt nur im Speicher.
- **D5** Same-origin (kein CORS); jeder Request braucht einen erlaubten `Origin`-Header (CSRF-Schutz).
- **D6** Login ohne Benutzername über Discoverable Credentials; `userHandle` muss zum Passkey-Besitzer passen. Counter-Regression bei Zähler > 0 wird abgelehnt.
- **D7** Der User entsteht erst nach erfolgreicher Prüfung (eine SQL-Transaktion).
- **D8** Challenges liegen serverseitig, gelten 5 min und sind einmalig (`DELETE … RETURNING`).

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

1. `sql/001_passkey_auth.sql` im Supabase-SQL-Editor ausführen (Tabellen, RLS, Funktionen), danach `sql/003_recovery_codes.sql` (Wiederherstellungscodes). Optional `sql/tests/rls_test.sql` (läuft in einer Transaktion mit Rollback).
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
  }, createSupabaseAuthStore(admin));
  return handler(request);
};
```

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
| `/refresh` | Cookie | Refresh-Token rotieren, neues Access-Token (sonst 401) |
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
- Empfehlung: Rate-Limit auf `POST /api/auth/*/options` (z. B. 20/min/IP), da es weder E-Mail noch Captcha gibt.

## Tests

```
node --test tests/*.test.ts      # alle Tests
npm run typecheck -w passkey-auth
```

- Unit-Tests je Modul, SQL-Tests laufen gegen **PGlite** (Postgres als WASM) mit Supabase-Simulation (Rollen, Default-Grants, `auth.uid()`).
- `tests/helpers/soft-authenticator.ts` ist ein Software-Authenticator (ES256, `fmt: none`) mit echter Kryptografie.
- `tests/ceremonies.e2e.test.ts` verbindet Client, Handler und `MemoryAuthStore` mit echter WebAuthn-Prüfung; nur das Netzwerk ist ersetzt (Cookie-Jar, steuerbare Uhr).
