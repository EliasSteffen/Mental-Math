// Tab „Heute“: passt ohne Scrollen auf einen Bildschirm. Kopf (Begrüßung, Datum, Status), die Empfehlung als
// antippbare Karte mit „Jetzt üben“ (neue Nutzer: Einstufungstest), darunter sechs Kacheln (Daily, Quests, Mini-Case,
// Gemischt, Kategorien, Weitere Modi). Auf dem Telefon liegen Kategorien und weitere Modi in Sheets, ab 720 px direkt auf der Seite.
// Daten synchron (E22), Logik in home-data.ts.
import { CATEGORIES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import { categoryStats } from '../core/scoring.ts';
import { dueReviews } from '../core/review.ts';
import { dayKey, recommendation } from '../core/progress.ts';
import { currentHabit } from '../features/habit.ts'; // v9 B, v10
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
import {
  dateLine, daypart, goalDots, heroExample, heroKind, heroPlan, modeRows, PHONE_TILES, showsPlacementRow, timeGap,
  type HeroExample, type HeroPlan, type ModeRow, type PhoneTile, type TimeGap,
} from './home-data.ts';
import { levelFor } from '../core/scoring.ts'; // v9 H
import { currentGoals } from '../features/goals.ts'; // v10 F
import { nextGoalLine } from '../ui/goals.ts'; // v10 F
import { questsView } from '../features/quests.ts'; // v10 Q
import { comebackCard } from './comeback-card.ts'; // v10 C

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

/** v9 H: Beispielaufgabe in großen Zahlen oder Typnamen der Runde; füllt die Leerfläche der Karte. */
function exampleBlock(ex: HeroExample | null): HTMLElement | null {
  if (!ex) return null;
  return h('span', { class: 'today-example' },
    h('span', { class: 'today-example-label' }, ex.kind === 'task' ? t('home.exampleLabel') : t('home.exampleNames')),
    ex.kind === 'task'
      ? h('span', { class: 'today-example-task num' }, ex.prompt)
      : h('span', { class: 'today-example-names' }, ...ex.names.map((n) => h('span', { class: 'today-example-name' }, n))));
}

/** v9 H: Tagesziel als Punkte (●●○), Beschriftung für Screenreader. */
function goalDotsEl(dots: { filled: number; total: number }, done: number, goal: number): HTMLElement {
  return h('span', {
    class: 'today-goal', role: 'img', 'aria-label': t(goal === 1 ? 'home.goalDotsAriaOne' : 'home.goalDotsAria', { done, goal }),
  }, ...Array.from({ length: dots.total }, (_, i) => h('span', { class: `today-goal-dot${i < dots.filled ? ' is-on' : ''}`, 'aria-hidden': 'true' })));
}

/**
 * Empfehlung als eine große, antippbare Karte (Link auf den Plan): Titel („Kategorie · Subtyp“), Ablauf, darunter der
 * Zeit-Balken (E9) oder der Grund, unten „Jetzt üben · ca. N min“. Beim Erststart begrüßt sie statt „Noch nie geübt“.
 * Nur <span> im Link (keine verschachtelten Bedienelemente).
 */
function hero(rec: Recommendation, plan: HeroPlan, gap: TimeGap | null, fresh: boolean, example: HTMLElement | null, goal: HTMLElement): HTMLAnchorElement {
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
      h('span', { class: 'today-hero-top' }, h('span', { class: 'today-hero-label' }, t('home.recLabel')), goal), // v9 H
      h('span', { class: 'today-hero-title' }, title),
      h('span', { class: 'today-hero-sub' }, planText)),
    example, // v9 H
    gap ? timeBar(gap) : h('span', { class: 'today-insight' }, h('span', { class: 'today-insight-text is-quiet' }, reason)),
    h('span', { class: 'btn primary cta is-full today-hero-go' },
      icon('play', 20),
      h('span', { class: 'btn-label' }, t('home.ctaPractice')),
      h('span', { class: 'btn-meta' }, `· ${t('home.ctaMinutes', { n: plan.minutes })}`)));
}

/**
 * Hero für neue Nutzer (H): der Einstufungstest statt einer Trainingsempfehlung. Kein Zeit-Balken, keine Beispielaufgabe;
 * der Grund steht unter dem Titel, der Knopf führt zum Test.
 */
function placementHero(): HTMLAnchorElement {
  return h('a', { class: 'card hero today-hero press', href: '#/einstufung' },
    h('span', { class: 'today-hero-head' },
      h('span', { class: 'today-hero-top' }, h('span', { class: 'today-hero-label' }, t('home.recLabel'))),
      h('span', { class: 'today-hero-title' }, t('home.placementTitle'))),
    h('span', { class: 'today-insight' }, h('span', { class: 'today-insight-text is-quiet' }, t('home.placementReason'))),
    h('span', { class: 'btn primary cta is-full today-hero-go' },
      icon('play', 20),
      h('span', { class: 'btn-label' }, t('home.placementCta')),
      h('span', { class: 'btn-meta' }, `· ${t('home.placementValue')}`)));
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
  const habit = currentHabit(now); // v9 B, v10: mit gekauften Freezes und Reparaturen
  const rec = recommendation(attempts, reviews, now, { enabledCategories: settings.enabledCategories });
  const plan = heroPlan(rec, {
    sessionLength: settings.sessionLength || 10,
    reviewSubtypes: dueReviews(reviews, now).map((r) => r.subtype),
    enabledCategories: settings.enabledCategories,
  });
  const fresh = attempts.length === 0;
  // v9 H: tagesstabiles Beispiel und Tagesziel-Punkte
  const example = exampleBlock(
    heroExample(rec, {
      dayKey: dayKey(now), level: rec.subtype ? levelFor(rec.subtype, attempts, settings.difficulty) : 2,
      reviewSubtypes: dueReviews(reviews, now).map((r) => r.subtype), enabledCategories: settings.enabledCategories,
    }));
  const goal = goalDotsEl(goalDots(habit.todayRounds, habit.goalRounds), habit.todayRounds, habit.goalRounds);
  const gap = timeGap(attempts, rec.subtype);
  const nextGoal = currentGoals(1, now)[0] ?? null; // v10 F
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
  // v10 Q: Quests des Tages (3) und Wochenstand
  const qv = questsView(now);
  const questTile = tile({
    icon: 'star', label: t('quests.tileLabel'), href: '#/quests',
    sub: qv.doneToday >= 3 ? t('quests.tileSubDone') : t('quests.tileSub', { n: qv.stars }),
    value: qv.ready ? t('quests.chestReady') : t('quests.tileValue', { done: qv.doneToday }),
    accent: qv.ready > 0 || qv.doneToday < 3,
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
  const modeEntries: Record<ModeRow, () => HTMLElement> = {
    placement: () => modeRow(t('home.placementTitle'), t('home.placementSub'), '#/einstufung'),
    chain: () => modeRow(t('home.chainTitle'), t('home.chainSub'), '#/chain'),
    parallel: () => modeRow(t('home.parallelTitle'), t('home.parallelSub'), '#/parallel'),
    estimate: () => modeRow(t('home.estimateTitle'), t('home.estimateSub'), '#/train/all?est=1'),
    custom: () => modeRow(t('home.customTitle'), t('home.customSub'), '#/custom'),
    race: () => modeRow(t('race.title'), t('race.homeSub'), '#/rennen'), // v12 R1
  };
  const openModes = (): void => open(t('home.moreModes'), modeRows({ placementRow }).map((id) => modeEntries[id]()));
  const openCategories = (): void => open(t('home.categories'), activeCategories(settings.enabledCategories).map((c) => row({
    leading: masteryMark(masteryOf(stats[c.id]?.score)), label: c.name, href: `#/train/${c.id}`, onClick: close,
  })));

  // v11 H: Einstufungstest – neue Nutzer als Hero, sonst als Zeile oben im Sheet „Weitere Modi“ (solange kein Test)
  const placementState = { placement: !!settings.placement, difficulty: settings.difficulty, attempts: attempts.length };
  const placementHeroShown = heroKind(placementState) === 'placement';
  const placementRow = showsPlacementRow(placementState);
  const phoneTiles: Record<PhoneTile, HTMLElement> = {
    daily: dailyTile,
    quests: questTile, // v10 Q
    case: tile({ icon: 'target', label: t('home.caseTitle'), sub: t('home.caseSub'), href: '#/case' }), // v11 H
    mixed: tile({ icon: 'grid', label: t('home.mixedShort'), sub: t('home.mixedSub'), href: '#/train/all' }),
    categories: tile({ icon: 'plus-minus', label: t('home.categories'), sub: t('home.categoriesSub'), onClick: openCategories, phoneOnly: true }),
    modes: tile({ icon: 'link', label: t('home.moreModes'), sub: t('home.moreModesShort'), onClick: openModes, phoneOnly: true }),
  };
  const tiles: HTMLElement[] = PHONE_TILES.map((id) => phoneTiles[id]);

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
      tile({ icon: 'rocket', label: t('race.title'), sub: t('race.homeSub'), href: '#/rennen' }), // v12 R1
    ]));

  // Seite passt auf einen Bildschirm (CSS: .screen.is-today, ohne Scrollen auf dem Telefon)
  app.classList.add('is-today');
  document.body.classList.add('is-today');
  // v10 C: Comeback-/Reparatur-Karte über der Empfehlung; mit Karte darf Heute scrollen
  const comeback = comebackCard(now, plan.href, habit.todayRounds);
  if (comeback) { app.classList.add('has-comeback'); document.body.classList.add('has-comeback'); }
  addCleanup(() => {
    app.classList.remove('is-today', 'has-comeback'); document.body.classList.remove('is-today', 'has-comeback');
  });

  appendChildren(app, [
    h('div', { class: 'today-head' },
      largeTitle(t(GREETING[daypart(new Date(now).getHours())]), dateLine(now, locale())),
      // v10 F: Status und „Nächstes Ziel“ in einem Block (am breiten Layout nebeneinander)
      h('div', { class: 'today-head-meta' },
        statusLine({ todayRounds: habit.todayRounds, goalRounds: habit.goalRounds, streak: habit.streak, freezes: habit.freezes, startHint: true }),
        nextGoal ? nextGoalLine(nextGoal) : null)),
    h('div', { class: 'today-main' },
      comeback,
      placementHeroShown ? placementHero() : hero(rec, plan, gap, fresh, example, goal),
      h('nav', { class: `today-tiles${tiles.length % 2 ? ' is-odd' : ''}`, 'aria-label': t('home.otherTitle') }, ...tiles)),
    more,
  ]);
}
