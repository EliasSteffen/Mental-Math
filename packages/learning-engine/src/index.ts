// learning-engine: Lernstand-Modell (DOM-frei, ohne Abhängigkeiten). Labor zum Trainieren/Testen: 'learning-engine/lab'.
export type {
  ErrorType, Level, Observation, CatalogEntry, Catalog, SkillStats, DeficitReason, Deficit, ErrorPatterns,
  ReviewItem, Reviews, ReviewResult, DueReview, NextStep, RoundItem, RoundInsight,
} from './types.ts';
export { DEFAULT_CONFIG, resolveConfig } from './config.ts';
export type { EngineConfig } from './config.ts';
export { credit, paceOf, skillStats, groupBy, statsBy, overallStats, levelFromScore, adaptiveLevel } from './skill.ts';
export { diagnose, findDeficits, errorPatterns } from './deficits.ts';
export type { DeficitOptions } from './deficits.ts';
export { DAY_MS, intervalMs, recordResult, dueReviews, nextDue } from './review.ts';
export { nextStep } from './recommend.ts';
export type { NextStepOptions } from './recommend.ts';
export { roundInsight } from './insight.ts';
