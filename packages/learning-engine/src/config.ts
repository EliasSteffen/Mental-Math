// Alle Stellschrauben des Modells an einer Stelle. Die Standardwerte entsprechen exakt dem Verhalten der App bis 1.15;
// das Labor (learning-engine/lab) vergleicht und sucht andere Werte, ohne dass die App sich ändert.

export interface EngineConfig {
  /** Gleitendes Fenster: so viele letzte Antworten je Aufgabentyp/Kategorie fließen in den Skill */
  window: number;
  /** Fenster für den Gesamt-Skill über alle Aufgabentypen */
  overallWindow: number;
  /** Mindestzahl Antworten für einen Score (darunter score = null) */
  minAttempts: number;
  /** Gewicht der Genauigkeit im Score (0..1) */
  accuracyWeight: number;
  /** Gewicht des Tempos im Score (0..1); beide Gewichte zusammen ergeben 1 */
  speedWeight: number;
  /** So viel zählt eine richtige Antwort mit Hilfe (0..1) */
  assistedCredit: number;
  /** Adaptive Stufe: ab diesem Score Stufe 2 */
  level2Score: number;
  /** Adaptive Stufe: ab diesem Score Stufe 3 */
  level3Score: number;
  /** Unter diesem Score ist ein Aufgabentyp eine Schwäche */
  deficitScore: number;
  /** So viele Nullen-Fehler im Fenster → Diagnose „nullen“ */
  zeroErrorMin: number;
  /** Genauigkeit unter diesem Wert → „ungenau“, sonst „langsam“ */
  accuracyFloor: number;
  /** Leitner-Intervalle in Tagen je Box; wer die letzte Box besteht, fällt aus der Wiederholung */
  reviewIntervalsDays: readonly number[];
}

export const DEFAULT_CONFIG: Readonly<EngineConfig> = Object.freeze({
  window: 25,
  overallWindow: 100,
  minAttempts: 3,
  accuracyWeight: 0.7,
  speedWeight: 0.3,
  assistedCredit: 0.5,
  level2Score: 60,
  level3Score: 85,
  deficitScore: 85,
  zeroErrorMin: 2,
  accuracyFloor: 0.8,
  reviewIntervalsDays: Object.freeze([1, 2, 4, 7, 14]),
});

/** Standardwerte mit einzelnen Abweichungen; prüft Wertebereiche, damit ein Tuning-Lauf nicht still Unsinn rechnet. */
export function resolveConfig(patch: Partial<EngineConfig> = {}): EngineConfig {
  const cfg: EngineConfig = { ...DEFAULT_CONFIG, ...patch };
  const int = (k: 'window' | 'overallWindow' | 'minAttempts' | 'zeroErrorMin'): void => {
    if (!Number.isInteger(cfg[k]) || cfg[k] < 1) throw new RangeError(`${k} muss eine ganze Zahl ≥ 1 sein`);
  };
  const unit = (k: 'accuracyWeight' | 'speedWeight' | 'assistedCredit' | 'accuracyFloor'): void => {
    if (!(cfg[k] >= 0 && cfg[k] <= 1)) throw new RangeError(`${k} muss zwischen 0 und 1 liegen`);
  };
  const score = (k: 'level2Score' | 'level3Score' | 'deficitScore'): void => {
    if (!(cfg[k] >= 0 && cfg[k] <= 100)) throw new RangeError(`${k} muss zwischen 0 und 100 liegen`);
  };
  int('window'); int('overallWindow'); int('minAttempts'); int('zeroErrorMin');
  unit('accuracyWeight'); unit('speedWeight'); unit('assistedCredit'); unit('accuracyFloor');
  if (Math.abs(cfg.accuracyWeight + cfg.speedWeight - 1) > 1e-9) throw new RangeError('accuracyWeight + speedWeight muss 1 ergeben');
  score('level2Score'); score('level3Score'); score('deficitScore');
  if (cfg.level2Score > cfg.level3Score) throw new RangeError('level2Score darf nicht über level3Score liegen');
  if (cfg.reviewIntervalsDays.length === 0 || !cfg.reviewIntervalsDays.every((d) => d > 0)) {
    throw new RangeError('reviewIntervalsDays braucht mindestens ein Intervall > 0');
  }
  return cfg;
}
