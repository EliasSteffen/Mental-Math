// Benutzername: frei wählbar, NICHT eindeutig, nur Anzeigename. Gleiche Regeln in Client, Server und SQL (char_length 2–32).

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 32;

export type UsernameResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'too_short' | 'too_long' | 'invalid_chars' };

/** trim, NFC, Leerraum zusammenfassen; verbietet Steuer- und Formatzeichen (u. a. Zero-Width, Bidi-Overrides). */
export function normalizeUsername(input: unknown): UsernameResult {
  if (typeof input !== 'string') return { ok: false, reason: 'too_short' };
  const value = input.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/u.test(value)) return { ok: false, reason: 'invalid_chars' };
  const len = [...value].length;
  if (len < USERNAME_MIN) return { ok: false, reason: 'too_short' };
  if (len > USERNAME_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}
