// Teilbare Ergebniskarte (DOM-frei, testbar): Modell aus den Rundendaten (Training/Daily/Eigenes, Parallel)
// und kleine Layout-Helfer. Gezeichnet wird in ui/share-card.ts; ohne Nutzernamen auf der Karte.
import { locale, t } from '../i18n/index.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { modeName } from '../core/modes.ts';
import { dailyShareText } from '../core/daily.ts';
import { dayKey } from '../core/progress.ts';
import { APP_TITLE } from '../ui/title.ts';

export interface CardStat { label: string; value: string }

export interface ShareCard {
  /** Modusname bzw. „Daily Challenge“, „Paralleles Kettenrechnen · Level 2“ */
  title: string;
  /** stats[0] ist die Hauptzahl (groß), die übrigen stehen als Kacheln darunter */
  stats: CardStat[];
  /** richtig/falsch je Aufgabe bzw. Kette (wie die Ergebnis-Segmente) */
  marks: boolean[];
  /** Datum der Runde (beim Daily: Tag der Challenge), lang formatiert */
  date: string;
  footer: { app: string; host: string };
  /** Begleittext beim Teilen, endet mit dem Link */
  text: string;
  fileName: string;
}

export interface TrainCardInput {
  kind: 'train';
  mode: string;
  n: number;
  correct: number;
  points: number;
  totalMs: number;
  /** Ende der Runde */
  ts: number;
  /** dayKey, nur im Daily-Modus */
  dailyKey: string | null;
  marks: boolean[];
}

export interface ParallelCardInput {
  kind: 'parallel';
  level: number;
  correct: number;
  total: number;
  points: number;
  /** Bestwert: meiste Ketten fehlerfrei (0 = noch keiner) */
  bestChains: number;
  /** Beste Serie fehlerfreier Runden */
  bestStreak: number;
  ts: number;
  marks: boolean[];
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → lokales Datum (12 Uhr, DST-sicher) oder null. */
function parseDay(key: string): Date | null {
  const m = DAY_RE.exec(key);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

/** „1. November 2026“ / „November 1, 2026“ */
export function cardDate(d: Date): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** Host der öffentlichen Adresse für die Fußzeile ('' bei ungültiger URL). */
export function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

const dash = (n: number, s: string): string => (n > 0 ? s : '–');

/** Karte aus den Rundendaten; url = publicUrl() (Fußzeile und Link im Begleittext). */
export function buildShareCard(input: TrainCardInput | ParallelCardInput, url: string): ShareCard {
  const footer = { app: APP_TITLE, host: hostOf(url) };
  if (input.kind === 'parallel') {
    const title = `${t('parallel.title')} · ${t('common.levelN', { n: input.level })}`;
    const main = { label: t('core.card.chainsCorrect'), value: `${input.correct}/${input.total}` };
    const rounds = input.bestStreak === 1 ? t('core.card.roundsOne', { n: 1 }) : t('core.card.roundsMany', { n: fmt(input.bestStreak) });
    return {
      title,
      stats: [
        main,
        { label: t('core.card.points'), value: fmt(input.points) },
        { label: t('core.card.bestChains'), value: dash(input.bestChains, t('core.card.chainsN', { n: input.bestChains })) },
        { label: t('core.card.bestStreak'), value: dash(input.bestStreak, rounds) },
      ],
      marks: [...input.marks],
      date: cardDate(new Date(input.ts)),
      footer,
      text: t('core.card.text', { app: APP_TITLE, title, score: `${main.value} ${main.label}`, url }),
      fileName: `mental-math-parallel-${dayKey(input.ts)}.png`,
    };
  }

  const { n, correct, points, totalMs } = input;
  const daily = input.dailyKey ? parseDay(input.dailyKey) : null;
  const title = daily ? t('core.mode.daily') : modeName(input.mode);
  const main = { label: t('core.card.correct'), value: `${correct}/${n}` };
  const pct = n ? Math.round((correct / n) * 100) : 0;
  const text = input.dailyKey
    ? dailyShareText({ n, correct, points, timeMs: totalMs, ts: input.ts }, input.dailyKey, url)
    : t('core.card.text', { app: APP_TITLE, title, score: `${main.value} ${main.label}`, url });
  return {
    title,
    stats: [
      main,
      { label: t('core.card.accuracy'), value: t('analyse.percent', { n: fmt(pct, 0) }) },
      { label: t('core.card.avgTime'), value: fmtSeconds(n ? totalMs / n : 0) },
      { label: t('core.card.points'), value: fmt(points) },
    ],
    marks: [...input.marks],
    date: cardDate(daily ?? new Date(input.ts)),
    footer,
    text,
    fileName: input.dailyKey ? `mental-math-daily-${input.dailyKey}.png` : `mental-math-${dayKey(input.ts)}.png`,
  };
}

/** Kurzfassung für den Alternativtext der Vorschau: „Prozente: 8/10 richtig, Genauigkeit 80 %, …“ */
export function cardSummary(card: ShareCard): string {
  const [main, ...rest] = card.stats;
  const parts = [main ? `${main.value} ${main.label}` : '', ...rest.map((s) => `${s.label} ${s.value}`)].filter(Boolean);
  return `${card.title}, ${card.date}: ${parts.join(', ')}`;
}

/* ---------- Layout-Helfer für den Renderer (Messfunktion wird übergeben) ---------- */

export type Measure = (text: string, size: number) => number;

/** Zeilenumbruch an Leerzeichen; ein einzelnes zu langes Wort bleibt allein in seiner Zeile. */
export function wrapLines(text: string, maxWidth: number, size: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, size) > maxWidth) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Größte Schriftgröße aus `sizes` (absteigend), bei der der Text in höchstens maxLines Zeilen passt.
 * Passt er auch in der kleinsten nicht: kleinste Größe, nach maxLines Zeilen mit „…“ gekürzt.
 */
export function fitLines(text: string, maxWidth: number, maxLines: number, sizes: readonly number[], measure: Measure):
  { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrapLines(text, maxWidth, size, measure);
    if (lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxWidth)) return { size, lines };
  }
  const size = sizes[sizes.length - 1] ?? 16;
  const all = wrapLines(text, maxWidth, size, measure);
  const lines = all.slice(0, maxLines);
  const last = lines.length - 1;
  if (last >= 0 && (all.length > maxLines || measure(lines[last] ?? '', size) > maxWidth)) {
    let s = lines[last] ?? '';
    while (s && measure(`${s}…`, size) > maxWidth) s = s.slice(0, -1).trimEnd();
    lines[last] = `${s}…`;
  }
  return { size, lines };
}

/** '#3A5A8A' bzw. '#abc' mit Deckkraft → 'rgba(…)'; andere Farbangaben → null (dann ohne Verlauf). */
export function rgba(color: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
