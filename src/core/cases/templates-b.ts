// Case-Vorlagen 5–8: Preiserhöhung, Kapazität, Wachstum, Exhibit (Segmente).
import { fmt } from '../numbers.ts';
import { lw } from '../l10n.ts';
import type { Rng } from '../numbers.ts';
import { shuffle } from '../generators/helpers.ts';
import { choiceStep, ct, hasDecimals, lines, money, niceThreshold, numStep, pickBuilt } from './helpers.ts';
import type { CaseTemplate, MiniCase } from './types.ts';

const f = fmt;
const once = <T>(fn: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= fn());
};

/* ---------- 5 · Preiserhöhung ---------- */

interface PricingBase { price: number; q: number; x: number; y: number }
const pricingCands = once((): PricingBase[] => {
  const out: PricingBase[] = [];
  for (const price of [8, 10, 12, 15, 20]) for (const q of [2, 4, 5, 8, 10]) for (const x of [5, 10, 15, 20, 25]) for (const y of [5, 10, 15, 20, 25, 30]) {
    const p1 = price * (1 + x / 100), q1 = q * (1 - y / 100), r0 = price * q, r1 = p1 * q1;
    const ch = (r1 / r0 - 1) * 100;
    if (hasDecimals(p1, 2) && hasDecimals(q1, 2) && hasDecimals(r1, 2) && hasDecimals(ch, 2) && Math.abs(ch) >= 2) out.push({ price, q, x, y });
  }
  return out;
});

export const pricing: CaseTemplate = {
  id: 'pricing',
  title: () => ct('pricing.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(pricingCands(), rng, (b) => {
      const p1 = b.price * (1 + b.x / 100), q1 = b.q * (1 - b.y / 100), r0 = b.price * b.q, r1 = p1 * q1;
      const ch = (r1 / r0 - 1) * 100, up = r1 > r0;
      const pp = { p1: money('eur', p1), q1: f(q1) };
      return {
        templateId: 'pricing', title: ct('pricing.title'), exhibit: null,
        brief: ct('pricing.brief', { q: f(b.q), price: money('eur', b.price), x: f(b.x), y: f(b.y) }),
        base: { ...b },
        steps: [
          numStep({
            prompt: ct('pricing.p1'), expected: p1, unit: '€',
            solution: lines('pricing.s1', { price: money('eur', b.price), x: f(b.x), p1: pp.p1 }),
          }),
          numStep({
            prompt: ct('pricing.p2'), expected: q1, unit: ct('u.mioSubs'),
            solution: lines('pricing.s2', { q: f(b.q), y: f(b.y), q1: pp.q1 }),
          }),
          numStep({
            prompt: ct('pricing.p3', { p1: pp.p1, q1: pp.q1 }), expected: r1, unit: lw('Mio. €'), rel: 0.01,
            solution: lines('pricing.s3', { p1: pp.p1, q1: pp.q1, r1: money('mio', r1) }),
          }),
          numStep({
            prompt: ct('pricing.p4', { r1: money('mio', r1), r0: money('mio', r0) }), expected: ch, unit: '%', abs: 0.5,
            hint: ct('hint.signed'),
            solution: lines('pricing.s4', { r1: money('mio', r1), r0: money('mio', r0), ch: f(ch) }),
          }),
          choiceStep({
            prompt: ct('pricing.q', { x: f(b.x) }),
            choices: [ct('pricing.c.yes'), ct('pricing.c.no')], correctIndex: up ? 0 : 1,
            why: ct(up ? 'pricing.why.yes' : 'pricing.why.no', { r1: money('mio', r1), r0: money('mio', r0), ch: f(Math.abs(ch)) }),
          }),
        ],
      };
    });
  },
};

/* ---------- 6 · Kapazität & Automatisierung ---------- */

interface OpsBase { v: number; m: number; k: number; a: number }
const opsCands = once((): OpsBase[] => {
  const out: OpsBase[] = [];
  for (const v of [400, 600, 800, 1200, 1600]) for (const m of [6, 10, 12, 15, 20]) {
    const hours = (v * m) / 60;
    if (!Number.isInteger(hours) || hours % 8 !== 0 || hours / 8 < 5 || hours / 8 > 60) continue;
    for (const k of [50, 60, 70, 80]) for (const a of [20, 25, 30, 40, 50]) {
      if (Number.isInteger((hours / 8) * k * (a / 100))) out.push({ v, m, k, a });
    }
  }
  return out;
});

export const ops: CaseTemplate = {
  id: 'ops',
  title: () => ct('ops.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(opsCands(), rng, (b) => {
      const hours = (b.v * b.m) / 60, fte = hours / 8, cost = fte * b.k, saving = (cost * b.a) / 100;
      const tool = niceThreshold(saving, rng);
      if (tool === null) return null;
      const ok = saving > tool;
      const pp = { cost: money('tsd', cost), saving: money('tsd', saving), tool: money('tsd', tool) };
      return {
        templateId: 'ops', title: ct('ops.title'), exhibit: null,
        brief: ct('ops.brief', { v: f(b.v), m: f(b.m), k: money('tsd', b.k), a: f(b.a), tool: pp.tool }),
        base: { ...b, tool },
        steps: [
          numStep({
            prompt: ct('ops.p1'), expected: hours, unit: ct('u.hours'),
            solution: lines('ops.s1', { v: f(b.v), m: f(b.m), mins: f(b.v * b.m), hours: f(hours) }),
          }),
          numStep({
            prompt: ct('ops.p2', { hours: f(hours) }), expected: fte, unit: ct('u.fte'),
            solution: lines('ops.s2', { hours: f(hours), fte: f(fte) }),
          }),
          numStep({
            prompt: ct('ops.p3', { fte: f(fte) }), expected: cost, unit: lw('Tsd. €'),
            solution: lines('ops.s3', { fte: f(fte), k: money('tsd', b.k), cost: pp.cost }),
          }),
          numStep({
            prompt: ct('ops.p4', { cost: pp.cost, a: f(b.a) }), expected: saving, unit: lw('Tsd. €'),
            solution: lines('ops.s4', { a: f(b.a), cost: pp.cost, saving: pp.saving }),
          }),
          choiceStep({
            prompt: ct('ops.q', { saving: pp.saving, tool: pp.tool }),
            choices: [ct('ops.c.yes'), ct('ops.c.no')], correctIndex: ok ? 0 : 1,
            why: ct(ok ? 'ops.why.yes' : 'ops.why.no', { saving: pp.saving, tool: pp.tool }),
          }),
        ],
      };
    });
  },
};

/* ---------- 7 · Wachstum (72er-Regel) ---------- */

interface GrowthBase { a: number; factor: number; n: number }
const growthCands = once((): GrowthBase[] => {
  const out: GrowthBase[] = [];
  for (const a of [20, 25, 40, 50, 100]) {
    for (const n of [4, 6, 8, 9, 12]) out.push({ a, factor: 2, n });
    for (const n of [8, 12, 16]) out.push({ a, factor: 4, n });
  }
  return out;
});

export const growth: CaseTemplate = {
  id: 'growth',
  title: () => ct('growth.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(growthCands(), rng, (b) => {
      const doublings = b.factor === 4 ? 2 : 1;
      const g = (72 * doublings) / b.n, big = b.a * b.factor;
      const r1 = big * (1 + g / 100), r2 = r1 * (1 + g / 100);
      const target = niceThreshold(r2, rng, 0.06);
      if (target === null) return null;
      const ok = r2 >= target;
      const pp = { a: money('mio', b.a), b: money('mio', big), g: f(g), r1: money('mio', r1), r2: money('mio', r2), target: money('mio', target) };
      return {
        templateId: 'growth', title: ct('growth.title'), exhibit: null,
        brief: ct('growth.brief', { n: f(b.n), a: pp.a, b: pp.b, target: pp.target }),
        base: { ...b, target },
        steps: [
          numStep({
            prompt: ct('growth.p1'), expected: b.factor, unit: '×',
            solution: lines('growth.s1', { a: pp.a, b: pp.b, factor: f(b.factor) }),
          }),
          numStep({
            prompt: ct('growth.p2', { factor: f(b.factor), n: f(b.n) }), expected: g, unit: '%', rel: 0.1,
            hint: ct('hint.rule72'),
            solution: lines(b.factor === 4 ? 'growth.s2.quad' : 'growth.s2.double', { n: f(b.n), half: f(b.n / 2), g: f(g) }),
          }),
          numStep({
            prompt: ct('growth.p3', { g: f(g), b: pp.b }), expected: r1, unit: lw('Mio. €'), rel: 0.01,
            solution: lines('growth.s3', { b: pp.b, g: f(g), r1: pp.r1 }),
          }),
          numStep({
            prompt: ct('growth.p4', { g: f(g), r1: pp.r1 }), expected: r2, unit: lw('Mio. €'), rel: 0.02,
            hint: ct('hint.roundOk'),
            solution: lines('growth.s4', { r1: pp.r1, g: f(g), r2: pp.r2 }),
          }),
          choiceStep({
            prompt: ct('growth.q', { target: pp.target, r2: pp.r2 }),
            choices: [ct('growth.c.yes'), ct('growth.c.no')], correctIndex: ok ? 0 : 1,
            why: ct(ok ? 'growth.why.yes' : 'growth.why.no', { r2: pp.r2, target: pp.target }),
          }),
        ],
      };
    });
  },
};

/* ---------- 8 · Exhibit: Segmente ---------- */

interface ExhibitBase { rev: [number, number, number]; marg: [number, number, number] }
const exhibitCands = once((): ExhibitBase[] => {
  const out: ExhibitBase[] = [];
  const revs = [20, 30, 40, 50, 60, 80, 100, 120];
  const margs = [4, 5, 6, 8, 10, 12, 15, 20, 25];
  for (const r1 of revs) for (const r2 of revs) for (const r3 of revs) {
    const total = r1 + r2 + r3;
    if (total < 100 || total > 250 || new Set([r1, r2, r3]).size < 3) continue;
    const rev: [number, number, number] = [r1, r2, r3];
    const big = rev.indexOf(Math.max(...rev));
    for (const m1 of margs) for (const m2 of margs) for (const m3 of margs) {
      const marg: [number, number, number] = [m1, m2, m3];
      if (new Set(marg).size < 3) continue;
      const best = marg.indexOf(Math.max(...marg));
      if (best === big) continue;
      const gain = rev.reduce((s, r, i) => s + (r * (marg[i] ?? 0)) / 100, 0);
      if (hasDecimals((gain / total) * 100, 1) && hasDecimals((Math.max(...rev) / total) * 100, 1)) out.push({ rev, marg });
    }
  }
  return out;
});

export const exhibit: CaseTemplate = {
  id: 'exhibit',
  title: () => ct('exhibit.title'),
  generate(rng: Rng): MiniCase {
    return pickBuilt(exhibitCands(), rng, (b) => {
      const names = shuffle(ct('exhibit.segs').split('|'), rng).slice(0, 3);
      const total = b.rev[0] + b.rev[1] + b.rev[2];
      const big = b.rev.indexOf(Math.max(...b.rev)), best = b.marg.indexOf(Math.max(...b.marg));
      const share = (b.rev[big]! / total) * 100;
      const profits = b.rev.map((r, i) => (r * (b.marg[i] ?? 0)) / 100);
      const gain = profits.reduce((s, x) => s + x, 0), wm = (gain / total) * 100;
      const extra = 10, extraGain = (extra * (b.marg[best] ?? 0)) / 100;
      return {
        templateId: 'exhibit', title: ct('exhibit.title'),
        exhibit: {
          ex: 'table', ttl: ct('exhibit.ttl'), hd: ct('exhibit.hd'), lab: names.join('|'),
          s1: b.rev.join('|'), s2: b.marg.join('|'),
        },
        brief: ct('exhibit.brief'),
        base: { r0: b.rev[0], r1: b.rev[1], r2: b.rev[2], m0: b.marg[0] ?? 0, m1: b.marg[1] ?? 0, m2: b.marg[2] ?? 0 },
        steps: [
          numStep({
            prompt: ct('exhibit.p1'), expected: total, unit: lw('Mio. €'),
            solution: lines('exhibit.s1', { a: f(b.rev[0]), b: f(b.rev[1]), c: f(b.rev[2]), total: f(total) }),
          }),
          numStep({
            prompt: ct('exhibit.p2', { total: money('mio', total), seg: names[big] ?? '' }), expected: share, unit: '%', abs: 0.5,
            solution: lines('exhibit.s2', { seg: names[big] ?? '', rev: money('mio', b.rev[big]!), total: money('mio', total), share: f(share) }),
          }),
          numStep({
            prompt: ct('exhibit.p3', { total: money('mio', total) }), expected: gain, unit: lw('Mio. €'), rel: 0.01,
            solution: lines('exhibit.s3', {
              g0: f(profits[0] ?? 0), g1: f(profits[1] ?? 0), g2: f(profits[2] ?? 0), gain: money('mio', gain),
            }),
          }),
          numStep({
            prompt: ct('exhibit.p4', { gain: money('mio', gain), total: money('mio', total) }), expected: wm, unit: '%', abs: 0.3,
            solution: lines('exhibit.s4', { gain: money('mio', gain), total: money('mio', total), wm: f(wm) }),
          }),
          choiceStep({
            prompt: ct('exhibit.q', { extra: money('mio', extra) }),
            choices: names, correctIndex: best,
            why: ct('exhibit.why', {
              seg: names[best] ?? '', m: f(b.marg[best] ?? 0), extra: money('mio', extra), gain: money('mio', extraGain),
              big: names[big] ?? '', bm: f(b.marg[big] ?? 0),
            }),
          }),
        ],
      };
    });
  },
};
