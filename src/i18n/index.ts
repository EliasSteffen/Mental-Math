// i18n-Kern (DOM-frei nutzbar): Sprache halten, Texte nachschlagen, Wechsel melden.
// Entspricht einem „useTranslation()“-Hook ohne Framework: Views rufen t() beim Rendern,
// der Router rendert bei onLangChange neu.
import type { LangCode } from '../types.ts';
import { dict as de } from './locales/de/index.ts';
import { dict as en } from './locales/en/index.ts';

export type Lang = LangCode;
export type Params = Record<string, string | number>;
type Namespaces = typeof de;

const DICTS: Record<Lang, Record<string, Record<string, string>>> = {
  de: de as unknown as Record<string, Record<string, string>>,
  en: en as unknown as Record<string, Record<string, string>>,
};

let current: Lang = 'de';
const listeners = new Set<(lang: Lang) => void>();

/** 'auto' → erste Browsersprache: de* → 'de', sonst 'en'. */
export function detectLang(pref: 'auto' | Lang, languages: readonly string[] = (globalThis.navigator?.languages ?? [])): Lang {
  if (pref === 'de' || pref === 'en') return pref;
  const first = (languages[0] ?? '').toLowerCase();
  return first.startsWith('de') ? 'de' : (first ? 'en' : 'de');
}

export function getLang(): Lang { return current; }

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** BCP-47-Locale für Intl (Zahlen, Datum). */
export function locale(lang: Lang = current): string { return lang === 'de' ? 'de-DE' : 'en-US'; }

/**
 * Text nachschlagen: t('train.check'), t('home.tasks', { n: 3 }) mit Platzhaltern {n}.
 * Fallback-Kette: aktuelle Sprache → Deutsch → Schlüssel selbst (fällt in Tests auf).
 */
export function t(key: `${keyof Namespaces & string}.${string}`, params?: Params): string {
  const dot = key.indexOf('.');
  const ns = key.slice(0, dot);
  const k = key.slice(dot + 1);
  const raw = DICTS[current][ns]?.[k] ?? DICTS.de[ns]?.[k] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`)) : raw;
}

/** Framework-freies Pendant zu React-useTranslation(). */
export function useTranslation(): { t: typeof t; lang: Lang; setLang: typeof setLang } {
  return { t, lang: current, setLang };
}

/** Für Tests: alle Schlüssel einer Sprache. */
export function allKeys(lang: Lang): string[] {
  return Object.entries(DICTS[lang]).flatMap(([ns, d]) => Object.keys(d).map((k) => `${ns}.${k}`));
}
