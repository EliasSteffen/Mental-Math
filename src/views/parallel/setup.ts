import type { Level, ParallelConfig } from '../../types.ts';
import { getParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';

const LEVELS: ReadonlyArray<readonly [Level, string]> = [[1, 'Level 1'], [2, 'Level 2'], [3, 'Level 3']];
const TEMPOS: ReadonlyArray<readonly [number, string]> = [[3000, '3 s'], [4000, '4 s'], [5000, '5 s']];
const DURATIONS: ReadonlyArray<readonly [number, string]> = [[45000, '45 s'], [60000, '60 s'], [90000, '90 s']];
const CHAIN_COUNTS: ReadonlyArray<readonly [2 | 3 | 4, string]> = [[2, '2'], [3, '3'], [4, '4']];

const LEVEL_HINT: Record<Level, string> = {
  1: 'Plus und Minus',
  2: 'Plus, Minus und Mal',
  3: 'Plus, Minus, Mal und Geteilt',
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
      h('a', { class: 'back-link', href: '#/' }, '← Zurück'),
      h('h1', { class: 'page-title' }, 'Paralleles Kettenrechnen'),
      h('p', { class: 'muted' },
        'Mehrere Ketten laufen gleichzeitig. Immer wenn eine Karte aufleuchtet, rechnest du die Operation im Kopf auf diese Kette. Zwischensummen werden nie angezeigt.'),
      h('div', { class: 'stack' },
        h('div', { class: 'label' }, 'Level'),
        segmented<Level>('Level', LEVELS, draft.level, (v) => { draft = { ...draft, level: v }; draw(); }),
        h('div', { class: 'small muted' }, LEVEL_HINT[draft.level]),
        h('div', { class: 'label' }, 'Tempo (Abstand zwischen Rechenschritten)'),
        segmented<number>('Tempo', TEMPOS, draft.intervalMs, (v) => { draft = { ...draft, intervalMs: v }; draw(); }),
        h('div', { class: 'label' }, 'Dauer'),
        segmented<number>('Dauer', DURATIONS, draft.durationMs, (v) => { draft = { ...draft, durationMs: v }; draw(); }),
        h('div', { class: 'label' }, 'Start-Ketten'),
        segmented<2 | 3 | 4>('Start-Ketten', CHAIN_COUNTS, draft.startChains, (v) => { draft = { ...draft, startChains: v }; draw(); }),
        h('div', { class: 'small muted' },
          suggested ? `Vorschlag: ${stats.nextStart} Ketten (passt sich deinem Können an)` : `Vorschlag wäre ${stats.nextStart} Ketten`)),
      h('p', { class: 'small muted' },
        stats.rounds === 0
          ? 'Noch keine Runde gespielt.'
          : `Bestwert: ${stats.bestChains} Ketten fehlerfrei · längste Serie ${stats.bestCorrectStreak} · ${stats.rounds} Runden`),
      h('button', { type: 'button', class: 'btn primary', onclick: () => onStart(draft) }, 'Start'))]);
  };
  draw();
}
