# Kopfrechner

Minimalistischer Kopfrechen-Trainer für Case Interviews (Consulting). Er ist in TypeScript geschrieben (Build per `tsc`) und speichert alle Daten lokal im Browser; mit Konto (Passkey) optional zusätzlich synchronisiert.

- **13 Kategorien** + „Alle Kategorien“: Kleines 1×1 (Drill, nicht in gemischten Runden), Multiplikation, Division, Große Zahlen, Prozente, Brüche, Wachstum, Business (Payback, Break-even, TCO, FTE, SLA …), Überschlag, Einheiten, Größenordnungen, Rechentricks, Exhibits
- **Exhibits**: Balken-, Säulen- und Tabellen-Schaubilder lesen und daraus rechnen (Anteil, Wachstum, gewichteter Durchschnitt, relativ vs. absolut)
- **Deutsch und Englisch** – auch Lernbereich, Lösungswege und KI-Erklärungen
- **Score pro Aufgabe** aus Ergebnis, Zeit im Verhältnis zur Zielzeit und Schwierigkeit
- **Skill pro Kategorie und Aufgabentyp** (0–100) aus Genauigkeit und Tempo der letzten Versuche
- **Schwächen-Erkennung** mit Diagnose (Nullen-Fehler, ungenau, zu langsam) und Tipps, dazu ein Modus „Schwächen trainieren“
- **Analyse-Seite** mit Kategorien, Fehlermustern, Verlauf, letzten Fehlern und Export

Details: [docs/SPEC.md](docs/SPEC.md)

- **Lösungsweg mit den Zahlen der Aufgabe** nach jeder Antwort, dazu „Wie geht das?“ als Hilfe vor dem Antworten (halbe Punkte)
- **Lernbereich** (`#/lernen`): Methode, Vorgehen, Trick und typische Fehler für alle Aufgabentypen, mit Beispiel zum Mitrechnen
- **Optionale KI-Erklärungen** (Google Gemini, nur auf Knopfdruck) – siehe unten
- **Tagesziel & Serie** (Minuten pro Tag, einstellbar), Aktivitäts-Heatmap, Level/XP
- **Schwierigkeitsstufen** Leicht/Mittel/Schwer – automatisch nach Skill oder fest
- **Fehler-Wiederholung über Tage** (Leitner-Boxen: 1, 2, 4, 7, 14 Tage) und eine **Tagesempfehlung** auf der Startseite
- **Verlauf pro Kategorie** (14 Tage) auf der Analyse-Seite
- **Themes** (Neon, OLED, Pastel, System), Einstellungen, Haptik/Sound, ±-Taste für Minus auf iOS
- **PWA**: auf dem Handy installierbar, funktioniert offline (außer KI)
- **iOS-App** aus demselben Code (Capacitor), gebaut und zu App Store Connect hochgeladen von GitHub Actions – siehe [iOS-App](#ios-app-app-store)

## Lokal starten

```bash
npm install        # TypeScript + @types/node (nur Dev-Dependencies)
```

```bash
npm run dev        # Build + http://localhost:8080 (ohne KI)
```

```bash
npm run dev:ai     # Build + http://localhost:8788 (mit KI-Function; liest GOOGLE_API_KEY aus .env)
```

```bash
npm run build      # clean (dist/ leeren) → tsc (src → dist/js, sw.ts → dist/sw.js) → copy-static (public/ → dist/) → precache (dist/precache.json)
npm run clean      # löscht dist/
npm run typecheck  # tsc über src, server, functions, tests, scripts
npm test           # Tests (node --test, TypeScript direkt per Type-Stripping)
```

`dist/` ist die **Build-Ausgabe** (gitignored) und wird komplett neu erzeugt. Quellen für statische Dateien liegen in `public/`, Build-Skripte in `scripts/`. Der Service Worker liest Version und Precache-Liste zur Laufzeit aus `dist/precache.json`.

> Einmalige Migration für bestehende Klone: `git rm -r --cached public/js public/sw.js public/precache.json`

## Deployment (GitHub Actions → Cloudflare Pages)

- **Repo:** `mental-math`
- **Cloudflare-Pages-Projekt:** `mental-math` (→ `mental-math.pages.dev`)
- **Domain:** `mental-math.elias-steffen.de`

Jeder Push auf `main` startet [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Der Workflow führt erst die Tests aus und deployt dann `dist/` (Build-Ausgabe aus `public/` + `src/`) auf Cloudflare Pages. Schlagen die Tests fehl, wird nichts deployt. Manuell anstoßen lässt er sich über **Actions → Deploy → Run workflow**.

### Einmalige Einrichtung

1. **Cloudflare-API-Token** anlegen: Dashboard → *My Profile → API Tokens → Create Token → Create Custom Token*
   - Berechtigung: **Account · Cloudflare Pages · Edit**
   - Account Resources: nur dein Account
2. **Account-ID** kopieren: Dashboard → *Workers & Pages* (rechte Spalte) oder aus der URL `dash.cloudflare.com/<account-id>/…`
3. **Pages-Projekt einmalig anlegen** (der Workflow legt es nicht selbst an):

   ```bash
   npx wrangler login
   ```

   ```bash
   npx wrangler pages project create mental-math --production-branch=main
   ```

4. **GitHub-Secrets** im Repo setzen, entweder unter *Settings → Secrets and variables → Actions* oder per CLI:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   ```

   ```bash
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

5. **Auf `main` pushen.** Danach ist die Seite unter `https://mental-math.pages.dev` erreichbar.
6. **Eigene Domain:** Pages-Projekt `mental-math` → *Custom domains → Set up a custom domain* → `mental-math.elias-steffen.de`. Liegt die Zone `elias-steffen.de` bei Cloudflare, wird der DNS-Eintrag automatisch angelegt.

> ⚠️ Das Pages-Projekt **nicht zusätzlich** per „Connect to Git“ mit GitHub verbinden, sonst wird doppelt deployt.

**Manuell deployen (ohne GitHub):**

```bash
npm run build
npx wrangler pages deploy dist --project-name=mental-math
```

`public/_headers` (landet über `dist/_headers` im Deployment) setzt Security-Header (u. a. eine strikte Content-Security-Policy). Die App lädt nichts von externen Quellen.

## KI-Erklärungen (optional)

Der Button „KI-Erklärung“ (nach einer Antwort) und „KI: anders erklären“ (im Lernbereich) rufen die Cloudflare Pages Function `functions/api/explain.ts` auf. Die Logik dazu steckt in `server/explain.ts`. Die Function fragt Google Gemini an, Standardmodell ist `gemini-flash-lite-latest`. **Der API-Key liegt nur als Cloudflare-Secret auf dem Server und erreicht nie den Browser.** Ist kein Key gesetzt, blendet die App die KI-Buttons automatisch aus.

**Einrichten (einmalig):**

```bash
npx wrangler pages secret put GOOGLE_API_KEY --project-name=mental-math
```

Alternativ im Dashboard unter *Workers & Pages → mental-math → Settings → Variables and Secrets → Add* mit Typ **Secret** und Name `GOOGLE_API_KEY`. Ein neuer Secret-Wert wirkt erst ab dem nächsten Deployment, danach also einmal neu deployen (*Actions → Deploy → Run workflow*). Optional wählst du mit der Variable `GEMINI_MODEL` ein anderes Modell.

**Schutz vor Missbrauch des Free Tiers:**
- Der Endpoint nimmt nur strukturierte Aufgabendaten an (bekannter Aufgabentyp, kurze Felder), keinen Freitext. Er taugt also nicht als allgemeiner Chat-Proxy.
- Er prüft den `Origin`-Header und begrenzt die Anfragen: 60 pro Minute insgesamt, pro IP 15 pro Minute und 200 pro Tag. Gezählt wird global über ein Durable Object (siehe unten); ohne dieses Binding nur pro Worker-Instanz (Best Effort).
- Die App schickt die UI-Sprache mit (`de`/`en`); die KI antwortet in dieser Sprache.
- Der Browser speichert Antworten zwischen (`localStorage`), sodass die gleiche Frage kein zweites Mal Kontingent kostet.
- Im Google-Cloud-Projekt des Keys sollte **kein Billing aktiv** sein. Dann kann im schlimmsten Fall nur das Gratis-Kontingent ausgehen, Kosten entstehen keine. Zusätzlich lohnt es sich, den Key in der Google Cloud Console auf die „Generative Language API“ zu beschränken.

**Lokal:** `npm run dev:ai` liest `GOOGLE_API_KEY` automatisch aus `.env`. `.env` und `.dev.vars` stehen in `.gitignore` und dürfen nie committet werden.

### Globales Rate-Limit (Durable Object, einmalig einrichten)

Pages Functions können keine eigenen Durable Objects definieren. Deshalb stellt ein kleiner Worker (`workers/rate-limiter`, Name `mental-math-rate-limiter`, ohne öffentliche Route) das Durable Object `RateLimiter` bereit. `/api/explain` nutzt es über das Binding `RATE_LIMITER`; fehlt das Binding oder ist das Objekt nicht erreichbar, greift das Limit pro Instanz.

1. API-Token zusätzlich mit **Account · Workers Scripts · Edit** ausstatten (Dashboard → *My Profile → API Tokens*).
2. Worker deployen: *Actions → Deploy Rate Limiter → Run workflow* (läuft danach automatisch bei Änderungen unter `workers/rate-limiter/`), oder lokal:

   ```bash
   npx wrangler deploy --config workers/rate-limiter/wrangler.toml
   ```

3. Binding anlegen: *Workers & Pages → mental-math → Settings → Bindings → Add → Durable Object*, Variable `RATE_LIMITER`, Namespace `mental-math-rate-limiter_RateLimiter` – für Production (und bei Bedarf Preview), danach neu deployen.
4. Optional zusätzlich: eine WAF-Rate-Limiting-Regel für `/api/` auf der Zone `elias-steffen.de` (Free Plan: 1 Regel, 10-Sekunden-Fenster).

## Erinnerungen (Push-Benachrichtigungen)

Unter *Profil → Erinnerungen* schaltet man Push-Benachrichtigungen pro Gerät ein. Ein Konto ist dafür nicht nötig.

| Erinnerung | Wann | Entfällt, wenn … |
|---|---|---|
| **Täglich** | zur gewählten Uhrzeit an den gewählten Wochentagen | das Tagesziel heute schon erreicht ist (abschaltbar) |
| **Serie retten** | um 20 Uhr | das Tagesziel erreicht ist oder keine Serie läuft |
| **Wiederholungen** | sobald Leitner-Wiederholungen fällig sind, zwischen 9 und 20 Uhr, höchstens einmal am Tag | nichts fällig ist |
| **Lern-Hinweis** | sonntags um 10 Uhr: ein Rechentrick, bevorzugt zu einer Schwäche | – |

Zusätzlich gilt: keine Erinnerung, wenn die App in den letzten 20 Minuten offen war; zwischen zwei Benachrichtigungen liegen mindestens 90 Minuten (außer bei der täglichen). Uhrzeiten gelten in der Zeitzone des Geräts, auch über die Zeitumstellung hinweg.

**So funktioniert es:** Die App abonniert Web Push (VAPID) und meldet Einstellungen, Zeitzone und einen knappen Lernstand (Serie, Tagesziel erreicht, fällige Wiederholungen, bis zu 3 schwache Aufgabentypen) an `/api/push` (`functions/api/push/[[path]].ts` → `server/push.ts`). Ein Supabase-Cron (`pg_cron` + `pg_net`) ruft jede Minute `/api/push/tick` auf; der Server holt die fälligen Abos, entscheidet (`src/core/reminders.ts`), verschlüsselt die Nachricht (RFC 8291, `server/push-crypto.ts`) und schickt sie an den Push-Dienst des Browsers. Der Service Worker zeigt sie an und öffnet beim Antippen die passende Seite. Das Gerät erzeugt eine zufällige ID und ein Geheimnis; gespeichert wird nur dessen SHA-256-Hash. Ausschalten löscht das Abo auf dem Server.

**Einrichten (einmalig):** Voraussetzung ist dasselbe Supabase-Projekt wie für das Konto, also die Pages-Secrets `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`. Dann im Supabase-SQL-Editor nacheinander ausführen:

1. `sql/004_push.sql` – Tabellen `push_subscriptions` und `push_config` (nur `service_role`), Funktionen für den Takt
2. `sql/005_push_cron.sql` – aktiviert `pg_cron` und `pg_net` und plant den Aufruf jede Minute

Mehr ist nicht nötig: Die VAPID-Schlüssel erzeugt der Server beim ersten Aufruf selbst und legt sie in `push_config` ab; das Token, mit dem der Cron `/api/push/tick` aufruft, erzeugt das SQL-Skript. Bis die Skripte gelaufen sind, blendet die App die Erinnerungen aus.

- **Adresse des Takts:** Standard ist `https://mental-math.pages.dev/api/push/tick` (gleiche Production-Deployment wie die eigene Domain, aber ohne deren Bot-Schutz, der Aufrufe von Supabase sonst blockieren könnte). Anderes Pages-Projekt: `update public.push_config set tick_url = 'https://<projekt>.pages.dev/api/push/tick' where id = 1;`
- **iPhone/iPad** (ab iOS 16.4): Web Push gibt es nur in der installierten App – erst *Teilen → Zum Home-Bildschirm*, dann in der App einschalten.
- **iOS-App:** braucht nichts davon. Dort plant das Gerät die Erinnerungen selbst als lokale Benachrichtigungen (`src/core/reminder-plan.ts` spielt dieselben Regeln aus `src/core/reminders.ts` durch, zwei Wochen im Voraus).
- **Optional:** Pages-Variable `PUSH_SUBJECT` (`mailto:…` oder `https://…`) als Kontakt für die Push-Dienste; Standard ist die eigene Origin.
- **Takt prüfen:** `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;` und `select status_code, content::text from net._http_response order by created desc limit 5;` – erwartet ist `200` mit `{"claimed":…,"sent":…}`.
- **Takt stoppen:** `select cron.unschedule('mental-math-push');`

## iOS-App (App Store)

Dieselbe Web-App läuft als native iOS-App ([Capacitor](https://capacitorjs.com)). `ios/` enthält das Xcode-Projekt; die Web-Dateien aus `dist/` kopiert `npx cap sync ios` bei jedem Build hinein. **Bei Änderungen an der App ist an der iOS-Seite nichts anzupassen** – die Pipeline baut sie mit.

**Was in der App anders ist** – alles in `src/platform/` (Feature-Code ruft nur `src/platform/index.ts` auf):

| | Website | iOS-App |
|---|---|---|
| Erinnerungen | Web Push, der Server plant | lokale Benachrichtigungen, das Gerät plant (gleiche Regeln) |
| Haptik | `navigator.vibrate` (nur Android) | Taptic Engine |
| Export | Download | Teilen-Menü („In Dateien sichern“) |
| Externe Links | neuer Tab | In-App-Browser |
| API | relative Pfade | `PUBLIC_API_ORIGIN` (Standard `https://mental-math.elias-steffen.de`); CORS nur für `capacitor://localhost` (`functions/api/_middleware.ts`) |
| Konto | Passkey im Browser, Refresh-Token als HttpOnly-Cookie | Passkey über AuthenticationServices (`ios/App/App/NativeAuthPlugin.swift`), Refresh-Token im Keychain (Header statt Cookie) |

`tests/platform-guard.test.ts` schlägt fehl, sobald außerhalb von `src/platform/` eine Browser-API benutzt wird, die in der App nicht funktioniert (z. B. `navigator.vibrate`, `fetch('/api/…')`, Web Push). Dann die Funktion in `src/platform/index.ts` ergänzen (Web- und App-Variante) und von dort aufrufen.

**Lokal** (Xcode nötig):

```bash
npm run ios:sync
```

```bash
npm run ios:open
```

**Pipeline** (`.github/workflows/ios.yml`, macOS-Runner – für öffentliche Repos kostenlos): Bei jedem Push und Pull Request laufen Typprüfung, Tests und ein Simulator-Build. Steigt auf `main` die Version in `package.json`, wird die App signiert, archiviert und zu App Store Connect hochgeladen (Version = `package.json`, Build-Nummer = Lauf-Nummer). Per Hand: *Actions → iOS → Run workflow*. Danach in App Store Connect den Build der Version zuordnen und zur Prüfung einreichen.

### Einmalige Einrichtung

1. **Apple Developer Program** (99 €/Jahr). Team-ID notieren: developer.apple.com → *Membership details*.
2. **App anlegen:** App Store Connect → *Apps → +* → iOS, Name, Primärsprache Deutsch, Bundle-ID `de.eliassteffen.mentalmath` (fehlt sie in der Liste: developer.apple.com → *Identifiers → +*, Capability **Associated Domains** an).
3. **API-Schlüssel:** App Store Connect → *Benutzer und Zugriff → Integrationen → App Store Connect API → Team-Schlüssel*, Rolle **Admin** (damit Xcode Zertifikate und Profile selbst verwalten darf). Die `.p8`-Datei lässt sich nur einmal laden.
4. **GitHub** (*Settings → Secrets and variables → Actions*):
   - Secrets `ASC_KEY_ID`, `ASC_ISSUER_ID` und `ASC_KEY_P8` (Inhalt der `.p8`-Datei)
   - Variable `APPLE_TEAM_ID` – damit erzeugt auch die Website-Pipeline `/.well-known/apple-app-site-association`, die die Passkeys der App mit der Domain verknüpft
   - optional Secrets `IOS_CERT_P12_BASE64` und `IOS_CERT_PASSWORD`: das „Apple Development“-Zertifikat aus der Schlüsselbundverwaltung als `.p12` (`base64 -i zertifikat.p12 | pbcopy`). Ohne legt Xcode bei jedem Upload ein neues Entwicklungszertifikat an.

   ```bash
   gh variable set APPLE_TEAM_ID
   ```

   ```bash
   gh secret set ASC_KEY_P8 < AuthKey_XXXXXXXXXX.p8
   ```

5. **Passkeys:** `AUTH_RP_ID` muss `mental-math.elias-steffen.de` sein, die Domain aus `ios/App/App/App.entitlements`. Nach dem nächsten Website-Deploy prüfen:

   ```bash
   curl -i https://mental-math.elias-steffen.de/.well-known/apple-app-site-association
   ```

### Vor der ersten Einreichung (App Store Connect)

- **URLs:** Datenschutzerklärung und Support
- **App-Datenschutz:** ohne Konto keine Daten; mit Konto Nutzer-ID und Trainingsdaten (mit der Identität verknüpft, App-Funktionalität), kein Tracking. KI-Erklärungen schicken nur Aufgabendaten an Google Gemini. `ios/App/App/PrivacyInfo.xcprivacy` entsprechend prüfen.
- **Screenshots** 6,9″ (z. B. iPhone 17 Pro Max im Simulator), Kategorie *Bildung*, Altersfreigabe
- **Hinweise für die Prüfung:** Die App funktioniert ohne Konto; Konto (Passkey) und KI-Erklärungen sind optional; Erinnerungen unter *Profil → Erinnerungen*
- **EU:** Händlerstatus nach dem Digital Services Act angeben
- Exportkonformität ist im `Info.plist` erledigt (`ITSAppUsesNonExemptEncryption = NO`)

## Daten

Fortschritt und Statistiken liegen lokal in IndexedDB. Ohne Konto bleibt alles auf dem Gerät, es gibt kein Tracking. Mit Konto (Passkey) werden die Trainingsdaten über Supabase zwischen deinen Geräten synchronisiert. In den Einstellungen lassen sich die Daten als JSON exportieren, importieren oder löschen.

**Wiederherstellungscode:** Beim Anlegen des Kontos zeigt die App einmalig einen Code (20 Zeichen). Wer alle Passkeys verliert, legt damit unter *Einstellungen → Daten & Account → Passkey verloren?* einen neuen Passkey an; danach gibt es einen neuen Code. Gespeichert wird nur ein SHA-256-Hash.

**Supabase-SQL (einmalig, in dieser Reihenfolge im SQL-Editor):** `packages/passkey-auth/sql/001_passkey_auth.sql`, `packages/offline-sync/sql/offline_sync_guard.sql`, `sql/002_training_data.sql`, `packages/passkey-auth/sql/003_recovery_codes.sql`, für Erinnerungen außerdem `sql/004_push.sql` und `sql/005_push_cron.sql`. Alle Skripte sind idempotent.

## Struktur

```
src/
  types.ts          zentrale Typen
  core/             DOM-frei: numbers, rng, units, catalog, generators/, solutions/, reminders,
                    methods, scoring, review, progress, modes, daily, chain
  data/storage.ts   localStorage (Schema + Migration)
  ui/               dom, charts, icons, keypad, fx, theme, toast
  features/         ai-client, activity, account, sync, reminder-input
  platform/         Website vs. iOS-App: index (einzige Schnittstelle), web, native (Capacitor),
                    reminders (web-push | native-reminders), native-auth
  vendor/           esbuild-Einstiege: auth, storage, native (Capacitor-Plugins, nur in der App)
  views/            home, lernen, analyse, settings, daily, chain, train/
  router.ts  app.ts
  sw.ts             Service Worker (→ dist/sw.js)
public/             ← statische Quellen (index.html, css/, icons/, manifest, favicon, _headers)
dist/               ← Build-Ausgabe, nicht versioniert, wird ausgeliefert
  js/ sw.js precache.json + kopierte public/-Dateien
scripts/            Build-Skripte (laufen mit node): clean.ts, copy-static.ts, precache.ts (→ dist/precache.json)
functions/api/explain.ts    ← Cloudflare Pages Function (KI-Endpoint, bleibt im Repo-Root)
server/explain.ts           ← Validierung, Prompt (de/en), Gemini-Aufruf
server/rate-limit.ts        ← Rate-Limit-Logik (In-Memory-Fallback + Durable-Object-Client)
functions/api/push/[[path]].ts ← Push-Erinnerungen (Abo, Einstellungen, Test, Cron-Takt)
server/push*.ts             ← Push-Handler, Web-Push-Verschlüsselung + VAPID, Supabase-Speicher (Texte: src/core/reminder-messages.ts)
server/app-origin.ts        ← CORS für die iOS-App (capacitor://localhost), functions/api/_middleware.ts
ios/                        ← Xcode-Projekt der iOS-App (Capacitor), eigenes Plugin NativeAuthPlugin.swift
capacitor.config.json       ← App-ID, Name, WebView-Optionen
sql/                        ← Supabase-SQL der App (Trainingsdaten, Push + Cron)
workers/rate-limiter/       ← Worker mit dem Durable Object RateLimiter (eigener Deploy-Workflow)
tests/                      ← node --test (*.test.ts)
docs/                       ← SPEC, ARCHITECTURE, PLAN-v5
.github/workflows/deploy.yml  ← CI/CD: Tests + Build + Deploy auf Cloudflare Pages
.github/workflows/ios.yml     ← iOS: Simulator-Build bei jedem Push, Upload zu App Store Connect bei neuer Version
```
