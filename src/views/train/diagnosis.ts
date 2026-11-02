// Fehlerdiagnose (E15) und Runden-Erkenntnis (E20) als reine Funktionen – ohne DOM, damit sie testbar sind.
// Feedback informiert statt zu urteilen: Titel = Diagnose, Detail = was konkret anders war.
import type { Evaluation, Task } from '../../types.ts';
import { fmt, fmtSeconds, unitFactor } from '../../core/numbers.ts';
import { t } from '../../i18n/index.ts';
import { roundInsight as engineRoundInsight } from '../../vendor/learning.ts';
import type { RoundInsight } from '../../vendor/learning.ts';

export type { RoundInsight } from '../../vendor/learning.ts';

export type FeedbackKind = 'good' | 'bad' | 'skip';

export interface Diagnosis {
  kind: FeedbackKind;
  title: string;
  detail: string;
}

export interface DiagnoseInput {
  task: Task;
  given: number | null;
  ev: Pick<Evaluation, 'correct' | 'errorType' | 'points'>;
  timeMs: number;
  /** Auto-Fail: Zeit abgelaufen */
  timedOut?: boolean;
  /** Präzise Zeitanzeige: Punkte im Detail nennen */
  showPoints?: boolean;
  /** Auswahlaufgaben: kurze Begründung (erster Schritt des Lösungswegs) */
  why?: string;
}

/** Richtige Antwort als Text: Auswahl-Option oder Zahl mit Einheit („45“, „3,6 Mio. €“). */
export function answerText(task: Task): string {
  if (task.kind === 'choice') return String(task.choices[task.expected] ?? '');
  return withUnit(fmt(task.expected), task.unit);
}

function withUnit(value: string, unit: string): string {
  return unit ? `${value} ${unit}` : value;
}

/**
 * Zehnerpotenz zwischen Antwort und Lösung, wie evaluate() sie erkennt: Kandidat mit Einheitenfaktor
 * (volle Zahl statt „Mio.“), Prozent als Anteil, Betrag bei pct.change; der Kandidat, der der Lösung am
 * nächsten liegt, zählt. k = 1 heißt „eine Null zu viel“, k = −1 „eine Null zu wenig“.
 */
export function zeroShift(task: Pick<Task, 'expected' | 'unit' | 'subtype'>, given: number): { k: number; value: number } {
  const { expected } = task;
  if (!(expected !== 0 && given !== 0 && Number.isFinite(given))) return { k: 0, value: given };
  const F = unitFactor(task.unit);
  const candidates = [given];
  if (F > 1) candidates.push(given / F);
  if (task.unit === '%') candidates.push(given * 100);
  if (task.subtype === 'pct.change') candidates.push(Math.abs(given));
  let value = given;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(Math.log10(Math.abs(c / expected)));
    if (Number.isFinite(d) && d < bestD) { bestD = d; value = c; }
  }
  return { k: Math.round(Math.log10(Math.abs(value / expected))), value };
}

/**
 * Antwort als Text in der Einheit der Aufgabe: der Kandidat, den evaluate() wertet (volle Zahl → „Mio. €“,
 * Anteil → „%“), damit Zahl und Einheit zusammenpassen („5 Mio. €“ statt „5.000.000 Mio. €“).
 */
export function givenAnswerText(task: Pick<Task, 'expected' | 'unit' | 'subtype'>, given: number): string {
  return withUnit(fmt(zeroShift(task, given).value), task.unit);
}

/** Titel und Detail des Feedbacks (Sheet bei Zahlenaufgaben, Ergebniszeile bei Auswahlaufgaben). */
export function diagnose({ task, given, ev, timeMs, timedOut = false, showPoints = false, why = '' }: DiagnoseInput): Diagnosis {
  const right = answerText(task);
  const choice = task.kind === 'choice';
  const withTimeout = (detail: string): string =>
    timedOut ? [t('train.timeUp'), detail].filter(Boolean).join(' · ') : detail;

  if (ev.correct) {
    const parts = [t('train.fbGoodDetail', { time: fmtSeconds(timeMs), target: fmtSeconds(task.targetMs) })];
    if (showPoints) parts.push(`+${t('common.pointsValue', { n: ev.points })}`);
    return { kind: 'good', title: t('common.correct'), detail: withTimeout(parts.join(' · ')) };
  }

  if (given === null || ev.errorType === 'skip') {
    return choice
      ? { kind: 'skip', title: t('train.fbChoiceSkip', { answer: right }), detail: withTimeout(why) }
      : { kind: 'skip', title: t('train.fbSkip'), detail: withTimeout(t('train.fbSkipDetail', { answer: right })) };
  }

  if (choice) return { kind: 'bad', title: t('train.fbChoiceWrong', { answer: right }), detail: withTimeout(why) };

  if (ev.errorType === 'nullen') {
    const { k } = zeroShift(task, given);
    const title = k === 1 ? t('train.fbZerosMore') : k === -1 ? t('train.fbZerosLess') : t('train.fbZerosShift');
    const detail = t('train.fbZerosDetail', { given: givenAnswerText(task, given), right });
    return { kind: 'bad', title, detail: withTimeout(detail) };
  }

  const yours = t('train.fbYours', { given: givenAnswerText(task, given) });
  const title = ev.errorType === 'knapp' ? t('train.fbClose', { answer: right }) : t('train.fbWrong', { answer: right });
  return { kind: 'bad', title, detail: withTimeout(yours) };
}

/* ---------- Runden-Erkenntnis (E20) ---------- */

/** Häufigster Fehlertyp der Runde samt häufigstem Subtyp – erst ab 2 Fehlern, sonst null (packages/learning-engine). */
export function roundInsight(
  results: ReadonlyArray<{ task: Pick<Task, 'subtype'>; ev: Pick<Evaluation, 'correct' | 'errorType'> }>,
): RoundInsight | null {
  return engineRoundInsight(results.map((r) => ({ subtype: r.task.subtype, correct: r.ev.correct, errorType: r.ev.errorType })));
}
