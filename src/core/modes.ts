// Trainingsmodi: Kategorie-ID | Subtyp-ID | 'all' | 'weak' | 'review' | 'daily' | 'retry' | 'custom'
import type { Mode } from '../types.ts';
import { CATEGORIES, SUBTYPES } from './catalog.ts';

const SPECIAL_NAMES: Record<string, string> = {
  all: 'Alle Kategorien',
  weak: 'Schwächen',
  review: 'Wiederholung',
  daily: 'Daily Challenge',
  retry: 'Wiederholung',
  custom: 'Eigenes Training',
};

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Gültigen Modus zurückgeben (unverändert) oder null */
export function parseMode(raw: string): Mode | null {
  if (typeof raw !== 'string' || raw === '') return null;
  if (has(SPECIAL_NAMES, raw)) return raw;
  if (has(SUBTYPES, raw)) return raw;
  if (CATEGORIES.some((c) => c.id === raw)) return raw;
  return null;
}

export function isValidMode(raw: string): boolean {
  return parseMode(raw) !== null;
}

export function modeName(mode: Mode): string {
  const special = has(SPECIAL_NAMES, mode) ? SPECIAL_NAMES[mode] : undefined;
  if (special) return special;
  const s = has(SUBTYPES, mode) ? SUBTYPES[mode] : undefined;
  if (s) {
    const cat = CATEGORIES.find((x) => x.id === s.category);
    return `${cat ? cat.name : s.category} · ${s.name}`;
  }
  const c = CATEGORIES.find((x) => x.id === mode);
  return c ? c.name : mode;
}
