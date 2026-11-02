// Synthetische Lernende mit bekannter Wahrheit: Für jeden Aufgabentyp sind Können, Tempo und Neigung zu Nullen-Fehlern
// festgelegt, einige Typen tragen eine eingepflanzte Schwäche. So lässt sich messen, ob das Modell sie findet.
import type { Catalog, DeficitReason, ErrorType, Level, Observation } from '../types.ts';
import { normal, pick, sample, sigmoid, uniform, type Rng } from './rng.ts';

export interface SkillTruth {
  /** Können als Logit: P(richtig) = sigmoid(ability − Stufen-Abzug); 2,6 ≈ 93 % */
  ability: number;
  /** typische Zeit / Zielzeit (1 = genau die Zielzeit) */
  pace: number;
  /** Anteil der Fehler, die Nullen-Fehler sind */
  zeroSlip: number;
}

export interface LearnerOptions {
  /** So viele Aufgabentypen bekommen eine Schwäche (Standard 3) */
  deficits?: number;
  /** Erlaubte Schwächen-Arten (Standard alle drei) */
  reasons?: readonly DeficitReason[];
  /** Logit-Zuwachs je Übung, skaliert mit (1 − p); 0 = lernt nicht (Standard 0) */
  learningRate?: number;
  /** relative Tempo-Verbesserung je richtiger Antwort (Standard 0) */
  paceGain?: number;
  /** Rückgang der Nullen-Neigung nach einem Nullen-Fehler mit Feedback (Standard 0) */
  zeroFix?: number;
  /** Vergessen: Logit-Verlust je Tag ohne Übung des Typs (Standard 0) */
  forgetPerDay?: number;
}

export interface Learner {
  id: number;
  catalog: Catalog;
  skills: Record<string, SkillTruth>;
  /** Wahrheit: eingepflanzte Schwächen (Typ → Art) */
  injected: Record<string, DeficitReason>;
  learningRate: number;
  paceGain: number;
  zeroFix: number;
  forgetPerDay: number;
  /** letzter Übungstag je Typ (fürs Vergessen) */
  lastDay: Record<string, number>;
}

/** Stufen-Abzug im Logit und Zeitfaktor: schwerere Aufgaben gehen öfter schief und dauern länger. */
const LEVEL_OFFSET: Record<Level, number> = { 1: -0.5, 2: 0, 3: 0.5 };
const LEVEL_TIME: Record<Level, number> = { 1: 0.9, 2: 1, 3: 1.15 };

function healthy(rng: Rng): SkillTruth {
  return { ability: normal(rng, 2.6, 0.35), pace: uniform(rng, 0.55, 0.9), zeroSlip: uniform(rng, 0.02, 0.1) };
}

/** Schwäche einpflanzen: ungenau (60–70 % richtig), langsam (1,8–3× Zielzeit), Nullen (meist knapp drüber, aber viele Nullen-Fehler). */
function withDeficit(rng: Rng, base: SkillTruth, reason: DeficitReason): SkillTruth {
  switch (reason) {
    case 'ungenau': return { ...base, ability: uniform(rng, 0.4, 0.9) };
    case 'langsam': return { ...base, pace: uniform(rng, 1.8, 3) };
    case 'nullen': return { ...base, ability: uniform(rng, 1.0, 1.8), zeroSlip: uniform(rng, 0.6, 0.9) };
  }
}

export function randomLearner(rng: Rng, catalog: Catalog, id = 0, o: LearnerOptions = {}): Learner {
  const ids = Object.keys(catalog);
  const reasons = o.reasons ?? ['ungenau', 'langsam', 'nullen'];
  const skills: Record<string, SkillTruth> = {};
  for (const s of ids) skills[s] = healthy(rng);
  const injected: Record<string, DeficitReason> = {};
  for (const s of sample(rng, ids, Math.min(o.deficits ?? 3, ids.length))) {
    const reason = pick(rng, reasons);
    injected[s] = reason;
    skills[s] = withDeficit(rng, skills[s] as SkillTruth, reason);
  }
  return {
    id, catalog, skills, injected,
    learningRate: o.learningRate ?? 0,
    paceGain: o.paceGain ?? 0,
    zeroFix: o.zeroFix ?? 0,
    forgetPerDay: o.forgetPerDay ?? 0,
    lastDay: {},
  };
}

/** Wahre Erfolgswahrscheinlichkeit eines Typs auf einer Stufe. */
export function trueP(learner: Learner, subtype: string, level: Level = 2): number {
  const s = learner.skills[subtype];
  return s ? sigmoid(s.ability - LEVEL_OFFSET[level]) : 0;
}

/** Wahrer Score (gleiche Formel wie das Modell, aber aus den wahren Werten statt aus Stichproben). */
export function trueScore(learner: Learner, subtype: string): number {
  const s = learner.skills[subtype];
  if (!s) return 0;
  return 100 * (0.7 * trueP(learner, subtype) + 0.3 * Math.min(1, 1 / s.pace));
}

/** Vergessen bis zum Tag `day` anwenden (linear je Tag seit der letzten Übung dieses Typs). */
function forget(learner: Learner, subtype: string, day: number): void {
  const s = learner.skills[subtype];
  const last = learner.lastDay[subtype];
  if (s && last !== undefined && day > last && learner.forgetPerDay > 0) s.ability -= learner.forgetPerDay * (day - last);
  learner.lastDay[subtype] = day;
}

/**
 * Eine Aufgabe beantworten. Liefert die bewertete Antwort und lässt die Person (falls eingestellt) daraus lernen:
 * Können wächst mit (1 − p), Tempo nach richtigen Antworten, Nullen-Neigung sinkt nach Nullen-Fehlern.
 */
export function answer(learner: Learner, subtype: string, level: Level, ts: number, rng: Rng): Observation {
  const s = learner.skills[subtype];
  const entry = learner.catalog[subtype];
  if (!s || !entry) throw new RangeError(`answer: unbekannter Aufgabentyp ${subtype}`);
  forget(learner, subtype, Math.floor(ts / 86_400_000));
  const p = sigmoid(s.ability - LEVEL_OFFSET[level]);
  const correct = rng() < p;
  const timeMs = Math.round(entry.targetMs * s.pace * LEVEL_TIME[level] * Math.exp(normal(rng, 0, 0.3)));
  let errorType: ErrorType | null = null;
  if (!correct) {
    const r = rng();
    errorType = r < 0.05 ? 'skip' : r < 0.05 + 0.95 * s.zeroSlip ? 'nullen' : rng() < 0.3 ? 'knapp' : 'falsch';
  }
  // Lernen aus dem Feedback
  s.ability += learner.learningRate * (1 - p);
  if (correct) s.pace = Math.max(0.5, s.pace * (1 - learner.paceGain));
  if (errorType === 'nullen') s.zeroSlip *= 1 - learner.zeroFix;
  return { ts, subtype, category: entry.category, correct, timeMs, targetMs: entry.targetMs, errorType, level };
}
