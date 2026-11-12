# Plan v10 – Motivation: XP-Shop, Comeback, sichtbarer Fortschritt, Quests & Truhen

Stand: 2026-11-11 · **umgesetzt in 2.2.0** (Pakete P, C, F, Q) · Basis war `develop` @ `152a88e` (2.1.0)

Wunsch des Product Owners (2026-11-11): „XP bekommt einen Sinn“, „Comeback und Serie reparieren“, „sichtbarer Fortschritt“, „Tagesquests und Wochentruhen“. Keine Freundesliste, ruhiges Design bleibt.

> **Nachtrag 2.3.0 (Wirtschaft neu abgestimmt):** Die Preise und Belohnungen unten waren zu günstig – Sammler hatten nach wenigen Tagen alles. Neu: Freeze 6.000; Themes 40.000 / 60.000 / 90.000; Rahmen 30.000 / 75.000 / 150.000; Quests 300 / 600 / 1.000 XP; Truhen 2.000–3.000 / 5.000–7.000 (+ Freeze, sonst +3.000) / 10.000–15.000 (+ Rahmen, sonst +5.000); Comeback +1.000; Serien-Reparatur 12.000 XP. Ziel: alle Sammelobjekte für fleißige Spieler in rund 7 Wochen, für gelegentliche in mehreren Monaten; ein Freeze kostet etwa einen Spieltag. Werte in `src/core/shop.ts`, `src/core/quests.ts`, `src/core/comeback.ts`.

| Paket | Inhalt | Modell |
|---|---|---|
| **P** | XP-Shop: Freezes, neue Themes, Emblem-Rahmen; Guthaben überall sichtbar | sonnet |
| **C** | Comeback (Willkommen zurück, Aufwärmrunde, Bonus) und Serie reparieren (Runden oder XP) | sonnet |
| **F** | Sichtbarer Fortschritt: „+N LP“ und Liga-Balken auf dem Ergebnis, Level aus dem XP-Konto, „Nächstes Ziel“ auf Heute und Ergebnis | haiku |
| **Q** | Tagesquests (3 pro Tag) und Wochentruhe (Bronze/Silber/Gold) | sonnet |

Alle vier laufen **parallel** (je eigener Worktree) auf dem Fundament unten. Danach Integration, Release Notes 2.2.0, PR nach `develop`.

---

## 0. Fundament (schon umgesetzt, nicht umbauen – nur benutzen)

| Baustein | Datei | Was |
|---|---|---|
| Einstellungen | `src/types.ts`, `src/data/schema.ts` | Neue synchronisierte Felder (alle normalisiert, Defaults): `xp` (XP-Konto), `purchases` (Artikel-ID → ts), `frame` (gewählter Rahmen, '' = keiner), `freezesBought` (ts[]), `streakRepairs` (Tage), `comebackDays` (Tage), `questLog` (Tag → `{ picks, done }`), `chests` (Montag → Stufe 1–3), `lpSeen` (Wertung der letzten Auswertung, −1 = unbekannt). **Keine weiteren Einstellungsfelder anlegen** – wenn eins fehlt, im Bericht melden. |
| XP-Konto | `src/core/xp.ts`, `src/features/xp.ts` | `xpView()` → `{ lifetime, balance, level, into, needed, ledger }`; `grantXp(n)` (Quests, Truhen, Comeback), `spendXp(n): boolean` (Shop, Reparatur), `syncXp()`. Level kommt aus **lifetime** (alle je verdienten XP inkl. Geschenke), Ausgeben senkt das Level nie. Zuwachs der Aufgaben-XP wird aufsummiert – Level/Guthaben sinken nicht mehr, wenn das Speicherlimit (5.000 Versuche) alte Versuche entfernt. |
| Serie | `src/core/habit.ts`, `src/features/habit.ts` | `habitInfo({ …, boughtFreezes, repairedDays })`: gekaufte/gewonnene Freezes zählen ab ihrem Tag (Vorrat höchstens `MAX_FREEZES` = 2), reparierte Tage gelten als überbrückt. Neu im Ergebnis: `repairedDays`, `broken: { day, lost } | null` (Serie **gestern** gerissen). `currentHabit(now?)` liest alles aus dem Speicher – in Views immer das benutzen. |
| Belohnungs-Hooks | `src/features/rewards.ts`, `src/core/rewards.ts`, `src/ui/rewards.ts` | `addRewardHook(id, (ctx) => ExtraRewardLine[] | void)`. Läuft in `updateProgressRewards()` nach jeder Runde (`ctx.trigger === 'round'`) und beim Start (`'start'`, `ctx.silent === true`: still gutschreiben, nichts anzeigen). `ctx.ratingBefore` (−1 = unbekannt), `ctx.rating`, `ctx.tier`, `ctx.events`. Zeile: `{ id, order, icon, label, sub?, href?, tone: 'good' | 'quiet' }` – erscheint auf **allen** Ergebnis-Bildschirmen (Training, Mini-Case, Kette, Parallel), höchstens 4 Zeilen insgesamt, Rest „+N weitere“. Reihenfolge der Erweiterungen über `order`: Reparatur 0, Comeback 5, Quests 10, Truhe 15. |

Hooks werden einmal beim Start angemeldet: Jedes Paket exportiert `registerXyzHooks()` und ruft es in `src/app.ts` direkt nach dem Import von `startProgressRewards` auf (eine Zeile mit Kommentar `// v10 <Paket>`), **vor** `startProgressRewards()`.

---

## 1. Leitplanken (wie PLAN-v9 §1, verbindlich)

- Strict TS, `.ts`-Imports, `import type`, kein `any`, DOM nur über `h()`, kein `innerHTML`, keine Inline-Styles außer `style.setProperty('--x', …)`, Theme-Tokens statt Farben, 320 px tauglich, iPad-Layouts (≥ 720 px) mitdenken, `prefers-reduced-motion` respektieren, große Schrift (`--type-scale` 1,3, Klasse `is-large-text`) nicht brechen.
- **Ruhiges Design**: Belohnungen als klare Zeilen, Balken, Embleme. Keine Endlos-Animationen, kein Ton, Konfetti nur mit `settings.confetti`. Keine Dark Patterns: kein Echtgeld, keine Countdown-Panik, keine Verlustangst-Texte („Deine Serie stirbt!“) – freundlich und sachlich.
- **Texte** de **und** en, eigener i18n-Namensraum je Paket (Datei `src/i18n/locales/{de,en}/<ns>.ts` + Eintrag in beiden `index.ts`): P `shop`, C `comeback`, F `goals`, Q `quests`.
- **CSS** in einer neuen Datei je Paket `public/css/views/<ns>.css`, eingebunden in `public/css/app.css` (eine `@import`-Zeile), außer kleine Ergänzungen bestehender Dateien mit Kommentar `/* v10 <Paket> */`.
- **Dateibesitz**: nur die beim Paket genannten Dateien ändern. Gemeinsame Stellen (`src/app.ts`, `src/views/home.ts`, `src/router.ts`, `src/core/modes.ts`, i18n-Indizes, `public/css/app.css`) nur **anhängen bzw. lokal einfügen** mit Kommentar `// v10 <Paket>`. Das Fundament nur benutzen; ist dort ein Fehler, minimal korrigieren und im Bericht nennen.
- **Daten**: keine neuen Einstellungsfelder, keine neuen Sync-Dokumente, kein SQL, keine Server-Änderung. Alles läuft im Client.
- **Nicht anfassen**: `package.json` (Version), `src/releases.ts`, `CHANGELOG.md`, `README.md`, `ios/`, `.github/`, `sql/`, `server/`.
- **Tests** in neuen Dateien `tests/v10-<thema>.test.ts`; DOM-freie Logik in `src/core/…`. Bestehende Tests nur bei bewusster Verhaltensänderung anpassen und im Bericht nennen.
- **Prüfen** vor dem Commit: `npm ci --no-audit --no-fund` (einmal), `npm run typecheck`, `npm test`, `npm run build` – alle grün. Playwright (vorinstalliert, `require('playwright')`, `chromium.launch()` ohne Optionen) gegen `python3 -m http.server <PORT> -d dist` mit eigenem Port (P 5201, C 5202, F 5203, Q 5204), frisches `launchPersistentContext`-Profil je Szenario (Service Worker), Willkommen-Dialog mit „Selbst entdecken“ wegklicken. Viewports 390×844 und 375×667 (`isMobile`, `hasTouch`, `locale: 'de-DE'`), 1180×820, hell und dunkel, einmal `en-US`. Keine `pageerror`, `scrollWidth ≤ innerWidth`; **Heute ohne senkrechtes Scrollen** auf beiden Telefon-Größen bei Textgröße 1 (Ausnahme: wenn eine Comeback-/Reparatur-Karte sichtbar ist, darf Heute scrollen). Screenshots ansehen und Gefundenes beheben. Daten säen: Import-Datei über die App (`src/data/transfer.ts`, `tests/fixtures`) oder `page.evaluate`. Training spielen: `#/train/mult.2x1?n=5`, Aufgabe in `.train-q`, Tasten `.numpad-key[data-key="7"]`, Komma `[aria-label="Komma"]`, Prüfen `.numpad-check`; richtige Antworten gehen nach ~0,7 s automatisch weiter, falsche brauchen „Weiter“. Scratch-Dateien nur in `/tmp/claude-0/-home-user-Mental-Math/9784dfef-b9e0-5a86-b4f1-590ca907cb57/scratchpad/v10-<paket>/`. Server danach beenden.
- **Commit** im Worktree, deutsche konventionelle Nachricht, mit den Zeilen
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CvA9TXwPmWzXPznvLd6X4C
  ```
  Nicht pushen. **Bericht**: Branch/Worktree, Commit, Dateien, Testzahlen, geänderte bestehende Tests, geprüfte Screenshots, offene Punkte.

---

## 2. Paket P – XP bekommt einen Sinn (Shop)

**Kern** `src/core/shop.ts` (DOM-frei, getestet):
```ts
export type ShopKind = 'freeze' | 'theme' | 'frame';
export interface ShopItem { id: string; kind: ShopKind; price: number | null /* null = nur aus Truhen */; nameKey: string; descKey: string }
export const SHOP_ITEMS: readonly ShopItem[];
export function canBuy(item, o: { balance: number; owned: boolean; freezes: number }): { ok: boolean; reason?: 'owned' | 'balance' | 'max' | 'notForSale' };
```
| ID | Art | Preis (XP) | Regel |
|---|---|---|---|
| `freeze` | Streak-Freeze | 1.500 | mehrfach kaufbar, nur wenn der Vorrat (`currentHabit().freezes`) < `MAX_FREEZES`; Kauf: `spendXp` + Zeitpunkt an `freezesBought` anhängen |
| `theme:sunset` | Theme „Abendrot“ (dunkel, warm) | 4.000 | einmalig, danach im Theme-Picker wählbar |
| `theme:sand` | Theme „Sand“ (hell, warm) | 6.000 | einmalig |
| `theme:ocean` | Theme „Tiefsee“ (dunkel, kühl) | 8.000 | einmalig |
| `frame:silver` | Emblem-Rahmen Silber | 3.000 | einmalig, wählbar |
| `frame:gold` | Emblem-Rahmen Gold | 6.000 | einmalig, wählbar |
| `frame:diamond` | Emblem-Rahmen Diamant | 12.000 | einmalig, wählbar |
| `frame:chest` | Emblem-Rahmen „Truhe“ | – | nur aus der Gold-Truhe (Paket Q setzt `purchases['frame:chest']`), im Shop sichtbar als „aus der Gold-Truhe“ |

(Ein Training mit 5 Aufgaben bringt etwa 300–700 XP; ein Freeze ≈ 3 Runden.)

**Themes**: `ThemeSetting`/`Theme` (`src/types.ts`) um `sunset`, `sand`, `ocean` erweitern, `THEME_SETTINGS`/`normalizeTheme` (`src/data/schema.ts`), Token-Sätze in `public/css/tokens.css` im Stil der vorhandenen (alle Tokens inkl. Atmosphäre und `--league-*`/`--rarity-*`; Kontrast Text ≥ 4,5 : 1, `tests/theme.test.ts` beachten), `src/ui/theme.ts` (Meta-Farbe). Theme-Picker (Profil → Darstellung & Feedback, `src/views/settings.ts`): nicht gekaufte Themes mit Schloss und Preis, Antippen → `#/erfolge/shop`. Ein gewähltes, aber nicht besessenes Theme (z. B. durch Import) fällt in der Anzeige auf `system` zurück.

**Rahmen**: `leagueEmblem` (`src/ui/league-badge.ts`) bekommt optional `frame?: string` → Ring/Glanz um das Emblem (SVG/CSS, ruhig, kein Endlos-Effekt). Angezeigt auf der Spielerkarte (`src/views/profile-card.ts`) und im Liga-Hero von `#/erfolge`. Auswahl im Shop („Benutzen“), `settings.frame`.

**Shop-Seite**: neuer Tab **„Shop“** in `#/erfolge` (`src/views/achievements.ts`, Route `#/erfolge/shop`): oben Guthaben („2.340 XP verfügbar“, darunter klein „Insgesamt verdient: 41.200 XP · Level 12“), dann Gruppen Freezes · Themes · Rahmen als Karten mit Vorschau (Theme-Farbfelder, Rahmen am eigenen Emblem), Preis, Knopf „Kaufen“ (Bestätigungsdialog „Für 4.000 XP kaufen?“), „Benutzen“/„Aktiv“. Zu teuer: Knopf aus, „Noch 660 XP“. Nach dem Kauf Toast und sofortige Anzeige.

**Guthaben überall**: Spielerkarte (Level aus `xpView()` statt `xpInfo`, Zeile „2.340 XP verfügbar“ → Shop), Fortschritt → Überblick Level-Zeile (`src/views/progress.ts`) aus `xpView()`. (Die Level-Karte im Ergebnis gehört Paket F.)

**Dateien**: `src/core/shop.ts`, `src/features/shop.ts`, `src/views/achievements.ts`, `src/ui/league-badge.ts`, `src/views/profile-card.ts`, `src/views/profile-card-data.ts`, `src/views/progress.ts` (nur Level-Zeile), `src/views/settings.ts` (nur Theme-Picker), `src/types.ts` + `src/data/schema.ts` (nur Theme-Liste), `src/ui/theme.ts`, `public/css/tokens.css`, `public/css/views/shop.css`, i18n `shop` (+ Theme-Namen dort), `src/router.ts` falls nötig.

**Tests** `tests/v10-shop.test.ts`: Preise/Regeln (`canBuy` für alle Gründe), Kauf zieht genau den Preis ab, Freeze nur unter dem Maximum, Theme-Normalisierung kennt die neuen Themes, Kontrast der neuen Token-Sätze (falls der Theme-Test das nicht schon prüft).

**Abnahme**: frisches Profil mit gesätem XP (z. B. Import mit vielen Versuchen) → Shop zeigt Guthaben; Freeze kaufen → Guthaben sinkt, Spielerkarte zeigt Freezes 1; Theme kaufen und aktivieren (Screenshot je neues Theme: Heute, Training, Ergebnis); Rahmen kaufen und benutzen (Spielerkarte, Erfolge); zu teuer → deaktiviert mit „Noch … XP“.

---

## 3. Paket C – Comeback und Serie reparieren

**Kern** `src/core/comeback.ts` (DOM-frei, getestet):
```ts
export const COMEBACK_MIN_DAYS = 3;   // so lange weg (letzter aktiver Tag vor heute ≤ heute − 3)
export const COMEBACK_XP = 300;
export const REPAIR_ROUNDS = 3;       // Runden heute insgesamt (1 hält heute, 2 reparieren gestern)
export const REPAIR_XP = 2000;        // oder so viele XP einsetzen
export const REPAIR_MIN_STREAK = 3;   // nur Serien ab 3 Tagen
export const REPAIR_COOLDOWN_DAYS = 30; // höchstens eine Reparatur in 30 Tagen
export function comebackState(o: { sessions; activity; now; claimedDays: readonly string[] }): { away: number; eligible: boolean; claimedToday: boolean };
export function repairOffer(o: { habit: HabitInfo; repairs: readonly string[]; now }): { day: string; lost: number; roundsDone: number; roundsNeeded: number; xpCost: number } | null;
```
- `away` = Tage seit dem letzten aktiven Tag **vor heute** (Runde oder ≥ 5 aktive Minuten wie in `habit.ts`); `eligible` = Historie vorhanden, `away ≥ COMEBACK_MIN_DAYS`, heute noch nicht gutgeschrieben.
- `repairOffer` nur wenn `habit.broken` (gestern gerissen), `lost ≥ REPAIR_MIN_STREAK`, letzte Reparatur älter als 30 Tage, Tag noch nicht repariert.

**Heute** (`src/views/home.ts`, eine Karte **über** der Empfehlung, nur wenn zutreffend; Reparatur hat Vorrang):
- Reparatur: „Deine Serie von 12 Tagen ist gestern gerissen. Hol sie dir heute zurück: 3 Runden spielen (1/3) oder 2.000 XP einsetzen.“ Knöpfe „Runde spielen“ (Empfehlung) und „Mit XP reparieren“ (nur bei genug Guthaben, Bestätigung) → `spendXp(REPAIR_XP)` + Tag an `streakRepairs` → Toast „Serie repariert – 13 in Folge“, neu zeichnen.
- Comeback: „Schön, dass du wieder da bist! Du warst 5 Tage weg. Eine leichte Aufwärmrunde bringt +300 XP Comeback-Bonus.“ Knopf „Aufwärmen“.
- Ton freundlich, ohne Vorwurf. Mit Karte darf Heute auf dem Telefon scrollen.

**Aufwärmrunde**: neuer Modus `warmup` (`src/core/modes.ts` SPECIAL + `core.mode.warmup`), 5 Aufgaben aus den 3 stärksten geübten Subtypen (höchster Skill), je eine Stufe leichter (mindestens Leicht), ohne Zeitdruck-Anzeige (wie `calm`). Aufgaben über `sessionStorage` an `#/train/warmup` (Muster `retry`) oder Erzeugung in `src/views/train/index.ts` – zählt als normale Runde (Session).

**Hook** `registerComebackHooks()` (`src/features/comeback.ts`), nur bei `trigger === 'round'` (beim Start nichts):
- Comeback: war der Nutzer vor dieser Runde ≥ 3 Tage weg und heute noch nicht gutgeschrieben → `grantXp(COMEBACK_XP)`, Tag an `comebackDays` → Zeile (order 5, Ton good, Icon `sparkles`): „Willkommen zurück · +300 XP Comeback-Bonus“. „Vor dieser Runde“ heißt: aktive Tage ohne heute.
- Reparatur durch Runden: `repairOffer` vorhanden und heute ≥ `REPAIR_ROUNDS` Runden → Tag an `streakRepairs` → Zeile (order 0, good, Icon `flame`): „Serie repariert · 13 in Folge“.
- Silent → still gutschreiben, keine Zeile.

**Dateien**: `src/core/comeback.ts`, `src/features/comeback.ts`, `src/views/home.ts` (Karte), `src/core/modes.ts`, `src/views/train/index.ts` (+ ggf. `src/router.ts`), `src/app.ts` (Hook-Anmeldung), `public/css/views/comeback.css`, i18n `comeback` (+ `core.mode.warmup` in `core.ts`).

**Tests** `tests/v10-comeback.test.ts`: `away`-Berechnung (heute zählt nicht, Altbestand-Minuten zählen), eligible nur einmal pro Tag, `repairOffer` (Schwelle, Cooldown, schon repariert, nichts gerissen), Aufwärm-Auswahl (stärkste Subtypen, eine Stufe leichter).

**Abnahme**: gesäte Historie „letzte Runde vor 5 Tagen“ → Comeback-Karte, Aufwärmrunde spielen → Ergebnis mit „+300 XP Comeback-Bonus“, Karte weg. Gesäte Serie 12 Tage bis vorgestern → Reparatur-Karte (1/3 nach einer Runde), nach Runde 3 Zeile „Serie repariert“ und Serie 13; zweites Szenario Reparatur mit XP.

---

## 4. Paket F – Sichtbarer Fortschritt

**Rundenbilanz** (`src/core/recap.ts`, `src/views/train/result.ts` – Paket F besitzt diesen Bereich):
- **Level-Karte aus dem XP-Konto**: nach der Runde `xpView()` (enthält diese Runde schon), vorher = nachher − `ctx.points`; Level-up aus `levelOf()`.
- **Liga-Zeile** neu in der Bilanz-Karte unter Skill und Level: Emblem klein, „Gold II · +14 LP“ (Ton good) bzw. „−3 LP“ (gedämpft) bzw. ohne Zahl bei 0, Balken „412 / 450 LP bis Gold III“ (Meister: „Meister · 812 LP“). Werte: `leagueRating(attemptsBefore)` und `leagueRating(attemptsAfter)` (`src/core/league.ts`), Stufen aus `tierInfo`.
- **Nächstes Ziel** als letzte Zeile der Bilanz (siehe unten).

**Nächstes Ziel** `src/core/next-goal.ts` (DOM-frei, getestet):
```ts
export interface NextGoal { kind: 'league' | 'badge' | 'card' | 'level' | 'goal'; label: string; sub?: string; href: string; progress: number /* 0..1 */; remaining: number }
export function nextGoals(input: { rating; tier; badges (aktuelle Stufen + Werte über badgeProgress); cardSkills: Array<{ id; score }>; xp: { into; needed; level }; habit: { todayRounds; goalRounds } }, max = 2): NextGoal[];
```
- Kandidaten: nächste Liga-Stufe (LP fehlen), nächste Orden-Stufe je Orden (`badgeProgress`), Trick-Karten mit Skill ≥ 50 und < 70 („Skill 62/70“), nächstes Level, heutiges Tagesziel (wenn nicht erreicht).
- Auswahl: größter Fortschritt (`progress`) zuerst, aber > 0 und < 1; bei Gleichstand Reihenfolge goal, badge, card, league, level. Texte konkret: „Noch 2 perfekte Runden bis Fehlerfrei Silber“, „Noch 36 LP bis Gold I“, „Noch 8 Skill bis zur Trick-Karte × 25“, „Noch 2 Runden bis zum Tagesziel“.
- **Heute**: eine Zeile direkt unter der Status-Zeile (`src/views/home.ts`, `today-head`): Symbol + Text + dünner Balken, antippbar (`href`). Telefon ohne Scrollen bleibt Pflicht – die Zeile ist einzeilig, bei Platzmangel kürzt sie mit Ellipse.
- **Ergebnis**: letzte Zeile der Bilanz „Nächstes Ziel: …“.

**Dateien**: `src/core/next-goal.ts`, `src/core/recap.ts`, `src/views/train/result.ts` (nur Bilanz), `src/views/home.ts` (nur die Zeile im Kopf), `public/css/views/goals.css` (+ ggf. `train.css` mit Kommentar), i18n `goals`.

**Tests** `tests/v10-next-goal.test.ts` (Auswahl, Texte, Grenzen 0/1, Meister ohne nächste Liga), Recap-Erweiterung (LP-Delta, Level aus dem Konto inkl. Geschenk-XP) in `tests/v10-recap-lp.test.ts`.

**Abnahme**: Runde spielen → Bilanz mit „+N LP“-Zeile, Level-Karte stimmt mit Spielerkarte überein; Heute zeigt „Nächstes Ziel“ und bleibt ohne Scrollen (375×667 und 390×844).

---

## 5. Paket Q – Tagesquests und Wochentruhe

**Kern** `src/core/quests.ts` (DOM-frei, getestet):
- Pool (mindestens 14 Quests), je mit `id` (Parameter in der ID, z. B. `weak:pct.change`, `cat:frac`), Schwierigkeit 1–3, XP **100 / 200 / 300**, Verfügbarkeit und Fortschritt `{ value, target }` aus den **heutigen** Daten:

  | Stufe | Beispiele |
  |---|---|
  | 1 (leicht) | eine Runde spielen · 10 richtige Antworten · die Daily spielen · eine Runde Kettenrechnen · eine Runde in `<Kategorie>` (Kategorie reihum) |
  | 2 (mittel) | 2 Runden · eine Runde mit ≥ 90 % · 10 Aufgaben unter Zielzeit · einen Mini-Case lösen · 5 richtige in deiner Schwäche `<Subtyp>` (nur mit Schwäche) · fällige Wiederholungen erledigen (nur wenn fällig) |
  | 3 (schwer) | eine perfekte Runde (≥ 5 Aufgaben) · Tagesziel erreichen · eine Runde mit 10 Aufgaben ohne Hilfe und ≥ 90 % · 5 Aufgaben in ≤ ⅓ der Zielzeit · einen Mini-Case ohne Fehler |
- `pickQuests(day, ctx)`: je eine Quest pro Stufe, deterministisch aus `mulberry32(seedFromString('quests:' + day))` unter den verfügbaren. **Einmal pro Tag festhalten**: beim ersten Abruf des Tages `questLog[day].picks` speichern; danach immer diese Auswahl (stabil, auch wenn sich Schwächen ändern).
- Woche = Montag–Sonntag (lokal). **Sterne** der Woche = erledigte Quests (`questLog[*].done`) dieser Woche (max. 21). **Truhen** bei 5 / 10 / 15 Sternen: Bronze / Silber / Gold.
- Truhen-Inhalt (deterministisch je Woche und Stufe, leicht variabel): Bronze 300–600 XP; Silber 800–1.200 XP + 1 Freeze (an `freezesBought`, falls Vorrat < 2, sonst +500 XP); Gold 1.500–2.500 XP + Rahmen `frame:chest` (in `purchases`, falls noch nicht vorhanden, sonst +1.000 XP). Inhalt wird beim Öffnen angezeigt (vorher „300–600 XP“ als Spanne – transparent).

**Hook** `registerQuestHooks()` (`src/features/quests.ts`), bei `round` **und** `start` (Start still): erledigte, noch nicht gutgeschriebene Quests → `grantXp(xp)`, ID an `questLog[day].done`; Zeilen (nicht still, order 10, good, Icon `target`): „Quest erledigt: Eine perfekte Runde · +300 XP“; wird dadurch eine Truhe bereit (Sterne erreichen 5/10/15 und Stufe nicht geöffnet) → Zeile (order 15, good, Icon `gift` – falls nicht vorhanden, ergänzen): „Truhe bereit: Silber – jetzt öffnen“ → `#/quests`.

**Oberfläche**:
- **Heute**: Kachel „Quests“ (`src/views/home.ts`, in der Kachelreihe nach der Daily; Telefon und iPad): „1/3 heute“ + Stern-Fortschritt der Woche klein; Akzent, solange offen; → `#/quests`.
- **Seite `#/quests`** (`src/views/quests.ts`, Tab `today`, Router): Liste der 3 Quests mit Balken, XP und „Erledigt“-Haken; „Neue Quests in 5 h 12 min“; Wochenleiste mit Sternen 0–15 und drei Truhen (gesperrt / bereit / geöffnet); „Öffnen“ → ruhige Enthüllung (Deckel/Fade, `prefers-reduced-motion`: sofort) mit Inhalt und „Toll“; Gutschrift sofort.
- **Erfolge** bleibt unverändert (Shop gehört P).

**Dateien**: `src/core/quests.ts`, `src/features/quests.ts`, `src/views/quests.ts`, `src/router.ts`, `src/views/home.ts` (nur Kachel), `src/app.ts` (Hook-Anmeldung), `src/ui/charts.ts` (nur ein Icon `gift`, falls nötig), `public/css/views/quests.css`, i18n `quests`.

**Tests** `tests/v10-quests.test.ts`: Pool vollständig (de/en-Texte), Auswahl je Stufe deterministisch und nur verfügbare, Festhalten über den Tag, Fortschritt jeder Quest an Beispieldaten, Gutschrift genau einmal, Wochengrenzen (Montag, Zeitumstellung), Truhenstufen und Inhalte (Freeze-/Rahmen-Ersatz), kein doppeltes Öffnen.

**Abnahme**: frisches Profil → Heute-Kachel „0/3“; Quest erfüllen (z. B. eine Runde) → Ergebniszeile „Quest erledigt … +100 XP“, Kachel „1/3“; gesätes `questLog` mit 5 erledigten Quests der Woche → Zeile/Seite „Truhe bereit“, Öffnen → XP-Guthaben steigt (Spielerkarte/Shop von P zeigen es nach der Integration).

---

## 6. Integration (Hauptsession)

1. Merge-Reihenfolge P → F → C → Q. Erwartete Konflikte: `src/views/home.ts` (F Kopfzeile, C Karte, Q Kachel), `src/app.ts` (Hook-Zeilen), i18n-Indizes, `public/css/app.css`, `src/router.ts`, `src/core/modes.ts`, ggf. `src/views/train/index.ts` (C) – alle als Vereinigung lösen.
2. Nach jedem Merge `npm run typecheck && npm test`, am Ende `npm run build` + Playwright-Durchlauf: Shop-Kauf → Freeze → Reparatur mit XP; Comeback-Runde; Quests + Truhe; Bilanz mit LP; Heute ohne Scrollen auf 375×667/390×844; iPad; große Schrift.
3. Release Notes **2.2.0** (de/en), Version, CHANGELOG, `tests/releases.test.ts`; PR nach `develop`.

## 7. Später (nicht in 2.2)
- Erinnerungen für Quests/Truhe/Reparatur (Server-Texte in `src/core/reminder-messages.ts`, abwärtskompatibel wie in v9 B).
- Wochenrunde (Ligen-Wettbewerb mit Auf-/Abstieg, braucht Server).
- Anonyme Opt-in-Kennzahlen (Rückkehrquote), um Preise, Quest-Mix und Truhen zu justieren.
