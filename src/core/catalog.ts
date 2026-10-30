// Kategorien, Aufgabentypen, Schwierigkeitsstufen
import { t } from '../i18n/index.ts';
import type { Category, CategoryId, Level, Subtype } from '../types.ts';

export const CATEGORIES: Category[] = [
  { id: 'mult', get name() { return t('core.cat.mult.name'); }, get description() { return t('core.cat.mult.desc'); } },
  { id: 'div', get name() { return t('core.cat.div.name'); }, get description() { return t('core.cat.div.desc'); } },
  { id: 'big', get name() { return t('core.cat.big.name'); }, get description() { return t('core.cat.big.desc'); } },
  { id: 'pct', get name() { return t('core.cat.pct.name'); }, get description() { return t('core.cat.pct.desc'); } },
  { id: 'frac', get name() { return t('core.cat.frac.name'); }, get description() { return t('core.cat.frac.desc'); } },
  { id: 'growth', get name() { return t('core.cat.growth.name'); }, get description() { return t('core.cat.growth.desc'); } },
  { id: 'biz', get name() { return t('core.cat.biz.name'); }, get description() { return t('core.cat.biz.desc'); } },
  { id: 'est', get name() { return t('core.cat.est.name'); }, get description() { return t('core.cat.est.desc'); } },
  { id: 'units', get name() { return t('core.cat.units.name'); }, get description() { return t('core.cat.units.desc'); } },
  { id: 'mag', get name() { return t('core.cat.mag.name'); }, get description() { return t('core.cat.mag.desc'); } },
  { id: 'tricks', get name() { return t('core.cat.tricks.name'); }, get description() { return t('core.cat.tricks.desc'); } },
  { id: 'custom', get name() { return t('core.cat.custom.name'); }, get description() { return t('core.cat.custom.desc'); }, hidden: true },
];

type Meta = [id: string, targetMs: number, weight: number];

const META: Meta[] = [
  ['mult.2x1', 5000, 1],
  ['mult.2x2', 20000, 2],
  ['mult.easy', 8000, 1],
  ['mult.square', 15000, 1.5],
  ['div.exact', 10000, 1],
  ['div.decimal', 12000, 1.5],
  ['div.round', 15000, 1.5],
  ['big.mult', 10000, 1.5],
  ['big.div', 15000, 1.5],
  ['big.percapita', 15000, 1.5],
  ['pct.of', 10000, 1],
  ['pct.change', 10000, 1],
  ['pct.reverse', 15000, 1.5],
  ['pct.points', 12000, 1.5],
  ['pct.chain', 12000, 1.5],
  ['frac.topct', 5000, 1],
  ['frac.of', 10000, 1],
  ['growth.compound', 15000, 2],
  ['growth.rule72', 8000, 1],
  ['growth.cagr', 20000, 2],
  ['biz.payback', 10000, 1],
  ['biz.breakeven', 15000, 1.5],
  ['biz.margin', 8000, 1],
  ['biz.roi', 10000, 1],
  ['biz.tco', 10000, 1],
  ['biz.fte', 25000, 2],
  ['biz.sla', 12000, 1.5],
  ['est.mult', 6000, 1],
  ['est.div', 8000, 1],
  ['est.pct', 8000, 1],
  ['units.dimless', 10000, 1],
  ['units.result', 10000, 1],
  ['units.convert', 15000, 1.5],
  ['mag.exponent', 6000, 1],
  ['mag.facts', 8000, 1],
  ['mag.product', 10000, 1.5],
  ['mag.ratio', 10000, 1.5],
  ['tricks.x11', 6000, 1],
  ['tricks.diffsq', 10000, 1.5],
  ['tricks.near100', 10000, 1.5],
  ['tricks.square5', 6000, 1],
  ['tricks.pctswap', 6000, 1],
  ['tricks.subround', 6000, 1],
  ['custom.mul', 10000, 1],
  ['custom.square', 8000, 1],
];

export const SUBTYPES: Record<string, Subtype> = Object.fromEntries(
  META.map(([id, targetMs, weight]) => [
    id,
    {
      id,
      category: id.split('.')[0] as CategoryId,
      // Name und Tipp sind Getter, damit ein Sprachwechsel ohne Neuladen greift
      get name() { return t(`core.sub.${id}.name`); },
      targetMs,
      weight,
      get tip() { return t(`core.sub.${id}.tip`); },
    } satisfies Subtype,
  ]),
);

export const LEVEL_NAMES: Record<Level, string> = {
  get 1() { return t('core.level.1'); },
  get 2() { return t('core.level.2'); },
  get 3() { return t('core.level.3'); },
};
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 0.75, 2: 1, 3: 1.5 };

/** null/undefined → alle sichtbaren Kategorien; sonst gefiltert (leeres Ergebnis → alle sichtbaren). Versteckte Kategorien (hidden) sind nie enthalten. */
export function activeCategories(enabled?: readonly CategoryId[] | null): Category[] {
  const visible = CATEGORIES.filter((c) => !c.hidden);
  if (!Array.isArray(enabled)) return visible;
  const list = visible.filter((c) => enabled.includes(c.id));
  return list.length ? list : visible;
}
