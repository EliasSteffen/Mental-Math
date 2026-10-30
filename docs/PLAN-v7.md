# Plan v7 – Build-Cleanup, Floating Buttons, Auto-Fail, Storage-Architektur

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) gelten unverändert (strict TS, `.ts`-Imports, `import type` aus `src/types.ts`, kein `any`, DOM nur über `h()`/`appendChildren`, keine Inline-Styles außer `style.setProperty` für CSS-Variablen, deutsche UI-Texte, 320 px tauglich). Typen sind bereits in `src/types.ts` ergänzt (`Settings.autoFail`, Abschnitt „Persistenz v3“) – nicht ändern.

## 0. Build-Cleanup – kein `js/`-Ordner mehr im Quellbaum (Agent **C-Build**)
**Befund:** `public/js/` ist Build-Ausgabe, liegt aber im Quellordner `public/` und ist auf GitHub noch versioniert (23 Dateien).
**Lösung:** Quellen und Ausgabe strikt trennen.
- `public/` enthält nur noch **statische Quellen** (index.html, css/, icons/, manifest, favicon, _headers).
- Neuer Build-Ordner **`dist/`** (gitignored): `tsc` → `dist/js/`, SW → `dist/sw.js`, `scripts/copy-static.ts` kopiert `public/**` nach `dist/`, `scripts/precache.ts` arbeitet auf `dist/` (statt `public/`).
- `package.json`: `build` = `node scripts/clean.ts && tsc -p tsconfig.json && tsc -p tsconfig.sw.json && node scripts/copy-static.ts && node scripts/precache.ts`; `dev` / `dev:ai` servieren `dist`; `clean` löscht `dist/`.
- `tsconfig.json` `outDir: "dist/js"`, `tsconfig.sw.json` `outDir: "dist"`; `.gitignore`: `dist/` statt `public/js/`, `public/sw.js`, `public/precache.json`.
- CI `deploy.yml`: `pages deploy dist …`. `functions/` bleibt im Repo-Root (Wrangler findet es weiter).
- `.claude/launch.json` (im übergeordneten Projektordner, Konfiguration `mental-math-ai`) auf `pages dev dist` umstellen.
- `public/js/`, `public/sw.js`, `public/precache.json` löschen. Danach darf es **außerhalb von `node_modules/` und `dist/` keine `.js/.mjs/.cjs`-Datei** geben.
- README „Lokal starten“/„Struktur“ anpassen. (Den Git-Index räumt der Hauptagent per `git rm --cached` auf.)

## 1. Floating Action Buttons auf Ergebnisseiten (Agent **C-UI**)
Neues Modul `src/ui/fab.ts`:
```ts
export interface FabAction { label: string; onClick: () => void; primary?: boolean }
export interface FabBar { el: HTMLElement; destroy(): void }
export function createFabBar(actions: FabAction[]): FabBar;
```
- Fixiert unten, zentriert, max. 440 px, Abstand `12px + env(safe-area-inset-bottom)`, Glas-Hintergrund wie Tastenfeld; zwei Buttons nebeneinander („Nochmal“ primär, „Übersicht“ sekundär).
- **Scroll-Logik** (passive Listener auf `window`):
  - Scroll nach **unten** → ausblenden (`.is-hidden`: `opacity: 0; transform: translateY(48px); pointer-events: none`, `aria-hidden="true"`, Buttons `tabIndex = -1`).
  - Scroll nach **oben** → einblenden.
  - **Idle**: 150 ms nach dem letzten Scroll-Event → einblenden.
  - **Unten angekommen** (`scrollY + innerHeight >= scrollHeight - 20`) → immer sichtbar.
  - Transition 200 ms, `prefers-reduced-motion` → nur Opacity, keine Bewegung.
- Seite bekommt unten Platz (`body.has-fab main.container { padding-bottom: … }`), damit die FABs nichts dauerhaft verdecken.
- `destroy()` entfernt Listener, Timer, Element und `body.has-fab`.
- **Router**: `setCleanup` unterstützt mehrere Aufräum-Funktionen → neue Funktion `addCleanup(fn)` (alle werden bei `runCleanup()` ausgeführt); `setCleanup` bleibt kompatibel.
- **Einsatz**: Ergebnisseite Training (`views/train/result.ts`), Parallel-Ergebnis (`views/parallel/result.ts`), Kettenrechnen-Auflösung (`views/chain.ts`). Die bisherigen Inline-Buttons „Nochmal“/„Übersicht“ entfallen dort; andere Buttons (Analyse, Fehler wiederholen, Teilen) bleiben inline.

## 2. Auto-Fail (Agent **C-UI**)
- Einstellungen → Training: Schalter **„Auto-Fail“**, Beschreibung „Läuft die Zielzeit ab, wird deine aktuelle Eingabe automatisch abgegeben“, Standard aus. Nur aktivierbar, wenn der Timer an ist (sonst deaktiviert mit Hinweis).
- Training (`views/train/*`): Ist `settings.autoFail && settings.timer` und Aufgabe noch offen, wird bei `elapsed >= task.targetMs` genau einmal abgegeben:
  - Zahlenaufgabe: `parseAnswer(input.value)` → Zahl wird ganz normal bewertet; leer oder unlesbar → `null` (gilt als „Übersprungen“).
  - Auswahl-Aufgabe: keine Auswahl → `null`.
  - Feedback zeigt zusätzlich „Zeit abgelaufen“.
- Gilt **nicht** für Kettenrechnen, Paralleles Kettenrechnen und Lernen-Beispiele.
- Aus (Standard): Verhalten wie bisher – Zeit wird gemessen, keine Abgabe.

## 3. Storage-Architektur v3 (Agent **C-Data**)
Ziel: lokal, ohne Account, aber jedes Datum trägt Sync-Metadaten und jede Änderung landet in einem Änderungsprotokoll, das ein späterer `RemoteSyncProvider` abarbeiten kann.

Module unter `src/data/`:
| Datei | Inhalt |
|---|---|
| `adapters.ts` | `LocalStorageAdapter` (Prefix `mm:v3:`), `MemoryAdapter` (Tests/Fallback), `createDefaultAdapter()` (localStorage, bei Fehler Memory) |
| `ids.ts` | `newId()` (`crypto.randomUUID`, Fallback), `getDeviceId()` (persistiert) |
| `meta.ts` | `createMeta(now)`, `touch(meta, now)` (updatedAt, rev+1, deviceId), `tombstone(meta, now)` |
| `repository.ts` | `Repository` über einen `StorageAdapter`: `getDoc<T>(name)`, `putDoc<T>(name, value)`, `list<T>(collection)`, `upsert<T>(collection, item)`, `remove(collection, id)` (Soft-Delete), In-Memory-Cache, Änderungsprotokoll (`SyncState`) |
| `sync.ts` | `SyncEngine` mit `RemoteSyncProvider`; `NoopSyncProvider` (tut nichts, `pending` wächst nicht unbegrenzt: max. 2.000, zusammengefasst je target+id); `syncNow()` als vorbereitete API (heute no-op, gibt Status zurück) |
| `migrate.ts` | Migration `kopfrechner.v1` (State v1/v2) → v3: Profil anlegen, Settings → `AppSettings`, jedem Attempt/Session `SyncMeta` geben (`id` neu bzw. Session-ID übernehmen, `createdAt = ts`), Dokumente übernehmen; alten Schlüssel als `kopfrechner.v1.bak` behalten; idempotent |
| `storage.ts` | **Öffentliche API bleibt identisch** (`getAttempts`, `addAttempt`, `getSettings`, `setSettings`, `getSessions`, `addSession`, `getReviews`, `setReviews`, `getActivity`, `addActivityMs`, `getDailyResults`, `setDailyResult`, `getChainBest`, `setChainBest`, `getParallelStats`, `setParallelStats`, `resetAll`, `exportJSON`, `DEFAULT_SETTINGS`, …) – intern über Repository. Neu: `getProfile()`, `updateProfile(patch)`, `getSyncState()`. `getAttempts()` liefert `GameResult[]` (ohne Tombstones), `getSessions()` `SessionStats[]`. Limits wie bisher (5.000 Ergebnisse, 500 Sessions) – beim Kürzen Tombstones bevorzugt entfernen. `resetAll()` löscht alles inkl. Backup **nicht** das Profil/deviceId. `exportJSON()` exportiert v3 inkl. Profil. Default `autoFail: false`. |

**Tests** (`tests/storage-v3.test.ts` + bestehende anpassen): Adapter, IDs/Meta, Repository (CRUD, Soft-Delete, Cache, Änderungsprotokoll + Zusammenfassen), Migration v1→v3 und v2→v3 (Daten vollständig, idempotent, Backup vorhanden), öffentliche API unverändert nutzbar, `storage`-Event invalidiert Cache.

## Dateibesitz (keine Überschneidungen)
- **C-Build:** `package.json`, `tsconfig*.json`, `scripts/**`, `.gitignore`, `.github/workflows/deploy.yml`, `README.md`, `../.claude/launch.json`, Löschen von `public/js`, `public/sw.js`, `public/precache.json`.
- **C-Data:** `src/data/**`, `tests/storage*.test.ts`, neue `tests/storage-v3.test.ts`.
- **C-UI:** `src/ui/fab.ts` (neu), `src/router.ts`, `src/views/train/**`, `src/views/parallel/result.ts`, `src/views/chain.ts`, `src/views/settings.ts`, neue `public/css/fab.css` (+ Link in `public/index.html`).
