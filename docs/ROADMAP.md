# Roadmap – nach 1.15.0

Stand: 2026-11-02. Es geht um drei Dinge.
1. Die App auf iPad und Mac bringen.
2. Das Lernstand-Modell als eigenes Paket weiterentwickeln, mit Messungen statt Bauchgefühl.
3. Die nächsten Funktionen und technischen Anpassungen.

Leitplanken aus [PLAN-v5.md](PLAN-v5.md), [PLAN-v8.md](PLAN-v8.md) und [DESIGN-MOBILE-FIRST.md](DESIGN-MOBILE-FIRST.md) gelten weiter. Dazu gehören strict TS, DOM nur über `h()`, kein `innerHTML`, eine strikte CSP und Tauglichkeit ab 320 px. Plattform-Unterschiede gehören nur nach `src/platform/`.

## 0. Kurzfassung

| Wann | Was | Status |
|---|---|---|
| jetzt | iPad und Mac aus demselben Binary (Xcode-Projekt, Ausrichtungen, Schutz-Test) | ✅ erledigt (Branch `claude/ecstatic-feynman-yvfbb7`) |
| jetzt | Lernstand-Modell als Paket `packages/learning-engine`, App unverändert im Verhalten | ✅ erledigt |
| jetzt | Labor: Simulation, Replay echter Exporte, Tuning, Qualitäts-Schranken | ✅ erledigt |
| 1.16 | Release „iPad & Mac“: Store-Screenshots, Gerätetests, Release Notes | offen (Checkliste §1.2) |
| 1.17 | Genauere Schwächen (E1–E3) + Einstufungstest (F1) | offen, im Labor vorbereitet |
| 1.18 | Interview-Plan (F2/F3) + Vorhersage-Modell (E4) + Vergessen (E5) | offen |
| später | Zweispaltige Layouts, Widgets, Mac Catalyst, weitere Sprachen | Ideen |

---

## 1. iPad und Mac

### 1.1 Umgesetzt

- **Ein Binary für iPhone, iPad und Mac.** `TARGETED_DEVICE_FAMILY = "1,2"` macht die App zu einer echten iPad-App, nicht mehr nur hochskaliert. `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = YES` lässt dieselbe App auf Apple-Silicon-Macs laufen („Designed for iPad“). `SUPPORTS_MACCATALYST = NO` bleibt vorerst so, siehe §1.4.
- **Ausrichtungen.** Das iPhone bleibt im Hochformat. Auf dem iPad gehen alle vier Ausrichtungen (`UISupportedInterfaceOrientations~ipad`). Das ist Voraussetzung für Split View und Stage Manager und für ein frei skalierbares Fenster auf dem Mac.
- **Schutz-Test.** `tests/ios-devices.test.ts` schlägt fehl, wenn Xcode beim Öffnen das iPad, die Mac-Option oder die Ausrichtungen verliert.
- **Kein neuer Web-Code nötig.**
  - Die Oberfläche hat ab 768 px schon die Seitenleiste mit zentriertem Inhalt (E23), darunter das Telefon-Layout.
  - Das Tastenfeld folgt `pointer: coarse`: Auf dem iPad gibt es das Bildschirm-Tastenfeld, auf dem Mac die Eingabe per Tastatur.
  - Geprüft per Screenshot bei 375 × 1032 (Split View ⅓), 744 × 1133 (iPad mini), 1180 × 820 (iPad 11″ quer), 1376 × 1032 (iPad 13″ quer) und 1280 × 800 (Mac-Fenster). Bei keiner Größe scrollt die Seite waagrecht.
- **Native Teile sind iPad-tauglich.**
  - Der Bewertungsdialog nutzt die aktive `UIWindowScene`.
  - Passkeys verankern sich am Fenster der WebView.
  - Das App-Icon ist ein universelles 1024er-Icon.

### 1.2 Checkliste vor dem ersten Release mit iPad (1.16)

- [ ] **Store-Screenshots iPad 13″** (2064 × 2752 hoch oder 2752 × 2064 quer). Sie sind Pflicht, sobald das Binary das iPad unterstützt. Simulator „iPad Pro 13-inch (M4)“: Heute, Training, Fortschritt, Lernen.
- [ ] **App Store Connect → Preise und Verfügbarkeit → „iPhone- und iPad-Apps auf Apple-Silicon-Macs“** prüfen. Die Option muss aktiv sein, damit die App im Mac App Store erscheint.
- [ ] **Gerätetests.** Am iPad: Simulator und, wenn möglich, ein echtes Gerät. Am Mac: in Xcode das Ziel „My Mac (Designed for iPad)“.
  - [ ] Passkey anlegen und anmelden, auf dem iPad und auf dem Mac (Associated Domain `webcredentials:`)
  - [ ] Lokale Erinnerungen auf dem Mac (Berechtigungsdialog, Zustellung bei geschlossener App)
  - [ ] Teilen-Menü auf dem iPad: Ergebniskarte und Export. Das Popover muss verankert sein, sonst stürzt iPadOS ab.
  - [ ] In-App-Browser (Hilfe, Datenschutz) auf dem Mac
  - [ ] Ein externes Keyboard am iPad: Tippen, Enter und Esc im Training, solange das Bildschirm-Tastenfeld sichtbar ist
  - [ ] Stage Manager und Split View ⅓ bis ½ beim Drehen während einer Runde (Fokus-Modus, Sheets)
  - [ ] Apple Pencil (Scribble) im Antwortfeld, wenn das Tastenfeld aus ist
- [ ] **Release Notes** in `src/releases.ts` (de/en), Version 1.16.0 in `package.json`. Der Upload startet dann automatisch (`ios.yml`).
- [ ] **App-Beschreibung** um iPad und Mac ergänzen; die Seite `/hilfe` ebenso.

### 1.3 Verbesserungen für große Bildschirme und Tastatur

| # | Idee | Nutzen | Aufwand |
|---|---|---|---|
| G1 | **Zweispaltig ab ~1024 px**: Fortschritt (Diagramme nebeneinander), Lernen (Liste links, Methode rechts), Profil (Reiter links, Inhalt rechts) | Auf iPad quer und auf dem Mac bleibt heute viel Fläche leer | M |
| G2 | **Tastatur zuerst**: sichtbare Kurzbefehle (Enter prüfen, Esc beenden, H = „Wie geht das?“, S = „Weiß nicht“), Übersicht mit `?` | Mac und iPad mit Keyboard deutlich schneller | S |
| G3 | **Hardware-Tastatur erkennen**: Nach dem ersten physischen Tastendruck blendet sich das Bildschirm-Tastenfeld für die Runde aus. Tippen bleibt möglich. | iPad mit Magic Keyboard | S |
| G4 | **Geräteart in der Plattform-Schicht**: `deviceKind(): 'phone' \| 'tablet' \| 'mac' \| 'web'` (nativ über `userInterfaceIdiom` und `isiOSAppOnMac`). Damit lässt sich z. B. die Haptik-Einstellung auf iPad und Mac ausblenden. | Keine wirkungslosen Schalter | S |
| G5 | **Größere Typo im Fokus-Modus** auf dem iPad (Aufgabe, Tastenfeld bis 480 px breit) | Ablesbarkeit auf Armlänge | S |
| G6 | **Mehrere Fenster** (`UIApplicationSupportsMultipleScenes`) | Gering. Riskant, weil zwei WebViews dieselbe IndexedDB schreiben. Vorerst nicht. | L |

### 1.4 Mac: Optionen

| Weg | Heute | Plus | Minus |
|---|---|---|---|
| **iPad-App auf Apple Silicon** („Designed for iPad“) | ✅ aktiv | Kein Zusatzaufwand, gleiches Binary, gleiche Store-Seite, Passkeys und Erinnerungen wie auf dem iPad | Nur Apple Silicon. Menüleiste und Fenster verhalten sich nur wie auf dem Mac üblich, soweit iPadOS das bietet. |
| **Web-App im Dock** (Safari 17+, „Zum Dock hinzufügen“) | ✅ funktioniert schon (PWA, Web Push) | Auch auf Intel-Macs, ohne Store | Keine Store-Präsenz; Passkeys laufen über das Web statt nativ |
| **Mac Catalyst** (`SUPPORTS_MACCATALYST = YES`) | – | Intel-Macs, echte Menüleiste, Fenstergrößen, Mac-Look | Capacitor unterstützt Catalyst nicht offiziell. Jedes Plugin (Browser, Haptics, StatusBar …) muss dafür bauen. Zusätzlich ein eigenes Testziel. |

**Empfehlung:** Bei „Designed for iPad“ bleiben, bis Nutzer Intel-Macs oder Mac-Menüs vermissen. Danach einen Spike machen: Catalyst in einem Branch einschalten, in CI bauen und die Bau- und Plugin-Fehler sammeln. Erst danach entscheiden.

---

## 2. Lernstand-Modell (`packages/learning-engine`)

### 2.1 Umgesetzt

- **Paket.** Skill, Schwächen-Diagnose, adaptive Stufe, Leitner-Wiederholung, Empfehlung und Runden-Erkenntnis sind DOM-freie Funktionen ohne Abhängigkeiten. Alle Schwellen stehen in `EngineConfig`. `DEFAULT_CONFIG` entspricht exakt dem bisherigen Verhalten, die bestehenden App-Tests laufen unverändert durch.
- **Schnitt.** Die App bewertet eine einzelne Antwort (`evaluate`, hängt am Aufgabenformat). Das Paket modelliert die lernende Person aus den bewerteten Antworten. Namen, Texte und Katalog bringt die App mit.
- **Labor (`learning-engine/lab`)**, damit das Modell „getrennt trainiert und getestet“ werden kann:
  - *Simulation mit bekannter Wahrheit:* Lernende mit eingepflanzten Schwächen (ungenau, langsam, Nullen), wahlweise mit Lernen und Vergessen
  - *Replay echter Daten:* Export der App einlesen und messen, wie gut ein Modell die nächste Antwort vorhersagt (Brier, Log-Loss, AUC, Kalibrierung), mit Zeit-Split für faires Anpassen
  - *Tuning:* Raster-Suche über `EngineConfig`
  - *Qualitäts-Schranken* als Tests, reproduzierbar per Seed
- **Bedienung:** `npm run lab` (Simulation), `npm run lab -- tune`, `npm run lab -- replay export.json`. Details im [README des Pakets](../packages/learning-engine/README.md).

### 2.2 Was das Labor über das heutige Modell sagt

Simulation: 24 Aufgabentypen, 3 eingepflanzte Schwächen je Person, Standard-Konfiguration. Die Zahlen hängen an den Annahmen des Simulators und sind mit echten Exporten gegenzuprüfen (Replay).

1. **Viele Fehlalarme.** Nach Ø 15 Antworten je Typ liegt die Precision bei 57 %, der Recall bei 84 %. Hauptursache: Der Score kennt die Stufe nicht. Ein starker Typ steigt auf Stufe 3, dort sinkt die Genauigkeit, er gilt als schwach, fällt zurück und erholt sich. Er pendelt also. Dazu kommt das Rauschen kleiner Fenster.
2. **Nullen-Fehler fallen durchs Raster.** Nur 56–59 % der eingepflanzten Nullen-Schwächen werden gefunden. Die Diagnose „nullen“ greift erst, wenn der Score ohnehin unter 85 liegt. Wer zu 82 % richtig rechnet, aber regelmäßig die Größenordnung verfehlt, bleibt unbemerkt. Gerade das ist im Case Interview fatal.
3. **Das Fenster-Modell ist überkonfident.** Bei 25 von 25 richtig gibt es fast 100 % aus. Im Replay sagt ein einfaches Elo-Modell die nächste Antwort besser voraus: auf 3000 simulierten Antworten AUC 0,71 gegen 0,68, kleinerer Log-Loss. Mit Stufe als Faktor wird es nochmals besser.
4. **Empfehlungen wirken.** Nach 21 Tagen sind noch so viele der anfangs schwachen Typen unter Score 85: 34 % beim Folgen der Empfehlungen, 18 % mit dem Modus „Schwächen trainieren“, 80 % bei rein gemischtem Üben. Der Schwächen-Modus baut Schwächen am schnellsten ab, gemischtes Üben hält dafür den Gesamtstand.
5. **Die Schwellen sind nicht das Problem.** Das Tuning findet in der Nähe der Standardwerte kaum Besseres (F1 0,669 → 0,674 mit `window: 40`). Verbesserungen müssen aus dem Modell kommen, nicht aus anderen Zahlen.

### 2.3 Fahrplan Modell

Jeder Schritt läuft gleich ab.
1. Die Variante im Labor bauen.
2. Sie mit dem heutigen Modell vergleichen, in der Simulation und im Replay eigener Exporte.
3. Die Schranken in `tests/lab.test.ts` anheben.
4. Erst dann die App umstellen, mit einer Release Note.

| # | Änderung | Erwartete Wirkung (Labor-Kennzahl) | Aufwand |
|---|---|---|---|
| E1 | **Stufen-bereinigter Score**: Richtige Antworten auf Stufe 3 zählen mehr, Fehler auf Stufe 3 weniger. Alternativ Genauigkeit je Stufe. | Precision ↑, kein Pendeln der Stufe | S |
| E2 | **Unsicherheit statt Punktwert**: Beta-Verteilung je Typ. Schwäche nur, wenn P(wahrer Score < 85) > 80 %. In der UI „noch unsicher“ zeigen. | Precision ↑ bei wenig Daten, ehrlichere Anzeige | M |
| E3 | **Nullen-Muster als eigenes Signal**: unabhängig vom Score, z. B. ≥ 2 Nullen-Fehler in den letzten 10 Antworten → Hinweis „Größenordnung prüfen“, eigene Übung | Recall „nullen“ von ~58 % auf > 85 % | S |
| E4 | **Elo/IRT als Kern**: Können je Typ plus Schwierigkeit je Stufe ergibt P(richtig). Daraus ergibt sich die adaptive Stufe so, dass etwa 75 % Erfolg herauskommen („wünschenswerte Schwierigkeit“). | Bessere Vorhersage (Log-Loss, AUC), passendere Aufgaben | M |
| E5 | **Vergessen modellieren**: Halbwertszeit je Typ statt Leitner nur nach Fehlern. Auch gemeisterte Typen kommen wieder, bevor sie verblassen. | Weniger Rückfälle; im Simulator mit `forgetPerDay` messbar | M |
| E6 | **Einstufung beim Start**: eine kurze Runde mit je 1–2 Aufgaben pro Kategorie. Heute erkundet die Empfehlung nur einen neuen Typ pro Runde. | Schwächen früher bekannt. Hypothese, im Labor als neue Strategie prüfbar | S |
| E7 | **Priorität nach Interview-Relevanz**: Gewicht je Kategorie im Katalog (z. B. Prozente, Wachstum und Exhibits hoch, 1×1 niedrig) | Empfehlungen näher an dem, was im Interview zählt | S |
| E8 | **Tempo relativ zur eigenen Basis**: Log-Zeit je Typ und Stufe; „langsam“ heißt langsamer als bei ähnlichen Typen | Weniger „langsam“-Diagnosen bei generell langsamen Personen | M |
| E9 | **Daten zum Trainieren**: Der Replay eigener Exporte geht schon (lokal, ohne Server). Mehr Daten gäbe es nur mit einer Opt-in-Freigabe anonymer Antworten. Dafür wären Datenschutzerklärung und App-Store-Angaben anzupassen, Entscheidung siehe §5. | Parameter an echten Nutzern statt am Simulator | L |

---

## 3. Funktionen

| # | Idee | Nutzen | Aufwand | Hängt an |
|---|---|---|---|---|
| F1 | **Einstufungstest im Onboarding** (3–4 min), danach ein Profil „Stärken/Schwächen“ | Schneller Einstieg, sofort sinnvolle Empfehlungen | S | E6 |
| F2 | **Interview-Termin und Plan**: Datum eingeben → Tagesplan bis dahin (Schwächen, Wiederholungen, Abdeckung aller Kategorien); Erinnerungen folgen dem Plan | Klares Ziel für die Kernzielgruppe | M | E4, E5 |
| F3 | **Bereitschaft je Kategorie** („interviewfest“ ab Score X mit Sicherheit Y) statt nur Skill-Zahlen | Verständliche Rückmeldung, motiviert gezielt | S | E2 |
| F4 | **Case-Ketten**: mehrstufige Aufgaben wie im Interview (Marktgröße → Anteil → Umsatz → Wachstum), Zwischenergebnisse laut mitdenken | Näher an der echten Situation als Einzelaufgaben | M | – |
| F5 | **Mehr Exhibits**: gestapelte Balken, Wasserfall, Tabellen mit Ablenkern, „Was ist die wichtigste Aussage?“ | Exhibits sind im Interview häufig und hier noch schmal | M | – |
| F6 | **Home-Screen-Widget** (Serie, Tagesziel, fällige Wiederholungen) | Sichtbarkeit → Regelmäßigkeit | L (WidgetKit-Extension, App Group als geteilter Speicher) | – |
| F7 | **Kurzbefehle/Siri** („Starte die Daily Challenge“), Deep Links `mentalmath://train/daily` | Schneller Einstieg auf iPhone, iPad und Mac | S–M | – |
| F8 | **Barrierefreiheit**: VoiceOver-Durchgang (Fokus-Modus, Feedback-Sheet), Dynamic Type auf iPad prüfen | Qualität, Store-Bewertung | S | – |
| F9 | **Weitere Sprachen** (z. B. Französisch, Spanisch) – i18n ist vorbereitet | Größere Zielgruppe (Consulting ist international) | M je Sprache | – |
| F10 | **Lerngruppen/Rangliste** (Daily Challenge im Vergleich) | Motivation | L, berührt Datenschutz | Konto |

---

## 4. Technische Anpassungen

| # | Was | Warum |
|---|---|---|
| T1 | **Lockfile bestätigen**: einmal `npm install` lokal laufen lassen und committen, falls sich `package-lock.json` ändert. | Der Eintrag für `learning-engine` wurde ohne Netzzugang von Hand ergänzt (nur die zwei Workspace-Einträge). |
| T2 | **Typprüfung der Pakete in CI**: `npm run typecheck --workspaces` in `typecheck` aufnehmen | Heute prüft CI nur `src` der Pakete (über den Build), nicht deren Tests und Skripte |
| T3 | **TypeScript 6 vorbereiten**: Mit tsc 6.0 meldet `src/views/train/feedback.ts` einen Fehler (`hidden` ist dort `boolean \| 'until-found'`). | Vor einem Update von `typescript` beheben |
| T4 | **iOS-CI**: zusätzlich ein Build für „iPad Pro 13-inch“ im Simulator mit kurzem UI-Smoke-Test (Start, Training, Fortschritt) | iPad-Regressionen früh sehen |
| T5 | **Engine-Diagnose in der App** (nur Entwickler, z. B. `#/debug/model`): Replay auf den eigenen Daten im Browser, lädt `learning-engine/lab` dynamisch | Modell-Änderungen am eigenen Verlauf prüfen, ohne Export |
| T6 | **`evaluate` beobachten**: Die Erkennung von Nullen- und Knapp-Fehlern liegt in der App. Zieht E3 an, kann die Fehlerklassifikation als `classifyAnswer(expected, candidates, tolerance)` ins Paket wandern; die Kandidaten (Einheiten, %) bleiben App-Sache. | Saubere Grenze, falls das Modell feinere Fehlerarten braucht |

---

## 5. Offene Entscheidungen

1. **Mac:** Reicht „Designed for iPad“, oder sollen Intel-Macs und eine echte Menüleiste her (Catalyst-Spike, §1.4)?
2. **Trainingsdaten:** Bleibt es beim lokalen Replay eigener Exporte, oder soll es eine Opt-in-Freigabe anonymer Antworten geben (E9)? Das zweite bedeutet Datenschutzerklärung, App-Store-Angaben und Speicher auf dem Server.
3. **Release-Schnitt:** 1.16 nur „iPad & Mac“ (empfohlen, klein und gut testbar), Modell-Änderungen erst ab 1.17.
4. **Interview-Termin (F2):** gewünscht? Davon hängt ab, wie weit E4/E5 vorgezogen werden.
