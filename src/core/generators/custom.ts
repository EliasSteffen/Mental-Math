// Eigenes Training: frei wählbare Zahlenbereiche (custom.mul, custom.square)
import type { CustomRange, Task } from '../../types.ts';
import { randInt } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task } from './helpers.ts';

const DEFAULT_MUL: CustomRange = { kind: 'mul', aMin: 2, aMax: 9, bMin: 2, bMax: 9 };
const DEFAULT_SQUARE: CustomRange = { kind: 'square', aMin: 11, aMax: 20 };

const LIMIT = 9999;
function bounds(lo: unknown, hi: unknown, fallLo: number, fallHi: number): [number, number] {
  const f = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(LIMIT, Math.max(1, Math.round(x))) : d);
  const a = f(lo, fallLo), b = f(hi, fallHi);
  return a <= b ? [a, b] : [b, a];
}

/** Aufgabe für custom.mul / custom.square; fehlender oder unpassender Bereich → Standardbereich */
export function customTask(id: string, rng: Rng, range?: CustomRange): Task {
  if (id === 'custom.square') {
    const r = range?.kind === 'square' ? range : DEFAULT_SQUARE;
    const [lo, hi] = bounds(r.aMin, r.aMax, DEFAULT_SQUARE.aMin, DEFAULT_SQUARE.aMax);
    const n = randInt(lo, hi, rng);
    return task('custom.square', { params: { n }, prompt: `${n}²`, expected: n * n });
  }
  const r = range?.kind === 'mul' ? range : DEFAULT_MUL;
  const [aLo, aHi] = bounds(r.aMin, r.aMax, 2, 9);
  const [bLo, bHi] = bounds(r.bMin, r.bMax, 2, 9);
  const a = randInt(aLo, aHi, rng);
  const b = randInt(bLo, bHi, rng);
  return task('custom.mul', { params: { a, b }, prompt: `${a} × ${b}`, expected: a * b });
}
