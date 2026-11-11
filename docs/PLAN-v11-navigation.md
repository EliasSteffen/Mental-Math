# Plan v11 – Navigation: vier Tabs und Profil-Knopf

Stand: 2026-11-11 · Basis: `develop` @ `606fd60` (2.2.0) · Ziel-Version **2.3.0**

Entscheidung des Product Owners (2026-11-11): **Möglichkeit 3** – Tab-Leiste **Heute · Lernen · Erfolge · Wettkampf**, das Profil verlässt die Tab-Leiste und ist über das **Liga-Emblem als runder Knopf oben rechts** erreichbar. Kein Burger-Menü.

## 0. Ausgangslage und Ziel

| Weg | heute | nach v11 |
|---|---|---|
| Mini-Case starten | 3 Tipps (Heute → Weitere Modi → Mini-Case → Zufällig) | **1–2** (Kachel → Zufällig) |
| Shop | 3 (Fortschritt → Erfolge → Shop) | **2** (Erfolge → Shop) |
| Orden | 3 | **1–2** (Erfolge zeigt sie, Antippen → alle) |
| Einstellungen (z. B. Erinnerungen) | 2 (Profil-Tab → Erinnerungen) | **2** (Emblem → Erinnerungen) |
| Statistik (Verlauf, Fehler) | 1–2 (Fortschritt) | **2** (Erfolge → Statistik) |

Probleme, die v11 löst: Motivation verteilt auf vier Tabs; „Fortschritt“ und „Erfolge“ doppelt; Mini-Case versteckt; Einstellungen belegen einen Tab; Wettkampf ohne Konto fast leer (bleibt inhaltlich, s. §4).

| Paket | Inhalt | Modell | Phase |
|---|---|---|---|
| **N** | Tab-Leiste (4 Tabs), Profil-Knopf (Emblem) in den Seitentiteln, Profil als „Modal-Seite“, iPad-Seitenleiste mit Profil unten | sonnet | 1 |
| **E** | Erfolge-Zentrale: Übersicht mit Spielerkarte, Quests, Liga, Orden, Karten, Shop, Statistik; Unterseiten mit Zurück | sonnet | 1 |
| **H** | Heute: Kachel Mini-Case, Einstufungstest im Empfehlungs-Hero für Neue, Modi-Sheet aufräumen | haiku | 1 |
| **T** | Rundgang, Einführung, alle Wegangaben in Texten, einmaliger Hinweis nach dem Update | sonnet | 2 (nach N, E, H) |

## 1. Leitplanken (wie PLAN-v10 §1, verbindlich)

- Strict TS, `.ts`-Imports, `import type`, kein `any`, DOM nur über `h()`, kein `innerHTML`, keine Inline-Styles außer `style.setProperty('--x', …)`, Theme-Tokens, 320 px tauglich, iPad (≥ 720 px Seitenleiste, ≥ 1024 px breite Seitenleiste) mitdenken, `prefers-reduced-motion`, große Schrift (`--type-scale` 1,3 + `is-large-text`) nicht brechen. Ruhiges Design.
- Texte de **und** en. **Nur in den genannten Namensräumen ergänzen** (N `common`, E `rewards`, H `home`, T alle Texte – in Phase 2).
- **Keine neuen Einstellungsfelder, keine Sync-Änderung, kein SQL, kein Server.** Geräte-lokale Merker (z. B. „Hinweis gesehen“) über `localStorage` mit `try/catch` (Muster `src/features/league-sync.ts`).
- **Routen bleiben gültig** (Links aus Erinnerungen, Teilen, Lesezeichen): `#/`, `#/lernen…`, `#/wettbewerbe`, `#/erfolge…`, `#/fortschritt` (jetzt „Statistik“ unter Erfolge), `#/profil…`, `#/quests`, `#/case…` usw. Aliase `#/analyse`, `#/settings` bleiben.
- **Nicht anfassen**: `package.json` (Version), `src/releases.ts`, `CHANGELOG.md`, `ios/`, `.github/`, `sql/`, `server/`; `README.md` nur Paket T.
- **Tests** in `tests/v11-<thema>.test.ts`; DOM-freie Logik in `src/core/…` bzw. eigenen Daten-Modulen. Bestehende Tests nur bei bewusster Änderung anpassen und melden.
- **Prüfen**: `npm ci --no-audit --no-fund` (einmal), `npm run typecheck`, `npm test`, `npm run build` grün. Playwright (vorinstalliert, `require('playwright')`, `chromium.launch()`), `python3 -m http.server <PORT> -d dist` (N 5211, E 5212, H 5213, T 5214), frisches `launchPersistentContext`-Profil je Szenario, Willkommen-Dialog → „Selbst entdecken“. Viewports 390×844 und 375×667 (`isMobile`, `hasTouch`, `locale: 'de-DE'`), 820×1180 (iPad hoch) und 1180×820 (iPad quer), hell und dunkel, einmal `en-US`. **Keine `fullPage`-Screenshots auf langen Seiten** (Playwright verliert danach die Touch-Emulation – Tastenfeld fehlt dann); stattdessen scrollen und normale Screenshots. Keine `pageerror`, `scrollWidth ≤ innerWidth`; **Heute ohne senkrechtes Scrollen** auf beiden Telefon-Größen (Ausnahme: Comeback-/Reparatur-Karte). Training spielen: `#/train/mult.2x1?n=5`, `.train-q`, `.numpad-key[data-key="7"]`, `.numpad-check`; richtig → Auto-Weiter, falsch → „Weiter“. Scratch nur in `/tmp/claude-0/-home-user-Mental-Math/9784dfef-b9e0-5a86-b4f1-590ca907cb57/scratchpad/v11-<paket>/`.
- **Commit** im Worktree, deutsche konventionelle Nachricht mit
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CvA9TXwPmWzXPznvLd6X4C
  ```
  nicht pushen; **Bericht** wie bisher (Branch, Commit, Dateien, Tests, geänderte Tests, Screenshots, offene Punkte).

## 2. Paket N – Tab-Leiste, Profil-Knopf, Profil als Modal-Seite

**Tab-Leiste** (`public/index.html`, `src/ui/shell.ts`, `public/css/layout.css`):
- `TabId = 'today' | 'learn' | 'achievements' | 'compete'`, Reihenfolge **Heute · Lernen · Erfolge · Wettkampf**. `TAB_HREF.achievements = '#/erfolge'`. Neues Tab-Icon „Erfolge“ (Medaille, inline-SVG wie die anderen; dasselbe Symbol als `medal` in `src/ui/charts.ts`). Texte `common.tabAchievements` („Erfolge“ / „Achievements“). Alte Schlüssel `common.tabProgress`/`tabProfile` dürfen bleiben.
- Alle Verwendungen von `TabId` kompilierbar halten: `src/features/onboarding.ts` (`tab: 'progress'` → `'achievements'`, `tab: 'profile'` → `null`), `src/features/tour-scripts.ts` (Selektoren nur so weit anpassen, dass Tests/Typen grün sind – den Inhalt baut Paket T neu).
- **iPad-Seitenleiste** (≥ 720 px): vier Einträge, darunter abgesetzt am unteren Rand ein Eintrag **„Profil“** mit kleinem Liga-Emblem (und Anzeigename, wenn angemeldet); aktiv markiert auf `#/profil…`. In der Seitenleiste ersetzt dieser Eintrag den Knopf im Titel.

**Router** (`src/router.ts`):
- `tabOf`: `achievements` **und** `progress` (Statistik) → `'achievements'`; `today`, `custom`, `quests`, `case` (Auswahl) → `'today'`; `compete`, `board`, `challenge`, `duel` → `'compete'`; `learn` → `'learn'`; `profile` → **kein Tab, aber kein Fokus-Modus**: neuer Shell-Zustand **„modal“** (`setShell(null, { modal: true })` o. ä.): Telefon/Hochformat ohne Tab-Leiste, Seite gleitet beim Öffnen von unten herein (`prefers-reduced-motion`: ohne), iPad-Seitenleiste bleibt mit „Profil“ aktiv.
- **Letzten Tab merken**: Beim Rendern einer Tab-Route deren `location.hash` in `sessionStorage` (`mm.lastTab`) – DOM-freie Hilfsfunktion `lastTabHash(stored, fallback)` testen.
- **Profil-Startseite** (`#/profil`, `src/views/settings.ts` – nur der Kopf): oben rechts Knopf **„Schließen“** (✕, `aria-label`), führt zu `mm.lastTab` (sonst `#/`); Esc und die Browser-Zurück-Taste schließen ebenso. Unterseiten `#/profil/<abschnitt>` behalten „‹ Profil“.
- Seitentitel (`routeTitle`): Erfolge, Statistik (`#/fortschritt`), Profil.

**Profil-Knopf** (`src/ui/account-button.ts`):
- Runder Knopf (44 × 44 Trefferfläche, Emblem ~32 px) mit `leagueEmblem({ tier, frame: activeFrame(), champion, size, labelled: false })`, `aria-label` „Profil und Einstellungen“, Ziel `#/profil`. Optionaler kleiner Punkt (Akzent), wenn eine Truhe bereit ist (Paket Q: Wochenstand) – nur wenn einfach erreichbar, sonst weglassen.
- **Einsetzen ohne Änderungen in den Views**: Der Router setzt ihn nach dem Zeichnen jeder **Tab-Startseite** (Heute `#/`, Lernen-Liste `#/lernen`, Erfolge-Übersicht `#/erfolge`, Wettkampf `#/wettbewerbe`) in das **erste `.large-title`** in `#app` ein (oben rechts, CSS-Grid im `.large-title`, Titel umbricht nicht unter den Knopf). Nicht auf Unterseiten, nicht im Fokus-Modus, nicht auf iPad mit Seitenleiste (dort Eintrag unten).
- Nach Sprachwechsel/Rerender wieder vorhanden (Router zeichnet ohnehin neu).

**Dateien**: `public/index.html`, `src/ui/shell.ts`, `src/router.ts`, `src/ui/account-button.ts` (neu), `src/ui/charts.ts` (Icon `medal`), `src/views/settings.ts` (nur Kopf der Startseite: Schließen), `src/features/onboarding.ts` + `src/features/tour-scripts.ts` (nur Kompilier-Anpassungen), `public/css/layout.css` + neue `public/css/views/nav.css` (in `app.css`), i18n `common`.

**Tests** `tests/v11-nav.test.ts`: `tabOf` aller Routen, `lastTabHash`, `TAB_HREF`; bestehende Shell-/Layout-Tests anpassen, falls sie fünf Tabs erwarten (melden).

**Abnahme**: Telefon: 4 Tabs, Emblem oben rechts auf allen vier Startseiten, Antippen → Profil gleitet herein ohne Tab-Leiste, „Schließen“ → zurück zum vorherigen Tab (auch von Lernen/Wettkampf aus); Abschnitt öffnen → „‹ Profil“ → „Schließen“. iPad hoch/quer: Seitenleiste mit 4 Einträgen + „Profil“ unten, kein Emblem im Titel. Fokus-Modus (Training) unverändert ohne Tab-Leiste.

## 3. Paket E – Erfolge-Zentrale

**Übersicht** `#/erfolge` (ohne Unterseite; bisher Standard „liga“) in `src/views/achievements.ts`: Large Title „Erfolge“ (der Profil-Knopf kommt von Paket N), danach Abschnitte, jeder antippbar:
1. **Spielerkarte** (vorhandene `playerCard()` aus `src/views/profile-card.ts`; hier ohne Link auf sich selbst – Option ergänzen, Ziel `#/erfolge/liga`).
2. **Quests heute**: die drei Quests mit Haken/Fortschritt, darunter Wochensterne und „Truhe bereit“ → `#/quests` (Daten aus `src/features/quests.ts`/`src/core/quests.ts`, nichts neu berechnen).
3. **Liga**: Emblem, Stufe, LP-Balken, Champion-Zeile → `#/erfolge/liga`.
4. **Orden**: „7 von 22“ + die zuletzt verdienten (bis 5 Medaillen) → `#/erfolge/orden`.
5. **Trick-Karten**: „12 von 49“ + die 3 neuesten Mini-Karten → `#/erfolge/karten`.
6. **Shop**: Guthaben „2.340 XP verfügbar“ + günstigster noch nicht gekaufter Artikel → `#/erfolge/shop`.
7. **Statistik**: Zeile „Statistik – Woche, Kategorien, Verlauf, Fehler“ → `#/fortschritt`.
- iPad ≥ 1024 px: zweispaltig (Spielerkarte + Quests links, Rest rechts), ohne waagerechtes Scrollen.

**Unterseiten** `#/erfolge/liga|orden|karten|shop`: statt der Segment-Leiste **„‹ Erfolge“** (`backLink`) und eigener Large Title je Bereich; Inhalte unverändert.

**Statistik** `#/fortschritt` (`src/views/progress.ts`): Kopf wird „‹ Erfolge“ + Large Title **„Statistik“**; die Einstiegszeile „Erfolge“ (`achievementsRow`) dort entfernen; Rest unverändert.

**Profil**: Die Spielerkarte bleibt zusätzlich oben im Profil (sie ist das Profil). Ihr Link führt weiter zu `#/erfolge`.

**Dateien**: `src/views/achievements.ts`, `src/views/achievements-overview.ts` (neu, falls übersichtlicher), `src/views/progress.ts` (nur Kopf + Zeile), `src/views/profile-card.ts` (Option für das Link-Ziel), `public/css/views/achievements.css`, i18n `rewards`.

**Tests** `tests/v11-erfolge.test.ts`: DOM-freie Zusammenstellung der Übersicht (z. B. zuletzt verdiente Orden, neueste Karten, günstigster Artikel).

**Abnahme**: Telefon: Erfolge-Tab zeigt Übersicht, jeder Abschnitt führt zur richtigen Unterseite, „‹ Erfolge“ zurück; Statistik mit „‹ Erfolge“; frisches Profil (alles leer) sieht sinnvoll aus („Noch keine Orden – deine erste perfekte Runde bringt einen“); iPad quer zweispaltig.

## 4. Paket H – Heute

`src/views/home.ts`, `src/views/home-data.ts`, i18n `home`:
- **Kacheln (Telefon)**: Daily · Quests · **Mini-Case** (→ `#/case`) · Gemischt · Kategorien (Sheet) · Weitere Modi (Sheet: Kettenrechnen, Paralleles Kettenrechnen, Schätzen, Eigenes Training – **ohne** Mini-Case). Sechs Kacheln, drei Reihen.
- **Einstufungstest**: keine eigene Kachel mehr. Für neue Nutzer (noch kein Test, Schwierigkeit Auto, **0 Versuche**) ist der Test die Empfehlung im Hero (Titel „Einstufungstest“, Grund „Finde in 2 Minuten deine Startstufe“, Knopf „Test starten“ → `#/einstufung`). Mit ersten Versuchen, aber ohne Test: Eintrag „Einstufungstest“ oben im Sheet „Weitere Modi“. (Weiterhin auch unter Profil → Training.)
- iPad-Abschnitte (Kategorien, Weitere Modi) unverändert, Mini-Case steht dort schon.
- **Heute ohne Scrollen** auf 375×667 und 390×844 bleibt Pflicht (mit Status, Nächstes Ziel, Hero, 6 Kacheln).

**Tests** `tests/v11-home.test.ts`: Hero-Auswahl (Einstufung nur bei 0 Versuchen, sonst Empfehlung), Kachelliste (Reihenfolge, Mini-Case vorhanden, Einstufung nicht mehr als Kachel).

## 5. Paket T – Rundgang, Einführung, Texte, Hinweis (Phase 2)

Läuft **nach** dem Merge von N, E, H auf dem integrierten Stand.
- **Rundgang** (`src/features/tour-scripts.ts`, `src/features/tour-demo.ts`): Kapitel an die neue Struktur anpassen (Tabs Heute/Lernen/Erfolge/Wettkampf, Profil über das Emblem `.account-button`, Erfolge-Übersicht, Quests, Shop kurz zeigen). `tests/tour.test.ts` grün. Hinweis: `npm run preview:record` (App-Store-Videos) braucht Xcode – im Bericht vermerken, dass der Product Owner die Aufnahmen erneuern muss.
- **Einführung** (`src/features/onboarding.ts`, `src/ui/onboarding.ts`, i18n `onboarding`): Schritte Willkommen · Heute · Lernen · **Erfolge** · Wettkampf · **Profil (oben rechts)** · Einstufung.
- **Wegangaben** in allen Texten de/en (i18n, `scripts/pages.ts` Hilfe-Seite, `README.md`): „Fortschritt → Erfolge“ → „Erfolge“, „Fortschritt“ (Statistik) → „Erfolge → Statistik“, „Profil → …“ bleibt sinngemäß, wo nötig mit „(Emblem oben rechts)“. Alte Release Notes in `src/releases.ts` **nicht** ändern (Historie).
- **Einmaliger Hinweis nach dem Update** (nur Bestandsnutzer, geräte-lokal `localStorage` `mm.navHint.v11`): ruhiger Toast/Coach-Mark am Emblem: „Neu sortiert: Profil und Einstellungen findest du jetzt hinter deinem Liga-Emblem oben rechts. Fortschritt heißt jetzt Erfolge.“ mit „OK“; auf dem iPad am Seitenleisten-Eintrag „Profil“.
- **Tests**: `tests/v11-texts.test.ts` – kein UI-Text (de/en, außer Release-Historie) nennt noch einen Tab „Fortschritt“ oder „Profil“-Tab-Weg, der nicht mehr existiert (Muster-Suche), Onboarding-Schritte passen zu `TabId`.

## 6. Integration (Hauptsession)

1. Phase 1 mergen (N → E → H), Konflikte als Vereinigung lösen (erwartet: i18n-Indizes/`common`, `public/css/app.css`, evtl. `src/views/profile-card.ts`), Prüfungen + Playwright-Durchlauf (alle vier Tabs, Emblem → Profil → Schließen, Erfolge-Übersicht und Unterseiten, Statistik, Heute ohne Scrollen, iPad).
2. Phase 2: Paket T, mergen, prüfen.
3. Release Notes **2.3.0** (de/en) mit kurzer Erklärung der neuen Sortierung, Version, CHANGELOG, `tests/releases.test.ts`.
4. PR nach `develop` (nach Rückfrage), nach grüner CI mergen.
