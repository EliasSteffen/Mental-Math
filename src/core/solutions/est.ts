import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { strip, sig, roundSig, near10, near5, uniq, pctOfSteps, bestPair, roundNote } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const estSteps: Record<string, StepFn> = {
  'est.mult': ({ a, b }: SP, task: Task) => {
    const mant = (n: number): number => strip(n).m;
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

  'est.div': ({ n, d }: SP, task: Task) => {
    const easy = (x: number, y: number): boolean => {
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

  'est.pct': ({ p, y }: SP, task: Task) => {
    const pC = [];
    for (let q = 5; q <= 95; q += 5) if (Math.abs(q - p) <= 3) pC.push(q);
    const pcost = (q: number): number => (q % 10 === 0 || q === 25 || q === 75 ? 1 : 2);
    const best = bestPair(pC, uniq([roundSig(y, 1), roundSig(y, 2)]), p * y / 100, (q, v) => (q * v) / 100,
      (q, v) => pcost(q) + sig(v));
    const { a: pr, b: yr } = best;
    return [roundNote([[p, pr], [y, yr]]), ...pctOfSteps(pr, yr), `Exakt: ${fmt(task.expected)}`];
  },

};
