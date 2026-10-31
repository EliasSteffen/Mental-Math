# Design- & Architekturkonzept „Ruhiger Fokus“ (Mobile-First)

Stand: 2026-10-31 · App-Version 1.9.0 · Grundlage: Code-Analyse von `src/`, `public/css/` sowie ein Durchklicken im Browser bei 375 × 812 px.

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) und [PLAN-v8.md](PLAN-v8.md) gelten weiter: strict TS, DOM nur über `h()`/`appendChildren`, kein `innerHTML`, keine Inline-Styles außer `style.setProperty` für CSS-Variablen, strikte CSP (keine externen Fonts/Skripte), 320 px tauglich, alle Texte über `t()`.

---

## 0. Kurzfassung

Die App ist technisch solide: Die Domäne ist DOM-frei und getestet, die Sicherheitsregeln sind konsequent, das Tastenfeld ist daumenfreundlich, Safe-Areas sind berücksichtigt. **Das Problem liegt in der Tonalität und in der Informationsdichte.** Optik und Interaktionen kommen aus der Gaming-Ecke: Neon-Glows, flackernde Flamme, pulsierender Timer, Shake bei Fehlern, Konfetti und auf der Startseite rund 18 gleichrangige Einstiege. Für ein Werkzeug, das Kandidaten **vor einem stressigen Case Interview** nutzen, wirkt das kontraproduktiv.

Fünf Kernentscheidungen:

1. **Ein Bildschirm, eine Absicht.** Die Startseite „Heute“ bietet genau eine primäre Aktion. Alles andere ist sekundär oder liegt eine Ebene tiefer.
2. **Daumen zuerst.** Alle Aktionen liegen im unteren Drittel, im neuen **Action Dock**. Die obere Bildschirmhälfte ist reine Lesefläche. Die Einstellungen wandern vom Zahnrad oben rechts in die Tab-Leiste.
3. **Feedback informiert, statt zu urteilen.** Kein Shake, kein Alarmrot, keine Endlos-Animationen. Richtig und falsch werden ruhig in Salbeigrün und Terrakotta gezeigt; die richtige Antwort erscheint dort, wo der Blick ohnehin ist.
4. **Druck ist Opt-in.** Der Timer hat drei Stufen: *Ruhig* (Standard, ohne Zahlen), *Präzise* (heutiges Verhalten) und *Aus*. Gamification-Elemente bleiben erhalten, werden aber leiser.
5. **Ein Token-System statt gewachsener Werte.** Farben, Abstände, Typografie, Radien, Bewegung und Ebenen kommen aus `tokens.css`. Das CSS wird in Cascade Layers geordnet. Tailwind wird **nicht** eingeführt (Begründung in 4.1).

---

## 1. Codebase-Analyse

### 1.1 Zweck & Kern-Loop

Kopfrechen-Trainer für Consulting-Case-Interviews mit 8 Kategorien und 30 Aufgabentypen. Der Kern-Loop lautet:

```
Empfehlung → Aufgabe → Antwort → Feedback (+ Lösungsweg) → nächste Aufgabe → Rundenergebnis → Analyse/Wiederholung
```

Dazu kommen Lernbereich (Methoden), Daily Challenge, Kettenrechnen, paralleles Kettenrechnen, Schätzmodus, eigenes Training, Leitner-Wiederholungen, Serie/Tagesziel/XP, Passkey-Konto und Sync-Vorbereitung.

**Nutzungskontext:** Das Handy wird kurz zwischendurch genutzt (U-Bahn, Pause, Abend vor dem Interview), meist einhändig, oft unter Anspannung. **Daraus folgt:** Der Weg zur ersten Aufgabe muss kurz sein, die Bedienung muss mit einer Hand gehen, und die Oberfläche muss beruhigen, nicht anheizen.

### 1.2 UI-Architektur heute

| Schicht | Umsetzung | Bewertung |
|---|---|---|
| Rendering | Vanilla TS, `h()` in `src/ui/dom.ts`, Views ersetzen `#app` komplett | ✅ schnell, CSP-sicher, keine Laufzeit-Dependencies |
| Routing | Hash-Router `src/router.ts`, `render()` → `runCleanup` → `replaceChildren` → `scrollTo(0,0)` | ⚠️ jedes `rerender()` springt nach oben (siehe A11) |
| Shell | `index.html`: Topbar (Logo + Zahnrad), `main.container`, schwebende Tab-Leiste mit 3 Tabs; `body.in-play` blendet beide im Training aus | ✅ Fokus-Modus gut · ⚠️ Topbar ohne Nutzen auf Hauptseiten |
| Styles | 5 Dateien, ≈ 920 Zeilen; Tokens nur für Farben/Radien; 3 Themes (Neon, OLED, Pastel) + System | ⚠️ keine Abstands-, Typo-, Motion- oder Z-Index-Tokens |
| Komponenten | `charts.ts` (icon, ring, sparkline, heatmap), `widgets.ts`, `keypad.ts`, `fab.ts`, `modal.ts`, `toast.ts`, `skeleton.ts`, `fx.ts` | ✅ gute Basis, aber ohne Sheet-, Dock- und Transition-Primitive |
| Feedback-Effekte | `fx.ts`: `vibrate(15)` bzw. `[30,40,30]`, Sinus-Beep 880/220 Hz | ⚠️ Fehler-Feedback wirkt strafend; `navigator.vibrate` gibt es in iOS Safari nicht |

### 1.3 Routen-Inventar

| Route | View | Rolle im neuen Konzept |
|---|---|---|
| `#/` | `home.ts` | **Heute** (Tab 1) |
| `#/lernen[/id]` | `lernen.ts` | **Lernen** (Tab 2) |
| `#/analyse` | `analyse.ts` | **Fortschritt** (Tab 3) |
| `#/settings?tab=` | `settings.ts` | **Profil** (Tab 4: Konto, Einstellungen, Daten, Über) |
| `#/train/:mode`, `#/chain`, `#/parallel`, `#/custom` | `train/*`, `chain.ts`, `parallel/*`, `custom.ts` | **Fokus-Modus** (ohne Tab-Leiste, mit Dock) |

---

## 2. UX/UI-Audit

Schwere: 🔴 hoch (Mobile-Nutzung oder Ruhe deutlich beeinträchtigt) · 🟠 mittel · 🟡 niedrig/Hygiene.

### 2.1 Kognitive Last & Tonalität

| # | Befund | Ort | Wirkung | |
|---|---|---|---|---|
| A1 | Startseite: Hero, Serie, XP, Tagesziel, Daily, „Alle Kategorien“ (6 Bento-Kacheln), dazu 4 Schnellstart-Kacheln und 8 Kategorie-Karten, also **≈ 18 gleichrangige Einstiege** | `views/home.ts` | Entscheidungslast (Hick), die Empfehlung geht unter | 🔴 |
| A2 | **16 Glow-Verwendungen** (`--glow-accent`, `--glow-streak`) auf Primär-Buttons, aktivem Tab, Eingabefokus, Toast, Hero und Tastenfeld | `style.css` | visuelle Unruhe, „Gaming“-Anmutung | 🟠 |
| A3 | Endlos-Animationen: Flamme `flicker 2.4s infinite`, Timer `timer-pulse 1s infinite`, Skeleton-Puls | `style.css:207`, `:375`, `ui.css:43` | Bewegung im Augenwinkel bindet Aufmerksamkeit | 🟠 |
| A4 | Timer: Text aktualisiert alle **100 ms** („9,2 s / 10 s“), der Balken läuft von Grün über Orange nach Rot, über der doppelten Zielzeit pulsiert er, der Tab-Titel zählt jede Sekunde mit | `views/train/timer.ts` | ständiger Stresstrigger, auch wenn der Nutzer nur verstehen will | 🔴 |
| A5 | Bei falscher Antwort: Shake auf Frage **und** Feedback, Vibration `[30,40,30]`, 220-Hz-Ton, rote Box mit „✗ Falsch“ | `train/index.ts`, `feedback.ts`, `fx.ts` | strafend; Fehler sind aber der eigentliche Lernmoment | 🔴 |
| A6 | Trainingskopf: Zurück-Link, Level, Punkte, Fortschrittsbalken, Ghost-Marker, „1/10“, Timerbalken und Timertext, also **8 Informationen vor der Aufgabe** | `train/index.ts` `header()` | lenkt vom Rechnen ab | 🟠 |
| A7 | Fortschritt/Analyse: **10 Abschnitte** untereinander (Bento, Heatmap, Lernkurve, Daily, Wiederholungen, Schwächen, Kategorien, Fehlermuster, Fehler, Link) | `views/analyse.ts` | keine Priorisierung, „Was soll ich jetzt tun?“ steht weit unten | 🟠 |
| A8 | Einstellungen speichern mit einem Toast „Gespeichert“ (gedrosselt) | `views/settings.ts` `update()` | unnötige Meldung; Schalter zeigen den Zustand bereits an | 🟡 |
| A9 | Viele Großbuchstaben-Labels (`.label`, `.eyebrow`, `.task-type`, `.method-heading`, `.field > span`, `.fb-heading`) mit `letter-spacing:.08em` | `style.css` | wirkt laut, liest sich schwerer | 🟡 |

### 2.2 Mobile-Ergonomie

| # | Befund | Ort | Wirkung | |
|---|---|---|---|---|
| A10 | Auswahlaufgaben: Antworten stehen **mittig**, darunter „Weiß nicht“ als gleich großer Button; die untere Bildschirmhälfte bleibt leer (im Screenshot belegt) | `train/answer.ts`, `.choices` | Daumen muss nach oben, „Weiß nicht“ konkurriert mit den Antworten | 🔴 |
| A11 | **Bug:** Jeder Klick auf ein Segment-Control (Sprache, Schwierigkeit, Rundenlänge …) und auf ein Theme ruft `rerender()` auf; `render()` macht `window.scrollTo(0, 0)`, **die Seite springt nach oben** | `settings.ts` `segmented()`, `router.ts` `render()` | auf dem Handy desorientierend, besonders im Tab „Gameplay“ | 🔴 |
| A12 | Einstellungen sind nur über das Zahnrad **oben rechts** erreichbar (schlechteste Daumenzone) | `index.html` `.topbar` | einhändig kaum erreichbar | 🟠 |
| A13 | Topbar (56 px + Safe-Area) zeigt auf jeder Hauptseite Logo und Namen, hat aber keine Funktion außer dem Zahnrad | `index.html` | verschenkter Platz above the fold | 🟠 |
| A14 | Mit Tastenfeld ist die Frage `clamp(1.75rem, 9vw, 2.5rem)` groß, zwischen Eingabe und Tastenfeld bleiben aber ≈ 200 px leer | `style.css:628` | die Aufgabe, also der Fokus, ist kleiner als nötig | 🟠 |
| A15 | Feedback stapelt Ergebnis, Lösungsweg, Methode, KI und „Weiter“ im Fluss; „Weiter“ klebt per `sticky` unten, liegt aber an anderer Stelle als „Prüfen“ | `feedback.ts`, `.next-btn` | der Daumen muss die Position wechseln, die Seite springt | 🟠 |
| A16 | Ergebnisseiten: FAB-Leiste blendet sich beim Scrollen aus und ein | `ui/fab.ts` | Bewegung beim Scrollen; das Dock-Konzept (3.4) ersetzt sie ruhiger | 🟡 |
| A17 | Sehr kleine Texte: Tab-Label 11 px, Ghost-Label 9 px unter 360 px, `.pl-badge` 11 px | `style.css`, `train.css`, `parallel.css` | unter der Lesbarkeitsgrenze | 🟡 |

### 2.3 Technische Design-Schulden

| # | Befund | Ort | |
|---|---|---|---|
| T1 | `.bar-row` ist **zweimal** definiert (`display:flex` in Z. 366 und `display:grid` in Z. 418); die zweite Regel gewinnt, `flex:1` auf den Kindern ist wirkungslos | `style.css` | 🟠 |
| T2 | Skeletons für **synchrone** localStorage-Daten: `deferRender` wartet zwei Frames, obwohl die Daten schon da sind. Das erzeugt Flackern; in Hintergrund-Tabs (rAF pausiert) bleiben die Skeletons stehen (im Browser-Pane beobachtet) | `home.ts`, `analyse.ts`, `lernen.ts`, `ui/skeleton.ts` | 🟠 |
| T3 | `.toast` steht in `style.css` und `ui.css`, mit `!important`-Overrides | beide | 🟡 |
| T4 | Legacy-Klassen ohne Verwendung: `.site-header`, `.nav`, `.header-inner`, `.brand-mark`, `.stats` (Legacy), `svg.spark[viewBox^=…]` | `style.css` | 🟡 |
| T5 | 33 verschiedene `font-size`-Angaben, 8 Z-Index-Werte (1–90) ohne Skala, Abstände hart kodiert (4/6/8/10/12/14/16/20 px) | alle CSS | 🟠 |
| T6 | Die Pastel-Werte stehen doppelt (Theme-Block **und** `prefers-color-scheme`-Block), die `-soft`-Variablen ebenfalls | `style.css:25–66` | 🟡 |
| T7 | Der globale Reduced-Motion-Block setzt **alle** Transitions per `!important` auf `none`, also auch reine Opacity-Übergänge, die eigentlich erlaubt wären | `style.css:647` | 🟡 |

### 2.4 Was bleiben soll

- Fokus-Modus (`body.in-play`) ohne Tab-Leiste.
- Schwebendes Tastenfeld mit `100dvh`-Layout, `000`-Taste, `±`, Layout-Wahl.
- Safe-Area-Handling, `tabular-nums`, 320-px-Tests, `prefers-reduced-motion`.
- Lösungsweg mit echten Zahlen, Methode vor der Runde (`intro=1`), Smart Retry.
- Kein Framework und keine externen Ressourcen: das ist für eine PWA ein Performance-Vorteil.

---

## 3. Design-Konzept „Ruhiger Fokus“

### 3.1 Leitprinzipien

| Prinzip | Bedeutung | Prüffrage |
|---|---|---|
| **Eine Absicht pro Bildschirm** | Je Screen genau eine Primäraktion, höchstens drei sekundäre | Sehe ich ohne Scrollen, was ich als Nächstes tun soll? |
| **Daumen zuerst** | Unteres Drittel für Aktionen, Mitte für Inhalt, oben nur Status | Erreiche ich jede Aktion einhändig mit dem Daumen? |
| **Informieren statt urteilen** | Fehler zeigen den Weg, nicht das Versagen | Würde ich diese Rückmeldung auch einem nervösen Freund so geben? |
| **Bewegung erklärt** | Animation nur, wenn sich etwas ändert, nie in Schleife | Was würde fehlen, wenn diese Animation wegfiele? |
| **Druck ist Opt-in** | Zeitdruck und Gamification sind zuschaltbar, nicht der Standard | Kann ich in Ruhe üben, ohne etwas abzuschalten? |
| **Weißraum ist Struktur** | Abstand gliedert, Rahmen und Flächen nur bei Interaktion | Kann ich eine Linie oder einen Rahmen streichen? |

### 3.2 Farben

Zwei Hauptthemes plus OLED-Variante. Warme, entsättigte Neutraltöne statt Zink-Grau; **Tinte-Blau** als einziger Akzent (Fokus, Vertrauen, passt zum Consulting-Kontext); **Salbei** für richtig, **Terrakotta** für Korrektur, **Ocker** für Hinweise. Kein reines Schwarz und kein reines Weiß als Hintergrund, das ist augenschonender.

| Token | Papier (hell) | Nacht (dunkel) | Verwendung |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#141619` | Seitenhintergrund |
| `--surface` | `#FFFFFF` | `#1B1E22` | Karten, Dock, Sheets |
| `--surface-2` | `#EEEBE4` | `#23272C` | Eingaben, Tasten, Chips |
| `--border` | `#E2DDD3` | `#2D3237` | nur wo nötig (Eingaben, Trennlinien) |
| `--text` | `#1E2227` | `#E9E7E2` | Fließtext, Zahlen |
| `--muted` | `#5C636D` | `#9DA3AA` | Sekundärtext |
| `--accent` | `#3A5A8A` | `#8EA8D4` | Primärbutton, Fokus, Fortschritt |
| `--accent-text` | `#2E4B75` | `#A8BEE2` | Links, aktive Labels |
| `--on-accent` | `#FFFFFF` | `#0F1620` | Text auf Akzent |
| `--good` | `#3D7A59` | `#83B89D` | richtig (Salbei) |
| `--bad` | `#A9533A` | `#E1937D` | Korrektur (Terrakotta, kein Alarmrot) |
| `--warn` | `#94600F` | `#D7B263` | Hinweis, über Zielzeit (Ocker) |
| `--streak` | `#B5652E` | `#E0A36F` | Serie (gedämpftes Kupfer statt Neon-Orange) |

**Kontrast (WCAG 2.2, nachgerechnet):** Alle Text/Hintergrund-Paare erreichen mindestens **AA (4,5 : 1)**. Papier: Text/bg 14,6 · muted/bg 5,5 · muted/surface-2 5,1 · on-accent/accent 7,0 · good/bg 4,6 · bad/bg 4,8. Nacht: Text/bg 14,7 · muted/bg 7,1 · on-accent/accent 7,5 · good/bg 8,0 · bad/bg 7,5. Zum Vergleich: Das heutige Pastel `--muted` auf `--surface-2` liegt mit 4,35 knapp **unter** AA.

**OLED** übernimmt die Nacht-Werte mit `--bg:#000`, `--surface:#101214`, `--surface-2:#181B1F`.

**Migration:** `neon` wird zu `night`, `pastel` zu `paper`, `oled` und `system` bleiben (siehe 4.3).

### 3.3 Typografie

- **Schrift:** weiterhin System-Stack (kein Netzwerk, CSP-konform, native Anmutung). Für Zahlen in Aufgaben und Kennzahlen `ui-rounded` (SF Pro Rounded auf Apple-Geräten), das wirkt freundlicher; Fallback ist der System-Stack.
- **Skala:** sieben Stufen statt 33 Einzelwerte, fluid über `clamp()`; Minimum 13 px für Text und 12 px nur für Tab-Labels.
- **Gewichte:** 400 / 600 / 700. 800 entfällt, das reduziert den „lauten“ Eindruck.
- **Labels:** Satzanfang groß statt Versalien, `--muted` statt Sperrung. Versalien bleiben höchstens für ein Element pro Screen.
- **Zeilenlänge:** Fließtext in Lernkarten `max-width: 62ch`.

| Token | Wert | Verwendung |
|---|---|---|
| `--text-xs` | `0.8125rem` (13 px) | Meta, Legenden |
| `--text-sm` | `0.9375rem` (15 px) | Sekundärtext, Buttons klein |
| `--text-md` | `1.0625rem` (17 px) | Fließtext (iOS-Body) |
| `--text-lg` | `1.25rem` (20 px) | Kartentitel |
| `--text-xl` | `clamp(1.5rem, 6vw, 1.875rem)` | Seitentitel (Large Title) |
| `--text-num` | `clamp(1.75rem, 8vw, 2.25rem)` | Kennzahlen |
| `--text-display` | `clamp(2.5rem, 13vw, 4.5rem)` | Aufgabe im Training |

### 3.4 Layout & Navigation

#### Daumenzonen-Raster

```
┌────────────────────────┐  ← Safe-Area oben
│  Status / Titel        │  Lesezone: nur Information, keine Pflichtaktion
│                        │
├────────────────────────┤
│                        │
│  Inhalt (Stage)        │  Mitte: Aufgabe, Karten, Listen
│                        │
├────────────────────────┤
│  Action Dock           │  Daumenzone: Primäraktion, Antworten, Tastenfeld
│  ─ Tab-Leiste ─        │  (Tab-Leiste nur außerhalb des Fokus-Modus)
└────────────────────────┘  ← Safe-Area unten
```

#### App-Shell

- **Topbar entfällt** auf den Tabs. Stattdessen gibt es einen **Large Title** im Inhalt (wie in iOS), der beim Scrollen in eine schmale, glasige Kopfzeile übergeht (`position: sticky`, nur Titel).
- **Tab-Leiste mit 4 Tabs:** Heute · Lernen · Fortschritt · Profil. Das Zahnrad wandert in „Profil“ (behebt A12/A13). Der aktive Tab bekommt eine Akzentfarbe und eine dezente Pille in `--accent-soft`, ohne Glow. Labels 12 px.
- **Action Dock** (neu, `src/ui/dock.ts`): ein fixierter Bereich oberhalb der Tab-Leiste bzw. im Fokus-Modus ganz unten. Es ersetzt `fab.ts`, `.next-btn` (sticky) und die Button-Zeilen im Training. Es bewegt sich beim Scrollen **nicht**, deshalb gibt es auch keine Ein- und Ausblend-Logik mehr.
- **≥ 768 px:** Die Tab-Leiste wird zur **Navigation Rail** links (72 px, Icons + Labels), der Inhalt ist maximal 720 px breit. **≥ 1024 px:** Fortschritt zweispaltig. Das Training bleibt zentriert (maximal 480 px), weil der Blick fokussiert bleiben soll. Mit physischer Tastatur (`pointer: fine`) entfällt das Bildschirm-Tastenfeld wie bisher.

#### Screen „Heute“ (ersetzt die Bento-Startseite)

```
Guten Abend                        ← Large Title + Datum (muted)
┌──────────────────────────────┐
│ Empfohlen für heute          │  ← eine ruhige Karte, kein Gradient
│ Prozente · Methode + 5 Aufg. │
│ „Hier verlierst du am meisten│
│  Zeit (Ø 14 s, Ziel 8 s)“    │
└──────────────────────────────┘
 ◔ 9 / 15 min heute · 4 Tage Serie ← eine Zeile Status statt 3 Kacheln

 Andere Übungen                    ← Liste, keine Kacheln
 ▸ Daily Challenge   heute offen
 ▸ Alle Kategorien gemischt
 ▸ Kettenrechnen · Parallel · Schätzen · Eigenes

 Kategorien                        ← horizontale Chips mit Skill-Punkt
 (Mult ●) (Div ●) (Große Zahlen ○) …
┌──────────────────────────────┐
│ [   Jetzt üben · ca. 4 min  ]│  ← Action Dock (Primäraktion)
└──────────────────────────────┘
 Heute  Lernen  Fortschritt  Profil
```

- Sichtbare Entscheidungen above the fold: **1 primäre + ≤ 3 sekundäre** (heute ≈ 18).
- XP und Level wandern als kleine Zeile nach „Fortschritt“. Die Serie bleibt sichtbar, aber nur als Zahl, ohne flackernde Flamme.
- Für Neue: Willkommenszeile, ein Satz Erklärung, Dock-Button „Erste Runde · 2 min“.

#### Screen „Training“ (Fokus-Modus)

```
 ✕                    ●●●●○○○○○○    ← Schließen (44 px) + Fortschritts-Segmente
 ──────────────────────────────     ← Zeitlinie (ruhig, ohne Zahlen)

          Prozente                  ← Typ in muted, kein Versal
        18 % von 250                ← --text-display, vertikal zentriert

        ┌──────────────┐
        │        45    │ Mio. €     ← Antwortfeld
        └──────────────┘
┌──────────────────────────────┐
│ Wie geht das?      Weiß nicht │  ← Text-Buttons, klar untergeordnet
│  7   8   9   ⌫               │
│  4   5   6   ±               │  ← Tastenfeld = Dock
│  1   2   3  Prüfen           │
│  ,   0  000                   │
└──────────────────────────────┘
```

- **Kopf reduziert** auf Schließen (links oben, zusätzlich per Esc und Swipe-Back erreichbar) und Fortschritts-Segmente. Punkte, Level und Ghost wandern ins Rundenergebnis bzw. bleiben im Modus *Präzise*.
- **Die Aufgabe füllt den freien Raum** (`--text-display`, vertikal zentriert im Grid), das behebt A14.
- **Auswahlaufgaben:** Antworten als 2×2-Raster **im Dock**, also im Daumenbereich; „Weiß nicht“ darunter als Text-Button (behebt A10). Die Tastenkürzel 1–4 bleiben für Desktop.
- **Timer-Stufen** (neue Einstellung `timerDisplay`):
  - *Ruhig* (Standard): eine 2 px dünne Linie füllt sich in `--accent`. Ab der Zielzeit wechselt sie einmal weich nach `--warn`. Keine Zahlen, kein Puls, kein Tab-Titel-Countdown. Bewertung und Messung laufen unverändert weiter.
  - *Präzise*: heutiges Verhalten mit Zahlen, aber Update alle 250 ms und ohne Puls.
  - *Aus*: entspricht `timer: false`.
- **Feedback als Bottom Sheet** (neu, `src/ui/sheet.ts`): Es fährt aus dem Dock hoch, die Frage bleibt oben sichtbar. Inhalt: eine Ergebniszeile, die richtige Antwort, „Lösungsweg“ (bei Fehlern automatisch offen), „Methode“ und KI eingeklappt. **„Weiter“ sitzt an exakt derselben Stelle wie „Prüfen“**, der Daumen bleibt also liegen (behebt A15).

#### Screen „Rundenergebnis“

- Oben ein ruhiger Satz statt einer Kachelwand: „8 von 10 richtig · Ø 6,4 s“ und darunter **eine Erkenntnis** („Zwei Nullen-Fehler bei großen Zahlen. Tipp: Zehnerpotenzen getrennt zählen.“).
- Liste der Aufgaben eingeklappt, falsche zuerst.
- Dock: „Nochmal“ (primär) · „Fehler üben“ (wenn vorhanden) · „Fertig“.

#### Screen „Fortschritt“ (ersetzt „Analyse“)

- **Oben:** „Dein Fokus diese Woche“, also die eine größte Schwäche mit Erklärung und Dock-Aktion „Gezielt üben“.
- Darunter **3 Kennzahlen** in einer Reihe: Skill, Genauigkeit, Minuten (7 Tage).
- Danach ein **Segment-Control** „Überblick · Kategorien · Verlauf · Fehler“ statt 10 Abschnitten untereinander (behebt A7). Heatmap, Lernkurve und Daily kommen in „Verlauf“, Fehlermuster und letzte Fehler in „Fehler“.

#### Screen „Profil“ (ersetzt Einstellungen)

- Gruppierte Listen im iOS-Stil: Konto · Training · Darstellung · Daten · Über. Die Unter-Tabs entfallen, die Seite ist kurz genug.
- **Stilles Speichern:** kein Toast. Ein kurzes Häkchen am Element erscheint nur bei Aktionen ohne sichtbaren Zustand (Export, Import).
- **Keine Sprünge:** Segment-Controls aktualisieren sich lokal, nicht per `rerender()` (behebt A11).

### 3.5 Interaktionen & Micro-Animations

**Motion-Prinzip:** Kurze Dauern, weiche Ausklänge, keine Schleifen. Bewegung kommt aus der Richtung des Daumens (von unten).

| Token | Wert | Einsatz |
|---|---|---|
| `--dur-tap` | `100ms` | Druck-Feedback (Scale) |
| `--dur-state` | `200ms` | Farb- und Zustandswechsel |
| `--dur-enter` | `320ms` | Sheet, Dock, Karten erscheinen |
| `--dur-exit` | `200ms` | Ausblenden (immer kürzer als Einblenden) |
| `--dur-progress` | `600ms` | Ringe, Balken |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | Standard |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Seitenwechsel |
| `--ease-spring` | `linear(0, .5 7%, .93 19%, 1.04 27%, 1.01 38%, 1)` | Sheet (sanftes Nachschwingen); Fallback ist `--ease-out` |

| Moment | Heute | Neu |
|---|---|---|
| Taste/Button drücken | `scale(.93–.97)` + Glow | `scale(.97)` in 100 ms, Fläche dunkelt um 6 % ab, kein Glow |
| Richtig | `pop` (Scale 1,05) + grüne Box + 880-Hz-Ton + `vibrate(15)` | Antwortrahmen wird Salbei, ein ✓ zeichnet sich in 280 ms (`stroke-dashoffset`), Haptik „leicht“, optional ein weicher Zweiklang (660 → 880 Hz, 80 ms, leise) |
| Falsch | Shake + rote Box + 220-Hz-Ton + `[30,40,30]` | **Kein Shake.** Eingabe wird Terrakotta, die richtige Zahl gleitet in 320 ms darunter ein. Text: „Fast. Richtig ist 450“ bzw. „Eine Null zu viel: 4.500 statt 450“. Haptik zweimal leicht, standardmäßig kein Ton |
| Nächste Aufgabe | harter Austausch | Crossfade + 8 px nach oben über die **View Transitions API** (Chrome 111+, Safari 18+); Fallback ist der harte Austausch |
| Fortschritt | Balken | Segment füllt sich in 600 ms |
| Tagesziel erreicht | Konfetti (2,4 s) | Ring schließt sich, ein „Atem“-Puls (Scale 1 → 1,04 → 1, einmalig), eine Zeile Text. Konfetti nur noch per Einstellung „Feiern“ |
| Serie | Flamme flackert endlos | statisch; einmaliger Puls nur am Tag, an dem die Serie wächst |
| Skeleton | pulsiert endlos, auch bei synchronen Daten | nur bei echtem Warten (KI, Sync); statischer Schimmer, der nach 300 ms einblendet |
| Reduced Motion | alles hart aus | Transforms aus, Opacity-Übergänge bleiben (≤ 200 ms) |

**Haptik:** `navigator.vibrate` gibt es in iOS Safari nicht. Haptik ist deshalb ein *Bonus* auf Android und nie der einzige Feedback-Kanal; Farbe und Text tragen die Information immer allein.

**Optional, purpose-driven: „Atempause“.** Vor einer Runde (Einstellung, standardmäßig aus, empfohlen am Interview-Tag) dehnt sich ein Kreis 4 s aus und zieht sich 4 s zusammen, darunter steht „Einatmen … Ausatmen“, dann startet die Runde. Ein Tippen überspringt die Pause. Das senkt die Anspannung, bevor geübt wird.

---

## 4. Umsetzungsempfehlungen

### 4.1 Entscheidung: CSS-Tokens + Cascade Layers, kein Tailwind

| Kriterium | Tailwind v4 | Tokens + `@layer` (empfohlen) |
|---|---|---|
| Build | zusätzliche Dev-Dependency und CLI-Schritt im `build`-Skript | unverändert (`copy-static`) |
| Code-Stil | lange Klassen-Strings in `h('div', { class: '…' })`, schwer zu lesen | semantische Klassen wie heute |
| Theming | über `@theme`, Dark Mode per Variante | Tokens pro `[data-theme]`, bereits so aufgebaut |
| CSP / Laufzeit | unkritisch | unkritisch |
| Migrationsaufwand | alle Views anfassen | schrittweise je Komponente |

Die App ist klein (≈ 920 Zeilen CSS), komponentenorientiert und bewusst ohne Dependencies gebaut. Tailwind brächte mehr Umbau als Nutzen. Stattdessen gibt es **ein Token-System, `@layer` für eine vorhersehbare Kaskade und wenige Utilities** (`.stack`, `.cluster`, `.visually-hidden`).

### 4.2 Neue CSS-Struktur

```
public/css/
  tokens.css        Farben je Theme, Typo, Abstände, Radien, Schatten, Motion, Z-Index
  base.css          Reset, body, Fokus, Reduced Motion
  layout.css        .screen, .focus, .stage, .dock, .tabbar, .rail, Large Title
  components/
    button.css card.css list.css segmented.css switch.css chip.css
    sheet.css keypad.css toast.css modal.css progress.css ring.css
  views/
    today.css train.css progress.css lernen.css profile.css chain.css parallel.css
  utilities.css
```

`index.html` bindet eine einzige `app.css` ein, die per `@import` mit Layer-Zuordnung lädt (Same-Origin, CSP-konform; `scripts/precache.ts` nimmt sie automatisch mit):

```css
/* public/css/app.css */
@layer tokens, base, layout, components, views, utilities;
@import url("tokens.css") layer(tokens);
@import url("base.css") layer(base);
@import url("layout.css") layer(layout);
@import url("components/button.css") layer(components);
/* … weitere Komponenten … */
@import url("views/train.css") layer(views);
@import url("utilities.css") layer(utilities);
```

> Performance-Hinweis: `@import` lädt seriell. Das ist bei Precache und HTTP/2 auf Cloudflare unkritisch. Soll es trotzdem optimiert werden, kann `scripts/copy-static.ts` die Dateien beim Build zu einer `app.css` zusammenfügen.

### 4.3 Design-Tokens (`public/css/tokens.css`)

```css
/* ---------- Theme: Papier (hell) – auch Standard für „system“ im Light Mode ---------- */
:root,
html[data-theme="paper"] {
  color-scheme: light;
  --bg:#F6F4EF; --surface:#FFFFFF; --surface-2:#EEEBE4; --border:#E2DDD3;
  --text:#1E2227; --muted:#5C636D;
  --accent:#3A5A8A; --accent-text:#2E4B75; --on-accent:#FFFFFF;
  --good:#3D7A59; --bad:#A9533A; --warn:#94600F; --streak:#B5652E;
  --shadow-1:0 1px 2px rgb(30 34 39 / .05);
  --shadow-2:0 8px 24px rgb(30 34 39 / .08);
  --shadow-dock:0 -1px 0 var(--border), 0 -12px 32px rgb(30 34 39 / .06);
  --scrim:rgb(30 34 39 / .32);
}

/* ---------- Theme: Nacht (dunkel) ---------- */
html[data-theme="night"] {
  color-scheme: dark;
  --bg:#141619; --surface:#1B1E22; --surface-2:#23272C; --border:#2D3237;
  --text:#E9E7E2; --muted:#9DA3AA;
  --accent:#8EA8D4; --accent-text:#A8BEE2; --on-accent:#0F1620;
  --good:#83B89D; --bad:#E1937D; --warn:#D7B263; --streak:#E0A36F;
  --shadow-1:none;
  --shadow-2:0 8px 24px rgb(0 0 0 / .35);
  --shadow-dock:0 -1px 0 var(--border);
  --scrim:rgb(0 0 0 / .55);
}

/* ---------- Theme: OLED (Nacht auf Schwarz) ---------- */
html[data-theme="oled"] {
  color-scheme: dark;
  --bg:#000000; --surface:#101214; --surface-2:#181B1F; --border:#24282D;
  --text:#E9E7E2; --muted:#9DA3AA;
  --accent:#8EA8D4; --accent-text:#A8BEE2; --on-accent:#0F1620;
  --good:#83B89D; --bad:#E1937D; --warn:#D7B263; --streak:#E0A36F;
  --shadow-1:none; --shadow-2:none; --shadow-dock:0 -1px 0 var(--border);
  --scrim:rgb(0 0 0 / .7);
}

/* ---------- Abgeleitete Farben: auf jedem Theme-Element neu auflösen ---------- */
:root, html[data-theme] {
  --accent-soft:color-mix(in srgb, var(--accent) 14%, transparent);
  --good-soft:color-mix(in srgb, var(--good) 14%, transparent);
  --bad-soft:color-mix(in srgb, var(--bad) 14%, transparent);
  --warn-soft:color-mix(in srgb, var(--warn) 14%, transparent);
  --glass:color-mix(in srgb, var(--surface) 82%, transparent);
  --press:color-mix(in srgb, var(--text) 6%, transparent);
  --focus-ring:0 0 0 3px color-mix(in srgb, var(--accent) 40%, transparent);
}

/* ---------- Typografie ---------- */
:root {
  --font:system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  --font-num:ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif;
  --font-mono:ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --text-xs:0.8125rem; --text-sm:0.9375rem; --text-md:1.0625rem; --text-lg:1.25rem;
  --text-xl:clamp(1.5rem, 6vw, 1.875rem);
  --text-num:clamp(1.75rem, 8vw, 2.25rem);
  --text-display:clamp(2.5rem, 13vw, 4.5rem);
  --leading-tight:1.15; --leading:1.5; --leading-loose:1.65;
  --weight-regular:400; --weight-medium:600; --weight-bold:700;

  /* ---------- Abstände (4-px-Raster) ---------- */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:24px; --space-6:32px; --space-7:48px; --space-8:64px;
  --gutter:var(--space-4);

  /* ---------- Formen ---------- */
  --radius-sm:10px; --radius-md:16px; --radius-lg:24px; --radius-pill:999px;

  /* ---------- Touch ---------- */
  --hit-min:44px;      /* WCAG 2.5.5 / Apple HIG */
  --hit-primary:56px;  /* Primäraktionen im Dock */

  /* ---------- Shell ---------- */
  --tabbar-h:64px;
  --dock-pad:var(--space-3);
  --safe-b:env(safe-area-inset-bottom, 0px);
  --safe-t:env(safe-area-inset-top, 0px);

  /* ---------- Bewegung ---------- */
  --dur-tap:100ms; --dur-state:200ms; --dur-enter:320ms; --dur-exit:200ms; --dur-progress:600ms;
  --ease-out:cubic-bezier(.22, 1, .36, 1);
  --ease-in-out:cubic-bezier(.65, 0, .35, 1);
  --ease-spring:var(--ease-out);

  /* ---------- Ebenen ---------- */
  --z-sticky:10; --z-dock:30; --z-tabbar:40; --z-sheet:60; --z-toast:80; --z-modal:90;
}
@supports (transition-timing-function: linear(0, 1)) {
  :root { --ease-spring:linear(0, .5 7%, .93 19%, 1.04 27%, 1.01 38%, 1); }
}
@media (min-width: 640px) { :root { --gutter:var(--space-5); } }

/* ---------- „system“: kein data-theme gesetzt → nach OS-Einstellung ---------- */
@media (prefers-color-scheme: dark) {
  html:not([data-theme]) { /* gleiche Werte wie [data-theme="night"] */ }
}
```

Damit es keine doppelten Werte gibt (T6), setzt `theme.ts` weiterhin immer ein konkretes `data-theme`. Der `:not([data-theme])`-Block ist nur ein Fallback vor dem ersten Skriptlauf (FOUC). `theme.ts`:

```ts
// src/ui/theme.ts
const BG: Record<Theme, string> = { paper: '#F6F4EF', night: '#141619', oled: '#000000' };

function resolve(setting: ThemeSetting): Theme {
  if (setting === 'paper' || setting === 'night' || setting === 'oled') return setting;
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'night' : 'paper';
}
```

Migration in `normalize()` (`src/data/schema.ts`) samt Typänderung in `src/types.ts`:

```ts
// src/types.ts
export type ThemeSetting = 'system' | 'paper' | 'night' | 'oled';
export type TimerDisplay = 'calm' | 'precise' | 'off';
// Settings: + timerDisplay: TimerDisplay; + celebrations: boolean; + breathe: boolean;

// src/data/schema.ts (in normalize)
const LEGACY_THEME: Record<string, ThemeSetting> = { neon: 'night', pastel: 'paper' };
const theme = LEGACY_THEME[String(raw.theme)] ?? raw.theme;
// timerDisplay: aus altem `timer` ableiten → timer === false ? 'off' : 'calm'
```

### 4.4 Layout-Wrapper (`public/css/layout.css`)

```css
/* Seite: Inhalt + Platz für Dock und Tab-Leiste */
.screen {
  --dock-h:0px;
  min-height:100dvh;
  max-width:720px; margin-inline:auto; padding-inline:var(--gutter);
  padding-top:calc(var(--safe-t) + var(--space-4));
  padding-bottom:calc(var(--dock-h) + var(--tabbar-h) + var(--space-5) + var(--safe-b));
  display:flex; flex-direction:column; gap:var(--space-5);
}
body.in-play .screen { padding-bottom:calc(var(--dock-h) + var(--space-4) + var(--safe-b)); }

.large-title { font-size:var(--text-xl); font-weight:var(--weight-bold); line-height:var(--leading-tight); letter-spacing:-0.02em; }

/* Fokus-Modus: Kopf · Bühne · Dock */
.focus {
  display:grid; grid-template-rows:auto 1fr auto;
  height:100dvh; padding-top:calc(var(--safe-t) + var(--space-2));
}
.stage {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:var(--space-4); padding-inline:var(--gutter); text-align:center; min-height:0; overflow-y:auto;
}
.stage .question {
  font-family:var(--font-num); font-size:var(--text-display); font-weight:var(--weight-medium);
  line-height:var(--leading-tight); font-variant-numeric:tabular-nums; letter-spacing:-0.02em;
}
.stage .question.long { font-family:var(--font); font-size:var(--text-lg); line-height:1.4; }

/* Action Dock: fest unten, über der Tab-Leiste */
.dock {
  position:fixed; z-index:var(--z-dock); inset-inline:0;
  bottom:calc(var(--tabbar-h) + var(--space-3) + var(--safe-b));
  padding:var(--dock-pad) var(--gutter);
  display:grid; gap:var(--space-2);
  max-width:520px; margin-inline:auto;
}
body.in-play .dock {
  bottom:0; padding-bottom:calc(var(--dock-pad) + var(--safe-b));
  background:var(--glass); box-shadow:var(--shadow-dock);
  -webkit-backdrop-filter:blur(20px) saturate(1.3); backdrop-filter:blur(20px) saturate(1.3);
  border-radius:var(--radius-lg) var(--radius-lg) 0 0;
}
.dock .btn.primary { min-height:var(--hit-primary); font-size:var(--text-md); }
.dock-row { display:flex; justify-content:space-between; align-items:center; min-height:var(--hit-min); }

/* Auswahl-Antworten im Dock */
.dock .choices { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-2); margin:0; }
.dock .choice { min-height:var(--hit-primary); }

/* Tab-Leiste → Rail ab Tablet */
@media (min-width: 768px) {
  .tabbar {
    left:0; top:0; bottom:0; transform:none; width:72px; height:auto;
    flex-direction:column; justify-content:center; border-radius:0; border-width:0 1px 0 0;
  }
  .screen { padding-left:calc(72px + var(--gutter)); }
  .dock { bottom:calc(var(--space-4) + var(--safe-b)); }
}
```

### 4.5 Neue bzw. umgebaute TS-Module

| Modul | Art | Inhalt / Vertrag |
|---|---|---|
| `src/ui/dock.ts` | **neu**, ersetzt `fab.ts` | `createDock(children: Child[]): { el; set(children: Child[]): void; destroy(): void }`. Setzt `--dock-h` per `ResizeObserver` auf `.screen` (über `style.setProperty`), registriert sich per `addCleanup` |
| `src/ui/sheet.ts` | **neu** | `openSheet({ body, actions, dismissible }): { close(): void }`. Fährt aus dem Dock hoch, `role="dialog"`, Fokusfalle aus `modal.ts` wiederverwenden. Auf ≥ 768 px wird es zur zentrierten Karte |
| `src/ui/transition.ts` | **neu** | `swap(update: () => void): void`, nutzt `document.startViewTransition`, wenn vorhanden und kein Reduced Motion gilt, sonst direkt `update()` |
| `src/ui/fx.ts` | umbauen | `haptic('tap' \| 'success' \| 'soft-error')`, `tone()` (leise, kurz, Zweiklang), Fehler standardmäßig ohne Ton |
| `src/ui/progress-segments.ts` | **neu** | `segments(total, done): HTMLElement` für den Trainingskopf |
| `src/views/train/timer.ts` | umbauen | `createTimer(task, t0, display: TimerDisplay)`. *calm*: nur `--w` und eine Klasse beim Erreichen der Zielzeit, Takt 250 ms, kein `setTitle`; *precise*: Text + Titel |
| `src/views/train/answer.ts` | anpassen | `choicesEl` und „Weiß nicht“ wandern ins Dock; Tastenfeld rendert ins Dock statt `root.append` |
| `src/views/train/feedback.ts` | umbauen | liefert Sheet-Inhalt statt Knoten im Fluss; neue Texte („Fast. Richtig ist …“) |
| `src/views/home.ts` | neu schreiben | „Heute“-Struktur aus 3.4; keine Skeletons |
| `src/views/analyse.ts` | umbauen | Fokus-Karte + 3 Kennzahlen + Segment-Ansichten; nur die aktive Ansicht rendern |
| `src/views/settings.ts` | umbauen | gruppierte Liste, kein Toast, lokale Segment-Updates |
| `src/router.ts` | anpassen | Scroll-Erhalt (s. u.), Route `#/profil` (Alias `#/settings`), 4. Tab, `swap()` für Seitenwechsel |
| `public/index.html` | anpassen | Topbar raus, 4 Tabs, `main#app.screen`, eine Stylesheet-Referenz |

#### Beispiel: Scroll-Sprung beheben (A11)

```ts
// src/views/settings.ts – Segment-Control aktualisiert sich selbst, kein rerender()
function segmented<V extends string | number>(label: string, options: ReadonlyArray<readonly [V, string]>,
  current: V, onPick: (value: V) => void): HTMLDivElement {
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const btn = h('button', {
      type: 'button', 'aria-pressed': String(value === current),
      onclick: () => {
        for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === btn));
        onPick(value);
      },
    }, text);
    seg.append(btn);
  }
  return seg;
}
```

Für Fälle, die wirklich neu rendern müssen (Sprache, Theme), bekommt der Router eine Option:

```ts
// src/router.ts
export function rerender({ keepScroll = false }: { keepScroll?: boolean } = {}): void {
  const y = window.scrollY;
  render();
  if (keepScroll) window.scrollTo(0, y);
}
```

#### Beispiel: View-Transition-Helfer

```ts
// src/ui/transition.ts
type VTDocument = Document & { startViewTransition?: (cb: () => void) => unknown };

/** Tauscht Inhalte mit sanftem Crossfade, wenn der Browser es kann und Bewegung erwünscht ist. */
export function swap(update: () => void): void {
  const doc = document as VTDocument;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) { update(); return; }
  doc.startViewTransition(update);
}
```

```css
/* components/stage.css */
::view-transition-old(root) { animation:fade-out var(--dur-exit) var(--ease-out) both; }
::view-transition-new(root) { animation:rise-in var(--dur-enter) var(--ease-out) both; }
@keyframes fade-out { to { opacity:0; } }
@keyframes rise-in { from { opacity:0; transform:translateY(8px); } }
```

#### Beispiel: ruhiges Antwort-Feedback

```css
/* views/train.css */
.answer { transition:border-color var(--dur-state) var(--ease-out), background-color var(--dur-state) var(--ease-out); }
.answer.is-good { border-color:var(--good); background:var(--good-soft); }
.answer.is-bad { border-color:var(--bad); background:var(--bad-soft); }

.check-draw path { stroke-dasharray:24; stroke-dashoffset:24; animation:draw 280ms var(--ease-out) forwards; }
@keyframes draw { to { stroke-dashoffset:0; } }

.correction { font-family:var(--font-num); font-size:var(--text-num); color:var(--text);
  animation:rise-in var(--dur-enter) var(--ease-out) both; }

@media (prefers-reduced-motion: reduce) {
  .check-draw path { animation:none; stroke-dashoffset:0; }
  .correction { animation:fade-in var(--dur-state) linear both; }
}
@keyframes fade-in { from { opacity:0; } }
```

#### Beispiel: Haptik & Ton

```ts
// src/ui/fx.ts
const PATTERNS = { tap: 6, success: 12, 'soft-error': [8, 60, 8] } as const;
export type HapticKind = keyof typeof PATTERNS;

/** Bonus-Feedback (Android); iOS Safari hat kein navigator.vibrate – Farbe/Text tragen die Information. */
export function haptic(kind: HapticKind): void {
  if (!getSettings().haptics) return;
  try { navigator.vibrate?.(PATTERNS[kind] as VibratePattern); } catch { /* ignore */ }
}

/** Leiser Zweiklang nur für „richtig“; Fehler bleiben standardmäßig stumm. */
export function tone(): void {
  if (!getSettings().sound) return;
  // 660 Hz → 880 Hz, je 40 ms, gain 0.03, mit kurzem Attack/Release (kein Klicken)
}
```

### 4.6 Reduced Motion ohne Holzhammer (T7)

```css
/* base.css – ersetzt den globalen !important-Block */
@media (prefers-reduced-motion: reduce) {
  :root { --dur-enter:150ms; --dur-progress:0ms; --ease-spring:linear; }
  *, *::before, *::after { animation-iteration-count:1 !important; scroll-behavior:auto !important; }
  .anim-move { animation:none !important; transform:none !important; }
}
```

Opacity-Übergänge bleiben erhalten (helfen der Orientierung), Bewegung entfällt, und es gibt nirgends mehr Endlos-Schleifen.

---

## 5. Roadmap

Aufwand: **S** ≤ ½ Tag · **M** 1–2 Tage · **L** 3–5 Tage. Jede Phase ist für sich auslieferbar und deploybar.

### Phase 0: Quick Wins (S–M, sofort)

Ohne neues Design, reine Ruhe- und Bugfixes.

| # | Änderung | Dateien | Behebt |
|---|---|---|---|
| 0.1 | Segment-Controls lokal aktualisieren; `rerender({ keepScroll: true })` für Theme/Sprache | `settings.ts`, `router.ts` | A11 🔴 |
| 0.2 | Endlos-Animationen entfernen (Flamme, Timer-Puls); Glows auf Primär-Buttons/Tabs/Eingabe entfernen | `style.css` | A2, A3 |
| 0.3 | Shake bei Fehlern entfernen, Fehler-Ton standardmäßig aus, Vibration `[8,60,8]` | `train/index.ts`, `feedback.ts`, `fx.ts`, `style.css` | A5 |
| 0.4 | Settings-Toast „Gespeichert“ entfernen | `settings.ts` | A8 |
| 0.5 | `deferRender`/Skeletons bei synchronen Daten entfernen (Home, Analyse, Lernen) | 3 Views | T2 |
| 0.6 | `.bar-row`-Duplikat, `.toast`-Duplikat und Legacy-Klassen bereinigen | `style.css`, `ui.css` | T1, T3, T4 |
| 0.7 | Mindestschriftgröße 12 px (Tab-Labels, Ghost-Label, Badges) | CSS | A17 |
| 0.8 | Timer-Text alle 250 ms statt 100 ms aktualisieren | `timer.ts` | A4 (teilweise) |

**DoD:** `npm test` grün; Sichtprüfung bei 320/375/430 px in Hell und Dunkel; in den Einstellungen springt keine Aktion mehr nach oben.

### Phase 1: Fundament: Tokens & CSS-Architektur (M–L)

| # | Änderung |
|---|---|
| 1.1 | `tokens.css` nach 4.3 anlegen; Themes Papier/Nacht/OLED; `theme.ts` + `ThemeSetting` + Migration in `normalize()` (`neon`→`night`, `pastel`→`paper`) |
| 1.2 | CSS in `@layer`-Struktur nach 4.2 aufteilen; `app.css` als einzige Referenz in `index.html` |
| 1.3 | Alle `font-size`, Abstände, Radien, Z-Indizes auf Tokens umstellen (Ziel: 0 hart kodierte Werte außerhalb von `tokens.css`) |
| 1.4 | Versal-Labels auf Satzanfang-Stil umstellen; Gewicht 800 → 700 |
| 1.5 | Reduced-Motion-Block nach 4.6 |
| 1.6 | Tests: `tests/theme-migration.test.ts` (alte Werte → neue, `system` bleibt, unbekannte Werte → `system`) |

**DoD:** Optisch noch weitgehend die bisherige Struktur, aber in den neuen Farben und Typo-Stufen. Kontrast aller Text-Paare ≥ 4,5 : 1. `grep -E 'font-size:\s*[0-9.]+(rem|px)'` findet nur Treffer in `tokens.css`.

### Phase 2: App-Shell & Navigation (M)

| # | Änderung |
|---|---|
| 2.1 | Topbar entfernen, Large Titles in den Views; schmale Sticky-Kopfzeile beim Scrollen |
| 2.2 | Tab-Leiste mit 4 Tabs (Heute · Lernen · Fortschritt · Profil); Route `#/profil` mit `#/settings` als Alias; i18n-Schlüssel ergänzen |
| 2.3 | `ui/dock.ts` bauen; `fab.ts` und `.next-btn` darauf umstellen (Ergebnis, Parallel-Ergebnis, Kette) |
| 2.4 | Navigation Rail ≥ 768 px |
| 2.5 | `ui/transition.ts`; Router nutzt `swap()` beim Tab-Wechsel |

**DoD:** Jede Primäraktion liegt in den unteren 40 % des Viewports (375 × 812). Einstellungen sind mit einem Tipp aus jedem Tab erreichbar.

### Phase 3: Fokus-Training (L, größter Hebel)

| # | Änderung |
|---|---|
| 3.1 | Trainings-Layout `.focus` (Kopf · Bühne · Dock); Aufgabe in `--text-display`, vertikal zentriert |
| 3.2 | Kopf auf Schließen + `progress-segments` reduzieren; Punkte, Level und Ghost nur im Modus *Präzise* |
| 3.3 | Auswahlaufgaben und „Weiß nicht“ ins Dock; Tastenfeld rendert ins Dock |
| 3.4 | Einstellung `timerDisplay` (calm/precise/off) + `timer.ts`-Umbau; Standard *calm*; Migration aus `timer` |
| 3.5 | `ui/sheet.ts` + Feedback als Sheet; „Weiter“ an der Position von „Prüfen“; neue Feedback-Texte (de/en) |
| 3.6 | Mikro-Animationen nach 3.5 (Check zeichnen, Korrektur einblenden, Aufgabenwechsel per View Transition) |
| 3.7 | Gleiches Muster für Kettenrechnen und Parallel (Dock + Sheet) |

**DoD:** Alle Trainingsflüsse sind einhändig bedienbar; während einer Aufgabe gibt es außer der Zeitlinie keine Bewegung; Esc/Enter/1–4 funktionieren weiter; bestehende Train-Tests grün; neue Tests für `timerDisplay`-Normalisierung.

### Phase 4: „Heute“ & „Fortschritt“ (M–L)

| # | Änderung |
|---|---|
| 4.1 | `home.ts` → „Heute“ nach 3.4: eine Empfehlungskarte, Statuszeile, Liste „Andere Übungen“, Kategorie-Chips, Dock-CTA mit geschätzter Dauer |
| 4.2 | Geschätzte Dauer berechnen (`sessionLength × Ø targetMs` der Empfehlung) in `core/progress.ts` (DOM-frei, testbar) |
| 4.3 | `analyse.ts` → „Fortschritt“: Fokus-Karte, 3 Kennzahlen, Segmente (Überblick/Kategorien/Verlauf/Fehler); nur die aktive Ansicht rendern, Auswahl in `?view=` |
| 4.4 | Rundenergebnis: Erkenntnis-Satz aus `errorPatterns` + Liste eingeklappt, falsche zuerst |
| 4.5 | `settings.ts` → „Profil“ als gruppierte Liste ohne Unter-Tabs |

**DoD:** Startseite mit ≤ 4 Entscheidungen above the fold; erste Aufgabe mit **1 Tipp** nach dem App-Start erreichbar; Fortschritt zeigt die wichtigste Handlungsempfehlung ohne Scrollen.

### Phase 5: Mindful Extras & Feinschliff (M)

| # | Änderung |
|---|---|
| 5.1 | „Atempause“ vor der Runde (Einstellung `breathe`, standardmäßig aus) |
| 5.2 | Einstellung „Feiern“ (`celebrations`): Konfetti nur noch opt-in, sonst Ring-Atem |
| 5.3 | Ton-Redesign (Zweiklang, Attack/Release), Haptik-Muster final |
| 5.4 | Lighthouse-Lauf (Mobile): Performance ≥ 95, Accessibility 100; CSS ≤ 40 KB unkomprimiert |
| 5.5 | Barrierefreiheits-Audit: Fokus-Reihenfolge im Dock und im Sheet, Screenreader-Ansage für Feedback (`aria-live`), Zielgrößen ≥ 44 px |
| 5.6 | `docs/ARCHITECTURE.md` und `README.md` (Themes, Struktur) aktualisieren, Release-Note in `src/releases.ts` |

### Erfolgskriterien (gesamt)

| Messgröße | Heute | Ziel |
|---|---|---|
| Tipps vom App-Start zur ersten Aufgabe | 1–2 (Hero-Button oben) | 1 (Dock unten) |
| Gleichrangige Entscheidungen above the fold (Start) | ≈ 18 | ≤ 4 |
| Informationen im Trainingskopf | 8 | 2 (*Ruhig*) |
| Endlos-Animationen | 3 | 0 |
| Glow-Effekte | 16 | 0 |
| Verschiedene `font-size`-Werte | 33 | 7 Tokens |
| Primäraktionen in den unteren 40 % (375 × 812) | teilweise | alle |
| Text-Kontrast | Pastel teils < 4,5 | alle ≥ 4,5 |

### Reihenfolge & Parallelisierbarkeit

```
Phase 0 ──▶ Phase 1 ──┬──▶ Phase 2 ──▶ Phase 4
                      └──▶ Phase 3 ──▶ Phase 5
```

Phase 2 und Phase 3 berühren verschiedene Dateien (Shell/Views vs. `views/train/**`, `ui/sheet.ts`) und können nach Phase 1 parallel laufen. `ui/dock.ts` gehört zu Phase 2; Phase 3 nutzt es also erst nach dessen Merge, oder Phase 3 baut es und Phase 2 übernimmt es.
