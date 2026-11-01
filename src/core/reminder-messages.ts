// Texte der Erinnerungen (de/en) aus Art + Lernstand. DOM-frei: Server (Web Push) und iOS-App (lokale Benachrichtigungen).
import { SUBTYPES, CATEGORIES } from './catalog.ts';
import { getMethod } from './methods.ts';
import { getLang, setLang } from '../i18n/index.ts';
import type { Lang } from '../i18n/index.ts';
import { localDay, reviewsDueAt, streakAtRisk } from './reminders.ts';
import type { ReminderKind, ReminderState } from './reminders.ts';

export interface PushMessage {
  title: string;
  body: string;
  /** Ziel beim Antippen (gleiche Origin, Hash-Route) */
  url: string;
  /** Gleiches Tag ersetzt eine ältere Benachrichtigung in der Mitteilungszentrale */
  tag: string;
}

export type MessageKind = ReminderKind | 'test';

export interface MessageContext {
  lang: Lang;
  state: ReminderState | null;
  now: number;
  tz: string;
}

const TEXT = {
  de: {
    dailyTitle: 'Zeit für Kopfrechnen',
    dailyBody: ['{goal} Minuten heute halten dich in Form.', 'Eine kurze Runde – dein Kopf wird es dir danken.', 'Die Tages-Challenge wartet: 15 Aufgaben, gleich für alle.'],
    dailyLeft: 'Noch {left} Minuten bis zu deinem Tagesziel.',
    dailyReview: 'Dazu warten {reviews} auf Wiederholung.',
    streakTitle: '🔥 {streak} in Folge',
    streakDaily: 'Heute {left} Minuten, dann hält deine Serie.',
    streakBody: 'Trainiere heute noch {left} Minuten, sonst reißt deine Serie um Mitternacht.',
    reviewTitle: 'Wiederholung fällig',
    reviewBody: '{reviews} von früheren Fehlern sind dran. Dauert nur ein paar Minuten.',
    tipTitle: 'Rechentrick: {name}',
    testTitle: 'Erinnerungen sind an',
    testBody: 'So sehen deine Benachrichtigungen aus.',
    days: (n: number): string => (n === 1 ? '1 Tag' : `${n} Tage`),
    types: (n: number): string => (n === 1 ? '1 Aufgabentyp' : `${n} Aufgabentypen`),
  },
  en: {
    dailyTitle: 'Time for mental math',
    dailyBody: ['{goal} minutes today keep you sharp.', 'A short round – your brain will thank you.', 'Today’s challenge is waiting: 15 tasks, the same for everyone.'],
    dailyLeft: '{left} more minutes to reach your daily goal.',
    dailyReview: 'Plus {reviews} waiting for review.',
    streakTitle: '🔥 {streak} in a row',
    streakDaily: '{left} minutes today keep your streak alive.',
    streakBody: 'Train {left} more minutes today, or your streak ends at midnight.',
    reviewTitle: 'Review due',
    reviewBody: '{reviews} from earlier mistakes are up. Takes just a few minutes.',
    tipTitle: 'Math trick: {name}',
    testTitle: 'Reminders are on',
    testBody: 'This is what your notifications look like.',
    days: (n: number): string => (n === 1 ? '1 day' : `${n} days`),
    types: (n: number): string => (n === 1 ? '1 task type' : `${n} task types`),
  },
} as const;

const fill = (s: string, p: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? ''));

/** Kürzt auf `max` Zeichen an einer Wortgrenze. */
export function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** Kalenderwoche seit 1970 (für die Rotation der Tipps) */
const weekNo = (now: number): number => Math.floor((now / 86_400_000 + 3) / 7);

/** Aufgabentypen mit Methode, die in gemischten Runden vorkommen (ohne versteckte Kategorien). */
function tipCandidates(): string[] {
  const visible = new Set<string>(CATEGORIES.filter((c) => !c.hidden).map((c) => c.id));
  return Object.keys(SUBTYPES).filter((id) => visible.has(SUBTYPES[id]?.category ?? '') && getMethod(id, 'de') !== null).sort();
}

/** Tipp-Thema: zuerst eine gemeldete Schwäche (rotiert wöchentlich), sonst reihum alle Typen. */
export function pickTipSubtype(state: ReminderState | null, now: number): string | null {
  const all = tipCandidates();
  const weak = (state?.weak ?? []).filter((id) => all.includes(id));
  const pool = weak.length ? weak : all;
  return pool.length ? (pool[weekNo(now) % pool.length] ?? null) : null;
}

/** Name eines Aufgabentyps in `lang` (die Katalognamen hängen an der globalen Sprache). */
function subtypeName(id: string, lang: Lang): string {
  const prev = getLang();
  setLang(lang);
  try {
    return SUBTYPES[id]?.name ?? id;
  } finally {
    setLang(prev);
  }
}

export function composeMessage(kind: MessageKind, c: MessageContext): PushMessage {
  const T = TEXT[c.lang];
  const today = localDay(c.now, c.tz);
  const s = c.state;
  const goal = s?.goalMin ?? 15;
  const left = Math.max(1, goal - (s && s.day === today ? s.todayMin : 0));
  const tag = 'mm-reminder';
  switch (kind) {
    case 'daily': {
      const streak = streakAtRisk(s, today);
      const reviews = reviewsDueAt(s, c.now);
      if (streak >= 2) {
        return { title: fill(T.streakTitle, { streak: T.days(streak) }), body: fill(T.streakDaily, { left }), url: '/#/', tag };
      }
      const started = s !== null && s.day === today && s.todayMin > 0;
      const variant = Math.floor(c.now / 86_400_000) % T.dailyBody.length;
      const base = started ? fill(T.dailyLeft, { left }) : fill(T.dailyBody[variant] ?? T.dailyBody[0], { goal });
      const body = reviews > 0 ? `${base} ${fill(T.dailyReview, { reviews: T.types(reviews) })}` : base;
      const url = reviews > 0 ? '/#/train/review' : !started && variant === 2 ? '/#/train/daily' : '/#/';
      return { title: T.dailyTitle, body, url, tag };
    }
    case 'streak': {
      const streak = Math.max(1, streakAtRisk(s, today));
      return { title: fill(T.streakTitle, { streak: T.days(streak) }), body: fill(T.streakBody, { left }), url: '/#/', tag };
    }
    case 'review': {
      const reviews = Math.max(1, reviewsDueAt(s, c.now));
      return { title: T.reviewTitle, body: fill(T.reviewBody, { reviews: T.types(reviews) }), url: '/#/train/review', tag };
    }
    case 'tip': {
      const id = pickTipSubtype(s, c.now);
      const method = id ? getMethod(id, c.lang) : null;
      if (!id || !method) return { title: T.dailyTitle, body: fill(T.dailyBody[0], { goal }), url: '/#/', tag };
      return { title: clip(fill(T.tipTitle, { name: subtypeName(id, c.lang) }), 60), body: clip(method.trick, 180), url: `/#/lernen/${id}`, tag };
    }
    case 'test':
      return { title: T.testTitle, body: T.testBody, url: '/#/profil', tag: 'mm-test' };
  }
}
