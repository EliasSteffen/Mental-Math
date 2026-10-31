# Umsetzungsplan „Ruhiger Fokus“

Dieser Plan setzt das Claude-Design „Kopfrechner · Ruhiger Fokus“ in Code um. Er legt fest, welche Komponenten es braucht, welche Dateien sich ändern und in welcher Reihenfolge die Subagents bauen.

- **Design:** [Claude-Design-Artifact](https://claude.ai/artifact/UewStnvwmPVNK2jNvkbuqu) mit 18 Artboards. Das Artifact ist die Quelle der Wahrheit, eine Kopie liegt in [`docs/design/ruhiger-fokus/`](design/ruhiger-fokus/).
- **Konzept und Begründungen:** [`docs/DESIGN-MOBILE-FIRST.md`](DESIGN-MOBILE-FIRST.md), Audit A1–A17 und T1–T7.
- **Branch:** `feat/ruhiger-fokus` im Worktree `.claude/worktrees/ruhiger-fokus`, Basis `755ef41`.
- **Ausgangslage:** 619 Tests grün (417 + 82 + 120), `npm run build` sauber.

---

## 0. Kurzfassung

| Entscheidung | Inhalt |
|---|---|
| **Styling** | Kein Tailwind und kein Framework. Design-Tokens als CSS-Variablen, dazu Cascade Layers. Die alten Stylesheets laufen übergangsweise in `@layer legacy` und werden in Welle 3 gelöscht. |
| **Themes** | `system` · `paper` · `night` · `oled` · `aurora` · `neon`. Papier und Nacht sind die ruhigen Standard-Themes. Aurora und Neon sind ausdrucksstärker: Verläufe, Glow und ein einmaliger Glanz auf dem Primärbutton. Endlos-Animationen gibt es auch dort nicht. |
| **Shell** | Keine Topbar. Jeder Tab hat einen Large Title. Unten schwebt eine Glas-Tab-Leiste mit 4 Tabs (Heute · Lernen · Fortschritt · Profil). Darüber schwebt pro Tab genau ein Primärbutton (Floating CTA). |
| **Training** | Fokus-Modus ohne Tab-Leiste:<br>• Kopf: ✕ links, Fortschritt als Segmente, darunter die Zeitlinie.<br>• Unten ein Dock mit Tastenfeld oder Auswahl.<br>• Nach der Antwort ersetzt ein Feedback-Sheet das Dock. „Weiter“ steht dann dort, wo „Prüfen“ war. |
| **Zeitanzeige** | Neue Einstellung `timerDisplay` mit drei Stufen: `calm` (Linie ohne Zahlen, Standard), `precise` (Sekunden, Punkte, Level) und `off`. |
| **Feedback** | Informiert statt zu urteilen: kein Shake, kein Fehlerton, keine Alarmfarbe. Die Diagnose steht als Titel („Eine Null zu viel“), der Lösungsweg darunter. |
| **Umsetzung** | 4 Wellen:<br>• Welle 1: Fundament, 1 Agent.<br>• Welle 2: 6 Bereiche parallel, jeder mit eigenen Dateien.<br>• Welle 3: Integration und Aufräumen.<br>• Welle 4: Prüfung. |

---

## 1. Was das Design festlegt

### 1.1 Artboards → Screens

| Artboard | Screen | Route |
|---|---|---|
| Heute (`Main`), Heute · Nacht/Aurora/Neon | Startseite | `#/` |
| Training · Eingabe | Zahlenaufgabe mit Tastenfeld | `#/train/:mode` |
| Feedback · Korrektur, Feedback · Richtig | Feedback-Sheet | `#/train/:mode` |
| Training · Auswahlaufgabe | Auswahlaufgabe (2×2 im Dock) | `#/train/:mode` |
| Rundenergebnis | Ergebnis | `#/train/:mode` (Ende) |
| Fortschritt | Analyse mit 4 Ansichten | `#/fortschritt` (Alias `#/analyse`) |
| Lernen | Methodenliste mit Suche | `#/lernen`, `#/lernen/:id` |
| Profil | Einstellungen, Konto, Daten | `#/profil` (Alias `#/settings`) |
| Atempause | optional vor einer Runde | `#/train/:mode` (vor der 1. Aufgabe) |
| Grundlagen | Tokens und Komponenten | – |

### 1.2 Tokens (aus „Grundlagen“ und den Artboards)

**Farben je Theme.** Jedes Textpaar hat mindestens 4,5 : 1 Kontrast.

| Token | paper | night | oled | aurora | neon |
|---|---|---|---|---|---|
| `--bg` | `#F6F4EF` | `#141619` | `#000000` | `#0B0A14` | `#08090A` |
| `--surface` | `#FFFFFF` | `#1B1E22` | `#101214` | `rgba(255,255,255,.06)` | `#121314` |
| `--surface-2` | `#EEEBE4` | `#23272C` | `#181B1F` | `rgba(255,255,255,.08)` | `#1B1D1F` |
| `--border` | `#E2DDD3` | `#2D3237` | `#24282D` | `rgba(255,255,255,.12)` | `#2A2D30` |
| `--text` | `#1E2227` | `#E9E7E2` | `#E9E7E2` | `#F5F3FF` | `#F2F4F0` |
| `--muted` | `#5C636D` | `#9DA3AA` | `#9DA3AA` | `#A9A6C4` | `#9BA19A` |
| `--accent` | `#3A5A8A` | `#8EA8D4` | `#8EA8D4` | `#A78BFA` | `#D4FF3A` |
| `--accent-text` | `#2E4B75` | `#A8BEE2` | `#A8BEE2` | `#C4B5FD` | `#D4FF3A` |
| `--on-accent` | `#FFFFFF` | `#0F1620` | `#0F1620` | `#0B0A14` | `#0A0B05` |
| `--good` | `#3D7A59` | `#83B89D` | `#83B89D` | `#5EEAD4` | `#3DFFB4` |
| `--bad` | `#A9533A` | `#E1937D` | `#E1937D` | `#FDA4AF` | `#FF7A59` |
| `--warn` | `#94600F` | `#D7B263` | `#D7B263` | `#FCD34D` | `#FFC53D` |
| `--streak` | `#B5652E` | `#E0A36F` | `#E0A36F` | `#FDBA74` | `#FF4FD8` |

**Weitere Tokens**

- **Schatten:** `--shadow-1`, `--shadow-2`, `--shadow-dock`, `--scrim`.
- **Abgeleitet** (per `color-mix`):
  - `--accent-soft`, `--good-soft`, `--bad-soft`, `--warn-soft`: jeweils 14 % der Grundfarbe.
  - `--glass`: Surface mit 82 % Deckkraft.
  - `--press`: Text mit 6 % Deckkraft.
- **Atmosphäre:** `--bg-fill`, `--cta-bg`, `--cta-shadow`, `--cta-gloss`, `--cta-sheen`, `--hero-bg`, `--hero-shadow`, `--glow-good`, `--glow-icon`, `--text-glow`, `--pill-glow`.
  - In Papier, Nacht und OLED sind sie neutral: `none` oder ein Verweis auf `--accent` bzw. `--surface`.
  - Eigene Werte setzen nur Aurora und Neon.
  - Die exakten Werte stehen in jedem Artboard im `<helmet><style>`-Block.
- **Typografie:**
  - Systemschrift; Zahlen in `ui-rounded` mit `tabular-nums`.
  - Gewichte 400, 600 und 700.
  - Skala: `--text-xs 13` · `--text-sm 15` · `--text-md 17` · `--text-lg 20` · `--text-xl clamp(24px, 7vw, 30px)` · `--text-num clamp(28px, 8vw, 36px)` · `--text-display clamp(40px, 12vw, 72px)`. Im Artboard ist das Display 48 px groß, bei 390 px Breite.
  - Einzige Ausnahme sind die Tab-Labels mit 12 px.
- **Abstände:** `--space-1` bis `--space-8` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px.
- **Radien:** `--radius-sm 10` (Tasten 12), `--radius-md 16` (Karten und Buttons), `--radius-lg 24` (Dock, Sheet, Tab-Leiste), `--radius-pill 999`.
- **Trefferflächen:** `--hit-min 44px` für jede Aktion, `--hit-primary 56px` für den Primärbutton.
- **Bewegung:**
  - Dauern: `--dur-tap 100ms` · `--dur-state 200ms` · `--dur-enter 320ms` · `--dur-exit 200ms` · `--dur-progress 600ms`.
  - Kurve: `--ease-out cubic-bezier(.22,1,.36,1)`.

### 1.3 Komponenten im Design

- **Navigation:** Large Title, Floating Tab Bar (Glas, aktiver Tab als Pill), Floating CTA.
- **Listen und Karten:**
  - List Group: Karte mit Zeilen, Trennlinien und Chevron.
  - Hero Card mit `--hero-bg`.
  - Insight Card: Icon im Soft-Kreis, Titel, Text.
  - KPI-Zeile: `dl` mit 3 Werten.
  - Status Line: Mini-Ring, Tagesminuten, Serie.
- **Eingaben:**
  - Chip-Scroller mit Meisterungs-Punkt (voll, halb, leer).
  - Segment-Control.
  - Switch (51 × 31).
  - Stepper (− / Wert / +).
  - Suchfeld.
- **Training:**
  - Segment-Fortschritt: 10 Segmente à 4 px.
  - Zeitlinie: 2 px, ab der Zielzeit Ocker.
  - Antwortfeld in drei Zuständen: Eingabe, richtig, Korrektur.
  - Tastenfeld mit 4 Spalten; „Prüfen“ geht über 2 Zeilen.
  - Auswahl-Raster 2 × 2, Felder 64 px hoch.
  - Dock: Glas, oben gerundet.
  - Feedback-Sheet: Griff, Ergebnis-Kopf, aufklappbarer Lösungsweg, Buttons für Methode und KI, CTA.
- **Auswertung:**
  - Ergebnis-Segmente: 8 px, richtig oder falsch.
  - Wochenbalken mit Ziel-Linie.
  - Heatmap und Lernkurve.
  - Balkenliste.
- **Atempause:** Atemkreis mit einem Zyklus von 8 s.

---

## 2. Abgleich Design ↔ Code

### 2.1 Screen-Mapping

| Screen | Heute im Code | Art der Änderung |
|---|---|---|
| Shell | `public/index.html` (Topbar + 3 Tabs), `router.ts` | **Umbau:** Topbar weg, 4 Tabs, CTA-Slot, Fokus-Modus, Routen-Aliase |
| Heute | `views/home.ts` (Bento mit ~18 Einstiegen, Skeleton) | **Neubau** der Darstellung; die Datenlogik (`recommendation`, `streakInfo`) bleibt |
| Training | `views/train/index.ts`, `answer.ts`, `feedback.ts`, `timer.ts`, `ui/keypad.ts`, `ui/fx.ts` | **Umbau:** gleicher Ablauf, neues Layout aus Kopf, Bühne, Dock und Sheet |
| Ergebnis | `views/train/result.ts` + `ui/fab.ts` | **Neubau** der Darstellung; `fab.ts` entfällt, das Dock übernimmt |
| Atempause | – | **Neu:** `views/train/breathe.ts` |
| Fortschritt | `views/analyse.ts` (10 Abschnitte untereinander) | **Umbau:** Fokus-Karte, KPIs und 4 Ansichten; die Abschnitts-Funktionen werden wiederverwendet |
| Lernen | `views/lernen.ts` (Karten mit `<details>`) | **Umbau:** Suche, Gruppen, Zeilen; Detailansicht unter `#/lernen/:id` |
| Profil | `views/settings.ts` (4 Tabs, Toast bei jeder Änderung, Scrollsprung durch `rerender()`) | **Neubau** als eine gruppierte Seite; die Konto- und Sync-Logik bleibt |
| Ketten/Parallel/Eigenes | `views/chain.ts`, `views/parallel/*`, `views/custom.ts` | **Anpassung** an Fokus-Shell und Tokens; nicht im Design, daher bleibt die Struktur |
| Modal, Toast | `ui/modal.ts`, `ui/toast.ts` | **Restyle** über die Tokens |

### 2.2 Lücken und Entscheidungen

| # | Thema | Entscheidung |
|---|---|---|
| E1 | Theme-Namen | `ThemeSetting = 'system' \| 'paper' \| 'night' \| 'oled' \| 'aurora' \| 'neon'`.<br>Migration in `normalize()`:<br>• `pastel` wird zu `paper`.<br>• `neon` bleibt `neon`, bekommt aber den neuen Look.<br>• `oled` bleibt `oled`.<br>• Unbekannte Werte werden zu `system`.<br>`system` wird zur Laufzeit zu `paper` oder `night` aufgelöst. |
| E2 | Profil zeigt 5 Themes, Tweaks kennen 6 | Das Segment zeigt `System · Papier · Nacht · Aurora · Neon`. OLED wird ein Switch „Reines Schwarz (OLED)“ unter Darstellung, sichtbar nur bei Nacht oder System. Ist er an, gilt `theme = 'oled'`. So bleibt das Segment bei 320 px lesbar. |
| E3 | Zeitanzeige vs. Zeitwertung | Das neue `timerDisplay: 'calm' \| 'precise' \| 'off'` steuert nur die Anzeige; gemessen wird immer. Das bestehende `timer: boolean` (Zeit in Punkte einrechnen, `untimed`) bleibt und wandert als „Zeit in Punkte einrechnen“ unter „Erweitert“. Migration: Aus `timer === false` wird `timerDisplay = 'off'`, sonst `calm`. |
| E4 | Neue Schalter | `breathe: boolean` für die Atempause und `confetti: boolean` für „Feiern“, beide standardmäßig aus. `celebrated` (dayKey) bleibt unverändert. |
| E5 | Einstellungen, die im Design fehlen | `keypad`, `enabledCategories`, `autoSubmit`, `estimateMode`, `ghost`, `autoFail` und `timer` bleiben erhalten. Sie kommen in eine Gruppe **„Erweitert“** am Ende von Profil:<br>• Eine Zeile „Kategorien“ öffnet ein Bottom Sheet mit Switches.<br>• Der Rest wird als Switch oder Segment dargestellt.<br>Keine Funktion fällt weg. |
| E6 | Routen | `#/fortschritt` und `#/profil` kommen neu dazu. `#/analyse` und `#/settings` bleiben als Aliase für Lesezeichen und den PWA-Start. Ein altes `?tab=` scrollt zur passenden Gruppe. |
| E7 | „Weitere Modi“ auf Heute | Die Zeile öffnet ein **Bottom Sheet** mit Kettenrechnen, Parallel, Schätzen und Eigenes. Titel und Untertitel kommen aus `home.*`. Das ist der erste Einsatz der Sheet-Komponente außerhalb des Trainings. |
| E8 | Meisterungs-Punkte | Pro Kategorie und Subtyp aus dem Score:<br>• `≥ 70`: voll<br>• `40–69`: halb<br>• `< 40` oder keine Daten: leer<br>Ein gemeinsamer Helfer `masteryOf(score)` liegt in `ui/kit.ts`. |
| E9 | Hero „Hier verlierst du am meisten Zeit“ | Nur wenn `rec.subtype` gesetzt ist und es mindestens 3 Versuche gibt. Dann zeigt ein Balken die Median-`timeMs` gegen die `targetMs` des Subtyps, mit Zielmarke. Sonst zeigt die Karte `rec.reason` ohne Balken. |
| E10 | CTA „Jetzt üben · ca. 4 min“ | „ca. N min“ ist die Summe der Zielzeiten aller geplanten Aufgaben. Gemeint sind Methode + 5 Aufgaben oder `sessionLength` × typische Zielzeit. Auf ganze Minuten gerundet, mindestens 1. |
| E11 | Begrüßung | Nach Tageszeit: vor 11 Uhr „Guten Morgen“, vor 17 Uhr „Guten Tag“, danach „Guten Abend“. Das Datum kommt aus `Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' })`. |
| E12 | Segment-Fortschritt bei langen Runden | Bis 20 Aufgaben Segmente, darüber ein durchgehender Balken. Daily hat 15 Aufgaben und bekommt Segmente. |
| E13 | Ghost (Bestzeit) | Nur bei `timerDisplay = 'precise'` und `ghost = true` als kleine Marke über den Segmenten. Im ruhigen Modus unsichtbar. |
| E14 | Tastenfeld auf Desktop | Bei `pointer: fine` und `keypad = 'auto'` gibt es kein Bildschirm-Tastenfeld:<br>• Das Antwortfeld ist ein echtes `<input>`.<br>• Das Dock enthält „Wie geht das?“, „Weiß nicht“ und „Prüfen“ (56 px).<br>• Tastatur wie bisher: Enter, Esc, 1–4. |
| E15 | Fehlerdiagnose | Der Titel ergibt sich aus `errorType` und der Richtung des Fehlers:<br>• `nullen`: „Eine Null zu viel“ oder „Eine Null zu wenig“ bei Faktor 10, sonst „Nullen verrutscht“. Detail z. B. „450 statt 45 · Nullen getrennt zählen“.<br>• `knapp`: „Fast. Richtig ist X“.<br>• `falsch`: „Nicht ganz. Richtig ist X“.<br>• `skip`: „Kein Problem“, Detail „So kommst du auf X“.<br>Bei Auto-Fail steht „Zeit abgelaufen“ im Detail. |
| E16 | Lösungsweg | Nach einer falschen oder übersprungenen Antwort offen, nach einer richtigen zugeklappt. |
| E17 | KI-Erklärung | Nur wenn `isAiAvailable()` gilt; sonst nimmt „Methode“ die volle Breite ein. Die KI-Antwort erscheint im Sheet unter den Buttons (bestehendes `aiControl`). |
| E18 | Methode im Sheet | „Methode“ öffnet ein zweites Sheet über dem Feedback, damit die Runde nicht abbricht. Darin führt der Link „In Lernen öffnen“ zu `#/lernen/:id`. |
| E19 | Atempause | Bei `breathe = true` kommt vor der ersten Aufgabe bzw. vor dem Methoden-Intro ein Atemzyklus von 8 s, danach startet die Runde. Tippen überspringt.<br>Bei `prefers-reduced-motion` gibt es einen statischen Kreis mit Text und Start nach 3 s.<br>Keine Atempause bei `daily`, `retry` und Review-Runden mit weniger als 3 Aufgaben. |
| E20 | Ergebnis-Insight | Ab 2 Fehlern nennt die Karte den häufigsten `errorType` der Runde, z. B. „Zwei Nullen-Fehler bei großen Zahlen“, mit einem Tipp aus `methods`. Bei 0 oder 1 Fehler entfällt sie. |
| E21 | Toasts | Kein Toast mehr beim Ändern von Einstellungen. Toasts gibt es nur noch für Export und Import, Sync-Fehler und das Konto. |
| E22 | Skeletons | Fallen weg, wo die Daten synchron vorliegen (Heute, Kopf von Fortschritt). Erlaubt nur noch für echt asynchrone Inhalte wie Konto und KI. |
| E23 | Desktop | Ab 768 px:<br>• Die Tab-Leiste wird zur Seitenleiste links (72 px, Icons und Labels).<br>• Der Inhalt ist zentriert, maximal 640 px breit.<br>• Die CTA sitzt am Ende des Inhalts statt schwebend.<br>Im Fokus-Modus maximal 480 px breit, das Dock schließt bündig darunter an. |

---

## 3. Architektur

### 3.1 CSS-Struktur und Layer

```
public/css/
  tokens.css       @layer-Reihenfolge + alle Theme-Tokens                       (Welle 1)
  base.css         Reset, Typo, Fokus-Ring, .num, Reduced Motion                 (Welle 1)
  layout.css       .screen, .large-title, .tabbar, .cta-float, .focus, .stage,
                   .dock, .sheet, Seitenleiste ab 768 px                         (Welle 1)
  components.css   alle Bausteine aus §4                                          (Welle 1)
  views/
    today.css      (Welle 2 · A)
    train.css      (Welle 2 · B)
    progress.css   (Welle 2 · C)
    learn.css      (Welle 2 · D)
    profile.css    (Welle 2 · E)
    play.css       (Welle 2 · F) Ketten/Parallel/Eigenes
  legacy/          style.css, train.css, parallel.css, fab.css, ui.css → bis Welle 3
```

- **Layer-Reihenfolge:**
  - `tokens.css` beginnt mit `@layer legacy, tokens, base, layout, components, views, utilities;`.
  - Jede Datei hüllt ihren Inhalt in `@layer <name> { … }`.
  - Die alten Dateien kommen unverändert in `@layer legacy { … }`.
  - Ein späterer Layer gewinnt unabhängig von der Spezifität. Neues CSS schlägt also das alte ohne `!important`.
- **Einbindung:** In `index.html` per `<link>`, in der Reihenfolge tokens, base, layout, components, views/\*, legacy/\*. Kein `@import`, damit alles parallel lädt.
- **CSP:** `style-src 'self'` verbietet `style="…"`-Attribute. Dynamische Werte nur per `el.style.setProperty('--x', …)`, wie heute schon (etwa `--w` für Balkenbreiten, `--h` für Höhen).
- **Safe Area:**
  - Tab-Leiste: `bottom: max(16px, env(safe-area-inset-bottom))`.
  - Dock und Sheet: `padding-bottom: max(16px, env(safe-area-inset-bottom))`.
  - Scroll-Inhalt: genug Abstand nach unten, damit Tab-Leiste und CTA nichts verdecken.

### 3.2 Theme-Logik (`src/ui/theme.ts`)

- `resolve(setting)` gibt `paper | night | oled | aurora | neon` zurück; `system` folgt `prefers-color-scheme` und wird zu `paper` oder `night`.
- Setzt `data-theme` auf `<html>`.
- Setzt die Meta `theme-color` auf das `--bg` des Themes.
- Setzt die Meta `color-scheme`: `light` nur bei `paper`, sonst `dark`.
- Exportiert `THEMES` (Werte und Label-Schlüssel) für Profil.

### 3.3 Shell (`src/ui/shell.ts`, neu)

```ts
export type TabId = 'today' | 'learn' | 'progress' | 'profile';
export interface PrimaryAction { label: string; meta?: string; href?: string; onClick?: () => void; icon?: IconName }

/** Markiert den aktiven Tab; null = Fokus-Modus (Tab-Leiste und CTA ausgeblendet, body.is-focus). */
export function setShell(tab: TabId | null): void;
/** Setzt den schwebenden Primärbutton des aktuellen Tabs; null entfernt ihn. */
export function setPrimaryAction(action: PrimaryAction | null): void;
```

- **`index.html`** enthält nur noch drei Elemente:
  - `<main id="app">`
  - `<div id="cta" class="cta-float" hidden>`
  - `<nav class="tabbar">` mit 4 Links; die Labels setzt `shell.ts` beim Start und bei jedem Sprachwechsel.
- **Router:** Er ruft vor jedem `render*()` erst `setShell(...)` und dann `setPrimaryAction(null)` auf. Die CTA setzt die View danach selbst.
- **Fokus-Modus:** `body.is-focus` ersetzt `in-play` und gilt für train, chain, parallel und den Spielteil von custom. Tab-Leiste und CTA sind dann ausgeblendet.

### 3.4 Router (`src/router.ts`)

- **Routen:**
  - `today` (`#/`)
  - `learn` (`#/lernen`, `#/lernen/:id`)
  - `progress` (`#/fortschritt`, Alias `#/analyse`)
  - `profile` (`#/profil`, Alias `#/settings`)
  - außerdem `chain`, `parallel`, `custom` und `train`
- **`rerender({ keepScroll = false } = {})`:** Merkt sich `scrollY` und stellt die Position nach dem Rendern wieder her. Das behebt den Scrollsprung A11.
- **View Transitions:** Beim Tab-Wechsel per `document.startViewTransition`, sofern vorhanden und Reduced Motion aus ist. Cross-Fade über 200 ms, kein Slide. Innerhalb des Trainings gibt es keine View Transitions.
- **Scroll-Position je Tab:** Eine Map `tab → scrollY` stellt die Position beim Zurückwechseln wieder her. Andere Routen starten oben.

### 3.5 UI-Kit (`src/ui/kit.ts`, neu)

Alle Bausteine erzeugen DOM über `h()` und nutzen die Klassen aus `components.css`. Eine View baut diese Muster nie selbst nach.

```ts
// Struktur
largeTitle(title: string, sub?: string): HTMLElement
group(title: string | null, ...children: Child[]): HTMLElement                 // .group + .group-title
list(rows: Child[]): HTMLElement                                               // .list (Karte mit Trennlinien)
row(o: { icon?: IconName; label: string; sub?: string; value?: string; valueTone?: 'accent' | 'muted';
         href?: string; onClick?: () => void; chevron?: boolean; tone?: 'danger'; trailing?: Node }): HTMLElement
card(children: Child[], o?: { hero?: boolean; label?: string }): HTMLElement
insight(o: { icon: IconName; tone: 'warn' | 'good' | 'accent' | 'bad'; title: string; text: string }): HTMLElement
kpis(items: Array<{ label: string; value: string }>): HTMLDListElement
statusLine(o: { todayMin: number; goalMin: number; streak?: number; xp?: number }): HTMLElement

// Eingaben – aktualisieren sich LOKAL, nie über rerender()
segmented<V extends string>(o: { label: string; options: ReadonlyArray<readonly [V, string]>; value: V;
         onChange: (v: V) => void }): HTMLElement
switchRow(o: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }): HTMLElement
stepper(o: { label: string; value: number; min: number; max: number; step: number;
         format: (n: number) => string; onChange: (n: number) => void }): HTMLElement
chip(o: { label: string; href?: string; onClick?: () => void; mastery?: Mastery }): HTMLElement
chips(items: HTMLElement[]): HTMLElement                                       // horizontaler Scroller
searchField(o: { label: string; placeholder: string; onInput: (q: string) => void }): HTMLLabelElement
fold(o: { label: string; open?: boolean; children: Child[] }): HTMLElement      // ersetzt widgets.fold

// Fortschritt & Status
type Mastery = 'full' | 'half' | 'empty';
masteryOf(score: number | null | undefined): Mastery
masteryDot(m: Mastery): SVGElement
segments(o: { total: number; done: number; current?: boolean }): { el: HTMLElement; set(done: number, current: boolean): void }
resultSegments(results: readonly boolean[]): HTMLElement
timeLine(): { el: HTMLElement; set(fraction: number, over: boolean): void }
miniRing(fraction: number): SVGElement
barList(items: Array<{ label: string; value: number; max: number; text: string; tone?: 'accent' | 'warn' | 'bad' }>): HTMLElement

// Aktionen
button(o: { label: string; kind?: 'primary' | 'soft' | 'outline' | 'link' | 'quiet'; icon?: IconName;
            href?: string; onClick?: () => void; full?: boolean; meta?: string; cta?: boolean }): HTMLElement
icon(name: IconName, size?: number): SVGElement
```

**Icons:** Strichstärke 1,75. Die SVG-Pfade stehen in den Artboards; die Namen sind:

- **Tabs:** `sun` (Heute), `book` (Lernen, Methode), `bars` (Fortschritt), `person` (Profil)
- **Navigation und Training:** `close`, `chevron-right`, `chevron-down`, `undo` (Korrektur), `bulb` (Hinweis), `check`, `backspace`, `plus-minus`
- **Aktionen:** `search`, `refresh` (Fehler üben), `chat` (KI)
- **Inhalte:** `calendar` (Daily), `grid` (gemischt), `link` (Weitere Modi), `flame` (Serie), `target` (Fokus)
- **Konto und Daten:** `key` (Passkey), `sync`, `download`, `upload`, `trash`, `sparkles` (Neuigkeiten)

Die alten Namen aus `charts.icon` bleiben als Aliase gültig, bis Welle 3 aufräumt.

### 3.6 Dock & Sheet

```ts
// src/ui/dock.ts
export function dock(...children: Child[]): HTMLElement        // .dock: Glas, Radius 24 oben, Safe-Area-Padding

// src/ui/sheet.ts
/** Inline-Sheet ersetzt ein Dock an Ort und Stelle (Training). Animation sheet-in 320 ms. */
export function inlineSheet(o: { label: string; children: Child[] }): HTMLElement
export interface SheetHandle { el: HTMLDialogElement; close(): void }
/** Modales Bottom Sheet mit Scrim, Griff, Swipe-down/Esc, Fokusfalle, Rückfokus. */
export function openSheet(o: { title: string; children: Child[]; onClose?: () => void }): SheetHandle
```

- **`openSheet`** baut auf `<dialog>` mit `showModal()` auf. Fokusfalle und Esc liefert der Browser.
- **Darstellung:** Klasse `.sheet.is-modal`; der Scrim kommt aus `::backdrop` mit `--scrim`.
- **Schließen** auf vier Wegen:
  - Tipp auf den Scrim
  - Esc
  - Wisch nach unten (Pointer-Events, ab 80 px)
  - ✕-Button
- **Body-Scroll:** Während das Sheet offen ist, ist der Seiteninhalt gesperrt.
- **Desktop:** Ab 768 px wird das Sheet ein zentrierter Dialog mit maximal 480 px Breite.

### 3.7 Rückmeldung (`src/ui/fx.ts`)

```ts
export function haptic(kind: 'tap' | 'success' | 'soft'): void   // nur wenn settings.haptics && 'vibrate' in navigator
export function tone(): void                                    // leiser Zweiklang (660 → 880 Hz, 2 × 80 ms)
export function answerFx(correct: boolean): void                // richtig: haptic('success') + tone() wenn sound; falsch: haptic('soft'), kein Ton
```

Folgendes entfällt:

- der Fehlerton mit 220 Hz
- das Vibrationsmuster `[30,40,30]`
- die Animationsklassen `anim-shake` und `anim-pop`

### 3.8 Bewegung

| Element | Animation | Dauer |
|---|---|---|
| Druck auf Buttons | `scale(.97)` + `brightness(.94)` | `--dur-tap` |
| Farb- und Zustandswechsel | `background-color`, `border-color` | `--dur-state` |
| Sheet / Ergebniszeile | `sheet-in` (translateY 32 → 0) / `rise-in` (8 → 0) | `--dur-enter` |
| Haken | Linie wird gezeichnet (`stroke-dashoffset` 24 → 0) | 280 ms, 80 ms Verzögerung |
| Segmente, Balken, Ringe | Breite und Farbe | `--dur-progress` |
| Zeitlinie | Breite, linear; Takt 250 ms statt 100 ms | 250 ms |
| CTA-Glanz (nur Aurora und Neon) | `sheen`, einmal pro Mount | 1,4 s |
| Atemkreis | `breathe` | 8 s; einzige Schleife, nur im Atempause-Screen |

Bei Reduced Motion wird alles zu einem 150-ms-Fade: kein Glanz, keine gezeichneten Linien, statischer Atemkreis.

---

## 4. Komponenten-Katalog

| Komponente | Klasse(n) | Datei | Genutzt in | Status |
|---|---|---|---|---|
| Large Title | `.large-title`, `.large-title-sub` | kit.ts | Heute, Lernen, Fortschritt, Profil | neu |
| Tab-Leiste | `.tabbar`, `.tab`, `.tab-pill` | shell.ts, layout.css | Shell | Umbau |
| Floating CTA | `.cta-float` | shell.ts, layout.css | alle Tabs | neu (ersetzt `fab.ts`) |
| Primär-Button | `.btn.primary` (+ `.cta`: Gloss und Glanz) | kit.ts | überall | Umbau |
| Soft-, Outline-, Text-Button | `.btn.soft`, `.btn.outline`, `.btn.link`, `.btn.quiet` | kit.ts | Ergebnis, Sheet, Dock | Umbau |
| List Group, Zeile | `.list`, `.row` (+ `-icon`, `-label`, `-sub`, `-value`, `-chevron`) | kit.ts | Heute, Lernen, Fortschritt, Profil, Ergebnis | neu |
| Gruppentitel | `.group`, `.group-title` | kit.ts | alle Tabs | neu |
| Karte, Hero | `.card`, `.card.hero` | kit.ts | Heute, Fortschritt, Ergebnis | Umbau |
| Insight | `.insight`, `.insight-icon` | kit.ts | Ergebnis, Fortschritt | neu |
| KPI-Zeile | `.kpis` | kit.ts | Fortschritt | neu |
| Status Line | `.status-line`, `.mini-ring` | kit.ts | Heute, Ergebnis | neu |
| Chip mit Meisterung | `.chip`, `.chips`, `.mastery` | kit.ts | Heute, Lernen | neu |
| Segment-Control | `.segmented` + `[aria-pressed]` | kit.ts | Fortschritt, Profil | Umbau (lokal aktualisiert, Fix A11) |
| Switch | `.switch[role=switch]` | kit.ts | Profil | neu (ersetzt Checkbox-Toggles) |
| Stepper | `.stepper` | kit.ts | Profil (Tagesziel) | neu |
| Suchfeld | `.search` | kit.ts | Lernen | neu |
| Fold | `.fold`, `.fold-head`, `.steps` | kit.ts | Sheet, Lernen-Detail | Umbau |
| Segment-Fortschritt | `.segments`, `.seg.is-done`, `.seg.is-current` | kit.ts | Training | neu |
| Ergebnis-Segmente | `.segments.is-result`, `.seg.is-good`, `.seg.is-bad` | kit.ts | Ergebnis | neu |
| Zeitlinie | `.timeline`, `.timeline.is-over` | kit.ts + train/timer.ts | Training | neu (ersetzt Timer-Balken) |
| Antwortfeld | `.answer-field` (+ `.is-good`, `.is-bad`, `.is-skip`), `.caret` | train/answer.ts | Training | Umbau |
| Tastenfeld | `.keypad`, `.key`, `.key.check` | ui/keypad.ts | Training | Umbau (neues Raster) |
| Auswahl-Raster | `.choices`, `.choice`, `.choice-key` | train/answer.ts | Training | Umbau |
| Dock | `.dock` | ui/dock.ts | Training, Ergebnis, Spielmodi | neu |
| Inline-Sheet | `.sheet`, `.sheet-grip`, `.fb-head`, `.fb-icon` | ui/sheet.ts + train/feedback.ts | Training | neu |
| Modal-Sheet | `dialog.sheet.is-modal` | ui/sheet.ts | Heute (Modi), Training (Methode), Profil (Kategorien, Konto) | neu |
| Balkenliste | `.bar-list` (genau EIN Muster, Fix T1) | kit.ts | Fortschritt | Umbau |
| Wochenbalken | `.week` | views/analyse.ts | Fortschritt | neu |
| Heatmap, Lernkurve | `.heatmap`, `.sparkline` | charts.ts | Fortschritt | Restyle |
| Atemkreis | `.breathe` | views/train/breathe.ts | Atempause | neu |
| Toast | `.toast` | ui/toast.ts | Export, Import, Sync | Restyle ohne `!important` |

---

## 5. Umsetzung in Wellen

```
Welle 1  Fundament ──────────────────────────────────────────── 1 Agent
                         │
Welle 2  A Heute · B Training · C Fortschritt · D Lernen · E Profil · F Spielmodi
         (6 Agents parallel, getrennte Dateien laut §6)
                         │
Welle 3  Integration & Aufräumen ───────────────────────────── 1 Agent
                         │
Welle 4  Code-Review-Agent + Browser-Check (320/375/768/1280 px × 5 Themes)
```

### Welle 1 · Fundament (1 Agent)

**Diese Dateien gehören dem Agent:**

- **CSS und HTML:**
  - `public/css/tokens.css`, `base.css`, `layout.css`, `components.css`
  - `public/css/legacy/*`: die alten Dateien hierher verschieben und in `@layer legacy` hüllen
  - `public/index.html`
- **UI-Module:**
  - `src/ui/theme.ts` und `src/ui/fx.ts`
  - `src/ui/shell.ts`, `kit.ts`, `sheet.ts` und `dock.ts` (alle neu)
  - `src/ui/charts.ts`, nur für die Icon-Erweiterung
  - `src/router.ts`
- **Typen und Daten:** `src/types.ts`, `src/data/schema.ts`
- **i18n:** `src/i18n/locales/{de,en}/common.ts`
- **Tests:** `tests/storage.test.ts` und der neue `tests/theme.test.ts`

**Was der Agent liefert:**

1. Tokens für alle 5 Themes, exakt nach §1.2: Atmosphäre, Typografie, Abstände, Radien, Bewegung.
2. Die Layer-Struktur. Die alten Views laufen über `@layer legacy` weiter.
3. Die Shell: keine Topbar, 4 Tabs, CTA-Slot, `body.is-focus`, ab 768 px eine Seitenleiste.
4. Den Router: Routen und Aliase, `rerender({ keepScroll })`, View Transitions, Scroll-Position je Tab.
5. `kit.ts`, `dock.ts` und `sheet.ts` mit der API aus §3.5 und §3.6.
6. Theme-Migration und die neuen Settings (`timerDisplay`, `breathe`, `confetti`), jeweils mit Tests.

**Abnahme:**

- `npm run typecheck`, `npm test` und `npm run build` sind grün.
- Neue Tests decken `pastel→paper`, `timer:false→timerDisplay:'off'` und „unbekanntes Theme → `system`“ ab.
- Die App startet, alle 4 Tabs navigieren, `#/analyse` und `#/settings` funktionieren als Aliase.

### Welle 2 · Screens (6 Agents parallel)

Jeder Agent baut nur seinen Screen und nutzt die Bausteine aus `kit.ts`. Fehlt ein Baustein oder muss er anders aussehen, ändert der Agent `kit.ts` und `components.css` **nicht**. Er legt stattdessen eine lokale Variante in der eigenen View an, dazu das CSS in der eigenen `views/*.css`, und meldet sie im Abschlussbericht.

| Agent | Gehört | Liefert |
|---|---|---|
| **A · Heute** | `src/views/home.ts`, `public/css/views/today.css`, i18n `home` | Large Title mit Begrüßung (E11), Hero (E9), Status Line, „Andere Übungen“ (Daily, Alle Kategorien, Weitere Modi → Sheet, E7), Kategorie-Chips (E8), CTA (E10). Kein Skeleton. |
| **B · Training** | `src/views/train/*` (inkl. neuem `breathe.ts`), `src/ui/keypad.ts`, `src/ui/fab.ts` (löschen), `public/css/views/train.css`, i18n `train` | Eingabe, Auswahl, Feedback-Sheet (richtig, Korrektur, übersprungen), Ergebnis, Atempause, Methoden-Intro. Deckt E3 und E12–E20 ab. Die Tastaturbedienung bleibt. |
| **C · Fortschritt** | `src/views/analyse.ts`, `public/css/views/progress.css`, i18n `analyse` | Fokus-Karte, KPIs, Segment mit 4 Ansichten (lokal umschalten, Auswahl in `sessionStorage`), CTA „Gezielt üben“ → `#/train/weak` |
| **D · Lernen** | `src/views/lernen.ts`, `public/css/views/learn.css`, i18n `lernen` | Suche, Gruppen mit „Skill N“, Zeilen mit Meisterungs-Punkt und Tipp in einer Zeile. Detailseite `#/lernen/:id`: Idee, Schritte, Beispiel, Trick, Stolperfallen, CTA „Üben · 5 Aufgaben“. Tab-CTA „Weiterlernen · <nächster offener Subtyp>“. |
| **E · Profil** | `src/views/settings.ts`, `public/css/views/profile.css`, i18n `settings` und `account` | Eine Seite mit den Gruppen Konto, Training, Darstellung (E2), Rückmeldung, Daten, Über und Erweitert (E5). Segmente ohne Scrollsprung, keine Speicher-Toasts (E21). Die Passkey-Verwaltung liegt im Modal-Sheet. |
| **F · Spielmodi** | `src/views/chain.ts`, `src/views/parallel/*`, `src/views/custom.ts`, `public/css/views/play.css`, i18n `chain`, `parallel`, `custom` | Fokus-Kopf (✕ + Titel), Bühne, Dock mit Primäraktion; Tokens statt alter Klassen. Die Struktur bleibt. |

**Regeln für alle Agents in Welle 2:**

- **Gesperrte Dateien:** Die eigenen Dateien dürfen geändert werden, diese nicht: `router.ts`, `kit.ts`, `sheet.ts`, `dock.ts`, `shell.ts`, `theme.ts`, `fx.ts`, `types.ts`, `schema.ts`, `components.css`, `layout.css`, `tokens.css`, `base.css`, `index.html` und i18n `common`.
  - Braucht ein Agent ein neues Setting oder eine Router-Änderung, meldet er das. Er arbeitet nicht drumherum.
- **i18n:** Jeden Text in de **und** en anlegen; der Paritätstest prüft beide.
- **Markup:** Kein `style=`-Attribut, kein `innerHTML`.
- **Mobile:**
  - Bei 320 px Breite kein horizontales Scrollen.
  - Jede Aktion mindestens 44 px groß, die Primäraktion 56 px und im Daumenbereich.
- **Aufräumen:** Jeden Timer und Listener über `setCleanup` oder `addCleanup` aus `router.ts` abmelden.
- **Prüfen:** Am Ende `npm run typecheck` und `npm test`. **Kein** `npm run build`: Parallel laufend würden sich die Agents gegenseitig `dist/` löschen.
- Nichts committen.

### Welle 3 · Integration & Aufräumen (1 Agent)

1. Gemeldete lokale Varianten prüfen; was mehrfach vorkommt, ins Kit heben.
2. Legacy-CSS entfernen.
   - Für jede alte Klasse, die noch genutzt wird: entweder das Markup umstellen oder die Regel in die passende neue Datei übernehmen.
   - Danach `public/css/legacy/` löschen.
   - Ein `grep` nach den alten Klassen muss leer sein (`.tile`, `.bento`, `.cat-grid`, `.fab-bar`, `.topbar`, `.site-header`, `.nav`, `.stats`, `.brand-mark` …).
3. `ui/modal.ts` und `ui/toast.ts` auf die Tokens umstellen (Toast ohne `!important`). `ui/skeleton.ts` nur noch dort einsetzen, wo es nötig ist.
4. Release-Eintrag in `src/releases.ts` und `CHANGELOG.md` (Version 1.11.0).
5. `npm run build`, `npm test` und `npm run typecheck` laufen lassen.

### Welle 4 · Prüfung

- **Code-Review-Agent** über den gesamten Diff. Schwerpunkte: Korrektheit, Aufräumen von Listenern und Timern, Fokus-Management, Barrierefreiheit.
- **Browser-Check** im Browser-Pane, für alle Kombinationen aus
  - Breiten: 320, 375, 768 und 1280 px
  - Themes: Papier, Nacht, OLED, Aurora und Neon.
- **Flows im Browser-Check:**
  - Heute → Jetzt üben → Eingabe → Prüfen → Feedback → Weiter → Ergebnis → Nochmal
  - Auswahlaufgabe
  - falsche Antwort mit Lösungsweg
  - „Weiß nicht“
  - Atempause
  - Profil-Segmente ohne Scrollsprung
  - Theme-Wechsel während die App läuft
  - Sprache de/en
  - Reduced Motion

---

## 6. Datei-Besitz (Kollisionsschutz)

| Datei/Ordner | W1 | A | B | C | D | E | F | W3 |
|---|---|---|---|---|---|---|---|---|
| `public/index.html`, `css/{tokens,base,layout,components}.css` | ✎ | | | | | | | ✎ |
| `css/views/today.css` | | ✎ | | | | | | ✎ |
| `css/views/train.css` | | | ✎ | | | | | ✎ |
| `css/views/progress.css` | | | | ✎ | | | | ✎ |
| `css/views/learn.css` | | | | | ✎ | | | ✎ |
| `css/views/profile.css` | | | | | | ✎ | | ✎ |
| `css/views/play.css` | | | | | | | ✎ | ✎ |
| `css/legacy/*` | anlegen | | | | | | | löschen |
| `src/router.ts`, `src/ui/{shell,kit,sheet,dock,theme,fx}.ts` | ✎ | | | | | | | ✎ |
| `src/ui/keypad.ts`, `src/ui/fab.ts` | | | ✎ | | | | | ✎ |
| `src/ui/{modal,toast,skeleton}.ts` | | | | | | | | ✎ |
| `src/ui/widgets.ts` (`methodBlock`, `stepsList`, `fold`; Signaturen kompatibel) | | | | | ✎ | | | ✎ |
| `src/ui/charts.ts` | Icons | | | `ring`, `sparkline`, `heatmapGrid`, `progressBar` | | | | ✎ |
| `src/views/home.ts` | | ✎ | | | | | | |
| `src/views/train/*` | | | ✎ | | | | | |
| `src/views/analyse.ts` | | | | ✎ | | | | |
| `src/views/lernen.ts` | | | | | ✎ | | | |
| `src/views/settings.ts` | | | | | | ✎ | | |
| `src/views/{chain,custom}.ts`, `src/views/parallel/*` | | | | | | | ✎ | |
| `src/types.ts`, `src/data/schema.ts` | ✎ | | | | | | | ✎ |
| i18n `common` | ✎ | | | | | | | ✎ |
| i18n `home` · `train` · `analyse` · `lernen` · `settings`+`account` · `chain`+`parallel`+`custom` | | A | B | C | D | E | F | ✎ |
| `src/releases.ts`, `CHANGELOG.md` | | | | | | | | ✎ |

---

## 7. Abnahmekriterien

**Global**

- **Messgrößen aus `DESIGN-MOBILE-FIRST.md` §5:**
  - Heute: ohne Scrollen höchstens 4 Entscheidungen sichtbar.
  - Trainingskopf: höchstens 3 Elemente, bei „Präzise“ 4.
  - Keine Endlos-Animation außer dem Atemkreis.
  - Kein Fehlerton.
  - Die Primäraktion im Training liegt immer unten.
- **Kontrast:** Jedes Textpaar laut §1.2 mit mindestens 4,5 : 1.
- **Layout:** Bei 320 px kein horizontales Scrollen, jede Trefferfläche mindestens 44 px groß.
- **Bewegung:** `prefers-reduced-motion` wird respektiert.
- **Tastatur:**
  - Logische Tab-Reihenfolge und ein sichtbarer Fokus-Ring (3 px, Akzentfarbe).
  - Im Training funktionieren Enter, Esc und 1–4.
  - Esc schließt Sheets.
- **Screenreader:**
  - `aria-current` am aktiven Tab.
  - `aria-live` für das Ergebnis.
  - `role="switch"` an Schaltern, `aria-pressed` an Segmenten.
  - Sheets als `dialog` mit Label.
- **Code:** Kein `style=` im Markup und kein `innerHTML`; die CSP bleibt unverändert.
- **Checks:** `npm test`, `npm run typecheck` und `npm run build` sind grün.

**Je Screen:** Maßstab ist das Artboard. Abweichen darf ein Screen nur dort, wo echte Daten fehlen. Dann zeigt er einen ruhigen leeren Zustand, etwa „Noch keine Daten – starte eine Runde“.

---

## 8. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Parallele Agents überschreiben sich gegenseitig | Datei-Besitz laut §6, gesperrte Dateien, kein `build` in Welle 2 |
| Legacy-CSS beißt sich mit neuen Klassen | `legacy` ist der Layer mit der niedrigsten Priorität; neue Klassen heißen bewusst anders (`.list`/`.row` statt `.tile`) |
| Aurora: transparente Flächen über einem Verlauf schwächen den Kontrast | Text-Tokens sind gegen den dunkelsten Punkt des Hintergrunds geprüft; Text steht nie direkt auf `--accent` |
| `<dialog>` in älteren Safari-Versionen | Safari unterstützt `<dialog>` seit 15.4; für ältere Versionen ist kein Fallback geplant |
| View Transitions nicht überall verfügbar | Progressive Enhancement: Ohne die API wechselt die Ansicht sofort |
| Merge mit `main` | Der Branch basiert auf `755ef41`; Konflikte sind nur bei parallelen Änderungen in `main` zu erwarten |
