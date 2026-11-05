// Geführte Schritte der Rechentricks (×11, Quadrat auf 5, knapp unter 100, 3. Binom, Prozent-Tausch).
// Das Endergebnis wird aus den Zwischenwerten gerechnet (nicht aus task.expected) – die Tests prüfen, dass es passt.
import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import { pc } from './helpers.ts';
import type { SP } from './helpers.ts';
import { digits, ex, mk } from './guided-types.ts';
import type { GuidedFn, GuidedStep, LineSpan, LineVisual } from './guided-types.ts';

/** ×11 zweistellig: außen die Ziffern, in der Mitte ihre Summe (ggf. mit Übertrag). */
function x11two(a: number, b: number): GuidedStep[] {
  const s = a + b;
  const steps: GuidedStep[] = [
    { text: t('guide.x11.outer', { a, b }), expr: ex`${mk(a)}${mk(b)} × 11`, visual: digits([a, 'a'], ['?'], [b, 'a']) },
    {
      text: t('guide.x11.middle'), expr: ex`${mk(a)} + ${mk(b)}`, expected: s,
      hint: t('guide.x11.sumHint', { a, b }), visual: digits([a, 'a'], [s, 'b', `${a}+${b}`], [b, 'a']),
    },
  ];
  let hi = a, mid = s;
  if (s > 9) {
    hi = a + 1; mid = s - 10;
    steps.push({
      text: t('guide.x11.carry', { s, a }), expr: ex`${a} + ${mk(1)}`, expected: hi,
      hint: t('guide.x11.carryHint', { s, a }), visual: digits([hi, 'c', `${a}+1`], [mid, 'b'], [b, 'a']),
    });
  }
  const res = hi * 100 + mid * 10 + b;
  steps.push({
    text: t('guide.x11.join'), expr: ex`${hi} | ${mid} | ${b}`, expected: res,
    hint: t('guide.x11.joinHint', { a: hi, m: mid, b }), visual: digits(...String(res).split('').map((c): [string, 'b'] => [c, 'b'])),
  });
  return steps;
}

/** ×11 dreistellig: außen bleiben, dazwischen die Summen benachbarter Ziffern; Überträge rechnen sich beim Zusammensetzen ein. */
function x11three(x: number, y: number, z: number): GuidedStep[] {
  const s1 = x + y, s2 = y + z, res = x * 1000 + s1 * 100 + s2 * 10 + z;
  const carry = s1 > 9 || s2 > 9;
  return [
    { text: t('guide.x11.outer3', { a: x, c: z }), expr: ex`${mk(x)}${y}${mk(z)} × 11`, visual: digits([x, 'a'], ['?'], ['?'], [z, 'a']) },
    {
      text: t('guide.x11.left'), expr: ex`${mk(x)} + ${mk(y)}`, expected: s1,
      hint: t('guide.x11.sumHint', { a: x, b: y }), visual: digits([x, 'a'], [s1, 'b', `${x}+${y}`], ['?'], [z, 'a']),
    },
    {
      text: t('guide.x11.right'), expr: ex`${mk(y)} + ${mk(z)}`, expected: s2,
      hint: t('guide.x11.sumHint', { a: y, b: z }), visual: digits([x, 'a'], [s1, 'b'], [s2, 'b', `${y}+${z}`], [z, 'a']),
    },
    {
      text: t(carry ? 'guide.x11.joinCarry' : 'guide.x11.join'), expr: ex`${x} | ${s1} | ${s2} | ${z}`, expected: res,
      hint: t(carry ? 'guide.x11.joinCarryHint' : 'guide.x11.join3Hint'),
      visual: digits(...String(res).split('').map((c): [string, 'b'] => [c, 'b'])),
    },
  ];
}

/** Zahlenstrahl mit Markierungen (doppelte Werte nur einmal). */
function line(min: number, max: number, ticks: LineVisual['ticks'], spans: LineSpan[] = []): LineVisual {
  const seen = new Set<number>();
  return { kind: 'line', min, max, ticks: ticks.filter((k) => !seen.has(k.v) && Boolean(seen.add(k.v))), spans };
}

export const guidedTricks: Record<string, GuidedFn> = {
  'tricks.x11': ({ n }: SP) => {
    const d = String(n).split('').map(Number);
    return d.length === 3 ? x11three(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0) : x11two(d[0] ?? 0, d[1] ?? 0);
  },

  'tricks.square5': ({ n }: SP) => {
    const tt = Math.floor(n / 10), p = tt * (tt + 1);
    return [
      { text: t('guide.s5.tens', { n, t: tt }), expr: ex`${mk(tt)}5²`, visual: digits([tt, 'a'], [5]) },
      {
        text: t('guide.s5.next', { t: tt }), expr: ex`${mk(tt)} × ${mk(tt + 1)}`, expected: p,
        hint: t('guide.s5.nextHint', { t: tt, t1: tt + 1 }), visual: digits([p, 'b', `${tt}×${tt + 1}`], ['?']),
      },
      {
        text: t('guide.s5.append'), expr: ex`${p} | ${mk('25')}`, expected: p * 100 + 25,
        hint: t('guide.s5.appendHint', { p }), visual: digits([p, 'b'], ['25', 'c', '5×5']),
      },
    ];
  },

  'tricks.near100': ({ a, b }: SP) => {
    const da = 100 - a, db = 100 - b, h = a - db, p = da * db;
    const lo = Math.floor((Math.min(a, b) - 3) / 5) * 5;
    const ticks = [{ v: a, label: fmt(a), tone: 'a' as const }, { v: b, label: fmt(b), tone: 'a' as const }, { v: 100, label: '100' }];
    const spanA: LineSpan = { from: a, to: 100, label: fmt(da), tone: 'b' };
    const spanB: LineSpan = { from: b, to: 100, label: fmt(db), tone: 'c' };
    // Gleiche Zahlen (93 × 93): nur ein Abstand
    const both = a === b ? line(lo, 100, ticks, [spanA]) : line(lo, 100, ticks, [spanA, spanB]);
    const distB: GuidedStep[] = a === b ? [] : [
      { text: t('guide.n100.dist', { a: b }), expr: ex`100 − ${mk(b)}`, expected: db, hint: t('guide.n100.distHint', { a: b }), visual: both },
    ];
    return [
      { text: t('guide.n100.intro'), expr: ex`${mk(a)} × ${mk(b)}`, visual: line(lo, 100, ticks) },
      { text: t('guide.n100.dist', { a }), expr: ex`100 − ${mk(a)}`, expected: da, hint: t('guide.n100.distHint', { a }), visual: line(lo, 100, ticks, [spanA]) },
      ...distB,
      { text: t('guide.n100.cross', { db, b }), expr: ex`${mk(a)} − ${mk(db)}`, expected: h, hint: t('guide.n100.crossHint', { a, db }), visual: both },
      { text: t('guide.n100.prod'), expr: ex`${mk(da)} × ${mk(db)}`, expected: p, hint: t('guide.n100.prodHint'), visual: both },
      {
        text: t('guide.n100.join', { h }), expr: ex`${mk(h)} × 100 + ${mk(p)}`, expected: h * 100 + p,
        hint: t('guide.n100.joinHint', { h, p }), visual: both,
      },
    ];
  },

  'tricks.diffsq': ({ a, b, m, d }: SP) => {
    const pad = Math.max(2, Math.ceil(d / 2));
    const ends = [{ v: a, label: fmt(a), tone: 'a' as const }, { v: b, label: fmt(b), tone: 'a' as const }];
    const withMid = [...ends, { v: m, label: fmt(m), tone: 'b' as const }];
    const spans: LineSpan[] = [{ from: a, to: m, label: fmt(d), tone: 'c' }, { from: m, to: b, label: fmt(d), tone: 'c' }];
    const full = line(a - pad, b + pad, withMid, spans);
    return [
      { text: t('guide.ds.sym', { a, b }), expr: ex`${mk(a)} × ${mk(b)}`, visual: line(a - pad, b + pad, ends) },
      { text: t('guide.ds.mid'), expr: ex`(${a} + ${b}) ÷ 2`, expected: m, hint: t('guide.ds.midHint'), visual: line(a - pad, b + pad, withMid) },
      { text: t('guide.ds.dist', { m }), expr: ex`${mk(b)} − ${mk(m)}`, expected: d, hint: t('guide.ds.distHint', { b, m }), visual: full },
      { text: t('guide.ds.formula', { m, d }), expr: ex`${mk(m)}²`, expected: m * m, hint: t('guide.ds.sqHint', { m10: m / 10 }), visual: full },
      { text: t('guide.ds.d2'), expr: ex`${mk(d)}²`, expected: d * d, hint: t('guide.ds.d2Hint', { d }), visual: full },
      { text: t('guide.ds.sub'), expr: ex`${m * m} − ${d * d}`, expected: m * m - d * d, hint: t('guide.ds.subHint'), visual: full },
    ];
  },

  'tricks.pctswap': ({ p, y }: SP) => {
    const k = 100 / y, res = p / k;
    const of = t('guide.of');
    return [
      {
        text: t('guide.ps.rule'), expr: ex`${mk(pc(p))} ${of} ${mk(y)} = ${mk(pc(y))} ${of} ${mk(p)}`,
        visual: { kind: 'bar', parts: k, filled: 0, whole: fmt(p) },
      },
      {
        text: t('guide.ps.frac', { y: pc(y) }), expr: ex`100 ÷ ${mk(y)}`, expected: k,
        hint: t('guide.ps.fracHint', { y }), visual: { kind: 'bar', parts: k, filled: 0, whole: fmt(p), part: pc(y) },
      },
      {
        text: t('guide.ps.div', { y: pc(y), k, p }), expr: ex`${mk(p)} ÷ ${mk(k)}`, expected: res,
        hint: t('guide.ps.divHint', { p, k }), visual: { kind: 'bar', parts: k, filled: 1, whole: fmt(p), part: `${pc(y)} = ${fmt(res)}` },
      },
    ];
  },
};
