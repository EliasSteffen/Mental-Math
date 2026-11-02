// Vorhersage-Modelle: „Wie wahrscheinlich ist die nächste Antwort zu diesem Aufgabentyp richtig?“ – nur aus der
// Vorgeschichte. Das ist der objektive Prüfstein für jedes Lernstand-Modell: Wer den Lernstand besser kennt, sagt die
// nächste Antwort besser voraus. Neue Modelle (BKT, logistische Regression, …) implementieren dieselbe Schnittstelle.
import type { Observation } from '../types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from '../config.ts';
import { credit } from '../skill.ts';
import { logit, sigmoid } from './rng.ts';

/** Online-Modell: erst predict (ohne das Ergebnis zu kennen), dann update mit der tatsächlichen Antwort. */
export interface Predictor {
  readonly name: string;
  predict(next: Observation): number;
  update(observation: Observation): void;
}
export type PredictorFactory = () => Predictor;

/** Gleitende Gesamtquote mit Laplace-Glättung – das, was jedes Modell mindestens schlagen muss. */
export function baseRate(): PredictorFactory {
  return () => {
    let right = 0;
    let n = 0;
    return {
      name: 'base-rate',
      predict: () => (right + 1) / (n + 2),
      update: (o) => { n++; if (o.correct) right++; },
    };
  };
}

/**
 * Das Modell der App: Genauigkeit der letzten `window` Antworten je Aufgabentyp, bei wenig Daten zur Gesamtquote hin
 * geglättet (`prior` Pseudo-Antworten). Hilfe zählt anteilig wie im Skill.
 */
export function windowAccuracy({ cfg = DEFAULT_CONFIG, prior = 2 }: { cfg?: EngineConfig; prior?: number } = {}): PredictorFactory {
  return () => {
    const hist = new Map<string, number[]>();
    let right = 0;
    let n = 0;
    return {
      name: `window(${cfg.window})`,
      predict: (o) => {
        const g = (right + 1) / (n + 2);
        const h = (hist.get(o.subtype) ?? []).slice(-cfg.window);
        return (h.reduce((a, b) => a + b, 0) + prior * g) / (h.length + prior);
      },
      update: (o) => {
        const h = hist.get(o.subtype) ?? [];
        h.push(credit(o, cfg));
        if (h.length > cfg.window) h.shift();
        hist.set(o.subtype, h);
        n++; if (o.correct) right++;
      },
    };
  };
}

/**
 * Elo-artiges Modell: ein Können θ je Aufgabentyp (Logit), Start bei der Gesamtquote; nach jeder Antwort
 * θ += k · (Ergebnis − Vorhersage). Mit `levelWeight` macht eine höhere Stufe die Aufgabe schwerer.
 * k ist der wichtigste Parameter zum Trainieren (klein = träge, groß = sprunghaft).
 */
export function elo({ k = 0.3, levelWeight = 0 }: { k?: number; levelWeight?: number } = {}): PredictorFactory {
  return () => {
    const theta = new Map<string, number>();
    let right = 0;
    let n = 0;
    const offset = (o: Observation): number => levelWeight * ((o.level ?? 2) - 2);
    const thetaOf = (o: Observation): number => theta.get(o.subtype) ?? logit((right + 1) / (n + 2));
    return {
      name: `elo(k=${k}${levelWeight ? `, level=${levelWeight}` : ''})`,
      predict: (o) => sigmoid(thetaOf(o) - offset(o)),
      update: (o) => {
        const p = sigmoid(thetaOf(o) - offset(o));
        theta.set(o.subtype, thetaOf(o) + k * ((o.correct ? 1 : 0) - p));
        n++; if (o.correct) right++;
      },
    };
  };
}
