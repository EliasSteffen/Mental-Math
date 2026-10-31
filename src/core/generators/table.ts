import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task } from './helpers.ts';
import type { Gen } from './helpers.ts';

// Kleines 1×1: L1 Kernreihen (2, 3, 4, 5, 10) × 1–10 · L2 2–9 × 2–9 · L3 die „schweren“ Reihen 6–9 × 3–9
function factors(rng: Rng, L: Level): [number, number] {
  const a = L === 1 ? pick([2, 3, 4, 5, 10], rng) : L === 3 ? randInt(6, 9, rng) : randInt(2, 9, rng);
  const b = L === 1 ? randInt(1, 10, rng) : L === 3 ? randInt(3, 9, rng) : randInt(2, 9, rng);
  return rng() < 0.5 ? [a, b] : [b, a];
}

export const tableGen: Record<string, Gen> = {
  'table.mul': (rng: Rng, L: Level): Task => {
    const [a, b] = factors(rng, L);
    return task('table.mul', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
  },
  'table.div': (rng: Rng, L: Level): Task => {
    const [a, b] = factors(rng, L);
    return task('table.div', { params: { a, b, n: a * b }, prompt: `${fmt(a * b)} ÷ ${fmt(a)}`, expected: b });
  },
};
