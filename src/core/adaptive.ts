// Adaptive Schwierigkeit (Einstellung „Auto“): Jede Aufgabentyp-Stufe folgt einer Treppe über die eigenen Antworten,
// und unter „Leicht“ gibt es eine Vorstufe „Grundlagen“. Dort kommen zwischendurch Aufgaben der Grundlage, auf der der
// Typ aufbaut (2-stellig × 1-stellig → kleines 1×1), bzw. beim 1×1 selbst ein Einstieg mit ×2, ×5 und ×10.
// DOM-frei; alles wird aus dem Verlauf abgeleitet (kein eigener Speicher, synchronisiert sich also mit).
import type { Attempt, Level, SubtypeId } from '../types.ts';
import { SUBTYPES } from './catalog.ts';
import type { Rng } from './numbers.ts';

/** 0 = Grundlagen (Vorstufe), 1–3 = Leicht, Mittel, Schwer */
export type Step = 0 | 1 | 2 | 3;

/** So viele sichere Treffer in Folge heben die Stufe um eins. */
export const UP_AFTER = 3;
/** So viele Fehler unter den letzten WINDOW Antworten senken sie um eins. */
export const DOWN_AFTER = 2;
export const WINDOW = 4;
/** Richtig, aber langsamer als so viel × Zielzeit: zählt weder hoch noch runter. */
export const SLOW_FACTOR = 1.5;
/** Anteil der Aufgaben aus der Grundlage, solange ein Typ auf der Vorstufe steht (Rest: der Typ selbst auf „Leicht“). */
export const BASIS_SHARE = 2 / 3;

/**
 * Worauf ein Aufgabentyp aufbaut (eine Grundlage je Typ, ohne Kreise). Fällt jemand bei einem Typ unter „Leicht“,
 * übt die App dazwischen die Grundlage – bis hinunter zum kleinen 1×1.
 */
export const BASIS: Readonly<Record<SubtypeId, SubtypeId>> = {
  'table.div': 'table.mul',
  'mult.2x1': 'table.mul',
  'mult.easy': 'table.mul',
  'mult.2x2': 'mult.2x1',
  'mult.square': 'mult.2x1',
  'div.exact': 'table.div',
  'div.decimal': 'div.exact',
  'div.round': 'div.exact',
  'big.mult': 'mult.2x1',
  'big.div': 'div.exact',
  'big.percapita': 'big.div',
  'pct.of': 'mult.2x1',
  'pct.change': 'pct.of',
  'pct.reverse': 'pct.of',
  'pct.points': 'pct.of',
  'pct.chain': 'pct.change',
  'frac.topct': 'table.div',
  'frac.of': 'table.div',
  'growth.compound': 'pct.change',
  'growth.rule72': 'div.exact',
  'growth.cagr': 'growth.compound',
  'biz.payback': 'div.exact',
  'biz.breakeven': 'div.exact',
  'biz.margin': 'pct.of',
  'biz.roi': 'pct.of',
  'biz.tco': 'mult.2x1',
  'biz.fte': 'div.round',
  'biz.sla': 'pct.of',
  'est.mult': 'mult.2x1',
  'est.div': 'div.exact',
  'est.pct': 'pct.of',
  'units.dimless': 'mult.2x1',
  'units.result': 'mult.2x1',
  'units.convert': 'mult.2x1',
  'mag.exponent': 'big.mult',
  'mag.product': 'mag.exponent',
  'mag.ratio': 'mag.exponent',
  'tricks.x11': 'mult.2x1',
  'tricks.diffsq': 'mult.square',
  'tricks.near100': 'mult.2x1',
  'tricks.square5': 'mult.square',
  'tricks.pctswap': 'pct.of',
  'exhibit.share': 'pct.of',
  'exhibit.growth': 'pct.change',
  'exhibit.mix': 'pct.of',
  'exhibit.rel': 'div.exact',
};

/** Typen mit eigenem Einstieg unter „Leicht“ (Generator kennt `basic`). */
export const HAS_BASIC: ReadonlySet<SubtypeId> = new Set(['table.mul', 'table.div', 'mult.2x1']);

export type Outcome = 'good' | 'bad' | 'neutral';

/**
 * Wie eine Antwort für die Treppe zählt: richtig, ohne Hilfe und in vertretbarer Zeit = sicher; falsch oder
 * „Weiß nicht“ = Fehler; richtig mit Hilfe oder sehr langsam = neutral. Schätz-Antworten zählen nicht (andere Toleranz).
 */
export function outcome(a: Pick<Attempt, 'correct' | 'assisted' | 'untimed' | 'timeMs' | 'targetMs' | 'estimate'>): Outcome | null {
  if (a.estimate) return null;
  if (!a.correct) return 'bad';
  if (a.assisted) return 'neutral';
  if (!a.untimed && a.targetMs > 0 && a.timeMs > SLOW_FACTOR * a.targetMs) return 'neutral';
  return 'good';
}

/** Treppe über die Antworten eines Typs (chronologisch). Start auf „Leicht“. */
export function stepFromOutcomes(outcomes: readonly Outcome[], start: Step = 1): Step {
  let step: number = start;
  let streak = 0;
  let recent: boolean[] = []; // true = Fehler, seit dem letzten Stufenwechsel
  for (const o of outcomes) {
    if (o === 'neutral') continue;
    recent.push(o === 'bad');
    if (recent.length > WINDOW) recent = recent.slice(-WINDOW);
    if (o === 'good') {
      streak += 1;
      if (streak >= UP_AFTER && step < 3) { step += 1; streak = 0; recent = []; }
    } else {
      streak = 0;
      if (recent.filter(Boolean).length >= DOWN_AFTER && step > 0) { step -= 1; recent = []; }
    }
  }
  return step as Step;
}

/* ---------- Startstufe aus dem Einstufungstest (src/core/placement.ts) ---------- */

/** Höchstes Ergebnis des Einstufungstests (0 = Grundlagen … 6 = Profi). */
export const THETA_MAX = 6;

/**
 * Wie anspruchsvoll ein Typ im Vergleich ist (0 = kleines 1×1 … 3 = mehrstufig wie 2×2, Zinseszins, Exhibits).
 * Bestimmt zusammen mit dem Testergebnis die Startstufe der Treppe; nicht genannte Typen gelten als 3.
 */
export const TIER: Readonly<Record<SubtypeId, 0 | 1 | 2>> = {
  'table.mul': 0, 'table.div': 0,
  'mult.2x1': 1, 'mult.easy': 1, 'frac.topct': 1, 'est.mult': 1, 'mag.facts': 1, 'mag.exponent': 1,
  'tricks.x11': 1, 'tricks.square5': 1, 'tricks.subround': 1,
  'div.exact': 2, 'pct.of': 2, 'frac.of': 2, 'est.div': 2, 'est.pct': 2, 'mult.square': 2, 'units.dimless': 2,
  'units.result': 2, 'biz.margin': 2, 'biz.roi': 2, 'biz.payback': 2, 'growth.rule72': 2, 'tricks.pctswap': 2,
  'tricks.near100': 2,
};

/**
 * Startstufe eines Typs bei Testergebnis theta: theta − Anspruch, begrenzt auf 0–3. Die Vorstufe „Grundlagen“
 * gibt es als Start nur bei schwachem Ergebnis (theta ≤ 1); sonst beginnt jeder Typ mindestens auf „Leicht“.
 */
export function startStep(subtype: SubtypeId, theta: number): Step {
  const tier = TIER[subtype] ?? 3;
  const min = theta <= 1 ? 0 : 1;
  return Math.max(min, Math.min(3, Math.round(theta) - tier)) as Step;
}

let placementTheta: number | null = null;

/** Ergebnis des Einstufungstests setzen (null = keiner gemacht: alle Typen starten auf „Leicht“). */
export function setPlacement(theta: number | null): void {
  placementTheta = theta === null || !Number.isFinite(theta) ? null : Math.max(0, Math.min(THETA_MAX, Math.round(theta)));
}

export function getPlacement(): number | null { return placementTheta; }

function startFor(subtype: SubtypeId): Step {
  return placementTheta === null ? 1 : startStep(subtype, placementTheta);
}

function outcomesOf(subtype: SubtypeId, attempts: readonly Attempt[] | null | undefined): Outcome[] {
  const list: Outcome[] = [];
  for (const a of attempts ?? []) {
    if (a.subtype !== subtype) continue;
    const o = outcome(a);
    if (o) list.push(o);
  }
  return list;
}

/** Aktuelle Stufe eines Typs aus dem Verlauf. */
export function adaptiveStep(subtype: SubtypeId, attempts: readonly Attempt[] | null | undefined): Step {
  return stepFromOutcomes(outcomesOf(subtype, attempts), startFor(subtype));
}

/** So viele gewertete Antworten braucht eine Grundlage, bevor die Empfehlung sie als wacklig einstuft. */
export const EVIDENCE_MIN = 3;

export interface TaskPlan {
  /** Typ, der tatsächlich gestellt wird (bei einer Grundlage deren Typ) */
  subtype: SubtypeId;
  level: Level;
  /** Einstieg unter „Leicht“ (nur Typen aus HAS_BASIC) */
  basic: boolean;
  /** Grundlage für diesen Typ (für den Hinweis „Grundlage für …“), sonst null */
  foundationFor: SubtypeId | null;
}

/** Grundlage noch nicht sicher? (Vorstufe oder „Leicht“, auch wenn noch ungeübt) */
function basisShaky(id: SubtypeId, steps: (id: SubtypeId) => Step): boolean {
  return steps(id) <= 1;
}

/**
 * Welche Aufgabe für einen Typ als Nächstes passt. Stufe 1–3: der Typ selbst. Vorstufe: meist die Grundlage
 * (rekursiv, falls auch die wackelt), sonst der Typ auf „Leicht“ – damit er wieder aufsteigen kann.
 */
export function planTask(subtype: SubtypeId, attempts: readonly Attempt[] | null | undefined, rng: Rng = Math.random): TaskPlan {
  const cache = new Map<SubtypeId, Step>();
  const steps = (id: SubtypeId): Step => {
    let s = cache.get(id);
    if (s === undefined) { s = adaptiveStep(id, attempts); cache.set(id, s); }
    return s;
  };
  let id = subtype;
  let foundationFor: SubtypeId | null = null;
  for (let depth = 0; depth < 6; depth++) {
    const step = steps(id);
    if (step > 0) return { subtype: id, level: step as Level, basic: false, foundationFor };
    const basis = BASIS[id];
    if (basis && SUBTYPES[basis] && basisShaky(basis, steps) && rng() < BASIS_SHARE) {
      foundationFor ??= subtype;
      id = basis;
      continue;
    }
    return { subtype: id, level: 1, basic: HAS_BASIC.has(id), foundationFor };
  }
  return { subtype: id, level: 1, basic: HAS_BASIC.has(id), foundationFor };
}

/**
 * Tiefste Grundlage der Kette, die nachweislich wackelt (für die Empfehlung „Grundlage zuerst“); null, wenn keine.
 * Anders als in der Runde zählt eine ungeübte Grundlage hier nicht – die Empfehlung braucht Belege (EVIDENCE_MIN).
 */
export function shakyFoundation(subtype: SubtypeId, attempts: readonly Attempt[] | null | undefined): SubtypeId | null {
  if (adaptiveStep(subtype, attempts) > 0) return null;
  let id = BASIS[subtype];
  let found: SubtypeId | null = null;
  for (let depth = 0; id && depth < 6; depth++) {
    const list = outcomesOf(id, attempts);
    const step = stepFromOutcomes(list, startFor(id));
    if (list.length < EVIDENCE_MIN || step > 1) break;
    found = id;
    // Steht auch die Grundlage auf der Vorstufe, ist deren Grundlage womöglich der bessere Anfang
    if (step > 0) break;
    id = BASIS[id];
  }
  return found;
}
