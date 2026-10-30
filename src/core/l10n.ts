// Anzeige-Lokalisierung für Aufgabentexte. Intern (params, Lösungswege, uStr) bleiben die deutschen
// Kennungen erhalten; nur der sichtbare Text wird hier in die aktuelle Sprache übersetzt.
import { getLang, t } from '../i18n/index.ts';

const KEYS: Record<string, string> = {
  'Tsd.': 'tsd', 'Mio.': 'mio', 'Mrd.': 'mrd', Jahre: 'jahre', Jahr: 'jahr', Monat: 'monat', Tag: 'tag',
  'Stück': 'stueck', Mitarbeiter: 'mitarbeiter', Kunde: 'kunde', 'Min.': 'min', dimensionslos: 'dimless',
  Umsatz: 'umsatz', Personalkosten: 'personalkosten', Gewinn: 'gewinn', Kosten: 'kosten', Budget: 'budget',
  Investition: 'investition', Ausfallzeit: 'ausfallzeit', Arbeitszeit: 'arbeitszeit', Wartungszeit: 'wartungszeit',
  Produktion: 'produktion', Absatz: 'absatz', Preis: 'preis', 'Stückkosten': 'stueckkosten',
  Geschwindigkeit: 'geschwindigkeit', 'Stückzahl': 'stueckzahl', Stundensatz: 'stundensatz', Belegschaft: 'belegschaft',
  Miete: 'miete', 'Kosten pro Kopf': 'kostenprokopf',
};
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RE = new RegExp(
  `(?<![\\p{L}\\d])(${Object.keys(KEYS).sort((a, b) => b.length - a.length).map(esc).join('|')})(?![\\p{L}])`,
  'gu',
);

/** Deutsche Einheiten-/Größenwörter in einem Text in die aktuelle Sprache übersetzen (de → unverändert). */
export function lw(s: string): string {
  if (getLang() === 'de') return s;
  return s.replace(RE, (m) => t(`core.w.${KEYS[m] ?? ''}`));
}
