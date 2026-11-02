// Kennzahlen: Treffergüte der Schwächen-Erkennung und Güte von Wahrscheinlichkeits-Vorhersagen.

export interface Confusion { tp: number; fp: number; fn: number }

export interface DetectionScore extends Confusion {
  precision: number;
  recall: number;
  f1: number;
}

export function detectionScore({ tp, fp, fn }: Confusion): DetectionScore {
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

/** Vorhersage p für ein Ereignis y (1 = richtig beantwortet). */
export interface Prediction { p: number; y: 0 | 1 }

export interface CalibrationBin { lo: number; hi: number; n: number; meanP: number; rate: number }

export interface ProbabilityScore {
  n: number;
  /** mittlerer quadratischer Fehler (0 = perfekt, 0,25 = Münzwurf) */
  brier: number;
  /** mittlerer negativer Log-Likelihood (kleiner = besser; ln 2 ≈ 0,693 = Münzwurf) */
  logLoss: number;
  /** Trennschärfe (0,5 = Zufall, 1 = perfekt); null ohne beide Klassen */
  auc: number | null;
  /** Anteil richtiger Ja/Nein-Vorhersagen bei Schwelle 0,5 */
  accuracy: number;
  /** tatsächliche Quote je Vorhersage-Bereich (Kalibrierung) */
  calibration: CalibrationBin[];
}

const EPS = 1e-4;
const clampP = (p: number): number => Math.min(1 - EPS, Math.max(EPS, p));

/** AUC über Rangsummen (Mann-Whitney), Bindungen gemittelt. */
export function auc(preds: readonly Prediction[]): number | null {
  const pos = preds.filter((x) => x.y === 1).length;
  const neg = preds.length - pos;
  if (!pos || !neg) return null;
  const sorted = [...preds].sort((a, b) => a.p - b.p);
  let rankSum = 0;
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.p === sorted[i]!.p) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (sorted[k]!.y === 1) rankSum += rank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function probabilityScore(preds: readonly Prediction[], bins = 10): ProbabilityScore {
  const n = preds.length;
  if (n === 0) return { n: 0, brier: 0, logLoss: 0, auc: null, accuracy: 0, calibration: [] };
  let brier = 0;
  let logLoss = 0;
  let hits = 0;
  const acc = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, sumY: 0 }));
  for (const { p, y } of preds) {
    const q = clampP(p);
    brier += (p - y) ** 2;
    logLoss -= y ? Math.log(q) : Math.log(1 - q);
    if ((p >= 0.5 ? 1 : 0) === y) hits++;
    const b = acc[Math.min(bins - 1, Math.floor(p * bins))]!;
    b.n++; b.sumP += p; b.sumY += y;
  }
  return {
    n,
    brier: brier / n,
    logLoss: logLoss / n,
    auc: auc(preds),
    accuracy: hits / n,
    calibration: acc.map((b, i) => ({
      lo: i / bins, hi: (i + 1) / bins, n: b.n, meanP: b.n ? b.sumP / b.n : 0, rate: b.n ? b.sumY / b.n : 0,
    })).filter((b) => b.n > 0),
  };
}

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
