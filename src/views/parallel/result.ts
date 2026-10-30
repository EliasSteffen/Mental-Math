import type { ParallelChainResult, ParallelState } from '../../types.ts';
import { scoreParallel, updateParallelStats } from '../../core/parallel.ts';
import { fmt } from '../../core/numbers.ts';
import { getParallelStats, setParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { createFabBar } from '../../ui/fab.ts';
import { addCleanup, go } from '../../router.ts';
import { setTitle } from '../../ui/title.ts';
import { bindResultKeys } from '../../ui/modal.ts';
import { t } from '../../i18n/index.ts';

export interface ParallelSession {
  /** aufeinanderfolgende fehlerfreie Runden in diesem Besuch */
  streak: number;
}

/** '12 → + 7 = 19 → × 2 = 38' */
function historyLine(c: ParallelChainResult): string {
  const start = (c.history[0] ?? '').replace(/^Start\s*/, '');
  const parts = [start];
  for (let i = 1; i < c.history.length; i += 1) {
    parts.push(`${c.history[i] ?? ''} = ${fmt(c.totals[i] ?? 0)}`);
  }
  return parts.join(' → ');
}

export function renderResult(
  state: ParallelState,
  session: ParallelSession,
  onAgain: (nextStart: 2 | 3 | 4) => void,
): void {
  const result = scoreParallel(state);
  const before = getParallelStats();
  session.streak = result.allCorrect ? session.streak + 1 : 0;
  const stats = updateParallelStats(before, result, session.streak);
  setParallelStats(stats);
  const newBest = result.allCorrect && stats.bestChains > before.bestChains;

  const list = h('div', { class: 'pl-results' });
  for (const c of result.chains) {
    list.append(h('article', { class: `pl-res ${c.correct ? 'is-good' : 'is-bad'}` },
      h('div', { class: 'pl-res-head' },
        h('span', { class: 'pl-id' }, t('parallel.chain', { id: c.id })),
        h('span', { class: 'pl-verdict' }, c.correct ? t('parallel.verdictRight') : t('parallel.verdictWrong'))),
      h('div', { class: 'pl-res-nums' },
        h('span', null, t('parallel.expected', { n: fmt(c.expected) })),
        h('span', { class: 'muted' }, c.given === null ? t('parallel.noAnswer') : t('parallel.yourAnswer', { n: fmt(c.given) }))),
      h('div', { class: 'pl-history' }, historyLine(c))));
  }

  app.replaceChildren();
  appendChildren(app, [h('div', { class: 'parallel' },
    h('h1', { class: 'page-title' }, result.allCorrect ? t('parallel.allRight') : t('parallel.someRight', { correct: result.correct, total: result.total })),
    h('div', { class: 'pl-summary' },
      h('div', { class: 'big-num' }, `${fmt(result.points)}`),
      h('div', { class: 'label' }, t('common.points')),
      newBest ? h('div', { class: 'sub' }, t('parallel.newRecord', { n: stats.bestChains })) : null,
      session.streak > 1 ? h('div', { class: 'sub' }, t('parallel.streakRounds', { n: session.streak })) : null),
    list,
    h('p', { class: 'muted' }, t('parallel.nextRound', { n: stats.nextStart })))]);
  const fab = createFabBar([
    { label: t('common.again'), primary: true, onClick: () => { fab.destroy(); onAgain(stats.nextStart); } },
    { label: t('common.overview'), onClick: () => go('#/') },
  ]);
  addCleanup(fab.destroy);
  addCleanup(bindResultKeys(() => { fab.destroy(); onAgain(stats.nextStart); }, () => go('#/')));
  setTitle(t('common.roundDone'));
}
