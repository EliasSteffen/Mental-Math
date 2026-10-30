# Plan – Paralleles Kettenrechnen (Multi-Chain Working Memory) & JS→TS-Rest

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) gelten (strict TS, `.ts`-Imports, `import type` aus `src/types.ts`, kein `any`, DOM nur über `h()`/`appendChildren`, keine Inline-Styles außer `style.setProperty` für CSS-Variablen, deutsche UI-Texte). Typen stehen bereits in `src/types.ts` (Abschnitt „Paralleles Kettenrechnen“) – nicht ändern.

## Ablauf
1. **Setup** – Level (1–3), Tempo (3 / 4 / 5 s), Dauer (45 / 60 / 90 s), Start-Ketten (adaptiv vorgeschlagen aus `ParallelStats.nextStart`, überschreibbar 2/3/4), Bestwerte.
2. **Stream** – 2×2-Grid mit Karten „Kette A…D“. Jede Karte zeigt beim Start groß ihren Startwert, danach nur noch die Operationen (die **letzten 3 Schritt-Labels** dezent, **nie die Zwischensumme**). Ein Loop (`requestAnimationFrame`) ruft `tick()`; bei einem Event blinkt die betroffene Karte auf (`.is-pulse`) und zeigt die Operation groß (~900 ms). Dynamic Scaling: nach je `addChainEvery` Events kommt eine Kette dazu (max. `maxChains`), neue Karte mit „Neu“-Badge und Startwert. Ende: `durationMs` abgelaufen **oder** jede Kette hat `stepsPerChain` Schritte → Phase `input`. Restzeit als Balken + Sekunden. Tab im Hintergrund → Pause.
3. **Eingabe** – Kette für Kette („Kette A = ?“), aktive Karte hervorgehoben, Zahleneingabe bzw. Tastenfeld (`useKeypad`/`createKeypad`), **Enter → nächste Kette**, Fortschritt „A ✓ · B ? · C ·“.
4. **Ergebnis** – je Kette: erwartet vs. eingegeben, ✓/✗, kompletter Verlauf mit Zwischensummen (`12 → + 7 = 19 → × 2 = 38`), Punkte, Hinweis auf nächste Startzahl („Nächste Runde: 3 Ketten“), Buttons „Nochmal“ / „Übersicht“. Stats speichern.

## Logik-API `src/core/parallel.ts` (Agent P-Core)
```ts
export const CHAIN_IDS: readonly ['A', 'B', 'C', 'D'];
export const DEFAULT_PARALLEL_CONFIG: ParallelConfig; // { level: 1, intervalMs: 4000, durationMs: 45000, startChains: 2, maxChains: 4, stepsPerChain: 10, addChainEvery: 5 }
export function createParallelState(config: ParallelConfig, rng?: () => number): ParallelState;
//   phase 'stream', config.startChains Ketten mit Start 2..20 (history ['Start 12']), nextEventAt = intervalMs, remainingMs = durationMs
export function nextOp(total: number, level: Level, rng?: () => number): { op: ChainOp; value: number };
//   ganzzahlig, Ergebnis immer in [1, 999]: L1 + / − (1..9); L2 zusätzlich × 2..3; L3 zusätzlich × 2..5 und ÷ 2..9 nur wenn exakt teilbar;
//   − nur wenn total − v ≥ 1; × nur wenn total·v ≤ 500; bei total > 150 bevorzugt − oder ÷
export function applyOp(total: number, op: ChainOp, value: number): number;
export function opLabel(op: ChainOp, value: number): string;            // '+ 7', '− 3', '× 2', '÷ 4'
export interface TickResult { state: ParallelState; event: ParallelEvent | null; addedChain: ParallelChain | null; ended: boolean }
export function tick(state: ParallelState, elapsedMs: number, rng?: () => number): TickResult;
//   rein (neues State-Objekt); höchstens 1 Event pro Aufruf, wenn elapsedMs ≥ nextEventAt; Ziel = zufällige Kette mit < stepsPerChain Schritten;
//   danach ggf. Kette hinzufügen (eventCount % addChainEvery === 0 && chains < maxChains); Ende → phase 'input', answers = null je Kette
export function submitAnswer(state: ParallelState, value: number | null): ParallelState; // answers[inputIndex] setzen, inputIndex++, nach letzter → 'result'
export function replayTotals(history: string[]): number[];                // Zwischensummen aus den Labels (inkl. Start)
export function scoreParallel(state: ParallelState): ParallelResult;
//   Punkte = Σ richtige Ketten × 100 × Faktor (2 Ketten 1 · 3 Ketten 1,5 · 4 Ketten 2) + 5 × Gesamtschritte richtiger Ketten
export function updateParallelStats(stats: ParallelStats, result: ParallelResult): ParallelStats;
//   nextStart: allCorrect → +1 (max 4); correct < total/2 → −1 (min 2); sonst gleich. bestChains = max(bestChains, total bei allCorrect);
//   bestCorrectStreak (Runden in Folge allCorrect, Maximum), rounds++
```
**Storage** (`src/data/storage.ts`): State-Feld `parallel` (Default `{ nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 }`, Migration ergänzt es), Exporte `getParallelStats()`, `setParallelStats(stats)`. Für die Serie über Runden: `ParallelStats` reicht nicht für den *aktuellen* Lauf → `updateParallelStats` erhält zusätzlich intern einen Zähler `currentStreak` **nur in sessionStorage** über die View (siehe unten) – oder einfacher: `bestCorrectStreak` = längste Serie innerhalb der aktuellen Sitzung, View übergibt `currentStreak`. Signatur daher: `updateParallelStats(stats, result, currentStreak: number): ParallelStats`.

**Tests** `tests/parallel.test.ts`: Determinismus mit seeded RNG (`mulberry32` aus `core/daily.ts`), Ganzzahligkeit & Bereich [1, 999] über 10.000 Ops je Level, `tick` feuert im richtigen Takt, Scaling bis max, Ende-Bedingungen (Zeit / Schritte), `submitAnswer`-Navigation, `replayTotals` == `currentTotal`, Scoring & Stats-Regeln, Storage-Migration.

**JS→TS-Rest** (ebenfalls P-Core): `scripts/precache.mjs` → `scripts/precache.ts` (Node führt `.ts` direkt aus; gleiche Logik, strikt typisiert), `package.json` `build`-Script auf `node scripts/precache.ts`, `tsconfig.check.json` um `scripts/**/*.ts` erweitern, alte `.mjs` löschen. Danach darf außerhalb von `node_modules/` und dem Build-Output (`public/js/`, `public/sw.js`) **keine** `.js`/`.mjs`/`.cjs`-Datei mehr existieren.

## Ansicht `src/views/parallel.ts` (Agent P-View)
- `export function renderParallel(): void` – Phasen per kleinem State-Objekt in der View, Logik ausschließlich über `core/parallel.ts`.
- Aufteilung erlaubt: `src/views/parallel/{index,setup,stream,input,result}.ts` (Export `renderParallel` aus `index.ts`).
- Loop mit `requestAnimationFrame`, Cleanup über `setCleanup` (Router), Pause bei `visibilitychange`.
- Haptik bei Event (`navigator.vibrate(10)` wenn `settings.haptics`).
- CSS ausschließlich in neuer `public/css/parallel.css` (Theme-Tokens, 2×2-Grid auch bei 320 px, `prefers-reduced-motion` → kein Puls).
- Router: Route `#/parallel`, `body.in-play` aktiv; `index.html` bindet `css/parallel.css` ein; Startseite: Schnellstart-Kachel „Paralleles Kettenrechnen – mehrere Ketten gleichzeitig im Kopf“.
