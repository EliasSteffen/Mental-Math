# Plan v12 – Raketen-Rennen

Stand: 2026-11-11 · Basis: `claude/nice-brahmagupta-gmpncl` nach v11 Phase 1 (N, H gemergt) · Ziel-Version **2.4.0**

Wunsch des Product Owners (2026-11-11): neuer Modus **„Rennen“** – eine Gruppe spielt **XX Sekunden**, wählt **eine Kategorie oder Gemischt**, alle bekommen **dieselben Aufgaben**, wer in der Zeit **am meisten schafft, gewinnt**. Aufgemacht als **Raketen-Rennen**. Entscheidungen: **alle drei Spielweisen** (Geister-Raketen, Live, ein Gerät reihum); Teilnahme an Gruppen-Rennen **mit Konto in Gruppen**.

| Paket | Inhalt | Modell | Phase |
|---|---|---|---|
| **R1** | Gemeinsamer Kern (Aufgabenstrom, Wertung, Zeitleiste), Renn-Bildschirm mit Raketen, Ergebnis/Podest, Spielweise **„Reihum“** (ein Gerät, ohne Konto) | sonnet | 1 |
| **R2** | **Geister-Rennen** in Gruppen: Server (SQL 008, API), Anlegen im Gruppen-Sheet, Spielen gegen die Aufzeichnungen der anderen, Rangliste | sonnet | 2 |
| **R3** | **Live-Rennen** in Gruppen: Lobby, gemeinsamer Countdown, Positionen in Echtzeit (Durable Object + WebSocket) | sonnet | 2 |

R2 und R3 laufen parallel, sobald R1 gemergt ist. Leitplanken wie PLAN-v11 §1 (verbindlich; i18n-Namensraum **`race`**, CSS **`public/css/views/race.css`**, Tests `tests/v12-*.test.ts`, keine neuen Einstellungsfelder, Ports R1 5221, R2 5222, R3 5223, keine `fullPage`-Screenshots auf langen Seiten, Commit-Zeilen, Bericht). Zusätzlich hier erlaubt: **R2** `sql/008_races.sql`, `server/`, `functions/`, README-Abschnitt; **R3** `workers/race-room/`, `functions/`, `.github/workflows/deploy-race-room.yml` (Muster `deploy-rate-limiter.yml`), README-Abschnitt.

---

## 1. Regeln (für alle Spielweisen gleich)

- **Einstellungen beim Anlegen**: Dauer **30 / 60 / 90 / 120 s** (Standard 60), **Kategorie** (alle sichtbaren außer dem kleinen 1×1 – das als eigene Kategorie wählbar) **oder Gemischt**, Stufe **Leicht / Mittel / Schwer** (Standard Mittel).
- **Aufgabenstrom**: alle bekommen dieselbe Folge aus einem Seed (bis zu 150 Aufgaben – mehr schafft niemand), deterministisch wie die Daily (`mulberry32`, `seedFromString`), Gemischt reihum über die Kategorien.
- **Ablauf**: Countdown 3 · 2 · 1 · Los, dann läuft die Zeit. Eine Aufgabe nach der anderen. **Richtig** → nächste Aufgabe sofort, die eigene Rakete steigt eine Stufe. **Falsch** → kurzes rotes Aufleuchten, nächste Aufgabe, keine Stufe. **Weiter** (Überspringen) zählt wie falsch. Kein Feedback-Sheet, keine Hilfe, keine Lösungswege während des Rennens (die gibt es danach in der Liste).
- **Eingabe**: vorhandenes Tastenfeld/Antwortfeld (`src/views/train/answer.ts`, `src/ui/keypad.ts`) mit **Auto-Prüfen** (sobald die getippte Zahl stimmt, zählt sie – maximales Tempo); „Prüfen“ reicht eine falsche Antwort ein.
- **Wertung**: Rang nach **richtigen Antworten**; Gleichstand → **weniger falsche**; dann **frühere Zeit der letzten richtigen**.
- **Zeitleiste** je Lauf: `[{ ms, ok }]` je beantworteter Aufgabe (ms seit „Los“) – Grundlage für Geister-Raketen, Live-Anzeige und Wiederholung.
- **Zählt als Runde** (Tagesziel, Serie, Quests „eine Runde spielen“): ja, eine Session `mode: 'race'` (`ExtraSessionMode` ergänzen) mit `n` = beantwortet, `correct`. **Keine Attempts** (Skills und Liga bleiben vom Rennen unberührt – Tempo unter Druck verzerrt sonst die Wertung). Belohnungs-Hooks laufen wie bei anderen Ergebnissen (`updateProgressRewards()`).

## 2. Paket R1 – Kern, Renn-Bildschirm, „Reihum“

**Kern** `src/core/race.ts` (DOM-frei, getestet):
```ts
export const RACE_DURATIONS = [30, 60, 90, 120] as const;
export type RaceDuration = (typeof RACE_DURATIONS)[number];
export interface RaceConfig { durationS: RaceDuration; cat: CategoryId | 'all'; lvl: 1 | 2 | 3 }
export const RACE_MAX_TASKS = 150;
export function raceTasks(seed: number, cfg: RaceConfig, count?: number): Task[];
export interface RaceStep { ms: number; ok: boolean }
export interface RaceRun { name: string; steps: RaceStep[]; me?: boolean }
export function raceScore(steps: readonly RaceStep[], durationMs: number): { correct: number; wrong: number; lastOkMs: number };
export function raceRanking(runs: readonly RaceRun[], durationMs: number): Array<RaceRun & { rank: number; correct: number; wrong: number }>;
export function altitudeAt(steps: readonly RaceStep[], t: number): number; // richtige bis Zeitpunkt t – für Geister/Wiederholung
export function encodeRaceConfig / decodeRaceConfig (streng, für Links und Server)
```
Tests `tests/v12-race-core.test.ts`: Determinismus, nur gewählte Kategorie/Stufe, Wertung inkl. Gleichstände, `altitudeAt` an Grenzen, Ende nach Ablauf (Antworten nach `durationMs` zählen nicht).

**Renn-Bildschirm** (`src/views/race/play.ts`, Fokus-Modus ohne Tab-Leiste, wiederverwendbar für R2/R3):
- Oben die **Rennbahn**: senkrechte Bahnen nebeneinander (2–8), je eine **Rakete** (SVG über `h()`/`svg()`, Farbe je Bahn aus den Tokens, eigene Rakete hervorgehoben, Name klein darunter). Höhe = richtige Antworten; die Skala wächst mit dem Führenden (Sternenhimmel/Meilensteine „Mond“ bei 10, „Mars“ bei 20, „Jupiter“ bei 30 als dezente Linien). Bei mehr als 8 Teilnehmern: die eigene Rakete + die 7 Nächsten.
- Rechts oben die **Restzeit** als Ring/Balken mit Sekunden. Unten Aufgabe + Tastenfeld wie im Training, darüber „Weiter“.
- **Gegner-Quelle** als Schnittstelle, damit R2/R3 sie liefern: `interface RaceOpponents { names(): string[]; altitudes(tMs: number): number[] }` – R1 nutzt sie für Reihum (Wiederholung) und für ein Rennen ohne Gegner (nur die eigene Rakete). Animation per `requestAnimationFrame`, bei `prefers-reduced-motion` Sprünge ohne Gleiten. Tab im Hintergrund → Zeit läuft weiter (ehrlich), Hinweis beim Zurückkommen.
- **Ergebnis** `src/views/race/result.ts`: **Podest** (1–3 mit Raketen), Liste aller Plätze (richtig / falsch), deine Aufgaben aufklappbar (falsche zuerst, Lösungsweg im Sheet wie im Training), Knöpfe je Spielweise (Revanche / Neues Rennen / Fertig), Belohnungszeilen (`rewardBlock(updateProgressRewards())`).

**Spielweise „Reihum“** (`#/rennen/reihum`, ohne Konto, alles lokal):
1. **Einrichten**: 2–6 Spieler (Namen, zuletzt verwendete per `localStorage` vorschlagen), Dauer, Kategorie/Gemischt, Stufe → „Los geht's“.
2. **Übergabe**: „Gib das Handy an **Anna**“ + „Bereit“ (keine Vorschau der Aufgaben), dann Countdown und Rennen für diese Person (ohne Gegner-Raketen, nur Zeit und eigene Rakete). Danach „Weitergeben an Ben“ … bis alle gespielt haben.
3. **Wiederholung**: alle Raketen fliegen gleichzeitig das Rennen in **Zeitraffer** (z. B. 10 s für 60 s) nach den Zeitleisten, dann **Podest**. „Revanche“ (neuer Seed, gleiche Spieler) / „Fertig“.
- Nur die Session des Geräts zählt einmal als Runde (nicht je Spieler).

**Einstiege**: Wettkampf-Tab: Karte **„Raketen-Rennen“** (auch ohne Konto sichtbar) mit „Reihum auf diesem Gerät“ (R1), „Mit deiner Gruppe“ (R2/R3, nur mit Konto – vorerst Hinweis „kommt mit Gruppen-Rennen“, R2 ersetzt ihn); Heute → „Weitere Modi“: Zeile „Raketen-Rennen“ → `#/rennen`. Route `#/rennen` (Übersicht/Start), `#/rennen/reihum` (Tab `compete`, Spiel im Fokus-Modus).

**Dateien**: `src/core/race.ts`, `src/views/race/{index,setup,play,result,track}.ts`, `src/router.ts` (Routen), `src/views/compete.ts` (Karte), `src/views/home.ts` (eine Sheet-Zeile), `src/core/modes.ts` (`modeName('race')`), `src/types.ts` (`ExtraSessionMode` um `'race'`), i18n `race`, `public/css/views/race.css`.

**Abnahme (Playwright)**: Reihum mit 3 Spielern à 30 s (Antworten automatisieren: im Test Kategorie **Multiplikation** wählen und die Lösung aus dem Aufgabentext „47 × 6“ berechnen; **keine** Lösungen ins DOM schreiben, auch nicht für Tests), Wiederholung, Podest; Telefon 390×844/375×667, iPad 1180×820, hell/dunkel, `en-US`; Restzeit läuft korrekt ab; keine `pageerror`.

## 3. Paket R2 – Geister-Rennen in Gruppen

**SQL** `sql/008_races.sql` (additiv, idempotent, Muster `006_challenges.sql`, RLS an, nur `service_role`):
- `public.races (id text pk, group_id uuid not null → challenge_groups on delete cascade, created_by uuid → users, kind text check in ('ghost','live'), config jsonb check (Größe), seed text, created_at, starts_at timestamptz null (live), ends_at timestamptz not null)`.
- `public.race_runs (race_id → races on delete cascade, user_id → users, started_at, finished_at, answers jsonb check array ≤ 32 KB, correct int, wrong int, last_ok_ms int, status text check in ('running','finished','expired','flagged'), primary key (race_id, user_id))` – **ein Lauf je Person und Rennen**.
- Funktionen: `race_create`, `race_list(p_group, p_user, p_now)` (offene + letzte 10 beendete, mit eigenem Status), `race_get`, `race_run_start`, `race_run_finish`, `race_board(p_race, p_user)` (Rang, Name – in Gruppen immer sichtbar wie bei Gruppen-Ranglisten –, correct, wrong, `answers`-Zeitleiste nur `[ms, ok]` für Geister). Mitgliedschaft wird in jeder Funktion geprüft (`challenge_group_members`).
- Grenzen: höchstens 5 offene Rennen je Gruppe; `ends_at` 1 h / 24 h / 48 h / 7 Tage.

**Server** (`server/race.ts`, eingehängt in `/api/challenge` wie `league`; Store-Schnittstelle + Fake für Tests wie `server/challenge-store.ts`):
- `POST /race/create` `{ groupId, config, open: '1h'|'24h'|'48h'|'7d' }` → Rennen (nur Mitglieder; Rate-Limit).
- `GET /race/list?group=` · `GET /race/:id` (Konfiguration, Seed, Board, eigener Status).
- `POST /race/:id/start` → Startzeit (einmal; zweiter Start = `already`).
- `POST /race/:id/finish` `{ answers: [{ i, input, ms }] }` → Server erzeugt die Aufgaben aus dem Seed (`raceTasks`), wertet mit `evaluate()`, **verwirft Antworten nach Dauer + 3 s Kulanz** und solche mit unplausibler Zeit (< 250 ms je Aufgabe, nicht aufsteigend → `flagged`), speichert, gibt Rang zurück. Offline-Abgabe später wie bei der Daily (`src/features/challenge.ts` Muster).
- Ohne SQL → `503 unavailable` (Gruppen-Rennen ausgeblendet).

**Client**: Gruppen-Sheet (`src/views/compete.ts` `groupSheet`): „Raketen-Rennen starten“ (Einrichten wie R1 + Offen-Dauer) und Liste offener/letzter Rennen der Gruppe; Wettkampf-Karte zeigt offene Rennen aller Gruppen („Ben fordert euch: 60 s Gemischt · noch 20 h“). Spielen: Renn-Bildschirm von R1 mit **Geister-Raketen** aus den Zeitleisten der bisherigen Läufe (`RaceOpponents`), danach Rangliste des Rennens (Podest + Liste, „wer noch fehlt“). Teilen: Link `#/rennen/<id>` (nur für Mitglieder nutzbar).

**Tests** `tests/v12-race-server.test.ts` (Validierung, Mitgliedschaft, Zeitgrenzen, Flagging, ein Lauf je Person, unavailable) + SQL-Text/PGlite-Test wie `tests/v9-league-sql.test.ts`.

## 3a. Schnittstelle R2 ↔ R3 (verbindlich, beide bauen dagegen)

R1 ist gemergt: `src/core/race.ts` (`RaceConfig { durationS, cat, lvl }`, `raceTasks(seed: number, cfg)`, `raceScore`, `raceRanking`, `opponentsFromRuns`, `RaceOpponents`, `RACE_GRACE_MS`, `encodeRaceConfig`/`decodeRaceConfig`, `cleanRaceName`), `src/views/race/{index,setup,play,result,track}.ts` (`playRace({ root, cfg, tasks, name, title?, opponents?, startPerf?, onDone, onExit })` → `{ stop }`, `onDone({ cfg, steps, answers })` mit `answers[] = { i, task, given, ms, ok }`; `showRaceResult({ root, cfg, runs, tasks?, replay?, summary, rewards?, closeHref, primary, secondary })`; `configForm(initial)` → `{ el, get() }`; `raceCard()`, `waysGroup()` mit Platzhalter „kommt mit dem Gruppen-Rennen“).

**HTTP** (alle unter `/api/challenge`, JSON, Auth wie die übrigen Challenge-Routen; Fehler `{ error }` mit `unavailable` 503 · `not_member` 403 · `not_found` 404 · `closed`/`already` 409 · `invalid` 400 · `rate_limited` 429):

| Route | Paket | Körper → Antwort |
|---|---|---|
| `POST /race/create` | R2 | `{ groupId, kind: 'ghost'\|'live', config: RaceConfig, open?: '1h'\|'24h'\|'48h'\|'7d' }` → `{ race: RaceInfo }`. Ghost: `ends_at = jetzt + open` (Standard 24h). Live: `open` ignoriert, `ends_at = jetzt + 15 min` (Lobby-Verfall). |
| `GET /race/list?group=<uuid>` | R2 | → `{ races: RaceListItem[] }` (offene + letzte 10 beendete, beide Arten) |
| `GET /race/:id` | R2 | → `{ race: RaceInfo, board: RaceBoardRow[], me: { status, startedAt } \| null }` |
| `POST /race/:id/start` | R2 | Ghost: setzt `started_at` einmal → `{ startedAt }`, zweiter Aufruf `409 already` mit `{ startedAt }`. Live: `started_at = starts_at` (nur nach `go`). |
| `POST /race/:id/go` | R2 | nur Live, nur Mitglieder, nur solange `starts_at` leer und nicht verfallen → setzt `starts_at = jetzt + 5 s`, `ends_at = starts_at + Dauer + 60 s` → `{ startsAt }`; danach `409 already` mit `{ startsAt }`. |
| `POST /race/:id/finish` | R2 | `{ answers: [{ i, input, ms }] }` → `{ rank, correct, wrong, status }`. `ms` relativ zu `started_at` (Ghost) bzw. `starts_at` (Live); Antworten nach Dauer + `RACE_GRACE_MS` verworfen; < 250 ms je Aufgabe oder nicht aufsteigend → `flagged`. |
| `POST /race/:id/ticket` | **R3** | nur Live, nur Mitglieder → `{ ticket, expiresAt }` (60 s, HMAC-SHA-256 mit `AUTH_JWT_KEY`, Inhalt `{ raceId, userId, name, exp }`) |
| `GET /api/race/live/<id>?t=<ticket>` (WebSocket) | **R3** | Pages Function → Durable Object `RACE_ROOM` |

**Typen** (R2 legt sie in `src/core/race-api.ts` ab – DOM-frei, von Server und Client genutzt; R3 legt bis zum Merge eine gleichlautende Minimal-Kopie nur der benötigten Typen in `src/core/race-room.ts` an und markiert sie `// TODO(v12-merge): aus race-api.ts`):
```ts
export type RaceKind = 'ghost' | 'live';
export type RunStatus = 'none' | 'running' | 'finished' | 'expired' | 'flagged';
export interface RaceInfo { id: string; groupId: string; createdBy: string; createdByName: string; kind: RaceKind; config: RaceConfig; seed: number; createdAt: string; startsAt: string | null; endsAt: string }
export interface RaceListItem extends RaceInfo { myStatus: RunStatus; runs: number }
export interface RaceBoardRow { rank: number; name: string; me: boolean; correct: number; wrong: number; lastOkMs: number; status: RunStatus; steps: Array<[number, 0 | 1]> }
```
**Server-Store** (R2, `server/race.ts`): Schnittstelle `RaceStore` mit u. a. `info(raceId, userId): Promise<{ race: RaceInfo; member: boolean } | null>` – R3 baut seinen Ticket-Handler gegen genau diese Signatur (eigener Fake im Test) und hängt ihn in `server/challenge.ts` mit **einer** Zeile `// v12 R3` ein; R2 hängt seine Routen mit Zeilen `// v12 R2` ein. Die Hauptsession verdrahtet beim Merge.

**Client**: R2 schreibt `src/features/race-sync.ts` (`createRace`, `listRaces`, `getRace`, `startRun`, `finishRun`, `goLive`, Offline-Abgabe). R3 schreibt `src/features/race-live.ts` (Ticket, WebSocket, Uhrversatz, `RaceOpponents` aus Live-Positionen) und ruft für Anlegen/`go`/Abgabe **eigene schlanke fetch-Helfer** mit denselben Routen auf (beim Merge auf `race-sync.ts` umgestellt). Routen: R2 `#/rennen/<id>`, R3 `#/rennen/<id>/live`. Gruppen-Sheet: R2 baut „Raketen-Rennen“ (Anlegen Geister + Liste beider Arten; Live-Einträge verlinken auf `#/rennen/<id>/live`); R3 ergänzt dort nur einen Knopf „Live-Rennen“ über eine exportierte Funktion aus `src/views/race/live.ts` (eine Zeile in `compete.ts`).

## 4. Paket R3 – Live-Rennen in Gruppen

**Architektur**: neuer Worker `workers/race-room` (Muster `workers/rate-limiter`: `workers_dev = false`, SQLite-Durable-Object `RaceRoom`, Binding **`RACE_ROOM`** im Pages-Projekt) + Pages Function `functions/api/race/live/[[path]].ts` (WebSocket-Upgrade an das Durable Object weiterreichen). Das Durable Object ist **nur Treffpunkt und Taktgeber** (Lobby, Startzeit, Positionen verteilen); **gewertet wird wie bei R2** über `POST /race/:id/finish` (Server prüft gegen `starts_at`). So bleiben Ergebnisse, Rangliste und Verlauf für beide Spielweisen gleich.

**Ablauf**:
1. Host im Gruppen-Sheet: „Live-Rennen“ → `POST /race/create { kind: 'live', config }` → Lobby `#/rennen/<id>/live`.
2. Mitglieder sehen im Gruppen-Sheet/Wettkampf „Live-Rennen offen – beitreten“ (Abfrage `GET /race/list`), Link teilbar.
3. Verbindung: `POST /race/:id/ticket` → kurzlebiges, signiertes Ticket (60 s, HMAC mit `AUTH_JWT_KEY`, enthält userId, Name, raceId) → WebSocket `wss://…/api/race/live/<id>?t=<ticket>`; das Durable Object prüft das Ticket (Schlüssel als Worker-Secret).
4. **Lobby**: Liste der Verbundenen; Host tippt „Start“ (ab 2 Spielern) → Server setzt `starts_at = jetzt + 5 s` (`POST /race/:id/go`), Durable Object sendet `start { startsAt }` an alle → synchroner Countdown nach Serverzeit (Uhrversatz per `ping/pong` ausgleichen).
5. **Rennen**: Clients senden je Antwort `{ i, ok, ms }` (nur Anzeige), das Durable Object verteilt Positionen gebündelt (≤ 5 × pro Sekunde); `RaceOpponents` liefert sie live.
6. **Ende**: nach Dauer + 3 s sendet das Durable Object `end`; jeder Client gibt seine Antworten wie R2 ab; Ergebnis-Bildschirm zeigt das Podest, sobald alle (oder nach 10 s die Vorhandenen) abgegeben haben.
- **Abbrüche**: Wiederverbinden mit neuem Ticket bis zum Ende; wer nicht zurückkommt, wird mit seinem letzten Stand angezeigt („Verbindung verloren“). Host verlässt die Lobby → nächster Host. Lobby ohne Start verfällt nach 15 min.
- Ohne Binding/Worker → Live ausgeblendet (`503 unavailable`), Geister-Rennen bleibt.

**Kern** `src/core/race-room.ts` (DOM-frei, im Worker **und** in Tests genutzt): Zustandsautomat Lobby → Countdown → Läuft → Ende mit Nachrichten-Typen und Prüfungen (nur Host startet, ≥ 2 Spieler, Nachrichten nach Ende ignoriert, Positionen monoton). Tests `tests/v12-race-room.test.ts`; Ticket-Signatur/Prüfung `tests/v12-race-ticket.test.ts`.

**Doku**: README-Abschnitt „Live-Rennen (einmalig einrichten)“: Worker deployen (Workflow „Deploy Race Room“ bzw. `npx wrangler deploy --config workers/race-room/wrangler.toml`), Secret setzen, Binding `RACE_ROOM` im Pages-Projekt (Production und Preview), neu deployen.

## 4a. Was der Product Owner einmalig tun muss
1. `sql/008_races.sql` im Supabase-SQL-Editor ausführen (nach 006/007).
2. Live: Worker „mental-math-race-room“ deployen, Secret für die Ticket-Prüfung setzen, Binding `RACE_ROOM` anlegen, neu deployen.
Ohne 1 bzw. 2 sind die Gruppen- bzw. Live-Rennen ausgeblendet; „Reihum“ funktioniert immer.

## 5. Integration (Hauptsession)
1. R1 mergen, prüfen (Playwright Reihum, Heute/Wettkampf-Einstiege).
2. R2 und R3 parallel auf diesem Stand; mergen (Konflikte erwartet in `src/views/compete.ts`, `server/challenge.ts`, `src/router.ts`, i18n `race`) – als Vereinigung lösen; Prüfungen; Server-Logik mit Fakes, Durable Object nur über den Zustandsautomaten testbar.
3. Release Notes **2.4.0**, PR nach `develop` nach Rückfrage.
