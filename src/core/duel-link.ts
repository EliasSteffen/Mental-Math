// Freund herausfordern ohne Server (v9 I): Aufgabensatz + eigenes Ergebnis stecken als base64url-JSON im Link.
// Der Link ist untrusted Eingabe: strenge Prüfung, Zahlen begrenzt, Name nur zur Anzeige per textContent.
import type { CategoryId, Level, Task } from '../types.ts';
import { CATEGORIES, SUBTYPES, mixCategories } from './catalog.ts';
import { DAILY_COUNT, DAILY_LEVEL, dailyTasks, mulberry32 } from './daily.ts';
import { generate } from './generators/index.ts';
import { pick } from './numbers.ts';

export const DUEL_MAX_LEN = 600;
export const DUEL_NAME_MAX = 24;
export const DUEL_LENGTHS = [5, 10, 15] as const;
export type DuelLength = (typeof DUEL_LENGTHS)[number];
/** Höchstwerte für Punkte und Gesamtzeit (ms) */
const MAX_POINTS = 99_999;
const MAX_TIME_MS = 3_600_000;

/** Aufgabensatz: ohne Ergebnis des Absenders */
export interface DuelBase {
  kind: 'set' | 'daily';
  /** nur 'set' (32 Bit) */
  seed?: number;
  /** nur 'daily' (YYYY-MM-DD) */
  day?: string;
  cat: CategoryId | 'all';
  n: DuelLength;
  lvl: Level;
}

/** Ergebnis eines Spielers: richtige, Punkte, Gesamtzeit in ms */
export interface DuelStats { c: number; p: number; t: number }

export interface DuelPayload extends DuelBase, DuelStats {
  v: 1;
  name?: string;
}

/** Steuer-, Format- und Richtungszeichen, die in einem Namen nichts verloren haben */
const BAD_NAME_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]');
const BAD_NAME_CHARS_G = new RegExp(BAD_NAME_CHARS.source, 'g');

/** Anzeigename bereinigen (gespeicherte Einstellung, Eingabefeld): ohne Steuerzeichen, höchstens 24 Zeichen */
export function cleanDuelName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return Array.from(raw.replace(BAD_NAME_CHARS_G, ' ').replace(/\s+/g, ' ').trim()).slice(0, DUEL_NAME_MAX).join('');
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function validDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

const playableCats = (): string[] => CATEGORIES.filter((c) => !c.hidden).map((c) => c.id);

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Payload als base64url-JSON; Werte werden vorher begrenzt, damit das Ergebnis immer wieder dekodierbar ist. */
export function encodeDuel(p: DuelPayload): string {
  const name = cleanDuelName(p.name);
  const out: Record<string, unknown> = {
    v: 1, kind: p.kind,
    ...(p.kind === 'daily' ? { day: p.day } : { seed: (p.seed ?? 0) >>> 0 }),
    cat: p.cat, n: p.n, lvl: p.lvl,
    ...(name ? { name } : {}),
    c: clamp(Math.round(p.c), 0, p.n), p: clamp(Math.round(p.p), 0, MAX_POINTS), t: clamp(Math.round(p.t), 0, MAX_TIME_MS),
  };
  return toB64Url(new TextEncoder().encode(JSON.stringify(out)));
}

/** Prüft und normalisiert einen Link-Payload; bei jeder Abweichung null (wirft nie). */
export function decodeDuel(raw: unknown): DuelPayload | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > DUEL_MAX_LEN) return null;
  const bytes = fromB64Url(raw);
  if (!bytes) return null;
  let o: unknown;
  try {
    o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (r['v'] !== 1) return null;
  const kind = r['kind'];
  if (kind !== 'set' && kind !== 'daily') return null;
  const cat = r['cat'];
  if (cat !== 'all' && !(typeof cat === 'string' && playableCats().includes(cat))) return null;
  const n = r['n'];
  if (n !== 5 && n !== 10 && n !== 15) return null;
  const lvl = r['lvl'];
  if (lvl !== 1 && lvl !== 2 && lvl !== 3) return null;
  const { c, p, t } = r;
  if (!isInt(c) || !isInt(p) || !isInt(t)) return null;
  let name: string | undefined;
  if (r['name'] !== undefined) {
    const nm = r['name'];
    if (typeof nm !== 'string' || nm.length === 0 || Array.from(nm).length > DUEL_NAME_MAX || BAD_NAME_CHARS.test(nm)) return null;
    name = nm;
  }
  const stats = { p: clamp(p, 0, MAX_POINTS), t: clamp(t, 0, MAX_TIME_MS), ...(name ? { name } : {}) };
  if (kind === 'daily') {
    const day = r['day'];
    if (!validDay(day)) return null;
    // Daily ist immer die feste Tagesrunde
    return { v: 1, kind, day, cat: 'all', n: DAILY_COUNT, lvl: DAILY_LEVEL, c: clamp(c, 0, DAILY_COUNT), ...stats };
  }
  const seed = r['seed'];
  if (!isInt(seed) || seed < 0 || seed > 0xffffffff) return null;
  return { v: 1, kind, seed, cat: cat as CategoryId | 'all', n, lvl, c: clamp(c, 0, n), ...stats };
}

/** Nur der Satz ohne Ergebnis (Revanche, Ergebniskontext) */
export function duelBase(p: DuelBase): DuelBase {
  return p.kind === 'daily'
    ? { kind: 'daily', day: p.day ?? '', cat: 'all', n: DAILY_COUNT, lvl: DAILY_LEVEL }
    : { kind: 'set', seed: (p.seed ?? 0) >>> 0, cat: p.cat, n: p.n, lvl: p.lvl };
}

/** Deterministische Aufgaben: gleicher Payload → gleiche Aufgaben (Daily = Tagesrunde, Set = Seed + feste Stufe) */
export function duelTasks(p: DuelBase): Task[] {
  if (p.kind === 'daily') return dailyTasks(p.day ?? '');
  const seed = (p.seed ?? 0) >>> 0;
  const rng = mulberry32(seed);
  const cats = p.cat === 'all' ? mixCategories(null).map((c) => c.id) : [p.cat];
  const out: Task[] = [];
  for (let i = 0; i < p.n; i++) {
    const cat = cats[i % cats.length];
    if (!cat) break;
    const ids = Object.values(SUBTYPES).filter((s) => s.category === cat).map((s) => s.id);
    if (ids.length === 0) break;
    const task = generate(pick(ids, rng), rng, { level: p.lvl });
    task.id = `duel-${seed}-${i}`;
    task.mode = 'duel';
    out.push(task);
  }
  return out;
}

export type DuelOutcome = 'win' | 'lose' | 'draw';

/** Mehr richtige gewinnt; Gleichstand → weniger Gesamtzeit; sonst unentschieden */
export function duelOutcome(me: Pick<DuelStats, 'c' | 't'>, them: Pick<DuelStats, 'c' | 't'>): DuelOutcome {
  if (me.c !== them.c) return me.c > them.c ? 'win' : 'lose';
  if (me.t !== them.t) return me.t < them.t ? 'win' : 'lose';
  return 'draw';
}

/** Neuer zufälliger 32-Bit-Seed */
export function newDuelSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}
