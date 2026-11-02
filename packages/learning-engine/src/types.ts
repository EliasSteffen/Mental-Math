// Verträge des Lernstand-Modells. Das Paket kennt keine App-Begriffe außer „Aufgabentyp“ (subtype) und „Kategorie“
// (category); Namen, Texte und Übersetzungen ergänzt die App.

/**
 * Fehlerart einer bewerteten Antwort (so gespeichert, daher deutsch):
 * - `nullen`: Zehnerpotenz daneben („eine Null zu viel/zu wenig“)
 * - `knapp`: höchstens 10 % daneben
 * - `falsch`: sonst falsch
 * - `skip`: übersprungen
 */
export type ErrorType = 'nullen' | 'knapp' | 'falsch' | 'skip';

/** Schwierigkeitsstufe 1 (leicht) bis 3 (schwer) */
export type Level = 1 | 2 | 3;

/**
 * Eine bewertete Antwort – das Einzige, was das Modell sieht. Bewusst eine Teilmenge des App-Typs `Attempt`,
 * damit ein Export der App ohne Umbau hineinpasst.
 */
export interface Observation {
  /** Zeitpunkt (ms seit 1970) */
  ts: number;
  /** Aufgabentyp, z. B. 'pct.of' */
  subtype: string;
  /** Kategorie, z. B. 'pct' */
  category: string;
  correct: boolean;
  /** benötigte Zeit (ms) */
  timeMs: number;
  /** Zielzeit der Aufgabe (ms) */
  targetMs: number;
  errorType?: ErrorType | null;
  /** mit Hilfe gelöst („Wie geht das?“) – zählt nur teilweise */
  assisted?: boolean;
  /** ohne Zeitmessung (Zeit zählt nicht fürs Tempo) */
  untimed?: boolean;
  /** Teil einer Wiederholungsrunde */
  isReview?: boolean;
  level?: Level;
}

/** Was das Modell über einen Aufgabentyp wissen muss. Die App übergibt ihren Katalog (SUBTYPES passt strukturell). */
export interface CatalogEntry {
  category: string;
  targetMs: number;
}
export type Catalog = Readonly<Record<string, CatalogEntry>>;

/** Lernstand einer Menge von Antworten (meist: die letzten N eines Aufgabentyps). */
export interface SkillStats {
  /** Anzahl Antworten im Fenster */
  n: number;
  /** Anteil richtig (0..1), Antworten mit Hilfe zählen anteilig */
  accuracy: number;
  /** Tempo (0..1): Zielzeit / Zeit der richtigen, gemessenen Antworten, gekappt bei 1 */
  speed: number;
  /** 0..100 aus Genauigkeit und Tempo; null bei zu wenigen Antworten */
  score: number | null;
  avgTimeMs: number;
  avgTargetMs: number;
}

/**
 * Diagnose einer Schwäche:
 * - `nullen`: wiederholt Zehnerpotenz daneben
 * - `ungenau`: zu viele falsche Antworten
 * - `langsam`: meist richtig, aber deutlich über der Zielzeit
 */
export type DeficitReason = 'nullen' | 'ungenau' | 'langsam';

export interface Deficit extends SkillStats {
  subtype: string;
  category: string;
  /** Zielzeit laut Katalog */
  targetMs: number;
  reason: DeficitReason;
}

export interface ErrorPatterns { nullen: number; knapp: number; falsch: number; skip: number }

/* ---------- Wiederholung (Leitner) ---------- */

export interface ReviewItem { box: number; dueAt: number; lastTs: number }
export type Reviews = Record<string, ReviewItem>;
export interface ReviewResult { subtype: string; correct: boolean; ts?: number; isReview?: boolean }
export interface DueReview { subtype: string; box: number; dueAt: number }

/* ---------- Empfehlung ---------- */

/** Nächster sinnvoller Schritt, in dieser Rangfolge: fällige Wiederholungen, größte Schwäche, Neues, gemischt. */
export type NextStep =
  | { kind: 'review'; due: DueReview[] }
  | { kind: 'weak'; deficit: Deficit }
  | { kind: 'new'; subtype: string }
  | { kind: 'mixed' };

/* ---------- Runden-Erkenntnis ---------- */

export interface RoundItem { subtype: string; correct: boolean; errorType?: ErrorType | null }
export interface RoundInsight {
  type: ErrorType;
  count: number;
  /** häufigster Aufgabentyp unter den Fehlern dieser Art */
  subtype: string;
}
