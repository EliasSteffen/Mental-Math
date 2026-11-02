# learning-engine

Lernstand-Modell der App, als eigenes Paket: Es berechnet den Skill je Aufgabentyp, findet Schwächen und sagt warum, wählt die Schwierigkeitsstufe, plant Wiederholungen (Leitner) und empfiehlt die nächste Runde. Dazu kommt ein **Labor**, mit dem sich das Modell getrennt von der App trainieren, vergleichen und testen lässt. Das Paket ist DOM-frei, hat keine Abhängigkeiten und kennt keine App-Begriffe; Namen, Texte und Übersetzungen ergänzt die App.

```
App (src/core/scoring.ts, progress.ts, review.ts, train/diagnosis.ts)
  │  Katalog (SUBTYPES), aktive Kategorien, Texte
  ▼
learning-engine            ← Modell: reine Funktionen + EngineConfig
learning-engine/lab        ← Labor: Simulation, Replay, Kennzahlen, Tuning (nicht im App-Bundle)
```

## Modell

Eingabe sind bewertete Antworten (`Observation`). Der Typ ist bewusst eine Teilmenge des App-Typs `Attempt`, damit ein Export der App ohne Umbau hineinpasst. Die Bewertung einer einzelnen Antwort (richtig, Nullen-Fehler, knapp …) bleibt in der App (`evaluate`), denn sie hängt am Aufgabenformat.

| Funktion | Zweck |
|---|---|
| `skillStats(obs, cfg?, window?)` | Genauigkeit, Tempo und Score 0–100 der letzten `window` Antworten |
| `statsBy(obs, 'subtype' \| 'category', ids)` · `overallStats(obs)` | Skill je Aufgabentyp/Kategorie bzw. gesamt |
| `levelFromScore(score)` · `adaptiveLevel(subtype, obs)` | Stufe 1–3 aus dem Score |
| `findDeficits(obs, { catalog, categories?, limit? })` | Schwächen, die schwächste zuerst, mit Diagnose `nullen` / `ungenau` / `langsam` |
| `recordResult` · `dueReviews` · `nextDue` | Leitner-Boxen je Aufgabentyp |
| `nextStep(obs, reviews, now, { catalog, categories?, newCategories })` | Empfehlung: Wiederholung → Schwäche → Neues → gemischt |
| `roundInsight(items)` · `errorPatterns(obs)` | häufigste Fehlerart einer Runde, Fehler nach Art |

Alle Schwellen stehen in `EngineConfig` (`DEFAULT_CONFIG` = Verhalten der App bis 1.15). `resolveConfig(patch)` prüft die Wertebereiche:

| Parameter | Standard | Wirkung |
|---|---|---|
| `window` | 25 | Fenster je Aufgabentyp |
| `overallWindow` | 100 | Fenster für den Gesamt-Skill |
| `minAttempts` | 3 | darunter kein Score |
| `accuracyWeight` / `speedWeight` | 0,7 / 0,3 | Gewichte im Score |
| `assistedCredit` | 0,5 | Anrechnung mit Hilfe |
| `level2Score` / `level3Score` | 60 / 85 | Schwellen der adaptiven Stufe |
| `deficitScore` | 85 | darunter Schwäche |
| `zeroErrorMin` | 2 | so viele Nullen-Fehler → Diagnose „nullen“ |
| `accuracyFloor` | 0,8 | darunter „ungenau“, sonst „langsam“ |
| `reviewIntervalsDays` | 1, 2, 4, 7, 14 | Leitner-Intervalle |

## Labor (`learning-engine/lab`)

Das Labor ersetzt das Bauchgefühl beim Ändern des Modells durch Messungen. Es hat drei Werkzeuge.

1. **Simulation mit bekannter Wahrheit.** Synthetische Lernende haben je Aufgabentyp festes Können, Tempo und eine Neigung zu Nullen-Fehlern; einige Typen tragen eine eingepflanzte Schwäche. Optional lernen und vergessen sie.
   - `simulateDetection` misst, ob `findDeficits` die eingepflanzten Schwächen findet (Precision, Recall, F1, Diagnose, Top 3).
   - `simulatePolicy` misst, ob man schneller besser wird, wenn man den Empfehlungen folgt. Es vergleicht `recommended`, `weak-mode` und `mixed`.
2. **Replay echter Daten.** `loadObservations(export)` liest einen Export der App (Profil → Daten → Exportieren). `replay` spielt die Antworten zeitlich ab und misst, wie gut ein Modell die jeweils nächste vorhersagt: Brier, Log-Loss, AUC und Kalibrierung. `trainTestSplit` wählt Parameter auf dem vorderen Teil und prüft auf dem hinteren. Vorhersage-Modelle implementieren `Predictor` (`predict` → `update`). Mitgeliefert sind `baseRate`, `windowAccuracy` (das heutige Modell) und `elo`.
3. **Tuning.** `gridSearch` ist eine Raster-Suche über beliebige Parameter. `tuneDetection` sucht damit die `EngineConfig` mit dem besten F1 in der Simulation.

```bash
npm run lab                                    # Erkennung + Strategien (Simulation)
npm run lab -- detect --learners 100
npm run lab -- policy --days 28
npm run lab -- tune
npm run lab -- replay ~/Downloads/mental-math-export.json
```

(Im Wurzelverzeichnis; dort leitet `npm run lab` an dieses Paket weiter. Im Paket selbst: `npm run lab -- …`.)

### Stand (Simulation, 24 Aufgabentypen, 3 Schwächen je Person)

| Ø Antworten je Typ | Precision | Recall | Diagnose richtig | Recall „nullen“ |
|---|---|---|---|---|
| 5 | 46 % | 64 % | 69 % | 54 % |
| 15 | 57 % | 84 % | 92 % | 59 % |
| 25 | 64 % | 83 % | 93 % | 56 % |

Nach 21 Tagen mit 2 Runden à 10 Aufgaben pro Tag sind noch so viele der anfangs schwachen Typen unter Score 85: 34 % mit `recommended`, 18 % mit `weak-mode`, 80 % mit `mixed`.

Was daraus folgt (Details in [docs/ROADMAP.md](../../docs/ROADMAP.md)):
- Fehlalarme kommen vor allem daher, dass der Score die Stufe nicht berücksichtigt. Auf Stufe 3 sinkt die Genauigkeit, also gilt der Typ als schwach, die Stufe fällt und der Typ erholt sich wieder.
- Nullen-Fehler bei sonst ordentlicher Genauigkeit fallen durchs Raster, weil die Diagnose nur innerhalb von Schwächen greift.
- Im Replay sagt `elo` die nächste Antwort besser voraus als das Fenster-Modell. Das Fenster-Modell ist zudem überkonfident: 25/25 richtig ergibt fast 100 %.

### Qualitäts-Schranken

`tests/lab.test.ts` legt fest, was das Modell in der Simulation mindestens leisten muss: Recall, F1, Diagnose, Vorsprung der Empfehlungen vor gemischtem Üben und Trennschärfe der Vorhersage. Wer das Modell ändert, darf diese Werte verbessern, aber nicht unterschreiten. Die Simulation ist mit festem Seed reproduzierbar.

## Entwicklung

```bash
npm test -w learning-engine        # Modell + Labor (node --test, < 1 s)
npm run typecheck -w learning-engine
npm run build -w learning-engine   # dist/ (die App bündelt es über src/vendor/learning.ts)
```

Ein neues Modell entsteht in drei Schritten.
1. Als `Predictor` im Labor bauen und per Replay und Simulation mit dem heutigen vergleichen.
2. Erst wenn es besser ist, in die Modell-Funktionen übernehmen.
3. Die Schranken anheben.
