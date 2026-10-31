// Parallel · Einstellungen (Fokus-Modus): Level, Tempo, Dauer und Start-Ketten als Segmente, Start im Dock.
import type { Level, ParallelConfig } from '../../types.ts';
import { getParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { button, card, focusHead, group, icon, kpis, list, segmented } from '../../ui/kit.ts';
import { playDock } from '../play-ui.ts';
import { t } from '../../i18n/index.ts';

type LevelKey = `${Level}`;
type Chains = '2' | '3' | '4';
const LEVELS: readonly LevelKey[] = ['1', '2', '3'];
const TEMPOS: readonly number[] = [3000, 4000, 5000];
const DURATIONS: readonly number[] = [45000, 60000, 90000];
const CHAIN_COUNTS: readonly Chains[] = ['2', '3', '4'];

const LEVEL_HINT: Record<Level, 'parallel.hint1' | 'parallel.hint2' | 'parallel.hint3'> = {
  1: 'parallel.hint1',
  2: 'parallel.hint2',
  3: 'parallel.hint3',
};

const seconds = (ms: number): readonly [string, string] => [String(ms), t('common.sec', { n: ms / 1000 })] as const;

export interface SetupOptions {
  config: ParallelConfig;
  onStart: (config: ParallelConfig) => void;
}

export function renderSetup({ config, onStart }: SetupOptions): void {
  let draft: ParallelConfig = { ...config };
  const stats = getParallelStats();
  const suggestion = (): string => draft.startChains === stats.nextStart
    ? t('parallel.suggested', { n: stats.nextStart })
    : t('parallel.suggestedAlt', { n: stats.nextStart });

  const levelSeg = segmented<LevelKey>({
    label: t('common.level'), help: t(LEVEL_HINT[draft.level]),
    options: LEVELS.map((l) => [l, t('common.levelN', { n: l })] as const),
    value: String(draft.level) as LevelKey,
    onChange: (v) => {
      draft = { ...draft, level: Number(v) as Level };
      levelSeg.setHelp(t(LEVEL_HINT[draft.level]));
    },
  });
  const tempoSeg = segmented<string>({
    label: t('parallel.tempo'), help: t('parallel.tempoHelp'),
    options: TEMPOS.map(seconds), value: String(draft.intervalMs),
    onChange: (v) => { draft = { ...draft, intervalMs: Number(v) }; },
  });
  const durationSeg = segmented<string>({
    label: t('parallel.duration'), inline: true, numeric: true,
    options: DURATIONS.map(seconds), value: String(draft.durationMs),
    onChange: (v) => { draft = { ...draft, durationMs: Number(v) }; },
  });
  const chainsSeg = segmented<Chains>({
    label: t('parallel.startChains'), help: suggestion(),
    options: CHAIN_COUNTS.map((n) => [n, n] as const), value: String(draft.startChains) as Chains,
    onChange: (v) => {
      draft = { ...draft, startChains: Number(v) as 2 | 3 | 4 };
      chainsSeg.setHelp(suggestion());
    },
  });

  const record = stats.rounds === 0
    ? h('p', { class: 'play-note' }, icon('trophy', 18), h('span', null, t('parallel.noRounds')))
    : group(t('parallel.statsTitle'), card([kpis([
      { label: t('parallel.statBest'), value: String(stats.bestChains) },
      { label: t('parallel.statStreak'), value: String(stats.bestCorrectStreak) },
      { label: t('parallel.statRounds'), value: String(stats.rounds) },
    ])]));

  app.replaceChildren();
  appendChildren(app, [
    focusHead({ title: t('parallel.title'), shortTitle: t('parallel.titleShort') }),
    h('div', { class: 'stage is-start' },
      h('p', { class: 'play-intro' }, t('parallel.intro')),
      list([levelSeg.el, tempoSeg.el, durationSeg.el, chainsSeg.el]),
      record),
    playDock(button({ label: t('common.start'), kind: 'primary', full: true, onClick: () => onStart(draft) })),
  ]);
}
