// Lösungswege fürs Kopfrechnen: solutionSteps(task) → string[] (3–6 kurze deutsche Schritte)
import { fmt, round } from './numbers.js';
import { parseU, uMul, uDiv, uInv, uStr, uRaw, p10 } from './generators.js';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((c) => SUP[+c] ?? c).join('');
const pow10 = (n) => `10${sup(n)}`;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const sg = (n) => (n > 0 ? '+' : '') + fmt(n);
const R = (n) => round(n, 6);

// 1.200 → { m: 12, z: 2 }
function strip(n) {
  let m = Math.round(n), z = 0;
  while (m !== 0 && m % 10 === 0) { m /= 10; z++; }
  return { m, z };
}
const sig = (n) => String(strip(n).m).length;
function roundSig(n, s) {
  const p = 10 ** (Math.floor(Math.log10(n)) - s + 1);
  return Math.round(n / p) * p;
}
const near10 = (n) => Math.round(n / 10) * 10;
const near5 = (n) => Math.round(n / 5) * 5;
const uniq = (xs) => [...new Set(xs)];

// ---------- 10 %-/1 %-Wege für "p % von y" (auch für Überschläge genutzt) ----------
function pctOfSteps(p, y) {
  const y10 = y / 10, y1 = y / 100, res = (p * y) / 100;
  const F = fmt;
  if (p === 10) {
    return [`10 % heißt: durch 10 teilen (Komma eine Stelle nach links)`, `${F(y)} ÷ 10 = ${F(res)}`, `Probe: ${F(res)} × 10 = ${F(y)} → ${F(res)}`];
  }
  if (p === 50) {
    return [`50 % ist die Hälfte`, `${F(y)} ÷ 2 = ${F(res)}`, `Probe: ${F(res)} × 2 = ${F(y)} → ${F(res)}`];
  }
  if (p === 25) {
    return [`25 % ist ein Viertel: zweimal halbieren`, `${F(y)} ÷ 2 = ${F(y / 2)}`, `${F(y / 2)} ÷ 2 = ${F(res)}`];
  }
  if (p === 75) {
    return [
      `75 % sind drei Viertel: erst ein Viertel, dann mal 3`,
      `${F(y)} ÷ 2 = ${F(y / 2)}, ${F(y / 2)} ÷ 2 = ${F(y / 4)}`,
      `3 × ${F(y / 4)} = ${F(res)}`,
    ];
  }
  if (p === 5) {
    return [`10 % von ${F(y)} = ${F(y10)}`, `5 % ist die Hälfte von 10 %`, `${F(y10)} ÷ 2 = ${F(res)}`];
  }
  if (p % 10 === 0) {
    const k = p / 10;
    return [`10 % von ${F(y)} = ${F(y10)}`, `${p} % sind ${k} × 10 %`, `${k} × ${F(y10)} = ${F(res)}`];
  }
  if (p % 10 === 5) {
    const t = (p - 5) / 10;
    return [
      `10 % von ${F(y)} = ${F(y10)}`,
      `${p} % = ${t === 1 ? '10 %' : `${t} × 10 %`} + 5 %, und 5 % ist die Hälfte von 10 % = ${F(y10 / 2)}`,
      `${t === 1 ? F(y10) : `${F(t * y10)}`} + ${F(y10 / 2)} = ${F(res)}`,
    ];
  }
  const t = Math.floor(p / 10), o = p % 10;
  if (o <= 7) {
    if (t === 0) {
      return [
        `1 % von ${F(y)} = ${F(y1)} (Komma zwei Stellen nach links)`,
        `Plausibel: 10 % wären ${F(y10)}, ${p} % also etwas weniger`,
        `${p} % = ${p} × ${F(y1)} = ${F(res)}`,
      ];
    }
    return [
      `10 % von ${F(y)} = ${F(y10)}`,
      `1 % von ${F(y)} = ${F(y1)}, also ${o} % = ${o} × ${F(y1)} = ${F(o * y1)}`,
      t === 1 ? `${F(y10)} + ${F(o * y1)} = ${F(res)}` : `${t} × ${F(y10)} = ${F(t * y10)}, dazu ${F(o * y1)} → ${F(res)}`,
    ];
  }
  const up = 10 - o;
  return [
    `${(t + 1) * 10} % von ${F(y)} = ${F(((t + 1) * y) / 10)}`,
    `1 % von ${F(y)} = ${F(y1)}, also ${up} % = ${up} × ${F(y1)} = ${F(up * y1)}`,
    `${p} % = ${(t + 1) * 10} % − ${up} % → ${F(((t + 1) * y) / 10)} − ${F(up * y1)} = ${F(res)}`,
  ];
}

// Bestes Rundungspaar: geringste Kosten bei Fehler <= tol, sonst kleinster Fehler
function bestPair(aC, bC, truth, prod, cost, ok = () => true, tol = 0.06) {
  const all = [];
  for (const a of aC) for (const b of bC) {
    if (!ok(a, b)) continue;
    all.push({ a, b, err: Math.abs(prod(a, b) - truth) / Math.abs(truth), c: cost(a, b) });
  }
  const good = all.filter((x) => x.err <= tol).sort((x, y) => x.c - y.c || x.err - y.err);
  if (good.length) return good[0];
  return all.sort((x, y) => x.err - y.err)[0];
}

function roundNote(pairs, div = false) {
  // pairs: [[orig, gerundet]]; Produkt: gegenläufig runden hebt Fehler auf, Quotient: gleichläufig
  const ch = pairs.filter(([o, r]) => o !== r);
  if (!ch.length) return 'Die Zahlen sind schon handlich';
  const dirs = ch.map(([o, r]) => (r > o ? 'auf' : 'ab'));
  let why = '';
  if (ch.length === 2) {
    if (!div && dirs[0] !== dirs[1]) why = ' – einmal auf, einmal ab, damit sich der Fehler aufhebt';
    if (div && dirs[0] === dirs[1]) why = ` – beide ${dirs[0]}, dann hebt sich der Fehler beim Teilen weitgehend auf`;
  }
  return `Runden${why}: ${ch.map(([o, r]) => `${fmt(o)} ≈ ${fmt(r)}`).join(', ')}`;
}

const dist10 = (n) => Math.min(n % 10, 10 - (n % 10));

// ---------- Lösungswege je Subtyp ----------
const S = {
  'mult.2x1': ({ a, b }) => {
    const o = a % 10, res = a * b;
    if (o === 0) {
      return [
        `${a} endet auf 0: ${a} = ${a / 10} × 10`,
        `${a / 10} × ${b} = ${fmt((a / 10) * b)}`,
        `${fmt((a / 10) * b)} × 10 = ${fmt(res)}`,
      ];
    }
    const down = o <= 6;
    const base = down ? a - o : a + (10 - o), d = down ? o : 10 - o, op = down ? '+' : '−';
    return [
      `${a} zerlegen: ${a} = ${base} ${op} ${d}`,
      `${base} × ${b}: ${base / 10} × ${b} = ${fmt((base / 10) * b)}, eine Null dran → ${fmt(base * b)}`,
      `${d} × ${b} = ${fmt(d * b)}`,
      `${fmt(base * b)} ${op} ${fmt(d * b)} = ${fmt(res)}`,
    ];
  },

  'mult.2x2': ({ a, b }) => {
    const res = a * b;
    for (const [n, m] of [[b, a], [a, b]]) {
      for (const A of [25, 50]) {
        if (Math.abs(n - A) > 3) continue;
        const k = n - A, q = 100 / A;
        const head = k === 0
          ? `${n} = 100 ÷ ${q}`
          : `${n} zerlegen: ${n} = ${A} ${k > 0 ? '+' : '−'} ${Math.abs(k)}`;
        const mid = `${fmt(m)} × ${A} = ${fmt(m * 100)} ÷ ${q} = ${fmt(m * A)}`;
        if (k === 0) return [head, `${fmt(m)} × 100 = ${fmt(m * 100)}`, `${fmt(m * 100)} ÷ ${q} = ${fmt(res)}`];
        return [
          head, mid,
          `${fmt(m)} × ${Math.abs(k)} = ${fmt(m * Math.abs(k))}`,
          `${fmt(m * A)} ${k > 0 ? '+' : '−'} ${fmt(m * Math.abs(k))} = ${fmt(res)}`,
        ];
      }
    }
    const [x, y] = dist10(b) <= dist10(a) ? [b, a] : [a, b];
    const o = x % 10, down = o <= 5;
    const base = down ? x - o : x + (10 - o), d = down ? o : 10 - o, op = down ? '+' : '−';
    return [
      `${x} zerlegen: ${x} = ${base} ${op} ${d}`,
      base === 100
        ? `${y} × 100 = ${fmt(y * 100)}`
        : `${y} × ${base} = ${y} × ${base / 10} × 10 = ${fmt((y * base) / 10)} × 10 = ${fmt(y * base)}`,
      `${y} × ${d} = ${fmt(y * d)}`,
      `${fmt(y * base)} ${op} ${fmt(y * d)} = ${fmt(res)}`,
    ];
  },

  'mult.easy': ({ a, f }) => {
    const res = a * f;
    if (f === 5) return [`× 5 heißt: × 10 und dann halbieren`, `${fmt(a)} × 10 = ${fmt(a * 10)}`, `${fmt(a * 10)} ÷ 2 = ${fmt(res)}`];
    if (f === 50) return [`× 50 heißt: × 100 und dann halbieren`, `${fmt(a)} × 100 = ${fmt(a * 100)}`, `${fmt(a * 100)} ÷ 2 = ${fmt(res)}`];
    return [
      `× 25 heißt: × 100 und dann durch 4 (zweimal halbieren)`,
      `${fmt(a)} × 100 = ${fmt(a * 100)}`,
      `${fmt(a * 100)} ÷ 2 = ${fmt(a * 50)}`,
      `${fmt(a * 50)} ÷ 2 = ${fmt(res)}`,
    ];
  },

  'mult.square': ({ a }) => {
    const o = a % 10, N = o <= 5 ? a - o : a + (10 - o), d = Math.abs(a - N);
    const lo = a - d, hi = a + d, other = a < N ? lo : hi;
    const prod = lo * hi, res = a * a;
    return [
      `${a} liegt ${d} neben ${N}: ${a}² = (${lo}) × (${hi}) + ${d}² (${a} − ${d} und ${a} + ${d})`,
      N === 100
        ? `${other} × 100 = ${fmt(prod)}`
        : `${other} × ${N} = ${other} × ${N / 10} × 10 = ${fmt(other * (N / 10))} × 10 = ${fmt(prod)}`,
      `${d}² = ${d * d}`,
      `${fmt(prod)} + ${d * d} = ${fmt(res)}`,
    ];
  },

  'div.exact': ({ n, d }) => {
    const q = n / d;
    let q1 = Math.floor(q / 10) * 10;
    if (q1 === q) q1 -= 10;
    const q2 = q - q1;
    return [
      `${fmt(n)} zerlegen: ${fmt(n)} = ${fmt(d * q1)} + ${fmt(d * q2)}`,
      `${fmt(d * q1)} ÷ ${d} = ${fmt(q1)}`,
      `${fmt(d * q2)} ÷ ${d} = ${fmt(q2)}`,
      `${fmt(q1)} + ${fmt(q2)} = ${fmt(q)}`,
    ];
  },

  'div.decimal': ({ n, d }) => {
    const k = { 0.2: 5, 0.25: 4, 0.4: 5, 0.5: 2, 0.8: 5, 1.5: 2, 2.5: 2 }[d];
    const D = R(d * k), N = R(n * k), q = n / d;
    const how = k === 2 ? `${fmt(n)} verdoppeln = ${fmt(N)}`
      : k === 4 ? `${fmt(n)} zweimal verdoppeln: ${fmt(2 * n)}, ${fmt(N)}`
        : `${fmt(n)} × 5 = ${fmt(R(n * 10))} ÷ 2 = ${fmt(N)}`;
    return [
      `Beide Zahlen mal ${k}, damit der Teiler ganz wird: ${fmt(d)} × ${k} = ${fmt(D)}`,
      how,
      `${fmt(N)} ÷ ${fmt(D)} = ${fmt(q)}`,
      `Probe: ${fmt(q)} × ${fmt(d)} = ${fmt(n)} → ${fmt(n)} ÷ ${fmt(d)} = ${fmt(q)}`,
    ];
  },

  'div.round': ({ n, d }) => {
    const q = Math.floor(n / d);
    const A = Math.floor(q / 10) * 10, dA = d * A, r1 = n - dA;
    const B = Math.floor(r1 / d), rem = r1 - d * B;
    const up = rem * 2 >= d, res = Math.round(n / d);
    return [
      `${d} × ${A} = ${fmt(dA)} (passt ${A}-mal in ${fmt(n)})`,
      `${fmt(n)} − ${fmt(dA)} = ${fmt(r1)} bleiben übrig`,
      B > 0
        ? `${d} × ${B} = ${d * B} passt noch ${B}-mal, Rest ${rem}`
        : `${fmt(r1)} ist kleiner als ${d}: noch ${rem === 0 ? '0' : 'nicht mal ein'} volles Mal, Rest ${rem}`,
      rem === 0
        ? `Kein Rest: ${A} + ${B} = ${fmt(res)}`
        : `Rest ${rem} von ${d}: ${up ? 'mindestens' : 'weniger als'} die Hälfte (${fmt(d / 2)}) → ${up ? 'aufrunden' : 'abrunden'}`,
      `${A} + ${B}${up ? ' + 1' : ''} = ${fmt(res)}`,
    ];
  },

  'big.mult': ({ m, u, b, ua }) => {
    const { m: b0, z } = strip(b);
    const uv = u === 'Tsd.' ? 3 : 6, X = R(m * b0), full = R(m * (u === 'Tsd.' ? 1e3 : 1e6) * b);
    const e = uv + z;
    const out = ua === 'Mrd.' ? 9 : ua === 'Mio.' ? 6 : 3;
    return [
      `Ziffern: ${fmt(m)} × ${b0} = ${fmt(X)}`,
      `Nullen: ${u} = ${pow10(uv)}, ${fmt(b)} = ${b0} × ${pow10(z)} → ${pow10(uv)} × ${pow10(z)} = ${pow10(e)}`,
      `${fmt(X)} × ${pow10(e)} = ${fmt(full)}`,
      `In ${ua}: ${fmt(full)} = ${fmt(R(full / 10 ** out))} ${ua}`,
    ];
  },

  'big.div': function ({ D, d, ua }, task) {
    const Ds = strip(D), ds = strip(d);
    const p = Ds.z - ds.z, ratio = R(Ds.m / ds.m), A = R(ratio * 10 ** p);
    const label = task.prompt.split(' ÷ ')[0];
    const out = ua === 'Mio.' ? 6 : 3;
    return [
      `Ziffern: ${Ds.m} ÷ ${ds.m} = ${fmt(ratio)}`,
      `Nullen: ${label} = ${Ds.m} × ${pow10(Ds.z)}, ${fmt(d)} = ${ds.m} × ${pow10(ds.z)} → ${pow10(Ds.z)} ÷ ${pow10(ds.z)} = ${pow10(p)}`,
      `${fmt(ratio)} × ${pow10(p)} = ${fmt(A)}`,
      `In ${ua}: ${fmt(A)} = ${fmt(R(A / 10 ** out))} ${ua}`,
    ];
  },

  'big.percapita': ({ T, base }, task) => {
    const N = T * 1000, e = task.expected;
    const head = [
      `Einheiten kürzen: Mrd. ÷ Mio. = Tsd. (${pow10(9)} ÷ ${pow10(6)} = ${pow10(3)})`,
      `${fmt(T)} Mrd. = ${fmt(N)} Mio. → ${fmt(N)} ÷ ${base} (Ergebnis in € pro Kopf)`,
    ];
    if (base === 450) {
      const v = (T * 20) / 9;
      return [
        ...head,
        `${fmt(N)} ÷ 450 = ${fmt(T)} × 1.000 ÷ 450 = ${fmt(T)} × 20 ÷ 9`,
        `${fmt(T)} × 20 = ${fmt(T * 20)}, dann ÷ 9 ≈ ${fmt(round(v, 1))}`,
        `Exakt: ${fmt(e)} €`,
      ];
    }
    const t = { 84: [80, -0.05, '5 %', 'ist 5 % größer als 80 → Ergebnis rund 5 % kleiner'],
      41: [40, -0.025, '2,5 %', 'ist 2,5 % größer als 40 → Ergebnis rund 2,5 % kleiner'],
      46: [50, 0.09, '9 %', 'ist 8 % kleiner als 50 → Ergebnis rund 9 % größer'] }[base];
    const [rb, factor, pc, why] = t;
    const v = N / rb, w = round(v * (1 + factor), 1), c = round(Math.abs(v * factor), 1);
    return [
      ...head,
      `Glatt runden: ${base} ≈ ${rb} → ${fmt(N)} ÷ ${rb} = ${fmt(v)}`,
      `Korrektur: ${base} ${why}: ${pc} von ${fmt(v)} = ${fmt(c)} → ${fmt(v)} ${factor < 0 ? '−' : '+'} ${fmt(c)} ≈ ${fmt(w)}`,
      `Exakt: ${fmt(e)} €`,
    ];
  },

  'pct.of': ({ p, y }) => pctOfSteps(p, y),

  'pct.change': ({ alt, neu }, task) => {
    const diff = Math.abs(neu - alt), up = neu > alt, a10 = alt / 10, steps = R(diff / a10);
    return [
      `Änderung: ${fmt(neu)} − ${fmt(alt)} = ${up ? '+' : '−'}${fmt(diff)} Mio. € (${up ? 'gestiegen' : 'gesunken'})`,
      `Bezug ist immer der alte Wert ${fmt(alt)} (nicht der neue)`,
      `10 % von ${fmt(alt)} = ${fmt(a10)}`,
      `${fmt(diff)} ÷ ${fmt(a10)} = ${fmt(steps)} ${steps === 1 ? 'Zehnerschritt' : 'Zehnerschritte'} → ${fmt(steps)} × 10 % = ${fmt(task.expected)} %${up ? '' : ' (Rückgang)'}`,
    ];
  },

  'pct.reverse': ({ r, nach, discount }, task) => {
    const X = discount ? 100 - r : 100 + r, g = gcd(X, 100), num = X / g, den = 100 / g;
    const part = R(nach / num);
    return [
      `${discount ? `Nach ${fmt(r)} % Rabatt` : `Nach ${fmt(r)} % Aufschlag`} sind ${fmt(nach)} € genau ${X} % vom Ursprungspreis (${discount ? `nicht ${fmt(r)} % wieder draufrechnen!` : `nicht ${fmt(r)} % einfach abziehen!`})`,
      `${X} % = ${num}/${den}: ${fmt(nach)} € entsprechen ${num} gleichen Teilen, der Ursprungspreis hat ${den} Teile`,
      `1 Teil = ${fmt(nach)} ÷ ${num} = ${fmt(part)} €`,
      `Ursprungspreis = alle ${den} Teile = ${den} × ${fmt(part)} = ${fmt(task.expected)} €`,
    ];
  },

  'pct.points': ({ m1, m2 }, task) => {
    const d = m2 - m1, g = gcd(d, m1), n = d / g, dd = m1 / g;
    return [
      `Differenz: ${m2} % − ${m1} % = ${d} Prozentpunkte (das ist noch kein Prozent-Anstieg)`,
      `Bezug ist der alte Wert ${m1} %: ${d} ÷ ${m1}`,
      dd === 1 ? `${d}/${m1} = ${n}: der Zuwachs ist genau ${n === 1 ? 'so groß wie' : `${n}-mal so groß wie`} der alte Wert` : g > 1 ? `Kürzen: ${d}/${m1} = ${n}/${dd}` : `${d}/${m1} lässt sich nicht kürzen`,
      dd === 1 ? `${n} × 100 % = ${fmt(task.expected)} %` : `In Prozent: ${n} × 100 = ${n * 100}, ${n * 100} ÷ ${dd} = ${fmt(task.expected)} %`,
    ];
  },

  'pct.chain': ({ r1, r2 }, task) => {
    const f = (r) => fmt(R(1 + r / 100));
    const s = r1 + r2, t = R((r1 * r2) / 100);
    return [
      `Faktoren: ${sg(r1)} % → ${f(r1)}, ${sg(r2)} % → ${f(r2)} (nie einfach die Prozente addieren)`,
      `Prozente addieren: ${fmt(r1)} ${r2 < 0 ? '−' : '+'} ${fmt(Math.abs(r2))} = ${fmt(s)} %`,
      `Wechselwirkung: ${fmt(r1)} % × ${fmt(r2)} % = (${fmt(r1)} × ${fmt(r2)}) ÷ 100 = ${sg(t)} %`,
      `${fmt(s)} ${t < 0 ? '−' : '+'} ${fmt(Math.abs(t))} = ${fmt(task.expected)} %`,
    ];
  },

  'frac.topct': ({ n, d }, task) => {
    const e = task.expected, u = 100 / d;
    const calc = Number.isInteger(u) || Math.abs(u * 4 - Math.round(u * 4)) < 1e-9
      ? `100 ÷ ${d} = ${fmt(u)}`
      : (() => { const q0 = Math.floor(100 / d); return `100 ÷ ${d}: ${d} × ${q0} = ${d * q0}, Rest ${100 - d * q0} → ≈ ${fmt(u)}`; })();
    if (n === 1) {
      return [`1/${d} heißt: 100 % geteilt durch ${d}`, calc, `Merken: 1/${d} ≈ ${fmt(e)} %`];
    }
    if (d - n === 1) {
      return [`${n}/${d} = 1 − 1/${d} (das Gegenstück zu einem Stammbruch)`, `1/${d}: ${calc}`, `100 − ${fmt(u)} = ${fmt(e)} %`];
    }
    return [`Erst der Stammbruch: 1/${d} von 100 %`, calc, `${n} × ${fmt(u)} = ${fmt(e)} %`];
  },

  'frac.of': ({ n, d, y }) => {
    const u = y / d, res = u * n;
    const how = { 4: `${fmt(y)} halbieren: ${fmt(y / 2)}, nochmal halbieren: ${fmt(u)}`,
      5: `${fmt(y)} × 2 = ${fmt(y * 2)}, dann ÷ 10 = ${fmt(u)}`,
      25: `${fmt(y)} × 4 = ${fmt(y * 4)}, dann ÷ 100 = ${fmt(u)}`,
      8: `${fmt(y)} dreimal halbieren: ${fmt(y / 2)}, ${fmt(y / 4)}, ${fmt(u)}` }[d]
      || `${fmt(y)} ÷ ${d} = ${fmt(u)} (Probe: ${fmt(u)} × ${d} = ${fmt(y)})`;
    return [
      `Erst durch den Nenner: ${fmt(y)} ÷ ${d} ergibt ein Stück (${n === 1 ? 'das ist schon die Antwort' : `1/${d}`})`,
      how,
      n === 1 ? `Zähler ist 1 → 1/${d} von ${fmt(y)} = ${fmt(res)}` : `Dann mal Zähler: ${fmt(u)} × ${n} = ${fmt(res)}`,
    ];
  },

  'growth.compound': ({ r, n }, task) => {
    const c2 = (n * (n - 1)) / 2, c3 = (n * (n - 1) * (n - 2)) / 6;
    const q = R((r * r) / 100), t2 = R(c2 * q), t3 = R((c3 * r ** 3) / 1e4);
    const base = n * r, withT3 = n >= 3 && t3 >= 0.05;
    const total = base + t2 + (withT3 ? t3 : 0);
    const out = [
      `Grobwert ohne Zinseszins: ${n} × ${fmt(r)} % = ${fmt(base)} %`,
      `Zuschlag 1: ${c2} Jahres-Paare, jedes bringt ${fmt(r)} % × ${fmt(r)} % = ${fmt(q)} % → ${c2} × ${fmt(q)} = ${fmt(t2)} %`,
    ];
    if (withT3) out.push(`Zuschlag 2: ${c3} × (${fmt(r)} %)³ = ${c3} × ${fmt(R(r ** 3 / 1e4))} = ${fmt(t3)} %`);
    out.push(`Zusammen: ${fmt(base)} + ${fmt(t2)}${withT3 ? ` + ${fmt(t3)}` : ''} ≈ ${fmt(round(total, 1))} %`);
    out.push(`Exakt: ${fmt(task.expected)} %`);
    return out;
  },

  'growth.rule72': ({ r }, task) => [
    `72er-Regel: Verdopplungszeit ≈ 72 ÷ Wachstumsrate in %`,
    `72 ÷ ${r}: ${r} × ${fmt(72 / r)} = 72`,
    `Probe: ${fmt(72 / r)} Jahre × ${r} % ≈ 72 % Gesamtwachstum, also etwa verdoppelt`,
    `Exakt: ${fmt(task.expected)} Jahre`,
  ],

  'growth.cagr': ({ r, n, S: Sv, E }, task) => {
    const F = R(E / Sv), g = 1 + r / 100, avg = R(((F - 1) / n) * 100);
    const seq = [];
    let cur = 1;
    for (let i = 1; i <= n; i++) {
      const nx = R(cur * g);
      seq.push(`${fmt(cur, 6)} × ${fmt(g, 4)} = ${fmt(nx, 6)}`);
      cur = nx;
    }
    return [
      `Gesamtfaktor: ${fmt(E)} ÷ ${fmt(Sv)} = ${fmt(F, 6)} (in ${n} Jahren)`,
      `Grobe Schranke: (${fmt(F - 1, 6)} ÷ ${n}) ≈ ${fmt(avg)} % pro Jahr – die echte Rate ist wegen Zinseszins etwas kleiner`,
      `Glatte Rate probieren (${fmt(r)} % → Faktor ${fmt(g, 4)}): ${seq.join('; ')}`,
      `Das trifft ${fmt(F, 6)} → ${fmt(task.expected)} % pro Jahr`,
    ];
  },

  'biz.payback': ({ I, s }, task) => {
    const dec = !Number.isInteger(s);
    const i2 = dec ? I * 2 : I, s2 = dec ? s * 2 : s;
    const q = Math.floor(i2 / s2 + 1e-9), rem = R(i2 - s2 * q);
    const res = task.expected;
    const steps = [`Payback = Investition ÷ Ersparnis pro Jahr = ${fmt(I)} ÷ ${fmt(s)}`];
    if (dec) steps.push(`Komma loswerden: beide mal 2 → ${fmt(i2)} ÷ ${fmt(s2)}`);
    steps.push(`${fmt(s2)} × ${q} = ${fmt(s2 * q)}`);
    if (rem === 0) steps.push(`Kein Rest → ${fmt(res)} Jahre`);
    else steps.push(`Rest ${fmt(rem)} ÷ ${fmt(s2)} = ${fmt(R(rem / s2))} → ${q} + ${fmt(R(rem / s2))} = ${fmt(res)} Jahre`);
    return steps;
  },

  'biz.breakeven': ({ F, p, v }, task) => {
    const db = p - v, Fk = F / 1000, j = Fk / db;
    return [
      `Deckungsbeitrag pro Stück: ${fmt(p)} − ${fmt(v)} = ${fmt(db)} €`,
      `Break-even = Fixkosten ÷ Deckungsbeitrag = ${fmt(F)} ÷ ${fmt(db)}`,
      `Tausender abtrennen: ${fmt(F)} = ${fmt(Fk)} × 1.000 → ${fmt(Fk)} ÷ ${fmt(db)} = ${fmt(j)} (Probe: ${fmt(db)} × ${fmt(j)} = ${fmt(Fk)})`,
      `${fmt(j)} × 1.000 = ${fmt(task.expected)} Stück`,
    ];
  },

  'biz.margin': ({ R: Rv, G }, task) => {
    const r1 = Rv / 100, m = task.expected;
    return [
      `Marge = Gewinn ÷ Umsatz = ${fmt(G)} ÷ ${fmt(Rv)}`,
      `1 % vom Umsatz: ${fmt(Rv)} ÷ 100 = ${fmt(r1)} Mio. €`,
      `Wie viele 1 %-Stücke stecken im Gewinn? ${fmt(G)} ÷ ${fmt(r1)} = ${fmt(m)}`,
      `Probe: ${fmt(m)} × ${fmt(r1)} = ${fmt(G)} → Marge ${fmt(m)} %`,
    ];
  },

  'biz.roi': ({ C, B }, task) => {
    const g = R(B - C), c10 = R(C / 10), k = R(g / c10);
    return [
      `ROI = (Nutzen − Kosten) ÷ Kosten`,
      `Gewinn: ${fmt(B)} − ${fmt(C)} = ${fmt(g)} Mio. €`,
      `10 % von ${fmt(C)} = ${fmt(c10)} Mio. €`,
      `${fmt(g)} ÷ ${fmt(c10)} = ${fmt(k)} ${k === 1 ? 'Zehnerschritt' : 'Zehnerschritte'} → ${fmt(k)} × 10 % = ${fmt(task.expected)} %`,
    ];
  },

  'biz.tco': ({ O, A, n }, task) => {
    const whole = Math.floor(A), frac = R(A - whole), X = n * A;
    return [
      `TCO = Einmalkosten + Jahre × laufende Kosten`,
      frac === 0
        ? `Laufende Kosten: ${n} × ${fmt(A)} = ${fmt(X)} Mio. €`
        : `Laufende Kosten: ${n} × ${fmt(A)} = ${n} × ${whole} + ${n} × ${fmt(frac)} = ${fmt(n * whole)} + ${fmt(n * frac)} = ${fmt(X)} Mio. €`,
      `Plus Einmalkosten: ${fmt(O)} + ${fmt(X)} = ${fmt(task.expected)} Mio. €`,
    ];
  },

  'biz.fte': ({ V, t, s, H }, task) => {
    const M = R(V * t), Sx = R((M * s) / 100), hrs = (Sx * 1e6) / 60;
    const hr = roundSig(hrs, 2), x = hr / H;
    const sPhrase = s === 25 ? `25 % = Viertel: ${fmt(M)} ÷ 4 = ${fmt(Sx)}`
      : s === 50 ? `50 % = Hälfte: ${fmt(M)} ÷ 2 = ${fmt(Sx)}`
        : s === 10 ? `10 % von ${fmt(M)} = ${fmt(Sx)}`
        : `10 % von ${fmt(M)} = ${fmt(M / 10)}, also ${s} % = ${s / 10} × ${fmt(M / 10)} = ${fmt(Sx)}`;
    return [
      `Gesamtminuten: ${fmt(V)} Mio. × ${fmt(t)} min = ${fmt(M)} Mio. min`,
      `KI spart ${fmt(s)} %: ${sPhrase} Mio. min`,
      `In Stunden (÷ 60): ${fmt(Sx)} Mio. min ÷ 60 ≈ ${fmt(round(hrs, 0))} h${hr !== round(hrs, 0) ? `, gerundet ${fmt(hr)} h` : ''}`,
      `Durch ${fmt(H)} h pro FTE: ${fmt(hr)} ÷ ${fmt(H)} ≈ ${fmt(round(x, 1))} FTE`,
      `Exakt: ${fmt(task.expected)} FTE`,
    ];
  },

  'biz.sla': ({ a }, task) => {
    const u = R(100 - a), h = R(u * 88), min = a === 99.99;
    const steps = [
      `Ausfallanteil: 100 % − ${fmt(a)} % = ${fmt(u)} %`,
      `1 Jahr = 365 × 24 = 8.760 h ≈ 8.800 h, also 1 % ≈ 88 h`,
      `${fmt(u)} % ≈ ${fmt(u)} × 88 h = ${fmt(h)} h`,
    ];
    if (min) steps.push(`In Minuten: ${fmt(h)} h × 60 ≈ ${fmt(round(h * 60, 0))} min`);
    steps.push(`Exakt: ${fmt(task.expected)} ${min ? 'min' : 'h'}`);
    return steps;
  },

  'est.mult': ({ a, b }, task) => {
    const mant = (n) => strip(n).m;
    const best = bestPair(
      uniq([roundSig(a, 1), roundSig(a, 2)]), uniq([near10(b), near5(b), b]), a * b, (x, y) => x * y,
      (x, y) => sig(x) + sig(y), (x, y) => Math.min(mant(x), mant(y)) <= 9 || [11, 12, 15, 25, 50, 75].includes(mant(x)) || [11, 12, 15, 25, 50, 75].includes(mant(y)),
    );
    const { a: ar, b: br } = best, A = strip(ar), B = strip(br), X = A.m * B.m, z = A.z + B.z;
    const steps = [roundNote([[a, ar], [b, br]]), `Ziffern: ${A.m} × ${B.m} = ${fmt(X)}`];
    if (z > 0) steps.push(`Nullen: ${A.z} + ${B.z} = ${z} → ${fmt(X)} mit ${z} ${z === 1 ? 'Null' : 'Nullen'} = ${fmt(ar * br)}`);
    steps.push(`Exakt: ${fmt(task.expected)}`);
    return steps;
  },

  'est.div': ({ n, d }, task) => {
    const easy = (x, y) => {
      const z = Math.min(strip(x).z, strip(y).z), mx = x / 10 ** z, my = y / 10 ** z;
      return my <= 9 || mx % my === 0;
    };
    const best = bestPair(
      uniq([roundSig(n, 1), roundSig(n, 2)]), uniq([near10(d), near5(d), d]), n / d, (x, y) => x / y,
      (x, y) => sig(x) + sig(y), easy,
    );
    const { a: nr, b: dr } = best, z = Math.min(strip(nr).z, strip(dr).z), mx = nr / 10 ** z, my = dr / 10 ** z;
    const steps = [roundNote([[n, nr], [d, dr]], true)];
    if (my === 1) {
      steps.push(`Nullen kürzen: ${fmt(nr)} ÷ ${fmt(dr)} = ${fmt(mx)}`);
    } else {
      if (z > 0) steps.push(`Nullen kürzen: ${fmt(nr)} ÷ ${fmt(dr)} = ${fmt(mx)} ÷ ${fmt(my)}`);
      steps.push(`${fmt(mx)} ÷ ${fmt(my)} ≈ ${fmt(round(nr / dr, 1))}`);
    }
    steps.push(`Exakt: ${fmt(task.expected)}`);
    return steps;
  },

  'est.pct': ({ p, y }, task) => {
    const pC = [];
    for (let q = 5; q <= 95; q += 5) if (Math.abs(q - p) <= 3) pC.push(q);
    const pcost = (q) => (q % 10 === 0 || q === 25 || q === 75 ? 1 : 2);
    const best = bestPair(pC, uniq([roundSig(y, 1), roundSig(y, 2)]), p * y / 100, (q, v) => (q * v) / 100,
      (q, v) => pcost(q) + sig(v));
    const { a: pr, b: yr } = best;
    return [roundNote([[p, pr], [y, yr]]), ...pctOfSteps(pr, yr), `Exakt: ${fmt(task.expected)}`];
  },

  'units.dimless': (p, task) => {
    const ans = optText(p, task);
    const base = parseU(p.ua);
    if (p.k === 3) {
      const comb = p.o1 === '×' ? uMul(base, parseU(p.ub)) : uDiv(base, parseU(p.ub));
      return [
        'Dimensionslos heißt: alle Einheiten kürzen sich weg',
        `Erst zusammenfassen: [${p.ua}] ${p.o1} [${p.ub}] = [${uStr(comb)}]`,
        p.o2 === '÷'
          ? `Teilen durch ? soll alles kürzen: [${uStr(comb)}] ÷ ? = 1 → ? hat dieselbe Einheit wie das Ergebnis`
          : `Mal ? soll alles kürzen: [${uStr(comb)}] × ? = 1 → ? ist der Kehrwert der Einheit`,
        `Das Fragezeichen hat die Einheit ${ans}`,
      ];
    }
    return [
      'Dimensionslos heißt: alle Einheiten kürzen sich weg',
      `Gegeben: [${p.ua}]`,
      p.o2 === '÷'
        ? `Teilen: [${p.ua}] ÷ [${p.ua}] = 1 → durch dieselbe Einheit teilen`
        : `Malnehmen: nur der Kehrwert kürzt sich weg – [${p.ua}] × [${uStr(uInv(base))}] = 1`,
      `Das Fragezeichen hat die Einheit ${ans}`,
    ];
  },

  'units.result': (p, task) => {
    const ex = [p.ua, p.o1, p.ub, ...(p.o2 ? [p.o2, p.uc] : [])];
    let raw = parseU(ex[0]);
    for (let i = 1; i < ex.length; i += 2) raw = ex[i] === '×' ? uMul(raw, parseU(ex[i + 1])) : uDiv(raw, parseU(ex[i + 1]));
    const names = [...new Set(raw.map(([n]) => n))];
    const cancelled = names.filter((n) => raw.some(([x, e]) => x === n && e > 0) && raw.some(([x, e]) => x === n && e < 0));
    const steps = ['Einheiten rechnen wie Brüche: was oben und unten steht, kürzt sich'];
    if (ex.includes('÷')) steps.push('Teilen heißt mit dem Kehrwert malnehmen');
    steps.push(`Ausschreiben: ${ex.map((x, i) => (i % 2 ? x : `[${x}]`)).join(' ')} = ${uRaw(raw)}`);
    steps.push(cancelled.length ? `Kürzen: ${cancelled.join(', ')}` : 'Hier kürzt sich nichts – die Einheiten setzen sich zusammen');
    steps.push(`Ergebnis: ${optText(p, task)}`);
    return steps;
  },

  'units.convert': (p, task) => {
    const { x, y, fam } = p, F = (n) => fmt(n, 4), u = task.unit, res = `Ergebnis: ${F(task.expected)} ${u}`;
    switch (fam) {
      case 1: return [
        'Erst die Zeit: Monat → Jahr heißt × 12',
        `${F(x)} Tsd. € × 12 = ${F(x * 12)} Tsd. €/Jahr`,
        'Dann die Größe: 1.000 Tsd. = 1 Mio. → ÷ 1.000',
        `${F(x * 12)} ÷ 1.000 = ${F(task.expected)}`, res,
      ];
      case 2: return [
        '1 m/s = 3,6 km/h – also km/h durch 3,6 teilen',
        `Bequemer: ÷ 3,6 = × 10 ÷ 36 → ${F(x)} × 10 = ${F(x * 10)}`,
        `${F(x * 10)} ÷ 36 = ${F(task.expected)}`, res,
      ];
      case 3: return [
        '1 m/s = 3,6 km/h – also m/s mal 3,6',
        `3,6 = 4 − 0,4: ${F(x)} × 4 = ${F(x * 4)} und ${F(x)} × 0,4 = ${F(x * 0.4)}`,
        `${F(x * 4)} − ${F(x * 0.4)} = ${F(task.expected)}`, res,
      ];
      case 4: {
        const w = Math.trunc(x), r = round(x - w, 4);
        return [
          'h/Tag × Tage: „Tag“ kürzt sich, es bleibt h/Jahr',
          r > 0 ? `Zerlegen: ${F(y)} × ${F(w)} = ${F(y * w)} und ${F(y)} × ${F(r)} = ${F(y * r)}` : `${F(y)} × ${F(w)} = ${F(y * w)}`,
          r > 0 ? `${F(y * w)} + ${F(y * r)} = ${F(task.expected)}` : `Probe: ${F(task.expected)} ÷ ${F(y)} = ${F(x)}`, res,
        ];
      }
      case 5: return [
        '1 h = 60 Min. → pro Stunde ist 60-mal so viel wie pro Minute',
        `${F(x)} × 60 = ${F(x)} × 6 × 10`,
        `${F(x)} × 6 = ${F(x * 6)}, dann × 10 = ${F(task.expected)}`, res,
      ];
      case 6: return [
        'Größe: Mio. → Tsd. heißt × 1.000',
        `${F(x)} Mio. = ${F(x * 1000)} Tsd. €/Jahr`,
        'Zeit: Jahr → Monat heißt ÷ 12',
        `${F(x * 1000)} ÷ 12 = ${F(task.expected)}`, res,
      ];
      case 7: return [
        'Stück/Tag × Tage: „Tag“ kürzt sich, es bleibt Stück/Jahr',
        `${F(x)} × ${F(y)} = ${F(x * y)} Stück/Jahr`,
        'Stück → Tsd. Stück: ÷ 1.000',
        `${F(x * y)} ÷ 1.000 = ${F(task.expected)}`, res,
      ];
      case 8: return [
        'Erst Minuten pro Jahr: Min./Tag × Tage',
        `${F(x)} × ${F(y)} = ${F(x * y)} Min./Jahr`,
        'Minuten → Stunden: ÷ 60',
        `${F(x * y)} ÷ 60 = ${F(task.expected)}`, res,
      ];
      default: return [
        `Mio. ausschreiben: ${F(x)} Mio. = ${F(x * 1e6)} Stück/Jahr`,
        `Pro Tag heißt: durch ${F(y)} Tage teilen`,
        `${F(x * 1e6)} ÷ ${F(y)} = ${F(task.expected)}`, res,
      ];
    }
  },

  'mag.exponent': (p, task) => {
    const { a, k, e, n, u, disp } = p, F = (v) => fmt(v, 4);
    const goal = 'Ziel: a × 10ⁿ mit genau einer Ziffer 1–9 vor dem Komma';
    if (u) {
      const m = F(round(a * 10 ** k, 6));
      return [
        goal,
        `${u} = ${p10(e)}, also ${disp} = ${m} × ${p10(e)}`,
        `${m} = ${F(a)} × ${p10(k)} (Komma ${k === 0 ? 'ist schon richtig' : k > 0 ? `${k} Stelle(n) nach links` : `${-k} Stelle(n) nach rechts`})`,
        `Exponenten addieren: ${F(k)} + ${e} = ${F(n)}`,
        `Ergebnis: ${F(a)} × ${p10(n)} → n = ${F(n)}`,
      ];
    }
    return [
      goal,
      `Komma verschieben, bis genau eine Ziffer ≠ 0 vor dem Komma steht: ${disp} → ${F(a)}`,
      n >= 0 ? `Komma ${n} Stellen nach links geschoben → große Zahl, n positiv` : `Komma ${-n} Stellen nach rechts geschoben → kleine Zahl, n negativ`,
      `Ergebnis: ${F(a)} × ${p10(n)} → n = ${F(n)}`,
    ];
  },

  'mag.facts': (p) => {
    const F = (v) => fmt(v, 4);
    return [
      `${p.fact} ≈ ${p.v}`,
      `Als a × 10ⁿ geschrieben: ${F(p.a)} × ${p10(p.n)}`,
      `Merkhilfe: n = Anzahl Stellen vor dem Komma − 1 (bei ${p.v}: ${F(p.n + 1)} − 1)`,
      `Ergebnis: n = ${F(p.n)}`,
    ];
  },

  'mag.product': (p) => {
    const F = (v) => fmt(v, 4), P = (v) => (v < 0 ? `(${F(v)})` : F(v));
    const m = round(p.a1 * p.a2, 4), s = p.p1 + p.p2, carry = m >= 10;
    return [
      `Beide als a × 10ⁿ: ${p.d1} = ${F(p.a1)} × ${p10(p.p1)} und ${p.d2} = ${F(p.a2)} × ${p10(p.p2)}`,
      `Mantissen multiplizieren: ${F(p.a1)} × ${F(p.a2)} = ${F(m)}`,
      `Exponenten addieren: ${P(p.p1)} + ${P(p.p2)} = ${F(s)}`,
      carry ? `${F(m)} ist ≥ 10 → ${F(m)} = ${F(m / 10)} × 10 → Exponent + 1 = ${F(s + 1)}` : `${F(m)} liegt zwischen 1 und 10 → kein Übertrag`,
      `Ergebnis: ${F(carry ? m / 10 : m)} × ${p10(s + (carry ? 1 : 0))} → n = ${F(s + (carry ? 1 : 0))}`,
    ];
  },

  'mag.ratio': (p) => {
    const F = (v) => fmt(v, 4), P = (v) => (v < 0 ? `(${F(v)})` : F(v));
    const m = p.a1 / p.a2, s = p.p1 - p.p2, borrow = p.a1 < p.a2, n = s - (borrow ? 1 : 0);
    return [
      `Beide als a × 10ⁿ: ${p.d1} = ${F(p.a1)} × ${p10(p.p1)} und ${p.d2} = ${F(p.a2)} × ${p10(p.p2)}`,
      `Mantissen teilen: ${F(p.a1)} ÷ ${F(p.a2)} ≈ ${fmt(m, 2)}`,
      `Exponenten subtrahieren: ${P(p.p1)} − ${P(p.p2)} = ${F(s)}`,
      borrow ? `${fmt(m, 2)} ist < 1 → ${fmt(m, 2)} = ${fmt(m * 10, 2)} × 10⁻¹ → Exponent − 1 = ${F(n)}` : `${fmt(m, 2)} liegt zwischen 1 und 10 → keine Korrektur`,
      `Ergebnis: ${fmt(borrow ? m * 10 : m, 2)} × ${p10(n)} → n = ${F(n)}`,
    ];
  },
};

function optText(p, task) {
  const v = p['c' + task.expected];
  return typeof v === 'string' ? v : '';
}

export function solutionSteps(task) {
  try {
    const fn = S[task?.subtype];
    const p = task?.params;
    if (!fn || !p || typeof p !== 'object' || !Object.keys(p).length) return [];
    const out = fn(p, task);
    return Array.isArray(out) ? out.filter((x) => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}
