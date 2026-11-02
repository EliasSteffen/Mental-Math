// Simulationen mit synthetischen Lernenden:
// 1. Erkennung: Findet findDeficits die eingepflanzten Schwächen – und wie schnell, mit welcher Diagnose?
// 2. Strategie: Wird man schneller besser, wenn man den Empfehlungen (nextStep) folgt, statt gemischt zu üben?
import type { Catalog, DeficitReason, Level, Observation, Reviews } from '../types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from '../config.ts';
import { levelFromScore, skillStats } from '../skill.ts';
import { findDeficits } from '../deficits.ts';
import { recordResult } from '../review.ts';
import { nextStep } from '../recommend.ts';
import { syntheticCatalog } from './catalog.ts';
import { answer, randomLearner, trueScore, type Learner, type LearnerOptions } from './learner.ts';
import { detectionScore, mean, type Confusion, type DetectionScore } from './metrics.ts';
import { mulberry32, pick, type Rng } from './rng.ts';

const T0 = Date.UTC(2026, 0, 5, 7); // Montag, 8 Uhr MEZ
const DAY = 86_400_000;
const REASONS: readonly DeficitReason[] = ['ungenau', 'langsam', 'nullen'];

/** Verlauf je Aufgabentyp mitführen, damit die adaptive Stufe nicht jedes Mal die ganze Historie filtert. */
class History {
  readonly all: Observation[] = [];
  private readonly by = new Map<string, Observation[]>();
  private readonly cfg: EngineConfig;
  constructor(cfg: EngineConfig) { this.cfg = cfg; }
  level(subtype: string): Level {
    return levelFromScore(skillStats(this.by.get(subtype) ?? [], this.cfg).score, this.cfg);
  }
  push(o: Observation): void {
    this.all.push(o);
    const l = this.by.get(o.subtype);
    if (l) l.push(o);
    else this.by.set(o.subtype, [o]);
  }
}

/* ---------- 1. Erkennung ---------- */

export interface DetectionOptions {
  catalog?: Catalog;
  learners?: number;
  /** Prüfzeitpunkte: Ø Antworten je Aufgabentyp (gemischtes Üben, Typ jeweils zufällig) */
  checkpoints?: readonly number[];
  seed?: number;
  learner?: LearnerOptions;
  cfg?: EngineConfig;
}

export interface DetectionCheckpoint {
  /** Ø Antworten je Aufgabentyp bis hierher */
  perSubtype: number;
  /** alle gemeldeten Schwächen gegen die eingepflanzten */
  overall: DetectionScore;
  /** Anteil der richtig erkannten mit richtiger Diagnose */
  reasonAccuracy: number;
  /** Trefferquote je eingepflanzter Art */
  recallByReason: Record<DeficitReason, number>;
  /** Anteil echter Schwächen unter den Top 3 (das, was die App zeigt) */
  top3Precision: number;
}

export interface DetectionReport { learners: number; subtypes: number; checkpoints: DetectionCheckpoint[] }

export function simulateDetection({
  catalog = syntheticCatalog(), learners = 60, checkpoints = [5, 10, 15, 25], seed = 1, learner = {}, cfg = DEFAULT_CONFIG,
}: DetectionOptions = {}): DetectionReport {
  const rng = mulberry32(seed);
  const ids = Object.keys(catalog);
  const sorted = [...checkpoints].sort((a, b) => a - b);
  const acc = sorted.map(() => ({
    c: { tp: 0, fp: 0, fn: 0 } as Confusion, reasonOk: 0,
    byReason: Object.fromEntries(REASONS.map((r) => [r, { hit: 0, n: 0 }])) as Record<DeficitReason, { hit: number; n: number }>,
    top: { hit: 0, n: 0 },
  }));

  for (let l = 0; l < learners; l++) {
    // Statische Person: lernt nicht, damit die Wahrheit über die ganze Simulation gilt
    const person = randomLearner(rng, catalog, l, { ...learner, learningRate: 0, paceGain: 0, zeroFix: 0, forgetPerDay: 0 });
    const hist = new History(cfg);
    let ts = T0;
    let done = 0;
    sorted.forEach((perSubtype, ci) => {
      for (; done < perSubtype * ids.length; done++) {
        const subtype = pick(rng, ids);
        hist.push(answer(person, subtype, hist.level(subtype), ts, rng));
        ts += 20_000;
      }
      const a = acc[ci]!;
      const found = findDeficits(hist.all, { catalog, limit: Infinity }, cfg);
      const foundIds = new Set(found.map((d) => d.subtype));
      for (const d of found) {
        const truth = person.injected[d.subtype];
        if (truth) { a.c.tp++; if (truth === d.reason) a.reasonOk++; } else a.c.fp++;
      }
      for (const [s, reason] of Object.entries(person.injected)) {
        a.byReason[reason].n++;
        if (foundIds.has(s)) a.byReason[reason].hit++;
        else a.c.fn++;
      }
      for (const d of found.slice(0, 3)) { a.top.n++; if (person.injected[d.subtype]) a.top.hit++; }
    });
  }

  return {
    learners,
    subtypes: ids.length,
    checkpoints: sorted.map((perSubtype, i) => {
      const a = acc[i]!;
      return {
        perSubtype,
        overall: detectionScore(a.c),
        reasonAccuracy: a.c.tp ? a.reasonOk / a.c.tp : 0,
        recallByReason: Object.fromEntries(REASONS.map((r) => [r, a.byReason[r].n ? a.byReason[r].hit / a.byReason[r].n : 1])) as Record<DeficitReason, number>,
        top3Precision: a.top.n ? a.top.hit / a.top.n : 1,
      };
    }),
  };
}

/* ---------- 2. Strategie ---------- */

/**
 * - `recommended`: jede Runde der Empfehlung folgen (Wiederholung → Schwäche → Neues → gemischt), wie der Startknopf der App
 * - `weak-mode`: Modus „Schwächen trainieren“ (Top 3), ohne Schwächen gemischt
 * - `mixed`: immer gemischt über alle Aufgabentypen
 */
export type Policy = 'recommended' | 'weak-mode' | 'mixed';
export const POLICIES: readonly Policy[] = ['recommended', 'weak-mode', 'mixed'];

export interface PolicyOptions {
  policy: Policy;
  catalog?: Catalog;
  learners?: number;
  days?: number;
  sessionsPerDay?: number;
  sessionLength?: number;
  seed?: number;
  /** Lernverhalten der Personen (Standard: lernt, vergisst langsam) */
  learner?: LearnerOptions;
  cfg?: EngineConfig;
}

export interface PolicyReport {
  policy: Policy;
  /** Ø wahrer Score der anfangs schwachen Aufgabentypen: vorher → nachher */
  deficitScoreBefore: number;
  deficitScoreAfter: number;
  /** Anteil der anfangs schwachen Typen, die am Ende noch unter der Schwelle liegen */
  stillDeficient: number;
  /** Ø wahrer Score über alle Aufgabentypen am Ende */
  overallScoreAfter: number;
  /** Anteil der Antworten auf anfangs schwache Typen */
  deficitPracticeShare: number;
}

export const DEFAULT_LEARNING: Readonly<LearnerOptions> = { learningRate: 0.08, paceGain: 0.012, zeroFix: 0.15, forgetPerDay: 0.02 };

function poolFor(policy: Policy, hist: History, reviews: Reviews, now: number, catalog: Catalog, cfg: EngineConfig): { pool: string[]; isReview: boolean } {
  const all = Object.keys(catalog);
  if (policy === 'mixed') return { pool: all, isReview: false };
  if (policy === 'weak-mode') {
    const weak = findDeficits(hist.all, { catalog }, cfg).map((d) => d.subtype);
    return { pool: weak.length ? weak : all, isReview: false };
  }
  const cats = [...new Set(Object.values(catalog).map((e) => e.category))];
  const step = nextStep(hist.all, reviews, now, { catalog, newCategories: cats }, cfg);
  switch (step.kind) {
    case 'review': return { pool: step.due.map((d) => d.subtype), isReview: true };
    case 'weak': return { pool: [step.deficit.subtype], isReview: false };
    case 'new': return { pool: [step.subtype], isReview: false };
    case 'mixed': return { pool: all, isReview: false };
  }
}

function runLearner(person: Learner, policy: Policy, rng: Rng, o: Required<Pick<PolicyOptions, 'days' | 'sessionsPerDay' | 'sessionLength'>>, cfg: EngineConfig): number {
  const hist = new History(cfg);
  let reviews: Reviews = {};
  let onDeficit = 0;
  for (let day = 0; day < o.days; day++) {
    for (let s = 0; s < o.sessionsPerDay; s++) {
      let ts = T0 + day * DAY + s * 6 * 3_600_000;
      const { pool, isReview } = poolFor(policy, hist, reviews, ts, person.catalog, cfg);
      for (let i = 0; i < o.sessionLength; i++) {
        const subtype = pick(rng, pool);
        if (person.injected[subtype]) onDeficit++;
        const obs = { ...answer(person, subtype, hist.level(subtype), ts, rng), isReview };
        hist.push(obs);
        reviews = recordResult(reviews, { subtype, correct: obs.correct, ts, isReview }, cfg);
        ts += 20_000;
      }
    }
  }
  return onDeficit / Math.max(1, hist.all.length);
}

export function simulatePolicy({
  policy, catalog = syntheticCatalog(), learners = 40, days = 21, sessionsPerDay = 2, sessionLength = 10, seed = 7,
  learner = DEFAULT_LEARNING, cfg = DEFAULT_CONFIG,
}: PolicyOptions): PolicyReport {
  // Gleicher Seed → für jede Strategie dieselben Personen (fairer Vergleich)
  const rng = mulberry32(seed);
  const before: number[] = [];
  const after: number[] = [];
  const overall: number[] = [];
  const share: number[] = [];
  let still = 0;
  let injectedTotal = 0;
  for (let l = 0; l < learners; l++) {
    const person = randomLearner(rng, catalog, l, learner);
    const weak = Object.keys(person.injected);
    before.push(...weak.map((s) => trueScore(person, s)));
    share.push(runLearner(person, policy, mulberry32(seed * 1000 + l), { days, sessionsPerDay, sessionLength }, cfg));
    for (const s of weak) {
      const sc = trueScore(person, s);
      after.push(sc);
      if (sc < cfg.deficitScore) still++;
    }
    injectedTotal += weak.length;
    overall.push(mean(Object.keys(catalog).map((s) => trueScore(person, s))));
  }
  return {
    policy,
    deficitScoreBefore: mean(before),
    deficitScoreAfter: mean(after),
    stillDeficient: injectedTotal ? still / injectedTotal : 0,
    overallScoreAfter: mean(overall),
    deficitPracticeShare: mean(share),
  };
}
