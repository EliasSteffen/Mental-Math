// Wiederherstellungscode (Recovery-Code): 20 Zeichen Crockford-Base32 = 100 Bit Zufall, angezeigt in 4 Fünfergruppen.
// Der Server speichert nur SHA-256(normalisierter Code); wer alle Passkeys verliert, legt damit einen neuen an.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // ohne I, L, O, U
export const RECOVERY_CODE_LENGTH = 20;

/** 20 Zeichen in Gruppen: ABCDE-FGHJK-MNPQR-STVWX */
export function formatRecoveryCode(normalized: string): string {
  return normalized.match(/.{1,5}/g)?.join('-') ?? normalized;
}

/** Neuer Code aus kryptografischem Zufall (5 Bit je Byte; 256 ist ein Vielfaches von 32, also gleichverteilt). */
export function generateRecoveryCode(randomBytes: (n: number) => Uint8Array): string {
  let s = '';
  for (const b of randomBytes(RECOVERY_CODE_LENGTH)) s += ALPHABET[b & 31];
  return formatRecoveryCode(s);
}

/** Eingabe tolerant lesen: Groß/klein, Leerzeichen und Bindestriche egal, O → 0, I/L → 1. Ungültig → null. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== RECOVERY_CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}
