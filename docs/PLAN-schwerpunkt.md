# Plan – Schwerpunkt: Schule oder Case Interviews

Stand: 2026-11-12 · Basis: `develop` @ 2.4.0 · Ziel-Version **2.5.0** (Phase 1)

Wunsch des Product Owners (2026-11-12): Beim Start soll man angeben können, **wofür** man die App nutzt bzw. **in welchem Alter** man ist: **Kind/Schule** oder **Consulting**. Die App stellt danach **Kategorien und Schwierigkeit** passend vor. Heute ist die App ganz auf Case Interviews ausgelegt (Business, Exhibits, CAGR, Pro-Kopf in Mrd.). Ein Kind, das das 1×1 üben will, muss sich die Kategorien selbst zusammenklicken. Die tägliche Challenge und die Liga bleiben trotzdem auf Consulting-Niveau.

---

## 0. Kurzfassung

| Entscheidung | Inhalt |
|---|---|
| **Was gewählt wird** | **Schwerpunkt** (`audience`) in zwei Stufen: erst *wofür* (Schule · Case Interviews · Einfach fit im Kopf), bei Schule dann die *Klassenstufe* (Grundschule · Klasse 5–7 · Klasse 8–10). Gespeichert wird ein Wert: `primary` · `lower` · `middle` · `consulting` · `general`, oder `null` = nicht gewählt. |
| **Was er bewirkt** | 1. **Kategorien-Preset**: schreibt `enabledCategories` einmalig bei der Wahl. Danach frei änderbar wie heute. <br>2. **Aufgabentyp-Filter** innerhalb der Kategorien, z. B. Prozente ohne „Prozentpunkte“ in Klasse 5–7. Wird zur Laufzeit aus dem Schwerpunkt abgeleitet und nicht gespeichert.<br>3. **Startstufe ohne Test**: Vorgabe-θ für die Treppe, solange kein Einstufungstest gemacht ist.<br>4. **Einstufungstest** startet auf einer passenden Sprosse.<br>5. **Oberfläche**: Mini-Case-Kachel und gewertete Daily nur, wo sie passen. |
| **Bestandsnutzer** | `audience: null` verhält sich **exakt wie heute**: alle Kategorien, kein Filter, kein Vorgabe-θ. `null` ist also **nicht** dasselbe wie `consulting`. |
| **Wo man wählt** | Erster Start: neuer Dialog **„Wofür übst du?“** vor der Begrüßung. Später: Profil → Training → **„Schwerpunkt“**, mit Rückfrage, ob das Preset übernommen wird. |
| **Sync** | `audience` wird synchronisiert (Teil des Settings-Dokuments, LWW). **Keine SQL-Änderung** in Phase 1. |
| **Wettkampf** | Phase 1: Gewertete Daily, Liga, Duell und Rennen bleiben **unverändert und global**. Schul-Schwerpunkte spielen stattdessen eine **lokale Schul-Daily**, die nicht gewertet wird. Phase 2 (optional): eigene Daily und Liga-Spur „Schule“ auf dem Server. |
| **Inhaltslücke** | **Plus/Minus fehlt** in der App. Für die Grundschule ist das zentral. Phase 3: neue Kategorie `add`, die nicht in die Liga-Wertung zählt (siehe §8). |
| **Kinder & Datenschutz** | Der Schwerpunkt ist **keine Altersangabe** und keine Altersprüfung. Die App geht **nicht** in die App-Store-Kategorie „Kids“. Für Schul-Schwerpunkte sind KI-Erklärungen und öffentliche Namen standardmäßig aus. Die rechtliche Prüfung steht noch aus, siehe §7. |

---

## 1. Ausgangslage (was es schon gibt)

| Baustein | Datei | Für das Feature wichtig |
|---|---|---|
| `enabledCategories` | `src/core/catalog.ts` (`activeCategories`, `mixCategories`), Sheet in `src/views/settings.ts` (`categoriesRow`) | Filtert nur **ganze Kategorien**. Innerhalb einer Kategorie zieht `subtypesOf()` alle Typen gleich verteilt (`src/core/generators/index.ts:52`). |
| Schwierigkeit `auto` | `src/core/adaptive.ts` (Treppe, `BASIS`, `TIER`, `startStep`) | Die Startstufe hängt an θ (0–6). Ohne θ startet alles auf „Leicht“. |
| Einstufungstest | `src/core/placement.ts` (`RUNGS`, `START_RUNG = 2`), `src/views/placement.ts` | Die Leiter reicht von 1×1 bis 2×2 und Prozent-Veränderung. Die Startsprosse ist fest. |
| Erster Start | `src/app.ts:40,79` → `showWelcome()` in `src/ui/onboarding.ts` → Rundgang (`features/tour.ts`) → `showTourEnd` (Test/Konto) | Hier hängt sich der neue Dialog davor. |
| Home | `src/views/home.ts`, `src/views/home-data.ts` (`heroKind`, Kacheln `PHONE_TILES`) | Die Daily-Kachel führt zur **gewerteten** Challenge (`#/challenge/<id>`). Dazu kommt die Mini-Case-Kachel `#/case`. |
| Gewertete Daily | `src/core/challenge.ts` (`DAILY_CONFIG`: 15 Aufgaben, Stufe 2, alle Kategorien), `server/challenge.ts`, `sql/006_challenges.sql` | Sie ist für alle gleich. `ChallengeConfig` kann Kategorien und Stufe schon einschränken. |
| Lokale Daily | `src/core/daily.ts` (`dailyTasks(dateKey)`) | Wird auch von Duell-Links genutzt (`src/core/duel-link.ts:138`). Die Signatur darf sich daher nicht stillschweigend ändern. |
| Liga | `src/core/league.ts` (`RANKED_SUBTYPE_IDS` = **alle** sichtbaren Typen, ungeübt = 0), `sql/007_league.sql` | Ein Kind, das nur 1×1 übt, bleibt dauerhaft in Bronze. |
| Settings-Sync | `src/data/sync-schema.ts` (`DEVICE_LOCAL_SETTINGS`), `sql/002_training_data.sql` (`user_documents`, Name `settings`) | Settings sind ein JSON-Dokument. Ein neues Feld braucht kein SQL. |

---

## 2. Die Schwerpunkte (Entwurf – Listen sind Stellschrauben)

Die Listen leben an **einer Stelle** (`src/core/audience.ts`). Sie werden zur Laufzeit gelesen und nicht in die Settings kopiert, außer dem Kategorien-Preset. So lassen sie sich später ohne Migration nachschärfen.

| Schwerpunkt | `id` | Kategorien-Preset | Typ-Filter (nur diese Typen der Kategorie) | θ ohne Test | Test-Startsprosse | Höchste Stufe |
|---|---|---|---|---|---|---|
| **Grundschule** (Kl. 2–4) | `primary` | table, mult, div, tricks | mult: `2x1`, `easy` · div: `exact` · tricks: `x11`, `subround` | 1 | 1 | 2 (1×1: 3) |
| **Klasse 5–7** | `lower` | table, mult, div, big, pct, frac, est, tricks | mult: `2x1`, `easy`, `square` · div: `exact`, `decimal` · big: `mult`, `div` · pct: `of`, `change` · est: `mult`, `div` · tricks: `x11`, `square5`, `subround`, `near100` | 2 | 2 | – |
| **Klasse 8–10** | `middle` | wie 5–7 + growth, units, mag | pct: `of`, `change`, `reverse`, `chain` · growth: `compound`, `rule72` · units: `convert` · mag: `exponent`, `product`, `ratio` | 3 | 2 | – |
| **Case Interviews** | `consulting` | alle (wie heute) | – | 3 | 3 | – |
| **Einfach fit im Kopf** | `general` | alle außer biz, exhibit | – | – (Leicht) | 2 | – |
| *nicht gewählt* | `null` | – (bleibt, wie es ist) | – | – | 2 | – |

Regeln:
- **Filterregel**: Ein Typ ist im Pool, wenn seine Kategorie aktiv ist **und** der Schwerpunkt für diese Kategorie entweder keine Liste hat oder den Typ enthält. Schaltet ein Kind selbst „Business“ ein, bekommt es **alle** Business-Typen, denn die eigene Wahl gewinnt. Es kann also nie eine leere Kategorie entstehen.
- **Höchste Stufe** (nur `primary`): `levelFor()` (`src/core/scoring.ts:96`) begrenzt auf 2. Das kleine 1×1 ist ausgenommen. Gilt für „Auto“ und für feste Stufen.
- **θ ohne Test** ist nur eine Vorgabe: `setPlacement(settings.placement?.theta ?? defaultTheta(audience))`. `settings.placement` bleibt allein das echte Testergebnis.
- Die Werte für `consulting` (θ 3 → 1×1 auf „Schwer“, 2×1 auf „Mittel“, Rest „Leicht“) sind eine Annahme. Die Treppe korrigiert ohnehin nach 3 Treffern bzw. 2 Fehlern.

---

## 3. Datenmodell

`src/types.ts`:
```ts
export type Audience = 'primary' | 'lower' | 'middle' | 'consulting' | 'general';
// in Settings:
/** Schwerpunkt (docs/PLAN-schwerpunkt.md); null = nicht gewählt → Verhalten wie vor 2.5.0. Synchronisiert. */
audience: Audience | null;
```
- `DEFAULT_SETTINGS.audience = null`, dazu `normalizeAudience()` in `src/data/schema.ts`: Unbekanntes wird `null`.
- **Nicht** in `DEVICE_LOCAL_SETTINGS`. Wer am iPad „Schule“ wählt, hat das auch am Handy.
- Alte Clients behalten das Feld (`normalizeSettings` übernimmt unbekannte Schlüssel per Spread) und laden es weiter hoch. Sie werten es nur nicht aus. Das ist unkritisch.
- Export/Import (`src/data/transfer.ts`) übernimmt das Feld automatisch über `normalizeSettings`. Ein Test sichert das ab.

---

## 4. Kern `src/core/audience.ts` (DOM-frei, getestet)

```ts
export const AUDIENCES: readonly Audience[] = ['primary', 'lower', 'middle', 'consulting', 'general'];
export interface AudienceSpec {
  categories: readonly CategoryId[] | null;           // Preset für enabledCategories (null = alle)
  subtypes: Partial<Record<CategoryId, readonly SubtypeId[]>>; // Typ-Filter je Kategorie
  theta: number | null;                                // Vorgabe ohne Einstufungstest
  testStartRung: number;                               // 1–6
  maxLevel: Level | null;                              // Deckel (null = keiner)
  surfaces: { case: boolean; rankedDaily: boolean; ai: boolean };
}
export const AUDIENCE_SPECS: Readonly<Record<Audience, AudienceSpec>>;
export function specOf(a: Audience | null): AudienceSpec;     // null → „wie heute“
export function presetFor(a: Audience): Pick<Settings, 'enabledCategories'>;
export function defaultTheta(a: Audience | null): number | null;

/** Pool aus Settings: aktive Kategorien + Typ-Filter. Ersetzt das lose `enabledCategories`-Argument. */
export interface Pool { categories: CategoryId[] | null; audience: Audience | null }
export function poolOf(s: Pick<Settings, 'enabledCategories' | 'audience'>): Pool;
export function poolSubtypes(cat: CategoryId, pool: Pool): SubtypeId[];   // Filterregel aus §2
export function inPool(id: SubtypeId, pool: Pool): boolean;
```

**Einbau** (überall, wo heute `enabledCategories` durchgereicht wird, kommt stattdessen `pool` an; Liste aus `grep -rn enabledCategories src`):

| Stelle | Änderung |
|---|---|
| `src/core/generators/index.ts` `generateForMode` | `subtypesOf(cat)` → `poolSubtypes(cat, pool)` (neue Option `pool`, ohne Option bleibt es wie heute) |
| `src/core/scoring.ts` `weaknesses`, `levelFor` | Filter über `inPool`. `levelFor` bekommt den Deckel `maxLevel`. |
| `src/views/home-data.ts` Empfehlung, `typicalTargetMs` | Pool statt Kategorien |
| `src/views/train/index.ts` (Warm-up, Schwächen, `levelFor`) | Pool |
| `src/views/progress-data.ts`, `src/views/progress.ts` | Pool. Die Statistik zeigt weiterhin alle **geübten** Typen. |
| `src/features/quests.ts`, `src/features/reminder-input.ts`, `src/core/reminder-messages.ts`, `src/core/comeback.ts` | Pool |
| `src/views/lernen.ts` | Sortierung/Filter über den Pool. Alle Methoden bleiben über die Suche erreichbar. |
| `src/core/placement.ts` | `placementState(answers, start = START_RUNG)`, Start aus `specOf(audience).testStartRung` |
| `src/app.ts:34-35` | `setPlacement(placement?.theta ?? defaultTheta(audience))` |

**Nicht** gefiltert, weil die Aufgaben für alle gleich sein müssen: `src/core/challenge.ts`, `src/core/duel-link.ts`, `src/core/race.ts`, `dailyTasks()`.

---

## 5. Oberfläche

### 5.1 Erster Start
Neuer Dialog **vor** `showWelcome()` (`src/ui/onboarding.ts`, gleiche `openModal`-/Dialog-Mechanik):

1. **„Wofür übst du?“**: drei große Auswahlkarten mit Icon, Titel und einer Zeile:
   - **Schule** – „1×1, Brüche, Prozente – passend zur Klasse“
   - **Case Interviews** – „Business, Exhibits, Schätzen unter Zeitdruck“
   - **Einfach fit im Kopf** – „Gemischtes Training für jeden Tag“
   - Klein darunter: „Später wählen“ (`audience` bleibt `null`, weiter wie heute).
2. Nur bei **Schule**: **„Welche Klasse?“** mit Grundschule (2–4) · Klasse 5–7 · Klasse 8–10. Zurück ist möglich.
3. Danach Preset anwenden (`setSettings({ audience, ...presetFor(audience), difficulty: 'auto' })`), dann weiter mit `showWelcome()` wie bisher. Rundgang, Test-Angebot und Konto bleiben unverändert.

- Esc oder ein Tipp daneben gelten als „Später wählen“, dann folgt die Begrüßung. Solange die Begrüßung nicht abgeschlossen ist (`onboardingDone`), erscheint die Auswahl beim nächsten Start wieder, sonst nicht.
- Der Einstufungstest am Ende startet auf der Sprosse des Schwerpunkts (§2).

### 5.2 Profil → Training → „Schwerpunkt“
- Neue Zeile über „Schwierigkeit“: Icon `target`, Wert z. B. „Klasse 5–7“ oder „Nicht gewählt“. Sie öffnet ein Sheet mit derselben Auswahl wie 5.1, beide Stufen in einem Sheet.
- Bei einem Wechsel fragt ein Modal: **„Kategorien an *Klasse 5–7* anpassen?“** mit [Anpassen] / [Nur Schwerpunkt]. „Anpassen“ schreibt `enabledCategories`. Der Verlauf und die Treppenstände bleiben unberührt.
- Das Kategorien-Sheet (`categoriesRow`) zeigt bei aktivem Typ-Filter je Kategorie einen Hinweis, z. B. „Für Klasse 5–7: 2 von 5 Typen“. In Phase 1 lässt sich das nicht einzeln abwählen (offene Frage F3).

### 5.3 Heute
- **Mini-Case-Kachel** (`case`) nur bei `surfaces.case`, also bei `consulting`, `general` und `null`. Bei Schul-Schwerpunkten nimmt eine Kachel **„Kleines 1×1“** (Drill) ihren Platz ein. Damit bleibt das Raster mit drei Reihen à zwei Kacheln erhalten.
- **Daily-Kachel** bei Schul-Schwerpunkten: lokale **Schul-Daily** (`#/train/daily`) statt der gewerteten Challenge. Der Untertitel lautet „15 Aufgaben · für deine Klasse“ statt „Rangliste“. Die gewertete Daily bleibt im Wettkampf-Tab erreichbar, dort mit dem Hinweis „für Fortgeschrittene“.
- Die Schul-Daily ist `dailyTasksFor(dateKey, audience)` in `src/core/daily.ts`: Seed `daily:<audience>:<datum>`, Kategorien und Typen aus dem Spec, Stufe 1 (primary) bzw. 2. **`dailyTasks(dateKey)` bleibt unverändert** (Duell-Links). Ein Duell aus der Schul-Daily wird als normales Duell mit Konfiguration verschickt, nicht als `kind: 'daily'`.

### 5.4 Texte
- i18n-Namensraum **`audience`** (de/en), dazu Einträge in `settings`, `home` und `onboarding`.
- Tonfall bei Schul-Schwerpunkten unverändert. Die App duzt bereits und ist neutral. Consulting-Wörter wie „Case“ und „Interview“ tauchen in den Schul-Pfaden nicht auf. Die Typnamen sind schon neutral, die Lernbereich-Beispiele sind Consulting-lastig (→ F5).

---

## 6. Was sich (in Phase 1) nicht ändert

- Gewertete Daily, Wettbewerbe, Gruppen, Duell, Raketen-Rennen: Kategorien und Stufe sind dort Teil der Konfiguration und für alle gleich.
- **Liga**: Die Wertung zählt weiter über alle Typen. Das ist bekannt und unschön für Schul-Schwerpunkte (Bronze-Falle). Die Lösung kommt in Phase 2 (§9). Übergangsweise **blendet Phase 1 das Liga-Emblem für Schul-Schwerpunkte nicht aus**. Das kann sich nach F2 noch ändern.
- Statistik, Schwächen-Diagnose, Leitner-Wiederholungen: arbeiten auf dem Verlauf. Nur Empfehlungen und Runden ziehen aus dem Pool.

---

## 7. Kinder & Datenschutz (vor dem Release zu prüfen)

Der Schwerpunkt **„Schule“ richtet die App an Kinder**. Das hat Folgen, die der PO bzw. eine rechtliche Prüfung klären muss. Hier steht kein Rechtsrat.

- **Keine App-Store-Kategorie „Kids“**: Deren Regeln betreffen Analytics, externe Links und Käufe hinter einer Eltern-Sperre. Die App bleibt eine allgemeine Lern-App, in der man auch Schulstoff wählen kann.
- **Konto und Sync**: Einwilligungsgrenzen für Online-Dienste (DSGVO Art. 8; in Deutschland 16 Jahre) betreffen das Konto. Vorschlag: Bei Schul-Schwerpunkten steht im Konto-Sheet der Hinweis „Unter 16? Frag deine Eltern, bevor du ein Konto anlegst.“ Ohne Konto funktioniert alles wie bisher.
- **KI-Erklärungen** (Google Gemini): Bei Schul-Schwerpunkten **standardmäßig aus** (`surfaces.ai = false`), in den Einstellungen einschaltbar. Die Nutzungsbedingungen des Anbieters zu Minderjährigen sind zu prüfen.
- **Öffentliche Namen** (Ranglisten, Gruppen, Duell-Name): keine Änderung in Phase 1. Bei Schul-Schwerpunkten wird die gewertete Daily aber nicht mehr auf Home beworben (§5.3).

---

## 8. Inhaltslücke: Plus und Minus (Phase 3)

In der Grundschule geht es vor allem um **Addition und Subtraktion** (Zahlenraum 100 / 1.000, mit Übertrag). Die App hat dafür nur `tricks.subround`. Ohne diese Kategorie ist `primary` dünn: 1×1, 2×1 und glatt teilen.

- Neue Kategorie **`add`** („Plus & Minus“) mit den Typen `add.sum`, `add.diff`, `add.complement` (Ergänzen auf 100/1.000), je Stufe größerer Zahlenraum. Dazu kommen Generatoren, Lösungswege, Lernen-Methoden, i18n (de/en), `TIER` 0–1 und `BASIS` (`add.diff` → `add.sum`).
- **Vorsicht Liga**: `RANKED_SUBTYPE_IDS` enthält alle sichtbaren Typen, und ungeübt zählt 0. Eine neue Kategorie würde **die Wertung aller Bestandsnutzer senken**. `add` muss deshalb ausdrücklich aus der Wertung ausgenommen werden (`ranked: false` am `Category`-Typ).
- Preset `primary` bekommt `add` vorne. `lower` bekommt nur `add.complement`.

---

## 9. Phase 2 (optional): Wettkampf-Spur „Schule“

Nur, falls Schul-Nutzer tatsächlich kommen (siehe F2).
- **Daily je Spur**: IDs `daily-school-YYYY-MM-DD`. Dafür müssen in `sql/009_tracks.sql` der Check auf `challenges.id` und `kind = 'daily'` erweitert werden, dazu `ensureDaily(ctx, day, track)` in `server/challenge.ts` und eine `ChallengeConfig` aus dem Spec (Stufe 1, Schul-Kategorien). Die Rangliste ist je Spur getrennt.
- **Liga je Spur**: `league_scores.track`. Die Wertung läuft über `RANKED_SUBTYPE_IDS ∩ Pool der Spur`. Die Champion-Ränge gelten je Spur.
- Danach führt die Home-Kachel bei Schul-Schwerpunkten wieder zur **gewerteten** Schul-Daily.

---

## 10. Pakete & Reihenfolge

| Paket | Inhalt | Abhängig von |
|---|---|---|
| **S1** | Kern: `Audience`-Typ, `normalizeAudience`, `src/core/audience.ts`, `Pool` statt `enabledCategories` an allen Stellen aus §4, Deckel in `levelFor`, Startsprosse im Test, `defaultTheta` in `app.ts`. **Keine UI.** | – |
| **S2** | Auswahl-Dialog beim ersten Start (§5.1), Zeile und Sheet „Schwerpunkt“ im Profil (§5.2), i18n `audience` | S1 |
| **S3** | Home: Kacheln und Schul-Daily (`dailyTasksFor`), KI-Schalter-Vorgabe, Konto-Hinweis, Lernen-Sortierung, Release Notes | S1 (parallel zu S2) |
| **S4** *(Phase 3)* | Kategorie `add` inklusive Ausnahme aus der Liga-Wertung | S1 |
| **S5** *(Phase 2)* | Wettkampf-Spur „Schule“ (SQL 009, Server, Rangliste) | S1–S3, Entscheidung F2 |

Leitplanken wie in PLAN-v11 §1: Tests in `tests/v13-audience-*.test.ts`, CSS in `public/css/views/audience.css` (nur falls die Auswahlkarten neue Stile brauchen; sonst `kit`-Bausteine), Commit-Zeilen mit Paketkürzel.

---

## 11. Tests (Mindestumfang)

- `normalizeAudience`: gültige Werte, Unbekanntes → `null`, fehlendes Feld → `null`. Ein Round-Trip über Export/Import und den Settings-Merge behält das Feld.
- `poolSubtypes`/`inPool`: Filterregel aus §2, besonders eine selbst eingeschaltete Kategorie ohne Liste → alle Typen, und niemals ein leerer Pool.
- `null` ≡ heute: Für `audience: null` liefern `generateForMode`, `weaknesses`, Empfehlung und `levelFor` dasselbe wie vor der Änderung (Snapshot mit festem Seed).
- `levelFor` mit Deckel: `primary` → höchstens 2, 1×1 ausgenommen. Feste Stufe 3 wird zu 2.
- `placementState(answers, start)`: Start auf 1 und 3, und die bisherigen Tests mit Standardstart bleiben grün.
- `dailyTasksFor`: deterministisch, nur Typen aus dem Spec, `dailyTasks()` unverändert.
- `heroKind`/Kacheln: Mini-Case nur bei passenden Schwerpunkten, das Raster bleibt bei 3 × 2.
- E2E (Playwright, Telefon): Erster Start → Schule → Klasse 5–7 → Begrüßung → Home zeigt die Schul-Daily und keine Mini-Case-Kachel. Danach Profil → Schwerpunkt → Case Interviews → „Anpassen“ → alle Kategorien aktiv.

---

## 12. Offene Fragen an den PO

| # | Frage | Vorschlag |
|---|---|---|
| **F1** | Reichen drei Klassenstufen, oder soll es eine echte **Altersangabe** sein (Jahrgang/Alter)? | Klassenstufen. Sie beschreiben den Stoff besser als das Alter, und es ist kein personenbezogenes Datum. |
| **F2** | Sollen Schul-Nutzer **gegeneinander** antreten (eigene Rangliste und Liga, Phase 2), oder reicht lokales Üben? | Erst Phase 1 ausliefern. Die App misst heute keine Nutzung, also kommt die Rückmeldung aus Feedback und App-Store-Bewertungen. |
| **F3** | Soll man einzelne **Aufgabentypen** selbst an- und abwählen können (nicht nur Kategorien)? | Nicht in Phase 1. Der Typ-Filter kommt aus dem Schwerpunkt. Falls gewünscht, wird später ein Feld `enabledSubtypes` daraus. |
| **F4** | „Einfach fit im Kopf“ als dritte Option, oder nur Schule und Consulting? | Behalten. Sonst landen Erwachsene ohne Case-Bezug bei Business und Exhibits. |
| **F5** | Brauchen Schul-Schwerpunkte **eigene Beispiele** im Lernbereich (z. B. Taschengeld statt Umsatz)? | Später. Zuerst nur die Sortierung. Eigene Texte sind viel Arbeit (de und en). |
| **F6** | Rechtliche Prüfung aus §7 (Konto unter 16, KI bei Minderjährigen): wer macht sie, und blockiert sie 2.5.0? | Phase 1 so bauen, dass sie auch ohne die Prüfung vertretbar ist: KI standardmäßig aus, Konto-Hinweis, keine Kids-Kategorie. |
