// Lernmethoden pro Aufgabentyp: Inhalte je Sprache in src/i18n/locales/<lang>/methods.ts (Deutsch = Referenz).
// Genutzt von server/explain.ts (bevorzugte Methode im KI-Prompt), Lernbereich, Intro und „Wie geht das?“.
import type { Method } from '../types.ts';
import { getLang } from '../i18n/index.ts';
import type { Lang } from '../i18n/index.ts';
import { methods as de } from '../i18n/locales/de/methods.ts';
import { methods as en } from '../i18n/locales/en/methods.ts';

const BY_LANG: Record<Lang, Record<string, Method>> = { de, en };

/** Referenz-Methoden (Deutsch), z. B. für Vollständigkeitstests. */
export const METHODS: Record<string, Method> = de;

/** Methode in der gewünschten Sprache (Standard: aktuelle UI-Sprache), sonst Deutsch, sonst null. */
export function getMethod(subtypeId: string, lang: Lang = getLang()): Method | null {
  if (typeof subtypeId !== 'string') return null;
  const own = BY_LANG[lang] ?? METHODS;
  return (Object.hasOwn(own, subtypeId) ? own[subtypeId] : undefined) ?? (Object.hasOwn(METHODS, subtypeId) ? METHODS[subtypeId] : undefined) ?? null;
}
