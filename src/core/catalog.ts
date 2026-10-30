// Kategorien, Aufgabentypen, Schwierigkeitsstufen
import type { Category, CategoryId, Level, Subtype } from '../types.ts';

export const CATEGORIES: Category[] = [
  { id: 'mult', name: 'Multiplikation', description: '2×1, 2×2, Quadrate' },
  { id: 'div', name: 'Division', description: 'Glatt, Dezimal, Runden' },
  { id: 'big', name: 'Große Zahlen', description: 'Tsd., Mio., Mrd.' },
  { id: 'pct', name: 'Prozente', description: 'Anteil, Veränderung, Rückwärts' },
  { id: 'frac', name: 'Brüche', description: 'Bruch ↔ Prozent' },
  { id: 'growth', name: 'Wachstum', description: 'Zinseszins, 72er-Regel, CAGR' },
  { id: 'biz', name: 'Business', description: 'Payback, Break-even, Marge, ROI, TCO, FTE, SLA' },
  { id: 'est', name: 'Überschlag', description: 'Schätzen auf ±8 %' },
  { id: 'units', name: 'Einheiten', description: 'Dimensionen, Umrechnen' },
  { id: 'mag', name: 'Größenordnungen', description: 'Zehnerpotenzen, Schätzen' },
  { id: 'tricks', name: 'Rechentricks', description: '×11, Quadrate, Prozent-Tausch …' },
  { id: 'custom', name: 'Eigenes Training', description: 'Eigene Zahlenbereiche', hidden: true },
];

type Meta = [id: string, name: string, targetMs: number, weight: number, tip: string];

const META: Meta[] = [
  ['mult.2x1', '2-stellig × 1-stellig', 5000, 1, 'Zerlegen: 76 × 8 = 70 × 8 + 6 × 8'],
  ['mult.2x2', '2-stellig × 2-stellig', 20000, 2, 'Zerlegen: 34 × 27 = 34 × 25 + 34 × 2'],
  ['mult.easy', '× 5 / 25 / 50', 8000, 1, '× 5 = × 10 ÷ 2 · × 25 = × 100 ÷ 4'],
  ['mult.square', 'Quadrate', 15000, 1.5, '45² = 40 × 50 + 5²'],
  ['div.exact', 'Glatt teilen', 10000, 1, '1.248 ÷ 4 = 1.200 ÷ 4 + 48 ÷ 4'],
  ['div.decimal', 'Durch Dezimalzahlen', 12000, 1.5, '÷ 0,8 = × 10 ÷ 8 · ÷ 0,25 = × 4'],
  ['div.round', 'Teilen & runden', 15000, 1.5, 'Überschlagen, dann korrigieren: 1.200 ÷ 7 ≈ 171'],
  ['big.mult', 'Multiplizieren', 10000, 1.5, 'Ziffern rechnen, Nullen separat zählen: Tsd. = 10³, Mio. = 10⁶, Mrd. = 10⁹'],
  ['big.div', 'Dividieren', 15000, 1.5, '12 Mrd. ÷ 400.000 = (12 ÷ 4) × 10⁹⁻⁵ = 30.000'],
  ['big.percapita', 'Pro Kopf', 15000, 1.5, 'Erst Einheiten kürzen: Mrd. ÷ Mio. = Tsd. → 2,4 Mrd. ÷ 84 Mio. = 2.400 ÷ 84'],
  ['pct.of', 'x % von y', 10000, 1, '17 % = 10 % + 7 × 1 % · tauschen: 8 % von 50 = 50 % von 8'],
  ['pct.change', 'Veränderung in %', 10000, 1, '(neu − alt) ÷ alt – immer durch den alten Wert'],
  ['pct.reverse', 'Rückwärts-Prozent', 15000, 1.5, 'Durch den Faktor teilen: 90 ÷ 0,75 = 120'],
  ['pct.points', 'Prozent vs. Prozentpunkte', 12000, 1.5, '8 % → 10 % = +2 Prozentpunkte = +25 %'],
  ['pct.chain', 'Mehrere Änderungen', 12000, 1.5, 'Faktoren multiplizieren: 1,2 × 0,8 = 0,96 → −4 %'],
  ['frac.topct', 'Bruch → Prozent', 5000, 1, 'Auswendig: 1/6 = 16,7 %, 1/7 ≈ 14,3 %, 1/8 = 12,5 %, 1/9 ≈ 11,1 %'],
  ['frac.of', 'Bruch von Zahl', 10000, 1, 'Erst ÷ Nenner, dann × Zähler: 640 ÷ 8 × 3'],
  ['growth.compound', 'Wachstum über Jahre', 15000, 2, 'n × r + Zinseszins: 5 % über 3 Jahre ≈ 15 % + 1 %'],
  ['growth.rule72', 'Verdopplungszeit', 8000, 1, '72 ÷ Wachstumsrate'],
  ['growth.cagr', 'Jährliche Rate (CAGR)', 20000, 2, 'Faktor 1,21 über 2 Jahre = 1,1² → 10 % p. a.'],
  ['biz.payback', 'Payback', 10000, 1, 'Investition ÷ jährliche Ersparnis'],
  ['biz.breakeven', 'Break-even-Menge', 15000, 1.5, 'Fixkosten ÷ Deckungsbeitrag (Preis − variable Kosten)'],
  ['biz.margin', 'Marge', 8000, 1, 'Gewinn ÷ Umsatz'],
  ['biz.roi', 'ROI', 10000, 1, '(Nutzen − Kosten) ÷ Kosten'],
  ['biz.tco', 'TCO', 10000, 1, 'Einmalkosten + Jahre × laufende Kosten'],
  ['biz.fte', 'FTE-Rechnung', 25000, 2, 'Minuten → Stunden (÷ 60) → FTE (÷ Stunden pro FTE)'],
  ['biz.sla', 'SLA-Ausfallzeit', 12000, 1.5, '1 Jahr = 8.760 h; 0,1 % davon ≈ 8,8 h'],
  ['est.mult', 'Multiplikation schätzen', 6000, 1, 'Gegenläufig runden: 487 × 21 ≈ 500 × 20'],
  ['est.div', 'Division schätzen', 8000, 1, '7.830 ÷ 39 ≈ 8.000 ÷ 40 = 200'],
  ['est.pct', 'Prozent schätzen', 8000, 1, '23 % von 4.870 ≈ 25 % von 4.800 = 1.200'],
  ['units.dimless', 'Dimensionslos machen', 10000, 1, 'Durch die eigene Einheit teilen → dimensionslos; mal nehmen → Kehrwert-Einheit'],
  ['units.result', 'Ergebnis-Einheit', 10000, 1, 'Einheiten wie Brüche kürzen: €/h × h/Jahr = €/Jahr'],
  ['units.convert', 'Einheiten umrechnen', 15000, 1.5, 'Erst die Zeitbasis, dann die Größe (Tsd./Mio.) umrechnen – 36 km/h = 10 m/s'],
  ['mag.exponent', 'Zehnerpotenz einer Zahl', 6000, 1, 'a × 10ⁿ mit 1 ≤ a < 10: Komma verschieben, Stellen zählen'],
  ['mag.facts', 'Größenordnungen kennen', 8000, 1, 'Anker: 84 Mio. Einwohner ≈ 10⁷, 8.760 h/Jahr ≈ 10³, 3,15 · 10⁷ s/Jahr'],
  ['mag.product', 'Größenordnung von Produkten', 10000, 1.5, 'Mantissen multiplizieren, Exponenten addieren – Mantisse ≥ 10 gibt +1'],
  ['mag.ratio', 'Größenordnung von Quotienten', 10000, 1.5, 'Mantissen teilen, Exponenten subtrahieren – Mantisse < 1 gibt −1'],
  ['tricks.x11', '× 11', 6000, 1, '47 × 11 = 4 | 4+7 | 7 = 517 – Quersumme in die Mitte'],
  ['tricks.diffsq', '(a+b)(a−b)', 10000, 1.5, '47 × 53 = 50² − 3² = 2.491'],
  ['tricks.near100', 'Nahe 100', 10000, 1.5, '97 × 96 = (100−3−4)·100 + 3·4 = 9.312'],
  ['tricks.square5', 'Quadrate auf 5', 6000, 1, '65² = 6·7 | 25 = 4.225'],
  ['tricks.pctswap', 'Prozent-Tausch', 6000, 1, '8 % von 50 = 50 % von 8 = 4'],
  ['tricks.subround', 'Subtraktion über Runden', 6000, 1, '83 − 38 = 83 − 40 + 2 = 45'],
  ['custom.mul', 'Eigene Multiplikation', 10000, 1, 'Zerlegen: 17 × 6 = 10 × 6 + 7 × 6'],
  ['custom.square', 'Eigene Quadrate', 8000, 1, 'n² = (n−k)(n+k) + k² mit k bis zum nächsten Zehner'],
];

export const SUBTYPES: Record<string, Subtype> = Object.fromEntries(
  META.map(([id, name, targetMs, weight, tip]) => [
    id,
    { id, category: id.split('.')[0] as CategoryId, name, targetMs, weight, tip } satisfies Subtype,
  ]),
);

export const LEVEL_NAMES: Record<Level, string> = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 0.75, 2: 1, 3: 1.5 };

/** null/undefined → alle sichtbaren Kategorien; sonst gefiltert (leeres Ergebnis → alle sichtbaren). Versteckte Kategorien (hidden) sind nie enthalten. */
export function activeCategories(enabled?: readonly CategoryId[] | null): Category[] {
  const visible = CATEGORIES.filter((c) => !c.hidden);
  if (!Array.isArray(enabled)) return visible;
  const list = visible.filter((c) => enabled.includes(c.id));
  return list.length ? list : visible;
}
