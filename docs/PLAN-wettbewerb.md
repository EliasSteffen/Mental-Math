# Plan: Rangliste und Wettbewerbe (Daily Challenge mit einem Versuch)

Stand: 2026-11-08 · Basis: `develop` @ `e8a8f43` (1.16.2)

Inhalt:
0. Befund „Webapp lädt nicht“
1. Git-Stand: was ist noch nicht gemergt
2. Ziel und Regeln
3. Was es heute schon gibt
4. Architektur
5. Datenmodell (Supabase)
6. API (Pages Functions)
7. Oberfläche
8. Fairness und Grenzen
9. Datenschutz
10. Phasen
11. Tests
12. Offene Entscheidungen

---

## 0. Befund „Webapp lädt nicht“ (8.11., 18 Uhr)

Geprüft wurde aus der Cloud-Sitzung, im Chromium-Browser als Desktop und als iPhone 15 mit `de-DE`:

| Adresse | HTTP | Live-Version | Ergebnis |
|---|---|---|---|
| `https://mental-math.elias-steffen.de` | 200 | **1.15.0** (`d2b60e8`, `release`) | lädt, alle Tabs und die Daily laufen, keine Konsolenfehler |
| `https://preview.mental-math.elias-steffen.de` | 200 | **1.16.2** (`e8a8f43`, `develop`, lokal deployt am 5.11.) | lädt, wie oben |
| `*.pages.dev` (beide Projekte) | 200 | – | lädt |
| `/api/auth/*`, `/.well-known/apple-app-site-association` | 401/200 wie erwartet | – | Functions laufen |
| Beta-Live-Update `preview…/ota/manifest.json` | 200 | 1.16.2, Schlüssel `ea1e…` | signiert vorhanden |

Zusätzlich gebaut und getestet:
- `develop` als Produktions- und als Vorschau-Build, mit CSP über `wrangler pages dev`: lädt.
- Das Update eines Service Workers von 1.15.0 auf 1.16.2 mit zweimal Neuladen: lädt.
- `npm run typecheck` und `npm test` auf `develop` sind grün (723 + 111 + 144 Tests, 1 übersprungen).

**In einem frischen Browser lässt sich der Fehler nicht nachstellen.** Safari/WebKit war hier nicht verfügbar. Wahrscheinlich hängt es an Zustand auf dem Gerät:
1. Eine installierte PWA oder ein Safari-Tab mit altem Service-Worker-Cache. Schnelltest: dieselbe Adresse im privaten Tab öffnen. Lädt es dort, liegt es am Gerätezustand.
2. Die iOS-App aus TestFlight mit Live-Update: Beim Start wartet `bootPlatform()` bis zu 5 s auf ein Neuladen (`src/app.ts`).
3. Gespeicherte Daten, an denen der Start abbricht.

Um das gezielt zu beheben, fehlen noch diese Angaben:
- **Welche Adresse oder App?** (Website, Vorschau, PWA vom Home-Bildschirm oder TestFlight-App)
- **Welches Gerät und welcher Browser?**
- **Was ist genau zu sehen?** (weiße Seite, nur die Tab-Leiste, Endlos-Laden, Fehlermeldung)
- Wenn möglich die Konsole aus dem Safari Web-Inspektor (Mac → Safari → Entwickler → [Gerät]).

Daneben gilt: **GitHub Actions deployt seit dem 5.11. nicht mehr.** Das Kontingent ist aufgebraucht, jeder Lauf bricht nach 3–6 s ab. Neue Stände kommen nur noch über `npm run local:preview` bzw. `local:production` online. Ein Push auf `develop` allein ändert die Vorschau also nicht.

---

## 1. Git-Stand: was ist noch nicht gemergt

| Branch / PR | Inhalt | Zustand | Empfehlung |
|---|---|---|---|
| **PR #15** `develop` → `release` (Draft) | Release 1.16: Live-Updates (#14, #16), „Schritt für Schritt“ (#13), Wiederholungssperre (#12), CI-Zertifikate (#17), lokale Pipeline (20 Commits) | Produktion steht noch auf **1.15.0**. Die Checks sind rot, weil das Actions-Kontingent fehlt, nicht wegen des Codes (lokal grün). | Nach TestFlight-Test mergen: `local:testflight` → testen → PR mergen → `local:production`. Achtung: `local:production` prüft das Release-Gate (iOS-Build desselben Codes) **nicht** selbst. |
| `claude/ecstatic-feynman-yvfbb7` (kein PR) | iPad-Unterstützung (nur iPhone/iPad, kein Mac), Paket `packages/learning-engine` mit Labor, `docs/ROADMAP.md` (7 Commits vom 2.11.) | Basis ist 1.15.0. Direktes Mergen ergibt Konflikte in 4 Dateien (Workflows, README). Die beiden CI-Commits stecken schon umgebaut in `develop`. | Neuer Branch von `develop`, die Commits `fa3c115`, `0b2e39a` und `2c8a8fd` cherry-picken (**geht konfliktfrei**, Typprüfung grün, 727/728 Tests). Danach `npm run native:stamp`, denn das iPad ist eine native Änderung und braucht einen Store-Build. Dann `e24b52f` (kein Mac) und die Doku mit Konflikten nur in README/ROADMAP von Hand. Kommt mit 1.17. |
| `pr-assets/lernen-schritt-fuer-schritt` | Nur Screenshots für PR #13 (verwaister Branch) | #13 ist gemergt | löschen |
| `release` | 1.15.0 = Produktion | – | – |
| `claude/peaceful-pasteur-7jbvvi` | dieser Plan | – | – |

Die Roadmap im ungemergten Branch führt die Rangliste bereits als Idee **F10 „Lerngruppen/Rangliste (Daily Challenge im Vergleich)“**, Aufwand L, „berührt Datenschutz“. Dieser Plan konkretisiert F10.

---

## 2. Ziel und Regeln

**Ziel:** Alle bekommen am selben Tag dieselben Aufgaben, jede Person hat **genau einen gewerteten Versuch**, und das Ergebnis erscheint in einer Rangliste. Dasselbe Prinzip gilt für Wettbewerbe mit eigenem Zeitraum und eigenem Aufgabenset (z. B. „Prozente-Woche“).

Regeln für gewertete Runden:
- **Ein Versuch.** Der Versuch zählt ab „Start“. Wer abbricht, die App schließt oder neu lädt, hat ihn verbraucht. Offene Aufgaben gelten dann als „Weiß nicht“ (0 Punkte).
- **Gleiche Bedingungen:** kein „Wie geht das?“, keine Atempause, Timer immer an, feste Stufe.
- **Erlaubt:** „Weiß nicht“ (0 Punkte, weiter).
- **Danach:** „Nochmal üben (ungewertet)“ mit denselben Aufgaben, für den Lerneffekt. Das Ergebnis zählt nicht für die Rangliste.
- **Wertung:** Punkte absteigend, bei Gleichstand weniger Zeit, dann früher abgegeben.
- **Tag:** 00:00–24:00 **Europe/Berlin** für alle (Entscheidung offen, siehe §12). Ein Countdown zeigt die nächste Challenge.
- **Konto nötig für die Wertung.** Ohne Konto bleibt die Daily wie heute: lokal und ungewertet, mit einem Hinweis „Mit Konto in der Rangliste“.

---

## 3. Was es heute schon gibt

| Baustein | Ort | Für den Wettbewerb |
|---|---|---|
| Daily: 15 Aufgaben, Stufe 2, für alle gleich (Seed aus dem Datum) | `src/core/daily.ts` | Wiederverwenden. Der Seed ist aber öffentlich: Künftige Tage lassen sich vorab erzeugen. |
| Tag = **lokale** Zeitzone | `dayKey()` in `src/core/progress.ts` | Für den Wettbewerb eine feste Zeitzone nötig |
| Ergebnis nur lokal; ein neuer Versuch **überschreibt** es | `setDailyResult()` in `src/data/storage.ts`, `views/train/result.ts` | Ein-Versuch-Regel fehlt |
| Bewertung inkl. Zeitfaktor, „Wie geht das?“ halbiert die Punkte | `src/core/scoring.ts` | Server rechnet mit derselben Funktion nach |
| Teilen-Text und Ergebniskarte | `dailyShareText()`, `features/share-card.ts` | Um Platz und Perzentil ergänzen |
| Konto mit Passkey, `users.username` (nicht eindeutig) | `packages/passkey-auth` | Für die Identität; ein öffentlicher Name fehlt |
| Functions mit `service_role`, Rate-Limiter, Push | `functions/api/*`, `server/*`, `workers/rate-limiter` | Gleiches Muster für `/api/challenge/*` |

Generatoren und Bewertung sind DOM-frei und laufen schon in Node-Tests, also auch in einer Pages Function. **Aber** `prompt` und `hint` einer Aufgabe werden beim Erzeugen übersetzt. Außerdem ändert jede Katalog-Änderung (z. B. #12 „größere Aufgabenpools“) die Aufgaben zu einem Seed. Eine alte App und der Server würden dann verschiedene Aufgaben erzeugen.

---

## 4. Architektur

**Der Server ist maßgeblich, die Runde läuft lokal.**

```
Client                                   Server (Pages Function + Supabase)
  │  GET  /api/challenge/current            → id, endsAt, count, bereits gespielt?
  │  POST /api/challenge/start {id}         → legt Versuch an (genau einmal), gibt Aufgaben (de/en) zurück
  │  … Runde lokal mit der bestehenden Trainings-Ansicht (sofortiges Feedback, offline-fest) …
  │  POST /api/challenge/finish {id, answers[{input, ms}]}
  │                                         → bewertet mit evaluate() neu, speichert, gibt Platz zurück
  │  GET  /api/challenge/leaderboard?id=…   → Top 50 + eigener Platz + Teilnehmerzahl
```

- **Der Server erzeugt die Aufgaben** einmal je Challenge und speichert sie (`challenges.tasks`). Er erzeugt sie in beiden Sprachen, aus demselben Seed nacheinander mit `setLang('de')` und `setLang('en')`: Der RNG liefert dieselben Zahlen, nur die Texte unterscheiden sich. Clients bekommen die Aufgaben **erst beim Start**. Wer sie sehen will, hat damit den Versuch verbraucht. Unterschiedliche App-Versionen spielen so garantiert dieselben Aufgaben.
- Die **Wertung** gilt nur nach dem Server. Er bewertet die abgegebenen Eingaben mit `evaluate()` gegen seine gespeicherten Aufgaben und vertraut den Punkten des Clients nicht. Die Zeit ist `min(Summe der Client-Zeiten, Serverzeit seit Start)`.
- **Abgabe offline:** Das Ergebnis geht in eine kleine Outbox (localStorage) und wird bis zur Frist (Start + 30 min) erneut gesendet. Danach wird der Versuch mit dem Stand beim Abbruch gewertet, ohne Antworten mit 0 Punkten.
- **Code-Ort:** `server/challenge.ts` (Logik, testbar mit Memory-Store wie `passkey-auth/server`) und `functions/api/challenge/[[path]].ts` (Routing). Dazu kommen gemeinsame Typen und Regeln in `src/core/challenge.ts`: Wertung, Gleichstand, Fristen. Beim Erzeugen der Aufgaben importiert der Server `src/core/generators` und `src/core/scoring.ts` direkt.
- **Neue Challenges** legt ein täglicher Cron in Supabase an (wie `005_push_cron.sql`). Er erzeugt um 23:55 die Daily des nächsten Tags. Alternativ erzeugt der erste Aufruf von `current` sie per Upsert.

---

## 5. Datenmodell (Supabase, `sql/006_challenges.sql`)

```sql
-- Nur service_role schreibt/liest direkt; Clients gehen über /api/challenge (wie push_*)
create table if not exists public.challenges (
  id         text primary key,                 -- 'daily-2026-11-08' | 'comp-prozente-kw46'
  kind       text not null check (kind in ('daily', 'competition')),
  title      jsonb,                            -- {de, en}; null bei daily
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  config     jsonb not null,                   -- {count: 15, level: 2, categories: null | [...], catalogVersion}
  tasks      jsonb not null,                   -- {de: Task[], en: Task[]} – nie vor dem Start an Clients
  group_id   uuid null,                        -- Phase 3: Wettbewerb einer Gruppe
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.challenge_attempts (
  challenge_id text not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  answers      jsonb,                          -- [{i, input, ms}]
  correct      int, points int, time_ms int,
  status       text not null default 'running' check (status in ('running', 'finished', 'expired', 'flagged')),
  primary key (challenge_id, user_id)          -- genau ein Versuch, von der Datenbank erzwungen
);
create index if not exists challenge_attempts_rank
  on public.challenge_attempts (challenge_id, points desc, time_ms asc, finished_at asc) where status = 'finished';

create table if not exists public.public_profiles (
  user_id      uuid primary key references public.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  listed       boolean not null default false, -- erscheint in Ranglisten (Opt-in)
  updated_at   timestamptz not null default now()
);
create unique index if not exists public_profiles_name on public.public_profiles (lower(display_name));

-- Rangliste als Funktion (service_role): Top N + eigener Platz, nur 'finished' und listed
-- create or replace function public.challenge_leaderboard(p_challenge text, p_user uuid, p_limit int) …
```

- RLS ist an. Es gibt keine Policies für `authenticated`, also nur `service_role`, wie bei `push_*` und `auth_*`.
- Beim Löschen eines Kontos (`pa_delete_account`) verschwinden Versuche und das öffentliche Profil per Cascade.
- `start` legt den Versuch per `insert … on conflict do nothing returning` an. Ein zweiter Start gibt **409** zurück, auch bei parallelen Anfragen von zwei Geräten.

---

## 6. API (Pages Functions)

| Methode | Pfad | Auth | Antwort |
|---|---|---|---|
| GET | `/api/challenge/current?kind=daily` | optional | `{id, kind, startsAt, endsAt, count, level, state: 'open'\|'running'\|'done', result?}` |
| GET | `/api/challenge/list` | optional | aktive und kommende Wettbewerbe |
| POST | `/api/challenge/start` `{id}` | **Pflicht** | `201 {tasks, startedAt, deadline}` · `409` schon gespielt · `410` vorbei |
| POST | `/api/challenge/finish` `{id, answers}` | **Pflicht** | `{correct, points, timeMs, rank, total, percentile}` (idempotent, danach unveränderlich) |
| GET | `/api/challenge/leaderboard?id=&limit=50` | optional | `{top: [{rank, name, points, timeMs, correct}], me?, total}` |
| PUT | `/api/challenge/profile` `{displayName, listed}` | **Pflicht** | öffentlicher Name, Opt-in |

- Die Anmeldung läuft über das vorhandene Access-Token aus `passkey-auth` (`server/auth.ts`). CORS gilt wie bei den übrigen `/api/`-Routen (`capacitor://localhost`).
- Rate-Limit über den vorhandenen Worker: `start`/`finish` 10/min, `leaderboard` 60/min.
- Ranglisten sind 30 s cachebar (`Cache-Control`), die eigene Zeile kommt ungecacht.

---

## 7. Oberfläche

**Heute (Daily-Karte)** zeigt je nach Zustand:
- *Offen:* „Daily Challenge · gewertet“, dazu „Noch 5 h 12 min“
- *Ohne Konto:* „Daily Challenge · ungewertet“ und der Link „Mit Konto in die Rangliste“
- *Erledigt:* „13/15 · Platz 12 von 340“, Tipp auf die Karte öffnet die Rangliste

**Vor dem Start:** ein Sheet mit den Regeln („Ein Versuch · kein Hinweis · Zeit läuft ab Start · Abbrechen zählt“). Darunter die Knöpfe **„Start (gewertet)“** und „Erst üben (ungewertet, andere Aufgaben)“. Beim ersten Mal kommen die Wahl des Namens und der Schalter „In Ranglisten zeigen“ dazu.

**Runde:** die bestehende Trainings-Ansicht (`views/train`) mit `mode: 'daily'` und dem neuen Schalter `ranked`. Im gewerteten Modus sind „Wie geht das?“ und die Atempause aus, und Zurück/Beenden fragt nach („Versuch beenden? Offene Aufgaben zählen 0“).

**Ergebnis:** Punkte, richtige Antworten und Zeit, dann Platz, Teilnehmerzahl und „besser als 73 %“. Es folgen „Rangliste ansehen“, „Teilen“ (Text und Karte mit Platz) und „Nochmal üben (ungewertet)“.

**Rangliste** `#/rangliste?id=…`: Reiter *Heute*, *Woche* und später *Gruppe*. Die Top 50 erscheinen mit der eigenen Zeile hervorgehoben, liegt sie außerhalb, steht sie unten angeheftet. Erreichbar ist die Rangliste von der Daily-Karte, vom Ergebnis und über Fortschritt → „Ranglisten“. Einen fünften Tab gibt es nicht, damit die Tab-Leiste bei 320 px nicht zu eng wird.

**Wettbewerbe** `#/wettbewerb/<id>`: Liste der aktiven und kommenden Wettbewerbe auf *Heute* unter „Weitere Übungen“. Die Regeln sind dieselben, nur Titel, Zeitraum und Aufgabenset unterscheiden sich.

Alle Texte gibt es in de/en (`src/i18n/locales/*/challenge.ts`). Die Leitplanken bleiben: DOM nur über `h()`, kein `innerHTML`, strikte CSP und Tauglichkeit ab 320 px.

---

## 8. Fairness und Grenzen

- **Ein Taschenrechner lässt sich nicht verhindern.** Das Ziel ist ein fairer Rahmen unter Freunden, keine Prüfung. Die Ehrlichkeit kommuniziert die App offen in den Regeln.
- Plausibilitätsprüfungen beim `finish`:
  - Antwortzeit unter einer Mindestzeit je Subtyp (z. B. < 600 ms bei Mehrstelligem)
  - Client-Zeit größer als die Serverzeit plus Toleranz
  - Eingaben außerhalb des Formats

  Solche Versuche bekommen `status = 'flagged'`. Sie zählen für die Person selbst, erscheinen aber nicht öffentlich.
- Die Aufgaben sind erst nach dem Start sichtbar, also kein Vorab-Rechnen künftiger Tage. Die Uhr des Geräts zu verstellen hilft nicht, die Zeit kommt vom Server.
- Mehrere Konten bleiben möglich, die Passkeys erschweren das nur. Erst bei Bedarf drosseln, z. B. je IP und Tag über den Rate-Limiter.

---

## 9. Datenschutz

- In Ranglisten erscheint nur, wer zustimmt (`listed`, Opt-in), und nur mit einem selbst gewählten Namen (3–20 Zeichen). Es gibt keine E-Mail und kein Profilbild. Der Konto-Name `username` bleibt privat.
- Ein Namensfilter (Wortliste) und `listed = false` per Admin-SQL reichen als Moderation für den Anfang.
- `datenschutz.html` (`scripts/pages.ts`) bekommt einen Abschnitt „Ranglisten“: welche Daten, wie lange (Versuche 12 Monate, danach nur noch Summen), Widerruf jederzeit. Die App-Datenschutzangaben im App Store und das Privacy Manifest sind zu prüfen: „Gameplay Content“, verknüpft mit dem Konto.
- Konto löschen löscht alles (Cascade).

---

## 10. Phasen

| Phase | Version | Umfang | Aufwand | Abhängigkeiten |
|---|---|---|---|---|
| **P0** | 1.16 | Ladefehler klären (§0), Release 1.16 abschließen (PR #15), ungemergten iPad/Engine-Stand übernehmen (§1) | S–M | Angaben zum Fehler |
| **P1** | 1.17 | Gewertete Daily: `006_challenges.sql`, `server/challenge.ts` + API, ein Versuch, Wertung auf dem Server, Outbox, öffentlicher Name mit Opt-in, Rangliste *Heute*, Ergebnis mit Platz, Teilen mit Platz, Datenschutzseite | **L** | Konto (gibt es) |
| **P2** | 1.18 | Rangliste *Woche* (Summe der Daily-Punkte Mo–So), **Wettbewerbe** mit eigenem Zeitraum und Aufgabenset (anfangs per SQL/Admin-Skript angelegt), Liste auf *Heute* | M | P1 |
| **P3** | später | **Gruppen**: anlegen, Einladungslink/-code, Gruppen-Rangliste, Gruppen-Wettbewerbe; Push „Neue Daily ist da“ / „Du wurdest überholt“ (vorhandene Push-Infrastruktur) | L | P1, P2 |

Ohne native Änderung kommt P1 per Live-Update auch in die iOS-App. Ein Store-Release ist nur nötig, wenn native Teile dazukommen; der Test `native-version.json` meldet das.

Reihenfolge innerhalb von P1, je ein PR auf `develop`:
1. SQL und `server/challenge.ts` mit Memory-Store und Tests (Ein-Versuch-Regel, Neubewertung, Fristen, Rangfolge)
2. API-Routen, Rate-Limit, `public_profiles`
3. Client: `src/features/challenge.ts` (API, Outbox), gewerteter Modus in `views/train`, Daily-Karte
4. Rangliste-Ansicht, Ergebnis mit Platz, Teilen
5. Datenschutzseite, Release Notes 1.17, Vorschau-Test auf `preview.…` mit zwei Konten

---

## 11. Tests

- **Determinismus:** Aufgaben aus Seed X sind auf Server und Client gleich (de und en dieselben Zahlen). Die gespeicherten Aufgaben ändern sich nicht, wenn sich der Katalog später ändert.
- **Ein Versuch:** zwei parallele `start` ergeben einmal 201 und einmal 409. `finish` zweimal liefert dasselbe Ergebnis. `finish` nach der Frist gibt `expired` mit dem Teilstand.
- **Neubewertung:** Manipulierte Client-Punkte werden ignoriert, und Server-Punkte = `evaluate()` je Antwort.
- **Rangfolge:** Punkte, dann Zeit, dann Abgabe. `flagged` und nicht gelistete Versuche fehlen öffentlich, der eigene Platz ist trotzdem sichtbar.
- **SQL:** RLS-Test wie `packages/passkey-auth/sql/tests/rls_test.sql`, also kein Zugriff für `authenticated`/`anon`, und Cascade beim Löschen eines Kontos.
- **UI:** gewerteter Modus ohne Hinweis und Atempause, Abbrechen fragt nach, Offline-Abgabe über die Outbox.

---

## 12. Offene Entscheidungen

| # | Frage | Vorschlag |
|---|---|---|
| D1 | Tagesgrenze für alle: Europe/Berlin, UTC oder die lokale Zeit (wie Wordle)? | **Europe/Berlin**: eine Rangliste je Tag, und die meisten Nutzer sind im deutschsprachigen Raum |
| D2 | Zählt ein Abbruch als verbrauchter Versuch? | **Ja**, sonst gibt es keinen echten „einen Versuch“ |
| D3 | Wertung nur mit Konto? | **Ja**; ohne Konto bleibt die Daily lokal und ungewertet |
| D4 | Rangliste öffentlich standardmäßig oder per Opt-in? | **Opt-in** mit Pseudonym |
| D5 | Gleich viele Aufgaben wie heute (15, Stufe 2)? | Ja für die Daily; Wettbewerbe frei konfigurierbar |
| D6 | Wer legt Wettbewerbe an? | P2: nur Admin (SQL/Skript); P3: Gruppen selbst |
