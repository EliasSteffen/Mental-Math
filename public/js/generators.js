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
  'mult.2x1': (rng) => {
    const a = randInt(12, 99, rng), b = randInt(3, 9, rng);
    return task('mult.2x1', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
  },
  'mult.2x2': (rng) => {
    for (;;) {
      const a = randInt(12, 99, rng), b = randInt(12, 99, rng);
      if (a % 10 === 0 || b % 10 === 0) continue;
      return task('mult.2x2', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
    }
  },
  'mult.easy': (rng) => {
    const f = pick([5, 25, 50], rng), a = randInt(12, 480, rng);
    return task('mult.easy', { params: { a, f }, prompt: `${fmt(a)} × ${fmt(f)}`, expected: a * f });
  },
  'mult.square': (rng) => {
    for (;;) {
      const a = randInt(13, 99, rng);
      if (a % 10 === 0) continue;
      return task('mult.square', { params: { a }, prompt: `${fmt(a)} × ${fmt(a)}`, expected: a * a });
    }
  },
  'div.exact': (rng) => {
    const d = pick([3, 4, 6, 7, 8, 9, 12, 15, 25], rng), q = randInt(12, 250, rng);
    return task('div.exact', { params: { n: d * q, d }, prompt: `${fmt(d * q)} ÷ ${fmt(d)}`, expected: q });
  },
  'div.decimal': (rng) => {
    const d = pick([0.2, 0.25, 0.4, 0.5, 0.8, 1.5, 2.5], rng), q = 20 * randInt(1, 40, rng);
    return task('div.decimal', { params: { n: round(q * d, 4), d }, prompt: `${fmt(round(q * d, 4))} ÷ ${fmt(d)}`, expected: q });
  },
  'div.round': (rng) => {
    for (;;) {
      const d = pick([6, 7, 8, 9, 11, 12], rng), n = randInt(200, 2000, rng);
      if (n % d === 0) continue;
      return task('div.round', { params: { n, d },
        prompt: `${fmt(n)} ÷ ${fmt(d)}`,
        hint: 'auf ganze Zahl runden',
        expected: Math.round(n / d),
        abs: 1,
      });
    }
  },
  'big.mult': (rng) => {
    for (;;) {
      const m = pick([1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8], rng);
      const uName = pick(['Tsd.', 'Mio.'], rng);
      const b = pick([20, 30, 40, 50, 60, 80, 200, 300, 400, 500, 2000, 3000, 4000, 5000, 20000, 40000], rng);
      const P = round(m * UNIT_VALUE[uName] * b, 4);
      const ua = P >= 1e9 ? 'Mrd.' : P >= 1e6 ? 'Mio.' : 'Tsd.';
      const e = P / UNIT_VALUE[ua];
      if (round(e, 3) !== round(e, 4) && Math.abs(e - round(e, 2)) > 1e-9) continue;
      return task('big.mult', { params: { m, u: uName, b, ua },
        prompt: `${fmt(m)} ${uName} × ${fmt(b)}`,
        unit: ua,
        expected: e,
        abs: 0.005,
      });
    }
  },
  'big.div': (rng) => {
    for (;;) {
      const q = pick([2, 3, 4, 5, 6, 8, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80], rng);
      const k = pick([3, 4, 5, 6], rng);
      const A = q * 10 ** k;
      const d = pick([200, 300, 400, 500, 2000, 4000, 5000, 20000, 40000, 400000], rng);
      const D = A * d;
      if (D < 1e5 || D >= 1e12) continue;
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
  'big.percapita': (rng) => {
    const T = 0.5 * randInt(1, 60, rng);
    const [label, base] = pick([
      ['84 Mio. Einwohner', 84],
      ['41 Mio. Haushalte', 41],
      ['46 Mio. Erwerbstätige', 46],
      ['450 Mio. EU-Bürger', 450],
    ], rng);
    return task('big.percapita', { params: { T, base },
      prompt: `${fmt(T)} Mrd. € verteilt auf ${label} – wie viel € pro Kopf?`,
      unit: '€',
      hint: PCT_HINT,
      expected: (T * 1000) / base,
      rel: 0.03,
    });
  },
  'pct.of': (rng) => {
    const p = pick([3, 5, 8, 10, 12, 15, 17, 20, 25, 30, 35, 40, 45, 60, 75], rng);
    const y = randInt(4, 96, rng) * pick([10, 100], rng);
    return task('pct.of', { params: { p, y }, prompt: `${fmt(p)} % von ${fmt(y)}`, expected: (p * y) / 100, abs: 0.01 });
  },
  'pct.change': (rng) => {
    for (;;) {
      const alt = pick([20, 25, 40, 50, 60, 75, 80, 120, 150, 200, 250, 400], rng);
      const r = pick([5, 10, 12.5, 15, 20, 25, 30, 40, 50], rng);
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
  'pct.reverse': (rng) => {
    const O = 20 * randInt(2, 20, rng);
    const discount = rng() < 0.5;
    const r = discount ? pick([10, 20, 25, 40, 50], rng) : pick([10, 20, 25, 50], rng);
    const nach = round(O * (1 + (discount ? -r : r) / 100), 4);
    return task('pct.reverse', { params: { r, nach, discount: discount ? 1 : 0 },
      prompt: `Nach ${fmt(r)} % ${discount ? 'Rabatt' : 'Preiserhöhung'} kostet ein Produkt ${fmt(nach)} €. Ursprünglicher Preis?`,
      unit: '€',
      expected: O,
    });
  },
  'pct.points': (rng) => {
    const m1 = pick([4, 5, 8, 10, 12, 15, 20, 25], rng), d = randInt(1, 5, rng), m2 = m1 + d;
    const e = round((d / m1) * 100, 4);
    return task('pct.points', { params: { m1, m2 },
      prompt: `Die Marge steigt von ${fmt(m1)} % auf ${fmt(m2)} %. Um wie viel Prozent (nicht Prozentpunkte)?`,
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.1,
    });
  },
  'pct.chain': (rng) => {
    const R = [10, 20, 25, 50, -10, -20, -25, -50];
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
  'frac.topct': (rng) => {
    const [n, d] = pick([
      [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 7],
      [1, 8], [3, 8], [5, 8], [7, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 15], [1, 20], [1, 25], [1, 40],
    ], rng);
    const e = round((n / d) * 100, 4);
    return task('frac.topct', { params: { n, d },
      prompt: `${n}/${d} in Prozent`,
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.15,
    });
  },
  'frac.of': (rng) => {
    const d = pick([3, 4, 5, 6, 8, 12, 25], rng), n = randInt(1, d - 1, rng);
    const y = d * randInt(3, 60, rng) * pick([1, 10], rng);
    return task('frac.of', { params: { n, d, y }, prompt: `${n}/${d} von ${fmt(y)}`, expected: (n * y) / d });
  },
  'growth.compound': (rng) => {
    const r = pick([2, 3, 4, 5, 6, 8, 10, 15, 20], rng);
    const n = randInt(2, r >= 15 ? 3 : 5, rng);
    return task('growth.compound', { params: { r, n },
      prompt: `${fmt(r)} % Wachstum pro Jahr über ${n} Jahre – Gesamtwachstum?`,
      unit: '%',
      hint: '±2 % ok',
      expected: ((1 + r / 100) ** n - 1) * 100,
      abs: 0.5,
      rel: 0.02,
    });
  },
  'growth.rule72': (rng) => {
    const r = pick([2, 3, 4, 6, 8, 9, 12, 18, 24], rng);
    return task('growth.rule72', { params: { r },
      prompt: `Bei ${fmt(r)} % Wachstum p. a. – nach wie vielen Jahren verdoppelt sich der Wert (ca.)?`,
      unit: 'Jahre',
      expected: 72 / r,
      rel: 0.1,
    });
  },
  'growth.cagr': (rng) => {
    for (;;) {
      const r = pick([5, 10, 20, 25, 50], rng), n = pick([2, 3], rng), S = pick([100, 200, 400, 800, 1000], rng);
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
  'biz.payback': (rng) => {
    for (;;) {
      const I = pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30], rng);
      const s = pick([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8], rng);
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
  'biz.breakeven': (rng) => {
    for (;;) {
      const db = pick([5, 8, 10, 12, 15, 20, 25, 40, 50], rng);
      const p = 5 * randInt(4, 40, rng);
      if (p <= db) continue;
      const v = p - db, Q = 1000 * randInt(2, 80, rng), F = db * Q;
      return task('biz.breakeven', { params: { F, p, v },
        prompt: `Fixkosten ${fmt(F)} €, Preis ${fmt(p)} €, variable Kosten ${fmt(v)} € pro Stück. Break-even-Menge?`,
        unit: 'Stück',
        expected: Q,
      });
    }
  },
  'biz.margin': (rng) => {
    for (;;) {
      const R = pick([20, 40, 50, 80, 120, 150, 200, 250, 400, 500], rng);
      const m = pick([2, 4, 5, 8, 10, 12, 15, 20, 25], rng);
      const G = (R * m) / 100;
      if (Math.abs(G * 10 - Math.round(G * 10)) > 1e-6) continue;
      return task('biz.margin', { params: { R, G },
        prompt: `Umsatz ${fmt(R)} Mio. €, Gewinn ${fmt(G)} Mio. €. Marge in %?`,
        unit: '%',
        expected: m,
      });
    }
  },
  'biz.roi': (rng) => {
    const C = pick([2, 4, 5, 8, 10, 20], rng), roi = pick([10, 20, 25, 40, 50, 75, 100, 150, 200], rng);
    const B = round(C * (1 + roi / 100), 4);
    return task('biz.roi', { params: { C, B },
      prompt: `Investition ${fmt(C)} Mio. €, Nutzen insgesamt ${fmt(B)} Mio. €. ROI in %?`,
      unit: '%',
      expected: roi,
    });
  },
  'biz.tco': (rng) => {
    const O = pick([2, 3, 5, 8, 10, 12, 15], rng);
    const A = pick([1.5, 2, 2.5, 3, 4, 5, 7.5, 12, 15, 20], rng);
    const n = pick([3, 4, 5], rng);
    return task('biz.tco', { params: { O, A, n },
      prompt: `Einmalkosten ${fmt(O)} Mio. €, laufende Kosten ${fmt(A)} Mio. € pro Jahr, ${n} Jahre. TCO?`,
      unit: 'Mio. €',
      expected: O + n * A,
    });
  },
  'biz.fte': (rng) => {
    const V = pick([0.5, 1, 1.2, 1.5, 2, 3], rng), t = pick([3, 4, 5, 6, 8, 10, 12], rng);
    const s = pick([10, 20, 25, 30, 40, 50], rng), H = pick([1500, 1600], rng);
    return task('biz.fte', { params: { V, t, s, H },
      prompt: `${fmt(V)} Mio. Anfragen/Jahr à ${fmt(t)} min, KI spart ${fmt(s)} % der Zeit. Wie viele FTE werden frei (${fmt(H)} h pro FTE)?`,
      unit: 'FTE',
      hint: '±5 % ok',
      expected: (V * 1e6 * t * (s / 100)) / 60 / H,
      rel: 0.05,
    });
  },
  'biz.sla': (rng) => {
    const a = pick([99, 99.5, 99.9, 99.95, 99.99], rng);
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
  'est.mult': (rng) => {
    const a = rng() < 0.5 ? randInt(110, 990, rng) : randInt(1100, 9900, rng), b = randInt(11, 99, rng);
    return task('est.mult', { params: { a, b },
      prompt: `${fmt(a)} × ${fmt(b)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: a * b,
      rel: 0.08,
    });
  },
  'est.div': (rng) => {
    const n = randInt(1000, 99000, rng), d = randInt(13, 97, rng);
    return task('est.div', { params: { n, d },
      prompt: `${fmt(n)} ÷ ${fmt(d)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: n / d,
      rel: 0.08,
    });
  },
  'est.pct': (rng) => {
    for (;;) {
      const p = randInt(11, 89, rng);
      if (p % 5 === 0) continue;
      const y = randInt(1100, 9900, rng);
      return task('est.pct', { params: { p, y },
        prompt: `${fmt(p)} % von ${fmt(y)}`,
        hint: 'Schätzung, ±8 % ok',
        expected: (p * y) / 100,
        rel: 0.08,
      });
    }
  },
};

export function generate(subtypeId, rng = Math.random) {
  const g = GEN[subtypeId];
  if (!g) throw new Error(`Unbekannter Aufgabentyp: ${subtypeId}`);
  return g(rng);
}

const subtypesOf = (cat) => Object.values(SUBTYPES).filter((s) => s.category === cat).map((s) => s.id);

export function generateForMode(mode, { weakSubtypes = [] } = {}, rng = Math.random) {
  let id;
  if (SUBTYPES[mode]) {
    id = mode;
  } else if (CATEGORIES.some((c) => c.id === mode)) {
    id = pick(subtypesOf(mode), rng);
  } else if (mode === 'weak') {
    const valid = (weakSubtypes || []).map((w) => (typeof w === 'string' ? w : w?.subtype)).filter((w) => SUBTYPES[w]);
    id = valid.length ? pick(valid, rng) : pick(subtypesOf(pick(CATEGORIES, rng).id), rng);
  } else {
    id = pick(subtypesOf(pick(CATEGORIES, rng).id), rng);
  }
  const t = generate(id, rng);
  t.mode = mode;
  return t;
}
