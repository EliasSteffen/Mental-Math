// Aufgaben-Generatoren: generate(subtypeId, rng, opts), generateForMode(mode, ctx, rng)
import type { CategoryId, CustomRange, GenerateOptions, Level, Mode, SubtypeId, Task } from '../../types.ts';
import { round, pick } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { CATEGORIES, SUBTYPES, LEVEL_WEIGHT, activeCategories } from '../catalog.ts';
import type { Gen } from './helpers.ts';
import { multGen } from './mult.ts';
import { divGen } from './div.ts';
import { bigGen } from './big.ts';
import { pctGen } from './pct.ts';
import { fracGen } from './frac.ts';
import { growthGen } from './growth.ts';
import { bizGen } from './biz.ts';
import { estGen } from './est.ts';
import { unitsGen } from './units.ts';
import { magGen } from './mag.ts';
import { tricksGen } from './tricks.ts';
import { customTask } from './custom.ts';

export { parseU, uMul, uDiv, uInv, uMap, uStr, uRaw, p10 } from '../units.ts';
export { CATEGORIES, SUBTYPES, LEVEL_NAMES, LEVEL_WEIGHT, activeCategories } from '../catalog.ts';

const GEN: Record<string, Gen> = {
  ...multGen, ...divGen, ...bigGen, ...pctGen, ...fracGen, ...growthGen, ...bizGen, ...estGen, ...unitsGen, ...magGen, ...tricksGen,
};

const LEVEL_TIME: Record<Level, number> = { 1: 1, 2: 1, 3: 1.3 };
const normLevel = (l: unknown): Level => (l === 1 || l === 3 ? l : 2);

export function generate(subtypeId: SubtypeId, rng: Rng = Math.random, { level = 2, custom }: GenerateOptions = {}): Task {
  const s = SUBTYPES[subtypeId];
  const g: Gen | undefined = s?.category === 'custom' ? (r) => customTask(subtypeId, r, custom) : GEN[subtypeId];
  if (!g || !s) throw new Error(`Unbekannter Aufgabentyp: ${subtypeId}`);
  const L = normLevel(level);
  const t = g(rng, L);
  t.level = L;
  t.weight = round(s.weight * LEVEL_WEIGHT[L], 4);
  t.targetMs = Math.round(s.targetMs * LEVEL_TIME[L]);
  return t;
}

const subtypesOf = (cat: string): SubtypeId[] => Object.values(SUBTYPES).filter((s) => s.category === cat).map((s) => s.id);
const idOf = (x: string | { subtype: string } | null | undefined): string | undefined => (typeof x === 'string' ? x : x?.subtype);

export interface ModeContext {
  weakSubtypes?: Array<string | { subtype: string }>;
  reviewSubtypes?: Array<string | { subtype: string }>;
  levelFor?: (subtype: SubtypeId) => Level;
  enabledCategories?: CategoryId[] | null;
  /** Bereich für Modus 'custom' / custom.* */
  custom?: CustomRange;
}

export function generateForMode(
  mode: Mode,
  { weakSubtypes = [], reviewSubtypes = [], levelFor, enabledCategories = null, custom }: ModeContext = {},
  rng: Rng = Math.random,
): Task {
  const cats = activeCategories(enabledCategories);
  const catIds = new Set<string>(cats.map((c) => c.id));
  const any = (): SubtypeId => pick(subtypesOf(pick(cats, rng).id), rng);
  const filtered = (list: ModeContext['weakSubtypes']): string[] =>
    (list || []).map(idOf).filter((w): w is string => {
      const s = w === undefined ? undefined : SUBTYPES[w];
      return Boolean(s && catIds.has(s.category));
    });
  let id: SubtypeId;
  if (SUBTYPES[mode]) {
    id = mode;
  } else if (mode === 'custom') {
    id = custom?.kind === 'square' ? 'custom.square' : 'custom.mul';
  } else if (CATEGORIES.some((c) => c.id === mode)) {
    id = pick(subtypesOf(mode), rng);
  } else if (mode === 'weak') {
    const valid = filtered(weakSubtypes);
    id = valid.length ? pick(valid, rng) : any();
  } else if (mode === 'review') {
    const valid = filtered(reviewSubtypes);
    id = valid.length ? pick(valid, rng) : any();
  } else {
    id = any();
  }
  const lvl = typeof levelFor === 'function' ? levelFor(id) : 2;
  const t = generate(id, rng, { level: lvl, custom });
  t.mode = mode;
  return t;
}
