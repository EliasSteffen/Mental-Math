// Replay: echte (oder simulierte) Antworten in zeitlicher Reihenfolge abspielen und messen, wie gut ein Modell die
// jeweils nächste vorhersagt. Mit Zeit-Split (vorne trainieren, hinten prüfen) lassen sich Parameter fair anpassen.
import type { Observation } from '../types.ts';
import { probabilityScore, type Prediction, type ProbabilityScore } from './metrics.ts';
import type { PredictorFactory } from './predictors.ts';

export interface ReplayRange {
  /** erst ab diesem Index bewerten (davor nur lernen) */
  from?: number;
  /** nur bis vor diesen Index bewerten und abspielen */
  to?: number;
}

export interface ReplayReport extends ProbabilityScore { model: string }

/** Spielt die Antworten (zeitlich sortiert erwartet) ab; das Modell sieht jede erst nach seiner Vorhersage. */
export function replay(observations: readonly Observation[], factory: PredictorFactory, { from = 0, to = observations.length }: ReplayRange = {}): ReplayReport {
  const model = factory();
  const preds: Prediction[] = [];
  for (let i = 0; i < Math.min(to, observations.length); i++) {
    const o = observations[i]!;
    const p = model.predict(o);
    if (i >= from) preds.push({ p, y: o.correct ? 1 : 0 });
    model.update(o);
  }
  return { model: model.name, ...probabilityScore(preds) };
}

export interface SplitReport {
  /** Index, ab dem geprüft wird */
  splitAt: number;
  /** Kandidat mit dem kleinsten Log-Loss auf dem Trainingsteil */
  best: string;
  train: ReplayReport[];
  test: ReplayReport[];
}

/**
 * Zeit-Split: Alle Kandidaten auf dem vorderen Teil (`trainShare`) bewerten, den besten wählen und alle auf dem hinteren
 * Teil prüfen (das Modell darf dort weiterlernen, wird aber erst ab dem Split bewertet). So passt man z. B. k an echten
 * Daten an, ohne sich auf den Prüfdaten selbst zu betrügen.
 */
export function trainTestSplit(observations: readonly Observation[], candidates: readonly PredictorFactory[], trainShare = 0.7): SplitReport {
  const splitAt = Math.floor(observations.length * trainShare);
  const train = candidates.map((f) => replay(observations, f, { to: splitAt }));
  const test = candidates.map((f) => replay(observations, f, { from: splitAt }));
  const best = [...train].sort((a, b) => a.logLoss - b.logLoss)[0]?.model ?? '';
  return { splitAt, best, train, test };
}
