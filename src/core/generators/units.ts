import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { parseU, uMul, uDiv, uInv, uMap, uStr } from '../units.ts';
import type { UnitList } from '../units.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import type { ChoiceTask } from '../../types.ts';
import { task, choiceTask as baseChoiceTask, shuffle, lv, isInt, placesHint } from './helpers.ts';
import type { Gen } from './helpers.ts';

const TIME_SWAP: Record<string, string[]> = { Jahr: ['Monat', 'Tag'], Monat: ['Jahr', 'Tag'], Tag: ['Jahr', 'h'], h: ['Tag', 'Jahr'] };

// Auswahl-Aufgabe mit lokalisierter Anzeige (Optionen, Prompt); intern bleiben die deutschen Einheitennamen
const choiceTask: typeof baseChoiceTask = (id, rng, o) => {
  const c: ChoiceTask = baseChoiceTask(id, rng, o);
  c.prompt = lw(c.prompt);
  c.choices = c.choices.map(lw);
  c.choices.forEach((x, i) => { c.params['c' + i] = x; });
  return c;
};

// Plausible Fehlantworten für eine Einheit: Kehrwert, Einzelfaktoren, falsche Zeitbasis
function unitDistractors(list: UnitList, rng: Rng, extra: string[] = []): string[] {
  const m = uMap(list);
  const correct = uStr(list);
  const prio: string[] = [uStr(uInv(list)), ...extra];
  for (const [n, e] of m) prio.push(uStr([[n, e]]), uStr([[n, -e]]));
  m.forEach(([n], i) => {
    for (const s of TIME_SWAP[n] || []) prio.push(uStr(m.map(([x, y], j): [string, number] => [j === i ? s : x, y])));
  });
  const all = [...shuffle(prio, rng), ...shuffle(['€', '1/Jahr', '€/Jahr', 'Stück', 'h', '€/Stück', 'Jahr', 'dimensionslos'], rng)];
  return all.filter((x, i) => x !== correct && all.indexOf(x) === i && x.length <= 40);
}

const RES_PAIRS: string[][] = [
  ['€/h', '×', 'h/Jahr'], ['Stück/Tag', '×', '€/Stück'], ['€', '÷', 'Mitarbeiter'], ['km/h', '×', 'h'],
  ['Mitarbeiter', '×', '€/Mitarbeiter'], ['€/Jahr', '÷', 'Stück/Jahr'], ['Tag/Jahr', '×', 'h/Tag'], ['€', '÷', 'Stück'],
  ['€/Stück', '×', 'Stück'], ['€/Monat', '×', 'Monat/Jahr'], ['km', '÷', 'h'], ['€/Jahr', '÷', 'Mitarbeiter'],
  ['Stück', '÷', 'Stück/Tag'], ['€/Jahr', '÷', '€'], ['Kunde', '×', '€/Kunde'], ['€/Min.', '×', 'Min./h'],
  ['h/Jahr', '÷', 'Tag/Jahr'], ['€', '÷', '€/Stück'],
];
const RES_TRIPLES: string[][] = [
  ['€/h', '×', 'h/Tag', '×', 'Tag/Jahr'], ['Stück/Tag', '×', '€/Stück', '×', 'Tag/Jahr'],
  ['€/Jahr', '÷', 'Mitarbeiter', '÷', 'Stück/Mitarbeiter'], ['€', '÷', 'Stück', '÷', 'Tag'],
  ['km/h', '×', 'h/Tag', '×', 'Tag'], ['€/Mitarbeiter', '×', 'Mitarbeiter', '÷', 'Jahr'],
  ['Stück', '×', '€/Stück', '÷', 'Mitarbeiter'], ['€/Min.', '×', 'Min./h', '×', 'h/Jahr'],
];
const QUANT: Record<string, string[]> = {
  '€/Jahr': ['Umsatz', 'Personalkosten', 'Gewinn'], '€': ['Kosten', 'Budget', 'Investition'],
  'h/Jahr': ['Ausfallzeit', 'Arbeitszeit', 'Wartungszeit'], 'Stück/Tag': ['Produktion', 'Absatz'],
  '€/Stück': ['Preis', 'Stückkosten'], 'km/h': ['Geschwindigkeit'], 'Stück': ['Absatz', 'Stückzahl'],
  'h/Tag': ['Arbeitszeit'], '€/h': ['Stundensatz'], 'Mitarbeiter': ['Belegschaft'], '€/Monat': ['Miete', 'Umsatz'],
  'Stück/Jahr': ['Absatz', 'Produktion'], '€/Mitarbeiter': ['Kosten pro Kopf'],
};

// Ausdruck aus [u1, op1, u2, (op2, u3)] auswerten → Einheitenliste
function evalExpr(ex: string[]): UnitList {
  let acc = parseU(ex[0] ?? '');
  for (let i = 1; i < ex.length; i += 2) acc = ex[i] === '×' ? uMul(acc, parseU(ex[i + 1] ?? '')) : uDiv(acc, parseU(ex[i + 1] ?? ''));
  return acc;
}

// ---------- Einheiten umrechnen ----------
// Jede Familie: gen(rng, L) → { x, y, prompt, unit, expected, abs }
interface Conv { x: number; y: number; prompt: string; unit: string; expected: number; abs?: number }
const CONV: Record<number, (rng: Rng, L: Level) => Conv> = {
  1: (rng: Rng, L: Level): Conv => {
    const x = 5 * randInt(lv(L, 2, 2, 5), lv(L, 40, 100, 300), rng) * (L === 1 ? 2 : 1);
    return { x, y: 0, prompt: t('core.conv.1', { x: fmt(x) }), unit: lw('Mio. €/Jahr'), expected: (x * 12) / 1000, abs: 0.005 };
  },
  2: (rng: Rng, L: Level): Conv => {
    const x = 18 * pick(lv(L, [2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7, 8], [1, 3, 5, 7, 9, 10]), rng);
    return { x, y: 0, prompt: t('core.conv.2', { x: fmt(x) }), unit: 'm/s', expected: x / 3.6 };
  },
  3: (rng: Rng, L: Level): Conv => {
    const x = L === 3 ? pick([2, 4, 6, 8, 12, 14], rng) : 5 * randInt(1, 8, rng);
    const e = round(x * 3.6, 4);
    return { x, y: 0, prompt: t('core.conv.3', { x: fmt(x) }), unit: 'km/h', expected: e, abs: isInt(e) ? 0 : 0.05 };
  },
  4: (rng: Rng, L: Level): Conv => {
    const x = pick(lv(L, [6, 8], [6, 7, 8, 9], [7.5, 8, 8.5, 9.5]), rng);
    const y = pick(lv(L, [200, 220, 250], [200, 210, 220, 225, 230, 240, 250], [210, 220, 230, 240]), rng);
    return { x, y, prompt: t('core.conv.4', { x: fmt(x), y: fmt(y) }), unit: lw('h/Jahr'), expected: x * y };
  },
  5: (rng: Rng, L: Level): Conv => {
    const x = pick(lv(L, [0.5, 1, 2, 3, 5], [0.25, 0.5, 1.5, 2, 2.5, 4, 5], [0.35, 0.75, 1.2, 1.75, 2.25, 3.5]), rng);
    return { x, y: 0, prompt: t('core.conv.5', { x: fmt(x) }), unit: '€/h', expected: x * 60 };
  },
  6: (rng: Rng, L: Level): Conv => {
    const y = 5 * randInt(lv(L, 2, 2, 4), lv(L, 40, 100, 250), rng) * (L === 1 ? 2 : 1);
    const x = round((y * 12) / 1000, 4);
    return { x, y, prompt: t('core.conv.6', { x: fmt(x) }), unit: lw('Tsd. €/Monat'), expected: y };
  },
  7: (rng: Rng, L: Level): Conv => {
    const x = 100 * pick(lv(L, [2, 4, 5, 10], [2, 4, 5, 8, 10, 12, 20, 25], [12, 15, 24, 36, 48, 75]), rng);
    const y = pick(lv(L, [250], [200, 220, 250, 300], [210, 240, 250, 280, 300]), rng);
    return { x, y, prompt: t('core.conv.7', { x: fmt(x), y: fmt(y) }), unit: lw('Tsd. Stück/Jahr'), expected: (x * y) / 1000 };
  },
  8: (rng: Rng, L: Level): Conv => {
    for (;;) {
      const x = pick([6, 12, 15, 20, 30, 45, 90], rng), y = pick([200, 210, 220, 225, 240, 250], rng);
      if ((x * y) % 60 !== 0) continue;
      return { x, y, prompt: t('core.conv.8', { x: fmt(x), y: fmt(y) }), unit: lw('h/Jahr'), expected: (x * y) / 60 };
    }
  },
  9: (rng: Rng): Conv => {
    const y = pick([200, 250], rng), x = pick(y === 250 ? [0.5, 1, 1.5, 2, 2.5, 3, 5] : [0.5, 1, 2, 3, 5], rng);
    return { x, y, prompt: t('core.conv.9', { x: fmt(x), y: fmt(y) }), unit: lw('Stück/Tag'), expected: (x * 1e6) / y };
  },
};
const CONV_FAMS: Record<Level, number[]> = { 1: [1, 2, 4, 5], 2: [1, 2, 3, 4, 5, 6, 7, 8], 3: [3, 6, 7, 8, 9, 1, 5] };

export const unitsGen: Record<string, Gen> = {
  'units.dimless': (rng: Rng, L: Level): Task => {
    let ex: string[], mode: string, ans: UnitList;
    if (L === 3) {
      const [u1 = '', op = '', u2 = ''] = pick(RES_PAIRS, rng);
      ex = [u1, op, u2];
      const comb = evalExpr(ex);
      if (!uMap(comb).length) return (unitsGen['units.dimless'] as Gen)(rng, L);
      mode = rng() < 0.5 ? '÷' : '×';
      ans = mode === '÷' ? comb : uInv(comb);
      const prompt = `[${u1}] ${op} [${u2}] ${mode} ? = dimensionslos`;
      return choiceTask('units.dimless', rng, {
        prompt, correct: uStr(ans), distractors: unitDistractors(ans, rng, [uStr(comb)]),
        params: { ua: u1, ub: u2, o1: op, o2: mode, k: 3 },
        hint: t('core.hint.unit_q'),
      });
    }
    const keys = Object.keys(QUANT);
    const u = pick(L === 1 ? ['€/Jahr', '€', 'h/Jahr', 'Stück/Tag', '€/Stück', 'km/h'] : keys, rng);
    const nm = pick(QUANT[u] ?? [], rng);
    mode = L === 1 ? '÷' : rng() < 0.5 ? '÷' : '×';
    ans = mode === '÷' ? parseU(u) : uInv(parseU(u));
    return choiceTask('units.dimless', rng, {
      prompt: `${nm} [${u}] ${mode} ? = dimensionslos`,
      correct: uStr(ans), distractors: unitDistractors(ans, rng, [uStr(parseU(u))]),
      params: { ua: u, ub: '', o1: '', o2: mode, k: 1 },
      hint: t('core.hint.unit_q'),
    });
  },
  'units.result': (rng: Rng, L: Level): Task => {
    const ex = L === 3 ? pick(RES_TRIPLES, rng) : pick(L === 1 ? RES_PAIRS.slice(0, 9) : RES_PAIRS, rng);
    const res = evalExpr(ex);
    const prompt = ex.map((x, i) => (i % 2 === 0 ? `[${x}]` : x)).join(' ') + ' = ?';
    const alt: string[] = [];
    // gleiche Operanden mit vertauschten Rechenzeichen
    for (let mask = 0; mask < 2 ** ((ex.length - 1) / 2); mask++) {
      let acc = parseU(ex[0] ?? '');
      for (let i = 1; i < ex.length; i += 2) {
        const flip = (mask >> ((i - 1) / 2)) & 1;
        const mul = (ex[i] === '×') !== !!flip;
        acc = mul ? uMul(acc, parseU(ex[i + 1] ?? '')) : uDiv(acc, parseU(ex[i + 1] ?? ''));
      }
      alt.push(uStr(acc), uStr(uInv(acc)));
    }
    const correct = uStr(res);
    return choiceTask('units.result', rng, {
      prompt, correct,
      distractors: [...shuffle(alt.filter((x) => x !== correct), rng), ...unitDistractors(res, rng)],
      params: { ua: ex[0] ?? '', o1: ex[1] ?? '', ub: ex[2] ?? '', o2: ex[3] || '', uc: ex[4] || '', k: (ex.length + 1) / 2 },
      hint: t('core.hint.cancel'),
    });
  },
  'units.convert': (rng: Rng, L: Level): Task => {
    const fam = pick(CONV_FAMS[L], rng);
    const r = (CONV[fam] as (rng: Rng, L: Level) => Conv)(rng, L);
    return task('units.convert', {
      params: { fam, x: r.x, y: r.y },
      prompt: r.prompt, unit: r.unit, hint: placesHint(r.expected),
      expected: r.expected, abs: r.abs,
    });
  },
};
