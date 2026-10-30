// Kategorien, Aufgabentypen, Generatoren
import { fmt, randInt, pick, round } from './numbers.js';

export const CATEGORIES = [
  { id: 'mult', name: 'Multiplikation', description: '2×1, 2×2, Quadrate' },
  { id: 'div', name: 'Division', description: 'Glatt, Dezimal, Runden' },
  { id: 'big', name: 'Große Zahlen', description: 'Tsd., Mio., Mrd.' },
  { id: 'pct', name: 'Prozente', description: 'Anteil, Veränderung, Rückwärts' },
  { id: 'frac', name: 'Brüche', description: 'Bruch ↔ Prozent' },
  { id: 'growth', name: 'Wachstum', description: 'Zinseszins, 72er-Regel, CAGR' },
  { id: 'biz', name: 'Business', description: 'Payback, Break-even, Marge, ROI, TCO, FTE, SLA' },
  { id: 'est', name: 'Überschlag', description: 'Schätzen auf ±8 %' },
];

// [id, name, targetMs, weight, tip]
const META = [
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
];

export const SUBTYPES = Object.fromEntries(
  META.map(([id, name, targetMs, weight, tip]) => [
    id,
    { id, category: id.split('.')[0], name, targetMs, weight, tip },
  ]),
);

export const LEVEL_NAMES = { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' };
export const LEVEL_WEIGHT = { 1: 0.75, 2: 1, 3: 1.5 };
const LEVEL_TIME = { 1: 1, 2: 1, 3: 1.3 };
const lv = (level, a, b, c) => (level === 1 ? a : level === 3 ? c : b);
const normLevel = (l) => (l === 1 || l === 3 ? l : 2);

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function task(id, o) {
  const s = SUBTYPES[id];
  return {
    id: randomId(),
    category: s.category,
    subtype: id,
    prompt: o.prompt,
    params: o.params || {},
    unit: o.unit || '',
    hint: o.hint || '',
    expected: round(o.expected, 4),
    tolerance: { abs: o.abs || 0, rel: o.rel || 0 },
    targetMs: s.targetMs,
    weight: s.weight,
  };
}

const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;
const decHint = (x) => (isInt(x) ? '' : 'auf 1 Nachkommastelle');
const PCT_HINT = '±3 % ok';

const UNIT_VALUE = { 'Tsd.': 1e3, 'Mio.': 1e6, 'Mrd.': 1e9 };

// Große Zahl als Mantisse + Einheit (ab 1 Mio.), sonst ausgeschrieben
function bigStr(v) {
  if (v >= 1e9) return fmt(v / 1e9) + ' Mrd.';
  if (v >= 1e6) return fmt(v / 1e6) + ' Mio.';
  return fmt(v);
}

const GEN = {
  'mult.2x1': (rng, L) => {
    for (;;) {
      const a = randInt(lv(L, 12, 12, 111), lv(L, 49, 99, 399), rng), b = randInt(lv(L, 3, 3, 6), lv(L, 6, 9, 9), rng);
      if (L === 3 && a % 10 === 0) continue;
      return task('mult.2x1', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
    }
  },
  'mult.2x2': (rng, L) => {
    for (;;) {
      let a, b;
      if (L === 1) {
        b = randInt(12, 99, rng);
        a = rng() < 0.5 ? randInt(12, 19, rng) : 10 * randInt(2, 9, rng) + pick([-2, -1, 1, 2], rng);
      } else if (L === 3) {
        a = randInt(31, 99, rng); b = randInt(31, 99, rng);
        if (a % 5 === 0 || b % 5 === 0 || Math.abs(a % 10 - 5) < 2 || Math.abs(b % 10 - 5) < 2) continue;
      } else {
        a = randInt(12, 99, rng); b = randInt(12, 99, rng);
      }
      if (a % 10 === 0 || b % 10 === 0) continue;
      return task('mult.2x2', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
    }
  },
  'mult.easy': (rng, L) => {
    const f = pick(lv(L, [5, 50], [5, 25, 50], [5, 25, 50]), rng), a = randInt(lv(L, 12, 12, 120), lv(L, 120, 480, 980), rng);
    return task('mult.easy', { params: { a, f }, prompt: `${fmt(a)} × ${fmt(f)}`, expected: a * f });
  },
  'mult.square': (rng, L) => {
    for (;;) {
      const a = randInt(lv(L, 11, 13, 61), lv(L, 25, 99, 99), rng);
      if (a % 10 === 0) continue;
      if (L === 3 && a % 5 === 0) continue;
      return task('mult.square', { params: { a }, prompt: `${fmt(a)} × ${fmt(a)}`, expected: a * a });
    }
  },
  'div.exact': (rng, L) => {
    const d = pick(lv(L, [2, 3, 4, 5, 6, 8], [3, 4, 6, 7, 8, 9, 12, 15, 25], [7, 9, 12, 15, 16, 18, 24, 25]), rng);
    const q = randInt(lv(L, 12, 12, 100), lv(L, 100, 250, 999), rng);
    return task('div.exact', { params: { n: d * q, d }, prompt: `${fmt(d * q)} ÷ ${fmt(d)}`, expected: q });
  },
  'div.decimal': (rng, L) => {
    const d = pick(lv(L, [0.2, 0.25, 0.5], [0.2, 0.25, 0.4, 0.5, 0.8, 1.5, 2.5], [0.4, 0.8, 1.5, 2.5, 0.75, 1.2]), rng);
    const q = 20 * randInt(1, lv(L, 15, 40, 100), rng);
    return task('div.decimal', { params: { n: round(q * d, 4), d }, prompt: `${fmt(round(q * d, 4))} ÷ ${fmt(d)}`, expected: q });
  },
  'div.round': (rng, L) => {
    for (;;) {
      const d = pick(lv(L, [3, 4, 6, 8], [6, 7, 8, 9, 11, 12], [7, 11, 13, 17, 19]), rng);
      const n = randInt(lv(L, 60, 200, 1000), lv(L, 400, 2000, 9000), rng);
      if (n % d === 0) continue;
      return task('div.round', { params: { n, d },
        prompt: `${fmt(n)} ÷ ${fmt(d)}`,
        hint: 'auf ganze Zahl runden',
        expected: Math.round(n / d),
        abs: 1,
      });
    }
  },
  'big.mult': (rng, L) => {
    for (;;) {
      const m = pick(lv(L, [2, 3, 4, 5], [1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8], [1.2, 1.8, 2.4, 3.6, 4.8, 6.4, 7.2, 8.4, 9.6]), rng);
      const uName = pick(['Tsd.', 'Mio.'], rng);
      const b = pick(lv(L,
        [20, 30, 40, 50, 200, 300, 500, 2000],
        [20, 30, 40, 50, 60, 80, 200, 300, 400, 500, 2000, 3000, 4000, 5000, 20000, 40000],
        [30, 60, 70, 90, 120, 150, 700, 1200, 1500, 6000, 7000, 9000]), rng);
      const P = round(m * UNIT_VALUE[uName] * b, 4);
      const ua = P >= 1e9 ? 'Mrd.' : P >= 1e6 ? 'Mio.' : 'Tsd.';
      const e = P / UNIT_VALUE[ua];
      if (round(e, 3) !== round(e, 4) && Math.abs(e - round(e, 2)) > 1e-9) continue;
      if (L === 3 && Math.abs(e - round(e, 2)) > 1e-9) continue;
      return task('big.mult', { params: { m, u: uName, b, ua },
        prompt: `${fmt(m)} ${uName} × ${fmt(b)}`,
        unit: ua,
        expected: e,
        abs: 0.005,
      });
    }
  },
  'big.div': (rng, L) => {
    for (;;) {
      const q = pick(lv(L, [2, 3, 4, 5, 10, 20, 25, 50], [2, 3, 4, 5, 6, 8, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80], [12, 15, 24, 36, 45, 60, 75, 120, 125]), rng);
      const k = pick(lv(L, [3, 4, 5], [3, 4, 5, 6], [3, 4, 5, 6]), rng);
      const A = q * 10 ** k;
      const d = pick(lv(L,
        [200, 500, 2000, 5000, 20000],
        [200, 300, 400, 500, 2000, 4000, 5000, 20000, 40000, 400000],
        [300, 600, 1200, 1500, 4000, 25000, 60000, 150000]), rng);
      const D = A * d;
      if (D < 1e5 || D >= 1e12) continue;
      if (L === 1 && D >= 1e9) continue;
      const dm = D >= 1e9 ? D / 1e9 : D >= 1e6 ? D / 1e6 : D;
      if (Math.abs(dm - round(dm, 2)) > 1e-9) continue;
      const ua = A >= 1e6 ? 'Mio.' : 'Tsd.';
      return task('big.div', { params: { D, d, ua },
        prompt: `${bigStr(D)} ÷ ${fmt(d)}`,
        unit: ua,
        expected: A / UNIT_VALUE[ua],
        abs: 0.005,
      });
    }
  },
  'big.percapita': (rng, L) => {
    const T = L === 1 ? randInt(1, 12, rng) : L === 3 ? 0.1 * randInt(5, 300, rng) : 0.5 * randInt(1, 60, rng);
    const [label, base] = pick(lv(L, [
      ['84 Mio. Einwohner', 84],
      ['450 Mio. EU-Bürger', 450],
    ], [
      ['84 Mio. Einwohner', 84],
      ['41 Mio. Haushalte', 41],
      ['46 Mio. Erwerbstätige', 46],
      ['450 Mio. EU-Bürger', 450],
    ], [
      ['84 Mio. Einwohner', 84],
      ['41 Mio. Haushalte', 41],
      ['46 Mio. Erwerbstätige', 46],
      ['450 Mio. EU-Bürger', 450],
    ]), rng);
    return task('big.percapita', { params: { T: round(T, 4), base },
      prompt: `${fmt(round(T, 4))} Mrd. € verteilt auf ${label} – wie viel € pro Kopf?`,
      unit: '€',
      hint: PCT_HINT,
      expected: (T * 1000) / base,
      rel: 0.03,
    });
  },
  'pct.of': (rng, L) => {
    const p = pick(lv(L, [5, 10, 20, 25, 50], [3, 5, 8, 10, 12, 15, 17, 20, 25, 30, 35, 40, 45, 60, 75], [7, 13, 16, 18, 22, 27, 33, 36, 48, 65, 85]), rng);
    const y = L === 1 ? randInt(2, 50, rng) * 10 : L === 3 ? randInt(12, 199, rng) * 10 : randInt(4, 96, rng) * pick([10, 100], rng);
    return task('pct.of', { params: { p, y }, prompt: `${fmt(p)} % von ${fmt(y)}`, expected: (p * y) / 100, abs: 0.01 });
  },
  'pct.change': (rng, L) => {
    for (;;) {
      const alt = pick(lv(L, [20, 40, 50, 100, 200], [20, 25, 40, 50, 60, 75, 80, 120, 150, 200, 250, 400], [30, 35, 45, 64, 72, 85, 90, 125, 160, 240, 360]), rng);
      const r = pick(lv(L, [10, 20, 25, 50], [5, 10, 12.5, 15, 20, 25, 30, 40, 50], [4, 6, 8, 12, 15, 16, 18, 24, 35, 45]), rng);
      const up = rng() < 0.5;
      const neu = round(alt * (1 + (up ? r : -r) / 100), 4);
      if (Math.abs(neu * 10 - Math.round(neu * 10)) > 1e-6 || neu <= 0) continue;
      return task('pct.change', { params: { alt, neu },
        prompt: `Umsatz ${up ? 'steigt' : 'sinkt'} von ${fmt(alt)} auf ${fmt(neu)} Mio. €. Um wie viel Prozent?`,
        unit: '%',
        expected: r,
      });
    }
  },
  'pct.reverse': (rng, L) => {
    const O = L === 1 ? 100 * randInt(1, 10, rng) : L === 3 ? 20 * randInt(5, 60, rng) : 20 * randInt(2, 20, rng);
    const discount = rng() < 0.5;
    const r = discount
      ? pick(lv(L, [10, 20, 50], [10, 20, 25, 40, 50], [15, 30, 35, 40, 45, 60]), rng)
      : pick(lv(L, [10, 20, 50], [10, 20, 25, 50], [15, 30, 35, 40, 45, 60]), rng);
    const nach = round(O * (1 + (discount ? -r : r) / 100), 4);
    return task('pct.reverse', { params: { r, nach, discount: discount ? 1 : 0 },
      prompt: `Nach ${fmt(r)} % ${discount ? 'Rabatt' : 'Preiserhöhung'} kostet ein Produkt ${fmt(nach)} €. Ursprünglicher Preis?`,
      unit: '€',
      expected: O,
    });
  },
  'pct.points': (rng, L) => {
    const m1 = pick(lv(L, [5, 10, 20, 25], [4, 5, 8, 10, 12, 15, 20, 25], [6, 7, 9, 12, 15, 18, 24]), rng);
    const d = L === 1 ? pick([1, 2, 5], rng) : randInt(1, L === 3 ? 6 : 5, rng), m2 = m1 + d;
    const e = round((d / m1) * 100, 4);
    return task('pct.points', { params: { m1, m2 },
      prompt: `Die Marge steigt von ${fmt(m1)} % auf ${fmt(m2)} %. Um wie viel Prozent (nicht Prozentpunkte)?`,
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.1,
    });
  },
  'pct.chain': (rng, L) => {
    const R = lv(L, [10, 20, 50, -10, -20, -50], [10, 20, 25, 50, -10, -20, -25, -50], [5, 15, 30, 40, -5, -15, -30, -40, 20, -20]);
    const r1 = pick(R, rng), r2 = pick(R, rng);
    const word = (r, pron) => `${r > 0 ? 'steigt' : 'sinkt'}${pron} um ${fmt(Math.abs(r))} %`;
    return task('pct.chain', { params: { r1, r2 },
      prompt: `Der Preis ${word(r1, '')}, danach ${word(r2, ' er')}. Gesamtveränderung in %?`,
      unit: '%',
      hint: 'mit Vorzeichen, z. B. −4',
      expected: ((1 + r1 / 100) * (1 + r2 / 100) - 1) * 100,
      abs: 0.05,
    });
  },
  'frac.topct': (rng, L) => {
    const [n, d] = pick(lv(L, [
      [1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [1, 20], [1, 25],
    ], [
      [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 7],
      [1, 8], [3, 8], [5, 8], [7, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 15], [1, 20], [1, 25], [1, 40],
    ], [
      [1, 6], [5, 6], [1, 7], [1, 9], [2, 9], [4, 9], [1, 11], [1, 12], [5, 12], [7, 12], [1, 15], [1, 16], [3, 16], [1, 40], [3, 40],
    ]), rng);
    const e = round((n / d) * 100, 4);
    return task('frac.topct', { params: { n, d },
      prompt: `${n}/${d} in Prozent`,
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.15,
    });
  },
  'frac.of': (rng, L) => {
    const d = pick(lv(L, [2, 3, 4, 5, 10], [3, 4, 5, 6, 8, 12, 25], [6, 7, 8, 9, 12, 15, 25]), rng), n = randInt(1, d - 1, rng);
    const y = d * randInt(lv(L, 2, 3, 8), lv(L, 20, 60, 99), rng) * (L === 3 ? pick([1, 10], rng) : L === 1 ? 1 : pick([1, 10], rng));
    return task('frac.of', { params: { n, d, y }, prompt: `${n}/${d} von ${fmt(y)}`, expected: (n * y) / d });
  },
  'growth.compound': (rng, L) => {
    const r = pick(lv(L, [2, 5, 10], [2, 3, 4, 5, 6, 8, 10, 15, 20], [3, 6, 7, 8, 12, 15, 25]), rng);
    const n = randInt(L === 3 ? 3 : 2, L === 1 ? 3 : r >= 15 ? 3 : L === 3 ? 6 : 5, rng);
    return task('growth.compound', { params: { r, n },
      prompt: `${fmt(r)} % Wachstum pro Jahr über ${n} Jahre – Gesamtwachstum?`,
      unit: '%',
      hint: '±2 % ok',
      expected: ((1 + r / 100) ** n - 1) * 100,
      abs: 0.5,
      rel: 0.02,
    });
  },
  'growth.rule72': (rng, L) => {
    const r = pick(lv(L, [3, 4, 6, 8, 9, 12], [2, 3, 4, 6, 8, 9, 12, 18, 24], [5, 7, 10, 11, 14, 15, 16, 20]), rng);
    return task('growth.rule72', { params: { r },
      prompt: `Bei ${fmt(r)} % Wachstum p. a. – nach wie vielen Jahren verdoppelt sich der Wert (ca.)?`,
      unit: 'Jahre',
      expected: 72 / r,
      rel: 0.1,
    });
  },
  'growth.cagr': (rng, L) => {
    for (;;) {
      const r = pick(lv(L, [10, 20, 50], [5, 10, 20, 25, 50], [8, 12, 15, 25, 30]), rng);
      const n = pick(lv(L, [2], [2, 3], [2, 3, 4]), rng);
      const S = pick(lv(L, [100, 200], [100, 200, 400, 800, 1000], [100, 250, 400, 500, 800]), rng);
      const E = S * (1 + r / 100) ** n;
      if (Math.abs(E * 100 - Math.round(E * 100)) > 1e-6) continue;
      return task('growth.cagr', { params: { r, n, S, E },
        prompt: `Umsatz wächst in ${n} Jahren von ${fmt(S)} auf ${fmt(E)} Mio. €. Jährliche Wachstumsrate?`,
        unit: '%',
        expected: r,
        abs: 1,
      });
    }
  },
  'biz.payback': (rng, L) => {
    for (;;) {
      const I = pick(lv(L, [2, 4, 6, 8, 10, 12, 20], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30], [7, 9, 14, 18, 22, 35, 45]), rng);
      const s = pick(lv(L, [1, 2, 4, 5], [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8], [1.5, 2.5, 3, 4, 6, 7]), rng);
      if (I / s > 10) continue;
      const e = round(I / s, 4);
      return task('biz.payback', { params: { I, s },
        prompt: `Investition ${fmt(I)} Mio. €, jährliche Ersparnis ${fmt(s)} Mio. €. Payback in Jahren?`,
        unit: 'Jahre',
        hint: decHint(e),
        expected: e,
        abs: 0.06,
      });
    }
  },
  'biz.breakeven': (rng, L) => {
    for (;;) {
      const db = pick(lv(L, [10, 20, 25, 50], [5, 8, 10, 12, 15, 20, 25, 40, 50], [12, 15, 18, 24, 35, 45]), rng);
      const p = L === 1 ? 10 * randInt(3, 20, rng) : L === 3 ? randInt(40, 400, rng) : 5 * randInt(4, 40, rng);
      if (p <= db) continue;
      const v = p - db, Q = 1000 * randInt(lv(L, 2, 2, 8), lv(L, 20, 80, 150), rng), F = db * Q;
      return task('biz.breakeven', { params: { F, p, v },
        prompt: `Fixkosten ${fmt(F)} €, Preis ${fmt(p)} €, variable Kosten ${fmt(v)} € pro Stück. Break-even-Menge?`,
        unit: 'Stück',
        expected: Q,
      });
    }
  },
  'biz.margin': (rng, L) => {
    for (;;) {
      const R = pick(lv(L, [20, 40, 50, 100, 200, 400], [20, 40, 50, 80, 120, 150, 200, 250, 400, 500], [60, 75, 90, 120, 160, 180, 240, 350, 450, 640]), rng);
      const m = pick(lv(L, [5, 10, 20, 25], [2, 4, 5, 8, 10, 12, 15, 20, 25], [6, 7, 8, 9, 12, 15, 18, 24, 35]), rng);
      const G = (R * m) / 100;
      if (Math.abs(G * 10 - Math.round(G * 10)) > 1e-6) continue;
      return task('biz.margin', { params: { R, G },
        prompt: `Umsatz ${fmt(R)} Mio. €, Gewinn ${fmt(G)} Mio. €. Marge in %?`,
        unit: '%',
        expected: m,
      });
    }
  },
  'biz.roi': (rng, L) => {
    const C = pick(lv(L, [2, 4, 5, 10], [2, 4, 5, 8, 10, 20], [3, 6, 7, 9, 12, 15, 25, 40]), rng);
    const roi = pick(lv(L, [10, 20, 50, 100], [10, 20, 25, 40, 50, 75, 100, 150, 200], [15, 30, 35, 45, 60, 80, 120, 175, 250]), rng);
    const B = round(C * (1 + roi / 100), 4);
    return task('biz.roi', { params: { C, B },
      prompt: `Investition ${fmt(C)} Mio. €, Nutzen insgesamt ${fmt(B)} Mio. €. ROI in %?`,
      unit: '%',
      expected: roi,
    });
  },
  'biz.tco': (rng, L) => {
    const O = pick(lv(L, [2, 5, 10], [2, 3, 5, 8, 10, 12, 15], [3.5, 7.5, 12, 18, 24]), rng);
    const A = pick(lv(L, [1, 2, 3, 5, 10], [1.5, 2, 2.5, 3, 4, 5, 7.5, 12, 15, 20], [2.4, 3.6, 4.5, 6.5, 8.5, 12.5]), rng);
    const n = pick(lv(L, [2, 3, 5], [3, 4, 5], [4, 5, 6, 7]), rng);
    return task('biz.tco', { params: { O, A, n },
      prompt: `Einmalkosten ${fmt(O)} Mio. €, laufende Kosten ${fmt(A)} Mio. € pro Jahr, ${n} Jahre. TCO?`,
      unit: 'Mio. €',
      expected: O + n * A,
    });
  },
  'biz.fte': (rng, L) => {
    const V = pick(lv(L, [0.5, 1, 2], [0.5, 1, 1.2, 1.5, 2, 3], [0.7, 1.2, 1.8, 2.5, 3.5, 4.2]), rng);
    const t = pick(lv(L, [3, 5, 6, 10], [3, 4, 5, 6, 8, 10, 12], [7, 9, 11, 13, 15]), rng);
    const s = pick(lv(L, [10, 20, 25, 50], [10, 20, 25, 30, 40, 50], [15, 35, 45, 60]), rng);
    const H = pick(lv(L, [1600], [1500, 1600], [1500, 1600, 1650, 1720]), rng);
    return task('biz.fte', { params: { V, t, s, H },
      prompt: `${fmt(V)} Mio. Anfragen/Jahr à ${fmt(t)} min, KI spart ${fmt(s)} % der Zeit. Wie viele FTE werden frei (${fmt(H)} h pro FTE)?`,
      unit: 'FTE',
      hint: '±5 % ok',
      expected: (V * 1e6 * t * (s / 100)) / 60 / H,
      rel: 0.05,
    });
  },
  'biz.sla': (rng, L) => {
    const a = pick(lv(L, [99, 99.9], [99, 99.5, 99.9, 99.95, 99.99], [99.5, 99.95, 99.99, 99.8, 99.7]), rng);
    const minutes = a === 99.99;
    const hours = ((100 - a) / 100) * 8760;
    return task('biz.sla', { params: { a },
      prompt: `Verfügbarkeit (SLA) ${fmt(a)} % pro Jahr. Maximale Ausfallzeit in ${minutes ? 'Minuten' : 'Stunden'}?`,
      unit: minutes ? 'min' : 'h',
      hint: '±5 % ok',
      expected: minutes ? hours * 60 : hours,
      rel: 0.05,
    });
  },
  'est.mult': (rng, L) => {
    let a, b;
    if (L === 1) { a = 10 * randInt(11, 99, rng); b = randInt(11, 30, rng); }
    else if (L === 3) { a = randInt(1100, 9900, rng); b = randInt(110, 990, rng); }
    else { a = rng() < 0.5 ? randInt(110, 990, rng) : randInt(1100, 9900, rng); b = randInt(11, 99, rng); }
    return task('est.mult', { params: { a, b },
      prompt: `${fmt(a)} × ${fmt(b)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: a * b,
      rel: 0.08,
    });
  },
  'est.div': (rng, L) => {
    const n = L === 1 ? randInt(10, 99, rng) * 100 : L === 3 ? randInt(10000, 990000, rng) : randInt(1000, 99000, rng);
    const d = randInt(lv(L, 11, 13, 13), lv(L, 49, 97, 97), rng);
    return task('est.div', { params: { n, d },
      prompt: `${fmt(n)} ÷ ${fmt(d)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: n / d,
      rel: 0.08,
    });
  },
  'est.pct': (rng, L) => {
    for (;;) {
      const p = L === 1 ? pick([11, 12, 19, 21, 22, 29, 31, 39], rng) : randInt(11, 89, rng);
      if (p % 5 === 0) continue;
      const y = L === 1 ? 100 * randInt(12, 99, rng) : L === 3 ? randInt(11000, 99900, rng) : randInt(1100, 9900, rng);
      return task('est.pct', { params: { p, y },
        prompt: `${fmt(p)} % von ${fmt(y)}`,
        hint: 'Schätzung, ±8 % ok',
        expected: (p * y) / 100,
        rel: 0.08,
      });
    }
  },
};

export function generate(subtypeId, rng = Math.random, { level = 2 } = {}) {
  const g = GEN[subtypeId];
  if (!g) throw new Error(`Unbekannter Aufgabentyp: ${subtypeId}`);
  const L = normLevel(level);
  const t = g(rng, L);
  t.level = L;
  t.weight = round(SUBTYPES[subtypeId].weight * LEVEL_WEIGHT[L], 4);
  t.targetMs = Math.round(SUBTYPES[subtypeId].targetMs * LEVEL_TIME[L]);
  return t;
}

const subtypesOf = (cat) => Object.values(SUBTYPES).filter((s) => s.category === cat).map((s) => s.id);
const idOf = (x) => (typeof x === 'string' ? x : x?.subtype);

export function generateForMode(mode, { weakSubtypes = [], reviewSubtypes = [], levelFor } = {}, rng = Math.random) {
  let id;
  if (SUBTYPES[mode]) {
    id = mode;
  } else if (CATEGORIES.some((c) => c.id === mode)) {
    id = pick(subtypesOf(mode), rng);
  } else if (mode === 'weak') {
    const valid = (weakSubtypes || []).map(idOf).filter((w) => SUBTYPES[w]);
    id = valid.length ? pick(valid, rng) : pick(subtypesOf(pick(CATEGORIES, rng).id), rng);
  } else if (mode === 'review') {
    const valid = (reviewSubtypes || []).map(idOf).filter((w) => SUBTYPES[w]);
    id = valid.length ? pick(valid, rng) : pick(subtypesOf(pick(CATEGORIES, rng).id), rng);
  } else {
    id = pick(subtypesOf(pick(CATEGORIES, rng).id), rng);
  }
  const lvl = typeof levelFor === 'function' ? levelFor(id) : 2;
  const t = generate(id, rng, { level: lvl });
  t.mode = mode;
  return t;
}
