import type { ParallelChainResult, ParallelState } from '../../types.ts';
import { scoreParallel, updateParallelStats } from '../../core/parallel.ts';
import { fmt } from '../../core/numbers.ts';
import { getParallelStats, setParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';

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
        h('span', { class: 'pl-id' }, `Kette ${c.id}`),
        h('span', { class: 'pl-verdict' }, c.correct ? '✓ richtig' : '✗ falsch')),
      h('div', { class: 'pl-res-nums' },
        h('span', null, `Erwartet ${fmt(c.expected)}`),
        h('span', { class: 'muted' }, c.given === null ? 'Keine Antwort' : `Deine Antwort ${fmt(c.given)}`)),
      h('div', { class: 'pl-history' }, historyLine(c))));
  }

  app.replaceChildren();
  appendChildren(app, [h('div', { class: 'parallel' },
    h('h1', { class: 'page-title' }, result.allCorrect ? 'Alles richtig!' : `${result.correct} von ${result.total} richtig`),
    h('div', { class: 'pl-summary' },
      h('div', { class: 'big-num' }, `${fmt(result.points)}`),
      h('div', { class: 'label' }, 'Punkte'),
      newBest ? h('div', { class: 'sub' }, `Neuer Rekord: ${stats.bestChains} Ketten fehlerfrei`) : null,
      session.streak > 1 ? h('div', { class: 'sub' }, `${session.streak} fehlerfreie Runden in Folge`) : null),
    list,
    h('p', { class: 'muted' }, `Nächste Runde: ${stats.nextStart} Ketten`),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => onAgain(stats.nextStart) }, 'Nochmal'),
      h('a', { class: 'btn', href: '#/' }, 'Übersicht')))]);
}
