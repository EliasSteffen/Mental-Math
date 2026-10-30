// Paralleles Kettenrechnen: reine Logik (Multi-Chain Working Memory)
import type {
  ChainOp, Level, ParallelChain, ParallelChainResult, ParallelConfig, ParallelEvent, ParallelResult,
  ParallelState, ParallelStats,
} from '../types.ts';

export const CHAIN_IDS = ['A', 'B', 'C', 'D'] as const;

export const DEFAULT_PARALLEL_CONFIG: ParallelConfig = {
  level: 1, intervalMs: 4000, durationMs: 45000, startChains: 2, maxChains: 4, stepsPerChain: 10, addChainEvery: 5,
};

type Rng = () => number;
const MAX_TOTAL = 999;
const MUL_LIMIT = 500;

const randInt = (min: number, max: number, rng: Rng): number => min + Math.floor(rng() * (max - min + 1));

function newChain(index: number, rng: Rng): ParallelChain {
  const start = randInt(2, 20, rng);
  return { id: CHAIN_IDS[index] ?? String(index), currentTotal: start, history: [`Start ${start}`] };
}

export function createParallelState(config: ParallelConfig, rng: Rng = Math.random): ParallelState {
  const chains: ParallelChain[] = [];
  for (let i = 0; i < config.startChains; i++) chains.push(newChain(i, rng));
  return {
    phase: 'stream', config: { ...config }, chains, elapsedMs: 0, remainingMs: config.durationMs,
    nextEventAt: config.intervalMs, eventCount: 0, lastEvent: null, inputIndex: 0, answers: [],
  };
}

export function nextOp(total: number, level: Level, rng: Rng = Math.random): { op: ChainOp; value: number } {
  const cands: Array<{ op: ChainOp; value: number }> = [];
  for (let v = 1; v <= 9; v++) {
    if (total + v <= MAX_TOTAL) cands.push({ op: '+', value: v });
    if (total - v >= 1) cands.push({ op: '−', value: v });
  }
  if (level >= 2) {
    const maxMul = level >= 3 ? 5 : 3;
    for (let v = 2; v <= maxMul; v++) if (total * v <= MUL_LIMIT) cands.push({ op: '×', value: v });
  }
  if (level >= 3) {
    for (let v = 2; v <= 9; v++) if (total % v === 0 && total / v >= 1) cands.push({ op: '÷', value: v });
  }
  let pool = cands;
  if (total > 150) {
    const down = cands.filter((c) => c.op === '−' || c.op === '÷');
    if (down.length > 0) pool = down;
  }
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx] ?? { op: '+', value: 1 };
}

export function applyOp(total: number, op: ChainOp, value: number): number {
  switch (op) {
    case '+': return total + value;
    case '−': return total - value;
    case '×': return total * value;
    case '÷': return total / value;
  }
}

export function opLabel(op: ChainOp, value: number): string {
  return `${op} ${value}`;
}

const chainSteps = (c: ParallelChain): number => c.history.length - 1;

export interface TickResult { state: ParallelState; event: ParallelEvent | null; addedChain: ParallelChain | null; ended: boolean }

/** elapsedMs = Zeit seit Stream-Start (absolut). Höchstens ein Event pro Aufruf. */
/**
 * Wählt die nächste Kette: nie zweimal dieselbe hintereinander (wenn es Alternativen gibt),
 * Ketten mit weniger Schritten werden bevorzugt (Gewicht 1/(Schritte+1)²) – so bleiben
 * später hinzugekommene Ketten nicht zurück.
 */
function pickTarget(open: ParallelChain[], lastId: string | null, rng: Rng): ParallelChain | undefined {
  const pool = open.length > 1 ? open.filter((c) => c.id !== lastId) : open;
  const weights = pool.map((c) => 1 / (chainSteps(c) + 1) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function tick(state: ParallelState, elapsedMs: number, rng: Rng = Math.random): TickResult {
  if (state.phase !== 'stream') return { state, event: null, addedChain: null, ended: false };
  const cfg = state.config;
  let chains = state.chains;
  let event: ParallelEvent | null = null;
  let addedChain: ParallelChain | null = null;
  let eventCount = state.eventCount;
  let nextEventAt = state.nextEventAt;
  let lastEvent = state.lastEvent;

  if (elapsedMs >= state.nextEventAt && state.nextEventAt < cfg.durationMs) {
    const open = chains.filter((c) => chainSteps(c) < cfg.stepsPerChain);
    const target = pickTarget(open, state.lastEvent?.chainId ?? null, rng);
    if (target) {
      const { op, value } = nextOp(target.currentTotal, cfg.level, rng);
      const label = opLabel(op, value);
      event = { chainId: target.id, op, value, label, at: state.nextEventAt };
      lastEvent = event;
      chains = chains.map((c) => c === target
        ? { ...c, currentTotal: applyOp(c.currentTotal, op, value), history: [...c.history, label] }
        : { ...c, history: [...c.history] });
      eventCount += 1;
      nextEventAt += cfg.intervalMs;
      if (eventCount % cfg.addChainEvery === 0 && chains.length < cfg.maxChains) {
        addedChain = newChain(chains.length, rng);
        chains = [...chains, addedChain];
      }
    }
  }

  const timeUp = elapsedMs >= cfg.durationMs;
  const allDone = chains.every((c) => chainSteps(c) >= cfg.stepsPerChain);
  const ended = timeUp || allDone;
  const next: ParallelState = {
    ...state, chains, eventCount, nextEventAt, lastEvent,
    elapsedMs, remainingMs: Math.max(0, cfg.durationMs - elapsedMs),
  };
  if (ended) {
    next.phase = 'input';
    next.inputIndex = 0;
    next.answers = chains.map(() => null);
  }
  return { state: next, event, addedChain, ended };
}

export function submitAnswer(state: ParallelState, value: number | null): ParallelState {
  if (state.phase !== 'input') return state;
  const answers = [...state.answers];
  while (answers.length < state.chains.length) answers.push(null);
  answers[state.inputIndex] = value;
  const inputIndex = state.inputIndex + 1;
  const done = inputIndex >= state.chains.length;
  return { ...state, answers, inputIndex: done ? state.chains.length : inputIndex, phase: done ? 'result' : 'input' };
}

/** Zwischensummen aus den Labels (inkl. Start). */
export function replayTotals(history: string[]): number[] {
  const totals: number[] = [];
  let cur = 0;
  for (const label of history) {
    const m = /^Start (-?\d+)$/.exec(label);
    if (m) {
      cur = Number(m[1]);
    } else {
      const parts = label.split(' ');
      const op = parts[0] as ChainOp;
      cur = applyOp(cur, op, Number(parts[1]));
    }
    totals.push(cur);
  }
  return totals;
}

const CHAIN_FACTOR: Record<number, number> = { 2: 1, 3: 1.5, 4: 2 };

export function scoreParallel(state: ParallelState): ParallelResult {
  const total = state.chains.length;
  const factor = CHAIN_FACTOR[total] ?? (total >= 4 ? 2 : 1);
  const chains: ParallelChainResult[] = state.chains.map((c, i) => {
    const given = state.answers[i] ?? null;
    return {
      id: c.id, expected: c.currentTotal, given, correct: given !== null && given === c.currentTotal,
      history: [...c.history], totals: replayTotals(c.history),
    };
  });
  const correct = chains.filter((c) => c.correct).length;
  let points = 0;
  for (const c of chains) if (c.correct) points += Math.round(100 * factor) + 5 * (c.history.length - 1);
  return { chains, correct, total, allCorrect: total > 0 && correct === total, points };
}

export function updateParallelStats(stats: ParallelStats, result: ParallelResult, currentStreak: number): ParallelStats {
  let nextStart = stats.nextStart;
  if (result.allCorrect) nextStart = Math.min(4, nextStart + 1) as 2 | 3 | 4;
  else if (result.correct < result.total / 2) nextStart = Math.max(2, nextStart - 1) as 2 | 3 | 4;
  return {
    nextStart,
    bestChains: result.allCorrect ? Math.max(stats.bestChains, result.total) : stats.bestChains,
    bestCorrectStreak: Math.max(stats.bestCorrectStreak, currentStreak),
    rounds: stats.rounds + 1,
  };
}
