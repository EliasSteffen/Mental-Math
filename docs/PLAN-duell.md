# Plan: 1:1-Duell (live, mit Einladungscode)

Stand: 2026-11-09 · Basis: `develop` @ `fcfbf59` (1.17.0) · **noch nicht umgesetzt**

Kurz: Zwei Personen spielen live gegeneinander. Eine legt ein Duell an und bekommt einen Code. Die andere tritt mit dem Code bei. Dann bekommen beide in jeder Runde dieselbe Aufgabe. Wer zuerst richtig antwortet, gewinnt die Runde. Wer zuerst N Runden gewinnt, gewinnt das Match.

Inhalt:
1. Ziel und Regeln
2. Was es schon gibt
3. Architektur
4. Ablauf eines Matches
5. Fairness: wer war schneller?
6. Protokoll (WebSocket)
7. Datenmodell (Supabase)
8. API
9. Oberfläche
10. Verbindungsabbrüche und Sonderfälle
11. Datenschutz und Grenzen
12. Phasen
13. Tests
14. Offene Entscheidungen

---

## 1. Ziel und Regeln

| Regel | Vorschlag |
|---|---|
| Beitreten | 6-stelliger Code (Alphabet wie bei Gruppen, ohne 0/O/1/I/L), gültig 15 Minuten, nur einmal. Dazu ein Link `…/#/duell/K7P2QX` zum Teilen. |
| Aufgaben | In jeder Runde dieselbe Aufgabe für beide. Der Server erzeugt sie aus einem Seed (de und en aus demselben Seed, wie bei der Daily). |
| Einstellungen | Die Person, die das Duell anlegt, wählt: Kategorie (oder „Gemischt“), Stufe (Leicht/Mittel/Schwer) und die Länge: **erster mit 3, 5 oder 7 Rundensiegen** (Standard 5). |
| Rundensieg | Die schnellere **richtige** Antwort gewinnt (1 Punkt). |
| Falsche Antwort | Pro Runde ein Versuch. Wer falsch antwortet, ist in dieser Runde raus. Die andere Person kann die Runde noch gewinnen. |
| Keine richtige Antwort | Beide falsch oder Zeit abgelaufen: Die Runde zählt für niemanden. |
| Zeit pro Runde | 3 × Zielzeit der Aufgabe, mindestens 8 s, höchstens 30 s. |
| Matchende | Wer zuerst N Rundensiege hat, gewinnt. Nach höchstens 2N + 3 Runden gewinnt, wer vorn liegt. Bei Gleichstand gibt es eine Entscheidungsrunde (höchstens 3), danach ein Unentschieden. |
| Aufgeben | Jederzeit möglich. Das Match zählt dann als Sieg für die andere Person. |
| Revanche | Nach dem Match: Tippen beide auf „Revanche“, startet ein neues Match mit denselben Einstellungen, ohne neuen Code. |
| Konto | Für beide nötig (wie bei der gewerteten Daily). Gezeigt wird der Profilname. |

## 2. Was es schon gibt (und genutzt wird)

| Baustein | Wo | Nutzen fürs Duell |
|---|---|---|
| Durable-Object-Worker mit Pages-Binding | `workers/rate-limiter`, Binding `RATE_LIMITER`, Workflow `deploy-rate-limiter.yml` | Vorlage für den Duell-Worker (SQLite-Backend, kostenloser Plan, keine öffentliche Route) |
| Aufgaben aus Seed, Wertung mit `evaluate()` | `src/core/challenge.ts`, `src/core/scoring.ts` | gleiche Aufgaben für beide, Prüfung auf dem Server |
| Einladungscodes | `CODE_ALPHABET`, `newGroupCode`/`normalizeGroupCode` in `src/core/challenge.ts` | Format und Prüfung der Duell-Codes |
| Profil (Name, Opt-in) | `challenge_profiles`, `/api/challenge/profile`, `nameSheet` | Name vor dem ersten Duell |
| Konto und Token | passkey-auth, `accessToken()` | Anmeldung; daraus ein kurzes Ticket für die WebSocket-Verbindung |
| Rate-Limit | `server/rate-limit.ts` | Grenzen für Anlegen und Beitreten |
| Antwortfeld, Tastenfeld | `src/views/train/answer.ts`, `src/ui/keypad.ts` | Eingabe im Duell |
| App-CORS | `server/app-origin.ts` | Die iOS-App (`capacitor://localhost`) darf die API nutzen; bei der WebSocket-Verbindung wird der `Origin` geprüft. |

## 3. Architektur

```
App/Web ──HTTPS──▶ Pages Function /api/duel/* ──▶ Supabase (Duelle, Ergebnisse, Codes)
   │                         │
   │                         └──Binding DUEL──▶ Durable Object „DuelRoom“ (eins je Match)
   └──────WebSocket wss://…/api/duel/ws ───────────▶ (über die Pages Function weitergereicht)
```

- **Ein Durable Object je Match** (`DuelRoom`, `idFromName(matchId)`). Es führt das Match: Spieler, Punkte, aktuelle Runde, Timer (Alarm), Antworten. Es ist die einzige Instanz, die Runden entscheidet, also ohne Wettlauf zwischen zwei Servern.
- **WebSocket mit Hibernation** (`state.acceptWebSocket`): Zwischen den Nachrichten schläft das Objekt und kostet nichts. Timer laufen über `storage.setAlarm`.
- **Eigener Worker** `workers/duel` (`mental-math-duel`, `workers_dev = false`), dazu ein Vorschau-Worker `mental-math-duel-preview` (`[env.preview]`). Workflow `deploy-duel.yml`: `develop` → Vorschau, `release` → Produktion.
- **Supabase nur in der Pages Function** (wie bisher): Code → Match, Einstellungen, Ergebnis, Verlauf. Der Worker braucht keine Supabase-Schlüssel. Das Ergebnis holt die Pages Function beim Objekt ab (`GET /result` über das Binding) und speichert es. Das passiert, sobald ein Client nach Matchende `/api/duel/finish` ruft, sonst spätestens beim nächsten Laden des Verlaufs.
- **Regeln als reiner Code** in `src/core/duel.ts` (DOM-frei): Rundenentscheidung, Zeitprüfung, Matchende, Rundenzeit. Das Objekt und die Tests nutzen denselben Code.
- **Kosten:** Der kostenlose Workers-Plan reicht. Ein Match hat zwei Verbindungen und etwa 100 Nachrichten, und eingehende WebSocket-Nachrichten zählen im Verhältnis 20:1 als Anfragen.

Warum nicht Polling oder Supabase Realtime? Polling (etwa 1 Anfrage pro Sekunde und Person) wäre träge und unfair. Supabase Realtime bräuchte Supabase-JWTs im Client, und die Tabellen sind bewusst ohne RLS-Policies nur über den Server erreichbar.

## 4. Ablauf eines Matches

1. **Anlegen:** A tippt „Neues Duell“ und wählt die Einstellungen. `POST /api/duel/create` liefert `{ id, code, expiresAt }`. A sieht den Code groß, dazu „Teilen“ (natives Teilen-Menü bzw. Kopieren) und wartet in der Lobby (WebSocket offen).
2. **Beitreten:** B gibt den Code ein oder öffnet den Link. `POST /api/duel/join` liefert `{ id }`. Der Code ist danach verbraucht.
3. **Lobby:** Beide sehen beide Namen und die Einstellungen. Beide tippen „Bereit“.
4. **Runde:**
   - Der Server sendet `countdown` (3 s), dann `task`. Die Aufgabe kommt erst jetzt, ohne Lösung und ohne Tipp.
   - Beide antworten. Die Gegenseite sieht nur „hat geantwortet“, nicht ob richtig.
   - Der Server entscheidet die Runde (§5) und sendet `round` mit beiden Antworten, beiden Zeiten, der Lösung und dem neuen Stand.
   - Nach 2,5 s Ergebnis folgt die nächste Runde.
5. **Ende:** `end` mit Sieger, Stand und Grund (Punkte, Aufgabe, Abbruch). Danach bietet der Bildschirm „Revanche“, „Teilen“ (Ergebnisbild über `share-card.ts`) und „Fertig“.

## 5. Fairness: wer war schneller?

Die Ankunftszeit am Server wäre unfair, denn eine langsame Verbindung verliert. Deshalb misst **jedes Gerät selbst**: von der Anzeige der Aufgabe bis zum Absenden (`performance.now()`). Der Server prüft diese Zeit gegen das, was er selbst sieht:

- `S` = Senden der Aufgabe, `R` = Eingang der Antwort (beide Serverzeit), `ms` = Zeit laut Gerät.
- **RTT** misst das Objekt laufend per `ping`/`pong` (Median der letzten 10, gedeckelt auf 800 ms).
- Gültige Zeit = `clamp(ms, (R − S) − RTT − 150, R − S)`. Ein Gerät kann sich also höchstens um seine gemessene Latenz schneller machen, nicht mehr.
- Richtige Antworten unter `MIN_PLAUSIBLE_MS` (350 ms) zählen als falsch, wie die Markierung bei der Daily.
- **Kulanzfenster:** Kommt die erste richtige Antwort an, wartet der Server noch `RTT_B + 150 ms` (höchstens 1 s) auf die andere. Eine Antwort, die laut gültiger Zeit schneller war, gewinnt dann noch. Danach ist die Runde zu, und eine spätere Eingabe zählt nicht mehr.
- Gleich schnell (unter 10 ms Unterschied): Es gewinnt der frühere Eingang am Server.
- **Lösung nicht auf dem Gerät:** Die Aufgabe kommt ohne `expected` und `hint`. Gewertet wird nur auf dem Server. Deshalb gibt es im Duell kein automatisches Absenden: Die Antwort zählt mit „OK“. Bei Auswahlaufgaben zählt der Tipp.

Grenzen: Wer ein Programm die Aufgabe lesen und lösen lässt, ist nicht zu verhindern. Die 350-ms-Grenze bremst nur Bots. Duelle laufen aber unter Leuten, die sich den Code geschickt haben.

## 6. Protokoll (WebSocket, JSON, Feld `v: 1`)

Server → Client:

| Nachricht | Inhalt |
|---|---|
| `state` | vollständiger Stand beim (Wieder-)Verbinden: Spieler, Punkte, Phase, laufende Runde |
| `lobby` | Spieler, „bereit“ je Person |
| `countdown` | `round`, `inMs` |
| `task` | `round`, Aufgabe (Text, Einheit, Art, Auswahl), `limitMs` |
| `opponent` | `answered: true` |
| `round` | `round`, Sieger, je Person Antwort, richtig, gültige Zeit; Lösung; Stand |
| `paused` | wer fehlt, `untilMs` |
| `end` | Sieger, Stand, Grund, Rundenliste |
| `ping` | `t` |

Client → Server: `ready`, `answer { round, value, ms }`, `pong { t }`, `forfeit`, `rematch`.

**Anmeldung:** Eine WebSocket-Verbindung aus dem Browser kann keinen `Authorization`-Header senden. Deshalb holt der Client zuerst per `POST /api/duel/ticket` ein Ticket: HMAC-signiert, 30 s gültig, einmal nutzbar, gebunden an Match und Person. Dann verbindet er sich mit `wss://…/api/duel/ws?ticket=…`. Die Pages Function prüft Ticket und `Origin` und reicht die Verbindung mit Person, Name und Sprache an das Objekt weiter. Das Objekt ist nur über das Binding erreichbar.

## 7. Datenmodell (Supabase, `sql/007_duels.sql`)

```sql
create table public.duels (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                 -- null, sobald beigetreten oder abgelaufen
  code_expires_at timestamptz,
  created_by  uuid not null references public.users(id) on delete cascade,
  opponent    uuid references public.users(id) on delete cascade,
  settings    jsonb not null,              -- { target, level, categories, seed }
  rematch_of  uuid references public.duels(id) on delete set null,
  status      text not null default 'open',-- open | running | finished | aborted
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  winner      uuid,                        -- null = unentschieden/abgebrochen
  score_a     smallint, score_b smallint,  -- a = created_by
  reason      text,                        -- points | forfeit | cap | aborted
  rounds      jsonb                        -- [{ subtype, a: {correct, ms}, b: {…}, winner }]
);
create index duels_by_user on public.duels (created_by, created_at desc);
create index duels_by_opponent on public.duels (opponent, created_at desc);
```

- RLS an, keine Policies (wie `006`). Zugriff nur über RPC mit service_role: `duel_create`, `duel_join` (atomar: Code prüfen, verbrauchen, Gegner setzen), `duel_finish` (idempotent), `duel_history(user, limit)` mit Bilanz gegen jede Person.
- Aufräumen: offene Duelle nach 1 Tag löschen. Ergebnisse behalten wir 12 Monate, beim Löschen des Kontos verschwinden sie per Cascade.

## 8. API (`functions/api/duel/[[path]].ts` → `server/duel.ts`)

| Route | Zweck | Grenzen |
|---|---|---|
| `POST /create` | Duell anlegen, Code erzeugen, Objekt initialisieren (`POST /init` über das Binding) | 20 je Person und Stunde; höchstens 1 offenes Duell je Person |
| `POST /join` | mit Code beitreten | 10 Versuche je IP und Minute (gegen Code-Raten) |
| `POST /ticket` | Ticket für die WebSocket-Verbindung (nur Teilnehmende) | 30 je Person und Minute |
| `GET /ws` | WebSocket → Objekt | Ticket und Origin |
| `POST /cancel` | offenes Duell zurückziehen (nur wer es angelegt hat) | – |
| `POST /finish` | Ergebnis vom Objekt holen und speichern (idempotent) | – |
| `GET /history` | letzte 30 Matches und Bilanz je Person | – |

Fehlercodes wie bei `/api/challenge` (`not_found`, `expired`, `full`, `own_duel`, `no_profile`, `rate_limited`, …), auch im Client-Typ.

CSP: In `connect-src` steht `wss://<eigener Host>` (bzw. der Vorschau-API-Host) ausdrücklich. Ältere Safari-Versionen zählen `wss:` nicht zu `'self'`.

## 9. Oberfläche

**Einstieg:**
- Tab „Wettbewerbe“ bekommt oben eine Karte „1:1-Duell“ mit „Neues Duell“ und „Code eingeben“.
- Auf „Heute“ wird die Wettbewerbe-Kachel zu „Wettbewerbe & Duell“ (kein zusätzlicher Platz nötig).
- Deep Link `#/duell/CODE` öffnet direkt das Beitreten.

**Bildschirme** (`src/views/duel.ts`, `duel-ui.ts`, `public/css/views/duel.css`):

1. **Neues Duell (Sheet):** Kategorie, Stufe, Länge (3/5/7), „Duell starten“.
2. **Lobby:** Code in großer, monospaced Schrift (antippen = kopieren), „Teilen“, „Läuft ab in 14:32“, darunter beide Personen mit „bereit“-Häkchen, Button „Bereit“.
3. **Code eingeben:** 6 Felder, Großbuchstaben, Einfügen erlaubt.
4. **Match (Vollbild wie das Training, Tab-Leiste ausgeblendet):**
   - Kopf: Du, Punkte, Gegner und Punktestand als Punkte-Reihe (●●○○○).
   - Mitte: die Aufgabe groß, darunter ein schmaler Zeitbalken.
   - Gegner-Status: „denkt …“ / „hat geantwortet“.
   - Dock: Tastenfeld mit „OK“, bei Auswahlaufgaben das 2 × 2-Raster.
5. **Countdown:** 3 – 2 – 1, groß und animiert (mit „Bewegung reduzieren“ nur als Zahl).
6. **Rundenergebnis (Overlay, 2,5 s):** „Runde an dich · 1,8 s gegen 2,4 s“ bzw. „Lena war schneller“. Dazu die Lösung und Haptik in der App.
7. **Matchende:** Sieger groß, Endstand, Liste der Runden (Aufgabe, beide Zeiten), „Revanche“, „Teilen“, „Fertig“.
8. **Verlauf:** unter Wettbewerbe → Duelle: letzte Matches und die Bilanz je Person („Du – Lena 7 : 4“).

Barrierefreiheit: Rundenergebnisse über `aria-live`. Die Zeitbalken sind nur Deko, die Restzeit wird als Text angesagt.

## 10. Verbindungsabbrüche und Sonderfälle

| Fall | Verhalten |
|---|---|
| Kurzer Abbruch, App im Hintergrund | Der Client verbindet sich mit neuem Ticket neu (Backoff 0,5 s … 5 s). Er bekommt `state` und spielt weiter. Eine laufende Runde zählt für ihn als „keine Antwort“. |
| Eine Person länger weg | Nach der laufenden Runde pausiert das Match (`paused`, Countdown 60 s für die andere Person sichtbar). Kommt sie nicht zurück, gewinnt die andere (`forfeit`). |
| Beide weg | Nach 10 Minuten wird das Match abgebrochen (`aborted`) und nicht gewertet. |
| Code abgelaufen / schon benutzt / eigenes Duell | klare Meldung, „Neues Duell“ anbieten |
| Neuladen während des Matches | wie kurzer Abbruch (Match-ID in `sessionStorage`) |
| Zwei Tabs derselben Person | Die neue Verbindung ersetzt die alte, die alte bekommt `replaced`. |
| Sprache unterschiedlich | Jede Person bekommt die Aufgabe in ihrer Sprache, aus demselben Seed. |

## 11. Datenschutz und Grenzen

- Die Gegenseite sieht den Profilnamen. Das gilt auch, wenn man in Ranglisten nicht gelistet sein will, denn man tritt ja ausdrücklich per Code bei. Das steht so in der Datenschutzerklärung (`scripts/pages.ts`) und im Hilfetext.
- Gespeichert werden Einstellungen, Ergebnis und Rundenzeiten des Matches, 12 Monate lang. Antworten im Klartext speichern wir nicht, nur richtig/falsch und die Zeit.
- Die IP nutzen wir nur flüchtig fürs Rate-Limit, wie bisher.

## 12. Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **D1 Regeln + Objekt** | `src/core/duel.ts` mit Tests; `workers/duel` mit `DuelRoom` (Hibernation, Alarme, Protokoll), Tests mit Fake-State und zwei Fake-Sockets; `wrangler.toml`, `deploy-duel.yml` | Match läuft vollständig im Test |
| **D2 Server** | `sql/007_duels.sql` + PGlite-Tests; `server/duel.ts` (create/join/ticket/ws/finish/history), Pages Function, Ticket-HMAC, Rate-Limits; CSP `wss:` | API und Weiterleitung getestet |
| **D3 Oberfläche** | `src/features/duel.ts` (API, Verbindung, Reconnect), Bildschirme aus §9, i18n de/en, CSS, Einstieg in Wettbewerbe/Heute | spielbar in Web und App |
| **D4 Rund herum** | Revanche, Verlauf und Bilanz, Teilen-Bild, Haptik, Release Notes, README (Einrichtung), Datenschutz, Hilfe | Release-reif (1.18.0) |
| später | Universal Link `/d/CODE` (braucht `applinks` und einen neuen nativen Build), Push „Lena fordert dich heraus“ (Push-Abos mit Konten verknüpfen), Duell aus einer Gruppe heraus ohne Code, Handicap aus der Einstufung | – |

**Einrichtung (einmalig, wie beim Rate-Limit):**
1. Worker `mental-math-duel` und `mental-math-duel-preview` per Workflow deployen.
2. In beiden Pages-Projekten das Binding `DUEL` anlegen (Durable Object, Namespace des jeweiligen Workers).
3. Secret `DUEL_TICKET_KEY` in beiden Pages-Projekten setzen.
4. `sql/007_duels.sql` in Supabase einspielen.

## 13. Tests

- **Regeln** (`tests/duel.test.ts`): Rundenentscheidung mit Latenz-Ausgleich, Kulanzfenster, falsche Antworten, Zeitablauf, Gleichstand, Matchende inklusive Obergrenze und Entscheidungsrunde, Zeit unter 350 ms.
- **Objekt** (`tests/duel-room.test.ts`): ganzes Match mit zwei Fake-Sockets und steuerbarer Uhr; Reconnect mit `state`; Pause und `forfeit`; Revanche; doppelte Verbindung.
- **Server** (`tests/duel-server.test.ts`): Code-Lebenszyklus mit echtem SQL in PGlite (`supabase-sim.sql`), Ticket fälschen, abgelaufen, wiederverwendet, fremdes Match; Rate-Limits; idempotentes `finish`.
- **Client** (`tests/duel-client.test.ts`): Reconnect-Backoff, Zustandsmaschine der Bildschirme.
- **Ende-zu-Ende:** `wrangler dev` (Worker) + `wrangler pages dev` mit `--do DUEL=…`, Playwright mit zwei Browser-Kontexten (zwei Konten). Ein Match bis zum Ende spielen, dabei ein Netz-Abbruch und eine Revanche. Als iPhone-15-Viewport.

## 14. Offene Entscheidungen (mit Vorschlag)

1. **Live oder abwechselnd?** Vorschlag: **live**, beide gleichzeitig. Das passt zu „wer schneller antwortet“. Eine Variante wie bei Quizduell (jede Person spielt ihre Runden, wann sie will, die Zeiten werden verglichen) ginge später mit demselben Datenmodell.
2. **Länge:** Vorschlag erster mit **5** Rundensiegen, wählbar 3/5/7. Alternative: feste Rundenzahl (z. B. 10).
3. **Falsche Antwort:** Vorschlag: für diese Runde raus, kein Punktabzug. Alternative: Punkt für die andere Person (bestraft Raten stärker).
4. **Ohne Konto spielen?** Vorschlag: nein (Name, Missbrauch, Verlauf). Alternative: Gastname nur für dieses Match, ohne Verlauf.
5. **Schwierigkeit:** Vorschlag: Wer das Duell anlegt, wählt die Stufe. Später optional ein Handicap aus der Einstufung, damit Ungleiche fair spielen.
6. **Kein automatisches Absenden** im Duell, weil die Lösung nicht auf dem Gerät liegt. Die Antwort zählt mit „OK“.
