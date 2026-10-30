import type { Method } from '../types.ts';

// Lernmethoden pro Aufgabentyp (Schema: docs/SPEC.md, v2).
// Genutzt von server/explain.js (bevorzugte Methode im KI-Prompt) und public/js/app.js (Lernbereich, „Wie geht das?“).

export const METHODS: Record<string, Method> = {
  'mult.2x1': {
    idea: 'Du musst nie eine zweistellige Zahl am Stück malnehmen. Zerlege sie in Zehner und Einer, rechne beide Teile einzeln und addiere.',
    steps: [
      'Zerlege die zweistellige Zahl in Zehner und Einer.',
      'Multipliziere den Zehner-Teil mit der einstelligen Zahl (Ziffern rechnen, Null anhängen).',
      'Multipliziere den Einer-Teil mit der einstelligen Zahl.',
      'Addiere beide Teilergebnisse.',
    ],
    trick: '76 × 8 = 70 × 8 + 6 × 8 = 560 + 48 = 608. Liegt die Zahl knapp unter einem Zehner, rechne rückwärts: 69 × 6 = 70 × 6 − 6 = 420 − 6 = 414.',
    pitfalls: [
      'Die Null beim Zehner-Teil vergessen (7 × 8 = 56 heißt hier 560, nicht 56).',
      'Beim Addieren den Übertrag verlieren: erst die Zehner (560 + 40), dann die Einer (+ 8).',
    ],
  },
  'mult.2x2': {
    idea: 'Zerlege den zweiten Faktor so, dass ein Teil ein „glatter“ Rechenfaktor ist (10, 20, 25, 50). Dann bleiben nur zwei einfache Teilprodukte.',
    steps: [
      'Wähle den Faktor, den du leichter zerlegen kannst (z. B. nahe an 20, 25, 30, 50 oder 100).',
      'Zerlege ihn in einen glatten Teil plus oder minus einen kleinen Rest.',
      'Rechne die Teilprodukte einzeln (× 25 = × 100 ÷ 4, × 20 = × 2 mit angehängter Null).',
      'Addiere (oder subtrahiere) die Teilprodukte.',
    ],
    trick: '34 × 27 = 34 × 25 + 34 × 2 = 850 + 68 = 918. Alternativ 27 = 30 − 3: 34 × 30 − 34 × 3 = 1.020 − 102 = 918.',
    pitfalls: [
      'Beim Zerlegen einen Teil vergessen, z. B. nur 34 × 25 rechnen und den Rest weglassen.',
      'Bei „minus“-Zerlegung den Rest addieren statt abziehen.',
      'Beide Zahlen gleichzeitig zerlegen (4 Teilprodukte) – zerlege nur eine, das spart Merkaufwand.',
    ],
  },
  'mult.easy': {
    idea: '5, 25 und 50 sind Bruchteile von 10, 100 und 100. Statt zu multiplizieren, hängst du Nullen an und halbierst oder viertelst.',
    steps: [
      '× 5: erst × 10, dann ÷ 2.',
      '× 25: erst × 100, dann ÷ 4 (zweimal halbieren).',
      '× 50: erst × 100, dann ÷ 2.',
      'Bei ungeraden Zahlen: halbiere in Teilen (Hunderter, Zehner, Einer) oder rechne mit Dezimalstellen.',
    ],
    trick: '48 × 25 = 4.800 ÷ 4 = 1.200. Und 86 × 5 = 860 ÷ 2 = 430; 46 × 50 = 4.600 ÷ 2 = 2.300.',
    pitfalls: [
      'Bei × 25 nur durch 2 statt durch 4 teilen.',
      'Bei × 50 die falsche Nullenzahl: 50 = 100 ÷ 2, also zwei Nullen anhängen, nicht eine.',
    ],
  },
  'mult.square': {
    idea: 'Ein Quadrat lässt sich als Produkt zweier symmetrischer Nachbarn plus Rest schreiben: a² = (a − d) × (a + d) + d². Wähle d so, dass einer der Faktoren glatt wird.',
    steps: [
      'Runde a auf den nächsten Zehner und nenne den Abstand d.',
      'Bilde (a − d) und (a + d); einer der beiden ist ein glatter Zehner.',
      'Multipliziere die beiden Zahlen (Ziffern rechnen, Null anhängen).',
      'Addiere d² (bei d ≤ 5 höchstens 25).',
    ],
    trick: '45² = 40 × 50 + 5² = 2.000 + 25 = 2.025. Und 67² = 64 × 70 + 3² = 4.480 + 9 = 4.489. Zahlen auf 5 enden immer auf …25.',
    pitfalls: [
      'd² vergessen oder d statt d² addieren.',
      'Nicht symmetrisch rechnen: (a − d) und (a + d) müssen denselben Abstand zu a haben.',
    ],
  },

  'div.exact': {
    idea: 'Teile in passende Blöcke auf, die du direkt durch den Teiler dividieren kannst, und addiere die Ergebnisse. Das ist die Umkehrung des Zerlegens beim Multiplizieren.',
    steps: [
      'Spalte die Zahl in einen glatten Block (Vielfaches des Teilers, z. B. Hunderter oder Tausender) und einen Rest.',
      'Teile den glatten Block durch den Teiler.',
      'Teile den Rest durch den Teiler.',
      'Addiere beide Ergebnisse. Probe: Ergebnis × Teiler muss die Ausgangszahl ergeben.',
    ],
    trick: '1.248 ÷ 4 = 1.200 ÷ 4 + 48 ÷ 4 = 300 + 12 = 312. Bei ÷ 25: erst ÷ 100, dann × 4: 1.650 ÷ 25 = 16,5 × 4 = 66.',
    pitfalls: [
      'Den Rest vergessen und nur den glatten Block teilen.',
      'Die Stelle verschieben: 300 + 12 ergibt 312, nicht 3.012.',
    ],
  },
  'div.decimal': {
    idea: 'Durch eine Dezimalzahl teilen heißt mit ihrem Kehrwert malnehmen. Verschiebe das Komma bei beiden Zahlen, bis du durch eine ganze Zahl teilst.',
    steps: [
      'Erkenne den Bruch: 0,5 = ½, 0,25 = ¼, 0,2 = ⅕, 0,4 = ⅖, 0,8 = ⅘.',
      'Bei 0,25 / 0,5 / 0,2: einfach mit 4 / 2 / 5 multiplizieren.',
      'Sonst Komma bei Teiler und Zahl gleich weit verschieben (× 10) und durch die ganze Zahl teilen.',
      'Plausibilität: Teilen durch eine Zahl kleiner als 1 macht das Ergebnis größer.',
    ],
    trick: '360 ÷ 0,8 = 3.600 ÷ 8 = 450. Und 90 ÷ 0,25 = 90 × 4 = 360; 75 ÷ 1,5 = 750 ÷ 15 = 50.',
    pitfalls: [
      'Das Komma nur beim Teiler verschieben und bei der Zahl nicht (Ergebnis dann um Faktor 10 falsch).',
      'Das Ergebnis kleiner statt größer angeben, obwohl du durch weniger als 1 teilst.',
      '÷ 0,25 mit ÷ 4 verwechseln – richtig ist × 4.',
    ],
  },
  'div.round': {
    idea: 'Überschlage mit einem Vielfachen des Teilers in Reichweite und korrigiere den kleinen Rest. Auf eine ganze Zahl genau reichen ein bis zwei Schritte.',
    steps: [
      'Finde ein bekanntes Vielfaches des Teilers nahe an der Zahl (z. B. 7 × 170 = 1.190).',
      'Bestimme den Rest: Zahl minus Vielfaches.',
      'Teile den Rest grob durch den Teiler (Bruchteil von 1 bis ca. 10).',
      'Addiere und runde auf die ganze Zahl.',
    ],
    trick: '1.200 ÷ 7: 7 × 170 = 1.190, Rest 10, 10 ÷ 7 ≈ 1,4 → 171,4 ≈ 171. Für ÷ 11: Zahl durch 10 teilen, dann etwa 10 % abziehen.',
    pitfalls: [
      'Ab- statt aufrunden, wenn die Nachkommastelle ≥ 0,5 ist.',
      'Den Rest ignorieren und nur das gerundete Vielfache nennen.',
    ],
  },

  'big.mult': {
    idea: 'Trenne Ziffern und Nullen. Rechne nur die kleinen Zahlen und zähle die Zehnerpotenzen separat: Tsd. = 10³, Mio. = 10⁶, Mrd. = 10⁹.',
    steps: [
      'Schreibe jede Zahl als Ziffern × Zehnerpotenz (3,5 Mio. = 3,5 × 10⁶; 400 = 4 × 10²).',
      'Multipliziere die Ziffernteile (3,5 × 4 = 14).',
      'Addiere die Exponenten (10⁶ × 10² = 10⁸).',
      'Setze zusammen und wandle in die passende Einheit um (14 × 10⁸ = 1,4 × 10⁹ = 1,4 Mrd.).',
    ],
    trick: '3,5 Mio. × 400 = (3,5 × 4) Mio. × 100 = 14 Mio. × 100 = 1.400 Mio. = 1,4 Mrd.',
    pitfalls: [
      'Nullen verzählen: „Mio. × 100“ sind zwei Nullen mehr, also 1.400 Mio. und nicht 140 Mio.',
      'Bei der Umwandlung 1.000 Mio. = 1 Mrd. nicht beachten.',
      'Die Einheit der Aufgabe (Tsd./Mio./Mrd.) am Ende nicht anpassen.',
    ],
  },
  'big.div': {
    idea: 'Auch beim Teilen trennst du Ziffern und Nullen: Ziffern teilen, Exponenten subtrahieren. So rechnest du nie mit langen Nullenketten.',
    steps: [
      'Schreibe Zähler und Nenner als Ziffern × Zehnerpotenz (12 Mrd. = 12 × 10⁹; 400.000 = 4 × 10⁵).',
      'Teile die Ziffernteile (12 ÷ 4 = 3).',
      'Subtrahiere die Exponenten (10⁹ ÷ 10⁵ = 10⁴).',
      'Setze zusammen (3 × 10⁴ = 30.000) und wandle in die gefragte Einheit um (30 Tsd.).',
    ],
    trick: '12 Mrd. ÷ 400.000 = (12 ÷ 4) × 10⁹⁻⁵ = 3 × 10⁴ = 30.000 = 30 Tsd. Probe: 30.000 × 400.000 = 12.000.000.000.',
    pitfalls: [
      'Exponenten addieren statt subtrahieren.',
      'Beim Nenner die Nullen falsch zählen (400.000 hat 5 Nullen-Stellen, also 4 × 10⁵).',
      'Das Ergebnis in der falschen Einheit nennen: 30.000 ist 30 Tsd., nicht 30 Mio.',
    ],
  },
  'big.percapita': {
    idea: 'Kürze zuerst die Einheiten, dann rechnest du nur noch mit kleinen Zahlen. Mrd. ÷ Mio. ist ein Faktor 1.000.',
    steps: [
      'Bringe beide Zahlen auf dieselbe Einheit (2,4 Mrd. = 2.400 Mio.).',
      'Teile die Zahlen vor der Einheit (2.400 ÷ 84); die Einheiten Mio. ÷ Mio. fallen weg.',
      'Rechne grob: kürze oder runde den Nenner (84 ≈ 85, 2.400 ÷ 85 ≈ 28).',
      'Prüfe die Größenordnung: Euro pro Kopf bei Mrd. € und Mio. Einwohnern liegt meist im zwei- bis dreistelligen Bereich.',
    ],
    trick: '2,4 Mrd. € ÷ 84 Mio. = 2.400 Mio. € ÷ 84 Mio. = 2.400 ÷ 84 ≈ 28,6 €. Probe: 84 × 28,6 ≈ 2.400.',
    pitfalls: [
      'Mrd. und Mio. nicht angleichen und um den Faktor 1.000 danebenliegen.',
      'Bei genau 3 % Toleranz zu stark runden – runde den Nenner höchstens um 1–2 %.',
    ],
  },

  'pct.of': {
    idea: 'Baue jeden Prozentsatz aus 10 %- und 1 %-Blöcken. Beide bekommst du durch Kommaverschieben, ohne zu rechnen.',
    steps: [
      '10 % = Komma um eine Stelle nach links; 1 % = Komma um zwei Stellen.',
      'Zerlege den Prozentsatz in Blöcke (17 % = 10 % + 5 % + 2 %; 5 % = die Hälfte von 10 %).',
      'Bilde die Teilwerte und addiere.',
      'Bei krummen Zahlen: tausche Prozentsatz und Basis (x % von y = y % von x).',
    ],
    trick: '17 % von 2.400 = 240 + 7 × 24 = 240 + 168 = 408. Tausch: 8 % von 50 = 50 % von 8 = 4.',
    pitfalls: [
      '10 % und 1 % verwechseln (Komma nur um eine Stelle statt zwei verschoben).',
      'Einen Block doppelt addieren oder vergessen.',
    ],
  },
  'pct.change': {
    idea: 'Die prozentuale Veränderung misst die Differenz immer am Ausgangswert, also am alten Wert.',
    steps: [
      'Bilde die Differenz: neu − alt (mit Vorzeichen).',
      'Teile durch den alten Wert (nie durch den neuen).',
      'Wandle in Prozent um: Bruch kürzen und mit bekannten Brüchen vergleichen (¼ = 25 %, ⅕ = 20 %, ⅛ = 12,5 %).',
      'Prüfe das Vorzeichen: Anstieg ist positiv, Rückgang negativ.',
    ],
    trick: '80 → 100: Differenz 20, 20 ÷ 80 = ¼ = 25 %. Von 100 → 80: −20 ÷ 100 = −20 % (nicht −25 %).',
    pitfalls: [
      'Durch den neuen statt den alten Wert teilen.',
      'Ein Anstieg um 25 % und ein Rückgang um 25 % heben sich nicht auf – die Basis ist jeweils anders.',
    ],
  },
  'pct.reverse': {
    idea: 'Der Endpreis ist der Ursprungspreis mal einem Faktor. Um zurückzurechnen, teilst du durch diesen Faktor. Prozente vom Endpreis addieren führt in die Irre, weil sie sich auf eine andere Basis beziehen.',
    steps: [
      'Bestimme den Faktor: 25 % Rabatt → 0,75; 10 % Erhöhung → 1,1.',
      'Teile den Endpreis durch den Faktor. Tipp: Mach daraus einen Bruch (0,75 = ¾).',
      'Alternative mit Teilen: 75 % entsprechen 3 gleichen Teilen. Ein Teil ist Endpreis ÷ 3, das Ganze sind 4 Teile.',
      'Probe: Ursprungspreis × Faktor muss den Endpreis ergeben.',
    ],
    trick: '25 % Rabatt, Endpreis 90 €: 90 ÷ 0,75 = 120 €. Mit Teilen: 90 ÷ 3 = 30 pro Teil, × 4 = 120. Bei +10 % und Endpreis 66 €: 66 ÷ 1,1 = 60 €.',
    pitfalls: [
      'Bei Rabatt rückwärts nicht 25 % von 90 addieren (ergibt 112,50) – sondern 90 ÷ 0,75 = 120.',
      'Mit dem falschen Faktor teilen: 25 % Rabatt heißt 0,75, nicht 0,25 oder 1,25.',
      'Bei einer Erhöhung subtrahieren statt durch 1,1 zu teilen (66 − 10 % = 59,4 ist falsch).',
    ],
  },
  'pct.points': {
    idea: 'Prozentpunkte sind die Differenz zweier Prozentwerte. Die prozentuale Veränderung setzt diese Differenz ins Verhältnis zum Startwert.',
    steps: [
      'Berechne die Differenz in Prozentpunkten: neuer Wert − alter Wert.',
      'Teile diese Differenz durch den alten Prozentwert.',
      'Wandle in Prozent um (Bruch mit bekannten Brüchen vergleichen).',
      'Formuliere sauber: „+2 Prozentpunkte“ ist nicht „+2 %“.',
    ],
    trick: 'Marge 8 % → 10 %: +2 Prozentpunkte, 2 ÷ 8 = ¼ = +25 %. Marge 20 % → 25 %: 5 ÷ 20 = +25 %.',
    pitfalls: [
      'Die Prozentpunkt-Differenz als relative Veränderung angeben (also „+2 %“ statt „+25 %“).',
      'Durch den neuen statt den alten Prozentwert teilen.',
    ],
  },
  'pct.chain': {
    idea: 'Aufeinanderfolgende Änderungen wirken multiplikativ, nicht additiv. Rechne mit Faktoren und multipliziere sie.',
    steps: [
      'Wandle jede Änderung in einen Faktor um (+20 % → 1,2; −25 % → 0,75).',
      'Multipliziere die Faktoren (1,2 × 0,8 = 0,96).',
      'Ziehe 1 ab und rechne in Prozent um (0,96 − 1 = −0,04 → −4 %).',
      'Kurzcheck: Bei kleinen Zahlen addieren plus Produkt-Korrektur: a + b + a·b ÷ 100.',
    ],
    trick: '+20 % und −20 %: 1,2 × 0,8 = 0,96 → −4 %. Und +50 % dann −50 %: 1,5 × 0,5 = 0,75 → −25 %. Zweimal +10 %: 1,1 × 1,1 = 1,21 → +21 %.',
    pitfalls: [
      'Die Prozente einfach addieren (+20 % und −20 % ergeben nicht 0 %).',
      'Das Vorzeichen vergessen, wenn der Faktor kleiner als 1 ist.',
      'Faktoren falsch bilden: −25 % ist 0,75 und nicht 0,25.',
    ],
  },

  'frac.topct': {
    idea: 'Die gängigen Brüche musst du auswendig kennen. Alle anderen leitest du aus Grundbrüchen ab.',
    steps: [
      'Lerne die Grundbrüche: ½ = 50 %, ⅓ = 33,3 %, ¼ = 25 %, ⅕ = 20 %, ⅙ = 16,7 %, ⅛ = 12,5 %, ⅒ = 10 %.',
      'Bei Zählern > 1: Stammbruch mal Zähler (⅜ = 3 × 12,5 %).',
      'Oder vom Ganzen abziehen (⅚ = 100 % − 16,7 %).',
      'Für 1/7 ≈ 14,3 %, 1/9 ≈ 11,1 %, 1/11 ≈ 9,1 %: Muster merken (1/7 = 142857…).',
    ],
    trick: '3/8 = 3 × 12,5 % = 37,5 %. 5/6 = 100 % − 16,7 % = 83,3 %. 2/3 = 2 × 33,3 % = 66,7 %.',
    pitfalls: [
      'Zähler und Nenner vertauschen (⅜ nicht als 8/3 rechnen).',
      '⅙ mit ⅛ verwechseln (16,7 % gegen 12,5 %).',
    ],
  },
  'frac.of': {
    idea: 'Bruch von einer Zahl heißt: erst durch den Nenner teilen, dann mit dem Zähler multiplizieren. So bleiben die Zahlen klein.',
    steps: [
      'Teile die Zahl durch den Nenner (das ist ein Stammbruchteil).',
      'Multipliziere das Ergebnis mit dem Zähler.',
      'Bei großen Zahlen: erst Nullen abtrennen, dann teilen, dann Nullen wieder anhängen.',
      'Probe: Das Ergebnis liegt zwischen 0 und der Ausgangszahl.',
    ],
    trick: '3/8 von 640 = 640 ÷ 8 × 3 = 80 × 3 = 240. Und 2/5 von 350 = 350 ÷ 5 × 2 = 70 × 2 = 140.',
    pitfalls: [
      'Erst mit dem Zähler multiplizieren und dann dividieren – führt zu größeren Zahlen und mehr Fehlern.',
      'Mit dem Nenner multiplizieren statt dividieren.',
    ],
  },

  'growth.compound': {
    idea: 'Zinseszins ist nur ein wenig mehr als die Summe der einzelnen Jahre. Du addierst die Prozente und korrigierst mit einem kleinen Zusatz.',
    steps: [
      'Addiere die Prozente: n × r.',
      'Ergänze den Zinseszinsanteil: Anzahl der Jahrespaare n(n − 1)/2 mal r²/100.',
      'Bei r ≥ 15 oder n ≥ 4 lieber mit Faktoren rechnen (1,2² = 1,44).',
      'Die Toleranz ist groß, der Zusatz muss also nur grob stimmen.',
    ],
    trick: '5 % über 3 Jahre: 3 × 5 = 15 %, plus 3 Paare × 0,25 = 0,75 ⇒ ≈ 15,8 % (exakt 1,05³ = 1,157625). 10 % über 3 Jahre: 30 + 3 + 0,1 = 33,1 %.',
    pitfalls: [
      'Nur n × r rechnen und den Zinseszins weglassen (bei 10 %, 3 Jahre fehlen schon 3 Prozentpunkte).',
      'Den Zusatz zu groß ansetzen – bei 5 % ist er nur etwa 1 Prozentpunkt.',
    ],
  },
  'growth.rule72': {
    idea: 'Die 72er-Regel: Bei einer Wachstumsrate von r % pro Jahr verdoppelt sich ein Wert in etwa 72 ÷ r Jahren.',
    steps: [
      'Teile 72 durch die Rate in Prozent.',
      'Wähle die Rate möglichst so, dass 72 sauber aufgeht (2, 3, 4, 6, 8, 9, 12, 18, 24 sind Teiler von 72).',
      'Bei krummen Raten: runde die Rate auf einen Teiler und passe das Ergebnis leicht an.',
      'Plausibilität: Doppelt so hohe Rate, halbe Verdopplungszeit.',
    ],
    trick: '8 % Wachstum: 72 ÷ 8 = 9 Jahre. 12 %: 72 ÷ 12 = 6 Jahre. 3 %: 72 ÷ 3 = 24 Jahre.',
    pitfalls: [
      'Mit 70 oder 100 statt 72 rechnen (70 ist als Näherung zulässig, 100 nicht).',
      'Die Rate als Dezimalzahl einsetzen (0,08 statt 8).',
    ],
  },
  'growth.cagr': {
    idea: 'Aus dem Gesamtfaktor über n Jahre bestimmst du die jährliche Rate, indem du den Faktor als n-te Potenz erkennst. Kenne die Potenzen von 1,05 / 1,1 / 1,2 / 1,25 / 1,5 auswendig.',
    steps: [
      'Bilde den Gesamtfaktor: Endwert ÷ Startwert.',
      'Vergleiche mit bekannten Potenzen (1,1² = 1,21; 1,1³ = 1,331; 1,2² = 1,44; 1,2³ = 1,728; 1,5² = 2,25).',
      'Der passende Basisfaktor minus 1 ist die jährliche Rate.',
      'Probe: Startwert × Basisfaktor^n muss den Endwert ergeben.',
    ],
    trick: '400 → 900 in 2 Jahren: Faktor 900 ÷ 400 = 2,25 = 1,5² → 50 % pro Jahr. 100 → 121: Faktor 1,21 = 1,1² → 10 %.',
    pitfalls: [
      'Den Gesamtzuwachs durch n teilen (125 % über 2 Jahre sind keine 62,5 % pro Jahr).',
      'Den Faktor nicht um 1 verringern (1,5 bedeutet 50 %, nicht 150 %).',
    ],
  },

  'biz.payback': {
    idea: 'Die Payback-Zeit sagt, nach wie vielen Jahren sich eine Investition über die jährliche Ersparnis oder den Gewinn zurückzahlt.',
    steps: [
      'Teile die Investition durch die jährliche Ersparnis.',
      'Kürze gleiche Einheiten (Mio. € ÷ Mio. €/Jahr = Jahre).',
      'Kommazahlen: Verdopple beide Zahlen, um das Komma loszuwerden (12 ÷ 2,5 = 24 ÷ 5).',
      'Prüfe: Ersparnis × Ergebnis ≈ Investition.',
    ],
    trick: '12 Mio. € ÷ 2,5 Mio. €/Jahr = 24 ÷ 5 = 4,8 Jahre. Probe: 2,5 × 4,8 = 12.',
    pitfalls: [
      'Die Rechnung umdrehen (Ersparnis ÷ Investition).',
      'Brutto- statt Netto-Ersparnis nutzen, wenn laufende Kosten abzuziehen sind.',
    ],
  },
  'biz.breakeven': {
    idea: 'Jedes verkaufte Stück trägt den Deckungsbeitrag (Preis − variable Kosten) zu den Fixkosten bei. Break-even ist erreicht, wenn die Beiträge die Fixkosten decken.',
    steps: [
      'Bestimme den Deckungsbeitrag pro Stück: Preis − variable Kosten.',
      'Teile die Fixkosten durch den Deckungsbeitrag.',
      'Rechne mit abgetrennten Nullen (Tausender separat) und hänge sie am Ende wieder an.',
      'Probe: Menge × Deckungsbeitrag ≈ Fixkosten.',
    ],
    trick: 'Fixkosten 600.000 €, Preis 50 €, variable Kosten 35 €: Deckungsbeitrag 15 €, 600.000 ÷ 15 = 40.000 Stück (600 ÷ 15 = 40, dazu 3 Nullen).',
    pitfalls: [
      'Durch den Preis statt durch den Deckungsbeitrag teilen.',
      'Variable Kosten nicht abziehen.',
      'Die Nullen beim Kürzen verlieren (Tausender nicht wieder anhängen).',
    ],
  },
  'biz.margin': {
    idea: 'Die Marge ist der Anteil des Gewinns am Umsatz. Es ist einfach die Prozentrechnung „Gewinn ist wie viel Prozent vom Umsatz“.',
    steps: [
      'Teile den Gewinn durch den Umsatz.',
      'Kürze zu einem einfachen Bruch.',
      'Wandle den Bruch in Prozent (¼ = 25 %, ⅒ = 10 %, ⅕ = 20 %).',
      'Alternativ: 1 % des Umsatzes bestimmen und zählen, wie oft es in den Gewinn passt.',
    ],
    trick: 'Gewinn 12 Mio. €, Umsatz 240 Mio. €: 1 % = 2,4 Mio. €, 12 ÷ 2,4 = 5 → 5 % Marge. Probe: 5 % von 240 = 12.',
    pitfalls: [
      'Durch die Kosten statt durch den Umsatz teilen.',
      'Marge in Prozentpunkten und in absoluten Werten verwechseln.',
    ],
  },
  'biz.roi': {
    idea: 'ROI misst den Nettogewinn im Verhältnis zu den eingesetzten Kosten: (Nutzen − Kosten) ÷ Kosten.',
    steps: [
      'Ziehe die Kosten vom Nutzen ab (Nettogewinn).',
      'Teile den Nettogewinn durch die Kosten (nicht durch den Nutzen).',
      'Wandle in Prozent um.',
      'Plausibilität: Nutzen doppelt so hoch wie die Kosten ergibt 100 % ROI.',
    ],
    trick: 'Kosten 8 Mio. €, Nutzen 10 Mio. €: Gewinn 2, 2 ÷ 8 = ¼ = 25 % ROI.',
    pitfalls: [
      'Nutzen ÷ Kosten rechnen und die 1 nicht abziehen (125 % statt 25 %).',
      'Durch den Nutzen statt durch die Kosten teilen.',
    ],
  },
  'biz.tco': {
    idea: 'TCO (Total Cost of Ownership) sind die Einmalkosten plus alle laufenden Kosten über die gesamte Laufzeit.',
    steps: [
      'Berechne die laufenden Kosten über die Laufzeit: Jahre × Kosten pro Jahr.',
      'Addiere die Einmalkosten.',
      'Bei Kommazahlen: Multipliziere ganze Teile und Dezimalteil getrennt (4 × 2,5 = 4 × 2 + 4 × 0,5).',
      'Prüfe, ob alle Posten dieselbe Einheit haben (Mio. €).',
    ],
    trick: 'Einmalkosten 5 Mio. €, laufend 2,5 Mio. €/Jahr, 4 Jahre: 4 × 2,5 = 10, 5 + 10 = 15 Mio. €.',
    pitfalls: [
      'Die Einmalkosten pro Jahr mitzählen.',
      'Falsche Jahreszahl nehmen (Laufzeit, nicht Zahl der Zahlungen im Jahr 0).',
    ],
  },
  'biz.fte': {
    idea: 'Kette die Einheiten: Anfragen × Minuten → Gesamtminuten → Stunden → FTE. Wende den Einsparanteil nur einmal an.',
    steps: [
      'Berechne die Gesamtminuten: Anfragen pro Jahr × Minuten pro Anfrage.',
      'Wende den Einsparanteil an (25 % = ÷ 4, 50 % = ÷ 2, 10 % = Komma verschieben).',
      'Wandle in Stunden um (÷ 60).',
      'Teile durch die Stunden pro FTE und runde grob.',
    ],
    trick: '1,2 Mio. Anfragen × 5 min × 25 % ÷ 60 ÷ 1.500: 1,2 Mio. × 5 = 6 Mio. min, ÷ 4 = 1,5 Mio. min, ÷ 60 = 25.000 h, ÷ 1.500 ≈ 16,7 FTE.',
    pitfalls: [
      'Den Sprung Minuten → Stunden (÷ 60) vergessen.',
      'Den Einsparanteil nicht anwenden oder den Restanteil (75 %) nehmen.',
      'Mio. beim Umrechnen verlieren – zähle die Nullen separat.',
    ],
  },
  'biz.sla': {
    idea: 'Die erlaubte Ausfallzeit ist der Nicht-Verfügbarkeits-Anteil mal der Jahreszeit. Merke dir ein Jahr = 8.760 Stunden.',
    steps: [
      'Bestimme den Ausfallanteil: 100 % − Verfügbarkeit (99,9 % → 0,1 %).',
      'Nimm dieses Prozent von 8.760 h (0,1 % = 1/1.000 → 8,76 h).',
      'Bei 99,99 %: in Minuten rechnen (1 Jahr = 525.600 min), 0,01 % ≈ 52,6 min.',
      'Die Ausfallzeit ändert sich proportional zum Anteil: halber Anteil, halbe Zeit.',
    ],
    trick: '99,9 %: 0,1 % von 8.760 h = 8,76 h ≈ 8,8 h. 99,5 %: 0,5 % von 8.760 = 43,8 h. 99,99 %: 0,01 % von 525.600 min ≈ 52,6 min.',
    pitfalls: [
      'Die Verfügbarkeit statt des Ausfallanteils nehmen.',
      'Prozent und Promille verwechseln – 0,1 % ist 1/1.000, nicht 1/100.',
      'Bei 99,99 % in Stunden angeben statt in Minuten.',
    ],
  },

  'est.mult': {
    idea: 'Beim Schätzen rundest du so, dass die Fehler sich ausgleichen: Eine Zahl auf, die andere ab. So bleibst du im Toleranzbereich von ±8 %.',
    steps: [
      'Runde beide Faktoren auf eine bis zwei gültige Ziffern.',
      'Runde gegenläufig, wenn möglich (einen Faktor auf, den anderen ab).',
      'Multipliziere die glatten Zahlen, Nullen separat zählen.',
      'Prüfe, ob die Summe der Rundungsfehler unter etwa 8 % bleibt.',
    ],
    trick: '487 × 21 ≈ 500 × 20 = 10.000 (exakt 10.227, Abweichung etwa 2 %).',
    pitfalls: [
      'Beide Zahlen in dieselbe Richtung runden – der Fehler addiert sich.',
      'Zu grob runden (z. B. 21 auf 30).',
    ],
  },
  'est.div': {
    idea: 'Runde Zähler und Nenner auf nahe Zahlen, die sich gut teilen lassen. Verändere beide etwa um denselben Anteil, dann bleibt der Quotient stabil.',
    steps: [
      'Runde den Nenner auf eine glatte Zahl (39 → 40).',
      'Passe den Zähler an ein Vielfaches des gerundeten Nenners an (7.830 → 8.000).',
      'Teile, Nullen separat zählen.',
      'Prüfe die Größenordnung mit einer Gegenprobe.',
    ],
    trick: '7.830 ÷ 39 ≈ 8.000 ÷ 40 = 200 (exakt 200,8).',
    pitfalls: [
      'Nur den Nenner runden und den Zähler lassen.',
      'Die Nullen falsch zählen: 8.000 ÷ 40 = 200, nicht 2.000.',
    ],
  },
  'est.pct': {
    idea: 'Ersetze den krummen Prozentsatz durch einen Nachbarn mit einfachem Bruch (10, 20, 25, 50 %) und korrigiere die Differenz.',
    steps: [
      'Runde den Prozentsatz auf einen Nachbar-Satz (23 % → 25 %).',
      'Runde die Basis auf eine glatte Zahl (4.870 → 4.800).',
      'Rechne den glatten Prozentsatz (25 % = ÷ 4).',
      'Korrigiere die Differenz: 1 % der Basis pro Prozentpunkt Unterschied.',
    ],
    trick: '23 % von 4.870 ≈ 25 % von 4.800 − 2 % von 4.800 = 1.200 − 96 = 1.104 (exakt 1.120).',
    pitfalls: [
      'Die Korrektur vergessen und ungenau bleiben (1.200 liegt fast 7 % daneben).',
      'In die falsche Richtung korrigieren: 23 % < 25 %, also abziehen.',
    ],
  },

  'units.dimless': {
    idea: 'Einheiten verhalten sich wie Zahlen: Sie lassen sich kürzen. Eine Größe wird dimensionslos (ein reiner Anteil), wenn du sie durch etwas mit genau derselben Einheit teilst.',
    steps: [
      'Schreibe die Einheit der gegebenen Größe als Bruch (€/Jahr = € pro Jahr).',
      'Überlege, was im Nenner stehen muss, damit sich alles wegkürzt: dieselbe Einheit, auch dieselbe Zeitbasis.',
      'Kürze Zähler- und Nenner-Einheiten gegeneinander.',
      'Prüfe, was übrig bleibt: nichts mehr = dimensionslos (ein Anteil oder eine Quote).',
    ],
    trick: 'Umsatz [€/Jahr] ÷ Marktvolumen [€/Jahr] = Marktanteil (ohne Einheit). Auch Ausfallzeit [h/Jahr] ÷ Jahresstunden [h/Jahr] = Anteil.',
    pitfalls: [
      'Die Zeitbasis mischen: €/Monat durch €/Jahr geteilt kürzt sich nicht sauber (Faktor 12 daneben).',
      'Den Kehrwert nehmen: Marktvolumen ÷ Umsatz ist zwar dimensionslos, aber nicht der gesuchte Anteil.',
    ],
  },
  'units.result': {
    idea: 'Beim Multiplizieren und Dividieren rechnest du mit Einheiten wie mit Brüchen: Gleiche Einheiten in Zähler und Nenner kürzen sich weg, der Rest ist die Einheit des Ergebnisses.',
    steps: [
      'Schreibe beide Einheiten als Brüche untereinander oder nebeneinander.',
      'Bei Multiplikation: Zähler mal Zähler, Nenner mal Nenner. Bei Division: mit dem Kehrwert multiplizieren.',
      'Kürze alles, was oben und unten gleich vorkommt.',
      'Lies die übrig gebliebene Einheit ab und prüfe, ob sie zur Fragestellung passt.',
    ],
    trick: '€/h × h/Jahr = €/Jahr (h kürzt sich). Stück/Tag × €/Stück = €/Tag. € ÷ Mitarbeiter = €/Mitarbeiter.',
    pitfalls: [
      'Bei Division den Kehrwert vergessen: ÷ (h/Jahr) heißt × (Jahr/h).',
      'Eine Einheit nicht kürzen, obwohl sie oben und unten steht.',
    ],
  },
  'units.convert': {
    idea: 'Du rechnest um, indem du Umrechnungsfaktoren so hintereinanderschaltest, dass die ungewollten Einheiten sich wegkürzen und nur die gewünschte übrig bleibt.',
    steps: [
      'Schreibe die Ausgangsgröße samt Einheit auf und notiere die Zieleinheit.',
      'Wähle Umrechnungsfaktoren so, dass die alte Einheit im Nenner steht und die neue im Zähler (1 Jahr = 12 Monate).',
      'Multipliziere die Zahlen, kürze die Einheiten und zähle Nullen separat.',
      'Plausibilität: Wird die Einheit kleiner, wird die Zahl größer, und umgekehrt.',
    ],
    trick: '36 km/h = 36.000 m ÷ 3.600 s = 10 m/s (Faustregel: ÷ 3,6). Monatswert × 12 = Jahreswert. 220 Arbeitstage × 8 h = 1.760 h pro Jahr. 0,5 €/Min. × 60 = 30 €/h.',
    pitfalls: [
      'Den Faktor in die falsche Richtung anwenden (÷ 12 statt × 12 beim Hochrechnen auf das Jahr).',
      'Nur einen Teil der Einheit umrechnen, etwa km in m, aber h nicht in s.',
      'Bei Tsd. / Mio. die Nullen verzählen (120 Tsd. × 12 = 1,44 Mio., nicht 14,4 Mio.).',
    ],
  },

  'mag.exponent': {
    idea: 'Jede Zahl lässt sich als a × 10ⁿ schreiben, mit 1 ≤ a < 10. Der Exponent n ist die Größenordnung: Er sagt, wie viele Stellen die Zahl hat.',
    steps: [
      'Zähle bei großen Zahlen die Stellen vor dem Komma; n = Stellenzahl − 1 (85.000 hat 5 Stellen, n = 4).',
      'Bei Einheiten-Wörtern: Tsd. = 10³, Mio. = 10⁶, Mrd. = 10⁹, Bio. = 10¹². Dann a beachten: 4,2 Mrd. = 4,2 × 10⁹, also n = 9.',
      'Bei Dezimalzahlen kleiner als 1: Suche die erste Ziffer ungleich null. Ihre Position nach dem Komma ist −n (0,003 → n = −3).',
      'Prüfe, ob a zwischen 1 und 10 liegt; sonst verschiebe das Komma und passe n an (12 × 10⁶ = 1,2 × 10⁷).',
    ],
    trick: '4,2 Mrd. = 4,2 × 10⁹ → n = 9. 85.000 = 8,5 × 10⁴ → n = 4. 0,003 = 3 × 10⁻³ → n = −3. 0,047 = 4,7 × 10⁻² → n = −2.',
    pitfalls: [
      'Stellen statt Stellen − 1 nehmen: 85.000 hat 5 Stellen, aber n = 4.',
      'Bei Zahlen unter 1 das Vorzeichen vergessen oder um 1 danebenliegen (0,003 ist 10⁻³, nicht 10⁻²).',
      'Die Einheit falsch zuordnen: Mrd. ist 10⁹, Bio. ist 10¹², nicht 10¹⁵.',
    ],
  },
  'mag.facts': {
    idea: 'Mit einer kleinen Liste von Ankerwerten schätzt du in Cases sicher die Größenordnung. Merke dir die Zahl und leite den Exponenten daraus ab.',
    steps: [
      'Rufe den Ankerwert ab (Einwohner Deutschland ≈ 84 Mio.).',
      'Schreibe ihn als a × 10ⁿ (84 Mio. = 8,4 × 10⁷).',
      'Lies n ab: der Exponent der Zehnerpotenz.',
      'Nutze den Anker, um verwandte Größen einzuordnen (Haushalte ≈ halb so viele wie Einwohner, also gleiche Größenordnung).',
    ],
    trick: 'Einwohner DE 84 Mio. ≈ 8 × 10⁷ (n = 7). Haushalte 41 Mio., Erwerbstätige 46 Mio. (beide n = 7). EU 450 Mio. = 4,5 × 10⁸. Welt 8,2 Mrd. = 8,2 × 10⁹. BIP DE ≈ 4,3 Bio. € = 4,3 × 10¹². 1 Jahr ≈ 3,15 × 10⁷ s. 8.760 h pro Jahr (n = 3). ca. 1.700 Arbeitsstunden pro FTE (n = 3).',
    pitfalls: [
      'Mio. und Mrd. verwechseln: Deutschland hat Mio. Einwohner (10⁷), die Welt Mrd. (10⁹).',
      'Beim BIP die Einheit Bio. = 10¹² mit Mrd. = 10⁹ vertauschen.',
    ],
  },
  'mag.product': {
    idea: 'Bei Produkten in Zehnerpotenz-Schreibweise multiplizierst du die Mantissen und addierst die Exponenten. Danach prüfst du, ob die Mantisse noch zwischen 1 und 10 liegt.',
    steps: [
      'Schreibe beide Faktoren als a × 10ⁿ (40 Mio. = 4 × 10⁷; 3.000 = 3 × 10³).',
      'Multipliziere die Mantissen (4 × 3 = 12).',
      'Addiere die Exponenten (7 + 3 = 10).',
      'Normalisiere: Ist die Mantisse ≥ 10, schiebe das Komma um eine Stelle und erhöhe n um 1 (12 × 10¹⁰ = 1,2 × 10¹¹).',
    ],
    trick: '3 × 10⁴ × 5 × 10⁵ = 15 × 10⁹ = 1,5 × 10¹⁰ → n = 10. Und 40 Mio. × 3.000 = 12 × 10¹⁰ = 1,2 × 10¹¹ → n = 11.',
    pitfalls: [
      'Den Mantissen-Übertrag vergessen: 15 × 10⁹ hat n = 10, nicht 9.',
      'Die Exponenten multiplizieren statt addieren.',
      'Eine Null verzählen, wenn du Tsd./Mio. in Potenzen übersetzt.',
    ],
  },
  'mag.ratio': {
    idea: 'Bei Quotienten teilst du die Mantissen und subtrahierst die Exponenten. Ist die Mantisse danach kleiner als 1, normalisierst du nach unten.',
    steps: [
      'Schreibe Zähler und Nenner als a × 10ⁿ (6 Mrd. = 6 × 10⁹; 2.000 = 2 × 10³).',
      'Teile die Mantissen (6 ÷ 2 = 3).',
      'Subtrahiere die Exponenten (9 − 3 = 6).',
      'Normalisiere: Ist die Mantisse < 1, schiebe das Komma nach rechts und verringere n um 1 (0,5 × 10⁻² = 5 × 10⁻³).',
    ],
    trick: '6 Mrd. ÷ 2.000 = 3 × 10⁶ → n = 6. Und 2 × 10³ ÷ 4 × 10⁵ = 0,5 × 10⁻² = 5 × 10⁻³ → n = −3.',
    pitfalls: [
      'Die Exponenten addieren statt subtrahieren.',
      'Bei Mantisse < 1 nicht normalisieren: 0,5 × 10⁻² hat n = −3, nicht −2.',
      'Die Reihenfolge vertauschen (Nenner − Zähler) und das Vorzeichen des Exponenten falsch bekommen.',
    ],
  },
  'tricks.x11': {
    idea: 'Mal 11 heißt mal 10 plus mal 1. Bei zwei Ziffern passiert das ganz von selbst: Die Ziffern bleiben außen, ihre Summe kommt in die Mitte.',
    steps: [
      'Schreibe die beiden Ziffern mit Lücke dazwischen: 4 _ 7.',
      'Addiere die beiden Ziffern und setze die Summe in die Lücke: 4 + 7 = 11.',
      'Ist die Summe größer als 9, schreibe nur die Einer und gib die 1 als Übertrag an die linke Ziffer.',
      'Bei drei Ziffern: a | a+b | b+c | c, Überträge von rechts nach links einrechnen.',
    ],
    trick: '47 × 11 = 4 | 4+7 | 7 → 4 | 11 | 7 → 517. Bei 3 Ziffern: 234 × 11 = 2 | 2+3 | 3+4 | 4 = 2 | 5 | 7 | 4 = 2.574.',
    pitfalls: [
      'Den Übertrag vergessen: bei 4 | 11 | 7 ist die Antwort 517, nicht 4117.',
      'Bei drei Ziffern die Überträge nicht von rechts nach links einrechnen.',
    ],
  },
  'tricks.diffsq': {
    idea: 'Liegen die beiden Faktoren gleich weit links und rechts von einer glatten Zahl, hilft die 3. Binomische Formel: (m − d)(m + d) = m² − d².',
    steps: [
      'Finde die Mitte m der beiden Zahlen (am besten ein Vielfaches von 10).',
      'Bestimme den Abstand d von der Mitte.',
      'Quadriere die Mitte und den Abstand.',
      'Ziehe das kleine Quadrat vom großen ab.',
    ],
    trick: '47 × 53: Mitte 50, Abstand 3 → 50² − 3² = 2.500 − 9 = 2.491.',
    pitfalls: [
      'Addieren statt subtrahieren: m² − d², nicht m² + d².',
      'Den Abstand falsch bestimmen – er ist die halbe Differenz der Zahlen, nicht die ganze.',
    ],
  },
  'tricks.near100': {
    idea: 'Zwei Zahlen knapp unter 100 multiplizierst du über ihre Abstände zu 100: kreuzweise abziehen, mal 100 nehmen, das Produkt der Abstände addieren.',
    steps: [
      'Bestimme die Abstände zu 100: 97 → 3, 96 → 4.',
      'Ziehe einen Abstand kreuzweise von der anderen Zahl ab: 97 − 4 = 93 (oder 96 − 3).',
      'Hänge zwei Nullen an: 9.300.',
      'Addiere das Produkt der Abstände: 3 × 4 = 12 → 9.312.',
    ],
    trick: '97 × 96 = (100 − 3 − 4) · 100 + 3 · 4 = 9.300 + 12 = 9.312.',
    pitfalls: [
      'Das Produkt der Abstände vergessen.',
      'Statt kreuzweise zu subtrahieren beide Abstände nochmal vom falschen Wert abziehen.',
      'Ist das Abstandsprodukt größer als 99, nicht vergessen, es ganz zu addieren (nicht anzuhängen).',
    ],
  },
  'tricks.square5': {
    idea: 'Jede Zahl, die auf 5 endet, hat ein Quadrat, das auf 25 endet. Vorne steht das Produkt aus der Zehnerzahl und ihrem Nachfolger.',
    steps: [
      'Nimm die Zahl ohne die 5 hinten: 65 → 6.',
      'Multipliziere sie mit ihrem Nachfolger: 6 × 7 = 42.',
      'Hänge 25 an: 4.225.',
    ],
    trick: '65² = 6 · 7 | 25 = 42 | 25 = 4.225. Und 145² = 14 · 15 | 25 = 210 | 25 = 21.025.',
    pitfalls: [
      'Die Zehnerzahl mit sich selbst multiplizieren statt mit dem Nachfolger.',
      'Das „25“ vergessen oder nur eine 5 anhängen.',
    ],
  },
  'tricks.pctswap': {
    idea: 'Prozentrechnen ist vertauschbar: x % von y ist dasselbe wie y % von x. Tausche, wenn der getauschte Prozentsatz glatt ist (10, 20, 25, 50).',
    steps: [
      'Prüfe, ob y ein glatter Prozentsatz ist (10, 20, 25, 50).',
      'Vertausche die Zahlen: x % von y wird zu y % von x.',
      'Rechne den glatten Teil: 50 % = ÷ 2, 25 % = ÷ 4, 20 % = ÷ 5, 10 % = ÷ 10.',
    ],
    trick: '8 % von 50 = 50 % von 8 = 4. Und 36 % von 25 = 25 % von 36 = 9.',
    pitfalls: [
      'Tauschen, obwohl der getauschte Wert nicht glatter ist.',
      'Die Hälfte oder das Viertel mit dem falschen Wert bilden (die ursprüngliche Zahl statt der getauschten).',
    ],
  },
  'tricks.subround': {
    idea: 'Subtrahiere nie eine Zahl auf 7, 8 oder 9 am Stück: Runde sie auf den nächsten Zehner, rechne glatt und korrigiere.',
    steps: [
      'Runde die abzuziehende Zahl auf den nächsten Zehner: 38 → 40 (+2).',
      'Ziehe die glatte Zahl ab: 83 − 40 = 43.',
      'Gib den zu viel abgezogenen Betrag zurück: 43 + 2 = 45.',
    ],
    trick: '83 − 38 = 83 − 40 + 2 = 45. Und 512 − 289 = 512 − 290 + 1 = 223.',
    pitfalls: [
      'Die Korrektur abziehen statt addieren.',
      'Die Differenz zum Zehner falsch bestimmen (38 → 40 ist +2, nicht +1).',
    ],
  },
  'custom.mul': {
    idea: 'Zerlege den größeren Faktor in Hunderter, Zehner und Einer, rechne jedes Stück einzeln mit dem anderen Faktor und addiere die Teilergebnisse.',
    steps: [
      'Wähle den größeren Faktor zum Zerlegen: 17 = 10 + 7.',
      'Multipliziere jedes Teilstück mit dem anderen Faktor: 10 × 6 und 7 × 6.',
      'Addiere die Teilprodukte: 60 + 42 = 102.',
    ],
    trick: '17 × 6 = 10 × 6 + 7 × 6 = 60 + 42 = 102. Liegt eine Zahl knapp unter einem Zehner, rechne rückwärts: 19 × 6 = 20 × 6 − 6 = 114.',
    pitfalls: [
      'Ein Teilstück vergessen (z. B. nur die Zehner multiplizieren).',
      'Die Nullen bei Zehner- und Hunderterteilen verlieren.',
    ],
  },
  'custom.square': {
    idea: 'Quadrate nahe einem Zehner rechnest du über (n − k)(n + k) + k²: Das Produkt der Nachbarzehner ist leicht, der Rest ist ein kleines Quadrat.',
    steps: [
      'Bestimme den nächsten Zehner r und den Abstand k = |n − r|.',
      'Bilde das Gegenstück auf der anderen Seite: n + k bzw. n − k.',
      'Multipliziere r mit dem Gegenstück.',
      'Addiere k²: n² = r · (2n − r) + k².',
    ],
    trick: '13² = 10 · 16 + 3² = 160 + 9 = 169. Und 18² = 20 · 16 + 2² = 320 + 4 = 324.',
    pitfalls: [
      'k² vergessen oder subtrahieren statt addieren.',
      'Das Gegenstück auf der falschen Seite bilden (bei 13 ist es 16, nicht 10 − 3 = 7).',
    ],
  },
};

export function getMethod(subtypeId: string): Method | null {
  return METHODS[subtypeId] || null;
}
