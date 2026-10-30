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
  { id: 'units', name: 'Einheiten', description: 'Dimensionen, Umrechnen' },
  { id: 'mag', name: 'Größenordnungen', description: 'Zehnerpotenzen, Schätzen' },
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
  ['units.dimless', 'Dimensionslos machen', 10000, 1, 'Durch die eigene Einheit teilen → dimensionslos; mal nehmen → Kehrwert-Einheit'],
  ['units.result', 'Ergebnis-Einheit', 10000, 1, 'Einheiten wie Brüche kürzen: €/h × h/Jahr = €/Jahr'],
  ['units.convert', 'Einheiten umrechnen', 15000, 1.5, 'Erst die Zeitbasis, dann die Größe (Tsd./Mio.) umrechnen – 36 km/h = 10 m/s'],
  ['mag.exponent', 'Zehnerpotenz einer Zahl', 6000, 1, 'a × 10ⁿ mit 1 ≤ a < 10: Komma verschieben, Stellen zählen'],
  ['mag.facts', 'Größenordnungen kennen', 8000, 1, 'Anker: 84 Mio. Einwohner ≈ 10⁷, 8.760 h/Jahr ≈ 10³, 3,15 · 10⁷ s/Jahr'],
  ['mag.product', 'Größenordnung von Produkten', 10000, 1.5, 'Mantissen multiplizieren, Exponenten addieren – Mantisse ≥ 10 gibt +1'],
  ['mag.ratio', 'Größenordnung von Quotienten', 10000, 1.5, 'Mantissen teilen, Exponenten subtrahieren – Mantisse < 1 gibt −1'],
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
  const t = {
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
  if (o.choices) { t.kind = 'choice'; t.choices = o.choices; }
  return t;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Auswahl-Aufgabe: richtige Option + 3 Distraktoren, gemischt; expected = Index der richtigen Option
function choiceTask(id, rng, { prompt, correct, distractors, params = {}, hint = '' }) {
  const wrong = [];
  for (const d of distractors) if (d !== correct && !wrong.includes(d)) wrong.push(d);
  const choices = shuffle([correct, ...wrong.slice(0, 3)], rng);
  const c = Object.fromEntries(choices.map((x, i) => ['c' + i, x]));
  return task(id, { prompt, choices, hint, expected: choices.indexOf(correct), params: { ...params, ...c } });
}

// ---------- Einheiten-Algebra (Liste aus [Basiseinheit, Exponent], ungekürzt) ----------
export function parseU(str) {
  const [n, d] = String(str).split('/');
  const part = (s, sign) => (s && s !== '1' ? s.replace(/[()]/g, '').split('·').map((x) => [x.trim(), sign]) : []);
  return [...part(n, 1), ...part(d, -1)];
}
export const uMul = (a, b) => [...a, ...b];
export const uDiv = (a, b) => [...a, ...b.map(([n, e]) => [n, -e])];
export const uInv = (a) => a.map(([n, e]) => [n, -e]);
export function uMap(list) {
  const m = new Map();
  for (const [n, e] of list) m.set(n, (m.get(n) || 0) + e);
  return [...m].filter(([, e]) => e !== 0);
}
export function uStr(list) {
  const m = uMap(list);
  const sup = (e) => String(e).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  const num = m.filter(([, e]) => e > 0).map(([n, e]) => (e === 1 ? n : `${n}${sup(e)}`)).sort();
  const den = m.filter(([, e]) => e < 0).map(([n, e]) => (e === -1 ? n : `${n}${sup(-e)}`)).sort();
  if (!num.length && !den.length) return 'dimensionslos';
  const top = num.length ? num.join('·') : '1';
  if (!den.length) return top;
  return `${top}/${den.length > 1 ? `(${den.join('·')})` : den[0]}`;
}
// Ungekürzte Bruchschreibweise, z. B. "(€ · h) / (h · Jahr)"
export function uRaw(list) {
  const num = list.filter(([, e]) => e > 0).map(([n]) => n);
  const den = list.filter(([, e]) => e < 0).map(([n]) => n);
  const g = (xs) => (xs.length > 1 ? `(${xs.join(' · ')})` : xs[0]);
  if (!den.length) return num.join(' · ') || '1';
  return `${num.length ? g(num) : '1'} / ${g(den)}`;
}
const TIME_SWAP = { Jahr: ['Monat', 'Tag'], Monat: ['Jahr', 'Tag'], Tag: ['Jahr', 'h'], h: ['Tag', 'Jahr'] };

// Plausible Fehlantworten für eine Einheit: Kehrwert, Einzelfaktoren, falsche Zeitbasis
function unitDistractors(list, rng, extra = []) {
  const m = uMap(list);
  const correct = uStr(list);
  const prio = [uStr(uInv(list)), ...extra];
  for (const [n, e] of m) prio.push(uStr([[n, e]]), uStr([[n, -e]]));
  m.forEach(([n], i) => {
    for (const s of TIME_SWAP[n] || []) prio.push(uStr(m.map(([x, y], j) => [j === i ? s : x, y])));
  });
  const all = [...shuffle(prio, rng), ...shuffle(['€', '1/Jahr', '€/Jahr', 'Stück', 'h', '€/Stück', 'Jahr', 'dimensionslos'], rng)];
  return all.filter((x, i) => x !== correct && all.indexOf(x) === i && x.length <= 40);
}

const RES_PAIRS = [
  ['€/h', '×', 'h/Jahr'], ['Stück/Tag', '×', '€/Stück'], ['€', '÷', 'Mitarbeiter'], ['km/h', '×', 'h'],
  ['Mitarbeiter', '×', '€/Mitarbeiter'], ['€/Jahr', '÷', 'Stück/Jahr'], ['Tag/Jahr', '×', 'h/Tag'], ['€', '÷', 'Stück'],
  ['€/Stück', '×', 'Stück'], ['€/Monat', '×', 'Monat/Jahr'], ['km', '÷', 'h'], ['€/Jahr', '÷', 'Mitarbeiter'],
  ['Stück', '÷', 'Stück/Tag'], ['€/Jahr', '÷', '€'], ['Kunde', '×', '€/Kunde'], ['€/Min.', '×', 'Min./h'],
  ['h/Jahr', '÷', 'Tag/Jahr'], ['€', '÷', '€/Stück'],
];
const RES_TRIPLES = [
  ['€/h', '×', 'h/Tag', '×', 'Tag/Jahr'], ['Stück/Tag', '×', '€/Stück', '×', 'Tag/Jahr'],
  ['€/Jahr', '÷', 'Mitarbeiter', '÷', 'Stück/Mitarbeiter'], ['€', '÷', 'Stück', '÷', 'Tag'],
  ['km/h', '×', 'h/Tag', '×', 'Tag'], ['€/Mitarbeiter', '×', 'Mitarbeiter', '÷', 'Jahr'],
  ['Stück', '×', '€/Stück', '÷', 'Mitarbeiter'], ['€/Min.', '×', 'Min./h', '×', 'h/Jahr'],
];
const QUANT = {
  '€/Jahr': ['Umsatz', 'Personalkosten', 'Gewinn'], '€': ['Kosten', 'Budget', 'Investition'],
  'h/Jahr': ['Ausfallzeit', 'Arbeitszeit', 'Wartungszeit'], 'Stück/Tag': ['Produktion', 'Absatz'],
  '€/Stück': ['Preis', 'Stückkosten'], 'km/h': ['Geschwindigkeit'], 'Stück': ['Absatz', 'Stückzahl'],
  'h/Tag': ['Arbeitszeit'], '€/h': ['Stundensatz'], 'Mitarbeiter': ['Belegschaft'], '€/Monat': ['Miete', 'Umsatz'],
  'Stück/Jahr': ['Absatz', 'Produktion'], '€/Mitarbeiter': ['Kosten pro Kopf'],
};

// Ausdruck aus [u1, op1, u2, (op2, u3)] auswerten → Einheitenliste
function evalExpr(ex) {
  let acc = parseU(ex[0]);
  for (let i = 1; i < ex.length; i += 2) acc = ex[i] === '×' ? uMul(acc, parseU(ex[i + 1])) : uDiv(acc, parseU(ex[i + 1]));
  return acc;
}

const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;
const decHint = (x) => (isInt(x) ? '' : 'auf 1 Nachkommastelle');
// Hinweis mit der tatsächlichen Stellenzahl (z. B. 0,78 → „auf 2 Nachkommastellen“)
function placesHint(x) {
  const s = String(round(x, 4));
  const d = s.includes('.') ? s.split('.')[1].length : 0;
  return d === 0 ? '' : `auf ${d} Nachkommastelle${d > 1 ? 'n' : ''}`;
}
const PCT_HINT = '±3 % ok';

const UNIT_VALUE = { 'Tsd.': 1e3, 'Mio.': 1e6, 'Mrd.': 1e9 };

// Große Zahl als Mantisse + Einheit (ab 1 Mio.), sonst ausgeschrieben
function bigStr(v) {
  if (v >= 1e9) return fmt(v / 1e9) + ' Mrd.';
  if (v >= 1e6) return fmt(v / 1e6) + ' Mio.';
  return fmt(v);
}

// ---------- Größenordnungen ----------
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const p10 = (n) => '10' + (n < 0 ? '⁻' : '') + String(Math.abs(n)).split('').map((c) => SUPD[+c]).join('');
const WORD = { 3: 'Tsd.', 6: 'Mio.', 9: 'Mrd.' };
const sciStr = (a, p) => (a === 1 ? p10(p) : `${fmt(a, 4)}·${p10(p)}`);

// a × 10^p als Text: 'sci' (4,2·10⁵), 'word' (420 Tsd.), 'plain' (420.000); fällt auf sci zurück
function dispNum(a, p, style) {
  if (style === 'word') {
    const e = [9, 6, 3].find((x) => x <= p && p - x <= 2);
    if (e) return `${fmt(round(a * 10 ** (p - e), 6), 6)} ${WORD[e]}`;
  } else if (style === 'plain' && p >= -5 && p <= 6) {
    return fmt(round(a * 10 ** p, 8), 8);
  }
  return sciStr(a, p);
}

const FACTS = [
  ['Einwohner Deutschland', '84 Mio.', 8.4, 7, 1], ['Sekunden pro Tag', '86.400', 8.64, 4, 1],
  ['Stunden pro Jahr', '8.760', 8.76, 3, 1], ['Tage pro Jahr', '365', 3.65, 2, 1],
  ['Einwohner Welt', '8,2 Mrd.', 8.2, 9, 1], ['Minuten pro Tag', '1.440', 1.44, 3, 1],
  ['Wochen pro Jahr', '52', 5.2, 1, 1],
  ['Haushalte Deutschland', '41 Mio.', 4.1, 7, 2], ['Erwerbstätige Deutschland', '46 Mio.', 4.6, 7, 2],
  ['Einwohner EU', '450 Mio.', 4.5, 8, 2], ['Pkw in Deutschland', '49 Mio.', 4.9, 7, 2],
  ['Arbeitsstunden pro FTE und Jahr', '1.700', 1.7, 3, 2], ['Einwohner USA', '335 Mio.', 3.35, 8, 2],
  ['Einwohner Berlin', '3,7 Mio.', 3.7, 6, 2], ['Arbeitstage pro Jahr', '220', 2.2, 2, 2],
  ['Minuten pro Jahr', '525.600', 5.256, 5, 2],
  ['BIP Deutschland in €', '4.300 Mrd.', 4.3, 12, 3], ['Sekunden pro Jahr', '31,5 Mio.', 3.15, 7, 3],
  ['Einwohner China', '1,4 Mrd.', 1.4, 9, 3], ['Einwohner Indien', '1,4 Mrd.', 1.4, 9, 3],
  ['Sekunden pro Monat', '2,6 Mio.', 2.6, 6, 3],
];
const EXP_HINT = 'a × 10ⁿ mit 1 ≤ a < 10';

// Zwei Faktoren a × 10^p für Produkt/Quotient
function twoFactors(rng, L, kind) {
  let a1, a2, p1, p2;
  const styles = lv(L, ['sci', 'word', 'plain'], ['sci', 'word', 'plain', 'word'], ['sci', 'word', 'sci']);
  for (;;) {
    if (kind === 'product') {
      if (L === 1) {
        a1 = pick([1, 2, 3], rng); a2 = pick([1, 2, 3], rng); p1 = randInt(2, 6, rng); p2 = randInt(2, 5, rng);
      } else if (L === 2) {
        a1 = randInt(2, 9, rng); a2 = randInt(2, 9, rng); p1 = randInt(2, 7, rng); p2 = randInt(2, 6, rng);
      } else {
        a1 = pick([1.2, 1.5, 2.5, 3.2, 4, 6, 7.5, 8], rng); a2 = pick([1.5, 2.4, 3, 4, 5, 6.4, 8], rng);
        p1 = randInt(-4, 9, rng); p2 = randInt(-4, 9, rng);
      }
    } else if (L === 1) {
      a2 = pick([1, 2, 3, 4], rng); a1 = a2 * randInt(1, Math.floor(9 / a2), rng); p1 = randInt(6, 10, rng); p2 = randInt(2, 4, rng);
    } else if (L === 2) {
      a1 = randInt(1, 9, rng); a2 = randInt(2, 9, rng); p1 = randInt(3, 10, rng); p2 = randInt(2, 6, rng);
    } else {
      a1 = pick([1.2, 1.5, 2.4, 3, 4.5, 6, 7.5, 9], rng); a2 = pick([1.5, 2, 2.5, 4, 5, 6.4, 8], rng);
      p1 = randInt(-3, 9, rng); p2 = randInt(-3, 9, rng);
    }
    if (a1 === a2 && L > 1) continue;
    break;
  }
  const d1 = dispNum(a1, p1, pick(styles, rng)), d2 = dispNum(a2, p2, pick(styles, rng));
  return { a1, a2, p1, p2, d1, d2 };
}

// ---------- Einheiten umrechnen ----------
// Jede Familie: gen(rng, L) → { x, y, prompt, unit, expected, abs }
const CONV = {
  1: (rng, L) => {
    const x = 5 * randInt(lv(L, 2, 2, 5), lv(L, 40, 100, 300), rng) * (L === 1 ? 2 : 1);
    return { x, y: 0, prompt: `${fmt(x)} Tsd. €/Monat = ? Mio. €/Jahr`, unit: 'Mio. €/Jahr', expected: (x * 12) / 1000, abs: 0.005 };
  },
  2: (rng, L) => {
    const x = 18 * pick(lv(L, [2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7, 8], [1, 3, 5, 7, 9, 10]), rng);
    return { x, y: 0, prompt: `${fmt(x)} km/h = ? m/s`, unit: 'm/s', expected: x / 3.6 };
  },
  3: (rng, L) => {
    const x = L === 3 ? pick([2, 4, 6, 8, 12, 14], rng) : 5 * randInt(1, 8, rng);
    const e = round(x * 3.6, 4);
    return { x, y: 0, prompt: `${fmt(x)} m/s = ? km/h`, unit: 'km/h', expected: e, abs: isInt(e) ? 0 : 0.05 };
  },
  4: (rng, L) => {
    const x = pick(lv(L, [6, 8], [6, 7, 8, 9], [7.5, 8, 8.5, 9.5]), rng);
    const y = pick(lv(L, [200, 220, 250], [200, 210, 220, 225, 230, 240, 250], [210, 220, 230, 240]), rng);
    return { x, y, prompt: `${fmt(x)} h/Tag × ${fmt(y)} Tage = ? h/Jahr`, unit: 'h/Jahr', expected: x * y };
  },
  5: (rng, L) => {
    const x = pick(lv(L, [0.5, 1, 2, 3, 5], [0.25, 0.5, 1.5, 2, 2.5, 4, 5], [0.35, 0.75, 1.2, 1.75, 2.25, 3.5]), rng);
    return { x, y: 0, prompt: `${fmt(x)} €/Min. = ? €/h`, unit: '€/h', expected: x * 60 };
  },
  6: (rng, L) => {
    const y = 5 * randInt(lv(L, 2, 2, 4), lv(L, 40, 100, 250), rng) * (L === 1 ? 2 : 1);
    const x = round((y * 12) / 1000, 4);
    return { x, y, prompt: `${fmt(x)} Mio. €/Jahr = ? Tsd. €/Monat`, unit: 'Tsd. €/Monat', expected: y };
  },
  7: (rng, L) => {
    const x = 100 * pick(lv(L, [2, 4, 5, 10], [2, 4, 5, 8, 10, 12, 20, 25], [12, 15, 24, 36, 48, 75]), rng);
    const y = pick(lv(L, [250], [200, 220, 250, 300], [210, 240, 250, 280, 300]), rng);
    return { x, y, prompt: `${fmt(x)} Stück/Tag × ${fmt(y)} Tage = ? Tsd. Stück/Jahr`, unit: 'Tsd. Stück/Jahr', expected: (x * y) / 1000 };
  },
  8: (rng, L) => {
    for (;;) {
      const x = pick([6, 12, 15, 20, 30, 45, 90], rng), y = pick([200, 210, 220, 225, 240, 250], rng);
      if ((x * y) % 60 !== 0) continue;
      return { x, y, prompt: `${fmt(x)} Min./Tag × ${fmt(y)} Tage = ? h/Jahr`, unit: 'h/Jahr', expected: (x * y) / 60 };
    }
  },
  9: (rng) => {
    const y = pick([200, 250], rng), x = pick(y === 250 ? [0.5, 1, 1.5, 2, 2.5, 3, 5] : [0.5, 1, 2, 3, 5], rng);
    return { x, y, prompt: `${fmt(x)} Mio. Stück/Jahr bei ${fmt(y)} Tagen = ? Stück/Tag`, unit: 'Stück/Tag', expected: (x * 1e6) / y };
  },
};
const CONV_FAMS = { 1: [1, 2, 4, 5], 2: [1, 2, 3, 4, 5, 6, 7, 8], 3: [3, 6, 7, 8, 9, 1, 5] };

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
  'units.dimless': (rng, L) => {
    let ex, mode, ans;
    if (L === 3) {
      const [u1, op, u2] = pick(RES_PAIRS, rng);
      ex = [u1, op, u2];
      const comb = evalExpr(ex);
      if (!uMap(comb).length) return GEN['units.dimless'](rng, L);
      mode = rng() < 0.5 ? '÷' : '×';
      ans = mode === '÷' ? comb : uInv(comb);
      const prompt = `[${u1}] ${op} [${u2}] ${mode} ? = dimensionslos`;
      return choiceTask('units.dimless', rng, {
        prompt, correct: uStr(ans), distractors: unitDistractors(ans, rng, [uStr(comb)]),
        params: { ua: u1, ub: u2, o1: op, o2: mode, k: 3 },
        hint: 'Welche Einheit hat das Fragezeichen?',
      });
    }
    const keys = Object.keys(QUANT);
    const u = pick(L === 1 ? ['€/Jahr', '€', 'h/Jahr', 'Stück/Tag', '€/Stück', 'km/h'] : keys, rng);
    const nm = pick(QUANT[u], rng);
    mode = L === 1 ? '÷' : rng() < 0.5 ? '÷' : '×';
    ans = mode === '÷' ? parseU(u) : uInv(parseU(u));
    return choiceTask('units.dimless', rng, {
      prompt: `${nm} [${u}] ${mode} ? = dimensionslos`,
      correct: uStr(ans), distractors: unitDistractors(ans, rng, [uStr(parseU(u))]),
      params: { ua: u, ub: '', o1: '', o2: mode, k: 1 },
      hint: 'Welche Einheit hat das Fragezeichen?',
    });
  },
  'units.result': (rng, L) => {
    const ex = L === 3 ? pick(RES_TRIPLES, rng) : pick(L === 1 ? RES_PAIRS.slice(0, 9) : RES_PAIRS, rng);
    const res = evalExpr(ex);
    const prompt = ex.map((x, i) => (i % 2 === 0 ? `[${x}]` : x)).join(' ') + ' = ?';
    const alt = [];
    // gleiche Operanden mit vertauschten Rechenzeichen
    for (let mask = 0; mask < 2 ** ((ex.length - 1) / 2); mask++) {
      let acc = parseU(ex[0]);
      for (let i = 1; i < ex.length; i += 2) {
        const flip = (mask >> ((i - 1) / 2)) & 1;
        const mul = (ex[i] === '×') !== !!flip;
        acc = mul ? uMul(acc, parseU(ex[i + 1])) : uDiv(acc, parseU(ex[i + 1]));
      }
      alt.push(uStr(acc), uStr(uInv(acc)));
    }
    const correct = uStr(res);
    return choiceTask('units.result', rng, {
      prompt, correct,
      distractors: [...shuffle(alt.filter((x) => x !== correct), rng), ...unitDistractors(res, rng)],
      params: { ua: ex[0], o1: ex[1], ub: ex[2], o2: ex[3] || '', uc: ex[4] || '', k: (ex.length + 1) / 2 },
      hint: 'Einheiten kürzen wie Brüche',
    });
  },
  'units.convert': (rng, L) => {
    const fam = pick(CONV_FAMS[L], rng);
    const r = CONV[fam](rng, L);
    return task('units.convert', {
      params: { fam, x: r.x, y: r.y },
      prompt: r.prompt, unit: r.unit, hint: placesHint(r.expected),
      expected: r.expected, abs: r.abs,
    });
  },
  'mag.exponent': (rng, L) => {
    const a = pick(lv(L, [1.5, 2, 3, 4.2, 5, 6.5, 8, 9], [1.2, 2.5, 3.6, 4.8, 5.5, 7.2, 8.4, 9.5], [1.05, 2.4, 3.2, 4.5, 6.8, 7.5, 9.2]), rng);
    const word = L === 1 ? rng() < 0.6 : rng() < 0.5;
    let u = '', e = 0, k, n, disp;
    if (word) {
      e = pick([3, 6, 9], rng);
      k = pick(lv(L, [0], [0, 1, 2], [-2, -1, 3, 2]), rng);
      n = k + e;
      u = WORD[e];
      disp = `${fmt(round(a * 10 ** k, 6), 6)} ${u}`;
    } else {
      n = L === 1 ? randInt(3, 5, rng) : L === 2 ? randInt(-4, 6, rng) : randInt(-6, -2, rng);
      if (L === 2 && n >= 0 && n < 3) n = n - 4;
      k = n;
      disp = fmt(round(a * 10 ** n, 9), 9);
    }
    return task('mag.exponent', { params: { a, k, e, n, u, disp },
      prompt: `${disp} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: n,
    });
  },
  'mag.facts': (rng, L) => {
    const pool = FACTS.filter((f) => (L === 1 ? f[4] === 1 : L === 2 ? f[4] <= 2 : f[4] >= 2));
    const [label, v, a, n] = pick(pool, rng);
    return task('mag.facts', { params: { fact: label, v, a, n },
      prompt: `Größenordnung: ${label} – Wert = a × 10ⁿ, n = ?`,
      hint: EXP_HINT,
      expected: n,
    });
  },
  'mag.product': (rng, L) => {
    const f = twoFactors(rng, L, 'product');
    const carry = round(f.a1 * f.a2, 6) >= 10 ? 1 : 0;
    return task('mag.product', { params: { a1: f.a1, p1: f.p1, a2: f.a2, p2: f.p2, d1: f.d1, d2: f.d2 },
      prompt: `${f.d1} × ${f.d2} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: f.p1 + f.p2 + carry,
    });
  },
  'mag.ratio': (rng, L) => {
    const f = twoFactors(rng, L, 'ratio');
    const borrow = f.a1 < f.a2 ? 1 : 0;
    return task('mag.ratio', { params: { a1: f.a1, p1: f.p1, a2: f.a2, p2: f.p2, d1: f.d1, d2: f.d2 },
      prompt: `${f.d1} ÷ ${f.d2} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: f.p1 - f.p2 - borrow,
    });
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

// null/undefined → alle Kategorien; sonst gefiltert (leeres Ergebnis → alle)
export function activeCategories(enabled) {
  if (!Array.isArray(enabled)) return CATEGORIES;
  const list = CATEGORIES.filter((c) => enabled.includes(c.id));
  return list.length ? list : CATEGORIES;
}

export function generateForMode(mode, { weakSubtypes = [], reviewSubtypes = [], levelFor, enabledCategories = null } = {}, rng = Math.random) {
  const cats = activeCategories(enabledCategories);
  const catIds = new Set(cats.map((c) => c.id));
  const any = () => pick(subtypesOf(pick(cats, rng).id), rng);
  const filtered = (list) => (list || []).map(idOf).filter((w) => SUBTYPES[w] && catIds.has(SUBTYPES[w].category));
  let id;
  if (SUBTYPES[mode]) {
    id = mode;
  } else if (CATEGORIES.some((c) => c.id === mode)) {
    id = pick(subtypesOf(mode), rng);
  } else if (mode === 'weak') {
    const valid = filtered(weakSubtypes);
    id = valid.length ? pick(valid, rng) : any();
  } else if (mode === 'review') {
    const valid = filtered(reviewSubtypes);
    id = valid.length ? pick(valid, rng) : any();
  } else {
    id = any();
  }
  const lvl = typeof levelFor === 'function' ? levelFor(id) : 2;
  const t = generate(id, rng, { level: lvl });
  t.mode = mode;
  return t;
}
