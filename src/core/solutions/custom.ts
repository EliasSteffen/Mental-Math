// Lösungswege fürs Eigene Training (Zerlegen)
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';
import { strip } from './helpers.ts';

/** 234 → [200, 30, 4] */
function places(x: number): number[] {
  const out: number[] = [];
  let f = 1;
  for (let r = x; r > 0; r = Math.floor(r / 10), f *= 10) {
    const dgt = r % 10;
    if (dgt) out.unshift(dgt * f);
  }
  return out;
}

export const customSteps: Record<string, StepFn> = {
  'custom.mul': ({ a, b }: SP, task) => {
    const res = task.expected;
    const x = Math.max(a, b), y = Math.min(a, b);
    if (x < 10) {
      return [
        `${a} × ${b} aus dem Einmaleins`,
        `Stütze: ${a} × ${b} = ${a} × 10 − ${a} × ${10 - b} = ${a * 10} − ${a * (10 - b)}`,
        `${a} × ${b} = ${fmt(res)}`,
      ];
    }
    const parts = places(x);
    if (parts.length === 1) {
      const { m, z } = strip(x);
      return [
        `${fmt(x)} × ${y}: zuerst ohne die Nullen rechnen`,
        `${m} × ${y} = ${fmt(m * y)}`,
        `${z} ${z === 1 ? 'Null' : 'Nullen'} anhängen → ${fmt(res)}`,
      ];
    }
    return [
      `Zerlege ${fmt(x)} in ${parts.map((p) => fmt(p)).join(' + ')}`,
      `Teilprodukte: ${parts.map((p) => `${fmt(p)} × ${y} = ${fmt(p * y)}`).join(', ')}`,
      `Addieren: ${parts.map((p) => fmt(p * y)).join(' + ')}`,
      `${fmt(a)} × ${fmt(b)} = ${fmt(res)}`,
    ];
  },

  'custom.square': ({ n }: SP, task) => {
    const res = task.expected;
    if (n < 10) {
      return [
        `${n}² = ${n} × ${n}`,
        `Stütze: ${n} × ${n} = ${n} × 10 − ${n} × ${10 - n} = ${n * 10} − ${n * (10 - n)}`,
        `${n}² = ${fmt(res)}`,
      ];
    }
    if (n % 10 === 0) {
      return [
        `${n} = ${n / 10} × 10, also ${n}² = ${n / 10}² × 100`,
        `${n / 10}² = ${fmt((n / 10) ** 2)}`,
        `${fmt((n / 10) ** 2)} × 100 = ${fmt(res)}`,
      ];
    }
    const down = n % 10 <= 5, k = down ? n % 10 : 10 - (n % 10), r = down ? n - k : n + k, o = down ? n + k : n - k;
    return [
      `Zum nächsten Zehner: ${n} ist ${k} ${down ? 'über' : 'unter'} ${r}`,
      `${n}² = ${r} × ${o} + ${k}²`,
      `${r} × ${o} = ${fmt(r * o)}, ${k}² = ${k * k}`,
      `${fmt(r * o)} + ${k * k} = ${fmt(res)}`,
    ];
  },
};
