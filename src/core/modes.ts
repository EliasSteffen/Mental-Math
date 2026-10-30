// Trainingsmodi: Kategorie-ID | Subtyp-ID | 'all' | 'weak' | 'review' | 'daily' | 'retry' | 'custom'
import { t } from '../i18n/index.ts';
import type { Mode } from '../types.ts';
import { CATEGORIES, SUBTYPES } from './catalog.ts';

const SPECIAL = ['all', 'weak', 'review', 'daily', 'retry', 'custom'] as const;

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Gültigen Modus zurückgeben (unverändert) oder null */
export function parseMode(raw: string): Mode | null {
  if (typeof raw !== 'string' || raw === '') return null;
  if ((SPECIAL as readonly string[]).includes(raw)) return raw;
  if (has(SUBTYPES, raw)) return raw;
  if (CATEGORIES.some((c) => c.id === raw)) return raw;
  return null;
}

export function isValidMode(raw: string): boolean {
  return parseMode(raw) !== null;
}

export function modeName(mode: Mode): string {
  if ((SPECIAL as readonly string[]).includes(mode)) return t(`core.mode.${mode}`);
  const s = has(SUBTYPES, mode) ? SUBTYPES[mode] : undefined;
  if (s) {
    const cat = CATEGORIES.find((x) => x.id === s.category);
    return t('core.mode.sub', { cat: cat ? cat.name : s.category, sub: s.name });
  }
  const c = CATEGORIES.find((x) => x.id === mode);
  return c ? c.name : mode;
}
