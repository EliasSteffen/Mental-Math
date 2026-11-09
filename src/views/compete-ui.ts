// Gemeinsame Bausteine der Wettbewerbs-Seiten (Challenge, Wettbewerbe, Rangliste): Titel, Zustände, Zeiten,
// Ergebnis-Erkenntnis und das Formular für den öffentlichen Namen.
import { CHALLENGE_TZ, NAME_MAX, NAME_MIN, dayOfDailyId, normalizeDisplayName } from '../core/challenge.ts';
import type { ChallengeInfo, ChallengeResult, PublicProfile } from '../core/challenge.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { getLang, locale, t } from '../i18n/index.ts';
import { h } from '../ui/dom.ts';
import { button, insight, switchRow } from '../ui/kit.ts';
import { challengeErrorCode, saveProfile } from '../features/challenge.ts';
import type { ChallengeErrorCode } from '../features/challenge.ts';

/** „So., 8. Nov.“ eines Tages (YYYY-MM-DD) bzw. Zeitpunkts – immer in der Challenge-Zeitzone. */
export function dayLabel(dayOrTs: string | number): string {
  const ts = typeof dayOrTs === 'number' ? dayOrTs : Date.parse(`${dayOrTs}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: CHALLENGE_TZ }).format(ts);
}

/** „5 h 12 min“ bzw. „12 min“ (aufgerundet, mindestens 1 min). */
export function timeLeft(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(min / 60);
  return hours > 0 ? t('compete.hoursMinutes', { h: hours, m: min % 60 }) : t('compete.minutes', { m: min });
}

export function challengeTitle(c: Pick<ChallengeInfo, 'id' | 'title'>): string {
  const day = dayOfDailyId(c.id);
  if (day) return t('compete.dailyTitle', { date: dayLabel(day) });
  return c.title?.[getLang()] ?? c.title?.de ?? c.id;
}

/** Zeitraum: „noch 5 h 12 min“, „ab Mo., 16. Nov.“, „beendet“. */
export function whenLine(c: ChallengeInfo, now: number = Date.now()): string {
  const start = Date.parse(c.startsAt);
  const end = Date.parse(c.endsAt);
  if (now < start) return t('compete.startsOn', { date: dayLabel(start) });
  if (now >= end) return t('compete.ended');
  return end - now <= 36 * 3600_000 ? t('compete.endsIn', { left: timeLeft(end - now) }) : t('compete.until', { date: dayLabel(end - 1) });
}

/** Kurzer Zustand für Listen: „offen“, „Platz 3/40“, „13/15“, „läuft“ … */
export function stateValue(c: ChallengeInfo): { text: string; accent: boolean } {
  if (c.state === 'done' && c.result) {
    if (c.result.rank !== null) return { text: t('compete.rankShort', { rank: c.result.rank, total: c.result.total }), accent: false };
    return { text: `${c.result.correct}/${c.result.n}`, accent: false };
  }
  if (c.state === 'open') return { text: t('compete.stateOpen'), accent: true };
  if (c.state === 'running') return { text: t('compete.stateRunning'), accent: true };
  if (c.state === 'upcoming') return { text: t('compete.stateUpcoming'), accent: false };
  return { text: t('compete.stateClosed'), accent: false };
}

export function resultInsight(r: ChallengeResult): HTMLElement {
  if (r.status === 'flagged') return insight({ icon: 'info', tone: 'warn', title: t('compete.flaggedTitle'), text: t('compete.flaggedText') });
  if (r.status === 'expired') return insight({ icon: 'info', tone: 'warn', title: t('compete.expiredTitle'), text: t('compete.expiredText') });
  const title = r.rank !== null ? t('compete.rankOf', { rank: r.rank, total: r.total }) : t('compete.ranked');
  const text = [
    t('compete.correctOf', { correct: r.correct, n: r.n }),
    t('compete.pointsTime', { points: fmt(r.points), time: fmtSeconds(r.timeMs) }),
    r.percentile ? t('compete.percentile', { p: r.percentile }) : null,
  ].filter(Boolean).join(' · ');
  return insight({ icon: 'trophy', tone: r.rank === 1 ? 'good' : 'accent', title, text });
}

export function participantsText(n: number): string {
  return n === 1 ? t('compete.participantsOne') : t('compete.participants', { n });
}

export function errorText(e: unknown): string {
  const code: ChallengeErrorCode = challengeErrorCode(e);
  return t(`compete.err.${code}`);
}

/** Leerer/Lade-/Fehlerzustand einer Seite. */
export function notice(text: string, action?: { label: string; onClick: () => void }): HTMLElement {
  return h('div', { class: 'compete-notice' },
    h('p', { class: 'compete-notice-text' }, text),
    action ? button({ label: action.label, kind: 'soft', onClick: action.onClick }) : null);
}

/**
 * Formular „Dein Name in Ranglisten“: Name (3–20 Zeichen) und Opt-in für globale Ranglisten.
 * Speichert über die API; onSaved bekommt das gespeicherte Profil.
 */
export function profileForm(o: {
  profile: PublicProfile | null; suggestion?: string; submitLabel?: string; onSaved: (p: PublicProfile) => void;
}): HTMLElement {
  const inputId = `cn-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', {
    class: 'prof-input', id: inputId, type: 'text', maxlength: NAME_MAX, autocomplete: 'nickname',
    placeholder: t('compete.namePlaceholder'), value: o.profile?.displayName ?? o.suggestion ?? '',
  });
  const err = h('p', { class: 'prof-err', role: 'alert' });
  let listed = o.profile?.listed ?? true;
  const listedSwitch = switchRow({ label: t('compete.listedLabel'), help: t('compete.listedHelp'), checked: listed, onChange: (v) => { listed = v; } });
  const save = button({ label: o.submitLabel ?? t('compete.saveName'), kind: 'soft', type: 'submit' });
  const form = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('compete.nameLabel')),
    input,
    h('p', { class: 'control-help' }, t('compete.nameHelp', { min: NAME_MIN, max: NAME_MAX })),
    err, listedSwitch.el, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = normalizeDisplayName(input.value);
    if (!name) {
      err.textContent = t('compete.err.name_invalid');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    err.textContent = '';
    save.disabled = true;
    saveProfile(name, listed).then((p) => o.onSaved(p), (ex: unknown) => {
      err.textContent = errorText(ex);
      input.setAttribute('aria-invalid', 'true');
    }).finally(() => { save.disabled = false; });
  });
  return form;
}
