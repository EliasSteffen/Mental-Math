// Tab „Fortschritt“ (Ruhiger Fokus): Fokus-Karte, KPI-Zeile und vier Ansichten (Überblick · Kategorien · Verlauf · Fehler).
// Die Ansichten schalten lokal um (kein rerender); die Auswahl merkt sich sessionStorage. Alle Daten liegen synchron vor,
// daher keine Skeletons (E22).
import type { Activity, Attempt, Settings } from '../types.ts';
import { fmt } from '../core/numbers.ts';
import { SUBTYPES, activeCategories } from '../core/catalog.ts';
import { categoryStats, overall } from '../core/scoring.ts';
import { streakInfo, heatmap, apmSeries, xpInfo, dayKey } from '../core/progress.ts';
import { dueReviews, nextDue } from '../core/review.ts';
import { getMethod } from '../core/methods.ts';
import { lw } from '../core/l10n.ts';
import { getAttempts, getSettings, getReviews, getActivity, getDailyResults } from '../data/storage.ts';
import { heatmapGrid, progressBar, sparkline } from '../ui/charts.ts';
import { app, h, appendChildren, type Child } from '../ui/dom.ts';
import { barList, button, card, group, icon, kpis, largeTitle, list, row, segmented, steps } from '../ui/kit.ts';
import { openSheet } from '../ui/sheet.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { safeSteps } from '../ui/widgets.ts';
import { t, locale } from '../i18n/index.ts';
import {
  accuracyOf, attemptsLastDays, dailyHistory, firstLast, fmtSec, focusOf, minutesLastDays, patternCounts, recentErrors,
  relativeDay, rollingMean, trendOf, weekDays, weekScaleMax, type FocusState, type PatternCounts,
} from './progress-data.ts';

type View = 'overview' | 'categories' | 'history' | 'errors';

const VIEWS: readonly View[] = ['overview', 'categories', 'history', 'errors'];
const VIEW_LABEL = {
  overview: 'analyse.viewOverview', categories: 'analyse.viewCategories', history: 'analyse.viewHistory', errors: 'analyse.viewErrors',
} as const satisfies Record<View, string>;
const VIEW_KEY = 'mm.progressView';

const TREND_LABEL = { up: 'analyse.trendUp', down: 'analyse.trendDown', flat: 'analyse.trendFlat' } as const;

/** Fenster für die Fehlermuster (wie viele der letzten Aufgaben) und Anzahl „Letzte Fehler“. */
const PATTERN_WINDOW = 50;
const RECENT_ERRORS = 5;

function loadView(): View {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    return VIEWS.find((x) => x === v) ?? 'overview';
  } catch {
    return 'overview';
  }
}

function saveView(v: View): void {
  try {
    sessionStorage.setItem(VIEW_KEY, v);
  } catch {
    // Speicher gesperrt (privates Fenster): Auswahl gilt dann nur bis zum nächsten Aufruf
  }
}

const percent = (x: number): string => t('analyse.percent', { n: Math.round(x * 100) });

/** Text mit Platzhaltern {x}; eingesetzte Werte erscheinen als hervorgehobene Zahl. */
function rich(template: string, params: Record<string, string>): Child[] {
  const out: Child[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const at = m.index ?? 0;
    const value = params[m[1] ?? ''];
    out.push(template.slice(last, at), value === undefined ? m[0] : h('span', { class: 'num prog-strong' }, value));
    last = at + m[0].length;
  }
  out.push(template.slice(last));
  return out;
}

const quiet = (text: string): HTMLParagraphElement => h('p', { class: 'prog-empty' }, text);

/* ---------- Fokus-Karte ---------- */

function focusCard(state: FocusState): HTMLElement {
  const label = h('p', { class: 'prog-focus-label' }, icon('target', 16), t('analyse.focusLabel'));
  if (state.kind !== 'focus') {
    const few = state.kind === 'few';
    return card([
      label,
      h('h2', { class: 'prog-focus-title' }, t(few ? 'analyse.focusFewTitle' : 'analyse.focusNoneTitle')),
      h('p', { class: 'prog-focus-text' }, t(few ? 'analyse.focusFewText' : 'analyse.focusNoneText')),
    ], { hero: true, label: t('analyse.focusLabel'), class: 'prog-focus' });
  }

  const { weakness: w, errors, zeros, avgMs, targetMs } = state.focus;
  const text: Child[] = [];
  if (w.reason === 'nullen' && zeros > 0) {
    text.push(...rich(t(zeros === errors ? 'analyse.focusZerosAll' : 'analyse.focusZeros'), { k: String(zeros), n: String(errors) }));
  } else if (w.reason === 'ungenau' || !(avgMs > 0)) {
    text.push(...rich(t('analyse.focusAccuracy'), { acc: percent(w.accuracy) }));
  }
  if (avgMs > 0 && targetMs > 0) {
    if (text.length) text.push(' ');
    text.push(...rich(t(avgMs > targetMs ? 'analyse.focusSlow' : 'analyse.focusFast'), { avg: fmtSec(avgMs), target: fmtSec(targetMs) }));
  }
  // Kurzes Rechenbeispiel: der Tipp des Subtyps (lokalisiert), sonst der Trick aus der Methode
  const example = w.tip || getMethod(w.subtype)?.trick || '';
  return card([
    label,
    // Geschützte Bindestriche: „2-stellig“ bricht nicht am Strich um
    h('h2', { class: 'prog-focus-title' }, `${w.categoryName} · ${w.name}`.replaceAll('-', '\u2011')),
    h('p', { class: 'prog-focus-text' }, ...text),
    example ? h('p', { class: 'prog-example num' }, example) : null,
    button({ label: t('analyse.focusMethod'), kind: 'link', icon: 'book', href: `#/lernen/${w.subtype}` }),
  ], { hero: true, label: t('analyse.focusLabel'), class: 'prog-focus' });
}

/* ---------- Überblick ---------- */

/** Zweibuchstabiger Wochentag (Mo, Di … / Mo, Tu …), passt auch bei 320 px unter jeden Balken. */
function weekdayShort(ts: number): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(ts)).replace(/\.$/, '').slice(0, 2);
}

function weekCard(activity: Activity, goalMin: number, now: number): HTMLElement {
  const days = weekDays(activity, now);
  const max = weekScaleMax(days, goalMin);
  const share = (min: number): string => String(Math.round((min / max) * 1000) / 10);
  const goal = h('span', { class: 'prog-week-goal' });
  goal.style.setProperty('--h', share(goalMin));
  const bars = h('div', { class: 'prog-week-bars' }, goal);
  const labels = h('div', { class: 'prog-week-days' });
  for (const d of days) {
    const state = d.future ? ' is-future' : d.min >= goalMin ? ' is-met' : d.min === 0 ? ' is-zero' : '';
    const bar = h('span', { class: `prog-week-bar${state}` });
    if (!d.future) bar.style.setProperty('--h', share(d.min));
    bars.append(bar);
    labels.append(h('span', { class: d.today ? 'is-today' : null }, weekdayShort(d.ts)));
  }
  const aria = t('analyse.weekAria', {
    days: days.filter((d) => !d.future).map((d) => `${weekdayShort(d.ts)} ${d.min}`).join(', '),
  });
  return card([
    h('div', { class: 'prog-week', role: 'img', 'aria-label': aria }, bars, labels),
  ], { title: t('analyse.weekTitle'), meta: t('analyse.weekGoal', { n: goalMin }) });
}

function overviewView(attempts: Attempt[], settings: Settings, now: number): HTMLElement {
  const reviews = getReviews();
  const due = dueReviews(reviews, now).filter((r) => SUBTYPES[r.subtype]);
  const next = nextDue(reviews);
  const dateFmt = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long' });
  const reviewRow = due.length
    ? row({
      icon: 'refresh', label: t('analyse.reviews'), value: t('analyse.reviewsDue', { n: due.length }), valueTone: 'accent',
      href: '#/train/review',
    })
    : row({
      icon: 'refresh', label: t('analyse.reviews'), value: t('analyse.reviewsNone'),
      sub: next !== null && next > now ? t('analyse.reviewsNext', { date: dateFmt.format(new Date(next)) }) : undefined,
    });

  const xp = xpInfo(attempts);
  const level = h('div', { class: 'prog-level' },
    h('div', { class: 'prog-level-head' },
      h('span', { class: 'prog-level-label' }, t('analyse.level', { n: xp.level })),
      h('span', { class: 'prog-level-meta num' },
        t('analyse.xpToNext', { into: fmt(xp.into), needed: fmt(xp.needed), next: xp.level + 1 }))),
    progressBar(xp.needed > 0 ? (xp.into / xp.needed) * 100 : 0, { decorative: true }));

  return h('div', { class: 'prog-view' },
    weekCard(getActivity(), settings.dailyGoalMin, now),
    list([reviewRow, level]));
}

/* ---------- Kategorien ---------- */

function categoriesView(attempts: Attempt[], settings: Settings): HTMLElement {
  const stats = categoryStats(attempts);
  const items = activeCategories(settings.enabledCategories).map((c) => {
    const score = stats[c.id]?.score ?? null;
    return {
      label: c.name, value: score ?? 0, max: 100, text: score === null ? '–' : String(score),
      tone: score !== null && score < 50 ? 'warn' as const : undefined,
    };
  });
  return h('div', { class: 'prog-view' },
    card([barList(items)], { label: t('analyse.categoriesAria'), class: 'prog-cats' }));
}

/* ---------- Verlauf ---------- */

/** Karte mit Lernkurve: „erster → letzter Wert“, Linie mit Fläche, Fußzeile „letzte 30 Tage“. */
function curveCard(
  title: string,
  values: Array<number | null>,
  format: (v: number) => string,
  aria: 'analyse.apmAria' | 'analyse.accuracyAria',
  max: number | null,
): HTMLElement {
  const fl = firstLast(values);
  if (!fl) return card([quiet(t('analyse.notEnoughData'))], { title, class: 'prog-curve-card' });
  const trend = t(TREND_LABEL[trendOf(fl.first, fl.last)]);
  return card([
    h('div', { class: 'prog-curve' },
      sparkline(values, { area: true, gaps: false, fit: max === null, max, width: 326, height: 72, label: t(aria, { trend }) })),
    h('p', { class: 'prog-card-foot' }, t('analyse.last30')),
  ], {
    title, class: 'prog-curve-card',
    meta: h('span', { class: 'num prog-range' },
      h('span', { class: 'prog-range-first' }, `${format(fl.first)} →`), ' ', h('span', { class: 'prog-strong' }, format(fl.last))),
  });
}

function dailyGroup(now: number): HTMLElement {
  const solved = dailyHistory(getDailyResults(), now, 7).filter((d) => d.result);
  const dateFmt = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
  return group({ title: t('analyse.dailyTitle'), meta: t('analyse.dailyMeta', { n: solved.length }) },
    solved.length
      ? list(solved.map((d) => row({
        icon: 'calendar', label: dateFmt.format(new Date(d.ts)),
        value: d.result ? t('analyse.dailyResult', { correct: d.result.correct, n: d.result.n, points: fmt(d.result.points) }) : '',
      })))
      : quiet(t('analyse.dailyEmpty')));
}

function historyView(attempts: Attempt[], settings: Settings, now: number): HTMLElement {
  const activity = getActivity();
  const goalMs = settings.dailyGoalMin * 60000;
  const st = streakInfo(activity, goalMs, now);
  const legend = h('p', { class: 'prog-heat-legend', 'aria-hidden': 'true' },
    t('analyse.less'),
    [0, 1, 2, 3].map((l) => h('span', { class: 'hm-cell is-legend', 'data-level': String(l) })),
    t('analyse.more'));
  const activityCard = card([
    h('div', { class: 'prog-heat' },
      heatmapGrid(heatmap(activity, goalMs, now, 12), { label: t('analyse.activityAria'), today: dayKey(now) }),
      legend),
  ], {
    title: t('analyse.activityTitle'),
    meta: st.best > 0 ? t('analyse.activityStreak', { n: st.current, best: st.best }) : undefined,
  });

  // Tageswerte schwanken stark; die Kurve zeigt den 7-Tage-Mittelwert
  const series = apmSeries(attempts, activity, { days: 30, now });
  const oneDecimal = new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return h('div', { class: 'prog-view' },
    activityCard,
    curveCard(t('analyse.apmTitle'), rollingMean(series.map((p) => p.perMinute)), (v) => oneDecimal.format(v), 'analyse.apmAria', null),
    curveCard(t('analyse.accuracyTitle'), rollingMean(series.map((p) => p.accuracy)), percent, 'analyse.accuracyAria', 1),
    dailyGroup(now));
}

/* ---------- Fehler ---------- */

const PATTERNS: ReadonlyArray<readonly [keyof PatternCounts, 'analyse.patternZeros' | 'analyse.patternSlow' | 'analyse.patternClose' | 'analyse.patternWrong' | 'analyse.patternSkipped']> = [
  ['nullen', 'analyse.patternZeros'],
  ['slow', 'analyse.patternSlow'],
  ['knapp', 'analyse.patternClose'],
  ['falsch', 'analyse.patternWrong'],
  ['skip', 'analyse.patternSkipped'],
];

function errorRow(a: Attempt, now: number): HTMLElement {
  const unit = a.unit ? ` ${lw(a.unit)}` : '';
  const choices = a.kind === 'choice' && Array.isArray(a.choices) ? a.choices : null;
  const expected = choices ? String(choices[a.expected] ?? '–') : `${fmt(a.expected)}${unit}`;
  const rel = relativeDay(a.ts, now);
  const when = rel === 'today' ? t('analyse.today') : rel === 'yesterday' ? t('analyse.yesterday')
    : new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(a.ts));
  const skipped = a.given === null || a.given === undefined;
  const detail = skipped
    ? t('analyse.errorDetailSkip', { expected, when })
    : t('analyse.errorDetail', { given: choices ? String(choices[a.given as number] ?? '–') : fmt(a.given as number), expected, when });
  const prompt = lw(a.prompt);
  const path = a.params
    ? safeSteps({ subtype: a.subtype, params: a.params, expected: a.expected, unit: a.unit, prompt: a.prompt })
    : [];
  if (!path.length) return row({ label: prompt, sub: detail, numeric: true });
  return row({
    label: prompt, sub: detail, chevron: true, numeric: true,
    onClick: () => {
      openSheet({
        title: t('analyse.solutionPath'),
        children: [
          h('p', { class: 'prog-sheet-task num' }, prompt),
          h('p', { class: 'prog-sheet-detail num' }, detail),
          steps(path),
        ],
      });
    },
  });
}

function errorsView(attempts: Attempt[], now: number): HTMLElement {
  const { n, counts } = patternCounts(attempts, PATTERN_WINDOW);
  const found = PATTERNS.map(([k, key]) => ({ label: t(key), value: counts[k] }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...found.map((p) => p.value));
  const patterns = card([
    found.length
      ? barList(found.map((p) => ({ label: p.label, value: p.value, max, text: String(p.value), tone: 'bad' as const })))
      : quiet(t('analyse.patternsEmpty', { n })),
  ], { title: t('analyse.patternsTitle'), meta: t('analyse.patternsMeta', { n }) });
  const errs = recentErrors(attempts, RECENT_ERRORS);
  return h('div', { class: 'prog-view' },
    patterns,
    group(t('analyse.recentErrors'),
      errs.length ? list(errs.map((a) => errorRow(a, now))) : quiet(t('analyse.noErrors'))));
}

/* ---------- Seite ---------- */

export function renderAnalyse(): void {
  const attempts = getAttempts();
  const settings = getSettings();
  const now = Date.now();
  const title = largeTitle(t('analyse.title'), t('analyse.sub'));

  // Noch nichts geübt: nur die ruhige Einladung, keine leeren Diagramme
  if (!attempts.length) {
    appendChildren(app, [title, focusCard({ kind: 'few' })]);
    setPrimaryAction({ label: t('analyse.ctaStart'), href: '#/train/all', icon: 'play' });
    return;
  }

  const focus = focusOf(attempts, settings.enabledCategories);
  const lastWeek = attemptsLastDays(attempts, now, 7);
  const accuracy = accuracyOf(lastWeek);
  const skill = overall(attempts).score;
  const kpiRow = kpis([
    { label: t('analyse.kpiSkill'), value: skill === null ? '–' : String(skill) },
    { label: t('analyse.kpiAccuracy'), value: accuracy === null ? '–' : percent(accuracy) },
    { label: t('analyse.kpiMinutes'), value: fmt(minutesLastDays(getActivity(), now, 7), 0) },
  ]);

  const build = (v: View): HTMLElement => {
    switch (v) {
      case 'categories': return categoriesView(attempts, settings);
      case 'history': return historyView(attempts, settings, now);
      case 'errors': return errorsView(attempts, now);
      default: return overviewView(attempts, settings, now);
    }
  };
  const initial = loadView();
  const panel = h('div', { class: 'prog-panel' }, build(initial));
  const switcher = segmented<View>({
    label: t('analyse.viewLabel'), hideLabel: true,
    options: VIEWS.map((v) => [v, t(VIEW_LABEL[v])] as const),
    value: initial,
    onChange: (v) => {
      saveView(v);
      // Nur beim Umschalten einblenden; beim ersten Aufbau steht der Inhalt ruhig da
      const view = build(v);
      view.classList.add('rise');
      panel.replaceChildren(view);
    },
  });

  appendChildren(app, [title, focusCard(focus), kpiRow, switcher.el, panel]);
  setPrimaryAction(focus.kind === 'focus'
    ? { label: t('analyse.ctaFocus'), href: '#/train/weak', icon: 'target' }
    : { label: t('analyse.ctaMixed'), href: '#/train/all', icon: 'grid' });
}
