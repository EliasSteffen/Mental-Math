// Rundgang (ohne DOM): Schritte, Kapitel und geschätzte Dauer. Ausgeführt von features/tour.ts, Inhalte in features/tour-scripts.ts.

export type TourId = 'intro' | 'v2' | 'store';

/** Schritt gilt nur auf dieser Layout-Stufe: phone/tablet (Grenze 720 px), narrow/wide (Grenze 1024 px, Master-Detail). */
export type TourLayout = 'phone' | 'tablet' | 'narrow' | 'wide';
export type TourText = `tour.${string}`;

interface StepBase { only?: TourLayout | undefined }

export type TourStep = StepBase & (
  /** Seite wechseln, ohne Verlaufseintrag */
  | { kind: 'go'; hash: string }
  /** Text zeigen, optional mit Spotlight auf ein Element */
  | { kind: 'say'; text: TourText; target?: string | undefined; ms?: number | undefined }
  /** Touch-Punkt fährt hin und tippt */
  | { kind: 'tap'; target: string }
  /** Touch-Punkt tippt die Lösung der aktuellen Aufgabe (`wrong`: mit einer Null zu viel) und prüft */
  | { kind: 'answer'; wrong?: boolean | undefined }
  /** „Jetzt du“: Eingabe gehört der Person; passiert nichts, tippt der Touch-Punkt */
  | { kind: 'ask'; text: TourText }
  | { kind: 'wait'; ms: number }
);

export interface TourChapter {
  id: string;
  title: TourText;
  steps: readonly TourStep[];
  /** Feste Aufgaben (Subtyp-IDs) für dieses Kapitel */
  tasks?: readonly string[];
}

export interface Tour { id: TourId; chapters: readonly TourChapter[] }

export interface LayoutFlags { tablet: boolean; wide: boolean }

export function stepApplies(only: TourLayout | undefined, f: LayoutFlags): boolean {
  switch (only) {
    case 'phone': return !f.tablet;
    case 'tablet': return f.tablet;
    case 'narrow': return !f.wide;
    case 'wide': return f.wide;
    default: return true;
  }
}

/** Standarddauer eines Textes (ms) */
export const SAY_MS = 2800;
const FIXED_MS = { go: 400, tap: 1100, answer: 2400, ask: 6000 } as const;

export function stepMs(step: TourStep): number {
  switch (step.kind) {
    case 'say': return step.ms ?? SAY_MS;
    case 'wait': return step.ms;
    default: return FIXED_MS[step.kind];
  }
}

/** Geschätzte Laufzeit auf einer Layout-Stufe (ms); „Jetzt du“ mit durchschnittlicher Dauer. */
export function tourMs(chapters: readonly TourChapter[], f: LayoutFlags): number {
  let total = 0;
  for (const ch of chapters) {
    for (const step of ch.steps) if (stepApplies(step.only, f)) total += stepMs(step);
  }
  return total;
}
