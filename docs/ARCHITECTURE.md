# Architektur-Analyse (Stand v4, vor TypeScript-Migration)

## Überblick

```
Browser (statisch, Cloudflare Pages)                 Cloudflare Pages Function
┌──────────────────────────────────────────────┐     ┌──────────────────────────┐
│ index.html → js/app.js                        │     │ functions/api/explain.js │
│   ├─ theme · activity · pwa · storage         │     │   └─ server/explain.js   │
│   └─ router → views/{home,train,lernen,       │     │        ├─ generators.js  │ (geteilt)
│                analyse,settings}              │ ──▶ │        └─ methods.js     │ (geteilt)
│        └─ ui · charts · keypad · fx · ai      │POST │   → Google Gemini API    │
│ Domäne: numbers · generators · solutions ·    │     └──────────────────────────┘
│         methods · scoring · review · progress │
│ Persistenz: storage (localStorage)            │
│ sw.js (Offline-Cache)                         │
└──────────────────────────────────────────────┘
```

~6.100 Zeilen: Domäne ≈ 2.950 (generators 833, solutions 693, methods 549, scoring 159, progress 122, review 36, numbers 77), UI ≈ 1.300, CSS 647, Server 218, Tests ≈ 900.

### Abhängigkeiten (gerichtet, zyklenfrei)
- `numbers` ← `generators` ← `scoring` ← `progress`; `solutions` ← generators+numbers; `review` und `methods` unabhängig.
- `ui` importiert **Domäne** (generators, solutions, ai) → vermischt DOM-Helfer mit Fachlogik.
- `views/*` importieren 7–11 Module direkt (train.js: 11).
- `server/explain` importiert Client-Module (`generators`, `methods`) → funktioniert, weil diese DOM-frei sind.

## Stärken
- Klare **Domänen-Schicht ohne DOM** → komplett unit-testbar (253 Tests), vom Server wiederverwendbar.
- Konsequente Sicherheitsregeln: kein `innerHTML`, strikte CSP, Key nur serverseitig, strukturierte KI-Eingaben.
- Kein Build-Schritt, keine Laufzeit-Dependencies, schneller Start, PWA.

## Schwächen & Risiken
| # | Befund | Auswirkung |
|---|---|---|
| 1 | **Keine Typen**: Task (number vs. choice), Attempt (Felder aus v1–v4 optional), Settings wachsen organisch | Mehrere Bugs dieser Session waren Form-Fehler (`given` außerhalb des Scopes, `append(null)`, Index statt Text bei choice) |
| 2 | **`storage.load()` parst bei jedem Getter das komplette JSON** (bis 5.000 Versuche ≈ 1 MB); Views rufen `getAttempts()` mehrfach pro Render | Spürbare Ruckler auf älteren Handys bei vollem Speicher |
| 3 | **`views/train.js` (386 Z.)**: eine Closure mit Timer, Eingabe, Tastenfeld, Choice, Feedback, Ergebnis, Tastatur-Events | Schwer zu ändern; Ursache mehrerer Regressionen |
| 4 | **`generators.js` (833 Z.)**: Daten (Kategorien/Subtypen) + 37 Generatoren + Einheiten-Algebra in einer Datei | Unübersichtlich; parallele Arbeit führt zu Konflikten |
| 5 | **`ui.js` mischt** DOM-Helfer, Router-Hooks (globaler Mutable State: rerender/cleanup), Fachlogik (Lösungswege, KI-Box) | Unklare Verantwortung |
| 6 | **Modus-Logik verteilt** (router, ui.modeName/isValidMode, train) | Doppelte Wahrheit |
| 7 | **Service-Worker-Precache-Liste manuell** gepflegt, Version manuell hochgezählt | Vergessene Dateien → Offline-Fehler; vergessene Version → alte UI |
| 8 | **Keine Schema-Version/Migration** für localStorage (nur Default-Merge) | Spätere Strukturänderungen riskant |
| 9 | **CSS 647 Z. in einer Datei**, Altlasten (`.container`, `.site-header`, `.nav`, `.stats`-Varianten) | Ungewollte Kopplungen (z. B. `.list li` traf verschachtelte Listen) |
| 10 | **Settings-UI bei 320 px**: Segment-Controls brechen um, Theme-Kacheln umbrechen, Breiten uneinheitlich, Erklärtexte neben Schaltern gequetscht | Unsauber auf kleinen Handys |
| 11 | Choice-Buttons zeigen Tasten-Nummern 1–4 | Verwirrt bei Einheiten-Fragen |

## Zielarchitektur (v5, TypeScript)

```
src/
├─ types.ts                 Zentrale Typen (Task, Attempt, Settings, …)
├─ core/                    DOM-frei, von Client + Server + Tests genutzt
│  ├─ numbers.ts  rng.ts  units.ts
│  ├─ catalog.ts            CATEGORIES, SUBTYPES, LEVEL_*
│  ├─ generators/  index.ts + je Kategorie eine Datei (mult.ts, div.ts, …, units.ts, mag.ts, tricks.ts)
│  ├─ solutions/   index.ts + je Kategorie
│  ├─ methods.ts  scoring.ts  review.ts  progress.ts  modes.ts (Modus-Parsing/-Namen)  daily.ts  chain.ts
├─ data/storage.ts          Schema v2 + Migration + In-Memory-Cache (write-through)
├─ ui/                      dom.ts (h, appendChildren), charts.ts, icons.ts, keypad.ts, fx.ts, theme.ts, toast.ts
├─ features/                ai-client.ts, activity.ts, pwa.ts
├─ views/                   home.ts, lernen.ts, analyse.ts, settings.ts, daily.ts, chain.ts
│  └─ train/                index.ts (Ablauf), timer.ts, answer.ts (Zahl/choice), feedback.ts, result.ts, ghost.ts
├─ router.ts  app.ts
├─ sw.ts                    eigener tsconfig (lib webworker), Precache-Liste wird beim Build generiert
server/explain.ts · functions/api/explain.ts   (importieren src/core/*)
tests/*.test.ts            laufen direkt mit Node (Type-Stripping)
```
- **Build:** `tsc` (keine Bundler-Dependency) → `public/js/**` (ES-Module, gleiche Struktur). `public/js` wird Build-Output (gitignored); CI baut vor dem Deploy. Wrangler bündelt `functions/*.ts` selbst.
- **Compiler:** `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (keine enums/namespaces → Node kann Tests direkt ausführen), `rewriteRelativeImportExtensions` (Quellen importieren `.ts`, Output `.js`), `verbatimModuleSyntax`.
