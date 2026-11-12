// Mini-Case: ein Fall mit verknüpften Rechenschritten und einer „So what?“-Entscheidung (v9 C).
import type { Params } from '../../types.ts';
import type { Rng } from '../numbers.ts';

export interface CaseNumberStep {
  kind: 'number';
  prompt: string;
  expected: number;
  tol: { abs: number; rel: number };
  unit: string;
  hint?: string;
  targetMs: number;
  /** Lösungsweg, eine Zeile je Schritt */
  solution: string[];
}

export interface CaseChoiceStep {
  kind: 'choice';
  prompt: string;
  choices: string[];
  correctIndex: number;
  /** Kurze Begründung, die aus den Zahlen folgt */
  why: string;
  targetMs: number;
}

export type CaseStep = CaseNumberStep | CaseChoiceStep;

export interface MiniCase {
  templateId: string;
  title: string;
  brief: string;
  /** Exhibit im Format von renderExhibit (src/ui/exhibit.ts) */
  exhibit: Params | null;
  steps: CaseStep[];
  /** Basiszahlen, aus denen alle Schritte berechnet wurden (für Tests) */
  base: Record<string, number>;
}

export interface CaseTemplate {
  id: string;
  title(): string;
  generate(rng: Rng): MiniCase;
}
