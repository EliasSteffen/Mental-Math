import { SUBTYPES, activeCategories } from '../core/catalog.ts';
import { categoryStats, overall } from '../core/scoring.ts';
import { getAttempts, getReviews, getActivity, getSettings, getDailyResults } from '../data/storage.ts';
import { streakInfo, xpInfo, recommendation, dayKey } from '../core/progress.ts';
import { fmt } from '../core/numbers.ts';
import { dueReviews } from '../core/review.ts';
import { icon, ring, progressBar } from '../ui/charts.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { skeleton, deferRender } from '../ui/skeleton.ts';
import { t } from '../i18n/index.ts';

export function renderHome(): void {
  const now = Date.now();
  const attempts = getAttempts();
  const reviews = getReviews();
  const settings = getSettings();
  const goalMs = (settings.dailyGoalMin || 15) * 60000;
  const st = streakInfo(getActivity(), goalMs, now);
  const xp = xpInfo(attempts);
  const rec = recommendation(attempts, reviews, now, { enabledCategories: settings.enabledCategories });
  const due = dueReviews(reviews, now);
  const stats = categoryStats(attempts);
  const counts: Record<string, number> = {};
  for (const a of attempts) counts[a.category] = (counts[a.category] || 0) + 1;
  const fresh = attempts.length === 0;

  const streakTile = h('div', { class: `tile tile-streak${st.current >= 1 || st.todayDone ? ' is-hot' : ''}` },
    icon('flame', { size: 28 }),
    h('div', { class: 'big-num' }, String(st.current)),
    h('div', { class: 'label' }, st.current === 1 ? t('home.streakDay') : t('home.streakDays')),
    h('div', { class: 'sub' }, t('home.record', { n: st.best })));

  const scoreTile = h('div', { class: 'tile tile-score' },
    h('span', { class: 'level-badge' }, t('common.levelN', { n: xp.level })),
    h('div', { class: 'big-num' }, String(xp.xp)),
    h('div', { class: 'label' }, t('home.xp')),
    progressBar(xp.needed ? (xp.into / xp.needed) * 100 : 0),
    h('div', { class: 'sub' }, t('home.xpToNext', { into: xp.into, needed: xp.needed, next: xp.level + 1 })));

  const todayMin = Math.floor(st.todayMs / 60000);
  const goalMin = settings.dailyGoalMin || 15;
  const goalTile = h('div', { class: 'tile tile-goal span-2' },
    ring(Math.min(1, st.todayMs / goalMs), { size: 'md', text: `${todayMin}` }),
    h('div', null,
      h('div', { class: 'label' }, t('home.dailyGoal')),
      h('div', { class: 'big-num' }, t('home.goalProgress', { done: todayMin, goal: goalMin })),
      h('div', { class: 'sub' }, st.todayDone ? t('home.goalDone') : t('home.goalLeft', { n: Math.max(1, goalMin - todayMin) }))));

  let heroHref = '#/train/all';
  let heroBtn = t('common.letsGo');
  let heroTitle = t('home.heroTitleDefault');
  let heroReason = t('home.heroReasonDefault');
  if (!fresh || rec.kind !== 'new') {
    heroTitle = rec.kind === 'review' ? t('home.heroTitleReview') : t('home.heroTitleRec', { title: rec.title });
    heroReason = rec.reason;
    if (rec.kind === 'review') {
      heroHref = '#/train/review';
      heroBtn = t(due.length === 1 ? 'home.reviewStartOne' : 'home.reviewStartOther', { n: due.length });
    } else if (rec.subtype && SUBTYPES[rec.subtype]) {
      heroHref = `#/train/${rec.subtype}?n=5&intro=1`;
      heroBtn = t('home.methodAnd5');
    } else {
      heroHref = `#/train/${rec.mode}`;
      heroBtn = t('home.startTraining');
    }
  } else if (rec.subtype) {
    heroTitle = t('home.welcome', { title: rec.title });
    heroReason = t('home.firstReason');
    heroHref = `#/train/${rec.subtype}?n=5&intro=1`;
    heroBtn = t('home.methodAnd5');
  }
  const heroTile = h('div', { class: 'tile tile-hero span-2' },
    h('div', { class: 'label' }, t('home.recommendation')),
    h('div', { class: 'card-title' }, heroTitle),
    h('div', { class: 'sub' }, heroReason),
    h('a', { class: 'btn primary', href: heroHref }, heroBtn));

  const allTile = h('a', { class: 'tile span-2', href: '#/train/all' },
    h('div', { class: 'label' }, t('home.quickStart')),
    h('div', { class: 'card-title' }, t('home.allCategories')),
    h('div', { class: 'sub' }, t('home.mixedCount', { n: attempts.length })));

  const daily = getDailyResults()[dayKey(now)];
  const dailyTile = h('a', { class: `tile tile-daily span-2${daily ? ' is-done' : ''}`, href: '#/train/daily' },
    h('div', { class: 'label' }, t('home.dailyChallenge')),
    h('div', { class: 'card-title' }, daily ? t('home.dailyDone') : t('home.dailyToday')),
    daily
      ? h('div', { class: 'daily-result' }, t('home.dailyResult', { correct: daily.correct, n: daily.n, points: fmt(daily.points) }))
      : h('div', { class: 'sub' }, t('home.dailySame'))) ;

  const quick = h('div', { class: 'quick-grid' },
    h('a', { class: 'tile', href: '#/chain' }, h('div', { class: 'card-title' }, t('home.chainTitle')), h('div', { class: 'sub' }, t('home.chainSub'))),
    h('a', { class: 'tile', href: '#/parallel' }, h('div', { class: 'card-title' }, t('home.parallelTitle')), h('div', { class: 'sub' }, t('home.parallelSub'))),
    h('a', { class: 'tile', href: '#/train/all?est=1' }, h('div', { class: 'card-title' }, t('home.estimateTitle')), h('div', { class: 'sub' }, t('home.estimateSub'))),
    h('a', { class: 'tile', href: '#/custom' }, h('div', { class: 'card-title' }, t('home.customTitle')), h('div', { class: 'sub' }, t('home.customSub'))));

  const grid = h('div', { class: 'cat-grid' });
  for (const c of activeCategories(settings.enabledCategories)) {
    const sc = stats[c.id]?.score ?? null;
    grid.append(h('a', { class: 'cat-card', href: `#/train/${c.id}` },
      ring((sc || 0) / 100, { size: 'sm', text: sc === null ? '–' : String(sc) }),
      h('div', { class: 'cat-name' }, c.name),
      h('div', { class: 'cat-meta' }, t('home.tasksShort', { n: counts[c.id] || 0 }))));
  }

  const overallScore = overall(attempts).score;
  const bentoSk = skeleton('tiles', 4);
  deferRender(bentoSk, () => h('div', { class: 'bento' }, heroTile, streakTile, scoreTile, goalTile, dailyTile, allTile));
  appendChildren(app, [
    bentoSk,
    quick,
    h('h2', { class: 'section-title' }, t('home.categories')),
    grid,
    fresh ? null : h('p', { class: 'small muted' }, overallScore === null ? '' : t('home.overallSkill', { n: overallScore })),
  ]);
}
