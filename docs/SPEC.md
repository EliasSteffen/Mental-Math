# Kopfrechner – Spezifikation & Design

Minimalistische Web-App zum Training von Case-Interview-Mathe. **Statisch** (HTML, CSS, Vanilla-JS als ES-Module), **kein Build-Schritt, keine Dependencies**. Gehostet über Cloudflare (Output-Verzeichnis `public/`). Alle Daten bleiben lokal im Browser (`localStorage`). UI-Sprache: **Deutsch**.

## Repo-Struktur

```
kopfrechner/
├─ README.md
├─ package.json        # {"type":"module"} + scripts: test = "node --test tests/*.test.js", dev = "python3 -m http.server 8080 -d public"
├─ .github/workflows/deploy.yml   # Push auf main → Tests → Cloudflare Pages (Projekt "mental-math")
├─ .gitignore
├─ docs/SPEC.md
├─ public/             # ← wird ausgeliefert
│  ├─ index.html
│  ├─ _headers         # Security-Header für Cloudflare
│  ├─ favicon.svg
│  ├─ css/style.css
│  └─ js/
│     ├─ numbers.js     # Formatieren, Parsen, Zufall          (Logik)
│     ├─ generators.js  # Kategorien, Aufgabentypen, Generatoren (Logik)
│     ├─ scoring.js     # Bewertung, Punkte, Skill, Schwächen   (Logik)
│     ├─ storage.js     # localStorage                          (Logik)
│     └─ app.js         # Router + alle Views                   (UI)
└─ tests/ numbers.test.js · generators.test.js · scoring.test.js  (node:test, node:assert)
```

## Seiten (Hash-Routing)

| Route | Inhalt |
|---|---|
| `#/` | Übersicht: Karte „Alle Kategorien“ + 8 Kategorie-Karten mit Skill-Badge und Anzahl Aufgaben; Rundenlänge 10/20/30; Banner „Schwächen trainieren“, falls Schwächen existieren |
| `#/train/<mode>` | Training. `mode` = Kategorie-ID, `all` oder `weak`. Nach der letzten Aufgabe: Ergebnis-Ansicht in derselben Route |
| `#/analyse` | Analyse: Kennzahlen, Schwächen, Kategorien, Fehlermuster, Verlauf, letzte Fehler, Export/Reset |

## Kategorien & Aufgabentypen

`rand(a,b)` = ganzzahlig inklusive. `pick([...])`. Zahlen in Prompts immer mit `fmt()` (de-DE). „tol“ = `{abs, rel}`; richtig, wenn `|given − expected| ≤ max(abs, rel·|expected|)`. Fehlt etwas: `abs: 0, rel: 0`. Generatoren **wiederholen intern**, bis die Bedingungen erfüllt sind. `expected` immer auf 4 Nachkommastellen runden (FP-Rauschen).

### `mult` Multiplikation — „2×1, 2×2, Quadrate“
| ID | Name | Regel → expected | Einheit/Hinweis | Ziel ms | weight | Tipp |
|---|---|---|---|---|---|---|
| `mult.2x1` | 2-stellig × 1-stellig | a=rand(12,99), b=rand(3,9) → a·b | | 5000 | 1 | Zerlegen: 76 × 8 = 70 × 8 + 6 × 8 |
| `mult.2x2` | 2-stellig × 2-stellig | a,b=rand(12,99), beide nicht durch 10 teilbar → a·b | | 20000 | 2 | Zerlegen: 34 × 27 = 34 × 25 + 34 × 2 |
| `mult.easy` | × 5 / 25 / 50 | f=pick([5,25,50]), a=rand(12,480) → a·f | | 8000 | 1 | × 5 = × 10 ÷ 2 · × 25 = × 100 ÷ 4 |
| `mult.square` | Quadrate | a=rand(13,99), nicht durch 10 teilbar → a² (Prompt „a²“ als „45 × 45“) | | 15000 | 1.5 | 45² = 40 × 50 + 5² |

### `div` Division — „Glatt, Dezimal, Runden“
| ID | Name | Regel | Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `div.exact` | Glatt teilen | d=pick([3,4,6,7,8,9,12,15,25]), q=rand(12,250) → Prompt „d·q ÷ d“, expected q | | 10000 | 1 | 1.248 ÷ 4 = 1.200 ÷ 4 + 48 ÷ 4 |
| `div.decimal` | Durch Dezimalzahlen | d=pick([0.2,0.25,0.4,0.5,0.8,1.5,2.5]), q=20·rand(1,40) → Prompt „q·d ÷ d“, expected q | | 12000 | 1.5 | ÷ 0,8 = × 10 ÷ 8 · ÷ 0,25 = × 4 |
| `div.round` | Teilen & runden | d=pick([6,7,8,9,11,12]), n=rand(200,2000) mit n%d≠0 → expected round(n/d), tol abs 1 | „auf ganze Zahl runden“ | 15000 | 1.5 | Überschlagen, dann korrigieren: 1.200 ÷ 7 ≈ 171 |

### `big` Große Zahlen — „Tsd., Mio., Mrd.“
Einheiten: Tsd.=1e3, Mio.=1e6, Mrd.=1e9. Zahlen in Prompts als „Mantisse + Einheit“ (z. B. „3,5 Mio.“); Werte < 1e3 ohne Einheit, mit Tausenderpunkt bis 999.999 erlaubt.
| ID | Name | Regel | Einheit | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `big.mult` | Multiplizieren | m=pick([1.2,1.5,2,2.5,3,3.5,4,4.5,5,6,7.5,8]) × U=pick([Tsd.,Mio.]), b=pick([20,30,40,50,60,80,200,300,400,500,2000,3000,4000,5000,20000,40000]); P=m·U·b; Ua = Mrd. wenn P≥1e9, sonst Mio. wenn P≥1e6, sonst Tsd.; expected P/Ua, tol abs 0.005 | Ua (z. B. „Mio.“) | 10000 | 1.5 | Ziffern rechnen, Nullen separat zählen: Tsd. = 10³, Mio. = 10⁶, Mrd. = 10⁹ |
| `big.div` | Dividieren | q=pick([2,3,4,5,6,8,12,15,20,25,30,40,50,60,75,80]), k=pick([3,4,5,6]), A=q·10^k; d=pick([200,300,400,500,2000,4000,5000,20000,40000,400000]); D=A·d, nur 1e5 ≤ D < 1e12; Ua = Mio. wenn A≥1e6, sonst Tsd.; Prompt „D ÷ d“, expected A/Ua, tol abs 0.005 | Ua | 15000 | 1.5 | 12 Mrd. ÷ 400.000 = (12 ÷ 4) × 10⁹⁻⁵ = 30.000 |
| `big.percapita` | Pro Kopf | T=0.5·rand(1,60) Mrd. €; Basis=pick([84 Mio. Einwohner, 41 Mio. Haushalte, 46 Mio. Erwerbstätige, 450 Mio. EU-Bürger]); Prompt „T Mrd. € verteilt auf Basis – wie viel € pro Kopf?“; expected T/Basis, tol rel 0.03 | „€“, Hinweis „±3 % ok“ | 15000 | 1.5 | Erst Einheiten kürzen: Mrd. ÷ Mio. = Tsd. → 2,4 Mrd. ÷ 84 Mio. = 2.400 ÷ 84 |

### `pct` Prozente — „Anteil, Veränderung, Rückwärts“
| ID | Name | Regel | Einheit/Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `pct.of` | x % von y | p=pick([3,5,8,10,12,15,17,20,25,30,35,40,45,60,75]), y=rand(4,96)·pick([10,100]) → p·y/100, tol abs 0.01 | | 10000 | 1 | 17 % = 10 % + 7 × 1 % · tauschen: 8 % von 50 = 50 % von 8 |
| `pct.change` | Veränderung in % | alt=pick([20,25,40,50,60,75,80,120,150,200,250,400]), r=pick([5,10,12.5,15,20,25,30,40,50]), Richtung steigt/sinkt; neu=alt·(1±r/100) muss ≤1 Nachkommastelle haben; Prompt „Umsatz steigt/sinkt von alt auf neu Mio. €. Um wie viel Prozent?“ → r | „%“ | 10000 | 1 | (neu − alt) ÷ alt – immer durch den alten Wert |
| `pct.reverse` | Rückwärts-Prozent | O=20·rand(2,20); Variante Rabatt r=pick([10,20,25,40,50]) → nach=O·(1−r/100) **oder** Erhöhung r=pick([10,20,25,50]) → nach=O·(1+r/100); Prompt „Nach r % Rabatt/Preiserhöhung kostet ein Produkt nach €. Ursprünglicher Preis?“ → O | „€“ | 15000 | 1.5 | Durch den Faktor teilen: 90 ÷ 0,75 = 120 |
| `pct.points` | Prozent vs. Prozentpunkte | m1=pick([4,5,8,10,12,15,20,25]), d=rand(1,5), m2=m1+d; Prompt „Die Marge steigt von m1 % auf m2 %. Um wie viel Prozent (nicht Prozentpunkte)?“ → d/m1·100, tol abs 0.1 | „%“, Hinweis „1 Nachkommastelle“ falls nicht ganzzahlig | 12000 | 1.5 | 8 % → 10 % = +2 Prozentpunkte = +25 % |
| `pct.chain` | Mehrere Änderungen | r1,r2=pick([+10,+20,+25,+50,−10,−20,−25,−50]) → ((1+r1/100)(1+r2/100)−1)·100, tol abs 0.05 | „%“, Hinweis „mit Vorzeichen, z. B. −4“ | 12000 | 1.5 | Faktoren multiplizieren: 1,2 × 0,8 = 0,96 → −4 % |

### `frac` Brüche — „Bruch ↔ Prozent“
| ID | Name | Regel | Einheit/Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `frac.topct` | Bruch → Prozent | n/d aus [1/2,1/3,2/3,1/4,3/4,1/5,2/5,3/5,4/5,1/6,5/6,1/7,1/8,3/8,5/8,7/8,1/9,1/10,1/11,1/12,1/15,1/20,1/25,1/40]; Prompt „3/8 in Prozent“ → n/d·100, tol abs 0.15 | „%“, Hinweis „1 Nachkommastelle“ falls nicht ganzzahlig | 5000 | 1 | Auswendig: 1/6 = 16,7 %, 1/7 ≈ 14,3 %, 1/8 = 12,5 %, 1/9 ≈ 11,1 % |
| `frac.of` | Bruch von Zahl | d=pick([3,4,5,6,8,12,25]), n=rand(1,d−1), y=d·rand(3,60)·pick([1,10]); Prompt „n/d von y“ → n·y/d | | 10000 | 1 | Erst ÷ Nenner, dann × Zähler: 640 ÷ 8 × 3 |

### `growth` Wachstum — „Zinseszins, 72er-Regel, CAGR“
| ID | Name | Regel | Einheit/Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `growth.compound` | Wachstum über Jahre | r=pick([2,3,4,5,6,8,10,15,20]), n=rand(2,5) (bei r≥15 max. 3); Prompt „r % Wachstum pro Jahr über n Jahre – Gesamtwachstum?“ → ((1+r/100)^n−1)·100, tol abs 0.5 / rel 0.02 | „%“, Hinweis „±2 % ok“ | 15000 | 2 | n × r + Zinseszins: 5 % über 3 Jahre ≈ 15 % + 1 % |
| `growth.rule72` | Verdopplungszeit | r=pick([2,3,4,6,8,9,12,18,24]); Prompt „Bei r % Wachstum p. a. – nach wie vielen Jahren verdoppelt sich der Wert (ca.)?“ → 72/r, tol rel 0.1 | „Jahre“ | 8000 | 1 | 72 ÷ Wachstumsrate |
| `growth.cagr` | Jährliche Rate (CAGR) | r=pick([5,10,20,25,50]), n=pick([2,3]), S=pick([100,200,400,800,1000]); E=S·(1+r/100)^n mit ≤ 2 Nachkommastellen; Prompt „Umsatz wächst in n Jahren von S auf E Mio. €. Jährliche Wachstumsrate?“ → r, tol abs 1 | „%“ | 20000 | 2 | Faktor 1,21 über 2 Jahre = 1,1² → 10 % p. a. |

### `biz` Business — „Payback, Break-even, Marge, ROI, TCO, FTE, SLA“
| ID | Name | Regel | Einheit/Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `biz.payback` | Payback | I=pick([2,3,4,5,6,8,10,12,15,20,24,30]) Mio. €, s=pick([0.5,1,1.5,2,2.5,3,4,5,6,8]) Mio. €/Jahr, I/s ≤ 10 → I/s, tol abs 0.06 | „Jahre“, Hinweis „1 Nachkommastelle“ | 10000 | 1 | Investition ÷ jährliche Ersparnis |
| `biz.breakeven` | Break-even-Menge | db=pick([5,8,10,12,15,20,25,40,50]), p=5·rand(4,40) mit p>db, v=p−db, Q=1000·rand(2,80), F=db·Q; Prompt „Fixkosten F €, Preis p €, variable Kosten v € pro Stück. Break-even-Menge?“ → Q | „Stück“ | 15000 | 1.5 | Fixkosten ÷ Deckungsbeitrag (Preis − variable Kosten) |
| `biz.margin` | Marge | R=pick([20,40,50,80,120,150,200,250,400,500]) Mio. €, m=pick([2,4,5,8,10,12,15,20,25]), G=R·m/100 (≤ 1 Nachkommastelle) → m | „%“ | 8000 | 1 | Gewinn ÷ Umsatz |
| `biz.roi` | ROI | C=pick([2,4,5,8,10,20]) Mio. €, roi=pick([10,20,25,40,50,75,100,150,200]), B=C·(1+roi/100) → roi | „%“ | 10000 | 1 | (Nutzen − Kosten) ÷ Kosten |
| `biz.tco` | TCO | O=pick([2,3,5,8,10,12,15]), A=pick([1.5,2,2.5,3,4,5,7.5,12,15,20]), n=pick([3,4,5]) → O+n·A | „Mio. €“ | 10000 | 1 | Einmalkosten + Jahre × laufende Kosten |
| `biz.fte` | FTE-Rechnung | V=pick([0.5,1,1.2,1.5,2,3]) Mio. Anfragen/Jahr, t=pick([3,4,5,6,8,10,12]) min, s=pick([10,20,25,30,40,50]) %, H=pick([1500,1600]) h/FTE; Prompt „V Mio. Anfragen/Jahr à t min, KI spart s % der Zeit. Wie viele FTE werden frei (H h pro FTE)?“ → V·1e6·t·s/100/60/H, tol rel 0.05 | „FTE“, Hinweis „±5 % ok“ | 25000 | 2 | Minuten → Stunden (÷ 60) → FTE (÷ Stunden pro FTE) |
| `biz.sla` | SLA-Ausfallzeit | a=pick([99,99.5,99.9,99.95,99.99]); Ausfall=(100−a)/100·8760 h; bei 99,99 in Minuten (×60), sonst Stunden → tol rel 0.05 | „h“ bzw. „min“, Hinweis „±5 % ok“ | 12000 | 1.5 | 1 Jahr = 8.760 h; 0,1 % davon ≈ 8,8 h |

### `est` Überschlag — „Schätzen auf ±8 %“
| ID | Name | Regel | Hinweis | Ziel | w | Tipp |
|---|---|---|---|---|---|---|
| `est.mult` | Multiplikation schätzen | a=rand(110,990) oder rand(1100,9900), b=rand(11,99) → a·b, tol rel 0.08 | „Schätzung, ±8 % ok“ | 6000 | 1 | Gegenläufig runden: 487 × 21 ≈ 500 × 20 |
| `est.div` | Division schätzen | n=rand(1000,99000), d=rand(13,97) → n/d, tol rel 0.08 | „Schätzung, ±8 % ok“ | 8000 | 1 | 7.830 ÷ 39 ≈ 8.000 ÷ 40 = 200 |
| `est.pct` | Prozent schätzen | p=rand(11,89) ohne Vielfache von 5, y=rand(1100,9900) → p·y/100, tol rel 0.08 | „Schätzung, ±8 % ok“ | 8000 | 1 | 23 % von 4.870 ≈ 25 % von 4.800 = 1.200 |

Kategorie-Metadaten (`CATEGORIES`, Reihenfolge = Anzeige): `{ id, name, description }` mit den Beschreibungen in Anführungszeichen oben (z. B. `mult` → „2×1, 2×2, Quadrate“).

## Bewertung

**Pro Aufgabe** (`evaluate(task, given, timeMs)`):
1. `given === null` → `errorType: 'skip'`
2. innerhalb Toleranz → `correct: true`, `errorType: null`
3. `expected ≠ 0`, `given ≠ 0`, `L = log10(|given/expected|)`, `k = round(L)`, `k ≠ 0` und `|L − k| < 0.02` → `'nullen'` (Nullen-Fehler)
4. `|given − expected| / |expected| ≤ 0.1` → `'knapp'`
5. sonst `'falsch'`

**Zeitfaktor:** `tf = clamp(1 − 0.6·(t − target)/(2·target), 0.4, 1)`, also 1 bei t ≤ Ziel und 0,4 ab 3 × Ziel.
**Punkte:** richtig → `round(100 · weight · tf)`; `'knapp'` → `round(20 · weight)`; sonst 0.

**Skill (0–100)** einer Liste von Versuchen (`skill(list, window = 25)`), basierend auf den letzten `window` Versuchen:
- `accuracy` = Anteil richtig
- `speed` = Mittelwert über die **richtigen** Versuche von `min(1, targetMs / timeMs)` (0, wenn keiner richtig)
- `score = round(100 · (0.7·accuracy + 0.3·speed))`, aber `null` bei n < 3
- zusätzlich `n`, `avgTimeMs`, `avgTargetMs`

**Schwächen** (`weaknesses(attempts, limit = 3)`): pro Aufgabentyp den Skill (window 25) berechnen, nur n ≥ 3 und score < 85. Grund: ≥ 2 Nullen-Fehler im Fenster → `'nullen'` („Nullen-Fehler“), sonst accuracy < 0,8 → `'ungenau'` („Ungenau“), sonst `'langsam'` („Zu langsam“). Aufsteigend nach Score sortiert.

**Farben für Scores:** ≥ 85 good · 60–84 warn · < 60 bad · null muted („neu“).

## Datenmodell (`localStorage['kopfrechner.v1']`)

```js
{
  version: 1,
  attempts: [{ ts, sessionId, mode, category, subtype, prompt, unit, expected, given, correct, errorType, timeMs, targetMs, weight, points }],
  sessions: [{ id, ts, mode, n, correct, points, avgTimeMs }],
  settings: { sessionLength: 10 }
}
```
`ts` = Epoch-ms. Jeder Versuch wird **sofort** gespeichert, eine Session erst am Rundenende. Maximal 5000 Versuche / 500 Sessions (älteste fliegen raus). Jeder Zugriff in try/catch, bei Fehler In-Memory-Fallback.

## Modul-APIs (Vertrag zwischen Logik und UI)

```js
// numbers.js
fmt(n, maxDecimals = 2) → string        // de-DE: 1234.5 → "1.234,5"; −4 → "−4" (U+2212)
fmtSeconds(ms) → string                 // 4230 → "4,2 s"
parseAnswer(str) → number | null        // trim; "", Unsinn → null; entfernt Leerzeichen, "€", "%";
                                        // "−" → "-"; enthält "," → alle "." weg, "," → "."; sonst /^-?\d{1,3}(\.\d{3})+$/ → "." weg
randInt(min, max, rng = Math.random) · pick(arr, rng = Math.random) · round(n, decimals)

// generators.js
CATEGORIES: [{ id, name, description }]                     // 8 Einträge, ohne 'all'/'weak'
SUBTYPES:   { [id]: { id, category, name, targetMs, weight, tip } }
generate(subtypeId, rng?) → Task
generateForMode(mode, { weakSubtypes = [] } = {}, rng?) → Task
   // Kategorie-ID → zufälliger Typ der Kategorie; 'all' → zufällige Kategorie, dann Typ;
   // 'weak' → zufällig aus weakSubtypes (leer → wie 'all')
Task = { id, mode?, category, subtype, prompt, unit, hint, expected, tolerance: { abs, rel }, targetMs, weight }

// scoring.js (importiert SUBTYPES/CATEGORIES)
timeFactor(timeMs, targetMs) → number
evaluate(task, given, timeMs) → { correct, errorType, points, timeFactor }
skill(attempts, window = 25) → { n, accuracy, speed, score, avgTimeMs, avgTargetMs }
categoryStats(attempts) → { [categoryId]: skill-Objekt }                // alle 8 Kategorien, auch leere
subtypeStats(attempts)  → { [subtypeId]: skill-Objekt }
overall(attempts) → skill(attempts, 100)
weaknesses(attempts, limit = 3) → [{ subtype, name, category, categoryName, score, accuracy, speed, avgTimeMs, targetMs, n, reason, label, tip }]
errorPatterns(attempts) → { nullen, knapp, falsch, skip }
sessionSummary(attempts) → { n, correct, accuracy, points, avgTimeMs }

// storage.js
load() · save(state) · getAttempts() · getSessions() · getSettings() · setSettings(partial)
addAttempt(attempt) · addSession(session) · resetAll() · exportJSON() → string
```

## Design

**Prinzipien:** ruhig, viel Weißraum, eine Akzentfarbe, Zahlen groß und mit `font-variant-numeric: tabular-nums`, keine Schatten außer Fokus-Ring, keine Animationen außer kurzen Übergängen (150 ms) und `prefers-reduced-motion` beachten. Hell/Dunkel automatisch über `prefers-color-scheme`.

```css
:root {
  --bg:#fafafa; --surface:#ffffff; --text:#18181b; --muted:#71717a; --border:#e4e4e7;
  --accent:#4f46e5; --accent-soft:#eef2ff; --on-accent:#ffffff;
  --good:#15803d; --good-soft:#f0fdf4; --warn:#b45309; --warn-soft:#fffbeb; --bad:#dc2626; --bad-soft:#fef2f2;
  --radius:14px; --radius-sm:10px;
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root {
  --bg:#0b0b0f; --surface:#141418; --text:#f4f4f5; --muted:#a1a1aa; --border:#27272a;
  --accent:#818cf8; --accent-soft:#1e1b4b; --on-accent:#0b0b0f;
  --good:#4ade80; --good-soft:#052e16; --warn:#fbbf24; --warn-soft:#451a03; --bad:#f87171; --bad-soft:#450a0a;
}}
```

**Layout:** Container `max-width: 720px`, Seitenrand 16px (≥ 640px: 24px), kein horizontales Scrollen. Header 56px, unten 1px-Linie: links Wortmarke (`×`-Quadrat in Akzentfarbe + „Kopfrechner“), rechts Links „Training“ und „Analyse“ (aktiver Link in Akzentfarbe). Karten: `--surface`, 1px `--border`, `--radius`, Padding 16–20px, beim Hover Rand in Akzentfarbe. Buttons: primär (Akzent-Hintergrund), sekundär (Rand), Höhe ≥ 44px. Badges: Pill mit Soft-Hintergrund und Textfarbe des Score-Levels.

```
ÜBERSICHT                                   TRAINING
┌ × Kopfrechner        Training Analyse ┐   ┌ ← Prozente            3 / 10 · 240 Pkt ┐
│ Kopfrechnen fürs Case Interview       │   │ ━━━━━━━━━━━━━━━━━━──────────────────── │
│ Länge  (10) 20  30                    │   │              x % VON Y                  │
│ ┌ Alle Kategorien              [72] ┐ │   │          17 % von 2.400                 │
│ │ Gemischt · 120 Aufgaben           │ │   │       auf 1 Nachkommastelle            │
│ └───────────────────────────────────┘ │   │      ┌──────────────────┬─────┐        │
│ ┌ Multiplikation ┐ ┌ Division      ┐   │   │      │       408        │  €  │        │
│ │ 2×1, 2×2, …    │ │ Glatt, …      │   │   │      └──────────────────┴─────┘        │
│ │ [85] 40 Aufg.  │ │ [neu]         │   │   │      [ Prüfen ↵ ]   [ Weiß nicht ]     │
│ └────────────────┘ └───────────────┘   │   │            4,2 s · Ziel 10 s           │
│ … (2 Spalten mobil, 3 ab 640px)        │   │ Feedback ersetzt die Buttons:          │
│ ┌ Schwächen trainieren →  (Akzent-Soft)┐│   │ ✓ Richtig · 4,2 s · +100 Pkt (good)   │
└────────────────────────────────────────┘   │ ✗ Nullen-Fehler · Richtig: 408 € · Tipp │
                                             │ [ Weiter ↵ ]                           │
ERGEBNIS                                     └────────────────────────────────────────┘
[ 820 Punkte ] [ 8/10 richtig ] [ Ø 6,1 s ] [ Skill 74 ]       (4 Kacheln, 2×2 mobil)
✓ 17 % von 2.400      408          4,2 s   +100
✗ 34 × 27             920 → 918   12,0 s      0
[ Nochmal ]  [ Analyse ]  [ Übersicht ]

ANALYSE
[ Skill 72 ] [ 340 Aufgaben ] [ 84 % richtig ] [ Ø 6,8 s ]
Deine Schwächen   → Karten: Name · Kategorie · Badge Score · Grund-Label · „50 % richtig · Ø 18 s (Ziel 15 s)“ · Tipp
                  [ Schwächen trainieren ]
Kategorien        → Zeile je Kategorie: Name · Balken (Breite = Score) · Score · „91 % · Ø 6 s · 40“
Fehlermuster      → 4 kleine Kacheln: Nullen-Fehler · Knapp daneben · Falsch · Übersprungen
Verlauf           → SVG-Linie Punkte pro Aufgabe der letzten 20 Runden (Achse dezent)
Letzte Fehler     → 10 Einträge: Prompt · „deine: 920 · richtig: 918“
Daten             → [ Export (JSON) ] [ Alles zurücksetzen ] (mit confirm())
```

**Interaktion Training:** Input `type="text"`, `inputmode="decimal"`, `autocomplete="off"`, `enterkeyhint="done"`, Autofokus. Enter = Prüfen bzw. Weiter, Escape = „Weiß nicht“. Der Timer startet beim Anzeigen der Aufgabe, aktualisiert sich alle 100 ms und stoppt beim Prüfen. Leere Eingabe + Enter tut nichts. Feedback in `aria-live="polite"`. „←“ bricht die Runde ab und führt zur Übersicht (bereits gespeicherte Versuche bleiben).

## Qualitätsregeln

- **Kein `innerHTML` mit dynamischen Daten.** DOM über einen Helfer `h(tag, attrs, ...children)` mit `textContent` bauen.
- **Keine Inline-`style`-Attribute und keine Inline-Skripte** (CSP `style-src 'self'`). Dynamische Breiten über `el.style.setProperty('--w', …)` (CSSOM ist erlaubt).
- Semantisches HTML (`header`, `nav`, `main`, `button`, `label`), sichtbarer Fokus, Kontrast ≥ 4,5 : 1.
- Keine externen Requests (keine Fonts, CDNs oder Analytics).
- `_headers`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.

---

# v2 – Lernen & KI-Erklärungen

**Problem:** Die Tipps sind generisch und helfen beim Lernen nicht. **Ziel:** Zu jeder Aufgabe gibt es einen **Lösungsweg mit den konkreten Zahlen**, zu jedem Aufgabentyp eine **ausführliche Methode** (Lernbereich) und optional eine **KI-Erklärung** (Google Gemini, Free Tier, nur auf Knopfdruck).

## Neue/geänderte Dateien

| Datei | Inhalt |
|---|---|
| `public/js/generators.js` | jede Task bekommt `params`; Modus = Subtyp-ID möglich |
| `public/js/solutions.js` | **neu:** `solutionSteps(task)` – Lösungsweg mit den Zahlen der Aufgabe |
| `public/js/methods.js` | **neu:** `METHODS` – Lernmethode pro Subtyp |
| `public/js/scoring.js` | Option `assisted` (Hilfe genutzt → halbe Punkte) |
| `public/js/ai.js` | **neu:** Client für `/api/explain` + sicherer Mini-Markdown-Parser |
| `server/explain.js` | **neu:** Validierung, Prompt, Gemini-Aufruf, Rate-Limit, `handleExplain()` |
| `functions/api/explain.js` | **neu:** Cloudflare Pages Function → `handleExplain` |
| `public/js/app.js`, `css/style.css`, `index.html` | Hilfe-Button, Lösungsweg, Methode, KI-Box, Lernbereich |

## API-Verträge

```js
// generators.js (erweitert)
Task.params: { [name]: number | string }   // ALLE Zufallswerte, aus denen Prompt & expected entstehen (JSON-serialisierbar)
generateForMode(mode, …)                    // zusätzlich: mode = Subtyp-ID (z. B. 'pct.of') → nur dieser Typ

// solutions.js
solutionSteps(task) → string[]              // braucht task.subtype, task.params, task.expected, task.unit
// 3–6 Schritte, deutsch, Zahlen mit fmt(), Rechenweg fürs KOPFRECHNEN (zerlegen, runden, Nullen separat zählen),
// nicht nur die Formel. Der LETZTE Schritt nennt das Ergebnis "= <fmt(expected)> <unit>".
// Schätz-Typen: erst gerundete Rechnung, dann "Exakt: <fmt(expected)>".
// Fehlen params (alte Versuche) → [].
// Beispiele:
//   34 × 27 → ["27 zerlegen: 27 = 25 + 2", "34 × 25 = 3.400 ÷ 4 = 850", "34 × 2 = 68", "850 + 68 = 918"]
//   17 % von 2.400 → ["10 % von 2.400 = 240", "1 % von 2.400 = 24, also 7 % = 7 × 24 = 168", "240 + 168 = 408"]
//   12 Mrd. ÷ 400.000 (in Tsd.) → ["Ziffern: 12 ÷ 4 = 3", "Nullen: 12 Mrd. = 12 × 10⁹, 400.000 = 4 × 10⁵ → 10⁹ ÷ 10⁵ = 10⁴",
//                                  "3 × 10⁴ = 30.000", "In Tsd.: 30.000 = 30 Tsd."]

// methods.js
METHODS: { [subtypeId]: { idea: string, steps: string[], trick: string, pitfalls: string[] } }  // alle 30 Subtypen
getMethod(subtypeId) → Method | null

// scoring.js (erweitert)
evaluate(task, given, timeMs, { assisted = false } = {})   // assisted && correct → points = round(points × 0,5)
skill(...)                                                // assisted-richtige zählen 0,5 für accuracy
// Attempt bekommt zusätzlich: params, assisted

// ai.js (Browser)
aiExplainTask(task, given) → Promise<{ ok: true, text } | { ok: false, error, message }>
aiExplainMethod(subtypeId)   → Promise<…gleich…>
isAiAvailable() → boolean      // false, sobald /api/explain mit 404/405/503 antwortet (sessionStorage 'kopfrechner.ai.off')
parseAiText(text) → Block[]    // Block = { type: 'p', parts } | { type: 'ol'|'ul', items: parts[] }
                               // parts = [{ text, bold, italic }]; unterstützt **fett**, *kursiv*, "1. ", "- ", "* ", Leerzeilen
// Cache: localStorage 'kopfrechner.ai.v1' (max. 100 Einträge, älteste raus), Key 't|subtype|prompt|given' bzw. 'm|subtype'.
// Timeout 20 s. message = deutsche Meldung: quota → "KI-Kontingent für heute aufgebraucht – versuch es später.",
// rate_limited → "Zu viele Anfragen – kurz warten.", sonst "KI gerade nicht erreichbar."
```

## Endpoint `POST /api/explain`

- **Request (JSON, max. 4.000 Zeichen):** `{ kind: 'task' | 'method', subtype, prompt?, params?, expected?, unit?, given? }`
- **Validierung:** `subtype` ∈ `SUBTYPES`; bei `task`: `prompt` String ≤ 160, `expected` endliche Zahl, `unit` ≤ 20, `given` null oder endliche Zahl, `params` Objekt ≤ 12 Keys mit Zahl oder String ≤ 40. Sonst 400 `{ error: 'invalid' }`. Freitext wird nie durchgereicht, damit der Endpoint kein allgemeiner LLM-Proxy ist.
- **Schutz:** `Origin`-Header muss vorhanden sein und zum Host passen (sonst 403). Best-Effort-Rate-Limit pro Isolate: 15/min und 200/Tag pro IP (`CF-Connecting-IP`), 60/min gesamt → 429 `{ error: 'rate_limited' }`. Andere Methoden → 405.
- **Gemini:** `POST https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || 'gemini-flash-lite-latest'}:generateContent`, Header `x-goog-api-key: env.GOOGLE_API_KEY`, Body `{ systemInstruction, contents, generationConfig: { temperature: 0.3, maxOutputTokens: 600 } }`. Text = `candidates[0].content.parts[].text`.
- **Fehler:** kein Key → 503 `not_configured` · Upstream 429 → 429 `quota` · sonst Upstream-Fehler oder leer → 502 `upstream`.
- **Antwort:** 200 `{ text, model }`, Header `Content-Type: application/json`, `Cache-Control: no-store`.
- **Prompt (deutsch):** Mathe-Coach für Consulting-Case-Interviews. Rechenweg fürs Kopfrechnen mit den konkreten Zahlen, nummerierte Schritte, deutsches Zahlenformat, kein LaTeX, am Ende ein Plausibilitätscheck und ein Merksatz. `task`: max. 120 Wörter; war `given` falsch, zuerst kurz den wahrscheinlichen Denkfehler nennen (z. B. Nullen-Fehler). `method`: max. 180 Wörter, für jemanden, dem der Typ schwerfällt, mit 2 eigenen Mini-Beispielen. Die App-Methode (`METHODS[subtype]`) wird als „bevorzugte Methode“ mitgegeben.
- Secret: `GOOGLE_API_KEY` als Cloudflare-Pages-Secret. Lokal über `.env` (nie committen).

## UI

- **Nav:** Training · Lernen · Analyse.
- **Routen:** `#/lernen`, `#/lernen/<subtypeId>` (öffnet die Karte und scrollt hin), `#/train/<subtypeId>` (Modus-Name „Kategorie · Subtyp“).
- **Training, vor dem Antworten:** dezenter Button „Wie geht das?“ zeigt die Methode (Idee, Schritte, Trick) über den Buttons an. Danach: `assisted = true` und Hinweis „Hilfe genutzt – halbe Punkte“.
- **Feedback nach dem Antworten:** Statuszeile wie bisher (die alte „Tipp“-Zeile entfällt), dann
  1. **Lösungsweg** (nummerierte Liste aus `solutionSteps`): bei Fehlern offen, bei richtigen Antworten als einklappbares `<details>` „Lösungsweg ansehen“
  2. `<details>` **„So löst du diesen Typ“**: Methode mit Idee, Schritten, Trick und typischen Fehlern, dazu ein Link „Im Lernbereich öffnen“ (neuer Tab)
  3. Button **„KI-Erklärung“** (nur wenn `isAiAvailable()`): Ladezustand „KI erklärt …“, danach `.ai-box` mit kleinem Label „KI · kann sich irren“, Text aus `parseAiText` gerendert (textContent, kein innerHTML). Fehler erscheinen als graue Meldung.
  4. „Weiter ↵“ bleibt primär und fokussiert. Enter auf `summary`/Buttons/Links löst kein „Weiter“ aus.
- **Ergebnis:** Jede Aufgabe hat ein einklappbares „Lösungsweg“, bei Fehlern ist es offen.
- **Analyse:** Schwächen-Karten bekommen „Lernen“ (`#/lernen/<id>`) und „Üben“ (`#/train/<id>`). „Letzte Fehler“ ist einklappbar mit Lösungsweg (wenn `params` vorhanden).
- **Lernen (`#/lernen`):** Einleitung in einer Zeile, dann pro Kategorie ein Abschnitt, pro Subtyp eine `<details class="learn-card">`. Die Zusammenfassung zeigt Name, Skill-Badge und Zielzeit. Der Inhalt:
  - Idee
  - „Vorgehen“ (ol)
  - Trick (Callout in `--accent-soft`)
  - „Typische Fehler“ (ul)
  - **Beispiel:** frische Aufgabe groß, Button „Lösung zeigen“ (zum Selbstversuch erst verborgen) und „Neues Beispiel“
  - Buttons „Üben“ (primär) und „KI: anders erklären“ (wenn verfügbar, Ergebnis in `.ai-box`)
- Neue CSS-Komponenten: `.method`, `.steps` (ol, tabular-nums), `.callout`, `.ai-box`, `details/summary` mit Chevron, `.learn-card`, `.btn.small`, `.linkbtn`. Gleiche Tokens, minimalistisch.

---

# v3 – Gamification, Lernsteuerung & Redesign

## Ziele
1. **iPhone-Minus-Bug:** `inputmode="decimal"` hat auf iOS keine Minus-Taste → ±-Button im Eingabefeld.
2. **Verlauf pro Kategorie** (Analyse).
3. **Fehler-Wiederholung über Tage** (Spaced Repetition, Leitner-Boxen pro Aufgabentyp).
4. **Klare Empfehlung** auf der Startseite („Heute: …“).
5. **PWA** (installierbar, offline außer KI).
6. **Tagesziel (Minuten, einstellbar) & Serie**, Heatmap, Level/XP.
7. **Schwierigkeitsstufen** 1–3 pro Aufgabentyp, „Automatisch“ als Standard.
8. **Redesign** nach Gemini-Empfehlung: Dark-first „Cyber Neon“, Bento-Kacheln, schwebende Tab-Leiste, Ringe, Heatmap, Sparklines mit Verlauf, Mikroanimationen, Themes, Einstellungsseite (Zahnrad oben rechts).

## Logik-APIs (neu/erweitert)

```js
// generators.js
generate(subtypeId, rng = Math.random, { level = 2 } = {})        // level 1 leicht · 2 mittel (= bisher) · 3 schwer
generateForMode(mode, { weakSubtypes = [], levelFor } = {}, rng)   // levelFor(subtypeId) → 1|2|3 (optional, default 2)
Task.level: 1|2|3     // Punkte-weight × LEVEL_WEIGHT[level] = { 1: 0.75, 2: 1, 3: 1.5 }; targetMs × { 1: 1, 2: 1, 3: 1.3 }
export const LEVEL_NAMES = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' }
// Jeder Subtyp bekommt eigene, sinnvolle Bereiche pro Level (L1 = glattere/kleinere Zahlen, L3 = mehr Stellen/krummere Werte).

// scoring.js
evaluate(task, given, timeMs, { assisted = false, untimed = false } = {})   // untimed → timeFactor 1
skill(...)  // untimed-Versuche fließen NICHT in speed ein (accuracy schon)
levelFor(subtypeId, attempts, setting)  // setting 'auto'|1|2|3; auto: Skill des Subtyps null oder <60 → 1, 60–84 → 2, ≥85 → 3

// review.js (neu) – Leitner pro Subtyp; Intervalle Box 0..4 = [1, 2, 4, 7, 14] Tage; Box > 4 → gemeistert (entfernt)
recordResult(reviews, { subtype, correct, ts, isReview }) → reviews   // reine Funktion, neues Objekt
   // !isReview: falsch → Item anlegen/zurücksetzen (box 0, due = ts + 1 Tag); richtig → nichts
   // isReview: richtig → box+1, due = ts + Intervall; falsch → box 0, due = ts + 1 Tag
dueReviews(reviews, now) → [{ subtype, box, dueAt }]  (fällig, nach dueAt sortiert)
nextDue(reviews) → ts | null
// reviews = { [subtype]: { box, dueAt, lastTs } }

// progress.js (neu) – Datum immer lokal 'YYYY-MM-DD'
dayKey(ts) → 'YYYY-MM-DD'
streakInfo(activity, goalMs, now) → { current, best, todayMs, goalMs, todayDone }
   // Serie = aufeinanderfolgende Tage mit activity ≥ goalMs, endend heute (falls erreicht) oder gestern
heatmap(activity, goalMs, now, weeks = 16) → [{ date, ms, level: 0..4 }]  // ältester zuerst, beginnt an einem Montag
dailySeries(attempts, { category = null, days = 14, now }) → [{ date, n, accuracy|null, speed|null }]
xpInfo(attempts) → { xp, level, into, needed }   // xp = Σ points; Level n braucht 500·n XP (kumulativ)
recommendation(attempts, reviews, now) → { kind: 'review'|'weak'|'new'|'mixed', mode, subtype|null, title, reason }
   // Priorität: fällige Wiederholungen (mode 'review') > schwächster Subtyp (weaknesses) > noch nie geübter Subtyp (CATEGORIES-Reihenfolge) > 'all'

// generators.generateForMode: zusätzlich mode 'review' → zufällig aus dueReviews (leer → 'all'); Aufrufer übergibt { reviewSubtypes }.

// storage.js (erweitert, gleicher Key kopfrechner.v1, fehlende Felder mit Defaults ergänzen)
settings: { sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto', timer: true, sound: false, haptics: true, celebrated: '' }
getReviews() · setReviews(reviews) · getActivity() · addActivityMs(ms, ts = Date.now())   // activity = { 'YYYY-MM-DD': ms }, max. 400 Tage
// Attempt zusätzlich: level, untimed, isReview
```

## Aktivitätszeit
Alle 5 s: Seite sichtbar **und** letzte Eingabe (pointerdown/keydown/input) < 60 s her → `addActivityMs(5000)`. Zählt auf allen Seiten (auch Lernen). Tagesziel erreicht → einmal pro Tag Konfetti + Toast „Tagesziel geschafft 🔥“ (`settings.celebrated = dayKey`).

## Routen
`#/` Training-Hub · `#/train/<mode>?n=5&intro=1` (n = Rundenlänge-Override, intro = erst Methode zeigen, dann „Los“) · `#/lernen[/<id>]` · `#/analyse` · `#/settings`. Modi: Kategorie-ID, Subtyp-ID, `all`, `weak`, `review`.

## Design-System
**Themes** über `<html data-theme="neon|oled|pastel">`; Einstellung `system` → `neon` bei dunklem, `pastel` bei hellem System.

| Token | neon (Standard) | oled | pastel |
|---|---|---|---|
| --bg | #121214 | #000000 | #F8F9FA |
| --surface | #1A1A1E | #161616 | #FFFFFF |
| --surface-2 | #222228 | #1F1F1F | #F1F3F5 |
| --border | #2A2A30 | #262626 | #E5E7EB |
| --text | #F4F4F5 | #FAFAFA | #18181B |
| --muted | #A1A1AA | #A3A3A3 | #6B7280 |
| --accent | #7C3AED | #06B6D4 | #4F46E5 |
| --accent-text (Links/Text) | #A78BFA | #22D3EE | #4338CA |
| --on-accent | #FFFFFF | #001014 | #FFFFFF |
| --streak | #F97316 | #F59E0B | #FF6B6B |
| --good | #10B981 | #22C55E | #059669 |
| --bad | #F43F5E | #EF4444 | #DC2626 |
| --warn | #F59E0B | #EAB308 | #D97706 |

Dazu `-soft`-Varianten (≈ 15 % Deckkraft der Farbe über `color-mix`), `--glow-accent`, `--glow-streak` (box-shadow-Werte; im Pastel-Theme weiche Schatten statt Glow), Radien 20/14/10 px. Schrift: `system-ui` (SF Pro auf iOS), Zahlen `tabular-nums`, große Aufgabe 2.5–3.5rem, Gewicht 700.

**Layout:** Topbar (Wortmarke links, Zahnrad `#/settings` rechts). **Schwebende Tab-Leiste** unten (Glas: halbtransparente Fläche + `backdrop-filter: blur`), 3 Tabs mit Icon + Label: Lernen · **Training** (Mitte) · Analyse; aktiver Tab als Akzent-Pill. `main` bekommt unten genug Abstand (inkl. `env(safe-area-inset-bottom)`). Max-Breite 720 px.

**CSS-Klassenvertrag** (Design-Agent stylt, UI-Agents benutzen exakt diese Namen; alle bisherigen Klassen aus app.js bleiben gestylt):
- Shell: `.topbar`, `.brand`, `.icon-btn`, `nav.tabbar` > `a.tab` (`.tab.active`) > `.tab-icon` + `.tab-label`
- Bento: `.bento` (2 Spalten) · `.tile` · `.span-2` · `.tile-streak` (`.is-hot` → Glow) · `.tile-score` · `.tile-hero` (Akzent-Verlauf, großer CTA) · `.tile-goal` · `.big-num` · `.label` · `.sub`
- `.level-badge` · `.progress` > `.progress-bar` (Breite über `--w` 0–100)
- `.cat-grid` > `a.cat-card` (Ring + `.cat-name` + `.cat-meta`) · `.chip` (`.chip.active`)
- Ringe: `svg.ring` (`.sm` 40px, `.md` 64px, `.lg` 120px) mit `circle.ring-track` + `circle.ring-value` + `text.ring-text`
- `.heatmap` (7 Zeilen, Spalten = Wochen, `grid-auto-flow: column`) > `.hm-cell[data-level="0..4"]`
- `.spark` mit `path.area` (Verlauf über `<linearGradient>` mit `stop.stop-a`/`stop.stop-b`) + `polyline.line`
- `.cat-history` (Karte pro Kategorie mit Sparkline, aufklappbar)
- Training: `.play` · `.timerbar` > `.timerbar-fill` (`--w`) · `.sign-toggle` (±-Button im `.answer`) · Feedback-Animation `.anim-pop` (richtig) / `.anim-shake` (falsch) · `.intro-card`
- Einstellungen: `.settings-section` · `.setting-row` (Label links, Steuerung rechts) · `.segmented` > `button` (`.active`) · `.theme-swatches` > `button.swatch[data-theme-value]` > `.swatch-dot` · `label.switch` > `input[type=checkbox]` + `.switch-track` · `select.select`
- `.toast` · `.confetti` > `.confetti-piece` (reines CSS, `prefers-reduced-motion` → keine Animation)

**JS-Bausteine** (`js/charts.js`, vom Design-Agent): `icon(name, { size })` (inline SVG, Namen: book, play, chart, gear, flame, star, target, repeat, check, x, chevron, sparkles, plus-minus, trophy, clock) · `ring(value0to1, { size: 'sm'|'md'|'lg', text, cls })` · `sparkline(values, { area: true, max })` (null-Werte = Lücke) · `heatmapGrid(cells)` · `progressBar(value0to100)` · `confetti()` (fügt `.confetti` in `body` ein, entfernt sich nach 3 s) · `toast(text)`. Nur DOM-API, keine Inline-`style`-Attribute (CSSOM `style.setProperty` ok).

## Seiten
- **Training-Hub `#/`:** Bento: `.tile-streak` (Flamme, aktuelle Serie, „Rekord n“) · `.tile-score` (Level-Badge, XP-Fortschritt) · `.tile-goal span-2` (Ring Tagesziel „12 / 30 min“) · `.tile-hero span-2` = Empfehlung („Heute: Rückwärts-Prozent“ + Grund + Button „Methode & 5 Aufgaben“ → `#/train/<subtype>?n=5&intro=1`; bei Wiederholungen „3 Wiederholungen fällig“ → `#/train/review`) · Schnellstart „Alle Kategorien“ · `.cat-grid` (Ring = Kategorie-Skill).
- **Training:** `.timerbar` oben (bei `timer: false` ausgeblendet, `untimed`), Aufgabe groß, Eingabe mit `.sign-toggle` (setzt/entfernt führendes „−“, Fokus bleibt im Feld), Level-Chip („Leicht/Mittel/Schwer“). Richtig → `.anim-pop` + optional Haptik `navigator.vibrate(15)`/Sound; falsch → `.anim-shake`. `intro=1` → zuerst `.intro-card` mit Methode + Beispiel-Lösungsweg, Button „Los geht's“. Ergebnisse wie bisher; jeder Versuch geht durch `recordResult`.
- **Analyse:** Kopf-Bento (Skill-Ring, Serie, heute Minuten, Genauigkeit) · Heatmap (16 Wochen) · Wiederholungen („n fällig · nächste am …“) · Schwächen · **Kategorien**: `.cat-history` je Kategorie mit Sparkline Genauigkeit (14 Tage) + Ø Zeit, aufklappbar mit Subtypen (Skill, Level) · Fehlermuster · letzte Fehler. (Export/Reset wandern in Einstellungen.)
- **Lernen:** wie bisher, im neuen Look (Karten mit Icon, Fortschritts-Ring pro Subtyp).
- **Einstellungen `#/settings`:** Darstellung (Theme-Swatches System/Neon/OLED/Pastel) · Training (Tagesziel 5/10/15/20/30/45/60 min, Schwierigkeit Automatisch/Leicht/Mittel/Schwer, Rundenlänge 5/10/20/30, Timer an/aus) · Feedback (Haptik, Sound) · Daten (Export, Zurücksetzen) · Über (Version, GitHub-Link).

## PWA
`public/manifest.webmanifest` (name „Mental Math“, short_name „Mental Math“, start_url „/“, display „standalone“, theme/background #121214, Icons 192/512 PNG + maskable), `public/sw.js` (Precache der statischen Dateien, Stale-While-Revalidate, `/api/` nie cachen, Versions-Konstante), `public/js/pwa.js` → `registerSW()`. `index.html`: manifest-Link, `theme-color`, `apple-touch-icon` (180 PNG), `apple-mobile-web-app-capable`. `_headers`: `/sw.js` mit `Cache-Control: no-cache`, `/manifest.webmanifest` mit `Content-Type: application/manifest+json`.

---

# v4 – Neue Kategorien, Auswahl-Aufgaben, Kategorienauswahl

## 1. Prozente als Dezimalzahl
`evaluate()`: Ist `task.unit === '%'`, zählt zusätzlich der Kandidat `given × 100` (0,15 → 15 %). Gilt für alle Prozent-Aufgaben.

## 2. Neue Kategorien (in `CATEGORIES` hinten anhängen)

| Kategorie | ID | Beschreibung |
|---|---|---|
| Einheiten | `units` | „Dimensionen, Umrechnen“ |
| Größenordnungen | `mag` | „Zehnerpotenzen, Schätzen“ |

| Subtyp-ID | Name | Art | Inhalt | Ziel ms | weight |
|---|---|---|---|---|---|
| `units.dimless` | Dimensionslos machen | **choice** | „Umsatz [€/Jahr] ÷ ? = dimensionslos“, „Kosten [€] ÷ ? = Anteil (dimensionslos)“, „Ausfallzeit [h/Jahr] ÷ ? = Anteil“ … Fehlende Einheit wählen. 4 Optionen, 1 richtig, Distraktoren = plausible Verwechslungen (Kehrwert, falsche Zeitbasis) | 10000 | 1 |
| `units.result` | Ergebnis-Einheit | **choice** | „[€/h] × [h/Jahr] = ?“, „[Stück/Tag] × [€/Stück] = ?“, „[€] ÷ [Mitarbeiter] = ?“ → Einheit des Ergebnisses | 10000 | 1 |
| `units.convert` | Einheiten umrechnen | number | „120 Tsd. €/Monat = ? Mio. €/Jahr“, „36 km/h = ? m/s“, „8 h/Tag × 220 Tage = ? h/Jahr“, „0,5 €/Min. = ? €/h“ | 15000 | 1.5 |
| `mag.exponent` | Zehnerpotenz einer Zahl | number | „4,2 Mrd. = a × 10^n (1 ≤ a < 10). n = ?“, auch Dezimalzahlen (0,003 → −3) | 6000 | 1 |
| `mag.facts` | Größenordnungen kennen | number | Bekannte Consulting-Größen, n = ⌊log10(Wert)⌋: Einwohner DE (8,4·10⁷ → 7), Haushalte DE (4,1·10⁷ → 7), Erwerbstätige DE (4,6·10⁷ → 7), EU (4,5·10⁸ → 8), Welt (8,2·10⁹ → 9), BIP DE in € (4,3·10¹² → 12), Sekunden/Jahr (3,15·10⁷ → 7), Stunden/Jahr (8.760 → 3), Arbeitsstunden/FTE/Jahr (1.700 → 3), Pkw in DE (4,9·10⁷ → 7) – die Antwort-Erklärung nennt den Wert | 8000 | 1 |
| `mag.product` | Größenordnung von Produkten | number | „3·10⁴ × 5·10⁵“ (Mantissen-Übertrag beachten → 1,5·10¹⁰ → 10), auch mit Einheiten-Wörtern („40 Mio. × 3.000“) | 10000 | 1.5 |
| `mag.ratio` | Größenordnung von Quotienten | number | „6 Mrd. ÷ 2.000“ → 3·10⁶ → 6; auch Ergebnisse < 1 (negativer Exponent) | 10000 | 1.5 |

Alle neuen Subtypen haben Level 1–3 (L1 glatte Zahlen/einfache Einheiten, L3 mehr Schritte), `params`, `solutionSteps` (3–6 Schritte, letzter Schritt enthält die richtige Antwort; bei choice den Text der richtigen Option) und eine Methode in `METHODS`.

## 3. Auswahl-Aufgaben (choice)
```js
Task = { …, kind: 'choice', choices: ['€/Jahr', '€', 'Jahr', '1/Jahr'], expected: 0 /* Index */, unit: '', tolerance: { abs: 0, rel: 0 },
         params: { …, c0, c1, c2, c3 /* Optionstexte als Strings, damit /api/explain sie validiert */ } }
// Numerische Tasks: kind fehlt oder 'number'.
evaluate(choiceTask, givenIndex, timeMs) → correct bei Gleichheit; Fehler immer errorType 'falsch' (nie 'nullen'/'knapp'), null → 'skip'.
// Optionen werden gemischt; die richtige Option steht an zufälligem Index.
```
**UI:** statt Eingabe/Tastenfeld ein 2×2-Raster `.choices` mit `button.choice` (groß, ≥ 56 px); Tipp = sofort prüfen. Tastatur: 1–4 wählt Option. Nach dem Prüfen: richtige Option `.is-correct`, falsch gewählte `.is-wrong`, alle deaktiviert. Feedback „Richtig: <Optionstext>“. Attempt speichert zusätzlich `kind` und `choices`, damit Ergebnis/Analyse Texte statt Indizes zeigen. KI-Erklärung: Server übersetzt `given`-Index über `params.c0…c3` in Text.

## 4. Kategorienauswahl
`settings.enabledCategories`: `null` (= alle) oder Array von Kategorie-IDs (mind. 1).
- `generators.activeCategories(enabled) → CATEGORIES gefiltert` (null → alle).
- `generateForMode('all' | 'weak' | 'review', { enabledCategories, … })`: nur Subtypen aktiver Kategorien (weak/review: filtern; leer → wie 'all').
- `progress.recommendation(attempts, reviews, now, { enabledCategories })` und `scoring.weaknesses(attempts, limit, { enabledCategories })` filtern ebenso.
- **Startseite:** Kategorie-Raster und „Alle Kategorien“ nur mit aktiven Kategorien. **Analyse:** Kategorien-Karten nur aktive (Daten bleiben erhalten). **Lernen:** zeigt weiterhin alle.
- **Einstellungen:** Abschnitt „Kategorien“ mit Chips/Schaltern je Kategorie (Name + Beschreibung), „Alle“-Knopf; die letzte aktive lässt sich nicht abwählen.
