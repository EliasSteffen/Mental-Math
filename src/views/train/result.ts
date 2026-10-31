// Rundenergebnis (Artboard „Ergebnis“): Kopf, Ergebnis-Segmente, Erkenntnis (E20), Status Line,
// Aufgabenliste (falsche zuerst, richtige aufklappbar) und Dock mit „Fehler üben“ / „Fertig“ / „Nochmal“.
import { fmtSeconds } from '../../core/numbers.ts';
import { SUBTYPES } from '../../core/catalog.ts';
import { getMethod } from '../../core/methods.ts';
import { modeName } from '../../core/modes.ts';
import { dayKey } from '../../core/progress.ts';
import { dailyShareText } from '../../core/daily.ts';
import { addSession, getActivity, getSettings, setDailyResult } from '../../data/storage.ts';
import { go, addCleanup } from '../../router.ts';
import { toast } from '../../ui/toast.ts';
import { h } from '../../ui/dom.ts';
import { setTitle } from '../../ui/title.ts';
import { isModalOpen } from '../../ui/modal.ts';
import { button, group, icon, insight, list, resultRow, resultSegments, statusLine, steps } from '../../ui/kit.ts';
import { dock } from '../../ui/dock.ts';
import { isSheetOpen, openSheet } from '../../ui/sheet.ts';
import { safeSteps } from '../../ui/widgets.ts';
import { answerText, givenAnswerText, roundInsight, type RoundInsight } from './diagnosis.ts';
import type { TrainCtx, TrainResult } from './index.ts';
import { t } from '../../i18n/index.ts';

/** Gegebene Antwort als Text (Auswahl-Option oder Zahl mit Einheit, wie evaluate() sie gewertet hat). */
function givenText(r: TrainResult): string {
  if (r.given === null) return '–';
  if (r.task.kind === 'choice') return String(r.task.choices[r.given] ?? '–');
  return givenAnswerText(r.task, r.given);
}

/** Erkenntnis-Karte (E20): häufigster Fehlertyp mit einem Tipp. */
function insightCard(ins: RoundInsight): HTMLElement {
  const sub = SUBTYPES[ins.subtype];
  const subTip = sub?.tip || getMethod(ins.subtype)?.idea || '';
  const title = {
    nullen: () => t('train.insightZeros', { n: ins.count }),
    knapp: () => t('train.insightClose', { n: ins.count }),
    falsch: () => t('train.insightWrong', { n: ins.count, sub: sub ? sub.name : ins.subtype }),
    skip: () => t('train.insightSkip', { n: ins.count }),
  }[ins.type]();
  const tip = ins.type === 'nullen' ? t('train.tipZeros')
    : subTip || (ins.type === 'knapp' ? t('train.tipClose') : t('train.tipSkip'));
  return insight({ icon: 'bulb', tone: 'warn', title, text: t('train.insightTip', { tip }) });
}

/** Lösungsweg einer Aufgabe im modalen Sheet. */
function openTaskSheet(r: TrainResult): void {
  const list = safeSteps(r.task);
  openSheet({
    title: r.task.prompt,
    children: [
      list.length ? steps(list) : h('p', { class: 'train-sheet-empty' }, t('train.noSteps')),
      SUBTYPES[r.task.subtype] && getMethod(r.task.subtype)
        ? button({ label: t('train.openInLearn'), kind: 'link', icon: 'book', href: `#/lernen/${r.task.subtype}` })
        : null,
    ],
  });
}

/** Zeile einer Aufgabe: Punkt (richtig/falsch), Aufgabe, darunter deine/richtige Antwort bzw. Zeit. */
function taskRow(r: TrainResult): HTMLElement {
  const ok = r.ev.correct;
  const right = answerText(r.task);
  const sub = ok
    ? `${fmtSeconds(r.timeMs)} · +${t('common.pointsValue', { n: r.ev.points })}`
    : r.given === null ? t('train.rowSkipped', { right }) : t('train.rowWrong', { given: givenText(r), right });
  return resultRow({ ok, label: r.task.prompt, sub, onClick: () => openTaskSheet(r) });
}

export function showResult(ctx: TrainCtx): void {
  ctx.stop();
  const { mode, results, root } = ctx;
  const n = results.length;
  const correct = results.filter((r) => r.ev.correct).length;
  const totalMs = results.reduce((s, r) => s + r.timeMs, 0);
  const avg = n ? totalMs / n : 0;

  addSession({ id: ctx.sessionId, ts: ctx.startedAt, mode, n, correct, points: ctx.points, avgTimeMs: Math.round(avg) });

  let shareBtn: HTMLElement | null = null;
  if (ctx.dailyKey) {
    const dateKey = ctx.dailyKey;
    const dres = { n, correct, points: ctx.points, timeMs: totalMs, ts: Date.now() };
    setDailyResult(dateKey, dres);
    shareBtn = button({
      label: t('train.share'), icon: 'upload',
      onClick: () => {
        const text = dailyShareText(dres, dateKey, location.origin + location.pathname);
        if (typeof navigator.share === 'function') {
          navigator.share({ text }).catch(() => { /* abgebrochen */ });
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => { toast(t('train.copied')); }, () => { toast(t('train.copyFail')); });
        }
      },
    });
  }

  // Smart Retry: falsch, übersprungen oder deutlich zu langsam – angeboten wird es nur bei Fehlern
  const weak = results.filter((r) => !r.ev.correct || r.given === null || r.timeMs > 1.5 * r.task.targetMs).map((r) => r.task);
  const retryBtn = correct < n && weak.length > 0
    ? button({
      label: t('train.practiceMistakes'), kind: 'soft', icon: 'refresh',
      onClick: () => {
        try { sessionStorage.setItem('mm.retry', JSON.stringify(weak)); } catch { toast(t('train.notPossible')); return; }
        go('#/train/retry');
      },
    })
    : null;

  // Aufgaben: falsche zuerst; richtige hinter „N richtige anzeigen“
  const wrongRows = results.filter((r) => !r.ev.correct).map(taskRow);
  const rightRows = results.filter((r) => r.ev.correct).map((r) => {
    const el = taskRow(r);
    el.hidden = true;
    return el;
  });
  let toggle: HTMLButtonElement | null = null;
  if (rightRows.length) {
    let open = false;
    const label = h('span', null, t('train.showCorrect', { n: rightRows.length }));
    toggle = h('button', {
      type: 'button', class: 'train-more press', 'aria-expanded': 'false',
      onclick: () => {
        open = !open;
        toggle?.setAttribute('aria-expanded', String(open));
        label.textContent = open ? t('train.hideCorrect') : t('train.showCorrect', { n: rightRows.length });
        for (const el of rightRows) el.hidden = !open;
      },
    }, label, h('span', { class: 'train-more-chevron' }, icon('chevron-down', 18)));
  }

  const settings = getSettings();
  const todayMin = (getActivity()[dayKey(Date.now())] ?? 0) / 60000;
  const ins = roundInsight(results);
  const tasksText = n === 1 ? t('train.tasksOne') : t('train.tasksMany', { n });

  // Überschrift bekommt den Fokus: Screenreader lesen „8 von 10 richtig“, Enter = Nochmal, Esc = Übersicht
  const title = h('h1', { class: 'train-result-title num', tabindex: '-1' }, t('train.resultScore', { good: correct, n }));
  const again = button({ label: t('common.again'), kind: 'primary', full: true, onClick: () => go(ctx.restart) });
  root.replaceChildren(
    h('div', { class: 'stage is-start train-result' },
      h('header', { class: 'train-result-head' },
        h('p', { class: 'train-result-sub' }, `${modeName(mode)} · ${tasksText}`),
        title,
        h('p', { class: 'train-result-avg num' }, t('train.avgPerTask', { time: fmtSeconds(avg) }))),
      n ? resultSegments(results.map((r) => r.ev.correct)) : null,
      ins ? insightCard(ins) : null,
      statusLine({ todayMin, goalMin: settings.dailyGoalMin || 15, xp: ctx.points }),
      n ? group({ title: t('train.tasks'), meta: wrongRows.length ? t('train.wrongFirst') : undefined },
        list([...wrongRows, toggle, ...rightRows])) : null),
    dock(
      h('div', { class: 'train-result-actions' },
        retryBtn,
        button({ label: t('train.done'), href: '#/' }),
        shareBtn),
      again));

  // Enter = Nochmal, Esc = Übersicht (nicht bei offenem Sheet/Modal oder in Buttons/Links)
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isSheetOpen() || isModalOpen()) return;
    const el = e.target;
    if (e.key === 'Enter') {
      if (el instanceof Element && el.closest('a, button, summary, input, textarea, select')) return;
      e.preventDefault();
      go(ctx.restart);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      go('#/');
    }
  };
  document.addEventListener('keydown', onKey);
  addCleanup(() => document.removeEventListener('keydown', onKey));
  setTitle(t('common.roundDone'));
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });
}
