// Strukturierte Lösungsschritte für den geführten Lernmodus (Lernen → „Schritt für Schritt“).
// Ergänzt die Text-Schritte aus solutionSteps(): Jeder Schritt hat eine Erklärung, optional eine Rechnung mit
// hervorgehobenen Ziffern, ein Zwischenergebnis zum Eintippen (für „Gemeinsam“) und eine kleine Grafik.
import type { Task } from '../../types.ts';
import { fmt } from '../numbers.ts';
import type { SP } from './helpers.ts';

/** Hervorgehobener Teil einer Rechnung (die Ziffern, um die es im Schritt geht). */
export interface Mark { mark: string }
/** Teil einer Rechnung: normaler Text oder hervorgehoben. */
export type ExprPart = string | Mark;

/** Farbton einer Grafik-Markierung: a = Akzent, b = Ergebnis, c = Übertrag/Zusatz. */
export type Tone = 'a' | 'b' | 'c';

/** Flächenmodell a × b mit a in Teilen (negative Teile werden abgezogen); `shown` Teilprodukte sind aufgedeckt. */
export interface AreaVisual { kind: 'area'; parts: number[]; factor: number; shown: number }

/** Ziffernkästchen (×11, Quadrat auf 5): Wert, Ton, kleine Notiz darunter (z. B. „5+3“). */
export interface DigitCell { v: string; tone?: Tone; note?: string }
export interface DigitsVisual { kind: 'digits'; cells: DigitCell[] }

/** Zahlenstrahl mit Markierungen und Abständen (Bögen über dem Strahl). */
export interface LineTick { v: number; label: string; tone?: Tone }
export interface LineSpan { from: number; to: number; label: string; tone?: Tone }
export interface LineVisual { kind: 'line'; min: number; max: number; ticks: LineTick[]; spans: LineSpan[] }

/**
 * Balken aus `parts` gleichen Teilen (Bruch, 10-%-Schritte): `filled` Teile markiert, `extra` Teile Zuwachs hinter
 * dem Ganzen bzw. `cut` Teile Rückgang am Ende. Beschriftungen: Ganzes (rechts), ein Teil (über dem ersten), Änderung.
 */
export interface BarVisual {
  kind: 'bar'; parts: number; filled: number; extra?: number; cut?: number;
  whole: string; part?: string; delta?: string;
}

/** Stellenwert-Chips: Ziffern plus einzelne Nullen; `unit` fasst alle Nullen der Zeile zur Einheit zusammen. */
export interface PlaceRow { label: string; digits: string; zeros: number; tone?: Tone; unit?: string }
export interface PlacesVisual { kind: 'places'; rows: PlaceRow[] }

export type Visual = AreaVisual | DigitsVisual | LineVisual | BarVisual | PlacesVisual;

export interface GuidedStep {
  /** Erklärung des Schritts (UI-Sprache). */
  text: string;
  /** Rechnung; mit `expected` nur die linke Seite (das Ergebnis hängt die Ansicht an bzw. fragt es ab). */
  expr?: ExprPart[];
  /** Zwischenergebnis – in „Gemeinsam“ tippt man es selbst ein. Der letzte Schritt liefert das Endergebnis. */
  expected?: number;
  /** Erlaubte Abweichung (absolut), Standard 0. */
  tolerance?: number;
  /** Einheit hinter dem Ergebnis ('%', 'Mio.' …), in der UI-Sprache. */
  unit?: string;
  /** Hinweis bei falscher Eingabe – nur für diesen Schritt, ohne das Ergebnis zu verraten. */
  hint?: string;
  /** Grafik nach diesem Schritt (Zeig's mir); „Gemeinsam“ zeigt die des vorigen Schritts, um nichts vorwegzunehmen. */
  visual?: Visual;
}

export type GuidedFn = (p: SP, task: Task) => GuidedStep[];

/** Hervorhebung; Zahlen werden in der UI-Sprache formatiert. */
export const mk = (v: string | number): Mark => ({ mark: typeof v === 'number' ? fmt(v) : v });

/** Rechnung als Tagged Template: ex`${mk(4)}7 × 6` → [{mark:'4'}, '7 × 6']; Zahlen werden formatiert. */
export function ex(strings: TemplateStringsArray, ...vals: Array<string | number | Mark>): ExprPart[] {
  const out: ExprPart[] = [];
  const push = (p: ExprPart): void => {
    const last = out[out.length - 1];
    if (typeof p === 'string' && typeof last === 'string') out[out.length - 1] = last + p;
    else if (p !== '') out.push(p);
  };
  strings.forEach((s, i) => {
    push(s);
    if (i < vals.length) {
      const v = vals[i] as string | number | Mark;
      push(typeof v === 'number' ? fmt(v) : v);
    }
  });
  return out;
}

/** Rechnung als reiner Text (Tests, Screenreader-Fallback). */
export const exprText = (parts: readonly ExprPart[] | undefined): string =>
  (parts ?? []).map((p) => (typeof p === 'string' ? p : p.mark)).join('');

/** Ziffernkästchen aus [Wert, Ton?, Notiz?]. */
export const digits = (...cells: Array<[string | number, Tone?, string?]>): DigitsVisual => ({
  kind: 'digits',
  cells: cells.map(([v, tone, note]) => ({ v: String(v), ...(tone ? { tone } : {}), ...(note ? { note } : {}) })),
});
