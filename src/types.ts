// Zentraler Typvertrag (v5). Alle Module importieren Typen nur von hier (`import type`).
// Änderungen nur durch den Hauptagent – siehe docs/PLAN-v5.md.

// ---------- Katalog ----------
export type CategoryId =
  | 'mult' | 'div' | 'big' | 'pct' | 'frac' | 'growth' | 'biz' | 'est' | 'units' | 'mag'
  | 'tricks' | 'custom';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  /** Versteckt = nicht im Raster, nicht in „Alle“, nicht in Empfehlungen (z. B. 'custom'). */
  hidden?: boolean;
}

export type SubtypeId = string; // z. B. 'pct.of' – Prüfung zur Laufzeit über SUBTYPES

export interface Subtype {
  id: SubtypeId;
  category: CategoryId;
  name: string;
  targetMs: number;
  weight: number;
  tip: string;
}

export type Level = 1 | 2 | 3;
export type DifficultySetting = 'auto' | Level;

// ---------- Aufgaben ----------
export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export interface Tolerance { abs: number; rel: number }

interface TaskBase {
  id: string;
  mode?: Mode;
  category: CategoryId;
  subtype: SubtypeId;
  prompt: string;
  unit: string;
  hint: string;
  tolerance: Tolerance;
  targetMs: number;
  weight: number;
  level: Level;
  params: Params;
}
export interface NumberTask extends TaskBase { kind?: 'number'; expected: number }
export interface ChoiceTask extends TaskBase { kind: 'choice'; choices: string[]; /** Index der richtigen Option */ expected: number }
export type Task = NumberTask | ChoiceTask;

export interface CustomRange {
  kind: 'mul' | 'square';
  aMin: number; aMax: number;
  /** nur bei 'mul' */
  bMin?: number; bMax?: number;
}

export interface GenerateOptions { level?: Level; custom?: CustomRange }

// ---------- Modi ----------
/** Kategorie-ID | Subtyp-ID | Spezialmodi */
export type Mode = string; // 'all' | 'weak' | 'review' | 'daily' | 'retry' | 'custom' | CategoryId | SubtypeId

// ---------- Bewertung ----------
export type ErrorType = 'nullen' | 'knapp' | 'falsch' | 'skip';

export interface EvaluateOptions { assisted?: boolean; untimed?: boolean; estimate?: boolean }

export interface Evaluation {
  correct: boolean;
  errorType: ErrorType | null;
  points: number;
  timeFactor: number;
}

export interface SkillStats {
  n: number;
  accuracy: number;
  speed: number;
  score: number | null;
  avgTimeMs: number;
  avgTargetMs: number;
}

export interface Weakness extends SkillStats {
  subtype: SubtypeId;
  name: string;
  category: CategoryId;
  categoryName: string;
  targetMs: number;
  reason: 'nullen' | 'ungenau' | 'langsam';
  label: string;
  tip: string;
}

export interface ErrorPatterns { nullen: number; knapp: number; falsch: number; skip: number }

// ---------- Persistenz ----------
export interface Attempt {
  ts: number;
  sessionId: string;
  mode: Mode;
  category: CategoryId;
  subtype: SubtypeId;
  prompt: string;
  unit: string;
  expected: number;
  given: number | null;
  correct: boolean;
  errorType: ErrorType | null;
  timeMs: number;
  targetMs: number;
  weight: number;
  points: number;
  // ab v2/v3/v4 – bei alten Daten ggf. fehlend
  params?: Params;
  assisted?: boolean;
  level?: Level;
  untimed?: boolean;
  isReview?: boolean;
  estimate?: boolean;
  kind?: 'number' | 'choice';
  choices?: string[];
}

export interface Session {
  id: string;
  ts: number;
  mode: Mode;
  n: number;
  correct: number;
  points: number;
  avgTimeMs: number;
}

export type ThemeSetting = 'system' | 'neon' | 'oled' | 'pastel';
export type Theme = Exclude<ThemeSetting, 'system'>;

export interface Settings {
  sessionLength: number;
  dailyGoalMin: number;
  theme: ThemeSetting;
  difficulty: DifficultySetting;
  timer: boolean;
  sound: boolean;
  haptics: boolean;
  /** dayKey des letzten Tagesziel-Konfettis */
  celebrated: string;
  keypad: 'auto' | 'on' | 'off';
  enabledCategories: CategoryId[] | null;
  // v5
  autoSubmit: boolean;
  numpadLayout: 'calculator' | 'phone';
  estimateMode: boolean;
  ghost: boolean;
}

export interface ReviewItem { box: number; dueAt: number; lastTs: number }
export type Reviews = Record<SubtypeId, ReviewItem>;

/** dayKey 'YYYY-MM-DD' (lokale Zeit) → aktive Millisekunden */
export type Activity = Record<string, number>;

export interface DailyResult { n: number; correct: number; points: number; timeMs: number; ts: number }

export interface State {
  version: 2;
  attempts: Attempt[];
  sessions: Session[];
  settings: Settings;
  reviews: Reviews;
  activity: Activity;
  dailyResults: Record<string, DailyResult>;
  /** Level → beste Trefferzahl in Folge */
  chainBest: Partial<Record<Level, number>>;
  /** Paralleles Kettenrechnen: adaptive Startzahl & Bestwerte */
  parallel: ParallelStats;
}

// ---------- Fortschritt ----------
export interface StreakInfo { current: number; best: number; todayMs: number; goalMs: number; todayDone: boolean }
export interface HeatCell { date: string; ms: number; level: 0 | 1 | 2 | 3 | 4 }
export interface DailyPoint { date: string; n: number; accuracy: number | null; speed: number | null }
export interface ApmPoint { date: string; perMinute: number | null; accuracy: number | null }
export interface XpInfo { xp: number; level: number; into: number; needed: number }
export interface Recommendation {
  kind: 'review' | 'weak' | 'new' | 'mixed';
  mode: Mode;
  subtype: SubtypeId | null;
  title: string;
  reason: string;
}
export interface PersonalBest { mode: Mode; avgMs: number; points: number; ts: number }

// ---------- Lernen ----------
export interface Method { idea: string; steps: string[]; trick: string; pitfalls: string[] }

// ---------- Kettenrechnen ----------
export type ChainOp = '+' | '−' | '×' | '÷';
export interface ChainTask { start: number; steps: Array<{ op: ChainOp; value: number }>; result: number }

// ---------- Paralleles Kettenrechnen (Multi-Chain Working Memory) ----------
export interface ParallelChain {
  id: string;            // 'A' | 'B' | 'C' | 'D'
  currentTotal: number;  // wird während des Streams NICHT angezeigt
  history: string[];     // Labels der Schritte in Reihenfolge, z. B. ['Start 12', '+ 7', '× 2']
}
export type ParallelPhase = 'setup' | 'stream' | 'input' | 'result';
export interface ParallelConfig {
  level: Level;              // L1: + −  · L2: + − ×  · L3: + − × ÷
  intervalMs: number;        // Abstand zwischen Rechen-Events (z. B. 4000)
  durationMs: number;        // Gesamtzeit des Streams (z. B. 45000)
  startChains: 2 | 3 | 4;
  maxChains: 2 | 3 | 4;      // Obergrenze (Standard 4)
  stepsPerChain: number;     // Stream endet, wenn jede Kette so viele Schritte hat (Standard 10)
  addChainEvery: number;     // nach so vielen Events kommt eine Kette dazu (Dynamic Scaling, Standard 5)
}
export interface ParallelEvent {
  chainId: string;
  op: ChainOp;
  value: number;
  label: string;             // '+ 7', '× 2'
  at: number;                // ms seit Stream-Start
}
export interface ParallelState {
  phase: ParallelPhase;
  config: ParallelConfig;
  chains: ParallelChain[];
  elapsedMs: number;
  remainingMs: number;
  nextEventAt: number;       // ms seit Stream-Start
  eventCount: number;
  lastEvent: ParallelEvent | null;
  inputIndex: number;        // welche Kette gerade eingegeben wird
  answers: Array<number | null>;
}
export interface ParallelChainResult { id: string; expected: number; given: number | null; correct: boolean; history: string[]; totals: number[] }
export interface ParallelResult { chains: ParallelChainResult[]; correct: number; total: number; allCorrect: boolean; points: number }
export interface ParallelStats { nextStart: 2 | 3 | 4; bestChains: number; bestCorrectStreak: number; rounds: number }

// ---------- KI ----------
export type AiResult = { ok: true; text: string } | { ok: false; error: string; message: string };
export type AiInline = { text: string; bold: boolean; italic: boolean };
export type AiBlock = { type: 'p'; parts: AiInline[] } | { type: 'ol' | 'ul'; items: AiInline[][] };
