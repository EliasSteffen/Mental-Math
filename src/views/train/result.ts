// Rundenergebnis (Artboard „Ergebnis“): Kopf, Ergebnis-Segmente, Erkenntnis (E20), Status Line,
// Aufgabenliste (falsche zuerst, richtige aufklappbar) und Dock mit „Fehler üben“ / „Fertig“ / „Ergebnis teilen“ / „Nochmal“.
import { fmt, fmtSeconds } from '../../core/numbers.ts';
import { SUBTYPES } from '../../core/catalog.ts';
import { getMethod } from '../../core/methods.ts';
import { modeName } from '../../core/modes.ts';
import { dayKey } from '../../core/progress.ts';
import { habitInfo } from '../../core/habit.ts'; // v9 B
import { confetti } from '../../ui/charts.ts'; // v9 B
import { roundRecap, type RoundRecap } from '../../core/recap.ts'; // v9 A
import { addSession, getActivity, getAttempts, getSessions, getSettings, setDailyResult, setSettings } from '../../data/storage.ts';
import { go, addCleanup } from '../../router.ts';
import { toast } from '../../ui/toast.ts';
import { h } from '../../ui/dom.ts';
import { setTitle } from '../../ui/title.ts';
import { isModalOpen } from '../../ui/modal.ts';
import { button, group, icon, insight, list, resultRow, resultSegments, statusLine, steps } from '../../ui/kit.ts';
import { progressBar } from '../../ui/charts.ts';
import { dock } from '../../ui/dock.ts';
import { isSheetOpen, openSheet } from '../../ui/sheet.ts';
import { safeSteps } from '../../ui/widgets.ts';
import { answerText, givenAnswerText, roundInsight, type RoundInsight } from './diagnosis.ts';
import type { TrainCtx, TrainResult } from './index.ts';
import { t } from '../../i18n/index.ts';
import { publicUrl, shareText } from '../../platform/index.ts';
import { finishAttempt } from '../../features/challenge.ts';
import type { ChallengeResult } from '../../core/challenge.ts';
import { maybeAskForReview } from '../../features/app-store.ts';
import { buildShareCard } from '../../features/share-card.ts';
import { shareCardButton } from '../../ui/share-card.ts';

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

/** Vergleichszeile unter dem Durchschnitt: nur ab 0,1 s Unterschied (v9 A). */
function vsLastLine(r: RoundRecap): HTMLElement | null {
  const d = r.vsLast?.deltaAvgMs ?? 0;
  if (Math.abs(d) < 100) return null;
  return h('p', { class: `train-result-vs num${d < 0 ? ' is-good' : ''}` },
    t(d < 0 ? 'recap.faster' : 'recap.slower', { time: fmtSeconds(Math.abs(d)) }));
}

/** Neue Bestzeit (v9 A). */
function newBestCard(nb: NonNullable<RoundRecap['newBest']>): HTMLElement {
  return insight({
    icon: 'trophy', tone: 'good', title: t(nb.prevAvgMs === null ? 'recap.firstBest' : 'recap.newBest'),
    text: nb.prevAvgMs === null
      ? t('recap.newBestFirst', { time: fmtSeconds(nb.avgMs) })
      : t('recap.newBestPrev', { time: fmtSeconds(nb.avgMs), prev: fmtSeconds(nb.prevAvgMs) }),
  });
}

/** Skill-Zeile und Level-Karte (v9 A): ruhige Zeilen mit Balken, ohne Effekte. */
function recapBlock(r: RoundRecap): HTMLElement {
  const lv = r.level;
  const rows: Array<HTMLElement | null> = [];
  if (r.skill) {
    const name = SUBTYPES[r.skill.subtype]?.name ?? r.skill.subtype;
    const values = r.skill.before === null
      ? t('recap.skillAfter', { after: r.skill.after })
      : t('recap.skillChange', { before: r.skill.before, after: r.skill.after });
    rows.push(h('div', { class: 'recap-row' },
      h('p', { class: 'recap-line' }, h('span', { class: 'recap-label' }, t('recap.skill', { sub: name })), h('span', { class: 'recap-value num' }, values)),
      progressBar(r.skill.after, { decorative: true })));
  }
  rows.push(h('div', { class: 'recap-row' },
    h('p', { class: 'recap-line' },
      h('span', { class: 'recap-label' }, t('recap.level', { level: lv.level })),
      h('span', { class: 'recap-value num' }, t('recap.xpGained', { n: lv.gained }))),
    progressBar((lv.into / lv.needed) * 100, { label: t('recap.levelProgress', { into: lv.into, needed: lv.needed }) }),
    lv.levelUp ? h('p', { class: 'recap-up' }, t('recap.levelUp', { level: lv.level })) : null));
  return h('section', { class: 'recap' }, ...rows);
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

/** Text der Platz-Karte zu einem (Server-)Ergebnis; null = noch nicht abgegeben (offline). */
function rankLines(r: ChallengeResult | null): { title: string; text: string; tone: 'good' | 'accent' | 'warn' } {
  if (!r) return { title: t('compete.pendingTitle'), text: t('compete.pendingText'), tone: 'warn' };
  if (r.status === 'flagged') return { title: t('compete.flaggedTitle'), text: t('compete.flaggedText'), tone: 'warn' };
  if (r.status === 'expired') return { title: t('compete.expiredTitle'), text: t('compete.expiredText'), tone: 'warn' };
  const title = r.rank !== null ? t('compete.rankOf', { rank: r.rank, total: r.total }) : t('compete.ranked');
  const text = [
    t('compete.pointsTime', { points: fmt(r.points), time: fmtSeconds(r.timeMs) }),
    r.percentile ? t('compete.percentile', { p: r.percentile }) : null,
  ].filter(Boolean).join(' · ');
  return { title, text, tone: r.rank === 1 ? 'good' : 'accent' };
}

/** Ergebnis einer gewerteten Runde: Abgabe an den Server, Platz und Perzentil; danach ungewertet nachüben. */
function showRankedResult(ctx: TrainCtx, o: { n: number; correct: number; totalMs: number; avg: number }): void {
  const ranked = ctx.ranked;
  if (!ranked) return;
  const { results, root } = ctx;
  const rankBox = h('div', { class: 'compete-rank', 'aria-live': 'polite' },
    insight({ icon: 'trophy', tone: 'accent', title: t('compete.submitting'), text: t('compete.submittingText') }));
  let server: ChallengeResult | null = null;
  const boardBtn = button({ label: t('compete.toBoard'), kind: 'soft', icon: 'trophy', href: `#/rangliste?id=${encodeURIComponent(ranked.id)}` });
  const share = button({
    label: t('compete.share'), kind: 'outline', icon: 'link',
    onClick: () => {
      const r = server;
      const line = t('compete.shareText', {
        title: ranked.title, correct: r?.correct ?? o.correct, n: r?.n ?? o.n, points: fmt(r?.points ?? ctx.points),
        time: fmtSeconds(r?.timeMs ?? o.totalMs),
        rank: r?.rank !== null && r?.rank !== undefined ? t('compete.shareRank', { rank: r.rank, total: r.total }) : '',
      });
      void shareText(`${line.trim()}\n${publicUrl()}`).then((res) => {
        if (res === 'copied') toast(t('compete.copied'), { kind: 'success' });
      });
    },
  });
  const practice = button({
    label: t('compete.practiceAgain'), kind: 'primary', full: true, icon: 'refresh',
    onClick: () => {
      try { sessionStorage.setItem('mm.retry', JSON.stringify(ranked.tasks)); } catch { toast(t('train.notPossible')); return; }
      go('#/train/retry');
    },
  });

  const wrongRows = results.filter((r) => !r.ev.correct).map(taskRow);
  const rightRows = results.filter((r) => r.ev.correct).map(taskRow);
  const title = h('h1', { class: 'train-result-title num', tabindex: '-1' }, t('train.resultScore', { good: o.correct, n: o.n }));
  root.replaceChildren(
    h('div', { class: 'stage is-start train-result' },
      h('header', { class: 'train-result-head' },
        h('p', { class: 'train-result-sub' }, `${ranked.title} · ${t('compete.rankedShort')}`),
        title,
        h('p', { class: 'train-result-avg num' }, t('train.avgPerTask', { time: fmtSeconds(o.avg) }))),
      o.n ? resultSegments(results.map((r) => r.ev.correct)) : null,
      rankBox,
      o.n ? group({ title: t('train.tasks'), meta: wrongRows.length ? t('train.wrongFirst') : undefined },
        list([...wrongRows, ...rightRows])) : null),
    dock(
      h('div', { class: 'train-result-actions' }, button({ label: t('train.done'), href: '#/wettbewerbe' }), boardBtn, share),
      practice));
  setTitle(t('common.roundDone'));
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });

  const show = (r: ChallengeResult | null): void => {
    server = r;
    const l = rankLines(r);
    rankBox.replaceChildren(insight({ icon: 'trophy', tone: l.tone, title: l.title, text: l.text }));
  };
  void finishAttempt(ranked.id).then(show, () => show(null));
}

export function showResult(ctx: TrainCtx): void {
  ctx.stop();
  const { mode, results, root } = ctx;
  const n = results.length;
  const correct = results.filter((r) => r.ev.correct).length;
  const totalMs = results.reduce((s, r) => s + r.timeMs, 0);
  const avg = n ? totalMs / n : 0;

  // v9 A: Stand vor dieser Runde (für die Bilanz), bevor die Runde gespeichert wird
  const sessionsBefore = getSessions();
  addSession({ id: ctx.sessionId, ts: ctx.startedAt, mode, n, correct, points: ctx.points, avgTimeMs: Math.round(avg) });
  if (ctx.ranked) {
    showRankedResult(ctx, { n, correct, totalMs, avg });
    return;
  }

  const endedAt = Date.now();
  if (ctx.dailyKey) setDailyResult(ctx.dailyKey, { n, correct, points: ctx.points, timeMs: totalMs, ts: endedAt });

  // Ergebniskarte als Bild teilen; beim Daily begleitet dailyShareText das Bild (ersetzt das reine Text-Teilen)
  const shareBtn = n
    ? shareCardButton(buildShareCard({
      kind: 'train', mode, n, correct, points: ctx.points, totalMs, ts: endedAt, dailyKey: ctx.dailyKey,
      marks: results.map((r) => r.ev.correct),
    }, publicUrl()))
    : null;

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

  const attemptsAfter = getAttempts();
  const recap = roundRecap({
    mode, n, correct, avgMs: avg,
    assistedAny: attemptsAfter.some((a) => a.sessionId === ctx.sessionId && a.assisted === true),
    sessionsBefore,
    attemptsBefore: attemptsAfter.filter((a) => a.sessionId !== ctx.sessionId),
    attemptsAfter,
  });
  const settings = getSettings();
  // v9 B: Runden heute (die eben gespeicherte Runde zählt mit); erreicht genau diese Runde das Ziel → Zeile, ggf. Konfetti
  const habit = habitInfo({ sessions: getSessions(), activity: getActivity(), goalRounds: settings.dailyGoalRounds });
  const goalHit = habit.todayRounds === habit.goalRounds && dayKey(ctx.startedAt) === dayKey(Date.now());
  if (goalHit && settings.celebrated !== dayKey(Date.now())) {
    setSettings({ celebrated: dayKey(Date.now()) });
    if (settings.confetti === true) confetti();
  }
  const ins = roundInsight(results);
  const tasksText = n === 1 ? t('train.tasksOne') : t('train.tasksMany', { n });

  // Überschrift bekommt den Fokus: Screenreader lesen „8 von 10 richtig“, Enter = Nochmal, Esc = Übersicht
  const title = h('h1', { class: 'train-result-title num', tabindex: '-1' }, recap.perfect ? t('recap.perfect', { n }) : t('train.resultScore', { good: correct, n }));
  const again = button({ label: t('common.again'), kind: 'primary', full: true, onClick: () => go(ctx.restart) });
  root.replaceChildren(
    h('div', { class: 'stage is-start train-result' },
      h('header', { class: 'train-result-head' },
        h('p', { class: 'train-result-sub' }, `${modeName(mode)} · ${tasksText}`),
        title,
        h('p', { class: 'train-result-avg num' }, t('train.avgPerTask', { time: fmtSeconds(avg) })),
        vsLastLine(recap)),
      n ? resultSegments(results.map((r) => r.ev.correct)) : null,
      recap.newBest ? newBestCard(recap.newBest) : null,
      ins ? insightCard(ins) : null,
      statusLine({ todayRounds: habit.todayRounds, goalRounds: habit.goalRounds, streak: habit.streak, freezes: habit.freezes }),
      goalHit ? h('p', { class: 'goal-reached rise' }, icon('check', 16), t('common.goalReached')) : null,
      n ? recapBlock(recap) : null,
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
  // Bitte um eine Bewertung (nur iOS, selten)
  addCleanup(maybeAskForReview({ correct, n, newBest: recap.newBest !== null }));
}
