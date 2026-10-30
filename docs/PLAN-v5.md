# Plan v5 – TypeScript, UI-Fixes, neue Modi

Grundlage: [ARCHITECTURE.md](ARCHITECTURE.md) (Analyse + Zielstruktur), [SPEC.md](SPEC.md) (Features v1–v4, gelten weiter), Typvertrag [`src/types.ts`](../src/types.ts).

## Leitplanken (gelten für jeden Subagent)
1. **Verhalten bleibt gleich**, außer wo dieser Plan es ändert. UI-Texte Deutsch.
2. **Exportnamen & Signaturen der heutigen JS-Module bleiben** (nur typisiert, Pfade gemäß Modulkarte). So können Agents parallel gegen dieselbe API arbeiten.
3. **Typen ausschließlich aus `src/types.ts`** importieren (`import type`). Fehlt ein Typ → in eigener Datei lokal definieren und im Bericht melden, `types.ts` NICHT ändern.
4. `strict` ohne `any` (Ausnahme: dokumentiertes `unknown` + Narrowing an Systemgrenzen: JSON, localStorage, fetch).
5. Quellen importieren mit `.ts`-Endung (`import { fmt } from '../core/numbers.ts'`); `tsc` schreibt `.js`.
6. DOM-Regeln wie bisher: `h()`/`appendChildren`, kein `innerHTML`, keine Inline-Styles (nur `style.setProperty` für CSS-Variablen), nie `append(null)`.
7. Fertig heißt: `npm run typecheck` und `npm test` grün für die eigenen Dateien, `npm run build` erzeugt lauffähiges `public/js`.

## Tooling (Phase 0 – erledigt vom Hauptagent)
- `package.json`: devDependency `typescript`; Scripts `build` (`tsc -p tsconfig.json && tsc -p tsconfig.sw.json && node scripts/precache.mjs`), `typecheck`, `test` (`node --test tests/*.test.ts`), `dev` (build + python-Server), `dev:ai` (build + wrangler).
- `tsconfig.json` (src → public/js), `tsconfig.sw.json` (src/sw.ts → public/sw.js, lib webworker), `public/js/` + `public/sw.js` in `.gitignore`.
- CI (`deploy.yml`): `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → deploy.

## Modulkarte (alt → neu)
| alt (public/js/…) | neu (src/…) |
|---|---|
| numbers.js | core/numbers.ts |
| generators.js | core/catalog.ts (CATEGORIES, SUBTYPES, LEVEL_*, activeCategories), core/units.ts (parseU, uMul, uDiv, uInv, uMap, uStr, uRaw), core/generators/index.ts (generate, generateForMode) + core/generators/{mult,div,big,pct,frac,growth,biz,est,units,mag}.ts |
| solutions.js | core/solutions/index.ts (solutionSteps) + core/solutions/{…}.ts |
| methods.js | core/methods.ts |
| scoring.js · review.js · progress.js | core/scoring.ts · core/review.ts · core/progress.ts |
| storage.js | data/storage.ts (+ Schema-Version 2, Migration, In-Memory-Cache) |
| ui.js | ui/dom.ts (h, appendChildren, svg) · ui/widgets.ts (level, badge, tile, pct, stepsList, fold, methodBlock, safeSteps) · features/ai-view.ts (partNodes, aiBox, aiControl) · core/modes.ts (modeName, isValidMode, parseMode) · router.ts (go, rerender, setCleanup, runCleanup) |
| charts.js · keypad.js · fx.js · theme.js | ui/charts.ts · ui/keypad.ts · ui/fx.ts · ui/theme.ts |
| ai.js · activity.js · pwa.js | features/ai-client.ts · features/activity.ts · features/pwa.ts |
| views/*.js | views/{home,lernen,analyse,settings}.ts, views/train/{index,timer,answer,feedback,result}.ts |
| router.js · app.js | router.ts · app.ts |
| sw.js | sw.ts (+ scripts/precache.mjs generiert die Liste aus public/js) |
| server/explain.js · functions/api/explain.js | server/explain.ts · functions/api/explain.ts |
| tests/*.test.js | tests/*.test.ts |

## Phase 1 – Migration (3 Subagents parallel)
| Agent | Dateien | Aufgabe |
|---|---|---|
| **M1 Core** | `src/core/**`, `src/data/**`, `tests/**` | Logik 1:1 nach TS, Aufteilung gemäß Modulkarte, storage mit Schema v2/Cache/Migration, Tests nach `.ts` portieren (alle bestehenden Tests behalten) |
| **M2 UI** | `src/ui/**`, `src/features/**` (außer pwa), `src/views/**`, `src/router.ts`, `src/app.ts`, `public/index.html` (Script-Pfad bleibt `js/app.js`) | UI 1:1 nach TS, train.ts in train/{index,timer,answer,feedback,result} zerlegen, Modus-Logik über `core/modes.ts` (Signaturen siehe unten) |
| **M3 Plattform** | `src/sw.ts`, `src/features/pwa.ts`, `scripts/precache.mjs`, `server/**`, `functions/**`, `README.md` (Abschnitte Lokal/Struktur) | SW + Precache-Generator, Server/Function nach TS (Imports aus `src/core`), README aktualisieren |

Danach löscht der Hauptagent die alten `public/js/*.js`-Quellen (werden Build-Output) und prüft im Browser.

`core/modes.ts` (von M1 geschrieben, von M2 genutzt):
```ts
export function parseMode(raw: string): Mode | null;          // Kategorie-ID | Subtyp-ID | 'all' | 'weak' | 'review' | 'daily' | 'custom'
export function isValidMode(raw: string): boolean;
export function modeName(mode: Mode): string;                 // wie heute: Kategorie, „Kategorie · Subtyp“, „Alle Kategorien“, …
```

## Phase 2 – Features (3 Subagents parallel, nach Phase 1)

### F-Core (M1-Nachfolger): `src/core/**`, `src/data/**`, `tests/**`
1. **Tricks-Kategorie** `tricks` („Rechentricks“, „×11, Quadrate, Prozent-Tausch …“), Subtypen (choice-frei, Level 1–3, Methoden + Lösungswege):
   - `tricks.x11` ×11 (2- und 3-stellig: 47 × 11 = 4 | 4+7 | 7 = 517)
   - `tricks.diffsq` (a+b)(a−b): 47 × 53 = 50² − 3² = 2.491
   - `tricks.near100` beide nahe 100: 97 × 96 = (100−3−4)·100 + 3·4 = 9.312
   - `tricks.square5` Quadrate auf 5: 65² = 6·7 | 25 = 4.225
   - `tricks.pctswap` Prozent-Tausch: 8 % von 50 = 50 % von 8 = 4 (nur Paare, bei denen der Tausch leichter ist)
   - `tricks.subround` Subtraktion über Runden: 83 − 38 = 83 − 40 + 2 = 45
2. **Daily Challenge** `core/daily.ts`: `dailyTasks(dateKey): Task[]` – deterministisch (seeded RNG, z. B. mulberry32 über Hash des Datums), 15 Aufgaben, Level 2, aus allen nicht-versteckten Kategorien (feste Reihenfolge), gleiche Aufgaben für alle Nutzer. `dailyShareText(result, dateKey, url)`.
3. **Kettenrechnen** `core/chain.ts`: `chainTask(level, rng)` → `{ start: number, steps: Array<{ op: '+'|'−'|'×'|'÷', value: number }>, result: number }` (ganzzahlige Zwischenergebnisse, L1 5 Schritte +/− einstellig, L2 7 Schritte inkl. ×, L3 9 Schritte inkl. ÷).
4. **Schätzmodus**: `evaluate(…, { estimate: true })` → numerische Tasks (nicht choice, nicht `mag.*`, nicht `frac.topct`) richtig bei ±5 %; Punkte × 0,7.
5. **Eigenes Training** (Custom Range): versteckte Kategorie `custom` (nicht in Raster/„Alle“/Empfehlung), Subtypen `custom.mul` (a aus [aMin..aMax] × b aus [bMin..bMax]) und `custom.square` (n² für n aus [min..max]); `generate(id, rng, { level, custom: CustomRange })`.
6. **Ghost/Rekorde** `progress.personalBest(sessions, mode)` → beste Session (Ø ms pro Aufgabe bei ≥ 80 % richtig) und `ghostProgress(best, elapsedMs, sessionLength)` → 0..1.
7. **Lernkurve** `progress.apmSeries(attempts, activity, { days: 30, now })` → `[{ date, perMinute|null, accuracy|null }]` (Aufgaben pro aktive Minute).
8. **Storage** (Schema v2): `dailyResults: Record<dateKey, DailyResult>`, `chainBest: Record<level, number>`; Settings-Erweiterungen (siehe `types.ts`).

### F-Train: `src/views/train/**`, `src/ui/keypad.ts`, `public/css/train.css`
1. **Keine Ziffern auf Auswahl-Buttons** (`.choice-key` entfernen; Tasten 1–4 funktionieren weiter).
2. **Smart Retry**: Ergebnisseite → Button „Fehler & langsame wiederholen“ (falsch, übersprungen oder Zeit > 1,5 × Ziel) startet eine Runde mit **genau diesen Aufgaben** (gleiche Zahlen), Route `#/train/retry` (Aufgaben aus `sessionStorage`).
3. **Ghost**: dritter Marker auf dem Fortschrittsbalken (`.ghost-marker`) für den persönlichen Rekord im Modus, Beschriftung „Rekord“; nur wenn `settings.ghost` und ein Rekord existiert.
4. **Auto-Submit** (`settings.autoSubmit`): sobald die Eingabe korrekt ist → automatisch prüfen (nur numerisch, nie bei falschen Zwischenständen).
5. **Schätzmodus**: Query `?est=1` oder `settings.estimateMode` → Hinweis „Schätzen: ±5 % reicht“, `evaluate(…, { estimate: true })`.
6. **Numpad-Layout** (`settings.numpadLayout`): `'calculator'` (7-8-9 oben, wie heute) | `'phone'` (1-2-3 oben).
7. **Daily-Modus** (`#/train/daily`): Aufgaben aus `dailyTasks(heute)`, kein Level-Override, Ergebnis speichert `dailyResults[heute]`, Teilen-Button (Web Share API, Fallback Clipboard).
8. **Custom-Modus** (`#/train/custom?k=mul&a=13-19&b=2-9` bzw. `k=square&r=11-30`).
9. `public/css/train.css` für alle neuen Train-Styles (wird von F-Views in index.html eingebunden).

### F-Views: `src/views/{home,settings,analyse,lernen,chain,custom}.ts`, `src/router.ts`, `public/css/style.css`, `public/index.html`
1. **Settings bei schmalen Bildschirmen** (Befund in ARCHITECTURE #10): Segment-Controls immer volle Breite, gleich breite Segmente, bei < 360 px kleinere Schrift statt Umbruch, ab 5 Segmenten horizontal scrollbar ohne Umbruch; Theme-Kacheln 4 Spalten (`repeat(4, 1fr)`), unter 340 px 2×2; `.setting-row` mit Beschreibung → bei < 380 px Label + Beschreibung oben, Steuerung darunter rechtsbündig; einheitliche Abstände. Prüfen bei 320, 360, 390 px.
2. **Neue Einstellungen**: Auto-Submit, Numpad-Layout, Schätzmodus, Ghost (Abschnitt „Training“).
3. **Startseite**: Kachel „Daily Challenge“ (Status heute: offen / erledigt mit Ergebnis), Schnellstarts „Kettenrechnen“, „Schätzen ±5 %“ (`#/train/all?est=1`), „Eigenes Training“ (`#/custom`), Kategorie „Rechentricks“ erscheint automatisch im Raster.
4. **`#/chain`** Kettenrechnen: Einstellungen (Level 1–3, Tempo 0,8/1,2/1,8 s pro Schritt) → Start → Zahlen/Operationen nacheinander groß einblenden → Eingabe (Tastenfeld) → Auflösung mit allen Schritten; Bestwert pro Level.
5. **`#/custom`** Formular: Art (Einmaleins / Quadrate), Bereiche (zwei Zahlenfelder je Bereich), Rundenlänge → startet `#/train/custom?…`.
6. **Analyse**: Abschnitt „Lernkurve“ mit `sparkline` für Aufgaben/Minute (30 Tage) + Genauigkeit; Abschnitt „Daily“ (letzte 7 Tage).
7. **Router**: Routen `#/chain`, `#/custom`, `#/train/daily`, `#/train/retry`, `#/train/custom?…`; `index.html` bindet `css/train.css` ein.

## Phase 3 – Abnahme (Hauptagent)
`npm run typecheck && npm test && npm run build`, Browser-Prüfung bei 320/390 px (alle Seiten, Settings, Training numerisch/choice/Daily/Retry/Custom/Ketten), Service Worker, KI-Endpoint über `npm run dev:ai`.
