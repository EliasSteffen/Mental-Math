// Einstufungstest (Onboarding, Profil → Training): bis zu 10 Aufgaben auf einer Leiter von „Sprossen“, vom
// kleinen 1×1 bis zu 2-stellig × 2-stellig und Prozent-Veränderungen. Start auf Sprosse 2 (1×1 bis 9 × 9); bestanden →
// eine Sprosse höher, ein Patzer → zweite Chance auf derselben Sprosse, zwei Fehler → eine Sprosse tiefer (dort endet
// der Test beim ersten Bestehen). Ergebnis theta 0–6 = höchste bestandene Sprosse; daraus folgen die Startstufen je Typ
// (src/core/adaptive.ts → startStep). DOM-frei.
import type { Level, SubtypeId, Task } from '../types.ts';
import { THETA_MAX, startStep } from './adaptive.ts';
import type { Step } from './adaptive.ts';
import { generate } from './generators/index.ts';
import type { Rng } from './numbers.ts';

export interface Probe { subtype: SubtypeId; level: Level }

/** Sprossen 1–6, je zwei Aufgaben (zweite = zweite Chance mit anderem Typ). */
export const RUNGS: readonly (readonly [Probe, Probe])[] = [
  [{ subtype: 'table.mul', level: 1 }, { subtype: 'table.div', level: 1 }],
  [{ subtype: 'table.mul', level: 2 }, { subtype: 'table.div', level: 2 }],
  [{ subtype: 'mult.2x1', level: 1 }, { subtype: 'table.mul', level: 3 }],
  [{ subtype: 'mult.2x1', level: 2 }, { subtype: 'div.exact', level: 1 }],
  [{ subtype: 'pct.of', level: 2 }, { subtype: 'div.exact', level: 2 }],
  [{ subtype: 'mult.2x2', level: 2 }, { subtype: 'pct.change', level: 2 }],
];
export const START_RUNG = 2;
/** Höchstzahl der Aufgaben (Aufstieg über alle Sprossen mit je einem Patzer). */
export const MAX_ITEMS = 2 * (RUNGS.length - START_RUNG + 1);
/** Bestanden: richtig und höchstens so viel × Zielzeit (im Test großzügiger als im Training). */
export const PASS_FACTOR = 2;

export interface PlacementAnswer { correct: boolean; timeMs: number; targetMs: number }

export const passed = (a: PlacementAnswer): boolean => a.correct && a.timeMs <= PASS_FACTOR * a.targetMs;

export interface PlacementState {
  /** Nächste Aufgabe (Sprosse 1–6, Versuch 0/1) oder null = fertig */
  next: { rung: number; probe: 0 | 1 } | null;
  /** Höchste bestandene Sprosse (0 = keine) – das Ergebnis, sobald next null ist */
  theta: number;
}

/** Zustand nach den bisherigen Antworten (Replay; die Antworten gehören zu den Aufgaben, die next vorgab). */
export function placementState(answers: readonly PlacementAnswer[]): PlacementState {
  let rung = START_RUNG;
  let probe: 0 | 1 = 0;
  let best = 0;
  let down = false;
  for (const a of answers) {
    if (passed(a)) {
      best = Math.max(best, rung);
      if (down || rung >= RUNGS.length) return { next: null, theta: best };
      rung += 1;
      probe = 0;
    } else if (probe === 0) {
      probe = 1;
    } else {
      // Zwei Fehler auf dieser Sprosse
      if (rung - 1 <= best || rung <= 1) return { next: null, theta: best };
      rung -= 1;
      probe = 0;
      down = true;
    }
  }
  return { next: { rung, probe }, theta: best };
}

/** Aufgabe zu einer Sprosse und einem Versuch. */
export function probeTask(rung: number, probe: 0 | 1, rng: Rng = Math.random): Task {
  const spec = RUNGS[Math.max(1, Math.min(RUNGS.length, rung)) - 1]?.[probe] ?? { subtype: 'table.mul', level: 1 };
  const t = generate(spec.subtype, rng, { level: spec.level });
  t.mode = 'placement';
  return t;
}

/** Bereiche für die Ergebnis-Anzeige: Startstufe je typischem Typ. */
export const SUMMARY: readonly SubtypeId[] = ['table.mul', 'mult.2x1', 'div.exact', 'pct.of', 'mult.2x2', 'growth.compound'];

export function summary(theta: number): Array<{ subtype: SubtypeId; step: Step }> {
  return SUMMARY.map((subtype) => ({ subtype, step: startStep(subtype, theta) }));
}

export const isTheta = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= THETA_MAX;
