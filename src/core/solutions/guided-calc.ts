// Geführte Schritte für Einmaleins-Zerlegung (mult.2x1), Veränderung in % (pct.change), Bruch → % (frac.topct)
// und große Zahlen (big.mult). Endergebnis immer aus den Zwischenwerten gerechnet; die Tests vergleichen mit task.expected.
import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { fmt } from '../numbers.ts';
import { pc, pow10, R, strip } from './helpers.ts';
import type { SP } from './helpers.ts';
import { ex, mk } from './guided-types.ts';
import type { AreaVisual, BarVisual, ExprPart, GuidedFn, GuidedStep, PlaceRow, PlacesVisual } from './guided-types.ts';

const area = (parts: number[], factor: number, shown: number): AreaVisual => ({ kind: 'area', parts, factor, shown });

/** Hinweis für „Teil × b“: Einmaleins, bei Zehnern/Hundertern mit angehängten Nullen. */
function partHint(part: number, b: number): string {
  if (part >= 100 && part % 100 === 0) return t('guide.m.hundredsHint', { x: part / 100, b });
  if (part >= 10 && part % 10 === 0) return t('guide.m.tensHint', { x: part / 10, b });
  return t('guide.m.onesHint', { x: part, b });
}

/** Stellenwert-Teile: 347 → [300, 40, 7] (Nullen fallen weg). */
function placeParts(a: number): number[] {
  return String(a).split('').map((c, i, all) => Number(c) * 10 ** (all.length - 1 - i)).filter((x) => x > 0);
}

function joinParts(xs: readonly number[], op: string): ExprPart[] {
  return xs.flatMap((x, i): ExprPart[] => (i ? [` ${op} `, mk(x)] : [mk(x)]));
}

function multTwo({ a, b }: SP): GuidedStep[] {
  // endet auf 0: ohne Null rechnen, Null wieder anhängen
  if (a % 10 === 0) {
    const a10 = a / 10, x = a10 * b;
    return [
      { text: t('guide.m.zero', { a }), expr: ex`${mk(a)} × ${b}`, visual: area([a], b, 0) },
      { text: t('guide.m.zeroDrop', { a10 }), expr: ex`${mk(a10)} × ${mk(b)}`, expected: x, hint: partHint(a10, b), visual: area([a], b, 0) },
      { text: t('guide.m.zeroBack'), expr: ex`${x} × 10`, expected: x * 10, hint: t('guide.m.zeroHint', { x }), visual: area([a], b, 1) },
    ];
  }
  // zweistellig knapp unter dem nächsten Zehner: rückwärts rechnen (49 × 6 = 50 × 6 − 1 × 6)
  const o = a % 10;
  if (a < 100 && o >= 8) {
    const d = 10 - o, base = a + d, parts = [base, -d];
    const big = base * b, small = d * b;
    return [
      { text: t('guide.m.up', { a, base }), expr: ex`${mk(a)} × ${b}`, visual: area(parts, b, 0) },
      { text: t('guide.m.upDist', { a, base }), expr: ex`${base} − ${mk(a)}`, expected: d, hint: t('guide.m.upDistHint', { a, base }), visual: area(parts, b, 0) },
      { text: t('guide.m.upBase', { base, b }), expr: ex`${mk(base)} × ${mk(b)}`, expected: big, hint: partHint(base, b), visual: area(parts, b, 1) },
      { text: t('guide.m.upSmall', { d, b }), expr: ex`${mk(d)} × ${mk(b)}`, expected: small, hint: partHint(d, b), visual: area(parts, b, 2) },
      { text: t('guide.m.upMinus'), expr: ex`${big} − ${small}`, expected: big - small, hint: t('guide.m.upMinusHint'), visual: area(parts, b, 2) },
    ];
  }
  // Normalfall: in Stellenwerte zerlegen, Teilprodukte addieren
  const parts = placeParts(a);
  const steps: GuidedStep[] = [
    { text: t(parts.length > 2 ? 'guide.m.split3' : 'guide.m.split'), expr: [`${fmt(a)} = `, ...joinParts(parts, '+')], visual: area(parts, b, 0) },
  ];
  parts.forEach((part, i) => {
    const key = part >= 100 ? 'guide.m.h' : part >= 10 ? 'guide.m.t' : 'guide.m.o';
    steps.push({ text: t(key, { b }), expr: ex`${mk(part)} × ${mk(b)}`, expected: part * b, hint: partHint(part, b), visual: area(parts, b, i + 1) });
  });
  const products = parts.map((x) => x * b);
  steps.push({
    text: t('guide.m.sum'), expr: [products.map((x) => fmt(x)).join(' + ')], expected: products.reduce((s, x) => s + x, 0),
    hint: t('guide.m.sumHint'), visual: area(parts, b, parts.length),
  });
  return steps;
}

function pctChange({ alt, neu }: SP): GuidedStep[] {
  const up = neu > alt, diff = R(Math.abs(neu - alt)), a10 = R(alt / 10), k = R(diff / a10), res = R(k * 10);
  const delta = `${up ? '+' : '−'}${fmt(diff)}`;
  const bar = (o: Partial<BarVisual>): BarVisual => ({ kind: 'bar', parts: 10, filled: 0, whole: fmt(alt), ...o });
  const change = up ? { extra: k, delta } : { cut: k, delta };
  const tenth = `${pc(10)} = ${fmt(a10)}`;
  return [
    { text: t(up ? 'guide.pc.up' : 'guide.pc.down'), expr: ex`${mk(alt)} → ${mk(neu)}`, visual: bar({}) },
    {
      text: t('guide.pc.diff'), expr: up ? ex`${mk(neu)} − ${mk(alt)}` : ex`${mk(alt)} − ${mk(neu)}`, expected: diff,
      tolerance: 1e-6, hint: t('guide.pc.diffHint'), visual: bar(change),
    },
    {
      text: t('guide.pc.ten', { alt: fmt(alt) }), expr: ex`${mk(alt)} ÷ 10`, expected: a10, tolerance: 1e-6,
      hint: t('guide.pc.tenHint', { alt: fmt(alt) }), visual: bar({ ...change, filled: 1, part: tenth }),
    },
    {
      text: t('guide.pc.steps', { a10: fmt(a10) }), expr: ex`${mk(diff)} ÷ ${mk(a10)}`, expected: k, tolerance: 0.01,
      hint: t('guide.pc.stepsHint', { diff: fmt(diff), a10: fmt(a10) }), visual: bar({ ...change, filled: 1, part: tenth }),
    },
    {
      text: t(up ? 'guide.pc.resultUp' : 'guide.pc.resultDown'), expr: ex`${k} × ${pc(10)}`, expected: res, tolerance: 0.05, unit: '%',
      hint: t('guide.pc.resultHint', { k: fmt(k) }), visual: bar({ ...change, filled: 1, part: tenth }),
    },
  ];
}

function fracToPct({ n, d }: SP, task: Task): GuidedStep[] {
  const u = R(100 / d), tol = Math.max(task.tolerance.abs, 1e-6);
  const isInt = Number.isInteger(u);
  const bar = (filled: number, part?: string): BarVisual => ({ kind: 'bar', parts: d, filled, whole: pc(100), ...(part ? { part } : {}) });
  const unitPart = `1/${d} = ${pc(fmt(u))}`;
  const steps: GuidedStep[] = [
    { text: t('guide.fr.whole', { d }), expr: ex`${mk(n)}/${mk(d)}`, visual: bar(0) },
    {
      text: t('guide.fr.unit', { d }), expr: ex`100 ÷ ${mk(d)}`, expected: u, tolerance: tol, unit: '%',
      hint: isInt ? t('guide.fr.unitHint', { d }) : t('guide.fr.unitHintRest', { d, q: Math.floor(100 / d), dq: d * Math.floor(100 / d) }),
      visual: bar(1, unitPart),
    },
  ];
  if (n === 1) return steps;
  if (d - n === 1) {
    steps.push({
      text: t('guide.fr.comp', { n, d }), expr: ex`100 − ${mk(u)}`, expected: R(100 - u), tolerance: tol, unit: '%',
      hint: t('guide.fr.compHint', { d }), visual: bar(n, unitPart),
    });
  } else {
    steps.push({
      text: t('guide.fr.times', { n }), expr: ex`${mk(n)} × ${u}`, expected: R(n * u), tolerance: tol, unit: '%',
      hint: t('guide.fr.timesHint', { n, d }), visual: bar(n, unitPart),
    });
  }
  return steps;
}

function bigMult({ m, u, b, ua }: SP): GuidedStep[] {
  const { m: b0, z } = strip(b);
  const uv = u === 'Tsd.' ? 3 : 6, X = R(m * b0), e = uv + z;
  const out = ua === 'Mrd.' ? 9 : ua === 'Mio.' ? 6 : 3;
  const v = R(X * 10 ** (e - out));
  const U = lw(u), UA = lw(ua);
  const base: PlaceRow[] = [
    { label: `${fmt(m)} ${U}`, digits: fmt(m), zeros: uv, tone: 'a' },
    { label: fmt(b), digits: fmt(b0), zeros: z, tone: 'a' },
  ];
  const places = (...more: PlaceRow[]): PlacesVisual => ({ kind: 'places', rows: [...base, ...more] });
  return [
    { text: t('guide.big.split', { u: U, uv, b: fmt(b), z }), expr: ex`${mk(fmt(m))} × ${pow10(uv)} × ${mk(b0)} × ${pow10(z)}`, visual: places() },
    {
      text: t('guide.big.digits'), expr: ex`${mk(fmt(m))} × ${mk(b0)}`, expected: X, tolerance: 1e-6,
      hint: t('guide.big.digitsHint', { m: fmt(m), b0 }), visual: places({ label: '=', digits: fmt(X), zeros: 0, tone: 'b' }),
    },
    {
      text: t('guide.big.zeros'), expr: ex`${mk(uv)} + ${mk(z)}`, expected: e,
      hint: t('guide.big.zerosHint', { u: U, uv, b: fmt(b), z }), visual: places({ label: '=', digits: fmt(X), zeros: e, tone: 'b' }),
    },
    {
      text: t('guide.big.unit', { ua: UA, out }), expr: ex`${mk(fmt(X))} × ${pow10(e)}`, expected: v, tolerance: 1e-6, unit: UA,
      hint: t('guide.big.unitHint', { ua: UA, out, e }), visual: places({ label: '=', digits: fmt(v), zeros: out, tone: 'b', unit: UA }),
    },
  ];
}

export const guidedCalc: Record<string, GuidedFn> = {
  'mult.2x1': multTwo,
  'pct.change': pctChange,
  'frac.topct': fracToPct,
  'big.mult': bigMult,
};
