// Daily Challenge: für alle Nutzer am selben Tag dieselben 15 Aufgaben (seeded RNG)
import type { DailyResult, Level, Task } from '../types.ts';
import { t } from '../i18n/index.ts';
import { fmt, pick } from './numbers.ts';
import type { Rng } from './numbers.ts';
import { SUBTYPES, mixCategories } from './catalog.ts';
import { generate } from './generators/index.ts';

export const DAILY_COUNT = 15;
export const DAILY_LEVEL: Level = 2;

/** Kleiner, schneller 32-Bit-PRNG (Werte in [0, 1)) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a-Hash eines Strings → 32-Bit-Seed */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 15 deterministische Aufgaben (Level 2) aus allen sichtbaren Kategorien ohne Drills, reihum in CATEGORIES-Reihenfolge */
export function dailyTasks(dateKey: string): Task[] {
  const rng = mulberry32(seedFromString(`daily:${dateKey}`));
  const cats = mixCategories(null);
  const out: Task[] = [];
  for (let i = 0; i < DAILY_COUNT; i++) {
    const cat = cats[i % cats.length];
    if (!cat) break;
    const ids = Object.values(SUBTYPES).filter((s) => s.category === cat.id).map((s) => s.id);
    const t = generate(pick(ids, rng), rng, { level: DAILY_LEVEL });
    t.id = `daily-${dateKey}-${i}`;
    t.mode = 'daily';
    out.push(t);
  }
  return out;
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** „Mental Math Daily 30.10.2026: 13/15 · 1.240 Pkt · 2:31 min\n<url>“ */
export function dailyShareText(r: DailyResult, dateKey: string, url: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const date = m ? t('core.daily.date', { d: m[3] ?? '', m: m[2] ?? '', y: m[1] ?? '' }) : dateKey;
  return t('core.daily.share', { date, correct: r.correct, n: r.n, points: fmt(r.points), time: mmss(r.timeMs), url });
}
