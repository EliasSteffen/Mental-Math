import { fmt, fmtSeconds } from '../../core/numbers.ts';
import { SUBTYPES } from '../../core/catalog.ts';
import { categoryStats, subtypeStats, overall } from '../../core/scoring.ts';
import { modeName } from '../../core/modes.ts';
import { addSession, getAttempts, setDailyResult } from '../../data/storage.ts';
import { go } from '../../router.ts';
import { dailyShareText } from '../../core/daily.ts';
import { toast } from '../../ui/charts.ts';
import { h } from '../../ui/dom.ts';
import { fold, level, safeSteps, stepsList, tile } from '../../ui/widgets.ts';
import type { TrainCtx } from './index.ts';

export function showResult(ctx: TrainCtx): void {
  ctx.stop();
  const { mode, results, root } = ctx;
  const n = results.length;
  const correct = results.filter((r) => r.ev.correct).length;
  const avg = n ? results.reduce((s, r) => s + r.timeMs, 0) / n : 0;
  const all = getAttempts();
  const sk: number | null | undefined = SUBTYPES[mode]
    ? subtypeStats(all)[mode]?.score
    : mode !== 'all' && mode !== 'weak' ? categoryStats(all)[mode]?.score : overall(all).score;

  addSession({ id: ctx.sessionId, ts: ctx.startedAt, mode, n, correct, points: ctx.points, avgTimeMs: Math.round(avg) });

  let dailyBtn: HTMLElement | null = null;
  if (ctx.dailyKey) {
    const dateKey = ctx.dailyKey;
    const dres = { n, correct, points: ctx.points, timeMs: results.reduce((s, r) => s + r.timeMs, 0), ts: Date.now() };
    setDailyResult(dateKey, dres);
    dailyBtn = h('button', {
      type: 'button', class: 'btn',
      onclick: () => {
        const text = dailyShareText(dres, dateKey, location.origin + location.pathname);
        if (typeof navigator.share === 'function') {
          navigator.share({ text }).catch(() => { /* abgebrochen */ });
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => { toast('Kopiert'); }, () => { toast('Kopieren nicht möglich'); });
        }
      },
    }, 'Teilen');
  }

  // Smart Retry: falsch, übersprungen oder deutlich zu langsam
  const weak = results.filter((r) => !r.ev.correct || r.given === null || r.timeMs > 1.5 * r.task.targetMs).map((r) => r.task);
  const retryBtn = weak.length > 0
    ? h('button', {
      type: 'button', class: 'btn',
      onclick: () => {
        try { sessionStorage.setItem('mm.retry', JSON.stringify(weak)); } catch { toast('Nicht möglich'); return; }
        location.hash = '#/train/retry';
      },
    }, 'Fehler & langsame wiederholen')
    : null;

  const list = h('ul', { class: 'list' });
  for (const r of results) {
    const ok = r.ev.correct;
    const unit = r.task.unit ? ` ${r.task.unit}` : '';
    const rc = r.task.kind === 'choice' && Array.isArray(r.task.choices) ? r.task.choices : null;
    const mid = rc
      ? (ok ? String(rc[r.task.expected]) : `${r.given === null ? '–' : rc[r.given]} → ${rc[r.task.expected]}`)
      : ok
      ? `${fmt(r.task.expected)}${unit}`
      : `${r.given === null ? '–' : fmt(r.given)} → ${fmt(r.task.expected)}${unit}`;
    const steps = safeSteps(r.task);
    list.append(h('li', null,
      h('span', { class: `mark ${ok ? 'good' : 'bad'}`, 'aria-label': ok ? 'richtig' : 'falsch' }, ok ? '✓' : '✗'),
      h('span', { class: 'item-main' }, r.task.prompt),
      h('span', { class: 'item-meta' }, `${fmtSeconds(r.timeMs)} · ${r.ev.points > 0 ? '+' : ''}${r.ev.points}`),
      h('span', { class: 'item-sub' }, mid),
      steps.length ? h('div', { class: 'item-steps' }, fold('Lösungsweg', stepsList(steps), { open: !ok })) : null));
  }

  root.replaceChildren(
    h('h1', { class: 'page-title' }, `Ergebnis · ${modeName(mode)}`),
    h('div', { class: 'stats' },
      tile(String(ctx.points), 'Punkte'),
      tile(`${correct}/${n}`, 'richtig'),
      tile(fmtSeconds(avg), 'Ø Zeit'),
      tile(sk === null || sk === undefined ? '–' : String(sk), 'Skill', level(sk))),
    list,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => go(ctx.restart) }, 'Nochmal'),
      retryBtn,
      dailyBtn,
      h('a', { class: 'btn', href: '#/analyse' }, 'Analyse'),
      h('a', { class: 'btn', href: '#/' }, 'Übersicht')));
  const first = root.querySelector<HTMLElement>('.btn.primary');
  if (first) first.focus();
}
