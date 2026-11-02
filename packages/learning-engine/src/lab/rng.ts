// Reproduzierbarer Zufall für Simulationen: gleicher Seed → gleiche Lernenden, gleiche Antworten, gleiche Kennzahlen.

export type Rng = () => number;

/** Kleiner, schneller 32-Bit-PRNG (Werte in [0, 1)). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uniform = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** Standardnormalverteilt (Box-Muller). */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  const u = Math.max(rng(), 1e-12);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  const v = list[Math.floor(rng() * list.length)];
  if (v === undefined) throw new RangeError('pick: leere Liste');
  return v;
}

/** k verschiedene Elemente (Fisher-Yates auf einer Kopie). */
export function sample<T>(rng: Rng, list: readonly T[], k: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a.slice(0, k);
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const logit = (p: number): number => Math.log(p / (1 - p));
