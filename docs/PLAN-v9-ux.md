# Plan v9 – Spielgefühl, Gewohnheit & Case-Realismus

Stand: 2026-11-11 · Basis: `claude/nice-brahmagupta-gmpncl` @ `3c92b22` (2.0.0) · Tests grün (798 + 111 + 145)

Quelle: Playtest am 2026-11-11 (iPhone-, iPad- und Desktop-Viewport, Neuinstallation → Einstufung → Runden → alle Tabs). Befunde:

| # | Befund | Arbeitspaket |
|---|---|---|
| 1 | Serie zählt nur Tage mit vollem Minuten-Tagesziel (Standard 15 min, mind. 5). Eine Runde dauert 1–2 min → 8–10 Runden/Tag nötig, kein Freeze. Minutenziel belohnt Langsamkeit. Nach Einstufung + 2 Runden stand „0 / 15 min“. | **B** |
| 2 | Jede richtige Antwort kostet „Prüfen“ + „Weiter“ – bricht den Rhythmus eines Tempo-Drills. | **A** (Auto-Weiter, **Standard: an**) |
| 3 | Ergebnis flach: 5/5 ohne „Perfekt“, ohne Bestzeit, ohne Vergleich, ohne Skill-Änderung; XP ohne sichtbares Ziel; halber Bildschirm leer. `personalBest()` wird nur im Modus „Präzise“ (nicht Standard) für den Geist benutzt. | **A** (Rundenbilanz) |
| 4 | Keine echte Case-Simulation: jede Aufgabe ist ein Schritt. | **C** (Mini-Case) |
| 5 | Sozial: Live-Duell ist geplant (PLAN-duell.md). Günstiger erster Schritt fehlt. | **I** (Freund herausfordern, ohne Server) |
| 6 | Erster Web-Besuch langsam: 201 Requests (197 ES-Module ohne Preload) → ~3 s auf 4G, ~8 s langsam. | **D** |
| 7 | Willkommens-Dialog geht verloren, wenn man die App währenddessen schließt (`lastSeenVersion` wird beim ersten Start gesetzt). | **F** |
| 8 | Profil-Tab ist nur Einstellungen – keine Spieler-Identität. | **H** |
| 9 | „Empfohlen“-Karte auf dem Telefon mit großer Leerfläche. | **H** |
| 10 | „1 Runden“ in Profil → Daten. | **F** |
| 11 | Kontakt steht auf Hilfe/Datenschutz (`mail(at)elias-steffen.de`), aber in der App gibt es kein „Feedback senden“. | **F** |
| 12 | Keine Unterstützung der iOS-Textgröße (Dynamic Type); Schriftgrößen fest in px. | **G** |
| 13 | Lernen ist eine flache Liste mit 40+ Typen – keine sichtbare Lernkarte. | **E** |
| 14 | iOS-Widget, Android | **§11** (geplant, nicht in dieser Runde umgesetzt) |

---

## 0. Ablauf & Agents

| Phase | Paket | Inhalt | Modell |
|---|---|---|---|
| 1 (parallel, je eigener Worktree) | **A** | Auto-Weiter + Rundenbilanz | sonnet |
| | **B** | Runden-Tagesziel, Serie mit Freeze, Erinnerungen | sonnet |
| | **C** | Mini-Case-Modus | sonnet |
| | **D** | Web-Bundle (esbuild) | sonnet |
| | **E** | Lernkarte im Lernen-Tab | haiku |
| | **F** | Kleinkram: Plural, Willkommen, Feedback senden | haiku |
| | **G** | Textgröße / Dynamic Type | sonnet |
| Integration | – | Merge A→B→C→D→E→F→G, Konflikte lösen, alle Prüfungen, Playwright-Smoke | Hauptsession |
| 2 (parallel) | **H** | Heute-Karte füllen, Spielerkarte im Profil (braucht A + B) | sonnet |
| | **I** | Freund herausfordern (braucht A) | sonnet |
| Abschluss | – | Merge, Prüfungen, Release Notes 2.1.0, Version, Push | Hauptsession |

---

## 1. Leitplanken für alle Pakete

**Code** (wie PLAN-v5): strict TypeScript, `.ts`-Imports, `import type` für Typen, kein `any`, DOM nur über `h()`/`appendChildren` (kein `innerHTML`), keine Inline-Styles außer `style.setProperty('--var', …)`, Theme-Tokens statt Farben, 320 px tauglich. Browser-APIs, die in der iOS-App anders laufen (Links öffnen, Teilen, Haptik …), nur über `src/platform/index.ts` (`tests/platform-guard.test.ts` prüft das). Code-Kommentare deutsch, kurz.

**Texte:** Jeder neue UI-Text in `src/i18n/locales/de/*.ts` **und** `src/i18n/locales/en/*.ts` (gleiche Schlüssel; `tests/i18n.test.ts`). Ton wie bestehende Texte: ruhig, du-Form, kurze Sätze.

**Design „Ruhiger Fokus“** (docs/PLAN-ruhiger-fokus.md) bleibt: informieren statt urteilen, keine Endlos-Animationen, kein Fehlerton, Konfetti nur mit Einstellung `confetti`. Belohnung = klare, ruhige Zeilen und Balken, keine Spielautomaten-Effekte. `prefers-reduced-motion` respektieren.

**Daten-Kompatibilität (wichtig):** Die Vorschau (`develop`) schreibt in dieselben Konten wie die Produktion. Deshalb:
- Neue Einstellungen nur **hinzufügen** (alte Clients reichen unbekannte Felder durch, `normalizeSettings` spreadet `raw`). Bestehende Felder nie umdeuten oder löschen (`dailyGoalMin` bleibt).
- Neue Felder in `Settings` (src/types.ts) und `DEFAULT_SETTINGS` (src/data/schema.ts) **ans Ende** mit Kommentar `// v9 <Paket>`; in `normalizeSettings` typprüfen (Boolean/Zahl mit Grenzen).
- Keine neuen Sync-Dokumente/-Collections, keine SQL-Änderungen.
- `Session.mode` ist Freitext (Sync: ≤ 64 Zeichen). Für Runden außerhalb von `#/train` gilt (identisch in jedem Paket, das es braucht, in `src/types.ts` direkt über `interface Session`):
  ```ts
  /** Runden außerhalb von #/train (zählen fürs Tagesziel, v9) */
  export type ExtraSessionMode = 'chain' | 'parallel' | `case:${string}`;
  ```
  und `mode: Mode | ExtraSessionMode;` in `Session`.

**Dateibesitz / Konflikte:** Jedes Paket ändert nur die genannten Dateien. Unvermeidbar gemeinsam: `src/types.ts`, `src/data/schema.ts`, `src/views/settings.ts`, i18n-Dateien, `src/core/modes.ts`, `src/views/home.ts`. Dort nur **anhängen** bzw. minimal und lokal ändern, mit Kommentar `// v9 <Paket>`. Neue i18n-Namensräume (eigene Datei + Eintrag in `locales/{de,en}/index.ts`) sind erwünscht, wenn ein Paket viele Texte hat.

**Nicht anfassen:** `package.json` (Version), `src/releases.ts`, `CHANGELOG.md`, `ios/`, `.github/`, `sql/`, `README.md` (außer D und B wie unten beschrieben). Release Notes schreibt die Hauptsession.

**Tests:** Neue Tests in neuen Dateien `tests/v9-<thema>.test.ts` (node:test, wie bestehende; Helfer in `tests/helpers.ts`). Bestehende Tests nur ändern, wenn sich das Verhalten bewusst ändert – dann im Bericht nennen. DOM-freie Logik in `src/core/…` auslagern und dort testen.

**Prüfen vor dem Commit** (alle drei grün):
```bash
npm ci --no-audit --no-fund   # einmal im Worktree
npm run typecheck
npm test
npm run build
```
UI-Pakete zusätzlich mit Playwright (vorinstalliert, `require('playwright')`, `chromium.launch()` ohne Optionen) gegen `python3 -m http.server <PORT> -d dist` – **jedes Paket eigener Port** (A 5181, B 5182, C 5183, D 5184, E 5185, F 5186, G 5187, H 5188, I 5189). Viewports 390×844 (`isMobile`, `hasTouch`, `locale: 'de-DE'`) und 1180×820; Screenshots mit `deviceScaleFactor: 1` ansehen; keine `pageerror`/Konsolenfehler; kein waagerechtes Scrollen (`scrollWidth ≤ innerWidth`). Server danach beenden.

**Commit:** im Worktree, konventionelle Nachricht auf Deutsch wie im Repo (`feat(train): …`), Abschluss-Zeilen:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CvA9TXwPmWzXPznvLd6X4C
```
Nicht pushen. **Bericht** an die Hauptsession: Branch/Worktree, geänderte Dateien, Testzahlen, bewusst geänderte Tests, offene Punkte.

---

## 2. Paket A – Auto-Weiter & Rundenbilanz

### A1 Auto-Weiter nach richtigen Antworten (Standard an)

- **Einstellung** `autoAdvance: boolean`, Default **`true`**, synchronisiert (nicht geräte-lokal). `normalizeSettings`: nur Boolean, sonst Default.
- **Regel** (DOM-frei in `src/core/auto-advance.ts`, getestet):
  ```ts
  export const AUTO_ADVANCE_MS = 700;
  export function shouldAutoAdvance(o: { enabled: boolean; correct: boolean; timedOut: boolean }): boolean; // enabled && correct && !timedOut
  ```
  Gilt für Zahlen- und Auswahlaufgaben, mit und ohne Hilfe, in allen Modi (auch Einstufung, Daily, gewertet). Falsch/übersprungen/Zeit abgelaufen: unverändert, „Weiter“ von Hand.
- **Ablauf** in `src/views/train/index.ts` → `finish()`: Feedback wie bisher zeigen; wenn `shouldAutoAdvance` → Timer `AUTO_ADVANCE_MS`, dann `advance()` (letzte Aufgabe → Ergebnis).
  - **Abbrechen**, sobald der Nutzer im Feedback etwas anderes tut: `pointerdown`/`keydown` im Feedback-Sheet bzw. Auswahl-Bereich, der nicht „Weiter“ ist (Lösungsweg aufklappen, Methode, KI). Danach wartet die App wie heute auf „Weiter“.
  - **Pausieren** bei `document.hidden`; beim Zurückkommen neu starten.
  - Timer in `stop()`/Cleanup löschen (kein Weiter nach Verlassen der Route).
  - „Weiter“-Tipp und Enter wirken sofort (wie heute, `advance` ist idempotent).
- **Sichtbar:** „Weiter“-Button bekommt Klasse `is-auto` mit dezenter Füllung von links in `AUTO_ADVANCE_MS` (CSS-Variable `--auto-ms`, `public/css/views/train.css`). `prefers-reduced-motion`: keine Füllung, Timer bleibt. Beim Abbruch Klasse entfernen.
- **Rundgang:** Die Tour (`src/features/tour*.ts`, `tour-demo.ts`, `npm run preview:record`) darf nicht kaputtgehen: im Tour-/Aufnahme-Modus Auto-Weiter aus (oder Skripte anpassen) – `tests/tour.test.ts` muss grün bleiben.
- **Profil → „Während der Runde“** (`src/views/settings.ts`, neben `autoSubmit`): Schalter „Bei richtiger Antwort automatisch weiter“ · Hilfe „Nach einer richtigen Antwort geht es kurz danach von selbst weiter. Bei Fehlern bleibt die Lösung stehen, bis du tippst.“ (EN: „Continue automatically after a correct answer“ · „After a correct answer the next task follows on its own. After a mistake the solution stays until you tap.“)
- `autoSubmit` („Automatisch prüfen“) bleibt unverändert (Standard aus).

### A2 Rundenbilanz auf dem Ergebnis

- **DOM-frei** `src/core/recap.ts`:
  ```ts
  export interface RoundRecap {
    perfect: boolean;                    // n ≥ 3, alle richtig, keine Hilfe genutzt
    newBest: { avgMs: number; prevAvgMs: number | null } | null;
    vsLast: { deltaAvgMs: number; deltaAcc: number } | null;   // gegen die letzte Runde desselben Modus
    skill: { subtype: SubtypeId; before: number | null; after: number } | null; // größter Zuwachs (> 0) unter den Subtypen der Runde
    level: { level: number; into: number; needed: number; gained: number; levelUp: boolean };
  }
  export function roundRecap(o: {
    mode: Mode; n: number; correct: number; avgMs: number; assistedAny: boolean;
    sessionsBefore: readonly Session[]; attemptsBefore: readonly Attempt[]; attemptsAfter: readonly Attempt[];
  }): RoundRecap;
  ```
  - `newBest` nur, wenn diese Runde qualifiziert (Regeln von `personalBest`: n ≥ 5, ≥ 80 %) und schneller ist als `personalBest(sessionsBefore, mode)` (oder es keinen gab → `prevAvgMs: null`). Nicht für feste/fremde Runden: `daily`, `retry`, `review`, `placement`, `challenge`, `custom`.
  - `vsLast` nur bei vorheriger Runde gleichen Modus; `deltaAvgMs` = jetzt − vorher (negativ = schneller).
  - `skill` aus `subtypeStats(attemptsBefore)` vs. `subtypeStats(attemptsAfter)`.
  - `level` aus `xpInfo(attemptsBefore)` vs. `xpInfo(attemptsAfter)`.
- **Reihenfolge in `showResult`** (`src/views/train/result.ts`): `sessionsBefore = getSessions()` **vor** `addSession(…)`; `attemptsBefore` = alle Versuche ohne `ctx.sessionId`.
- **Oberfläche** (nur ungewertete Runden; gewertete bleiben wie sie sind):
  - Titel bei `perfect`: „Perfekt – 10 von 10“ (EN „Perfect – 10 of 10“), sonst wie heute.
  - Unter „Ø … pro Aufgabe“: Vergleichszeile, wenn |Δ| ≥ 0,1 s: „0,6 s schneller als letztes Mal“ (Ton `good`) bzw. „0,3 s langsamer als letztes Mal“ (gedämpft).
  - Karte `insight` (Icon `trophy`, Ton `good`) bei `newBest`: „Neue Bestzeit“ · „Ø 4,2 s pro Aufgabe – vorher 5,0 s“ (ohne vorher: „Ø 4,2 s – deine erste Bestzeit in diesem Modus“). Steht vor der Fehler-Erkenntnis.
  - Skill-Zeile: „Skill · 2-stellig × 1-stellig  78 → 83“ mit kleinem Balken (`progressBar` aus kit).
  - Level-Karte: „Level 3“ + Balken + „+750 XP“; bei `levelUp` zusätzlich „Level 4 erreicht“ (Ton `good`). **`xp` aus dem `statusLine`-Aufruf in result.ts entfernen** (XP steht jetzt in der Level-Karte; Paket B ändert dieselbe Zeile – Konflikt löst die Hauptsession).
  - Kein Konfetti, kein Ton; Eingangs-Animation höchstens die vorhandene Klasse `rise`.
  - `maybeAskForReview({ correct, n, newBest: recap.newBest !== null })`.
- **Dateien:** `src/core/auto-advance.ts`, `src/core/recap.ts`, `src/views/train/index.ts`, `src/views/train/result.ts`, `src/views/train/feedback.ts`, `src/views/settings.ts` (ein Schalter), `src/types.ts`, `src/data/schema.ts`, `public/css/views/train.css`, i18n `train`/`settings` (anhängen) oder neuer Namensraum `recap`, ggf. `src/features/tour*.ts`.
- **Tests:** `tests/v9-auto-advance.test.ts`, `tests/v9-recap.test.ts` (perfect; newBest mit/ohne Vorwert; nicht für daily/retry; vsLast; Skill-Zuwachs; Level-up an der Grenze); Settings-Default/Normalisierung.
- **Abnahme (Playwright):** Runde mit richtigen Antworten läuft ohne „Weiter“-Tipp durch; falsche Antwort bleibt stehen; Lösungsweg aufklappen stoppt Auto-Weiter; Schalter aus → wie früher. Ergebnis-Screenshots: perfekte Runde, gemischte Runde, zweite Runde schneller (Bestzeit + Vergleich).

---

## 3. Paket B – Runden-Tagesziel, Serie mit Freeze

### Regeln

- **Tagesziel in Runden:** neue Einstellung `dailyGoalRounds` (Default **3**, ganzzahlig 1–10, synchronisiert). `dailyGoalMin` bleibt gespeichert (alte Clients), wird aber nicht mehr gezeigt oder ausgewertet – außer als Altwert für alte Server (s. Erinnerungen).
- **Runde** = eine gespeicherte `Session` (Training, Daily, Einstufung …) – plus neu Kettenrechnen, Paralleles Kettenrechnen (B) und Mini-Case (C), die beim Rundenende ebenfalls eine Session schreiben.
- **Serie:** Ein Tag zählt, wenn **mindestens eine Runde** gespielt wurde – oder (Altbestand ohne Sessions) ≥ 5 aktive Minuten. „Eine Runde hält die Serie, das Ziel ist dein Vorsatz.“
- **Freeze:** Je 7 Serientage am Stück gibt es einen Freeze (höchstens 2 auf Vorrat). Ein verpasster Tag (nicht heute) wird automatisch mit einem Freeze überbrückt: Serie bleibt, der Tag zählt nicht mit. Rein aus der Historie berechnet → kein neuer Speicher, kein Sync.
- Heute noch ohne Runde bricht die Serie nicht (wie bisher).

### Kern `src/core/habit.ts` (DOM-frei, getestet)
```ts
export const DEFAULT_GOAL_ROUNDS = 3;
export const FREEZE_EVERY_DAYS = 7;
export const MAX_FREEZES = 2;
export const LEGACY_ACTIVE_MS = 5 * 60_000;
export function roundsByDay(sessions: readonly { ts: number }[]): Record<string, number>;
export interface HabitInfo {
  todayRounds: number; goalRounds: number; todayDone: boolean; // ≥ Ziel
  kept: boolean;          // heute ≥ 1 Runde → Serie gesichert
  streak: number; best: number; freezes: number; frozenDays: string[];
}
export function habitInfo(o: { sessions: readonly { ts: number }[]; activity: Activity; goalRounds: number; now?: number }): HabitInfo;
```
Chronologischer Lauf über höchstens 730 Tage bis gestern (Tagesschlüssel wie `dayKey`, DST-sicher wie in progress.ts), dann heute. Tests: Lücke mit/ohne Freeze, 2 Freezes, Vorrat max. 2, Altbestand nur Aktivität, DST-Wechsel, heute leer.

### Oberfläche
- `statusLine` (`src/ui/kit.ts`) neu: `{ todayRounds, goalRounds, streak?, freezes?, xp?, startHint? }` → Ring = Runden/Ziel, „1 / 3 Runden heute“ (EN „1 / 3 rounds today“), Flamme + Serie wenn > 0, Schneeflocke + Anzahl wenn Freezes > 0 (Icon ggf. ergänzen, Stil wie bestehende Icons). `startHint` (nur Heute): bei Serie 0 und 0 Runden „Starte heute deine Serie“.
- **Heute** (`src/views/home.ts`): nur die `statusLine`-Zeile umstellen (Paket H baut später die Karte um).
- **Ergebnis** (`src/views/train/result.ts`): nur der `statusLine`-Aufruf → Runden (die eben gespeicherte Session zählt mit). Wenn genau diese Runde das Tagesziel erreicht: Zeile „Tagesziel erreicht“ (Ton `good`); Konfetti nur mit `settings.confetti`, einmal pro Tag (`settings.celebrated`). Die Konfetti-Logik aus `src/features/activity.ts` entfernen (Minuten-Tracking dort bleibt für Tempo-Statistiken).
- **Fortschritt** (`src/views/progress.ts`, `progress-data.ts`): Wochenbalken = Runden pro Tag, Ziellinie = `dailyGoalRounds`, Meta „Ziel 3 Runden / Tag“; Heatmap-Stufen nach Runden/Ziel; Serien-Meta aus `habitInfo` (aktuell/bester), Freezes anzeigen. Die Kennzahl „Minuten“ oben darf bleiben (Info).
- **Profil → Training** (`src/views/settings.ts`): Stepper „Tagesziel“ 1–10 Runden statt Minuten; Hilfe „Eine Runde am Tag hält deine Serie. Für jede Woche am Stück bekommst du einen Freeze (höchstens 2), der einen verpassten Tag überbrückt.“; Zusammenfassung „Auto · 3 Runden · 10 Aufgaben“.
- Texte, die das Minutenziel erwähnen (Onboarding, Tour-Skripte, `scripts/pages.ts` Hilfe-Seite, README-Tabelle „Erinnerungen“), anpassen. `src/features/tour-demo.ts`: Demo-Sessions so säen, dass Heute „2 / 3 Runden · 12 in Folge“ zeigt.
- **Kettenrechnen / Parallel** (`src/views/chain.ts`, `src/views/parallel/result.ts`): am Rundenende `addSession({ id, ts, mode: 'chain' | 'parallel', n, correct, points, avgTimeMs })` (sinnvolle Werte; `id` wie bestehende Session-IDs erzeugen, s. `src/data/ids.ts`). `modeName` (`src/core/modes.ts`) kennt 'chain'/'parallel' (vorhandene Titel-Texte nutzen).

### Erinnerungen (abwärtskompatibel!)
Der Push-Takt ruft die **Produktions**-API; Vorschau-Clients melden ihren Stand dorthin. Deshalb:
- `ReminderState` (`src/core/reminders.ts`) bekommt **optionale** Felder `todayRounds?`, `goalRounds?`, `kept?`. `parseState` liest sie optional (ganzzahlig ≤ 100 bzw. Boolean), fehlt etwas → `undefined`. Alte Felder bleiben Pflicht und gefüllt: `todayMin` = echte aktive Minuten, `goalMin` = `settings.dailyGoalMin` (Altwert), `goalDone` = Runden-Ziel erreicht, `streak` = neue Serie.
- `buildReminderState` (`src/core/reminder-state.ts`) bekommt `sessions` und `goalRounds`; `src/features/reminder-input.ts` übergibt `getSessions()` und `dailyGoalRounds`.
- `streakAtRisk`: wenn `kept` definiert → Serie heute gesichert, sobald `kept`; sonst alte Logik.
- `src/core/reminder-messages.ts`: mit `goalRounds` Runden-Texte („Eine kurze Runde heute, dann hält deine Serie.“ / „Eine Runde reicht – sonst reißt deine Serie um Mitternacht.“ / täglich ggf. „Noch {left} Runden bis zu deinem Tagesziel“), ohne → bisherige Minuten-Texte. EN entsprechend.
- iOS plant lokal mit denselben Regeln (`reminder-plan.ts`) – nichts extra, aber Tests prüfen.
- Bestehende Tests `reminders`, `reminder-plan`, `push` bleiben grün; neue Fälle in `tests/v9-habit.test.ts` / `tests/v9-reminders.test.ts`.

**Dateien:** `src/core/habit.ts`, `src/core/progress.ts` (nur falls Helfer geteilt werden), `src/core/reminders.ts`, `src/core/reminder-state.ts`, `src/core/reminder-messages.ts`, `src/features/reminder-input.ts`, `src/features/activity.ts`, `src/features/tour-demo.ts`, ggf. `src/features/tour-scripts.ts`, `src/ui/kit.ts` (statusLine), `src/views/home.ts` (eine Zeile), `src/views/train/result.ts` (statusLine-Aufruf + Ziel-Zeile), `src/views/progress.ts`, `src/views/progress-data.ts`, `src/views/settings.ts`, `src/views/chain.ts`, `src/views/parallel/result.ts`, `src/core/modes.ts`, `src/types.ts`, `src/data/schema.ts`, i18n, `public/css/views/{today,progress}.css`, `scripts/pages.ts`, README (Erinnerungs-Tabelle).

**Abnahme:** frische Installation → nach 1 Runde „1 / 3 Runden heute · 1 in Folge“; nach 3 Runden Ziel erreicht; Fortschritt-Woche zeigt Runden. Test mit gesäten Daten (Playwright `page.evaluate` über die App-Speicher-API oder Import-Datei aus `tests/fixtures`): Serie 8 mit einem Freeze-Tag korrekt.

---

## 4. Paket C – Mini-Case

**Ziel:** Ein Fall, 4–5 verknüpfte Rechenschritte wie im Interview, am Ende eine „So what?“-Entscheidung. Das unterscheidet die App von allgemeinen Kopfrechen-Apps.

### Kern `src/core/cases/`
- `types.ts`:
  ```ts
  export interface CaseNumberStep { kind: 'number'; prompt: string; expected: number; tol: { abs: number; rel: number }; unit: string; hint?: string; targetMs: number; solution: string[] }
  export interface CaseChoiceStep { kind: 'choice'; prompt: string; choices: string[]; correctIndex: number; why: string; targetMs: number }
  export type CaseStep = CaseNumberStep | CaseChoiceStep;
  export interface MiniCase { templateId: string; title: string; brief: string; exhibit: unknown | null; steps: CaseStep[] }
  export interface CaseTemplate { id: string; title(): string; generate(rng: Rng): MiniCase }
  ```
  (`exhibit` im Format, das `renderExhibit` aus `src/ui/exhibit.ts` versteht – Typ von dort übernehmen.)
- `index.ts`: `CASE_TEMPLATES`, `caseById(id)`, `generateCase(id, rng)`.
- **Verkettung:** Alle Werte werden zu Beginn aus Basiszahlen berechnet. Jeder Folgeschritt nennt den **richtigen** Wert des vorigen („Mit 120 Mio. € weiterrechnen: …“) – ein Fehler zieht keine Folgefehler nach sich.
- **Zahlen case-tauglich** (runde Werte, Tsd./Mio./Mrd. über `fmt`/vorhandene Einheiten-Helfer), Toleranzen wie bei ähnlichen Subtypen (Schätzwerte rel. 2–5 %).
- **Mindestens 8 Vorlagen** (jeweils de/en über `t()` bzw. dasselbe Muster wie die Generatoren, s. `src/core/l10n.ts`/`src/core/generators/`):
  1. `market` Marktgröße: Bevölkerung → Zielgruppen-Anteil → Nutzung/Jahr → Preis → Markt (Mio./Mrd. €) → *Lohnt Markteintritt mit Ziel-Marktanteil und Mindestumsatz?*
  2. `profit` Profitabilität: Preis × Menge → variable Kosten → Fixkosten → Gewinn → Marge → *Welcher Hebel bringt mehr: Preis +5 % oder Fixkosten −10 %?*
  3. `breakeven` Break-even: Preis − variable Kosten = DB → Fixkosten ÷ DB → Monate bis Break-even → *Vor Ablauf von 2 Jahren erreichbar?*
  4. `invest` Investition: Capex, jährliche Einsparung → Payback → ROI über 5 Jahre → *Unter der Payback-Grenze des Kunden?*
  5. `pricing` Preiserhöhung: Preis +x %, Menge −y % → neuer Umsatz → Veränderung in % → *Steigt der Umsatz?*
  6. `ops` Kapazität: Vorgänge/Tag × Bearbeitungszeit → Stunden → FTE → Kosten → Einsparung durch Automatisierung → *Rechnet sich das Tool?*
  7. `growth` Wachstum: Umsatz A → B in n Jahren → Faktor → CAGR (72er-/Faktor-Näherung) → Prognose → *Ziel bis Jahr X erreichbar?*
  8. `exhibit` Exhibit: Balkendiagramm Segmentumsätze + Margen → Gesamtumsatz → Anteil → gewichtete Marge → *Welches Segment priorisieren?*
- Jede Entscheidung hat genau eine richtige Antwort, die aus den Zahlen folgt (mit `why`-Begründung).

### Oberfläche
- **Routen** (`src/router.ts`): `#/case` = Auswahl, `#/case/<id>` = Spiel, `#/case/random`. Tab `today`, Titel „Mini-Case“.
- **Auswahl** (`src/views/case.ts`): Primär „Zufälliger Case“, darunter Liste der Vorlagen mit bestem Ergebnis (aus Sessions `case:<id>`: „4/5“).
- **Spiel** (`src/views/case-play.ts` o. ä.): Kopf wie Training (✕, Segmente je Schritt). Oben die Fallbeschreibung (nach Schritt 1 einklappbar) und ggf. Exhibit; darunter der aktuelle Schritt. Eingabe über die vorhandenen Bausteine (`src/views/train/answer.ts` `createAnswer`, `src/ui/keypad.ts`, `dock`), Wertung über `evaluate()` (`src/core/scoring.ts`) mit einem passenden Task-Objekt, Feedback ruhig wie im Training („Richtig“/Diagnose + Lösungsweg + „Weiter“). Auswahl-Schritt wie Auswahlaufgaben im Training.
- **Ergebnis:** „4 von 5 Schritten richtig“, Liste der Schritte (falsche zuerst, mit Lösungsweg im Sheet), „Nächster Case“ (primär), „Fertig“.
- **Speichern:** keine Attempts (Skills bleiben sauber). Am Ende **eine Session** `mode: 'case:<templateId>'`, `n` = Schritte, `correct`, `points`, `avgTimeMs` → zählt fürs Tagesziel (Paket B). `ExtraSessionMode` wie in §1. `modeName('case:<id>')` → „Mini-Case · <Titel>“.
- **Einstiege:** Heute → „Weitere Modi“-Sheet und iPad-Kacheln (`src/views/home.ts`): neuer erster Eintrag „Mini-Case“ · „Ein Fall, mehrere Rechenschritte“ (EN „Mini case“ · „One case, several steps“). Nur diese Einträge ändern.
- CSS ans Ende von `public/css/views/play.css` (keine neue CSS-Datei, `index.html` nicht ändern).

**Tests** `tests/v9-cases.test.ts`: jede Vorlage × 300 Seeds (`mulberry32` aus `src/core/daily.ts`) × de/en: alle Zahlen endlich, Erwartungswerte = Neuberechnung, Prompts ohne `NaN`/`undefined`, genau eine richtige Wahl, Determinismus bei gleichem Seed, Toleranzen > 0 wo nötig.

**Abnahme:** Playwright spielt `#/case/market` und `#/case/exhibit` (je ein Fehler eingebaut) bis zum Ergebnis; Screenshots Telefon + iPad.

---

## 5. Paket D – Web-Bundle

**Ziel:** Erster Web-Besuch ohne Modul-Wasserfall. Heute: 201 Requests, 4G (40 ms RTT) ~3,0 s, 150 ms RTT ~8,3 s bis die Startseite bedienbar ist.

- Neues `scripts/bundle.ts` (esbuild ist schon devDependency, Muster: `scripts/vendor.ts`): nach `tsc` die App aus `src/app.ts` bündeln → `dist/js/app.js` (überschreibt die tsc-Ausgabe), `format: 'esm'`, `bundle: true`, `splitting: true` (dynamische `import()` bleiben Lazy-Chunks), `minify: true`, `target: 'es2022'`, `chunkNames: 'c/[hash]'` (neutrale Namen – Werbeblocker-Listen, s. `tests/blocker-safe-paths.test.ts` und 1.17.2), `legalComments: 'none'`.
- Danach alle **nicht mehr referenzierten** tsc-Module unter `dist/js/` löschen (bleiben: Bundle, Chunks, `boot-guard.js`, alles, was HTML/SW/iOS direkt lädt). Vorher prüfen, ob irgendwo Pfade unter `dist/js/` zur Laufzeit erwartet werden (`src/platform/live-update.ts`, `scripts/live-update.ts`, `scripts/precache.ts`, `src/sw.ts`, `boot-guard`, `scripts/record-preview.ts`). `scripts/vendor.ts` entfällt, wenn das Bundle die Vendor-Module mitnimmt – sonst beibehalten; der Test „keine bare Imports“ gilt fürs Bundle.
- `package.json` `build`: Schritt einfügen (Script-Kette; **Version nicht ändern**). `npm run dev`, `ios:sync`, `local:*` müssen weiter funktionieren.
- Optional, wenn einfach: CSS (14 Dateien) zu `dist/css/app.css` bündeln und `index.html` darauf umstellen.
- Precache (`scripts/precache.ts`) und Live-Update-Manifest ergeben sich aus `dist/` – prüfen, dass Tests (`sw`, `live-update`, `build-config`, `pages`, `blocker-safe-paths`) grün bleiben.
- README: Build-Abschnitt (eine Zeile zur Bundle-Stufe).
- **Messen** vorher/nachher mit dem Skript unten (eigener Port 5184) und im Bericht nennen. Ziel: JS-Requests ≤ 10, 4G < 1,5 s.
  ```js
  // perf.cjs – node perf.cjs <port>
  const { chromium } = require('playwright');
  (async () => { const b = await chromium.launch(); const port = process.argv[2];
    for (const [label, lat, down] of [['local',0,-1],['4G',40,4*1024*1024/8],['slow',150,1.6*1024*1024/8]]) {
      const ctx = await b.newContext({ viewport:{width:390,height:844}, locale:'de-DE' }); const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
      if (lat) await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:lat,downloadThroughput:down,uploadThroughput:down});
      let n=0; page.on('request',()=>n++); const t0=Date.now();
      await page.goto(`http://localhost:${port}/`); await page.getByText('Jetzt üben').first().waitFor({timeout:60000});
      console.log(label, Date.now()-t0, 'ms', n, 'requests'); await ctx.close(); }
    await b.close(); })();
  ```
- **Abnahme:** Playwright-Smoke ohne Konsolenfehler: Start, Willkommen → „Selbst entdecken“, Runde spielen, Lernen, Fortschritt, Profil, Rundgang starten (lazy `tour.ts`), Offline-Reload nach erstem Besuch (Service Worker).

---

## 6. Paket E – Lernkarte

- Lernen-Liste (`src/views/lernen.ts`, `listParts`): oben eine Karte „Deine Lernkarte“: „12 von 44 Aufgabentypen sicher · 8 in Arbeit · 24 offen“ (Mastery aus `masteryOf`: `full`/`half`/`empty`) mit gestapeltem Balken (Ton `good`/`accent`/neutral) und Link „Weiterlernen: <Subtyp>“ (vorhandenes `next`).
- Jede Kategorie-Überschrift: kleiner Balken + „3/6 sicher“.
- Suche bleibt funktionsfähig (Karte bei aktiver Suche ausblenden; Abschnitte filtern wie bisher). Master-Detail auf dem iPad unverändert.
- **Dateien:** `src/views/lernen.ts`, `public/css/views/learn.css`, i18n `lernen` (anhängen). DOM-freie Zählung in `src/views/lernen-search.ts` o. ä. oder `src/core/mastery.ts` mit Test `tests/v9-mastery.test.ts`.
- **Abnahme:** Screenshots leer (neu) und mit Daten (nach ein paar Runden), Telefon + iPad.

---

## 7. Paket F – Kleinkram

1. **Plural:** `settings.storedCount` / `importDone` / `importDoneSkipped` mit Einzahl („1 Aufgabe“, „1 Runde“) in de und en; Aufrufer in `src/views/settings.ts` wählen den passenden Schlüssel.
2. **Willkommen geht nicht verloren:** `shouldShowOnboarding` (`src/features/onboarding.ts`) = `!onboardingDone && attempts === 0` (ohne `lastSeenVersion`). `onboardingDone` erst setzen, wenn der Nutzer im Dialog wählt (Rundgang/Selbst entdecken) oder die Einführung beendet – prüfen in `src/ui/onboarding.ts`, `src/app.ts` (Kommentar anpassen). `tests/onboarding.test.ts` anpassen (bewusste Änderung).
3. **Feedback senden:** Kontakt aus `scripts/pages.ts` in `src/core/contact.ts` verschieben (`CONTACT = { name, user: 'mail', domain: 'elias-steffen.de' }`, Anzeige `mail(at)…` wie bisher auf den Seiten; Adresse für `mailto:` erst zur Laufzeit zusammensetzen). `scripts/pages.ts` importiert von dort (Seiten bleiben inhaltlich gleich, `tests/pages.test.ts` grün). Profil → „Hilfe & Info“: Zeilen „Feedback senden“ und „Fehler melden“ → `mailto:` mit Betreff („Mental Math Feedback“ / „Mental Math Fehler“) und vorausgefülltem Text: App-Version, Build, Plattform (Web/iOS), Sprache, Gerätetyp (Telefon/Tablet/Desktop nach Viewport) – **keine** Trainings- oder Kontodaten. Öffnen über die Plattform-Schicht (`src/platform/index.ts`; ggf. Funktion ergänzen, Web: `location.href = mailto`, iOS: Capacitor Browser/`App.openUrl`-Äquivalent wie vorhandene externe Links).
- **Tests:** `tests/v9-feedback.test.ts` (mailto-Aufbau: Kodierung, keine personenbezogenen Felder), Plural-Auswahl.

---

## 8. Paket G – Textgröße (Dynamic Type)

- **Tokens** (`public/css/tokens.css`): `--text-xs` … `--text-lg` = `calc(<px> * var(--type-scale, 1))`; `--text-xl`, `--text-num`, `--text-display` mit `min(var(--type-scale, 1), 1.2)` skalieren (große Zahlen sind schon groß); Tab-Labels höchstens 1,2×. Weitere feste `font-size`-px-Werte in den CSS-Dateien auf Tokens umstellen, wo es Fließtext ist.
- **Messen** `src/ui/text-scale.ts` + DOM-freie Funktion `textScaleFrom(probePx: number, basePx: number): number` (Clamp 0,9–1,5): unsichtbarer Probe-Span mit `font: -apple-system-body` (WebKit/iOS, Basis 17 px); wenn nicht unterstützt (Schrift unverändert), Probe mit `font-size: medium` (Browser-Grundgröße, Basis 16 px). Ergebnis als `--type-scale` auf `<html>`; Klasse `is-large-text` ab 1,15. Neu messen bei `visibilitychange` und `resize`. Aufruf beim Start (`src/app.ts`, vor dem ersten Rendern).
- **Layouts bei großer Schrift** (`is-large-text`): Heute darf scrollen (die „ohne Scrollen“-Regel aufheben), Tastenfeld-Tasten wachsen nicht über den Bildschirm, Feedback-Sheet scrollt, nichts schneidet ab.
- **Abnahme (Playwright):** `--type-scale` per `page.evaluate` auf 1,0 / 1,3 / 1,5 setzen; Screenshots Heute, Training (Zahl + Exhibit), Feedback, Ergebnis, Lernen-Detail, Fortschritt, Profil bei 390×844 **und** 320×568; kein waagerechtes Scrollen, kein abgeschnittener Text. Echtes Dynamic Type lässt sich hier nicht testen → im Bericht als manueller iPhone-Test notieren (Einstellungen → Anzeige & Helligkeit → Textgröße).
- **Tests:** `tests/v9-text-scale.test.ts`.

---

## 9. Phase 2 – Paket H: Heute-Karte & Spielerkarte (nach A + B)

- **Heute-Karte** (`src/views/home.ts`, Funktion `hero`; `public/css/views/today.css`): Die Leerfläche auf dem Telefon füllen mit
  - „Zum Beispiel“ + einer Beispielaufgabe des empfohlenen Typs groß in Zahlen-Schrift (`generate(subtype, rng, { level })` mit tagesstabilem Seed `seedFromString(dayKey + subtype)`, damit sie nicht bei jedem Rendern springt); Exhibit-Typen: nur der Fragetext; bei `review`/`mixed`: 2–3 Subtyp-Namen der Runde.
  - Tagesziel als Punkte (●●○ = 2 von 3 Runden) aus `habitInfo`.
  - Ohne Scrollen auf 375×667 und 390×844 (wie bisher), iPad unverändert oder entsprechend.
- **Spielerkarte** oben im Profil (`src/views/settings.ts` Startseite des Profils): Level + XP-Balken (`xpInfo`), Serie (aktuell / beste) + Freezes (`habitInfo`), gelöste Aufgaben, Runden, Genauigkeit gesamt, beste Daily (`getDailyResults`), mit Konto der Anzeigename. Antippen → `#/fortschritt`. Ruhig, eine Karte.
- **Tests:** DOM-freie Zusammenstellung (`src/views/profile-card-data.ts` o. ä.) in `tests/v9-profile-card.test.ts`.

## 10. Phase 2 – Paket I: Freund herausfordern (ohne Server)

- **Kern** `src/core/duel-link.ts`: Payload als base64url-JSON, Version 1:
  `{ v: 1, kind: 'set' | 'daily', seed?: number, day?: 'YYYY-MM-DD', cat: CategoryId | 'all', n: 5 | 10 | 15, lvl: 1 | 2 | 3, name?: string, c: number, p: number, t: number }`.
  `encodeDuel`/`decodeDuel` mit strenger Prüfung (Länge ≤ 600 Zeichen, Zahlen begrenzen, Name ≤ 24 Zeichen ohne Steuerzeichen, nur per `textContent` anzeigen). `duelTasks(payload)`: `kind 'daily'` → `dailyTasks(day)`; `kind 'set'` → deterministisch wie `dailyTasks` (mulberry32 + Seed), `cat 'all'` reihum über `mixCategories`, sonst Subtypen der Kategorie, feste Stufe `lvl`.
  `duelOutcome(me, them)`: mehr richtige gewinnt; Gleichstand → weniger Gesamtzeit; sonst unentschieden.
- **Modus** `duel` in `src/core/modes.ts` (SPECIAL + Übersetzung `core.mode.duel`); Aufgaben wie `retry` über `sessionStorage` (`mm.duel`) an `#/train/duel` übergeben; `TrainCtx` bekommt optional `duel` (Gegner-Ergebnis + Payload-Basis).
- **Annehmen:** `#/duell?d=<payload>` (`src/router.ts`, `src/views/duel.ts`): „<Name> fordert dich heraus“ · „8/10 · 52 s · Gemischt · Mittel“ → „Annehmen“ spielt die Aufgaben.
- **Ergebnis** (`src/views/train/result.ts`, nur wenn `ctx.duel`): Vergleichskarte „Du 9/10 · 48 s – gewonnen“ / „knapp verloren“ / „unentschieden“ + „Revanche senden“ (gleicher Satz, dein Ergebnis) + „Neue Herausforderung“.
- **Herausfordern:**
  - Wettkampf-Tab (`src/views/compete.ts`, auch ohne Konto sichtbar): Karte „Freund herausfordern“ → Kategorie (Gemischt Standard), Länge 10, Stufe Mittel → du spielst zuerst (neuer Zufalls-Seed) → Ergebnis bietet „Herausforderung senden“.
  - Ergebnis der ungewerteten Daily: „Freund herausfordern“ (`kind: 'daily'`).
  - Teilen über `shareText` (Plattform) mit `${publicUrl()}#/duell?d=…`. Name optional: Feld im Teilen-Sheet, gemerkt in neuer Einstellung `duelName` (String ≤ 24, synchronisiert; mit Konto Vorschlag aus dem Profilnamen).
- **Tests:** `tests/v9-duel-link.test.ts` (Roundtrip, Manipulation/Übergröße abgelehnt, Determinismus gleicher Payload → gleiche Aufgaben, Daily-Variante, Ausgang).
- **Abnahme:** zwei Browser-Profile in Playwright: A fordert heraus, B öffnet Link, spielt, sieht Vergleich; Revanche-Link funktioniert.

---

## 11. Geplant, nicht in dieser Runde umgesetzt

Beides lässt sich in dieser Umgebung (Linux, ohne Xcode bzw. Android-SDK) nicht bauen oder prüfen; ein ungetesteter Eingriff ins Xcode-Projekt würde die TestFlight-Pipeline und damit das Release-Gate gefährden.

### iOS-Widget (Serie & Daily)
1. In Xcode: neues Target „Widget Extension“ (`MentalMathWidget`, SwiftUI, WidgetKit), App Group `group.de.eliassteffen.mentalmath` für App und Widget (Entitlements + Provisioning; `scripts/asc-*` prüfen).
2. Capacitor-Plugin `WidgetBridge` (Swift, wie `AppStorePlugin.swift`): `update({ streak, kept, todayRounds, goalRounds, dailyOpen, freezes })` schreibt JSON in `UserDefaults(suiteName:)` und ruft `WidgetCenter.shared.reloadAllTimelines()`.
3. Web-Seite: `src/platform/native.ts` ruft das Plugin nach jeder Runde und beim Start (`habitInfo`); Web-Variante no-op (`src/platform/web.ts`).
4. Widget-Größen: klein (Flamme + Serie + Ring Runden), mittel (+ „Daily offen“ / Ergebnis). Tippen → `mentalmath://` bzw. Universal Link auf `#/` oder `#/train/daily`.
5. Live-Updates: Native-Fingerprint (`npm run native:stamp`) ändert sich → erster Release mit Widget nur über App Store.
6. Test: Simulator + TestFlight; Screenshots fürs Store-Listing.

### Android
1. `npm i @capacitor/android@8`, `npx cap add android`, Paket-ID `de.eliassteffen.mentalmath`.
2. Plattform-Schicht: `src/platform/native.ts` ist iOS-geprägt – Passkeys über Android Credential Manager (eigenes Plugin statt `NativeAuthPlugin.swift`), lokale Benachrichtigungen (Kanal, Exact-Alarm-Berechtigung), Haptik, Teilen, Live-Updates (Manifest-Kanal je Plattform).
3. Digital Asset Links (`/.well-known/assetlinks.json`, über `scripts/pages.ts`/Build) für Passkeys; `AUTH_ORIGINS`/App-Origin (`server/app-origin.ts`) um `https://localhost`/Android-Origin erweitern.
4. CI: Workflow `android.yml` (Ubuntu, JDK 21, Gradle, signiertes AAB, Upload in die Play Console – Interner Test), Release-Gate analog zu iOS.
5. Play-Store-Eintrag, Datenschutz-Formular (Data safety), Screenshots.

---

## 12. Integration (Hauptsession)

1. Phase-1-Branches in dieser Reihenfolge mergen: A, B, C, D, E, F, G. Erwartete Konflikte: `src/types.ts`/`schema.ts` (Felder am Ende), `settings.ts` (Schalter/Stepper), i18n-Indizes, `result.ts` (`statusLine`-Zeile: Runden aus B **ohne** `xp`, da A die Level-Karte zeigt), `modes.ts` (`modeName`), `home.ts` (B statusLine, C Modi-Einträge).
2. Nach jedem Merge: `npm run typecheck && npm test`; nach allen: `npm run build` + Playwright-Smoke (Neuinstallation, Einstufung, Runde mit Auto-Weiter, Ergebnis mit Bestzeit, Mini-Case, Kettenrechnen zählt als Runde, Fortschritt, Profil, Lernkarte, große Schrift, iPad), Kaltstart-Messung.
3. Phase 2 (H, I) auf dem integrierten Stand, dann mergen und dieselben Prüfungen.
4. Release Notes **2.1.0** in `src/releases.ts` (de/en), `package.json` 2.1.0, `npm run changelog`, Tests.
5. Push auf `claude/nice-brahmagupta-gmpncl`.
