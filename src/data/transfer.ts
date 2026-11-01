// JSON-Import: akzeptiert den v3-Export (`exportJSON`) und alten v1/v2-State, validiert und ersetzt alle Daten.
import type { State } from '../types.ts';
import { isObj, normalize } from './schema.ts';
import { t } from '../i18n/index.ts';
import { save } from './storage.ts';

/** `skipped` = verworfene Versuche + Runden (unvollständig, siehe isValidAttempt/isValidSession). */
export type ImportResult = { ok: true; attempts: number; sessions: number; skipped: number } | { ok: false; error: string };

export function importJSON(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: t('settings.errInvalidJson') };
  }
  if (!isObj(data)) return { ok: false, error: t('settings.errNotObject') };
  if (data.version !== undefined && (typeof data.version !== 'number' || data.version < 1 || data.version > 3)) {
    return { ok: false, error: t('settings.errVersion') };
  }
  const known = ['attempts', 'sessions', 'settings', 'reviews', 'activity', 'dailyResults', 'chainBest', 'parallel'];
  if (!known.some((k) => k in data)) return { ok: false, error: t('settings.errNoData') };
  for (const k of ['attempts', 'sessions'] as const) {
    if (k in data && !Array.isArray(data[k])) return { ok: false, error: t('settings.errNotList', { field: k }) };
  }
  for (const k of ['settings', 'reviews', 'activity', 'dailyResults', 'chainBest', 'parallel'] as const) {
    if (k in data && data[k] !== null && !isObj(data[k])) return { ok: false, error: t('settings.errBadField', { field: k }) };
  }
  const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  const state: State = normalize(data); // verwirft ungültige Versuche und Runden
  const skipped = count(data.attempts) - state.attempts.length + count(data.sessions) - state.sessions.length;
  try {
    save(state);
  } catch {
    return { ok: false, error: t('settings.errSave') };
  }
  return { ok: true, attempts: state.attempts.length, sessions: state.sessions.length, skipped };
}
