import type { Attempt, Reviews, Settings } from '../types.ts';
import { fmtSeconds, fmt } from '../core/numbers.ts';
import { SUBTYPES, LEVEL_NAMES, activeCategories } from '../core/catalog.ts';
import { categoryStats, subtypeStats, overall, weaknesses, errorPatterns, levelFor } from '../core/scoring.ts';
import { getAttempts, getSettings, getReviews, getActivity, getDailyResults } from '../data/storage.ts';
import { streakInfo, heatmap, dailySeries, apmSeries, dayKey } from '../core/progress.ts';
import { dueReviews, nextDue } from '../core/review.ts';
import { icon, ring, sparkline, heatmapGrid } from '../ui/charts.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { skeleton, deferRender } from '../ui/skeleton.ts';
import { t, locale } from '../i18n/index.ts';
import { badge, tile, pct, safeSteps, stepsList, fold } from '../ui/widgets.ts';

const fmtDate = (ts: number): string => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(ts));
const mins = (ms: number): number => Math.round((ms || 0) / 60000);

function headerBento(attempts: Attempt[], settings: Settings, now: number): HTMLDivElement {
  const goalMs = settings.dailyGoalMin * 60000;
  const st = streakInfo(getActivity(), goalMs, now);
  const sk = overall(attempts).score;
  const correct = attempts.filter((a) => a.correct).length;
  return h('div', { class: 'bento' },
    h('div', { class: 'tile tile-score' },
      h('span', { class: 'label' }, t('analyse.skill')),
      ring(sk === null || sk === undefined ? 0 : sk / 100, { size: 'lg', text: sk === null || sk === undefined ? '–' : String(sk) }),
      h('span', { class: 'sub' }, t('analyse.tasksCount', { n: attempts.length }))),
    h('div', { class: `tile tile-streak${st.current > 0 ? ' is-hot' : ''}` },
      icon('flame', { size: 28 }),
      h('span', { class: 'big-num' }, String(st.current)),
      h('span', { class: 'label' }, st.current === 1 ? t('analyse.streakOne') : t('analyse.streakMany')),
      h('span', { class: 'sub' }, t('analyse.record', { n: st.best }))),
    h('div', { class: 'tile tile-goal' },
      ring(goalMs ? st.todayMs / goalMs : 0, { size: 'md', text: st.todayDone ? '✓' : '' }),
      h('div', null,
        h('span', { class: 'label' }, t('analyse.today')),
        h('div', { class: 'big-num' }, t('analyse.minutes', { n: mins(st.todayMs) })),
        h('span', { class: 'sub' }, t('analyse.goal', { n: settings.dailyGoalMin })))),
    h('div', { class: 'tile' },
      h('span', { class: 'label' }, t('analyse.accuracy')),
      h('span', { class: 'big-num' }, pct(correct / attempts.length)),
      h('span', { class: 'sub' }, t('analyse.allTasks'))));
}

function heatmapSection(goalMs: number, now: number): HTMLElement {
  return h('section', null,
    h('h2', { class: 'section-title' }, t('analyse.activity')),
    h('div', { class: 'card' },
      heatmapGrid(heatmap(getActivity(), goalMs, now, 16)),
      h('div', { class: 'card-foot' },
        h('span', null, t('analyse.activity16')),
        h('span', { class: 'hm-legend' }, t('analyse.less'),
          ...[0, 1, 2, 3, 4].map((l) => h('span', { class: 'hm-cell', 'data-level': String(l) })),
          t('analyse.more')))));
}

function learnCurveSection(attempts: Attempt[], now: number): HTMLElement {
  const series = apmSeries(attempts, getActivity(), { days: 30, now });
  const apm = series.map((p) => p.perMinute);
  const acc = series.map((p) => p.accuracy);
  const sec = h('section', null, h('h2', { class: 'section-title' }, t('analyse.learnCurve')));
  if (!apm.some((v) => v !== null)) {
    sec.append(h('p', { class: 'muted' }, t('analyse.notEnoughData')));
    return sec;
  }
  sec.append(h('div', { class: 'card stack' },
    h('div', null,
      h('div', { class: 'label' }, t('analyse.tasksPerMinute')),
      h('div', { class: 'spark-tall' }, sparkline(apm, { area: true, gaps: true }))),
    h('div', { class: 'alt' },
      h('div', { class: 'label' }, t('analyse.accuracy')),
      h('div', { class: 'spark-tall' }, sparkline(acc, { area: false, max: 1, gaps: true }))),
    h('div', { class: 'card-foot' },
      h('span', { class: 'legend' },
        h('span', null, h('i'), t('analyse.tasksPerMinShort')),
        h('span', null, h('i', { class: 'alt' }), t('analyse.accuracy'))),
      h('span', null, t('analyse.last30')))));
  return sec;
}

function dailySection(now: number): HTMLElement {
  const results = getDailyResults();
  const sec = h('section', null, h('h2', { class: 'section-title' }, t('analyse.daily')));
  const list = h('ul', { class: 'list' });
  let any = false;
  for (let i = 0; i < 7; i++) {
    const key = dayKey(now - i * 86400000);
    const r = results[key];
    if (r) any = true;
    const label = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(now - i * 86400000));
    list.append(h('li', null,
      h('span', { class: `mark ${r ? 'good' : ''}` }, r ? '✓' : '–'),
      h('span', { class: 'item-main' }, label),
      h('span', { class: 'item-meta' }, r ? `${r.correct}/${r.n} · ${t('analyse.points', { n: fmt(r.points) })}` : t('analyse.open'))));
  }
  if (!any) sec.append(h('p', { class: 'muted' }, t('analyse.noDaily')));
  sec.append(list);
  return sec;
}

function reviewSection(now: number): HTMLElement {
  const reviews: Reviews = getReviews();
  const due = dueReviews(reviews, now);
  const next = nextDue(reviews);
  const entries = Object.entries(reviews || {}).filter(([id]) => SUBTYPES[id]);
  const sec = h('section', null, h('h2', { class: 'section-title' }, t('analyse.reviews')));
  if (!entries.length) {
    sec.append(h('p', { class: 'muted' }, t('analyse.reviewsEmpty')));
    return sec;
  }
  const headline = due.length
    ? t(due.length === 1 ? 'analyse.dueOne' : 'analyse.dueMany', { n: due.length })
    : t('analyse.nothingDue');
  const card = h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('div', { class: 'card-title' }, headline),
        h('div', { class: 'card-sub' }, next ? t('analyse.nextOn', { date: fmtDate(next) }) : '')),
      icon('repeat', { size: 24 })));
  if (due.length) {
    card.append(h('div', { class: 'card-actions' }, h('a', { class: 'btn primary', href: '#/train/review' }, t('analyse.reviewNow'))));
  }
  const list = h('ul', { class: 'list' });
  for (const [id, r] of entries.sort((a, b) => a[1].dueAt - b[1].dueAt)) {
    list.append(h('li', null,
      h('span', { class: `mark ${r.dueAt <= now ? 'bad' : 'good'}` }, r.dueAt <= now ? '!' : '✓'),
      h('span', { class: 'item-main' }, SUBTYPES[id]?.name),
      h('span', { class: 'item-meta' }, t('analyse.level', { n: Math.min(r.box + 1, 5) })),
      h('span', { class: 'item-sub' }, r.dueAt <= now ? t('analyse.due') : t('analyse.dueOn', { date: fmtDate(r.dueAt) }))));
  }
  sec.append(card, list);
  return sec;
}

function weakSection(attempts: Attempt[], settings: Settings): HTMLElement {
  const weak = weaknesses(attempts, undefined, { enabledCategories: settings.enabledCategories });
  const sec = h('section', null, h('h2', { class: 'section-title' }, t('analyse.weaknesses')));
  if (!weak.length) {
    sec.append(h('p', { class: 'muted' }, t('analyse.noWeaknesses')));
    return sec;
  }
  const stack = h('div', { class: 'stack' });
  for (const w of weak) {
    stack.append(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('div', { class: 'card-title' }, w.name),
          h('div', { class: 'card-sub' }, `${w.categoryName} · ${w.label}`)),
        badge(w.score)),
      h('p', { class: 'small muted' }, t('analyse.correctAvg', { acc: pct(w.accuracy), avg: fmtSeconds(w.avgTimeMs), target: fmtSeconds(w.targetMs) })),
      w.tip ? h('p', { class: 'small' }, t('analyse.tip', { tip: w.tip })) : null,
      h('div', { class: 'card-actions' },
        h('a', { class: 'btn small', href: `#/lernen/${w.subtype}` }, t('analyse.learn')),
        h('a', { class: 'btn small', href: `#/train/${w.subtype}` }, t('analyse.practice')))));
  }
  sec.append(stack, h('div', { class: 'btn-row section-actions' }, h('a', { class: 'btn primary', href: '#/train/weak' }, t('analyse.trainWeak'))));
  return sec;
}

function categorySection(attempts: Attempt[], settings: Settings, now: number): HTMLElement {
  const cats = categoryStats(attempts);
  const subs = subtypeStats(attempts);
  const stack = h('div', { class: 'stack' });
  for (const c of activeCategories(settings.enabledCategories)) {
    const s = cats[c.id];
    const values = dailySeries(attempts, { category: c.id, days: 14, now }).map((d) => d.accuracy);
    const meta = s && s.n
      ? t('analyse.avgTasks', { avg: fmtSeconds(s.avgTimeMs), n: attempts.filter((a) => a.category === c.id).length })
      : t('analyse.noTasksYet');
    const body = h('div', { class: 'stack' });
    for (const sub of Object.values(SUBTYPES).filter((x) => x.category === c.id)) {
      const ss = subs[sub.id];
      const lv = levelFor(sub.id, attempts, settings.difficulty);
      body.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', null,
            h('div', { class: 'card-title' }, sub.name),
            h('div', { class: 'card-sub' }, ss && ss.n ? `${pct(ss.accuracy)} · Ø ${fmtSeconds(ss.avgTimeMs)}` : t('analyse.notPracticed'))),
          h('div', null, badge(ss ? ss.score : null), ' ', h('span', { class: 'chip' }, LEVEL_NAMES[lv]))),
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn small', href: `#/lernen/${sub.id}` }, t('analyse.learn')),
          h('a', { class: 'btn small', href: `#/train/${sub.id}` }, t('analyse.practice')))));
    }
    stack.append(h('details', { class: 'cat-history' },
      h('summary', null,
        h('span', null,
          h('span', { class: 'card-title' }, c.name),
          h('span', { class: 'sub' }, ` · ${meta}`)),
        badge(s ? s.score : null),
        sparkline(values, { area: true, max: 1 })),
      h('div', { class: 'fold-body' }, body)));
  }
  return h('section', null, h('h2', { class: 'section-title' }, t('analyse.categories')), stack);
}

function errorsSection(attempts: Attempt[]): HTMLElement | null {
  const errors = attempts.filter((a) => !a.correct).slice(-10).reverse();
  if (!errors.length) return null;
  const list = h('ul', { class: 'list' });
  for (const a of errors) {
    const unit = a.unit ? ` ${a.unit}` : '';
    const choices = a.kind === 'choice' && Array.isArray(a.choices) ? a.choices : null;
    const steps = a.params
      ? safeSteps({ subtype: a.subtype, params: a.params, expected: a.expected, unit: a.unit, prompt: a.prompt })
      : [];
    const givenText = a.given === null || a.given === undefined ? t('analyse.skipped')
      : choices ? String(choices[a.given]) : fmt(a.given);
    const expectedText = choices ? String(choices[a.expected]) : `${fmt(a.expected)}${unit}`;
    list.append(h('li', null,
      h('span', { class: 'mark bad' }, '✗'),
      h('span', { class: 'item-main' }, a.prompt),
      h('span', { class: 'item-meta' }, fmtSeconds(a.timeMs)),
      h('span', { class: 'item-sub' }, t('analyse.yourAnswer', { given: givenText, expected: expectedText })),
      steps.length ? h('div', { class: 'item-steps' }, fold(t('analyse.solutionPath'), stepsList(steps))) : null));
  }
  return h('section', null, h('h2', { class: 'section-title' }, t('analyse.recentErrors')), list);
}

export function renderAnalyse(): void {
  const attempts = getAttempts();

  if (attempts.length === 0) {
    app.append(
      h('h1', { class: 'page-title' }, t('analyse.title')),
      h('div', { class: 'card empty' },
        icon('chart', { size: 40 }),
        h('div', { class: 'card-title' }, t('analyse.emptyTitle')),
        h('p', { class: 'muted' }, t('analyse.emptyText')),
        h('a', { class: 'btn primary', href: '#/' }, t('analyse.startTraining'))));
    return;
  }

  const now = Date.now();
  const settings = getSettings();
  const patterns = errorPatterns(attempts);
  const patternTiles = h('div', { class: 'stats' },
    tile(String(patterns.nullen || 0), t('analyse.patternZeros')),
    tile(String(patterns.knapp || 0), t('analyse.patternClose')),
    tile(String(patterns.falsch || 0), t('analyse.patternWrong')),
    tile(String(patterns.skip || 0), t('analyse.patternSkipped')));

  const lazy = (kind: 'chart' | 'list' | 'cards', count: number, build: () => Node | null): HTMLElement => {
    const ph = skeleton(kind, count);
    deferRender(ph, () => build() ?? document.createDocumentFragment());
    return ph;
  };
  appendChildren(app, [
    h('h1', { class: 'page-title' }, t('analyse.title')),
    headerBento(attempts, settings, now),
    lazy('chart', 1, () => heatmapSection(settings.dailyGoalMin * 60000, now)),
    lazy('chart', 1, () => learnCurveSection(attempts, now)),
    lazy('list', 3, () => dailySection(now)),
    lazy('list', 3, () => reviewSection(now)),
    lazy('list', 3, () => weakSection(attempts, settings)),
    lazy('cards', 4, () => categorySection(attempts, settings, now)),
    h('section', null, h('h2', { class: 'section-title' }, t('analyse.errorPatterns')), patternTiles),
    lazy('list', 4, () => errorsSection(attempts)),
    h('p', { class: 'small' }, h('a', { class: 'linkbtn', href: '#/settings' }, t('analyse.dataSettings'))),
  ]);
}
