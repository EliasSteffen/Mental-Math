// Trainingsmodi: Kategorie-ID | Subtyp-ID | 'all' | 'weak' | 'review' | 'daily' | 'retry' | 'custom' | 'challenge'
// ('challenge' = gewerteter Wettbewerb, 'placement' = Einstufungstest – nur über #/challenge/<id> bzw. #/einstufung;
// #/train/challenge und #/train/placement spielen eine gemischte Runde)
import { t } from '../i18n/index.ts';
import type { ExtraSessionMode, Mode } from '../types.ts';
import { caseById } from './cases/index.ts'; // v9 C
import { CATEGORIES, SUBTYPES } from './catalog.ts';

const SPECIAL = ['all', 'weak', 'review', 'daily', 'retry', 'custom', 'challenge', 'placement', 'duel', 'warmup'] as const; // v9 I: duel, v10 C: warmup

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

export function modeName(mode: Mode | ExtraSessionMode): string {
  // v9 B: Runden außerhalb von #/train
  if (mode === 'chain') return t('chain.title');
  if (mode === 'parallel') return t('parallel.title');
  // v9 C: Mini-Case-Runden („case:<Vorlage>“)
  if (mode.startsWith('case:')) {
    const tpl = caseById(mode.slice(5));
    return tpl ? t('cases.modeName', { title: tpl.title() }) : t('cases.title');
  }
  if ((SPECIAL as readonly string[]).includes(mode)) return t(`core.mode.${mode}`);
  const s = has(SUBTYPES, mode) ? SUBTYPES[mode] : undefined;
  if (s) {
    const cat = CATEGORIES.find((x) => x.id === s.category);
    return t('core.mode.sub', { cat: cat ? cat.name : s.category, sub: s.name });
  }
  const c = CATEGORIES.find((x) => x.id === mode);
  return c ? c.name : mode;
}
