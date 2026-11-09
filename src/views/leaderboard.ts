// Rangliste (#/rangliste): Tag (Daily, blätterbar) oder Woche (Summe Mo–So), bzw. ein Wettbewerb (?id=comp-…);
// optional nur eine Gruppe (?group=). Namen nur mit Zustimmung, sonst „Anonym“; die eigene Zeile steht immer da.
import { addDays, challengeDay, dailyId, dayOfDailyId, isChallengeId, isDay, weekStart } from '../core/challenge.ts';
import type { GroupInfo, Leaderboard, LeaderboardEntry } from '../core/challenge.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { loadBoard, loadChallenge, loadGroups, loadWeek, rankedAvailable } from '../features/challenge.ts';
import { t } from '../i18n/index.ts';
import { addCleanup, go } from '../router.ts';
import { app, h } from '../ui/dom.ts';
import { button, chip, chips, group, largeTitle, list, row, segmented } from '../ui/kit.ts';
import { setTitle } from '../ui/title.ts';
import { challengeTitle, dayLabel, errorText, notice, participantsText } from './compete-ui.ts';

export interface BoardRoute { id: string | null; week: boolean; group: string | null }

export function parseBoardQuery(q: URLSearchParams): BoardRoute {
  const id = q.get('id');
  const g = q.get('group');
  return {
    id: isChallengeId(id) ? id : null,
    week: q.get('tab') === 'week',
    group: g && /^[0-9a-f-]{36}$/i.test(g) ? g : null,
  };
}

function hrefOf(r: BoardRoute): string {
  const q = new URLSearchParams();
  if (r.id) q.set('id', r.id);
  if (r.week) q.set('tab', 'week');
  if (r.group) q.set('group', r.group);
  const s = q.toString();
  return `#/rangliste${s ? `?${s}` : ''}`;
}

function entryRow(e: LeaderboardEntry, week: boolean): HTMLElement {
  const sub = week
    ? t('compete.weekSub', { days: e.days ?? 1, time: fmtSeconds(e.timeMs) })
    : t('compete.entrySub', { correct: e.correct, time: fmtSeconds(e.timeMs) });
  return row({
    leading: h('span', { class: 'compete-rank-no num', 'aria-label': t('compete.rankAria', { rank: e.rank }) }, String(e.rank)),
    label: e.name || t('compete.anonymous'),
    sub: e.me ? `${t('compete.you')} · ${sub}` : sub,
    value: t('common.pointsValue', { n: fmt(e.points) }),
    class: e.me ? 'is-me' : undefined,
  });
}

function boardList(b: Leaderboard, week: boolean): HTMLElement {
  if (b.total === 0) return notice(t('compete.emptyBoard'));
  const rows: Array<HTMLElement | null> = b.top.map((e) => entryRow(e, week));
  if (b.me && !b.top.some((e) => e.me)) {
    rows.push(h('div', { class: 'compete-gap', 'aria-hidden': 'true' }, '···'), entryRow(b.me, week));
  }
  return list(rows);
}

export function renderLeaderboard(route: BoardRoute): void {
  let alive = true;
  addCleanup(() => { alive = false; });
  const today = challengeDay(Date.now());
  const id = route.id ?? dailyId(today);
  const day = dayOfDailyId(id);
  const isDaily = day !== null;
  const week = isDaily && route.week;
  setTitle(t('compete.boardTitle'));

  const body = h('div', { class: 'compete-board' }, notice(t('compete.loading')));
  const head = largeTitle(t('compete.boardTitle'));
  const back = button({ label: t('compete.backToHub'), kind: 'link', icon: 'chevron-left', href: '#/wettbewerbe' });

  const tabs = isDaily
    ? segmented<'day' | 'week'>({
      label: t('compete.boardScope'), hideLabel: true, options: [['day', t('compete.scopeDay')], ['week', t('compete.scopeWeek')]],
      value: week ? 'week' : 'day', onChange: (v) => go(hrefOf({ ...route, id, week: v === 'week' })),
    }).el
    : null;

  // Blättern: Tag ± 1 bzw. Woche ± 7, nie in die Zukunft
  let nav: HTMLElement | null = null;
  if (isDaily && day && isDay(day)) {
    const step = week ? 7 : 1;
    const prev = dailyId(addDays(day, -step));
    const nextDay = addDays(day, step);
    const canNext = (week ? weekStart(nextDay) : nextDay) <= today;
    const label = week ? t('compete.weekOf', { date: dayLabel(weekStart(day)) }) : dayLabel(day);
    nav = h('div', { class: 'compete-nav' },
      button({ label: t('compete.prev'), kind: 'quiet', icon: 'chevron-left', href: hrefOf({ ...route, id: prev, week }) }),
      h('p', { class: 'compete-nav-label' }, day === today && !week ? t('compete.today') : label),
      canNext
        ? button({ label: t('compete.next'), kind: 'quiet', href: hrefOf({ ...route, id: dailyId(nextDay > today ? today : nextDay), week }) })
        : h('span', { class: 'compete-nav-spacer' }));
  }

  const groupsSlot = h('div', { class: 'compete-groups' });
  app.replaceChildren(back, head, tabs ?? '', nav ?? '', groupsSlot, body,
    h('p', { class: 'compete-foot' }, t('compete.boardFoot')));

  if (rankedAvailable()) {
    void loadGroups().then((gs: GroupInfo[]) => {
      if (!alive || gs.length === 0) return;
      groupsSlot.replaceChildren(chips([
        chip({ label: t('compete.everyone'), onClick: () => go(hrefOf({ ...route, id, week, group: null })) }),
        ...gs.map((g) => chip({ label: g.name, onClick: () => go(hrefOf({ ...route, id, week, group: g.id })) })),
      ], { wrap: true }));
      const active = route.group ? gs.findIndex((g) => g.id === route.group) + 1 : 0;
      groupsSlot.querySelectorAll('.chip').forEach((el, i) => { if (i === active) el.setAttribute('aria-current', 'true'); });
      const g = gs.find((x) => x.id === route.group);
      if (g) head.replaceWith(largeTitle(t('compete.boardTitle'), g.name));
    }, () => undefined);
  }

  const load = week && day ? loadWeek(day, route.group) : loadBoard(id, route.group);
  void load.then(async (b) => {
    if (!alive) return;
    if (!isDaily) {
      try {
        const c = await loadChallenge(id);
        if (alive) head.replaceWith(largeTitle(challengeTitle(c), participantsText(b.total)));
      } catch { /* Titel bleibt allgemein */ }
    }
    body.replaceChildren(
      group({ title: participantsText(b.total) }, boardList(b, week)));
  }, (e: unknown) => {
    if (alive) body.replaceChildren(notice(errorText(e)));
  });
}
