// Kettenrechnen: Startzahl + Folge von Operationen, alle Zwischenergebnisse ganzzahlig und ≥ 1
import type { ChainOp, ChainTask, Level } from '../types.ts';
import { randInt, pick } from './numbers.ts';
import type { Rng } from './numbers.ts';
import { shuffle } from './generators/helpers.ts';

const STEPS: Record<Level, number> = { 1: 5, 2: 7, 3: 9 };
const CAP: Record<Level, number> = { 1: 60, 2: 120, 3: 400 };

function apply(cur: number, op: ChainOp, v: number): number {
  return op === '+' ? cur + v : op === '−' ? cur - v : op === '×' ? cur * v : cur / v;
}

function tryBuild(level: Level, rng: Rng): ChainTask | null {
  const n = STEPS[level];
  const start = level === 1 ? randInt(2, 9, rng) : level === 2 ? randInt(3, 15, rng) : randInt(8, 40, rng);
  const maxAdd = level === 3 ? 12 : 9;
  const ops: ChainOp[] = level === 1 ? ['+', '−'] : level === 2 ? ['+', '−', '+', '−', '×'] : ['+', '−', '×', '÷', '÷'];
  const steps: ChainTask['steps'] = [];
  let cur = start;
  for (let i = 0; i < n; i++) {
    const options = shuffle(ops, rng);
    let chosen: { op: ChainOp; value: number } | null = null;
    for (const op of options) {
      const cands: number[] = [];
      for (let v = op === '×' || op === '÷' ? 2 : 1; v <= (op === '×' || op === '÷' ? 9 : maxAdd); v++) {
        const next = apply(cur, op, v);
        if (!Number.isInteger(next) || next < 1 || next > CAP[level]) continue;
        if (op === '÷' && v > cur) continue;
        cands.push(v);
      }
      if (cands.length) { chosen = { op, value: pick(cands, rng) }; break; }
    }
    if (!chosen) return null;
    steps.push(chosen);
    cur = apply(cur, chosen.op, chosen.value);
  }
  const has = (op: ChainOp): boolean => steps.some((s) => s.op === op);
  if (level >= 2 && !has('×')) return null;
  if (level === 3 && !has('÷')) return null;
  return { start, steps, result: cur };
}

export function chainTask(level: Level, rng: Rng = Math.random): ChainTask {
  const L: Level = level === 1 || level === 3 ? level : 2;
  for (let i = 0; i < 200; i++) {
    const t = tryBuild(L, rng);
    if (t) return t;
  }
  // Notfall-Kette (praktisch unerreichbar)
  const steps: ChainTask['steps'] = [{ op: '+', value: 2 }, { op: '×', value: 3 }, { op: '−', value: 4 }, { op: '÷', value: 2 }, { op: '+', value: 5 }];
  return { start: 4, steps, result: 12 };
}

export function chainStepLabel(step: { op: ChainOp; value: number }): string {
  return `${step.op} ${step.value}`;
}
