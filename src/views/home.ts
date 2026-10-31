// Tab „Heute“ (Ruhiger Fokus): Begrüßung, Empfehlung als Hero, Status Line, andere Übungen, Kategorie-Chips, CTA.
// Alle Daten liegen synchron vor – kein Skeleton (E22). Texte, Zahlen und Ziele aus home-data.ts.
import { CATEGORIES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import { categoryStats } from '../core/scoring.ts';
import { dueReviews } from '../core/review.ts';
import { dayKey, recommendation, streakInfo } from '../core/progress.ts';
import { fmtSeconds } from '../core/numbers.ts';
import { getActivity, getAttempts, getDailyResults, getReviews, getSettings } from '../data/storage.ts';
import { app, appendChildren, h } from '../ui/dom.ts';
import { card, chip, chips, group, largeTitle, list, masteryOf, row, statusLine } from '../ui/kit.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { openSheet, type SheetHandle } from '../ui/sheet.ts';
import { addCleanup } from '../router.ts';
import { locale, t } from '../i18n/index.ts';
import type { Recommendation } from '../types.ts';
import { dateLine, daypart, heroPlan, timeGap, type HeroPlan, type TimeGap } from './home-data.ts';

const GREETING = { morning: 'home.greetMorning', day: 'home.greetDay', evening: 'home.greetEvening' } as const;

/** „Ziel {n}“ → Text mit hervorgehobener Zahl (wie die Status Line). */
function labelled(template: string, value: string): HTMLSpanElement {
  const [before = '', after = ''] = template.split('{n}');
  return h('span', null, before, h('span', { class: 'num today-strong' }, value), after);
}

/** Balken Ziel vs. Dein Schnitt: ganze Breite = dein Median, Füllung und Marke = Zielzeit (E9). */
function timeBar(gap: TimeGap): HTMLElement {
  const bar = h('div', { class: 'today-bar', 'aria-hidden': 'true' },
    h('span', { class: 'today-bar-lost' }),
    h('span', { class: 'today-bar-fill' }),
    h('span', { class: 'today-bar-mark' }));
  bar.style.setProperty('--w', String(Math.round((gap.targetMs / gap.medianMs) * 1000) / 10));
  return h('div', { class: 'today-insight' },
    h('p', { class: 'today-insight-text' }, t('home.slowest')),
    bar,
    h('p', { class: 'today-legend' },
      labelled(t('home.timeTarget'), fmtSeconds(gap.targetMs)),
      labelled(t('home.timeYours'), fmtSeconds(gap.medianMs))));
}

/**
 * Hero „Empfohlen für heute“: Titel („Kategorie · Subtyp“), Ablauf und darunter der Zeit-Balken (E9) oder der Grund
 * als ruhiger Text. Beim Erststart (noch keine Versuche) begrüßt die Karte statt „Noch nie geübt“.
 */
function hero(rec: Recommendation, plan: HeroPlan, gap: TimeGap | null, fresh: boolean): HTMLElement {
  const sub = rec.subtype ? SUBTYPES[rec.subtype] : undefined;
  const catName = sub ? CATEGORIES.find((c) => c.id === sub.category)?.name : undefined;
  const title = sub && catName ? `${catName} · ${rec.title}` : rec.title;
  const planText = plan.kind === 'method' ? t('home.planMethod')
    : plan.kind === 'review' ? t('home.planReview')
    : t('home.planRound', { n: plan.tasks });
  const reason = fresh && rec.kind === 'new' ? t('home.firstReason') : rec.reason;
  return card([
    h('div', { class: 'today-hero-head' },
      h('p', { class: 'today-hero-label' }, t('home.recLabel')),
      h('h2', { class: 'today-hero-title' }, title),
      h('p', { class: 'today-hero-sub' }, planText)),
    gap ? timeBar(gap) : h('div', { class: 'today-insight' }, h('p', { class: 'today-insight-text is-quiet' }, reason)),
  ], { hero: true });
}

export function renderHome(): void {
  const now = Date.now();
  const attempts = getAttempts();
  const reviews = getReviews();
  const settings = getSettings();
  const goalMin = settings.dailyGoalMin || 15;
  const st = streakInfo(getActivity(), goalMin * 60000, now);
  const rec = recommendation(attempts, reviews, now, { enabledCategories: settings.enabledCategories });
  const plan = heroPlan(rec, {
    sessionLength: settings.sessionLength || 10,
    reviewSubtypes: dueReviews(reviews, now).map((r) => r.subtype),
    enabledCategories: settings.enabledCategories,
  });
  const fresh = attempts.length === 0;
  const gap = timeGap(attempts, rec.subtype);
  const stats = categoryStats(attempts);
  const daily = getDailyResults()[dayKey(now)];

  // „Weitere Modi“ als Bottom Sheet (E7): Tippen auf eine Zeile schließt das Sheet, der Link navigiert danach
  let sheet: SheetHandle | null = null;
  const modeRow = (label: string, sub: string, href: string): HTMLElement =>
    row({ label, sub, href, onClick: () => sheet?.close() });
  const openModes = (): void => {
    if (sheet) return;
    sheet = openSheet({
      title: t('home.moreModes'),
      children: [list([
        modeRow(t('home.chainTitle'), t('home.chainSub'), '#/chain'),
        modeRow(t('home.parallelTitle'), t('home.parallelSub'), '#/parallel'),
        modeRow(t('home.estimateTitle'), t('home.estimateSub'), '#/train/all?est=1'),
        modeRow(t('home.customTitle'), t('home.customSub'), '#/custom'),
      ])],
      onClose: () => { sheet = null; },
    });
  };
  addCleanup(() => sheet?.close());

  const moreRow = row({
    icon: 'link', label: t('home.moreModes'), sub: t('home.moreModesSub'), onClick: openModes, chevron: true,
    attrs: { 'aria-haspopup': 'dialog' },
  });

  // Ab 768 px umbrechen statt horizontal scrollen
  const catChips = chips(activeCategories(settings.enabledCategories).map((c) =>
    chip({ label: c.name, href: `#/train/${c.id}`, mastery: masteryOf(stats[c.id]?.score) })), { wrap: true });

  appendChildren(app, [
    largeTitle(t(GREETING[daypart(new Date(now).getHours())]), dateLine(now, locale())),
    hero(rec, plan, gap, fresh),
    statusLine({ todayMin: Math.floor(st.todayMs / 60000), goalMin, streak: st.current }),
    group(t('home.otherTitle'), list([
      row({
        icon: 'calendar', label: t('home.dailyChallenge'), href: '#/train/daily',
        value: daily ? `${daily.correct}/${daily.n}` : t('home.dailyOpen'), valueTone: daily ? 'muted' : 'accent',
      }),
      row({ icon: 'grid', label: t('home.allMixed'), href: '#/train/all' }),
      moreRow,
    ])),
    group(t('home.categories'), catChips),
  ]);

  setPrimaryAction({ label: t('home.ctaPractice'), meta: t('home.ctaMinutes', { n: plan.minutes }), href: plan.href });
}
