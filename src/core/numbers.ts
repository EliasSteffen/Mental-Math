// Formatieren, Parsen, Zufall
import { getLang, locale } from '../i18n/index.ts';

/** Zufallsquelle: liefert Werte in [0, 1) */
export type Rng = () => number;

export function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

export function fmt(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return '–';
  const r = round(n, maxDecimals);
  const s = new Intl.NumberFormat(locale(), {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(Math.abs(r));
  // de-DE gruppiert 4-stellige Zahlen nicht immer; manuell sicherstellen
  const out = getLang() === 'de' ? fixGrouping(s) : s;
  return r < 0 ? '−' + out : out;
}

function fixGrouping(s: string): string {
  const [int = '', dec] = s.split(',');
  if (int.includes('.') || int.length < 4) return s;
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === undefined ? g : g + ',' + dec;
}

export function fmtSeconds(ms: number): string {
  return fmt(ms / 1000, 1) + ' s';
}

export function unitFactor(unit: unknown): number {
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (u.startsWith('Tsd.')) return 1e3;
  if (u.startsWith('Mio.')) return 1e6;
  if (u.startsWith('Mrd.')) return 1e9;
  // englische Anzeige-Einheiten: K / M / B (nur als eigenes Wort, nicht „km“ o. ä.)
  const en = /^(K|M|B)(?=$|[\s€/])/.exec(u)?.[1];
  return en === 'K' ? 1e3 : en === 'M' ? 1e6 : en === 'B' ? 1e9 : 1;
}

const SUFFIXES: Record<string, number> = {
  k: 1e3, tsd: 1e3, tausend: 1e3,
  mio: 1e6, million: 1e6, millionen: 1e6,
  mrd: 1e9, bn: 1e9, milliarde: 1e9, milliarden: 1e9,
};
const SUFFIX_RE = /^(.*?)\s*(k|tsd|tausend|mio|millionen|million|mrd|bn|milliarden|milliarde)\.?\s*€?\s*$/i;
const SUFFIXES_EN: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mio: 1e6, million: 1e6, millions: 1e6, b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9,
};
const SUFFIX_RE_EN = /^(.*?)\s*(thousand|millions|million|billions|billion|mio|bn|mm|k|m|b)\.?\s*€?\s*$/i;

export function parseAnswer(str: unknown): number | null {
  if (typeof str !== 'string') return null;
  const en = getLang() !== 'de';
  const m = (en ? SUFFIX_RE_EN : SUFFIX_RE).exec(str.trim());
  if (m && (m[1] ?? '').trim() !== '') {
    const base = parseAnswerPlain(m[1] ?? '');
    if (base === null) return null;
    return Number((base * ((en ? SUFFIXES_EN : SUFFIXES)[(m[2] ?? '').toLowerCase()] ?? 1)).toPrecision(12));
  }
  return parseAnswerPlain(str);
}

function parseAnswerPlain(str: string): number | null {
  let s = str.trim().replace(/[\s €%]/g, '').replace(/−/g, '-');
  if (s === '') return null;
  if (getLang() !== 'de') {
    s = s.replace(/,/g, ''); // Englisch: ',' = Tausender, '.' = Dezimal
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function randInt(min: number, max: number, rng: Rng = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[], rng: Rng = Math.random): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}
