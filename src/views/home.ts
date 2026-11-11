// Tab „Heute“: passt ohne Scrollen auf einen Bildschirm. Kopf (Begrüßung, Datum, Status), die Empfehlung als
// antippbare Karte mit „Jetzt üben“, darunter Kacheln (Daily, Gemischt, Kategorie, Weitere Modi und – solange offen –
// Einstufung). Auf dem Telefon liegen Kategorien und weitere Modi in Sheets, ab 720 px direkt auf der Seite.
// Daten synchron (E22), Logik in home-data.ts.
import { CATEGORIES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import { categoryStats } from '../core/scoring.ts';
import { dueReviews } from '../core/review.ts';
import { dayKey, recommendation } from '../core/progress.ts';
import { habitInfo } from '../core/habit.ts'; // v9 B
import { fmtSeconds } from '../core/numbers.ts';
import { getActivity, getAttempts, getDailyResults, getReviews, getSessions, getSettings } from '../data/storage.ts';
import { app, appendChildren, h } from '../ui/dom.ts';
import { icon, largeTitle, list, masteryMark, masteryOf, row, statusLine, type IconName } from '../ui/kit.ts';
import { openSheet, type SheetHandle } from '../ui/sheet.ts';
import { addCleanup, rerender } from '../router.ts';
import { challengeDay, dailyId } from '../core/challenge.ts';
import { accountEnabled, onAccountChange } from '../features/account.ts';
import { cachedResult, pendingAttempt, rankedAvailable } from '../features/challenge.ts';
import { locale, t } from '../i18n/index.ts';
import type { Recommendation } from '../types.ts';
import { dateLine, daypart, heroPlan, timeGap, type HeroPlan, type TimeGap } from './home-data.ts';

const GREETING = { morning: 'home.greetMorning', day: 'home.greetDay', evening: 'home.greetEvening' } as const;

/** Geschütztes Leerzeichen vor „·“: Bricht der Titel um, bleibt der Punkt am Ende der Zeile. */
const NBSP = String.fromCharCode(0xa0);

/** „Ziel {n}“ → Text mit hervorgehobener Zahl (wie die Status Line). */
function labelled(template: string, value: string): HTMLSpanElement {
  const [before = '', after = ''] = template.split('{n}');
  return h('span', null, before, h('span', { class: 'num today-strong' }, value), after);
}

/** Balken Ziel vs. Dein Schnitt: ganze Breite = dein Median, Füllung und Marke = Zielzeit (E9). */
function timeBar(gap: TimeGap): HTMLElement {
  const bar = h('span', { class: 'today-bar', 'aria-hidden': 'true' },
    h('span', { class: 'today-bar-lost' }),
    h('span', { class: 'today-bar-fill' }),
    h('span', { class: 'today-bar-mark' }));
  bar.style.setProperty('--w', String(Math.round((gap.targetMs / gap.medianMs) * 1000) / 10));
  return h('span', { class: 'today-insight' },
    h('span', { class: 'today-insight-text' }, t('home.slowest')),
    bar,
    h('span', { class: 'today-legend' },
      labelled(t('home.timeTarget'), fmtSeconds(gap.targetMs)),
      labelled(t('home.timeYours'), fmtSeconds(gap.medianMs))));
}

/**
 * Empfehlung als eine große, antippbare Karte (Link auf den Plan): Titel („Kategorie · Subtyp“), Ablauf, darunter der
 * Zeit-Balken (E9) oder der Grund, unten „Jetzt üben · ca. N min“. Beim Erststart begrüßt sie statt „Noch nie geübt“.
 * Nur <span> im Link (keine verschachtelten Bedienelemente).
 */
function hero(rec: Recommendation, plan: HeroPlan, gap: TimeGap | null, fresh: boolean): HTMLAnchorElement {
  const sub = rec.subtype ? SUBTYPES[rec.subtype] : undefined;
  const catName = sub ? CATEGORIES.find((c) => c.id === sub.category)?.name : undefined;
  // Geschützte Bindestriche: „2-stellig × 1-stellig“ bricht nicht mitten im Wort um
  const title = (sub && catName ? `${catName}${NBSP}· ${rec.title}` : rec.title).replace(/(\d)-/g, '$1\u2011');
  const planText = plan.kind === 'method' ? t('home.planMethod')
    : plan.kind === 'review' ? t('home.planReview')
    : t('home.planRound', { n: plan.tasks });
  const reason = fresh && rec.kind === 'new' ? t('home.firstReason') : rec.reason;
  return h('a', { class: 'card hero today-hero press', href: plan.href },
    h('span', { class: 'today-hero-head' },
      h('span', { class: 'today-hero-label' }, t('home.recLabel')),
      h('span', { class: 'today-hero-title' }, title),
      h('span', { class: 'today-hero-sub' }, planText)),
    gap ? timeBar(gap) : h('span', { class: 'today-insight' }, h('span', { class: 'today-insight-text is-quiet' }, reason)),
    h('span', { class: 'btn primary cta is-full today-hero-go' },
      icon('play', 20),
      h('span', { class: 'btn-label' }, t('home.ctaPractice')),
      h('span', { class: 'btn-meta' }, `· ${t('home.ctaMinutes', { n: plan.minutes })}`)));
}

interface TileOptions {
  icon?: IconName;
  /** Statt des Icons, z. B. der Meisterungs-Punkt einer Kategorie */
  mark?: HTMLElement;
  label: string;
  sub?: string;
  /** Zusatz rechts oben (Zustand, z. B. „offen“, „Platz 3/40“) */
  value?: string;
  accent?: boolean;
  href?: string;
  onClick?: () => void;
  /** Öffnet ein Sheet, dessen Inhalt ab 720 px ohnehin auf der Seite steht */
  phoneOnly?: boolean;
}

/** Kachel im Raster: Link oder Button mit Icon, Titel und kurzer Unterzeile. */
function tile(o: TileOptions): HTMLElement {
  const kids = [
    h('span', { class: 'tile-top' },
      h('span', { class: 'tile-icon' }, o.mark ?? (o.icon ? icon(o.icon, 22) : null)),
      o.value ? h('span', { class: `tile-value${o.accent ? ' is-accent' : ''}` }, o.value) : null),
    h('span', { class: 'tile-label' }, o.label),
    o.sub ? h('span', { class: 'tile-sub' }, o.sub) : null,
  ];
  const cls = `tile press${o.phoneOnly ? ' is-phone-only' : ''}`;
  if (o.href) return h('a', { class: cls, href: o.href, onclick: o.onClick ?? null }, ...kids);
  return h('button', { type: 'button', class: cls, 'aria-haspopup': 'dialog', onclick: () => o.onClick?.() }, ...kids);
}

/** Abschnitt der Startseite ab 720 px: Überschrift und Kachel-Raster. */
function tileSection(title: string, tiles: HTMLElement[]): HTMLElement {
  return h('section', { class: 'today-section' }, h('h2', { class: 'group-title' }, title), h('div', { class: 'today-grid' }, ...tiles));
}

export function renderHome(): void {
  const now = Date.now();
  const attempts = getAttempts();
  const reviews = getReviews();
  const settings = getSettings();
  const habit = habitInfo({ sessions: getSessions(), activity: getActivity(), goalRounds: settings.dailyGoalRounds, now }); // v9 B
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

  // Mit Konto ist die Daily gewertet (ein Versuch, Rangliste); ohne bleibt sie lokal und ungewertet
  const ranked = rankedAvailable();
  const rankedId = dailyId(challengeDay(now));
  const rankedRes = ranked ? cachedResult(rankedId) : null;
  const dailyTile = ranked
    ? tile({
      icon: 'calendar', label: t('home.dailyChallenge'), sub: t('home.dailyRankedShort'), href: `#/challenge/${rankedId}`,
      value: rankedRes
        ? (rankedRes.rank !== null ? t('compete.rankShort', { rank: rankedRes.rank, total: rankedRes.total }) : `${rankedRes.correct}/${rankedRes.n}`)
        : pendingAttempt()?.id === rankedId ? t('compete.stateRunning') : t('home.dailyOpen'),
      accent: !rankedRes,
    })
    : tile({
      icon: 'calendar', label: t('home.dailyChallenge'), sub: t('home.dailySub'), href: '#/train/daily',
      value: daily ? `${daily.correct}/${daily.n}` : t('home.dailyOpen'), accent: !daily,
    });
  // Anmeldung kommt beim Start oft erst nach dem ersten Bild: dann die Daily-Kachel umstellen
  if (accountEnabled()) addCleanup(onAccountChange(() => rerender({ keepScroll: true })));

  // Sheets: Weitere Modi (E7) und Kategorien; Tippen auf eine Zeile schließt das Sheet, der Link navigiert danach
  let sheet: SheetHandle | null = null;
  const close = (): void => sheet?.close();
  const open = (title: string, rows: HTMLElement[]): void => {
    if (sheet) return;
    sheet = openSheet({ title, children: [list(rows)], onClose: () => { sheet = null; } });
  };
  addCleanup(close);
  const modeRow = (label: string, sub: string, href: string): HTMLElement => row({ label, sub, href, onClick: close });
  const openModes = (): void => open(t('home.moreModes'), [
    modeRow(t('home.chainTitle'), t('home.chainSub'), '#/chain'),
    modeRow(t('home.parallelTitle'), t('home.parallelSub'), '#/parallel'),
    modeRow(t('home.estimateTitle'), t('home.estimateSub'), '#/train/all?est=1'),
    modeRow(t('home.customTitle'), t('home.customSub'), '#/custom'),
  ]);
  const openCategories = (): void => open(t('home.categories'), activeCategories(settings.enabledCategories).map((c) => row({
    leading: masteryMark(masteryOf(stats[c.id]?.score)), label: c.name, href: `#/train/${c.id}`, onClick: close,
  })));

  // Noch keine Einstufung (neu dabei, „Auto“): kurzer Test, der die Startstufe findet
  const needsPlacement = !settings.placement && settings.difficulty === 'auto' && attempts.length < 100;
  const tiles: HTMLElement[] = [
    needsPlacement ? tile({ icon: 'target', label: t('home.placementTitle'), sub: t('home.placementSub'), value: t('home.placementValue'), accent: true, href: '#/einstufung' }) : null,
    dailyTile,
    tile({ icon: 'grid', label: t('home.mixedShort'), sub: t('home.mixedSub'), href: '#/train/all' }),
    tile({ icon: 'plus-minus', label: t('home.categories'), sub: t('home.categoriesSub'), onClick: openCategories, phoneOnly: true }),
    tile({ icon: 'link', label: t('home.moreModes'), sub: t('home.moreModesShort'), onClick: openModes, phoneOnly: true }),
  ].filter((x): x is HTMLElement => x !== null);

  // Ab 720 px stehen Kategorien und Modi direkt auf der Seite; auf dem Telefon blendet CSS den Block aus
  const more = h('div', { class: 'today-more' },
    tileSection(t('home.categories'), activeCategories(settings.enabledCategories).map((c) => tile({
      mark: masteryMark(masteryOf(stats[c.id]?.score)), label: c.name,
      sub: t('lernen.skill', { n: stats[c.id]?.score ?? '–' }), href: `#/train/${c.id}`,
    }))),
    tileSection(t('home.moreModes'), [
      tile({ icon: 'link', label: t('home.chainTitle'), sub: t('home.chainSub'), href: '#/chain' }),
      tile({ icon: 'bars', label: t('home.parallelTitle'), sub: t('home.parallelSub'), href: '#/parallel' }),
      tile({ icon: 'target', label: t('home.estimateTitle'), sub: t('home.estimateSub'), href: '#/train/all?est=1' }),
      tile({ icon: 'gear', label: t('home.customTitle'), sub: t('home.customSub'), href: '#/custom' }),
    ]));

  // Seite passt auf einen Bildschirm (CSS: .screen.is-today, ohne Scrollen auf dem Telefon)
  app.classList.add('is-today');
  document.body.classList.add('is-today');
  addCleanup(() => { app.classList.remove('is-today'); document.body.classList.remove('is-today'); });

  appendChildren(app, [
    h('div', { class: 'today-head' },
      largeTitle(t(GREETING[daypart(new Date(now).getHours())]), dateLine(now, locale())),
      statusLine({ todayRounds: habit.todayRounds, goalRounds: habit.goalRounds, streak: habit.streak, freezes: habit.freezes, startHint: true })),
    h('div', { class: 'today-main' },
      hero(rec, plan, gap, fresh),
      h('nav', { class: `today-tiles${tiles.length % 2 ? ' is-odd' : ''}`, 'aria-label': t('home.otherTitle') }, ...tiles)),
    more,
  ]);
}
