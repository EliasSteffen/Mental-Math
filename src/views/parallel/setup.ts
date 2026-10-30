import type { Level, ParallelConfig } from '../../types.ts';
import { getParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { t } from '../../i18n/index.ts';

const LEVELS: readonly Level[] = [1, 2, 3];
const TEMPOS: readonly number[] = [3000, 4000, 5000];
const DURATIONS: readonly number[] = [45000, 60000, 90000];
const CHAIN_COUNTS: ReadonlyArray<readonly [2 | 3 | 4, string]> = [[2, '2'], [3, '3'], [4, '4']];

const LEVEL_HINT: Record<Level, 'parallel.hint1' | 'parallel.hint2' | 'parallel.hint3'> = {
  1: 'parallel.hint1',
  2: 'parallel.hint2',
  3: 'parallel.hint3',
};

function segmented<V extends string | number>(
  label: string, options: ReadonlyArray<readonly [V, string]>, current: V, onPick: (v: V) => void,
): HTMLDivElement {
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const active = value === current;
    seg.append(h('button', {
      type: 'button', class: active ? 'active' : null, 'aria-pressed': String(active), onclick: () => onPick(value),
    }, text));
  }
  return seg;
}

export interface SetupOptions {
  config: ParallelConfig;
  onStart: (config: ParallelConfig) => void;
}

export function renderSetup({ config, onStart }: SetupOptions): void {
  let draft: ParallelConfig = { ...config };
  const stats = getParallelStats();

  const draw = (): void => {
    app.replaceChildren();
    const suggested = draft.startChains === stats.nextStart;
    appendChildren(app, [h('div', { class: 'parallel' },
      h('a', { class: 'back-link', href: '#/' }, t('common.backLink')),
      h('h1', { class: 'page-title' }, t('parallel.title')),
      h('p', { class: 'muted' },
        t('parallel.intro')),
      h('div', { class: 'stack' },
        h('div', { class: 'label' }, t('common.level')),
        segmented<Level>(t('common.level'), LEVELS.map((l) => [l, t('common.levelN', { n: l })] as const), draft.level, (v) => { draft = { ...draft, level: v }; draw(); }),
        h('div', { class: 'small muted' }, t(LEVEL_HINT[draft.level])),
        h('div', { class: 'label' }, t('parallel.tempoLabel')),
        segmented<number>(t('parallel.tempo'), TEMPOS.map((v) => [v, t('common.sec', { n: v / 1000 })] as const), draft.intervalMs, (v) => { draft = { ...draft, intervalMs: v }; draw(); }),
        h('div', { class: 'label' }, t('parallel.duration')),
        segmented<number>(t('parallel.duration'), DURATIONS.map((v) => [v, t('common.sec', { n: v / 1000 })] as const), draft.durationMs, (v) => { draft = { ...draft, durationMs: v }; draw(); }),
        h('div', { class: 'label' }, t('parallel.startChains')),
        segmented<2 | 3 | 4>(t('parallel.startChains'), CHAIN_COUNTS, draft.startChains, (v) => { draft = { ...draft, startChains: v }; draw(); }),
        h('div', { class: 'small muted' },
          suggested ? t('parallel.suggested', { n: stats.nextStart }) : t('parallel.suggestedAlt', { n: stats.nextStart }))),
      h('p', { class: 'small muted' },
        stats.rounds === 0
          ? t('parallel.noRounds')
          : t('parallel.bestStats', { best: stats.bestChains, streak: stats.bestCorrectStreak, rounds: stats.rounds })),
      h('button', { type: 'button', class: 'btn primary', onclick: () => onStart(draft) }, t('common.start')))]);
  };
  draw();
}
