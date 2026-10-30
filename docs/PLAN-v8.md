# Plan v8 – Version & Release Notes, Settings-Tabs, Skeletons, i18n, Polish

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) gelten (strict TS, `.ts`-Imports, `import type` aus `src/types.ts`, kein `any`, DOM nur über `h()`/`appendChildren`, kein innerHTML, keine Inline-Styles außer `style.setProperty` für CSS-Variablen, 320 px tauglich, Theme-Tokens). Keine Frameworks: die App ist Vanilla-TS; „React-Context/Hook“ wird durch `src/i18n/index.ts` (`t()`, `useTranslation()`, `setLang()`, `onLangChange()`) ersetzt – **bereits vorhanden, nicht ändern**. Typen in `src/types.ts` (`Settings.lang`, `Settings.lastSeenVersion`, `Release`, `ReleaseNote`, `BuildInfo`) und Defaults sind gesetzt. `package.json` `version` = `1.8.0`.

## Phase 1 (parallel)

### R – Version & Release Notes
- `scripts/build-info.ts`: liest `package.json` `version`, Git-Kurz-Hash (`git rev-parse --short HEAD`, Fallback `dev`), Datum (YYYY-MM-DD) → schreibt `src/generated/build-info.ts` (`export const BUILD_INFO: BuildInfo = {…}`); `src/generated/` in `.gitignore`. `package.json`: `typecheck` und `build` führen `node scripts/build-info.ts` zuerst aus; `test` ebenso (Tests importieren ggf. BUILD_INFO).
- `src/releases.ts`: `export const RELEASES: Release[]` (neueste zuerst, zweisprachig de/en): 1.8.0 (diese Version), 1.7.0 (dist-Build, Floating Buttons, Auto-Fail, Speicher v3), 1.6.0 (Paralleles Kettenrechnen, Rest-JS→TS), 1.5.0 (TypeScript, Rechentricks, Daily, Kettenrechnen, Schätzmodus, eigenes Training, Ghost, Lernkurve), 1.4.0 (Einheiten, Größenordnungen, Kategorienauswahl, Prozent-Dezimal), 1.3.0 (Redesign, PWA, Serie/Tagesziel, Wiederholungen, Stufen, Tastenfeld), 1.2.0 (Lernbereich, Lösungswege, KI-Erklärungen), 1.1.0 (Einheiten-Eingabe, Bewertungs-Fixes), 1.0.0 (erste Version). Daten: 2026-10-30 für alle ≥ 1.1.0, 1.0.0 ebenfalls 2026-10-30. `compareVersions(a, b): number`, `releasesSince(version: string): Release[]` ('' → nur neueste).
- `scripts/changelog.ts` erzeugt `CHANGELOG.md` (Deutsch, Keep-a-Changelog-Stil) aus `RELEASES`; Script `changelog`. Test `tests/releases.test.ts`: SemVer-Format, absteigend sortiert, erste Version == package.json-Version, `CHANGELOG.md` aktuell (Inhalt == Generator-Ausgabe).
- `src/features/whats-new.ts`: `maybeShowWhatsNew(): void` – wenn `settings.lastSeenVersion !== BUILD_INFO.version`: neuer Nutzer (`lastSeenVersion === ''` und keine Versuche) → still setzen; sonst Modal „Was ist neu in {version}?“ mit `releasesSince(lastSeen)` (max. 3), danach `lastSeenVersion` setzen. `openChangelog(): void` – Modal mit allen Releases (scrollbar). Nutzt `openModal` aus `ui/modal.ts` (Team P).
- Dateien: `scripts/build-info.ts`, `scripts/changelog.ts`, `src/releases.ts`, `src/features/whats-new.ts`, `CHANGELOG.md`, `tests/releases.test.ts`, `package.json` (Scripts), `.gitignore`.

### P – UI-Polish (Toasts, Modal, Skeletons, Titel, Shortcuts)
Verträge (andere Teams nutzen sie):
```ts
// src/ui/toast.ts
export function toast(text: string, opts?: { kind?: 'info' | 'success' | 'error'; durationMs?: number }): void;
// src/ui/modal.ts
export interface ModalAction { label: string; onClick?: () => void; primary?: boolean; danger?: boolean; closes?: boolean /* default true */ }
export function openModal(o: { title: string; body: Node | string; actions?: ModalAction[]; onClose?: () => void }): { close(): void };
export function confirmDialog(text: string, o?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>;
// src/ui/skeleton.ts
export type SkeletonKind = 'tiles' | 'list' | 'chart' | 'cards' | 'text';
export function skeleton(kind: SkeletonKind, count?: number): HTMLElement;
export function deferRender(placeholder: HTMLElement, render: () => Node): void; // zeigt Placeholder, rendert echten Inhalt im übernächsten Frame
// src/ui/title.ts
export function setTitle(part?: string | null): void; // „{part} | Mental Math“ bzw. „Mental Math“
```
- Toast: gestapelt unten (über Tab-Leiste/FAB), Ein-/Ausblend-Animation, `role="status"`, Farbe je kind; `ui/charts.ts` `toast` leitet auf das neue Modul um (bestehende Aufrufe bleiben gültig).
- Modal: Backdrop, `role="dialog"`, `aria-modal`, Fokus auf erstes Element, Fokusfalle, **Esc schließt**, Klick auf Backdrop schließt, Fokus zurück; `confirmDialog` ersetzt `confirm()`.
- Skeletons: pulsierende Platzhalter im Layout der echten Komponenten (Bento-Kacheln, Listen, Sparklines, Karten), `prefers-reduced-motion` → kein Puls. Einsatz: Analyse (alle schweren Abschnitte), Lernen (Karten), Startseite (Statistik-Kacheln), Wechsel in Parallel-/Kettenrechnen.
- Titel: Router setzt je Route („Training“, „Lernen“, „Analyse“, „Einstellungen“, Modusname); Training aktualisiert sekündlich „{verbleibend|verstrichen}s | Mental Math“, Ergebnis „Runde beendet! | Mental Math“; Parallel-Stream „{Rest}s | Mental Math“.
- Shortcuts: Ergebnisseiten Enter = „Nochmal“, Esc = „Übersicht“ (wenn kein Modal offen); Modals: Esc; bestehende Enter/Esc im Training bleiben.
- `app.ts` ruft nach `startRouter()` `maybeShowWhatsNew()` (Team R).
- CSS in neuer `public/css/ui.css` (in `index.html` nach `fab.css` einbinden).
- Dateien: `src/ui/{toast,modal,skeleton,title}.ts`, `src/ui/charts.ts`, `src/router.ts`, `src/app.ts`, `src/views/{home,analyse,lernen,chain}.ts`, `src/views/train/**`, `src/views/parallel/**`, `public/css/ui.css`, `public/index.html`, `tests/ui-*.test.ts` (nur DOM-freie Teile, z. B. Titel-Formatierung).

### S – Settings-Seite mit Tabs + Datenimport
- Tabs (Segmented-Tabbar, sticky unter dem Titel, Icons aus `ui/charts.icon`): **Allgemein** (Sprache: Automatisch/Deutsch/English → `settings.lang`, sofort `setLang(detectLang(...))`; Theme; Sound; Haptik) · **Gameplay** (Tagesziel, Schwierigkeit, Rundenlänge, Timer, Auto-Fail, Auto-Submit, Schätzmodus, Ghost, Bildschirm-Tastatur, Numpad-Layout, Kategorien) · **Daten & Account** (Speicherbelegung: Anzahl Versuche/Runden + KB, Export JSON, **Import JSON** mit Datei-Auswahl + `confirmDialog` + Toast mit Ergebnis, Alles zurücksetzen mit `confirmDialog(danger)`, Karte „Konto & Cloud-Sync – bald verfügbar“ mit Geräte-ID/Profil-ID und deaktiviertem Button) · **Über** (Version `BUILD_INFO.version`, Build-Hash, Build-Datum, GitHub-Link, Button „Was ist neu?“ → `openChangelog()`).
- Aktiver Tab per `#/settings?tab=general|gameplay|data|about` (Default general), Wechsel ohne Neuladen; Toast „Einstellungen gespeichert“ (gedrosselt, max. 1 je 1,5 s).
- `src/data/transfer.ts`: `importJSON(text: string): { ok: true; attempts: number; sessions: number } | { ok: false; error: string }` – akzeptiert v3-Export und alten v1/v2-State, validiert, nutzt `normalize` + `save` aus `storage.ts`.
- Dateien: `src/views/settings.ts` (darf in `src/views/settings/*.ts` aufgeteilt werden), `src/data/transfer.ts`, `tests/transfer.test.ts`, Settings-CSS in `public/css/style.css` (nur Settings-Abschnitt).

## Phase 2 – i18n (nach Phase 1, parallel)
Alle sichtbaren Texte über `t('ns.key')`; Deutsch = Referenz, Englisch vollständig. Namespace-Dateien unter `src/i18n/locales/{de,en}/<ns>.ts` (leer angelegt; `en` ist typisiert auf dieselben Schlüssel). Sprachwechsel: Router rendert bei `onLangChange` neu; `numbers.fmt` nutzt `locale()`.
| Team | Namespaces & Dateien |
|---|---|
| I1 | `common`, `home`, `train`, `parallel`, `chain`, `custom` – Views home, train/**, parallel/**, chain, custom, ui/fab, ui/keypad |
| I2 | `analyse`, `lernen`, `settings`, `release` – Views analyse, lernen, settings/**, features/whats-new, releases-Anzeige, ui/modal, ui/toast, ui/skeleton, ui/title, router-Titel, features/ai-view, features/activity |
| I3 | `core` – Kategorie-/Subtyp-Namen & Beschreibungen, Aufgaben-Prompts, Hinweise, Einheiten-Wörter, Modusnamen, Schwierigkeitsnamen, Empfehlungs-Texte, Daily-Share-Text, Kettenlabels; `numbers.fmt` locale-abhängig; Methoden-Texte und Lösungswege in einer **Folgestufe** (bleiben vorerst Deutsch) |
Tests: Schlüsselparität de/en, keine leeren Werte, `t()`-Fallback, bestehende Tests laufen mit `de`.
