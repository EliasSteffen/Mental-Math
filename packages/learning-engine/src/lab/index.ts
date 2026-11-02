// learning-engine/lab: das Modell getrennt von der App trainieren und testen – Simulation mit bekannter Wahrheit,
// Replay echter Daten (Export der App), Kennzahlen und Raster-Suche. Nicht für die App gedacht (nicht im Bundle).
export { mulberry32, normal, uniform, pick, sample, sigmoid, logit } from './rng.ts';
export type { Rng } from './rng.ts';
export { syntheticCatalog, catalogFromObservations, loadObservations } from './catalog.ts';
export { randomLearner, answer, trueP, trueScore } from './learner.ts';
export type { Learner, LearnerOptions, SkillTruth } from './learner.ts';
export { detectionScore, probabilityScore, auc, mean } from './metrics.ts';
export type { Confusion, DetectionScore, Prediction, ProbabilityScore, CalibrationBin } from './metrics.ts';
export { baseRate, windowAccuracy, elo } from './predictors.ts';
export type { Predictor, PredictorFactory } from './predictors.ts';
export { replay, trainTestSplit } from './replay.ts';
export type { ReplayRange, ReplayReport, SplitReport } from './replay.ts';
export { simulateDetection, simulatePolicy, POLICIES, DEFAULT_LEARNING } from './simulate.ts';
export type { DetectionOptions, DetectionCheckpoint, DetectionReport, Policy, PolicyOptions, PolicyReport } from './simulate.ts';
export { cartesian, gridSearch, tuneDetection } from './tune.ts';
export type { GridResult, ConfigSpace } from './tune.ts';
