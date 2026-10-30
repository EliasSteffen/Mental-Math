import { h } from './dom.ts';

export type SkeletonKind = 'tiles' | 'list' | 'chart' | 'cards' | 'text';

function bone(cls: string): HTMLElement {
  return h('div', { class: `sk ${cls}` });
}

/** Pulsierende Platzhalter im Layout der echten Komponenten. */
export function skeleton(kind: SkeletonKind, count?: number): HTMLElement {
  const root = h('div', { class: `skeleton sk-${kind}`, 'aria-hidden': 'true' });
  const n = Math.max(1, count ?? (kind === 'tiles' ? 4 : kind === 'cards' ? 3 : kind === 'list' ? 4 : kind === 'text' ? 3 : 1));
  for (let i = 0; i < n; i += 1) {
    if (kind === 'tiles') root.append(h('div', { class: 'sk-tile' }, bone('sk-line sk-short'), bone('sk-line sk-big'), bone('sk-line sk-mid')));
    else if (kind === 'list') root.append(h('div', { class: 'sk-row' }, bone('sk-dot'), h('div', { class: 'sk-col' }, bone('sk-line'), bone('sk-line sk-short'))));
    else if (kind === 'chart') root.append(bone('sk-chart'));
    else if (kind === 'cards') root.append(h('div', { class: 'sk-card' }, bone('sk-dot'), bone('sk-line sk-grow'), bone('sk-line sk-chip')));
    else root.append(bone(i === n - 1 ? 'sk-line sk-mid' : 'sk-line'));
  }
  return root;
}

/** Zeigt den Placeholder und ersetzt ihn im übernächsten Frame durch den echten Inhalt. */
export function deferRender(placeholder: HTMLElement, render: () => Node): void {
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void): number => window.setTimeout(fn, 16);
  raf(() => raf(() => {
    if (!placeholder.isConnected) return; // Route inzwischen gewechselt
    placeholder.replaceWith(render());
  }));
}
